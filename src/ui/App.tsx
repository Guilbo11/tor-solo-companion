import React, { useCallback, useMemo, useState } from 'react';
import { defaultState, loadState, saveState, StoredState } from '../core/storage';
import { exportToTorc, importFromTorc } from '../core/torc';
import DicePanel from './DicePanel';
import JournalPanel from './JournalPanel';
import MapPanel from './MapPanel';
import OraclesPanel from './OraclesPanel';
import SettingsPanel from './SettingsPanel';
import HeroesPanel from './HeroesPanel';
import FellowshipPanel from './FellowshipPanel';
import FloatingDieButton from './FloatingDieButton';
import FloatingDiceSheet from './FloatingDiceSheet';

type Tab = 'Campaigns'|'Fellowship'|'Dice'|'Oracles'|'Map'|'Journal'|'Settings';

export default function App() {
  const [state, setState] = useState<StoredState>(() => loadState());
  const [tab, setTab] = useState<Tab>('Campaigns');
  const [diceSheetOpen, setDiceSheetOpen] = useState(false);

  const tabs: Tab[] = ['Campaigns','Fellowship','Dice','Oracles','Map','Journal','Settings'];

  const set: React.Dispatch<React.SetStateAction<StoredState>> = (next) => {
    setState((prev) => {
      const nextState = typeof next === 'function' ? (next as (s: StoredState) => StoredState)(prev) : next;
      saveState(nextState);
      return nextState;
    });
  };

  const header = useMemo(() => {
    return (
      <div className="row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div className="h1">TOR Solo Companion <span className="badge">prototype</span></div>
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

          <button className="btn" onClick={() => {
            if (!confirm('Reset all local data?')) return;
            set(defaultState());
          }}>Reset</button>
        </div>
      </div>
    );
  }, [state]);

  return (
    <div className="container">
      {header}
      <div className="tabs">
        {tabs.map(t => (
          <div key={t} className={'tab ' + (tab === t ? 'active' : '')} onClick={() => setTab(t)}>{t}</div>
        ))}
      </div>

      {tab === 'Campaigns' && <HeroesPanel state={state} setState={set} />}
      {tab === 'Fellowship' && <FellowshipPanel state={state} setState={set} />}
      {tab === 'Dice' && <DicePanel />}
      {tab === 'Oracles' && <OraclesPanel state={state} setState={set} />}
      {tab === 'Map' && <MapPanel state={state} setState={set} />}
      {tab === 'Journal' && <JournalPanel state={state} setState={set} />}
      {tab === 'Settings' && <SettingsPanel state={state} setState={set} />}
      <FloatingDieButton onClick={() => setDiceSheetOpen(true)} />
      <FloatingDiceSheet open={diceSheetOpen} onClose={() => setDiceSheetOpen(false)} />
    </div>
  );
}
