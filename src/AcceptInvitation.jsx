import { useEffect, useState } from 'react'
import { api } from './api.js'
import BrandMark from './BrandMark.jsx'

export default function AcceptInvitation({ token, onLogin, onBack }) {
  const [person, setPerson] = useState(null)
  const [loading, setLoading] = useState(true)
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [accepted, setAccepted] = useState(false)
  useEffect(() => {
    let active = true
    api('invitations/check', 'POST', { token }).then(result => { if (active) setPerson(result) })
      .catch(e => { if (active) setError(e.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [token])
  async function submit(e) {
    e.preventDefault(); setError('')
    if (password !== repeat) { setError('Die beiden Passwörter stimmen nicht überein.'); return }
    setBusy(true)
    try {
      await api('invitations/accept', 'POST', { token, password })
      setAccepted(true)
      try {
        const result = await api('login', 'POST', { email:person.email, password })
        onLogin(result.user)
      } catch { setError('Dein Passwort wurde gespeichert. Bitte melde dich jetzt mit deiner E-Mail und deinem neuen Passwort an.') }
      setPassword(''); setRepeat('')
    } catch(e) { setError(e.message) } finally { setBusy(false) }
  }
  return <div className="login-page">
    <div className="login-atmosphere" aria-hidden="true" />
    <header className="login-brand"><BrandMark variant="login" /></header>
    <form className="login-form" onSubmit={submit}>
      <h2>Eigenes Passwort festlegen</h2>
      {loading && <p role="status">Einladung wird geprüft …</p>}
      {person && !accepted && <>
        <p className="login-hint">Hallo {person.name}! Lege dein eigenes Passwort für den Vereinskalender fest. Die Vereinsverwaltung erfährt es nicht.</p>
        <label>E-Mail<input type="email" value={person.email} readOnly autoComplete="username" /></label>
        <label>Neues Passwort (mindestens 12 Zeichen)<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required minLength={12} maxLength={128} autoComplete="new-password" /></label>
        <label>Passwort wiederholen<input type="password" value={repeat} onChange={e=>setRepeat(e.target.value)} required minLength={12} maxLength={128} autoComplete="new-password" /></label>
        <button className="btn-primary" disabled={busy}>{busy ? 'Wird gespeichert …' : 'Passwort festlegen und zum Kalender'}</button>
      </>}
      {error && <p className="login-error" role="alert">{error}</p>}
      <button type="button" className="secondary" disabled={busy} onClick={onBack}>Zur Anmeldung</button>
    </form>
  </div>
}
