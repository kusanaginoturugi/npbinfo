# Agent Worklog

## 2026-07-14

### Plan

- Issue #38 対応。操作系UIのクラス命名ルールを文書化し、意味違いのクラス流用と重複inline styleを解消する。

### Work Log

- `src/App.css` の操作系セクション冒頭に命名ルールのコメントを追加した。
  - `.tab-bar` / `.tab-btn`: 画面・カテゴリ切替のタブ専用
  - `.control-select` / `.control-input` / `.control-button`: フォーム操作
  - `.segmented-control(-btn)`: 表示モード等の排他切替
  - `.filter-chip-bar` / `.filter-chip`: 複数選択フィルタ（checkbox チップ）
  - `.updated-note`: 取得日時などの補足表示
- `.filter-chip` / `.filter-chip-bar` を新設し、`PlayerStats.jsx` のチームフィルタの `.tab-btn` 流用を解消した。
  - チームカラー（動的値）のみ inline style として残した。
- `.controls-row-secondary` を追加し、`PlayerStats.jsx` の2段目操作行の inline style を置き換えた。
- 3画面（`Standings` / `Schedule` / `PlayerStats`）で重複していた「取得日時」の inline style を `.updated-note` に統一した。

### Verification

- `npm run build` 成功。
- `npm run dev` + headless chromium で `/stats/batting/central/2026` をスクショ確認。
  - チップのチームカラー枠・操作行との高さ整列・取得日時の右寄せ表示を目視確認。
- lint の6件（`Schedule.jsx` の react-hooks）は変更前から存在する既存問題（stash比較で確認）。

### Work Log (2): チームページに対戦相手別 対戦成績を追加

- `src/components/TeamHeadToHead.jsx` を新規作成した。
  - 既存の `/api/headtohead/:league?year=` からデータを取得（新API追加なし）。
  - `9-5` / `6-5(1)` 形式（勝-敗(分)）をパースし、リーグ戦・交流戦の2テーブルで勝・敗・分・勝率を表示。
- `TeamTimeline.jsx` の見出し直下に `TeamHeadToHead` を配置した。
  - ページ構成は「対戦成績 → 関連ポスト」。サブタイトルを「チーム情報」に変更。
- `App.css` に `.team-page-block-title` / `.h2h-tables` / `.h2h-table(-title)` / `.h2h-dot` を追加。
  - テーブル本体は `.standings-table` を再利用。チームカラーのみ inline style。

### Verification (2)

- `npm run build` / lint 通過。
- headless chromium で `/teams/hanshin` をスクショ確認。
  - リーグ戦5球団・交流戦6球団、引き分けのパース（広島 6-5(1) → 6勝5敗1分 .545）を目視確認。

### Work Log (3): チームページを12球団対応に拡張

- `shared/teams.js` の各球団定義に `slug` を追加し、`getTeamBySlug()` を新設した。
  - slug: `yakult` / `hanshin` / `giants` / `dena` / `hiroshima` / `chunichi` / `softbank` / `nipponham` / `rakuten` / `lotte` / `orix` / `seibu`
  - 既存URL `/teams/hanshin` は互換維持。
- `src/utils/routes.js` の `/teams/:slug` を全スラッグ対応にした。
- `src/App.jsx` の `openTeam` から阪神ガードを外し、チーム名→slugで遷移するようにした。
- `src/components/Standings.jsx` で順位表の全チーム名をクリック可能にした。
- `src/components/TeamTimeline.jsx` を `teamSlug` prop対応にした。
  - Xリスト（`X_LIST_URLS`）があるチーム（阪神・DeNA）だけ「関連ポスト」欄を表示。
  - 他の10球団は対戦相手別 対戦成績のみ表示。

### Verification (3)

- `npm run build` / lint / `npm test`（9件）通過。
  - lint既存問題（`Schedule.jsx` のreact-hooks、`shared/teams.js` の全角スペースregex）は変更前から存在（stash比較で確認）。
- headless chromium で `/teams/softbank`（パ・リーグ側）と `/teams/hanshin` をスクショ確認。
- 順位表DOMで `team-detail-link` が全6チームに付与されることを確認。

