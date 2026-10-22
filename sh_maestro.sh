#!/usr/bin/env bash
# VS Code/кнопки вызывают `sh ./…`. На macOS /bin/sh = bash --posix
# (без process substitution / mapfile). Всегда уходим в обычный bash.
if [ -z "${_SH_MAESTRO_REEXEC:-}" ]; then
  export _SH_MAESTRO_REEXEC=1
  exec /usr/bin/env bash "$0" "$@"
fi

set -e

# Переход в корень репозитория
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

MAESTRO_DIR=".maestro"
DEFAULT_APP_ID="${APP_ID:-com.litnet.devharness.flutter_dev_harness}"
VIEWER_URL="${MAESTRO_VIEWER_URL:-http://127.0.0.1:9999}"

if ! command -v maestro >/dev/null 2>&1; then
  echo "maestro не найден в PATH. Установи: https://maestro.mobile.dev/getting-started/installing-maestro"
  exit 1
fi

if [[ ! -d "$MAESTRO_DIR" ]]; then
  echo "Папка $MAESTRO_DIR не найдена."
  exit 1
fi

# --- Maestro Viewer (MCP, :9999): start/stop device MJPEG stream ---

viewer_is_up() {
  curl -sf --connect-timeout 1 -o /dev/null "$VIEWER_URL/" 2>/dev/null
}

viewer_require_up() {
  if viewer_is_up; then
    return 0
  fi
  echo ""
  echo "  Maestro Viewer недоступен: $VIEWER_URL"
  echo "  Он поднимается вместе с MCP Maestro в Cursor (Settings → MCP → Maestro)."
  echo "  Studio.app на :5050 — другой UI; стрим Viewer с ним конфликтует."
  return 1
}

# Читает одно SSE data-событие с /api/device/state (JSON).
viewer_device_state_json() {
  python3 - "$VIEWER_URL" <<'PY'
import json, sys, urllib.request
base = sys.argv[1].rstrip("/")
req = urllib.request.Request(base + "/api/device/state", headers={"Accept": "text/event-stream"})
with urllib.request.urlopen(req, timeout=5) as resp:
    for raw in resp:
        line = raw.decode("utf-8", "replace").strip()
        if line.startswith("data:"):
            payload = line[5:].strip()
            if payload:
                print(payload)
                break
PY
}

viewer_list_targets() {
  curl -sf --connect-timeout 3 "$VIEWER_URL/api/device/targets" 2>/dev/null
}

viewer_post_start() {
  local platform="$1"
  local device_type="$2"
  local device_id="$3"
  curl -sf --connect-timeout 5 -m 60 \
    -X POST "$VIEWER_URL/api/device/start" \
    -H 'Content-Type: application/json' \
    -d "{\"platform\":\"$platform\",\"deviceType\":\"$device_type\",\"deviceId\":\"$device_id\"}" \
    2>/dev/null || true
}

# DeviceStream при status=streaming/starting для того же deviceId делает early-return
# и отдаёт мёртвый streamUrl. Смена deviceId → cleanupProcess() и реальный рестарт.
viewer_force_reset_state() {
  local platform="${1:-android}"
  local device_type="${2:-android_device}"
  echo "  → сброс залипшего streaming-state…"
  viewer_post_start "$platform" "$device_type" "__force_reset__" >/dev/null || true
}

viewer_mjpeg_alive() {
  local url="$1"
  [[ -n "$url" ]] || return 1
  curl -sf --connect-timeout 2 -m 3 -o /dev/null "$url" 2>/dev/null
}

