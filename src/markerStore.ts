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
  type CatalogChannels,
  type CatalogFile,
  type CloudStamp,
  type ConfigSyncFlags,
  CATALOG_PATH,
  configSyncFlags,
  emptyCatalog,
  formatConfigHeaderDate,
  normalizeCatalog,
  packProfileConfigBody,
  pageKindToConfigKind,
  parseConfigHeader,
  resolveConfigChannel,
} from './configFormat';
import {
  assembleSplitWorkspace,
  buildCatalogFromPages,
  catalogEntryFromPage,
  normalizePageConfig,
  packPageConfig,
  pageConfigContentJson,
  pageFilePath,
  PAGES_DIR,
  stringifyCatalog,
  stringifyPageConfig,
  type PageAccessConfig,
  type PageConfigFile,
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

/** Max nesting depth: root (0) → subgroup (1) → subgroup of subgroup (2). */
export const MAX_MARKER_DEPTH = 2;

/** Fixed markers file relative to the workspace folder. */
export const CONFIG_PATH = '.syn3/syn3.json';
/** Profile list and per-machine bindings (`sProfileIds`). */
export const PROFILES_PATH = '.syn3/profiles.json';
/** Appearance per profile id. */
export const STYLES_PATH = '.syn3/styles.json';
/** Live per-profile card layout (gitignored). */
export { POS_LOCAL_PATH, POS_REMOTE_PATH, CATALOG_PATH, PAGES_DIR };
/** Built-in profile: always present, cannot be renamed or deleted. */
export const GENERAL_PROFILE_ID = 'general';
export const GENERAL_PROFILE_NAME = 'Общий';

/** SHA-256 of `vscode.env.machineId` — stored in profile `sProfileIds`, not the raw id. */
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

/** Max named map pages (pager slides). */
export const MAX_PAGES = 6;
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
  /** Include Error diagnostics on the Problems page. */
  problemsError: boolean;
  /** Include Warning diagnostics on the Problems page. */
  problemsWarning: boolean;
  /** Include Information diagnostics on the Problems page. */
  problemsInfo: boolean;
  /** Syn3 UI language for menus and settings of this profile. */
  language: Syn3Locale;
  /** Auto-refresh interval for review pages, seconds (30–3600). */
  reviewRefreshSec: number;
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
  problemsError: true,
  problemsWarning: true,
  problemsInfo: true,
  language: 'ru',
  reviewRefreshSec: 60,
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
    ...normalizeProblemsFilters(source),
    language: normalizeLocale(source.language ?? DEFAULT_APPEARANCE.language),
    reviewRefreshSec: snapReviewRefreshSec(
      numOr(source.reviewRefreshSec, DEFAULT_APPEARANCE.reviewRefreshSec),
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
    pages: { [DEFAULT_PAGE_ID]: defaultPage() },
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
  /** Workspace uses catalog.json + pages/*.json instead of syn3.json. */
  private usingSplitConfig = false;
  private catalog: CatalogFile = emptyCatalog();
  private pageCloud: Record<string, CloudStamp> = {};
  private dirtyPages = new Set<string>();
  private profileDirty = false;
  private pageCloudNewer: Record<string, boolean> = {};
  private profileCloudNewer = false;
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

  /** Opens the catalog in the editor (`syn3.openConfig`). */
  get configUri(): vscode.Uri {
    return this.catalogUri;
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

  get catalogUri(): vscode.Uri {
    return vscode.Uri.joinPath(this.root, CATALOG_PATH);
  }

  get pagesDirUri(): vscode.Uri {
    return vscode.Uri.joinPath(this.root, PAGES_DIR);
  }

  pageUri(pageId: string): vscode.Uri {
    return vscode.Uri.joinPath(this.root, pageFilePath(pageId));
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
    await this.persistProfiles();
    this.changeEmitter.fire();
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

  async init(): Promise<void> {
    await this.migrateHistory();
    this.usingSplitConfig = true;
    await this.load();
    await this.loadProfilesAndStyles();
    await this.loadPositions();
    this.dirtyPages.clear();
    this.profileDirty = false;
    await this.loadHistory();
    await this.reconcilePageDirty();
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
      dirty: this.profileDirty,
      cloudNewer: this.profileCloudNewer,
    });
  }

  configSync(pageId: string): ConfigSyncFlags {
    return configSyncFlags({
      dirty: this.dirtyPages.has(pageId),
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

  /** Page tabs show the fixed mark. The mark itself is a pending change until it is sent. */
  pagesFixed(): boolean {
    return this.posLocal.pagesFixed === true;
  }

  /** Lock value already published. Absent means the last send was unlocked. */
  pagesFixedSent(): boolean {
    return this.posLocal.pagesFixedSent === true;
  }

  private pagesFixedDirty(): boolean {
    return this.pagesFixed() !== this.pagesFixedSent();
  }

  private rememberPagesFixedSent(): void {
    if (this.posLocal.pagesFixed === true) {
      this.posLocal.pagesFixedSent = true;
    } else {
      delete this.posLocal.pagesFixedSent;
    }
  }

  async setPagesFixed(fixed: boolean): Promise<void> {
    if (fixed) {
      this.posLocal.pagesFixed = true;
    } else {
      delete this.posLocal.pagesFixed;
    }
    await this.enqueue(async () => {
      if (fixed) {
        this.posLocal.pagesFixed = true;
      } else {
        delete this.posLocal.pagesFixed;
      }
      await this.persistPosLocal();
      this.changeEmitter.fire();
    });
  }

  pageDraftIds(pageId: string): string[] {
    return this.posLocal.drafts?.[pageId] ?? [];
  }

  catalogChannels(): CatalogChannels {
    return {
      profile: this.catalog.channels.profile || '',
      ...(this.catalog.channels.explorer ? { explorer: this.catalog.channels.explorer } : {}),
      ...(this.catalog.channels.notes ? { notes: this.catalog.channels.notes } : {}),
      ...(this.catalog.channels.links ? { links: this.catalog.channels.links } : {}),
    };
  }

  async setCatalogChannels(partial: Partial<CatalogChannels>): Promise<void> {
    await this.enqueue(async () => {
      const next = { ...this.catalog.channels };
      if (partial.profile !== undefined) {
        next.profile = partial.profile.trim();
      }
      if (partial.explorer !== undefined) {
        const value = partial.explorer.trim();
        if (value) {
          next.explorer = value;
        } else {
          delete next.explorer;
        }
      }
      if (partial.notes !== undefined) {
        const value = partial.notes.trim();
        if (value) {
          next.notes = value;
        } else {
          delete next.notes;
        }
      }
      if (partial.links !== undefined) {
        const value = partial.links.trim();
        if (value) {
          next.links = value;
        } else {
          delete next.links;
        }
      }
      this.catalog.channels = next;
      this.profileDirty = true;
      if (this.usingSplitConfig) {
        await this.persistCatalogOnly();
      }
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

  async pullProfileConfig(): Promise<{ ok: boolean; message?: string }> {
    return this.enqueueResult(() => this.pullProfileConfigNow());
  }

  dispose(): void {
    for (const watcher of this.watchers) {
      watcher.dispose();
    }
    this.watchers = [];
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
    if (lower === GENERAL_PROFILE_NAME.toLocaleLowerCase() || lower === 'general') {
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

  async createPage(name: string, kind: PageKind, description?: string): Promise<string | undefined> {
    if (this.pages().length >= MAX_PAGES) {
      return undefined;
    }
    const trimmed = name.trim();
    if (!trimmed) {
      return undefined;
    }
    const id = this.uniquePageId(trimmed);
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
    await this.commit();
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
      if (this.pages().length <= 1 || !page) {
        return;
      }
      const kind = pageKindToConfigKind(page.kind);
      const stamp = this.pageCloud[id];
      let channel = '';
      if (kind === 'REVIEW') {
        await this.accessStore?.ensureLoaded();
        channel = this.accessStore?.page(id)?.channelId?.trim() || '';
      } else if (kind) {
        channel = resolveConfigChannel(this.catalog.channels, kind);
      }
      if (stamp && kind && kind !== 'PROFILE' && channel) {
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
    this.applyPageOrder(this.pages().map(([pageId]) => pageId));
    if (neighbor) {
      for (const surface of MAP_SURFACES) {
        if (this.data.surfaces[surface].page === id) {
          this.data.surfaces[surface] = { page: neighbor };
        }
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

  /** The page push icon lights when the page config changed, including review bindings. */
  async touchPageConfig(pageId: string): Promise<void> {
    await this.enqueue(async () => {
      if (!this.data.pages[pageId]) {
        return;
      }
      this.dirtyPages.add(pageId);
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
    await this.commit();
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
    attach(CATALOG_PATH, () => {
      if (this.writingCatalog) {
        return;
      }
      void this.enqueue(() => this.reloadFromDisk(false));
    });
    attach(`${PAGES_DIR}/*.json`, () => {
      if (this.writingCatalog) {
        return;
      }
      void this.enqueue(() => this.reloadFromDisk(false));
    });
    attach(PROFILES_PATH, () => {
      if (this.writingProfiles) {
        return;
      }
      void this.enqueue(() => this.reloadProfilesFromDisk());
    });
    attach(STYLES_PATH, () => {
      if (this.writingStyles) {
        return;
      }
      void this.enqueue(() => this.reloadStylesFromDisk());
    });
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
    if (!(await fileExists(this.catalogUri))) {
      this.data = emptyData();
      this.catalog = buildCatalogFromPages(this.data.pages, { profile: '' });
      this.pageCloud = {};
      this.surfacesNeedLegacyHydration = true;
      this.lastError = undefined;
      await this.persistSplitConfig();
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
    const stylesExist = await fileExists(this.stylesUri);
    const profilesExist = await fileExists(this.profilesUri);
    const seed = normalizeAppearance(this.data.appearance);
    const seedOpen = { ...this.data.surfaces.open };

    if (!stylesExist) {
      this.stylesData = emptyStyles(seed, seedOpen);
      this.profilesData = emptyProfiles();
      this.bindMachineToProfiles();
      this.mirrorActiveOpenToSurfaces();
      await this.persistStyles();
      await this.persistProfiles();
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
      await this.persistProfiles();
      await this.persistStyles();
    } else {
      await this.reloadProfilesFromDisk(false, seedOpen);
    }
    this.ensureGeneralProfile(seed, seedOpen);
    if (this.bindMachineToProfiles()) {
      await this.persistProfiles();
    }
    this.mirrorActiveOpenToSurfaces();
    await this.persistStyles();
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
      await this.persistProfiles();
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
    if (!this.profilesData.profiles.some((p) => p.id === GENERAL_PROFILE_ID)) {
      this.profilesData.profiles.unshift({
        id: GENERAL_PROFILE_ID,
        name: GENERAL_PROFILE_NAME,
        sProfileIds: [],
      });
    } else {
      const general = this.profilesData.profiles.find((p) => p.id === GENERAL_PROFILE_ID);
      const sProfileIds = general?.sProfileIds ?? [];
      this.profilesData.profiles = [
        {
          id: GENERAL_PROFILE_ID,
          name: GENERAL_PROFILE_NAME,
          sProfileIds,
          ...(general?.reviewSkillPath ? { reviewSkillPath: general.reviewSkillPath } : {}),
          ...(general?.reviewDirPath ? { reviewDirPath: general.reviewDirPath } : {}),
          ...(general?.reviewModel ? { reviewModel: general.reviewModel } : {}),
          ...(general?.reviewFixModel ? { reviewFixModel: general.reviewFixModel } : {}),
          ...(general?.githubNick ? { githubNick: general.githubNick } : {}),
          ...(general?.gitlabNick ? { gitlabNick: general.gitlabNick } : {}),
        },
        ...this.profilesData.profiles.filter((p) => p.id !== GENERAL_PROFILE_ID),
      ];
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
   * Exactly one owner → use it. Zero or many → «Общий», strip our hash elsewhere, seed Общий.
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
    const general = this.profilesData.profiles.find((p) => p.id === GENERAL_PROFILE_ID);
    if (general && !general.sProfileIds.includes(hash)) {
      general.sProfileIds.push(hash);
      changed = true;
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

  private async refreshCloudHints(): Promise<void> {
    const token = await this.discordToken();
    if (!token) {
      return;
    }
    let changed = false;
    const profileChannel = resolveConfigChannel(this.catalog.channels, 'PROFILE');
    if (profileChannel) {
      const latest = await findLatestConfigMessage(token, profileChannel, 'PROFILE', undefined);
      if (latest.ok && latest.value) {
        const newer = latestIsNewer(latest.value, this.catalog.cloud);
        if (this.profileCloudNewer !== newer) {
          this.profileCloudNewer = newer;
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
            continue;
          }
          let remoteFile: PageConfigFile;
          try {
            remoteFile = normalizePageConfig(JSON.parse(downloaded.value));
          } catch {
            continue;
          }
          if (remoteFile.deleted || (remoteFile.pageId && remoteFile.pageId !== pageId)) {
            continue;
          }
          await this.adoptRemotePage(pageId, remoteFile, stampFromLatest(latest));
          continue;
        }
        const newer = latestIsNewer(latest, this.pageCloud[pageId]);
        if (!!this.pageCloudNewer[pageId] !== newer) {
          this.pageCloudNewer[pageId] = newer;
          changed = true;
        }
      }
    };
    for (const kind of ['EXPLORER', 'NOTES', 'LINKS'] as const) {
      const channel = resolveConfigChannel(this.catalog.channels, kind);
      await scan(channel, kind);
    }
    await this.accessStore?.ensureLoaded();
    for (const access of Object.values(this.accessStore?.entries() ?? {})) {
      const channel = access.channelId.trim();
      if (channel) {
        await scan(channel, 'REVIEW');
      }
    }
    const pending = { ...(this.posLocal.pageTombstones ?? {}) };
    for (const [pageId, tomb] of Object.entries(pending)) {
      await this.postPageTombstone(pageId, tomb);
    }
    if (changed) {
      this.changeEmitter.fire();
    }
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
      if (kind === 'REVIEW') {
        const reviewChannel = this.accessStore?.page(pageId)?.channelId?.trim() || '';
        if (reviewChannel === channel) {
          ids.push(pageId);
        }
        continue;
      }
      ids.push(pageId);
    }
    return ids;
  }

  /** Take a page that exists only in its channel. Does not mark the page dirty. */
  private async adoptRemotePage(
    pageId: string,
    remoteFile: PageConfigFile,
    stamp: CloudStamp,
  ): Promise<void> {
    await this.enqueue(async () => {
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
    });
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
    if (this.pageCloudNewer[pageId]) {
      return { ok: false, message: 'cloudPullFirst' };
    }
    if (!force && !this.dirtyPages.has(pageId)) {
      return { ok: false, message: 'Nothing to push' };
    }
    const kind = pageKindToConfigKind(page.kind);
    if (!kind) {
      return { ok: false, message: 'Unsupported page kind' };
    }
    const token = await this.discordToken();
    if (!token) {
      return { ok: false, message: 'Discord token is not set' };
    }
    let channel = '';
    if (kind === 'REVIEW') {
      await this.accessStore?.ensureLoaded();
      channel = this.accessStore?.page(pageId)?.channelId?.trim() || '';
    } else {
      channel = resolveConfigChannel(this.catalog.channels, kind);
    }
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
      body: stringifyPageConfig({ ...packed, cloud: undefined, fixed: this.pagesFixed() }),
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
    const lockDirty = this.pagesFixedDirty();
    const ids = this.pages()
      .map(([id]) => id)
      .filter((id) => lockDirty || this.configSync(id).canPush);
    const result = await this.pushPageIds(ids, lockDirty);
    if (result.ok && lockDirty && result.pushed > 0) {
      this.rememberPagesFixedSent();
      await this.persistPosLocal();
      this.changeEmitter.fire();
    }
    return result;
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
    if (lines.length === 0) {
      return { ok: true };
    }
    return { ok: false, message: lines.join('\n') };
  }

  private async pullPageConfigNow(pageId: string): Promise<{ ok: boolean; message?: string }> {
    const page = this.data.pages[pageId];
    if (!page) {
      return { ok: false, message: 'Page not found' };
    }
    if (!this.pageCloudNewer[pageId] && this.pageCloud[pageId]) {
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
    let channel = '';
    if (kind === 'REVIEW') {
      await this.accessStore?.ensureLoaded();
      channel = this.accessStore?.page(pageId)?.channelId?.trim() || '';
    } else {
      channel = resolveConfigChannel(this.catalog.channels, kind);
    }
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
    let remoteFile: PageConfigFile;
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
    const localDirty = this.dirtyPages.has(pageId);
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
    if (remoteFile.fixed === true || remoteFile.fixed === false) {
      if (remoteFile.fixed) {
        this.posLocal.pagesFixed = true;
        this.posLocal.pagesFixedSent = true;
      } else {
        delete this.posLocal.pagesFixed;
        delete this.posLocal.pagesFixedSent;
      }
    }
    await this.persistPosLocal();
    this.changeEmitter.fire();
    return { ok: true };
  }

  private async applyRemotePageFile(
    pageId: string,
    remoteFile: PageConfigFile,
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

    if (!this.data.pages[pageId]) {
      this.data.pages[pageId] = {
        name: remoteFile.page.name || pageId,
        kind: remoteFile.page.kind || 'files',
        order: typeof remoteFile.page.order === 'number' ? remoteFile.page.order : 0,
        layout: remoteFile.page.layout || 'chips',
        groupsLayout: remoteFile.page.groupsLayout || 'flow',
        collapsed: emptyCollapsed(),
        ...(remoteFile.page.description ? { description: remoteFile.page.description } : {}),
      };
    }
    const page = this.data.pages[pageId];
    if (page) {
      page.name = remoteFile.page.name || page.name;
      page.kind = remoteFile.page.kind || page.kind;
      if (typeof remoteFile.page.order === 'number') {
        page.order = remoteFile.page.order;
      }
      page.layout = remoteFile.page.layout || page.layout;
      page.groupsLayout = remoteFile.page.groupsLayout || page.groupsLayout;
      if (remoteFile.page.description) {
        page.description = remoteFile.page.description;
      } else {
        delete page.description;
      }
    }
    if (remoteFile.access) {
      await this.accessStore?.setPage(pageId, remoteFile.access);
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
    if (this.profileCloudNewer) {
      return { ok: false, message: 'cloudPullFirst' };
    }
    if (!this.profileDirty) {
      return { ok: false, message: 'Nothing to push' };
    }
    const token = await this.discordToken();
    if (!token) {
      return { ok: false, message: 'Discord token is not set' };
    }
    const channel = resolveConfigChannel(this.catalog.channels, 'PROFILE');
    if (!channel) {
      return { ok: false, message: 'Profile Discord channel is not set' };
    }
    const body = packProfileConfigBody({
      channels: this.catalog.channels,
      profiles: this.profilesData,
      styles: this.stylesData,
    });
    const number = nextConfigNumber(this.catalog.cloud);
    const headerDate = formatConfigHeaderDate();
    const posted = await postConfigMessage({
      token,
      channelId: channel,
      kind: 'PROFILE',
      number,
      headerDate,
      filename: 'profile.json',
      body: JSON.stringify(body, null, 2) + '\n',
    });
    if (!posted.ok) {
      return { ok: false, message: posted.message };
    }
    const parsed = parseConfigHeader(posted.value.content);
    this.catalog.cloud = parsed
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
    this.profileDirty = false;
    this.profileCloudNewer = false;
    await this.persistCatalogOnly();
    this.changeEmitter.fire();
    void this.refreshCloudHints();
    return { ok: true };
  }

  private async pullProfileConfigNow(): Promise<{ ok: boolean; message?: string }> {
    await this.refreshCloudHints();
    if (!this.profileCloudNewer && this.catalog.cloud) {
      return { ok: false, message: 'Nothing to pull' };
    }
    const token = await this.discordToken();
    if (!token) {
      return { ok: false, message: 'Discord token is not set' };
    }
    const channel = resolveConfigChannel(this.catalog.channels, 'PROFILE');
    if (!channel) {
      return { ok: false, message: 'Profile Discord channel is not set' };
    }
    const latest = await findLatestConfigMessage(token, channel, 'PROFILE', undefined);
    if (!latest.ok) {
      return { ok: false, message: latest.message };
    }
    if (!latest.value) {
      return { ok: false, message: 'No cloud profile config found' };
    }
    const downloaded = await downloadConfigAttachment(token, latest.value.attachmentUrl);
    if (!downloaded.ok) {
      return { ok: false, message: downloaded.message };
    }
    let body: {
      channels?: unknown;
      catalog?: { channels?: unknown; pages?: unknown };
      profiles?: unknown;
      styles?: unknown;
      access?: unknown;
    };
    try {
      body = JSON.parse(downloaded.value) as typeof body;
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
    const channelSource = body.channels ?? body.catalog?.channels;
    if (channelSource) {
      this.catalog.channels = normalizeCatalog({ channels: channelSource }).channels;
    }
    this.catalog.cloud = stampFromLatest(latest.value);
    if (body.profiles) {
      this.profilesData = normalizeProfiles(body.profiles);
      this.bindMachineToProfiles();
      await this.persistProfiles();
    }
    if (body.styles) {
      try {
        const raw = body.styles as StylesFile;
        if (raw && typeof raw === 'object' && raw.styles) {
          this.stylesData = { version: 1, styles: {} };
          for (const [id, value] of Object.entries(raw.styles)) {
            this.stylesData.styles[id] = normalizeProfileStyle(value);
          }
          await this.persistStyles();
        }
      } catch {
        // keep local styles
      }
    }
    if (body.access) {
      try {
        await vscode.workspace.fs.writeFile(
          vscode.Uri.joinPath(this.root, '.syn3/access.json'),
          Buffer.from(JSON.stringify(body.access, null, 2) + '\n', 'utf8'),
        );
        await this.accessStore?.reload();
      } catch {
        // ignore
      }
    }
    this.profileDirty = false;
    this.profileCloudNewer = false;
    await this.persistSplitConfig();
    this.present = this.capture();
    this.pagePresent = this.captureAllPageSnapshots();
    this.changeEmitter.fire();
    return { ok: true };
  }

  private async persistProfiles(): Promise<void> {
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

  private async persistStyles(): Promise<void> {
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
      const pageTombstones = this.posLocal.pageTombstones;
      const payload: PositionsFile = {
        version: 1,
        profiles: {},
        ...(focus ? { focus } : {}),
        ...(Object.keys(drafts).length > 0 ? { drafts } : {}),
        ...(Object.keys(pageClean).length > 0 ? { pageClean } : {}),
        ...(pageTombstones && Object.keys(pageTombstones).length > 0 ? { pageTombstones } : {}),
        ...(this.posLocal.surfaces ? { surfaces: this.posLocal.surfaces } : {}),
        ...(this.posLocal.pagesFixed ? { pagesFixed: true as const } : {}),
        ...(this.posLocal.pagesFixedSent ? { pagesFixedSent: true as const } : {}),
      };
      for (const id of Object.keys(this.posLocal.profiles).sort()) {
        payload.profiles[id] = packProfileLayout(this.posLocal.profiles[id]);
      }
      this.posLocal = payload;
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
    try {
      const json = encodeHistory(this.history, this.pageCursors());
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

  private async persistCatalogOnly(): Promise<void> {
    this.writingCatalog = true;
    try {
      await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(this.catalogUri, '..'));
      await vscode.workspace.fs.writeFile(
        this.catalogUri,
        Buffer.from(stringifyCatalog(this.catalog), 'utf8'),
      );
    } finally {
      setTimeout(() => {
        this.writingCatalog = false;
      }, 100);
    }
  }

  private syncCatalogPagesFromData(): void {
    const pages: CatalogFile['pages'] = {};
    for (const [id, page] of Object.entries(this.data.pages)) {
      pages[id] = catalogEntryFromPage(id, page);
    }
    this.catalog.pages = pages;
  }

  private packPageFile(pageId: string): PageConfigFile | undefined {
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
      page,
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
      access: this.pageAccessFor(pageId),
      cloud: this.pageCloud[pageId],
    });
  }

  private pageAccessFor(pageId: string): PageAccessConfig | undefined {
    if (this.data.pages[pageId]?.kind !== 'review') {
      return undefined;
    }
    const access = this.accessStore?.page(pageId);
    if (!access?.channelId || !access.repoUrl) {
      return undefined;
    }
    return {
      provider: access.provider,
      channelId: access.channelId,
      repoUrl: access.repoUrl,
    };
  }

  private async persistSplitConfig(): Promise<void> {
    this.writingCatalog = true;
    try {
      await this.accessStore?.ensureLoaded();
      this.syncCatalogPagesFromData();
      await vscode.workspace.fs.createDirectory(this.pagesDirUri);
      const keep = new Set(Object.keys(this.data.pages));
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
        this.catalogUri,
        Buffer.from(stringifyCatalog(this.catalog), 'utf8'),
      );
    } finally {
      setTimeout(() => {
        this.writingCatalog = false;
      }, 100);
    }
  }

  private captureSplitFingerprint(): string {
    this.syncCatalogPagesFromData();
    const catalogPart = stringifyCatalog({
      version: 1,
      pages: this.catalog.pages,
      channels: this.catalog.channels,
    });
    const pageParts: string[] = [];
    for (const pageId of Object.keys(this.data.pages).sort()) {
      const packed = this.packPageFile(pageId);
      if (packed) {
        pageParts.push(pageId + '\n' + pageConfigContentJson(packed));
      }
    }
    return catalogPart + pageParts.join('\n');
  }

  private async reloadSplitFromDisk(notify: boolean): Promise<void> {
    let catalogRaw: string;
    try {
      catalogRaw = Buffer.from(await vscode.workspace.fs.readFile(this.catalogUri)).toString('utf8');
    } catch (error) {
      if (!isFileNotFound(error)) {
        this.lastError = `Cannot read ${CATALOG_PATH}: ${error instanceof Error ? error.message : String(error)}`;
        this.changeEmitter.fire();
      }
      return;
    }
    const catalog = normalizeCatalog(JSON.parse(catalogRaw));
    const pageFiles: Record<string, PageConfigFile> = {};
    for (const pageId of Object.keys(catalog.pages)) {
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
    const assembled = assembleSplitWorkspace(catalog, pageFiles);
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
    this.catalog = assembled.catalog;
    this.pageCloud = assembled.pageCloud;
    this.usingSplitConfig = true;
    this.data = next;
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

  private uniquePageId(name: string): string {
    const base =
      'page-' +
      (name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'page');
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
  if (Object.keys(result.pages).length === 0) {
    result.pages = { [DEFAULT_PAGE_ID]: defaultPage() };
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
