import { useState, useEffect } from 'react';
import { getContrastColor, getTeamInfo } from '../data/teams';
import { useFavorites } from '../hooks/useFavorites';
import { apiCache } from '../utils/apiCache';

const LEAGUES = [
  { key: 'cl', label: 'セントラル・リーグ', color: '#003087' },
  { key: 'pl', label: 'パシフィック・リーグ', color: '#c8102e' },
  { key: 'cp', label: 'セ・パ交流戦', color: '#2d6a2d' },
];

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
            <th>防御率</th>
            <th>本塁打</th>
            <th>盗塁</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => {
            const teamName = row.name ?? '';
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
                  {teamName || '-'}
                </td>
                <td>{row.playGameCount ?? '-'}</td>
                <td>{row.win ?? '-'}</td>
                <td>{row.lose ?? '-'}</td>
                <td>{row.draw ?? '-'}</td>
                <td>{row.pct ?? '-'}</td>
                <td>{row.gamesBehind ?? '-'}</td>
                <td>{row.avg ?? '-'}</td>
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
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState({});
  const { isFavorite, toggleFavorite } = useFavorites();

  const cacheKey = `standings:${activeLeague}:${year}`;

  useEffect(() => {
    if (data[cacheKey]) return;

    // 1. localStorage キャッシュをチェック
    const cached = apiCache.get(cacheKey);
    if (cached) {
      setData(prev => ({ ...prev, [cacheKey]: cached.data }));
      setLastUpdated(prev => ({ ...prev, [cacheKey]: cached.timestamp }));
      return;
    }

    // 2. なければ API を叩く
    setLoading(true);
    setError(null);
    fetch(`/api/standings/${activeLeague}?year=${year}`)
      .then(r => r.json())
      .then(json => {
        if (json.error) throw new Error(json.error);
        const now = Date.now();
        setData(prev => ({ ...prev, [cacheKey]: json }));
        setLastUpdated(prev => ({ ...prev, [cacheKey]: now }));
        apiCache.set(cacheKey, json, year);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [activeLeague, year, data, cacheKey]);

  const activeInfo = LEAGUES.find(l => l.key === activeLeague);

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
      </div>

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
          <StandingsTable 
            data={Array.isArray(data[cacheKey]) ? data[cacheKey] : data[cacheKey].teams ?? []} 
            isFavorite={isFavorite}
            toggleFavorite={toggleFavorite}
          />
          {lastUpdated[cacheKey] && (
            <div style={{ marginTop: '12px', fontSize: '11px', color: 'var(--color-footer)', textAlign: 'right' }}>
              取得日時: {formatTimestamp(lastUpdated[cacheKey])}
            </div>
          )}
        </>
      )}
    </section>
  );
}
