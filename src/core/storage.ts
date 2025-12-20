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

export type MapState = {
  // background image as data URL (user-provided file -> stored locally)
  backgroundDataUrl?: string;

  // hex overlay settings
  hexSize: number; // pixels radius
  origin: { x: number; y: number }; // where axial (0,0) sits in canvas coords
  notes: Record<string, string>; // hexKey -> note

  // ✅ persist "lock grid"
  gridLocked?: boolean;
};

export type OracleTable = {
  id: string;
  name: string;
  // A table is a list of entries; you can also model ranges later if needed.
  entries: { text: string; weight?: number }[];
};

export type Likelihood = 'Certain' | 'Likely' | 'Possible' | 'Unlikely' | 'Very Unlikely';

export type OracleState = {
  tables: OracleTable[];
  // Custom likelihood thresholds for your PDFs (edit in-app).
  // This is intentionally configurable so you can match Strider Mode precisely.
  likelihood: Record<Likelihood, { yes: number; maybe: number }>;
  history: { at: string; kind: 'Ask' | 'Table'; prompt: string; result: string }[];
};

const KEY = 'tor_solo_companion_state_v1';
const MAP_BG_KEY = 'tor_solo_companion_map_bg_v1';

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

  // Ensure map.gridLocked has a default
  if (base.map.gridLocked === undefined) {
    base = { ...base, map: { ...base.map, gridLocked: false } };
  }

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
      map: { ...state.map, backgroundDataUrl: undefined },
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
      gridLocked: false, // ✅ default
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

  // Back-compat: ensure gridLocked exists
  if (parsed.map.gridLocked === undefined) parsed.map.gridLocked = false;

  return parsed;
}
