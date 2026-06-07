const TEAM_ALIASES = {
  阪神タイガース: '阪神',
  阪神: '阪神',
  東京ヤクルトスワローズ: 'ヤクルト',
  ヤクルト: 'ヤクルト',
  読売ジャイアンツ: '巨人',
  巨人: '巨人',
  横浜DeNAベイスターズ: 'DeNA',
  DeNA: 'DeNA',
  広島東洋カープ: '広島',
  広島: '広島',
  中日ドラゴンズ: '中日',
  中日: '中日',
  埼玉西武ライオンズ: '西武',
  西武: '西武',
  オリックス・バファローズ: 'オリックス',
  オリックス: 'オリックス',
  福岡ソフトバンクホークス: 'ソフトバンク',
  ソフトバンク: 'ソフトバンク',
  北海道日本ハムファイターズ: '日本ハム',
  日本ハム: '日本ハム',
  千葉ロッテマリーンズ: 'ロッテ',
  ロッテ: 'ロッテ',
  東北楽天ゴールデンイーグルス: '楽天',
  楽天: '楽天',
};

const VENUE_ALIASES = [
  [/エスコン/, 'エスコンフィールドHOKKAIDO'],
  [/楽天モバイル|楽天生命|Kobo|宮城/, '楽天モバイルパーク宮城'],
  [/ベルーナ|メットライフ|西武ドーム/, 'ベルーナドーム'],
  [/東京ドーム/, '東京ドーム'],
  [/神宮/, '明治神宮野球場'],
  [/ZOZOマリン|千葉マリン/, 'ZOZOマリンスタジアム'],
  [/横浜/, '横浜スタジアム'],
  [/バンテリン|ナゴヤドーム/, 'バンテリンドーム ナゴヤ'],
  [/京セラ|大阪ドーム/, '京セラドーム大阪'],
  [/甲子園/, '阪神甲子園球場'],
  [/マツダ|MAZDA|広島市民/, 'MAZDA Zoom-Zoom スタジアム広島'],
  [/PayPay|ヤフオク|福岡ドーム/, 'みずほPayPayドーム福岡'],
];

function stripHtml(value) {
  return String(value ?? '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeParkFactorTeam(value) {
  const normalized = stripHtml(value).replace(/[【】]/g, '');
  return TEAM_ALIASES[normalized] ?? normalized;
}

export function normalizeParkFactorVenue(value) {
  const normalized = stripHtml(value).replace(/[ \u3000]/g, '');
  const matched = VENUE_ALIASES.find(([pattern]) => pattern.test(normalized));
  return matched?.[1] ?? stripHtml(value);
}

function countHomeRuns(value) {
  return (String(value ?? '').match(/\d+号（/g) ?? []).length;
}

export function parseNpbGameDetail(html, path = '') {
  const source = String(html ?? '');
  if (!source.includes('【試合終了】') && !source.includes('◇終了')) return null;

  const titleMatch = source.match(/<div class="game_tit">[\s\S]*?<h3>([\s\S]*?)<\/h3>/);
  const title = stripHtml(titleMatch?.[1]);
  if (!title || (!title.includes('公式戦') && !title.includes('セ・パ交流戦'))) return null;
  if (title.includes('ファーム') || title.includes('クライマックス') || title.includes('日本シリーズ')) {
    return null;
  }

  const teams = title.match(/】\s*(.+?)\s+vs\s+(.+?)\s+\d+回戦/);
  const venueMatch = source.match(/<span class="place">([\s\S]*?)<\/span>/);
  const dateMatch = source.match(/<time>(\d{4})年(\d{1,2})月(\d{1,2})日/);
  const homeRunSection = source.match(/<h4>本塁打<\/h4>\s*<table>[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/);
  if (!teams || !venueMatch || !dateMatch || !homeRunSection) return null;

  const homeTeam = normalizeParkFactorTeam(teams[1]);
  const awayTeam = normalizeParkFactorTeam(teams[2]);
  const homeRuns = {};
  const rowPattern = /<tr>[\s\S]*?<th>【([\s\S]*?)】<\/th>[\s\S]*?<td>([\s\S]*?)<\/td>[\s\S]*?<\/tr>/g;
  let rowMatch;
  while ((rowMatch = rowPattern.exec(homeRunSection[1])) !== null) {
    homeRuns[normalizeParkFactorTeam(rowMatch[1])] = countHomeRuns(rowMatch[2]);
  }

  return {
    path,
    date: `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}`,
    venue: normalizeParkFactorVenue(venueMatch[1]),
    homeTeam,
    awayTeam,
    homeHr: homeRuns[homeTeam] ?? 0,
    awayHr: homeRuns[awayTeam] ?? 0,
  };
}

export function calculateAdjustedHomeRuns(games, factors) {
  const teams = {};
  for (const game of games) {
    const factor = Number(factors[game.venue]?.factor) || 1;
    for (const [team, homeRuns] of [
      [game.homeTeam, game.homeHr],
      [game.awayTeam, game.awayHr],
    ]) {
      if (!teams[team]) teams[team] = { raw: 0, adjusted: 0 };
      teams[team].raw += homeRuns;
      teams[team].adjusted += homeRuns / factor;
    }
  }
  return Object.fromEntries(Object.entries(teams).map(([team, values]) => [
    team,
    {
      raw: values.raw,
      adjusted: Math.round(values.adjusted * 10) / 10,
    },
  ]));
}
