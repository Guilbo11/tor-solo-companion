import React, { useEffect, useMemo, useRef, useState } from 'react';
import { axialKey, axialToPixel, hexCorners, pixelToAxial } from '../core/hex';
import { CalibDir, StoredState } from '../core/storage';

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

function screenToWorld(p: { x: number; y: number }, zoom: number, pan: { x: number; y: number }) {
  return { x: (p.x - pan.x) / zoom, y: (p.y - pan.y) / zoom };
}

function parseNote(raw: string | undefined | null): { category: CategoryName; text: string } {
  const s = (raw ?? '').toString();
  const m = s.match(/^@cat:([^\n\r]+)\s*[\n\r]+([\s\S]*)$/);
  if (m) {
    const catRaw = (m[1] ?? '').trim();
    const cat = CATEGORIES.includes(catRaw as CategoryName) ? (catRaw as CategoryName) : 'None';
    return { category: cat, text: (m[2] ?? '').trimStart() };
  }
  return { category: 'None', text: s };
}

function buildNote(category: CategoryName, text: string): string {
  const t = text ?? '';
  if (!t.trim() && category === 'None') return '';
  if (category === 'None') return t;
  return '@cat:' + category + '\n' + t;
}

function pointFromMouseLike(ev: { clientX: number; clientY: number }, canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  const x = (ev.clientX - rect.left) * (canvas.width / rect.width);
  const y = (ev.clientY - rect.top) * (canvas.height / rect.height);
  return { x, y };
}

const CALIB_DIRS: { id: CalibDir; label: string; unit: { x: number; y: number } }[] = [
  { id: 'E', label: 'East / West (horizontal)', unit: { x: Math.sqrt(3), y: 0 } },
  { id: 'NE', label: 'North-East', unit: { x: Math.sqrt(3) / 2, y: -1.5 } },
  { id: 'NW', label: 'North-West', unit: { x: -Math.sqrt(3) / 2, y: -1.5 } },
  { id: 'W', label: 'West / East (horizontal)', unit: { x: -Math.sqrt(3), y: 0 } },
  { id: 'SW', label: 'South-West', unit: { x: -Math.sqrt(3) / 2, y: 1.5 } },
  { id: 'SE', label: 'South-East', unit: { x: Math.sqrt(3) / 2, y: 1.5 } },
];

function fileToCompressedDataUrl(file: File, opts?: { maxWidth?: number; quality?: number }): Promise<string> {
  const maxWidth = opts?.maxWidth ?? 1600;
  const quality = opts?.quality ?? 0.82;

  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error('Failed to read file'));
    r.onload = () => {
      const src = String(r.result);
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to load image'));
      img.onload = () => {
        try {
          const scale = img.width > maxWidth ? maxWidth / img.width : 1;
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));

          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;

          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('No canvas context');
          ctx.drawImage(img, 0, 0, w, h);

          const out = canvas.toDataURL('image/jpeg', quality);
          resolve(out);
        } catch (e) {
          reject(e instanceof Error ? e : new Error('Failed to compress image'));
        }
      };
      img.src = src;
    };
    r.readAsDataURL(file);
  });
}

type PointerInfo = { x: number; y: number };

