import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'

test('Postfach: private Gespräche, Antworten, gelesen, Wiederholungen und Sperren',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'sg-contacts-'))
 const options={...convertV4MiniflareOptions({modules:[{type:'ESModule',path:resolve('cloudflare/worker.js')},{type:'ESModule',path:resolve('cloudflare/passwords.js')},{type:'ESModule',path:resolve('shared/recurrence.js')}],compatibilityDate:'2026-11-08',d1Databases:{DB:'contact-db'},bindings:{PASSWORD_PEPPER:'contacts-test-pepper-at-least-32-characters',SETUP_TOKEN:'contacts-test-setup-at-least-32-characters'}}),resourcePersistencePath:dir}
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
  await check('users','POST',{name:'Dritte Person',email:'third@example.org',password:'Dritte-Passwort-2026'},admin,201)
  const third=await login('third@example.org','Dritte-Passwort-2026')
  const thirdId=(await check('users','GET',null,admin,200)).users.find(u=>u.email==='third@example.org').id
  await check('messages','GET',null,null,401)
  await check(`messages/${adminId}`,'POST',{body:'Hallo Vorstand',clientId:crypto.randomUUID()},null,401)
  const list=await check('messages','GET',null,member,200)
  assert.ok(list.recipients.some(p=>p.id===thirdId));assert.ok(!JSON.stringify(list).includes('example.org'))
  const first={body:'Privat an Vorstand',clientId:crypto.randomUUID()}
  await check(`messages/${adminId}`,'POST',first,member,201)
  await check(`messages/${adminId}`,'POST',first,member,200)
  await check(`messages/${thirdId}`,'POST',first,member,409)
  assert.equal((await check('messages/summary','GET',null,admin,200)).unread,1)
  assert.equal((await check('messages','GET',null,third,200)).threads.length,0)
  assert.equal((await check(`messages/${memberId}`,'GET',null,third,200)).messages.length,0)
  await check(`messages/${adminId}/read`,'POST',{through:999999},third,200)
  assert.equal((await check('messages/summary','GET',null,admin,200)).unread,1)
  let thread=await check(`messages/${memberId}`,'GET',null,admin,200)
  assert.equal(thread.messages.length,1);assert.equal(thread.messages[0].body,first.body)
  await check(`messages/${memberId}/read`,'POST',{through:thread.messages[0].id},admin,200)
  assert.equal((await check('messages/summary','GET',null,admin,200)).unread,0)
  await check(`messages/${memberId}`,'POST',{body:'Antwort',clientId:crypto.randomUUID()},admin,201)
  assert.equal((await check('messages/summary','GET',null,member,200)).unread,1)
  await check(`messages/${thirdId}`,'POST',{body:'Nur zwischen Mitgliedern',clientId:crypto.randomUUID()},member,201)
  assert.equal((await check(`messages/${thirdId}`,'GET',null,admin,200)).messages.length,0)
  assert.ok(!(await check('messages','GET',null,admin,200)).threads.some(t=>t.body==='Nur zwischen Mitgliedern'))
  await check(`messages/${memberId}`,'POST',{body:'An mich',clientId:crypto.randomUUID()},member,400)
  await check(`messages/${adminId}`,'POST',{body:' ',clientId:crypto.randomUUID()},member,400)
  await check(`messages/${adminId}`,'POST',{body:'x'.repeat(4001),clientId:crypto.randomUUID()},member,400)
  assert.equal((await req(`messages/${adminId}`,'POST',{body:'Fremde Herkunft',clientId:crypto.randomUUID()},member,{Origin:'https://evil.example'})).status,403)
  assert.equal((await check(`messages/${adminId}?before=2`,'GET',null,member,200)).messages.length,1)
  await check(`messages/${adminId}?before=bad`,'GET',null,member,400)
  // More than one page must remain accessible without leaking unrelated messages.
  await db.batch(Array.from({length:105},(_,i)=>db.prepare('INSERT INTO messages(sender_id,recipient_id,body,created_at,client_id) VALUES(?,?,?,?,?)').bind(memberId,adminId,`Test ${i}`,Date.now(),crypto.randomUUID())))
  thread=await check(`messages/${memberId}`,'GET',null,admin,200);assert.equal(thread.messages.length,100);assert.equal(thread.hasMore,true)
  const older=await check(`messages/${memberId}?before=${thread.messages[0].id}`,'GET',null,admin,200);assert.equal(older.messages.length,7);assert.equal(older.hasMore,false)
  await mf.dispose();mf=new Miniflare(options)
  assert.equal((await check(`messages/${memberId}`,'GET',null,admin,200)).messages.length,100)
  await check(`users/${memberId}`,'PATCH',{action:'disable'},admin,200)
  await check('messages','GET',null,member,401)
  await check(`messages/${memberId}`,'POST',{body:'Gesperrt',clientId:crypto.randomUUID()},admin,400)
  assert.equal((await check(`messages/${memberId}`,'GET',null,admin,200)).messages.length,100)
  assert.ok(!(await check('messages','GET',null,admin,200)).recipients.some(p=>p.id===memberId))
 } finally {await mf.dispose();await rm(dir,{recursive:true,force:true})}
})
