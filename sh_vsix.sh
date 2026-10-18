#!/usr/bin/env bash
# Сборка / установка .vsix для SGroup. Запуск: ./sh_vsix.sh
# Учитывает уже собранные артефакты в version/syngroup-*.vsix
if [ -z "${BASH_VERSION:-}" ]; then
    exec /usr/bin/env bash "$0" "$@"
fi
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
VERSION_DIR="version"
FORCE=0
LAST_VSIX=""

read_with_exit() {
    local prompt_message="$1"
    local is_main_menu="${2:-false}"
    local input
    if ! read -r -e -p "$prompt_message" input; then
        return 1
    fi
    if [[ "$input" == "q" || "$input" == "Q" ]]; then
        if [[ "$is_main_menu" == "true" ]]; then
            echo q
            exit 0
        fi
        echo "Отмена."
        return 1
    fi
    echo "$input"
}

# Enter = default (обычно Y). Prefill через read -i / zsh vared.
ask_yes() {
    local prompt="$1"
    local default="${2:-Y}"
    local ans=""
    local _prefill_out
    if [[ ! -t 0 ]]; then
        [[ "$default" == "Y" || "$default" == "y" ]]
        return
    fi
    if [[ ${BASH_VERSINFO[0]} -ge 4 ]]; then
        if ! read -r -e -i "$default" -p "${prompt} " ans; then
            return 1
        fi
    elif command -v zsh >/dev/null 2>&1; then
        _prefill_out=$(mktemp "${TMPDIR:-/tmp}/askyes.XXXXXX") || return 1
        if ! PREFILL="$default" PROMPT_MSG="${prompt} " OUTFILE="$_prefill_out" \
            zsh -fc 'prefill=$PREFILL; vared -p "$PROMPT_MSG" -c prefill || exit 1; print -r -- "$prefill" > "$OUTFILE"' \
            </dev/tty >/dev/tty 2>/dev/tty; then
            rm -f "$_prefill_out"
            return 1
        fi
        IFS= read -r ans < "$_prefill_out" || ans="$default"
        rm -f "$_prefill_out"
    else
        if ! read -r -e -p "${prompt} [Y/n] Enter=${default}: " ans; then
            return 1
        fi
    fi
    [[ -z "$ans" ]] && ans="$default"
    case "$(printf '%s' "$ans" | tr '[:upper:]' '[:lower:]')" in
        y|yes) return 0 ;;
        n|no) return 1 ;;
        *) return 1 ;;
    esac
}

pkg_version() {
    node -p "require('./package.json').version"
}

list_vsix_versions() {
    local f base
    shopt -s nullglob
    for f in "$VERSION_DIR"/syngroup-*.vsix; do
        base="$(basename "$f" .vsix)"
        base="${base#syngroup-}"
        if [[ "$base" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-].*)?$ ]]; then
            printf '%s\n' "$base"
        fi
    done
    shopt -u nullglob
}

max_vsix_version() {
    list_vsix_versions | sort -V | tail -n 1
}

version_max() {
    printf '%s\n%s\n' "$1" "$2" | sort -V | tail -n 1
}

version_eq() {
    [[ "$1" == "$2" ]]
}

vsix_path() {
    echo "${VERSION_DIR}/syngroup-$1.vsix"
}

vsix_exists() {
    [[ -f "$(vsix_path "$1")" ]]
}

baseline_version() {
    local pkg max_disk
    pkg="$(pkg_version)"
    max_disk="$(max_vsix_version)"
    if [[ -z "$max_disk" ]]; then
        echo "$pkg"
        return
    fi
    version_max "$pkg" "$max_disk"
}

set_pkg_version() {
    local ver="$1"
    npm version "$ver" --no-git-tag-version --allow-same-version >/dev/null
}

