import { useEffect, useMemo, useState } from 'react';
import { apiCache } from '../utils/apiCache';
import { isDebugMode, withNoCache } from '../utils/debug';
import { getContrastColor, getTeamInfo, getTeamLeague, normalizeTeamName } from '../data/teams';
import { STADIUMS } from '../data/stadiums';
import { formatPrecipitation, formatTemperature, getWeatherIcon } from '../utils/weatherIcon';
import AiComment from './AiComment';

const CURRENT_DATE = new Date();
const CURRENT_MONTH = `${CURRENT_DATE.getFullYear()}-${String(CURRENT_DATE.getMonth() + 1).padStart(2, '0')}`;

// 表示順: セ → パ → 交流戦（両チームのリーグが違うカード）
const LEAGUE_SECTIONS = [
  { key: 'cl', label: 'セ・リーグ' },
  { key: 'pl', label: 'パ・リーグ' },
  { key: 'inter', label: '交流戦' },
];

function formatDateValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateLabel(dateValue) {
  const date = new Date(`${dateValue}T00:00:00`);
  return date.toLocaleDateString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  });
}

function getScheduleTtl(monthValue) {
  const [year, month] = monthValue.split('-').map(Number);
  const currentYear = CURRENT_DATE.getFullYear();
  const currentMonth = CURRENT_DATE.getMonth() + 1;

  if (year < currentYear || (year === currentYear && month < currentMonth)) {
    return 7 * 24 * 60 * 60 * 1000;
  }
  if (year === currentYear && month === currentMonth) {
    return 60 * 1000;
  }
  return 24 * 60 * 60 * 1000;
}

function normalizeStadiumName(name) {
  return String(name ?? '')
    .replace(/\s+/g, '')
    .replace(/・/g, '')
    .toLowerCase();
}

function findStadiumByGameName(name) {
  const normalized = normalizeStadiumName(name);
  if (!normalized) return null;

  return STADIUMS.find((stadium) => {
    const names = [stadium.name, stadium.officialName].map(normalizeStadiumName);
    return names.some(stadiumName => (
      stadiumName === normalized
        || stadiumName.includes(normalized)
        || normalized.includes(stadiumName)
    ));
  }) ?? null;
}

function getWeatherCacheKey(stadium, date) {
  if (!stadium || !date) return null;
  return `${stadium.lat},${stadium.lng}:${date}`;
}

function normalizeHeadToHeadTeamName(name) {
  const normalized = normalizeTeamName(name);
  return normalized === '横浜DeNA' ? 'DeNA' : normalized;
}

function getHeadToHeadRecord(game, headToHeadCache, year) {
  const homeTeam = normalizeHeadToHeadTeamName(game.homeTeam);
  const awayTeam = normalizeHeadToHeadTeamName(game.awayTeam);
  const homeLeague = getTeamLeague(homeTeam);
  const awayLeague = getTeamLeague(awayTeam);
  if (!homeTeam || !awayTeam || !homeLeague || !awayLeague) return null;

  const cacheKey = `headtohead:${homeLeague}:${year}`;
  const data = headToHeadCache[cacheKey];
  const team = data?.teams?.find(item => item.name === homeTeam);
  const record = homeLeague === awayLeague
    ? team?.vs?.[awayTeam]
    : team?.interleague?.[awayTeam];

  if (!record || record === '--' || record === '***') return null;
  return record;
}

function getRecentGames(teamName, recentCache, year) {
  const normalized = normalizeHeadToHeadTeamName(teamName);
  const league = getTeamLeague(normalized);
  if (!normalized || !league) return null;

  const cacheKey = `recent:${league}:${year}`;
  const data = recentCache[cacheKey];
  return data?.teams?.[normalized] ?? null;
}

// 「先発：○○」「勝：○○」「敗：○○」をラベルと名前に分けて表示する
function PitcherNote({ value }) {
  const match = String(value ?? '').match(/^(先発|勝|敗|分|Ｓ)[：:]\s*(.+)$/);
  if (!match) return null;
  const label = match[1] === '先発' ? '予告先発' : match[1];
  return (
    <span className={`schedule-pitcher pitcher-${match[1] === '先発' ? 'starter' : 'result'}`}>
      <span className="schedule-pitcher-label">{label}</span>
      {match[2]}
    </span>
  );
}

