#!/bin/sh
# AIコメントを OpenAI 互換 API で生成し、npbinfo Worker へ push する。
# 対象: チーム調子 (team) / 個人成績ランキング (stats) / 今日の見所 (schedule) / 球場案内・球場飯 (stadium)。
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
#   SUBJECTS        生成対象の種類を空白区切りで絞る（team stats schedule stadium）。既定は日次対象
#   LLM_TEMPERATURE 生成温度（0〜2）。未指定なら API 既定値。上げると文章は自由になるが脱線リスクも上がる
#   PROMPTS_DIR     プロンプト置き場。既定はリポジトリの prompts/
#   SYSTEM_PROMPT   システムプロンプト全体の上書き（キャラ設定+共通ルールの合成を無視する）
#   DRY_RUN         1 にすると LLM 呼び出しと push をせず、合成したプロンプトを表示するだけ
#
# システムプロンプトは「キャラ設定 + タスク別ルール」の合成:
#   prompts/personas/<slug>.txt  コメンテーターのキャラ設定（無ければ既定の解説者）
#   prompts/common.txt           チーム調子コメントのルール
#   prompts/stats.txt            個人成績ランキングコメントのルール
#   prompts/schedule.txt         今日の見所記事のルール
#   prompts/stadium.txt          球場案内のルール
#   prompts/stadium_food.txt     球場飯情報のルール
# team はチームごとの担当キャラ、stats / schedule は12球団キャラからランダムに起用する。
# stadium は当日その球場で実際にビジター側として試合をするチームがあればそれを、
# なければ今回の実行でまだ起用していないチーム（ホーム以外）から選び、
# 球場案内・球場飯情報の両方を同じキャラで担当する。
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
SUBJECTS="${SUBJECTS:-team stats schedule}"
DEFAULT_PERSONA='あなたはプロ野球の解説者です。文体はです・ます調。'

subject_enabled() {
  case " $SUBJECTS " in
    *" $1 "*) return 0 ;;
    *) return 1 ;;
  esac
}

# personas/ からランダムに1キャラの slug を選ぶ（無ければ空 = 既定の解説者）
random_persona_slug() {
  find "$PROMPTS_DIR/personas" -name '*.txt' 2>/dev/null \
    | shuf -n 1 | xargs -r basename | sed 's/\.txt$//'
}

# 指定リーグの6球団からランダムに1キャラ選ぶ（cl / pl 以外は全体から）
random_persona_for_league() {
  case "$1" in
    cl) printf '%s\n' yakult hanshin giants dena hiroshima chunichi | shuf -n 1 ;;
    pl) printf '%s\n' softbank nipponham rakuten lotte orix seibu | shuf -n 1 ;;
    *) random_persona_slug ;;
  esac
}

random_visitor_persona_for_team() {
  home_slug=$(slug_for "$1")
  case "$1" in
    ヤクルト|阪神|巨人|DeNA|広島|中日)
      candidates='yakult hanshin giants dena hiroshima chunichi'
      ;;
    ソフトバンク|日本ハム|楽天|ロッテ|オリックス|西武)
      candidates='softbank nipponham rakuten lotte orix seibu'
      ;;
    *)
      random_persona_slug
      return
      ;;
  esac
  printf '%s\n' $candidates | awk -v home="$home_slug" '$0 != home' | shuf -n 1
}

# 指定チームが本拠地で「今日」実際にビジターとして対戦する相手チーム名を返す（試合がなければ空）
away_team_at_home() {
  printf '%s' "$SCHEDULE_JSON" | jq -r --arg today "$STADIUM_TODAY" --arg team "$1" '
    [.games[] | select(.date == $today) | select(.homeTeam == $team)] | .[0].awayTeam // empty'
}

# stadium のフォールバック担当キャラを選ぶ（当日その球場で実際のビジターが確定しなかった場合用）。
#   同リーグ・ホーム以外で、今回の実行でまだ使っていないチームからシャッフルで選ぶ。
#   候補が尽きた場合の保険として、従来通りホーム以外からランダムに選ぶ。
# 呼び出し側で STADIUM_USED に積んで、同じ実行内で全チームに一巡してから重複させる。
pick_fallback_persona() {
  team=$1
  home_slug=$(slug_for "$team")
  case "$team" in
    ヤクルト|阪神|巨人|DeNA|広島|中日) candidates='yakult hanshin giants dena hiroshima chunichi' ;;
    ソフトバンク|日本ハム|楽天|ロッテ|オリックス|西武) candidates='softbank nipponham rakuten lotte orix seibu' ;;
    *) candidates='' ;;
  esac

  if [ -n "$candidates" ]; then
    persona=$(printf '%s\n' $candidates | awk -v home="$home_slug" '$0 != home' \
      | while IFS= read -r c; do
          case " $STADIUM_USED " in
            *" $c "*) ;;
            *) echo "$c" ;;
          esac
        done \
      | shuf -n 1)
    if [ -n "$persona" ]; then
      printf '%s' "$persona"
      return
    fi
  fi

  random_visitor_persona_for_team "$team"
}

