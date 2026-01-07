import { CombatEnemy, EngagementState, Stance } from './types';

export function emptyEngagement(): EngagementState {
  return { heroToEnemies: {}, enemyToHeroes: {} };
}

export function maxHeroesPerEnemy(enemy: CombatEnemy): number {
  // Core rule: up to 3 heroes can engage a human-sized enemy, up to 6 for a large foe.
  return enemy.size === 'large' ? 6 : 3;
}

export function autoEngage(params: {
  heroId: string;
  heroStance: Stance;
  enemies: CombatEnemy[];
}): EngagementState {
  const { heroId, heroStance, enemies } = params;
  const out = emptyEngagement();

  // Ranged stances do not auto-engage.
  if (heroStance === 'rearward' || heroStance === 'skirmish') {
    out.heroToEnemies[heroId] = [];
    for (const e of enemies) out.enemyToHeroes[e.id] = [];
    return out;
  }

  // If there are no enemies, keep empty.
  if (!enemies.length) {
    out.heroToEnemies[heroId] = [];
    return out;
  }

  // Solo default: engage the first eligible enemy.
  const target = enemies[0];
  out.heroToEnemies[heroId] = [target.id];
  for (const e of enemies) out.enemyToHeroes[e.id] = e.id === target.id ? [heroId] : [];
  // NOTE: for multi-hero combat later, expand this with a deterministic distribution.
  return out;
}

export function validateEngagement(params: {
  engagement: EngagementState;
  enemies: CombatEnemy[];
}): { ok: boolean; errors: string[] } {
  const { engagement, enemies } = params;
  const errors: string[] = [];
  const enemyById = new Map(enemies.map(e => [e.id, e] as const));

  for (const [enemyId, heroIds] of Object.entries(engagement.enemyToHeroes ?? {})) {
    const e = enemyById.get(enemyId);
    if (!e) continue;
    const max = maxHeroesPerEnemy(e);
    if ((heroIds?.length ?? 0) > max) {
      errors.push(`Too many heroes engaging ${e.name} (max ${max}).`);
    }
  }

  return { ok: errors.length === 0, errors };
}
