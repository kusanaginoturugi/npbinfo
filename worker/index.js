// Cloudflare Worker エントリポイント
// - /api/standings/:league    → npb.jp HTMLRewriter スクレイピング
// - /api/stats/:type/:league  → npb.jp HTMLRewriter スクレイピング
// - /api/schedule/:month      → npb.jp 試合日程スクレイピング
// - /api/weather              → Open-Meteo 天気予報プロキシ
// - /api/headtohead/:league   → チーム間対戦成績スクレイピング
// - /api/threads              → 5ch subject.txt から関連スレッド一覧
// - /og/standings/:league     → 順位表 OGP SVG
// - その他                    → dist/ の静的アセットを返す
import {
  HR_PARK_FACTORS,
  HR_PARK_FACTOR_META,
} from '../src/data/hrParkFactors.generated.js';
import {
  getTeamOgpCode,
  getTeamPrimaryColor,
  normalizeTeamName,
  normalizeTeamNameByPartialMatch,
} from '../shared/teams.js';

const BUILD_INFO = {
  buildId: __NPBINFO_BUILD_ID__,
  buildTime: __NPBINFO_BUILD_TIME__,
  gitRevision: __NPBINFO_GIT_REVISION__,
};

function jsonNoStore(data) {
  return Response.json(data, {
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}

// 年度取得用のヘルパー（リクエストのたびに計算する）
function getCurrentYear() {
  return new Date().getFullYear();
}

function getAvailableYears() {
  const current = getCurrentYear();
  return Array.from({ length: 12 }, (_, i) => current - i);
}

function getYear(url) {
  const current = getCurrentYear();
  const available = getAvailableYears();
  const year = new URL(url).searchParams.get('year');
  const parsed = year ? parseInt(year, 10) : current;
  // 解析に失敗した場合や範囲外の場合は current を返す
  return !isNaN(parsed) && available.includes(parsed) ? parsed : current;
}

function getTokyoDateValue(date = new Date()) {
  const parts = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function normalizeText(text) {
  return text.replace(/&nbsp;/g, ' ').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function skipCache(request) {
  return new URL(request.url).searchParams.get('nocache') === '1';
}

function edgeCacheKeyRequest(request, key) {
  const url = new URL(request.url);
  return new Request(`${url.origin}/__edge-cache/${encodeURIComponent(key)}`);
}

async function getEdgeCachedJson(request, key) {
  if (skipCache(request) || typeof caches === 'undefined') return null;

  try {
    const response = await caches.default.match(edgeCacheKeyRequest(request, key));
    return response ? await response.json() : null;
  } catch (err) {
    console.warn(`Edge cache get failed for ${key}: ${err.message}`);
    return null;
  }
}

async function putEdgeCachedJson(request, key, data, ttl) {
  if (skipCache(request) || typeof caches === 'undefined') return;

  try {
    const response = Response.json(data, {
      headers: {
        'Cache-Control': `public, max-age=${ttl}`,
      },
    });
    await caches.default.put(edgeCacheKeyRequest(request, key), response);
  } catch (err) {
    console.warn(`Edge cache put failed for ${key}: ${err.message}`);
  }
}

async function getCachedJson(_env, key, request) {
  return getEdgeCachedJson(request, `api:${key}`);
}

async function putCachedJson(_env, key, data, ttl, request) {
  await putEdgeCachedJson(request, `api:${key}`, data, ttl ?? 31536000);
}

function getScheduleTtl(year, month) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  if (year < currentYear || (year === currentYear && month < currentMonth)) return null;
  if (year === currentYear && month === currentMonth) return 60;
  return 86400;
}

function getYearAwareTtl(year, currentTtl) {
  return year < new Date().getFullYear() ? null : currentTtl;
}

function isValidDateValue(dateValue) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return false;

  const [year, month, day] = dateValue.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

// ─── 5ch 関連スレッド ────────────────────────────────────────
const THREAD_BOARDS = [
  {
    key: 'livebase',
    label: '野球ch',
    host: 'tanuki.5ch.net',
    board: 'livebase',
    url: 'https://tanuki.5ch.net/livebase/subject.txt',
  },
  {
    key: 'base',
    label: 'プロ野球',
    host: 'rio2016.5ch.net',
    board: 'base',
    url: 'https://rio2016.5ch.net/base/subject.txt',
  },
];

const THREAD_TEAM_KEYWORDS = {
  'ヤクルト': ['ヤクルト', 'スワローズ'],
  '阪神': ['阪神', 'タイガース'],
  '巨人': ['巨人', '読売', 'ジャイアンツ'],
  'DeNA': ['DeNA', '横浜', 'ベイスターズ'],
  '広島': ['広島', 'カープ'],
  '中日': ['中日', 'ドラゴンズ'],
  'ソフトバンク': ['ソフトバンク', 'ホークス'],
  '日本ハム': ['日本ハム', 'ファイターズ'],
  '楽天': ['楽天', 'イーグルス'],
  'ロッテ': ['ロッテ', 'マリーンズ'],
  'オリックス': ['オリックス', 'バファローズ'],
  '西武': ['西武', 'ライオンズ'],
};

function threadKeywordsForTeam(team) {
  if (!team || team === 'all') {
    return Object.values(THREAD_TEAM_KEYWORDS).flat();
  }
  const normalized = normalizeTeamName(team);
  return THREAD_TEAM_KEYWORDS[normalized] ?? [normalized];
}

function parseThreadSubject(text, board, previousCounts = {}, sampleHours = null) {
  return String(text ?? '')
    .split('\n')
    .map((line, index) => {
      const match = line.trim().match(/^(\d+)\.dat<>(.+)\s+\((\d+)\)$/);
      if (!match) return null;
      const threadId = match[1];
      const responseCount = Number.parseInt(match[3], 10);
      const previousCount = previousCounts[threadId];
      const delta = Number.isFinite(previousCount) ? Math.max(0, responseCount - previousCount) : 0;
      return {
        id: `${board.key}:${threadId}`,
        threadId,
        board: board.key,
        boardLabel: board.label,
        subjectRank: index + 1,
        title: normalizeText(match[2]),
        responseCount,
        delta,
        sampleHours,
        speedPerHour: sampleHours ? delta / sampleHours : null,
        url: `https://${board.host}/test/read.cgi/${board.board}/${threadId}/`,
      };
    })
    .filter(Boolean);
}

async function fetchBoardThreads(board, request) {
  const snapshotKey = `threads:snapshot:${board.key}`;
  const previous = await getEdgeCachedJson(request, snapshotKey);
  const previousAt = previous?.updatedAt ? Date.parse(previous.updatedAt) : NaN;
  const sampleHours = Number.isFinite(previousAt)
    ? Math.max((Date.now() - previousAt) / 3600000, 1 / 60)
    : null;
  const response = await fetch(board.url, {
    headers: {
      'User-Agent': 'npbinfo/1.0 (+https://npbinfo.kusanaginoturugi.workers.dev)',
    },
  });
  if (!response.ok) throw new Error(`${board.key} subject ${response.status}`);

  const bytes = await response.arrayBuffer();
  const text = new TextDecoder('shift_jis').decode(bytes);
  const threads = parseThreadSubject(text, board, previous?.counts ?? {}, sampleHours);
  const counts = Object.fromEntries(threads.map(thread => [thread.threadId, thread.responseCount]));
  await putEdgeCachedJson(request, snapshotKey, { counts, updatedAt: new Date().toISOString() }, 86400);
  return threads;
}

function filterRelatedThreads(threads, team) {
  const keywords = threadKeywordsForTeam(team).map(keyword => keyword.toLowerCase());
  return threads
    .map(thread => {
      const title = thread.title.toLowerCase();
      const matchedKeywords = keywords.filter(keyword => title.includes(keyword.toLowerCase()));
      if (!matchedKeywords.length) return null;
      const matchedTeams = Object.entries(THREAD_TEAM_KEYWORDS)
        .filter(([, teamKeywords]) => teamKeywords.some(keyword => title.includes(keyword.toLowerCase())))
        .map(([teamName]) => teamName);
      return { ...thread, matchedKeywords, matchedTeams };
    })
    .filter(Boolean);
}

function sortThreads(threads, sort) {
  const comparers = {
    momentum: (a, b) => ((b.speedPerHour ?? -1) - (a.speedPerHour ?? -1))
      || (b.delta - a.delta)
      || (b.responseCount - a.responseCount),
    responses: (a, b) => (b.responseCount - a.responseCount)
      || ((b.speedPerHour ?? -1) - (a.speedPerHour ?? -1)),
    recent: (a, b) => (a.subjectRank - b.subjectRank)
      || (b.responseCount - a.responseCount),
    board: (a, b) => a.boardLabel.localeCompare(b.boardLabel, 'ja')
      || (a.subjectRank - b.subjectRank),
  };
  return [...threads].sort(comparers[sort] ?? comparers.momentum);
}

async function handleThreads(request, env) {
  const url = new URL(request.url);
  const team = url.searchParams.get('team') || 'all';
  const sort = url.searchParams.get('sort') || 'momentum';
  const limit = Math.min(Math.max(Number.parseInt(url.searchParams.get('limit') || '20', 10), 1), 30);
  const cacheKey = `threads:v2:${team}:${sort}:${limit}`;
  const cached = await getEdgeCachedJson(request, cacheKey);
  if (cached) return Response.json(cached);

  const settled = await Promise.allSettled(THREAD_BOARDS.map(board => fetchBoardThreads(board, request)));
  const errors = [];
  const allThreads = [];
  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      allThreads.push(...result.value);
    } else {
      errors.push({ board: THREAD_BOARDS[index].key, message: result.reason?.message ?? 'fetch failed' });
    }
  });

  const threads = sortThreads(filterRelatedThreads(allThreads, team), sort).slice(0, limit);
  const data = {
    team,
    sort,
    generatedAt: new Date().toISOString(),
    source: '5ch subject.txt',
    boards: THREAD_BOARDS.map(({ key, label }) => ({ key, label })),
    errors,
    threads,
  };
  await putEdgeCachedJson(request, cacheKey, data, 180);
  return Response.json(data);
}

