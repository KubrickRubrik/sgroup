import { normalizeRepoUrl } from './accessStore';
import { ReviewMr } from './reviewHost';

export type GithubResult<T> = { ok: true; value: T } | { ok: false; message: string };

function ownerRepo(webBase: string): { owner: string; repo: string } | undefined {
  const base = normalizeRepoUrl(webBase);
  const m = /^https?:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/]+)$/i.exec(base);
  if (!m) {
    // Allow GitHub Enterprise-style hosts: https://host/owner/repo
    const generic = /^https?:\/\/([^/]+)\/([^/]+)\/([^/]+)$/i.exec(base);
    if (!generic) {
      return undefined;
    }
    return { owner: generic[2], repo: generic[3] };
  }
  return { owner: m[1], repo: m[2] };
}

export type GithubPage<T> = {
  items: T;
  nextPage: number | undefined;
};

function nextPageFromLink(link: string | null): number | undefined {
  if (!link) {
    return undefined;
  }
  for (const part of link.split(',')) {
    const m = /<[^>]*[?&]page=(\d+)[^>]*>;\s*rel="next"/i.exec(part.trim());
    if (m) {
      return Number(m[1]);
    }
  }
  return undefined;
}

async function githubFetch(
  token: string,
  method: string,
  route: string,
  body?: unknown,
): Promise<GithubResult<unknown>> {
  const result = await githubFetchRaw(token, method, route, body);
  if (!result.ok) {
    return result;
  }
  return { ok: true, value: result.value.body };
}

