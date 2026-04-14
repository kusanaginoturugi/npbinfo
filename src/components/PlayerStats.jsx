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
  { key: 'ops', label: 'OPS' },
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
  const [cache, setCache] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const cacheKey = `${type}-${league}`;

  useEffect(() => {
    if (cache[cacheKey]) return;
    setLoading(true);
    setError(null);
    fetch(`/api/stats/${type}/${league}`)
      .then(r => r.json())
      .then(json => {
        if (json.error) throw new Error(json.error);
        setCache(prev => ({ ...prev, [cacheKey]: json.players ?? [] }));
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [cacheKey, cache]);

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
      </div>

      {loading && <div className="status-msg">読み込み中...</div>}
      {error && (
        <div className="error-msg">
          <strong>取得エラー:</strong> {error}
          <br />
          <small>バックエンドサーバーが起動しているか確認してください。</small>
        </div>
      )}
      {!loading && !error && cache[cacheKey] && (
        <StatsTable players={cache[cacheKey]} type={type} />
      )}
    </section>
  );
}