# キャラ設定（personas/<slug>.txt）とタスク別ルール（common.txt など）を合成する。
# SYSTEM_PROMPT が指定されていれば合成せずそれを使う。
system_prompt_for() {
  slug=$1
  rules_file=${2:-common.txt}
  if [ -n "${SYSTEM_PROMPT:-}" ]; then
    printf '%s' "$SYSTEM_PROMPT"
    return
  fi
  persona_file="$PROMPTS_DIR/personas/$slug.txt"
  if [ -n "$slug" ] && [ -f "$persona_file" ]; then
    persona=$(cat "$persona_file")
  else
    persona=$DEFAULT_PERSONA
  fi
  printf '%s\n%s' "$persona" "$(cat "$PROMPTS_DIR/$rules_file")"
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

stats_label() {
  [ "$1" = batting ] && echo '打撃成績' || echo '投手成績'
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
  subject_type=$1
  subject_key=$2
  content=$3
  persona=${4:-}
  jq -n \
    --arg type "$subject_type" \
    --arg key "$subject_key" \
    --argjson year "$YEAR" \
    --arg content "$content" \
    --arg model "$LLM_MODEL" \
    --arg persona "$persona" \
    '{subjectType: $type, subjectKey: $key, year: $year, content: $content, model: $model}
     + (if $persona != "" then {persona: $persona} else {} end)' \
    | curl -fsS -X POST "$NPBINFO_BASE_URL/api/ai/comments" \
        -H "Authorization: Bearer $REFRESH_TOKEN" \
        -H 'Content-Type: application/json' \
        -d @-
}

check_ingest_auth() {
  status=$(printf '{}' \
    | curl -sS -o /dev/null -w '%{http_code}' -X POST "$NPBINFO_BASE_URL/api/ai/comments" \
        -H "Authorization: Bearer $REFRESH_TOKEN" \
        -H 'Content-Type: application/json' \
        -d @-)
  case "$status" in
    400) return 0 ;;
    401)
      echo "error: REFRESH_TOKEN が Worker の secret と一致していないため、AIコメントを保存できません" >&2
      return 1
      ;;
    *)
      echo "error: AIコメント保存APIの事前確認に失敗しました (HTTP $status)" >&2
      return 1
      ;;
  esac
}

fetch_stadium_source_text() {
  url=$1
  curl -LfsS --max-time 20 "$url" 2>/dev/null \
    | node -e "
let html = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { html += chunk; });
process.stdin.on('end', () => {
  const text = html
    .replace(/<script[\\s\\S]*?<\\/script>/gi, ' ')
    .replace(/<style[\\s\\S]*?<\\/style>/gi, ' ')
    .replace(/<noscript[\\s\\S]*?<\\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '\"')
    .replace(/&#39;/g, \"'\")
    .replace(/\\s+/g, ' ')
    .trim();
  console.log(text.slice(0, 3000));
});
" || true
}

# 生成して push する共通処理。DRY_RUN ならプロンプト表示のみ。
generate_and_push() {
  label=$1
  subject_type=$2
  subject_key=$3
  system=$4
  prompt=$5
  persona=${6:-}

  if [ -n "$DRY_RUN" ]; then
    printf '===== %s [%s/%s] =====\n--- system ---\n%s\n--- user ---\n%s\n\n' \
      "$label" "$subject_type" "$subject_key" "$system" "$prompt"
    return 0
  fi

  content=$(generate_comment "$system" "$prompt" || true)
  if [ -z "$content" ]; then
    echo "error: $label の生成に失敗" >&2
    sleep "$LLM_SLEEP"
    return 1
  fi

  if ! result=$(push_comment "$subject_type" "$subject_key" "$content" "$persona"); then
    echo "error: $label の保存に失敗" >&2
    sleep "$LLM_SLEEP"
    return 1
  fi
  echo "$label [$subject_type/$subject_key]: $result"
  sleep "$LLM_SLEEP"
}

if [ -z "$DRY_RUN" ]; then
  check_ingest_auth
fi

