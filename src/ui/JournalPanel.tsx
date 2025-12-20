import React, { useMemo, useState } from 'react';
import { Journey, JournalEntry, StoredState } from '../core/storage';
import { makeId } from '../core/oracles';

export default function JournalPanel({ state, setState }: { state: StoredState; setState: (s: StoredState) => void }) {
  const [view, setView] = useState<'notes'|'journeys'>('notes');

  // Notes form
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tags, setTags] = useState('');
  const [linkedHex, setLinkedHex] = useState('');

  // Journey form
  const [jTitle, setJTitle] = useState('');
  const [jFrom, setJFrom] = useState('');
  const [jTo, setJTo] = useState('');

  const entries = useMemo(() => [...state.journal].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)), [state.journal]);
  const journeys = useMemo(() => [...(state.journeys ?? [])].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)), [state.journeys]);

  function addNote() {
    if (!title.trim() && !body.trim()) return;
    const e: JournalEntry = {
      id: makeId(),
      createdAt: new Date().toISOString(),
      title: title.trim() || 'Note',
      body: body.trim(),
      tags: tags.split(',').map(t=>t.trim()).filter(Boolean),
      linkedHex: linkedHex.trim() || undefined,
    };
    setState({ ...state, journal: [e, ...state.journal] });
    setTitle(''); setBody(''); setTags(''); setLinkedHex('');
  }

  function removeNote(id: string) {
    setState({ ...state, journal: state.journal.filter(e=>e.id!==id) });
  }

  function addJourney() {
    if (!jTitle.trim()) return;
    const mode = (state.fellowship?.mode ?? 'company') as any;
    const j: Journey = {
      id: makeId(),
      createdAt: new Date().toISOString(),
      title: jTitle.trim(),
      from: jFrom.trim() || undefined,
      to: jTo.trim() || undefined,
      mode,
      roles: {},
      events: [],
    };
    setState({ ...state, journeys: [j, ...(state.journeys ?? [])] });
    setJTitle(''); setJFrom(''); setJTo('');
  }

  function patchJourney(id: string, patch: Partial<Journey>) {
    setState({
      ...state,
      journeys: (state.journeys ?? []).map(j => j.id === id ? { ...j, ...patch } : j),
    });
  }

  function removeJourney(id: string) {
    setState({ ...state, journeys: (state.journeys ?? []).filter(j=>j.id!==id) });
  }

  return (
    <div className="panel">
      <h2>Journal</h2>

      <div className="row" style={{gap: 8, flexWrap:'wrap'}}>
        <button className={view==='notes' ? 'btn' : 'btn btn-ghost'} onClick={()=>setView('notes')}>Notes</button>
        <button className={view==='journeys' ? 'btn' : 'btn btn-ghost'} onClick={()=>setView('journeys')}>Journeys</button>
      </div>

      {view === 'notes' ? (
        <>
          <div className="section">
            <div className="row" style={{ gap: 8, flexWrap:'wrap' }}>
              <input className="input" placeholder="Title" value={title} onChange={(e)=>setTitle(e.target.value)} />
              <input className="input" placeholder="Tags (comma-separated)" value={tags} onChange={(e)=>setTags(e.target.value)} />
              <input className="input" placeholder="Linked hex (optional)" value={linkedHex} onChange={(e)=>setLinkedHex(e.target.value)} />
              <button className="btn" onClick={addNote}>Add</button>
            </div>
            <textarea className="input" style={{ marginTop: 8, minHeight: 100 }} placeholder="Body" value={body} onChange={(e)=>setBody(e.target.value)} />
          </div>

          {entries.length === 0 ? <div className="muted">No notes yet.</div> : (
            <div className="list">
              {entries.map(e=>(
                <div key={e.id} className="card">
                  <div className="row" style={{justifyContent:'space-between', gap: 8, flexWrap:'wrap'}}>
                    <div>
                      <div className="cardTitle">{e.title}</div>
                      <div className="muted small">{new Date(e.createdAt).toLocaleString()}</div>
                    </div>
                    <button className="btn btn-ghost" onClick={()=>removeNote(e.id)}>Delete</button>
                  </div>
                  <div className="row" style={{ marginTop: 8, gap: 6, flexWrap:'wrap' }}>
                    {e.tags.map(t => <span key={t} className="badge">{t}</span>)}
                    {e.linkedHex && <span className="badge">Hex: {e.linkedHex}</span>}
                  </div>
                  {e.body && <pre style={{ marginTop: 10, whiteSpace:'pre-wrap' }}>{e.body}</pre>}
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="section">
            <div className="row" style={{ gap: 8, flexWrap:'wrap' }}>
              <input className="input" placeholder="Journey name" value={jTitle} onChange={(e)=>setJTitle(e.target.value)} />
              <input className="input" placeholder="From" value={jFrom} onChange={(e)=>setJFrom(e.target.value)} />
              <input className="input" placeholder="To" value={jTo} onChange={(e)=>setJTo(e.target.value)} />
              <button className="btn" onClick={addJourney}>Add</button>
            </div>
            <div className="small muted" style={{marginTop: 6}}>
              Mode comes from Fellowship (Company / Strider Mode). Full journey procedure support will be added later.
            </div>
          </div>

          {journeys.length === 0 ? <div className="muted">No journeys yet.</div> : (
            <div className="list">
              {journeys.map(j=>(
                <JourneyCard key={j.id} j={j} patch={(p)=>patchJourney(j.id,p)} remove={()=>removeJourney(j.id)} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function JourneyCard({ j, patch, remove }: { j: any; patch: (p:any)=>void; remove: ()=>void }) {
  const [open, setOpen] = useState(false);

  const addEvent = () => {
    const ev = { id: makeId(), title: 'Event', body: '' };
    patch({ events: [ev, ...(j.events ?? [])] });
  };

  const patchEvent = (eid: string, p: any) => {
    patch({ events: (j.events ?? []).map((e:any)=> e.id===eid ? { ...e, ...p } : e) });
  };

  const removeEvent = (eid: string) => {
    patch({ events: (j.events ?? []).filter((e:any)=>e.id!==eid) });
  };

  return (
    <div className="card">
      <div className="row" style={{justifyContent:'space-between', gap: 8, flexWrap:'wrap'}}>
        <div>
          <div className="cardTitle">{j.title}</div>
          <div className="muted small">{j.from ? j.from : '(unknown)'} → {j.to ? j.to : '(unknown)'} • {j.mode === 'strider' ? 'Strider Mode' : 'Company'}</div>
        </div>
        <div className="row" style={{gap: 8}}>
          <button className="btn btn-ghost" onClick={()=>setOpen(!open)}>{open ? 'Collapse' : 'Expand'}</button>
          <button className="btn btn-ghost" onClick={remove}>Delete</button>
        </div>
      </div>

      {open ? (
        <div style={{marginTop: 10}}>
          <div className="row" style={{gap: 8, flexWrap:'wrap'}}>
            <div className="field" style={{minWidth: 220}}>
              <div className="label">From</div>
              <input className="input" value={j.from ?? ''} onChange={(e)=>patch({from: e.target.value})} />
            </div>
            <div className="field" style={{minWidth: 220}}>
              <div className="label">To</div>
              <input className="input" value={j.to ?? ''} onChange={(e)=>patch({to: e.target.value})} />
            </div>
          </div>

          <div className="row" style={{justifyContent:'space-between', marginTop: 10}}>
            <div className="label">Events</div>
            <button className="btn btn-ghost" onClick={addEvent}>+ Add event</button>
          </div>

          {(j.events ?? []).length === 0 ? <div className="small muted">No events yet.</div> : (
            <div className="list">
              {(j.events ?? []).map((e:any)=>(
                <div key={e.id} className="card" style={{marginTop: 8}}>
                  <div className="row" style={{justifyContent:'space-between', gap: 8, flexWrap:'wrap'}}>
                    <input className="input" value={e.title ?? ''} onChange={(ev)=>patchEvent(e.id,{title: ev.target.value})} />
                    <button className="btn btn-ghost" onClick={()=>removeEvent(e.id)}>Remove</button>
                  </div>
                  <textarea className="input" style={{ marginTop: 8, minHeight: 70 }} value={e.body ?? ''} onChange={(ev)=>patchEvent(e.id,{body: ev.target.value})} />
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
