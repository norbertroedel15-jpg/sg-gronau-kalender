import { useCallback, useEffect, useState } from 'react'
import Login from './Login.jsx'
import Calendar from './Calendar.jsx'
import { api } from './api.js'
import './App.css'

export default function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => { api('me').then(r => setUser(r.user)).catch(e => { if (e.status !== 401) setError('Der Server ist gerade nicht erreichbar. Bitte die Seite neu laden.') }).finally(() => setLoading(false)) }, [])
  const logout = useCallback(() => setUser(null), [])
  if (loading) return <p className="status">Kalender wird geladen …</p>
  if (error) return <p role="alert" className="status">{error}</p>
  if (!user) return <Login onLogin={setUser} />
  return <Calendar user={user} onLogout={logout} />
}