// ─── 順位表 ──────────────────────────────────────────────────
const VALID_LEAGUES = new Set(['cl', 'pl', 'cp', 'op']);

const LEAGUE_LABELS = {
  cl: 'セ・リーグ',
  pl: 'パ・リーグ',
  cp: '交流戦',
  op: 'オープン戦',
};

const STANDINGS_FIELDS = {
  0: 'name', 1: 'playGameCount', 2: 'win', 3: 'lose',
  4: 'draw', 5: 'pct', 6: 'gamesBehind',
};

async function collectTableRows(source, {
  tableClassNames,
  maxTables = Number.POSITIVE_INFINITY,
  normalizeCell = normalizeText,
  onRow,
}) {
  let tableDepth = 0;
  let targetTableDepth = -1;
  let matchedTableCount = 0;
  let tableIndex = -1;
  let rowIndex = 0;
  let headers = [];
  let rowCells = [];
  let cellText = '';
  let currentCellTag = null;

  function isTargetTable(className) {
    return tableClassNames.some(name => className.includes(name));
  }

  function pushCell() {
    rowCells.push({
      tag: currentCellTag,
      text: normalizeCell(cellText),
    });
    cellText = '';
    currentCellTag = null;
  }

  await new HTMLRewriter()
    .on('table', {
      element(el) {
        tableDepth++;
        if (targetTableDepth === -1 && matchedTableCount < maxTables) {
          const className = el.getAttribute('class') ?? '';
          if (isTargetTable(className)) {
            targetTableDepth = tableDepth;
            tableIndex = matchedTableCount;
            matchedTableCount++;
            rowIndex = 0;
            headers = [];
          }
        }
        el.onEndTag(() => {
          if (tableDepth === targetTableDepth) {
            targetTableDepth = -1;
            tableIndex = -1;
          }
          tableDepth--;
        });
      },
    })
    .on('tr', {
      element(el) {
        if (tableDepth !== targetTableDepth) return;
        rowCells = [];
        el.onEndTag(() => {
          if (tableDepth !== targetTableDepth) return;
          const rawCells = rowCells;
          if (rowIndex === 0) {
            headers = rawCells.map(cell => cell.text);
          } else {
            headers.push(...rawCells.filter(cell => cell.tag === 'th').map(cell => cell.text));
          }
          onRow?.({
            cells: rawCells.filter(cell => cell.tag === 'td').map(cell => cell.text),
            headers,
            rawCells,
            rowIndex,
            tableIndex,
          });
          rowIndex++;
        });
      },
    })
    .on('th', {
      element(el) {
        if (tableDepth !== targetTableDepth) return;
        currentCellTag = 'th';
        cellText = '';
        el.onEndTag(() => {
          if (tableDepth !== targetTableDepth) return;
          pushCell();
        });
      },
    })
    .on('td', {
      element(el) {
        if (tableDepth !== targetTableDepth) return;
        currentCellTag = 'td';
        cellText = '';
        el.onEndTag(() => {
          if (tableDepth !== targetTableDepth) return;
          pushCell();
        });
      },
    })
    .on('*', {
      text(chunk) {
        if (targetTableDepth === -1 || tableDepth < targetTableDepth) return;
        if (currentCellTag) cellText += chunk.text;
      },
    })
    .transform(source)
    .text();
}

function calculateApproxDer(stats) {
  const battersFaced = Number.parseFloat(stats.battersFaced);
  const hitsAllowed = Number.parseFloat(stats.hitsAllowed);
  const homeRunsAllowed = Number.parseFloat(stats.homeRunsAllowed);
  const walks = Number.parseFloat(stats.walks);
  const hitBatters = Number.parseFloat(stats.hitBatters);
  const strikeouts = Number.parseFloat(stats.strikeouts);
  if (![battersFaced, hitsAllowed, homeRunsAllowed, walks, hitBatters, strikeouts].every(Number.isFinite)) {
    return '-';
  }

  const ballsInPlay = battersFaced - walks - hitBatters - strikeouts - homeRunsAllowed;
  if (ballsInPlay <= 0) return '-';

  const nonHomeRunHits = hitsAllowed - homeRunsAllowed;
  return formatRate(1 - (nonHomeRunHits / ballsInPlay));
}

async function collectStandingsTeams(source, teams, battingStats, pitchingStats, fieldingStats) {
  await collectTableRows(source, {
    tableClassNames: ['tablefix2', 'stdtblSubmain'],
    normalizeCell: value => String(value ?? '').replace(/\s+/g, ' ').trim(),
    onRow({ cells }) {
      // チーム名（インデックス0）があることを確認
      if (cells.length < 2 || !cells[0] || cells[0].includes('チーム') || cells[0].includes('リーグ')) return;

      const team = {};
      for (const [idx, field] of Object.entries(STANDINGS_FIELDS)) {
        team[field] = cells[idx] ?? '-';
      }
      team.name = normalizeTeamShortName(team.name);
      team.rank = teams.length + 1;

      // 追加成績をマージ
      const bStats = battingStats[team.name] || {};
      const pStats = pitchingStats[team.name] || {};
      const fStats = fieldingStats?.[team.name] || {};
      team.avg = bStats.avg || '-';
      team.hr = bStats.hr || '-';
      team.sb = bStats.sb || '-';
      team.ops = bStats.ops || '-';
      team.era = pStats.era || '-';
      team.derApprox = calculateApproxDer(pStats);
      team.fieldingPct = fStats.fieldingPct || '-';

      // 重複チェック（交流戦テーブルなどが続く場合があるため）
      if (!teams.some(t => t.name === team.name)) {
        teams.push(team);
      }
    },
  });
}

async function mergeAdjustedHomeRuns(teams, year, env) {
  if (!env.CACHE) return null;

  try {
    const adjustment = await env.CACHE.get(`hr-adjusted:${year}`, 'json');
    if (!adjustment?.teams) return null;

    teams.forEach(team => {
      const adjusted = adjustment.teams[team.name];
      const standingsHomeRuns = Number.parseInt(team.hr, 10);
      team.hrAdjusted = adjusted?.raw === standingsHomeRuns
        ? adjusted.adjusted
        : '-';
    });
    return {
      generatedAt: adjustment.generatedAt,
      cutoff: adjustment.cutoff,
      pending: adjustment.pending ?? 0,
      years: HR_PARK_FACTOR_META.years,
      regressionGames: HR_PARK_FACTOR_META.regressionGames,
      factorOverrides: adjustment.factorOverrides ?? {},
    };
  } catch (err) {
    console.warn(`KV get failed for hr-adjusted:${year}: ${err.message}`);
    return null;
  }
}

function hasD1(env) {
  return Boolean(env?.DB?.prepare);
}

function shouldReadStandingsFromD1(year) {
  return year < getCurrentYear();
}

