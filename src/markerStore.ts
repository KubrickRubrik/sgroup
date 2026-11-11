import * as crypto from 'crypto';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  formatEntityLink,
  mapNoteEntityLinks,
  parseEntityLink,
  type EntityLinkKind,
  stripNoteEntityLink,
} from './entityLink';
import {
  decodeHistory,
  dropPageHistory,
  emptyHistory,
  emptyStacks,
  encodeHistory,
  fingerprint,
  HISTORY_PATH,
  pageStacks,
  peek,
  remember,
  take,
  type PageHistoryBook,
} from './history';
import { normalizeLocale, Syn3Locale } from './i18n';
import {
  isLinkPaletteColor,
  LINK_PALETTE_DEFAULT,
  LINK_PALETTE_HEX,
  randomLinkPaletteColor,
} from './linkPalette';
import { normalizeHex } from './palette';
import {
  type BaseConfigFile,
  type CloudStamp,
  type ConfigSyncFlags,
  type ProjectChannels,
  type ProjectEntry,
  type ProjectLock,
  type ProjectPageEntry,
  type ProjectRepo,
  BASE_PATH,
  configSyncFlags,
  emptyBaseConfig,
  emptyProject,
  formatConfigHeaderDate,
  isLegacyBaseRaw,
  packProjectChannels,
  packProjectRepo,
  pageKindToConfigKind,
  parseConfigHeader,
  resolveProjectChannel,
} from './configFormat';
import {
  assembleSplitWorkspace,
  mergeProjectChannels,
  normalizeBaseConfig,
  normalizePageConfig,
  computeBaseSnapshot,
  packBaseConfigBody,
  packBaseProfileEntry,
  packPageConfig,
  packProfileEntry,
  pageConfigContentJson,
  pageFilePath,
  PAGES_DIR,
  projectPageEntryFromPage,
  stringifyBaseConfig,
  stringifyBaseConfigBody,
  stringifyPageConfig,
  unpackProfilesFromBase,
  type PageAccessConfig,
  type PageContentFile,
} from './configPersist';
import {
  findLatestConfigMessage,
  findLatestPageMessages,
  downloadConfigAttachment,
  latestIsNewer,
  nextConfigNumber,
  postConfigMessage,
  stampFromLatest,
} from './configCloud';
import { ensureSetupProbe } from './discordSetup';
import {
  cloneProfileLayout,
  emptyPositions,
  emptyProfileLayout,
  normalizePositions,
  packFocus,
  packProfileLayout,
  POS_LOCAL_PATH,
  POS_REMOTE_PATH,
  positionsIsEmpty,
  pruneFocusMap,
  prunePositionsFile,
  type PageTombstone,
  type PositionSyncState,
  type PositionsFile,
  type ProfileLayout,
  type WorkingFocus,
} from './positions';
import { getSecret, SECRET_DISCORD, type AccessStore } from './accessStore';

export type { WorkingFocus };

/** Legacy UI channel shape (`profile` = base channel, `explorer` = files). */
export type CatalogChannels = {
  profile: string;
  explorer?: string;
  notes?: string;
  links?: string;
  review?: string;
};

/** Max nesting depth: root (0) → subgroup (1) → subgroup of subgroup (2). */
export const MAX_MARKER_DEPTH = 2;

/** Fixed markers file relative to the workspace folder. */
export const CONFIG_PATH = '.syn3/syn3.json';
/** Profile list and per-machine bindings (`sProfileIds`). */
export const PROFILES_PATH = '.syn3/profiles.json';
/** Appearance per profile id. */
export const STYLES_PATH = '.syn3/styles.json';
/** Live per-profile card layout (gitignored). */
export { POS_LOCAL_PATH, POS_REMOTE_PATH, BASE_PATH, PAGES_DIR };
/** Built-in profile: always present, cannot be renamed or deleted. */
export const GENERAL_PROFILE_ID = 'general';
export const GENERAL_PROFILE_NAME = 'Общий';

/** SHA-256 of `vscode.env.machineId` — stored in profile `idMashines` / `sProfileIds`, not the raw id. */
export function hashMachineId(machineId: string = vscode.env.machineId): string {
  return crypto.createHash('sha256').update(machineId).digest('hex');
}
/** Older locations, newest first. */
const LEGACY_CONFIG_PATHS = [
  '.sgroup/sgroup.json',
  '.sgroup/vgroup.json',
  '.vgroup/vgroup.json',
  '.vscode/vgroup.json',
];
const LEGACY_HISTORY_PATH = '.sgroup/history.json';

/** Chip/list columns inside a single group. */
export type ColumnsMode = 'flow' | '1' | '2' | '3';
export const COLUMNS_MODES: readonly ColumnsMode[] = ['flow', '1', '2', '3'];

/** Max named map pages (one per kind: files, notes, links, review). */
export const MAX_PAGES = 4;
/** Default page id created for legacy files and empty stores. */
export const DEFAULT_PAGE_ID = 'map';

export type PageKind = 'files' | 'notes' | 'links' | 'review';
export type MapLayout = 'chips' | 'list';
export type GroupsLayout = 'flow' | '1' | '2' | '3';

export function normalizeColumns(value: unknown): ColumnsMode | undefined {
  return value === 'flow' || value === '1' || value === '2' || value === '3' ? value : undefined;
}

/** Max length of a group description (characters after newline normalization). */
export const MAX_GROUP_DESCRIPTION_LENGTH = 144;
/** Max lines in a group description (at most two newline characters). */
export const MAX_GROUP_DESCRIPTION_LINES = 3;

/**
 * Normalize an optional group description: `\r\n` → `\n`, at most three lines,
 * at most {@link MAX_GROUP_DESCRIPTION_LENGTH} characters, then trim.
 * Empty result means the field should be cleared.
 */
export function normalizeGroupDescription(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n').slice(0, MAX_GROUP_DESCRIPTION_LINES);
  const clipped = lines.join('\n').slice(0, MAX_GROUP_DESCRIPTION_LENGTH);
  const trimmed = clipped.trim();
  return trimmed || undefined;
}

export function normalizePageKind(value: unknown): PageKind | undefined {
  return value === 'files' || value === 'notes' || value === 'links' || value === 'review'
    ? value
    : undefined;
}

export function normalizeMapLayout(value: unknown): MapLayout {
  return value === 'list' ? 'list' : 'chips';
}

export function normalizeGroupsLayout(value: unknown): GroupsLayout {
  return value === '1' || value === '2' || value === '3' ? value : 'flow';
}

/** Named style profile. `general` is built-in. */
export interface StyleProfile {
  id: string;
  name: string;
  /** SHA-256 hashes of machine ids currently bound to this profile. */
  sProfileIds: string[];
  /** Absolute or workspace-relative path to the review skill. */
  reviewSkillPath?: string;
  /** Absolute or workspace-relative directory for temporary review files. */
  reviewDirPath?: string;
  /** Optional Cursor Agent `--model` value. Empty → CLI default. */
  reviewModel?: string;
  /** Optional Cursor Agent `--model` for Neurofix. Empty → CLI default. */
  reviewFixModel?: string;
  /** GitHub login for this profile. The token is not stored here. */
  githubNick?: string;
  /** GitLab username for this profile. The token is not stored here. */
  gitlabNick?: string;
  /** Opaque SecretStorage key for the host token. */
  repositoryTokenKey?: string;
}

/** Profile row for UI — no machine hashes. */
export interface StyleProfileInfo {
  id: string;
  name: string;
  /** How many machines are bound to this profile (`sProfileIds.length`). */
  boundCount: number;
  reviewSkillPath: string;
  reviewDirPath: string;
  reviewModel: string;
  reviewFixModel: string;
}

/** Map font scales, card paint, and Explorer label saturation, stored per profile in styles.json. */
export interface Appearance {
  /** Top-level group title scale vs editor font size. */
  fontGroup: number;
  /** Nested subgroup title scale. */
  fontSubgroup: number;
  /** Marked folder row scale. */
  fontFolder: number;
  /** File row scale. */
  fontFile: number;
  /** Multiplier applied to all four font scales. */
  fontScale: number;
  /** Group-card gradient turn: 0 = default 135°, 100 = +360° (same look). */
  gradientDirection: number;
  /** Parent-card fill and border gradient. Off removes both paints; sliders stay stored. */
  cardGradient: boolean;
  /** Brightest stop of the parent-card fill gradient, 0–100. Other stops scale with it. */
  cardFill: number;
  /** Brightest stop of the parent-card border gradient, 0–100. */
  cardBorder: number;
  /** Folder chip/row fill, percent of the group color. */
  bgFolder: number;
  /** File chip/row fill, percent of the group color. */
  bgFile: number;
  /** Subgroup header fill, percent of the group color. */
  bgSubgroup: number;
  /** Class chip/row fill, percent of the group color. */
  bgClass: number;
  /** Note body fill, percent of the group color. */
  bgNote: number;
  /**
   * Shared hover wash of white over the resting fill.
   * 0 keeps the resting fill, 100 covers it with solid white.
   */
  bgHover: number;
  /** Explorer file-name tint: 0 = theme foreground, 100 = group stripe color. */
  labelSaturation: number;
  /** Corner on badges whose file is open in an editor tab. */
  openFileMark: boolean;
  /** Error glyph between the type icon and the name. */
  showErrorIcon: boolean;
  /** Blink the corner chain of the focused editor tab, and every error icon. */
  openFileAnimate: boolean;
  /** Blink cycle length in seconds, 0–3. */
  openFileDuration: number;
  /** Problems tab on the pager strip (not a map page). */
  showProblemsTab: boolean;
  /** Horizontal wheel wraps from the first pager chip to the last and back. */
  cyclePageScroll: boolean;
  /** Open link-map URLs in Cursor Simple Browser instead of the system browser. */
  openLinksInCursor: boolean;
  /**
   * Groups, files, and classes: the title slot shows the alias and the small
   * line shows the real name. Off keeps the alias above the name.
   * Missing alias still shows only the name.
   */
  aliasTitle: boolean;
  /** Include Error diagnostics on the Problems page. */
  problemsError: boolean;
  /** Include Warning diagnostics on the Problems page. */
  problemsWarning: boolean;
  /** Include Information diagnostics on the Problems page. */
  problemsInfo: boolean;
  /** Syn3 UI language for menus and settings of this profile. */
  language: Syn3Locale;
  /** Auto-refresh interval for review pages (MR messages), seconds (30–3600). */
  reviewRefreshSec: number;
  /** Auto-fetch interval for the project lock from the base channel. */
  projectFetchSec: number;
  /** Auto-check interval for explorer page content. */
  filesFetchSec: number;
  /** Auto-check interval for notes page content. */
  notesFetchSec: number;
  /** Auto-check interval for links page content. */
  linksFetchSec: number;
}

export const DEFAULT_APPEARANCE: Appearance = {
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
  aliasTitle: false,
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

const FONT_SCALE_MIN = 0.6;
const FONT_SCALE_MAX = 2;
const FONT_SCALE_STEP = 0.05;
const MULTIPLIER_MIN = 1;
const MULTIPLIER_MAX = 5;
const MULTIPLIER_STEP = 0.1;
const SATURATION_STEP = 5;
const GRADIENT_STEP = 1;
const OPEN_FILE_DURATION_STEP = 0.1;
const REVIEW_REFRESH_MIN = 30;
const REVIEW_REFRESH_MAX = 3600;
const REVIEW_REFRESH_STEP = 10;

export function snapFontScale(value: number): number {
  return snap(value, FONT_SCALE_MIN, FONT_SCALE_MAX, FONT_SCALE_STEP);
}

export function snapMultiplier(value: number): number {
  return snap(value, MULTIPLIER_MIN, MULTIPLIER_MAX, MULTIPLIER_STEP);
}

export function snapSaturation(value: number): number {
  return snap(value, 0, 100, SATURATION_STEP);
}

export function snapGradientDirection(value: number): number {
  return snapPercent(value);
}

/** 0–100 color amount, step 1. 0 is fully transparent, 100 is solid group color. */
export function snapPercent(value: number): number {
  return snap(value, 0, 100, GRADIENT_STEP);
}

/** Open-tab blink cycle, seconds. */
export function snapOpenFileDuration(value: number): number {
  return snap(value, 0, 3, OPEN_FILE_DURATION_STEP);
}

/** Review page auto-refresh interval, seconds. */
export function snapReviewRefreshSec(value: number): number {
  return snap(value, REVIEW_REFRESH_MIN, REVIEW_REFRESH_MAX, REVIEW_REFRESH_STEP);
}

function snap(value: number, min: number, max: number, step: number): number {
  const clamped = Math.min(max, Math.max(min, value));
  const snapped = Math.round(clamped / step) * step;
  return Math.round(snapped * 1000) / 1000;
}

export function normalizeAppearance(raw: unknown): Appearance {
  const source = raw && typeof raw === 'object' ? (raw as Partial<Record<keyof Appearance, unknown>>) : {};
  return {
    fontGroup: snapFontScale(numOr(source.fontGroup, DEFAULT_APPEARANCE.fontGroup)),
    fontSubgroup: snapFontScale(numOr(source.fontSubgroup, DEFAULT_APPEARANCE.fontSubgroup)),
    fontFolder: snapFontScale(numOr(source.fontFolder, DEFAULT_APPEARANCE.fontFolder)),
    fontFile: snapFontScale(numOr(source.fontFile, DEFAULT_APPEARANCE.fontFile)),
    fontScale: snapMultiplier(numOr(source.fontScale, DEFAULT_APPEARANCE.fontScale)),
    gradientDirection: snapGradientDirection(
      numOr(source.gradientDirection, DEFAULT_APPEARANCE.gradientDirection),
    ),
    cardGradient: boolOr(source.cardGradient, DEFAULT_APPEARANCE.cardGradient),
    cardFill: snapPercent(numOr(source.cardFill, DEFAULT_APPEARANCE.cardFill)),
    cardBorder: snapPercent(numOr(source.cardBorder, DEFAULT_APPEARANCE.cardBorder)),
    bgFolder: snapPercent(numOr(source.bgFolder, DEFAULT_APPEARANCE.bgFolder)),
    bgFile: snapPercent(numOr(source.bgFile, DEFAULT_APPEARANCE.bgFile)),
    bgSubgroup: snapPercent(numOr(source.bgSubgroup, DEFAULT_APPEARANCE.bgSubgroup)),
    bgClass: snapPercent(numOr(source.bgClass, DEFAULT_APPEARANCE.bgClass)),
    bgNote: snapPercent(numOr(source.bgNote, DEFAULT_APPEARANCE.bgNote)),
    bgHover: snapPercent(numOr(source.bgHover, DEFAULT_APPEARANCE.bgHover)),
    labelSaturation: snapSaturation(numOr(source.labelSaturation, DEFAULT_APPEARANCE.labelSaturation)),
    openFileMark: boolOr(source.openFileMark, DEFAULT_APPEARANCE.openFileMark),
    showErrorIcon: boolOr(source.showErrorIcon, DEFAULT_APPEARANCE.showErrorIcon),
    openFileAnimate: boolOr(source.openFileAnimate, DEFAULT_APPEARANCE.openFileAnimate),
    openFileDuration: snapOpenFileDuration(numOr(source.openFileDuration, DEFAULT_APPEARANCE.openFileDuration)),
    showProblemsTab: boolOr(source.showProblemsTab, DEFAULT_APPEARANCE.showProblemsTab),
    cyclePageScroll: boolOr(source.cyclePageScroll, DEFAULT_APPEARANCE.cyclePageScroll),
    openLinksInCursor: boolOr(source.openLinksInCursor, DEFAULT_APPEARANCE.openLinksInCursor),
    aliasTitle: boolOr(source.aliasTitle, DEFAULT_APPEARANCE.aliasTitle),
    ...normalizeProblemsFilters(source),
    language: normalizeLocale(source.language ?? DEFAULT_APPEARANCE.language),
    reviewRefreshSec: snapReviewRefreshSec(
      numOr(source.reviewRefreshSec, DEFAULT_APPEARANCE.reviewRefreshSec),
    ),
    projectFetchSec: snapReviewRefreshSec(
      numOr(source.projectFetchSec, DEFAULT_APPEARANCE.projectFetchSec),
    ),
    filesFetchSec: snapReviewRefreshSec(
      numOr(source.filesFetchSec, DEFAULT_APPEARANCE.filesFetchSec),
    ),
    notesFetchSec: snapReviewRefreshSec(
      numOr(source.notesFetchSec, DEFAULT_APPEARANCE.notesFetchSec),
    ),
    linksFetchSec: snapReviewRefreshSec(
      numOr(source.linksFetchSec, DEFAULT_APPEARANCE.linksFetchSec),
    ),
  };
}

/** At least one severity filter stays on. */
function normalizeProblemsFilters(source: Partial<Record<keyof Appearance, unknown>>): {
  problemsError: boolean;
  problemsWarning: boolean;
  problemsInfo: boolean;
} {
  let problemsError = boolOr(source.problemsError, DEFAULT_APPEARANCE.problemsError);
  const problemsWarning = boolOr(source.problemsWarning, DEFAULT_APPEARANCE.problemsWarning);
  const problemsInfo = boolOr(source.problemsInfo, DEFAULT_APPEARANCE.problemsInfo);
  if (!problemsError && !problemsWarning && !problemsInfo) {
    problemsError = true;
  }
  return { problemsError, problemsWarning, problemsInfo };
}

function numOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function boolOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** Max badge emoji shown to the right of the fixed type icon on the map. */
export const MAX_BADGE_ICONS = 3;

/**
 * Normalize badge emoji list (max {@link MAX_BADGE_ICONS}).
 * Migrates legacy single `icon` string into a one-element list.
 */
export function normalizeIcons(icons?: unknown, legacyIcon?: unknown): string[] | undefined {
  const out: string[] = [];
  if (Array.isArray(icons)) {
    for (const item of icons) {
      if (typeof item === 'string' && item.trim()) {
        out.push(item.trim());
        if (out.length >= MAX_BADGE_ICONS) {
          break;
        }
      }
    }
  }
  if (out.length === 0 && typeof legacyIcon === 'string' && legacyIcon.trim()) {
    out.push(legacyIcon.trim());
  }
  return out.length > 0 ? out : undefined;
}

export interface MarkerDef {
  label: string;
  /** Theme color id (`syn3.red`, `charts.red`) or `#rrggbb`. */
  color?: string;
  /** Optional badge emoji (up to {@link MAX_BADGE_ICONS}) shown right of the type icon. */
  icons?: string[];
  /** Display alias shown above the group label. */
  alias?: string;
  /** Short description (max {@link MAX_GROUP_DESCRIPTION_LENGTH}, three lines). */
  description?: string;
  /** Parent marker id; omitted for top-level groups. */
  parent?: string;
  /** Page id for top-level groups only; nested groups inherit via root ancestor. */
  page?: string;
  /** Item columns inside this group. Absent means flow. */
  columns?: ColumnsMode;
  /** When true, map edits to this group are blocked. Absent means open. */
  locked?: true;
  /** Order among siblings that share the same parent. */
  order: number;
}

/** Map surface that remembers its own group folds and active page. */
export const MAP_SURFACES = ['explorer', 'bottom', 'left', 'right'] as const;
export type MapSurface = (typeof MAP_SURFACES)[number];

/** Panels whose open/closed state is stored in the config. */
export const OPEN_SURFACES = ['bottom', 'left', 'right'] as const;
export type OpenSurface = (typeof OPEN_SURFACES)[number];

/** Folded group ids, separate for Explorer, bottom, left column, and right column. */
export interface SurfaceCollapsed {
  explorer: Record<string, boolean>;
  bottom: Record<string, boolean>;
  left: Record<string, boolean>;
  right: Record<string, boolean>;
}

export function emptyCollapsed(): SurfaceCollapsed {
  return { explorer: {}, bottom: {}, left: {}, right: {} };
}

/** Active page per surface and open flags for movable panels. Not part of undo history. */
export interface SurfacesState {
  explorer: { page: string };
  bottom: { page: string };
  left: { page: string };
  right: { page: string };
  open: { bottom: boolean; left: boolean; right: boolean };
}

export function emptySurfaces(defaultPage = DEFAULT_PAGE_ID): SurfacesState {
  return {
    explorer: { page: defaultPage },
    bottom: { page: defaultPage },
    left: { page: defaultPage },
    right: { page: defaultPage },
    open: { ...emptyPanelOpen() },
  };
}

/** Named map page (pager slide). */
export interface PageDef {
  name: string;
  kind: PageKind;
  /** Short description shown in the page settings panel. */
  description?: string;
  order: number;
  layout: MapLayout;
  groupsLayout: GroupsLayout;
  /** Folded groups on this page, per surface. Not part of undo history. */
  collapsed: SurfaceCollapsed;
}

/** Default theme color for a root note card (same gradient as a group). */
export const NOTE_ROOT_COLOR = 'syn3.slate';

/**
 * Free-text note card. Exactly one home: page (root), markerId (inside a group),
 * or parentNote (inside another note).
 */
export interface NoteDef {
  /** Root card on a page. */
  page?: string;
  /** Inside a group. */
  markerId?: string;
  /** Inside another note. */
  parentNote?: string;
  text: string;
  order: number;
  /** Theme color id (`syn3.slate`, …) or `#rrggbb`. Absent → inherit from parent/group. */
  color?: string;
  /** Optional badge emoji (up to {@link MAX_BADGE_ICONS}) shown right of the type icon. */
  icons?: string[];
  /** When true, map edits to this note are blocked. Absent means open. */
  locked?: true;
}

/** Sibling in a shared order list of groups and notes. */
export type SiblingRef = { kind: 'marker'; id: string } | { kind: 'note'; id: string };

/** Where a note lives — exactly one field. */
export type NoteHome =
  | { page: string; markerId?: undefined; parentNote?: undefined }
  | { markerId: string; page?: undefined; parentNote?: undefined }
  | { parentNote: string; page?: undefined; markerId?: undefined };

/** Default labels for a new links-page branch. */
export const LINK_LAYOUT_LABEL = 'Ваш макет';
export const LINK_COMPONENT_LABEL = 'Ваш компонент';

/**
 * Link-map node: root = layout (color), children = components.
 * Lives only on pages with kind `links`.
 */
export interface LinkDef {
  label: string;
  /** Optional description shown only in the settings panel. */
  description?: string;
  /** http(s) URL opened on single click. */
  url?: string;
  /** Parent link id; omitted for top-level layouts. */
  parent?: string;
  /** Page id for top-level layouts only. */
  page?: string;
  /** Theme color id or `#rrggbb`. Only meaningful on roots. */
  color?: string;
  order: number;
  /** When true, map edits to this node are blocked. Absent means open. */
  locked?: true;
}

export function defaultPage(name = 'Карта'): PageDef {
  return {
    name,
    kind: 'files',
    order: 1,
    layout: 'chips',
    groupsLayout: 'flow',
    collapsed: emptyCollapsed(),
  };
}

export type NestResult = { ok: true } | { ok: false; reason: string };

export interface ClassDef {
  relPath: string;
  name: string;
  /** 1-based line hint; may become stale. */
  line?: number;
  /** Display alias shown above the class name. */
  alias?: string;
}

interface MarkersFile {
  version: 1;
  pages: Record<string, PageDef>;
  markers: Record<string, MarkerDef>;
  items: Record<string, string[]>;
  /** relPath → markerId → epoch ms when the item was added to that marker. */
  added: Record<string, Record<string, number>>;
  /** relPath → display alias shown above the real name. */
  aliases: Record<string, string>;
  classes: Record<string, ClassDef>;
  /** classId → markerIds */
  classItems: Record<string, string[]>;
  /** classId → markerId → epoch ms */
  classAdded: Record<string, Record<string, number>>;
  notes: Record<string, NoteDef>;
  /** Link-map nodes (layouts / components) keyed by id. */
  links: Record<string, LinkDef>;
  /**
   * Legacy seed only: read from syn3.json once when styles.json is missing.
   * Never written back into syn3.json.
   */
  appearance: Appearance;
  /** Active page and open flags per map surface. */
  surfaces: SurfacesState;
}

/** Open/closed state of movable map panels, stored per style profile. */
export interface PanelOpenState {
  bottom: boolean;
  left: boolean;
  right: boolean;
}

/** Default for «Общий»: only the right sidebar. */
export function emptyPanelOpen(): PanelOpenState {
  return { bottom: false, left: false, right: true };
}

/** Per-profile appearance and panel layout. */
export interface ProfileStyle {
  appearance: Appearance;
  open: PanelOpenState;
}

interface ProfilesFile {
  version: 1;
  profiles: StyleProfile[];
}

interface StylesFile {
  version: 1;
  styles: Record<string, ProfileStyle>;
}

function emptyProfiles(): ProfilesFile {
  return {
    version: 1,
    profiles: [{ id: GENERAL_PROFILE_ID, name: GENERAL_PROFILE_NAME, sProfileIds: [] }],
  };
}

function normalizeGitNick(raw: unknown): string | undefined {
  if (typeof raw !== 'string') {
    return undefined;
  }
  const nick = raw.trim().replace(/^@+/, '');
  return nick || undefined;
}

function normalizeSProfileIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== 'string' || !item.trim()) {
      continue;
    }
    const id = item.trim();
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    out.push(id);
  }
  return out;
}

function emptyStyles(
  seed: Appearance = DEFAULT_APPEARANCE,
  open: PanelOpenState = emptyPanelOpen(),
): StylesFile {
  return {
    version: 1,
    styles: {
      [GENERAL_PROFILE_ID]: {
        appearance: normalizeAppearance(seed),
        open: { ...open },
      },
    },
  };
}

function cloneProfileStyle(style: ProfileStyle): ProfileStyle {
  return {
    appearance: normalizeAppearance({ ...style.appearance }),
    open: { ...style.open },
  };
}

/** Page-local undo snapshot: groups, items, notes and view — not folds or appearance. */
interface PageSnapshot {
  version: 1;
  page: {
    name: string;
    kind: PageKind;
    description?: string;
    order: number;
    layout: MapLayout;
    groupsLayout: GroupsLayout;
  };
  /** Full page order map so undo after reorderPages restores every slide. */
  pageOrders?: Record<string, number>;
  markers: Record<string, MarkerDef>;
  items: Record<string, string[]>;
  added: Record<string, Record<string, number>>;
  aliases: Record<string, string>;
  classes: Record<string, ClassDef>;
  classItems: Record<string, string[]>;
  classAdded: Record<string, Record<string, number>>;
  notes: Record<string, NoteDef>;
  links: Record<string, LinkDef>;
}

function emptyData(): MarkersFile {
  return {
    version: 1,
    pages: {},
    markers: {},
    items: {},
    added: {},
    aliases: {},
    classes: {},
    classItems: {},
    classAdded: {},
    notes: {},
    links: {},
    appearance: { ...DEFAULT_APPEARANCE },
    surfaces: emptySurfaces(),
  };
}

/** Group names always start with a capital letter. */
export function capitalize(label: string): string {
  const trimmed = label.trim();
  return trimmed.charAt(0).toLocaleUpperCase() + trimmed.slice(1);
}

function isFileNotFound(error: unknown): boolean {
  return error instanceof vscode.FileSystemError && error.code === 'FileNotFound';
}

export interface EntityChainNode {
  kind: EntityLinkKind;
  id: string;
  locked: boolean;
}

/** One Debug tab section: Discord send-slice on the left, local on the right. */
export interface DebugSendDiffSection {
  id: string;
  title: string;
  /** i18n key or raw message when the left column could not be filled. */
  reason?: string;
  left: Record<string, unknown>;
  right: Record<string, unknown>;
}

export interface DebugSendDiffResult {
  sections: DebugSendDiffSection[];
}

const PAGE_SEND_SLICE_KEYS = [
  'markers',
  'items',
  'added',
  'aliases',
  'classes',
  'classItems',
  'classAdded',
  'notes',
  'links',
] as const;

/** Top-level keys that differ; nested values are copied whole. */
function topLevelChanged(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): { left: Record<string, unknown>; right: Record<string, unknown> } | undefined {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  const outLeft: Record<string, unknown> = {};
  const outRight: Record<string, unknown> = {};
  let any = false;
  for (const key of keys) {
    const hasLeft = Object.prototype.hasOwnProperty.call(left, key);
    const hasRight = Object.prototype.hasOwnProperty.call(right, key);
    const leftValue = hasLeft ? left[key] : undefined;
    const rightValue = hasRight ? right[key] : undefined;
    if (JSON.stringify(leftValue) === JSON.stringify(rightValue)) {
      continue;
    }
    any = true;
    if (hasLeft) {
      outLeft[key] = leftValue;
    }
    if (hasRight) {
      outRight[key] = rightValue;
    }
  }
  return any ? { left: outLeft, right: outRight } : undefined;
}

function pageSendSliceFromFile(file: PageContentFile): Record<string, unknown> {
  const slice: Record<string, unknown> = {};
  for (const key of PAGE_SEND_SLICE_KEYS) {
    if (file[key] !== undefined) {
      slice[key] = file[key];
    }
  }
  return slice;
}

/** Keep a lit Send slice on the debug page even when Discord already matches it. */
function pushDebugSlice(
  sections: DebugSendDiffSection[],
  id: string,
  title: string,
  left: Record<string, unknown> | undefined,
  right: Record<string, unknown>,
  reason?: string,
): void {
  if (left === undefined) {
    if (Object.keys(right).length > 0 || reason) {
      sections.push({ id, title, reason, left: {}, right });
    }
    return;
  }
  const diff = topLevelChanged(left, right);
  if (diff) {
    sections.push({ id, title, left: diff.left, right: diff.right });
    return;
  }
  sections.push({ id, title, reason: 'debugDiffSame', left: {}, right: {} });
}

export class MarkerStore implements vscode.Disposable {
  private data: MarkersFile = emptyData();
  private profilesData: ProfilesFile = emptyProfiles();
  private stylesData: StylesFile = emptyStyles();
  /** Active profile for this machine — derived from `sProfileIds`, not persisted. */
  private activeId = GENERAL_PROFILE_ID;
  private watchers: vscode.FileSystemWatcher[] = [];
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  /** When migration fails, read this path for the current session instead of CONFIG_PATH. */
  private sessionConfigPath = CONFIG_PATH;
  /** Canonical markers JSON at the history cursor. */
  private present = '';
  /**
   * On-disk text when it differs from `present` but describes the same map
   * (older key order). Cleared on the next write.
   */
  private baseline?: string;
  /** Canonical page snapshots at the history cursor. */
  private pagePresent: Record<string, string> = {};
  private history: PageHistoryBook = emptyHistory();
  /** False until the history file has been read, so startup cannot record a step. */
  private historyReady = false;
  /** Disk writes are refused after the user removes `.syn3`. */
  private suspended = false;
  /** Create the config once, and only for an explicit Syn3: start. */
  private allowCreate = false;
  private externalTimer: ReturnType<typeof setTimeout> | undefined;
  private pendingDisk: { catalog: boolean; profiles: boolean; styles: boolean } = {
    catalog: false,
    profiles: false,
    styles: false,
  };
  private readonly stopEmitter = new vscode.EventEmitter<void>();
  /** Fired when `.syn3` disappears and the workspace is no longer opted in. */
  readonly onDidStop = this.stopEmitter.event;
  /** Bumps when a move rewrites entity links. Webviews show «Рефакторинг» once per bump. */
  private refactorEpoch = 0;
  /** True when the loaded file had no `surfaces` block — workspace state may hydrate it once. */
  private surfacesNeedLegacyHydration = false;
  private queue: Promise<void> = Promise.resolve();
  /** Skip self-triggered profile/style reloads after our own writes. */
  private writingProfiles = false;
  private writingStyles = false;
  private writingPosLocal = false;
  private writingPosRemote = false;
  private writingCatalog = false;
  private posLocal: PositionsFile = emptyPositions();
  private posRemote: PositionsFile = emptyPositions();
  /** False until pos_local / pos_remote have been read and applied. */
  private positionsReady = false;
  /** True while `setSurfacePage` is inside `commitNow`, so listeners can skip rebuilding page bodies. */
  private surfaceOnlyChange = false;
  /** Workspace uses base.json + pages/*.json instead of syn3.json. */
  private usingSplitConfig = false;
  private base: BaseConfigFile = emptyBaseConfig();
  private pageCloud: Record<string, CloudStamp> = {};
  private dirtyPages = new Set<string>();
  private profileDirty = false;
  private projectDirty = false;
  private pageCloudNewer: Record<string, boolean> = {};
  private baseCloudNewer = false;
  /** Last project lock value included in a successful base push. */
  private lockSent: ProjectLock | undefined | 'unset' = 'unset';
  /** Remote pages found in Discord that are not local yet. Applied on pull. */
  private pendingRemote: Record<string, { file: PageContentFile; stamp: CloudStamp }> = {};
  /** Projects removed locally. Kept out of pull/push until a base push publishes the deletion. */
  private omittedProjectIds = new Set<string>();
  /** Shared Discord channel scan; concurrent callers await the same run. */
  private cloudHintFlight: Promise<string[]> | undefined;
  private accessStore?: AccessStore;
  private secrets?: vscode.SecretStorage;

  readonly onDidChange = this.changeEmitter.event;
  lastError?: string;

  constructor(readonly root: vscode.Uri) {}

  /** Wire Discord secrets and review access for config sync. */
  bindCloud(access: AccessStore, secrets: vscode.SecretStorage): void {
    this.accessStore = access;
    this.secrets = secrets;
  }

  /** Opens the base config in the editor (`syn3.openConfig`). */
  get configUri(): vscode.Uri {
    return this.baseUri;
  }

  get historyUri(): vscode.Uri {
    return vscode.Uri.joinPath(this.root, HISTORY_PATH);
  }

  get profilesUri(): vscode.Uri {
    return vscode.Uri.joinPath(this.root, PROFILES_PATH);
  }

  get stylesUri(): vscode.Uri {
    return vscode.Uri.joinPath(this.root, STYLES_PATH);
  }

  get posLocalUri(): vscode.Uri {
    return vscode.Uri.joinPath(this.root, POS_LOCAL_PATH);
  }

  get posRemoteUri(): vscode.Uri {
    return vscode.Uri.joinPath(this.root, POS_REMOTE_PATH);
  }

  get baseUri(): vscode.Uri {
    return vscode.Uri.joinPath(this.root, BASE_PATH);
  }

  /** @deprecated Use {@link baseUri}. */
  get catalogUri(): vscode.Uri {
    return this.baseUri;
  }

  get pagesDirUri(): vscode.Uri {
    return vscode.Uri.joinPath(this.root, PAGES_DIR);
  }

  pageUri(pageId: string): vscode.Uri {
    return vscode.Uri.joinPath(this.root, pageFilePath(pageId));
  }

  /** Newer BASE message exists, but Accept only cares about this profile's slice. */
  private relevantBaseCloudNewer = false;

  private get profileCloudNewer(): boolean {
    return this.relevantBaseCloudNewer;
  }

  private set profileCloudNewer(value: boolean) {
    this.relevantBaseCloudNewer = value;
  }

  /** Root BASE profile for the active editor profile. */
  private ensureRootProfile(): BaseConfigFile['profiles'][string] {
    const id = this.ensureActiveProfileId();
    const existing = this.base.profiles[id];
    if (existing) {
      return existing;
    }
    const local = this.profilesData.profiles.find((p) => p.id === id);
    const entry = packBaseProfileEntry({
      profile: local ?? { id, name: id, sProfileIds: [] },
      activeProjectId: Object.keys(this.base.projects)[0],
      version: 1,
    });
    this.base.profiles[id] = entry;
    return entry;
  }

  private setProfileActiveProject(projectId: string | undefined, bumpVersion = true): void {
    const root = this.ensureRootProfile();
    if (projectId) {
      root.activeProjectId = projectId;
    } else {
      delete root.activeProjectId;
    }
    if (bumpVersion) {
      root.version = (root.version || 1) + 1;
      this.profileDirty = true;
    }
  }

  activeProjectId(): string | undefined {
    const id = this.base.profiles[this.ensureActiveProfileId()]?.activeProjectId;
    return id && this.base.projects[id] ? id : undefined;
  }

  private activeProject(): ProjectEntry | undefined {
    const id = this.activeProjectId();
    return id ? this.base.projects[id] : undefined;
  }

  /** Active project, or the first saved one. Never invents a named placeholder. */
  private ensureActiveProject(): ProjectEntry | undefined {
    let id = this.activeProjectId();
    if (!id) {
      id = Object.keys(this.base.projects)[0];
      if (id) {
        this.setProfileActiveProject(id, false);
      }
    }
    return id ? this.base.projects[id] : undefined;
  }

  projectRepo(): ProjectRepo | undefined {
    return packProjectRepo(this.activeProject()?.repo);
  }

  /** Name and repository of one project. */
  projectRecord(id: string): { name: string; repo?: ProjectRepo } | undefined {
    const project = this.base.projects[id];
    if (!project) {
      return undefined;
    }
    return { name: project.name, repo: packProjectRepo(project.repo) };
  }

  /** Rename a project. The stored repository URL is left unchanged. */
  async updateProjectDetails(id: string, name: string): Promise<boolean> {
    return this.enqueueResult(async () => {
      const project = this.base.projects[id];
      const trimmed = name.trim();
      if (!project || !trimmed) {
        return false;
      }
      if (project.name === trimmed) {
        return true;
      }
      project.name = trimmed;
      project.version = (project.version || 1) + 1;
      this.projectDirty = true;
      await this.persistBaseOnly();
      this.changeEmitter.fire();
      return true;
    });
  }

