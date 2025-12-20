import React, { useMemo, useState } from 'react';
import { rollTOR, RollResult } from '../core/dice';

export default function DicePanel() {
  const [dice, setDice] = useState(2);
  const [fav, setFav] = useState(false);
  const [weary, setWeary] = useState(false);
  const [tn, setTn] = useState<number | ''>('');
  const [res, setRes] = useState<RollResult | null>(null);

  const summary = useMemo(() => {
    if (!res) return null;
    const feat = res.feat.type === 'Number' ? `${res.feat.value}` : res.feat.type;
    const s = res.success.map(d => (d.icon ? `6(★)` : String(d.value))).join(', ');
    const passed = typeof res.passed === 'boolean' ? (res.passed ? 'PASS' : 'FAIL') : '';
    const degree = res.degrees ? ` — ${res.degrees}` : '';
    return `Feat: ${feat} | Success: [${s}] | Icons: ${res.icons} | Total: ${res.total} ${passed}${degree}`;
  }, [res]);

  return (
    <div className="card">
      <div className="h2">Dice Roller</div>
      <div className="row">
        <div className="col">
          <label className="small muted">Success dice</label>
          <input className="input" type="number" min={0} max={6} value={dice} onChange={e => setDice(parseInt(e.target.value || '0', 10))} />
        </div>
        <div className="col">
          <label className="small muted">Target Number (optional)</label>
          <input className="input" type="number" value={tn} onChange={e => setTn(e.target.value === '' ? '' : parseInt(e.target.value, 10))} placeholder="e.g. 14" />
        </div>
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <label className="row" style={{ alignItems: 'center' }}>
          <input type="checkbox" checked={fav} onChange={e => setFav(e.target.checked)} />
          <span style={{ marginLeft: 8 }}>Favoured (roll 2 Feat dice, keep best)</span>
        </label>

        <label className="row" style={{ alignItems: 'center' }}>
          <input type="checkbox" checked={weary} onChange={e => setWeary(e.target.checked)} />
          <span style={{ marginLeft: 8 }}>Weary (prototype: Success dice 1–3 count as 0)</span>
        </label>
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn" onClick={() => setRes(rollTOR({ dice, favoured: fav, weary, tn: tn === '' ? undefined : tn }))}>Roll</button>
      </div>

      <hr />
      {res ? (
        <>
          <div className="badge">Result</div>
          <pre style={{ marginTop: 10 }}>{summary}</pre>
          <div className="small muted">
            Note: Gandalf rune = automatic success; Eye = Feat die counts as 0. (See core rules action resolution section.) 
          </div>
        </>
      ) : (
        <div className="muted">Make a roll to see details.</div>
      )}
    </div>
  );
}
