import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { JournalChapter, StoredState } from '../core/storage';

type Props = { state: StoredState; setState: (s: StoredState) => void };

function uid(prefix = 'id') {
  return `${prefix}-${crypto.randomUUID()}`;
}

function clampHtml(html: string) {
  return typeof html === 'string' ? html : '';
}

function isDefaultChapterTitle(title: string) {
  return /^Chapter\s+\d+\s*$/i.test(String(title ?? '').trim());
}

function extractFirstLineTitle(html: string): string {
  try {
    const doc = new DOMParser().parseFromString(String(html ?? ''), 'text/html');
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let node: any;
    while ((node = walker.nextNode())) {
      const text = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (text) return text.slice(0, 80);
    }
  } catch {
    // ignore
  }
  return '';
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

  // When switching chapters, push the stored html into the contentEditable element
  // without re-binding innerHTML on every keystroke (prevents caret jumps on mobile).
  useEffect(() => {
    if (!editing) return;
    if (!editorRef.current) return;
    editorRef.current.innerHTML = clampHtml(editing.html);
  }, [editingId, editing?.html]);

  // Expose an insert hook for dice/oracle logging.
  useEffect(() => {
    const onInsert = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as { html?: string; chapterId?: string };
      const html = String(detail?.html ?? '');
      if (!html.trim()) return;

      const targetId = detail?.chapterId ?? active?.id;
      if (!targetId) return;

      // If the editor is currently editing the target chapter, update the live box immediately.
      if (editing && editing.id === targetId && editorRef.current) {
        const isFocused = document.activeElement === editorRef.current;
        if (isFocused) {
          try {
            document.execCommand('insertHTML', false, `<br/><br/>${html}`);
          } catch {
            editorRef.current.innerHTML = (editorRef.current.innerHTML || '') + `<br/><br/>${html}`;
          }
        } else {
          editorRef.current.innerHTML = (editorRef.current.innerHTML || '') + `<br/><br/>${html}`;
        }
        setDraftHtml(editorRef.current.innerHTML);
      }

      // Note: persistence to state is handled globally in App.tsx; this hook is just
      // for immediate editor UI updates when the Journal tab is open.
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

  const setBlock = (kind: 'P'|'H1'|'H2'|'H3') => exec('formatBlock', kind);

  const startEdit = (id: string) => {
    setState({ ...state, activeJournalChapterId: id });
    setEditingId(id);
    // focus shortly after paint
    window.setTimeout(() => editorRef.current?.focus(), 50);
  };

  const updateChapter = () => {
    if (!editing) return;
    const nextHtml = editorRef.current ? editorRef.current.innerHTML : draftHtml;
    const maybeNewTitle = isDefaultChapterTitle(editing.title) ? extractFirstLineTitle(nextHtml) : '';
    setState({
      ...state,
      journalChapters: chapters.map(c => {
        if (c.id !== editing.id) return c;
        return { ...c, html: nextHtml, title: maybeNewTitle ? maybeNewTitle : c.title };
      }),
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
                      className="input"
                      style={{ width: 170, paddingTop: 8, paddingBottom: 8 }}
                      defaultValue="P"
                      onChange={(e) => setBlock(e.target.value as any)}
                    >
                      <option value="P">Paragraph</option>
                      <option value="H1">Heading 1</option>
                      <option value="H2">Heading 2</option>
                      <option value="H3">Heading 3</option>
                    </select>

                    <button className="btn btn-ghost" aria-label="Bold" onClick={() => exec('bold')}><b>B</b></button>
                    <button className="btn btn-ghost" aria-label="Italic" onClick={() => exec('italic')}><i>I</i></button>
                    <button className="btn btn-ghost" aria-label="Underline" onClick={() => exec('underline')}><span style={{ textDecoration: 'underline' }}>U</span></button>
                    <button className="btn btn-ghost" aria-label="Bulleted list" onClick={() => exec('insertUnorderedList')}>•</button>
                    <button className="btn btn-ghost" aria-label="Numbered list" onClick={() => exec('insertOrderedList')}>1.</button>
                    <button className="btn btn-ghost" aria-label="Quote" onClick={() => exec('formatBlock', 'BLOCKQUOTE')}>❝</button>
                    <button className="btn btn-ghost" aria-label="Horizontal rule" onClick={() => exec('insertHorizontalRule')}>—</button>
                  </div>
                </div>

                <div
                  ref={editorRef}
                  className="richEditor"
                  contentEditable
                  suppressContentEditableWarning
                  onInput={() => setDraftHtml(editorRef.current?.innerHTML ?? '')}
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
