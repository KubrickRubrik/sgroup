import { spawn, type ChildProcess } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  emptyFixBullets,
  EXPLAIN_TITLE,
  formatStudyChipLabel,
  findSeverityLine,
  formatReviewScopeLine,
  formatSeverityLine,
  parseRereviewSelection,
  parseReviewSeverityLine,
  REVIEW_SEVERITY_RE,
  reviewLevel,
  type ReviewFixBullets,
  type ReviewLevel,
} from './discordApi';
import {
  ReviewDepth,
  ReviewKind,
  reviewDepthCommand,
  reviewDepthToken,
  reviewScopeToken,
} from './reviewPending';

export type ReviewFixGroups = {
  counts: { H: number; M: number; L: number };
  groups: { H: string[]; M: string[]; L: string[] };
};

function collectReviewGroups(
  lines: string[],
): { ok: true; groups: ReviewFixGroups['groups'] } | { ok: false; message: string } {
  const groups: ReviewFixGroups['groups'] = { H: [], M: [], L: [] };
  const seen = new Set<ReviewLevel>();
  let current: ReviewLevel | undefined;
  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) {
      continue;
    }
    const header = /^([HMLS])\s*$/i.exec(trimmed);
    if (header) {
      const letter = reviewLevel(header[1]);
      if (!letter) {
        continue;
      }
      if (seen.has(letter)) {
        return { ok: false, message: `Повтор заголовка группы ${letter} в файле ревью` };
      }
      seen.add(letter);
      current = letter;
      continue;
    }
    if (/^-\s+/.test(trimmed)) {
      if (!current) {
        return { ok: false, message: 'Пункт ревью вне группы H/M/L' };
      }
      groups[current].push(trimmed.replace(/^-\s+/, '').trim());
    }
  }
  return { ok: true, groups };
}

/** Parse review attachment body into H/M/L groups. Legacy S headers map to L. */
export function parseReviewFixGroups(
  text: string,
): { ok: true; counts: ReviewFixGroups['counts']; groups: ReviewFixGroups['groups'] } | { ok: false; message: string } {
  const lines = text.split(/\r?\n/);
  const header = (lines[2] || '').trim();
  const parsedLine = parseReviewSeverityLine(header);
  const sevMatch = parsedLine?.severity.match(REVIEW_SEVERITY_RE);
  const collected = collectReviewGroups(lines.slice(3));
  if (!collected.ok) {
    return collected;
  }
  // A re-review file keeps the chosen indexes on line 3. `H:1 | M:1 | L:1`
  // looks like a count line, and a new defect must not fail that check.
  const rereviewFile = /^(?:Реревью|Rereview)\b/i.test((lines[0] || '').trim());
  if (rereviewFile) {
    if (!parseRereviewSelection(header)) {
      return { ok: false, message: 'В файле реревью нет выбранных пунктов' };
    }
    return {
      ok: true,
      counts: {
        H: collected.groups.H.length,
        M: collected.groups.M.length,
        L: collected.groups.L.length,
      },
      groups: collected.groups,
    };
  }
  if (parsedLine && sevMatch) {
    const counts = {
      H: Number(sevMatch[1]),
      M: Number(sevMatch[2]),
      L: Number(sevMatch[4]),
    };
    for (const letter of ['H', 'M', 'L'] as const) {
      const expected = counts[letter];
      const actual = collected.groups[letter].length;
      if (expected === 0 && actual === 0) {
        continue;
      }
      if (expected !== actual) {
        return {
          ok: false,
          message: `Группа ${letter}: в строке severity ${expected}, в теле ${actual}`,
        };
      }
    }
    return { ok: true, counts, groups: collected.groups };
  }
  if (parseRereviewSelection(header)) {
    return {
      ok: true,
      counts: {
        H: collected.groups.H.length,
        M: collected.groups.M.length,
        L: collected.groups.L.length,
      },
      groups: collected.groups,
    };
  }
  return { ok: false, message: 'В файле ревью нет строки H:N | M:N | L:N' };
}

/** Indexes whose «Что чинить» is not exactly «исправлено». */
export function rereviewOpenIndexes(groups: ReviewFixGroups['groups']): ReviewFixBullets {
  const bullets = emptyFixBullets();
  for (const level of ['H', 'M', 'L'] as const) {
    groups[level].forEach((text, index) => {
      const fix = splitFixBullet(text).fix.replace(/\.+$/g, '').trim().toLowerCase();
      if (fix !== 'исправлено') {
        bullets[level].push(index + 1);
      }
    });
  }
  return bullets;
}

export type ReviewFixRow = {
  level: 'High' | 'Medium' | 'Low';
  /** 1-based index of the bullet inside its H, M or L group. */
  index: number;
  broken: string;
  fix: string;
  where: string;
};

/** Split one group bullet into the three table cells. A line without the labels stays in «что сломано». */
export function splitFixBullet(text: string): { broken: string; fix: string; where: string } {
  const brokenMark = 'Что сломано:';
  const fixMark = 'Что чинить:';
  const whereMark = 'Где:';
  const brokenAt = text.indexOf(brokenMark);
  const fixAt = text.indexOf(fixMark);
  const whereAt = text.indexOf(whereMark);
  if (brokenAt < 0 || fixAt < 0 || whereAt < 0 || !(brokenAt < fixAt && fixAt < whereAt)) {
    return { broken: text.trim(), fix: '', where: '' };
  }
  const title = text.slice(0, brokenAt).trim().replace(/\.+$/, '');
  const brokenBody = text.slice(brokenAt + brokenMark.length, fixAt).trim();
  const fix = text.slice(fixAt + fixMark.length, whereAt).trim();
  const where = text.slice(whereAt + whereMark.length).trim().replace(/^[`]+|[`]+$/g, '');
  const broken = [title, brokenBody].filter(Boolean).join('. ');
  return { broken, fix, where };
}