function numberOrNull(value) {
  if (value == null || value === '-' || value === '--') return null;
  const parsed = Number(String(value).replace(/^0(?=\.)/, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function integerOrNull(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

async function readStandingsFromD1(env, league, year) {
  if (!hasD1(env) || !shouldReadStandingsFromD1(year)) return null;

  try {
    const result = await env.DB.prepare(`
      SELECT payload_json
      FROM standings_payloads
      WHERE year = ?1
        AND league = ?2
      ORDER BY fetched_at DESC
      LIMIT 1
    `).bind(year, league).all();
    const row = result.results?.[0];
    return row?.payload_json ? JSON.parse(row.payload_json) : null;
  } catch (err) {
    console.warn(`D1 standings read failed for ${league}:${year}: ${err.message}`);
    return null;
  }
}

async function clearEdgeCache(request, key) {
  if (skipCache(request) || typeof caches === 'undefined') return;

  try {
    await caches.default.delete(edgeCacheKeyRequest(request, key));
  } catch (err) {
    console.warn(`Edge cache delete failed for ${key}: ${err.message}`);
  }
}

async function writeStandingsToD1(env, data, sourceUrl) {
  if (!hasD1(env) || !Array.isArray(data?.teams) || !data.teams.length) return;

  const fetchedAt = new Date().toISOString();
  const startedAt = Date.now();
  try {
    const statements = [
      env.DB.prepare(`
        INSERT OR REPLACE INTO standings_payloads (
          year,
          league,
          payload_json,
          source_url,
          fetched_at
        ) VALUES (?1, ?2, ?3, ?4, ?5)
      `).bind(
        data.year,
        data.league,
        JSON.stringify(data),
        sourceUrl,
        fetchedAt,
      ),
    ];
    statements.push(...data.teams.map(team => env.DB.prepare(`
      INSERT OR REPLACE INTO standings_snapshots (
        year,
        league,
        team_name,
        rank,
        play_game_count,
        win,
        lose,
        draw,
        pct,
        games_behind,
        avg,
        hr,
        sb,
        ops,
        era,
        der_approx,
        team_json,
        update_note,
        source_url,
        fetched_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20)
    `).bind(
      data.year,
      data.league,
      team.name,
      integerOrNull(team.rank),
      integerOrNull(team.playGameCount),
      integerOrNull(team.win),
      integerOrNull(team.lose),
      integerOrNull(team.draw),
      numberOrNull(team.pct),
      team.gamesBehind ?? null,
      numberOrNull(team.avg),
      integerOrNull(team.hr),
      integerOrNull(team.sb),
      numberOrNull(team.ops),
      numberOrNull(team.era),
      numberOrNull(team.derApprox),
      JSON.stringify(team),
      data.updateNote ?? null,
      sourceUrl,
      fetchedAt,
    )));
    statements.push(env.DB.prepare(`
      INSERT INTO fetch_runs (
        source,
        source_url,
        target_type,
        target_key,
        status,
        row_count,
        duration_ms,
        fetched_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
    `).bind(
      'npb.jp',
      sourceUrl,
      'standings',
      `${data.league}:${data.year}`,
      'ok',
      data.teams.length,
      Date.now() - startedAt,
      fetchedAt,
    ));
    await env.DB.batch(statements);
  } catch (err) {
    console.warn(`D1 standings write failed for ${data.league}:${data.year}: ${err.message}`);
  }
}

async function buildStandingsData(league, year, request, env) {
  if (league === 'cp' || league === 'op') {
    const sourceUrl = `https://npb.jp/bis/${year}/stats/${league === 'cp' ? 'std_inter.html' : 'std_op.html'}`;
    const specialStandings = await fetchSpecialStandings(league, year);
    const interleagueData = league === 'cp'
      ? await buildInterleagueStandingsData(year, specialStandings.teams, specialStandings.finishedGames, request, env)
      : { teams: specialStandings.teams, updateNote: null };
    const data = { league, year, teams: interleagueData.teams };
    if (interleagueData.updateNote) data.updateNote = interleagueData.updateNote;
    return { data, sourceUrl };
  }

  const leagueCode = league === 'cl' ? 'c' : 'p';
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
  const stdUrl = `https://npb.jp/bis/${year}/stats/std_${leagueCode}.html`;
  const tmbUrl = `https://npb.jp/bis/${year}/stats/tmb_${leagueCode}.html`;
  const tmpUrl = `https://npb.jp/bis/${year}/stats/tmp_${leagueCode}.html`;
  const tmfUrl = `https://npb.jp/bis/${year}/stats/tmf_${leagueCode}.html`;

  const [stdRes, tmbRes, tmpRes, tmfRes] = await Promise.all([
    fetch(stdUrl, { headers: { 'User-Agent': UA } }),
    fetch(tmbUrl, { headers: { 'User-Agent': UA } }),
    fetch(tmpUrl, { headers: { 'User-Agent': UA } }),
    fetch(tmfUrl, { headers: { 'User-Agent': UA } }),
  ]);

  if (!stdRes.ok) throw new Error(`npb.jp (std) returned ${stdRes.status}`);

  const isLegacy = year <= 2024;
  const [battingStats, pitchingStats, fieldingStats] = await Promise.all([
    parseExtraStats(tmbRes, 'tablefix2', 0, { 1: 'avg', 9: 'hr', 12: 'sb', '-2': 'slg', '-1': 'obp' }, isLegacy),
    parseExtraStats(tmpRes, 'tablefix2', 0, {
      1: 'era',
      12: 'battersFaced',
      14: 'hitsAllowed',
      15: 'homeRunsAllowed',
      16: 'walks',
      18: 'hitBatters',
      19: 'strikeouts',
    }, isLegacy),
    parseExtraStats(tmfRes, 'tablefix2', 0, { 1: 'fieldingPct' }, isLegacy),
  ]);
  Object.values(battingStats).forEach((stats) => {
    stats.ops = calculateOps(stats.slg, stats.obp);
  });

  const stdHtml = await stdRes.text();
  const updateNote = await buildStandingsUpdateNote(year, request, env);
  const teams = [];
  await collectStandingsTeams(
    new Response(stdHtml),
    teams,
    battingStats,
    pitchingStats,
    fieldingStats,
  );
  const hrAdjustment = await mergeAdjustedHomeRuns(teams, year, env);

  const data = { league, year, teams };
  if (updateNote) data.updateNote = updateNote;
  if (hrAdjustment) data.hrAdjustment = hrAdjustment;
  return { data, sourceUrl: stdUrl };
}

function isLocalRequest(request) {
  const host = new URL(request.url).hostname;
  return host === 'localhost' || host === '127.0.0.1';
}

function isRefreshAuthorized(request, env) {
  if (!env.REFRESH_TOKEN) return isLocalRequest(request);
  const header = request.headers.get('Authorization') ?? '';
  return header === `Bearer ${env.REFRESH_TOKEN}`;
}

async function refreshStandings(league, year, request, env) {
  if (!VALID_LEAGUES.has(league)) {
    throw new Error(`invalid league: ${league}`);
  }
  if (!getAvailableYears().includes(year)) {
    throw new Error(`invalid year: ${year}`);
  }

  const { data, sourceUrl } = await buildStandingsData(league, year, request, env);
  await writeStandingsToD1(env, data, sourceUrl);
  const cacheKey = `standings:v6:${league}:${year}`;
  await clearEdgeCache(request, `api:${cacheKey}`);
  await putCachedJson(env, cacheKey, data, getYearAwareTtl(year, 600), request);
  return {
    league,
    year,
    teams: data.teams.length,
    sourceUrl,
    stored: hasD1(env),
  };
}

async function handleRefreshStandings(request, env) {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }
  if (!isRefreshAuthorized(request, env)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const url = new URL(request.url);
  const requestedLeague = url.searchParams.get('league') || 'all';
  const year = Number.parseInt(url.searchParams.get('year') || String(getCurrentYear()), 10);
  const leagues = requestedLeague === 'all'
    ? ['cl', 'pl', 'cp', 'op']
    : [requestedLeague];

  try {
    const refreshed = [];
    for (const league of leagues) {
      refreshed.push(await refreshStandings(league, year, request, env));
    }
    return Response.json({
      ok: true,
      target: 'standings',
      refreshed,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    return Response.json(
      { ok: false, error: 'refresh failed', detail: err.message },
      { status: 400 },
    );
  }
}

async function refreshScheduledStandings(controller, env) {
  const year = getCurrentYear();
  const request = new Request(`https://npbinfo.kusanaginoturugi.workers.dev/__scheduled?cron=${encodeURIComponent(controller.cron ?? '')}`);
  const refreshed = [];

  for (const league of ['cl', 'pl']) {
    try {
      refreshed.push(await refreshStandings(league, year, request, env));
    } catch (err) {
      console.error(`Scheduled standings refresh failed for ${league}:${year}: ${err.message}`);
    }
  }

  console.log(JSON.stringify({
    event: 'scheduled-standings-refresh',
    cron: controller.cron,
    year,
    refreshed,
    generatedAt: new Date().toISOString(),
  }));
}

async function handleStandings(league, request, env) {
  if (!VALID_LEAGUES.has(league)) {
    return new Response('Not Found', { status: 404 });
  }

  const year = getYear(request.url);
  const cacheKey = `standings:v6:${league}:${year}`;
  const cached = await getCachedJson(env, cacheKey, request);
  if (cached) return Response.json(cached);

  const stored = await readStandingsFromD1(env, league, year);
  if (stored) {
    await putCachedJson(env, cacheKey, stored, getYearAwareTtl(year, 600), request);
    return Response.json(stored);
  }

  try {
    const { data, sourceUrl } = await buildStandingsData(league, year, request, env);
    await writeStandingsToD1(env, data, sourceUrl);
    await putCachedJson(env, cacheKey, data, getYearAwareTtl(year, 600), request);
    return Response.json(data);
  } catch (err) {
    return Response.json(
      { error: '順位表の取得に失敗しました', detail: err.message },
      { status: 502 }
    );
  }
}

function normalizeSpecialStandingsTeamName(value) {
  const normalized = String(value ?? '').replace(/[ \t\r\n　]/g, '');
  return normalizeTeamNameByPartialMatch(normalized);
}

function applyCompetitionRanks(teams) {
  let previousKey = null;
  let previousRank = 0;
  teams.forEach((team, index) => {
    const key = `${team.pct}:${team.gamesBehind}`;
    const rank = key === previousKey ? previousRank : index + 1;
    team.rank = rank;
    previousKey = key;
    previousRank = rank;
  });
}

function buildSpecialStandingsRewriter(teams) {
  let inRow = false;
  let cells = [];
  let cellText = '';

  return new HTMLRewriter()
    .on('tr.ststats', {
      element(el) {
        inRow = true;
        cells = [];
        el.onEndTag(() => {
          inRow = false;
          if (cells.length < 7) return;

          teams.push({
            name: normalizeSpecialStandingsTeamName(cells[0]),
            playGameCount: cells[1] ?? '-',
            win: cells[2] ?? '-',
            lose: cells[3] ?? '-',
            draw: cells[4] ?? '-',
            pct: cells[5] ?? '-',
            gamesBehind: cells[6] === '--' ? '-' : (cells[6] ?? '-'),
            avg: '-',
            era: '-',
            hr: '-',
            sb: '-',
            ops: '-',
            derApprox: '-',
          });
        });
      },
    })
    .on('td', {
      element(el) {
        if (!inRow) return;
        cellText = '';
        el.onEndTag(() => {
          if (!inRow) return;
          cells.push(normalizeText(cellText));
        });
      },
      text(chunk) {
        if (!inRow) return;
        cellText += chunk.text;
      },
    });
}

async function fetchSpecialStandings(league, year) {
  const file = league === 'cp' ? 'std_inter.html' : 'std_op.html';
  const url = `https://npb.jp/bis/${year}/stats/${file}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept-Language': 'ja,en;q=0.9',
    },
  });
  if (!res.ok) throw new Error(`npb.jp (${file}) returned ${res.status}`);

  const html = await res.text();
  const teams = [];
  await buildSpecialStandingsRewriter(teams).transform(new Response(html)).text();
  applyCompetitionRanks(teams);
  return {
    teams,
    finishedGames: league === 'cp' ? parseHeaderFinishedGames(html) : [],
  };
}

function shiftYearMonth(year, month, delta) {
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
  };
}

const CENTRAL_TEAMS = new Set(['阪神', 'ヤクルト', '巨人', 'DeNA', '広島', '中日']);
const PACIFIC_TEAMS = new Set(['西武', 'オリックス', 'ソフトバンク', '日本ハム', 'ロッテ', '楽天']);

function getLeagueGroup(teamName) {
  const normalized = normalizeSpecialStandingsTeamName(teamName);
  if (CENTRAL_TEAMS.has(normalized)) return 'cl';
  if (PACIFIC_TEAMS.has(normalized)) return 'pl';
  return null;
}

function isInterleagueGame(game) {
  const homeLeague = getLeagueGroup(game.homeTeam);
  const awayLeague = getLeagueGroup(game.awayTeam);
  return homeLeague && awayLeague && homeLeague !== awayLeague;
}

function buildTargetGameCounts(teams) {
  const counts = new Map();
  for (const team of teams) {
    const games = Number(team.playGameCount);
    if (!team.name || !Number.isFinite(games)) continue;
    counts.set(team.name, games);
  }
  return counts;
}

function matchesTargetGameCounts(currentCounts, targetCounts) {
  for (const [team, target] of targetCounts.entries()) {
    if ((currentCounts.get(team) ?? 0) !== target) return false;
  }
  return true;
}

function dedupeGames(games) {
  const seen = new Set();
  const deduped = [];
  for (const game of games) {
    const key = `${game.date}:${normalizeSpecialStandingsTeamName(game.homeTeam)}:${normalizeSpecialStandingsTeamName(game.awayTeam)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(game);
  }
  return deduped;
}

function parseHeaderDate(html) {
  const match = String(html ?? '').match(/<div class="score_box date"><div>\s*(\d{4})<br>\s*(\d{1,2})\/(\d{1,2})/);
  if (!match) return null;
  return `${match[1]}-${String(Number(match[2])).padStart(2, '0')}-${String(Number(match[3])).padStart(2, '0')}`;
}

function parseHeaderFinishedGames(html) {
  const date = parseHeaderDate(html);
  if (!date) return [];

  const games = [];
  const scoreBoxPattern = /<div class="score_box">\s*<a href="[^"]+">\s*<div>([\s\S]*?)<\/div>\s*<\/a>\s*<\/div>/g;
  let match;
  while ((match = scoreBoxPattern.exec(String(html ?? ''))) !== null) {
    const block = match[1];
    if (!block.includes('試合終了')) continue;

    const teams = [...block.matchAll(/<img[^>]+alt="([^"]+)"/g)].map(item => normalizeSpecialStandingsTeamName(item[1]));
    const score = block.match(/<div class="score">(\d+)-(\d+)<\/div>/);
    if (teams.length < 2 || !score) continue;

    games.push({
      date,
      homeTeam: teams[0],
      awayTeam: teams[1],
      homeScore: score[1],
      awayScore: score[2],
      status: '終了',
    });
  }

  return games.filter(isInterleagueGame);
}

async function fetchFinishedInterleagueGames(year, extraGames, request, env) {
  const games = [...(extraGames ?? [])];
  for (const month of ['05', '06']) {
    const scheduleRes = await handleSchedule(`${year}-${month}`, request, env);
    if (!scheduleRes.ok) continue;
    const schedule = await scheduleRes.json();
    games.push(...(schedule.games ?? []).filter(game => (
      game.status === '終了' && game.date && isInterleagueGame(game)
    )));
  }
  return dedupeGames(games).sort((a, b) => a.date.localeCompare(b.date));
}

function findDateForGameCounts(games, targetCounts) {
  if (targetCounts.size === 0) return null;

  const currentCounts = new Map();
  const dates = [...new Set(games.map(game => game.date))].sort();
  for (const date of dates) {
    for (const game of games.filter(item => item.date === date)) {
      const homeTeam = normalizeSpecialStandingsTeamName(game.homeTeam);
      const awayTeam = normalizeSpecialStandingsTeamName(game.awayTeam);
      currentCounts.set(homeTeam, (currentCounts.get(homeTeam) ?? 0) + 1);
      currentCounts.set(awayTeam, (currentCounts.get(awayTeam) ?? 0) + 1);
    }
    if (matchesTargetGameCounts(currentCounts, targetCounts)) {
      return date;
    }
  }

  return null;
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function formatPct(wins, losses) {
  const denominator = wins + losses;
  if (denominator === 0) return '-';
  const value = wins / denominator;
  if (value === 1) return '1.000';
  return value.toFixed(3).replace(/^0/, '');
}

function formatRate(value) {
  if (!Number.isFinite(value)) return '-';
  if (value === 1) return '1.000';
  return value.toFixed(3).replace(/^0/, '');
}

function calculateOps(slg, obp) {
  const slgValue = Number.parseFloat(slg);
  const obpValue = Number.parseFloat(obp);
  if (!Number.isFinite(slgValue) || !Number.isFinite(obpValue)) return '-';
  return formatRate(slgValue + obpValue);
}

function formatGamesBehind(value) {
  if (value === 0) return '-';
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function recalculateCompetitionStandings(teams) {
  teams.sort((a, b) => {
    const pctDiff = Number(b.pct === '-' ? -1 : b.pct) - Number(a.pct === '-' ? -1 : a.pct);
    if (pctDiff !== 0) return pctDiff;
    return toNumber(b.win) - toNumber(a.win);
  });

  const leader = teams[0];
  const leaderWins = toNumber(leader?.win);
  const leaderLosses = toNumber(leader?.lose);
  for (const team of teams) {
    const gamesBehind = ((leaderWins - toNumber(team.win)) + (toNumber(team.lose) - leaderLosses)) / 2;
    team.gamesBehind = formatGamesBehind(gamesBehind);
  }

  applyCompetitionRanks(teams);
}

function applyFinishedGamesToStandings(teams, games) {
  const standings = teams.map(team => ({
    ...team,
    playGameCount: toNumber(team.playGameCount),
    win: toNumber(team.win),
    lose: toNumber(team.lose),
    draw: toNumber(team.draw),
  }));
  const byName = new Map(standings.map(team => [team.name, team]));

  for (const game of games) {
    const home = byName.get(normalizeSpecialStandingsTeamName(game.homeTeam));
    const away = byName.get(normalizeSpecialStandingsTeamName(game.awayTeam));
    const homeScore = Number(game.homeScore);
    const awayScore = Number(game.awayScore);
    if (!home || !away || !Number.isFinite(homeScore) || !Number.isFinite(awayScore)) continue;

    home.playGameCount += 1;
    away.playGameCount += 1;
    if (homeScore > awayScore) {
      home.win += 1;
      away.lose += 1;
    } else if (homeScore < awayScore) {
      away.win += 1;
      home.lose += 1;
    } else {
      home.draw += 1;
      away.draw += 1;
    }
  }

  for (const team of standings) {
    team.playGameCount = String(team.playGameCount);
    team.win = String(team.win);
    team.lose = String(team.lose);
    team.draw = String(team.draw);
    team.pct = formatPct(toNumber(team.win), toNumber(team.lose));
  }
  recalculateCompetitionStandings(standings);
  return standings;
}

async function buildInterleagueStandingsData(year, teams, extraGames, request, env) {
  const targetCounts = buildTargetGameCounts(teams);
  if (targetCounts.size === 0) return { teams, updateNote: null };

  const games = await fetchFinishedInterleagueGames(year, extraGames, request, env);
  const baseDate = findDateForGameCounts(games, targetCounts);
  if (!baseDate) return { teams, updateNote: null };

  const today = getTokyoDateValue();
  const provisionalGames = games.filter(game => game.date > baseDate && game.date <= today);
  if (provisionalGames.length === 0) {
    return { teams, updateNote: formatUpdateNoteFromDate(baseDate) };
  }

  const provisionalTeams = applyFinishedGamesToStandings(teams, provisionalGames);
  const latestDate = provisionalGames.reduce((max, game) => (game.date > max ? game.date : max), provisionalGames[0].date);
  return {
    teams: provisionalTeams,
    updateNote: `[暫定] ${formatUpdateNoteFromDate(latestDate)}`,
  };
}

function formatUpdateNoteFromDate(dateValue) {
  const [y, m, d] = String(dateValue).split('-').map(Number);
  if (!y || !m || !d) return null;
  return `${y}/${m}/${d} 試合まで反映`;
}

async function buildStandingsUpdateNote(year, request, env) {
  const tokyoToday = getTokyoDateValue();
  const [currentYear, currentMonth] = tokyoToday.split('-').map(Number);
  const startMonth = year < currentYear ? 12 : currentMonth;

  for (let i = 0; i < 3; i += 1) {
    const target = shiftYearMonth(year, startMonth, -i);
    const monthParam = `${target.year}-${String(target.month).padStart(2, '0')}`;
    const scheduleRes = await handleSchedule(monthParam, request, env);
    if (!scheduleRes.ok) continue;

    const schedule = await scheduleRes.json();
    const finishedDates = (schedule.games ?? [])
      .filter(game => game.status === '終了' && game.date)
      .map(game => game.date);
    if (finishedDates.length === 0) continue;

    const latestDate = finishedDates.reduce((max, value) => (value > max ? value : max), finishedDates[0]);
    const note = formatUpdateNoteFromDate(latestDate);
    if (note) return note;
  }

  return null;
}

// ─── チーム間対戦成績 ─────────────────────────────────────────
function normalizeTeamShortName(value) {
  // チーム名の正規化（空白・改行を完全に除去してマッチング率を上げる）
  const normalized = value.replace(/[ \t\r\n　]/g, '');
  return normalizeTeamName(normalized);
}

async function parseExtraStats(res, tableClass, teamNameIdx, fieldMappings, isLegacy = false) {
  if (!res.ok) return {};
  const stats = {};
  let cells = [];
  let cellText = '';

  const rewriter = new HTMLRewriter();

  if (isLegacy) {
    rewriter.on('tr.ststats', {
      element(el) {
        cells = [];
        el.onEndTag(() => {
          if (cells.length > teamNameIdx) {
            const teamName = normalizeTeamShortName(cells[teamNameIdx]);
            const s = {};
            for (const [idx, field] of Object.entries(fieldMappings)) {
              const cellIndex = Number(idx);
              const resolvedIndex = cellIndex < 0 ? cells.length + cellIndex : cellIndex;
              s[field] = cells[resolvedIndex] ?? '-';
            }
            stats[teamName] = s;
          }
        });
      },
    });

    await rewriter
      .on('td', {
        element(el) {
          cellText = '';
          el.onEndTag(() => {
            cells.push(cellText.trim());
          });
        },
        text(chunk) {
          cellText += chunk.text;
        },
      })
      .transform(res)
      .text();
    return stats;
  }

  await collectTableRows(res, {
    tableClassNames: [tableClass, 'NpbSt'],
    maxTables: 1,
    normalizeCell: value => String(value ?? '').trim(),
    onRow({ cells: rowCells, rowIndex }) {
      if (rowIndex === 0 || rowCells.length <= teamNameIdx) return;

      const teamName = normalizeTeamShortName(rowCells[teamNameIdx]);
      const s = {};
      for (const [idx, field] of Object.entries(fieldMappings)) {
        const cellIndex = Number(idx);
        const resolvedIndex = cellIndex < 0 ? rowCells.length + cellIndex : cellIndex;
        s[field] = rowCells[resolvedIndex] ?? '-';
      }
      stats[teamName] = s;
    },
  });

  return stats;
}

function normalizeHeadtoHeadValue(value) {
  const normalized = normalizeText(value);
  if (!normalized || normalized === '***' || normalized === '--') return null;
  return normalized;
}

function parseOpponentHeader(value) {
  const normalized = normalizeText(value);
  const match = normalized.match(/^対(.+)$/);
  if (!match) return null;
  return normalizeTeamName(match[1]);
}

async function handleHeadToHead(league, request, env) {
  if (!['cl', 'pl'].includes(league)) {
    return new Response('Not Found', { status: 404 });
  }

  const year = getYear(request.url);
  const cacheKey = `headtohead:${league}:${year}`;
  const cached = await getCachedJson(env, cacheKey, request);
  if (cached) return Response.json(cached);

  const leagueCode = league === 'cl' ? 'c' : 'p';
  const url = `https://npb.jp/bis/${year}/stats/std_${leagueCode}.html`;

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'ja,en;q=0.9',
      },
    });
    if (!res.ok) throw new Error(`npb.jp returned ${res.status} for URL: ${url}`);

    const teams = [];

    await collectTableRows(res, {
      tableClassNames: ['tablefix2', 'stdtblSubmain'],
      maxTables: 2,
      onRow({ cells, headers, rowIndex, tableIndex }) {
        if (rowIndex === 0 || !cells[0]) return;

        const teamName = normalizeTeamShortName(cells[0]);
        const team = teams.find(item => item.name === teamName) ?? {
          name: teamName,
          vs: {},
          interleague: {},
        };
        if (!teams.includes(team)) teams.push(team);

        headers.forEach((header, index) => {
          const opponent = parseOpponentHeader(header);
          if (!opponent) return;

          const value = normalizeHeadtoHeadValue(cells[index]);
          if (!value) return;
          if (tableIndex === 0) {
            team.vs[opponent] = value;
          } else {
            team.interleague[opponent] = value;
          }
        });
      },
    });

    const data = { league, year, teams };
    await putCachedJson(env, cacheKey, data, getYearAwareTtl(year, 1800), request);
    return Response.json(data);
  } catch (err) {
    return Response.json(
      { error: '対戦成績の取得に失敗しました', detail: err.message },
      { status: 502 },
    );
  }
}

// ─── OGP SVG ────────────────────────────────────────────────
function getTeamColor(teamName) {
  return getTeamPrimaryColor(teamName, '#334155');
}

function renderStandingsSvg(data, league) {
  const label = LEAGUE_LABELS[league] ?? league;
  const teams = (data.teams ?? []).slice(0, 12);
  const year = data.year ?? getCurrentYear();
  const compact = teams.length > 6;
  const startY = compact ? 164 : 178;
  const rowStep = compact ? 34 : 58;
  const rowHeight = compact ? 28 : 46;
  const rankFontSize = compact ? 18 : 24;
  const teamFontSize = compact ? 19 : 26;
  const statFontSize = compact ? 18 : 22;
  const circleRadius = compact ? 10 : 14;
  const rows = teams.length === 0 ? `
      <text x="600" y="340" font-size="32" font-weight="700" text-anchor="middle" fill="#64748b">順位データがありません</text>` : teams.map((team, index) => {
    const y = startY + index * rowStep;
    const color = getTeamColor(team.name);
    return `
      <g>
        <rect x="86" y="${y - 24}" width="1028" height="${rowHeight}" rx="10" fill="#ffffff" opacity="${index % 2 === 0 ? '0.98' : '0.9'}"/>
        <circle cx="118" cy="${y - 10}" r="${circleRadius}" fill="${color}"/>
        <text x="150" y="${y - 3}" font-size="${rankFontSize}" font-weight="700" fill="#0f172a">${escapeXml(team.rank)}</text>
        <text x="214" y="${y - 3}" font-size="${teamFontSize}" font-weight="700" fill="#0f172a">${escapeXml(team.name)}</text>
        <text x="760" y="${y - 3}" font-size="${statFontSize}" fill="#334155">勝 ${escapeXml(team.win)}</text>
        <text x="870" y="${y - 3}" font-size="${statFontSize}" fill="#334155">敗 ${escapeXml(team.lose)}</text>
        <text x="980" y="${y - 3}" font-size="${statFontSize}" fill="#334155">差 ${escapeXml(team.gamesBehind)}</text>
      </g>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="${escapeXml(label)}順位表">
  <rect width="1200" height="630" fill="#f4f6f9"/>
  <rect x="0" y="0" width="1200" height="120" fill="#0a1628"/>
  <rect x="0" y="120" width="1200" height="510" fill="#e8eef8"/>
  <text x="86" y="74" font-size="42" font-weight="800" fill="#ffffff">${escapeXml(label)} 順位表</text>
  <text x="1008" y="74" font-size="26" font-weight="700" text-anchor="end" fill="#c7d2fe">${escapeXml(year)}年</text>
  <text x="86" y="142" font-size="18" font-weight="700" fill="#475569">順位</text>
  <text x="214" y="142" font-size="18" font-weight="700" fill="#475569">チーム名</text>
  <text x="760" y="142" font-size="18" font-weight="700" fill="#475569">勝</text>
  <text x="870" y="142" font-size="18" font-weight="700" fill="#475569">敗</text>
  <text x="980" y="142" font-size="18" font-weight="700" fill="#475569">差</text>
  ${rows}
  <text x="86" y="584" font-size="24" font-weight="800" fill="#e8392a">NPB</text>
  <text x="150" y="584" font-size="20" fill="#334155">npbinfo.kusanaginoturugi.workers.dev</text>
</svg>`;
}

function renderErrorSvg(message) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="データ取得エラー">
  <rect width="1200" height="630" fill="#b91c1c"/>
  <text x="600" y="288" font-size="54" font-weight="800" text-anchor="middle" fill="#ffffff">データ取得エラー</text>
  <text x="600" y="342" font-size="24" text-anchor="middle" fill="#fee2e2">${escapeXml(message)}</text>
  <text x="600" y="420" font-size="22" text-anchor="middle" fill="#ffffff">npbinfo.kusanaginoturugi.workers.dev</text>
</svg>`;
}

async function handleStandingsOg(league, request, env) {
  if (!VALID_LEAGUES.has(league)) {
    return new Response('Not Found', { status: 404 });
  }

  const headers = {
    'Content-Type': 'image/svg+xml; charset=utf-8',
    'Cache-Control': 'public, max-age=300',
  };

  if (request.method === 'HEAD') {
    return new Response(null, { headers });
  }

  try {
    const res = await handleStandings(league, request, env);
    if (!res.ok) throw new Error(`standings ${res.status}`);

    const data = await res.json();
    return new Response(renderStandingsSvg(data, league), { headers });
  } catch (err) {
    return new Response(renderErrorSvg(err.message), { headers });
  }
}

const PNG_WIDTH = 1200;
const PNG_HEIGHT = 630;

// Browser Rendering で生成した OGP PNG が KV に存在しない場合だけ使う最小フォールバック。
// SNS クローラ向けに 404/500 ではなく最低限の PNG を返すための保険で、
// 表現改善や日本語描画の追加は og-worker 側で行う。
const OGP_LEAGUE_LABELS = {
  cl: 'CENTRAL',
  pl: 'PACIFIC',
  cp: 'INTERLEAGUE',
  op: 'OPEN',
};

const BITMAP_FONT = {
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  '-': ['00000', '00000', '00000', '11110', '00000', '00000', '00000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
  ':': ['00000', '01100', '01100', '00000', '01100', '01100', '00000'],
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '11100'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01110'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
};

let crcTable;

function getCrcTable() {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[n] = c >>> 0;
  }
  return crcTable;
}

function crc32(bytes) {
  const table = getCrcTable();
  let c = 0xffffffff;
  for (const byte of bytes) c = table[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(bytes) {
  let a = 1;
  let b = 0;
  for (const byte of bytes) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function writeUint32(bytes, offset, value) {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

function pngChunk(type, data = new Uint8Array()) {
  const typeBytes = new TextEncoder().encode(type);
  const chunk = new Uint8Array(12 + data.length);
  writeUint32(chunk, 0, data.length);
  chunk.set(typeBytes, 4);
  chunk.set(data, 8);
  writeUint32(chunk, 8 + data.length, crc32(chunk.subarray(4, 8 + data.length)));
  return chunk;
}

function zlibStore(data) {
  const blockCount = Math.ceil(data.length / 65535);
  const out = new Uint8Array(2 + data.length + blockCount * 5 + 4);
  let offset = 0;
  out[offset++] = 0x78;
  out[offset++] = 0x01;
  for (let pos = 0; pos < data.length; pos += 65535) {
    const length = Math.min(65535, data.length - pos);
    const final = pos + length >= data.length;
    out[offset++] = final ? 1 : 0;
    out[offset++] = length & 0xff;
    out[offset++] = (length >>> 8) & 0xff;
    const nlen = (~length) & 0xffff;
    out[offset++] = nlen & 0xff;
    out[offset++] = (nlen >>> 8) & 0xff;
    out.set(data.subarray(pos, pos + length), offset);
    offset += length;
  }
  writeUint32(out, offset, adler32(data));
  return out;
}

function concatBytes(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function parseHexColor(hex) {
  const value = String(hex).replace('#', '');
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
    255,
  ];
}

function createPngCanvas(width, height, background) {
  const pixels = new Uint8Array(width * height * 4);
  const color = parseHexColor(background);
  for (let i = 0; i < pixels.length; i += 4) pixels.set(color, i);
  return { width, height, pixels };
}

function setPixel(canvas, x, y, color) {
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;
  canvas.pixels.set(color, (y * canvas.width + x) * 4);
}

function fillRect(canvas, x, y, width, height, hex) {
  const color = parseHexColor(hex);
  for (let yy = Math.max(0, y); yy < Math.min(canvas.height, y + height); yy += 1) {
    for (let xx = Math.max(0, x); xx < Math.min(canvas.width, x + width); xx += 1) {
      setPixel(canvas, xx, yy, color);
    }
  }
}

function fillCircle(canvas, cx, cy, radius, hex) {
  const color = parseHexColor(hex);
  const r2 = radius * radius;
  for (let y = cy - radius; y <= cy + radius; y += 1) {
    for (let x = cx - radius; x <= cx + radius; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) setPixel(canvas, x, y, color);
    }
  }
}

function textWidth(text, scale) {
  return String(text).length * 6 * scale;
}

function drawText(canvas, text, x, y, scale, hex) {
  const color = parseHexColor(hex);
  const chars = String(text).toUpperCase();
  let cursor = x;
  for (const char of chars) {
    const glyph = BITMAP_FONT[char] ?? BITMAP_FONT[' '];
    glyph.forEach((row, rowIndex) => {
      for (let colIndex = 0; colIndex < row.length; colIndex += 1) {
        if (row[colIndex] !== '1') continue;
        for (let yy = 0; yy < scale; yy += 1) {
          for (let xx = 0; xx < scale; xx += 1) {
            setPixel(canvas, cursor + colIndex * scale + xx, y + rowIndex * scale + yy, color);
          }
        }
      }
    });
    cursor += 6 * scale;
  }
}

function makePng(canvas) {
  const raw = new Uint8Array((canvas.width * 4 + 1) * canvas.height);
  let offset = 0;
  for (let y = 0; y < canvas.height; y += 1) {
    raw[offset++] = 0;
    raw.set(canvas.pixels.subarray(y * canvas.width * 4, (y + 1) * canvas.width * 4), offset);
    offset += canvas.width * 4;
  }
  const ihdr = new Uint8Array(13);
  writeUint32(ihdr, 0, canvas.width);
  writeUint32(ihdr, 4, canvas.height);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  return concatBytes([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlibStore(raw)),
    pngChunk('IEND'),
  ]);
}

function getOgpTeamCode(name) {
  return getTeamOgpCode(name);
}

function renderStandingsPng(data, league) {
  const canvas = createPngCanvas(PNG_WIDTH, PNG_HEIGHT, '#f4f6f9');
  fillRect(canvas, 0, 0, PNG_WIDTH, 120, '#0a1628');
  fillRect(canvas, 0, 120, PNG_WIDTH, 510, '#e8eef8');

  const label = OGP_LEAGUE_LABELS[league] ?? 'NPB';
  const year = String(data.year ?? getCurrentYear());
  drawText(canvas, `NPBINFO ${label}`, 86, 42, 6, '#ffffff');
  drawText(canvas, `${year} STANDINGS`, 820, 52, 4, '#c7d2fe');
  drawText(canvas, 'RANK', 86, 138, 3, '#475569');
  drawText(canvas, 'TEAM', 214, 138, 3, '#475569');
  drawText(canvas, 'WIN', 760, 138, 3, '#475569');
  drawText(canvas, 'LOSE', 870, 138, 3, '#475569');
  drawText(canvas, 'GB', 1000, 138, 3, '#475569');

  const teams = (data.teams ?? []).slice(0, 12);
  if (!teams.length) {
    drawText(canvas, 'NO STANDINGS DATA', 360, 306, 5, '#64748b');
  } else {
    const compact = teams.length > 6;
    const startY = compact ? 164 : 178;
    const rowStep = compact ? 34 : 58;
    const rowHeight = compact ? 28 : 46;
    const textScale = compact ? 3 : 4;
    teams.forEach((team, index) => {
      const y = startY + index * rowStep;
      fillRect(canvas, 86, y - 24, 1028, rowHeight, index % 2 === 0 ? '#ffffff' : '#f8fafc');
      fillCircle(canvas, 118, y - 10, compact ? 10 : 14, getTeamColor(team.name));
      drawText(canvas, String(team.rank ?? index + 1), 150, y - 20, textScale, '#0f172a');
      drawText(canvas, getOgpTeamCode(team.name), 214, y - 20, textScale, '#0f172a');
      drawText(canvas, String(team.win ?? '-'), 760, y - 20, textScale, '#334155');
      drawText(canvas, String(team.lose ?? '-'), 870, y - 20, textScale, '#334155');
      drawText(canvas, String(team.gamesBehind ?? '-'), 980, y - 20, textScale, '#334155');
    });
  }

  drawText(canvas, 'NPB', 86, 560, 5, '#e8392a');
  drawText(canvas, 'NPBINFO.KUSANAGINOTURUGI.WORKERS.DEV', 190, 570, 3, '#334155');
  return makePng(canvas);
}

function renderErrorPng(message) {
  const canvas = createPngCanvas(PNG_WIDTH, PNG_HEIGHT, '#b91c1c');
  drawText(canvas, 'DATA FETCH ERROR', 300, 260, 6, '#ffffff');
  drawText(canvas, String(message ?? 'UNKNOWN ERROR').slice(0, 32), 240, 340, 4, '#fee2e2');
  return makePng(canvas);
}

async function handleStandingsOgPng(league, request, env) {
  if (!VALID_LEAGUES.has(league)) {
    return new Response('Not Found', { status: 404 });
  }

  const headers = {
    'Content-Type': 'image/png',
    'Cache-Control': 'public, max-age=300',
  };

  if (env.CACHE) {
    try {
      const generated = await env.CACHE.getWithMetadata(
        `og:standings:${league}:png`,
        'arrayBuffer',
      );
      if (generated.value) {
        headers['X-OGP-Source'] = 'browser-run';
        if (generated.metadata?.generatedAt) {
          headers['X-OGP-Generated-At'] = generated.metadata.generatedAt;
        }
        return new Response(request.method === 'HEAD' ? null : generated.value, { headers });
      }
    } catch (err) {
      console.error(`Failed to read generated OGP for ${league}: ${err.message}`);
    }
  }

  headers['X-OGP-Source'] = 'bitmap-fallback';

  if (request.method === 'HEAD') {
    return new Response(null, { headers });
  }

  try {
    const res = await handleStandings(league, request, env);
    if (!res.ok) throw new Error(`standings ${res.status}`);

    const data = await res.json();
    return new Response(renderStandingsPng(data, league), { headers });
  } catch (err) {
    return new Response(renderErrorPng(err.message), { headers });
  }
}

// ─── 選手成績 ─────────────────────────────────────────────────
// 2026年度以降のテーブル構造に対応
const BATTING_FIELDS = {
  0: 'rank', 1: 'name_raw', 2: 'avg', 3: 'games',
  7: 'hits', 10: 'hr', 12: 'rbi', 13: 'sb',
  22: 'slg', 23: 'obp',
};

// 2024年度以前のテーブル構造に対応
const BATTING_FIELDS_LEGACY = {
  0: 'rank', 1: 'name', 2: 'team', 3: 'avg', 4: 'games',
  8: 'hits', 11: 'hr', 13: 'rbi', 14: 'sb',
  23: 'slg', 24: 'obp',
};

const PITCHING_FIELDS = {
  0: 'rank', 1: 'name_raw', 2: 'era', 3: 'games',
  4: 'wins', 5: 'losses', 6: 'saves',
  14: 'ip', 20: 'so',
};

const PITCHING_FIELDS_LEGACY = {
  0: 'rank', 1: 'name', 2: 'team', 3: 'era', 4: 'games',
  5: 'wins', 6: 'losses', 7: 'saves',
  15: 'ip', 22: 'so',
};

function mapCells(cells, fields) {
  const obj = {};
  for (const [idx, field] of Object.entries(fields)) {
    obj[field] = cells[idx] ?? '-';
  }
  
  // 名前とチームの分離 (例: "佐藤　輝明(神)" -> name: "佐藤　輝明", team: "神")
  if (obj.name_raw) {
    const match = obj.name_raw.match(/^(.*?)\((.*?)\)$/);
    if (match) {
      obj.name = match[1].trim();
      obj.team = match[2].trim();
    } else {
      obj.name = obj.name_raw;
      obj.team = '-';
    }
    delete obj.name_raw;
  }

  // チーム名の括弧除去 (例: "(神)" -> "神")
  if (obj.team) {
    obj.team = obj.team.replace(/[()（）]/g, '').trim();
  }
  
  return obj;
}

function buildRewriter(players, fields, isLegacy = false) {
  let inTable = false;
  let isTargetRow = false;
  let rowIndex = 0;
  let cells = [];
  let cellText = '';

  const rewriter = new HTMLRewriter();

  if (isLegacy) {
    // 2024以前: table classなし、tr class="ststats"
    rewriter.on('tr', {
      element(el) {
        const className = el.getAttribute('class') ?? '';
        if (className === 'ststats') {
          inTable = true;
          isTargetRow = true;
          cells = [];
        } else {
          isTargetRow = false;
        }
        el.onEndTag(() => {
          if (isTargetRow && cells.length > 0) {
            players.push(mapCells(cells, fields));
          }
          inTable = false;
          isTargetRow = false;
        });
      }
    });
  } else {
    // 2026+: NpbSt または tablefix2
    rewriter.on('table', {
      element(el) {
        const className = el.getAttribute('class') ?? '';
        inTable = className.includes('NpbSt') || className.includes('tablefix2');
        if (inTable) rowIndex = 0;
        el.onEndTag(() => { inTable = false; });
      },
    }).on('tr', {
      element(el) {
        if (!inTable) return;
        cells = [];
        el.onEndTag(() => {
          if (!inTable) return;
          // ヘッダー行 (rowIndex 0) をスキップ
          if (rowIndex > 0 && cells.length >= 4 && cells[1]) {
            players.push(mapCells(cells, fields));
          }
          rowIndex++;
        });
      },
    });
  }

  // td handling is same for both
  rewriter.on('td', {
    element(el) {
      if (!inTable) return;
      cellText = '';
      el.onEndTag(() => {
        if (!inTable) return;
        cells.push(cellText.replace(/\s+/g, ' ').trim());
      });
    },
    text(chunk) {
      if (!inTable) return;
      cellText += chunk.text;
    },
  });

  return rewriter;
}

async function handleStats(type, league, request, env) {
  if (!['batting', 'pitching'].includes(type) || !['cl', 'pl'].includes(league)) {
    return new Response('Not Found', { status: 404 });
  }

  const year = getYear(request.url);
  const cacheKey = `stats:${type}:${league}:${year}`;
  const cached = await getCachedJson(env, cacheKey, request);
  if (cached) return Response.json(cached);

  const isLegacy = year <= 2024;
  const leagueCode = league === 'cl' ? 'c' : 'p';
  const prefix = type === 'batting' ? 'bat' : 'pit';
  const url = `https://npb.jp/bis/${year}/stats/${prefix}_${leagueCode}.html`;
  
  let fields;
  if (type === 'batting') {
    fields = isLegacy ? BATTING_FIELDS_LEGACY : BATTING_FIELDS;
  } else {
    fields = isLegacy ? PITCHING_FIELDS_LEGACY : PITCHING_FIELDS;
  }

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'ja,en;q=0.9',
      },
    });
    if (!res.ok) {
      throw new Error(`npb.jp returned ${res.status} for URL: ${url}`);
    }

    const players = [];
    await buildRewriter(players, fields, isLegacy).transform(res).text();

    const data = { league, type, year, players };
    await putCachedJson(env, cacheKey, data, getYearAwareTtl(year, 1800), request);
    return Response.json(data);
  } catch (err) {
    return Response.json(
      { error: 'データの取得に失敗しました', detail: err.message },
      { status: 502 }
    );
  }
}

