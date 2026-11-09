import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'

test('Serientermine: Mehrtagestraining, Ausnahmen, Serienänderung, Konflikte, Löschen und Bestandsdaten',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'sg-series-'))
 const options={...convertV4MiniflareOptions({modules:[{type:'ESModule',path:resolve('cloudflare/worker.js')},{type:'ESModule',path:resolve('cloudflare/passwords.js')},{type:'ESModule',path:resolve('shared/recurrence.js')}],compatibilityDate:'2026-11-08',d1Databases:{DB:'series-db'},bindings:{PASSWORD_PEPPER:'series-test-pepper-at-least-32-characters',SETUP_TOKEN:'series-test-setup-at-least-32-characters'}}),resourcePersistencePath:dir}
 let mf=new Miniflare(options)
 const req=(path,method='GET',body,cookie)=>mf.dispatchFetch(`https://calendar.example/api/${path}`,{method,headers:{...(body ? {'Content-Type':'application/json'}:{}),...(cookie ? {Cookie:cookie}:{})},...(body ? {body:JSON.stringify(body)}:{})})
 async function check(path,method,body,cookie,status) {const r=await req(path,method,body,cookie);assert.equal(r.status,status,await r.clone().text());return r.json()}
 async function login(email,password) {const r=await req('login','POST',{email,password});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0]}
 try {
  const db=await mf.getD1Database('DB')
  for(const f of (await readdir('cloudflare/migrations')).filter(f=>f.endsWith('.sql')).sort()) {
   const sql=await readFile(`cloudflare/migrations/${f}`,'utf8');await db.batch(sql.split(';').filter(s=>s.trim()).map(s=>db.prepare(s)))
  }
  await check('setup','POST',{name:'Admin',email:'admin@example.org',password:'Admin-Passwort-2026',token:'series-test-setup-at-least-32-characters'},null,201)
  const admin=await login('admin@example.org','Admin-Passwort-2026')
  await check('users','POST',{name:'Trainer',email:'trainer@example.org',password:'Trainer-Passwort-2026'},admin,201)
  const trainer=await login('trainer@example.org','Trainer-Passwort-2026')
  const types=(await check('event-types','GET',null,trainer,200)).eventTypes
  assert.equal(types.filter(t=>t.is_training).length,8)
  assert.equal(new Set(types.filter(t=>t.is_training).map(t=>t.color)).size,8)
  assert.equal(types.find(t=>t.id==='training_first_team').default_weekdays,'[2,4]')
  assert.equal(types.find(t=>t.id==='training_ah').default_weekdays,'[3]')
  for (const training of types.filter(t=>t.is_training)) {
    const game=types.find(t=>t.id===training.game_type_id)
    assert.ok(game?.enabled);assert.match(game.name,/^Spiel /);assert.equal(game.color,training.color);assert.equal(game.is_training,0)
  }
  const body={title:'Training 1. Mannschaft',date:'2026-11-09',time:'19:00',endTime:'20:30',place:'Kunstrasen',type:'training_first_team',repeatUntil:'2026-11-20',weekdays:[2,4]}
  await check('series','POST',body,null,401)
  await check('series','POST',{...body,weekdays:[]},trainer,400)
  await check('series','POST',{...body,repeatUntil:'2028-01-01'},trainer,400)
  const standalone=await check('events','POST',{...body,title:'Einzeltermin',type:'training'},trainer,201)
  const game=await check('events','POST',{...body,title:'Spiel 1. Mannschaft gegen Testverein',type:types.find(t=>t.id==='training_first_team').game_type_id},trainer,201)
  const gameRow=(await check('events','GET',null,trainer,200)).events.find(e=>e.id===game.id)
  assert.equal(gameRow.type,'game_first_team');assert.equal(gameRow.series_id,null)
  await check(`events/${game.id}`,'DELETE',{version:gameRow.version},trainer,200)
  const created=await check('series','POST',body,trainer,201)
  assert.equal(created.count,4)
  let result=await check('events?month=2026-11','GET',null,trainer,200),events=result.events.filter(e=>e.series_id===created.seriesId)
  assert.equal(result.recurringSupport,true)
  assert.deepEqual(events.map(e=>e.date),['2026-11-10','2026-11-12','2026-11-17','2026-11-19'])
  assert.ok(events.every(e=>e.seriesVersion===1&&e.seriesWeekdays==='[2,4]'&&e.time==='19:00'))
  const first=events[0]
  await check(`events/${first.id}`,'PUT',{...first,title:'Nur dieser Termin',date:'2026-11-11',version:first.version},trainer,200)
  await check(`series/${created.seriesId}`,'PUT',{...body,title:'Überholt',version:1},admin,409)
  assert.equal((await check('events','GET',null,trainer,200)).events.find(e=>e.id===first.id).title,'Nur dieser Termin')
  const changed=await check(`series/${created.seriesId}`,'PUT',{...body,title:'Training neue Zeit',time:'18:30',version:2},trainer,200)
  assert.equal(changed.count,4)
  result=await check('events','GET',null,trainer,200);events=result.events.filter(e=>e.series_id===created.seriesId)
  assert.ok(events.every(e=>e.title==='Training neue Zeit'&&e.time==='18:30'))
  assert.equal(events.find(e=>e.id===first.id).date,'2026-11-11')
  const removed=events[1]
  await check(`events/${removed.id}`,'DELETE',{version:removed.version},trainer,200)
  await check(`series/${created.seriesId}`,'DELETE',{version:3},trainer,409)
  const race=await Promise.all([req(`series/${created.seriesId}`,'PUT',{...body,title:'Gewinner A',version:4},trainer),req(`series/${created.seriesId}`,'PUT',{...body,title:'Gewinner B',version:4},admin)])
  assert.deepEqual(race.map(r=>r.status).sort(),[200,409])
  const winningTitle=race[0].status===200?'Gewinner A':'Gewinner B'
  result=await check('events','GET',null,trainer,200);events=result.events.filter(e=>e.series_id===created.seriesId)
  assert.equal(events.length,3);assert.ok(events.every(e=>e.title===winningTitle&&e.seriesVersion===5));assert.ok(!result.events.some(e=>e.id===removed.id))
  await mf.dispose();mf=new Miniflare(options)
  result=await check('events','GET',null,trainer,200);assert.equal(result.events.filter(e=>e.series_id===created.seriesId).length,3)
  const deleted=await check(`series/${created.seriesId}`,'DELETE',{version:5},trainer,200)
  assert.equal(deleted.count,3)
  result=await check('events','GET',null,trainer,200)
  assert.equal(result.events.length,1);assert.equal(result.events[0].id,standalone.id)
  // A whole year of daily occurrences is inserted as one SQL query, not hundreds of subrequests.
  const year=await check('series','POST',{...body,date:'2028-01-01',repeatUntil:'2028-12-31',weekdays:[1,2,3,4,5,6,7]},trainer,201)
  assert.equal(year.count,366)
  await check(`series/${year.seriesId}`,'DELETE',{version:1},trainer,200)
  const ah=await check('series','POST',{...body,title:'Training AH',type:'training_ah',weekdays:[3]},trainer,201)
  assert.equal(ah.count,2)
 } finally {await mf.dispose();await rm(dir,{recursive:true,force:true})}
})
