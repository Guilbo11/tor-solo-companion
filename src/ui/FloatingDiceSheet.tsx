import React, { useMemo, useState } from 'react';
import BottomSheet from './BottomSheet';
import { rollTOR, RollResult, formatTorRoll } from '../core/dice';
import { computeDerived } from '../core/tor2e';
import type { StoredState } from '../core/storage';

type Props = {
  state: StoredState;
  open: boolean;
  onClose: () => void;
};

export default function FloatingDiceSheet({ state, open, onClose }: Props) {
  const [dice, setDice] = useState(2);
  const [featMode, setFeatMode] = useState<'normal'|'favoured'|'illFavoured'>('normal');
  const [weary, setWeary] = useState(false);
  const [tn, setTn] = useState<number | ''>('');
  const [res, setRes] = useState<RollResult | null>(null);
  const [animating, setAnimating] = useState(false);

  // Attribute TN helper (picks hero if multiple).
  const [pickAttr, setPickAttr] = useState<null | 'Strength'|'Heart'|'Wits'>(null);
  const [heroPickOpen, setHeroPickOpen] = useState(false);

  const activeCampaignId = state.activeCampaignId;
  const heroes = (state.heroes ?? []).filter((h:any)=>!activeCampaignId || h.campaignId===activeCampaignId);

  const canRoll = dice > 0 || true; // feat die is always rolled in TOR here

  const summary = useMemo(() => {
    if (!res) return null;

    const feat = res.feat.type === 'Number' ? `${res.feat.value}` : (res.feat.type === 'Eye' ? 'Sauron' : 'Gandalf');
    const feat2 = res.feat2
      ? (res.feat2.type === 'Number' ? `${res.feat2.value}` : (res.feat2.type === 'Eye' ? 'Sauron' : 'Gandalf'))
      : null;

    const s = res.success.map(d => (d.icon ? `6(★)` : String(d.value))).join(', ');
    const tnTxt = typeof res.passed === 'boolean' && typeof (res as any)._tn === 'number' ? ` (TN ${(res as any)._tn})` : '';
    const passed = typeof res.passed === 'boolean' ? (res.passed ? 'PASS' : 'FAIL') : '';
    const degree = (res.passed ? (res.degrees ? ` — ${res.degrees}` : '') : '');
    const icons = res.icons ? ` (${res.icons} ★)` : '';

    return {
      feat,
      feat2,
      success: s || '—',
      total: res.total,
      passed: passed ? `${passed}${degree}${tnTxt}` : '',
      icons,
    };
  }, [res]);

  const setTNFromHeroAttr = (hero:any, attr: 'Strength'|'Heart'|'Wits') => {
    const tnBase = hero?.striderMode ? 18 : 20;
    const d = computeDerived(hero, tnBase);
    const tnVal = attr==='Strength' ? d.strengthTN : attr==='Heart' ? d.heartTN : d.witsTN;
    setTn(tnVal);
  };

  const doRoll = () => {
    if (!canRoll) return;
    setAnimating(true);

    const tnNum = typeof tn === 'number' ? tn : undefined;
    const r0 = rollTOR({
      dice,
      featMode,
      weary,
      tn: tnNum,
    });

    // Keep the TN used for formatting, without changing core types.
    const r = Object.assign({}, r0, { _tn: tnNum });

    setRes(r);

    // Optional journal logging
    try {
      const modeTxt = featMode === 'normal' ? 'Normal' : featMode === 'favoured' ? 'Favoured' : 'Ill-favoured';
      const wearyTxt = weary ? ' — Weary' : '';
      const detail = formatTorRoll(r0, { tn: tnNum });
      (window as any).__torcLogRollHtml?.(`<div><div><b>Quick Roll</b> — Roll: ${dice}d6 + feat (${modeTxt}${wearyTxt})</div><div>${detail}</div></div>`);
    } catch {}

    window.setTimeout(() => setAnimating(false), 750);
  };

  return (
    <BottomSheet open={open} title="Quick Roll" onClose={onClose}>
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="h2">Build Roll</div>

        <div className="row" style={{gap:10, flexWrap:'wrap'}}>
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

          <div className="col" style={{minWidth: 220}}>
            <label className="small muted">Target Number (optional)</label>
            <div className="segRow" style={{marginBottom: 6}}>
              <button className="seg" type="button" onClick={()=>{
                setPickAttr('Strength');
                setTn('');
                if (heroes.length > 1) { setHeroPickOpen(true); } else if (heroes[0]) { setTNFromHeroAttr(heroes[0], 'Strength'); }
              }}>Strength</button>
              <button className="seg" type="button" onClick={()=>{
                setPickAttr('Heart');
                setTn('');
                if (heroes.length > 1) { setHeroPickOpen(true); } else if (heroes[0]) { setTNFromHeroAttr(heroes[0], 'Heart'); }
              }}>Heart</button>
              <button className="seg" type="button" onClick={()=>{
                setPickAttr('Wits');
                setTn('');
                if (heroes.length > 1) { setHeroPickOpen(true); } else if (heroes[0]) { setTNFromHeroAttr(heroes[0], 'Wits'); }
              }}>Wits</button>
            </div>
            <input
              className="input"
              type="number"
              value={tn}
              onChange={(e) => setTn(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
              placeholder="e.g. 14"
            />
          </div>
        </div>

        {heroPickOpen ? (
          <div className="modalOverlay" onClick={()=>setHeroPickOpen(false)}>
            <div className="modalCard" onClick={(e)=>e.stopPropagation()}>
              <div className="h2" style={{marginTop:0}}>Choose hero</div>
              <div className="small muted" style={{marginTop:4}}>Pick which hero's {pickAttr ?? 'Attribute'} TN to use.</div>
              <div className="list" style={{marginTop:10}}>
                {heroes.map((h:any)=>{
                  return (
                    <button key={h.id} className="btn" style={{width:'100%', justifyContent:'space-between'}} onClick={()=>{
                      if (pickAttr) setTNFromHeroAttr(h, pickAttr);
                      setHeroPickOpen(false);
                    }}>
                      <span>{h.name}</span>
                      <span className="small muted">TN {(() => {
                        const tnBase = h?.striderMode ? 18 : 20;
                        const d = computeDerived(h, tnBase);
                        const val = pickAttr==='Strength' ? d.strengthTN : pickAttr==='Heart' ? d.heartTN : d.witsTN;
                        return val;
                      })()}</span>
                    </button>
                  );
                })}
              </div>
              <button className="btn btn-ghost" style={{width:'100%', marginTop:10}} onClick={()=>setHeroPickOpen(false)}>Cancel</button>
            </div>
          </div>
        ) : null}

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

      {heroPickOpen ? (
        <div className="modalOverlay" onClick={()=>setHeroPickOpen(false)}>
          <div className="modal" onClick={(e)=>e.stopPropagation()}>
            <div className="h2" style={{marginTop:0}}>Choose Hero</div>
            <div className="small muted" style={{marginBottom:10}}>
              Select which hero to use for <b>{pickAttr ?? 'Attribute'}</b> TN.
            </div>
            <div className="list">
              {heroes.map((h:any)=> (
                <button key={h.id} className="btn" style={{width:'100%', marginBottom:8}} onClick={()=>{
                  if (!pickAttr) { setHeroPickOpen(false); return; }
                  setTNFromHeroAttr(h, pickAttr);
                  setHeroPickOpen(false);
                }}>{h.name || 'Hero'}</button>
              ))}
            </div>
            <button className="btn btn-ghost" style={{width:'100%'}} onClick={()=>setHeroPickOpen(false)}>Cancel</button>
          </div>
        </div>
      ) : null}
    </BottomSheet>
  );
}
