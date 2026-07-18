# Agent Worklog

## 2026-07-18

### Work Log: 自宅マシンで AI コメント systemd timer をセットアップ

- `~/.config/npbinfo/ai-comments.env` と `~/.config/npbinfo/thread-summaries.env` を
  `systemd/*.env.example` から生成し、`LLM_API_KEY` と `REFRESH_TOKEN` を投入した。
- `~/.config/systemd/user/` にリポジトリの unit ファイル4本を symlink し、
  `npbinfo-ai-comments.timer` (毎日 01:00) と
  `npbinfo-thread-summaries.timer` (08/13/18/21 時) を `enable --now`。
- `scripts/generate-ai-comments.sh` の末尾 `[ "$generated" -eq 0 ] && ...` が
  試合ありの日に必ず exit 1 を返し、systemd 上で service を failed 扱いにする
  バグを `if` 文に置き換えて修正した（全チーム push 自体は元々成功していた）。
- `thread-summaries.env` に `LLM_MODEL=translategemma-12B` を追記し、
  ローカル llama.cpp の実 ID と大文字小文字を合わせた。

### Handoff

- 自宅マシンの `wrangler secret put REFRESH_TOKEN` で Worker 側の値を書き換えた。
  仕事側マシンの `~/.config/npbinfo/*.env` を同じ値に揃えるか、片方の timer を
  停止する必要がある（放置すると仕事側の cron/timer が 401 になる）。
- Gemini `gemini-3.5-flash` の free tier は 1 日 20 リクエストで打ち止め。
  1回の service 実行で 17 プロンプト消費するため、手動テストと 01:00 の
  自動実行を同日中に重ねると quota 超過する。
- `thread-summaries` は現状 5ch `subject.txt` が両板 403 を返すため
  `/api/threads` が空。Worker 側の scraping 修正が必要で、別 issue で対応する。

## 2026-07-17

### Work Log (11): AIコメントを成績・日程ページへ展開（issue #13 次フェーズ）

- `migrations/0003_ai_comments_persona.sql`: `ai_comments` に `persona` カラムを追加（担当キャラの slug）。ローカル適用済み、リモートはデプロイ時に適用する。
- `worker/index.js`: `AI_SUBJECT_TYPES` に `stats` / `schedule` を追加。persona の保存・返却・バリデーションを実装。
- `prompts/stats.txt` / `prompts/schedule.txt`: タスク別ルールを新設（`common.txt` はチーム調子コメント用のまま不変）。
- `scripts/generate-ai-comments.sh`:
  - `SUBJECTS`（既定 `team stats schedule`）で生成対象を絞れるようにした。
  - stats: 打撃/投手 × 両リーグの上位20人ランキングを素材に生成。key は `batting:cl` 形式。
  - schedule: 当日の試合カード + 両リーグ順位表を素材に「今日の見所」記事を生成。key は日付。試合が無い日はスキップ。
  - stats / schedule は `shuf` で `prompts/personas/` の12キャラからランダムに起用し、persona として push する。
- `src/components/AiComment.jsx`: 汎用表示コンポーネントを新設し、`TeamAiComment.jsx` を置き換え（削除）。`showPersona` で「本日の担当: ○○担当」をチームカラードット付きで表示。
- 選手成績ページ（表の下）と試合日程ページ（試合リストの下、選択日を key に取得）に配置した。

### Verification (11)

- `sh -n` と DRY_RUN（team / stats / schedule）でプロンプト合成を確認。
- ローカル D1 + `wrangler dev` で POST/GET・バリデーション・既存 team 互換を確認。
- playwright で成績・日程・チームページの表示を確認。lint の新規エラーなし（`Schedule.jsx` の既存3件のみ）。
- ハマりどころ: `wrangler dev` / `wrangler deploy` は `.wrangler/deploy/config.json` 経由で vite が生成する `dist/npbinfo/` の成果物を使う。worker の変更は `npm run build` 後でないと反映されない。

### Work Log (12): AIコメントのモデル比較ランナー

- `scripts/compare-ai-models.sh` を新設。同一プロンプト（今日の見所 or 成績）を複数モデルに投げて出力を並べる。push はしない。
  - provider: `gemini`（OpenAI 互換） / `openai`（同） / `anthropic`（ネイティブ `/v1/messages`、thinking 常時オンのため max_tokens 8000、temperature 非送信） / `local`（llama.cpp）。
  - キーは `LLM_API_KEY` / `LLM_API_KEY_OPENAI` / `LLM_API_KEY_CLAUDE`。`PERSONA` でキャラ固定、`SUBJECT` でお題指定。
