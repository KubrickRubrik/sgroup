#!/usr/bin/env bash
# Требуется bash. Запуск: ./scripts/git_command_tool.sh  или  bash scripts/git_command_tool.sh
if [ -z "${BASH_VERSION:-}" ]; then
    exec /usr/bin/env bash "$0" "$@"
fi
set -e  # Завершить выполнение скрипта, если команда завершится с ошибкой

# Есть ли upstream у текущей ветки
branch_has_upstream() {
    git rev-parse --abbrev-ref '@{upstream}' &>/dev/null
}

# Последний коммит уже на remote (только если настроен upstream)
is_last_commit_pushed() {
    if ! branch_has_upstream; then
        return 1
    fi
    git diff --quiet HEAD '@{upstream}'
}

# Функция для чтения ввода пользователя с возможностью выхода
# $3 — необязательное значение по умолчанию (readline: можно править/стирать)
# read -i есть только в bash 4+; на macOS (bash 3.2) — prefill через zsh vared
read_with_exit() {
    local prompt_message="$1"
    local is_main_menu="$2"  # Параметр, указывающий, вызывается ли функция из главного меню
    local default_value="${3-}"
    local _prefill_out
    if [[ -n "$default_value" ]]; then
        if [[ ${BASH_VERSINFO[0]} -ge 4 ]]; then
            if ! read -r -e -i "$default_value" -p "$prompt_message" input; then
                return 1
            fi
        elif command -v zsh >/dev/null 2>&1; then
            # bash 3.2 + zsh: вставляем дефолт в редактируемую строку (как read -i)
            _prefill_out=$(mktemp "${TMPDIR:-/tmp}/prefill.XXXXXX") || return 1
            if ! PREFILL="$default_value" PROMPT_MSG="$prompt_message" OUTFILE="$_prefill_out" \
                zsh -fc 'prefill=$PREFILL; vared -p "$PROMPT_MSG" -c prefill || exit 1; print -r -- "$prefill" > "$OUTFILE"' \
                </dev/tty >/dev/tty 2>/dev/tty; then
                rm -f "$_prefill_out"
                return 1
            fi
            IFS= read -r input < "$_prefill_out" || input=""
            rm -f "$_prefill_out"
        else
            # fallback: Enter = дефолт
            if ! read -r -e -p "${prompt_message}[${default_value}] " input; then
                return 1
            fi
            if [[ -z "$input" ]]; then
                input=$default_value
            # Дефолт-префикс («SAM-123 | » / «Draft: »): если ввели только текст — дописываем префикс
            elif [[ "$default_value" == *'| ' || "$default_value" == 'Draft: ' ]] \
                && [[ "$input" != "$default_value"* ]]; then
                input="${default_value}${input}"
            fi
        fi
    else
        if ! read -r -e -p "$prompt_message" input; then
            return 1
        fi
    fi
    if [[ "$input" == "q" || "$input" == "Q" ]]; then
        if [[ "$is_main_menu" == "true" ]]; then
            echo q
            exit 0
        else
            echo "Отмена действия. Возврат в предыдущее меню."
            return 1
        fi
    fi
    echo "$input"
}

# Известные префиксы задач (приоритет)
KNOWN_TASK_PREFIX_RE='(LA|LIT|SAM|SA)'
# Любой тикет вида PROJ-123 (2+ букв/цифр после заглавных)
ANY_TASK_ID_RE='[A-Z]{2,}[A-Z0-9]*-[0-9]{1,6}'

# Нормализация найденного ID к UPPER-CASE (la-12 → LA-12)
normalize_task_id() {
    printf '%s' "$1" | tr '[:lower:]' '[:upper:]'
}

# Функция для извлечения префикса задачи из имени ветки
extract_prefix() {
    local branch_name upper
    branch_name=$(git branch --show-current)
    upper=$(printf '%s' "$branch_name" | tr '[:lower:]' '[:upper:]')
    # Сначала известные LA/LIT/SA/SAM
    if [[ "$upper" =~ ${KNOWN_TASK_PREFIX_RE}-([0-9]{1,6}) ]]; then
        echo "${BASH_REMATCH[1]}-${BASH_REMATCH[2]}"
        return 0
    fi
    # Иначе любой PROJ-123 в имени ветки
    if [[ "$upper" =~ (${ANY_TASK_ID_RE}) ]]; then
        echo "${BASH_REMATCH[1]}"
        return 0
    fi
    echo ""
}

# Префикс семейства (LA- / KW- / …) из имени ветки
extract_task_id_prefix_from_branch() {
    local branch_name=$1 upper
    upper=$(printf '%s' "$branch_name" | tr '[:lower:]' '[:upper:]')
    if [[ "$upper" =~ ${KNOWN_TASK_PREFIX_RE}- ]]; then
        echo "${BASH_REMATCH[1]}-"
        return 0
    fi
    if [[ "$upper" =~ ([A-Z]{2,}[A-Z0-9]*)-([0-9]{1,6}) ]]; then
        echo "${BASH_REMATCH[1]}-"
        return 0
    fi
    return 1
}

# Полный ID задачи из последних 10 коммитов/мерджей (subject + body)
# Сначала LA|LIT|SA|SAM-N, иначе любой другой PROJ-N
get_task_id_from_history() {
    local log task_id
    log=$(git log -10 --format='%s%n%b' 2>/dev/null) || return 1

    task_id=$(printf '%s' "$log" | grep -m1 -oE "${KNOWN_TASK_PREFIX_RE}-[0-9]+") || true
    if [[ -n "$task_id" ]]; then
        normalize_task_id "$task_id"
        return 0
    fi

    task_id=$(printf '%s' "$log" | grep -m1 -oE "${ANY_TASK_ID_RE}") || true
    if [[ -n "$task_id" ]]; then
        normalize_task_id "$task_id"
        return 0
    fi
    return 1
}

# Префикс семейства из истории (LA- / KW- / …) — для создания ветки
get_task_id_prefix_from_history() {
    local task_id
    if task_id=$(get_task_id_from_history); then
        echo "${task_id%%-*}-"
        return 0
    fi
    return 1
}

# Префикс коммита: сначала из имени ветки, иначе из ближайших коммитов
resolve_commit_prefix() {
    local prefix source
    prefix=$(extract_prefix)
    if [[ -n "$prefix" ]]; then
        echo "branch|$prefix"
        return 0
    fi
    if prefix=$(get_task_id_from_history); then
        echo "history|$prefix"
        return 0
    fi
    return 1
}

# Разбор resolve_commit_prefix: статус в stderr, префикс в stdout
apply_resolve_commit_prefix() {
    local resolved source prefix
    if ! resolved=$(resolve_commit_prefix); then
        echo ""
        return 1
    fi
    source="${resolved%%|*}"
    prefix="${resolved#*|}"
    case $source in
        branch)
            echo "Найден префикс коммита: $prefix" >&2
            ;;
        history)
            echo "В названии ветки нет тикета. Взят из последних коммитов: $prefix" >&2
            ;;
    esac
    echo "$prefix"
    return 0
}

# Префикс задачи для новой ветки — только из недавней истории коммитов
get_task_id_prefix_for_new_branch() {
    get_task_id_prefix_from_history
}

# Алиас ветки: lowercase, безопасные символы (без ведущего '_'; он добавится при сборке ветки)
sanitize_branch_alias() {
    local alias=$1
    alias=$(printf '%s' "$alias" | tr '[:upper:]' '[:lower:]')
    # ведущие/конечные недопустимые символы удаляем, не заменяем на '_'
    alias=$(printf '%s' "$alias" | sed 's/^[^a-z0-9]*//; s/[^a-z0-9]*$//')
    alias=$(printf '%s' "$alias" | sed 's/[^a-z0-9_]/_/g; s/__*/_/g; s/^_\|_$//g')
    printf '%s' "$alias"
}

# r|f|b → refactor|feature|bugfix
branch_type_from_code() {
    case $1 in
        r|R)
            echo refactor
            ;;
        f|F)
            echo feature
            ;;
        b|B)
            echo bugfix
            ;;
        *)
            return 1
            ;;
    esac
}

# LA|LIT|SAM|SA в строке создания ветки (опционально)
is_task_prefix_token() {
    local token
    token=$(printf '%s' "$1" | tr '[:lower:]' '[:upper:]' | sed 's/-$//')
    case $token in
        LA|LIT|SAM|SA)
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

task_prefix_from_token() {
    local token
    token=$(printf '%s' "$1" | tr '[:lower:]' '[:upper:]' | sed 's/-$//')
    case $token in
        LA|LIT|SAM|SA)
            echo "${token}-"
            ;;
    esac
}

# Создание ветки одной строкой:
# «r 168 profile_feature» → refactor/SAM-168_profile_feature (префикс из последних коммитов)
# «r SA 168 profile_feature» → refactor/SA-168_profile_feature
git_create_branch() {
    local history_prefix task_prefix line type_code branch_type task_number alias_raw alias
    local new_branch push_choice rest optional_prefix

    if ! history_prefix=$(get_task_id_prefix_for_new_branch); then
        echo "Не удалось определить префикс задачи (LA-/LIT-/SA-/SAM- или другой PROJ-N) из последних 10 коммитов."
        return 1
    fi

    echo "Шаблон: (r,f,b)@/[${history_prefix}]@_@"
    echo "Пример:  r 168 profile_feature  |  r SA 168 profile_feature"
    echo "('q' — отмена)"
    echo "---------------------------------------------"
    line=$(read_with_exit "> " "false") || return
    line=$(printf '%s' "$line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
    if [[ -z "$line" ]]; then
        echo "Пустой ввод."
        return 1
    fi

    type_code="${line%% *}"
    rest="${line#* }"
    if [[ -z "$rest" || "$rest" == "$line" ]]; then
        echo "Формат: <r|f|b> [префикс] <номер> <алиас>. Пример: r 168 profile_feature"
        return 1
    fi

    if ! branch_type=$(branch_type_from_code "$type_code"); then
        echo "Неверный тип. Допустимо: r (refactor), f (feature), b (bugfix)."
        return 1
    fi

    task_prefix=$history_prefix
    optional_prefix="${rest%% *}"
    if is_task_prefix_token "$optional_prefix"; then
        task_prefix=$(task_prefix_from_token "$optional_prefix")
        rest="${rest#"$optional_prefix"}"
        rest="${rest# }"
    fi

    if [[ -z "$rest" ]]; then
        echo "Укажите номер и алиас. Пример: r SA 168 profile_feature"
        return 1
    fi

    task_number="${rest%% *}"
    alias_raw="${rest#* }"
    if [[ -z "$alias_raw" || "$alias_raw" == "$rest" ]]; then
        echo "Укажите алиас. Пример: r 168 profile_feature"
        return 1
    fi

    task_number=$(printf '%s' "$task_number" | tr -cd '0-9')
    if [[ -z "$task_number" ]]; then
        echo "Номер задачи не может быть пустым."
        return 1
    fi

    alias=$(sanitize_branch_alias "$alias_raw")
    if [[ -z "$alias" ]]; then
        echo "Алиас задачи не может быть пустым."
        return 1
    fi

    new_branch="${branch_type}/${task_prefix}${task_number}_${alias}"

    if git show-ref --verify --quiet "refs/heads/$new_branch"; then
        echo "Ветка $new_branch уже существует."
        return 1
    fi

    echo "Создаю ветку $new_branch ..."
    git checkout -b "$new_branch"
    echo "Переключились на ветку: $new_branch"

    if ! read -r -e -p "Запушить ветку на origin? (p — push -u, q — нет) > " push_choice; then
        return 0
    fi
    if [[ "$push_choice" == "p" || "$push_choice" == "P" ]]; then
        git_push_set_upstream
    fi
}

# CLI Cursor Agent (agent или cursor agent)
resolve_agent_cli() {
    if command -v agent &>/dev/null; then
        echo "agent"
        return 0
    fi
    if command -v cursor &>/dev/null; then
        echo "cursor agent"
        return 0
    fi
    return 1
}

# Максимальная длина сообщения коммита от Cursor
readonly CURSOR_COMMIT_MSG_MAX_LEN=72

# Лимит длины по объёму staged diff (чем меньше изменений — тем короче сообщение)
cursor_commit_max_len_for_diff() {
    local files lines
    files=$(git diff --cached --name-only 2>/dev/null | wc -l | tr -d ' ')
    lines=$(git diff --cached --numstat 2>/dev/null | awk '{s+=$1+$2} END {print s+0}')
    if [[ "$files" -le 2 && "$lines" -le 30 ]]; then
        echo 36
    elif [[ "$files" -le 5 && "$lines" -le 120 ]]; then
        echo 52
    else
        echo "$CURSOR_COMMIT_MSG_MAX_LEN"
    fi
}

# Очистка ответа агента до одной строки сообщения коммита
clean_agent_commit_message() {
    local raw=$1
    local max_len=$2
    local msg
    msg=$(printf '%s\n' "$raw" \
        | sed 's/\r$//' \
        | sed 's/^```.*//g' \
        | grep -v -E '^(Запрашиваю|Не удалось|Проверьте:|Cursor Agent|agent |───|Tool |Running |✓|✗|Error:|Warning:|\{|\[)' \
        | grep -v -E '(может занять|Cursor Agent CLI|git add|staging)' \
        | sed '/^[[:space:]]*$/d' \
        | tail -1 \
        | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' \
        | sed 's/^["'\'']//;s/["'\'']$//' \
        | sed 's/[.,;:!?]+$//')
    if [[ -z "$msg" ]]; then
        return 1
    fi
    truncate_commit_message "$msg" "$max_len"
}

# Запуск Cursor Agent: json/stream-json → текст, иначе text-режим
invoke_cursor_agent_for_commit() {
    local agent_cli=$1
    local repo_root=$2
    local prompt=$3
    local tmp_out raw

    tmp_out=$(mktemp "${TMPDIR:-/tmp}/cursor_agent.XXXXXX") || return 1

    if [[ "$agent_cli" == "cursor agent" ]]; then
        cursor agent --print --trust --mode ask --output-format json \
            --workspace "$repo_root" "$prompt" >"$tmp_out" 2>/dev/stderr || true
    else
        agent --print --trust --mode ask --output-format json \
            --workspace "$repo_root" "$prompt" >"$tmp_out" 2>/dev/stderr || true
    fi

    if command -v python3 &>/dev/null && [[ -s "$tmp_out" ]]; then
        raw=$(python3 - "$tmp_out" <<'PYEOF'
import json
import sys

path = sys.argv[1]
message = ""

def append_text(value):
    global message
    if isinstance(value, str) and value.strip():
        message = (message + value).strip() if message else value.strip()

def extract_assistant(event):
    msg = event.get("message")
    if not isinstance(msg, dict):
        msg = event
    content = msg.get("content")
    if isinstance(content, list):
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                append_text(block.get("text", ""))
    append_text(msg.get("text", ""))

with open(path, encoding="utf-8", errors="replace") as fh:
    content = fh.read().strip()

if not content:
    sys.exit(0)

if content.startswith("{"):
    try:
        event = json.loads(content)
        if isinstance(event, dict):
            append_text(event.get("result", ""))
    except json.JSONDecodeError:
        pass
else:
    for line in content.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        if not isinstance(event, dict):
            continue
        if event.get("type") == "result":
            append_text(event.get("result", ""))
        elif event.get("type") == "assistant":
            extract_assistant(event)

print(message)
PYEOF
) || raw=""
    fi

    rm -f "$tmp_out"

    if [[ -z "$raw" ]]; then
        if [[ "$agent_cli" == "cursor agent" ]]; then
            raw=$(cursor agent --print --trust --mode ask --workspace "$repo_root" "$prompt" 2>/dev/stderr) || true
        else
            raw=$(agent --print --trust --mode ask --workspace "$repo_root" "$prompt" 2>/dev/stderr) || true
        fi
    fi

    printf '%s' "$raw"
}

# Обрезка до короткой фразы
truncate_commit_message() {
    local msg=$1
    local max_len=${2:-$CURSOR_COMMIT_MSG_MAX_LEN}
    if [[ ${#msg} -le $max_len ]]; then
        echo "$msg"
        return 0
    fi
    local truncated="${msg:0:max_len}"
    truncated="${truncated% *}"
    if [[ ${#truncated} -lt 24 ]]; then
        truncated="${msg:0:max_len}"
    fi
    echo "$truncated"
}

# Предложить сообщение коммита через Cursor Agent по staged diff
# В stdout — только текст сообщения (для $(...)); статус — в stderr
suggest_commit_message_cursor() {
    local agent_cli repo_root staged_stat staged_diff prompt raw suggested max_len
    agent_cli=$(resolve_agent_cli) || {
        echo "Cursor Agent CLI не найден. Установите CLI: https://cursor.com/docs/cli" >&2
        return 1
    }

    repo_root=$(git rev-parse --show-toplevel 2>/dev/null) || {
        echo "Не git-репозиторий." >&2
        return 1
    }

    if git diff --cached --quiet; then
        echo "Нет изменений в staging. Сначала выполняется git add." >&2
        return 1
    fi

    max_len=$(cursor_commit_max_len_for_diff)
    staged_stat=$(git diff --cached --stat 2>/dev/null | tail -30)
    staged_diff=$(git diff --cached 2>/dev/null | head -c 15000)

    prompt="По staged diff ниже придумай ОДНУ строку сообщения git-коммита на русском — только про ИЗМЕНЕНИЯ В КОДЕ.
Длина: не более ${max_len} символов; при малых правках — 20–40 символов.
Формат: «Область: суть» (пример: «git_command_tool: автокоммит через Cursor»).
Запрещено: служебные фразы, статусы, «Запрашиваю», упоминание Cursor/Agent, префикс задачи (LA/SAM-123).
Без кавычек, markdown и точки в конце. Ответ — одна строка, только текст коммита.

--- stat ---
${staged_stat}

--- diff ---
${staged_diff}"

    echo "Запрашиваю сообщение у Cursor Agent (до ${max_len} симв., может занять до минуты)..." >&2
    raw=$(invoke_cursor_agent_for_commit "$agent_cli" "$repo_root" "$prompt")

    if ! suggested=$(clean_agent_commit_message "$raw" "$max_len"); then
        echo "Не удалось разобрать ответ Cursor Agent." >&2
        echo "Проверьте: agent login, CURSOR_API_KEY, доступ к сети." >&2
        return 1
    fi

    # Только сообщение коммита в stdout
    printf '%s\n' "$suggested"
    return 0
}

# Определение родительской ветки (от которой ответвилась текущая)
detect_parent_branch() {
    local current_branch fork_commit created_from branch branch_tip merge_base count
    local best_branch="" best_count=999999

    current_branch=$(git branch --show-current)
    if [[ -z "$current_branch" ]]; then
        return 1
    fi

    # 1) reflog: branch: Created from <имя ветки>
    created_from=$(git reflog show --format='%gs' "$current_branch" 2>/dev/null \
        | { grep -E '^branch: Created from ' || true; } | tail -1 \
        | sed 's/^branch: Created from //')
    if [[ -n "$created_from" && "$created_from" != "HEAD" ]]; then
        if git show-ref --verify --quiet "refs/heads/$created_from"; then
            echo "$created_from"
            return 0
        fi
    fi

    # 2) коммит создания ветки — локальная ветка, чей tip = точка ответвления
    fork_commit=$(git reflog show -n 2 --format='%H' "$current_branch" 2>/dev/null | tail -1)
    if [[ -n "$fork_commit" ]]; then
        while IFS= read -r branch; do
            [[ "$branch" == "$current_branch" ]] && continue
            branch_tip=$(git rev-parse "$branch" 2>/dev/null) || continue
            if [[ "$branch_tip" == "$fork_commit" ]]; then
                echo "$branch"
                return 0
            fi
        done <<EOF
$(git for-each-ref --format='%(refname:short)' refs/heads/)
EOF
    fi

    # 3) эвристика: предок, от которого ответвились (merge-base == tip, минимум коммитов поверх)
    while IFS= read -r branch; do
        [[ "$branch" == "$current_branch" ]] && continue
        branch_tip=$(git rev-parse "$branch" 2>/dev/null) || continue
        merge_base=$(git merge-base HEAD "$branch" 2>/dev/null) || continue
        if [[ "$merge_base" != "$branch_tip" ]]; then
            continue
        fi
        count=$(git rev-list --count "$branch..HEAD" 2>/dev/null) || continue
        if [[ "$count" -lt "$best_count" ]]; then
            best_count=$count
            best_branch=$branch
        fi
    done <<EOF
$(git for-each-ref --format='%(refname:short)' refs/heads/)
EOF

    if [[ -n "$best_branch" ]]; then
        echo "$best_branch"
        return 0
    fi

    return 1
}

# fetch целевой ветки с origin перед rebase (всегда пытаемся обновить)
git_fetch_branch() {
    local branch=$1
    # origin/foo -> foo
    branch="${branch#origin/}"

    echo "Обновляю ветку $branch с origin (git fetch origin ${branch}:${branch})..."
    if git fetch origin "${branch}:${branch}"; then
        echo "Ветка $branch обновлена с origin."
        return 0
    fi

    echo "Fetch origin/$branch не выполнен (ветка может быть только локальной)."
    if ! git show-ref --verify --quiet "refs/heads/$branch"; then
        echo "Ошибка: локальная ветка $branch не найдена."
        return 1
    fi
    echo "Rebase будет выполнен на локальную ветку $branch."
    return 0
}

# fetch + rebase на указанную ветку (родительская / development / введённая)
git_rebase_onto() {
    local branch=$1
    git_fetch_branch "$branch" || return 1
    echo "Выполняю git rebase $branch..."
    git rebase "$branch"
}

# Есть незакоммиченные изменения (staged, unstaged, untracked)
has_uncommitted_changes() {
    [[ -n "$(git status --porcelain 2>/dev/null)" ]]
}

# После коммита: сразу push (п. 2). Без ensure_committed — коммит уже сделан.
push_after_commit() {
    local branch

    branch=$(git branch --show-current)
    if [[ -z "$branch" ]]; then
        echo "Не удалось определить текущую ветку (detached HEAD?)."
        return 1
    fi

    if branch_has_upstream; then
        if git_push_try_normal_then_force; then
            echo "Готово!"
            return 0
        fi
        return 1
    fi

    if git_push_try_normal_then_force --set-upstream origin "$branch"; then
        echo "Готово! Upstream: origin/$branch"
        return 0
    fi
    return 1
}

# Коммит по сценарию 1 → 1 → c → Enter (git add + Cursor + принять)
# $1 = nopush — не пушить (когда вызвали из ensure_committed_before_push)
git_commit_cursor_auto() {
    local prefix commit_message suggested
    local skip_push=${1-}

    echo "Добавляются все изменения"
    git add .

    if git diff --cached --quiet; then
        echo "Нет изменений для коммита."
        return 1
    fi

    prefix=$(apply_resolve_commit_prefix) || true
    if [[ -z "$prefix" ]]; then
        echo "Префикс задачи (PROJ-N) не найден ни в ветке, ни в последних коммитах. Продолжаем без префикса."
    fi

    if ! suggested=$(suggest_commit_message_cursor); then
        return 1
    fi

    commit_message=$suggested
    echo "Сообщение Cursor (принято): $commit_message"

    if [[ -n "$prefix" ]]; then
        commit_message="$prefix | $commit_message"
    fi

    echo "Выполняю git commit..."
    git commit -m "$commit_message"
    echo "Коммит успешно создан!"

    if [[ "$skip_push" != "nopush" ]]; then
        push_after_commit
    fi
    return 0
}

# Перед push: автокоммит через Cursor, если есть незакоммиченные изменения
ensure_committed_before_push() {
    if ! has_uncommitted_changes; then
        return 0
    fi
    echo "---------------------------------------------"
    echo "Незакоммиченные изменения — автокоммит (11c: Cursor + Enter)..."
    echo "---------------------------------------------"
    git_commit_cursor_auto nopush
}

# rebase на родительскую ветку (fallback — development)
git_rebase_parent() {
    local parent
    parent=$(detect_parent_branch) || true
    if [[ -z "$parent" ]]; then
        echo "Родительская ветка не определена, использую development..."
        parent="development"
    else
        echo "Родительская ветка: $parent"
    fi
    git_rebase_onto "$parent"
}

# Кандидаты базы для сквоша: mainline + родительская (если есть).
# Печатает строки: prefer_rank|ahead|behind|ref
# prefer_rank: 0=development, 1=main, 2=master, 3=прочее (меньше = предпочтительнее).
git_squash_list_base_candidates() {
    local current=$1
    local short_name ref prefer_rank merge_base ahead behind parent seen
    local -a seen_shorts=()

    for short_name in development main master; do
        case "$short_name" in
            development) prefer_rank=0 ;;
            main) prefer_rank=1 ;;
            master) prefer_rank=2 ;;
            *) prefer_rank=3 ;;
        esac

        ref=""
        if git rev-parse --verify --quiet "$short_name" >/dev/null; then
            ref="$short_name"
        elif git rev-parse --verify --quiet "origin/$short_name" >/dev/null; then
            ref="origin/$short_name"
        else
            continue
        fi
        [[ "$ref" == "$current" || "$ref" == "origin/$current" ]] && continue

        merge_base=$(git merge-base HEAD "$ref" 2>/dev/null) || continue
        [[ -z "$merge_base" ]] && continue
        ahead=$(git rev-list --count "${merge_base}..HEAD" 2>/dev/null) || continue
        [[ "$ahead" -eq 0 ]] && continue
        behind=$(git rev-list --count "${merge_base}..${ref}" 2>/dev/null) || behind=0

        seen_shorts+=("$short_name")
        printf '%s|%s|%s|%s\n' "$prefer_rank" "$ahead" "$behind" "$ref"
    done

    parent=$(detect_parent_branch 2>/dev/null) || true
    if [[ -n "$parent" && "$parent" != "$current" ]]; then
        seen=0
        for short_name in "${seen_shorts[@]+"${seen_shorts[@]}"}"; do
            if [[ "$short_name" == "$parent" || "$short_name" == "${parent#origin/}" ]]; then
                seen=1
                break
            fi
        done
        if [[ "$seen" -eq 0 ]] && git rev-parse --verify --quiet "$parent" >/dev/null; then
            merge_base=$(git merge-base HEAD "$parent" 2>/dev/null) || true
            if [[ -n "$merge_base" ]]; then
                ahead=$(git rev-list --count "${merge_base}..HEAD" 2>/dev/null) || ahead=0
                if [[ "$ahead" -gt 0 ]]; then
                    behind=$(git rev-list --count "${merge_base}..${parent}" 2>/dev/null) || behind=0
                    printf '3|%s|%s|%s\n' "$ahead" "$behind" "$parent"
                fi
            fi
        fi
    fi
}

# Выбор базовой ветки из списка кандидатов (Enter = рекомендуемая).
# Меню — в stderr; выбранный ref — в stdout (для base=$(...)).
git_squash_pick_base() {
    local current=$1
    local prefer_rank ahead behind ref
    local -a refs=() aheads=() behinds=() ranks=()
    local i recommended_idx=1 choice label n

    # Без process substitution: sh при разборе файла падает на `< <(...)` до re-exec в bash
    while IFS='|' read -r prefer_rank ahead behind ref; do
        [[ -z "$ref" ]] && continue
        ranks+=("$prefer_rank")
        aheads+=("$ahead")
        behinds+=("$behind")
        refs+=("$ref")
    done <<EOF
$(git_squash_list_base_candidates "$current" | sort -t'|' -k1,1n -k2,2n)
EOF

    n=${#refs[@]}
    if [[ "$n" -eq 0 ]]; then
        echo "Подходящие базовые ветки не найдены." >&2
        ref=$(read_with_exit "Введите базовую ветку вручную ('q' — отмена) > " "false" "development") || return 1
        echo "$ref"
        return 0
    fi

    # Рекомендация: development (prefer_rank=0), иначе первый после сортировки
    recommended_idx=1
    i=0
    while [[ "$i" -lt "$n" ]]; do
        if [[ "${ranks[$i]}" -eq 0 ]]; then
            recommended_idx=$((i + 1))
            break
        fi
        i=$((i + 1))
    done

    i=$((recommended_idx - 1))
    printf 'База: %s — своих коммитов: %s, позади базы: %s\n' \
        "${refs[$i]}" "${aheads[$i]}" "${behinds[$i]}" >&2
    printf '  Enter) продолжить с %s\n' "${refs[$i]}" >&2
    printf '  d) другая ветка (список / ввод вручную)\n' >&2
    printf '  q) отмена\n' >&2
    echo "---------------------------------------------" >&2

    choice=$(read_with_exit "Выбор (Enter = база, 'q' — отмена) > " "false") || return 1
    if [[ -z "$choice" ]]; then
        echo "${refs[$i]}"
        return 0
    fi
    if [[ "$choice" != "d" && "$choice" != "D" ]]; then
        echo "Неверный выбор: $choice (ожидалось Enter, 'd' или 'q')." >&2
        return 1
    fi

    # d) — полный список кандидатов + ручной ввод
    echo "Доступные базовые ветки (коммиты текущей поверх базы):" >&2
    i=0
    while [[ "$i" -lt "$n" ]]; do
        label="${refs[$i]}"
        if [[ $((i + 1)) -eq "$recommended_idx" ]]; then
            label="${label} (рекомендуется)"
        fi
        printf '  %d) %s — своих: %s, позади базы: %s\n' \
            "$((i + 1))" "$label" "${aheads[$i]}" "${behinds[$i]}" >&2
        i=$((i + 1))
    done
    printf '  0) ввести вручную\n' >&2
    echo "---------------------------------------------" >&2

    choice=$(read_with_exit "Выбор (Enter = $recommended_idx, 'q' — отмена) > " "false" "$recommended_idx") || return 1
    if [[ "$choice" == "0" ]]; then
        ref=$(read_with_exit "Базовая ветка ('q' — отмена) > " "false") || return 1
        echo "$ref"
        return 0
    fi
    if [[ ! "$choice" =~ ^[0-9]+$ ]] || [[ "$choice" -lt 1 ]] || [[ "$choice" -gt "$n" ]]; then
        echo "Неверный выбор: $choice" >&2
        return 1
    fi
    echo "${refs[$((choice - 1))]}"
    return 0
}

# Сквош: все коммиты текущей ветки поверх базовой — в один коммит
git_squash_branch() {
    local current base merge_base count first_msg prefix commit_message answer push_answer

    if has_uncommitted_changes; then
        echo "Есть незакоммиченные изменения — сначала закоммить их (1) или спрячь (git stash)."
        return 1
    fi

    current=$(git branch --show-current)
    if [[ -z "$current" ]]; then
        echo "Не удалось определить текущую ветку (detached HEAD?)."
        return 1
    fi
    echo "Текущая ветка: $current"
    echo "---------------------------------------------"

    base=$(git_squash_pick_base "$current") || return 1
    if [[ -z "$base" ]]; then
        echo "Базовая ветка не указана."
        return 1
    fi
    if [[ "$base" == "$current" || "$base" == "origin/$current" ]]; then
        echo "Базовая ветка совпадает с текущей ($current) — так сквошить нельзя."
        return 1
    fi
    if ! git rev-parse --verify --quiet "$base" >/dev/null; then
        echo "Ветка $base не найдена (ни локально, ни как origin/$base)."
        return 1
    fi

    merge_base=$(git merge-base HEAD "$base" 2>/dev/null) || true
    if [[ -z "$merge_base" ]]; then
        echo "Не удалось найти общий коммит с $base."
        return 1
    fi

    count=$(git rev-list --count "${merge_base}..HEAD" 2>/dev/null) || count=0
    if [[ "$count" -lt 2 ]]; then
        echo "Сквошить нечего: коммитов поверх $base — $count."
        return 0
    fi

    echo "---------------------------------------------"
    echo "База: $base"
    echo "Коммиты, которые будут слиты в один ($count):"
    git log --oneline "${merge_base}..HEAD"
    echo "---------------------------------------------"

    first_msg=$(git log --format=%s "${merge_base}..HEAD" | tail -1)
    prefix=$(apply_resolve_commit_prefix) || true
    if [[ -n "$prefix" && "$first_msg" != *"$prefix"* ]]; then
        first_msg="$prefix | $first_msg"
    fi

    commit_message=$(read_with_exit "Сообщение итогового коммита ('q' — отмена) > " "false" "$first_msg") || return 1
    if [[ -z "$commit_message" ]]; then
        echo "Сообщение пустое — отмена."
        return 1
    fi

    answer=$(read_with_exit "Слить $count коммитов в один? (Enter = y, n — нет) > " "false") || return 1
    if ! is_yes_answer "$answer"; then
        echo "Отменено."
        return 1
    fi

    echo "Выполняю git reset --soft $merge_base ..."
    if ! git reset --soft "$merge_base"; then
        echo "Не удалось выполнить reset --soft."
        return 1
    fi

    if ! git commit -m "$commit_message"; then
        echo "Коммит не создан. Изменения остались в индексе (git commit / git reset ORIG_HEAD для возврата)."
        return 1
    fi
    echo "Готово! История ветки слита в один коммит."

    if branch_has_upstream; then
        push_answer=$(read_with_exit "Ветка уже на origin — сделать force push? (Enter = y, n — нет) > " "false") || return 0
        if is_yes_answer "$push_answer"; then
            echo "Выполняю git push --force-with-lease..."
            git push --force-with-lease || git push --force
            echo "Готово!"
        else
            echo "Не забудь: после сквоша нужен force push (пункт 3)."
        fi
    fi
    return 0
}

# 1s: hard reset на коммит + force-with-lease
git_revert_pushed() {
    echo "1) Сбросить на предыдущий коммит (HEAD~1)"
    echo "2) Сбросить на коммит по хэшу"
    echo "3) Сбросить на коммит (хэш или N назад)"
    echo "q) Выйти"
    echo "---------------------------------------------"
    echo "Последние коммиты:"
    git log --oneline -10
    echo "---------------------------------------------"

    local choice
    choice=$(read_with_exit "Выбор команды ('q' для отмены) > " "false") || return

    case $choice in
        1)
            git_reset_hard_last
            ;;
        2)
            git_reset_hard_by_hash
            ;;
        3)
            git_reset_hard_to_point
            ;;
        q)
            return
            ;;
        *)
            echo "Неверный выбор. Пожалуйста, попробуйте снова."
            git_revert_pushed
            ;;
    esac
}

