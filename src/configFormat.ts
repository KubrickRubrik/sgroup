import type {
  Appearance,
  GroupsLayout,
  MapLayout,
  PageKind,
  PanelOpenState,
} from './markerStore';

/** Discord config message kinds (attachment + header). */
export type ConfigMessageKind = 'BASE' | 'EXPLORER' | 'NOTES' | 'LINKS' | 'REVIEW';

export const BASE_CONFIG_PREFIX = 'BASE_SYN3';
export const EXPLORER_CONFIG_PREFIX = 'EXPLORER_SYN3';
export const NOTES_CONFIG_PREFIX = 'NOTES_SYN3';
export const LINKS_CONFIG_PREFIX = 'LINKS_SYN3';
export const REVIEW_CONFIG_PREFIX = 'REVIEW_SYN3';

/** @deprecated Use BASE_CONFIG_PREFIX. Kept for a few call-site renames. */
export const PROFILE_CONFIG_PREFIX = BASE_CONFIG_PREFIX;

export const CONFIG_PREFIXES: readonly ConfigMessageKind[] = [
  'BASE',
  'EXPLORER',
  'NOTES',
  'LINKS',
  'REVIEW',
];

const PREFIX_BY_KIND: Record<ConfigMessageKind, string> = {
  BASE: BASE_CONFIG_PREFIX,
  EXPLORER: EXPLORER_CONFIG_PREFIX,
  NOTES: NOTES_CONFIG_PREFIX,
  LINKS: LINKS_CONFIG_PREFIX,
  REVIEW: REVIEW_CONFIG_PREFIX,
};

