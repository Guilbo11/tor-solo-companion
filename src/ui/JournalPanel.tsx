
import React, { useMemo, useState } from 'react';
import type { Journey, StoredState, JourneyRole } from '../core/storage';

function roleLabel(r: JourneyRole) {
  return r;
}

export function JournalPanel(props: { state: StoredState; setState: (s: StoredState) => void }) {
  const { state, setState } = props;
  const [view, setView] = useState<'journeys'|'notes'>('journeys');

  const journeys = useMemo(() => [...state.journeys].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)), [state.journeys]);

  function addJourney() {
    const now = new Date().toISOString();
    const j: Journey = {
      id: crypto.randomUUID(),
      title: 'New Journey',
      mode: state.mode,
      createdAt: now,
      updatedAt: now,
      origin: '',
      destination: '',
      roles: {},
      events: [],
      notes: '',
    };
    setState({ ...state, journeys: [j, ...state.journeys] });
  }

  function updateJourney(id: string, patch: Partial<Journey>) {
    const journeys = state.journeys.map(j => j.id===id ? { ...j, ...patch, updatedAt: new Date().toISOString() } : j);
    setState({ ...state, journeys });
  }

  function removeJourney(id: string) {
    setState({ ...state, journeys: state.journeys.filter(j=>j.id!==id) });
  }

  return (
    <div className="panel">
      <div className="panelHeader">
        <div className="panelTitle">Journal</div>
        <div className="row gap">
          <button className={"btn " + (view==='journeys' ? "primary" : "")} onClick={()=>setView('journeys')}>Journeys</button>
          <button className={"btn " + (view==='notes' ? "primary" : "")} onClick={()=>setView('notes')}>Notes</button>
          {view==='journeys' && <button className="btn primary" onClick={addJourney}>+ Add</button>}
        </div>
      </div>

      {view === 'journeys' ? (
        <div className="cards">
          {journeys.length===0 && <div className="muted">No journeys yet.</div>}
          {journeys.map(j => (
            <div key={j.id} className="card">
              <div className="cardTop">
                <input className="input title" value={j.title} onChange={(e)=>updateJourney(j.id,{ title: e.target.value })} />
                <div className="row">
                  <span className="pill">{j.mode === 'strider' ? 'Strider' : 'Normal'}</span>
                  <button className="btn danger" onClick={()=>removeJourney(j.id)}>✕</button>
                </div>
              </div>

              <div className="grid2">
                <label className="field">
                  <span>Origin</span>
                  <input className="input" value={j.origin} onChange={(e)=>updateJourney(j.id,{ origin: e.target.value })} />
                </label>
                <label className="field">
                  <span>Destination</span>
                  <input className="input" value={j.destination} onChange={(e)=>updateJourney(j.id,{ destination: e.target.value })} />
                </label>
              </div>

              <details className="details">
                <summary>Roles</summary>
                <div className="grid2">
                  {(['Guide','Scout','Look-out','Hunter'] as JourneyRole[]).map(r=>(
                    <label key={r} className="field">
                      <span>{roleLabel(r)}</span>
                      <select className="select" value={j.roles[r] ?? ''} onChange={(e)=>{
                        const roles = { ...j.roles, [r]: e.target.value || undefined };
                        updateJourney(j.id,{ roles });
                      }}>
                        <option value="">—</option>
                        {state.heroes.map(h=>(
                          <option key={h.id} value={h.id}>{h.name}</option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                <div className="muted">
                  Strider Mode: you can leave roles blank and treat the hero as covering them as needed.
                </div>
              </details>

              <details className="details" open>
                <summary>Events</summary>
                <button className="btn" onClick={()=>{
                  const events = [{ id: crypto.randomUUID(), title: 'Event', body: '', day: undefined }, ...j.events];
                  updateJourney(j.id,{ events });
                }}>+ Add event</button>

                <div className="events">
                  {j.events.map(ev=>(
                    <div key={ev.id} className="eventCard">
                      <div className="row gap">
                        <input className="input" value={ev.title} onChange={(e)=>{
                          const events = j.events.map(x=>x.id===ev.id ? { ...x, title: e.target.value } : x);
                          updateJourney(j.id,{ events });
                        }} />
                        <input className="input small" placeholder="Day" type="number" value={ev.day ?? ''} onChange={(e)=>{
                          const v = e.target.value === '' ? undefined : Number(e.target.value);
                          const events = j.events.map(x=>x.id===ev.id ? { ...x, day: v } : x);
                          updateJourney(j.id,{ events });
                        }} />
                        <button className="btn danger" onClick={()=>{
                          updateJourney(j.id,{ events: j.events.filter(x=>x.id!==ev.id) });
                        }}>Remove</button>
                      </div>
                      <textarea className="textarea" value={ev.body} onChange={(e)=>{
                        const events = j.events.map(x=>x.id===ev.id ? { ...x, body: e.target.value } : x);
                        updateJourney(j.id,{ events });
                      }} />
                    </div>
                  ))}
                </div>
              </details>

              <label className="field">
                <span>Notes</span>
                <textarea className="textarea" value={j.notes} onChange={(e)=>updateJourney(j.id,{ notes: e.target.value })} />
              </label>
            </div>
          ))}
        </div>
      ) : (
        <div className="muted">
          Notes view is kept for backward compatibility (v1 journal). We can later merge notes into Journeys or link notes to map hexes.
        </div>
      )}
    </div>
  );
}
