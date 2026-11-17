import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api.js'

function dateLabel(value){return value?.split('-').reverse().join('.')}
export default function EventNotices({onOpen}) {
  const [notices,setNotices]=useState([]),[total,setTotal]=useState(0),[expanded,setExpanded]=useState(false)
  const [toastId,setToastId]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  const known=useRef(new Set()),revision=useRef(0)
  const load=useCallback(async()=>{
    const ticket=++revision.current
    try{
      const r=await api('event-notices');if(ticket!==revision.current)return
      const fresh=r.notices.find(n=>!known.current.has(n.id))
      r.notices.forEach(n=>known.current.add(n.id));setNotices(r.notices);setTotal(r.total);setError('')
      if(fresh)setToastId(fresh.id)
    }catch(e){if(ticket===revision.current)setError(e.message)}
  },[])
  useEffect(()=>{
    load();const visible=()=>{if(!document.hidden)load()}
    const timer=setInterval(visible,20000);document.addEventListener('visibilitychange',visible)
    return()=>{revision.current++;clearInterval(timer);document.removeEventListener('visibilitychange',visible)}
  },[load])
  async function acknowledge(n,open=false){
    setBusy(true);setError('');revision.current++
    try{await api(`event-notices/${n.id}/read`,'POST',{});setToastId(null);await load();if(open)onOpen(n)}
    catch(e){setError(e.message)}finally{setBusy(false)}
  }
  function card(n,toast=false){return <article className="event-notice-card" key={n.id}>
    <span className="event-notice-kind" style={{borderColor:n.color}}>{n.series_id?'Neue Terminserie':'Neuer Termin'} · {n.type_name}</span>
    <h3>{n.title}</h3>
    <p><strong>{dateLabel(n.date)} · {n.time}–{n.end_time}</strong>{n.series_id&&<><br/>{n.occurrence_count} Termine bis {dateLabel(n.until_date)}</>}</p>
    <p>{n.place} · Eingetragen von {n.created_by}</p>
    {!n.current_event_id&&<p>Der Termin wurde inzwischen gelöscht.</p>}
    <div className="actions">
      {n.current_event_id&&<button type="button" className="secondary" disabled={busy} onClick={()=>acknowledge(n,true)}>Termin ansehen</button>}
      <button type="button" className="secondary" disabled={busy} onClick={()=>acknowledge(n)}>{toast?'Hinweis schließen':'Als gesehen markieren'}</button>
    </div>
  </article>}
  const toast=notices.find(n=>n.id===toastId)
  return <>
    <section className="event-notices" aria-label="Hinweise auf neue Termine">
      <div className="event-notices-heading"><strong>Neue Termine{total>0?` (${total})`:''}</strong><button type="button" className="secondary" aria-expanded={expanded} onClick={()=>{setExpanded(!expanded);setToastId(null)}}>{expanded?'Hinweise einklappen':total?'Alle Hinweise ansehen':'Hinweise ansehen'}</button><button type="button" className="secondary" disabled={busy} onClick={load}>Hinweise aktualisieren</button></div>
      {error&&<p className="login-error" role="alert">Hinweise konnten nicht geladen werden: {error}</p>}
      {expanded&&<>{!total&&<p>Keine ungesehenen Hinweise. Neue Termine deiner Kollegen erscheinen hier automatisch.</p>}{total>notices.length&&<p>Die neuesten {notices.length} von {total} Hinweisen. Nach dem Markieren werden weitere geladen.</p>}<div className="event-notice-list">{notices.map(n=>card(n))}</div></>}
    </section>
    {toast&&!expanded&&<aside className="event-notice-toast" aria-label="Neuer Termin"><div role="status">Neuer Termin eingetragen: {toast.title} · {toast.type_name}</div>{card(toast,true)}<button className="secondary" type="button" onClick={()=>{setExpanded(true);setToastId(null)}}>Alle Hinweise ({total})</button></aside>}
  </>
}