next_version() {
    local base="$1" level="$2"
    node -e "
const [maj, min, pat] = process.argv[1].split('.').map(n => parseInt(n, 10));
const level = process.argv[2];
let out;
if (level === 'patch') out = [maj, min, pat + 1];
else if (level === 'minor') out = [maj, min + 1, 0];
else if (level === 'major') out = [maj + 1, 0, 0];
else { console.error('bad level'); process.exit(1); }
console.log(out.join('.'));
" "$base" "$level"
}

resolve_free_version() {
    local level="$1"
    local base candidate
    base="$(baseline_version)"
    candidate="$(next_version "$base" "$level")"
    while vsix_exists "$candidate"; do
        echo "  · v${candidate} уже в ${VERSION_DIR}/ — следующий ${level}" >&2
        candidate="$(next_version "$candidate" "$level")"
    done
    echo "$candidate"
}

peek_next() {
    local level="$1" base c
    base="$(baseline_version)"
    c="$(next_version "$base" "$level")"
    while vsix_exists "$c"; do
        c="$(next_version "$c" "$level")"
    done
    echo "$c"
}

confirm_overwrite() {
    local ver="$1"
    if [[ "$FORCE" == "1" ]]; then
        return 0
    fi
    if [[ ! -t 0 ]]; then
        echo "Ошибка: $(vsix_path "$ver") уже есть. Используй bump или --force." >&2
        return 1
    fi
    ask_yes "v${ver} уже в ${VERSION_DIR}/. Перезаписать?" "N"
}

ensure_deps() {
    if [[ ! -d node_modules/@vscode/vsce ]]; then
        echo "→ npm install (нет @vscode/vsce)"
        npm install
    fi
}

# IDE CLI (не agent из ~/.local/bin/cursor)
find_editor_cli() {
    local c
    for c in \
        "/Applications/Cursor.app/Contents/Resources/app/bin/cursor" \
        "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" \
        "$(command -v cursor-ide 2>/dev/null || true)" \
        "$(command -v code 2>/dev/null || true)"; do
        if [[ -n "$c" && -x "$c" ]]; then
            # отсечь agent-обёртку без --install-extension
            if "$c" --help 2>/dev/null | grep -q -- '--install-extension'; then
                echo "$c"
                return 0
            fi
        fi
    done
    return 1
}

latest_vsix_file() {
    local ver
    if [[ -n "$LAST_VSIX" && -f "$LAST_VSIX" ]]; then
        echo "$LAST_VSIX"
        return
    fi
    ver="$(max_vsix_version)"
    if [[ -z "$ver" ]]; then
        return 1
    fi
    vsix_path "$ver"
}

install_vsix() {
    local file cli
    file="${1:-}"
    if [[ -z "$file" ]]; then
        file="$(latest_vsix_file)" || {
            echo "Нет .vsix в ${VERSION_DIR}/ — сначала собери." >&2
            return 1
        }
    fi
    if [[ ! -f "$file" ]]; then
        echo "Файл не найден: $file" >&2
        return 1
    fi
    cli="$(find_editor_cli)" || {
        echo "Не найден Cursor/VS Code CLI с --install-extension." >&2
        echo "Установи вручную: $ROOT/$file" >&2
        return 1
    }
    echo "→ install vsix: $file"
    echo "→ CLI: $cli"
    "$cli" --install-extension "$ROOT/$file" --force
    echo "Установлено: $file"
}

# CLI/AppleScript не умеют надёжно reload. Расширение SGroup смотрит этот файл
# и вызывает workbench.action.reloadWindow (кнопка 📦 Vsix → command sgroup.vsix).
RELOAD_MARKER="${VERSION_DIR}/.reload-window"

reload_window() {
    echo "→ Reload Window Now"
    mkdir -p "$VERSION_DIR"
    rm -f "$RELOAD_MARKER"
    printf '%s\n' "$(date +%s)" > "$RELOAD_MARKER"
    echo "Маркер: $ROOT/$RELOAD_MARKER"
    echo "SGroup должен перезагрузить окно сам. Если нет — один раз Cmd+R (после этого заработает)."
}

