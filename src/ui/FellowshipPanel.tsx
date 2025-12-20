
import React, { useMemo, useState } from 'react';
import { BottomSheet } from './BottomSheet';
import { Patrons, findById, sortByName } from '../core/compendiums';
import type { StoredState, GameMode } from '../core/storage';

export function FellowshipPanel(props: { state: StoredState; setState: (s: StoredState) => void }) {
  const { state, setState } = props;
  const f = state.fellowship;

  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetTitle, setSheetTitle] = useState('');
  const [sheetBody, setSheetBody] = useState<React.ReactNode>(null);

  const patron = f.patronId ? findById(Patrons, f.patronId) : null;

  function setMode(mode: GameMode) {
    setState({
      ...state,
      mode,
      fellowship: { ...state.fellowship, mode, fellowshipFocusHeroId: mode==='strider' ? null : state.fellowship.fellowshipFocusHeroId },
    });
  }

  return (
    <div className="panel">
      <div className="panelHeader">
        <div className="panelTitle">Fellowship</div>
        <select className="select" value={state.mode} onChange={(e)=>setMode(e.target.value as any)}>
          <option value="normal">Normal mode</option>
          <option value="strider">Strider mode</option>
        </select>
      </div>

      <div className="grid2">
        <label className="field">
          <span>Safe Haven</span>
          <input className="input" value={f.safeHaven} onChange={(e)=>setState({ ...state, fellowship: { ...f, safeHaven: e.target.value } })} />
        </label>

        <label className="field">
          <span>Patron</span>
          <select className="select" value={f.patronId ?? ''} onChange={(e)=>setState({ ...state, fellowship: { ...f, patronId: e.target.value || null } })}>
            <option value="">—</option>
            {sortByName(Patrons.entries).map(p=>(
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="row gap">
        <button className="btn" disabled={!patron} onClick={()=>{
          if (!patron) return;
          setSheetTitle(patron.name);
          setSheetBody(<div className="muted">{patron.description ?? 'No details yet (table-driven patron details can be added later).'}</div>);
          setSheetOpen(true);
        }}>See more</button>
      </div>

      {state.mode === 'normal' ? (
        <div className="grid2">
          <label className="field">
            <span>Fellowship Rating</span>
            <input className="input" type="number" value={f.fellowshipRating} onChange={(e)=>setState({ ...state, fellowship: { ...f, fellowshipRating: Number(e.target.value) } })} />
          </label>
          <label className="field">
            <span>Fellowship Focus</span>
            <select className="select" value={f.fellowshipFocusHeroId ?? ''} onChange={(e)=>setState({ ...state, fellowship: { ...f, fellowshipFocusHeroId: e.target.value || null } })}>
              <option value="">—</option>
              {state.heroes.map(h=>(
                <option key={h.id} value={h.id}>{h.name}</option>
              ))}
            </select>
          </label>
        </div>
      ) : (
        <div className="muted">
          Strider Mode: Fellowship Focus is not used. Keep Safe Haven and Patron updated for solo play.
        </div>
      )}

      <label className="field">
        <span>Notes</span>
        <textarea className="textarea" value={f.notes} onChange={(e)=>setState({ ...state, fellowship: { ...f, notes: e.target.value } })} />
      </label>

      <BottomSheet open={sheetOpen} title={sheetTitle} onClose={()=>setSheetOpen(false)}>
        {sheetBody}
      </BottomSheet>
    </div>
  );
}
