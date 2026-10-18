import * as crypto from 'crypto';
import * as path from 'path';
import * as vscode from 'vscode';
import { ColumnsMode, MarkerStore } from './markerStore';
import { openClassAt } from './openClass';
import { cssColor, normalizeHex } from './palette';

type Layout = 'chips' | 'list';
type GroupsLayout = 'flow' | '1' | '2' | '3';

const LAYOUT_KEY = 'sgroup.map.layout';
const GROUPS_LAYOUT_KEY = 'sgroup.map.groupsLayout';
const COLUMN_SIDE_KEY = 'sgroup.map.columnSide';
const GROUPS_LAYOUT_CYCLE: GroupsLayout[] = ['flow', '1', '2', '3'];
/** Context key that selects which groups-layout button is shown in view/editor titles. */
const GROUPS_LAYOUT_CONTEXT = 'sgroup.map.groupsLayout';
/** True when every top-level group on the map is collapsed. */
const TOP_COLLAPSED_CONTEXT = 'sgroup.map.topCollapsed';

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

type IncomingToolbarAction =
  | 'toggleLayout'
  | 'cycleGroups'
  | 'createMarker'
  | 'collapseGroups'
  | 'expandGroups'
  | 'refresh'
  | 'openConfig'
  | 'openSettings';

type IncomingMessage =
  | { type: 'ready' }
  | { type: 'open'; relPath: string }
  | { type: 'openClass'; classId: string }
  | { type: 'reveal'; relPath: string }
  | { type: 'listDir'; relPath: string }
  | { type: 'history'; direction: 'back' | 'forward' }
  | { type: 'topGroupsCollapsed'; collapsed: boolean }
  | {
      type: 'toolbar';
      action: IncomingToolbarAction;
    }
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

function tabUri(tab: vscode.Tab): vscode.Uri | undefined {
  const input = tab.input;
  if (input instanceof vscode.TabInputText || input instanceof vscode.TabInputNotebook) {
    return input.uri;
  }
  if (input instanceof vscode.TabInputTextDiff) {
    return input.modified;
  }
  return undefined;
}

export class MarkersMapProvider implements vscode.WebviewViewProvider, vscode.WebviewPanelSerializer, vscode.Disposable {
  static readonly viewId = 'sgroupMap';
  static readonly bottomViewId = 'sgroupMapBottom';
  static readonly panelType = 'sgroupMapPanel';