const FIX_ROW_LEVEL: Record<ReviewLevel, ReviewFixRow['level']> = {
  H: 'High',
  M: 'Medium',
  L: 'Low',
};

/** Rows for the green-chip table, in group order H, M, L and by 1-based index. */
export function reviewFixRows(groups: ReviewFixGroups['groups'], bullets: ReviewFixBullets): ReviewFixRow[] {
  const rows: ReviewFixRow[] = [];
  for (const level of ['H', 'M', 'L'] as const) {
    const indexes = [...new Set(bullets[level])].filter((item) => item > 0).sort((a, b) => a - b);
    for (const index of indexes) {
      const text = groups[level][index - 1];
      if (!text) {
        continue;
      }
      const cells = splitFixBullet(text);
      rows.push({ level: FIX_ROW_LEVEL[level], index, ...cells });
    }
  }
  return rows;
}

export type ReviewAgentResult =
  | {
      ok: true;
      severity: string;
      body: string;
      /** Write a line to the review terminal. Close it only after Discord accepts the file. */
      report: (line: string, close: boolean) => void;
    }
  | { ok: false; message: string };

function probeBin(bin: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { stdio: 'ignore' });
    child.on('error', () => resolve(false));
    child.on('exit', () => resolve(true));
  });
}

async function resolveAgentBin(): Promise<{ bin: string; prefix: string[] } | undefined> {
  if (await probeBin('agent', ['--help'])) {
    return { bin: 'agent', prefix: [] };
  }
  if (await probeBin('cursor', ['agent', '--help'])) {
    return { bin: 'cursor', prefix: ['agent'] };
  }
  return undefined;
}

export type RereviewPromptItem = {
  level: ReviewLevel;
  index: number;
  text: string;
  where: string;
};

function buildPrompt(opts: {
  skillPath: string;
  kind: ReviewKind;
  /** Omitted for «Изучено»: that run has no `/rl`, `/rm`, or `/rd`. */
  depth?: ReviewDepth;
  reviewNumber: number;
  title: string;
  webUrl?: string;
  branch?: string;
  baseBranch?: string;
  hostDiff?: string;
  rereview?: {
    parentNumber: number;
    selection: string;
    items: RereviewPromptItem[];
  };
  study?: {
    parentNumber: number;
    selection: string;
    items: RereviewPromptItem[];
    /** Checkout is the review branch, so files from «Где» may be opened. */
    readWhere: boolean;
  };
}): string {
  const kindLabel = opts.kind === 'branch' ? 'ревью ветки' : 'ревью изменений';
  const lines = [`Follow the skill at: ${opts.skillPath}`];
  if (!opts.study) {
    lines.push(reviewDepthCommand(opts.depth ?? 'medium'));
  }
  if (opts.webUrl) {
    lines.push(
      `Task: ${kindLabel} for merge request.`,
      `Review number: ${opts.reviewNumber}`,
      `MR title: ${opts.title}`,
      `MR URL: ${opts.webUrl}`,
    );
  } else {
    lines.push(
      `Task: ${kindLabel}.`,
      `Review number: ${opts.reviewNumber}`,
      `Branch: ${opts.branch || opts.title}`,
    );
  }
  if (opts.hostDiff) {
    lines.push(
      `Base branch: ${opts.baseBranch || ''}`,
      'Host-diff: the compare below is the whole review scope.',
      'Do not read the local working tree. Do not run git. Review only this host-diff.',
      '--- host-diff ---',
      opts.hostDiff,
      '--- end host-diff ---',
    );
  }
  if (opts.rereview) {
    const itemLines = opts.rereview.items.map((item) => {
      const where = item.where.trim();
      return where
        ? `${item.level}:${item.index}. ${item.text}\nГде: ${where}`
        : `${item.level}:${item.index}. ${item.text}`;
    });
    lines.push(
      'Проверяются только эти пункты. Не ищи дефекты вне них.',
      `Selection: ${opts.rereview.selection}`,
      'Это ревью родительского Ревью ' + String(opts.rereview.parentNumber) + '.',
      'Первая строка ответа — ровно строка Selection, без слова Selection и без branch, changes, rl, rm, rd.',
      'Новую поломку в первую строку не включай. Добавь её отдельным пунктом H, M или L в группах и в таблице.',
      '«Что сломано» сохрани. Если пункт исправлен, в «Что чинить» напиши ровно: исправлено',
      'Если нет — поясни, что ещё чинить. «Где» сохрани или дополни.',
      'В колонке «Уровень» номер тот же, что у пункта: второй High — H-2, не новый отсчёт с 1.',
      'На чужой ветке пути «Где» ищи внутри host-diff. Локальное дерево не открывай, если в запуске есть host-diff.',
      '',
      'Пункты:',
      itemLines.join('\n\n'),
    );
  }
  if (opts.study) {
    const itemLines = opts.study.items.map((item) => {
      const where = item.where.trim();
      return where
        ? `${item.level}:${item.index}. ${item.text}\nГде: ${where}`
        : `${item.level}:${item.index}. ${item.text}`;
    });
    lines.push(
      'Разбираются только эти пункты. Не ищи дефекты вне них.',
      `Selection: ${opts.study.selection}`,
      'Это разбор родительского Ревью ' + String(opts.study.parentNumber) + '.',
      'Не пиши строку счётчиков H:N | M:N | L:N и не пиши таблицу.',
      'Команды глубины нет. Не пиши /rl, /rm, /rd и не выбирай глубину.',
      'Каждый пункт начинается с якоря вида H:1 или L:4. Дальше кейс воспроизведения, примеры и контекст.',
      'Якорь — первая строка пункта.',
      opts.study.readWhere
        ? 'Можно открывать файлы из строк «Где».'
        : 'На чужой ветке пути «Где» ищи внутри host-diff. Локальное дерево не открывай.',
      '',
      'Пункты:',
      itemLines.join('\n\n'),
    );
  }
  if (opts.study) {
    lines.push('Answer in ask mode. Do not write a severity count line. Syn3 writes the chip line.');
  } else {
    lines.push(
      'Answer in ask mode. Put the severity line first in the form exactly:',
      opts.rereview ? opts.rereview.selection : 'H:N | M:N | L:N',
      'Do not write branch, changes, rl, rm, or rd on that line. Syn3 adds them.',
      'Then write the H/M/L groups with bullets, then the readable review block.',
      opts.rereview
        ? 'Level cells keep the item number: H-2, M-1. Do not restart at 1.'
        : 'Level cells are the letter and the 1-based index inside that group: H-1, M-1, M-2.',
    );
  }
  return lines.join('\n');
}

