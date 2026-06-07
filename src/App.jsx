import { useState, useEffect, useRef } from 'react';
import Standings from './components/Standings';
import PlayerStats from './components/PlayerStats';
import Schedule from './components/Schedule';
import Stadiums from './components/Stadiums';
import TeamTimeline from './components/TeamTimeline';
import HomeRunParkFactorMethod from './components/HomeRunParkFactorMethod';
import { getBuildInfo, isDebugMode, syncDebugFromUrl, withNoCache } from './utils/debug';
import {
  defaultRoute,
  parseRoute,
  parkFactorMethodPath,
  schedulePath,
  stadiumPath,
  standingsPath,
  statsPath,
  teamPath,
} from './utils/routes';
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
  const [route, setRoute] = useState(() => parseRoute(window.location.pathname));
  const [dark, setDark] = useTheme();
  const [showOptions, setShowOptions] = useState(false);
  const optionsRef = useRef(null);

  const navigate = (nextRoute, { replace = false } = {}) => {
    const method = replace ? 'replaceState' : 'pushState';
    window.history[method](null, '', `${nextRoute.path}${window.location.search}`);
    setRoute(nextRoute);
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

  useEffect(() => {
    if (window.location.pathname !== route.path) {
      window.history.replaceState(null, '', `${route.path}${window.location.search}`);
    }

    const onPopState = () => setRoute(parseRoute(window.location.pathname));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [route.path]);

  const selectTab = (tab) => navigate(defaultRoute(tab));

  const openStadium = (stadiumId) => {
    navigate({ tab: 'stadiums', stadiumId, path: stadiumPath(stadiumId) });
  };

  const openTeam = (team) => {
    if (team !== '阪神') return;
    navigate({ tab: 'team', team: 'hanshin', path: teamPath('hanshin') });
  };

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
                className={`nav-tab ${route.tab === t.key ? 'active' : ''}`}
                onClick={() => selectTab(t.key)}
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
        {route.tab === 'standings' && (
          <Standings
            key={route.path}
            initialLeague={route.league}
            initialYear={route.year}
            onSelectTeam={openTeam}
            onOpenParkFactorMethod={() => navigate({
              tab: 'methodology',
              method: 'home-run-park-factor',
              path: parkFactorMethodPath(),
            })}
            onRouteChange={(league, year) => navigate({
              tab: 'standings',
              league,
              year,
              path: standingsPath(league, year),
            })}
          />
        )}
        {route.tab === 'players' && (
          <PlayerStats
            key={route.path}
            initialType={route.type}
            initialLeague={route.league}
            initialYear={route.year}
            onRouteChange={(type, league, year) => navigate({
              tab: 'players',
              type,
              league,
              year,
              path: statsPath(type, league, year),
            })}
          />
        )}
        {route.tab === 'schedule' && (
          <Schedule
            key={route.path}
            initialMonth={route.month}
            onMonthChange={(month) => navigate({
              tab: 'schedule',
              month,
              path: schedulePath(month),
            })}
            onSelectStadium={openStadium}
          />
        )}
        {route.tab === 'stadiums' && (
          <Stadiums
            key={route.path}
            selectedStadiumId={route.stadiumId}
            onSelectStadium={openStadium}
          />
        )}
        {route.tab === 'team' && route.team === 'hanshin' && (
          <TeamTimeline key={`${route.path}-${dark ? 'dark' : 'light'}`} dark={dark} />
        )}
        {route.tab === 'methodology' && route.method === 'home-run-park-factor' && (
          <HomeRunParkFactorMethod
            onBack={() => navigate(defaultRoute('standings'))}
          />
        )}
      </main>

      <footer className="app-footer">
        <SystemStatus />
        <p>データ出典: npb.jp（公式）</p>
      </footer>
    </div>
  );
}
