import { useEffect, useMemo, useState } from 'react';
import { apiCache } from '../utils/apiCache';
import { getContrastColor, getTeamInfo } from '../data/teams';
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

function ScheduleCard({ game, weatherState }) {
  return (
    <article className="schedule-card">
      <div className="schedule-match">
        <div className="schedule-team">
          <TeamBadge name={game.homeTeam} />
          <TeamName name={game.homeTeam} />
        </div>

        <ScoreBlock game={game} />

        <div className="schedule-team schedule-team-away">
          <TeamBadge name={game.awayTeam} />
          <TeamName name={game.awayTeam} />
        </div>
      </div>

      <div className="schedule-meta">
        <span className={`schedule-status status-${game.status}`}>{game.status}</span>
        <span>{game.stadium || '-'}</span>
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
