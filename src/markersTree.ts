import * as path from 'path';
import * as vscode from 'vscode';
import { themeColorId } from './palette';
import { MarkerStore } from './markerStore';

export type MarkerNode = { kind: 'marker'; id: string; markerId: string };

export type ItemNode = {
  kind: 'item';
  id: string;
  markerId: string;
  relPath: string;
  isDir: boolean;
  exists: boolean;
};

export type ChildNode = {
  kind: 'child';
  id: string;
  markerId: string;
  uri: vscode.Uri;
  isDir: boolean;
  parent: ItemNode | ChildNode;
};

export type ClassNode = {
  kind: 'class';
  id: string;
  markerId: string;
  classId: string;
};

export type Node = MarkerNode | ItemNode | ChildNode | ClassNode;

const ALWAYS_HIDDEN = new Set(['.git', '.DS_Store']);

export class MarkersTreeProvider implements vscode.TreeDataProvider<Node>, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<Node | undefined>();
  private readonly nodes = new Map<string, Node>();
  private readonly subscription: vscode.Disposable;

  readonly onDidChangeTreeData = this.emitter.event;

  constructor(private readonly store: MarkerStore) {
    this.subscription = store.onDidChange(() => this.refresh());
  }

  dispose(): void {
    this.subscription.dispose();
    this.emitter.dispose();
  }

  refresh(): void {
    this.nodes.clear();
    this.emitter.fire(undefined);
  }

  async getChildren(node?: Node): Promise<Node[]> {
    if (!node) {
      return this.store.markers().map(([markerId]) => this.markerNode(markerId));
    }
    if (node.kind === 'marker') {
      return Promise.all(this.store.itemsOf(node.markerId).map((relPath) => this.itemNode(node.markerId, relPath)));
    }
    if (node.kind === 'class') {
      return [];
    }
    if (node.isDir && (node.kind === 'child' || node.exists)) {
      return this.readChildren(node);
    }
    return [];
  }

  getParent(node: Node): Node | undefined {
    if (node.kind === 'marker') {
      return undefined;
    }
    if (node.kind === 'item' || node.kind === 'class') {
      return this.markerNode(node.markerId);
    }
    return node.parent;
  }

  getTreeItem(node: Node): vscode.TreeItem {
    if (node.kind === 'marker') {
      return this.markerItem(node);
    }
    if (node.kind === 'item') {
      return this.itemItem(node);
    }
    if (node.kind === 'class') {
      const def = this.store.classDef(node.classId);
      const item = new vscode.TreeItem(def?.name ?? node.classId, vscode.TreeItemCollapsibleState.None);
      item.id = node.id;
      item.contextValue = 'class';
      item.description = def?.relPath;
      item.iconPath = new vscode.ThemeIcon('symbol-class');
      item.command = { command: 'vgroup.openClass', title: 'Open Class', arguments: [node] };
      return item;
    }
    const item = new vscode.TreeItem(
      node.uri,
      node.isDir ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
    );
    item.id = node.id;
    item.contextValue = 'child';
    if (!node.isDir) {
      item.command = { command: 'vscode.open', title: 'Open', arguments: [node.uri] };
    }
    return item;
  }

  /** Returns the tree node of the first marker that contains this exact path, if any. */
  async findItemNode(relPath: string): Promise<ItemNode | undefined> {
    const [markerId] = this.store.markersOf(relPath);
    if (!markerId) {
      return undefined;
    }
    return this.itemNode(markerId, relPath);
  }

  markerNode(markerId: string): MarkerNode {
    return this.intern<MarkerNode>({ kind: 'marker', id: `m:${markerId}`, markerId });
  }

  async itemNode(markerId: string, relPath: string): Promise<ItemNode> {
    let exists = true;
    let isDir = false;
    try {
      const stat = await vscode.workspace.fs.stat(this.store.toUri(relPath));
      isDir = (stat.type & vscode.FileType.Directory) !== 0;
    } catch {
      exists = false;
    }
    return this.intern<ItemNode>({ kind: 'item', id: `i:${markerId}:${relPath}`, markerId, relPath, isDir, exists });
  }

  classNode(markerId: string, classId: string): ClassNode {
    return this.intern<ClassNode>({ kind: 'class', id: `c:${markerId}:${classId}`, markerId, classId });
  }

  uriOf(node: Node): vscode.Uri | undefined {
    if (node.kind === 'item') {
      return node.exists ? this.store.toUri(node.relPath) : undefined;
    }
    if (node.kind === 'child') {
      return node.uri;
    }
    if (node.kind === 'class') {
      const def = this.store.classDef(node.classId);
      return def ? this.store.toUri(def.relPath) : undefined;
    }
    return undefined;
  }

  private markerItem(node: MarkerNode): vscode.TreeItem {
    const def = this.store.marker(node.markerId);
    const count = this.store.itemsOf(node.markerId).length;
    const item = new vscode.TreeItem(def?.label ?? node.markerId, vscode.TreeItemCollapsibleState.Expanded);
    item.id = node.id;
    item.contextValue = 'marker';
    item.description = def?.badge ? `${def.badge} · ${count}` : String(count);
    item.tooltip = `${def?.label ?? node.markerId} — ${count} item(s)`;
    item.iconPath = new vscode.ThemeIcon('tag', def?.color ? new vscode.ThemeColor(themeColorId(def.color)) : undefined);
    return item;
  }

  private itemItem(node: ItemNode): vscode.TreeItem {
    const uri = this.store.toUri(node.relPath);
    const dir = path.posix.dirname(node.relPath);
    const otherMarkers = this.store
      .markersOf(node.relPath)
      .filter((id) => id !== node.markerId)
      .map((id) => this.store.marker(id)?.label ?? id);

    if (!node.exists) {
      const item = new vscode.TreeItem(path.posix.basename(node.relPath), vscode.TreeItemCollapsibleState.None);
      item.id = node.id;
      item.contextValue = 'markedMissing';
      item.description = `missing · ${dir === '.' ? '' : dir}`;
      item.tooltip = `${node.relPath}\nNot found. Use "Relink to File…" or remove the marker.`;
      item.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('list.warningForeground'));
      return item;
    }

    const item = new vscode.TreeItem(
      uri,
      node.isDir ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
    );
    item.id = node.id;
    item.contextValue = node.isDir ? 'markedFolder' : 'markedFile';
    item.description = dir === '.' ? undefined : dir;
    item.tooltip = otherMarkers.length > 0 ? `${node.relPath}\nAlso in: ${otherMarkers.join(', ')}` : node.relPath;
    if (!node.isDir) {
      item.command = { command: 'vscode.open', title: 'Open', arguments: [uri] };
    }
    return item;
  }

  private async readChildren(parent: ItemNode | ChildNode): Promise<ChildNode[]> {
    const dirUri = parent.kind === 'item' ? this.store.toUri(parent.relPath) : parent.uri;
    let entries: Array<[string, vscode.FileType]>;
    try {
      entries = await vscode.workspace.fs.readDirectory(dirUri);
    } catch {
      return [];
    }
    const hidden = excludedNames();
    return entries
      .filter(([name]) => !ALWAYS_HIDDEN.has(name) && !hidden.has(name))
      .map(([name, type]) => ({ name, isDir: (type & vscode.FileType.Directory) !== 0 }))
      .sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name))
      .map(({ name, isDir }) => {
        return this.intern<ChildNode>({
          kind: 'child',
          id: `${parent.id}/${name}`,
          markerId: parent.markerId,
          uri: vscode.Uri.joinPath(dirUri, name),
          isDir,
          parent,
        });
      });
  }

  private intern<T extends Node>(node: T): T {
    const existing = this.nodes.get(node.id);
    if (existing && JSON.stringify(nodeKey(existing)) === JSON.stringify(nodeKey(node))) {
      return existing as T;
    }
    this.nodes.set(node.id, node);
    return node;
  }
}

function nodeKey(node: Node): unknown {
  if (node.kind === 'item') {
    return [node.isDir, node.exists];
  }
  if (node.kind === 'child') {
    return [node.isDir];
  }
  if (node.kind === 'class') {
    return [node.classId];
  }
  return [];
}

/** Basenames hidden via simple `files.exclude` patterns like `**\/build` or `.dart_tool`. */
function excludedNames(): Set<string> {
  const exclude = vscode.workspace.getConfiguration('files').get<Record<string, boolean>>('exclude') ?? {};
  const names = new Set<string>();
  for (const [pattern, enabled] of Object.entries(exclude)) {
    if (enabled !== true) {
      continue;
    }
    const name = pattern.replace(/^\*\*\//, '');
    if (!/[*?{}[\]/]/.test(name)) {
      names.add(name);
    }
  }
  return names;
}