viewer_start_stream() {
  if ! viewer_require_up; then
    return 1
  fi

  if pgrep -f 'Maestro Studio' >/dev/null 2>&1; then
    echo ""
    echo "  ⚠ Запущен Maestro Studio — он часто ломает MJPEG на :9999."
    echo -n "  Продолжить start стрима Viewer? [y/N]: "
    local cont
    read -r cont
    case "$cont" in
      y|Y|yes|YES) ;;
      *)
        echo "  Отменено. Закрой Studio и повтори, либо смотри экран на http://127.0.0.1:5050"
        return 1
        ;;
    esac
  fi

  local targets_json
  targets_json="$(viewer_list_targets || true)"
  if [[ -z "$targets_json" ]]; then
    echo "  Не удалось получить /api/device/targets"
    return 1
  fi

  local devices=()
  while IFS= read -r line; do
    [[ -n "$line" ]] && devices+=("$line")
  done < <(python3 -c '
import json,sys
data=json.load(sys.stdin)
for d in data.get("devices") or []:
    print("|".join([
        d.get("platform") or "",
        d.get("deviceType") or "",
        d.get("deviceId") or "",
    ]))
' <<<"$targets_json")

  if [[ ${#devices[@]} -eq 0 ]]; then
    echo "  Нет устройств в Viewer targets. Подключи телефон/эмулятор."
    return 1
  fi

  local platform device_type device_id
  if [[ ${#devices[@]} -eq 1 ]]; then
    IFS='|' read -r platform device_type device_id <<<"${devices[0]}"
    echo "  Устройство: $device_id ($platform / $device_type)"
  else
    echo ""
    echo "  Устройства Viewer:"
    local idx=1
    local d
    for d in "${devices[@]}"; do
      IFS='|' read -r platform device_type device_id <<<"$d"
      echo "  $idx) $device_id  ($platform / $device_type)"
      idx=$((idx + 1))
    done
    echo -n "  Выбери устройство: "
    local pick
    read -r pick
    if ! [[ "$pick" =~ ^[0-9]+$ ]] || [[ "$pick" -lt 1 ]] || [[ "$pick" -gt ${#devices[@]} ]]; then
      echo "  Неверный выбор."
      return 1
    fi
    IFS='|' read -r platform device_type device_id <<<"${devices[$((pick - 1))]}"
  fi

  # Всегда сбрасываем state: иначе POST start возвращает старый мёртвый streamUrl.
  viewer_stop_stream_silent "$device_id" || true
  viewer_force_reset_state "$platform" "$device_type"

  echo "  → POST $VIEWER_URL/api/device/start …"
  local resp stream_url status
  resp="$(viewer_post_start "$platform" "$device_type" "$device_id")"

  if [[ -z "$resp" ]]; then
    echo "  Start не удался (пустой ответ). Проверь MCP Maestro."
    return 1
  fi

  stream_url="$(python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("streamUrl") or "")' <<<"$resp")"
  status="$(python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("status") or "")' <<<"$resp")"
  echo "  status=$status"
  [[ -n "$stream_url" ]] && echo "  streamUrl=$stream_url"

  if [[ "$status" != "streaming" ]] || ! viewer_mjpeg_alive "$stream_url"; then
    echo "  MJPEG не поднялся — повторный сброс + start…"
    viewer_stop_stream_silent "$device_id" || true
    viewer_force_reset_state "$platform" "$device_type"
    resp="$(viewer_post_start "$platform" "$device_type" "$device_id")"
    stream_url="$(python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("streamUrl") or "")' <<<"$resp")"
    status="$(python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("status") or "")' <<<"$resp")"
    echo "  retry status=$status"
    [[ -n "$stream_url" ]] && echo "  retry streamUrl=$stream_url"
  fi

  if viewer_mjpeg_alive "$stream_url"; then
    echo "  MJPEG жив."
  else
    echo "  ⚠ MJPEG всё ещё мёртв. Закрой Maestro Studio, перезапусти MCP Maestro в Cursor."
  fi

  echo ""
  echo "  Viewer: $VIEWER_URL"
  if command -v open >/dev/null 2>&1; then
    open "$VIEWER_URL" >/dev/null 2>&1 || true
  fi
}

# Тихая остановка стрима устройства (без меню). Нет официального stop API —
# гасим simulator-server / слушателя MJPEG из state.
viewer_stop_stream_silent() {
  local device_id="${1:-}"
  local state_json stream_url port
  state_json="$(viewer_device_state_json 2>/dev/null || true)"
  if [[ -n "$state_json" ]]; then
    stream_url="$(python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("streamUrl") or "")' <<<"$state_json" 2>/dev/null || true)"
    if [[ "$stream_url" =~ :([0-9]+)/ ]]; then
      port="${BASH_REMATCH[1]}"
      if [[ -n "$port" ]]; then
        local pids
        pids="$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)"
        if [[ -n "$pids" ]]; then
          # shellcheck disable=SC2086
          kill $pids 2>/dev/null || true
        fi
      fi
    fi
  fi

  if [[ -n "$device_id" ]]; then
    pkill -f "simulator-server.*${device_id}" 2>/dev/null || true
  else
    pkill -f '/\.maestro/deps/simulator-server' 2>/dev/null || true
  fi
}

viewer_stop_stream() {
  if ! viewer_require_up; then
    return 1
  fi

  local state_json device_id status stream_url platform device_type
  platform="android"
  device_type="android_device"
  state_json="$(viewer_device_state_json 2>/dev/null || true)"
  if [[ -n "$state_json" ]]; then
    device_id="$(python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("deviceId") or "")' <<<"$state_json")"
    status="$(python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("status") or "")' <<<"$state_json")"
    stream_url="$(python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("streamUrl") or "")' <<<"$state_json")"
    platform="$(python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("platform") or "android")' <<<"$state_json")"
    echo "  Текущий state: status=$status deviceId=$device_id"
    [[ -n "$stream_url" ]] && echo "  streamUrl=$stream_url"
  else
    echo "  State не прочитался — всё равно пробуем убить simulator-server."
  fi

  viewer_stop_stream_silent "$device_id"
  # Сбрасываем in-memory streaming, иначе следующий start вернёт мёртвый URL.
  viewer_force_reset_state "$platform" "$device_type"
  echo "  Стрим остановлен."
  echo "  UI: $VIEWER_URL"
}

viewer_status() {
  if ! viewer_require_up; then
    return 1
  fi
  echo "  Viewer UP: $VIEWER_URL"
  local targets_json state_json
  targets_json="$(viewer_list_targets || true)"
  if [[ -n "$targets_json" ]]; then
    echo "  targets:"
    python3 -c '
import json,sys
data=json.load(sys.stdin)
for d in data.get("devices") or []:
    print("    - {} ({}/{})".format(d.get("deviceId"), d.get("platform"), d.get("deviceType")))
if not data.get("devices"):
    print("    (пусто)")
' <<<"$targets_json"
  fi
  state_json="$(viewer_device_state_json 2>/dev/null || true)"
  if [[ -n "$state_json" ]]; then
    echo "  state: $state_json"
    local stream_url
    stream_url="$(python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("streamUrl") or "")' <<<"$state_json")"
    if [[ -n "$stream_url" ]]; then
      if curl -sf --connect-timeout 2 -m 3 -o /dev/null "$stream_url" 2>/dev/null; then
        echo "  MJPEG: OK"
      else
        echo "  MJPEG: DEAD (нужен stop → start)"
      fi
    fi
  fi
  if pgrep -f 'Maestro Studio' >/dev/null 2>&1; then
    echo "  ⚠ Maestro Studio запущен — возможен конфликт стрима."
  fi
}

viewer_menu() {
  echo ""
  echo "  Maestro Viewer ($VIEWER_URL)"
  echo "  1) status"
  echo "  2) start трансляции устройства"
  echo "  3) stop трансляции"
  echo "  4) открыть $VIEWER_URL"
  echo "  b) назад"
  echo -n "  Выбери: "
  local choice
  read -r choice
  case "$choice" in
    1) viewer_status || true ;;
    2) viewer_start_stream || true ;;
    3) viewer_stop_stream || true ;;
    4)
      if command -v open >/dev/null 2>&1; then
        open "$VIEWER_URL" >/dev/null 2>&1 || true
      else
        echo "  Открой вручную: $VIEWER_URL"
      fi
      ;;
    b|B|"") ;;
    *) echo "  Неверный выбор: $choice" ;;
  esac
}

# Страницы для навигации (alias → краткое описание). Пока только меню; сценарии позже.
NAV_PAGES=(
  "main:главная (/main-screen)"
  "book:карточка книги (book-detail)"
)

print_header() {
  echo ""
  echo "╔══════════════════════════════════════════════════════════════╗"
  echo "║                    Maestro — сценарии                         ║"
  echo "╚══════════════════════════════════════════════════════════════╝"
  echo "  APP_ID: $DEFAULT_APP_ID"
  echo "  (override: APP_ID=com.litnet.dev sh ./sh_maestro.sh)"
  echo ""
}

print_sep() {
  echo "  ---"
}

# Подменю: Навигация → конкретная страница / вся навигация.
navigation_menu() {
  echo ""
  echo "  Навигация"
  echo "  1) конкретная страница"
  echo "  2) вся навигация"
  echo "  b) назад"
  echo -n "  Выбери: "
  local choice
  read -r choice
  case "$choice" in
    1) navigation_pick_page ;;
    2)
      echo ""
      echo "  «Вся навигация» пока не настроена — сделаем позже."
      ;;
    b|B|"") ;;
    *) echo "  Неверный выбор: $choice" ;;
  esac
}

