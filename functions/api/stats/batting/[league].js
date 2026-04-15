// npb.jp の打撃成績ページを HTMLRewriter でパースして返す
// URL例: https://npb.jp/bis/2026/stats/bat_c.html

const YEAR = new Date().getFullYear();

// テーブル列インデックス → フィールド名のマッピング
const BATTING_FIELDS = {
  0: 'rank', 1: 'name', 2: 'team', 3: 'games',
  4: 'avg', 6: 'hits', 10: 'hr', 11: 'rbi',
  16: 'sb', 20: 'obp', 21: 'slg', 22: 'ops',
};

function mapCells(cells) {
  const obj = {};
  for (const [idx, field] of Object.entries(BATTING_FIELDS)) {
    obj[field] = cells[idx] ?? '-';
  }
  return obj;
}

function buildRewriter(players) {
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
          // 先頭行（ヘッダー）はスキップ。名前列が空の行も除外。
          if (rowIndex > 0 && cells.length >= 4 && cells[1]) {
            players.push(mapCells(cells));
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

export async function onRequestGet({ params }) {
  const { league } = params;
  if (!['cl', 'pl'].includes(league)) {
    return new Response('Not Found', { status: 404 });
  }

  const leagueCode = league === 'cl' ? 'c' : 'p';
  const url = `https://npb.jp/bis/${YEAR}/stats/bat_${leagueCode}.html`;

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'ja,en;q=0.9',
      },
    });

    if (!res.ok) throw new Error(`npb.jp returned ${res.status}`);

    const players = [];
    await buildRewriter(players).transform(res).text();

    return Response.json({ league, year: YEAR, players });
  } catch (err) {
    return Response.json(
      { error: 'データの取得に失敗しました', detail: err.message },
      { status: 502 }
    );
  }
}
