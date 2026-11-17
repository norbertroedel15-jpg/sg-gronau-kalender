const authority='https://login.microsoftonline.com/consumers/oauth2/v2.0'
const scopes='offline_access User.Read Mail.Send'
const fail=(status,message)=>{throw Object.assign(new Error(message),{status})}
const reply=(body)=>Response.json(body,{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}})
const enc=new TextEncoder(),dec=new TextDecoder()
async function key(pepper){
  const material=await crypto.subtle.importKey('raw',enc.encode(pepper),'HKDF',false,['deriveKey'])
  return crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:enc.encode('sg-gronau-outlook-v1'),info:enc.encode('mail-token-storage')},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt'])
}
export async function seal(value,pepper){const iv=crypto.getRandomValues(new Uint8Array(12));const cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(pepper),enc.encode(JSON.stringify(value))));return btoa(String.fromCharCode(...iv,...cipher))}
export async function unseal(value,pepper){try{const bytes=Uint8Array.from(atob(value),c=>c.charCodeAt(0));return JSON.parse(dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.slice(0,12)},await key(pepper),bytes.slice(12))))}catch{fail(503,'Die Outlook-Verbindung muss erneut hergestellt werden.')}}
async function oauth(path,body){
  try {const r=await fetch(`${authority}/${path}`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(body),signal:AbortSignal.timeout(15000)});const data=await r.json();return {ok:r.ok,data}}
  catch{fail(503,'Microsoft ist gerade nicht erreichbar. Bitte später erneut versuchen.')}
}
async function graph(path,token,options={}){
  try{return await fetch(`https://graph.microsoft.com/v1.0${path}`,{...options,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(15000)})}
  catch{fail(503,'Microsoft ist gerade nicht erreichbar. Der Versandstatus ist unklar; bitte vor erneutem Senden in Outlook unter „Gesendet“ prüfen.')}
}
async function connection(db,id){return db.prepare('SELECT * FROM outlook_connections WHERE admin_id=?').bind(id).first()}
async function access(db,env,c){
  if(!c?.encrypted_tokens||c.address!==c.sender)fail(409,'Bitte zuerst dein Outlook-Konto verbinden.')
  let tokens=await unseal(c.encrypted_tokens,env.PASSWORD_PEPPER)
  if(c.expires>Date.now()+60000)return tokens.access_token
  const r=await oauth('token',{client_id:c.client_id,grant_type:'refresh_token',refresh_token:tokens.refresh_token,scope:scopes})
  if(!r.ok||!r.data.access_token)fail(409,'Microsoft verlangt eine erneute Anmeldung. Bitte Outlook neu verbinden.')
  tokens={access_token:r.data.access_token,refresh_token:r.data.refresh_token||tokens.refresh_token}
  const result=await db.prepare('UPDATE outlook_connections SET encrypted_tokens=?,expires=? WHERE admin_id=? AND version=?').bind(await seal(tokens,env.PASSWORD_PEPPER),Date.now()+Number(r.data.expires_in||3600)*1000,c.admin_id,c.version).run()
  if(!result.meta.changes)fail(409,'Die Outlook-Verbindung wurde geändert. Bitte neu laden.')
  return tokens.access_token
}
export async function outlookRoute(request,env,db,user,url,{json,rateLimit,digest}){
  const path=url.pathname
  if(!path.startsWith('/api/outlook/')&&path!=='/api/invitation-mail')return null
  if(user.role!=='admin')fail(403,'Nur für die Vereinsverwaltung.')
  const c=await connection(db,user.id)
  if(path==='/api/outlook/status'&&request.method==='GET')return reply({sender:c?.sender||'',clientId:c?.client_id||'',connected:Boolean(c?.encrypted_tokens&&c.address===c.sender)})
  if(path==='/api/outlook/config'&&request.method==='PUT'){
    const b=await json(request)
    if(typeof b.clientId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(b.clientId.trim()))fail(400,'Bitte die Anwendungs-ID deiner eigenen Microsoft-App eingeben.')
    if(typeof b.sender!=='string'||b.sender.length>254||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.sender.trim()))fail(400,'Bitte deine Outlook-Absenderadresse eingeben.')
    const sender=b.sender.trim().toLowerCase()
    const id=b.clientId.trim().toLowerCase()
    if(c?.client_id===id&&c.sender===sender)return reply({ok:true})
    await db.batch([db.prepare(`INSERT INTO outlook_connections(admin_id,client_id,sender) VALUES(?,?,?) ON CONFLICT(admin_id) DO UPDATE SET client_id=excluded.client_id,sender=excluded.sender,encrypted_tokens=NULL,expires=NULL,address=NULL,version=version+1`).bind(user.id,id,sender),db.prepare('DELETE FROM outlook_device_codes WHERE admin_id=?').bind(user.id)])
    return reply({ok:true})
  }
  if(path==='/api/outlook/connect'&&request.method==='POST'){
    if(!c)fail(409,'Zuerst die Anwendungs-ID deiner Microsoft-App speichern.')
    await rateLimit(db,`outlook-connect:${user.id}`,10)
    const r=await oauth('devicecode',{client_id:c.client_id,scope:scopes})
    if(!r.ok||!r.data.device_code||!r.data.user_code)fail(400,'Microsoft hat die Anmeldung abgelehnt. Bitte App-ID, persönliche Microsoft-Konten und öffentliche Clientflows in der App-Registrierung prüfen.')
    const interval=Math.max(5,Number(r.data.interval||5)),expires=Date.now()+Number(r.data.expires_in||900)*1000
    await db.prepare(`INSERT INTO outlook_device_codes(admin_id,encrypted_code,expires,next_poll,interval_seconds,connection_version) VALUES(?,?,?,?,?,?) ON CONFLICT(admin_id) DO UPDATE SET encrypted_code=excluded.encrypted_code,expires=excluded.expires,next_poll=excluded.next_poll,interval_seconds=excluded.interval_seconds,connection_version=excluded.connection_version`).bind(user.id,await seal(r.data.device_code,env.PASSWORD_PEPPER),expires,Date.now()+interval*1000,interval,c.version).run()
    return reply({userCode:r.data.user_code,verificationUri:'https://microsoft.com/devicelogin',expires,interval})
  }
  if(path==='/api/outlook/poll'&&request.method==='POST'){
    const d=await db.prepare('SELECT * FROM outlook_device_codes WHERE admin_id=?').bind(user.id).first()
    if(!d||!c||d.expires<Date.now()||d.connection_version!==c.version)fail(410,'Anmeldung abgelaufen oder geändert. Bitte Outlook erneut verbinden.')
    if(d.next_poll>Date.now())return reply({pending:true})
    const claim=await db.prepare('UPDATE outlook_device_codes SET next_poll=? WHERE admin_id=? AND next_poll=?').bind(Date.now()+d.interval_seconds*1000,user.id,d.next_poll).run()
    if(!claim.meta.changes)return reply({pending:true})
    const r=await oauth('token',{client_id:c.client_id,grant_type:'urn:ietf:params:oauth:grant-type:device_code',device_code:await unseal(d.encrypted_code,env.PASSWORD_PEPPER)})
    if(!r.ok){
      if(['authorization_pending','slow_down'].includes(r.data.error)){
        if(r.data.error==='slow_down')await db.prepare('UPDATE outlook_device_codes SET interval_seconds=interval_seconds+5,next_poll=? WHERE admin_id=?').bind(Date.now()+(d.interval_seconds+5)*1000,user.id).run()
        return reply({pending:true})
      }
      await db.prepare('DELETE FROM outlook_device_codes WHERE admin_id=?').bind(user.id).run()
      fail(400,'Microsoft-Anmeldung nicht abgeschlossen. Bitte erneut verbinden.')
    }
    if(!r.data.access_token||!r.data.refresh_token)fail(400,'Die Microsoft-Freigabe ist unvollständig. Bitte erneut verbinden.')
    const profile=await graph('/me?$select=mail,userPrincipalName',r.data.access_token)
    if(!profile.ok)fail(400,'Das angemeldete Microsoft-Konto konnte nicht geprüft werden.')
    const p=await profile.json()
    if((p.mail||p.userPrincipalName||'').toLowerCase()!==c.sender){await db.prepare('DELETE FROM outlook_device_codes WHERE admin_id=?').bind(user.id).run();fail(400,`Bitte mit ${c.sender} anmelden. Das ausgewählte Konto passt nicht zur Absenderadresse.`)}
    const result=await db.batch([db.prepare('UPDATE outlook_connections SET encrypted_tokens=?,expires=?,address=?,version=version+1 WHERE admin_id=? AND version=?').bind(await seal({access_token:r.data.access_token,refresh_token:r.data.refresh_token},env.PASSWORD_PEPPER),Date.now()+Number(r.data.expires_in||3600)*1000,c.sender,user.id,c.version),db.prepare('DELETE FROM outlook_device_codes WHERE admin_id=? AND connection_version=?').bind(user.id,c.version)])
    if(!result[0].meta.changes)fail(409,'Die Einrichtung wurde geändert. Bitte erneut verbinden.')
    return reply({connected:true,sender:c.sender})
  }
  if(path==='/api/outlook/disconnect'&&request.method==='POST'){
    await db.batch([db.prepare('DELETE FROM outlook_connections WHERE admin_id=?').bind(user.id),db.prepare('DELETE FROM outlook_device_codes WHERE admin_id=?').bind(user.id)])
    return reply({ok:true})
  }
  if(path==='/api/invitation-mail'&&request.method==='POST'){
    const b=await json(request);let inviteUrl
    try{inviteUrl=new URL(b.url)}catch{fail(400,'Ungültiger Einladungslink.')}
    const token=new URLSearchParams(inviteUrl.hash.slice(1)).get('einladung')
    if(inviteUrl.origin!==url.origin||inviteUrl.pathname!=='/'||!token||!/^[a-f0-9]{64}$/.test(token))fail(400,'Ungültiger Einladungslink.')
    const recipient=await db.prepare(`SELECT u.name,u.email,i.expires FROM invitations i JOIN users u ON u.id=i.user_id WHERE i.token_hash=? AND i.expires>? AND i.auth_version=u.auth_version`).bind(await digest(token),Date.now()).first()
    if(!recipient)fail(410,'Der Einladungslink ist ungültig oder abgelaufen. Bitte neu erstellen.')
    await rateLimit(db,`invitation-mail:${user.id}`,20)
    const bearer=await access(db,env,c)
    const body=`Hallo ${recipient.name},\n\ndu bist zum Terminkalender der SG Gronau, Abteilung Fußball, eingeladen.\n\nÖffne diesen persönlichen Link und lege dein eigenes Kennwort fest:\n${inviteUrl.href}\n\nDer Link gilt bis ${new Date(recipient.expires).toLocaleString('de-DE',{timeZone:'Europe/Berlin'})} und kann einmal verwendet werden. Bitte nicht weitergeben.\n\nViele Grüße\n${user.name}\nSG Gronau · Abteilung Fußball`
    const response=await graph('/me/sendMail',bearer,{method:'POST',body:JSON.stringify({message:{subject:'Deine Einladung zum Terminkalender SG Gronau',body:{contentType:'Text',content:body},toRecipients:[{emailAddress:{address:recipient.email}}]},saveToSentItems:true})})
    if(!response.ok)fail(502,'Microsoft hat die E-Mail nicht angenommen. Bitte die Outlook-Verbindung prüfen. Der Einladungslink bleibt gültig.')
    return reply({accepted:true,recipient:recipient.email})
  }
  fail(405,'Methode nicht erlaubt.')
}