# ─── schedule: 今日の見所（リーグ別に1本ずつ、担当はそのリーグのキャラ） ──
# key はセ・パが「日付:cl」「日付:pl」、交流戦カードは従来どおり「日付」。
if subject_enabled schedule; then
  today=$(date +%Y-%m-%d)
  schedule_json=$(curl -fsS "$NPBINFO_BASE_URL/api/schedule/$(date +%Y-%m)")
  games_header=$(printf '開始\tホーム\t予告先発(ホーム)\tビジター\t予告先発(ビジター)\t球場')

  # 当日の試合カードをリーグ（cl / pl / inter=交流戦・分類不能）で絞って TSV にする
  games_for_league() {
    printf '%s' "$schedule_json" | jq -r --arg today "$today" --arg lg "$1" '
      def lgof($t): if (["ヤクルト","阪神","巨人","DeNA","広島","中日"] | index($t)) != null then "cl"
        elif (["ソフトバンク","日本ハム","楽天","ロッテ","オリックス","西武"] | index($t)) != null then "pl"
        else null end;
      .games[] | select(.date == $today)
      | (if lgof(.homeTeam) != null and lgof(.homeTeam) == lgof(.awayTeam) then lgof(.homeTeam) else "inter" end) as $g
      | select($g == $lg)
      | [.startTime // "-", .homeTeam, (.homePitcher // ""), .awayTeam, (.awayPitcher // ""), .stadium // "-"] | @tsv'
  }

  standings_table() {
    curl -fsS "$NPBINFO_BASE_URL/api/standings/$1?year=$YEAR" | jq -r '
      ["順位","チーム","勝","敗","分","勝率","差"],
      (.teams[] | [.rank, .name, .win, .lose, .draw, .pct, .gamesBehind])
      | @tsv'
  }

  generated=0
  for lg in cl pl; do
    games=$(games_for_league "$lg")
    [ -z "$games" ] && continue
    persona=$(random_persona_for_league "$lg")
    system=$(system_prompt_for "$persona" schedule.txt)
    prompt=$(printf '%s の%sの試合カード:\n%s\n%s\n\n%s の順位表:\n%s' \
      "$today" "$(league_label "$lg")" "$games_header" "$games" \
      "$(league_label "$lg")" "$(standings_table "$lg")")
    generate_and_push "今日の見所 $lg" schedule "$today:$lg" "$system" "$prompt" "$persona" || true
    generated=1
  done

  games=$(games_for_league inter)
  if [ -n "$games" ]; then
    persona=$(random_persona_slug)
    system=$(system_prompt_for "$persona" schedule.txt)
    prompt=$(printf '%s の交流戦の試合カード:\n%s\n%s\n\nセ・リーグ の順位表:\n%s\n\nパ・リーグ の順位表:\n%s' \
      "$today" "$games_header" "$games" "$(standings_table cl)" "$(standings_table pl)")
    generate_and_push '今日の見所 交流戦' schedule "$today" "$system" "$prompt" "$persona" || true
    generated=1
  fi
  if [ "$generated" -eq 0 ]; then
    echo "skip: $today の試合はない" >&2
  fi
fi

# ─── team: チーム調子コメント（チームごとの担当キャラ） ───────
if subject_enabled team; then
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

      system=$(system_prompt_for "$slug" common.txt)
      prompt=$(printf '%s年 %s の順位表:\n\n%s\n\n対象チーム: %s' \
        "$YEAR" "$(league_label "$league")" "$table" "$name")
      generate_and_push "$name" team "$slug" "$system" "$prompt" "$slug" || true
    done
  done
fi

# ─── stats: 個人成績ランキングコメント（ランダムキャラ起用） ──
# npb.jp 由来の1文字略記（神/ソ等）を正式な短縮名に展開して渡す
# （src/components/PlayerStats.jsx の TEAM_MAP と同じ対応表）
TEAM_EXPAND='def team($t): {"神":"阪神","デ":"DeNA","ヤ":"ヤクルト","巨":"巨人","広":"広島","中":"中日",
  "ソ":"ソフトバンク","日":"日本ハム","楽":"楽天","ロ":"ロッテ","オ":"オリックス","西":"西武"}[$t] // $t;'
