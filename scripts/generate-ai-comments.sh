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
#   LLM_MODEL       既定 models/gemini-3.5-flash（Gemini は models/ プレフィックス必須）
#   NPBINFO_BASE_URL 既定 https://npbinfo.kusanaginoturugi.workers.dev
#   YEAR            既定 今年
#   LLM_SLEEP       各リクエスト間の待ち秒数（無料枠のレート制限対策）。既定 5
#   TEAMS           生成対象を空白区切りのチーム名で絞る（例: TEAMS="日本ハム 楽天"）。既定は全チーム
#   LLM_TEMPERATURE 生成温度（0〜2）。未指定なら API 既定値。上げると文章は自由になるが脱線リスクも上がる
#   PROMPTS_DIR     プロンプト置き場。既定はリポジトリの prompts/
#   SYSTEM_PROMPT   システムプロンプト全体の上書き（キャラ設定+共通ルールの合成を無視する）
#   DRY_RUN         1 にすると LLM 呼び出しと push をせず、合成したプロンプトを表示するだけ
#
# システムプロンプトは「キャラ設定 + 共通ルール」の合成:
#   prompts/personas/<slug>.txt  チームごとのコメンテーターのキャラ設定（無ければ既定の解説者）
#   prompts/common.txt           全チーム共通のルール
set -eu

DRY_RUN="${DRY_RUN:-}"
if [ -z "$DRY_RUN" ]; then
  : "${LLM_API_KEY:?LLM_API_KEY を設定してください}"
  : "${REFRESH_TOKEN:?REFRESH_TOKEN を設定してください}"
fi
LLM_BASE_URL="${LLM_BASE_URL:-https://generativelanguage.googleapis.com/v1beta/openai}"
# 注意: Gemini は古いモデルを新規ユーザーに順次閉じる。使えなくなったら
# /v1beta/openai/models で一覧を確認して差し替える（models/ プレフィックス必須）。
LLM_MODEL="${LLM_MODEL:-models/gemini-3.5-flash}"
NPBINFO_BASE_URL="${NPBINFO_BASE_URL:-https://npbinfo.kusanaginoturugi.workers.dev}"
YEAR="${YEAR:-$(date +%Y)}"
LLM_SLEEP="${LLM_SLEEP:-5}"

SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
PROMPTS_DIR="${PROMPTS_DIR:-$SCRIPT_DIR/../prompts}"
COMMON_PROMPT=$(cat "$PROMPTS_DIR/common.txt")
DEFAULT_PERSONA='あなたはプロ野球の解説者です。文体はです・ます調。'

# キャラ設定（personas/<slug>.txt）と共通ルール（common.txt）を合成する。
# SYSTEM_PROMPT が指定されていれば合成せずそれを使う。
system_prompt_for() {
  slug=$1
  if [ -n "${SYSTEM_PROMPT:-}" ]; then
    printf '%s' "$SYSTEM_PROMPT"
    return
  fi
  persona_file="$PROMPTS_DIR/personas/$slug.txt"
  if [ -f "$persona_file" ]; then
    persona=$(cat "$persona_file")
  else
    persona=$DEFAULT_PERSONA
  fi
  printf '%s\n%s' "$persona" "$COMMON_PROMPT"
}

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
  system=$1
  prompt=$2
  attempt=1
  while :; do
    response=$(jq -n \
      --arg model "$LLM_MODEL" \
      --arg system "$system" \
      --arg user "$prompt" \
      --arg temp "${LLM_TEMPERATURE:-}" \
      '{model: $model, messages: [{role: "system", content: $system}, {role: "user", content: $user}]}
       + (if $temp != "" then {temperature: ($temp | tonumber)} else {} end)' \
      | curl -sS "$LLM_BASE_URL/chat/completions" \
          -H "Authorization: Bearer $LLM_API_KEY" \
          -H 'Content-Type: application/json' \
          -d @-)
    # Gemini はエラーを [{error: ...}] の配列で返すことがある
    error=$(printf '%s' "$response" \
      | jq -r 'if type == "array" then .[0] else . end | .error.message // empty' 2>/dev/null)
    if [ -z "$error" ]; then
      printf '%s' "$response" | jq -r '.choices[0].message.content // empty'
      return 0
    fi
    echo "LLM error (attempt $attempt): $error" >&2
    if [ "$attempt" -ge 3 ]; then
      return 1
    fi
    attempt=$((attempt + 1))
    # 429 や一時的な high demand 向けに間隔を伸ばして再試行
    sleep $((LLM_SLEEP * attempt))
  done
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
    if [ -n "${TEAMS:-}" ]; then
      case " $TEAMS " in
        *" $name "*) ;;
        *) continue ;;
      esac
    fi
    slug=$(slug_for "$name")
    if [ -z "$slug" ]; then
      echo "skip: 未知のチーム名 $name" >&2
      continue
    fi

    system=$(system_prompt_for "$slug")
    prompt=$(printf '%s年 %s の順位表:\n\n%s\n\n対象チーム: %s' \
      "$YEAR" "$(league_label "$league")" "$table" "$name")

    if [ -n "$DRY_RUN" ]; then
      printf '===== %s (%s) =====\n--- system ---\n%s\n--- user ---\n%s\n\n' \
        "$name" "$slug" "$system" "$prompt"
      continue
    fi

    content=$(generate_comment "$system" "$prompt" || true)
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
