import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api.js'

const teams=['1. Mannschaft','AH','Bambini','F-Jugend','E-Jugend','D-Jugend','C-Jugend','Damen','Vorstand']
export default function Contacts({ user, onClose }) {
  const dialog=useRef(null)
  const [contacts,setContacts]=useState([])
  const [loading,setLoading]=useState(true)
  const [search,setSearch]=useState('')
  const [editing,setEditing]=useState(null)
  const [removing,setRemoving]=useState(null)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [busy,setBusy]=useState(false)
  const formRef=useRef(null)
  const load=useCallback(async()=>{
    const result=await api('contacts');setContacts(result.contacts);setLoading(false)
  },[])
  useEffect(()=>{
    dialog.current.showModal();let active=true
    api('contacts').then(r=>{if(active)setContacts(r.contacts)}).catch(e=>{if(active)setError(e.message)}).finally(()=>{if(active)setLoading(false)})
    return ()=>{active=false}
  },[])
  useEffect(()=>{if(editing)formRef.current?.scrollIntoView({block:'nearest'})},[editing])
  const own=contacts.find(c=>c.user_id===user.id)
  const needle=search.trim().toLocaleLowerCase('de-DE')
  const visible=contacts.filter(c=>[c.name,c.team,c.position,c.phone,c.email].some(value=>value.toLocaleLowerCase('de-DE').includes(needle)))
  function edit(contact) {setEditing(contact);setRemoving(null);setError('');setNotice('')}
  async function save(e) {
    e.preventDefault();setBusy(true);setError('');setNotice('')
    const body=Object.fromEntries(new FormData(e.currentTarget))
    try {
      await api(`contacts/${editing.user_id===user.id ? 'me' : editing.user_id}`,'PUT',{...body,version:editing.version,shared:body.shared==='on'})
      setEditing(null);await load();setNotice('Kontakteintrag gespeichert. Er ist für angemeldete Mitglieder sichtbar.')
    } catch(e) {setError(e.message);await load().catch(()=>{})} finally {setBusy(false)}
  }
  async function remove() {
    setBusy(true);setError('');setNotice('')
    try {
      await api(`contacts/${removing.user_id===user.id ? 'me' : removing.user_id}`,'DELETE',{version:removing.version})
      setRemoving(null);await load();setNotice('Kontakteintrag entfernt. Der Kalenderzugang bleibt bestehen.')
    } catch(e) {setError(e.message);await load().catch(()=>{})} finally {setBusy(false)}
  }
  return <dialog className="contacts-dialog" ref={dialog} onCancel={onClose} aria-labelledby="contacts-title"><div className="edit-form">
    <div className="contacts-heading"><h2 id="contacts-title">Kontaktbuch</h2><button type="button" className="secondary" disabled={busy} onClick={onClose}>Schließen</button></div>
    <p>Internes Kontaktbuch für freigeschaltete Mitglieder. Du entscheidest, welche Angaben du einträgst. Telefonnummer und E-Mail sind freiwillig.</p>
    <div className="actions"><button type="button" className="btn-primary" disabled={loading||busy} onClick={()=>edit(own || {user_id:user.id,name:user.name,team:'',position:'',phone:'',email:'',version:0})}>{own ? 'Meinen Eintrag bearbeiten' : 'Meinen Eintrag anlegen'}</button><button type="button" className="secondary" disabled={busy} onClick={()=>load().catch(e=>setError(e.message))}>Kontakte aktualisieren</button></div>
    {error && <p className="login-error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {loading && <p role="status">Kontakte werden geladen …</p>}
    {editing && <form ref={formRef} key={`${editing.user_id}-${editing.version}`} className="edit-form contact-editor" onSubmit={save}>
      <h3>{editing.user_id===user.id ? 'Mein Kontakteintrag' : `Eintrag bearbeiten: ${editing.name}`}</h3>
      <label>Name<input name="name" required maxLength={100} defaultValue={editing.name} autoComplete="name" /></label>
      <div className="form-columns"><label>Mannschaft / Bereich<input name="team" list="contact-teams" maxLength={100} defaultValue={editing.team} /><datalist id="contact-teams">{teams.map(t=><option key={t} value={t} />)}</datalist></label><label>Funktion<input name="position" maxLength={100} defaultValue={editing.position} placeholder="Zum Beispiel Trainer oder Betreuer" /></label></div>
      <div className="form-columns"><label>Telefonnummer (freiwillig)<input name="phone" type="tel" maxLength={50} defaultValue={editing.phone} autoComplete="tel" /></label><label>E-Mail (freiwillig)<input name="email" type="email" maxLength={254} defaultValue={editing.email} autoComplete="email" /></label></div>
      <label className="check-label"><input name="shared" type="checkbox" required defaultChecked={editing.version>0} /> Diese Angaben dürfen im internen Kontaktbuch für angemeldete Mitglieder sichtbar sein.</label>
      <p>Deine Anmelde-E-Mail wird nicht automatisch übernommen. Du kannst deinen Eintrag jederzeit bearbeiten oder entfernen.</p>
      <div className="actions"><button className="btn-primary" disabled={busy}>Eintrag speichern</button><button type="button" className="secondary" disabled={busy} onClick={()=>setEditing(null)}>Abbrechen</button></div>
    </form>}
    {removing && <section className="contact-editor" aria-label="Kontakteintrag entfernen"><p>Den Kontakteintrag von <strong>{removing.name}</strong> entfernen? Der Kalenderzugang und die Termine bleiben erhalten.</p><div className="actions"><button type="button" className="secondary danger" disabled={busy} onClick={remove}>Eintrag endgültig entfernen</button><button type="button" className="secondary" disabled={busy} onClick={()=>setRemoving(null)}>Abbrechen</button></div></section>}
    <label>Kontakte durchsuchen<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Name, Mannschaft oder Funktion" /></label>
    {!loading && !contacts.length && <p>Noch keine Kontakte eingetragen. Mit „Meinen Eintrag anlegen“ kannst du den Anfang machen.</p>}
    {!loading && contacts.length>0 && !visible.length && <p>Keine passenden Kontakte gefunden.</p>}
    <div className="contact-grid">{visible.map(c=><article className="contact-card" key={c.user_id}>
      <h3>{c.name}{c.user_id===user.id ? ' (ich)' : ''}</h3>
      {c.team && <p><strong>{c.team}</strong></p>}{c.position && <p>{c.position}</p>}
      {c.phone && <p><a href={`tel:${c.phone.replace(/[^+0-9]/g,'')}`}>{c.phone}</a></p>}
      {c.email && <p><a href={`mailto:${encodeURIComponent(c.email)}`}>{c.email}</a></p>}
      {(c.user_id===user.id || user.role==='admin') && <div className="actions"><button type="button" className="secondary" disabled={busy} onClick={()=>edit(c)}>Bearbeiten</button><button type="button" className="secondary danger" disabled={busy} onClick={()=>{setRemoving(c);setEditing(null);setError('');setNotice('')}}>Entfernen</button></div>}
    </article>)}</div>
  </div></dialog>
}
