import * as crypto from 'crypto';
import * as path from 'path';
import * as vscode from 'vscode';
import { CodeLanguageService, CodeStamp } from './codeLanguage';
import {
  ColumnsMode,
  GENERAL_PROFILE_ID,
  GroupsLayout,
  MapLayout,
  MapSurface,
  MAX_PAGES,
  MarkerStore,
  NOTE_ROOT_COLOR,
  PageKind,
  normalizeGroupsLayout,
  normalizeMapLayout,
  normalizePageKind,
} from './markerStore';
import { normalizeLocale, stringsFor, t } from './i18n';
import { openClassAt } from './openClass';
import { cssColor, normalizeHex } from './palette';

const COLUMN_SIDE_KEY = 'syn3.map.columnSide';
/** Legacy workspace keys for active page per surface (migrated into syn3.json once). */
const LEGACY_ACTIVE_PAGE_KEYS = {
  explorer: 'syn3.map.activePage.explorer',
  bottom: 'syn3.map.activePage.bottom',
  sidebar: 'syn3.map.activePage.sidebar',
} as const;
/** Context key that selects which groups-layout button is shown in view/editor titles. */
const GROUPS_LAYOUT_CONTEXT = 'syn3.map.groupsLayout';
/** True when every top-level group on the map is collapsed. */
const TOP_COLLAPSED_CONTEXT = 'syn3.map.topCollapsed';
/** `when` on the bottom view. False removes only that tab; Terminal stays. */
const BOTTOM_OPEN_CONTEXT = 'syn3.bottom.open';

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
  /** Badge emoji to the right of the fixed type icon (max 3). */
  icons?: string[];
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
  /** Direct child note ids (shared order with children). */
  noteChildren: string[];
  items: MapItem[];
  classes: MapClass[];
  order: number;
}

interface MapNote {
  id: string;
  text: string;
  page?: string;
  markerId?: string;
  parentNote?: string;
  locked?: true;
  /** Badge emoji to the right of the fixed type icon (max 3). */
  icons?: string[];
  depth: number;
  subtreeHeight: number;
  children: string[];
  order: number;
  /** Resolved CSS color for the card. */
  color: string;
}

