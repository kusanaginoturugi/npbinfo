import { Suspense, lazy, useMemo, useState, useEffect } from 'react';
import { getContrastColor, getTeamInfo } from '../data/teams';
import { useFavorites } from '../hooks/useFavorites';
import { apiCache } from '../utils/apiCache';
import { isDebugMode, withNoCache } from '../utils/debug';
import { standingsPath } from '../utils/routes';

const LEAGUES = [
  { key: 'cl', label: 'セントラル・リーグ', color: '#003087' },
  { key: 'pl', label: 'パシフィック・リーグ', color: '#c8102e' },
  { key: 'cp', label: 'セ・パ交流戦', color: '#2d6a2d' },
];
const StandingsRadar = lazy(() => import('./charts/StandingsRadar'));
const StandingsBars = lazy(() => import('./charts/StandingsBars'));

function TeamBadge({ name }) {
  const info = getTeamInfo(name);
  const bg = info?.colors?.[0] ?? '#555';
  const code = info?.code ?? (name || '?').slice(0, 2);
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 28, height: 28, borderRadius: '50%', background: bg,
        color: getContrastColor(bg), fontSize: 11, fontWeight: 700,
        marginRight: 8, flexShrink: 0, letterSpacing: 0,
        border: '1px solid rgba(0,0,0,0.08)',
      }}
    >
      {code}
    </span>
  );
}