/** Drop a leading severity or selection line. The caller writes the canonical header. */
function stripRereviewMarker(stdout: string): string {
  const lines = stdout.split(/\r?\n/);
  let started = false;
  const body: string[] = [];
  for (const line of lines) {
    if (!started) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      const bare = trimmed.replace(/^(?:branch|changes?)\s*\|\s*(?:rs|rl|rm|rd)\s*\|\s*/i, '');
      if (findSeverityLine(trimmed) || parseRereviewSelection(bare)) {
        started = true;
        continue;
      }
      started = true;
    }
    body.push(line);
  }
  return body.join('\n').trim();
}

/** Drop a leading chip line, severity line, or an echoed Selection. Keep `H:1` anchors. */
function stripStudyMarker(stdout: string, selection: string): string {
  const lines = stdout.split(/\r?\n/);
  let started = false;
  const body: string[] = [];
  const sel = selection.trim();
  for (const line of lines) {
    if (!started) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      const bare = trimmed.replace(/^(?:branch|changes?)\s*\|\s*(?:rs|rl|rm|rd)\s*\|\s*/i, '');
      const echoed =
        findSeverityLine(trimmed) ||
        bare === sel ||
        /^Selection:/i.test(trimmed) ||
        /^(?:Изучено|Studied)\b/i.test(trimmed);
      if (echoed) {
        started = true;
        continue;
      }
      started = true;
    }
    body.push(line);
  }
  return body.join('\n').trim();
}

type AgentStream = {
  buf: string;
  deltas: string;
  plain: string;
  resultText: string;
  finalFlush: string;
  sawDelta: boolean;
  /** A reasoning block is open in the terminal, so the next event starts on a new line. */
  thinkingOpen: boolean;
};

type TerminalPrint = {
  thinking: boolean;
  tools: boolean;
};

function terminalPrint(opts: { printThinking?: boolean; printTools?: boolean }): TerminalPrint {
  return {
    thinking: opts.printThinking === true,
    tools: opts.printTools !== false,
  };
}

function assistantText(message: unknown): string {
  if (!message || typeof message !== 'object') {
    return '';
  }
  const content = (message as { content?: unknown }).content;
  if (!Array.isArray(content)) {
    return '';
  }
  return content
    .map((part) => {
      if (part && typeof part === 'object' && (part as { type?: string }).type === 'text') {
        return String((part as { text?: string }).text ?? '');
      }
      return '';
    })
    .join('');
}

function toolLabel(toolCall: Record<string, unknown>): string {
  const key = Object.keys(toolCall)[0];
  if (!key) {
    return 'шаг';
  }
  const raw = toolCall[key];
  const args =
    raw && typeof raw === 'object'
      ? ((raw as { args?: Record<string, unknown> }).args ?? {})
      : {};
  const detail = ['command', 'cmd', 'path', 'pattern', 'glob_pattern', 'query']
    .map((name) => args[name])
    .find((value) => typeof value === 'string' && value.trim());
  const name = key.replace(/ToolCall$/, '');
  const short =
    typeof detail === 'string' ? detail.replace(/\s+/g, ' ').trim().slice(0, 140) : '';
  return short ? `${name}: ${short}` : name;
}

function takeStreamLines(
  state: AgentStream,
  chunk: string,
  emit: (text: string) => void,
  print: TerminalPrint,
): void {
  state.buf += chunk;
  let nl = state.buf.indexOf('\n');
  while (nl >= 0) {
    const line = state.buf.slice(0, nl).replace(/\r$/, '');
    state.buf = state.buf.slice(nl + 1);
    if (line.trim()) {
      emitStreamLine(state, line, emit, print);
    }
    nl = state.buf.indexOf('\n');
  }
}

function closeThinking(state: AgentStream, emit: (text: string) => void): void {
  if (!state.thinkingOpen) {
    return;
  }
  state.thinkingOpen = false;
  emit('\r\n');
}

