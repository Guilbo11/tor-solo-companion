import React, { useEffect, useMemo, useRef, useState } from 'react';
import { axialKey, axialToPixel, hexCorners, pixelToAxial } from '../core/hex';
import { StoredState } from '../core/storage';

export default function MapPanel({ state, setState }: { state: StoredState; setState: (s: StoredState) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [selected, setSelected] = useState<string>('');

  const map = state.map;

  const bgImg = useMemo(() => {
    if (!map.backgroundDataUrl) return null;
    const img = new Image();
    img.src = map.backgroundDataUrl;
    return img;
  }, [map.backgroundDataUrl]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    const draw = () => {
      const w = c.width, h = c.height;
      ctx.clearRect(0,0,w,h);

      if (bgImg && bgImg.complete) {
        // fit to canvas
        const scale = Math.min(w / bgImg.width, h / bgImg.height);
        const dw = bgImg.width * scale;
        const dh = bgImg.height * scale;
        const dx = (w - dw) / 2;
        const dy = (h - dh) / 2;
        ctx.drawImage(bgImg, dx, dy, dw, dh);
      } else {
        ctx.fillStyle = '#0b0f14';
        ctx.fillRect(0,0,w,h);
      }

      // draw hex overlay
      const size = map.hexSize;
      const origin = map.origin;
      const cols = 40; // just a reasonable visible range around origin
      const rows = 30;

      ctx.save();
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
          for (let i=1;i<corners.length;i++) ctx.lineTo(corners[i]!.x, corners[i]!.y);
          ctx.closePath();
          ctx.stroke();

          const key = axialKey({ q, r });
          if (map.notes[key]) {
            ctx.fillStyle = '#ffd98a';
            ctx.globalAlpha = 0.55;
            ctx.beginPath();
            ctx.arc(center.x, center.y, 3, 0, Math.PI*2);
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
          const q = parseInt(a[1],10), r = parseInt(a[2],10);
          const center = axialToPixel({ q, r }, size, origin);
          const corners = hexCorners(center, size);
          ctx.globalAlpha = 0.9;
          ctx.strokeStyle = '#ffd98a';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(corners[0]!.x, corners[0]!.y);
          for (let i=1;i<corners.length;i++) ctx.lineTo(corners[i]!.x, corners[i]!.y);
          ctx.closePath();
          ctx.stroke();
        }
      }

      ctx.restore();
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [bgImg, map.hexSize, map.origin, map.notes, selected]);

  const onPickBackground = async (file: File) => {
    const dataUrl = await fileToDataUrl(file);
    setState({ ...state, map: { ...map, backgroundDataUrl: dataUrl } });
  };

  const onCanvasClick = (ev: React.MouseEvent) => {
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    const x = (ev.clientX - rect.left) * (c.width / rect.width);
    const y = (ev.clientY - rect.top) * (c.height / rect.height);
    const axial = pixelToAxial({ x, y }, map.hexSize, map.origin);
    setSelected(axialKey(axial));
  };

  const selectedNote = selected ? (map.notes[selected] ?? '') : '';

  const saveNote = (txt: string) => {
    if (!selected) return;
    const notes = { ...map.notes };
    if (!txt.trim()) delete notes[selected];
    else notes[selected] = txt;
    setState({ ...state, map: { ...map, notes } });
  };

  return (
    <div className="card">
      <div className="h2">Eriador Map (hex overlay)</div>
      <div className="muted small">
        This prototype lets you load your own map image (from your PDF export or screenshot) and place a clickable hex grid on top.
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <div className="col">
          <label className="small muted">Background image</label>
          <input className="input" type="file" accept="image/*" onChange={e => {
            const f = e.target.files?.[0];
            if (f) onPickBackground(f);
          }} />
          <div className="small muted" style={{ marginTop: 6 }}>
            Tip: export the Eriador map page as PNG/JPG. We store it locally as a data URL.
          </div>
        </div>
        <div className="col">
          <div className="kv">
            <label className="small muted">Hex size</label>
            <input className="input" type="number" min={10} max={80} value={map.hexSize}
              onChange={e => setState({ ...state, map: { ...map, hexSize: parseInt(e.target.value || '28', 10) } })} />
            <label className="small muted">Origin X</label>
            <input className="input" type="number" value={map.origin.x}
              onChange={e => setState({ ...state, map: { ...map, origin: { ...map.origin, x: parseInt(e.target.value || '0', 10) } } })} />
            <label className="small muted">Origin Y</label>
            <input className="input" type="number" value={map.origin.y}
              onChange={e => setState({ ...state, map: { ...map, origin: { ...map.origin, y: parseInt(e.target.value || '0', 10) } } })} />
          </div>
          <div className="small muted" style={{ marginTop: 6 }}>
            Adjust origin/size until the overlay aligns with the printed hexes.
          </div>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <canvas ref={canvasRef} width={1024} height={640} onClick={onCanvasClick} />
      </div>

      <hr />
      <div className="row">
        <div className="col">
          <div className="badge">Selected hex</div>
          <div style={{ marginTop: 8, fontWeight: 700 }}>{selected || '—'}</div>
          <div className="small muted">Click a hex to select. Add a note/event for that hex.</div>
        </div>
        <div className="col">
          <label className="small muted">Note for selected hex</label>
          <textarea className="input" style={{ minHeight: 90 }} value={selectedNote} onChange={e => saveNote(e.target.value)} placeholder="Rumour, hazard, NPC, camp..." />
        </div>
      </div>
    </div>
  );
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Failed to read file'));
    r.readAsDataURL(file);
  });
}
