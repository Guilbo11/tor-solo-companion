import React, { useEffect, useMemo, useState } from 'react';
import type { NPC, StoredState } from '../core/storage';
import { compendiums, findEntryById, sortByName } from '../core/compendiums';
import { loadLoreTable, type LoreTableData } from '../core/loreTable';

type Props = { state: StoredState; setState: (s: StoredState) => void };

function uid(prefix='npc'){ return `${prefix}-${crypto.randomUUID()}`; }

function sample<T>(arr: T[]): T | undefined {
  return arr.length ? arr[Math.floor(Math.random() * arr.length)] : undefined;
}

function pickDistinct(
  tries: number,
  pick: () => string,
  used: Set<string>
): string {
  for (let i = 0; i < tries; i++) {
    const t = pick().trim();
    if (!t) continue;
    if (used.has(t)) continue;
    used.add(t);
    return t;
  }
  return '';
}

function rollLorePick(rows: { action: string; aspect: string; focus: string }[]) {
  const r = sample(rows) ?? { action: '', aspect: '', focus: '' };
  return {
    action: String((r as any).action ?? '').trim(),
    aspect: String((r as any).aspect ?? '').trim(),
    focus: String((r as any).focus ?? '').trim(),
  };
}

function randomGender(): 'Masculine'|'Feminine'|'Other' {
  const g = sample(['Masculine','Feminine','Other'] as const);
  return (g ?? 'Other') as any;
}

