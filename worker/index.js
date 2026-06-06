// Cloudflare Worker エントリポイント
// - /api/standings/:league    → npb.jp HTMLRewriter スクレイピング
// - /api/stats/:type/:league  → npb.jp HTMLRewriter スクレイピング
// - /api/schedule/:month      → npb.jp 試合日程スクレイピング
// - /api/weather              → Open-Meteo 天気予報プロキシ
// - /api/headtohead/:league   → チーム間対戦成績スクレイピング
// - /og/standings/:league     → 順位表 OGP SVG
// - その他                    → dist/ の静的アセットを返す

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

async function getCachedJson(env, key, request) {
  if (skipCache(request) || !env.CACHE) return null;

  try {
    return await env.CACHE.get(key, 'json');
  } catch (err) {
    console.warn(`KV get failed for ${key}: ${err.message}`);
    return null;
  }
}

async function putCachedJson(env, key, data, ttl, request) {
  if (skipCache(request) || !env.CACHE) return;

  try {
    const options = ttl == null ? {} : { expirationTtl: ttl };
    await env.CACHE.put(key, JSON.stringify(data), options);
  } catch (err) {
    console.warn(`KV put failed for ${key}: ${err.message}`);
  }
}

function getScheduleTtl(year, month) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  if (year < currentYear || (year === currentYear && month < currentMonth)) return null;
  if (year === currentYear && month === currentMonth) return 300;
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

// ─── 順位表 ──────────────────────────────────────────────────
const VALID_LEAGUES = new Set(['cl', 'pl', 'cp', 'op']);

const LEAGUE_LABELS = {
  cl: 'セ・リーグ',
  pl: 'パ・リーグ',
  cp: '交流戦',
  op: 'オープン戦',
};

const TEAM_COLORS = {
  '阪神': '#FFE600',
  '横浜DeNA': '#003F8E',
  'DeNA': '#003F8E',
  '読売': '#F49C00',
  '巨人': '#F49C00',
  '広島': '#CC0000',
  '中日': '#0035AD',
  'ヤクルト': '#001943',
  'ソフトバンク': '#F3C945',
  '日本ハム': '#005496',
  'オリックス': '#000019',
  '楽天': '#870011',
  '西武': '#1F2D53',
  'ロッテ': '#000000',
};

const TEAM_SHORT_NAMES = {
  '神': '阪神',
  'ヤ': 'ヤクルト',
  '巨': '巨人',
  'デ': 'DeNA',
  '横浜DeNA': 'DeNA',
  '広': '広島',
  '中': '中日',
  '西': '西武',
  'オ': 'オリックス',
  'ソ': 'ソフトバンク',
  '日': '日本ハム',
  'ロ': 'ロッテ',
  '楽': '楽天',
  '阪神タイガース': '阪神',
  '東京ヤクルトスワローズ': 'ヤクルト',
  '読売ジャイアンツ': '巨人',
  '横浜DeNAベイスターズ': 'DeNA',
  '広島東洋カープ': '広島',
  '中日ドラゴンズ': '中日',
  '埼玉西武ライオンズ': '西武',
  'オリックス・バファローズ': 'オリックス',
  '福岡ソフトバンクホークス': 'ソフトバンク',
  '北海道日本ハムファイターズ': '日本ハム',
  '千葉ロッテマリーンズ': 'ロッテ',
  '東北楽天ゴールデンイーグルス': '楽天',
};

const STANDINGS_FIELDS = {
  0: 'name', 1: 'playGameCount', 2: 'win', 3: 'lose',
  4: 'draw', 5: 'pct', 6: 'gamesBehind',
};

