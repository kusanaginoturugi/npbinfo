import { useState, useEffect } from 'react';

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
  { key: 'holds', label: 'H' },
  { key: 'ip', label: '投球回' },
  { key: 'so', label: '奪三振' },
  { key: 'whip', label: 'WHIP' },
];

function StatsTable({ players, type }) {
  const cols = type === 'batting' ? BATTING_COLS : PITCHING_COLS;
  if (!players?.length) return <div className="status-msg">データがありません</div>;

  return (
    <div className="table-wrapper">
      <table className="stats-table">
        <thead>
          <tr>
            {cols.map(c => (
              <th key={c.key} style={c.align === 'left' ? { textAlign: 'left' } : {}}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {players.slice(0, 30).map((p, i) => (
            <tr key={i} className={i % 2 === 0 ? 'row-even' : 'row-odd'}>
              {cols.map(c => (
                <td
                  key={c.key}
                  style={c.align === 'left' ? { textAlign: 'left' } : {}}
                  className={c.key === 'name' ? 'player-name' : ''}
                >
                  {p[c.key] ?? '-'}
                </td>
              ))}
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

  const cacheKey = `${type}-${league}-${year}`;

  useEffect(() => {
    if (cache[cacheKey]) return;
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
        setCache(prev => ({ ...prev, [cacheKey]: json.players ?? [] }));
      })
      .catch(e => {
        setError(e.message);
      })
      .finally(() => setLoading(false));
  }, [cacheKey, cache, type, league, year]);

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 12 }, (_, i) => currentYear - i);

  return (
    <section className="section">
      <h2 className="section-title">選手成績</h2>
      <div className="controls-row">
        <div className="tab-bar">
          {TYPES.map(t => (
            <button
              key={t.key}
              className={`tab-btn ${type === t.key ? 'active' : ''}`}
              onClick={() => setType(t.key)}
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
          style={{
            padding: '6px 12px',
            borderRadius: '6px',
            border: '1.5px solid #ccc',
            background: '#fff',
            color: '#555',
            fontFamily: 'inherit',
            fontSize: '13px',
            cursor: 'pointer',
          }}
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
        <StatsTable players={cache[cacheKey]} type={type} />
      )}
    </section>
  );
}
