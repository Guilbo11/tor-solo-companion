import React, { useMemo, useState } from 'react';
import { StoredState, saveState } from '../core/storage';
import { compendiums, findEntryById, sortByName } from '../core/compendiums';
import { computeDerived, rollNameFallback } from '../core/tor2e';
import { getSkillAttribute, getSkillTN } from '../core/skills';
import { rollTOR, RollResult } from '../core/dice';
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

  // Mobile-first inner tabs (PocketForge-ish)
  const [heroTab, setHeroTab] = useState<Record<string, 'Sheet'|'Skills'|'Gear'|'More'>>({});

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
      striderMode: false,
      standardOfLiving: 'Common',
      mount: { vigour: 1, label: 'Old horse / half-starved pony' },
      attributes: { strength: 2, heart: 2, wits: 2 },
      endurance: { max: 20, current: 20, load: 0, fatigue: 0 },
      hope: { max: 8, current: 8 },
      shadow: { points: 0, scars: 0 },
      conditions: { miserable: false, weary: false, wounded: false },
      injury: '',
      valour: 0,
      wisdom: 0,
      points: { adventure: 0, skill: 0, fellowship: 0 },
      favouredSkillIds: [],
      combatProficiencies: { axes: 0, bows: 0, spears: 0, swords: 0 },
      equipped: { weaponId: 'unarmed' },
      parry: { base: 0, other: 0 },
      protectionOther: 0,
      usefulItems: [],
      previousExperience: {
        baselineSkillRatings: Object.fromEntries((compendiums.skills.entries ?? []).map((s: any) => [s.id, 0])),
        baselineCombatProficiencies: { axes: 0, bows: 0, spears: 0, swords: 0 },
        committed: false,
      },
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
    const nextHeroes = heroes.map(h => {
      if (h.id !== id) return h;
      const merged = { ...h, ...patch };
      // keep common nested objects intact when patch provides partials
      if (h.attributes || patch.attributes) merged.attributes = { ...(h.attributes ?? {}), ...(patch.attributes ?? {}) };
      if (h.endurance || patch.endurance) merged.endurance = { ...(h.endurance ?? {}), ...(patch.endurance ?? {}) };
      if (h.hope || patch.hope) merged.hope = { ...(h.hope ?? {}), ...(patch.hope ?? {}) };
      if (h.shadow || patch.shadow) merged.shadow = { ...(h.shadow ?? {}), ...(patch.shadow ?? {}) };
      if (h.conditions || patch.conditions) merged.conditions = { ...(h.conditions ?? {}), ...(patch.conditions ?? {}) };
      if (h.points || patch.points) merged.points = { ...(h.points ?? {}), ...(patch.points ?? {}) };
      if (h.parry || patch.parry) merged.parry = { ...(h.parry ?? {}), ...(patch.parry ?? {}) };
      if (h.combatProficiencies || patch.combatProficiencies) merged.combatProficiencies = { ...(h.combatProficiencies ?? {}), ...(patch.combatProficiencies ?? {}) };

      const d = computeDerived(merged);
      // Store computed load for display and auto-toggle weary per rule.
      merged.endurance = { ...(merged.endurance ?? {}), load: d.loadTotal };
      const curEnd = Number(merged.endurance?.current ?? 0);
      const weary = curEnd < d.loadTotal;
      merged.conditions = { ...(merged.conditions ?? {}), weary };

      return { ...merged, updatedAt: new Date().toISOString() };
    });
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
          const derived = computeDerived(hero);
          const activeTab = heroTab[hero.id] ?? 'Sheet';

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
                  <div className="innerTabs">
                    {(['Sheet','Skills','Gear','More'] as const).map(t => (
                      <button
                        key={t}
                        className={"innerTab " + (activeTab===t ? 'active' : '')}
                        onClick={()=>setHeroTab(prev => ({ ...prev, [hero.id]: t }))}
                      >{t}</button>
                    ))}
                  </div>

                  {activeTab === 'Sheet' && (
                    <>
                      <div className="row" style={{alignItems:'flex-end'}}>
                        <div className="field" style={{flex:2}}>
                          <div className="label">Name</div>
                          <div className="row" style={{gap:8}}>
                            <input className="input" value={hero.name} onChange={(e)=>updateHero(hero.id,{name:e.target.value})}/>
                            <button className="btn" title="Roll a name (fallback generator)" onClick={()=>{
                              const c:any = getCultureEntry(hero.cultureId);
                              updateHero(hero.id,{name: rollNameFallback(c?.name)});
                            }}>🎲</button>
                          </div>
                        </div>
                        <div className="field" style={{flex:1}}>
                          <div className="label">Valour</div>
                          <input className="input" type="number" min={0} max={6} value={hero.valour ?? 0} onChange={(e)=>updateHero(hero.id,{valour: Number(e.target.value)})}/>
                        </div>
                        <div className="field" style={{flex:1}}>
                          <div className="label">Wisdom</div>
                          <input className="input" type="number" min={0} max={6} value={hero.wisdom ?? 0} onChange={(e)=>updateHero(hero.id,{wisdom: Number(e.target.value)})}/>
                        </div>
                      </div>

                      <div className="section">
                        <div className="sectionTitle">Resources</div>
                        <div className="grid2">
                          <div className="miniCard">
                            <div className="miniTitle">Endurance</div>
                            <div className="row" style={{gap:8, alignItems:'center', flexWrap:'wrap'}}>
                              <input className="input" style={{maxWidth: 92}} type="number" value={hero.endurance?.current ?? 0} onChange={(e)=>updateHero(hero.id,{endurance:{...(hero.endurance??{}),current:Number(e.target.value)}})}/>
                              <span className="muted">/</span>
                              <input className="input" style={{maxWidth: 92}} type="number" value={hero.endurance?.max ?? 0} onChange={(e)=>updateHero(hero.id,{endurance:{...(hero.endurance??{}),max:Number(e.target.value)}})}/>
                              <span className="muted small" style={{marginLeft: 6}}>
                                Load {derived.loadTotal}{(hero.endurance?.current ?? 0) < derived.loadTotal ? <span title="Weary" style={{marginLeft: 6}}>❗</span> : null}
                              </span>
                            </div>
                            <div className="row" style={{gap:8, marginTop:8}}>
                              <div style={{flex:1}}>
                                <div className="label">Fatigue</div>
                                <input className="input" type="number" value={hero.endurance?.fatigue ?? 0} onChange={(e)=>updateHero(hero.id,{endurance:{...(hero.endurance??{}),fatigue:Number(e.target.value)}})}/>
                              </div>
                            </div>
                          </div>

                          <div className="miniCard">
                            <div className="miniTitle">Hope</div>
                            <div className="row" style={{gap:8, alignItems:'center', flexWrap:'wrap'}}>
                              <input className="input" style={{maxWidth: 92}} type="number" value={hero.hope?.current ?? 0} onChange={(e)=>updateHero(hero.id,{hope:{...(hero.hope??{}),current:Number(e.target.value)}})}/>
                              <span className="muted">/</span>
                              <input className="input" style={{maxWidth: 92}} type="number" value={hero.hope?.max ?? 0} onChange={(e)=>updateHero(hero.id,{hope:{...(hero.hope??{}),max:Number(e.target.value)}})}/>
                            </div>
                            <div className="row" style={{gap:8, marginTop:8}}>
                              <div style={{flex:1}}>
                                <div className="label">Shadow</div>
                                <input className="input" type="number" value={hero.shadow?.points ?? 0} onChange={(e)=>updateHero(hero.id,{shadow:{...(hero.shadow??{}),points:Number(e.target.value)}})}/>
                              </div>
                              <div style={{flex:1}}>
                                <div className="label">Scars</div>
                                <input className="input" type="number" value={hero.shadow?.scars ?? 0} onChange={(e)=>updateHero(hero.id,{shadow:{...(hero.shadow??{}),scars:Number(e.target.value)}})}/>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="row" style={{gap:10, flexWrap:'wrap', marginTop:10}}>
                          <label className={"toggle " + (hero.conditions?.miserable ? 'on' : '')}>
                            <input type="checkbox" checked={!!hero.conditions?.miserable} onChange={(e)=>updateHero(hero.id,{conditions:{...(hero.conditions??{}),miserable:e.target.checked}})}/> Miserable
                          </label>
                          <label className={"toggle " + (hero.conditions?.weary ? 'on' : '')}>
                            <input type="checkbox" checked={!!hero.conditions?.weary} onChange={(e)=>updateHero(hero.id,{conditions:{...(hero.conditions??{}),weary:e.target.checked}})}/> Weary
                          </label>
                          <label className={"toggle " + (hero.conditions?.wounded ? 'on' : '')}>
                            <input type="checkbox" checked={!!hero.conditions?.wounded} onChange={(e)=>updateHero(hero.id,{conditions:{...(hero.conditions??{}),wounded:e.target.checked}})}/> Wounded
                          </label>
                        </div>

                        <div className="row" style={{marginTop:10}}>
                          <div className="field" style={{flex:1}}>
                            <div className="label">Injury</div>
                            <input className="input" placeholder="(e.g. Sprained ankle…)" value={hero.injury ?? ''} onChange={(e)=>updateHero(hero.id,{injury:e.target.value})}/>
                          </div>
                        </div>
                      </div>

                      <div className="section">
                        <div className="sectionTitle">Attributes & Target Numbers</div>
                        <div className="grid3">
                          <AttributeBox label="Strength" value={hero.attributes?.strength ?? 2} tn={derived.strengthTN} onChange={(v)=>updateHero(hero.id,{attributes:{...(hero.attributes??{}),strength:v}})} />
                          <AttributeBox label="Heart" value={hero.attributes?.heart ?? 2} tn={derived.heartTN} onChange={(v)=>updateHero(hero.id,{attributes:{...(hero.attributes??{}),heart:v}})} />
                          <AttributeBox label="Wits" value={hero.attributes?.wits ?? 2} tn={derived.witsTN} onChange={(v)=>updateHero(hero.id,{attributes:{...(hero.attributes??{}),wits:v}})} />
                        </div>
                      </div>

                      <div className="section">
                        <div className="sectionTitle">Combat</div>
                        <div className="grid2">
                          <div className="miniCard">
                            <div className="miniTitle">Parry</div>
                            <div className="bigNumber">{derived.parry.total}</div>
                            <div className="row" style={{gap:8, marginTop:8}}>
                              <div style={{flex:1}}>
                                <div className="label">Base</div>
                                <input className="input" type="number" value={hero.parry?.base ?? 0} onChange={(e)=>updateHero(hero.id,{parry:{...(hero.parry??{}),base:Number(e.target.value)}})}/>
                              </div>
                              <div style={{flex:1}}>
                                <div className="label">Shield</div>
                                <input className="input" type="number" value={derived.parry.shield} readOnly />
                              </div>
                              <div style={{flex:1}}>
                                <div className="label">Other</div>
                                <input className="input" type="number" value={hero.parry?.other ?? 0} onChange={(e)=>updateHero(hero.id,{parry:{...(hero.parry??{}),other:Number(e.target.value)}})}/>
                              </div>
                            </div>
                            <div className="small muted" style={{marginTop:6}}>
                              Shield bonus comes from the equipped shield (compendium).
                            </div>
                          </div>

                          <div className="miniCard">
                            <div className="miniTitle">Protection</div>
                            <div className="bigNumber">{derived.protection.total}d</div>
                            <div className="row" style={{gap:8, marginTop:8}}>
                              <div style={{flex:1}}>
                                <div className="label">Armour</div>
                                <input className="input" type="number" value={derived.protection.armour} readOnly />
                              </div>
                              <div style={{flex:1}}>
                                <div className="label">Helm</div>
                                <input className="input" type="number" value={derived.protection.helm} readOnly />
                              </div>
                              <div style={{flex:1}}>
                                <div className="label">Other</div>
                                <input className="input" type="number" value={hero.protectionOther ?? 0} onChange={(e)=>updateHero(hero.id,{protectionOther:Number(e.target.value)})}/>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="section">
                        <div className="sectionTitle">Attacks</div>
                        <AttackSection hero={hero} derived={derived} />
                      </div>
                    </>
                  )}

                  {activeTab === 'Skills' && (
                    <div className="section" style={{marginTop: 0}}>
                      <div className="sectionTitle">Previous Experience</div>
                      {(() => {
                        const pe = hero.previousExperience ?? {
                          baselineSkillRatings: { ...(hero.skillRatings ?? {}) },
                          baselineCombatProficiencies: { axes: hero.combatProficiencies?.axes ?? 0, bows: hero.combatProficiencies?.bows ?? 0, spears: hero.combatProficiencies?.spears ?? 0, swords: hero.combatProficiencies?.swords ?? 0 },
                          committed: false,
                        };

                        const skillCost = (toLevel: number) => {
                          if (toLevel <= 1) return 1;
                          if (toLevel === 2) return 2;
                          if (toLevel === 3) return 3;
                          if (toLevel === 4) return 5;
                          return 0;
                        };
                        const profCost = (toLevel: number) => {
                          if (toLevel <= 1) return 2;
                          if (toLevel === 2) return 4;
                          if (toLevel === 3) return 6;
                          return 0;
                        };

                        const computeSpent = () => {
                          let spent = 0;
                          const curSkills = hero.skillRatings ?? {};
                          const baseSkills = pe.baselineSkillRatings ?? {};
                          for (const [sid, cur] of Object.entries(curSkills)) {
                            const b = Number((baseSkills as any)[sid] ?? 0);
                            const c = Number(cur ?? 0);
                            for (let lvl = b + 1; lvl <= Math.min(4, c); lvl++) spent += skillCost(lvl);
                          }
                          const curP = hero.combatProficiencies ?? {};
                          const baseP = pe.baselineCombatProficiencies ?? { axes: 0, bows: 0, spears: 0, swords: 0 };
                          (['axes','bows','spears','swords'] as const).forEach(k => {
                            const b = Number((baseP as any)[k] ?? 0);
                            const c = Number((curP as any)[k] ?? 0);
                            for (let lvl = b + 1; lvl <= Math.min(3, c); lvl++) spent += profCost(lvl);
                          });
                          return spent;
                        };

                        const budget = hero.striderMode ? 15 : 10;
                        const spent = computeSpent();
                        const remaining = Math.max(0, budget - spent);
                        const committed = !!pe.committed;

                        const resetBaseline = () => {
                          updateHero(hero.id, {
                            previousExperience: {
                              baselineSkillRatings: { ...(hero.skillRatings ?? {}) },
                              baselineCombatProficiencies: { axes: hero.combatProficiencies?.axes ?? 0, bows: hero.combatProficiencies?.bows ?? 0, spears: hero.combatProficiencies?.spears ?? 0, swords: hero.combatProficiencies?.swords ?? 0 },
                              committed: false,
                            }
                          });
                        };

                        const commit = () => {
                          updateHero(hero.id, {
                            previousExperience: {
                              ...pe,
                              committedSkillRatings: { ...(hero.skillRatings ?? {}) },
                              committedCombatProficiencies: { axes: hero.combatProficiencies?.axes ?? 0, bows: hero.combatProficiencies?.bows ?? 0, spears: hero.combatProficiencies?.spears ?? 0, swords: hero.combatProficiencies?.swords ?? 0 },
                              committed: true,
                            }
                          });
                        };

                        return (
                          <>
                            <div className="row" style={{gap: 10, flexWrap:'wrap'}}>
                              <div className="small">Budget: <b>{budget}</b> · Spent: <b>{spent}</b> · Remaining: <b>{remaining}</b></div>
                              <span className="muted small">(Skills up to XXXX, Proficiencies up to XXX for Previous Experience)</span>
                            </div>
                            <div className="row" style={{gap: 8, marginTop: 8, flexWrap:'wrap'}}>
                              <button className="btn btn-ghost" onClick={resetBaseline}>Reset baseline</button>
                              <button className="btn" disabled={committed} onClick={commit}>Commit</button>
                              {committed ? <span className="small muted">Committed. Future increases are treated as progression.</span> : null}
                            </div>
                          </>
                        );
                      })()}

                      <hr />

                      <div className="sectionTitle">Combat Proficiencies</div>
                      <div className="small muted">Use + / – to adjust quickly.</div>
                      {(() => {
                        const pe = hero.previousExperience;
                        const committed = !!pe?.committed;
                        const profs = hero.combatProficiencies ?? {};
                        const rows: Array<{ key: 'axes'|'bows'|'spears'|'swords'; label: string }> = [
                          { key: 'axes', label: 'Axes' },
                          { key: 'bows', label: 'Bows' },
                          { key: 'spears', label: 'Spears' },
                          { key: 'swords', label: 'Swords' },
                        ];
                        const canEdit = !committed;
                        return (
                          <div className="skillsList">
                            {rows.map(r => {
                              const cur = Number((profs as any)[r.key] ?? 0);
                              const committedVal = pe?.committedCombatProficiencies ? Number((pe.committedCombatProficiencies as any)[r.key] ?? 0) : undefined;
                              const extra = (typeof committedVal === 'number') ? Math.max(0, cur - committedVal) : 0;
                              return (
                                <div key={r.key} className="skillRow">
                                  <div className="skillName">{r.label}</div>
                                  <div className="skillMeta">{committedVal !== undefined ? `Committed ${committedVal}${extra ? ` (+${extra})` : ''}` : ''}</div>
                                  <div className="row" style={{gap:6}}>
                                    <button className="btn btn-ghost" disabled={!canEdit || cur<=0} onClick={()=>updateHero(hero.id,{combatProficiencies:{...(profs as any),[r.key]:Math.max(0,cur-1)}})}>-</button>
                                    <div className="skillNum" style={{minWidth: 24, textAlign:'center'}}>{cur}</div>
                                    <button className="btn btn-ghost" disabled={!canEdit || cur>=6} onClick={()=>updateHero(hero.id,{combatProficiencies:{...(profs as any),[r.key]:Math.min(6,cur+1)}})}>+</button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}

                      <hr />

                      <div className="sectionTitle">Skills</div>
                      <div className="small muted">⭐ = Favoured (from Culture selection). Tap name for See more.</div>
                      {Object.keys(skillsByGroup).map(group => (
                        <details key={group} className="details" open={group==='Personality'}>
                          <summary>{group}</summary>
                          <div className="skillsList">
                            {skillsByGroup[group].map((s:any)=>{
                              const rating = hero.skillRatings?.[s.id] ?? 0;
                              const isFav = derived.favouredSkillSet.has(s.id);
                              const pe = hero.previousExperience;
                              const committed = !!pe?.committed;
                              const committedVal = pe?.committedSkillRatings ? Number((pe.committedSkillRatings as any)[s.id] ?? 0) : undefined;
                              const extra = (typeof committedVal === 'number') ? Math.max(0, rating - committedVal) : 0;
                              return (
                                <div key={s.id} className={"skillRow " + (isFav ? 'favoured' : '')}>
                                  <div className="skillName" onClick={()=>openEntry('skills', s.id)}>
                                    {isFav ? '⭐ ' : ''}{s.name}
                                  </div>
                                  {(() => {
                                    const attr = getSkillAttribute(s.id);
                                    const tn = getSkillTN(hero, s.id);
                                    return <div className="skillMeta">{attr} · TN {tn}{committedVal !== undefined ? ` · Committed ${committedVal}${extra ? ` (+${extra})` : ''}` : ''}</div>;
                                  })()}
                                  <div className="row" style={{gap:6}}>
                                    <button className="btn btn-ghost" disabled={committed || rating<=0} onClick={()=>updateHero(hero.id,{skillRatings:{...(hero.skillRatings??{}),[s.id]:Math.max(0, rating-1)}})}>-</button>
                                    <div className="skillNum" style={{minWidth: 24, textAlign:'center'}}>{rating}</div>
                                    <button className="btn btn-ghost" disabled={committed || rating>=6} onClick={()=>updateHero(hero.id,{skillRatings:{...(hero.skillRatings??{}),[s.id]:Math.min(6, rating+1)}})}>+</button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </details>
                      ))}
                    </div>
                  )}

                  {activeTab === 'Gear' && (
                    <>
                      <div className="section" style={{marginTop: 0}}>
                        <div className="sectionTitle">Useful items</div>
                        {(() => {
                          const sol = hero.standardOfLiving ?? 'Common';
                          const startingCount: any = { Poor: 0, Frugal: 1, Common: 2, Prosperous: 3, Rich: 4, 'Very Rich': 5 };
                          const n = startingCount[sol] ?? 2;
                          return <div className="small muted">Starting number for Standard of Living ({sol}): <b>{n}</b></div>;
                        })()}
                        <UsefulItemsEditor hero={hero} updateHero={(patch)=>updateHero(hero.id, patch)} />
                      </div>
                      <div className="section">
                        <div className="sectionTitle">Inventory & Equipment</div>
                        <div className="small muted">Use <b>Equip</b> to apply armour/shield/parry and add weapon options for Attacks. Use <b>Dropped</b> to remove from Load.</div>
                        <InventoryEditor hero={hero} updateHero={(patch)=>updateHero(hero.id, patch)} onSeeMore={openEntry} />
                      </div>
                    </>
                  )}

                  {activeTab === 'More' && (
                    <>
                      <div className="row">
                        <div className="field">
                          <div className="label">Culture</div>
                          <select className="input" value={hero.cultureId ?? ''} onChange={(e)=>{
                            const newId = e.target.value;
                            const c:any = getCultureEntry(newId);
                            const sol = c?.standardOfLiving ?? hero.standardOfLiving;
                            // Reset previous experience baseline when culture changes.
                            updateHero(hero.id,{
                              cultureId: newId,
                              standardOfLiving: sol,
                              previousExperience: {
                                baselineSkillRatings: { ...(hero.skillRatings ?? {}) },
                                baselineCombatProficiencies: { axes: hero.combatProficiencies?.axes ?? 0, bows: hero.combatProficiencies?.bows ?? 0, spears: hero.combatProficiencies?.spears ?? 0, swords: hero.combatProficiencies?.swords ?? 0 },
                                committed: false,
                              }
                            });
                          }}>
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
                        </div>

                        <div className="field">
                          <div className="label">Calling</div>
                          <select className="input" value={hero.callingId ?? ''} onChange={(e)=>updateHero(hero.id,{callingId:e.target.value})}>
                            <option value="">(none)</option>
                            {callingOptions.map((c:any)=> <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                          {hero.callingId && <button className="btn btn-ghost" onClick={()=>openEntry('callings', hero.callingId)}>See more</button>}
                        </div>
                      </div>

                      <div className="section">
                        <div className="sectionTitle">Strider Mode</div>
                        <label className={"toggle " + (hero.striderMode ? 'on' : '')}>
                          <input type="checkbox" checked={!!hero.striderMode} onChange={(e)=>updateHero(hero.id,{striderMode:e.target.checked})}/> Enabled (adds Strider-only flavour/UI)
                        </label>
                      </div>

                      <div className="section">
                        <div className="sectionTitle">Culture Attribute Arrays</div>
                        {(() => {
                          const c:any = getCultureEntry(hero.cultureId);
                          const rolls: any[] = Array.isArray(c?.attributeRolls) ? c.attributeRolls : [];
                          if (!c || rolls.length === 0) return <div className="small muted">Select a culture to choose an Attribute array.</div>;
                          const chosen = Number((hero as any).attributeRollChoice ?? 1);
                          const setChoice = (n:number)=>updateHero(hero.id,{ attributeRollChoice: n });
                          const applyChoice = (n:number) => {
                            const r = rolls.find(x=>Number(x.roll)===n) ?? rolls[0];
                            const strength = Number(r?.strength ?? hero.attributes?.strength ?? 2);
                            const heart = Number(r?.heart ?? hero.attributes?.heart ?? 2);
                            const wits = Number(r?.wits ?? hero.attributes?.wits ?? 2);
                            const endBonus = Number(c?.derived?.enduranceBonus ?? 0);
                            const hopeBonus = Number(c?.derived?.hopeBonus ?? 0);
                            const parryBonus = Number(c?.derived?.parryBonus ?? 0);
                            const endMax = strength + endBonus;
                            const hopeMax = heart + hopeBonus;
                            const parryBase = wits + parryBonus;
                            updateHero(hero.id,{
                              attributeRollChoice: n,
                              attributes: { strength, heart, wits },
                              endurance: { ...(hero.endurance??{}), max: endMax, current: Math.min(Number(hero.endurance?.current ?? endMax), endMax) },
                              hope: { ...(hero.hope??{}), max: hopeMax, current: Math.min(Number(hero.hope?.current ?? hopeMax), hopeMax) },
                              parry: { ...(hero.parry??{}), base: parryBase },
                            });
                          };
                          const roll1d6 = () => 1 + Math.floor(Math.random()*6);
                          return (
                            <>
                              <div className="small muted">Choose one set of Attributes, or roll a Success die. Derived: Endurance = STR + {c.derived?.enduranceBonus ?? 0}, Hope = HEART + {c.derived?.hopeBonus ?? 0}, Parry = WITS + {c.derived?.parryBonus ?? 0}.</div>
                              <div className="row" style={{gap:8, flexWrap:'wrap', marginTop:8}}>
                                <select className="input" value={chosen} onChange={(e)=>setChoice(Number(e.target.value))}>
                                  {rolls.map((r:any)=> <option key={r.roll} value={r.roll}>Roll {r.roll}: {r.strength}/{r.heart}/{r.wits}</option>) }
                                </select>
                                <button className="btn" onClick={()=>applyChoice(chosen)}>Apply</button>
                                <button className="btn btn-ghost" onClick={()=>{ const n=roll1d6(); setChoice(n); applyChoice(n); }}>Roll 1d6</button>
                              </div>
                            </>
                          );
                        })()}
                      </div>

                      <div className="section">
                        <div className="sectionTitle">Standard of Living</div>
                        <div className="row" style={{gap:8, flexWrap:'wrap'}}>
                          <select className="input" value={hero.standardOfLiving ?? ''} onChange={(e)=>updateHero(hero.id,{standardOfLiving:e.target.value})}>
                            {['Poor','Frugal','Common','Prosperous','Rich','Very Rich'].map(sol=> <option key={sol} value={sol}>{sol}</option>) }
                          </select>
                          <span className="small muted">Initial value comes from Culture (you can change it later).</span>
                        </div>
                      </div>

                      <div className="section">
                        <div className="sectionTitle">Ponies and Horses</div>
                        {(() => {
                          const sol = hero.standardOfLiving ?? 'Common';
                          const options: Array<{label:string; vigour:number; minSol:string}> = [
                            { label: 'Old horse / half-starved pony', vigour: 1, minSol: 'Poor' },
                            { label: 'Pony', vigour: 2, minSol: 'Prosperous' },
                            { label: 'Horse', vigour: 2, minSol: 'Rich' },
                          ];
                          const order = ['Poor','Frugal','Common','Prosperous','Rich','Very Rich'];
                          const solIdx = order.indexOf(sol);
                          const allowed = options.filter(o => order.indexOf(o.minSol) <= solIdx);
                          const cur = hero.mount ?? { label: allowed[0].label, vigour: allowed[0].vigour };
                          return (
                            <div className="row" style={{gap:8, flexWrap:'wrap'}}>
                              <select className="input" value={cur.label} onChange={(e)=>{
                                const picked = allowed.find(a=>a.label===e.target.value) ?? allowed[0];
                                updateHero(hero.id,{mount:{ label: picked.label, vigour: picked.vigour }});
                              }}>
                                {allowed.map(o=> <option key={o.label} value={o.label}>{o.label} (Vigour {o.vigour})</option>) }
                              </select>
                              <span className="small muted">Allowed by current Standard of Living ({sol}).</span>
                            </div>
                          );
                        })()}
                      </div>

                      <div className="section">
                        <div className="sectionTitle">Favoured Skills (from Culture)</div>
                        {(() => {
                          const c:any = getCultureEntry(hero.cultureId);
                          const candidates: string[] = Array.isArray(c?.favouredSkillCandidates) ? c.favouredSkillCandidates : [];
                          if (!c || candidates.length === 0) return <div className="small muted">No favoured skill candidates in this culture compendium entry.</div>;
                          const cur: string[] = hero.favouredSkillIds ?? [];
                          return (
                            <div className="pillGrid">
                              {candidates.map((sid)=>{
                                const entry:any = findEntryById(compendiums.skills.entries ?? [], sid);
                                const label = entry?.name ?? sid;
                                const selected = cur.includes(sid);
                                return (
                                  <div key={sid} className={"pill " + (selected ? 'on' : '')} onClick={()=>{
                                    const next = selected ? cur.filter(x=>x!==sid) : [...cur, sid].slice(0,2);
                                    updateHero(hero.id, { favouredSkillIds: next });
                                  }}>{label}</div>
                                );
                              })}
                            </div>
                          );
                        })()}
                        <div className="small muted" style={{marginTop:6}}>Pick up to 2. These will show as ⭐ in Skills.</div>
                      </div>

                      <div className="section">
                        <div className="sectionTitle">Distinctive Features</div>
                        <div className="small">Tap to select. Tap “i” for description.</div>
                        <div className="pillGrid">
                          {featureOptions.map((f:any)=>{
                            const selected = (hero.featureIds ?? []).includes(f.id);
                            return (
                              <div key={f.id} className={"pill " + (selected ? "on" : "")} onClick={()=> {
                                const cur = hero.featureIds ?? [];
                                const next = selected ? cur.filter((x:string)=>x!==f.id) : [...cur, f.id].slice(0,2);
                                updateHero(hero.id,{featureIds: next});
                              }}>
                                <span className="pillName">{f.name}</span>
                                <button className="pillInfo" onClick={(e)=>{ e.stopPropagation(); openEntry('features', f.id); }}>i</button>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="section">
                        <div className="sectionTitle">Features (chosen)</div>
                        {(hero.featureIds ?? []).length === 0 ? <div className="small muted">None yet.</div> : null}
                        {(hero.featureIds ?? []).map((fid:string)=>{
                          const f:any = findEntryById(compendiums.features.entries ?? [], fid);
                          return (
                            <div key={fid} className="pillRow">
                              <button className="btn btn-ghost" onClick={()=>openEntry('features', fid)}>{f?.name ?? fid}</button>
                              <button className="btn btn-ghost" onClick={()=>{
                                const cur = hero.featureIds ?? [];
                                updateHero(hero.id, { featureIds: cur.filter((x:string)=>x!==fid) });
                              }}>Remove</button>
                            </div>
                          );
                        })}
                      </div>

                      <div className="section">
                        <div className="sectionTitle">Virtues & Rewards</div>
                        <div className="row" style={{gap: 8, flexWrap:'wrap'}}>
                          <button className="btn btn-ghost" onClick={()=>addVirtueRoll(hero)}>Roll Virtue (1d6)</button>
                          <button className="btn btn-ghost" onClick={()=>addRewardRoll(hero)}>Roll Reward (1d6)</button>
                        </div>

                        <div className="row" style={{marginTop: 10, gap: 10, flexWrap:'wrap'}}>
                          <PickerAdd
                            label="Add Virtue"
                            entries={sortByName(compendiums.virtues.entries ?? [])}
                            onAdd={(id)=>{
                              const cur: string[] = hero.virtueIds ?? [];
                              if (!cur.includes(id)) updateHero(hero.id,{virtueIds:[id, ...cur]});
                            }}
                            onSeeMore={(id)=>openEntry('virtues', id)}
                          />
                          <PickerAdd
                            label="Add Reward"
                            entries={sortByName(compendiums.rewards.entries ?? [])}
                            onAdd={(id)=>{
                              const cur: string[] = hero.rewardIds ?? [];
                              if (!cur.includes(id)) updateHero(hero.id,{rewardIds:[id, ...cur]});
                            }}
                            onSeeMore={(id)=>openEntry('rewards', id)}
                          />
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
                        <div className="sectionTitle">Points</div>
                        <div className="grid3">
                          <div className="field">
                            <div className="label">Adventure</div>
                            <input className="input" type="number" value={hero.points?.adventure ?? 0} onChange={(e)=>updateHero(hero.id,{points:{...(hero.points??{}),adventure:Number(e.target.value)}})}/>
                          </div>
                          <div className="field">
                            <div className="label">Skill</div>
                            <input className="input" type="number" value={hero.points?.skill ?? 0} onChange={(e)=>updateHero(hero.id,{points:{...(hero.points??{}),skill:Number(e.target.value)}})}/>
                          </div>
                          <div className="field">
                            <div className="label">Fellowship</div>
                            <input className="input" type="number" value={hero.points?.fellowship ?? 0} onChange={(e)=>updateHero(hero.id,{points:{...(hero.points??{}),fellowship:Number(e.target.value)}})}/>
                          </div>
                        </div>
                      </div>

                      <div className="section">
                        <div className="sectionTitle">Notes</div>
                        <textarea className="textarea" rows={4} value={hero.notes ?? ''} onChange={(e)=>updateHero(hero.id,{notes:e.target.value})}/>
                      </div>
                    </>
                  )}
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
    updateHero({ inventory: [{ id: uid('it'), name: itemName, qty: itemQty, load: 0, equipped: false, dropped: false }, ...cur] });
    setName(''); setQty(1);
  }

  function addFromCompendium(id: string) {
    const entry = findEntryById(compendiums.equipment.entries ?? [], id);
    if (!entry) return;
    const cur = hero.inventory ?? [];
    updateHero({ inventory: [{ id: uid('it'), name: entry.name, qty: 1, ref: { pack: 'tor2e-equipment', id: entry.id }, equipped: false, dropped: false }, ...cur] });
    setEquipId('');
  }

  function updateItem(idx: number, patch: any) {
    const cur = hero.inventory ?? [];
    const equipCategory = (it: any) => {
      if (it?.ref?.pack !== 'tor2e-equipment' || !it?.ref?.id) return null;
      const e: any = findEntryById(compendiums.equipment.entries ?? [], it.ref.id);
      return e?.category ?? null;
    };
    const next = cur.map((it:any, i:number) => i === idx ? { ...it, ...patch } : it);
    // If equipping an Armour/Headgear/Shield, ensure only one of that category is equipped.
    if (patch?.equipped === true) {
      const cat = equipCategory(cur[idx]);
      if (cat === 'Armour' || cat === 'Headgear' || cat === 'Shield') {
        for (let i = 0; i < next.length; i++) {
          if (i === idx) continue;
          if (equipCategory(next[i]) === cat) next[i] = { ...next[i], equipped: false };
        }
      }
    }
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
          <div key={it.id ?? idx} className="invRow" style={{alignItems:'center'}}>
            <button className="btn btn-ghost" style={{textAlign:'left'}} onClick={()=>{
              if (it.ref?.pack === 'tor2e-equipment' && it.ref?.id) onSeeMore('equipment', it.ref.id);
            }}>
              <div className="invName">{it.name}</div>
              {it.ref?.pack === 'tor2e-equipment' && it.ref?.id ? (
                (() => {
                  const e:any = findEntryById(compendiums.equipment.entries ?? [], it.ref.id);
                  if (!e) return <div className="muted" style={{fontSize: 12}}>See more</div>;
                  const c = String(e.category ?? '');
                  if (c === 'Weapon') return <div className="muted" style={{fontSize: 12}}>DMG {e.damage ?? '—'} • INJ {e.injury ?? '—'} • Load {e.load ?? 0}</div>;
                  if (c === 'Armour' || c === 'Headgear') return <div className="muted" style={{fontSize: 12}}>Prot {e.protection ?? '—'} • Load {e.load ?? 0}</div>;
                  if (c === 'Shield') return <div className="muted" style={{fontSize: 12}}>Parry {e.parryModifier ?? '—'} • Load {e.load ?? 0}</div>;
                  return <div className="muted" style={{fontSize: 12}}>Load {e.load ?? 0}</div>;
                })()
              ) : null}
            </button>

            <label className="toggle" style={{marginRight: 6}} title="Equip">
              <input type="checkbox" checked={!!it.equipped} disabled={!!it.dropped} onChange={(e)=>updateItem(idx,{equipped: e.target.checked})} />
              <span className="small">Equip</span>
            </label>

            <label className="toggle" style={{marginRight: 6}} title="Dropped (removes from Load and disables Equip)">
              <input type="checkbox" checked={!!it.dropped} onChange={(e)=>updateItem(idx,{dropped: e.target.checked, equipped: e.target.checked ? false : it.equipped})} />
              <span className="small">Dropped</span>
            </label>

            <input className="input" style={{maxWidth: 72}} type="number" min={0} value={(it.load ?? '') as any}
              placeholder="Load" onChange={(e)=>{
                const v = e.target.value;
                updateItem(idx,{load: v === '' ? undefined : Number(v)});
              }} />

            <input className="input" style={{maxWidth: 72}} type="number" min={1} value={it.qty ?? 1}
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

function UsefulItemsEditor({ hero, updateHero }: { hero: any; updateHero: (patch:any)=>void }) {
  const items = Array.isArray(hero.usefulItems) ? hero.usefulItems : [];
  const [name, setName] = useState('');
  const [skillId, setSkillId] = useState('scan');
  const skillOptions = useMemo(() => sortByName(compendiums.skills.entries ?? []), []);

  function add() {
    if (!name.trim()) return;
    updateHero({ usefulItems: [{ id: uid('u'), name: name.trim(), skillId }, ...items] });
    setName('');
  }

  function updateItem(idx: number, patch: any) {
    const next = items.map((it:any, i:number) => i===idx ? { ...it, ...patch } : it);
    updateHero({ usefulItems: next });
  }

  return (
    <div>
      <div className="row" style={{gap: 8, flexWrap:'wrap'}}>
        <input className="input" placeholder="Item name" value={name} onChange={(e)=>setName(e.target.value)} />
        <select className="input" style={{minWidth: 180}} value={skillId} onChange={(e)=>setSkillId(e.target.value)}>
          {skillOptions.map((s:any)=> <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <button className="btn" onClick={add}>Add</button>
      </div>

      <div className="list" style={{marginTop: 10}}>
        {items.map((it:any, idx:number)=> (
          <div key={it.id ?? idx} className="invRow" style={{alignItems:'center'}}>
            <input className="input" value={it.name ?? ''} onChange={(e)=>updateItem(idx,{name:e.target.value})} />
            <select className="input" style={{minWidth: 160}} value={it.skillId ?? 'scan'} onChange={(e)=>updateItem(idx,{skillId:e.target.value})}>
              {skillOptions.map((s:any)=> <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <button className="btn btn-ghost" onClick={()=>updateHero({ usefulItems: items.filter((_:any,i:number)=>i!==idx) })}>Remove</button>
          </div>
        ))}
        {items.length===0 ? <div className="small muted">No useful items yet. Add anything and link it to a Skill.</div> : null}
      </div>
    </div>
  );
}

function AttackSection({ hero, derived }: { hero: any; derived: any }) {
  const [featMode, setFeatMode] = useState<'normal'|'favoured'|'illFavoured'>('normal');
  const [weary, setWeary] = useState<boolean>(!!hero.conditions?.weary);
  const [last, setLast] = useState<RollResult | null>(null);

  const weapons = Array.isArray(derived.equippedWeapons) ? derived.equippedWeapons : [];

  const profKey = (name: string) => {
    const v = String(name || '').toLowerCase();
    if (v.startsWith('axe')) return 'axes';
    if (v.startsWith('bow')) return 'bows';
    if (v.startsWith('spear')) return 'spears';
    if (v.startsWith('sword')) return 'swords';
    // common TOR categories
    if (v.includes('axes')) return 'axes';
    if (v.includes('bows')) return 'bows';
    if (v.includes('spears')) return 'spears';
    if (v.includes('swords')) return 'swords';
    return null;
  };

  if (weapons.length === 0) {
    return <div className="small muted">Equip one or more weapons in <b>Gear → Inventory & Equipment</b> to enable attack rolls.</div>;
  }

  return (
    <div>
      <div className="row" style={{gap:8, flexWrap:'wrap', marginBottom:8}}>
        <div className="col" style={{minWidth: 220}}>
          <div className="label">Feat die mode</div>
          <select className="input" value={featMode} onChange={(e)=>setFeatMode(e.target.value as any)}>
            <option value="normal">Normal (1 Feat die)</option>
            <option value="favoured">Favoured (2 Feat dice, keep best)</option>
            <option value="illFavoured">Ill-favoured (2 Feat dice, keep worst)</option>
          </select>
        </div>
        <label className="toggle" style={{alignSelf:'end'}}>
          <input type="checkbox" checked={weary} onChange={(e)=>setWeary(e.target.checked)} /> Weary
        </label>
      </div>

      <div className="list">
        {weapons.map((w:any)=>{
          const k = profKey(w.combatProficiency);
          const dice = k ? (hero.combatProficiencies?.[k] ?? 0) : 0;
          return (
            <div key={w.id} className="invRow" style={{alignItems:'center'}}>
              <div style={{flex:1}}>
                <div><b>{w.name}</b></div>
                <div className="small muted">{w.combatProficiency ? `${w.combatProficiency}` : '—'} • DMG {w.damage ?? '—'} • INJ {w.injury ?? '—'} • Dice {dice}</div>
              </div>
              <button className="btn" onClick={()=>{
                const r = rollTOR({ dice, featMode, weary });
                setLast(r);
              }}>Roll</button>
            </div>
          );
        })}
      </div>
      {last ? (
        <div className="small" style={{marginTop:8}}>
          <b>Last attack roll:</b> Feat {last.feat.type==='Number'?last.feat.value:(last.feat.type==='Eye'?'Sauron':'Gandalf')}{last.feat2?` / ${last.feat2.type==='Number'?last.feat2.value:(last.feat2.type==='Eye'?'Sauron':'Gandalf')}`:''} • Success [{last.success.map(d=>d.icon?`6★`:String(d.value)).join(', ')}] • <b>Total {last.total}</b>
        </div>
      ) : null}
    </div>
  );
}

function AttributeBox({ label, value, tn, onChange }: { label: string; value: number; tn: number; onChange: (v:number)=>void }) {
  const v = typeof value === 'number' ? value : 2;
  return (
    <div className="miniCard">
      <div className="miniTitle">{label}</div>
      <div className="row" style={{gap:8}}>
        <input className="input" type="number" min={2} max={8} value={v} onChange={(e)=>{
          const n = parseInt(e.target.value, 10);
          if (Number.isNaN(n)) return;
          onChange(Math.max(2, Math.min(8, n)));
        }} />
        <div className="tnPill">TN {tn}</div>
      </div>
    </div>
  );
}

function PickerAdd({ label, entries, onAdd, onSeeMore }: { label: string; entries: any[]; onAdd: (id:string)=>void; onSeeMore: (id:string)=>void }) {
  const [pick, setPick] = useState('');
  return (
    <div className="miniCard" style={{minWidth: 260, flex:1}}>
      <div className="miniTitle">{label}</div>
      <div className="row" style={{gap:8, flexWrap:'wrap'}}>
        <select className="input" value={pick} onChange={(e)=>setPick(e.target.value)} style={{flex:1, minWidth: 180}}>
          <option value="">Choose…</option>
          {entries.map((e:any)=> <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <button className="btn" disabled={!pick} onClick={()=>{ if (!pick) return; onAdd(pick); setPick(''); }}>Add</button>
        <button className="btn btn-ghost" disabled={!pick} onClick={()=>{ if (!pick) return; onSeeMore(pick); }}>See more</button>
      </div>
    </div>
  );
}

function GearEquippedEditor({ hero, updateHero, onSeeMore }: { hero: any; updateHero: (patch:any)=>void; onSeeMore: (pack: any, id: string)=>void }) {
  const eq = hero.equipped ?? {};
  const equipment = compendiums.equipment.entries ?? [];

  const weapons = useMemo(() => sortByName(equipment.filter((e:any)=>e.category === 'Weapon')), [equipment]);
  const armours = useMemo(() => sortByName(equipment.filter((e:any)=>e.category === 'Armour')), [equipment]);
  const helms = useMemo(() => sortByName(equipment.filter((e:any)=>e.category === 'Headgear')), [equipment]);
  const shields = useMemo(() => sortByName(equipment.filter((e:any)=>e.category === 'Shield')), [equipment]);

  const weapon:any = eq.weaponId ? findEntryById(equipment, eq.weaponId) : null;
  const armour:any = eq.armourId ? findEntryById(equipment, eq.armourId) : null;
  const helm:any = eq.helmId ? findEntryById(equipment, eq.helmId) : null;
  const shield:any = eq.shieldId ? findEntryById(equipment, eq.shieldId) : null;

  return (
    <div>
      <div className="grid2">
        <div className="miniCard">
          <div className="miniTitle">Weapon</div>
          <select className="input" value={eq.weaponId ?? ''} onChange={(e)=>updateHero({ equipped: { ...eq, weaponId: e.target.value || undefined } })}>
            <option value="">(none)</option>
            {weapons.map((e:any)=> <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          {weapon ? (
            <div className="small" style={{marginTop:6}}>
              <b>Damage</b> {weapon.damage ?? '—'} • <b>Injury</b> {weapon.injury ?? '—'} • <b>Load</b> {weapon.load ?? 0}
              <div><button className="btn btn-ghost" onClick={()=>onSeeMore('equipment', weapon.id)}>See more</button></div>
            </div>
          ) : <div className="small muted" style={{marginTop:6}}>Pick a weapon to see Damage/Injury/Load.</div>}
        </div>

        <div className="miniCard">
          <div className="miniTitle">Shield</div>
          <select className="input" value={eq.shieldId ?? ''} onChange={(e)=>updateHero({ equipped: { ...eq, shieldId: e.target.value || undefined } })}>
            <option value="">(none)</option>
            {shields.map((e:any)=> <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          {shield ? (
            <div className="small" style={{marginTop:6}}>
              <b>Parry</b> {shield.parryModifier ?? '—'} • <b>Load</b> {shield.load ?? 0}
              <div><button className="btn btn-ghost" onClick={()=>onSeeMore('equipment', shield.id)}>See more</button></div>
            </div>
          ) : <div className="small muted" style={{marginTop:6}}>Pick a shield to see Parry/Load.</div>}
        </div>
      </div>

      <div className="grid2" style={{marginTop:10}}>
        <div className="miniCard">
          <div className="miniTitle">Armour</div>
          <select className="input" value={eq.armourId ?? ''} onChange={(e)=>updateHero({ equipped: { ...eq, armourId: e.target.value || undefined } })}>
            <option value="">(none)</option>
            {armours.map((e:any)=> <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          {armour ? (
            <div className="small" style={{marginTop:6}}>
              <b>Protection</b> {armour.protection ?? '—'} • <b>Load</b> {armour.load ?? 0}
              <div><button className="btn btn-ghost" onClick={()=>onSeeMore('equipment', armour.id)}>See more</button></div>
            </div>
          ) : <div className="small muted" style={{marginTop:6}}>Pick armour to see Protection/Load.</div>}
        </div>

        <div className="miniCard">
          <div className="miniTitle">Helm</div>
          <select className="input" value={eq.helmId ?? ''} onChange={(e)=>updateHero({ equipped: { ...eq, helmId: e.target.value || undefined } })}>
            <option value="">(none)</option>
            {helms.map((e:any)=> <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          {helm ? (
            <div className="small" style={{marginTop:6}}>
              <b>Protection</b> {helm.protection ?? '—'} • <b>Load</b> {helm.load ?? 0}
              <div><button className="btn btn-ghost" onClick={()=>onSeeMore('equipment', helm.id)}>See more</button></div>
            </div>
          ) : <div className="small muted" style={{marginTop:6}}>Pick a helm to see Protection/Load.</div>}
        </div>
      </div>
    </div>
  );
}

