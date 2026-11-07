import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'

test('Zwei Konten teilen Termine; Anmeldung, Rechte, Konflikte und Neustart', async () => {
 const dir=mkdtempSync(join(tmpdir(),'sg-test-'))
 const env={...process.env,DB_PATH:join(dir,'calendar.sqlite'),ADMIN_EMAIL:'admin@example.org',ADMIN_PASSWORD:'Test-Passwort-12345',PORT:'0',NODE_ENV:'test'}
 const init=spawnSync(process.execPath,['server/server.mjs','--create-admin'],{env,encoding:'utf8'}); assert.equal(init.status,0,init.stderr)
 let child
 async function start() {
  child=spawn(process.execPath,['server/server.mjs'],{env,stdio:['ignore','pipe','pipe']})
  const output=await once(child.stdout,'data'); return `http://127.0.0.1:${String(output[0]).match(/Port (\d+)/)[1]}`
 }
 let base=await start()
 async function req(path,method='GET',body,cookie,origin) {
  return fetch(base+'/api/'+path,{method,headers:{...(body ? {'Content-Type':'application/json'} : {}),...(cookie ? {Cookie:cookie} : {}),...(origin ? {Origin:origin} : {})},...(body ? {body:JSON.stringify(body)} : {})})
 }
 async function login(email,password) { const r=await req('login','POST',{email,password}); assert.equal(r.status,200); return r.headers.get('set-cookie').split(';')[0] }
 try {
  assert.equal((await req('events')).status,401)
  assert.equal((await req('login','POST',{email:env.ADMIN_EMAIL,password:'falsch'})).status,401)
  const admin=await login(env.ADMIN_EMAIL,env.ADMIN_PASSWORD)
  let r=await req('users','POST',{name:'Trainerin',email:'trainer@example.org',password:'Trainer-Passwort-123'},admin); assert.equal(r.status,201)
  const member=await login('trainer@example.org','Trainer-Passwort-123')
  assert.equal((await req('users','GET',null,member)).status,403)
  const event={title:'Gemeinsames Training',date:'2026-11-12',time:'17:00',endTime:'18:30',place:'Sportplatz',type:'training'}
  assert.equal((await req('events','POST',event,member,'https://fremd.example')).status,403)
  assert.equal((await req('events','POST',{...event,date:'2026-02-30'},member)).status,400)
  r=await req('events','POST',event,member); assert.equal(r.status,201); const {id}=await r.json()
  r=await req('events','GET',null,admin); let events=(await r.json()).events; assert.equal(events.length,1); assert.equal(events[0].createdBy,'Trainerin')
  assert.equal((await req(`events/${id}`,'PUT',{...event,title:'Neuer Titel',version:1},admin)).status,200)
  assert.equal((await req(`events/${id}`,'PUT',{...event,version:1},member)).status,409)
  const closed=once(child,'exit'); child.kill(); await closed; base=await start()
  r=await req('events','GET',null,member); events=(await r.json()).events; assert.equal(events[0].title,'Neuer Titel'); assert.equal(events[0].version,2)
  assert.equal((await req(`events/${id}`,'DELETE',{version:1},member)).status,409)
  assert.equal((await req(`events/${id}`,'DELETE',{version:2},member)).status,200)
  assert.equal((await (await req('events','GET',null,admin)).json()).events.length,0)
  const reset=spawnSync(process.execPath,['server/server.mjs','--reset-password'],{env:{...env,ADMIN_EMAIL:'trainer@example.org',ADMIN_PASSWORD:'Neues-Passwort-2026'},encoding:'utf8'})
  assert.equal(reset.status,0,reset.stderr)
  assert.equal((await req('events','GET',null,member)).status,401)
  assert.equal((await req('login','POST',{email:'trainer@example.org',password:'Trainer-Passwort-123'})).status,401)
  const renewed=await login('trainer@example.org','Neues-Passwort-2026')
  const disable=spawnSync(process.execPath,['server/server.mjs','--disable-user'],{env:{...env,ACCOUNT_EMAIL:'trainer@example.org'},encoding:'utf8'})
  assert.equal(disable.status,0,disable.stderr)
  assert.equal((await req('events','GET',null,renewed)).status,401)
  assert.equal((await req('login','POST',{email:'trainer@example.org',password:'Neues-Passwort-2026'})).status,401)
  const lastAdmin=spawnSync(process.execPath,['server/server.mjs','--disable-user'],{env:{...env,ACCOUNT_EMAIL:env.ADMIN_EMAIL},encoding:'utf8'})
  assert.notEqual(lastAdmin.status,0)
  assert.equal((await req('logout','POST',{},admin)).status,200)
  assert.equal((await req('events','GET',null,admin)).status,401)
 } finally { if(child && child.exitCode===null) { const closed=once(child,'exit'); child.kill(); await closed } rmSync(dir,{recursive:true,force:true}) }
})