  /**
   * Drop a project from the local base and delete page files no other project uses.
   * The id stays omitted until the next successful base push, so a pull cannot restore it.
   */
  async deleteProject(id: string): Promise<boolean> {
    return this.enqueueResult(async () => {
      const project = this.base.projects[id];
      if (!project) {
        return false;
      }
      const wasActive = this.activeProjectId() === id;
      const pageIds = new Set(Object.keys(project.pages));
      if (wasActive) {
        for (const pageId of Object.keys(this.data.pages)) {
          pageIds.add(pageId);
        }
      }
      delete this.base.projects[id];
      this.omittedProjectIds.add(id);
      this.syncOmittedProjectsToLocal();
      let profileChanged = false;
      for (const profile of Object.values(this.base.profiles)) {
        if (!profile.activeProjectId || this.base.projects[profile.activeProjectId]) {
          continue;
        }
        const next = Object.keys(this.base.projects)[0];
        if (next) {
          profile.activeProjectId = next;
        } else {
          delete profile.activeProjectId;
        }
        profile.version = (profile.version || 1) + 1;
        profileChanged = true;
      }
      this.projectDirty = true;
      if (profileChanged) {
        this.profileDirty = true;
      }
      await this.persistBaseOnly();
      const keep = new Set<string>();
      for (const entry of Object.values(this.base.projects)) {
        for (const pageId of Object.keys(entry.pages)) {
          keep.add(pageId);
        }
      }
      let historyChanged = false;
      for (const pageId of pageIds) {
        if (keep.has(pageId)) {
          continue;
        }
        try {
          await vscode.workspace.fs.delete(this.pageUri(pageId));
        } catch (error) {
          if (!isFileNotFound(error)) {
            console.error('Syn3 delete project page:', pageId, error);
          }
        }
        await this.accessStore?.deletePage(pageId);
        this.dirtyPages.delete(pageId);
        delete this.pageCloud[pageId];
        delete this.pageCloudNewer[pageId];
        delete this.pendingRemote[pageId];
        delete this.pagePresent[pageId];
        if (this.history.pages[pageId]) {
          dropPageHistory(this.history, pageId);
          historyChanged = true;
        }
      }
      if (historyChanged && this.historyReady) {
        await this.persistHistory();
      }
      await this.persistPosLocal();
      if (wasActive) {
        const replacement = this.activeProjectId();
        await this.reloadSplitFromDisk(false, replacement);
        this.retargetSurfacesToActivePages();
      }
      this.changeEmitter.fire();
      return true;
    });
  }

  /** Keep the local delete-queue in pos_local so a later pull still drops these projects. */
  private syncOmittedProjectsToLocal(): void {
    const ids = [...this.omittedProjectIds].sort();
    if (ids.length === 0) {
      delete this.posLocal.omittedProjects;
    } else {
      this.posLocal.omittedProjects = ids;
    }
  }

  /** Remove projects the user deleted here, and retarget profiles that still point at them. */
  private dropOmittedProjects(base: BaseConfigFile): boolean {
    let changed = false;
    for (const id of this.omittedProjectIds) {
      if (!base.projects[id]) {
        continue;
      }
      delete base.projects[id];
      changed = true;
    }
    for (const profile of Object.values(base.profiles)) {
      if (!profile.activeProjectId || base.projects[profile.activeProjectId]) {
        continue;
      }
      const next = Object.keys(base.projects)[0];
      if (next) {
        profile.activeProjectId = next;
      } else {
        delete profile.activeProjectId;
      }
      changed = true;
    }
    return changed;
  }

  async setProjectRepo(repo: ProjectRepo | undefined): Promise<void> {
    await this.enqueue(async () => {
      const project = this.ensureActiveProject();
      if (!project) {
        return;
      }
      const next = packProjectRepo(repo);
      const prev = packProjectRepo(project.repo);
      if (JSON.stringify(prev ?? null) === JSON.stringify(next ?? null)) {
        return;
      }
      if (next) {
        project.repo = next;
      } else {
        delete project.repo;
      }
      project.version = (project.version || 1) + 1;
      this.projectDirty = true;
      await this.persistBaseOnly();
      await this.syncReviewAccessFromProject();
      this.changeEmitter.fire();
    });
  }

  private buildBaseFromCurrentPages(channelId = ''): BaseConfigFile {
    const base = emptyBaseConfig();
    base.channelId = channelId.trim();
    return base;
  }

  projectChannels(): ProjectChannels {
    return packProjectChannels(this.activeProject()?.channels ?? {});
  }

  baseChannelId(): string {
    return this.base.channelId.trim();
  }

  async setProjectChannels(partial: Partial<ProjectChannels>): Promise<void> {
    await this.enqueue(async () => {
      const project = this.ensureActiveProject();
      if (!project) {
        return;
      }
      project.channels = mergeProjectChannels(project.channels, partial);
      project.version = (project.version || 1) + 1;
      this.projectDirty = true;
      if (this.usingSplitConfig) {
        await this.persistBaseOnly();
      }
      this.changeEmitter.fire();
    });
  }

  /** True when the active profile may toggle the project lock. */
  canToggleProjectLock(): boolean {
    const lock = this.activeProject()?.lock;
    if (!lock) {
      return true;
    }
    const id = this.ensureActiveProfileId();
    return lock.profileId === id || id === GENERAL_PROFILE_ID;
  }

  projectConfigSync(): ConfigSyncFlags {
    return configSyncFlags({
      dirty:
        !this.pageContentLockedOut() &&
        (this.projectDirty || this.baseNeedsFirstPublish() || this.projectSliceDrift()),
      cloudNewer: this.relevantBaseCloudNewer,
    });
  }

  /**
   * Unsent work of the active project or this profile's active-project pointer.
   */
  hasUnsentChanges(): boolean {
    if (this.profileDirty || this.profileSliceDrift() || this.baseNeedsFirstPublish()) {
      return true;
    }
    if (this.pagesFixed() !== this.pagesFixedSent()) {
      return true;
    }
    for (const [id, page] of this.pages()) {
      if (page.kind === 'review') {
        continue;
      }
      if (this.dirtyPages.has(id)) {
        return true;
      }
    }
    return (this.projectDirty && this.projectBodyDiffersFromSent()) || this.projectSliceDrift();
  }

  /** True when shared project fields differ from the last send. */
  private projectBodyDiffersFromSent(): boolean {
    const clean = this.posLocal.baseClean?.project;
    if (!clean) {
      return true;
    }
    return this.projectSyncFingerprint() !== clean;
  }

  /** Local base exists with a channel but was never successfully posted to Discord. */
  private baseNeedsFirstPublish(): boolean {
    return (
      !this.posLocal.baseClean &&
      !!this.base.channelId.trim() &&
      Object.keys(this.base.projects).length > 0
    );
  }

  /** Next BASE_SYN3 | #N from the latest message in the channel (not from local stamps). */
  private async nextBaseHeaderNumber(token: string, channel: string): Promise<number> {
    const latest = await findLatestConfigMessage(token, channel, 'BASE', undefined);
    if (latest.ok && latest.value) {
      return nextConfigNumber(stampFromLatest(latest.value));
    }
    return 1;
  }

  projects(): { id: string; name: string; active: boolean }[] {
    const active = this.activeProjectId();
    return Object.entries(this.base.projects)
      .map(([id, entry]) => ({
        id,
        name: entry.name,
        active: id === active,
      }))
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  }

  private allocateProjectId(name: string): string {
    const id =
      'project-' +
      (name
        .toLowerCase()
        .replace(/[^a-z0-9а-яё]+/gi, '-')
        .replace(/^-+|-+$/g, '') || 'project');
    let unique = id;
    let counter = 2;
    while (this.base.projects[unique]) {
      unique = `${id}-${counter++}`;
    }
    return unique;
  }

  /**
   * Seed that used to be written before the user published a project.
   * Id and name are fixed; it never has pages.
   */
  private isPlaceholderProject(id: string, entry: ProjectEntry): boolean {
    return (
      id === 'project-default' &&
      entry.name === 'Проект' &&
      Object.keys(entry.pages).length === 0
    );
  }

  /** Drop the unnamed seed. Returns true when a project was removed. */
  private omitPlaceholderProjects(base: BaseConfigFile): boolean {
    let dropped = false;
    for (const [id, entry] of Object.entries(base.projects)) {
      if (!this.isPlaceholderProject(id, entry)) {
        continue;
      }
      delete base.projects[id];
      dropped = true;
    }
    if (dropped) {
      for (const profile of Object.values(base.profiles)) {
        if (profile.activeProjectId && !base.projects[profile.activeProjectId]) {
          const next = Object.keys(base.projects)[0];
          if (next) {
            profile.activeProjectId = next;
          } else {
            delete profile.activeProjectId;
          }
        }
      }
    }
    return dropped;
  }

  /** New project entry with only «Общий» and no pages. */
  private buildAdminOnlyProject(name: string): ProjectEntry {
    const project = emptyProject(name);
    const profile = this.profilesData.profiles.find((p) => p.id === GENERAL_PROFILE_ID);
    const style = this.stylesData.styles[GENERAL_PROFILE_ID];
    if (profile && style) {
      project.profiles[GENERAL_PROFILE_ID] = packProfileEntry({
        profile,
        style,
        version: 1,
      });
    }
    return project;
  }

  async createProject(name: string, channelId?: string): Promise<string | undefined> {
    return this.enqueueResult(async () => {
      const trimmed = name.trim();
      if (!trimmed) {
        return undefined;
      }
      const unique = this.allocateProjectId(trimmed);
      const project = this.buildAdminOnlyProject(trimmed);
      this.omittedProjectIds.delete(unique);
      this.syncOmittedProjectsToLocal();
      // New projects start with zero pages; content is added later via «создать страницу».
      this.base.projects[unique] = project;
      if (channelId !== undefined) {
        this.base.channelId = channelId.trim();
      }
      this.mirrorRootProfilesToBase(false);
      this.setProfileActiveProject(unique, true);
      this.data = emptyData();
      this.pageCloud = {};
      this.dirtyPages.clear();
      this.pageCloudNewer = {};
      this.pendingRemote = {};
      this.projectDirty = true;
      await this.persistSplitConfig();
      await this.persistPosLocal();
      this.present = this.capture();
      this.baseline = undefined;
      this.pagePresent = this.captureAllPageSnapshots();
      this.changeEmitter.fire();
      return unique;
    });
  }

  /**
   * Create a project by publishing hello + base.json first, then committing locally.
   * Local disk is untouched until Discord accepts the config. `canRetry` is true when
   * the setup probe succeeded but posting base.json failed (hello is already in the channel).
   */
  async publishNewProject(
    name: string,
    channelId?: string,
    repo?: ProjectRepo,
  ): Promise<{ ok: true; id: string } | { ok: false; message: string; canRetry: boolean }> {
    return this.enqueueResult(async () => {
      const trimmed = name.trim();
      if (!trimmed) {
        return { ok: false, message: 'Name cannot be empty', canRetry: false };
      }
      const token = await this.discordToken();
      if (!token) {
        return { ok: false, message: 'Discord token is not set', canRetry: false };
      }
      const nextChannel =
        channelId !== undefined ? channelId.trim() : this.base.channelId.trim();
      if (!nextChannel) {
        return { ok: false, message: 'Base Discord channel is not set', canRetry: false };
      }

      const unique = this.allocateProjectId(trimmed);
      const project = this.buildAdminOnlyProject(trimmed);
      const packedRepo = packProjectRepo(repo);
      if (packedRepo) {
        project.repo = packedRepo;
      } else {
        return { ok: false, message: 'Repository is required', canRetry: false };
      }
      // Creating a project binds this IDE to «Общий» before the first BASE post.
      this.moveMachineToProfile(GENERAL_PROFILE_ID);
      this.omitPlaceholderProjects(this.base);
      this.mirrorRootProfilesToBase(false);
      const projects: Record<string, ProjectEntry> = { ...this.base.projects };
      projects[unique] = project;
      const profiles = { ...this.base.profiles };
      const activeProfileId = this.ensureActiveProfileId();
      const root = profiles[activeProfileId] ?? packBaseProfileEntry({
        profile: this.profilesData.profiles.find((p) => p.id === activeProfileId) ?? {
          id: activeProfileId,
          name: activeProfileId,
          sProfileIds: [],
        },
        version: 1,
      });
      profiles[activeProfileId] = {
        ...root,
        activeProjectId: unique,
        version: (root.version || 1) + 1,
      };
      const staged: BaseConfigFile = {
        ...this.base,
        channelId: nextChannel,
        profiles,
        projects,
      };

      const locale = normalizeLocale(this.appearance.language);
      const probed = await ensureSetupProbe(token, nextChannel, 'profile', locale);
      if (!probed.ok) {
        return { ok: false, message: probed.message, canRetry: false };
      }
      // Hello + attachment back-to-back often hits Discord channel rate limits.
      await new Promise((resolve) => setTimeout(resolve, probed.posted ? 1600 : 400));

      const packed = packBaseConfigBody(staged);
      const number = await this.nextBaseHeaderNumber(token, nextChannel);
      const headerDate = formatConfigHeaderDate();
      const posted = await postConfigMessage({
        token,
        channelId: nextChannel,
        kind: 'BASE',
        number,
        headerDate,
        filename: 'base.json',
        body: stringifyBaseConfigBody(packed),
      });
      if (!posted.ok) {
        return {
          ok: false,
          message: posted.message || 'Failed to post base.json',
          canRetry: true,
        };
      }

      this.base.channelId = nextChannel;
      this.base.projects = staged.projects;
      this.base.profiles = staged.profiles;
      this.base.snapshot = packed.snapshot;
      this.data = emptyData();
      this.pageCloud = {};
      this.dirtyPages.clear();
      this.pageCloudNewer = {};
      this.pendingRemote = {};
      this.projectDirty = false;
      this.profileDirty = false;
      this.baseCloudNewer = false;
      this.relevantBaseCloudNewer = false;
      this.rememberPagesFixedSent();
      this.rememberBaseClean();
      this.omittedProjectIds.delete(unique);
      this.syncOmittedProjectsToLocal();
      await this.persistBaseOnly();
      await this.persistPosLocal();
      this.present = this.capture();
      this.baseline = undefined;
      this.pagePresent = this.captureAllPageSnapshots();
      this.changeEmitter.fire();
      void this.refreshCloudHints();
      return { ok: true, id: unique };
    });
  }

  async selectProject(id: string): Promise<boolean> {
    return this.setActiveProject(id);
  }

  async setActiveProject(id: string): Promise<boolean> {
    return this.enqueueResult(async () => {
      if (!this.base.projects[id]) {
        return false;
      }
      if (this.activeProjectId() === id) {
        return true;
      }
      // Keep the project we are leaving in sync, then write the new id on this profile.
      // A disk reload must not put the previous project back: the file watcher
      // can deliver the write late, and a stale read used to undo the click.
      this.syncProjectPagesFromData();
      this.mirrorRootProfilesToBase(false);
      this.setProfileActiveProject(id, true);
      this.holdCatalogWrite();
      try {
        await this.persistBaseOnly();
        await this.reloadSplitFromDisk(false, id);
        this.retargetSurfacesToActivePages();
      } finally {
        this.releaseCatalogWrite();
      }
      this.present = this.capture();
      this.baseline = undefined;
      this.pagePresent = this.captureAllPageSnapshots();
      this.changeEmitter.fire();
      return true;
    });
  }

  private activeProjectChannels(): ProjectChannels {
    return this.activeProject()?.channels ?? {};
  }

  private pageContentLockedOut(): boolean {
    const lock = this.activeProject()?.lock;
    return !!lock && lock.profileId !== this.ensureActiveProfileId();
  }

  /** Appearance of the active profile. */
  get appearance(): Appearance {
    return this.activeProfileStyle().appearance;
  }

  /** Panel open flags of the active profile. */
  private activeProfileStyle(): ProfileStyle {
    const id = this.activeId;
    return (
      this.stylesData.styles[id] ??
      this.stylesData.styles[GENERAL_PROFILE_ID] ?? {
        appearance: { ...DEFAULT_APPEARANCE },
        open: emptyPanelOpen(),
      }
    );
  }

  /** Profiles in creation order. «Общий» is always first. Machine hashes stay private. */
  profiles(): StyleProfileInfo[] {
    return this.profilesData.profiles.map((p) => ({
      id: p.id,
      name: p.name,
      boundCount: p.sProfileIds.length,
      reviewSkillPath: p.reviewSkillPath ?? '',
      reviewDirPath: p.reviewDirPath ?? '',
      reviewModel: p.reviewModel ?? '',
      reviewFixModel: p.reviewFixModel ?? '',
    }));
  }

  /** Review skill / dir / models of the active profile. */
  activeReviewPaths(): { skillPath: string; dirPath: string; model: string; fixModel: string } {
    const profile =
      this.profilesData.profiles.find((p) => p.id === this.activeId) ??
      this.profilesData.profiles.find((p) => p.id === GENERAL_PROFILE_ID);
    return {
      skillPath: (profile?.reviewSkillPath ?? '').trim(),
      dirPath: (profile?.reviewDirPath ?? '').trim(),
      model: (profile?.reviewModel ?? '').trim().toLowerCase(),
      fixModel: (profile?.reviewFixModel ?? '').trim().toLowerCase(),
    };
  }

  async setActiveReviewPaths(partial: {
    reviewSkillPath?: string;
    reviewDirPath?: string;
    reviewModel?: string;
    reviewFixModel?: string;
  }): Promise<void> {
    await this.enqueue(async () => {
      const id = this.ensureActiveProfileId();
      const profile = this.profilesData.profiles.find((p) => p.id === id);
      if (!profile) {
        return;
      }
      if (partial.reviewSkillPath !== undefined) {
        profile.reviewSkillPath = partial.reviewSkillPath.trim();
      }
      if (partial.reviewDirPath !== undefined) {
        profile.reviewDirPath = partial.reviewDirPath.trim();
      }
      if (partial.reviewModel !== undefined) {
        profile.reviewModel = partial.reviewModel.trim().toLowerCase();
      }
      if (partial.reviewFixModel !== undefined) {
        profile.reviewFixModel = partial.reviewFixModel.trim().toLowerCase();
      }
      // profiles.json is a cache. The map reads these fields back from the
      // active project's profiling in base.json after any catalog reload.
      await this.persistProfiles();
      await this.persistBaseOnly();
      this.changeEmitter.fire();
    });
  }

  /** Opaque repositoryTokenKey for one profile in the active project. */
  repositoryTokenKey(profileId: string): string | undefined {
    const key = this.activeProject()?.profiles[profileId]?.repositoryTokenKey?.trim();
    return key || this.profilesData.profiles.find((p) => p.id === profileId)?.repositoryTokenKey;
  }

  async setRepositoryTokenKey(profileId: string, tokenKey: string | undefined): Promise<void> {
    await this.enqueue(async () => {
      const profile = this.profilesData.profiles.find((p) => p.id === profileId);
      if (profile) {
        if (tokenKey?.trim()) {
          profile.repositoryTokenKey = tokenKey.trim();
        } else {
          delete profile.repositoryTokenKey;
        }
      }
      const project = this.ensureActiveProject();
      if (project) {
        const entry = project.profiles[profileId] ?? {
          version: 1,
          appearance: { ...DEFAULT_APPEARANCE },
          open: emptyPanelOpen(),
        };
        if (tokenKey?.trim()) {
          entry.repositoryTokenKey = tokenKey.trim();
        } else {
          delete entry.repositoryTokenKey;
        }
        project.profiles[profileId] = entry;
        this.projectDirty = true;
      }
      this.profileDirty = true;
      await this.persistProfiles(false);
      await this.persistBaseOnly();
      this.changeEmitter.fire();
    });
  }

  /** True when this IDE hash is already listed on a profile. */
  machineIsBound(): boolean {
    const hash = hashMachineId();
    return this.profilesData.profiles.some((p) => p.sProfileIds.includes(hash));
  }

  /** GitHub / GitLab logins of one profile. Tokens stay in SecretStorage. */
  gitNicks(id: string): { githubNick: string; gitlabNick: string } {
    const profile = this.profilesData.profiles.find((p) => p.id === id);
    return {
      githubNick: profile?.githubNick ?? '',
      gitlabNick: profile?.gitlabNick ?? '',
    };
  }

  /** GitHub / GitLab logins of the active profile. Tokens stay in SecretStorage. */
  activeGitNicks(): { githubNick: string; gitlabNick: string } {
    return this.gitNicks(this.activeId || GENERAL_PROFILE_ID);
  }

  async setProfileGitNicks(
    id: string,
    nicks: { githubNick?: string; gitlabNick?: string },
  ): Promise<void> {
    const profile = this.profilesData.profiles.find((p) => p.id === id);
    if (!profile) {
      return;
    }
    let changed = false;
    const apply = (key: 'githubNick' | 'gitlabNick', value: string | undefined) => {
      if (value === undefined) {
        return;
      }
      const trimmed = value.trim().replace(/^@+/, '');
      const current = profile[key] ?? '';
      if (current === trimmed) {
        return;
      }
      if (trimmed) {
        profile[key] = trimmed;
      } else {
        delete profile[key];
      }
      changed = true;
    };
    apply('githubNick', nicks.githubNick);
    apply('gitlabNick', nicks.gitlabNick);
    if (!changed) {
      return;
    }
    await this.persistProfiles();
    this.changeEmitter.fire();
  }

  async setActiveGitNick(provider: 'github' | 'gitlab', nick: string): Promise<void> {
    const id = this.ensureActiveProfileId();
    await this.setProfileGitNicks(
      id,
      provider === 'github' ? { githubNick: nick } : { gitlabNick: nick },
    );
  }

  get activeProfileId(): string {
    return this.activeId;
  }

  get activeProfileName(): string {
    return (
      this.profilesData.profiles.find((p) => p.id === this.activeId)?.name ?? GENERAL_PROFILE_NAME
    );
  }

  /** Working card of the active profile (local-only, not undoable). */
  get workingFocus(): WorkingFocus | undefined {
    return this.posLocal.focus?.[this.activeId];
  }

  /**
   * Mark a group or note as the working card for the active profile.
   * Persists to pos_local only; does not enter undo history.
   */
  async setWorkingFocus(kind: 'marker' | 'note', id: string): Promise<void> {
    await this.enqueue(async () => {
      if (kind === 'marker' && !this.data.markers[id]) {
        return;
      }
      if (kind === 'note' && !this.data.notes[id]) {
        return;
      }
      const profileId = this.ensureActiveProfileId();
      const current = this.posLocal.focus?.[profileId];
      if (current?.kind === kind && current.id === id) {
        return;
      }
      if (!this.posLocal.focus) {
        this.posLocal.focus = {};
      }
      this.posLocal.focus[profileId] = { kind, id };
      await this.persistPosLocal();
      this.changeEmitter.fire();
    });
  }

  /** True after markers and history have been read. Page ids are meaningful only then. */
  get ready(): boolean {
    return this.historyReady;
  }

  /** Increments each time a move rewrites at least one entity link. */
  get refactoringEpoch(): number {
    return this.refactorEpoch;
  }

  canUndo(pageId: string): boolean {
    return (this.history.pages[pageId]?.past.length ?? 0) > 0;
  }

  canRedo(pageId: string): boolean {
    return (this.history.pages[pageId]?.future.length ?? 0) > 0;
  }

  canAccept(pageId: string): boolean {
    const stacks = this.history.pages[pageId];
    return !!stacks && stacks.past.length + stacks.future.length > 0;
  }

  /** Undo/redo counts keyed by page id. */
  historySteps(): Record<string, { back: number; forward: number }> {
    const result: Record<string, { back: number; forward: number }> = {};
    for (const [pageId] of this.pages()) {
      const stacks = this.history.pages[pageId] ?? emptyStacks();
      result[pageId] = { back: stacks.past.length, forward: stacks.future.length };
    }
    return result;
  }

  /**
   * @param create write a new `.syn3` when it is missing. Only the start command passes true.
   */
  async init(options?: { create?: boolean }): Promise<void> {
    this.suspended = false;
    this.allowCreate = options?.create === true;
    if (this.allowCreate || (await fileExists(this.baseUri))) {
      await this.migrateHistory();
    }
    if (this.suspended) {
      return;
    }
    this.usingSplitConfig = true;
    await this.load();
    if (this.suspended) {
      return;
    }
    await this.loadProfilesAndStyles();
    if (this.suspended) {
      return;
    }
    await this.loadPositions();
    if (this.suspended) {
      return;
    }
    this.dirtyPages.clear();
    this.profileDirty = false;
    this.projectDirty = false;
    await this.loadHistory();
    if (this.suspended) {
      return;
    }
    await this.reconcilePageDirty();
    await this.reconcileBaseDirty();
    if (this.suspended) {
      return;
    }
    this.allowCreate = false;
    this.historyReady = true;
    this.watch();
    this.changeEmitter.fire();
    void this.refreshCloudHints();
  }

  /** Profile Discord sync flags (replaces pos_local ↔ pos_remote arrows). */
  positionSync(): PositionSyncState {
    const flags = this.profileConfigSync();
    return { canPush: flags.canPush, canPull: flags.canPull };
  }

  profileConfigSync(): ConfigSyncFlags {
    return configSyncFlags({
      dirty: !this.pageContentLockedOut() && (this.profileDirty || this.profileSliceDrift()),
      cloudNewer: this.relevantBaseCloudNewer,
    });
  }

  /** Combined base dirty (project settings or profile) for legacy callers. */
  baseConfigSync(): ConfigSyncFlags {
    return configSyncFlags({
      dirty:
        !this.pageContentLockedOut() &&
        (this.profileDirty ||
          this.profileSliceDrift() ||
          this.projectDirty ||
          this.projectSliceDrift() ||
          this.baseNeedsFirstPublish()),
      cloudNewer: this.relevantBaseCloudNewer,
    });
  }

  configSync(pageId: string): ConfigSyncFlags {
    const lockedOut = this.pageContentLockedOut();
    const page = this.data.pages[pageId];
    // Review pages have no content config push; MR messages are polled separately.
    if (page?.kind === 'review') {
      return configSyncFlags({
        dirty: false,
        cloudNewer: false,
      });
    }
    return configSyncFlags({
      dirty: !lockedOut && this.dirtyPages.has(pageId),
      cloudNewer: !!this.pageCloudNewer[pageId],
    });
  }

  /** All page sync flags for the pager. */
  allPageConfigSync(): Record<string, ConfigSyncFlags> {
    const result: Record<string, ConfigSyncFlags> = {};
    for (const [pageId] of this.pages()) {
      result[pageId] = this.configSync(pageId);
    }
    return result;
  }

  /**
   * Debug tab: Discord last configs vs the local slices that light Send.
   * Empty only when Send is off. A lit slice is always a section: changed
   * fields, or a note when Discord already has the same body.
   */
  async debugSendDiff(): Promise<DebugSendDiffResult> {
    const sections: DebugSendDiffSection[] = [];
    const needBase = this.projectConfigSync().canPush || this.profileConfigSync().canPush;
    const dirtyPageIds = this.pages()
      .filter(([id, page]) => page.kind !== 'review' && this.configSync(id).canPush)
      .map(([id]) => id);
    if (!needBase && dirtyPageIds.length === 0) {
      return { sections };
    }

    const token = await this.discordToken();

    if (needBase) {
      const right: Record<string, unknown> = {};
      if (this.projectConfigSync().canPush) {
        right.project = this.debugProjectSlice(this.base);
      }
      if (this.profileConfigSync().canPush) {
        right.profile = this.profileSyncSlice();
      }
      let left: Record<string, unknown> | undefined;
      let reason: string | undefined;
      if (!token) {
        reason = 'debugDiffNoToken';
      } else {
        const channel = this.base.channelId.trim();
        if (!channel) {
          reason = 'debugDiffNoChannel';
        } else {
          const latest = await findLatestConfigMessage(token, channel, 'BASE', undefined);
          if (!latest.ok) {
            reason = latest.message;
          } else if (!latest.value) {
            reason = 'debugDiffNotSent';
          } else {
            const downloaded = await downloadConfigAttachment(token, latest.value.attachmentUrl);
            if (!downloaded.ok) {
              reason = downloaded.message;
            } else {
              try {
                const remote = normalizeBaseConfig(JSON.parse(downloaded.value));
                left = {};
                if (right.project !== undefined) {
                  left.project = this.debugProjectSlice(remote);
                }
                if (right.profile !== undefined) {
                  left.profile = this.profileSyncSliceFromBase(remote);
                }
              } catch (error) {
                reason = error instanceof Error ? error.message : String(error);
              }
            }
          }
        }
      }
      pushDebugSlice(sections, 'base', 'BASE', left, right, reason);
    }

    for (const pageId of dirtyPageIds) {
      const page = this.data.pages[pageId];
      if (!page) {
        continue;
      }
      const kind = pageKindToConfigKind(page.kind);
      if (!kind || kind === 'REVIEW') {
        continue;
      }
      const packed = this.packPageFile(pageId);
      const right = packed ? pageSendSliceFromFile(packed) : {};
      let left: Record<string, unknown> | undefined;
      let reason: string | undefined;
      if (!token) {
        reason = 'debugDiffNoToken';
      } else {
        const channel = this.resolvePageChannel(pageId, kind);
        if (!channel) {
          reason = 'debugDiffNoChannel';
        } else {
          const latest = await findLatestConfigMessage(token, channel, kind, pageId);
          if (!latest.ok) {
            reason = latest.message;
          } else if (!latest.value) {
            reason = 'debugDiffNotSent';
          } else {
            const downloaded = await downloadConfigAttachment(token, latest.value.attachmentUrl);
            if (!downloaded.ok) {
              reason = downloaded.message;
            } else {
              try {
                const remote = normalizePageConfig(JSON.parse(downloaded.value));
                left = pageSendSliceFromFile(remote);
              } catch (error) {
                reason = error instanceof Error ? error.message : String(error);
              }
            }
          }
        }
      }
      pushDebugSlice(sections, pageId, page.name.trim() || pageId, left, right, reason);
    }

    return { sections };
  }

  /** How many Discord pages are waiting to be created by pull. */
  pendingRemoteCount(): number {
    return Object.keys(this.pendingRemote).length;
  }

  /** True when the base channel or any project page channel id is set. */
  hasConfigChannel(): boolean {
    if (this.base.channelId.trim()) {
      return true;
    }
    const channels = this.activeProjectChannels();
    if (
      channels.files?.trim() ||
      channels.notes?.trim() ||
      channels.links?.trim() ||
      channels.review?.trim()
    ) {
      return true;
    }
    return false;
  }

  /** Manual Discord scan from the pager reload button. */
  async checkCloud(): Promise<{ ok: boolean; message?: string }> {
    const errors = await this.refreshCloudHints();
    if (errors.length === 0) {
      return { ok: true };
    }
    return { ok: false, message: errors.join('\n') };
  }

  /** Page tabs show the fixed mark when the active project is locked. */
  pagesFixed(): boolean {
    return !!this.activeProject()?.lock;
  }

  /** Lock value already published via base push. */
  pagesFixedSent(): boolean {
    if (this.lockSent === 'unset') {
      return !this.pagesFixed();
    }
    const lock = this.activeProject()?.lock;
    if (!lock) {
      return this.lockSent === undefined;
    }
    return this.lockSent?.profileId === lock.profileId;
  }

  private pagesFixedDirty(): boolean {
    return this.pagesFixed() !== this.pagesFixedSent();
  }

  private rememberPagesFixedSent(): void {
    const lock = this.activeProject()?.lock;
    this.lockSent = lock ? { profileId: lock.profileId } : undefined;
  }

  async setPagesFixed(fixed: boolean): Promise<{ ok: boolean; message?: string }> {
    return this.enqueueResult(async () => {
      if (this.relevantBaseCloudNewer) {
        return { ok: false, message: 'cloudPullFirst' };
      }
      const project = this.ensureActiveProject();
      if (!project) {
        return { ok: false, message: 'No project' };
      }
      const profileId = this.ensureActiveProfileId();
      const current = project.lock;
      if (fixed) {
        if (current && current.profileId !== profileId && profileId !== GENERAL_PROFILE_ID) {
          return { ok: false, message: 'projectLocked' };
        }
        project.lock = { profileId };
      } else {
        if (
          current &&
          current.profileId !== profileId &&
          profileId !== GENERAL_PROFILE_ID
        ) {
          return { ok: false, message: 'projectLocked' };
        }
        delete project.lock;
      }
      this.projectDirty = true;
      await this.persistBaseOnly();
      this.changeEmitter.fire();
      const pushed = await this.pushProfileConfigNow();
      return pushed;
    });
  }

  /**
   * Auto-fetch: refresh BASE snapshot hints. Lock arrives only with a full accept.
   */
  async fetchBaseLockOnly(): Promise<{ ok: boolean; message?: string }> {
    return this.enqueueResult(async () => {
      const errors = await this.refreshCloudHintsNow();
      if (errors.length > 0) {
        return { ok: false, message: errors[0] };
      }
      return { ok: true };
    });
  }

  pageDraftIds(pageId: string): string[] {
    return this.posLocal.drafts?.[pageId] ?? [];
  }

  catalogChannels(): CatalogChannels {
    const channels = this.activeProjectChannels();
    return {
      profile: this.base.channelId.trim(),
      explorer: channels.files,
      notes: channels.notes,
      links: channels.links,
      review: channels.review,
    };
  }

  /**
   * Point the workspace at a base channel before a pull.
   * A different id clears the local snapshot so the next pull is not skipped.
   */
  async retargetBaseChannel(channelId: string): Promise<void> {
    await this.enqueue(async () => {
      const next = channelId.trim();
      if (!next || this.base.channelId.trim() === next) {
        return;
      }
      this.base.channelId = next;
      this.base.snapshot = '';
      this.baseCloudNewer = true;
      this.relevantBaseCloudNewer = true;
      await this.persistBaseOnly();
      this.changeEmitter.fire();
    });
  }

  async setCatalogChannels(partial: Partial<CatalogChannels>): Promise<void> {
    await this.enqueue(async () => {
      if (partial.profile !== undefined) {
        this.base.channelId = partial.profile.trim();
        this.projectDirty = true;
      }
      const projectPartial: Partial<ProjectChannels> = {};
      if (partial.explorer !== undefined) {
        projectPartial.files = partial.explorer.trim();
      }
      if (partial.notes !== undefined) {
        projectPartial.notes = partial.notes.trim();
      }
      if (partial.links !== undefined) {
        projectPartial.links = partial.links.trim();
      }
      if (partial.review !== undefined) {
        projectPartial.review = partial.review.trim();
      }
      if (Object.keys(projectPartial).length > 0) {
        const project = this.ensureActiveProject();
        if (project) {
          project.channels = mergeProjectChannels(project.channels, projectPartial);
          project.version = (project.version || 1) + 1;
          this.projectDirty = true;
        }
      }
      if (this.usingSplitConfig) {
        await this.persistBaseOnly();
      }
      this.changeEmitter.fire();
    });
  }

  /**
   * Full Syn3 wipe: markers, pages, profiles (except «Общий»), styles, positions,
   * history, catalog channels, access bindings. Tokens cleared separately via SecretStorage.
   */
  async clearAllData(): Promise<void> {
    await this.enqueue(async () => {
      this.data = emptyData();
      this.base = this.buildBaseFromCurrentPages('');
      this.pageCloud = {};
      this.dirtyPages.clear();
      this.pageCloudNewer = {};
      this.pendingRemote = {};
      this.profileDirty = false;
      this.projectDirty = false;
      this.baseCloudNewer = false;
      this.lockSent = 'unset';
      this.profilesData = emptyProfiles();
      this.stylesData = emptyStyles();
      this.bindMachineToProfiles();
      this.mirrorActiveOpenToSurfaces();
      this.history = emptyHistory();
      this.posLocal = emptyPositions();
      this.posRemote = emptyPositions();
      await this.accessStore?.clearAll();
      await this.persistSplitConfig();
      await this.persistProfiles();
      await this.persistStyles();
      await this.persistHistory();
      await this.persistPosLocal();
      await this.persistPosRemote();
      try {
        await vscode.workspace.fs.delete(vscode.Uri.joinPath(this.root, CONFIG_PATH));
      } catch {
        // legacy syn3.json may be absent
      }
      this.present = this.capture();
      this.baseline = undefined;
      this.pagePresent = this.captureAllPageSnapshots();
      this.changeEmitter.fire();
    });
  }

  /** Push PROFILE_SYN3 (replaces local→remote layout backup). */
  async syncPositionsLocalToRemote(): Promise<boolean> {
    const result = await this.pushProfileConfig();
    return result.ok;
  }

  /** Pull PROFILE_SYN3 (replaces remote→local layout restore). */
  async syncPositionsRemoteToLocal(): Promise<boolean> {
    const result = await this.pullProfileConfig();
    return result.ok;
  }

  async pushPageConfig(pageId: string): Promise<{ ok: boolean; message?: string }> {
    return this.enqueueResult(() => this.pushPageConfigNow(pageId));
  }

  /** Push every page whose content changed, plus every page when the lock itself changed. */
  async pushDirtyPageConfigs(): Promise<{ ok: boolean; message?: string; pushed: number }> {
    return this.enqueueResult(() => this.pushDirtyPageConfigsNow());
  }

  /** Pull every page that has a newer cloud config, in tab order. */
  async pullNewerPageConfigs(): Promise<{ ok: boolean; message?: string }> {
    return this.enqueueResult(() => this.pullNewerPageConfigsNow());
  }

  async pullPageConfig(pageId: string): Promise<{ ok: boolean; message?: string }> {
    return this.enqueueResult(() => this.pullPageConfigNow(pageId));
  }

  async pushProfileConfig(): Promise<{ ok: boolean; message?: string }> {
    return this.enqueueResult(() => this.pushProfileConfigNow());
  }

  async pullProfileConfig(): Promise<{ ok: boolean; message?: string; applied?: boolean }> {
    return this.enqueueResult(() => this.pullProfileConfigNow());
  }

  /**
   * Toolbar Send: dirty BASE (project + profile) then dirty page configs.
   * Stops before any Discord write when cloud is newer than a dirty local piece.
   */
  async pushWorkspaceCloud(): Promise<{ ok: boolean; message?: string }> {
    return this.enqueueResult(() => this.pushWorkspaceCloudNow());
  }

  /**
   * Toolbar Accept: newer BASE without bulk page download, then known pages
   * that already showed pageCloudNewer, then pages that exist only in Discord.
   */
  async pullWorkspaceCloud(): Promise<{ ok: boolean; message?: string }> {
    return this.enqueueResult(() => this.pullWorkspaceCloudNow());
  }

