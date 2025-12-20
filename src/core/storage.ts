
export type GameMode = 'normal'|'strider';

export type StoredStateV1 = {
  version: 1;
  journal: JournalEntry[];
  map: MapState;
  oracle: OracleState;
};

export type StoredState = {
  version: 2;
  mode: GameMode;
  heroes: Hero[];
  activeHeroId: string|null;

  // Journeys (structured)
  journeys: Journey[];

  // legacy notes journal (from v1)
  notes: JournalEntry[];

  fellowship: FellowshipState;

  map: MapState;
  oracle: OracleState;
};

export type FellowshipState = {
  mode: GameMode;
  safeHaven: string;
  patronId: string|null;
  fellowshipRating: number; // normal mode
  fellowshipFocusHeroId: string|null; // normal mode
  notes: string;
};

export type Hero = {
  id: string;
  name: string;
  cultureId: string|null;
  callingId: string|null;

  // Attributes
  strength: number;
  heart: number;
  wits: number;

  // Derived / resources
  enduranceMax: number;
  hopeMax: number;
  parry: number;
  shadow: number;
  load: number;

  // Skills (by id, e.g. "awe") rating + favoured flag
  skills: Record<string, { rating: number; favoured: boolean }>;

  // Combat proficiencies (freeform for now)
  combatProficiencies: Record<string, number>;

  // Features
  features: string[]; // feature ids

  // Inventory (names or compendium ids later)
  inventory: { id: string; name: string; kind: 'equipment'|'treasure'|'other'; notes?: string; load?: number }[];

  // UI
  ui: { expanded: boolean };
  updatedAt: string;
};

export type JourneyRole = 'Guide'|'Scout'|'Look-out'|'Hunter';

export type Journey = {
  id: string;
  title: string;
  mode: GameMode;
  createdAt: string;
  updatedAt: string;

  origin: string;
  destination: string;

  roles: Partial<Record<JourneyRole, string>>; // heroId
  events: { id: string; title: string; body: string; day?: number }[];
  notes: string;
};

export type JournalEntry = {
  id: string;
  createdAt: string; // ISO
  title: string;
  body: string;
  tags: string[];
  linkedHex?: string; // e.g. "q:12,r:-4"
};

// --- Oracle state (unchanged from base)
export type OracleState = {
  lastResults: { id: string; name: string; result: string; createdAt: string }[];
};

// --- Map state (copied from base, lightly trimmed)
export type CalibDir = 'E'|'W'|'N'|'S';
export type MapState = {
  bgDataUrl: string|null;

  // grid
  hexSize: number;
  origin: { x: number; y: number };
  showGrid: boolean;
  showSettings: boolean;
  nudgeStep: number;
  calibDir: CalibDir;

  // view
  zoom: number;
  pan: { x: number; y: number };

  // pins
  pins: { id: string; x: number; y: number; color: string; label?: string }[];

  // selection
  selectedHex?: string|null;

  // notes bound to hexes
  hexNotes: { id: string; hex: string; title: string; body: string }[];
};

const STORAGE_KEY = 'tor-solo-companion.state';

export function defaultState(): StoredState {
  const now = new Date().toISOString();
  return {
    version: 2,
    mode: 'strider',
    heroes: [],
    activeHeroId: null,
    journeys: [],
    notes: [],
    fellowship: {
      mode: 'strider',
      safeHaven: '',
      patronId: null,
      fellowshipRating: 0,
      fellowshipFocusHeroId: null,
      notes: '',
    },
    map: defaultMap(),
    oracle: { lastResults: [] },
  };
}

export function loadState(): StoredState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);

    if (parsed?.version === 2) {
      return sanitizeV2(parsed);
    }
    if (parsed?.version === 1) {
      const v1 = parsed as StoredStateV1;
      const s = defaultState();
      s.notes = Array.isArray(v1.journal) ? v1.journal : [];
      s.map = sanitizeMap(v1.map);
      s.oracle = sanitizeOracle(v1.oracle);
      return s;
    }
    return defaultState();
  } catch {
    return defaultState();
  }
}

