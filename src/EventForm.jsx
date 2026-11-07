import { useRef, useEffect, useState } from 'react'
import { api } from './api.js'
import { TYPE_LABELS } from './data.js'
export default function EventForm({ event, onClose, onSaved }) {
  const dialog = useRef(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { dialog.current.showModal() }, [])
  async function save(e) {
    e.preventDefault(); setBusy(true); setError('')
    const body = Object.fromEntries(new FormData(e.currentTarget)); if (event.id) body.version = event.version
    try { await api(event.id ? `events/${event.id}` : 'events', event.id ? 'PUT' : 'POST', body); onSaved() }
    catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  return <dialog ref={dialog} onCancel={onClose} aria-labelledby="form-title"><form className="edit-form" onSubmit={save}>
    <h2 id="form-title">{event.id ? 'Termin bearbeiten' : 'Neuer Termin'}</h2>
    <label>Titel<input autoFocus name="title" defaultValue={event.title} required maxLength={200} /></label>
    <label>Datum<input name="date" type="date" defaultValue={event.date} required /></label>
    <div className="form-columns"><label>Beginn<input name="time" type="time" defaultValue={event.time || '17:00'} required /></label><label>Ende<input name="endTime" type="time" defaultValue={event.endTime || '18:30'} required /></label></div>
    <label>Ort<input name="place" defaultValue={event.place} required maxLength={200} /></label>
    <label>Terminart<select name="type" defaultValue={event.type || 'training'}>{Object.entries(TYPE_LABELS).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    {error && <p className="login-error" role="alert">{error}</p>}
    <div className="actions"><button type="button" className="secondary" onClick={onClose} disabled={busy}>Abbrechen</button><button className="btn-primary" disabled={busy}>{busy ? 'Wird gespeichert …' : 'Termin speichern'}</button></div>
  </form></dialog>
}
