import { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { getTeamInfo } from '../../data/teams';

const METRICS = [
  { key: 'avg', label: '打率', parse: (v) => Number.parseFloat(v), higherBetter: true, format: (v) => Number(v).toFixed(3) },
  { key: 'hr', label: '本塁打', parse: (v) => Number.parseInt(v, 10), higherBetter: true, format: (v) => String(v) },
  { key: 'sb', label: '盗塁', parse: (v) => Number.parseInt(v, 10), higherBetter: true, format: (v) => String(v) },
  { key: 'era', label: '防御率', parse: (v) => Number.parseFloat(v), higherBetter: false, format: (v) => Number(v).toFixed(2) },
];

function buildRows(teams, metric) {
  return teams
    .map((team) => {
      const value = metric.parse(String(team[metric.key] ?? '').replace('%', ''));
      if (!Number.isFinite(value)) return null;
      const info = getTeamInfo(team.name);
      return {
        name: team.name,
        code: info?.code ?? team.name,
        color: info?.colors?.[0] ?? '#64748b',
        value,
      };
    })
    .filter(Boolean)
    .sort((a, b) => metric.higherBetter ? b.value - a.value : a.value - b.value);
}

export default function StandingsBars({ teams }) {
  const [metricKey, setMetricKey] = useState('avg');
  const metric = METRICS.find(item => item.key === metricKey) ?? METRICS[0];
  const rows = useMemo(() => buildRows(teams, metric), [teams, metric]);

  if (!rows.length) {
    return <div className="status-msg">比較グラフ用データが不足しています</div>;
  }

  return (
    <div className="chart-card">
      <div className="chart-header">
        <h3>チーム比較</h3>
        <div className="chart-switches">
          {METRICS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`tab-btn ${metricKey === item.key ? 'active' : ''}`}
              onClick={() => setMetricKey(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div className="chart-shell">
        <ResponsiveContainer width="100%" height={380}>
          <BarChart data={rows} layout="vertical" margin={{ top: 8, right: 16, bottom: 8, left: 16 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" />
            <YAxis type="category" dataKey="code" width={42} />
            <Tooltip formatter={(value) => metric.format(value)} />
            <Bar dataKey="value" radius={[0, 6, 6, 0]}>
              {rows.map((row) => (
                <Cell key={row.name} fill={row.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="chart-note">{metric.label} {metric.higherBetter ? '高い順' : '低い順'}に表示。</p>
    </div>
  );
}
