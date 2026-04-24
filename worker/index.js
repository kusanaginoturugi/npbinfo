// Cloudflare Worker エントリポイント
// - /api/standings/:league    → npb-result APIプロキシ
// - /api/stats/:type/:league  → npb.jp HTMLRewriter スクレイピング
// - その他                    → dist/ の静的アセットを返す

const CURRENT_YEAR = new Date().getFullYear();
const AVAILABLE_YEARS = Array.from({ length: 12 }, (_, i) => CURRENT_YEAR - i).reverse();

function getYear(url) {
  const year = new URL(url).searchParams.get('year');
  const parsed = year ? parseInt(year, 10) : CURRENT_YEAR;
  return AVAILABLE_YEARS.includes(parsed) ? parsed : CURRENT_YEAR;
}

// ─── 順位表 ──────────────────────────────────────────────────
const VALID_LEAGUES = new Set(['cl', 'pl', 'cp', 'op']);

async function handleStandings(league, request) {
  if (!VALID_LEAGUES.has(league)) {
    return new Response('Not Found', { status: 404 });
  }
  try {
    const res = await fetch(
      `https://npb-result.ant-npb.workers.dev/api/${league}`,
      { headers: { 'User-Agent': 'npbinfo-app/1.0' } }
    );
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    const data = await res.json();
    return Response.json(data);
  } catch (err) {
    return Response.json(
      { error: 'データの取得に失敗しました', detail: err.message },
      { status: 502 }
    );
  }
}

// ─── 選手成績 ─────────────────────────────────────────────────
const BATTING_FIELDS = {
  0: 'rank', 1: 'name', 2: 'team', 3: 'games',
  4: 'avg', 6: 'hits', 10: 'hr', 11: 'rbi',
  16: 'sb', 20: 'obp', 21: 'slg', 22: 'ops',
};

const PITCHING_FIELDS = {
  0: 'rank', 1: 'name', 2: 'team', 3: 'era',
  4: 'games', 7: 'wins', 8: 'losses', 10: 'saves',
  11: 'holds', 13: 'ip', 16: 'so', 22: 'whip',
};

function mapCells(cells, fields) {
  const obj = {};
  for (const [idx, field] of Object.entries(fields)) {
    obj[field] = cells[idx] ?? '-';
  }
  return obj;
}

function buildRewriter(players, fields) {
  let inTable = false;
  let rowIndex = 0;
  let cells = [];
  let cellText = '';

  return new HTMLRewriter()
    .on('table', {
      element(el) {
        inTable = (el.getAttribute('class') ?? '').includes('NpbSt');
        if (inTable) rowIndex = 0;
        el.onEndTag(() => { inTable = false; });
      },
    })
    .on('tr', {
      element(el) {
        if (!inTable) return;
        cells = [];
        el.onEndTag(() => {
          if (!inTable) return;
          if (rowIndex > 0 && cells.length >= 4 && cells[1]) {
            players.push(mapCells(cells, fields));
          }
          rowIndex++;
        });
      },
    })
    .on('td', {
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
}

async function handleStats(type, league, request) {
  if (!['batting', 'pitching'].includes(type) || !['cl', 'pl'].includes(league)) {
    return new Response('Not Found', { status: 404 });
  }

  const year = getYear(request.url);
  const leagueCode = league === 'cl' ? 'c' : 'p';
  const prefix = type === 'batting' ? 'bat' : 'pit';
  const url = `https://npb.jp/bis/${year}/stats/${prefix}_${leagueCode}.html`;
  const fields = type === 'batting' ? BATTING_FIELDS : PITCHING_FIELDS;

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'ja,en;q=0.9',
      },
    });
    if (!res.ok) throw new Error(`npb.jp returned ${res.status}`);

    const players = [];
    await buildRewriter(players, fields).transform(res).text();

    return Response.json({ league, type, year, players });
  } catch (err) {
    return Response.json(
      { error: 'データの取得に失敗しました', detail: err.message },
      { status: 502 }
    );
  }
}

// ─── ルーター ─────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const segments = url.pathname.split('/').filter(Boolean);

    // /api/standings/:league?year=YYYY
    if (segments[0] === 'api' && segments[1] === 'standings' && segments[2]) {
      return handleStandings(segments[2], request);
    }

    // /api/stats/:type/:league?year=YYYY
    if (segments[0] === 'api' && segments[1] === 'stats' && segments[2] && segments[3]) {
      return handleStats(segments[2], segments[3], request);
    }

    // その他は dist/ の静的アセット（Workers Static Assets）
    return env.ASSETS.fetch(request);
  },
};
