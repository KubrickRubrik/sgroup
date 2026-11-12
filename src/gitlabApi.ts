import { normalizeRepoUrl } from './accessStore';
import { ReviewMr } from './reviewHost';

/** @deprecated Prefer ReviewMr — kept as alias for call sites. */
export type GitlabMr = ReviewMr;

export type GitlabResult<T> = { ok: true; value: T } | { ok: false; message: string };

function hostAndProject(webBase: string): { host: string; projectPath: string } | undefined {
  const base = normalizeRepoUrl(webBase);
  const m = /^https?:\/\/([^/]+)\/(.+)$/i.exec(base);
  if (!m) {
    return undefined;
  }
  return { host: m[1], projectPath: m[2] };
}

function encodePath(projectPath: string): string {
  return encodeURIComponent(projectPath);
}

export type GitlabPage<T> = {
  items: T;
  nextPage: number | undefined;
};

async function gitlabFetch(
  host: string,
  token: string,
  method: string,
  route: string,
  body?: unknown,
): Promise<GitlabResult<unknown>> {
  const result = await gitlabFetchRaw(host, token, method, route, body);
  if (!result.ok) {
    return result;
  }
  return { ok: true, value: result.value.body };
}

async function gitlabFetchRaw(
  host: string,
  token: string,
  method: string,
  route: string,
  body?: unknown,
): Promise<GitlabResult<{ body: unknown; nextPage: number | undefined }>> {
  try {
    const response = await fetch(`https://${host}/api/v4${route}`, {
      method,
      headers: {
        'PRIVATE-TOKEN': token,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    let json: unknown = undefined;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = text;
      }
    }
    if (!response.ok) {
      const msg =
        json && typeof json === 'object' && 'message' in json
          ? typeof (json as { message: unknown }).message === 'string'
            ? (json as { message: string }).message
            : JSON.stringify((json as { message: unknown }).message)
          : `HTTP ${response.status}`;
      return { ok: false, message: msg };
    }
    const nextRaw = response.headers.get('x-next-page');
    const nextPage = nextRaw && /^\d+$/.test(nextRaw) ? Number(nextRaw) : undefined;
    return { ok: true, value: { body: json, nextPage } };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

function asMr(raw: unknown): ReviewMr | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const m = raw as Record<string, unknown>;
  if (typeof m.iid !== 'number' || typeof m.web_url !== 'string') {
    return undefined;
  }
  const author =
    m.author && typeof m.author === 'object'
      ? {
          username: String((m.author as { username?: unknown }).username ?? ''),
          name:
            typeof (m.author as { name?: unknown }).name === 'string'
              ? (m.author as { name: string }).name
              : undefined,
        }
      : { username: '' };
  const mapUsers = (list: unknown): Array<{ username: string; name?: string }> => {
    if (!Array.isArray(list)) {
      return [];
    }
    return list
      .filter((u) => u && typeof u === 'object')
      .map((u) => ({
        username: String((u as { username?: unknown }).username ?? ''),
        name:
          typeof (u as { name?: unknown }).name === 'string'
            ? (u as { name: string }).name
            : undefined,
      }))
      .filter((u) => u.username);
  };
  return {
    iid: m.iid,
    title: typeof m.title === 'string' ? m.title : '',
    web_url: m.web_url,
    draft: m.draft === true || m.work_in_progress === true,
    source_branch: typeof m.source_branch === 'string' ? m.source_branch : '',
    target_branch: typeof m.target_branch === 'string' ? m.target_branch : '',
    author,
    assignees: mapUsers(m.assignees),
    reviewers: mapUsers(m.reviewers),
  };
}

export async function resolveUserIds(
  host: string,
  token: string,
  usernames: string[],
): Promise<number[]> {
  const ids: number[] = [];
  for (const username of usernames) {
    const nick = username.trim().replace(/^@/, '');
    if (!nick) {
      continue;
    }
    const result = await gitlabFetch(
      host,
      token,
      'GET',
      `/users?username=${encodeURIComponent(nick)}`,
    );
    if (!result.ok || !Array.isArray(result.value) || !result.value[0]) {
      continue;
    }
    const id = (result.value[0] as { id?: unknown }).id;
    if (typeof id === 'number') {
      ids.push(id);
    }
  }
  return ids;
}

export async function findOpenMrByBranch(
  repoUrl: string,
  token: string,
  sourceBranch: string,
): Promise<GitlabResult<ReviewMr | undefined>> {
  const loc = hostAndProject(repoUrl);
  if (!loc) {
    return { ok: false, message: 'Invalid GitLab repository URL' };
  }
  const route =
    `/projects/${encodePath(loc.projectPath)}/merge_requests` +
    `?state=opened&source_branch=${encodeURIComponent(sourceBranch)}`;
  const result = await gitlabFetch(loc.host, token, 'GET', route);
  if (!result.ok) {
    return result;
  }
  if (!Array.isArray(result.value) || result.value.length === 0) {
    return { ok: true, value: undefined };
  }
  const mr = asMr(result.value[0]);
  return { ok: true, value: mr };
}

export async function createMergeRequest(
  repoUrl: string,
  token: string,
  opts: {
    sourceBranch: string;
    targetBranch: string;
    title: string;
    draft: boolean;
    reviewerUsernames: string[];
    assigneeUsernames: string[];
    squash: boolean;
  },
): Promise<GitlabResult<ReviewMr>> {
  const loc = hostAndProject(repoUrl);
  if (!loc) {
    return { ok: false, message: 'Invalid GitLab repository URL' };
  }
  const reviewer_ids = await resolveUserIds(loc.host, token, opts.reviewerUsernames);
  const assignee_ids = await resolveUserIds(loc.host, token, opts.assigneeUsernames);
  const body = {
    source_branch: opts.sourceBranch,
    target_branch: opts.targetBranch,
    title: opts.title,
    description: '',
    draft: opts.draft,
    squash: opts.squash,
    reviewer_ids,
    assignee_ids,
  };
  const result = await gitlabFetch(
    loc.host,
    token,
    'POST',
    `/projects/${encodePath(loc.projectPath)}/merge_requests`,
    body,
  );
  if (!result.ok) {
    return result;
  }
  const mr = asMr(result.value);
  if (!mr) {
    return { ok: false, message: 'Invalid GitLab MR response' };
  }
  return { ok: true, value: mr };
}

/** Title and draft on an open merge request. */
export async function updateMergeRequest(
  repoUrl: string,
  token: string,
  iid: number,
  patch: { title?: string; draft?: boolean },
): Promise<GitlabResult<ReviewMr>> {
  const loc = hostAndProject(repoUrl);
  if (!loc) {
    return { ok: false, message: 'Invalid GitLab repository URL' };
  }
  const body: { title?: string; draft?: boolean } = {};
  if (patch.title !== undefined) {
    body.title = patch.title;
  }
  if (patch.draft !== undefined) {
    body.draft = patch.draft;
  }
  const result = await gitlabFetch(
    loc.host,
    token,
    'PUT',
    `/projects/${encodePath(loc.projectPath)}/merge_requests/${iid}`,
    body,
  );
  if (!result.ok) {
    return result;
  }
  const mr = asMr(result.value);
  if (!mr) {
    return { ok: false, message: 'Invalid GitLab MR response' };
  }
  return { ok: true, value: mr };
}

/** Close an open merge request. An already-closed request stays closed. */
export async function closeMergeRequest(
  repoUrl: string,
  token: string,
  iid: number,
): Promise<GitlabResult<void>> {
  const loc = hostAndProject(repoUrl);
  if (!loc) {
    return { ok: false, message: 'Invalid GitLab repository URL' };
  }
  const result = await gitlabFetch(
    loc.host,
    token,
    'PUT',
    `/projects/${encodePath(loc.projectPath)}/merge_requests/${iid}`,
    { state_event: 'close' },
  );
  if (!result.ok) {
    return result;
  }
  return { ok: true, value: undefined };
}

export type HostBranchPage = {
  branches: string[];
  nextPage: number | undefined;
};

export type HostCompare = {
  base: string;
  head: string;
  commitLog: string;
  diffText: string;
};

/** One page of repository branches, newest commit first (`updated_desc`). */
export async function listGitlabBranches(
  repoUrl: string,
  token: string,
  page = 1,
  perPage = 30,
): Promise<GitlabResult<HostBranchPage>> {
  const loc = hostAndProject(repoUrl);
  if (!loc) {
    return { ok: false, message: 'Invalid GitLab repository URL' };
  }
  const route =
    `/projects/${encodePath(loc.projectPath)}/repository/branches` +
    `?page=${page}&per_page=${perPage}&sort=updated_desc`;
  const result = await gitlabFetchRaw(loc.host, token, 'GET', route);
  if (!result.ok) {
    return result;
  }
  const branches = Array.isArray(result.value.body)
    ? result.value.body
        .map((item) =>
          item && typeof item === 'object' && typeof (item as { name?: unknown }).name === 'string'
            ? (item as { name: string }).name
            : '',
        )
        .filter(Boolean)
    : [];
  return { ok: true, value: { branches, nextPage: result.value.nextPage } };
}

export async function gitlabDefaultBranch(
  repoUrl: string,
  token: string,
): Promise<GitlabResult<string>> {
  const loc = hostAndProject(repoUrl);
  if (!loc) {
    return { ok: false, message: 'Invalid GitLab repository URL' };
  }
  const result = await gitlabFetch(
    loc.host,
    token,
    'GET',
    `/projects/${encodePath(loc.projectPath)}`,
  );
  if (!result.ok) {
    return result;
  }
  const name =
    result.value &&
    typeof result.value === 'object' &&
    typeof (result.value as { default_branch?: unknown }).default_branch === 'string'
      ? (result.value as { default_branch: string }).default_branch
      : '';
  if (!name) {
    return { ok: false, message: 'GitLab project has no default branch' };
  }
  return { ok: true, value: name };
}

/**
 * Nearest other branch tip on the ancestry of `branch`, walking newest commits first.
 * Falls back to the project default branch.
 */
export async function findGitlabParentBranch(
  repoUrl: string,
  token: string,
  branch: string,
): Promise<GitlabResult<string>> {
  const loc = hostAndProject(repoUrl);
  if (!loc) {
    return { ok: false, message: 'Invalid GitLab repository URL' };
  }
  const commits = await gitlabFetch(
    loc.host,
    token,
    'GET',
    `/projects/${encodePath(loc.projectPath)}/repository/commits` +
      `?ref_name=${encodeURIComponent(branch)}&per_page=100`,
  );
  if (!commits.ok) {
    return commits;
  }
  const shas = Array.isArray(commits.value)
    ? commits.value
        .map((item) =>
          item && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string'
            ? (item as { id: string }).id
            : '',
        )
        .filter(Boolean)
    : [];
  for (const sha of shas) {
    const refs = await gitlabFetch(
      loc.host,
      token,
      'GET',
      `/projects/${encodePath(loc.projectPath)}/repository/commits/${encodeURIComponent(sha)}/refs?type=branch`,
    );
    if (!refs.ok || !Array.isArray(refs.value)) {
      continue;
    }
    for (const item of refs.value) {
      const name =
        item && typeof item === 'object' && typeof (item as { name?: unknown }).name === 'string'
          ? (item as { name: string }).name
          : '';
      if (name && name !== branch) {
        return { ok: true, value: name };
      }
    }
  }
  return gitlabDefaultBranch(repoUrl, token);
}

export async function compareGitlabBranches(
  repoUrl: string,
  token: string,
  base: string,
  head: string,
): Promise<GitlabResult<HostCompare>> {
  const loc = hostAndProject(repoUrl);
  if (!loc) {
    return { ok: false, message: 'Invalid GitLab repository URL' };
  }
  const route =
    `/projects/${encodePath(loc.projectPath)}/repository/compare` +
    `?from=${encodeURIComponent(base)}&to=${encodeURIComponent(head)}`;
  const result = await gitlabFetch(loc.host, token, 'GET', route);
  if (!result.ok) {
    return result;
  }
  const raw = result.value && typeof result.value === 'object' ? (result.value as Record<string, unknown>) : {};
  const commitLog = Array.isArray(raw.commits)
    ? raw.commits
        .map((item) => {
          if (!item || typeof item !== 'object') {
            return '';
          }
          const c = item as { short_id?: unknown; title?: unknown };
          const id = typeof c.short_id === 'string' ? c.short_id : '';
          const title = typeof c.title === 'string' ? c.title : '';
          return id || title ? `${id} ${title}`.trim() : '';
        })
        .filter(Boolean)
        .join('\n')
    : '';
  const diffText = Array.isArray(raw.diffs)
    ? raw.diffs
        .map((item) => {
          if (!item || typeof item !== 'object') {
            return '';
          }
          const d = item as {
            old_path?: unknown;
            new_path?: unknown;
            diff?: unknown;
          };
          const path =
            (typeof d.new_path === 'string' && d.new_path) ||
            (typeof d.old_path === 'string' && d.old_path) ||
            '';
          const diff = typeof d.diff === 'string' ? d.diff : '';
          return path ? `--- ${path}\n${diff}` : diff;
        })
        .filter(Boolean)
        .join('\n\n')
    : '';
  return {
    ok: true,
    value: { base, head, commitLog, diffText },
  };
}
