import React, { useEffect, useMemo, useRef, useState } from 'react';
import { axialKey, axialToPixel, hexCorners, pixelToAxial } from '../core/hex';
import { StoredState } from '../core/storage';

type CategoryName =
  | 'None'
  | 'Rumour'
  | 'Hazard'
  | 'Encounter'
  | 'Location'
  | 'Clue'
  | 'Camp'
  | 'Quest'
  | 'NPC';

type CatColors = Record<CategoryName, string>;

const DEFAULT_COLORS: CatColors = {
  None: '#b6c8ff',
  Rumour: '#ffd98a',
  Hazard: '#ff6b6b',
  Encounter: '#ff9f43',
  Location: '#54a0ff',
  Clue: '#f368e0',
  Camp: '#1dd1a1',
  Quest: '#feca57',
  NPC: '#48dbfb',
};

const CATEGORIES: CategoryName[] = ['None','Rumour','Hazard','Encounter','Location','Clue','Camp','Quest','NPC'];

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/**
 * Backwards-compatible encoding:
 * - If note starts with "@cat:Something\n", we parse it.
 * - Otherwise: category = "None", text = full note.
 */
function parseNote(raw: string | undefined | null): { category: CategoryName; text: string } {
  const s = (raw ?? '').toString();
  const m = s.match(/^@cat:([^\n\r]+)\s*[\n\r]+([\s\S]*)$/);
  if (m) {
    const catRaw = (m[1] ?? '').trim();
    const cat = (CATEGORIES.includes(catRaw as CategoryName) ? (catRaw as CategoryName) : 'None');
    return { category: cat, text: (m[2] ?? '').trimStart() };
  }
  return { category: 'None', text: s };
}

function buildNote(category: CategoryName, text: string): string {
  const t = text ?? '';
  if (!t.trim() && category === 'None') return '';
  if (category === 'None') return t;
  return `@cat:${category}\n${t}`;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Failed to read file'));
    r.readAsDataURL(file);
  });
}

