# Scheduled Jobs

このプロジェクトの定期実行一覧。時刻は JST。

| 対象 | 実行元 | 頻度 | 時刻 | 内容 |
| --- | --- | --- | --- | --- |
| AIコメント通常 | `systemd/npbinfo-ai-comments.timer` | 火・水・金・土・日 | 01:00 + 最大5分遅延 | `generate-ai-comments.sh`。既定 `team stats schedule`。月・木は球場案内を優先するため休み |
| 順位表AI分析 (Claude) | claude.ai ルーティン `trig_01Y3ErGny1WD1EtVTBRfaHB9` | 毎日 | 01:30 | セ/パ順位表 + Web検索でClaudeが `standings` コメントを生成し `/api/ai/comments` へ保存。Geminiのteamコメントとの比較用。https://claude.ai/code/routines/trig_01Y3ErGny1WD1EtVTBRfaHB9 |
| AI球場案内 | `systemd/npbinfo-stadium-ai-comments.timer` | 月・木 | 00:10、遅延なし | `SUBJECTS=stadium` |
| 5chスレ要約 | `systemd/npbinfo-thread-summaries.timer` | 毎日4回 | 08:00 / 13:00 / 18:00 / 21:00 + 最大5分遅延 | `generate-thread-summaries.sh` |
| OGP画像生成 | `og-worker/wrangler.jsonc` cron | 毎日3回 | 21:30 / 00:30 / 03:30 | `30 12,15,18 * * *` UTC。OGP更新、Stats Worker連携あり |
| メインWorker順位更新 | Cloudflare Dashboard管理の既存Cron | 毎日3回 | 21:30 / 00:30 / 03:30 | `wrangler.jsonc` には書かない運用 |
| GitHub CI | `.github/workflows/ci.yml` | push / PR時 | 随時 | `npm test` |
| AI Just Do It | `.github/workflows/ai-justdoit.yml` | Issueラベル / 手動 | 随時 | `justdoit` ラベル or `workflow_dispatch` |
