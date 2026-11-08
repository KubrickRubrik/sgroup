import * as crypto from 'crypto';
import {
  type BaseConfigFile,
  type BaseProfileEntry,
  type CloudStamp,
  type PageLayoutPrefs,
  type ProjectChannels,
  type ProjectEntry,
  type ProjectLock,
  type ProjectPageAccess,
  type ProjectPageEntry,
  type ProjectProfileEntry,
  type ProjectRepo,
  emptyBaseConfig,
  emptyProject,
  isLegacyBaseRaw,
  normalizeCloudStamp,
  normalizeProjectChannels,
  packProjectChannels,
  packProjectRepo,
  pageFilePath,
  BASE_PATH,
  PAGES_DIR,
} from './configFormat';
import type {
  Appearance,
  ClassDef,
  ColumnsMode,
  GroupsLayout,
  LinkDef,
  MapLayout,
  MarkerDef,
  NoteDef,
  PageDef,
  PageKind,
  PanelOpenState,
  ProfileStyle,
  StyleProfile,
  SurfaceCollapsed,
} from './markerStore';
import type { Syn3Locale } from './i18n';

const GENERAL_PROFILE_ID = 'general';
const GENERAL_PROFILE_NAME = 'Общий';

const DEFAULT_APPEARANCE_LOCAL: Appearance = {
  fontGroup: 1.15,
  fontSubgroup: 1.05,
  fontFolder: 0.95,
  fontFile: 0.9,
  fontScale: 1,
  gradientDirection: 0,
  cardGradient: true,
  cardFill: 9,
  cardBorder: 55,
  bgFolder: 4,
  bgFile: 5,
  bgSubgroup: 0,
  bgClass: 8,
  bgNote: 0,
  bgHover: 10,
  labelSaturation: 20,
  openFileMark: true,
  showErrorIcon: true,
  openFileAnimate: true,
  openFileDuration: 1,
  showProblemsTab: true,
  cyclePageScroll: true,
  openLinksInCursor: false,
  problemsError: true,
  problemsWarning: true,
  problemsInfo: true,
  language: 'ru',
  reviewRefreshSec: 60,
  projectFetchSec: 60,
  filesFetchSec: 60,
  notesFetchSec: 60,
  linksFetchSec: 60,
};

function emptyPanelOpenLocal(): PanelOpenState {
  return { bottom: false, left: false, right: true };
}

function emptyCollapsedLocal(): SurfaceCollapsed {
  return { explorer: {}, bottom: {}, left: {}, right: {} };
}

function normalizeMapLayoutLocal(value: unknown): MapLayout {
  return value === 'list' ? 'list' : 'chips';
}

function normalizeGroupsLayoutLocal(value: unknown): GroupsLayout {
  return value === '1' || value === '2' || value === '3' ? value : 'flow';
}

function normalizePageKindLocal(value: unknown): PageKind | undefined {
  return value === 'files' || value === 'notes' || value === 'links' || value === 'review'
    ? value
    : undefined;
}

function snapFetchSecLocal(value: number): number {
  const min = 30;
  const max = 3600;
  const step = 10;
  if (!Number.isFinite(value)) {
    return 60;
  }
  const clamped = Math.min(max, Math.max(min, value));
  return Math.round(clamped / step) * step;
}

function normalizeColumnsLocal(value: unknown): ColumnsMode | undefined {
  return value === 'flow' || value === '1' || value === '2' || value === '3' ? value : undefined;
}

function normalizeGroupDescriptionLocal(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n').slice(0, 3);
  const clipped = lines.join('\n').slice(0, 144);
  const trimmed = clipped.trim();
  return trimmed || undefined;
}

function normalizeIconsLocal(icons?: unknown): string[] | undefined {
  const out: string[] = [];
  if (Array.isArray(icons)) {
    for (const item of icons) {
      if (typeof item === 'string' && item.trim()) {
        out.push(item.trim());
        if (out.length >= 3) {
          break;
        }
      }
    }
  }
  return out.length > 0 ? out : undefined;
}

/** Review binding used by the access store and UI. Channel comes from the project. */
export interface PageAccessConfig {
  provider: 'github' | 'gitlab';
  channelId: string;
  repoUrl: string;
}

/**
 * On-disk / Discord body for page *content* only.
 * Name, kind, order, layouts and review bindings live in the base snapshot.
 */
export interface PageContentFile {
  version: 1;
  pageId?: string;
  deleted?: true;
  markers?: Record<string, PageMarkerEntry>;
  items?: Record<string, string[]>;
  added?: Record<string, Record<string, number>>;
  aliases?: Record<string, string>;
  classes?: Record<string, ClassDef>;
  classItems?: Record<string, string[]>;
  classAdded?: Record<string, Record<string, number>>;
  notes?: Record<string, PageNoteEntry>;
  links?: Record<string, PageLinkEntry>;
  cloud?: CloudStamp;
}

/** @deprecated Alias kept while call sites rename. */
export type PageConfigFile = PageContentFile;

export interface PageMarkerEntry {
  label: string;
  color?: string;
  icons?: string[];
  alias?: string;
  description?: string;
  parent?: string;
  page?: string;
  columns?: ColumnsMode;
  locked?: true;
  order: number;
}

export interface PageNoteEntry {
  page?: string;
  markerId?: string;
  parentNote?: string;
  text: string;
  order: number;
  color?: string;
  icons?: string[];
  locked?: true;
}

export interface PageLinkEntry {
  label: string;
  description?: string;
  url?: string;
  parent?: string;
  page?: string;
  color?: string;
  order: number;
  locked?: true;
}

/** Assembled workspace from base snapshot + content files. */
export interface SplitWorkspace {
  base: BaseConfigFile;
  pages: Record<string, PageDef>;
  markers: Record<string, MarkerDef>;
  items: Record<string, string[]>;
  added: Record<string, Record<string, number>>;
  aliases: Record<string, string>;
  classes: Record<string, ClassDef>;
  classItems: Record<string, string[]>;
  classAdded: Record<string, Record<string, number>>;
  notes: Record<string, NoteDef>;
  links: Record<string, LinkDef>;
  pageCloud: Record<string, CloudStamp>;
  profiles: StyleProfile[];
  styles: Record<string, ProfileStyle>;
  pageLayouts: Record<string, PageLayoutPrefs>;
}

