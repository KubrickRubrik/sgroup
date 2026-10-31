export type ReviewHostProvider = 'gitlab' | 'github';

/** Shared shape for GitLab MR and GitHub PR. */
export interface ReviewMr {
  iid: number;
  title: string;
  web_url: string;
  draft: boolean;
  source_branch: string;
  target_branch: string;
  author: { username: string; name?: string };
  assignees: Array<{ username: string; name?: string }>;
  reviewers: Array<{ username: string; name?: string }>;
}

export function isReviewHostProvider(value: unknown): value is ReviewHostProvider {
  return value === 'gitlab' || value === 'github';
}

function hostFromRepoUrl(repoUrl: string): string {
  const raw = repoUrl.trim().replace(/\.git$/i, '');
  const ssh = /^git@([^:]+):/.exec(raw);
  if (ssh) {
    return ssh[1].toLowerCase();
  }
  const sshUrl = /^ssh:\/\/[^@]+@([^/]+)\//.exec(raw);
  if (sshUrl) {
    return sshUrl[1].toLowerCase();
  }
  const https = /^https?:\/\/([^/]+)/i.exec(raw);
  return https ? https[1].toLowerCase() : '';
}

/** Guess provider from the repository URL host. */
export function detectProviderFromRepoUrl(repoUrl: string): ReviewHostProvider {
  const host = hostFromRepoUrl(repoUrl);
  if (host === 'github.com' || host.endsWith('.github.com') || host.includes('github')) {
    return 'github';
  }
  return 'gitlab';
}

export function providerMatchesRepo(provider: ReviewHostProvider, repoUrl: string): boolean {
  return detectProviderFromRepoUrl(repoUrl) === provider;
}

export function mrThreadName(provider: ReviewHostProvider, iid: number): string {
  return provider === 'github' ? `PR #${iid}` : `MR !${iid}`;
}
