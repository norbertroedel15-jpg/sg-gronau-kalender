import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'

test('Einladungen: Passwort selbst wählen, nur einmal, Ablauf, Neuversand, Widerruf, Sperren und parallele Annahme', async () => {
  const dir = await mkdtemp(join(tmpdir(),'sg-invites-'))
  const mf = new Miniflare({...convertV4MiniflareOptions({
    modules:[{type:'ESModule',path:resolve('cloudflare/worker.js')},{type:'ESModule',path:resolve('cloudflare/passwords.js')}],compatibilityDate:'2026-11-08',d1Databases:{DB:'invite-db'},
    bindings:{PASSWORD_PEPPER:'invite-test-pepper-minimum-32-characters',SETUP_TOKEN:'invite-test-setup-minimum-32-characters'}
  }),resourcePersistencePath:dir})
  const req = (path,method='GET',body,cookie,headers={}) => mf.dispatchFetch(`https://calendar.example/api/${path}`,{
    method,headers:{...(body ? {'Content-Type':'application/json'} : {}),...(cookie ? {Cookie:cookie}:{}),...headers},...(body ? {body:JSON.stringify(body)} : {})
  })
  async function expect(path,method,body,cookie,status) {
    const r = await req(path,method,body,cookie); assert.equal(r.status,status,await r.clone().text()); return r.json()
  }
  async function login(email,password) {
    const r=await req('login','POST',{email,password}); assert.equal(r.status,200,await r.clone().text()); return r.headers.get('set-cookie').split(';')[0]
  }
  const getToken = link => new URLSearchParams(new URL(link.url).hash.slice(1)).get('einladung')
  try {
    const db=await mf.getD1Database('DB')
    // Start with migration 1 and an existing administrator: upgrading must preserve it.
    const first=await readFile('cloudflare/migrations/0001_calendar.sql','utf8')
    await db.batch(first.split(';').filter(s=>s.trim()).map(s=>db.prepare(s)))
    await expect('setup','POST',{email:'admin@example.org',name:'Admin',password:'Admin-Testpasswort-2026',token:'invite-test-setup-minimum-32-characters'},null,201)
    const admin=await login('admin@example.org','Admin-Testpasswort-2026')
    const before=await db.prepare('SELECT password FROM users WHERE role=\'admin\'').first()
    for(const file of (await readdir('cloudflare/migrations')).filter(f=>f.endsWith('.sql')&&f!=='0001_calendar.sql').sort()) {
      const sql=await readFile(`cloudflare/migrations/${file}`,'utf8')
      await db.batch(sql.split(';').filter(s=>s.trim()).map(s=>db.prepare(s)))
    }
    assert.deepEqual(await db.prepare('SELECT password FROM users WHERE role=\'admin\'').first(),before)
    await expect('me','GET',null,admin,200)
    const person={name:'Trainer Weber',email:'weber@example.org'}
    await expect('invitations','POST',person,null,401)
    await expect('invitations','POST',{name:'',email:'invalid'},admin,400)
    const link=await expect('invitations','POST',person,admin,201),token=getToken(link)
    assert.match(token,/^[a-f0-9]{64}$/); assert.equal(new URL(link.url).search,'')
    assert.ok(link.expires>Date.now()+6*86400000)
    let users=await expect('users','GET',null,admin,200),member=users.users.find(u=>u.email===person.email)
    assert.equal(users.invitationSupport,true); assert.equal(member.disabled,1); assert.equal(member.activation_pending,1)
    const stored=await db.prepare('SELECT * FROM invitations WHERE user_id=?').bind(member.id).first()
    assert.notEqual(stored.token_hash,token); assert.equal(JSON.stringify(stored).includes(token),false)
    await expect('invitations','POST',person,admin,409)
    await expect('invitations/check','POST',{token:'bad'},null,410)
    await expect('invitations/check','POST',{token:'0'.repeat(64)},null,410)
    assert.equal((await expect('invitations/check','POST',{token},null,200)).email,person.email)
    await expect('invitations/accept','POST',{token,password:'short'},null,400)
    assert.equal((await req('invitations/accept','POST',{token,password:'Mitglied-Passwort-2026'},null,{Origin:'https://fremd.example'})).status,403)
    assert.equal((await expect('invitations/check','POST',{token},null,200)).name,person.name)
    const race=await Promise.all([req('invitations/accept','POST',{token,password:'Mitglied-Passwort-2026'}),req('invitations/accept','POST',{token,password:'Mitglied-Passwort-2026'})])
    assert.deepEqual(race.map(r=>r.status).sort(),[200,410])
    await expect('invitations/check','POST',{token},null,410)
    await expect('invitations/accept','POST',{token,password:'Anderes-Passwort-2026'},null,410)
    const session=await login(person.email,'Mitglied-Passwort-2026')
    await expect('invitations','POST',{name:'Other',email:'other@example.org'},session,403)
    await expect(`users/${member.id}/invitation`,'POST',{},session,403)
    await expect(`users/${member.id}/invitation`,'DELETE',{},session,403)
    // Viewing/reissuing/revoking an invitation must not change an existing password.
    const reset=await expect(`users/${member.id}/invitation`,'POST',{},admin,201)
    await expect('me','GET',null,session,200)
    await expect(`users/${member.id}/invitation`,'DELETE',{},admin,200)
    await expect('invitations/check','POST',{token:getToken(reset)},null,410)
    await expect('me','GET',null,session,200)
    const old=await expect(`users/${member.id}/invitation`,'POST',{},admin,201)
    const fresh=await expect(`users/${member.id}/invitation`,'POST',{},admin,201)
    await expect('invitations/check','POST',{token:getToken(old)},null,410)
    await expect('invitations/check','POST',{token:getToken(fresh)},null,200)
    await db.prepare('UPDATE invitations SET expires=? WHERE user_id=?').bind(Date.now()-1,member.id).run()
    await expect('invitations/accept','POST',{token:getToken(fresh),password:'Neues-Passwort-2026'},null,410)
    await expect('me','GET',null,session,200)
    const disabledLink=await expect(`users/${member.id}/invitation`,'POST',{},admin,201)
    await expect(`users/${member.id}`,'PATCH',{action:'disable'},admin,200)
    await expect('me','GET',null,session,401)
    await expect('invitations/accept','POST',{token:getToken(disabledLink),password:'Neues-Passwort-2026'},null,410)
    const reactivation=await expect(`users/${member.id}/invitation`,'POST',{},admin,201)
    await expect('invitations/accept','POST',{token:getToken(reactivation),password:'Neues-Passwort-2026'},null,200)
    const active=await login(person.email,'Neues-Passwort-2026')
    const passwordLink=await expect(`users/${member.id}/invitation`,'POST',{},admin,201)
    await expect('invitations/accept','POST',{token:getToken(passwordLink),password:'Selbst-Gewählt-2026'},null,200)
    await expect('me','GET',null,active,401)
    await login(person.email,'Selbst-Gewählt-2026')
    users=await expect('users','GET',null,admin,200); member=users.users.find(u=>u.email===person.email)
    assert.equal(member.disabled,0); assert.equal(member.activation_pending,0); assert.equal(member.invitation_expires,null)
    await expect('me','GET',null,admin,200)
  } finally { await mf.dispose(); await rm(dir,{recursive:true,force:true}) }
})
