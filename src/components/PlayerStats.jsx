import { useState, useEffect, useMemo } from 'react';
import { TEAMS } from '../data/teams';
import { useFavorites } from '../hooks/useFavorites';
import { apiCache } from '../utils/apiCache';
import { isDebugMode, withNoCache } from '../utils/debug';

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

const TEAM_FILTERS = Object.keys(TEAMS).filter(name => name !== '横浜DeNA');
const TEAM_FILTERS_BY_LEAGUE = (league) =>
  TEAM_FILTERS.filter(name => TEAMS[name]?.league === league);

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

export default function PlayerStats({
  initialLeague = 'cl',
  initialType = 'batting',
  initialYear = new Date().getFullYear(),
  onRouteChange,
}) {
  const [league, setLeague] = useState(initialLeague);
  const [type, setType] = useState(initialType);
  const [year, setYear] = useState(initialYear);
  const [cache, setCache] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [errorDetail, setErrorDetail] = useState(null);
  const [lastUpdated, setLastUpdated] = useState({});
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [playerNameFilter, setPlayerNameFilter] = useState('');
  const [selectedTeams, setSelectedTeams] = useState([]);
  const { isFavorite } = useFavorites();
  const debugMode = isDebugMode();
  
  // ソート設定: 初期状態は順位の昇順
  const [sortConfig, setSortConfig] = useState({ key: 'rank', direction: 'asc' });

  const cacheKey = `stats:${type}-${league}-${year}`;

  const handleRefresh = () => {
    apiCache.remove(cacheKey);
    setCache(prev => {
      const next = { ...prev };
      delete next[cacheKey];
      return next;
    });
    setLastUpdated(prev => {
      const next = { ...prev };
      delete next[cacheKey];
      return next;
    });
  };

  useEffect(() => {
    if (cache[cacheKey]) return;

    // 1. localStorage キャッシュをチェック
    const cached = debugMode ? null : apiCache.get(cacheKey);
    if (cached) {
      setCache(prev => ({ ...prev, [cacheKey]: cached.data }));
      setLastUpdated(prev => ({ ...prev, [cacheKey]: cached.timestamp }));
      return;
    }

    // 2. なければ API を叩く
    setLoading(true);
    setError(null);
    setErrorDetail(null);
    const params = new URLSearchParams({ year: String(year) });
    if (debugMode) params.set('nocache', '1');
    fetch(withNoCache(`/api/stats/${type}/${league}?${params.toString()}`))
      .then(r => r.json())
      .then(json => {
        if (json.error) {
          setError(json.error);
          setErrorDetail(json.detail);
          return;
        }
        const now = Date.now();
        const payload = { ...json, players: json.players ?? [] };
        setCache(prev => ({ ...prev, [cacheKey]: payload }));
        setLastUpdated(prev => ({ ...prev, [cacheKey]: now }));
        if (!debugMode) apiCache.set(cacheKey, payload, year);
      })
      .catch(e => {
        setError(e.message);
      })
      .finally(() => setLoading(false));
  }, [cacheKey, cache, type, league, year, debugMode]);

  const handleSort = (key) => {
    setSortConfig(prev => {
      if (prev.key !== key) {
        return { key, direction: 'asc' };
      }
      if (prev.direction === 'asc') {
        return { key, direction: 'desc' };
      }
      return { key: 'rank', direction: 'asc' };
    });
  };

  const toggleTeamFilter = (team) => {
    setSelectedTeams(prev => (
      prev.includes(team)
        ? prev.filter(t => t !== team)
        : [...prev, team]
    ));
  };

  const sortedPlayers = useMemo(() => {
    const entry = cache[cacheKey];
    let raw = Array.isArray(entry) ? entry : (entry?.players ?? []);

    const trimmedName = playerNameFilter.trim();
    if (trimmedName) {
      raw = raw.filter(p => String(p.name || '').includes(trimmedName));
    }

    if (selectedTeams.length > 0) {
      raw = raw.filter(p => {
        const fullTeamName = TEAM_MAP[p.team] || p.team;
        return selectedTeams.includes(fullTeamName);
      });
    }
    
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
  }, [cache, cacheKey, sortConfig, isFavorite, showFavoritesOnly, playerNameFilter, selectedTeams]);
  const updateNote = useMemo(() => {
    const entry = cache[cacheKey];
    if (!entry || Array.isArray(entry)) return '';
    return entry.updateNote ?? '';
  }, [cache, cacheKey]);

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
                onRouteChange?.(t.key, league, year);
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
              onClick={() => {
                setLeague(l.key);
                setSelectedTeams([]);
                onRouteChange?.(type, l.key, year);
              }}
            >
              {l.label}
            </button>
          ))}
        </div>
        <select
          value={year}
          onChange={(e) => {
            const nextYear = parseInt(e.target.value, 10);
            setYear(nextYear);
            onRouteChange?.(type, league, nextYear);
          }}
          className="control-select"
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
        {debugMode && (
          <button
            type="button"
            className="control-button"
            onClick={handleRefresh}
            disabled={loading}
            title="キャッシュを無視して再取得 (debug)"
          >
            ↻ 更新
          </button>
        )}
      </div>

      <div className="controls-row" style={{ marginTop: '12px', alignItems: 'center' }}>
        <input
          type="search"
          value={playerNameFilter}
          onChange={(e) => setPlayerNameFilter(e.target.value)}
          placeholder="選手名で絞り込み"
          className="control-input"
          style={{ minWidth: '180px' }}
        />
        <div className="tab-bar" style={{ marginBottom: 0 }}>
          {TEAM_FILTERS_BY_LEAGUE(league).map(team => (
            <label key={team} className={`tab-btn ${selectedTeams.includes(team) ? 'active' : ''}`}>
              <input
                type="checkbox"
                checked={selectedTeams.includes(team)}
                onChange={() => toggleTeamFilter(team)}
                style={{ marginRight: '4px' }}
              />
              {team}
            </label>
          ))}
        </div>
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
              {updateNote ? ` (npb.jp 反映: ${updateNote})` : ''}
            </div>
          )}
        </>
      )}
    </section>
  );
}
