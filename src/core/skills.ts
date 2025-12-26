import { tnFromRating } from './tor2e';

export type SkillAttribute = 'Strength' | 'Heart' | 'Wits';

// Canon TOR 2e mapping (per user-provided table)
// Left column = Strength, center = Heart, right column = Wits.
export const SKILL_ATTRIBUTE: Record<string, SkillAttribute> = {
  // Personality
  awe: 'Strength',
  enhearten: 'Heart',
  persuade: 'Wits',
  // Movement
  athletics: 'Strength',
  travel: 'Heart',
  stealth: 'Wits',
  // Perception
  awareness: 'Strength',
  insight: 'Heart',
  scan: 'Wits',
  // Survival
  hunting: 'Strength',
  healing: 'Heart',
  explore: 'Wits',
  // Custom
  song: 'Strength',
  courtesy: 'Heart',
  riddle: 'Wits',
  // Vocation
  craft: 'Strength',
  battle: 'Heart',
  lore: 'Wits',
};

export function getSkillAttribute(skillId: string): SkillAttribute {
  return SKILL_ATTRIBUTE[String(skillId).toLowerCase()] ?? 'Wits';
}

export function getAttributeRating(hero: any, attr: SkillAttribute): number {
  const a = hero?.attributes ?? {};
  if (attr === 'Strength') return Number(a.strength ?? 2);
  if (attr === 'Heart') return Number(a.heart ?? 2);
  return Number(a.wits ?? 2);
}

export function getSkillTN(hero: any, skillId: string, tnBase: number = 20): number {
  const attr = getSkillAttribute(skillId);
  const rating = getAttributeRating(hero, attr);
  let tn = tnFromRating(rating, tnBase);
  // Prowess virtue: reduce one Attribute TN by 1.
  const p = String(hero?.prowessAttribute ?? '').toLowerCase();
  if ((p === 'strength' && attr === 'Strength') || (p === 'heart' && attr === 'Heart') || (p === 'wits' && attr === 'Wits')) {
    tn -= 1;
  }
  return tn;
}
