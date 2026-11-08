import { useEffect, useState } from 'react'
import { api } from './api.js'
import BrandMark from './BrandMark.jsx'

export default function Login({ onLogin }) {
  const [setupAvailable, setSetupAvailable] = useState(false)
  const [setup, setSetup] = useState(false)
  const [name, setName] = useState('')
  const [token, setToken] = useState('')
  const [notice, setNotice] = useState('')
  useEffect(() => { api('setup').then(r => setSetupAvailable(r.available)).catch(() => {}) }, [])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const [busy, setBusy] = useState(false)
  async function handleSubmit(e) {
    e.preventDefault()
    if (!email.trim() || !password.trim()) {
      setError('Bitte E-Mail und Passwort eingeben.')
      return
    }
    setError('')
    setBusy(true)
    try {
      if (setup) {
        await api('setup', 'POST', { email, password, name, token })
        setSetup(false); setSetupAvailable(false); setToken(''); setPassword('')
        setNotice('Verwaltungszugang angelegt. Bitte jetzt anmelden.')
      } else { const result = await api('login', 'POST', { email, password }); onLogin(result.user) }
    }
    catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  return (
    <div className="login-page">
      <div className="login-atmosphere" aria-hidden="true" />
      <header className="login-brand">
        <BrandMark variant="login" />
      </header>

      <form className="login-form" onSubmit={handleSubmit} noValidate>
        <h2>{setup ? 'Kalender einrichten' : 'Anmelden'}</h2>
        <p className="login-hint">{setup ? 'Einmalig den Verwaltungszugang anlegen. Den Einrichtungscode erhältst du bei der Einrichtung deines Cloudflare-Kontos.' : 'Mit deinem Vereinskonto anmelden. Zugang erhältst du von der Vereinsverwaltung.'}</p>
        {notice && <p role="status">{notice}</p>}
        {setup && <>
          <label>Einrichtungscode<input type="password" value={token} onChange={e => setToken(e.target.value)} autoComplete="off" required maxLength={256} /></label>
          <label>Name<input value={name} onChange={e => setName(e.target.value)} autoComplete="name" required maxLength={100} /></label>
        </>}

        <label>
          E-Mail
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@sg-gronau.de"
          />
        </label>

        <label>
          Passwort
          <input
            type="password"
            autoComplete={setup ? 'new-password' : 'current-password'}
            minLength={setup ? 12 : undefined}
            maxLength={128}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </label>

        {error ? <p className="login-error" role="alert">{error}</p> : null}

        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? 'Bitte warten …' : setup ? 'Verwaltungszugang anlegen' : 'Zum Kalender'}
        </button>
        {setupAvailable && <button type="button" className="secondary" disabled={busy} onClick={() => { setSetup(!setup); setError(''); setNotice(''); setPassword(''); setToken('') }}>{setup ? 'Zur Anmeldung' : 'Erstmalige Einrichtung'}</button>}
      </form>
    </div>
  )
}
