import { useEffect, useRef, useState } from 'react'
import { api } from './api.js'
export default function Members({ onClose }) {
  const dialog = useRef(null)
  const [manageAccounts,setManageAccounts] = useState(false)
  const [selected,setSelected] = useState(null)
  const [members,setMembers] = useState([])
  const [error,setError] = useState('')
  const [message,setMessage] = useState('')
  const [busy,setBusy] = useState(false)
  const load = () => api('users').then(r => { setMembers(r.users); setManageAccounts(Boolean(r.manageAccounts)) }).catch(e => setError(e.message))
  useEffect(() => { dialog.current.showModal(); load() }, [])
  async function save(e) {
    e.preventDefault(); const form = e.currentTarget; setBusy(true); setError(''); setMessage('')
    try { await api('users','POST',Object.fromEntries(new FormData(form))); form.reset(); setMessage('Zugang angelegt. Bitte die Zugangsdaten persönlich weitergeben.'); await load() }
    catch(e) { setError(e.message) } finally { setBusy(false) }
  }
  async function change(e) {
    e.preventDefault(); setBusy(true); setError(''); setMessage('')
    try {
      await api(`users/${selected.id}`, 'PATCH', { action:selected.action, ...Object.fromEntries(new FormData(e.currentTarget)) })
      setMessage(selected.action === 'disable' ? 'Zugang gesperrt und alle Sitzungen beendet.' : 'Passwort geändert. Der Zugang ist aktiv; bisherige Sitzungen wurden beendet.')
      setSelected(null); await load()
    } catch(e) { setError(e.message) } finally { setBusy(false) }
  }
  return <dialog ref={dialog} onCancel={onClose} aria-labelledby="members-title"><div className="edit-form">
    <h2 id="members-title">Vereinszugänge</h2><p>Alle angemeldeten Mitglieder können Termine anlegen, bearbeiten und löschen.</p>
    <ul>{members.map(m => <li key={m.id}>{m.name} · {m.email}{m.role === 'admin' ? ' (Verwaltung)' : ''}{m.disabled ? ' · gesperrt' : ''}
      {manageAccounts && <div className="actions"><button className="secondary" disabled={busy} onClick={() => { setSelected({...m,action:'reset-password'}); setError(''); setMessage('') }}>Passwort ändern</button>{m.role !== 'admin' && !m.disabled && <button className="secondary danger" disabled={busy} onClick={() => { setSelected({...m,action:'disable'}); setError(''); setMessage('') }}>Zugang sperren</button>}</div>}
    </li>)}</ul>
    {selected && <form className="edit-form" onSubmit={change}><h3>{selected.action === 'disable' ? 'Zugang sperren' : 'Passwort ändern'}: {selected.name}</h3>
      {selected.action === 'disable' ? <p>Der Zugang wird sofort gesperrt. Alle laufenden Sitzungen werden beendet.</p> : <label>Neues Passwort (mindestens 12 Zeichen)<input type="password" name="password" required minLength={12} maxLength={128} autoComplete="new-password" /></label>}
      <div className="actions"><button type="button" className="secondary" disabled={busy} onClick={() => setSelected(null)}>Abbrechen</button><button className="btn-primary" disabled={busy}>{selected.action === 'disable' ? 'Sperren bestätigen' : 'Neues Passwort speichern'}</button></div>
    </form>}
    {error && <p className="login-error" role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    <form className="edit-form" onSubmit={save}><h3>Person hinzufügen</h3>
      <label>Name<input name="name" required maxLength={100} /></label>
      <label>E-Mail<input name="email" type="email" required maxLength={254} autoComplete="off" /></label>
      <label>Passwort (mindestens 12 Zeichen)<input name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" /></label>
      <div className="actions"><button type="button" className="secondary" onClick={onClose}>Schließen</button><button className="btn-primary" disabled={busy}>{busy ? 'Wird angelegt …' : 'Zugang anlegen'}</button></div>
    </form>
  </div></dialog>
}
