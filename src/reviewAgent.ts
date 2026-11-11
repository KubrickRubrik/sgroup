import { spawn, type ChildProcess } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { findSeverityLine, REVIEW_SEVERITY_RE } from './discordApi';
import { ReviewDepth, ReviewKind, reviewDepthCommand } from './reviewPending';

export type ReviewFixGroups = {
  counts: { H: number; M: number; S: number };
  groups: { H: string[]; M: string[]; S: string[] };
};

/** Parse review attachment body into H/M/S groups. Legacy L headers map to S. */
export function parseReviewFixGroups(
  text: string,
): { ok: true; counts: ReviewFixGroups['counts']; groups: ReviewFixGroups['groups'] } | { ok: false; message: string } {
  const lines = text.split(/\r?\n/);
  const severityRaw = (lines[2] || '').trim();
  const sevMatch = severityRaw.match(REVIEW_SEVERITY_RE);
  if (!sevMatch) {
    return { ok: false, message: 'В файле ревью нет строки H:N | M:N | S:N' };
  }
  const counts = {
    H: Number(sevMatch[1]),
    M: Number(sevMatch[2]),
    S: Number(sevMatch[4]),
  };
  const groups: ReviewFixGroups['groups'] = { H: [], M: [], S: [] };
  const seen = new Set<'H' | 'M' | 'S'>();
  let current: 'H' | 'M' | 'S' | undefined;
  for (const raw of lines.slice(3)) {
    const trimmed = raw.trim();
    if (!trimmed) {
      continue;
    }
    const header = /^([HMLS])\s*$/i.exec(trimmed);
    if (header) {
      const letter = header[1].toUpperCase() === 'L' ? 'S' : (header[1].toUpperCase() as 'H' | 'M' | 'S');
      if (seen.has(letter)) {
        return { ok: false, message: `Повтор заголовка группы ${letter} в файле ревью` };
      }
      seen.add(letter);
      current = letter;
      continue;
    }
    if (/^-\s+/.test(trimmed)) {
      if (!current) {
        return { ok: false, message: 'Пункт ревью вне группы H/M/S' };
      }
      groups[current].push(trimmed.replace(/^-\s+/, '').trim());
      continue;
    }
    // Ignore non-bullet prose after severity.
  }
  for (const letter of ['H', 'M', 'S'] as const) {
    const expected = counts[letter];
    const actual = groups[letter].length;
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
  return { ok: true, counts, groups };
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

function buildPrompt(opts: {
  skillPath: string;
  kind: ReviewKind;
  depth: ReviewDepth;
  reviewNumber: number;
  title: string;
  webUrl?: string;
  branch?: string;
  baseBranch?: string;
  hostDiff?: string;
}): string {
  const kindLabel = opts.kind === 'branch' ? 'ревью ветки' : 'ревью изменений';
  const command = reviewDepthCommand(opts.depth);
  const lines = [
    `Follow the skill at: ${opts.skillPath}`,
    command,
  ];
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
  lines.push(
    'Answer in ask mode. Put the severity line first in the form exactly:',
    'H:N | M:N | S:N',
    'Then write the review body.',
  );
  return lines.join('\n');
}

type AgentStream = {
  buf: string;
  deltas: string;
  plain: string;
  resultText: string;
  finalFlush: string;
  sawDelta: boolean;
};

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

function takeStreamLines(state: AgentStream, chunk: string, emit: (text: string) => void): void {
  state.buf += chunk;
  let nl = state.buf.indexOf('\n');
  while (nl >= 0) {
    const line = state.buf.slice(0, nl).replace(/\r$/, '');
    state.buf = state.buf.slice(nl + 1);
    if (line.trim()) {
      emitStreamLine(state, line, emit);
    }
    nl = state.buf.indexOf('\n');
  }
}

function emitStreamLine(state: AgentStream, line: string, emit: (text: string) => void): void {
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
    const model = typeof event.model === 'string' ? event.model : '';
    emit(model ? `модель: ${model}\r\n` : 'сессия начата\r\n');
    return;
  }
  if (
    event.type === 'tool_call' &&
    event.subtype === 'started' &&
    event.tool_call &&
    typeof event.tool_call === 'object'
  ) {
    emit(`→ ${toolLabel(event.tool_call as Record<string, unknown>)}\r\n`);
    return;
  }
  if (event.type === 'assistant') {
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
  depth: ReviewDepth;
  reviewNumber: number;
  title: string;
  webUrl?: string;
  branch?: string;
  baseBranch?: string;
  hostDiff?: string;
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
      takeStreamLines(stream, chunk.toString('utf8'), emit);
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
        emitStreamLine(stream, stream.buf, emit);
      }
      emit(`\r\n[exit ${code ?? '?'}]\r\n`);
      const parsed = reviewBody(pickAnswer(stream));
      if (parsed) {
        emit('ревью собрано, публикую в тред\r\n');
        finish({ ok: true, ...parsed, report });
        return;
      }
      const stdout = pickAnswer(stream);
      const message =
        !stdout && closed
          ? 'Review agent cancelled'
          : stdout
            ? 'В ответе агента нет строки H:N | M:N | S:N'
            : (stderr || `agent exited with ${code}`).trim().slice(0, 400);
      emit(`\r\n${message}\r\n`);
      finish({ ok: false, message });
    });
  });
}

export type NeuroFixAgentResult = { ok: true } | { ok: false; message: string };

/**
 * Run `agent --print` for Neurofix, or open a terminal with an error.
 * `--print` without `--mode` can write files and run shell. `plan` and `ask` are read-only.
 * Success is exit code 0. No Discord post, no severity parse.
 */
export async function runNeuroFixSkill(opts: {
  cwd: string;
  model?: string;
  prompt: string;
  failMessage?: string;
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
  args.push(opts.prompt);

  const writeEmitter = new vscode.EventEmitter<string>();
  let closed = false;
  let child: ChildProcess | undefined;
  const started = Date.now();
  const pty: vscode.Pseudoterminal = {
    onDidWrite: writeEmitter.event,
    open: () => {
      writeEmitter.fire(
        `$ ${resolved.bin} ${args.filter((a) => a !== opts.prompt).join(' ')} «prompt»\r\n\r\n`,
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
      takeStreamLines(stream, chunk.toString('utf8'), emit);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      stderr += text;
      emit(text.replace(/\n/g, '\r\n'));
    });
    const finish = (result: NeuroFixAgentResult) => {
      if (settled) {
        return;
      }
      settled = true;
      clearInterval(timer);
      if (result.ok) {
        setTimeout(() => term.dispose(), 1200);
      }
      resolve(result);
    };
    child.on('error', (error) => {
      emit(`\r\n${error.message}\r\n`);
      finish({ ok: false, message: error.message });
    });
    child.on('close', (code) => {
      if (stream.buf.trim()) {
        emitStreamLine(stream, stream.buf, emit);
      }
      emit(`\r\n[exit ${code ?? '?'}]\r\n`);
      if (code === 0) {
        emit('нейрофикс завершён\r\n');
        finish({ ok: true });
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
  body: string;
}): Promise<string> {
  await fs.mkdir(opts.dirPath, { recursive: true });
  const name = `review-${opts.reviewNumber}-${Date.now()}.md`;
  const fsPath = path.join(opts.dirPath, name);
  const text = [
    `Ревью ${opts.reviewNumber}`,
    opts.mrLine,
    opts.severity,
    opts.body,
    '',
  ].join('\n');
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
