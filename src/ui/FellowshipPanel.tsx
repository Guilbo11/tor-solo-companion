import React from 'react';
import { compendiums } from '../core/compendiums';

export default function FellowshipPanel({ state, setState }: { state: any; setState: (updater: any)=>void }) {
  const campaigns = (state as any).campaigns ?? [];
  const campId = (state as any).activeCampaignId ?? (campaigns[0]?.id ?? 'camp-1');
  const f = (state as any).fellowshipByCampaign?.[campId] ?? (state as any).fellowship ?? { mode: 'company', companyName: '' };
  const heroes = ((state as any).heroes ?? []).filter((h:any)=> (h.campaignId ?? campId) === campId);

  function patch(p: any) {
    setState((s:any)=> {
      const prevCampId = (s as any).activeCampaignId ?? campId;
      const current = (s as any).fellowshipByCampaign?.[prevCampId] ?? (s as any).fellowship ?? { mode: 'company', companyName: '' };
      return {
        ...s,
        fellowshipByCampaign: {
          ...((s as any).fellowshipByCampaign ?? {}),
          [prevCampId]: { ...current, ...p },
        },
      };
    });
  }

  return (
    <div className="panel">
      <h2>Fellowship</h2>

      <div className="section">
        <div className="row" style={{gap: 12, flexWrap:'wrap'}}>
          <div className="field" style={{minWidth: 220}}>
            <div className="label">Mode</div>
            <select className="input" value={f.mode ?? 'company'} onChange={(e)=>patch({ mode: e.target.value })}>
              <option value="company">Company (Group play)</option>
              <option value="strider">Strider Mode (Solo)</option>
            </select>
          </div>

          {f.mode === 'company' ? (
            <div className="field" style={{minWidth: 260, flex:1}}>
              <div className="label">Company name</div>
              <input className="input" value={f.companyName ?? ''} onChange={(e)=>patch({ companyName: e.target.value })} />
            </div>
          ) : (
            <div className="field" style={{minWidth: 260, flex:1}}>
              <div className="label">Focus hero</div>
              <select className="input" value={f.focusHeroId ?? ''} onChange={(e)=>patch({ focusHeroId: e.target.value || undefined })}>
                <option value="">(none)</option>
                {heroes.map((h:any)=> <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
              <div className="small">Used by Strider Mode for journey/solo tools later.</div>
            </div>
          )}
        </div>

        <div className="row" style={{gap:12, flexWrap:'wrap', marginTop: 10}}>
          <div className="field" style={{minWidth: 260, flex:1}}>
            <div className="label">Safe haven</div>
            <input className="input" value={f.safeHaven ?? ''} onChange={(e)=>patch({ safeHaven: e.target.value })} placeholder="e.g. Bree" />
          </div>
          <div className="field" style={{minWidth: 260, flex:1}}>
            <div className="label">Patron</div>
            <input className="input" value={f.patronId ?? ''} onChange={(e)=>patch({ patronId: e.target.value || undefined })} placeholder="(coming soon)" />
            <div className="small muted">Patrons compendium can be linked here later.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
