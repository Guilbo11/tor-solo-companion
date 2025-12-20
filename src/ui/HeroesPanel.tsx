
import React, { useMemo, useState } from 'react';
import { BottomSheet } from './BottomSheet';
import { Callings, Cultures, Features, Skills, findById, sortByName } from '../core/compendiums';
import type { Hero, StoredState, GameMode } from '../core/storage';

function skillKeyFromNameUpper(nameUpper: string): string | null {
  const m = Skills.entries.find(s => s.name === nameUpper);
  return m ? m.id : null;
}

function applyCultureToHero(hero: Hero): Hero {
  if (!hero.cultureId) return hero;
  const c = findById(Cultures, hero.cultureId);
  if (!c) return hero;

  const next: Hero = { ...hero };
  // Default derived from culture if present
  if (c.attributeSets && c.attributeSets.length > 0) {
    // keep hero values if already edited, otherwise use first set
    if (hero.strength === 2 && hero.heart === 2 && hero.wits === 2) {
      next.strength = c.attributeSets[0].strength;
      next.heart = c.attributeSets[0].heart;
      next.wits = c.attributeSets[0].wits;
    }
  }
  if (c.derived) {
    const endBase = c.derived.enduranceBase ?? null;
    const hopeBase = c.derived.hopeBase ?? null;
    const parryBase = c.derived.parryBase ?? null;
    if (endBase != null) next.enduranceMax = next.strength + endBase;
    if (hopeBase != null) next.hopeMax = next.heart + hopeBase;
    if (parryBase != null) next.parry = next.wits + parryBase;
  }

  // Starting skills
  if (c.startingSkills) {
    const skills: Hero['skills'] = { ...next.skills };
    for (const [nameLower, rating] of Object.entries(c.startingSkills)) {
      const nameUpper = nameLower.toUpperCase();
      const key = skillKeyFromNameUpper(nameUpper);
      if (!key) continue;
      if (!skills[key]) skills[key] = { rating, favoured: false };
      else skills[key] = { ...skills[key], rating };
    }
    next.skills = skills;
  }

  // Default favoured candidates (mark none; UI will choose)
  // Combat proficiencies: keep freeform, but could parse later from c.combatProficienciesText

  next.updatedAt = new Date().toISOString();
  return next;
}

