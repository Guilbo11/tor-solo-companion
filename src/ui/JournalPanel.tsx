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
  const campaignId = state.activeCampaignId ?? 'camp-1';
  const chapters = state.journalByCampaign?.[campaignId] ?? [];
  const activeId = state.activeJournalChapterIdByCampaign?.[campaignId] ?? chapters[0]?.id;
  const active = useMemo(() => chapters.find(c => c.id === activeId) ?? chapters[0], [chapters, activeId]);

  const [editingId, setEditingId] = useState<string | null>(active?.id ?? null);
  const editing = chapters.find(c => c.id === editingId) ?? null;

  const editorRef = useRef<HTMLDivElement | null>(null);
  const [draftHtml, setDraftHtml] = useState<string>(editing ? clampHtml(editing.html) : '');

  function writeJournal(nextChapters: JournalChapter[], nextActiveId?: string) {
    setState({
      ...state,
      journalByCampaign: { ...(state.journalByCampaign ?? {}), [campaignId]: nextChapters },
      activeJournalChapterIdByCampaign: {
        ...(state.activeJournalChapterIdByCampaign ?? {}),
        [campaignId]: nextActiveId ?? (state.activeJournalChapterIdByCampaign?.[campaignId] ?? nextChapters[0]?.id),
      },
    });
  }

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
      const detail = (ev as CustomEvent).detail as { html?: string; chapterId?: string; campaignId?: string };
      if (detail?.campaignId && detail.campaignId !== campaignId) return;
      const html = String(detail?.html ?? '');
      if (!html.trim()) return;

      const targetId = detail?.chapterId ?? active?.id;
      if (!targetId) return;

      // If the editor is currently editing the target chapter, update the live box immediately.
      if (editing && editing.id === targetId && editorRef.current) {
        const isFocused = document.activeElement === editorRef.current;
        if (isFocused) {
          try {
            document.execCommand('insertHTML', false, `<br/>${html}`);
          } catch {
            editorRef.current.innerHTML = (editorRef.current.innerHTML || '') + `<br/>${html}`;
          }
        } else {
          editorRef.current.innerHTML = (editorRef.current.innerHTML || '') + `<br/>${html}`;
        }
        setDraftHtml(editorRef.current.innerHTML);
      }

      // Note: persistence to state is handled globally in App.tsx; this hook is just
      // for immediate editor UI updates when the Journal tab is open.
    };

    window.addEventListener('torc:journal-insert-html', onInsert as any);
    return () => window.removeEventListener('torc:journal-insert-html', onInsert as any);
  }, [state, setState, chapters, active, editing]);

  const commit = (nextChapters: JournalChapter[], nextActiveId?: string) => {
    setState({
      ...state,
      journalByCampaign: { ...(state.journalByCampaign ?? {}), [campaignId]: nextChapters },
      activeJournalChapterIdByCampaign: { ...(state.activeJournalChapterIdByCampaign ?? {}), [campaignId]: nextActiveId },
    });
  };

  const toggleCollapsed = (id: string) => {
    writeJournal(chapters.map(c => c.id === id ? { ...c, collapsed: !c.collapsed } : c));
  };

  const addChapter = () => {
    const id = uid('chap');
    const next: JournalChapter = { id, title: `Chapter ${chapters.length + 1}`, html: '', collapsed: false };
    writeJournal([...chapters, next], id);
    setEditingId(id);
  };

  const removeChapter = (id: string) => {
    const c = chapters.find(x => x.id === id);
    if (!c) return;
    if (!confirm(`Delete "${c.title}"?`)) return;
    const nextList = chapters.filter(x => x.id !== id);
    const nextActive = nextList[0]?.id;
    writeJournal(nextList, nextActive);
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
    writeJournal(next);
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
    writeJournal(chapters, id);
    setEditingId(id);
    // focus shortly after paint
    window.setTimeout(() => editorRef.current?.focus(), 50);
  };

  
  // Extract a chapter title from the *first non-empty block* of content.
  // We intentionally do NOT concatenate multiple blocks: logs/rolls often append
  // more text and should not become part of the title.
  const extractChapterTitleFromHtml = (html: string): string => {
    try {
      const root = document.createElement('div');
      root.innerHTML = html || '';

      // Prefer the *first heading* (h1/h2/h3) in document order.
      const firstHeading = root.querySelector('h1, h2, h3') as HTMLElement | null;
      if (firstHeading) {
        const cleaned = String(firstHeading.innerText ?? firstHeading.textContent ?? '').replace(/\r/g, '').trim();
        if (cleaned) {
          const firstLine = cleaned.split(/\n/).map(s => s.trim()).filter(Boolean)[0] ?? '';
          const out = firstLine.replace(/\s+/g, ' ').trim();
          return out.length > 60 ? (out.slice(0, 57) + '…') : out;
        }
      }

      // Otherwise pick the first *block-like* element that contains text.
      const blocks = root.querySelectorAll('p, blockquote, li, div');
      for (const el of Array.from(blocks) as HTMLElement[]) {
        const cleaned = String(el.innerText ?? el.textContent ?? '').replace(/\r/g, '').trim();
        if (!cleaned) continue;
        // Only the first line, so a paragraph doesn't become huge.
        const firstLine = cleaned.split(/\n/).map(s => s.trim()).filter(Boolean)[0] ?? '';
        const out = firstLine.replace(/\s+/g, ' ').trim();
        return out.length > 60 ? (out.slice(0, 57) + '…') : out;
      }

      // Fallback: first non-empty line from total text.
      const raw = (root.innerText || root.textContent || '').replace(/\r/g, '');
      const first = raw.split(/\n/).map(s => s.trim()).filter(Boolean)[0] ?? '';
      const out = first.replace(/\s+/g, ' ').trim();
      return out.length > 60 ? (out.slice(0, 57) + '…') : out;
    } catch {
      return '';
    }
  };

