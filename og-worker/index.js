import puppeteer from '@cloudflare/puppeteer';

const LEAGUES = ['cl', 'pl', 'cp'];
const LEAGUE_LABELS = {
  cl: 'セントラル・リーグ',
  pl: 'パシフィック・リーグ',
  cp: 'セ・パ交流戦',
};
const TEAM_COLORS = {
  ヤクルト: '#001943',
  阪神: '#ffe600',
  巨人: '#f49c00',
  DeNA: '#003f8e',
  横浜DeNA: '#003f8e',
  広島: '#cc0000',
  中日: '#0035ad',
  ソフトバンク: '#f3c945',
  日本ハム: '#005496',
  楽天: '#870011',
  ロッテ: '#111111',
  オリックス: '#000019',
  西武: '#1f2d53',
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function teamColor(name) {
  return Object.entries(TEAM_COLORS)
    .find(([key]) => String(name ?? '').includes(key))?.[1] ?? '#64748b';
}

function metricValue(team, key) {
  const value = Number.parseFloat(team[key]);
  return Number.isFinite(value) ? value : 0;
}

function renderBars(teams, key, label, lowerIsBetter = false) {
  const values = teams.map(team => metricValue(team, key)).filter(value => value > 0);
  const max = values.length ? Math.max(...values) : 1;
  const min = values.length ? Math.min(...values) : 0;

  const rows = teams.map(team => {
    const value = metricValue(team, key);
    const ratio = lowerIsBetter
      ? (max === min ? 1 : (max - value) / (max - min))
      : value / max;
    const width = value > 0 ? Math.max(8, Math.round(ratio * 100)) : 0;
    return `
      <div class="bar-row">
        <span class="bar-team">${escapeHtml(team.name)}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${width}%;background:${teamColor(team.name)}"></span></span>
        <span class="bar-value">${value > 0 ? escapeHtml(team[key]) : '-'}</span>
      </div>`;
  }).join('');

  return `
    <section class="metric">
      <h2>${escapeHtml(label)}</h2>
      <div class="bar-list">${rows}</div>
    </section>`;
}

function renderHtml(data, league) {
  const label = LEAGUE_LABELS[league] ?? league;
  const teams = (data.teams ?? []).slice(0, 6);
  const year = data.year ?? new Date().getFullYear();
  const rows = teams.map(team => `
    <tr>
      <td class="rank">${escapeHtml(team.rank)}</td>
      <td class="team">
        <span class="team-dot" style="background:${teamColor(team.name)}"></span>
        ${escapeHtml(team.name)}
      </td>
      <td>${escapeHtml(team.win)}</td>
      <td>${escapeHtml(team.lose)}</td>
      <td>${escapeHtml(team.draw)}</td>
      <td>${escapeHtml(team.pct)}</td>
      <td>${escapeHtml(team.gamesBehind)}</td>
    </tr>`).join('');

  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; }
    html, body { width: 1200px; height: 630px; margin: 0; overflow: hidden; }
    body {
      background: #e8eef8;
      color: #0f172a;
      font-family: "Noto Sans CJK JP", "Noto Sans JP", "Hiragino Kaku Gothic ProN",
        "Yu Gothic", "Meiryo", sans-serif;
      letter-spacing: 0;
    }
    header {
      height: 108px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 54px;
      background: #0a1628;
      color: #fff;
    }
    h1 { margin: 0; font-size: 34px; line-height: 1.2; }
    .year { color: #c7d2fe; font-size: 22px; font-weight: 700; }
    main {
      display: grid;
      grid-template-columns: 650px 1fr;
      gap: 22px;
      height: 474px;
      padding: 22px 42px 16px;
    }
    .standings, .metrics {
      overflow: hidden;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      background: #fff;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 18px;
      font-variant-numeric: tabular-nums;
    }
    th {
      height: 46px;
      background: #dce5f3;
      color: #475569;
      font-size: 15px;
      text-align: center;
    }
    th:nth-child(2) { text-align: left; }
    td {
      height: 64px;
      padding: 0 10px;
      border-top: 1px solid #e2e8f0;
      text-align: center;
      font-weight: 650;
    }
    tbody tr:nth-child(even) { background: #f8fafc; }
    .rank { width: 56px; font-size: 22px; font-weight: 800; }
    .team { display: flex; align-items: center; gap: 12px; text-align: left; }
    .team-dot {
      width: 18px;
      height: 18px;
      border: 1px solid rgba(15, 23, 42, .14);
      border-radius: 50%;
      flex: 0 0 auto;
    }
    .metrics {
      display: grid;
      grid-template-rows: repeat(3, 1fr);
      padding: 12px 16px;
    }
    .metric + .metric { border-top: 1px solid #e2e8f0; }
    .metric { min-height: 0; padding: 7px 0; }
    .metric h2 {
      margin: 0 0 4px;
      color: #334155;
      font-size: 15px;
    }
    .bar-list { display: grid; gap: 2px; }
    .bar-row {
      display: grid;
      grid-template-columns: 66px 1fr 44px;
      align-items: center;
      gap: 7px;
      min-height: 16px;
      font-size: 11px;
      font-variant-numeric: tabular-nums;
    }
    .bar-team {
      overflow: hidden;
      font-weight: 700;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .bar-track {
      height: 8px;
      overflow: hidden;
      border-radius: 2px;
      background: #e2e8f0;
    }
    .bar-fill { display: block; height: 100%; }
    .bar-value { text-align: right; font-weight: 700; }
    footer {
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 48px;
      color: #475569;
      font-size: 14px;
      font-weight: 650;
    }
    .brand { color: #e8392a; font-size: 18px; font-weight: 900; }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(label)} 順位表</h1>
    <span class="year">${escapeHtml(year)}年</span>
  </header>
  <main>
    <section class="standings">
      <table>
        <thead><tr><th>順位</th><th>チーム</th><th>勝</th><th>敗</th><th>分</th><th>勝率</th><th>差</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>
    <section class="metrics">
      ${renderBars(teams, 'avg', 'チーム打率')}
      ${renderBars(teams, 'ops', 'チームOPS')}
      ${renderBars(teams, 'era', 'チーム防御率', true)}
    </section>
  </main>
  <footer>
    <span><span class="brand">NPB</span> プロ野球情報</span>
    <span>npbinfo.kusanaginoturugi.workers.dev</span>
  </footer>
</body>
</html>`;
}

async function fetchStandings(env, league) {
  const url = `https://npbinfo/api/standings/${league}?nocache=1`;
  const response = await env.NPBINFO.fetch(url);
  if (!response.ok) throw new Error(`standings ${league}: ${response.status}`);
  const data = await response.json();
  if (data.error) throw new Error(data.error);
  return data;
}

function standingsSignature(data) {
  return JSON.stringify((data.teams ?? []).map(team => [
    team.rank,
    team.name,
    team.win,
    team.lose,
    team.draw,
    team.pct,
    team.gamesBehind,
    team.avg,
    team.ops,
    team.era,
  ]));
}

async function generateLeague(browser, env, league, data, signature) {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
    await page.setContent(renderHtml(data, league), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts?.ready);
    const png = await page.screenshot({ type: 'png' });
    const image = png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength);
    const generatedAt = new Date().toISOString();
    await env.CACHE.put(`og:standings:${league}:png`, image, {
      metadata: {
        generatedAt,
        year: data.year,
        source: 'browser-run',
      },
    });
    await env.CACHE.put(`og:standings:${league}:signature`, signature);
    return { league, generatedAt, bytes: png.byteLength };
  } finally {
    await page.close();
  }
}

async function generateAll(env, { force = false } = {}) {
  const candidates = [];
  for (const league of LEAGUES) {
    const data = await fetchStandings(env, league);
    const signature = standingsSignature(data);
    const [previousSignature, currentImage] = await Promise.all([
      env.CACHE.get(`og:standings:${league}:signature`),
      env.CACHE.get(`og:standings:${league}:png`, 'arrayBuffer'),
    ]);
    if (force || !currentImage || previousSignature !== signature) {
      candidates.push({ league, data, signature });
    }
  }

  if (!candidates.length) return [];

  const browser = await puppeteer.launch(env.BROWSER);
  try {
    const results = [];
    for (const candidate of candidates) {
      results.push(await generateLeague(
        browser,
        env,
        candidate.league,
        candidate.data,
        candidate.signature,
      ));
    }
    return results;
  } finally {
    await browser.close();
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return Response.json({ ok: true, worker: 'npbinfo-og-generator' });
    }
    const imageMatch = url.pathname.match(/^\/images\/standings\/(cl|pl|cp)\.png$/);
    if (imageMatch && request.method === 'GET') {
      const generated = await env.CACHE.getWithMetadata(
        `og:standings:${imageMatch[1]}:png`,
        'arrayBuffer',
      );
      if (!generated.value) return new Response('Not Found', { status: 404 });
      const headers = new Headers({
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=300',
      });
      if (generated.metadata?.generatedAt) {
        headers.set('X-OGP-Generated-At', generated.metadata.generatedAt);
      }
      return new Response(generated.value, { headers });
    }
    if (url.pathname !== '/generate' || request.method !== 'POST') {
      return new Response('Not Found', { status: 404 });
    }
    if (!env.REFRESH_TOKEN || request.headers.get('Authorization') !== `Bearer ${env.REFRESH_TOKEN}`) {
      return new Response('Unauthorized', { status: 401 });
    }
    return Response.json({ generated: await generateAll(env, { force: true }) });
  },

  async scheduled(controller, env, ctx) {
    const force = controller.cron === '30 18 * * *';
    ctx.waitUntil(generateAll(env, { force }));
  },
};
