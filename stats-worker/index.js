import {
  HR_PARK_FACTORS,
  HR_PARK_FACTOR_META,
} from '../src/data/hrParkFactors.generated.js';
import {
  calculateAdjustedHomeRuns,
  parseNpbGameDetail,
} from '../shared/hrParkFactor.js';

const MONTHS = ['03', '04', '05', '06', '07', '08', '09', '10'];
const MAX_DETAILS = 30;
const PARSER_VERSION = 2;
const YEARLY_FACTOR_OVERRIDES = {
  2026: {
    'バンテリンドーム ナゴヤ': {
      factor: 1,
      reason: 'ホームランテラス新設のため過去実績を適用しない',
    },
  },
};

function tokyoDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function pathDate(path) {
  const match = path.match(/\/scores\/\d{4}\/(\d{2})(\d{2})\//);
  if (!match) return null;
  const year = path.match(/\/scores\/(\d{4})\//)?.[1];
  return year ? `${year}-${match[1]}-${match[2]}` : null;
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'npbinfo-stats-updater/1.0' },
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.text();
}

async function scorePaths(year) {
  const pages = await Promise.all(MONTHS.map(month => (
    fetchText(`https://npb.jp/games/${year}/schedule_${month}_detail.html`)
  )));
  const paths = new Set();
  for (const html of pages) {
    for (const match of html.matchAll(/href="(\/scores\/\d{4}\/\d{4}\/[^/]+\/)"/g)) {
      paths.add(match[1]);
    }
  }
  return [...paths].sort();
}

function validCutoff(value, year) {
  const normalized = String(value ?? '');
  return normalized.startsWith(`${year}-`) && /^\d{4}-\d{2}-\d{2}$/.test(normalized)
    ? normalized
    : tokyoDate();
}

async function updateAdjustedHomeRuns(env, year, maxDetails = MAX_DETAILS, requestedCutoff) {
  const key = `hr-adjusted:${year}`;
  const previous = await env.CACHE.get(key, 'json') ?? { games: {}, ignored: {} };
  const previousIgnored = previous.parserVersion === PARSER_VERSION
    ? previous.ignored ?? {}
    : {};
  const paths = await scorePaths(year);
  const today = tokyoDate();
  const cutoff = validCutoff(requestedCutoff, year);
  const currentGames = Object.fromEntries(
    Object.entries(previous.games).filter(([path]) => pathDate(path) <= cutoff),
  );
  const currentIgnored = Object.fromEntries(
    Object.entries(previousIgnored).filter(([path]) => pathDate(path) <= cutoff),
  );
  const candidates = paths.filter(path => (
    pathDate(path) <= cutoff
      && !currentGames[path]
      && !currentIgnored[path]
  ));
  const pending = candidates.slice(0, maxDetails);
  const details = await Promise.all(pending.map(async path => {
    const html = await fetchText(`https://npb.jp${path}`);
    return { path, detail: parseNpbGameDetail(html, path) };
  }));

  const games = { ...currentGames };
  const ignored = { ...currentIgnored };
  for (const { path, detail } of details) {
    if (detail) {
      games[path] = detail;
    } else if (pathDate(path) < today) {
      ignored[path] = today;
    }
  }

  const factorOverrides = YEARLY_FACTOR_OVERRIDES[year] ?? {};
  const factors = {
    ...HR_PARK_FACTORS,
    ...factorOverrides,
  };
  const teams = calculateAdjustedHomeRuns(Object.values(games), factors);
  const data = {
    year,
    parserVersion: PARSER_VERSION,
    cutoff,
    generatedAt: new Date().toISOString(),
    pending: Math.max(0, candidates.length - pending.length),
    games,
    ignored,
    teams,
    parkFactor: HR_PARK_FACTOR_META,
    factorOverrides,
  };
  await env.CACHE.put(key, JSON.stringify(data));
  await Promise.all([
    env.CACHE.delete(`standings:v5:cl:${year}`),
    env.CACHE.delete(`standings:v5:pl:${year}`),
  ]);
  return {
    year,
    cutoff,
    processed: details.filter(item => item.detail).length,
    totalGames: Object.keys(games).length,
    pending: data.pending,
    teams,
  };
}

function authorized(request, env) {
  return env.REFRESH_TOKEN
    && request.headers.get('Authorization') === `Bearer ${env.REFRESH_TOKEN}`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return Response.json({
        ok: true,
        worker: 'npbinfo-stats-updater',
        parkFactor: HR_PARK_FACTOR_META,
      });
    }
    if (url.pathname === '/internal/refresh' && request.method === 'POST' && url.hostname === 'stats') {
      const options = await request.json().catch(() => ({}));
      return Response.json(await updateAdjustedHomeRuns(
        env,
        Number(tokyoDate().slice(0, 4)),
        MAX_DETAILS,
        options.cutoff,
      ));
    }
    if (url.pathname !== '/refresh' || request.method !== 'POST') {
      return new Response('Not Found', { status: 404 });
    }
    if (!authorized(request, env)) return new Response('Unauthorized', { status: 401 });

    const year = Number.parseInt(url.searchParams.get('year'), 10) || new Date().getFullYear();
    const requestedMax = Number.parseInt(url.searchParams.get('max'), 10);
    const maxDetails = Number.isFinite(requestedMax)
      ? Math.max(1, Math.min(MAX_DETAILS, requestedMax))
      : MAX_DETAILS;
    return Response.json(await updateAdjustedHomeRuns(
      env,
      year,
      maxDetails,
      url.searchParams.get('cutoff'),
    ));
  },
};
