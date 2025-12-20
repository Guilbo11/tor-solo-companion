```tsx
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

const CATEGORIES: CategoryName[] = ['None', 'Rumour', 'Hazard', 'Encounter', 'Location', 'Clue', 'Camp', 'Quest', 'NPC'];

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

/**
 * Calibration assumptions:
 * pointy-top axial layout (RedBlob style)
 * Neighbor vectors (in pixels, multiplied by size):
 * East:      (sqrt(3), 0)
 * NE:        (sqrt(3)/2, -3/2)
 * NW:        (-sqrt(3)/2, -3/2)
 * West:      (-sqrt(3), 0)
 * SW:        (-sqrt(3)/2, 3/2)
 * SE:        (sqrt(3)/2, 3/2)
 */
type CalibDir = 'E' | 'NE' | 'NW' | 'W' | 'SW' | 'SE';

const CALIB_DIRS: { id: CalibDir; label: string; unit: { x: number; y: number } }[] = [
  { id: 'E', label: 'East / West (horizontal)', unit: { x: Math.sqrt(3), y: 0 } },
  { id: 'NE', label: 'North-East', unit: { x: Math.sqrt(3) / 2, y: -1.5 } },
  { id: 'NW', label: 'North-West', unit: { x: -Math.sqrt(3) / 2, y: -1.5 } },
  { id: 'W', label: 'West / East (horizontal)', unit: { x: -Math.sqrt(3), y: 0 } },
  { id: 'SW', label: 'South-West', unit: { x: -Math.sqrt(3) / 2, y: 1.5 } },
  { id: 'SE', label: 'South-East', unit: { x: Math.sqrt(3) / 2, y: 1.5 } },
];

function pointFromMouse(ev: React.MouseEvent, canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  const x = (ev.clientX - rect.left) * (canvas.width / rect.width);
  const y = (ev.clientY - rect.top) * (canvas.height / rect.height);
  return { x, y };
}

export default function MapPanel({ state, setState }: { state: StoredState; setState: (s: StoredState) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [selected, setSelected] = useState<string>('');

  // Category color settings (localStorage so we don't need to change StoredState)
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
  const [nudgeStep, setNudgeStep] = useState<number>(2); // px
  const dragRef = useRef<{ dragging: boolean; lastX: number; lastY: number }>({ dragging: false, lastX: 0, lastY: 0 });

  // 🔒 Grid lock (prevents drag + wheel + keyboard nudges)
  const [gridLocked, setGridLocked] = useState<boolean>(false);

  // Calibration mode
  const [calibOn, setCalibOn] = useState(false);
  const [calibDir, setCalibDir] = useState<CalibDir>('E');
  const [calibP1, setCalibP1] = useState<{ x: number; y: number } | null>(null);
  const [calibP2, setCalibP2] = useState<{ x: number; y: number } | null>(null);

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
      const w = c.width,
        h = c.height;
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

            ctx.globalAlpha = 0.35;
            ctx.fillStyle = '#b6c8ff';
          }
        }
      }

      // highlight selection
      if (selected) {
        const a = selected.match(/q:(-?\d+),r:(-?\d+)/);
        if (a) {
          const q = parseInt(a[1], 10),
            r = parseInt(a[2], 10);
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

      // calibration markers
      if (calibOn) {
        ctx.globalAlpha = 1.0;
        if (calibP1) {
          ctx.fillStyle = '#00ff88';
          ctx.beginPath();
          ctx.arc(calibP1.x, calibP1.y, 5, 0, Math.PI * 2);
          ctx.fill();
        }
        if (calibP2) {
          ctx.fillStyle = '#ff4d4d';
          ctx.beginPath();
          ctx.arc(calibP2.x, calibP2.y, 5, 0, Math.PI * 2);
          ctx.fill();
        }
        if (calibP1 && calibP2) {
          ctx.strokeStyle = 'rgba(255,255,255,0.7)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(calibP1.x, calibP1.y);
          ctx.lineTo(calibP2.x, calibP2.y);
          ctx.stroke();
        }
      }

      ctx.restore();
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [bgImg, map.hexSize, map.origin, map.notes, selected, catColors, calibOn, calibP1, calibP2]);

  const onPickBackground = async (file: File) => {
    const dataUrl = await fileToDataUrl(file);
    setState({ ...state, map: { ...map, backgroundDataUrl: dataUrl } });
  };

  // Canvas: click selects hex OR does calibration
  const onCanvasClick = (ev: React.MouseEvent) => {
    const c = canvasRef.current!;
    const p = pointFromMouse(ev, c);

    if (calibOn) {
      if (!calibP1) {
        setCalibP1(p);
        setCalibP2(null);
        return;
      }
      if (!calibP2) {
        setCalibP2(p);

        const dx = p.x - calibP1.x;
        const dy = p.y - calibP1.y;

        const dir = CALIB_DIRS.find((d) => d.id === calibDir) ?? CALIB_DIRS[0]!;
        const ux = dir.unit.x;
        const uy = dir.unit.y;

        const denom = ux * ux + uy * uy;
        const size = denom > 0 ? (dx * ux + dy * uy) / denom : map.hexSize;

        const safeSize = clamp(size, 2, 120);
        const origin = { x: calibP1.x, y: calibP1.y };

        setState({ ...state, map: { ...map, hexSize: safeSize, origin } });

        // After calibration, lock the grid by default (prevents accidental moves)
        setGridLocked(true);
        setCalibOn(false);
        setCalibP1(null);
        setCalibP2(null);
        return;
      }

      setCalibP1(p);
      setCalibP2(null);
      return;
    }

    // Normal selection
    const axial = pixelToAxial({ x: p.x, y: p.y }, map.hexSize, map.origin);
    setSelected(axialKey(axial));
  };

  // Canvas: drag to move origin (alignment helper)
  const onMouseDown = (ev: React.MouseEvent) => {
    if (calibOn || gridLocked) return;
    dragRef.current.dragging = true;
    dragRef.current.lastX = ev.clientX;
    dragRef.current.lastY = ev.clientY;
  };

  const onMouseUp = () => {
    dragRef.current.dragging = false;
  };

  const onMouseMove = (ev: React.MouseEvent) => {
    if (calibOn || gridLocked) return;
    if (!dragRef.current.dragging) return;

    const dxCss = ev.clientX - dragRef.current.lastX;
    const dyCss = ev.clientY - dragRef.current.lastY;
    dragRef.current.lastX = ev.clientX;
    dragRef.current.lastY = ev.clientY;

    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    const scaleX = c.width / rect.width;
    const scaleY = c.height / rect.height;

    const ox = map.origin.x + dxCss * scaleX;
    const oy = map.origin.y + dyCss * scaleY;

    setState({ ...state, map: { ...map, origin: { x: ox, y: oy } } });
  };

  // Canvas: wheel to adjust hex size (alignment helper)
  const onWheel = (ev: React.WheelEvent) => {
    if (calibOn || gridLocked) return;
    ev.preventDefault();
    const delta = ev.deltaY;
    const next = clamp(map.hexSize + (delta > 0 ? -0.5 : 0.5), 2, 120);
    setState({ ...state, map: { ...map, hexSize: next } });
  };

  // Keyboard nudges
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (gridLocked) return;

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
  }, [state, setState, map, nudgeStep, gridLocked]);

  // Selected hex note/category
  const selectedRaw = selected ? map.notes[selected] ?? '' : '';
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

  const nudgeOrigin = (dx: number, dy: number) => {
    if (gridLocked) return;
    setState({ ...state, map: { ...map, origin: { x: map.origin.x + dx, y: map.origin.y + dy } } });
  };

  const setCategoryColor = (cat: CategoryName, color: string) => {
    setCatColors((prev) => ({ ...prev, [cat]: color }));
  };

  const resetCalibration = () => {
    setCalibP1(null);
    setCalibP2(null);
  };

  return (
    <div className="card">
      <div className="h2">Eriador Map (hex overlay)</div>
      <div className="muted small">Calibration: 2 clicks. Then lock grid to avoid accidental moves.</div>

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

          <div style={{ marginTop: 12 }}>
            <div className="h2" style={{ fontSize: 16 }}>
              Calibration
            </div>
            <div className="row" style={{ gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <label className="small muted">
                <input
                  type="checkbox"
                  checked={calibOn}
                  onChange={(e) => {
                    if (gridLocked && e.target.checked) return; // don't allow calibration while locked
                    setCalibOn(e.target.checked);
                    resetCalibration();
                  }}
                  style={{ marginRight: 8 }}
                  disabled={gridLocked}
                />
                Enable calibration mode
              </label>

              <select
                className="input"
                value={calibDir}
                onChange={(e) => setCalibDir(e.target.value as CalibDir)}
                disabled={!calibOn || gridLocked}
                style={{ minWidth: 240 }}
              >
                {CALIB_DIRS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>

              <button className="btn" onClick={resetCalibration} disabled={!calibOn || gridLocked}>
                Reset points
              </button>
            </div>

            <div className="small muted" style={{ marginTop: 6 }}>
              Steps:
              <ol style={{ marginTop: 6 }}>
                <li>Enable calibration.</li>
                <li>Choose direction (usually “East/West”).</li>
                <li>Click center of one printed hex (green dot).</li>
                <li>Click center of adjacent hex in that direction (red dot).</li>
              </ol>
              After calibration, grid auto-locks (you can unlock below to fine tune).
            </div>

            <div className="row" style={{ marginTop: 10, gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <label className="small muted">
                <input
                  type="checkbox"
                  checked={gridLocked}
                  onChange={(e) => {
                    setGridLocked(e.target.checked);
                    // if locking, also stop calibration
                    if (e.target.checked) {
                      setCalibOn(false);
                      resetCalibration();
                    }
                  }}
                  style={{ marginRight: 8 }}
                />
                🔒 Lock grid position/size (disable drag + wheel + keyboard nudges)
              </label>

              {!gridLocked && (
                <div className="small muted">
                  Tip: once aligned, lock it to prevent accidental changes.
                </div>
              )}
            </div>
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
              disabled={gridLocked}
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
              disabled={gridLocked}
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
              disabled={gridLocked}
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
                disabled={gridLocked}
                onChange={(e) => setNudgeStep(clamp(parseFloat(e.target.value || '2'), 0.5, 50))}
              />
              <div className="small muted" style={{ marginTop: 6 }}>
                Arrow keys move origin. + / − adjust hex size.
              </div>
            </div>

            <div className="col">
              <div className="small muted">Nudge origin</div>
              <div className="row" style={{ gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                <button className="btn" onClick={() => nudgeOrigin(0, -nudgeStep)} disabled={gridLocked}>
                  ↑
                </button>
                <button className="btn" onClick={() => nudgeOrigin(-nudgeStep, 0)} disabled={gridLocked}>
                  ←
                </button>
                <button className="btn" onClick={() => nudgeOrigin(nudgeStep, 0)} disabled={gridLocked}>
                  →
                </button>
                <button className="btn" onClick={() => nudgeOrigin(0, nudgeStep)} disabled={gridLocked}>
                  ↓
                </button>
              </div>
            </div>
          </div>

          <div className="small muted" style={{ marginTop: 10 }}>
            If alignment drifts on the edges, your image may be stretched/low-res. Try a higher-res export.
          </div>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <canvas
          ref={canvasRef}
          width={1024}
          height={640}
          onClick={onCanvasClick}
          onMouseDown={onMouseDown}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onMouseMove={onMouseMove}
          onWheel={onWheel}
          style={{ cursor: calibOn ? 'crosshair' : gridLocked ? 'default' : dragRef.current.dragging ? 'grabbing' : 'grab' }}
        />
      </div>

      <hr />

      <div className="row">
        <div className="col">
          <div className="badge">Selected hex</div>
          <div style={{ marginTop: 8, fontWeight: 700 }}>{selected || '—'}</div>
          <div className="small muted">Click a hex to select. Add a category + note/event.</div>

          <div style={{ marginTop: 12 }}>
            <label className="small muted">Category</label>
            <select
              className="input"
              value={selectedCategory}
              onChange={(e) => saveNote(e.target.value as CategoryName, selectedText)}
              disabled={!selected}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <div className="row" style={{ marginTop: 8, alignItems: 'center', gap: 10 }}>
              <div className="small muted">Dot color for this category</div>
              <input
                type="color"
                value={catColors[selectedCategory] ?? '#ffffff'}
                onChange={(e) => setCategoryColor(selectedCategory, e.target.value)}
                disabled={!selected}
                title="Pick dot color"
              />
              <div className="small muted">
                {selected ? `Used for all hexes tagged "${selectedCategory}".` : 'Select a hex first.'}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <div className="small muted">Legend</div>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
              {CATEGORIES.filter((c) => c !== 'None').map((c) => (
                <div key={c} className="row" style={{ gap: 6, alignItems: 'center' }}>
                  <span style={{ width: 10, height: 10, borderRadius: 999, background: catColors[c] }} />
                  <span className="small">{c}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="col">
          <label className="small muted">Note for selected hex</label>
          <textarea
            className="input"
            style={{ minHeight: 110 }}
            value={selected ? selectedText : ''}
            onChange={(e) => saveNote(selectedCategory, e.target.value)}
            placeholder="Rumour, hazard, NPC, camp..."
            disabled={!selected}
          />
          <div className="small muted" style={{ marginTop: 6 }}>
            Category is stored inside the note using a hidden prefix (<code>@cat:Category</code>) for compatibility.
          </div>
        </div>
      </div>
    </div>
  );
}
```
