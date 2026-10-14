import * as crypto from 'crypto';
import * as path from 'path';
import * as vscode from 'vscode';
import { ColumnsMode, MarkerStore } from './markerStore';
import { openClassAt } from './openClass';
import { cssColor, normalizeHex } from './palette';

type Layout = 'chips' | 'list';
type GroupsLayout = 'flow' | '1' | '2' | '3';

const LAYOUT_KEY = 'vgroup.map.layout';
const GROUPS_LAYOUT_KEY = 'vgroup.map.groupsLayout';
const GROUPS_LAYOUT_CYCLE: GroupsLayout[] = ['flow', '1', '2', '3'];
/** Context key that selects which groups-layout button is shown in view/editor titles. */
const GROUPS_LAYOUT_CONTEXT = 'vgroup.map.groupsLayout';

interface MapItem {
  relPath: string;
  name: string;
  dir: string;
  isDir: boolean;
  exists: boolean;
  alias?: string;
}

interface MapClass {
  id: string;
  name: string;
  relPath: string;
  fileName: string;
  line?: number;
  exists: boolean;
  alias?: string;
}

interface MapGroup {
  id: string;
  label: string;
  badge?: string;
  icon?: string;
  color?: string;
  alias?: string;
  parent?: string;
  columns: ColumnsMode;
  depth: number;
  /** Height of nested subgroup tree (0 if no children). */
  subtreeHeight: number;
  children: string[];
  items: MapItem[];
  classes: MapClass[];
}

interface EditorGroupLayout {
  size?: number;
  groups?: EditorGroupLayout[];
}

interface EditorLayout {
  orientation: 0 | 1;
  groups: EditorGroupLayout[];
}

type IncomingMessage =
  | { type: 'ready' }
  | { type: 'open'; relPath: string }
  | { type: 'openClass'; classId: string }
  | { type: 'reveal'; relPath: string }
  | { type: 'listDir'; relPath: string }
  | { type: 'setColor'; markerId: string; color: string }
  | { type: 'moveItem'; relPath: string; from: string; to: string; copy?: boolean }
  | { type: 'moveClass'; classId: string; from: string; to: string; copy?: boolean }
  | { type: 'placeMarker'; id: string; target: string; position: 'before' | 'after' }
  | { type: 'nestMarker'; id: string; parent: string }
  | { type: 'dropUris'; uris: string[]; to: string };

interface DirListingEntry {
  name: string;
  relPath: string;
  isDir: boolean;
}

export class MarkersMapProvider implements vscode.WebviewViewProvider, vscode.WebviewPanelSerializer, vscode.Disposable {
  static readonly viewId = 'vgroupMap';
  static readonly bottomViewId = 'vgroupMapBottom';
  static readonly panelType = 'vgroupMapPanel';

  private readonly webviews = new Set<vscode.Webview>();
  private readonly subscriptions: vscode.Disposable[];
  private readonly media: vscode.Uri;
  private panel?: vscode.WebviewPanel;
  private lastEditorColumn?: vscode.ViewColumn;

