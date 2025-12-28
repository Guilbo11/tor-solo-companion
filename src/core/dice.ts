export type FeatDie = { type: 'Number'; value: number } | { type: 'Eye' } | { type: 'Gandalf' };
export type SuccessDie = { value: 1|2|3|4|5|6; icon: boolean };

export type RollOptions = {
  dice: number;          // number of success dice
  // Feat die mode:
  // - normal: roll 1 feat die
  // - favoured: roll 2 feat dice, keep best (Gandalf best, Eye worst)
  // - illFavoured: roll 2 feat dice, keep worst (Eye worst, Gandalf best)
  featMode?: 'normal' | 'favoured' | 'illFavoured';
  // Back-compat (older UI): favoured -> featMode='favoured'
  favoured?: boolean;
  weary?: boolean;       // (prototype) if weary, 1-3 success dice count as 0
  tn?: number;           // optional target number for success/fail
};

export type RollResult = {
  feat: FeatDie;
  feat2?: FeatDie;
  success: SuccessDie[];
  total: number;
  icons: number;
  isAutomaticSuccess: boolean; // Gandalf rune
  isEye: boolean;
  passed?: boolean;
  degrees?: 'Success'|'Great Success'|'Extraordinary Success';
};

/**
 * Formats a TOR 2e roll in the same style used by the UI/journal.
 * Example: "Axes - PASS — Great Success. Feat 10 (also 10), Success 4, 6(★) (1 ★) Total 20 (TN 15)."
 */
export function formatTorRoll(r: RollResult, opts?: { label?: string; tn?: number }): string {
  const label = String(opts?.label ?? '').trim();
  const tn = typeof opts?.tn === 'number' ? opts?.tn : undefined;

  const featTxt = r.feat.type === 'Number' ? String(r.feat.value) : (r.feat.type === 'Eye' ? 'Sauron' : 'Gandalf');
  const feat2Txt = r.feat2 ? (r.feat2.type === 'Number' ? String(r.feat2.value) : (r.feat2.type === 'Eye' ? 'Sauron' : 'Gandalf')) : '';
  const succList = r.success.map((d:any)=> (d.icon ? `6(★)` : String(d.value))).join(', ');
  const starTxt = r.icons ? ` (${r.icons} ★)` : '';

  let prefix = '';
  if (typeof r.passed === 'boolean' && typeof tn === 'number') {
    if (r.passed) {
      prefix = `PASS${r.degrees ? ` — ${r.degrees}` : ''}. `;
    } else {
      prefix = 'FAIL. ';
    }
  }
  const tnTxt = typeof tn === 'number' ? ` (TN ${tn})` : '';
  const body = `${prefix}Feat ${featTxt}${feat2Txt ? ` (also ${feat2Txt})` : ''}, Success ${succList || '—'}${starTxt} Total ${r.total}${tnTxt}.`;
  return label ? `${label} - ${body}` : body;
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function rollFeatDie(): FeatDie {
  const r = randInt(1, 12);
  if (r === 11) return { type: 'Eye' };
  if (r === 12) return { type: 'Gandalf' };
  // Map 1-10 straightforwardly
  return { type: 'Number', value: r };
}

export function featDieValue(d: FeatDie): number {
  if (d.type === 'Eye') return 0;
  if (d.type === 'Gandalf') return 0;
  return d.value;
}

export function featDieRank(d: FeatDie): number {
  // For choosing "best" on favoured rolls.
  // Eye is worst, Numbers next, Gandalf rune best.
  if (d.type === 'Eye') return 0;
  if (d.type === 'Number') return d.value;
  return 999;
}

export function pickFeatDie(a: FeatDie, b: FeatDie, mode: 'favoured'|'illFavoured'): FeatDie {
  const ra = featDieRank(a);
  const rb = featDieRank(b);
  if (mode === 'favoured') return rb > ra ? b : a;
  // illFavoured
  return rb < ra ? b : a;
}

export function rollSuccessDie(): SuccessDie {
  const v = randInt(1, 6) as 1|2|3|4|5|6;
  return { value: v, icon: v === 6 };
}

export function rollTOR(opts: RollOptions): RollResult {
  const mode: 'normal'|'favoured'|'illFavoured' = opts.featMode ?? (opts.favoured ? 'favoured' : 'normal');
  const featA = rollFeatDie();
  const featB = (mode === 'favoured' || mode === 'illFavoured') ? rollFeatDie() : undefined;
  const feat = featB ? pickFeatDie(featA, featB, mode === 'favoured' ? 'favoured' : 'illFavoured') : featA;

  const success: SuccessDie[] = Array.from({ length: Math.max(0, opts.dice) }, () => rollSuccessDie());
  let icons = success.reduce((a, d) => a + (d.icon ? 1 : 0), 0);

  const successSum = success.reduce((a, d) => {
    const wearyZero = !!opts.weary && (d.value === 1 || d.value === 2 || d.value === 3);
    return a + (wearyZero ? 0 : d.value);
  }, 0);

  const total = featDieValue(feat) + successSum;
  const isAutomaticSuccess = feat.type === 'Gandalf';
  const isEye = feat.type === 'Eye';

  let passed: boolean | undefined = undefined;
  if (typeof opts.tn === 'number') {
    passed = isAutomaticSuccess ? true : total >= opts.tn;
  }

  let degrees: RollResult['degrees'] = undefined;
  if (passed === true || (passed === undefined && isAutomaticSuccess)) {
    if (icons === 0) degrees = 'Success';
    else if (icons === 1) degrees = 'Great Success';
    else degrees = 'Extraordinary Success';
  }

  return { feat, feat2: featB, success, total, icons, isAutomaticSuccess, isEye, passed, degrees };
}
