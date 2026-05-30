import { useEffect, useMemo, useState } from 'react';
import { apiCache } from '../utils/apiCache';
import { getContrastColor, getTeamInfo, getTeamLeague, normalizeTeamName } from '../data/teams';
import { STADIUMS } from '../data/stadiums';
import { formatTemperature, getWeatherIcon } from '../utils/weatherIcon';

const CURRENT_DATE = new Date();
const CURRENT_MONTH = `${CURRENT_DATE.getFullYear()}-${String(CURRENT_DATE.getMonth() + 1).padStart(2, '0')}`;

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
    return 5 * 60 * 1000;
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

function RecentBadges({ games }) {
  if (!games || games.length === 0) return null;

  return (
    <div className="schedule-recent-badges">
      {games.map((g, idx) => {
        let symbol = '△';
        let className = 'draw';
        if (g.won === true) {
          symbol = '●';
          className = 'win';
        } else if (g.won === false) {
          symbol = '○';
          className = 'lose';
        }
        const title = `${g.date} vs${g.vsTeam} (${g.won === true ? '勝' : g.won === false ? '敗' : '分'})`;
        return (
          <span key={idx} className={`recent-badge ${className}`} title={title}>
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

function TeamName({ name }) {
  const info = getTeamInfo(name);
  return <span>{info?.official ?? name ?? '-'}</span>;
}

function ScoreBlock({ game }) {
  if (game.homeScore === null || game.awayScore === null) {
    return <div className="schedule-time">{game.startTime || '-'}</div>;
  }

  return (
    <div className="schedule-score">
      <span>{game.homeScore}</span>
      <span className="schedule-score-separator">-</span>
      <span>{game.awayScore}</span>
    </div>
  );
}

function ScheduleWeather({ weatherState }) {
  if (!weatherState) return null;
  if (weatherState.loading) {
    return <span className="schedule-weather">天気...</span>;
  }
  if (!weatherState.data) return null;

  const weather = getWeatherIcon(weatherState.data.weatherCode);
  return (
    <span className="schedule-weather" title={weather.label}>
      <span aria-hidden="true">{weather.icon}</span>
      <span>{formatTemperature(weatherState.data.tempMax)}</span>
      <span>/</span>
      <span>{formatTemperature(weatherState.data.tempMin)}</span>
    </span>
  );
}

function HeadToHeadBadge({ record }) {
  if (!record) return null;
  return <span className="schedule-headtohead">今季 {record}</span>;
}

function ScheduleCard({ game, weatherState, headToHeadRecord, homeRecent, awayRecent }) {
  return (
    <article className="schedule-card">
      <div className="schedule-match">
        <div className="schedule-team">
          <TeamBadge name={game.homeTeam} />
          <div className="schedule-team-info">
            <TeamName name={game.homeTeam} />
            <RecentBadges games={homeRecent} />
          </div>
        </div>

        <ScoreBlock game={game} />

        <div className="schedule-team schedule-team-away">
          <div className="schedule-team-info schedule-team-info-away">
            <TeamName name={game.awayTeam} />
            <RecentBadges games={awayRecent} />
          </div>
          <TeamBadge name={game.awayTeam} />
        </div>
      </div>

      <div className="schedule-meta">
        <span className={`schedule-status status-${game.status}`}>{game.status}</span>
        <span>{game.stadium || '-'}</span>
        <HeadToHeadBadge record={headToHeadRecord} />
        <ScheduleWeather weatherState={weatherState} />
        {game.scoreUrl && (
          <a href={game.scoreUrl} target="_blank" rel="noreferrer">
            NPB
          </a>
        )}
      </div>
      {game.comment && <div className="schedule-comment">{game.comment}</div>}
    </article>
  );
}

export default function Schedule() {
  const [month, setMonth] = useState(CURRENT_MONTH);
  const [selectedDate, setSelectedDate] = useState(formatDateValue(CURRENT_DATE));
  const [cache, setCache] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [errorDetail, setErrorDetail] = useState(null);
  const [lastUpdated, setLastUpdated] = useState({});
  const [weatherCache, setWeatherCache] = useState({});
  const [headToHeadCache, setHeadToHeadCache] = useState({});
  const [recentCache, setRecentCache] = useState({});

  const cacheKey = `schedule:${month}`;
  const schedule = cache[cacheKey];
  const games = schedule?.games ?? [];

  useEffect(() => {
    if (cache[cacheKey]) return;

    const cached = apiCache.get(cacheKey);
    if (cached) {
      setCache(prev => ({ ...prev, [cacheKey]: cached.data }));
      setLastUpdated(prev => ({ ...prev, [cacheKey]: cached.timestamp }));
      return;
    }

    setLoading(true);
    setError(null);
    setErrorDetail(null);
    fetch(`/api/schedule/${month}`)
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
        apiCache.set(cacheKey, json, Number(month.slice(0, 4)), getScheduleTtl(month));
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [cache, cacheKey, month]);

  const availableDates = useMemo(() => {
    return [...new Set(games.map(game => game.date))].sort();
  }, [games]);

  useEffect(() => {
    if (!availableDates.length) return;

    const today = formatDateValue(CURRENT_DATE);
    if (month === CURRENT_MONTH && availableDates.includes(today)) {
      setSelectedDate(today);
      return;
    }
    if (!availableDates.includes(selectedDate)) {
      setSelectedDate(availableDates[0]);
    }
  }, [availableDates, month, selectedDate]);

  const selectedGames = useMemo(
    () => games.filter(game => game.date === selectedDate),
    [games, selectedDate],
  );

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
      fetch(`/api/headtohead/${league}?year=${year}`)
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
  }, [headToHeadCache, headToHeadLeagues, month]);

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
      fetch(`/api/recent/${league}?year=${year}`)
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
  }, [recentCache, headToHeadLeagues, month]);

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
      fetch(`/api/weather?lat=${target.stadium.lat}&lng=${target.stadium.lng}&date=${target.date}`)
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
  }, [weatherCache, weatherTargets]);

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
          onChange={(e) => setMonth(e.target.value)}
          className="year-select"
        />
        <select
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="year-select"
          disabled={!availableDates.length}
        >
          {availableDates.map(date => (
            <option key={date} value={date}>{formatDateLabel(date)}</option>
          ))}
        </select>
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
            <div className="schedule-list">
              {selectedGames.map((game, index) => (
                <ScheduleCard
                  key={`${game.date}-${index}`}
                  game={game}
                  weatherState={weatherCache[getWeatherCacheKey(findStadiumByGameName(game.stadium), game.date)]}
                  headToHeadRecord={getHeadToHeadRecord(game, headToHeadCache, Number(month.slice(0, 4)))}
                  homeRecent={getRecentGames(game.homeTeam, recentCache, Number(month.slice(0, 4)))}
                  awayRecent={getRecentGames(game.awayTeam, recentCache, Number(month.slice(0, 4)))}
                />
              ))}
            </div>
          ) : (
            <div className="status-msg">この日の試合はありません</div>
          )}

          {lastUpdated[cacheKey] && (
            <div style={{ marginTop: '12px', fontSize: '11px', color: 'var(--color-footer)', textAlign: 'right' }}>
              取得日時: {formatTimestamp(lastUpdated[cacheKey])}
            </div>
          )}
        </>
      )}
    </section>
  );
}
