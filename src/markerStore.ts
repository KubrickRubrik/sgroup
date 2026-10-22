import * as path from 'path';
import * as vscode from 'vscode';
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
import { normalizeHex } from './palette';

/** Max nesting depth: root (0) → subgroup (1) → subgroup of subgroup (2). */
export const MAX_MARKER_DEPTH = 2;

/** Fixed markers file relative to the workspace folder. */
export const CONFIG_PATH = '.syn3/syn3.json';
/** Profile list and active id. */
export const PROFILES_PATH = '.syn3/profiles.json';
/** Appearance per profile id. */
export const STYLES_PATH = '.syn3/styles.json';
/** Built-in profile: always present, cannot be renamed or deleted. */
export const GENERAL_PROFILE_ID = 'general';
export const GENERAL_PROFILE_NAME = 'Общий';
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
export const MAX_PAGES = 3;
/** Default page id created for legacy files and empty stores. */
export const DEFAULT_PAGE_ID = 'map';

export type PageKind = 'files' | 'notes';
export type MapLayout = 'chips' | 'list';
export type GroupsLayout = 'flow' | '1' | '2' | '3';

export function normalizeColumns(value: unknown): ColumnsMode | undefined {
  return value === 'flow' || value === '1' || value === '2' || value === '3' ? value : undefined;
}

export function normalizePageKind(value: unknown): PageKind | undefined {
  return value === 'files' || value === 'notes' ? value : undefined;
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
  /** Blink the corner chain of the focused editor tab. */
  openFileAnimate: boolean;
  /** Blink cycle length in seconds, 0–3. */
  openFileDuration: number;
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
  openFileAnimate: true,
  openFileDuration: 1,
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
    openFileAnimate: boolOr(source.openFileAnimate, DEFAULT_APPEARANCE.openFileAnimate),
    openFileDuration: snapOpenFileDuration(numOr(source.openFileDuration, DEFAULT_APPEARANCE.openFileDuration)),
  };
}

function numOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function boolOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export interface MarkerDef {
  label: string;
  /** Theme color id (`syn3.red`, `charts.red`) or `#rrggbb`. */
  color?: string;
  /** Emoji shown before the group name. */
  icon?: string;
  /** Display alias shown above the group label. */
  alias?: string;
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
  order: number;
  layout: MapLayout;
  groupsLayout: GroupsLayout;
  /** Folded groups on this page, per surface. Not part of undo history. */
  collapsed: SurfaceCollapsed;
}

/** Free-text note attached to a group on a notes page. */
export interface NoteDef {
  markerId: string;
  text: string;
  order: number;
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
  active: string;
  profiles: StyleProfile[];
}

interface StylesFile {
  version: 1;
  styles: Record<string, ProfileStyle>;
}

