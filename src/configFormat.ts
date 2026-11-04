import type { PageKind } from './markerStore';

/** Discord config message kinds (attachment + header). */
export type ConfigMessageKind = 'PROFILE' | 'EXPLORER' | 'NOTES' | 'LINKS' | 'REVIEW';

export const PROFILE_CONFIG_PREFIX = 'PROFILE_SYN3';
export const EXPLORER_CONFIG_PREFIX = 'EXPLORER_SYN3';
export const NOTES_CONFIG_PREFIX = 'NOTES_SYN3';
export const LINKS_CONFIG_PREFIX = 'LINKS_SYN3';
export const REVIEW_CONFIG_PREFIX = 'REVIEW_SYN3';

export const CONFIG_PREFIXES: readonly ConfigMessageKind[] = [
  'PROFILE',
  'EXPLORER',
  'NOTES',
  'LINKS',
  'REVIEW',
];

const PREFIX_BY_KIND: Record<ConfigMessageKind, string> = {
  PROFILE: PROFILE_CONFIG_PREFIX,
  EXPLORER: EXPLORER_CONFIG_PREFIX,
  NOTES: NOTES_CONFIG_PREFIX,
  LINKS: LINKS_CONFIG_PREFIX,
  REVIEW: REVIEW_CONFIG_PREFIX,
};

/** `PROFILE_SYN3 | #1 | 04.11.26 12:15` or `EXPLORER_SYN3 | page-id | #1 | 04.11.26 12:15`. */
const CONFIG_HEAD_RE =
  /^\(?((?:PROFILE|EXPLORER|NOTES|LINKS|REVIEW)_SYN3)\)?\s*\|\s*(?:([^|#]+?)\s*\|\s*)?#(\d+)\s*\|\s*(\d{2}\.\d{2}\.\d{2}\s+\d{1,2}:\d{2})\s*$/i;

export const CATALOG_PATH = '.syn3/catalog.json';
export const PAGES_DIR = '.syn3/pages';

/** Stamp of the last applied Discord message. */
export interface CloudStamp {
  number: number;
  /** Header date `DD.MM.YY HH:MM`. */
  headerDate: string;
  messageId: string;
}

export interface CatalogChannels {
  /** Required for Discord sync of profiles and default for maps. */
  profile: string;
  explorer?: string;
  notes?: string;
  links?: string;
}

export interface CatalogPageEntry {
  name: string;
  kind: PageKind;
  description?: string;
  order: number;
}

export interface CatalogFile {
  version: 1;
  pages: Record<string, CatalogPageEntry>;
  channels: CatalogChannels;
  cloud?: CloudStamp;
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
  if (kind === 'PROFILE') {
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
  if (opts.kind === 'PROFILE') {
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

export function emptyCatalog(): CatalogFile {
  return {
    version: 1,
    pages: {},
    channels: { profile: '' },
  };
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

export function normalizeCatalogChannels(raw: unknown): CatalogChannels {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { profile: '' };
  }
  const source = raw as Record<string, unknown>;
  const pick = (key: string): string | undefined => {
    const value = typeof source[key] === 'string' ? source[key].trim() : '';
    return value || undefined;
  };
  return {
    profile: pick('profile') || '',
    ...(pick('explorer') ? { explorer: pick('explorer') } : {}),
    ...(pick('notes') ? { notes: pick('notes') } : {}),
    ...(pick('links') ? { links: pick('links') } : {}),
  };
}

export function normalizeCatalog(raw: unknown): CatalogFile {
  const result = emptyCatalog();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return result;
  }
  const source = raw as {
    pages?: unknown;
    channels?: unknown;
    cloud?: unknown;
  };
  result.channels = normalizeCatalogChannels(source.channels);
  if (source.pages && typeof source.pages === 'object' && !Array.isArray(source.pages)) {
    let index = 0;
    for (const [id, value] of Object.entries(source.pages as Record<string, unknown>)) {
      index += 1;
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        continue;
      }
      const def = value as Partial<CatalogPageEntry>;
      const kind =
        def.kind === 'files' || def.kind === 'notes' || def.kind === 'links' || def.kind === 'review'
          ? def.kind
          : 'files';
      const name = typeof def.name === 'string' && def.name.trim() ? def.name.trim() : id;
      const description =
        typeof def.description === 'string' && def.description.trim()
          ? def.description.trim()
          : undefined;
      result.pages[id] = {
        name,
        kind,
        order: typeof def.order === 'number' ? def.order : index,
        ...(description ? { description } : {}),
      };
    }
  }
  const cloud = normalizeCloudStamp(source.cloud);
  if (cloud) {
    result.cloud = cloud;
  }
  return result;
}

/** Resolve channel for a map kind; empty map channel → profile channel. */
export function resolveConfigChannel(
  channels: CatalogChannels,
  kind: ConfigMessageKind,
): string {
  if (kind === 'PROFILE') {
    return channels.profile.trim();
  }
  if (kind === 'EXPLORER') {
    return (channels.explorer || channels.profile || '').trim();
  }
  if (kind === 'NOTES') {
    return (channels.notes || channels.profile || '').trim();
  }
  if (kind === 'LINKS') {
    return (channels.links || channels.profile || '').trim();
  }
  return '';
}

export function pageFilePath(pageId: string): string {
  return `${PAGES_DIR}/${pageId}.json`;
}

/**
 * PROFILE_SYN3 attachment body.
 * Page list, page order, and review bindings stay on each page message.
 */
export interface ProfileConfigBody {
  version: 1;
  channels: CatalogChannels;
  profiles: unknown;
  styles: unknown;
}

export function packProfileConfigBody(opts: {
  channels: CatalogChannels;
  profiles: unknown;
  styles: unknown;
}): ProfileConfigBody {
  return {
    version: 1,
    channels: {
      profile: opts.channels.profile || '',
      ...(opts.channels.explorer ? { explorer: opts.channels.explorer } : {}),
      ...(opts.channels.notes ? { notes: opts.channels.notes } : {}),
      ...(opts.channels.links ? { links: opts.channels.links } : {}),
    },
    profiles: opts.profiles,
    styles: opts.styles,
  };
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
