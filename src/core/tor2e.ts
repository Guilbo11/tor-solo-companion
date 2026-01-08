import { compendiums, findEntryById } from './compendiums';

export type Tor2eDerived = {
  strengthTN: number;
  heartTN: number;
  witsTN: number;
  loadTotal: number;
  protectionPiercingBonus?: number;
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

export function tnFromRating(rating: number, tnBase: number = 20) {
  return tnBase - clamp(rating, 1, 10);
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

export type WeaponType = 'melee' | 'ranged' | 'melee_thrown' | 'brawling';

export function weaponTypeForEquipment(equipEntry: any): WeaponType | null {
  if (!equipEntry || equipEntry.category !== 'Weapon') return null;
  const wt = String((equipEntry as any).weaponType ?? '').trim().toLowerCase();
  if (wt === 'melee' || wt === 'ranged' || wt === 'melee_thrown' || wt === 'brawling') return wt as WeaponType;

  // Backward-compatible inference for older compendiums
  const notes = String(equipEntry.notes ?? '').toLowerCase();
  const prof = String(equipEntry.proficiency ?? '').toLowerCase();
  if (notes.includes('ranged weapon') || prof === 'bows') return 'ranged';
  if (notes.includes('can be thrown')) return 'melee_thrown';
  if (notes.includes('brawling')) return 'brawling';
  if (prof === 'brawling') return 'brawling';
  return 'melee';
}

export function weaponIsRangedCapable(wt: WeaponType | null): boolean {
  return wt === 'ranged' || wt === 'melee_thrown';
}

export function computeDerived(hero: any, tnBase: number = 20): Tor2eDerived {
  const strength = hero?.attributes?.strength ?? 2;
  const heart = hero?.attributes?.heart ?? 2;
  const wits = hero?.attributes?.wits ?? 2;

  let strengthTN = tnFromRating(strength, tnBase);
  let heartTN = tnFromRating(heart, tnBase);
  let witsTN = tnFromRating(wits, tnBase);

  // Prowess virtue: reduce one Attribute TN by 1.
  const p = String(hero?.prowessAttribute ?? '').toLowerCase();
  if (p === 'strength') strengthTN -= 1;
  if (p === 'heart') heartTN -= 1;
  if (p === 'wits') witsTN -= 1;

  // Favoured skills: culture pick + calling picks + legacy (union)
  const fav = new Set<string>();
  if (hero?.cultureFavouredSkillId) fav.add(String(hero.cultureFavouredSkillId));
  for (const id of (hero?.callingFavouredSkillIds ?? [])) fav.add(String(id));
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
    if (it?.ref?.pack === 'tor2e-equipment' && it?.ref?.id) {
      const base = findEntryById(equipment, it.ref.id);
      if (!base) return null;
      const o = (it as any)?.override ?? {};
      const rewardNameFor = (rid: string) => {
        const id = String(rid);
        switch (id) {
          case 'keen-weapon': return 'Keen';
          case 'fell-weapon': return 'Fell';
          case 'grievous-weapon': return 'Grievous';
          case 'cunning-make': return 'Cunning Make';
          case 'close-fitting': return 'Close-fitting';
          case 'reinforced-shield': return 'Reinforced';
          default: return id;
        }
      };
      // Apply lightweight overrides (used for Rewards attached to items)
      const merged: any = { ...base };
      if (typeof o.loadDelta === 'number') merged.load = Number(merged.load ?? 0) + Number(o.loadDelta);
      if (typeof o.damageDelta === 'number') merged.damage = Number(merged.damage ?? 0) + Number(o.damageDelta);
      if (typeof o.protectionDelta === 'number') {
        // Protection is stored as dice string (e.g. '3d') in compendium.
        // Preserve the dice format when possible.
        const curVal = (merged as any).protection;
        if (typeof curVal === 'number') {
          (merged as any).protection = curVal + Number(o.protectionDelta);
        } else if (typeof curVal === 'string') {
          const m = curVal.trim().match(/^(\d+)d$/i);
          if (m) {
            const next = Math.max(0, Number(m[1]) + Number(o.protectionDelta));
            (merged as any).protection = `${next}d`;
          }
        }
      }
      if (typeof o.parryModifierDelta === 'number') {
        const cur = (merged as any).parryModifier;
        if (typeof cur === 'number') {
          (merged as any).parryModifier = cur + Number(o.parryModifierDelta);
        } else if (typeof cur === 'string') {
          const m = cur.trim().match(/^([+-]?)(\d+)$/);
          if (m) {
            const sign = m[1] === '-' ? -1 : 1;
            const n = sign * Number(m[2]);
            const next = n + Number(o.parryModifierDelta);
            (merged as any).parryModifier = next >= 0 ? `+${next}` : String(next);
          }
        } else {
          (merged as any).parryModifier = Number(o.parryModifierDelta);
        }
      }
      if (typeof o.piercingThreshold === 'number') (merged as any).piercingThreshold = Number(o.piercingThreshold);
      if (typeof o.injuryOverride === 'string' && o.injuryOverride.trim()) (merged as any).injury = o.injuryOverride.trim();
      if (typeof o.notesAppend === 'string' && o.notesAppend.trim()) {
        merged.notes = String(merged.notes ?? '').trim();
        merged.notes = merged.notes ? (merged.notes + ' • ' + o.notesAppend.trim()) : o.notesAppend.trim();
      }

      // Display: append reward names to the item name.
      if (Array.isArray(o.rewards) && o.rewards.length) {
        const rewards = o.rewards.map(rewardNameFor).filter(Boolean);
        const weaponOrder = ['Keen', 'Fell', 'Grievous'];
        const isWeapon = String(merged.category ?? '') === 'Weapon';
        const ordered = isWeapon
          ? [...weaponOrder.filter(r=>rewards.includes(r)), ...rewards.filter(r=>!weaponOrder.includes(r)).sort()]
          : rewards.sort();
        const suffix = ordered.join(', ');
        merged.name = `${String(merged.name ?? base.name)} (${suffix})`;
      }
      return merged;
    }
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

  // Parry base varies by culture (derived stats in the book).
  // Prefer compendium value if present, otherwise fall back to the known defaults.
  const cultureParryBonus = (culture as any)?.derived?.parryBonus ?? (
    {
      'bardings': 12,
      'dwarves-of-durins-folk': 10,
      'elves-of-lindon': 12,
      'hobbits-of-the-shire': 12,
      'men-of-bree': 10,
      'rangers-of-the-north': 14,
    } as Record<string, number>
  )[String(cultureId ?? '')] ?? 12;
  const nimbleness = Array.isArray(hero?.virtueIds) && hero.virtueIds.includes('nimbleness');
  const parryBase = typeof hero?.parry?.base === 'number'
    ? hero.parry.base
    : (wits + cultureParryBonus + (nimbleness ? 1 : 0));

  const parryOther = typeof hero?.parry?.other === 'number' ? hero.parry.other : 0;
  const parryShield = equippedShield ? parseParryModifier(equippedShield.parryModifier) : 0;
  const parryTotal = parryBase + parryShield + parryOther;

  const protArmour = equippedArmour ? parseProtectionDice(equippedArmour.protection) : 0;
  const protHelm = equippedHelm ? parseProtectionDice(equippedHelm.protection) : 0;
  const protOther = typeof hero?.protectionOther === 'number' ? hero.protectionOther : 0;
  const protTotal = protArmour + protHelm + protOther;

  // Load total: sum all inventory items not dropped, applying Reward overrides.
  // Dwarves: armour + helm (but not shields) count as half Load (round up), applied to the sum of those items.
  const isDwarf = String(hero?.cultureId ?? '') === 'dwarves-of-durins-folk';
  let otherLoad = 0;
  let armourLoad = 0;
  for (const it of inv) {
    if (it?.dropped) continue;
    const qty = typeof it?.qty === 'number' ? it.qty : 1;
    let l = typeof it?.load === 'number' ? it.load : 0;
    let cat = '';
    if (it?.ref?.pack === 'tor2e-equipment' && it?.ref?.id) {
      const e: any = findEntryById(equipment, it.ref.id);
      cat = String(e?.category ?? '');
      if (typeof it?.load !== 'number') {
        l = typeof e?.load === 'number' ? e.load : 0;
        const o = (it as any)?.override ?? {};
        if (typeof o.loadDelta === 'number') l = l + Number(o.loadDelta);
      }
    }
    const add = l * qty;
    if (isDwarf && (cat === 'Armour' || cat === 'Headgear')) armourLoad += add;
    else otherLoad += add;
  }
  let loadTotal = otherLoad + (isDwarf ? Math.ceil(armourLoad / 2) : armourLoad);

  // Carried treasure adds directly to Load (separate from equipment items).
  loadTotal += Number((hero as any)?.carriedTreasure ?? 0) || 0;

  // Close-fitting: +2 to PROTECTION roll vs Piercing Blow (if equipped on armour/helm)
  let protectionPiercingBonus = 0;
  for (const it of invEquipped) {
    if (protectionPiercingBonus) break;
    if (it?.ref?.pack !== 'tor2e-equipment') continue;
    const e: any = findEntryById(equipment, it.ref.id);
    const cat = String(e?.category ?? '');
    if (cat !== 'Armour' && cat !== 'Headgear') continue;
    const o = (it as any)?.override ?? {};
    const rewards = Array.isArray(o.rewards) ? o.rewards.map(String) : [];
    if (rewards.includes('close-fitting')) protectionPiercingBonus = 2;
    if (typeof o.protectionPiercingBonus === 'number') protectionPiercingBonus = Math.max(protectionPiercingBonus, Number(o.protectionPiercingBonus));
  }

  return {
    strengthTN,
    heartTN,
    witsTN,
    loadTotal,
    protectionPiercingBonus,
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


export function rollName(cultureIdOrName?: string, gender: 'Masculine'|'Feminine'|'Other' = 'Other'): string {
  // Prefer bundled (user-provided) name lists from the Culture compendium when available.
  let culture: any = null;
  if (cultureIdOrName) {
    culture = findEntryById(compendiums.cultures.entries ?? [], cultureIdOrName);
    if (!culture) {
      const needle = String(cultureIdOrName).toLowerCase();
      culture = (compendiums.cultures.entries ?? []).find((c: any) => String(c?.name ?? '').toLowerCase() === needle) ?? null;
    }
  }
  const names = culture?.names;
  const male: string[] = Array.isArray(names?.male) ? names.male : [];
  const female: string[] = Array.isArray(names?.female) ? names.female : [];
  const pool = gender === 'Masculine' ? male : gender === 'Feminine' ? female : [...male, ...female];
  if (pool.length > 0) return pool[Math.floor(Math.random() * pool.length)];
  return rollNameFallback(cultureIdOrName);
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