function emitStreamLine(
  state: AgentStream,
  line: string,
  emit: (text: string) => void,
  print: TerminalPrint,
): void {
  let event: Record<string, unknown>;
  try {
    event = JSON.parse(line) as Record<string, unknown>;
  } catch {
    state.plain += `${line}\n`;
    emit(`${line}\r\n`);
    return;
  }
  if (typeof event.type !== 'string') {
    state.plain += `${line}\n`;
    emit(`${line}\r\n`);
    return;
  }
  if (event.type === 'system' && event.subtype === 'init') {
    closeThinking(state, emit);
    const model = typeof event.model === 'string' ? event.model : '';
    emit(model ? `модель: ${model}\r\n` : 'сессия начата\r\n');
    return;
  }
  if (event.type === 'thinking') {
    if (!print.thinking) {
      return;
    }
    const text = typeof event.text === 'string' ? event.text : '';
    if (event.subtype === 'delta' && text) {
      if (!state.thinkingOpen) {
        state.thinkingOpen = true;
        emit('\r\nразмышление: ');
      }
      emit(text.replace(/\n/g, '\r\n'));
    } else if (event.subtype === 'completed') {
      closeThinking(state, emit);
    }
    return;
  }
  if (event.type === 'tool_call' && event.tool_call && typeof event.tool_call === 'object') {
    if (!print.tools) {
      return;
    }
    closeThinking(state, emit);
    const label = toolLabel(event.tool_call as Record<string, unknown>);
    if (event.subtype === 'started') {
      emit(`→ ${label}\r\n`);
    } else if (event.subtype === 'completed') {
      emit(`← ${label}\r\n`);
    }
    return;
  }
  if (event.type === 'assistant') {
    closeThinking(state, emit);
    const hasTs = event.timestamp_ms != null;
    const hasModel = event.model_call_id != null;
    const text = assistantText(event.message);
    if (hasTs && !hasModel) {
      state.sawDelta = true;
      state.deltas += text;
      if (text) {
        emit(text.replace(/\n/g, '\r\n'));
      }
    } else if (!hasTs && !hasModel && text.trim()) {
      state.finalFlush = text;
      if (!state.sawDelta) {
        state.deltas += `${state.deltas ? '\n' : ''}${text}`;
        emit(`\r\n${text.replace(/\n/g, '\r\n')}\r\n`);
      }
    }
    return;
  }
  if (event.type === 'result') {
    closeThinking(state, emit);
    if (typeof event.result === 'string') {
      state.resultText = event.result;
    }
    if (event.is_error === true && typeof event.result === 'string' && event.result.trim()) {
      emit(`\r\n${event.result.replace(/\n/g, '\r\n')}\r\n`);
    }
  }
}

function pickAnswer(state: AgentStream): string {
  const candidates = [state.finalFlush, state.resultText, state.deltas, state.plain];
  for (const text of candidates) {
    if (text && findSeverityLine(text)) {
      return text.trim();
    }
  }
  return (state.resultText || state.finalFlush || state.deltas || state.plain).trim();
}

function reviewBody(stdout: string): { severity: string; body: string } | undefined {
  const severity = findSeverityLine(stdout);
  if (!severity) {
    return undefined;
  }
  const lines = stdout.split(/\r?\n/);
  const bodyLines: string[] = [];
  let seen = false;
  for (const line of lines) {
    if (!seen) {
      if (findSeverityLine(line)) {
        seen = true;
      }
      continue;
    }
    bodyLines.push(line);
  }
  return { severity, body: bodyLines.join('\n').trim() };
}

/**
 * Run `agent --print --mode ask` in a visible VS Code terminal and capture stdout.
 * stream-json is required: text mode stays silent until the whole review is done.
 */
