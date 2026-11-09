import { useRef, useEffect, useState } from 'react'
import { api } from './api.js'
import { DEFAULT_EVENT_TYPES, WEEKDAYS } from './data.js'
import { addDays, weeklyDates } from '../shared/recurrence.js'

function defaults(type) {
  try {
    if (type?.default_weekdays) return JSON.parse(type.default_weekdays)
    if (/training.*1\.\s*mannschaft/i.test(type?.name || '')) return [2,4]
    if (/training.*\bAH\b/i.test(type?.name || '')) return [3]
    return []
  } catch { return [] }
}
export default function EventForm({ event, onClose, onSaved, types = DEFAULT_EVENT_TYPES, recurringSupport = false }) {
  const dialog = useRef(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [repeat,setRepeat] = useState(Boolean(event.makeSeries && recurringSupport))
  const [scope,setScope] = useState('single')
  const [date,setDate] = useState(event.date)
  const [until,setUntil] = useState(addDays(event.date,90))
  const [type,setType] = useState(event.type || types.find(t=>t.enabled)?.id)
  const [days,setDays] = useState(defaults(types.find(t=>t.id===event.type)))
  useEffect(() => { dialog.current.showModal() }, [])
  let preview=''
  if (repeat) {
    try { const dates=weeklyDates(date,until,days); preview=`${dates.length} Termine, wöchentlich vom ${dates[0].split('-').reverse().join('.')} bis ${dates.at(-1).split('-').reverse().join('.')}.` }
    catch(e) { preview=e.message }
  }
  async function save(e) {
    e.preventDefault(); setError('')
    if (repeat && !event.id) {
      try { weeklyDates(date,until,days) } catch(e) { setError(e.message); return }
    }
    setBusy(true)
    const body = Object.fromEntries(new FormData(e.currentTarget))
    let path='events',method='POST'
    if (event.id && scope==='series') {
      path=`series/${event.series_id}`; method='PUT'; body.version=event.seriesVersion
    } else if (event.id) { path=`events/${event.id}`;method='PUT';body.version=event.version }
    else if (repeat) { path='series';body.repeatUntil=until;body.weekdays=days }
    try { const result=await api(path,method,body); onSaved(result) }
    catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  return <dialog ref={dialog} onCancel={onClose} aria-labelledby="form-title"><form className="edit-form" onSubmit={save}>
    <h2 id="form-title">{event.id ? 'Termin bearbeiten' : repeat ? 'Neue Terminserie' : 'Neuer Termin'}</h2>
    {event.series_id && <label>Änderung anwenden auf<select value={scope} onChange={e=>setScope(e.target.value)}><option value="single">Nur diesen Termin</option><option value="series">Alle vorhandenen Termine dieser Serie</option></select></label>}
    {scope==='series' && <p>Ändert Titel, Uhrzeit, Ort und Terminart für alle noch vorhandenen Termine der Serie, auch einzeln bearbeitete. Datum und Wochentage bleiben erhalten; gelöschte Termine werden nicht neu angelegt.</p>}
    <label>Titel<input autoFocus name="title" defaultValue={event.title} required maxLength={200} /></label>
    {scope!=='series' && <label>{repeat ? 'Startdatum' : 'Datum'}<input name="date" type="date" value={date} onChange={e=>{setDate(e.target.value);if(until<e.target.value)setUntil(addDays(e.target.value,90))}} required /></label>}
    <div className="form-columns"><label>Beginn<input name="time" type="time" defaultValue={event.time || (event.makeSeries ? '' : '17:00')} required /></label><label>Ende<input name="endTime" type="time" defaultValue={event.endTime || (event.makeSeries ? '' : '18:30')} required /></label></div>
    <label>Ort<input name="place" defaultValue={event.place} required maxLength={200} /></label>
    <label>Terminart<select name="type" value={type} onChange={e=>{setType(e.target.value);if(!event.id)setDays(defaults(types.find(t=>t.id===e.target.value)))}}>{types.filter(t=>t.enabled || t.id===event.type).map(t => <option key={t.id} value={t.id}>{t.name}{t.enabled ? '' : ' (ausgeblendet)'}</option>)}</select></label>
    {!event.id && recurringSupport && <label className="check-label"><input type="checkbox" checked={repeat} onChange={e=>setRepeat(e.target.checked)} /> Wöchentlich wiederholen</label>}
    {!event.id && repeat && <fieldset className="repeat-fields"><legend>Wöchentliche Wiederholung</legend>
      <div className="weekday-picker">{WEEKDAYS.map((name,i)=><label key={name}><input type="checkbox" aria-label={['Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag'][i]} checked={days.includes(i+1)} onChange={e=>setDays(e.target.checked ? [...days,i+1].sort((a,b)=>a-b) : days.filter(d=>d!==i+1))} />{name}</label>)}</div>
      <label>Wiederholen bis einschließlich<input type="date" value={until} min={date} max={addDays(date,365)} onChange={e=>setUntil(e.target.value)} required /></label>
      <p role="status">{preview}</p><p>Maximal ein Jahr pro Serie. Einzelne Termine können später geändert oder gelöscht werden.</p>
    </fieldset>}
    {error && <p className="login-error" role="alert">{error}</p>}
    <div className="actions"><button type="button" className="secondary" onClick={onClose} disabled={busy}>Abbrechen</button><button className="btn-primary" disabled={busy}>{busy ? 'Wird gespeichert …' : scope==='series' ? 'Serie ändern' : repeat ? 'Serie anlegen' : 'Termin speichern'}</button></div>
  </form></dialog>
}
