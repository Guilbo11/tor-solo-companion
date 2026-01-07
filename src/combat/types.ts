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
  parry?: number;
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
  };

  enemies: CombatEnemy[];
  engagement: EngagementState;

  options: CombatOptions;

  log: CombatLogEntry[];
};

export type CombatEvent =
  | { type: 'START_COMBAT'; campaignId: string; heroId: string; enemies: CombatEnemy[]; options: CombatOptions }
  | { type: 'END_COMBAT'; reason: string }
  | { type: 'ROUND_BEGIN' }
  | { type: 'SET_HERO_STANCE'; stance: Stance }
  | { type: 'AUTO_ENGAGE' }
  | { type: 'SET_ENGAGEMENT'; engagement: EngagementState }
  | { type: 'ATTEMPT_ESCAPE'; mode: 'FREE' | 'ROLL'; rollPassed?: boolean }
  | { type: 'LOG'; text: string; data?: any };
