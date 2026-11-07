import { useState } from 'react'
import { api } from './api.js'
import BrandMark from './BrandMark.jsx'

export default function Login({ onLogin }) {
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
    try { const result = await api('login', 'POST', { email, password }); onLogin(result.user) }
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
        <h2>Anmelden</h2>
        <p className="login-hint">Mit deinem Vereinskonto anmelden. Zugang erhältst du von der Vereinsverwaltung.</p>

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
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </label>

        {error ? <p className="login-error" role="alert">{error}</p> : null}

        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? 'Anmeldung läuft …' : 'Zum Kalender'}
        </button>
      </form>
    </div>
  )
}
