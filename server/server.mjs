import http from 'node:http'
import { DatabaseSync } from 'node:sqlite'
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto'
import { mkdirSync, readFileSync, existsSync } from 'node:fs'
import { resolve, extname, dirname } from 'node:path'

const dbPath = resolve(process.env.DB_PATH || 'data/calendar.sqlite')
mkdirSync(dirname(dbPath), { recursive: true, mode: 0o700 })
const db = new DatabaseSync(dbPath)
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id INTEGER REFERENCES users(id), expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY, title TEXT NOT NULL, date TEXT NOT NULL, time TEXT NOT NULL, endTime TEXT NOT NULL, place TEXT NOT NULL, type TEXT NOT NULL, createdBy TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1);`)
const hash = value => createHash('sha256').update(value).digest('hex')
function passwordHash(value) { const salt = randomBytes(16).toString('hex'); return `${salt}:${scryptSync(value, salt, 64).toString('hex')}` }
function passwordMatches(value, stored) { const [salt, digest] = stored.split(':'); return timingSafeEqual(scryptSync(value, salt, 64), Buffer.from(digest, 'hex')) }
function validUser(body) { return typeof body.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email) && body.email.length <= 254 && typeof body.name === 'string' && body.name.trim().length > 0 && body.name.length <= 100 && typeof body.password === 'string' && body.password.length >= 12 && body.password.length <= 128 }
if (process.argv.includes('--create-admin')) {
 const body = { email: process.env.ADMIN_EMAIL, name: process.env.ADMIN_NAME || 'Vereinsverwaltung', password: process.env.ADMIN_PASSWORD }
 if (!validUser(body)) throw new Error('ADMIN_EMAIL und ADMIN_PASSWORD (12–128 Zeichen) setzen.')
 db.prepare('INSERT INTO users(email,name,password,role) VALUES(?,?,?,?)').run(body.email.trim().toLowerCase(), body.name.trim(), passwordHash(body.password), 'admin')
 console.log('Verwaltungskonto angelegt.'); db.close(); process.exit(0)
}
if (process.argv.includes('--reset-password')) {
 const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase()
 const password = process.env.ADMIN_PASSWORD || ''
 if (password.length < 12 || password.length > 128) throw new Error('Passwort muss 12–128 Zeichen haben.')
 const user = db.prepare('SELECT id FROM users WHERE email=?').get(email)
 if (!user) throw new Error('Konto nicht gefunden.')
 db.prepare('UPDATE users SET password=? WHERE id=?').run(passwordHash(password), user.id)
 db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id)
 console.log('Passwort erneuert und Sitzungen beendet.'); db.close(); process.exit(0)
}
if (process.argv.includes('--disable-user')) {
 const user = db.prepare('SELECT id,role FROM users WHERE email=?').get(String(process.env.ACCOUNT_EMAIL || '').trim().toLowerCase())
 if (!user) throw new Error('Konto nicht gefunden.')
 if (user.role === 'admin' && db.prepare("SELECT count(*) AS n FROM users WHERE role='admin' AND password!='disabled'").get().n <= 1) throw new Error('Letztes Verwaltungskonto kann nicht gesperrt werden.')
 db.prepare("UPDATE users SET password='disabled' WHERE id=?").run(user.id)
 db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id)
 console.log('Konto gesperrt.'); db.close(); process.exit(0)
}
const failures = new Map()
const cookieName = 'sg_session'
const secure = process.env.NODE_ENV === 'production'
const sessionCookie = (value, age) => `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure ? '; Secure' : ''}`
function send(res, status, body, headers = {}) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }); res.end(JSON.stringify(body)) }
function fail(status, message) { throw Object.assign(new Error(message), { status }) }
async function json(req) { let data = ''; for await (const chunk of req) { data += chunk; if (Buffer.byteLength(data) > 16384) fail(413, 'Eingabe zu groß.') } try { return JSON.parse(data) } catch { fail(400, 'Ungültige Eingabe.') } }
function eventData(b) {
 const fields = ['title','date','time','endTime','place','type']
 if (!fields.every(k => typeof b[k] === 'string' && b[k].length <= (k === 'title' || k === 'place' ? 200 : 20))) fail(400, 'Bitte alle Terminfelder ausfüllen.')
 if (!b.title.trim() || !b.place.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(b.date) || !Number.isFinite(Date.parse(b.date)) || new Date(`${b.date}T12:00:00Z`).toISOString().slice(0,10) !== b.date || ![b.time,b.endTime].every(t => /^([01]\d|2[0-3]):[0-5]\d$/.test(t)) || b.endTime <= b.time || !['training','spiel','sitzung'].includes(b.type)) fail(400, 'Datum und Uhrzeiten prüfen. Das Ende muss nach dem Beginn liegen.')
 return fields.map(k => b[k].trim())
}
const server = http.createServer(async (req,res) => {
 res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('X-Frame-Options','DENY'); res.setHeader('Referrer-Policy','same-origin')
 try {
 const url = new URL(req.url, 'http://localhost'); const path = url.pathname
 if (!path.startsWith('/api/')) {
  if (!['GET','HEAD'].includes(req.method)) return send(res,405,{error:'Nicht erlaubt.'})
  const base = resolve('dist'); let file = resolve(base, `.${decodeURIComponent(path)}`)
  if (!file.startsWith(base + '/') && file !== base) fail(403,'Nicht erlaubt.')
  if (!extname(file) || path === '/') file = resolve(base,'index.html')
  if (!existsSync(file)) fail(404,'Datei nicht gefunden. Zuerst npm run build ausführen.')
  const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'}
  res.writeHead(200,{'Content-Type':types[extname(file)] || 'application/octet-stream'}); res.end(req.method === 'HEAD' ? undefined : readFileSync(file)); return
 }
 if (!['GET','HEAD'].includes(req.method)) {
  const origin = req.headers.origin
  if (origin && origin !== (process.env.APP_ORIGIN || `http://${req.headers.host}`)) fail(403,'Anfrage stammt von einer anderen Website.')
  if (req.headers['content-type'] !== 'application/json') fail(415,'JSON erforderlich.')
 }
 const rawToken = (req.headers.cookie || '').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1) || ''
 const user = db.prepare('SELECT u.id,u.email,u.name,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>?').get(hash(rawToken), Date.now())
 if (path === '/api/login' && req.method === 'POST') {
  const b = await json(req); const email = String(b.email || '').trim().toLowerCase(); const key = `${req.socket.remoteAddress}:${email}`; const now = Date.now()
  for (const [k,v] of failures) if (v.until < now) failures.delete(k)
  const attempt = failures.get(key) || { count:0, until:now+900000 }
  if (attempt.count >= 8) fail(429,'Zu viele Versuche. Bitte in 15 Minuten erneut versuchen.')
  const found = db.prepare('SELECT * FROM users WHERE email=?').get(email)
  const dummy = '00000000000000000000000000000000:' + '00'.repeat(64)
  const matches = typeof b.password === 'string' && b.password.length <= 128 && passwordMatches(b.password, found?.password && found.password !== 'disabled' ? found.password : dummy)
  if (!found || found.password === 'disabled' || !matches) { attempt.count++; failures.set(key,attempt); fail(401,'E-Mail oder Passwort stimmt nicht.') }
  failures.delete(key); db.prepare('DELETE FROM sessions WHERE expires<?').run(now)
  const token = randomBytes(32).toString('hex'); db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(token),found.id,now+86400000)
  return send(res,200,{user:{id:found.id,email:found.email,name:found.name,role:found.role}}, {'Set-Cookie':sessionCookie(token,86400)})
 }
 if (!user) fail(401,'Bitte anmelden.')
 if (path === '/api/me' && req.method === 'GET') return send(res,200,{user})
 if (path === '/api/logout' && req.method === 'POST') { db.prepare('DELETE FROM sessions WHERE token=?').run(hash(rawToken)); return send(res,200,{}, {'Set-Cookie':sessionCookie('',0)}) }
 if (path === '/api/users') {
  if (user.role !== 'admin') fail(403,'Nur für die Vereinsverwaltung.')
  if (req.method === 'GET') return send(res,200,{users:db.prepare('SELECT id,email,name,role FROM users ORDER BY name').all()})
  if (req.method === 'POST') { const b = await json(req); if (!validUser(b)) fail(400,'Name, gültige E-Mail und Passwort mit 12–128 Zeichen erforderlich.');
   if (db.prepare('SELECT id FROM users WHERE email=?').get(b.email.trim().toLowerCase())) fail(409,'Diese E-Mail ist bereits registriert.')
   db.prepare('INSERT INTO users(email,name,password,role) VALUES(?,?,?,?)').run(b.email.trim().toLowerCase(),b.name.trim(),passwordHash(b.password),'member'); return send(res,201,{ok:true}) }
 }
 if (path === '/api/events' && req.method === 'GET') return send(res,200,{events:db.prepare('SELECT * FROM events ORDER BY date,time,id').all()})
 if (path === '/api/events' && req.method === 'POST') { const values = eventData(await json(req)); const id = randomBytes(16).toString('hex'); db.prepare('INSERT INTO events(id,title,date,time,endTime,place,type,createdBy) VALUES(?,?,?,?,?,?,?,?)').run(id,...values,user.name); return send(res,201,{id}) }
 const match = path.match(/^\/api\/events\/([a-f0-9]{32})$/)
 if (match && ['PUT','DELETE'].includes(req.method)) {
  const b = await json(req); if (!Number.isInteger(b.version)) fail(400,'Terminversion fehlt.')
  const old = db.prepare('SELECT * FROM events WHERE id=?').get(match[1]); if (!old) fail(404,'Termin wurde bereits gelöscht.'); if (old.version !== b.version) fail(409,'Der Termin wurde inzwischen geändert. Bitte neu öffnen.')
  if (req.method === 'DELETE') db.prepare('DELETE FROM events WHERE id=?').run(match[1])
  else db.prepare('UPDATE events SET title=?,date=?,time=?,endTime=?,place=?,type=?,version=version+1 WHERE id=?').run(...eventData(b),match[1])
  return send(res,200,{ok:true})
 }
 fail(404,'Nicht gefunden.')
 } catch(e) { if (!e.status) console.error(e); send(res,e.status || 500,{error:e.status ? e.message : 'Speichern fehlgeschlagen. Bitte erneut versuchen.'}) }
})
server.listen(Number(process.env.PORT || 3000),process.env.HOST || '127.0.0.1',()=>console.log(`Vereinskalender auf Port ${server.address().port}`))
