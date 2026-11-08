import { digest, equalSecret, passwordHash, passwordMatches, randomToken } from './passwords.js'

const DAY = 86400000
const userColumns = 'id,email,name,role,disabled'
function fail(status, message) { throw Object.assign(new Error(message), { status }) }
function send(status, body, extra = {}) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin', ...extra } })
}
async function json(request) {
  const reader = request.body?.getReader()
  if (!reader) fail(400, 'Eingabe fehlt.')
  let bytes = 0, text = ''; const decoder = new TextDecoder()
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break
      bytes += value.length
      if (bytes > 16384) { await reader.cancel(); fail(413, 'Eingabe zu groß.') }
      text += decoder.decode(value, { stream: true })
    }
    text += decoder.decode()
  } finally { reader.releaseLock() }
  let result
  try { result = JSON.parse(text) } catch { fail(400, 'Ungültige Eingabe.') }
  if (!result || typeof result !== 'object' || Array.isArray(result)) fail(400, 'Ungültige Eingabe.')
  return result
}
function validPassword(p) { return typeof p === 'string' && p.length >= 12 && p.length <= 128 }
function validIdentity(b) {
  return typeof b.email === 'string' && b.email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email.trim()) && typeof b.name === 'string' && b.name.trim().length > 0 && b.name.length <= 100
}
function validUser(b) { return validIdentity(b) && validPassword(b.password) }
function eventData(b) {
  const fields = ['title','date','time','endTime','place','type']
  if (!fields.every(k => typeof b[k] === 'string' && b[k].length <= (k === 'title' || k === 'place' ? 200 : 20))) fail(400, 'Bitte alle Terminfelder ausfüllen.')
  if (!b.title.trim() || !b.place.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(b.date) || !Number.isFinite(Date.parse(b.date)) || new Date(`${b.date}T12:00:00Z`).toISOString().slice(0,10) !== b.date || ![b.time,b.endTime].every(t => /^([01]\d|2[0-3]):[0-5]\d$/.test(t)) || b.endTime <= b.time || !['training','spiel','sitzung'].includes(b.type)) fail(400, 'Datum und Uhrzeiten prüfen. Das Ende muss nach dem Beginn liegen.')
  return fields.map(k => b[k].trim())
}
function cookie(request, value, seconds) {
  return `sg_session=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`
}
async function rateLimit(db, key, max) {
  const now = Date.now()
  const row = await db.prepare(`INSERT INTO rate_limits(key,count,expires) VALUES(?,1,?)
    ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires<=? THEN 1 ELSE count+1 END,
    expires=CASE WHEN expires<=? THEN excluded.expires ELSE expires END RETURNING count`).bind(key,now+900000,now,now).first()
  if (row.count > max) fail(429, 'Zu viele Versuche. Bitte in 15 Minuten erneut versuchen.')
}
const invitationError = 'Dieser Einladungslink ist ungültig, abgelaufen oder wurde bereits verwendet. Bitte die Vereinsverwaltung um einen neuen Link bitten.'
async function findInvitation(db, token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) fail(410, invitationError)
  const hashed = await digest(token)
  const invitation = await db.prepare(`SELECT i.user_id,i.auth_version,i.expires,u.name,u.email
    FROM invitations i JOIN users u ON u.id=i.user_id
    WHERE i.token_hash=? AND i.expires>? AND u.auth_version=i.auth_version`).bind(hashed,Date.now()).first()
  if (!invitation) fail(410, invitationError)
  return {...invitation, hashed}
}
function invitationResult(request, token, expires) {
  // A fragment stays out of HTTP access logs and referrers. Never persist the raw token.
  return {url:`${new URL(request.url).origin}/#einladung=${token}`,expires}
}
async function handle(request, env) {
  const url = new URL(request.url), path = url.pathname
  if (!path.startsWith('/api/')) return env.ASSETS.fetch(request)
  if (!env.DB || !env.PASSWORD_PEPPER || env.PASSWORD_PEPPER.length < 32) fail(503, 'Der Kalender ist noch nicht vollständig eingerichtet.')
  const db = env.DB.withSession('first-primary')
  if (!['GET','HEAD'].includes(request.method)) {
    if (request.headers.get('Origin') && request.headers.get('Origin') !== url.origin) fail(403, 'Anfrage stammt von einer anderen Website.')
    if (request.headers.get('Sec-Fetch-Site') === 'cross-site') fail(403, 'Anfrage stammt von einer anderen Website.')
    if (request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json') fail(415, 'JSON erforderlich.')
  }
  if (path === '/api/setup' && request.method === 'GET') {
    const row = await db.prepare('SELECT id FROM users LIMIT 1').first()
    return send(200, { available: !row && Boolean(env.SETUP_TOKEN?.length >= 32) })
  }
  if ((path === '/api/login' || path === '/api/setup') && request.method === 'POST') {
    // D1 keeps limits across isolates/redeploys. Hash identifiers before storing them.
    const ip = request.headers.get('CF-Connecting-IP') || 'local'
    await rateLimit(db, `ip:${await digest(ip)}`, 50)
    const b = await json(request)
    const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : ''
    if (email.length > 254) fail(400, 'E-Mail zu lang.')
    await rateLimit(db, `${path}:${await digest(email)}`, 8)
    if (path === '/api/setup') {
      if (!env.SETUP_TOKEN || env.SETUP_TOKEN.length < 32 || typeof b.token !== 'string' || b.token.length > 256 || !(await equalSecret(b.token, env.SETUP_TOKEN))) fail(403, 'Einrichtungscode stimmt nicht.')
      if (!validUser(b)) fail(400, 'Name, gültige E-Mail und Passwort mit 12–128 Zeichen erforderlich.')
      if (await db.prepare('SELECT id FROM users LIMIT 1').first()) fail(409, 'Der Kalender wurde bereits eingerichtet.')
      const hashed = await passwordHash(b.password, env.PASSWORD_PEPPER)
      // A single SQL statement prevents two first administrators from racing.
      const result = await db.prepare("INSERT INTO users(email,name,password,role) SELECT ?,?,?,'admin' WHERE NOT EXISTS(SELECT 1 FROM users)").bind(email,b.name.trim(),hashed).run()
      if (!result.meta.changes) fail(409, 'Der Kalender wurde bereits eingerichtet.')
      return send(201, { ok: true })
    }
    const found = await db.prepare('SELECT * FROM users WHERE email=?').bind(email).first()
    const matches = await passwordMatches(typeof b.password === 'string' && b.password.length <= 128 ? b.password : '', found?.password, env.PASSWORD_PEPPER)
    if (!found || found.disabled || !matches) fail(401, 'E-Mail oder Passwort stimmt nicht.')
    const now = Date.now(), token = randomToken()
    await db.batch([
      db.prepare('DELETE FROM sessions WHERE expires<=?').bind(now),
      db.prepare('DELETE FROM rate_limits WHERE expires<=?').bind(now),
      db.prepare('INSERT INTO sessions(token,user_id,auth_version,expires) VALUES(?,?,?,?)').bind(await digest(token),found.id,found.auth_version,now+DAY)
    ])
    return send(200, { user: { id:found.id,email:found.email,name:found.name,role:found.role } }, { 'Set-Cookie':cookie(request,token,86400) })
  }
  if (['/api/invitations/check','/api/invitations/accept'].includes(path) && request.method === 'POST') {
    await rateLimit(db, `invite-ip:${await digest(request.headers.get('CF-Connecting-IP') || 'local')}`, 60)
    const b = await json(request)
    const invite = await findInvitation(db,b.token)
    if (path === '/api/invitations/check') return send(200,{name:invite.name,email:invite.email,expires:invite.expires})
    if (!validPassword(b.password)) fail(400,'Bitte ein Passwort mit 12–128 Zeichen wählen.')
    const hashed = await passwordHash(b.password,env.PASSWORD_PEPPER)
    // D1 batch is transactional. Revalidate the token, expiry and account version
    // in the UPDATE after hashing, so only one parallel acceptance can succeed.
    const results = await db.batch([
      db.prepare(`UPDATE users SET password=?,disabled=0,auth_version=auth_version+1
        WHERE id=? AND auth_version=? AND EXISTS(
          SELECT 1 FROM invitations WHERE user_id=users.id AND token_hash=? AND expires>?
          AND auth_version=users.auth_version)`).bind(hashed,invite.user_id,invite.auth_version,invite.hashed,Date.now()),
      db.prepare('DELETE FROM sessions WHERE user_id=? AND auth_version!=(SELECT auth_version FROM users WHERE id=?)').bind(invite.user_id,invite.user_id),
      db.prepare('DELETE FROM invitations WHERE token_hash=?').bind(invite.hashed)
    ])
    if (!results[0].meta.changes) fail(410,invitationError)
    return send(200,{ok:true,email:invite.email})
  }
  const rawToken = (request.headers.get('Cookie') || '').split(';').map(s=>s.trim()).find(s=>s.startsWith('sg_session='))?.slice(11) || ''
  const token = await digest(rawToken)
  const user = await db.prepare(`SELECT u.id,u.email,u.name,u.role FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token=? AND s.expires>? AND u.disabled=0 AND u.auth_version=s.auth_version`).bind(token,Date.now()).first()
  if (!user) fail(401, 'Bitte anmelden.')
  if (path === '/api/me' && request.method === 'GET') return send(200,{user})
  if (path === '/api/logout' && request.method === 'POST') {
    await db.prepare('DELETE FROM sessions WHERE token=?').bind(token).run()
    return send(200,{}, { 'Set-Cookie':cookie(request,'',0) })
  }
  if (path === '/api/users') {
    if (user.role !== 'admin') fail(403, 'Nur für die Vereinsverwaltung.')
    if (request.method === 'GET') return send(200, { manageAccounts:true, invitationSupport:true,
      users:(await db.prepare(`SELECT ${userColumns},password='' AS activation_pending,
        (SELECT expires FROM invitations i WHERE i.user_id=users.id AND i.auth_version=users.auth_version) AS invitation_expires
        FROM users ORDER BY name`).all()).results })
    if (request.method === 'POST') {
      const b = await json(request)
      if (!validUser(b)) fail(400, 'Name, gültige E-Mail und Passwort mit 12–128 Zeichen erforderlich.')
      const result = await db.prepare("INSERT INTO users(email,name,password,role) VALUES(?,?,?,'member') ON CONFLICT(email) DO NOTHING").bind(b.email.trim().toLowerCase(),b.name.trim(),await passwordHash(b.password, env.PASSWORD_PEPPER)).run()
      if (!result.meta.changes) fail(409, 'Diese E-Mail ist bereits registriert.')
      return send(201, {ok:true})
    }
  }
  if (path === '/api/invitations' && request.method === 'POST') {
    if (user.role !== 'admin') fail(403,'Nur für die Vereinsverwaltung.')
    const b = await json(request)
    if (!validIdentity(b)) fail(400,'Name und gültige E-Mail erforderlich.')
    const email = b.email.trim().toLowerCase()
    if (await db.prepare('SELECT id FROM users WHERE email=?').bind(email).first()) fail(409,'Diese Person ist bereits angelegt. Bitte bei ihrem Eintrag einen neuen Einladungslink erstellen.')
    const token = randomToken(), expires = Date.now()+7*DAY
    try {
      await db.batch([
        db.prepare("INSERT INTO users(email,name,password,role,disabled) VALUES(?,?,'','member',1)").bind(email,b.name.trim()),
        db.prepare('INSERT INTO invitations(user_id,token_hash,auth_version,expires) SELECT id,?,auth_version,? FROM users WHERE email=?').bind(await digest(token),expires,email)
      ])
    } catch(e) {
      if (String(e.message).includes('UNIQUE constraint failed')) fail(409,'Diese E-Mail ist bereits registriert.')
      throw e
    }
    return send(201,invitationResult(request,token,expires))
  }
  const inviteMatch = path.match(/^\/api\/users\/(\d+)\/invitation$/)
  if (inviteMatch && ['POST','DELETE'].includes(request.method)) {
    if (user.role !== 'admin') fail(403,'Nur für die Vereinsverwaltung.')
    const target = await db.prepare('SELECT id,role,auth_version FROM users WHERE id=?').bind(Number(inviteMatch[1])).first()
    if (!target) fail(404,'Konto nicht gefunden.')
    if (request.method === 'DELETE') {
      await db.prepare('DELETE FROM invitations WHERE user_id=?').bind(target.id).run()
      return send(200,{ok:true})
    }
    const token = randomToken(), expires = Date.now()+7*DAY
    // Reissuing replaces the old link. Existing passwords/sessions stay valid
    // until the person actually sets a new password through the link.
    const result = await db.prepare(`INSERT INTO invitations(user_id,token_hash,auth_version,expires)
      SELECT id,?,auth_version,? FROM users WHERE id=? AND auth_version=?
      ON CONFLICT(user_id) DO UPDATE SET token_hash=excluded.token_hash,
      auth_version=excluded.auth_version,expires=excluded.expires`).bind(await digest(token),expires,target.id,target.auth_version).run()
    if (!result.meta.changes) fail(409,'Konto wurde inzwischen geändert. Bitte erneut versuchen.')
    return send(201,invitationResult(request,token,expires))
  }
  const accountMatch = path.match(/^\/api\/users\/(\d+)$/)
  if (accountMatch && request.method === 'PATCH') {
    if (user.role !== 'admin') fail(403, 'Nur für die Vereinsverwaltung.')
    const id = Number(accountMatch[1]), b = await json(request)
    const target = await db.prepare('SELECT id,role FROM users WHERE id=?').bind(id).first()
    if (!target) fail(404, 'Konto nicht gefunden.')
    // Members are created through this UI. Administrators cannot be disabled here.
    if (b.action === 'disable') {
      if (target.role === 'admin') fail(400, 'Verwaltungskonten können hier nicht gesperrt werden.')
      await db.batch([db.prepare('UPDATE users SET disabled=1,auth_version=auth_version+1 WHERE id=?').bind(id),db.prepare('DELETE FROM invitations WHERE user_id=?').bind(id)])
    } else if (b.action === 'reset-password') {
      if (!validPassword(b.password)) fail(400, 'Passwort muss 12–128 Zeichen haben.')
      await db.batch([db.prepare('UPDATE users SET password=?,disabled=0,auth_version=auth_version+1 WHERE id=?').bind(await passwordHash(b.password,env.PASSWORD_PEPPER),id),db.prepare('DELETE FROM invitations WHERE user_id=?').bind(id)])
    } else fail(400, 'Unbekannte Aktion.')
    await db.prepare('DELETE FROM sessions WHERE user_id=?').bind(id).run()
    return send(200,{ok:true})
  }
  if (path === '/api/events' && request.method === 'GET') {
    const month = url.searchParams.get('month')
    if (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) fail(400, 'Ungültiger Monat.')
    const result = month
      ? await db.prepare('SELECT * FROM events WHERE date>=? AND date<=? ORDER BY date,time,id').bind(`${month}-01`,`${month}-31`).all()
      : await db.prepare('SELECT * FROM events ORDER BY date,time,id').all()
    return send(200,{events:result.results})
  }
  if (path === '/api/events' && request.method === 'POST') {
    const values = eventData(await json(request)), id = randomToken(16)
    await db.prepare('INSERT INTO events(id,title,date,time,endTime,place,type,createdBy) VALUES(?,?,?,?,?,?,?,?)').bind(id,...values,user.name).run()
    return send(201,{id})
  }
  const match = path.match(/^\/api\/events\/([a-f0-9]{32})$/)
  if (match && ['PUT','DELETE'].includes(request.method)) {
    const b = await json(request)
    if (!Number.isInteger(b.version) || b.version < 1) fail(400, 'Terminversion fehlt.')
    const result = request.method === 'DELETE'
      ? await db.prepare('DELETE FROM events WHERE id=? AND version=?').bind(match[1],b.version).run()
      : await db.prepare('UPDATE events SET title=?,date=?,time=?,endTime=?,place=?,type=?,version=version+1 WHERE id=? AND version=?').bind(...eventData(b),match[1],b.version).run()
    if (!result.meta.changes) {
      const existing = await db.prepare('SELECT id FROM events WHERE id=?').bind(match[1]).first()
      fail(existing ? 409 : 404, existing ? 'Der Termin wurde inzwischen geändert. Bitte neu öffnen.' : 'Termin wurde bereits gelöscht.')
    }
    return send(200,{ok:true})
  }
  fail(404, 'Nicht gefunden.')
}
export default {
  async fetch(request, env) {
    try { return await handle(request, env) }
    catch(e) {
      if (!e.status) console.error('Kalenderanfrage fehlgeschlagen:', e.message)
      return send(e.status || 503, {error:e.status ? e.message : 'Der Kalender ist vorübergehend nicht verfügbar. Bitte später erneut versuchen.'})
    }
  }
}
