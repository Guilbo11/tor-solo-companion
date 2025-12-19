import React, { useEffect, useMemo, useState } from 'react';
import { Likelihood, StoredState } from '../core/storage';
import { askOracle, findTable, makeId, weightedPick } from '../core/oracles';
import { loadLoreTable, rollD6, rollFrom, LoreTableData } from '../core/loreTable';

export default function OraclesPanel({
  state,
  setState,
}: {
  state: StoredState;
  setState: (s: StoredState) => void;
}) {
  const [question, setQuestion] = useState('');
  const [likelihood, setLikelihood] = useState<Likelihood>('Possible');

  const [tableId, setTableId] = useState('');
  const [tableName, setTableName] = useState('');
  const [tableJson, setTableJson] = useState('');

  // --- Lore Table state ---
  const [lore, setLore] = useState<LoreTableData | null>(null);
  const [loreError, setLoreError] = useState<string | null>(null);
  const [loreLast, setLoreLast] = useState<string>(''); // just for display

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
    const history = [
      { at: new Date().toISOString(), kind: 'Ask' as const, prompt: question.trim(), result },
      ...state.oracle.history,
    ];
    setState({ ...state, oracle: { ...state.oracle, history } });
    setQuestion('');
  };

  const doRollTable = (id: string) => {
    const t = findTable(state.oracle, id);
    if (!t) return;
    const result = weightedPick(t.entries);
    const history = [
      { at: new Date().toISOString(), kind: 'Table' as const, prompt: `Table: ${t.name}`, result },
      ...state.oracle.history,
    ];
    setState({ ...state, oracle: { ...state.oracle, history } });
  };

  // --- Lore Table roll ---
  const doRollLore = () => {
    if (!lore) return;

    const featKeys = Object.keys(lore.tables); // "sauron" | "gandalf" | "1".."10"
    if (!featKeys.length) {
      alert('Lore table is empty.');
      return;
    }

    const feat = rollFrom(featKeys);
    const d6 = rollD6();
    const row = lore.tables[feat]?.find((r) => r.d6 === d6);

    if (!row) {
      alert(`No row for feat=${feat}, d6=${d6}`);
      return;
    }

    const result = `${row.action} ${row.aspect} ${row.focus}`;
    const prompt = `Lore Table: feat=${feat}, d6=${d6}`;

    setLoreLast(`[${feat} • d6=${d6}] ${result}`);

    const history = [
      { at: new Date().toISOString(), kind: 'Table' as const, prompt, result },
      ...state.oracle.history,
    ];
    setState({ ...state, oracle: { ...state.oracle, history } });
  };

  const addTable = () => {
    if (!tableName.trim()) return;
    let entries: { text: string; weight?: number }[] = [];
    if (tableJson.trim()) {
      try {
        const parsed = JSON.parse(tableJson);
        if (!Array.isArray(parsed)) throw new Error('Must be a JSON array of strings or objects');
        entries = parsed.map((x: any) => {
          if (typeof x === 'string') return { text: x };
          if (typeof x?.text === 'string')
            return { text: x.text, weight: typeof x.weight === 'number' ? x.weight : undefined };
          throw new Error('Bad entry format');
        });
      } catch (e: any) {
        alert(e?.message ?? 'Invalid JSON');
        return;
      }
    }
    const t = { id: makeId('t'), name: tableName.trim(), entries };
    setState({ ...state, oracle: { ...state.oracle, tables: [t, ...state.oracle.tables] } });
    setTableName('');
    setTableJson('');
  };

  const removeTable = (id: string) => {
    if (!confirm('Delete table?')) return;
    setState({ ...state, oracle: { ...state.oracle, tables: state.oracle.tables.filter((t) => t.id !== id) } });
  };

  const clearHistory = () => {
    if (!confirm('Clear oracle history?')) return;
    setState({ ...state, oracle: { ...state.oracle, history: [] } });
  };

  const history = useMemo(() => state.oracle.history.slice(0, 30), [state.oracle.history]);

  return (
    <div className="card">
      <div className="h2">Strider Mode Oracles (engine)</div>
      <div className="muted small">
        This panel is a configurable oracle engine. You'll enter/import your Strider Mode tables in JSON (so the app can
        follow the PDF structure exactly).
      </div>

      <hr />

      {/* --- Lore Table section --- */}
      <div className="h2">Lore Table (static)</div>
      <div className="muted small">
        Loaded from <code>public/data/lore-table.json</code>
      </div>

      {loreError && <div className="muted small" style={{ marginTop: 8 }}>Error: {loreError}</div>}

      <div className="row" style={{ marginTop: 10, alignItems: 'center', gap: 10 }}>
        <button className="btn" onClick={doRollLore} disabled={!lore}>
          Roll Lore Table
        </button>
        {loreLast && <div className="small">{loreLast}</div>}
        {!lore && !loreError && <div className="muted small">Loading…</div>}
      </div>

      <hr />

      <div className="h2">Ask a question (Yes/No/Maybe)</div>
      <div className="row">
        <div className="col">
          <input
            className="input"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Is there a safe shelter nearby?"
          />
        </div>
        <div className="col">
          <select className="input" value={likelihood} onChange={(e) => setLikelihood(e.target.value as Likelihood)}>
            {(['Certain', 'Likely', 'Possible', 'Unlikely', 'Very Unlikely'] as Likelihood[]).map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <button className="btn" onClick={doAsk} disabled={!question.trim()}>
          Ask
        </button>
      </div>

      <hr />
      <div className="h2">Tables</div>
      {tables.length === 0 ? (
        <div className="muted">No tables yet. Add one below.</div>
      ) : (
        <div className="row" style={{ flexDirection: 'column', gap: 10 }}>
          {tables.map((t) => (
            <div key={t.id} className="card" style={{ padding: 12 }}>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{t.name}</div>
                  <div className="small muted">{t.entries.length} entries</div>
                </div>
                <div className="row">
                  <button className="btn" onClick={() => doRollTable(t.id)}>
                    Roll
                  </button>
                  <button className="btn" onClick={() => removeTable(t.id)}>
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <hr />
      <div className="h2">Add a table</div>
      <div className="row">
        <div className="col">
          <label className="small muted">Name</label>
          <input
            className="input"
            value={tableName}
            onChange={(e) => setTableName(e.target.value)}
            placeholder="Telling Table / Lore Table / Journey Events..."
          />
        </div>
      </div>
      <div style={{ marginTop: 10 }}>
        <label className="small muted">Entries JSON (optional)</label>
        <textarea
          className="input"
          style={{ minHeight: 120 }}
          value={tableJson}
          onChange={(e) => setTableJson(e.target.value)}
          placeholder='Example: ["Result A","Result B"] or [{"text":"A","weight":2}]'
        />
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn" onClick={addTable} disabled={!tableName.trim()}>
          Add table
        </button>
      </div>

      <hr />
      <div className="h2">History</div>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="muted small">Showing last {history.length} items.</div>
        <button className="btn" onClick={clearHistory} disabled={state.oracle.history.length === 0}>
          Clear
        </button>
      </div>
      {history.length === 0 ? (
        <div className="muted" style={{ marginTop: 10 }}>
          No oracle rolls yet.
        </div>
      ) : (
        <div className="row" style={{ flexDirection: 'column', gap: 10, marginTop: 10 }}>
          {history.map((h, idx) => (
            <div key={idx} className="card" style={{ padding: 12 }}>
              <div className="small muted">
                {new Date(h.at).toLocaleString()} — {h.kind}
              </div>
              <div style={{ fontWeight: 700, marginTop: 6 }}>{h.prompt}</div>
              <div style={{ marginTop: 6 }}>{h.result}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