  /**
   * Read BASE_SYN3 from `channelId` without pointing the workspace at it first.
   * A different snapshot is written locally, the active project is opened, and
   * page content is pulled from the channels stored in that snapshot.
   */
  async pullBaseFromChannel(
    channelId: string,
  ): Promise<{ ok: boolean; message?: string; applied?: boolean }> {
    const channel = channelId.trim();
    if (!channel) {
      return { ok: false, message: 'Base Discord channel is not set' };
    }
    return this.enqueueResult(() => this.pullProfileConfigNow(channel));
  }

  dispose(): void {
    if (this.externalTimer) {
      clearTimeout(this.externalTimer);
      this.externalTimer = undefined;
    }
    for (const watcher of this.watchers) {
      watcher.dispose();
    }
    this.watchers = [];
    this.stopEmitter.dispose();
    this.changeEmitter.dispose();
  }

  async load(): Promise<void> {
    await this.enqueue(() => this.reloadFromDisk(true));
  }

  /** Restore one page to its previous step. */
  async undo(pageId: string): Promise<void> {
    await this.travel(pageId, -1);
  }

  /** Reapply one page step that was undone. */
  async redo(pageId: string): Promise<void> {
    await this.travel(pageId, 1);
  }

  /** Clear undo/redo for one page; markers stay as they are. */
  async accept(pageId: string): Promise<void> {
    await this.enqueue(async () => {
      if (!this.data.pages[pageId]) {
        return;
      }
      dropPageHistory(this.history, pageId);
      await this.persistHistory();
      this.changeEmitter.fire();
    });
  }

  async setAppearance(partial: Partial<Appearance>): Promise<void> {
    await this.enqueue(async () => {
      const id = this.ensureActiveProfileId();
      const current = this.activeProfileStyle();
      this.stylesData.styles[id] = {
        appearance: normalizeAppearance({ ...current.appearance, ...partial }),
        open: { ...current.open },
      };
      await this.persistStyles();
      this.changeEmitter.fire();
    });
  }

  async setActiveProfile(id: string): Promise<void> {
    await this.enqueue(async () => {
      if (!this.profilesData.profiles.some((p) => p.id === id)) {
        return;
      }
      const hash = hashMachineId();
      const owner = this.profilesData.profiles.find((p) => p.sProfileIds.includes(hash));
      if (owner?.id === id && this.activeId === id) {
        return;
      }
      this.moveMachineToProfile(id);
      this.mirrorActiveOpenToSurfaces();
      const layoutAdded = this.ensureActiveLayoutInLocal();
      if (this.borrowMissingIntoActiveLocal() || layoutAdded) {
        await this.persistPosLocal();
      }
      this.applyCollapsedFromLocal(this.posLocal.profiles[this.activeId] ?? emptyProfileLayout());
      this.pagePresent = this.captureAllPageSnapshots();
      await this.persistProfiles();
      this.changeEmitter.fire();
    });
  }

  /**
   * Create a profile that copies the active profile's styles (appearance + panels)
   * and becomes active. Returns the new id, or undefined when the name is rejected.
   */
  async createProfile(name: string): Promise<string | undefined> {
    return await this.enqueueResult(async () => {
      const trimmed = name.trim();
      if (!this.isValidProfileName(trimmed)) {
        return undefined;
      }
      const id = this.uniqueProfileId(trimmed);
      this.ensureActiveProfileId();
      const source = this.activeProfileStyle();
      const sourceLayout =
        this.posLocal.profiles[this.activeId] ??
        this.extractLayoutFromData() ??
        emptyProfileLayout();
      this.profilesData.profiles.push({ id, name: trimmed, sProfileIds: [] });
      this.stylesData.styles[id] = cloneProfileStyle(source);
      this.posLocal.profiles[id] = cloneProfileLayout(sourceLayout);
      this.moveMachineToProfile(id);
      this.mirrorActiveOpenToSurfaces();
      this.applyCollapsedFromLocal(this.posLocal.profiles[id]);
      this.pagePresent = this.captureAllPageSnapshots();
      await this.persistProfiles();
      await this.persistStyles();
      await this.persistPosLocal();
      this.changeEmitter.fire();
      return id;
    });
  }

  async renameProfile(id: string, name: string): Promise<boolean> {
    return await this.enqueueResult(async () => {
      if (id === GENERAL_PROFILE_ID) {
        return false;
      }
      const profile = this.profilesData.profiles.find((p) => p.id === id);
      const trimmed = name.trim();
      if (!profile || !this.isValidProfileName(trimmed, id)) {
        return false;
      }
      if (profile.name === trimmed) {
        return true;
      }
      profile.name = trimmed;
      await this.persistProfiles();
      this.changeEmitter.fire();
      return true;
    });
  }

  async deleteProfile(id: string): Promise<boolean> {
    return await this.enqueueResult(async () => {
      if (id === GENERAL_PROFILE_ID) {
        return false;
      }
      const index = this.profilesData.profiles.findIndex((p) => p.id === id);
      if (index < 0) {
        return false;
      }
      const wasActive = this.activeId === id;
      this.profilesData.profiles.splice(index, 1);
      delete this.stylesData.styles[id];
      const hadLocal = !!this.posLocal.profiles[id];
      delete this.posLocal.profiles[id];
      let localNeedsWrite = hadLocal;
      if (this.posLocal.focus?.[id]) {
        delete this.posLocal.focus[id];
        if (this.posLocal.focus && Object.keys(this.posLocal.focus).length === 0) {
          delete this.posLocal.focus;
        }
        localNeedsWrite = true;
      }
      if (wasActive) {
        this.moveMachineToProfile(GENERAL_PROFILE_ID);
        this.mirrorActiveOpenToSurfaces();
        if (this.ensureActiveLayoutInLocal() || this.borrowMissingIntoActiveLocal()) {
          localNeedsWrite = true;
        }
        this.applyCollapsedFromLocal(this.posLocal.profiles[this.activeId] ?? emptyProfileLayout());
        this.pagePresent = this.captureAllPageSnapshots();
      }
      await this.persistProfiles();
      await this.persistStyles();
      if (localNeedsWrite) {
        await this.persistPosLocal();
      }
      this.changeEmitter.fire();
      return true;
    });
  }

  /** Empty, reserved general names, and duplicate names (case-insensitive) are rejected. */
  isValidProfileName(name: string, excludeId?: string): boolean {
    const trimmed = name.trim();
    if (!trimmed) {
      return false;
    }
    const lower = trimmed.toLocaleLowerCase();
    if (
      lower === GENERAL_PROFILE_NAME.toLocaleLowerCase() ||
      lower === 'general' ||
      lower === 'админ' ||
      lower === 'admin'
    ) {
      return false;
    }
    return !this.profilesData.profiles.some(
      (p) => p.id !== excludeId && p.name.toLocaleLowerCase() === lower,
    );
  }

  async ensureConfigExists(): Promise<void> {
    try {
      await vscode.workspace.fs.stat(this.configUri);
    } catch (error) {
      if (!isFileNotFound(error)) {
        throw error;
      }
      await this.save();
    }
  }

  // ---- paths ----

  toRelative(uri: vscode.Uri): string | undefined {
    if (uri.scheme !== this.root.scheme || uri.authority !== this.root.authority) {
      return undefined;
    }
    const rel = path.posix.relative(this.root.path, uri.path);
    if (!rel || rel.startsWith('..') || path.posix.isAbsolute(rel)) {
      return undefined;
    }
    return rel;
  }

  toUri(relPath: string): vscode.Uri {
    return vscode.Uri.joinPath(this.root, relPath);
  }

  // ---- queries ----

  /** Pages sorted by order. */
  pages(): Array<[string, PageDef]> {
    return Object.entries(this.data.pages).sort(
      (a, b) => a[1].order - b[1].order || a[0].localeCompare(b[0]),
    );
  }

  page(id: string): PageDef | undefined {
    return this.data.pages[id];
  }

  /** First files page, or the first page if none are files. */
  defaultFilesPageId(): string {
    const files = this.pages().find(([, def]) => def.kind === 'files');
    if (files) {
      return files[0];
    }
    return this.pages()[0]?.[0] ?? DEFAULT_PAGE_ID;
  }

  /** Page id of a marker via its top-level ancestor. */
  pageOf(markerId: string): string | undefined {
    let current: string | undefined = markerId;
    const seen = new Set<string>();
    while (current && this.data.markers[current] && !seen.has(current)) {
      seen.add(current);
      const def: MarkerDef = this.data.markers[current];
      if (!def.parent) {
        return def.page && this.data.pages[def.page] ? def.page : this.defaultFilesPageId();
      }
      current = def.parent;
    }
    return undefined;
  }

  /** Flat list in tree pre-order (parents before children), page by page. */
  markers(): Array<[string, MarkerDef]> {
    const result: Array<[string, MarkerDef]> = [];
    const visit = (parentId: string | undefined, pageId?: string) => {
      for (const [id, def] of this.children(parentId, pageId)) {
        result.push([id, def]);
        visit(id);
      }
    };
    for (const [pageId] of this.pages()) {
      visit(undefined, pageId);
    }
    return result;
  }

  marker(id: string): MarkerDef | undefined {
    return this.data.markers[id];
  }

  /**
   * Siblings that share the same parent, sorted by order.
   * For top-level markers pass `pageId` so roots on other pages are excluded.
   */
  children(parentId?: string | undefined, pageId?: string): Array<[string, MarkerDef]> {
    return Object.entries(this.data.markers)
      .filter(([, def]) => {
        if ((def.parent ?? undefined) !== (parentId ?? undefined)) {
          return false;
        }
        if (parentId === undefined && pageId !== undefined) {
          return (def.page ?? this.defaultFilesPageId()) === pageId;
        }
        return true;
      })
      .sort((a, b) => a[1].order - b[1].order || a[1].label.localeCompare(b[1].label));
  }

  notes(): Array<[string, NoteDef]> {
    return Object.entries(this.data.notes).sort(
      (a, b) => a[1].order - b[1].order || a[0].localeCompare(b[0]),
    );
  }

  /** Direct child notes of a group (not nested under another note). */
  notesOf(markerId: string): Array<[string, NoteDef]> {
    return Object.entries(this.data.notes)
      .filter(([, def]) => def.markerId === markerId && !def.parentNote && !def.page)
      .sort((a, b) => a[1].order - b[1].order || a[0].localeCompare(b[0]));
  }

  /** Direct child notes of a note. */
  noteChildren(parentNoteId: string): Array<[string, NoteDef]> {
    return Object.entries(this.data.notes)
      .filter(([, def]) => def.parentNote === parentNoteId)
      .sort((a, b) => a[1].order - b[1].order || a[0].localeCompare(b[0]));
  }

  /** Root notes on a page. */
  rootNotes(pageId: string): Array<[string, NoteDef]> {
    return Object.entries(this.data.notes)
      .filter(([, def]) => def.page === pageId && !def.markerId && !def.parentNote)
      .sort((a, b) => a[1].order - b[1].order || a[0].localeCompare(b[0]));
  }

  note(id: string): NoteDef | undefined {
    return this.data.notes[id];
  }

  /** Page id of a note via its home (page, group, or ancestor note). */
  pageOfNote(noteId: string): string | undefined {
    let current: string | undefined = noteId;
    const seen = new Set<string>();
    while (current && this.data.notes[current] && !seen.has(current)) {
      seen.add(current);
      const def: NoteDef = this.data.notes[current];
      if (def.page) {
        return def.page;
      }
      if (def.markerId) {
        return this.pageOf(def.markerId);
      }
      current = def.parentNote;
    }
    return undefined;
  }

  /** Current link for a group or note, from the live parent chain. */
  entityLinkOf(kind: EntityLinkKind, id: string): string | undefined {
    if (kind === 'group') {
      const ids = this.markerChain(id);
      const pageId = this.pageOf(id);
      if (!ids || !pageId) {
        return undefined;
      }
      return formatEntityLink(pageId, 'group', ids);
    }
    const notes = this.noteChain(id);
    const pageId = this.pageOfNote(id);
    if (!notes || !pageId) {
      return undefined;
    }
    const root = this.data.notes[notes[0]];
    const groups = root?.markerId ? this.markerChain(root.markerId) ?? [] : [];
    return formatEntityLink(pageId, 'note', [...groups, ...notes]);
  }

  /**
   * Live place of a link. The page and parents stored in the URL are ignored
   * when the card has moved; the type and the last id are the identity.
   */
  resolveEntityLink(raw: string): { pageId: string; chain: EntityChainNode[] } | undefined {
    const parsed = parseEntityLink(raw);
    if (!parsed) {
      return undefined;
    }
    const id = parsed.ids[parsed.ids.length - 1];
    if (parsed.kind === 'group') {
      const ids = this.markerChain(id);
      const pageId = this.pageOf(id);
      if (!ids || !pageId) {
        return undefined;
      }
      return {
        pageId,
        chain: ids.map((markerId) => ({
          kind: 'group' as const,
          id: markerId,
          locked: this.data.markers[markerId]?.locked === true,
        })),
      };
    }
    const notes = this.noteChain(id);
    const pageId = this.pageOfNote(id);
    if (!notes || !pageId) {
      return undefined;
    }
    const root = this.data.notes[notes[0]];
    const groups = root?.markerId ? this.markerChain(root.markerId) ?? [] : [];
    return {
      pageId,
      chain: [
        ...groups.map((markerId) => ({
          kind: 'group' as const,
          id: markerId,
          locked: this.data.markers[markerId]?.locked === true,
        })),
        ...notes.map((noteId) => ({
          kind: 'note' as const,
          id: noteId,
          locked: this.data.notes[noteId]?.locked === true,
        })),
      ],
    };
  }

  /** Drop one entity URL from a note. Code blocks are left untouched. */
  async stripEntityLink(noteId: string, url: string): Promise<void> {
    const note = this.data.notes[noteId];
    if (!note) {
      return;
    }
    const next = stripNoteEntityLink(note.text, url);
    if (next.count === 0 || next.text === note.text) {
      return;
    }
    note.text = next.text;
    await this.commit();
  }

  /** Depth of a note counted only along `parentNote` (0 at page/group root). */
  noteDepthOf(id: string): number {
    let depth = 0;
    let current = this.data.notes[id]?.parentNote;
    const seen = new Set<string>();
    while (current && this.data.notes[current] && !seen.has(current)) {
      seen.add(current);
      depth++;
      current = this.data.notes[current].parentNote;
    }
    return depth;
  }

  /** Height of the note subtree rooted at `id` (0 if no child notes). */
  noteSubtreeHeight(id: string): number {
    const kids = this.noteChildren(id);
    if (kids.length === 0) {
      return 0;
    }
    return 1 + Math.max(...kids.map(([childId]) => this.noteSubtreeHeight(childId)));
  }

  /** All descendant note ids including `noteId` itself when `includeSelf`. */
  descendantNotes(noteId: string, includeSelf = true): string[] {
    const result: string[] = includeSelf ? [noteId] : [];
    const visit = (id: string) => {
      for (const [childId] of this.noteChildren(id)) {
        result.push(childId);
        visit(childId);
      }
    };
    visit(noteId);
    return result;
  }

  /** True when the note itself is locked on the map. */
  isNoteLocked(noteId: string): boolean {
    return this.data.notes[noteId]?.locked === true;
  }

  /**
   * Mixed siblings that share one order space.
   * Pass `pageId` for page root, `markerId` for inside a group, `noteId` for inside a note.
   */
  mixedSiblings(scope: {
    pageId?: string;
    markerId?: string;
    noteId?: string;
  }): SiblingRef[] {
    const items: Array<SiblingRef & { order: number; tie: string }> = [];
    if (scope.noteId) {
      for (const [id, def] of this.noteChildren(scope.noteId)) {
        items.push({ kind: 'note', id, order: def.order, tie: id });
      }
    } else if (scope.markerId) {
      for (const [id, def] of this.children(scope.markerId)) {
        items.push({ kind: 'marker', id, order: def.order, tie: id });
      }
      for (const [id, def] of this.notesOf(scope.markerId)) {
        items.push({ kind: 'note', id, order: def.order, tie: id });
      }
    } else if (scope.pageId) {
      for (const [id, def] of this.children(undefined, scope.pageId)) {
        items.push({ kind: 'marker', id, order: def.order, tie: id });
      }
      for (const [id, def] of this.rootNotes(scope.pageId)) {
        items.push({ kind: 'note', id, order: def.order, tie: id });
      }
    }
    return items
      .sort((a, b) => a.order - b.order || a.tie.localeCompare(b.tie))
      .map(({ kind, id }) => ({ kind, id }) as SiblingRef);
  }

  depthOf(id: string): number {
    let depth = 0;
    let current = this.data.markers[id]?.parent;
    const seen = new Set<string>();
    while (current && this.data.markers[current] && !seen.has(current)) {
      seen.add(current);
      depth++;
      current = this.data.markers[current].parent;
    }
    return depth;
  }

  /** Height of the subtree rooted at `id` (0 if no children). */
  subtreeHeight(id: string): number {
    const kids = this.children(id);
    if (kids.length === 0) {
      return 0;
    }
    return 1 + Math.max(...kids.map(([childId]) => this.subtreeHeight(childId)));
  }

  canNest(id: string, parentId: string): NestResult {
    if (!this.data.markers[id] || !this.data.markers[parentId]) {
      return { ok: false, reason: 'Group not found.' };
    }
    if (id === parentId) {
      return { ok: false, reason: 'A group cannot be nested inside itself.' };
    }
    let ancestor: string | undefined = parentId;
    const seen = new Set<string>();
    while (ancestor) {
      if (ancestor === id) {
        return { ok: false, reason: 'A group cannot be nested inside its own subgroup.' };
      }
      if (seen.has(ancestor)) {
        break;
      }
      seen.add(ancestor);
      ancestor = this.data.markers[ancestor]?.parent;
    }
    const parentDepth = this.depthOf(parentId);
    const height = this.subtreeHeight(id);
    if (parentDepth + 1 + height > MAX_MARKER_DEPTH) {
      return { ok: false, reason: `Maximum nesting depth is ${MAX_MARKER_DEPTH} subgroups.` };
    }
    return { ok: true };
  }

  canNestNote(id: string, parentNoteId: string): NestResult {
    if (!this.data.notes[id] || !this.data.notes[parentNoteId]) {
      return { ok: false, reason: 'Note not found.' };
    }
    if (id === parentNoteId) {
      return { ok: false, reason: 'A note cannot be nested inside itself.' };
    }
    let ancestor: string | undefined = parentNoteId;
    const seen = new Set<string>();
    while (ancestor) {
      if (ancestor === id) {
        return { ok: false, reason: 'A note cannot be nested inside its own child.' };
      }
      if (seen.has(ancestor)) {
        break;
      }
      seen.add(ancestor);
      ancestor = this.data.notes[ancestor]?.parentNote;
    }
    const parentDepth = this.noteDepthOf(parentNoteId);
    const height = this.noteSubtreeHeight(id);
    if (parentDepth + 1 + height > MAX_MARKER_DEPTH) {
      return { ok: false, reason: `Maximum nesting depth is ${MAX_MARKER_DEPTH} notes.` };
    }
    return { ok: true };
  }

  /** Items of a marker in the order they were added; items without a date come first, alphabetically. */
  itemsOf(markerId: string): string[] {
    const addedAt = (relPath: string) => {
      return this.data.added[relPath]?.[markerId] ?? 0;
    };
    return Object.entries(this.data.items)
      .filter(([, ids]) => ids.includes(markerId))
      .map(([relPath]) => relPath)
      .sort((a, b) => {
        return (
          addedAt(a) - addedAt(b) ||
          path.posix.basename(a).localeCompare(path.posix.basename(b)) ||
          a.localeCompare(b)
        );
      });
  }

  markersOf(relPath: string): string[] {
    const ids = this.data.items[relPath] ?? [];
    return ids.slice().sort((a, b) => {
      const da = this.depthOf(a) - this.depthOf(b);
      if (da !== 0) {
        return da;
      }
      return (this.data.markers[a]?.order ?? 0) - (this.data.markers[b]?.order ?? 0);
    });
  }

  hasAnyMarkedUnder(relPath: string): boolean {
    const prefix = relPath + '/';
    return (
      Object.keys(this.data.items).some((p) => p === relPath || p.startsWith(prefix) || relPath.startsWith(p + '/')) ||
      Object.values(this.data.classes).some((c) => c.relPath === relPath || c.relPath.startsWith(prefix))
    );
  }

  aliasOf(relPath: string): string | undefined {
    const alias = this.data.aliases[relPath];
    return alias || undefined;
  }

  classAliasOf(classId: string): string | undefined {
    const alias = this.data.classes[classId]?.alias;
    return alias || undefined;
  }

  markerAliasOf(markerId: string): string | undefined {
    const alias = this.data.markers[markerId]?.alias;
    return alias || undefined;
  }

  /** True when the group itself is locked on the map. */
  isLocked(markerId: string): boolean {
    return this.data.markers[markerId]?.locked === true;
  }

  classDef(id: string): ClassDef | undefined {
    return this.data.classes[id];
  }

  /** Classes of a marker in the order they were added. */
  classesOf(markerId: string): Array<[string, ClassDef]> {
    const addedAt = (classId: string) => this.data.classAdded[classId]?.[markerId] ?? 0;
    return Object.entries(this.data.classItems)
      .filter(([, ids]) => ids.includes(markerId))
      .map(([classId]) => [classId, this.data.classes[classId]] as [string, ClassDef])
      .filter((entry): entry is [string, ClassDef] => !!entry[1])
      .sort((a, b) => {
        return (
          addedAt(a[0]) - addedAt(b[0]) ||
          a[1].name.localeCompare(b[1].name) ||
          a[1].relPath.localeCompare(b[1].relPath)
        );
      });
  }

  /** All descendant marker ids including `markerId` itself when `includeSelf`. */
  descendantMarkers(markerId: string, includeSelf = true): string[] {
    const result: string[] = includeSelf ? [markerId] : [];
    const visit = (id: string) => {
      for (const [childId] of this.children(id)) {
        result.push(childId);
        visit(childId);
      }
    };
    visit(markerId);
    return result;
  }

  // ---- markers ----

  async createMarker(def: Omit<MarkerDef, 'order'>): Promise<string> {
    const id = this.uniqueId(def.label);
    const parent = def.parent && this.data.markers[def.parent] ? def.parent : undefined;
    if (parent !== undefined && this.depthOf(parent) >= MAX_MARKER_DEPTH) {
      throw new Error(`Maximum nesting depth is ${MAX_MARKER_DEPTH} subgroups.`);
    }
    const page =
      parent === undefined
        ? def.page && this.data.pages[def.page]
          ? def.page
          : this.defaultFilesPageId()
        : undefined;
    const mixed = this.mixedSiblings(
      parent !== undefined ? { markerId: parent } : { pageId: page },
    );
    let columns = normalizeColumns(def.columns);
    if (columns === undefined && parent !== undefined) {
      columns = normalizeColumns(this.data.markers[parent].columns);
    }
    // New groups open in one column unless a parent layout is inherited.
    if (columns === undefined) {
      columns = '1';
    }
    const description = normalizeGroupDescription(def.description);
    this.data.markers[id] = {
      ...def,
      label: capitalize(def.label),
      parent,
      page,
      columns,
      order: 1,
    };
    if (description) {
      this.data.markers[id].description = description;
    } else {
      delete this.data.markers[id].description;
    }
    // New groups/notes appear at the start of their sibling list (top of the map for roots).
    this.applySiblingOrder([{ kind: 'marker', id }, ...mixed]);
    await this.commit();
    return id;
  }

  async updateMarker(id: string, patch: Partial<Omit<MarkerDef, 'order'>>): Promise<void> {
    const current = this.data.markers[id];
    if (!current) {
      return;
    }
    const prevParent = current.parent;
    const next: MarkerDef = { ...current, ...patch, label: capitalize(patch.label ?? current.label) };
    if (patch.parent !== undefined) {
      next.parent = patch.parent || undefined;
    }
    if ('color' in patch) {
      if (patch.color) {
        next.color = migrateColorId(normalizeHex(patch.color) ?? patch.color);
      } else {
        delete next.color;
      }
    }
    if ('alias' in patch) {
      const trimmed = typeof patch.alias === 'string' ? patch.alias.trim() : '';
      if (trimmed) {
        next.alias = trimmed;
      } else {
        delete next.alias;
      }
    }
    if ('description' in patch) {
      const description = normalizeGroupDescription(patch.description);
      if (description) {
        next.description = description;
      } else {
        delete next.description;
      }
    }
    if ('locked' in patch) {
      if (patch.locked) {
        next.locked = true;
      } else {
        delete next.locked;
      }
    }
    if ('columns' in patch) {
      next.columns = normalizeColumns(patch.columns);
    }
    if ('icons' in patch) {
      const icons = normalizeIcons(patch.icons);
      if (icons) {
        next.icons = icons;
      } else {
        delete next.icons;
      }
    }
    this.data.markers[id] = next;
    if (patch.parent !== undefined && (next.parent || undefined) !== (prevParent || undefined)) {
      this.relinkMarkerTree(id);
    }
    await this.commit();
  }

  async setMarkerIcons(id: string, icons: string[]): Promise<void> {
    if (!this.data.markers[id]) {
      return;
    }
    await this.updateMarker(id, { icons });
  }

  async setNoteIcons(id: string, icons: string[]): Promise<void> {
    const current = this.data.notes[id];
    if (!current) {
      return;
    }
    const next = normalizeIcons(icons);
    if (next) {
      current.icons = next;
    } else {
      delete current.icons;
    }
    await this.commit();
  }

  async setColumns(id: string, columns: ColumnsMode): Promise<void> {
    if (!this.data.markers[id]) {
      return;
    }
    await this.updateMarker(id, { columns });
  }

  /**
   * Toggle lock on a group and cascade to child groups and direct notes whose
   * lock matched before this click. Mismatched children stay as-is.
   */
  async toggleLock(id: string): Promise<void> {
    if (!this.data.markers[id]) {
      return;
    }
    const applyMarker = (markerId: string) => {
      const def = this.data.markers[markerId];
      if (!def) {
        return;
      }
      const wasLocked = def.locked === true;
      if (wasLocked) {
        delete def.locked;
      } else {
        def.locked = true;
      }
      for (const [childId, child] of this.children(markerId)) {
        if ((child.locked === true) === wasLocked) {
          applyMarker(childId);
        }
      }
      for (const [noteId, note] of this.notesOf(markerId)) {
        if ((note.locked === true) === wasLocked) {
          this.applyNoteLock(noteId, wasLocked);
        }
      }
    };
    applyMarker(id);
    await this.commit();
  }

  /**
   * Toggle lock on a note and cascade to child notes whose lock matched before
   * this click.
   */
  async toggleNoteLock(id: string): Promise<void> {
    if (!this.data.notes[id]) {
      return;
    }
    const wasLocked = this.data.notes[id].locked === true;
    this.applyNoteLock(id, wasLocked);
    await this.commit();
  }

  /** Delete a group; lift subgroups and notes one level up. */
  async deleteMarker(id: string): Promise<void> {
    const def = this.data.markers[id];
    if (!def) {
      return;
    }
    const grandParent = def.parent;
    const page = grandParent === undefined ? this.pageOf(id) : undefined;
    const scope =
      grandParent !== undefined
        ? { markerId: grandParent }
        : page
          ? { pageId: page }
          : undefined;
    const siblings = scope
      ? this.mixedSiblings(scope).filter((s) => !(s.kind === 'marker' && s.id === id))
      : [];
    const liftedMarkers = this.children(id).map(([childId]) => childId);
    const liftedNotes = this.notesOf(id).map(([noteId]) => noteId);
    const lifted: SiblingRef[] = [
      ...liftedMarkers.map((childId) => ({ kind: 'marker' as const, id: childId })),
      ...liftedNotes.map((noteId) => ({ kind: 'note' as const, id: noteId })),
    ];
    for (const childId of liftedMarkers) {
      this.data.markers[childId].parent = grandParent;
      if (grandParent === undefined && page) {
        this.data.markers[childId].page = page;
      } else {
        delete this.data.markers[childId].page;
      }
    }
    for (const noteId of liftedNotes) {
      this.setNoteHome(noteId, grandParent ? { markerId: grandParent } : page ? { page } : { page: this.defaultFilesPageId() });
    }
    delete this.data.markers[id];
    this.forgetCollapsed(id);
    this.unlinkMarkerAssignments(id);
    const ordered = [...siblings, ...lifted];
    this.applySiblingOrder(ordered);
    for (const childId of liftedMarkers) {
      this.relinkMarkerTree(childId);
    }
    for (const noteId of liftedNotes) {
      this.relinkNoteTree(noteId);
    }
    await this.commit();
  }

  /** Delete a group and every nested group / note under it. */
  async deleteMarkerTree(id: string): Promise<void> {
    if (!this.data.markers[id]) {
      return;
    }
    const def = this.data.markers[id];
    const grandParent = def.parent;
    const page = grandParent === undefined ? this.pageOf(id) : undefined;
    const scope =
      grandParent !== undefined
        ? { markerId: grandParent }
        : page
          ? { pageId: page }
          : undefined;
    const siblings = scope
      ? this.mixedSiblings(scope).filter((s) => !(s.kind === 'marker' && s.id === id))
      : [];
    for (const markerId of this.descendantMarkers(id, true)) {
      for (const [noteId] of this.notesOf(markerId)) {
        this.purgeNoteTree(noteId);
      }
      this.purgeMarker(markerId);
    }
    this.applySiblingOrder(siblings);
    await this.commit();
  }

  async moveMarker(id: string, delta: -1 | 1): Promise<void> {
    const def = this.data.markers[id];
    if (!def) {
      return;
    }
    const page = def.parent === undefined ? this.pageOf(id) : undefined;
    const scope =
      def.parent !== undefined
        ? { markerId: def.parent }
        : page
          ? { pageId: page }
          : undefined;
    if (!scope) {
      return;
    }
    const ordered = this.mixedSiblings(scope);
    const index = ordered.findIndex((s) => s.kind === 'marker' && s.id === id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= ordered.length) {
      return;
    }
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    this.applySiblingOrder(ordered);
    await this.commit();
  }

  async placeMarker(id: string, targetId: string, position: 'before' | 'after'): Promise<void> {
    if (id === targetId || !this.data.markers[id] || !this.data.markers[targetId]) {
      return;
    }
    const parent = this.data.markers[targetId].parent;
    const oldParent = this.data.markers[id].parent;
    const targetPage = this.pageOf(targetId);
    const oldPage = this.pageOf(id);
    if (parent !== oldParent || (parent === undefined && targetPage !== oldPage)) {
      if (parent) {
        const check = this.canNest(id, parent);
        if (!check.ok) {
          throw new Error(check.reason);
        }
      } else if (this.subtreeHeight(id) > MAX_MARKER_DEPTH) {
        throw new Error(`Maximum nesting depth is ${MAX_MARKER_DEPTH} subgroups.`);
      }
    }
    const oldScope =
      oldParent !== undefined
        ? { markerId: oldParent }
        : oldPage
          ? { pageId: oldPage }
          : undefined;
    this.data.markers[id].parent = parent;
    if (parent === undefined) {
      this.data.markers[id].page = targetPage;
    } else {
      delete this.data.markers[id].page;
    }
    const newScope =
      parent !== undefined
        ? { markerId: parent }
        : targetPage
          ? { pageId: targetPage }
          : undefined;
    if (!newScope) {
      return;
    }
    const ordered = this.mixedSiblings(newScope).filter((s) => !(s.kind === 'marker' && s.id === id));
    let index = ordered.findIndex((s) => s.kind === 'marker' && s.id === targetId);
    if (index < 0) {
      index = ordered.length;
    } else if (position === 'after') {
      index += 1;
    }
    ordered.splice(index, 0, { kind: 'marker', id });
    this.applySiblingOrder(ordered);
    if (oldScope && (oldParent !== parent || oldPage !== targetPage)) {
      this.applySiblingOrder(
        this.mixedSiblings(oldScope).filter((s) => !(s.kind === 'marker' && s.id === id)),
      );
    }
    if (parent !== oldParent || (parent === undefined && targetPage !== oldPage)) {
      this.relinkMarkerTree(id);
    }
    await this.commit();
  }

  /** Place a marker before/after a note that shares the same parent scope. */
  async placeMarkerAtNote(
    id: string,
    targetNoteId: string,
    position: 'before' | 'after',
  ): Promise<void> {
    const note = this.data.notes[targetNoteId];
    if (!this.data.markers[id] || !note || note.parentNote) {
      return;
    }
    const parent = note.markerId;
    const targetPage = note.page ?? (parent ? this.pageOf(parent) : undefined);
    const oldParent = this.data.markers[id].parent;
    const oldPage = this.pageOf(id);
    if (parent) {
      const check = this.canNest(id, parent);
      if (!check.ok) {
        throw new Error(check.reason);
      }
    } else if (this.subtreeHeight(id) > MAX_MARKER_DEPTH) {
      throw new Error(`Maximum nesting depth is ${MAX_MARKER_DEPTH} subgroups.`);
    }
    const oldScope =
      oldParent !== undefined
        ? { markerId: oldParent }
        : oldPage
          ? { pageId: oldPage }
          : undefined;
    this.data.markers[id].parent = parent;
    if (parent === undefined) {
      this.data.markers[id].page = targetPage;
    } else {
      delete this.data.markers[id].page;
    }
    const newScope = parent
      ? { markerId: parent }
      : targetPage
        ? { pageId: targetPage }
        : undefined;
    if (!newScope) {
      return;
    }
    const ordered = this.mixedSiblings(newScope).filter((s) => !(s.kind === 'marker' && s.id === id));
    let index = ordered.findIndex((s) => s.kind === 'note' && s.id === targetNoteId);
    if (index < 0) {
      index = ordered.length;
    } else if (position === 'after') {
      index += 1;
    }
    ordered.splice(index, 0, { kind: 'marker', id });
    this.applySiblingOrder(ordered);
    if (oldScope && (oldParent !== parent || oldPage !== targetPage)) {
      this.applySiblingOrder(
        this.mixedSiblings(oldScope).filter((s) => !(s.kind === 'marker' && s.id === id)),
      );
    }
    if (parent !== oldParent || (parent === undefined && targetPage !== oldPage)) {
      this.relinkMarkerTree(id);
    }
    await this.commit();
  }

  async nestMarker(id: string, parentId: string): Promise<void> {
    const check = this.canNest(id, parentId);
    if (!check.ok) {
      throw new Error(check.reason);
    }
    const oldParent = this.data.markers[id].parent;
    const oldPage = this.pageOf(id);
    const oldScope =
      oldParent !== undefined
        ? { markerId: oldParent }
        : oldPage
          ? { pageId: oldPage }
          : undefined;
    this.data.markers[id].parent = parentId;
    delete this.data.markers[id].page;
    const ordered = this.mixedSiblings({ markerId: parentId }).filter(
      (s) => !(s.kind === 'marker' && s.id === id),
    );
    ordered.push({ kind: 'marker', id });
    this.applySiblingOrder(ordered);
    if (oldScope && oldParent !== parentId) {
      this.applySiblingOrder(
        this.mixedSiblings(oldScope).filter((s) => !(s.kind === 'marker' && s.id === id)),
      );
    }
    this.relinkMarkerTree(id);
    await this.commit();
  }

  async unnestMarker(id: string): Promise<void> {
    const def = this.data.markers[id];
    if (!def?.parent) {
      return;
    }
    const parentId = def.parent;
    const grandParent = this.data.markers[parentId]?.parent;
    const page = this.pageOf(parentId);
    const newScope =
      grandParent !== undefined
        ? { markerId: grandParent }
        : page
          ? { pageId: page }
          : undefined;
    if (!newScope) {
      return;
    }
    const siblings = this.mixedSiblings(newScope).filter((s) => !(s.kind === 'marker' && s.id === id));
    const parentIndex = siblings.findIndex((s) => s.kind === 'marker' && s.id === parentId);
    const insertAt = parentIndex < 0 ? siblings.length : parentIndex + 1;
    this.data.markers[id].parent = grandParent;
    if (grandParent === undefined && page) {
      this.data.markers[id].page = page;
    } else {
      delete this.data.markers[id].page;
    }
    siblings.splice(insertAt, 0, { kind: 'marker', id });
    this.applySiblingOrder(siblings);
    this.applySiblingOrder(this.mixedSiblings({ markerId: parentId }));
    this.relinkMarkerTree(id);
    await this.commit();
  }

  // ---- pages ----

  /** True when the active project already has a page of this kind. */
  hasPageKind(kind: PageKind): boolean {
    return this.pages().some(([, page]) => page.kind === kind);
  }

  async createPage(name: string, kind: PageKind, description?: string): Promise<string | undefined> {
    if (this.pages().length >= MAX_PAGES) {
      return undefined;
    }
    if (this.hasPageKind(kind)) {
      return undefined;
    }
    const trimmed = name.trim();
    if (!trimmed) {
      return undefined;
    }
    const id = this.uniquePageId(trimmed, kind);
    const maxOrder = Math.max(0, ...this.pages().map(([, p]) => p.order));
    const page = {
      ...defaultPage(capitalize(trimmed)),
      kind,
      order: maxOrder + 1,
    };
    const text = normalizeGroupDescription(description);
    if (text) {
      page.description = text;
    }
    this.data.pages[id] = page;
    if (kind === 'links') {
      this.insertLinkBranch(id, 2);
    }
    this.projectDirty = true;
    await this.commit();
    return id;
  }

  async renamePage(id: string, name: string): Promise<void> {
    const page = this.data.pages[id];
    const trimmed = name.trim();
    if (!page || !trimmed) {
      return;
    }
    page.name = capitalize(trimmed);
    await this.bumpPageSettings(id);
    await this.commit();
  }

  /** Name and optional description of a map page. */
  async setPageMeta(id: string, name: string, description?: string): Promise<void> {
    const page = this.data.pages[id];
    const trimmed = name.trim();
    if (!page || !trimmed) {
      return;
    }
    page.name = capitalize(trimmed);
    const text = normalizeGroupDescription(description);
    if (text) {
      page.description = text;
    } else {
      delete page.description;
    }
    await this.bumpPageSettings(id);
    await this.commit();
  }

