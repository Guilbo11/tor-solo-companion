import React, { useState } from 'react';
import { Likelihood, StoredState } from '../core/storage';

export default function SettingsPanel({ state, setState }: { state: StoredState; setState: (s: StoredState) => void }) {
  const [draft, setDraft] = useState(() => ({ ...state.oracle.likelihood }));

  const update = (l: Likelihood, field: 'yes'|'maybe', val: number) => {
    setDraft(prev => ({ ...prev, [l]: { ...prev[l], [field]: val } }));
  };

  const save = () => {
    // basic validation: yes <= maybe <= 100
    for (const l of Object.keys(draft) as Likelihood[]) {
      const { yes, maybe } = draft[l];
      if (!(yes >= 0 && yes <= 100 && maybe >= 0 && maybe <= 100 && yes <= maybe)) {
        alert(`Invalid thresholds for ${l}. Need 0<=yes<=maybe<=100.`);
        return;
      }
    }
    setState({ ...state, oracle: { ...state.oracle, likelihood: draft } });
    alert('Saved.');
  };

  return (
    <div className="card">
      <div className="h2">Settings</div>
      <div className="muted small">
        Configure oracle likelihood thresholds to match Strider Mode exactly (as written in your PDF).
      </div>

      <hr />
      <div className="h2">Oracle thresholds (1–100 roll)</div>
      <div className="row" style={{ flexDirection: 'column', gap: 10 }}>
        {(Object.keys(draft) as Likelihood[]).map(l => (
          <div key={l} className="card" style={{ padding: 12 }}>
            <div style={{ fontWeight: 700 }}>{l}</div>
            <div className="kv" style={{ marginTop: 10 }}>
              <label className="small muted">Yes if ≤</label>
              <input className="input" type="number" value={draft[l].yes} onChange={e => update(l,'yes', parseInt(e.target.value||'0',10))} />
              <label className="small muted">Maybe if ≤</label>
              <input className="input" type="number" value={draft[l].maybe} onChange={e => update(l,'maybe', parseInt(e.target.value||'0',10))} />
            </div>
            <div className="small muted" style={{ marginTop: 8 }}>
              No if roll &gt; Maybe.
            </div>
          </div>
        ))}
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn" onClick={save}>Save</button>
      </div>

      <hr />
      <div className="h2">Google Drive sync (optional)</div>
      <div className="muted small">
        I didn’t wire Google Drive in this prototype (it needs OAuth setup + a hosted backend or a Drive API client config).
        The simplest “cloud” workflow is: Export JSON → save it to Drive → Import JSON on another device.
      </div>
    </div>
  );
}
