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
    colors: ['#073180'],
    colorNames: ['ネイビー'],
  },
  '阪神': {
    code: 'T',
    official: '阪神タイガース',
    colors: ['#FFE100'],
    colorNames: ['イエロー'],
  },
  '巨人': {
    code: 'G',
    official: '読売ジャイアンツ',
    colors: ['#F97709', '#FFFFFF', '#000000', '#808080'],
    colorNames: ['Family-Orange', 'Gentle-White', 'Pioneer-Black', 'City-Gray'],
  },
  'DeNA': {
    code: 'DB',
    official: '横浜DeNAベイスターズ',
    colors: ['#00345D', '#FFE100'],
    colorNames: ['YOKOHAMA BLUE', 'イエロー'],
  },
  '横浜DeNA': {
    code: 'DB',
    official: '横浜DeNAベイスターズ',
    colors: ['#00345D', '#FFE100'],
    colorNames: ['YOKOHAMA BLUE', 'イエロー'],
  },
  '広島': {
    code: 'C',
    official: '広島東洋カープ',
    colors: ['#E50012'],
    colorNames: ['赤'],
  },
  '中日': {
    code: 'D',
    official: '中日ドラゴンズ',
    colors: ['#002856', '#E50012'],
    colorNames: ['青', '赤'],
  },

  // ─── パ・リーグ ──────────────────────────────────────
  'ソフトバンク': {
    code: 'H',
    official: '福岡ソフトバンクホークス',
    colors: ['#FFD900'],
    colorNames: ['レボリューションイエロー'],
  },
  '日本ハム': {
    code: 'F',
    official: '北海道日本ハムファイターズ',
    colors: ['#003087', '#FFFFFF', '#1A1A1A'],
    colorNames: ['FIGHTERS BLUE', 'SNOW WHITE', 'INVICTUS BLACK'],
  },
  '楽天': {
    code: 'E',
    official: '東北楽天ゴールデンイーグルス',
    colors: ['#870116', '#0A1F4E'],
    colorNames: ['クリムゾンレッド', 'ヴィクトリーネイビー'],
  },
  'ロッテ': {
    code: 'M',
    official: '千葉ロッテマリーンズ',
    colors: ['#FFFFFF', '#1A1A1A', '#808080'],
    colorNames: ['白', '黒', 'グレー'],
  },
  'オリックス': {
    code: 'B',
    official: 'オリックス・バファローズ',
    colors: ['#001E43'],
    colorNames: ['ネイビー'],
  },
  '西武': {
    code: 'L',
    official: '埼玉西武ライオンズ',
    colors: ['#1B4497', '#2060CF', '#1A1A1A'],
    colorNames: ['レジェンドブルー', 'ライオンズブルー', '西鉄ブラック'],
  },
};

// 背景色の明るさに応じて読みやすい文字色を返す
export function getContrastColor(hex) {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#1A1A2E' : '#FFFFFF';
}