async function githubFetchRaw(
  token: string,
  method: string,
  route: string,
  body?: unknown,
): Promise<GithubResult<{ body: unknown; nextPage: number | undefined }>> {
  try {
    const response = await fetch(`https://api.github.com${route}`, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'syn3-vscode',
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
          ? String((json as { message: unknown }).message)
          : `HTTP ${response.status}`;
      const errors =
        json && typeof json === 'object' && Array.isArray((json as { errors?: unknown }).errors)
          ? (json as { errors: Array<{ message?: string }> }).errors
              .map((e) => e.message)
              .filter(Boolean)
              .join('; ')
          : '';
      return { ok: false, message: errors ? `${msg}: ${errors}` : msg };
    }
    return {
      ok: true,
      value: { body: json, nextPage: nextPageFromLink(response.headers.get('link')) },
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

function asPr(raw: unknown): ReviewMr | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const p = raw as Record<string, unknown>;
  if (typeof p.number !== 'number' || typeof p.html_url !== 'string') {
    return undefined;
  }
  const user =
    p.user && typeof p.user === 'object'
      ? {
          username: String((p.user as { login?: unknown }).login ?? ''),
          name: undefined as string | undefined,
        }
      : { username: '' };
  const mapUsers = (list: unknown): Array<{ username: string; name?: string }> => {
    if (!Array.isArray(list)) {
      return [];
    }
    return list
      .filter((u) => u && typeof u === 'object')
      .map((u) => ({
        username: String((u as { login?: unknown }).login ?? ''),
      }))
      .filter((u) => u.username);
  };
  const head =
    p.head && typeof p.head === 'object'
      ? String((p.head as { ref?: unknown }).ref ?? '')
      : '';
  const base =
    p.base && typeof p.base === 'object'
      ? String((p.base as { ref?: unknown }).ref ?? '')
      : '';
  return {
    iid: p.number,
    title: typeof p.title === 'string' ? p.title : '',
    web_url: p.html_url,
    draft: p.draft === true,
    source_branch: head,
    target_branch: base,
    author: user,
    assignees: mapUsers(p.assignees),
    reviewers: mapUsers(
      p.requested_reviewers && typeof p.requested_reviewers === 'object'
        ? p.requested_reviewers
        : [],
    ),
  };
}

export async function findOpenPrByBranch(
  repoUrl: string,
  token: string,
  sourceBranch: string,
): Promise<GithubResult<ReviewMr | undefined>> {
  const loc = ownerRepo(repoUrl);
  if (!loc) {
    return { ok: false, message: 'Invalid GitHub repository URL' };
  }
  const head = `${loc.owner}:${sourceBranch}`;
  const route =
    `/repos/${encodeURIComponent(loc.owner)}/${encodeURIComponent(loc.repo)}/pulls` +
    `?state=open&head=${encodeURIComponent(head)}`;
  const result = await githubFetch(token, 'GET', route);
  if (!result.ok) {
    return result;
  }
  if (!Array.isArray(result.value) || result.value.length === 0) {
    return { ok: true, value: undefined };
  }
  const pr = asPr(result.value[0]);
  return { ok: true, value: pr };
}

export async function createPullRequest(
  repoUrl: string,
  token: string,
  opts: {
    sourceBranch: string;
    targetBranch: string;
    title: string;
    draft: boolean;
    reviewerUsernames: string[];
    assigneeUsernames: string[];
  },
): Promise<GithubResult<ReviewMr>> {
  const loc = ownerRepo(repoUrl);
  if (!loc) {
    return { ok: false, message: 'Invalid GitHub repository URL' };
  }
  const created = await githubFetch(
    token,
    'POST',
    `/repos/${encodeURIComponent(loc.owner)}/${encodeURIComponent(loc.repo)}/pulls`,
    {
      title: opts.title,
      head: opts.sourceBranch,
      base: opts.targetBranch,
      draft: opts.draft,
      body: '',
    },
  );
  if (!created.ok) {
    return created;
  }
  let pr = asPr(created.value);
  if (!pr) {
    return { ok: false, message: 'Invalid GitHub PR response' };
  }

  const reviewers = opts.reviewerUsernames
    .map((n) => n.trim().replace(/^@/, ''))
    .filter(Boolean);
  if (reviewers.length) {
    await githubFetch(
      token,
      'POST',
      `/repos/${encodeURIComponent(loc.owner)}/${encodeURIComponent(loc.repo)}/pulls/${pr.iid}/requested_reviewers`,
      { reviewers },
    );
  }

  const assignees = opts.assigneeUsernames
    .map((n) => n.trim().replace(/^@/, ''))
    .filter(Boolean);
  if (assignees.length) {
    await githubFetch(
      token,
      'POST',
      `/repos/${encodeURIComponent(loc.owner)}/${encodeURIComponent(loc.repo)}/issues/${pr.iid}/assignees`,
      { assignees },
    );
  }

  // Re-fetch to include reviewers/assignees when possible.
  const refreshed = await githubFetch(
    token,
    'GET',
    `/repos/${encodeURIComponent(loc.owner)}/${encodeURIComponent(loc.repo)}/pulls/${pr.iid}`,
  );
  if (refreshed.ok) {
    const next = asPr(refreshed.value);
    if (next) {
      pr = next;
    }
  }
  return { ok: true, value: pr };
}

function graphqlError(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || !Array.isArray((value as { errors?: unknown }).errors)) {
    return undefined;
  }
  const errors = (value as { errors: Array<{ message?: unknown }> }).errors;
  const text = errors
    .map((entry) => (typeof entry.message === 'string' ? entry.message : ''))
    .filter(Boolean)
    .join('; ');
  return text || undefined;
}

/** Title via REST. Draft via GraphQL — the pulls API does not change draft on update. */
export async function updatePullRequest(
  repoUrl: string,
  token: string,
  number: number,
  patch: { title?: string; draft?: boolean },
): Promise<GithubResult<ReviewMr>> {
  const loc = ownerRepo(repoUrl);
  if (!loc) {
    return { ok: false, message: 'Invalid GitHub repository URL' };
  }
  const route = `/repos/${encodeURIComponent(loc.owner)}/${encodeURIComponent(loc.repo)}/pulls/${number}`;
  const current = await githubFetch(token, 'GET', route);
  if (!current.ok) {
    return current;
  }
  const nodeId =
    current.value &&
    typeof current.value === 'object' &&
    typeof (current.value as { node_id?: unknown }).node_id === 'string'
      ? (current.value as { node_id: string }).node_id
      : undefined;
  const currentPr = asPr(current.value);
  if (!currentPr || !nodeId) {
    return { ok: false, message: 'Invalid GitHub PR response' };
  }
  if (patch.draft !== undefined && patch.draft !== currentPr.draft) {
    const query = patch.draft
      ? 'mutation($id:ID!){ convertPullRequestToDraft(input:{pullRequestId:$id}){ pullRequest { number } } }'
      : 'mutation($id:ID!){ markPullRequestReadyForReview(input:{pullRequestId:$id}){ pullRequest { number } } }';
    const mutated = await githubFetch(token, 'POST', '/graphql', {
      query,
      variables: { id: nodeId },
    });
    if (!mutated.ok) {
      return mutated;
    }
    const failed = graphqlError(mutated.value);
    if (failed) {
      return { ok: false, message: failed };
    }
  }
  if (patch.title !== undefined && patch.title !== currentPr.title) {
    const titled = await githubFetch(token, 'PATCH', route, { title: patch.title });
    if (!titled.ok) {
      return titled;
    }
  }
  const refreshedAfter = await githubFetch(token, 'GET', route);
  if (!refreshedAfter.ok) {
    return refreshedAfter;
  }
  const next = asPr(refreshedAfter.value);
  if (!next) {
    return { ok: false, message: 'Invalid GitHub PR response' };
  }
  return { ok: true, value: next };
}

/** Close an open pull request. An already-closed request stays closed. */
export async function closePullRequest(
  repoUrl: string,
  token: string,
  number: number,
): Promise<GithubResult<void>> {
  const loc = ownerRepo(repoUrl);
  if (!loc) {
    return { ok: false, message: 'Invalid GitHub repository URL' };
  }
  const result = await githubFetch(
    token,
    'PATCH',
    `/repos/${encodeURIComponent(loc.owner)}/${encodeURIComponent(loc.repo)}/pulls/${number}`,
    { state: 'closed' },
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

/** One page of repository branches from the host. */
export async function listGithubBranches(
  repoUrl: string,
  token: string,
  page = 1,
  perPage = 30,
): Promise<GithubResult<HostBranchPage>> {
  const loc = ownerRepo(repoUrl);
  if (!loc) {
    return { ok: false, message: 'Invalid GitHub repository URL' };
  }
  const route =
    `/repos/${encodeURIComponent(loc.owner)}/${encodeURIComponent(loc.repo)}/branches` +
    `?page=${page}&per_page=${perPage}`;
  const result = await githubFetchRaw(token, 'GET', route);
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

export async function githubDefaultBranch(
  repoUrl: string,
  token: string,
): Promise<GithubResult<string>> {
  const loc = ownerRepo(repoUrl);
  if (!loc) {
    return { ok: false, message: 'Invalid GitHub repository URL' };
  }
  const result = await githubFetch(
    token,
    'GET',
    `/repos/${encodeURIComponent(loc.owner)}/${encodeURIComponent(loc.repo)}`,
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
    return { ok: false, message: 'GitHub repository has no default branch' };
  }
  return { ok: true, value: name };
}

/**
 * Nearest other branch tip on the ancestry of `branch`, walking newest commits first.
 * Falls back to the repository default branch.
 */
export async function findGithubParentBranch(
  repoUrl: string,
  token: string,
  branch: string,
): Promise<GithubResult<string>> {
  const loc = ownerRepo(repoUrl);
  if (!loc) {
    return { ok: false, message: 'Invalid GitHub repository URL' };
  }
  const commits = await githubFetch(
    token,
    'GET',
    `/repos/${encodeURIComponent(loc.owner)}/${encodeURIComponent(loc.repo)}/commits` +
      `?sha=${encodeURIComponent(branch)}&per_page=100`,
  );
  if (!commits.ok) {
    return commits;
  }
  const shas = Array.isArray(commits.value)
    ? commits.value
        .map((item) =>
          item && typeof item === 'object' && typeof (item as { sha?: unknown }).sha === 'string'
            ? (item as { sha: string }).sha
            : '',
        )
        .filter(Boolean)
    : [];
  for (const sha of shas) {
    const refs = await githubFetch(
      token,
      'GET',
      `/repos/${encodeURIComponent(loc.owner)}/${encodeURIComponent(loc.repo)}/commits/${encodeURIComponent(sha)}/branches-where-head`,
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
  return githubDefaultBranch(repoUrl, token);
}

export async function compareGithubBranches(
  repoUrl: string,
  token: string,
  base: string,
  head: string,
): Promise<GithubResult<HostCompare>> {
  const loc = ownerRepo(repoUrl);
  if (!loc) {
    return { ok: false, message: 'Invalid GitHub repository URL' };
  }
  const route =
    `/repos/${encodeURIComponent(loc.owner)}/${encodeURIComponent(loc.repo)}/compare/` +
    `${encodeURIComponent(base)}...${encodeURIComponent(head)}`;
  const result = await githubFetch(token, 'GET', route);
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
          const c = item as { sha?: unknown; commit?: { message?: unknown } };
          const id = typeof c.sha === 'string' ? c.sha.slice(0, 7) : '';
          const message =
            c.commit && typeof c.commit === 'object' && typeof c.commit.message === 'string'
              ? c.commit.message.split('\n')[0] || ''
              : '';
          return id || message ? `${id} ${message}`.trim() : '';
        })
        .filter(Boolean)
        .join('\n')
    : '';
  const diffText = Array.isArray(raw.files)
    ? raw.files
        .map((item) => {
          if (!item || typeof item !== 'object') {
            return '';
          }
          const f = item as { filename?: unknown; patch?: unknown; status?: unknown };
          const path = typeof f.filename === 'string' ? f.filename : '';
          const patch = typeof f.patch === 'string' ? f.patch : '';
          const status = typeof f.status === 'string' ? f.status : '';
          if (!path) {
            return '';
          }
          return `--- ${path}${status ? ` (${status})` : ''}\n${patch}`;
        })
        .filter(Boolean)
        .join('\n\n')
    : '';
  return {
    ok: true,
    value: { base, head, commitLog, diffText },
  };
}
