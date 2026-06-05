import { useState, useEffect, useRef } from 'react';
import Standings from './components/Standings';
import PlayerStats from './components/PlayerStats';
import Schedule from './components/Schedule';
import Stadiums from './components/Stadiums';
import { getBuildInfo, isDebugMode, syncDebugFromUrl, withNoCache } from './utils/debug';
import './App.css';

syncDebugFromUrl();

const TABS = [
  { key: 'standings', label: '順位表' },
  { key: 'players', label: '選手成績' },
  { key: 'schedule', label: '試合日程' },
  { key: 'stadiums', label: '球場情報' },
];

function SystemStatus() {
  const [apiInfo, setApiInfo] = useState(null);
  const [error, setError] = useState(null);
  const appInfo = getBuildInfo();
  const debugMode = isDebugMode();

  useEffect(() => {
    fetch(withNoCache('/api/debug'), { cache: 'no-store' })
      .then(r => r.json())
      .then(json => {
        setApiInfo(json);
        setError(null);
      })
      .catch(e => setError(e.message));
  }, []);

  const refreshApp = async () => {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(key => caches.delete(key)));
    }
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(registration => registration.update()));
    }
    window.location.reload();
  };

  return (
    <div className="system-status">
      <span>App: {appInfo.buildId}</span>
      <span>API: {apiInfo?.buildId ?? (error ? '取得失敗' : '確認中')}</span>
      {debugMode && (
        <button type="button" onClick={refreshApp} className="system-refresh">
          更新確認
        </button>
      )}
    </div>
  );
}

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
  const [selectedStadiumId, setSelectedStadiumId] = useState(null);
  const [dark, setDark] = useTheme();
  const [showOptions, setShowOptions] = useState(false);
  const optionsRef = useRef(null);

  const openStadium = (stadiumId) => {
    setSelectedStadiumId(stadiumId);
    setTab('stadiums');
  };

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
        {tab === 'schedule' && <Schedule onSelectStadium={openStadium} />}
        {tab === 'stadiums' && <Stadiums selectedStadiumId={selectedStadiumId} />}
      </main>

      <footer className="app-footer">
        <SystemStatus />
        <p>データ出典: npb.jp（公式）</p>
      </footer>
    </div>
  );
}