  /** Bump page settings version in the base snapshot (not content). */
  private async bumpPageSettings(pageId: string): Promise<void> {
    await this.enqueue(async () => {
      const project = this.activeProject();
      if (!project?.pages[pageId]) {
        this.syncProjectPagesFromData();
      }
      const entry = this.ensureActiveProject()?.pages[pageId];
      if (entry) {
        entry.version = (entry.version || 1) + 1;
        entry.name = this.data.pages[pageId]?.name ?? entry.name;
        entry.description = this.data.pages[pageId]?.description;
        entry.order = this.data.pages[pageId]?.order ?? entry.order;
      }
      this.projectDirty = true;
      await this.persistBaseOnly();
    });
  }

  /**
   * Deletes a page and every group / note on it.
   * Returns the neighbor page id to open next, or undefined if nothing was deleted.
   */
  async deletePage(id: string): Promise<string | undefined> {
    let neighbor: string | undefined;
    let tombstone: { pageId: string; tomb: PageTombstone } | undefined;
    await this.enqueue(async () => {
      const page = this.data.pages[id];
      if (!page) {
        return;
      }
      const kind = pageKindToConfigKind(page.kind);
      const stamp = this.pageCloud[id];
      let channel = '';
      if (kind) {
        channel = this.resolvePageChannel(id, kind);
      }
      if (stamp && kind && kind !== 'BASE' && channel) {
        tombstone = {
          pageId: id,
          tomb: {
            kind,
            channelId: channel,
            name: page.name,
            pageKind: page.kind,
            order: page.order,
            number: stamp.number,
            headerDate: stamp.headerDate,
            messageId: stamp.messageId,
          },
        };
      }
      neighbor = await this.erasePageNow(id);
    });
    if (tombstone) {
      await this.postPageTombstone(tombstone.pageId, tombstone.tomb);
    }
    return neighbor;
  }

  /** Drop a page and its cards. Caller must already hold the store queue. */
  private async erasePageNow(id: string): Promise<string | undefined> {
    if (!this.data.pages[id]) {
      return undefined;
    }
    const ordered = this.pages();
    const index = ordered.findIndex(([pageId]) => pageId === id);
    const neighbor = ordered[index + 1]?.[0] ?? ordered[index - 1]?.[0];
    const toRemove = this.children(undefined, id).flatMap(([rootId]) =>
      this.descendantMarkers(rootId, true),
    );
    for (const markerId of toRemove) {
      for (const [noteId] of this.notesOf(markerId)) {
        this.purgeNoteTree(noteId);
      }
      this.purgeMarker(markerId);
    }
    for (const [noteId] of this.rootNotes(id)) {
      this.purgeNoteTree(noteId);
    }
    for (const [linkId] of this.rootLinks(id)) {
      this.purgeLinkTree(linkId);
    }
    delete this.data.pages[id];
    delete this.pageCloud[id];
    await this.accessStore?.deletePage(id);
    const project = this.activeProject();
    if (project?.pages[id]) {
      delete project.pages[id];
      this.projectDirty = true;
    }
    this.applyPageOrder(this.pages().map(([pageId]) => pageId));
    const fallback = neighbor ?? this.pages()[0]?.[0] ?? DEFAULT_PAGE_ID;
    for (const surface of MAP_SURFACES) {
      if (this.data.surfaces[surface].page === id) {
        this.data.surfaces[surface] = { page: fallback };
      }
    }
    await this.commitNow();
    dropPageHistory(this.history, id);
    delete this.pagePresent[id];
    if (this.historyReady) {
      await this.persistHistory();
    }
    return neighbor;
  }

  /**
   * Review bindings and page settings light the project send button.
   * Map content still uses dirtyPages via commit.
   */
  async touchPageConfig(pageId: string): Promise<void> {
    await this.enqueue(async () => {
      if (!this.data.pages[pageId]) {
        return;
      }
      const page = this.data.pages[pageId];
      this.syncProjectPagesFromData();
      const entry = this.ensureActiveProject()?.pages[pageId];
      if (entry) {
        entry.version = (entry.version || 1) + 1;
      }
      this.projectDirty = true;
      if (page.kind !== 'review') {
        this.dirtyPages.add(pageId);
      }
      await this.persistSplitConfig();
      this.changeEmitter.fire();
    });
  }

  async reorderPages(orderedIds: string[]): Promise<void> {
    const known = new Set(Object.keys(this.data.pages));
    const ordered = orderedIds.filter((id) => known.has(id));
    for (const id of known) {
      if (!ordered.includes(id)) {
        ordered.push(id);
      }
    }
    this.applyPageOrder(ordered);
    await this.commit();
  }

  async updatePageView(
    id: string,
    patch: Partial<Pick<PageDef, 'layout' | 'groupsLayout'>>,
  ): Promise<void> {
    const page = this.data.pages[id];
    if (!page) {
      return;
    }
    if (patch.layout !== undefined) {
      page.layout = normalizeMapLayout(patch.layout);
    }
    if (patch.groupsLayout !== undefined) {
      page.groupsLayout = normalizeGroupsLayout(patch.groupsLayout);
    }
    await this.enqueue(async () => {
      const project = this.ensureActiveProject();
      const profileId = this.ensureActiveProfileId();
      const profile = project?.profiles[profileId];
      if (profile) {
        const layouts = { ...(profile.pageLayouts ?? {}) };
        layouts[id] = { layout: page.layout, groupsLayout: page.groupsLayout };
        profile.pageLayouts = layouts;
        profile.version = (profile.version || 1) + 1;
        this.profileDirty = true;
      }
      await this.commitNow();
    });
  }

  /** Remember which groups are folded on one surface of one page. Does not create an undo step. */
  async setPageCollapsed(
    pageId: string,
    surface: MapSurface,
    collapsed: Record<string, boolean>,
  ): Promise<void> {
    const page = this.data.pages[pageId];
    if (!page) {
      return;
    }
    const next: Record<string, boolean> = {};
    for (const [id, on] of Object.entries(collapsed)) {
      if (on && (this.data.markers[id] || this.data.notes[id] || this.data.links[id])) {
        next[id] = true;
      }
    }
    page.collapsed[surface] = next;
    await this.commit();
  }

  /** Active page id stored for a map surface. */
  surfacePage(surface: MapSurface): string {
    const pageId = this.data.surfaces[surface]?.page;
    return pageId && this.data.pages[pageId] ? pageId : this.defaultFilesPageId();
  }

  /** Open flags for bottom / left / right panels (from the active profile). */
  surfaceOpen(): PanelOpenState {
    return { ...this.activeProfileStyle().open };
  }

  isSurfaceOpen(surface: OpenSurface): boolean {
    return !!this.activeProfileStyle().open[surface];
  }

  /** True when the config lacked a `surfaces` block and workspace state may still seed it. */
  needsLegacySurfaceHydration(): boolean {
    return this.surfacesNeedLegacyHydration;
  }

  /** Persist which page a surface is showing. Does not create an undo step. */
  async setSurfacePage(surface: MapSurface, pageId: string): Promise<void> {
    if (!this.data.pages[pageId]) {
      return;
    }
    if (this.data.surfaces[surface].page === pageId) {
      return;
    }
    this.data.surfaces[surface] = { page: pageId };
    await this.enqueue(async () => {
      this.surfaceOnlyChange = true;
      try {
        await this.commitNow();
      } finally {
        this.surfaceOnlyChange = false;
      }
    });
  }

  /**
   * The current `onDidChange` is only the active page of a map surface.
   * Groups, notes, and links are unchanged, so listeners can reuse a page body they already built.
   */
  isSurfaceOnlyChange(): boolean {
    return this.surfaceOnlyChange;
  }

  /** Persist whether a movable panel is open on the active profile. Does not create an undo step. */
  async setSurfaceOpen(surface: OpenSurface, open: boolean): Promise<void> {
    await this.enqueue(async () => {
      const id = this.ensureActiveProfileId();
      const current = this.activeProfileStyle();
      if (current.open[surface] === open) {
        return;
      }
      this.stylesData.styles[id] = {
        appearance: { ...current.appearance },
        open: { ...current.open, [surface]: open },
      };
      this.mirrorActiveOpenToSurfaces();
      await this.persistStyles();
      this.changeEmitter.fire();
    });
  }

  /**
   * One-shot: copy old workspace active pages / column side into `surfaces`,
   * and rewrite the markers file so `surfaces` + left/right folds land on disk.
   * Only runs when the markers file had no `surfaces` block.
   */
  async hydrateSurfacesFromLegacy(legacy: {
    pages?: Partial<Record<'explorer' | 'bottom' | 'sidebar', string>>;
    columnSide?: 'left' | 'right';
    bottomAlive?: boolean;
  }): Promise<void> {
    if (!this.surfacesNeedLegacyHydration) {
      return;
    }
    this.surfacesNeedLegacyHydration = false;
    await this.enqueue(async () => {
      const pages = legacy.pages ?? {};
      const apply = (surface: MapSurface, pageId: string | undefined) => {
        if (pageId && this.data.pages[pageId]) {
          this.data.surfaces[surface] = { page: pageId };
        }
      };
      apply('explorer', pages.explorer);
      apply('bottom', pages.bottom);
      apply('left', pages.sidebar);
      apply('right', pages.sidebar);
      if (legacy.columnSide === 'left') {
        this.data.surfaces.open.left = true;
      } else if (legacy.columnSide === 'right') {
        this.data.surfaces.open.right = true;
      }
      if (legacy.bottomAlive) {
        this.data.surfaces.open.bottom = true;
      }
      const activeId = this.ensureActiveProfileId();
      const current = this.activeProfileStyle();
      this.stylesData.styles[activeId] = {
        appearance: { ...current.appearance },
        open: { ...this.data.surfaces.open },
      };
      await this.persistStyles();
      const next = this.capture();
      await this.writeConfig(next);
      this.present = next;
      this.baseline = undefined;
      this.changeEmitter.fire();
    });
  }

  // ---- notes ----

  /**
   * Create a note card. Exactly one of page / markerId / parentNote.
   * Empty text is allowed (placeholder shown in the UI).
   */
  async createNote(home: NoteHome, text = ''): Promise<string | undefined> {
    if (home.parentNote) {
      if (!this.data.notes[home.parentNote]) {
        return undefined;
      }
      if (this.noteDepthOf(home.parentNote) >= MAX_MARKER_DEPTH) {
        return undefined;
      }
    } else if (home.markerId) {
      if (!this.data.markers[home.markerId]) {
        return undefined;
      }
    } else if (!home.page || !this.data.pages[home.page]) {
      return undefined;
    }
    const id = this.uniqueNoteId();
    const scope = home.parentNote
      ? { noteId: home.parentNote }
      : home.markerId
        ? { markerId: home.markerId }
        : { pageId: home.page };
    const mixed = this.mixedSiblings(scope);
    const entry: NoteDef = { text: text.trim(), order: 1 };
    if (home.parentNote) {
      entry.parentNote = home.parentNote;
    } else if (home.markerId) {
      entry.markerId = home.markerId;
    } else {
      entry.page = home.page;
      entry.color = NOTE_ROOT_COLOR;
    }
    this.data.notes[id] = entry;
    // New groups/notes appear at the start of their sibling list (top of the map for roots).
    this.applySiblingOrder([{ kind: 'note', id }, ...mixed]);
    await this.commit();
    return id;
  }

  async updateNote(id: string, text: string): Promise<void> {
    const note = this.data.notes[id];
    if (!note) {
      return;
    }
    note.text = text;
    await this.commit();
  }

  async setNoteColor(id: string, color: string | undefined): Promise<void> {
    const note = this.data.notes[id];
    if (!note) {
      return;
    }
    if (!color) {
      delete note.color;
      await this.commit();
      return;
    }
    const next = migrateColorId(normalizeHex(color) ?? color);
    if (!next) {
      return;
    }
    note.color = next;
    await this.commit();
  }

  /** Delete a note; lift child notes one level up. */
  async deleteNote(id: string): Promise<void> {
    const note = this.data.notes[id];
    if (!note) {
      return;
    }
    const home = this.noteHomeOf(id);
    if (!home) {
      return;
    }
    const scope = this.scopeOfNoteHome(home);
    const siblings = this.mixedSiblings(scope).filter((s) => !(s.kind === 'note' && s.id === id));
    const lifted = this.noteChildren(id).map(([childId]) => childId);
    for (const childId of lifted) {
      this.setNoteHome(childId, home);
    }
    delete this.data.notes[id];
    this.forgetCollapsed(id);
    this.applySiblingOrder([
      ...siblings,
      ...lifted.map((childId) => ({ kind: 'note' as const, id: childId })),
    ]);
    for (const childId of lifted) {
      this.relinkNoteTree(childId);
    }
    await this.commit();
  }

  /** Delete a note and its entire nested note tree. */
  async deleteNoteTree(id: string): Promise<void> {
    const note = this.data.notes[id];
    if (!note) {
      return;
    }
    const home = this.noteHomeOf(id);
    if (!home) {
      return;
    }
    const scope = this.scopeOfNoteHome(home);
    const siblings = this.mixedSiblings(scope).filter((s) => !(s.kind === 'note' && s.id === id));
    this.purgeNoteTree(id);
    this.applySiblingOrder(siblings);
    await this.commit();
  }

  async moveNote(id: string, delta: -1 | 1): Promise<void> {
    const home = this.noteHomeOf(id);
    if (!home) {
      return;
    }
    const ordered = this.mixedSiblings(this.scopeOfNoteHome(home));
    const index = ordered.findIndex((s) => s.kind === 'note' && s.id === id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= ordered.length) {
      return;
    }
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    this.applySiblingOrder(ordered);
    await this.commit();
  }

  async placeNote(
    id: string,
    target: SiblingRef,
    position: 'before' | 'after',
  ): Promise<void> {
    if (!this.data.notes[id]) {
      return;
    }
    if (target.kind === 'note' && target.id === id) {
      return;
    }
    const oldHome = this.noteHomeOf(id);
    if (!oldHome) {
      return;
    }
    let newHome: NoteHome | undefined;
    if (target.kind === 'marker') {
      const marker = this.data.markers[target.id];
      if (!marker) {
        return;
      }
      if (marker.parent) {
        newHome = { markerId: marker.parent };
      } else {
        const page = this.pageOf(target.id);
        if (!page) {
          return;
        }
        newHome = { page };
      }
    } else {
      const targetNote = this.data.notes[target.id];
      if (!targetNote) {
        return;
      }
      newHome = this.noteHomeOf(target.id);
    }
    if (!newHome) {
      return;
    }
    if (newHome.parentNote) {
      const check = this.canNestNote(id, newHome.parentNote);
      if (!check.ok) {
        throw new Error(check.reason);
      }
    }
    const oldScope = this.scopeOfNoteHome(oldHome);
    this.setNoteHome(id, newHome);
    const newScope = this.scopeOfNoteHome(newHome);
    const ordered = this.mixedSiblings(newScope).filter((s) => !(s.kind === 'note' && s.id === id));
    let index = ordered.findIndex((s) => s.kind === target.kind && s.id === target.id);
    if (index < 0) {
      index = ordered.length;
    } else if (position === 'after') {
      index += 1;
    }
    ordered.splice(index, 0, { kind: 'note', id });
    this.applySiblingOrder(ordered);
    const homeChanged = !this.sameNoteHome(oldHome, newHome);
    if (homeChanged) {
      this.applySiblingOrder(
        this.mixedSiblings(oldScope).filter((s) => !(s.kind === 'note' && s.id === id)),
      );
      this.relinkNoteTree(id);
    }
    await this.commit();
  }

  async nestNote(id: string, parent: { markerId?: string; noteId?: string }): Promise<void> {
    if (!this.data.notes[id]) {
      return;
    }
    const oldHome = this.noteHomeOf(id);
    if (!oldHome) {
      return;
    }
    let newHome: NoteHome;
    if (parent.noteId) {
      const check = this.canNestNote(id, parent.noteId);
      if (!check.ok) {
        throw new Error(check.reason);
      }
      newHome = { parentNote: parent.noteId };
    } else if (parent.markerId && this.data.markers[parent.markerId]) {
      newHome = { markerId: parent.markerId };
    } else {
      return;
    }
    const oldScope = this.scopeOfNoteHome(oldHome);
    this.setNoteHome(id, newHome);
    const ordered = this.mixedSiblings(this.scopeOfNoteHome(newHome)).filter(
      (s) => !(s.kind === 'note' && s.id === id),
    );
    ordered.push({ kind: 'note', id });
    this.applySiblingOrder(ordered);
    if (!this.sameNoteHome(oldHome, newHome)) {
      this.applySiblingOrder(
        this.mixedSiblings(oldScope).filter((s) => !(s.kind === 'note' && s.id === id)),
      );
      this.relinkNoteTree(id);
    }
    await this.commit();
  }

  async unnestNote(id: string): Promise<void> {
    const note = this.data.notes[id];
    if (!note) {
      return;
    }
    let newHome: NoteHome | undefined;
    let anchorId: string | undefined;
    if (note.parentNote) {
      const parent = this.data.notes[note.parentNote];
      if (!parent) {
        return;
      }
      newHome = this.noteHomeOf(note.parentNote);
      anchorId = note.parentNote;
    } else if (note.markerId) {
      const marker = this.data.markers[note.markerId];
      if (!marker) {
        return;
      }
      if (marker.parent) {
        newHome = { markerId: marker.parent };
      } else {
        const page = this.pageOf(note.markerId);
        if (!page) {
          return;
        }
        newHome = { page };
      }
      anchorId = note.markerId;
    } else {
      return;
    }
    if (!newHome || !anchorId) {
      return;
    }
    const oldHome = this.noteHomeOf(id);
    if (!oldHome) {
      return;
    }
    const oldScope = this.scopeOfNoteHome(oldHome);
    this.setNoteHome(id, newHome);
    const siblings = this.mixedSiblings(this.scopeOfNoteHome(newHome)).filter(
      (s) => !(s.kind === 'note' && s.id === id),
    );
    const anchorKind: SiblingRef['kind'] = note.parentNote ? 'note' : 'marker';
    const parentIndex = siblings.findIndex((s) => s.kind === anchorKind && s.id === anchorId);
    const insertAt = parentIndex < 0 ? siblings.length : parentIndex + 1;
    siblings.splice(insertAt, 0, { kind: 'note', id });
    this.applySiblingOrder(siblings);
    this.applySiblingOrder(
      this.mixedSiblings(oldScope).filter((s) => !(s.kind === 'note' && s.id === id)),
    );
    this.relinkNoteTree(id);
    await this.commit();
  }

  // ---- links (layouts / components) ----

  links(): Array<[string, LinkDef]> {
    return Object.entries(this.data.links).sort(
      (a, b) => a[1].order - b[1].order || a[0].localeCompare(b[0]),
    );
  }

  link(id: string): LinkDef | undefined {
    return this.data.links[id];
  }

  /** Direct children of a link node, sorted by order. */
  linkChildren(parentId: string): Array<[string, LinkDef]> {
    return Object.entries(this.data.links)
      .filter(([, def]) => def.parent === parentId)
      .sort((a, b) => a[1].order - b[1].order || a[1].label.localeCompare(b[1].label));
  }

  /** Top-level layouts on a links page. */
  rootLinks(pageId: string): Array<[string, LinkDef]> {
    return Object.entries(this.data.links)
      .filter(([, def]) => !def.parent && def.page === pageId)
      .sort((a, b) => a[1].order - b[1].order || a[1].label.localeCompare(b[1].label));
  }

  pageOfLink(id: string): string | undefined {
    let current: string | undefined = id;
    const seen = new Set<string>();
    while (current && this.data.links[current] && !seen.has(current)) {
      seen.add(current);
      const def: LinkDef = this.data.links[current];
      if (def.page) {
        return def.page;
      }
      current = def.parent;
    }
    return undefined;
  }

  linkDepthOf(id: string): number {
    let depth = 0;
    let current = this.data.links[id]?.parent;
    const seen = new Set<string>();
    while (current && this.data.links[current] && !seen.has(current)) {
      seen.add(current);
      depth++;
      current = this.data.links[current].parent;
    }
    return depth;
  }

  linkSubtreeHeight(id: string): number {
    const kids = this.linkChildren(id);
    if (kids.length === 0) {
      return 0;
    }
    return 1 + Math.max(...kids.map(([childId]) => this.linkSubtreeHeight(childId)));
  }

  /** Root layout id of the branch containing `id`. */
  linkRootOf(id: string): string | undefined {
    let current: string | undefined = id;
    const seen = new Set<string>();
    while (current && this.data.links[current] && !seen.has(current)) {
      seen.add(current);
      const parent: string | undefined = this.data.links[current].parent;
      if (!parent) {
        return current;
      }
      current = parent;
    }
    return undefined;
  }

  /** Resolved color of a link node (from its root layout). */
  linkColorOf(id: string): string | undefined {
    const root = this.linkRootOf(id);
    const color = root ? this.data.links[root]?.color : undefined;
    return color || undefined;
  }

  isLinkLocked(id: string): boolean {
    return this.data.links[id]?.locked === true;
  }

  descendantLinks(linkId: string, includeSelf = false): string[] {
    const result: string[] = [];
    const visit = (id: string) => {
      for (const [childId] of this.linkChildren(id)) {
        result.push(childId);
        visit(childId);
      }
    };
    if (includeSelf) {
      result.push(linkId);
    }
    visit(linkId);
    return result;
  }

  canNestLink(id: string, parentId: string): NestResult {
    if (!this.data.links[id] || !this.data.links[parentId]) {
      return { ok: false, reason: 'Link not found.' };
    }
    if (id === parentId) {
      return { ok: false, reason: 'A link cannot be nested inside itself.' };
    }
    let ancestor: string | undefined = parentId;
    const seen = new Set<string>();
    while (ancestor) {
      if (ancestor === id) {
        return { ok: false, reason: 'A link cannot be nested inside its own child.' };
      }
      if (seen.has(ancestor)) {
        break;
      }
      seen.add(ancestor);
      ancestor = this.data.links[ancestor]?.parent;
    }
    const parentDepth = this.linkDepthOf(parentId);
    const height = this.linkSubtreeHeight(id);
    if (parentDepth + 1 + height > MAX_MARKER_DEPTH) {
      return { ok: false, reason: `Maximum nesting depth is ${MAX_MARKER_DEPTH} subgroups.` };
    }
    return { ok: true };
  }

  /** True when this is the only root layout on its page. */
  isLastRootLink(id: string): boolean {
    const def = this.data.links[id];
    if (!def || def.parent || !def.page) {
      return false;
    }
    return this.rootLinks(def.page).length <= 1;
  }

  /** True when the node may be deleted. Only the last root layout is blocked. */
  canDeleteLink(id: string): boolean {
    const def = this.data.links[id];
    if (!def) {
      return false;
    }
    if (!def.parent && this.isLastRootLink(id)) {
      return false;
    }
    return true;
  }

  /**
   * Create a root layout «Ваш макет» with one «Ваш компонент» on a links page.
   * Returns the layout id.
   */
  async createLinkLayout(pageId: string): Promise<string | undefined> {
    const page = this.data.pages[pageId];
    if (!page || page.kind !== 'links') {
      return undefined;
    }
    const rootId = this.insertLinkBranch(pageId, 1);
    await this.commit();
    return rootId;
  }

  /** Create an empty child «Ваш компонент» under a parent when depth allows. */
  async createLinkChild(parentId: string): Promise<string | undefined> {
    const parent = this.data.links[parentId];
    if (!parent) {
      return undefined;
    }
    if (this.linkDepthOf(parentId) >= MAX_MARKER_DEPTH) {
      return undefined;
    }
    const id = this.insertLinkNode({
      label: LINK_COMPONENT_LABEL,
      parent: parentId,
    });
    await this.commit();
    return id;
  }

  async updateLink(
    id: string,
    patch: { label?: string; description?: string | null; url?: string | null; color?: string },
  ): Promise<void> {
    const current = this.data.links[id];
    if (!current) {
      return;
    }
    if (patch.label !== undefined) {
      const trimmed = patch.label.trim();
      if (trimmed) {
        current.label = capitalize(trimmed);
      }
    }
    if (patch.description !== undefined) {
      if (patch.description === null || !patch.description.trim()) {
        delete current.description;
      } else {
        current.description = patch.description.trim();
      }
    }
    if (patch.url !== undefined) {
      if (patch.url === null || !patch.url.trim()) {
        delete current.url;
      } else {
        current.url = patch.url.trim();
      }
    }
    if (patch.color !== undefined && !current.parent) {
      const next = normalizeHex(patch.color);
      if (next && isLinkPaletteColor(next)) {
        current.color = next;
      }
    }
    await this.commit();
  }

  /**
   * Delete a link and everything nested inside it.
   * The last root layout cannot be deleted.
   */
  async deleteLink(id: string): Promise<{ ok: true } | { ok: false; reason: string }> {
    const def = this.data.links[id];
    if (!def) {
      return { ok: false, reason: 'Link not found.' };
    }
    if (!this.canDeleteLink(id)) {
      return { ok: false, reason: 'Cannot delete the last layout.' };
    }
    const parentId = def.parent;
    const pageId = def.page;
    this.purgeLinkTree(id);
    if (parentId) {
      this.applyLinkSiblingOrder(
        undefined,
        parentId,
        this.linkChildren(parentId).map(([linkId]) => linkId),
      );
    } else if (pageId) {
      this.applyLinkSiblingOrder(
        pageId,
        undefined,
        this.rootLinks(pageId).map(([linkId]) => linkId),
      );
    }
    await this.commit();
    return { ok: true };
  }

  /**
   * Delete a link and lift its children one level (to the same parent or page root).
   * The last root layout cannot be deleted.
   */
  async deleteLinkLift(id: string): Promise<{ ok: true } | { ok: false; reason: string }> {
    const def = this.data.links[id];
    if (!def) {
      return { ok: false, reason: 'Link not found.' };
    }
    if (!this.canDeleteLink(id)) {
      return { ok: false, reason: 'Cannot delete the last layout.' };
    }
    const parentId = def.parent;
    const pageId = def.page;
    const childIds = this.linkChildren(id).map(([childId]) => childId);
    let ordered: string[];
    if (parentId) {
      ordered = this.linkChildren(parentId).map(([linkId]) => linkId);
    } else if (pageId) {
      ordered = this.rootLinks(pageId).map(([linkId]) => linkId);
    } else {
      return { ok: false, reason: 'Link not found.' };
    }
    const index = ordered.indexOf(id);
    const without = ordered.filter((linkId) => linkId !== id);
    for (const childId of childIds) {
      if (parentId) {
        this.setLinkHome(childId, { parent: parentId });
      } else if (pageId) {
        this.setLinkHome(childId, { page: pageId });
        if (!this.data.links[childId]?.color) {
          this.data.links[childId].color = this.nextLinkColor(pageId, childId);
        }
      }
    }
    delete this.data.links[id];
    this.forgetCollapsed(id);
    const insertAt = index < 0 ? without.length : index;
    const next = [...without.slice(0, insertAt), ...childIds, ...without.slice(insertAt)];
    if (parentId) {
      this.applyLinkSiblingOrder(undefined, parentId, next);
    } else if (pageId) {
      this.applyLinkSiblingOrder(pageId, undefined, next);
    }
    await this.commit();
    return { ok: true };
  }

  async toggleLinkLock(id: string): Promise<void> {
    if (!this.data.links[id]) {
      return;
    }
    const apply = (linkId: string) => {
      const def = this.data.links[linkId];
      if (!def) {
        return;
      }
      const wasLocked = def.locked === true;
      if (wasLocked) {
        delete def.locked;
      } else {
        def.locked = true;
      }
      for (const [childId, child] of this.linkChildren(linkId)) {
        if ((child.locked === true) === wasLocked) {
          apply(childId);
        }
      }
    };
    apply(id);
    await this.commit();
  }

  /**
   * Place a link before/after a sibling target (may change parent / promote to root).
   * When `copy` is true, clones the subtree instead of moving.
   */
  async placeLink(
    id: string,
    targetId: string,
    position: 'before' | 'after',
    options: { copy?: boolean } = {},
  ): Promise<void> {
    if (!this.data.links[id] || !this.data.links[targetId] || id === targetId) {
      return;
    }
    const target = this.data.links[targetId];
    const newParent = target.parent;
    const newPage = newParent ? undefined : target.page;
    if (!newParent && !newPage) {
      return;
    }
    if (newParent) {
      const check = this.canNestLink(id, newParent);
      if (!check.ok) {
        throw new Error(check.reason);
      }
    }
    const workingId = options.copy ? this.cloneLinkTree(id, { asRoot: !newParent }) : id;
    if (!workingId) {
      return;
    }
    if (!options.copy) {
      this.detachLink(workingId);
    }
    if (newParent) {
      this.setLinkHome(workingId, { parent: newParent });
    } else if (newPage) {
      this.setLinkHome(workingId, { page: newPage });
      if (!this.data.links[workingId].color) {
        this.data.links[workingId].color = this.nextLinkColor(newPage, workingId);
      }
    }
    const siblings = (
      newParent ? this.linkChildren(newParent) : this.rootLinks(newPage!)
    )
      .map(([linkId]) => linkId)
      .filter((linkId) => linkId !== workingId);
    let index = siblings.indexOf(targetId);
    if (index < 0) {
      index = siblings.length;
    } else if (position === 'after') {
      index += 1;
    }
    siblings.splice(index, 0, workingId);
    this.applyLinkSiblingOrder(newPage, newParent, siblings);
    await this.commit();
  }

  /** Nest a link under another link (move or copy). */
  async nestLink(id: string, parentId: string, options: { copy?: boolean } = {}): Promise<void> {
    const check = this.canNestLink(id, parentId);
    if (!check.ok) {
      throw new Error(check.reason);
    }
    const workingId = options.copy ? this.cloneLinkTree(id, { asRoot: false }) : id;
    if (!workingId) {
      return;
    }
    if (!options.copy) {
      this.detachLink(workingId);
    }
    this.setLinkHome(workingId, { parent: parentId });
    const siblings = this.linkChildren(parentId)
      .map(([linkId]) => linkId)
      .filter((linkId) => linkId !== workingId);
    siblings.push(workingId);
    this.applyLinkSiblingOrder(undefined, parentId, siblings);
    await this.commit();
  }

  /** Lift a link one level (component → sibling of parent, or promote toward page root). */
  async unnestLink(id: string): Promise<void> {
    const def = this.data.links[id];
    if (!def?.parent) {
      return;
    }
    const parentId = def.parent;
    const parent = this.data.links[parentId];
    if (!parent) {
      return;
    }
    this.detachLink(id);
    if (parent.parent) {
      this.setLinkHome(id, { parent: parent.parent });
      const siblings = this.linkChildren(parent.parent)
        .map(([linkId]) => linkId)
        .filter((linkId) => linkId !== id);
      const parentIndex = siblings.indexOf(parentId);
      const insertAt = parentIndex < 0 ? siblings.length : parentIndex + 1;
      siblings.splice(insertAt, 0, id);
      this.applyLinkSiblingOrder(undefined, parent.parent, siblings);
    } else if (parent.page) {
      this.setLinkHome(id, { page: parent.page });
      this.data.links[id].color = this.nextLinkColor(parent.page, id);
      const siblings = this.rootLinks(parent.page)
        .map(([linkId]) => linkId)
        .filter((linkId) => linkId !== id);
      const parentIndex = siblings.indexOf(parentId);
      const insertAt = parentIndex < 0 ? siblings.length : parentIndex + 1;
      siblings.splice(insertAt, 0, id);
      this.applyLinkSiblingOrder(parent.page, undefined, siblings);
    }
    await this.commit();
  }

  /** True when the path is already assigned to the marker. */
  itemInMarker(relPath: string, markerId: string): boolean {
    return (this.data.items[normalizePath(relPath)] ?? []).includes(markerId);
  }

  /** True when the class is already assigned to the marker. */
  classInMarker(classId: string, markerId: string): boolean {
    return (this.data.classItems[classId] ?? []).includes(markerId);
  }

  /**
   * Assign paths to a marker. Returns how many were new.
   * When every path was already there, no commit.
   */
  async assign(relPaths: string[], markerId: string): Promise<number> {
    const now = Date.now();
    let added = 0;
    relPaths.forEach((relPath, index) => {
      const ids = this.data.items[relPath] ?? [];
      if (!ids.includes(markerId)) {
        this.setItem(relPath, [...ids, markerId]);
        this.setAdded(relPath, markerId, now + index);
        added += 1;
      }
    });
    if (added > 0) {
      await this.commit();
    }
    return added;
  }

  async unassign(entries: Array<{ relPath: string; markerId?: string }>): Promise<void> {
    for (const { relPath, markerId } of entries) {
      const ids = this.data.items[relPath] ?? [];
      this.setItem(relPath, markerId ? ids.filter((x) => x !== markerId) : []);
    }
    await this.commit();
  }

  /**
   * Move, copy, or reorder a file/folder chip.
   * `blockOrder` is the desired order of the same-kind block in `toMarkerId`
   * (dirs among dirs, files among files), including `relPath`.
   * Returns false when nothing changed (already in target, or order unchanged).
   */
  async moveItem(
    relPath: string,
    fromMarkerId: string,
    toMarkerId: string,
    options: { copy?: boolean; blockOrder?: string[] } = {},
  ): Promise<boolean> {
    const key = normalizePath(relPath);
    const copy = options.copy === true;
    const blockOrder = (options.blockOrder ?? []).map(normalizePath);
    if (!this.data.markers[toMarkerId]) {
      return false;
    }

    if (fromMarkerId === toMarkerId) {
      if (blockOrder.length === 0 || !blockOrder.includes(key)) {
        return false;
      }
      if (!this.applyItemBlockOrder(toMarkerId, blockOrder)) {
        return false;
      }
      await this.commit();
      return true;
    }

    const ids = this.data.items[key] ?? [];
    if (ids.includes(toMarkerId)) {
      return false;
    }

    if (copy) {
      this.setItem(key, [...ids, toMarkerId]);
    } else {
      const next = ids.filter((x) => x !== fromMarkerId);
      next.push(toMarkerId);
      this.setItem(key, next);
    }

    const order =
      blockOrder.length > 0 && blockOrder.includes(key)
        ? blockOrder
        : [...this.itemsOf(toMarkerId).filter((p) => p !== key), key];
    this.applyItemBlockOrder(toMarkerId, order);
    await this.commit();
    return true;
  }

  async setAlias(relPath: string, alias: string | undefined): Promise<void> {
    const key = normalizePath(relPath);
    const trimmed = alias?.trim();
    if (!trimmed) {
      delete this.data.aliases[key];
    } else {
      this.data.aliases[key] = trimmed;
    }
    await this.commit();
  }

  async setClassAlias(classId: string, alias: string | undefined): Promise<void> {
    const def = this.data.classes[classId];
    if (!def) {
      return;
    }
    const trimmed = alias?.trim();
    if (!trimmed) {
      delete def.alias;
    } else {
      def.alias = trimmed;
    }
    await this.commit();
  }

  async setMarkerAlias(markerId: string, alias: string | undefined): Promise<void> {
    const def = this.data.markers[markerId];
    if (!def) {
      return;
    }
    const trimmed = alias?.trim();
    if (!trimmed) {
      delete def.alias;
    } else {
      def.alias = trimmed;
    }
    await this.commit();
  }

  /** Find or create a class def and assign it to a marker. Returns class id. */
  async assignClass(
    def: { relPath: string; name: string; line?: number },
    markerId: string,
  ): Promise<string | undefined> {
    if (!this.data.markers[markerId]) {
      return undefined;
    }
    const relPath = normalizePath(def.relPath);
    const name = def.name.trim();
    if (!relPath || !name) {
      return undefined;
    }
    const line = typeof def.line === 'number' && def.line > 0 ? Math.floor(def.line) : undefined;
    let classId = Object.entries(this.data.classes).find(
      ([, c]) => c.relPath === relPath && c.name === name,
    )?.[0];
    if (!classId) {
      classId = this.uniqueClassId(name);
      this.data.classes[classId] = { relPath, name, line };
    } else if (line !== undefined) {
      this.data.classes[classId].line = line;
    }
    const ids = this.data.classItems[classId] ?? [];
    if (!ids.includes(markerId)) {
      this.setClassItem(classId, [...ids, markerId]);
      this.setClassAdded(classId, markerId, Date.now());
    }
    await this.commit();
    return classId;
  }

  async unassignClass(entries: Array<{ classId: string; markerId?: string }>): Promise<void> {
    for (const { classId, markerId } of entries) {
      if (!this.data.classes[classId]) {
        continue;
      }
      const ids = this.data.classItems[classId] ?? [];
      this.setClassItem(classId, markerId ? ids.filter((x) => x !== markerId) : []);
    }
    await this.commit();
  }

  /**
   * Move, copy, or reorder a class chip.
   * `blockOrder` is the desired class order in `toMarkerId`, including `classId`.
   */
  async moveClass(
    classId: string,
    fromMarkerId: string,
    toMarkerId: string,
    options: { copy?: boolean; blockOrder?: string[] } = {},
  ): Promise<boolean> {
    const copy = options.copy === true;
    const blockOrder = options.blockOrder ?? [];
    if (!this.data.classes[classId] || !this.data.markers[toMarkerId]) {
      return false;
    }

    if (fromMarkerId === toMarkerId) {
      if (blockOrder.length === 0 || !blockOrder.includes(classId)) {
        return false;
      }
      if (!this.applyClassBlockOrder(toMarkerId, blockOrder)) {
        return false;
      }
      await this.commit();
      return true;
    }

    const ids = this.data.classItems[classId] ?? [];
    if (ids.includes(toMarkerId)) {
      return false;
    }

    if (copy) {
      this.setClassItem(classId, [...ids, toMarkerId]);
    } else {
      const next = ids.filter((x) => x !== fromMarkerId);
      next.push(toMarkerId);
      this.setClassItem(classId, next);
    }

    const order =
      blockOrder.length > 0 && blockOrder.includes(classId)
        ? blockOrder
        : [...this.classesOf(toMarkerId).map(([id]) => id).filter((id) => id !== classId), classId];
    this.applyClassBlockOrder(toMarkerId, order);
    await this.commit();
    return true;
  }

