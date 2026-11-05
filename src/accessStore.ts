import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  detectProviderFromRepoUrl,
  isReviewHostProvider,
  ReviewHostProvider,
} from './reviewHost';

export const ACCESS_FILE = '.syn3/access.json';

export const SECRET_GITLAB = 'syn3.gitlabToken';
export const SECRET_GITHUB = 'syn3.githubToken';
export const SECRET_DISCORD = 'syn3.discordBotToken';

export type GitHostProvider = 'github' | 'gitlab';

/** Per-profile host token. The legacy keys stay global and are claimed once. */
export function profileHostSecretKey(provider: GitHostProvider, profileId: string): string {
  const base = provider === 'github' ? SECRET_GITHUB : SECRET_GITLAB;
  return `${base}.${profileId}`;
}

export interface ReviewPageAccess {
  provider: ReviewHostProvider;
  channelId: string;
  repoUrl: string;
}

interface AccessFile {
  version: 1;
  pages: Record<string, ReviewPageAccess>;
}

function emptyAccess(): AccessFile {
  return { version: 1, pages: {} };
}

function normalizePage(value: unknown): ReviewPageAccess | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const raw = value as Partial<ReviewPageAccess> & { provider?: unknown };
  const channelId = typeof raw.channelId === 'string' ? raw.channelId.trim() : '';
  const repoUrl = typeof raw.repoUrl === 'string' ? raw.repoUrl.trim() : '';
  if (!channelId || !repoUrl) {
    return undefined;
  }
  const provider: ReviewHostProvider = isReviewHostProvider(raw.provider)
    ? raw.provider
    : detectProviderFromRepoUrl(repoUrl);
  return { provider, channelId, repoUrl };
}

function parseAccess(raw: string): { data: AccessFile; legacyPeople: boolean } {
  try {
    const json = JSON.parse(raw) as { pages?: Record<string, unknown> };
    const pages: Record<string, ReviewPageAccess> = {};
    let legacyPeople = false;
    if (json.pages && typeof json.pages === 'object') {
      for (const [id, def] of Object.entries(json.pages)) {
        if (def && typeof def === 'object' && 'people' in def) {
          legacyPeople = true;
        }
        const page = normalizePage(def);
        if (page) {
          pages[id] = page;
        }
      }
    }
    return { data: { version: 1, pages }, legacyPeople };
  } catch {
    return { data: emptyAccess(), legacyPeople: false };
  }
}

export class AccessStore {
  private data: AccessFile = emptyAccess();
  private loaded = false;

  constructor(private readonly root: vscode.Uri) {}

  private fileUri(): vscode.Uri {
    return vscode.Uri.joinPath(this.root, ACCESS_FILE);
  }

  async ensureLoaded(): Promise<void> {
    if (this.loaded) {
      return;
    }
    let legacyPeople = false;
    try {
      const buf = await vscode.workspace.fs.readFile(this.fileUri());
      const parsed = parseAccess(Buffer.from(buf).toString('utf8'));
      this.data = parsed.data;
      legacyPeople = parsed.legacyPeople;
    } catch {
      this.data = emptyAccess();
    }
    this.loaded = true;
    if (legacyPeople) {
      await this.persist();
    }
  }

  async reload(): Promise<void> {
    this.loaded = false;
    await this.ensureLoaded();
  }

  page(pageId: string): ReviewPageAccess | undefined {
    return this.data.pages[pageId];
  }

  entries(): Record<string, ReviewPageAccess> {
    return { ...this.data.pages };
  }

  async setPage(pageId: string, access: ReviewPageAccess): Promise<void> {
    await this.ensureLoaded();
    this.data.pages[pageId] = {
      provider: access.provider,
      channelId: access.channelId.trim(),
      repoUrl: access.repoUrl.trim(),
    };
    await this.persist();
  }

  async deletePage(pageId: string): Promise<void> {
    await this.ensureLoaded();
    if (!(pageId in this.data.pages)) {
      return;
    }
    delete this.data.pages[pageId];
    await this.persist();
  }

  /** Wipe every review page binding in access.json. */
  async clearAll(): Promise<void> {
    await this.ensureLoaded();
    this.data = emptyAccess();
    await this.persist();
  }

  private async persist(): Promise<void> {
    const dir = vscode.Uri.joinPath(this.root, '.syn3');
    try {
      await vscode.workspace.fs.createDirectory(dir);
    } catch {
      // already exists
    }
    const text = `${JSON.stringify(this.data, null, 2)}\n`;
    await vscode.workspace.fs.writeFile(this.fileUri(), Buffer.from(text, 'utf8'));
  }
}

/** Normalize git remote URL to https://host/group/project (no .git). */
export function normalizeRepoUrl(raw: string): string {
  let url = raw.trim().replace(/\.git$/i, '');
  const ssh = /^git@([^:]+):(.+)$/.exec(url);
  if (ssh) {
    return `https://${ssh[1]}/${ssh[2]}`.replace(/\/+$/, '');
  }
  const sshUrl = /^ssh:\/\/[^@]+@([^/]+)\/(.+)$/.exec(url);
  if (sshUrl) {
    return `https://${sshUrl[1]}/${sshUrl[2]}`.replace(/\/+$/, '');
  }
  return url.replace(/\/+$/, '');
}

