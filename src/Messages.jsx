import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api.js'

export default function Messages({user,initialPeer,onClose,onUnreadChanged}) {
  const dialog=useRef(null),bottom=useRef(null)
  const [peers,setPeers]=useState([]),[threads,setThreads]=useState([])
  const [peerId,setPeerId]=useState(initialPeer||'')
  const [peer,setPeer]=useState(null),[messages,setMessages]=useState([])
  const [hasMore,setHasMore]=useState(false),[loading,setLoading]=useState(Boolean(initialPeer)),[olderBusy,setOlderBusy]=useState(false)
  const [draft,setDraft]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
  const clientId=useRef(null),generation=useRef(0)
  const inbox=useCallback(async()=>{const r=await api('messages');setPeers(r.recipients);setThreads(r.threads);onUnreadChanged()},[onUnreadChanged])
  useEffect(()=>{dialog.current.showModal();inbox().catch(e=>setError(e.message));const timer=setInterval(()=>{if(!document.hidden)inbox().catch(()=>{})},20000);return()=>clearInterval(timer)},[inbox])
  useEffect(()=>{
    const g=++generation.current
    if(!peerId)return
    let first=true
    async function load(){
      try {
        const r=await api(`messages/${peerId}`);if(g!==generation.current)return
        setPeer(r.peer);setMessages(old=>[...new Map([...old,...r.messages].map(m=>[m.id,m])).values()].sort((a,b)=>a.id-b.id))
        if(first){setHasMore(r.hasMore);first=false;setTimeout(()=>bottom.current?.scrollIntoView({block:'nearest'}),0)}
        if(r.messages.length&&!document.hidden)await api(`messages/${peerId}/read`,'POST',{through:r.messages.at(-1).id})
        if(g===generation.current){setLoading(false);await inbox()}
      }catch(e){if(g===generation.current){setLoading(false);setError(e.message)}}
    }
    load();const timer=setInterval(()=>{if(!document.hidden)load()},20000)
    return()=>{generation.current=g+1;clearInterval(timer)}
  },[peerId,inbox])
  function choose(id){if(busy||Number(id)===Number(peerId))return;if(draft.trim()&&Number(id)!==Number(peerId)&&!window.confirm('Ungesendeten Text verwerfen und das Gespräch wechseln?'))return;setDraft('');clientId.current=null;setMessages([]);setPeer(null);setHasMore(false);setError('');setNotice('');setLoading(Boolean(id));setPeerId(id)}
  async function older(){setOlderBusy(true);const g=generation.current;try{const r=await api(`messages/${peerId}?before=${messages[0].id}`);if(g===generation.current){setMessages(old=>[...new Map([...r.messages,...old].map(m=>[m.id,m])).values()].sort((a,b)=>a.id-b.id));setHasMore(r.hasMore)}}catch(e){setError(e.message)}finally{setOlderBusy(false)}}
  async function send(e){
    e.preventDefault();if(!draft.trim()||busy)return;setBusy(true);setError('');setNotice('');const id=peerId
    clientId.current ||= crypto.randomUUID()
    try{
      await api(`messages/${id}`,'POST',{body:draft,clientId:clientId.current});setDraft('');clientId.current=null;setNotice('Nachricht gesendet.')
      const r=await api(`messages/${id}`);setMessages(old=>[...new Map([...old,...r.messages].map(m=>[m.id,m])).values()].sort((a,b)=>a.id-b.id));await inbox();setTimeout(()=>bottom.current?.scrollIntoView({block:'nearest'}),0)
    }catch(e){setError(e.message)}finally{setBusy(false)}
  }
  function close(e){e?.preventDefault();if(busy)return;if(!draft.trim()||window.confirm('Ungesendeten Text verwerfen und Nachrichten schließen?'))onClose()}
  return <dialog ref={dialog} className="messages-dialog" onCancel={close} aria-labelledby="messages-title"><div className="edit-form">
    <div className="contacts-heading"><h2 id="messages-title">Nachrichten</h2><button type="button" className="secondary" disabled={busy} onClick={close}>Schließen</button></div>
    <p>Internes Postfach für freigeschaltete Mitglieder. Keine E-Mail: Neue Nachrichten siehst du im Kalender. Gespräche können nur Absender und Empfänger öffnen.</p>
    {error&&<p className="login-error" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    <div className="mail-layout"><aside className="mail-sidebar">
      <label>Neue Nachricht an<select value={peerId} disabled={busy} onChange={e=>choose(e.target.value)}><option value="">Person auswählen</option>{peers.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}{peer?.disabled&&<option value={peer.id}>{peer.name} (Zugang gesperrt)</option>}</select></label>
      <h3>Gespräche</h3>{!threads.length&&<p>Noch keine Nachrichten. Wähle eine Person aus, um zu beginnen.</p>}
      <div className="mail-threads">{threads.map(t=><button type="button" className={`mail-thread${Number(peerId)===t.id?' is-active':''}`} disabled={busy} key={t.id} onClick={()=>choose(t.id)}><strong>{t.name}{t.unread>0?` · ${t.unread} ungelesen`:''}</strong><span>{t.body}</span></button>)}</div>
    </aside><section className="mail-conversation" aria-label="Gespräch">
      {!peerId&&<p>Wähle eine Person oder ein bestehendes Gespräch. Auch Mitglieder ohne Kontakteintrag sind hier erreichbar.</p>}
      {loading&&<p role="status">Nachrichten werden geladen …</p>}
      {peer&&!loading&&<><h3>Gespräch mit {peer.name}</h3><div className="mail-history" aria-label="Nachrichtenverlauf">
        {hasMore&&<button className="secondary" disabled={olderBusy} onClick={older}>Ältere Nachrichten laden</button>}
        {!messages.length&&<p>Noch keine Nachrichten in diesem Gespräch.</p>}
        {messages.map(m=><article key={m.id} className={`mail-bubble${m.sender_id===user.id?' mine':''}`}><strong>{m.sender_id===user.id?'Du':peer.name}</strong><time dateTime={new Date(m.created_at).toISOString()}>{new Date(m.created_at).toLocaleString('de-DE')}</time><p>{m.body}</p></article>)}<div ref={bottom}/>
      </div>{peer.disabled?<p>Dieser Zugang ist gesperrt. Der bisherige Verlauf bleibt lesbar; Senden ist nicht möglich.</p>:<form className="edit-form" onSubmit={send}><label>Deine Nachricht<textarea value={draft} disabled={busy} maxLength={4000} rows={4} required onChange={e=>{setDraft(e.target.value);clientId.current=null;setNotice('')}} placeholder="Schreibe deine Nachricht …" /></label><span className="mail-hint">{draft.length} / 4000 Zeichen · Senden überträgt die Nachricht an {peer.name}.</span><button className="btn-primary" disabled={busy||!draft.trim()}>{busy?'Wird gesendet …':'Nachricht senden'}</button></form>}</>}
    </section></div>
  </div></dialog>
}
