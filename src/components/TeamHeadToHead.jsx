import { useEffect, useState } from 'react';
import { getTeamInfo, getTeamLeague } from '../data/teams';

function parseRecord(value) {
  const match = /^(\d+)-(\d+)(?:\((\d+)\))?$/.exec(value ?? '');
  if (!match) return null;
  return {
    win: Number(match[1]),
    lose: Number(match[2]),
    draw: match[3] ? Number(match[3]) : 0,
  };
}

function formatPct(win, lose) {
  if (win + lose === 0) return '-';
  return (win / (win + lose)).toFixed(3).replace(/^0/, '');
}

function RecordTable({ title, records }) {
  const rows = Object.entries(records ?? {});
  if (!rows.length) return null;

  return (
    <div className="h2h-table">
      <h4 className="h2h-table-title">{title}</h4>
      <div className="table-wrapper">
        <table className="standings-table">
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>対戦相手</th>
              <th>勝</th>
              <th>敗</th>
              <th>分</th>
              <th>勝率</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([opponent, value], i) => {
              const record = parseRecord(value);
              const color = getTeamInfo(opponent)?.colors?.[0] ?? '#555';
              return (
                <tr key={opponent} className={i % 2 === 0 ? 'row-even' : 'row-odd'}>
                  <td className="team-cell">
                    <span className="team-color-dot" style={{ background: color }} />
                    {opponent}
                  </td>
                  {record ? (
                    <>
                      <td>{record.win}</td>
                      <td>{record.lose}</td>
                      <td>{record.draw}</td>
                      <td>{formatPct(record.win, record.lose)}</td>
                    </>
                  ) : (
                    <td colSpan={4}>{value}</td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function TeamHeadToHead({ teamName, year }) {
  const [state, setState] = useState({ loading: true, error: null, data: null });

  useEffect(() => {
    let cancelled = false;
    const league = getTeamLeague(teamName);
    fetch(`/api/headtohead/${league}?year=${year}`)
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then(json => {
        if (cancelled) return;
        if (json.error) {
          setState({ loading: false, error: json.error, data: null });
        } else {
          setState({ loading: false, error: null, data: json });
        }
      })
      .catch(err => {
        if (!cancelled) setState({ loading: false, error: err.message, data: null });
      });
    return () => {
      cancelled = true;
    };
  }, [teamName, year]);

  const team = state.data?.teams?.find(item => item.name === teamName);

  return (
    <div className="team-h2h">
      <h3 className="team-page-block-title">対戦相手別 対戦成績（{year}年）</h3>
      {state.loading && <div className="status-msg">読み込み中...</div>}
      {state.error && (
        <div className="error-msg">
          <strong>取得エラー:</strong> {state.error}
        </div>
      )}
      {!state.loading && !state.error && !team && (
        <div className="status-msg">対戦成績データがありません</div>
      )}
      {team && (
        <div className="h2h-tables">
          <RecordTable title="リーグ戦" records={team.vs} />
          <RecordTable title="交流戦" records={team.interleague} />
        </div>
      )}
    </div>
  );
}
