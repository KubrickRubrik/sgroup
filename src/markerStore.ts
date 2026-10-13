import * as path from 'path';
import * as vscode from 'vscode';
import { normalizeHex } from './palette';

/** Max nesting depth: root (0) → subgroup (1) → subgroup of subgroup (2). */
export const MAX_MARKER_DEPTH = 2;

export interface MarkerDef {
  label: string;
  /** Theme color id (`vgroup.red`, `charts.red`) or `#rrggbb`. */
  color?: string;
  badge?: string;
  /** Emoji shown before the group name. */
  icon?: string;
  /** Parent marker id; omitted for top-level groups. */
  parent?: string;
  /** Order among siblings that share the same parent. */
  order: number;
}

export type NestResult = { ok: true } | { ok: false; reason: string };

interface MarkersFile {
  version: 1;
  markers: Record<string, MarkerDef>;
  items: Record<string, string[]>;
  /** relPath → markerId → epoch ms when the item was added to that marker. */
  added: Record<string, Record<string, number>>;
}

function emptyData(): MarkersFile {
  return { version: 1, markers: {}, items: {}, added: {} };
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

  readonly onDidChange = this.changeEmitter.event;
  lastError?: string;

  constructor(
    readonly root: vscode.Uri,
    private configPath: string,
  ) {}

  get configUri(): vscode.Uri {
    return vscode.Uri.joinPath(this.root, this.configPath);
  }

  async init(): Promise<void> {
    this.watch();
    await this.load();
  }

  async setConfigPath(configPath: string): Promise<void> {
    if (configPath === this.configPath) {
      return;
    }
    this.configPath = configPath;
    this.watch();
    await this.load();
  }

  dispose(): void {
    this.watcher?.dispose();
    this.changeEmitter.dispose();
  }

  async load(): Promise<void> {
    try {
      const raw = await vscode.workspace.fs.readFile(this.configUri);
      this.data = normalize(JSON.parse(Buffer.from(raw).toString('utf8')));
      this.lastError = undefined;
    } catch (error) {
      if (isFileNotFound(error)) {
        this.data = emptyData();
        this.lastError = undefined;
      } else {
        this.lastError = `Cannot read ${this.configPath}: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
    this.changeEmitter.fire();
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

  /** Flat list in tree pre-order (parents before children). */
  markers(): Array<[string, MarkerDef]> {
    const result: Array<[string, MarkerDef]> = [];
    const visit = (parentId: string | undefined) => {
      for (const [id, def] of this.children(parentId)) {
        result.push([id, def]);
        visit(id);
      }
    };
    visit(undefined);
    return result;
  }

  marker(id: string): MarkerDef | undefined {
    return this.data.markers[id];
  }

  /** Siblings that share the same parent, sorted by order. */
  children(parentId?: string | undefined): Array<[string, MarkerDef]> {
    return Object.entries(this.data.markers)
      .filter(([, def]) => (def.parent ?? undefined) === (parentId ?? undefined))
      .sort((a, b) => a[1].order - b[1].order || a[1].label.localeCompare(b[1].label));
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
    return Object.keys(this.data.items).some((p) => p === relPath || p.startsWith(prefix) || relPath.startsWith(p + '/'));
  }

  // ---- markers ----

  async createMarker(def: Omit<MarkerDef, 'order'>): Promise<string> {
    const id = this.uniqueId(def.label);
    const parent = def.parent && this.data.markers[def.parent] ? def.parent : undefined;
    if (parent !== undefined && this.depthOf(parent) >= MAX_MARKER_DEPTH) {
      throw new Error(`Maximum nesting depth is ${MAX_MARKER_DEPTH} subgroups.`);
    }
    const siblings = this.children(parent);
    const maxOrder = Math.max(0, ...siblings.map(([, m]) => m.order));
    this.data.markers[id] = {
      ...def,
      label: capitalize(def.label),
      parent,
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
    this.data.markers[id] = next;
    await this.commit();
  }

  async deleteMarker(id: string): Promise<void> {
    const def = this.data.markers[id];
    if (!def) {
      return;
    }
    const grandParent = def.parent;
    const children = this.children(id);
    const siblings = this.children(grandParent)
      .map(([markerId]) => markerId)
      .filter((markerId) => markerId !== id);
    const insertAt = siblings.length;
    // Lift children to the deleted marker's parent, keeping relative order.
    const lifted = children.map(([childId]) => childId);
    const ordered = [...siblings.slice(0, insertAt), ...lifted, ...siblings.slice(insertAt)];
    for (const childId of lifted) {
      this.data.markers[childId].parent = grandParent;
    }
    delete this.data.markers[id];
    this.applyOrder(ordered);
    for (const [relPath, ids] of Object.entries(this.data.items)) {
      this.setItem(relPath, ids.filter((x) => x !== id));
    }
    await this.commit();
  }

  async moveMarker(id: string, delta: -1 | 1): Promise<void> {
    const def = this.data.markers[id];
    if (!def) {
      return;
    }
    const ordered = this.children(def.parent).map(([markerId]) => markerId);
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
    if (parent !== oldParent) {
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
    const ordered = this.children(parent)
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
    if (oldParent !== parent) {
      this.applyOrder(this.children(oldParent).map(([markerId]) => markerId));
    }
    await this.commit();
  }

  async nestMarker(id: string, parentId: string): Promise<void> {
    const check = this.canNest(id, parentId);
    if (!check.ok) {
      throw new Error(check.reason);
    }
    const oldParent = this.data.markers[id].parent;
    this.data.markers[id].parent = parentId;
    const ordered = this.children(parentId)
      .map(([markerId]) => markerId)
      .filter((markerId) => markerId !== id);
    ordered.push(id);
    this.applyOrder(ordered);
    if (oldParent !== parentId) {
      this.applyOrder(this.children(oldParent).map(([markerId]) => markerId));
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
    const siblings = this.children(grandParent)
      .map(([markerId]) => markerId)
      .filter((markerId) => markerId !== id);
    const parentIndex = siblings.indexOf(parentId);
    const insertAt = parentIndex < 0 ? siblings.length : parentIndex + 1;
    this.data.markers[id].parent = grandParent;
    siblings.splice(insertAt, 0, id);
    this.applyOrder(siblings);
    this.applyOrder(this.children(parentId).map(([markerId]) => markerId));
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
    return changed;
  }

  async commit(): Promise<void> {
    await this.save();
    this.changeEmitter.fire();
  }

  // ---- internals ----

  private watch(): void {
    this.watcher?.dispose();
    this.watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(this.root, this.configPath));
    const reload = () => {
      void this.load();
    };
    this.watcher.onDidChange(reload);
    this.watcher.onDidCreate(reload);
    this.watcher.onDidDelete(reload);
  }

  private async save(): Promise<void> {
    const markers: Record<string, MarkerDef> = {};
    for (const [id, def] of this.markers()) {
      const { parent, ...rest } = def;
      markers[id] = parent ? { ...rest, parent } : { ...rest };
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
    const json = JSON.stringify({ version: 1, markers, items, added }, null, 2) + '\n';
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

  private setAdded(relPath: string, markerId: string, at: number): void {
    this.data.added[relPath] = { ...this.data.added[relPath], [markerId]: at };
  }

  private applyOrder(ordered: string[]): void {
    ordered.forEach((markerId, index) => {
      if (this.data.markers[markerId]) {
        this.data.markers[markerId].order = index + 1;
      }
    });
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
}

function normalize(raw: unknown): MarkersFile {
  const result = emptyData();
  if (!raw || typeof raw !== 'object') {
    return result;
  }
  const source = raw as { markers?: unknown; items?: unknown; added?: unknown };

  if (source.markers && typeof source.markers === 'object') {
    let index = 0;
    for (const [id, value] of Object.entries(source.markers as Record<string, unknown>)) {
      index++;
      if (!value || typeof value !== 'object') {
        continue;
      }
      const def = value as Partial<MarkerDef>;
      const parent = typeof def.parent === 'string' && def.parent ? def.parent : undefined;
      result.markers[id] = {
        label: capitalize(typeof def.label === 'string' && def.label.trim() ? def.label : id),
        color: typeof def.color === 'string' && def.color ? (normalizeHex(def.color) ?? def.color) : undefined,
        badge: typeof def.badge === 'string' && def.badge.trim() ? def.badge.trim() : undefined,
        icon: typeof def.icon === 'string' && def.icon.trim() ? def.icon.trim() : undefined,
        parent,
        order: typeof def.order === 'number' ? def.order : index,
      };
    }
  }

  repairParents(result.markers);

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