### Work Log (4): 選手成績チームフィルタチップの配色改善

- 未選択チップのチームカラー文字・枠を廃止（白背景に阪神の黄色が視認できない問題）。
  - 順位表と同じ「チームカラーの丸 + 通常色テキスト」方式に変更。
  - 選択時は従来どおりチームカラー背景 + コントラスト文字色。
- `.h2h-dot` を汎用の `.team-color-dot` に改名し、対戦成績テーブルとチップで共用。
- 選択中はチップ背景と丸が同色になるため、`.filter-chip.active .team-color-dot` で文字色リングを表示。

### Verification (4)

- `npm run build` / lint 通過。
- headless chromium で `/stats/batting/central/2026` のチップ列をスクショ確認。全6球団とも白背景で視認可能。

### Work Log (5): グラフのチーム判別性改善（二色目の縁取り）

- 背景: パ・リーグはロッテ #000000 / オリックス #000019 / 西武 #1F2D53 が主色だけでは判別不能。
  - カラーバリデータで確認: オリックス↔ロッテ ΔE 11.9（色覚多様性下 2.6）。二次エンコーディング必須。
  - 改善3案（縁取り / glow / 現状）をartifactモックで比較し、縁取り案を採用。
    - https://claude.ai/code/artifact/5efe43f3-41c5-47d2-853b-d7ee2453b955
- `shared/teams.js` に `getTeamPipingColors(name)` を新設。
  - `colors[1]` 以降から、テーマ別に背景とコントラストのある色を選ぶ（ライト: 輝度<0.82、ダーク: 輝度>0.35）。
  - ロッテはライトで白→銀にフォールバック。西武・広島は該当なし=縁なし（それ自体が識別子）。
- レーダー: 縁取りポリゴン（5.5px）を主色線（2.5px）の下に敷く。凡例スウォッチにも同じ縁取り。
- 棒グラフ: バーに1.5pxの縁取り。
- 縁取り色はCSS変数 `--pipe-light` / `--pipe-dark` で持ち、`[data-theme="dark"]` で切替（再レンダリング不要）。

### Verification (5)

- `npm run build` / lint 通過。
- 棒グラフはライト・ダーク両テーマでスクショ確認（ライト: オリックス金縁/ロッテ銀縁、ダーク: ロッテ白縁）。
- レーダーはローカルKVに補正本塁打データが無く未描画（既存挙動）のため、本番デプロイ後に確認する。

## 2026-07-15

### Work Log (6): レーダーの勝率を守備率に置き換え

- 背景: 勝率は他5指標の結果であり、レーダーの軸として不適切（ユーザー指摘）。
  - 代替候補の検討: 失策は選手個人に目が行きやすいため却下、奪三振はチーム貢献度が薄く却下 → 守備率を採用。
  - DER近似（守備範囲・打球処理）と守備率（無失策処理率）は補完関係にあり重複しない。
- `worker/index.js`: 順位表ハンドラで `tmf_{c|p}.html`（チーム守備成績）も並列取得し、守備率カラム（index 1）を `fieldingPct` として付与。
  - `parseExtraStats` を流用（テーブル構造は tmb/tmp と同一、legacy ≤2024 も同レイアウト）。
  - キャッシュキーを `standings:v5:` → `standings:v6:` に更新（フィールド追加のため）。
- `stats-worker/index.js`: キャッシュ削除キーを `standings:v6:` に追随。
- `StandingsRadar.jsx`: METRICS から勝率を削除し守備率を追加（6軸維持）。
  - `buildSeries` を動的化: 全チームで値が揃う指標だけ軸にする（旧キャッシュ・過去年に無い指標は落とす）。3軸未満なら未描画。
- `StandingsBars.jsx`: 比較グラフにも守備率を追加。

### Verification (6)