function RecentBadges({ games }) {
  if (!games || games.length === 0) return null;

  const orderedGames = [...games].sort((a, b) => String(a.date).localeCompare(String(b.date)));

  return (
    <div className="schedule-recent-badges">
      {orderedGames.map((g, idx) => {
        let symbol = '△';
        let className = 'draw';
        if (g.won === true) {
          symbol = '○';
          className = 'win';
        } else if (g.won === false) {
          symbol = '●';
          className = 'lose';
        }
        const title = `${g.date} vs${g.vsTeam} (${g.won === true ? '勝' : g.won === false ? '敗' : '分'})`;
        return (
          <span key={`${g.date}-${g.vsTeam}-${idx}`} className={`recent-badge ${className}`} title={title}>
            {symbol}
          </span>
        );
      })}
    </div>
  );
}

function TeamBadge({ name }) {
  const info = getTeamInfo(name);
  const bg = info?.colors?.[0] ?? '#555';
  const code = info?.code ?? (name || '?').slice(0, 2);

  return (
    <span
      className="schedule-team-badge"
      style={{
        background: bg,
        color: getContrastColor(bg),
      }}
    >
      {code}
    </span>
  );
}

function TeamName({ name, outcome }) {
  const info = getTeamInfo(name);
  return (
    <span className="schedule-team-name">
      <span>{info?.official ?? name ?? '-'}</span>
      {outcome && <span className={`schedule-outcome outcome-${outcome}`}>{outcome}</span>}
    </span>
  );
}

function getGameResult(game) {
  if (game.homeScore === null || game.awayScore === null) return null;

  const homeScore = Number.parseInt(game.homeScore, 10);
  const awayScore = Number.parseInt(game.awayScore, 10);
  if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) return null;
  if (homeScore === awayScore) return { home: '分', away: '分' };
  return homeScore > awayScore
    ? { home: '勝', away: '敗' }
    : { home: '敗', away: '勝' };
}

function ScoreBlock({ game }) {
  if (game.homeScore === null || game.awayScore === null) {
    return <div className="schedule-time">{game.startTime || '-'}</div>;
  }

  return (
    <div className="schedule-result">
      <div className="schedule-score">
        <span>{game.homeScore}</span>
        <span className="schedule-score-separator">-</span>
        <span>{game.awayScore}</span>
      </div>
      <span className="schedule-result-status">試合終了</span>
    </div>
  );
}

function ScheduleWeather({ weatherState, stadium, onSelectStadium }) {
  const openStadium = () => {
    if (stadium) onSelectStadium?.(stadium.id);
  };
  const commonProps = stadium
    ? { type: 'button', onClick: openStadium }
    : {};
  const Tag = stadium ? 'button' : 'span';

  if (!weatherState) return null;
  if (weatherState.loading) {
    return (
      <Tag className="schedule-weather" title="球場の天気予報を取得中。球場情報を開く" {...commonProps}>
        <span className="schedule-weather-label">天気</span>
        <span className="schedule-weather-main" aria-label="取得中">
          <span aria-hidden="true">☁️</span>
        </span>
      </Tag>
    );
  }
  if (!weatherState.data) return null;

  const weather = getWeatherIcon(weatherState.data.weatherCode);
  return (
    <Tag
      className="schedule-weather"
      title={`${weather.label} / 最高 ${formatTemperature(weatherState.data.tempMax)} / 最低 ${formatTemperature(weatherState.data.tempMin)} / ${formatPrecipitation(weatherState.data.precipitationProb)}。球場情報を開く`}
      {...commonProps}
    >
      <span className="schedule-weather-label">天気</span>
      <span className="schedule-weather-main">
        <span aria-hidden="true">{weather.icon}</span>
        <span>{weather.label}</span>
      </span>
      <span>最高 {formatTemperature(weatherState.data.tempMax)}</span>
      <span>/</span>
      <span>最低 {formatTemperature(weatherState.data.tempMin)}</span>
      {weatherState.data.precipitationProb !== null && weatherState.data.precipitationProb !== undefined && (
        <span>{formatPrecipitation(weatherState.data.precipitationProb)}</span>
      )}
    </Tag>
  );
}