# Список доступных страниц + ввод alias (main, book, …).
navigation_pick_page() {
  echo ""
  echo "  Доступные страницы:"
  local i=1
  local entry alias desc
  for entry in "${NAV_PAGES[@]}"; do
    alias="${entry%%:*}"
    desc="${entry#*:}"
    echo "  $i) $alias  —  $desc"
    i=$((i + 1))
  done
  echo ""
  echo -n "  Введи страницу (main / book) или номер: "
  local selected
  read -r selected

  local page=""
  if [[ "$selected" =~ ^[0-9]+$ ]] && [[ "$selected" -ge 1 ]] && [[ "$selected" -le ${#NAV_PAGES[@]} ]]; then
    entry="${NAV_PAGES[$((selected - 1))]}"
    page="${entry%%:*}"
  elif [[ -n "$selected" ]]; then
    page="$(echo "$selected" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')"
  else
    echo "  Страница не выбрана."
    return 0
  fi

  echo ""
  echo "  Страница: $page"
  prompt_relaunch_if_needed
  echo ""
  echo "  RELAUNCH=$RELAUNCH"
  echo "  Сценарий навигации на «$page» пока не настроен — сделаем позже."
}

# true, если процесс APP_ID есть на подключённом Android/iOS Simulator.
is_app_running() {
  local app_id="$1"

  if command -v adb >/dev/null 2>&1; then
    if adb devices 2>/dev/null | awk '/\tdevice$/{found=1} END{exit !found}'; then
      if adb shell pidof -s "$app_id" 2>/dev/null | grep -Eq '[0-9]+'; then
        return 0
      fi
    fi
  fi

  if command -v xcrun >/dev/null 2>&1; then
    if xcrun simctl list devices 2>/dev/null | grep -q '(Booted)'; then
      if xcrun simctl spawn booted launchctl list 2>/dev/null | grep -Fq "$app_id"; then
        return 0
      fi
    fi
  fi

  return 1
}

# RELAUNCH=true → launchApp + clearState; false → не трогаем уже запущенное.
prompt_relaunch_if_needed() {
  RELAUNCH="true"
  if ! is_app_running "$DEFAULT_APP_ID"; then
    return 0
  fi

  echo ""
  echo "  Приложение уже запущено: $DEFAULT_APP_ID"
  echo -n "  Перезапустить с очисткой стейта? [Y/n]: "
  local ans
  read -r ans
  case "$ans" in
    n|N|no|NO)
      RELAUNCH="false"
      echo "  Ок, launchApp пропускаем — работаем с текущим экраном."
      ;;
    *)
      RELAUNCH="true"
      ;;
  esac
}

run_maestro() {
  local target="$1"
  prompt_relaunch_if_needed
  echo ""
  echo "→ maestro test -e APP_ID=$DEFAULT_APP_ID -e RELAUNCH=$RELAUNCH $target"
  echo ""
  # -e обязателен: shell export Maestro в ${APP_ID} не подставляет.
  maestro test -e "APP_ID=$DEFAULT_APP_ID" -e "RELAUNCH=$RELAUNCH" "$target"
}

select_app_id() {
  echo ""
  echo "Выбери APP_ID:"
  echo "  1) com.litnet.devharness.flutter_dev_harness  (Flutter harness)"
  echo "  2) com.litnet.dev                              (Android host, flavor dev)"
  echo "  3) com.litnet                                  (Android host, prod)"
  echo "  4) com.litnet.ios                              (iOS testenv)"
  echo "  5) com.litnetgroup.ios                         (iOS prod)"
  echo "  6) свой вариант"
  echo -n "  Номер (1-6) или Enter чтобы оставить [$DEFAULT_APP_ID]: "
  local choice
  read -r choice
  case "$choice" in
    1) DEFAULT_APP_ID="com.litnet.devharness.flutter_dev_harness" ;;
    2) DEFAULT_APP_ID="com.litnet.dev" ;;
    3) DEFAULT_APP_ID="com.litnet" ;;
    4) DEFAULT_APP_ID="com.litnet.ios" ;;
    5) DEFAULT_APP_ID="com.litnetgroup.ios" ;;
    6)
      echo -n "  Введи APP_ID: "
      read -r custom
      if [[ -n "$custom" ]]; then
        DEFAULT_APP_ID="$custom"
      fi
      ;;
    "")
      ;;
    *)
      echo "Неизвестный выбор, оставляю $DEFAULT_APP_ID"
      ;;
  esac
}

