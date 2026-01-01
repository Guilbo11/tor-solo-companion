export type StoredState = {
  version: 6;

  // Legacy notes/journeys (kept for backward compatibility with older saves)
  journal: JournalEntry[];
  journeys: Journey[];

  // Legacy: single fellowship (kept for backward compatibility)
  fellowship: FellowshipState;
  // Fellowship is per-campaign (NOT shared between campaigns)
  fellowshipByCampaign: Record<string, FellowshipState>;

  // Maps are now per-campaign (multi-map support)
  mapsByCampaign: Record<string, MapDoc[]>;
  activeMapIdByCampaign: Record<string, string | undefined>;

  // Legacy: single oracle (kept for backward compatibility)
  oracle: OracleState;
  // Oracles are per-campaign (NOT shared between campaigns)
  oracleByCampaign: Record<string, OracleState>;

  // Journal v2 (chapters + rich HTML)
  // NOTE: legacy (single journal) fields are kept for backward compatibility.
  journalChapters?: JournalChapter[];
  activeJournalChapterId?: string;

  // Journal v3 (per-campaign)
  journalByCampaign: Record<string, JournalChapter[]>;
  activeJournalChapterIdByCampaign: Record<string, string | undefined>;

  // NPCs
  npcs: NPC[];

  // Campaigns & heroes
  campaigns: Campaign[];
  activeCampaignId?: string;
  heroes: Hero[];

  // Settings
  settings: SettingsState;

  ui?: UIState;
};

export type SettingsState = {
  addRollsToJournal: boolean;
};

export type JournalChapter = {
  id: string;
  title: string;
  html: string;
  collapsed?: boolean;
};

export type NPC = {
  id: string;
  campaignId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  cultureId?: string;
  gender?: 'Masculine'|'Feminine'|'Other';
  firstLook?: string[];
  goal?: string;
  motivations?: string[];
  location?: string;
  notesHtml?: string;
  collapsed?: boolean;
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
  heroOrderByCampaign?: Record<string, string[]>;
};


export type Campaign = {
  id: string;
  name: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
};

export type Hero = {
  id: string;
  campaignId?: string;
  name: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO

  tnDefault?: number;
  cultureId?: string;
  callingId?: string;
  featureIds?: string[];
  virtueIds?: string[];
  rewardIds?: string[];

  // Modes
  striderMode?: boolean;

  // Lifestyle
  standardOfLiving?: 'Poor'|'Frugal'|'Common'|'Prosperous'|'Rich'|'Very Rich';
  mount?: { vigour: number; label: string };

  // Previous Experience (pre-campaign point buy)
  previousExperience?: {
    baselineSkillRatings: Record<string, number>; // snapshot
    baselineCombatProficiencies: { axes: number; bows: number; spears: number; swords: number };
    committedSkillRatings?: Record<string, number>; // snapshot at commit
    committedCombatProficiencies?: { axes: number; bows: number; spears: number; swords: number };
    committed?: boolean;
  };

  // TOR 2e core stats
  attributes?: { strength: number; heart: number; wits: number };
  endurance?: { max: number; current: number; load: number; fatigue: number };
  hope?: { max: number; current: number };
  shadow?: { points: number; scars: number };
  conditions?: { miserable: boolean; weary: boolean; wounded: boolean };
  injury?: string;
  valour?: number;
  wisdom?: number;
  points?: { adventure: number; skill: number; fellowship: number };

  // Skills
  // New (Dec 2025): explicit picks
  cultureFavouredSkillId?: string;
  callingFavouredSkillIds?: string[];
  // Legacy combined list (kept for backward compatibility)
  favouredSkillIds?: string[]; // older saves

  skillRatings?: Record<string, number>;   // 0-6
  // Legacy (kept for backward compatibility with older saves)
  skillFavoured?: Record<string, boolean>;

  // Combat & gear
  combatProficiencies?: { axes?: number; bows?: number; spears?: number; swords?: number };
  equipped?: { weaponId?: string; armourId?: string; helmId?: string; shieldId?: string };
  parry?: { base: number; other: number };
  protectionOther?: number; // additional protection dice (e.g. rewards)

  usefulItems?: { id: string; name: string; skillId: string }[];

  inventory?: {
    id: string;
    name: string;
    qty: number;
    // For compendium equipment items
    ref?: { pack: string; id: string };
    // Manual override for load (ex: treasure). If undefined and ref present, use compendium load.
    load?: number;
    equipped?: boolean;
    dropped?: boolean;
  }[];
  notes?: string;

  // Creation wizard / locked fields
  creationComplete?: boolean;
  gender?: 'Masculine'|'Feminine'|'Other';
  callingFavouredSkillIds?: string[];
  cultureFavouredSkillId?: string;
  cultureDistinctiveFeatureIds?: string[];
  callingDistinctiveFeatureId?: string;
  // New (Dec 2025): editable list of Distinctive Features (can include Strider if enabled).
  distinctiveFeatureIds?: string[];
  shadowPathId?: string;
  previousExperienceCommitted?: boolean;

};