- 比較結果は `docs/ai-model-comparison.md` に記録（キャラ5種 × Gemini/GPT-5.5、ローカル2モデル）。
  - 概況: キャラの芸は Gemini 圧勝、GPT-5.5 は分析・字数が正確、translategemma-12b はキャラ消失+細部の綻び、qwen3-8b は事実捏造でこのタスクには実用未満。claude-fable-5 はクレジット未購入で未実施。

### Verification (12)

- Gemini 無料枠のレート制限（gemini-3.5-flash、20リクエスト規模）に連続実行で接触。リトライで回収。
- ローカルの qwen3-8b 初回ロード失敗の原因は llama-server ルーターの `--models-max` がモデル数しか見ず VRAM 空きを考慮しないこと（`tools/server/server-models.cpp` の `unload_lru()` を確認）。`/etc/conf.d/llama.cpp` を `--models-max 1` に変更して解決（リポジトリ外の設定）。

### Work Log (13): 5chスレの話題まとめ（ローカルLLMの地味仕事）

- 方針: キャラ芸が不要で頻度が高く無料であることが効くタスクをローカル LLM に割り当てる（モデル比較の結論を反映）。
- `scripts/generate-thread-summaries.sh`: 勢い上位スレ（既定5本、既存 `/api/threads` 経由）の直近レス（既定30件）を read.cgi から取得し、ローカル llama.cpp（既定 `translategemma-12b`）で約200字の話題まとめを生成して push。
  - read.cgi は Shift_JIS + `.5ch.io` へのリダイレクトあり（`curl -L` + `iconv`）。レス本文は `post-content` div から抽出し、`lN` 表示に必ず含まれる >>1（テンプレ）は捨てる。
  - スレ間 `FETCH_SLEEP`（既定3秒）で 5ch への連続アクセスを抑制。レス本文は要約素材にのみ使い、保存・転載しない。
- `prompts/threads.txt`: 野球の話題のみ・個人攻撃/晒し/誹謗中傷を含めない・抜粋に無いことは書かない、の要約ルール。
- `worker/index.js`: `AI_SUBJECT_TYPES` に `threads` を追加（key は `all`）。
- `src/components/Threads.jsx`: スレ一覧の上に「スレの話題まとめ」（`AiComment`）を表示。注記を「レス本文は転載しません（話題まとめはAIによる要約です）」に更新。
- `src/components/AiComment.jsx`: 注記文言を `note` prop で差し替え可能にした（既定は従来の「成績データから〜」）。

### Verification (13)

- DRY_RUN で 5ch 取得とプロンプト合成を確認（テンプレ除去・実体参照デコード込み）。
- ローカル E2E: `wrangler dev` + ローカル D1 に対して実生成 → push → GET → `/threads` ページの表示を playwright で確認。
  - 荒れたレス（誹謗中傷混じり）を素材にしても、生成結果は野球の話題のみでガードが機能。
- lint: `Threads.jsx` の1件（`set-state-in-effect`）は変更前から存在する既存問題（stash 比較で確認）。

### Work Log (14): スレの話題まとめをスレごとの要約に変更

- 背景: 全体1本のまとめは「どのスレの話か」が分からずバランスも悪い（ユーザー指摘）。勢い上位6スレに限定し、スレごとに要約を付ける方式へ変更。
- `scripts/generate-thread-summaries.sh`: スレごと（既定 `THREADS_LIMIT=6`）に約120字の要約を生成し、`items` バッチで一括 push。subjectKey はスレID（例 `base:1784027000`）。
- `worker/index.js`: `GET /api/ai/comments/:type`（key なし）を新設。type 内の全 key の最新コメントをマップで返す一括取得（カードごとの個別 GET を回避）。
- `src/components/Threads.jsx`: ページ上部の全体まとめを廃止し、各スレカード内に「AI要約」バッジ付きで表示。要約はマウント時に一括取得して `thread.id` で突き合わせ。
- `prompts/threads.txt`: 120字・スレ単位の文面に更新。初回生成で蔑称（「便器」）が要約に混入したため、「蔑称・ネットスラングは正式な呼び方に言い換える」ルールを追加。
- `src/App.css`: `.thread-summary` / `.thread-summary-label` を追加。