- `node --check` / `npm run build` / `npm test`（9件）通過。lint残件は既存問題のみ。
- ローカルAPIで `fieldingPct` の付与を確認（例: ソフトバンク .990、オリックス .992）。
- headless chromium でレーダーをスクショ確認。ローカルは hrAdjusted 欠損のため動的フィルタで5軸描画（守備率・OPS・盗塁・防御率・DER近似）。本番は6軸になる想定、デプロイ後に確認。

### Work Log (7): AIチームコメントの基盤（issue #13 PoC）

- 方針: push 型アーキテクチャを採用。生成は自宅マシンのバッチが行い、Worker は保存と配信のみ。
  - Cloudflare Workers は tailnet に入れないため、pull 型だと llama.cpp の外部公開（Tailscale Funnel 等）が必要になる。push 型なら inbound 公開ゼロ。
  - 生成側は OpenAI 互換 API 前提。評価フェーズは Gemini 無料枠（`gemini-2.5-flash`）、将来は base URL 差し替えだけで自宅 llama.cpp（`http://localhost:8080/v1`）へ移行できる。
- `migrations/0002_ai_comments.sql`: `ai_comments` テーブル新設。
  - `(subject_type, subject_key, year, generated_at)` UNIQUE。履歴を残し、読み出しは最新1件。
  - `model` カラムで生成モデルを記録（Gemini 期と llama.cpp 期の品質比較用）。
- `worker/index.js`:
  - GET `/api/ai/comments/:type/:key?year=` — 最新コメントを返す（無ければ `{comment: null}`）。
  - POST `/api/ai/comments` — 認証は既存の `REFRESH_TOKEN`（`isRefreshAuthorized` 流用）。単体/配列（`items`）両対応、バリデーションあり。
- `scripts/generate-ai-comments.sh`: 生成バッチ（sh + curl + jq）。
  - 順位表 API から 12 球団分の成績表を組み立て、チームごとに約200字の調子コメントを生成して push。
  - 環境変数: `LLM_API_KEY` / `REFRESH_TOKEN`（必須）、`LLM_BASE_URL` / `LLM_MODEL` / `NPBINFO_BASE_URL` / `YEAR` / `LLM_SLEEP`（任意）。
- `src/components/TeamAiComment.jsx`: チームページ見出し直下に「AIコメント」ブロックを表示。データが無いチームは非表示。
  - AI 生成である旨・モデル名・生成日を注記。

### Verification (7)

- `node --check` / `npm run build` / `npm test`（9件）通過。lint 残件は既存問題のみ（stash 比較で確認）。
- ローカル D1 に migration 適用後、`wrangler dev` に対して POST → GET の往復、負系（不正 subjectType / 不正 JSON で 400、未登録チームで `comment: null`）を確認。
- `/teams/hanshin` に手動投入コメントが表示されることをスクショ確認。
- 生成スクリプトは `sh -n` と順位表整形部分（jq）を実機確認。LLM 呼び出しは Gemini API キー投入後に実行予定。
- ユーザーの初回実行で全件 404 → 原因は Gemini OpenAI 互換 API のモデル ID に `models/` プレフィックスが必須なこと。既定値を `models/gemini-2.5-flash` に修正。
  - 合わせて `curl -f` がエラー本文を捨てていたのを改め、`.error.message` を stderr に出すようにした（Gemini はエラーを配列で返すことがある点も対応）。
- `models/gemini-2.5-flash` は「新規ユーザーには提供終了」エラーになったため、既定値を `models/gemini-3.5-flash` に更新（ユーザー実機で動作確認済み）。
  - Gemini は古いモデルを順次閉じるので、エラー時は `/v1beta/openai/models` で一覧を確認して差し替える旨をスクリプトにコメントした。
- 本番初回生成: 2026-07-15 に 12 球団分を Gemini 無料枠で生成・投入し、`/teams/hanshin` の表示をスクショ確認。
  - 初回実行中に「high demand」一時エラーで日本ハムのみ歯抜け → リトライ（最大3回、間隔逓増）と `TEAMS` フィルタ（空白区切りで対象を絞る）をスクリプトに追加。ユーザーが `TEAMS=日本ハム` で再実行し 12/12 完了。
