import React, { useMemo, useState } from 'react';
import { JournalEntry, StoredState } from '../core/storage';
import { makeId } from '../core/oracles';

export default function JournalPanel({ state, setState }: { state: StoredState; setState: (s: StoredState) => void }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tags, setTags] = useState('');
  const [linkedHex, setLinkedHex] = useState('');

  const entries = useMemo(() => {
    return [...state.journal].sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  }, [state.journal]);

  const add = () => {
    if (!title.trim() && !body.trim()) return;
    const e: JournalEntry = {
      id: makeId('j'),
      createdAt: new Date().toISOString(),
      title: title.trim() || '(untitled)',
      body: body.trim(),
      tags: tags.split(',').map(t=>t.trim()).filter(Boolean),
      linkedHex: linkedHex.trim() || undefined,
    };
    setState({ ...state, journal: [e, ...state.journal] });
    setTitle(''); setBody(''); setTags(''); setLinkedHex('');
  };

  const remove = (id: string) => {
    if (!confirm('Delete entry?')) return;
    setState({ ...state, journal: state.journal.filter(e => e.id !== id) });
  };

  return (
    <div className="card">
      <div className="h2">Journal</div>

      <div className="row">
        <div className="col">
          <label className="small muted">Title</label>
          <input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Journey to Bree..." />
        </div>
        <div className="col">
          <label className="small muted">Tags (comma-separated)</label>
          <input className="input" value={tags} onChange={e => setTags(e.target.value)} placeholder="journey, council, combat" />
        </div>
        <div className="col">
          <label className="small muted">Linked hex (optional)</label>
          <input className="input" value={linkedHex} onChange={e => setLinkedHex(e.target.value)} placeholder="q:0,r:0" />
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <label className="small muted">Body</label>
        <textarea className="input" style={{ minHeight: 120 }} value={body} onChange={e => setBody(e.target.value)} placeholder="Write what happened..." />
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn" onClick={add}>Add entry</button>
      </div>

      <hr />
      {entries.length === 0 ? (
        <div className="muted">No entries yet.</div>
      ) : (
        <div className="row" style={{ flexDirection: 'column', gap: 10 }}>
          {entries.map(e => (
            <div key={e.id} className="card" style={{ padding: 12 }}>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{e.title}</div>
                  <div className="small muted">{new Date(e.createdAt).toLocaleString()}</div>
                </div>
                <button className="btn" onClick={() => remove(e.id)}>Delete</button>
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                {e.tags.map(t => <span key={t} className="badge">{t}</span>)}
                {e.linkedHex && <span className="badge">Hex: {e.linkedHex}</span>}
              </div>
              {e.body && <pre style={{ marginTop: 10 }}>{e.body}</pre>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