  private readonly webviews = new Set<vscode.Webview>();
  private readonly subscriptions: vscode.Disposable[];
  private readonly media: vscode.Uri;
  private panel?: vscode.WebviewPanel;
  private bottomView?: vscode.WebviewView;
  private lastEditorColumn?: vscode.ViewColumn;
  /** Which edge the map column was opened on. Cleared when that column closes. */
  private columnSide?: 'left' | 'right';

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
    if (view.viewType === MarkersMapProvider.bottomViewId) {
      this.bottomView = view;
    }
    const webview = view.webview;
    this.attach(webview);
    view.onDidChangeVisibility(() => {
      if (view.visible) {
        void this.postState(webview);
      }
    });
    view.onDidDispose(() => {
      this.webviews.delete(webview);
      if (this.bottomView === view) {
        this.bottomView = undefined;
      }
    });
  }

  /** Show the bottom-panel map, or hide the panel when that map is already open. */
  async toggleBottom(): Promise<boolean> {
    if (this.bottomView?.visible) {
      await vscode.commands.executeCommand('workbench.action.closePanel');
      return true;
    }
    const available = await vscode.commands.getCommands(true);
    const command = [`${MarkersMapProvider.bottomViewId}.focus`, 'workbench.view.extension.sgroupPanel'].find((id) =>
      available.includes(id),
    );
    if (!command) {
      return false;
    }
    await vscode.commands.executeCommand(command);
    return true;
  }

  // ---- narrow editor column next to Explorer ----

  async toggleColumn(): Promise<void> {
    try {
      if (this.panel && this.columnSide !== 'right') {
        await this.closeColumn();
        return;
      }
      if (this.panel) {
        await this.closeColumn();
      }
      await this.openColumn();
    } catch (error) {
      this.reportColumnError(error);
    }
  }

  /** Narrow locked editor column on the right of the code, before Cursor's agent group. */
  async toggleRight(): Promise<void> {
    try {
      if (this.panel && this.columnSide === 'right') {
        await this.closeColumn();
        return;
      }
      if (this.panel) {
        await this.closeColumn();
      }
      await this.openRightColumn();
    } catch (error) {
      this.reportColumnError(error);
    }
  }

  /** Closes the map webview and the editor group that held it. */
  private async closeColumn(): Promise<void> {
    const panel = this.panel;
    if (!panel) {
      await this.setColumnSide(undefined);
      return;
    }
    try {
      const column = panel.viewColumn;
      const group =
        column !== undefined && column > 0
          ? vscode.window.tabGroups.all.find((item) => item.viewColumn === column)
          : undefined;
      if (group && column !== undefined) {
        panel.reveal(column, false);
        await vscode.commands.executeCommand('workbench.action.unlockEditorGroup');
        await vscode.window.tabGroups.close(group, true);
      } else {
        panel.dispose();
      }
    } finally {
      if (this.panel === panel) {
        try {
          panel.dispose();
        } catch {
          // The group close already disposed it.
        }
        this.panel = undefined;
      }
      await this.setColumnSide(undefined);
    }
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
      'SGroup',
      { viewColumn: vscode.ViewColumn.Active, preserveFocus: false },
      { enableScripts: true, localResourceRoots: [this.media], retainContextWhenHidden: true },
    );
    this.adoptPanel(panel);
    await this.setColumnSide('left');
    await vscode.commands.executeCommand('workbench.action.lockEditorGroup');
    await this.narrowEdgeColumn('start');

    const back = previous && vscode.window.visibleTextEditors.find((e) => e.document === previous);
    if (back?.viewColumn !== undefined) {
      this.lastEditorColumn = back.viewColumn;
      await vscode.window.showTextDocument(back.document, { viewColumn: back.viewColumn, preserveFocus: false });
    }
  }

  private async openRightColumn(): Promise<void> {
    if (this.panel && this.columnSide === 'right') {
      this.panel.reveal(this.panel.viewColumn, true);
      return;
    }
    const previous = vscode.window.activeTextEditor?.document;

    // Cursor keeps an agent editor group at the end of the grid. Splitting that
    // group puts the map beside the chat, not beside the code.
    const focused = await this.focusEdgeCodeGroup('end');
    if (!focused) {
      await vscode.commands.executeCommand('workbench.action.focusFirstEditorGroup');
    }
    await vscode.commands.executeCommand('workbench.action.newGroupRight');
    const column = vscode.window.tabGroups.activeTabGroup.viewColumn;
    if (vscode.window.tabGroups.activeTabGroup.tabs.length > 0) {
      throw new Error('не удалось создать пустую колонку справа от кода');
    }
    const panel = vscode.window.createWebviewPanel(
      MarkersMapProvider.panelType,
      'SGroup',
      { viewColumn: column, preserveFocus: false },
      { enableScripts: true, localResourceRoots: [this.media], retainContextWhenHidden: true },
    );
    this.adoptPanel(panel);
    await this.setColumnSide('right');
    await vscode.commands.executeCommand('workbench.action.lockEditorGroup');
    await this.narrowViewColumn(panel.viewColumn ?? column);

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
    const stored = this.memento.get<string>(COLUMN_SIDE_KEY);
    this.columnSide = stored === 'left' || stored === 'right' ? stored : undefined;
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

  /** Collapse or expand every top-level group. Nested groups keep their own state. */
  async setTopGroups(collapsed: boolean): Promise<void> {
    for (const webview of this.webviews) {
      void webview.postMessage({ type: 'setTopGroups', collapsed });
    }
  }

  syncTopCollapsedContext(collapsed: boolean): Thenable<unknown> {
    return vscode.commands.executeCommand('setContext', TOP_COLLAPSED_CONTEXT, collapsed);
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
    this.attach(panel.webview, 'panel');
    panel.onDidChangeViewState(() => {
      if (panel.visible) {
        void this.postState(panel.webview);
      }
    });
    panel.onDidDispose(() => {
      this.webviews.delete(panel.webview);
      if (this.panel === panel) {
        this.panel = undefined;
        this.columnSide = undefined;
      }
    });
  }

  private attach(webview: vscode.Webview, chrome: 'view' | 'panel' = 'view'): void {
    webview.options = { enableScripts: true, localResourceRoots: [this.media] };
    webview.html = this.html(webview, chrome);
    webview.onDidReceiveMessage((message: IncomingMessage) => this.onMessage(webview, message));
    this.webviews.add(webview);
  }

  /** Shrinks the leftmost top-level editor column to `sgroup.map.columnWidth` pixels. */
  private async narrowEdgeColumn(edge: 'start' | 'end'): Promise<void> {
    const layout = await vscode.commands.executeCommand<EditorLayout>('vscode.getEditorLayout');
    if (!layout || layout.orientation !== 0 || layout.groups.length < 2) {
      return;
    }
    const index = edge === 'start' ? 0 : layout.groups.length - 1;
    await this.applyColumnWidth(layout, index);
  }

  /** Shrinks whichever top-level column holds the map, leaving the agent group alone. */
  private async narrowViewColumn(viewColumn: vscode.ViewColumn): Promise<void> {
    if (viewColumn < 1) {
      return;
    }
    const layout = await vscode.commands.executeCommand<EditorLayout>('vscode.getEditorLayout');
    if (!layout || layout.orientation !== 0 || layout.groups.some((group) => group.groups?.length)) {
      return;
    }
    const ordered = vscode.window.tabGroups.all
      .filter((group) => group.viewColumn > 0)
      .sort((a, b) => a.viewColumn - b.viewColumn);
    if (ordered.length !== layout.groups.length) {
      return;
    }
    const index = ordered.findIndex((group) => group.viewColumn === viewColumn);
    if (index < 0) {
      return;
    }
    await this.applyColumnWidth(layout, index);
  }

  private async applyColumnWidth(layout: EditorLayout, index: number): Promise<void> {
    if (layout.groups[index]?.groups?.length) {
      return;
    }
    const width = vscode.workspace.getConfiguration('sgroup').get<number>('map.columnWidth', 260);
    try {
      const sizes = layout.groups.map((group) => group.size ?? 1);
      const total = sizes.reduce((sum, size) => sum + size, 0);
      const others = total - sizes[index];
      if (others <= 0) {
        return;
      }
      const target = Math.min(width, total * 0.4);
      layout.groups = layout.groups.map((group, i) => ({
        ...group,
        size: i === index ? target : (sizes[i] / others) * (total - target),
      }));
      await vscode.commands.executeCommand('vscode.setEditorLayout', layout);
    } catch {
      // Unusual grid layouts are left as they are.
    }
  }

  /** Focuses the leftmost or rightmost group that actually holds a file. */
  private async focusEdgeCodeGroup(edge: 'start' | 'end'): Promise<boolean> {
    const mapColumn = this.panel?.viewColumn;
    const groups = vscode.window.tabGroups.all.filter((group) => {
      if (group.viewColumn < 1 || group.viewColumn === mapColumn) {
        return false;
      }
      return group.tabs.some((tab) => tabUri(tab) !== undefined);
    });
    if (groups.length === 0) {
      return false;
    }
    const group = groups.reduce((best, item) =>
      edge === 'start'
        ? item.viewColumn < best.viewColumn
          ? item
          : best
        : item.viewColumn > best.viewColumn
          ? item
          : best,
    );
    const uri = group.tabs.map(tabUri).find((item): item is vscode.Uri => item !== undefined);
    if (!uri) {
      return false;
    }
    await vscode.commands.executeCommand('vscode.open', uri, {
      viewColumn: group.viewColumn,
      preserveFocus: false,
    });
    return true;
  }

  private async setColumnSide(side: 'left' | 'right' | undefined): Promise<void> {
    this.columnSide = side;
    await this.memento.update(COLUMN_SIDE_KEY, side);
  }

  private reportColumnError(error: unknown): void {
    void vscode.window.showWarningMessage(
      `SGroup: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  private async onMessage(webview: vscode.Webview, message: IncomingMessage): Promise<void> {
    if (message.type === 'ready') {
      await this.postState(webview);
      return;
    }
    if (message.type === 'history') {
      if (message.direction === 'back') {
        await this.store.undo();
      } else {
        await this.store.redo();
      }
      return;
    }
    if (message.type === 'toolbar') {
      await this.onToolbar(message.action);
      return;
    }
    if (message.type === 'topGroupsCollapsed') {
      await this.syncTopCollapsedContext(message.collapsed);
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
        void vscode.window.showWarningMessage(`SGroup: ${error instanceof Error ? error.message : String(error)}`);
      }
      return;
    }
    if (message.type === 'nestMarker') {
      const check = this.store.canNest(message.id, message.parent);
      if (!check.ok) {
        void vscode.window.showWarningMessage(`SGroup: ${check.reason}`);
        return;
      }
      try {
        await this.store.nestMarker(message.id, message.parent);
      } catch (error) {
        void vscode.window.showWarningMessage(`SGroup: ${error instanceof Error ? error.message : String(error)}`);
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
          'SGroup: drop files from the workspace Explorer. In the editor column, hold Shift while dropping.',
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
      void vscode.window.showWarningMessage(`SGroup: cannot read folder ${relPath}`);
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
      appearance: this.store.appearance,
      active: this.activeRelPath(),
      error: this.store.lastError,
      history: this.store.historySteps(),
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

  private async onToolbar(action: IncomingToolbarAction): Promise<void> {
    if (action === 'toggleLayout') {
      await this.toggleLayout();
      return;
    }
    if (action === 'cycleGroups') {
      await this.cycleGroupsLayout();
      return;
    }
    if (action === 'collapseGroups' || action === 'expandGroups') {
      await this.setTopGroups(action === 'collapseGroups');
      return;
    }
    await vscode.commands.executeCommand(
      action === 'createMarker'
        ? 'sgroup.createMarker'
        : action === 'refresh'
          ? 'sgroup.refresh'
          : action === 'openConfig'
            ? 'sgroup.openConfig'
            : 'sgroup.openSettings',
    );
  }

  private toolIcon(webview: vscode.Webview, name: string, mode?: string, hidden = false): string {
    const light = webview.asWebviewUri(vscode.Uri.joinPath(this.media, 'icons', `${name}-light.svg`));
    const dark = webview.asWebviewUri(vscode.Uri.joinPath(this.media, 'icons', `${name}-dark.svg`));
    const modeAttr = mode ? ` data-mode="${mode}"` : '';
    const hiddenAttr = hidden ? ' hidden' : '';
    return `<img class="tool-icon tone-light" src="${light}" alt=""${modeAttr}${hiddenAttr}><img class="tool-icon tone-dark" src="${dark}" alt=""${modeAttr}${hiddenAttr}>`;
  }

  private html(webview: vscode.Webview, chrome: 'view' | 'panel'): string {
    const nonce = crypto.randomBytes(16).toString('base64');
    const css = webview.asWebviewUri(vscode.Uri.joinPath(this.media, 'map.css'));
    const js = webview.asWebviewUri(vscode.Uri.joinPath(this.media, 'map.js'));
    const icon = (name: string, mode?: string, hidden = false) => this.toolIcon(webview, name, mode, hidden);
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource}; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${css}">
</head>
<body class="chrome-${chrome}" data-vscode-context='{"preventDefaultContextMenuItems": true}'>
  <div class="history-bar">
    <button id="history-back" class="history-btn" type="button" title="Назад" aria-label="Назад" disabled>
      ${icon('arrow-left')}
    </button>
    <button id="history-forward" class="history-btn" type="button" title="Вперёд" aria-label="Вперёд" disabled>
      ${icon('arrow-right')}
    </button>
    <div class="toolbar-extra">
      <button id="toolbar-layout" class="history-btn" type="button" title="Toggle Map Layout (Chips / List)" aria-label="Toggle Map Layout">
        ${icon('list-flat')}
      </button>
      <button id="toolbar-groups" class="history-btn" type="button" title="Groups: Flow — click for 1 column" aria-label="Groups">
        ${icon('word-wrap', 'flow')}
        ${icon('list-flat', '1', true)}
        ${icon('split-horizontal', '2', true)}
        ${icon('table', '3', true)}
      </button>
      <button id="toolbar-create" class="history-btn" type="button" title="Create Marker" aria-label="Create Marker">
        ${icon('add')}
      </button>
      <button id="toolbar-collapse" class="history-btn" type="button" title="Свернуть все группы" aria-label="Свернуть все группы">
        ${icon('collapse-all', 'collapse')}
        ${icon('expand-all', 'expand', true)}
      </button>
      <div class="toolbar-more">
        <button id="toolbar-more" class="history-btn" type="button" title="Дополнительные действия" aria-label="Дополнительные действия" aria-haspopup="menu">
          ${icon('ellipsis')}
        </button>
        <div id="toolbar-menu" class="toolbar-menu" hidden role="menu">
          <button type="button" data-action="refresh" role="menuitem">${icon('refresh')}Refresh</button>
          <button type="button" data-action="openConfig" role="menuitem">${icon('json')}Open Markers File</button>
          <button type="button" data-action="openSettings" role="menuitem">${icon('gear')}Open Settings</button>
        </div>
      </div>
    </div>
  </div>
  <div id="root"></div>
  <script nonce="${nonce}" src="${js}"></script>
</body>
</html>`;
  }
}
