import * as crypto from 'crypto';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  ColumnsMode,
  GroupsLayout,
  MapLayout,
  MAX_PAGES,
  MarkerStore,
  PageKind,
  normalizeGroupsLayout,
  normalizeMapLayout,
  normalizePageKind,
} from './markerStore';
import { openClassAt } from './openClass';
import { cssColor, normalizeHex } from './palette';

const COLUMN_SIDE_KEY = 'syn3.map.columnSide';
/** Which map surface is showing which page. Survives reload; each surface is independent. */
const ACTIVE_PAGE_KEYS = {
  explorer: 'syn3.map.activePage.explorer',
  bottom: 'syn3.map.activePage.bottom',
  sidebar: 'syn3.map.activePage.sidebar',
} as const;
type MapSurface = keyof typeof ACTIVE_PAGE_KEYS;
const GROUPS_LAYOUT_CYCLE: GroupsLayout[] = ['flow', '1', '2', '3'];
/** Context key that selects which groups-layout button is shown in view/editor titles. */
const GROUPS_LAYOUT_CONTEXT = 'syn3.map.groupsLayout';
/** True when every top-level group on the map is collapsed. */
const TOP_COLLAPSED_CONTEXT = 'syn3.map.topCollapsed';

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
  page?: string;
  columns: ColumnsMode;
  /** True when map edits to this group are blocked. */
  locked?: true;
  depth: number;
  /** Height of nested subgroup tree (0 if no children). */
  subtreeHeight: number;
  children: string[];
  items: MapItem[];
  classes: MapClass[];
  notes: MapNote[];
}

interface MapPage {
  id: string;
  name: string;
  kind: PageKind;
  layout: MapLayout;
  groupsLayout: GroupsLayout;
  collapsed: Record<string, boolean>;
}

interface MapNote {
  id: string;
  markerId: string;
  text: string;
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
  | 'openSettings'
  | 'createPage'
  | 'renamePage'
  | 'deletePage';

type IncomingMessage =
  | { type: 'ready'; pageId?: string }
  | { type: 'activePage'; pageId: string }
  | { type: 'open'; relPath: string }
  | { type: 'openClass'; classId: string }
  | { type: 'openExternal'; url: string }
  | { type: 'reveal'; relPath: string }
  | { type: 'listDir'; relPath: string }
  | { type: 'history'; direction: 'back' | 'forward' | 'accept'; pageId?: string }
  | { type: 'setCollapsed'; pageId: string; collapsed: Record<string, boolean>; allTopCollapsed: boolean }
  | {
      type: 'toolbar';
      action: IncomingToolbarAction;
      pageId?: string;
    }
  | { type: 'reorderPages'; orderedIds: string[] }
  | { type: 'setColor'; markerId: string; color: string }
  | { type: 'moveItem'; relPath: string; from: string; to: string; copy?: boolean }
  | { type: 'moveClass'; classId: string; from: string; to: string; copy?: boolean }
  | { type: 'placeMarker'; id: string; target: string; position: 'before' | 'after' }
  | { type: 'nestMarker'; id: string; parent: string }
  | { type: 'dropUris'; uris: string[]; to: string }
  | { type: 'createNote'; markerId: string; text: string }
  | { type: 'updateNote'; noteId: string; text: string }
  | { type: 'deleteNote'; noteId: string }
  | { type: 'toggleLock'; markerId: string };

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
  static readonly viewId = 'syn3Map';
  static readonly bottomViewId = 'syn3MapBottom';
  static readonly panelType = 'syn3MapPanel';
  static readonly panelTitle = 'Syn3';

  private readonly webviews = new Set<vscode.Webview>();
  private readonly activePageByWebview = new WeakMap<vscode.Webview, string>();
  private readonly surfaceByWebview = new WeakMap<vscode.Webview, MapSurface>();
  /** Script has posted `ready`, so postMessage will be received. */
  private readonly readyWebviews = new WeakSet<vscode.Webview>();
  /** First state after load should open the page saved for this surface. */
  private readonly needsPageRestore = new WeakSet<vscode.Webview>();
  private readonly subscriptions: vscode.Disposable[];
  private readonly media: vscode.Uri;
  private panel?: vscode.WebviewPanel;
  private bottomView?: vscode.WebviewView;
  private lastEditorColumn?: vscode.ViewColumn;
  /** Webview that last talked to the host — drives view-title layout/collapse. */
  private lastFocusedWebview?: vscode.Webview;
  /** Which edge the map column was opened on. Cleared when that column closes. */
  private columnSide?: 'left' | 'right';

