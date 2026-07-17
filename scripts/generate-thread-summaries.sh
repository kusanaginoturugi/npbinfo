#!/bin/sh
# 5ch の勢い上位スレッドから最近のレスを取得し、ローカル LLM で話題まとめを
# 生成して npbinfo Worker へ push する（issue #13 のローカル LLM 活用）。
# 想定実行環境: 自宅マシンの cron / systemd timer。llama.cpp が前提だが
# OpenAI 互換 API ならどこでも動く。
#
# 必須環境変数:
#   REFRESH_TOKEN   Worker の ingest 認証トークン（DRY_RUN 時は不要）
# 任意環境変数:
#   LLM_BASE_URL    OpenAI 互換エンドポイント。既定 http://localhost:8080/v1（llama.cpp）
#   LLM_MODEL       既定 translategemma-12b
#   LLM_API_KEY     llama.cpp では不要（既定 dummy）。クラウドに向けるときだけ設定
#   NPBINFO_BASE_URL 既定 https://npbinfo.kusanaginoturugi.workers.dev
#   THREADS_LIMIT   まとめ対象のスレ数（勢い順の上位）。既定 5
#   RES_PER_THREAD  スレごとに取得する直近レス数。既定 30
#   FETCH_SLEEP     5ch への連続アクセスの間隔秒。既定 3
#   PROMPTS_DIR     プロンプト置き場。既定はリポジトリの prompts/
#   DRY_RUN         1 にすると LLM 呼び出しと push をせず、プロンプトを表示するだけ
#
# 注意: レス本文は要約の素材としてだけ使い、本文そのものは保存・転載しない。
set -eu

DRY_RUN="${DRY_RUN:-}"
if [ -z "$DRY_RUN" ]; then
  : "${REFRESH_TOKEN:?REFRESH_TOKEN を設定してください}"
fi
LLM_BASE_URL="${LLM_BASE_URL:-http://localhost:8080/v1}"
LLM_MODEL="${LLM_MODEL:-translategemma-12b}"
LLM_API_KEY="${LLM_API_KEY:-dummy}"
NPBINFO_BASE_URL="${NPBINFO_BASE_URL:-https://npbinfo.kusanaginoturugi.workers.dev}"
THREADS_LIMIT="${THREADS_LIMIT:-5}"
RES_PER_THREAD="${RES_PER_THREAD:-30}"
FETCH_SLEEP="${FETCH_SLEEP:-3}"
UA='npbinfo-summary/1.0 (+https://npbinfo.kusanaginoturugi.workers.dev)'

SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
PROMPTS_DIR="${PROMPTS_DIR:-$SCRIPT_DIR/../prompts}"
SYSTEM_PROMPT=$(cat "$PROMPTS_DIR/threads.txt")

# read.cgi の HTML からレス本文（post-content）だけを1行1レスで取り出す。
# 名前欄・ID は拾わない。タグ除去と最低限の実体参照のデコードのみ。
# lN 表示は必ず >>1 を含むので、テンプレだらけの先頭レスは捨てる。
extract_posts() {
  tr -d '\n' \
    | sed 's/<div class="post-content">/\n/g' \
    | sed -e '1,2d' -e 's|</div>.*||' \
    | sed -e 's/<br>/ /g' -e 's/<[^>]*>//g' \
          -e 's/&gt;/>/g' -e 's/&lt;/</g' -e 's/&quot;/"/g' -e "s/&#039;/'/g" -e 's/&amp;/\&/g' \
    | sed -e 's/[[:space:]]\{2,\}/ /g' -e 's/^ //' -e 's/ $//' \
    | grep -v '^$' \
    | cut -c1-300
}

# ─── 勢い上位スレのレス抜粋を集める ───────────────────────────
threads_json=$(curl -fsS "$NPBINFO_BASE_URL/api/threads?sort=momentum&limit=$THREADS_LIMIT")
material=''
count=0
for i in $(seq 0 $((THREADS_LIMIT - 1))); do
  title=$(printf '%s' "$threads_json" | jq -r ".threads[$i].title // empty")
  url=$(printf '%s' "$threads_json" | jq -r ".threads[$i].url // empty")
  [ -z "$title" ] && continue

  posts=$(curl -fsSL "${url}l$RES_PER_THREAD" -H "User-Agent: $UA" --compressed 2>/dev/null \
    | iconv -f SHIFT_JIS -t UTF-8//TRANSLIT 2>/dev/null \
    | extract_posts || true)
  sleep "$FETCH_SLEEP"
  if [ -z "$posts" ]; then
    echo "skip: レスを取得できない: $title" >&2
    continue
  fi

  material=$(printf '%s\n\n## スレ: %s\n%s' "$material" "$title" "$posts")
  count=$((count + 1))
done

if [ "$count" -eq 0 ]; then
  echo "error: 素材になるスレが1つも取れなかった" >&2
  exit 1
fi

# ローカル LLM のコンテキストに収める（先頭 = 勢い上位を優先して残す）
material=$(printf '%s' "$material" | head -c 12000)
prompt=$(printf '5chの野球関連スレッドの最近のレス抜粋（%s スレ分）:\n%s' "$count" "$material")

if [ -n "$DRY_RUN" ]; then
  printf -- '--- system ---\n%s\n--- user ---\n%s\n' "$SYSTEM_PROMPT" "$prompt"
  exit 0
fi

# ─── 生成して push ────────────────────────────────────────────
response=$(jq -n \
  --arg model "$LLM_MODEL" \
  --arg system "$SYSTEM_PROMPT" \
  --arg user "$prompt" \
  '{model: $model, messages: [{role: "system", content: $system}, {role: "user", content: $user}]}' \
  | curl -sS "$LLM_BASE_URL/chat/completions" \
      -H "Authorization: Bearer $LLM_API_KEY" \
      -H 'Content-Type: application/json' \
      -d @-)
error=$(printf '%s' "$response" \
  | jq -r 'if type == "array" then .[0] else . end | .error.message // empty' 2>/dev/null)
if [ -n "$error" ]; then
  echo "LLM error: $error" >&2
  exit 1
fi
content=$(printf '%s' "$response" | jq -r '.choices[0].message.content // empty')
if [ -z "$content" ]; then
  echo "error: 生成結果が空" >&2
  exit 1
fi

result=$(jq -n \
  --argjson year "$(date +%Y)" \
  --arg content "$content" \
  --arg model "$LLM_MODEL" \
  '{subjectType: "threads", subjectKey: "all", year: $year, content: $content, model: $model}' \
  | curl -fsS -X POST "$NPBINFO_BASE_URL/api/ai/comments" \
      -H "Authorization: Bearer $REFRESH_TOKEN" \
      -H 'Content-Type: application/json' \
      -d @-)
echo "threads/all: $result"
