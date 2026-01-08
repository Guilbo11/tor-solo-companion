import { autoEngage, emptyEngagement } from './engagement';
import { CombatEvent, CombatState } from './types';

function nowIso(): string {
  return new Date().toISOString();
}

function uid(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function createCombatId(): string {
  return uid('combat');
}

export function combatReducer(state: CombatState | null, event: CombatEvent): CombatState | null {
  const pruneDefeated = (s: CombatState): CombatState => {
    const aliveIds = new Set(s.enemies.filter((e) => (Number(e.endurance?.current ?? 0) || 0) > 0).map((e) => String(e.id)));
    const heroToEnemies = { ...(s.engagement.heroToEnemies ?? {}) };
    const enemyToHeroes = { ...(s.engagement.enemyToHeroes ?? {}) };
    for (const hid of Object.keys(heroToEnemies)) {
      heroToEnemies[hid] = (heroToEnemies[hid] ?? []).filter((eid) => aliveIds.has(String(eid)));
    }
    for (const eid of Object.keys(enemyToHeroes)) {
      if (!aliveIds.has(String(eid))) delete enemyToHeroes[eid];
      else enemyToHeroes[eid] = (enemyToHeroes[eid] ?? []).filter((hid) => String(hid) === String(s.heroId));
    }
    return { ...s, engagement: { heroToEnemies, enemyToHeroes } };
  };

  switch (event.type) {
    case 'START_COMBAT': {
      const id = createCombatId();
      // Normalise enemies (ensure endurance current/max exist and wounds counter starts at 0).
      const enemies = (event.enemies ?? []).map((e) => {
        const max = Number((e as any)?.endurance?.max ?? (e as any)?.endurance ?? 0) || 0;
        const cur = Number((e as any)?.endurance?.current ?? max) || 0;
        return {
          ...e,
          endurance: { max, current: Math.max(0, Math.min(max, cur)) },
          wounds: Number((e as any)?.wounds ?? 0) || 0,
        };
      });
      const s: CombatState = {
        id,
        campaignId: event.campaignId,
        heroId: event.heroId,
        phase: 'roundStart',
        round: 1,
        distance: 'close',
        hero: { stance: 'open' },
        roundMods: { heroParryBonus: 0, enemyDicePenalty: {} },
        enemies,
        engagement: emptyEngagement(),
        options: event.options,
        log: [{ id: uid('log'), at: nowIso(), text: 'Combat started.' }],
        actionsUsed: { hero: false, enemies: {} },
      };
      return s;
    }

    case 'END_COMBAT': {
      if (!state) return null;
      return {
        ...state,
        phase: 'combatEnd',
        log: [...state.log, { id: uid('log'), at: nowIso(), text: `Combat ended: ${event.reason}` }],
      };
    }

    case 'ROUND_BEGIN': {
      if (!state) return null;
      return {
        ...state,
        round: state.round + 1,
        phase: 'roundStart',
        engagement: emptyEngagement(),
        roundMods: { heroParryBonus: 0, enemyDicePenalty: {} },
        actionsUsed: { hero: false, enemies: {} },
        log: [...state.log, { id: uid('log'), at: nowIso(), text: `Round ${state.round + 1} begins.` }],
      };
    }

    case 'SET_HERO_STANCE': {
      if (!state) return null;
      return {
        ...state,
        hero: { ...state.hero, stance: event.stance },
        phase: 'engagement',
        log: [...state.log, { id: uid('log'), at: nowIso(), text: `Hero stance: ${event.stance}.` }],
      };
    }

    case 'SET_HERO_SEIZED': {
      if (!state) return null;
      return {
        ...state,
        hero: { ...state.hero, seized: event.seized },
        log: event.reason ? [...state.log, { id: uid('log'), at: nowIso(), text: event.reason, data: event.data }] : state.log,
      };
    }

    case 'ADD_HERO_PARRY_BONUS': {
      if (!state) return null;
      const prev = Number(state.roundMods?.heroParryBonus ?? 0) || 0;
      return {
        ...state,
        roundMods: { ...(state.roundMods ?? {}), heroParryBonus: prev + (Number(event.delta ?? 0) || 0), enemyDicePenalty: { ...(state.roundMods?.enemyDicePenalty ?? {}) } },
        log: event.reason ? [...state.log, { id: uid('log'), at: nowIso(), text: event.reason, data: event.data }] : state.log,
      };
    }

    case 'SET_ENEMY_DICE_PENALTY': {
      if (!state) return null;
      const cur = { ...(state.roundMods?.enemyDicePenalty ?? {}) };
      cur[String(event.enemyId)] = Number(event.penalty ?? 0) || 0;
      return {
        ...state,
        roundMods: { ...(state.roundMods ?? {}), heroParryBonus: Number(state.roundMods?.heroParryBonus ?? 0) || 0, enemyDicePenalty: cur },
        log: event.reason ? [...state.log, { id: uid('log'), at: nowIso(), text: event.reason, data: event.data }] : state.log,
      };
    }

    case 'AUTO_ENGAGE': {
      if (!state) return null;
      const engagement = autoEngage({ heroId: state.heroId, heroStance: state.hero.stance, enemies: state.enemies });
      return pruneDefeated({
        ...state,
        engagement,
        phase: 'heroTurn',
        log: [...state.log, { id: uid('log'), at: nowIso(), text: 'Engagement set.' }],
      });
    }

    case 'SET_ENGAGEMENT': {
      if (!state) return null;
      return {
        ...state,
        engagement: event.engagement,
        phase: 'heroTurn',
        log: [...state.log, { id: uid('log'), at: nowIso(), text: 'Engagement updated.' }],
      };
    }

    case 'ATTEMPT_ESCAPE': {
      if (!state) return null;
      // Escape rules:
      // - FREE: Rearward stance escape when your turn comes (no roll)
      // - ROLL: Defensive stance escape on successful attack roll (no damage), fail -> remain engaged
      if (event.mode === 'FREE') {
        return {
          ...state,
          phase: 'combatEnd',
          actionsUsed: { ...state.actionsUsed, hero: true },
          log: [...state.log, { id: uid('log'), at: nowIso(), text: 'Escaped combat (Rearward stance).' }],
        };
      }

      const passed = !!event.rollPassed;
      if (!passed) {
        return {
          ...state,
          actionsUsed: { ...state.actionsUsed, hero: true },
          log: [...state.log, { id: uid('log'), at: nowIso(), text: 'Escape attempt failed (remains engaged).' }],
        };
      }

      return {
        ...state,
        phase: 'combatEnd',
        actionsUsed: { ...state.actionsUsed, hero: true },
        log: [...state.log, { id: uid('log'), at: nowIso(), text: 'Escaped combat (Defensive stance success).' }],
      };
    }

    case 'HERO_ACTION_USED': {
      if (!state) return null;
      return {
        ...state,
        actionsUsed: { ...state.actionsUsed, hero: true },
        log: event.kind ? [...state.log, { id: uid('log'), at: nowIso(), text: `Hero action: ${event.kind}.`, data: event.data }] : state.log,
      };
    }

    case 'ENEMY_ACTION_USED': {
      if (!state) return null;
      return {
        ...state,
        actionsUsed: {
          ...state.actionsUsed,
          enemies: { ...(state.actionsUsed?.enemies ?? {}), [event.enemyId]: true },
        },
        log: [...state.log, { id: uid('log'), at: nowIso(), text: `Enemy action (${event.enemyId}): ${event.kind}.`, data: event.data }],
      };
    }

    case 'APPLY_ENEMY_ENDURANCE': {
      if (!state) return null;
      const nextEnemies = state.enemies.map((e) => {
        if (String(e.id) !== String(event.enemyId)) return e;
        const max = Number((e as any)?.endurance?.max ?? (e as any)?.endurance ?? 0) || 0;
        const cur = Number((e as any)?.endurance?.current ?? max) || 0;
        const nextCur = Math.max(0, Math.min(max, cur + Number(event.delta ?? 0)));
        return { ...e, endurance: { max, current: nextCur } };
      });
      const target = state.enemies.find((e) => String(e.id) === String(event.enemyId));
      const label = target?.name ?? 'Enemy';
      const reason = event.reason ? ` (${event.reason})` : '';
      return {
        ...pruneDefeated({ ...state, enemies: nextEnemies }),
        log: [...state.log, { id: uid('log'), at: nowIso(), text: `${label} Endurance ${event.delta >= 0 ? '+' : ''}${event.delta}${reason}.`, data: event.data }],
      };
    }

    case 'APPLY_ENEMY_WOUND': {
      if (!state) return null;
      const target = state.enemies.find((e) => String(e.id) === String(event.enemyId));
      const label = target?.name ?? 'Enemy';
      const resisted = !!event.resisted;
      const prevWounds = Number((target as any)?.wounds ?? 0) || 0;
      const might = Math.max(1, Number((target as any)?.might ?? 1) || 1);

      // Core: Might indicates the number of Wounds required to slay a foe outright.
      // If not resisted: increment wounds; if wounds >= might -> defeated (Endurance 0).
      const nextEnemies = state.enemies.map((e) => {
        if (String(e.id) !== String(event.enemyId)) return e;
        if (resisted) return e;
        const max = Number((e as any)?.endurance?.max ?? (e as any)?.endurance ?? 0) || 0;
        const cur = Number((e as any)?.endurance?.current ?? max) || 0;
        const wPrev = Number((e as any)?.wounds ?? 0) || 0;
        const wNext = wPrev + 1;
        const slain = wNext >= Math.max(1, Number((e as any)?.might ?? 1) || 1);
        return {
          ...e,
          wounds: wNext,
          endurance: { max, current: slain ? 0 : cur },
        };
      });

      const msg = resisted
        ? `${label} resists the Piercing Blow (TN ${event.injuryTN}).`
        : `${label} suffers a Wound (TN ${event.injuryTN}) — Wounds ${prevWounds + 1}/${might}${prevWounds + 1 >= might ? ' — slain!' : ''}`;

      return {
        ...pruneDefeated({ ...state, enemies: nextEnemies }),
        log: [...state.log, { id: uid('log'), at: nowIso(), text: msg, data: event.data }],
      };
    }

    case 'LOG': {
      if (!state) return null;
      return { ...state, log: [...state.log, { id: uid('log'), at: nowIso(), text: event.text, data: event.data }] };
    }

    default:
      return state;
  }
}
