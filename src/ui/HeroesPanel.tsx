import React, { useMemo, useState } from 'react';
import { StoredState, saveState } from '../core/storage';
import { compendiums, findEntryById, sortByName } from '../core/compendiums';
import BottomSheet from './BottomSheet';

type Props = {
  state: StoredState;
  setState: React.Dispatch<React.SetStateAction<StoredState>>;
};

function uid(prefix: string) {
  return prefix + '-' + Math.random().toString(36).slice(2, 10);
}

export default function HeroesPanel({ state, setState }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(state.ui?.heroesExpandedId ?? null);
  const [activeId, setActiveId] = useState<string | null>(state.ui?.activeHeroId ?? null);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetTitle, setSheetTitle] = useState('');
  const [sheetBody, setSheetBody] = useState<{ description?: string; flavor?: string } | null>(null);

  const heroes = state.heroes ?? [];

  const skillsByGroup = useMemo(() => {
    const groups: Record<string, any[]> = { Personality: [], Movement: [], Perception: [], Survival: [], Custom: [], Vocation: [] };
    const entries = compendiums.skills.entries ?? [];
    for (const e of entries) groups[e.group || 'Custom'].push(e);
    for (const k of Object.keys(groups)) groups[k] = sortByName(groups[k]);
    return groups;
  }, []);

  function getCultureEntry(cultureId?: string) {
    return findEntryById(compendiums.cultures.entries ?? [], cultureId);
  }

  function applyCultureAutofill(hero: any) {
    const c: any = getCultureEntry(hero.cultureId);
    if (!c) return;
    const nextRatings = { ...(hero.skillRatings ?? {}) };
    if (c.startingSkills) {
      for (const [sid, val] of Object.entries(c.startingSkills)) {
        nextRatings[sid] = val as any;
      }
    }
    updateHero(hero.id, { skillRatings: nextRatings });
  }

  function autoFillWarGear(hero: any) {
    const c: any = getCultureEntry(hero.cultureId);
    const sol: string = (c?.standardOfLiving ?? hero.standardOfLiving ?? 'Common') as any;
    // Simple default kit by Standard of Living (editable afterwards)
    const kitBySol: Record<string, string[]> = {
      'Frugal': ['short-sword','leather-shirt','buckler'],
      'Common': ['sword','leather-shirt','shield'],
      'Prosperous': ['sword','leather-corslet','shield'],
      'Rich': ['long-sword','coat-of-mail','shield','helm'],
      'Very Rich': ['long-sword','coat-of-mail','great-shield','helm'],
    };
    const ids = kitBySol[sol] ?? kitBySol['Common'];
    const added = ids
      .map(id => findEntryById(compendiums.equipment.entries ?? [], id))
      .filter(Boolean)
      .map((e:any) => ({ name: e.name, qty: 1, ref: { pack: 'tor2e-equipment', id: e.id } }));
    const cur = hero.inventory ?? [];
    // Remove existing war-gear items that we are about to add (by ref id)
    const filtered = cur.filter((it:any) => !(it.ref?.pack === 'tor2e-equipment' && ids.includes(it.ref?.id)));
    updateHero(hero.id, { inventory: [...added, ...filtered] });
  }

  function roll1d6() {
    return 1 + Math.floor(Math.random() * 6);
  }

  function addVirtueRoll(hero: any) {
    const entries = sortByName(compendiums.virtues.entries ?? []);
    if (entries.length === 0) return;
    const idx = roll1d6() - 1;
    const picked = entries[Math.min(idx, entries.length - 1)];
    const cur: string[] = hero.virtueIds ?? [];
    if (cur.includes(picked.id)) return;
    updateHero(hero.id, { virtueIds: [picked.id, ...cur] });
  }

  function addRewardRoll(hero: any) {
    const entries = sortByName(compendiums.rewards.entries ?? []);
    if (entries.length === 0) return;
    const idx = roll1d6() - 1;
    const picked = entries[Math.min(idx, entries.length - 1)];
    const cur: string[] = hero.rewardIds ?? [];
    if (cur.includes(picked.id)) return;
    updateHero(hero.id, { rewardIds: [picked.id, ...cur] });
  }

  function persistUI(nextExpanded: string | null, nextActive: string | null, nextState?: StoredState) {
    const s = nextState ?? state;
    const updated: StoredState = {
      ...s,
      ui: { ...(s.ui ?? {}), heroesExpandedId: nextExpanded, activeHeroId: nextActive },
    };
    setState(updated);
    saveState(updated);
  }

  function addHero() {
    const now = new Date().toISOString();
    const newHero = {
      id: uid('hero'),
      name: 'New Hero',
      createdAt: now,
      updatedAt: now,
      tnDefault: 20,
      cultureId: '',
      callingId: '',
      featureIds: [],
      skillRatings: Object.fromEntries((compendiums.skills.entries ?? []).map((s: any) => [s.id, 0])),
      skillFavoured: {},
      virtueIds: [],
      rewardIds: [],
      inventory: [],
      notes: '',
    };
    const next: StoredState = { ...state, heroes: [newHero, ...heroes] };
    setState(next);
    saveState(next);
    setExpandedId(newHero.id);
    setActiveId(newHero.id);
    persistUI(newHero.id, newHero.id, next);
  }

  function updateHero(id: string, patch: any) {
    const nextHeroes = heroes.map(h => h.id === id ? { ...h, ...patch, updatedAt: new Date().toISOString() } : h);
    const next: StoredState = { ...state, heroes: nextHeroes };
    setState(next);
    saveState(next);
  }

  function openEntry(pack: 'skills'|'features'|'cultures'|'callings'|'virtues'|'rewards'|'equipment', id: string) {
    const entry = findEntryById((compendiums as any)[pack].entries ?? [], id);
    if (!entry) return;
    setSheetTitle(entry.name);
    setSheetBody({ description: entry.description, flavor: entry.flavor });
    setSheetOpen(true);
  }

  const cultureOptions = sortByName(compendiums.cultures.entries ?? []);
  const callingOptions = sortByName(compendiums.callings.entries ?? []);
  const featureOptions = sortByName(compendiums.features.entries ?? []);

  return (
    <div className="panel">
      <div className="panelHeader">
        <div className="panelTitle">Heroes</div>
        <button className="btn" onClick={addHero}>+ Add</button>
      </div>

      <div className="hint">
        Tap a skill or feature name to open <b>See more</b> (bottom sheet).
      </div>

      {heroes.length === 0 && (
        <div className="empty">No heroes yet. Click <b>+ Add</b> to create one.</div>
      )}

      <div className="cards">
        {heroes.map(hero => {
          const isExpanded = expandedId === hero.id;
          const isActive = activeId === hero.id;

          const culture = findEntryById(compendiums.cultures.entries ?? [], hero.cultureId)?.name || (hero.cultureId ? hero.cultureId : '—');
          const calling = findEntryById(compendiums.callings.entries ?? [], hero.callingId)?.name || (hero.callingId ? hero.callingId : '—');

          return (
            <div key={hero.id} className={"card " + (isActive ? "active" : "")}>
              <div className="cardTop">
                <div className="cardTopLeft" onClick={() => {
                  const next = isExpanded ? null : hero.id;
                  setExpandedId(next);
                  setActiveId(hero.id);
                  persistUI(next, hero.id);
                }}>
                  <div className="heroName">{hero.name}</div>
                  <div className="sub">{culture} • {calling}</div>
                </div>

                <div className="cardTopRight">
                  <button className={"btn btn-ghost"} onClick={() => {
                    const next = isExpanded ? null : hero.id;
                    setExpandedId(next);
                    setActiveId(hero.id);
                    persistUI(next, hero.id);
                  }}>{isExpanded ? 'Hide' : 'Show'}</button>
                </div>
              </div>

              {isExpanded && (
                <div className="cardBody">
                  <div className="row">
                    <div className="field">
                      <div className="label">Name</div>
                      <input className="input" value={hero.name} onChange={(e)=>updateHero(hero.id,{name:e.target.value})}/>
                    </div>
                    <div className="field">
                      <div className="label">Default TN</div>
                      <input className="input" type="number" min={10} max={30} value={hero.tnDefault ?? 20}
                        onChange={(e)=>updateHero(hero.id,{tnDefault: Number(e.target.value)})}/>
                      <div className="small">Typical: 20 (Group), 18 (Strider)</div>
                    </div>
                  </div>

                  <div className="row">
                    <div className="field">
                      <div className="label">Culture</div>
                      <select className="input" value={hero.cultureId ?? ''} onChange={(e)=>updateHero(hero.id,{cultureId:e.target.value})}>
                        <option value="">(none)</option>
                        {cultureOptions.map((c:any)=> <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      {hero.cultureId && <button className="btn btn-ghost" onClick={()=>openEntry('cultures', hero.cultureId)}>See more</button>}
                      {hero.cultureId && (
                        <div className="row" style={{marginTop: 6, gap: 8, flexWrap: 'wrap'}}>
                          <button className="btn btn-ghost" onClick={()=>applyCultureAutofill(hero)}>Auto-fill Skills</button>
                          <button className="btn btn-ghost" onClick={()=>autoFillWarGear(hero)}>Auto-fill War Gear</button>
                          {(() => {
                            const c:any = getCultureEntry(hero.cultureId);
                            return c?.standardOfLiving ? <span className="small">Standard of Living: {c.standardOfLiving}</span> : null;
                          })()}
                        </div>
                      )}

                      {cultureOptions.length === 0 && <div className="small">Culture compendium is empty (OK for now).</div>}
                    </div>

                    <div className="field">
                      <div className="label">Calling</div>
                      <select className="input" value={hero.callingId ?? ''} onChange={(e)=>updateHero(hero.id,{callingId:e.target.value})}>
                        <option value="">(none)</option>
                        {callingOptions.map((c:any)=> <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      {hero.callingId && <button className="btn btn-ghost" onClick={()=>openEntry('callings', hero.callingId)}>See more</button>}
                      {callingOptions.length === 0 && <div className="small">Calling compendium is empty (OK for now).</div>}
                    </div>
                  </div>

                  <div className="section">
                    <div className="sectionTitle">Distinctive Features</div>
                    <div className="small">Select up to 2 (editable later).</div>
                    <div className="pillGrid">
                      {featureOptions.map((f:any)=>{
                        const selected = (hero.featureIds ?? []).includes(f.id);
                        return (
                          <div key={f.id} className={"pill " + (selected ? "on" : "")}
                               onClick={()=> {
                                 const cur = hero.featureIds ?? [];
                                 const next = selected ? cur.filter((x:string)=>x!==f.id) : [...cur, f.id].slice(0,2);
                                 updateHero(hero.id,{featureIds: next});
                               }}>
                            <span onClick={(e)=>{ e.stopPropagation(); openEntry('features', f.id); }} className="pillName">{f.name}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

<div className="section">
                    <div className="sectionTitle">Virtues & Rewards</div>
                    <div className="row" style={{gap: 8, flexWrap:'wrap'}}>
                      <button className="btn btn-ghost" onClick={()=>addVirtueRoll(hero)}>Roll Virtue (1d6)</button>
                      <button className="btn btn-ghost" onClick={()=>addRewardRoll(hero)}>Roll Reward (1d6)</button>
                    </div>

                    <div className="row" style={{marginTop: 8, gap: 12, flexWrap:'wrap'}}>
                      <div style={{flex:1, minWidth: 240}}>
                        <div className="label">Virtues</div>
                        {(hero.virtueIds ?? []).length === 0 ? <div className="small muted">None yet.</div> : null}
                        {(hero.virtueIds ?? []).map((vid:string)=> {
                          const v:any = findEntryById(compendiums.virtues.entries ?? [], vid);
                          return (
                            <div key={vid} className="pillRow">
                              <button className="btn btn-ghost" onClick={()=>openEntry('virtues', vid)}>{v?.name ?? vid}</button>
                              <button className="btn btn-ghost" onClick={()=>{
                                const cur = hero.virtueIds ?? [];
                                updateHero(hero.id, { virtueIds: cur.filter((x:string)=>x!==vid) });
                              }}>Remove</button>
                            </div>
                          );
                        })}
                      </div>

                      <div style={{flex:1, minWidth: 240}}>
                        <div className="label">Rewards</div>
                        {(hero.rewardIds ?? []).length === 0 ? <div className="small muted">None yet.</div> : null}
                        {(hero.rewardIds ?? []).map((rid:string)=> {
                          const r:any = findEntryById(compendiums.rewards.entries ?? [], rid);
                          return (
                            <div key={rid} className="pillRow">
                              <button className="btn btn-ghost" onClick={()=>openEntry('rewards', rid)}>{r?.name ?? rid}</button>
                              <button className="btn btn-ghost" onClick={()=>{
                                const cur = hero.rewardIds ?? [];
                                updateHero(hero.id, { rewardIds: cur.filter((x:string)=>x!==rid) });
                              }}>Remove</button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="section">
                    <div className="sectionTitle">Skills</div>
                    {Object.keys(skillsByGroup).map(group => (
                      <details key={group} className="details" open={group==='Personality'}>
                        <summary>{group}</summary>
                        <div className="skillsList">
                          {skillsByGroup[group].map((s:any)=>{
                            const rating = hero.skillRatings?.[s.id] ?? 0;
                            const fav = hero.skillFavoured?.[s.id] ?? false;
                            return (
                              <div key={s.id} className="skillRow">
                                <div className="skillName" onClick={()=>openEntry('skills', s.id)}>{s.name}</div>
                                <div className="skillMeta">{s.attribute}</div>
                                <button className={"btn btn-ghost " + (fav ? "on" : "")} onClick={()=>updateHero(hero.id,{skillFavoured:{...(hero.skillFavoured??{}),[s.id]:!fav}})}>
                                  Fav
                                </button>
                                <input className="skillNum" type="number" min={0} max={6} value={rating}
                                  onChange={(e)=>updateHero(hero.id,{skillRatings:{...(hero.skillRatings??{}),[s.id]:Math.max(0,Math.min(6,Number(e.target.value)))}})} />
                              </div>
                            );
                          })}
                        </div>
                      </details>
                    ))}
                  </div>

                  <div className="section">
                    <div className="sectionTitle">Inventory</div>
                    <InventoryEditor hero={hero} updateHero={(patch)=>updateHero(hero.id, patch)} onSeeMore={openEntry} />
                  </div>

                  <div className="section">
                    <div className="sectionTitle">Notes</div>
                    <textarea className="textarea" rows={4} value={hero.notes ?? ''} onChange={(e)=>updateHero(hero.id,{notes:e.target.value})}/>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <BottomSheet open={sheetOpen} title={sheetTitle} onClose={()=>setSheetOpen(false)}>
        {sheetBody?.description ? <p style={{whiteSpace:'pre-wrap'}}>{sheetBody.description}</p> : <p className="muted">No description yet.</p>}
        {sheetBody?.flavor ? <p className="flavor">{sheetBody.flavor}</p> : null}
      </BottomSheet>
    </div>
  );
}

function InventoryEditor({ hero, updateHero, onSeeMore }: { hero: any; updateHero: (patch:any)=>void; onSeeMore: (pack: any, id: string)=>void }) {
  const [name, setName] = useState('');
  const [qty, setQty] = useState(1);
  const [equipId, setEquipId] = useState<string>('');

  const equipOptions = useMemo(() => sortByName(compendiums.equipment.entries ?? []), []);

  function addCustom(itemName: string, itemQty: number) {
    const cur = hero.inventory ?? [];
    updateHero({ inventory: [{ name: itemName, qty: itemQty }, ...cur] });
    setName(''); setQty(1);
  }

  function addFromCompendium(id: string) {
    const entry = findEntryById(compendiums.equipment.entries ?? [], id);
    if (!entry) return;
    const cur = hero.inventory ?? [];
    updateHero({ inventory: [{ name: entry.name, qty: 1, ref: { pack: 'tor2e-equipment', id: entry.id } }, ...cur] });
    setEquipId('');
  }

  function updateItem(idx: number, patch: any) {
    const cur = hero.inventory ?? [];
    const next = cur.map((it:any, i:number) => i === idx ? { ...it, ...patch } : it);
    updateHero({ inventory: next });
  }

  return (
    <div>
      <div className="row" style={{gap: 8, flexWrap: 'wrap'}}>
        <select className="input" value={equipId} onChange={(e)=>setEquipId(e.target.value)} style={{minWidth: 220}}>
          <option value="">Add from Equipment…</option>
          {equipOptions.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <button className="btn" disabled={!equipId} onClick={()=>addFromCompendium(equipId)}>Add</button>
      </div>

      <div className="row" style={{marginTop: 8, gap: 8}}>
        <input className="input" placeholder="Custom item name" value={name} onChange={(e)=>setName(e.target.value)} />
        <input className="input" style={{maxWidth:120}} type="number" min={1} value={qty} onChange={(e)=>setQty(Number(e.target.value))} />
        <button className="btn" onClick={()=>{ if (!name.trim()) return; addCustom(name.trim(), qty); }}>Add</button>
      </div>

      <div className="list" style={{marginTop: 10}}>
        {(hero.inventory ?? []).map((it:any, idx:number)=>(
          <div key={idx} className="invRow" style={{alignItems:'center'}}>
            <button className="btn btn-ghost" style={{textAlign:'left'}} onClick={()=>{
              if (it.ref?.pack === 'tor2e-equipment' && it.ref?.id) onSeeMore('equipment', it.ref.id);
            }}>
              <div className="invName">{it.name}</div>
              {it.ref?.pack === 'tor2e-equipment' ? <div className="muted" style={{fontSize: 12}}>See more</div> : null}
            </button>

            <input className="input" style={{maxWidth: 90}} type="number" min={1} value={it.qty ?? 1}
              onChange={(e)=>updateItem(idx,{qty: Number(e.target.value)})} />

            <button className="btn btn-ghost" onClick={()=>{
              const cur = hero.inventory ?? [];
              updateHero({ inventory: cur.filter((_:any, i:number)=>i!==idx) });
            }}>Remove</button>
          </div>
        ))}
      </div>
    </div>
  );
}

