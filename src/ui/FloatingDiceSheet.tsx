import React, { useMemo, useState } from 'react';
import BottomSheet from './BottomSheet';
import { rollTOR, RollResult } from '../core/dice';

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function FloatingDiceSheet({ open, onClose }: Props) {
  const [dice, setDice] = useState(2);
  const [featMode, setFeatMode] = useState<'normal'|'favoured'|'illFavoured'>('normal');
  const [weary, setWeary] = useState(false);
  const [tn, setTn] = useState<number | ''>('');
  const [res, setRes] = useState<RollResult | null>(null);
  const [animating, setAnimating] = useState(false);

  const canRoll = dice > 0 || true; // feat die is always rolled in TOR here

  const summary = useMemo(() => {
    if (!res) return null;

    const feat = res.feat.type === 'Number' ? `${res.feat.value}` : (res.feat.type === 'Eye' ? 'Sauron' : 'Gandalf');
    const feat2 = res.feat2
      ? (res.feat2.type === 'Number' ? `${res.feat2.value}` : (res.feat2.type === 'Eye' ? 'Sauron' : 'Gandalf'))
      : null;

    const s = res.success.map(d => (d.icon ? `6(★)` : String(d.value))).join(', ');
    const passed = typeof res.passed === 'boolean' ? (res.passed ? 'PASS' : 'FAIL') : '';
    const degree = res.degrees ? ` — ${res.degrees}` : '';
    const icons = res.icons ? ` (${res.icons} ★)` : '';

    return {
      feat,
      feat2,
      success: s || '—',
      total: res.total,
      passed: passed ? `${passed}${degree}` : '',
      icons,
    };
  }, [res]);

  const doRoll = () => {
    if (!canRoll) return;
    setAnimating(true);

    const r = rollTOR({
      dice,
      featMode,
      weary,
      tn: typeof tn === 'number' ? tn : undefined,
    });

    setRes(r);
    window.setTimeout(() => setAnimating(false), 750);
  };

  return (
    <BottomSheet open={open} title="Quick Roll" onClose={onClose}>
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="h2">Build Roll</div>

        <div className="row">
          <div className="col">
            <label className="small muted">Success dice</label>
            <input
              className="input"
              type="number"
              min={0}
              max={12}
              value={dice}
              onChange={(e) => setDice(parseInt(e.target.value || '0', 10))}
            />
          </div>

          <div className="col">
            <label className="small muted">Target Number (optional)</label>
            <input
              className="input"
              type="number"
              value={tn}
              onChange={(e) => setTn(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
              placeholder="e.g. 14"
            />
          </div>
        </div>

        <div className="row" style={{ marginTop: 10, gap: 10, flexWrap: 'wrap' }}>
          <div className="col" style={{minWidth: 220}}>
            <label className="small muted">Feat die mode</label>
            <select className="input" value={featMode} onChange={(e)=>setFeatMode(e.target.value as any)}>
              <option value="normal">Normal (1 Feat die)</option>
              <option value="favoured">Favoured (2 Feat dice, keep best)</option>
              <option value="illFavoured">Ill-favoured (2 Feat dice, keep worst)</option>
            </select>
          </div>

          <label className="row" style={{ gap: 8, alignSelf: 'end' }}>
            <input type="checkbox" checked={weary} onChange={(e) => setWeary(e.target.checked)} />
            <span className="small">Weary (1–3 count as 0)</span>
          </label>
        </div>

        <button className="btn" style={{ width: '100%', marginTop: 12 }} onClick={doRoll}>
          Roll
        </button>

        <div className="anim-zone" aria-live="polite">
          <div className={`anim-die ${animating ? 'is-animating' : ''}`} aria-hidden="true">🎲</div>
        </div>
      </div>

      <div className="card">
        <div className="h2">Last roll</div>

        {!summary ? (
          <div className="muted small">No roll yet.</div>
        ) : (
          <>
            <div className="kv">
              <div className="k">Feat</div>
              <div className="v">
                {summary.feat}
                {summary.feat2 ? <span className="muted small"> (also {summary.feat2})</span> : null}
              </div>
            </div>

            <div className="kv">
              <div className="k">Success</div>
              <div className="v">{summary.success}<span className="muted small">{summary.icons}</span></div>
            </div>

            <div className="kv">
              <div className="k">Total</div>
              <div className="v" style={{ fontWeight: 700 }}>{summary.total}</div>
            </div>

            {summary.passed ? (
              <div className="kv">
                <div className="k">Result</div>
                <div className="v">{summary.passed}</div>
              </div>
            ) : null}

            <button className="btn btn-ghost" style={{ width: '100%', marginTop: 12 }} onClick={doRoll}>
              Re-roll
            </button>
          </>
        )}
      </div>
    </BottomSheet>
  );
}
