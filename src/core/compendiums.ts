export type CompendiumEntry = {
  id: string;
  name: string;
  group?: string;
  description?: string;
  flavor?: string;
  [k: string]: any;
};

export type Compendium<T extends string = string> = {
  pack: T;
  type: string;
  version: number;
  entries: CompendiumEntry[];
};

import skillsJson from '../compendiums/tor2e-skills.json';
import featuresJson from '../compendiums/tor2e-features.json';
import culturesJson from '../compendiums/tor2e-cultures.json';
import callingsJson from '../compendiums/tor2e-callings.json';
import virtuesJson from '../compendiums/tor2e-virtues.json';
import rewardsJson from '../compendiums/tor2e-rewards.json';
import equipmentJson from '../compendiums/tor2e-equipment.json';

export const compendiums = {
  skills: skillsJson as unknown as Compendium<'tor2e-skills'>,
  features: featuresJson as unknown as Compendium<'tor2e-features'>,
  cultures: culturesJson as unknown as Compendium<'tor2e-cultures'>,
  callings: callingsJson as unknown as Compendium<'tor2e-callings'>,
  virtues: virtuesJson as unknown as Compendium<'tor2e-virtues'>,
  rewards: rewardsJson as unknown as Compendium<'tor2e-rewards'>,
  equipment: equipmentJson as unknown as Compendium<'tor2e-equipment'>,
};

export function findEntryById(list: CompendiumEntry[], id?: string) {
  if (!id) return undefined;
  return list.find(e => e.id === id);
}

export function sortByName<T extends CompendiumEntry>(entries: T[]): T[] {
  return [...entries].sort((a,b) => a.name.localeCompare(b.name));
}
