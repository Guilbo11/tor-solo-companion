export type FeatDie = { type: 'Number'; value: number } | { type: 'Eye' } | { type: 'Gandalf' };
export type SuccessDie = { value: 1|2|3|4|5|6; icon: boolean };

export type RollOptions = {
  dice: number;          // number of success dice
  favoured?: boolean;    // roll 2 feat dice keep best
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

export function rollSuccessDie(): SuccessDie {
  const v = randInt(1, 6) as 1|2|3|4|5|6;
  return { value: v, icon: v === 6 };
}

export function rollTOR(opts: RollOptions): RollResult {
  const featA = rollFeatDie();
  const featB = opts.favoured ? rollFeatDie() : undefined;
  const feat = featB && featDieRank(featB) > featDieRank(featA) ? featB : featA;

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