// ─── 試合日程・結果 ───────────────────────────────────────────
function getGameStatus(game) {
  if (game.comment.includes('中止')) return '中止';
  if (game.homeScore !== null && game.awayScore !== null) return '終了';
  return '試合前';
}

const KOSHIEN_URL = 'https://koshien.hanshin.co.jp/';

async function fetchKoshienCancellation() {
  const res = await fetch(KOSHIEN_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept-Language': 'ja,en;q=0.9',
    },
  });
  if (!res.ok) throw new Error(`koshien.hanshin.co.jp returned ${res.status}`);

  const notice = { title: '', date: '', text: '' };
  let currentField = null;
  function collect(field) {
    return {
      element(el) {
        currentField = field;
        el.onEndTag(() => {
          notice[field] = normalizeText(notice[field]);
          currentField = null;
        });
      },
      text(chunk) {
        if (currentField === field) notice[field] += chunk.text;
      },
    };
  }

  await new HTMLRewriter()
    .on('dl.info-notice dt', collect('title'))
    .on('dl.info-notice span.date', collect('date'))
    .on('dl.info-notice span.text', collect('text'))
    .transform(res)
    .text();

  const dateMatch = notice.date.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (!notice.title.includes('試合中止') || !dateMatch || !notice.text.includes('中止')) {
    return null;
  }
  return {
    date: `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`,
    text: notice.text,
    sourceUrl: KOSHIEN_URL,
  };
}