export { BASE_PATH, PAGES_DIR, pageFilePath };

export function projectPageEntryFromPage(page: PageDef, version = 1): ProjectPageEntry {
  return {
    version,
    name: page.name,
    kind: page.kind,
    order: page.order,
    ...(page.description ? { description: page.description } : {}),
  };
}

function normalizeProjectRepoBody(raw: unknown): ProjectRepo | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return undefined;
  }
  const source = raw as Partial<ProjectRepo> & { channelId?: string };
  const provider = source.provider === 'github' || source.provider === 'gitlab' ? source.provider : undefined;
  const repoUrl = typeof source.repoUrl === 'string' ? source.repoUrl.trim() : '';
  if (!provider || !repoUrl) {
    return undefined;
  }
  return { provider, repoUrl };
}

/** @deprecated Prefer normalizeProjectRepoBody / project.repo. */
function normalizePageAccessBody(raw: unknown): ProjectPageAccess | undefined {
  return normalizeProjectRepoBody(raw);
}

function normalizeSProfileIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== 'string') {
      continue;
    }
    const hash = item.trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(hash) || seen.has(hash)) {
      continue;
    }
    seen.add(hash);
    out.push(hash);
  }
  return out;
}

function normalizeGitNick(raw: unknown): string | undefined {
  if (typeof raw !== 'string') {
    return undefined;
  }
  const nick = raw.trim().replace(/^@+/, '');
  return nick || undefined;
}

function numOr(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function boolOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeAppearanceLocal(raw: unknown): Appearance {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Partial<Appearance>) : {};
  const language: Syn3Locale =
    source.language === 'en' || source.language === 'ru' ? source.language : DEFAULT_APPEARANCE_LOCAL.language;
  return {
    fontGroup: numOr(source.fontGroup, DEFAULT_APPEARANCE_LOCAL.fontGroup),
    fontSubgroup: numOr(source.fontSubgroup, DEFAULT_APPEARANCE_LOCAL.fontSubgroup),
    fontFolder: numOr(source.fontFolder, DEFAULT_APPEARANCE_LOCAL.fontFolder),
    fontFile: numOr(source.fontFile, DEFAULT_APPEARANCE_LOCAL.fontFile),
    fontScale: numOr(source.fontScale, DEFAULT_APPEARANCE_LOCAL.fontScale),
    gradientDirection: numOr(source.gradientDirection, DEFAULT_APPEARANCE_LOCAL.gradientDirection),
    cardGradient: boolOr(source.cardGradient, DEFAULT_APPEARANCE_LOCAL.cardGradient),
    cardFill: numOr(source.cardFill, DEFAULT_APPEARANCE_LOCAL.cardFill),
    cardBorder: numOr(source.cardBorder, DEFAULT_APPEARANCE_LOCAL.cardBorder),
    bgFolder: numOr(source.bgFolder, DEFAULT_APPEARANCE_LOCAL.bgFolder),
    bgFile: numOr(source.bgFile, DEFAULT_APPEARANCE_LOCAL.bgFile),
    bgSubgroup: numOr(source.bgSubgroup, DEFAULT_APPEARANCE_LOCAL.bgSubgroup),
    bgClass: numOr(source.bgClass, DEFAULT_APPEARANCE_LOCAL.bgClass),
    bgNote: numOr(source.bgNote, DEFAULT_APPEARANCE_LOCAL.bgNote),
    bgHover: numOr(source.bgHover, DEFAULT_APPEARANCE_LOCAL.bgHover),
    labelSaturation: numOr(source.labelSaturation, DEFAULT_APPEARANCE_LOCAL.labelSaturation),
    openFileMark: boolOr(source.openFileMark, DEFAULT_APPEARANCE_LOCAL.openFileMark),
    showErrorIcon: boolOr(source.showErrorIcon, DEFAULT_APPEARANCE_LOCAL.showErrorIcon),
    openFileAnimate: boolOr(source.openFileAnimate, DEFAULT_APPEARANCE_LOCAL.openFileAnimate),
    openFileDuration: numOr(source.openFileDuration, DEFAULT_APPEARANCE_LOCAL.openFileDuration),
    showProblemsTab: boolOr(source.showProblemsTab, DEFAULT_APPEARANCE_LOCAL.showProblemsTab),
    cyclePageScroll: boolOr(source.cyclePageScroll, DEFAULT_APPEARANCE_LOCAL.cyclePageScroll),
    openLinksInCursor: boolOr(source.openLinksInCursor, DEFAULT_APPEARANCE_LOCAL.openLinksInCursor),
    problemsError: boolOr(source.problemsError, DEFAULT_APPEARANCE_LOCAL.problemsError),
    problemsWarning: boolOr(source.problemsWarning, DEFAULT_APPEARANCE_LOCAL.problemsWarning),
    problemsInfo: boolOr(source.problemsInfo, DEFAULT_APPEARANCE_LOCAL.problemsInfo),
    language,
    reviewRefreshSec: snapFetchSecLocal(
      numOr(source.reviewRefreshSec, DEFAULT_APPEARANCE_LOCAL.reviewRefreshSec),
    ),
    projectFetchSec: snapFetchSecLocal(
      numOr(source.projectFetchSec, DEFAULT_APPEARANCE_LOCAL.projectFetchSec),
    ),
    filesFetchSec: snapFetchSecLocal(numOr(source.filesFetchSec, DEFAULT_APPEARANCE_LOCAL.filesFetchSec)),
    notesFetchSec: snapFetchSecLocal(numOr(source.notesFetchSec, DEFAULT_APPEARANCE_LOCAL.notesFetchSec)),
    linksFetchSec: snapFetchSecLocal(numOr(source.linksFetchSec, DEFAULT_APPEARANCE_LOCAL.linksFetchSec)),
  };
}

function normalizeOpenLocal(raw: unknown): PanelOpenState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return emptyPanelOpenLocal();
  }
  const source = raw as Partial<PanelOpenState>;
  return {
    bottom: source.bottom === true,
    left: source.left === true,
    right: source.right !== false,
  };
}

