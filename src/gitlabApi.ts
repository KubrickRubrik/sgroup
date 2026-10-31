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

async function gitlabFetch(
  host: string,
  token: string,
  method: string,
  route: string,
  body?: unknown,
): Promise<GitlabResult<unknown>> {
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
    return { ok: true, value: json };
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
