# npbinfo

NPB（日本プロ野球）の順位表、選手成績、試合日程、球場情報を表示する Web アプリ。
フロントは React + Vite、バックエンドは Cloudflare Workers。

## 機能

- 順位表（セ・リーグ / パ・リーグ / 交流戦 / オープン戦）
- 選手成績（打撃 / 投手）の一覧表示・列ソート
- 試合日程・結果（日付ごとのカード一覧）
- 直近5試合の勝敗、対戦成績、球場天気の補助表示
- 球場情報（12球団本拠地一覧・地図・詳細・AI球場案内）
- ダークモード切り替え
- 年度切り替え（直近 12 年分）
- debug モード（`?debug=1`）でキャッシュを無視した再取得と App/API buildId の確認
- OGP 用の順位表 PNG / SVG 配信
- Browser Rendering による日本語 OGP 画像の定期生成
- 球場別本塁打パークファクターによる本塁打数の中立球場換算
- 主要画面を直接開ける英語の人間向け URL
- 阪神タイガース詳細画面でX公開Listの関連ポストを表示

## データソース

- 順位表: [npb.jp](https://npb.jp) の公式順位表を `HTMLRewriter` でスクレイピング
- 選手成績: [npb.jp](https://npb.jp) の公式成績ページを `HTMLRewriter` でスクレイピング
- 試合日程: [npb.jp](https://npb.jp) の月別日程ページを `HTMLRewriter` でスクレイピング
- 甲子園の当日中止情報: [阪神甲子園球場公式サイト](https://koshien.hanshin.co.jp/) を補助的に照合
- 天気: [Open-Meteo](https://open-meteo.com/) の日次予報 / 過去天気 API
- 球場情報: [npb.jp](https://npb.jp/stadium/) の球場詳細 JSON をもとにした静的データ
- AI球場案内: 球場公式サイト等から抽出した告知テキストを Gemini に渡して生成

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

テスト（`node --test`。スクレイピングパーサの単体テスト）:

```sh
npm test
```

## GitHub Issue AI ワークフロー

`.github/workflows/ai-justdoit.yml` は Issue ラベルで Claude Code を動かす。
Claude が Issue と全コメントを読み、情報不足なら質問だけ、要件が明確なら実装して PR まで作る。

使うラベル（`justdoit` 以外は workflow が未作成なら自動作成する）:

| ラベル | 意味 |
| --- | --- |
| `justdoit` | AI 対象 Issue。設計・実装の入口。人間が付ける |
| `ai-working` | AI が処理中。workflow が付け外しする |
| `whatsup?` | AI からの質問待ち。回答して `justdoit` を付け直す |
| `ai-pr-opened` | AI 実装 PR 作成済み |
| `ai-failed` | workflow が失敗。Actions のログを確認する |

運用:

1. Issue に `justdoit` を付ける（workflow が外すので、再実行は付け直すだけ）。
2. 情報不足なら Claude が質問コメントを投稿し、`whatsup?` を付けて終了する。
3. 質問には Issue コメントで回答し、`justdoit` を付け直すと再設計・実装に進む。
4. 要件が明確なら設計コメントの後に実装し、`npm test` 通過後に
   `ai/issue-<番号>` ブランチと PR を作って `ai-pr-opened` を付ける。
5. 質問・完了の各節目で Issue 作成者に @mention が付くので GitHub 通知が届く。

事前準備:

- repository secret `CLAUDE_CODE_OAUTH_TOKEN`（ローカルで `claude setup-token` を実行して発行）
- Claude GitHub App をリポジトリにインストール（<https://github.com/apps/claude>）
- Settings → Actions → General → "Allow GitHub Actions to create and approve pull requests" を有効化

注意: workflow の `GITHUB_TOKEN` で作った PR では、その PR 上の CI（`ci.yml`）は
自動起動しない。必要なら PR を開いたあと手動で workflow を実行するか、close/reopen する。

## デプロイ

Cloudflare Workers にデプロイする。`wrangler login` 済みであること。

```sh
npm run deploy
```

`wrangler.jsonc` で `assets.not_found_handling: "single-page-application"` を指定しており、`/api/*` 以外は `dist/` の静的アセットにフォールバックする SPA 構成。

## D1

スクレイピング済みデータを D1 に保存する移行を進めている。セットアップ手順は
`docs/d1-setup.md`、移行計画は `docs/cache-storage-migration.md` を参照。

順位表は Dashboard 上の既存 Cron Triggers で毎日 JST 21:30 / 00:30 / 03:30 に
セ・パ両リーグを再取得し、D1 に保存する。Cron枠上限のため、`wrangler.jsonc`
にはcron設定を書かない。

## API

| メソッド | パス | 説明 |
| --- | --- | --- |
| GET | `/api/standings/:league` | 順位表。`league` は `cl` / `pl` / `cp` / `op` |
| GET | `/api/stats/batting/:league?year=YYYY` | 打撃成績。`league` は `cl` / `pl` |
| GET | `/api/stats/pitching/:league?year=YYYY` | 投手成績。`league` は `cl` / `pl` |
| GET | `/api/schedule/YYYY-MM` | 月別の試合日程・結果 |
| GET | `/api/threads` | 5ch の subject.txt から球団関連スレッド一覧 |
| GET | `/api/debug` | App/API の buildId、buildTime、gitRevision |
| POST | `/api/admin/refresh/standings` | 順位表を再取得してD1へ保存。`Authorization: Bearer $REFRESH_TOKEN` が必要 |
| GET | `/og/standings/:league.png` | OGP 用順位表 PNG。`league` は `cl` / `pl` / `cp` / `op` |
| GET | `/og/standings/:league` | OGP 用順位表 SVG。既存互換用 |
| GET | `/api/park-factors/hr` | 本塁打パークファクターと算出メタデータ |

## AI コメント生成

`scripts/generate-ai-comments.sh` は Gemini の OpenAI 互換 API で本文を生成し、
`/api/ai/comments` へ push する。`SUBJECTS` で対象を絞れる。

チーム調子・個人成績・今日の見所は `npbinfo-ai-comments.timer` が月曜・木曜を除く 01:00 に実行する。
球場案内は公式サイト等の告知テキストも素材にするため、`npbinfo-stadium-ai-comments.timer` が
月曜・木曜の 00:10 に `SUBJECTS=stadium` だけを先に実行する。
定期実行の一覧は [docs/schedules.md](docs/schedules.md) にまとめている。

## OGP 画像生成

`og-worker/` は Cloudflare Browser Rendering で順位表と指標グラフを
1200x630 PNG にし、Service Binding 経由でメイン Workerからデータを取得して
共通の KV に保存する。
メイン Worker は生成済み画像を優先し、未生成時は従来のビットマップ画像を返す。

定期実行は JST 21:30、00:30、03:30。前2回は順位データが変わった場合だけ更新し、
03:30 は保険として強制更新する。

```sh
npm run deploy:og
npx wrangler secret put REFRESH_TOKEN --config og-worker/wrangler.jsonc
curl -X POST \
  -H "Authorization: Bearer $REFRESH_TOKEN" \
  https://npbinfo-og-generator.kusanaginoturugi.workers.dev/generate
```

生成画像は `/images/standings/cl.png` で確認できる。

## 本塁打パークファクター

`scripts/build-hr-park-factors.mjs` は NPB 公式の2023〜2025年の試合詳細から、
球場、主催球団、両軍の本塁打数を集計する。球場での両軍本塁打/試合を、
同じ主催球団のビジター試合における両軍本塁打/試合と比較し、60試合相当を
平均 `1.000` とする回帰を加えている。

```sh
npm run build:park-factors
```

生成結果は `src/data/hrParkFactors.generated.js` に保存する。
`stats-worker/` は当年の終了試合を未処理分だけ取得し、試合が行われた球場の係数で
各本塁打を中立球場換算して共通 KV に保存する。Cloudflare無料枠のCron数を増やさず、
既存の OGP Worker が JST 21:30、00:30、03:30 の画像生成前に Service Binding で呼び出す。
2026年のバンテリンドームはホームランテラス新設で過去実績との連続性がないため、
同年中は係数 `1.000` として補正対象から外す。

```sh
npm run deploy:stats
npx wrangler secret put REFRESH_TOKEN --config stats-worker/wrangler.jsonc
curl -X POST \
  -H "Authorization: Bearer $REFRESH_TOKEN" \
  "https://npbinfo-stats-updater.kusanaginoturugi.workers.dev/refresh?year=2026"
```

順位表の本塁打欄は実数と補正値を併記し、グラフでは補正値を使用する。

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
| `/teams/hanshin` | 阪神タイガース関連ポスト |
| `/methodology/home-run-park-factor` | 本塁打の球場補正の計算方法・出典 |

画面 URL は History API で切り替わり、ブラウザの戻る・進むと直リンクに対応する。
