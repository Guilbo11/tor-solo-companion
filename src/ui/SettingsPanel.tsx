import React, { useState } from 'react';
import { Likelihood, StoredState } from '../core/storage';

export default function SettingsPanel({
  state,
  setState,
  onBackToCampaigns,
}: {
  state: StoredState;
  setState: React.Dispatch<React.SetStateAction<StoredState>>;
  onBackToCampaigns?: () => void;
}) {
  const campaigns = (state as any).campaigns ?? [];
  const campId = (state as any).activeCampaignId ?? (campaigns[0]?.id ?? 'camp-1');
  const oracle = (state as any).oracleByCampaign?.[campId] ?? (state as any).oracle;

  const [draft, setDraft] = useState(() => ({ ...oracle.likelihood }));

  const update = (l: Likelihood, field: 'yes' | 'maybe', val: number) => {
    setDraft((prev) => ({ ...prev, [l]: { ...prev[l], [field]: val } }));
  };

  const save = () => {
    // basic validation: yes <= maybe <= 100
    for (const l of Object.keys(draft) as Likelihood[]) {
      const yes = Number((draft as any)[l]?.yes ?? 0);
      const maybe = Number((draft as any)[l]?.maybe ?? 0);
      if (!(yes >= 0 && yes <= 100 && maybe >= 0 && maybe <= 100 && yes <= maybe)) {
        alert(`Invalid thresholds for ${l}. Ensure 0–100 and Yes ≤ Maybe.`);
        return;
      }
    }

    setState((prev) => {
      const current = (prev as any).oracleByCampaign?.[campId] ?? (prev as any).oracle;
      return {
        ...prev,
        oracleByCampaign: {
          ...((prev as any).oracleByCampaign ?? {}),
          [campId]: { ...current, likelihood: draft },
        },
      } as any;
    });
    alert('Saved.');
  };

  const currentTheme = state.settings?.theme === 'corebook' ? 'corebook' : 'dark';

  return (
    <div className="card">
      <div className="h2">Settings</div>
      <div className="muted small">
        Configure oracle likelihood thresholds to match Strider Mode exactly (as written in your PDF).
      </div>

      <hr />
      <div className="h2">Theme</div>
      <div className="card" style={{ padding: 12, marginTop: 10 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontWeight: 800 }}>App theme</div>
            <div className="small muted">Dark = current theme. Corebook = parchment styling inspired by the TOR corebook.</div>
          </div>
          <div className="segRow" aria-label="Theme selection">
            <button
              type="button"
              className={`seg ${currentTheme === 'dark' ? 'active' : ''}`}
              onClick={() => setState((prev) => ({ ...prev, settings: { ...(prev.settings ?? {}), theme: 'dark' } } as any))}
            >
              Dark
            </button>
            <button
              type="button"
              className={`seg ${currentTheme === 'corebook' ? 'active' : ''}`}
              onClick={() => setState((prev) => ({ ...prev, settings: { ...(prev.settings ?? {}), theme: 'corebook' } } as any))}
            >
              Corebook
            </button>
          </div>
        </div>
      </div>

      <hr />
      <div className="h2">Journal</div>
      <div className="card" style={{ padding: 12, marginTop: 10 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <div>
            <div style={{ fontWeight: 800 }}>Add rolls to journal</div>
            <div className="small muted">
              When enabled, dice + oracle results are appended to the currently active journal chapter.
            </div>
          </div>
          <label className="switch">
            <input
              type="checkbox"
              checked={!!state.settings?.addRollsToJournal}
              onChange={(e) => {
                const checked = e.target.checked;
                setState((prev) => ({ ...prev, settings: { ...(prev.settings ?? {}), addRollsToJournal: checked } } as any));
              }}
            />
            <span />
          </label>
        </div>
      </div>

      {onBackToCampaigns ? (
        <>
          <hr />
          <div className="h2">Campaigns</div>
          <div className="muted small">Return to the campaign landing page to create/rename/delete campaigns.</div>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn" onClick={onBackToCampaigns}>
              Back to Campaigns
            </button>
          </div>
        </>
      ) : null}

      <hr />
      <div className="h2">Oracle thresholds (1–100 roll)</div>
      <div className="row" style={{ flexDirection: 'column', gap: 10 }}>
        {(Object.keys(draft) as Likelihood[]).map((l) => (
          <div key={l} className="card" style={{ padding: 12 }}>
            <div style={{ fontWeight: 700 }}>{l}</div>
            <div className="kv" style={{ marginTop: 10 }}>
              <label className="small muted">Yes if ≤</label>
              <input className="input" type="number" value={draft[l].yes} onChange={(e) => update(l, 'yes', parseInt(e.target.value || '0', 10))} />
              <label className="small muted">Maybe if ≤</label>
              <input className="input" type="number" value={draft[l].maybe} onChange={(e) => update(l, 'maybe', parseInt(e.target.value || '0', 10))} />
            </div>
            <div className="small muted" style={{ marginTop: 8 }}>
              No if roll &gt; Maybe.
            </div>
          </div>
        ))}
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn" onClick={save}>
          Save
        </button>
        {onBackToCampaigns ? (
          <button className="btn btn-ghost" onClick={onBackToCampaigns}>
            Back to Campaigns
          </button>
        ) : null}
      </div>

      <hr />
      <div className="h2">Google Drive sync (optional)</div>
      <div className="muted small">
        I didn’t wire Google Drive in this prototype (it needs OAuth setup + a hosted backend or a Drive API client config). The simplest “cloud” workflow is: Export JSON → save it to Drive → Import JSON on another device.
      </div>
    </div>
  );
}
