import { useState } from 'react'
import Login from './Login.jsx'
import Calendar from './Calendar.jsx'
import './App.css'

export default function App() {
  const [user, setUser] = useState(null)

  if (!user) {
    return <Login onLogin={(name) => setUser(name)} />
  }

  return <Calendar user={user} onLogout={() => setUser(null)} />
}
