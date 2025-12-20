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
  hexSize: number; // pixels radius
  origin: { x: number; y: number }; // where axial (0,0) sits in canvas coords
  notes: Record<string, string>; // hexKey -> note

  // UI/interaction state (persisted)
  gridLocked?: boolean;                 // lock grid editing (drag pans view)
  showGrid?: boolean;                   // show/hide hex overlay + dots
  showSettings?: boolean;               // show/hide map settings UI
  nudgeStep?: number;                   // arrow-key step when unlocked
  calibDir?: CalibDir;                  // calibration direction

  // view transform (persisted)
  zoom?: number;
  pan?: { x: number; y: number };
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

export function loadState(): StoredState {
  const raw = localStorage.getItem(KEY);
  if (!raw) return defaultState();
  try {
    const parsed = JSON.parse(raw) as StoredState;
    if (parsed?.version !== 1) return defaultState();

    // Ensure defaults exist even if older saved state is missing new fields
    return ensureDefaults(parsed);
  } catch {
    return defaultState();
  }
}

export function saveState(state: StoredState) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function defaultState(): StoredState {
  return ensureDefaults({
    version: 1,
    journal: [],
    map: {
      hexSize: 28,
      origin: { x: 380, y: 260 },
      notes: {},
      gridLocked: false,
      showGrid: true,
      showSettings: true,
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
  });
}

export function exportState(state: StoredState): string {
  return JSON.stringify(state, null, 2);
}

export function importState(json: string): StoredState {
  const parsed = JSON.parse(json) as StoredState;
  if (!parsed || parsed.version !== 1) throw new Error('Unsupported file format.');
  return ensureDefaults(parsed);
}

function ensureDefaults(s: StoredState): StoredState {
  const out: StoredState = {
    version: 1,
    journal: Array.isArray(s.journal) ? s.journal : [],
    oracle: ensureOracleDefaults(s.oracle),
    map: ensureMapDefaults(s.map),
  };
  return out;
}

function ensureOracleDefaults(o: any): OracleState {
  const likelihoodDefaults: OracleState['likelihood'] = {
    Certain: { yes: 95, maybe: 99 },
    Likely: { yes: 70, maybe: 89 },
    Possible: { yes: 50, maybe: 69 },
    Unlikely: { yes: 30, maybe: 49 },
    'Very Unlikely': { yes: 10, maybe: 29 },
  };

  const likelihood = o?.likelihood && typeof o.likelihood === 'object' ? o.likelihood : {};
  const merged: any = { ...likelihoodDefaults, ...likelihood };

  return {
    tables: Array.isArray(o?.tables) ? o.tables : [],
    likelihood: merged,
    history: Array.isArray(o?.history) ? o.history : [],
  };
}

function ensureMapDefaults(m: any): MapState {
  const out: MapState = {
    backgroundDataUrl: typeof m?.backgroundDataUrl === 'string' ? m.backgroundDataUrl : undefined,
    hexSize: typeof m?.hexSize === 'number' ? m.hexSize : 28,
    origin: {
      x: typeof m?.origin?.x === 'number' ? m.origin.x : 380,
      y: typeof m?.origin?.y === 'number' ? m.origin.y : 260,
    },
    notes: (m?.notes && typeof m.notes === 'object') ? m.notes : {},

    gridLocked: typeof m?.gridLocked === 'boolean' ? m.gridLocked : false,
    showGrid: typeof m?.showGrid === 'boolean' ? m.showGrid : true,
    showSettings: typeof m?.showSettings === 'boolean' ? m.showSettings : true,
    nudgeStep: typeof m?.nudgeStep === 'number' ? m.nudgeStep : 2,
    calibDir: (m?.calibDir ?? 'E') as CalibDir,

    zoom: typeof m?.zoom === 'number' ? m.zoom : 1,
    pan: {
      x: typeof m?.pan?.x === 'number' ? m.pan.x : 0,
      y: typeof m?.pan?.y === 'number' ? m.pan.y : 0,
    },
  };

  return out;
}