export type CalibDir = 'E' | 'NE' | 'NW' | 'W' | 'SW' | 'SE';

export type MapState = {
  // background image as data URL (user-provided file -> stored locally)
  backgroundDataUrl?: string;
  // Optional: when importing/exporting .torc, we can store the image as a file in the bundle.
  backgroundAsset?: string;

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

  // Internal: set true after we auto-fit a newly imported background so we don't
  // keep overriding the user's camera.
  backgroundFitDone?: boolean;
};

export type MapDoc = {
  id: string;
  name: string;
  state: MapState;
};

export type MapDoc = {
  id: string;
  name: string;
  state: MapState;
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
    if (![3,4,5,6].includes((parsed as any)?.version)) return defaultState();

    // Migrate v3 -> v4 (campaigns)
    if (parsed?.version === 3) {
      return ensureDefaults(migrateV3ToV4(parsed as any));
    }

    // Migrate v4 -> v5 (journal chapters, settings, NPCs, multi-map)
    if ((parsed as any)?.version === 4) {
      return ensureDefaults(migrateV4ToV5(parsed as any));
    }

    // Migrate v5 -> v6 (make fellowship/oracle per-campaign)
    if ((parsed as any)?.version === 5) {
      return ensureDefaults(migrateV5ToV6(parsed as any));
    }

    // Ensure defaults exist even if older saved state is missing new fields
    return ensureDefaults(parsed as any);
  } catch {
    return defaultState();
  }
}