main() {
  while true; do
    print_header
    echo "  app) Сменить APP_ID"
    echo "  v) Maestro Viewer (:9999) — start/stop трансляции"
    print_sep
    echo "  a) Все smoke (.maestro/smoke)"
    echo "  f) Все flows (.maestro/flows)"
    echo "  t) По тегу (--include-tags)"
    print_sep
    echo "  1) Навигация"
    echo ""
    echo "  q) Выход"
    echo -n "  Выбери: "
    local selected
    read -r selected

    case "$selected" in
      q|Q)
        echo "Выход."
        exit 0
        ;;
      app|APP|0)
        select_app_id
        continue
        ;;
      v|V)
        viewer_menu
        continue
        ;;
      a|A)
        if [[ -d "$MAESTRO_DIR/smoke" ]]; then
          run_maestro "$MAESTRO_DIR/smoke"
        else
          echo "Папка $MAESTRO_DIR/smoke не найдена."
        fi
        ;;
      f|F)
        if [[ -d "$MAESTRO_DIR/flows" ]] && find "$MAESTRO_DIR/flows" -type f \( -name '*.yaml' -o -name '*.yml' \) | grep -q .; then
          run_maestro "$MAESTRO_DIR/flows"
        else
          echo "В $MAESTRO_DIR/flows пока нет yaml-сценариев."
        fi
        ;;
      t|T)
        echo -n "  Тег (например smoke): "
        local tag
        read -r tag
        if [[ -z "$tag" ]]; then
          echo "Тег пустой, пропускаю."
          continue
        fi
        prompt_relaunch_if_needed
        echo ""
        echo "→ maestro test -e APP_ID=$DEFAULT_APP_ID -e RELAUNCH=$RELAUNCH $MAESTRO_DIR --include-tags $tag"
        echo ""
        maestro test -e "APP_ID=$DEFAULT_APP_ID" -e "RELAUNCH=$RELAUNCH" "$MAESTRO_DIR" --include-tags "$tag"
        ;;
      1)
        navigation_menu
        continue
        ;;
      *)
        echo "Неверный выбор: $selected"
        continue
        ;;
    esac

    echo ""
    echo -n "  Enter — снова в меню, q — выход: "
    local again
    read -r again
    if [[ "$again" == "q" || "$again" == "Q" ]]; then
      echo "Выход."
      exit 0
    fi
  done
}

main
