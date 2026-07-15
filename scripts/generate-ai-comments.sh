#!/bin/sh
# チーム調子コメントを OpenAI 互換 API で生成し、npbinfo Worker へ push する。
# 想定実行環境: 自宅マシンの cron / systemd timer（issue #13）。
#
# 必須環境変数:
#   LLM_API_KEY     LLM の API キー（llama.cpp なら任意の文字列で可）
#   REFRESH_TOKEN   Worker の ingest 認証トークン（wrangler secret と同じ値）
# 任意環境変数:
#   LLM_BASE_URL    OpenAI 互換エンドポイント。既定は Gemini。
#                   llama.cpp に切り替えるときは http://localhost:8080/v1 など。
#   LLM_MODEL       既定 models/gemini-2.5-flash（Gemini は models/ プレフィックス必須）
#   NPBINFO_BASE_URL 既定 https://npbinfo.kusanaginoturugi.workers.dev
#   YEAR            既定 今年
#   LLM_SLEEP       各リクエスト間の待ち秒数（無料枠のレート制限対策）。既定 5
set -eu

: "${LLM_API_KEY:?LLM_API_KEY を設定してください}"
: "${REFRESH_TOKEN:?REFRESH_TOKEN を設定してください}"
LLM_BASE_URL="${LLM_BASE_URL:-https://generativelanguage.googleapis.com/v1beta/openai}"
LLM_MODEL="${LLM_MODEL:-models/gemini-2.5-flash}"
NPBINFO_BASE_URL="${NPBINFO_BASE_URL:-https://npbinfo.kusanaginoturugi.workers.dev}"
YEAR="${YEAR:-$(date +%Y)}"
LLM_SLEEP="${LLM_SLEEP:-5}"

SYSTEM_PROMPT='あなたはプロ野球の解説者です。与えられた成績データだけを根拠に、対象チームの現在の調子を日本語200字程度で解説してください。データに含まれない事実（個別の選手名、怪我、直近の試合展開など）は書かないでください。リーグ内での相対的な位置づけ（打撃・投手・守備の強み弱み）に触れてください。文体はです・ます調。出力はコメント本文のみ。'

# shared/teams.js の shortName → slug 対応
slug_for() {
  case "$1" in
    ヤクルト) echo yakult ;;
    阪神) echo hanshin ;;
    巨人) echo giants ;;
    DeNA) echo dena ;;
    広島) echo hiroshima ;;
    中日) echo chunichi ;;
    ソフトバンク) echo softbank ;;
    日本ハム) echo nipponham ;;
    楽天) echo rakuten ;;
    ロッテ) echo lotte ;;
    オリックス) echo orix ;;
    西武) echo seibu ;;
    *) echo '' ;;
  esac
}

league_label() {
  [ "$1" = cl ] && echo 'セ・リーグ' || echo 'パ・リーグ'
}

generate_comment() {
  prompt=$1
  response=$(jq -n \
    --arg model "$LLM_MODEL" \
    --arg system "$SYSTEM_PROMPT" \
    --arg user "$prompt" \
    '{model: $model, messages: [{role: "system", content: $system}, {role: "user", content: $user}]}' \
    | curl -sS "$LLM_BASE_URL/chat/completions" \
        -H "Authorization: Bearer $LLM_API_KEY" \
        -H 'Content-Type: application/json' \
        -d @-)
  # Gemini はエラーを [{error: ...}] の配列で返すことがある
  error=$(printf '%s' "$response" \
    | jq -r 'if type == "array" then .[0] else . end | .error.message // empty' 2>/dev/null)
  if [ -n "$error" ]; then
    echo "LLM error: $error" >&2
    return 1
  fi
  printf '%s' "$response" | jq -r '.choices[0].message.content // empty'
}

push_comment() {
  slug=$1
  content=$2
  jq -n \
    --arg key "$slug" \
    --argjson year "$YEAR" \
    --arg content "$content" \
    --arg model "$LLM_MODEL" \
    '{subjectType: "team", subjectKey: $key, year: $year, content: $content, model: $model}' \
    | curl -fsS -X POST "$NPBINFO_BASE_URL/api/ai/comments" \
        -H "Authorization: Bearer $REFRESH_TOKEN" \
        -H 'Content-Type: application/json' \
        -d @-
}

for league in cl pl; do
  standings=$(curl -fsS "$NPBINFO_BASE_URL/api/standings/$league?year=$YEAR")
  table=$(printf '%s' "$standings" | jq -r '
    ["順位","チーム","試合","勝","敗","分","勝率","差","打率","OPS","本塁打","盗塁","防御率","DER近似","守備率"],
    (.teams[] | [.rank, .name, .playGameCount, .win, .lose, .draw, .pct, .gamesBehind, .avg, .ops, .hr, .sb, .era, .derApprox, .fieldingPct])
    | @tsv')

  printf '%s' "$standings" | jq -r '.teams[].name' | while IFS= read -r name; do
    slug=$(slug_for "$name")
    if [ -z "$slug" ]; then
      echo "skip: 未知のチーム名 $name" >&2
      continue
    fi

    prompt=$(printf '%s年 %s の順位表:\n\n%s\n\n対象チーム: %s' \
      "$YEAR" "$(league_label "$league")" "$table" "$name")
    content=$(generate_comment "$prompt" || true)
    if [ -z "$content" ]; then
      echo "error: $name の生成に失敗" >&2
      sleep "$LLM_SLEEP"
      continue
    fi

    result=$(push_comment "$slug" "$content")
    echo "$name ($slug): $result"
    sleep "$LLM_SLEEP"
  done
done