- 定期実行: systemd user timer の雛形を `systemd/` に追加（毎日 01:00、`Persistent=true`）。
  - `npbinfo-ai-comments.service` / `.timer` / `ai-comments.env.example` の3ファイル。
  - シークレットはリポジトリ外の `~/.config/npbinfo/ai-comments.env`（600）から `EnvironmentFile` で読む。
  - ユーザーのマシンには units コピー・`daemon-reload`・env 雛形設置まで実施済み。キー記入と `systemctl --user enable --now npbinfo-ai-comments.timer` はユーザー側で行う。
- 本番 `REFRESH_TOKEN` secret は設定済みであることを確認（新規 secret 不要）。
- デプロイ時の追加手順: `npx wrangler d1 migrations apply npbinfo-db --remote`。

## 2026-07-03

### Plan

- Issue #12 の代替ソーシャル情報として、5ch の subject.txt から関連スレッド一覧を表示する。
- KV 操作数アラート対策として、APIレスポンスキャッシュを Workers Cache API へ移す。
- スクレイピング済みデータの永続保存先として D1 を導入し、順位表から段階移行する。
- 手動更新APIと既存Cronで D1 を温める導線を作る。

### Work Log

- `/threads` 画面と `/api/threads` を追加した。
  - 5ch の `野球ch` / `プロ野球` の `subject.txt` を取得し、球団名・愛称で関連スレッドを抽出する。
  - レス本文は取得せず、スレタイ、レス数、掲載順位、5chリンクだけを表示する。
  - 前回snapshotとの差分から `speedPerHour` を算出し、勢い順・レス数順・掲載順・板別の並び替えを追加した。
- APIレスポンスキャッシュを KV から Workers Cache API に移した。
  - `standings`, `stats`, `schedule`, `headtohead`, `recent`, `weather` のリクエストごとのKV read/writeを止めた。
  - 掲示板snapshotも Cache API に置き、掲示板機能でKVを消費しないようにした。
- `npbinfo-db` D1 database を作成し、`DB` binding を `wrangler.jsonc` に追加した。
  - `migrations/0001_initial_data_cache.sql` を追加し、local / remote に適用した。
  - `fetch_runs`, `standings_payloads`, `standings_snapshots`, `player_stats`, `games`, `team_metrics` を作成した。
- 順位表のD1連携を追加した。
  - 過去年はD1の最新 `standings_payloads` から読む。
  - 現年度は鮮度優先で従来スクレイピングを継続する。
  - スクレイピング後はD1へ `payload_json` と正規化行を保存する。
- `POST /api/admin/refresh/standings` を追加した。
  - 本番は `Authorization: Bearer $REFRESH_TOKEN` 必須。
  - ローカルは `REFRESH_TOKEN` 未設定でも `localhost` / `127.0.0.1` から許可する。
- `scheduled()` handler を追加し、既存Cronからセ・パ順位表をD1へ保存できるようにした。
  - Dashboard上の既存Cronは JST 21:30 / 00:30 / 03:30。
  - Cron枠上限に当たるため、`wrangler.jsonc` にはcron設定を書かない。
- `docs/cache-storage-migration.md` と `docs/d1-setup.md` を追加し、移行方針・D1セットアップ・手動更新手順を記録した。
- 本番Workerへdeployし、`REFRESH_TOKEN` secret を設定した。
- 本番管理APIで `2026 cl` / `2026 pl` をD1へ保存した。

### Verification

- `node --check worker/index.js` 成功。
- `sqlite3 :memory: < migrations/0001_initial_data_cache.sql` 成功。
- `npm test` 成功。
- `npm run build` 成功。
- ローカルWranglerで `/api/threads`, `/api/standings`, `/api/admin/refresh/standings` を確認した。
- リモートD1で `standings_snapshots` に `2026 cl` 6行、`2026 pl` 6行が保存されていることを確認した。
- 本番 `/api/debug` と `/api/standings/cl?year=2026` を確認した。
- 最新本番 Worker Version ID は `7d675d48-ff6a-491f-b889-f11944d1d130`。

### Handoff

