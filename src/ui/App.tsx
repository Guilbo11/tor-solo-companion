import React, { useEffect, useMemo, useState } from 'react';
import { defaultState, loadState, saveState, StoredState } from '../core/storage';
import { exportToTorc, importFromTorc } from '../core/torc';
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

  // (Settings button reverted back to a tab; no gear icon)

  const header = useMemo(() => {
    return (
      <div className="row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div className="h1">TOR Companion</div>
          <div className="muted small">Local-only by default. You can export/import your data anytime.</div>
        </div>
        <div className="row" style={{ alignItems: 'center' }}>
          <button className="btn" onClick={() => {
            const blob = exportToTorc(state);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `tor-companion-${new Date().toISOString().slice(0,10)}.torc`;
            a.click();
            URL.revokeObjectURL(url);
          }}>Export</button>

          <label className="btn" style={{cursor:'pointer'}}>
            Import
            <input type="file" accept=".torc" style={{display:'none'}} onChange={async (e)=>{
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                const next = await importFromTorc(f);
                set(next);
                alert('Imported!');
              } catch (err:any) {
                alert(err?.message ?? 'Import failed.');
              } finally {
                (e.target as HTMLInputElement).value = '';
              }
            }} />
          </label>

          {/* Reset removed (too risky) */}
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
            <FloatingDieButton onClick={() => setDiceSheetOpen(true)} />
            <FloatingOracleButton onClick={() => setOracleOpen(true)} />
          </div>
          <FloatingDiceSheet state={state} open={diceSheetOpen} onClose={() => setDiceSheetOpen(false)} />
          <OracleSidePanel open={oracleOpen} onClose={() => setOracleOpen(false)}>
            <OraclesPanel state={state} setState={set} compact />
          </OracleSidePanel>
        </>
      ) : null}

      <ToastHost />
    </div>
  );
}
