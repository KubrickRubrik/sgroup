#!/usr/bin/env bash
# Сборка / установка .vsix одного расширения из extensions/.
# Запуск: ./sh_vsix.sh [расширение] [package|patch|minor|major|install]
# Расширение — папка (syn3, beta_fixes) или name из package.json (beta-fixes).
# Артефакты: version/<name>-<version>.vsix. Для syn3 старые version/syngroup-*.vsix тоже входят в baseline.
if [ -z "${BASH_VERSION:-}" ]; then
    exec /usr/bin/env bash "$0" "$@"
fi
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
VERSION_DIR="version"
FORCE=0
LAST_VSIX=""
EXT=""
EXT_DIR_NAME=""
PKG_NAME=""

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
    node -p "require(process.argv[1]).version" "$EXT/package.json"
}

list_vsix_versions() {
    local f base
    local -a files=()
    shopt -s nullglob
    files=("$VERSION_DIR/${PKG_NAME}-"*.vsix)
    if [[ "$PKG_NAME" == "syn3" ]]; then
        files+=("$VERSION_DIR"/syngroup-*.vsix)
    fi
    shopt -u nullglob
    for f in "${files[@]+"${files[@]}"}"; do
        [[ -e "$f" ]] || continue
        base="$(basename "$f" .vsix)"
        base="${base#"${PKG_NAME}-"}"
        if [[ "$PKG_NAME" == "syn3" ]]; then
            base="${base#syngroup-}"
        fi
        if [[ "$base" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-].*)?$ ]]; then
            printf '%s\n' "$base"
        fi
    done
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
    echo "${VERSION_DIR}/${PKG_NAME}-$1.vsix"
}

vsix_exists() {
    if [[ -f "$(vsix_path "$1")" ]]; then
        return 0
    fi
    [[ "$PKG_NAME" == "syn3" && -f "${VERSION_DIR}/syngroup-$1.vsix" ]]
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
    npm version "$ver" --no-git-tag-version --allow-same-version -w "$PKG_NAME" >/dev/null
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
        echo "Ошибка: v${ver} уже есть в ${VERSION_DIR}/. Используй bump или --force." >&2
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
    if [[ -f "$(vsix_path "$ver")" ]]; then
        vsix_path "$ver"
        return
    fi
    if [[ "$PKG_NAME" == "syn3" && -f "${VERSION_DIR}/syngroup-$ver.vsix" ]]; then
        echo "${VERSION_DIR}/syngroup-$ver.vsix"
        return
    fi
    return 1
}