function normalizePageLayoutsLocal(raw: unknown): Record<string, PageLayoutPrefs> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return undefined;
  }
  const out: Record<string, PageLayoutPrefs> = {};
  for (const [pageId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      continue;
    }
    const def = value as Partial<PageLayoutPrefs>;
    out[pageId] = {
      layout: normalizeMapLayoutLocal(def.layout),
      groupsLayout: normalizeGroupsLayoutLocal(def.groupsLayout),
    };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function normalizeProjectProfileEntry(raw: unknown): ProjectProfileEntry {
  const source =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Partial<ProjectProfileEntry> & {
          sidebar?: unknown;
          repositoryUsername?: string;
        })
      : {};
  const version =
    typeof source.version === 'number' && Number.isFinite(source.version) && source.version >= 1
      ? Math.floor(source.version)
      : 1;
  const pageLayouts = normalizePageLayoutsLocal(source.pageLayouts);
  const githubNick =
    normalizeGitNick(source.githubNick) ||
    normalizeGitNick(source.repositoryUsername);
  const gitlabNick = normalizeGitNick(source.gitlabNick);
  const tokenKey =
    typeof source.repositoryTokenKey === 'string' && source.repositoryTokenKey.trim()
      ? source.repositoryTokenKey.trim()
      : undefined;
  return {
    version,
    ...(githubNick ? { githubNick } : {}),
    ...(gitlabNick ? { gitlabNick } : {}),
    ...(tokenKey ? { repositoryTokenKey: tokenKey } : {}),
    appearance: normalizeAppearanceLocal(source.appearance),
    open: normalizeOpenLocal(source.open ?? source.sidebar),
    ...(pageLayouts ? { pageLayouts } : {}),
    ...(typeof source.reviewSkillPath === 'string' && source.reviewSkillPath.trim()
      ? { reviewSkillPath: source.reviewSkillPath.trim() }
      : {}),
    ...(typeof source.reviewDirPath === 'string' && source.reviewDirPath.trim()
      ? { reviewDirPath: source.reviewDirPath.trim() }
      : {}),
    ...(typeof source.reviewModel === 'string' && source.reviewModel.trim()
      ? { reviewModel: source.reviewModel.trim().toLowerCase() }
      : {}),
    ...(typeof source.reviewFixModel === 'string' && source.reviewFixModel.trim()
      ? { reviewFixModel: source.reviewFixModel.trim().toLowerCase() }
      : {}),
  };
}

function normalizeBaseProfileEntry(id: string, raw: unknown): BaseProfileEntry {
  const source =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Partial<BaseProfileEntry> & {
          title?: string;
          idActiveProject?: string;
          idMashines?: unknown;
        })
      : {};
  const name =
    (typeof source.title === 'string' && source.title.trim()) ||
    (typeof source.name === 'string' && source.name.trim())
      ? ((typeof source.title === 'string' && source.title.trim()) ||
          (typeof source.name === 'string' && source.name.trim()) ||
          '')
      : id === GENERAL_PROFILE_ID
        ? GENERAL_PROFILE_NAME
        : id;
  const version =
    typeof source.version === 'number' && Number.isFinite(source.version) && source.version >= 1
      ? Math.floor(source.version)
      : 1;
  const activeProjectId =
    (typeof source.idActiveProject === 'string' && source.idActiveProject.trim()) ||
    (typeof source.activeProjectId === 'string' && source.activeProjectId.trim())
      ? ((typeof source.idActiveProject === 'string' && source.idActiveProject.trim()) ||
          (typeof source.activeProjectId === 'string' && source.activeProjectId.trim()) ||
          undefined)
      : undefined;
  const machines = normalizeSProfileIds(source.idMashines ?? source.sProfileIds);
  return {
    version,
    name: id === GENERAL_PROFILE_ID ? GENERAL_PROFILE_NAME : name,
    ...(activeProjectId ? { activeProjectId } : {}),
    sProfileIds: machines,
  };
}

function normalizePageEntry(id: string, raw: unknown, index: number): ProjectPageEntry {
  const source =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Partial<ProjectPageEntry> & { access?: unknown })
      : {};
  const kind = normalizePageKindLocal(source.kind) ?? 'files';
  const name = typeof source.name === 'string' && source.name.trim() ? source.name.trim() : id;
  const description = normalizeGroupDescriptionLocal(source.description);
  const version =
    typeof source.version === 'number' && Number.isFinite(source.version) && source.version >= 1
      ? Math.floor(source.version)
      : 1;
  return {
    version,
    name,
    kind,
    order: typeof source.order === 'number' && Number.isFinite(source.order) ? source.order : index,
    ...(description ? { description } : {}),
  };
}

function normalizeLock(raw: unknown): ProjectLock | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return undefined;
  }
  const profileId =
    typeof (raw as ProjectLock).profileId === 'string'
      ? (raw as ProjectLock).profileId.trim()
      : '';
  return profileId ? { profileId } : undefined;
}

export function normalizeProjectEntry(raw: unknown, fallbackName = 'Project'): ProjectEntry {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return emptyProject(fallbackName);
  }
  const source = raw as Partial<ProjectEntry> & {
    title?: string;
    host?: string;
    repository?: string;
    dChannels?: unknown;
    profiling?: unknown;
  };
  const name =
    (typeof source.title === 'string' && source.title.trim()) ||
    (typeof source.name === 'string' && source.name.trim())
      ? ((typeof source.title === 'string' && source.title.trim()) ||
          (typeof source.name === 'string' && source.name.trim()) ||
          fallbackName)
      : fallbackName;
  const version =
    typeof source.version === 'number' && Number.isFinite(source.version) && source.version >= 1
      ? Math.floor(source.version)
      : 1;
  const profiles: Record<string, ProjectProfileEntry> = {};
  const profilingList = Array.isArray(source.profiling) ? source.profiling : undefined;
  if (profilingList) {
    for (const item of profilingList) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        continue;
      }
      const id =
        typeof (item as { id?: unknown }).id === 'string'
          ? (item as { id: string }).id.trim()
          : '';
      if (!id) {
        continue;
      }
      profiles[id] = normalizeProjectProfileEntry(item);
    }
  } else if (source.profiles && typeof source.profiles === 'object' && !Array.isArray(source.profiles)) {
    for (const [id, value] of Object.entries(source.profiles)) {
      profiles[id] = normalizeProjectProfileEntry(value);
    }
  }
  if (!profiles[GENERAL_PROFILE_ID]) {
    profiles[GENERAL_PROFILE_ID] = normalizeProjectProfileEntry({
      appearance: DEFAULT_APPEARANCE_LOCAL,
      open: emptyPanelOpenLocal(),
      version: 1,
    });
  }
  const pages: Record<string, ProjectPageEntry> = {};
  if (source.pages && typeof source.pages === 'object' && !Array.isArray(source.pages)) {
    let index = 0;
    for (const [id, value] of Object.entries(source.pages)) {
      index += 1;
      pages[id] = normalizePageEntry(id, value, index);
    }
  }
  const lock = normalizeLock(source.lock);
  const host: 'github' | 'gitlab' | undefined =
    source.host === 'github' || source.host === 'gitlab'
      ? source.host
      : undefined;
  const repository =
    typeof source.repository === 'string' ? source.repository.trim() : '';
  const repo: ProjectRepo | undefined =
    host && repository
      ? { provider: host, repoUrl: repository }
      : normalizeProjectRepoBody(source.repo);
  const channels = normalizeProjectChannels(source.dChannels ?? source.channels);
  return {
    version,
    name,
    channels,
    ...(lock ? { lock } : {}),
    ...(repo ? { repo } : {}),
    profiles,
    pages,
  };
}

