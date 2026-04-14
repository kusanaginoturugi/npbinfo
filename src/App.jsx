import { useState } from 'react';
import Standings from './components/Standings';
import PlayerStats from './components/PlayerStats';
import './App.css';

const TABS = [
  { key: 'standings', label: '順位表' },
  { key: 'players', label: '選手成績' },
];

export default function App() {
  const [tab, setTab] = useState('standings');

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-inner">
          <h1 className="app-title">
            <span className="title-badge">NPB</span>
            <span>プロ野球情報</span>
          </h1>
          <nav className="nav-tabs">
            {TABS.map(t => (
              <button
                key={t.key}
                className={`nav-tab ${tab === t.key ? 'active' : ''}`}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="app-main">
        {tab === 'standings' && <Standings />}
        {tab === 'players' && <PlayerStats />}
      </main>

      <footer className="app-footer">
        <p>データ出典: npb.jp（公式）/ npb-result API（非公式）</p>
      </footer>
    </div>
  );
}