after_build_flow() {
    local file
    file="$(latest_vsix_file)" || return 0
    echo
    install_vsix "$file" || true
    echo
    if ask_yes "Reload Window Now?" "Y"; then
        reload_window || true
    fi
}

package_vsix() {
    ensure_deps
    local ver out
    ver="$(pkg_version)"
    out="$(vsix_path "$ver")"
    if vsix_exists "$ver"; then
        echo "⚠  Уже есть $out"
        confirm_overwrite "$ver" || exit 1
        rm -f "$out"
    fi
    echo "→ npm run package  (v${ver})"
    npm run package
    if [[ ! -f "$out" ]]; then
        echo "Ошибка: ожидался файл $out" >&2
        ls -la "$VERSION_DIR"/ 2>/dev/null || true
        exit 1
    fi
    LAST_VSIX="$out"
    echo
    echo "Готово: $ROOT/$out"
    ls -lh "$out"
}

bump_and_package() {
    local level="$1"
    local base target
    ensure_deps
    base="$(baseline_version)"
    target="$(resolve_free_version "$level")"
    echo "→ baseline v${base} → ${level} → v${target}"
    if ! version_eq "$(pkg_version)" "$target"; then
        echo "→ package.json → v${target}"
        set_pkg_version "$target"
    fi
    package_vsix
}

usage() {
    cat <<'EOF'
Использование:
  ./sh_vsix.sh                 меню: package / patch / minor / major / install
  ./sh_vsix.sh package         собрать текущую версию package.json
  ./sh_vsix.sh patch|minor|major
  ./sh_vsix.sh install         установить последний (или только что собранный) vsix
  ./sh_vsix.sh --force package перезаписать существующий .vsix
  ./sh_vsix.sh -h|--help

После сборки: всегда install vsix, затем вопрос Reload Window Now?
Версии: baseline = max(package.json, max version/*.vsix); bump пропускает занятые.
EOF
}

main_menu() {
    local choice next_p next_n next_m pkg
    pkg="$(pkg_version)"
    next_p="$(peek_next patch)"
    next_n="$(peek_next minor)"
    next_m="$(peek_next major)"
    echo "SGroup vsix"
    if vsix_exists "$pkg"; then
        echo "  1) package — v${pkg} (уже есть в version/)"
    else
        echo "  1) package — v${pkg}"
    fi
    echo "  2) patch   → v${next_p}"
    echo "  3) minor   → v${next_n}"
    echo "  4) major   → v${next_m}"
    echo "  5) install — install vsix"
    echo "  q) выход"
    choice="$(read_with_exit "Выбор: " true)" || exit 0
    case "$choice" in
        1|package)
            package_vsix
            after_build_flow
            ;;
        2|patch)
            bump_and_package patch
            after_build_flow
            ;;
        3|minor)
            bump_and_package minor
            after_build_flow
            ;;
        4|major)
            bump_and_package major
            after_build_flow
            ;;
        5|install)
            install_vsix
            echo
            if ask_yes "Reload Window Now?" "Y"; then
                reload_window || true
            fi
            ;;
        q|Q) exit 0 ;;
        *)
            echo "Неизвестный выбор: $choice" >&2
            exit 1
            ;;
    esac
}

ARGS=()
for arg in "$@"; do
    case "$arg" in
        --force|-f) FORCE=1 ;;
        *) ARGS+=("$arg") ;;
    esac
done
set -- "${ARGS[@]+"${ARGS[@]}"}"

case "${1:-}" in
    "" ) main_menu ;;
    -h|--help|help) usage ;;
    package|pack|build)
        package_vsix
        after_build_flow
        ;;
    patch|minor|major)
        bump_and_package "$1"
        after_build_flow
        ;;
    install|i)
        install_vsix "${2:-}"
        echo
        if ask_yes "Reload Window Now?" "Y"; then
            reload_window || true
        fi
        ;;
    *)
        usage >&2
        exit 1
        ;;
esac
