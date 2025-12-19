import React, { useEffect, useMemo, useState } from 'react';
import { Likelihood, StoredState } from '../core/storage';
import { askOracle, findTable, makeId, weightedPick } from '../core/oracles';
import { loadLoreTable, rollD6, rollFrom, LoreTableData } from '../core/loreTable';

type LoreLast = {
  header: string;
  details: string;
  feat: string;
  d6: number;
};

function featLabel(feat: string) {
  if (feat === 'gandalf') return 'Gandalf';
  if (feat === 'sauron') return 'Sauron';
  return `Feat ${feat}`;
}

function featTone(feat: string): 'good' | 'bad' | 'neutral' {
  if (feat === 'gandalf') return 'good';
  if (feat === 'sauron') return 'bad';
  return 'neutral';
}

function badgeStyle(tone: 'good' | 'bad' | 'neutral'): React.CSSProperties {
  const base: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '2px 8px',
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    border: '1px solid rgba(255,255,255,0.15)',
    whiteSpace: 'nowrap',
  };

  if (tone === 'good') return { ...base, background: 'rgba(100,255,120,0.12)' };
  if (tone === 'bad') return { ...base, background: 'rgba(255,90,90,0.12)' };
  return { ...base, background: 'rgba(255,255,255,0.08)' };
}

export default function OraclesPanel({
  state,
  setState,
}: {
  state: StoredState;
  setState: (s: StoredState) => void;
}) {
  const [question, setQuestion] = useState('');
  const [likelihood, setLikelihood] = useState<Likelihood>('Possible');

  const [tableName, setTableName] = useState('');
  const [tableJson, setTableJson] = useState('');

  // --- Lore Table ---
  const [lore, setLore] = useState<LoreTableData | null>(null);
  const [loreError, setLoreError] = useState<string | null>(null);
  const [loreLast, setLoreLast] = useState<LoreLast | null>(null);

  // Copy UX
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadLoreTable()
      .then(setLore)
      .catch((e) => setLoreError(e?.message ?? 'Failed to load lore table'));
  }, []);

  const tables = state.oracle.tables;

  const doAsk = () => {
    if (!question.trim()) return;
    const out = askOracle(state.oracle, likelihood);
    const result = `${out.answer} (roll ${out.roll}/100, ${likelihood})`;
    setState({
      ...state,
      oracle: {
        ...state.oracle,
        history: [
          { at: new Date().toISOString(), kind: 'Ask' as const, prompt: question.trim(), result },
          ...state.oracle.history,
        ],
      },
    });
    setQuestion('');
  };

  const doRollTable = (id: string) => {
    const t = findTable(state.oracle, id);
    if (!t) return;
    const result = weightedPick(t.entries);
    setState({
      ...state,
      oracle: {
        ...state.oracle,
        history: [
          { at: new Date().toISOString(), kind: 'Table' as const, prompt: `Table: ${t.name}`, result },
          ...state.oracle.history,
        ],
      },
    });
  };

  const doRollLore = () => {
    if (!lore) return;

    const feat = rollFrom(Object.keys(lore.tables));
    const d6 = rollD6();
    const row = lore.tables[feat]?.find((r) => r.d6 === d6);
    if (!row) return;

    const result = `Action: ${row.action} - Aspect: ${row.aspect} - Focus: ${row.focus}`;
const prompt = `Lore Table: feat=${feat}, d6=${d6}`;
    
    setLoreLast({
      feat,
      d6,
      header: prompt,
      details: `Action: ${row.action} - Aspect: ${row.aspect} - Focus: ${row.focus}`,
    });

    setState({
      ...state,
      oracle: {
        ...state.oracle,
        history: [
          { at: new Date().toISOString(), kind: 'Table' as const, prompt, result },
          ...state.oracle.history,
        ],
      },
    });

    setCopied(false);
  };

  const copyLore = async () => {
    if (!loreLast) return;
    const txt = `${loreLast.header}\n${loreLast.details}`;
    await navigator.clipboard.writeText(txt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  const history = useMemo(() => state.oracle.history.slice(0, 30), [state.oracle.history]);

  return (
    <div className="card">
      <div className="h2">Strider Mode Oracles</div>

      <hr />

      {/* Lore Table */}
      <div className="h2">Lore Table</div>
      <div className="row" style={{ gap: 10, alignItems: 'center' }}>
        <button className="btn" onClick={doRollLore} disabled={!lore}>
          Roll Lore
        </button>

        {loreLast && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div className="row" style={{ gap: 8, alignItems: 'center' }}>
              <span style={badgeStyle(featTone(loreLast.feat))}>
                {featLabel(loreLast.feat)}
              </span>

              <strong>{loreLast.header}</strong>

              <button
                className="btn"
                onClick={copyLore}
                style={{ padding: '2px 8px', fontSize: 12 }}
                title="Copy result"
              >
                {copied ? '✓ Copied' : '📋'}
              </button>
            </div>

            <div className="small">{loreLast.details}</div>
          </div>
        )}
      </div>

      <hr />

      {/* Ask Oracle */}
      <div className="h2">Ask a question</div>
      <div className="row">
        <input
          className="input"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Is there a safe shelter nearby?"
        />
        <select
          className="input"
          value={likelihood}
          onChange={(e) => setLikelihood(e.target.value as Likelihood)}
        >
          {(['Certain', 'Likely', 'Possible', 'Unlikely', 'Very Unlikely'] as Likelihood[]).map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <button className="btn" onClick={doAsk}>Ask</button>
      </div>

      <hr />

      {/* History */}
      <div className="h2">History</div>
      {history.map((h, i) => (
        <div key={i} className="card" style={{ padding: 8, marginTop: 6 }}>
          <div className="small muted">{new Date(h.at).toLocaleString()} — {h.kind}</div>
          <strong>{h.prompt}</strong>
          <div>{h.result}</div>
        </div>
      ))}
    </div>
  );
}
