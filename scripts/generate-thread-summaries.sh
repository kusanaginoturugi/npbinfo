#!/bin/sh
# 5ch の勢い上位スレッドそれぞれについて、直近レスからローカル LLM で
# 話題まとめを生成し、npbinfo Worker へ push する（issue #13 のローカル LLM 活用）。
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
#   THREADS_LIMIT   まとめ対象のスレ数（勢い順の上位、API 上限 30）。既定 30
#   RES_PER_THREAD  スレごとに取得する直近レス数。既定 30
#   FETCH_SLEEP     5ch への連続アクセスの間隔秒。既定 3
#   PROMPTS_DIR     プロンプト置き場。既定はリポジトリの prompts/
#   DRY_RUN         1 にすると LLM 呼び出しと push をせず、プロンプトを表示するだけ
#
# subjectKey はスレID（例 livebase:1784201227）。カード表示側は
# GET /api/ai/comments/threads の一括取得で key を突き合わせる。
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
THREADS_LIMIT="${THREADS_LIMIT:-30}"
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

generate_summary() {
  prompt=$1
  response=$(jq -n \
    --arg model "$LLM_MODEL" \
    --arg system "$SYSTEM_PROMPT" \
    --arg user "$prompt" \
    '{model: $model, messages: [{role: "system", content: $system}, {role: "user", content: $user}]}' \
    | curl -sS --max-time 300 "$LLM_BASE_URL/chat/completions" \
        -H "Authorization: Bearer $LLM_API_KEY" \
        -H 'Content-Type: application/json' \
        -d @-)
  error=$(printf '%s' "$response" \
    | jq -r 'if type == "array" then .[0] else . end | .error.message // empty' 2>/dev/null)
  if [ -n "$error" ]; then
    echo "LLM error: $error" >&2
    return 1
  fi
  printf '%s' "$response" | jq -r '.choices[0].message.content // empty'
}

push_summary() {
  thread_id=$1
  content=$2
  jq -n \
    --arg key "$thread_id" \
    --argjson year "$year" \
    --arg content "$content" \
    --arg model "$LLM_MODEL" \
    '{subjectType: "threads", subjectKey: $key, year: $year, content: $content, model: $model}' \
    | curl -fsS -X POST "$NPBINFO_BASE_URL/api/ai/comments" \
        -H "Authorization: Bearer $REFRESH_TOKEN" \
        -H 'Content-Type: application/json' \
        -d @-
}

# ─── スレごとに生成して即座に push ───────────────────────────
threads_json=$(curl -fsS "$NPBINFO_BASE_URL/api/threads?sort=momentum&limit=$THREADS_LIMIT")
year=$(date +%Y)
generated=0

for i in $(seq 0 $((THREADS_LIMIT - 1))); do
  thread_id=$(printf '%s' "$threads_json" | jq -r ".threads[$i].id // empty")
  title=$(printf '%s' "$threads_json" | jq -r ".threads[$i].title // empty")
  url=$(printf '%s' "$threads_json" | jq -r ".threads[$i].url // empty")
  [ -z "$thread_id" ] && continue

  posts=$(curl -fsSL "${url}l$RES_PER_THREAD" -H "User-Agent: $UA" --compressed 2>/dev/null \
    | iconv -f SHIFT_JIS -t UTF-8//TRANSLIT 2>/dev/null \
    | extract_posts | head -c 8000 || true)
  sleep "$FETCH_SLEEP"
  if [ -z "$posts" ]; then
    echo "skip: レスを取得できない: $title" >&2
    continue
  fi

  prompt=$(printf 'スレ「%s」の最近のレス抜粋:\n%s' "$title" "$posts")

  if [ -n "$DRY_RUN" ]; then
    printf '===== %s (%s) =====\n--- user ---\n%s\n\n' "$title" "$thread_id" "$prompt"
    continue
  fi

  content=$(generate_summary "$prompt" || true)
  if [ -z "$content" ]; then
    echo "error: 生成に失敗: $title" >&2
    continue
  fi

  if result=$(push_summary "$thread_id" "$content"); then
    echo "generated: $title ($thread_id): $result"
    generated=$((generated + 1))
  else
    echo "error: pushに失敗: $title" >&2
  fi
done

if [ -n "$DRY_RUN" ]; then
  exit 0
fi
if [ "$generated" -eq 0 ]; then
  echo "error: 1件も生成できなかった" >&2
  exit 1
fi