export function saveState(state: StoredState) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function defaultState(): StoredState {
  const now = new Date().toISOString();
  const campId = 'camp-1';
  const defaultMap: MapState = {
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
  };

  const defaultFellowship: FellowshipState = { mode: 'company', companyName: '' };
  const defaultOracle: OracleState = {
    tables: [
      {
        id: "fortune",
        name: "Fortune Table",
        entries: [
        { text: "The Eye of the Enemy focuses elsewhere. Decrease Eye Awareness by 1." },
        { text: "You may bypass a threat without attracting notice" },
        { text: "You gain the attention of a potential ally" },
        { text: "An enemy inadvertently reveals their position" },
        { text: "You gain favoured ground" },
        { text: "Enemies run afoul of danger" },
        { text: "You locate or learn of a useful item" },
        { text: "Your success instils new hope or renewed resolve" },
        { text: "You find a moment of comfort or safety" },
        { text: "You learn or realize something which gives helpful insight into your mission" },
        { text: "You encounter an opportunity suited to your nature or abilities" },
        { text: "An unexpected ally appears or sends aid" }
        ],
      },
      {
        id: "ill-fortune",
        name: "Ill-Fortune Table",
        entries: [
        { text: "Your actions catch the Eye of the Enemy. Increase Eye Awareness by 2." },
        { text: "You draw unwanted attention" },
        { text: "Your actions are observed by someone of ill-intent" },
        { text: "Unexpected enemies emerge or are sighted" },
        { text: "You are hindered by difficult terrain or an unfavourable environment" },
        { text: "You find yourself ill-equipped for the circumstances" },
        { text: "A favoured weapon or item is lost, broken, or sacrificed" },
        { text: "You are plagued by troubling visions or thoughts" },
        { text: "An old injury or stress resurfaces" },
        { text: "You learn or realize something which adds a new complication to your mission" },
        { text: "You face a test which is contrary to your nature or abilities" },
        { text: "An ally becomes a hindrance or liability" }
        ],
      },
      {
        id: "experience-milestones",
        name: "Experience Milestones",
        entries: [
        { text: "Accept a mission from a patron — 1 Adventure Point" },
        { text: "Achieve a notable personal goal — 1 Adventure Point and 1 Skill Point" },
        { text: "Complete a patron’s mission — 1 Adventure Point and 1 Skill Point" },
        { text: "Complete a meaningful journey — 2 Skill Points" },
        { text: "Face a Noteworthy Encounter during a journey — 1 Skill Point" },
        { text: "Reveal a significant location or discovery — 1 Adventure Point" },
        { text: "Overcome a tricky obstacle — 1 Skill Point" },
        { text: "Participate in a Council — 1 Skill Point" },
        { text: "Survive a dangerous combat — 1 Adventure Point" },
        { text: "Face a Revelation Episode — 1 Adventure Point" }
        ],
      },
    ],
    likelihood: {
      Certain: { yes: 95, maybe: 99 },
      Likely: { yes: 70, maybe: 89 },
      Possible: { yes: 50, maybe: 69 },
      Unlikely: { yes: 30, maybe: 49 },
      'Very Unlikely': { yes: 10, maybe: 29 },
    },
    history: [],
  };

  return ensureDefaults({
    version: 6,

    // legacy
    journal: [],
    journeys: [],

    fellowship: defaultFellowship,
    fellowshipByCampaign: { [campId]: defaultFellowship },

    // maps per campaign
    mapsByCampaign: {
      [campId]: [{ id: 'map-1', name: 'Map 1', state: defaultMap }],
    },
    activeMapIdByCampaign: { [campId]: 'map-1' },

    oracle: defaultOracle,
    oracleByCampaign: { [campId]: defaultOracle },

    // journal per campaign
    journalByCampaign: {
      [campId]: [{ id: 'chap-1', title: 'Chapter 1', html: '', collapsed: false }],
    },
    activeJournalChapterIdByCampaign: { [campId]: 'chap-1' },

    // legacy (single-journal) fields (kept empty; migration fills if needed)
    journalChapters: undefined,
    activeJournalChapterId: undefined,

    // npcs
    npcs: [],

    campaigns: [{ id: campId, name: 'My Campaign', createdAt: now, updatedAt: now }],
    activeCampaignId: campId,
    heroes: [],
    ui: {},

    settings: { addRollsToJournal: false },
  });
}

export function exportState(state: StoredState): string {
  return JSON.stringify(state, null, 2);
}

export function importState(json: string): StoredState {
  const parsed = JSON.parse(json) as StoredState;
  if (!parsed || parsed.version !== 3) throw new Error('Unsupported file format.');
  return ensureDefaults(parsed);
}


function migrateV3ToV4(s: any): any {
  const now = new Date().toISOString();
  const campId = 'camp-1';
  const campaigns = [{ id: campId, name: 'My Campaign', createdAt: now, updatedAt: now }];
  const heroes = Array.isArray(s?.heroes) ? s.heroes.map((h:any)=> ({ ...h, campaignId: h?.campaignId ?? campId })) : [];
  return { ...s, version: 4, campaigns, activeCampaignId: campId, heroes };
}