- Dashboard上の既存Cronは残っており、最新Workerには `scheduled` handler がある。
- `wrangler.jsonc` にcronを書くとCloudflare APIがcron上限エラーを返すため、cronはDashboard管理のままにする。
- 本番の `gitRevision` は未コミットdeploy時点の `a3c705f` のまま。commit/push後のdeployで揃う。
- `REFRESH_TOKEN` はWorker secretに設定済み。ローカルの一時ファイルは削除済み。
- 次の段階は `player_stats` と `games` のD1移行、または既存KV用途の棚卸し。

## 2026-06-08

### Plan

- 現状コードを評価し、レポートと Issue にまとめる。
- 気になる点を Issue 化し（#32〜#36）、優先度順に潰す。
- まず #32（テスト基盤）から着手する。

### Work Log

- コードレビュー結果を `docs/code-review-2026-06-08.md` に出力した。
- 気になる点 5 件を Issue 化（#32 テスト / #33 worker分割 / #34 HTMLRewriter共通化 /
  #35 チーム名マスタ統合 / #36 自前PNGの要否）。
- #32 着手: `node --test` でスクレイピングパーサの単体テストを追加。
  - `shared/hrParkFactor.js` の純粋関数 4 つ（チーム名正規化・球場名正規化・
    試合詳細パース・本塁打中立換算）を対象にした。
  - `parseNpbGameDetail` は npb.jp の実 HTML（2024/05/01 巨人対ヤクルト）を
    `test/fixtures/` に固定し、HTML 構造変更を検知できるようにした。
  - `package.json` に `test` スクリプト、`.github/workflows/ci.yml` に push/PR の CI を追加。

### Verification

- `npm test` で 7 テストすべて緑（pass 7 / fail 0）。

## 2026-06-07

### Plan

- 本塁打パークファクターの根拠、計算方法、注意点を人間向け画面に記載する。
- 順位表と補正集計の締め日を同期し、2026年バンテリンドームを補正対象外にする。
- NPB公式本塁打数との一致を確認して本番へ反映する。

### Work Log

- `/methodology/home-run-park-factor` を追加し、対象データ、計算手順、計算式、
  平均への回帰、指標の限界、参照元を記載した。
- 順位表の補足から「計算方法」で専用ページへ移動できるようにした。
- OGP Workerが順位表の反映日をStats Workerへ渡し、補正集計の締め日を同期するようにした。
- 実本塁打数と集計値が一致しないチームは補正値を表示しない安全策を追加した。
- 2026年のバンテリンドームはホームランウイング新設のため係数を `1.000` とした。
- コールドゲームを終了時刻でも完了判定し、2023〜2025年の対象を2,598試合へ更新した。
- NPB公式への反映前でも甲子園開催試合の中止を表示できるよう、甲子園公式サイトの
  当日告知を日付・ホーム球団・対戦相手で照合する補助取得を追加した。
- 当月の日程キャッシュを1分へ短縮し、中止理由と甲子園公式への出典リンクを表示した。

### Verification

- `npm run build`、対象ファイルのESLint、`git diff --check` が成功。
- 2026年6月6日までの342試合を集計し、セ・パ12球団すべてでNPB公式本塁打数と一致。
- 計算方法ページを1280pxと390px幅で確認し、表示崩れなし。
- 6月7日の阪神対楽天戦だけが `中止` となり、理由と甲子園公式リンクが表示されることを
  本番APIと1280px幅の画面で確認した。他の同日5試合は変更されていない。
- Stats Worker `6ddf03e4-f6c3-41f2-a58e-937bde2a42dd`、
  OGP Worker `37ecf9b2-cc35-4a0f-a2dd-348b727d8d7d`、
  メイン Worker `3bcd5a41-ea4a-4029-af26-68a0740d5153` をデプロイした。

### Handoff

- 補正値はNPB公式値ではなく独自推定。順位・勝敗には使用しない。
- OGP Workerの既存cronが画像生成前にStats Workerを呼ぶため、追加cronは不要。
- 2027年以降はバンテリンドームの2026年実績を確認し、年度別例外の継続を再判断する。
- 甲子園公式の補助取得に失敗した場合はNPB公式データだけで継続し、日程API全体は失敗させない。

