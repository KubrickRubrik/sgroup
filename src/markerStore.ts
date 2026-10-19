import * as path from 'path';
import * as vscode from 'vscode';
import {
  decodeHistory,
  emptyHistory,
  encodeHistory,
  fingerprint,
  HISTORY_PATH,
  peek,
  remember,
  take,
  type HistoryStacks,
} from './history';
import { normalizeHex } from './palette';

/** Max nesting depth: root (0) → subgroup (1) → subgroup of subgroup (2). */
export const MAX_MARKER_DEPTH = 2;

/** Fixed markers file relative to the workspace folder. */
export const CONFIG_PATH = '.syn3/syn3.json';
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

/** Map font scales and Explorer label saturation, stored in the markers file. */
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
  /** Explorer file-name tint: 0 = theme foreground, 100 = group stripe color. */
  labelSaturation: number;
}

export const DEFAULT_APPEARANCE: Appearance = {
  fontGroup: 1.15,
  fontSubgroup: 1.05,
  fontFolder: 0.95,
  fontFile: 0.9,
  fontScale: 1,
  gradientDirection: 0,
  labelSaturation: 20,
};

const FONT_SCALE_MIN = 0.6;
const FONT_SCALE_MAX = 2;
const FONT_SCALE_STEP = 0.05;
const MULTIPLIER_MIN = 1;
const MULTIPLIER_MAX = 5;
const MULTIPLIER_STEP = 0.1;
const SATURATION_STEP = 5;
const GRADIENT_STEP = 1;

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
  return snap(value, 0, 100, GRADIENT_STEP);
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
    labelSaturation: snapSaturation(numOr(source.labelSaturation, DEFAULT_APPEARANCE.labelSaturation)),
  };
}

function numOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
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
  /** Order among siblings that share the same parent. */
  order: number;
}

/** Named map page (pager slide). */
export interface PageDef {
  name: string;
  kind: PageKind;
  order: number;
  layout: MapLayout;
  groupsLayout: GroupsLayout;
  /** Collapsed top-level (and nested) group ids on this page. */
  collapsed: Record<string, boolean>;
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
    collapsed: {},
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
  appearance: Appearance;
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
  private watcher?: vscode.FileSystemWatcher;
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  /** When migration fails, read this path for the current session instead of CONFIG_PATH. */
  private sessionConfigPath = CONFIG_PATH;
  /** Canonical markers JSON at the history cursor. */
  private present = '';
  /**
   * On-disk text when it differs from `present` but describes the same map
   * (older key order). The first undo restores these exact bytes.
   */
  private baseline?: string;
  private history: HistoryStacks = emptyHistory();
  /** False until the history file has been read, so startup cannot record a step. */
  private historyReady = false;
  private queue: Promise<void> = Promise.resolve();

  readonly onDidChange = this.changeEmitter.event;
  lastError?: string;

  constructor(readonly root: vscode.Uri) {}

  get configUri(): vscode.Uri {
    return vscode.Uri.joinPath(this.root, this.sessionConfigPath);
  }

  get historyUri(): vscode.Uri {
    return vscode.Uri.joinPath(this.root, HISTORY_PATH);
  }

  get appearance(): Appearance {
    return this.data.appearance;
  }

  get canUndo(): boolean {
    return this.history.past.length > 0;
  }

  get canRedo(): boolean {
    return this.history.future.length > 0;
  }

  historySteps(): { back: number; forward: number } {
    return { back: this.history.past.length, forward: this.history.future.length };
  }

  async init(): Promise<void> {
    await this.migrateLegacyConfig();
    await this.migrateHistory();
    await this.load();
    await this.loadHistory();
    this.historyReady = true;
    await this.publishHistoryContext();
    this.watch();
    this.changeEmitter.fire();
  }

  dispose(): void {
    this.watcher?.dispose();
    this.changeEmitter.dispose();
  }

  async load(): Promise<void> {
    await this.enqueue(() => this.reloadFromDisk(true));
  }

  /** Restore the markers file to the previous step. */
  async undo(): Promise<void> {
    await this.travel(-1);
  }

  /** Reapply a step that was undone. */
  async redo(): Promise<void> {
    await this.travel(1);
  }

