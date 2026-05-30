import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { getTeamInfo } from '../../data/teams';

function parseNumber(value) {
  const parsed = Number.parseFloat(String(value ?? '').replace('%', ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function buildSeries(teams) {
  const values = teams
    .map((team) => ({
      name: team.name,
      pct: parseNumber(team.pct),
      avg: parseNumber(team.avg),
      hr: parseNumber(team.hr),
      sb: parseNumber(team.sb),
      era: parseNumber(team.era),
    }))
    .filter(team => team.pct !== null && team.avg !== null && team.hr !== null && team.sb !== null && team.era !== null);

  if (!values.length) return { rows: [], legends: [] };

  const maxHr = Math.max(...values.map(item => item.hr));
  const maxSb = Math.max(...values.map(item => item.sb));
  const maxEra = Math.max(...values.map(item => item.era));
  const minEra = Math.min(...values.map(item => item.era));
  const eraRange = maxEra - minEra || 1;

  const rows = [
    { metric: '勝率' },
    { metric: '打率' },
    { metric: '本塁打' },
    { metric: '盗塁' },
    { metric: '防御率(反転)' },
  ];

  values.forEach((team) => {
    rows[0][team.name] = team.pct * 100;
    rows[1][team.name] = team.avg * 100;
    rows[2][team.name] = (team.hr / (maxHr || 1)) * 100;
    rows[3][team.name] = (team.sb / (maxSb || 1)) * 100;
    rows[4][team.name] = ((maxEra - team.era) / eraRange) * 100;
  });

  return {
    rows,
    legends: values.map((team) => ({
      key: team.name,
      color: getTeamInfo(team.name)?.colors?.[0] ?? '#64748b',
      code: getTeamInfo(team.name)?.code ?? team.name,
    })),
  };
}

export default function StandingsRadar({ teams }) {
  const { rows, legends } = buildSeries(teams);
  if (!rows.length) {
    return <div className="status-msg">グラフ用データが不足しています</div>;
  }

  return (
    <div className="chart-card">
      <h3>チーム成績レーダー</h3>
      <div className="chart-shell">
        <ResponsiveContainer width="100%" height={420}>
          <RadarChart data={rows} outerRadius="72%">
            <PolarGrid />
            <PolarAngleAxis dataKey="metric" />
            <PolarRadiusAxis domain={[0, 100]} tickCount={6} />
            <Tooltip formatter={(value) => Number(value).toFixed(1)} />
            <Legend />
            {legends.map((team) => (
              <Radar
                key={team.key}
                name={team.code}
                dataKey={team.key}
                stroke={team.color}
                fill={team.color}
                fillOpacity={0.08}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <p className="chart-note">防御率は「低いほど良い」ため反転スケールで表示。</p>
    </div>
  );
}
