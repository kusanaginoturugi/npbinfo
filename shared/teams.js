// NPB12球団のメタデータを集約する単一の真実源。
// カラーコードは公式色名から推測した値を含むため、必要に応じてここだけを更新する。

const TEAM_DEFINITIONS = [
  {
    shortName: 'ヤクルト',
    slug: 'yakult',
    league: 'cl',
    code: 'S',
    ogpCode: 'YS',
    official: '東京ヤクルトスワローズ',
    colors: ['#001943', '#EF3E45', '#00A95F'],
    colorNames: ['紺', '赤', '緑'],
    aliases: ['ヤ', '東京ヤクルトスワローズ'],
  },
  {
    shortName: '阪神',
    slug: 'hanshin',
    league: 'cl',
    code: 'T',
    ogpCode: 'T',
    official: '阪神タイガース',
    colors: ['#FFE600', '#000000'],
    colorNames: ['イエロー', 'ブラック'],
    aliases: ['神', '阪神タイガース'],
  },
  {
    shortName: '巨人',
    slug: 'giants',
    league: 'cl',
    code: 'G',
    ogpCode: 'G',
    official: '読売ジャイアンツ',
    colors: ['#F49C00', '#000000'],
    colorNames: ['オレンジ', 'ブラック'],
    aliases: ['巨', '読売', '読売ジャイアンツ'],
  },
  {
    shortName: 'DeNA',
    slug: 'dena',
    league: 'cl',
    code: 'DB',
    ogpCode: 'DB',
    official: '横浜DeNAベイスターズ',
    colors: ['#003F8E', '#B3A269'],
    colorNames: ['横浜ブルー', 'ゴールド'],
    aliases: ['デ', '横浜DeNA', '横浜DeNAベイスターズ'],
  },
  {
    shortName: '広島',
    slug: 'hiroshima',
    league: 'cl',
    code: 'C',
    ogpCode: 'C',
    official: '広島東洋カープ',
    colors: ['#CC0000'],
    colorNames: ['広島赤'],
    aliases: ['広', '広島東洋カープ'],
  },
  {
    shortName: '中日',
    slug: 'chunichi',
    league: 'cl',
    code: 'D',
    ogpCode: 'D',
    official: '中日ドラゴンズ',
    colors: ['#0035AD', '#FFFFFF'],
    colorNames: ['ドラゴンズブルー', 'ホワイト'],
    aliases: ['中', '中日ドラゴンズ'],
  },
  {
    shortName: 'ソフトバンク',
    slug: 'softbank',
    league: 'pl',
    code: 'H',
    ogpCode: 'H',
    official: '福岡ソフトバンクホークス',
    colors: ['#F3C945', '#000000'],
    colorNames: ['レボリューションイエロー', 'ブラック'],
    aliases: ['ソ', '福岡ソフトバンクホークス'],
  },
  {
    shortName: '日本ハム',
    slug: 'nipponham',
    league: 'pl',
    code: 'F',
    ogpCode: 'F',
    official: '北海道日本ハムファイターズ',
    colors: ['#005496', '#FFFFFF', '#000000'],
    colorNames: ['ファイターズブルー', 'ホワイト', 'ブラック'],
    aliases: ['日', '北海道日本ハムファイターズ'],
  },
  {
    shortName: '楽天',
    slug: 'rakuten',
    league: 'pl',
    code: 'E',
    ogpCode: 'E',
    official: '東北楽天ゴールデンイーグルス',
    colors: ['#870011', '#EAAA00'],
    colorNames: ['クリムゾンレッド', 'ゴールド'],
    aliases: ['楽', '東北楽天ゴールデンイーグルス'],
  },
  {
    shortName: 'ロッテ',
    slug: 'lotte',
    league: 'pl',
    code: 'M',
    ogpCode: 'M',
    official: '千葉ロッテマリーンズ',
    colors: ['#000000', '#FFFFFF', '#9F9FA0'],
    colorNames: ['ブラック', 'ホワイト', 'シルバー'],
    aliases: ['ロ', '千葉ロッテマリーンズ'],
  },
  {
    shortName: 'オリックス',
    slug: 'orix',
    league: 'pl',
    code: 'B',
    ogpCode: 'B',
    official: 'オリックス・バファローズ',
    colors: ['#000019', '#B3A269'],
    colorNames: ['紺', 'ゴールド'],
    aliases: ['オ', 'オリックス・バファローズ'],
  },
  {
    shortName: '西武',
    slug: 'seibu',
    league: 'pl',
    code: 'L',
    ogpCode: 'L',
    official: '埼玉西武ライオンズ',
    colors: ['#1F2D53'],
    colorNames: ['レジェンドブルー'],
    aliases: ['西', '埼玉西武ライオンズ'],
  },
];

