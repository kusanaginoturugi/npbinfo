import { useState, useEffect } from 'react';

const LEAGUES = [
  { key: 'cl', label: 'セントラル・リーグ', color: '#003087' },
  { key: 'pl', label: 'パシフィック・リーグ', color: '#c8102e' },
  { key: 'cp', label: 'セ・パ交流戦', color: '#2d6a2d' },
];

const TEAM_COLORS = {
  '巨人': '#f0821e', '阪神': '#ffe100', '広島': '#e50012', '中日': '#003087',
  'ヤクルト': '#00a650', '横浜DeNA': '#003087', 'DeNA': '#003087',
  'ソフトバンク': '#ffb81c', '日本ハム': '#003087', '楽天': '#be0a21',
  'ロッテ': '#000000', 'オリックス': '#003087', '西武': '#003087',
};

function TeamBadge({ name }) {
  const color = TEAM_COLORS[name] ?? '#555';
  const short = name.slice(-2);
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 28, height: 28, borderRadius: '50%', background: color,
        color: '#fff', fontSize: 10, fontWeight: 700, marginRight: 8,
        flexShrink: 0,
      }}
    >
      {short}
    </span>
  );
}

function StandingsTable({ data }) {
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
          {data.map((row, i) => (
            <tr key={i} className={i % 2 === 0 ? 'row-even' : 'row-odd'}>
              <td className="rank">{row.rank ?? i + 1}</td>
              <td className="team-cell">
                <TeamBadge name={row.team ?? row.teamName ?? ''} />
                {row.team ?? row.teamName ?? '-'}
              </td>
              <td>{row.games ?? row.game ?? '-'}</td>
              <td>{row.win ?? '-'}</td>
              <td>{row.lose ?? '-'}</td>
              <td>{row.draw ?? '-'}</td>
              <td>{row.pct ?? row.winningPercentage ?? '-'}</td>
              <td>{row.gb ?? row.gameBehind ?? '-'}</td>
              <td>{row.avg ?? row.battingAverage ?? '-'}</td>
              <td>{row.era ?? row.earnedRunAverage ?? '-'}</td>
              <td>{row.hr ?? row.homerun ?? '-'}</td>
              <td>{row.sb ?? row.stolenBase ?? '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Standings() {
  const [activeLeague, setActiveLeague] = useState('cl');
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (data[activeLeague]) return;
    setLoading(true);
    setError(null);
    fetch(`/api/standings/${activeLeague}`)
      .then(r => r.json())
      .then(json => {
        if (json.error) throw new Error(json.error);
        setData(prev => ({ ...prev, [activeLeague]: json }));
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [activeLeague, data]);

  const activeInfo = LEAGUES.find(l => l.key === activeLeague);

  return (
    <section className="section">
      <h2 className="section-title">順位表</h2>
      <div className="tab-bar">
        {LEAGUES.map(l => (
          <button
            key={l.key}
            className={`tab-btn ${activeLeague === l.key ? 'active' : ''}`}
            style={activeLeague === l.key ? { borderColor: l.color, color: l.color } : {}}
            onClick={() => setActiveLeague(l.key)}
          >
            {l.label}
          </button>
        ))}
      </div>

      {loading && <div className="status-msg">読み込み中...</div>}
      {error && (
        <div className="error-msg">
          <strong>取得エラー:</strong> {error}
          <br />
          <small>バックエンドサーバー (localhost:3001) が起動しているか確認してください。</small>
        </div>
      )}
      {!loading && !error && data[activeLeague] && (
        <StandingsTable data={Array.isArray(data[activeLeague]) ? data[activeLeague] : data[activeLeague].teams ?? []} />
      )}
    </section>
  );
}
