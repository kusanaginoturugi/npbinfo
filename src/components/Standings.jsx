import { Suspense, lazy, useMemo, useState, useEffect } from 'react';
import { getContrastColor, getTeamInfo } from '../data/teams';
import { useFavorites } from '../hooks/useFavorites';
import { apiCache } from '../utils/apiCache';

const LEAGUES = [
  { key: 'cl', label: 'セントラル・リーグ', color: '#003087' },
  { key: 'pl', label: 'パシフィック・リーグ', color: '#c8102e' },
  { key: 'cp', label: 'セ・パ交流戦', color: '#2d6a2d' },
];
const StandingsRadar = lazy(() => import('./charts/StandingsRadar'));
const StandingsBars = lazy(() => import('./charts/StandingsBars'));

function TeamBadge({ name }) {
  const info = getTeamInfo(name);
  const bg = info?.colors?.[0] ?? '#555';
  const code = info?.code ?? (name || '?').slice(0, 2);
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 28, height: 28, borderRadius: '50%', background: bg,
        color: getContrastColor(bg), fontSize: 11, fontWeight: 700,
        marginRight: 8, flexShrink: 0, letterSpacing: 0,
        border: '1px solid rgba(0,0,0,0.08)',
      }}
    >
      {code}
    </span>
  );
}