function normalizeLookupValue(value) {
  return String(value ?? '').replace(/[ \t\r\n　]/g, '');
}

function toTeamInfo(team) {
  return {
    league: team.league,
    code: team.code,
    ogpCode: team.ogpCode,
    official: team.official,
    shortName: team.shortName,
    slug: team.slug,
    colors: team.colors,
    colorNames: team.colorNames,
    aliases: team.aliases,
  };
}

export const TEAMS = Object.fromEntries(
  TEAM_DEFINITIONS.map(team => [team.shortName, toTeamInfo(team)]),
);

export function getTeamBySlug(slug) {
  const team = TEAM_DEFINITIONS.find(item => item.slug === slug);
  return team ? TEAMS[team.shortName] : null;
}

export const TEAM_NAME_ALIASES = Object.fromEntries(
  TEAM_DEFINITIONS.flatMap(team => [
    [team.shortName, team.shortName],
    [team.official, team.shortName],
    ...team.aliases.map(alias => [alias, team.shortName]),
  ]),
);

const TEAM_ALIAS_ENTRIES = Object.entries(TEAM_NAME_ALIASES)
  .map(([alias, shortName]) => [alias, normalizeLookupValue(alias), shortName])
  .sort((a, b) => b[1].length - a[1].length);

function findTeamShortName(value, { partial = false } = {}) {
  const normalized = normalizeLookupValue(value);
  if (!normalized) return null;
  const exact = TEAM_ALIAS_ENTRIES.find(([, alias]) => normalized === alias);
  if (exact) return exact[2];
  if (!partial) return null;
  return TEAM_ALIAS_ENTRIES.find(([, alias]) => normalized.includes(alias))?.[2] ?? null;
}

export function getTeamInfo(name) {
  const shortName = findTeamShortName(name);
  return shortName ? TEAMS[shortName] : null;
}

export function getTeamInfoByPartialName(name) {
  const shortName = findTeamShortName(name, { partial: true });
  return shortName ? TEAMS[shortName] : null;
}

export function normalizeTeamName(name) {
  const shortName = findTeamShortName(name);
  return shortName ?? name;
}

export function normalizeTeamNameByPartialMatch(name) {
  const shortName = findTeamShortName(name, { partial: true });
  return shortName ?? normalizeTeamName(name);
}

export function getTeamLeague(name) {
  return getTeamInfo(name)?.league ?? null;
}

export function getTeamPrimaryColor(name, fallback = '#64748b') {
  return getTeamInfoByPartialName(name)?.colors?.[0] ?? fallback;
}

export function getTeamOgpCode(name) {
  return getTeamInfoByPartialName(name)?.ogpCode ?? String(name ?? '').slice(0, 3).toUpperCase();
}

function hexLuminance(hex) {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

// 背景色の明るさに応じて読みやすい文字色を返す
export function getContrastColor(hex) {
  return hexLuminance(hex) > 0.6 ? '#1A1A2E' : '#FFFFFF';
}

// グラフの縁取り用に、二色目以降から背景と十分なコントラストを持つ色を
// テーマ別に選ぶ。該当色が無いチームは null（縁なし自体が識別子になる）。
export function getTeamPipingColors(name) {
  const subColors = getTeamInfoByPartialName(name)?.colors?.slice(1) ?? [];
  return {
    light: subColors.find(hex => hexLuminance(hex) < 0.82) ?? null,
    dark: subColors.find(hex => hexLuminance(hex) > 0.35) ?? null,
  };
}
