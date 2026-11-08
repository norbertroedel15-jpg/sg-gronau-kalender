import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from './api.js'
import EventForm from './EventForm.jsx'
import EventTypes from './EventTypes.jsx'
import Members from './Members.jsx'
import BrandMark from './BrandMark.jsx'
import {
  MONTH_NAMES,
  DEFAULT_EVENT_TYPES,
  typeStyle,
  WEEKDAYS,
} from './data.js'

function pad(n) {
  return String(n).padStart(2, '0')
}

function toKey(year, month, day) {
  return `${year}-${pad(month + 1)}-${pad(day)}`
}

function buildMonthGrid(year, month) {
  const first = new Date(year, month, 1)
  const startOffset = (first.getDay() + 6) % 7 // Monday-first
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = []

  for (let i = 0; i < startOffset; i += 1) {
    cells.push(null)
  }
  for (let d = 1; d <= daysInMonth; d += 1) {
    cells.push(d)
  }
  while (cells.length % 7 !== 0) {
    cells.push(null)
  }
  return cells
}

export default function Calendar({ user, onLogout }) {
  const [cursor, setCursor] = useState(() => new Date())
  const [selectedId, setSelectedId] = useState(null)

  const [types, setTypes] = useState(DEFAULT_EVENT_TYPES)
  const [typesSupported, setTypesSupported] = useState(false)
  const [typesOpen, setTypesOpen] = useState(false)
  const typesById = useMemo(() => Object.fromEntries(types.map(t=>[t.id,t])),[types])
  const [events, setEvents] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [membersOpen, setMembersOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState('')
  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const monthKey = `${year}-${pad(month + 1)}`
  const load = useCallback(async () => {
    try { const r = await api(`events?month=${monthKey}`); return { events:r.events, types:r.eventTypes } }
    catch(e) { if (e.status === 401) onLogout(); return { error:e.message } }
  }, [monthKey, onLogout])
  const refresh = useCallback(async () => {
    const result = await load()
    if (result.events) { setEvents(result.events); if (result.types) { setTypes(result.types); setTypesSupported(true) } setError('') }
    else setError(result.error)
    setLoading(false)
  }, [load])
  useEffect(() => {
    let active = true
    async function sync() {
      const result = await load()
      if (!active) return
      if (result.events) { setEvents(result.events); if (result.types) { setTypes(result.types); setTypesSupported(true) } setError('') }
      else setError(result.error)
      setLoading(false)
    }
    sync()
    const timer = setInterval(() => { if (!document.hidden) sync() }, 60000)
    const onVisible = () => { if (!document.hidden) sync() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { active = false; clearInterval(timer); document.removeEventListener('visibilitychange', onVisible) }
  }, [load])
  async function logout() { try { await api('logout','POST',{}); onLogout() } catch(e) { setError(e.message) } }
  async function remove() {
    setBusy(true)
    try { await api(`events/${selected.id}`,'DELETE',{version:selected.version}); setSelectedId(null); setDeleting(false); await refresh() }
    catch(e) { setDeleting(false); await refresh(); setError(e.message) }
    finally { setBusy(false) }
  }
  const visibleEvents = useMemo(() => events.filter(e => !filter || e.type === filter), [events, filter])

  const cells = useMemo(() => buildMonthGrid(year, month), [year, month])

  const eventsByDay = useMemo(() => {
    const map = {}
    for (const event of visibleEvents) {
      if (!map[event.date]) map[event.date] = []
      map[event.date].push(event)
    }
    return map
  }, [visibleEvents])

  const monthEvents = useMemo(
    () =>
      visibleEvents.filter((e) => {
        const [y, m] = e.date.split('-').map(Number)
        return y === year && m === month + 1
      }).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)),
    [year, month, visibleEvents],
  )

  const selected = visibleEvents.find((e) => e.id === selectedId) || null
  const [todayKey] = useState(() => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date()))

  function shiftMonth(delta) {
    setLoading(true); setEvents([])
    setCursor(new Date(year, month + delta, 1))
    setSelectedId(null)
  }

  return (
    <div className="cal-page">
      <header className="cal-top">
        <BrandMark variant="header" />
        <div className="cal-user">
          {user.role === 'admin' && typesSupported && <button type="button" className="btn-ghost" onClick={() => setTypesOpen(true)}>Terminarten verwalten</button>}
          {user.role === 'admin' && <button type="button" className="btn-ghost" onClick={() => setMembersOpen(true)}>Zugänge verwalten</button>}
          <span className="cal-user-name">{user.name}</span>
          <button type="button" className="btn-ghost" onClick={logout}>
            Abmelden
          </button>
        </div>
      </header>

      <section className="cal-toolbar">
        <div className="month-nav">
          <button type="button" className="nav-btn" onClick={() => shiftMonth(-1)} aria-label="Vorheriger Monat">
            ‹
          </button>
          <h2 className="month-label">
            {MONTH_NAMES[month]} {year}
          </h2>
          <button type="button" className="nav-btn" onClick={() => shiftMonth(1)} aria-label="Nächster Monat">
            ›
          </button>
        </div>
        <div className="legend" aria-label="Legende">
          {types.filter(t=>t.enabled).map(t=><span key={t.id} className="legend-item" style={typeStyle(t)}>{t.name}</span>)}
        </div>
        <button type="button" className="btn-primary btn-new" onClick={() => setEditing({ date: toKey(year, month, 1) })}>
          + Neuer Termin
        </button>
      </section>

      <div className="sync-bar"><label>Terminart <select value={filter} onChange={e => setFilter(e.target.value)}><option value="">Alle Termine</option>{types.map(t => <option key={t.id} value={t.id}>{t.name}{t.enabled ? '' : ' (ausgeblendet)'}</option>)}</select></label><span>{loading ? 'Termine werden geladen …' : 'Gemeinsamer Kalender · Abgleich jede Minute'}</span><button type="button" className="secondary" onClick={refresh}>Aktualisieren</button></div>
      {error && <p className="status login-error" role="alert">{error}</p>}
      <div className="cal-layout">
        <div className="month-grid" role="grid" aria-label={`Monatsansicht ${MONTH_NAMES[month]} ${year}`}>
          <div className="weekday-row">
            {WEEKDAYS.map((d) => (
              <div key={d} className="weekday">
                {d}
              </div>
            ))}
          </div>
          <div className="day-grid">
            {cells.map((day, idx) => {
              if (day == null) {
                return <div key={`empty-${idx}`} className="day-cell empty" />
              }
              const key = toKey(year, month, day)
              const dayEvents = eventsByDay[key] || []
              const isToday = key === todayKey
              return (
                <div key={key} className={`day-cell${isToday ? ' is-today' : ''}`}>
                  <div className="day-num">{day}</div>
                  <ul className="day-events">
                    {dayEvents.map((ev) => (
                      <li key={ev.id}>
                        <button
                          type="button"
                          className={`event-chip${selectedId === ev.id ? ' is-active' : ''}`}
                          style={typeStyle(typesById[ev.type])}
                          onClick={() => { setSelectedId(ev.id); setDeleting(false) }}
                        >
                          <span className="event-time">{ev.time}</span>
                          <span className="event-title">{ev.title}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        </div>

        <aside className="side-panel">
          <h3>Termine im Monat</h3>
          {!loading && monthEvents.length === 0 && <p>Keine Termine in diesem Monat.</p>}
          <ul className="event-list">
            {monthEvents.map((ev) => (
              <li key={ev.id}>
                <button
                  type="button"
                  className={`event-row${selectedId === ev.id ? ' is-active' : ''}`}
                  onClick={() => { setSelectedId(ev.id); setDeleting(false) }}
                >
                  <span className="dot" style={typeStyle(typesById[ev.type])} aria-hidden="true" />
                  <span className="event-row-body">
                    <strong>{ev.title}</strong>
                    <span>
                      {ev.date.split('-').reverse().join('.')} · {ev.time}–{ev.endTime}
                    </span>
                  </span>
                  <span className="event-type-tag">{typesById[ev.type]?.name || ev.type}</span>
                </button>
              </li>
            ))}
          </ul>

          {selected ? (
            <div className="detail" aria-live="polite">
              <p className="detail-type" style={typeStyle(typesById[selected.type])}>{typesById[selected.type]?.name || selected.type}</p>
              <h4>{selected.title}</h4>
              <dl>
                <div>
                  <dt>Datum</dt>
                  <dd>{selected.date.split('-').reverse().join('.')}</dd>
                </div>
                <div>
                  <dt>Zeit</dt>
                  <dd>
                    {selected.time} – {selected.endTime} Uhr
                  </dd>
                </div>
                <div>
                  <dt>Ort</dt>
                  <dd>{selected.place}</dd>
                </div>
                <div>
                  <dt>Erstellt von</dt>
                  <dd>{selected.createdBy}</dd>
                </div>
              </dl>
              <div className="actions"><button className="secondary" onClick={() => setEditing(selected)}>Bearbeiten</button><button className="secondary danger" onClick={() => setDeleting(true)}>Löschen</button></div>
              {deleting && <div role="alert"><p>„{selected.title}“ für alle Personen löschen?</p><div className="actions"><button className="secondary" disabled={busy} onClick={() => setDeleting(false)}>Abbrechen</button><button className="secondary danger" disabled={busy} onClick={remove}>Endgültig löschen</button></div></div>}
            </div>
          ) : (
            <p className="side-empty">Termin antippen für Details.</p>
          )}
        </aside>
      </div>
      {editing && <EventForm types={types} event={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh() }} />}
      {typesOpen && <EventTypes types={types} onClose={() => setTypesOpen(false)} onChanged={refresh} />}
      {membersOpen && <Members onClose={() => setMembersOpen(false)} />}
    </div>
  )
}
