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
  const lastRangeRef = useRef<Range | null>(null);
  const [draftHtml, setDraftHtml] = useState<string>(editing ? clampHtml(editing.html) : '');
  const [blockType, setBlockType] = useState<'P'|'H1'|'H2'|'H3'>('P');

  // Keep draft in sync when switching chapters
  useEffect(() => {
    if (!editing) return;
    setDraftHtml(clampHtml(editing.html));
    setBlockType('P');
    lastRangeRef.current = null;
  }, [editingId]);

  // Track the last selection range inside the editor so we can insert rolls at the caret
  // even if the user last clicked a toolbar button.
  useEffect(() => {
    if (!editing) return;
    const onSel = () => {
      const ed = editorRef.current;
      if (!ed) return;
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const r = sel.getRangeAt(0);
      if (!ed.contains(r.startContainer)) return;
      lastRangeRef.current = r.cloneRange();

      // Try to infer current block type for the dropdown.
      try {
        const el = (r.startContainer as any)?.nodeType === 1 ? (r.startContainer as HTMLElement) : (r.startContainer.parentElement as HTMLElement | null);
        const block = el?.closest('h1,h2,h3,p,div');
        const tag = (block?.tagName ?? '').toUpperCase();
        if (tag === 'H1' || tag === 'H2' || tag === 'H3') setBlockType(tag as any);
        else setBlockType('P');
      } catch {
        // ignore
      }
    };

    document.addEventListener('selectionchange', onSel);
    return () => document.removeEventListener('selectionchange', onSel);
  }, [editingId, editing]);

  const insertHtmlAtCaretOrEnd = (html: string) => {
    const ed = editorRef.current;
    if (!ed) return;

    const safe = `<br/><br/>${html}`; // one blank line separation

    const sel = window.getSelection();
    const useLast = lastRangeRef.current;
    const range = (sel && sel.rangeCount > 0 && ed.contains(sel.getRangeAt(0).startContainer))
      ? sel.getRangeAt(0)
      : (useLast && ed.contains(useLast.startContainer) ? useLast : null);

    if (range) {
      // Insert after the current caret position.
      range.deleteContents();
      const frag = range.createContextualFragment(safe);
      const last = frag.lastChild;
      range.insertNode(frag);
      // Move caret after inserted content.
      if (last) {
        const r2 = document.createRange();
        r2.setStartAfter(last);
        r2.collapse(true);
        sel?.removeAllRanges();
        sel?.addRange(r2);
        lastRangeRef.current = r2.cloneRange();
      }
    } else {
      // No caret in editor: append to the end.
      ed.insertAdjacentHTML('beforeend', safe);
    }
    setDraftHtml(ed.innerHTML);
  };

  // Expose an insert hook for dice/oracle logging.
  useEffect(() => {
    const onInsert = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as { html?: string };
      const html = String(detail?.html ?? '');
      if (!html.trim()) return;

      // If a chapter is currently being edited, ALWAYS insert into the editor draft.
      // This prevents losing the inserted roll when the user clicks "Update journal".
      if (editing && editorRef.current) {
        insertHtmlAtCaretOrEnd(html);
        return;
      }

      // Otherwise append to the active chapter content.
      if (!active) return;
      const next = (active.html ?? '') + `<br/><br/>${html}`;
      setState({ ...state, journalChapters: chapters.map(c => c.id === active.id ? { ...c, html: next } : c) });
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

  const applyBlockType = (t: 'P'|'H1'|'H2'|'H3') => {
    setBlockType(t);
    if (t === 'P') exec('formatBlock', 'P');
    else applyHeading(t === 'H1' ? 1 : t === 'H2' ? 2 : 3);
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
                    <select
                      className="select"
                      value={blockType}
                      onChange={(e) => applyBlockType(e.target.value as any)}
                      aria-label="Text style"
                      style={{ minWidth: 160 }}
                    >
                      <option value="P">Paragraph</option>
                      <option value="H1">Heading 1</option>
                      <option value="H2">Heading 2</option>
                      <option value="H3">Heading 3</option>
                    </select>

                    <button className="btn btn-ghost" aria-label="Bold" title="Bold" onClick={() => exec('bold')}><b>B</b></button>
                    <button className="btn btn-ghost" aria-label="Italic" title="Italic" onClick={() => exec('italic')}><i>I</i></button>
                    <button className="btn btn-ghost" aria-label="Underline" title="Underline" onClick={() => exec('underline')}><span style={{ textDecoration: 'underline' }}>U</span></button>
                    <button className="btn btn-ghost" aria-label="Bulleted list" title="Bulleted list" onClick={() => exec('insertUnorderedList')}>•</button>
                    <button className="btn btn-ghost" aria-label="Numbered list" title="Numbered list" onClick={() => exec('insertOrderedList')}>1.</button>
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
