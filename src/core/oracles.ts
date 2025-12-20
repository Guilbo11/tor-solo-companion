import { Likelihood, OracleTable, OracleState } from './storage';

export function weightedPick(entries: { text: string; weight?: number }[]): string {
  if (!entries.length) return '(empty table)';
  const weights = entries.map(e => Math.max(0, e.weight ?? 1));
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return entries[0]!.text;
  let r = Math.random() * total;
  for (let i = 0; i < entries.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return entries[i]!.text;
  }
  return entries[entries.length - 1]!.text;
}

/**
 * Strider Mode — Telling Table (YES is the positive result)
 *
 * Roll a Feat Die:
 * - Gandalf: Always YES, with an extreme result or twist
 * - Sauron: Always NO, with an extreme result or twist
 * - Otherwise (1..10): YES if roll >= threshold
 *
 * Thresholds:
 * - Certain:      1+
 * - Likely:       4+
 * - Middling:     6+  -> mapped to Possible
 * - Doubtful:     8+  -> mapped to Unlikely
 * - Unthinkable:  10  -> mapped to Very Unlikely
 */
const TELLING_THRESHOLDS: Record<Likelihood, number> = {
  Certain: 1,
  Likely: 4,
  Possible: 6,
  Unlikely: 8,
  'Very Unlikely': 10,
};

function rollFeatDie(): string {
  // Feat die has special faces + 1..10 results
  const faces = ['sauron', 'gandalf', '1','2','3','4','5','6','7','8','9','10'];
  return faces[Math.floor(Math.random() * faces.length)];
}

// Ask the oracle using Strider Mode Telling Table.
// Note: `state` is unused now (kept for signature compatibility).
export function askOracle(
  state: OracleState,
  likelihood: Likelihood
): { feat: string; answer: 'Yes' | 'No'; twist: boolean } {
  void state; // keep parameter for compatibility, avoid TS unused warnings if enabled

  const feat = rollFeatDie();

  if (feat === 'gandalf') return { feat, answer: 'Yes', twist: true };
  if (feat === 'sauron') return { feat, answer: 'No', twist: true };

  const n = Number(feat); // 1..10
  const threshold = TELLING_THRESHOLDS[likelihood] ?? 6;

  const answer: 'Yes' | 'No' = n >= threshold ? 'Yes' : 'No';
  return { feat, answer, twist: false };
}

export function findTable(state: OracleState, id: string): OracleTable | undefined {
  return state.tables.find(t => t.id === id);
}

export function makeId(prefix: string): string {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}
