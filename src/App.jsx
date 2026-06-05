import { useState, useEffect, useRef } from 'react';
import Standings from './components/Standings';
import PlayerStats from './components/PlayerStats';
import Schedule from './components/Schedule';
import Stadiums from './components/Stadiums';
import { syncDebugFromUrl } from './utils/debug';
import './App.css';

syncDebugFromUrl();

const TABS = [
  { key: 'standings', label: '順位表' },
  { key: 'players', label: '選手成績' },
  { key: 'schedule', label: '試合日程' },
  { key: 'stadiums', label: '球場情報' },
];

function useTheme() {
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem('theme');
    if (saved) return saved === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }, [dark]);

  return [dark, setDark];
}

export default function App() {
  const [tab, setTab] = useState('standings');
  const [dark, setDark] = useTheme();
  const [showOptions, setShowOptions] = useState(false);
  const optionsRef = useRef(null);

  useEffect(() => {
    function onClickOutside(e) {
      if (optionsRef.current && !optionsRef.current.contains(e.target)) {
        setShowOptions(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

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

          <div className="options-wrapper" ref={optionsRef}>
            <button
              className={`options-btn ${showOptions ? 'active' : ''}`}
              onClick={() => setShowOptions(s => !s)}
              aria-label="オプション"
            >
              ⚙
            </button>
            {showOptions && (
              <div className="options-panel">
                <div className="option-item">
                  <span className="option-label">🌙 ダークモード</span>
                  <button
                    className={`toggle ${dark ? 'on' : ''}`}
                    onClick={() => setDark(d => !d)}
                    aria-pressed={dark}
                    aria-label="ダークモード切り替え"
                  >
                    <span className="toggle-thumb" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="app-main">
        {tab === 'standings' && <Standings />}
        {tab === 'players' && <PlayerStats />}
        {tab === 'schedule' && <Schedule />}
        {tab === 'stadiums' && <Stadiums />}
      </main>

      <footer className="app-footer">
        <p>データ出典: npb.jp（公式）</p>
      </footer>
    </div>
  );
}