export function normalizeBaseConfig(raw: unknown): BaseConfigFile {
  const result = emptyBaseConfig();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return result;
  }
  // Old base.json / BASE_SYN3 without the new wire shape — skip, do not migrate.
  if (isLegacyBaseRaw(raw)) {
    return result;
  }
  const source = raw as Partial<BaseConfigFile> & {
    dChannel?: string;
    profiles?: unknown;
    projects?: unknown;
  };
  result.channelId =
    (typeof source.dChannel === 'string' && source.dChannel.trim()) ||
    (typeof source.channelId === 'string' && source.channelId.trim()) ||
    '';
  result.snapshot = typeof source.snapshot === 'string' ? source.snapshot.trim() : '';

  if (Array.isArray(source.projects)) {
    for (const item of source.projects) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        continue;
      }
      const id =
        typeof (item as { id?: unknown }).id === 'string'
          ? (item as { id: string }).id.trim()
          : '';
      if (!id) {
        continue;
      }
      result.projects[id] = normalizeProjectEntry(item, id);
    }
  } else if (source.projects && typeof source.projects === 'object') {
    for (const [id, value] of Object.entries(source.projects as Record<string, unknown>)) {
      result.projects[id] = normalizeProjectEntry(value, id);
    }
  }

  if (Array.isArray(source.profiles)) {
    for (const item of source.profiles) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        continue;
      }
      const id =
        typeof (item as { id?: unknown }).id === 'string'
          ? (item as { id: string }).id.trim()
          : '';
      if (!id) {
        continue;
      }
      const entry = normalizeBaseProfileEntry(id, item);
      if (entry.activeProjectId && !result.projects[entry.activeProjectId]) {
        delete entry.activeProjectId;
      }
      result.profiles[id] = entry;
    }
  } else if (source.profiles && typeof source.profiles === 'object') {
    for (const [id, value] of Object.entries(source.profiles as Record<string, unknown>)) {
      const entry = normalizeBaseProfileEntry(id, value);
      if (entry.activeProjectId && !result.projects[entry.activeProjectId]) {
        delete entry.activeProjectId;
      }
      result.profiles[id] = entry;
    }
  }

  if (!result.profiles[GENERAL_PROFILE_ID]) {
    const firstProject = Object.keys(result.projects)[0];
    result.profiles[GENERAL_PROFILE_ID] = normalizeBaseProfileEntry(GENERAL_PROFILE_ID, {
      name: GENERAL_PROFILE_NAME,
      sProfileIds: [],
      version: 1,
      ...(firstProject ? { activeProjectId: firstProject } : {}),
    });
  }
  return result;
}