  async setAppearance(partial: Partial<Appearance>): Promise<void> {
    this.data.appearance = normalizeAppearance({ ...this.data.appearance, ...partial });
    await this.commit();
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
    for (const page of Object.values(this.data.pages)) {
      delete page.collapsed[id];
    }
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
    const ordered = this.pages();
    if (ordered.length <= 1 || !this.data.pages[id]) {
      return undefined;
    }
    const index = ordered.findIndex(([pageId]) => pageId === id);
    const neighbor = ordered[index + 1]?.[0] ?? ordered[index - 1]?.[0];
    const toRemove = this.children(undefined, id).flatMap(([rootId]) =>
      this.descendantMarkers(rootId, true),
    );
    for (const markerId of toRemove) {
      this.purgeMarker(markerId);
    }
    delete this.data.pages[id];
    this.applyPageOrder(this.pages().map(([pageId]) => pageId));
    await this.commit();
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
    patch: Partial<Pick<PageDef, 'layout' | 'groupsLayout' | 'collapsed'>>,
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
    if (patch.collapsed !== undefined) {
      page.collapsed = { ...patch.collapsed };
    }
    await this.commit();
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
    this.watcher?.dispose();
    this.watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(this.root, this.sessionConfigPath),
    );
    const reload = () => {
      void this.enqueue(() => this.reloadFromDisk(false));
    };
    this.watcher.onDidChange(reload);
    this.watcher.onDidCreate(reload);
    this.watcher.onDidDelete(reload);
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
          `SGroup: не удалось перенести маркеры в ${CONFIG_PATH} — читаю ${legacyRel}. ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
      return;
    }

    const overwrite = 'Перезаписать';
    const keep = 'Оставить';
    const choice = await vscode.window.showWarningMessage(
      `SGroup: найдены и ${CONFIG_PATH}, и ${legacyRel}. Перезаписать новый файл старым или оставить ${CONFIG_PATH}?`,
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
          `SGroup: не удалось перезаписать ${CONFIG_PATH}. ${
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

  private async reloadFromDisk(notify: boolean): Promise<void> {
    let raw: string | undefined;
    let next: MarkersFile | undefined;
    try {
      raw = Buffer.from(await vscode.workspace.fs.readFile(this.configUri)).toString('utf8');
      next = normalize(JSON.parse(raw));
      this.lastError = undefined;
    } catch (error) {
      if (isFileNotFound(error)) {
        next = emptyData();
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
    this.history = emptyHistory();
    await this.persistHistory();
    this.changeEmitter.fire();
    await this.publishHistoryContext();
  }

  private async loadHistory(): Promise<void> {
    try {
      const raw = await vscode.workspace.fs.readFile(this.historyUri);
      this.history = decodeHistory(Buffer.from(raw).toString('utf8'), fingerprint(this.present));
    } catch (error) {
      if (!isFileNotFound(error)) {
        console.error('SGroup history:', error);
      }
      this.history = emptyHistory();
    }
  }

  private async commitNow(): Promise<void> {
    const next = this.capture();
    if (next === this.present) {
      this.changeEmitter.fire();
      return;
    }
    const previous = this.baseline ?? this.present;
    await this.writeConfig(next);
    this.baseline = undefined;
    if (this.historyReady) {
      remember(this.history, previous);
    }
    this.present = next;
    if (this.historyReady) {
      await this.persistHistory();
      await this.publishHistoryContext();
    }
    this.changeEmitter.fire();
  }

  private async travel(direction: -1 | 1): Promise<void> {
    await this.enqueue(async () => {
      const snapshot = peek(this.history, direction);
      if (snapshot === undefined) {
        return;
      }
      let parsed: MarkersFile;
      try {
        parsed = normalize(JSON.parse(snapshot));
      } catch (error) {
        console.error('SGroup history:', error);
        return;
      }
      const backup = this.data;
      const backupBaseline = this.baseline;
      const leaving = this.baseline ?? this.present;
      this.data = parsed;
      try {
        await this.writeConfig(snapshot);
        const restored = this.capture();
        take(this.history, direction, leaving);
        this.present = restored;
        this.baseline = restored === snapshot ? undefined : snapshot;
        await this.persistHistory();
        this.changeEmitter.fire();
        await this.publishHistoryContext();
      } catch (error) {
        this.data = backup;
        this.baseline = backupBaseline;
        throw error;
      }
    });
  }

  private async persistHistory(): Promise<void> {
    try {
      const json = encodeHistory(this.history, fingerprint(this.present));
      await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(this.historyUri, '..'));
      await vscode.workspace.fs.writeFile(this.historyUri, Buffer.from(json, 'utf8'));
    } catch (error) {
      console.error('SGroup history:', error);
    }
  }

  private async publishHistoryContext(): Promise<void> {
    await vscode.commands.executeCommand('setContext', 'syn3.canUndo', this.canUndo);
    await vscode.commands.executeCommand('setContext', 'syn3.canRedo', this.canRedo);
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

  /** Stable JSON of the markers file. Same text after a reload means the same map. */
  private capture(): string {
    const pages: Record<string, PageDef> = {};
    for (const [id, def] of this.pages()) {
      const collapsed: Record<string, boolean> = {};
      for (const markerId of Object.keys(def.collapsed).sort()) {
        if (def.collapsed[markerId]) {
          collapsed[markerId] = true;
        }
      }
      pages[id] = {
        name: def.name,
        kind: def.kind,
        order: def.order,
        layout: def.layout,
        groupsLayout: def.groupsLayout,
        collapsed,
      };
    }
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
      appearance: this.data.appearance,
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

  /** Drop a marker and its item/class/note links without committing. */
  private purgeMarker(id: string): void {
    delete this.data.markers[id];
    this.removeNotesOfMarker(id);
    for (const page of Object.values(this.data.pages)) {
      delete page.collapsed[id];
    }
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
    const base =
      label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'marker';
    let id = base;
    let counter = 2;
    while (this.data.markers[id]) {
      id = `${base}-${counter++}`;
    }
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
      const collapsed: Record<string, boolean> = {};
      if (def.collapsed && typeof def.collapsed === 'object') {
        for (const [markerId, on] of Object.entries(def.collapsed as Record<string, unknown>)) {
          if (on) {
            collapsed[markerId] = true;
          }
        }
      }
      result.pages[id] = {
        name,
        kind,
        order: typeof def.order === 'number' ? def.order : index,
        layout: normalizeMapLayout(def.layout),
        groupsLayout: normalizeGroupsLayout(def.groupsLayout),
        collapsed,
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
        order: typeof def.order === 'number' ? def.order : index,
      };
    }
  }

  repairParents(result.markers);

  const fallbackPage =
    Object.entries(result.pages)
      .sort((a, b) => a[1].order - b[1].order || a[0].localeCompare(b[0]))
      .find(([, p]) => p.kind === 'files')?.[0] ?? Object.keys(result.pages)[0];
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
    for (const markerId of Object.keys(page.collapsed)) {
      if (!(markerId in result.markers)) {
        delete page.collapsed[markerId];
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
