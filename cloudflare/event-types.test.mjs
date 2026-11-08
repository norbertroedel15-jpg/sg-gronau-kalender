import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'

test('Eigene Terminarten: Migration erhält Bestandsdaten, Rechte, Namen, Farben, Ausblenden und Konflikte', async () => {
  const dir=await mkdtemp(join(tmpdir(),'sg-types-'))
  const options={...convertV4MiniflareOptions({modules:[{type:'ESModule',path:resolve('cloudflare/worker.js')},{type:'ESModule',path:resolve('cloudflare/passwords.js')}],compatibilityDate:'2026-11-08',d1Databases:{DB:'types-db'},bindings:{PASSWORD_PEPPER:'types-test-pepper-at-least-32-characters',SETUP_TOKEN:'types-test-setup-at-least-32-characters'}}),resourcePersistencePath:dir}
  let mf=new Miniflare(options)
  const req=(path,method='GET',body,cookie)=>mf.dispatchFetch(`https://calendar.example/api/${path}`,{method,headers:{...(body ? {'Content-Type':'application/json'} : {}),...(cookie ? {Cookie:cookie} : {})},...(body ? {body:JSON.stringify(body)} : {})})
  async function check(path,method,body,cookie,status) {const r=await req(path,method,body,cookie);assert.equal(r.status,status,await r.clone().text());return r.json()}
  async function login(email,password) {const r=await req('login','POST',{email,password});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0]}
  try {
    let db=await mf.getD1Database('DB')
    const apply=async name=>{const sql=await readFile(`cloudflare/migrations/${name}`,'utf8');await db.batch(sql.split(';').filter(s=>s.trim()).map(s=>db.prepare(s)))}
    await apply('0001_calendar.sql');await apply('0002_invitations.sql')
    await check('setup','POST',{name:'Admin',email:'admin@example.org',password:'Admin-Passwort-2026',token:'types-test-setup-at-least-32-characters'},null,201)
    const admin=await login('admin@example.org','Admin-Passwort-2026')
    const fixture={id:'a'.repeat(32),title:'Vorhandener Termin',date:'2026-11-12',time:'17:00',endTime:'18:30',place:'Vereinsheim',type:'training',createdBy:'Admin',version:7}
    await db.prepare('INSERT INTO events(id,title,date,time,endTime,place,type,createdBy,version) VALUES(?,?,?,?,?,?,?,?,?)').bind(...Object.values(fixture)).run()
    const accounts=(await db.prepare('SELECT * FROM users').all()).results,sessions=(await db.prepare('SELECT * FROM sessions').all()).results
    for(const name of (await readdir('cloudflare/migrations')).filter(n=>n.endsWith('.sql')&&n>'0002_invitations.sql').sort())await apply(name)
    assert.deepEqual(await db.prepare('SELECT * FROM events WHERE id=?').bind(fixture.id).first(),fixture)
    assert.deepEqual((await db.prepare('SELECT * FROM users').all()).results,accounts)
    assert.deepEqual((await db.prepare('SELECT * FROM sessions').all()).results,sessions)
    await check('users','POST',{name:'Trainer',email:'trainer@example.org',password:'Trainer-Passwort-2026'},admin,201)
    const member=await login('trainer@example.org','Trainer-Passwort-2026')
    await check('event-types','GET',null,null,401)
    assert.equal((await check('event-types','GET',null,member,200)).eventTypes.length,3)
    await check('event-types','POST',{name:'Verboten',color:'#000000'},member,403)
    await check('event-types','POST',{name:'',color:'#000000'},admin,400)
    await check('event-types','POST',{name:'Falsch',color:'url(x)'},admin,400)
    const {id}=await check('event-types','POST',{name:'Vereinsfest',color:'#ffee00'},admin,201)
    await check('event-types','POST',{name:' VEREINSFEST ',color:'#000000'},admin,409)
    const event={title:'Sommerfest',date:'2026-11-13',time:'14:00',endTime:'18:00',place:'Sportplatz',type:id}
    const created=await check('events','POST',event,member,201)
    let row=(await check('event-types','GET',null,admin,200)).eventTypes.find(t=>t.id===id)
    await check(`event-types/${id}`,'PUT',{...row,name:'Vereinsfeier',color:'#ffffff',enabled:true},admin,200)
    await check(`event-types/${id}`,'PUT',{...row,name:'Überholt',enabled:true},admin,409)
    await check(`event-types/${id}`,'PUT',{...row,name:'Training',enabled:true,version:2},admin,409)
    const result=await check('events?month=2026-11','GET',null,member,200)
    assert.equal(result.eventTypes.find(t=>t.id===id).name,'Vereinsfeier')
    assert.equal(result.events.find(e=>e.id===created.id).type,id)
    await check(`event-types/${id}`,'PUT',{name:'Vereinsfeier',color:'#ffffff',enabled:false,version:2},admin,200)
    await check('events','POST',event,member,400)
    await check(`events/${fixture.id}`,'PUT',{...fixture,type:id},member,400)
    await check(`events/${created.id}`,'PUT',{...event,title:'Termin bleibt bearbeitbar',version:1},member,200)
    await check(`event-types/${id}`,'PUT',{name:'Vereinsfeier',color:'#ffffff',enabled:true,version:3},admin,200)
    for(const t of (await check('event-types','GET',null,admin,200)).eventTypes.filter(t=>t.id!==id)) {
      await check(`event-types/${t.id}`,'PUT',{...t,enabled:false},admin,200)
    }
    await check(`event-types/${id}`,'PUT',{name:'Vereinsfeier',color:'#ffffff',enabled:false,version:4},admin,400)
    await check(`event-types/${id}`,'PUT',{name:'Vereinsfeier',color:'#ffffff',enabled:false,version:4},member,403)
    await mf.dispose();mf=new Miniflare(options);db=await mf.getD1Database('DB')
    assert.deepEqual(await db.prepare('SELECT * FROM events WHERE id=?').bind(fixture.id).first(),fixture)
    assert.equal((await check('event-types','GET',null,member,200)).eventTypes.find(t=>t.id===id).color,'#ffffff')
    assert.equal((await check('events','GET',null,admin,200)).events.length,2)
  } finally {await mf.dispose();await rm(dir,{recursive:true,force:true})}
})
