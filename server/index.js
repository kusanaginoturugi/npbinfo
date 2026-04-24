import express from 'express';
import axios from 'axios';
import * as cheerio from 'cheerio';
import cors from 'cors';

const app = express();
const PORT = 3001;
const YEAR = new Date().getFullYear();

app.use(cors());
app.use(express.json());

// ─── 順位表 ───────────────────────────────────────────────────────────────────
// npb-result API（Cloudflare Workers製の非公式JSONエンドポイント）を中継
const NPB_RESULT_BASE = 'https://npb-result.ant-npb.workers.dev';

app.get('/api/standings/:league', async (req, res) => {
  const { league } = req.params; // cl / pl / cp / op
  try {
    const { data } = await axios.get(`${NPB_RESULT_BASE}/api/${league}`, {
      timeout: 8000,
      headers: { 'User-Agent': 'npbinfo-app/1.0' },
    });
    res.json(data);
  } catch (err) {
    console.error('[standings]', err.message);
    res.status(502).json({ error: 'データの取得に失敗しました', detail: err.message });
  }
});

// ─── 選手成績（打撃 / 投手）────────────────────────────────────────────────────
// npb.jp 公式の成績ページをスクレイピング
// URL例: https://npb.jp/bis/2026/stats/bat_c.html
const NPB_STATS_BASE = 'https://npb.jp/bis';

async function scrapeNpbStats(url) {
  const { data: html } = await axios.get(url, {
    timeout: 10000,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'ja,en;q=0.9',
    },
  });
  return cheerio.load(html);
}

// 打撃成績
app.get('/api/stats/batting/:league', async (req, res) => {
  const leagueCode = req.params.league === 'cl' ? 'c' : 'p';
  const url = `${NPB_STATS_BASE}/${YEAR}/stats/bat_${leagueCode}.html`;
  try {
    const $ = await scrapeNpbStats(url);
    const rows = [];

    // npb.jp の成績テーブルを解析（ヘッダー行をスキップ）
    $('table.tablefix2, table.NpbSt').first().find('tr').each((i, tr) => {
      if (i === 0) return; // ヘッダーをスキップ
      const cells = $(tr).find('td');
      if (cells.length < 5) return;

      const nameRaw = $(cells[1]).text().trim();
      const match = nameRaw.match(/^(.*?)\((.*?)\)$/);
      
      const row = {
        rank: $(cells[0]).text().trim(),
        name: match ? match[1].trim() : nameRaw,
        team: match ? match[2].trim() : '-',
        avg: $(cells[2]).text().trim(),
        games: $(cells[3]).text().trim(),
        hits: $(cells[7])?.text().trim() ?? '-',
        hr: $(cells[10])?.text().trim() ?? '-',
        rbi: $(cells[12])?.text().trim() ?? '-',
        sb: $(cells[13])?.text().trim() ?? '-',
        slg: $(cells[22])?.text().trim() ?? '-',
        obp: $(cells[23])?.text().trim() ?? '-',
      };
      if (row.name) rows.push(row);
    });

    res.json({ league: req.params.league, year: YEAR, players: rows });
  } catch (err) {
    console.error('[batting]', err.message);
    res.status(502).json({ error: 'データの取得に失敗しました', detail: err.message });
  }
});

// 投手成績
app.get('/api/stats/pitching/:league', async (req, res) => {
  const leagueCode = req.params.league === 'cl' ? 'c' : 'p';
  const url = `${NPB_STATS_BASE}/${YEAR}/stats/pit_${leagueCode}.html`;
  try {
    const $ = await scrapeNpbStats(url);
    const rows = [];

    $('table.tablefix2, table.NpbSt').first().find('tr').each((i, tr) => {
      if (i === 0) return;
      const cells = $(tr).find('td');
      if (cells.length < 5) return;

      const nameRaw = $(cells[1]).text().trim();
      const match = nameRaw.match(/^(.*?)\((.*?)\)$/);

      const row = {
        rank: $(cells[0]).text().trim(),
        name: match ? match[1].trim() : nameRaw,
        team: match ? match[2].trim() : '-',
        era: $(cells[2]).text().trim(),
        games: $(cells[3]).text().trim(),
        wins: $(cells[4])?.text().trim() ?? '-',
        losses: $(cells[5])?.text().trim() ?? '-',
        saves: $(cells[6])?.text().trim() ?? '-',
        holds: '-', // 2026年版では列位置が不明なため一旦ハイフン
        ip: $(cells[14])?.text().trim() ?? '-',
        so: $(cells[20])?.text().trim() ?? '-',
        whip: '-',
      };
      if (row.name) rows.push(row);
    });

    res.json({ league: req.params.league, year: YEAR, players: rows });
  } catch (err) {
    console.error('[pitching]', err.message);
    res.status(502).json({ error: 'データの取得に失敗しました', detail: err.message });
  }
});

// ─── ヘルスチェック ────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ ok: true, year: YEAR }));

app.listen(PORT, () => {
  console.log(`NPBinfo server listening on http://localhost:${PORT}`);
});
