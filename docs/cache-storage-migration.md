# Cache and Storage Migration Plan

npbinfo の Cloudflare KV 使用量を減らし、用途ごとに保存先を分けるための作業メモ。

## 方針

- HTTP レスポンスの短期キャッシュは Workers Cache API を使う。
- スクレイピング済みの正規化データは D1 に寄せる。
- KV は小さい設定値、手動補正、OGP 生成物など永続キーが必要なものだけに絞る。
- ブラウザ側の再表示キャッシュは既存の localStorage キャッシュを活かす。

## 現在の主な KV 用途

- API レスポンスキャッシュ: `standings`, `stats`, `schedule`, `headtohead`, `recent`, `weather`
- 本塁打補正データ: `hr-adjusted:${year}`
- OGP 生成画像: `images/standings/...`
- 掲示板関連スレッド: Cache API に移行済み

## 実施手順

1. [完了] API レスポンスキャッシュを KV から Cache API に移す。
   - 対象: `getCachedJson`, `putCachedJson`
   - 目的: リクエストごとの KV read/write を止める。
   - 注意: Cache API はデータセンター単位のキャッシュなので、永続保存には使わない。

2. [完了] D1 のスキーマを設計する。
   - 候補テーブル:
     - `standings_snapshots`
     - `player_stats`
     - `games`
     - `team_metrics`
     - `fetch_runs`
   - 年度、リーグ、種別、取得元URL、取得日時を持たせる。
   - 初期スキーマは `migrations/0001_initial_data_cache.sql` に保存。
   - `npbinfo-db` は作成済み。

3. [着手] 更新処理を分離する。
   - 通常リクエストではスクレイピングしない方向へ寄せる。
   - cron / 手動更新 / debug 更新で D1 を更新する。
   - API は基本的に D1 から読む。
   - まず順位表は、DBバインドがある場合に過去年だけD1から読む。
   - 現年度は更新処理ができるまで、鮮度優先で従来のスクレイピングを継続する。
   - 順位表の手動更新API `/api/admin/refresh/standings` を追加済み。
   - 順位表のcron更新処理は実装済み。
   - Dashboard 上の既存 Cron Triggers で毎日 JST 21:30 / 00:30 / 03:30 に `cl` / `pl` を更新する。
   - Cron枠上限のため、`wrangler.jsonc` にはcron設定を書かない。

4. [着手] 過去年データを固定化する。
   - 変わらない年度は D1 に保存し、スクレイピングとキャッシュ更新を止める。
   - 現年度だけ短い Cache API TTL を使う。
   - 順位表は過去年のみD1読み取りを有効化済み。

5. KV の残存用途を棚卸しする。
   - OGP 画像など KV の方が扱いやすいものは残す。
   - JSON レスポンス丸ごと保存は原則やめる。

## 判断基準

- 高頻度に読まれるが永続性が不要: Cache API
- 構造化して検索・集計したい: D1
- 小さいキー単位で永続保存したい: KV
- ファイルや大きめのオブジェクト: R2 または KV 継続を検討

## 参照

- Cloudflare KV limits: https://developers.cloudflare.com/kv/platform/limits/
- Cloudflare D1 limits: https://developers.cloudflare.com/d1/platform/limits/
- Workers Cache API: https://developers.cloudflare.com/workers/runtime-apis/cache/
- Workers Cron Triggers: https://developers.cloudflare.com/workers/configuration/cron-triggers/
