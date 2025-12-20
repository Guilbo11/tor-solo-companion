import React, { useMemo, useState } from 'react';
import { defaultState, exportState, importState, loadState, saveState, StoredState } from '../core/storage';
import DicePanel from './DicePanel';
import JournalPanel from './JournalPanel';
import MapPanel from './MapPanel';
import OraclesPanel from './OraclesPanel';
import SettingsPanel from './SettingsPanel';
import HeroesPanel from './HeroesPanel';

type Tab = 'Heroes'|'Fellowship'|'Dice'|'Oracles'|'Map'|'Journal'|'Settings';

export default function App() {
  const [state, setState] = useState<StoredState>(() => loadState());
  const [tab, setTab] = useState<Tab>('Heroes');

  const tabs: Tab[] = ['Heroes','Dice','Oracles','Map','Journal','Settings'];

  const set = (next: StoredState) => {
    setState(next);
    saveState(next);
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
            const txt = exportState(state);
            navigator.clipboard.writeText(txt);
            alert('Export JSON copied to clipboard.');
          }}>Export</button>

          <button className="btn" onClick={() => {
            const json = prompt('Paste previously exported JSON here:');
            if (!json) return;
            try {
              const next = importState(json);
              set(next);
              alert('Imported!');
            } catch (e: any) {
              alert(e?.message ?? 'Import failed.');
            }
          }}>Import</button>

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

      {tab === 'Heroes' && <HeroesPanel state={state} setState={setState} />}
      {tab === 'Fellowship' && <FellowshipPanel state={state} setState={setState} />}
      {tab === 'Dice' && <DicePanel />}
      {tab === 'Oracles' && <OraclesPanel state={state} setState={setState} />}
      {tab === 'Map' && <MapPanel state={state} setState={setState} />}
      {tab === 'Journal' && <JournalPanel state={state} setState={setState} />}
      {tab === 'Settings' && <SettingsPanel state={state} setState={setState} />}
    </div>
  );
}