## 2026-06-06

### Plan

- Issue #30 の英語による人間向け画面 URL を追加する。
- 既存 API を変更せず、画面選択と URL、ブラウザ履歴を同期する。
- 順位表から阪神タイガースの詳細画面を開き、X公開Listを表示する。

### Work Log

- 順位表、選手成績、試合日程、球場情報に直接アクセスできる URL を追加した。
- 画面内のリーグ、年度、種別、月、球場選択で URL が更新されるようにした。
- ブラウザの戻る・進むと不正な URL の既定画面への正規化に対応した。
- SPA の直リンクを Worker から返せるよう、Static Assets の `ASSETS` binding を明示した。
- 既存の `/api/*` エンドポイントは変更していない。
- `/teams/hanshin` を追加し、順位表の阪神チーム名から遷移できるようにした。
- 阪神詳細画面にX公開List `2063091274643886176` の公式埋め込みを追加した。
- X埋め込みがブロックまたはレート制限された場合は、公開Listを直接開くリンクを表示する。

### Verification

- `npm run build` 成功。
- ルート解析で順位表、選手成績、試合日程、球場情報、不正 URL の正規化を確認。
- Vite + Cloudflare 開発サーバで主要な直リンクがすべて `200 text/html` を返すことを確認。
- 本番へ deploy 済み。Cloudflare Workers Version ID: `88b2276d-e722-463d-8c7c-39e635054aad`。
- 対象全体の ESLint は既存の `react-hooks/set-state-in-effect` などで失敗。新規の `App.jsx` と `routes.js` は ESLint 成功。

## 2026-06-08

### Plan

- 本番 Worker の build 情報を確認し、Cloudflare 側の反映状態を切り分ける。
- Git 連携ビルドを再実行するため、空コミットを `main` に push する。

### Work Log

- `/api/debug` で本番の `gitRevision` が `0e672b6` のまま止まっていることを確認した。
- ローカルと `origin/main` の HEAD は `d13e035` で、本番との差分がある状態を確認した。
- Cloudflare のプロダクションブランチ設定が `main` ではない可能性を確認した。
- Cloudflare の Git 連携ビルドを起動するため、空コミットを作成して push する。

### Handoff

- push 後は `curl -s https://npbinfo.kusanaginoturugi.workers.dev/api/debug` で `gitRevision` を確認する。
- `gitRevision` が `d13e035` または空コミットの短縮 SHA になれば、本番 Worker は更新済み。

## 2026-06-05

### Plan

- debug モードを画面と API の両方で確認できるようにする。
- deploy 後の反映確認用に App/API buildId を表示する。
- 試合日程の補助表示を実際のデータ鮮度に合わせて調整する。

### Work Log

- `/api/debug` を追加し、buildId/buildTime/gitRevision を no-store で返すようにした。
- Vite define でクライアントと Worker に同じ build 情報を埋め込むようにした。
- フッターに App/API buildId と debug 時の更新確認ボタンを追加した。
- debug 時は順位表、選手成績、試合日程の fetch に `nocache=1&t=...` を付けるようにした。
- 順位表の localStorage キャッシュキーを `standings:v2:...` に上げ、古いグラフ項目なしキャッシュを踏まないようにした。
- 試合日程の直近勝敗バッジを日付昇順にし、表示サイズを調整した。
- 試合日程の天気表示を `天気 取得中` / `天気 晴 最高 ... / 最低 ... 降水 ...` の形にした。
- スコア未掲載の試合では `試合前` チップを出さず、確定状態の `終了` / `中止` だけ表示するようにした。
- 試合日程の球場名と天気チップをクリック可能にし、球場情報タブで対象球場を開けるようにした。
- 天気取得中表示を `天気 ☁️` に変更し、状態表示の文言を減らした。
- `/og/standings/:league.png` を追加し、OGP 用順位表 PNG を返すようにした。
- 既存の `/og/standings/:league` SVG エンドポイントは維持した。
- トップページの `og:image` / `twitter:image` を PNG URL に切り替えた。
- OGP 生成を `og-worker/` に分離し、Cloudflare Browser Rendering で日本語の順位表と
  チーム打率・OPS・防御率グラフを PNG 化して共通 KV に保存する構成を追加した。