  /**
   * Rewrite `added` timestamps for paths in `blockOrder` on this marker so
   * `itemsOf` keeps that relative order. Other paths on the marker stay as-is.
   * Returns false when the order already matches.
   */
  private applyItemBlockOrder(markerId: string, blockOrder: string[]): boolean {
    const unique = [...new Set(blockOrder.map(normalizePath))];
    if (unique.length === 0) {
      return false;
    }
    let same = true;
    const current = this.itemsOf(markerId).filter((p) => unique.includes(p));
    if (current.length !== unique.length || current.some((p, i) => p !== unique[i])) {
      same = false;
    }
    if (same) {
      return false;
    }
    const base = Date.now();
    unique.forEach((relPath, index) => {
      this.setAdded(relPath, markerId, base + index);
    });
    return true;
  }

  /** Same as applyItemBlockOrder for class chips. */
  private applyClassBlockOrder(markerId: string, blockOrder: string[]): boolean {
    const unique = [...new Set(blockOrder)];
    if (unique.length === 0) {
      return false;
    }
    const current = this.classesOf(markerId)
      .map(([id]) => id)
      .filter((id) => unique.includes(id));
    if (current.length === unique.length && current.every((id, i) => id === unique[i])) {
      return false;
    }
    const base = Date.now();
    unique.forEach((classId, index) => {
      this.setClassAdded(classId, markerId, base + index);
    });
    return true;
  }

  /** Renames a path and everything nested under it. Returns true if anything changed. */
  renamePath(oldRel: string, newRel: string): boolean {
    let changed = false;
    const prefix = oldRel + '/';
    for (const relPath of Object.keys(this.data.items)) {
      let next: string | undefined;
      if (relPath === oldRel) {
        next = newRel;
      } else if (relPath.startsWith(prefix)) {
        next = newRel + relPath.slice(oldRel.length);
      }
      if (next === undefined) {
        continue;
      }
      const merged = [...new Set([...(this.data.items[next] ?? []), ...this.data.items[relPath]])];
      const addedMerged = { ...this.data.added[next] };
      for (const [markerId, at] of Object.entries(this.data.added[relPath] ?? {})) {
        addedMerged[markerId] = Math.min(addedMerged[markerId] ?? at, at);
      }
      delete this.data.items[relPath];
      delete this.data.added[relPath];
      this.data.items[next] = merged;
      this.data.added[next] = addedMerged;
      changed = true;
    }
    for (const key of Object.keys(this.data.aliases)) {
      let next: string | undefined;
      if (key === oldRel) {
        next = newRel;
      } else if (key.startsWith(prefix)) {
        next = newRel + key.slice(oldRel.length);
      }
      if (next === undefined || next === key) {
        continue;
      }
      if (!this.data.aliases[next]) {
        this.data.aliases[next] = this.data.aliases[key];
      }
      delete this.data.aliases[key];
      changed = true;
    }
    for (const def of Object.values(this.data.classes)) {
      if (def.relPath === oldRel) {
        def.relPath = newRel;
        changed = true;
      } else if (def.relPath.startsWith(prefix)) {
        def.relPath = newRel + def.relPath.slice(oldRel.length);
        changed = true;
      }
    }
    return changed;
  }

  async commit(): Promise<void> {
    await this.enqueue(() => this.commitNow());
  }

  // ---- internals ----

