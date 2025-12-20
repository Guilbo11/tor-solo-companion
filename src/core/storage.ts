export type StoredState = {
  version: 1;
  journal: JournalEntry[];
  map: MapState;
  oracle: OracleState;
};

export type JournalEntry = {
  id: string;
  createdAt: string; // ISO
  title: string;
  body: string;
  tags: string[];
  linkedHex?: string; // e.g. "q:12,r:-4"
};

export type CalibDir = 'E' | 'NE' | 'NW' | 'W' | 'SW' | 'SE';

export type MapState = {
  // background image as data URL (user-provided file -> stored locally)
  backgroundDataUrl?: string;

  // hex overlay settings
  hexSize: number; // pixels radius (world coords)
  origin: { x: number; y: number }; // where axial (0,0) sits in world coords
  notes: Record<string, string>; // hexKey -> note

  // ✅ persisted UI prefs
  gridLocked?: boolean;
  nudgeStep?: number;
  calibDir?: CalibDir;

  // ✅ zoom/pan (view camera)
  zoom?: number; // 1 = 100%
  pan?: { x: number; y: number }; // screen-space pixels
};

export type OracleTable = {
  id: string;
  name: string;
  entries: { text: string; weight?: number }[];
};

export type Likelihood = 'Certain' | 'Likely' | 'Possible' | 'Unlikely' | 'Very Unlikely';

export type OracleState = {
  tables: OracleTable[];
  likelihood: Record<Likelihood, { yes: number; maybe: number }>;
  history: { at: string; kind: 'Ask' | 'Table'; prompt: string; result: string }[];
};

const KEY = 'tor_solo_companion_state_v1';
const MAP_BG_KEY = 'tor_solo_companion_map_bg_v1';

function ensureMapDefaults(m: MapState): MapState {
  const out: MapState = { ...m };

  if (out.gridLocked === undefined) out.gridLocked = false;
  if (out.nudgeStep === undefined) out.nudgeStep = 2;
  if (out.calibDir === undefined) out.calibDir = 'E';

  if (out.zoom === undefined) out.zoom = 1;
  if (!out.pan) out.pan = { x: 0, y: 0 };

  return out;
}

export function loadState(): StoredState {
  let base: StoredState;

  const raw = localStorage.getItem(KEY);
  if (!raw) {
    base = defaultState();
  } else {
    try {
      const parsed = JSON.parse(raw) as StoredState;
      base = parsed?.version === 1 ? parsed : defaultState();
    } catch {
      base = defaultState();
    }
  }

  // Merge background image stored separately (best-effort)
  try {
    const bg = localStorage.getItem(MAP_BG_KEY);
    if (bg) {
      base = { ...base, map: { ...base.map, backgroundDataUrl: bg } };
    }
  } catch {
    // ignore
  }

  // Back-compat defaults
  base = { ...base, map: ensureMapDefaults(base.map) };

  return base;
}

/**
 * Robust save:
 * - Always save core state WITHOUT background image (so map grid + notes persist)
 * - Save background separately (best-effort)
 * - Never let background failure block saving the rest
 */
export function saveState(state: StoredState) {
  // 1) Save core state without bg
  try {
    const withoutBg: StoredState = {
      ...state,
      map: { ...ensureMapDefaults(state.map), backgroundDataUrl: undefined },
    };
    localStorage.setItem(KEY, JSON.stringify(withoutBg));
  } catch (e) {
    console.error('saveState(core) failed:', e);
    return;
  }

  // 2) Save background separately (best-effort)
  try {
    const bg = state.map.backgroundDataUrl;
    if (bg && bg.length > 0) localStorage.setItem(MAP_BG_KEY, bg);
    else localStorage.removeItem(MAP_BG_KEY);
  } catch (e) {
    console.warn('saveState(background) failed (image likely too large). Core state is still saved.', e);
  }
}

export function defaultState(): StoredState {
  return {
    version: 1,
    journal: [],
    map: {
      hexSize: 28,
      origin: { x: 380, y: 260 },
      notes: {},

      gridLocked: false,
      nudgeStep: 2,
      calibDir: 'E',

      zoom: 1,
      pan: { x: 0, y: 0 },
    },
    oracle: {
      tables: [],
      likelihood: {
        Certain: { yes: 95, maybe: 99 },
        Likely: { yes: 70, maybe: 89 },
        Possible: { yes: 50, maybe: 69 },
        Unlikely: { yes: 30, maybe: 49 },
        'Very Unlikely': { yes: 10, maybe: 29 },
      },
      history: [],
    },
  };
}

export function exportState(state: StoredState): string {
  return JSON.stringify(state, null, 2);
}

export function importState(json: string): StoredState {
  const parsed = JSON.parse(json) as StoredState;
  if (!parsed || parsed.version !== 1) throw new Error('Unsupported file format.');
  parsed.map = ensureMapDefaults(parsed.map);
  return parsed;
}
