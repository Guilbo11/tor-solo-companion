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
  switch (event.type) {
    case 'START_COMBAT': {
      const id = createCombatId();
      const s: CombatState = {
        id,
        campaignId: event.campaignId,
        heroId: event.heroId,
        phase: 'roundStart',
        round: 1,
        distance: 'close',
        hero: { stance: 'open' },
        enemies: event.enemies,
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

    case 'AUTO_ENGAGE': {
      if (!state) return null;
      const engagement = autoEngage({ heroId: state.heroId, heroStance: state.hero.stance, enemies: state.enemies });
      return {
        ...state,
        engagement,
        phase: 'heroTurn',
        log: [...state.log, { id: uid('log'), at: nowIso(), text: 'Engagement set.' }],
      };
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
        const cur = Number(e.endurance?.current ?? 0) || 0;
        const max = Number(e.endurance?.max ?? 0) || 0;
        const nextCur = Math.max(0, Math.min(max, cur + Number(event.delta ?? 0)));
        return { ...e, endurance: { max, current: nextCur } };
      });
      const target = state.enemies.find((e) => String(e.id) === String(event.enemyId));
      const label = target?.name ?? 'Enemy';
      const reason = event.reason ? ` (${event.reason})` : '';
      return {
        ...state,
        enemies: nextEnemies,
        log: [...state.log, { id: uid('log'), at: nowIso(), text: `${label} Endurance ${event.delta >= 0 ? '+' : ''}${event.delta}${reason}.`, data: event.data }],
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