function FavoriteButton({ teamName, isFavorite, toggleFavorite }) {
  return (
    <button
      className={`fav-btn ${isFavorite ? 'active' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        toggleFavorite(teamName);
      }}
      title={isFavorite ? 'お気に入りから外す' : 'お気に入りに追加'}
    >
      {isFavorite ? '★' : '☆'}
    </button>
  );
}

function StandingsTable({ data, isFavorite, toggleFavorite, onSelectTeam }) {
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
            <th>OPS</th>
            <th>防御率</th>
            <th>本塁打</th>
            <th>盗塁</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => {
            const teamName = row.name ?? '';
            const teamInfo = getTeamInfo(teamName);
            const displayName = teamInfo?.official ?? teamName;
            const favorited = isFavorite(teamName);
            const rowClass = favorited 
              ? 'row-favorite' 
              : (i % 2 === 0 ? 'row-even' : 'row-odd');

            return (
              <tr key={i} className={rowClass}>
                <td className="rank">{row.rank ?? i + 1}</td>
                <td className="team-cell">
                  <FavoriteButton 
                    teamName={teamName} 
                    isFavorite={favorited} 
                    toggleFavorite={toggleFavorite} 
                  />
                  {teamName === '阪神' ? (
                    <button
                      type="button"
                      className="team-detail-link"
                      onClick={() => onSelectTeam?.(teamName)}
                    >
                      <TeamBadge name={teamName} />
                      <span>{displayName || '-'}</span>
                    </button>
                  ) : (
                    <>
                      <TeamBadge name={teamName} />
                      {displayName || '-'}
                    </>
                  )}
                </td>
                <td>{row.playGameCount ?? '-'}</td>
                <td>{row.win ?? '-'}</td>
                <td>{row.lose ?? '-'}</td>
                <td>{row.draw ?? '-'}</td>
                <td>{row.pct ?? '-'}</td>
                <td>{row.gamesBehind ?? '-'}</td>
                <td>{row.avg ?? '-'}</td>
                <td>{row.ops ?? '-'}</td>
                <td>{row.era ?? '-'}</td>
                <td>
                  {row.hr ?? '-'}
                  {row.hrAdjusted !== undefined && row.hrAdjusted !== '-' && (
                    <span
                      className="park-adjusted-value"
                      title="球場ごとの本塁打傾向で中立球場換算した推定値"
                    >
                      （補正 {Number(row.hrAdjusted).toFixed(1)}）
                    </span>
                  )}
                </td>
                <td>{row.sb ?? '-'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function Standings({
  initialLeague = 'cl',
  initialYear = new Date().getFullYear(),
  onRouteChange,
  onSelectTeam,
  onOpenParkFactorMethod,
}) {
  const [activeLeague, setActiveLeague] = useState(initialLeague);
  const [viewMode, setViewMode] = useState('table');
  const [year, setYear] = useState(initialYear);
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState({});
  const { isFavorite, toggleFavorite } = useFavorites();
  const debugMode = isDebugMode();

  const cacheKey = `standings:v5:${activeLeague}:${year}`;
  const shouldUseLocalCache = !debugMode && activeLeague !== 'cp';

  const handleRefresh = () => {
    apiCache.remove(cacheKey);
    setData(prev => {
      const next = { ...prev };
      delete next[cacheKey];
      return next;
    });
    setLastUpdated(prev => {
      const next = { ...prev };
      delete next[cacheKey];
      return next;
    });
  };

  useEffect(() => {
    if (data[cacheKey]) return;

    // 1. localStorage キャッシュをチェック
    const cached = shouldUseLocalCache ? apiCache.get(cacheKey) : null;
    if (cached) {
      setData(prev => ({ ...prev, [cacheKey]: cached.data }));
      setLastUpdated(prev => ({ ...prev, [cacheKey]: cached.timestamp }));
      return;
    }

    // 2. なければ API を叩く
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ year: String(year) });
    if (debugMode || activeLeague === 'cp') params.set('nocache', '1');
    fetch(withNoCache(`/api/standings/${activeLeague}?${params.toString()}`))
      .then(r => r.json())
      .then(json => {
        if (json.error) throw new Error(json.error);
        const now = Date.now();
        setData(prev => ({ ...prev, [cacheKey]: json }));
        setLastUpdated(prev => ({ ...prev, [cacheKey]: now }));
        if (shouldUseLocalCache) apiCache.set(cacheKey, json, year);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [activeLeague, year, data, cacheKey, shouldUseLocalCache, debugMode]);

  const activeInfo = LEAGUES.find(l => l.key === activeLeague);
  const standingsRows = useMemo(() => {
    if (!data[cacheKey]) return [];
    return Array.isArray(data[cacheKey]) ? data[cacheKey] : data[cacheKey].teams ?? [];
  }, [cacheKey, data]);
  const updateNote = useMemo(() => {
    const entry = data[cacheKey];
    if (!entry || Array.isArray(entry)) return '';
    return entry.updateNote ?? '';
  }, [cacheKey, data]);
  const hrAdjustment = useMemo(() => {
    const entry = data[cacheKey];
    if (!entry || Array.isArray(entry)) return null;
    return entry.hrAdjustment ?? null;
  }, [cacheKey, data]);
  const graphAvailable = activeLeague === 'cl' || activeLeague === 'pl';

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 12 }, (_, i) => currentYear - i);

  const formatTimestamp = (ts) => {
    if (!ts) return '';
    return new Date(ts).toLocaleString('ja-JP');
  };

  const handleShareToX = () => {
    const shareUrl = new URL(standingsPath(activeLeague, year), window.location.origin).toString();
    const lines = [
      `${year}年 ${activeInfo?.label ?? '順位表'} 順位表`,
      updateNote,
    ].filter(Boolean);
    const params = new URLSearchParams({
      text: lines.join('\n'),
      url: shareUrl,
    });
    window.open(
      `https://twitter.com/intent/tweet?${params.toString()}`,
      '_blank',
      'noopener,noreferrer',
    );
  };

  return (
    <section className="section">
      <h2 className="section-title">順位表</h2>
      <div className="controls-row">
        <div className="tab-bar">
          {LEAGUES.map(l => (
            <button
              key={l.key}
              className={`tab-btn ${activeLeague === l.key ? 'active' : ''}`}
              onClick={() => {
                setActiveLeague(l.key);
                onRouteChange?.(l.key, year);
              }}
            >
              {l.label}
            </button>
          ))}
        </div>
        <select
          value={year}
          onChange={(e) => {
            const nextYear = parseInt(e.target.value, 10);
            setYear(nextYear);
            onRouteChange?.(activeLeague, nextYear);
          }}
          className="control-select"
        >
          {years.map(y => (
            <option key={y} value={y}>{y}年</option>
          ))}
        </select>
        <div className="segmented-control standings-mode-switch">
          <button
            type="button"
            className={`segmented-control-btn ${viewMode === 'table' ? 'active' : ''}`}
            onClick={() => setViewMode('table')}
          >
            表
          </button>
          <button
            type="button"
            className={`segmented-control-btn ${viewMode === 'charts' ? 'active' : ''}`}
            onClick={() => setViewMode('charts')}
            disabled={!graphAvailable}
            title={graphAvailable ? 'グラフ表示' : 'グラフはセ/パリーグのみ'}
          >
            グラフ
          </button>
        </div>
        <button
          type="button"
          className="control-button share-x-btn"
          onClick={handleShareToX}
          disabled={!data[cacheKey]}
          title="Xで順位表を共有"
        >
          Xで共有
        </button>
        {debugMode && (
          <button
            type="button"
            className="control-button"
            onClick={handleRefresh}
            disabled={loading}
            title="キャッシュを無視して再取得 (debug)"
          >
            ↻ 更新
          </button>
        )}
      </div>
      {!graphAvailable && viewMode === 'charts' && (
        <div className="status-msg">グラフ表示はセ・パリーグ選択時のみ有効です。</div>
      )}

      {loading && <div className="status-msg">読み込み中...</div>}
      {error && (
        <div className="error-msg">
          <strong>取得エラー:</strong> {error}
          <br />
          <small>しばらく待ってから再読み込みしてみてください。</small>
        </div>
      )}
      {!loading && !error && data[cacheKey] && (
        <>
          {viewMode === 'table' && (
            <StandingsTable
              data={standingsRows}
              isFavorite={isFavorite}
              toggleFavorite={toggleFavorite}
              onSelectTeam={onSelectTeam}
            />
          )}
          {viewMode === 'charts' && graphAvailable && (
            <Suspense fallback={<div className="status-msg">グラフ読み込み中...</div>}>
              <div className="standings-charts">
                <StandingsRadar teams={standingsRows} />
                <StandingsBars teams={standingsRows} />
              </div>
            </Suspense>
          )}
          {hrAdjustment && (
            <p className="standings-method-note">
              本塁打の補正値とグラフは、{hrAdjustment.years[0]}〜
              {hrAdjustment.years.at(-1)}年の球場別本塁打傾向を
              平均へ回帰させ、各試合を中立球場換算した推定値です。
              {hrAdjustment.factorOverrides?.['バンテリンドーム ナゴヤ'] && (
                <> 2026年のバンテリンドームはホームランテラス新設のため補正対象外です。</>
              )}
              {' '}
              DER近似はチーム投手成績から本塁打以外のインプレーをどれだけアウトにしたかを推定した独自指標です。
              {' '}
              <button
                type="button"
                className="methodology-link"
                onClick={onOpenParkFactorMethod}
              >
                計算方法
              </button>
            </p>
          )}
          {lastUpdated[cacheKey] && (
            <div className="updated-note">
              取得日時: {formatTimestamp(lastUpdated[cacheKey])}
              {updateNote ? ` (npb.jp 反映: ${updateNote})` : ''}
            </div>
          )}
        </>
      )}
    </section>
  );
}
