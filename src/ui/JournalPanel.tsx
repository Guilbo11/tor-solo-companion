import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { JournalChapter, StoredState } from '../core/storage';

type Props = { state: StoredState; setState: (s: StoredState) => void };

function uid(prefix = 'id') {
  return `${prefix}-${crypto.randomUUID()}`;
}

function clampHtml(html: string) {
  return typeof html === 'string' ? html : '';
}

export default function JournalPanel({ state, setState }: Props) {
  const chapters = state.journalChapters ?? [];
  const activeId = state.activeJournalChapterId ?? chapters[0]?.id;
  const active = useMemo(() => chapters.find(c => c.id === activeId) ?? chapters[0], [chapters, activeId]);

  const [editingId, setEditingId] = useState<string | null>(active?.id ?? null);
  const editing = chapters.find(c => c.id === editingId) ?? null;

  const editorRef = useRef<HTMLDivElement | null>(null);
  const [draftHtml, setDraftHtml] = useState<string>(editing ? clampHtml(editing.html) : '');

  // Keep draft in sync when switching chapters
  useEffect(() => {
    if (!editing) return;
    setDraftHtml(clampHtml(editing.html));
  }, [editingId]);

  // Expose an insert hook for dice/oracle logging.
  useEffect(() => {
    const onInsert = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as { html?: string };
      const html = String(detail?.html ?? '');
      if (!html.trim()) return;

      // Prefer inserting at caret if editor is active.
      if (editing && editorRef.current && document.activeElement === editorRef.current) {
        try {
          document.execCommand('insertHTML', false, `<br/><br/>${html}`);
          setDraftHtml(editorRef.current.innerHTML);
          return;
        } catch {
          // fall through to append
        }
      }

      // Append to chapter content.
      if (!active) return;
      const next = (active.html ?? '') + `<br/><br/>${html}`;
      setState({
        ...state,
        journalChapters: chapters.map(c => c.id === active.id ? { ...c, html: next } : c),
      });
    };

    window.addEventListener('torc:journal-insert-html', onInsert as any);
    return () => window.removeEventListener('torc:journal-insert-html', onInsert as any);
  }, [state, setState, chapters, active, editing]);

  const toggleCollapsed = (id: string) => {
    setState({
      ...state,
      journalChapters: chapters.map(c => c.id === id ? { ...c, collapsed: !c.collapsed } : c),
    });
  };

  const addChapter = () => {
    const id = uid('chap');
    const next: JournalChapter = { id, title: `Chapter ${chapters.length + 1}`, html: '', collapsed: false };
    setState({
      ...state,
      journalChapters: [...chapters, next],
      activeJournalChapterId: id,
    });
    setEditingId(id);
  };

  const removeChapter = (id: string) => {
    const c = chapters.find(x => x.id === id);
    if (!c) return;
    if (!confirm(`Delete "${c.title}"?`)) return;
    const nextList = chapters.filter(x => x.id !== id);
    const nextActive = nextList[0]?.id;
    setState({
      ...state,
      journalChapters: nextList,
      activeJournalChapterId: nextActive,
    });
    if (editingId === id) setEditingId(nextActive ?? null);
  };

  // Drag & drop reordering
  const [dragId, setDragId] = useState<string | null>(null);
  const onDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const from = chapters.findIndex(c => c.id === dragId);
    const to = chapters.findIndex(c => c.id === targetId);
    if (from < 0 || to < 0) return;
    const next = [...chapters];
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    setState({ ...state, journalChapters: next });
    setDragId(null);
  };

  const exec = (cmd: string, value?: string) => {
    try {
      document.execCommand(cmd, false, value);
      if (editorRef.current) setDraftHtml(editorRef.current.innerHTML);
    } catch {
      // ignore
    }
  };

  const applyHeading = (level: 1 | 2 | 3) => {
    exec('formatBlock', `H${level}`);
  };

  const startEdit = (id: string) => {
    setState({ ...state, activeJournalChapterId: id });
    setEditingId(id);
    // focus shortly after paint
    window.setTimeout(() => editorRef.current?.focus(), 50);
  };

  const updateChapter = () => {
    if (!editing) return;
    const nextHtml = editorRef.current ? editorRef.current.innerHTML : draftHtml;
    setState({
      ...state,
      journalChapters: chapters.map(c => c.id === editing.id ? { ...c, html: nextHtml } : c),
      activeJournalChapterId: editing.id,
    });
  };

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <div>
          <div className="h2">Journal</div>
          <div className="small muted">One chapter can be edited at a time. Rolls can be logged to the active chapter.</div>
        </div>
        <button className="btn" onClick={addChapter}>+ Chapter</button>
      </div>

      <div style={{ marginTop: 12 }}>
        {chapters.map(c => (
          <div key={c.id} className="card" style={{ marginBottom: 10, padding: 12 }}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <div className="row" style={{ gap: 10, alignItems: 'center', flex: 1 }}>
                <button
                  type="button"
                  className="dragHandle"
                  aria-label="Drag to reorder"
                  draggable
                  onDragStart={() => setDragId(c.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => onDrop(c.id)}
                >
                  <div className="dragDots" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>
                </button>

                <button
                  className="btn btn-ghost"
                  onClick={() => toggleCollapsed(c.id)}
                  style={{ padding: '8px 10px', borderRadius: 12 }}
                >
                  {c.collapsed ? '▸' : '▾'}
                </button>

                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800 }}>
                    {c.title}{c.id === activeId ? <span className="badge" style={{ marginLeft: 8 }}>active</span> : null}
                  </div>
                </div>
              </div>

              <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                <button className="btn btn-ghost" aria-label="Edit" onClick={() => startEdit(c.id)}>✏️</button>
                <button className="btn-danger" aria-label="Delete" onClick={() => removeChapter(c.id)}>🗑️</button>
              </div>
            </div>

            {!c.collapsed && (
              <div style={{ marginTop: 10 }}>
                <div className="rich-read" dangerouslySetInnerHTML={{ __html: c.html || '<span class="muted">(empty)</span>' }} />
              </div>
            )}

            {editing && editing.id === c.id && (
              <div style={{ marginTop: 12 }}>
                <div className="editorToolbar">
                  <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                    <button className="btn btn-ghost" onClick={() => applyHeading(1)}>H1</button>
                    <button className="btn btn-ghost" onClick={() => applyHeading(2)}>H2</button>
                    <button className="btn btn-ghost" onClick={() => applyHeading(3)}>H3</button>
                    <button className="btn btn-ghost" onClick={() => exec('italic')}>Italic</button>
                    <button className="btn btn-ghost" onClick={() => exec('underline')}>Underline</button>
                    <button className="btn btn-ghost" onClick={() => exec('insertUnorderedList')}>• List</button>
                    <button className="btn btn-ghost" onClick={() => exec('insertOrderedList')}>1. List</button>
                  </div>
                </div>

                <div
                  ref={editorRef}
                  className="richEditor"
                  contentEditable
                  suppressContentEditableWarning
                  onInput={() => setDraftHtml(editorRef.current?.innerHTML ?? '')}
                  dangerouslySetInnerHTML={{ __html: draftHtml }}
                />

                <button className="btn" style={{ width: '100%', marginTop: 10 }} onClick={updateChapter}>
                  Update journal
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