/** `BASE_SYN3 | #1 | 04.11.26 12:15` or `EXPLORER_SYN3 | page-id | #1 | 04.11.26 12:15`. */
const CONFIG_HEAD_RE =
  /^\(?((?:BASE|EXPLORER|NOTES|LINKS|REVIEW)_SYN3)\)?\s*\|\s*(?:([^|#]+?)\s*\|\s*)?#(\d+)\s*\|\s*(\d{2}\.\d{2}\.\d{2}\s+\d{1,2}:\d{2})\s*$/i;

export const BASE_PATH = '.syn3/base.json';
export const PAGES_DIR = '.syn3/pages';

/** Legacy UI channel shape: `profile` is the base channel, `explorer` is files. */
export type CatalogChannels = {
  profile: string;
  explorer?: string;
  notes?: string;
  links?: string;
  review?: string;
};

/** Stamp of the last applied Discord message. */
export interface CloudStamp {
  number: number;
  /** Header date `DD.MM.YY HH:MM`. */
  headerDate: string;
  messageId: string;
}

/** Discord channels for page content, one id per page kind in a project. */
export interface ProjectChannels {
  files?: string;
  notes?: string;
  links?: string;
  review?: string;
}

/** Drop empty channel keys. */
export function packProjectChannels(channels: ProjectChannels): ProjectChannels {
  return {
    ...(channels.files?.trim() ? { files: channels.files.trim() } : {}),
    ...(channels.notes?.trim() ? { notes: channels.notes.trim() } : {}),
    ...(channels.links?.trim() ? { links: channels.links.trim() } : {}),
    ...(channels.review?.trim() ? { review: channels.review.trim() } : {}),
  };
}

export interface ProjectLock {
  profileId: string;
}

/** Review host + repo URL. Lives on the project, not on a page. */
export interface ProjectRepo {
  provider: 'github' | 'gitlab';
  repoUrl: string;
}

/** @deprecated Page-level access; prefer ProjectEntry.repo. */
export type ProjectPageAccess = ProjectRepo;

/** Page settings in the base snapshot (no map content). */
export interface ProjectPageEntry {
  version: number;
  name: string;
  kind: PageKind;
  description?: string;
  order: number;
}

/** Per-page map/group layout stored on the profile. */
export interface PageLayoutPrefs {
  layout: MapLayout;
  groupsLayout: GroupsLayout;
}

/**
 * Root profile in BASE: identity, machine binds, review paths, active project.
 * Styles and git nicks live under the project.
 */
export interface BaseProfileEntry {
  version: number;
  name: string;
  activeProjectId?: string;
  sProfileIds: string[];
  reviewSkillPath?: string;
  reviewDirPath?: string;
  reviewModel?: string;
  reviewFixModel?: string;
}

/** Styles and nicks for one profile inside one project. */
export interface ProjectProfileEntry {
  version: number;
  githubNick?: string;
  gitlabNick?: string;
  appearance: Appearance;
  open: PanelOpenState;
  /** Layout prefs keyed by page id. */
  pageLayouts?: Record<string, PageLayoutPrefs>;
}

/** One project inside the base snapshot. */
export interface ProjectEntry {
  version: number;
  name: string;
  channels: ProjectChannels;
  lock?: ProjectLock;
  /** Shared review repository for this project. */
  repo?: ProjectRepo;
  profiles: Record<string, ProjectProfileEntry>;
  pages: Record<string, ProjectPageEntry>;
}

/**
 * Full base config: every profile (with its active project) and every project.
 * Lives at `.syn3/base.json` and as the BASE_SYN3 Discord attachment.
 */
export interface BaseConfigFile {
  version: 1;
  /** Discord channel that stores this snapshot. */
  channelId: string;
  /** Profiles at the root; each keeps its own activeProjectId. */
  profiles: Record<string, BaseProfileEntry>;
  projects: Record<string, ProjectEntry>;
  /** Stamp of the last fully applied base message. */
  cloud?: CloudStamp;
  /** Stamp of the last lock field applied by auto-fetch. */
  lockCloud?: CloudStamp;
}

export interface ParsedConfigHeader {
  kind: ConfigMessageKind;
  pageId?: string;
  number: number;
  headerDate: string;
}

export interface ConfigSyncFlags {
  canPull: boolean;
  canPush: boolean;
}

export function configPrefix(kind: ConfigMessageKind): string {
  return PREFIX_BY_KIND[kind];
}

export function pageKindToConfigKind(kind: PageKind): ConfigMessageKind | undefined {
  if (kind === 'files') {
    return 'EXPLORER';
  }
  if (kind === 'notes') {
    return 'NOTES';
  }
  if (kind === 'links') {
    return 'LINKS';
  }
  if (kind === 'review') {
    return 'REVIEW';
  }
  return undefined;
}

export function configKindToPageKind(kind: ConfigMessageKind): PageKind | undefined {
  if (kind === 'EXPLORER') {
    return 'files';
  }
  if (kind === 'NOTES') {
    return 'notes';
  }
  if (kind === 'LINKS') {
    return 'links';
  }
  if (kind === 'REVIEW') {
    return 'review';
  }
  return undefined;
}

export function pageKindToChannelKey(kind: PageKind): keyof ProjectChannels {
  if (kind === 'files') {
    return 'files';
  }
  if (kind === 'notes') {
    return 'notes';
  }
  if (kind === 'links') {
    return 'links';
  }
  return 'review';
}

/** Format `04.11.26 12:15` in local time. */
export function formatConfigHeaderDate(date: Date = new Date()): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yy = String(date.getFullYear()).slice(-2);
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  return `${dd}.${mm}.${yy} ${hh}:${mi}`;
}

/** Parse header date to sortable minutes since epoch (local, year 20xx). */
export function parseConfigHeaderDate(raw: string): number | undefined {
  const match = /^(\d{2})\.(\d{2})\.(\d{2})\s+(\d{1,2}):(\d{2})$/.exec(raw.trim());
  if (!match) {
    return undefined;
  }
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = 2000 + Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59 ||
    Number.isNaN(year)
  ) {
    return undefined;
  }
  return Date.UTC(year, month - 1, day, hour, minute);
}

export function parseConfigHeader(content: string): ParsedConfigHeader | undefined {
  const head = content.trimStart().split(/\r?\n/, 1)[0] || '';
  const match = CONFIG_HEAD_RE.exec(head.trim());
  if (!match) {
    return undefined;
  }
  const prefix = match[1].toUpperCase().replace(/^\(/, '').replace(/\)$/, '');
  const kind = prefix.replace(/_SYN3$/, '') as ConfigMessageKind;
  if (!CONFIG_PREFIXES.includes(kind)) {
    return undefined;
  }
  const pageRaw = (match[2] || '').trim();
  const number = Number(match[3]);
  const headerDate = match[4].trim();
  if (!Number.isFinite(number) || number < 1) {
    return undefined;
  }
  if (kind === 'BASE') {
    if (pageRaw) {
      return undefined;
    }
    return { kind, number, headerDate };
  }
  if (!pageRaw) {
    return undefined;
  }
  return { kind, pageId: pageRaw, number, headerDate };
}

export function isConfigMessage(content: string): boolean {
  return !!parseConfigHeader(content);
}

export function formatConfigHeader(opts: {
  kind: ConfigMessageKind;
  pageId?: string;
  number: number;
  headerDate?: string;
}): string {
  const date = opts.headerDate ?? formatConfigHeaderDate();
  const prefix = configPrefix(opts.kind);
  if (opts.kind === 'BASE') {
    return `${prefix} | #${opts.number} | ${date}`;
  }
  const pageId = (opts.pageId || '').trim();
  return `${prefix} | ${pageId} | #${opts.number} | ${date}`;
}

/**
 * True when `incoming` is newer than `current`.
 * Same header date → greater Discord message id wins.
 */
export function isCloudNewer(
  incoming: { headerDate: string; messageId: string; number?: number },
  current: CloudStamp | undefined,
): boolean {
  if (!current) {
    return true;
  }
  const inTs = parseConfigHeaderDate(incoming.headerDate);
  const curTs = parseConfigHeaderDate(current.headerDate);
  if (inTs !== undefined && curTs !== undefined) {
    if (inTs !== curTs) {
      return inTs > curTs;
    }
  } else if (incoming.headerDate !== current.headerDate) {
    return incoming.headerDate > current.headerDate;
  }
  if (incoming.messageId !== current.messageId) {
    return incoming.messageId > current.messageId;
  }
  return false;
}

export function emptyBaseConfig(): BaseConfigFile {
  return {
    version: 1,
    channelId: '',
    profiles: {},
    projects: {},
  };
}

export function emptyProject(name: string): ProjectEntry {
  return {
    version: 1,
    name,
    channels: {},
    profiles: {},
    pages: {},
  };
}

export function packProjectRepo(repo?: ProjectRepo): ProjectRepo | undefined {
  if (!repo) {
    return undefined;
  }
  const provider = repo.provider === 'github' || repo.provider === 'gitlab' ? repo.provider : undefined;
  const repoUrl = typeof repo.repoUrl === 'string' ? repo.repoUrl.trim() : '';
  if (!provider || !repoUrl) {
    return undefined;
  }
  return { provider, repoUrl };
}

export function normalizeCloudStamp(raw: unknown): CloudStamp | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return undefined;
  }
  const source = raw as Partial<CloudStamp>;
  const number = typeof source.number === 'number' ? source.number : Number(source.number);
  const headerDate = typeof source.headerDate === 'string' ? source.headerDate.trim() : '';
  const messageId = typeof source.messageId === 'string' ? source.messageId.trim() : '';
  if (!Number.isFinite(number) || number < 1 || !headerDate || !messageId) {
    return undefined;
  }
  return { number, headerDate, messageId };
}

