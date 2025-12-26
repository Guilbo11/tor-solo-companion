import { zipSync, unzipSync, strFromU8, strToU8 } from 'fflate';
import type { StoredState } from './storage';

function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; mime: string } | null {
  const m = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
  if (!m) return null;
  const mime = m[1];
  const b64 = m[2];
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, mime };
}

function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  const b64 = btoa(s);
  return `data:${mime};base64,${b64}`;
}

function extFromMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes('png')) return 'png';
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
  if (m.includes('webp')) return 'webp';
  return 'bin';
}

export function exportToTorc(state: StoredState): Blob {
  const s: any = structuredClone(state);
  const files: Record<string, Uint8Array> = {};

  // Split map backgrounds into binary assets (v5: per-campaign multi-map)
  const byCamp = s?.mapsByCampaign;
  if (byCamp && typeof byCamp === 'object') {
    for (const [cid, maps] of Object.entries(byCamp)) {
      if (!Array.isArray(maps)) continue;
      for (const m of maps as any[]) {
        const bg = m?.state?.backgroundDataUrl;
        if (typeof bg === 'string' && bg.startsWith('data:')) {
          const parsed = dataUrlToBytes(bg);
          if (parsed) {
            const ext = extFromMime(parsed.mime);
            const safeCid = String(cid).replaceAll(/[^a-zA-Z0-9_-]/g, '_');
            const safeMid = String(m?.id ?? 'map').replaceAll(/[^a-zA-Z0-9_-]/g, '_');
            const path = `assets/maps/${safeCid}-${safeMid}-background.${ext}`;
            files[path] = parsed.bytes;
            m.state.backgroundAsset = path;
            delete m.state.backgroundDataUrl;
          }
        }
      }
    }
  } else {
    // Legacy fallback: split single map background if present
    const bg = s?.map?.backgroundDataUrl;
    if (typeof bg === 'string' && bg.startsWith('data:')) {
      const parsed = dataUrlToBytes(bg);
      if (parsed) {
        const ext = extFromMime(parsed.mime);
        const path = `assets/map-background.${ext}`;
        files[path] = parsed.bytes;
        s.map.backgroundAsset = path;
        delete s.map.backgroundDataUrl;
      }
    }
  }

  files['state.json'] = strToU8(JSON.stringify(s, null, 2));
  files['meta.json'] = strToU8(JSON.stringify({
    format: 'torc',
    version: 1,
    exportedAt: new Date().toISOString(),
  }, null, 2));

  const zipped = zipSync(files, { level: 6 });
  return new Blob([zipped], { type: 'application/octet-stream' });
}

export async function importFromTorc(file: File): Promise<StoredState> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const files = unzipSync(buf);
  const stateRaw = files['state.json'];
  if (!stateRaw) throw new Error('Invalid .torc: missing state.json');
  const s: any = JSON.parse(strFromU8(stateRaw));

  // Rehydrate map backgrounds if split
  const byCamp = s?.mapsByCampaign;
  if (byCamp && typeof byCamp === 'object') {
    for (const maps of Object.values(byCamp)) {
      if (!Array.isArray(maps)) continue;
      for (const m of maps as any[]) {
        const bgAsset = m?.state?.backgroundAsset;
        if (typeof bgAsset === 'string' && files[bgAsset]) {
          const bytes = files[bgAsset];
          const ext = bgAsset.split('.').pop()?.toLowerCase();
          const mime = ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'application/octet-stream';
          m.state.backgroundDataUrl = bytesToDataUrl(bytes, mime);
        }
      }
    }
  }

  // Legacy fallback
  const bgAsset = s?.map?.backgroundAsset;
  if (typeof bgAsset === 'string' && files[bgAsset]) {
    const bytes = files[bgAsset];
    const ext = bgAsset.split('.').pop()?.toLowerCase();
    const mime = ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'application/octet-stream';
    s.map.backgroundDataUrl = bytesToDataUrl(bytes, mime);
  }

  return s as StoredState;
}
