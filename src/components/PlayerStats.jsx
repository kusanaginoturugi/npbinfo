import { useState, useEffect, useMemo } from 'react';
import { TEAMS } from '../data/teams';
import { useFavorites } from '../hooks/useFavorites';
import { apiCache } from '../utils/apiCache';

const LEAGUES = [
  { key: 'cl', label: 'セ・リーグ' },
  { key: 'pl', label: 'パ・リーグ' },
];

const TYPES = [
  { key: 'batting', label: '打撃成績' },
  { key: 'pitching', label: '投手成績' },
];

const BATTING_COLS = [
  { key: 'rank', label: '順位' },
  { key: 'name', label: '選手名', align: 'left' },
  { key: 'team', label: 'チーム', align: 'left' },
  { key: 'games', label: '試合' },
  { key: 'avg', label: '打率' },
  { key: 'hits', label: '安打' },
  { key: 'hr', label: 'HR' },
  { key: 'rbi', label: '打点' },
  { key: 'sb', label: '盗塁' },
  { key: 'obp', label: '出塁率' },
  { key: 'slg', label: '長打率' },
];

const PITCHING_COLS = [
  { key: 'rank', label: '順位' },
  { key: 'name', label: '選手名', align: 'left' },
  { key: 'team', label: 'チーム', align: 'left' },
  { key: 'era', label: '防御率' },
  { key: 'games', label: '登板' },
  { key: 'wins', label: '勝' },
  { key: 'losses', label: '敗' },
  { key: 'saves', label: 'S' },
  { key: 'ip', label: '投球回' },
  { key: 'so', label: '奪三振' },
];

const TEAM_MAP = {
  '神': '阪神', 'デ': 'DeNA', 'ヤ': 'ヤクルト', '巨': '巨人', '広': '広島', '中': '中日',
  'ソ': 'ソフトバンク', '日': '日本ハム', '楽': '楽天', 'ロ': 'ロッテ', 'オ': 'オリックス', '西': '西武'
};

