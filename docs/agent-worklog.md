# Agent Worklog

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

### Handoff

- `.gemini/` はローカルエージェント設定として `.gitignore` 対象。
- `npm run build` は成功。
- `npx eslint .` は既存の `react-hooks/set-state-in-effect`、Worker の `HTMLRewriter` global、未使用変数などで失敗する状態。今回追加した build 定数の `no-undef` は `eslint.config.js` で解消済み。
- 最終 deploy 済み。Cloudflare Workers Version ID: `47e58bf0-7044-4a0a-904c-d2b8a1c29626`。