if subject_enabled stats; then
  for type in batting pitching; do
    for league in cl pl; do
      stats=$(curl -fsS "$NPBINFO_BASE_URL/api/stats/$type/$league?year=$YEAR")
      if [ "$type" = batting ]; then
        table=$(printf '%s' "$stats" | jq -r "$TEAM_EXPAND"'
          ["順位","選手","チーム","試合","打率","安打","本塁打","打点","盗塁","出塁率","長打率"],
          (.players[:20][] | [.rank, .name, team(.team), .games, .avg, .hits, .hr, .rbi, .sb, .obp, .slg])
          | @tsv')
      else
        table=$(printf '%s' "$stats" | jq -r "$TEAM_EXPAND"'
          ["順位","選手","チーム","防御率","登板","勝","敗","セーブ","投球回","奪三振"],
          (.players[:20][] | [.rank, .name, team(.team), .era, .games, .wins, .losses, .saves, .ip, .so])
          | @tsv')
      fi
      if [ -z "$table" ]; then
        echo "skip: $type/$league の成績データがない" >&2
        continue
      fi

      persona=$(random_persona_slug)
      system=$(system_prompt_for "$persona" stats.txt)
      prompt=$(printf '%s年 %s %s ランキング（上位20人）:\n\n%s' \
        "$YEAR" "$(league_label "$league")" "$(stats_label "$type")" "$table")
      generate_and_push "$(stats_label "$type") $league" stats "$type:$league" \
        "$system" "$prompt" "$persona" || true
    done
  done
fi

# ─── stadium: 球場案内・球場飯（実際のビジターチーム優先、いなければ持ち回りで選んだ担当キャラ） ──
if subject_enabled stadium; then
  STADIUM_TODAY=$(date +%Y-%m-%d)
  SCHEDULE_JSON=$(curl -fsS "$NPBINFO_BASE_URL/api/schedule/$(date +%Y-%m)")
  STADIUM_USED=''
  stadium_tmp=$(mktemp)
  trap 'rm -f "$stadium_tmp"' EXIT

  stadium_rows=$(node --input-type=module -e "
import { pathToFileURL } from 'node:url';
const { STADIUMS } = await import(pathToFileURL(process.argv[1]));
for (const s of STADIUMS) {
  console.log([s.id, s.team, s.name, s.officialName, s.address, s.capacity, s.leftField, s.rightField, s.centerField, s.opened, s.roof, s.url].join('\t'));
}
" "$SCRIPT_DIR/../src/data/stadiums.js")

  # 1巡目: 当日その球場で実際にビジターとして対戦するチームを先に確定し、STADIUM_USED に積む。
  # (real match の予約をフォールバックのプール選定より先に済ませておかないと、
  #  後段の球場が本物のビジターと同じチームをプールから重複して選んでしまう)
  : > "$stadium_tmp"
  while IFS="$(printf '\t')" read -r id team name official address capacity left right center opened roof url; do
    [ -z "$id" ] && continue
    home_slug=$(slug_for "$team")
    persona=''
    away=$(away_team_at_home "$team")
    if [ -n "$away" ]; then
      away_slug=$(slug_for "$away")
      if [ -n "$away_slug" ] && [ "$away_slug" != "$home_slug" ]; then
        persona=$away_slug
        STADIUM_USED="$STADIUM_USED $persona"
      fi
    fi
    printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
      "$id" "$team" "$name" "$official" "$address" "$capacity" "$left" "$right" "$center" "$opened" "$roof" "$url" "$persona" \
      >> "$stadium_tmp"
  done <<STADIUM_EOF
$stadium_rows
STADIUM_EOF

  # 2巡目: 実際のビジターが決まらなかった球場にフォールバックで担当キャラを割り当て、生成・保存する。
  while IFS="$(printf '\t')" read -r id team name official address capacity left right center opened roof url persona; do
    [ -z "$id" ] && continue
    if [ -z "$persona" ]; then
      persona=$(pick_fallback_persona "$team")
      STADIUM_USED="$STADIUM_USED $persona"
    fi

    source_text=$(fetch_stadium_source_text "$url")
    info=$(printf '球場基本情報:\nID\tホーム球団\t表示名\t正式名\t所在地\t収容人数\t左翼\t右翼\t中堅\t開場年\t屋根\t公式URL\n%s\t%s\t%s\t%s\t%s\t%s\t%sm\t%sm\t%sm\t%s\t%s\t%s\n\n公式サイト等から抽出したテキスト:\n%s' \
      "$id" "$team" "$name" "$official" "$address" "$capacity" "$left" "$right" "$center" "$opened" "$roof" "$url" \
      "${source_text:-取得できる告知テキストなし}")

    system=$(system_prompt_for "$persona" stadium.txt)
    generate_and_push "球場案内 $name" stadium "$id" "$system" "$info" "$persona" || true

    system_food=$(system_prompt_for "$persona" stadium_food.txt)
    generate_and_push "球場飯 $name" stadium_food "$id" "$system_food" "$info" "$persona" || true
  done < "$stadium_tmp"

  rm -f "$stadium_tmp"
  trap - EXIT
fi
