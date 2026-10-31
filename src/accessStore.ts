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

export interface AccessPerson {
  nick: string;
  name?: string;
}

export interface ReviewPageAccess {
  provider: ReviewHostProvider;
  channelId: string;
  repoUrl: string;
  people: AccessPerson[];
}

interface AccessFile {
  version: 1;
  pages: Record<string, ReviewPageAccess>;
}

function emptyAccess(): AccessFile {
  return { version: 1, pages: {} };
}

function normalizePerson(value: unknown): AccessPerson | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const raw = value as Partial<AccessPerson>;
  const nick = typeof raw.nick === 'string' ? raw.nick.trim() : '';
  if (!nick) {
    return undefined;
  }
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  return name ? { nick, name } : { nick };
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
  const people = Array.isArray(raw.people)
    ? raw.people.map(normalizePerson).filter((p): p is AccessPerson => !!p)
    : [];
  return { provider, channelId, repoUrl, people };
}

function parseAccess(raw: string): AccessFile {
  try {
    const json = JSON.parse(raw) as Partial<AccessFile>;
    const pages: Record<string, ReviewPageAccess> = {};
    if (json.pages && typeof json.pages === 'object') {
      for (const [id, def] of Object.entries(json.pages)) {
        const page = normalizePage(def);
        if (page) {
          pages[id] = page;
        }
      }
    }
    return { version: 1, pages };
  } catch {
    return emptyAccess();
  }
}

/** Display label: real name when set, otherwise nick. */
export function personLabel(person: AccessPerson): string {
  return person.name?.trim() || person.nick;
}

/** Resolve nick → AccessPerson from the page roster. */
export function findPerson(people: AccessPerson[], nick: string): AccessPerson | undefined {
  const key = nick.trim().toLowerCase();
  return people.find((p) => p.nick.toLowerCase() === key);
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
    try {
      const buf = await vscode.workspace.fs.readFile(this.fileUri());
      this.data = parseAccess(Buffer.from(buf).toString('utf8'));
    } catch {
      this.data = emptyAccess();
    }
    this.loaded = true;
  }

  async reload(): Promise<void> {
    this.loaded = false;
    await this.ensureLoaded();
  }

  page(pageId: string): ReviewPageAccess | undefined {
    return this.data.pages[pageId];
  }

  async setPage(pageId: string, access: ReviewPageAccess): Promise<void> {
    await this.ensureLoaded();
    this.data.pages[pageId] = {
      provider: access.provider,
      channelId: access.channelId.trim(),
      repoUrl: access.repoUrl.trim(),
      people: access.people
        .map((p) => normalizePerson(p))
        .filter((p): p is AccessPerson => !!p),
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

export async function ensureSecrets(
  secrets: vscode.SecretStorage,
  provider: ReviewHostProvider,
): Promise<{ hostToken: string; discord: string } | undefined> {
  const hostKey = provider === 'github' ? SECRET_GITHUB : SECRET_GITLAB;
  const hostToken = (await secrets.get(hostKey))?.trim() || '';
  const discord = (await secrets.get(SECRET_DISCORD))?.trim() || '';
  if (!hostToken || !discord) {
    return undefined;
  }
  return { hostToken, discord };
}

export async function secretsStatus(
  secrets: vscode.SecretStorage,
): Promise<{ hasGitlab: boolean; hasGithub: boolean; hasDiscord: boolean }> {
  const gitlab = (await secrets.get(SECRET_GITLAB))?.trim() || '';
  const github = (await secrets.get(SECRET_GITHUB))?.trim() || '';
  const discord = (await secrets.get(SECRET_DISCORD))?.trim() || '';
  return { hasGitlab: !!gitlab, hasGithub: !!github, hasDiscord: !!discord };
}

export async function storeSecrets(
  secrets: vscode.SecretStorage,
  opts: { gitlab?: string; github?: string; discord?: string },
): Promise<void> {
  if (opts.gitlab?.trim()) {
    await secrets.store(SECRET_GITLAB, opts.gitlab.trim());
  }
  if (opts.github?.trim()) {
    await secrets.store(SECRET_GITHUB, opts.github.trim());
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
