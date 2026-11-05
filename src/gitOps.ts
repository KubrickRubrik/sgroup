import { execFile } from 'child_process';
import { promisify } from 'util';

const exec = promisify(execFile);

export type GitResult<T> = { ok: true; value: T } | { ok: false; message: string };

async function git(cwd: string, args: string[]): Promise<GitResult<string>> {
  try {
    const { stdout, stderr } = await exec('git', args, {
      cwd,
      maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env },
    });
    return { ok: true, value: (stdout || stderr || '').trim() };
  } catch (error) {
    const err = error as { stderr?: string; message?: string };
    return {
      ok: false,
      message: (err.stderr || err.message || String(error)).trim() || 'git failed',
    };
  }
}

export async function currentBranch(cwd: string): Promise<GitResult<string>> {
  const result = await git(cwd, ['branch', '--show-current']);
  if (!result.ok) {
    return result;
  }
  if (!result.value) {
    return { ok: false, message: 'Detached HEAD — cannot create MR' };
  }
  return result;
}

export async function hasUncommittedChanges(cwd: string): Promise<boolean> {
  const result = await git(cwd, ['status', '--porcelain']);
  return result.ok && result.value.length > 0;
}

/**
 * Parent branch heuristic from sh_gitlab.sh detect_parent_branch.
 */
export async function detectParentBranch(cwd: string): Promise<string | undefined> {
  const branchResult = await currentBranch(cwd);
  if (!branchResult.ok) {
    return undefined;
  }
  const current = branchResult.value;

  const reflog = await git(cwd, ['reflog', 'show', '--format=%gs', current]);
  if (reflog.ok) {
    const lines = reflog.value.split('\n');
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const m = /^branch: Created from (.+)$/.exec(lines[i] || '');
      if (m && m[1] && m[1] !== 'HEAD') {
        const exists = await git(cwd, ['show-ref', '--verify', '--quiet', `refs/heads/${m[1]}`]);
        if (exists.ok) {
          return m[1];
        }
      }
    }
  }

  const fork = await git(cwd, ['reflog', 'show', '-n', '2', '--format=%H', current]);
  if (fork.ok) {
    const hashes = fork.value.split('\n').filter(Boolean);
    const forkCommit = hashes[hashes.length - 1];
    if (forkCommit) {
      const heads = await git(cwd, ['for-each-ref', '--format=%(refname:short)', 'refs/heads/']);
      if (heads.ok) {
        for (const branch of heads.value.split('\n')) {
          if (!branch || branch === current) {
            continue;
          }
          const tip = await git(cwd, ['rev-parse', branch]);
          if (tip.ok && tip.value === forkCommit) {
            return branch;
          }
        }
      }
    }
  }

  const heads = await git(cwd, ['for-each-ref', '--format=%(refname:short)', 'refs/heads/']);
  if (!heads.ok) {
    return undefined;
  }
  let best: string | undefined;
  let bestCount = Number.POSITIVE_INFINITY;
  for (const branch of heads.value.split('\n')) {
    if (!branch || branch === current) {
      continue;
    }
    const tip = await git(cwd, ['rev-parse', branch]);
    if (!tip.ok) {
      continue;
    }
    const base = await git(cwd, ['merge-base', 'HEAD', branch]);
    if (!base.ok || base.value !== tip.value) {
      continue;
    }
    const count = await git(cwd, ['rev-list', '--count', `${branch}..HEAD`]);
    if (!count.ok) {
      continue;
    }
    const n = Number(count.value);
    if (!Number.isNaN(n) && n < bestCount) {
      bestCount = n;
      best = branch;
    }
  }
  return best;
}

/** Same candidate list as collect_mr_target_branches in sh_gitlab.sh. */
export async function collectMrTargetBranches(
  cwd: string,
  current: string,
  parent?: string,
): Promise<string[]> {
  const out: string[] = [];
  let devBranch = '';
  const hasDevelopment = await git(cwd, [
    'show-ref',
    '--verify',
    '--quiet',
    'refs/remotes/origin/development',
  ]);
  if (hasDevelopment.ok) {
    devBranch = 'development';
  } else {
    const hasDev = await git(cwd, ['show-ref', '--verify', '--quiet', 'refs/remotes/origin/dev']);
    if (hasDev.ok) {
      devBranch = 'dev';
    }
  }
  if (devBranch && devBranch !== current) {
    out.push(devBranch);
  }

  const heads = await git(cwd, ['for-each-ref', '--format=%(refname:short)', 'refs/heads/']);
  if (!heads.ok) {
    return out;
  }
  type Scored = { ts: number; branch: string };
  const scored: Scored[] = [];
  for (const branch of heads.value.split('\n')) {
    if (!branch || branch === 'master' || branch === current) {
      continue;
    }
    const onRemote = await git(cwd, [
      'show-ref',
      '--verify',
      '--quiet',
      `refs/remotes/origin/${branch}`,
    ]);
    if (!onRemote.ok) {
      continue;
    }
    let ts = 0;
    const reflog = await git(cwd, ['reflog', 'show', '-1', '--format=%ct', branch]);
    if (reflog.ok && reflog.value) {
      ts = Number(reflog.value) || 0;
    } else {
      const tip = await git(cwd, ['log', '-1', '--format=%ct', `refs/remotes/origin/${branch}`]);
      ts = tip.ok ? Number(tip.value) || 0 : 0;
    }
    scored.push({ ts, branch });
  }
  scored.sort((a, b) => b.ts - a.ts);
  let count = 0;
  for (const { branch } of scored) {
    if (devBranch && branch === devBranch) {
      continue;
    }
    out.push(branch);
    count += 1;
    if (count >= 3) {
      break;
    }
  }
  if (parent && parent !== current && !out.includes(parent)) {
    out.unshift(parent);
  }
  return out;
}