export default function MapPanel({ state, setState }: { state: StoredState; setState: (s: StoredState) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [selected, setSelected] = useState<string>('');

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

  const map = state.map;

  const gridLocked = map.gridLocked ?? false;
  const nudgeStep = map.nudgeStep ?? 2;
  const calibDir = (map.calibDir ?? 'E') as CalibDir;

  const zoom = map.zoom ?? 1;
  const pan = map.pan ?? { x: 0, y: 0 };

  const setMap = (patch: Partial<typeof map>) => setState({ ...state, map: { ...map, ...patch } });

  const setGridLocked = (locked: boolean) => setMap({ gridLocked: locked });
  const setNudgeStep = (v: number) => setMap({ nudgeStep: v });
  const setCalibDir = (d: CalibDir) => setMap({ calibDir: d });

  const setZoomPan = (nextZoom: number, nextPan: { x: number; y: number }) => setMap({ zoom: nextZoom, pan: nextPan });

  const resetView = () => setZoomPan(1, { x: 0, y: 0 });

  // Calibration (UI-only)
  const [calibOn, setCalibOn] = useState(false);
  const [calibP1, setCalibP1] = useState<{ x: number; y: number } | null>(null);
  const [calibP2, setCalibP2] = useState<{ x: number; y: number } | null>(null);

  const resetCalibration = () => {
    setCalibP1(null);
    setCalibP2(null);
  };

  const bgImg = useMemo(() => {
    if (!map.backgroundDataUrl) return null;
    const img = new Image();
    img.src = map.backgroundDataUrl;
    return img;
  }, [map.backgroundDataUrl]);

  const pointersRef = useRef<Map<number, PointerInfo>>(new Map());

  // ✅ drag state with click-vs-drag threshold
  const dragRef = useRef<{
    mode: 'none' | 'pan' | 'origin';
    start: { x: number; y: number } | null; // screen coords
    last: { x: number; y: number } | null;  // screen coords
    moved: boolean;
  }>({ mode: 'none', start: null, last: null, moved: false });

  const pinchRef = useRef<{
    active: boolean;
    initialDist: number;
    initialZoom: number;
    worldAnchor: { x: number; y: number };
  }>({ active: false, initialDist: 0, initialZoom: 1, worldAnchor: { x: 0, y: 0 } });

  const distance = (a: PointerInfo, b: PointerInfo) => Math.hypot(a.x - b.x, a.y - b.y);
  const center = (a: PointerInfo, b: PointerInfo) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  const zoomAtScreenPoint = (screenP: { x: number; y: number }, factor: number) => {
    const beforeWorld = screenToWorld(screenP, zoom, pan);
    const nextZoom = clamp(zoom * factor, 0.3, 5);
    const nextPan = {
      x: screenP.x - beforeWorld.x * nextZoom,
      y: screenP.y - beforeWorld.y * nextZoom,
    };
    setZoomPan(nextZoom, nextPan);
  };

  const centerOnSelected = () => {
    const c = canvasRef.current;
    if (!c || !selected) return;

    const m = selected.match(/q:(-?\d+),r:(-?\d+)/);
    if (!m) return;

    const q = parseInt(m[1], 10);
    const r = parseInt(m[2], 10);

    const centerW = axialToPixel({ q, r }, map.hexSize, map.origin);
    const targetScreen = { x: c.width / 2, y: c.height / 2 };

    const nextPan = {
      x: targetScreen.x - centerW.x * zoom,
      y: targetScreen.y - centerW.y * zoom,
    };

    setZoomPan(zoom, nextPan);
  };

  // --- Drawing loop ---
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;

    let raf = 0;

    const draw = () => {
      const W = c.width;
      const H = c.height;

      ctx.clearRect(0, 0, W, H);

      ctx.save();
      ctx.setTransform(zoom, 0, 0, zoom, pan.x, pan.y);

      const left = -pan.x / zoom;
      const top = -pan.y / zoom;
      const right = (W - pan.x) / zoom;
      const bottom = (H - pan.y) / zoom;

      if (bgImg && bgImg.complete) {
        const scale = Math.min(W / bgImg.width, H / bgImg.height);
        const dw = bgImg.width * scale;
        const dh = bgImg.height * scale;
        const dx = (W - dw) / 2;
        const dy = (H - dh) / 2;
        ctx.drawImage(bgImg, dx, dy, dw, dh);
      } else {
        ctx.fillStyle = '#0b0f14';
        ctx.fillRect(0, 0, W, H);
      }

      const size = map.hexSize;
      const origin = map.origin;
      const cols = 40;
      const rows = 30;

      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = '#b6c8ff';
      ctx.lineWidth = 1 / zoom;

      for (let rr = -rows; rr <= rows; rr++) {
        for (let qq = -cols; qq <= cols; qq++) {
          const centerW = axialToPixel({ q: qq, r: rr }, size, origin);

          if (centerW.x < left - size || centerW.x > right + size || centerW.y < top - size || centerW.y > bottom + size) {
            continue;
          }

          const corners = hexCorners(centerW, size);
          ctx.beginPath();
          ctx.moveTo(corners[0]!.x, corners[0]!.y);
          for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i]!.x, corners[i]!.y);
          ctx.closePath();
          ctx.stroke();

          const key = axialKey({ q: qq, r: rr });
          const rawNote = map.notes[key];
          if (rawNote) {
            const parsed = parseNote(rawNote);
            const col = catColors[parsed.category] ?? catColors.None;

            ctx.fillStyle = col;
            ctx.globalAlpha = 0.75;
            ctx.beginPath();
            ctx.arc(centerW.x, centerW.y, 3 / zoom, 0, Math.PI * 2);
            ctx.fill();

            ctx.globalAlpha = 0.35;
            ctx.fillStyle = '#b6c8ff';
          }
        }
      }

      if (selected) {
        const a = selected.match(/q:(-?\d+),r:(-?\d+)/);
        if (a) {
          const q = parseInt(a[1], 10);
          const r = parseInt(a[2], 10);
          const centerW = axialToPixel({ q, r }, size, origin);
          const corners = hexCorners(centerW, size);

          ctx.globalAlpha = 0.9;
          ctx.strokeStyle = '#ffd98a';
          ctx.lineWidth = 2 / zoom;
          ctx.beginPath();
          ctx.moveTo(corners[0]!.x, corners[0]!.y);
          for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i]!.x, corners[i]!.y);
          ctx.closePath();
          ctx.stroke();
        }
      }

      if (calibOn) {
        ctx.globalAlpha = 1.0;

        if (calibP1) {
          ctx.fillStyle = '#00ff88';
          ctx.beginPath();
          ctx.arc(calibP1.x, calibP1.y, 5 / zoom, 0, Math.PI * 2);
          ctx.fill();
        }

        if (calibP2) {
          ctx.fillStyle = '#ff4d4d';
          ctx.beginPath();
          ctx.arc(calibP2.x, calibP2.y, 5 / zoom, 0, Math.PI * 2);
          ctx.fill();
        }

        if (calibP1 && calibP2) {
          ctx.strokeStyle = 'rgba(255,255,255,0.7)';
          ctx.lineWidth = 2 / zoom;
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
  }, [bgImg, map.hexSize, map.origin, map.notes, selected, catColors, calibOn, calibP1, calibP2, zoom, pan.x, pan.y]);

  const onPickBackground = async (file: File) => {
    const dataUrl = await fileToCompressedDataUrl(file, { maxWidth: 1600, quality: 0.82 });
    setMap({ backgroundDataUrl: dataUrl });
  };

  const handleCanvasClick = (screenP: { x: number; y: number }) => {
    const worldP = screenToWorld(screenP, zoom, pan);

    if (calibOn) {
      if (!calibP1) {
        setCalibP1(worldP);
        setCalibP2(null);
        return;
      }
      if (!calibP2) {
        setCalibP2(worldP);

        const dx = worldP.x - calibP1.x;
        const dy = worldP.y - calibP1.y;

        const dir = CALIB_DIRS.find((d) => d.id === calibDir) ?? CALIB_DIRS[0]!;
        const ux = dir.unit.x;
        const uy = dir.unit.y;

        const denom = ux * ux + uy * uy;
        const size = denom > 0 ? (dx * ux + dy * uy) / denom : map.hexSize;

        const safeSize = clamp(size, 2, 120);
        const origin = { x: calibP1.x, y: calibP1.y };

        setMap({ hexSize: safeSize, origin });
        setGridLocked(true);
        setCalibOn(false);
        resetCalibration();
        return;
      }

      setCalibP1(worldP);
      setCalibP2(null);
      return;
    }

    const axial = pixelToAxial({ x: worldP.x, y: worldP.y }, map.hexSize, map.origin);
    setSelected(axialKey(axial));
  };

  // Prevent page scroll on wheel; use native listener with passive:false
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;

    const onWheelNative = (ev: WheelEvent) => {
      ev.preventDefault();
      const screenP = pointFromMouseLike(ev, c);
      const factor = ev.deltaY > 0 ? 0.92 : 1.08;
      zoomAtScreenPoint(screenP, factor);
    };

    c.addEventListener('wheel', onWheelNative, { passive: false });
    return () => c.removeEventListener('wheel', onWheelNative as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, pan.x, pan.y]);

  // Pointer events (drag + pinch + click)
  const CLICK_THRESHOLD_PX = 4;

  const onPointerDown = (ev: React.PointerEvent) => {
    const c = canvasRef.current;
    if (!c) return;

    try {
      c.setPointerCapture(ev.pointerId);
    } catch {}

    const p = pointFromMouseLike(ev, c);
    pointersRef.current.set(ev.pointerId, p);

    // If 2 pointers -> pinch
    if (pointersRef.current.size === 2) {
      const pts = Array.from(pointersRef.current.values());
      const a = pts[0]!;
      const b = pts[1]!;
      const cent = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));

      pinchRef.current.active = true;
      pinchRef.current.initialDist = dist;
      pinchRef.current.initialZoom = zoom;
      pinchRef.current.worldAnchor = screenToWorld(cent, zoom, pan);

      dragRef.current.mode = 'none';
      dragRef.current.start = null;
      dragRef.current.last = null;
      dragRef.current.moved = false;
      return;
    }

    // 1 pointer: start potential click/drag
    dragRef.current.mode = calibOn ? 'none' : (gridLocked ? 'pan' : 'origin');
    dragRef.current.start = p;
    dragRef.current.last = p;
    dragRef.current.moved = false;
  };

  const onPointerMove = (ev: React.PointerEvent) => {
    const c = canvasRef.current;
    if (!c) return;

    if (!pointersRef.current.has(ev.pointerId)) return;
    const p = pointFromMouseLike(ev, c);
    pointersRef.current.set(ev.pointerId, p);

    // Pinch zoom
    if (pinchRef.current.active && pointersRef.current.size >= 2) {
      const pts = Array.from(pointersRef.current.values()).slice(0, 2);
      const a = pts[0]!;
      const b = pts[1]!;
      const cent = center(a, b);
      const dist = Math.max(1, distance(a, b));

      const scale = dist / pinchRef.current.initialDist;
      const nextZoom = clamp(pinchRef.current.initialZoom * scale, 0.3, 5);

      const anchor = pinchRef.current.worldAnchor;
      const nextPan = {
        x: cent.x - anchor.x * nextZoom,
        y: cent.y - anchor.y * nextZoom,
      };

      setZoomPan(nextZoom, nextPan);
      return;
    }

    // Drag
    if (dragRef.current.mode === 'none' || !dragRef.current.last || !dragRef.current.start) return;

    const last = dragRef.current.last;
    const dx = p.x - last.x;
    const dy = p.y - last.y;
    dragRef.current.last = p;

    // Update moved flag
    const fromStartX = p.x - dragRef.current.start.x;
    const fromStartY = p.y - dragRef.current.start.y;
    if (!dragRef.current.moved && (Math.abs(fromStartX) > CLICK_THRESHOLD_PX || Math.abs(fromStartY) > CLICK_THRESHOLD_PX)) {
      dragRef.current.moved = true;
    }

    // Only apply pan/origin if we've actually moved beyond threshold
    if (!dragRef.current.moved) return;

    if (dragRef.current.mode === 'pan') {
      setZoomPan(zoom, { x: pan.x + dx, y: pan.y + dy });
      return;
    }

    if (dragRef.current.mode === 'origin') {
      const wdx = dx / zoom;
      const wdy = dy / zoom;
      setMap({ origin: { x: map.origin.x + wdx, y: map.origin.y + wdy } });
      return;
    }
  };

  const onPointerUp = (ev: React.PointerEvent) => {
    const c = canvasRef.current;
    if (!c) return;

    const p = pointFromMouseLike(ev, c);
    const had = pointersRef.current.has(ev.pointerId);
    pointersRef.current.delete(ev.pointerId);

    // End pinch when <2 pointers
    if (pointersRef.current.size < 2) pinchRef.current.active = false;

    // If no more pointers, decide click vs drag
    if (pointersRef.current.size === 0) {
      const moved = dragRef.current.moved;
      const canClick = had && !pinchRef.current.active && !moved;

      dragRef.current.mode = 'none';
      dragRef.current.start = null;
      dragRef.current.last = null;
      dragRef.current.moved = false;

      if (canClick) {
        handleCanvasClick(p);
      }
    }
  };

  const onPointerCancel = (ev: React.PointerEvent) => {
    pointersRef.current.delete(ev.pointerId);
    pinchRef.current.active = false;
    if (pointersRef.current.size === 0) {
      dragRef.current.mode = 'none';
      dragRef.current.start = null;
      dragRef.current.last = null;
      dragRef.current.moved = false;
    }
  };

  // Keyboard nudges (unlocked only)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName ?? '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || (document.activeElement as any)?.isContentEditable) return;

      if (e.key === '0' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        resetView();
        return;
      }

      if (gridLocked) return;

      if (e.key === 'ArrowLeft') {
        setMap({ origin: { x: map.origin.x - nudgeStep, y: map.origin.y } });
      } else if (e.key === 'ArrowRight') {
        setMap({ origin: { x: map.origin.x + nudgeStep, y: map.origin.y } });
      } else if (e.key === 'ArrowUp') {
        setMap({ origin: { x: map.origin.x, y: map.origin.y - nudgeStep } });
      } else if (e.key === 'ArrowDown') {
        setMap({ origin: { x: map.origin.x, y: map.origin.y + nudgeStep } });
      } else if (e.key === '+' || e.key === '=') {
        setMap({ hexSize: clamp(map.hexSize + 0.5, 2, 120) });
      } else if (e.key === '-' || e.key === '_') {
        setMap({ hexSize: clamp(map.hexSize - 0.5, 2, 120) });
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridLocked, map.origin.x, map.origin.y, map.hexSize, nudgeStep, zoom, pan.x, pan.y]);

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
    setMap({ notes });
  };

  const setCategoryColor = (cat: CategoryName, color: string) => {
    setCatColors((prev) => ({ ...prev, [cat]: color }));
  };

  return (
    <div className="card">
      <div className="h2">Eriador Map (hex overlay)</div>
      <div className="muted small">
        Zoom: wheel / pinch. Pan: drag when locked. Move grid: drag when unlocked. Reset view: Ctrl/⌘ + 0.
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
            The image is auto-compressed to JPEG for reliable saving.
          </div>

          <div className="row" style={{ marginTop: 10, gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn" onClick={resetView}>Reset view (zoom/pan)</button>

            <button className="btn" onClick={centerOnSelected} disabled={!selected}>Center on selected</button>

            <label className="small muted" style={{ display: 'inline-flex', alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={gridLocked}
                onChange={(e) => {
                  const locked = e.target.checked;
                  setGridLocked(locked);
                  if (locked) {
                    setCalibOn(false);
                    resetCalibration();
                  }
                }}
                style={{ marginRight: 8 }}
              />
              🔒 Lock grid (drag pans view, pinch/wheel zoom)
            </label>
          </div>

          <div style={{ marginTop: 12 }}>
            <div className="h2" style={{ fontSize: 16 }}>Calibration</div>

            <div className="row" style={{ gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <label className="small muted">
                <input
                  type="checkbox"
                  checked={calibOn}
                  onChange={(e) => {
                    if (gridLocked && e.target.checked) return;
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
                  <option key={d.id} value={d.id}>{d.label}</option>
                ))}
              </select>

              <button className="btn" onClick={resetCalibration} disabled={!calibOn || gridLocked}>
                Reset points
              </button>
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
                setMap({ hexSize: clamp(safe, 2, 120) });
              }}
            />

            <label className="small muted">Origin X</label>
            <input
              className="input"
              type="number"
              value={map.origin.x}
              disabled={gridLocked}
              onChange={(e) => setMap({ origin: { ...map.origin, x: parseFloat(e.target.value || '0') } })}
            />

            <label className="small muted">Origin Y</label>
            <input
              className="input"
              type="number"
              value={map.origin.y}
              disabled={gridLocked}
              onChange={(e) => setMap({ origin: { ...map.origin, y: parseFloat(e.target.value || '0') } })}
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
            </div>

            <div className="col">
              <div className="small muted">Zoom</div>
              <div className="small" style={{ marginTop: 6 }}>{Math.round(zoom * 100)}%</div>
              <div className="row" style={{ gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                <button className="btn" onClick={() => zoomAtScreenPoint({ x: 512, y: 320 }, 1.1)}>+</button>
                <button className="btn" onClick={() => zoomAtScreenPoint({ x: 512, y: 320 }, 0.9)}>-</button>
              </div>
            </div>
          </div>

          <div className="small muted" style={{ marginTop: 10 }}>
            Tip: click selects hex (even when locked). Drag pans only after moving ~{CLICK_THRESHOLD_PX}px.
          </div>
        </div>
      </div>

      <div style={{ marginTop: 12, overscrollBehavior: 'contain' as any }}>
        <canvas
          ref={canvasRef}
          width={1024}
          height={640}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          style={{
            touchAction: 'none',
            overscrollBehavior: 'contain',
            cursor: calibOn ? 'crosshair' : 'grab',
          }}
        />
      </div>

      <hr />

      <div className="row">
        <div className="col">
          <div className="badge">Selected hex</div>
          <div style={{ marginTop: 8, fontWeight: 700 }}>{selected || '—'}</div>

          <div style={{ marginTop: 12 }}>
            <label className="small muted">Category</label>
            <select
              className="input"
              value={selectedCategory}
              onChange={(e) => saveNote(e.target.value as CategoryName, selectedText)}
              disabled={!selected}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            <div className="row" style={{ marginTop: 8, alignItems: 'center', gap: 10 }}>
              <div className="small muted">Dot color for this category</div>
              <input
                type="color"
                value={catColors[selectedCategory] ?? '#ffffff'}
                onChange={(e) => setCategoryColor(selectedCategory, e.target.value)}
                disabled={!selected}
              />
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
            Category is stored inside the note using a hidden prefix (<code>@cat:Category</code>).
          </div>
        </div>
      </div>
    </div>
  );
}
