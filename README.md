# npbinfo

NPB（日本プロ野球）の順位表、選手成績、試合日程、球場情報を表示する Web アプリ。
フロントは React + Vite、バックエンドは Cloudflare Workers。

## 機能

- 順位表（セ・リーグ / パ・リーグ / 交流戦 / オープン戦）
- 選手成績（打撃 / 投手）の一覧表示・列ソート
- 試合日程・結果（日付ごとのカード一覧）
- 直近5試合の勝敗、対戦成績、球場天気の補助表示
- 球場情報（12球団本拠地一覧・地図・詳細）
- ダークモード切り替え
- 年度切り替え（直近 12 年分）
- debug モード（`?debug=1`）でキャッシュを無視した再取得と App/API buildId の確認
- OGP 用の順位表 PNG / SVG 配信
- 主要画面を直接開ける英語の人間向け URL

## データソース

- 順位表: [npb.jp](https://npb.jp) の公式順位表を `HTMLRewriter` でスクレイピング
- 選手成績: [npb.jp](https://npb.jp) の公式成績ページを `HTMLRewriter` でスクレイピング
- 試合日程: [npb.jp](https://npb.jp) の月別日程ページを `HTMLRewriter` でスクレイピング
- 天気: [Open-Meteo](https://open-meteo.com/) の日次予報 / 過去天気 API
- 球場情報: [npb.jp](https://npb.jp/stadium/) の球場詳細 JSON をもとにした静的データ

## 構成

```
src/                React アプリ本体
  components/       Standings, PlayerStats, Schedule, Stadiums
  data/teams.js     チームコード/名称マッピング
  data/stadiums.js  球場情報の静的データ
worker/index.js     Cloudflare Workers エントリ（API + 静的配信）
public/             favicon など
wrangler.jsonc      Cloudflare Workers 設定
vite.config.js      Vite + @cloudflare/vite-plugin
```

## 開発

依存をインストール:

```sh
npm install
```

開発サーバ（Vite + Wrangler 同時起動。Workers と同じランタイムで動く）:

```sh
npm run dev
```

ビルド:

```sh
npm run build
```

ローカルで本番相当をプレビュー（build → wrangler dev）:

```sh
npm run preview
```

## デプロイ

Cloudflare Workers にデプロイする。`wrangler login` 済みであること。

```sh
npm run deploy
```

`wrangler.jsonc` で `assets.not_found_handling: "single-page-application"` を指定しており、`/api/*` 以外は `dist/` の静的アセットにフォールバックする SPA 構成。

## API

| メソッド | パス | 説明 |
| --- | --- | --- |
| GET | `/api/standings/:league` | 順位表。`league` は `cl` / `pl` / `cp` / `op` |
| GET | `/api/stats/batting/:league?year=YYYY` | 打撃成績。`league` は `cl` / `pl` |
| GET | `/api/stats/pitching/:league?year=YYYY` | 投手成績。`league` は `cl` / `pl` |
| GET | `/api/schedule/YYYY-MM` | 月別の試合日程・結果 |
| GET | `/api/debug` | App/API の buildId、buildTime、gitRevision |
| GET | `/og/standings/:league.png` | OGP 用順位表 PNG。`league` は `cl` / `pl` / `cp` / `op` |
| GET | `/og/standings/:league` | OGP 用順位表 SVG。既存互換用 |

`year` 省略時は当年。指定可能なのは直近 12 年。

## 画面 URL

| パス | 表示内容 |
| --- | --- |
| `/standings/central/2026` | セ・リーグ順位表 |
| `/standings/pacific/2026` | パ・リーグ順位表 |
| `/standings/interleague/2026` | 交流戦順位表 |
| `/stats/batting/central/2026` | セ・リーグ打撃成績 |
| `/stats/pitching/pacific/2026` | パ・リーグ投手成績 |
| `/schedule/2026-06` | 2026年6月の試合日程 |
| `/stadiums/081` | 球場情報（東京ドーム） |

画面 URL は History API で切り替わり、ブラウザの戻る・進むと直リンクに対応する。
