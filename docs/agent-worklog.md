# Agent Worklog

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
