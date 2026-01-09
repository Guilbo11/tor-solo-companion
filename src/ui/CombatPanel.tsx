import React, { useEffect, useMemo, useState } from 'react';
import { compendiums } from '../core/compendiums';
import { computeDerived, weaponIsRangedCapable, weaponTypeForEquipment } from '../core/tor2e';
import { formatTorRoll, rollTOR, rollTORAdversary } from '../core/dice';
import { combatReducer } from '../combat/reducer';
import { getSkillTN } from '../core/skills';
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
    armour: typeof e?.armour === 'number' ? e.armour : Number(e?.armour ?? 0) || 0,
    wounds: 0,
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

type EnemySpecialPick = 'None' | 'PIERCE' | 'HEAVY BLOW' | 'BREAK SHIELD' | 'SEIZE';

type HeroSpecialPick = 'None' | 'HEAVY BLOW' | 'FEND OFF' | 'PIERCE' | 'SHIELD THRUST' | 'BREAK FREE';

function profKey(p: string): 'axes'|'bows'|'spears'|'swords'|'brawling'|null {
  const s = String(p ?? '').toLowerCase();
  if (s.includes('brawling')) return 'brawling';
  if (s.startsWith('axe')) return 'axes';
  if (s.startsWith('bow')) return 'bows';
  if (s.startsWith('spear')) return 'spears';
  if (s.startsWith('sword')) return 'swords';
  return null;
}


function canUseWeaponInStance(weapon: any, stance: Stance, seized: boolean): boolean {
  // If seized, the hero can only use Brawling in close combat stances.
  if (seized) return stance !== 'rearward' && stance !== 'skirmish';
  const wt = weaponTypeForEquipment(weapon);
  const isRangedCapable = weaponIsRangedCapable(wt);
  const rangedStance = stance === 'rearward' || stance === 'skirmish';
  return rangedStance ? isRangedCapable : !isRangedCapable;
}

