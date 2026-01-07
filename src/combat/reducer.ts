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
          log: [...state.log, { id: uid('log'), at: nowIso(), text: 'Escaped combat (Rearward stance).' }],
        };
      }

      const passed = !!event.rollPassed;
      if (!passed) {
        return {
          ...state,
          log: [...state.log, { id: uid('log'), at: nowIso(), text: 'Escape attempt failed (remains engaged).' }],
        };
      }

      return {
        ...state,
        phase: 'combatEnd',
        log: [...state.log, { id: uid('log'), at: nowIso(), text: 'Escaped combat (Defensive stance success).' }],
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