# Оба экземпляра Cursor: обычный и Cursor-2 (--user-data-dir + свой extensions-dir).
# Ставим в каждый. Профиль берётся из storage этого экземпляра.
# Строки: open|other|fallback \t userDataDir \t extensionsDir \t profileName
resolve_install_targets() {
    node - "$ROOT" <<'NODE'
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const root = process.argv[2];
const uri = pathToFileURL(root).href;
const decoded = decodeURI(uri);
const home = process.env.HOME;
const appSupport = path.join(home, 'Library/Application Support');
const defaultUserData = path.join(appSupport, 'Cursor');
const defaultExtensions = path.join(home, '.cursor/extensions');

function flag(cmd, name) {
    const re = new RegExp('--' + name + '(?:=|\\s+)([\\s\\S]*?)(?=\\s+--|$)');
    const match = cmd.match(re);
    return match ? match[1].trim() : '';
}

function sameUri(value) {
    if (!value) return false;
    return value === uri || decodeURI(value) === decoded;
}

function profileName(data) {
    if (!data) return '';
    const workspaces = (data.profileAssociations && data.profileAssociations.workspaces) || {};
    const id = workspaces[uri] || workspaces[decoded] || '';
    if (!id || id === '__default__profile__') return '';
    const prof = (data.userDataProfiles || []).find((p) => p.location === id);
    return prof && prof.name ? prof.name : '';
}

function readStorage(userData) {
    const storage = path.join(userData, 'User/globalStorage/storage.json');
    if (!fs.existsSync(storage)) return null;
    try {
        return JSON.parse(fs.readFileSync(storage, 'utf8'));
    } catch {
        return null;
    }
}

function windowHasRoot(data) {
    const state = (data && data.windowsState) || {};
    const windows = [state.lastActiveWindow, ...(state.openedWindows || [])].filter(Boolean);
    return windows.some((win) => sameUri(win.folder) || sameUri(win.workspace));
}

function extensionsForUserData(userData) {
    const name = path.basename(userData);
    if (name === 'Cursor') return defaultExtensions;
    const match = name.match(/^Cursor(-\d+)$/);
    if (!match) return '';
    return path.join(home, '.cursor' + match[1], 'extensions');
}

const hits = [];
const seenUserData = new Set();
function addTarget(userData, extensions) {
    if (!userData || !extensions || seenUserData.has(userData)) return;
    if (!fs.existsSync(userData)) return;
    seenUserData.add(userData);
    const data = readStorage(userData);
    const kind = windowHasRoot(data) ? 'open' : 'other';
    hits.push([kind, userData, extensions, profileName(data)].join('\t'));
}

let ps = '';
try {
    ps = execFileSync('ps', ['-axww', '-o', 'command='], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
} catch {
    ps = '';
}

for (const line of ps.split('\n')) {
    const cmd = line.trim();
    if (!/\/Contents\/MacOS\/Cursor(?:\s|$)/.test(cmd)) continue;
    if (cmd.includes('Cursor Helper')) continue;
    if (/--(install-extension|uninstall-extension|list-extensions)(?:\s|=|$)/.test(cmd)) continue;
    const userData = flag(cmd, 'user-data-dir') || defaultUserData;
    const extensions = flag(cmd, 'extensions-dir') || extensionsForUserData(userData) || defaultExtensions;
    addTarget(userData, extensions);
}

if (fs.existsSync(appSupport)) {
    for (const name of fs.readdirSync(appSupport)) {
        if (!/^Cursor(-\d+)?$/.test(name)) continue;
        const userData = path.join(appSupport, name);
        addTarget(userData, extensionsForUserData(userData));
    }
}

if (!hits.length) {
    const fallback = readStorage(defaultUserData);
    process.stdout.write(['fallback', defaultUserData, defaultExtensions, profileName(fallback)].join('\t') + '\n');
    process.exit(0);
}

hits.sort((a, b) => Number(b.startsWith('open\t')) - Number(a.startsWith('open\t')));
process.stdout.write(hits.join('\n') + '\n');
NODE
}

# Ждёт, пока extensions.json ЭТОГО окна указывает на новую распаковку.
# started_ms — Date.now() до вызова CLI: старая папка с тем же номером версии не считается.
wait_profile_install() {
    local ver="$1" started_ms="$2" user_data="$3" ext_dir="$4"
    node - "$ROOT" "$ver" "$started_ms" "$user_data" "$ext_dir" "$EXT/package.json" <<'NODE'
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const root = process.argv[2];
const ver = process.argv[3];
const started = Number(process.argv[4]);
const userData = process.argv[5];
const extDir = process.argv[6];
const storage = path.join(userData, 'User/globalStorage/storage.json');
const pkg = JSON.parse(fs.readFileSync(process.argv[7], 'utf8'));
const extId = `${pkg.publisher}.${pkg.name}`;
let file = path.join(extDir, 'extensions.json');
if (fs.existsSync(storage)) {
    const data = JSON.parse(fs.readFileSync(storage, 'utf8'));
    const uri = pathToFileURL(root).href;
    const workspaces = (data.profileAssociations && data.profileAssociations.workspaces) || {};
    const id = workspaces[uri] || workspaces[decodeURI(uri)];
    if (id && id !== '__default__profile__') {
        file = path.join(userData, 'User/profiles', id, 'extensions.json');
    }
}
if (!fs.existsSync(file)) process.exit(1);
const list = JSON.parse(fs.readFileSync(file, 'utf8'));
const hit = list.find((e) => e.identifier && e.identifier.id === extId && e.version === ver);
if (!hit) process.exit(1);
const loc = hit.location || {};
const dir = loc.fsPath || loc.path;
if (!dir) process.exit(1);
const installedPkg = path.join(dir, 'package.json');
const st = fs.statSync(installedPkg);
if (st.mtimeMs + 1500 < started) process.exit(1);
const inner = JSON.parse(fs.readFileSync(installedPkg, 'utf8'));
process.exit(inner.version === ver ? 0 : 1);
NODE
}

install_vsix_into() {
    local file="$1" cli="$2" kind="$3" user_data="$4" ext_dir="$5" profile="$6"
    local started i ver
    if [[ "$kind" == "fallback" ]]; then
        echo "Окно с этим проектом не найдено. Ставлю в стандартный каталог Cursor." >&2
        echo "Если проект открыт во втором экземпляре, новая версия туда не попадёт." >&2
    fi
    echo "→ install vsix: $file"
    echo "→ CLI: $cli"
    echo "→ user-data-dir: $user_data"
    echo "→ extensions-dir: $ext_dir"
    if [[ -n "$profile" ]]; then
        echo "→ profile: $profile"
    fi
    started="$(node -p 'Date.now()')"
    local -a args
    args=("$cli" --user-data-dir "$user_data" --extensions-dir "$ext_dir")
    if [[ -n "$profile" ]]; then
        args+=(--profile "$profile")
    fi
    args+=(--install-extension "$ROOT/$file" --force)
    "${args[@]}"
    ver="$(basename "$file" .vsix)"
    ver="${ver#"${PKG_NAME}-"}"
    if [[ "$PKG_NAME" == "syn3" ]]; then
        ver="${ver#syngroup-}"
    fi
    if [[ ! "$ver" =~ ^[0-9]+\.[0-9]+\.[0-9]+ ]]; then
        ver="$(pkg_version)"
    fi
    for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25; do
        if wait_profile_install "$ver" "$started" "$user_data" "$ext_dir"; then
            echo "Установлено: v${ver}"
            echo "  $ext_dir"
            if [[ "$kind" != "open" ]]; then
                echo "  Это другой экземпляр. Он подхватит версию после своего Reload Window."
            fi
            return 0
        fi
        sleep 1
    done
    echo "CLI ответил успехом, но окно всё ещё не на v${ver}." >&2
    echo "Каталог: $ext_dir" >&2
    return 1
}

install_vsix() {
    local file cli targets kind user_data ext_dir profile
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
    targets="$(resolve_install_targets)" || true
    if [[ -z "$targets" ]]; then
        echo "Не удалось определить каталог Cursor." >&2
        return 1
    fi
    while IFS=$'\t' read -r kind user_data ext_dir profile; do
        [[ -z "$kind" ]] && continue
        install_vsix_into "$file" "$cli" "$kind" "$user_data" "$ext_dir" "$profile" || return 1
    done <<< "$targets"
}

# CLI/AppleScript не умеют надёжно reload. Расширение Syn3 смотрит этот файл
# и вызывает workbench.action.reloadWindow (кнопка 📦 Vsix → command syn3.vsix).
RELOAD_MARKER="${VERSION_DIR}/.reload-window"

reload_window() {
    echo "→ Reload Window Now"
    mkdir -p "$VERSION_DIR"
    rm -f "$RELOAD_MARKER"
    printf '%s\n' "$(date +%s)" > "$RELOAD_MARKER"
    echo "Маркер: $ROOT/$RELOAD_MARKER"
    echo "Syn3 должен перезагрузить окно сам. Если нет — один раз Cmd+R (после этого заработает)."
}

after_build_flow() {
    local file
    file="$(latest_vsix_file)" || return 0
    echo
    # Без полной перезагрузки окна хост держит предыдущую версию,
    # даже если CLI уже написал «successfully installed».
    if install_vsix "$file"; then
        echo
        reload_window || true
    fi
}

package_vsix() {
    ensure_deps
    local ver out
    ver="$(pkg_version)"
    out="$(vsix_path "$ver")"
    if vsix_exists "$ver"; then
        echo "⚠  Уже есть v${ver} в ${VERSION_DIR}/"
        confirm_overwrite "$ver" || exit 1
        rm -f "$out"
        if [[ "$PKG_NAME" == "syn3" ]]; then
            rm -f "${VERSION_DIR}/syngroup-${ver}.vsix"
        fi
    fi
    echo "→ npm run package -w ${PKG_NAME}  (v${ver})"
    npm run package -w "$PKG_NAME"
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
  ./sh_vsix.sh                              выбрать расширение и действие
  ./sh_vsix.sh <расширение>                 меню для одного расширения
  ./sh_vsix.sh <расширение> package         собрать текущую версию
  ./sh_vsix.sh <расширение> patch|minor|major
  ./sh_vsix.sh <расширение> install         установить последний vsix этого расширения
  ./sh_vsix.sh --force <расширение> package перезаписать существующий .vsix
  ./sh_vsix.sh -h|--help

Расширение — папка в extensions/ (syn3, beta_fixes) или name из package.json (beta-fixes).
Порядок аргументов любой: ./sh_vsix.sh package syn3 тоже подходит.
После сборки: install во все экземпляры Cursor (обычный и Cursor-2), затем Reload Window.
Версии: baseline = max(package.json, max version/<name>-*.vsix); bump пропускает занятые.
EOF
}

main_menu() {
    local choice next_p next_n next_m pkg
    pkg="$(pkg_version)"
    next_p="$(peek_next patch)"
    next_n="$(peek_next minor)"
    next_m="$(peek_next major)"
    if [[ "$EXT_DIR_NAME" == "$PKG_NAME" ]]; then
        echo "${EXT_DIR_NAME} vsix"
    else
        echo "${EXT_DIR_NAME} vsix  (${PKG_NAME})"
    fi
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
            if install_vsix; then
                echo
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

extension_dirs() {
    local d
    shopt -s nullglob
    for d in "$ROOT"/extensions/*; do
        if [[ -d "$d" && -f "$d/package.json" ]]; then
            basename "$d"
        fi
    done
    shopt -u nullglob
}

extension_pkg_name() {
    node -p "require(process.argv[1]).name" "$ROOT/extensions/$1/package.json"
}

# Список папок в EXT_DIRS. Без process substitution: `sh ./sh_vsix.sh` на macOS
# это bash --posix, он не разбирает `< <(...)`.
load_extension_dirs() {
    local tmp d
    tmp="$(mktemp "${TMPDIR:-/tmp}/vsix-ext.XXXXXX")" || return 1
    extension_dirs > "$tmp" || { rm -f "$tmp"; return 1; }
    EXT_DIRS=()
    while IFS= read -r d; do
        [[ -n "$d" ]] && EXT_DIRS+=("$d")
    done < "$tmp"
    rm -f "$tmp"
}

extension_known() {
    local key="$1" d name
    [[ -n "$key" ]] || return 1
    load_extension_dirs
    for d in "${EXT_DIRS[@]+"${EXT_DIRS[@]}"}"; do
        [[ -n "$d" ]] || continue
        if [[ "$d" == "$key" ]]; then
            return 0
        fi
        name="$(extension_pkg_name "$d")"
        if [[ "$name" == "$key" ]]; then
            return 0
        fi
    done
    return 1
}

load_extension() {
    EXT="$ROOT/extensions/$EXT_DIR_NAME"
    PKG_NAME="$(extension_pkg_name "$EXT_DIR_NAME")"
}

choose_extension() {
    local d choice i
    local -a dirs=()
    load_extension_dirs
    for d in "${EXT_DIRS[@]+"${EXT_DIRS[@]}"}"; do
        [[ -n "$d" ]] && dirs+=("$d")
    done
    if [[ ${#dirs[@]} -eq 0 ]]; then
        echo "Нет расширений в extensions/." >&2
        exit 1
    fi
    if [[ -n "${EXT_KEY:-}" ]]; then
        for d in "${dirs[@]}"; do
            if [[ "$d" == "$EXT_KEY" || "$(extension_pkg_name "$d")" == "$EXT_KEY" ]]; then
                EXT_DIR_NAME="$d"
                load_extension
                return
            fi
        done
        echo "Неизвестное расширение: $EXT_KEY" >&2
        printf '  %s\n' "${dirs[@]}" >&2
        exit 1
    fi
    if [[ ${#dirs[@]} -eq 1 ]]; then
        EXT_DIR_NAME="${dirs[0]}"
        load_extension
        return
    fi
    if [[ ! -t 0 ]]; then
        echo "Укажи расширение: ${dirs[*]}" >&2
        exit 1
    fi
    echo "Расширение:"
    i=1
    for d in "${dirs[@]}"; do
        echo "  ${i}) ${d}"
        i=$((i + 1))
    done
    echo "  q) выход"
    choice="$(read_with_exit "Выбор: " true)" || exit 0
    case "$choice" in
        q|Q) exit 0 ;;
    esac
    if [[ "$choice" =~ ^[0-9]+$ ]] && (( choice >= 1 && choice <= ${#dirs[@]} )); then
        EXT_DIR_NAME="${dirs[$((choice - 1))]}"
        load_extension
        return
    fi
    for d in "${dirs[@]}"; do
        if [[ "$d" == "$choice" || "$(extension_pkg_name "$d")" == "$choice" ]]; then
            EXT_DIR_NAME="$d"
            load_extension
            return
        fi
    done
    echo "Неизвестный выбор: $choice" >&2
    exit 1
}

CMD=""
EXT_KEY=""
INSTALL_FILE=""
for arg in "$@"; do
    case "$arg" in
        --force|-f) FORCE=1 ;;
        -h|--help|help) CMD=help ;;
        package|pack|build) CMD=package ;;
        patch|minor|major) CMD="$arg" ;;
        install|i) CMD=install ;;
        *)
            if [[ -z "$EXT_KEY" ]] && extension_known "$arg"; then
                EXT_KEY="$arg"
            elif [[ "$CMD" == "install" && -z "$INSTALL_FILE" ]]; then
                INSTALL_FILE="$arg"
            else
                echo "Неизвестный аргумент: $arg" >&2
                usage >&2
                exit 1
            fi
            ;;
    esac
done

if [[ "$CMD" == "help" ]]; then
    usage
    exit 0
fi
choose_extension

case "$CMD" in
    "" ) main_menu ;;
    package)
        package_vsix
        after_build_flow
        ;;
    patch|minor|major)
        bump_and_package "$CMD"
        after_build_flow
        ;;
    install)
        if install_vsix "${INSTALL_FILE:-}"; then
            echo
            reload_window || true
        fi
        ;;
    *)
        usage >&2
        exit 1
        ;;
esac