export async function runReviewSkill(opts: {
  cwd: string;
  skillPath: string;
  model?: string;
  kind: ReviewKind;
  /** Omitted for «Изучено»: that run has no depth command. */
  depth?: ReviewDepth;
  reviewNumber: number;
  title: string;
  webUrl?: string;
  branch?: string;
  baseBranch?: string;
  hostDiff?: string;
  rereview?: {
    parentNumber: number;
    selection: string;
    items: RereviewPromptItem[];
  };
  study?: {
    parentNumber: number;
    selection: string;
    items: RereviewPromptItem[];
    readWhere: boolean;
  };
  /** Print `thinking` deltas. Off by default; reasoning is not part of the saved review. */
  printThinking?: boolean;
  /** Print tool start and finish. On unless the profile stores false. */
  printTools?: boolean;
}): Promise<ReviewAgentResult> {
  const resolved = await resolveAgentBin();
  if (!resolved) {
    return { ok: false, message: 'Cursor Agent CLI not found (agent / cursor agent)' };
  }
  const prompt = buildPrompt(opts);
  const args = [
    ...resolved.prefix,
    '--print',
    '--trust',
    '--force',
    '--mode',
    'ask',
    '--output-format',
    'stream-json',
    '--stream-partial-output',
    '--workspace',
    opts.cwd,
  ];
  if (opts.model && opts.model.trim()) {
    args.push('--model', opts.model.trim());
  }
  args.push(prompt);
  const print = terminalPrint(opts);

  const writeEmitter = new vscode.EventEmitter<string>();
  let closed = false;
  let child: ChildProcess | undefined;
  const started = Date.now();
  const pty: vscode.Pseudoterminal = {
    onDidWrite: writeEmitter.event,
    open: () => {
      writeEmitter.fire(
        `$ ${resolved.bin} ${args.filter((a) => a !== prompt).join(' ')} «prompt»\r\n\r\n`,
      );
      writeEmitter.fire('агент запущен, шаги появятся ниже\r\n');
    },
    close: () => {
      closed = true;
      child?.kill();
    },
  };
  const term = vscode.window.createTerminal({ name: 'Syn3 Review', pty });
  term.show(true);

  return new Promise((resolve) => {
    const stream: AgentStream = {
      buf: '',
      deltas: '',
      plain: '',
      resultText: '',
      finalFlush: '',
      sawDelta: false,
      thinkingOpen: false,
    };
    let stderr = '';
    let settled = false;
    let lastEmit = Date.now();
    const emit = (text: string) => {
      lastEmit = Date.now();
      if (!closed) {
        writeEmitter.fire(text);
      }
    };
    const timer = setInterval(() => {
      if (closed || Date.now() - lastEmit < 20_000) {
        return;
      }
      emit(`… ждём модель, ${Math.round((Date.now() - started) / 1000)} с\r\n`);
    }, 5_000);
    child = spawn(resolved.bin, args, {
      cwd: opts.cwd,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout?.on('data', (chunk: Buffer) => {
      takeStreamLines(stream, chunk.toString('utf8'), emit, print);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      stderr += text;
      emit(text.replace(/\n/g, '\r\n'));
    });
    const report = (line: string, closeTerminal: boolean) => {
      emit(`\r\n${line}\r\n`);
      if (closeTerminal) {
        setTimeout(() => term.dispose(), 1200);
      }
    };
    const finish = (result: ReviewAgentResult) => {
      if (settled) {
        return;
      }
      settled = true;
      clearInterval(timer);
      resolve(result);
    };
    child.on('error', (error) => {
      emit(`\r\n${error.message}\r\n`);
      finish({ ok: false, message: error.message });
    });
    child.on('close', (code) => {
      if (stream.buf.trim()) {
        emitStreamLine(stream, stream.buf, emit, print);
      }
      emit(`\r\n[exit ${code ?? '?'}]\r\n`);
      const answer = pickAnswer(stream);
      if (opts.rereview) {
        const body = stripRereviewMarker(answer);
        if (!body) {
          const message = closed ? 'Review agent cancelled' : 'В ответе агента нет текста реревью';
          emit(`\r\n${message}\r\n`);
          finish({ ok: false, message });
          return;
        }
        emit('реревью собрано, публикую в тред\r\n');
        finish({ ok: true, severity: opts.rereview.selection, body, report });
        return;
      }
      if (opts.study) {
        const body = stripStudyMarker(answer, opts.study.selection);
        if (!body) {
          const message = closed ? 'Review agent cancelled' : 'В ответе агента нет текста изучено';
          emit(`\r\n${message}\r\n`);
          finish({ ok: false, message });
          return;
        }
        emit('изучено собрано, публикую в тред\r\n');
        finish({ ok: true, severity: opts.study.selection, body, report });
        return;
      }
      const parsed = reviewBody(answer);
      if (parsed) {
        emit('ревью собрано, публикую в тред\r\n');
        finish({ ok: true, ...parsed, report });
        return;
      }
      const stdout = answer;
      const message =
        !stdout && closed
          ? 'Review agent cancelled'
          : stdout
            ? 'В ответе агента нет строки H:N | M:N | L:N'
            : (stderr || `agent exited with ${code}`).trim().slice(0, 400);
      emit(`\r\n${message}\r\n`);
      finish({ ok: false, message });
    });
  });
}

export type ScenarioAskResult =
  | {
      ok: true;
      answer: string;
      report: (line: string, close: boolean) => void;
    }
  | { ok: false; message: string };

/**
 * Run `agent --print --mode ask` for a scenario pass. The caller owns the prompt.
 * The answer is the agent text. No severity line and no file write.
 */
export async function runScenarioAsk(opts: {
  cwd: string;
  prompt: string;
  model?: string;
  printThinking?: boolean;
  printTools?: boolean;
}): Promise<ScenarioAskResult> {
  const resolved = await resolveAgentBin();
  if (!resolved) {
    return { ok: false, message: 'Cursor Agent CLI not found (agent / cursor agent)' };
  }
  const prompt = opts.prompt;
  const args = [
    ...resolved.prefix,
    '--print',
    '--trust',
    '--force',
    '--mode',
    'ask',
    '--output-format',
    'stream-json',
    '--stream-partial-output',
    '--workspace',
    opts.cwd,
  ];
  if (opts.model && opts.model.trim()) {
    args.push('--model', opts.model.trim());
  }
  args.push(prompt);
  const print = terminalPrint(opts);

  const writeEmitter = new vscode.EventEmitter<string>();
  let closed = false;
  let child: ChildProcess | undefined;
  const started = Date.now();
  const pty: vscode.Pseudoterminal = {
    onDidWrite: writeEmitter.event,
    open: () => {
      writeEmitter.fire(
        `$ ${resolved.bin} ${args.filter((a) => a !== prompt).join(' ')} «prompt»\r\n\r\n`,
      );
      writeEmitter.fire('агент запущен, шаги появятся ниже\r\n');
    },
    close: () => {
      closed = true;
      child?.kill();
    },
  };
  const term = vscode.window.createTerminal({ name: 'Syn3 Scenario', pty });
  term.show(true);

  return new Promise((resolve) => {
    const stream: AgentStream = {
      buf: '',
      deltas: '',
      plain: '',
      resultText: '',
      finalFlush: '',
      sawDelta: false,
      thinkingOpen: false,
    };
    let stderr = '';
    let settled = false;
    let lastEmit = Date.now();
    const emit = (text: string) => {
      lastEmit = Date.now();
      if (!closed) {
        writeEmitter.fire(text);
      }
    };
    const timer = setInterval(() => {
      if (closed || Date.now() - lastEmit < 20_000) {
        return;
      }
      emit(`… ждём модель, ${Math.round((Date.now() - started) / 1000)} с\r\n`);
    }, 5_000);
    child = spawn(resolved.bin, args, {
      cwd: opts.cwd,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout?.on('data', (chunk: Buffer) => {
      takeStreamLines(stream, chunk.toString('utf8'), emit, print);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      stderr += text;
      emit(text.replace(/\n/g, '\r\n'));
    });
    const report = (line: string, closeTerminal: boolean) => {
      emit(`\r\n${line}\r\n`);
      if (closeTerminal) {
        setTimeout(() => term.dispose(), 1200);
      }
    };
    const finish = (result: ScenarioAskResult) => {
      if (settled) {
        return;
      }
      settled = true;
      clearInterval(timer);
      resolve(result);
    };
    child.on('error', (error) => {
      emit(`\r\n${error.message}\r\n`);
      finish({ ok: false, message: error.message });
    });
    child.on('close', (code) => {
      if (stream.buf.trim()) {
        emitStreamLine(stream, stream.buf, emit, print);
      }
      emit(`\r\n[exit ${code ?? '?'}]\r\n`);
      const answer = pickAnswer(stream).trim();
      if (answer) {
        finish({ ok: true, answer, report });
        return;
      }
      const message = closed
        ? 'Scenario agent cancelled'
        : (stderr || `agent exited with ${code}`).trim().slice(0, 400);
      emit(`\r\n${message}\r\n`);
      finish({ ok: false, message });
    });
  });
}

/** Whole line the neurofix agent writes when the items are fixed or already fixed in the worktree. */
export const NEUROFIX_OK_LINE = 'SYN3_NEUROFIX_OK';

export type NeuroFixAgentResult =
  | {
      ok: true;
      /** Final agent text. The caller decides whether the items were fixed. */
      answer: string;
      /** Write a line to the neurofix terminal. Close it after the indexes are recorded. */
      report: (line: string, close: boolean) => void;
    }
  | { ok: false; message: string };

/** True when the last non-empty line of the agent answer is the success marker. */
export function hasNeuroFixSuccessMarker(text: string): boolean {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return lines.length > 0 && lines[lines.length - 1] === NEUROFIX_OK_LINE;
}

function neuroFixAnswer(state: AgentStream): string {
  return (state.resultText || state.finalFlush || state.deltas || state.plain).trim();
}

/**
 * Run `agent --print` for Neurofix, or open a terminal with an error.
 * `--print` without `--mode` can write files and run shell. `plan` and `ask` are read-only.
 * Exit code 0 returns the answer text. The caller records indexes after a worktree
 * change or a `SYN3_NEUROFIX_OK` line. No Discord post, no severity parse.
 */
export async function runNeuroFixSkill(opts: {
  cwd: string;
  model?: string;
  /** Absolute path to the fix skill. Empty → the prompt is sent as-is. */
  skillPath?: string;
  prompt: string;
  failMessage?: string;
  printThinking?: boolean;
  printTools?: boolean;
}): Promise<NeuroFixAgentResult> {
  if (opts.failMessage) {
    const writeEmitter = new vscode.EventEmitter<string>();
    const pty: vscode.Pseudoterminal = {
      onDidWrite: writeEmitter.event,
      open: () => {
        writeEmitter.fire(`${opts.failMessage}\r\n`);
        setTimeout(() => term.dispose(), 1500);
      },
      close: () => undefined,
    };
    const term = vscode.window.createTerminal({ name: 'Syn3 Neurofix', pty });
    term.show(true);
    return { ok: false, message: opts.failMessage };
  }

  const resolved = await resolveAgentBin();
  if (!resolved) {
    return runNeuroFixSkill({
      ...opts,
      failMessage: 'Cursor Agent CLI not found (agent / cursor agent)',
    });
  }
  const args = [
    ...resolved.prefix,
    '--print',
    '--trust',
    '--force',
    '--output-format',
    'stream-json',
    '--stream-partial-output',
    '--workspace',
    opts.cwd,
  ];
  if (opts.model && opts.model.trim()) {
    args.push('--model', opts.model.trim());
  }
  const skillPath = opts.skillPath?.trim() || '';
  const prompt = skillPath ? `Follow the skill at: ${skillPath}\n${opts.prompt}` : opts.prompt;
  args.push(prompt);
  const print = terminalPrint(opts);

  const writeEmitter = new vscode.EventEmitter<string>();
  let closed = false;
  let child: ChildProcess | undefined;
  const started = Date.now();
  const pty: vscode.Pseudoterminal = {
    onDidWrite: writeEmitter.event,
    open: () => {
      writeEmitter.fire(
        `$ ${resolved.bin} ${args.filter((a) => a !== prompt).join(' ')} «prompt»\r\n\r\n`,
      );
      writeEmitter.fire('нейрофикс запущен, шаги появятся ниже\r\n');
    },
    close: () => {
      closed = true;
      child?.kill();
    },
  };
  const term = vscode.window.createTerminal({ name: 'Syn3 Neurofix', pty });
  term.show(true);

  return new Promise((resolve) => {
    const stream: AgentStream = {
      buf: '',
      deltas: '',
      plain: '',
      resultText: '',
      finalFlush: '',
      sawDelta: false,
      thinkingOpen: false,
    };
    let stderr = '';
    let settled = false;
    let lastEmit = Date.now();
    const emit = (text: string) => {
      lastEmit = Date.now();
      if (!closed) {
        writeEmitter.fire(text);
      }
    };
    const timer = setInterval(() => {
      if (closed || Date.now() - lastEmit < 20_000) {
        return;
      }
      emit(`… ждём модель, ${Math.round((Date.now() - started) / 1000)} с\r\n`);
    }, 5_000);
    child = spawn(resolved.bin, args, {
      cwd: opts.cwd,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout?.on('data', (chunk: Buffer) => {
      takeStreamLines(stream, chunk.toString('utf8'), emit, print);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      stderr += text;
      emit(text.replace(/\n/g, '\r\n'));
    });
    const report = (line: string, closeTerminal: boolean) => {
      emit(`\r\n${line}\r\n`);
      if (closeTerminal) {
        setTimeout(() => term.dispose(), 1200);
      }
    };
    const finish = (result: NeuroFixAgentResult) => {
      if (settled) {
        return;
      }
      settled = true;
      clearInterval(timer);
      resolve(result);
    };
    child.on('error', (error) => {
      emit(`\r\n${error.message}\r\n`);
      finish({ ok: false, message: error.message });
    });
    child.on('close', (code) => {
      if (stream.buf.trim()) {
        emitStreamLine(stream, stream.buf, emit, print);
      }
      emit(`\r\n[exit ${code ?? '?'}]\r\n`);
      if (code === 0) {
        finish({ ok: true, answer: neuroFixAnswer(stream), report });
        return;
      }
      const message =
        closed
          ? 'Neurofix cancelled'
          : (stderr || `agent exited with ${code}`).trim().slice(0, 400);
      emit(`\r\n${message}\r\n`);
      finish({ ok: false, message });
    });
  });
}

export async function writeReviewFile(opts: {
  dirPath: string;
  reviewNumber: number;
  mrLine: string;
  severity: string;
  kind: ReviewKind;
  depth: ReviewDepth;
  body: string;
}): Promise<string> {
  await fs.mkdir(opts.dirPath, { recursive: true });
  const name = `review-${opts.reviewNumber}-${Date.now()}.md`;
  const fsPath = path.join(opts.dirPath, name);
  const counts = parseReviewSeverityLine(opts.severity)?.severity ?? formatSeverityLine(0, 0, 0);
  const text = [
    `Ревью ${opts.reviewNumber}`,
    opts.mrLine,
    formatReviewScopeLine(reviewScopeToken(opts.kind), reviewDepthToken(opts.depth), counts),
    opts.body,
    '',
  ].join('\n');
  await fs.writeFile(fsPath, text, 'utf8');
  return fsPath;
}

export async function writeRereviewFile(opts: {
  dirPath: string;
  reviewNumber: number;
  parentNumber: number;
  mrLine: string;
  scope: 'branch' | 'changes';
  depth: 'rs' | 'rl' | 'rm' | 'rd';
  selection: string;
  body: string;
}): Promise<string> {
  await fs.mkdir(opts.dirPath, { recursive: true });
  const name = `rereview-${opts.reviewNumber}-${Date.now()}.md`;
  const fsPath = path.join(opts.dirPath, name);
  const text = [
    `Реревью ${opts.reviewNumber} на Ревью ${opts.parentNumber}`,
    opts.mrLine,
    `${opts.scope} | ${opts.depth} | ${opts.selection}`,
    opts.body,
    '',
  ].join('\n');
  await fs.writeFile(fsPath, text, 'utf8');
  return fsPath;
}

export async function writeStudyFile(opts: {
  dirPath: string;
  parentNumber: number;
  scope: 'branch' | 'changes';
  selection: string;
  body: string;
}): Promise<string> {
  await fs.mkdir(opts.dirPath, { recursive: true });
  const name = `study-${opts.parentNumber}-${Date.now()}.md`;
  const fsPath = path.join(opts.dirPath, name);
  const text = [
    formatStudyChipLabel({
      parentNumber: opts.parentNumber,
      scope: opts.scope,
      selection: opts.selection,
    }),
    '',
    opts.body.trim(),
    '',
  ].join('\n');
  await fs.writeFile(fsPath, text, 'utf8');
  return fsPath;
}

export type ExplainAgentResult =
  | {
      ok: true;
      body: string;
      report: (line: string, close: boolean) => void;
    }
  | { ok: false; message: string };

function buildExplainPrompt(opts: {
  skillPath: string;
  kind: ReviewKind;
  depth: ReviewDepth;
  title: string;
  webUrl?: string;
  branch?: string;
  baseBranch?: string;
  hostDiff?: string;
}): string {
  const kindLabel = opts.kind === 'branch' ? `${EXPLAIN_TITLE} ветки` : `${EXPLAIN_TITLE} изменений`;
  const command = reviewDepthCommand(opts.depth);
  const lines = [`Follow the skill at: ${opts.skillPath}`, command];
  if (opts.webUrl) {
    lines.push(
      `Task: ${kindLabel} for merge request.`,
      `MR title: ${opts.title}`,
      `MR URL: ${opts.webUrl}`,
    );
  } else {
    lines.push(`Task: ${kindLabel}.`, `Branch: ${opts.branch || opts.title}`);
  }
  if (opts.hostDiff) {
    lines.push(
      `Base branch: ${opts.baseBranch || ''}`,
      'Host-diff: the compare below is the whole scope.',
      'Do not read the local working tree. Do not run git. Analyze only this host-diff.',
      '--- host-diff ---',
      opts.hostDiff,
      '--- end host-diff ---',
    );
  }
  lines.push(
    'Answer in ask mode.',
    'Write the full explanation as markdown.',
    'Start the file with a # heading. Do not write the chip line.',
    'Do not require or emit an H:N | M:N | L:N severity line.',
  );
  return lines.join('\n');
}

/**
 * Run the explain («Что сделано») skill. Whole answer becomes the file body.
 * No H/M/L line required.
 */
export async function runExplainSkill(opts: {
  cwd: string;
  skillPath: string;
  model?: string;
  kind: ReviewKind;
  depth: ReviewDepth;
  title: string;
  webUrl?: string;
  branch?: string;
  baseBranch?: string;
  hostDiff?: string;
  printThinking?: boolean;
  printTools?: boolean;
}): Promise<ExplainAgentResult> {
  const resolved = await resolveAgentBin();
  if (!resolved) {
    return { ok: false, message: 'Cursor Agent CLI not found (agent / cursor agent)' };
  }
  const prompt = buildExplainPrompt(opts);
  const args = [
    ...resolved.prefix,
    '--print',
    '--trust',
    '--force',
    '--mode',
    'ask',
    '--output-format',
    'stream-json',
    '--stream-partial-output',
    '--workspace',
    opts.cwd,
  ];
  if (opts.model && opts.model.trim()) {
    args.push('--model', opts.model.trim());
  }
  args.push(prompt);
  const print = terminalPrint(opts);

  const writeEmitter = new vscode.EventEmitter<string>();
  let closed = false;
  let child: ChildProcess | undefined;
  const started = Date.now();
  const pty: vscode.Pseudoterminal = {
    onDidWrite: writeEmitter.event,
    open: () => {
      writeEmitter.fire(
        `$ ${resolved.bin} ${args.filter((a) => a !== prompt).join(' ')} «prompt»\r\n\r\n`,
      );
      writeEmitter.fire('агент запущен, шаги появятся ниже\r\n');
    },
    close: () => {
      closed = true;
      child?.kill();
    },
  };
  const term = vscode.window.createTerminal({ name: `Syn3 ${EXPLAIN_TITLE}`, pty });
  term.show(true);

  return new Promise((resolve) => {
    const stream: AgentStream = {
      buf: '',
      deltas: '',
      plain: '',
      resultText: '',
      finalFlush: '',
      sawDelta: false,
      thinkingOpen: false,
    };
    let stderr = '';
    let settled = false;
    let lastEmit = Date.now();
    const emit = (text: string) => {
      lastEmit = Date.now();
      if (!closed) {
        writeEmitter.fire(text);
      }
    };
    const timer = setInterval(() => {
      if (closed || Date.now() - lastEmit < 20_000) {
        return;
      }
      emit(`… ждём модель, ${Math.round((Date.now() - started) / 1000)} с\r\n`);
    }, 5_000);
    child = spawn(resolved.bin, args, {
      cwd: opts.cwd,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout?.on('data', (chunk: Buffer) => {
      takeStreamLines(stream, chunk.toString('utf8'), emit, print);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      stderr += text;
      emit(text.replace(/\n/g, '\r\n'));
    });
    const report = (line: string, closeTerminal: boolean) => {
      emit(`\r\n${line}\r\n`);
      if (closeTerminal) {
        setTimeout(() => term.dispose(), 1200);
      }
    };
    const finish = (result: ExplainAgentResult) => {
      if (settled) {
        return;
      }
      settled = true;
      clearInterval(timer);
      resolve(result);
    };
    child.on('error', (error) => {
      emit(`\r\n${error.message}\r\n`);
      finish({ ok: false, message: error.message });
    });
    child.on('close', (code) => {
      if (stream.buf.trim()) {
        emitStreamLine(stream, stream.buf, emit, print);
      }
      emit(`\r\n[exit ${code ?? '?'}]\r\n`);
      const body = pickAnswer(stream).trim();
      if (body) {
        emit('вывод собран, публикую\r\n');
        finish({ ok: true, body, report });
        return;
      }
      const message =
        closed
          ? 'Explain agent cancelled'
          : (stderr || `agent exited with ${code}`).trim().slice(0, 400);
      emit(`\r\n${message}\r\n`);
      finish({ ok: false, message });
    });
  });
}

export async function writeExplainFile(opts: {
  dirPath: string;
  branch: string;
  body: string;
}): Promise<string> {
  await fs.mkdir(opts.dirPath, { recursive: true });
  const name = `explain-${Date.now()}.md`;
  const fsPath = path.join(opts.dirPath, name);
  const text = [EXPLAIN_TITLE, `Branch: ${opts.branch}`, '', opts.body, ''].join('\n');
  await fs.writeFile(fsPath, text, 'utf8');
  return fsPath;
}

export async function deleteReviewFile(fsPath: string): Promise<void> {
  try {
    await fs.unlink(fsPath);
  } catch {
    // missing
  }
}
