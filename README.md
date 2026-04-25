# npbinfo

NPB（日本プロ野球）の順位表と選手成績を表示する Web アプリ。
フロントは React + Vite、バックエンドは Cloudflare Workers（本番）と Node.js / Express（ローカル開発用）の二本立て。

## 機能

- 順位表（セ・リーグ / パ・リーグ / 交流戦 / オープン戦）
- 選手成績（打撃 / 投手）の一覧表示・列ソート
- ダークモード切り替え
- 年度切り替え（直近 12 年分）

## データソース

- 順位表: [`npb-result`](https://npb-result.ant-npb.workers.dev) API（非公式 JSON プロキシ）
- 選手成績: [npb.jp](https://npb.jp) の公式成績ページをスクレイピング
  - Workers では `HTMLRewriter` で抽出
  - Node サーバでは `cheerio` で抽出

## 構成

```
src/                React アプリ本体
  components/       Standings, PlayerStats
  data/teams.js     チームコード/名称マッピング
worker/index.js     Cloudflare Workers エントリ（本番 API + 静的配信）
server/index.js     Node 用 Express サーバ（ローカル開発の代替）
public/             favicon など
standalone.html     依存なしで開ける単体版 HTML
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

Node + Express で代替する場合（`server/index.js` を `:3001` で起動）:

```sh
npm run dev:node
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

すべて Workers / Express の双方で同じパスを提供する。

| メソッド | パス | 説明 |
| --- | --- | --- |
| GET | `/api/standings/:league` | 順位表。`league` は `cl` / `pl` / `cp` / `op` |
| GET | `/api/stats/batting/:league?year=YYYY` | 打撃成績。`league` は `cl` / `pl` |
| GET | `/api/stats/pitching/:league?year=YYYY` | 投手成績。`league` は `cl` / `pl` |
| GET | `/api/health` | ヘルスチェック（Express のみ） |

`year` 省略時は当年。指定可能なのは直近 12 年。

## standalone.html

ビルドや Node を使わずブラウザだけで動く単体版。動作確認用。
