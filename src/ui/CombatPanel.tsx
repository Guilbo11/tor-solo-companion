import React, { useMemo, useState } from 'react';
import { compendiums } from '../core/compendiums';
import { computeDerived } from '../core/tor2e';
import { rollTOR, rollTORAdversary } from '../core/dice';
import { combatReducer } from '../combat/reducer';
import { CombatEnemy, CombatOptions, CombatState, Stance } from '../combat/types';

const stanceLabel: Record<Stance, string> = {
  forward: 'Forward',
  open: 'Open',
  defensive: 'Defensive',
  rearward: 'Rearward',
  skirmish: 'Skirmish',
};

function uid(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function inferSize(e: any): 'human' | 'large' {
  const n = String(e?.name ?? '').toLowerCase();
  const id = String(e?.id ?? '').toLowerCase();
  if (n.includes('troll') || id.includes('troll')) return 'large';
  if (n.includes('great spider') || id.includes('great-spider')) return 'large';
  return 'human';
}

function toCombatEnemy(e: any): CombatEnemy {
  const end = Number(e?.endurance ?? 0) || 0;
  return {
    id: String(e?.id ?? uid('enemy')),
    name: String(e?.name ?? 'Enemy'),
    size: inferSize(e),
    endurance: { max: end, current: end },
    might: Number(e?.might ?? 1) || 1,
    attributeLevel: Number(e?.attributeLevel ?? 0) || 0,
    parry: typeof e?.parry === 'number' ? e.parry : Number(e?.parry ?? 0) || 0,
    hateOrResolve: e?.hateOrResolve?.type ? { type: e.hateOrResolve.type, value: Number(e.hateOrResolve.value ?? 0) || 0 } : undefined,
    combatProficiencies: Array.isArray(e?.combatProficiencies)
      ? e.combatProficiencies.map((p: any) => ({
          name: String(p?.name ?? 'Weapon'),
          rating: Number(p?.rating ?? 0) || 0,
          damage: Number(p?.damage ?? 0) || 0,
          injury: Number(p?.injury ?? 0) || 0,
          specialDamage: Array.isArray(p?.specialDamage) ? p.specialDamage.map(String) : [],
        }))
      : [],
    distinctiveFeatures: Array.isArray(e?.distinctiveFeatures) ? e.distinctiveFeatures.map(String) : [],
  };
}

const SPECIALS = ['None', 'PIERCE', 'HEAVY BLOW', 'BREAK SHIELD', 'SEIZE'] as const;
type SpecialPick = (typeof SPECIALS)[number];

export default function CombatPanel({ state, setState }: { state: any; setState: (u: any) => void }) {
  const campId = state.activeCampaignId ?? 'camp-1';
  const heroes = Array.isArray(state.heroes) ? state.heroes.filter((h: any) => String(h.campaignId ?? campId) === String(campId)) : [];
  const combat: CombatState | null = (state.combatByCampaign?.[campId] ?? null) as any;

  const [heroId, setHeroId] = useState<string>(() => String(heroes[0]?.id ?? ''));
  const [enemySearch, setEnemySearch] = useState('');
  const [enemyIds, setEnemyIds] = useState<string[]>([]);
  const [striderMode, setStriderMode] = useState(false);
  const [enemyAutomation, setEnemyAutomation] = useState<CombatOptions['enemyAutomation']>('manualWithSuggestions');

  const enemiesAll = useMemo(() => {
    const list = (compendiums as any).adversariesCore?.entries ?? [];
    const q = enemySearch.trim().toLowerCase();
    const filtered = q ? list.filter((e: any) => String(e?.name ?? '').toLowerCase().includes(q)) : list;
    return filtered.slice().sort((a: any, b: any) => String(a?.name ?? '').localeCompare(String(b?.name ?? '')));
  }, [enemySearch]);

  const activeHero = useMemo(() => {
    const h = heroes.find((x: any) => String(x.id) === String(combat?.heroId ?? heroId));
    return h ?? null;
  }, [heroes, combat?.heroId, heroId]);

  const derived = useMemo(() => (activeHero ? computeDerived(activeHero, (combat?.options?.striderMode ? 18 : 20)) : null), [activeHero, combat?.options?.striderMode]);
  const heroParryTN = Number(derived?.parry?.total ?? 0) || 0;

  const setCombat = (nextCombat: CombatState | null) => {
    setState((prev: any) => {
      const by = { ...(prev.combatByCampaign ?? {}) };
      by[campId] = nextCombat;
      return { ...prev, combatByCampaign: by };
    });
  };

  const dispatch = (ev: any) => {
    setCombat(combatReducer(combat ?? null, ev as any));
  };

  // --- Enemy attack modal (re-uses the "From Enemy" logic but scoped to combat) ---
  const [enemyAttackOpen, setEnemyAttackOpen] = useState(false);
  const [enemyAttackEnemyId, setEnemyAttackEnemyId] = useState('');
  const [enemyAttackWeaponName, setEnemyAttackWeaponName] = useState('');
  const [enemyWeary, setEnemyWeary] = useState(false);
  const [enemyFeatMode, setEnemyFeatMode] = useState<'normal' | 'favoured' | 'illFavoured'>('normal');
  const [enemySpend, setEnemySpend] = useState(0);

  const [specialPickerOpen, setSpecialPickerOpen] = useState(false);
  const [specialChoices, setSpecialChoices] = useState<SpecialPick[]>([]);
  const pendingRef = React.useRef<any>(null);

  const beginEnemyAttack = () => {
    if (!combat) return;
    setEnemyAttackEnemyId(combat.enemies[0]?.id ?? '');
    setEnemyAttackWeaponName('');
    setEnemyFeatMode('normal');
    setEnemyWeary(false);
    setEnemySpend(0);
    setEnemyAttackOpen(true);
  };

  const startEnemyAttackRoll = () => {
    if (!combat || !activeHero || !derived) return;
    const enemy = combat.enemies.find(e => e.id === enemyAttackEnemyId);
    const weapon = enemy?.combatProficiencies?.find(w => w.name === enemyAttackWeaponName);
    if (!enemy || !weapon) return;

    const dice = Number(weapon.rating ?? 0) + Number(enemySpend ?? 0);
    const tn = heroParryTN;
    const r = rollTORAdversary({ dice, featMode: enemyFeatMode, weary: enemyWeary, tn });
    pendingRef.current = { enemy, weapon, roll: r, tn };

    if ((r.icons ?? 0) > 0) {
      setSpecialChoices(Array.from({ length: r.icons }, () => 'None'));
      setEnemyAttackOpen(false);
      setSpecialPickerOpen(true);
    } else {
      finalizeEnemyAttack([]);
    }
  };

  const finalizeEnemyAttack = (specials: SpecialPick[]) => {
    if (!combat || !activeHero || !derived) return;
    const ctx = pendingRef.current;
    if (!ctx) return;
    const enemy: CombatEnemy = ctx.enemy;
    const w = ctx.weapon;
    const r = ctx.roll;
    const tn = ctx.tn;

    const picks = (specials ?? []).filter(s => s && s !== 'None');
    const pierceCount = picks.filter(p => p === 'PIERCE').length;
    const heavyCount = picks.filter(p => p === 'HEAVY BLOW').length;

    // Recompute total if PIERCE was selected (adds +2 per pick to Feat number; Eye already best for adversary).
    let featNumber = (r.feat.type === 'Number') ? r.feat.value : (r.feat.type === 'Eye' ? 10 : 0);
    if (pierceCount) featNumber = Math.min(10, featNumber + (2 * pierceCount));
    const succSum = r.success.reduce((a: number, d: any) => a + ((enemyWeary && (d.value === 1 || d.value === 2 || d.value === 3)) ? 0 : d.value), 0);
    const total = featNumber + succSum;
    const passed = (r.feat.type === 'Eye') ? true : total >= tn;

    const baseDmg = Number(w.damage ?? 0) || 0;
    const dmg = passed ? (baseDmg + (heavyCount ? (heavyCount * Number(enemy.attributeLevel ?? 0)) : 0)) : 0;

    // Apply Endurance damage (simplified but faithful: hit -> lose Endurance).
    if (passed && dmg > 0) {
      setState((prev: any) => {
        const nextHeroes = (prev.heroes ?? []).map((h: any) => {
          if (String(h.id) !== String(activeHero.id)) return h;
          const cur = Number(h?.endurance?.current ?? 0) || 0;
          const max = Number(h?.endurance?.max ?? h?.endurance?.maximum ?? 0) || 0;
          const nextCur = Math.max(0, cur - dmg);
          return { ...h, endurance: { ...(h.endurance ?? {}), current: nextCur, max } };
        });
        return { ...prev, heroes: nextHeroes };
      });
    }

    // Log
    const deg = passed ? (r.icons === 0 ? 'Success' : r.icons === 1 ? 'Great Success' : 'Extraordinary Success') : 'FAIL';
    const txt = passed
      ? `${enemy.name} hits (${deg}) for ${dmg} Endurance.`
      : `${enemy.name} misses.`;
    setCombat(combatReducer(combat, { type: 'LOG', text: txt, data: { enemyId: enemy.id, weapon: w.name, total, tn, specials: picks } } as any));

    pendingRef.current = null;
    setSpecialPickerOpen(false);
  };

  const startCombat = () => {
    const pickedHeroId = heroId || String(heroes[0]?.id ?? '');
    const selected = ((compendiums as any).adversariesCore?.entries ?? []).filter((e: any) => enemyIds.includes(String(e.id)));
    const enemies = selected.map(toCombatEnemy);
    const options: CombatOptions = { striderMode, enemyAutomation };
    setCombat(combatReducer(null, { type: 'START_COMBAT', campaignId: campId, heroId: pickedHeroId, enemies, options } as any));
  };

  const endCombat = () => {
    if (!combat) return;
    setCombat(null);
  };

  const toggleEnemy = (id: string) => {
    setEnemyIds((prev) => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  if (!combat) {
    return (
      <div style={{ padding: 14 }}>
        <div className="h2">Combat</div>
        <div className="small muted" style={{ marginTop: 4 }}>
          This is a first stable combat loop scaffold: stance → engagement → actions. Enemy attacks are supported ("From Enemy"-style).
        </div>

        <div className="card" style={{ marginTop: 12 }}>
          <div className="label">Hero</div>
          <select className="input" value={heroId} onChange={(e) => setHeroId(e.target.value)}>
            <option value="">Choose…</option>
            {heroes.map((h: any) => <option key={h.id} value={h.id}>{h.name || 'Unnamed'}</option>)}
          </select>

          <div className="row" style={{ gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
            <label className={"toggle " + (striderMode ? 'on' : '')} style={{ display: 'inline-flex' }}>
              <input type="checkbox" checked={striderMode} onChange={(e) => setStriderMode(e.target.checked)} /> Strider Mode
            </label>
            <div className="col" style={{ minWidth: 220 }}>
              <div className="label">Enemy automation</div>
              <select className="input" value={enemyAutomation} onChange={(e) => setEnemyAutomation(e.target.value as any)}>
                <option value="manual">Manual</option>
                <option value="manualWithSuggestions">Manual + suggestions</option>
                <option value="auto">Auto</option>
              </select>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginTop: 12 }}>
          <div className="label">Adversaries</div>
          <input className="input" placeholder="Search adversary…" value={enemySearch} onChange={(e) => setEnemySearch(e.target.value)} />

          <div style={{ marginTop: 10, maxHeight: 340, overflow: 'auto' }}>
            {enemiesAll.map((e: any) => {
              const id = String(e.id);
              const on = enemyIds.includes(id);
              return (
                <label key={id} className="row" style={{ gap: 10, padding: '8px 0', borderBottom: '1px solid #2a2f3a', cursor: 'pointer' }}>
                  <input type="checkbox" checked={on} onChange={() => toggleEnemy(id)} />
                  <div>
                    <div><b>{e.name}</b></div>
                    <div className="small muted">AL {e.attributeLevel} • End {e.endurance} • Might {e.might}</div>
                  </div>
                </label>
              );
            })}
          </div>

          <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
            <button className="btn" disabled={!heroId || enemyIds.length === 0} onClick={startCombat}>Start combat</button>
          </div>
        </div>
      </div>
    );
  }

  const heroStances: Stance[] = combat.options.striderMode
    ? ['forward', 'open', 'defensive', 'rearward', 'skirmish']
    : ['forward', 'open', 'defensive', 'rearward'];

  const engagedEnemyIds = combat.engagement.heroToEnemies?.[combat.heroId] ?? [];
  const engagedEnemies = combat.enemies.filter(e => engagedEnemyIds.includes(e.id));

  const canFreeEscape = combat.hero.stance === 'rearward';
  const canRollEscape = combat.hero.stance === 'defensive' && engagedEnemies.length > 0 && (derived?.equippedWeapons?.length ?? 0) > 0;

  const doFreeEscape = () => {
    dispatch({ type: 'ATTEMPT_ESCAPE', mode: 'FREE' });
  };

  const doRollEscape = () => {
    if (!activeHero || !derived) return;
    const weapon: any = derived.equippedWeapons?.[0];
    const prof = String(weapon?.proficiency ?? '').toLowerCase();
    const rating = (() => {
      const cp = derived?.combatProficiencies ?? {};
      if (prof.startsWith('axe')) return cp.axes ?? 0;
      if (prof.startsWith('bow')) return cp.bows ?? 0;
      if (prof.startsWith('spear')) return cp.spears ?? 0;
      if (prof.startsWith('sword')) return cp.swords ?? 0;
      return 0;
    })();
    const target = engagedEnemies[0];
    const tn = Number(target.parry ?? 0) || 0;
    const r = rollTOR({ dice: rating, tn, weary: !!activeHero?.conditions?.weary });
    dispatch({ type: 'ATTEMPT_ESCAPE', mode: 'ROLL', rollPassed: !!r.passed });
    dispatch({ type: 'LOG', text: `Escape roll (${weapon?.name ?? 'weapon'}): ${r.passed ? 'PASS' : 'FAIL'} (TN ${tn}).` });
    // Also log to journal if enabled
    (window as any).__torcLogRollHtml?.(`Escape - ${r.passed ? 'PASS' : 'FAIL'}. TN ${tn}.`);
  };

  return (
    <div style={{ padding: 14 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div className="h2">Combat</div>
          <div className="small muted">Round {combat.round} • Hero: <b>{activeHero?.name ?? combat.heroId}</b></div>
        </div>
        <button className="btn btn-danger" onClick={endCombat}>End</button>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="label">1) Choose stance</div>
        <select className="input" value={combat.hero.stance} onChange={(e) => dispatch({ type: 'SET_HERO_STANCE', stance: e.target.value })}>
          {heroStances.map(s => <option key={s} value={s}>{stanceLabel[s]}</option>)}
        </select>

        <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
          <button className="btn" onClick={() => dispatch({ type: 'AUTO_ENGAGE' })}>2) Engagement</button>
          <button className="btn" onClick={() => dispatch({ type: 'ROUND_BEGIN' })}>Next round</button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="label">Engaged with</div>
        {engagedEnemies.length ? (
          <div className="list" style={{ marginTop: 8 }}>
            {engagedEnemies.map(e => (
              <div key={e.id} className="row" style={{ justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #2a2f3a' }}>
                <div>
                  <b>{e.name}</b>
                  <div className="small muted">Parry {e.parry ?? '—'} • End {e.endurance.current}/{e.endurance.max}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="small muted" style={{ marginTop: 8 }}>No one (unengaged).</div>
        )}
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="label">Enemy actions</div>
        <div className="small muted" style={{ marginTop: 6 }}>Hero Parry TN: <b>{heroParryTN}</b></div>
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
          <button className="btn" onClick={beginEnemyAttack}>From Enemy</button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="label">Escape</div>
        <div className="small muted" style={{ marginTop: 6 }}>
          Rearward: escape on your turn, no roll. Defensive: make an attack; success lets you leave.
        </div>
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
          <button className="btn" disabled={!canFreeEscape} onClick={doFreeEscape}>Escape (Rearward)</button>
          <button className="btn" disabled={!canRollEscape} onClick={doRollEscape}>Escape (Defensive roll)</button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="label">Log</div>
        <div style={{ marginTop: 8, maxHeight: 260, overflow: 'auto' }}>
          {(combat.log ?? []).slice().reverse().map((l) => (
            <div key={l.id} className="small" style={{ padding: '6px 0', borderBottom: '1px solid #2a2f3a' }}>
              {l.text}
            </div>
          ))}
        </div>
      </div>

      {/* Enemy attack modal */}
      {enemyAttackOpen ? (
        <div className="modalOverlay" onMouseDown={() => setEnemyAttackOpen(false)}>
          <div className="modal" style={{ maxWidth: 520 }} onMouseDown={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <div><b>From Enemy</b></div>
              <button className="btn btn-ghost" onClick={() => setEnemyAttackOpen(false)}>Close</button>
            </div>

            <div className="label" style={{ marginTop: 10 }}>Enemy</div>
            <select className="input" value={enemyAttackEnemyId} onChange={(e) => { setEnemyAttackEnemyId(e.target.value); setEnemyAttackWeaponName(''); }}>
              {combat.enemies.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>

            {(() => {
              const enemy = combat.enemies.find(e => e.id === enemyAttackEnemyId);
              const weapons = enemy?.combatProficiencies ?? [];
              const maxSpend = Number(enemy?.might ?? 1);
              const resLabel = enemy?.hateOrResolve?.type === 'Resolve' ? 'Resolve' : 'Hate';
              return (
                <>
                  <div className="label" style={{ marginTop: 10 }}>Weapon</div>
                  <select className="input" value={enemyAttackWeaponName} onChange={(e) => setEnemyAttackWeaponName(e.target.value)}>
                    <option value="">Choose…</option>
                    {weapons.map((w: any) => (
                      <option key={w.name} value={w.name}>{w.name} — {w.rating} ({w.damage}/{w.injury}{w.specialDamage?.length ? `, ${w.specialDamage.join(', ')}` : ''})</option>
                    ))}
                  </select>

                  <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
                    <div className="col" style={{ minWidth: 220 }}>
                      <div className="label">Feat die mode</div>
                      <select className="input" value={enemyFeatMode} onChange={(e) => setEnemyFeatMode(e.target.value as any)}>
                        <option value="normal">Normal</option>
                        <option value="favoured">Favoured</option>
                        <option value="illFavoured">Ill-favoured</option>
                      </select>
                      <label className={"toggle " + (enemyWeary ? 'on' : '')} style={{ marginTop: 8, display: 'inline-flex' }}>
                        <input type="checkbox" checked={enemyWeary} onChange={(e) => setEnemyWeary(e.target.checked)} /> Weary
                      </label>
                    </div>
                    <div className="col" style={{ minWidth: 220 }}>
                      <div className="label">Spend {resLabel} for +1 die (max {maxSpend})</div>
                      <input className="input" type="number" min={0} max={maxSpend} value={enemySpend} onChange={(e) => {
                        const n = parseInt(e.target.value, 10);
                        setEnemySpend(Number.isFinite(n) ? Math.max(0, Math.min(maxSpend, n)) : 0);
                      }} />
                    </div>
                  </div>

                  <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                    <button className="btn" disabled={!enemyAttackWeaponName} onClick={startEnemyAttackRoll}>Roll</button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      ) : null}

      {/* Special success picker */}
      {specialPickerOpen ? (
        <div className="modalOverlay" onMouseDown={() => setSpecialPickerOpen(false)}>
          <div className="modal" style={{ maxWidth: 520 }} onMouseDown={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <div><b>Special Success</b></div>
              <button className="btn btn-ghost" onClick={() => setSpecialPickerOpen(false)}>Close</button>
            </div>
            <div className="small muted" style={{ marginTop: 8 }}>1 choice per success icon (duplicates allowed).</div>
            <div style={{ marginTop: 10 }}>
              {specialChoices.map((v, idx) => (
                <div key={idx} className="row" style={{ gap: 8, marginBottom: 8, alignItems: 'center' }}>
                  <div className="small" style={{ width: 90 }}>Icon {idx + 1}</div>
                  <select className="input" value={v} onChange={(e) => {
                    const next = specialChoices.slice();
                    next[idx] = e.target.value as SpecialPick;
                    setSpecialChoices(next);
                  }} style={{ flex: 1 }}>
                    {SPECIALS.map(op => <option key={op} value={op}>{op}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button className="btn" onClick={() => finalizeEnemyAttack(specialChoices)}>Apply</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