  private watch(): void {
    for (const watcher of this.watchers) {
      watcher.dispose();
    }
    this.watchers = [];
    const attach = (relPath: string, onChange: () => void) => {
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(this.root, relPath),
      );
      watcher.onDidChange(onChange);
      watcher.onDidCreate(onChange);
      watcher.onDidDelete(onChange);
      this.watchers.push(watcher);
    };
    attach(BASE_PATH, () => {
      if (this.writingCatalog) {
        return;
      }
      this.scheduleDiskReload('catalog');
    });
    attach(`${PAGES_DIR}/*.json`, () => {
      if (this.writingCatalog) {
        return;
      }
      this.scheduleDiskReload('catalog');
    });
    attach(PROFILES_PATH, () => {
      if (this.writingProfiles) {
        return;
      }
      this.scheduleDiskReload('profiles');
    });
    attach(STYLES_PATH, () => {
      if (this.writingStyles) {
        return;
      }
      this.scheduleDiskReload('styles');
    });
  }

  /**
   * Folder deletion emits a file event per child. Wait until the burst ends,
   * then keep the files gone instead of writing them back one by one.
   */
  private scheduleDiskReload(kind: 'catalog' | 'profiles' | 'styles'): void {
    if (this.suspended) {
      return;
    }
    this.pendingDisk[kind] = true;
    if (this.externalTimer) {
      clearTimeout(this.externalTimer);
    }
    this.externalTimer = setTimeout(() => {
      this.externalTimer = undefined;
      const pending = this.pendingDisk;
      this.pendingDisk = { catalog: false, profiles: false, styles: false };
      void this.enqueue(() => this.reloadExternal(pending));
    }, 200);
  }

  private async reloadExternal(pending: {
    catalog: boolean;
    profiles: boolean;
    styles: boolean;
  }): Promise<void> {
    if (this.suspended) {
      return;
    }
    if (!(await fileExists(this.baseUri))) {
      this.forgetWorkspace();
      return;
    }
    if (pending.catalog && !this.writingCatalog) {
      await this.reloadFromDisk(false);
    }
    if (this.suspended) {
      return;
    }
    if (pending.profiles && !this.writingProfiles) {
      await this.reloadProfilesFromDisk();
    }
    if (this.suspended) {
      return;
    }
    if (pending.styles && !this.writingStyles) {
      await this.reloadStylesFromDisk();
    }
  }

  /** Drop the session when `.syn3` is gone. Does not write. */
  private forgetWorkspace(): void {
    if (this.suspended) {
      return;
    }
    this.suspended = true;
    this.allowCreate = false;
    this.historyReady = false;
    if (this.externalTimer) {
      clearTimeout(this.externalTimer);
      this.externalTimer = undefined;
    }
    this.pendingDisk = { catalog: false, profiles: false, styles: false };
    for (const watcher of this.watchers) {
      watcher.dispose();
    }
    this.watchers = [];
    this.data = emptyData();
    this.base = emptyBaseConfig();
    this.posLocal = emptyPositions();
    this.posRemote = emptyPositions();
    this.history = emptyHistory();
    this.present = '';
    this.baseline = undefined;
    this.pagePresent = {};
    this.dirtyPages.clear();
    this.pageCloud = {};
    this.pendingRemote = {};
    this.stopEmitter.fire();
  }

  /**
   * Move an older markers file into `.syn3/syn3.json`.
   * On write failure keeps reading the legacy file for this session.
   */
  private async migrateLegacyConfig(): Promise<void> {
    const newUri = vscode.Uri.joinPath(this.root, CONFIG_PATH);
    const configured = vscode.workspace.getConfiguration('vgroup').get<string>('configPath');
    const candidates = [
      ...(configured && !LEGACY_CONFIG_PATHS.includes(configured) && configured !== CONFIG_PATH ? [configured] : []),
      ...LEGACY_CONFIG_PATHS,
    ];
    let legacyRel: string | undefined;
    let legacyUri: vscode.Uri | undefined;
    for (const rel of candidates) {
      const uri = vscode.Uri.joinPath(this.root, rel);
      if (await fileExists(uri)) {
        legacyRel = rel;
        legacyUri = uri;
        break;
      }
    }

    const newExists = await fileExists(newUri);
    const legacyExists = legacyUri !== undefined;

    if (!legacyExists || !legacyUri || !legacyRel) {
      this.sessionConfigPath = CONFIG_PATH;
      return;
    }

    if (!newExists) {
      try {
        await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(newUri, '..'));
        const raw = await vscode.workspace.fs.readFile(legacyUri);
        await vscode.workspace.fs.writeFile(newUri, raw);
        await vscode.workspace.fs.delete(legacyUri);
        this.sessionConfigPath = CONFIG_PATH;
      } catch (error) {
        this.sessionConfigPath = legacyRel;
        void vscode.window.showWarningMessage(
          `Syn3: не удалось перенести маркеры в ${CONFIG_PATH} — читаю ${legacyRel}. ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
      return;
    }

    const overwrite = 'Перезаписать';
    const keep = 'Оставить';
    const choice = await vscode.window.showWarningMessage(
      `Syn3: найдены и ${CONFIG_PATH}, и ${legacyRel}. Перезаписать новый файл старым или оставить ${CONFIG_PATH}?`,
      overwrite,
      keep,
    );
    if (choice === overwrite) {
      try {
        const raw = await vscode.workspace.fs.readFile(legacyUri);
        await vscode.workspace.fs.writeFile(newUri, raw);
        await vscode.workspace.fs.delete(legacyUri);
      } catch (error) {
        void vscode.window.showWarningMessage(
          `Syn3: не удалось перезаписать ${CONFIG_PATH}. ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    } else if (choice === keep) {
      const bakUri = vscode.Uri.joinPath(this.root, `${legacyRel}.bak`);
      try {
        await vscode.workspace.fs.rename(legacyUri, bakUri, { overwrite: true });
      } catch {
        // Leaving the legacy file is fine; next launch will ask again.
      }
    }
    this.sessionConfigPath = CONFIG_PATH;
  }

  /** Undo stack used to live beside the old markers file. */
  private async migrateHistory(): Promise<void> {
    const next = vscode.Uri.joinPath(this.root, HISTORY_PATH);
    if (await fileExists(next)) {
      return;
    }
    const legacy = vscode.Uri.joinPath(this.root, LEGACY_HISTORY_PATH);
    if (!(await fileExists(legacy))) {
      return;
    }
    try {
      await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(next, '..'));
      await vscode.workspace.fs.writeFile(next, await vscode.workspace.fs.readFile(legacy));
      await vscode.workspace.fs.delete(legacy);
    } catch {
      // The undo stack is local. Leaving the old file is enough.
    }
  }

  private enqueue(task: () => Promise<void>): Promise<void> {
    const run = this.queue.then(task, task);
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private enqueueResult<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async reloadFromDisk(notify: boolean): Promise<void> {
    this.usingSplitConfig = true;
    if (!(await fileExists(this.baseUri))) {
      if (!this.allowCreate || this.suspended) {
        this.forgetWorkspace();
        return;
      }
      this.allowCreate = false;
      this.data = emptyData();
      this.base = this.buildBaseFromCurrentPages('');
      this.pageCloud = {};
      this.pendingRemote = {};
      this.surfacesNeedLegacyHydration = true;
      this.lastError = undefined;
      await this.persistSplitConfig();
      if (this.suspended) {
        return;
      }
      this.present = this.capture();
      this.baseline = undefined;
      this.pagePresent = this.captureAllPageSnapshots();
      if (notify || !this.historyReady) {
        this.changeEmitter.fire();
      }
      return;
    }
    const previous = this.present;
    await this.reloadSplitFromDisk(false);
    if (this.remapOutOfPaletteLinkColors()) {
      await this.commitNow();
      return;
    }
    if (this.historyReady && previous && previous !== this.present) {
      this.history = emptyHistory();
      await this.persistHistory();
    }
    if (notify || !this.historyReady) {
      this.changeEmitter.fire();
    }
  }

  private async loadHistory(): Promise<void> {
    this.pagePresent = this.captureAllPageSnapshots();
    const cursors = this.pageCursors();
    const legacyCursors: Record<string, string> = {};
    for (const [pageId] of this.pages()) {
      legacyCursors[pageId] = fingerprint(this.capturePageSnapshot(pageId, true));
    }
    try {
      const raw = await vscode.workspace.fs.readFile(this.historyUri);
      this.history = decodeHistory(Buffer.from(raw).toString('utf8'), cursors, legacyCursors);
    } catch (error) {
      if (!isFileNotFound(error)) {
        console.error('Syn3 history:', error);
      }
      this.history = emptyHistory();
    }
  }

  /** Load profiles.json and styles.json. Missing files are seeded with defaults. */
  private async loadProfilesAndStyles(): Promise<void> {
    const project = this.activeProject();
    if (this.usingSplitConfig && Object.keys(this.base.profiles).length > 0) {
      const unpacked = unpackProfilesFromBase(this.base, project);
      this.profilesData = { version: 1, profiles: unpacked.profiles };
      this.stylesData = { version: 1, styles: unpacked.styles };
      this.ensureGeneralProfile(
        this.stylesData.styles[GENERAL_PROFILE_ID]?.appearance ?? DEFAULT_APPEARANCE,
        this.data.surfaces.open,
      );
      // Reload must not remirror/bump into project.profiles: that changes the
      // baseClean fingerprint and falsely lights Send after every IDE restart.
      const machineChanged = this.bindMachineToProfiles();
      this.mirrorActiveOpenToSurfaces();
      await this.syncReviewAccessFromProject();
      await this.persistProfiles(false, machineChanged);
      await this.persistStyles(false, machineChanged);
      return;
    }
    const stylesExist = await fileExists(this.stylesUri);
    const profilesExist = await fileExists(this.profilesUri);
    const seed = normalizeAppearance(this.data.appearance);
    const seedOpen = { ...this.data.surfaces.open };

    if (!stylesExist) {
      this.stylesData = emptyStyles(seed, seedOpen);
      this.profilesData = emptyProfiles();
      this.bindMachineToProfiles();
      this.mirrorActiveOpenToSurfaces();
      await this.persistStyles(false);
      await this.persistProfiles(false);
      return;
    }

    await this.reloadStylesFromDisk(false, seedOpen);
    if (!profilesExist) {
      const ids = Object.keys(this.stylesData.styles);
      if (!ids.includes(GENERAL_PROFILE_ID)) {
        this.stylesData.styles[GENERAL_PROFILE_ID] = {
          appearance: seed,
          open: { ...seedOpen },
        };
      }
      this.profilesData = {
        version: 1,
        profiles: [
          { id: GENERAL_PROFILE_ID, name: GENERAL_PROFILE_NAME, sProfileIds: [] },
          ...ids
            .filter((id) => id !== GENERAL_PROFILE_ID)
            .map((id) => ({ id, name: id, sProfileIds: [] as string[] })),
        ],
      };
      this.bindMachineToProfiles();
      await this.persistProfiles(false);
      await this.persistStyles(false);
    } else {
      await this.reloadProfilesFromDisk(false, seedOpen);
    }
    this.ensureGeneralProfile(seed, seedOpen);
    const machineChanged = this.bindMachineToProfiles();
    this.mirrorActiveOpenToSurfaces();
    if (machineChanged) {
      await this.persistProfiles(false);
    }
    await this.persistStyles(false, machineChanged);
  }

  private async reloadProfilesFromDisk(notify = true, seedOpen?: PanelOpenState): Promise<void> {
    try {
      const raw = Buffer.from(await vscode.workspace.fs.readFile(this.profilesUri)).toString('utf8');
      this.profilesData = normalizeProfiles(JSON.parse(raw));
    } catch (error) {
      if (!isFileNotFound(error)) {
        console.error('Syn3 profiles:', error);
      }
      this.profilesData = emptyProfiles();
    }
    const seed = this.stylesData.styles[GENERAL_PROFILE_ID]?.appearance ?? DEFAULT_APPEARANCE;
    this.ensureGeneralProfile(seed, seedOpen ?? this.data.surfaces.open);
    if (this.bindMachineToProfiles()) {
      await this.persistProfiles(false);
    }
    this.mirrorActiveOpenToSurfaces();
    if (notify) {
      this.changeEmitter.fire();
    }
  }

  private async reloadStylesFromDisk(notify = true, seedOpen?: PanelOpenState): Promise<void> {
    const fallbackOpen = seedOpen ?? this.data.surfaces.open;
    try {
      const raw = Buffer.from(await vscode.workspace.fs.readFile(this.stylesUri)).toString('utf8');
      this.stylesData = normalizeStyles(JSON.parse(raw), fallbackOpen);
    } catch (error) {
      if (!isFileNotFound(error)) {
        console.error('Syn3 styles:', error);
      }
      this.stylesData = emptyStyles(this.data.appearance, fallbackOpen);
    }
    const seed = this.stylesData.styles[GENERAL_PROFILE_ID]?.appearance ?? DEFAULT_APPEARANCE;
    this.ensureGeneralProfile(seed, fallbackOpen);
    this.mirrorActiveOpenToSurfaces();
    if (notify) {
      this.changeEmitter.fire();
    }
  }

  private ensureGeneralProfile(seed: Appearance, seedOpen: PanelOpenState = emptyPanelOpen()): void {
    const existing = this.profilesData.profiles.find((p) => p.id === GENERAL_PROFILE_ID);
    if (!existing) {
      this.profilesData.profiles.unshift({
        id: GENERAL_PROFILE_ID,
        name: GENERAL_PROFILE_NAME,
        sProfileIds: [],
      });
    } else {
      // Keep the same object. Rebuilding it used to drop review paths, models,
      // and git nicks, so Enter in review settings looked saved and then vanished.
      existing.name = GENERAL_PROFILE_NAME;
      if (this.profilesData.profiles[0]?.id !== GENERAL_PROFILE_ID) {
        this.profilesData.profiles = [
          existing,
          ...this.profilesData.profiles.filter((p) => p.id !== GENERAL_PROFILE_ID),
        ];
      }
    }
    if (!this.stylesData.styles[GENERAL_PROFILE_ID]) {
      this.stylesData.styles[GENERAL_PROFILE_ID] = {
        appearance: normalizeAppearance(seed),
        open: { ...seedOpen },
      };
    }
  }

  private ensureActiveProfileId(): string {
    this.ensureGeneralProfile(DEFAULT_APPEARANCE, this.data.surfaces.open);
    if (!this.profilesData.profiles.some((p) => p.id === this.activeId)) {
      this.moveMachineToProfile(GENERAL_PROFILE_ID);
    }
    return this.activeId;
  }

  /**
   * Resolve this machine's active profile from `sProfileIds`.
   * Exactly one owner → use it. Zero or many → strip our hash, leave «Общий» selected
   * without writing the hash (picker / create binds later).
   * @returns true when profiles were mutated and should be persisted.
   */
  private bindMachineToProfiles(): boolean {
    const hash = hashMachineId();
    const owners = this.profilesData.profiles.filter((p) => p.sProfileIds.includes(hash));
    if (owners.length === 1) {
      this.activeId = owners[0].id;
      return false;
    }
    let changed = false;
    for (const profile of this.profilesData.profiles) {
      const next = profile.sProfileIds.filter((id) => id !== hash);
      if (next.length !== profile.sProfileIds.length) {
        profile.sProfileIds = next;
        changed = true;
      }
    }
    this.activeId = GENERAL_PROFILE_ID;
    return changed;
  }

  /** Move this machine's hash onto `profileId`; leave other machines untouched. */
  private moveMachineToProfile(profileId: string): void {
    const hash = hashMachineId();
    for (const profile of this.profilesData.profiles) {
      profile.sProfileIds = profile.sProfileIds.filter((id) => id !== hash);
    }
    const target = this.profilesData.profiles.find((p) => p.id === profileId);
    if (target) {
      target.sProfileIds.push(hash);
      this.activeId = profileId;
    } else {
      const general = this.profilesData.profiles.find((p) => p.id === GENERAL_PROFILE_ID);
      if (general) {
        general.sProfileIds.push(hash);
      }
      this.activeId = GENERAL_PROFILE_ID;
    }
  }

  /** Keep syn3.json `surfaces.open` mirrored for capture / legacy readers. */
  private mirrorActiveOpenToSurfaces(): void {
    this.data.surfaces.open = { ...this.activeProfileStyle().open };
  }

  private uniqueProfileId(name: string): string {
    const base =
      'profile-' +
      (name
        .toLowerCase()
        .replace(/[^a-z0-9а-яё]+/gi, '-')
        .replace(/^-+|-+$/g, '') || 'profile');
    let id = base;
    let counter = 2;
    const taken = new Set(this.profilesData.profiles.map((p) => p.id));
    while (taken.has(id) || id === GENERAL_PROFILE_ID) {
      id = `${base}-${counter++}`;
    }
    return id;
  }

  private async discordToken(): Promise<string | undefined> {
    if (!this.secrets) {
      return undefined;
    }
    return getSecret(this.secrets, SECRET_DISCORD);
  }

  private async refreshCloudHints(): Promise<string[]> {
    if (this.cloudHintFlight) {
      return this.cloudHintFlight;
    }
    this.cloudHintFlight = this.refreshCloudHintsNow().finally(() => {
      this.cloudHintFlight = undefined;
    });
    return this.cloudHintFlight;
  }

  private async refreshCloudHintsNow(): Promise<string[]> {
    if (this.suspended) {
      return [];
    }
    const errors: string[] = [];
    const previousPending = Object.keys(this.pendingRemote).sort().join('\0');
    this.pendingRemote = {};
    const token = await this.discordToken();
    if (!token) {
      if (previousPending) {
        this.changeEmitter.fire();
      }
      return ['Discord token is not set'];
    }
    let changed = false;
    const baseChannel = this.base.channelId.trim();
    if (baseChannel) {
      const latest = await findLatestConfigMessage(token, baseChannel, 'BASE', undefined);
      if (!latest.ok) {
        errors.push(latest.message);
      } else if (latest.value) {
        let newer = false;
        let relevant = false;
        const downloaded = await downloadConfigAttachment(token, latest.value.attachmentUrl);
        if (downloaded.ok) {
          try {
            const raw = JSON.parse(downloaded.value) as unknown;
            if (!isLegacyBaseRaw(raw)) {
              const remote = normalizeBaseConfig(raw);
              newer =
                !!remote.snapshot &&
                remote.snapshot !== this.base.snapshot &&
                Object.keys(remote.projects).length > 0;
              relevant = newer && this.relevantSliceDiffers(remote);
            }
          } catch {
            newer = true;
            relevant = true;
          }
        } else {
          newer = true;
          relevant = true;
        }
        if (this.baseCloudNewer !== newer || this.relevantBaseCloudNewer !== relevant) {
          this.baseCloudNewer = newer;
          this.relevantBaseCloudNewer = relevant;
          changed = true;
        }
      }
    }
    const seen = new Set<string>();
    const scan = async (channel: string, kind: 'EXPLORER' | 'NOTES' | 'LINKS' | 'REVIEW') => {
      const key = `${kind}:${channel}`;
      if (!channel || seen.has(key)) {
        return;
      }
      seen.add(key);
      const listed = await findLatestPageMessages(
        token,
        channel,
        kind,
        this.pageIdsInChannel(kind, channel),
      );
      if (!listed.ok) {
        errors.push(listed.message);
        return;
      }
      for (const latest of listed.value) {
        const pageId = latest.header.pageId;
        if (!pageId) {
          continue;
        }
        if (!this.data.pages[pageId]) {
          const downloaded = await downloadConfigAttachment(token, latest.attachmentUrl);
          if (!downloaded.ok) {
            errors.push(downloaded.message);
            continue;
          }
          let remoteFile: PageContentFile;
          try {
            remoteFile = normalizePageConfig(JSON.parse(downloaded.value));
          } catch (error) {
            errors.push(error instanceof Error ? error.message : String(error));
            continue;
          }
          if (remoteFile.deleted || (remoteFile.pageId && remoteFile.pageId !== pageId)) {
            continue;
          }
          this.pendingRemote[pageId] = {
            file: remoteFile,
            stamp: stampFromLatest(latest),
          };
          continue;
        }
        const newer = latestIsNewer(latest, this.pageCloud[pageId]);
        if (!!this.pageCloudNewer[pageId] !== newer) {
          this.pageCloudNewer[pageId] = newer;
          changed = true;
        }
      }
    };
    // Review channel stores MR messages, not page content configs.
    for (const kind of ['EXPLORER', 'NOTES', 'LINKS'] as const) {
      const channel = resolveProjectChannel(this.activeProjectChannels(), kind);
      await scan(channel, kind);
    }
    const pending = { ...(this.posLocal.pageTombstones ?? {}) };
    for (const [pageId, tomb] of Object.entries(pending)) {
      await this.postPageTombstone(pageId, tomb);
    }
    const nextPending = Object.keys(this.pendingRemote).sort().join('\0');
    if (changed || previousPending !== nextPending) {
      this.changeEmitter.fire();
    }
    return errors;
  }

  /** Local pages of this kind whose messages are posted to `channel`. */
  private pageIdsInChannel(
    kind: 'EXPLORER' | 'NOTES' | 'LINKS' | 'REVIEW',
    channel: string,
  ): string[] {
    const ids: string[] = [];
    for (const [pageId, page] of Object.entries(this.data.pages)) {
      if (pageKindToConfigKind(page.kind) !== kind) {
        continue;
      }
      if (kind === 'REVIEW' && page.kind !== 'review') {
        continue;
      }
      ids.push(pageId);
    }
    return ids;
  }

  /** Take a page that exists only in its channel. Does not mark the page dirty. */
  private async adoptRemotePage(
    pageId: string,
    remoteFile: PageContentFile,
    stamp: CloudStamp,
  ): Promise<void> {
    await this.enqueue(async () => {
      await this.adoptRemotePageNow(pageId, remoteFile, stamp);
    });
  }

  private async adoptRemotePageNow(
    pageId: string,
    remoteFile: PageContentFile,
    stamp: CloudStamp,
  ): Promise<void> {
    if (this.data.pages[pageId] || remoteFile.deleted) {
      return;
    }
    await this.applyRemotePageFile(pageId, remoteFile, stamp, []);
    this.present = this.capture();
    this.pagePresent = this.captureAllPageSnapshots();
    this.dirtyPages.delete(pageId);
    this.pageCloudNewer[pageId] = false;
    this.rememberPageClean(pageId);
    await this.persistPosLocal();
    this.changeEmitter.fire();
  }

  private async postPageTombstone(pageId: string, tomb: PageTombstone): Promise<void> {
    const token = await this.discordToken();
    if (!token) {
      await this.rememberTombstone(pageId, tomb);
      return;
    }
    const posted = await postConfigMessage({
      token,
      channelId: tomb.channelId,
      kind: tomb.kind,
      pageId,
      number: (tomb.number || 0) + 1,
      filename: `${pageId}.json`,
      body:
        JSON.stringify(
          {
            version: 1,
            pageId,
            deleted: true,
            page: { name: tomb.name, kind: tomb.pageKind, order: tomb.order },
          },
          null,
          2,
        ) + '\n',
    });
    if (!posted.ok) {
      await this.rememberTombstone(pageId, tomb);
      return;
    }
    await this.forgetTombstone(pageId);
  }

  private async rememberTombstone(pageId: string, tomb: PageTombstone): Promise<void> {
    await this.enqueue(async () => {
      if (!this.posLocal.pageTombstones) {
        this.posLocal.pageTombstones = {};
      }
      this.posLocal.pageTombstones[pageId] = tomb;
      await this.persistPosLocal();
    });
  }

  private async forgetTombstone(pageId: string): Promise<void> {
    await this.enqueue(async () => {
      if (!this.posLocal.pageTombstones?.[pageId]) {
        return;
      }
      delete this.posLocal.pageTombstones[pageId];
      if (Object.keys(this.posLocal.pageTombstones).length === 0) {
        delete this.posLocal.pageTombstones;
      }
      await this.persistPosLocal();
    });
  }

  private async pushPageConfigNow(
    pageId: string,
    force = false,
  ): Promise<{ ok: boolean; message?: string }> {
    const page = this.data.pages[pageId];
    if (!page) {
      return { ok: false, message: 'Page not found' };
    }
    if (page.kind === 'review') {
      return { ok: false, message: 'Review pages have no content push' };
    }
    if (this.pageCloudNewer[pageId]) {
      return { ok: false, message: 'cloudPullFirst' };
    }
    if (this.pageContentLockedOut()) {
      return { ok: false, message: 'projectLocked' };
    }
    if (!force && !this.dirtyPages.has(pageId)) {
      return { ok: false, message: 'Nothing to push' };
    }
    const kind = pageKindToConfigKind(page.kind);
    if (!kind || kind === 'REVIEW' || kind === 'BASE') {
      return { ok: false, message: 'Unsupported page kind' };
    }
    const token = await this.discordToken();
    if (!token) {
      return { ok: false, message: 'Discord token is not set' };
    }
    const channel = this.resolvePageChannel(pageId, kind);
    if (!channel) {
      return { ok: false, message: 'Discord channel is not set' };
    }
    const packed = this.packPageFile(pageId);
    if (!packed) {
      return { ok: false, message: 'Cannot pack page' };
    }
    const number = nextConfigNumber(this.pageCloud[pageId]);
    const headerDate = formatConfigHeaderDate();
    const posted = await postConfigMessage({
      token,
      channelId: channel,
      kind,
      pageId,
      number,
      headerDate,
      filename: `${pageId}.json`,
      body: stringifyPageConfig({ ...packed, cloud: undefined }),
    });
    if (!posted.ok) {
      return { ok: false, message: posted.message };
    }
    const parsed = parseConfigHeader(posted.value.content);
    this.pageCloud[pageId] = parsed
      ? {
          number: parsed.number,
          headerDate: parsed.headerDate,
          messageId: posted.value.id,
        }
      : {
          number,
          headerDate,
          messageId: posted.value.id,
        };
    this.dirtyPages.delete(pageId);
    this.pageCloudNewer[pageId] = false;
    if (this.posLocal.drafts?.[pageId]) {
      delete this.posLocal.drafts[pageId];
    }
    this.rememberPageClean(pageId);
    await this.persistPosLocal();
    await this.persistSplitConfig();
    this.present = this.capture();
    this.changeEmitter.fire();
    void this.refreshCloudHints();
    return { ok: true };
  }

  private async pushDirtyPageConfigsNow(): Promise<{
    ok: boolean;
    message?: string;
    pushed: number;
  }> {
    const ids = this.pages()
      .map(([id]) => id)
      .filter((id) => this.configSync(id).canPush);
    return this.pushPageIds(ids, false);
  }

  private async pushWorkspaceCloudNow(): Promise<{ ok: boolean; message?: string }> {
    const baseDirty =
      this.profileDirty ||
      this.profileSliceDrift() ||
      this.projectDirty ||
      this.projectSliceDrift() ||
      this.baseNeedsFirstPublish();
    const dirtyPageIds = this.pages()
      .map(([id]) => id)
      .filter((id) => this.configSync(id).canPush);
    if (baseDirty && this.relevantBaseCloudNewer) {
      return { ok: false, message: 'cloudPullFirst' };
    }
    for (const id of dirtyPageIds) {
      if (this.pageCloudNewer[id]) {
        return { ok: false, message: 'cloudPullFirst' };
      }
    }
    if (baseDirty) {
      const base = await this.pushProfileConfigNow();
      if (!base.ok) {
        return base;
      }
    }
    if (dirtyPageIds.length === 0) {
      return { ok: true };
    }
    const pages = await this.pushPageIds(dirtyPageIds, false);
    return { ok: pages.ok, message: pages.message };
  }

  private async pullWorkspaceCloudNow(): Promise<{ ok: boolean; message?: string }> {
    const newerPageIds = this.pages()
      .map(([id]) => id)
      .filter((id) => !!this.pageCloudNewer[id]);
    const pendingSnapshot = Object.entries(this.pendingRemote).flatMap(([pageId, pending]) =>
      pending ? [[pageId, pending] as const] : [],
    );
    if (this.relevantBaseCloudNewer || this.baseCloudNewer) {
      const base = await this.pullProfileConfigNow(undefined, { skipPages: true });
      if (!base.ok && base.message && base.message !== 'Nothing to pull') {
        return { ok: false, message: base.message };
      }
    }
    const lines: string[] = [];
    for (const id of newerPageIds) {
      if (!this.data.pages[id]) {
        continue;
      }
      const result = await this.pullPageConfigNow(id, true);
      if (result.ok || !result.message || result.message === 'Nothing to pull') {
        continue;
      }
      const name = this.data.pages[id]?.name?.trim() || id;
      lines.push(`${name}\t${result.message}`);
    }
    for (const [pageId, pending] of pendingSnapshot) {
      if (this.data.pages[pageId]) {
        delete this.pendingRemote[pageId];
        continue;
      }
      try {
        await this.adoptRemotePageNow(pageId, pending.file, pending.stamp);
        delete this.pendingRemote[pageId];
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        lines.push(`${pageId}\t${detail}`);
      }
    }
    if (lines.length === 0) {
      return { ok: true };
    }
    return { ok: false, message: lines.join('\n') };
  }

  private async pushPageIds(
    ids: string[],
    force: boolean,
  ): Promise<{ ok: boolean; message?: string; pushed: number }> {
    const lines: string[] = [];
    let pushed = 0;
    for (const id of ids) {
      const result = await this.pushPageConfigNow(id, force);
      if (result.ok) {
        pushed += 1;
        continue;
      }
      if (
        !result.message ||
        result.message === 'Nothing to push' ||
        result.message === 'Unsupported page kind'
      ) {
        continue;
      }
      const name = this.data.pages[id]?.name?.trim() || id;
      lines.push(`${name}\t${result.message}`);
    }
    if (lines.length === 0) {
      return { ok: true, pushed };
    }
    return { ok: false, message: lines.join('\n'), pushed };
  }

  private async pullNewerPageConfigsNow(): Promise<{ ok: boolean; message?: string }> {
    const ids = this.pages()
      .map(([id]) => id)
      .filter((id) => this.configSync(id).canPull);
    const lines: string[] = [];
    for (const id of ids) {
      const result = await this.pullPageConfigNow(id);
      if (result.ok || !result.message || result.message === 'Nothing to pull') {
        continue;
      }
      const name = this.data.pages[id]?.name?.trim() || id;
      lines.push(`${name}\t${result.message}`);
    }
    const pendingIds = Object.keys(this.pendingRemote);
    for (const pageId of pendingIds) {
      const pending = this.pendingRemote[pageId];
      if (!pending) {
        continue;
      }
      try {
        await this.adoptRemotePageNow(pageId, pending.file, pending.stamp);
        delete this.pendingRemote[pageId];
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        const name = this.data.pages[pageId]?.name?.trim() || pageId;
        lines.push(`${name}\t${detail}`);
      }
    }
    if (lines.length === 0) {
      return { ok: true };
    }
    return { ok: false, message: lines.join('\n') };
  }

  private async pullPageConfigNow(
    pageId: string,
    force = false,
  ): Promise<{ ok: boolean; message?: string }> {
    const page = this.data.pages[pageId];
    if (!page) {
      return { ok: false, message: 'Page not found' };
    }
    if (!force && !this.pageCloudNewer[pageId] && this.pageCloud[pageId]) {
      // Still allow pull when a newer tip exists; refresh first.
      await this.refreshCloudHints();
      if (!this.pageCloudNewer[pageId]) {
        return { ok: false, message: 'Nothing to pull' };
      }
    }
    const kind = pageKindToConfigKind(page.kind);
    if (!kind) {
      return { ok: false, message: 'Unsupported page kind' };
    }
    const token = await this.discordToken();
    if (!token) {
      return { ok: false, message: 'Discord token is not set' };
    }
    const channel = this.resolvePageChannel(pageId, kind);
    if (!channel) {
      return { ok: false, message: 'Discord channel is not set' };
    }
    const latest = await findLatestConfigMessage(token, channel, kind, pageId);
    if (!latest.ok) {
      return { ok: false, message: latest.message };
    }
    if (!latest.value) {
      return { ok: false, message: 'No cloud config found' };
    }
    const downloaded = await downloadConfigAttachment(token, latest.value.attachmentUrl);
    if (!downloaded.ok) {
      return { ok: false, message: downloaded.message };
    }
    let remoteFile: PageContentFile;
    try {
      remoteFile = normalizePageConfig(JSON.parse(downloaded.value));
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
    if (remoteFile.pageId && remoteFile.pageId !== pageId) {
      return { ok: false, message: 'Page config does not match this page' };
    }
    if (remoteFile.deleted) {
      await this.erasePageNow(pageId);
      this.pageCloudNewer[pageId] = false;
      delete this.pageCloud[pageId];
      this.present = this.capture();
      this.pagePresent = this.captureAllPageSnapshots();
      await this.persistPosLocal();
      this.changeEmitter.fire();
      return { ok: true };
    }
    const localDirty = !force && this.dirtyPages.has(pageId);
    const stamp = stampFromLatest(latest.value);
    if (!localDirty) {
      await this.applyRemotePageFile(pageId, remoteFile, stamp, []);
    } else {
      const localPacked = this.packPageFile(pageId);
      const draftIds: string[] = [];
      if (localPacked) {
        const localMarkers = localPacked.markers ?? {};
        const cloudMarkers = remoteFile.markers ?? {};
        for (const id of Object.keys(localMarkers)) {
          if (!(id in cloudMarkers)) {
            draftIds.push(id);
            remoteFile.markers = remoteFile.markers ?? {};
            remoteFile.markers[id] = localMarkers[id];
          }
        }
        const localNotes = localPacked.notes ?? {};
        const cloudNotes = remoteFile.notes ?? {};
        for (const id of Object.keys(localNotes)) {
          if (!(id in cloudNotes)) {
            draftIds.push(id);
            remoteFile.notes = remoteFile.notes ?? {};
            remoteFile.notes[id] = localNotes[id];
          }
        }
        const localLinks = localPacked.links ?? {};
        const cloudLinks = remoteFile.links ?? {};
        for (const id of Object.keys(localLinks)) {
          if (!(id in cloudLinks)) {
            draftIds.push(id);
            remoteFile.links = remoteFile.links ?? {};
            remoteFile.links[id] = localLinks[id];
          }
        }
        // Append draft orders after cloud entities.
        let maxOrder = 0;
        for (const entry of Object.values(remoteFile.markers ?? {})) {
          if (entry.order > maxOrder) {
            maxOrder = entry.order;
          }
        }
        for (const entry of Object.values(remoteFile.notes ?? {})) {
          if (entry.order > maxOrder) {
            maxOrder = entry.order;
          }
        }
        for (const entry of Object.values(remoteFile.links ?? {})) {
          if (entry.order > maxOrder) {
            maxOrder = entry.order;
          }
        }
        draftIds.sort();
        draftIds.forEach((id, index) => {
          if (remoteFile.markers?.[id]) {
            remoteFile.markers[id].order = maxOrder + index + 1;
          } else if (remoteFile.notes?.[id]) {
            remoteFile.notes[id].order = maxOrder + index + 1;
          } else if (remoteFile.links?.[id]) {
            remoteFile.links[id].order = maxOrder + index + 1;
          }
        });
      }
      await this.applyRemotePageFile(pageId, remoteFile, stamp, draftIds);
    }
    this.pageCloudNewer[pageId] = false;
    this.dirtyPages.delete(pageId);
    this.present = this.capture();
    this.pagePresent = this.captureAllPageSnapshots();
    this.rememberPageClean(pageId);
    await this.persistPosLocal();
    this.changeEmitter.fire();
    return { ok: true };
  }

  private async applyRemotePageFile(
    pageId: string,
    remoteFile: PageContentFile,
    stamp: CloudStamp,
    draftIds: string[],
  ): Promise<void> {
    // Rebuild this page's entities from the remote file while keeping other pages.
    const keepMarkers = new Set(
      Object.keys(this.data.markers).filter((id) => this.pageOf(id) !== pageId),
    );
    const keepNotes = new Set(
      Object.keys(this.data.notes).filter((id) => this.pageOfNote(id) !== pageId),
    );
    const keepLinks = new Set(
      Object.keys(this.data.links).filter((id) => {
        const link = this.data.links[id];
        if (!link) {
          return false;
        }
        if (link.page === pageId) {
          return false;
        }
        let current: string | undefined = link.parent;
        const seen = new Set<string>();
        while (current && this.data.links[current] && !seen.has(current)) {
          seen.add(current);
          if (this.data.links[current].page === pageId) {
            return false;
          }
          current = this.data.links[current].parent;
        }
        return true;
      }),
    );

    for (const id of Object.keys(this.data.markers)) {
      if (!keepMarkers.has(id)) {
        delete this.data.markers[id];
      }
    }
    for (const id of Object.keys(this.data.notes)) {
      if (!keepNotes.has(id)) {
        delete this.data.notes[id];
      }
    }
    for (const id of Object.keys(this.data.links)) {
      if (!keepLinks.has(id)) {
        delete this.data.links[id];
      }
    }

    // Drop items/classes that only belonged to removed markers.
    for (const relPath of Object.keys(this.data.items)) {
      const ids = (this.data.items[relPath] ?? []).filter((id) => this.data.markers[id]);
      if (ids.length === 0) {
        delete this.data.items[relPath];
        delete this.data.added[relPath];
      } else {
        this.data.items[relPath] = ids;
      }
    }

    const legacy = remoteFile as PageContentFile & {
      page?: {
        name?: string;
        kind?: PageKind;
        order?: number;
        layout?: MapLayout;
        groupsLayout?: GroupsLayout;
        description?: string;
      };
      access?: PageAccessConfig;
    };
    const meta = this.activeProject()?.pages[pageId];
    const legacyPage = legacy.page;
    if (!this.data.pages[pageId]) {
      this.data.pages[pageId] = {
        name: meta?.name || legacyPage?.name || pageId,
        kind: meta?.kind || legacyPage?.kind || 'files',
        order: meta?.order ?? (typeof legacyPage?.order === 'number' ? legacyPage.order : 0),
        layout: legacyPage?.layout || 'chips',
        groupsLayout: legacyPage?.groupsLayout || 'flow',
        collapsed: emptyCollapsed(),
        ...(meta?.description || legacyPage?.description
          ? { description: meta?.description || legacyPage?.description }
          : {}),
      };
    }
    const page = this.data.pages[pageId];
    if (page && meta) {
      page.name = meta.name || page.name;
      page.kind = meta.kind || page.kind;
      page.order = meta.order;
      if (meta.description) {
        page.description = meta.description;
      } else {
        delete page.description;
      }
    } else if (page && legacyPage) {
      page.name = legacyPage.name || page.name;
      page.kind = legacyPage.kind || page.kind;
      if (typeof legacyPage.order === 'number') {
        page.order = legacyPage.order;
      }
      page.layout = legacyPage.layout || page.layout;
      page.groupsLayout = legacyPage.groupsLayout || page.groupsLayout;
      if (legacyPage.description) {
        page.description = legacyPage.description;
      } else {
        delete page.description;
      }
    }
    const projectRepo = this.activeProject()?.repo;
    const accessBody = projectRepo ?? legacy.access;
    if (accessBody) {
      const repoUrl =
        'repoUrl' in accessBody ? accessBody.repoUrl : (accessBody as PageAccessConfig).repoUrl;
      await this.accessStore?.setPage(pageId, {
        provider: accessBody.provider,
        channelId: this.reviewChannelId(),
        repoUrl,
      });
    }

    for (const [id, def] of Object.entries(remoteFile.markers ?? {})) {
      this.data.markers[id] = {
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
    for (const [relPath, ids] of Object.entries(remoteFile.items ?? {})) {
      const merged = new Set([...(this.data.items[relPath] ?? []), ...ids]);
      this.data.items[relPath] = [...merged];
    }
    for (const [relPath, dates] of Object.entries(remoteFile.added ?? {})) {
      this.data.added[relPath] = { ...(this.data.added[relPath] ?? {}), ...dates };
    }
    for (const [relPath, alias] of Object.entries(remoteFile.aliases ?? {})) {
      this.data.aliases[relPath] = alias;
    }
    for (const [classId, def] of Object.entries(remoteFile.classes ?? {})) {
      this.data.classes[classId] = def;
    }
    for (const [classId, ids] of Object.entries(remoteFile.classItems ?? {})) {
      const merged = new Set([...(this.data.classItems[classId] ?? []), ...ids]);
      this.data.classItems[classId] = [...merged];
    }
    for (const [classId, dates] of Object.entries(remoteFile.classAdded ?? {})) {
      this.data.classAdded[classId] = { ...(this.data.classAdded[classId] ?? {}), ...dates };
    }
    for (const [id, def] of Object.entries(remoteFile.notes ?? {})) {
      this.data.notes[id] = {
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
    for (const [id, def] of Object.entries(remoteFile.links ?? {})) {
      this.data.links[id] = {
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

    this.pageCloud[pageId] = stamp;
    if (draftIds.length > 0) {
      if (!this.posLocal.drafts) {
        this.posLocal.drafts = {};
      }
      this.posLocal.drafts[pageId] = draftIds;
    } else if (this.posLocal.drafts?.[pageId]) {
      delete this.posLocal.drafts[pageId];
    }
    await this.persistSplitConfig();
    await this.persistPosLocal();
  }

  private async pushProfileConfigNow(): Promise<{ ok: boolean; message?: string }> {
    if (this.pageContentLockedOut()) {
      return { ok: false, message: 'projectLocked' };
    }
    const firstPublish = this.baseNeedsFirstPublish();
    // A local snapshot rewrite (new page, channel) is not a remote update.
    // Accept lights only when this profile's slice version in Discord is higher.
    if (this.relevantBaseCloudNewer && !firstPublish) {
      return { ok: false, message: 'cloudPullFirst' };
    }
    if (
      !this.profileDirty &&
      !this.profileSliceDrift() &&
      !this.projectDirty &&
      !this.projectSliceDrift() &&
      !firstPublish
    ) {
      return { ok: false, message: 'Nothing to push' };
    }
    if (firstPublish) {
      this.projectDirty = true;
    }
    const token = await this.discordToken();
    if (!token) {
      return { ok: false, message: 'Discord token is not set' };
    }
    const channel = this.base.channelId.trim();
    if (!channel) {
      return { ok: false, message: 'Base Discord channel is not set' };
    }
    if (firstPublish) {
      const locale = normalizeLocale(this.appearance.language);
      const probed = await ensureSetupProbe(token, channel, 'profile', locale);
      if (!probed.ok) {
        return { ok: false, message: probed.message };
      }
      // Hello + attachment back-to-back often hits Discord channel rate limits.
      // Wait longer when we just posted the hello; still pause briefly after a list.
      await new Promise((resolve) => setTimeout(resolve, probed.posted ? 1600 : 400));
    }
    // First publish always packs «Общий» (and other profiles) into the snapshot.
    // Do not flip profileDirty on failure — only real style edits should light it.
    this.mirrorRootProfilesToBase(firstPublish || this.profileDirty);
    if (firstPublish || this.profileDirty) {
      this.mirrorProfilesStylesToProject(true);
    } else {
      this.mirrorProfilesStylesToProject(false);
    }
    const project = this.ensureActiveProject();
    if (!project) {
      return { ok: false, message: 'No project' };
    }
    this.syncProjectPagesFromData(project);

    let remoteBase: BaseConfigFile | undefined;
    if (!firstPublish) {
      const latest = await findLatestConfigMessage(token, channel, 'BASE', undefined);
      if (!latest.ok) {
        return { ok: false, message: latest.message };
      }
      if (latest.value) {
        const downloaded = await downloadConfigAttachment(token, latest.value.attachmentUrl);
        if (downloaded.ok) {
          try {
            remoteBase = normalizeBaseConfig(JSON.parse(downloaded.value));
          } catch (error) {
            return {
              ok: false,
              message: error instanceof Error ? error.message : String(error),
            };
          }
          if (this.relevantSliceDiffers(remoteBase)) {
            this.baseCloudNewer = true;
            this.relevantBaseCloudNewer = true;
            this.changeEmitter.fire();
            return { ok: false, message: 'cloudPullFirst' };
          }
        }
      }
    }

    const merged = remoteBase
      ? this.mergeOwnSliceIntoRemote(remoteBase)
      : normalizeBaseConfig(this.base);
    this.base.profiles = merged.profiles;
    this.base.projects = merged.projects;
    const packed = packBaseConfigBody(merged);
    this.base.snapshot = packed.snapshot;
    const number = await this.nextBaseHeaderNumber(token, channel);
    const headerDate = formatConfigHeaderDate();
    const posted = await postConfigMessage({
      token,
      channelId: channel,
      kind: 'BASE',
      number,
      headerDate,
      filename: 'base.json',
      body: stringifyBaseConfigBody(packed),
    });
    if (!posted.ok) {
      return { ok: false, message: posted.message || 'Failed to post base.json' };
    }
    this.omittedProjectIds.clear();
    this.syncOmittedProjectsToLocal();
    this.profileDirty = false;
    this.projectDirty = false;
    this.baseCloudNewer = false;
    this.relevantBaseCloudNewer = false;
    this.rememberPagesFixedSent();
    this.rememberBaseClean();
    await this.persistBaseOnly();
    await this.persistPosLocal();
    this.changeEmitter.fire();
    void this.refreshCloudHints();
    return { ok: true };
  }

  /**
   * Fold this client's root profile, styles/nicks, and dirty shared project
   * fields into the latest cloud snapshot without wiping other profiles.
   */
  private mergeOwnSliceIntoRemote(remote: BaseConfigFile): BaseConfigFile {
    const profileId = this.ensureActiveProfileId();
    const merged = normalizeBaseConfig(JSON.parse(JSON.stringify(packBaseConfigBody(remote))));
    merged.channelId = this.base.channelId.trim() || merged.channelId;
    const localRoot = this.base.profiles[profileId];
    if (localRoot) {
      merged.profiles[profileId] = { ...localRoot };
    }
    const activeId = this.activeProjectId();
    for (const [projectId, localProject] of Object.entries(this.base.projects)) {
      const remoteProject = merged.projects[projectId];
      if (!remoteProject) {
        merged.projects[projectId] = JSON.parse(JSON.stringify(localProject));
        continue;
      }
      const next: ProjectEntry = {
        ...remoteProject,
        profiles: { ...remoteProject.profiles },
      };
      if (localProject.profiles[profileId]) {
        next.profiles[profileId] = { ...localProject.profiles[profileId] };
      }
      if ((this.projectDirty || this.projectSliceDrift()) && projectId === activeId) {
        next.version = localProject.version;
        next.name = localProject.name;
        next.channels = { ...localProject.channels };
        next.pages = JSON.parse(JSON.stringify(localProject.pages));
        if (localProject.repo) {
          next.repo = { ...localProject.repo };
        } else {
          delete next.repo;
        }
        if (localProject.lock) {
          next.lock = { ...localProject.lock };
        } else {
          delete next.lock;
        }
      }
      merged.projects[projectId] = next;
    }
    this.dropOmittedProjects(merged);
    return merged;
  }

  /** Accept lights only for this profile's active project / own profile slice. */
  private relevantSliceDiffers(remote: BaseConfigFile): boolean {
    const profileId = this.ensureActiveProfileId();
    const localRoot = this.base.profiles[profileId];
    const remoteRoot = remote.profiles[profileId];
    if ((remoteRoot?.version ?? 0) > (localRoot?.version ?? 0)) {
      return true;
    }
    const activeId =
      this.activeProjectId() ||
      remoteRoot?.activeProjectId ||
      localRoot?.activeProjectId;
    if (!activeId) {
      return false;
    }
    const localProject = this.base.projects[activeId];
    const remoteProject = remote.projects[activeId];
    if ((remoteProject?.version ?? 0) > (localProject?.version ?? 0)) {
      return true;
    }
    const localData = localProject?.profiles[profileId];
    const remoteData = remoteProject?.profiles[profileId];
    return (remoteData?.version ?? 0) > (localData?.version ?? 0);
  }

  private async pullProfileConfigNow(
    channelOverride?: string,
    opts?: { skipPages?: boolean },
  ): Promise<{ ok: boolean; message?: string; applied?: boolean }> {
    const skipPages = opts?.skipPages === true;
    const channel = (channelOverride || this.base.channelId).trim();
    const switching = !!channelOverride && channel !== this.base.channelId.trim();
    if (!switching) {
      await this.refreshCloudHints();
      if (!this.relevantBaseCloudNewer && !this.baseCloudNewer) {
        return { ok: false, message: 'Nothing to pull' };
      }
      if (!this.relevantBaseCloudNewer) {
        return { ok: false, message: 'Nothing to pull' };
      }
    }
    const token = await this.discordToken();
    if (!token) {
      return { ok: false, message: 'Discord token is not set' };
    }
    if (!channel) {
      return { ok: false, message: 'Base Discord channel is not set' };
    }
    const latest = await findLatestConfigMessage(token, channel, 'BASE', undefined);
    if (!latest.ok) {
      return { ok: false, message: latest.message };
    }
    if (!latest.value) {
      return { ok: false, message: 'No cloud base config found' };
    }
    const downloaded = await downloadConfigAttachment(token, latest.value.attachmentUrl);
    if (!downloaded.ok) {
      return { ok: false, message: downloaded.message };
    }
    let body: unknown;
    try {
      body = JSON.parse(downloaded.value);
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
    if (isLegacyBaseRaw(body)) {
      return { ok: false, message: 'Legacy base ignored' };
    }
    const remote = normalizeBaseConfig(body);
    remote.channelId = channel;
    this.omitPlaceholderProjects(remote);
    this.omitPlaceholderProjects(this.base);
    const same =
      !!remote.snapshot &&
      remote.snapshot === this.base.snapshot &&
      JSON.stringify(packBaseConfigBody(remote)) === JSON.stringify(packBaseConfigBody(this.base));
    if (same) {
      this.base.snapshot = remote.snapshot || computeBaseSnapshot(remote);
      this.baseCloudNewer = false;
      this.relevantBaseCloudNewer = false;
      this.rememberBaseClean();
      await this.persistBaseOnly();
      this.changeEmitter.fire();
      return { ok: false, message: 'Nothing to pull' };
    }
    for (const profile of Object.values(remote.profiles)) {
      if (profile.activeProjectId && !remote.projects[profile.activeProjectId]) {
        const first = Object.keys(remote.projects)[0];
        if (first) {
          profile.activeProjectId = first;
        } else {
          delete profile.activeProjectId;
        }
      }
    }
    if (!remote.snapshot) {
      remote.snapshot = computeBaseSnapshot(remote);
    }
    this.base = remote;
    this.dropOmittedProjects(this.base);
    await this.persistBaseOnly();
    this.dirtyPages.clear();
    if (!skipPages) {
      this.pageCloudNewer = {};
      this.pendingRemote = {};
    }
    await this.reloadSplitFromDisk(false);
    this.retargetSurfacesToActivePages();
    this.baseCloudNewer = false;
    this.relevantBaseCloudNewer = false;
    this.rememberPagesFixedSent();
    await this.persistProfiles(false);
    await this.persistStyles(false);
    if (skipPages) {
      for (const id of Object.keys(this.pageCloudNewer)) {
        if (!this.data.pages[id]) {
          delete this.pageCloudNewer[id];
        }
      }
      for (const id of Object.keys(this.pendingRemote)) {
        if (!this.data.pages[id] && !this.activeProject()?.pages[id]) {
          delete this.pendingRemote[id];
        }
      }
    }
    const pages = skipPages
      ? { ok: true as const }
      : await this.pullActiveProjectPagesNow();
    this.profileDirty = false;
    this.projectDirty = this.omittedProjectIds.size > 0;
    this.dirtyPages.clear();
    this.rememberBaseClean();
    await this.persistPosLocal();
    this.present = this.capture();
    this.pagePresent = this.captureAllPageSnapshots();
    this.changeEmitter.fire();
    if (!pages.ok) {
      return { ok: false, applied: true, message: pages.message };
    }
    return { ok: true, applied: true };
  }

  /** Point open surfaces at a page that exists in the active project. */
  private retargetSurfacesToActivePages(): void {
    if (Object.keys(this.data.pages).length === 0) {
      return;
    }
    const fallback = this.defaultFilesPageId();
    if (!this.data.pages[fallback]) {
      return;
    }
    for (const surface of MAP_SURFACES) {
      const current = this.data.surfaces[surface]?.page;
      if (!current || !this.data.pages[current]) {
        this.data.surfaces[surface] = { page: fallback };
      }
    }
    if (!this.posLocal.surfaces) {
      this.posLocal.surfaces = {
        explorer: { page: this.data.surfaces.explorer.page },
        bottom: { page: this.data.surfaces.bottom.page },
        left: { page: this.data.surfaces.left.page },
        right: { page: this.data.surfaces.right.page },
      };
      return;
    }
    for (const surface of MAP_SURFACES) {
      const current = this.posLocal.surfaces[surface]?.page;
      if (!current || !this.data.pages[current]) {
        this.posLocal.surfaces[surface] = { page: this.data.surfaces[surface].page };
      }
    }
  }

  /**
   * Download content for the active project's pages from the Discord channels
   * stored on that project. Review messages are not a page file: the open map
   * drops them and reads the active project's review channel.
   * A page with no channel, or with no config message yet, stays visible empty.
   */
  private async pullActiveProjectPagesNow(): Promise<{ ok: boolean; message?: string }> {
    const project = this.activeProject();
    if (!project) {
      return { ok: true };
    }
    const lines: string[] = [];
    const ids = Object.entries(project.pages)
      .sort((a, b) => a[1].order - b[1].order || a[0].localeCompare(b[0]))
      .map(([id]) => id);
    for (const pageId of ids) {
      const page = this.data.pages[pageId];
      if (!page || page.kind === 'review') {
        continue;
      }
      const kind = pageKindToConfigKind(page.kind);
      if (!kind || kind === 'BASE') {
        continue;
      }
      const pageChannel = resolveProjectChannel(project.channels, kind);
      if (!pageChannel) {
        continue;
      }
      const result = await this.pullPageConfigNow(pageId, true);
      if (result.ok || !result.message || result.message === 'Nothing to pull') {
        continue;
      }
      if (result.message === 'No cloud config found') {
        continue;
      }
      const name = page.name?.trim() || pageId;
      lines.push(`${name}\t${result.message}`);
    }
    if (lines.length === 0) {
      return { ok: true };
    }
    return { ok: false, message: lines.join('\n') };
  }

  /**
   * @param bumpVersion when mirroring, bump packed profile versions (real edits).
   * @param mirror write into the active project's profiles; false on reload so
   *   baseClean fingerprints stay aligned with the published BASE.
   */
  private async persistProfiles(bumpVersion = true, mirror = true): Promise<void> {
    if (this.suspended) {
      return;
    }
    if (mirror) {
      this.mirrorRootProfilesToBase(bumpVersion);
      this.mirrorProfilesStylesToProject(bumpVersion);
    }
    this.profileDirty = true;
    this.writingProfiles = true;
    try {
      const payload: ProfilesFile = {
        version: 1,
        profiles: this.profilesData.profiles.map((p) => ({
          id: p.id,
          name: p.name,
          sProfileIds: [...p.sProfileIds],
          ...(p.reviewSkillPath ? { reviewSkillPath: p.reviewSkillPath } : {}),
          ...(p.reviewDirPath ? { reviewDirPath: p.reviewDirPath } : {}),
          ...(p.reviewModel ? { reviewModel: p.reviewModel } : {}),
          ...(p.reviewFixModel ? { reviewFixModel: p.reviewFixModel } : {}),
          ...(p.githubNick ? { githubNick: p.githubNick } : {}),
          ...(p.gitlabNick ? { gitlabNick: p.gitlabNick } : {}),
        })),
      };
      if (this.suspended) {
        return;
      }
      await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(this.profilesUri, '..'));
      await vscode.workspace.fs.writeFile(
        this.profilesUri,
        Buffer.from(JSON.stringify(payload, null, 2) + '\n', 'utf8'),
      );
    } finally {
      // Let the watcher settle before accepting external reloads.
      setTimeout(() => {
        this.writingProfiles = false;
      }, 100);
    }
  }

  /** @see persistProfiles */
  private async persistStyles(bumpVersion = true, mirror = true): Promise<void> {
    if (this.suspended) {
      return;
    }
    if (mirror) {
      this.mirrorProfilesStylesToProject(bumpVersion);
    }
    this.profileDirty = true;
    this.writingStyles = true;
    try {
      const styles: Record<string, ProfileStyle> = {};
      for (const profile of this.profilesData.profiles) {
        const current = this.stylesData.styles[profile.id];
        styles[profile.id] = {
          appearance: normalizeAppearance(current?.appearance ?? DEFAULT_APPEARANCE),
          open: normalizePanelOpen(current?.open),
        };
      }
      this.stylesData = { version: 1, styles };
      if (this.suspended) {
        return;
      }
      await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(this.stylesUri, '..'));
      await vscode.workspace.fs.writeFile(
        this.stylesUri,
        Buffer.from(JSON.stringify(this.stylesData, null, 2) + '\n', 'utf8'),
      );
    } finally {
      setTimeout(() => {
        this.writingStyles = false;
      }, 100);
    }
  }

  /**
   * Load pos_local folds / focus / drafts / surfaces.
   * Card order lives in page files; pos_remote is unused.
   */
  private async loadPositions(): Promise<void> {
    const localExists = await fileExists(this.posLocalUri);
    this.posLocal = localExists
      ? await this.readPositionsFile(this.posLocalUri, true)
      : emptyPositions();
    this.omittedProjectIds = new Set(this.posLocal.omittedProjects ?? []);
    this.posRemote = emptyPositions();

    let localDirty = false;
    if (positionsIsEmpty(this.posLocal)) {
      this.posLocal.profiles[GENERAL_PROFILE_ID] = emptyProfileLayout();
      localDirty = true;
    }

    if (this.posLocal.surfaces) {
      const fallback = this.defaultFilesPageId();
      for (const surface of MAP_SURFACES) {
        const page = this.posLocal.surfaces[surface]?.page;
        this.data.surfaces[surface] = {
          page: page && this.data.pages[page] ? page : fallback,
        };
      }
    }

    const ids = this.entityIdSets();
    if (prunePositionsFile(this.posLocal, ids.pages, ids.markers, ids.notes, ids.links)) {
      localDirty = true;
    }

    if (this.ensureActiveLayoutInLocal()) {
      localDirty = true;
    }

    // Apply folds only — page/marker order already comes from page files.
    this.applyCollapsedFromLocal(this.posLocal.profiles[this.activeId] ?? emptyProfileLayout());
    this.positionsReady = true;

    if (localDirty) {
      await this.persistPosLocal();
    }
  }

  /** Apply only fold state from pos_local; keep content order from page files. */
  private applyCollapsedFromLocal(layout: ProfileLayout): void {
    const packed = packProfileLayout(layout);
    for (const [id, page] of Object.entries(this.data.pages)) {
      const pos = packed.pages[id];
      if (pos) {
        page.collapsed = packCollapsed(pos.collapsed);
      } else {
        page.collapsed = page.collapsed ?? emptyCollapsed();
      }
    }
  }

  private async readPositionsFile(uri: vscode.Uri, withFocus = false): Promise<PositionsFile> {
    try {
      const raw = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
      return normalizePositions(JSON.parse(raw), { focus: withFocus });
    } catch (error) {
      if (!isFileNotFound(error)) {
        console.error('Syn3 positions:', error);
      }
      return emptyPositions();
    }
  }

  private async reloadPosRemoteFromDisk(): Promise<void> {
    this.posRemote = await this.readPositionsFile(this.posRemoteUri);
    const ids = this.entityIdSets();
    if (prunePositionsFile(this.posRemote, ids.pages, ids.markers, ids.notes, ids.links)) {
      await this.persistPosRemote();
    }
    // Pull into local only when local is empty or lacks the active profile.
    let localDirty = false;
    if (positionsIsEmpty(this.posLocal) && !positionsIsEmpty(this.posRemote)) {
      for (const [id, layout] of Object.entries(this.posRemote.profiles)) {
        this.posLocal.profiles[id] = cloneProfileLayout(layout);
      }
      localDirty = true;
    }
    if (this.ensureActiveLayoutInLocal()) {
      localDirty = true;
    }
    if (localDirty) {
      this.applyCollapsedFromLocal(this.posLocal.profiles[this.activeId] ?? emptyProfileLayout());
      this.pagePresent = this.captureAllPageSnapshots();
      await this.persistPosLocal();
    }
    this.changeEmitter.fire();
  }

  private async persistPosLocal(): Promise<void> {
    if (this.suspended) {
      return;
    }
    this.writingPosLocal = true;
    try {
      this.mirrorSurfacesToPosLocal();
      const focus = packFocus(this.posLocal.focus);
      const drafts: Record<string, string[]> = {};
      for (const pageId of Object.keys(this.posLocal.drafts ?? {}).sort()) {
        const ids = (this.posLocal.drafts?.[pageId] ?? []).filter(Boolean);
        if (ids.length > 0) {
          drafts[pageId] = ids;
        }
      }
      const pageClean: Record<string, string> = {};
      for (const pageId of Object.keys(this.posLocal.pageClean ?? {}).sort()) {
        const fp = this.posLocal.pageClean?.[pageId]?.trim();
        if (fp) {
          pageClean[pageId] = fp;
        }
      }
      const baseClean = this.posLocal.baseClean;
      const packedBaseClean =
        baseClean && (baseClean.project || baseClean.profile)
          ? {
              ...(baseClean.project ? { project: baseClean.project } : {}),
              ...(baseClean.profile ? { profile: baseClean.profile } : {}),
            }
          : undefined;
      const pageTombstones = this.posLocal.pageTombstones;
      const payload: PositionsFile = {
        version: 1,
        profiles: {},
        ...(focus ? { focus } : {}),
        ...(Object.keys(drafts).length > 0 ? { drafts } : {}),
        ...(Object.keys(pageClean).length > 0 ? { pageClean } : {}),
        ...(packedBaseClean ? { baseClean: packedBaseClean } : {}),
        ...(pageTombstones && Object.keys(pageTombstones).length > 0 ? { pageTombstones } : {}),
        ...(this.posLocal.surfaces ? { surfaces: this.posLocal.surfaces } : {}),
        ...(this.posLocal.pagesFixed ? { pagesFixed: true as const } : {}),
        ...(this.posLocal.pagesFixedSent ? { pagesFixedSent: true as const } : {}),
        ...(this.posLocal.omittedProjects && this.posLocal.omittedProjects.length > 0
          ? { omittedProjects: [...this.posLocal.omittedProjects].sort() }
          : {}),
      };
      for (const id of Object.keys(this.posLocal.profiles).sort()) {
        payload.profiles[id] = packProfileLayout(this.posLocal.profiles[id]);
      }
      this.posLocal = payload;
      if (this.suspended) {
        return;
      }
      await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(this.posLocalUri, '..'));
      await vscode.workspace.fs.writeFile(
        this.posLocalUri,
        Buffer.from(JSON.stringify(payload, null, 2) + '\n', 'utf8'),
      );
    } finally {
      setTimeout(() => {
        this.writingPosLocal = false;
      }, 100);
    }
  }

  private async persistPosRemote(): Promise<void> {
    if (this.suspended) {
      return;
    }
    this.writingPosRemote = true;
    try {
      const payload: PositionsFile = {
        version: 1,
        profiles: {},
      };
      for (const id of Object.keys(this.posRemote.profiles).sort()) {
        payload.profiles[id] = packProfileLayout(this.posRemote.profiles[id]);
      }
      this.posRemote = payload;
      if (this.suspended) {
        return;
      }
      await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(this.posRemoteUri, '..'));
      await vscode.workspace.fs.writeFile(
        this.posRemoteUri,
        Buffer.from(JSON.stringify(payload, null, 2) + '\n', 'utf8'),
      );
    } finally {
      setTimeout(() => {
        this.writingPosRemote = false;
      }, 100);
    }
  }

  private entityIdSets(): {
    pages: Set<string>;
    markers: Set<string>;
    notes: Set<string>;
    links: Set<string>;
  } {
    return {
      pages: new Set(Object.keys(this.data.pages)),
      markers: new Set(Object.keys(this.data.markers)),
      notes: new Set(Object.keys(this.data.notes)),
      links: new Set(Object.keys(this.data.links)),
    };
  }

  /** Snapshot current in-memory layout (used for migration and syncing to pos_local). */
  private extractLayoutFromData(): ProfileLayout {
    const layout = emptyProfileLayout();
    for (const [id, page] of Object.entries(this.data.pages)) {
      layout.pages[id] = {
        order: page.order,
        layout: page.layout,
        groupsLayout: page.groupsLayout,
        collapsed: packCollapsed(page.collapsed),
      };
    }
    for (const [id, marker] of Object.entries(this.data.markers)) {
      const entry: ProfileLayout['markers'][string] = { order: marker.order };
      if (marker.columns) {
        entry.columns = marker.columns;
      }
      layout.markers[id] = entry;
    }
    for (const [id, note] of Object.entries(this.data.notes)) {
      layout.notes[id] = { order: note.order };
    }
    for (const [id, link] of Object.entries(this.data.links)) {
      layout.links[id] = { order: link.order };
    }
    return packProfileLayout(layout);
  }

  /** Persist fold state of the active profile into pos_local. */
  private async syncActiveLayoutToLocal(): Promise<void> {
    if (!this.positionsReady) {
      return;
    }
    const id = this.ensureActiveProfileId();
    const prev = this.posLocal.profiles[id] ?? emptyProfileLayout();
    const next = emptyProfileLayout();
    for (const [pageId, page] of Object.entries(this.data.pages)) {
      next.pages[pageId] = {
        order: page.order,
        layout: page.layout,
        groupsLayout: page.groupsLayout,
        collapsed: packCollapsed(page.collapsed),
      };
    }
    // Keep leftover marker/note/link slots from prev for prune compatibility.
    next.markers = { ...prev.markers };
    next.notes = { ...prev.notes };
    next.links = { ...prev.links };
    const packedNext = packProfileLayout(next);
    if (JSON.stringify(packProfileLayout(prev)) === JSON.stringify(packedNext)) {
      return;
    }
    this.posLocal.profiles[id] = packedNext;
    await this.persistPosLocal();
  }

  /** Ensure active profile has a folds slot in pos_local. */
  private ensureActiveLayoutInLocal(): boolean {
    const id = this.ensureActiveProfileId();
    if (this.posLocal.profiles[id]) {
      return false;
    }
    for (const profile of this.profilesData.profiles) {
      const local = this.posLocal.profiles[profile.id];
      if (local) {
        this.posLocal.profiles[id] = cloneProfileLayout(local);
        return true;
      }
    }
    this.posLocal.profiles[id] = emptyProfileLayout();
    return true;
  }

  /** Ensure every page has a collapsed entry in the active local layout. */
  private borrowMissingIntoActiveLocal(): boolean {
    const id = this.ensureActiveProfileId();
    const layout = this.posLocal.profiles[id] ?? emptyProfileLayout();
    let changed = false;

    for (const pageId of Object.keys(this.data.pages)) {
      if (layout.pages[pageId]) {
        continue;
      }
      const page = this.data.pages[pageId];
      layout.pages[pageId] = {
        order: page.order,
        layout: page.layout,
        groupsLayout: page.groupsLayout,
        collapsed: emptyCollapsed(),
      };
      changed = true;
    }

    // Drop folds for removed pages.
    for (const pageId of Object.keys(layout.pages)) {
      if (!this.data.pages[pageId]) {
        delete layout.pages[pageId];
        changed = true;
      }
    }

    if (changed) {
      this.posLocal.profiles[id] = packProfileLayout(layout);
    }
    return changed;
  }

  /**
   * Project/profile send flags are in-memory. After a restart, restore them from
   * baseClean fingerprints — or light both when the base was never published.
   */
  private async reconcileBaseDirty(): Promise<void> {
    const projectFp = this.projectSyncFingerprint();
    const profileFp = this.profileSyncFingerprint();
    if (!this.posLocal.baseClean) {
      // First publish is a project action; profile send stays off until styles change.
      if (this.base.channelId.trim() && Object.keys(this.base.projects).length > 0) {
        this.projectDirty = true;
      }
      return;
    }
    const clean = this.posLocal.baseClean;
    if (!clean?.project && !clean?.profile) {
      this.posLocal.baseClean = { project: projectFp, profile: profileFp };
      await this.persistPosLocal();
      return;
    }
    if (clean.project && clean.project !== projectFp) {
      this.projectDirty = true;
    }
    if (clean.profile && clean.profile !== profileFp) {
      this.profileDirty = true;
    }
  }

  /** Remember the base snapshot Discord already has. */
  private rememberBaseClean(): void {
    this.posLocal.baseClean = {
      project: this.projectSyncFingerprint(),
      profile: this.profileSyncFingerprint(),
    };
  }

  /** Shared project fields (not styles, not lock, not per-profile active). */
  private projectSyncSliceFromBase(base: BaseConfigFile): Record<string, unknown> {
    const projects: Record<string, unknown> = {};
    for (const id of Object.keys(base.projects).sort()) {
      const project = base.projects[id];
      projects[id] = {
        version: project.version,
        name: project.name,
        channels: project.channels,
        repo: project.repo,
        pages: project.pages,
      };
    }
    return {
      channelId: base.channelId.trim(),
      projects,
    };
  }

  private projectSyncSlice(): Record<string, unknown> {
    return this.projectSyncSliceFromBase(this.base);
  }

  /** Project send slice plus lock, which lights Send but is not part of the fingerprint. */
  private debugProjectSlice(base: BaseConfigFile): Record<string, unknown> {
    const slice = this.projectSyncSliceFromBase(base);
    const projects = slice.projects;
    if (!projects || typeof projects !== 'object' || Array.isArray(projects)) {
      return slice;
    }
    const next: Record<string, unknown> = {};
    for (const [id, value] of Object.entries(projects)) {
      const lock = base.projects[id]?.lock;
      if (lock && value && typeof value === 'object' && !Array.isArray(value)) {
        next[id] = { ...(value as Record<string, unknown>), lock: { profileId: lock.profileId } };
      } else {
        next[id] = value;
      }
    }
    return { ...slice, projects: next };
  }

  /** Last sent fingerprint is behind the live slice, so Send must stay on. */
  private projectSliceDrift(): boolean {
    const saved = this.posLocal.baseClean?.project;
    return !!saved && saved !== this.projectSyncFingerprint();
  }

  /** Last sent fingerprint is behind the live slice, so Send must stay on. */
  private profileSliceDrift(): boolean {
    const saved = this.posLocal.baseClean?.profile;
    return !!saved && saved !== this.profileSyncFingerprint();
  }

  private projectSyncFingerprint(): string {
    return fingerprint(JSON.stringify(this.projectSyncSlice()));
  }

  /** Root profiles + styles/nicks inside each project. */
  private profileSyncSliceFromBase(base: BaseConfigFile): Record<string, unknown> {
    const projects: Record<string, unknown> = {};
    for (const id of Object.keys(base.projects).sort()) {
      projects[id] = base.projects[id].profiles;
    }
    return {
      profiles: base.profiles,
      projectProfiles: projects,
    };
  }

  private profileSyncSlice(): Record<string, unknown> {
    return this.profileSyncSliceFromBase(this.base);
  }

  private profileSyncFingerprint(): string {
    return fingerprint(JSON.stringify(this.profileSyncSlice()));
  }

  /**
   * Send flags are in-memory. After a restart, compare the page with the last
   * synced fingerprint. A page that was never sent and already has content stays sendable.
   */
  private async reconcilePageDirty(): Promise<void> {
    const clean: Record<string, string> = { ...(this.posLocal.pageClean ?? {}) };
    let persist = false;
    for (const [pageId, snapshot] of Object.entries(this.pagePresent)) {
      const fp = fingerprint(this.pageDirtyKey(snapshot));
      const saved = clean[pageId];
      if (saved) {
        if (saved !== fp && saved !== fingerprint(snapshot)) {
          this.dirtyPages.add(pageId);
        } else if (saved !== fp) {
          clean[pageId] = fp;
          persist = true;
        }
        continue;
      }
      if (!this.pageCloud[pageId] && this.pageHasLocalContent(pageId)) {
        this.dirtyPages.add(pageId);
        continue;
      }
      clean[pageId] = fp;
      persist = true;
    }
    for (const pageId of Object.keys(clean)) {
      if (!this.pagePresent[pageId]) {
        delete clean[pageId];
        persist = true;
      }
    }
    if (Object.keys(clean).length > 0) {
      this.posLocal.pageClean = clean;
    } else {
      delete this.posLocal.pageClean;
    }
    if (persist) {
      await this.persistPosLocal();
    }
  }

  /** Remember the snapshot that Discord already has, so the send icon can go out. */
  private rememberPageClean(pageId: string): void {
    const snapshot = this.pagePresent[pageId];
    if (!snapshot) {
      if (this.posLocal.pageClean?.[pageId]) {
        delete this.posLocal.pageClean[pageId];
      }
      return;
    }
    if (!this.posLocal.pageClean) {
      this.posLocal.pageClean = {};
    }
    this.posLocal.pageClean[pageId] = fingerprint(this.pageDirtyKey(snapshot));
  }

  private pageHasLocalContent(pageId: string): boolean {
    if (this.markerIdsOnPage(pageId).length > 0) {
      return true;
    }
    for (const noteId of Object.keys(this.data.notes)) {
      if (this.pageOfNote(noteId) === pageId) {
        return true;
      }
    }
    for (const linkId of Object.keys(this.data.links)) {
      if (this.pageOfLink(linkId) === pageId) {
        return true;
      }
    }
    return false;
  }

  private async commitNow(): Promise<void> {
    if (this.suspended) {
      return;
    }
    const previousPages = { ...this.pagePresent };
    const previousPageIds = new Set(Object.keys(previousPages));
    const next = this.capture();
    const contentChanged = next !== this.present;
    if (contentChanged) {
      await this.writeConfig(next);
      this.baseline = undefined;
      this.present = next;
    }
    const nextPages = this.captureAllPageSnapshots();
    let pageDirty = false;
    for (const [pageId, curr] of Object.entries(nextPages)) {
      const prev = previousPages[pageId];
      if (prev !== undefined && this.pageDirtyKey(prev) !== this.pageDirtyKey(curr)) {
        this.dirtyPages.add(pageId);
        pageDirty = true;
        if (this.historyReady) {
          remember(pageStacks(this.history, pageId), prev);
        }
      } else if (prev === undefined) {
        this.dirtyPages.add(pageId);
        pageDirty = true;
      }
    }
    for (const pageId of previousPageIds) {
      if (!(pageId in nextPages)) {
        this.dirtyPages.delete(pageId);
        delete this.pageCloudNewer[pageId];
        if (this.posLocal.drafts?.[pageId]) {
          delete this.posLocal.drafts[pageId];
        }
        if (this.posLocal.pageClean?.[pageId]) {
          delete this.posLocal.pageClean[pageId];
        }
      }
    }
    const pageIdsChanged =
      previousPageIds.size !== Object.keys(nextPages).length ||
      [...previousPageIds].some((id) => !(id in nextPages));
    this.pagePresent = nextPages;
    if (this.historyReady) {
      if (contentChanged || pageDirty || pageIdsChanged) {
        await this.persistHistory();
      }
    }
    const focusDirty = pruneFocusMap(
      this.posLocal,
      new Set(Object.keys(this.data.markers)),
      new Set(Object.keys(this.data.notes)),
    );
    this.mirrorSurfacesToPosLocal();
    await this.syncActiveLayoutToLocal();
    if (focusDirty) {
      await this.persistPosLocal();
    }
    this.changeEmitter.fire();
  }

  private mirrorSurfacesToPosLocal(): void {
    this.posLocal.surfaces = {
      explorer: { page: this.data.surfaces.explorer.page },
      bottom: { page: this.data.surfaces.bottom.page },
      left: { page: this.data.surfaces.left.page },
      right: { page: this.data.surfaces.right.page },
    };
  }

  private async travel(pageId: string, direction: -1 | 1): Promise<void> {
    await this.enqueue(async () => {
      if (!this.data.pages[pageId]) {
        return;
      }
      const stacks = this.history.pages[pageId];
      if (!stacks) {
        return;
      }
      const snapshot = peek(stacks, direction);
      if (snapshot === undefined) {
        return;
      }
      const backup = JSON.parse(JSON.stringify(this.data)) as MarkersFile;
      const backupPresent = this.present;
      const backupPages = { ...this.pagePresent };
      const backupLocal = JSON.parse(JSON.stringify(this.posLocal)) as PositionsFile;
      const leaving = this.pagePresent[pageId] ?? this.capturePageSnapshot(pageId);
      try {
        this.applyPageSnapshot(pageId, snapshot);
        const next = this.capture();
        await this.writeConfig(next);
        take(stacks, direction, leaving);
        this.present = next;
        this.baseline = undefined;
        this.pagePresent = this.captureAllPageSnapshots();
        await this.syncActiveLayoutToLocal();
        await this.persistHistory();
        this.changeEmitter.fire();
      } catch (error) {
        this.data = backup;
        this.present = backupPresent;
        this.pagePresent = backupPages;
        this.posLocal = backupLocal;
        throw error;
      }
    });
  }

  private async persistHistory(): Promise<void> {
    if (this.suspended) {
      return;
    }
    try {
      const json = encodeHistory(this.history, this.pageCursors());
      if (this.suspended) {
        return;
      }
      await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(this.historyUri, '..'));
      await vscode.workspace.fs.writeFile(this.historyUri, Buffer.from(json, 'utf8'));
    } catch (error) {
      console.error('Syn3 history:', error);
    }
  }

  private pageCursors(): Record<string, string> {
    const cursors: Record<string, string> = {};
    for (const [pageId, snapshot] of Object.entries(this.pagePresent)) {
      cursors[pageId] = fingerprint(snapshot);
    }
    return cursors;
  }

  private captureFrom(data: MarkersFile): string {
    const previous = this.data;
    this.data = data;
    try {
      return this.capture();
    } finally {
      this.data = previous;
    }
  }

  /**
   * Send-icon comparison. The full snapshot also carries every page's order so
   * undo can restore a reorder; that map must not mark neighbours dirty when
   * one page is created.
   */
  private pageDirtyKey(raw: string): string {
    try {
      const snap = JSON.parse(raw) as PageSnapshot;
      delete snap.pageOrders;
      return JSON.stringify(snap);
    } catch {
      return raw;
    }
  }

  private captureAllPageSnapshots(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [pageId] of this.pages()) {
      result[pageId] = this.capturePageSnapshot(pageId);
    }
    return result;
  }

  /** Stable JSON of one page's groups, items, notes and view. Folds are omitted so they never become an undo step. */
  private capturePageSnapshot(pageId: string, legacyCollapsed = false): string {
    const def = this.data.pages[pageId];
    if (!def) {
      return '';
    }
    const markerIds = this.markerIdsOnPage(pageId);
    const markerSet = new Set(markerIds);
    const markers: Record<string, MarkerDef> = {};
    for (const id of markerIds) {
      const src = this.data.markers[id];
      if (!src) {
        continue;
      }
      const entry = { label: src.label } as MarkerDef;
      if (src.color) {
        entry.color = src.color;
      }
      if (src.icons?.length) {
        entry.icons = src.icons.slice(0, MAX_BADGE_ICONS);
      }
      if (src.alias) {
        entry.alias = src.alias;
      }
      if (src.description) {
        entry.description = src.description;
      }
      if (src.columns) {
        entry.columns = src.columns;
      }
      if (src.locked) {
        entry.locked = true;
      }
      entry.order = src.order;
      if (src.parent && markerSet.has(src.parent)) {
        entry.parent = src.parent;
      } else {
        entry.page = pageId;
      }
      markers[id] = entry;
    }
    const items: Record<string, string[]> = {};
    const added: Record<string, Record<string, number>> = {};
    for (const relPath of Object.keys(this.data.items).sort()) {
      const ids = (this.data.items[relPath] ?? []).filter((id) => markerSet.has(id));
      if (ids.length === 0) {
        continue;
      }
      items[relPath] = ids;
      const dates: Record<string, number> = {};
      for (const id of ids) {
        const at = this.data.added[relPath]?.[id];
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
      const value = this.data.aliases[relPath]?.trim();
      if (value) {
        aliases[relPath] = value;
      }
    }
    const classes: Record<string, ClassDef> = {};
    const classItems: Record<string, string[]> = {};
    const classAdded: Record<string, Record<string, number>> = {};
    for (const classId of Object.keys(this.data.classes).sort()) {
      const classDef = this.data.classes[classId];
      const ids = (this.data.classItems[classId] ?? []).filter((id) => markerSet.has(id));
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
        const at = this.data.classAdded[classId]?.[markerId];
        if (at !== undefined) {
          dates[markerId] = at;
        }
      }
      if (Object.keys(dates).length > 0) {
        classAdded[classId] = dates;
      }
      const alias = this.data.aliases[classDef.relPath]?.trim();
      if (alias) {
        aliases[classDef.relPath] = alias;
      }
    }
    const notes: Record<string, NoteDef> = {};
    for (const [noteId, note] of Object.entries(this.data.notes)) {
      const packed = this.packNote(noteId, note, pageId, markerSet);
      if (packed) {
        notes[noteId] = packed;
      }
    }
    const links: Record<string, LinkDef> = {};
    for (const [linkId, link] of Object.entries(this.data.links)) {
      const packed = this.packLink(linkId, link, pageId);
      if (packed) {
        links[linkId] = packed;
      }
    }
    const pageOrders: Record<string, number> = {};
    for (const [id, page] of Object.entries(this.data.pages)) {
      pageOrders[id] = page.order;
    }
    const payload: PageSnapshot = {
      version: 1,
      page: {
        name: def.name,
        kind: def.kind,
        ...(def.description ? { description: def.description } : {}),
        order: def.order,
        layout: def.layout,
        groupsLayout: def.groupsLayout,
        ...(legacyCollapsed ? { collapsed: this.legacyCollapsed(def, markerSet) } : {}),
      },
      pageOrders,
      markers,
      items,
      added,
      aliases,
      classes,
      classItems,
      classAdded,
      notes,
      links,
    };
    return JSON.stringify(payload) + '\n';
  }

  private markerIdsOnPage(pageId: string): string[] {
    const result: string[] = [];
    const visit = (parentId: string | undefined) => {
      for (const [id] of this.children(parentId, parentId === undefined ? pageId : undefined)) {
        result.push(id);
        visit(id);
      }
    };
    visit(undefined);
    return result;
  }

  /** Replace one page's entities from a snapshot. Copies when a marker id lives on another page. */
  private applyPageSnapshot(pageId: string, raw: string): void {
    let snap: PageSnapshot;
    try {
      snap = JSON.parse(raw) as PageSnapshot;
    } catch (error) {
      throw error instanceof Error ? error : new Error(String(error));
    }
    if (snap.version !== 1 || !snap.page || !snap.markers || typeof snap.markers !== 'object') {
      throw new Error('Invalid page history snapshot.');
    }
    const page = this.data.pages[pageId];
    if (!page) {
      throw new Error(`Page not found: ${pageId}`);
    }

    const currentIds = this.markerIdsOnPage(pageId);
    const currentSet = new Set(currentIds);
    const idMap = new Map<string, string>();
    const reserved = new Set<string>();
    for (const [snapId, def] of Object.entries(snap.markers)) {
      const existing = this.data.markers[snapId];
      if (!existing && !reserved.has(snapId)) {
        idMap.set(snapId, snapId);
        reserved.add(snapId);
      } else if (existing && this.pageOf(snapId) === pageId) {
        idMap.set(snapId, snapId);
        reserved.add(snapId);
      } else {
        idMap.set(snapId, this.uniqueMarkerId(def.label, reserved));
      }
    }

    const keepIds = new Set(idMap.values());
    const notesOnPage = Object.keys(this.data.notes).filter(
      (noteId) => this.pageOfNote(noteId) === pageId,
    );
    for (const noteId of notesOnPage) {
      if (this.data.notes[noteId]) {
        this.purgeNoteTree(noteId);
      }
    }
    const linksOnPage = Object.keys(this.data.links).filter(
      (linkId) => this.pageOfLink(linkId) === pageId,
    );
    for (const linkId of linksOnPage) {
      if (this.data.links[linkId]) {
        this.purgeLinkTree(linkId);
      }
    }
    for (const id of currentIds) {
      if (!keepIds.has(id)) {
        this.purgeMarker(id);
      }
    }

    for (const [relPath, ids] of Object.entries(this.data.items)) {
      this.setItem(
        relPath,
        ids.filter((id) => !currentSet.has(id)),
      );
    }
    for (const [classId, ids] of Object.entries(this.data.classItems)) {
      this.setClassItem(
        classId,
        ids.filter((id) => !currentSet.has(id)),
      );
    }

    for (const snapId of this.orderSnapshotMarkers(snap.markers)) {
      const src = snap.markers[snapId];
      if (!src) {
        continue;
      }
      const actualId = idMap.get(snapId);
      if (!actualId) {
        continue;
      }
      const parentSnap = src.parent && snap.markers[src.parent] ? src.parent : undefined;
      const parent = parentSnap ? idMap.get(parentSnap) : undefined;
      const entry: MarkerDef = {
        label: src.label,
        order: src.order,
      };
      if (src.color) {
        entry.color = src.color;
      }
      if (src.icons?.length) {
        entry.icons = src.icons.slice(0, MAX_BADGE_ICONS);
      }
      if (src.alias) {
        entry.alias = src.alias;
      }
      if (src.description) {
        entry.description = src.description;
      }
      if (src.columns) {
        entry.columns = src.columns;
      }
      if (src.locked) {
        entry.locked = true;
      }
      if (parent) {
        entry.parent = parent;
      } else {
        entry.page = pageId;
      }
      this.data.markers[actualId] = entry;
    }

    page.name = snap.page.name;
    page.kind = normalizePageKind(snap.page.kind) ?? page.kind;
    if ('description' in snap.page) {
      const text = normalizeGroupDescription(snap.page.description);
      if (text) {
        page.description = text;
      } else {
        delete page.description;
      }
    }
    if (snap.pageOrders && typeof snap.pageOrders === 'object') {
      for (const [id, order] of Object.entries(snap.pageOrders)) {
        if (this.data.pages[id] && typeof order === 'number') {
          this.data.pages[id].order = order;
        }
      }
    } else if (typeof snap.page.order === 'number') {
      page.order = snap.page.order;
    }
    page.layout = normalizeMapLayout(snap.page.layout);
    page.groupsLayout = normalizeGroupsLayout(snap.page.groupsLayout);

    for (const [relPath, ids] of Object.entries(snap.items ?? {})) {
      const mapped = ids
        .map((id) => idMap.get(id))
        .filter((id): id is string => !!id && !!this.data.markers[id]);
      if (mapped.length === 0) {
        continue;
      }
      const existing = this.data.items[relPath] ?? [];
      const merged = [...existing];
      for (const id of mapped) {
        if (!merged.includes(id)) {
          merged.push(id);
        }
      }
      this.setItem(relPath, merged);
      for (const snapId of ids) {
        const actualId = idMap.get(snapId);
        const at = snap.added?.[relPath]?.[snapId];
        if (actualId && at !== undefined) {
          this.setAdded(relPath, actualId, at);
        }
      }
    }

    for (const [classId, classDef] of Object.entries(snap.classes ?? {})) {
      const snapIds = snap.classItems?.[classId] ?? [];
      const mapped = snapIds
        .map((id) => idMap.get(id))
        .filter((id): id is string => !!id && !!this.data.markers[id]);
      if (mapped.length === 0) {
        continue;
      }
      this.data.classes[classId] = {
        relPath: classDef.relPath,
        name: classDef.name,
        ...(classDef.line !== undefined ? { line: classDef.line } : {}),
        ...(classDef.alias ? { alias: classDef.alias } : {}),
      };
      const existing = this.data.classItems[classId] ?? [];
      const merged = [...existing];
      for (const id of mapped) {
        if (!merged.includes(id)) {
          merged.push(id);
        }
      }
      this.setClassItem(classId, merged);
      for (const snapId of snapIds) {
        const actualId = idMap.get(snapId);
        const at = snap.classAdded?.[classId]?.[snapId];
        if (actualId && at !== undefined) {
          this.setClassAdded(classId, actualId, at);
        }
      }
    }

    for (const [relPath, alias] of Object.entries(snap.aliases ?? {})) {
      const trimmed = alias.trim();
      if (trimmed) {
        this.data.aliases[relPath] = trimmed;
      }
    }

    const noteIdMap = new Map<string, string>();
    const snapNotes = Object.entries(snap.notes ?? {});
    for (const [snapNoteId] of snapNotes) {
      const existing = this.data.notes[snapNoteId];
      if (!existing) {
        noteIdMap.set(snapNoteId, snapNoteId);
      } else {
        const page = this.pageOfNote(snapNoteId);
        noteIdMap.set(snapNoteId, page === pageId ? snapNoteId : this.uniqueNoteId());
      }
    }
    // Parents before children so parentNote refs resolve.
    const orderedSnapNotes = this.orderSnapshotNotes(
      Object.fromEntries(snapNotes.map(([id, def]) => [id, def])),
    );
    for (const snapNoteId of orderedSnapNotes) {
      const note = snap.notes[snapNoteId];
      if (!note) {
        continue;
      }
      const actualNoteId = noteIdMap.get(snapNoteId) ?? snapNoteId;
      const entry: NoteDef = {
        text: typeof note.text === 'string' ? note.text : '',
        order: typeof note.order === 'number' ? note.order : 1,
      };
      if (typeof note.color === 'string' && note.color) {
        entry.color = migrateColorId(normalizeHex(note.color) ?? note.color);
      }
      const icons = normalizeIcons(note.icons);
      if (icons) {
        entry.icons = icons;
      }
      if (note.locked === true) {
        entry.locked = true;
      }
      if (note.parentNote) {
        const parent = noteIdMap.get(note.parentNote) ?? note.parentNote;
        if (!this.data.notes[parent] && parent !== actualNoteId) {
          // Parent will be restored in this same pass when ordered correctly;
          // if missing from snap, skip nesting.
          if (!snap.notes[note.parentNote]) {
            continue;
          }
        }
        entry.parentNote = parent;
      } else if (note.markerId) {
        const markerId = idMap.get(note.markerId);
        if (!markerId || !this.data.markers[markerId]) {
          continue;
        }
        entry.markerId = markerId;
      } else if (note.page === pageId || (!note.page && !note.markerId && !note.parentNote)) {
        entry.page = pageId;
      } else if (typeof note.page === 'string' && this.data.pages[note.page]) {
        entry.page = note.page;
      } else {
        continue;
      }
      this.data.notes[actualNoteId] = entry;
    }

    const linkIdMap = new Map<string, string>();
    const snapLinks = Object.entries(snap.links ?? {});
    for (const [snapLinkId] of snapLinks) {
      const existing = this.data.links[snapLinkId];
      if (!existing) {
        linkIdMap.set(snapLinkId, snapLinkId);
      } else {
        const page = this.pageOfLink(snapLinkId);
        linkIdMap.set(snapLinkId, page === pageId ? snapLinkId : this.uniqueLinkId());
      }
    }
    const orderedSnapLinks = this.orderSnapshotLinks(
      Object.fromEntries(snapLinks.map(([id, def]) => [id, def])),
    );
    for (const snapLinkId of orderedSnapLinks) {
      const link = snap.links?.[snapLinkId];
      if (!link) {
        continue;
      }
      const actualLinkId = linkIdMap.get(snapLinkId) ?? snapLinkId;
      const entry: LinkDef = {
        label: typeof link.label === 'string' && link.label.trim() ? capitalize(link.label) : LINK_LAYOUT_LABEL,
        order: typeof link.order === 'number' ? link.order : 1,
      };
      if (typeof link.description === 'string' && link.description.trim()) {
        entry.description = link.description.trim();
      }
      if (typeof link.url === 'string' && link.url.trim()) {
        entry.url = link.url.trim();
      }
      if (typeof link.color === 'string' && link.color) {
        entry.color = migrateColorId(normalizeHex(link.color) ?? link.color);
      }
      if (link.locked === true) {
        entry.locked = true;
      }
      if (link.parent) {
        const parent = linkIdMap.get(link.parent) ?? link.parent;
        if (!snap.links?.[link.parent] && parent !== actualLinkId) {
          continue;
        }
        entry.parent = parent;
        delete entry.color;
      } else {
        entry.page = pageId;
      }
      this.data.links[actualLinkId] = entry;
    }
  }

  /** Parent markers before children. */
  private orderSnapshotMarkers(markers: Record<string, MarkerDef>): string[] {
    const result: string[] = [];
    const seen = new Set<string>();
    const visit = (id: string) => {
      if (seen.has(id) || !markers[id]) {
        return;
      }
      const parent = markers[id].parent;
      if (parent && markers[parent]) {
        visit(parent);
      }
      if (!seen.has(id)) {
        seen.add(id);
        result.push(id);
      }
    };
    for (const id of Object.keys(markers).sort(
      (a, b) => markers[a].order - markers[b].order || a.localeCompare(b),
    )) {
      visit(id);
    }
    return result;
  }

  /**
   * Stable fingerprint of catalog + page files (content only).
   * Layout folds live in pos_local; card order lives in page files.
   */
  private capture(): string {
    return this.captureSplitFingerprint();
  }

  private async save(): Promise<void> {
    await this.writeConfig(this.capture());
  }

  private async writeConfig(_json?: string): Promise<void> {
    await this.persistSplitConfig();
  }

  /** Nested catalog writes share one guard so a late watcher event cannot reload mid-switch. */
  private catalogWrites = 0;

  private holdCatalogWrite(): void {
    this.catalogWrites += 1;
    this.writingCatalog = true;
  }

  private releaseCatalogWrite(): void {
    this.catalogWrites = Math.max(0, this.catalogWrites - 1);
    if (this.catalogWrites > 0) {
      return;
    }
    setTimeout(() => {
      if (this.catalogWrites === 0) {
        this.writingCatalog = false;
      }
    }, 200);
  }

  private async persistBaseOnly(): Promise<void> {
    if (this.suspended) {
      return;
    }
    this.holdCatalogWrite();
    try {
      if (this.suspended) {
        return;
      }
      await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(this.baseUri, '..'));
      await vscode.workspace.fs.writeFile(
        this.baseUri,
        Buffer.from(stringifyBaseConfig(this.base), 'utf8'),
      );
    } finally {
      this.releaseCatalogWrite();
    }
  }

  /** Write root profile identity into BASE from local profilesData. */
  private mirrorRootProfilesToBase(bumpVersion = false): void {
    const next: BaseConfigFile['profiles'] = { ...this.base.profiles };
    for (const profile of this.profilesData.profiles) {
      const prev = next[profile.id];
      const version = bumpVersion ? (prev?.version ?? 1) + 1 : (prev?.version ?? 1);
      next[profile.id] = packBaseProfileEntry({
        profile,
        activeProjectId: prev?.activeProjectId ?? this.activeProjectId(),
        version,
      });
    }
    this.base.profiles = next;
  }

  private mirrorProfilesStylesToProject(bumpVersion = false): void {
    const project = this.ensureActiveProject();
    if (!project) {
      return;
    }
    for (const profile of this.profilesData.profiles) {
      const style = this.stylesData.styles[profile.id];
      if (!style) {
        continue;
      }
      const prev = project.profiles[profile.id];
      const version = bumpVersion ? (prev?.version ?? 1) + 1 : (prev?.version ?? 1);
      project.profiles[profile.id] = packProfileEntry({
        profile,
        style,
        pageLayouts: prev?.pageLayouts,
        version,
      });
    }
  }

  private syncProjectPagesFromData(project?: ProjectEntry): void {
    const target = project ?? this.ensureActiveProject();
    if (!target) {
      return;
    }
    const pages: Record<string, ProjectPageEntry> = {};
    for (const [id, page] of Object.entries(this.data.pages)) {
      pages[id] = projectPageEntryFromPage(page, target.pages[id]?.version ?? 1);
    }
    target.pages = pages;
  }

  private projectPageAccessFor(
    _pageId: string,
  ): { provider: 'github' | 'gitlab'; repoUrl: string } | undefined {
    return packProjectRepo(this.activeProject()?.repo);
  }

  private packPageFile(pageId: string): PageContentFile | undefined {
    const page = this.data.pages[pageId];
    if (!page) {
      return undefined;
    }
    const markerIds = this.markerIdsOnPage(pageId);
    const noteIds = Object.keys(this.data.notes).filter((id) => this.pageOfNote(id) === pageId);
    const linkIds = Object.keys(this.data.links).filter((id) => {
      const link = this.data.links[id];
      if (!link) {
        return false;
      }
      if (link.page === pageId) {
        return true;
      }
      let current: string | undefined = link.parent;
      const seen = new Set<string>();
      while (current && this.data.links[current] && !seen.has(current)) {
        seen.add(current);
        if (this.data.links[current].page === pageId) {
          return true;
        }
        current = this.data.links[current].parent;
      }
      return false;
    });
    return packPageConfig({
      pageId,
      markers: this.data.markers,
      items: this.data.items,
      added: this.data.added,
      aliases: this.data.aliases,
      classes: this.data.classes,
      classItems: this.data.classItems,
      classAdded: this.data.classAdded,
      notes: this.data.notes,
      links: this.data.links,
      markerIdsOnPage: markerIds,
      noteIdsOnPage: noteIds,
      linkIdsOnPage: linkIds,
      cloud: this.pageCloud[pageId],
    });
  }

  private reviewChannelId(): string {
    return (this.activeProjectChannels().review || '').trim();
  }

  private resolvePageChannel(pageId: string, kind: ReturnType<typeof pageKindToConfigKind>): string {
    if (!kind) {
      return '';
    }
    return resolveProjectChannel(this.activeProjectChannels(), kind);
  }

  private async syncReviewAccessFromProject(): Promise<void> {
    await this.accessStore?.ensureLoaded();
    const channelId = this.reviewChannelId();
    const project = this.activeProject();
    if (!project || !this.accessStore) {
      return;
    }
    const repo = packProjectRepo(project.repo);
    for (const [pageId, meta] of Object.entries(project.pages)) {
      if (meta.kind !== 'review') {
        continue;
      }
      const existing = this.accessStore.page(pageId);
      // An empty project review channel must not wipe a channel typed on the page.
      // Settings reads that page binding first.
      if (!channelId || !repo) {
        continue;
      }
      if (
        existing?.channelId === channelId &&
        existing.provider === repo.provider &&
        existing.repoUrl === repo.repoUrl
      ) {
        continue;
      }
      await this.accessStore.setPage(pageId, {
        provider: repo.provider,
        channelId,
        repoUrl: repo.repoUrl,
      });
    }
  }

  private async persistSplitConfig(): Promise<void> {
    if (this.suspended) {
      return;
    }
    this.holdCatalogWrite();
    try {
      await this.accessStore?.ensureLoaded();
      this.mirrorRootProfilesToBase(false);
      this.mirrorProfilesStylesToProject(false);
      this.syncProjectPagesFromData();
      if (this.suspended) {
        return;
      }
      await vscode.workspace.fs.createDirectory(this.pagesDirUri);
      // Keep page files for every project — switching/creating an empty project
      // must not wipe another project's content on disk.
      const keep = new Set<string>();
      for (const project of Object.values(this.base.projects)) {
        for (const pageId of Object.keys(project.pages)) {
          keep.add(pageId);
        }
      }
      for (const pageId of Object.keys(this.data.pages)) {
        keep.add(pageId);
      }
      try {
        for (const [name, type] of await vscode.workspace.fs.readDirectory(this.pagesDirUri)) {
          if (type !== vscode.FileType.File || !name.endsWith('.json')) {
            continue;
          }
          const id = name.slice(0, -'.json'.length);
          if (!keep.has(id)) {
            await vscode.workspace.fs.delete(this.pageUri(id));
          }
        }
      } catch {
        // pages dir may be empty
      }
      for (const pageId of keep) {
        const packed = this.packPageFile(pageId);
        if (!packed) {
          continue;
        }
        await vscode.workspace.fs.writeFile(
          this.pageUri(pageId),
          Buffer.from(stringifyPageConfig(packed), 'utf8'),
        );
      }
      await vscode.workspace.fs.writeFile(
        this.baseUri,
        Buffer.from(stringifyBaseConfig(this.base), 'utf8'),
      );
    } finally {
      this.releaseCatalogWrite();
    }
  }

  private captureSplitFingerprint(): string {
    this.syncProjectPagesFromData();
    const catalogPart = stringifyBaseConfig(this.base);
    const pageParts: string[] = [];
    for (const pageId of Object.keys(this.data.pages).sort()) {
      const packed = this.packPageFile(pageId);
      if (packed) {
        pageParts.push(pageId + '\n' + pageConfigContentJson(packed));
      }
    }
    return catalogPart + pageParts.join('\n');
  }

  private async reloadSplitFromDisk(notify: boolean, forceProjectId?: string): Promise<void> {
    let baseRaw: string;
    try {
      baseRaw = Buffer.from(await vscode.workspace.fs.readFile(this.baseUri)).toString('utf8');
    } catch (error) {
      if (!isFileNotFound(error)) {
        this.lastError = `Cannot read ${BASE_PATH}: ${error instanceof Error ? error.message : String(error)}`;
        this.changeEmitter.fire();
      }
      return;
    }
    const base = normalizeBaseConfig(JSON.parse(baseRaw));
    if (forceProjectId && base.projects[forceProjectId]) {
      const profileId = this.ensureActiveProfileId();
      const root = base.profiles[profileId] ?? {
        version: 1,
        name: profileId,
        sProfileIds: [] as string[],
      };
      base.profiles[profileId] = { ...root, activeProjectId: forceProjectId };
    }
    const droppedPlaceholder = this.omitPlaceholderProjects(base);
    const profileActive =
      base.profiles[this.ensureActiveProfileId()]?.activeProjectId ||
      Object.values(base.profiles).find((p) => p.activeProjectId && base.projects[p.activeProjectId])
        ?.activeProjectId;
    const projectId =
      (profileActive && base.projects[profileActive] ? profileActive : undefined) ||
      Object.keys(base.projects)[0];
    const pageIds = projectId ? Object.keys(base.projects[projectId]?.pages ?? {}) : [];
    const pageFiles: Record<string, PageContentFile> = {};
    for (const pageId of pageIds) {
      try {
        const raw = Buffer.from(await vscode.workspace.fs.readFile(this.pageUri(pageId))).toString(
          'utf8',
        );
        pageFiles[pageId] = normalizePageConfig(JSON.parse(raw));
      } catch (error) {
        if (!isFileNotFound(error)) {
          console.error('Syn3 page config:', pageId, error);
        }
      }
    }
    const assembled = assembleSplitWorkspace(base, pageFiles, projectId);
    const surfaces = this.posLocal.surfaces
      ? {
          explorer: { ...this.posLocal.surfaces.explorer },
          bottom: { ...this.posLocal.surfaces.bottom },
          left: { ...this.posLocal.surfaces.left },
          right: { ...this.posLocal.surfaces.right },
          open: { ...this.data.surfaces.open },
        }
      : this.data.surfaces;
    const next: MarkersFile = {
      version: 1,
      pages: assembled.pages,
      markers: assembled.markers,
      items: assembled.items,
      added: assembled.added,
      aliases: assembled.aliases,
      classes: assembled.classes,
      classItems: assembled.classItems,
      classAdded: assembled.classAdded,
      notes: assembled.notes,
      links: assembled.links,
      appearance: this.data.appearance,
      surfaces: surfaces ?? emptySurfaces(Object.keys(assembled.pages)[0] || DEFAULT_PAGE_ID),
    };
    this.base = assembled.base;
    if (droppedPlaceholder) {
      await this.persistBaseOnly();
    }
    this.pageCloud = assembled.pageCloud;
    this.usingSplitConfig = true;
    this.data = next;
    this.profilesData = { version: 1, profiles: assembled.profiles };
    this.stylesData = { version: 1, styles: assembled.styles };
    this.bindMachineToProfiles();
    await this.syncReviewAccessFromProject();
    if (this.positionsReady) {
      this.applyCollapsedFromLocal(this.posLocal.profiles[this.activeId] ?? emptyProfileLayout());
    }
    this.present = this.capture();
    this.baseline = undefined;
    this.pagePresent = this.captureAllPageSnapshots();
    this.lastError = undefined;
    if (notify) {
      this.changeEmitter.fire();
    }
  }

  private setItem(relPath: string, ids: string[]): void {
    if (ids.length === 0) {
      delete this.data.items[relPath];
      delete this.data.added[relPath];
      return;
    }
    this.data.items[relPath] = ids;
    const dates = this.data.added[relPath];
    if (dates) {
      for (const markerId of Object.keys(dates)) {
        if (!ids.includes(markerId)) {
          delete dates[markerId];
        }
      }
    }
  }

  private setClassItem(classId: string, ids: string[]): void {
    if (ids.length === 0) {
      delete this.data.classItems[classId];
      delete this.data.classAdded[classId];
      delete this.data.classes[classId];
      return;
    }
    this.data.classItems[classId] = ids;
    const dates = this.data.classAdded[classId];
    if (dates) {
      for (const markerId of Object.keys(dates)) {
        if (!ids.includes(markerId)) {
          delete dates[markerId];
        }
      }
    }
  }

  private setAdded(relPath: string, markerId: string, at: number): void {
    this.data.added[relPath] = { ...this.data.added[relPath], [markerId]: at };
  }

  private setClassAdded(classId: string, markerId: string, at: number): void {
    this.data.classAdded[classId] = { ...this.data.classAdded[classId], [markerId]: at };
  }

  private applyOrder(ordered: string[]): void {
    ordered.forEach((markerId, index) => {
      if (this.data.markers[markerId]) {
        this.data.markers[markerId].order = index + 1;
      }
    });
  }

  private applySiblingOrder(ordered: SiblingRef[]): void {
    ordered.forEach((item, index) => {
      if (item.kind === 'marker' && this.data.markers[item.id]) {
        this.data.markers[item.id].order = index + 1;
      }
      if (item.kind === 'note' && this.data.notes[item.id]) {
        this.data.notes[item.id].order = index + 1;
      }
    });
  }

  private maxSiblingOrder(siblings: SiblingRef[]): number {
    let max = 0;
    for (const s of siblings) {
      const order =
        s.kind === 'marker'
          ? this.data.markers[s.id]?.order
          : this.data.notes[s.id]?.order;
      if (typeof order === 'number' && order > max) {
        max = order;
      }
    }
    return max;
  }

  private applyPageOrder(ordered: string[]): void {
    ordered.forEach((pageId, index) => {
      if (this.data.pages[pageId]) {
        this.data.pages[pageId].order = index + 1;
      }
    });
  }

  private noteHomeOf(id: string): NoteHome | undefined {
    const def = this.data.notes[id];
    if (!def) {
      return undefined;
    }
    if (def.parentNote) {
      return { parentNote: def.parentNote };
    }
    if (def.markerId) {
      return { markerId: def.markerId };
    }
    if (def.page) {
      return { page: def.page };
    }
    return undefined;
  }

  private scopeOfNoteHome(home: NoteHome): {
    pageId?: string;
    markerId?: string;
    noteId?: string;
  } {
    if (home.parentNote) {
      return { noteId: home.parentNote };
    }
    if (home.markerId) {
      return { markerId: home.markerId };
    }
    return { pageId: home.page };
  }

  private setNoteHome(id: string, home: NoteHome): void {
    const def = this.data.notes[id];
    if (!def) {
      return;
    }
    delete def.page;
    delete def.markerId;
    delete def.parentNote;
    if (home.parentNote) {
      def.parentNote = home.parentNote;
    } else if (home.markerId) {
      def.markerId = home.markerId;
    } else {
      def.page = home.page;
    }
  }

  /** Root-first marker ids, including `id`. */
  private markerChain(id: string): string[] | undefined {
    if (!this.data.markers[id]) {
      return undefined;
    }
    const chain: string[] = [];
    const seen = new Set<string>();
    let current: string | undefined = id;
    while (current && this.data.markers[current] && !seen.has(current)) {
      seen.add(current);
      chain.push(current);
      current = this.data.markers[current].parent;
    }
    chain.reverse();
    return chain;
  }

  /** Outermost note first, including `id`. */
  private noteChain(id: string): string[] | undefined {
    if (!this.data.notes[id]) {
      return undefined;
    }
    const chain: string[] = [];
    const seen = new Set<string>();
    let current: string | undefined = id;
    while (current && this.data.notes[current] && !seen.has(current)) {
      seen.add(current);
      chain.push(current);
      current = this.data.notes[current].parentNote;
    }
    chain.reverse();
    return chain;
  }

  private sameNoteHome(a: NoteHome, b: NoteHome): boolean {
    if (a.parentNote || b.parentNote) {
      return a.parentNote === b.parentNote;
    }
    if (a.markerId || b.markerId) {
      return a.markerId === b.markerId;
    }
    return a.page === b.page;
  }

  /** Rewrite links that point at these cards. Call after their homes have changed. */
  private relinkEntities(groups: Iterable<string>, notes: Iterable<string>): void {
    const groupSet = new Set(groups);
    const noteSet = new Set(notes);
    if (groupSet.size === 0 && noteSet.size === 0) {
      return;
    }
    const mapUrl = (url: string): string | undefined => {
      const parsed = parseEntityLink(url);
      if (!parsed) {
        return undefined;
      }
      const leaf = parsed.ids[parsed.ids.length - 1];
      const hit = parsed.kind === 'group' ? groupSet.has(leaf) : noteSet.has(leaf);
      if (!hit) {
        return undefined;
      }
      const built = this.entityLinkOf(parsed.kind, leaf);
      if (!built || built === url) {
        return undefined;
      }
      return built;
    };
    let count = 0;
    for (const note of Object.values(this.data.notes)) {
      const next = mapNoteEntityLinks(note.text, mapUrl);
      if (next.count > 0) {
        note.text = next.text;
        count += next.count;
      }
    }
    for (const link of Object.values(this.data.links)) {
      if (!link.url) {
        continue;
      }
      const built = mapUrl(link.url.trim());
      if (!built) {
        continue;
      }
      link.url = built;
      count += 1;
    }
    if (count > 0) {
      this.refactorEpoch += 1;
    }
  }

  private relinkMarkerTree(id: string): void {
    const groups: string[] = [];
    const notes: string[] = [];
    for (const markerId of this.descendantMarkers(id, true)) {
      if (!this.data.markers[markerId]) {
        continue;
      }
      groups.push(markerId);
      for (const [noteId] of this.notesOf(markerId)) {
        notes.push(...this.descendantNotes(noteId, true));
      }
    }
    this.relinkEntities(groups, notes);
  }

  private relinkNoteTree(id: string): void {
    if (!this.data.notes[id]) {
      return;
    }
    this.relinkEntities([], this.descendantNotes(id, true));
  }

  private applyNoteLock(noteId: string, wasLocked: boolean): void {
    const def = this.data.notes[noteId];
    if (!def) {
      return;
    }
    if (wasLocked) {
      delete def.locked;
    } else {
      def.locked = true;
    }
    for (const [childId, child] of this.noteChildren(noteId)) {
      if ((child.locked === true) === wasLocked) {
        this.applyNoteLock(childId, wasLocked);
      }
    }
  }

  private unlinkMarkerAssignments(id: string): void {
    for (const [relPath, ids] of Object.entries(this.data.items)) {
      this.setItem(
        relPath,
        ids.filter((x) => x !== id),
      );
    }
    for (const [classId, ids] of Object.entries(this.data.classItems)) {
      this.setClassItem(
        classId,
        ids.filter((x) => x !== id),
      );
    }
  }

  private purgeNoteTree(noteId: string): void {
    for (const id of this.descendantNotes(noteId, true)) {
      delete this.data.notes[id];
      this.forgetCollapsed(id);
    }
  }

  private purgeLinkTree(linkId: string): void {
    for (const id of this.descendantLinks(linkId, true)) {
      delete this.data.links[id];
      this.forgetCollapsed(id);
    }
  }

  /**
   * Insert a root layout plus `childCount` components. Does not commit.
   * Returns the root id.
   */
  private insertLinkBranch(pageId: string, childCount: number): string {
    const rootId = this.insertLinkNode({
      label: LINK_LAYOUT_LABEL,
      page: pageId,
      color: this.nextLinkColor(pageId),
    });
    for (let i = 0; i < childCount; i++) {
      this.insertLinkNode({
        label: LINK_COMPONENT_LABEL,
        parent: rootId,
      });
    }
    return rootId;
  }

  /** Create a link node and append it to its sibling list. Does not commit. */
  private insertLinkNode(def: {
    label: string;
    page?: string;
    parent?: string;
    color?: string;
    description?: string;
    url?: string;
  }): string {
    const id = this.uniqueLinkId();
    const parent = def.parent && this.data.links[def.parent] ? def.parent : undefined;
    const page =
      parent === undefined
        ? def.page && this.data.pages[def.page]
          ? def.page
          : undefined
        : undefined;
    const siblings = parent
      ? this.linkChildren(parent).map(([linkId]) => linkId)
      : page
        ? this.rootLinks(page).map(([linkId]) => linkId)
        : [];
    const entry: LinkDef = {
      label: capitalize(def.label),
      order: siblings.length + 1,
    };
    if (parent) {
      entry.parent = parent;
    } else if (page) {
      entry.page = page;
    }
    if (def.color && !parent) {
      entry.color = def.color;
    }
    if (def.description?.trim()) {
      entry.description = def.description.trim();
    }
    if (def.url?.trim()) {
      entry.url = def.url.trim();
    }
    this.data.links[id] = entry;
    siblings.push(id);
    this.applyLinkSiblingOrder(page, parent, siblings);
    return id;
  }

  /** Next unused link-palette hex on the page; wraps when every tone is taken. */
  private nextLinkColor(pageId: string, excludeId?: string): string {
    const used = new Set(
      this.rootLinks(pageId)
        .filter(([id]) => id !== excludeId)
        .map(([, def]) => def.color?.toLowerCase())
        .filter((c): c is string => !!c),
    );
    const free = LINK_PALETTE_HEX.find((hex) => !used.has(hex.toLowerCase()));
    if (free) {
      return free;
    }
    const roots = this.rootLinks(pageId).filter(([id]) => id !== excludeId);
    const index = roots.length % LINK_PALETTE_HEX.length;
    return LINK_PALETTE_HEX[index] ?? LINK_PALETTE_DEFAULT;
  }

  /**
   * Replace root link colors that are outside the fixed link palette.
   * Returns true when any color changed (caller should commit).
   */
  private remapOutOfPaletteLinkColors(): boolean {
    let changed = false;
    for (const def of Object.values(this.data.links)) {
      if (def.parent) {
        continue;
      }
      const current = def.color ? normalizeHex(def.color) ?? def.color : '';
      if (current && isLinkPaletteColor(current)) {
        if (def.color !== current) {
          def.color = current;
          changed = true;
        }
        continue;
      }
      def.color = randomLinkPaletteColor();
      changed = true;
    }
    return changed;
  }

  private setLinkHome(id: string, home: { page: string; parent?: undefined } | { parent: string; page?: undefined }): void {
    const def = this.data.links[id];
    if (!def) {
      return;
    }
    delete def.page;
    delete def.parent;
    if (home.parent) {
      def.parent = home.parent;
      delete def.color;
    } else {
      def.page = home.page;
    }
  }

  /** Remove from sibling list without deleting the node. */
  private detachLink(id: string): void {
    const def = this.data.links[id];
    if (!def) {
      return;
    }
    if (def.parent) {
      const siblings = this.linkChildren(def.parent)
        .map(([linkId]) => linkId)
        .filter((linkId) => linkId !== id);
      this.applyLinkSiblingOrder(undefined, def.parent, siblings);
    } else if (def.page) {
      const siblings = this.rootLinks(def.page)
        .map(([linkId]) => linkId)
        .filter((linkId) => linkId !== id);
      this.applyLinkSiblingOrder(def.page, undefined, siblings);
    }
  }

  private applyLinkSiblingOrder(
    pageId: string | undefined,
    parentId: string | undefined,
    orderedIds: string[],
  ): void {
    orderedIds.forEach((id, index) => {
      const def = this.data.links[id];
      if (!def) {
        return;
      }
      def.order = index + 1;
      if (parentId) {
        def.parent = parentId;
        delete def.page;
      } else if (pageId) {
        def.page = pageId;
        delete def.parent;
      }
    });
  }

  /**
   * Deep-clone a link subtree. When `asRoot`, the clone becomes a page root with a fresh color.
   * Returns the new root id.
   */
  private cloneLinkTree(id: string, options: { asRoot: boolean }): string | undefined {
    const source = this.data.links[id];
    if (!source) {
      return undefined;
    }
    const pageId = this.pageOfLink(id);
    if (!pageId) {
      return undefined;
    }
    const idMap = new Map<string, string>();
    const visit = (srcId: string, parentClone?: string): string => {
      const src = this.data.links[srcId];
      const newId = this.uniqueLinkId();
      idMap.set(srcId, newId);
      const entry: LinkDef = {
        label: src.label,
        order: 1,
      };
      if (src.description) {
        entry.description = src.description;
      }
      if (src.url) {
        entry.url = src.url;
      }
      if (src.locked) {
        entry.locked = true;
      }
      if (parentClone) {
        entry.parent = parentClone;
      } else if (options.asRoot || !src.parent) {
        entry.page = pageId;
        entry.color = this.nextLinkColor(pageId);
      }
      this.data.links[newId] = entry;
      for (const [childId] of this.linkChildren(srcId)) {
        visit(childId, newId);
      }
      return newId;
    };
    const rootClone = visit(id);
    // Fix sibling orders under each parent in the clone.
    const reordering = new Set<string | undefined>([undefined]);
    for (const newId of idMap.values()) {
      const def = this.data.links[newId];
      if (def?.parent) {
        reordering.add(def.parent);
      }
    }
    for (const parent of reordering) {
      if (parent === undefined) {
        continue;
      }
      const kids = this.linkChildren(parent).map(([linkId]) => linkId);
      this.applyLinkSiblingOrder(undefined, parent, kids);
    }
    if (options.asRoot || !source.parent) {
      const roots = this.rootLinks(pageId).map(([linkId]) => linkId);
      if (!roots.includes(rootClone)) {
        roots.unshift(rootClone);
      }
      this.applyLinkSiblingOrder(pageId, undefined, roots);
    }
    return rootClone;
  }

  private uniqueLinkId(): string {
    let counter = 1;
    let id = `link-${counter}`;
    while (this.data.links[id]) {
      id = `link-${++counter}`;
    }
    return id;
  }

  private packLink(linkId: string, def: LinkDef, pageId: string): LinkDef | undefined {
    if (this.pageOfLink(linkId) !== pageId) {
      return undefined;
    }
    return this.packLinkForPersist(def);
  }

  private packLinkForPersist(def: LinkDef): LinkDef | undefined {
    const entry: LinkDef = { label: def.label, order: def.order };
    if (def.description) {
      entry.description = def.description;
    }
    if (def.url) {
      entry.url = def.url;
    }
    if (def.locked) {
      entry.locked = true;
    }
    if (def.parent) {
      if (!this.data.links[def.parent]) {
        return undefined;
      }
      entry.parent = def.parent;
    } else if (def.page && this.data.pages[def.page]) {
      entry.page = def.page;
      if (def.color) {
        entry.color = def.color;
      }
    } else {
      return undefined;
    }
    return entry;
  }

  private packLinkContent(def: LinkDef): Record<string, unknown> | undefined {
    const packed = this.packLinkForPersist(def);
    if (!packed) {
      return undefined;
    }
    const { order: _order, ...rest } = packed;
    return rest;
  }

  private orderSnapshotLinks(links: Record<string, LinkDef>): string[] {
    const result: string[] = [];
    const seen = new Set<string>();
    const visit = (id: string) => {
      if (seen.has(id) || !links[id]) {
        return;
      }
      const parent = links[id].parent;
      if (parent && links[parent]) {
        visit(parent);
      }
      if (!seen.has(id)) {
        seen.add(id);
        result.push(id);
      }
    };
    for (const id of Object.keys(links).sort(
      (a, b) => links[a].order - links[b].order || a.localeCompare(b),
    )) {
      visit(id);
    }
    return result;
  }

  private packNote(
    noteId: string,
    note: NoteDef,
    pageId: string,
    markerSet: Set<string>,
  ): NoteDef | undefined {
    if (this.pageOfNote(noteId) !== pageId) {
      return undefined;
    }
    if (note.markerId && !markerSet.has(note.markerId)) {
      return undefined;
    }
    if (note.parentNote && !this.data.notes[note.parentNote]) {
      return undefined;
    }
    return this.packNoteForPersist(noteId, note);
  }

  private packNoteForPersist(_id: string, def: NoteDef): NoteDef | undefined {
    const withIcons = (entry: NoteDef): NoteDef => {
      if (def.icons?.length) {
        entry.icons = def.icons.slice(0, MAX_BADGE_ICONS);
      }
      return entry;
    };
    if (def.parentNote) {
      if (!this.data.notes[def.parentNote]) {
        return undefined;
      }
      const entry: NoteDef = { parentNote: def.parentNote, text: def.text, order: def.order };
      if (def.color) {
        entry.color = def.color;
      }
      if (def.locked) {
        entry.locked = true;
      }
      return withIcons(entry);
    }
    if (def.markerId) {
      if (!this.data.markers[def.markerId]) {
        return undefined;
      }
      const entry: NoteDef = { markerId: def.markerId, text: def.text, order: def.order };
      if (def.color) {
        entry.color = def.color;
      }
      if (def.locked) {
        entry.locked = true;
      }
      return withIcons(entry);
    }
    if (def.page && this.data.pages[def.page]) {
      const entry: NoteDef = { page: def.page, text: def.text, order: def.order };
      if (def.color) {
        entry.color = def.color;
      }
      if (def.locked) {
        entry.locked = true;
      }
      return withIcons(entry);
    }
    return undefined;
  }

  /** Content-only note for syn3.json — order lives in pos files. */
  private packNoteContent(_id: string, def: NoteDef): Record<string, unknown> | undefined {
    const packed = this.packNoteForPersist(_id, def);
    if (!packed) {
      return undefined;
    }
    const { order: _order, ...rest } = packed;
    return rest;
  }

  private orderSnapshotNotes(notes: Record<string, NoteDef>): string[] {
    const result: string[] = [];
    const seen = new Set<string>();
    const visit = (id: string) => {
      if (seen.has(id) || !notes[id]) {
        return;
      }
      const parent = notes[id].parentNote;
      if (parent && notes[parent]) {
        visit(parent);
      }
      if (!seen.has(id)) {
        seen.add(id);
        result.push(id);
      }
    };
    for (const id of Object.keys(notes).sort(
      (a, b) => notes[a].order - notes[b].order || a.localeCompare(b),
    )) {
      visit(id);
    }
    return result;
  }

  private forgetCollapsed(id: string): void {
    for (const page of Object.values(this.data.pages)) {
      for (const surface of MAP_SURFACES) {
        delete page.collapsed[surface][id];
      }
    }
  }

  /** Flat fold map from before folds were stored per surface. Used only to recognize an existing undo cursor. */
  private legacyCollapsed(def: PageDef, markerSet: Set<string>): Record<string, boolean> {
    const collapsed: Record<string, boolean> = {};
    for (const markerId of Object.keys(def.collapsed.explorer).sort()) {
      if (def.collapsed.explorer[markerId] && markerSet.has(markerId)) {
        collapsed[markerId] = true;
      }
    }
    return collapsed;
  }

  /** Drop a marker and its item/class links without committing. Notes must be purged separately. */
  private purgeMarker(id: string): void {
    delete this.data.markers[id];
    this.forgetCollapsed(id);
    this.unlinkMarkerAssignments(id);
  }

  private uniqueId(label: string): string {
    return this.uniqueMarkerId(label, new Set());
  }

  private uniqueMarkerId(label: string, reserved: Set<string>): string {
    const base =
      label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'marker';
    let id = base;
    let counter = 2;
    while (this.data.markers[id] || reserved.has(id)) {
      id = `${base}-${counter++}`;
    }
    reserved.add(id);
    return id;
  }

  private uniquePageId(name: string, kind: PageKind): string {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const kindSlug = kind === 'files' ? 'explorer' : kind;
    const base = slug ? `page-${slug}` : `page-${kindSlug}`;
    let id = base;
    let counter = 2;
    while (this.data.pages[id]) {
      id = `${base}-${counter++}`;
    }
    return id;
  }

  private uniqueNoteId(): string {
    let counter = 1;
    let id = `note-${counter}`;
    while (this.data.notes[id]) {
      id = `note-${++counter}`;
    }
    return id;
  }

  private uniqueClassId(name: string): string {
    const base =
      'cls-' +
      (name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'class');
    let id = base;
    let counter = 2;
    while (this.data.classes[id]) {
      id = `${base}-${counter++}`;
    }
    return id;
  }
}

async function fileExists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

/** `sgroup.red` and `vgroup.red` from older files → `syn3.red`. */
function migrateColorId(color: string): string {
  const prefix = ['sgroup.', 'vgroup.'].find((item) => color.startsWith(item));
  return prefix ? `syn3.${color.slice(prefix.length)}` : color;
}

function packFlags(flags: Record<string, boolean> | undefined): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const markerId of Object.keys(flags ?? {}).sort()) {
    if (flags?.[markerId]) {
      result[markerId] = true;
    }
  }
  return result;
}