export function HeroesPanel(props: { state: StoredState; setState: (s: StoredState) => void }) {
  const { state, setState } = props;
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetTitle, setSheetTitle] = useState<string>('');
  const [sheetBody, setSheetBody] = useState<React.ReactNode>(null);

  const sortedHeroes = useMemo(() => [...state.heroes].sort((a,b)=>a.name.localeCompare(b.name)), [state.heroes]);

  const activeHero = useMemo(() => state.activeHeroId ? state.heroes.find(h=>h.id===state.activeHeroId) ?? null : null,
    [state.activeHeroId, state.heroes]);

  function openSeeMore(title: string, body: React.ReactNode) {
    setSheetTitle(title);
    setSheetBody(body);
    setSheetOpen(true);
  }

  function addHero() {
    const now = new Date().toISOString();
    const h: Hero = {
      id: crypto.randomUUID(),
      name: 'New hero',
      cultureId: null,
      callingId: null,
      strength: 2, heart: 2, wits: 2,
      enduranceMax: 20, hopeMax: 10, parry: 0, shadow: 0, load: 0,
      skills: {},
      combatProficiencies: {},
      features: [],
      inventory: [],
      ui: { expanded: true },
      updatedAt: now,
    };
    const next = { ...state, heroes: [...state.heroes, h], activeHeroId: h.id };
    setState(next);
  }

  function updateHero(id: string, patch: Partial<Hero>) {
    const heroes = state.heroes.map(h => h.id === id ? { ...h, ...patch, updatedAt: new Date().toISOString() } : h);
    setState({ ...state, heroes });
  }

  function removeHero(id: string) {
    const heroes = state.heroes.filter(h => h.id !== id);
    const activeHeroId = state.activeHeroId === id ? (heroes[0]?.id ?? null) : state.activeHeroId;
    setState({ ...state, heroes, activeHeroId });
  }

  function setMode(mode: GameMode) {
    setState({
      ...state,
      mode,
      fellowship: { ...state.fellowship, mode },
    });
  }

  return (
    <div className="panel">
      <div className="panelHeader">
        <div className="panelTitle">Heroes</div>
        <div className="row">
          <select className="select" value={state.mode} onChange={(e)=>setMode(e.target.value as any)}>
            <option value="normal">Normal mode</option>
            <option value="strider">Strider mode</option>
          </select>
          <button className="btn primary" onClick={addHero}>+ Add</button>
        </div>
      </div>

      {sortedHeroes.length === 0 && (
        <div className="muted">No heroes yet. Click “+ Add”.</div>
      )}

      <div className="cards">
        {sortedHeroes.map(hero => {
          const culture = hero.cultureId ? findById(Cultures, hero.cultureId) : undefined;
          const calling = hero.callingId ? findById(Callings, hero.callingId) : undefined;
          const expanded = hero.ui.expanded || state.activeHeroId === hero.id;
          return (
            <div key={hero.id} className={"card " + (state.activeHeroId===hero.id ? "active" : "")}>
              <div className="cardTop">
                <input
                  className="input title"
                  value={hero.name}
                  onChange={(e)=>updateHero(hero.id,{ name: e.target.value })}
                  onFocus={()=>setState({ ...state, activeHeroId: hero.id })}
                />
                <div className="row">
                  <button className="btn" onClick={()=>updateHero(hero.id,{ ui: { expanded: !expanded } })}>
                    {expanded ? 'Collapse' : 'Expand'}
                  </button>
                  <button className="btn danger" onClick={()=>removeHero(hero.id)}>✕</button>
                </div>
              </div>

              {expanded && (
                <>
                  <div className="grid2">
                    <label className="field">
                      <span>Culture</span>
                      <select
                        className="select"
                        value={hero.cultureId ?? ''}
                        onChange={(e)=>{
                          const cultureId = e.target.value || null;
                          const updated = applyCultureToHero({ ...hero, cultureId });
                          updateHero(hero.id, updated);
                        }}
                      >
                        <option value="">—</option>
                        {sortByName(Cultures.entries).map(c=>(
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </label>

                    <label className="field">
                      <span>Calling</span>
                      <select
                        className="select"
                        value={hero.callingId ?? ''}
                        onChange={(e)=>updateHero(hero.id,{ callingId: e.target.value || null })}
                      >
                        <option value="">—</option>
                        {sortByName(Callings.entries).map(c=>(
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="row gap">
                    {culture && (
                      <button className="btn" onClick={()=>openSeeMore(culture.name, (
                        <div>
                          {culture.culturalBlessing && <p><b>Cultural Blessing:</b> {culture.culturalBlessing}</p>}
                          {culture.standardOfLiving && <p><b>Standard of Living:</b> {culture.standardOfLiving}</p>}
                          {culture.description && <p className="muted">{culture.description}</p>}
                          {culture.languages?.length ? <p><b>Languages:</b> {culture.languages.join(', ')}</p> : null}
                          {culture.suggestedFeatures?.length ? <p><b>Suggested Features:</b> {culture.suggestedFeatures.join(', ')}</p> : null}
                        </div>
                      ))}>
                        See more
                      </button>
                    )}
                    {calling && (
                      <button className="btn" onClick={()=>openSeeMore(calling.name, (
                        <div>
                          {calling.description && <p className="muted">{calling.description}</p>}
                          {!!calling.favouredSkills?.length && <p><b>Favoured Skills:</b> {calling.favouredSkills.join(', ')}</p>}
                          {calling.shadowPath && <p><b>Shadow Path:</b> {calling.shadowPath}</p>}
                        </div>
                      ))}>
                        See more
                      </button>
                    )}
                  </div>

                  <details className="details" open>
                    <summary>Attributes & Derived</summary>
                    <div className="grid3">
                      <label className="field">
                        <span>Strength</span>
                        <input className="input" type="number" value={hero.strength} onChange={(e)=>updateHero(hero.id,{ strength: Number(e.target.value) })} />
                      </label>
                      <label className="field">
                        <span>Heart</span>
                        <input className="input" type="number" value={hero.heart} onChange={(e)=>updateHero(hero.id,{ heart: Number(e.target.value) })} />
                      </label>
                      <label className="field">
                        <span>Wits</span>
                        <input className="input" type="number" value={hero.wits} onChange={(e)=>updateHero(hero.id,{ wits: Number(e.target.value) })} />
                      </label>
                      <label className="field">
                        <span>Endurance max</span>
                        <input className="input" type="number" value={hero.enduranceMax} onChange={(e)=>updateHero(hero.id,{ enduranceMax: Number(e.target.value) })} />
                      </label>
                      <label className="field">
                        <span>Hope max</span>
                        <input className="input" type="number" value={hero.hopeMax} onChange={(e)=>updateHero(hero.id,{ hopeMax: Number(e.target.value) })} />
                      </label>
                      <label className="field">
                        <span>Parry</span>
                        <input className="input" type="number" value={hero.parry} onChange={(e)=>updateHero(hero.id,{ parry: Number(e.target.value) })} />
                      </label>
                    </div>
                  </details>

                  <details className="details">
                    <summary>Skills</summary>
                    <div className="skillsGrid">
                      {Skills.entries.map(s=>{
                        const val = hero.skills[s.id]?.rating ?? 0;
                        const fav = hero.skills[s.id]?.favoured ?? false;
                        return (
                          <div key={s.id} className="skillRow">
                            <div className="skillName">
                              <span>{s.name}</span>
                              <span className="pill">{s.group}</span>
                            </div>
                            <div className="row">
                              <input className="input small" type="number" value={val} onChange={(e)=>{
                                const rating = Number(e.target.value);
                                const skills = { ...hero.skills, [s.id]: { rating, favoured: fav } };
                                updateHero(hero.id,{ skills });
                              }} />
                              <label className="row tiny">
                                <input type="checkbox" checked={fav} onChange={(e)=>{
                                  const skills = { ...hero.skills, [s.id]: { rating: val, favoured: e.target.checked } };
                                  updateHero(hero.id,{ skills });
                                }} />
                                <span>Fav</span>
                              </label>
                              <button className="btn" onClick={()=>openSeeMore(s.name, (
                                <div>
                                  <p><b>Group:</b> {s.group}</p>
                                  <p><b>Attribute:</b> {s.attribute}</p>
                                  {s.description ? <p className="muted">{s.description}</p> : <p className="muted">No description yet.</p>}
                                </div>
                              ))}>See more</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </details>

                  <details className="details">
                    <summary>Distinctive Features</summary>
                    <div className="row gap wrap">
                      {hero.features.map(fid=>{
                        const f = findById(Features, fid);
                        return (
                          <span key={fid} className="chip">
                            {f?.name ?? fid}
                            <button className="chipX" onClick={()=>{
                              updateHero(hero.id,{ features: hero.features.filter(x=>x!==fid) });
                            }}>×</button>
                          </span>
                        );
                      })}
                    </div>
                    <div className="row gap">
                      <select className="select" defaultValue="" onChange={(e)=>{
                        const fid = e.target.value;
                        if (!fid) return;
                        if (hero.features.includes(fid)) return;
                        updateHero(hero.id,{ features: [...hero.features, fid] });
                        e.currentTarget.value = '';
                      }}>
                        <option value="">+ Add feature…</option>
                        {sortByName(Features.entries).map(f=>(
                          <option key={f.id} value={f.id}>{f.name}</option>
                        ))}
                      </select>
                      <button className="btn" onClick={()=>openSeeMore("Distinctive Features", (
                        <div className="muted">
                          Features list is loaded from the TOR tables you provided. Select two (or more) as needed.
                        </div>
                      ))}>See more</button>
                    </div>
                  </details>

                  <details className="details">
                    <summary>Inventory</summary>
                    <div className="row gap">
                      <input className="input" placeholder="Item name" id={"inv-"+hero.id} />
                      <button className="btn" onClick={()=>{
                        const el = document.getElementById("inv-"+hero.id) as HTMLInputElement|null;
                        const name = (el?.value ?? '').trim();
                        if (!name) return;
                        const inventory = [...hero.inventory, { id: crypto.randomUUID(), name, kind: 'other' as const }];
                        updateHero(hero.id,{ inventory });
                        if (el) el.value = '';
                      }}>Add</button>
                    </div>
                    <ul className="list">
                      {hero.inventory.map(it=>(
                        <li key={it.id} className="listRow">
                          <span>{it.name}</span>
                          <button className="btn danger" onClick={()=>{
                            updateHero(hero.id,{ inventory: hero.inventory.filter(x=>x.id!==it.id) });
                          }}>Remove</button>
                        </li>
                      ))}
                    </ul>
                    <div className="muted">
                      Next step: connect this to the provided Equipment compendium for searchable picks + automatic Load.
                    </div>
                  </details>
                </>
              )}
            </div>
          );
        })}
      </div>

      <BottomSheet open={sheetOpen} title={sheetTitle} onClose={()=>setSheetOpen(false)}>
        {sheetBody}
      </BottomSheet>
    </div>
  );
}
