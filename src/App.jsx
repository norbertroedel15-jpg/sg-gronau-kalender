import { useCallback, useEffect, useState } from 'react'
import AcceptInvitation from './AcceptInvitation.jsx'
import Login from './Login.jsx'
import Calendar from './Calendar.jsx'
import { api } from './api.js'
import './App.css'

export default function App() {
  const [invitationToken, setInvitationToken] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('einladung'))
  useEffect(() => {
    const update = () => setInvitationToken(new URLSearchParams(window.location.hash.slice(1)).get('einladung'))
    window.addEventListener('hashchange', update)
    return () => window.removeEventListener('hashchange', update)
  }, [])
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => { api('me').then(r => setUser(r.user)).catch(e => { if (e.status !== 401) setError('Der Server ist gerade nicht erreichbar. Bitte die Seite neu laden.') }).finally(() => setLoading(false)) }, [])
  const logout = useCallback(() => setUser(null), [])
  function clearInvitation() {
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
    setInvitationToken(null)
  }
  if (invitationToken !== null) return <AcceptInvitation key={invitationToken} token={invitationToken} onLogin={u => { clearInvitation(); setUser(u); setError('') }} onBack={() => { clearInvitation(); setError('') }} />
  if (loading) return <p className="status">Kalender wird geladen …</p>
  if (error) return <p role="alert" className="status">{error}</p>
  if (!user) return <Login onLogin={setUser} />
  return <Calendar user={user} onLogout={logout} />
}
