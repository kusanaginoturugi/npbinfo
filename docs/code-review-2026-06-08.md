# コードレビュー 2026-06-08

npbinfo の現状コードを評価したレポート。対象は `main` ブランチ（最新コミット `238e92f`）。

## 全体像

| コンポーネント | 役割 |
| --- | --- |
| `worker/index.js` | 本体 Worker。API + 静的配信。npb.jp を `HTMLRewriter` でスクレイプ、KV キャッシュ、年度別 TTL、暫定順位の自前再計算、OGP の SVG/PNG 生成 |
| `stats-worker/index.js` | 本塁打パークファクターの差分バッチ。KV 経由で本体のキャッシュを無効化して連携 |
| `og-worker/index.js` | Browser Rendering で日本語 OGP 画像を生成、署名比較で差分だけ更新 |
| `shared/hrParkFactor.js` + `scripts/build-hr-park-factors.mjs` | 回帰補正つきパークファクターをオフライン算出 |
| `src/` | React + Vite のフロント（順位表 / 選手成績 / 試合日程 / 球場情報） |

KV をメッセージバス代わりにして 3 Worker を疎結合に繋ぐ構成。`og-worker` の signature 差分更新（`og-worker/index.js`）と `stats-worker` の cutoff 連携は実運用を意識した作り。

## 良い点

- **障害設計が堅実**。KV の get/put 失敗は `console.warn` で握って継続（`worker/index.js`）、上流が落ちたら 502 にして握りつぶさない。
- **テーブル構造の世代差対応**。2024 以前 / 2026 以降の差を `isLegacy` で吸収（`worker/index.js` の `handleStats` ほか）。npb.jp の改定に実際に対応した跡。
- **パークファクターが真面目**。中央値正規化 + ゲーム数による平均回帰（`scripts/build-hr-park-factors.mjs`）。サンプルの少ない球場を 1.000 に寄せる処理あり。
- **依存ゼロの自前 PNG エンコーダ**。crc32/adler32/zlib store/ビットマップフォントを手書き（`worker/index.js`）。フォールバックとして機能。

## 気になる点（対応 Issue）

優先度順。1 件ずつ Issue として起票済み。

| # | Issue | 内容 | 優先度 |
| --- | --- | --- | --- |
| 1 | [#32](https://github.com/kusanaginoturugi/npbinfo/issues/32) | スクレイピングパーサの単体テストと CI を整備する | 高 |
| 2 | [#33](https://github.com/kusanaginoturugi/npbinfo/issues/33) | `worker/index.js`（2000 行超）を機能単位に分割する | 高 |
| 3 | [#34](https://github.com/kusanaginoturugi/npbinfo/issues/34) | HTMLRewriter のテーブル走査ロジックを共通化する | 中 |
| 4 | [#35](https://github.com/kusanaginoturugi/npbinfo/issues/35) | チーム名/色/コードのマスタを単一の真実源に統合する | 中 |
| 5 | [#36](https://github.com/kusanaginoturugi/npbinfo/issues/36) | 自前 PNG エンコーダ(bitmap-fallback) の要否を判断する | 低 |

### 1. テストがゼロ（#32）

`git ls-files` に test ファイル無し、CI も無し。コアがスクレイピングのパーサ群（`mapCells` のインデックスマッピング、`parseNpbGameDetail` の正規表現、`applyFinishedGamesToStandings` の勝敗再計算）なのに、npb.jp が HTML を変えたら静かに壊れる。固定 HTML フィクスチャ → パーサ単体テストが最も投資対効果が高い。

### 2. `worker/index.js` が一枚岩（#33）

約 2011 行。標準/特別順位表・対戦表・選手成績・日程・天気・OGP(SVG+PNG) が全部同居。ルーターも素手の `if` パターンマッチが 10 連発。

### 3. HTMLRewriter の状態機械がコピペ気味（#34）

`inTable / tableDepth / targetTableDepth / cells / cellText` のテーブル走査が `buildStandingsRewriter` / `parseExtraStats` / `handleHeadToHead` でほぼ同型で 3〜4 回再発明されている。共通ヘルパーに寄せれば大幅削減できる。

### 4. チーム名マスタの分散（#35）

`TEAM_SHORT_NAMES` / `TEAM_COLORS`（worker と og-worker に別定義・色も微妙に不一致。ロッテが `#000000` vs `#111111`）/ `TEAM_ALIASES`（shared）/ `src/data/teams.js`。同じ 12 球団の別名・色・コードが 4 箇所にある。

### 5. 自前 PNG エンコーダの立ち位置（#36）

本番は `og-worker` の browser-run 優先で、worker 側のビットマップ PNG は `bitmap-fallback`。約 220 行をフォールバックのためだけに保守している。残すなら意図をコメントで明記、要らないなら削除も選択肢。

## 総評

最初の習作レベルから見ると、実運用を想定した分散構成・障害設計・データ更新パイプラインを自分で組めるところまで来ている。設計の方向は正しい。

次の一歩は機能追加より **(1) パーサのテスト整備** と **(2) 一枚岩 Worker の分割・共通化**。ここを固めると npb.jp の仕様変更に強い土台になる。着手順は #32 → #33 → #34 → #35 → #36 を推奨（テストを先に入れてからリファクタするとリグレッションを検知できる）。