  constructor(
    private readonly store: MarkerStore,
    extensionUri: vscode.Uri,
    private readonly memento: vscode.Memento,
    private readonly workspaceState: vscode.Memento,
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
    const surface: MapSurface = view.viewType === MarkersMapProvider.bottomViewId ? 'bottom' : 'explorer';
    if (surface === 'bottom') {
      this.bottomView = view;
    }
    const webview = view.webview;
    this.attach(webview, 'view', surface);
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
    const command = [`${MarkersMapProvider.bottomViewId}.focus`, 'workbench.view.extension.syn3Panel'].find((id) =>
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
      MarkersMapProvider.panelTitle,
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
      MarkersMapProvider.panelTitle,
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
    const stored =
      this.memento.get<string>(COLUMN_SIDE_KEY) ?? this.memento.get<string>('sgroup.map.columnSide');
    this.columnSide = stored === 'left' || stored === 'right' ? stored : undefined;
    this.adoptPanel(panel);
  }

  // ---- shared ----

  /** Flow → 1 → 2 → 3 → flow for top-level group placement on the focused surface's page. */
  async cycleGroupsLayout(): Promise<void> {
    const pageId = this.focusedPageId();
    const page = this.store.page(pageId);
    if (!page) {
      return;
    }
    const current = normalizeGroupsLayout(page.groupsLayout);
    const next = GROUPS_LAYOUT_CYCLE[(GROUPS_LAYOUT_CYCLE.indexOf(current) + 1) % GROUPS_LAYOUT_CYCLE.length];
    await this.store.updatePageView(pageId, { groupsLayout: next });
    await this.syncGroupsLayoutContext(next);
  }

  syncGroupsLayoutContext(layout?: GroupsLayout): Thenable<unknown> {
    const value = layout ?? this.store.page(this.focusedPageId())?.groupsLayout ?? 'flow';
    return vscode.commands.executeCommand('setContext', GROUPS_LAYOUT_CONTEXT, value);
  }

  /** Collapse or expand every top-level group on the focused surface's page. */
  async setTopGroups(collapsed: boolean): Promise<void> {
    const pageId = this.focusedPageId();
    const page = this.store.page(pageId);
    if (!page) {
      return;
    }
    const next: Record<string, boolean> = { ...page.collapsed };
    for (const [id, def] of this.store.markers()) {
      if (def.parent || this.store.pageOf(id) !== pageId || this.store.isLocked(id)) {
        continue;
      }
      if (collapsed) {
        next[id] = true;
      } else {
        delete next[id];
      }
    }
    await this.store.updatePageView(pageId, { collapsed: next });
    await this.syncTopCollapsedContext(this.allUnlockedTopCollapsed(pageId, next));
  }

  /** Collapse state of unlocked top-level groups only. */
  private allUnlockedTopCollapsed(
    pageId: string,
    collapsed: Record<string, boolean> = this.store.page(pageId)?.collapsed ?? {},
  ): boolean {
    const tops = this.store
      .markers()
      .filter(([id, def]) => !def.parent && this.store.pageOf(id) === pageId && !this.store.isLocked(id));
    return tops.length > 0 && tops.every(([id]) => !!collapsed[id]);
  }

  private refuseLocked(markerId: string): boolean {
    if (!this.store.isLocked(markerId)) {
      return false;
    }
    void vscode.window.showWarningMessage('Syn3: группа закрыта');
    return true;
  }

  syncTopCollapsedContext(collapsed: boolean): Thenable<unknown> {
    return vscode.commands.executeCommand('setContext', TOP_COLLAPSED_CONTEXT, collapsed);
  }

  async toggleLayout(): Promise<void> {
    const pageId = this.focusedPageId();
    const page = this.store.page(pageId);
    if (!page) {
      return;
    }
    const next: MapLayout = normalizeMapLayout(page.layout) === 'chips' ? 'list' : 'chips';
    await this.store.updatePageView(pageId, { layout: next });
  }

  /** Re-sends the state, e.g. after marked files appeared or disappeared on disk. */
  refresh(): void {
    for (const webview of this.webviews) {
      void this.postState(webview);
    }
    if (this.store.ready) {
      void this.syncFocusContext();
    }
  }

  async historyBack(): Promise<void> {
    await this.store.undo(this.focusedPageId());
    await this.syncHistoryContext();
  }

  async historyForward(): Promise<void> {
    await this.store.redo(this.focusedPageId());
    await this.syncHistoryContext();
  }

  async historyAccept(): Promise<void> {
    await this.store.accept(this.focusedPageId());
    await this.syncHistoryContext();
  }

  private focusedPageId(): string {
    if (this.lastFocusedWebview) {
      return this.pageIdFor(this.lastFocusedWebview);
    }
    return this.store.defaultFilesPageId();
  }

  private pageIdFor(webview: vscode.Webview): string {
    const hinted = this.activePageByWebview.get(webview);
    if (hinted && this.store.page(hinted)) {
      return hinted;
    }
    if (hinted && this.store.ready) {
      this.activePageByWebview.delete(webview);
    }
    const saved = this.savedPageId(webview);
    if (saved) {
      this.activePageByWebview.set(webview, saved);
      return saved;
    }
    const fallback = this.store.defaultFilesPageId();
    if (this.store.ready && this.store.page(fallback)) {
      this.activePageByWebview.set(webview, fallback);
    }
    return fallback;
  }

  private savedPageId(webview: vscode.Webview): string | undefined {
    if (!this.store.ready) {
      return undefined;
    }
    const surface = this.surfaceByWebview.get(webview);
    if (!surface) {
      return undefined;
    }
    const saved = this.workspaceState.get<string>(ACTIVE_PAGE_KEYS[surface]);
    return saved && this.store.page(saved) ? saved : undefined;
  }

  private persistSurfacePage(webview: vscode.Webview, pageId: string): void {
    if (!this.store.ready || !this.store.page(pageId)) {
      return;
    }
    const surface = this.surfaceByWebview.get(webview);
    if (!surface) {
      return;
    }
    const key = ACTIVE_PAGE_KEYS[surface];
    if (this.workspaceState.get<string>(key) === pageId) {
      return;
    }
    void this.workspaceState.update(key, pageId);
  }

  private rememberFocus(webview: vscode.Webview, pageId?: string): void {
    this.lastFocusedWebview = webview;
    if (!pageId) {
      return;
    }
    if (!this.store.page(pageId)) {
      if (!this.store.ready) {
        this.activePageByWebview.set(webview, pageId);
      }
      return;
    }
    this.activePageByWebview.set(webview, pageId);
    this.persistSurfacePage(webview, pageId);
  }

  private adoptPanel(panel: vscode.WebviewPanel): void {
    this.panel = panel;
    panel.title = MarkersMapProvider.panelTitle;
    panel.iconPath = vscode.Uri.joinPath(this.media, 'map-icon.svg');
    this.attach(panel.webview, 'panel', 'sidebar');
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

  private attach(webview: vscode.Webview, chrome: 'view' | 'panel', surface: MapSurface): void {
    this.surfaceByWebview.set(webview, surface);
    this.needsPageRestore.add(webview);
    webview.options = { enableScripts: true, localResourceRoots: [this.media] };
    webview.html = this.html(webview, chrome);
    webview.onDidReceiveMessage((message: IncomingMessage) => this.onMessage(webview, message));
    this.webviews.add(webview);
  }

  /** Shrinks the leftmost top-level editor column to `syn3.map.columnWidth` pixels. */
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
    const width = vscode.workspace.getConfiguration('syn3').get<number>('map.columnWidth', 260);
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
      `Syn3: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  private async onMessage(webview: vscode.Webview, message: IncomingMessage): Promise<void> {
    if (message.type === 'ready') {
      this.readyWebviews.add(webview);
      this.rememberFocus(webview, message.pageId);
      if (!this.store.ready) {
        return;
      }
      await this.postState(webview);
      await this.syncFocusContext();
      return;
    }
    if (message.type === 'activePage') {
      this.rememberFocus(webview, message.pageId);
      await this.syncFocusContext();
      return;
    }
    if (message.type === 'history') {
      this.rememberFocus(webview, message.pageId);
      const pageId = this.pageIdFor(webview);
      if (message.direction === 'back') {
        await this.store.undo(pageId);
      } else if (message.direction === 'forward') {
        await this.store.redo(pageId);
      } else {
        await this.store.accept(pageId);
      }
      await this.syncHistoryContext();
      return;
    }
    if (message.type === 'toolbar') {
      this.rememberFocus(webview, message.pageId);
      await this.onToolbar(webview, message.action, message.pageId);
      return;
    }
    if (message.type === 'setCollapsed') {
      this.rememberFocus(webview, message.pageId);
      const page = this.store.page(message.pageId);
      if (page) {
        const next: Record<string, boolean> = { ...message.collapsed };
        for (const [id] of this.store.markers()) {
          if (!this.store.isLocked(id)) {
            continue;
          }
          if (page.collapsed[id]) {
            next[id] = true;
          } else {
            delete next[id];
          }
        }
        await this.store.updatePageView(message.pageId, { collapsed: next });
        if (webview === this.lastFocusedWebview) {
          await this.syncTopCollapsedContext(this.allUnlockedTopCollapsed(message.pageId, next));
        }
      }
      return;
    }
    if (message.type === 'toggleLock') {
      if (this.store.marker(message.markerId)) {
        await this.store.toggleLock(message.markerId);
      }
      return;
    }
    if (message.type === 'reorderPages') {
      await this.store.reorderPages(message.orderedIds);
      return;
    }
    if (message.type === 'openExternal') {
      try {
        const uri = vscode.Uri.parse(message.url);
        if (uri.scheme === 'http' || uri.scheme === 'https') {
          await vscode.env.openExternal(uri);
        }
      } catch {
        // ignore bad urls
      }
      return;
    }
    if (message.type === 'createNote') {
      if (this.refuseLocked(message.markerId)) {
        return;
      }
      await this.store.createNote(message.markerId, message.text);
      return;
    }
    if (message.type === 'updateNote') {
      const note = this.store.note(message.noteId);
      if (!note || this.refuseLocked(note.markerId)) {
        return;
      }
      await this.store.updateNote(message.noteId, message.text);
      return;
    }
    if (message.type === 'deleteNote') {
      const note = this.store.note(message.noteId);
      if (!note || this.refuseLocked(note.markerId)) {
        return;
      }
      await this.store.deleteNote(message.noteId);
      return;
    }
    if (message.type === 'setColor') {
      if (this.refuseLocked(message.markerId)) {
        return;
      }
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
      if (this.pageKindOfMarker(message.to) === 'notes') {
        return;
      }
      if (this.refuseLocked(message.to) || (message.from && this.refuseLocked(message.from))) {
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
      if (this.pageKindOfMarker(message.to) === 'notes') {
        return;
      }
      if (this.refuseLocked(message.to) || (message.from && this.refuseLocked(message.from))) {
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
      if (this.store.pageOf(message.id) !== this.store.pageOf(message.target)) {
        return;
      }
      if (this.refuseLocked(message.id)) {
        return;
      }
      try {
        await this.store.placeMarker(message.id, message.target, message.position);
      } catch (error) {
        void vscode.window.showWarningMessage(`Syn3: ${error instanceof Error ? error.message : String(error)}`);
      }
      return;
    }
    if (message.type === 'nestMarker') {
      if (this.store.pageOf(message.id) !== this.store.pageOf(message.parent)) {
        return;
      }
      if (this.refuseLocked(message.id) || this.refuseLocked(message.parent)) {
        return;
      }
      const check = this.store.canNest(message.id, message.parent);
      if (!check.ok) {
        void vscode.window.showWarningMessage(`Syn3: ${check.reason}`);
        return;
      }
      try {
        await this.store.nestMarker(message.id, message.parent);
      } catch (error) {
        void vscode.window.showWarningMessage(`Syn3: ${error instanceof Error ? error.message : String(error)}`);
      }
      return;
    }
    if (message.type === 'dropUris') {
      if (!this.store.marker(message.to) || this.pageKindOfMarker(message.to) === 'notes') {
        return;
      }
      if (this.refuseLocked(message.to)) {
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
          'Syn3: drop files from the workspace Explorer. In the editor column, hold Shift while dropping.',
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
      void vscode.window.showWarningMessage(`Syn3: cannot read folder ${relPath}`);
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
    if (!this.store.ready || !this.readyWebviews.has(webview)) {
      return;
    }
    const restorePage = this.needsPageRestore.has(webview);
    if (restorePage) {
      this.needsPageRestore.delete(webview);
    }
    const pages: MapPage[] = this.store.pages().map(([id, def]) => ({
      id,
      name: def.name,
      kind: def.kind,
      layout: def.layout,
      groupsLayout: def.groupsLayout,
      collapsed: { ...def.collapsed },
    }));
    const groups: MapGroup[] = await Promise.all(
      this.store.markers().map(async ([id, def]) => ({
        id,
        label: def.label,
        icon: def.icon,
        color: def.color ? cssColor(def.color) : undefined,
        alias: def.alias,
        parent: def.parent,
        page: this.store.pageOf(id),
        columns: def.columns ?? 'flow',
        locked: def.locked === true ? true : undefined,
        depth: this.store.depthOf(id),
        subtreeHeight: this.store.subtreeHeight(id),
        children: this.store.children(id).map(([childId]) => childId),
        items: await Promise.all(this.store.itemsOf(id).map((relPath) => this.mapItem(relPath))),
        classes: await Promise.all(
          this.store.classesOf(id).map(([classId, classDef]) => this.mapClass(classId, classDef)),
        ),
        notes: this.store.notesOf(id).map(([noteId, note]) => ({
          id: noteId,
          markerId: note.markerId,
          text: note.text,
        })),
      })),
    );
    const pageId = this.pageIdFor(webview);
    if (restorePage) {
      this.persistSurfacePage(webview, pageId);
    }
    const page = this.store.page(pageId);
    await webview.postMessage({
      type: 'state',
      restorePage: restorePage || undefined,
      activePageId: restorePage ? pageId : undefined,
      pages,
      groups,
      maxPages: MAX_PAGES,
      layout: page?.layout ?? 'chips',
      groupsLayout: page?.groupsLayout ?? 'flow',
      appearance: this.store.appearance,
      active: this.activeRelPath(),
      error: this.store.lastError,
      history: this.store.historySteps(),
    });
  }

  private pageKindOfMarker(markerId: string): PageKind | undefined {
    const pageId = this.store.pageOf(markerId);
    return pageId ? this.store.page(pageId)?.kind : undefined;
  }

  private async syncFocusContext(): Promise<void> {
    const focused = this.focusedPageId();
    const page = this.store.page(focused);
    if (!page) {
      return;
    }
    await this.syncGroupsLayoutContext(page.groupsLayout);
    await this.syncTopCollapsedContext(this.allUnlockedTopCollapsed(focused));
    await this.syncHistoryContext();
  }

  private async syncHistoryContext(): Promise<void> {
    const pageId = this.focusedPageId();
    await vscode.commands.executeCommand('setContext', 'syn3.canUndo', this.store.canUndo(pageId));
    await vscode.commands.executeCommand('setContext', 'syn3.canRedo', this.store.canRedo(pageId));
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

  private async onToolbar(
    webview: vscode.Webview,
    action: IncomingToolbarAction,
    pageId?: string,
  ): Promise<void> {
    const activePage = pageId && this.store.page(pageId) ? pageId : this.pageIdFor(webview);
    if (action === 'toggleLayout') {
      const page = this.store.page(activePage);
      if (page) {
        await this.store.updatePageView(activePage, {
          layout: normalizeMapLayout(page.layout) === 'chips' ? 'list' : 'chips',
        });
      }
      return;
    }
    if (action === 'cycleGroups') {
      const page = this.store.page(activePage);
      if (page) {
        const current = normalizeGroupsLayout(page.groupsLayout);
        const next =
          GROUPS_LAYOUT_CYCLE[(GROUPS_LAYOUT_CYCLE.indexOf(current) + 1) % GROUPS_LAYOUT_CYCLE.length];
        await this.store.updatePageView(activePage, { groupsLayout: next });
        if (webview === this.lastFocusedWebview) {
          await this.syncGroupsLayoutContext(next);
        }
      }
      return;
    }
    if (action === 'collapseGroups' || action === 'expandGroups') {
      const collapsed = action === 'collapseGroups';
      const page = this.store.page(activePage);
      if (!page) {
        return;
      }
      const next: Record<string, boolean> = { ...page.collapsed };
      for (const [id, def] of this.store.markers()) {
        if (def.parent || this.store.pageOf(id) !== activePage || this.store.isLocked(id)) {
          continue;
        }
        if (collapsed) {
          next[id] = true;
        } else {
          delete next[id];
        }
      }
      await this.store.updatePageView(activePage, { collapsed: next });
      if (webview === this.lastFocusedWebview) {
        await this.syncTopCollapsedContext(this.allUnlockedTopCollapsed(activePage, next));
      }
      return;
    }
    if (action === 'createMarker') {
      await vscode.commands.executeCommand('syn3.createMarker', activePage);
      return;
    }
    if (action === 'createPage') {
      await this.createPageFlow(webview);
      return;
    }
    if (action === 'renamePage') {
      await this.renamePageFlow(activePage);
      return;
    }
    if (action === 'deletePage') {
      await this.deletePageFlow(webview, activePage);
      return;
    }
    await vscode.commands.executeCommand(
      action === 'refresh'
        ? 'syn3.refresh'
        : action === 'openConfig'
          ? 'syn3.openConfig'
          : 'syn3.openSettings',
    );
  }

  private async createPageFlow(webview: vscode.Webview): Promise<void> {
    if (this.store.pages().length >= MAX_PAGES) {
      return;
    }
    const name = await vscode.window.showInputBox({
      title: 'New page',
      prompt: 'Page name',
      placeHolder: 'e.g. Docs, Rules, Tips',
      validateInput: (v) => (v.trim() ? undefined : 'Name cannot be empty'),
    });
    if (!name) {
      return;
    }
    const kindPick = await vscode.window.showQuickPick(
      [
        { label: 'Карта с файлами', description: 'Группы, папки и файлы', id: 'files' as const },
        { label: 'Карта с записями', description: 'Группы и текстовые записи', id: 'notes' as const },
      ],
      { title: 'Тип страницы', placeHolder: 'Выбери тип' },
    );
    if (!kindPick) {
      return;
    }
    const kind = normalizePageKind(kindPick.id) ?? 'files';
    const id = await this.store.createPage(name, kind);
    if (id) {
      this.activePageByWebview.set(webview, id);
      this.persistSurfacePage(webview, id);
      await webview.postMessage({ type: 'openPage', pageId: id });
    }
  }

  private async renamePageFlow(pageId: string): Promise<void> {
    const page = this.store.page(pageId);
    if (!page) {
      return;
    }
    const name = await vscode.window.showInputBox({
      title: 'Rename page',
      prompt: 'Page name',
      value: page.name,
      validateInput: (v) => (v.trim() ? undefined : 'Name cannot be empty'),
    });
    if (!name || name.trim() === page.name) {
      return;
    }
    await this.store.renamePage(pageId, name);
  }

  private async deletePageFlow(webview: vscode.Webview, pageId: string): Promise<void> {
    if (this.store.pages().length <= 1) {
      return;
    }
    const page = this.store.page(pageId);
    if (!page) {
      return;
    }
    const confirm = await vscode.window.showWarningMessage(
      `Удалить страницу «${page.name}» вместе со всеми группами? Восстановить будет невозможно.`,
      { modal: true },
      'Удалить',
    );
    if (confirm !== 'Удалить') {
      return;
    }
    const neighbor = await this.store.deletePage(pageId);
    if (neighbor) {
      this.activePageByWebview.set(webview, neighbor);
      this.persistSurfacePage(webview, neighbor);
      await webview.postMessage({ type: 'openPage', pageId: neighbor });
    }
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
    <button id="history-accept" class="history-btn" type="button" title="Готово" aria-label="Готово" hidden>
      ${icon('check')}
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
          <button type="button" data-action="createPage" role="menuitem" id="menu-create-page">${icon('add')}New Page</button>
          <button type="button" data-action="renamePage" role="menuitem">${icon('list-flat')}Rename Page</button>
          <button type="button" data-action="deletePage" role="menuitem" id="menu-delete-page">${icon('ellipsis')}Delete Page</button>
          <button type="button" data-action="refresh" role="menuitem">${icon('refresh')}Refresh</button>
          <button type="button" data-action="openConfig" role="menuitem">${icon('json')}Open Markers File</button>
          <button type="button" data-action="openSettings" role="menuitem">${icon('gear')}Open Settings</button>
        </div>
      </div>
    </div>
  </div>
  <div id="pager" class="pager" hidden></div>
  <div id="stage" class="page-stage">
    <div id="root" class="map-page"></div>
  </div>
  <script nonce="${nonce}" src="${js}"></script>
</body>
</html>`;
  }
}
