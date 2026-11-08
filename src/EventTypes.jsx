import { useEffect, useRef, useState } from 'react'
import { api } from './api.js'
import { typeStyle } from './data.js'

export default function EventTypes({ types, onClose, onChanged }) {
  const dialog = useRef(null)
  const [items,setItems] = useState(types)
  const [editing,setEditing] = useState(null)
  const [error,setError] = useState('')
  const [message,setMessage] = useState('')
  const [busy,setBusy] = useState(false)
  useEffect(() => { dialog.current.showModal() }, [])
  async function reload() { const r = await api('event-types'); setItems(r.eventTypes); onChanged() }
  async function save(e) {
    e.preventDefault(); const form=e.currentTarget, body=Object.fromEntries(new FormData(form))
    setBusy(true); setError(''); setMessage('')
    try {
      await api(editing ? `event-types/${editing.id}` : 'event-types', editing ? 'PUT' : 'POST', {
        ...body,...(editing ? {version:editing.version,enabled:Boolean(editing.enabled)} : {})
      })
      setMessage(editing ? 'Terminart geändert. Bestehende Termine verwenden den neuen Namen und die neue Farbe.' : 'Terminart angelegt. Sie steht jetzt beim Erstellen eines Termins zur Auswahl.')
      setEditing(null); form.reset(); await reload()
    } catch(e) { setError(e.message); await reload().catch(()=>{}) } finally { setBusy(false) }
  }
  async function toggle(item) {
    setBusy(true); setError(''); setMessage('')
    try {
      await api(`event-types/${item.id}`,'PUT',{name:item.name,color:item.color,enabled:!item.enabled,version:item.version})
      setEditing(null); setMessage(item.enabled ? 'Terminart ausgeblendet. Bestehende Termine bleiben erhalten.' : 'Terminart wieder verfügbar.')
      await reload()
    } catch(e) { setError(e.message); await reload().catch(()=>{}) } finally { setBusy(false) }
  }
  return <dialog ref={dialog} onCancel={onClose} aria-labelledby="types-title"><div className="edit-form">
    <h2 id="types-title">Terminarten verwalten</h2>
    <p>Lege eigene Terminarten mit Namen und Farbe an. Ausgeblendete Arten bleiben bei bestehenden Terminen erhalten.</p>
    {error && <p className="login-error" role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    <form key={editing?.id || 'new'} className="edit-form" onSubmit={save}>
      <h3>{editing ? 'Terminart bearbeiten' : 'Neue Terminart'}</h3>
      <label>Name der Terminart<input name="name" required maxLength={60} defaultValue={editing?.name || ''} placeholder="Zum Beispiel Turnier oder Vereinsfest" /></label>
      <label>Farbe<input name="color" type="color" defaultValue={editing?.color || '#6b46a0'} /></label>
      <div className="actions"><button className="btn-primary" disabled={busy}>{editing ? 'Änderungen speichern' : 'Terminart anlegen'}</button>{editing && <button type="button" className="secondary" disabled={busy} onClick={()=>setEditing(null)}>Abbrechen</button>}</div>
    </form>
    <ul className="member-list">{items.map(item=><li key={item.id}>
      <span className="legend-item" style={typeStyle(item)}>{item.name}</span>{!item.enabled && <span> · ausgeblendet</span>}
      <div className="actions"><button className="secondary" disabled={busy} onClick={()=>{setEditing(item);setError('');setMessage('')}}>Bearbeiten</button><button className="secondary" disabled={busy} onClick={()=>toggle(item)}>{item.enabled ? 'Ausblenden' : 'Wieder anzeigen'}</button></div>
    </li>)}</ul>
    <button type="button" className="secondary" disabled={busy} onClick={onClose}>Schließen</button>
  </div></dialog>
}