export function repoUrlsMatch(a: string, b: string): boolean {
  return normalizeRepoUrl(a).toLowerCase() === normalizeRepoUrl(b).toLowerCase();
}

export async function readOriginRepoUrl(cwd: string): Promise<string | undefined> {
  const { execFile } = await import('child_process');
  const { promisify } = await import('util');
  const exec = promisify(execFile);
  try {
    const { stdout } = await exec('git', ['remote', 'get-url', 'origin'], { cwd });
    const url = stdout.trim();
    return url ? normalizeRepoUrl(url) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Host token of one profile. A leftover global token is copied onto this
 * profile and removed, so the next profile does not inherit it.
 */
export async function readProfileHostToken(
  secrets: vscode.SecretStorage,
  profileId: string,
  provider: GitHostProvider,
): Promise<string | undefined> {
  const scoped = await getSecret(secrets, profileHostSecretKey(provider, profileId));
  if (scoped) {
    return scoped;
  }
  const legacyKey = provider === 'github' ? SECRET_GITHUB : SECRET_GITLAB;
  const legacy = await getSecret(secrets, legacyKey);
  if (!legacy) {
    return undefined;
  }
  await secrets.store(profileHostSecretKey(provider, profileId), legacy);
  await secrets.delete(legacyKey);
  return legacy;
}

export async function writeProfileHostToken(
  secrets: vscode.SecretStorage,
  profileId: string,
  provider: GitHostProvider,
  token: string,
): Promise<void> {
  const trimmed = token.trim();
  if (!trimmed) {
    return;
  }
  await secrets.store(profileHostSecretKey(provider, profileId), trimmed);
  const legacyKey = provider === 'github' ? SECRET_GITHUB : SECRET_GITLAB;
  if (await getSecret(secrets, legacyKey)) {
    await secrets.delete(legacyKey);
  }
}

export async function deleteProfileHostToken(
  secrets: vscode.SecretStorage,
  profileId: string,
  provider: GitHostProvider,
): Promise<void> {
  await secrets.delete(profileHostSecretKey(provider, profileId));
}

export async function deleteProfileHostTokens(
  secrets: vscode.SecretStorage,
  profileId: string,
): Promise<void> {
  await deleteProfileHostToken(secrets, profileId, 'github');
  await deleteProfileHostToken(secrets, profileId, 'gitlab');
}

/** Drop Discord + host tokens (legacy keys and every profile scope). */
export async function clearAllSyn3Secrets(
  secrets: vscode.SecretStorage,
  profileIds: readonly string[],
): Promise<void> {
  await secrets.delete(SECRET_DISCORD);
  await secrets.delete(SECRET_GITHUB);
  await secrets.delete(SECRET_GITLAB);
  for (const id of profileIds) {
    await deleteProfileHostTokens(secrets, id);
  }
}

export async function ensureSecrets(
  secrets: vscode.SecretStorage,
  provider: ReviewHostProvider,
  profileId?: string,
): Promise<{ hostToken: string; discord: string } | undefined> {
  const hostToken = profileId
    ? (await readProfileHostToken(secrets, profileId, provider)) || ''
    : (await secrets.get(provider === 'github' ? SECRET_GITHUB : SECRET_GITLAB))?.trim() || '';
  const discord = (await secrets.get(SECRET_DISCORD))?.trim() || '';
  if (!hostToken || !discord) {
    return undefined;
  }
  return { hostToken, discord };
}

export async function secretsStatus(
  secrets: vscode.SecretStorage,
  profileId?: string,
): Promise<{ hasGitlab: boolean; hasGithub: boolean; hasDiscord: boolean }> {
  const gitlab = profileId
    ? await readProfileHostToken(secrets, profileId, 'gitlab')
    : (await secrets.get(SECRET_GITLAB))?.trim();
  const github = profileId
    ? await readProfileHostToken(secrets, profileId, 'github')
    : (await secrets.get(SECRET_GITHUB))?.trim();
  const discord = (await secrets.get(SECRET_DISCORD))?.trim() || '';
  return { hasGitlab: !!gitlab, hasGithub: !!github, hasDiscord: !!discord };
}

export async function storeSecrets(
  secrets: vscode.SecretStorage,
  opts: { gitlab?: string; github?: string; discord?: string; profileId?: string },
): Promise<void> {
  if (opts.profileId) {
    if (opts.gitlab?.trim()) {
      await writeProfileHostToken(secrets, opts.profileId, 'gitlab', opts.gitlab);
    }
    if (opts.github?.trim()) {
      await writeProfileHostToken(secrets, opts.profileId, 'github', opts.github);
    }
  } else {
    if (opts.gitlab?.trim()) {
      await secrets.store(SECRET_GITLAB, opts.gitlab.trim());
    }
    if (opts.github?.trim()) {
      await secrets.store(SECRET_GITHUB, opts.github.trim());
    }
  }
  if (opts.discord?.trim()) {
    await secrets.store(SECRET_DISCORD, opts.discord.trim());
  }
}

export async function getSecret(
  secrets: vscode.SecretStorage,
  key: string,
): Promise<string | undefined> {
  const value = (await secrets.get(key))?.trim();
  return value || undefined;
}

/** Write helper kept for tests that touch the file directly. */
export async function writeAccessFile(rootFs: string, data: AccessFile): Promise<void> {
  const dir = path.join(rootFs, '.syn3');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'access.json'), `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}
