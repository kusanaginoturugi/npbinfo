#!/bin/sh
# 同じプロンプトを複数の LLM に投げて出力を並べて比較する。Worker への push はしない。
# 用途: issue #13 のモデル品質比較（Gemini / OpenAI / Claude / 自宅 llama.cpp）。
#
# 環境変数（使うプロバイダの分だけ設定すればよい）:
#   LLM_API_KEY          Gemini の API キー
#   LLM_API_KEY_OPENAI   OpenAI の API キー
#   LLM_API_KEY_CLAUDE   Anthropic の API キー
# 任意:
#   MODELS    比較対象。空白区切りの provider:model。provider は
#             gemini / openai / anthropic / local（llama.cpp）。既定:
#             "gemini:models/gemini-3.5-flash openai:gpt-5.5 anthropic:claude-fable-5"
#   SUBJECT   schedule（今日の見所、既定）か stats:batting:cl 形式
#   PERSONA   キャラ slug。既定はランダムに1人選び、全モデル共通で使う
#   NPBINFO_BASE_URL / YEAR / PROMPTS_DIR は generate-ai-comments.sh と同じ
set -eu

MODELS="${MODELS:-gemini:models/gemini-3.5-flash openai:gpt-5.5 anthropic:claude-fable-5}"
SUBJECT="${SUBJECT:-schedule}"
NPBINFO_BASE_URL="${NPBINFO_BASE_URL:-https://npbinfo.kusanaginoturugi.workers.dev}"
YEAR="${YEAR:-$(date +%Y)}"

SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
PROMPTS_DIR="${PROMPTS_DIR:-$SCRIPT_DIR/../prompts}"

league_label() {
  [ "$1" = cl ] && echo 'セ・リーグ' || echo 'パ・リーグ'
}

stats_label() {
  [ "$1" = batting ] && echo '打撃成績' || echo '投手成績'
}

# ─── キャラ選択（全モデル共通） ───────────────────────────────
if [ -z "${PERSONA:-}" ]; then
  PERSONA=$(find "$PROMPTS_DIR/personas" -name '*.txt' 2>/dev/null \
    | shuf -n 1 | xargs -r basename | sed 's/\.txt$//')
fi
persona_file="$PROMPTS_DIR/personas/$PERSONA.txt"
if [ -f "$persona_file" ]; then
  persona_text=$(cat "$persona_file")
else
  persona_text='あなたはプロ野球の解説者です。文体はです・ます調。'
fi

