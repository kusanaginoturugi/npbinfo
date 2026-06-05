import { getTeamInfo } from '../../data/teams';

const METRICS = [
  { key: 'pct', label: '勝率', scale: (team) => team.pct * 100 },
  { key: 'avg', label: '打率', scale: (team) => team.avg * 100 },
  { key: 'hr', label: '本塁打', scale: (team, context) => (team.hr / (context.maxHr || 1)) * 100 },
  { key: 'sb', label: '盗塁', scale: (team, context) => (team.sb / (context.maxSb || 1)) * 100 },
  { key: 'era', label: '防御率(反転)', scale: (team, context) => ((context.maxEra - team.era) / context.eraRange) * 100 },
];

function parseNumber(value) {
  const parsed = Number.parseFloat(String(value ?? '').replace('%', ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function clampPercent(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function pointOnRadar(cx, cy, radius, index, total) {
  const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
  return {
    x: cx + Math.cos(angle) * radius,
    y: cy + Math.sin(angle) * radius,
  };
}

function pointsToPath(points) {
  return points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
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

  if (!values.length) return [];

  const maxHr = Math.max(...values.map(item => item.hr));
  const maxSb = Math.max(...values.map(item => item.sb));
  const maxEra = Math.max(...values.map(item => item.era));
  const minEra = Math.min(...values.map(item => item.era));
  const context = {
    maxHr,
    maxSb,
    maxEra,
    eraRange: maxEra - minEra || 1,
  };

  return values.map((team) => {
    const info = getTeamInfo(team.name);
    return {
      key: team.name,
      color: info?.colors?.[0] ?? '#64748b',
      code: info?.code ?? team.name,
      scores: METRICS.map((metric) => clampPercent(metric.scale(team, context))),
    };
  });
}

export default function StandingsRadar({ teams }) {
  const series = buildSeries(teams);
  if (!series.length) {
    return <div className="status-msg">グラフ用データが不足しています</div>;
  }

  const width = 520;
  const height = 420;
  const cx = 260;
  const cy = 202;
  const radius = 128;
  const rings = [20, 40, 60, 80, 100];
  const axisPoints = METRICS.map((_, index) => pointOnRadar(cx, cy, radius, index, METRICS.length));

  return (
    <div className="chart-card">
      <h3>チーム成績レーダー</h3>
      <div className="chart-shell radar-chart-shell">
        <svg
          className="radar-chart"
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="チーム成績レーダー"
        >
          <g className="radar-grid">
            {rings.map((ring) => {
              const ringPoints = METRICS.map((_, index) => (
                pointOnRadar(cx, cy, radius * (ring / 100), index, METRICS.length)
              ));
              return <polygon key={ring} points={pointsToPath(ringPoints)} />;
            })}
            {axisPoints.map((point, index) => (
              <line key={METRICS[index].key} x1={cx} y1={cy} x2={point.x} y2={point.y} />
            ))}
          </g>
          <g className="radar-labels">
            {METRICS.map((metric, index) => {
              const point = pointOnRadar(cx, cy, radius + 34, index, METRICS.length);
              return (
                <text key={metric.key} x={point.x} y={point.y} textAnchor="middle" dominantBaseline="middle">
                  {metric.label}
                </text>
              );
            })}
          </g>
          <g>
            {series.map((team) => {
              const points = team.scores.map((score, index) => (
                pointOnRadar(cx, cy, radius * (score / 100), index, METRICS.length)
              ));
              return (
                <polygon
                  key={team.key}
                  className="radar-team-area"
                  points={pointsToPath(points)}
                  style={{ '--team-color': team.color }}
                >
                  <title>{`${team.code}: ${team.scores.map((score, index) => `${METRICS[index].label} ${score.toFixed(1)}`).join(' / ')}`}</title>
                </polygon>
              );
            })}
          </g>
        </svg>
      </div>
      <div className="chart-legend" aria-label="凡例">
        {series.map((team) => (
          <span key={team.key} className="chart-legend-item">
            <span className="chart-legend-swatch" style={{ background: team.color }} />
            {team.code}
          </span>
        ))}
      </div>
      <p className="chart-note">防御率は「低いほど良い」ため反転スケールで表示。</p>
    </div>
  );
}