function migrateV4ToV5(s: any): any {
  // Keep data as-is; ensureDefaults will populate new fields and migrate legacy map/journal.
  return { ...s, version: 5 };
}

function migrateV5ToV6(s: any): any {
  // Move global fellowship/oracle into per-campaign maps.
  const campaigns: any[] = Array.isArray(s?.campaigns) ? s.campaigns : [];
  const activeCampaignId: string = typeof s?.activeCampaignId === 'string'
    ? s.activeCampaignId
    : (campaigns[0]?.id ?? 'camp-1');

  const baseFellowship = s?.fellowship ?? { mode: 'company', companyName: '' };
  const baseOracle = s?.oracle ?? { tables: [], likelihood: {}, history: [] };

  const fellowshipByCampaign = { ...(s?.fellowshipByCampaign ?? {}) };
  const oracleByCampaign = { ...(s?.oracleByCampaign ?? {}) };

  // Attach legacy values to the active campaign if that campaign doesn't already have its own.
  if (!fellowshipByCampaign[activeCampaignId]) fellowshipByCampaign[activeCampaignId] = baseFellowship;
  if (!oracleByCampaign[activeCampaignId]) oracleByCampaign[activeCampaignId] = baseOracle;

  return { ...s, version: 6, fellowshipByCampaign, oracleByCampaign };
}

function ensureJournalChapterDefaults(c: any): JournalChapter {
  return {
    id: String(c?.id ?? crypto.randomUUID()),
    title: String(c?.title ?? 'Chapter'),
    html: typeof c?.html === 'string' ? c.html : '',
    collapsed: typeof c?.collapsed === 'boolean' ? c.collapsed : false,
  };
}

function ensureNpcDefaults(n: any): NPC {
  return {
    id: String(n?.id ?? crypto.randomUUID()),
    campaignId: typeof n?.campaignId === 'string' ? n.campaignId : 'camp-1',
    name: String(n?.name ?? 'Unnamed'),
    createdAt: String(n?.createdAt ?? new Date().toISOString()),
    updatedAt: String(n?.updatedAt ?? new Date().toISOString()),
    cultureId: n?.cultureId ? String(n.cultureId) : undefined,
    gender: (n?.gender ?? undefined) as any,
    firstLook: Array.isArray(n?.firstLook) ? n.firstLook.map(String) : [],
    goal: typeof n?.goal === 'string' ? n.goal : '',
    motivations: Array.isArray(n?.motivations) ? n.motivations.map(String) : [],
    location: typeof n?.location === 'string' ? n.location : '',
    notesHtml: typeof n?.notesHtml === 'string' ? n.notesHtml : '',
    collapsed: typeof n?.collapsed === 'boolean' ? n.collapsed : true,
  };
}

function escapeHtml(txt: string): string {
  return txt
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function legacyNotesToHtml(entries: JournalEntry[]): string {
  if (!entries?.length) return '';
  const sorted = [...entries].sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt)));
  return sorted.map(e => {
    const title = escapeHtml(e.title ?? 'Note');
    const body = escapeHtml(e.body ?? '').replaceAll('\n', '<br/>');
    const when = escapeHtml(new Date(e.createdAt).toLocaleString());
    return `<p><strong>${title}</strong><br/><span style="opacity:.75;font-size:12px">${when}</span><br/>${body}</p>`;
  }).join('');
}

function ensureCampaignDefaults(c: any): Campaign {
  return {
    id: String(c?.id ?? crypto.randomUUID()),
    name: String(c?.name ?? 'Campaign'),
    createdAt: String(c?.createdAt ?? new Date().toISOString()),
    updatedAt: String(c?.updatedAt ?? new Date().toISOString()),
  };
}

