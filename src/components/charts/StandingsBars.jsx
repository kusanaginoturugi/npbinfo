import { useMemo, useState } from 'react';
import { getTeamInfo, getTeamPipingColors } from '../../data/teams';

const METRICS = [
  { key: 'ops', label: 'OPS', parse: (v) => Number.parseFloat(v), higherBetter: true, format: (v) => Number(v).toFixed(3) },
  { key: 'hrAdjusted', label: '本塁打（補正）', parse: (v) => Number.parseFloat(v), higherBetter: true, format: (v) => Number(v).toFixed(1) },
  { key: 'sb', label: '盗塁', parse: (v) => Number.parseInt(v, 10), higherBetter: true, format: (v) => String(v) },
  { key: 'era', label: '防御率', parse: (v) => Number.parseFloat(v), higherBetter: false, format: (v) => Number(v).toFixed(2) },
  { key: 'derApprox', label: 'DER近似', parse: (v) => Number.parseFloat(v), higherBetter: true, format: (v) => Number(v).toFixed(3) },
  { key: 'fieldingPct', label: '守備率', parse: (v) => Number.parseFloat(v), higherBetter: true, format: (v) => Number(v).toFixed(3) },
];

function buildRows(teams, metric) {
  return teams
    .map((team) => {
      const value = metric.parse(String(team[metric.key] ?? '').replace('%', ''));
      if (!Number.isFinite(value)) return null;
      const info = getTeamInfo(team.name);
      const piping = getTeamPipingColors(team.name);
      return {
        name: team.name,
        code: info?.code ?? team.name,
        color: info?.colors?.[0] ?? '#64748b',
        pipingStyle: {
          '--pipe-light': piping.light ?? 'transparent',
          '--pipe-dark': piping.dark ?? 'transparent',
        },
        value,
      };
    })
    .filter(Boolean)
    .sort((a, b) => metric.higherBetter ? b.value - a.value : a.value - b.value);
}

export default function StandingsBars({ teams }) {
  const [metricKey, setMetricKey] = useState('ops');
  const metric = METRICS.find(item => item.key === metricKey) ?? METRICS[0];
  const rows = useMemo(() => buildRows(teams, metric), [teams, metric]);
  const maxValue = Math.max(...rows.map(row => row.value), 0);

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
      <div className="bar-chart-list" role="img" aria-label={`${metric.label}のチーム比較`}>
        {rows.map((row) => {
          const width = maxValue > 0 ? Math.max(2, (row.value / maxValue) * 100) : 0;
          return (
            <div key={row.name} className="bar-chart-row">
              <div className="bar-chart-team">
                <span className="bar-chart-code">{row.code}</span>
                <span className="bar-chart-name">{row.name}</span>
              </div>
              <div className="bar-chart-track">
                <span
                  className="bar-chart-fill"
                  style={{ width: `${width}%`, background: row.color, ...row.pipingStyle }}
                  title={`${row.name}: ${metric.format(row.value)}`}
                />
              </div>
              <div className="bar-chart-value">{metric.format(row.value)}</div>
            </div>
          );
        })}
      </div>
      <p className="chart-note">{metric.label} {metric.higherBetter ? '高い順' : '低い順'}に表示。</p>
    </div>
  );
}