/** Pack content-only page body for disk / Discord. */
export function packPageContent(opts: {
  pageId: string;
  markers: Record<string, MarkerDef>;
  items: Record<string, string[]>;
  added: Record<string, Record<string, number>>;
  aliases: Record<string, string>;
  classes: Record<string, ClassDef>;
  classItems: Record<string, string[]>;
  classAdded: Record<string, Record<string, number>>;
  notes: Record<string, NoteDef>;
  links: Record<string, LinkDef>;
  markerIdsOnPage: string[];
  noteIdsOnPage: string[];
  linkIdsOnPage: string[];
  cloud?: CloudStamp;
  deleted?: true;
}): PageContentFile {
  if (opts.deleted) {
    return {
      version: 1,
      pageId: opts.pageId,
      deleted: true,
      ...(opts.cloud ? { cloud: opts.cloud } : {}),
    };
  }

  const markerSet = new Set(opts.markerIdsOnPage);
  const markers: Record<string, PageMarkerEntry> = {};
  for (const id of opts.markerIdsOnPage) {
    const src = opts.markers[id];
    if (!src) {
      continue;
    }
    const entry: PageMarkerEntry = {
      label: src.label,
      order: src.order,
    };
    if (src.color) {
      entry.color = src.color;
    }
    if (src.icons?.length) {
      entry.icons = src.icons;
    }
    if (src.alias) {
      entry.alias = src.alias;
    }
    if (src.description) {
      entry.description = src.description;
    }
    if (src.columns && src.columns !== 'flow') {
      entry.columns = src.columns;
    }
    if (src.locked) {
      entry.locked = true;
    }
    if (src.parent && markerSet.has(src.parent)) {
      entry.parent = src.parent;
    } else {
      entry.page = opts.pageId;
    }
    markers[id] = entry;
  }

  const items: Record<string, string[]> = {};
  const added: Record<string, Record<string, number>> = {};
  for (const relPath of Object.keys(opts.items).sort()) {
    const ids = (opts.items[relPath] ?? []).filter((id) => markerSet.has(id));
    if (ids.length === 0) {
      continue;
    }
    items[relPath] = ids;
    const dates: Record<string, number> = {};
    for (const id of ids) {
      const at = opts.added[relPath]?.[id];
      if (at !== undefined) {
        dates[id] = at;
      }
    }
    if (Object.keys(dates).length > 0) {
      added[relPath] = dates;
    }
  }

  const aliases: Record<string, string> = {};
  for (const relPath of Object.keys(items)) {
    const value = opts.aliases[relPath]?.trim();
    if (value) {
      aliases[relPath] = value;
    }
  }

  const classes: Record<string, ClassDef> = {};
  const classItems: Record<string, string[]> = {};
  const classAdded: Record<string, Record<string, number>> = {};
  for (const classId of Object.keys(opts.classes).sort()) {
    const classDef = opts.classes[classId];
    const ids = (opts.classItems[classId] ?? []).filter((id) => markerSet.has(id));
    if (!classDef || ids.length === 0) {
      continue;
    }
    classes[classId] = {
      relPath: classDef.relPath,
      name: classDef.name,
      ...(classDef.line !== undefined ? { line: classDef.line } : {}),
      ...(classDef.alias ? { alias: classDef.alias } : {}),
    };
    classItems[classId] = ids;
    const dates: Record<string, number> = {};
    for (const markerId of ids) {
      const at = opts.classAdded[classId]?.[markerId];
      if (at !== undefined) {
        dates[markerId] = at;
      }
    }
    if (Object.keys(dates).length > 0) {
      classAdded[classId] = dates;
    }
    const alias = opts.aliases[classDef.relPath]?.trim();
    if (alias) {
      aliases[classDef.relPath] = alias;
    }
  }

  const notes: Record<string, PageNoteEntry> = {};
  for (const noteId of opts.noteIdsOnPage) {
    const src = opts.notes[noteId];
    if (!src) {
      continue;
    }
    const entry: PageNoteEntry = {
      text: src.text,
      order: src.order,
    };
    if (src.page) {
      entry.page = src.page;
    }
    if (src.markerId) {
      entry.markerId = src.markerId;
    }
    if (src.parentNote) {
      entry.parentNote = src.parentNote;
    }
    if (src.color) {
      entry.color = src.color;
    }
    if (src.icons?.length) {
      entry.icons = src.icons;
    }
    if (src.locked) {
      entry.locked = true;
    }
    notes[noteId] = entry;
  }

  const links: Record<string, PageLinkEntry> = {};
  for (const linkId of opts.linkIdsOnPage) {
    const src = opts.links[linkId];
    if (!src) {
      continue;
    }
    const entry: PageLinkEntry = {
      label: src.label,
      order: src.order,
    };
    if (src.description) {
      entry.description = src.description;
    }
    if (src.url) {
      entry.url = src.url;
    }
    if (src.parent) {
      entry.parent = src.parent;
    }
    if (src.page) {
      entry.page = src.page;
    }
    if (src.color) {
      entry.color = src.color;
    }
    if (src.locked) {
      entry.locked = true;
    }
    links[linkId] = entry;
  }

  const payload: PageContentFile = {
    version: 1,
    pageId: opts.pageId,
  };
  if (Object.keys(markers).length > 0) {
    payload.markers = markers;
  }
  if (Object.keys(items).length > 0) {
    payload.items = items;
  }
  if (Object.keys(added).length > 0) {
    payload.added = added;
  }
  if (Object.keys(aliases).length > 0) {
    payload.aliases = aliases;
  }
  if (Object.keys(classes).length > 0) {
    payload.classes = classes;
    payload.classItems = classItems;
    if (Object.keys(classAdded).length > 0) {
      payload.classAdded = classAdded;
    }
  }
  if (Object.keys(notes).length > 0) {
    payload.notes = notes;
  }
  if (Object.keys(links).length > 0) {
    payload.links = links;
  }
  if (opts.cloud) {
    payload.cloud = opts.cloud;
  }
  return payload;
}

/** @deprecated Use packPageContent. */
export const packPageConfig = packPageContent;

export function normalizePageContent(raw: unknown): PageContentFile {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { version: 1 };
  }
  const source = raw as PageContentFile & {
    page?: { name?: string; kind?: PageKind; layout?: MapLayout; groupsLayout?: GroupsLayout };
    access?: unknown;
    fixed?: boolean;
  };
  const pageId = typeof source.pageId === 'string' ? source.pageId.trim() : '';
  const result: PageContentFile = {
    version: 1,
    ...(pageId ? { pageId } : {}),
    ...(source.deleted ? { deleted: true as const } : {}),
  };
  const cloud = normalizeCloudStamp(source.cloud);
  if (cloud) {
    result.cloud = cloud;
  }
  if (source.deleted) {
    return result;
  }
  if (source.markers && typeof source.markers === 'object') {
    result.markers = {};
    let index = 0;
    for (const [id, value] of Object.entries(source.markers)) {
      index += 1;
      if (!value || typeof value !== 'object') {
        continue;
      }
      const def = value as Partial<PageMarkerEntry>;
      const label = typeof def.label === 'string' ? def.label : id;
      const entry: PageMarkerEntry = {
        label,
        order: typeof def.order === 'number' ? def.order : index,
      };
      if (typeof def.color === 'string') {
        entry.color = def.color;
      }
      const icons = normalizeIconsLocal(def.icons);
      if (icons) {
        entry.icons = icons;
      }
      if (typeof def.alias === 'string' && def.alias.trim()) {
        entry.alias = def.alias.trim();
      }
      const desc = normalizeGroupDescriptionLocal(def.description);
      if (desc) {
        entry.description = desc;
      }
      if (typeof def.parent === 'string') {
        entry.parent = def.parent;
      }
      if (typeof def.page === 'string') {
        entry.page = def.page;
      }
      const columns = normalizeColumnsLocal(def.columns);
      if (columns && columns !== 'flow') {
        entry.columns = columns;
      }
      if (def.locked) {
        entry.locked = true;
      }
      result.markers[id] = entry;
    }
  }
  if (source.items && typeof source.items === 'object') {
    result.items = source.items as Record<string, string[]>;
  }
  if (source.added && typeof source.added === 'object') {
    result.added = source.added as Record<string, Record<string, number>>;
  }
  if (source.aliases && typeof source.aliases === 'object') {
    result.aliases = source.aliases as Record<string, string>;
  }
  if (source.classes && typeof source.classes === 'object') {
    result.classes = source.classes as Record<string, ClassDef>;
  }
  if (source.classItems && typeof source.classItems === 'object') {
    result.classItems = source.classItems as Record<string, string[]>;
  }
  if (source.classAdded && typeof source.classAdded === 'object') {
    result.classAdded = source.classAdded as Record<string, Record<string, number>>;
  }
  if (source.notes && typeof source.notes === 'object') {
    result.notes = {};
    let index = 0;
    for (const [id, value] of Object.entries(source.notes)) {
      index += 1;
      if (!value || typeof value !== 'object') {
        continue;
      }
      const def = value as Partial<PageNoteEntry>;
      const entry: PageNoteEntry = {
        text: typeof def.text === 'string' ? def.text : '',
        order: typeof def.order === 'number' ? def.order : index,
      };
      if (typeof def.page === 'string') {
        entry.page = def.page;
      }
      if (typeof def.markerId === 'string') {
        entry.markerId = def.markerId;
      }
      if (typeof def.parentNote === 'string') {
        entry.parentNote = def.parentNote;
      }
      if (typeof def.color === 'string') {
        entry.color = def.color;
      }
      const icons = normalizeIconsLocal(def.icons);
      if (icons) {
        entry.icons = icons;
      }
      if (def.locked) {
        entry.locked = true;
      }
      result.notes[id] = entry;
    }
  }
  if (source.links && typeof source.links === 'object') {
    result.links = {};
    let index = 0;
    for (const [id, value] of Object.entries(source.links)) {
      index += 1;
      if (!value || typeof value !== 'object') {
        continue;
      }
      const def = value as Partial<PageLinkEntry>;
      const entry: PageLinkEntry = {
        label: typeof def.label === 'string' ? def.label : id,
        order: typeof def.order === 'number' ? def.order : index,
      };
      if (typeof def.description === 'string' && def.description.trim()) {
        entry.description = def.description.trim();
      }
      if (typeof def.url === 'string') {
        entry.url = def.url;
      }
      if (typeof def.parent === 'string') {
        entry.parent = def.parent;
      }
      if (typeof def.page === 'string') {
        entry.page = def.page;
      }
      if (typeof def.color === 'string') {
        entry.color = def.color;
      }
      if (def.locked) {
        entry.locked = true;
      }
      result.links[id] = entry;
    }
  }
  return result;
}

