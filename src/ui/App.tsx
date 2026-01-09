import React, { useEffect, useMemo, useState } from 'react';
import { defaultState, loadState, saveState, StoredState } from '../core/storage';
import { exportToTorc, importFromTorc } from '../core/torc';
import { computeDerived } from '../core/tor2e';
import { rollTOR } from '../core/dice';
import { combatReducer } from '../combat/reducer';
import JournalPanel from './JournalPanel';
import MapPanel from './MapPanel';
import OraclesPanel from './OraclesPanel';
import SettingsPanel from './SettingsPanel';
import HeroesPanel from './HeroesPanel';
import CombatPanel from './CombatPanel';
import FellowshipPanel from './FellowshipPanel';
import FloatingDieButton from './FloatingDieButton';
import FloatingDiceSheet from './FloatingDiceSheet';
import NPCsPanel from './NPCsPanel';
import FloatingOracleButton from './FloatingOracleButton';
import OracleSidePanel from './OracleSidePanel';
import ToastHost from './ToastHost';

type Tab = 'Journal'|'Heroes'|'Combat'|'Map'|'NPCs'|'Fellowship'|'Oracles'|'Settings';

type AppMode = 'landing' | 'main';

export default function App() {
  const [state, setState] = useState<StoredState>(() => loadState());
  const [mode, setMode] = useState<AppMode>('landing');
  const [tab, setTab] = useState<Tab>('Journal');
  const [diceSheetOpen, setDiceSheetOpen] = useState(false);
  const [oracleOpen, setOracleOpen] = useState(false);
  const [dataPanelOpen, setDataPanelOpen] = useState(false);

  // When on the landing page, render a clean page (no app header/tabs/dice)
  // like Pocketforge. Campaign management only happens there.
  const isCampaignLanding = mode === 'landing';

  // Settings is a tab (after Oracles).
  const tabs: Tab[] = ['Journal','Heroes','Combat','Map','NPCs','Fellowship','Oracles','Settings'];

  const set: React.Dispatch<React.SetStateAction<StoredState>> = (next) => {
    setState((prev) => {
      const nextState = typeof next === 'function' ? (next as (s: StoredState) => StoredState)(prev) : next;
      saveState(nextState);
      return nextState;
    });
  };

  const campId = state.activeCampaignId ?? 'camp-1';
  const combat = (state.combatByCampaign?.[campId] ?? null) as any;
  const combatHero = useMemo(() => {
    if (!combat) return null;
    return (state.heroes ?? []).find((h: any) => String(h.id) === String(combat.heroId)) ?? null;
  }, [combat, state.heroes]);
  const combatDerived = useMemo(() => {
    if (!combatHero) return null;
    const tnBase = combat?.options?.striderMode ? 18 : 20;
    return computeDerived(combatHero, tnBase);
  }, [combatHero, combat?.options?.striderMode]);

    const theme = (state as any)?.settings?.theme === 'corebook' ? 'corebook' : 'dark';

const toast = (message: string, type: 'info'|'success'|'warning'|'error' = 'info') => {
    (window as any).__torcToast?.({ message, type, durationMs: 4000 });
  };

  const dispatchCombat = (ev: any) => {
    setState((prev: any) => {
      const current = (prev.combatByCampaign?.[campId] ?? null) as any;
      const next = combatReducer(current, ev);
      const by = { ...(prev.combatByCampaign ?? {}) };
      by[campId] = next;
      return { ...prev, combatByCampaign: by };
    });
  };

  const handleExport = () => {
    const blob = exportToTorc(state);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tor-companion-${new Date().toISOString().slice(0,10)}.torc`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const next = await importFromTorc(file);
      set(next);
      toast('Imported!', 'success');
    } catch (err:any) {
      toast(err?.message ?? 'Import failed.', 'error');
    }
  };

  const engagedEnemyIds = combat?.engagement?.heroToEnemies?.[String(combat?.heroId ?? '')] ?? [];
  const engagedEnemies = combat?.enemies?.filter((e: any) => engagedEnemyIds.includes(e.id)) ?? [];
  const canFreeEscape = combat?.hero?.stance === 'rearward';
  const canRollEscape = combat?.hero?.stance === 'defensive' && engagedEnemies.length > 0 && (combatDerived?.equippedWeapons?.length ?? 0) > 0;
  const showEscapeFab = !!combat && (combat.hero.stance === 'rearward' || combat.hero.stance === 'skirmish');

  const handleEscapeFab = () => {
    if (!combat || !combatHero || !combatDerived) return;
    if (combat.actionsUsed?.hero) {
      toast('You already used your main action this round.', 'warning');
      return;
    }
    if (canFreeEscape) {
      dispatchCombat({ type: 'ATTEMPT_ESCAPE', mode: 'FREE' });
      toast('Escaped combat (Rearward stance).', 'success');
      return;
    }
    if (!canRollEscape) {
      toast('Escape is not available in this stance.', 'warning');
      return;
    }
    const weapon: any = combatDerived.equippedWeapons?.[0];
    const prof = String(weapon?.proficiency ?? '').toLowerCase();
    const rating = (() => {
      const cp = combatDerived?.combatProficiencies ?? {};
      if (prof.startsWith('axe')) return cp.axes ?? 0;
      if (prof.startsWith('bow')) return cp.bows ?? 0;
      if (prof.startsWith('spear')) return cp.spears ?? 0;
      if (prof.startsWith('sword')) return cp.swords ?? 0;
      return 0;
    })();
    const target = engagedEnemies[0];
    const tn = Number(target?.parry ?? 0) || 0;
    const r = rollTOR({ dice: rating, tn, weary: !!combatHero?.conditions?.weary });
    dispatchCombat({ type: 'ATTEMPT_ESCAPE', mode: 'ROLL', rollPassed: !!r.passed });
    dispatchCombat({ type: 'LOG', text: `Escape roll (${weapon?.name ?? 'weapon'}): ${r.passed ? 'PASS' : 'FAIL'} (TN ${tn}).` });
    const toastMsg = `Escape roll (${weapon?.name ?? 'weapon'}): ${r.passed ? 'PASS' : 'FAIL'} (TN ${tn}).`;
    toast(toastMsg, r.passed ? 'success' : 'warning');
    (window as any).__torcLogRollHtml?.(`Escape - ${r.passed ? 'PASS' : 'FAIL'}. TN ${tn}.`);
  };

  const header = useMemo(() => {
    return (
      <div className="row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div className="h1">TOR Companion</div>
          <div className="muted small">Local-only by default. You can export/import your data anytime.</div>
        </div>
        <div className="row" style={{ alignItems: 'center' }}>
          <button
            type="button"
            className="iconBtn"
            aria-label="Open import/export panel"
            title="Import/Export"
            onClick={() => setDataPanelOpen(true)}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1 .6 1.65 1.65 0 0 0-.33 1.82V22a2 2 0 0 1-4 0v-.08a1.65 1.65 0 0 0-.33-1.82 1.65 1.65 0 0 0-1-.6 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-.6-1 1.65 1.65 0 0 0-1.82-.33H2a2 2 0 0 1 0-4h.08a1.65 1.65 0 0 0 1.82-.33 1.65 1.65 0 0 0 .6-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06A2 2 0 1 1 6.94 3.63l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-.6 1.65 1.65 0 0 0 .33-1.82V2a2 2 0 0 1 4 0v.08a1.65 1.65 0 0 0 .33 1.82 1.65 1.65 0 0 0 1 .6 1.65 1.65 0 0 0 1.82-.33l.06-.06A2 2 0 1 1 21.37 6.94l-.06.06A1.65 1.65 0 0 0 19.4 9c.18.3.38.58.6 1a1.65 1.65 0 0 0 1.82.33H22a2 2 0 0 1 0 4h-.08a1.65 1.65 0 0 0-1.82.33 1.65 1.65 0 0 0-.6 1z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
    );
  }, [state]);

  const landingHeader = (
    <div className="row" style={{ alignItems: 'center', justifyContent: 'space-between', padding: '14px 14px 8px' }}>
      <div className="h1" style={{ margin: 0 }}>TOR Companion</div>
      <div />
    </div>
  );

  // Global roll logger hook (dice + oracles) -> active journal chapter (works from any tab).

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
    if (meta) meta.content = theme === 'corebook' ? '#F5F1E8' : '#0b0f17';
  }, [theme]);

useEffect(() => {
    (window as any).__torcLogRollHtml = (html: string) => {
      const clean = String(html ?? '').trim();
      if (!clean) return;

      // IMPORTANT: use a functional update so we don't clobber other state updates
      // that may have happened immediately before logging (ex: Oracle history).
      set((prev) => {
        if (!prev.settings?.addRollsToJournal) return prev;

        const campId = prev.activeCampaignId ?? 'camp-1';
        const chapters = (prev.journalByCampaign?.[campId] ?? []) as any[];
        const activeId = prev.activeJournalChapterIdByCampaign?.[campId] ?? chapters[0]?.id;

        // Ensure we always have a chapter to write into.
        let nextChapters = chapters;
        let targetId = activeId;
        if (!targetId) {
          targetId = `chap-${crypto.randomUUID()}`;
          nextChapters = [{ id: targetId, title: 'Chapter 1', html: '', collapsed: false }, ...chapters] as any;
        }

        const next = nextChapters.map((c: any) => {
          if (c.id !== targetId) return c;
          const base = String(c.html ?? '');
          const joined = base ? `${base}<br/>${clean}` : clean;
          return { ...c, html: joined };
        });

        // Also notify the Journal editor (if mounted) so it can insert at caret / update immediately.
        window.dispatchEvent(new CustomEvent('torc:journal-insert-html', { detail: { html: clean, chapterId: targetId, campaignId: campId } }));

        return {
          ...prev,
          journalByCampaign: { ...(prev.journalByCampaign ?? {}), [campId]: next },
          activeJournalChapterIdByCampaign: { ...(prev.activeJournalChapterIdByCampaign ?? {}), [campId]: targetId },
        } as any;
      });
    };
    return () => { (window as any).__torcLogRollHtml = undefined; };
  }, [set]);

  return (
    <div className={isCampaignLanding ? 'landingContainer' : 'container'}>
      {isCampaignLanding ? landingHeader : header}
      {!isCampaignLanding ? (
        <div className="tabs">
          {tabs.map(t => (
            <div key={t} className={'tab ' + (tab === t ? 'active' : '')} onClick={() => setTab(t)}>{t}</div>
          ))}
        </div>
      ) : null}

      {isCampaignLanding ? (
        <HeroesPanel
          state={state}
          setState={set}
          mode="landing"
          onOpenCampaign={() => {
            // Once you leave the landing page, the campaign is managed from within the app.
            // The Campaigns button/tab is intentionally hidden in "main" mode.
            setMode('main');
            setTab('Heroes');
          }}
        />
      ) : null}

      {!isCampaignLanding && (
        <>
          {tab === 'Journal' && <JournalPanel state={state} setState={set} />}
          {tab === 'Heroes' && <HeroesPanel state={state} setState={set} mode="main" />}
          {tab === 'Combat' && <CombatPanel state={state} setState={set} />}
          {tab === 'Map' && <MapPanel state={state} setState={set} />}
          {tab === 'NPCs' && <NPCsPanel state={state} setState={set} />}
          {tab === 'Fellowship' && <FellowshipPanel state={state} setState={set} />}
          {tab === 'Oracles' && <OraclesPanel state={state} setState={set} />}
          {tab === 'Settings' && (
            <SettingsPanel
              state={state}
              setState={set}
              onBackToCampaigns={() => {
                setMode('landing');
              }}
            />
          )}
        </>
      )}

      {!isCampaignLanding ? (
        <>
          <div className="fab-row">
            {showEscapeFab ? (
              <button type="button" className="fab-btn" aria-label="Escape" title="Escape" onClick={handleEscapeFab} disabled={combat?.actionsUsed?.hero || (!canFreeEscape && !canRollEscape)}>
                🏃
              </button>
            ) : null}
            {combat ? (
              <button type="button" className="fab-btn" aria-label="Next round" title="Next round" onClick={() => dispatchCombat({ type: 'ROUND_BEGIN' })}>
                ⏭
              </button>
            ) : null}
            <FloatingDieButton onClick={() => setDiceSheetOpen(true)} />
            <FloatingOracleButton onClick={() => setOracleOpen(true)} />
          </div>
          <FloatingDiceSheet state={state} open={diceSheetOpen} onClose={() => setDiceSheetOpen(false)} />
          <OracleSidePanel open={oracleOpen} onClose={() => setOracleOpen(false)}>
            <OraclesPanel state={state} setState={set} compact />
          </OracleSidePanel>
          <OracleSidePanel open={dataPanelOpen} onClose={() => setDataPanelOpen(false)} title="Import/Export" ariaLabel="Import and export">
            <div className="small muted">Export your campaign data or import a saved .torc file.</div>
            <div className="row" style={{ gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
              <button className="btn" onClick={handleExport}>Export</button>
              <label className="btn" style={{cursor:'pointer'}}>
                Import
                <input type="file" accept=".torc" style={{display:'none'}} onChange={async (e)=>{
                  const f = e.target.files?.[0];
                  await handleImport(f);
                  (e.target as HTMLInputElement).value = '';
                }} />
              </label>
            </div>

            <hr />
            <div className="h2">Theme</div>
            <div className="card" style={{ padding: 12, marginTop: 10 }}>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 800 }}>App theme</div>
                  <div className="small muted">Dark = current theme. Corebook = parchment styling inspired by the TOR corebook.</div>
                </div>
                <select
                  className="input"
                  style={{ width: 170 }}
                  value={theme}
                  onChange={(e) => {
                    const nextTheme = e.target.value === 'corebook' ? 'corebook' : 'dark';
                    set((prev) => ({ ...prev, settings: { ...(prev.settings ?? {}), theme: nextTheme } } as any));
                  }}
                >
                  <option value="dark">Dark</option>
                  <option value="corebook">Corebook</option>
                </select>
              </div>
            </div>
          </OracleSidePanel>
        </>
      ) : null}

      <ToastHost />
    </div>
  );
}
