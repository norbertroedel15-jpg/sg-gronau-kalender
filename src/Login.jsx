import { useState } from 'react'
import BrandMark from './BrandMark.jsx'

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    if (!email.trim() || !password.trim()) {
      setError('Bitte E-Mail und Passwort eingeben.')
      return
    }
    setError('')
    const local = email.split('@')[0] || 'Mitglied'
    const name = local
      .replace(/[._-]+/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
    onLogin(name)
  }

  return (
    <div className="login-page">
      <div className="login-atmosphere" aria-hidden="true" />
      <header className="login-brand">
        <BrandMark variant="login" />
      </header>

      <form className="login-form" onSubmit={handleSubmit} noValidate>
        <h2>Anmelden</h2>
        <p className="login-hint">Vorschau — beliebige Angaben reichen zum Weiterklicken.</p>

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

        <button type="submit" className="btn-primary">
          Zum Kalender
        </button>
      </form>
    </div>
  )
}
