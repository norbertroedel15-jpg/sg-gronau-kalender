import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api.js'

export default function Members({ onClose }) {
  const dialog = useRef(null), linkInput = useRef(null)
  const [manageAccounts, setManageAccounts] = useState(false)
  const [invitationSupport, setInvitationSupport] = useState(null)
  const [selected, setSelected] = useState(null)
  const [members, setMembers] = useState([])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [link, setLink] = useState(null)
  const [copied, setCopied] = useState(false)
  const load = useCallback(async () => {
    try {
      const r = await api('users'); setMembers(r.users)
      setManageAccounts(Boolean(r.manageAccounts)); setInvitationSupport(Boolean(r.invitationSupport))
    } catch(e) { setError(e.message) }
  }, [])
  useEffect(() => {
    dialog.current.showModal()
    let active = true
    api('users').then(r => {
      if (!active) return
      setMembers(r.users); setManageAccounts(Boolean(r.manageAccounts)); setInvitationSupport(Boolean(r.invitationSupport))
    }).catch(e => { if (active) setError(e.message) })
    return () => { active = false }
  }, [])
  function clearNotice() { setError(''); setMessage(''); setCopied(false) }
  async function save(e) {
    e.preventDefault(); const form = e.currentTarget, body = Object.fromEntries(new FormData(form))
    setBusy(true); clearNotice()
    try {
      const r = await api(invitationSupport ? 'invitations' : 'users', 'POST', body)
      form.reset()
      if (invitationSupport) {
        setLink({...r, name:body.name}); setMessage('Einladung erstellt. Bitte den Link nur an diese Person weitergeben. Es wird keine E-Mail automatisch verschickt.')
      } else setMessage('Zugang angelegt. Bitte die Zugangsdaten persönlich weitergeben.')
      await load()
    } catch(e) { setError(e.message) } finally { setBusy(false) }
  }
  async function issue(member) {
    setBusy(true); clearNotice(); setSelected(null); setLink(null)
    try {
      const r = await api(`users/${member.id}/invitation`, 'POST', {})
      setLink({...r,name:member.name}); setMessage('Neuer Link erstellt. Der vorherige Link für diese Person ist ungültig. Das bisherige Passwort bleibt bis zum Festlegen eines neuen Passworts gültig.')
      await load()
    } catch(e) { setError(e.message) } finally { setBusy(false) }
  }
  async function change(e) {
    e.preventDefault(); setBusy(true); clearNotice()
    try {
      if (selected.action === 'revoke') {
        await api(`users/${selected.id}/invitation`, 'DELETE', {})
        setMessage('Einladungslink widerrufen. Ein bereits aktiver Zugang bleibt bestehen.')
      } else {
        await api(`users/${selected.id}`, 'PATCH', { action:selected.action, ...Object.fromEntries(new FormData(e.currentTarget)) })
        setMessage(selected.action === 'disable' ? 'Zugang gesperrt. Sitzungen und Einladungslinks sind ungültig.' : 'Passwort geändert. Bisherige Sitzungen wurden beendet.')
      }
      setSelected(null); setLink(null); await load()
    } catch(e) { setError(e.message) } finally { setBusy(false) }
  }
  async function copyLink() {
    try { await navigator.clipboard.writeText(link.url); setCopied(true) }
    catch { linkInput.current.focus(); linkInput.current.select(); setMessage('Der Link ist markiert. Bitte mit Strg+C kopieren.') }
  }
  return <dialog ref={dialog} onCancel={onClose} aria-labelledby="members-title"><div className="edit-form">
    <h2 id="members-title">Vereinszugänge</h2>
    <p>{invitationSupport ? 'Du lädst Personen ein. Jede Person legt ihr eigenes Passwort fest. Alle angemeldeten Mitglieder können Termine anlegen, bearbeiten und löschen.' : 'Alle angemeldeten Mitglieder können Termine anlegen, bearbeiten und löschen.'}</p>
    {link && <section className="invite-result" aria-labelledby="invite-link-title">
      <h3 id="invite-link-title">Einladungslink für {link.name}</h3>
      <p>Gültig bis {new Date(link.expires).toLocaleString('de-DE')}, einmal verwendbar. Nur an die vorgesehene Person weitergeben.</p>
      <label>Einladungslink<input ref={linkInput} value={link.url} readOnly onFocus={e=>e.target.select()} /></label>
      <button type="button" className="btn-primary" onClick={copyLink}>{copied ? 'Link kopiert' : 'Link kopieren'}</button>
      <p>Der Link wird aus Sicherheitsgründen nur jetzt angezeigt. Falls du ihn verlierst, kannst du einen neuen erstellen.</p>
    </section>}
    {error && <p className="login-error" role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    {invitationSupport === null && <p role="status">Zugänge werden geladen …</p>}
    {invitationSupport !== null && <form className="edit-form" onSubmit={save}>
      <h3>{invitationSupport ? 'Person einladen' : 'Person hinzufügen'}</h3>
      <label>Name<input name="name" required maxLength={100} /></label>
      <label>E-Mail<input name="email" type="email" required maxLength={254} autoComplete="off" /></label>
      {!invitationSupport && <label>Passwort (mindestens 12 Zeichen)<input name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" /></label>}
      <button className="btn-primary" disabled={busy}>{busy ? 'Bitte warten …' : invitationSupport ? 'Einladungslink erstellen' : 'Zugang anlegen'}</button>
    </form>}
    <h3>Angelegte Personen</h3>
    <ul className="member-list">{members.map(m => <li key={m.id}>
      <strong>{m.name}</strong> · {m.email}{m.role === 'admin' ? ' (Verwaltung)' : ''}
      <p>{m.activation_pending ? 'Noch nicht aktiviert' : m.disabled ? 'Gesperrt' : 'Aktiv'}{m.invitation_expires ? ` · Link gültig bis ${new Date(m.invitation_expires).toLocaleString('de-DE')}` : ''}</p>
      {manageAccounts && <div className="actions">
        {invitationSupport ? <button className="secondary" disabled={busy} onClick={()=>issue(m)}>{m.activation_pending ? 'Neuen Einladungslink erstellen' : 'Link für eigenes neues Passwort'}</button>
          : <button className="secondary" disabled={busy} onClick={()=>{setSelected({...m,action:'reset-password'});clearNotice()}}>Passwort ändern</button>}
        {invitationSupport && m.invitation_expires && <button className="secondary" disabled={busy} onClick={()=>{setSelected({...m,action:'revoke'});clearNotice()}}>Link widerrufen</button>}
        {m.role !== 'admin' && (!m.disabled || m.activation_pending) && <button className="secondary danger" disabled={busy} onClick={()=>{setSelected({...m,action:'disable'});clearNotice()}}>Zugang sperren</button>}
      </div>}
    </li>)}</ul>
    {selected && <form className="edit-form" onSubmit={change}>
      <h3>{selected.action === 'disable' ? 'Zugang sperren' : selected.action === 'revoke' ? 'Link widerrufen' : 'Passwort ändern'}: {selected.name}</h3>
      {selected.action === 'disable' ? <p>Der Zugang wird sofort gesperrt. Alle Sitzungen und Einladungslinks werden ungültig.</p>
        : selected.action === 'revoke' ? <p>Der Einladungslink wird ungültig. Ein bestehendes Passwort bleibt gültig.</p>
          : <label>Neues Passwort (mindestens 12 Zeichen)<input type="password" name="password" required minLength={12} maxLength={128} autoComplete="new-password" /></label>}
      <div className="actions"><button type="button" className="secondary" disabled={busy} onClick={()=>setSelected(null)}>Abbrechen</button><button className="btn-primary" disabled={busy}>Bestätigen</button></div>
    </form>}
    <button type="button" className="secondary" onClick={onClose} disabled={busy}>Schließen</button>
  </div></dialog>
}