export default function NPCsPanel({ state, setState }: Props) {
  const campId = state.activeCampaignId ?? state.campaigns?.[0]?.id ?? 'camp-1';
  const npcs = (state.npcs ?? []).filter(n => n.campaignId === campId);

  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState<Partial<NPC>>({});
  const [lore, setLore] = useState<LoreTableData | null>(null);
  const [loreError, setLoreError] = useState<string | null>(null);

  const cultures = useMemo(() => sortByName(compendiums.cultures.entries ?? []), []);

  useEffect(() => {
    let mounted = true;
    loadLoreTable()
      .then((d) => {
        if (!mounted) return;
        setLore(d);
        setLoreError(null);
      })
      .catch((e) => {
        if (!mounted) return;
        setLore(null);
        setLoreError(e?.message ?? 'Failed to load lore table');
      });
    return () => {
      mounted = false;
    };
  }, []);

  const loreRows = useMemo(() => {
    const rows: { action: string; aspect: string; focus: string }[] = [];
    if (!lore) return rows;
    for (const feat of Object.keys(lore.tables ?? {})) {
      for (const r of lore.tables[feat] ?? []) {
        rows.push({ action: r.action, aspect: r.aspect, focus: r.focus });
      }
    }
    return rows;
  }, [lore]);

  const startCreate = () => {
    setDraft({
      id: uid(),
      campaignId: campId,
      name: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      gender: 'Other',
      collapsed: false,
      firstLook: [],
      motivations: [],
      goal: '',
      location: '',
      notesHtml: '',
    });
    setCreateOpen(true);
  };

  const patchDraft = (p: Partial<NPC>) => setDraft(d => ({ ...d, ...p }));

  const cultureEntry: any = draft.cultureId ? findEntryById(compendiums.cultures.entries ?? [], draft.cultureId) : null;

  const rollName = () => {
    const c:any = cultureEntry;
    const male: string[] = Array.isArray(c?.names?.male) ? c.names.male : [];
    const female: string[] = Array.isArray(c?.names?.female) ? c.names.female : [];
    const g = String(draft.gender ?? 'Other');
    const pool = g==='Masculine' ? male : g==='Feminine' ? female : [...male, ...female];
    const pick = pool.length ? pool[Math.floor(Math.random()*pool.length)] : `NPC ${npcs.length + 1}`;
    patchDraft({ name: pick });
  };

  const rollAspects = () => {
    if (!loreRows.length) return;
    const used = new Set<string>();
    const a1 = pickDistinct(24, () => rollLorePick(loreRows).aspect, used);
    const a2 = pickDistinct(24, () => rollLorePick(loreRows).aspect, used);
    patchDraft({ firstLook: [a1, a2].filter(Boolean) });
  };

  const rollGoal = () => {
    if (!loreRows.length) return;
    // Ensure we don't get identical tokens (e.g. same word for action + focus)
    const used = new Set<string>();
    const action = pickDistinct(24, () => rollLorePick(loreRows).action, used);
    const focus = pickDistinct(24, () => rollLorePick(loreRows).focus, used);
    patchDraft({ goal: [action, focus].filter(Boolean).join(' ') });
  };

  const rollMotivations = () => {
    if (!loreRows.length) return;
    const used = new Set<string>();
    const m1 = pickDistinct(24, () => rollLorePick(loreRows).focus, used);
    const m2 = pickDistinct(24, () => rollLorePick(loreRows).action, used);
    patchDraft({ motivations: [m1, m2].filter(Boolean) });
  };

  const randomizeAll = () => {
    // Quick NPC creation: fill every field except Location.
    const nextCultureId = String(draft.cultureId ?? sample(cultures as any[])?.id ?? '');
    const nextGender = randomGender();
    patchDraft({ cultureId: nextCultureId, gender: nextGender });

    // Culture change affects name pool, so roll name after patching culture/gender.
    window.setTimeout(() => {
      rollName();
      rollAspects();
      rollGoal();
      rollMotivations();
    }, 0);
  };

  const saveNpc = () => {
    const n: NPC = {
      ...(draft as any),
      name: String(draft.name ?? '').trim() || `NPC ${npcs.length + 1}`,
      updatedAt: new Date().toISOString(),
    };
    const others = (state.npcs ?? []).filter(x => x.campaignId !== campId);
    const existing = npcs.find(x => x.id === n.id);
    const nextList = existing ? [...others, ...npcs.map(x => x.id === n.id ? n : x)] : [...others, n, ...npcs];
    setState({ ...state, npcs: nextList });
    setCreateOpen(false);
  };

  const toggleCollapse = (id: string) => {
    setState({
      ...state,
      npcs: (state.npcs ?? []).map(n => n.id === id ? { ...n, collapsed: !n.collapsed } : n),
    });
  };

  const editNpc = (id: string) => {
    const n = (state.npcs ?? []).find(x => x.id === id);
    if (!n) return;
    setDraft({ ...n });
    setCreateOpen(true);
  };

  const removeNpc = (id: string) => {
    const n = (state.npcs ?? []).find(x => x.id === id);
    if (!n) return;
    if (!confirm(`Delete ${n.name}?`)) return;
    setState({ ...state, npcs: (state.npcs ?? []).filter(x => x.id !== id) });
  };

  return (
    <div className="card">
      <div className="row" style={{justifyContent:'space-between', alignItems:'center'}}>
        <div>
          <div className="h2">NPCs</div>
          <div className="small muted">Per-campaign list. Tap a row to reveal details.</div>
        </div>
        <button className="btn" onClick={startCreate}>+ NPC</button>
      </div>

      <div style={{marginTop: 12}}>
        {npcs.length === 0 ? (
          <div className="muted">No NPCs yet.</div>
        ) : (
          npcs.map(n => (
            <div key={n.id} className="npcRow">
              <div className="row" style={{justifyContent:'space-between', alignItems:'center', gap: 10}}>
                <button className="npcToggle" onClick={()=>toggleCollapse(n.id)} aria-label="Toggle details">
                  {n.collapsed ? '▸' : '▾'}
                </button>

                <div style={{flex: 1, fontWeight: 800, display:'flex', gap: 8, alignItems:'baseline', flexWrap:'wrap'}}>
                  <span>{n.name}</span>
                  {n.location ? <span className="small muted">({n.location})</span> : null}
                </div>

                <div className="row" style={{gap: 8}}>
                  <button className="btn btn-ghost" aria-label="Edit" onClick={()=>editNpc(n.id)}>✏️</button>
                  <button className="btn-danger" aria-label="Delete" onClick={()=>removeNpc(n.id)}>🗑️</button>
                </div>
              </div>

              {!n.collapsed && (
                <div className="npcDetails">
                  <div className="kv"><div className="k">Culture</div><div className="v">{findEntryById(compendiums.cultures.entries ?? [], n.cultureId)?.name ?? '—'}</div></div>
                  <div className="kv"><div className="k">Gender</div><div className="v">{n.gender ?? '—'}</div></div>
                  <div className="kv"><div className="k">First look</div><div className="v">{(n.firstLook ?? []).filter(Boolean).join(' • ') || '—'}</div></div>
                  <div className="kv"><div className="k">Goal</div><div className="v">{n.goal || '—'}</div></div>
                  <div className="kv"><div className="k">Motivations</div><div className="v">{(n.motivations ?? []).filter(Boolean).join(' • ') || '—'}</div></div>
                  <div className="kv"><div className="k">Location</div><div className="v">{n.location || '—'}</div></div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {createOpen && (
        <div className="sideModal">
          <div className="sideModalCard">
            <div className="row" style={{justifyContent:'space-between', alignItems:'center'}}>
              <div className="h2" style={{fontSize: 18}}>{npcs.some(x=>x.id===draft.id) ? 'Edit NPC' : 'New NPC'}</div>
              <div className="row" style={{gap: 8, alignItems:'center'}}>
                <button className="btn" onClick={randomizeAll} disabled={!!loreError}>Random all</button>
                <button className="btn btn-ghost" onClick={()=>setCreateOpen(false)}>Close</button>
              </div>
            </div>

            <div style={{marginTop: 10}}>
              <div className="label">Culture</div>
              <select className="input" value={draft.cultureId ?? ''} onChange={(e)=>patchDraft({ cultureId: e.target.value })}>
                <option value="">(choose)</option>
                {cultures.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>

              <div className="label" style={{marginTop: 10}}>Gender</div>
              <select className="input" value={draft.gender ?? 'Other'} onChange={(e)=>patchDraft({ gender: e.target.value as any })}>
                <option value="Masculine">Masculine</option>
                <option value="Feminine">Feminine</option>
                <option value="Other">Other</option>
              </select>

              <div className="label" style={{marginTop: 10}}>Name</div>
              <div className="row" style={{gap: 8}}>
                <input className="input" value={draft.name ?? ''} onChange={(e)=>patchDraft({ name: e.target.value })} />
                <button className="btn" onClick={rollName}>Random</button>
              </div>

              <hr style={{margin:'14px 0'}} />

              <div className="row" style={{justifyContent:'space-between', alignItems:'center'}}>
                <div className="h2" style={{fontSize: 16}}>First look</div>
                <button className="btn" onClick={rollAspects}>Random</button>
              </div>
              <div className="row" style={{gap: 8, marginTop: 8}}>
                <input className="input" placeholder="First look 1" value={(draft.firstLook?.[0] ?? '')} onChange={(e)=>patchDraft({ firstLook: [e.target.value, draft.firstLook?.[1] ?? ''] as any })} />
                <input className="input" placeholder="First look 2" value={(draft.firstLook?.[1] ?? '')} onChange={(e)=>patchDraft({ firstLook: [draft.firstLook?.[0] ?? '', e.target.value] as any })} />
              </div>

              <div className="row" style={{justifyContent:'space-between', alignItems:'center', marginTop: 14}}>
                <div className="h2" style={{fontSize: 16}}>Goal</div>
                <button className="btn" onClick={rollGoal}>Random</button>
              </div>
              <input className="input" style={{marginTop: 8}} value={draft.goal ?? ''} onChange={(e)=>patchDraft({ goal: e.target.value })} />

              <div className="row" style={{justifyContent:'space-between', alignItems:'center', marginTop: 14}}>
                <div className="h2" style={{fontSize: 16}}>Motivations</div>
                <button className="btn" onClick={rollMotivations}>Random</button>
              </div>
              <div className="row" style={{gap: 8, marginTop: 8}}>
                <input className="input" placeholder="Motivation 1" value={(draft.motivations?.[0] ?? '')} onChange={(e)=>patchDraft({ motivations: [e.target.value, draft.motivations?.[1] ?? ''] as any })} />
                <input className="input" placeholder="Motivation 2" value={(draft.motivations?.[1] ?? '')} onChange={(e)=>patchDraft({ motivations: [draft.motivations?.[0] ?? '', e.target.value] as any })} />
              </div>

              <div className="label" style={{marginTop: 14}}>Location</div>
              <input className="input" value={draft.location ?? ''} onChange={(e)=>patchDraft({ location: e.target.value })} />

              <div className="label" style={{marginTop: 14}}>Notes</div>
              <textarea
                className="input"
                style={{ minHeight: 120, whiteSpace: 'pre-wrap' }}
                value={draft.notesHtml ?? ''}
                onChange={(e)=>patchDraft({ notesHtml: e.target.value })}
                placeholder="Notes..."
              />

              <button className="btn" style={{width:'100%', marginTop: 14}} onClick={saveNpc}>Save NPC</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