export function normalizeProjectChannels(raw: unknown): ProjectChannels {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }
  const source = raw as Record<string, unknown>;
  const pick = (key: string): string | undefined => {
    const value = typeof source[key] === 'string' ? source[key].trim() : '';
    return value || undefined;
  };
  // Accept legacy catalog keys (`explorer` / `profile`) when reading local leftovers.
  const files = pick('files') || pick('explorer');
  return packProjectChannels({
    files,
    notes: pick('notes'),
    links: pick('links'),
    review: pick('review'),
  });
}

export function resolveProjectChannel(
  channels: ProjectChannels,
  kind: ConfigMessageKind,
): string {
  if (kind === 'EXPLORER') {
    return (channels.files || '').trim();
  }
  if (kind === 'NOTES') {
    return (channels.notes || '').trim();
  }
  if (kind === 'LINKS') {
    return (channels.links || '').trim();
  }
  if (kind === 'REVIEW') {
    return (channels.review || '').trim();
  }
  return '';
}

export function pageFilePath(pageId: string): string {
  return `${PAGES_DIR}/${pageId}.json`;
}

/**
 * Merge cloud page entity map with local-only cards.
 * Existing cloud ids win; local-only ids are returned for the draft strip.
 */
export function mergeCloudEntities<T>(
  cloud: Record<string, T>,
  local: Record<string, T>,
): { merged: Record<string, T>; draftIds: string[] } {
  const merged: Record<string, T> = { ...cloud };
  const draftIds: string[] = [];
  for (const [id, value] of Object.entries(local)) {
    if (id in cloud) {
      continue;
    }
    merged[id] = value;
    draftIds.push(id);
  }
  draftIds.sort((a, b) => a.localeCompare(b));
  return { merged, draftIds };
}

/** Bump order of draft ids to sit after every cloud entity. */
export function appendDraftOrders(
  orders: Record<string, { order: number }>,
  draftIds: string[],
): void {
  if (draftIds.length === 0) {
    return;
  }
  let max = 0;
  for (const [id, entry] of Object.entries(orders)) {
    if (draftIds.includes(id)) {
      continue;
    }
    if (typeof entry.order === 'number' && entry.order > max) {
      max = entry.order;
    }
  }
  draftIds.forEach((id, index) => {
    if (orders[id]) {
      orders[id].order = max + index + 1;
    }
  });
}

export function configSyncFlags(opts: {
  dirty: boolean;
  cloudNewer: boolean;
}): ConfigSyncFlags {
  return {
    canPull: opts.cloudNewer,
    canPush: opts.dirty,
  };
}

/** Stable JSON of a project without lock (lock has its own stamp path). */
export function projectMetaJson(project: ProjectEntry): string {
  const { lock: _lock, ...rest } = project;
  return JSON.stringify(rest);
}
