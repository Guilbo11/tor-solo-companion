import { compendiums, findEntryById } from './compendiums';

export type Tor2eDerived = {
  strengthTN: number;
  heartTN: number;
  witsTN: number;
  loadTotal: number;
  parry: { base: number; shield: number; other: number; total: number };
  protection: { armour: number; helm: number; other: number; total: number };
  favouredSkillSet: Set<string>;
  combatProficiencies: { axes: number; bows: number; spears: number; swords: number };
  equippedWeapons: any[];
  equippedArmour?: any;
  equippedHelm?: any;
  equippedShield?: any;
};

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export function tnFromRating(rating: number) {
  return 20 - clamp(rating, 1, 10);
}

export function parseProtectionDice(value: any): number {
  // Examples in compendium: "1d", "3d", "+1d", "—"
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return 0;
  const v = value.trim();
  if (!v || v === '—' || v === '-') return 0;
  const m = v.match(/([+-]?)(\d+)d/i);
  if (!m) return 0;
  const sign = m[1] === '-' ? -1 : 1;
  return sign * Number(m[2]);
}

export function parseParryModifier(value: any): number {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return 0;
  const v = value.trim();
  const m = v.match(/([+-]?)(\d+)/);
  if (!m) return 0;
  const sign = m[1] === '-' ? -1 : 1;
  return sign * Number(m[2]);
}

export function computeDerived(hero: any): Tor2eDerived {
  const strength = hero?.attributes?.strength ?? 2;
  const heart = hero?.attributes?.heart ?? 2;
  const wits = hero?.attributes?.wits ?? 2;

  const strengthTN = tnFromRating(strength);
  const heartTN = tnFromRating(heart);
  const witsTN = tnFromRating(wits);

  // Favoured skills: new array + legacy map (union)
  const fav = new Set<string>();
  for (const id of (hero?.favouredSkillIds ?? [])) fav.add(String(id));
  const legacy = hero?.skillFavoured ?? {};
  for (const [k, v] of Object.entries(legacy)) if (v) fav.add(String(k));

  // Combat proficiencies: from culture default OR hero override
  const baseProfs = { axes: 0, bows: 0, spears: 0, swords: 0 };
  const cultureId = hero?.cultureId;
  const culture: any = cultureId ? findEntryById(compendiums.cultures.entries ?? [], cultureId) : null;
  if (culture?.combatProficiencies?.length) {
    // culture combatProficiencies is an array like: { or: ["Bows","Swords"], rating: 2 }
    // If multiple options exist, we can't choose automatically without UX; we leave hero values if present,
    // otherwise we apply rating to the first listed option as a sensible default.
    for (const block of culture.combatProficiencies) {
      const rating = Number(block?.rating ?? 0);
      const options: string[] = Array.isArray(block?.or) ? block.or : [];
      if (!options.length || !rating) continue;
      const first = String(options[0]).toLowerCase();
      if (first.includes('axe')) baseProfs.axes = Math.max(baseProfs.axes, rating);
      if (first.includes('bow')) baseProfs.bows = Math.max(baseProfs.bows, rating);
      if (first.includes('spear')) baseProfs.spears = Math.max(baseProfs.spears, rating);
      if (first.includes('sword')) baseProfs.swords = Math.max(baseProfs.swords, rating);
    }
  }
  const heroProfs = hero?.combatProficiencies ?? {};
  const combatProficiencies = {
    axes: typeof heroProfs.axes === 'number' ? heroProfs.axes : baseProfs.axes,
    bows: typeof heroProfs.bows === 'number' ? heroProfs.bows : baseProfs.bows,
    spears: typeof heroProfs.spears === 'number' ? heroProfs.spears : baseProfs.spears,
    swords: typeof heroProfs.swords === 'number' ? heroProfs.swords : baseProfs.swords,
  };

  // Equipped items can be driven by inventory flags (preferred) or legacy "equipped" slots.
  const inv = Array.isArray(hero?.inventory) ? hero.inventory : [];
  const equipment = compendiums.equipment.entries ?? [];
  const resolveEquipRef = (it: any) => {
    if (it?.ref?.pack === 'tor2e-equipment' && it?.ref?.id) return findEntryById(equipment, it.ref.id);
    return null;
  };

  const invEquipped = inv.filter((it: any) => !!it?.equipped && !it?.dropped);
  const invWeapons = invEquipped.map(resolveEquipRef).filter((e: any) => e?.category === 'Weapon');
  const invArmour = invEquipped.map(resolveEquipRef).find((e: any) => e?.category === 'Armour') ?? null;
  const invHelm = invEquipped.map(resolveEquipRef).find((e: any) => e?.category === 'Headgear') ?? null;
  const invShield = invEquipped.map(resolveEquipRef).find((e: any) => e?.category === 'Shield') ?? null;

  const eq = hero?.equipped ?? {};
  const legacyWeapon: any = eq.weaponId ? findEntryById(equipment, eq.weaponId) : null;
  const legacyArmour: any = eq.armourId ? findEntryById(equipment, eq.armourId) : null;
  const legacyHelm: any = eq.helmId ? findEntryById(equipment, eq.helmId) : null;
  const legacyShield: any = eq.shieldId ? findEntryById(equipment, eq.shieldId) : null;

  const equippedWeapons = invWeapons.length ? invWeapons : (legacyWeapon ? [legacyWeapon] : []);
  const equippedArmour = invArmour ?? legacyArmour;
  const equippedHelm = invHelm ?? legacyHelm;
  const equippedShield = invShield ?? legacyShield;

  const parryBase = typeof hero?.parry?.base === 'number' ? hero.parry.base : 0;
  const parryOther = typeof hero?.parry?.other === 'number' ? hero.parry.other : 0;
  const parryShield = equippedShield ? parseParryModifier(equippedShield.parryModifier) : 0;
  const parryTotal = parryBase + parryShield + parryOther;

  const protArmour = equippedArmour ? parseProtectionDice(equippedArmour.protection) : 0;
  const protHelm = equippedHelm ? parseProtectionDice(equippedHelm.protection) : 0;
  const protOther = typeof hero?.protectionOther === 'number' ? hero.protectionOther : 0;
  const protTotal = protArmour + protHelm + protOther;

  // Load total: sum all inventory items not dropped, using manual load override when present.
  let loadTotal = 0;
  for (const it of inv) {
    if (it?.dropped) continue;
    const qty = typeof it?.qty === 'number' ? it.qty : 1;
    let l = typeof it?.load === 'number' ? it.load : 0;
    if (typeof it?.load !== 'number' && it?.ref?.pack === 'tor2e-equipment' && it?.ref?.id) {
      const e: any = findEntryById(equipment, it.ref.id);
      l = typeof e?.load === 'number' ? e.load : 0;
    }
    loadTotal += l * qty;
  }

  return {
    strengthTN,
    heartTN,
    witsTN,
    loadTotal,
    parry: { base: parryBase, shield: parryShield, other: parryOther, total: parryTotal },
    protection: { armour: protArmour, helm: protHelm, other: protOther, total: protTotal },
    favouredSkillSet: fav,
    combatProficiencies,
    equippedWeapons,
    equippedArmour: equippedArmour ?? undefined,
    equippedHelm: equippedHelm ?? undefined,
    equippedShield: equippedShield ?? undefined,
  };
}