### Verification (14)

- ローカル E2E: 6スレ生成 → バッチ push → 一括 GET → カード表示を playwright で確認（要約はマッチしたカードのみに出る）。
- 蔑称ルール追加後の再生成で「便器」→「福岡の球団」への言い換えを確認。
- 不正 subjectType の一括 GET は 400。lint は既存1件のみ。

### Work Log (15): スレ要約の全スレ化・クレジット表示・定期実行の雛形

- `scripts/generate-thread-summaries.sh`: 既定を `THREADS_LIMIT=30`（API 上限）に変更し、関連スレ全件を要約対象にした。
  - 5ch への負荷: 1回30リクエスト × 1日4回 = 120、スレ間3秒の逐次アクセス + 連絡先入り UA で問題ない水準。
- `src/components/Threads.jsx`: 要約末尾に短縮クレジット `（モデル名 / M/D HH:MM）` を表示（`.thread-summary-credit`）。
- `systemd/npbinfo-thread-summaries.{service,timer}` + `thread-summaries.env.example`: 8/13/18/21時の定期実行の雛形。
  - env は `~/.config/npbinfo/thread-summaries.env` に分離（ai-comments.env の `LLM_MODEL`=Gemini がローカル既定を上書きする事故を防ぐ）。
- `docs/ai-model-comparison.md`: スレ要約タスクの比較（translategemma-12b vs qwen3-8b）を追記。
  - qwen3-8b はキャラ記事と違い要約では接戦（数字を拾う）が、細部の綻び（6球団なのに10位等）が残る。運用は translategemma-12b 継続。
  - qwen3-14b（FableVibes）はテンプレート不一致による多言語混線・繰り返し崩壊で未参戦。要調整。

### Verification (15)

- ローカルで全30スレ生成 → 本番 push（stored: 30）を確認。クレジット表示は `wrangler dev` + playwright でスクショ確認。
- systemd user unit は `~/.config/systemd/user/` に配置・daemon-reload 済み。enable はユーザー操作（REFRESH_TOKEN 記入後）。

### Work Log (16): 試合日程に予告先発／責任投手を表示（issue #40）

- データソース: 既にスクレイピングしている `schedule_MM_detail.html` に「予告先発／責任投手」列（`div.pit` × 2）が存在。新規取得なし。
- `worker/index.js`: `div.pit` を収集して `homePitcher` / `awayPitcher` を付与。キャッシュキー `schedule:v2` → `v3`。
  - npb.jp の並び順の罠: 試合前（先発：）と引き分け（分：）はホーム→ビジター順だが、**終了試合は勝→敗順**（勝者がどちら側でも勝ち投手が先）。`assignPitchers` でスコアから勝者側に付け替える。
- `src/components/Schedule.jsx`: 各チーム名の下に `PitcherNote` を表示（試合前「予告先発 ○○」/ 終了後「勝 ○○」「敗 ○○」）。キャッシュキー `v3` 追随。
- `src/App.css`: `.schedule-pitcher(-label)` を追加。

### Verification (16)

- API で試合前（先発：ウィットリー/大野）と終了試合の割り当てを確認。7/16 の5試合すべてで勝敗投手が正しい側に付く（位置ベースだと勝敗が逆転する事故を修正済み）。
- playwright で今日（予告先発）と 7/16（勝・敗）のカード表示をスクショ確認。
- `node --check` / `npm run build` 通過。lint は既存6件のみで増減なし。

### Work Log (17): 今日の見所をリーグ別に分割し予告先発を反映

- 背景: セ・パ混在の見所は意味が薄い + 予告先発がデータに入った（ユーザー指摘）。
- `prompts/schedule.txt`: 先発投手の禁止を解除し「予告先発が記載されている場合は投げ合いの構図にも触れる」に変更。禁止リストは「予告先発以外の選手名」等に更新。
- `scripts/generate-ai-comments.sh`:
  - 試合カード TSV に予告先発2列を追加。
  - セ・パで記事を分割生成（key は `日付:cl` / `日付:pl`）。担当キャラは**そのリーグの6球団**からランダム（`random_persona_for_league`）。
  - 交流戦カード（両チームのリーグが異なる）は従来どおり key=日付で1本（フォールバック）。
  - jq の関数引数はフィルタ渡しなので `def lgof($t):` の値キャプチャ構文を使用（`lgof(t)` だと配列に対する `.homeTeam` 参照でエラー）。