function buildStandingsRewriter(teams, battingStats, pitchingStats, fieldingStats) {
  let inTable = false;
  let tableDepth = 0;
  let targetTableDepth = -1;
  let rowIndex = 0;
  let cells = [];
  let cellText = '';

  return new HTMLRewriter()
    .on('table', {
      element(el) {
        tableDepth++;
        if (targetTableDepth === -1) {
          const className = el.getAttribute('class') ?? '';
          if (className.includes('tablefix2') || className.includes('stdtblSubmain')) {
            inTable = true;
            targetTableDepth = tableDepth;
            rowIndex = 0;
          }
        }
        el.onEndTag(() => {
          if (tableDepth === targetTableDepth) {
            inTable = false;
            targetTableDepth = -1;
          }
          tableDepth--;
        });
      },
    })
    .on('tr', {
      element(el) {
        if (!inTable || tableDepth !== targetTableDepth) return;
        cells = [];
        el.onEndTag(() => {
          if (!inTable || tableDepth !== targetTableDepth) return;
          // チーム名（インデックス0）があることを確認
          if (cells.length >= 2 && cells[0] && !cells[0].includes('チーム') && !cells[0].includes('リーグ')) {
            const team = {};
            for (const [idx, field] of Object.entries(STANDINGS_FIELDS)) {
              team[field] = cells[idx] ?? '-';
            }
            team.name = normalizeTeamShortName(team.name);
            team.rank = teams.length + 1;

            // 追加成績をマージ
            const bStats = battingStats[team.name] || {};
            const pStats = pitchingStats[team.name] || {};
            const fStats = fieldingStats[team.name] || {};
            team.avg = bStats.avg || '-';
            team.hr = bStats.hr || '-';
            team.sb = bStats.sb || '-';
            team.ops = bStats.ops || '-';
            team.era = pStats.era || '-';
            team.errors = fStats.errors || '-';

            // 重複チェック（交流戦テーブルなどが続く場合があるため）
            if (!teams.some(t => t.name === team.name)) {
              teams.push(team);
            }
          }
          rowIndex++;
        });
      },
    })
    .on('td', {
      element(el) {
        if (!inTable || tableDepth !== targetTableDepth) return;
        cellText = '';
        el.onEndTag(() => {
          if (!inTable || tableDepth !== targetTableDepth) return;
          cells.push(cellText.replace(/\s+/g, ' ').trim());
        });
      },
    })
    .on('*', {
      text(chunk) {
        if (!inTable || tableDepth < targetTableDepth) return;
        cellText += chunk.text;
      },
    });
}