function applyKoshienCancellation(games, cancellation) {
  if (!cancellation) return;
  for (const game of games) {
    const isTarget = game.date === cancellation.date
      && game.homeTeam.includes('阪神')
      && game.stadium.replace(/\s+/g, '').includes('甲子園')
      && cancellation.text.includes(game.awayTeam);
    if (!isTarget || game.status === '終了') continue;

    game.status = '中止';
    game.comment = cancellation.text;
    game.statusSource = '甲子園公式';
    game.statusSourceUrl = cancellation.sourceUrl;
  }
}

async function handleSchedule(monthParam, request, env) {
  const match = monthParam?.match(/^(\d{4})-(\d{2})$/);
  if (!match) {
    return new Response('Not Found', { status: 404 });
  }

  const year = parseInt(match[1], 10);
  const monthNumber = parseInt(match[2], 10);
  const month = match[2];
  if (!getAvailableYears().includes(year) || monthNumber < 1 || monthNumber > 12) {
    return new Response('Not Found', { status: 404 });
  }

  const cacheKey = `schedule:v2:${year}-${month}`;
  const cached = await getCachedJson(env, cacheKey, request);
  if (cached) return Response.json(cached);

  const url = `https://npb.jp/games/${year}/schedule_${month}_detail.html`;

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'ja,en;q=0.9',
      },
    });
    if (!res.ok) throw new Error(`npb.jp returned ${res.status} for URL: ${url}`);

    const games = [];
    const koshienCancellationPromise = monthParam === getTokyoDateValue().slice(0, 7)
      ? fetchKoshienCancellation().catch((err) => {
        console.warn(`Koshien cancellation fetch failed: ${err.message}`);
        return null;
      })
      : Promise.resolve(null);
    let currentGame = null;
    let currentField = null;

    function appendText(chunk) {
      if (!currentGame || !currentField) return;
      currentGame[currentField] += chunk.text;
    }

    function enterTextField(field) {
      return {
        element(el) {
          if (!currentGame) return;
          currentField = field;
          el.onEndTag(() => {
            if (currentGame) currentGame[field] = normalizeText(currentGame[field]);
            currentField = null;
          });
        },
        text: appendText,
      };
    }

    await new HTMLRewriter()
      .on('tr', {
        element(el) {
          const id = el.getAttribute('id') ?? '';
          const dateMatch = id.match(/^date(\d{2})(\d{2})$/);
          if (!dateMatch) return;

          currentGame = {
            date: `${year}-${dateMatch[1]}-${dateMatch[2]}`,
            homeTeam: '',
            awayTeam: '',
            homeScore: '',
            awayScore: '',
            stadium: '',
            startTime: '',
            comment: '',
            scoreUrl: null,
          };

          el.onEndTag(() => {
            if (!currentGame) return;
            if (currentGame.homeTeam && currentGame.awayTeam) {
              currentGame.homeScore = currentGame.homeScore === '' ? null : currentGame.homeScore;
              currentGame.awayScore = currentGame.awayScore === '' ? null : currentGame.awayScore;
              currentGame.status = getGameStatus(currentGame);
              games.push(currentGame);
            }
            currentGame = null;
          });
        },
      })
      .on('a', {
        element(el) {
          if (!currentGame || currentGame.scoreUrl) return;
          const href = el.getAttribute('href') ?? '';
          if (href.startsWith('/scores/')) {
            currentGame.scoreUrl = new URL(href, 'https://npb.jp').toString();
          }
        },
      })
      .on('div.team1', enterTextField('homeTeam'))
      .on('div.team2', enterTextField('awayTeam'))
      .on('div.score1', enterTextField('homeScore'))
      .on('div.score2', enterTextField('awayScore'))
      .on('div.place', enterTextField('stadium'))
      .on('div.time', enterTextField('startTime'))
      .on('div.comment', enterTextField('comment'))
      .transform(res)
      .text();

    applyKoshienCancellation(games, await koshienCancellationPromise);
    const data = { year, month, games };
    await putCachedJson(env, cacheKey, data, getScheduleTtl(year, monthNumber), request);
    return Response.json(data);
  } catch (err) {
    return Response.json(
      { error: '試合日程の取得に失敗しました', detail: err.message },
      { status: 502 }
    );
  }
}