# Общий шаг: подтверждение, reset --hard, force-with-lease
# $1 — целевой коммит (ref/хэш), $2 — как показать цель в логах (опционально)
git_reset_hard_and_force_push() {
    local target="$1"
    local target_label="${2:-$1}"
    local target_full answer dropped

    if ! git rev-parse --verify --quiet "${target}^{commit}" >/dev/null; then
        echo "Коммит не найден: $target"
        return 1
    fi

    target_full=$(git rev-parse "${target}^{commit}")
    if [[ "$target_full" == "$(git rev-parse HEAD)" ]]; then
        echo "Уже на этом коммите — сбрасывать нечего."
        return 0
    fi

    dropped=$(git rev-list --count "${target_full}..HEAD" 2>/dev/null) || dropped=0
    echo "Будет выполнено:"
    echo "  git reset --hard $target_label"
    echo "  git push --force-with-lease"
    echo "Целевой коммит:"
    git log -1 --oneline "$target_full"
    echo "Удаляемые коммиты ($dropped):"
    git log --oneline "${target_full}..HEAD"
    echo "---------------------------------------------"
    echo "ВНИМАНИЕ: история переписывается, незакоммиченные изменения тоже пропадут."
    answer=$(read_with_exit "Продолжить? (Enter = y, n — нет) > " "false") || return
    if [[ -n "$answer" && "$answer" != "y" && "$answer" != "Y" ]]; then
        echo "Отмена."
        return
    fi

    echo "Выполняю git reset --hard $target_label..."
    git reset --hard "$target_full"
    echo "Выполняю git push --force-with-lease..."
    git push --force-with-lease
    echo "Готово: ветка на коммите $(git log -1 --oneline), remote обновлён."
}

# 1s → 1: сбросить на предыдущий коммит
git_reset_hard_last() {
    git_reset_hard_and_force_push "HEAD~1" "HEAD~1"
}

# 1s → 2: сбросить на коммит по хэшу
git_reset_hard_by_hash() {
    local commit_hash
    commit_hash=$(read_with_exit "Хэш целевого коммита ('q' для отмены) > " "false") || return
    git_reset_hard_and_force_push "$commit_hash" "$commit_hash"
}

# 1s → 3: сбросить на коммит (хэш или N назад)
git_reset_hard_to_point() {
    local target

    echo "Целевой коммит:"
    echo "  • хэш (например 513047c0)"
    echo "  • или N — на N коммитов назад (HEAD~N)"
    echo "---------------------------------------------"
    target=$(read_with_exit "Хэш или N ('q' для отмены) > " "false") || return

    if [[ "$target" =~ ^[0-9]+$ ]]; then
        if [[ "$target" -lt 1 ]]; then
            echo "N должно быть >= 1."
            return 1
        fi
        git_reset_hard_and_force_push "HEAD~${target}" "HEAD~${target}"
        return
    fi

    git_reset_hard_and_force_push "$target" "$target"
}

# Функция для выполнения git commit
git_commit() {
    echo "1) Создать новый коммит"
    echo "2) Изменить сообщение коммита (если не запушен)"
    echo "3) Отменить коммит (если не запушен)"
    echo "q) Выйти"
    echo "---------------------------------------------"
    local choice
    choice=$(read_with_exit "Выбор команды ('q' для отмены) > " "false") || return

    case $choice in
        1)
            # Добавляем все изменения в staging area
            echo "Добавляются все изменения"
            git add .
            
            # Префикс: из ветки, иначе из ближайших коммитов (LA/… или другой PROJ-N)
            local prefix
            prefix=$(apply_resolve_commit_prefix) || true
            if [[ -z "$prefix" ]]; then
                echo "Префикс задачи (PROJ-N) не найден ни в ветке, ни в последних коммитах. Продолжаем без префикса."
            fi

            while true; do
                # Формируем подсказку с префиксом
                local prompt_message="Cообщение коммита ('c' - Cursor, 'q' - отмена, 'n' - новый префикс) > "
                if [[ -n "$prefix" ]]; then
                    prompt_message="Cообщение коммита ($prefix | 'c' - Cursor, 'q' - отмена, 'n' - новый префикс) > "
                fi

                local commit_message suggested
                commit_message=$(read_with_exit "$prompt_message" "false") || return

                # Cursor Agent предлагает сообщение по staged diff
                if [[ "$commit_message" == "c" || "$commit_message" == "C" ]]; then
                    if ! suggested=$(suggest_commit_message_cursor); then
                        continue
                    fi
                    echo "Предложение Cursor: $suggested"
                    commit_message=$(read_with_exit "Enter — принять, или введите свой текст ('q' - отмена) > " "false") || return
                    if [[ -z "$commit_message" ]]; then
                        commit_message=$suggested
                    fi
                fi
                
                # Если пользователь ввел 'n', запрашиваем новый префикс
                if [[ "$commit_message" == "n" ]]; then
                    prefix=$(read_with_exit "Введите новый префикс ('q' для отмены) > " "false") || return
                    echo "Новый префикс: $prefix"
                    continue
                fi
                
                # Проверяем, если пользователь ввел "отмена" или "cancel"
                if [[ "$commit_message" == "отмена" || "$commit_message" == "cancel" ]]; then
                    echo "Отмена коммита..."
                    git reset --soft HEAD^  # Отменяем последний коммит
                    echo "Коммит отменен!"
                    return
                fi
                
                # Добавляем префикс к сообщению коммита, если он найден
                if [[ -n "$prefix" ]]; then
                    commit_message="$prefix | $commit_message"
                fi
                
                echo "Выполняю git commit..."
                git commit -m "$commit_message"
                echo "Коммит успешно создан!"
                push_after_commit
                break
            done
            ;;
        2)
            # Изменение сообщения последнего коммита
            echo "Изменение сообщения последнего коммита..."
            
            # Проверяем, был ли коммит уже запушен
            if is_last_commit_pushed; then
                echo "Последний коммит уже был запушен. Изменение сообщения невозможно."
                return
            fi
            
            echo "Текущее сообщение последнего коммита:"
            git log -1 --pretty=%B
            echo "---------------------------------------------"
            
            local new_message current_msg
            current_msg=$(git log -1 --pretty=%s)
            new_message=$(read_with_exit "Введите новое сообщение коммита ('q' для отмены) > " "false" "$current_msg") || return
            
            # Полностью перезаписываем сообщение коммита, включая префикс
            echo "Выполняю git commit --amend..."
            git commit --amend -m "$new_message" --no-edit
            echo "Сообщение последнего коммита успешно изменено!"
            ;;
        3)
            echo "Проверяю, можно ли отменить последний коммит..."
            # Проверяем, есть ли коммиты, которые еще не были запушены
            if is_last_commit_pushed; then
                echo "Последний коммит уже был запушен. Отмена невозможна."
            else
                echo "Отменяю последний коммит..."
                git reset --soft HEAD~1
                echo "Последний коммит отменен. Изменения сохранены в рабочей директории."
            fi
            ;;
        q)
            return
            ;;
        *)
            echo "Неверный выбор. Пожалуйста, попробуйте снова."
            git_commit
            ;;
    esac
}

# Справка по пунктам главного меню (команда i)
display_commands_info() {
    cat <<'EOF'
Как пользоваться
  Код пункта вводите в «Выбор команды». «..» в меню — есть подменю.
  Цепочку можно набрать сразу с главного экрана (11, 2m1, 91…).
  В любом запросе «q» — отмена (в главном меню — выход).
  Тикет (SAM-123 и т.п.) берётся из имени ветки или из последних коммитов.

b) создать ветку
  Одна строка: тип + номер задачи + алиас.
  r/f/b = refactor / feature / bugfix.
  Пример: r 168 profile_feature → refactor/SAM-168_profile_feature
  Префикс можно задать явно: r SA 168 profile_feature
  После создания можно сразу push -u (p).

init) первый push текущей ветки
  git push --set-upstream origin <ветка>.
  Если есть незакоммиченное — сначала автокоммит через Cursor (как 11c).

11c) быстрый коммит через Cursor
  git add ., агент пишет сообщение, сразу commit.
  Дальше предлагает push.

1) commit..
  1 / 11  — новый коммит (все файлы в add). «c» — текст от Cursor.
            «n» — другой префикс тикета. После коммита — предложение push.
  2 / 12  — переименовать последний коммит (только если ещё не на origin).
  3 / 13  — отменить последний коммит, файлы оставить (тоже только не запушенный).

1s) сбросить ветку на коммит (опасно)
  hard reset + push --force-with-lease. Незакоммиченное пропадёт.
  1 / 1s1 — на предыдущий коммит (HEAD~1)
  2 / 1s2 — на указанный хэш
  3 / 1s3 — хэш или N (на N коммитов назад)

2) push
  Обычный git push. Если origin отверг (история разошлась) — сам сделает force.
  Незакоммиченное перед этим коммитит через Cursor.

2m) Merge Request..
  1 / 2m1 — создать MR в GitLab (цель, заголовок, draft, assignee/reviewer).
  2 / 2m2 — снять Draft у MR текущей ветки.
  3 / 2m3 — переименовать этот MR.
  4 / 2m4 — найти MR по словам в заголовке.
  5 / 2m5 — найти MR по словам в сообщениях коммитов.

3) force push
  git push --force (намеренно, не «мягкий» force-with-lease).
  Перед этим тоже автокоммит незакоммиченного.

4) pull
  git pull, затем prune origin и предложение удалить локальные ветки
  без активности больше месяца (d — удалить).

5) rebase..
  Подтянуть свою ветку поверх другой (fetch + rebase).
  1 / 51 — родительская (или development, если родителя нет).
  2 / 52 — development
  3 / 53 — любая указанная ветка
  4 / 54 — git rebase --abort

5s) smart rebase (тестовый)
  Тот же rebase, но конфликты пытается закрыть Cursor Agent.
  Не гарантировано. При сбое: abort / руками / выход в меню.
  1 / 5s1, 2 / 5s2, 3 / 5s3 — как у пункта 5 (родитель / development / своя ветка).

6) cherry-pick..
  Перенести один коммит по хэшу в текущую ветку.
  1 / 61 — ввести хэш
  2 / 62 — git cherry-pick --abort

6s) squash ветки
  Все коммиты поверх выбранной базы слить в один (soft reset + commit).
  Если ветка уже на origin — спросит force push.

7) prune origin
  Убрать локальные ссылки на удалённые на origin ветки.

8) tag..
  1 / 81  — тег ui_kit (semver vX.Y.Z):
            811 новый (patch+1), 812 переставить последний на HEAD.
  2 / 82  — тег сборки Codemagic (dev/prod, сторы).
            8291 — обновить уже существующий CI-тег на HEAD.

9) review..
  Cursor: Review → Summary → опционально Fix. Правила: .gitlab/review_rules.md
  1 / 91 — только незакоммиченное
  2 / 92 — последний коммит + текущие правки
  3 / 93 — вся ветка относительно базы

10) MR статистика / список..
  Merged MR за период по @никам (GitLab API).
  1 / 101 — объём кода (+/−)
  2 / 102 — список MR без статистики

i) эта справка
q) выход из скрипта
EOF
}

# Функция для отображения меню
display_menu() {
    echo "b) создать ветку [r,f,b]/PREFIX-номер_алиас"
    echo "init) push -u (первый push, текущая ветка)"
    echo "11c) commit Cursor (1→1→c→Enter)"
    echo "1) commit.."
    echo "1s) сбросить на коммит (hard reset + force-with-lease)"
    echo "2) push"
    echo "2m) Merge Request.."
    echo "3) force push"
    echo "4) pull"
    echo "5) rebase.."
    echo "5s) smart rebase (agent) НЕ ГАРАНТИРОВАНО / ТЕСТОВЫЙ"
    echo "6) cherry-pick.."
    echo "6s) squash: все коммиты ветки в один"
    echo "7) prune origin"
    echo "8) tag.."
    echo "9) review.."
    echo "10) MR статистика / список.."
    echo "i) что делает каждый пункт"
    echo "q) Выйти"
    echo "---------------------------------------------"
}

# Первый push текущей ветки с настройкой upstream
git_push_set_upstream() {
    ensure_committed_before_push || return 1

    local branch
    branch=$(git branch --show-current)
    if [[ -z "$branch" ]]; then
        echo "Не удалось определить текущую ветку (detached HEAD?)."
        return 1
    fi
    echo "Выполняю git push --set-upstream origin $branch ..."
    if git_push_try_normal_then_force --set-upstream origin "$branch"; then
        echo "Готово! Upstream: origin/$branch"
        return 0
    fi
    return 1
}

# Обычный git push (ветка уже привязана к upstream); при необходимости — force
git_push() {
    ensure_committed_before_push || return 1

    if git_push_try_normal_then_force; then
        echo "Готово!"
        return 0
    fi
    return 1
}

# Локальная ветка разошлась с upstream (есть и свои, и чужие коммиты) — нужен force
branch_needs_force_push() {
    local counts ahead behind
    if ! branch_has_upstream; then
        return 1
    fi
    counts=$(git rev-list --left-right --count 'HEAD...@{upstream}' 2>/dev/null) || return 1
    ahead=$(printf '%s' "$counts" | awk '{print $1}')
    behind=$(printf '%s' "$counts" | awk '{print $2}')
    [[ -n "$ahead" && -n "$behind" && "$ahead" -gt 0 && "$behind" -gt 0 ]]
}

# Сообщение git push указывает на non-fast-forward / rejected
push_output_needs_force() {
    printf '%s' "$1" | grep -qiE \
        'non-fast-forward|\[rejected\]|fetch first|Updates were rejected|failed to push some refs|cannot lock ref'
}

# Выполнить force push (те же аргументы, что и у обычного push, плюс --force)
git_push_force_args() {
    echo "Выполняю git push --force $* ..."
    git push --force "$@"
}