# ─── プロンプト構築（generate-ai-comments.sh と同じ素材） ─────
case "$SUBJECT" in
  schedule)
    rules_file=schedule.txt
    today=$(date +%Y-%m-%d)
    games=$(curl -fsS "$NPBINFO_BASE_URL/api/schedule/$(date +%Y-%m)" | jq -r --arg today "$today" '
      .games[] | select(.date == $today)
      | [.startTime // "-", .homeTeam, .awayTeam, .stadium // "-"] | @tsv')
    if [ -z "$games" ]; then
      echo "error: $today の試合が無い。SUBJECT=stats:batting:cl などで試して" >&2
      exit 1
    fi
    standings_ctx=''
    for league in cl pl; do
      table=$(curl -fsS "$NPBINFO_BASE_URL/api/standings/$league?year=$YEAR" | jq -r '
        ["順位","チーム","勝","敗","分","勝率","差"],
        (.teams[] | [.rank, .name, .win, .lose, .draw, .pct, .gamesBehind])
        | @tsv')
      standings_ctx=$(printf '%s\n\n%s の順位表:\n%s' \
        "$standings_ctx" "$(league_label "$league")" "$table")
    done
    prompt=$(printf '%s の試合カード:\n開始\tホーム\tビジター\t球場\n%s\n%s' \
      "$today" "$games" "$standings_ctx")
    ;;
  stats:*)
    rules_file=stats.txt
    type=$(echo "$SUBJECT" | cut -d: -f2)
    league=$(echo "$SUBJECT" | cut -d: -f3)
    stats=$(curl -fsS "$NPBINFO_BASE_URL/api/stats/$type/$league?year=$YEAR")
    if [ "$type" = batting ]; then
      table=$(printf '%s' "$stats" | jq -r '
        ["順位","選手","チーム","試合","打率","安打","本塁打","打点","盗塁","出塁率","長打率"],
        (.players[:20][] | [.rank, .name, .team, .games, .avg, .hits, .hr, .rbi, .sb, .obp, .slg])
        | @tsv')
    else
      table=$(printf '%s' "$stats" | jq -r '
        ["順位","選手","チーム","防御率","登板","勝","敗","セーブ","投球回","奪三振"],
        (.players[:20][] | [.rank, .name, .team, .era, .games, .wins, .losses, .saves, .ip, .so])
        | @tsv')
    fi
    prompt=$(printf '%s年 %s %s ランキング（上位20人）:\n\n%s' \
      "$YEAR" "$(league_label "$league")" "$(stats_label "$type")" "$table")
    ;;
  *)
    echo "error: SUBJECT は schedule か stats:batting:cl 形式で指定して" >&2
    exit 1
    ;;
esac

system=$(printf '%s\n%s' "$persona_text" "$(cat "$PROMPTS_DIR/$rules_file")")

# ─── プロバイダ別の呼び出し ───────────────────────────────────
call_openai_compat() {
  base=$1
  key=$2
  model=$3
  response=$(jq -n \
    --arg model "$model" \
    --arg system "$system" \
    --arg user "$prompt" \
    '{model: $model, messages: [{role: "system", content: $system}, {role: "user", content: $user}]}' \
    | curl -sS "$base/chat/completions" \
        -H "Authorization: Bearer $key" \
        -H 'Content-Type: application/json' \
        -d @-) || { echo "(呼び出し失敗) $response"; return 0; }
  error=$(printf '%s' "$response" \
    | jq -r 'if type == "array" then .[0] else . end | .error.message // empty' 2>/dev/null)
  if [ -n "$error" ]; then
    echo "(API エラー) $error"
    return 0
  fi
  printf '%s' "$response" | jq -r '.choices[0].message.content // "(空の応答)"'
}

# Anthropic はネイティブ API（/v1/messages）。thinking は常時オンなので
# max_tokens に余裕を持たせる。temperature は非対応のため送らない。
call_anthropic() {
  model=$1
  response=$(jq -n \
    --arg model "$model" \
    --arg system "$system" \
    --arg user "$prompt" \
    '{model: $model, max_tokens: 8000, system: $system,
      messages: [{role: "user", content: $user}]}' \
    | curl -sS 'https://api.anthropic.com/v1/messages' \
        -H "x-api-key: $LLM_API_KEY_CLAUDE" \
        -H 'anthropic-version: 2023-06-01' \
        -H 'Content-Type: application/json' \
        -d @-) || { echo "(呼び出し失敗) $response"; return 0; }
  error=$(printf '%s' "$response" | jq -r '.error.message // empty' 2>/dev/null)
  if [ -n "$error" ]; then
    echo "(API エラー) $error"
    return 0
  fi
  if [ "$(printf '%s' "$response" | jq -r '.stop_reason // empty')" = refusal ]; then
    echo '(refusal: セーフティ分類器により拒否された)'
    return 0
  fi
  printf '%s' "$response" \
    | jq -r '[.content[]? | select(.type == "text") | .text] | join("\n") // "(空の応答)"'
}

printf '対象: %s / 担当キャラ: %s\n' "$SUBJECT" "$PERSONA"
printf '===== prompt =====\n--- system ---\n%s\n--- user ---\n%s\n\n' "$system" "$prompt"

for entry in $MODELS; do
  provider=${entry%%:*}
  model=${entry#*:}
  started=$(date +%s)
  printf '===== %s (%s) =====\n' "$model" "$provider"
  case "$provider" in
    gemini)
      output=$(call_openai_compat 'https://generativelanguage.googleapis.com/v1beta/openai' "${LLM_API_KEY:?LLM_API_KEY を設定してください}" "$model") ;;
    openai)
      output=$(call_openai_compat 'https://api.openai.com/v1' "${LLM_API_KEY_OPENAI:?LLM_API_KEY_OPENAI を設定してください}" "$model") ;;
    anthropic)
      : "${LLM_API_KEY_CLAUDE:?LLM_API_KEY_CLAUDE を設定してください}"
      output=$(call_anthropic "$model") ;;
    local)
      output=$(call_openai_compat "${LLM_LOCAL_BASE_URL:-http://localhost:8080/v1}" dummy "$model") ;;
    *)
      output="(不明な provider: $provider)" ;;
  esac
  printf '%s\n(%d 秒)\n\n' "$output" "$(( $(date +%s) - started ))"
done