// ─── 天気予報 ─────────────────────────────────────────────────
function parseCoordinate(value, min, max) {
  if (value === null || value.trim() === '') return null;

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

async function handleWeather(request, env) {
  const url = new URL(request.url);
  const lat = parseCoordinate(url.searchParams.get('lat'), -90, 90);
  const lng = parseCoordinate(url.searchParams.get('lng'), -180, 180);
  const date = url.searchParams.get('date') ?? '';

  if (lat === null || lng === null || !isValidDateValue(date)) {
    return Response.json(
      { error: '不正なパラメータです', detail: 'lat/lng/date を確認してください' },
      { status: 400 },
    );
  }

  const latValue = String(lat);
  const lngValue = String(lng);
  const cacheKey = `weather:${latValue},${lngValue}:${date}`;
  const cached = await getCachedJson(env, cacheKey, request);
  if (cached) return Response.json(cached);

  const isPast = date < getTokyoDateValue();
  const endpoint = isPast
    ? 'https://archive-api.open-meteo.com/v1/archive'
    : 'https://api.open-meteo.com/v1/forecast';
  const daily = isPast
    ? 'weather_code,temperature_2m_max,temperature_2m_min'
    : 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max';
  const weatherUrl = new URL(endpoint);
  weatherUrl.searchParams.set('latitude', latValue);
  weatherUrl.searchParams.set('longitude', lngValue);
  weatherUrl.searchParams.set('daily', daily);
  weatherUrl.searchParams.set('timezone', 'Asia/Tokyo');
  weatherUrl.searchParams.set('start_date', date);
  weatherUrl.searchParams.set('end_date', date);

  try {
    const res = await fetch(weatherUrl.toString(), {
      headers: { 'User-Agent': 'npbinfo-app/1.0' },
    });
    if (!res.ok) throw new Error(`open-meteo returned ${res.status}`);

    const json = await res.json();
    const dailyData = json.daily ?? {};
    const data = {
      date,
      weatherCode: dailyData.weather_code?.[0] ?? null,
      tempMax: dailyData.temperature_2m_max?.[0] ?? null,
      tempMin: dailyData.temperature_2m_min?.[0] ?? null,
      precipitationProb: dailyData.precipitation_probability_max?.[0] ?? null,
    };

    await putCachedJson(env, cacheKey, data, isPast ? null : 1800, request);
    return Response.json(data);
  } catch (err) {
    return Response.json(
      { error: '天気予報の取得に失敗しました', detail: err.message },
      { status: 502 },
    );
  }
}

// ─── 直近5試合の勝敗 ─────────────────────────────────────────
async function handleRecent(league, request, env) {
  if (!['cl', 'pl'].includes(league)) {
    return new Response('Not Found', { status: 404 });
  }

  const year = getYear(request.url);
  const cacheKey = `recent:${league}:${year}`;
  const cached = await getCachedJson(env, cacheKey, request);
  if (cached) return Response.json(cached);

  const currentYear = getCurrentYear();
  let endMonth;
  if (year < currentYear) {
    endMonth = 12; // 過去年は12月まで取得
  } else {
    // 現在年は現在の月まで取得
    const tokyoDate = getTokyoDateValue();
    endMonth = parseInt(tokyoDate.split('-')[1], 10);
  }

  const clTeams = ['阪神', 'DeNA', '巨人', '広島', '中日', 'ヤクルト'];
  const plTeams = ['オリックス', 'ロッテ', 'ソフトバンク', '楽天', '西武', '日本ハム'];
  const targetTeams = league === 'cl' ? clTeams : plTeams;

  // 3月からendMonthまで schedule を順次取得
  const allGames = [];
  for (let m = 3; m <= endMonth; m++) {
    const monthStr = String(m).padStart(2, '0');
    const monthParam = `${year}-${monthStr}`;
    try {
      const res = await handleSchedule(monthParam, request, env);
      if (res.ok) {
        const data = await res.json();
        if (data && data.games) {
          allGames.push(...data.games);
        }
      }
    } catch (err) {
      console.error(`Failed to fetch schedule for ${monthParam}: ${err.message}`);
    }
  }

  // 終了試合をチームごとに集約
  const teamsRecent = {};
  for (const team of targetTeams) {
    teamsRecent[team] = [];
  }

  // 日付順にソート
  allGames.sort((a, b) => a.date.localeCompare(b.date));

  for (const game of allGames) {
    if (game.status !== '終了') continue;

    const home = normalizeTeamShortName(game.homeTeam);
    const away = normalizeTeamShortName(game.awayTeam);
    const homeScore = parseInt(game.homeScore, 10);
    const awayScore = parseInt(game.awayScore, 10);

    if (isNaN(homeScore) || isNaN(awayScore)) continue;

    if (teamsRecent[home] !== undefined) {
      let won = null;
      if (homeScore > awayScore) won = true;
      else if (homeScore < awayScore) won = false;

      teamsRecent[home].push({
        date: game.date,
        vsTeam: away,
        won
      });
    }

    if (teamsRecent[away] !== undefined) {
      let won = null;
      if (awayScore > homeScore) won = true;
      else if (awayScore < homeScore) won = false;

      teamsRecent[away].push({
        date: game.date,
        vsTeam: home,
        won
      });
    }
  }

  // 各チームの最後の5試合を「古い順（時系列順）」で抽出
  const resultTeams = {};
  for (const team of targetTeams) {
    const games = teamsRecent[team];
    resultTeams[team] = games.slice(-5);
  }

  const resultData = { league, year, teams: resultTeams };
  await putCachedJson(env, cacheKey, resultData, getYearAwareTtl(year, 600), request);
  return Response.json(resultData);
}

// ─── AIコメント ───────────────────────────────────────────────
// 生成は自宅マシン側のバッチ（scripts/generate-ai-comments.sh）が行い、
// ここは D1 への保存（push）と読み出しだけを担当する。
const AI_SUBJECT_TYPES = new Set(['team', 'player', 'weekly', 'stats', 'schedule']);
const AI_CONTENT_MAX_LENGTH = 4000;

async function handleAiCommentGet(subjectType, subjectKey, request, env) {
  if (!AI_SUBJECT_TYPES.has(subjectType) || !subjectKey) {
    return Response.json({ error: 'invalid subject' }, { status: 400 });
  }
  if (!hasD1(env)) return Response.json({ comment: null });

  const url = new URL(request.url);
  const year = Number.parseInt(url.searchParams.get('year') || String(getCurrentYear()), 10);
  try {
    const result = await env.DB.prepare(`
      SELECT content, model, persona, generated_at
      FROM ai_comments
      WHERE subject_type = ?1
        AND subject_key = ?2
        AND year = ?3
      ORDER BY generated_at DESC
      LIMIT 1
    `).bind(subjectType, subjectKey, year).all();
    const row = result.results?.[0];
    return Response.json(
      {
        comment: row
          ? {
            content: row.content,
            model: row.model,
            persona: row.persona ?? null,
            generatedAt: row.generated_at,
          }
          : null,
      },
      { headers: { 'Cache-Control': 'public, max-age=900' } },
    );
  } catch (err) {
    console.warn(`AI comment read failed for ${subjectType}:${subjectKey}: ${err.message}`);
    return Response.json({ comment: null });
  }
}

function validateAiCommentItem(item) {
  if (!item || typeof item !== 'object') return 'item must be an object';
  if (!AI_SUBJECT_TYPES.has(item.subjectType)) return `invalid subjectType: ${item.subjectType}`;
  if (typeof item.subjectKey !== 'string' || !item.subjectKey) return 'subjectKey is required';
  if (!Number.isInteger(item.year)) return 'year must be an integer';
  if (typeof item.content !== 'string' || !item.content.trim()) return 'content is required';
  if (item.content.length > AI_CONTENT_MAX_LENGTH) return `content exceeds ${AI_CONTENT_MAX_LENGTH} chars`;
  if (typeof item.model !== 'string' || !item.model) return 'model is required';
  if (item.persona != null && (typeof item.persona !== 'string' || item.persona.length > 100)) {
    return 'persona must be a short string';
  }
  return null;
}

async function handleAiCommentIngest(request, env) {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }
  if (!isRefreshAuthorized(request, env)) {
    return new Response('Unauthorized', { status: 401 });
  }
  if (!hasD1(env)) {
    return Response.json({ ok: false, error: 'D1 unavailable' }, { status: 503 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: 'invalid JSON body' }, { status: 400 });
  }

  const items = Array.isArray(body?.items) ? body.items : [body];
  for (const item of items) {
    const error = validateAiCommentItem(item);
    if (error) return Response.json({ ok: false, error }, { status: 400 });
  }

  const generatedAt = new Date().toISOString();
  try {
    await env.DB.batch(items.map(item => env.DB.prepare(`
      INSERT OR REPLACE INTO ai_comments (
        subject_type,
        subject_key,
        year,
        content,
        model,
        persona,
        generated_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
    `).bind(
      item.subjectType,
      item.subjectKey,
      item.year,
      item.content.trim(),
      item.model,
      item.persona ?? null,
      generatedAt,
    )));
    return Response.json({ ok: true, stored: items.length, generatedAt });
  } catch (err) {
    return Response.json(
      { ok: false, error: 'D1 write failed', detail: err.message },
      { status: 500 },
    );
  }
}