export default function MapPanel({ state, setState }: { state: StoredState; setState: (s: StoredState) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [selected, setSelected] = useState<string>('');

  // Category color settings (kept in localStorage to avoid changing StoredState types)
  const [catColors, setCatColors] = useState<CatColors>(() => {
    try {
      const raw = localStorage.getItem('tor_map_category_colors');
      if (!raw) return DEFAULT_COLORS;
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_COLORS, ...(parsed ?? {}) };
    } catch {
      return DEFAULT_COLORS;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('tor_map_category_colors', JSON.stringify(catColors));
    } catch {
      // ignore
    }
  }, [catColors]);

  // Alignment helpers
  const [nudgeStep, setNudgeStep] = useState<number>(2); // pixels
  const dragRef = useRef<{ dragging: boolean; lastX: number; lastY: number }>({ dragging: false, lastX: 0, lastY: 0 });

  const map = state.map;

  const bgImg = useMemo(() => {
    if (!map.backgroundDataUrl) return null;
    const img = new Image();
    img.src = map.backgroundDataUrl;
    return img;
  }, [map.backgroundDataUrl]);

  // --- Drawing loop ---
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    const draw = () => {
      const w = c.width, h = c.height;
      ctx.clearRect(0, 0, w, h);

      // background
      if (bgImg && bgImg.complete) {
        const scale = Math.min(w / bgImg.width, h / bgImg.height);
        const dw = bgImg.width * scale;
        const dh = bgImg.height * scale;
        const dx = (w - dw) / 2;
        const dy = (h - dh) / 2;
        ctx.drawImage(bgImg, dx, dy, dw, dh);
      } else {
        ctx.fillStyle = '#0b0f14';
        ctx.fillRect(0, 0, w, h);
      }

      // hex overlay
      const size = map.hexSize;
      const origin = map.origin;
      const cols = 40;
      const rows = 30;

      ctx.save();

      // grid lines
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = '#b6c8ff';
      ctx.lineWidth = 1;

      for (let r = -rows; r <= rows; r++) {
        for (let q = -cols; q <= cols; q++) {
          const center = axialToPixel({ q, r }, size, origin);
          if (center.x < -size || center.x > w + size || center.y < -size || center.y > h + size) continue;

          const corners = hexCorners(center, size);
          ctx.beginPath();
          ctx.moveTo(corners[0]!.x, corners[0]!.y);
          for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i]!.x, corners[i]!.y);
          ctx.closePath();
          ctx.stroke();

          // event dot (colored by category)
          const key = axialKey({ q, r });
          const rawNote = map.notes[key];
          if (rawNote) {
            const parsed = parseNote(rawNote);
            const col = catColors[parsed.category] ?? catColors.None;

            ctx.fillStyle = col;
            ctx.globalAlpha = 0.75;
            ctx.beginPath();
            ctx.arc(center.x, center.y, 3, 0, Math.PI * 2);
            ctx.fill();

            // restore grid alpha/style for next operations
            ctx.globalAlpha = 0.35;
            ctx.fillStyle = '#b6c8ff';
          }
        }
      }

      // highlight selection
      if (selected) {
        const a = selected.match(/q:(-?\d+),r:(-?\d+)/);
        if (a) {
          const q = parseInt(a[1], 10), r = parseInt(a[2], 10);
          const center = axialToPixel({ q, r }, size, origin);
          const corners = hexCorners(center, size);

          ctx.globalAlpha = 0.9;
          ctx.strokeStyle = '#ffd98a';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(corners[0]!.x, corners[0]!.y);
          for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i]!.x, corners[i]!.y);
          ctx.closePath();
          ctx.stroke();
        }
      }

      ctx.restore();
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [bgImg, map.hexSize, map.origin, map.notes, selected, catColors]);

  const onPickBackground = async (file: File) => {
    const dataUrl = await fileToDataUrl(file);
    setState({ ...state, map: { ...map, backgroundDataUrl: dataUrl } });
  };

  // Canvas: click selects hex
  const onCanvasClick = (ev: React.MouseEvent) => {
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    const x = (ev.clientX - rect.left) * (c.width / rect.width);
    const y = (ev.clientY - rect.top) * (c.height / rect.height);
    const axial = pixelToAxial({ x, y }, map.hexSize, map.origin);
    setSelected(axialKey(axial));
  };

  // Canvas: drag to move origin (alignment helper)
  const onMouseDown = (ev: React.MouseEvent) => {
    // Left click drag = pan grid origin (does not prevent selection click; selection handled on click)
    dragRef.current.dragging = true;
    dragRef.current.lastX = ev.clientX;
    dragRef.current.lastY = ev.clientY;
  };

  const onMouseUp = () => {
    dragRef.current.dragging = false;
  };

  const onMouseMove = (ev: React.MouseEvent) => {
    if (!dragRef.current.dragging) return;
    const dx = ev.clientX - dragRef.current.lastX;
    const dy = ev.clientY - dragRef.current.lastY;
    dragRef.current.lastX = ev.clientX;
    dragRef.current.lastY = ev.clientY;

    // Move origin by dx/dy pixels (scaled to canvas)
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    const scaleX = c.width / rect.width;
    const scaleY = c.height / rect.height;

    const ox = map.origin.x + dx * scaleX;
    const oy = map.origin.y + dy * scaleY;

    setState({ ...state, map: { ...map, origin: { x: ox, y: oy } } });
  };

  // Canvas: wheel to adjust hex size (alignment helper)
  const onWheel = (ev: React.WheelEvent) => {
    ev.preventDefault();
    const delta = ev.deltaY;
    // smooth steps
    const next = clamp(map.hexSize + (delta > 0 ? -0.5 : 0.5), 2, 120);
    setState({ ...state, map: { ...map, hexSize: next } });
  };

  // Keyboard nudges (alignment helper)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // ignore typing in inputs/textareas
      const tag = (document.activeElement?.tagName ?? '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || (document.activeElement as any)?.isContentEditable) return;

      if (e.key === 'ArrowLeft') {
        setState({ ...state, map: { ...map, origin: { x: map.origin.x - nudgeStep, y: map.origin.y } } });
      } else if (e.key === 'ArrowRight') {
        setState({ ...state, map: { ...map, origin: { x: map.origin.x + nudgeStep, y: map.origin.y } } });
      } else if (e.key === 'ArrowUp') {
        setState({ ...state, map: { ...map, origin: { x: map.origin.x, y: map.origin.y - nudgeStep } } });
      } else if (e.key === 'ArrowDown') {
        setState({ ...state, map: { ...map, origin: { x: map.origin.x, y: map.origin.y + nudgeStep } } });
      } else if (e.key === '+' || e.key === '=') {
        setState({ ...state, map: { ...map, hexSize: clamp(map.hexSize + 0.5, 2, 120) } });
      } else if (e.key === '-' || e.key === '_') {
        setState({ ...state, map: { ...map, hexSize: clamp(map.hexSize - 0.5, 2, 120) } });
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [state, setState, map, nudgeStep]);

  // Selected hex note/category
  const selectedRaw = selected ? (map.notes[selected] ?? '') : '';
  const parsedSelected = useMemo(() => parseNote(selectedRaw), [selectedRaw]);
  const selectedCategory = parsedSelected.category;
  const selectedText = parsedSelected.text;

  const saveNote = (category: CategoryName, text: string) => {
    if (!selected) return;
    const notes = { ...map.notes };
    const built = buildNote(category, text);
    if (!built.trim()) delete notes[selected];
    else notes[selected] = built;
    setState({ ...state, map: { ...map, notes } });
  };

  // Nudge buttons
  const nudgeOrigin = (dx: number, dy: number) => {
    setState({ ...state, map: { ...map, origin: { x: map.origin.x + dx, y: map.origin.y + dy } } });
  };

  const setCategoryColor = (cat: CategoryName, color: string) => {
    setCatColors((prev) => ({ ...prev, [cat]: color }));
  };

  return (
    <div className="card">
      <div className="h2">Eriador Map (hex overlay)</div>
      <div className="muted small">
        Tips: drag on the canvas to move the grid (origin). Use the mouse wheel to change hex size. Arrow keys nudge origin; +/− adjusts size.
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <div className="col">
          <label className="small muted">Background image</label>
          <input
            className="input"
            type="file"
            accept="image/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onPickBackground(f);
            }}
          />
          <div className="small muted" style={{ marginTop: 6 }}>
            Tip: export the Eriador map page as PNG/JPG. We store it locally as a data URL.
          </div>
        </div>

        <div className="col">
          <div className="kv">
            <label className="small muted">Hex size</label>
            <input
              className="input"
              type="number"
              min={2}
              max={120}
              step={0.5}
              value={map.hexSize}
              onChange={(e) => {
                const raw = parseFloat(e.target.value || '28');
                const safe = Number.isFinite(raw) ? raw : 28;
                const clamped = clamp(safe, 2, 120);
                setState({ ...state, map: { ...map, hexSize: clamped } });
              }}
            />

            <label className="small muted">Origin X</label>
            <input
              className="input"
              type="number"
              value={map.origin.x}
              onChange={(e) =>
                setState({
                  ...state,
                  map: { ...map, origin: { ...map.origin, x: parseFloat(e.target.value || '0') } },
                })
              }
            />

            <label className="small muted">Origin Y</label>
            <input
              className="input"
              type="number"
              value={map.origin.y}
              onChange={(e) =>
                setState({
                  ...state,
                  map: { ...map, origin: { ...map.origin, y: parseFloat(e.target.value || '0') } },
                })
              }
            />
          </div>

          <div className="row" style={{ marginTop: 10, alignItems: 'center', gap: 10 }}>
            <div className="col">
              <label className="small muted">Nudge step (px)</label>
              <input
                className="input"
                type="number"
                min={0.5}
                max={50}
                step={0.5}
                value={nudgeStep}
                onChange={(e) => setNudgeStep(clamp(parseFloat(e.target.value || '2'), 0.5, 50))}
              />
              <div className="small muted" style={{ marginTop: 6 }}>
                Use arrows or buttons below for fine alignment.
              </div>
            </div>

            <div className="col">
              <div className="small muted">Nudge origin</div>
              <div className="row" style={{ gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                <button className="btn" onClick={() => nudgeOrigin(0, -nudgeStep)}>↑</button>
                <button className="btn" onClick={() => nudgeOrigin(-nudgeStep, 0)}>←</button>
                <button className="btn" onClick={() => nudgeOrigin(nudgeStep, 0)}>→</button>
                <button className="btn" onClick={() => nudgeOrigin(0, nudgeStep)}>↓</button>
              </div>
            </div>
          </div>

          <div className="small muted" style={{ marginTop: 10 }}>
            Alignment workflow suggestion:
            <ol style={{ marginTop: 6 }}>
              <li>Set a rough hex size with mouse wheel until spacing looks close.</li>
              <li>Drag the grid so one obvious printed hex corner/center matches.</li>
              <li>Then nudge with step 0.5–2px for perfection.</li>
              <li>If it matches in one area but drifts elsewhe
