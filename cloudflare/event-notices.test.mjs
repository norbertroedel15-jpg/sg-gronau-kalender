import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'

test('Terminhinweise: atomare Erstellung, Serienzusammenfassung, Empfang und individuelle Bestätigung',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'sg-contacts-'))
 const options={...convertV4MiniflareOptions({modules:[{type:'ESModule',path:resolve('cloudflare/worker.js')},{type:'ESModule',path:resolve('cloudflare/passwords.js')},{type:'ESModule',path:resolve('cloudflare/outlook.js')},{type:'ESModule',path:resolve('shared/recurrence.js')}],compatibilityDate:'2026-11-08',d1Databases:{DB:'contact-db'},bindings:{PASSWORD_PEPPER:'contacts-test-pepper-at-least-32-characters',SETUP_TOKEN:'contacts-test-setup-at-least-32-characters'}}),resourcePersistencePath:dir}
 let mf=new Miniflare(options)
 const req=(path,method='GET',body,cookie,headers={})=>mf.dispatchFetch(`https://calendar.example/api/${path}`,{method,headers:{...(body ? {'Content-Type':'application/json'}:{}),...(cookie ? {Cookie:cookie}:{}),...headers},...(body ? {body:JSON.stringify(body)}:{})})
 async function check(path,method,body,cookie,status) {const r=await req(path,method,body,cookie);assert.equal(r.status,status,await r.clone().text());return r.json()}
 async function login(email,password) {const r=await req('login','POST',{email,password});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0]}
 try {
  const db=await mf.getD1Database('DB')
  for(const file of (await readdir('cloudflare/migrations')).filter(n=>n.endsWith('.sql')).sort()) {
   const sql=await readFile(`cloudflare/migrations/${file}`,'utf8');await db.batch(sql.split(';').filter(s=>s.trim()).map(s=>db.prepare(s)))
  }
  await check('setup','POST',{name:'Admin',email:'admin@example.org',password:'Admin-Passwort-2026',token:'contacts-test-setup-at-least-32-characters'},null,201)
  const admin=await login('admin@example.org','Admin-Passwort-2026')
  await check('users','POST',{name:'Trainer',email:'login-trainer@example.org',password:'Trainer-Passwort-2026'},admin,201)
  let member=await login('login-trainer@example.org','Trainer-Passwort-2026')
  const users=(await check('users','GET',null,admin,200)).users,adminId=users.find(u=>u.role==='admin').id,memberId=users.find(u=>u.role==='member').id
  await check('users','POST',{name:'Anderer Trainer',email:'third@example.org',password:'Dritte-Passwort-2026'},admin,201)
  const third=await login('third@example.org','Dritte-Passwort-2026')
  const thirdId=(await check('users','GET',null,admin,200)).users.find(u=>u.email==='third@example.org').id
  const event={title:'Training Testmannschaft',date:'2026-11-17',time:'18:00',endTime:'19:30',place:'Sportplatz',type:'training_first_team'}
  await check('event-notices','GET',null,null,401)
  assert.equal((await check('event-notices','GET',null,member,200)).total,0)
  const first=await check('events','POST',event,member,201)
  assert.equal((await check('event-notices','GET',null,member,200)).total,0)
  let notices=await check('event-notices','GET',null,admin,200)
  assert.equal(notices.total,1);const n=notices.notices[0]
  assert.equal(n.title,event.title);assert.equal(n.type_name,'Training 1. Mannschaft');assert.equal(n.created_by,'Trainer');assert.equal(n.occurrence_count,1);assert.equal(n.current_event_id,first.id)
  assert.equal((await check('event-notices','GET',null,third,200)).total,1)
  await check(`event-notices/${n.id}/read`,'POST',{},member,404)
  await check(`event-notices/${n.id}/read`,'POST',{},null,401)
  await check(`event-notices/${n.id}/read`,'POST',{},admin,200)
  assert.equal((await check('event-notices','GET',null,admin,200)).total,0)
  assert.equal((await check('event-notices','GET',null,third,200)).total,1)
  await check('events','POST',{...event,time:'bad'},member,400)
  assert.equal((await check('event-notices','GET',null,third,200)).total,1)
  await check(`events/${first.id}`,'PUT',{...event,title:'Geänderter Titel',version:1},member,200)
  assert.equal((await check('event-notices','GET',null,third,200)).total,1)
  const series=await check('series','POST',{...event,title:'Neue Trainingsserie',repeatUntil:'2026-12-17',weekdays:[2,4]},member,201)
  assert.ok(series.count>1)
  notices=await check('event-notices','GET',null,admin,200);assert.equal(notices.total,1)
  const sn=notices.notices[0];assert.equal(sn.occurrence_count,series.count);assert.equal(sn.series_id,series.seriesId);assert.equal(sn.until_date,'2026-12-17')
  assert.equal((await check('event-notices','GET',null,third,200)).total,2)
  // If the first occurrence is removed, the notification still opens a remaining occurrence.
  await check(`events/${sn.event_id}`,'DELETE',{version:1},member,200)
  const remaining=(await check('event-notices','GET',null,admin,200)).notices[0]
  assert.ok(remaining.current_event_id);assert.notEqual(remaining.current_event_id,sn.event_id)
  await check(`events/${first.id}`,'DELETE',{version:2},member,200)
  assert.equal((await check('event-notices','GET',null,third,200)).notices.find(x=>x.id===n.id).current_event_id,null)
  await mf.dispose();mf=new Miniflare(options)
  assert.equal((await check('event-notices','GET',null,third,200)).total,2)
  assert.equal((await check('event-notices','GET',null,admin,200)).total,1)
  await check('users','POST',{name:'Neu',email:'new@example.org',password:'Neues-Passwort-2026'},admin,201)
  const newcomer=await login('new@example.org','Neues-Passwort-2026')
  assert.equal((await check('event-notices','GET',null,newcomer,200)).total,0)
  await check(`users/${thirdId}`,'PATCH',{action:'disable'},admin,200)
  await check('event-notices','GET',null,third,401)
  await check('events','POST',{...event,title:'Noch ein Termin'},admin,201)
  assert.equal((await check('event-notices','GET',null,member,200)).total,1)
  assert.equal((await check('event-notices','GET',null,newcomer,200)).total,1)
  assert.equal((await (await mf.getD1Database('DB')).prepare('SELECT COUNT(*) AS n FROM event_notice_recipients WHERE user_id=?').bind(thirdId).first()).n,2)
 } finally {await mf.dispose();await rm(dir,{recursive:true,force:true})}
})