// ─── ルーター ─────────────────────────────────────────────────
export default {
  async scheduled(controller, env) {
    try {
      await refreshScheduledStandings(controller ?? { cron: '' }, env);
    } catch (err) {
      console.error(`Scheduled handler failed: ${err.message}`);
      controller?.noRetry?.();
    }
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    const segments = url.pathname.split('/').filter(Boolean);

    // /api/debug
    if (segments[0] === 'api' && segments[1] === 'debug') {
      return jsonNoStore({
        ...BUILD_INFO,
        now: new Date().toISOString(),
      });
    }

    // /api/admin/refresh/standings?year=YYYY&league=cl
    if (segments[0] === 'api' && segments[1] === 'admin' && segments[2] === 'refresh' && segments[3] === 'standings') {
      return handleRefreshStandings(request, env);
    }

    // /api/park-factors/hr
    if (segments[0] === 'api' && segments[1] === 'park-factors' && segments[2] === 'hr') {
      return Response.json({
        meta: HR_PARK_FACTOR_META,
        parks: HR_PARK_FACTORS,
      });
    }

    // /api/recent/:league?year=YYYY
    if (segments[0] === 'api' && segments[1] === 'recent' && segments[2]) {
      return handleRecent(segments[2], request, env);
    }

    // /api/threads?team=...
    if (segments[0] === 'api' && segments[1] === 'threads') {
      return handleThreads(request, env);
    }

    // /api/standings/:league?year=YYYY
    if (segments[0] === 'api' && segments[1] === 'standings' && segments[2]) {
      return handleStandings(segments[2], request, env);
    }

    // /api/headtohead/:league?year=YYYY
    if (segments[0] === 'api' && segments[1] === 'headtohead' && segments[2]) {
      return handleHeadToHead(segments[2], request, env);
    }

    // /api/stats/:type/:league?year=YYYY
    if (segments[0] === 'api' && segments[1] === 'stats' && segments[2] && segments[3]) {
      return handleStats(segments[2], segments[3], request, env);
    }

    // /api/schedule/YYYY-MM
    if (segments[0] === 'api' && segments[1] === 'schedule' && segments[2]) {
      return handleSchedule(segments[2], request, env);
    }

    // /api/weather?lat=..&lng=..&date=YYYY-MM-DD
    if (segments[0] === 'api' && segments[1] === 'weather') {
      return handleWeather(request, env);
    }

    // POST /api/ai/comments（保存） / GET /api/ai/comments/:type/:key?year=YYYY（取得）
    if (segments[0] === 'api' && segments[1] === 'ai' && segments[2] === 'comments') {
      if (!segments[3]) return handleAiCommentIngest(request, env);
      if (segments[4]) return handleAiCommentGet(segments[3], segments[4], request, env);
      return Response.json({ error: 'not found' }, { status: 404 });
    }

    // /og/standings/:league.png
    if (segments[0] === 'og' && segments[1] === 'standings' && segments[2]?.endsWith('.png')) {
      return handleStandingsOgPng(segments[2].replace(/\.png$/, ''), request, env);
    }

    // /og/standings/:league
    if (segments[0] === 'og' && segments[1] === 'standings' && segments[2]) {
      return handleStandingsOg(segments[2], request, env);
    }

    // その他は dist/ の静的アセット（Workers Static Assets）
    return env.ASSETS.fetch(request);
  },
};