export function packCollapsed(collapsed: SurfaceCollapsed): SurfaceCollapsed {
  return {
    explorer: packFlags(collapsed.explorer),
    bottom: packFlags(collapsed.bottom),
    left: packFlags(collapsed.left),
    right: packFlags(collapsed.right),
  };
}

function packSurfaces(
  surfaces: SurfacesState,
  pages: Record<string, PageDef>,
  fallbackPage: string,
): SurfacesState {
  const pageOrFallback = (pageId: string) => (pageId in pages ? pageId : fallbackPage);
  return {
    explorer: { page: pageOrFallback(surfaces.explorer.page) },
    bottom: { page: pageOrFallback(surfaces.bottom.page) },
    left: { page: pageOrFallback(surfaces.left.page) },
    right: { page: pageOrFallback(surfaces.right.page) },
    open: {
      bottom: !!surfaces.open.bottom,
      left: !!surfaces.open.left,
      right: !!surfaces.open.right,
    },
  };
}

function flagMap(raw: unknown): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return result;
  }
  for (const [markerId, on] of Object.entries(raw as Record<string, unknown>)) {
    if (on === true) {
      result[markerId] = true;
    }
  }
  return result;
}

/** Accepts the per-surface object, or the older flat `{ markerId: true }` shared by every surface. */
function normalizeCollapsed(raw: unknown): SurfaceCollapsed {
  const collapsed = emptyCollapsed();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return collapsed;
  }
  const source = raw as Record<string, unknown>;
  const legacyKeys = [...MAP_SURFACES, 'sidebar'] as const;
  const perSurface = legacyKeys.some((surface) => {
    const value = source[surface];
    return !!value && typeof value === 'object' && !Array.isArray(value);
  });
  if (perSurface) {
    for (const surface of MAP_SURFACES) {
      collapsed[surface] = flagMap(source[surface]);
    }
    const sidebar = flagMap(source.sidebar);
    if (Object.keys(sidebar).length > 0) {
      if (Object.keys(collapsed.left).length === 0) {
        collapsed.left = { ...sidebar };
      }
      if (Object.keys(collapsed.right).length === 0) {
        collapsed.right = { ...sidebar };
      }
    }
    return collapsed;
  }
  const shared = flagMap(source);
  for (const surface of MAP_SURFACES) {
    collapsed[surface] = { ...shared };
  }
  return collapsed;
}

