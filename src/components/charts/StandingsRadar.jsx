import { getTeamInfo } from '../../data/teams';

const METRICS = [
  { key: 'pct', label: '勝率', getValue: (team) => team.pct },
  { key: 'ops', label: 'OPS', getValue: (team) => team.ops },
  { key: 'hrAdjusted', label: '本塁打(補正)', getValue: (team) => team.hrAdjusted },
  { key: 'sb', label: '盗塁', getValue: (team) => team.sb },
  { key: 'era', label: '防御率(反転)', getValue: (team) => team.era, lowerBetter: true },
  { key: 'derApprox', label: 'DER近似', getValue: (team) => team.derApprox },
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

function buildMetricRanges(values) {
  return Object.fromEntries(METRICS.map((metric) => {
    const metricValues = values.map(metric.getValue);
    return [metric.key, {
      min: Math.min(...metricValues),
      max: Math.max(...metricValues),
    }];
  }));
}

function scaleRelative(value, range, lowerBetter = false) {
  const distance = range.max - range.min;
  if (!Number.isFinite(value) || !Number.isFinite(distance) || distance === 0) return 100;
  const score = lowerBetter
    ? ((range.max - value) / distance) * 100
    : ((value - range.min) / distance) * 100;
  return clampPercent(score);
}

function buildSeries(teams) {
  const values = teams
    .map((team) => ({
      name: team.name,
      pct: parseNumber(team.pct),
      ops: parseNumber(team.ops),
      hrAdjusted: parseNumber(team.hrAdjusted),
      sb: parseNumber(team.sb),
      era: parseNumber(team.era),
      derApprox: parseNumber(team.derApprox),
    }))
    .filter(team => METRICS.every(metric => metric.getValue(team) !== null));

  if (!values.length) return [];

  const ranges = buildMetricRanges(values);

  return values.map((team) => {
    const info = getTeamInfo(team.name);
    return {
      key: team.name,
      color: info?.colors?.[0] ?? '#64748b',
      code: info?.code ?? team.name,
      scores: METRICS.map((metric) => (
        scaleRelative(metric.getValue(team), ranges[metric.key], metric.lowerBetter)
      )),
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
      <p className="chart-note">各指標はリーグ内の最小値を0、最大値を100にした相対スケールで表示。防御率は少ないほど高評価。DER近似は本塁打以外のインプレー被安打率から算出。</p>
    </div>
  );
}