- JST 21:30 と 00:30 は順位データ変更時のみ、03:30 は保険として強制生成する。
- メイン Worker は Browser Rendering 画像を優先し、未生成時は従来画像へフォールバックする。
- OGP Worker `2f9584ec-b936-4488-a53c-70dea28ca18f` とメイン Worker
  `8c2e3bb9-6b21-4169-8650-4c7845f99900` をデプロイした。
- 本番で3リーグの PNG 生成を実行し、1200x630、日本語表示、KV経由の配信、
  `X-OGP-Source: browser-run` を確認した。
- 試合日程カードの終了試合にスコアと「試合終了」を表示し、両チームへ勝・敗・分を付けた。
- 勝者を強調し、敗者を抑えた表示に変更した。NPBのスコアリンクは「試合詳細」とした。
- 終了試合カードをデスクトップと390px幅で確認し、横並び・縦並びともに崩れがないことを確認した。
- 試合結果表示を Cloudflare Workers Version
  `f98e1333-bee1-4009-acb7-7073b07e50c5` としてデプロイした。
- ローカルの Gemini 設定を commit 対象から外すため、`.gemini/` を `.gitignore` に追加した。
- 試合日程の日付選択後に当日へ戻る不具合を修正した。選択日が候補にある間は維持し、
  月変更などで候補外になった場合だけ当日または最初の開催日へ補正する。
- 日付選択修正を Cloudflare Workers Version
  `47e58bf0-7044-4a0a-904c-d2b8a1c29626` としてデプロイした。
- 順位表APIへNPB公式チーム守備成績の失策数を追加した。
- 順位表グラフの打率を失策へ置き換え、棒グラフは少ない順、レーダーは
  「守備安定」として失策が少ないほど高評価にした。
- メイン Worker `af89be86-a135-4f92-933a-318f808a3cca` と OGP Worker
  `eeb64fea-c739-4d24-a809-23289c1b5436` をデプロイした。
- 本番APIでセ・パ12球団の失策数を確認し、失策グラフ入りOGPを3リーグ分再生成した。
- NPB公式の2023〜2025年、2,598試合から本塁打パークファクターを生成する
  `scripts/build-hr-park-factors.mjs` を追加した。
- 球場での両軍本塁打/試合を主催球団のビジター試合と比較し、60試合相当を
  平均へ回帰した係数を `src/data/hrParkFactors.generated.js` に保存した。
- 当年の未処理試合を日次で集計する `npbinfo-stats-updater` Workerを追加した。
- 順位表は実本塁打の横に中立球場換算値を表示し、本塁打グラフとレーダーは補正値を使う。
- `/api/park-factors/hr` で係数と算出条件を確認できるようにした。
- 順位表の更新日と補正集計の締め日を揃え、実本塁打数が一致しない場合は補正値を
  表示しないようにした。
- 2026年のバンテリンドームはホームランテラス新設のため、係数を `1.000` として
  過去3年の補正対象から外した。
- `/methodology/home-run-park-factor` にデータ出典、計算式、平均への回帰、
  2026年バンテリンドームの例外、指標の限界を記載した。
- NPB詳細ページのコールドゲームは通常の「試合終了」表示がないため、終了時刻でも
  完了判定するよう修正した。これにより阪神の公式本塁打数との差1本を解消した。

### Handoff

- `.gemini/` はローカルエージェント設定として `.gitignore` 対象。
- `npm run build` は成功。
- `npx eslint .` は既存の `react-hooks/set-state-in-effect`、Worker の `HTMLRewriter` global、未使用変数などで失敗する状態。今回追加した build 定数の `no-undef` は `eslint.config.js` で解消済み。
- 最終 deploy 済み。Cloudflare Workers Version ID: `af89be86-a135-4f92-933a-318f808a3cca`。
