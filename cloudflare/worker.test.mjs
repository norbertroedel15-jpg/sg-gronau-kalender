import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'

test('Cloudflare Worker: geschützte Einrichtung, geteilte Termine, Konflikte, Konten und Datenerhalt', async () => {
  const dir = await mkdtemp(join(tmpdir(),'sg-d1-'))
  const options = {
    modules:[{type:'ESModule',path:resolve('cloudflare/worker.js')},{type:'ESModule',path:resolve('cloudflare/passwords.js')}], compatibilityDate:'2026-11-08',
    d1Databases:{ DB:'test-db' },
    bindings:{ PASSWORD_PEPPER:'local-test-pepper-32-characters-minimum',SETUP_TOKEN:'local-test-setup-code-32-characters-minimum' }
  }
  let mf = new Miniflare({...convertV4MiniflareOptions(options),resourcePersistencePath:dir})
  const req = async (path,method='GET',body,cookie,extra={}) => mf.dispatchFetch('https://calendar.example/api/'+path, {
    method, headers:{...(body !== undefined ? {'Content-Type':'application/json'} : {}), ...(cookie ? {Cookie:cookie} : {}),...extra},
    ...(body !== undefined ? {body:JSON.stringify(body)} : {})
  })
  const login = async (email,password) => {
    const r = await req('login','POST',{email,password}); assert.equal(r.status,200,await r.clone().text())
    const value = r.headers.get('set-cookie'); assert.match(value,/HttpOnly/); assert.match(value,/Secure/); return value.split(';')[0]
  }
  const adminBody={email:'admin@example.org',name:'Vereinsverwaltung',password:'Ein-Testpasswort-2026',token:options.bindings.SETUP_TOKEN}
  try {
    const db = await mf.getD1Database('DB')
    const sql = await readFile('cloudflare/migrations/0001_calendar.sql','utf8')
    await db.batch(sql.split(';').filter(s=>s.trim()).map(s=>db.prepare(s)))
    assert.deepEqual(await (await req('setup')).json(),{available:true})
    assert.equal((await req('events')).status,401)
    assert.equal((await req('setup','POST',{...adminBody,token:'falsch'})).status,403)
    assert.equal((await req('setup','POST',adminBody,null,{Origin:'https://fremd.example'})).status,403)
    assert.equal((await req('setup','POST',null)).status,400)
    // Simultaneous setup attempts must never create a second administrator.
    const setupResults=await Promise.all([req('setup','POST',adminBody),req('setup','POST',{...adminBody,email:'second@example.org'})])
    assert.deepEqual(setupResults.map(r=>r.status).sort(),[201,409])
    assert.equal((await db.prepare("SELECT count(*) AS n FROM users WHERE role='admin'").first()).n,1)
    assert.equal((await (await req('setup')).json()).available,false)
    const owner=await db.prepare('SELECT email FROM users').first()
    const admin=await login(owner.email,adminBody.password)
    assert.equal((await req('users','POST',{email:'trainer@example.org',name:'Trainerin',password:'Trainer-Testpasswort-2026'},admin)).status,201)
    assert.equal((await req('users','POST',{email:'trainer@example.org',name:'Doppelt',password:'Trainer-Testpasswort-2026'},admin)).status,409)
    const member=await login('trainer@example.org','Trainer-Testpasswort-2026')
    assert.equal((await req('users','GET',undefined,member)).status,403)
    assert.equal((await req('users','POST',{email:'x@example.org',name:'x',password:'Ein-Testpasswort-2026'},member)).status,403)
    const e={title:'Training',date:'2026-11-12',time:'17:00',endTime:'18:30',place:'Sportplatz',type:'training'}
    for (const bad of [{...e,date:'2026-02-30'},{...e,endTime:'16:00'},{...e,type:'falsch'},{...e,title:''}]) assert.equal((await req('events','POST',bad,member)).status,400)
    assert.equal((await req('events','POST',e,member,{'Sec-Fetch-Site':'cross-site'})).status,403)
    const created=await req('events','POST',e,member); assert.equal(created.status,201); const {id}=await created.json()
    let rows=(await (await req('events?month=2026-11','GET',undefined,admin)).json()).events
    assert.equal(rows.length,1); assert.equal(rows[0].createdBy,'Trainerin')
    assert.equal((await (await req('events?month=2026-12','GET',undefined,admin)).json()).events.length,0)
    assert.equal((await req('events?month=invalid','GET',undefined,admin)).status,400)
    // Compare-and-swap must protect changes across different Worker requests.
    const updates=await Promise.all([
      req(`events/${id}`,'PUT',{...e,title:'Änderung A',version:1},admin),
      req(`events/${id}`,'PUT',{...e,title:'Änderung B',version:1},member)
    ])
    assert.deepEqual(updates.map(r=>r.status).sort(),[200,409])
    await mf.dispose(); mf=new Miniflare({...convertV4MiniflareOptions(options),resourcePersistencePath:dir})
    rows=(await (await req('events','GET',undefined,member)).json()).events
    assert.equal(rows[0].version,2); assert.match(rows[0].title,/Änderung/)
    assert.equal((await req(`events/${id}`,'DELETE',{version:1},member)).status,409)
    assert.equal((await req(`events/${id}`,'DELETE',{version:2},member)).status,200)
    const users=(await (await req('users','GET',undefined,admin)).json()).users
    const memberId=users.find(u=>u.role==='member').id, adminId=users.find(u=>u.role==='admin').id
    assert.equal((await req(`users/${memberId}`,'PATCH',{action:'disable'},member)).status,403)
    assert.equal((await req(`users/${adminId}`,'PATCH',{action:'disable'},admin)).status,400)
    assert.equal((await req(`users/${memberId}`,'PATCH',{action:'disable'},admin)).status,200)
    assert.equal((await req('me','GET',undefined,member)).status,401)
    assert.equal((await req('login','POST',{email:'trainer@example.org',password:'Trainer-Testpasswort-2026'})).status,401)
    assert.equal((await req(`users/${memberId}`,'PATCH',{action:'reset-password',password:'Neues-Passwort-2026'},admin)).status,200)
    const renewed=await login('trainer@example.org','Neues-Passwort-2026')
    assert.equal((await req('logout','POST',{},renewed)).status,200)
    assert.equal((await req('me','GET',undefined,renewed)).status,401)
    for(let i=0;i<8;i++) assert.equal((await req('login','POST',{email:'unknown@example.org',password:'Falsches-Passwort'})).status,401)
    assert.equal((await req('login','POST',{email:'unknown@example.org',password:'Falsches-Passwort'})).status,429)
    assert.equal((await req('events','POST',{title:'x'.repeat(17000)},admin)).status,413)
  } finally { await mf.dispose(); await rm(dir,{recursive:true,force:true}) }
})
