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
  compact,
}: {
  state: StoredState;
  setState: (s: StoredState) => void;
  compact?: boolean;
}) {
  const campaigns = (state as any).campaigns ?? [];
  const campId = (state as any).activeCampaignId ?? (campaigns[0]?.id ?? 'camp-1');
  const oracle = (state as any).oracleByCampaign?.[campId] ?? (state as any).oracle;
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

  const tables = oracle.tables;

  // ✅ UPDATED: Strider Mode Telling Table (Feat Die) output
  const doAsk = () => {
    if (!question.trim()) return;

    const out = askOracle(oracle, likelihood);
    const twistTxt = out.twist ? ' — TWIST/EXTREME' : '';
    const result = `${out.answer}${twistTxt} (feat ${out.feat}, ${likelihood})`;

    // Functional update so we don't race with other state updates (ex: journal roll logger).
    setState((prev: any) => {
      const current = prev.oracleByCampaign?.[campId] ?? prev.oracle;
      return {
        ...prev,
        oracleByCampaign: {
          ...(prev.oracleByCampaign ?? {}),
          [campId]: {
            ...current,
            history: [
              { at: new Date().toISOString(), kind: 'Ask' as const, prompt: question.trim(), result },
              ...(current?.history ?? []),
            ],
          },
        },
      };
    });

    if (state.settings?.addRollsToJournal) {
      (window as any).__torcLogRollHtml?.(`<div><b>${result}</b> — Ask: ${question.trim()}</div>`);
    }

    setQuestion('');
  };

  const doRollTable = (id: string) => {
    const t = findTable(oracle, id);
    if (!t) return;
    const result = weightedPick(t.entries);
    setState((prev: any) => {
      const current = prev.oracleByCampaign?.[campId] ?? prev.oracle;
      return {
        ...prev,
        oracleByCampaign: {
          ...(prev.oracleByCampaign ?? {}),
          [campId]: {
            ...current,
            history: [
              { at: new Date().toISOString(), kind: 'Table' as const, prompt: `Table: ${t.name}`, result },
              ...(current?.history ?? []),
            ],
          },
        },
      };
    });

    if (state.settings?.addRollsToJournal) {
      (window as any).__torcLogRollHtml?.(`<div><b>${result}</b> — ${`Table: ${t.name}`}</div>`);
    }
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

    setState((prev: any) => {
      const current = prev.oracleByCampaign?.[campId] ?? prev.oracle;
      return {
        ...prev,
        oracleByCampaign: {
          ...(prev.oracleByCampaign ?? {}),
          [campId]: {
            ...current,
            history: [
              { at: new Date().toISOString(), kind: 'Table' as const, prompt, result },
              ...(current?.history ?? []),
            ],
          },
        },
      };
    });

    if (state.settings?.addRollsToJournal) {
      (window as any).__torcLogRollHtml?.(`<div><b>${result}</b> — ${prompt}</div>`);
    }

    setCopied(false);
  };

  const copyLore = async () => {
    if (!loreLast) return;
    const txt = `${loreLast.header}\n${loreLast.details}`;
    await navigator.clipboard.writeText(txt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  const history = useMemo(() => (oracle.history ?? []).slice(0, 30), [oracle.history]);
  const lastAsk = useMemo(
    () => (oracle.history ?? []).find((h) => h.kind === 'Ask') ?? null,
    [oracle.history]
  );

  const Container: any = compact ? 'div' : 'div';

  return (
    <div className={compact ? '' : 'card'}>
      {!compact && <div className="h2">Strider Mode Oracles</div>}

      {!compact && <hr />}

      {/* Lore Table */}
      <div className="h2">Lore Table</div>
      <div className="row" style={{ gap: 10, alignItems: 'center' }}>
        <button className="btn" onClick={doRollLore} disabled={!lore}>
          Roll Lore
        </button>

        {loreError && (
          <div className="small muted" style={{ marginLeft: 8 }}>
            Error: {loreError}
          </div>
        )}

        {loreLast && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div className="row" style={{ gap: 8, alignItems: 'center' }}>
              <span style={badgeStyle(featTone(loreLast.feat))}>{featLabel(loreLast.feat)}</span>

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
          onKeyDown={(e) => {
            if (e.key === 'Enter') doAsk();
          }}
          placeholder="Is there a safe shelter nearby?"
        />
        <select className="input" value={likelihood} onChange={(e) => setLikelihood(e.target.value as Likelihood)}>
          {(['Certain', 'Likely', 'Possible', 'Unlikely', 'Very Unlikely'] as Likelihood[]).map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <button className="btn" onClick={doAsk} disabled={!question.trim()}>
          Ask
        </button>

        {/* Inline last result (like Roll Lore) */}
        {lastAsk ? (
          <div className="small" style={{ marginLeft: 10, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 360 }} title={lastAsk.result}>
            <span className="badge" style={{ marginRight: 8 }}>Last</span>
            <b>{lastAsk.result}</b>
          </div>
        ) : null}
      </div>

      {lastAsk && (
        <div className="card" style={{ padding: 10, marginTop: 8 }}>
          <div className="small muted" style={{ marginBottom: 6 }}>
            Last answer
          </div>
          <strong>{lastAsk.prompt}</strong>
          <div style={{ marginTop: 4 }}>{lastAsk.result}</div>
        </div>
      )}

      <hr />

      {/* History */}
      <div className="h2">History</div>
      {history.map((h, i) => (
        <div key={i} className="card" style={{ padding: 8, marginTop: 6 }}>
          <div className="small muted">
            {new Date(h.at).toLocaleString()} — {h.kind}
          </div>
          <strong>{h.prompt}</strong>
          <div>{h.result}</div>
        </div>
      ))}
    </div>
  );
}