function HeadToHeadBadge({ record }) {
  if (!record) return null;
  return <span className="schedule-headtohead">今季 {record}</span>;
}

function StatusBadge({ status }) {
  if (!status || status === '試合前' || status === '終了') return null;
  return <span className={`schedule-status status-${status}`}>{status}</span>;
}

function StadiumMeta({ game, stadium, onSelectStadium }) {
  if (!stadium) return <span>{game.stadium || '-'}</span>;

  return (
    <button
      type="button"
      className="schedule-stadium-link"
      onClick={() => onSelectStadium?.(stadium.id)}
      title={`${stadium.name}の球場情報を開く`}
    >
      {game.stadium || stadium.name}
    </button>
  );
}

function ScheduleCard({ game, weatherState, headToHeadRecord, homeRecent, awayRecent, stadium, onSelectStadium }) {
  const result = getGameResult(game);

  return (
    <article className="schedule-card">
      <div className="schedule-match">
        <div className={`schedule-team ${result ? `result-${result.home}` : ''}`}>
          <TeamBadge name={game.homeTeam} />
          <div className="schedule-team-info">
            <TeamName name={game.homeTeam} outcome={result?.home} />
            <RecentBadges games={homeRecent} />
            <PitcherNote value={game.homePitcher} />
          </div>
        </div>

        <ScoreBlock game={game} />

        <div className={`schedule-team schedule-team-away ${result ? `result-${result.away}` : ''}`}>
          <div className="schedule-team-info schedule-team-info-away">
            <TeamName name={game.awayTeam} outcome={result?.away} />
            <RecentBadges games={awayRecent} />
            <PitcherNote value={game.awayPitcher} />
          </div>
          <TeamBadge name={game.awayTeam} />
        </div>
      </div>

      <div className="schedule-meta">
        <StatusBadge status={game.status} />
        <StadiumMeta game={game} stadium={stadium} onSelectStadium={onSelectStadium} />
        <HeadToHeadBadge record={headToHeadRecord} />
        <ScheduleWeather weatherState={weatherState} stadium={stadium} onSelectStadium={onSelectStadium} />
        {game.scoreUrl && (
          <a href={game.scoreUrl} target="_blank" rel="noreferrer">
            試合詳細
          </a>
        )}
        {game.statusSourceUrl && (
          <a href={game.statusSourceUrl} target="_blank" rel="noreferrer">
            {game.statusSource || '中止情報'}
          </a>
        )}
      </div>
      {game.comment && <div className="schedule-comment">{game.comment}</div>}
    </article>
  );
}