function normalizeSurfaces(
  raw: unknown,
  pages: Record<string, PageDef>,
  fallbackPage: string,
): SurfacesState {
  const result = emptySurfaces(fallbackPage);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return result;
  }
  const source = raw as Record<string, unknown>;
  for (const surface of MAP_SURFACES) {
    const entry = source[surface];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      continue;
    }
    const page = (entry as { page?: unknown }).page;
    if (typeof page === 'string' && page in pages) {
      result[surface] = { page };
    }
  }
  const open = source.open;
  if (open && typeof open === 'object' && !Array.isArray(open)) {
    const flags = open as Record<string, unknown>;
    for (const side of OPEN_SURFACES) {
      result.open[side] = flags[side] === true;
    }
  }
  return result;
}

function normalizeProfiles(raw: unknown): ProfilesFile {
  const result = emptyProfiles();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return result;
  }
  const source = raw as { profiles?: unknown };
  const profiles: StyleProfile[] = [];
  const seen = new Set<string>();
  let generalIds: string[] = [];
  if (Array.isArray(source.profiles)) {
    for (const entry of source.profiles) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        continue;
      }
      const item = entry as {
        id?: unknown;
        name?: unknown;
        sProfileIds?: unknown;
        reviewSkillPath?: unknown;
        reviewDirPath?: unknown;
        reviewModel?: unknown;
        reviewFixModel?: unknown;
        githubNick?: unknown;
        gitlabNick?: unknown;
      };
      if (typeof item.id !== 'string' || !item.id.trim()) {
        continue;
      }
      const id = item.id.trim();
      const sProfileIds = normalizeSProfileIds(item.sProfileIds);
      const reviewSkillPath =
        typeof item.reviewSkillPath === 'string' ? item.reviewSkillPath.trim() : undefined;
      const reviewDirPath =
        typeof item.reviewDirPath === 'string' ? item.reviewDirPath.trim() : undefined;
      const reviewModel =
        typeof item.reviewModel === 'string' ? item.reviewModel.trim() : undefined;
      const reviewFixModel =
        typeof item.reviewFixModel === 'string' ? item.reviewFixModel.trim() : undefined;
      const githubNick = normalizeGitNick(item.githubNick);
      const gitlabNick = normalizeGitNick(item.gitlabNick);
      if (id === GENERAL_PROFILE_ID) {
        generalIds = sProfileIds;
        result.profiles[0] = {
          id: GENERAL_PROFILE_ID,
          name: GENERAL_PROFILE_NAME,
          sProfileIds: generalIds,
          ...(reviewSkillPath ? { reviewSkillPath } : {}),
          ...(reviewDirPath ? { reviewDirPath } : {}),
          ...(reviewModel ? { reviewModel } : {}),
          ...(reviewFixModel ? { reviewFixModel } : {}),
          ...(githubNick ? { githubNick } : {}),
          ...(gitlabNick ? { gitlabNick } : {}),
        };
        continue;
      }
      if (seen.has(id)) {
        continue;
      }
      const name =
        typeof item.name === 'string' && item.name.trim() ? item.name.trim() : id;
      if (name.toLocaleLowerCase() === GENERAL_PROFILE_NAME.toLocaleLowerCase()) {
        continue;
      }
      seen.add(id);
      profiles.push({
        id,
        name,
        sProfileIds,
        ...(reviewSkillPath ? { reviewSkillPath } : {}),
        ...(reviewDirPath ? { reviewDirPath } : {}),
        ...(reviewModel ? { reviewModel } : {}),
        ...(reviewFixModel ? { reviewFixModel } : {}),
        ...(githubNick ? { githubNick } : {}),
        ...(gitlabNick ? { gitlabNick } : {}),
      });
    }
  }
  const general = result.profiles[0] ?? {
    id: GENERAL_PROFILE_ID,
    name: GENERAL_PROFILE_NAME,
    sProfileIds: generalIds,
  };
  result.profiles = [general, ...profiles];
  return result;
}

function normalizePanelOpen(raw: unknown, fallback: PanelOpenState = emptyPanelOpen()): PanelOpenState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...fallback };
  }
  const source = raw as Partial<Record<OpenSurface, unknown>>;
  return {
    bottom: typeof source.bottom === 'boolean' ? source.bottom : fallback.bottom,
    left: typeof source.left === 'boolean' ? source.left : fallback.left,
    right: typeof source.right === 'boolean' ? source.right : fallback.right,
  };
}

function normalizeProfileStyle(raw: unknown, fallbackOpen: PanelOpenState = emptyPanelOpen()): ProfileStyle {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      appearance: { ...DEFAULT_APPEARANCE },
      open: { ...fallbackOpen },
    };
  }
  const source = raw as { appearance?: unknown; open?: unknown; fontGroup?: unknown };
  // Legacy flat appearance object (pre-panels).
  if (!('appearance' in source) && !('open' in source) && 'fontGroup' in source) {
    return {
      appearance: normalizeAppearance(raw),
      open: { ...fallbackOpen },
    };
  }
  return {
    appearance: normalizeAppearance(source.appearance ?? raw),
    open: normalizePanelOpen(source.open, fallbackOpen),
  };
}

function normalizeStyles(raw: unknown, fallbackOpen: PanelOpenState = emptyPanelOpen()): StylesFile {
  const result = emptyStyles(DEFAULT_APPEARANCE, fallbackOpen);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return result;
  }
  const source = raw as { styles?: unknown };
  if (!source.styles || typeof source.styles !== 'object' || Array.isArray(source.styles)) {
    return result;
  }
  const styles: Record<string, ProfileStyle> = {};
  for (const [id, value] of Object.entries(source.styles as Record<string, unknown>)) {
    styles[id] = normalizeProfileStyle(value, fallbackOpen);
  }
  if (!styles[GENERAL_PROFILE_ID]) {
    styles[GENERAL_PROFILE_ID] = {
      appearance: normalizeAppearance(DEFAULT_APPEARANCE),
      open: { ...fallbackOpen },
    };
  }
  return { version: 1, styles };
}

function normalize(raw: unknown): MarkersFile {
  const result = emptyData();
  if (!raw || typeof raw !== 'object') {
    return result;
  }
  const source = raw as {
    pages?: unknown;
    markers?: unknown;
    items?: unknown;
    added?: unknown;
    aliases?: unknown;
    classes?: unknown;
    classItems?: unknown;
    classAdded?: unknown;
    notes?: unknown;
    links?: unknown;
    appearance?: unknown;
    surfaces?: unknown;
  };
  result.appearance = normalizeAppearance(source.appearance);

  if (source.pages && typeof source.pages === 'object') {
    result.pages = {};
    let index = 0;
    for (const [id, value] of Object.entries(source.pages as Record<string, unknown>)) {
      index++;
      if (!value || typeof value !== 'object') {
        continue;
      }
      const def = value as Partial<PageDef>;
      const kind = normalizePageKind(def.kind) ?? 'files';
      const name =
        typeof def.name === 'string' && def.name.trim() ? capitalize(def.name.trim()) : capitalize(id);
      const description = normalizeGroupDescription(def.description);
      result.pages[id] = {
        name,
        kind,
        ...(description ? { description } : {}),
        order: typeof def.order === 'number' ? def.order : index,
        layout: normalizeMapLayout(def.layout),
        groupsLayout: normalizeGroupsLayout(def.groupsLayout),
        collapsed: normalizeCollapsed(def.collapsed),
      };
    }
  }
  if (Object.keys(result.pages).length > MAX_PAGES) {
    const keep = Object.entries(result.pages)
      .sort((a, b) => a[1].order - b[1].order || a[0].localeCompare(b[0]))
      .slice(0, MAX_PAGES);
    result.pages = Object.fromEntries(keep);
  }

  if (source.markers && typeof source.markers === 'object') {
    let index = 0;
    for (const [id, value] of Object.entries(source.markers as Record<string, unknown>)) {
      index++;
      if (!value || typeof value !== 'object') {
        continue;
      }
      const def = value as Partial<MarkerDef>;
      const parent = typeof def.parent === 'string' && def.parent ? def.parent : undefined;
      const page =
        !parent && typeof def.page === 'string' && def.page in result.pages ? def.page : undefined;
      const icons = normalizeIcons(
        (def as { icons?: unknown }).icons,
        (def as { icon?: unknown }).icon,
      );
      const description = normalizeGroupDescription(def.description);
      result.markers[id] = {
        label: capitalize(typeof def.label === 'string' && def.label.trim() ? def.label : id),
        color: typeof def.color === 'string' && def.color ? migrateColorId(normalizeHex(def.color) ?? def.color) : undefined,
        ...(icons ? { icons } : {}),
        alias: typeof def.alias === 'string' && def.alias.trim() ? def.alias.trim() : undefined,
        ...(description ? { description } : {}),
        parent,
        page,
        columns: normalizeColumns(def.columns),
        locked: def.locked === true ? true : undefined,
        order: typeof def.order === 'number' ? def.order : index,
      };
    }
  }

  repairParents(result.markers);

  const fallbackPage =
    Object.entries(result.pages)
      .sort((a, b) => a[1].order - b[1].order || a[0].localeCompare(b[0]))
      .find(([, p]) => p.kind === 'files')?.[0] ?? Object.keys(result.pages)[0];
  result.surfaces = normalizeSurfaces(source.surfaces, result.pages, fallbackPage);
  for (const def of Object.values(result.markers)) {
    if (def.parent) {
      delete def.page;
    } else if (!def.page || !(def.page in result.pages)) {
      def.page = fallbackPage;
    }
  }

  if (source.items && typeof source.items === 'object') {
    for (const [relPath, value] of Object.entries(source.items as Record<string, unknown>)) {
      if (!Array.isArray(value)) {
        continue;
      }
      const ids = value.filter((id): id is string => typeof id === 'string' && id in result.markers);
      if (ids.length > 0) {
        result.items[normalizePath(relPath)] = [...new Set(ids)];
      }
    }
  }

  if (source.added && typeof source.added === 'object') {
    for (const [relPath, value] of Object.entries(source.added as Record<string, unknown>)) {
      const key = normalizePath(relPath);
      const ids = result.items[key];
      if (!ids || !value || typeof value !== 'object') {
        continue;
      }
      const dates: Record<string, number> = {};
      for (const [markerId, at] of Object.entries(value as Record<string, unknown>)) {
        if (ids.includes(markerId) && typeof at === 'number' && Number.isFinite(at)) {
          dates[markerId] = at;
        }
      }
      if (Object.keys(dates).length > 0) {
        result.added[key] = dates;
      }
    }
  }

  if (source.aliases && typeof source.aliases === 'object') {
    for (const [relPath, value] of Object.entries(source.aliases as Record<string, unknown>)) {
      if (typeof value === 'string' && value.trim()) {
        result.aliases[normalizePath(relPath)] = value.trim();
      }
    }
  }

  if (source.classes && typeof source.classes === 'object') {
    for (const [classId, value] of Object.entries(source.classes as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') {
        continue;
      }
      const def = value as Partial<ClassDef>;
      const relPath = typeof def.relPath === 'string' ? normalizePath(def.relPath) : '';
      const name = typeof def.name === 'string' ? def.name.trim() : '';
      if (!relPath || !name) {
        continue;
      }
      const line =
        typeof def.line === 'number' && Number.isFinite(def.line) && def.line > 0
          ? Math.floor(def.line)
          : undefined;
      const alias = typeof def.alias === 'string' && def.alias.trim() ? def.alias.trim() : undefined;
      result.classes[classId] = { relPath, name, line, ...(alias ? { alias } : {}) };
    }
  }

  if (source.classItems && typeof source.classItems === 'object') {
    for (const [classId, value] of Object.entries(source.classItems as Record<string, unknown>)) {
      if (!result.classes[classId] || !Array.isArray(value)) {
        continue;
      }
      const ids = value.filter((id): id is string => typeof id === 'string' && id in result.markers);
      if (ids.length > 0) {
        result.classItems[classId] = [...new Set(ids)];
      } else {
        delete result.classes[classId];
      }
    }
  }

  for (const classId of Object.keys(result.classes)) {
    if (!result.classItems[classId]?.length) {
      delete result.classes[classId];
    }
  }

  if (source.classAdded && typeof source.classAdded === 'object') {
    for (const [classId, value] of Object.entries(source.classAdded as Record<string, unknown>)) {
      const ids = result.classItems[classId];
      if (!ids || !value || typeof value !== 'object') {
        continue;
      }
      const dates: Record<string, number> = {};
      for (const [markerId, at] of Object.entries(value as Record<string, unknown>)) {
        if (ids.includes(markerId) && typeof at === 'number' && Number.isFinite(at)) {
          dates[markerId] = at;
        }
      }
      if (Object.keys(dates).length > 0) {
        result.classAdded[classId] = dates;
      }
    }
  }

  if (source.notes && typeof source.notes === 'object') {
    let index = 0;
    const rawNotes = Object.entries(source.notes as Record<string, unknown>);
    // First pass: notes without parentNote (page / marker homes).
    for (const [id, value] of rawNotes) {
      index++;
      if (!value || typeof value !== 'object') {
        continue;
      }
      const def = value as Partial<NoteDef>;
      if (typeof def.parentNote === 'string' && def.parentNote) {
        continue;
      }
      const text = typeof def.text === 'string' ? def.text.trim() : '';
      const order = typeof def.order === 'number' ? def.order : index;
      const locked = def.locked === true ? true : undefined;
      const color =
        typeof def.color === 'string' && def.color
          ? migrateColorId(normalizeHex(def.color) ?? def.color)
          : undefined;
      const page = typeof def.page === 'string' ? def.page : undefined;
      const markerId = typeof def.markerId === 'string' ? def.markerId : undefined;
      const icons = normalizeIcons(
        (def as { icons?: unknown }).icons,
        (def as { icon?: unknown }).icon,
      );
      if (page && page in result.pages && !markerId) {
        result.notes[id] = {
          page,
          text,
          order,
          ...(color ? { color } : { color: NOTE_ROOT_COLOR }),
          ...(icons ? { icons } : {}),
          ...(locked ? { locked: true as const } : {}),
        };
        continue;
      }
      if (markerId && markerId in result.markers) {
        result.notes[id] = {
          markerId,
          text,
          order,
          ...(color ? { color } : {}),
          ...(icons ? { icons } : {}),
          ...(locked ? { locked: true as const } : {}),
        };
      }
    }
    // Second pass: nested notes (parentNote must already exist or be added in order).
    let changed = true;
    while (changed) {
      changed = false;
      for (const [id, value] of rawNotes) {
        if (result.notes[id] || !value || typeof value !== 'object') {
          continue;
        }
        const def = value as Partial<NoteDef>;
        const parentNote = typeof def.parentNote === 'string' ? def.parentNote : undefined;
        if (!parentNote || !(parentNote in result.notes)) {
          continue;
        }
        const text = typeof def.text === 'string' ? def.text.trim() : '';
        const order = typeof def.order === 'number' ? def.order : ++index;
        const color =
          typeof def.color === 'string' && def.color
            ? migrateColorId(normalizeHex(def.color) ?? def.color)
            : undefined;
        const icons = normalizeIcons(
          (def as { icons?: unknown }).icons,
          (def as { icon?: unknown }).icon,
        );
        result.notes[id] = {
          parentNote,
          text,
          order,
          ...(color ? { color } : {}),
          ...(icons ? { icons } : {}),
          ...(def.locked === true ? { locked: true as const } : {}),
        };
        changed = true;
      }
    }

    // Legacy: notes and subgroups used separate order spaces; keep notes first.
    const bumpMarkersAfterNotes = (
      noteOrders: number[],
      markerIds: string[],
    ) => {
      if (noteOrders.length === 0 || markerIds.length === 0) {
        return;
      }
      const maxNote = Math.max(...noteOrders);
      const sorted = markerIds
        .slice()
        .sort(
          (a, b) =>
            (result.markers[a]?.order ?? 0) - (result.markers[b]?.order ?? 0) ||
            a.localeCompare(b),
        );
      sorted.forEach((markerId, i) => {
        if (result.markers[markerId]) {
          result.markers[markerId].order = maxNote + 1 + i;
        }
      });
    };
    for (const pageId of Object.keys(result.pages)) {
      const rootNoteOrders = Object.values(result.notes)
        .filter((n) => n.page === pageId)
        .map((n) => n.order);
      const rootMarkers = Object.entries(result.markers)
        .filter(([, m]) => !m.parent && m.page === pageId)
        .map(([id]) => id);
      bumpMarkersAfterNotes(rootNoteOrders, rootMarkers);
    }
    for (const markerId of Object.keys(result.markers)) {
      const noteOrders = Object.values(result.notes)
        .filter((n) => n.markerId === markerId)
        .map((n) => n.order);
      const childMarkers = Object.entries(result.markers)
        .filter(([, m]) => m.parent === markerId)
        .map(([id]) => id);
      bumpMarkersAfterNotes(noteOrders, childMarkers);
    }
  }

  if (source.links && typeof source.links === 'object') {
    let index = 0;
    const rawLinks = Object.entries(source.links as Record<string, unknown>);
    for (const [id, value] of rawLinks) {
      index++;
      if (!value || typeof value !== 'object') {
        continue;
      }
      const def = value as Partial<LinkDef>;
      if (typeof def.parent === 'string' && def.parent) {
        continue;
      }
      const label =
        typeof def.label === 'string' && def.label.trim()
          ? capitalize(def.label)
          : LINK_LAYOUT_LABEL;
      const order = typeof def.order === 'number' ? def.order : index;
      const page = typeof def.page === 'string' ? def.page : undefined;
      if (!page || !(page in result.pages)) {
        continue;
      }
      const color =
        typeof def.color === 'string' && def.color
          ? migrateColorId(normalizeHex(def.color) ?? def.color)
          : LINK_PALETTE_DEFAULT;
      const entry: LinkDef = {
        page,
        label,
        order,
        color,
      };
      if (typeof def.description === 'string' && def.description.trim()) {
        entry.description = def.description.trim();
      }
      if (typeof def.url === 'string' && def.url.trim()) {
        entry.url = def.url.trim();
      }
      if (def.locked === true) {
        entry.locked = true;
      }
      result.links[id] = entry;
    }
    let changed = true;
    while (changed) {
      changed = false;
      for (const [id, value] of rawLinks) {
        if (result.links[id] || !value || typeof value !== 'object') {
          continue;
        }
        const def = value as Partial<LinkDef>;
        const parent = typeof def.parent === 'string' ? def.parent : undefined;
        if (!parent || !(parent in result.links)) {
          continue;
        }
        const label =
          typeof def.label === 'string' && def.label.trim()
            ? capitalize(def.label)
            : LINK_COMPONENT_LABEL;
        const order = typeof def.order === 'number' ? def.order : ++index;
        const entry: LinkDef = {
          parent,
          label,
          order,
        };
        if (typeof def.description === 'string' && def.description.trim()) {
          entry.description = def.description.trim();
        }
        if (typeof def.url === 'string' && def.url.trim()) {
          entry.url = def.url.trim();
        }
        if (def.locked === true) {
          entry.locked = true;
        }
        result.links[id] = entry;
        changed = true;
      }
    }
  }

  for (const page of Object.values(result.pages)) {
    for (const surface of MAP_SURFACES) {
      for (const id of Object.keys(page.collapsed[surface])) {
        if (!(id in result.markers) && !(id in result.notes) && !(id in result.links)) {
          delete page.collapsed[surface][id];
        }
      }
    }
  }

  return result;
}

function repairParents(markers: Record<string, MarkerDef>): void {
  for (const [id, def] of Object.entries(markers)) {
    if (def.parent && !(def.parent in markers)) {
      def.parent = undefined;
    }
    // Break cycles.
    const seen = new Set<string>([id]);
    let current = def.parent;
    while (current) {
      if (seen.has(current)) {
        def.parent = undefined;
        break;
      }
      seen.add(current);
      current = markers[current]?.parent;
    }
  }
  // Flatten anything deeper than MAX_MARKER_DEPTH.
  let changed = true;
  while (changed) {
    changed = false;
    for (const [id, def] of Object.entries(markers)) {
      let depth = 0;
      let current = def.parent;
      const seen = new Set<string>();
      while (current && markers[current] && !seen.has(current)) {
        seen.add(current);
        depth++;
        current = markers[current].parent;
      }
      if (depth > MAX_MARKER_DEPTH && def.parent) {
        def.parent = markers[def.parent]?.parent;
        changed = true;
      }
    }
  }
}

function normalizePath(relPath: string): string {
  return relPath.replace(/\\/g, '/').replace(/\/+$/, '');
}
