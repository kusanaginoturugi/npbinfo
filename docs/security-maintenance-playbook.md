# 他のリポジトリでも使う脆弱性点検手順

対象は GitHub 上の Node.js / npm プロジェクト。Cloudflare Workers を使う場合は Worker の公開経路も確認する。別の言語・パッケージ管理ツールでは監査と更新コマンドを置き換える。リポジトリの既存方針がこの文書より優先。

## Codex に渡す依頼文

> このリポジトリの脆弱性を調べ、GitHub で継続検出できるようにしてください。現状の設定と dirty な差分を先に確認し、npm の直接・間接依存と公開 API の入力処理を調べてください。開発依存は最新リリースへ更新し、残る指摘は実際の利用経路と修正版の有無を記録してください。CodeQL、Dependency Review、Dependabot の週次更新、本番依存の audit が未設定なら追加し、このリポジトリの Dependabot 脆弱性アラートを有効にしてください。クリーンインストール、テスト、ビルド、GitHub Actions を確認し、変更履歴と未解決事項を残してください。main の保護設定は変更しないでください。デプロイは依頼がある場合だけ実行してください。

## 作業手順

1. `git status --short`、`package.json`、lockfile、`.github/workflows/`、公開 API、デプロイ設定を確認する。既存のユーザー変更を戻さない。
2. `npm audit`、`npm audit --omit=dev`、`npm outdated --json` で基準値を取る。`npm ls <package> --all` で指摘の依存経路を調べる。件数は依存ツリー全体の集計であり、独立した攻撃経路の数とは限らない。
3. 直接の開発依存を `npm install -D <package>@latest ...` で更新する。lockfile を同時に更新する。`npm audit fix --force` は提案されるダウングレードや破壊的変更を調べずに実行しない。間接依存の `overrides` は修正版と互換性を確認できた場合だけ追加し、外す条件を履歴に書く。
4. コード側は認証、リクエスト本文の上限、外部 URL とファイルパス、HTML 出力、シークレットの扱いを確認する。Cloudflare Workers では、`devDependency` でも Worker に import されている可能性を確認する。監査結果だけで「外部から悪用できる／できない」と断定しない。
5. GitHub に既存設定がなければ、npm と `github-actions` の週次更新を `.github/dependabot.yml` に追加し、JavaScript/TypeScript の CodeQL を push・PR・週次で、Dependency Review を PR で実行する。CI には `npm ci`、既存テスト、`npm audit --omit=dev --audit-level=high` を追加する。設定例はこのリポジトリの [Dependabot](../.github/dependabot.yml)、[CodeQL](../.github/workflows/codeql.yml)、[Dependency Review](../.github/workflows/dependency-review.yml)、[CI](../.github/workflows/ci.yml) を参照し、言語・ブランチ・Node バージョンを対象 repo に合わせる。公開 repo 以外では CodeQL と Dependency Review の利用条件も確認する。
6. 対象 repo の管理権限を確認してから、脆弱性アラートを有効にする。`gh repo view --json nameWithOwner --jq .nameWithOwner` で対象を確定し、`gh api -X PUT repos/OWNER/REPO/vulnerability-alerts` を実行する。`gh api -X GET repos/OWNER/REPO/vulnerability-alerts` の成功（HTTP 204）と、`gh api 'repos/OWNER/REPO/dependabot/alerts?state=open'` で確認する。直後の一覧が空でも、ローカル監査の指摘が解消したとは判断しない。個人の通知設定で対象 repo の Security alerts を受け取る。自動修正 PR の **Dependabot security updates** は別の設定なので、必要なら別途有効化する。
7. `npm ci`、テスト、ビルド、必要な lint、`npm audit --omit=dev --audit-level=high` を実行する。失敗した項目は更新前からの問題かを切り分ける。GitHub に反映したら CI と CodeQL の実行結果、未解決アラートを確認する。
8. 履歴に日付、更新パッケージ、監査の前後件数、残る指摘と影響範囲、検証結果、GitHub 設定、次に外す override を記録する。commit/push とデプロイはその repo の運用方針と依頼内容に従う。Worker をデプロイした場合は公開 API の build 情報などで反映を確認する。

## このリポジトリでの実例

- 2026-10-24 に開発依存を更新し、`undici` を 7.30.1 に override。`npm audit` は 11 件から 7 件になった。残りは `@cloudflare/puppeteer` の間接依存。詳細は [作業履歴](agent-worklog.md) に記録した。
- Dependabot 脆弱性アラートは GitHub API で有効化し、HTTP 204 を確認した。main の保護設定と Dependabot security updates は有効化していない。

参考: [GitHub の脆弱性アラート API](https://docs.github.com/en/rest/repos/repos#enable-vulnerability-alerts)、[Dependabot の設定](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/secure-your-dependencies/configure-dependabot-alerts)、[CodeQL の設定](https://docs.github.com/en/code-security/how-tos/find-and-fix-code-vulnerabilities/configure-code-scanning/configuring-advanced-setup-for-code-scanning)。
