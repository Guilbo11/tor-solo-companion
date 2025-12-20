
export type CompendiumPack<T> = { pack: string; type: string; version: number; entries: T[] };

export type SkillGroup = 'Personality'|'Movement'|'Perception'|'Survival'|'Custom'|'Vocation';
export type AttributeName = 'Strength'|'Heart'|'Wits';

export type SkillEntry = {
  id: string;
  name: string;
  group: SkillGroup;
  attribute: AttributeName;
  description?: string;
  flavor?: string;
};

export type FeatureEntry = {
  id: string;
  name: string;
  group: 'Distinctive Features';
  description?: string;
  flavor?: string;
};

export type CallingEntry = {
  id: string;
  name: string;
  group: 'Callings';
  description?: string;
  flavor?: string;
  favouredSkills?: string[];
  additionalFeature?: string|null;
  shadowPath?: string|null;
};

export type CultureEntry = {
  id: string;
  name: string;
  group: 'Cultures';
  description?: string;
  flavor?: string;
  culturalBlessing?: string|null;
  standardOfLiving?: string|null;
  attributeSets?: { strength:number; heart:number; wits:number; label?:string }[];
  derived?: { enduranceBase?: number|null; hopeBase?: number|null; parryBase?: number|null } | null;
  startingSkills?: Record<string, number>;
  favouredSkillChoices?: string[]; // skill names (UPPERCASE) that are candidates
  combatProficienciesText?: string;
  suggestedFeatures?: string[];
  languages?: string[];
  typicalNames?: { male?: string[]; female?: string[]; family?: string[] } | null;
};

export type PatronEntry = {
  id: string;
  name: string;
  group: 'Patrons';
  description?: string;
};

import skillsPack from '../compendiums/tor2e-skills.json';
import featuresPack from '../compendiums/tor2e-features.json';
import culturesPack from '../compendiums/tor2e-cultures.json';
import callingsPack from '../compendiums/tor2e-callings.json';
import patronsPack from '../compendiums/tor2e-patrons.json';

export const Skills = skillsPack as CompendiumPack<SkillEntry>;
export const Features = featuresPack as CompendiumPack<FeatureEntry>;
export const Cultures = culturesPack as CompendiumPack<CultureEntry>;
export const Callings = callingsPack as CompendiumPack<CallingEntry>;
export const Patrons = patronsPack as CompendiumPack<PatronEntry>;

export function findById<T extends {id:string}>(pack: CompendiumPack<T>, id: string): T | undefined {
  return pack.entries.find(e => e.id === id);
}

export function sortByName<T extends {name:string}>(arr: T[]): T[] {
  return [...arr].sort((a,b)=>a.name.localeCompare(b.name));
}
