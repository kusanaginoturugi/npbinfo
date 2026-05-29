// NPB12球団のデータ。
// - code:       アイコンに表示する略号
// - official:   正式名称
// - colors:     公式に言及されているチームカラー。colors[0] をアイコンに使用
// - colorNames: 公式発表のカラー名称
//
// 注意: カラーコードは公式には公表されていないため、色名から推測した値です。
//       実際の公式色と異なる場合があるため、必要に応じて手動で更新してください。

export const TEAMS = {
  // ─── セ・リーグ ──────────────────────────────────────
  'ヤクルト': {
    code: 'S',
    official: '東京ヤクルトスワローズ',
    colors: ['#001943', '#EF3E45', '#00A95F'],
    colorNames: ['紺', '赤', '緑'],
  },
  '阪神': {
    code: 'T',
    official: '阪神タイガース',
    colors: ['#FFE600', '#000000'],
    colorNames: ['イエロー', 'ブラック'],
  },
  '巨人': {
    code: 'G',
    official: '読売ジャイアンツ',
    colors: ['#F49C00', '#000000'],
    colorNames: ['オレンジ', 'ブラック'],
  },
  'DeNA': {
    code: 'DB',
    official: '横浜DeNAベイスターズ',
    colors: ['#003F8E', '#B3A269'],
    colorNames: ['横浜ブルー', 'ゴールド'],
  },
  '横浜DeNA': {
    code: 'DB',
    official: '横浜DeNAベイスターズ',
    colors: ['#003F8E', '#B3A269'],
    colorNames: ['横浜ブルー', 'ゴールド'],
  },
  '広島': {
    code: 'C',
    official: '広島東洋カープ',
    colors: ['#CC0000'],
    colorNames: ['広島赤'],
  },
  '中日': {
    code: 'D',
    official: '中日ドラゴンズ',
    colors: ['#0035AD', '#FFFFFF'],
    colorNames: ['ドラゴンズブルー', 'ホワイト'],
  },

  // ─── パ・リーグ ──────────────────────────────────────
  'ソフトバンク': {
    code: 'H',
    official: '福岡ソフトバンクホークス',
    colors: ['#F3C945', '#000000'],
    colorNames: ['レボリューションイエロー', 'ブラック'],
  },
  '日本ハム': {
    code: 'F',
    official: '北海道日本ハムファイターズ',
    colors: ['#005496', '#FFFFFF', '#000000'],
    colorNames: ['ファイターズブルー', 'ホワイト', 'ブラック'],
  },
  '楽天': {
    code: 'E',
    official: '東北楽天ゴールデンイーグルス',
    colors: ['#870011', '#EAAA00'],
    colorNames: ['クリムゾンレッド', 'ゴールド'],
  },
  'ロッテ': {
    code: 'M',
    official: '千葉ロッテマリーンズ',
    colors: ['#000000', '#FFFFFF', '#9F9FA0'],
    colorNames: ['ブラック', 'ホワイト', 'シルバー'],
  },
  'オリックス': {
    code: 'B',
    official: 'オリックス・バファローズ',
    colors: ['#000019', '#B3A269'],
    colorNames: ['紺', 'ゴールド'],
  },
  '西武': {
    code: 'L',
    official: '埼玉西武ライオンズ',
    colors: ['#1F2D53'],
    colorNames: ['レジェンドブルー'],
  },
};

// 短縮名・公式名称どちらでもチーム情報を返す
export function getTeamInfo(name) {
  if (!name) return null;
  if (TEAMS[name]) return TEAMS[name];

  return Object.values(TEAMS).find((info) => info.official === name) ?? null;
}

// お気に入りなどのストレージ用キーを短縮名に揃える
export function normalizeTeamName(name) {
  if (!name) return name;
  if (TEAMS[name]) return name;

  for (const [shortName, info] of Object.entries(TEAMS)) {
    if (info.official === name) return shortName;
  }

  return name;
}

// 背景色の明るさに応じて読みやすい文字色を返す
export function getContrastColor(hex) {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#1A1A2E' : '#FFFFFF';
}
