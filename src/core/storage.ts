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

export function loadState(): StoredState {
  const raw = localStorage.getItem(KEY);
  if (!raw) return defaultState();
  try {
    const parsed = JSON.parse(raw) as StoredState;
    if (parsed?.version !== 1) return defaultState();
    return parsed;
  } catch {
    return defaultState();
  }
}

export function saveState(state: StoredState) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function defaultState(): StoredState {
  return {
    version: 1,
    journal: [],
    map: {
      hexSize: 28,
      origin: { x: 380, y: 260 },
      notes: {},
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
  return parsed;
}
