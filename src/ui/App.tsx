
import React, { useEffect, useMemo, useState } from 'react';
import { loadState, saveState, type StoredState } from '../core/storage';
import DicePanel from './DicePanel';
import OraclesPanel from './OraclesPanel';
import MapPanel from './MapPanel';
import SettingsPanel from './SettingsPanel';
import { HeroesPanel } from './HeroesPanel';
import { JournalPanel } from './JournalPanel';
import { FellowshipPanel } from './FellowshipPanel';

type Tab = 'Heroes'|'Journal'|'Fellowship'|'Map'|'Oracles'|'Dice'|'Settings';

export default function App() {
  const [state, setState] = useState<StoredState>(() => loadState());
  const [tab, setTab] = useState<Tab>('Heroes');

  useEffect(() => { saveState(state); }, [state]);

  const tabs: {id:Tab; label:string}[] = [
    { id:'Heroes', label:'HEROES' },
    { id:'Journal', label:'JOURNAL' },
    { id:'Fellowship', label:'FELLOWSHIP' },
    { id:'Map', label:'MAP' },
    { id:'Oracles', label:'ORACLES' },
    { id:'Dice', label:'DICE' },
    { id:'Settings', label:'SETTINGS' },
  ];

  return (
    <div className="appShell">
      <header className="topbar">
        <div className="brand">
          <span className="logoDot" />
          <span>TOR Solo Companion</span>
        </div>
        <div className="right">
          <span className="pill">{state.mode === 'strider' ? 'Strider Mode' : 'Normal Mode'}</span>
        </div>
      </header>

      <nav className="tabs">
        {tabs.map(t=>(
          <button key={t.id} className={"tabBtn " + (tab===t.id ? "active" : "")} onClick={()=>setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      <main className="main">
        {tab === 'Heroes' && <HeroesPanel state={state} setState={setState} />}
        {tab === 'Journal' && <JournalPanel state={state} setState={setState} />}
        {tab === 'Fellowship' && <FellowshipPanel state={state} setState={setState} />}
        {tab === 'Map' && <MapPanel state={state} setState={setState} />}
        {tab === 'Oracles' && <OraclesPanel state={state} setState={setState} />}
        {tab === 'Dice' && <DicePanel state={state} setState={setState} />}
        {tab === 'Settings' && <SettingsPanel state={state} setState={setState} />}
      </main>
    </div>
  );
}