/** @deprecated Use normalizePageContent. */
export const normalizePageConfig = normalizePageContent;

export function packBaseProfileEntry(opts: {
  profile: StyleProfile;
  activeProjectId?: string;
  version: number;
}): BaseProfileEntry {
  return {
    version: opts.version,
    name: opts.profile.id === GENERAL_PROFILE_ID ? GENERAL_PROFILE_NAME : opts.profile.name,
    ...(opts.activeProjectId ? { activeProjectId: opts.activeProjectId } : {}),
    sProfileIds: [...opts.profile.sProfileIds],
  };
}

/** Styles + nicks + review for one profile inside a project. */
export function packProfileEntry(opts: {
  profile: StyleProfile;
  style: ProfileStyle;
  pageLayouts?: Record<string, PageLayoutPrefs>;
  version: number;
  repositoryTokenKey?: string;
}): ProjectProfileEntry {
  const pageLayouts =
    opts.pageLayouts && Object.keys(opts.pageLayouts).length > 0 ? opts.pageLayouts : undefined;
  const tokenKey =
    (opts.repositoryTokenKey || opts.profile.repositoryTokenKey || '').trim() || undefined;
  return {
    version: opts.version,
    ...(opts.profile.githubNick ? { githubNick: opts.profile.githubNick } : {}),
    ...(opts.profile.gitlabNick ? { gitlabNick: opts.profile.gitlabNick } : {}),
    ...(tokenKey ? { repositoryTokenKey: tokenKey } : {}),
    appearance: opts.style.appearance,
    open: opts.style.open,
    ...(pageLayouts ? { pageLayouts } : {}),
    ...(opts.profile.reviewSkillPath ? { reviewSkillPath: opts.profile.reviewSkillPath } : {}),
    ...(opts.profile.reviewDirPath ? { reviewDirPath: opts.profile.reviewDirPath } : {}),
    ...(opts.profile.reviewModel ? { reviewModel: opts.profile.reviewModel } : {}),
    ...(opts.profile.reviewFixModel ? { reviewFixModel: opts.profile.reviewFixModel } : {}),
  };
}

export function unpackProfilesFromBase(
  base: BaseConfigFile,
  project?: ProjectEntry,
): {
  profiles: StyleProfile[];
  styles: Record<string, ProfileStyle>;
  pageLayouts: Record<string, PageLayoutPrefs>;
} {
  const profiles: StyleProfile[] = [];
  const styles: Record<string, ProfileStyle> = {};
  const pageLayouts: Record<string, PageLayoutPrefs> = {};
  const ids = Object.keys(base.profiles).sort((a, b) => {
    if (a === GENERAL_PROFILE_ID) {
      return -1;
    }
    if (b === GENERAL_PROFILE_ID) {
      return 1;
    }
    return a.localeCompare(b);
  });
  for (const id of ids) {
    const root = base.profiles[id];
    if (!root) {
      continue;
    }
    const data = project?.profiles[id];
    profiles.push({
      id,
      name: id === GENERAL_PROFILE_ID ? GENERAL_PROFILE_NAME : root.name,
      sProfileIds: [...root.sProfileIds],
      ...(data?.reviewSkillPath ? { reviewSkillPath: data.reviewSkillPath } : {}),
      ...(data?.reviewDirPath ? { reviewDirPath: data.reviewDirPath } : {}),
      ...(data?.reviewModel ? { reviewModel: data.reviewModel } : {}),
      ...(data?.reviewFixModel ? { reviewFixModel: data.reviewFixModel } : {}),
      ...(data?.githubNick ? { githubNick: data.githubNick } : {}),
      ...(data?.gitlabNick ? { gitlabNick: data.gitlabNick } : {}),
      ...(data?.repositoryTokenKey ? { repositoryTokenKey: data.repositoryTokenKey } : {}),
    });
    styles[id] = {
      appearance: data?.appearance ?? { ...DEFAULT_APPEARANCE_LOCAL },
      open: data?.open ?? emptyPanelOpenLocal(),
    };
    if (data?.pageLayouts) {
      for (const [pageId, layout] of Object.entries(data.pageLayouts)) {
        pageLayouts[pageId] = layout;
      }
    }
  }
  if (!profiles.some((p) => p.id === GENERAL_PROFILE_ID)) {
    profiles.unshift({
      id: GENERAL_PROFILE_ID,
      name: GENERAL_PROFILE_NAME,
      sProfileIds: [],
    });
    styles[GENERAL_PROFILE_ID] = {
      appearance: { ...DEFAULT_APPEARANCE_LOCAL },
      open: emptyPanelOpenLocal(),
    };
  }
  return { profiles, styles, pageLayouts };
}