  constructor(
    private readonly store: MarkerStore,
    extensionUri: vscode.Uri,
    private readonly memento: vscode.Memento,
  ) {
    this.media = vscode.Uri.joinPath(extensionUri, 'media');
    this.lastEditorColumn = vscode.window.activeTextEditor?.viewColumn;
    this.subscriptions = [
      store.onDidChange(() => this.refresh()),
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor?.viewColumn !== undefined) {
          this.lastEditorColumn = editor.viewColumn;
        }
        this.postActive();
      }),
    ];
  }

  dispose(): void {
    this.subscriptions.forEach((s) => s.dispose());
  }

  // ---- section inside Explorer ----

  resolveWebviewView(view: vscode.WebviewView): void {
    const webview = view.webview;
    this.attach(webview);
    view.onDidChangeVisibility(() => {
      if (view.visible) {
        void this.postState(webview);
      }
    });
    view.onDidDispose(() => this.webviews.delete(webview));
  }

  // ---- narrow editor column next to Explorer ----

  async toggleColumn(): Promise<void> {
    if (this.panel) {
      this.panel.dispose();
      return;
    }
    await this.openColumn();
  }

  async openColumn(): Promise<void> {
    if (this.panel) {
      this.panel.reveal(this.panel.viewColumn, true);
      return;
    }
    const previous = vscode.window.activeTextEditor?.document;

    await vscode.commands.executeCommand('workbench.action.focusFirstEditorGroup');
    await vscode.commands.executeCommand('workbench.action.newGroupLeft');
    const panel = vscode.window.createWebviewPanel(
      MarkersMapProvider.panelType,
      'VGroup',
      { viewColumn: vscode.ViewColumn.Active, preserveFocus: false },
      { enableScripts: true, localResourceRoots: [this.media], retainContextWhenHidden: true },
    );
    this.adoptPanel(panel);
    await vscode.commands.executeCommand('workbench.action.lockEditorGroup');
    await this.narrowFirstColumn();

    const back = previous && vscode.window.visibleTextEditors.find((e) => e.document === previous);
    if (back?.viewColumn !== undefined) {
      this.lastEditorColumn = back.viewColumn;
      await vscode.window.showTextDocument(back.document, { viewColumn: back.viewColumn, preserveFocus: false });
    }
  }

  async deserializeWebviewPanel(panel: vscode.WebviewPanel): Promise<void> {
    if (this.panel && this.panel !== panel) {
      this.panel.dispose();
    }
    this.adoptPanel(panel);
  }

  // ---- shared ----

  /** Flow → 1 → 2 → 3 → flow for top-level group placement. */
  async cycleGroupsLayout(): Promise<void> {
    const next =
      GROUPS_LAYOUT_CYCLE[(GROUPS_LAYOUT_CYCLE.indexOf(this.groupsLayout) + 1) % GROUPS_LAYOUT_CYCLE.length];
    await this.memento.update(GROUPS_LAYOUT_KEY, next);
    await this.syncGroupsLayoutContext();
    this.refresh();
  }

  syncGroupsLayoutContext(): Thenable<unknown> {
    return vscode.commands.executeCommand('setContext', GROUPS_LAYOUT_CONTEXT, this.groupsLayout);
  }

  async toggleLayout(): Promise<void> {
    await this.memento.update(LAYOUT_KEY, this.layout === 'chips' ? 'list' : 'chips');
    this.refresh();
  }

  /** Re-sends the state, e.g. after marked files appeared or disappeared on disk. */
  refresh(): void {
    for (const webview of this.webviews) {
      void this.postState(webview);
    }
  }

  private get layout(): Layout {
    return this.memento.get<Layout>(LAYOUT_KEY, 'chips');
  }

  private get groupsLayout(): GroupsLayout {
    const value = this.memento.get<GroupsLayout>(GROUPS_LAYOUT_KEY, 'flow');
    return GROUPS_LAYOUT_CYCLE.includes(value) ? value : 'flow';
  }

  private adoptPanel(panel: vscode.WebviewPanel): void {
    this.panel = panel;
    panel.iconPath = vscode.Uri.joinPath(this.media, 'map-icon.svg');
    this.attach(panel.webview);
    panel.onDidChangeViewState(() => {
      if (panel.visible) {
        void this.postState(panel.webview);
      }
    });
    panel.onDidDispose(() => {
      this.webviews.delete(panel.webview);
      if (this.panel === panel) {
        this.panel = undefined;
      }
    });
  }

  private attach(webview: vscode.Webview): void {
    webview.options = { enableScripts: true, localResourceRoots: [this.media] };
    webview.html = this.html(webview);
    webview.onDidReceiveMessage((message: IncomingMessage) => this.onMessage(webview, message));
    this.webviews.add(webview);
  }

  /** Shrinks the leftmost top-level editor column to `vgroup.map.columnWidth` pixels. */
  private async narrowFirstColumn(): Promise<void> {
    const width = vscode.workspace.getConfiguration('vgroup').get<number>('map.columnWidth', 260);
    try {
      const layout = await vscode.commands.executeCommand<EditorLayout>('vscode.getEditorLayout');
      if (!layout || layout.orientation !== 0 || layout.groups.length < 2 || layout.groups[0].groups?.length) {
        return;
      }
      const sizes = layout.groups.map((group) => group.size ?? 1);
      const total = sizes.reduce((sum, size) => sum + size, 0);
      const others = total - sizes[0];
      const target = Math.min(width, total * 0.4);
      layout.groups = layout.groups.map((group, index) => ({
        ...group,
        size: index === 0 ? target : (sizes[index] / others) * (total - target),
      }));
      await vscode.commands.executeCommand('vscode.setEditorLayout', layout);
    } catch {
      // Unusual grid layouts are left as they are.
    }
  }

  private async onMessage(webview: vscode.Webview, message: IncomingMessage): Promise<void> {
    if (message.type === 'ready') {
      await this.postState(webview);
      return;
    }
    if (message.type === 'setColor') {
      const color = normalizeHex(message.color);
      if (color && this.store.marker(message.markerId)) {
        await this.store.updateMarker(message.markerId, { color });
      }
      return;
    }
    if (message.type === 'moveItem') {
      if (!this.store.marker(message.to) || !message.relPath) {
        return;
      }
      if (message.copy) {
        await this.store.assign([message.relPath], message.to);
      } else if (message.from && message.from !== message.to) {
        await this.store.moveItem(message.relPath, message.from, message.to);
      }
      return;
    }
    if (message.type === 'moveClass') {
      if (!this.store.marker(message.to) || !this.store.classDef(message.classId)) {
        return;
      }
      if (message.copy) {
        const def = this.store.classDef(message.classId);
        if (def) {
          await this.store.assignClass(def, message.to);
        }
      } else if (message.from && message.from !== message.to) {
        await this.store.moveClass(message.classId, message.from, message.to);
      }
      return;
    }
    if (message.type === 'openClass') {
      const def = this.store.classDef(message.classId);
      if (def) {
        await openClassAt(this.store, def, this.targetColumn());
      }
      return;
    }
    if (message.type === 'placeMarker') {
      try {
        await this.store.placeMarker(message.id, message.target, message.position);
      } catch (error) {
        void vscode.window.showWarningMessage(`VGroup: ${error instanceof Error ? error.message : String(error)}`);
      }
      return;
    }
    if (message.type === 'nestMarker') {
      const check = this.store.canNest(message.id, message.parent);
      if (!check.ok) {
        void vscode.window.showWarningMessage(`VGroup: ${check.reason}`);
        return;
      }
      try {
        await this.store.nestMarker(message.id, message.parent);
      } catch (error) {
        void vscode.window.showWarningMessage(`VGroup: ${error instanceof Error ? error.message : String(error)}`);
      }
      return;
    }
    if (message.type === 'dropUris') {
      if (!this.store.marker(message.to)) {
        return;
      }
      const relPaths = message.uris
        .map((raw) => {
          try {
            return this.store.toRelative(vscode.Uri.parse(raw));
          } catch {
            return undefined;
          }
        })
        .filter((p): p is string => p !== undefined);
      if (relPaths.length === 0) {
        void vscode.window.showWarningMessage(
          'VGroup: drop files from the workspace Explorer. In the editor column, hold Shift while dropping.',
        );
        return;
      }
      await this.store.assign(relPaths, message.to);
      return;
    }
    if (message.type === 'listDir') {
      await this.postDirListing(webview, message.relPath);
      return;
    }
    if (message.type !== 'open' && message.type !== 'reveal') {
      return;
    }
    const uri = this.store.toUri(message.relPath);
    if (message.type === 'reveal') {
      await vscode.commands.executeCommand('revealInExplorer', uri);
      return;
    }
    const stat = await vscode.workspace.fs.stat(uri).then(
      (s) => s,
      () => undefined,
    );
    if (!stat) {
      return;
    }
    if (stat.type & vscode.FileType.Directory) {
      await vscode.commands.executeCommand('revealInExplorer', uri);
      return;
    }
    await vscode.commands.executeCommand('vscode.open', uri, { viewColumn: this.targetColumn() });
  }

  private async postDirListing(webview: vscode.Webview, relPath: string): Promise<void> {
    if (!relPath) {
      return;
    }
    const uri = this.store.toUri(relPath);
    try {
      const listing = await vscode.workspace.fs.readDirectory(uri);
      const entries: DirListingEntry[] = listing
        .map(([name, type]) => ({
          name,
          relPath: path.posix.join(relPath, name),
          isDir: (type & vscode.FileType.Directory) !== 0,
        }))
        .sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name));
      await webview.postMessage({ type: 'dirListing', relPath, entries });
    } catch {
      void vscode.window.showWarningMessage(`VGroup: cannot read folder ${relPath}`);
      await webview.postMessage({ type: 'dirListing', relPath, entries: [], error: true });
    }
  }

  /** Files must never open inside the map's own column. */
  private targetColumn(): vscode.ViewColumn | undefined {
    const mapColumn = this.panel?.viewColumn;
    if (mapColumn === undefined) {
      return undefined;
    }
    if (this.lastEditorColumn !== undefined && this.lastEditorColumn !== mapColumn) {
      return this.lastEditorColumn;
    }
    const other = vscode.window.tabGroups.all.find((group) => group.viewColumn !== mapColumn);
    return other?.viewColumn ?? vscode.ViewColumn.Beside;
  }

  private async postState(webview: vscode.Webview): Promise<void> {
    const groups: MapGroup[] = await Promise.all(
      this.store.markers().map(async ([id, def]) => ({
        id,
        label: def.label,
        badge: def.badge,
        icon: def.icon,
        color: def.color ? cssColor(def.color) : undefined,
        alias: def.alias,
        parent: def.parent,
        columns: def.columns ?? 'flow',
        depth: this.store.depthOf(id),
        subtreeHeight: this.store.subtreeHeight(id),
        children: this.store.children(id).map(([childId]) => childId),
        items: await Promise.all(this.store.itemsOf(id).map((relPath) => this.mapItem(relPath))),
        classes: await Promise.all(
          this.store.classesOf(id).map(([classId, classDef]) => this.mapClass(classId, classDef)),
        ),
      })),
    );
    await webview.postMessage({
      type: 'state',
      groups,
      layout: this.layout,
      groupsLayout: this.groupsLayout,
      active: this.activeRelPath(),
      error: this.store.lastError,
    });
  }

  private postActive(): void {
    const active = this.activeRelPath();
    for (const webview of this.webviews) {
      void webview.postMessage({ type: 'active', active });
    }
  }

  private activeRelPath(): string | undefined {
    const uri = vscode.window.activeTextEditor?.document.uri;
    return uri ? this.store.toRelative(uri) : undefined;
  }

  private async mapItem(relPath: string): Promise<MapItem> {
    let exists = true;
    let isDir = false;
    try {
      const stat = await vscode.workspace.fs.stat(this.store.toUri(relPath));
      isDir = (stat.type & vscode.FileType.Directory) !== 0;
    } catch {
      exists = false;
    }
    const dir = path.posix.dirname(relPath);
    return {
      relPath,
      name: path.posix.basename(relPath),
      dir: dir === '.' ? '' : dir,
      isDir,
      exists,
      alias: this.store.aliasOf(relPath),
    };
  }

  private async mapClass(
    id: string,
    def: { relPath: string; name: string; line?: number; alias?: string },
  ): Promise<MapClass> {
    let exists = true;
    try {
      await vscode.workspace.fs.stat(this.store.toUri(def.relPath));
    } catch {
      exists = false;
    }
    return {
      id,
      name: def.name,
      relPath: def.relPath,
      fileName: path.posix.basename(def.relPath),
      line: def.line,
      exists,
      alias: def.alias,
    };
  }

  private html(webview: vscode.Webview): string {
    const nonce = crypto.randomBytes(16).toString('base64');
    const css = webview.asWebviewUri(vscode.Uri.joinPath(this.media, 'map.css'));
    const js = webview.asWebviewUri(vscode.Uri.joinPath(this.media, 'map.js'));
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${css}">
</head>
<body data-vscode-context='{"preventDefaultContextMenuItems": true}'>
  <div id="root"></div>
  <script nonce="${nonce}" src="${js}"></script>
</body>
</html>`;
  }
}