interface MapPage {
  id: string;
  name: string;
  kind: PageKind;
  layout: MapLayout;
  groupsLayout: GroupsLayout;
  collapsed: Record<string, boolean>;
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
  | 'setLayout'
  | 'setGroupsLayout'
  | 'createMarker'
  | 'createNote'
  | 'collapseGroups'
  | 'expandGroups'
  | 'refresh'
  | 'openSettings'
  | 'createPage'
  | 'renamePage'
  | 'deletePage'
  | 'toggleBottom'
  | 'toggleLeft'
  | 'toggleRight';

type ColumnSide = 'left' | 'right';

type IncomingMessage =
  | { type: 'ready'; pageId?: string }
  | { type: 'activePage'; pageId: string }
  | { type: 'mapFocus'; pageId?: string }
  | { type: 'open'; relPath: string }
  | { type: 'openClass'; classId: string }
  | { type: 'openExternal'; url: string }
  | { type: 'previewLink'; url: string; requestId: string }
  | { type: 'clipboardRead'; requestId: string }
  | { type: 'clipboardWrite'; text: string; languageId?: string; label?: string }
  | { type: 'highlightCode'; requestId: string; text: string; languageId: string }
  | { type: 'reveal'; relPath: string }
  | { type: 'listDir'; relPath: string }
  | { type: 'history'; direction: 'back' | 'forward' | 'accept'; pageId?: string }
  | { type: 'setCollapsed'; pageId: string; collapsed: Record<string, boolean>; allTopCollapsed: boolean }
  | {
      type: 'toolbar';
      action: IncomingToolbarAction;
      pageId?: string;
      value?: string;
    }
  | { type: 'runCommand'; command: string; arg?: Record<string, unknown> }
  | { type: 'reorderPages'; orderedIds: string[] }
  | { type: 'setColor'; markerId?: string; noteId?: string; color: string }
  | { type: 'moveItem'; relPath: string; from: string; to: string; copy?: boolean }
  | { type: 'moveClass'; classId: string; from: string; to: string; copy?: boolean }
  | { type: 'placeMarker'; id: string; target: string; position: 'before' | 'after' }
  | {
      type: 'placeMarkerAtNote';
      id: string;
      targetNoteId: string;
      position: 'before' | 'after';
    }
  | { type: 'nestMarker'; id: string; parent: string }
  | { type: 'dropUris'; uris: string[]; to: string }
  | {
      type: 'createNote';
      page?: string;
      markerId?: string;
      parentNote?: string;
      text?: string;
      focus?: boolean;
    }
  | { type: 'updateNote'; noteId: string; text: string }
  | { type: 'deleteNote'; noteId: string; tree?: boolean }
  | { type: 'deleteMarkerTree'; markerId: string }
  | {
      type: 'placeNote';
      id: string;
      targetKind: 'marker' | 'note';
      targetId: string;
      position: 'before' | 'after';
    }
  | { type: 'nestNote'; id: string; markerId?: string; noteId?: string }
  | { type: 'unnestNote'; id: string }
  | { type: 'moveNote'; id: string; delta: -1 | 1 }
  | { type: 'toggleLock'; markerId: string }
  | { type: 'toggleNoteLock'; noteId: string }
  | {
      type: 'profile';
      action: 'activate' | 'create' | 'rename' | 'delete' | 'syncPush' | 'syncPull';
      id?: string;
      name?: string;
    };

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

function metaContent(html: string, name: string): string | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["']`,
      'i',
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["']`,
      'i',
    ),
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(html);
    if (match?.[1]) {
      return decodeHtmlEntities(match[1].trim());
    }
  }
  return undefined;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    })
    .replace(/&#(\d+);/g, (_, dec: string) => {
      const code = Number.parseInt(dec, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    })
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function charsetFromContentType(contentType: string | null): string | undefined {
  if (!contentType) {
    return undefined;
  }
  const match = /charset\s*=\s*["']?([^"';\s]+)/i.exec(contentType);
  return match?.[1]?.trim() || undefined;
}

function charsetFromHtmlMeta(headLatin1: string): string | undefined {
  const patterns = [
    /<meta[^>]+charset\s*=\s*["']?\s*([^"'>\s/]+)/i,
    /<meta[^>]+http-equiv\s*=\s*["']?content-type["']?[^>]+content\s*=\s*["'][^"']*charset\s*=\s*([^"'>\s]+)/i,
    /<meta[^>]+content\s*=\s*["'][^"']*charset\s*=\s*([^"'>\s]+)[^"']*["'][^>]+http-equiv\s*=\s*["']?content-type["']?/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(headLatin1);
    if (match?.[1]) {
      return match[1].trim();
    }
  }
  return undefined;
}

function normalizeCharset(raw: string): string {
  const lower = raw.trim().toLowerCase().replace(/_/g, '-');
  if (lower === 'utf8' || lower === 'utf-8' || lower === 'unicode') {
    return 'utf-8';
  }
  if (lower === 'win-1251' || lower === 'windows-1251' || lower === 'cp1251') {
    return 'windows-1251';
  }
  if (lower === 'win-1252' || lower === 'windows-1252' || lower === 'cp1252' || lower === 'latin1' || lower === 'iso-8859-1') {
    return 'windows-1252';
  }
  if (lower === 'koi8-r' || lower === 'koi8r') {
    return 'koi8-r';
  }
  return lower;
}

function replacementCharRatio(text: string): number {
  if (!text) {
    return 0;
  }
  const bad = (text.match(/\uFFFD/g) || []).length;
  return bad / text.length;
}

function decodeWithCharset(buffer: Buffer, charset: string): string {
  try {
    return new TextDecoder(charset, { fatal: false }).decode(buffer);
  } catch {
    return buffer.toString('utf8');
  }
}

function decodeHtmlBuffer(buffer: Buffer, contentType: string | null): string {
  const head = buffer.subarray(0, Math.min(buffer.byteLength, 8192)).toString('latin1');
  const charset = normalizeCharset(
    charsetFromContentType(contentType) || charsetFromHtmlMeta(head) || 'utf-8',
  );
  const primary = decodeWithCharset(buffer, charset);
  if (replacementCharRatio(primary) < 0.02) {
    return primary;
  }
  // Wrong charset (common for RU pages labeled UTF-8 or missing meta) — try Cyrillic encodings.
  for (const fallback of ['utf-8', 'windows-1251', 'koi8-r']) {
    if (fallback === charset) {
      continue;
    }
    const alt = decodeWithCharset(buffer, fallback);
    if (replacementCharRatio(alt) < replacementCharRatio(primary)) {
      return alt;
    }
  }
  return primary;
}

async function fetchTextLimited(
  url: string,
  maxBytes: number,
  timeoutMs: number,
): Promise<string | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'Accept-Charset': 'utf-8, windows-1251, iso-8859-1;q=0.5',
      },
    });
    if (!response.ok) {
      return undefined;
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    const slice = buffer.byteLength > maxBytes ? buffer.subarray(0, maxBytes) : buffer;
    return decodeHtmlBuffer(slice, response.headers.get('content-type'));
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchImageDataUrl(
  url: string,
  maxBytes: number,
  timeoutMs: number,
): Promise<string | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
    });
    if (!response.ok) {
      return undefined;
    }
    const mime = (response.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
    if (!mime.startsWith('image/')) {
      return undefined;
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength === 0 || buffer.byteLength > maxBytes) {
      return undefined;
    }
    return `data:${mime};base64,${buffer.toString('base64')}`;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
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
  private leftPanel?: vscode.WebviewPanel;
  private rightPanel?: vscode.WebviewPanel;
  private bottomView?: vscode.WebviewView;
  private lastEditorColumn?: vscode.ViewColumn;
  /** In-memory OG preview cache keyed by page URL. */
  private readonly linkPreviewCache = new Map<
    string,
    { image?: string; description?: string; empty?: true }
  >();
  private readonly linkPreviewInflight = new Map<string, Promise<void>>();
  /** Workspace file that last had the editor. Kept when focus moves to the map. */
  private lastFocusedRel?: string;
  /** Webview that last talked to the host — drives view-title layout/collapse. */
  private lastFocusedWebview?: vscode.Webview;
  /** Skip writing open=false while we close a column ourselves. */
  private closingColumn?: ColumnSide;
  /** Profile sync or the toolbar is opening/closing the bottom tab. */
  private applyingBottom = false;
  /** Latest show/hide. An older call must not overwrite it. */
  private bottomOp = 0;
  /** Show and hide run one at a time, so a late `setContext` cannot undo a newer one. */
  private bottomChain: Promise<unknown> = Promise.resolve();
  /** Bumped for every profile sync. A stale sync must not hide the tab afterwards. */
  private surfaceSyncEpoch = 0;
  private surfaceSyncChain: Promise<void> = Promise.resolve();
  /** Bumped only when a new reveal starts or the tab must close. Store saves do not bump it. */
  private bottomRevealToken = 0;
  private surfacesBootstrapped = false;
  /** Last applied profile panel flags — skip sync when only appearance changed. */
  private lastSyncedOpenKey = '';
  /** Note id to focus in the next state push (after create). */
  private focusNoteId?: string;
  private readonly languages: CodeLanguageService;
  private readonly ownsLanguages: boolean;

  constructor(
    private readonly store: MarkerStore,
    extensionUri: vscode.Uri,
    private readonly memento: vscode.Memento,
    private readonly workspaceState: vscode.Memento,
    languages?: CodeLanguageService,
  ) {
    this.media = vscode.Uri.joinPath(extensionUri, 'media');
    this.ownsLanguages = !languages;
    this.languages = languages ?? new CodeLanguageService(extensionUri.fsPath);
    this.lastEditorColumn = vscode.window.activeTextEditor?.viewColumn;
    this.lastFocusedRel = this.activeRelPath();
    this.subscriptions = [
      ...(this.ownsLanguages ? [this.languages] : []),
      this.languages.onDidChangeStamp((stamp) => this.postCodeStamp(stamp)),
      this.languages.onDidChangeTheme(() => this.postThemeGeneration()),
      store.onDidChange(() => {
        this.refresh();
        this.postOpenFlags();
        void this.syncOpenSurfacesIfNeeded();
      }),
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor?.viewColumn !== undefined) {
          this.lastEditorColumn = editor.viewColumn;
        }
        this.captureFocusedFile(editor);
        this.postActive();
        this.postTabs();
      }),
      vscode.window.tabGroups.onDidChangeTabs(() => {
        this.captureFocusedFile(vscode.window.activeTextEditor);
        this.postTabs();
      }),
    ];
  }

  /** Cmd/Ctrl+C while a text editor is focused. */
  copyFromEditor(): Thenable<void> {
    return this.languages.copyFromEditor();
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
      if (!view.visible) {
        return;
      }
      void this.postState(webview);
      // User selected the Syn3 tab. Switching to Terminal leaves this false.
      if (surface === 'bottom' && this.store.ready && !this.applyingBottom) {
        void this.store.setSurfaceOpen('bottom', true);
      }
    });
    view.onDidDispose(() => {
      this.webviews.delete(webview);
      if (this.bottomView === view) {
        this.bottomView = undefined;
      }
    });
  }

  /**
   * After the store is ready: migrate legacy workspace keys once, then open/close
   * panels to match `surfaces.open` in syn3.json.
   */
  async bootstrapSurfaces(): Promise<void> {
    if (this.surfacesBootstrapped) {
      return;
    }
    this.surfacesBootstrapped = true;
    if (this.store.needsLegacySurfaceHydration()) {
      const columnSide =
        this.memento.get<string>(COLUMN_SIDE_KEY) ?? this.memento.get<string>('sgroup.map.columnSide');
      await this.store.hydrateSurfacesFromLegacy({
        pages: {
          explorer: this.workspaceState.get<string>(LEGACY_ACTIVE_PAGE_KEYS.explorer),
          bottom: this.workspaceState.get<string>(LEGACY_ACTIVE_PAGE_KEYS.bottom),
          sidebar: this.workspaceState.get<string>(LEGACY_ACTIVE_PAGE_KEYS.sidebar),
        },
        columnSide: columnSide === 'left' || columnSide === 'right' ? columnSide : undefined,
        bottomAlive: !!this.bottomView,
      });
      await this.clearLegacySurfaceState();
    }
    await this.syncOpenSurfacesIfNeeded(true);
    this.postOpenFlags();
  }

  /**
   * Toolbar button follows the tab on screen.
   * The profile flag can stay true after the tab was removed; flipping it then
   * hides an already hidden tab, and only the next click opens it.
   */
  async toggleBottom(): Promise<boolean> {
    if (!this.store.ready) {
      return false;
    }
    const available = await vscode.commands.getCommands(true);
    if (!available.includes(`${MarkersMapProvider.bottomViewId}.focus`)) {
      return false;
    }
    if (this.bottomView?.visible) {
      await this.store.setSurfaceOpen('bottom', false);
      return true;
    }
    if (this.store.isSurfaceOpen('bottom')) {
      await this.showBottomTab();
      return true;
    }
    await this.store.setSurfaceOpen('bottom', true);
    return true;
  }

  /** Puts the Syn3 tab back and selects it. The container command toggles the whole strip, so it is not used. */
  private showBottomTab(): Promise<boolean> {
    return this.enqueueBottom(() => this.showBottomNow());
  }

  /**
   * The view command appears only after `syn3.bottom.open` flips, and a profile
   * switch is still moving editor groups. One early focus used to fail and never
   * retry, so the tab stayed gone until the toolbar button ran the same focus later.
   */
  private async showBottomNow(): Promise<boolean> {
    const op = ++this.bottomOp;
    const focusId = `${MarkersMapProvider.bottomViewId}.focus`;
    this.applyingBottom = true;
    try {
      await vscode.commands.executeCommand('setContext', BOTTOM_OPEN_CONTEXT, true);
      for (let attempt = 0; attempt < 6; attempt++) {
        if (op !== this.bottomOp) {
          return false;
        }
        if (attempt > 0) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        if (op !== this.bottomOp) {
          return false;
        }
        if (this.bottomView?.visible) {
          return true;
        }
        try {
          await vscode.commands.executeCommand(focusId);
        } catch {
          // The focus command is registered a moment after the when-clause flips.
        }
      }
      return op === this.bottomOp && !!this.bottomView?.visible;
    } finally {
      setTimeout(() => {
        if (op === this.bottomOp) {
          this.applyingBottom = false;
        }
      }, 400);
    }
  }

  /** Hides the Syn3 tab only. Terminal stays. */
  private hideBottomTab(): Promise<void> {
    this.stopBottomReveal();
    return this.enqueueBottom(() => this.hideBottomNow());
  }

  private async hideBottomNow(): Promise<void> {
    const op = ++this.bottomOp;
    this.applyingBottom = true;
    try {
      if (op !== this.bottomOp) {
        return;
      }
      await vscode.commands.executeCommand('setContext', BOTTOM_OPEN_CONTEXT, false);
    } finally {
      setTimeout(() => {
        if (op === this.bottomOp) {
          this.applyingBottom = false;
        }
      }, 400);
    }
  }

  private enqueueBottom<T>(task: () => Promise<T>): Promise<T> {
    const run = this.bottomChain.then(task, task);
    this.bottomChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private stopBottomReveal(): void {
    this.bottomRevealToken++;
  }

  /**
   * Same focus the toolbar uses, repeated until the tab is on screen.
   * A profile save fires another store event; that must not cancel this loop.
   */
  private kickBottomReveal(): void {
    const token = ++this.bottomRevealToken;
    void this.revealBottomUntilVisible(token);
  }

  private async revealBottomUntilVisible(token: number): Promise<void> {
    for (let attempt = 0; attempt < 16; attempt++) {
      if (token !== this.bottomRevealToken || !this.store.ready || !this.store.isSurfaceOpen('bottom')) {
        return;
      }
      if (this.bottomView?.visible) {
        return;
      }
      await this.showBottomTab();
      if (token !== this.bottomRevealToken || !this.store.isSurfaceOpen('bottom')) {
        return;
      }
      if (this.bottomView?.visible) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  // ---- narrow editor columns next to the code ----

  async toggleColumn(): Promise<void> {
    try {
      if (this.leftPanel) {
        await this.closeColumn('left');
        return;
      }
      await this.openColumn();
    } catch (error) {
      this.reportColumnError(error);
    }
  }

  /** Narrow locked editor column on the right of the code, before Cursor's agent group. */
  async toggleRight(): Promise<void> {
    try {
      if (this.rightPanel) {
        await this.closeColumn('right');
        return;
      }
      await this.openRightColumn();
    } catch (error) {
      this.reportColumnError(error);
    }
  }

  /** Closes one map column and the editor group that held it. */
  private async closeColumn(side: ColumnSide): Promise<void> {
    const panel = side === 'left' ? this.leftPanel : this.rightPanel;
    if (!panel) {
      if (this.store.ready) {
        await this.store.setSurfaceOpen(side, false);
      }
      return;
    }
    this.closingColumn = side;
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
      this.clearPanelSlot(side, panel);
      try {
        panel.dispose();
      } catch {
        // The group close already disposed it.
      }
      this.closingColumn = undefined;
      if (this.store.ready) {
        await this.store.setSurfaceOpen(side, false);
      }
    }
  }

  async openColumn(): Promise<void> {
    if (this.leftPanel) {
      this.leftPanel.reveal(this.leftPanel.viewColumn, true);
      if (this.store.ready) {
        await this.store.setSurfaceOpen('left', true);
      }
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
    this.adoptPanel(panel, 'left');
    if (this.store.ready) {
      await this.store.setSurfaceOpen('left', true);
    }
    await vscode.commands.executeCommand('workbench.action.lockEditorGroup');
    await this.narrowEdgeColumn('start');

    const back = previous && vscode.window.visibleTextEditors.find((e) => e.document === previous);
    if (back?.viewColumn !== undefined) {
      this.lastEditorColumn = back.viewColumn;
      await vscode.window.showTextDocument(back.document, { viewColumn: back.viewColumn, preserveFocus: false });
    }
  }

  private async openRightColumn(): Promise<void> {
    if (this.rightPanel) {
      this.rightPanel.reveal(this.rightPanel.viewColumn, true);
      if (this.store.ready) {
        await this.store.setSurfaceOpen('right', true);
      }
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
    this.adoptPanel(panel, 'right');
    if (this.store.ready) {
      await this.store.setSurfaceOpen('right', true);
    }
    await vscode.commands.executeCommand('workbench.action.lockEditorGroup');
    await this.narrowViewColumn(panel.viewColumn ?? column);

    const back = previous && vscode.window.visibleTextEditors.find((e) => e.document === previous);
    if (back?.viewColumn !== undefined) {
      this.lastEditorColumn = back.viewColumn;
      await vscode.window.showTextDocument(back.document, { viewColumn: back.viewColumn, preserveFocus: false });
    }
  }

  async deserializeWebviewPanel(panel: vscode.WebviewPanel, state: unknown): Promise<void> {
    const side = this.resolveRestoredSide(state);
    const existing = side === 'left' ? this.leftPanel : this.rightPanel;
    if (existing && existing !== panel) {
      // Keep the already-adopted panel; drop the duplicate restore.
      panel.dispose();
      return;
    }
    this.adoptPanel(panel, side);
  }

  // ---- shared ----

  /** Set top-level group placement on the focused surface's page. */
  async setGroupsLayout(layout: GroupsLayout): Promise<void> {
    const pageId = this.focusedPageId();
    if (!this.store.page(pageId)) {
      return;
    }
    const next = normalizeGroupsLayout(layout);
    await this.store.updatePageView(pageId, { groupsLayout: next });
    await this.syncGroupsLayoutContext(next);
  }

  /** Set chips/list layout on the focused surface's page. */
  async setLayout(layout: MapLayout): Promise<void> {
    const pageId = this.focusedPageId();
    if (!this.store.page(pageId)) {
      return;
    }
    await this.store.updatePageView(pageId, { layout: normalizeMapLayout(layout) });
  }

  syncGroupsLayoutContext(layout?: GroupsLayout): Thenable<unknown> {
    const value = layout ?? this.store.page(this.focusedPageId())?.groupsLayout ?? 'flow';
    return vscode.commands.executeCommand('setContext', GROUPS_LAYOUT_CONTEXT, value);
  }

  /** Collapse or expand every top-level group and foldable root note on the focused page. */
  async setTopGroups(collapsed: boolean): Promise<void> {
    const pageId = this.focusedPageId();
    const surface = this.focusedSurface();
    const page = this.store.page(pageId);
    if (!page) {
      return;
    }
    const next: Record<string, boolean> = { ...page.collapsed[surface] };
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
    for (const [id] of this.store.rootNotes(pageId)) {
      if (this.store.isNoteLocked(id)) {
        continue;
      }
      if (collapsed) {
        next[id] = true;
      } else {
        delete next[id];
      }
    }
    await this.store.setPageCollapsed(pageId, surface, next);
    await this.syncTopCollapsedContext(this.allUnlockedTopCollapsed(pageId, next));
  }

  /** Collapse state of unlocked top-level groups and root notes that can fold. */
  private allUnlockedTopCollapsed(pageId: string, collapsed?: Record<string, boolean>): boolean {
    const flags = collapsed ?? this.store.page(pageId)?.collapsed[this.focusedSurface()] ?? {};
    const tops = this.store
      .markers()
      .filter(([id, def]) => !def.parent && this.store.pageOf(id) === pageId && !this.store.isLocked(id));
    const noteTops = this.store
      .rootNotes(pageId)
      .filter(([id]) => !this.store.isNoteLocked(id));
    const all = [...tops.map(([id]) => id), ...noteTops.map(([id]) => id)];
    return all.length > 0 && all.every((id) => !!flags[id]);
  }

  private refuseLocked(markerId: string): boolean {
    if (!this.store.isLocked(markerId)) {
      return false;
    }
    void vscode.window.showWarningMessage('Syn3: группа закрыта');
    return true;
  }

  private refuseNoteLocked(noteId: string): boolean {
    if (!this.store.isNoteLocked(noteId)) {
      return false;
    }
    void vscode.window.showWarningMessage('Syn3: заметка закрыта');
    return true;
  }

  /** CSS color for a note card: own color, else parent note / group / root slate. */
  private noteColor(noteId: string): string {
    let current: string | undefined = noteId;
    const seen = new Set<string>();
    while (current && !seen.has(current)) {
      seen.add(current);
      const def = this.store.note(current);
      if (!def) {
        break;
      }
      if (def.color) {
        return cssColor(def.color) ?? def.color;
      }
      if (def.page) {
        return cssColor(NOTE_ROOT_COLOR) ?? NOTE_ROOT_COLOR;
      }
      if (def.markerId) {
        const marker = this.store.marker(def.markerId);
        return marker?.color ? cssColor(marker.color) ?? marker.color : cssColor(NOTE_ROOT_COLOR) ?? NOTE_ROOT_COLOR;
      }
      current = def.parentNote;
    }
    return cssColor(NOTE_ROOT_COLOR) ?? NOTE_ROOT_COLOR;
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

  /**
   * Ask map webview(s) to select all text in the active note/field.
   * Cmd/A itself is left to VS Code's built-in webview selectAll; this remains
   * for programmatic use / older keybindings.
   */
  selectAllInMap(): void {
    const message = { type: 'selectAll' as const };
    for (const webview of this.webviews) {
      if (this.readyWebviews.has(webview)) {
        void webview.postMessage(message);
      }
    }
  }

  /** Undo text edit in the focused map field, or map history if none. */
  undoInMap(): void {
    this.lastFocusedWebview?.postMessage({ type: 'undoInMap' });
  }

  /** Ask the focused map to copy the current text selection. */
  copyInMap(): void {
    this.lastFocusedWebview?.postMessage({ type: 'copyInMap' });
  }

  /** Paste clipboard text into the focused map field (linkify when selection + URL). */
  async pasteInMap(): Promise<void> {
    const text = await vscode.env.clipboard.readText();
    const matched = this.languages.matchStamp(text);
    this.lastFocusedWebview?.postMessage({
      type: 'pasteInMap',
      text,
      languageId: matched?.languageId,
      label: matched?.label,
    });
  }

  private postCodeStamp(stamp: CodeStamp | undefined): void {
    for (const webview of this.webviews) {
      if (!this.readyWebviews.has(webview)) {
        continue;
      }
      void webview.postMessage({ type: 'codeStamp', stamp: stamp ?? null });
    }
  }

  private postThemeGeneration(): void {
    const themeGeneration = this.languages.getThemeGeneration();
    for (const webview of this.webviews) {
      if (!this.readyWebviews.has(webview)) {
        continue;
      }
      void webview.postMessage({ type: 'themeGeneration', themeGeneration });
    }
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
    const saved = this.store.surfacePage(surface);
    return this.store.page(saved) ? saved : undefined;
  }

  private persistSurfacePage(webview: vscode.Webview, pageId: string): void {
    if (!this.store.ready || !this.store.page(pageId)) {
      return;
    }
    const surface = this.surfaceByWebview.get(webview);
    if (!surface) {
      return;
    }
    if (this.store.surfacePage(surface) === pageId) {
      return;
    }
    void this.store.setSurfacePage(surface, pageId);
  }

  private surfaceOf(webview: vscode.Webview): MapSurface {
    return this.surfaceByWebview.get(webview) ?? 'explorer';
  }

  private focusedSurface(): MapSurface {
    return this.lastFocusedWebview ? this.surfaceOf(this.lastFocusedWebview) : 'explorer';
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

  private adoptPanel(panel: vscode.WebviewPanel, side: ColumnSide): void {
    if (side === 'left') {
      this.leftPanel = panel;
    } else {
      this.rightPanel = panel;
    }
    panel.title = MarkersMapProvider.panelTitle;
    panel.iconPath = vscode.Uri.joinPath(this.media, 'map-icon.svg');
    this.attach(panel.webview, 'panel', side);
    panel.onDidChangeViewState(() => {
      if (panel.visible) {
        void this.postState(panel.webview);
      }
    });
    panel.onDidDispose(() => {
      this.webviews.delete(panel.webview);
      const wasSlot = this.clearPanelSlot(side, panel);
      if (wasSlot && this.closingColumn !== side && this.store.ready) {
        void this.store.setSurfaceOpen(side, false);
      }
    });
    if (this.store.ready && !this.store.isSurfaceOpen(side)) {
      void this.store.setSurfaceOpen(side, true);
    }
  }

  private clearPanelSlot(side: ColumnSide, panel: vscode.WebviewPanel): boolean {
    if (side === 'left' && this.leftPanel === panel) {
      this.leftPanel = undefined;
      return true;
    }
    if (side === 'right' && this.rightPanel === panel) {
      this.rightPanel = undefined;
      return true;
    }
    return false;
  }

  private resolveRestoredSide(state: unknown): ColumnSide {
    if (state && typeof state === 'object' && !Array.isArray(state)) {
      const side = (state as { side?: unknown }).side;
      if (side === 'left' || side === 'right') {
        return side;
      }
    }
    const stored =
      this.memento.get<string>(COLUMN_SIDE_KEY) ?? this.memento.get<string>('sgroup.map.columnSide');
    if (stored === 'right') {
      return 'right';
    }
    return 'left';
  }

  private attach(webview: vscode.Webview, chrome: 'view' | 'panel', surface: MapSurface): void {
    this.surfaceByWebview.set(webview, surface);
    this.needsPageRestore.add(webview);
    webview.options = { enableScripts: true, localResourceRoots: [this.media] };
    webview.html = this.html(webview, chrome, surface);
    webview.onDidReceiveMessage((message: IncomingMessage) => this.onMessage(webview, message));
    this.webviews.add(webview);
  }

  /** Open/close left, right, and bottom to match the active profile. */
  private syncOpenSurfacesIfNeeded(force = false): Promise<void> {
    const epoch = ++this.surfaceSyncEpoch;
    const run = this.surfaceSyncChain.then(
      () => this.applyOpenSurfaces(epoch, force),
      () => this.applyOpenSurfaces(epoch, force),
    );
    this.surfaceSyncChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async applyOpenSurfaces(epoch: number, force: boolean): Promise<void> {
    if (!this.store.ready || epoch !== this.surfaceSyncEpoch) {
      return;
    }
    const open = this.store.surfaceOpen();
    const key = `${open.bottom ? 1 : 0}${open.left ? 1 : 0}${open.right ? 1 : 0}`;
    const previousKey = this.lastSyncedOpenKey;
    if (!force && key === previousKey) {
      return;
    }
    if (open.left && !this.leftPanel) {
      if (epoch !== this.surfaceSyncEpoch) {
        return;
      }
      try {
        await this.openColumn();
      } catch (error) {
        this.reportColumnError(error);
      }
    } else if (!open.left && this.leftPanel) {
      if (epoch !== this.surfaceSyncEpoch) {
        return;
      }
      await this.closeColumn('left');
    }
    if (epoch !== this.surfaceSyncEpoch) {
      return;
    }
    if (open.right && !this.rightPanel) {
      try {
        await this.openRightColumn();
      } catch (error) {
        this.reportColumnError(error);
      }
    } else if (!open.right && this.rightPanel) {
      await this.closeColumn('right');
    }
    if (epoch !== this.surfaceSyncEpoch) {
      return;
    }
    const bottomWasOpen = previousKey.startsWith('1');
    if (force || bottomWasOpen !== open.bottom) {
      if (open.bottom) {
        this.kickBottomReveal();
      } else {
        await this.hideBottomTab();
      }
    }
    if (epoch === this.surfaceSyncEpoch) {
      this.lastSyncedOpenKey = key;
    }
  }

  private postOpenFlags(): void {
    if (!this.store.ready) {
      return;
    }
    const open = this.store.surfaceOpen();
    for (const webview of this.webviews) {
      if (!this.readyWebviews.has(webview)) {
        continue;
      }
      void webview.postMessage({ type: 'openFlags', open });
    }
  }

  private async clearLegacySurfaceState(): Promise<void> {
    await this.memento.update(COLUMN_SIDE_KEY, undefined);
    await this.memento.update('sgroup.map.columnSide', undefined);
    await this.workspaceState.update(LEGACY_ACTIVE_PAGE_KEYS.explorer, undefined);
    await this.workspaceState.update(LEGACY_ACTIVE_PAGE_KEYS.bottom, undefined);
    await this.workspaceState.update(LEGACY_ACTIVE_PAGE_KEYS.sidebar, undefined);
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
    const mapColumns = new Set(
      [this.leftPanel?.viewColumn, this.rightPanel?.viewColumn].filter(
        (column): column is vscode.ViewColumn => column !== undefined,
      ),
    );
    const groups = vscode.window.tabGroups.all.filter((group) => {
      if (group.viewColumn < 1 || mapColumns.has(group.viewColumn)) {
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
    if (message.type === 'mapFocus') {
      this.rememberFocus(webview, message.pageId);
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
      await this.onToolbar(webview, message.action, message.pageId, message.value);
      return;
    }
    if (message.type === 'runCommand') {
      this.rememberFocus(webview);
      if (typeof message.command === 'string' && message.command.startsWith('syn3.')) {
        await vscode.commands.executeCommand(message.command, message.arg);
      }
      return;
    }
    if (message.type === 'setCollapsed') {
      this.rememberFocus(webview, message.pageId);
      const page = this.store.page(message.pageId);
      const surface = this.surfaceOf(webview);
      if (page) {
        const next: Record<string, boolean> = { ...message.collapsed };
        const current = page.collapsed[surface];
        for (const [id] of this.store.markers()) {
          if (!this.store.isLocked(id)) {
            continue;
          }
          if (current[id]) {
            next[id] = true;
          } else {
            delete next[id];
          }
        }
        for (const [id] of this.store.notes()) {
          if (!this.store.isNoteLocked(id)) {
            continue;
          }
          if (current[id]) {
            next[id] = true;
          } else {
            delete next[id];
          }
        }
        await this.store.setPageCollapsed(message.pageId, surface, next);
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
    if (message.type === 'profile') {
      await this.onProfile(message.action, message.id, message.name);
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
    if (message.type === 'previewLink') {
      await this.replyLinkPreview(webview, message.url, message.requestId);
      return;
    }
    if (message.type === 'clipboardRead') {
      const text = await vscode.env.clipboard.readText();
      const matched = this.languages.matchStamp(text);
      await webview.postMessage({
        type: 'clipboardReadResult',
        requestId: message.requestId,
        text,
        languageId: matched?.languageId,
        label: matched?.label,
      });
      return;
    }
    if (message.type === 'clipboardWrite') {
      await vscode.env.clipboard.writeText(message.text);
      if (message.languageId && message.label && message.text) {
        this.languages.setStamp({
          text: message.text,
          languageId: message.languageId,
          label: message.label,
        });
      } else if (message.text) {
        const current = this.languages.getStamp();
        if (current && current.text !== message.text) {
          this.languages.setStamp(undefined);
        }
      }
      return;
    }
    if (message.type === 'highlightCode') {
      const result = await this.languages.highlight(message.text, message.languageId);
      await webview.postMessage({
        type: 'highlightCodeResult',
        requestId: message.requestId,
        lines: result?.lines,
        themeGeneration: result?.themeGeneration ?? this.languages.getThemeGeneration(),
      });
      return;
    }
    if (message.type === 'createNote') {
      let createdId: string | undefined;
      if (message.parentNote) {
        if (this.refuseNoteLocked(message.parentNote)) {
          return;
        }
        createdId = await this.store.createNote(
          { parentNote: message.parentNote },
          message.text ?? '',
        );
      } else if (message.markerId) {
        if (this.refuseLocked(message.markerId)) {
          return;
        }
        createdId = await this.store.createNote(
          { markerId: message.markerId },
          message.text ?? '',
        );
      } else if (message.page && this.store.page(message.page)) {
        createdId = await this.store.createNote({ page: message.page }, message.text ?? '');
      }
      if (createdId && message.focus) {
        // onDidChange already refreshed without focus — push again with the new id.
        this.focusNoteId = createdId;
        this.refresh();
      }
      return;
    }
    if (message.type === 'updateNote') {
      const note = this.store.note(message.noteId);
      if (!note || this.refuseNoteLocked(message.noteId)) {
        return;
      }
      await this.store.updateNote(message.noteId, message.text);
      return;
    }
    if (message.type === 'deleteNote') {
      const note = this.store.note(message.noteId);
      if (!note || this.refuseNoteLocked(message.noteId)) {
        return;
      }
      if (message.tree) {
        const answer = await vscode.window.showWarningMessage(
          'Удалить заметку и все вложенные заметки?',
          { modal: true },
          'Удалить все',
        );
        if (answer === 'Удалить все') {
          await this.store.deleteNoteTree(message.noteId);
        }
      } else {
        const childCount = this.store.noteChildren(message.noteId).length;
        const answer = await vscode.window.showWarningMessage(
          'Удалить заметку?',
          {
            modal: true,
            detail:
              childCount > 0
                ? `${childCount} вложенных заметки поднимутся на уровень выше.`
                : undefined,
          },
          'Удалить',
        );
        if (answer === 'Удалить') {
          await this.store.deleteNote(message.noteId);
        }
      }
      return;
    }
    if (message.type === 'deleteMarkerTree') {
      if (!this.store.marker(message.markerId) || this.refuseLocked(message.markerId)) {
        return;
      }
      const def = this.store.marker(message.markerId);
      const answer = await vscode.window.showWarningMessage(
        `Удалить группу «${def?.label ?? message.markerId}» и все вложения?`,
        { modal: true, detail: 'Файлы на диске не удаляются. Метки снимаются со всей ветки.' },
        'Удалить все',
      );
      if (answer === 'Удалить все') {
        await this.store.deleteMarkerTree(message.markerId);
      }
      return;
    }
    if (message.type === 'placeNote') {
      if (this.refuseNoteLocked(message.id)) {
        return;
      }
      try {
        await this.store.placeNote(
          message.id,
          { kind: message.targetKind, id: message.targetId },
          message.position,
        );
      } catch (error) {
        void vscode.window.showWarningMessage(
          `Syn3: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      return;
    }
    if (message.type === 'nestNote') {
      if (this.refuseNoteLocked(message.id)) {
        return;
      }
      if (message.noteId && this.refuseNoteLocked(message.noteId)) {
        return;
      }
      if (message.markerId && this.refuseLocked(message.markerId)) {
        return;
      }
      try {
        await this.store.nestNote(message.id, {
          markerId: message.markerId,
          noteId: message.noteId,
        });
      } catch (error) {
        void vscode.window.showWarningMessage(
          `Syn3: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      return;
    }
    if (message.type === 'unnestNote') {
      if (this.refuseNoteLocked(message.id)) {
        return;
      }
      await this.store.unnestNote(message.id);
      return;
    }
    if (message.type === 'moveNote') {
      if (this.refuseNoteLocked(message.id)) {
        return;
      }
      await this.store.moveNote(message.id, message.delta);
      return;
    }
    if (message.type === 'toggleNoteLock') {
      if (!this.store.note(message.noteId)) {
        return;
      }
      await this.store.toggleNoteLock(message.noteId);
      return;
    }
    if (message.type === 'setColor') {
      const color = normalizeHex(message.color);
      if (!color) {
        return;
      }
      if (typeof message.noteId === 'string') {
        if (this.refuseNoteLocked(message.noteId)) {
          return;
        }
        if (this.store.note(message.noteId)) {
          await this.store.setNoteColor(message.noteId, color);
        }
        return;
      }
      if (typeof message.markerId !== 'string') {
        return;
      }
      if (this.refuseLocked(message.markerId)) {
        return;
      }
      if (this.store.marker(message.markerId)) {
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
    if (message.type === 'placeMarkerAtNote') {
      const notePage = this.store.pageOfNote(message.targetNoteId);
      if (this.store.pageOf(message.id) !== notePage) {
        return;
      }
      if (this.refuseLocked(message.id)) {
        return;
      }
      try {
        await this.store.placeMarkerAtNote(message.id, message.targetNoteId, message.position);
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

  /** Files must never open inside a map column. */
  private targetColumn(): vscode.ViewColumn | undefined {
    const mapColumns = new Set(
      [this.leftPanel?.viewColumn, this.rightPanel?.viewColumn].filter(
        (column): column is vscode.ViewColumn => column !== undefined,
      ),
    );
    if (mapColumns.size === 0) {
      return undefined;
    }
    if (this.lastEditorColumn !== undefined && !mapColumns.has(this.lastEditorColumn)) {
      return this.lastEditorColumn;
    }
    const other = vscode.window.tabGroups.all.find((group) => !mapColumns.has(group.viewColumn));
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
    const surface = this.surfaceOf(webview);
    const pages: MapPage[] = this.store.pages().map(([id, def]) => ({
      id,
      name: def.name,
      kind: def.kind,
      layout: def.layout,
      groupsLayout: def.groupsLayout,
      collapsed: { ...def.collapsed[surface] },
    }));
    const groups: MapGroup[] = await Promise.all(
      this.store.markers().map(async ([id, def]) => ({
        id,
        label: def.label,
        icons: def.icons?.length ? def.icons.slice() : undefined,
        color: def.color ? cssColor(def.color) : undefined,
        alias: def.alias,
        parent: def.parent,
        page: this.store.pageOf(id),
        columns: def.columns ?? 'flow',
        locked: def.locked === true ? true : undefined,
        depth: this.store.depthOf(id),
        subtreeHeight: this.store.subtreeHeight(id),
        children: this.store.children(id).map(([childId]) => childId),
        noteChildren: this.store.notesOf(id).map(([noteId]) => noteId),
        order: def.order,
        items: await Promise.all(this.store.itemsOf(id).map((relPath) => this.mapItem(relPath))),
        classes: await Promise.all(
          this.store.classesOf(id).map(([classId, classDef]) => this.mapClass(classId, classDef)),
        ),
      })),
    );
    const notes: MapNote[] = this.store.notes().map(([id, def]) => ({
      id,
      text: def.text,
      page: def.page,
      markerId: def.markerId,
      parentNote: def.parentNote,
      locked: def.locked === true ? true : undefined,
      icons: def.icons?.length ? def.icons.slice() : undefined,
      depth: this.store.noteDepthOf(id),
      subtreeHeight: this.store.noteSubtreeHeight(id),
      children: this.store.noteChildren(id).map(([childId]) => childId),
      order: def.order,
      color: this.noteColor(id),
    }));
    const pageId = this.pageIdFor(webview);
    if (restorePage) {
      this.persistSurfacePage(webview, pageId);
    }
    const page = this.store.page(pageId);
    const focusNoteId = this.focusNoteId;
    this.focusNoteId = undefined;
    const locale = normalizeLocale(this.store.appearance.language);
    await webview.postMessage({
      type: 'state',
      restorePage: restorePage || undefined,
      activePageId: restorePage ? pageId : undefined,
      pages,
      groups,
      notes,
      focusNoteId,
      maxPages: MAX_PAGES,
      layout: page?.layout ?? 'chips',
      groupsLayout: page?.groupsLayout ?? 'flow',
      appearance: this.store.appearance,
      locale,
      i18n: stringsFor(locale),
      profiles: this.store.profiles(),
      activeProfileId: this.store.activeProfileId,
      positionSync: this.store.positionSync(),
      active: this.activeRelPath(),
      ...this.tabSnapshot(),
      error: this.store.lastError,
      history: this.store.historySteps(),
      open: this.store.surfaceOpen(),
      surface: this.surfaceOf(webview),
      codeStamp: this.languages.getStamp() ?? null,
      themeGeneration: this.languages.getThemeGeneration(),
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

  /**
   * Workspace file in the editor. No editor (focus on the map) keeps the previous
   * file. An editor outside the workspace clears the blink.
   */
  private captureFocusedFile(editor: vscode.TextEditor | undefined): void {
    if (!editor) {
      return;
    }
    this.lastFocusedRel = this.store.toRelative(editor.document.uri);
  }

  /** Open editor tabs in the workspace, and the file whose corner should blink. */
  private tabSnapshot(): { openPaths: string[]; focusedPath?: string } {
    const openPaths: string[] = [];
    const seen = new Set<string>();
    for (const group of vscode.window.tabGroups.all) {
      for (const tab of group.tabs) {
        const uri = tabUri(tab);
        if (!uri) {
          continue;
        }
        const rel = this.store.toRelative(uri);
        if (!rel || seen.has(rel)) {
          continue;
        }
        seen.add(rel);
        openPaths.push(rel);
      }
    }
    if (this.lastFocusedRel && !seen.has(this.lastFocusedRel)) {
      this.lastFocusedRel = undefined;
    }
    return { openPaths, focusedPath: this.lastFocusedRel };
  }

  private postTabs(): void {
    if (!this.store.ready) {
      return;
    }
    const tabs = this.tabSnapshot();
    for (const webview of this.webviews) {
      if (!this.readyWebviews.has(webview)) {
        continue;
      }
      void webview.postMessage({ type: 'tabs', ...tabs });
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
    value?: string,
  ): Promise<void> {
    if (action === 'toggleBottom') {
      if (!(await this.toggleBottom())) {
        const reload = 'Reload Window';
        const choice = await vscode.window.showWarningMessage(
          'Syn3: вкладка в нижней панели ещё не зарегистрирована — нужна полная перезагрузка окна.',
          reload,
        );
        if (choice === reload) {
          await vscode.commands.executeCommand('workbench.action.reloadWindow');
        }
      }
      return;
    }
    if (action === 'toggleLeft') {
      await this.toggleColumn();
      return;
    }
    if (action === 'toggleRight') {
      await this.toggleRight();
      return;
    }
    const activePage = pageId && this.store.page(pageId) ? pageId : this.pageIdFor(webview);
    if (action === 'setLayout') {
      if (this.store.page(activePage)) {
        await this.store.updatePageView(activePage, { layout: normalizeMapLayout(value) });
      }
      return;
    }
    if (action === 'setGroupsLayout') {
      if (this.store.page(activePage)) {
        const next = normalizeGroupsLayout(value);
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
      const surface = this.surfaceOf(webview);
      const next: Record<string, boolean> = { ...page.collapsed[surface] };
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
      for (const [id] of this.store.rootNotes(activePage)) {
        if (this.store.isNoteLocked(id)) {
          continue;
        }
        if (collapsed) {
          next[id] = true;
        } else {
          delete next[id];
        }
      }
      await this.store.setPageCollapsed(activePage, surface, next);
      if (webview === this.lastFocusedWebview) {
        await this.syncTopCollapsedContext(this.allUnlockedTopCollapsed(activePage, next));
      }
      return;
    }
    if (action === 'createMarker') {
      await vscode.commands.executeCommand('syn3.createMarker', activePage);
      return;
    }
    if (action === 'createNote') {
      const id = await this.store.createNote({ page: activePage }, '');
      if (id) {
        this.focusNoteId = id;
        this.refresh();
      }
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
    if (action === 'refresh') {
      await vscode.commands.executeCommand('syn3.refresh');
      return;
    }
    if (action === 'openSettings') {
      await vscode.commands.executeCommand('syn3.openSettings');
    }
  }

  private async onProfile(
    action: 'activate' | 'create' | 'rename' | 'delete' | 'syncPush' | 'syncPull',
    id?: string,
    name?: string,
  ): Promise<void> {
    if (action === 'activate') {
      if (id) {
        await this.store.setActiveProfile(id);
        await this.syncOpenSurfacesIfNeeded(true);
      }
      return;
    }
    if (action === 'create') {
      const trimmed = (name ?? '').trim();
      if (!trimmed || !this.store.isValidProfileName(trimmed)) {
        return;
      }
      await this.store.createProfile(trimmed);
      return;
    }
    if (action === 'rename') {
      if (!id || id === GENERAL_PROFILE_ID) {
        return;
      }
      const current = this.store.profiles().find((p) => p.id === id);
      if (!current) {
        return;
      }
      const locale = normalizeLocale(this.store.appearance.language);
      const next = await vscode.window.showInputBox({
        title: t(locale, 'profileRenameTitle'),
        prompt: t(locale, 'profileRenamePrompt'),
        value: current.name,
        validateInput: (v) => {
          const trimmed = v.trim();
          if (!trimmed) {
            return t(locale, 'profileNameEmpty');
          }
          if (!this.store.isValidProfileName(trimmed, id)) {
            return t(locale, 'profileNameTaken');
          }
          return undefined;
        },
      });
      if (!next) {
        return;
      }
      await this.store.renameProfile(id, next);
      return;
    }
    if (action === 'delete') {
      if (!id || id === GENERAL_PROFILE_ID) {
        return;
      }
      const current = this.store.profiles().find((p) => p.id === id);
      if (!current) {
        return;
      }
      const locale = normalizeLocale(this.store.appearance.language);
      const deleteLabel = t(locale, 'profileDeleteAction');
      const confirm = await vscode.window.showWarningMessage(
        t(locale, 'profileDeleteConfirm', { name: current.name }),
        { modal: true },
        deleteLabel,
      );
      if (confirm !== deleteLabel) {
        return;
      }
      await this.store.deleteProfile(id);
      return;
    }
    if (action === 'syncPush') {
      await this.store.syncPositionsLocalToRemote();
      return;
    }
    if (action === 'syncPull') {
      await this.store.syncPositionsRemoteToLocal();
    }
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

  private async replyLinkPreview(
    webview: vscode.Webview,
    url: string,
    requestId: string,
  ): Promise<void> {
    const cached = this.linkPreviewCache.get(url);
    if (cached) {
      await webview.postMessage({
        type: 'previewLinkResult',
        requestId,
        url,
        ...cached,
      });
      return;
    }
    let inflight = this.linkPreviewInflight.get(url);
    if (!inflight) {
      inflight = this.fetchLinkPreview(url).finally(() => {
        this.linkPreviewInflight.delete(url);
      });
      this.linkPreviewInflight.set(url, inflight);
    }
    await inflight;
    const result = this.linkPreviewCache.get(url) ?? { empty: true as const };
    await webview.postMessage({
      type: 'previewLinkResult',
      requestId,
      url,
      ...result,
    });
  }

  private async fetchLinkPreview(url: string): Promise<void> {
    try {
      const parsed = vscode.Uri.parse(url);
      if (parsed.scheme !== 'http' && parsed.scheme !== 'https') {
        this.linkPreviewCache.set(url, { empty: true });
        return;
      }
      const html = await fetchTextLimited(url, 400_000, 8_000);
      if (!html) {
        this.linkPreviewCache.set(url, { empty: true });
        return;
      }
      const description =
        metaContent(html, 'og:description') || metaContent(html, 'description') || undefined;
      let imageUrl = metaContent(html, 'og:image') || undefined;
      if (imageUrl) {
        try {
          imageUrl = new URL(imageUrl, url).toString();
        } catch {
          imageUrl = undefined;
        }
      }
      let image: string | undefined;
      if (imageUrl) {
        image = await fetchImageDataUrl(imageUrl, 800_000, 8_000);
      }
      if (!image && !description) {
        this.linkPreviewCache.set(url, { empty: true });
        return;
      }
      this.linkPreviewCache.set(url, { image, description });
    } catch {
      this.linkPreviewCache.set(url, { empty: true });
    }
  }

  private toolIcon(webview: vscode.Webview, name: string, mode?: string, hidden = false): string {
    const light = webview.asWebviewUri(vscode.Uri.joinPath(this.media, 'icons', `${name}-light.svg`));
    const dark = webview.asWebviewUri(vscode.Uri.joinPath(this.media, 'icons', `${name}-dark.svg`));
    const modeAttr = mode ? ` data-mode="${mode}"` : '';
    const hiddenAttr = hidden ? ' hidden' : '';
    return `<img class="tool-icon tone-light" src="${light}" alt=""${modeAttr}${hiddenAttr}><img class="tool-icon tone-dark" src="${dark}" alt=""${modeAttr}${hiddenAttr}>`;
  }

  private html(webview: vscode.Webview, chrome: 'view' | 'panel', surface: MapSurface): string {
    const nonce = crypto.randomBytes(16).toString('base64');
    const css = webview.asWebviewUri(vscode.Uri.joinPath(this.media, 'map.css'));
    const js = webview.asWebviewUri(vscode.Uri.joinPath(this.media, 'map.js'));
    // Themed copies of assets/bill.svg / box-3-line.svg for fixed type icons.
    const noteIconLight = webview.asWebviewUri(vscode.Uri.joinPath(this.media, 'icons', 'bill-light.svg'));
    const noteIconDark = webview.asWebviewUri(vscode.Uri.joinPath(this.media, 'icons', 'bill-dark.svg'));
    const groupIconLight = webview.asWebviewUri(vscode.Uri.joinPath(this.media, 'icons', 'box-3-line-light.svg'));
    const groupIconDark = webview.asWebviewUri(vscode.Uri.joinPath(this.media, 'icons', 'box-3-line-dark.svg'));
    const icon = (name: string, mode?: string, hidden = false) => this.toolIcon(webview, name, mode, hidden);
    const sideAttr = surface === 'left' || surface === 'right' ? ` data-side="${surface}"` : '';
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${css}">
</head>
<body class="chrome-${chrome}" data-surface="${surface}"${sideAttr} data-note-icon-light="${noteIconLight}" data-note-icon-dark="${noteIconDark}" data-group-icon-light="${groupIconLight}" data-group-icon-dark="${groupIconDark}" data-vscode-context='{"preventDefaultContextMenuItems": true}'>
  <div class="history-bar">
    <div class="toolbar-profile">
      <button id="toolbar-profile" class="history-btn" type="button" aria-label="Профиль" aria-haspopup="menu" aria-expanded="false">
        ${icon('person')}
      </button>
      <div id="toolbar-profile-menu" class="toolbar-profile-menu" hidden role="menu" aria-label="Профили">
        <div id="toolbar-profile-list" class="toolbar-profile-list"></div>
        <div class="toolbar-profile-create">
          <input id="toolbar-profile-name" type="text" placeholder="Новый профиль" aria-label="Имя нового профиля" maxlength="64">
          <button id="toolbar-profile-add" class="history-btn" type="button" title="Создать профиль" aria-label="Создать профиль">
            ${icon('add')}
          </button>
        </div>
      </div>
    </div>
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
      <div class="toolbar-format" id="toolbar-format-wrap" hidden>
        <button id="toolbar-format" class="history-btn" type="button" title="Оформление текста" aria-label="Оформление текста" aria-haspopup="menu" aria-expanded="false">
          <span class="toolbar-format-label" aria-hidden="true">Aa</span>
        </button>
        <div id="toolbar-format-menu" class="toolbar-format-menu" hidden role="menu" aria-label="Оформление текста">
          <button type="button" data-fmt="bold" role="menuitem" title="Жирный" aria-label="Жирный"><span class="fmt-icon fmt-bold">B</span></button>
          <button type="button" data-fmt="color" role="menuitem" title="Цвет текста" aria-label="Цвет текста"><span class="fmt-icon fmt-color">A</span></button>
          <button type="button" data-fmt="code" role="menuitem" title="Блок кода" aria-label="Блок кода"><span class="fmt-icon fmt-code">&lt;/&gt;</span></button>
          <button type="button" data-fmt="quote" role="menuitem" title="Цитата" aria-label="Цитата"><span class="fmt-icon fmt-quote">”</span></button>
        </div>
      </div>
      <div class="toolbar-view">
        <button id="toolbar-view" class="history-btn" type="button" title="Вид" aria-label="Вид" aria-haspopup="menu" aria-expanded="false">
          ${icon('chevron-down')}
        </button>
        <div id="toolbar-view-menu" class="syn3-menu toolbar-view-menu" hidden role="menu" aria-label="Вид"></div>
      </div>
      <div class="toolbar-view toolbar-create">
        <button id="toolbar-create" class="history-btn" type="button" title="Создать" aria-label="Создать" aria-haspopup="menu" aria-expanded="false">
          ${icon('add')}
        </button>
        <div id="toolbar-create-menu" class="syn3-menu toolbar-view-menu" hidden role="menu" aria-label="Создать"></div>
      </div>
      <button id="toolbar-collapse" class="history-btn" type="button" title="Свернуть все группы" aria-label="Свернуть все группы">
        ${icon('collapse-all', 'collapse')}
        ${icon('expand-all', 'expand', true)}
      </button>
      <div class="toolbar-panels">
        <button id="toolbar-panels" class="history-btn" type="button" title="Toggle panels" aria-label="Toggle panels" aria-haspopup="true" aria-expanded="false">
          ${icon('menu')}
        </button>
        <div id="toolbar-panels-menu" class="toolbar-panels-menu" hidden role="group" aria-label="Panel toggles">
          <button type="button" id="panel-toggle-bottom" class="history-btn" data-action="toggleBottom" title="Toggle bottom panel" aria-label="Toggle bottom panel" aria-pressed="false">
            ${icon('layout-panel')}
          </button>
          <button type="button" id="panel-toggle-left" class="history-btn" data-action="toggleLeft" title="Toggle left sidebar" aria-label="Toggle left sidebar" aria-pressed="false">
            ${icon('layout-sidebar-left')}
          </button>
          <button type="button" id="panel-toggle-right" class="history-btn" data-action="toggleRight" title="Toggle right sidebar" aria-label="Toggle right sidebar" aria-pressed="false">
            ${icon('sidebar-right')}
          </button>
        </div>
      </div>
      <div class="toolbar-more">
        <button id="toolbar-more" class="history-btn" type="button" title="Дополнительные действия" aria-label="Дополнительные действия" aria-haspopup="menu">
          ${icon('ellipsis')}
        </button>
        <div id="toolbar-menu" class="toolbar-menu" hidden role="menu">
          <button type="button" data-action="createPage" role="menuitem" id="menu-create-page">${icon('add')}New Page</button>
          <button type="button" data-action="renamePage" role="menuitem">${icon('list-flat')}Rename Page</button>
          <button type="button" data-action="deletePage" role="menuitem" id="menu-delete-page">${icon('ellipsis')}Delete Page</button>
          <button type="button" data-action="refresh" role="menuitem">${icon('refresh')}Refresh</button>
          <button type="button" data-action="openSettings" role="menuitem">${icon('gear')}Settings</button>
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
