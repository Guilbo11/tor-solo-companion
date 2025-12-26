import React, { useEffect, useMemo, useState } from 'react';
import { StoredState, saveState } from '../core/storage';
import { compendiums, findEntryById, sortByName } from '../core/compendiums';
import { computeDerived, rollNameFallback } from '../core/tor2e';
import { getSkillAttribute, getSkillTN } from '../core/skills';
import { rollTOR, RollResult } from '../core/dice';
import BottomSheet from './BottomSheet';

type Props = {
  state: StoredState;
  setState: React.Dispatch<React.SetStateAction<StoredState>>;
  onOpenCampaign?: (campaignId: string) => void;
  mode?: 'landing'|'main';
};

function uid(prefix: string) {
  return prefix + '-' + Math.random().toString(36).slice(2, 10);
}

export default function HeroesPanel({ state, setState, onOpenCampaign, mode = 'main' }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(state.ui?.heroesExpandedId ?? null);
  const [activeId, setActiveId] = useState<string | null>(state.ui?.activeHeroId ?? null);

  // Mobile-first inner tabs (PocketForge-ish)
  const [heroTab, setHeroTab] = useState<Record<string, 'Sheet'|'Skills'|'Gear'|'Experience'>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [createStep, setCreateStep] = useState(0);
  const [createShowAll, setCreateShowAll] = useState(true);
  const [draftHero, setDraftHero] = useState<any | null>(null);
  const [showFeatChoices, setShowFeatChoices] = useState(true);
  const [showAddVirtuesRewards, setShowAddVirtuesRewards] = useState(true);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetTitle, setSheetTitle] = useState('');
  const [sheetPack, setSheetPack] = useState<'skills'|'features'|'cultures'|'callings'|'virtues'|'rewards'|'equipment'|'custom'|null>(null);
  const [sheetBody, setSheetBody] = useState<any>(null);

  const campaigns = (state as any).campaigns ?? [];
  const activeCampaignId = (state as any).activeCampaignId ?? (campaigns[0]?.id ?? 'camp-1');
  const [view, setView] = useState<'campaigns'|'heroes'>(mode === 'landing' ? 'campaigns' : 'heroes');
  const heroesAll = (state as any).heroes ?? [];
  const heroes = heroesAll.filter((h:any)=> (h.campaignId ?? activeCampaignId) === activeCampaignId);

  // TN base: normal TOR uses 20; Strider Mode (Fellowship) uses 18.
  const tnBase = 20; // default; per-hero TN base is derived from hero.striderMode

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

  function solRank(sol: any): number {
    const v = String(sol ?? '').trim().toLowerCase();
    if (!v) return 0;
    // Typical TOR 2e ladder. (We keep this local so the UI can enforce limits.)
    if (v === 'frugal') return 1;
    if (v === 'common') return 2;
    if (v === 'prosperous') return 3;
    if (v === 'rich') return 4;
    return 0;
  }

  function usefulItemLimitBySOL(sol: any): number {
    // Conservative default mapping when a culture doesn't specify a number explicitly.
    const r = solRank(sol);
    if (r <= 1) return 1;
    if (r === 2) return 2;
    if (r === 3) return 3;
    return 4;
  }

  function virtueChoices(hero: any) {
    const cultureId = hero?.cultureId;
    const wisdom = Number(hero?.points?.wisdom ?? 0);
    return sortByName((compendiums.virtues.entries ?? []).filter((v:any)=>{
      if (!v?.virtueType) return true;
      if (v.virtueType === 'cultural') return wisdom >= 2 && v.cultureId === cultureId;
      return false;
    }));
  }

  const PROF_LABEL_TO_KEY: Record<string, 'axes'|'bows'|'spears'|'swords'> = {
    'Axes': 'axes',
    'Bows': 'bows',
    'Spears': 'spears',
    'Swords': 'swords',
  };

  function getCultureSkillMins(hero: any): Record<string, number> {
    const c: any = getCultureEntry(hero.cultureId);
    const mins: Record<string, number> = {};
    const starting = c?.startingSkills ?? {};
    for (const [sid, v] of Object.entries(starting)) mins[String(sid)] = Number(v) || 0;
    return mins;
  }

  function getCultureCombatMins(hero: any): Record<'axes'|'bows'|'spears'|'swords', number> {
    const mins: Record<'axes'|'bows'|'spears'|'swords', number> = { axes: 0, bows: 0, spears: 0, swords: 0 };
    const c: any = getCultureEntry(hero.cultureId);
    if (!c) return mins;

    const cp = Array.isArray(c.combatProficiencies) ? c.combatProficiencies[0] : null;
    if (cp?.or?.length && cp.rating) {
      const chosen2: string | undefined = (hero as any).cultureCombatProf2;
      const chosenKey = chosen2 ? PROF_LABEL_TO_KEY[chosen2] : undefined;
      if (chosenKey) mins[chosenKey] = Math.max(mins[chosenKey], Number(cp.rating) || 0);
    }

    const choiceCount = Number(c.combatProficiencyChoice ?? 0);
    if (choiceCount >= 1) {
      const chosen1: string | undefined = (hero as any).cultureCombatProf1;
      const chosenKey = chosen1 ? PROF_LABEL_TO_KEY[chosen1] : undefined;
      if (chosenKey) mins[chosenKey] = Math.max(mins[chosenKey], 1);
    }

    return mins;
  }

  function clampToCultureMinimums(hero: any, patch: any): any {
    const next = { ...hero, ...patch };
    const skillMins = getCultureSkillMins(next);
    const combatMins = getCultureCombatMins(next);

    const nextSkillRatings = { ...(next.skillRatings ?? {}) };
    for (const [sid, min] of Object.entries(skillMins)) {
      const cur = Number(nextSkillRatings[sid] ?? 0);
      if (cur < min) nextSkillRatings[sid] = min;
    }

    const nextCombat = { ...(next.combatProficiencies ?? {}) };
    for (const k of Object.keys(combatMins) as Array<keyof typeof combatMins>) {
      const cur = Number((nextCombat as any)[k] ?? 0);
      const min = combatMins[k];
      if (cur < min) (nextCombat as any)[k] = min;
    }

    return { ...patch, skillRatings: nextSkillRatings, combatProficiencies: nextCombat };
  }

  function unwrapText(input: any): string {
    if (input == null) return '';
    const t = String(input).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = t.split('\n');
    const paras: string[] = [];
    let cur: string[] = [];
    const flush = () => {
      if (cur.length) {
        paras.push(cur.join(' ').replace(/\s+/g, ' ').trim());
        cur = [];
      }
    };
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) { flush(); continue; }
      cur.push(line);
    }
    flush();
    return paras.join('\n\n');
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


  function setActiveCampaign(id: string) {
    setState((s:any) => {
      const updated = { ...s, activeCampaignId: id };
      saveState(updated);
      return updated;
    });
  }

  function addCampaign() {
    const name = prompt('Campaign name?', 'New Campaign');
    if (!name) return;
    const now = new Date().toISOString();
    const newCamp = { id: uid('camp'), name: String(name), createdAt: now, updatedAt: now };
    setState((s:any) => {
      const next = { ...s, campaigns: [...((s as any).campaigns ?? []), newCamp], activeCampaignId: newCamp.id };
      saveState(next);
      return next;
    });
    setView('heroes');
  }

  function deleteCampaign(id: string) {
    const camp = (campaigns ?? []).find((c:any)=>c.id===id);
    const ok = window.confirm(`Delete campaign "${camp?.name ?? id}"? This is irreversible and will delete all heroes in it.`);
    if (!ok) return;
    setState((s:any)=>{
      const nextCampaigns = ((s as any).campaigns ?? []).filter((c:any)=>c.id!==id);
      const nextHeroes = ((s as any).heroes ?? []).filter((h:any)=> (h.campaignId ?? (s as any).activeCampaignId) !== id);
      const nextActive = (s as any).activeCampaignId===id ? (nextCampaigns[0]?.id ?? 'camp-1') : (s as any).activeCampaignId;
      const next = { ...s, campaigns: nextCampaigns, heroes: nextHeroes, activeCampaignId: nextActive };
      saveState(next);
      return next;
    });
    setView('campaigns');
  }

  function deleteHero(id: string) {
    const hero = heroesAll.find((h:any)=>h.id===id);
    const ok = window.confirm(`Delete hero "${hero?.name ?? id}"? This is irreversible.`);
    if (!ok) return;
    setState((s:any)=>{
      const next = { ...s, heroes: ((s as any).heroes ?? []).filter((h:any)=>h.id!==id) };
      saveState(next);
      return next;
    });
  }
  function addHero() {
    const now = new Date().toISOString();
    const baseHero: any = {
      id: uid('hero'),
      campaignId: activeCampaignId,
      name: 'New Hero',
      createdAt: now,
      updatedAt: now,
      creationComplete: false,
      striderMode: false,
      gender: 'Other',
      // baseline TN base is handled per-hero (20 normal, 18 strider)
      attributes: { strength: 2, heart: 2, wits: 2 },
      endurance: { max: 22, current: 22 },
      hope: { max: 10, current: 10 },
      shadow: { points: 0, shadowScars: 0 },
      points: { adventure: 0, skill: 0, fellowship: 0, valour: 1, wisdom: 1 },
      cultureId: '',
      callingId: '',
      featureIds: [],
      skillRatings: Object.fromEntries((compendiums.skills.entries ?? []).map((s: any) => [s.id, 0])),
      skillFavoured: {},
      combatProficiencies: { axes: 0, bows: 0, spears: 0, swords: 0 },
      usefulItems: [],
      inventory: [],
      virtueIds: [],
      rewardIds: [],
      notes: '',
      // Previous Experience baseline will be set after Culture/Calling choices,
      // so culture/calling freebies never consume the PE budget.
      previousExperience: {
        baselineSkillRatings: Object.fromEntries((compendiums.skills.entries ?? []).map((s: any) => [s.id, 0])),
        baselineCombatProficiencies: { axes: 0, bows: 0, spears: 0, swords: 0 },
        committed: false,
      },
    };
    setDraftHero(baseHero);
    setCreateStep(0);
    setCreateOpen(true);
  }

  function updateHero(id: string, patch: any) {
    const nextHeroes = heroesAll.map(h => {
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
    setSheetPack(pack);
    setSheetTitle(entry.name);
    setSheetBody(entry);
    setSheetOpen(true);
  }


  function openCustom(title: string, description: string) {
    setSheetPack('custom');
    setSheetTitle(title);
    setSheetBody({ description });
    setSheetOpen(true);
  }

  const cultureOptions = sortByName(compendiums.cultures.entries ?? []);
  const callingOptions = sortByName(compendiums.callings.entries ?? []);
  // Do not show Culture/Calling automatic features in the selectable list.
  const excludedSelectableFeatureIds = new Set<string>([
    'strider',
    'redoubtable','naugrim','kings-of-men','stout-hearted','heart-of-the-wild',
    'elven-skill','hardened-by-life','barterer','a-little-people',
    'leadership','enemy-lore','folk-lore','rhymes-of-lore','burglary','shadow-lore',
  ]);
  const featureOptions = sortByName((compendiums.features.entries ?? []).filter((f:any)=> !excludedSelectableFeatureIds.has(f.id)));

  const autoFeatureIds = (hero: any): string[] => {
    const ids: string[] = [];
    // Cultural Blessings (as Features)
    const cultureMap: Record<string, string[]> = {
      'bardings': ['stout-hearted'],
      'beornings': ['skin-changer'],
      'hobbits': ['hobbit-sense', 'halflings'],
      'elves of lindon': ['elven-skill', 'the-long-defeat'],
      
      "dwarves of durin's folk": ['redoubtable', 'naugrim'],
      'rangers of the north': ['kings-of-men', 'allegiance-of-the-dunedain'],
      'men of bree': ['bree-blood'],
    };
    const cultureEntry: any = hero?.cultureId ? findEntryById(compendiums.cultures.entries ?? [], hero.cultureId) : null;
    const cName = String(cultureEntry?.name ?? '').toLowerCase();
    for (const [k, arr] of Object.entries(cultureMap)) {
      if (cName === k) ids.push(...arr);
    }
    // Calling additional Distinctive Feature
    const callingEntry: any = hero?.callingId ? findEntryById(compendiums.callings.entries ?? [], hero.callingId) : null;
    const addFeat = String(callingEntry?.additionalFeature ?? '').toLowerCase().trim();
    const callingMap: Record<string, string> = {
      'leadership': 'leadership',
      'enemy-lore': 'enemy-lore',
      'folk-lore': 'folk-lore',
      'rhymes of lore': 'rhymes-of-lore',
      'burglary': 'burglary',
      'shadow-lore': 'shadow-lore',
    };
    if (addFeat && callingMap[addFeat]) ids.push(callingMap[addFeat]);
    // Strider mode
    if (hero?.striderMode) ids.push('strider');
    return Array.from(new Set(ids));
  };

  const isLockedAutoFeature = (hero: any, fid: string): boolean => autoFeatureIds(hero).includes(fid);

  return (
    <div className="panel">
      <div className="panelHeader">
        {view === 'campaigns' ? (
          <>
            <div className="panelTitle">Campaigns</div>
            <button className="btn" onClick={addCampaign}>+ New</button>
          </>
        ) : (
          <>
            <div className="row" style={{alignItems:'center', gap:8}}>
              {mode === 'landing' ? (
                <button className="btn btn-ghost" onClick={()=>setView('campaigns')}>← Back</button>
              ) : null}
              <div>
                <div className="panelTitle" style={{margin:0}}>Campaign</div>
                <div className="small muted">{(campaigns.find((c:any)=>c.id===activeCampaignId)?.name ?? '—')}</div>
              </div>
            </div>
            <div className="row" style={{gap:8, alignItems:'center'}}>
              <button className="btn" onClick={addHero}>+ Hero</button>
            </div>
          </>
        )}
      </div>

      {view === 'campaigns' ? (
        <>
          <div className="hint">
            Create multiple campaigns (solo runs). Tap a campaign to open it.
          </div>

          {campaigns.length === 0 && (
            <div className="empty">No campaigns yet. Click <b>+ New</b> to create one.</div>
          )}

          <div className="cards">
            {campaigns.map((c:any) => {
              const count = heroesAll.filter((h:any)=> (h.campaignId ?? activeCampaignId) === c.id).length;
              return (
                <div key={c.id} className="card">
                  <div className="cardTop">
                    <div className="cardTopLeft" onClick={()=>{
                      setActiveCampaign(c.id);
                      if (mode === 'landing') {
                        // Landing page should only manage campaigns.
                        // Opening a campaign transitions to the main app.
                        onOpenCampaign?.(c.id);
                        return;
                      }
                      setView('heroes');
                      onOpenCampaign?.(c.id);
                    }}>
                      <div className="heroName">{c.name}</div>
                      <div className="sub">{count} hero{count===1?'':'es'}</div>
                    </div>
                    <div className="cardTopRight">
                      <button className="btn btn-danger" title="Delete" onClick={(e)=>{
                        e.stopPropagation();
                        deleteCampaign(c.id);
                      }}>🗑</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <>
<div className="hint">
        Tap a skill or feature name to open <b>i</b> (bottom sheet).
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
          const tnBaseHero = hero.striderMode ? 18 : 20;
                  const derived = computeDerived(hero, tnBaseHero);
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
                  <button className="btn btn-danger" title="Delete" onClick={(e)=>{ e.stopPropagation(); deleteHero(hero.id); }}>🗑</button>
                </div>
              </div>

              {isExpanded && (
                <div className="cardBody">
                  <div className="innerTabs">
                    {(['Sheet','Skills','Gear','Experience'] as const).map(t => (
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
                          if (!pe?.committed) return 0;
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
	                        return (
                          <>
                            <div className="row" style={{gap: 10, flexWrap:'wrap'}}>
                              <div className="small">Budget: <b>{budget}</b> · Spent: <b>{spent}</b> · Remaining: <b>{remaining}</b></div>
                              <span className="muted small">(Previous Experience: Skills up to <b>4</b>, Proficiencies up to <b>3</b>)</span>
                            </div>
	                            <div className="row" style={{gap: 8, marginTop: 8, flexWrap:'wrap'}}>
	                              <span className="small muted">Budget updates immediately. If a + would exceed the remaining points, it is disabled.</span>
	                            </div>
                          </>
                        );
                      })()}

                      <hr />

                      <div className="sectionTitle">Combat Proficiencies</div>
                      <div className="small muted">Use + / – to adjust quickly. Minimums may be set by Culture.</div>
                      {(() => {
	                        const committed = true;
                        const profs = hero.combatProficiencies ?? {};
                        const mins = getCultureCombatMins(hero);
                        const rows: Array<{ key: 'axes'|'bows'|'spears'|'swords'; label: string }> = [
                          { key: 'axes', label: 'Axes' },
                          { key: 'bows', label: 'Bows' },
                          { key: 'spears', label: 'Spears' },
                          { key: 'swords', label: 'Swords' },
                        ];
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
                        const budget = hero.striderMode ? 15 : 10;
                        const computeSpent = () => {
                          if (!committed) return 0;
                          let spent = 0;
                          const curSkills = hero.skillRatings ?? {};
                          const baseSkills = pe?.baselineSkillRatings ?? {};
                          for (const [sid, cur] of Object.entries(curSkills)) {
                            const b = Number((baseSkills as any)[sid] ?? 0);
                            const c = Number(cur ?? 0);
                            for (let lvl = b + 1; lvl <= Math.min(4, c); lvl++) spent += skillCost(lvl);
                          }
                          const curP = hero.combatProficiencies ?? {};
                          const baseP = pe?.baselineCombatProficiencies ?? { axes: 0, bows: 0, spears: 0, swords: 0 };
                          (['axes','bows','spears','swords'] as const).forEach(k => {
                            const b = Number((baseP as any)[k] ?? 0);
                            const c = Number((curP as any)[k] ?? 0);
                            for (let lvl = b + 1; lvl <= Math.min(3, c); lvl++) spent += profCost(lvl);
                          });
                          return spent;
                        };
                        const spent = computeSpent();
                        const remaining = Math.max(0, budget - spent);

                        const canEdit = committed;
                        return (
                          <div className="skillsList">
                            {rows.map(r => {
                              const cur = Number((profs as any)[r.key] ?? 0);
                              const minByCulture = mins[r.key] ?? 0;
                              const baselineVal = pe?.baselineCombatProficiencies ? Number((pe.baselineCombatProficiencies as any)[r.key] ?? 0) : undefined;
                              const extra = (typeof baselineVal === 'number') ? Math.max(0, cur - baselineVal) : 0;

                              // Previous Experience cap
                              const maxAllowed = canEdit ? Math.max(minByCulture, 3) : cur;

                              // Budget enforcement for +
                              const nextLevel = Math.min(maxAllowed, cur + 1);
                              const incCost = (canEdit && typeof baselineVal === 'number' && nextLevel > baselineVal && nextLevel <= 3) ? profCost(nextLevel) : 0;
                              const canIncByBudget = !canEdit ? false : (incCost <= remaining);
                              return (
                                <div key={r.key} className="skillRow">
                                  <div className="skillName">{r.label}</div>
                                  <div className="skillMeta">{minByCulture ? `Min ${minByCulture} (Culture)${baselineVal !== undefined ? ` · Baseline ${baselineVal}${extra ? ` (+${extra})` : ''}` : ''}` : (baselineVal !== undefined ? `Baseline ${baselineVal}${extra ? ` (+${extra})` : ''}` : '')}</div>
                                  <div className="row" style={{gap:6}}>
                                    <button className="btn btn-ghost" disabled={!canEdit || cur<=minByCulture} onClick={()=>updateHero(hero.id,{combatProficiencies:{...(profs as any),[r.key]:Math.max(minByCulture,cur-1)}})}>-</button>
                                    <div className="skillNum" style={{minWidth: 24, textAlign:'center'}}>{cur}</div>
                                    <button className="btn btn-ghost" disabled={!canEdit || cur>=maxAllowed || !canIncByBudget} onClick={()=>updateHero(hero.id,{combatProficiencies:{...(profs as any),[r.key]:Math.min(maxAllowed,cur+1)}})}>+</button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}

                      <hr />

                      <div className="sectionTitle">Skills</div>
                      <div className="small muted">⭐ = Favoured (from Culture selection). Tap name for i. Minimums may be set by Culture.</div>
                      {(() => {
                        const mins = getCultureSkillMins(hero);
                        return (
                          <>
                            {Object.keys(skillsByGroup).map(group => (
                              <details key={group} className="details" open={group==='Personality'}>
                                <summary>{group}</summary>
                                <div className="skillsList">
                                  {skillsByGroup[group].map((s:any)=>{
                                    const rating = hero.skillRatings?.[s.id] ?? 0;
                                    const minByCulture = mins[s.id] ?? 0;
                                    const isFav = derived.favouredSkillSet.has(s.id);
                                    const pe = hero.previousExperience;
	                              const committed = true;
                                    const baselineVal = pe?.baselineSkillRatings ? Number((pe.baselineSkillRatings as any)[s.id] ?? 0) : undefined;
                                    const extra = (typeof baselineVal === 'number') ? Math.max(0, rating - baselineVal) : 0;

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
                                    const budget = hero.striderMode ? 15 : 10;
                                    const computeSpent = () => {
                                      if (!committed) return 0;
                                      let spent = 0;
                                      const curSkills = hero.skillRatings ?? {};
                                      const baseSkills = pe?.baselineSkillRatings ?? {};
                                      for (const [sid, cur] of Object.entries(curSkills)) {
                                        const b = Number((baseSkills as any)[sid] ?? 0);
                                        const c = Number(cur ?? 0);
                                        for (let lvl = b + 1; lvl <= Math.min(4, c); lvl++) spent += skillCost(lvl);
                                      }
                                      const curP = hero.combatProficiencies ?? {};
                                      const baseP = pe?.baselineCombatProficiencies ?? { axes: 0, bows: 0, spears: 0, swords: 0 };
                                      (['axes','bows','spears','swords'] as const).forEach(k => {
                                        const b = Number((baseP as any)[k] ?? 0);
                                        const c = Number((curP as any)[k] ?? 0);
                                        for (let lvl = b + 1; lvl <= Math.min(3, c); lvl++) spent += profCost(lvl);
                                      });
                                      return spent;
                                    };
                                    const spent = computeSpent();
                                    const remaining = Math.max(0, budget - spent);

                                    const canEdit = committed;
                                    const maxAllowed = canEdit ? Math.max(minByCulture, 4) : rating;
                                    const nextLevel = Math.min(maxAllowed, rating + 1);
                                    const incCost = (canEdit && typeof baselineVal === 'number' && nextLevel > baselineVal && nextLevel <= 4) ? skillCost(nextLevel) : 0;
                                    const canIncByBudget = !canEdit ? false : (incCost <= remaining);
                                    return (
                                      <div key={s.id} className={"skillRow " + (isFav ? 'favoured' : '')}>
                                        <div className="skillName" onClick={()=>openEntry('skills', s.id)}>
                                          {isFav ? '⭐ ' : ''}{s.name}
                                        </div>
                                        {(() => {
                                          const attr = getSkillAttribute(s.id);
                                          const tn = getSkillTN(hero, s.id, tnBaseHero);
                                          return <div className="skillMeta">{attr} · TN {tn}{minByCulture ? ` · Min ${minByCulture} (Culture)` : ''}{baselineVal !== undefined ? ` · Baseline ${baselineVal}${extra ? ` (+${extra})` : ''}` : ''}</div>;
                                        })()}
                                        <div className="row" style={{gap:6}}>
                                          <button className="btn btn-ghost" disabled={!canEdit || rating<=minByCulture} onClick={()=>updateHero(hero.id,{skillRatings:{...(hero.skillRatings??{}),[s.id]:Math.max(minByCulture, rating-1)}})}>-</button>
                                          <div className="skillNum" style={{minWidth: 24, textAlign:'center'}}>{rating}</div>
                                          <button className="btn btn-ghost" disabled={!canEdit || rating>=maxAllowed || !canIncByBudget} onClick={()=>updateHero(hero.id,{skillRatings:{...(hero.skillRatings??{}),[s.id]:Math.min(maxAllowed, rating+1)}})}>+</button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </details>
                            ))}
                          </>
                        );
                      })()}
                    </div>
                  )}

                  {activeTab === 'Gear' && (
                    <>
                      <div className="section" style={{marginTop: 0}}>
                        <div className="sectionTitle">Useful items</div>
                                                <UsefulItemsEditor hero={hero} updateHero={(patch)=>updateHero(hero.id, patch)} />
                      </div>
                      <div className="section">
                        <div className="sectionTitle">Inventory & Equipment</div>
                        <div className="small muted">Use <b>Equip</b> to apply armour/shield/parry and add weapon options for Attacks. Use <b>Dropped</b> to remove from Load.</div>
                        <InventoryEditor hero={hero} updateHero={(patch)=>updateHero(hero.id, patch)} onSeeMore={openEntry} />
                      </div>
                    </>
                  )}

                  {activeTab === 'Experience' && (
                    <>
                      <div className="section" style={{marginTop: 0}}>
                        <div className="sectionTitle">Experience</div>
                        <div className="grid2">
                          <div className="miniCard">
                            <div className="miniTitle">Adventure points</div>
                            <input className="input" type="number" min={0} value={hero.adventurePoints ?? 0} onChange={(e)=>updateHero(hero.id,{adventurePoints:Number(e.target.value)})}/>
                          </div>
                          <div className="miniCard">
                            <div className="miniTitle">Skill points</div>
                            <input className="input" type="number" min={0} value={hero.skillPoints ?? 0} onChange={(e)=>updateHero(hero.id,{skillPoints:Number(e.target.value)})}/>
                          </div>
                          <div className="miniCard">
                            <div className="miniTitle">Wisdom</div>
                            <input className="input" type="number" min={0} max={6} value={hero.wisdom ?? 0} onChange={(e)=>updateHero(hero.id,{wisdom:Number(e.target.value)})}/>
                          </div>
                          <div className="miniCard">
                            <div className="miniTitle">Valour</div>
                            <input className="input" type="number" min={0} max={6} value={hero.valour ?? 0} onChange={(e)=>updateHero(hero.id,{valour:Number(e.target.value)})}/>
                          </div>
                        </div>
                      </div>

                      <div className="section">
                        <div className="sectionTitle">Rewards and Virtues</div>
                        <div className="row" style={{justifyContent:'space-between', alignItems:'center'}}>
                          <div className="small muted">Add/roll controls</div>
                          <button className="btn btn-ghost" onClick={()=>setShowAddVirtuesRewards(v=>!v)}>{showAddVirtuesRewards ? 'Hide' : 'Show'}</button>
                        </div>
                        {showAddVirtuesRewards && (
                          <div className="row" style={{gap: 8, flexWrap:'wrap'}}>
                            <button className="btn btn-ghost" onClick={()=>addVirtueRoll(hero)}>Roll Virtue (1d6)</button>
                            <button className="btn btn-ghost" onClick={()=>addRewardRoll(hero)}>Roll Reward (1d6)</button>
                          </div>
                        )}

                        <div className="row" style={{marginTop: 10, gap: 10, flexWrap:'wrap'}}>
                          {showAddVirtuesRewards && <PickerAdd
                            label="Add Virtue"
                            entries={virtueChoices(hero)}
                            onAdd={(id)=>{
                              const cur: string[] = hero.virtueIds ?? [];
                              if (!cur.includes(id)) updateHero(hero.id,{virtueIds:[id, ...cur]});
                            }}
                            onSeeMore={(id)=>openEntry('virtues', id)}
                          />}
                          {showAddVirtuesRewards && <PickerAdd
                            label="Add Reward"
                            entries={sortByName(compendiums.rewards.entries ?? [])}
                            onAdd={(id)=>{
                              const cur: string[] = hero.rewardIds ?? [];
                              if (!cur.includes(id)) updateHero(hero.id,{rewardIds:[id, ...cur]});
                            }}
                            onSeeMore={(id)=>openEntry('rewards', id)}
                          />}
                        </div>

                        <div className="row" style={{marginTop: 8, gap: 12, flexWrap:'wrap'}}>
                          <div style={{flex:1, minWidth: 240}}>
                            <div className="label">Virtues</div>
                            {(hero.virtueIds ?? []).length === 0 ? <div className="small muted">None yet.</div> : null}
                            {(hero.virtueIds ?? []).map((vid:string)=> {
                              const v:any = findEntryById(compendiums.virtues.entries ?? [], vid);
                              return (
                                <div key={vid} className="pillRow">
                                  <div style={{flex:1}}>{v?.name ?? vid}</div><button className="btn btn-ghost" onClick={()=>openEntry('virtues', vid)}>i</button>
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
                                  <div style={{flex:1}}>{r?.name ?? rid}</div><button className="btn btn-ghost" onClick={()=>openEntry('rewards', rid)}>i</button>
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
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      
        </>
      )}

      <BottomSheet open={createOpen} title={`New Hero`} closeOnBackdrop={false} closeOnEsc={false} onClose={()=>{ setCreateOpen(false); setDraftHero(null); }}>
        {draftHero ? (
          <div>
            <div className="small muted" style={{marginBottom:8}}>
              Fields marked with <b>*</b> will be locked after creation.
            </div>

            <label className="row" style={{gap: 8, marginBottom: 12}}>
              <input type="checkbox" checked={createShowAll} onChange={(e)=>setCreateShowAll(e.target.checked)} />
              <span className="small">Show all steps (scroll)</span>
            </label>

            {(createShowAll || createStep===0) && (
              <div>
                <div className="label">* Mode of play</div>
                <select className="input" value={draftHero.striderMode ? 'strider' : 'fellowship'} onChange={(e)=>{
                  const v = e.target.value === 'strider';
                  setDraftHero((h:any)=>({ ...h, striderMode: v }));
                }}>
                  <option value="fellowship">Fellowship</option>
                  <option value="strider">Strider</option>
                </select>
                <div className="small muted" style={{marginTop:6}}>Strider uses TN base 18 (instead of 20) and has 15 Previous Experience points.</div>
              </div>
            )}

            {(createShowAll || createStep===1) && (
              <div>
                <div className="label">* Culture</div>
                <select className="input" value={draftHero.cultureId ?? ''} onChange={(e)=>{
                  const cid = e.target.value;
                  const c:any = findEntryById(compendiums.cultures.entries ?? [], cid);
                  setDraftHero((h:any)=>{
                    const next:any = { ...h, cultureId: cid };
                    // Apply culture starting skills
                    const cur = { ...(next.skillRatings ?? {}) };
                    const starting = c?.startingSkills ?? {};
                    for (const k of Object.keys(starting)) {
                      cur[k] = Math.max(Number(cur[k] ?? 0), Number(starting[k] ?? 0));
                    }
                    next.skillRatings = cur;
                    // Standard of living
                    next.standardOfLiving = c?.standardOfLiving ?? next.standardOfLiving;
                    // Reset culture-related picks
                    next.cultureFavouredSkillId = '';
                    next.cultureDistinctiveFeatureIds = [];
                    next.cultureCombatProf2 = undefined;
                    next.cultureCombatProf1 = undefined;
	                    // Reset Previous Experience baseline whenever Culture changes so freebies never consume PE.
	                    next.previousExperience = {
	                      ...(next.previousExperience ?? {}),
	                      baselineSkillRatings: { ...(next.skillRatings ?? {}) },
	                      baselineCombatProficiencies: { ...(next.combatProficiencies ?? {}) },
	                    };
	                    // Also reset any PE purchases.
	                    // (Purchases are tracked as deltas above the baseline.)
                    return next;
                  });
                }}>
                  <option value="">(choose)</option>
                  {sortByName(compendiums.cultures.entries ?? []).map((c:any)=>(
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                {draftHero.cultureId ? (
                  <div className="small muted" style={{marginTop:6}}>
                    Standard of Living: <b>{String(getCultureEntry(draftHero.cultureId)?.standardOfLiving ?? '—')}</b>
                  </div>
                ) : null}
              </div>
            )}

            {(createShowAll || createStep===2) && (
              <div>
                <div className="label">* Culture starting attribute array</div>
                {(() => {
                  const c:any = draftHero.cultureId ? getCultureEntry(draftHero.cultureId) : null;
                  const rolls = Array.isArray(c?.attributeRolls) ? c.attributeRolls : [];
                  if (!c || rolls.length===0) return <div className="small muted">Select a Culture first.</div>;
                  const chosen = Number(draftHero.attributeRollChoice ?? 1);
                  return (
                    <div className="pillGrid">
                      {rolls.map((r:any)=> {
                        const selected = Number(r.roll)===chosen;
                        return (
                          <div key={r.roll} className={"pill " + (selected ? 'on' : '')} onClick={()=>{
                            const strength = Number(r.strength); const heart = Number(r.heart); const wits = Number(r.wits);
                            const endMax = strength + Number(c?.derived?.enduranceBonus ?? 20);
                            const hopeMax = heart + Number(c?.derived?.hopeBonus ?? 8);
                            setDraftHero((h:any)=>({
                              ...h,
                              attributeRollChoice: Number(r.roll),
                              attributes: { ...(h.attributes ?? {}), strength, heart, wits },
                              endurance: { ...(h.endurance ?? {}), max: endMax, current: endMax },
                              hope: { ...(h.hope ?? {}), max: hopeMax, current: hopeMax },
                            }));
                          }}>
                            <div><b>{r.roll}</b>: STR {r.strength} / HEA {r.heart} / WIT {r.wits}</div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
                <div className="small muted" style={{marginTop:6}}>After creation you may edit attributes and resources, but not the chosen starting array.</div>
              </div>
            )}

            {(createShowAll || createStep===3) && (
              <div>
                <div className="label">* Culture Favoured skill</div>
                {(() => {
                  const c:any = draftHero.cultureId ? getCultureEntry(draftHero.cultureId) : null;
                  const opts: string[] = Array.isArray(c?.favouredSkillCandidates) ? c.favouredSkillCandidates : [];
                  if (!c || opts.length===0) return <div className="small muted">Select a Culture first.</div>;
                  const cur = String(draftHero.cultureFavouredSkillId ?? '');
                  return (
                    <select className="input" value={cur} onChange={(e)=>{
                      const sid = e.target.value;
                      setDraftHero((h:any)=>({ ...h, cultureFavouredSkillId: sid, skillFavoured: { ...(h.skillFavoured ?? {}), [sid]: true } }));
                    }}>
                      <option value="">(choose)</option>
                      {opts.map((sid)=>{
                        const s:any = findEntryById(compendiums.skills.entries ?? [], sid);
                        return <option key={sid} value={sid}>{s?.name ?? sid}</option>;
                      })}
                    </select>
                  );
                })()}
              </div>
            )}

            {(createShowAll || createStep===4) && (
              <div>
                <div className="label">* Culture Combat proficiencies</div>
                {(() => {
                  const c:any = draftHero.cultureId ? getCultureEntry(draftHero.cultureId) : null;
                  const blocks: any[] = Array.isArray(c?.combatProficiencies) ? c.combatProficiencies : [];
                  if (!c || blocks.length===0) return <div className="small muted">Select a Culture first.</div>;
                  const or = blocks.find(b=>Array.isArray(b.or))?.or ?? ['Axes','Bows','Spears','Swords'];
                  const selected2 = String(draftHero.cultureCombatProf2 ?? '');
                  const selected1 = String(draftHero.cultureCombatProf1 ?? '');
                  return (
                    <div className="row" style={{gap:10, flexWrap:'wrap'}}>
                      <div className="field" style={{flex:1}}>
                        <div className="label">+2</div>
                        <select className="input" value={selected2} onChange={(e)=>{
                          const v = e.target.value;
                          setDraftHero((h:any)=>{
                            const next:any = { ...h, cultureCombatProf2: v, cultureCombatProf1: (h.cultureCombatProf1===v? '' : h.cultureCombatProf1) };
                            const profs = { ...(next.combatProficiencies ?? {}) };
                            const key = PROF_LABEL_TO_KEY[v] ?? null;
                            if (key) profs[key] = Math.max(Number(profs[key] ?? 0), 2);
                            next.combatProficiencies = profs;
                            return next;
                          });
                        }}>
                          <option value="">(choose)</option>
                          {or.map((l:string)=><option key={l} value={l}>{l}</option>)}
                        </select>
                      </div>
                      <div className="field" style={{flex:1}}>
                        <div className="label">+1</div>
                        <select className="input" value={selected1} onChange={(e)=>{
                          const v = e.target.value;
                          setDraftHero((h:any)=>{
                            const next:any = { ...h, cultureCombatProf1: v };
                            const profs = { ...(next.combatProficiencies ?? {}) };
                            const key = PROF_LABEL_TO_KEY[v] ?? null;
                            if (key) profs[key] = Math.max(Number(profs[key] ?? 0), 1);
                            next.combatProficiencies = profs;
                            return next;
                          });
                        }}>
                          <option value="">(choose)</option>
                          {(['Axes','Bows','Spears','Swords'] as const).filter((l)=>l!==selected2).map((l:string)=><option key={l} value={l}>{l}</option>)}
                        </select>
                      </div>
                    </div>
                  );
                })()}
                <div className="small muted" style={{marginTop:6}}>These bonuses set minimum proficiency ratings and won’t spend Previous Experience.</div>
              </div>
            )}

            {(createShowAll || createStep===5) && (
              <div>
                <div className="label">* Culture Distinctive features (choose 2)</div>
                {(() => {
                  const c:any = draftHero.cultureId ? getCultureEntry(draftHero.cultureId) : null;
                  const opts: string[] = Array.isArray(c?.suggestedFeatures) ? c.suggestedFeatures : [];
                  if (!c || opts.length===0) return <div className="small muted">Select a Culture first.</div>;
                  const cur: string[] = Array.isArray(draftHero.cultureDistinctiveFeatureIds) ? draftHero.cultureDistinctiveFeatureIds : [];
                  return (
                    <div className="pillGrid">
                      {opts.map((fid)=>{
                        const selected = cur.includes(fid);
                        return (
                          <div key={fid} className={"pill " + (selected ? 'on' : '')} onClick={()=>{
                            setDraftHero((h:any)=>{
                              const prev: string[] = Array.isArray(h.cultureDistinctiveFeatureIds) ? h.cultureDistinctiveFeatureIds : [];
                              let next = prev;
                              if (prev.includes(fid)) next = prev.filter(x=>x!==fid);
                              else if (prev.length < 2) next = [...prev, fid];
                              else next = [...prev.slice(0,1), fid];
                              return { ...h, cultureDistinctiveFeatureIds: next };
                            });
                          }}>
                            {fid}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}

            {(createShowAll || createStep===6) && (
              <div>
                <div className="label">* Calling</div>
                <select className="input" value={draftHero.callingId ?? ''} onChange={(e)=>{
                  const id = e.target.value;
                  setDraftHero((h:any)=>({ ...h, callingId: id, callingFavouredSkillIds: [], callingDistinctiveFeatureId: undefined, shadowPathId: undefined }));
                }}>
                  <option value="">(choose)</option>
                  {sortByName(compendiums.callings.entries ?? []).map((c:any)=>(
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                {draftHero.callingId ? (
                  <div className="small muted" style={{marginTop:6}}>
                    Shadow Path will be set from the Calling.
                  </div>
                ) : null}
              </div>
            )}

            {(createShowAll || createStep===7) && (
              <div>
                <div className="label">* Calling Favoured skills (choose 2)</div>
                {(() => {
                  const c:any = draftHero.callingId ? findEntryById(compendiums.callings.entries ?? [], draftHero.callingId) : null;
                  const options: string[] = Array.isArray(c?.favouredSkills) ? c.favouredSkills : [];
                  if (!c || options.length===0) return <div className="small muted">Select a Calling first.</div>;
                  const cur: string[] = Array.isArray(draftHero.callingFavouredSkillIds) ? draftHero.callingFavouredSkillIds : [];
                  const toSkillId = (label: string) => {
                    const needle = String(label).toLowerCase();
                    const s:any = (compendiums.skills.entries ?? []).find((x:any)=>String(x.name??'').toLowerCase()===needle || String(x.id??'').toLowerCase()===needle);
                    return s?.id ?? needle;
                  };
                  return (
                    <div className="pillGrid">
                      {options.map((lab)=>{
                        const sid = toSkillId(lab);
                        const selected = cur.includes(sid);
                        return (
                          <div key={sid} className={"pill " + (selected ? 'on' : '')} onClick={()=>{
                            setDraftHero((h:any)=>{
                              const prev: string[] = Array.isArray(h.callingFavouredSkillIds) ? h.callingFavouredSkillIds : [];
                              let next = prev;
                              if (prev.includes(sid)) next = prev.filter(x=>x!==sid);
                              else if (prev.length < 2) next = [...prev, sid];
                              else next = [...prev.slice(0,1), sid];
                              return { ...h, callingFavouredSkillIds: next, skillFavoured: { ...(h.skillFavoured ?? {}), [sid]: true } };
                            });
                          }}>
                            {String(lab).toLowerCase().replace(/^\w/, (m)=>m.toUpperCase())}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}

            {(createShowAll || createStep===8) && (
              <div>
                <div className="label">* Previous experience</div>
                <div className="small muted">Budget: <b>{draftHero.striderMode ? 15 : 10}</b> points.</div>
                <div className="small muted" style={{marginBottom:8}}>
                  Culture/Calling bonuses are free and do not spend this budget.
                </div>
                <PreviousExperienceEditor hero={draftHero} setHero={setDraftHero} />
              </div>
            )}

            {(createShowAll || createStep===9) && (
              <div>
                <div className="label">Starting gear</div>
                <StartingGearEditor hero={draftHero} setHero={setDraftHero} />
              </div>
            )}

            {(createShowAll || createStep===10) && (
              <div>
                <div className="label">Useful items</div>
                <div className="small muted" style={{marginBottom:8}}>Choices depend on Standard of Living.</div>
                <UsefulItemsEditor hero={draftHero} updateHero={(patch:any)=>setDraftHero((h:any)=>({ ...h, ...patch }))} />
              </div>
            )}

            {(createShowAll || createStep===11) && (
              <div>
                <div className="label">Ponies and horses</div>
                <MountsEditor hero={draftHero} setHero={setDraftHero} />
              </div>
            )}

            {(createShowAll || createStep===12) && (
              <div>
                <div className="label">Starting reward and virtue</div>
                <StartingRewardVirtueEditor hero={draftHero} setHero={setDraftHero} onSeeMore={openEntry} />
              </div>
            )}

            {(createShowAll || createStep===13) && (
              <div>
                <div className="label">Gender</div>
                <select className="input" value={draftHero.gender ?? 'Other'} onChange={(e)=>setDraftHero((h:any)=>({ ...h, gender: e.target.value }))}>
                  <option value="Masculine">Masculine</option>
                  <option value="Feminine">Feminine</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            )}

            {(createShowAll || createStep===14) && (
              <div>
                <div className="label">Hero name</div>
                <input className="input" value={draftHero.name ?? ''} onChange={(e)=>setDraftHero((h:any)=>({ ...h, name: e.target.value }))} />
                <div className="row" style={{gap:8, marginTop:8}}>
                  <button className="btn" onClick={()=>{
                    const c:any = getCultureEntry(draftHero.cultureId);
                    const male: string[] = Array.isArray(c?.names?.male) ? c.names.male : [];
                    const female: string[] = Array.isArray(c?.names?.female) ? c.names.female : [];
                    const g = String(draftHero.gender ?? 'Other');
                    const pool = g==='Masculine' ? male : g==='Feminine' ? female : [...male,...female];
                    const pick = pool.length ? pool[Math.floor(Math.random()*pool.length)] : rollNameFallback(c?.name ?? c?.id);
                    setDraftHero((h:any)=>({ ...h, name: pick }));
                  }}>Random</button>
                </div>
              </div>
            )}

            <div className="row" style={{gap:8, marginTop:14, justifyContent:'space-between'}}>
              <button className="btn btn-ghost" onClick={()=>{ setCreateOpen(false); setDraftHero(null); }}>Close</button>
              <button className="btn" onClick={()=>{
                  const h:any = draftHero;
                  if (!h.name || !String(h.name).trim()) return alert('Enter a name.');

                  // Required creation fields (when using "show all")
                  if (!h.cultureId) return alert('Choose a Culture.');
                  if (!h.attributeRollChoice) return alert('Choose an Attribute array.');
                  if (!h.cultureFavouredSkillId) return alert('Choose the Culture favoured skill.');
                  if (!h.cultureCombatProf2 || !h.cultureCombatProf1) return alert('Choose the Culture combat proficiencies (+2 and +1).');
                  if ((Array.isArray(h.cultureDistinctiveFeatureIds) ? h.cultureDistinctiveFeatureIds.length : 0) < 2) return alert('Choose 2 Distinctive Features.');
                  if (!h.callingId) return alert('Choose a Calling.');
                  if ((Array.isArray(h.callingFavouredSkillIds) ? h.callingFavouredSkillIds.length : 0) < 2) return alert('Choose 2 Calling favoured skills.');

	                  // Ensure PE baselines exist and the PE budget is fully spent
	                  const pe = h.previousExperience ?? {};
	                  const hasBaselines = pe.baselineSkillRatings && pe.baselineCombatProficiencies;
	                  if (!hasBaselines) {
	                    h.previousExperience = {
	                      ...(pe ?? {}),
	                      baselineSkillRatings: { ...(h.skillRatings ?? {}) },
	                      baselineCombatProficiencies: { ...(h.combatProficiencies ?? {}) },
	                    };
	                  }
	                  const skillCost = (toLevel: number) => (toLevel<=1?1:toLevel===2?2:toLevel===3?3:toLevel===4?5:0);
	                  const profCost = (toLevel: number) => (toLevel<=1?2:toLevel===2?4:toLevel===3?6:0);
	                  const baselineSkills = (h.previousExperience?.baselineSkillRatings ?? {}) as Record<string, number>;
	                  const baselineProfs = (h.previousExperience?.baselineCombatProficiencies ?? {}) as Record<string, number>;
	                  let spent = 0;
	                  const curSkills = h.skillRatings ?? {};
	                  for (const sid of Object.keys(curSkills)) {
	                    const cur = Number(curSkills[sid] ?? 0);
	                    const base = Number(baselineSkills[sid] ?? 0);
	                    for (let lvl = base + 1; lvl <= cur; lvl++) spent += skillCost(lvl);
	                  }
	                  const curProfs = h.combatProficiencies ?? {};
	                  for (const key of ['axes','bows','spears','swords']) {
	                    const cur = Number(curProfs[key] ?? 0);
	                    const base = Number(baselineProfs[key] ?? 0);
	                    for (let lvl = base + 1; lvl <= cur; lvl++) spent += profCost(lvl);
	                  }
	                  const budget = h.striderMode ? 15 : 10;
	                  const remaining = budget - spent;
	                  if (remaining !== 0) return alert(`Spend all Previous Experience points before finishing (remaining: ${remaining}).`);

	                  // Virtue/Reward are required at creation.
	                  if (!Array.isArray(h.virtueIds) || !h.virtueIds[0]) return alert('Choose a Virtue.');
	                  if (!Array.isArray(h.rewardIds) || !h.rewardIds[0]) return alert('Choose a Reward.');
	                  const rewardIdReq = String((Array.isArray(h.rewardIds) ? h.rewardIds[0] : '') || '');
	                  const rewardAttached = (h as any).rewardAttached ?? {};
	                  if (rewardIdReq && !String(rewardAttached[rewardIdReq] ?? '')) {
	                    return alert('Attach your Reward to a starting item.');
	                  }

	                  // Virtue-specific required choices
	                  const vId = (Array.isArray(h.virtueIds) ? h.virtueIds[0] : '') || '';
	                  if (vId === 'mastery') {
	                    const picks: string[] = Array.isArray((h as any).masterySkillIds) ? (h as any).masterySkillIds : [];
	                    if (picks.length < 2 || !picks[0] || !picks[1] || picks[0]===picks[1]) return alert('Mastery: choose two different Skills.');
	                  }
	                  if (vId === 'prowess') {
	                    const a = String((h as any).prowessAttribute ?? '');
	                    if (!a) return alert('Prowess: choose an Attribute.');
	                  }

                  // Finalize features (cultural blessing + calling extra)
                  let featureIds: string[] = Array.isArray(h.featureIds) ? [...h.featureIds] : [];
                  const auto = autoFeatureIds(h);
                  for (const id of auto) if (!featureIds.includes(id)) featureIds.push(id);
                  // Distinctive Features choices become Features
                  const chosenFeatures: string[] = [
                    ...(Array.isArray(h.cultureDistinctiveFeatureIds) ? h.cultureDistinctiveFeatureIds : []),
                    ...(h.callingDistinctiveFeatureId ? [h.callingDistinctiveFeatureId] : []),
                  ];
                  for (const fid of chosenFeatures) if (fid && !featureIds.includes(fid)) featureIds.push(fid);
                  
                  // Build starting inventory from selected war gear (selected earlier in the wizard).
                  const gearInv: any[] = [];
                  const sg = h.startingGear ?? {};
                  const ov = h.startingGearOverrides ?? {};
                  const addGear = (refId?: string) => {
                    if (!refId) return;
                    if (gearInv.some((it:any)=>it?.ref?.id===refId)) return;
                    const entry:any = findEntryById(compendiums.equipment.entries ?? [], refId);
                    if (!entry) return;
                    const override = ov?.[refId] ?? undefined;
                    gearInv.push({ id: uid('it'), name: entry.name, qty: 1, ref: { pack:'tor2e-equipment', id: entry.id }, equipped: false, dropped: false, override });
                  };
                  const weaponByProf = sg.weaponByProf ?? {};
                  addGear(weaponByProf.axes);
                  addGear(weaponByProf.bows);
                  addGear(weaponByProf.spears);
                  addGear(weaponByProf.swords);
                  addGear(sg.armourId);
                  addGear(sg.helmId);
                  addGear(sg.shieldId);

	                  // Apply Virtue special effects that depend on player choices.
	                  const vIdFinal = (Array.isArray(h.virtueIds) ? h.virtueIds[0] : '') || '';
	                  let skillFavoured = { ...(h.skillFavoured ?? {}) };
	                  if (vIdFinal === 'mastery') {
	                    const picks: string[] = Array.isArray((h as any).masterySkillIds) ? (h as any).masterySkillIds : [];
	                    for (const sid of picks) if (sid) skillFavoured[sid] = true;
	                  }
	                  // Virtues with simple stat adjustments at creation.
	                  let hope = { ...(h.hope ?? {}) };
	                  let endurance = { ...(h.endurance ?? {}) };
	                  let parry = { ...(h.parry ?? {}) };
	                  if (vIdFinal === 'confidence') {
	                    const nextMax = Number(hope.max ?? 0) + 2;
	                    hope.max = nextMax;
	                    hope.current = Math.min(nextMax, Number(hope.current ?? nextMax) + 2);
	                  }
	                  if (vIdFinal === 'hardiness') {
	                    const nextMax = Number(endurance.max ?? 0) + 2;
	                    endurance.max = nextMax;
	                    endurance.current = Math.min(nextMax, Number(endurance.current ?? nextMax) + 2);
	                  }
	                  if (vIdFinal === 'nimbleness') {
	                    parry.base = Number(parry.base ?? 0) + 1;
	                  }
	                  const finalized = { ...h, featureIds, inventory: gearInv, skillFavoured, hope, endurance, parry, creationComplete: true };
                  const next: StoredState = { ...state, heroes: [finalized, ...heroes] };
                  setState(next);
                  saveState(next);
                  setExpandedId(finalized.id);
                  setActiveId(finalized.id);
                  persistUI(finalized.id, finalized.id, next);
                  setCreateOpen(false);
                  setDraftHero(null);
                }}>Create Hero</button>
            </div>
          </div>
        ) : null}
      </BottomSheet>

<BottomSheet open={sheetOpen} title={sheetTitle} onClose={()=>setSheetOpen(false)}>
        {(() => {
          const body: any = sheetBody;
          if (!body) return <p className="muted">No details.</p>;
          const renderDesc = (d:any) => (d ? <p style={{whiteSpace:'pre-wrap'}}>{unwrapText(d)}</p> : <p className="muted">No description yet.</p>);
          if (sheetPack === 'callings') {
            const fav: string[] = Array.isArray(body.favouredSkills) ? body.favouredSkills : [];
            const addFeat = body.additionalFeature ? String(body.additionalFeature) : '';
            const sp = body.shadowPath;
            return (
              <div>
                {renderDesc(body.description)}

                <div className="section">
                  <div className="sectionTitle">Favoured Skills</div>
                  {fav.length ? (
                    <ul>
                      {fav.map((sid:string)=>{
                        const s:any = findEntryById(compendiums.skills.entries ?? [], sid);
                        return <li key={sid}>{s?.name ?? sid}</li>;
                      })}
                    </ul>
                  ) : <div className="small muted">—</div>}
                </div>

                <div className="section">
                  <div className="sectionTitle">Additional Distinctive Feature</div>
                  {addFeat ? (
                    <div className="row" style={{justifyContent:'space-between', alignItems:'center'}}>
                      <div><b>{addFeat}</b></div>
                      {(() => {
                        const idMap: Record<string,string> = {
                          'leadership':'leadership',
                          'enemy-lore':'enemy-lore',
                          'folk-lore':'folk-lore',
                          'rhymes of lore':'rhymes-of-lore',
                          'burglary':'burglary',
                          'shadow-lore':'shadow-lore',
                        };
                        const k = addFeat.toLowerCase();
                        const fid = idMap[k];
                        return fid ? <button className="btn btn-ghost" onClick={()=>openEntry('features', fid)} aria-label="Info">i</button> : null;
                      })()}
                    </div>
                  ) : <div className="small muted">—</div>}
                </div>

                <div className="section">
                  <div className="sectionTitle">Shadow Path</div>
                  {sp?.name ? (
                    <div>
                      <div><b>{sp.name}</b></div>
                      {renderDesc(sp.description)}
                    </div>
                  ) : <div className="small muted">—</div>}
                </div>

                {body.flavor ? <p className="flavor">{body.flavor}</p> : null}
              </div>
            );
          }

          if (sheetPack === 'cultures') {
            const sol = body.standardOfLiving;
            const blessingIds = (() => {
              // so instead map by culture name directly.
              const cName = String(body.name ?? '').toLowerCase();
              const map: Record<string,string[]> = {
                'bardings': ['stout-hearted'],
                'beornings': ['skin-changer'],
                'hobbits': ['hobbit-sense','halflings'],
                'elves of lindon': ['elven-skill','the-long-defeat'],
                "dwarves of durin's folk": ['redoubtable','naugrim'],
                'rangers of the north': ['kings-of-men','allegiance-of-the-dunedain'],
                'men of bree': ['bree-blood'],
              };
              return map[cName] ?? [];
            })();
            return (
              <div>
                {renderDesc(body.description)}

                <div className="section">
                  <div className="sectionTitle">Cultural Blessing</div>
                  {blessingIds.length ? (
                    <div className="list">
                      {blessingIds.map((fid:string)=>{
                        const f:any = findEntryById(compendiums.features.entries ?? [], fid);
                        return (
                          <div key={fid} className="pillRow">
                            <div style={{flex:1}}>{f?.name ?? fid}</div>
                            <button className="btn btn-ghost" onClick={()=>openEntry('features', fid)} aria-label="Info">i</button>
                          </div>
                        );
                      })}
                    </div>
                  ) : <div className="small muted">—</div>}
                </div>

                {sol ? (
                  <div className="section">
                    <div className="sectionTitle">Standard of Living</div>
                    <div>{sol}</div>
                  </div>
                ) : null}

                {body.languages ? (
                  <div className="section">
                    <div className="sectionTitle">Languages</div>
                    <div style={{whiteSpace:'pre-wrap'}}>{String(body.languages)}</div>
                  </div>
                ) : null}

                {body.names ? (
                  <div className="section">
                    <div className="sectionTitle">Typical Names</div>
                    <div style={{whiteSpace:'pre-wrap'}}>{String(body.names)}</div>
                  </div>
                ) : null}
              </div>
            );
          }

          // Default for skills/features/virtues/rewards/equipment/custom
          return (
            <div>
              {renderDesc(body.description)}
              {body.flavor ? <p className="flavor">{body.flavor}</p> : null}
            </div>
          );
        })()}
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
                  if (!e) return <div className="muted" style={{fontSize: 12}}>i</div>;
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
  const limit = usefulItemLimitBySOL(hero.standardOfLiving);
  const [name, setName] = useState('');
  const [skillId, setSkillId] = useState('scan');
  const skillOptions = useMemo(() => sortByName(compendiums.skills.entries ?? []), []);

  function add() {
    if (items.length >= limit) return;
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
        <button className="btn" disabled={items.length>=limit} onClick={add}>Add</button>
      </div>

      <div className="small muted" style={{marginTop:6}}>
        Limit: <b>{items.length}</b> / {limit} based on Standard of Living.
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
          const k = profKey(w.combatProficiency ?? w.proficiency ?? w.category);
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
        <button className="btn btn-ghost" disabled={!pick} onClick={()=>{ if (!pick) return; onSeeMore(pick); }}>i</button>
      </div>
    </div>
  );
}

function GearEquippedEditor({ hero, updateHero, onSeeMore }: { hero: any; updateHero: (patch:any)=>void; onSeeMore: (pack: any, id: string)=>void }) {
  const eq = hero.equipped ?? {};
  const equipment = compendiums.equipment.entries ?? [];

  const weapons = useMemo(() => sortByName(equipment.filter((e:any)=>e.category === 'Weapon')), [equipment]);
	  const solOk = (e:any) => {
	    const req = String(e?.minSOL ?? '').trim();
	    if (!req) return true;
	    return solRank(hero.standardOfLiving) >= solRank(req);
	  };
	  const armours = useMemo(() => sortByName(equipment.filter((e:any)=>e.category === 'Armour').filter(solOk)), [equipment, hero.standardOfLiving]);
  const helms = useMemo(() => sortByName(equipment.filter((e:any)=>e.category === 'Headgear')), [equipment]);
	  const shields = useMemo(() => sortByName(equipment.filter((e:any)=>e.category === 'Shield').filter(solOk)), [equipment, hero.standardOfLiving]);

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
              <div><button className="btn btn-ghost" onClick={()=>onSeeMore('equipment', weapon.id)}>i</button></div>
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
              <div><button className="btn btn-ghost" onClick={()=>onSeeMore('equipment', shield.id)}>i</button></div>
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
              <div><button className="btn btn-ghost" onClick={()=>onSeeMore('equipment', armour.id)}>i</button></div>
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
              <div><button className="btn btn-ghost" onClick={()=>onSeeMore('equipment', helm.id)}>i</button></div>
            </div>
          ) : <div className="small muted" style={{marginTop:6}}>Pick a helm to see Protection/Load.</div>}
        </div>
      </div>
    </div>
  );
}


function clone(obj: any) {
  return JSON.parse(JSON.stringify(obj ?? {}));
}

// --- Creation wizard editors ---

function PreviousExperienceEditor({ hero, setHero }: { hero: any; setHero: (fn:any)=>void }) {
  const pe = hero.previousExperience ?? {};
  const budget = hero.striderMode ? 15 : 10;

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

  const baselineSkills = pe.baselineSkillRatings ?? {};
  const baselineProfs = pe.baselineCombatProficiencies ?? {};

  const skillMins = getCultureSkillMins(hero);
  const combatMins = getCultureCombatMins(hero);

  // Ensure a sane baseline exists (culture/calling freebies should be part of the baseline).
  useEffect(() => {
    const hasSkills = baselineSkills && Object.keys(baselineSkills).length > 0;
    const hasProfs = baselineProfs && Object.keys(baselineProfs).length > 0;
    if (hasSkills && hasProfs) return;
    setHero((h:any)=>({
      ...h,
      previousExperience: {
        ...(h.previousExperience ?? {}),
        baselineSkillRatings: { ...(h.skillRatings ?? {}) },
        baselineCombatProficiencies: { ...(h.combatProficiencies ?? {}) },
      },
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const computeSpent = () => {
    let spent = 0;
    const curSkills = hero.skillRatings ?? {};
    for (const sid of Object.keys(curSkills)) {
      const cur = Number(curSkills[sid] ?? 0);
      const base = Number(baselineSkills[sid] ?? 0);
      for (let lvl = base + 1; lvl <= cur; lvl++) spent += skillCost(lvl);
    }
    const curProfs = hero.combatProficiencies ?? {};
    for (const key of ['axes','bows','spears','swords']) {
      const cur = Number(curProfs[key] ?? 0);
      const base = Number(baselineProfs[key] ?? 0);
      for (let lvl = base + 1; lvl <= cur; lvl++) spent += profCost(lvl);
    }
    return spent;
  };

  const spent = computeSpent();
  const remaining = budget - spent;

  const resetPoints = () => {
    setHero((h:any)=>({
      ...h,
      skillRatings: { ...(h.previousExperience?.baselineSkillRatings ?? h.skillRatings ?? {}) },
      combatProficiencies: { ...(h.previousExperience?.baselineCombatProficiencies ?? h.combatProficiencies ?? {}) },
    }));
  };

  const skills = sortByName(compendiums.skills.entries ?? []);
  const profRows = [
    { key: 'axes', label: 'Axes' },
    { key: 'bows', label: 'Bows' },
    { key: 'spears', label: 'Spears' },
    { key: 'swords', label: 'Swords' },
  ];

  return (
    <div>
      <div className="row" style={{gap:10, alignItems:'center', flexWrap:'wrap'}}>
        <div className="small"><b>Remaining</b> {remaining} / {budget}</div>
        <button className="btn btn-ghost" onClick={resetPoints}>Reset points</button>
        <span className="small muted">You can't increase a rating if it would exceed the budget.</span>
      </div>

      <div className="miniCard" style={{marginTop:10}}>
        <div className="miniTitle">Skills (cap 4)</div>
        <div className="grid2" style={{marginTop:8}}>
          {skills.map((s:any)=>{
            const cur = Number((hero.skillRatings ?? {})[s.id] ?? 0);
            const base = Number(baselineSkills[s.id] ?? 0);
            const min = Math.max(Number(skillMins[s.id] ?? 0), base);
            const maxAllowed = 4;
            const nextLevel = Math.min(maxAllowed, cur + 1);
            const incCost = (nextLevel > base) ? skillCost(nextLevel) : 0;
            const canInc = incCost <= remaining;
            return (
              <div key={s.id} className="skillRow">
                <div className="skillName">{s.name}</div>
                <div className="row" style={{gap:6}}>
                  <button className="btn btn-ghost" onClick={()=>{
                    setHero((h:any)=>{
                      const next = { ...h, skillRatings: { ...(h.skillRatings ?? {}), [s.id]: Math.max(min, cur-1) } };
                      return next;
                    });
                  }}>-</button>
                  <div className="skillNum" style={{minWidth:24, textAlign:'center'}}>{cur}</div>
                  <button className="btn btn-ghost" disabled={!canInc || cur>=maxAllowed} onClick={()=>{
                    setHero((h:any)=>{
                      const next = { ...h, skillRatings: { ...(h.skillRatings ?? {}), [s.id]: Math.min(maxAllowed, cur+1) } };
                      return next;
                    });
                  }}>+</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="miniCard" style={{marginTop:10}}>
        <div className="miniTitle">Combat Proficiencies (cap 3)</div>
        <div className="grid2" style={{marginTop:8}}>
          {profRows.map((r:any)=>{
            const cur = Number((hero.combatProficiencies ?? {})[r.key] ?? 0);
            const base = Number(baselineProfs[r.key] ?? 0);
            const min = Math.max(Number((combatMins as any)[r.key] ?? 0), base);
            const maxAllowed = 3;
            const nextLevel = Math.min(maxAllowed, cur + 1);
            const incCost = (nextLevel > base) ? profCost(nextLevel) : 0;
            const canInc = incCost <= remaining;
            return (
              <div key={r.key} className="skillRow">
                <div className="skillName">{r.label}</div>
                <div className="row" style={{gap:6}}>
                  <button className="btn btn-ghost" onClick={()=>{
                    setHero((h:any)=>({ ...h, combatProficiencies: { ...(h.combatProficiencies ?? {}), [r.key]: Math.max(min, cur-1) } }));
                  }}>-</button>
                  <div className="skillNum" style={{minWidth:24, textAlign:'center'}}>{cur}</div>
                  <button className="btn btn-ghost" disabled={!canInc || cur>=maxAllowed} onClick={()=>{
                    setHero((h:any)=>({ ...h, combatProficiencies: { ...(h.combatProficiencies ?? {}), [r.key]: Math.min(maxAllowed, cur+1) } }));
                  }}>+</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StartingGearEditor({ hero, setHero }: { hero: any; setHero: (fn:any)=>void }) {
  const equipment = compendiums.equipment.entries ?? [];
  const weapons = equipment.filter((e:any)=>e.category==='Weapon');
  const solOk = (e:any) => {
    const req = String(e?.minSOL ?? '').trim();
    if (!req) return true;
    return solRank(hero.standardOfLiving) >= solRank(req);
  };
  const armours = equipment.filter((e:any)=>e.category==='Armour').filter(solOk);
  const helms = equipment.filter((e:any)=>e.category==='Headgear');
  const shields = equipment.filter((e:any)=>e.category==='Shield').filter(solOk);

  const profs = hero.combatProficiencies ?? {};
  const profKeys: Array<{key:'axes'|'bows'|'spears'|'swords'; label:string}> = [
    { key:'axes', label:'Axes' },
    { key:'bows', label:'Bows' },
    { key:'spears', label:'Spears' },
    { key:'swords', label:'Swords' },
  ];

  const sg = hero.startingGear ?? {};
  const weaponByProf = sg.weaponByProf ?? {};
  const armourId = sg.armourId ?? '';
  const helmId = sg.helmId ?? '';
  const shieldId = sg.shieldId ?? '';

  const setSG = (patch:any) => setHero((h:any)=>({ ...h, startingGear: { ...(h.startingGear ?? {}), ...patch } }));

  return (
    <div>
      <div className="small muted">
        Pick your starting war gear here. Items are added to your inventory only when you click <b>Finish</b>.
      </div>

      {profKeys.filter(p=>Number(profs[p.key] ?? 0) > 0).map((p:any)=>{
        const opts = sortByName(weapons.filter((w:any)=>String(w.proficiency ?? '').toLowerCase().includes(p.label.toLowerCase())));
        const cur = String(weaponByProf[p.key] ?? '');
        return (
          <div key={p.key} className="field" style={{marginTop:10}}>
            <div className="label">{p.label} weapon</div>
            <select className="input" value={cur} onChange={(e)=>{
              const id = e.target.value;
              setSG({ weaponByProf: { ...weaponByProf, [p.key]: id || undefined } });
            }}>
              <option value="">(choose)</option>
              {opts.map((w:any)=> <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
        );
      })}

      <div className="grid2" style={{marginTop:12}}>
        <div className="miniCard">
          <div className="miniTitle">Armour</div>
          <select className="input" value={armourId} onChange={(e)=>setSG({ armourId: e.target.value || undefined })}>
            <option value="">(none)</option>
            {sortByName(armours).map((e:any)=> <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>

        <div className="miniCard">
          <div className="miniTitle">Helm</div>
          <select className="input" value={helmId} onChange={(e)=>setSG({ helmId: e.target.value || undefined })}>
            <option value="">(none)</option>
            {sortByName(helms).map((e:any)=> <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
      </div>

      <div className="miniCard" style={{marginTop:12}}>
        <div className="miniTitle">Shield</div>
        <select className="input" value={shieldId} onChange={(e)=>setSG({ shieldId: e.target.value || undefined })}>
          <option value="">(none)</option>
          {sortByName(shields).map((e:any)=> <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </div>
    </div>
  );
}

function MountsEditor({ hero, setHero }: { hero: any; setHero: (fn:any)=>void }) {
  const sol = hero.standardOfLiving ?? 'Common';
  const options: Array<{label:string; vigour:number; minSol:string}> = [
    { label: '(none)', vigour: 0, minSol: 'Poor' },
    { label: 'Old horse or half-starved pony', vigour: 1, minSol: 'Common' },
    { label: 'Decent beast', vigour: 2, minSol: 'Prosperous' },
    { label: 'Fine beast', vigour: 3, minSol: 'Rich' },
  ];
  const order = ['Poor','Frugal','Common','Prosperous','Rich','Very Rich'];
  const solIdx = order.indexOf(sol);
  const allowed = options.filter(o => order.indexOf(o.minSol) <= solIdx);
  const cur = hero.mount?.label ?? allowed[0].label;

  return (
    <div>
      <div className="small muted">Choose your mount for tracking (allowed by Standard of Living).</div>
      <div className="row" style={{gap:8, flexWrap:'wrap', marginTop:10}}>
        <select className="input" value={cur} onChange={(e)=>{
          const picked = allowed.find(a=>a.label===e.target.value) ?? allowed[0];
          setHero((h:any)=> picked.vigour === 0 ? { ...h, mount: undefined } : { ...h, mount: { label: picked.label, vigour: picked.vigour } });
        }}>
          {allowed.map(o=> <option key={o.label} value={o.label}>{o.label} (Vigour {o.vigour})</option>)}
        </select>
        <span className="small muted">Standard of Living: {sol}</span>
      </div>
    </div>
  );
}

function StartingRewardVirtueEditor({ hero, setHero, onSeeMore }: { hero:any; setHero:(fn:any)=>void; onSeeMore:(pack:any,id:string)=>void }) {
  const virtues = sortByName((compendiums.virtues.entries ?? []).filter((v:any)=>!v.virtueType));
  const rewards = sortByName(compendiums.rewards.entries ?? []);
  const curVirtueIds: string[] = Array.isArray(hero.virtueIds) ? hero.virtueIds : [];
  const curRewardIds: string[] = Array.isArray(hero.rewardIds) ? hero.rewardIds : [];
  const selectedVirtue = curVirtueIds[0] ?? '';
  const selectedReward = curRewardIds[0] ?? '';

  // Build a virtual list of items from starting gear selections (inventory is only created on Finish).
  const sg = hero.startingGear ?? {};
  const weaponByProf = sg.weaponByProf ?? {};
  const virtualRefIds: string[] = [
    weaponByProf.axes,
    weaponByProf.bows,
    weaponByProf.spears,
    weaponByProf.swords,
    sg.armourId,
    sg.helmId,
    sg.shieldId,
  ].filter(Boolean);

  const equipable = virtualRefIds.map((refId:string)=> {
    const e:any = findEntryById(compendiums.equipment.entries ?? [], refId);
    return { refId, name: e?.name ?? refId };
  });

  const attached: any = hero.rewardAttached ?? {};
  const attachedRefId = selectedReward ? (attached[selectedReward] ?? '') : '';

  const rewardToOverride = (rewardId: string) => {
    switch (rewardId) {
      case 'improved-armour': return { protectionDelta: 1, notesAppend: 'Improved Armour (+1 PRO)' };
      case 'close-fitting': return { loadDelta: -1, notesAppend: 'Close-fitting (-1 Load)' };
      case 'cunning-make': return { loadDelta: -2, notesAppend: 'Cunning Make (-2 Load)' };
      case 'accurate-weapon': return { piercingThreshold: 10, notesAppend: 'Accurate (PB 10+)' };
      case 'fell-weapon': return { damageDelta: 1, notesAppend: 'Fell (+1 DMG)' };
      case 'keen-weapon': return { piercingThreshold: 9, notesAppend: 'Keen (PB 9+)' };
      case 'grievous-weapon': return { injuryOverride: '16', notesAppend: 'Grievous (INJ 16)' };
      case 'reinforced-shield': return { parryModifierDelta: 1, notesAppend: 'Reinforced (+1 Parry)' };
      default: return {};
    }
  };

  const attachToRef = (rewardId: string, refId: string) => {
    setHero((h:any)=>{
      const ra = { ...(h.rewardAttached ?? {}), [rewardId]: refId };
      const ov = { ...(h.startingGearOverrides ?? {}), [refId]: rewardToOverride(rewardId) };
      return { ...h, rewardAttached: ra, startingGearOverrides: ov };
    });
  };

  return (
    <div>
      <div className="field">
        <div className="label">Virtue (choose 1)</div>
	        <div className="row" style={{gap:8, alignItems:'center'}}>
	          <select className="input" value={selectedVirtue} onChange={(e)=>setHero((h:any)=>({ ...h, virtueIds: e.target.value ? [e.target.value] : [], masterySkillIds: [], prowessAttribute: '' }))}>
	            <option value="">(choose)</option>
	            {virtues.map((v:any)=><option key={v.id} value={v.id}>{v.name}</option>)}
	          </select>
	          {selectedVirtue ? <button className="btn btn-ghost" onClick={()=>onSeeMore('virtues', selectedVirtue)}>i</button> : null}
	        </div>
      </div>

	      {selectedVirtue === 'mastery' ? (
	        <div className="field" style={{marginTop:10}}>
	          <div className="label">Mastery (choose 2 non-favoured Skills)</div>
	          {(() => {
	            const cur: string[] = Array.isArray(hero.masterySkillIds) ? hero.masterySkillIds : [];
	            const a = cur[0] ?? '';
	            const b = cur[1] ?? '';
	            const fav = computeDerived(hero, hero.striderMode ? 18 : 20).favouredSkillSet;
	            const options = sortByName((compendiums.skills.entries ?? []).filter((s:any)=>!fav.has(String(s.id))));
	            const setPick = (idx: number, sid: string) => {
	              setHero((h:any)=>{
	                const next: string[] = Array.isArray(h.masterySkillIds) ? [...h.masterySkillIds] : [];
	                while (next.length < 2) next.push('');
	                next[idx] = sid;
	                // prevent duplicates
	                if (next[0] && next[1] && next[0] === next[1]) {
	                  next[1-idx] = '';
	                }
	                return { ...h, masterySkillIds: next };
	              });
	            };
	            return (
	              <div className="grid2" style={{marginTop:8}}>
	                <select className="input" value={a} onChange={(e)=>setPick(0, e.target.value)}>
	                  <option value="">(choose)</option>
	                  {options.map((s:any)=><option key={s.id} value={s.id}>{s.name}</option>)}
	                </select>
	                <select className="input" value={b} onChange={(e)=>setPick(1, e.target.value)}>
	                  <option value="">(choose)</option>
	                  {options.filter((s:any)=>String(s.id)!==String(a)).map((s:any)=><option key={s.id} value={s.id}>{s.name}</option>)}
	                </select>
	              </div>
	            );
	          })()}
	          <div className="small muted" style={{marginTop:6}}>These will become Favoured when you click <b>Create Hero</b>.</div>
	        </div>
	      ) : null}

	      {selectedVirtue === 'prowess' ? (
	        <div className="field" style={{marginTop:10}}>
	          <div className="label">Prowess (choose 1 Attribute)</div>
	          <select className="input" value={hero.prowessAttribute ?? ''} onChange={(e)=>setHero((h:any)=>({ ...h, prowessAttribute: e.target.value }))}>
	            <option value="">(choose)</option>
	            <option value="Strength">Strength</option>
	            <option value="Heart">Heart</option>
	            <option value="Wits">Wits</option>
	          </select>
	          <div className="small muted" style={{marginTop:6}}>The chosen Attribute TN will be reduced by 1.</div>
	        </div>
	      ) : null}

      <div className="field" style={{marginTop:10}}>
        <div className="label">Reward (choose 1)</div>
	        <div className="row" style={{gap:8, alignItems:'center'}}>
	          <select className="input" value={selectedReward} onChange={(e)=>setHero((h:any)=>({ ...h, rewardIds: e.target.value ? [e.target.value] : [], rewardAttached: {}, startingGearOverrides: {} }))}>
	            <option value="">(choose)</option>
	            {rewards.map((r:any)=><option key={r.id} value={r.id}>{r.name}</option>)}
	          </select>
	          {selectedReward ? <button className="btn btn-ghost" onClick={()=>onSeeMore('rewards', selectedReward)}>i</button> : null}
	        </div>
      </div>

      {selectedReward ? (
        <div className="field" style={{marginTop:10}}>
          <div className="label">Attach Reward to an item (permanent)</div>
          <select className="input" value={attachedRefId} onChange={(e)=>{
            const refId = e.target.value;
            if (!refId) return;
            attachToRef(selectedReward, refId);
          }}>
            <option value="">(choose an item)</option>
            {equipable.map((it:any)=>(
              <option key={it.refId} value={it.refId}>{it.name}</option>
            ))}
          </select>
          {equipable.length===0 ? <div className="small muted" style={{marginTop:6}}>Choose starting gear first (previous step) to have items to attach your Reward to.</div> : <div className="small muted" style={{marginTop:6}}>This will be applied when you click <b>Finish</b>.</div>}
        </div>
      ) : null}
    </div>
  );
}