export function saveState(state: StoredState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// --- sanitizers
function sanitizeOracle(o: any): OracleState {
  const lastResults = Array.isArray(o?.lastResults) ? o.lastResults : [];
  return { lastResults: lastResults.slice(-50).map((x: any) => ({
    id: String(x?.id ?? crypto.randomUUID()),
    name: String(x?.name ?? ''),
    result: String(x?.result ?? ''),
    createdAt: String(x?.createdAt ?? new Date().toISOString()),
  })) };
}

function sanitizeV2(s: any): StoredState {
  const out = defaultState();
  out.mode = s?.mode === 'normal' ? 'normal' : 'strider';
  out.heroes = Array.isArray(s?.heroes) ? s.heroes.map(sanitizeHero) : [];
  out.activeHeroId = typeof s?.activeHeroId === 'string' ? s.activeHeroId : null;
  out.journeys = Array.isArray(s?.journeys) ? s.journeys.map(sanitizeJourney) : [];
  out.notes = Array.isArray(s?.notes) ? s.notes : [];
  out.fellowship = sanitizeFellowship(s?.fellowship, out.mode);
  out.map = sanitizeMap(s?.map);
  out.oracle = sanitizeOracle(s?.oracle);
  return out;
}

function sanitizeFellowship(f: any, mode: GameMode): FellowshipState {
  return {
    mode: f?.mode === 'normal' ? 'normal' : mode,
    safeHaven: String(f?.safeHaven ?? ''),
    patronId: typeof f?.patronId === 'string' ? f.patronId : null,
    fellowshipRating: typeof f?.fellowshipRating === 'number' ? f.fellowshipRating : 0,
    fellowshipFocusHeroId: typeof f?.fellowshipFocusHeroId === 'string' ? f.fellowshipFocusHeroId : null,
    notes: String(f?.notes ?? ''),
  };
}

function sanitizeHero(h: any): Hero {
  const now = new Date().toISOString();
  const skills = typeof h?.skills === 'object' && h.skills ? h.skills : {};
  const out: Hero = {
    id: String(h?.id ?? crypto.randomUUID()),
    name: String(h?.name ?? 'Unnamed hero'),
    cultureId: typeof h?.cultureId === 'string' ? h.cultureId : null,
    callingId: typeof h?.callingId === 'string' ? h.callingId : null,
    strength: n(h?.strength, 2),
    heart: n(h?.heart, 2),
    wits: n(h?.wits, 2),
    enduranceMax: n(h?.enduranceMax, 20),
    hopeMax: n(h?.hopeMax, 10),
    parry: n(h?.parry, 0),
    shadow: n(h?.shadow, 0),
    load: n(h?.load, 0),
    skills: Object.fromEntries(Object.entries(skills).map(([k,v]: any)=>[
      String(k),
      { rating: n(v?.rating, 0), favoured: !!v?.favoured }
    ])),
    combatProficiencies: typeof h?.combatProficiencies === 'object' && h.combatProficiencies ? h.combatProficiencies : {},
    features: Array.isArray(h?.features) ? h.features.map(String) : [],
    inventory: Array.isArray(h?.inventory) ? h.inventory.map((it:any)=>({
      id: String(it?.id ?? crypto.randomUUID()),
      name: String(it?.name ?? ''),
      kind: (it?.kind === 'treasure' || it?.kind === 'other') ? it.kind : 'equipment',
      notes: typeof it?.notes === 'string' ? it.notes : '',
      load: typeof it?.load === 'number' ? it.load : undefined,
    })) : [],
    ui: { expanded: !!h?.ui?.expanded },
    updatedAt: typeof h?.updatedAt === 'string' ? h.updatedAt : now,
  };
  return out;
}

function sanitizeJourney(j: any): Journey {
  const now = new Date().toISOString();
  return {
    id: String(j?.id ?? crypto.randomUUID()),
    title: String(j?.title ?? 'Journey'),
    mode: j?.mode === 'normal' ? 'normal' : 'strider',
    createdAt: typeof j?.createdAt === 'string' ? j.createdAt : now,
    updatedAt: typeof j?.updatedAt === 'string' ? j.updatedAt : now,
    origin: String(j?.origin ?? ''),
    destination: String(j?.destination ?? ''),
    roles: typeof j?.roles === 'object' && j.roles ? j.roles : {},
    events: Array.isArray(j?.events) ? j.events.map((e:any)=>({
      id: String(e?.id ?? crypto.randomUUID()),
      title: String(e?.title ?? ''),
      body: String(e?.body ?? ''),
      day: typeof e?.day === 'number' ? e.day : undefined,
    })) : [],
    notes: String(j?.notes ?? ''),
  };
}

function n(x:any, d:number){ return typeof x === 'number' && isFinite(x) ? x : d; }

function defaultMap(): MapState {
  return {
    bgDataUrl: null,
    hexSize: 40,
    origin: { x: 200, y: 200 },
    showGrid: true,
    showSettings: true,
    nudgeStep: 2,
    calibDir: 'E',
    zoom: 1,
    pan: { x: 0, y: 0 },
    pins: [],
    selectedHex: null,
    hexNotes: [],
  };
}

function sanitizeMap(m: any): MapState {
  const d = defaultMap();
  return {
    bgDataUrl: typeof m?.bgDataUrl === 'string' ? m.bgDataUrl : null,
    hexSize: n(m?.hexSize, d.hexSize),
    origin: { x: n(m?.origin?.x, d.origin.x), y: n(m?.origin?.y, d.origin.y) },
    showGrid: typeof m?.showGrid === 'boolean' ? m.showGrid : d.showGrid,
    showSettings: typeof m?.showSettings === 'boolean' ? m.showSettings : d.showSettings,
    nudgeStep: n(m?.nudgeStep, d.nudgeStep),
    calibDir: (m?.calibDir ?? d.calibDir) as any,
    zoom: n(m?.zoom, d.zoom),
    pan: { x: n(m?.pan?.x, d.pan.x), y: n(m?.pan?.y, d.pan.y) },
    pins: Array.isArray(m?.pins) ? m.pins.map((p:any)=>({
      id: String(p?.id ?? crypto.randomUUID()),
      x: n(p?.x, 0),
      y: n(p?.y, 0),
      color: String(p?.color ?? '#ffffff'),
      label: typeof p?.label === 'string' ? p.label : undefined,
    })) : [],
    selectedHex: typeof m?.selectedHex === 'string' ? m.selectedHex : null,
    hexNotes: Array.isArray(m?.hexNotes) ? m.hexNotes.map((hn:any)=>({
      id: String(hn?.id ?? crypto.randomUUID()),
      hex: String(hn?.hex ?? ''),
      title: String(hn?.title ?? ''),
      body: String(hn?.body ?? ''),
    })) : [],
  };
}
