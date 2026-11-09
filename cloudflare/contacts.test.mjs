import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'

test('Kontaktbuch: freiwillige Einträge, geschütztes Lesen, eigene Rechte, Verwaltung, Konflikte und Kontosperre',async()=>{
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
  const entry={name:'Trainer Weber',team:'1. Mannschaft',position:'Trainer',phone:'',email:'',version:0,shared:true}
  await check('contacts','GET',null,null,401)
  assert.deepEqual((await check('contacts','GET',null,member,200)).contacts,[])
  await check('contacts/me','PUT',entry,null,401)
  await check(`contacts/${adminId}`,'PUT',entry,member,403)
  await check(`contacts/${memberId}`,'PUT',entry,admin,403)
  await check('contacts/me','PUT',{...entry,shared:false},member,400)
  await check('contacts/me','PUT',{...entry,email:'ungültig'},member,400)
  await check('contacts/me','PUT',{...entry,phone:'javascript:evil'},member,400)
  assert.equal((await req('contacts/me','PUT',entry,member,{Origin:'https://fremd.example'})).status,403)
  await check('contacts/me','PUT',{...entry,user_id:adminId},member,201)
  await check('contacts/me','PUT',entry,member,409)
  let contacts=(await check('contacts','GET',null,admin,200)).contacts
  assert.equal(contacts.length,1);assert.equal(contacts[0].user_id,memberId)
  assert.equal(contacts[0].email,'');assert.equal(contacts[0].phone,'')
  assert.ok(!JSON.stringify(contacts).includes('login-trainer@example.org'))
  await check('contacts/me','PUT',{...entry,name:'Verwaltung',team:'Vorstand',position:'Abteilungsleiter',email:'kontakt@example.org'},admin,201)
  await check(`contacts/${adminId}`,'DELETE',{version:1},member,403)
  await check('contacts/me','PUT',{...entry,phone:'+49 123 45678',email:'trainer-kontakt@example.org',version:1},member,200)
  await check(`contacts/${memberId}`,'PUT',{...entry,version:1},admin,409)
  await check(`contacts/${memberId}`,'PUT',{...entry,name:'Trainer Weber korrigiert',phone:'+49 123 45678',version:2},admin,200)
  const race=await Promise.all([req('contacts/me','PUT',{...entry,name:'Eigene Änderung',version:3},member),req(`contacts/${memberId}`,'PUT',{...entry,name:'Verwaltungsänderung',version:3},admin)])
  assert.deepEqual(race.map(r=>r.status).sort(),[200,409])
  const name=race[0].status===200 ? 'Eigene Änderung':'Verwaltungsänderung'
  await mf.dispose();mf=new Miniflare(options)
  contacts=(await check('contacts','GET',null,member,200)).contacts
  assert.equal(contacts.find(c=>c.user_id===memberId).name,name)
  await check(`users/${memberId}`,'PATCH',{action:'disable'},admin,200)
  await check('contacts','GET',null,member,401)
  assert.equal((await check('contacts','GET',null,admin,200)).contacts.length,1)
  await check(`users/${memberId}`,'PATCH',{action:'reset-password',password:'Neues-Passwort-2026'},admin,200)
  member=await login('login-trainer@example.org','Neues-Passwort-2026')
  assert.equal((await check('contacts','GET',null,member,200)).contacts.length,2)
  await check('contacts/me','DELETE',{version:3},member,409)
  await check(`contacts/${memberId}`,'DELETE',{version:4},admin,200)
  await check('me','GET',null,member,200)
  assert.equal((await check('contacts','GET',null,member,200)).contacts.length,1)
  await check('contacts/me','PUT',entry,member,201)
  await check('contacts/me','DELETE',{version:1},member,200)
  await check('me','GET',null,member,200)
 } finally {await mf.dispose();await rm(dir,{recursive:true,force:true})}
})