# Обычный push; если заранее видно расхождение — сразу force;
# если обычный push отклонён как non-fast-forward — retry force.
# Аргументы пробрасываются в git push (например --set-upstream origin branch).
git_push_try_normal_then_force() {
    local out rc

    if branch_needs_force_push; then
        echo "Ветка разошлась с origin (rebase/amend?) — сразу force push..."
        git_push_force_args "$@"
        return $?
    fi

    if [[ $# -gt 0 ]]; then
        echo "Выполняю git push $* ..."
    else
        echo "Выполняю git push..."
    fi
    set +e
    out=$(git push "$@" 2>&1)
    rc=$?
    set -e
    if [[ -n "$out" ]]; then
        printf '%s\n' "$out"
    fi
    if [[ "$rc" -eq 0 ]]; then
        return 0
    fi

    if push_output_needs_force "$out"; then
        echo "Обычный push отклонён — пробую force push..."
        git_push_force_args "$@"
        return $?
    fi

    echo "Push не удался (не похоже на non-fast-forward)."
    return "$rc"
}

# Список целевых веток для 2m: development (dev) + 3 с самыми свежими обновлениями.
# Только ветки, которые ещё есть на origin (не удалены на remote). master исключён.
# «Свежесть» — по последней записи reflog локальной ветки (коммит/rebase/pull/reset…),
# иначе по дате tip-коммита. Текущая ветка исключена.
collect_mr_target_branches() {
    local current_branch=$1
    local branch count=0
    local dev_branch="" ts

    if git show-ref --verify --quiet "refs/remotes/origin/development"; then
        dev_branch="development"
    elif git show-ref --verify --quiet "refs/remotes/origin/dev"; then
        dev_branch="dev"
    fi

    if [[ -n "$dev_branch" && "$dev_branch" != "$current_branch" ]]; then
        echo "$dev_branch"
    fi

    while IFS= read -r branch; do
        [[ -z "$branch" || "$branch" == "$current_branch" ]] && continue
        [[ -n "$dev_branch" && "$branch" == "$dev_branch" ]] && continue
        [[ "$branch" == "master" ]] && continue
        echo "$branch"
        count=$((count + 1))
        [[ "$count" -ge 3 ]] && break
    done <<EOF
$(
    git for-each-ref --format='%(refname:short)' refs/heads/ | while IFS= read -r branch; do
        [[ -z "$branch" || "$branch" == "master" ]] && continue
        git show-ref --verify --quiet "refs/remotes/origin/${branch}" || continue
        ts=$(git reflog show -1 --format='%ct' "$branch" 2>/dev/null) || true
        if [[ -z "$ts" ]]; then
            ts=$(git log -1 --format='%ct' "refs/remotes/origin/${branch}" 2>/dev/null) || ts=0
        fi
        printf '%s\t%s\n' "$ts" "$branch"
    done | sort -t $'\t' -k1,1nr | cut -f2-
)
EOF
}

# URL-encode (для query / API path)
urlencode() {
    python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$1"
}

# origin → https://host/group/project (без .git)
gitlab_web_base_from_remote() {
    local remote url
    remote=$(git remote get-url origin 2>/dev/null) || return 1
    url=$remote
    url=${url%.git}
    if [[ "$url" =~ ^git@([^:]+):(.+)$ ]]; then
        echo "https://${BASH_REMATCH[1]}/${BASH_REMATCH[2]}"
        return 0
    fi
    if [[ "$url" =~ ^https?:// ]]; then
        echo "$url"
        return 0
    fi
    if [[ "$url" =~ ^ssh://[^@]+@([^/]+)/(.+)$ ]]; then
        echo "https://${BASH_REMATCH[1]}/${BASH_REMATCH[2]}"
        return 0
    fi
    return 1
}

# Токен GitLab: env, git config или конфиг glab
gitlab_api_token() {
    if [[ -n "${GITLAB_TOKEN:-}" ]]; then
        echo "$GITLAB_TOKEN"
        return 0
    fi
    if [[ -n "${GITLAB_PRIVATE_TOKEN:-}" ]]; then
        echo "$GITLAB_PRIVATE_TOKEN"
        return 0
    fi
    local cfg
    cfg=$(git config --get gitlab.token 2>/dev/null) || true
    if [[ -n "$cfg" ]]; then
        echo "$cfg"
        return 0
    fi
    # Токен из конфига glab (даже если бинарь не в PATH / не авторизован в keyring)
    local glab_cfg host token
    for glab_cfg in \
        "${XDG_CONFIG_HOME:-$HOME/.config}/glab-cli/config.yml" \
        "$HOME/Library/Application Support/glab-cli/config.yml"
    do
        [[ -f "$glab_cfg" ]] || continue
        host=$(gitlab_web_base_from_remote 2>/dev/null | sed 's|^https://||; s|/.*||') || host="gitlab.com"
        token=$(python3 - "$glab_cfg" "$host" <<'PYEOF' 2>/dev/null || true
import sys, re
path, host = sys.argv[1], sys.argv[2]
text = open(path, encoding="utf-8", errors="replace").read()
# hosts:\n  gitlab.com:\n    token: xxx
m = re.search(
    rf"(?m)^[ \t]*{re.escape(host)}:[ \t]*\n(?:[ \t]+.+\n)*?[ \t]+token:[ \t]*['\"]?([^\s'\"]+)",
    text,
)
if m:
    print(m.group(1))
    sys.exit(0)
m = re.search(r"(?m)^[ \t]*token:[ \t]*['\"]?([^\s'\"]+)", text)
if m:
    print(m.group(1))
PYEOF
)
        if [[ -n "$token" && "$token" != "null" && "$token" != "!"* ]]; then
            echo "$token"
            return 0
        fi
    done
    return 1
}

# Путь к glab (учитываем Homebrew вне PATH)
resolve_glab_cli() {
    if command -v glab >/dev/null 2>&1; then
        command -v glab
        return 0
    fi
    local candidate
    for candidate in /opt/homebrew/bin/glab /usr/local/bin/glab; do
        if [[ -x "$candidate" ]]; then
            echo "$candidate"
            return 0
        fi
    done
    return 1
}

# Файл дефолтов MR в корне репозитория
gitlab_mr_defaults_path() {
    local root
    root=$(git rev-parse --show-toplevel 2>/dev/null) || return 1
    echo "${root}/.gitlab/mr_defaults"
}

# Нормализация: " @a, b ,, @me " → "a,b,@me"
normalize_gitlab_usernames() {
    local raw=$1
    python3 -c '
import re, sys
parts = re.split(r"[,;\s]+", sys.argv[1].strip())
out = []
for p in parts:
    p = p.strip().lstrip("@")
    if not p:
        continue
    if p.lower() == "me":
        out.append("@me")
    else:
        out.append(p)
print(",".join(out))
' "$raw"
}

# Ответ на вопрос (y/n): пустой ввод (Enter) = ДА. Нет — только явные n/no/нет/0/false.
is_yes_answer() {
    local raw=${1-}
    raw=$(printf '%s' "$raw" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
    case "$raw" in
        n|N|no|NO|No|н|Н|нет|Нет|НЕТ|0|false|FALSE|off) return 1 ;;
        *) return 0 ;;
    esac
}

# Нормализовать squash: true|false (пусто / неизвестное → true)
normalize_mr_squash() {
    local raw=${1-}
    raw=$(printf '%s' "$raw" | tr '[:upper:]' '[:lower:]' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
    case "$raw" in
        0|n|no|false|off|нет|н) echo "false" ;;
        *) echo "true" ;;
    esac
}

# Прочитать assignees/reviewers/squash из .gitlab/mr_defaults
# stdout: три строки — assignees, reviewers, squash (true|false)
gitlab_mr_defaults_load() {
    local path assignees reviewers squash line key val
    path=$(gitlab_mr_defaults_path) || return 1
    assignees=""
    reviewers=""
    squash="true"
    if [[ -f "$path" ]]; then
        while IFS= read -r line || [[ -n "$line" ]]; do
            line=$(printf '%s' "$line" | sed 's/#.*//;s/^[[:space:]]*//;s/[[:space:]]*$//')
            [[ -z "$line" ]] && continue
            key=$(printf '%s' "$line" | cut -d= -f1 | tr '[:upper:]' '[:lower:]' | sed 's/[[:space:]]//g')
            val=$(printf '%s' "$line" | cut -d= -f2- | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
            case "$key" in
                assignees|assignee)
                    assignees=$(normalize_gitlab_usernames "$val")
                    ;;
                reviewers|reviewer)
                    reviewers=$(normalize_gitlab_usernames "$val")
                    ;;
                squash)
                    squash=$(normalize_mr_squash "$val")
                    ;;
            esac
        done <"$path"
    fi
    printf '%s\n%s\n%s\n' "$assignees" "$reviewers" "$squash"
}

# Сохранить дефолты в .gitlab/mr_defaults
gitlab_mr_defaults_save() {
    local assignees=$1
    local reviewers=$2
    local squash
    squash=$(normalize_mr_squash "${3-true}")
    local path dir
    path=$(gitlab_mr_defaults_path) || return 1
    dir=$(dirname "$path")
    mkdir -p "$dir"
    assignees=$(normalize_gitlab_usernames "$assignees")
    reviewers=$(normalize_gitlab_usernames "$reviewers")
    cat >"$path" <<EOF
# Дефолты для создания Merge Request (команда 2m в sh_gitlab.sh).
# GitLab usernames через запятую (не email). Спецзначение: @me — текущий пользователь.
# squash=true|false — «Сжать коммиты когда запрос на слияние будет принят».

assignees=${assignees}
reviewers=${reviewers}
squash=${squash}
EOF
    echo "Дефолты сохранены в $path"
    echo "  assignees=${assignees:-(пусто)}"
    echo "  reviewers=${reviewers:-(пусто)}"
    echo "  squash=${squash}"
}

# Интерактивно: принять/изменить assignees, reviewers, squash и опционально сохранить дефолты
# stdout: три строки — assignees, reviewers, squash (прочее — в stderr)
prompt_mr_assignees_reviewers() {
    local def_assignees def_reviewers def_squash input save_choice
    local assignees reviewers squash loaded

    loaded=$(gitlab_mr_defaults_load) || loaded=$'\n\ntrue'
    def_assignees=$(printf '%s' "$loaded" | sed -n '1p')
    def_reviewers=$(printf '%s' "$loaded" | sed -n '2p')
    def_squash=$(printf '%s' "$loaded" | sed -n '3p')
    def_squash=$(normalize_mr_squash "$def_squash")

    echo "Исполнители / рецензенты (GitLab username, через запятую; @me = вы)" >&2
    echo "Дефолты проекта (.gitlab/mr_defaults):" >&2
    echo "  assignees: ${def_assignees:-(пусто)}" >&2
    echo "  reviewers: ${def_reviewers:-(пусто)}" >&2
    echo "  squash:    ${def_squash}" >&2
    echo "Enter — принять дефолты; введите новых; '-' — очистить; 'e' — изменить и сохранить дефолты" >&2
    echo "---------------------------------------------" >&2

    input=$(read_with_exit "Assignees [${def_assignees}] ('q' — отмена) > " "false") || return 1
    if [[ "$input" == "e" || "$input" == "E" ]]; then
        input=$(read_with_exit "Новые дефолтные assignees ('q' — отмена) > " "false" "$def_assignees") || return 1
        if [[ "$input" == "-" ]]; then
            def_assignees=""
        elif [[ -n "$input" ]]; then
            def_assignees=$(normalize_gitlab_usernames "$input")
        fi
        input=$(read_with_exit "Новые дефолтные reviewers ('q' — отмена) > " "false" "$def_reviewers") || return 1
        if [[ "$input" == "-" ]]; then
            def_reviewers=""
        elif [[ -n "$input" ]]; then
            def_reviewers=$(normalize_gitlab_usernames "$input")
        fi
        input=$(read_with_exit "Новый дефолт squash (Enter = y, n — нет) ('q' — отмена) > " "false") || return 1
        if is_yes_answer "$input"; then
            def_squash="true"
        else
            def_squash="false"
        fi
        gitlab_mr_defaults_save "$def_assignees" "$def_reviewers" "$def_squash" >&2
        assignees=$def_assignees
        reviewers=$def_reviewers
        squash=$def_squash
        printf '%s\n%s\n%s\n' "$assignees" "$reviewers" "$squash"
        return 0
    fi

    if [[ "$input" == "-" ]]; then
        assignees=""
    elif [[ -z "$input" ]]; then
        assignees=$def_assignees
    else
        assignees=$(normalize_gitlab_usernames "$input")
    fi

    input=$(read_with_exit "Reviewers [${def_reviewers}] ('q' — отмена) > " "false") || return 1
    if [[ "$input" == "-" ]]; then
        reviewers=""
    elif [[ -z "$input" ]]; then
        reviewers=$def_reviewers
    else
        reviewers=$(normalize_gitlab_usernames "$input")
    fi

    input=$(read_with_exit "Squash commits? (Enter = y, n — нет) ('q' — отмена) > " "false") || return 1
    if is_yes_answer "$input"; then
        squash="true"
    else
        squash="false"
    fi

    if [[ "$assignees" != "$def_assignees" || "$reviewers" != "$def_reviewers" || "$squash" != "$def_squash" ]]; then
        save_choice=$(read_with_exit "Сохранить как дефолты проекта? (Enter = y, n — нет) > " "false") || true
        if is_yes_answer "$save_choice"; then
            gitlab_mr_defaults_save "$assignees" "$reviewers" "$squash" >&2
        fi
    fi

    printf '%s\n%s\n%s\n' "$assignees" "$reviewers" "$squash"
}

# CSV usernames → JSON array of user ids (резолв @me и username через API)
gitlab_usernames_to_ids_json() {
    local host=$1
    local token=$2
    local usernames_csv=$3
    python3 - "$host" "$token" "$usernames_csv" <<'PYEOF'
import json, sys, urllib.request, urllib.error, urllib.parse

host, token, csv = sys.argv[1], sys.argv[2], sys.argv[3]
ids = []
for part in [p.strip() for p in csv.split(",") if p.strip()]:
    if part.lower() in ("@me", "me"):
        url = f"https://{host}/api/v4/user"
    else:
        name = part.lstrip("@")
        url = f"https://{host}/api/v4/users?username={urllib.parse.quote(name)}"
    req = urllib.request.Request(url, headers={"PRIVATE-TOKEN": token})
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.load(resp)
    except Exception as e:
        print(f"warn: не удалось резолвить {part}: {e}", file=sys.stderr)
        continue
    if part.lower() in ("@me", "me"):
        uid = data.get("id")
        if uid:
            ids.append(uid)
    elif isinstance(data, list) and data:
        ids.append(data[0]["id"])
    else:
        print(f"warn: пользователь не найден: {part}", file=sys.stderr)
print(json.dumps(ids))
PYEOF
}

# Создать MR через GitLab API (когда push options не срабатывают)
# $5 assignees CSV, $6 reviewers CSV, $7 squash true|false
gitlab_create_mr_via_api() {
    local source_branch=$1
    local target_branch=$2
    local title=$3
    local is_draft=$4
    local assignees_csv=${5-}
    local reviewers_csv=${6-}
    local squash
    squash=$(normalize_mr_squash "${7-true}")
    local web_base host project_path project_enc token api_url response http_code web_url
    local assignee_ids reviewer_ids payload

    web_base=$(gitlab_web_base_from_remote) || return 1
    host=${web_base#https://}
    host=${host%%/*}
    project_path=${web_base#https://$host/}
    project_enc=$(urlencode "$project_path")
    token=$(gitlab_api_token) || return 1

    assignee_ids='[]'
    reviewer_ids='[]'
    if [[ -n "$assignees_csv" ]]; then
        assignee_ids=$(gitlab_usernames_to_ids_json "$host" "$token" "$assignees_csv") || assignee_ids='[]'
    fi
    if [[ -n "$reviewers_csv" ]]; then
        reviewer_ids=$(gitlab_usernames_to_ids_json "$host" "$token" "$reviewers_csv") || reviewer_ids='[]'
    fi

    payload=$(ASSIGNEES="$assignee_ids" REVIEWERS="$reviewer_ids" SQUASH="$squash" python3 -c '
import json, os, sys
body = {
    "source_branch": sys.argv[1],
    "target_branch": sys.argv[2],
    "title": sys.argv[3],
    "draft": sys.argv[4] == "true",
    "squash": os.environ.get("SQUASH") == "true",
}
aids = json.loads(os.environ.get("ASSIGNEES") or "[]")
rids = json.loads(os.environ.get("REVIEWERS") or "[]")
if aids:
    body["assignee_ids"] = aids
if rids:
    body["reviewer_ids"] = rids
print(json.dumps(body))
' "$source_branch" "$target_branch" "$title" "$is_draft")

    api_url="https://${host}/api/v4/projects/${project_enc}/merge_requests"
    response=$(mktemp "${TMPDIR:-/tmp}/gitlab_mr.XXXXXX") || return 1
    http_code=$(curl -sS -o "$response" -w '%{http_code}' \
        --header "PRIVATE-TOKEN: ${token}" \
        --header "Content-Type: application/json" \
        --data "$payload" \
        "$api_url") || {
        rm -f "$response"
        return 1
    }

    if [[ "$http_code" != 201 && "$http_code" != 200 ]]; then
        echo "GitLab API ошибка HTTP $http_code:" >&2
        cat "$response" >&2
        echo >&2
        rm -f "$response"
        return 1
    fi

    web_url=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("web_url",""))' "$response")
    rm -f "$response"
    if [[ -n "$web_url" ]]; then
        echo "MR создан: $web_url"
        return 0
    fi
    return 1
}

# Добавить push options assign/reviewer из CSV usernames → GITLAB_MR_PEOPLE_PUSH_OPTS
gitlab_append_people_push_opts() {
    local assignees_csv=$1
    local reviewers_csv=$2
    local u
    local _people_opts
    local _assignee_arr
    local _reviewer_arr
    _people_opts=()

    if [[ -n "$assignees_csv" ]]; then
        IFS=',' read -r -a _assignee_arr <<< "$assignees_csv"
        for u in "${_assignee_arr[@]}"; do
            u=$(printf '%s' "$u" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//;s/^@//')
            [[ -z "$u" ]] && continue
            case "$u" in
                me|Me|ME) u=me ;;
            esac
            _people_opts[${#_people_opts[@]}]="-o"
            _people_opts[${#_people_opts[@]}]="merge_request.assign=${u}"
        done
    fi
    if [[ -n "$reviewers_csv" ]]; then
        IFS=',' read -r -a _reviewer_arr <<< "$reviewers_csv"
        for u in "${_reviewer_arr[@]}"; do
            u=$(printf '%s' "$u" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//;s/^@//')
            [[ -z "$u" ]] && continue
            case "$u" in
                me|Me|ME) u=me ;;
            esac
            _people_opts[${#_people_opts[@]}]="-o"
            _people_opts[${#_people_opts[@]}]="merge_request.reviewer=${u}"
        done
    fi
    GITLAB_MR_PEOPLE_PUSH_OPTS=("${_people_opts[@]}")
}

# Push с GitLab merge_request.* options
# $5 assignees CSV, $6 reviewers CSV, $7 squash true|false
gitlab_push_with_mr_options() {
    local current_branch=$1
    local target_branch=$2
    local mr_title=$3
    local is_draft=$4
    local assignees_csv=${5-}
    local reviewers_csv=${6-}
    local squash
    squash=$(normalize_mr_squash "${7-true}")
    local push_opts
    local push_out rc
    local GITLAB_MR_PEOPLE_PUSH_OPTS
    push_opts=()
    GITLAB_MR_PEOPLE_PUSH_OPTS=()

    push_opts=(-o merge_request.create -o "merge_request.target=$target_branch" -o "merge_request.title=$mr_title")
    if [[ "$is_draft" == "true" ]]; then
        push_opts[${#push_opts[@]}]="-o"
        push_opts[${#push_opts[@]}]="merge_request.draft"
    fi
    if [[ "$squash" == "true" ]]; then
        push_opts[${#push_opts[@]}]="-o"
        push_opts[${#push_opts[@]}]="merge_request.squash"
    fi
    gitlab_append_people_push_opts "$assignees_csv" "$reviewers_csv"
    if [[ ${#GITLAB_MR_PEOPLE_PUSH_OPTS[@]} -gt 0 ]]; then
        push_opts=("${push_opts[@]}" "${GITLAB_MR_PEOPLE_PUSH_OPTS[@]}")
    fi

    if branch_needs_force_push; then
        echo "Ветка разошлась с origin — force push с MR options..."
        push_opts=(--force "${push_opts[@]}")
    fi

    set +e
    if branch_has_upstream; then
        push_out=$(git push "${push_opts[@]}" 2>&1)
        rc=$?
    else
        push_out=$(git push --set-upstream origin "$current_branch" "${push_opts[@]}" 2>&1)
        rc=$?
    fi
    set -e

    if [[ -n "$push_out" ]]; then
        printf '%s\n' "$push_out"
    fi

    if [[ "$rc" -ne 0 ]]; then
        if [[ "${push_opts[0]}" != "--force" ]] && push_output_needs_force "$push_out"; then
            echo "Обычный push отклонён — пробую force push с MR options..."
            set +e
            if branch_has_upstream; then
                push_out=$(git push --force "${push_opts[@]}" 2>&1)
                rc=$?
            else
                push_out=$(git push --force --set-upstream origin "$current_branch" "${push_opts[@]}" 2>&1)
                rc=$?
            fi
            set -e
            if [[ -n "$push_out" ]]; then
                printf '%s\n' "$push_out"
            fi
        fi
    fi

    if [[ "$rc" -ne 0 ]]; then
        return 1
    fi
    if echo "$push_out" | grep -qi 'everything up-to-date'; then
        return 2
    fi
    return 0
}

# Создание MR: push options → API → пустой коммит + push options
gitlab_create_mr_without_glab() {
    local current_branch=$1
    local target_branch=$2
    local mr_title=$3
    local is_draft=$4
    local assignees_csv=${5-}
    local reviewers_csv=${6-}
    local squash
    squash=$(normalize_mr_squash "${7-true}")
    local push_rc empty_msg prefix

    echo "Создаю MR..."

    if ! branch_has_upstream || ! is_last_commit_pushed; then
        push_rc=0
        gitlab_push_with_mr_options "$current_branch" "$target_branch" "$mr_title" "$is_draft" \
            "$assignees_csv" "$reviewers_csv" "$squash" || push_rc=$?
        if [[ "$push_rc" -eq 0 ]]; then
            echo "Готово!"
            return 0
        fi
        if [[ "$push_rc" -eq 1 ]]; then
            return 1
        fi
    fi

    if gitlab_api_token >/dev/null 2>&1; then
        if gitlab_create_mr_via_api "$current_branch" "$target_branch" "$mr_title" "$is_draft" \
            "$assignees_csv" "$reviewers_csv" "$squash"; then
            echo "Готово!"
            return 0
        fi
    fi

    prefix=$(extract_prefix)
    if [[ -n "$prefix" ]]; then
        empty_msg="$prefix | create merge request"
    else
        empty_msg="chore: create merge request"
    fi
    echo "Ветка уже на origin — делаю пустой коммит для создания MR..."
    git commit --allow-empty -m "$empty_msg" || return 1
    push_rc=0
    gitlab_push_with_mr_options "$current_branch" "$target_branch" "$mr_title" "$is_draft" \
        "$assignees_csv" "$reviewers_csv" "$squash" || push_rc=$?
    if [[ "$push_rc" -eq 0 ]]; then
        echo "Готово!"
        return 0
    fi
    echo "Не удалось создать MR."
    return 1
}

# Снять Draft с открытого MR текущей ветки (glab → API)
gitlab_undraft_mr_current_branch() {
    local current_branch glab_bin web_base host project_path project_enc token
    local api_list api_url response http_code iid web_url draft_flag title py_rc

    current_branch=$(git branch --show-current)
    if [[ -z "$current_branch" ]]; then
        echo "Не удалось определить текущую ветку (detached HEAD?)."
        return 1
    fi

    echo "Снимаю Draft с MR ветки: $current_branch"

    glab_bin=$(resolve_glab_cli) || true
    if [[ -n "$glab_bin" ]]; then
        if "$glab_bin" mr update "$current_branch" --ready; then
            echo "Готово! Draft снят."
            return 0
        fi
        echo "glab не смог снять Draft — пробую API..."
    fi

    web_base=$(gitlab_web_base_from_remote) || {
        echo "Не удалось определить remote GitLab."
        return 1
    }
    host=${web_base#https://}
    host=${host%%/*}
    project_path=${web_base#https://$host/}
    project_enc=$(urlencode "$project_path")
    token=$(gitlab_api_token) || {
        echo "Нет GitLab token (GITLAB_TOKEN / glab config)."
        return 1
    }

    api_list="https://${host}/api/v4/projects/${project_enc}/merge_requests?state=opened&source_branch=$(urlencode "$current_branch")"
    response=$(mktemp "${TMPDIR:-/tmp}/gitlab_mr_list.XXXXXX") || return 1
    http_code=$(curl -sS -o "$response" -w '%{http_code}' \
        --header "PRIVATE-TOKEN: ${token}" \
        "$api_list") || {
        rm -f "$response"
        return 1
    }
    if [[ "$http_code" != 200 ]]; then
        echo "GitLab API ошибка HTTP $http_code (поиск MR):" >&2
        cat "$response" >&2
        echo >&2
        rm -f "$response"
        return 1
    fi

    iid=""
    py_rc=0
    iid=$(python3 -c '
import json, sys
data = json.load(open(sys.argv[1]))
if not isinstance(data, list) or not data:
    sys.exit(2)
mr = data[0]
print(mr.get("iid", ""))
' "$response") || py_rc=$?
    if [[ "$py_rc" -ne 0 ]]; then
        rm -f "$response"
        if [[ "$py_rc" -eq 2 ]]; then
            echo "Открытый MR для ветки «$current_branch» не найден."
        else
            echo "Не удалось разобрать ответ API."
        fi
        return 1
    fi
    draft_flag=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))[0].get("draft", False))' "$response")
    title=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))[0].get("title",""))' "$response")
    web_url=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))[0].get("web_url",""))' "$response")
    rm -f "$response"

    if [[ -z "$iid" ]]; then
        echo "Открытый MR для ветки «$current_branch» не найден."
        return 1
    fi

    if [[ "$draft_flag" != "True" && "$draft_flag" != "true" ]]; then
        echo "MR !${iid} уже не Draft: $title"
        [[ -n "$web_url" ]] && echo "$web_url"
        return 0
    fi

    api_url="https://${host}/api/v4/projects/${project_enc}/merge_requests/${iid}"
    response=$(mktemp "${TMPDIR:-/tmp}/gitlab_mr_ready.XXXXXX") || return 1
    http_code=$(curl -sS -o "$response" -w '%{http_code}' \
        --request PUT \
        --header "PRIVATE-TOKEN: ${token}" \
        --header "Content-Type: application/json" \
        --data '{"draft":false}' \
        "$api_url") || {
        rm -f "$response"
        return 1
    }
    if [[ "$http_code" != 200 ]]; then
        echo "GitLab API ошибка HTTP $http_code (снятие Draft):" >&2
        cat "$response" >&2
        echo >&2
        rm -f "$response"
        return 1
    fi
    web_url=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("web_url",""))' "$response")
    title=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("title",""))' "$response")
    rm -f "$response"
    echo "Готово! Draft снят с MR !${iid}: $title"
    [[ -n "$web_url" ]] && echo "$web_url"
    return 0
}

# Переименовать открытый MR текущей ветки (glab → API)
gitlab_rename_mr_current_branch() {
    local current_branch glab_bin web_base host project_path project_enc token
    local api_list api_url response http_code iid web_url title old_title suggest_title
    local task_prefix title_prefix mr_title py_rc json_title

    current_branch=$(git branch --show-current)
    if [[ -z "$current_branch" ]]; then
        echo "Не удалось определить текущую ветку (detached HEAD?)."
        return 1
    fi

    echo "Переименование MR ветки: $current_branch"
    echo "---------------------------------------------"

    # Сначала узнаём текущий title (glab view → API list)
    old_title=""
    iid=""
    web_url=""
    glab_bin=$(resolve_glab_cli) || true
    if [[ -n "$glab_bin" ]]; then
        old_title=$("$glab_bin" mr view "$current_branch" -F json 2>/dev/null | python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)
    print(data.get("title", "") or "")
except Exception:
    sys.exit(1)
' 2>/dev/null) || old_title=""
        if [[ -n "$old_title" ]]; then
            echo "Текущее название: $old_title"
        fi
    fi

    if [[ -z "$old_title" ]]; then
        web_base=$(gitlab_web_base_from_remote) || {
            echo "Не удалось определить remote GitLab."
            return 1
        }
        host=${web_base#https://}
        host=${host%%/*}
        project_path=${web_base#https://$host/}
        project_enc=$(urlencode "$project_path")
        token=$(gitlab_api_token) || {
            echo "Нет GitLab token (GITLAB_TOKEN / glab config)."
            return 1
        }

        api_list="https://${host}/api/v4/projects/${project_enc}/merge_requests?state=opened&source_branch=$(urlencode "$current_branch")"
        response=$(mktemp "${TMPDIR:-/tmp}/gitlab_mr_list.XXXXXX") || return 1
        http_code=$(curl -sS -o "$response" -w '%{http_code}' \
            --header "PRIVATE-TOKEN: ${token}" \
            "$api_list") || {
            rm -f "$response"
            return 1
        }
        if [[ "$http_code" != 200 ]]; then
            echo "GitLab API ошибка HTTP $http_code (поиск MR):" >&2
            cat "$response" >&2
            echo >&2
            rm -f "$response"
            return 1
        fi

        py_rc=0
        iid=$(python3 -c '
import json, sys
data = json.load(open(sys.argv[1]))
if not isinstance(data, list) or not data:
    sys.exit(2)
mr = data[0]
print(mr.get("iid", ""))
' "$response") || py_rc=$?
        if [[ "$py_rc" -ne 0 ]]; then
            rm -f "$response"
            if [[ "$py_rc" -eq 2 ]]; then
                echo "Открытый MR для ветки «$current_branch» не найден."
            else
                echo "Не удалось разобрать ответ API."
            fi
            return 1
        fi
        old_title=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))[0].get("title",""))' "$response")
        web_url=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))[0].get("web_url",""))' "$response")
        rm -f "$response"

        if [[ -z "$iid" ]]; then
            echo "Открытый MR для ветки «$current_branch» не найден."
            return 1
        fi
        echo "Текущее название: $old_title"
        echo "MR: !${iid}"
    fi

    # Название MR целиком как ввёл пользователь (можно сменить LA→SAM и т.п.).
    # «Draft: » в title НЕ добавляем — статус draft у MR сохраняется отдельно.
    # Автопрефикс из ветки — только если ввели текст без (LA|SAM|…)-N |
    task_prefix=$(extract_prefix)
    title_prefix=""
    if [[ -n "$task_prefix" ]]; then
        title_prefix="${task_prefix} | "
    fi

    suggest_title="$old_title"
    if [[ "$suggest_title" =~ ^[Dd]raft:[[:space:]]*(.*)$ ]]; then
        suggest_title="${BASH_REMATCH[1]}"
        suggest_title=$(printf '%s' "$suggest_title" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
    fi

    echo "---------------------------------------------"
    echo "Новое название — целиком (можно править префикс LA/SAM/…)."
    if [[ -n "$suggest_title" ]]; then
        mr_title=$(read_with_exit "Название MR ('q' — отмена) > " "false" "$suggest_title") || return
    else
        mr_title=$(read_with_exit "Название MR ('q' — отмена) > " "false") || return
    fi
    mr_title=$(printf '%s' "$mr_title" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
    if [[ "$mr_title" =~ ^[Dd]raft:[[:space:]]*(.*)$ ]]; then
        mr_title="${BASH_REMATCH[1]}"
        mr_title=$(printf '%s' "$mr_title" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
    fi
    # Без своего тикет-префикса — подставим из ветки (ввели только текст)
    if [[ -n "$title_prefix" ]] && ! [[ "$mr_title" =~ ^(LA|LIT|SAM|SA)-[0-9]+[[:space:]]*\| ]]; then
        mr_title="${title_prefix}${mr_title}"
    fi
    if [[ -z "$mr_title" ]]; then
        echo "Название MR не может быть пустым."
        return 1
    fi

    echo "---------------------------------------------"
    echo "Было:  $old_title"
    echo "Станет: $mr_title"
    echo "---------------------------------------------"

    if [[ -n "$glab_bin" ]]; then
        if "$glab_bin" mr update "$current_branch" --title "$mr_title"; then
            echo "Готово! MR переименован: $mr_title"
            return 0
        fi
        echo "glab не смог переименовать MR — пробую API..."
    fi

    if [[ -z "${host:-}" ]]; then
        web_base=$(gitlab_web_base_from_remote) || {
            echo "Не удалось определить remote GitLab."
            return 1
        }
        host=${web_base#https://}
        host=${host%%/*}
        project_path=${web_base#https://$host/}
        project_enc=$(urlencode "$project_path")
        token=$(gitlab_api_token) || {
            echo "Нет GitLab token (GITLAB_TOKEN / glab config)."
            return 1
        }
    fi

    if [[ -z "$iid" ]]; then
        api_list="https://${host}/api/v4/projects/${project_enc}/merge_requests?state=opened&source_branch=$(urlencode "$current_branch")"
        response=$(mktemp "${TMPDIR:-/tmp}/gitlab_mr_list.XXXXXX") || return 1
        http_code=$(curl -sS -o "$response" -w '%{http_code}' \
            --header "PRIVATE-TOKEN: ${token}" \
            "$api_list") || {
            rm -f "$response"
            return 1
        }
        if [[ "$http_code" != 200 ]]; then
            echo "GitLab API ошибка HTTP $http_code (поиск MR):" >&2
            cat "$response" >&2
            echo >&2
            rm -f "$response"
            return 1
        fi
        py_rc=0
        iid=$(python3 -c '
import json, sys
data = json.load(open(sys.argv[1]))
if not isinstance(data, list) or not data:
    sys.exit(2)
print(data[0].get("iid", ""))
' "$response") || py_rc=$?
        rm -f "$response"
        if [[ "$py_rc" -ne 0 || -z "$iid" ]]; then
            echo "Открытый MR для ветки «$current_branch» не найден."
            return 1
        fi
    fi

    json_title=$(python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$mr_title")
    api_url="https://${host}/api/v4/projects/${project_enc}/merge_requests/${iid}"
    response=$(mktemp "${TMPDIR:-/tmp}/gitlab_mr_rename.XXXXXX") || return 1
    http_code=$(curl -sS -o "$response" -w '%{http_code}' \
        --request PUT \
        --header "PRIVATE-TOKEN: ${token}" \
        --header "Content-Type: application/json" \
        --data "{\"title\":${json_title}}" \
        "$api_url") || {
        rm -f "$response"
        return 1
    }
    if [[ "$http_code" != 200 ]]; then
        echo "GitLab API ошибка HTTP $http_code (переименование MR):" >&2
        cat "$response" >&2
        echo >&2
        rm -f "$response"
        return 1
    fi
    web_url=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("web_url",""))' "$response")
    title=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("title",""))' "$response")
    rm -f "$response"
    echo "Готово! MR !${iid} переименован: $title"
    [[ -n "$web_url" ]] && echo "$web_url"
    return 0
}

# Поиск ближайшего MR по ключевым словам в title / source_branch
# Ввод: "YYYY M P key1, key2, ..." или "YYYY M-P key1, key2, ..."
# P — сколько месяцев добавить назад к YYYY/M (указанный месяц всегда включён):
#   2026 8 0 → только август 2026
#   2026 8 1 → август + июль 2026
#   2026 8 2 → август + июль + июнь 2026
# Период фильтруется по updated_at (updated_after / updated_before)
gitlab_search_mr_by_keywords() {
    local cur_year cur_month default_query input
    local year month period keywords_raw match_mode
    local web_base host project_path project_enc token
    local updated_after updated_before period_from_label period_to_label
    local page per_page api_list response http_code
    local match_json found py_rc

    cur_year=$(date +%Y)
    cur_month=$(date +%m)
    cur_month=$((10#$cur_month))
    default_query="${cur_year} ${cur_month} 1 key"

    echo "Поиск MR по ключевым словам"
    echo "Формат: YYYY M P key1, key2... (P — месяцев назад от M, M всегда включён)"
    echo "Пример: 2026 8 1 → август + июль 2026; 2026 8 0 → только август"
    echo "Ищем в названии MR, названии ветки; останавливаемся на первом совпадении."
    echo "Период — по дате обновления MR (updated_at)."
    input=$(read_with_exit "Запрос ('q' — отмена) > " "false" "$default_query") || return

    if [[ ! "$input" =~ ^([0-9]{4})[[:space:]]+([0-9]{1,2})[-[:space:]]+([0-9]+)[[:space:]]+(.+)$ ]]; then
        echo "Неверный формат. Пример: ${default_query}"
        echo "  или: 2026 8 5 auth, login"
        return 1
    fi
    year="${BASH_REMATCH[1]}"
    month="${BASH_REMATCH[2]}"
    period="${BASH_REMATCH[3]}"
    keywords_raw="${BASH_REMATCH[4]}"
    month=$((10#$month))
    period=$((10#$period))

    if [[ "$month" -lt 1 || "$month" -gt 12 ]]; then
        echo "Месяц должен быть от 1 до 12."
        return 1
    fi
    if [[ "$period" -lt 0 ]]; then
        echo "Период (месяцев назад) должен быть ≥ 0."
        return 1
    fi
    keywords_raw=$(echo "$keywords_raw" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
    if [[ -z "$keywords_raw" ]]; then
        echo "Укажите хотя бы одно ключевое слово."
        return 1
    fi

    echo "  1) искать совпадения (подстрока)"
    echo "  2) искать по слову целиком (без регистра)"
    match_mode=$(read_with_exit "Режим (1/2, Enter = 1, 'q' — отмена) > " "false" "1") || return
    case "$match_mode" in
        ""|1)
            match_mode="substring"
            ;;
        2)
            match_mode="whole"
            ;;
        *)
            echo "Неверный выбор: $match_mode (ожидалось 1 или 2)."
            return 1
            ;;
    esac

    # P месяцев назад от YYYY/M: начало окна = M - P
    updated_after=$(python3 -c '
import sys
y, m, p = int(sys.argv[1]), int(sys.argv[2]), int(sys.argv[3])
total = y * 12 + (m - 1) - p
sy, sm0 = divmod(total, 12)
print(f"{sy:04d}-{sm0 + 1:02d}-01T00:00:00Z")
' "$year" "$month" "$period") || return 1
    updated_before=$(python3 -c '
import sys
y, m = int(sys.argv[1]), int(sys.argv[2])
if m == 12:
    print(f"{y + 1:04d}-01-01T00:00:00Z")
else:
    print(f"{y:04d}-{m + 1:02d}-01T00:00:00Z")
' "$year" "$month") || return 1
    period_from_label=$(python3 -c '
import sys
y, m, p = int(sys.argv[1]), int(sys.argv[2]), int(sys.argv[3])
total = y * 12 + (m - 1) - p
sy, sm0 = divmod(total, 12)
print(f"{sy:04d}-{sm0 + 1:02d}")
' "$year" "$month" "$period") || return 1
    period_to_label=$(printf '%04d-%02d' "$year" "$month")

    web_base=$(gitlab_web_base_from_remote) || {
        echo "Не удалось определить remote GitLab."
        return 1
    }
    host=${web_base#https://}
    host=${host%%/*}
    project_path=${web_base#https://$host/}
    project_enc=$(urlencode "$project_path")
    token=$(gitlab_api_token) || {
        echo "Нет GitLab token (GITLAB_TOKEN / glab config)."
        return 1
    }

    if [[ "$period_from_label" == "$period_to_label" ]]; then
        echo "Период (updated_at): ${period_to_label} (включая)"
    else
        echo "Период (updated_at): ${period_to_label} … ${period_from_label} (включая, назад)"
    fi
    echo "Ключевые слова: $keywords_raw"
    if [[ "$match_mode" == "whole" ]]; then
        echo "Режим: слово целиком"
    else
        echo "Режим: совпадения (подстрока)"
    fi
    echo "Поиск…"

    per_page=50
    page=1
    found=0
    while true; do
        api_list="https://${host}/api/v4/projects/${project_enc}/merge_requests"
        api_list+="?state=all&order_by=updated_at&sort=desc&per_page=${per_page}&page=${page}"
        api_list+="&updated_after=$(urlencode "$updated_after")"
        api_list+="&updated_before=$(urlencode "$updated_before")"

        response=$(mktemp "${TMPDIR:-/tmp}/gitlab_mr_search.XXXXXX") || return 1
        http_code=$(curl -sS -o "$response" -w '%{http_code}' \
            --header "PRIVATE-TOKEN: ${token}" \
            "$api_list") || {
            rm -f "$response"
            return 1
        }
        if [[ "$http_code" != 200 ]]; then
            echo "GitLab API ошибка HTTP $http_code (поиск MR):" >&2
            cat "$response" >&2
            echo >&2
            rm -f "$response"
            return 1
        fi

        py_rc=0
        match_json=$(python3 -c '
import json, sys, re

data = json.load(open(sys.argv[1], encoding="utf-8"))
raw = sys.argv[2]
mode = sys.argv[3]
keys = [k.strip().lower() for k in re.split(r"[,]+", raw) if k.strip()]
if not keys:
    sys.exit(3)
if not isinstance(data, list):
    sys.exit(4)
if not data:
    sys.exit(2)

def matches(hay, key):
    if mode == "whole":
        return re.search(r"(?i)\b" + re.escape(key) + r"\b", hay) is not None
    return key in hay.lower()

for mr in data:
    title = (mr.get("title") or "")
    branch = (mr.get("source_branch") or "")
    hay = f"{title}\n{branch}"
    if any(matches(hay, k) for k in keys):
        print(json.dumps({
            "iid": mr.get("iid"),
            "title": title,
            "source_branch": branch,
            "state": mr.get("state") or "",
            "web_url": mr.get("web_url") or "",
            "updated_at": mr.get("updated_at") or "",
            "created_at": mr.get("created_at") or "",
        }, ensure_ascii=False))
        sys.exit(0)
sys.exit(1)
' "$response" "$keywords_raw" "$match_mode") || py_rc=$?
        rm -f "$response"

        if [[ "$py_rc" -eq 0 ]]; then
            found=1
            break
        fi
        if [[ "$py_rc" -eq 2 ]]; then
            # пустая страница — конец списка
            break
        fi
        if [[ "$py_rc" -eq 1 ]]; then
            # на странице нет совпадений — следующая
            page=$((page + 1))
            # защита от бесконечного цикла
            if [[ "$page" -gt 40 ]]; then
                break
            fi
            continue
        fi
        echo "Не удалось разобрать ответ API (код $py_rc)."
        return 1
    done

    if [[ "$found" -ne 1 ]]; then
        echo "MR по ключевым словам в указанном периоде не найден."
        return 1
    fi

    python3 -c '
import json, sys
mr = json.loads(sys.argv[1])
print("Найден MR !{iid}: {title}".format(iid=mr.get("iid"), title=mr.get("title")))
print("  ветка:  {0}".format(mr.get("source_branch")))
print("  state:  {0}".format(mr.get("state")))
print("  создан: {0}".format(mr.get("created_at")))
print("  обновлён: {0}".format(mr.get("updated_at")))
url = mr.get("web_url") or ""
if url:
    print(url)
' "$match_json"
    return 0
}

# Поиск ближайшего MR по ключевым словам в названиях коммитов MR
# Ввод и режимы совпадения — как у gitlab_search_mr_by_keywords (2m4)
# Период фильтруется по updated_at (updated_after / updated_before)
gitlab_search_mr_by_commit_keywords() {
    local cur_year cur_month default_query input
    local year month period keywords_raw match_mode
    local web_base host project_path project_enc token
    local updated_after updated_before period_from_label period_to_label
    local page per_page api_list response http_code
    local match_json found py_rc
    local mr_page_json mr_count mr_idx iid mr_meta
    local cpage c_per_page commits_resp commits_code commit_count
    local checked

    cur_year=$(date +%Y)
    cur_month=$(date +%m)
    cur_month=$((10#$cur_month))
    default_query="${cur_year} ${cur_month} 1 key"

    echo "Поиск MR по словам в названиях коммитов"
    echo "Формат: YYYY M P key1, key2... (P — месяцев назад от M, M всегда включён)"
    echo "Пример: 2026 8 1 → август + июль 2026; 2026 8 0 → только август"
    echo "Ищем в title коммитов MR; останавливаемся на первом совпадении."
    echo "Период — по дате обновления MR (updated_at)."
    input=$(read_with_exit "Запрос ('q' — отмена) > " "false" "$default_query") || return

    if [[ ! "$input" =~ ^([0-9]{4})[[:space:]]+([0-9]{1,2})[-[:space:]]+([0-9]+)[[:space:]]+(.+)$ ]]; then
        echo "Неверный формат. Пример: ${default_query}"
        echo "  или: 2026 8 5 auth, login"
        return 1
    fi
    year="${BASH_REMATCH[1]}"
    month="${BASH_REMATCH[2]}"
    period="${BASH_REMATCH[3]}"
    keywords_raw="${BASH_REMATCH[4]}"
    month=$((10#$month))
    period=$((10#$period))

    if [[ "$month" -lt 1 || "$month" -gt 12 ]]; then
        echo "Месяц должен быть от 1 до 12."
        return 1
    fi
    if [[ "$period" -lt 0 ]]; then
        echo "Период (месяцев назад) должен быть ≥ 0."
        return 1
    fi
    keywords_raw=$(echo "$keywords_raw" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
    if [[ -z "$keywords_raw" ]]; then
        echo "Укажите хотя бы одно ключевое слово."
        return 1
    fi

    echo "  1) искать совпадения (подстрока)"
    echo "  2) искать по слову целиком (без регистра)"
    match_mode=$(read_with_exit "Режим (1/2, Enter = 1, 'q' — отмена) > " "false" "1") || return
    case "$match_mode" in
        ""|1)
            match_mode="substring"
            ;;
        2)
            match_mode="whole"
            ;;
        *)
            echo "Неверный выбор: $match_mode (ожидалось 1 или 2)."
            return 1
            ;;
    esac

    # P месяцев назад от YYYY/M: начало окна = M - P
    updated_after=$(python3 -c '
import sys
y, m, p = int(sys.argv[1]), int(sys.argv[2]), int(sys.argv[3])
total = y * 12 + (m - 1) - p
sy, sm0 = divmod(total, 12)
print(f"{sy:04d}-{sm0 + 1:02d}-01T00:00:00Z")
' "$year" "$month" "$period") || return 1
    updated_before=$(python3 -c '
import sys
y, m = int(sys.argv[1]), int(sys.argv[2])
if m == 12:
    print(f"{y + 1:04d}-01-01T00:00:00Z")
else:
    print(f"{y:04d}-{m + 1:02d}-01T00:00:00Z")
' "$year" "$month") || return 1
    period_from_label=$(python3 -c '
import sys
y, m, p = int(sys.argv[1]), int(sys.argv[2]), int(sys.argv[3])
total = y * 12 + (m - 1) - p
sy, sm0 = divmod(total, 12)
print(f"{sy:04d}-{sm0 + 1:02d}")
' "$year" "$month" "$period") || return 1
    period_to_label=$(printf '%04d-%02d' "$year" "$month")

    web_base=$(gitlab_web_base_from_remote) || {
        echo "Не удалось определить remote GitLab."
        return 1
    }
    host=${web_base#https://}
    host=${host%%/*}
    project_path=${web_base#https://$host/}
    project_enc=$(urlencode "$project_path")
    token=$(gitlab_api_token) || {
        echo "Нет GitLab token (GITLAB_TOKEN / glab config)."
        return 1
    }

    if [[ "$period_from_label" == "$period_to_label" ]]; then
        echo "Период (updated_at): ${period_to_label} (включая)"
    else
        echo "Период (updated_at): ${period_to_label} … ${period_from_label} (включая, назад)"
    fi
    echo "Ключевые слова: $keywords_raw"
    if [[ "$match_mode" == "whole" ]]; then
        echo "Режим: слово целиком"
    else
        echo "Режим: совпадения (подстрока)"
    fi
    echo "Поиск (по коммитам MR — может занять время)…"

    per_page=50
    page=1
    found=0
    checked=0
    match_json=""
    while true; do
        api_list="https://${host}/api/v4/projects/${project_enc}/merge_requests"
        api_list+="?state=all&order_by=updated_at&sort=desc&per_page=${per_page}&page=${page}"
        api_list+="&updated_after=$(urlencode "$updated_after")"
        api_list+="&updated_before=$(urlencode "$updated_before")"

        response=$(mktemp "${TMPDIR:-/tmp}/gitlab_mr_search.XXXXXX") || return 1
        http_code=$(curl -sS -o "$response" -w '%{http_code}' \
            --header "PRIVATE-TOKEN: ${token}" \
            "$api_list") || {
            rm -f "$response"
            return 1
        }
        if [[ "$http_code" != 200 ]]; then
            echo "GitLab API ошибка HTTP $http_code (поиск MR):" >&2
            cat "$response" >&2
            echo >&2
            rm -f "$response"
            return 1
        fi

        py_rc=0
        mr_page_json=$(python3 -c '
import json, sys
data = json.load(open(sys.argv[1], encoding="utf-8"))
if not isinstance(data, list):
    sys.exit(4)
if not data:
    sys.exit(2)
print(json.dumps(data, ensure_ascii=False))
' "$response") || py_rc=$?
        rm -f "$response"

        if [[ "$py_rc" -eq 2 ]]; then
            break
        fi
        if [[ "$py_rc" -ne 0 ]]; then
            echo "Не удалось разобрать ответ API (код $py_rc)."
            return 1
        fi

        mr_count=$(python3 -c 'import json,sys; print(len(json.loads(sys.argv[1])))' "$mr_page_json")
        mr_idx=0
        while [[ "$mr_idx" -lt "$mr_count" ]]; do
            mr_meta=$(python3 -c '
import json, sys
mr = json.loads(sys.argv[1])[int(sys.argv[2])]
print(json.dumps({
    "iid": mr.get("iid"),
    "title": mr.get("title") or "",
    "source_branch": mr.get("source_branch") or "",
    "state": mr.get("state") or "",
    "web_url": mr.get("web_url") or "",
    "updated_at": mr.get("updated_at") or "",
    "created_at": mr.get("created_at") or "",
}, ensure_ascii=False))
' "$mr_page_json" "$mr_idx")
            iid=$(python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get("iid") or "")' "$mr_meta")
            mr_idx=$((mr_idx + 1))
            if [[ -z "$iid" ]]; then
                continue
            fi
            checked=$((checked + 1))
            printf '\r  проверено MR: %s (текущий !%s)…' "$checked" "$iid" >&2

            c_per_page=100
            cpage=1
            while true; do
                api_list="https://${host}/api/v4/projects/${project_enc}/merge_requests/${iid}/commits"
                api_list+="?per_page=${c_per_page}&page=${cpage}"
                commits_resp=$(mktemp "${TMPDIR:-/tmp}/gitlab_mr_commits.XXXXXX") || return 1
                commits_code=$(curl -sS -o "$commits_resp" -w '%{http_code}' \
                    --header "PRIVATE-TOKEN: ${token}" \
                    "$api_list") || {
                    rm -f "$commits_resp"
                    return 1
                }
                if [[ "$commits_code" != 200 ]]; then
                    echo >&2
                    echo "GitLab API ошибка HTTP $commits_code (коммиты MR !${iid}):" >&2
                    cat "$commits_resp" >&2
                    echo >&2
                    rm -f "$commits_resp"
                    return 1
                fi

                commit_count=$(python3 -c '
import json, sys
data = json.load(open(sys.argv[1], encoding="utf-8"))
if not isinstance(data, list):
    sys.exit(4)
print(len(data))
' "$commits_resp") || {
                    rm -f "$commits_resp"
                    echo >&2
                    echo "Не удалось разобрать коммиты MR !${iid}."
                    return 1
                }

                if [[ "$commit_count" -eq 0 ]]; then
                    rm -f "$commits_resp"
                    break
                fi

                py_rc=0
                match_json=$(python3 -c '
import json, sys, re

commits = json.load(open(sys.argv[1], encoding="utf-8"))
raw = sys.argv[2]
mode = sys.argv[3]
mr_meta = json.loads(sys.argv[4])
keys = [k.strip().lower() for k in re.split(r"[,]+", raw) if k.strip()]
if not keys:
    sys.exit(3)

def matches(hay, key):
    if mode == "whole":
        return re.search(r"(?i)\b" + re.escape(key) + r"\b", hay) is not None
    return key in hay.lower()

for c in commits:
    title = (c.get("title") or "")
    if any(matches(title, k) for k in keys):
        out = dict(mr_meta)
        out["commit_title"] = title
        out["commit_short_id"] = c.get("short_id") or ""
        print(json.dumps(out, ensure_ascii=False))
        sys.exit(0)
sys.exit(1)
' "$commits_resp" "$keywords_raw" "$match_mode" "$mr_meta") || py_rc=$?
                rm -f "$commits_resp"

                if [[ "$py_rc" -eq 0 ]]; then
                    found=1
                    break
                fi
                if [[ "$py_rc" -eq 1 ]]; then
                    if [[ "$commit_count" -lt "$c_per_page" || "$cpage" -ge 20 ]]; then
                        break
                    fi
                    cpage=$((cpage + 1))
                    continue
                fi
                echo >&2
                echo "Не удалось разобрать коммиты MR !${iid} (код $py_rc)."
                return 1
            done

            if [[ "$found" -eq 1 ]]; then
                break
            fi
        done

        if [[ "$found" -eq 1 ]]; then
            break
        fi

        page=$((page + 1))
        if [[ "$page" -gt 40 ]]; then
            break
        fi
        # если страница короче per_page — конец
        if [[ "$mr_count" -lt "$per_page" ]]; then
            break
        fi
    done

    echo >&2
    if [[ "$found" -ne 1 ]]; then
        echo "MR с совпадением в названиях коммитов за период не найден (проверено MR: $checked)."
        return 1
    fi

    python3 -c '
import json, sys
mr = json.loads(sys.argv[1])
print("Найден MR !{iid}: {title}".format(iid=mr.get("iid"), title=mr.get("title")))
print("  ветка:  {0}".format(mr.get("source_branch")))
print("  state:  {0}".format(mr.get("state")))
print("  коммит: {0} {1}".format(mr.get("commit_short_id") or "", mr.get("commit_title") or "").strip())
print("  создан: {0}".format(mr.get("created_at")))
print("  обновлён: {0}".format(mr.get("updated_at")))
url = mr.get("web_url") or ""
if url:
    print(url)
' "$match_json"
    return 0
}

# Подменю 10: статистика объёма / список merged MR (цепочки: 101, 102)
gitlab_mr_stats_menu() {
    local choice
    echo "MR за период"
    echo "  1) статистика объёма кода     (быстро: 101)"
    echo "  2) список merged MR           (быстро: 102)"
    echo "---------------------------------------------"
    choice=$(read_with_exit "Выбор (1/2, 'q' — отмена) > " "false") || return
    case "$choice" in
        1)
            gitlab_mr_code_volume_stats summary
            ;;
        2)
            gitlab_mr_code_volume_stats list
            ;;
        *)
            echo "Неверный выбор: $choice (ожидалось 1 или 2)."
            return 1
            ;;
    esac
}

# Статистика / список merged MR авторов за период месяцев
# mode: summary — только итоги (+/−/net); list — только список MR без статистики
# Шаг 1: @ник1, @ник2
# Шаг 2: 5-8 | 8 | 2025 5-8
gitlab_mr_code_volume_stats() {
    local mode=${1:-summary}
    local users_raw users_csv date_raw default_period
    local year from_month to_month cur_year cur_month cross_year
    local merged_after merged_before period_label
    local web_base host project_path token

    if [[ "$mode" == "list" ]]; then
        echo "Список merged MR"
    else
        mode="summary"
        echo "Статистика объёма кода по merged MR"
        echo "Считаем additions/deletions итогового diff каждого merged MR автора."
    fi
    echo "---------------------------------------------"

    users_raw=$(read_with_exit "Пользователи (@ник1, @ник2, 'q' — отмена) > " "false") || return
    users_csv=$(normalize_gitlab_usernames "$users_raw")
    if [[ -z "$users_csv" ]]; then
        echo "Укажите хотя бы один GitLab username."
        return 1
    fi

    cur_year=$(date +%Y)
    cur_month=$(date +%m)
    cur_month=$((10#$cur_month))
    # дефолт: предыдущий месяц … текущий (включительно), без ведущих нулей
    if [[ "$cur_month" -eq 1 ]]; then
        default_period="12-1"
    else
        default_period="$((cur_month - 1))-${cur_month}"
    fi
    echo "Период месяцев (включительно)."
    echo "  ${default_period} — предыдущий+текущий;  8 — только август;  ${cur_year} 5-8 — май–август года"
    date_raw=$(read_with_exit "Период (M-M или M, 'q' — отмена) > " "false" "$default_period") || return

    if [[ "$date_raw" =~ ^([0-9]{4})[[:space:]]+([0-9]{1,2})[[:space:]]*[-–—][[:space:]]*([0-9]{1,2})$ ]]; then
        # 2025 5-8
        year="${BASH_REMATCH[1]}"
        from_month="${BASH_REMATCH[2]}"
        to_month="${BASH_REMATCH[3]}"
    elif [[ "$date_raw" =~ ^([0-9]{4})[[:space:]]+([0-9]{1,2})$ ]]; then
        # 2025 8 — только один месяц указанного года
        year="${BASH_REMATCH[1]}"
        from_month="${BASH_REMATCH[2]}"
        to_month="${BASH_REMATCH[2]}"
    elif [[ "$date_raw" =~ ^([0-9]{1,2})[[:space:]]*[-–—][[:space:]]*([0-9]{1,2})$ ]]; then
        # 5-8
        year="$cur_year"
        from_month="${BASH_REMATCH[1]}"
        to_month="${BASH_REMATCH[2]}"
    elif [[ "$date_raw" =~ ^([0-9]{1,2})$ ]]; then
        # 8 — только один месяц текущего года
        year="$cur_year"
        from_month="${BASH_REMATCH[1]}"
        to_month="${BASH_REMATCH[1]}"
    else
        echo "Неверный формат. Пример: ${default_period}  |  8  |  ${cur_year} 5-8"
        return 1
    fi
    from_month=$((10#$from_month))
    to_month=$((10#$to_month))
    if [[ "$from_month" -lt 1 || "$from_month" -gt 12 || "$to_month" -lt 1 || "$to_month" -gt 12 ]]; then
        echo "Месяцы должны быть от 1 до 12."
        return 1
    fi

    # Переход через год: 12-1 → декабрь (year-1) … январь (year)
    cross_year=0
    if [[ "$from_month" -gt "$to_month" ]]; then
        if [[ "$from_month" -eq 12 && "$to_month" -eq 1 ]]; then
            cross_year=1
        else
            echo "Начало периода (${from_month}) больше конца (${to_month}). Укажите диапазон в одном году или 12-1."
            return 1
        fi
    fi

    if [[ "$cross_year" -eq 1 ]]; then
        merged_after=$(printf '%04d-12-01T00:00:00Z' "$((year - 1))")
        merged_before=$(printf '%04d-02-01T00:00:00Z' "$year")
        period_label="$((year - 1))-12 … ${year}-1"
    else
        merged_after=$(printf '%04d-%02d-01T00:00:00Z' "$year" "$from_month")
        # mergedBefore в GraphQL — граница «до» (не включая): следующий месяц после to
        merged_before=$(python3 -c '
import sys
y, m = int(sys.argv[1]), int(sys.argv[2])
if m == 12:
    print(f"{y + 1:04d}-01-01T00:00:00Z")
else:
    print(f"{y:04d}-{m + 1:02d}-01T00:00:00Z")
' "$year" "$to_month") || return 1
        if [[ "$from_month" -eq "$to_month" ]]; then
            period_label="${year}-${from_month}"
        else
            period_label="${year}-${from_month} … ${year}-${to_month}"
        fi
    fi

    web_base=$(gitlab_web_base_from_remote) || {
        echo "Не удалось определить remote GitLab."
        return 1
    }
    host=${web_base#https://}
    host=${host%%/*}
    project_path=${web_base#https://$host/}
    token=$(gitlab_api_token) || {
        echo "Нет GitLab token (GITLAB_TOKEN / glab config)."
        return 1
    }

    echo "Проект: ${project_path}"
    echo "Период (merged_at): ${period_label} (включая)"
    echo "Пользователи: ${users_csv}"
    echo "Загрузка…"

    python3 - "$host" "$token" "$project_path" "$users_csv" "$merged_after" "$merged_before" "$mode" <<'PYEOF'
import json, sys, urllib.parse, urllib.request

host, token, project_path, users_csv, merged_after, merged_before, mode = sys.argv[1:8]
graphql_url = f"https://{host}/api/graphql"
want_stats = mode != "list"

def api_get(url):
    req = urllib.request.Request(url, headers={"PRIVATE-TOKEN": token})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.load(resp)

def resolve_username(raw):
    name = raw.strip()
    if not name:
        return None
    if name.lower() in ("@me", "me"):
        me = api_get(f"https://{host}/api/v4/user")
        return me.get("username")
    name = name.lstrip("@")
    users = api_get(f"https://{host}/api/v4/users?username={urllib.parse.quote(name)}")
    if isinstance(users, list) and users:
        return users[0].get("username") or name
    return name

stats_fields = "diffStatsSummary { additions deletions fileCount }" if want_stats else ""
QUERY = f"""
query($path: ID!, $user: String!, $after: Time, $before: Time, $cursor: String) {{
  project(fullPath: $path) {{
    mergeRequests(
      authorUsername: $user
      state: merged
      mergedAfter: $after
      mergedBefore: $before
      first: 50
      after: $cursor
    ) {{
      pageInfo {{ hasNextPage endCursor }}
      nodes {{
        iid
        title
        mergedAt
        {stats_fields}
      }}
    }}
  }}
}}
"""

def gql(variables):
    payload = json.dumps({"query": QUERY, "variables": variables}).encode("utf-8")
    req = urllib.request.Request(
        graphql_url,
        data=payload,
        headers={
            "PRIVATE-TOKEN": token,
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        body = json.load(resp)
    if body.get("errors"):
        msgs = "; ".join(
            (e.get("message") or str(e)) for e in body["errors"]
        )
        raise RuntimeError(msgs)
    return body.get("data") or {}

def fetch_mrs(username):
    nodes = []
    cursor = None
    while True:
        data = gql({
            "path": project_path,
            "user": username,
            "after": merged_after,
            "before": merged_before,
            "cursor": cursor,
        })
        project = data.get("project")
        if project is None:
            raise RuntimeError(f"Проект не найден: {project_path}")
        conn = (project.get("mergeRequests") or {})
        nodes.extend(conn.get("nodes") or [])
        page = conn.get("pageInfo") or {}
        if not page.get("hasNextPage"):
            break
        cursor = page.get("endCursor")
        if not cursor:
            break
    return nodes

def fmt_k(n):
    """24722 → ~24,7k; 450 → ~450; -104 → ~ -104"""
    n = int(n)
    abs_n = abs(n)
    prefix = "~ -" if n < 0 else "~"
    if abs_n < 1000:
        return f"{prefix}{abs_n}"
    val = abs_n / 1000.0
    if abs_n >= 100000:
        text = f"{val:.0f}"
    else:
        text = f"{val:.1f}".rstrip("0").rstrip(".")
    text = text.replace(".", ",")
    return f"{prefix}{text}k"

def fmt_summary(mr_count, added, deleted):
    net = added - deleted
    return (
        f"MR: {mr_count} | строк добавлено: {fmt_k(added)} | "
        f"удалено: {fmt_k(deleted)} | чистый прирост: {fmt_k(net)}"
    )

grand_mrs = 0
grand_add = 0
grand_del = 0
usernames = []
for part in users_csv.split(","):
    part = part.strip()
    if not part:
        continue
    try:
        u = resolve_username(part)
    except Exception as e:
        print(f"\nНе удалось резолвить пользователя {part}: {e}", file=sys.stderr)
        sys.exit(1)
    if u:
        usernames.append(u)

if not usernames:
    print("Нет пользователей для запроса.")
    sys.exit(1)

for username in usernames:
    print()
    print(f"=== @{username} ===")
    try:
        mrs = fetch_mrs(username)
    except Exception as e:
        print(f"Ошибка GraphQL для @{username}: {e}", file=sys.stderr)
        sys.exit(1)

    if not mrs:
        print("  (merged MR за период нет)")
        continue

    mrs.sort(key=lambda m: m.get("mergedAt") or "")
    u_add = u_del = 0
    list_rows = []
    for mr in mrs:
        title = (mr.get("title") or "").replace("\n", " ").strip()
        merged = (mr.get("mergedAt") or "")[:10]
        if want_stats:
            stats = mr.get("diffStatsSummary") or {}
            add = int(stats.get("additions") or 0)
            delete = int(stats.get("deletions") or 0)
            u_add += add
            u_del += delete
        else:
            if " | " in title:
                ticket, rest = title.split(" | ", 1)
            else:
                ticket, rest = "", title
            list_rows.append((merged, ticket.strip(), rest.strip()))

    if want_stats:
        print(f"  {fmt_summary(len(mrs), u_add, u_del)}")
        grand_mrs += len(mrs)
        grand_add += u_add
        grand_del += u_del
    else:
        ticket_w = max((len(t) for _, t, _ in list_rows), default=0)
        for merged, ticket, rest in list_rows:
            if ticket:
                print(f"  {merged}  {ticket:<{ticket_w}} | {rest}")
            else:
                print(f"  {merged}  {rest}")
        print(f"  ----")
        print(f"  MR: {len(mrs)}")
        grand_mrs += len(mrs)

if want_stats:
    print()
    print("=== Итого ===")
    print(fmt_summary(grand_mrs, grand_add, grand_del))
    print("(это объём diff merged MR, не «символы, набранные руками»; lock/gen могут раздувать цифры)")
PYEOF
}

# Подменю 2m: создать MR / снять Draft / переименовать / поиск (цепочки: 2m1..2m5)
git_merge_request_menu() {
    local choice
    echo "Merge Request"
    echo "  1) создать MR                 (быстро: 2m1)"
    echo "  2) снять Draft                (быстро: 2m2)"
    echo "  3) переименовать MR           (быстро: 2m3)"
    echo "  4) поиск MR по словам         (быстро: 2m4)"
    echo "  5) поиск MR по словам коммитов (быстро: 2m5)"
    echo "---------------------------------------------"
    choice=$(read_with_exit "Выбор (1/2/3/4/5, Enter = 1, 'q' — отмена) > " "false") || return
    case "$choice" in
        ""|1)
            git_create_merge_request
            ;;
        2)
            gitlab_undraft_mr_current_branch
            ;;
        3)
            gitlab_rename_mr_current_branch
            ;;
        4)
            gitlab_search_mr_by_keywords
            ;;
        5)
            gitlab_search_mr_by_commit_keywords
            ;;
        *)
            echo "Неверный выбор: $choice (ожидалось 1, 2, 3, 4 или 5)."
            return 1
            ;;
    esac
}

# Создание Merge Request в GitLab (команда 2m → 1)
git_create_merge_request() {
    local current_branch parent target_branch mr_title draft_input is_draft
    local branches=()
    local branch input idx task_prefix title_prefix mr_body
    local glab_bin glab_args
    local mr_people assignees_csv reviewers_csv squash u defaults_path
    local _glab_assignees _glab_reviewers
    glab_args=()

    current_branch=$(git branch --show-current)
    if [[ -z "$current_branch" ]]; then
        echo "Не удалось определить текущую ветку (detached HEAD?)."
        return 1
    fi

    ensure_committed_before_push || return 1

    parent=$(detect_parent_branch) || true
    if [[ -z "$parent" ]]; then
        parent="development"
    fi

    echo "Создание Merge Request"
    echo "Текущая ветка (source): $current_branch"
    echo "Рекомендуемая целевая (parent): $parent"
    echo "---------------------------------------------"
    echo "Доступные ветки (dev + 3 недавно обновлённых):"

    while IFS= read -r branch; do
        [[ -z "$branch" ]] && continue
        branches+=("$branch")
        idx=${#branches[@]}
        if [[ "$branch" == "$parent" ]]; then
            echo "  $idx) $branch  ← рекомендуется"
        elif [[ "$branch" == "development" || "$branch" == "dev" ]]; then
            echo "  $idx) $branch  ← dev"
        else
            echo "  $idx) $branch"
        fi
    done <<EOF
$(collect_mr_target_branches "$current_branch" "$parent")
EOF

    if [[ ${#branches[@]} -eq 0 ]]; then
        echo "  (подходящих локальных веток нет)"
    fi
    echo "  — или введите имя своей ветки"
    echo "---------------------------------------------"
    echo "Enter — принять «$parent»; номер из списка; или имя ветки"
    input=$(read_with_exit "Целевая ветка MR ('q' — отмена) > " "false") || return

    if [[ -z "$input" ]]; then
        target_branch=$parent
    elif [[ "$input" =~ ^[0-9]+$ ]]; then
        if [[ "$input" -lt 1 || "$input" -gt ${#branches[@]} ]]; then
            echo "Неверный номер ветки: $input"
            return 1
        fi
        target_branch=${branches[$((input - 1))]}
    else
        target_branch=${input#origin/}
    fi

    if [[ -z "$target_branch" ]]; then
        echo "Целевая ветка не задана."
        return 1
    fi
    if [[ "$target_branch" == "$current_branch" ]]; then
        echo "Целевая ветка совпадает с текущей — MR создать нельзя."
        return 1
    fi

    echo "Целевая ветка: $target_branch"
    echo "---------------------------------------------"

    draft_input=$(read_with_exit "Черновик (draft)? (Enter = y, n — нет) > " "false") || return
    is_draft=false
    if is_yes_answer "$draft_input"; then
        is_draft=true
    fi

    # Название MR: всегда вручную (без Cursor). Автоматически только префикс SAM-/LA-/…
    # «Draft: » в title НЕ добавляем — его подставляет GitLab по флагу draft/--draft
    task_prefix=$(extract_prefix)
    title_prefix=""
    if [[ -n "$task_prefix" ]]; then
        title_prefix="${task_prefix} | "
    fi

    echo "Название MR вводится вручную (Cursor не используется)."
    if [[ -n "$title_prefix" ]]; then
        echo "Префикс (подставится сам): ${title_prefix}"
        mr_body=$(read_with_exit "Текст названия ('q' — отмена) > " "false") || return
    else
        mr_body=$(read_with_exit "Название MR ('q' — отмена) > " "false") || return
    fi
    mr_body=$(printf '%s' "$mr_body" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
    # Если пользователь всё же ввёл префикс сам — не дублируем
    if [[ -n "$task_prefix" ]] && [[ "$mr_body" =~ ^([Dd]raft:[[:space:]]*)?(LA|LIT|SAM|SA)-[0-9]+[[:space:]]*\|[[:space:]]*(.*)$ ]]; then
        mr_body="${BASH_REMATCH[3]}"
        mr_body=$(printf '%s' "$mr_body" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
    elif [[ "$mr_body" =~ ^[Dd]raft:[[:space:]]*(.*)$ ]]; then
        # GitLab сам добавит Draft: при is_draft; убираем, если ввели вручную
        mr_body="${BASH_REMATCH[1]}"
        mr_body=$(printf '%s' "$mr_body" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
    fi
    if [[ -z "$mr_body" ]]; then
        echo "Название MR не может быть пустым — введите текст названия."
        return 1
    fi
    mr_title="${title_prefix}${mr_body}"

    echo "---------------------------------------------"
    defaults_path=$(gitlab_mr_defaults_path) || defaults_path=""
    if [[ -n "$defaults_path" && -f "$defaults_path" ]]; then
        mr_people=$(gitlab_mr_defaults_load) || mr_people=$'\n\ntrue'
        assignees_csv=$(printf '%s' "$mr_people" | sed -n '1p')
        reviewers_csv=$(printf '%s' "$mr_people" | sed -n '2p')
        squash=$(printf '%s' "$mr_people" | sed -n '3p')
        squash=$(normalize_mr_squash "$squash")
        echo "Дефолты из .gitlab/mr_defaults (без запроса):"
        echo "  Assignees: ${assignees_csv:-(нет)}"
        echo "  Reviewers: ${reviewers_csv:-(нет)}"
        echo "  Squash:    $squash"
    else
        echo "Файл .gitlab/mr_defaults не найден — спросим assignees / reviewers / squash."
        mr_people=$(prompt_mr_assignees_reviewers) || return
        assignees_csv=$(printf '%s' "$mr_people" | sed -n '1p')
        reviewers_csv=$(printf '%s' "$mr_people" | sed -n '2p')
        squash=$(printf '%s' "$mr_people" | sed -n '3p')
        squash=$(normalize_mr_squash "$squash")
    fi

    echo "---------------------------------------------"
    echo "Source:    $current_branch"
    echo "Target:    $target_branch"
    if [[ "$is_draft" == "true" ]]; then
        echo "Title:     Draft: $mr_title"
    else
        echo "Title:     $mr_title"
    fi
    echo "Draft:     $is_draft"
    echo "Assignees: ${assignees_csv:-(нет)}"
    echo "Reviewers: ${reviewers_csv:-(нет)}"
    echo "Squash:    $squash"
    echo "---------------------------------------------"

    glab_bin=$(resolve_glab_cli) || true
    if [[ -n "$glab_bin" ]]; then
        echo "Создаю MR через glab..."
        if ! branch_has_upstream || ! is_last_commit_pushed; then
            echo "Пушу текущую ветку перед созданием MR..."
            if branch_has_upstream; then
                git_push_try_normal_then_force || true
            else
                git_push_try_normal_then_force --set-upstream origin "$current_branch" || true
            fi
        fi
        # --description "" + --no-editor: не спрашивать и не открывать editor для description
        glab_args=(mr create --source-branch "$current_branch" --target-branch "$target_branch" --title "$mr_title" --description "" --no-editor --yes)
        if [[ "$is_draft" == "true" ]]; then
            glab_args+=(--draft)
        fi
        if [[ "$squash" == "true" ]]; then
            glab_args+=(--squash-before-merge)
        else
            glab_args+=(--squash-before-merge=false)
        fi
        if [[ -n "$assignees_csv" ]]; then
            IFS=',' read -r -a _glab_assignees <<< "$assignees_csv"
            for u in "${_glab_assignees[@]}"; do
                u=$(printf '%s' "$u" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
                [[ -z "$u" ]] && continue
                glab_args+=(--assignee "$u")
            done
        fi
        if [[ -n "$reviewers_csv" ]]; then
            IFS=',' read -r -a _glab_reviewers <<< "$reviewers_csv"
            for u in "${_glab_reviewers[@]}"; do
                u=$(printf '%s' "$u" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
                [[ -z "$u" ]] && continue
                glab_args+=(--reviewer "$u")
            done
        fi
        if "$glab_bin" "${glab_args[@]}"; then
            echo "Готово!"
            return 0
        fi
        echo "glab не смог создать MR — пробую другой способ..."
    fi

    gitlab_create_mr_without_glab "$current_branch" "$target_branch" "$mr_title" "$is_draft" \
        "$assignees_csv" "$reviewers_csv" "$squash"
}

# Функция для выполнения git push --force
git_push_force() {
    ensure_committed_before_push || return 1

    echo "Выполняю git push --force..."
    git push --force
    echo "Готово!"
}

# Локальные ветки без обновлений > 1 месяца (по reflog, иначе по tip-коммиту).
# Текущую и базовые (master/main/development/dev) не трогаем.
git_delete_stale_local_branches() {
    local current_branch answer branch ts now cutoff deleted=0
    local -a stale=()

    current_branch=$(git branch --show-current 2>/dev/null) || true
    now=$(date +%s)
    cutoff=$((now - 30 * 24 * 60 * 60))

    while IFS= read -r branch; do
        [[ -z "$branch" ]] && continue
        [[ "$branch" == "$current_branch" ]] && continue
        case "$branch" in
            master|main|development|devel|dev) continue ;;
        esac
        ts=$(git reflog show -1 --format='%ct' "$branch" 2>/dev/null) || true
        if [[ -z "$ts" ]]; then
            ts=$(git log -1 --format='%ct' "$branch" 2>/dev/null) || ts=0
        fi
        if [[ "$ts" -lt "$cutoff" ]]; then
            stale+=("$branch")
        fi
    done <<EOF
$(git for-each-ref --format='%(refname:short)' refs/heads/)
EOF

    if [[ ${#stale[@]} -eq 0 ]]; then
        return 0
    fi

    echo "Локальные ветки без обновлений более 1 месяца (${#stale[@]}):"
    for branch in "${stale[@]}"; do
        echo "  - $branch"
    done

    answer=$(read_with_exit "Удалить старые ветки (Enter — пропустить, d — удалить) > " "false") || return 0
    if [[ "$answer" != "d" && "$answer" != "D" ]]; then
        echo "Пропущено."
        return 0
    fi

    for branch in "${stale[@]}"; do
        if git branch -D "$branch"; then
            echo "Удалена: $branch"
            deleted=$((deleted + 1))
        else
            echo "Не удалось удалить: $branch"
        fi
    done
    echo "Удалено веток: $deleted"
}

# git pull (текущая ветка, upstream или origin) + prune origin
git_pull() {
    echo "Выполняю git pull..."
    git pull
    echo "Готово!"
    git_remote_prune
    git_delete_stale_local_branches
}

# Функция для выполнения git rebase
git_rebase() {
    echo "1) Ребейз fetch родительская ветка (авто)"
    echo "2) Ребейз fetch development"
    echo "3) Ребейз fetch на другую ветку"
    echo "4) Отменить ребейз"
    echo "q) Выйти"
    echo "---------------------------------------------"
    local choice
    choice=$(read_with_exit "Выбор команды ('q' для отмены) > " "false") || return

    case $choice in
        1)
            git_rebase_parent
            ;;
        2)
            git_rebase_onto "development"
            ;;
        3)
            echo "Доступные ветки:"
            git branch -a
            echo "---------------------------------------------"
            local branch
            branch=$(read_with_exit "Введите название ветки (или 'q' для отмены): " "false") || return
            git_rebase_onto "$branch"
            ;;
        4)
            echo "Выполняю git rebase --abort..."
            git rebase --abort || echo "Нет активного rebase для отмены."
            ;;
        q)
            return
            ;;
        *)
            echo "Неверный выбор. Пожалуйста, попробуйте снова."
            git_rebase
            ;;
    esac
    echo "Готово!"
}

# --- smart rebase (5s): ТЕСТОВЫЙ, не гарантировано ---

git_rebase_in_progress() {
    local git_dir
    git_dir=$(git rev-parse --git-dir 2>/dev/null) || return 1
    [[ -d "$git_dir/rebase-merge" || -d "$git_dir/rebase-apply" ]]
}

git_rebase_list_unmerged() {
    git diff --name-only --diff-filter=U 2>/dev/null
}

git_file_has_conflict_markers() {
    local file=$1
    [[ -f "$file" ]] || return 1
    grep -qE '^(<<<<<<<|=======|>>>>>>>)' "$file" 2>/dev/null
}

# Файлы, которые agent не должен трогать автоматически (return 0 = skip)
git_smart_rebase_should_skip_file() {
    local file=$1
    local base
    base=$(basename "$file")

    case "$base" in
        Podfile.lock|pubspec.lock|package-lock.json|yarn.lock|Gemfile.lock|Cargo.lock)
            return 0
            ;;
    esac
    case "$file" in
        *.g.dart|*.freezed.dart|*.mocks.dart|*.pb.dart|*.pbenum.dart|*.pbjson.dart)
            return 0
            ;;
    esac

    # Бинарные / нетекстовые
    if [[ -f "$file" ]] && ! grep -qI '' "$file" 2>/dev/null; then
        return 0
    fi
    return 1
}

# Разрешить один конфликтный файл через Cursor Agent (model=auto).
# При rebase: ours = база (родитель), theirs = коммит текущей ветки.
git_smart_rebase_resolve_file() {
    local file=$1
    local tmp_out prompt
    local repo_root

    repo_root=$(git rev-parse --show-toplevel 2>/dev/null) || return 1

    if [[ ! -f "$file" ]]; then
        echo "Файл отсутствует в рабочей копии: $file" >&2
        return 1
    fi

    prompt=$(
        cat <<EOF
Ты разрешаешь git-конфликт во время REBASE в репозитории Litnet SuperApp (Flutter/Dart).

Файл: ${file}
Workspace: ${repo_root}

ВАЖНО про ours/theirs при rebase (не как при merge):
- «ours» / сторона базы = ветка, НА которую ребейзят (родитель / development) — её логику НЕ откатывать.
- «theirs» / сторона коммита = коммит ТЕКУЩЕЙ (feature) ветки, который накладывается — её логику СОХРАНИТЬ.

Задача (семантический merge, не выбор одной стороны целиком):
1. Сохранить намерение базы (багфиксы, рефакторинг API, DI, правки родителя).
2. Сохранить намерение feature (новая логика текущей ветки).
3. Убрать все маркеры <<<<<<< ======= >>>>>>>.
4. Править ТОЛЬКО этот файл. Не рефакторить «заодно», не трогать другие файлы.
5. Если не уверен, что склейка корректна — НЕ удаляй маркеры и не «угадывай»; оставь конфликт как есть.

Не переспрашивай. Внеси правки в файл напрямую.
EOF
    )

    tmp_out=$(mktemp "${TMPDIR:-/tmp}/smart_rebase_agent.XXXXXX") || return 1
    echo "Agent (auto) разрешает конфликт: $file ..."
    if ! review_run_agent_apply "auto" "$prompt" "$tmp_out"; then
        rm -f "$tmp_out"
        return 1
    fi
    rm -f "$tmp_out"

    if git_file_has_conflict_markers "$file"; then
        echo "После agent в $file остались маркеры конфликта." >&2
        return 1
    fi
    return 0
}

# Конфликты сняты и можно делать rebase --continue?
git_smart_rebase_ready_to_continue() {
    local file
    local has_unmerged=0

    while IFS= read -r file; do
        [[ -z "$file" ]] && continue
        has_unmerged=1
        echo "  ещё unmerged: $file"
    done <<EOF
$(git_rebase_list_unmerged)
EOF

    if [[ "$has_unmerged" -eq 1 ]]; then
        echo "Сначала разрешите конфликты и выполните: git add <файлы>"
        return 1
    fi

    set +e
    git diff --check >/dev/null 2>&1
    local wt_check=$?
    git diff --cached --check >/dev/null 2>&1
    local idx_check=$?
    set -e

    if [[ "$wt_check" -ne 0 || "$idx_check" -ne 0 ]]; then
        echo "Остались маркеры конфликта (<<<<<<< / ======= / >>>>>>>)."
        echo "Уберите их, git add, затем снова выберите «продолжить»."
        return 1
    fi
    return 0
}

# Пауза при неудаче agent: пользователь решает, что делать.
# return 0 — конфликты сняты, можно rebase --continue и дальше по циклу
# return 1 — rebase abort выполнен
# return 2 — остановить smart rebase, состояние rebase не трогать
git_smart_rebase_pause_for_manual() {
    local reason=$1
    shift
    local f choice

    echo "---------------------------------------------"
    echo "Smart rebase: автоматическое разрешение не удалось."
    echo "Причина: $reason"
    if [[ "$#" -gt 0 ]]; then
        echo "Файлы:"
        for f in "$@"; do
            echo "  - $f"
        done
    else
        echo "Конфликтные файлы сейчас:"
        git_rebase_list_unmerged | while IFS= read -r f; do
            [[ -n "$f" ]] && echo "  - $f"
        done
    fi
    echo "---------------------------------------------"

    while true; do
        if ! git_rebase_in_progress; then
            echo "Rebase уже не активен — выходим из паузы."
            return 2
        fi

        echo "1) Откатить rebase (git rebase --abort)"
        echo "2) Конфликты решены вручную — проверить и продолжить smart rebase"
        echo "3) Остановить и выйти (rebase остаётся как есть)"
        echo "---------------------------------------------"
        choice=$(read_with_exit "Выбор ('q' = как пункт 3) > " "false") || return 2

        case $choice in
            1)
                echo "Выполняю git rebase --abort..."
                set +e
                git rebase --abort
                set -e
                echo "Rebase отменён."
                return 1
                ;;
            2)
                echo "Проверяю, что конфликты сняты..."
                if git_smart_rebase_ready_to_continue; then
                    echo "Конфликтов нет — продолжаем smart rebase."
                    return 0
                fi
                echo "Ещё есть нерешённые конфликты. Исправьте файлы, git add, затем снова 2)."
                ;;
            3|q)
                echo "Остановка. Rebase оставлен как есть (можно позже: git rebase --continue / --abort)."
                return 2
                ;;
            *)
                echo "Неверный выбор: $choice"
                ;;
        esac
    done
}

# return 0 — продолжить цикл (--continue / следующий agent-раунд)
# return 1 — выйти из smart rebase в главное меню скрипта
git_smart_rebase_after_pause() {
    local pause_rc=$1
    if [[ "$pause_rc" -eq 0 ]]; then
        return 0
    fi
    # 1 = abort, 2 = stop — в обоих случаях возвращаемся в меню sh_gitlab
    return 1
}

# fetch + rebase + цикл agent-resolve.
# При провале agent — меню: abort / ручное продолжение / выход (скрипт не завершается).
git_smart_rebase_onto() {
    local branch=$1
    local max_rounds=40
    local round=0
    local rc=0
    local pause_rc=0
    local file
    local -a failed=()
    local any_unmerged=0
    local skip_agent=0

    if ! resolve_agent_cli >/dev/null; then
        echo "Cursor Agent CLI не найден. Установите CLI: https://cursor.com/docs/cli"
        return 1
    fi

    if git_rebase_in_progress; then
        echo "Уже идёт rebase — продолжаю с текущих конфликтов (новый rebase не запускаю)."
    else
        if has_uncommitted_changes; then
            echo "Есть незакоммиченные изменения. Сначала закоммитьте или сделайте stash."
            return 1
        fi

        git_fetch_branch "$branch" || return 1

        echo "---------------------------------------------"
        echo "SMART REBASE (ТЕСТОВЫЙ / НЕ ГАРАНТИРОВАНО)"
        echo "База: $branch | модель agent: auto"
        echo "---------------------------------------------"
        echo "Выполняю git rebase $branch..."

        set +e
        git rebase "$branch"
        rc=$?
        set -e

        if [[ $rc -eq 0 ]] && ! git_rebase_in_progress; then
            echo "Rebase завершён без конфликтов."
            return 0
        fi

        if ! git_rebase_in_progress; then
            echo "git rebase завершился с ошибкой (код $rc), состояние rebase не активно."
            return 1
        fi
    fi

    while git_rebase_in_progress; do
        round=$((round + 1))
        if [[ "$round" -gt "$max_rounds" ]]; then
            git_smart_rebase_pause_for_manual "превышен лимит итераций ($max_rounds)"
            pause_rc=$?
            git_smart_rebase_after_pause "$pause_rc" || return 0
            skip_agent=1
            round=0
        fi

        failed=()
        any_unmerged=0

        if [[ "$skip_agent" -eq 0 ]]; then
            while IFS= read -r file; do
                [[ -z "$file" ]] && continue
                any_unmerged=1

                if git_smart_rebase_should_skip_file "$file"; then
                    echo "Пропуск (lock/generated/binary): $file"
                    failed+=("$file (пропущен: lock/generated/binary)")
                    continue
                fi

                if ! git_smart_rebase_resolve_file "$file"; then
                    failed+=("$file")
                    continue
                fi

                git add -- "$file"
                echo "Разрешён и добавлен: $file"
            done <<EOF
$(git_rebase_list_unmerged)
EOF

            if [[ "$any_unmerged" -eq 1 && "${#failed[@]}" -gt 0 ]]; then
                git_smart_rebase_pause_for_manual "agent не смог безопасно склеить все файлы" "${failed[@]}"
                pause_rc=$?
                git_smart_rebase_after_pause "$pause_rc" || return 0
                # Пользователь подтвердил ручное разрешение — на --continue без повторного agent
                skip_agent=1
            fi
        else
            # После ручного «продолжить» ещё раз убеждаемся, что чисто
            if ! git_smart_rebase_ready_to_continue; then
                git_smart_rebase_pause_for_manual "после ручного шага конфликты всё ещё есть"
                pause_rc=$?
                git_smart_rebase_after_pause "$pause_rc" || return 0
                continue
            fi
            skip_agent=0
        fi

        set +e
        GIT_EDITOR=true git -c core.editor=true rebase --continue
        rc=$?
        set -e

        if [[ $rc -eq 0 ]] && ! git_rebase_in_progress; then
            echo "Smart rebase успешно завершён."
            return 0
        fi

        if ! git_rebase_in_progress; then
            echo "git rebase --continue завершился с кодом $rc (rebase не активен)."
            return 1
        fi

        # Новые конфликты на следующем коммите — снова agent
        if [[ -n "$(git_rebase_list_unmerged)" ]]; then
            skip_agent=0
            continue
        fi

        git_smart_rebase_pause_for_manual "rebase --continue не завершился (код $rc)"
        pause_rc=$?
        git_smart_rebase_after_pause "$pause_rc" || return 0
        skip_agent=1
    done

    echo "Smart rebase успешно завершён."
    return 0
}

git_smart_rebase_parent() {
    local parent
    parent=$(detect_parent_branch) || true
    if [[ -z "$parent" ]]; then
        echo "Родительская ветка не определена, использую development..."
        parent="development"
    else
        echo "Родительская ветка: $parent"
    fi
    git_smart_rebase_onto "$parent"
}

# Меню 5s: smart rebase (отдельно от пункта 5)
git_smart_rebase() {
    echo "SMART REBASE — НЕ ГАРАНТИРОВАНО / ТЕСТОВЫЙ ПУНКТ"
    echo "Конфликты пытается разрешить Cursor Agent (model=auto)."
    echo "При неудаче — меню: abort / ручное продолжение / выход в меню скрипта."
    echo "1) Smart rebase: родительская ветка (авто)"
    echo "2) Smart rebase: development"
    echo "3) Smart rebase: другая ветка"
    echo "q) Выйти"
    echo "---------------------------------------------"
    local choice
    choice=$(read_with_exit "Выбор команды ('q' для отмены) > " "false") || return

    case $choice in
        1)
            git_smart_rebase_parent
            ;;
        2)
            git_smart_rebase_onto "development"
            ;;
        3)
            echo "Доступные ветки:"
            git branch -a
            echo "---------------------------------------------"
            local branch
            branch=$(read_with_exit "Введите название ветки (или 'q' для отмены): " "false") || return
            git_smart_rebase_onto "$branch"
            ;;
        q)
            return
            ;;
        *)
            echo "Неверный выбор. Пожалуйста, попробуйте снова."
            git_smart_rebase
            ;;
    esac
}

# Функция для выполнения git cherry-pick
git_cherry_pick() {
    echo "Доступные коммиты:"
    git log --oneline -n 10
    echo "---------------------------------------------"
    echo "1) Ввести хэш коммита"
    echo "2) Отменить cherry-pick"
    echo "q) Выйти"
    echo "---------------------------------------------"
    local choice
    choice=$(read_with_exit "Выбор команды ('q' для отмены) >  " "false") || return

    case $choice in
        1)
            local commit_hash
            commit_hash=$(read_with_exit "Введите хэш коммита ('q' для отмены): " "false") || return
            echo "Выполняю git cherry-pick $commit_hash..."
            git cherry-pick "$commit_hash"
            ;;
        2)
            echo "Выполняю git cherry-pick --abort..."
            git cherry-pick --abort || echo "Нет активного cherry-pick для отмены."
            ;;
        q)
            return
            ;;
        *)
            echo "Неверный выбор. Пожалуйста, попробуйте снова."
            git_cherry_pick
            ;;
    esac
    echo "Готово!"
}

# Функция для выполнения git remote prune origin
git_remote_prune() {
    echo "Выполняю git remote prune origin..."
    git remote prune origin
    echo "Готово!"
}

# Обновить список тегов с origin (ошибки не прерывают скрипт)
git_fetch_tags() {
    echo "Обновляю теги с origin (git fetch --tags)..."
    git fetch --tags origin 2>/dev/null || git fetch --tags 2>/dev/null || true
}

# Последний semver-тег вида v1.1.65
get_latest_semver_tag() {
    local tag
    tag=$(git tag -l 'v*.*.*' --sort=-v:refname 2>/dev/null | head -1)
    if [[ -n "$tag" ]]; then
        echo "$tag"
        return 0
    fi
    tag=$(git tag --sort=-v:refname 2>/dev/null | head -1)
    if [[ -n "$tag" ]]; then
        echo "$tag"
        return 0
    fi
    return 1
}

# v1.1.65 → v1.1.65
increment_tag_version() {
    local tag=$1
    local prefix patch new_patch
    if [[ "$tag" =~ ^(v[0-9]+\.[0-9]+\.)([0-9]+)$ ]]; then
        prefix="${BASH_REMATCH[1]}"
        patch="${BASH_REMATCH[2]}"
        new_patch=$((10#$patch + 1))
        echo "${prefix}${new_patch}"
        return 0
    fi
    return 1
}

# Создать новый тег: последний + 1, на текущем HEAD, push
git_tag_create_new() {
    local last_tag new_tag
    git_fetch_tags
    if ! last_tag=$(get_latest_semver_tag); then
        echo "Теги не найдены. Создайте первый тег вручную (например: v1.0.0)."
        return 1
    fi
    if ! new_tag=$(increment_tag_version "$last_tag"); then
        echo "Не удалось увеличить версию тега: $last_tag (ожидается формат v1.1.65)."
        return 1
    fi
    echo "Последний тег: $last_tag"
    echo "Новый тег: $new_tag (текущий HEAD: $(git rev-parse --short HEAD))"
    git tag "$new_tag"
    echo "Выполняю git push origin $new_tag ..."
    git push origin "$new_tag"
    echo "Тег $new_tag создан и отправлен на origin."
}

# Обновить последний тег: удалить локально и на origin, создать заново на HEAD, push
git_tag_update() {
    local tag
    git_fetch_tags
    if ! tag=$(get_latest_semver_tag); then
        echo "Теги не найдены."
        return 1
    fi
    echo "Последний тег: $tag"
    echo "Удаляю локальный тег $tag ..."
    git tag -d "$tag"
    echo "Удаляю тег $tag на origin ..."
    git push --delete origin "$tag" 2>/dev/null || git push origin ":refs/tags/$tag"
    echo "Создаю тег $tag заново на HEAD ($(git rev-parse --short HEAD)) ..."
    git tag "$tag"
    echo "Выполняю git push origin $tag ..."
    git push origin "$tag"
    echo "Тег $tag обновлён и отправлен на origin."
}

# --- CI/CD теги Codemagic (пункт 8 -> 2) ---
# Формат строки: key#label#regex#glob#default#kind (channel|store)
# Разделитель # — в regex есть |, IFS='|' ломает поля.
cicd_tag_patterns() {
    cat <<'EOF'
1#Dev debug - APK#^v[0-9]+\.[0-9]+\.[0-9]+-dev\.debug\.((alpha|beta|rc)\.)?[0-9]+$#v*-dev.debug.*#v1.0.0-dev.debug.1#channel
2#Dev release - APK#^v[0-9]+\.[0-9]+\.[0-9]+-dev\.release\.((alpha|beta|rc)\.)?[0-9]+$#v*-dev.release.*#v1.0.0-dev.release.1#channel
3#Prod release - APK#^v[0-9]+\.[0-9]+\.[0-9]+-prod\.release\.((alpha|beta|rc)\.)?[0-9]+$#v*-prod.release.*#v1.0.0-prod.release.1#channel
4#IOS DEV DEBUG - IPA#^iv[0-9]+\.[0-9]+\.[0-9]+-dev\.((alpha|beta|rc)\.)?[0-9]+$#iv*-dev.*#iv1.0.0-dev.1#channel
5#GPlay - AAB#^v[0-9]+\.[0-9]+\.[0-9]+-gp$#v*-gp#v1.0.0-gp#store
6#RuStore - AAB#^v[0-9]+\.[0-9]+\.[0-9]+-ru$#v*-ru#v1.0.0-ru#store
7#AppGallery - AAB#^v[0-9]+\.[0-9]+\.[0-9]+-hw$#v*-hw#v1.0.0-hw#store
8#AppStore - IPA#^iv[0-9]+\.[0-9]+\.[0-9]+$#iv*#iv1.0.0#store
EOF
}

# Получить поле строки паттерна: key field → value (label|regex|glob|default|kind)
cicd_tag_pattern_field() {
    local key="$1"
    local field="$2"
    local k label regex glob default kind
    # heredoc вместо < <(...) — совместимо с bash в POSIX-режиме / sh
    while IFS='#' read -r k label regex glob default kind; do
        if [[ "$k" == "$key" ]]; then
            case "$field" in
                label) echo "$label" ;;
                regex) echo "$regex" ;;
                glob) echo "$glob" ;;
                default) echo "$default" ;;
                kind) echo "$kind" ;;
                *) return 1 ;;
            esac
            return 0
        fi
    done <<EOF
$(cicd_tag_patterns)
EOF
    return 1
}

# Тег валиден хотя бы для одного cicd-паттерна
cicd_tag_validate_any() {
    local tag="$1"
    local k label regex glob default kind
    while IFS='#' read -r k label regex glob default kind; do
        if [[ "$tag" =~ $regex ]]; then
            return 0
        fi
    done <<EOF
$(cicd_tag_patterns)
EOF
    return 1
}

# Тег валиден для конкретного ключа паттерна
cicd_tag_validate_key() {
    local tag="$1"
    local key="$2"
    local regex
    regex=$(cicd_tag_pattern_field "$key" regex) || return 1
    [[ "$tag" =~ $regex ]]
}

# Последний тег по паттерну (пустой stdout, если нет)
cicd_tag_last_for_pattern() {
    local key="$1"
    local regex glob tag
    regex=$(cicd_tag_pattern_field "$key" regex) || return 1
    glob=$(cicd_tag_pattern_field "$key" glob) || return 1
    # Для AppStore (ivX.Y.Z) отсекаем iv*-dev.* через regex
    tag=$(git tag -l "$glob" --sort=-v:refname 2>/dev/null | grep -E "$regex" | head -1 || true)
    if [[ -n "$tag" ]]; then
        echo "$tag"
        return 0
    fi
    return 1
}

# Теги по паттерну: до 3 последних по дате (stdout, по строке; новые сверху)
cicd_tag_list_for_pattern() {
    local key="$1"
    local regex glob
    regex=$(cicd_tag_pattern_field "$key" regex) || return 1
    glob=$(cicd_tag_pattern_field "$key" glob) || return 1
    # creatordate: taggerdate у annotated, commit date у lightweight
    git tag -l "$glob" --sort=-creatordate 2>/dev/null | grep -E "$regex" | head -3 || true
}

# Описание annotated-тега (пусто для lightweight)
cicd_tag_get_description() {
    local tag="$1"
    local objtype
    objtype=$(git cat-file -t "refs/tags/$tag" 2>/dev/null) || return 1
    if [[ "$objtype" != "tag" ]]; then
        echo ""
        return 0
    fi
    # %(contents) с хвостовым \n; при capture через $() хвостовые \n срежутся
    git for-each-ref --format='%(contents)' "refs/tags/$tag" 2>/dev/null
}

# Инкремент semver X.Y.Z → patch|minor|major; stdout: X.Y.Z
cicd_tag_bump_semver() {
    local version="$1"
    local mode="$2"
    local major minor patch
    if [[ ! "$version" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
        return 1
    fi
    major="${BASH_REMATCH[1]}"
    minor="${BASH_REMATCH[2]}"
    patch="${BASH_REMATCH[3]}"
    case "$mode" in
        patch)
            patch=$((10#$patch + 1))
            ;;
        minor)
            minor=$((10#$minor + 1))
            patch=0
            ;;
        major)
            major=$((10#$major + 1))
            minor=0
            patch=0
            ;;
        *)
            return 1
            ;;
    esac
    echo "${major}.${minor}.${patch}"
}

# Варианты следующего тега для channel-паттерна (по одному на строку)
# Из последнего N → alpha.(N+1), beta.(N+1), rc.(N+1), numeric.(N+1)
cicd_tag_channel_variants() {
    local last_tag="$1"
    local default_tag="$2"
    local base num next_num prefix env_part
    local src="$last_tag"

    if [[ -z "$src" ]]; then
        src="$default_tag"
    fi

    # v1.0.0-dev.release.alpha.5 | v1.0.0-dev.release.5 | iv1.0.0-dev.alpha.2 | iv1.0.0-dev.1
    if [[ "$src" =~ ^((v|iv)[0-9]+\.[0-9]+\.[0-9]+-(dev\.debug|dev\.release|prod\.release|dev))\.((alpha|beta|rc)\.)?([0-9]+)$ ]]; then
        base="${BASH_REMATCH[1]}"
        num="${BASH_REMATCH[6]}"
        next_num=$((10#$num + 1))
        # Если тегов не было — предлагаем стартовые .1 на базе default (не +1 от default)
        if [[ -z "$last_tag" ]]; then
            next_num=1
            if [[ "$default_tag" =~ ^((v|iv)[0-9]+\.[0-9]+\.[0-9]+-(dev\.debug|dev\.release|prod\.release|dev))\. ]]; then
                base="${BASH_REMATCH[1]}"
            fi
        fi
        echo "${base}.alpha.${next_num}"
        echo "${base}.beta.${next_num}"
        echo "${base}.rc.${next_num}"
        echo "${base}.${next_num}"
        return 0
    fi
    return 1
}

# Варианты следующего тега для store-паттерна: patch, minor, major
cicd_tag_store_variants() {
    local last_tag="$1"
    local default_tag="$2"
    local src="$last_tag"
    local prefix ver suffix new_ver

    if [[ -z "$src" ]]; then
        src="$default_tag"
    fi

    # v3.0.0-gp | iv3.0.0
    if [[ "$src" =~ ^(v|iv)([0-9]+\.[0-9]+\.[0-9]+)(-[a-z]+)?$ ]]; then
        prefix="${BASH_REMATCH[1]}"
        ver="${BASH_REMATCH[2]}"
        suffix="${BASH_REMATCH[3]-}"
        # Нет последнего тега — предлагаем сам default как patch-базу без bump? Лучше bump от default.
        # Если тегов нет: показать default и его minor/major от default.
        if [[ -z "$last_tag" ]]; then
            echo "${prefix}${ver}${suffix}"
            new_ver=$(cicd_tag_bump_semver "$ver" minor) || return 1
            echo "${prefix}${new_ver}${suffix}"
            new_ver=$(cicd_tag_bump_semver "$ver" major) || return 1
            echo "${prefix}${new_ver}${suffix}"
            return 0
        fi
        new_ver=$(cicd_tag_bump_semver "$ver" patch) || return 1
        echo "${prefix}${new_ver}${suffix}"
        new_ver=$(cicd_tag_bump_semver "$ver" minor) || return 1
        echo "${prefix}${new_ver}${suffix}"
        new_ver=$(cicd_tag_bump_semver "$ver" major) || return 1
        echo "${prefix}${new_ver}${suffix}"
        return 0
    fi
    return 1
}

# Список кандидатов следующего тега (stdout, по строке)
cicd_tag_next_variants() {
    local key="$1"
    local last_tag="${2-}"
    local kind default_tag
    kind=$(cicd_tag_pattern_field "$key" kind) || return 1
    default_tag=$(cicd_tag_pattern_field "$key" default) || return 1
    case "$kind" in
        channel)
            cicd_tag_channel_variants "$last_tag" "$default_tag"
            ;;
        store)
            cicd_tag_store_variants "$last_tag" "$default_tag"
            ;;
        *)
            return 1
            ;;
    esac
}

# Описание + создание тега + push (сразу, без подтверждения)
# Возврат: 0 ок, 1 отмена (q), 2 назад (bs)
cicd_tag_finalize() {
    local tag="$1"
    local desc
    echo "Тег: $tag (HEAD: $(git rev-parse --short HEAD))"
    echo "Enter — подтвердить (описание может быть пустым), bs — назад, q — отмена."
    # read_with_exit на q возвращает 1; пустой ввод допустим — не используем default
    if ! desc=$(read_with_exit "Описание тега > " "false"); then
        return 1
    fi
    if [[ "$desc" == "bs" || "$desc" == "BS" ]]; then
        return 2
    fi
    if [[ -n "$desc" ]]; then
        git tag -a "$tag" -m "$desc"
    else
        git tag "$tag"
    fi
    echo "Выполняю git push origin $tag ..."
    git push origin "$tag"
    echo "Тег $tag создан и отправлен на origin."
    return 0
}

# Ручной ввод тега с валидацией (any или key)
# $1 = prefill, $2 = key или "" для any
# stdout: выбранный тег; return 1=q, 2=bs, 3=неверный (вызывающий решает)
cicd_tag_prompt_custom() {
    local prefill="$1"
    local key="${2-}"
    local tag
    tag=$(read_with_exit "Введите тег > " "false" "$prefill") || return 1
    if [[ "$tag" == "bs" || "$tag" == "BS" ]]; then
        return 2
    fi
    if [[ -n "$key" ]]; then
        if ! cicd_tag_validate_key "$tag" "$key"; then
            echo "Неверный тег" >&2
            return 3
        fi
    else
        if ! cicd_tag_validate_any "$tag"; then
            echo "Неверный тег" >&2
            return 3
        fi
    fi
    echo "$tag"
    return 0
}

# Подменю вариантов после выбора паттерна 1-8
# return 0 — готово; 1 — q; 2 — bs на верхнее cicd-меню
cicd_tag_variant_menu() {
    local key="$1"
    local last_tag default_tag display_last
    local -a variants
    local choice i n tag rc desc_rc

    default_tag=$(cicd_tag_pattern_field "$key" default) || return 1
    last_tag=""
    if last_tag=$(cicd_tag_last_for_pattern "$key"); then
        display_last="$last_tag"
    else
        last_tag=""
        display_last="(нет)"
    fi

    while true; do
        variants=()
        while IFS= read -r tag; do
            [[ -n "$tag" ]] && variants+=("$tag")
        done <<EOF
$(cicd_tag_next_variants "$key" "$last_tag")
EOF

        echo ""
        if [[ -n "$last_tag" ]]; then
            echo "последний тег: $last_tag, выберите команду:"
        else
            echo "последний тег: $display_last, выберите команду:"
        fi
        echo "1) ввести свой"
        i=2
        for tag in "${variants[@]}"; do
            echo "${i}) $tag"
            i=$((i + 1))
        done
        echo "Enter — подтвердить, bs — назад, q — отмена."
        echo "---------------------------------------------"

        if ! choice=$(read_with_exit "Выбор команды > " "false"); then
            return 1
        fi
        if [[ "$choice" == "bs" || "$choice" == "BS" ]]; then
            return 2
        fi
        # Пустой Enter — если есть варианты, берём первый предложенный (п.2)
        if [[ -z "$choice" ]]; then
            if [[ ${#variants[@]} -gt 0 ]]; then
                choice=2
            else
                choice=1
            fi
        fi

        case "$choice" in
            1)
                while true; do
                    prefill="$last_tag"
                    [[ -z "$prefill" ]] && prefill="$default_tag"
                    set +e
                    tag=$(cicd_tag_prompt_custom "$prefill" "$key")
                    rc=$?
                    set -e
                    if [[ $rc -eq 1 ]]; then
                        return 1
                    fi
                    if [[ $rc -eq 2 ]]; then
                        break
                    fi
                    if [[ $rc -eq 3 ]]; then
                        continue
                    fi
                    set +e
                    cicd_tag_finalize "$tag"
                    desc_rc=$?
                    set -e
                    if [[ $desc_rc -eq 1 ]]; then
                        return 1
                    fi
                    if [[ $desc_rc -eq 2 ]]; then
                        break
                    fi
                    return 0
                done
                ;;
            *)
                if [[ "$choice" =~ ^[0-9]+$ ]] && [[ "$choice" -ge 2 ]]; then
                    n=$((choice - 2))
                    if [[ $n -ge 0 && $n -lt ${#variants[@]} ]]; then
                        tag="${variants[$n]}"
                        set +e
                        cicd_tag_finalize "$tag"
                        desc_rc=$?
                        set -e
                        if [[ $desc_rc -eq 1 ]]; then
                            return 1
                        fi
                        if [[ $desc_rc -eq 2 ]]; then
                            continue
                        fi
                        return 0
                    fi
                fi
                echo "Неверный выбор. Пожалуйста, попробуйте снова."
                ;;
        esac
    done
}

# Обновить существующий cicd-тег: показать по паттернам → выбрать →
# скопировать описание → удалить → создать заново на HEAD → push
# return 0 — готово; 1 — q; 2 — bs
cicd_tag_update_existing() {
    local -a tags=()
    local k label tag choice idx desc confirm found
    local i=1

    git_fetch_tags

    echo ""
    echo "--- Обновить существующий CI/CD тег ---"
    while IFS='#' read -r k label _regex _glob _default _kind; do
        [[ -z "$k" ]] && continue
        echo ""
        echo "$k) $label"
        found=0
        while IFS= read -r tag; do
            [[ -z "$tag" ]] && continue
            found=1
            tags+=("$tag")
            echo "   ${i}) $tag"
            i=$((i + 1))
        done <<EOF
$(cicd_tag_list_for_pattern "$k")
EOF
        if [[ $found -eq 0 ]]; then
            echo "   (нет тегов)"
        fi
    done <<EOF
$(cicd_tag_patterns)
EOF

    if [[ ${#tags[@]} -eq 0 ]]; then
        echo ""
        echo "Нет доступных CI/CD тегов для обновления."
        return 2
    fi

    echo ""
    echo "Enter — подтвердить, bs — назад, q — отмена."
    echo "---------------------------------------------"

    while true; do
        if ! choice=$(read_with_exit "Выбор тега > " "false"); then
            return 1
        fi
        if [[ "$choice" == "bs" || "$choice" == "BS" ]]; then
            return 2
        fi
        if [[ -z "$choice" ]]; then
            echo "Укажите номер тега."
            continue
        fi
        if [[ ! "$choice" =~ ^[0-9]+$ ]]; then
            echo "Неверный выбор. Пожалуйста, попробуйте снова."
            continue
        fi
        idx=$((choice - 1))
        if [[ $idx -lt 0 || $idx -ge ${#tags[@]} ]]; then
            echo "Неверный выбор. Пожалуйста, попробуйте снова."
            continue
        fi
        break
    done

    tag="${tags[$idx]}"
    desc=$(cicd_tag_get_description "$tag" || true)

    echo ""
    echo "Тег: $tag"
    if [[ -n "$desc" ]]; then
        echo "Описание: $desc"
    else
        echo "Описание: (пусто / lightweight)"
    fi
    echo "Будет удалён и создан заново на HEAD ($(git rev-parse --short HEAD))."
    echo "Enter — подтвердить, bs — назад, q — отмена."

    if ! confirm=$(read_with_exit "Подтверждение > " "false"); then
        return 1
    fi
    if [[ "$confirm" == "bs" || "$confirm" == "BS" ]]; then
        return 2
    fi
    if [[ -n "$confirm" ]]; then
        echo "Нужен пустой Enter для подтверждения."
        return 2
    fi

    echo "Удаляю локальный тег $tag ..."
    git tag -d "$tag"
    echo "Удаляю тег $tag на origin ..."
    git push --delete origin "$tag" 2>/dev/null || git push origin ":refs/tags/$tag"

    if [[ -n "$desc" ]]; then
        git tag -a "$tag" -m "$desc"
    else
        git tag "$tag"
    fi
    echo "Выполняю git push origin $tag ..."
    git push origin "$tag"
    echo "Тег $tag обновлён и отправлен на origin."
    return 0
}

# Главное меню cicd tag (8 -> 2)
cicd_tag_menu() {
    local choice key rc tag

    git_fetch_tags

    while true; do
        echo ""
        echo "--- CI/CD tag (Codemagic) ---"
        echo "Debug for QA"
        echo "  1) Dev debug     - APK"
        echo "  2) Dev release   - APK"
        echo "  3) Prod release  - APK"
        echo "  4) IOS DEV DEBUG - IPA"
        echo ""
        echo "Release in the Store"
        echo "  5) GPlay         - AAB"
        echo "  6) RuStore       - AAB"
        echo "  7) AppGallery    - AAB"
        echo "  8) AppStore      - IPA"
        echo ""
        echo "  9) Ввести свой"
        echo "  91) обновить существующий"
        echo "Enter — подтвердить, bs — назад, q — отмена."
        echo "---------------------------------------------"

        if ! choice=$(read_with_exit "Выбор способа сборки > " "false"); then
            return 0
        fi
        if [[ "$choice" == "bs" || "$choice" == "BS" ]]; then
            git_tag
            return 0
        fi
        if [[ -z "$choice" ]]; then
            echo "Неверный выбор. Пожалуйста, попробуйте снова."
            continue
        fi

        case "$choice" in
            1|2|3|4|5|6|7|8)
                key="$choice"
                set +e
                cicd_tag_variant_menu "$key"
                rc=$?
                set -e
                if [[ $rc -eq 1 ]]; then
                    return 0
                fi
                if [[ $rc -eq 2 ]]; then
                    continue
                fi
                return 0
                ;;
            9)
                while true; do
                    set +e
                    tag=$(cicd_tag_prompt_custom "" "")
                    rc=$?
                    set -e
                    if [[ $rc -eq 1 ]]; then
                        return 0
                    fi
                    if [[ $rc -eq 2 ]]; then
                        break
                    fi
                    if [[ $rc -eq 3 ]]; then
                        # неверный тег — снова меню выбора способа
                        break
                    fi
                    set +e
                    cicd_tag_finalize "$tag"
                    rc=$?
                    set -e
                    if [[ $rc -eq 1 ]]; then
                        return 0
                    fi
                    if [[ $rc -eq 2 ]]; then
                        break
                    fi
                    return 0
                done
                ;;
            91)
                set +e
                cicd_tag_update_existing
                rc=$?
                set -e
                if [[ $rc -eq 1 ]]; then
                    return 0
                fi
                if [[ $rc -eq 2 ]]; then
                    continue
                fi
                return 0
                ;;
            *)
                echo "Неверный выбор. Пожалуйста, попробуйте снова."
                ;;
        esac
    done
}

# Меню ui_kit tag (8 -> 1): semver vX.Y.Z
ui_kit_tag_menu() {
    local choice

    while true; do
        echo ""
        echo "--- ui_kit tag ---"
        echo "1) Создать новый тег (последний + 1, push)"
        echo "2) Обновить последний тег (удалить и создать заново, push)"
        echo "Enter — подтвердить, bs — назад, q — отмена."
        echo "---------------------------------------------"

        if ! choice=$(read_with_exit "Выбор команды > " "false"); then
            return 0
        fi
        if [[ "$choice" == "bs" || "$choice" == "BS" ]]; then
            git_tag
            return 0
        fi
        if [[ -z "$choice" ]]; then
            echo "Неверный выбор. Пожалуйста, попробуйте снова."
            continue
        fi

        case "$choice" in
            1)
                git_tag_create_new
                return 0
                ;;
            2)
                git_tag_update
                return 0
                ;;
            *)
                echo "Неверный выбор. Пожалуйста, попробуйте снова."
                ;;
        esac
    done
}

# Меню работы с тегами
git_tag() {
    echo "1) ui_kit tag.."
    echo "2) cicd tag (Codemagic).."
    echo "q) Выйти"
    echo "---------------------------------------------"
    local choice
    choice=$(read_with_exit "Выбор команды ('q' для отмены) > " "false") || return

    case $choice in
        1)
            ui_kit_tag_menu
            ;;
        2)
            cicd_tag_menu
            ;;
        q)
            return
            ;;
        *)
            echo "Неверный выбор. Пожалуйста, попробуйте снова."
            git_tag
            ;;
    esac
}

# --- Ревью кода (пункт 9) через Cursor Agent CLI ---

readonly REVIEW_DIFF_MAX_BYTES=120000
readonly REVIEW_RULES_REL=".gitlab/review_rules.md"
readonly REVIEW_OUT_DIR_REL=".gitlab/reviews"
# Модели в секции --- Cursor --- меню ревью (пункт 9); полный каталог — по 'l'
readonly REVIEW_CURSOR_MENU_IDS=(
    auto
    cursor-grok-4.5-high
    kimi-k3-high
)

# Путь к правилам ревью (.gitlab/review_rules.md)
review_rules_path() {
    local root
    root=$(git rev-parse --show-toplevel 2>/dev/null) || return 1
    echo "${root}/${REVIEW_RULES_REL}"
}

# Текст правил для промпта (файл целиком); stderr — предупреждение если нет файла
# stdout: содержимое правил
review_load_rules() {
    local path
    path=$(review_rules_path) || return 1
    if [[ ! -f "$path" ]]; then
        echo "Предупреждение: нет ${REVIEW_RULES_REL} — использую встроенный краткий формат." >&2
        return 1
    fi
    cat "$path"
}

# Префикс ссылок из .gitlab/reviews/ к корню репозитория (../../)
readonly REVIEW_MD_ROOT_PREFIX="../.."

# Переписать markdown-ссылки в теле ревью: пути от корня репо → ../../path
# (файл отчёта лежит в .gitlab/reviews/, иначе Cursor открывает путь относительно .gitlab/reviews)
# $1 path to body file (in-place)
review_rewrite_body_links_for_reviews_dir() {
    local body_file=$1

    if ! command -v python3 &>/dev/null; then
        echo "Предупреждение: python3 нет — ссылки Location могут открываться относительно .gitlab/reviews." >&2
        return 0
    fi

    REVIEW_BODY="$body_file" REVIEW_LINK_PREFIX="$REVIEW_MD_ROOT_PREFIX" python3 <<'PYEOF'
import os
import re
from pathlib import Path

path = Path(os.environ["REVIEW_BODY"])
prefix = os.environ["REVIEW_LINK_PREFIX"].rstrip("/")
text = path.read_text(encoding="utf-8", errors="replace")

def fix_url(url: str) -> str:
    u = url.strip()
    if not u:
        return url
    low = u.lower()
    if low.startswith(("http://", "https://", "mailto:", "file:")):
        return url
    if u.startswith("#"):
        return url
    # уже от каталога reviews (../ или ../../)
    if u.startswith("../"):
        return url
    # абсолютный от ФС — не трогаем
    if u.startswith("/"):
        return url
    while u.startswith("./"):
        u = u[2:]
    return f"{prefix}/{u}"

def repl(m: re.Match) -> str:
    return "](" + fix_url(m.group(1)) + ")"

new_text = re.sub(r"\]\(([^)]+)\)", repl, text)
if new_text != text:
    path.write_text(new_text, encoding="utf-8")
PYEOF
}

# Сохранить ответ ревью в тёмный Markdown и открыть в Cursor
# $1 repo_root, $2 model, $3 scope, $4 path to body file (сырой ответ модели)
# stdout: путь к отчёту
review_save_and_open_report() {
    local repo_root=$1
    local model=$2
    local scope=$3
    local body_file=$4
    local out_dir out_file branch ts rel_path
    # ссылка на правила из .gitlab/reviews/ → .gitlab/review_rules.md
    local rules_href="../review_rules.md"

    out_dir="${repo_root}/${REVIEW_OUT_DIR_REL}"
    mkdir -p "$out_dir" || {
        echo "Не удалось создать $out_dir" >&2
        return 1
    }

    # Читаемая дата/время: 2026_08_05-17_34_46
    ts=$(date +%Y_%m_%d-%H_%M_%S)
    branch=$(git -C "$repo_root" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
    # Безопасное имя ветки для файла
    branch=$(printf '%s' "$branch" | tr '/:' '--' | tr -cd 'A-Za-z0-9._-')
    out_file="${out_dir}/review-${ts}-${scope}-${branch}.md"

    # Ссылки Location в теле: от корня репо → ../../… (иначе резолв из .gitlab/reviews)
    review_rewrite_body_links_for_reviews_dir "$body_file"

    {
        cat <<EOF
<!--
  Code review report (sh_gitlab)
  model: ${model}
  scope: ${scope}
  branch: ${branch}
  generated: $(date '+%Y-%m-%d %H:%M:%S %z')
-->
<style>
  /* Тёмный отчёт: контрастный текст и заметные ссылки находок */
  html, body, .markdown-body, .vscode-body {
    background-color: #0d1117 !important;
    color: #e6edf3 !important;
  }
  h1, h2, h3, h4, strong { color: #f0f6fc !important; }
  p, li, td, th { color: #e6edf3 !important; }
  a, a:visited {
    color: #79c0ff !important;
    font-weight: 600;
    text-decoration: underline;
  }
  a:hover { color: #a5d6ff !important; }
  table { border-collapse: collapse; width: 100%; }
  th, td {
    border: 1px solid #30363d !important;
    padding: 8px 10px;
    background-color: #161b22 !important;
    color: #e6edf3 !important;
  }
  th { background-color: #21262d !important; color: #f0f6fc !important; }
  code, pre {
    background-color: #161b22 !important;
    color: #79c0ff !important;
    border: 1px solid #30363d;
  }
  hr { border-color: #30363d !important; }
  blockquote {
    border-left: 4px solid #388bfd !important;
    color: #c9d1d9 !important;
    background: #161b22 !important;
  }
</style>

# Code review

| | |
|---|---|
| **Model** | \`${model}\` |
| **Scope** | \`${scope}\` |
| **Branch** | \`${branch}\` |
| **Rules** | [\`${REVIEW_RULES_REL}\`](${rules_href}) |

---

EOF
        cat "$body_file"
        printf '\n'
    } >"$out_file" || {
        echo "Не удалось записать отчёт: $out_file" >&2
        return 1
    }

    rel_path="${REVIEW_OUT_DIR_REL}/$(basename "$out_file")"
    echo "Отчёт Markdown: ${rel_path}" >&2
    echo "Полный путь: ${out_file}" >&2

    review_open_in_cursor "$out_file"
    printf '%s\n' "$out_file"
}

# CLI бинарник Cursor IDE (открытие файлов), не agent-shim из ~/.local/bin
resolve_cursor_ide_cli() {
    local candidate
    for candidate in \
        "/Applications/Cursor.app/Contents/Resources/app/bin/cursor" \
        "${HOME}/Applications/Cursor.app/Contents/Resources/app/bin/cursor"
    do
        if [[ -x "$candidate" ]]; then
            printf '%s\n' "$candidate"
            return 0
        fi
    done
    # Если `cursor` в PATH — не agent-shim (тот пишет "No Cursor IDE installation")
    if command -v cursor >/dev/null 2>&1; then
        candidate=$(command -v cursor)
        if [[ "$candidate" != *'/.local/bin/cursor' ]] \
            && cursor --help 2>&1 | grep -q -- '--goto'; then
            printf '%s\n' "$candidate"
            return 0
        fi
    fi
    return 1
}

# Открыть MD в Cursor; если есть Markdown Preview Enhanced — превью сбоку (best-effort).
# Вызывается после Review / Summary / Fix.
review_open_in_cursor() {
    local path=$1
    local ide_cli
    local abs_path

    [[ -z "$path" || ! -f "$path" ]] && return 0
    abs_path=$(cd "$(dirname "$path")" && pwd)/$(basename "$path")

    ide_cli=$(resolve_cursor_ide_cli) || ide_cli=""
    if [[ -n "$ide_cli" ]]; then
        # Открыть файл в уже открытом окне Cursor
        "$ide_cli" -r -g "${abs_path}:1" >/dev/null 2>&1 || \
            "$ide_cli" -r "$abs_path" >/dev/null 2>&1 || true
        # Markdown Preview Enhanced: Cmd+K V → openPreviewToTheSide
        if [[ -d "${HOME}/.cursor/extensions" ]] \
            && ls -d "${HOME}/.cursor/extensions"/shd101wyy.markdown-preview-enhanced-* \
                >/dev/null 2>&1; then
            sleep 0.6
            osascript >/dev/null 2>&1 <<'APPLESCRIPT' || true
tell application "Cursor" to activate
delay 0.25
tell application "System Events"
    keystroke "k" using {command down}
    delay 0.12
    keystroke "v"
end tell
APPLESCRIPT
        fi
        echo "Открыт в Cursor: ${abs_path}" >&2
        return 0
    fi

    if command -v open >/dev/null 2>&1; then
        open -a "Cursor" "$abs_path" >/dev/null 2>&1 || open "$abs_path" >/dev/null 2>&1 || true
        echo "Открыт через open: ${abs_path}" >&2
    fi
}

# Модель уходит в OpenRouter/BYOK для текстового вызова (Review/Summary)?
# Каталог Agent CLI — отдельная проверка: меню ревью может включать OpenRouter-id.
review_model_uses_openai_compatible() {
    local model=$1
    if is_user_added_review_model "$model" || [[ "$model" == */* ]]; then
        if ! is_agent_cli_catalog_model "$model"; then
            return 0
        fi
    fi
    return 1
}

# Вызов модели: OpenRouter или Cursor Agent CLI
# $1 model, $2 prompt, $3 out_file (тело ответа)
review_run_model_prompt() {
    local model=$1
    local prompt=$2
    local out_file=$3
    local agent_cli tmp_err agent_rc=0
    local workspace

    workspace=$(git rev-parse --show-toplevel 2>/dev/null || pwd)

    if review_model_uses_openai_compatible "$model"; then
        invoke_review_via_openai_compatible "$model" "$prompt" >"$out_file"
        return $?
    fi

    agent_cli=$(resolve_agent_cli) || {
        echo "Cursor Agent CLI не найден. Установите CLI: https://cursor.com/docs/cli" >&2
        return 1
    }

    tmp_err=$(mktemp "${TMPDIR:-/tmp}/review_agent_err.XXXXXX") || return 1
    set +e
    # stdin из /dev/null: иначе CLI забирает ввод терминала и следующий read получает EOF
    if [[ "$agent_cli" == "cursor agent" ]]; then
        cursor agent --print --trust --mode ask --model "$model" \
            --workspace "$workspace" "$prompt" \
            </dev/null >"$out_file" 2>"$tmp_err"
        agent_rc=$?
    else
        agent --print --trust --mode ask --model "$model" \
            --workspace "$workspace" "$prompt" \
            </dev/null >"$out_file" 2>"$tmp_err"
        agent_rc=$?
    fi
    set -e

    if [[ "$agent_rc" -ne 0 ]]; then
        echo "Вызов модели завершился с ошибкой (код $agent_rc)." >&2
        echo "Модель: $model" >&2
        if [[ -s "$tmp_err" ]]; then
            echo "Ответ CLI:" >&2
            head -c 500 "$tmp_err" | tr '\n' ' ' >&2
            echo >&2
            if grep -q 'Cannot use this model' "$tmp_err" 2>/dev/null; then
                echo "" >&2
                echo "Эта модель недоступна в Agent CLI (в чате IDE может работать)." >&2
                echo "Для OpenRouter-моделей: ключ в .gitlab/review_env или OPENROUTER_API_KEY." >&2
            fi
        else
            echo "Проверьте: agent login и сеть." >&2
        fi
        rm -f "$tmp_err"
        return 1
    fi
    if [[ -s "$tmp_err" ]] && grep -qiE 'error|cannot|failed' "$tmp_err" 2>/dev/null; then
        head -c 300 "$tmp_err" >&2 || true
        echo >&2
    fi
    rm -f "$tmp_err"
    return 0
}

# Дописать Summary в существующий MD-отчёт
# $1 report_path, $2 summary_model, $3 path to summary body
review_append_summary() {
    local report_path=$1
    local summary_model=$2
    local body_file=$3

    {
        printf '\n\n---\n\n'
        # Если модель не вставила заголовок/имя — гарантируем метаблок
        if ! grep -qE '^##[[:space:]]+Summary' "$body_file" 2>/dev/null; then
            printf '## Summary\n\n'
        fi
        if ! grep -qiE 'Summary model' "$body_file" 2>/dev/null; then
            cat <<EOF
| | |
|---|---|
| **Summary model** | \`${summary_model}\` |

EOF
        fi
        cat "$body_file"
        printf '\n'
    } >>"$report_path" || {
        echo "Не удалось дописать Summary в $report_path" >&2
        return 1
    }
    echo "Summary добавлен в отчёт (модель: $summary_model)." >&2
}

# Выдержки кода по Location из MD-отчёта (для Summary)
# $1 repo_root, $2 report_path → stdout: текстовый блок с фрагментами
review_collect_code_context_from_report() {
    local repo_root=$1
    local report_path=$2

    if ! command -v python3 &>/dev/null; then
        echo "(python3 недоступен — фрагменты кода не извлечены; опирайся на Location в MD и workspace.)"
        return 0
    fi

    REVIEW_ROOT="$repo_root" REVIEW_MD="$report_path" python3 <<'PYEOF'
import os
import re
from pathlib import Path

root = Path(os.environ["REVIEW_ROOT"])
md = Path(os.environ["REVIEW_MD"]).read_text(encoding="utf-8", errors="replace")

# [`path:42`](path#L42) или path/file.dart:42 / path#L42
pat_link = re.compile(
    r"\[[^\]]*?\b([A-Za-z0-9_./\-]+\.[A-Za-z0-9]+):(\d+)\]\(([A-Za-z0-9_./\-]+(?:\.[A-Za-z0-9]+)?)#L(\d+)\)"
)
pat_plain = re.compile(r"\b([A-Za-z0-9_./\-]+\.[A-Za-z0-9]+):(\d+)\b")
pat_hash = re.compile(r"\b([A-Za-z0-9_./\-]+\.[A-Za-z0-9]+)#L(\d+)\b")

seen = []
seen_set = set()

def add(path: str, line: int) -> None:
    path = path.replace("\\", "/")
    # ссылки из .gitlab/reviews: ../../packages/... → packages/...
    while path.startswith("../"):
        path = path[3:]
    path = path.lstrip("./")
    key = (path, line)
    if key in seen_set:
        return
    seen_set.add(key)
    seen.append(key)

for m in pat_link.finditer(md):
    add(m.group(3) or m.group(1), int(m.group(4) or m.group(2)))
for m in pat_plain.finditer(md):
    add(m.group(1), int(m.group(2)))
for m in pat_hash.finditer(md):
    add(m.group(1), int(m.group(2)))

# Не тащим шаблонные path/to из правил, если вдруг попали
seen = [(p, ln) for p, ln in seen if not p.startswith("path/to/")]

if not seen:
    print("(в MD не найдено Location file:line — сверься с таблицей находок вручную по workspace.)")
    raise SystemExit(0)

radius = 25
max_locs = 40
print(f"Найдено Location: {len(seen)} (показываю до {max_locs}).")
print("")

for path, line in seen[:max_locs]:
    fp = root / path
    print(f"===== {path}:{line} =====")
    if not fp.is_file():
        print(f"(файл не найден: {fp})")
        print("")
        continue
    try:
        lines = fp.read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError as exc:
        print(f"(не удалось прочитать: {exc})")
        print("")
        continue
    start = max(1, line - radius)
    end = min(len(lines), line + radius)
    for i in range(start, end + 1):
        mark = ">>" if i == line else "  "
        print(f"{mark}{i:>5}|{lines[i - 1]}")
    print("")
PYEOF
}

# Второй проход: выбрать модель и оценить MD-отчёт → Summary
# $1 repo_root, $2 report_path, $3 review_model (кто писал review)
run_review_md_summary() {
    local repo_root=$1
    local report_path=$2
    local review_model=$3
    local summary_model rules_text prompt tmp_out rel_path code_ctx

    if [[ -z "$report_path" || ! -f "$report_path" ]]; then
        echo "Нет MD-отчёта для Summary — пропуск."
        return 0
    fi

    echo ""
    echo "---------------------------------------------"
    echo "Этап 2 — Summary: MD → проверка кода → приоритеты."
    echo "Отчёт: ${REVIEW_OUT_DIR_REL}/$(basename "$report_path")"
    echo "Review model: $review_model"
    echo "Выберите модель для Summary ('q' — пропустить)."
    echo "---------------------------------------------"

    summary_model=$(prompt_review_model) || {
        echo "Summary пропущен."
        return 0
    }
    summary_model=$(printf '%s' "$summary_model" | tr -d '\r' | sed 's/[[:space:]]*$//')
    echo "Summary model: $summary_model"
    echo "---------------------------------------------"

    if rules_text=$(review_load_rules); then
        :
    else
        rules_text="Режим Summary: 1) прочитай MD 2) проверь код по Location 3) вынеси Id в четыре строки через запятую:
- Нужно сделать:
- Обратить внимание:
- Не важно:
- Модель может поправить самостоятельно:
Укажи Summary model. Не переписывай весь отчёт."
    fi

    echo "Собираю фрагменты кода по Location из MD..."
    code_ctx=$(review_collect_code_context_from_report "$repo_root" "$report_path") || code_ctx="(не удалось собрать фрагменты)"

    prompt="Режим: Summary.
Порядок (обязательно):
1) Прочитай MD-отчёт целиком.
2) По каждому Id/Location сверься с кодом (ниже — выдержки; workspace: ${repo_root}).
3) Только после проверки кода вынеси Summary.

Строго соблюдай раздел «Режим Summary» в правилах (${REVIEW_RULES_REL}).
Ответ — только блок Summary (Id через запятую). Имя модели Summary: ${summary_model}.
В «Модель может поправить самостоятельно» и «Не важно» клади Id только если код это подтверждает.

===== ПРАВИЛА (${REVIEW_RULES_REL}) =====
${rules_text}
===== КОНЕЦ ПРАВИЛ =====

Репозиторий: ${repo_root}
Модель Review: ${review_model}
Модель Summary: ${summary_model}

===== СОДЕРЖИМОЕ MD-ОТЧЁТА =====
$(cat "$report_path")
===== КОНЕЦ MD-ОТЧЁТА =====

===== ФРАГМЕНТЫ КОДА ПО LOCATION =====
${code_ctx}
===== КОНЕЦ ФРАГМЕНТОВ ====="

    tmp_out=$(mktemp "${TMPDIR:-/tmp}/review_summary.XXXXXX") || return 1
    echo "Запускаю Summary (модель $summary_model) — MD + проверка кода..."
    if ! review_run_model_prompt "$summary_model" "$prompt" "$tmp_out"; then
        rm -f "$tmp_out"
        echo "Summary не выполнен (ошибка модели)."
        return 1
    fi

    head -c 800 "$tmp_out" || true
    echo ""
    review_append_summary "$report_path" "$summary_model" "$tmp_out" || {
        rm -f "$tmp_out"
        return 1
    }
    rm -f "$tmp_out"

    rel_path="${REVIEW_OUT_DIR_REL}/$(basename "$report_path")"
    echo "Отчёт обновлён: $rel_path"
    review_open_in_cursor "$report_path"
    # Модель Summary нужна этапу 3 (вызывается из run_code_review)
    REVIEW_LAST_SUMMARY_MODEL=$summary_model
    return 0
}

# Категории Id из блока Summary + все Id таблицы находок
# $1 report_path → stdout строки: key<TAB>1, 3
#   auto — модель может поправить сама, must — нужно сделать,
#   attention — обратить внимание, skip — не важно, all — все Id находок
review_extract_summary_categories() {
    local report_path=$1

    if ! command -v python3 &>/dev/null; then
        return 0
    fi

    REVIEW_MD="$report_path" python3 <<'PYEOF'
import os
import re
from pathlib import Path

text = Path(os.environ["REVIEW_MD"]).read_text(encoding="utf-8", errors="replace")

ID_RE = re.compile(r"^\d+[a-zA-Z]?$")
EMPTY = {"—", "-", "–", "нет", "n/a", "na", "none", ""}


def parse_ids(raw: str) -> list:
    out = []
    if raw.strip().lower() in EMPTY:
        return out
    for token in re.split(r"[,;\s]+", raw.strip()):
        token = token.strip().strip("`*").strip()
        if not token or token.lower() in EMPTY:
            continue
        if not ID_RE.match(token):
            continue
        if token not in out:
            out.append(token)
    return out


# Все Id из таблицы находок: строка вида | 1 | severity | ... |
all_ids = []
for line in text.splitlines():
    if not line.lstrip().startswith("|"):
        continue
    cells = [c.strip().strip("`*").strip() for c in line.strip().strip("|").split("|")]
    if len(cells) < 4:
        continue
    if ID_RE.match(cells[0]) and cells[0] not in all_ids:
        all_ids.append(cells[0])

# Блок Summary — последний
parts = re.split(r"(?m)^##\s+Summary\b", text)
summary = parts[-1] if len(parts) > 1 else ""

# Ключ категории по словам в подписи строки (терпимо к формулировкам модели)
def category_key(label: str):
    low = label.lower()
    if "могу исправить" in low or "может поправить" in low or "может исправить" in low:
        return "auto"
    if "нужно сделать" in low or "надо сделать" in low:
        return "must"
    if "внимание" in low:
        return "attention"
    if "не важно" in low or "неважно" in low or "пропустить" in low:
        return "skip"
    return None


cats = {"auto": [], "must": [], "attention": [], "skip": []}
for line in summary.splitlines():
    m = re.match(r"^[\*\-\s]*\**\s*([^:*]{3,80}?)\s*\**\s*:\s*(.*)$", line.strip())
    if not m:
        continue
    key = category_key(m.group(1))
    if not key:
        continue
    for i in parse_ids(m.group(2)):
        if i not in cats[key]:
            cats[key].append(i)

for key in ("auto", "must", "attention", "skip"):
    print(f"{key}\t{', '.join(cats[key])}")
print(f"all\t{', '.join(all_ids)}")
PYEOF
}

# Нормализовать ввод пользователя (Id через запятую/пробел) с проверкой по known
# $1 raw, $2 known ids csv → stdout: "ids csv"; stderr: предупреждения
review_normalize_ids_input() {
    local raw=$1
    local known=$2

    REVIEW_RAW="$raw" REVIEW_KNOWN="$known" python3 <<'PYEOF'
import os
import re
import sys

raw = os.environ.get("REVIEW_RAW", "")
known = [
    t.strip()
    for t in re.split(r"[,;\s]+", os.environ.get("REVIEW_KNOWN", ""))
    if t.strip()
]
ID_RE = re.compile(r"^\d+[a-zA-Z]?$")

ids, unknown, bad = [], [], []
for token in re.split(r"[,;\s]+", raw.strip()):
    token = token.strip().strip("`*")
    if not token:
        continue
    if not ID_RE.match(token):
        bad.append(token)
        continue
    if known and token not in known:
        unknown.append(token)
        continue
    if token not in ids:
        ids.append(token)

if bad:
    print("Пропущено (не похоже на Id): " + ", ".join(bad), file=sys.stderr)
if unknown:
    print("Нет в таблице находок: " + ", ".join(unknown), file=sys.stderr)
print(", ".join(ids))
PYEOF
}

# Вызов Agent CLI с правом править код (без --mode ask).
# OpenRouter-модели (нет в каталоге Agent CLI): думают через API, файлы пишет Agent (auto).
# $1 model, $2 prompt, $3 out_file
review_run_agent_apply() {
    local model=$1
    local prompt=$2
    local out_file=$3
    local agent_cli tmp_err agent_rc=0
    local workspace apply_model apply_prompt
    local tmp_plan=""

    workspace=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
    apply_model="$model"
    apply_prompt="$prompt"

    # OpenRouter/BYOK: Agent CLI id не принимает → план от выбранной модели, apply через auto
    if review_model_uses_openai_compatible "$model"; then
        echo "Fix: думает «${model}» (OpenRouter), правки файлов — Cursor Agent (auto)." >&2
        tmp_plan=$(mktemp "${TMPDIR:-/tmp}/review_fix_plan.XXXXXX") || return 1
        if ! invoke_review_via_openai_compatible "$model" "$prompt" >"$tmp_plan"; then
            rm -f "$tmp_plan"
            return 1
        fi
        if [[ ! -s "$tmp_plan" ]]; then
            echo "OpenRouter вернул пустой план правок." >&2
            rm -f "$tmp_plan"
            return 1
        fi
        apply_model="auto"
        apply_prompt=$(
            cat <<EOF
Примени правки в workspace точно по инструкции ниже.
Не переспрашивай и не предлагай альтернативы — внеси изменения в файлы.
Инструкция подготовлена моделью ${model}.

---
$(cat "$tmp_plan")
---
EOF
        )
        # план тоже кладём в out_file на случай сбоя apply
        cp "$tmp_plan" "$out_file" 2>/dev/null || true
    fi

    agent_cli=$(resolve_agent_cli) || {
        echo "Cursor Agent CLI не найден. Установите CLI: https://cursor.com/docs/cli" >&2
        [[ -n "$tmp_plan" ]] && rm -f "$tmp_plan"
        return 1
    }

    tmp_err=$(mktemp "${TMPDIR:-/tmp}/review_fix_err.XXXXXX") || {
        [[ -n "$tmp_plan" ]] && rm -f "$tmp_plan"
        return 1
    }
    set +e
    # Без --mode ask/plan: agent может писать файлы. --force — без интерактивных confirm на shell.
    # stdin из /dev/null: иначе CLI забирает ввод терминала и следующий read получает EOF
    if [[ "$agent_cli" == "cursor agent" ]]; then
        cursor agent --print --trust --force --model "$apply_model" \
            --workspace "$workspace" "$apply_prompt" \
            </dev/null >"$out_file" 2>"$tmp_err"
        agent_rc=$?
    else
        agent --print --trust --force --model "$apply_model" \
            --workspace "$workspace" "$apply_prompt" \
            </dev/null >"$out_file" 2>"$tmp_err"
        agent_rc=$?
    fi
    set -e

    [[ -n "$tmp_plan" ]] && rm -f "$tmp_plan"

    if [[ "$agent_rc" -ne 0 ]]; then
        echo "Применение правок завершилось с ошибкой (код $agent_rc)." >&2
        echo "Модель (think): $model; apply: $apply_model" >&2
        if [[ -s "$tmp_err" ]]; then
            echo "Ответ CLI:" >&2
            head -c 800 "$tmp_err" | tr '\n' ' ' >&2
            echo >&2
        fi
        rm -f "$tmp_err"
        return 1
    fi
    if [[ -s "$tmp_err" ]] && grep -qiE 'error|cannot|failed' "$tmp_err" 2>/dev/null; then
        head -c 400 "$tmp_err" >&2 || true
        echo >&2
    fi
    rm -f "$tmp_err"
    return 0
}

# Дописать блок Fixes в MD-отчёт (после применения Cursor)
# $1 report_path, $2 fix_model, $3 ids, $4 path to agent log (optional), $5 mode label (optional)
review_append_fixes_note() {
    local report_path=$1
    local fix_model=$2
    local ids=$3
    local log_file=${4:-}
    local mode_label=${5:-применено в коде (Cursor)}
    local snippet=""

    if [[ -n "$log_file" && -f "$log_file" && -s "$log_file" ]]; then
        snippet=$(head -c 1200 "$log_file" | tr '\r' ' ')
    fi

    {
        printf '\n\n---\n\n'
        cat <<EOF
## Fixes

| | |
|---|---|
| **Fix model** | \`${fix_model}\` |
| **Ids** | ${ids} |
| **Режим** | ${mode_label} |

EOF
        if [[ -n "$snippet" ]]; then
            printf '%s\n' "<details><summary>Лог агента (кратко)</summary>"
            printf '\n```\n'
            printf '%s\n' "$snippet"
            printf '```\n\n</details>\n'
        fi
    } >>"$report_path" || {
        echo "Не удалось дописать Fixes в $report_path" >&2
        return 1
    }
    echo "Блок Fixes добавлен в отчёт (модель: $fix_model)." >&2
}

# Дописать в MD полный план правок (без применения в код)
# $1 report_path, $2 fix_model, $3 ids, $4 path to plan body
review_append_fixes_plan() {
    local report_path=$1
    local fix_model=$2
    local ids=$3
    local body_file=$4

    {
        printf '\n\n---\n\n'
        cat <<EOF
## Fixes

| | |
|---|---|
| **Fix model** | \`${fix_model}\` |
| **Ids** | ${ids} |
| **Режим** | план в MD (код не менялся) |

EOF
        if [[ -f "$body_file" && -s "$body_file" ]]; then
            cat "$body_file"
            printf '\n'
        else
            printf '_План пуст._\n'
        fi
    } >>"$report_path" || {
        echo "Не удалось дописать план Fixes в $report_path" >&2
        return 1
    }
    echo "План правок записан в отчёт (модель: $fix_model)." >&2
}

# Третий проход: Id → Cursor(auto) или план в MD
# $1 repo_root, $2 report_path, $3 review_model, $4 summary_model
run_review_apply_fixes() {
    local repo_root=$1
    local report_path=$2
    local review_model=$3
    local summary_model=$4
    local fix_model fixable_ids rules_text prompt tmp_out code_ctx rel_path
    local cats key value auto_ids="" must_ids="" attention_ids="" skip_ids="" all_ids=""
    local choice raw ids_source apply_via_cursor=1

    if [[ -z "$report_path" || ! -f "$report_path" ]]; then
        echo "Нет MD-отчёта для Fix — пропуск."
        return 0
    fi

    cats=$(review_extract_summary_categories "$report_path") || cats=""
    while IFS=$'\t' read -r key value; do
        [[ -z "$key" ]] && continue
        case "$key" in
            auto) auto_ids=$value ;;
            must) must_ids=$value ;;
            attention) attention_ids=$value ;;
            skip) skip_ids=$value ;;
            all) all_ids=$value ;;
        esac
    done <<<"$cats"

    if [[ -z "$all_ids" ]]; then
        echo ""
        echo "---------------------------------------------"
        echo "Fix: в отчёте нет находок — пропуск."
        return 0
    fi

    echo ""
    echo "---------------------------------------------"
    echo "Этап 3 — Fix: правки в коде."
    echo "Отчёт: ${REVIEW_OUT_DIR_REL}/$(basename "$report_path")"
    echo "  могу исправить:   ${auto_ids:-—}"
    echo "  нужно сделать:    ${must_ids:-—}"
    echo "  ваше внимание:    ${attention_ids:-—}"
    echo "  можно пропустить: ${skip_ids:-—}"
    echo "---------------------------------------------"

    # 1) Какие пункты править
    echo "Что править?"
    echo "  Enter — «могу исправить»: ${auto_ids:-—}"
    if [[ -n "$must_ids" ]]; then
        echo "  (в «нужно сделать» — ${must_ids}; можно ввести вручную)"
    fi
    echo "  или Id через запятую (напр. 1, 4); все Id: ${all_ids}"
    while true; do
        raw=$(read_with_exit "Id ('q' — пропустить) > " "false") || {
            echo "Fix пропущен."
            return 0
        }
        raw=$(printf '%s' "$raw" | tr -d '\r' | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')
        if [[ -z "$raw" ]]; then
            if [[ -z "$auto_ids" ]]; then
                echo "В «могу исправить» пусто — введите Id вручную."
                continue
            fi
            fixable_ids=$auto_ids
            ids_source="из отчёта («могу исправить»)"
            break
        fi
        fixable_ids=$(review_normalize_ids_input "$raw" "$all_ids")
        if [[ -z "$fixable_ids" ]]; then
            echo "Не распознан ни один Id из таблицы находок — попробуйте ещё раз."
            continue
        fi
        ids_source="указаны вручную"
        break
    done

    echo "Правим Id: ${fixable_ids} (${ids_source})"
    echo "---------------------------------------------"

    # 2) Cursor auto или только план в MD
    echo "Вносить правки в код с Cursor (auto)?"
    echo "  Enter — да (Cursor Agent auto правит файлы)"
    echo "  n     — нет (план правок только в MD-отчёт)"
    choice=$(read_with_exit "Cursor auto? (Enter = y, n — нет, 'q' — пропустить) > " "false") || {
        echo "Fix пропущен."
        return 0
    }
    if is_yes_answer "$choice"; then
        apply_via_cursor=1
    else
        apply_via_cursor=0
    fi

    if rules_text=$(review_load_rules); then
        :
    else
        rules_text="Режим Fix: исправь только Id из списка. Не коммить."
    fi

    echo "Собираю фрагменты кода по Location..."
    code_ctx=$(review_collect_code_context_from_report "$repo_root" "$report_path") || code_ctx="(не удалось собрать фрагменты)"

    tmp_out=$(mktemp "${TMPDIR:-/tmp}/review_fix.XXXXXX") || return 1

    if [[ "$apply_via_cursor" -eq 1 ]]; then
        fix_model="auto"
        echo "Fix: Cursor Agent (auto) — правки в файлах."
        prompt="Режим: Fix (применить правки в коде по Summary).
Строго соблюдай раздел «Режим Fix» в правилах (${REVIEW_RULES_REL}), если он есть.

Задача: внеси правки в файлы workspace по находкам с Id: ${fixable_ids}
(источник списка: ${ids_source}).

Правила:
1) Править ТОЛЬКО Id из списка выше. Остальные находки не трогай.
2) Опирайся на Finding + актуальный код (фрагменты ниже и файлы в ${repo_root}).
3) Минимальный дифф. Без рефакторинга «заодно».
4) В Dart предпочитай тела с {} и return, а не expression body =>.
5) НЕ создавай git commit / push / MR.
6) После правок кратко: Id → файл → что изменил (Markdown).

===== ПРАВИЛА (${REVIEW_RULES_REL}) =====
${rules_text}
===== КОНЕЦ ПРАВИЛ =====

Репозиторий: ${repo_root}
Модель Review: ${review_model}
Модель Summary: ${summary_model}
Модель Fix: auto (Cursor Agent)
Ids: ${fixable_ids}

===== СОДЕРЖИМОЕ MD-ОТЧЁТА =====
$(cat "$report_path")
===== КОНЕЦ MD-ОТЧЁТА =====

===== ФРАГМЕНТЫ КОДА ПО LOCATION =====
${code_ctx}
===== КОНЕЦ ФРАГМЕНТОВ ====="

        if ! review_run_agent_apply "$fix_model" "$prompt" "$tmp_out"; then
            rm -f "$tmp_out"
            echo "Fix не выполнен (ошибка Cursor Agent)."
            return 1
        fi
        head -c 1200 "$tmp_out" || true
        echo ""
        review_append_fixes_note "$report_path" "$fix_model" "$fixable_ids" "$tmp_out" \
            "применено в коде (Cursor auto)" || true
    else
        # План в MD: выбираем модель (часто OpenRouter)
        echo "Выберите модель для плана правок (без изменения файлов)."
        while true; do
            fix_model=$(prompt_review_model) || {
                rm -f "$tmp_out"
                echo "Fix пропущен."
                return 0
            }
            fix_model=$(printf '%s' "$fix_model" | tr -d '\r' | sed 's/[[:space:]]*$//')
            if ! is_agent_cli_model "$fix_model"; then
                echo "«${fix_model}» нет в списке моделей ревью. Выберите номер/id или 'q'."
                continue
            fi
            break
        done
        echo "Fix plan model: $fix_model"
        echo "---------------------------------------------"

        prompt="Режим: Fix — ТОЛЬКО план правок в Markdown. Код в workspace НЕ меняй (у тебя нет доступа к файлам).

Задача: по находкам Id: ${fixable_ids} подготовь инструкцию правок для человека.
(источник списка: ${ids_source}).

Формат ответа — СТРОГО так (без вступительного текста, без \`\`\`):

- 1. файл: [filename](relative/path/to/file.dart)
  с N строки:
  \`\`\`dart
  строка кода которую нужно вставить или на которую заменить
  следующая строка кода
  \`\`\`
  до M строки

- 2. файл: [other_file.dart](other/path/other_file.dart)
  с A строки:
  \`\`\`dart
  ...
  \`\`\`
  до B строки

  с C строки:
  \`\`\`dart
  ...
  \`\`\`
  до D строки

Правила формата:
1) Нумерация блоков по файлам: «- 1. файл: …», «- 2. файл: …».
2) Путь к файлу — относительный от корня репозитория, в формате Markdown-ссылки: [filename](path/to/file.dart).
3) Несколько диапазонов в одном файле — без повторного «файл:», только новые «с A строки» / «до B строки».
4) Код каждого блока обёрнут в блок \`\`\`dart ... \`\`\` (трёх обратных кавычек).
5) «с N строки» / «до M строки» — номера строк в ТЕКУЩЕМ файле workspace (по Location и фрагментам).
6) Если нужно вставить код между строками — укажи диапазон замены/вставки ясно; код — итоговый фрагмент.
7) Править ТОЛЬКО Id из списка. Минимальный дифф. Без commit/push.
8) В Dart: тела с {} и return, не =>.

===== ПРАВИЛА (${REVIEW_RULES_REL}) =====
${rules_text}
===== КОНЕЦ ПРАВИЛ =====

Репозиторий: ${repo_root}
Модель Review: ${review_model}
Модель Summary: ${summary_model}
Модель плана Fix: ${fix_model}
Ids: ${fixable_ids}

===== СОДЕРЖИМОЕ MD-ОТЧЁТА =====
$(cat "$report_path")
===== КОНЕЦ MD-ОТЧЁТА =====

===== ФРАГМЕНТЫ КОДА ПО LOCATION =====
${code_ctx}
===== КОНЕЦ ФРАГМЕНТОВ ====="

        echo "Генерирую план правок (модель $fix_model) → MD..."
        if ! review_run_model_prompt "$fix_model" "$prompt" "$tmp_out"; then
            rm -f "$tmp_out"
            echo "План Fix не получен (ошибка модели)."
            return 1
        fi
        # План только в MD — в терминал не печатаем тело ответа
        review_append_fixes_plan "$report_path" "$fix_model" "$fixable_ids" "$tmp_out" || true
    fi

    rm -f "$tmp_out"

    rel_path="${REVIEW_OUT_DIR_REL}/$(basename "$report_path")"
    echo "Fix завершён. Отчёт: $rel_path"
    review_open_in_cursor "$report_path"
    return 0
}

# Путь к Cursor state.vscdb (user-added models)
cursor_state_db_path() {
    local home_db
    home_db="${HOME}/Library/Application Support/Cursor/User/globalStorage/state.vscdb"
    if [[ -f "$home_db" ]]; then
        echo "$home_db"
        return 0
    fi
    return 1
}

# Модели, которые пользователь добавил сам (не Cursor), из настроек IDE
# stdout: по одной id на строку
load_user_added_models() {
    local db
    db=$(cursor_state_db_path) || return 0
    if ! command -v python3 &>/dev/null; then
        return 0
    fi
    python3 - "$db" <<'PYEOF' 2>/dev/null || true
import json
import sqlite3
import sys

db_path = sys.argv[1]
key = "src.vs.platform.reactivestorage.browser.reactiveStorageServiceImpl.persistentStorage.applicationUser"
try:
    con = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    row = con.execute("SELECT value FROM ItemTable WHERE key=?", (key,)).fetchone()
    con.close()
    if not row:
        sys.exit(0)
    data = json.loads(row[0])
    models = (data.get("aiSettings") or {}).get("userAddedModels") or []
    seen = set()
    for m in models:
        if not isinstance(m, str):
            continue
        mid = m.strip()
        if not mid or mid in seen:
            continue
        seen.add(mid)
        print(mid)
except Exception:
    sys.exit(0)
PYEOF
}

# Доп. приоритетные модели из .gitlab/review_models (по одной id на строку)
load_review_models_file() {
    local path=".gitlab/review_models"
    local line
    if [[ ! -f "$path" ]]; then
        return 0
    fi
    while IFS= read -r line || [[ -n "$line" ]]; do
        line=$(printf '%s' "$line" | sed 's/#.*//; s/^[[:space:]]*//; s/[[:space:]]*$//')
        [[ -z "$line" ]] && continue
        printf '%s\n' "$line"
    done <"$path"
}

# Парсинг .gitlab/review_env: пары «модель / ключ», пустая строка — разделитель
# Формат файла:
#   inclusionai/ling-3.0-flash:free
#   sk-or-v1-...
#
#   nvidia/nemotron-3-ultra-550b-a55b:free
#   sk-or-v1-...
# stdout: model_id<TAB>key
load_review_env_models() {
    local path=".gitlab/review_env"
    local line model key in_model=0
    if [[ ! -f "$path" ]]; then
        return 0
    fi
    while IFS= read -r line || [[ -n "$line" ]]; do
        line=$(printf '%s' "$line" | sed 's/#.*//; s/^[[:space:]]*//; s/[[:space:]]*$//')
        if [[ -z "$line" ]]; then
            in_model=0
            model=""
            continue
        fi
        if [[ "$in_model" -eq 0 ]]; then
            model="$line"
            in_model=1
        else
            key="$line"
            in_model=0
            # $VAR → значение из окружения
            if [[ "$key" == \$* ]]; then
                local var_name="${key#\$}"
                eval "key=\"\${$var_name:-}\""
            fi
            [[ -z "$model" || -z "$key" ]] && continue
            printf '%s\t%s\n' "$model" "$key"
            model=""
        fi
    done <"$path"
}

# Кэш пар model→key из review_env (файл, чтобы работало на bash 3.2 и вне subshell)
ensure_review_env_keys_cache() {
    if [[ -n "${REVIEW_KEYS_FILE:-}" && -f "${REVIEW_KEYS_FILE}" ]]; then
        return 0
    fi
    REVIEW_KEYS_FILE=$(mktemp "${TMPDIR:-/tmp}/review_keys.XXXXXX") || return 1
    load_review_env_models >"$REVIEW_KEYS_FILE" || true
}

# Есть ли model id в кэше review_env?
review_env_has_model() {
    local model=$1
    local id key
    ensure_review_env_keys_cache || return 1
    while IFS=$'\t' read -r id key; do
        [[ "$id" == "$model" ]] && return 0
    done <"$REVIEW_KEYS_FILE"
    return 1
}

# Списки моделей для выбора: review_env + review_models + user_added
# stdout: id<TAB>display_label
collect_review_model_ids() {
    local line id key seen_csv=","
    ensure_review_env_keys_cache || true

    # 1) .gitlab/review_env
    if [[ -n "${REVIEW_KEYS_FILE:-}" && -f "${REVIEW_KEYS_FILE}" ]]; then
        while IFS= read -r line; do
            [[ -z "$line" ]] && continue
            id="${line%%$'\t'*}"
            [[ -z "$id" ]] && continue
            [[ "$seen_csv" == *",$id,"* ]] && continue
            seen_csv="${seen_csv}${id},"
            printf '%s\t%s\n' "$id" "$id  (review_env)"
        done <"$REVIEW_KEYS_FILE"
    fi

    # 2) .gitlab/review_models
    while IFS= read -r id; do
        [[ -z "$id" ]] && continue
        [[ "$seen_csv" == *",$id,"* ]] && continue
        seen_csv="${seen_csv}${id},"
        printf '%s\t%s\n' "$id" "$id"
    done <<<"$(load_review_models_file)"

    # 3) user-added из Cursor IDE
    while IFS= read -r id; do
        [[ -z "$id" ]] && continue
        [[ "$seen_csv" == *",$id,"* ]] && continue
        seen_csv="${seen_csv}${id},"
        printf '%s\t%s\n' "$id" "$id  (Cursor IDE)"
    done <<<"$(load_user_added_models)"
}

# Base URL OpenAI-compatible (OpenRouter и т.п.) из настроек Cursor IDE
load_openai_compatible_base_url() {
    local db
    db=$(cursor_state_db_path) || {
        echo "https://openrouter.ai/api/v1"
        return 0
    }
    if ! command -v python3 &>/dev/null; then
        echo "https://openrouter.ai/api/v1"
        return 0
    fi
    python3 - "$db" <<'PYEOF' 2>/dev/null || echo "https://openrouter.ai/api/v1"
import json
import sqlite3
import sys

db_path = sys.argv[1]
key = "src.vs.platform.reactivestorage.browser.reactiveStorageServiceImpl.persistentStorage.applicationUser"
try:
    con = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    row = con.execute("SELECT value FROM ItemTable WHERE key=?", (key,)).fetchone()
    con.close()
    data = json.loads(row[0]) if row else {}
    url = (data.get("openAIBaseUrl") or "").strip().rstrip("/")
    print(url or "https://openrouter.ai/api/v1")
except Exception:
    print("https://openrouter.ai/api/v1")
PYEOF
}

# API key для ваших моделей: только из env (ключ из Cursor IDE CLI не читает)
resolve_review_openai_api_key() {
    if [[ -n "${OPENROUTER_API_KEY:-}" ]]; then
        printf '%s' "$OPENROUTER_API_KEY"
        return 0
    fi
    if [[ -n "${OPENAI_API_KEY:-}" ]]; then
        printf '%s' "$OPENAI_API_KEY"
        return 0
    fi
    if [[ -n "${REVIEW_OPENAI_API_KEY:-}" ]]; then
        printf '%s' "$REVIEW_OPENAI_API_KEY"
        return 0
    fi
    return 1
}

# Модель есть в каталоге Cursor Agent CLI (agent models)?
is_agent_cli_catalog_model() {
    local model=$1
    local catalog id
    catalog=$(load_agent_models_catalog 2>/dev/null) || return 1
    while IFS= read -r line; do
        id="${line%%|*}"
        [[ "$id" == "$model" ]] && return 0
    done <<<"$catalog"
    return 1
}

# Модель допустима для этапа Fix через Agent: любая из «Выбор модели для ревью»
# (ваши review_env / review_models / userAdded + меню Cursor + каталог Agent CLI).
is_agent_cli_model() {
    local model=$1
    local id line

    [[ -z "$model" ]] && return 1

    while IFS= read -r line; do
        [[ -z "$line" ]] && continue
        id="${line%%$'\t'*}"
        [[ "$id" == "$model" ]] && return 0
    done <<<"$(collect_review_model_ids)"

    for id in "${REVIEW_CURSOR_MENU_IDS[@]}"; do
        [[ "$id" == "$model" ]] && return 0
    done

    if is_agent_cli_catalog_model "$model"; then
        return 0
    fi
    return 1
}

# Модель из «ваших» (review_env / review_models / Cursor userAdded)?
is_user_added_review_model() {
    local model=$1
    local id line
    ensure_review_env_keys_cache || true
    if review_env_has_model "$model"; then
        return 0
    fi
    while IFS= read -r id; do
        [[ "$id" == "$model" ]] && return 0
    done <<<"$(load_review_models_file)"$'\n'"$(load_user_added_models)"
    return 1
}

# Ключ модели из .gitlab/review_env (кэш-файл)
# stdout: ключ; return 1 если нет
get_review_model_key() {
    local model=$1
    local id key
    ensure_review_env_keys_cache || return 1
    while IFS=$'\t' read -r id key; do
        if [[ "$id" == "$model" && -n "$key" ]]; then
            printf '%s' "$key"
            return 0
        fi
    done <"$REVIEW_KEYS_FILE"
    return 1
}

# Ревью через OpenAI-compatible API (OpenRouter) — для моделей, которых нет в agent CLI
# $1 model, $2 prompt → stdout ответ
invoke_review_via_openai_compatible() {
    local model=$1
    local prompt=$2
    local base_url api_key tmp_prompt tmp_out http_code

    base_url=$(load_openai_compatible_base_url)

    # Ключ: .gitlab/review_env для этой модели → иначе env
    local per_model_key=""
    per_model_key=$(get_review_model_key "$model" 2>/dev/null) || true
    if [[ -n "$per_model_key" ]]; then
        api_key="$per_model_key"
    elif [[ -n "${OPENROUTER_API_KEY:-}" ]]; then
        api_key="$OPENROUTER_API_KEY"
    elif [[ -n "${OPENAI_API_KEY:-}" ]]; then
        api_key="$OPENAI_API_KEY"
    elif [[ -n "${REVIEW_OPENAI_API_KEY:-}" ]]; then
        api_key="$REVIEW_OPENAI_API_KEY"
    else
        echo "Модель \"$model\" — ваша (OpenRouter/BYOK), Cursor Agent CLI её не принимает." >&2
        echo "В чате IDE она работает, а CLI — только каталог Cursor (composer/claude/gpt/...)." >&2
        echo "" >&2
        echo "Для ревью этой моделью:" >&2
        echo "  1. Скопируйте .gitlab/review_env.example → .gitlab/review_env" >&2
        echo "     и укажите модель + ключ (две строки на модель)." >&2
        echo "  2. Или: export OPENROUTER_API_KEY='sk-or-...'" >&2
        echo "Затем снова запустите 9 / 91–93." >&2
        echo "Base URL из Cursor: $base_url" >&2
        return 1
    fi

    if ! command -v python3 &>/dev/null; then
        echo "Нужен python3 для вызова OpenRouter." >&2
        return 1
    fi

    tmp_prompt=$(mktemp "${TMPDIR:-/tmp}/review_prompt.XXXXXX") || return 1
    tmp_out=$(mktemp "${TMPDIR:-/tmp}/review_out.XXXXXX") || {
        rm -f "$tmp_prompt"
        return 1
    }
    printf '%s' "$prompt" >"$tmp_prompt"

    echo "Маршрут: OpenAI-compatible API ($base_url), модель $model" >&2

    http_code=$(
        REVIEW_BASE="$base_url" REVIEW_KEY="$api_key" REVIEW_MODEL="$model" \
            REVIEW_PROMPT_FILE="$tmp_prompt" REVIEW_OUT="$tmp_out" python3 <<'PYEOF'
import json
import os
import sys
import urllib.error
import urllib.request

base = os.environ["REVIEW_BASE"].rstrip("/")
key = os.environ["REVIEW_KEY"]
model = os.environ["REVIEW_MODEL"]
prompt_path = os.environ["REVIEW_PROMPT_FILE"]
out_path = os.environ["REVIEW_OUT"]

with open(prompt_path, encoding="utf-8") as fh:
    prompt = fh.read()

url = base + "/chat/completions"
body = {
    "model": model,
    "messages": [
        {
            "role": "system",
            "content": "Ты senior code reviewer / fixer. Соблюдай .gitlab/review_rules.md из начала user-сообщения. Режим Review, Summary или Fix — как указано в промпте. Отвечай на русском. В Review/Summary — строго Markdown по правилам. В Fix — правь код и кратко опиши изменения.",
        },
        {"role": "user", "content": prompt},
    ],
    "temperature": 0.2,
}
data = json.dumps(body).encode("utf-8")
req = urllib.request.Request(
    url,
    data=data,
    headers={
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/local/sh_gitlab_review",
        "X-Title": "sh_gitlab review",
    },
    method="POST",
)
try:
    with urllib.request.urlopen(req, timeout=300) as resp:
        raw = resp.read().decode("utf-8", errors="replace")
        code = getattr(resp, "status", 200)
except urllib.error.HTTPError as exc:
    err_body = exc.read().decode("utf-8", errors="replace")
    with open(out_path, "w", encoding="utf-8") as fh:
        fh.write(err_body or str(exc))
    print(exc.code)
    sys.exit(0)
except Exception as exc:
    with open(out_path, "w", encoding="utf-8") as fh:
        fh.write(str(exc))
    print(0)
    sys.exit(0)

try:
    payload = json.loads(raw)
    content = payload["choices"][0]["message"]["content"]
except Exception:
    content = raw

with open(out_path, "w", encoding="utf-8") as fh:
    fh.write(content if isinstance(content, str) else json.dumps(content, ensure_ascii=False))
print(code)
PYEOF
    ) || http_code=0

    rm -f "$tmp_prompt"

    if [[ "$http_code" != "200" ]]; then
        echo "OpenRouter/API ошибка HTTP ${http_code:-?}:" >&2
        head -c 2000 "$tmp_out" >&2 || true
        echo >&2
        rm -f "$tmp_out"
        return 1
    fi

    cat "$tmp_out"
    rm -f "$tmp_out"
    return 0
}

# Список моделей Cursor Agent: "id|display"
# stdout: id|display
load_agent_models_catalog() {
    local agent_cli raw line id display
    agent_cli=$(resolve_agent_cli) || return 1

    if [[ "$agent_cli" == "cursor agent" ]]; then
        raw=$(cursor agent models 2>/dev/null) || raw=$(agent --list-models 2>/dev/null) || return 1
    else
        raw=$(agent models 2>/dev/null) || raw=$(agent --list-models 2>/dev/null) || return 1
    fi

    while IFS= read -r line; do
        [[ -z "$line" ]] && continue
        [[ "$line" == "Available models" ]] && continue
        [[ "$line" == Tip:* ]] && continue
        if [[ "$line" =~ ^([A-Za-z0-9_./:+-]+)[[:space:]]+-[[:space:]]+(.+)$ ]]; then
            id="${BASH_REMATCH[1]}"
            display="${BASH_REMATCH[2]}"
            printf '%s|%s\n' "$id" "$display"
        fi
    done <<<"$raw"
}

# Выбор модели: сначала ваши (review_env + review_models + user_added), затем Cursor
# stdout: model id
prompt_review_model() {
    local -a preferred_ids=()
    local -a preferred_labels=()
    local -a cursor_ids=()
    local -a cursor_labels=()
    local -a all_ids=()
    local -a all_labels=()
    local line id display seen_csv choice idx default_idx=1

    seen_csv=","

    while IFS= read -r line; do
        [[ -z "$line" ]] && continue
        id="${line%%$'\t'*}"
        display="${line#*$'\t'}"
        [[ -z "$id" ]] && continue
        [[ "$seen_csv" == *",$id,"* ]] && continue
        preferred_ids+=("$id")
        preferred_labels+=("$display")
        seen_csv="${seen_csv}${id},"
    done <<<"$(collect_review_model_ids)"

    catalog=$(load_agent_models_catalog) || catalog=""
    for id in "${REVIEW_CURSOR_MENU_IDS[@]}"; do
        [[ -z "$id" ]] && continue
        [[ "$seen_csv" == *",$id,"* ]] && continue
        display=""
        if [[ -n "$catalog" ]]; then
            while IFS= read -r line; do
                [[ -z "$line" ]] && continue
                if [[ "${line%%|*}" == "$id" ]]; then
                    display="${line#*|}"
                    break
                fi
            done <<<"$catalog"
        fi
        if [[ -z "$display" ]]; then
            if [[ "$id" == "auto" ]]; then
                display="Auto (default)"
            else
                display="$id"
            fi
        fi
        cursor_ids+=("$id")
        cursor_labels+=("$display")
        seen_csv="${seen_csv}${id},"
    done

    echo "Выбор модели для ревью" >&2
    echo "---------------------------------------------" >&2
    if [[ ${#preferred_ids[@]} -gt 0 ]]; then
        ensure_review_env_keys_cache || true
        if [[ -n "${REVIEW_KEYS_FILE:-}" && -s "${REVIEW_KEYS_FILE}" ]]; then
            echo "  Ваши модели: ключи из .gitlab/review_env (и/или env)." >&2
        elif resolve_review_openai_api_key >/dev/null 2>&1; then
            echo "  Ваши модели: через OpenRouter (ключ найден в env)." >&2
        else
            echo "  Ваши модели: задайте ключ в .gitlab/review_env или export OPENROUTER_API_KEY." >&2
        fi
    fi
    idx=0
    if [[ ${#preferred_ids[@]} -gt 0 ]]; then
        echo "  --- ваши (не Cursor) ---" >&2
        for i in "${!preferred_ids[@]}"; do
            idx=$((idx + 1))
            all_ids+=("${preferred_ids[$i]}")
            all_labels+=("${preferred_labels[$i]}")
            echo "  $idx) ${preferred_labels[$i]}" >&2
        done
    else
        echo "  (своих моделей не найдено — укажите id в .gitlab/review_env" >&2
        echo "   или .gitlab/review_models; либо добавьте в Cursor Settings → Models)" >&2
    fi

    if [[ ${#cursor_ids[@]} -gt 0 ]]; then
        echo "  --- Cursor ---" >&2
        for i in "${!cursor_ids[@]}"; do
            idx=$((idx + 1))
            all_ids+=("${cursor_ids[$i]}")
            all_labels+=("${cursor_labels[$i]}")
            echo "  $idx) ${cursor_ids[$i]}  — ${cursor_labels[$i]}" >&2
        done
    fi

    if [[ ${#all_ids[@]} -eq 0 ]]; then
        echo "  (список пуст — введите id модели вручную, напр. auto)" >&2
    fi
    echo "---------------------------------------------" >&2
    echo "Enter — №${default_idx}; номер; id модели; 'l' — полный список agent models" >&2

    while true; do
        choice=$(read_with_exit "Модель ('q' — отмена) > " "false") || return 1
        if [[ -z "$choice" ]]; then
            if [[ ${#all_ids[@]} -ge 1 ]]; then
                printf '%s\n' "${all_ids[$((default_idx - 1))]}"
                return 0
            fi
            echo "Список пуст — введите id модели." >&2
            continue
        fi
        if [[ "$choice" == "l" || "$choice" == "L" ]]; then
            if [[ -n "$catalog" ]]; then
                echo "Полный список agent models:" >&2
                while IFS= read -r line; do
                    [[ -z "$line" ]] && continue
                    echo "  ${line%%|*}  — ${line#*|}" >&2
                done <<<"$catalog"
            else
                echo "Не удалось получить полный список (agent models)." >&2
            fi
            continue
        fi
        if [[ "$choice" =~ ^[0-9]+$ ]]; then
            if [[ "$choice" -ge 1 && "$choice" -le ${#all_ids[@]} ]]; then
                printf '%s\n' "${all_ids[$((choice - 1))]}"
                return 0
            fi
            echo "Номер вне диапазона 1..${#all_ids[@]}." >&2
            continue
        fi
        # Произвольный id модели
        printf '%s\n' "$choice"
        return 0
    done
}

# Собрать diff для scope: uncommitted | last_commit | branch
# stdout: текст (stat + diff), stderr: описание
review_collect_diff() {
    local scope=$1
    local parent merge_base stat_out diff_out label
    local max=$REVIEW_DIFF_MAX_BYTES

    case "$scope" in
        uncommitted)
            label="незакоммиченные изменения (working tree + index vs HEAD)"
            if git diff HEAD --quiet 2>/dev/null \
                && [[ -z "$(git ls-files --others --exclude-standard 2>/dev/null)" ]]; then
                echo "Нет незакоммиченных изменений для ревью." >&2
                return 1
            fi
            stat_out=$(git diff HEAD --stat 2>/dev/null)
            diff_out=$(git diff HEAD 2>/dev/null)
            if [[ -n "$(git ls-files --others --exclude-standard 2>/dev/null)" ]]; then
                stat_out="${stat_out}"$'\n'"--- untracked ---"$'\n'"$(git ls-files --others --exclude-standard)"
            fi
            ;;
        last_commit)
            # С родителя HEAD до рабочей директории: последний коммит + текущие правки
            label="с последнего коммита (HEAD~1..working tree, включая незакоммиченные)"
            if ! git rev-parse --verify HEAD >/dev/null 2>&1; then
                echo "Нет коммитов в репозитории." >&2
                return 1
            fi
            if git rev-parse --verify HEAD~1 >/dev/null 2>&1; then
                if git diff HEAD~1 --quiet 2>/dev/null \
                    && [[ -z "$(git ls-files --others --exclude-standard 2>/dev/null)" ]]; then
                    echo "Нет изменений с последнего коммита (включая working tree)." >&2
                    return 1
                fi
                stat_out=$(git diff HEAD~1 --stat 2>/dev/null)
                diff_out=$(git diff HEAD~1 2>/dev/null)
            else
                # Единственный коммит: его содержимое + локальные правки поверх HEAD
                label="с корня репозитория (единственный коммит + незакоммиченные)"
                stat_out=$(git show --stat --format= HEAD 2>/dev/null)
                local_diff=$(git diff HEAD --stat 2>/dev/null)
                [[ -n "$local_diff" ]] && stat_out="${stat_out}"$'\n'"${local_diff}"
                diff_out="$(git show --format= HEAD 2>/dev/null)"$'\n'"$(git diff HEAD 2>/dev/null)"
                if [[ -z "$(printf '%s' "$diff_out" | sed '/^[[:space:]]*$/d')" ]]; then
                    echo "Нет изменений для ревью." >&2
                    return 1
                fi
            fi
            if [[ -n "$(git ls-files --others --exclude-standard 2>/dev/null)" ]]; then
                stat_out="${stat_out}"$'\n'"--- untracked ---"$'\n'"$(git ls-files --others --exclude-standard)"
            fi
            ;;
        branch)
            label="все изменения ветки"
            parent=$(detect_parent_branch) || true
            if [[ -z "$parent" ]]; then
                parent="development"
            fi
            if ! git rev-parse --verify "$parent" >/dev/null 2>&1; then
                if git rev-parse --verify "origin/$parent" >/dev/null 2>&1; then
                    parent="origin/$parent"
                else
                    echo "Не найдена базовая ветка ($parent). Укажите development локально." >&2
                    return 1
                fi
            fi
            merge_base=$(git merge-base HEAD "$parent" 2>/dev/null) || {
                echo "Не удалось найти merge-base с $parent." >&2
                return 1
            }
            label="все изменения ветки (от $parent / merge-base ${merge_base:0:8}, включая незакоммиченные)"
            if git diff "$merge_base" HEAD --quiet 2>/dev/null \
                && git diff HEAD --quiet 2>/dev/null \
                && [[ -z "$(git ls-files --others --exclude-standard 2>/dev/null)" ]]; then
                echo "Нет изменений в ветке относительно $parent." >&2
                return 1
            fi
            # Коммиты ветки + локальные правки поверх HEAD
            stat_out=$(git diff "$merge_base" --stat 2>/dev/null)
            diff_out=$(git diff "$merge_base" 2>/dev/null)
            ;;
        *)
            echo "Неизвестный scope ревью: $scope" >&2
            return 1
            ;;
    esac

    echo "Область: $label" >&2

    if [[ ${#diff_out} -gt $max ]]; then
        echo "Diff обрезан до ${max} байт для промпта." >&2
        diff_out="${diff_out:0:max}"$'\n'"... [truncated] ..."
    fi

    printf '%s\n' "--- stat ---"
    printf '%s\n' "$stat_out"
    printf '%s\n' ""
    printf '%s\n' "--- diff ---"
    printf '%s\n' "$diff_out"
}

# Запуск ревью: uncommitted | last_commit | branch
run_code_review() {
    local scope=$1
    local repo_root model diff_payload prompt
    local tmp_out
    local rules_text rules_path report_path

    repo_root=$(git rev-parse --show-toplevel 2>/dev/null) || {
        echo "Не git-репозиторий."
        return 1
    }

    model=$(prompt_review_model) || return 1
    # Убрать CR/хвостовые пробелы на всякий случай
    model=$(printf '%s' "$model" | tr -d '\r' | sed 's/[[:space:]]*$//')
    echo "Модель: $model"
    echo "---------------------------------------------"

    if ! diff_payload=$(review_collect_diff "$scope"); then
        return 1
    fi

    rules_path=$(review_rules_path) || rules_path="${repo_root}/${REVIEW_RULES_REL}"
    if rules_text=$(review_load_rules); then
        echo "Правила: ${REVIEW_RULES_REL}"
    else
        rules_text="Формат ответа (режим Review):
1) Краткий вердикт (1–2 предложения).
2) Таблица находок: Id | Severity | Location (file:line) | Finding — по убыванию severity.
   Id: 1, 2, 2a, 3, …
3) Если критичных проблем нет — так и напиши одной строкой после вердикта.
Location оформляй как markdown-ссылку [\`file:line\`](../../file#Lline) — префикс ../../ нужен, т.к. отчёт сохраняется в .gitlab/reviews/.
Не предлагай править код сам и не выдумывай файлы вне diff. Фокус: баги, регрессии, риски, безопасность, явные ошибки логики."
    fi

    prompt="Режим: Review (разбор diff → Markdown).
Сначала прочитай и строго соблюдай раздел «Режим Review» в правилах ниже (файл ${REVIEW_RULES_REL}).
Затем сделай code review по diff. Ответ — только Markdown по этим правилам.
Обязательно нумеруй находки колонкой Id (1, 2, 2a, …) — по ним позже сделают Summary.

===== ПРАВИЛА (${REVIEW_RULES_REL}) =====
${rules_text}
===== КОНЕЦ ПРАВИЛ =====

Репозиторий: ${repo_root}
Область: ${scope}
Путь к правилам в репо: ${rules_path}

${diff_payload}"

    echo "Этап 1 — Review: запускаю (модель $model), может занять несколько минут..."
    echo "---------------------------------------------"

    tmp_out=$(mktemp "${TMPDIR:-/tmp}/review_body.XXXXXX") || return 1
    if ! review_run_model_prompt "$model" "$prompt" "$tmp_out"; then
        rm -f "$tmp_out"
        return 1
    fi

    # Кратко в терминал
    head -c 1200 "$tmp_out" || true
    echo ""
    echo "---------------------------------------------"
    report_path=$(review_save_and_open_report "$repo_root" "$model" "$scope" "$tmp_out") || report_path=""
    rm -f "$tmp_out"
    echo "Ревью завершено.${report_path:+ Отчёт открыт в Cursor.}"

    if [[ -n "$report_path" && -f "$report_path" ]]; then
        # Этап 2: Summary другой моделью по MD
        REVIEW_LAST_SUMMARY_MODEL=""
        run_review_md_summary "$repo_root" "$report_path" "$model" || true
        # Этап 3: правки в коде (модель + выбор пунктов)
        if [[ -n "${REVIEW_LAST_SUMMARY_MODEL:-}" ]]; then
            run_review_apply_fixes "$repo_root" "$report_path" "$model" \
                "$REVIEW_LAST_SUMMARY_MODEL" || true
        fi
    fi
}

# Подменю 9: ревью (цепочки: 91, 92, 93)
# Пайплайн: 1) Review → 2) Summary → 3) Fix (правки в коде)
git_review_menu() {
    local choice
    echo "Code review (3 этапа: Review → Summary → Fix)"
    echo "  1) незакоммиченные изменения     (быстро: 91)"
    echo "  2) с последнего коммита (+ текущие) (быстро: 92)"
    echo "  3) все изменения в ветке         (быстро: 93)"
    echo "---------------------------------------------"
    choice=$(read_with_exit "Выбор (1/2/3, 'q' — отмена) > " "false") || return
    case "$choice" in
        1)
            run_code_review uncommitted
            ;;
        2)
            run_code_review last_commit
            ;;
        3)
            run_code_review branch
            ;;
        *)
            echo "Неверный выбор: $choice (ожидалось 1, 2 или 3)."
            return 1
            ;;
    esac
}

# Основной цикл скрипта
while true; do
    display_menu
    choice=$(read_with_exit "Выбор команды > " "true") || continue

    case $choice in
        b)
            git_create_branch
            ;;
        init)
            git_push_set_upstream
            ;;
        11c)
            # Быстрый коммит: 1 → 1 → c → Enter
            git_commit_cursor_auto
            ;;
        1)
            git_commit
            ;;
        1s)
            # Сбросить на коммит (hard reset + force-with-lease)
            git_revert_pushed
            ;;
        1s1)
            # Сбросить на предыдущий коммит (пункт 1s → 1)
            git_reset_hard_last
            ;;
        1s2)
            # Сбросить на коммит по хэшу (пункт 1s → 2)
            git_reset_hard_by_hash
            ;;
        1s3)
            # Сбросить на коммит: хэш или N назад (пункт 1s → 3)
            git_reset_hard_to_point
            ;;
        2)
            git_push
            ;;
        2m)
            git_merge_request_menu
            ;;
        2m1)
            # Создать MR (пункт 2m → 1)
            git_create_merge_request
            ;;
        2m2)
            # Снять Draft (пункт 2m → 2)
            gitlab_undraft_mr_current_branch
            ;;
        2m3)
            # Переименовать MR (пункт 2m → 3)
            gitlab_rename_mr_current_branch
            ;;
        2m4)
            # Поиск MR по ключевым словам (пункт 2m → 4)
            gitlab_search_mr_by_keywords
            ;;
        2m5)
            # Поиск MR по словам в названиях коммитов (пункт 2m → 5)
            gitlab_search_mr_by_commit_keywords
            ;;
        3)
            git_push_force
            ;;
        4)
            git_pull
            ;;
        5)
            git_rebase
            ;;
        5s)
            # Smart rebase + agent resolve (ТЕСТОВЫЙ, не гарантировано)
            git_smart_rebase
            ;;
        6)
            git_cherry_pick
            ;;
        6s)
            # Сквош всех коммитов текущей ветки в один
            git_squash_branch
            ;;
        7)
            git_remote_prune
            ;;
        8)
            git_tag
            ;;
        9)
            git_review_menu
            ;;
        10)
            # MR статистика / список за период
            gitlab_mr_stats_menu
            ;;
        i|I)
            display_commands_info
            ;;
        101)
            # Статистика объёма (пункт 10 → 1)
            gitlab_mr_code_volume_stats summary
            ;;
        102)
            # Список merged MR (пункт 10 → 2)
            gitlab_mr_code_volume_stats list
            ;;
        q)
            clear 2>/dev/null || true
            exit 0
            ;;
        # Двухзначные коды для вложенных пунктов
        11)
            # Создание нового коммита (пункт 1 -> 1, без Cursor)
            git add .
            prefix=$(apply_resolve_commit_prefix) || true
            if [[ -n "$prefix" ]]; then
                commit_message="$prefix | Новый коммит"
            else
                echo "Префикс задачи (PROJ-N) не найден ни в ветке, ни в последних коммитах. Продолжаем без префикса."
                commit_message="Новый коммит"
            fi
            git commit -m "$commit_message"
            echo "Коммит успешно создан!"
            ;;
        12)
            # Изменение сообщения последнего коммита (пункт 1 -> 2)
            echo "Изменение сообщения последнего коммита..."
            if is_last_commit_pushed; then
                echo "Последний коммит уже был запушен. Изменение сообщения невозможно."
                continue
            fi
            echo "Текущее сообщение последнего коммита:"
            git log -1 --pretty=%B
            echo "---------------------------------------------"
            current_msg=$(git log -1 --pretty=%s)
            new_message=$(read_with_exit "Введите новое сообщение коммита ('q' для отмены) > " "false" "$current_msg") || continue
            git commit --amend -m "$new_message" --no-edit
            echo "Сообщение последнего коммита успешно изменено!"
            ;;
        13)
            # Отмена последнего коммита (пункт 1 -> 3)
            echo "Проверяю, можно ли отменить последний коммит..."
            if is_last_commit_pushed; then
                echo "Последний коммит уже был запушен. Отмена невозможна."
            else
                echo "Отменяю последний коммит..."
                git reset --soft HEAD~1
                echo "Последний коммит отменен. Изменения сохранены в рабочей директории."
            fi
            ;;
        21)
            # git push (пункт 2)
            git_push
            ;;
        41)
            # git pull (пункт 4)
            git_pull
            ;;
        51)
            # Ребейз на родительскую ветку (пункт 5 -> 1)
            git_rebase_parent
            ;;
        52)
            # Ребейз fetch development (пункт 5 -> 2)
            git_rebase_onto "development"
            ;;
        53)
            # Ребейз с указанием ветки (пункт 5 -> 3)
            branch=$(read_with_exit "Введите название ветки (или 'q' для отмены): " "false") || continue
            git_rebase_onto "$branch"
            ;;
        54)
            # Отмена ребейза (пункт 5 -> 4)
            git rebase --abort || echo "Нет активного rebase для отмены."
            ;;
        5s1)
            # Smart rebase на родительскую (пункт 5s -> 1)
            git_smart_rebase_parent
            ;;
        5s2)
            # Smart rebase на development (пункт 5s -> 2)
            git_smart_rebase_onto "development"
            ;;
        5s3)
            # Smart rebase на указанную ветку (пункт 5s -> 3)
            branch=$(read_with_exit "Введите название ветки (или 'q' для отмены): " "false") || continue
            git_smart_rebase_onto "$branch"
            ;;
        61)
            # Выполнение git cherry-pick с указанием хэша (пункт 6 -> 1)
            commit_hash=$(read_with_exit "Введите хэш коммита ('q' для отмены): " "false") || continue
            git cherry-pick "$commit_hash"
            ;;
        62)
            # Отмена cherry-pick (пункт 6 -> 2)
            git cherry-pick --abort || echo "Нет активного cherry-pick для отмены."
            ;;
        81)
            # ui_kit tag (пункт 8 -> 1)
            ui_kit_tag_menu
            ;;
        811)
            # Создать новый ui_kit тег (пункт 8 -> 1 -> 1)
            git_tag_create_new
            ;;
        812)
            # Обновить последний ui_kit тег (пункт 8 -> 1 -> 2)
            git_tag_update
            ;;
        82)
            # CI/CD tag Codemagic (пункт 8 -> 2)
            cicd_tag_menu
            ;;
        8291)
            # Обновить существующий CI/CD тег (пункт 8 -> 2 -> 91)
            cicd_tag_update_existing
            ;;
        91)
            # Ревью незакоммиченных (пункт 9 -> 1)
            run_code_review uncommitted
            ;;
        92)
            # Ревью с последнего коммита + текущие изменения (пункт 9 -> 2)
            run_code_review last_commit
            ;;
        93)
            # Ревью всех изменений ветки (пункт 9 -> 3)
            run_code_review branch
            ;;
        *)
            echo "Неверный выбор. Пожалуйста, попробуйте снова."
            ;;
    esac

    echo ""
    read -r -e -p "Нажмите Enter, чтобы продолжить..." _ || true
done