/** @deprecated Prefer unpackProfilesFromBase. */
export function unpackProfilesFromProject(project: ProjectEntry): {
  profiles: StyleProfile[];
  styles: Record<string, ProfileStyle>;
  pageLayouts: Record<string, PageLayoutPrefs>;
} {
  return unpackProfilesFromBase(
    {
      snapshot: '',
      channelId: '',
      profiles: Object.fromEntries(
        Object.keys(project.profiles).map((id) => [
          id,
          {
            version: 1,
            name: id === GENERAL_PROFILE_ID ? GENERAL_PROFILE_NAME : id,
            sProfileIds: [] as string[],
          },
        ]),
      ),
      projects: {},
    },
    project,
  );
}

export function assembleSplitWorkspace(
  base: BaseConfigFile,
  pageFiles: Record<string, PageContentFile>,
  projectId?: string,
): SplitWorkspace {
  const normalized = normalizeBaseConfig(base);
  const activeId =
    (projectId && normalized.projects[projectId] ? projectId : undefined) ||
    normalized.profiles[GENERAL_PROFILE_ID]?.activeProjectId ||
    Object.values(normalized.profiles).find((p) => p.activeProjectId && normalized.projects[p.activeProjectId])
      ?.activeProjectId ||
    Object.keys(normalized.projects)[0];
  const project = activeId ? normalized.projects[activeId] : undefined;
  const pages: Record<string, PageDef> = {};
  const markers: Record<string, MarkerDef> = {};
  const items: Record<string, string[]> = {};
  const added: Record<string, Record<string, number>> = {};
  const aliases: Record<string, string> = {};
  const classes: Record<string, ClassDef> = {};
  const classItems: Record<string, string[]> = {};
  const classAdded: Record<string, Record<string, number>> = {};
  const notes: Record<string, NoteDef> = {};
  const links: Record<string, LinkDef> = {};
  const pageCloud: Record<string, CloudStamp> = {};

  const unpacked = unpackProfilesFromBase(normalized, project);
  let profiles: StyleProfile[] = unpacked.profiles;
  let styles: Record<string, ProfileStyle> = unpacked.styles;
  let pageLayouts: Record<string, PageLayoutPrefs> = unpacked.pageLayouts;

  if (project) {

    const orderedIds = Object.keys(project.pages).sort(
      (a, b) => project.pages[a].order - project.pages[b].order || a.localeCompare(b),
    );

    for (const pageId of orderedIds) {
      const meta = project.pages[pageId];
      const file = pageFiles[pageId] ?? { version: 1 as const, pageId };
      const layout = pageLayouts[pageId] ?? { layout: 'chips' as const, groupsLayout: 'flow' as const };
      pages[pageId] = {
        name: meta.name,
        kind: meta.kind,
        order: meta.order,
        layout: layout.layout,
        groupsLayout: layout.groupsLayout,
        collapsed: emptyCollapsedLocal(),
        ...(meta.description ? { description: meta.description } : {}),
      };
      if (file.cloud) {
        pageCloud[pageId] = file.cloud;
      }
      if (file.deleted) {
        continue;
      }
      for (const [id, def] of Object.entries(file.markers ?? {})) {
        markers[id] = {
          label: def.label,
          order: def.order,
          ...(def.color ? { color: def.color } : {}),
          ...(def.icons ? { icons: def.icons } : {}),
          ...(def.alias ? { alias: def.alias } : {}),
          ...(def.description ? { description: def.description } : {}),
          ...(def.parent ? { parent: def.parent } : {}),
          ...(def.page ? { page: def.page } : !def.parent ? { page: pageId } : {}),
          ...(def.columns ? { columns: def.columns } : {}),
          ...(def.locked ? { locked: true } : {}),
        };
      }
      for (const [relPath, ids] of Object.entries(file.items ?? {})) {
        items[relPath] = [...(items[relPath] ?? []), ...ids];
      }
      for (const [relPath, dates] of Object.entries(file.added ?? {})) {
        added[relPath] = { ...(added[relPath] ?? {}), ...dates };
      }
      for (const [relPath, alias] of Object.entries(file.aliases ?? {})) {
        aliases[relPath] = alias;
      }
      for (const [classId, def] of Object.entries(file.classes ?? {})) {
        classes[classId] = def;
      }
      for (const [classId, ids] of Object.entries(file.classItems ?? {})) {
        classItems[classId] = [...(classItems[classId] ?? []), ...ids];
      }
      for (const [classId, dates] of Object.entries(file.classAdded ?? {})) {
        classAdded[classId] = { ...(classAdded[classId] ?? {}), ...dates };
      }
      for (const [id, def] of Object.entries(file.notes ?? {})) {
        notes[id] = {
          text: def.text,
          order: def.order,
          ...(def.page ? { page: def.page } : {}),
          ...(def.markerId ? { markerId: def.markerId } : {}),
          ...(def.parentNote ? { parentNote: def.parentNote } : {}),
          ...(def.color ? { color: def.color } : {}),
          ...(def.icons ? { icons: def.icons } : {}),
          ...(def.locked ? { locked: true } : {}),
        };
      }
      for (const [id, def] of Object.entries(file.links ?? {})) {
        links[id] = {
          label: def.label,
          order: def.order,
          ...(def.description ? { description: def.description } : {}),
          ...(def.url ? { url: def.url } : {}),
          ...(def.parent ? { parent: def.parent } : {}),
          ...(def.page ? { page: def.page } : {}),
          ...(def.color ? { color: def.color } : {}),
          ...(def.locked ? { locked: true } : {}),
        };
      }
    }
  }

  return {
    base: normalized,
    pages,
    markers,
    items,
    added,
    aliases,
    classes,
    classItems,
    classAdded,
    notes,
    links,
    pageCloud,
    profiles,
    styles,
    pageLayouts,
  };
}