async function handleStandings(league, request, env) {
  if (!VALID_LEAGUES.has(league)) {
    return new Response('Not Found', { status: 404 });
  }

  const year = getYear(request.url);
  const cacheKey = `standings:v3:${league}:${year}`;
  const cached = await getCachedJson(env, cacheKey, request);
  if (cached) return Response.json(cached);

  // 交流戦・オープン戦は NPB 公式の専用勝敗表を直接読む
  if (league === 'cp' || league === 'op') {
    try {
      const specialStandings = await fetchSpecialStandings(league, year);
      const interleagueData = league === 'cp'
        ? await buildInterleagueStandingsData(year, specialStandings.teams, specialStandings.finishedGames, request, env)
        : { teams: specialStandings.teams, updateNote: null };
      const teams = interleagueData.teams;
      const data = { league, year, teams };
      if (interleagueData.updateNote) data.updateNote = interleagueData.updateNote;
      await putCachedJson(env, cacheKey, data, getYearAwareTtl(year, 600), request);
      return Response.json(data);
    } catch (err) {
      return Response.json({ error: '取得エラー', detail: err.message }, { status: 502 });
    }
  }

  // セ・パ リーグは npb.jp からスクレイピング
  const leagueCode = league === 'cl' ? 'c' : 'p';
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
  const stdUrl = `https://npb.jp/bis/${year}/stats/std_${leagueCode}.html`;
  const tmbUrl = `https://npb.jp/bis/${year}/stats/tmb_${leagueCode}.html`;
  const tmpUrl = `https://npb.jp/bis/${year}/stats/tmp_${leagueCode}.html`;
  const tmfUrl = `https://npb.jp/bis/${year}/stats/tmf_${leagueCode}.html`;

  try {
    const [stdRes, tmbRes, tmpRes, tmfRes] = await Promise.all([
      fetch(stdUrl, { headers: { 'User-Agent': UA } }),
      fetch(tmbUrl, { headers: { 'User-Agent': UA } }),
      fetch(tmpUrl, { headers: { 'User-Agent': UA } }),
      fetch(tmfUrl, { headers: { 'User-Agent': UA } }),
    ]);

    if (!stdRes.ok) throw new Error(`npb.jp (std) returned ${stdRes.status}`);

    const isLegacy = year <= 2024;

    // 打撃・投手成績を並列でパース
    const [battingStats, pitchingStats, fieldingStats] = await Promise.all([
      parseExtraStats(tmbRes, 'tablefix2', 0, { 1: 'avg', 9: 'hr', 12: 'sb', '-2': 'slg', '-1': 'obp' }, isLegacy),
      parseExtraStats(tmpRes, 'tablefix2', 0, { 1: 'era' }, isLegacy),
      parseExtraStats(tmfRes, 'tablefix2', 0, { 6: 'errors' }, isLegacy),
    ]);
    Object.values(battingStats).forEach((stats) => {
      stats.ops = calculateOps(stats.slg, stats.obp);
    });

    const stdHtml = await stdRes.text();
    const updateNote = await buildStandingsUpdateNote(year, request, env);
    const teams = [];
    await buildStandingsRewriter(
      teams,
      battingStats,
      pitchingStats,
      fieldingStats,
    ).transform(new Response(stdHtml)).text();

    const data = { league, year, teams };
    if (updateNote) data.updateNote = updateNote;
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
  const aliases = Object.keys(TEAM_SHORT_NAMES).sort((a, b) => b.length - a.length);
  const matched = aliases.find(alias => normalized.includes(alias.replace(/[ \t\r\n　]/g, '')));
  return matched ? TEAM_SHORT_NAMES[matched] : normalizeTeamShortName(normalized);
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
            errors: '-',
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
  return TEAM_SHORT_NAMES[normalized] ?? normalized;
}

async function parseExtraStats(res, tableClass, teamNameIdx, fieldMappings, isLegacy = false) {
  if (!res.ok) return {};
  const stats = {};
  let inTable = false;
  let tableDepth = 0;
  let targetTableDepth = -1;
  let tableResolved = false;
  let rowIndex = 0;
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
  }

  await rewriter
    .on('table', {
      element(el) {
        if (isLegacy) return;
        tableDepth++;
        if (tableResolved) return;
        const className = el.getAttribute('class') ?? '';
        if (targetTableDepth === -1 && (className.includes(tableClass) || className.includes('NpbSt'))) {
          inTable = true;
          targetTableDepth = tableDepth;
          rowIndex = 0;
          el.onEndTag(() => {
            inTable = false;
            tableResolved = true;
            targetTableDepth = -1;
          });
        }
        el.onEndTag(() => {
          tableDepth--;
        });
      },
    })
    .on('tr', {
      element(el) {
        if (isLegacy) return;
        if (!inTable || tableDepth !== targetTableDepth) return;
        cells = [];
        el.onEndTag(() => {
          if (!inTable || tableDepth !== targetTableDepth) return;
          if (rowIndex > 0 && cells.length > teamNameIdx) {
            const teamName = normalizeTeamShortName(cells[teamNameIdx]);
            const s = {};
            for (const [idx, field] of Object.entries(fieldMappings)) {
              const cellIndex = Number(idx);
              const resolvedIndex = cellIndex < 0 ? cells.length + cellIndex : cellIndex;
              s[field] = cells[resolvedIndex] ?? '-';
            }
            stats[teamName] = s;
          }
          rowIndex++;
        });
      },
    })
    .on('td', {
      element(el) {
        if (isLegacy) {
          cellText = '';
          el.onEndTag(() => {
            cells.push(cellText.trim());
          });
          return;
        }
        if (!inTable || tableDepth !== targetTableDepth) return;
        cellText = '';
        el.onEndTag(() => {
          if (!inTable || tableDepth !== targetTableDepth) return;
          cells.push(cellText.trim());
        });
      },
      text(chunk) {
        if (isLegacy) {
          cellText += chunk.text;
          return;
        }
        if (!inTable || tableDepth < targetTableDepth) return;
        cellText += chunk.text;
      },
    })
    .transform(res)
    .text();

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
  return TEAM_SHORT_NAMES[match[1]] ?? match[1];
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
    let tableIndex = -1;
    let inTable = false;
    let tableDepth = 0;
    let targetTableDepth = -1;
    let rowIndex = 0;
    let headers = [];
    let cells = [];
    let cellText = '';
    let currentCellTag = null;

    function pushCell() {
      const text = normalizeText(cellText);
      if (currentCellTag === 'th' || rowIndex === 0) headers.push(text);
      // rowIndex > 0 の時だけデータセルとして扱う
      if (currentCellTag === 'td' && rowIndex > 0) cells.push(text);
      cellText = '';
      currentCellTag = null;
    }

    await new HTMLRewriter()
      .on('table', {
        element(el) {
          tableDepth++;
          if (targetTableDepth === -1) {
            const className = el.getAttribute('class') ?? '';
            if (className.includes('tablefix2') || className.includes('stdtblSubmain')) {
              tableIndex++;
              if (tableIndex <= 1) {
                inTable = true;
                targetTableDepth = tableDepth;
                rowIndex = 0;
                headers = [];
              }
            }
          }
          el.onEndTag(() => {
            if (tableDepth === targetTableDepth) {
              inTable = false;
              targetTableDepth = -1;
            }
            tableDepth--;
          });
        },
      })
      .on('tr', {
        element(el) {
          if (!inTable || tableDepth !== targetTableDepth) return;
          cells = [];
          el.onEndTag(() => {
            if (!inTable || tableDepth !== targetTableDepth) return;
            if (rowIndex > 0 && cells[0]) {
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
            }
            rowIndex++;
          });
        },
      })
      .on('th', {
        element(el) {
          if (!inTable || tableDepth !== targetTableDepth) return;
          currentCellTag = 'th';
          cellText = '';
          el.onEndTag(pushCell);
        },
      })
      .on('td', {
        element(el) {
          if (!inTable || tableDepth !== targetTableDepth) return;
          currentCellTag = 'td';
          cellText = '';
          el.onEndTag(pushCell);
        },
      })
      .on('*', {
        text(chunk) {
          if (!inTable || tableDepth < targetTableDepth) return;
          if (currentCellTag) {
            cellText += chunk.text;
          }
        },
      })
      .transform(res)
      .text();

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
  const normalizedTeamName = String(teamName ?? '');
  return Object.entries(TEAM_COLORS).find(([name]) => normalizedTeamName.includes(name))?.[1] ?? '#334155';
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

const OGP_LEAGUE_LABELS = {
  cl: 'CENTRAL',
  pl: 'PACIFIC',
  cp: 'INTERLEAGUE',
  op: 'OPEN',
};

const OGP_TEAM_CODES = {
  'ヤクルト': 'YS',
  '阪神': 'T',
  '巨人': 'G',
  '読売': 'G',
  'DeNA': 'DB',
  '横浜DeNA': 'DB',
  '広島': 'C',
  '中日': 'D',
  '西武': 'L',
  'ソフトバンク': 'H',
  'オリックス': 'B',
  '日本ハム': 'F',
  'ロッテ': 'M',
  '楽天': 'E',
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
  const teamName = String(name ?? '');
  return Object.entries(OGP_TEAM_CODES).find(([key]) => teamName.includes(key))?.[1] ?? teamName.slice(0, 3).toUpperCase();
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

  const cacheKey = `schedule:${year}-${month}`;
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

// ─── ルーター ─────────────────────────────────────────────────
export default {
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

    // /api/recent/:league?year=YYYY
    if (segments[0] === 'api' && segments[1] === 'recent' && segments[2]) {
      return handleRecent(segments[2], request, env);
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