- `src/components/Schedule.jsx`: 試合カードをセ・リーグ／パ・リーグ／交流戦のセクションに分け、各セクション直下に対応する見所（`今日の見所（セ・リーグ）` 等）を表示。

### Verification (17)

- DRY_RUN でリーグ分類（本日はセ3試合のみ→cl だけ生成）と予告先発列を確認。
- ローカル E2E: Gemini で cl 記事を実生成（diana 担当、尾形 vs 高橋の投げ合いに言及）→ 表示を playwright で確認。7/16 はセ・パ両セクションに分かれることを確認。
- lint は既存3エラーのみで増減なし。

### Work Log (18): 個人成績コメントのチーム名略記を解消

- 背景: 成績コメントに「神」「ソ」等の1文字略記が混ざる（ユーザー指摘）。原因は `/api/stats/` が npb.jp 表記の略記を素通しで返し、生成スクリプトが raw のまま渡していたこと（画面は `PlayerStats.jsx` の `TEAM_MAP` で展開済みのため気づかない）。
- `scripts/generate-ai-comments.sh`: stats の TSV 生成 jq に略記→短縮名の展開（`TEAM_EXPAND`、`TEAM_MAP` と同じ12球団対応表）を追加。
- `prompts/stats.txt`: 「チーム名は略記の場合があります」の注釈を削除（データ側で解決）。

### Verification (18)

- DRY_RUN で全リーグの TSV が正式名（阪神/DeNA/日本ハム等）になることを確認。
- 本番の stats 4件を再生成し、略記の残存ゼロを確認。

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

### Work Log (8): 対戦成績のチーム名リンク + 生成パラメータの調整口

- 対戦成績テーブルの対戦相手名をチームページへのリンクにした（ユーザー要望）。
  - `App.jsx` の `openTeam` を `TeamTimeline` → `TeamHeadToHead` に prop で通し、順位表と同じ `.team-detail-link` パターンで実装。
  - slug が無いチーム名や prop 未指定時は従来どおりプレーンテキスト表示。
- `scripts/generate-ai-comments.sh` に生成の調整口を追加（ユーザーの「遊びを入れられるか」質問への対応）。
  - `LLM_TEMPERATURE`: 未指定なら payload に含めず API 既定値。指定時のみ `temperature` を付与。
  - `SYSTEM_PROMPT`: 環境変数で上書き可能に。口調・遊びの調整は temperature より system prompt 推奨（脱線リスクが低い）。
  - `systemd/ai-comments.env.example` にも両方を追記。

### Verification (8)

- `npm run build` / lint（対象3ファイル）通過。`sh -n` と temperature payload の jq 分岐（指定あり/なし）を単体確認。
- playwright で `/teams/hanshin` の対戦相手リンク11件を確認、「巨人」クリックで `/teams/giants` に遷移し見出しが切り替わることを確認。スタイル崩れなしをスクショ確認。

### Work Log (9): コメンテーターのキャラ設定をファイル管理に

- ユーザーがチーム別キャラ（どんでん風・江戸っ子・広島弁など）を手作業の `SYSTEM_PROMPT` で試して好評だったため、システム化。
- CSV は不採用（長文キャラ設定のエスケープが面倒）。1キャラ=1テキストファイルの構成にした:
  - `prompts/common.txt` — 全チーム共通ルール（データのみ根拠・200字・本文のみ等）
  - `prompts/personas/<slug>.txt` — キャラ設定。無いチームは既定の解説者
  - スクリプトが「キャラ設定 + 共通ルール」を合成。チーム名指定は共通側なので、手作業時代の「広島プロンプトで阪神を語らせる」コピペ事故が構造的に消える
- ユーザーが試した5キャラ（阪神・巨人・広島・DeNA・中日）を seed として収録。
- `DRY_RUN=1` を追加: LLM 呼び出しも push もせず合成プロンプトを表示（キー不要）。キャラ調整時のプレビュー用。
- `SYSTEM_PROMPT` env は「合成を無視した全体上書き」に意味変更（単発実験用として残す）。
- 注意: ユーザーが実行ログ貼り付けで LLM_API_KEY / REFRESH_TOKEN を会話とシェル履歴に露出。両方のローテーションを推奨済み（2026-07-15）。

### Verification (9)

- `sh -n` 通過。`DRY_RUN=1 TEAMS='阪神 ヤクルト'` で合成結果を確認（キャラあり/なし両パス）。
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