function FavoriteButton({ teamName, isFavorite, toggleFavorite }) {
  return (
    <button
      className={`fav-btn ${isFavorite ? 'active' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        toggleFavorite(teamName);
      }}
      title={isFavorite ? 'お気に入りから外す' : 'お気に入りに追加'}
    >
      {isFavorite ? '★' : '☆'}
    </button>
  );
}

function StandingsTable({ data, isFavorite, toggleFavorite }) {
  if (!data?.length) return null;
  return (
    <div className="table-wrapper">
      <table className="standings-table">
        <thead>
          <tr>
            <th>順位</th>
            <th style={{ textAlign: 'left' }}>チーム</th>
            <th>試</th>
            <th>勝</th>
            <th>敗</th>
            <th>分</th>
            <th>勝率</th>
            <th>差</th>
            <th>打率</th>
            <th>OPS</th>
            <th>防御率</th>
            <th>本塁打</th>
            <th>盗塁</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => {
            const teamName = row.name ?? '';
            const teamInfo = getTeamInfo(teamName);
            const displayName = teamInfo?.official ?? teamName;
            const favorited = isFavorite(teamName);
            const rowClass = favorited 
              ? 'row-favorite' 
              : (i % 2 === 0 ? 'row-even' : 'row-odd');

            return (
              <tr key={i} className={rowClass}>
                <td className="rank">{row.rank ?? i + 1}</td>
                <td className="team-cell">
                  <FavoriteButton 
                    teamName={teamName} 
                    isFavorite={favorited} 
                    toggleFavorite={toggleFavorite} 
                  />
                  <TeamBadge name={teamName} />
                  {displayName || '-'}
                </td>
                <td>{row.playGameCount ?? '-'}</td>
                <td>{row.win ?? '-'}</td>
                <td>{row.lose ?? '-'}</td>
                <td>{row.draw ?? '-'}</td>
                <td>{row.pct ?? '-'}</td>
                <td>{row.gamesBehind ?? '-'}</td>
                <td>{row.avg ?? '-'}</td>
                <td>{row.ops ?? '-'}</td>
                <td>{row.era ?? '-'}</td>
                <td>{row.hr ?? '-'}</td>
                <td>{row.sb ?? '-'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function Standings() {
  const [activeLeague, setActiveLeague] = useState('cl');
  const [viewMode, setViewMode] = useState('table');
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState({});
  const { isFavorite, toggleFavorite } = useFavorites();

  const cacheKey = `standings:${activeLeague}:${year}`;
  const shouldUseLocalCache = activeLeague !== 'cp';

  useEffect(() => {
    if (data[cacheKey]) return;

    // 1. localStorage キャッシュをチェック
    const cached = shouldUseLocalCache ? apiCache.get(cacheKey) : null;
    if (cached) {
      setData(prev => ({ ...prev, [cacheKey]: cached.data }));
      setLastUpdated(prev => ({ ...prev, [cacheKey]: cached.timestamp }));
      return;
    }

    // 2. なければ API を叩く
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ year: String(year) });
    if (!shouldUseLocalCache) params.set('nocache', '1');
    fetch(`/api/standings/${activeLeague}?${params.toString()}`)
      .then(r => r.json())
      .then(json => {
        if (json.error) throw new Error(json.error);
        const now = Date.now();
        setData(prev => ({ ...prev, [cacheKey]: json }));
        setLastUpdated(prev => ({ ...prev, [cacheKey]: now }));
        if (shouldUseLocalCache) apiCache.set(cacheKey, json, year);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [activeLeague, year, data, cacheKey, shouldUseLocalCache]);

  const activeInfo = LEAGUES.find(l => l.key === activeLeague);
  const standingsRows = useMemo(() => {
    if (!data[cacheKey]) return [];
    return Array.isArray(data[cacheKey]) ? data[cacheKey] : data[cacheKey].teams ?? [];
  }, [cacheKey, data]);
  const updateNote = useMemo(() => {
    const entry = data[cacheKey];
    if (!entry || Array.isArray(entry)) return '';
    return entry.updateNote ?? '';
  }, [cacheKey, data]);
  const graphAvailable = activeLeague === 'cl' || activeLeague === 'pl';

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 12 }, (_, i) => currentYear - i);

  const formatTimestamp = (ts) => {
    if (!ts) return '';
    return new Date(ts).toLocaleString('ja-JP');
  };

  return (
    <section className="section">
      <h2 className="section-title">順位表</h2>
      <div className="controls-row">
        <div className="tab-bar">
          {LEAGUES.map(l => (
            <button
              key={l.key}
              className={`tab-btn ${activeLeague === l.key ? 'active' : ''}`}
              onClick={() => setActiveLeague(l.key)}
            >
              {l.label}
            </button>
          ))}
        </div>
        <select
          value={year}
          onChange={(e) => setYear(parseInt(e.target.value, 10))}
          className="year-select"
        >
          {years.map(y => (
            <option key={y} value={y}>{y}年</option>
          ))}
        </select>
        <div className="tab-bar standings-mode-switch">
          <button
            type="button"
            className={`tab-btn ${viewMode === 'table' ? 'active' : ''}`}
            onClick={() => setViewMode('table')}
          >
            表
          </button>
          <button
            type="button"
            className={`tab-btn ${viewMode === 'charts' ? 'active' : ''}`}
            onClick={() => setViewMode('charts')}
            disabled={!graphAvailable}
            title={graphAvailable ? 'グラフ表示' : 'グラフはセ/パリーグのみ'}
          >
            グラフ
          </button>
        </div>
      </div>
      {!graphAvailable && viewMode === 'charts' && (
        <div className="status-msg">グラフ表示はセ・パリーグ選択時のみ有効です。</div>
      )}

      {loading && <div className="status-msg">読み込み中...</div>}
      {error && (
        <div className="error-msg">
          <strong>取得エラー:</strong> {error}
          <br />
          <small>しばらく待ってから再読み込みしてみてください。</small>
        </div>
      )}
      {!loading && !error && data[cacheKey] && (
        <>
          {viewMode === 'table' && (
            <StandingsTable
              data={standingsRows}
              isFavorite={isFavorite}
              toggleFavorite={toggleFavorite}
            />
          )}
          {viewMode === 'charts' && graphAvailable && (
            <Suspense fallback={<div className="status-msg">グラフ読み込み中...</div>}>
              <div className="standings-charts">
                <StandingsRadar teams={standingsRows} />
                <StandingsBars teams={standingsRows} />
              </div>
            </Suspense>
          )}
          {lastUpdated[cacheKey] && (
            <div style={{ marginTop: '12px', fontSize: '11px', color: 'var(--color-footer)', textAlign: 'right' }}>
              取得日時: {formatTimestamp(lastUpdated[cacheKey])}
              {updateNote ? ` (npb.jp 反映: ${updateNote})` : ''}
            </div>
          )}
        </>
      )}
    </section>
  );
}
