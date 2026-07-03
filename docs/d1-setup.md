# D1 Setup

npbinfo のスクレイピング済みデータを D1 に保存するためのセットアップ手順。

## 初回作成

```sh
npx wrangler d1 create npbinfo-db
```

2026-07-03 時点で `npbinfo-db` は作成済み。

既存DBの確認:

```sh
npx wrangler d1 list
```

出力された `database_id` を `wrangler.jsonc` に追加する。

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "npbinfo-db",
    "database_id": "07f6969c-53b7-4a61-8651-de7697d07555"
  }
]
```

## マイグレーション

ローカル:

```sh
npx wrangler d1 migrations apply npbinfo-db --local
```

リモート:

```sh
npx wrangler d1 migrations apply npbinfo-db --remote
```

## 手動更新

本番で管理APIを使うには、先に `REFRESH_TOKEN` を設定する。

```sh
npx wrangler secret put REFRESH_TOKEN
```

順位表の更新:

```sh
curl -X POST \
  -H "Authorization: Bearer $REFRESH_TOKEN" \
  "https://npbinfo.kusanaginoturugi.workers.dev/api/admin/refresh/standings?year=2025&league=cl"
```

`league=all` か省略時は `cl` / `pl` / `cp` / `op` をまとめて更新する。
ローカル開発では `REFRESH_TOKEN` 未設定でも `localhost` / `127.0.0.1` からの更新を許可する。

## Cron 更新

`scheduled()` handler は実装済み。Dashboard 上の既存 Cron Triggers で、毎日
JST 21:30 / 00:30 / 03:30 にセ・パ両リーグを更新する。
Cloudflare の cron は UTC なので、設定値は `30 12 * * *`、`30 15 * * *`、`30 18 * * *`。
Cron枠上限のため、`wrangler.jsonc` にはcron設定を書かない。

ローカル確認:

```sh
npx wrangler dev --test-scheduled
curl "http://127.0.0.1:8787/cdn-cgi/handler/scheduled?format=json"
```

## 現在のスキーマ

- `fetch_runs`: 取得処理の実行記録
- `standings_snapshots`: 順位表の取得スナップショット
- `player_stats`: 選手成績の取得スナップショット
- `games`: 試合日程・結果の取得スナップショット
- `team_metrics`: DER近似などチーム単位の派生指標

## 実装方針

- 通常リクエストでは、まず D1 の最新スナップショットを読む。
- D1 にデータがない場合だけ、既存のスクレイピング処理へフォールバックする。
- debug 更新、cron、手動更新で D1 を更新する。
- APIレスポンスの短期キャッシュは引き続き Workers Cache API を使う。