const updateChapter = () => {
    if (!editing) return;
    const nextHtml = editorRef.current ? editorRef.current.innerHTML : draftHtml;
    const nextTitle = extractChapterTitleFromHtml(nextHtml);
    writeJournal(chapters.map(c => (c.id === editing.id ? { ...c, html: nextHtml, title: nextTitle || c.title } : c)), editing.id);
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
          <div key={c.id} className="chapterCard">
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
                <button className="btn btn-danger" aria-label="Delete" onClick={() => removeChapter(c.id)}>🗑️</button>
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
                  <div className="editorToolbarRow">
                    <select
                      className="input"
                      style={{ width: 160, paddingTop: 8, paddingBottom: 8 }}
                      defaultValue="P"
                      onChange={(e) => setBlock(e.target.value as any)}
                    >
                      <option value="P">Paragraph</option>
                      <option value="H1">Heading 1</option>
                      <option value="H2">Heading 2</option>
                      <option value="H3">Heading 3</option>
                    </select>

                    <div className="editorToolbarButtons" role="group" aria-label="Text formatting">
                      <button className="btn" aria-label="Bold" onClick={() => exec('bold')}><b>B</b></button>
                      <button className="btn" aria-label="Italic" onClick={() => exec('italic')}><i>I</i></button>
                      <button className="btn" aria-label="Underline" onClick={() => exec('underline')}><span style={{ textDecoration: 'underline' }}>U</span></button>
                      <button className="btn" aria-label="Bulleted list" onClick={() => exec('insertUnorderedList')}>•</button>
                      <button className="btn" aria-label="Numbered list" onClick={() => exec('insertOrderedList')}>1.</button>
                    </div>
                  </div>
                </div>

                <div
                  ref={editorRef}
                  className="richEditor"
                  contentEditable
                  suppressContentEditableWarning
                  onInput={() => setDraftHtml(editorRef.current?.innerHTML ?? '')}
                />

                <button className="btn" style={{ width: '100%', marginTop: 10, marginBottom: 12 }} onClick={updateChapter}>
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