/** Wire project page meta without internal version bump field noise. */
function packWirePageEntry(page: ProjectPageEntry): Record<string, unknown> {
  return {
    name: page.name,
    kind: page.kind,
    order: page.order,
    ...(page.description ? { description: page.description } : {}),
  };
}

function packWireProfilingEntry(id: string, entry: ProjectProfileEntry): Record<string, unknown> {
  return {
    id,
    ...(entry.githubNick ? { githubNick: entry.githubNick } : {}),
    ...(entry.gitlabNick ? { gitlabNick: entry.gitlabNick } : {}),
    ...(entry.repositoryTokenKey ? { repositoryTokenKey: entry.repositoryTokenKey } : {}),
    sidebar: {
      bottom: entry.open.bottom === true,
      left: entry.open.left === true,
      right: entry.open.right !== false,
    },
    appearance: entry.appearance,
    ...(entry.pageLayouts && Object.keys(entry.pageLayouts).length > 0
      ? { pageLayouts: entry.pageLayouts }
      : {}),
    ...(entry.reviewSkillPath ? { reviewSkillPath: entry.reviewSkillPath } : {}),
    ...(entry.reviewDirPath ? { reviewDirPath: entry.reviewDirPath } : {}),
    ...(entry.reviewModel ? { reviewModel: entry.reviewModel } : {}),
    ...(entry.reviewFixModel ? { reviewFixModel: entry.reviewFixModel } : {}),
  };
}

/** Canonical Discord / disk body (arrays, dChannel, no snapshot). */
export function packBaseConfigWireBody(base: BaseConfigFile): Record<string, unknown> {
  const normalized: BaseConfigFile = {
    snapshot: base.snapshot || '',
    channelId: (base.channelId || '').trim(),
    profiles: { ...base.profiles },
    projects: { ...base.projects },
  };
  if (!normalized.profiles[GENERAL_PROFILE_ID]) {
    const firstProject = Object.keys(normalized.projects)[0];
    normalized.profiles[GENERAL_PROFILE_ID] = {
      version: 1,
      name: GENERAL_PROFILE_NAME,
      sProfileIds: [],
      ...(firstProject ? { activeProjectId: firstProject } : {}),
    };
  }
  const profiles = Object.keys(normalized.profiles)
    .sort((a, b) => {
      if (a === GENERAL_PROFILE_ID) {
        return -1;
      }
      if (b === GENERAL_PROFILE_ID) {
        return 1;
      }
      return a.localeCompare(b);
    })
    .map((id) => {
      const profile = normalized.profiles[id];
      return {
        id,
        title: id === GENERAL_PROFILE_ID ? GENERAL_PROFILE_NAME : profile.name,
        idMashines: [...profile.sProfileIds],
        ...(profile.activeProjectId ? { idActiveProject: profile.activeProjectId } : {}),
      };
    });
  const projects = Object.keys(normalized.projects)
    .sort()
    .map((id) => {
      const project = normalized.projects[id];
      const repo = packProjectRepo(project.repo);
      const pages: Record<string, Record<string, unknown>> = {};
      for (const pageId of Object.keys(project.pages).sort(
        (a, b) => project.pages[a].order - project.pages[b].order || a.localeCompare(b),
      )) {
        pages[pageId] = packWirePageEntry(project.pages[pageId]);
      }
      const profiling = Object.keys(project.profiles)
        .sort((a, b) => {
          if (a === GENERAL_PROFILE_ID) {
            return -1;
          }
          if (b === GENERAL_PROFILE_ID) {
            return 1;
          }
          return a.localeCompare(b);
        })
        .map((profileId) => packWireProfilingEntry(profileId, project.profiles[profileId]));
      return {
        id,
        title: project.name,
        host: repo?.provider ?? 'github',
        repository: repo?.repoUrl ?? '',
        dChannels: packProjectChannels(project.channels),
        profiling,
        pages,
        ...(project.lock ? { lock: { profileId: project.lock.profileId } } : {}),
      };
    });
  return {
    dChannel: normalized.channelId,
    profiles,
    projects,
  };
}

/** SHA-256 of canonical wire JSON without snapshot. */
export function computeBaseSnapshot(base: BaseConfigFile): string {
  const body = packBaseConfigWireBody(base);
  return crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
}

export function stringifyBaseConfig(base: BaseConfigFile): string {
  const normalized = normalizeBaseConfig(base);
  const wire = packBaseConfigWireBody(normalized);
  const snapshot = computeBaseSnapshot(normalized);
  const payload = {
    snapshot,
    ...wire,
  };
  return JSON.stringify(payload, null, 2) + '\n';
}

/** Body posted to Discord — same wire shape as disk, with fresh snapshot. */
export function packBaseConfigBody(base: BaseConfigFile): BaseConfigFile {
  const normalized = normalizeBaseConfig(base);
  const snapshot = computeBaseSnapshot(normalized);
  return {
    ...normalized,
    snapshot,
  };
}

/** Wire JSON string for Discord attachment (arrays + snapshot). */
export function stringifyBaseConfigBody(base: BaseConfigFile): string {
  const packed = packBaseConfigBody(base);
  const wire = packBaseConfigWireBody(packed);
  return JSON.stringify({ snapshot: packed.snapshot, ...wire }, null, 2) + '\n';
}

export function stringifyPageConfig(file: PageContentFile): string {
  return JSON.stringify(file, null, 2) + '\n';
}

/** Stable content fingerprint of a page file without the cloud stamp. */
export function pageConfigContentJson(file: PageContentFile): string {
  const { cloud: _cloud, ...rest } = file;
  return JSON.stringify(rest) + '\n';
}

export function mergeProjectChannels(
  current: ProjectChannels,
  partial: Partial<ProjectChannels>,
): ProjectChannels {
  return packProjectChannels({
    files: partial.files !== undefined ? partial.files : current.files,
    notes: partial.notes !== undefined ? partial.notes : current.notes,
    links: partial.links !== undefined ? partial.links : current.links,
    review: partial.review !== undefined ? partial.review : current.review,
  });
}