async function resolveAgentCli(): Promise<string | undefined> {
  try {
    await exec('cursor', ['agent', '--help'], { timeout: 5000 });
    return 'cursor agent';
  } catch {
    // fall through
  }
  try {
    await exec('agent', ['--help'], { timeout: 5000 });
    return 'agent';
  } catch {
    return undefined;
  }
}

async function suggestCommitMessage(cwd: string): Promise<GitResult<string>> {
  const agent = await resolveAgentCli();
  if (!agent) {
    return { ok: false, message: 'Cursor Agent CLI not found' };
  }
  const stagedStat = await git(cwd, ['diff', '--cached', '--stat']);
  const stagedDiff = await git(cwd, ['diff', '--cached']);
  const prompt =
    'По staged diff ниже придумай ОДНУ строку сообщения git-коммита на русском — только про ИЗМЕНЕНИЯ В КОДЕ. ' +
    'Длина: не более 72 символов. Формат: «Область: суть». Без кавычек, markdown и точки в конце. ' +
    'Ответ — одна строка.\n\n--- stat ---\n' +
    (stagedStat.ok ? stagedStat.value : '') +
    '\n\n--- diff ---\n' +
    (stagedDiff.ok ? stagedDiff.value.slice(0, 15000) : '');

  try {
    const args =
      agent === 'cursor agent'
        ? ['agent', '--print', '--trust', '--mode', 'ask', '--workspace', cwd, prompt]
        : ['--print', '--trust', '--mode', 'ask', '--workspace', cwd, prompt];
    const bin = agent === 'cursor agent' ? 'cursor' : 'agent';
    const { stdout } = await exec(bin, args, {
      cwd,
      maxBuffer: 4 * 1024 * 1024,
      timeout: 120_000,
    });
    const line = stdout
      .trim()
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .pop();
    if (!line) {
      return { ok: false, message: 'Cursor returned an empty commit message' };
    }
    return { ok: true, value: line.replace(/^["'`]+|["'`]+$/g, '').slice(0, 72) };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Like ensure_committed_before_push + git_commit_cursor_auto nopush.
 * Fails if Cursor does not return a message.
 */
export async function ensureCommittedBeforeMr(cwd: string): Promise<GitResult<void>> {
  if (!(await hasUncommittedChanges(cwd))) {
    return { ok: true, value: undefined };
  }
  const add = await git(cwd, ['add', '.']);
  if (!add.ok) {
    return add;
  }
  const cached = await git(cwd, ['diff', '--cached', '--quiet']);
  // exit 1 means there are staged changes — execFile treats non-zero as error
  const hasStaged = !cached.ok;
  if (!hasStaged) {
    return { ok: false, message: 'No changes to commit' };
  }
  const suggested = await suggestCommitMessage(cwd);
  if (!suggested.ok) {
    return suggested;
  }
  const commit = await git(cwd, ['commit', '-m', suggested.value]);
  if (!commit.ok) {
    return commit;
  }
  return { ok: true, value: undefined };
}

export async function ensureBranchPushed(cwd: string, branch: string): Promise<GitResult<void>> {
  const upstream = await git(cwd, ['rev-parse', '--abbrev-ref', `${branch}@{upstream}`]);
  if (upstream.ok) {
    const push = await git(cwd, ['push']);
    if (!push.ok) {
      const force = await git(cwd, ['push', '--force-with-lease']);
      if (!force.ok) {
        return force;
      }
    }
    return { ok: true, value: undefined };
  }
  const setUp = await git(cwd, ['push', '--set-upstream', 'origin', branch]);
  if (!setUp.ok) {
    return setUp;
  }
  return { ok: true, value: undefined };
}
