export type StoredState = {
  version: 3;
  journal: JournalEntry[];
  journeys: Journey[];
  fellowship: FellowshipState;
  map: MapState;
  oracle: OracleState;
  heroes: Hero[];
  ui?: UIState;
};

export type JournalEntry = {
  id: string;
  createdAt: string; // ISO
  title: string;
  body: string;
  tags: string[];
  linkedHex?: string; // e.g. "q:12,r:-4"
};

export type Journey = {
  id: string;
  createdAt: string; // ISO
  title: string;
  from?: string;
  to?: string;
  mode: 'company' | 'strider';
  roles?: {
    guide?: string;
    scout?: string;
    hunter?: string;
    lookout?: string;
  };
  events: { id: string; title: string; body?: string }[];
};

export type FellowshipState = {
  mode: 'company' | 'strider';
  companyName?: string;
  patronId?: string;
  safeHaven?: string;
  focusHeroId?: string; // Strider mode
};

export type UIState = {
  activeHeroId?: string;
  heroesExpandedId?: string | null;
};

export type Hero = {
  id: string;
  name: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO

  tnDefault?: number;
  cultureId?: string;
  callingId?: string;
  featureIds?: string[];
  virtueIds?: string[];
  rewardIds?: string[];

  skillRatings?: Record<string, number>;   // 0-6
  skillFavoured?: Record<string, boolean>;

  inventory?: { name: string; qty: number; ref?: { pack: string; id: string } }[];
  notes?: string;
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
    version: 3,
    journal: [],
    journeys: [],
    fellowship: { mode: 'company', companyName: '' },
    heroes: [],
    ui: {},
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
    version: 3,
    journal: Array.isArray((s as any).journal) ? (s as any).journal : [],
    journeys: Array.isArray((s as any).journeys) ? (s as any).journeys.map(ensureJourneyDefaults) : [],
    fellowship: ensureFellowshipDefaults((s as any).fellowship),
    oracle: ensureOracleDefaults((s as any).oracle),
    map: ensureMapDefaults((s as any).map),
    heroes: Array.isArray((s as any).heroes) ? (s as any).heroes.map(ensureHeroDefaults) : [],
    ui: (s as any).ui && typeof (s as any).ui === 'object' ? (s as any).ui : {},
  };
  return out;
}

function ensureJourneyDefaults(j: any): Journey {
  return {
    id: String(j?.id ?? crypto.randomUUID()),
    createdAt: String(j?.createdAt ?? new Date().toISOString()),
    title: String(j?.title ?? 'Journey'),
    from: j?.from ? String(j.from) : undefined,
    to: j?.to ? String(j.to) : undefined,
    mode: (j?.mode === 'strider' ? 'strider' : 'company'),
    roles: j?.roles && typeof j.roles === 'object' ? j.roles : {},
    events: Array.isArray(j?.events) ? j.events.map((e:any)=>({
      id: String(e?.id ?? crypto.randomUUID()),
      title: String(e?.title ?? 'Event'),
      body: typeof e?.body === 'string' ? e.body : '',
    })) : [],
  };
}

function ensureFellowshipDefaults(f: any): FellowshipState {
  return {
    mode: (f?.mode === 'strider' ? 'strider' : 'company'),
    companyName: typeof f?.companyName === 'string' ? f.companyName : '',
    patronId: typeof f?.patronId === 'string' ? f.patronId : undefined,
    safeHaven: typeof f?.safeHaven === 'string' ? f.safeHaven : '',
    focusHeroId: typeof f?.focusHeroId === 'string' ? f.focusHeroId : undefined,
  };
}

function ensureHeroDefaults(h: any): Hero {
  const out: Hero = {
    id: String(h?.id ?? crypto.randomUUID()),
    name: String(h?.name ?? 'Unnamed'),
    createdAt: String(h?.createdAt ?? new Date().toISOString()),
    updatedAt: String(h?.updatedAt ?? new Date().toISOString()),
    tnDefault: typeof h?.tnDefault === 'number' ? h.tnDefault : 20,
    cultureId: h?.cultureId ? String(h.cultureId) : undefined,
    callingId: h?.callingId ? String(h.callingId) : undefined,
    featureIds: Array.isArray(h?.featureIds) ? h.featureIds.map(String) : [],
    virtueIds: Array.isArray(h?.virtueIds) ? h.virtueIds.map(String) : [],
    rewardIds: Array.isArray(h?.rewardIds) ? h.rewardIds.map(String) : [],
    skillRatings: h?.skillRatings && typeof h.skillRatings === 'object' ? h.skillRatings : {},
    skillFavoured: h?.skillFavoured && typeof h.skillFavoured === 'object' ? h.skillFavoured : {},
    inventory: Array.isArray(h?.inventory) ? h.inventory.map((it:any)=>({
      name: String(it?.name ?? ''),
      qty: typeof it?.qty === 'number' ? it.qty : 1,
      ref: it?.ref && typeof it.ref === 'object' ? { pack: String(it.ref.pack ?? ''), id: String(it.ref.id ?? '') } : undefined
    })) : [],
    notes: typeof h?.notes === 'string' ? h.notes : '',
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
