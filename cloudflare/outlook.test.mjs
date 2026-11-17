import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'

test('Outlook: Administratorrechte, Microsoft-Freigabe, Kontoprüfung, Verschlüsselung und Einladungsversand',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'sg-contacts-'))
 let ready=false,wrong=false,rejectMail=false,tokenCalls=0;const sent=[]
 const mock=async request=>{
  const u=new URL(request.url)
  if(u.hostname==='login.microsoftonline.com'&&u.pathname.endsWith('/devicecode'))return Response.json({device_code:'device-secret-only-provider',user_code:'ABCD-EFGH',expires_in:900,interval:5})
  if(u.hostname==='login.microsoftonline.com'&&u.pathname.endsWith('/token')){tokenCalls++;const b=new URLSearchParams(await request.text());if(b.get('grant_type')==='refresh_token'||ready)return Response.json({access_token:'access-secret-only-provider',refresh_token:'refresh-secret-only-provider',expires_in:3600});return Response.json({error:'authorization_pending'},{status:400})}
  if(u.hostname==='graph.microsoft.com'&&u.pathname==='/v1.0/me')return Response.json({mail:wrong?'other@outlook.com':'mailbox-test@outlook.com'})
  if(u.hostname==='graph.microsoft.com'&&u.pathname==='/v1.0/me/sendMail'){assert.equal(request.headers.get('Authorization'),'Bearer access-secret-only-provider');if(rejectMail)return Response.json({error:{}},{status:403});sent.push(await request.json());return new Response(null,{status:202})}
  throw new Error('Unexpected outbound request')
 }
 const options={...convertV4MiniflareOptions({modules:[{type:'ESModule',path:resolve('cloudflare/worker.js')},{type:'ESModule',path:resolve('cloudflare/passwords.js')},{type:'ESModule',path:resolve('cloudflare/outlook.js')},{type:'ESModule',path:resolve('shared/recurrence.js')}],outboundService:mock,compatibilityDate:'2026-11-08',d1Databases:{DB:'contact-db'},bindings:{PASSWORD_PEPPER:'contacts-test-pepper-at-least-32-characters',SETUP_TOKEN:'contacts-test-setup-at-least-32-characters'}}),resourcePersistencePath:dir}
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
  const cid='11111111-2222-3333-4444-555555555555'
  await check('outlook/status','GET',null,null,401)
  await check('outlook/status','GET',null,member,403)
  await check('outlook/config','PUT',{clientId:cid,sender:'mailbox-test@outlook.com'},member,403)
  await check('outlook/connect','POST',{},member,403)
  await check('outlook/poll','POST',{},member,403)
  await check('outlook/disconnect','POST',{},member,403)
  await check('invitation-mail','POST',{url:'https://calendar.example/'},member,403)
  assert.equal((await check('outlook/status','GET',null,admin,200)).connected,false)
  await check('outlook/connect','POST',{},admin,409)
  await check('outlook/config','PUT',{clientId:'bad',sender:'mailbox-test@outlook.com'},admin,400)
  await check('outlook/config','PUT',{clientId:cid,sender:'mailbox-test@outlook.com'},admin,200)
  let code=await check('outlook/connect','POST',{},admin,200)
  assert.equal(code.userCode,'ABCD-EFGH');assert.ok(!JSON.stringify(code).includes('device-secret'))
  assert.equal((await check('outlook/poll','POST',{},admin,200)).pending,true);assert.equal(tokenCalls,0)
  await db.prepare('UPDATE outlook_device_codes SET next_poll=0').run()
  assert.equal((await check('outlook/poll','POST',{},admin,200)).pending,true)
  ready=true;wrong=true;await db.prepare('UPDATE outlook_device_codes SET next_poll=0').run()
  await check('outlook/poll','POST',{},admin,400)
  assert.equal((await check('outlook/status','GET',null,admin,200)).connected,false)
  wrong=false;code=await check('outlook/connect','POST',{},admin,200)
  await db.prepare('UPDATE outlook_device_codes SET next_poll=0').run()
  assert.equal((await check('outlook/poll','POST',{},admin,200)).connected,true)
  const stored=await db.prepare('SELECT * FROM outlook_connections WHERE admin_id=?').bind(adminId).first()
  assert.ok(!stored.encrypted_tokens.includes('refresh-secret'))
  assert.ok(!JSON.stringify(await check('outlook/status','GET',null,admin,200)).includes('access-secret'))
  const invitation=await check('invitations','POST',{name:'Eingeladener Kollege',email:'invited@example.org'},admin,201)
  await check('invitation-mail','POST',{url:invitation.url.replace('calendar.example','evil.example')},admin,400)
  assert.equal((await req('invitation-mail','POST',{url:invitation.url},admin,{Origin:'https://evil.example'})).status,403)
  const result=await check('invitation-mail','POST',{url:invitation.url,email:'attacker@example.org'},admin,200)
  assert.equal(result.accepted,true);assert.equal(result.recipient,'invited@example.org');assert.equal(sent.length,1)
  assert.equal(sent[0].message.toRecipients[0].emailAddress.address,'invited@example.org')
  assert.ok(sent[0].message.body.content.includes(invitation.url));assert.equal(sent[0].saveToSentItems,true)
  const previousCalls=tokenCalls;await db.prepare('UPDATE outlook_connections SET expires=0').run()
  await check('invitation-mail','POST',{url:invitation.url},admin,200);assert.equal(tokenCalls,previousCalls+1)
  rejectMail=true;await check('invitation-mail','POST',{url:invitation.url},admin,502)
  await check('invitations/check','POST',{token:new URLSearchParams(new URL(invitation.url).hash.slice(1)).get('einladung')},null,200)
  await check('outlook/disconnect','POST',{},admin,200)
  assert.equal((await check('outlook/status','GET',null,admin,200)).connected,false)
  await check('invitation-mail','POST',{url:invitation.url},admin,409)
 } finally {await mf.dispose();await rm(dir,{recursive:true,force:true})}
})
