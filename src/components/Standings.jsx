import { useState, useEffect } from 'react';

const LEAGUES = [
  { key: 'cl', label: 'セントラル・リーグ', color: '#003087' },
  { key: 'pl', label: 'パシフィック・リーグ', color: '#c8102e' },
  { key: 'cp', label: 'セ・パ交流戦', color: '#2d6a2d' },
];

const TEAM_INFO = {
  // セ・リーグ
  'ヤクルト':     { code: 'S',  color: '#073180' },  // 東京ヤクルトスワローズ
  '阪神':         { code: 'T',  color: '#000000' },  // 阪神タイガース
  '巨人':         { code: 'G',  color: '#f97709' },  // 読売ジャイアンツ
  'DeNA':         { code: 'DB', color: '#00345d' },  // 横浜DeNAベイスターズ
  '横浜DeNA':     { code: 'DB', color: '#00345d' },
  '広島':         { code: 'C',  color: '#e50012' },  // 広島東洋カープ
  '中日':         { code: 'D',  color: '#002856' },  // 中日ドラゴンズ
  // パ・リーグ
  'ソフトバンク': { code: 'H',  color: '#1a1a1a' },  // 福岡ソフトバンクホークス
  '日本ハム':     { code: 'F',  color: '#003087' },  // 北海道日本ハムファイターズ
  '楽天':         { code: 'E',  color: '#870116' },  // 東北楽天ゴールデンイーグルス
  'ロッテ':       { code: 'M',  color: '#231f20' },  // 千葉ロッテマリーンズ
  'オリックス':   { code: 'B',  color: '#8f1417' },  // オリックス・バファローズ
  '西武':         { code: 'L',  color: '#1b4497' },  // 埼玉西武ライオンズ
};

function TeamBadge({ name }) {
  const info = TEAM_INFO[name];
  const color = info?.color ?? '#555';
  const code = info?.code ?? (name || '?').slice(0, 2);
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 28, height: 28, borderRadius: '50%', background: color,
        color: '#fff', fontSize: 11, fontWeight: 700, marginRight: 8,
        flexShrink: 0, letterSpacing: '-0.5px',
      }}
    >
      {code}
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
                <TeamBadge name={row.name ?? ''} />
                {row.name ?? '-'}
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
          <small>しばらく待ってから再読み込みしてみてください。</small>
        </div>
      )}
      {!loading && !error && data[activeLeague] && (
        <StandingsTable data={Array.isArray(data[activeLeague]) ? data[activeLeague] : data[activeLeague].teams ?? []} />
      )}
    </section>
  );
}