function emptyProfiles(): ProfilesFile {
  return {
    version: 1,
    active: GENERAL_PROFILE_ID,
    profiles: [{ id: GENERAL_PROFILE_ID, name: GENERAL_PROFILE_NAME }],
  };
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

/** Page-local undo snapshot: groups, items, notes and view — not folds, page order, or appearance. */
interface PageSnapshot {
  version: 1;
  page: {
    name: string;
    kind: PageKind;
    layout: MapLayout;
    groupsLayout: GroupsLayout;
  };
  markers: Record<string, MarkerDef>;
  items: Record<string, string[]>;
  added: Record<string, Record<string, number>>;
  aliases: Record<string, string>;
  classes: Record<string, ClassDef>;
  classItems: Record<string, string[]>;
  classAdded: Record<string, Record<string, number>>;
  notes: Record<string, NoteDef>;
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

export class MarkerStore implements vscode.Disposable {
  private data: MarkersFile = emptyData();
  private profilesData: ProfilesFile = emptyProfiles();
  private stylesData: StylesFile = emptyStyles();
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
  /** True when the loaded file had no `surfaces` block — workspace state may hydrate it once. */
  private surfacesNeedLegacyHydration = false;
  private queue: Promise<void> = Promise.resolve();
  /** Skip self-triggered profile/style reloads after our own writes. */
  private writingProfiles = false;
  private writingStyles = false;

  readonly onDidChange = this.changeEmitter.event;
  lastError?: string;

  constructor(readonly root: vscode.Uri) {}

  get configUri(): vscode.Uri {
    return vscode.Uri.joinPath(this.root, this.sessionConfigPath);
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

  /** Appearance of the active profile. */
  get appearance(): Appearance {
    return this.activeProfileStyle().appearance;
  }

  /** Panel open flags of the active profile. */
  private activeProfileStyle(): ProfileStyle {
    const id = this.profilesData.active;
    return (
      this.stylesData.styles[id] ??
      this.stylesData.styles[GENERAL_PROFILE_ID] ?? {
        appearance: { ...DEFAULT_APPEARANCE },
        open: emptyPanelOpen(),
      }
    );
  }

  /** Profiles in creation order. «Общий» is always first. */
  profiles(): StyleProfile[] {
    return this.profilesData.profiles.map((p) => ({ ...p }));
  }

  get activeProfileId(): string {
    return this.profilesData.active;
  }

  get activeProfileName(): string {
    return (
      this.profilesData.profiles.find((p) => p.id === this.profilesData.active)?.name ??
      GENERAL_PROFILE_NAME
    );
  }

  /** True after markers and history have been read. Page ids are meaningful only then. */
  get ready(): boolean {
    return this.historyReady;
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
    await this.migrateLegacyConfig();
    await this.migrateHistory();
    await this.load();
    await this.loadProfilesAndStyles();
    await this.loadHistory();
    this.historyReady = true;
    this.watch();
    this.changeEmitter.fire();
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
      if (this.profilesData.active === id) {
        return;
      }
      this.profilesData.active = id;
      this.mirrorActiveOpenToSurfaces();
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
      this.profilesData.profiles.push({ id, name: trimmed });
      this.stylesData.styles[id] = cloneProfileStyle(source);
      this.profilesData.active = id;
      this.mirrorActiveOpenToSurfaces();
      await this.persistProfiles();
      await this.persistStyles();
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
      this.profilesData.profiles.splice(index, 1);
      delete this.stylesData.styles[id];
      if (this.profilesData.active === id) {
        this.profilesData.active = GENERAL_PROFILE_ID;
        this.mirrorActiveOpenToSurfaces();
      }
      await this.persistProfiles();
      await this.persistStyles();
      this.changeEmitter.fire();
      return true;
    });
  }

  /** Empty, «Общий», and duplicate names (case-insensitive) are rejected. */
  isValidProfileName(name: string, excludeId?: string): boolean {
    const trimmed = name.trim();
    if (!trimmed) {
      return false;
    }
    if (trimmed.toLocaleLowerCase() === GENERAL_PROFILE_NAME.toLocaleLowerCase()) {
      return false;
    }
    const lower = trimmed.toLocaleLowerCase();
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

  notesOf(markerId: string): Array<[string, NoteDef]> {
    return Object.entries(this.data.notes)
      .filter(([, def]) => def.markerId === markerId)
      .sort((a, b) => a[1].order - b[1].order || a[0].localeCompare(b[0]));
  }

  note(id: string): NoteDef | undefined {
    return this.data.notes[id];
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
    const siblings = this.children(parent, page);
    const maxOrder = Math.max(0, ...siblings.map(([, m]) => m.order));
    let columns = normalizeColumns(def.columns);
    if (columns === undefined && parent !== undefined) {
      columns = normalizeColumns(this.data.markers[parent].columns);
    }
    this.data.markers[id] = {
      ...def,
      label: capitalize(def.label),
      parent,
      page,
      columns,
      order: maxOrder + 1,
    };
    await this.commit();
    return id;
  }

  async updateMarker(id: string, patch: Partial<Omit<MarkerDef, 'order'>>): Promise<void> {
    const current = this.data.markers[id];
    if (!current) {
      return;
    }
    const next: MarkerDef = { ...current, ...patch, label: capitalize(patch.label ?? current.label) };
    if (patch.parent !== undefined) {
      next.parent = patch.parent || undefined;
    }
    if ('columns' in patch) {
      next.columns = normalizeColumns(patch.columns);
    }
    this.data.markers[id] = next;
    await this.commit();
  }

  async setColumns(id: string, columns: ColumnsMode): Promise<void> {
    if (!this.data.markers[id]) {
      return;
    }
    await this.updateMarker(id, { columns });
  }

  /**
   * Toggle lock on `id` and cascade to children whose lock matched the parent
   * before this click. Mismatched children (and their subtrees) stay as-is.
   */
  async toggleLock(id: string): Promise<void> {
    if (!this.data.markers[id]) {
      return;
    }
    const apply = (markerId: string) => {
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
          apply(childId);
        }
      }
    };
    apply(id);
    await this.commit();
  }

  async deleteMarker(id: string): Promise<void> {
    const def = this.data.markers[id];
    if (!def) {
      return;
    }
    const grandParent = def.parent;
    const page = grandParent === undefined ? this.pageOf(id) : undefined;
    const children = this.children(id);
    const siblings = this.children(grandParent, page)
      .map(([markerId]) => markerId)
      .filter((markerId) => markerId !== id);
    const insertAt = siblings.length;
    // Lift children to the deleted marker's parent, keeping relative order.
    const lifted = children.map(([childId]) => childId);
    const ordered = [...siblings.slice(0, insertAt), ...lifted, ...siblings.slice(insertAt)];
    for (const childId of lifted) {
      this.data.markers[childId].parent = grandParent;
      if (grandParent === undefined && page) {
        this.data.markers[childId].page = page;
      } else {
        delete this.data.markers[childId].page;
      }
    }
    delete this.data.markers[id];
    this.removeNotesOfMarker(id);
    this.forgetCollapsed(id);
    this.applyOrder(ordered);
    for (const [relPath, ids] of Object.entries(this.data.items)) {
      this.setItem(relPath, ids.filter((x) => x !== id));
    }
    for (const [classId, ids] of Object.entries(this.data.classItems)) {
      this.setClassItem(classId, ids.filter((x) => x !== id));
    }
    await this.commit();
  }

  async moveMarker(id: string, delta: -1 | 1): Promise<void> {
    const def = this.data.markers[id];
    if (!def) {
      return;
    }
    const page = def.parent === undefined ? this.pageOf(id) : undefined;
    const ordered = this.children(def.parent, page).map(([markerId]) => markerId);
    const index = ordered.indexOf(id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= ordered.length) {
      return;
    }
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    this.applyOrder(ordered);
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
    this.data.markers[id].parent = parent;
    if (parent === undefined) {
      this.data.markers[id].page = targetPage;
    } else {
      delete this.data.markers[id].page;
    }
    const ordered = this.children(parent, parent === undefined ? targetPage : undefined)
      .map(([markerId]) => markerId)
      .filter((markerId) => markerId !== id);
    let index = ordered.indexOf(targetId);
    if (index < 0) {
      index = ordered.length;
    } else if (position === 'after') {
      index += 1;
    }
    ordered.splice(index, 0, id);
    this.applyOrder(ordered);
    if (oldParent !== parent || oldPage !== targetPage) {
      this.applyOrder(
        this.children(oldParent, oldParent === undefined ? oldPage : undefined).map(
          ([markerId]) => markerId,
        ),
      );
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
    this.data.markers[id].parent = parentId;
    delete this.data.markers[id].page;
    const ordered = this.children(parentId)
      .map(([markerId]) => markerId)
      .filter((markerId) => markerId !== id);
    ordered.push(id);
    this.applyOrder(ordered);
    if (oldParent !== parentId) {
      this.applyOrder(
        this.children(oldParent, oldParent === undefined ? oldPage : undefined).map(
          ([markerId]) => markerId,
        ),
      );
    }
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
    const siblings = this.children(grandParent, grandParent === undefined ? page : undefined)
      .map(([markerId]) => markerId)
      .filter((markerId) => markerId !== id);
    const parentIndex = siblings.indexOf(parentId);
    const insertAt = parentIndex < 0 ? siblings.length : parentIndex + 1;
    this.data.markers[id].parent = grandParent;
    if (grandParent === undefined && page) {
      this.data.markers[id].page = page;
    } else {
      delete this.data.markers[id].page;
    }
    siblings.splice(insertAt, 0, id);
    this.applyOrder(siblings);
    this.applyOrder(this.children(parentId).map(([markerId]) => markerId));
    await this.commit();
  }

  // ---- pages ----

  async createPage(name: string, kind: PageKind): Promise<string | undefined> {
    if (this.pages().length >= MAX_PAGES) {
      return undefined;
    }
    const trimmed = name.trim();
    if (!trimmed) {
      return undefined;
    }
    const id = this.uniquePageId(trimmed);
    const maxOrder = Math.max(0, ...this.pages().map(([, p]) => p.order));
    this.data.pages[id] = {
      ...defaultPage(capitalize(trimmed)),
      kind,
      order: maxOrder + 1,
    };
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

  /**
   * Deletes a page and every group / note on it.
   * Returns the neighbor page id to open next, or undefined if nothing was deleted.
   */
  async deletePage(id: string): Promise<string | undefined> {
    let neighbor: string | undefined;
    await this.enqueue(async () => {
      const ordered = this.pages();
      if (ordered.length <= 1 || !this.data.pages[id]) {
        return;
      }
      const index = ordered.findIndex(([pageId]) => pageId === id);
      neighbor = ordered[index + 1]?.[0] ?? ordered[index - 1]?.[0];
      const toRemove = this.children(undefined, id).flatMap(([rootId]) =>
        this.descendantMarkers(rootId, true),
      );
      for (const markerId of toRemove) {
        this.purgeMarker(markerId);
      }
      delete this.data.pages[id];
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
    });
    return neighbor;
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
    for (const [markerId, on] of Object.entries(collapsed)) {
      if (on && this.data.markers[markerId]) {
        next[markerId] = true;
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
    await this.commit();
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

  async createNote(markerId: string, text: string): Promise<string | undefined> {
    if (!this.data.markers[markerId]) {
      return undefined;
    }
    const trimmed = text.trim();
    if (!trimmed) {
      return undefined;
    }
    const pageId = this.pageOf(markerId);
    if (!pageId || this.data.pages[pageId]?.kind !== 'notes') {
      return undefined;
    }
    const id = this.uniqueNoteId();
    const siblings = this.notesOf(markerId);
    const maxOrder = Math.max(0, ...siblings.map(([, n]) => n.order));
    this.data.notes[id] = { markerId, text: trimmed, order: maxOrder + 1 };
    await this.commit();
    return id;
  }

  async updateNote(id: string, text: string): Promise<void> {
    const note = this.data.notes[id];
    if (!note) {
      return;
    }
    const trimmed = text.trim();
    if (!trimmed) {
      delete this.data.notes[id];
      this.applyNoteOrder(note.markerId);
      await this.commit();
      return;
    }
    note.text = trimmed;
    await this.commit();
  }

  async deleteNote(id: string): Promise<void> {
    const note = this.data.notes[id];
    if (!note) {
      return;
    }
    delete this.data.notes[id];
    this.applyNoteOrder(note.markerId);
    await this.commit();
  }

  // ---- items ----

  async assign(relPaths: string[], markerId: string): Promise<void> {
    const now = Date.now();
    relPaths.forEach((relPath, index) => {
      const ids = this.data.items[relPath] ?? [];
      if (!ids.includes(markerId)) {
        this.setItem(relPath, [...ids, markerId]);
        this.setAdded(relPath, markerId, now + index);
      }
    });
    await this.commit();
  }

  async unassign(entries: Array<{ relPath: string; markerId?: string }>): Promise<void> {
    for (const { relPath, markerId } of entries) {
      const ids = this.data.items[relPath] ?? [];
      this.setItem(relPath, markerId ? ids.filter((x) => x !== markerId) : []);
    }
    await this.commit();
  }

  async moveItem(relPath: string, fromMarkerId: string, toMarkerId: string): Promise<void> {
    if (fromMarkerId === toMarkerId) {
      return;
    }
    const ids = (this.data.items[relPath] ?? []).filter((x) => x !== fromMarkerId);
    if (!ids.includes(toMarkerId)) {
      ids.push(toMarkerId);
      this.setAdded(relPath, toMarkerId, Date.now());
    }
    this.setItem(relPath, ids);
    await this.commit();
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

  async moveClass(classId: string, fromMarkerId: string, toMarkerId: string): Promise<void> {
    if (fromMarkerId === toMarkerId || !this.data.classes[classId] || !this.data.markers[toMarkerId]) {
      return;
    }
    const ids = (this.data.classItems[classId] ?? []).filter((x) => x !== fromMarkerId);
    if (!ids.includes(toMarkerId)) {
      ids.push(toMarkerId);
      this.setClassAdded(classId, toMarkerId, Date.now());
    }
    this.setClassItem(classId, ids);
    await this.commit();
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
    attach(this.sessionConfigPath, () => {
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
    let raw: string | undefined;
    let next: MarkersFile | undefined;
    try {
      raw = Buffer.from(await vscode.workspace.fs.readFile(this.configUri)).toString('utf8');
      const parsed = JSON.parse(raw) as unknown;
      this.surfacesNeedLegacyHydration =
        !parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !('surfaces' in parsed);
      next = normalize(parsed);
      this.lastError = undefined;
    } catch (error) {
      if (isFileNotFound(error)) {
        next = emptyData();
        this.surfacesNeedLegacyHydration = true;
        this.lastError = undefined;
      } else {
        this.lastError = `Cannot read ${this.sessionConfigPath}: ${error instanceof Error ? error.message : String(error)}`;
        this.changeEmitter.fire();
        return;
      }
    }
    const canonical = this.captureFrom(next);
    const baseline = raw !== undefined && raw !== canonical ? raw : undefined;
    if (!this.historyReady) {
      this.data = next;
      this.present = canonical;
      this.baseline = baseline;
      this.pagePresent = this.captureAllPageSnapshots();
      this.changeEmitter.fire();
      return;
    }
    if (canonical === this.present) {
      if (notify) {
        this.changeEmitter.fire();
      }
      return;
    }
    this.data = next;
    this.present = canonical;
    this.baseline = baseline;
    this.pagePresent = this.captureAllPageSnapshots();
    this.history = emptyHistory();
    await this.persistHistory();
    this.changeEmitter.fire();
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

  /**
   * Load profiles.json and styles.json. When styles.json is missing, seed «Общий»
   * from the legacy appearance block and current panel open flags in syn3.json.
   */
  private async loadProfilesAndStyles(): Promise<void> {
    const stylesExist = await fileExists(this.stylesUri);
    const profilesExist = await fileExists(this.profilesUri);
    const seed = normalizeAppearance(this.data.appearance);
    const seedOpen = { ...this.data.surfaces.open };

    if (!stylesExist) {
      this.stylesData = emptyStyles(seed, seedOpen);
      this.profilesData = emptyProfiles();
      this.mirrorActiveOpenToSurfaces();
      await this.persistStyles();
      await this.persistProfiles();
      // Drop legacy appearance from syn3.json on the next markers write.
      await this.writeConfig(this.capture());
      this.present = this.capture();
      this.baseline = undefined;
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
        active: GENERAL_PROFILE_ID,
        profiles: [
          { id: GENERAL_PROFILE_ID, name: GENERAL_PROFILE_NAME },
          ...ids
            .filter((id) => id !== GENERAL_PROFILE_ID)
            .map((id) => ({ id, name: id })),
        ],
      };
      await this.persistProfiles();
      await this.persistStyles();
    } else {
      await this.reloadProfilesFromDisk(false, seedOpen);
    }
    this.ensureGeneralProfile(seed, seedOpen);
    this.mirrorActiveOpenToSurfaces();
    // Rewrite styles.json if entries were still flat appearance-only.
    await this.persistStyles();
    // Drop legacy appearance from syn3.json if it is still on disk.
    try {
      const raw = Buffer.from(await vscode.workspace.fs.readFile(this.configUri)).toString('utf8');
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && 'appearance' in parsed) {
        await this.writeConfig(this.capture());
        this.present = this.capture();
        this.baseline = undefined;
      }
    } catch {
      // Markers file may be missing during a fresh workspace.
    }
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
      this.profilesData.profiles.unshift({ id: GENERAL_PROFILE_ID, name: GENERAL_PROFILE_NAME });
    } else {
      const general = this.profilesData.profiles.find((p) => p.id === GENERAL_PROFILE_ID);
      if (general) {
        general.name = GENERAL_PROFILE_NAME;
      }
      this.profilesData.profiles = [
        { id: GENERAL_PROFILE_ID, name: GENERAL_PROFILE_NAME },
        ...this.profilesData.profiles.filter((p) => p.id !== GENERAL_PROFILE_ID),
      ];
    }
    if (!this.stylesData.styles[GENERAL_PROFILE_ID]) {
      this.stylesData.styles[GENERAL_PROFILE_ID] = {
        appearance: normalizeAppearance(seed),
        open: { ...seedOpen },
      };
    }
    if (!this.profilesData.profiles.some((p) => p.id === this.profilesData.active)) {
      this.profilesData.active = GENERAL_PROFILE_ID;
    }
  }

  private ensureActiveProfileId(): string {
    this.ensureGeneralProfile(DEFAULT_APPEARANCE, this.data.surfaces.open);
    return this.profilesData.active;
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

  private async persistProfiles(): Promise<void> {
    this.writingProfiles = true;
    try {
      const payload: ProfilesFile = {
        version: 1,
        active: this.profilesData.active,
        profiles: this.profilesData.profiles.map((p) => ({ id: p.id, name: p.name })),
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

  private async commitNow(): Promise<void> {
    const next = this.capture();
    if (next === this.present) {
      this.changeEmitter.fire();
      return;
    }
    const previousPages = { ...this.pagePresent };
    await this.writeConfig(next);
    this.baseline = undefined;
    this.present = next;
    const nextPages = this.captureAllPageSnapshots();
    if (this.historyReady) {
      for (const [pageId, curr] of Object.entries(nextPages)) {
        const prev = previousPages[pageId];
        if (prev !== undefined && prev !== curr) {
          remember(pageStacks(this.history, pageId), prev);
        }
      }
      this.pagePresent = nextPages;
      await this.persistHistory();
    } else {
      this.pagePresent = nextPages;
    }
    this.changeEmitter.fire();
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
      const leaving = this.pagePresent[pageId] ?? this.capturePageSnapshot(pageId);
      try {
        this.applyPageSnapshot(pageId, snapshot);
        const next = this.capture();
        await this.writeConfig(next);
        take(stacks, direction, leaving);
        this.present = next;
        this.baseline = undefined;
        this.pagePresent = this.captureAllPageSnapshots();
        await this.persistHistory();
        this.changeEmitter.fire();
      } catch (error) {
        this.data = backup;
        this.present = backupPresent;
        this.pagePresent = backupPages;
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
      if (src.icon) {
        entry.icon = src.icon;
      }
      if (src.alias) {
        entry.alias = src.alias;
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
      if (!markerSet.has(note.markerId) || !note.text.trim()) {
        continue;
      }
      notes[noteId] = { markerId: note.markerId, text: note.text, order: note.order };
    }
    const payload: PageSnapshot = {
      version: 1,
      page: {
        name: def.name,
        kind: def.kind,
        layout: def.layout,
        groupsLayout: def.groupsLayout,
        ...(legacyCollapsed ? { collapsed: this.legacyCollapsed(def, markerSet) } : {}),
      },
      markers,
      items,
      added,
      aliases,
      classes,
      classItems,
      classAdded,
      notes,
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
    for (const id of currentIds) {
      if (!keepIds.has(id)) {
        this.purgeMarker(id);
      } else {
        this.removeNotesOfMarker(id);
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
      if (src.icon) {
        entry.icon = src.icon;
      }
      if (src.alias) {
        entry.alias = src.alias;
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

    for (const [snapNoteId, note] of Object.entries(snap.notes ?? {})) {
      const markerId = idMap.get(note.markerId);
      if (!markerId || !this.data.markers[markerId]) {
        continue;
      }
      let actualNoteId = snapNoteId;
      const existing = this.data.notes[actualNoteId];
      if (existing && existing.markerId !== markerId) {
        actualNoteId = this.uniqueNoteId();
      }
      this.data.notes[actualNoteId] = {
        markerId,
        text: note.text,
        order: note.order,
      };
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

  /** Stable JSON of the markers file. Same text after a reload means the same map. */
  private capture(): string {
    const pages: Record<string, PageDef> = {};
    for (const [id, def] of this.pages()) {
      pages[id] = {
        name: def.name,
        kind: def.kind,
        order: def.order,
        layout: def.layout,
        groupsLayout: def.groupsLayout,
        collapsed: packCollapsed(def.collapsed),
      };
    }
    const surfaces = packSurfaces(this.data.surfaces, this.data.pages, this.defaultFilesPageId());
    const markers: Record<string, MarkerDef> = {};
    for (const [id, def] of this.markers()) {
      const entry = { label: def.label } as MarkerDef;
      if (def.color) {
        entry.color = def.color;
      }
      if (def.icon) {
        entry.icon = def.icon;
      }
      if (def.alias) {
        entry.alias = def.alias;
      }
      if (def.columns) {
        entry.columns = def.columns;
      }
      if (def.locked) {
        entry.locked = true;
      }
      entry.order = def.order;
      if (def.parent) {
        entry.parent = def.parent;
      } else if (def.page) {
        entry.page = def.page;
      }
      markers[id] = entry;
    }
    const items: Record<string, string[]> = {};
    const added: Record<string, Record<string, number>> = {};
    for (const relPath of Object.keys(this.data.items).sort()) {
      const ids = this.markersOf(relPath);
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
    for (const key of Object.keys(this.data.aliases).sort()) {
      const value = this.data.aliases[key]?.trim();
      if (value) {
        aliases[key] = value;
      }
    }
    const classes: Record<string, ClassDef> = {};
    const classItems: Record<string, string[]> = {};
    const classAdded: Record<string, Record<string, number>> = {};
    for (const classId of Object.keys(this.data.classes).sort()) {
      const def = this.data.classes[classId];
      const markerIds = (this.data.classItems[classId] ?? []).filter((id) => id in this.data.markers);
      if (!def || markerIds.length === 0) {
        continue;
      }
      classes[classId] = {
        relPath: def.relPath,
        name: def.name,
        ...(def.line !== undefined ? { line: def.line } : {}),
        ...(def.alias ? { alias: def.alias } : {}),
      };
      classItems[classId] = markerIds;
      const dates: Record<string, number> = {};
      for (const markerId of markerIds) {
        const at = this.data.classAdded[classId]?.[markerId];
        if (at !== undefined) {
          dates[markerId] = at;
        }
      }
      if (Object.keys(dates).length > 0) {
        classAdded[classId] = dates;
      }
    }
    const notes: Record<string, NoteDef> = {};
    for (const [id, def] of this.notes()) {
      if (!this.data.markers[def.markerId] || !def.text.trim()) {
        continue;
      }
      notes[id] = { markerId: def.markerId, text: def.text, order: def.order };
    }
    const payload: Record<string, unknown> = {
      version: 1,
      pages,
      markers,
      items,
      added,
      surfaces,
    };
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
    return JSON.stringify(payload, null, 2) + '\n';
  }

  private async save(): Promise<void> {
    await this.writeConfig(this.capture());
  }

  private async writeConfig(json: string): Promise<void> {
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(this.configUri, '..'));
    await vscode.workspace.fs.writeFile(this.configUri, Buffer.from(json, 'utf8'));
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

  private applyPageOrder(ordered: string[]): void {
    ordered.forEach((pageId, index) => {
      if (this.data.pages[pageId]) {
        this.data.pages[pageId].order = index + 1;
      }
    });
  }

  private applyNoteOrder(markerId: string): void {
    this.notesOf(markerId).forEach(([noteId], index) => {
      if (this.data.notes[noteId]) {
        this.data.notes[noteId].order = index + 1;
      }
    });
  }

  private removeNotesOfMarker(markerId: string): void {
    for (const [noteId, def] of Object.entries(this.data.notes)) {
      if (def.markerId === markerId) {
        delete this.data.notes[noteId];
      }
    }
  }

  private forgetCollapsed(markerId: string): void {
    for (const page of Object.values(this.data.pages)) {
      for (const surface of MAP_SURFACES) {
        delete page.collapsed[surface][markerId];
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

  /** Drop a marker and its item/class/note links without committing. */
  private purgeMarker(id: string): void {
    delete this.data.markers[id];
    this.removeNotesOfMarker(id);
    this.forgetCollapsed(id);
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

function packCollapsed(collapsed: SurfaceCollapsed): SurfaceCollapsed {
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
  const source = raw as { active?: unknown; profiles?: unknown };
  const profiles: StyleProfile[] = [];
  const seen = new Set<string>();
  if (Array.isArray(source.profiles)) {
    for (const entry of source.profiles) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        continue;
      }
      const item = entry as { id?: unknown; name?: unknown };
      if (typeof item.id !== 'string' || !item.id.trim()) {
        continue;
      }
      const id = item.id.trim();
      if (seen.has(id) || id === GENERAL_PROFILE_ID) {
        continue;
      }
      const name =
        typeof item.name === 'string' && item.name.trim() ? item.name.trim() : id;
      if (name.toLocaleLowerCase() === GENERAL_PROFILE_NAME.toLocaleLowerCase()) {
        continue;
      }
      seen.add(id);
      profiles.push({ id, name });
    }
  }
  result.profiles = [{ id: GENERAL_PROFILE_ID, name: GENERAL_PROFILE_NAME }, ...profiles];
  const active = typeof source.active === 'string' ? source.active : GENERAL_PROFILE_ID;
  result.active = result.profiles.some((p) => p.id === active) ? active : GENERAL_PROFILE_ID;
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
      result.pages[id] = {
        name,
        kind,
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
      result.markers[id] = {
        label: capitalize(typeof def.label === 'string' && def.label.trim() ? def.label : id),
        color: typeof def.color === 'string' && def.color ? migrateColorId(normalizeHex(def.color) ?? def.color) : undefined,
        icon: typeof def.icon === 'string' && def.icon.trim() ? def.icon.trim() : undefined,
        alias: typeof def.alias === 'string' && def.alias.trim() ? def.alias.trim() : undefined,
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
    for (const [id, value] of Object.entries(source.notes as Record<string, unknown>)) {
      index++;
      if (!value || typeof value !== 'object') {
        continue;
      }
      const def = value as Partial<NoteDef>;
      const markerId = typeof def.markerId === 'string' ? def.markerId : '';
      const text = typeof def.text === 'string' ? def.text.trim() : '';
      if (!markerId || !(markerId in result.markers) || !text) {
        continue;
      }
      const pageId = (() => {
        let current: string | undefined = markerId;
        const seen = new Set<string>();
        while (current && result.markers[current] && !seen.has(current)) {
          seen.add(current);
          const marker: MarkerDef = result.markers[current];
          if (!marker.parent) {
            return marker.page;
          }
          current = marker.parent;
        }
        return undefined;
      })();
      if (!pageId || result.pages[pageId]?.kind !== 'notes') {
        continue;
      }
      result.notes[id] = {
        markerId,
        text,
        order: typeof def.order === 'number' ? def.order : index,
      };
    }
  }

  for (const page of Object.values(result.pages)) {
    for (const surface of MAP_SURFACES) {
      for (const markerId of Object.keys(page.collapsed[surface])) {
        if (!(markerId in result.markers)) {
          delete page.collapsed[surface][markerId];
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
