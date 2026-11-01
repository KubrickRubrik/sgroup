import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { findSeverityLine } from './discordApi';
import { ReviewKind } from './reviewPending';

export type ReviewAgentResult =
  | { ok: true; severity: string; body: string }
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
  reviewNumber: number;
  title: string;
  webUrl: string;
}): string {
  const kindLabel = opts.kind === 'branch' ? 'ревью ветки' : 'ревью изменений';
  return [
    `Follow the skill at: ${opts.skillPath}`,
    `Task: ${kindLabel} for merge request.`,
    `Review number: ${opts.reviewNumber}`,
    `MR title: ${opts.title}`,
    `MR URL: ${opts.webUrl}`,
    'Answer in ask mode. Put the severity line first in the form exactly:',
    'H:N | M:N | L:N',
    'Then write the review body.',
  ].join('\n');
}

/**
 * Run `agent --print --mode ask` in a visible VS Code terminal and capture stdout.
 */
export async function runReviewSkill(opts: {
  cwd: string;
  skillPath: string;
  model?: string;
  kind: ReviewKind;
  reviewNumber: number;
  title: string;
  webUrl: string;
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
    '--mode',
    'ask',
    '--workspace',
    opts.cwd,
  ];
  if (opts.model && opts.model.trim()) {
    args.push('--model', opts.model.trim());
  }
  args.push(prompt);

  const writeEmitter = new vscode.EventEmitter<string>();
  let closed = false;
  const pty: vscode.Pseudoterminal = {
    onDidWrite: writeEmitter.event,
    open: () => {
      writeEmitter.fire(`$ ${resolved.bin} ${args.filter((a) => a !== prompt).join(' ')} «prompt»\r\n\r\n`);
    },
    close: () => {
      closed = true;
    },
  };
  const term = vscode.window.createTerminal({ name: 'Syn3 Review', pty });
  term.show(true);

  return new Promise((resolve) => {
    const child = spawn(resolved.bin, args, {
      cwd: opts.cwd,
      env: { ...process.env },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      stdout += text;
      if (!closed) {
        writeEmitter.fire(text.replace(/\n/g, '\r\n'));
      }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      stderr += text;
      if (!closed) {
        writeEmitter.fire(text.replace(/\n/g, '\r\n'));
      }
    });
    child.on('error', (error) => {
      writeEmitter.fire(`\r\n${error.message}\r\n`);
      setTimeout(() => term.dispose(), 800);
      resolve({ ok: false, message: error.message });
    });
    child.on('close', (code) => {
      writeEmitter.fire(`\r\n[exit ${code ?? '?'}]\r\n`);
      setTimeout(() => term.dispose(), 1200);
      if (code !== 0) {
        resolve({
          ok: false,
          message: (stderr || stdout || `agent exited with ${code}`).trim().slice(0, 400),
        });
        return;
      }
      const severity = findSeverityLine(stdout);
      if (!severity) {
        resolve({
          ok: false,
          message: 'Review output has no H:N | M:N | L:N line',
        });
        return;
      }
      const lines = stdout.split(/\r?\n/);
      const bodyLines: string[] = [];
      let skipped = false;
      for (const line of lines) {
        if (!skipped && findSeverityLine(line)) {
          skipped = true;
          continue;
        }
        bodyLines.push(line);
      }
      resolve({ ok: true, severity, body: bodyLines.join('\n').trim() });
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