export default function Schedule({ initialMonth = CURRENT_MONTH, onMonthChange, onSelectStadium }) {
  const [month, setMonth] = useState(initialMonth);
  const [selectedDate, setSelectedDate] = useState(formatDateValue(CURRENT_DATE));
  const [cache, setCache] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [errorDetail, setErrorDetail] = useState(null);
  const [lastUpdated, setLastUpdated] = useState({});
  const [weatherCache, setWeatherCache] = useState({});
  const [headToHeadCache, setHeadToHeadCache] = useState({});
  const [recentCache, setRecentCache] = useState({});
  const debugMode = isDebugMode();

  const cacheKey = `schedule:v3:${month}`;
  const schedule = cache[cacheKey];
  const games = schedule?.games ?? [];

  const handleRefresh = () => {
    apiCache.remove(cacheKey);
    setCache({});
    setRecentCache({});
    setHeadToHeadCache({});
    setWeatherCache({});
    setLastUpdated({});
  };

  useEffect(() => {
    if (cache[cacheKey]) return;

    const cached = debugMode ? null : apiCache.get(cacheKey);
    if (cached) {
      setCache(prev => ({ ...prev, [cacheKey]: cached.data }));
      setLastUpdated(prev => ({ ...prev, [cacheKey]: cached.timestamp }));
      return;
    }

    setLoading(true);
    setError(null);
    setErrorDetail(null);
    fetch(withNoCache(`/api/schedule/${month}`))
      .then(r => r.json())
      .then(json => {
        if (json.error) {
          setError(json.error);
          setErrorDetail(json.detail);
          return;
        }
        const now = Date.now();
        setCache(prev => ({ ...prev, [cacheKey]: json }));
        setLastUpdated(prev => ({ ...prev, [cacheKey]: now }));
        if (!debugMode) {
          apiCache.set(cacheKey, json, Number(month.slice(0, 4)), getScheduleTtl(month));
        }
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [cache, cacheKey, month, debugMode]);

  const availableDates = useMemo(() => {
    return [...new Set(games.map(game => game.date))].sort();
  }, [games]);

  useEffect(() => {
    if (!availableDates.length) return;
    if (availableDates.includes(selectedDate)) return;

    const today = formatDateValue(CURRENT_DATE);
    const nextDate = month === CURRENT_MONTH && availableDates.includes(today)
      ? today
      : availableDates[0];
    setSelectedDate(nextDate);
  }, [availableDates, month, selectedDate]);

  const selectedGames = useMemo(
    () => games.filter(game => game.date === selectedDate),
    [games, selectedDate],
  );

  const gameGroups = useMemo(() => {
    const groups = { cl: [], pl: [], inter: [] };
    selectedGames.forEach((game) => {
      const homeLeague = getTeamLeague(normalizeHeadToHeadTeamName(game.homeTeam));
      const awayLeague = getTeamLeague(normalizeHeadToHeadTeamName(game.awayTeam));
      const key = homeLeague && homeLeague === awayLeague ? homeLeague : 'inter';
      groups[key].push(game);
    });
    return groups;
  }, [selectedGames]);

  const weatherTargets = useMemo(() => {
    const targets = new Map();
    selectedGames.forEach((game) => {
      const stadium = findStadiumByGameName(game.stadium);
      const key = getWeatherCacheKey(stadium, game.date);
      if (!stadium || !key) return;
      targets.set(key, { key, stadium, date: game.date });
    });
    return [...targets.values()];
  }, [selectedGames]);

  const headToHeadLeagues = useMemo(() => {
    return [...new Set(games.flatMap((game) => (
      [getTeamLeague(game.homeTeam), getTeamLeague(game.awayTeam)].filter(Boolean)
    )))].sort();
  }, [games]);

  useEffect(() => {
    if (!headToHeadLeagues.length) return;

    const year = Number(month.slice(0, 4));
    const missing = headToHeadLeagues.filter((league) => {
      const key = `headtohead:${league}:${year}`;
      return !headToHeadCache[key];
    });
    if (!missing.length) return;

    let cancelled = false;
    Promise.all(missing.map(league => (
      fetch(withNoCache(`/api/headtohead/${league}?year=${year}`))
        .then(r => r.json())
        .then(json => ({ league, json }))
        .catch(() => ({ league, json: null }))
    )))
      .then(results => {
        if (cancelled) return;
        setHeadToHeadCache(prev => {
          const next = { ...prev };
          results.forEach(({ league, json }) => {
            if (!json || json.error) return;
            next[`headtohead:${league}:${year}`] = json;
          });
          return next;
        });
      });

    return () => {
      cancelled = true;
    };
  }, [headToHeadCache, headToHeadLeagues, month, debugMode]);

  useEffect(() => {
    if (!headToHeadLeagues.length) return;

    const year = Number(month.slice(0, 4));
    const missing = headToHeadLeagues.filter((league) => {
      const key = `recent:${league}:${year}`;
      return !recentCache[key];
    });
    if (!missing.length) return;

    let cancelled = false;
    Promise.all(missing.map(league => (
      fetch(withNoCache(`/api/recent/${league}?year=${year}`))
        .then(r => r.json())
        .then(json => ({ league, json }))
        .catch(() => ({ league, json: null }))
    )))
      .then(results => {
        if (cancelled) return;
        setRecentCache(prev => {
          const next = { ...prev };
          results.forEach(({ league, json }) => {
            if (!json || json.error) return;
            next[`recent:${league}:${year}`] = json;
          });
          return next;
        });
      });

    return () => {
      cancelled = true;
    };
  }, [recentCache, headToHeadLeagues, month, debugMode]);

  useEffect(() => {
    if (!weatherTargets.length) return;

    const missing = weatherTargets.filter(target => !weatherCache[target.key]);
    if (!missing.length) return;

    setWeatherCache(prev => {
      const next = { ...prev };
      missing.forEach((target) => {
        next[target.key] = { loading: true };
      });
      return next;
    });

    let cancelled = false;
    Promise.all(missing.map(target => (
      fetch(withNoCache(`/api/weather?lat=${target.stadium.lat}&lng=${target.stadium.lng}&date=${target.date}`))
        .then(r => r.json())
        .then(json => ({
          key: target.key,
          data: json.error ? null : json,
        }))
        .catch(() => ({ key: target.key, data: null }))
    )))
      .then(results => {
        if (cancelled) return;
        setWeatherCache(prev => {
          const next = { ...prev };
          results.forEach((result) => {
            next[result.key] = { loading: false, data: result.data };
          });
          return next;
        });
      });

    return () => {
      cancelled = true;
    };
  }, [weatherCache, weatherTargets, debugMode]);

  const formatTimestamp = (ts) => {
    if (!ts) return '';
    return new Date(ts).toLocaleString('ja-JP');
  };

  return (
    <section className="section">
      <h2 className="section-title">試合日程</h2>

      <div className="controls-row">
        <input
          type="month"
          value={month}
          onChange={(e) => {
            setMonth(e.target.value);
            onMonthChange?.(e.target.value);
          }}
          className="control-input"
        />
        <select
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="control-select"
          disabled={!availableDates.length}
        >
          {availableDates.map(date => (
            <option key={date} value={date}>{formatDateLabel(date)}</option>
          ))}
        </select>
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

      {loading && <div className="status-msg">読み込み中...</div>}
      {error && (
        <div className="error-msg">
          <strong>取得エラー:</strong> {error}
          {errorDetail && (
            <div style={{ marginTop: '4px', fontSize: '11px', opacity: 0.8, fontStyle: 'italic' }}>
              {errorDetail}
            </div>
          )}
        </div>
      )}

      {!loading && !error && schedule && (
        <>
          {selectedGames.length > 0 ? (
            LEAGUE_SECTIONS.map(({ key, label }) => {
              const leagueGames = gameGroups[key];
              if (!leagueGames.length) return null;
              const commentKey = key === 'inter' ? selectedDate : `${selectedDate}:${key}`;
              return (
                <div key={key} className="schedule-league-section">
                  <h3 className="team-page-block-title">{label}</h3>
                  <div className="schedule-list">
                    {leagueGames.map((game, index) => {
                      const stadium = findStadiumByGameName(game.stadium);
                      return (
                        <ScheduleCard
                          key={`${game.date}-${key}-${index}`}
                          game={game}
                          stadium={stadium}
                          onSelectStadium={onSelectStadium}
                          weatherState={weatherCache[getWeatherCacheKey(stadium, game.date)]}
                          headToHeadRecord={getHeadToHeadRecord(game, headToHeadCache, Number(month.slice(0, 4)))}
                          homeRecent={getRecentGames(game.homeTeam, recentCache, Number(month.slice(0, 4)))}
                          awayRecent={getRecentGames(game.awayTeam, recentCache, Number(month.slice(0, 4)))}
                        />
                      );
                    })}
                  </div>
                  <AiComment
                    key={commentKey}
                    subjectType="schedule"
                    subjectKey={commentKey}
                    year={Number(selectedDate.slice(0, 4))}
                    title={`今日の見所（${label}）`}
                    titleClassName="team-page-block-title"
                    showPersona
                  />
                </div>
              );
            })
          ) : (
            <div className="status-msg">この日の試合はありません</div>
          )}

          {lastUpdated[cacheKey] && (
            <div className="updated-note">
              取得日時: {formatTimestamp(lastUpdated[cacheKey])}
            </div>
          )}
        </>
      )}
    </section>
  );
}
