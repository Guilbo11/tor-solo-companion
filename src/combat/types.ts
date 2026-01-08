export type Stance = 'forward' | 'open' | 'defensive' | 'rearward' | 'skirmish';

export type EnemySize = 'human' | 'large';

export type CombatantId = string;

export type EngagementState = {
  heroToEnemies: Record<CombatantId, CombatantId[]>;
  enemyToHeroes: Record<CombatantId, CombatantId[]>;
};

export type CombatOptions = {
  striderMode: boolean;
  enemyAutomation: 'manual' | 'manualWithSuggestions' | 'auto';
};

export type CombatPhase =
  | 'setup'
  | 'openingVolleys'
  | 'roundStart'
  | 'engagement'
  | 'heroTurn'
  | 'enemyTurn'
  | 'followup'
  | 'roundEnd'
  | 'combatEnd';

export type CombatEnemy = {
  id: string;
  name: string;
  size: EnemySize;
  endurance: { max: number; current: number };
  might: number;
  attributeLevel: number;
  /** Current battlefield position for targeting/engagement (melee vs ranged). */
  position?: 'melee' | 'ranged';
  parry?: number;
  armour?: number;
  /** Wounds suffered from Piercing Blows. When wounds >= Might, the adversary is slain outright. */
  wounds?: number;
  hateOrResolve?: { type: 'Hate' | 'Resolve'; value: number };
  combatProficiencies?: Array<{ name: string; rating: number; damage: number; injury: number; specialDamage?: string[] }>;
  distinctiveFeatures?: string[];
};

export type CombatLogEntry = { id: string; at: string; text: string; data?: any };

export type CombatState = {
  id: string;
  campaignId: string;
  heroId: string;

  phase: CombatPhase;
  round: number;

  // Range handling can be expanded later; for now we track close vs not.
  distance: 'far' | 'near' | 'close';

  hero: {
    stance: Stance;
    // Engagement is computed at the round's engagement step.
    /** If Seized, the hero can only make Brawling attacks (best proficiency -1 Success die) and cannot trigger Piercing Blow. */
    seized?: boolean;
  };

  /** Ambush / surprise effects that last for the first Close Quarters Round only. */
  surprise?: {
    /** If true, the hero was caught off-guard and cannot make opening volleys nor take actions in Round 1. */
    heroCaughtOffGuard?: boolean;
    /** If true, enemies were surprised and cannot make opening volleys; they also lose (1d) on all combat rolls in Round 1. */
    enemiesSurprised?: boolean;
  };

  /** Temporary, round-scoped modifiers produced by special success choices (eg. Fend Off, Shield Thrust). */
  roundMods?: {
    heroParryBonus?: number;
    /** Enemy id -> dice penalty (negative) to apply to their rolls this round (eg. Shield Thrust). */
    enemyDicePenalty?: Record<string, number>;
  };

  enemies: CombatEnemy[];
  engagement: EngagementState;

  options: CombatOptions;

  log: CombatLogEntry[];

  // One main action per combatant, per round.
  actionsUsed: {
    hero: boolean;
    enemies: Record<string, boolean>; // enemyId -> used
  };
};

export type CombatEvent =
  | { type: 'START_COMBAT'; campaignId: string; heroId: string; enemies: CombatEnemy[]; options: CombatOptions; surprise?: CombatState['surprise'] }
  | { type: 'COMPLETE_OPENING_VOLLEYS' }
  | { type: 'END_COMBAT'; reason: string }
  | { type: 'ROUND_BEGIN' }
  | { type: 'SET_HERO_STANCE'; stance: Stance }
  | { type: 'AUTO_ENGAGE' }
  | { type: 'SET_ENGAGEMENT'; engagement: EngagementState }
  | { type: 'ATTEMPT_ESCAPE'; mode: 'FREE' | 'ROLL'; rollPassed?: boolean }
  | { type: 'HERO_ACTION_USED'; kind: 'attack' | 'task' | 'escape'; data?: any }
  | { type: 'ENEMY_ACTION_USED'; enemyId: string; kind: 'attack' | 'other'; data?: any }
  | { type: 'APPLY_ENEMY_ENDURANCE'; enemyId: string; delta: number; reason?: string; data?: any }
  | { type: 'APPLY_ENEMY_WOUND'; enemyId: string; injuryTN: number; resisted: boolean; data?: any }
  | { type: 'ADD_HERO_PARRY_BONUS'; delta: number; reason?: string; data?: any }
  | { type: 'SET_ENEMY_DICE_PENALTY'; enemyId: string; penalty: number; reason?: string; data?: any }
  | { type: 'SET_ENEMY_POSITION'; enemyId: string; position: 'melee' | 'ranged'; reason?: string; data?: any }
  | { type: 'SET_HERO_SEIZED'; seized: boolean; reason?: string; data?: any }
  | { type: 'LOG'; text: string; data?: any };
