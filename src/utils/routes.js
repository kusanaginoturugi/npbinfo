import { STADIUMS } from '../data/stadiums.js';

const LEAGUE_TO_SLUG = {
  cl: 'central',
  pl: 'pacific',
  cp: 'interleague',
};

const SLUG_TO_LEAGUE = Object.fromEntries(
  Object.entries(LEAGUE_TO_SLUG).map(([key, value]) => [value, key]),
);

const STAT_TYPES = new Set(['batting', 'pitching']);
const STADIUM_IDS = new Set(STADIUMS.map(stadium => stadium.id));

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function validYear(value) {
  const year = Number(value);
  const currentYear = new Date().getFullYear();
  return Number.isInteger(year) && year <= currentYear && year >= currentYear - 11
    ? year
    : null;
}

function validMonth(value) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value ?? '')) return null;
  return validYear(value.slice(0, 4)) ? value : null;
}

export function standingsPath(league, year) {
  return `/standings/${LEAGUE_TO_SLUG[league] ?? 'central'}/${year}`;
}

export function statsPath(type, league, year) {
  const safeType = STAT_TYPES.has(type) ? type : 'batting';
  const safeLeague = league === 'pl' ? 'pacific' : 'central';
  return `/stats/${safeType}/${safeLeague}/${year}`;
}

export function schedulePath(month) {
  return `/schedule/${month}`;
}

export function stadiumPath(stadiumId) {
  return `/stadiums/${stadiumId}`;
}

export function teamPath(teamSlug) {
  return `/teams/${teamSlug}`;
}

export function parkFactorMethodPath() {
  return '/methodology/home-run-park-factor';
}

export function defaultRoute(tab = 'standings') {
  const year = new Date().getFullYear();

  if (tab === 'players') {
    return {
      tab,
      type: 'batting',
      league: 'cl',
      year,
      path: statsPath('batting', 'cl', year),
    };
  }
  if (tab === 'schedule') {
    const month = currentMonth();
    return { tab, month, path: schedulePath(month) };
  }
  if (tab === 'stadiums') {
    const stadiumId = STADIUMS[0].id;
    return { tab, stadiumId, path: stadiumPath(stadiumId) };
  }

  return {
    tab: 'standings',
    league: 'cl',
    year,
    path: standingsPath('cl', year),
  };
}

export function parseRoute(pathname) {
  const segments = pathname.split('/').filter(Boolean);

  if (segments[0] === 'standings' && segments.length === 3) {
    const league = SLUG_TO_LEAGUE[segments[1]];
    const year = validYear(segments[2]);
    if (league && year) {
      return {
        tab: 'standings',
        league,
        year,
        path: standingsPath(league, year),
      };
    }
  }

  if (segments[0] === 'stats' && segments.length === 4) {
    const type = STAT_TYPES.has(segments[1]) ? segments[1] : null;
    const league = SLUG_TO_LEAGUE[segments[2]];
    const year = validYear(segments[3]);
    if (type && (league === 'cl' || league === 'pl') && year) {
      return {
        tab: 'players',
        type,
        league,
        year,
        path: statsPath(type, league, year),
      };
    }
  }

  if (segments[0] === 'schedule' && segments.length === 2) {
    const month = validMonth(segments[1]);
    if (month) return { tab: 'schedule', month, path: schedulePath(month) };
  }

  if (segments[0] === 'stadiums' && segments.length === 2 && STADIUM_IDS.has(segments[1])) {
    return {
      tab: 'stadiums',
      stadiumId: segments[1],
      path: stadiumPath(segments[1]),
    };
  }

  if (segments[0] === 'teams' && segments.length === 2 && segments[1] === 'hanshin') {
    return {
      tab: 'team',
      team: 'hanshin',
      path: teamPath('hanshin'),
    };
  }

  if (
    segments[0] === 'methodology'
    && segments[1] === 'home-run-park-factor'
    && segments.length === 2
  ) {
    return {
      tab: 'methodology',
      method: 'home-run-park-factor',
      path: parkFactorMethodPath(),
    };
  }

  return defaultRoute();
}
