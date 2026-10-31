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

async function githubFetch(
  token: string,
  method: string,
  route: string,
  body?: unknown,
): Promise<GithubResult<unknown>> {
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
    return { ok: true, value: json };
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