function ensureDefaults(s: StoredState): StoredState {
  const campaigns: Campaign[] = Array.isArray((s as any).campaigns)
    ? (s as any).campaigns.map(ensureCampaignDefaults)
    : [{ id: 'camp-1', name: 'My Campaign', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];

  const activeCampaignId = typeof (s as any).activeCampaignId === 'string'
    ? (s as any).activeCampaignId
    : (campaigns[0]?.id ?? 'camp-1');

  // Multi-maps: migrate from legacy single map if needed.
  const legacyMap = ensureMapDefaults((s as any).map);
  const mapsByCampaign: Record<string, MapDoc[]> = (s as any).mapsByCampaign && typeof (s as any).mapsByCampaign === 'object'
    ? Object.fromEntries(Object.entries((s as any).mapsByCampaign).map(([cid, maps]: any) => [
        String(cid),
        Array.isArray(maps)
          ? maps.map((m: any) => ({
              id: String(m?.id ?? crypto.randomUUID()),
              name: String(m?.name ?? 'Map'),
              state: ensureMapDefaults(m?.state ?? legacyMap),
            }))
          : [{ id: 'map-1', name: 'Map 1', state: legacyMap }],
      ]))
    : {};

  // Ensure each campaign has at least one map.
  for (const c of campaigns) {
    if (!mapsByCampaign[c.id] || mapsByCampaign[c.id].length === 0) {
      mapsByCampaign[c.id] = [{ id: 'map-1', name: 'Map 1', state: legacyMap }];
    }
  }

  const activeMapIdByCampaign: Record<string, string | undefined> = (s as any).activeMapIdByCampaign && typeof (s as any).activeMapIdByCampaign === 'object'
    ? { ...(s as any).activeMapIdByCampaign }
    : {};

  for (const c of campaigns) {
    const desired = activeMapIdByCampaign[c.id];
    const exists = desired && mapsByCampaign[c.id].some(m => m.id === desired);
    if (!exists) activeMapIdByCampaign[c.id] = mapsByCampaign[c.id][0]?.id;
  }

  const heroes: Hero[] = Array.isArray((s as any).heroes) ? (s as any).heroes.map(ensureHeroDefaults) : [];
  const npcs: NPC[] = Array.isArray((s as any).npcs) ? (s as any).npcs.map(ensureNpcDefaults) : [];

  const settings: SettingsState = (s as any).settings && typeof (s as any).settings === 'object'
    ? { addRollsToJournal: !!(s as any).settings.addRollsToJournal }
    : { addRollsToJournal: false };

  // Journal: now per-campaign.
  // Migration rules:
  // - If journalByCampaign exists, keep it.
  // - Else if legacy journalChapters exist, attach them to the active campaign.
  // - Else, build a single chapter from legacy notes for the active campaign.
  const legacyChapters: JournalChapter[] = Array.isArray((s as any).journalChapters)
    ? (s as any).journalChapters.map(ensureJournalChapterDefaults)
    : [{ id: 'chap-1', title: 'Chapter 1', html: legacyNotesToHtml(Array.isArray((s as any).journal) ? (s as any).journal : []), collapsed: false }];

  const journalByCampaign: Record<string, JournalChapter[]> = ((s as any).journalByCampaign && typeof (s as any).journalByCampaign === 'object')
    ? Object.fromEntries(Object.entries((s as any).journalByCampaign).map(([cid, chs]: any) => [
        String(cid),
        Array.isArray(chs) ? chs.map(ensureJournalChapterDefaults) : [],
      ]))
    : { [activeCampaignId]: legacyChapters };

  // Ensure each campaign has at least one chapter.
  for (const c of campaigns) {
    if (!journalByCampaign[c.id] || journalByCampaign[c.id].length === 0) {
      journalByCampaign[c.id] = [{ id: 'chap-1', title: 'Chapter 1', html: '', collapsed: false }];
    }
  }

  const activeJournalChapterIdByCampaign: Record<string, string | undefined> = ((s as any).activeJournalChapterIdByCampaign && typeof (s as any).activeJournalChapterIdByCampaign === 'object')
    ? { ...(s as any).activeJournalChapterIdByCampaign }
    : {};

  // If we only had the legacy active id, attach it to the active campaign.
  const legacyActiveId = typeof (s as any).activeJournalChapterId === 'string' ? (s as any).activeJournalChapterId : undefined;
  if (legacyActiveId && !activeJournalChapterIdByCampaign[activeCampaignId]) {
    activeJournalChapterIdByCampaign[activeCampaignId] = legacyActiveId;
  }

  for (const c of campaigns) {
    const desired = activeJournalChapterIdByCampaign[c.id];
    const exists = desired && journalByCampaign[c.id].some(ch => ch.id === desired);
    if (!exists) activeJournalChapterIdByCampaign[c.id] = journalByCampaign[c.id][0]?.id;
  }

  const out: StoredState = {
    version: 6,
    journal: Array.isArray((s as any).journal) ? (s as any).journal : [],
    journeys: Array.isArray((s as any).journeys) ? (s as any).journeys.map(ensureJourneyDefaults) : [],
    fellowship: ensureFellowshipDefaults((s as any).fellowship),
    fellowshipByCampaign: {},
    mapsByCampaign,
    activeMapIdByCampaign,
    oracle: ensureOracleDefaults((s as any).oracle),
    oracleByCampaign: {},
    journalByCampaign,
    activeJournalChapterIdByCampaign,

    // legacy (kept for backward compatibility in storage, but not used by UI)
    journalChapters: (s as any).journalChapters ? legacyChapters : undefined,
    activeJournalChapterId: (s as any).activeJournalChapterId ? legacyActiveId : undefined,
    npcs,
    campaigns,
    activeCampaignId,
    heroes,
    settings,
    ui: (s as any).ui && typeof (s as any).ui === 'object' ? (s as any).ui : {},
  };

  // Hero ordering is per-campaign (drag & drop in Heroes list).
  const uiAny: any = out.ui ?? {};
  if (!uiAny.heroOrderByCampaign || typeof uiAny.heroOrderByCampaign !== 'object') uiAny.heroOrderByCampaign = {};
  if (!uiAny.recentEnemyTypesByCampaign || typeof uiAny.recentEnemyTypesByCampaign !== 'object') uiAny.recentEnemyTypesByCampaign = {};
  for (const c of campaigns) {
    const cur = Array.isArray(uiAny.heroOrderByCampaign[c.id]) ? uiAny.heroOrderByCampaign[c.id].map(String) : [];
    const heroIds = heroes.filter((h:any)=>String(h.campaignId ?? activeCampaignId)===c.id).map((h:any)=>String(h.id));
    // Keep existing order but append any new heroes not present.
    const next = [...cur.filter((id:string)=>heroIds.includes(id)), ...heroIds.filter(id=>!cur.includes(id))];
    uiAny.heroOrderByCampaign[c.id] = next;

    const rec = Array.isArray(uiAny.recentEnemyTypesByCampaign[c.id]) ? uiAny.recentEnemyTypesByCampaign[c.id].map(String) : [];
    uiAny.recentEnemyTypesByCampaign[c.id] = rec.slice(0, 3);
  }
  out.ui = uiAny;
  // Ensure fellowship/oracles are NOT shared: each campaign gets its own slice.
  const legacyFellowship = ensureFellowshipDefaults((s as any).fellowship);
  const legacyOracle = ensureOracleDefaults((s as any).oracle);

  const fellowshipByCampaign: Record<string, FellowshipState> = (s as any).fellowshipByCampaign && typeof (s as any).fellowshipByCampaign === 'object'
    ? Object.fromEntries(Object.entries((s as any).fellowshipByCampaign).map(([cid, f]: any) => [String(cid), ensureFellowshipDefaults(f)]))
    : { [activeCampaignId]: legacyFellowship };

  const oracleByCampaign: Record<string, OracleState> = (s as any).oracleByCampaign && typeof (s as any).oracleByCampaign === 'object'
    ? Object.fromEntries(Object.entries((s as any).oracleByCampaign).map(([cid, o]: any) => [String(cid), ensureOracleDefaults(o)]))
    : { [activeCampaignId]: legacyOracle };

  // IMPORTANT: never share references across campaigns.
  for (const c of campaigns) {
    if (!fellowshipByCampaign[c.id]) {
      fellowshipByCampaign[c.id] = ensureFellowshipDefaults(undefined);
    }
    if (!oracleByCampaign[c.id]) {
      const o = ensureOracleDefaults(undefined);
      o.history = [];
      oracleByCampaign[c.id] = o;
    }
  }

  out.fellowshipByCampaign = fellowshipByCampaign;
  out.oracleByCampaign = oracleByCampaign;
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
    campaignId: typeof h?.campaignId === 'string' ? h.campaignId : 'camp-1',
    name: String(h?.name ?? 'Unnamed'),
    createdAt: String(h?.createdAt ?? new Date().toISOString()),
    updatedAt: String(h?.updatedAt ?? new Date().toISOString()),
    tnDefault: typeof h?.tnDefault === 'number' ? h.tnDefault : 20,
    cultureId: h?.cultureId ? String(h.cultureId) : undefined,
    callingId: h?.callingId ? String(h.callingId) : undefined,
    featureIds: Array.isArray(h?.featureIds) ? h.featureIds.map(String) : [],
    virtueIds: Array.isArray(h?.virtueIds) ? h.virtueIds.map(String) : [],
    rewardIds: Array.isArray(h?.rewardIds) ? h.rewardIds.map(String) : [],

    striderMode: typeof h?.striderMode === 'boolean' ? h.striderMode : false,

    standardOfLiving: (h?.standardOfLiving ?? undefined) as any,
    mount: h?.mount && typeof h.mount === 'object' ? {
      vigour: typeof h.mount.vigour === 'number' ? h.mount.vigour : 0,
      label: typeof h.mount.label === 'string' ? h.mount.label : '',
    } : undefined,

    previousExperience: h?.previousExperience && typeof h.previousExperience === 'object' ? {
      baselineSkillRatings: (h.previousExperience.baselineSkillRatings && typeof h.previousExperience.baselineSkillRatings === 'object') ? h.previousExperience.baselineSkillRatings : {},
      baselineCombatProficiencies: (h.previousExperience.baselineCombatProficiencies && typeof h.previousExperience.baselineCombatProficiencies === 'object') ? h.previousExperience.baselineCombatProficiencies : { axes: 0, bows: 0, spears: 0, swords: 0 },
      committedSkillRatings: (h.previousExperience.committedSkillRatings && typeof h.previousExperience.committedSkillRatings === 'object') ? h.previousExperience.committedSkillRatings : undefined,
      committedCombatProficiencies: (h.previousExperience.committedCombatProficiencies && typeof h.previousExperience.committedCombatProficiencies === 'object') ? h.previousExperience.committedCombatProficiencies : undefined,
      committed: typeof h.previousExperience.committed === 'boolean' ? h.previousExperience.committed : false,
    } : undefined,

    attributes: {
      strength: typeof h?.attributes?.strength === 'number' ? h.attributes.strength : 2,
      heart: typeof h?.attributes?.heart === 'number' ? h.attributes.heart : 2,
      wits: typeof h?.attributes?.wits === 'number' ? h.attributes.wits : 2,
    },
    endurance: {
      max: typeof h?.endurance?.max === 'number' ? h.endurance.max : 20,
      current: typeof h?.endurance?.current === 'number' ? h.endurance.current : (typeof h?.endurance?.max === 'number' ? h.endurance.max : 20),
      load: typeof h?.endurance?.load === 'number' ? h.endurance.load : 0,
      fatigue: typeof h?.endurance?.fatigue === 'number' ? h.endurance.fatigue : 0,
    },
    hope: {
      max: typeof h?.hope?.max === 'number' ? h.hope.max : 8,
      current: typeof h?.hope?.current === 'number' ? h.hope.current : (typeof h?.hope?.max === 'number' ? h.hope.max : 8),
    },
    shadow: {
      points: typeof h?.shadow?.points === 'number' ? h.shadow.points : 0,
      scars: typeof h?.shadow?.scars === 'number' ? h.shadow.scars : 0,
    },
    conditions: {
      miserable: typeof h?.conditions?.miserable === 'boolean' ? h.conditions.miserable : false,
      weary: typeof h?.conditions?.weary === 'boolean' ? h.conditions.weary : false,
      wounded: typeof h?.conditions?.wounded === 'boolean' ? h.conditions.wounded : false,
    },
    injury: typeof h?.injury === 'string' ? h.injury : '',
    // TOR 2e: Valour and Wisdom start at 1.
    valour: typeof h?.valour === 'number' ? h.valour : 1,
    wisdom: typeof h?.wisdom === 'number' ? h.wisdom : 1,
    points: {
      adventure: typeof h?.points?.adventure === 'number' ? h.points.adventure : 0,
      skill: typeof h?.points?.skill === 'number' ? h.points.skill : 0,
      fellowship: typeof h?.points?.fellowship === 'number' ? h.points.fellowship : 0,
    },

    cultureFavouredSkillId: (typeof h?.cultureFavouredSkillId === 'string' && h.cultureFavouredSkillId) ? String(h.cultureFavouredSkillId) : undefined,
    callingFavouredSkillIds: Array.isArray(h?.callingFavouredSkillIds) ? h.callingFavouredSkillIds.map(String) : [],
    favouredSkillIds: Array.isArray(h?.favouredSkillIds) ? h.favouredSkillIds.map(String) : [],
    skillRatings: h?.skillRatings && typeof h.skillRatings === 'object' ? h.skillRatings : {},
    skillFavoured: h?.skillFavoured && typeof h.skillFavoured === 'object' ? h.skillFavoured : {},

    combatProficiencies: h?.combatProficiencies && typeof h.combatProficiencies === 'object' ? h.combatProficiencies : {},
    equipped: h?.equipped && typeof h.equipped === 'object' ? {
      weaponId: h.equipped.weaponId ? String(h.equipped.weaponId) : undefined,
      armourId: h.equipped.armourId ? String(h.equipped.armourId) : undefined,
      helmId: h.equipped.helmId ? String(h.equipped.helmId) : undefined,
      shieldId: h.equipped.shieldId ? String(h.equipped.shieldId) : undefined,
    } : {},
    parry: h?.parry && typeof h.parry === 'object' ? {
      base: typeof h.parry.base === 'number' ? h.parry.base : 0,
      other: typeof h.parry.other === 'number' ? h.parry.other : 0,
    } : { base: 0, other: 0 },
    protectionOther: typeof h?.protectionOther === 'number' ? h.protectionOther : 0,
    usefulItems: Array.isArray(h?.usefulItems) ? h.usefulItems.map((u:any)=>({
      id: String(u?.id ?? crypto.randomUUID()),
      name: String(u?.name ?? ''),
      skillId: String(u?.skillId ?? 'scan'),
    })) : [],

    inventory: Array.isArray(h?.inventory) ? h.inventory.map((it:any)=>({
      id: String(it?.id ?? crypto.randomUUID()),
      name: String(it?.name ?? ''),
      qty: typeof it?.qty === 'number' ? it.qty : 1,
      ref: it?.ref && typeof it.ref === 'object' ? { pack: String(it.ref.pack ?? ''), id: String(it.ref.id ?? '') } : undefined,
      load: typeof it?.load === 'number' ? it.load : undefined,
      equipped: typeof it?.equipped === 'boolean' ? it.equipped : false,
      dropped: typeof it?.dropped === 'boolean' ? it.dropped : false,
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
    backgroundAsset: typeof m?.backgroundAsset === 'string' ? m.backgroundAsset : undefined,
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