export function rollNameFallback(cultureIdOrName?: string): string {
  // Prefer bundled (user-provided) name lists from the Culture compendium when available.
  // Falls back to a lightweight fantasy generator if a culture has no names.
  let culture: any = null;

  if (cultureIdOrName) {
    // Try id match first, then name match
    culture = findEntryById(compendiums.cultures.entries ?? [], cultureIdOrName);
    if (!culture) {
      const needle = String(cultureIdOrName).toLowerCase();
      culture = (compendiums.cultures.entries ?? []).find((c: any) => String(c?.name ?? '').toLowerCase() === needle) ?? null;
    }
  }

  const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

  const male: string[] = Array.isArray(culture?.names?.male) ? culture.names.male : [];
  const female: string[] = Array.isArray(culture?.names?.female) ? culture.names.female : [];
  const family: string[] = Array.isArray(culture?.names?.family) ? culture.names.family : [];

  const givenPool = [...male, ...female].filter(Boolean);
  if (givenPool.length) {
    const given = pick(givenPool);
    const surname = family.length ? pick(family) : '';
    return (given + (surname ? ' ' + surname : '')).trim();
  }

  // --- fallback generator (non-canon) ---
  const consonants = ['b','d','f','g','h','k','l','m','n','p','r','s','t','v','w','y','z','th','br','dr','gr','kh','st','sh'];
  const vowels = ['a','e','i','o','u','ae','ia','ei','ou'];
  const tail = ['','n','r','s','th','d','l','m'];
  const c = String(cultureIdOrName ?? '').toLowerCase();
  const syllables = c.includes('elf') ? 3 : c.includes('dwarf') ? 2 : 2;
  let name = '';
  for (let i=0;i<syllables;i++) name += pick(consonants) + pick(vowels);
  name += pick(tail);
  name = name.charAt(0).toUpperCase() + name.slice(1);
  return name;
}