export default function CombatPanel({ state, setState }: { state: any; setState: (u: any) => void }) {
  const campId = state.activeCampaignId ?? 'camp-1';
  const heroes = Array.isArray(state.heroes) ? state.heroes.filter((h: any) => String(h.campaignId ?? campId) === String(campId)) : [];
  const combat: CombatState | null = (state.combatByCampaign?.[campId] ?? null) as any;

  const [heroId, setHeroId] = useState<string>(() => String(heroes[0]?.id ?? ''));
  const [enemySearch, setEnemySearch] = useState('');
  const [enemyIds, setEnemyIds] = useState<string[]>([]);
  const [striderMode, setStriderMode] = useState(false);
  const [enemyAutomation, setEnemyAutomation] = useState<CombatOptions['enemyAutomation']>('manualWithSuggestions');
  // Ambush / surprise attack
  const [ambush, setAmbush] = useState(false);
  const [ambushTarget, setAmbushTarget] = useState<'Heroes' | 'Enemies'>('Enemies');

  // Option A (2.4): prompt for starting position when an enemy can attack at range.
  const [startPosOpen, setStartPosOpen] = useState(false);
  const [startPosById, setStartPosById] = useState<Record<string, 'melee' | 'ranged'>>({});
  const startPosPendingRef = React.useRef<{ heroId: string; enemies: CombatEnemy[]; options: CombatOptions } | null>(null);

  const enemiesAll = useMemo(() => {
    const list = (compendiums as any).adversariesCore?.entries ?? [];
    const q = enemySearch.trim().toLowerCase();
    const filtered = q ? list.filter((e: any) => String(e?.name ?? '').toLowerCase().includes(q)) : list;
    return filtered.slice().sort((a: any, b: any) => String(a?.name ?? '').localeCompare(String(b?.name ?? '')));
  }, [enemySearch]);

  const enemyHasRangedWeapon = (en: CombatEnemy): boolean => {
    const profs = Array.isArray(en.combatProficiencies) ? en.combatProficiencies : [];
    return profs.some((p) => String(p?.name ?? '').toLowerCase().includes('bow'));
  };

  const activeHero = useMemo(() => {
    const h = heroes.find((x: any) => String(x.id) === String(combat?.heroId ?? heroId));
    return h ?? null;
  }, [heroes, combat?.heroId, heroId]);

  const derived = useMemo(() => (activeHero ? computeDerived(activeHero, (combat?.options?.striderMode ? 18 : 20)) : null), [activeHero, combat?.options?.striderMode]);
  const heroParryTN = (Number(derived?.parry?.total ?? 0) || 0) + (Number(combat?.roundMods?.heroParryBonus ?? 0) || 0);

  /**
   * IMPORTANT: Combat updates must be reduced against the latest combat state.
   * Using the render-time `combat` in multiple sequential dispatches would drop updates
   * (ex: Endurance deltas not sticking). Always reduce functionally.
   */
  const dispatch = (ev: any) => {
    setState((prev: any) => {
      const current: CombatState | null = (prev.combatByCampaign?.[campId] ?? null) as any;
      const next = combatReducer(current, ev as any) as any;
      const by = { ...(prev.combatByCampaign ?? {}) };
      by[campId] = next;
      return { ...prev, combatByCampaign: by };
    });
  };

  const dispatchMany = (events: any[]) => {
    setState((prev: any) => {
      let current: CombatState | null = (prev.combatByCampaign?.[campId] ?? null) as any;
      for (const ev of events) current = combatReducer(current, ev as any) as any;
      const by = { ...(prev.combatByCampaign ?? {}) };
      by[campId] = current;
      return { ...prev, combatByCampaign: by };
    });
  };

  const itemDisplayName = (it: any): string => {
    const refId = it?.ref?.id;
    const pack = it?.ref?.pack;
    if (pack === 'tor2e-equipment' && refId) {
      const e: any = (compendiums as any).equipment?.entries?.find((x: any) => String(x?.id) === String(refId));
      if (e?.name) return String(e.name);
    }
    return String(it?.name ?? 'Item');
  };

  const updateHeroInventory = (heroIdToUpdate: string, updater: (inv: any[]) => any[]) => {
    setState((prev: any) => {
      const hs = Array.isArray(prev.heroes) ? prev.heroes.slice() : [];
      const idx = hs.findIndex((h: any) => String(h.id) === String(heroIdToUpdate));
      if (idx < 0) return prev;
      const h = hs[idx];
      const inv = Array.isArray(h.inventory) ? h.inventory.slice() : [];
      hs[idx] = { ...h, inventory: updater(inv) };
      return { ...prev, heroes: hs };
    });
  };

  const setDroppedByItemId = (heroIdToUpdate: string, itemId: string, dropped: boolean) => {
    updateHeroInventory(heroIdToUpdate, (inv) => inv.map((it: any) => String(it?.id) === String(itemId) ? { ...it, dropped: !!dropped, equipped: dropped ? false : it.equipped } : it));
  };

  // --- Enemy attack modal (re-uses the "From Enemy" logic but scoped to combat) ---
  const [enemyAttackOpen, setEnemyAttackOpen] = useState(false);
  const [enemyAttackEnemyId, setEnemyAttackEnemyId] = useState('');
  const [enemyAttackWeaponName, setEnemyAttackWeaponName] = useState('');
  const [enemyWeary, setEnemyWeary] = useState(false);
  const [enemyFeatMode, setEnemyFeatMode] = useState<'normal' | 'favoured' | 'illFavoured'>('normal');
  const [enemySpend, setEnemySpend] = useState(0);

  const [specialPickerOpen, setSpecialPickerOpen] = useState(false);
  const [specialChoices, setSpecialChoices] = useState<EnemySpecialPick[]>([]);
  const pendingRef = React.useRef<any>(null);

  // --- Hero actions ---
  const [heroAttackOpen, setHeroAttackOpen] = useState(false);
  const [heroAttackTargetId, setHeroAttackTargetId] = useState('');
  const [heroFeatMode, setHeroFeatMode] = useState<'normal' | 'favoured' | 'illFavoured'>('normal');
  const [heroWeaponName, setHeroWeaponName] = useState('');
  const [heroWieldMode, setHeroWieldMode] = useState<'1h' | '2h'>('1h');
  const [wieldByWeaponId, setWieldByWeaponId] = useState<Record<string, '1h' | '2h'>>({});

  // Engagement chooser (melee stances only)
  const [engageOpen, setEngageOpen] = useState(false);
  const [engageSelectedIds, setEngageSelectedIds] = useState<string[]>([]);

  // Hero special success picker
  const [heroSpecialOpen, setHeroSpecialOpen] = useState(false);
  const [heroSpecialChoices, setHeroSpecialChoices] = useState<HeroSpecialPick[]>([]);
  const heroPendingRef = React.useRef<any>(null);

  const [heroTaskOpen, setHeroTaskOpen] = useState(false);
  const [heroTaskFeatMode, setHeroTaskFeatMode] = useState<'normal' | 'favoured' | 'illFavoured'>('normal');
  const [heroTaskWeary, setHeroTaskWeary] = useState(false);

  // --- Opening Volleys (pre-combat popup) ---
  const [ovCycle, setOvCycle] = useState(1);
  const [ovHeroDone, setOvHeroDone] = useState(false);
  const [ovEnemyDone, setOvEnemyDone] = useState<Record<string, boolean>>({});
  const [ovSummary, setOvSummary] = useState('');
  const [heroAttackIsOpeningVolley, setHeroAttackIsOpeningVolley] = useState(false);
  const [heroAttackDropItemId, setHeroAttackDropItemId] = useState<string | null>(null);
  const [enemyAttackIsOpeningVolley, setEnemyAttackIsOpeningVolley] = useState(false);

  const beginEnemyAttack = (forceEnemyId?: string) => {
    if (!combat) return;
    if (combat.surprise?.enemiesSurprised && combat.round === 1) return;
    const aliveAll = (combat.enemies ?? []).filter((e) => (Number(e.endurance?.current ?? 0) || 0) > 0);
    const alive = (combat.hero.stance === 'rearward') ? aliveAll.filter(enemyHasRangedWeapon) : aliveAll;
    const forced = forceEnemyId ? alive.find((e) => String(e.id) === String(forceEnemyId)) : undefined;
    const firstAvailable = forced ?? (alive.find((e) => !combat.actionsUsed?.enemies?.[e.id]) ?? alive[0] ?? combat.enemies[0]);
    setEnemyAttackEnemyId(firstAvailable?.id ?? '');
    setEnemyAttackWeaponName('');
    setEnemyFeatMode('normal');
    setEnemyWeary(false);
    setEnemySpend(0);
    setEnemyAttackOpen(true);
  };

  const toast = (message: string, type: 'info'|'success'|'warning'|'error' = 'info') => {
    (window as any).__torcToast?.({ message, type, durationMs: 4000 });
  };

  const startEnemyAttackRoll = () => {
    if (!combat || !activeHero || !derived) return;
    const enemy = combat.enemies.find(e => e.id === enemyAttackEnemyId);
    const weapon = enemy?.combatProficiencies?.find(w => w.name === enemyAttackWeaponName);
    if (!enemy || !weapon) return;

    const baseDice = Number(weapon.rating ?? 0) + Number(enemySpend ?? 0);
    const pen = Number(combat.roundMods?.enemyDicePenalty?.[String(enemy.id)] ?? 0) || 0;
    const dice = Math.max(0, baseDice + pen);
    const tn = heroParryTN;
    const r = rollTORAdversary({ dice, featMode: enemyFeatMode, weary: enemyWeary, tn });
    pendingRef.current = { enemy, weapon, roll: r, tn };

    if ((r.icons ?? 0) > 0) {
      // Auto enemies: if Pierce would turn a normal result into a Piercing Blow, choose it.
      if (combat.options.enemyAutomation === 'auto') {
        const opts = new Set<string>();
        (weapon.specialDamage ?? []).forEach((s: any) => opts.add(String(s)));
        const canPierce = opts.has('Pierce') || opts.has('PIERCE');
        const featBase = (r.feat.type === 'Number') ? r.feat.value : (r.feat.type === 'Eye' ? 10 : 0);
        const would = canPierce ? Math.min(10, featBase + 2) : featBase;
        const pierceToPB = canPierce && (featBase < 10) && (would >= 10);
        const picks: EnemySpecialPick[] = Array.from({ length: r.icons }, () => 'None');
        if (pierceToPB) picks[0] = 'PIERCE';
        // Fill remaining with HEAVY BLOW if listed in the stat block
        for (let i = 0; i < picks.length; i++) {
          if (picks[i] !== 'None') continue;
          if (opts.has('Heavy Blow') || opts.has('HEAVY BLOW')) picks[i] = 'HEAVY BLOW';
        }
        setEnemyAttackOpen(false);
        finalizeEnemyAttack(picks);
        return;
      }

      setSpecialChoices(Array.from({ length: r.icons }, () => 'None'));
      setEnemyAttackOpen(false);
      setSpecialPickerOpen(true);
    } else {
      setEnemyAttackOpen(false);
      finalizeEnemyAttack([]);
    }
  };

  const finalizeEnemyAttack = (specials: EnemySpecialPick[]) => {
    if (!combat || !activeHero || !derived) return;
    const ctx = pendingRef.current;
    if (!ctx) return;
    const enemy: CombatEnemy = ctx.enemy;
    const w = ctx.weapon;
    // Update enemy position based on the type of attack made.
    // If the enemy attacks with a ranged weapon, they are considered to be at distance; otherwise melee.
    try {
      const wn = String(w?.name ?? '').toLowerCase();
      const nextPos = (wn.includes('bow') || wn.includes('ranged') || wn.includes('sling')) ? 'ranged' : 'melee';
      dispatch({ type: 'SET_ENEMY_POSITION', enemyId: enemy.id, position: nextPos, reason: `${enemy.name} is now ${nextPos === 'ranged' ? 'at distance' : 'in close combat'}.` });
    } catch {}

    const r = ctx.roll;
    const tn = ctx.tn;

    const picks = (specials ?? []).filter((s) => s && s !== 'None');
    const pierceCount = picks.filter((p) => p === 'PIERCE').length;
    const heavyCount = picks.filter((p) => p === 'HEAVY BLOW').length;
    const breakShield = picks.includes('BREAK SHIELD');
    const seizedPick = picks.includes('SEIZE');

    // Recompute total if PIERCE was selected (adds +2 per pick to Feat number; Eye already best for adversary).
    let featNumber = (r.feat.type === 'Number') ? r.feat.value : (r.feat.type === 'Eye' ? 10 : 0);
    if (pierceCount) featNumber = Math.min(10, featNumber + (2 * pierceCount));
    const succSum = r.success.reduce((a: number, d: any) => a + ((enemyWeary && (d.value === 1 || d.value === 2 || d.value === 3)) ? 0 : d.value), 0);
    const total = featNumber + succSum;
    const passed = (r.feat.type === 'Eye') ? true : total >= tn;

    // Piercing Blow (core): only on a successful attack, triggered on Feat die 10 or Eye.
    // We keep the same logic as the existing "From Enemy" flow in Heroes.
    const piercingBlow = passed && ((r.feat.type === 'Eye') || featNumber >= 10);

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

    // SEIZE: mark the hero as seized in the combat state (affects hero attacks until broken free).
    if (passed && seizedPick) {
      dispatch({ type: 'SET_HERO_SEIZED', seized: true, reason: 'Seized by the enemy.' } as any);
    }

    // BREAK SHIELD: mirror the Heroes panel behaviour (only if an equipped shield exists and has no rewards).
    if (passed && breakShield) {
      try {
        const shieldEntry: any = (derived as any)?.equippedShield;
        const inv = Array.isArray(activeHero?.inventory) ? activeHero.inventory : [];
        const shieldItem: any = shieldEntry
          ? inv.find((it: any) => it?.equipped && !it?.dropped && it?.ref?.pack === 'tor2e-equipment' && String(it?.ref?.id) === String(shieldEntry.id))
          : null;
        const hasRewards = !!shieldItem?.override?.rewards?.length;
        if (shieldItem && !hasRewards) {
          const ok = window.confirm('BREAK SHIELD: Remove your equipped shield (no rewards). Drop it now?');
          if (ok) {
            setState((prev: any) => {
              const nextHeroes = (prev.heroes ?? []).map((h: any) => {
                if (String(h.id) !== String(activeHero.id)) return h;
                const inv2 = Array.isArray(h.inventory) ? h.inventory.slice() : [];
                const idx = inv2.findIndex((it: any) => it === shieldItem);
                if (idx >= 0) inv2[idx] = { ...shieldItem, equipped: false, dropped: true };
                return { ...h, inventory: inv2 };
              });
              return { ...prev, heroes: nextHeroes };
            });
          }
        }
      } catch {}
    }

    // If Piercing Blow was scored, roll Protection against Injury and record Wounded/Injury on the hero.
    // This mirrors the core book flow used elsewhere in the app.
    let piercingToastLine = '';
    if (piercingBlow) {
      const injTN = Number(w.injury ?? 0) || 0;
      const protectionDice = Number((derived as any)?.protection?.total ?? 0) || 0;
      const bonus = Number((derived as any)?.protectionPiercingBonus ?? 0) || 0; // Close-fitting etc.
      const prRaw = rollTOR({ dice: protectionDice, featMode: 'normal', weary: !!activeHero?.conditions?.weary, tn: injTN });
      const pr = bonus
        ? ({ ...prRaw, total: (prRaw.total ?? 0) + bonus, passed: ((prRaw.total ?? 0) + bonus) >= injTN } as any)
        : prRaw;

      const resisted = pr.passed === true;
      piercingToastLine = `Piercing - ${resisted ? 'RESISTED' : 'NOT RESISTED'} (TN ${injTN})${bonus ? ` (+${bonus})` : ''}`;

      if (!resisted) {
        // Apply Wounded + Injury severity tracking.
        setState((prev: any) => {
          const nextHeroes = (prev.heroes ?? []).map((h: any) => {
            if (String(h.id) !== String(activeHero.id)) return h;
            const alreadyWounded = !!h?.conditions?.wounded;
            const nextConditions = { ...(h.conditions ?? {}), wounded: true };
            // If already wounded, now Dying (core).
            if (alreadyWounded) {
              nextConditions.dying = true;
              return { ...h, conditions: nextConditions };
            }

            // Roll severity (Feat die only) and store in Injury field similarly to the Heroes sheet flow.
            const sev = rollTOR({ dice: 0, featMode: 'normal' });
            if (sev.feat.type === 'Eye') {
              // Grievous: drop to 0 Endurance and Dying.
              const curEnd = Number(h?.endurance?.current ?? 0) || 0;
              const maxEnd = Number(h?.endurance?.max ?? h?.endurance?.maximum ?? 0) || 0;
              return { ...h, endurance: { ...(h.endurance ?? {}), current: 0, max: maxEnd || (h.endurance?.max ?? 0) }, conditions: { ...nextConditions, dying: true } };
            }
            if (sev.feat.type === 'Gandalf') {
              // Moderate: Wounded clears after the combat; we still mark Wounded now.
              return { ...h, conditions: nextConditions };
            }

            // Severe: store N days in Injury box (append).
            const days = Number(sev.feat.value ?? 0) || 0;
            const currentInjury = String(h?.injury ?? '').trim();
            const nextInjury = days > 0 ? (currentInjury ? `${currentInjury}; ${days} days` : `${days} days`) : currentInjury;
            return { ...h, conditions: nextConditions, injury: nextInjury };
          });
          return { ...prev, heroes: nextHeroes };
        });
      }
    }

    // Log
    const deg = passed ? (r.icons === 0 ? 'Success' : r.icons === 1 ? 'Great Success' : 'Extraordinary Success') : 'FAIL';
    const txt = passed
      ? `${enemy.name} - PASS — ${deg}${piercingBlow ? ' - PIERCING BLOW' : ''}${picks.length ? ` • ${picks.join(', ')}` : ''} • Damage ${dmg}`
      : `${enemy.name} - FAIL — Miss`;
    dispatchMany([
      { type: 'LOG', text: txt, data: { enemyId: enemy.id, weapon: w.name, total, tn, specials: picks } },
      // Enemy position is determined by the type of their last attack (melee vs ranged).
      { type: 'SET_ENEMY_POSITION', enemyId: enemy.id, position: String(w?.name ?? '').toLowerCase().includes('bow') ? 'ranged' : 'melee' },
      ...(enemyAttackIsOpeningVolley ? [] : [{ type: 'ENEMY_ACTION_USED', enemyId: enemy.id, kind: 'attack', data: { weapon: w.name } }]),
    ]);

    // Toast (4s, colored) like elsewhere.
    // Toast recap (2 lines when Piercing Blow happened).
    toast(piercingToastLine ? `${txt}\n${piercingToastLine}` : txt, passed ? 'warning' : 'success');

    pendingRef.current = null;
    setSpecialPickerOpen(false);
    if (enemyAttackIsOpeningVolley) {
      setOvEnemyDone((prev) => ({ ...prev, [String(enemy.id)]: true }));
      setEnemyAttackIsOpeningVolley(false);
    }
  };

  const startCombat = () => {
    const pickedHeroId = heroId || String(heroes[0]?.id ?? '');
    const selected = ((compendiums as any).adversariesCore?.entries ?? []).filter((e: any) => enemyIds.includes(String(e.id)));
    const enemies = selected.map(toCombatEnemy);
    const options: CombatOptions = { striderMode, enemyAutomation };

    const hasRanged = (en: CombatEnemy) => {
      const profs = Array.isArray(en.combatProficiencies) ? en.combatProficiencies : [];
      return profs.some((p) => {
        const n = String(p.name ?? '').toLowerCase();
        return n.includes('bow') || n.includes('ranged') || n.includes('sling') || n.includes('javelin');
      });
    };
    const rangedCapable = enemies.filter((e) => hasRanged(e));
    if (rangedCapable.length) {
      // Option A: ask the user to set the starting position for each ranged-capable enemy.
      const init: Record<string, 'melee' | 'ranged'> = {};
      for (const e of rangedCapable) init[String(e.id)] = 'melee';
      setStartPosById(init);
      startPosPendingRef.current = { heroId: pickedHeroId, enemies, options };
      setStartPosOpen(true);
      return;
    }

    doStartCombatWithAmbush({ heroId: pickedHeroId, enemies, options });
  };

  const doStartCombatWithAmbush = ({ heroId: pickedHeroId, enemies, options }: { heroId: string; enemies: CombatEnemy[]; options: CombatOptions }) => {
    const h = heroes.find((x: any) => String(x.id) === String(pickedHeroId));
    const tnBase = options.striderMode ? 18 : 20;
    const d = h ? computeDerived(h, tnBase) : null;

    let surprise: CombatState['surprise'] | undefined = undefined;

    if (ambush && h && d) {
      if (ambushTarget === 'Heroes') {
        // Enemy ambushes: Awareness check.
        const rating = Number(h?.skillRatings?.awareness ?? 0) || 0;
        const fav = (d.favouredSkillSet as any)?.has ? (d.favouredSkillSet as any).has('awareness') : false;
        const rr = rollTOR({ dice: rating, tn: d.strengthTN, featMode: fav ? 'favoured' : 'normal', weary: !!h.conditions?.weary });
        const passed = typeof rr.passed === 'boolean' ? rr.passed : (rr.isAutomaticSuccess || rr.total >= d.strengthTN);
        toast(`Awareness — ${passed ? 'PASS' : 'FAIL'}`, passed ? 'success' : 'warning');
        if (!passed) surprise = { heroCaughtOffGuard: true };
      } else {
        // Hero ambushes: Stealth check.
        const rating = Number(h?.skillRatings?.stealth ?? 0) || 0;
        const fav = (d.favouredSkillSet as any)?.has ? (d.favouredSkillSet as any).has('stealth') : false;
        const tn = getSkillTN(h, 'stealth', tnBase);
        const rr = rollTOR({ dice: rating, tn, featMode: fav ? 'favoured' : 'normal', weary: !!h.conditions?.weary });
        const html = formatTorRoll(rr, { label: 'Stealth', tn });
        const plain = String(html).replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim();
        const passed = typeof rr.passed === 'boolean' ? rr.passed : (rr.isAutomaticSuccess || rr.total >= tn);
        toast(plain, passed ? 'success' : 'warning');
        if (passed) surprise = { enemiesSurprised: true };
      }
    }

    dispatch({ type: 'START_COMBAT', campaignId: campId, heroId: pickedHeroId, enemies, options, surprise } as any);
  };

  const endCombat = () => {
    if (!combat) return;
    const enemiesLeft = (combat.enemies ?? []).some(e => (Number(e.endurance?.current ?? 0) || 0) > 0);
    const escaped = combat.phase === 'combatEnd' && (combat.log ?? []).some(l => String(l.text ?? '').toLowerCase().includes('escaped combat'));
    const inv = Array.isArray(activeHero?.inventory) ? activeHero.inventory : [];
    const droppedItems = inv.filter((it: any) => !!it.dropped);

    const isFleeLike = escaped || enemiesLeft;

    if (enemiesLeft && !escaped) {
      const itemsLine = droppedItems.length
        ? `\n\nYou have these items dropped:\n- ${droppedItems.map(itemDisplayName).join('\n- ')}\n\nIf you flee you will lose them.`
        : '';
      const ok = window.confirm("There are still enemies left and you didn't escape. Want to end the combat anyways?" + itemsLine);
      if (!ok) return;
    } else if (escaped && droppedItems.length) {
      const ok = window.confirm(`You have these items dropped:\n- ${droppedItems.map(itemDisplayName).join('\n- ')}\n\nIf you flee you will lose them. End the combat?`);
      if (!ok) return;
    }

    // Inventory handling for dropped items:
    // - If ending normally (no enemies left), automatically recover dropped items.
    // - If fleeing/abandoning with enemies left, dropped items are lost.
    if (activeHero?.id) {
      if (isFleeLike) {
        if (droppedItems.length) {
          updateHeroInventory(activeHero.id, (items) => items.filter((it: any) => !it.dropped));
        }
      } else {
        // Recover after combat automatically.
        if (droppedItems.length) {
          updateHeroInventory(activeHero.id, (items) => items.map((it: any) => it.dropped ? { ...it, dropped: false } : it));
        }
      }
    }

    setState((prev: any) => {
      const by = { ...(prev.combatByCampaign ?? {}) };
      by[campId] = null;
      return { ...prev, combatByCampaign: by };
    });
  };

  const toggleEnemy = (id: string) => {
    setEnemyIds((prev) => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  // --- Combat-derived helpers (defined before any conditional return to keep hook order stable) ---
  const heroStances: Stance[] = (combat?.options?.striderMode ?? striderMode)
    ? ['forward', 'open', 'defensive', 'rearward', 'skirmish']
    : ['forward', 'open', 'defensive', 'rearward'];

  const engagedEnemyIds = combat?.engagement?.heroToEnemies?.[String(combat?.heroId ?? '')] ?? [];
  const engagedEnemies = combat?.enemies?.filter((e) => engagedEnemyIds.includes(e.id)) ?? [];
  const engagedEnemiesAlive = engagedEnemies.filter((e) => (Number(e.endurance?.current ?? 0) || 0) > 0);

  const enemiesAlive = combat?.enemies?.filter((e) => (Number(e.endurance?.current ?? 0) || 0) > 0) ?? [];
  const enemyActionList = (combat?.hero?.stance === 'rearward') ? enemiesAlive.filter(enemyHasRangedWeapon) : enemiesAlive;
  const heroActionUsed = !!combat?.actionsUsed?.hero;

  const heroAttackTargets = (() => {
    if (!combat) return [] as any[];
    if (heroAttackIsOpeningVolley) return enemiesAlive;
    if (combat.hero.stance === 'rearward' || combat.hero.stance === 'skirmish') return enemiesAlive;
    return engagedEnemiesAlive;
  })();

  const engageableEnemies = (() => {
    if (!combat) return [] as any[];
    if (combat.hero.stance === 'rearward' || combat.hero.stance === 'skirmish') return [] as any[];
    return enemiesAlive.filter((e: any) => String(e.position ?? 'melee') !== 'ranged');
  })();

  const engageCounts = (() => {
    let human = 0;
    let large = 0;
    for (const id of engageSelectedIds) {
      const en = engageableEnemies.find((e: any) => String(e.id) === String(id));
      if (!en) continue;
      if (String(en.size ?? 'human') === 'large') large += 1;
      else human += 1;
    }
    return { human, large };
  })();

  const engageLimitOk = engageCounts.human <= 3 && engageCounts.large <= 2;

  const defeatedToastRef = React.useRef<{ combatId: string | null; lastAlive: number }>({ combatId: null, lastAlive: 0 });

  useEffect(() => {
    if (!combat) return;
    const aliveCount = enemiesAlive.length;
    if (defeatedToastRef.current.combatId !== combat.id) {
      defeatedToastRef.current = { combatId: combat.id, lastAlive: aliveCount };
      return;
    }
    if (defeatedToastRef.current.lastAlive > 0 && aliveCount === 0) {
      toast('All enemies defeated!', 'success');
    }
    defeatedToastRef.current.lastAlive = aliveCount;
  }, [combat?.id, enemiesAlive.length]);

  const applyEngagementSelection = (ids: string[]) => {
    if (!combat) return;
    const heroId = String(combat.heroId);
    const heroToEnemies: any = { [heroId]: ids.slice() };
    const enemyToHeroes: any = {};
    for (const e of (combat.enemies ?? [])) {
      enemyToHeroes[String(e.id)] = ids.includes(String(e.id)) ? [heroId] : [];
    }
    dispatch({ type: 'SET_ENGAGEMENT', engagement: { heroToEnemies, enemyToHeroes } });
  };

  // Opening Volleys summary - must not rely on combat being non-null across renders.
  useEffect(() => {
    if (!combat || combat.phase !== 'openingVolleys') return;
    setOvCycle(1);
    setOvHeroDone(false);
    setOvEnemyDone({});
    const s = combat.surprise;
    const parts: string[] = [];
    if (s?.heroCaughtOffGuard) parts.push('Ambush: hero caught off-guard (no hero volleys)');
    if (s?.enemiesSurprised) parts.push('Ambush success: enemies surprised (no enemy volleys; no enemy attacks in Round 1)');
    if (!parts.length) parts.push('No ambush effects');
    const allowHeroOV = !s?.heroCaughtOffGuard;
    const allowEnemyOV = !s?.enemiesSurprised;
    parts.push(`Opening volley allowed: Hero ${allowHeroOV ? '✅' : '❌'} / Enemies ${allowEnemyOV ? '✅' : '❌'}`);
    setOvSummary(parts.join(' • '));
  }, [combat?.id, combat?.phase]);

  const stanceTask = (() => {
    const s = combat?.hero?.stance;
    if (!s) return null;
    if (s === 'forward') return { id: 'intimidateFoe', name: 'Intimidate Foe', skill: 'awe', attr: 'heart' } as const;
    if (s === 'open') return { id: 'rallyComrades', name: 'Rally Comrades', skill: 'enhearten', attr: 'heart' } as const;
    if (s === 'defensive') return { id: 'protectCompanion', name: 'Protect Companion', skill: 'athletics', attr: 'strength' } as const;
    if (s === 'rearward') return { id: 'prepareShot', name: 'Prepare Shot', skill: 'scan', attr: 'wits' } as const;
    if (s === 'skirmish') return { id: 'gainGround', name: 'Gain Ground', skill: 'athleticsOrScan', attr: 'strengthOrWits' } as const;
    return null;
  })();

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
          <div className="row" style={{ gap: 10, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <label className={"toggle " + (ambush ? 'on' : '')} style={{ display: 'inline-flex' }}>
              <input type="checkbox" checked={ambush} onChange={(e) => setAmbush(e.target.checked)} /> Ambush
            </label>
            <div className="col" style={{ minWidth: 220, opacity: ambush ? 1 : 0.6 }}>
              <div className="label">Target</div>
              <select className="input" disabled={!ambush} value={ambushTarget} onChange={(e) => setAmbushTarget(e.target.value as any)}>
                <option value="Heroes">Heroes</option>
                <option value="Enemies">Enemies</option>
              </select>
            </div>
          </div>
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

        {startPosOpen && (() => {
          const pending = startPosPendingRef.current;
          if (!pending) return null;
          const rangedCapable = (pending.enemies ?? []).filter((en) => {
            const profs = Array.isArray(en.combatProficiencies) ? en.combatProficiencies : [];
            return profs.some((p) => {
              const n = String(p.name ?? '').toLowerCase();
              return n.includes('bow') || n.includes('ranged') || n.includes('sling') || n.includes('javelin');
            });
          });

          return (
            <div className="modalOverlay" onMouseDown={() => setStartPosOpen(false)}>
              <div className="modal" style={{ maxWidth: 520 }} onMouseDown={(e) => e.stopPropagation()}>
                <div className="modalHeader">
                  <div className="h3">Starting positions</div>
                  <button className="btn btn-ghost" onClick={() => setStartPosOpen(false)}>Close</button>
                </div>
                <div className="modalBody">
                  <div className="small muted">These adversaries can fight at range. Choose whether they start in close combat or at distance.</div>
                  <div style={{ marginTop: 10 }}>
                    {rangedCapable.map((en) => (
                      <div key={en.id} className="row" style={{ gap: 10, alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #2a2f3a' }}>
                        <div style={{ flex: 1 }}><b>{en.name}</b></div>
                        <select className="input" style={{ width: 160 }} value={startPosById[String(en.id)] ?? 'melee'} onChange={(e) => setStartPosById((prev) => ({ ...prev, [String(en.id)]: e.target.value as any }))}>
                          <option value="melee">Close combat</option>
                          <option value="ranged">At distance</option>
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="modalFooter">
                  <button className="btn" onClick={() => {
                    const nextEnemies = (pending.enemies ?? []).map((en) => {
                      const pos = startPosById[String(en.id)];
                      return pos ? { ...en, position: pos } : en;
                    });
                    setStartPosOpen(false);
                    startPosPendingRef.current = null;
                    doStartCombatWithAmbush({ heroId: pending.heroId, enemies: nextEnemies, options: pending.options });
                  }}>Confirm</button>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    );
  }

  const beginHeroAttack = (weapon?: any) => {
    if (!combat || !activeHero || !derived) return;
    const defaultTarget = (engagedEnemies[0]?.id ?? enemiesAlive[0]?.id ?? '');
    setHeroAttackTargetId(defaultTarget);
    const w = weapon ?? derived.equippedWeapons?.[0];
    setHeroWeaponName(String(w?.name ?? ''));
    const hasShield = !!(derived as any)?.equippedShield;
    const mode = wieldByWeaponId[String(w?.id)] ?? '1h';
    setHeroWieldMode(hasShield ? '1h' : (mode as any));
    setHeroFeatMode('normal');
    setHeroAttackOpen(true);
  };

  const resolveHeroAttack = () => {
    if (!combat || !activeHero || !derived) return;
    if (!heroAttackIsOpeningVolley && combat.actionsUsed?.hero) {
      toast('You already used your main action this round.', 'warning');
      return;
    }
    const target = combat.enemies.find(e => String(e.id) === String(heroAttackTargetId));
    if (!target) return;

    // Enforce targeting rules:
    // - In Forward/Open/Defensive, a hero may only attack engaged enemies.
    // - In Rearward/Skirmish (and during Opening Volleys), any living enemy may be targeted.
    if (!heroAttackIsOpeningVolley && combat.hero.stance !== 'rearward' && combat.hero.stance !== 'skirmish') {
      const engagedIds = new Set((combat.engagement?.heroToEnemies?.[String(combat.heroId)] ?? []).map(String));
      if (!engagedIds.has(String(heroAttackTargetId))) {
        toast('You can only attack enemies you are engaged with in this stance.', 'warning');
        return;
      }
    }
    const w: any = (derived.equippedWeapons ?? []).find((x: any) => String(x?.name ?? '') === String(heroWeaponName)) ?? null;
    if (!w) return;

    // Enforce weapon usability by stance for normal rounds.
    if (!heroAttackIsOpeningVolley) {
      const usable = canUseWeaponInStance(w, combat.hero.stance, !!combat.hero.seized);
      if (!usable) {
        toast(combat.hero.stance === 'rearward' || combat.hero.stance === 'skirmish'
          ? 'You can only use ranged weapons in Rearward/Skirmish.'
          : 'You can only use melee weapons unless you are in Rearward/Skirmish.', 'warning');
        return;
      }
    }

    // Opening volley: thrown spears become Dropped as soon as they are used.
    if (heroAttackIsOpeningVolley && heroAttackDropItemId && activeHero?.id) {
      setDroppedByItemId(activeHero.id, heroAttackDropItemId, true);
    }

    const cp = (derived as any)?.combatProficiencies ?? {};
    const seized = !!combat.hero.seized;
    const k = profKey(w.combatProficiency ?? w.proficiency ?? w.category);
    // If seized, attacks are limited to Brawling and use the best proficiency with -1 Success die.
    const baseDice = (() => {
      if (seized) {
        const best = Math.max(Number(cp.axes ?? 0), Number(cp.bows ?? 0), Number(cp.spears ?? 0), Number(cp.swords ?? 0), Number(cp.brawling ?? 0));
        return Math.max(0, best - 1);
      }
      return k ? Number(cp[k] ?? 0) : 0;
    })();

    const tn = Number(target.parry ?? 0) || 0;
    const r = rollTOR({ dice: Number(baseDice ?? 0), tn, featMode: heroFeatMode, weary: !!activeHero?.conditions?.weary });

    // Save context for finalize (with or without special success picker)
    heroPendingRef.current = { roll: r, weapon: w, target, tn, seized, wieldMode: heroWieldMode, hasShield: !!(derived as any)?.equippedShield, strength: Number(activeHero?.attributes?.strength ?? activeHero?.strength ?? 0) || 0 };

    // Only on a successful attack with one or more success icons, open the hero Special Success picker.
    if (r.passed && (r.icons ?? 0) > 0) {
      setHeroSpecialChoices(Array.from({ length: r.icons }, () => 'None'));
      setHeroAttackOpen(false);
      setHeroSpecialOpen(true);
      return;
    }

    // No special choices needed: finalize immediately (no Pierce, no Heavy Blow, etc.)
    finalizeHeroAttack([]);
  };

  const finalizeHeroAttack = (specials: HeroSpecialPick[]) => {
    if (!combat || !activeHero || !derived) return;
    if (!heroAttackIsOpeningVolley && combat.actionsUsed?.hero) return;

    // When called directly (no picker), build a minimal ctx.
    const ctx = heroPendingRef.current ?? {
      roll: null,
      weapon: (derived.equippedWeapons ?? []).find((x: any) => String(x?.name ?? '') === String(heroWeaponName)) ?? null,
      target: combat.enemies.find((e) => String(e.id) === String(heroAttackTargetId)) ?? null,
      tn: Number(combat.enemies.find((e) => String(e.id) === String(heroAttackTargetId))?.parry ?? 0) || 0,
      seized: !!combat.hero.seized,
      wieldMode: heroWieldMode,
      hasShield: !!(derived as any)?.equippedShield,
      strength: Number(activeHero?.attributes?.strength ?? activeHero?.strength ?? 0) || 0,
    };

    const target = ctx.target;
    const w: any = ctx.weapon;
    const r = ctx.roll ?? rollTOR({ dice: 0, tn: ctx.tn, featMode: heroFeatMode, weary: !!activeHero?.conditions?.weary });
    if (!target || !w || !r) {
      heroPendingRef.current = null;
      return;
    }

    const seized = !!ctx.seized;
    const k = profKey(w.combatProficiency ?? w.proficiency ?? w.category);

    // Helper: compute Success dice sum (respecting weary) without relying on r.total.
    const succSum = (r.success ?? []).reduce((a: number, d: any) => {
      const wearyZero = !!activeHero?.conditions?.weary && (d.value === 1 || d.value === 2 || d.value === 3);
      return a + (wearyZero ? 0 : d.value);
    }, 0);

    // Feat number for hero rolls: Eye=0, Gandalf=10 for PB checks.
    const baseFeatNumber = (r.feat.type === 'Number') ? r.feat.value : (r.feat.type === 'Gandalf' ? 10 : 0);

    const picks = (specials ?? []).filter((s) => s && s !== 'None');

    // Special Success choices
    const heavyCount = picks.filter((p) => p === 'HEAVY BLOW').length;
    const fendCount = picks.filter((p) => p === 'FEND OFF').length;
    const pierceCount = picks.filter((p) => p === 'PIERCE').length;
    const thrustCount = picks.filter((p) => p === 'SHIELD THRUST').length;
    const breakFree = picks.includes('BREAK FREE');

    // Apply BREAK FREE first (if Seized)
    const events: any[] = [];
    if (breakFree) {
      events.push({ type: 'SET_HERO_SEIZED', seized: false, reason: 'Broke free from Seize.' });
    }

    // Pierce bonus depends on weapon type.
    const pierceBonusPer = (() => {
      if (seized || k === 'brawling') return 0;
      if (k === 'swords') return 1;
      if (k === 'bows') return 2;
      if (k === 'spears') return 3;
      return 0;
    })();
    const featNumber = Math.min(10, baseFeatNumber + (pierceCount * pierceBonusPer));

    const passed = (r.feat.type === 'Gandalf') ? true : (featNumber + succSum) >= (Number(ctx.tn) || 0);

    // Heavy Blow: +STR endurance loss per icon (+1 extra if 2H)
    const twoHandBonus = (String(ctx.wieldMode) === '2h') ? 1 : 0;
    const heavyExtra = heavyCount ? heavyCount * (Number(ctx.strength ?? 0) + twoHandBonus) : 0;

    const baseDmg = Number(w.damage ?? 0) || 0;
    const dmg = passed ? (baseDmg + heavyExtra) : 0;

    if (passed && dmg > 0) {
      events.push({ type: 'APPLY_ENEMY_ENDURANCE', enemyId: target.id, delta: -dmg, reason: 'Hit', data: { weapon: w.name, heavyCount, strength: ctx.strength, twoHand: ctx.wieldMode } });
    }

    // FEND OFF: modify hero Parry for the round
    if (passed && fendCount) {
      const fendBonus = (() => {
        if (k === 'swords') return 2;
        if (k === 'spears') return 3;
        // axes and all brawling weapons
        return 1;
      })();
      events.push({ type: 'ADD_HERO_PARRY_BONUS', delta: fendBonus * fendCount, reason: `Fend Off: Parry +${fendBonus * fendCount} this round.` });
    }

    // SHIELD THRUST: target loses (1d) for the length of the round (only once per target)
    if (passed && thrustCount) {
      if (ctx.hasShield && (Number(ctx.strength ?? 0) > Number(target.attributeLevel ?? 0))) {
        events.push({ type: 'SET_ENEMY_DICE_PENALTY', enemyId: target.id, penalty: -1, reason: `Shield Thrust: ${target.name} loses (1d) this round.` });
      } else {
        events.push({ type: 'LOG', text: 'Shield Thrust not applied (missing shield or Strength not greater than target Attribute Level).' });
      }
    }

    // Piercing Blow (hero): only if not Brawling/Seized, and only on a successful attack when Feat die reaches 10 or Gandalf.
    const piercingBlow = passed && !seized && k !== 'brawling' && (r.feat.type === 'Gandalf' || featNumber >= 10);
    let piercingLine = '';
    if (piercingBlow) {
      // Injury TN (handle versatile injury values like "12 (1h) / 14 (2h)")
      const injuryRaw = String((w as any)?.injury ?? '0');
      const versMatch = injuryRaw.match(/(\d+)\s*\(1h\)\s*\/\s*(\d+)\s*\(2h\)/i);
      const injuryTN = versMatch ? Number((String(ctx.wieldMode) === '2h' ? versMatch[2] : versMatch[1])) : (Number.parseInt(injuryRaw, 10) || Number((w as any)?.injury ?? 0) || 0);
      const armourDice = Number((target as any)?.armour ?? 0) || 0;
      if (injuryTN > 0) {
        const pr = rollTOR({ dice: armourDice, tn: injuryTN, featMode: 'normal', weary: false });
        const resisted = pr.passed === true;
        piercingLine = `Piercing - ${resisted ? 'RESISTED' : 'NOT RESISTED'} (TN ${injuryTN})`;
        events.push({ type: 'APPLY_ENEMY_WOUND', enemyId: target.id, injuryTN, resisted, data: { weapon: w.name, armourDice } });
      }
    }

    if (!heroAttackIsOpeningVolley) {
      events.push({ type: 'HERO_ACTION_USED', kind: 'attack', data: { weapon: w.name, targetId: target.id, selections: picks } });
    }

    const deg = passed ? (r.icons === 0 ? 'Success' : r.icons === 1 ? 'Great Success' : 'Extraordinary Success') : 'FAIL';
    const selectedTxt = picks.length ? ` • ${picks.join(', ')}` : '';
    const txt = `${w.name} - ${passed ? 'PASS' : 'FAIL'} — ${deg}${piercingBlow ? ' - PIERCING BLOW' : ''} • TN ${ctx.tn}${passed ? ` • Damage ${dmg}` : ''}${selectedTxt}`;
    events.push({ type: 'LOG', text: txt, data: { weapon: w.name, tn: ctx.tn, passed, selections: picks } });
    if (piercingLine) events.push({ type: 'LOG', text: piercingLine, data: { weapon: w.name, targetId: target.id } });

    dispatchMany(events);
    toast(piercingLine ? `${txt}\n${piercingLine}` : txt, passed ? 'success' : 'warning');
    (window as any).__torcLogRollHtml?.(txt);

    heroPendingRef.current = null;
    setHeroSpecialOpen(false);
    setHeroAttackOpen(false);
    if (heroAttackIsOpeningVolley) {
      setOvHeroDone(true);
      setHeroAttackIsOpeningVolley(false);
      setHeroAttackDropItemId(null);
    }
  };

  const beginHeroTask = () => {
    if (!combat || !activeHero || !derived || !stanceTask) return;
    if (combat.actionsUsed?.hero) {
      toast('You already used your main action this round.', 'warning');
      return;
    }
    // Default feat mode to favoured if the underlying skill is favoured.
    const fav = derived.favouredSkillSet?.has?.(stanceTask.skill) ?? false;
    setHeroTaskFeatMode(fav ? 'favoured' : 'normal');
    setHeroTaskWeary(!!activeHero?.conditions?.weary);
    setHeroTaskOpen(true);
  };

  const resolveHeroTask = () => {
    if (!combat || !activeHero || !derived || !stanceTask) return;
    if (combat.actionsUsed?.hero) {
      toast('You already used your main action this round.', 'warning');
      return;
    }

    const tn = (() => {
      if (stanceTask.attr === 'strength') return Number(derived.strengthTN ?? 0) || 0;
      if (stanceTask.attr === 'heart') return Number(derived.heartTN ?? 0) || 0;
      if (stanceTask.attr === 'wits') return Number(derived.witsTN ?? 0) || 0;
      // Gain Ground: use STR TN if Athletics is higher, else WITS TN (simple and player-friendly).
      const a = Number(activeHero?.skillRatings?.athletics ?? 0) || 0;
      const s = Number(activeHero?.skillRatings?.scan ?? 0) || 0;
      return (a >= s) ? (Number(derived.strengthTN ?? 0) || 0) : (Number(derived.witsTN ?? 0) || 0);
    })();

    const dice = (() => {
      if (stanceTask.skill === 'athleticsOrScan') {
        const a = Number(activeHero?.skillRatings?.athletics ?? 0) || 0;
        const s = Number(activeHero?.skillRatings?.scan ?? 0) || 0;
        return Math.max(a, s);
      }
      return Number(activeHero?.skillRatings?.[stanceTask.skill] ?? 0) || 0;
    })();

    const r = rollTOR({ dice, tn, featMode: heroTaskFeatMode, weary: heroTaskWeary });
    const degrees = r.passed ? (r.icons === 0 ? 'Success' : r.icons === 1 ? 'Great Success' : 'Extraordinary Success') : 'FAIL';
    const txt = `${stanceTask.name} - ${r.passed ? 'PASS' : 'FAIL'} — ${degrees} • TN ${tn}`;
    dispatchMany([
      { type: 'HERO_ACTION_USED', kind: 'task', data: { taskId: stanceTask.id, stance: combat.hero.stance } },
      { type: 'LOG', text: txt, data: { taskId: stanceTask.id, tn, passed: r.passed } },
    ]);
    toast(txt, r.passed ? 'success' : 'warning');
    (window as any).__torcLogRollHtml?.(txt);
    setHeroTaskOpen(false);
  };

  const canFreeEscape = combat.hero.stance === 'rearward';
  const canRollEscape = combat.hero.stance === 'defensive' && engagedEnemies.length > 0 && (derived?.equippedWeapons?.length ?? 0) > 0;

  const doFreeEscape = () => {
    if (combat.actionsUsed?.hero) {
      toast('You already used your main action this round.', 'warning');
      return;
    }
    dispatch({ type: 'ATTEMPT_ESCAPE', mode: 'FREE' });
  };

  const doRollEscape = () => {
    if (!activeHero || !derived) return;
    if (combat.actionsUsed?.hero) {
      toast('You already used your main action this round.', 'warning');
      return;
    }
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

      {/* Summary cards */}
      <div className="card" style={{ marginTop: 12 }}>
        <div className="label">Combatants</div>
        <div className="row" style={{ gap: 10, marginTop: 10, overflowX: 'auto', paddingBottom: 6 }}>
          <div className="miniCard" style={{ minWidth: 260 }}>
            <div className="small muted">Hero</div>
            <div style={{ marginTop: 4 }}><b>{activeHero?.name ?? combat.heroId}</b></div>
            <div className="small muted" style={{ marginTop: 4 }}>
              Endurance {Number(activeHero?.endurance?.current ?? 0)}/{Number(activeHero?.endurance?.max ?? activeHero?.endurance?.maximum ?? 0)} • Hope {Number(activeHero?.hope?.current ?? activeHero?.hope ?? 0)}/{Number(activeHero?.hope?.max ?? activeHero?.hopeMax ?? 0)}
            </div>
          </div>

          {(combat.enemies ?? []).map((e) => {
            const hr = e.hateOrResolve?.type === 'Resolve' ? 'Resolve' : (e.hateOrResolve?.type === 'Hate' ? 'Hate' : 'Hate/Resolve');
            const hv = (e.hateOrResolve?.value ?? 0) as any;
            return (
              <div key={e.id} className="miniCard" style={{ minWidth: 220, opacity: (Number(e.endurance?.current ?? 0) || 0) > 0 ? 1 : 0.6 }}>
                <div className="small muted">Enemy</div>
                <div style={{ marginTop: 4 }}><b>{e.name}</b></div>
                <div className="small muted" style={{ marginTop: 4 }}>
                  Endurance {e.endurance?.current ?? 0}/{e.endurance?.max ?? 0} • {hr} {hv}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="label">Choose stance</div>
        <select className="input" value={combat.hero.stance} onChange={(e) => dispatch({ type: 'SET_HERO_STANCE', stance: e.target.value })}>
          {heroStances.map(s => <option key={s} value={s}>{stanceLabel[s]}</option>)}
        </select>

        <div className="small muted" style={{ marginTop: 10 }}>
          Potential targets and required stance:
          <div style={{ marginTop: 6 }}>
            {enemiesAlive.length ? enemiesAlive.map((e) => {
              const pos = (e.position ?? 'melee');
              const req = pos === 'ranged'
                ? (combat.options.striderMode ? 'Rearward or Skirmish' : 'Rearward')
                : 'Forward/Open/Defensive';
              const canEngageNow = (combat.hero.stance !== 'rearward' && combat.hero.stance !== 'skirmish' && String(pos) !== 'ranged');
              return (
                <div key={e.id} className="row" style={{ justifyContent: 'space-between', gap: 10, alignItems: 'center', padding: '2px 0' }}>
                  <div className="small">• {e.name} — {req}</div>
                  {canEngageNow ? (
                    <button
                      className="btn btn-ghost"
                      style={{ padding: '4px 8px' }}
                      onClick={() => {
                        setEngageSelectedIds([String(e.id)]);
                        applyEngagementSelection([String(e.id)]);
                      }}
                    >
                      Engage
                    </button>
                  ) : null}
                </div>
              );
            }) : <div className="small">• (none)</div>}
          </div>
        </div>

      </div>

      {/* Engagement chooser */}
      {engageOpen ? (
        <div className="modalOverlay" onMouseDown={() => setEngageOpen(false)}>
          <div className="modal" style={{ maxWidth: 560 }} onMouseDown={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <div><b>Choose engagement</b></div>
              <button className="btn btn-ghost" onClick={() => setEngageOpen(false)}>Close</button>
            </div>
            <div className="modalBody">
              <div className="small muted">
                Select who you are engaged with this round (max 3 human-sized, max 2 large).
              </div>
              <div className="small muted" style={{ marginTop: 6 }}>
                Selected: {engageCounts.human}/3 human • {engageCounts.large}/2 large
              </div>
              <div style={{ marginTop: 10 }}>
                {engageableEnemies.map((e: any) => {
                  const id = String(e.id);
                  const checked = engageSelectedIds.includes(id);
                  const size = String(e.size ?? 'human');
                  return (
                    <label key={id} className="row" style={{ gap: 10, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #2a2f3a' }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setEngageSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
                        }}
                      />
                      <div style={{ flex: 1 }}>
                        <b>{e.name}</b> <span className="small muted">({size})</span>
                        <div className="small muted">Endurance {e.endurance?.current ?? 0}/{e.endurance?.max ?? 0}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="modalFooter">
              <button className="btn btn-ghost" onClick={() => setEngageSelectedIds([])}>Reset</button>
              <button className="btn" disabled={!engageSelectedIds.length || !engageLimitOk} onClick={() => {
                if (!engageLimitOk) {
                  toast('Engagement limit exceeded (max 3 human, max 2 large).', 'warning');
                  return;
                }
                applyEngagementSelection(engageSelectedIds);
                setEngageOpen(false);
              }}>Confirm</button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="card" style={{ marginTop: 12 }}>
        <div className="label">Engaged with</div>
        {engagedEnemies.length ? (
          <div className="list" style={{ marginTop: 8 }}>
            {engagedEnemies.map(e => (
              <div key={e.id} className="row" style={{ justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #2a2f3a' }}>
                <div>
                  <b>{e.name}</b>
                  <div className="small muted">
                    Parry {e.parry ?? '—'} • Armour {e.armour ?? '—'} • End {e.endurance.current}/{e.endurance.max}
                    {Number(e.wounds ?? 0) > 0 ? ` • Wounds ${Number(e.wounds ?? 0)}/${Math.max(1, Number(e.might ?? 1) || 1)}` : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="small muted" style={{ marginTop: 8 }}>No one (unengaged).</div>
        )}
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="label">Hero actions</div>
        <div className="small muted" style={{ marginTop: 6 }}>
          One main action per round. Choose an attack (like in Sheet) or the Combat Task tied to your stance.
        </div>

        {(() => {
          const allWeapons = (derived?.equippedWeapons ?? []) as any[];
          const seized = !!combat.hero.seized;
          const weapons = seized ? allWeapons.filter((w) => profKey(w.combatProficiency ?? w.proficiency ?? '') === 'brawling') : allWeapons;
          const hasShield = !!(derived as any)?.equippedShield;
          const stance = combat.hero.stance;
          if (!weapons.length) {
            return <div className="small muted" style={{ marginTop: 10 }}>Equip one or more weapons to enable hero attacks.</div>;
          }
          return (
            <div className="list" style={{ marginTop: 10 }}>
              {weapons.map((w) => {
                const usableInStance = canUseWeaponInStance(w, stance, seized);
                const k = profKey(w.combatProficiency ?? w.proficiency ?? w.category);
                const cp = (derived as any)?.combatProficiencies ?? {};
                const baseDice = k ? Number(cp[k] ?? 0) : 0;
                const injuryRaw = String(w.injury ?? '');
                const versMatch = injuryRaw.match(/(\d+)\s*\(1h\)\s*\/\s*(\d+)\s*\(2h\)/i);
                const isVersatile = !!versMatch;
                const mode = wieldByWeaponId[String(w.id)] ?? '1h';
                const modeEffective: '1h'|'2h' = hasShield ? '1h' : (mode as any);

                return (
                  <div key={String(w.id ?? w.name)} className="attackRow">
                    <div className="attackCol1">
                      <div className="attackName"><b>{w.name}</b>{seized ? <span className="small muted"> (Brawling)</span> : null}</div>
                      <div className="attackStats small muted">
                        DMG {w.damage ?? '—'} • INJ {w.injury ?? '—'} • Dice {Math.max(0, seized ? (baseDice - 1) : baseDice)}
                      </div>
                    </div>
                    <div className="attackCol2">
                      <div className="row" style={{ gap: 8, alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        {isVersatile ? (
                          <div className="segRow" title={hasShield ? 'A shield is equipped: forced to 1H' : 'Choose 1H/2H (affects some Special Success effects)'}>
                            <button
                              type="button"
                              className={`seg ${modeEffective === '1h' ? 'active' : ''}`}
                              onClick={() => setWieldByWeaponId((prev) => ({ ...prev, [String(w.id)]: '1h' }))}
                            >1H</button>
                            <button
                              type="button"
                              className={`seg ${modeEffective === '2h' ? 'active' : ''}`}
                              disabled={hasShield}
                              onClick={() => setWieldByWeaponId((prev) => ({ ...prev, [String(w.id)]: '2h' }))}
                            >2H</button>
                          </div>
                        ) : null}

                        <button
                          className="btn"
                          disabled={heroActionUsed || enemiesAlive.length === 0 || !usableInStance}
                          title={!usableInStance ? (stance === 'rearward' || stance === 'skirmish'
                            ? 'Only ranged weapons can be used in Rearward/Skirmish.'
                            : 'Ranged weapons can only be used in Rearward/Skirmish.') : ''}
                          onClick={() => {
                            // keep wield mode in state for Heavy Blow +2H bonus
                            setHeroWieldMode(modeEffective);
                            beginHeroAttack(w);
                          }}
                        >Roll</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}

        <div className="row" style={{ gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          <button className="btn" disabled={heroActionUsed || !stanceTask} onClick={beginHeroTask}>
            {stanceTask ? `Combat Task: ${stanceTask.name}` : 'Combat Task'}
          </button>
        </div>

        {combat.hero.seized ? (
          <div className="small muted" style={{ marginTop: 10 }}>
            Seized: you may only attack using Brawling (best proficiency −1 Success die, no Piercing Blow). You may break free by spending a Special Success icon on a successful attack.
          </div>
        ) : (
          <div className="small muted" style={{ marginTop: 10 }}>
            Targeting uses the enemy Parry TN. Damage is applied to enemy Endurance on a hit.
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="label">Enemy actions</div>
        <div className="small muted" style={{ marginTop: 6 }}>Hero Parry TN: <b>{heroParryTN}</b></div>
        {enemyActionList.length ? (
          <div className="list" style={{ marginTop: 8 }}>
            {enemyActionList.map((e) => {
              const acted = !!combat.actionsUsed?.enemies?.[e.id];
              return (
                <div key={e.id} className="row" style={{ justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #2a2f3a' }}>
                  <div>
                    <b>{e.name}</b>
                    <div className="small muted">End {e.endurance.current}/{e.endurance.max}</div>
                  </div>
                  <button className="btn" disabled={acted} onClick={() => beginEnemyAttack(e.id)}>
                    {acted ? 'Already acted' : 'Attack'}
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="small muted" style={{ marginTop: 8 }}>
            {enemiesAlive.length ? 'Hero is in Rearward: no enemies with ranged weapons can attack.' : 'No enemies left.'}
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="label">Escape</div>
        <div className="small muted" style={{ marginTop: 6 }}>
          Rearward: escape on your turn, no roll. Defensive: make an attack; success lets you leave.
        </div>
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
          <button className="btn" disabled={heroActionUsed || !canFreeEscape} onClick={doFreeEscape}>Escape (Rearward)</button>
          <button className="btn" disabled={heroActionUsed || !canRollEscape} onClick={doRollEscape}>Escape (Defensive roll)</button>
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
              {enemyActionList.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
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
                    <button
                      className="btn"
                      disabled={!enemyAttackWeaponName || (Number(enemy?.endurance?.current ?? 0) <= 0) || !!combat.actionsUsed?.enemies?.[enemyAttackEnemyId]}
                      onClick={startEnemyAttackRoll}
                    >
                      {(Number(enemy?.endurance?.current ?? 0) <= 0) ? 'Defeated' : (combat.actionsUsed?.enemies?.[enemyAttackEnemyId] ? 'Already acted' : 'Roll')}
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      ) : null}

      {/* Hero attack modal */}
      {heroAttackOpen ? (
        <div
          className="modalOverlay"
          style={heroAttackIsOpeningVolley ? { zIndex: 10050 } : undefined}
          onMouseDown={() => setHeroAttackOpen(false)}
        >
          <div className="modal" style={{ maxWidth: 520 }} onMouseDown={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <div><b>Hero Attack</b></div>
              <button className="btn btn-ghost" onClick={() => setHeroAttackOpen(false)}>Close</button>
            </div>

            <div className="label" style={{ marginTop: 10 }}>Target</div>
            <select
              className="input"
              value={heroAttackTargetId}
              onChange={(e) => setHeroAttackTargetId(e.target.value)}
              disabled={!heroAttackTargets.length}
            >
              {heroAttackTargets.map((e: any) => (
                <option key={e.id} value={e.id}>
                  {e.name} (Parry {e.parry ?? '—'}, End {e.endurance.current}/{e.endurance.max})
                </option>
              ))}
            </select>
            {!heroAttackTargets.length ? (
              <div className="small muted" style={{ marginTop: 6 }}>
                No valid targets (you must be engaged in this stance).
              </div>
            ) : null}

            <div className="label" style={{ marginTop: 10 }}>Weapon</div>
            <div className="small">{heroWeaponName || '—'} {heroWieldMode === '2h' ? '(2H)' : '(1H)'}</div>

            <div className="label" style={{ marginTop: 10 }}>Feat die mode</div>
            <select className="input" value={heroFeatMode} onChange={(e) => setHeroFeatMode(e.target.value as any)}>
              <option value="normal">Normal</option>
              <option value="favoured">Favoured</option>
              <option value="illFavoured">Ill-favoured</option>
            </select>

            <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button className="btn" onClick={resolveHeroAttack}>Roll</button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Engagement chooser (melee stances) */}
      {engageOpen ? (
        <div className="modalOverlay" onMouseDown={() => setEngageOpen(false)}>
          <div className="modal" style={{ maxWidth: 520 }} onMouseDown={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <div><b>Choose engagement</b></div>
              <button className="btn btn-ghost" onClick={() => setEngageOpen(false)}>Close</button>
            </div>
            <div className="modalBody">
              <div className="small muted">
                Select enemies to engage this round (max 3 human-sized, max 2 large).
              </div>
              <div style={{ marginTop: 10 }}>
                {engageableEnemies.map((e: any) => {
                  const checked = engageSelectedIds.includes(String(e.id));
                  const size = String(e.size ?? 'human');
                  return (
                    <label key={e.id} className="row" style={{ gap: 10, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #2a2f3a' }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(ev) => {
                          const id = String(e.id);
                          setEngageSelectedIds((prev) => {
                            const has = prev.includes(id);
                            const next = has ? prev.filter((x) => x !== id) : [...prev, id];
                            return next;
                          });
                        }}
                      />
                      <div style={{ flex: 1 }}>
                        <b>{e.name}</b> <span className="small muted">({size})</span>
                      </div>
                      <div className="small muted">End {e.endurance.current}/{e.endurance.max}</div>
                    </label>
                  );
                })}
              </div>
              <div className="small" style={{ marginTop: 10 }}>
                Selected: {engageCounts.human}/3 human • {engageCounts.large}/2 large
              </div>
              {!engageLimitOk ? (
                <div className="small" style={{ marginTop: 6, color: '#ffcc66' }}>
                  Too many selected for this hero.
                </div>
              ) : null}
            </div>
            <div className="modalFooter">
              <button
                className="btn"
                disabled={!engageSelectedIds.length || !engageLimitOk}
                onClick={() => {
                  if (!engageSelectedIds.length || !engageLimitOk) return;
                  applyEngagementSelection(engageSelectedIds);
                  setEngageOpen(false);
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Opening Volleys (pre-combat) */}
      {combat.phase === 'openingVolleys' ? (
        <div className="modalOverlay" onMouseDown={() => { /* block click-through */ }}>
          <div className="modal" style={{ maxWidth: 640 }} onMouseDown={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <div><b>Opening Volley</b> <span className="small muted">(Cycle {ovCycle})</span></div>
              <button className="btn btn-ghost" onClick={() => { /* no close: must Start Combat */ }} disabled>Close</button>
            </div>
            <div className="modalBody">
              <div className="small muted">{ovSummary}</div>

              {(() => {
                const allowHeroOV = !combat.surprise?.heroCaughtOffGuard;
                const allowEnemyOV = !combat.surprise?.enemiesSurprised;
                const rangedEnemies = enemiesAlive.filter((e) => String(e.position ?? 'melee') === 'ranged');

                const isThrowableSpear = (w: any) => {
                  const n = String(w?.name ?? '').toLowerCase();
                  return n === 'spear' || n === 'short spear' || n.includes('short spear') || n === 'spear (short)';
                };
                const isRangedWeapon = (w: any) => {
                  const wt = weaponTypeForEquipment(w);
                  // Ranged-capable = true ranged weapons (bows) + thrown spears.
                  return weaponIsRangedCapable(wt);
                };
                const rangedWeapons = ((derived?.equippedWeapons ?? []) as any[]).filter(isRangedWeapon);

                const rollEnemyVolley = (enemyId: string) => {
                  const en = combat.enemies.find((x) => String(x.id) === String(enemyId));
                  if (!en) return;
                  const profs = Array.isArray(en.combatProficiencies) ? en.combatProficiencies : [];
                  const weapon = profs.find((p) => {
                    const n = String(p.name ?? '').toLowerCase();
                    return n.includes('bow') || n.includes('ranged') || n.includes('sling') || n.includes('javelin');
                  }) ?? profs[0];
                  if (!weapon) return;
                  setEnemyAttackIsOpeningVolley(true);
                  setEnemyAttackEnemyId(en.id);
                  setEnemyAttackWeaponName(weapon.name);
                  const tn = heroParryTN;
                  const r = rollTORAdversary({ dice: Number(weapon.rating ?? 0), featMode: 'normal', weary: false, tn });
                  pendingRef.current = { enemy: en, weapon, roll: r, tn };
                  if ((r.icons ?? 0) > 0) {
                    if (combat.options.enemyAutomation === 'auto') {
                      // reuse the same auto-pick logic in startEnemyAttackRoll
                      const opts = new Set<string>();
                      (weapon.specialDamage ?? []).forEach((s: any) => opts.add(String(s)));
                      const canPierce = opts.has('Pierce') || opts.has('PIERCE');
                      const featBase = (r.feat.type === 'Number') ? r.feat.value : (r.feat.type === 'Eye' ? 10 : 0);
                      const would = canPierce ? Math.min(10, featBase + 2) : featBase;
                      const pierceToPB = canPierce && (featBase < 10) && (would >= 10);
                      const picks: EnemySpecialPick[] = Array.from({ length: r.icons }, () => 'None');
                      if (pierceToPB) picks[0] = 'PIERCE';
                      for (let i = 0; i < picks.length; i++) {
                        if (picks[i] !== 'None') continue;
                        if (opts.has('Heavy Blow') || opts.has('HEAVY BLOW')) picks[i] = 'HEAVY BLOW';
                      }
                      finalizeEnemyAttack(picks);
                      return;
                    }
                    setSpecialChoices(Array.from({ length: r.icons }, () => 'None'));
                    setSpecialPickerOpen(true);
                    return;
                  }
                  finalizeEnemyAttack([]);
                };

                return (
                  <>
                    <div style={{ marginTop: 12 }}>
                      <div className="label">Hero ranged weapon used</div>
                      {!allowHeroOV ? (
                        <div className="small muted">Hero cannot make opening volleys (caught off-guard).</div>
                      ) : !rangedWeapons.length ? (
                        <div className="small muted">No ranged weapons equipped.</div>
                      ) : (
                        <div className="list" style={{ marginTop: 8 }}>
                          {rangedWeapons.map((w) => {
                            const thrown = weaponTypeForEquipment(w) === 'melee_thrown';
                            return (
                              <div key={String(w.id ?? w.name)} className="row" style={{ justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #2a2f3a' }}>
                                <div>
                                  <b>{w.name}</b>{thrown ? <span className="small muted"> (Thrown — Dropped)</span> : null}
                                  <div className="small muted">DMG {w.damage ?? '—'} • INJ {w.injury ?? '—'}</div>
                                </div>
                                <button
                                  className="btn"
                                  disabled={ovHeroDone || enemiesAlive.length === 0}
                                  onClick={() => {
                                    setHeroAttackIsOpeningVolley(true);
                                    setHeroAttackDropItemId(thrown ? String(w.id ?? '') : null);
                                    setHeroAttackTargetId(enemiesAlive[0]?.id ?? '');
                                    setHeroWieldMode('1h');
                                    beginHeroAttack(w);
                                  }}
                                >
                                  {ovHeroDone ? 'Done' : 'Roll'}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {allowHeroOV && rangedWeapons.some((w) => profKey(w?.combatProficiency ?? w?.proficiency ?? w?.category) === 'spears') ? (
                        <div className="small muted" style={{ marginTop: 6 }}>
                          Thrown Short Spear / Spear becomes Dropped automatically.
                        </div>
                      ) : null}
                    </div>

                    <div style={{ marginTop: 14 }}>
                      <div className="label">Enemies</div>
                      {!allowEnemyOV ? (
                        <div className="small muted">Enemies cannot make opening volleys (surprised).</div>
                      ) : rangedEnemies.length === 0 ? (
                        <div className="small muted">No enemies are starting at range.</div>
                      ) : (
                        <div className="list" style={{ marginTop: 8 }}>
                          {rangedEnemies.map((e) => (
                            <div key={e.id} className="row" style={{ justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #2a2f3a' }}>
                              <div>
                                <b>{e.name}</b>
                                <div className="small muted">End {e.endurance.current}/{e.endurance.max}</div>
                              </div>
                              <button
                                className="btn"
                                disabled={!!ovEnemyDone[String(e.id)]}
                                onClick={() => rollEnemyVolley(e.id)}
                              >
                                {ovEnemyDone[String(e.id)] ? 'Done' : 'Roll'}
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>

            <div className="modalFooter" style={{ justifyContent: 'space-between' }}>
              <button className="btn btn-ghost" onClick={() => { setOvCycle((c) => c + 1); setOvHeroDone(false); }}>
                One more
              </button>
              <button className="btn" onClick={() => dispatch({ type: 'COMPLETE_OPENING_VOLLEYS' })}>
                Start Combat
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Hero task modal */}
      {heroTaskOpen && stanceTask ? (
        <div className="modalOverlay" onMouseDown={() => setHeroTaskOpen(false)}>
          <div className="modal" style={{ maxWidth: 520 }} onMouseDown={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <div><b>{stanceTask.name}</b></div>
              <button className="btn btn-ghost" onClick={() => setHeroTaskOpen(false)}>Close</button>
            </div>
            <div className="small muted" style={{ marginTop: 8 }}>
              This is the stance-specific Combat Task. One main action per round.
            </div>

            <div className="label" style={{ marginTop: 10 }}>Feat die mode</div>
            <select className="input" value={heroTaskFeatMode} onChange={(e) => setHeroTaskFeatMode(e.target.value as any)}>
              <option value="normal">Normal</option>
              <option value="favoured">Favoured</option>
              <option value="illFavoured">Ill-favoured</option>
            </select>

            <label className={"toggle " + (heroTaskWeary ? 'on' : '')} style={{ marginTop: 10, display: 'inline-flex' }}>
              <input type="checkbox" checked={heroTaskWeary} onChange={(e) => setHeroTaskWeary(e.target.checked)} /> Weary
            </label>

            <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button className="btn" onClick={resolveHeroTask}>Roll</button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Hero Special Success picker */}
      {heroSpecialOpen ? (
        <div
          className="modalOverlay"
          style={combat?.phase === 'openingVolleys' ? { zIndex: 10070 } : undefined}
          onMouseDown={() => setHeroSpecialOpen(false)}
        >
          <div className="modal" style={{ maxWidth: 520 }} onMouseDown={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <div><b>Special Success</b></div>
              <button className="btn btn-ghost" onClick={() => setHeroSpecialOpen(false)}>Close</button>
            </div>

            {(() => {
              const ctx = heroPendingRef.current;
              const w = ctx?.weapon;
              const t = ctx?.target;
              const r = ctx?.roll;
              const seized = !!ctx?.seized;
              const k = profKey(w?.combatProficiency ?? w?.proficiency ?? w?.category);
              const featBase = (r?.feat?.type === 'Number') ? r.feat.value : (r?.feat?.type === 'Gandalf' ? 10 : 0);
              const pierceBonusPer = (!seized && k === 'swords') ? 1 : (!seized && k === 'bows') ? 2 : (!seized && k === 'spears') ? 3 : 0;
              const pierceWould = pierceBonusPer ? Math.min(10, featBase + pierceBonusPer) : featBase;

              const options: HeroSpecialPick[] = ['None', 'HEAVY BLOW', 'FEND OFF'];
              if (!seized && k !== 'brawling' && (k === 'swords' || k === 'bows' || k === 'spears')) options.push('PIERCE');
              if (ctx?.hasShield && Number(ctx?.strength ?? 0) > Number(t?.attributeLevel ?? 0)) options.push('SHIELD THRUST');
              if (seized) options.push('BREAK FREE');

              return (
                <>
                  <div className="small muted" style={{ marginTop: 8 }}>
                    1 choice per Success icon (duplicates allowed). Heavy Blow/Fend Off/Pierce/Shield Thrust follow the core rules.
                  </div>
                  <div className="small" style={{ marginTop: 10 }}>
                    <b>Weapon:</b> {w?.name ?? '—'} {String(ctx?.wieldMode) === '2h' ? '(2H)' : '(1H)'}
                  </div>
                  {pierceBonusPer ? (
                    <div className="small muted" style={{ marginTop: 6 }}>
                      Feat die: <b>{featBase}</b> — With Pierce (+{pierceBonusPer}): <b>{pierceWould}</b>
                    </div>
                  ) : null}

                  <div style={{ marginTop: 10 }}>
                    {heroSpecialChoices.map((v, idx) => (
                      <div key={idx} className="row" style={{ gap: 8, marginBottom: 8, alignItems: 'center' }}>
                        <div className="small" style={{ width: 90 }}>Icon {idx + 1}</div>
                        <select className="input" value={v} onChange={(e) => {
                          const next = heroSpecialChoices.slice();
                          next[idx] = e.target.value as HeroSpecialPick;
                          setHeroSpecialChoices(next);
                        }} style={{ flex: 1 }}>
                          {options.map((op) => (
                            <option key={op} value={op}>{op}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>

                  <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #2a2f3a' }}>
                    <div className="label">Options selected</div>
                    {heroSpecialChoices.filter((x) => x && x !== 'None').length ? (
                      <ul style={{ margin: '8px 0 0 18px' }}>
                        {heroSpecialChoices.filter((x) => x && x !== 'None').map((x, i) => (
                          <li key={`${x}-${i}`} className="small">{x}</li>
                        ))}
                      </ul>
                    ) : (
                      <div className="small muted" style={{ marginTop: 6 }}>None selected yet.</div>
                    )}
                  </div>

                  <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                    <button className="btn btn-ghost" onClick={() => setHeroSpecialChoices(Array.from({ length: heroSpecialChoices.length }, () => 'None'))}>Reset</button>
                    <button className="btn" onClick={() => finalizeHeroAttack(heroSpecialChoices)}>Apply</button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      ) : null}

      {/* Special success picker */}
      {specialPickerOpen ? (
        <div
          className="modalOverlay"
          style={combat?.phase === 'openingVolleys' ? { zIndex: 10060 } : undefined}
          onMouseDown={() => setSpecialPickerOpen(false)}
        >
          <div className="modal" style={{ maxWidth: 520 }} onMouseDown={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <div><b>Special Success</b></div>
              <button className="btn btn-ghost" onClick={() => setSpecialPickerOpen(false)}>Close</button>
            </div>
            {(() => {
              const ctx = pendingRef.current;
              const weapon = ctx?.weapon;
              const r = ctx?.roll;
              const opts = new Set<string>();
              opts.add('None');
              opts.add('HEAVY BLOW');
              if (weapon?.specialDamage?.includes('Break Shield')) opts.add('BREAK SHIELD');
              if (weapon?.specialDamage?.includes('Pierce')) opts.add('PIERCE');
              if (weapon?.specialDamage?.includes('Seize')) opts.add('SEIZE');
              const list = Array.from(opts) as EnemySpecialPick[];

              const featBase = (r?.feat?.type === 'Number') ? r.feat.value : (r?.feat?.type === 'Eye' ? 10 : 0);
              const featPierce = opts.has('PIERCE') ? Math.min(10, featBase + 2) : featBase;

              return (
                <> 
                  <div className="small muted" style={{ marginTop: 8 }}>1 choice per success icon (duplicates allowed).</div>
                  {opts.has('PIERCE') ? (
                    <div className="small muted" style={{ marginTop: 6 }}>
                      Actual Feat die result: <b>{featBase}</b> — With Pierce: <b>{featPierce}</b>
                    </div>
                  ) : null}
                  <div style={{ marginTop: 10 }}>
                    {specialChoices.map((v, idx) => (
                      <div key={idx} className="row" style={{ gap: 8, marginBottom: 8, alignItems: 'center' }}>
                        <div className="small" style={{ width: 90 }}>Icon {idx + 1}</div>
                        <select className="input" value={v} onChange={(e) => {
                          const next = specialChoices.slice();
                          next[idx] = e.target.value as EnemySpecialPick;
                          setSpecialChoices(next);
                        }} style={{ flex: 1 }}>
                          {list.map(op => <option key={op} value={op}>{op}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}

            {/* Selected summary + reset */}
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #2a2f3a' }}>
              <div className="label">Options selected</div>
              {specialChoices.filter((x) => x && x !== 'None').length ? (
                <ul style={{ margin: '8px 0 0 18px' }}>
                  {specialChoices.filter((x) => x && x !== 'None').map((x, i) => (
                    <li key={`${x}-${i}`} className="small">{x}</li>
                  ))}
                </ul>
              ) : (
                <div className="small muted" style={{ marginTop: 6 }}>None selected yet.</div>
              )}
            </div>

            <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button
                className="btn btn-ghost"
                onClick={() => setSpecialChoices(Array.from({ length: specialChoices.length }, () => 'None'))}
              >
                Reset
              </button>
              <button className="btn" onClick={() => finalizeEnemyAttack(specialChoices)}>Apply</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