function StatsTable({ players, type, sortConfig, onSort }) {
  const cols = type === 'batting' ? BATTING_COLS : PITCHING_COLS;
  
  if (!players?.length) return <div className="status-msg">データがありません</div>;

  return (
    <div className="table-wrapper">
      <table className="stats-table">
        <thead>
          <tr>
            {cols.map(c => (
              <th 
                key={c.key} 
                style={{ 
                  textAlign: c.align === 'left' ? 'left' : 'center',
                  cursor: 'pointer',
                  userSelect: 'none'
                }}
                onClick={() => onSort(c.key)}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: c.align === 'left' ? 'flex-start' : 'center', gap: '4px' }}>
                  {c.label}
                  <span style={{ fontSize: '10px', opacity: sortConfig.key === c.key ? 1 : 0.3 }}>
                    {sortConfig.key === c.key ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '⇅'}
                  </span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {players.map((p, i) => (
            <tr key={i} className={i % 2 === 0 ? 'row-even' : 'row-odd'}>
              {cols.map(c => {
                let val = p[c.key];
                if (c.key === 'team') val = TEAM_MAP[val] || val;
                
                return (
                  <td
                    key={c.key}
                    style={c.align === 'left' ? { textAlign: 'left' } : {}}
                    className={c.key === 'name' ? 'player-name' : ''}
                  >
                    {val ?? '-'}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PlayerStats() {
  const [league, setLeague] = useState('cl');
  const [type, setType] = useState('batting');
  const [year, setYear] = useState(new Date().getFullYear());
  const [cache, setCache] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [errorDetail, setErrorDetail] = useState(null);
  const [lastUpdated, setLastUpdated] = useState({});
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const { isFavorite } = useFavorites();
  
  // ソート設定: 初期状態は順位の昇順
  const [sortConfig, setSortConfig] = useState({ key: 'rank', direction: 'asc' });

  const cacheKey = `stats:${type}-${league}-${year}`;

  useEffect(() => {
    if (cache[cacheKey]) return;

    // 1. localStorage キャッシュをチェック
    const cached = apiCache.get(cacheKey);
    if (cached) {
      setCache(prev => ({ ...prev, [cacheKey]: cached.data }));
      setLastUpdated(prev => ({ ...prev, [cacheKey]: cached.timestamp }));
      return;
    }

    // 2. なければ API を叩く
    setLoading(true);
    setError(null);
    setErrorDetail(null);
    fetch(`/api/stats/${type}/${league}?year=${year}`)
      .then(r => r.json())
      .then(json => {
        if (json.error) {
          setError(json.error);
          setErrorDetail(json.detail);
          return;
        }
        const now = Date.now();
        const players = json.players ?? [];
        setCache(prev => ({ ...prev, [cacheKey]: players }));
        setLastUpdated(prev => ({ ...prev, [cacheKey]: now }));
        apiCache.set(cacheKey, players, year);
      })
      .catch(e => {
        setError(e.message);
      })
      .finally(() => setLoading(false));
  }, [cacheKey, cache, type, league, year]);

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  const sortedPlayers = useMemo(() => {
    let raw = cache[cacheKey] || [];
    
    // お気に入りフィルタ
    if (showFavoritesOnly) {
      raw = raw.filter(p => {
        const fullTeamName = TEAM_MAP[p.team] || p.team;
        return isFavorite(fullTeamName);
      });
    }

    if (!sortConfig.key) return raw;

    return [...raw].sort((a, b) => {
      let aVal = a[sortConfig.key];
      let bVal = b[sortConfig.key];

      // 数値として比較を試みる
      const aNum = parseFloat(aVal);
      const bNum = parseFloat(bVal);

      if (!isNaN(aNum) && !isNaN(bNum)) {
        return sortConfig.direction === 'asc' ? aNum - bNum : bNum - aNum;
      }

      // 文字列比較
      aVal = String(aVal || '');
      bVal = String(bVal || '');
      return sortConfig.direction === 'asc' 
        ? aVal.localeCompare(bVal, 'ja') 
        : bVal.localeCompare(aVal, 'ja');
    });
  }, [cache, cacheKey, sortConfig, isFavorite, showFavoritesOnly]);

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 12 }, (_, i) => currentYear - i);

  const formatTimestamp = (ts) => {
    if (!ts) return '';
    return new Date(ts).toLocaleString('ja-JP');
  };

  return (
    <section className="section">
      <h2 className="section-title">選手成績</h2>
      <div className="controls-row">
        <div className="tab-bar">
          {TYPES.map(t => (
            <button
              key={t.key}
              className={`tab-btn ${type === t.key ? 'active' : ''}`}
              onClick={() => {
                setType(t.key);
                setSortConfig({ key: 'rank', direction: 'asc' }); // タイプ切り替え時はソートリセット
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="tab-bar">
          {LEAGUES.map(l => (
            <button
              key={l.key}
              className={`tab-btn ${league === l.key ? 'active' : ''}`}
              onClick={() => setLeague(l.key)}
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

        <label className="filter-control">
          <input 
            type="checkbox" 
            checked={showFavoritesOnly}
            onChange={(e) => setShowFavoritesOnly(e.target.checked)}
          />
          お気に入りチームのみ
        </label>
      </div>

      {loading && <div className="status-msg">読み込み中...</div>}
      {error && (
        <div className="error-msg">
          <strong>取得エラー:</strong> {error}
          {errorDetail && (
            <div style={{ marginTop: '4px', fontSize: '11px', opacity: 0.8, fontStyle: 'italic' }}>
              {errorDetail}
            </div>
          )}
          <div style={{ marginTop: '8px', fontSize: '11px' }}>
            バックエンドサーバーが起動しているか確認してください。
          </div>
        </div>
      )}
      {!loading && !error && cache[cacheKey] && (
        <>
          <StatsTable 
            players={sortedPlayers} 
            type={type} 
            sortConfig={sortConfig}
            onSort={handleSort}
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
