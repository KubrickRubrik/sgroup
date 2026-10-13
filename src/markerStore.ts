import * as path from 'path';
import * as vscode from 'vscode';
import { normalizeHex } from './palette';

export interface MarkerDef {
  label: string;
  /** Theme color id (`vgroup.red`, `charts.red`) or `#rrggbb`. */
  color?: string;
  badge?: string;
  /** Emoji shown before the group name. */
  icon?: string;
  order: number;
}

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

  markers(): Array<[string, MarkerDef]> {
    return Object.entries(this.data.markers).sort((a, b) => {
      return a[1].order - b[1].order || a[1].label.localeCompare(b[1].label);
    });
  }

  marker(id: string): MarkerDef | undefined {
    return this.data.markers[id];
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
    return ids.slice().sort((a, b) => (this.data.markers[a]?.order ?? 0) - (this.data.markers[b]?.order ?? 0));
  }

  hasAnyMarkedUnder(relPath: string): boolean {
    const prefix = relPath + '/';
    return Object.keys(this.data.items).some((p) => p === relPath || p.startsWith(prefix) || relPath.startsWith(p + '/'));
  }

  // ---- markers ----

  async createMarker(def: Omit<MarkerDef, 'order'>): Promise<string> {
    const id = this.uniqueId(def.label);
    const maxOrder = Math.max(0, ...Object.values(this.data.markers).map((m) => m.order));
    this.data.markers[id] = { ...def, label: capitalize(def.label), order: maxOrder + 1 };
    await this.commit();
    return id;
  }

  async updateMarker(id: string, patch: Partial<Omit<MarkerDef, 'order'>>): Promise<void> {
    const current = this.data.markers[id];
    if (!current) {
      return;
    }
    this.data.markers[id] = { ...current, ...patch, label: capitalize(patch.label ?? current.label) };
    await this.commit();
  }

  async deleteMarker(id: string): Promise<void> {
    delete this.data.markers[id];
    for (const [relPath, ids] of Object.entries(this.data.items)) {
      this.setItem(relPath, ids.filter((x) => x !== id));
    }
    await this.commit();
  }

  async moveMarker(id: string, delta: -1 | 1): Promise<void> {
    const ordered = this.markers().map(([markerId]) => markerId);
    const index = ordered.indexOf(id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= ordered.length) {
      return;
    }
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    this.applyOrder(ordered);
    await this.commit();
  }

  async placeMarkerBefore(id: string, beforeId: string): Promise<void> {
    if (id === beforeId) {
      return;
    }
    const ordered = this.markers()
      .map(([markerId]) => markerId)
      .filter((markerId) => markerId !== id);
    const index = ordered.indexOf(beforeId);
    ordered.splice(index < 0 ? ordered.length : index, 0, id);
    this.applyOrder(ordered);
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
      markers[id] = def;
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
      this.data.markers[markerId].order = index + 1;
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
      result.markers[id] = {
        label: capitalize(typeof def.label === 'string' && def.label.trim() ? def.label : id),
        color: typeof def.color === 'string' && def.color ? (normalizeHex(def.color) ?? def.color) : undefined,
        badge: typeof def.badge === 'string' && def.badge.trim() ? def.badge.trim() : undefined,
        icon: typeof def.icon === 'string' && def.icon.trim() ? def.icon.trim() : undefined,
        order: typeof def.order === 'number' ? def.order : index,
      };
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

  return result;
}

function normalizePath(relPath: string): string {
  return relPath.replace(/\\/g, '/').replace(/\/+$/, '');
}
