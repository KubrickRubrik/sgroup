import * as crypto from 'crypto';
import * as path from 'path';
import * as vscode from 'vscode';
import { CodeLanguageService, CodeStamp } from './codeLanguage';
import { DirtyPathWatcher } from './gitDirty';
import {
  Appearance,
  ColumnsMode,
  GENERAL_PROFILE_ID,
  GroupsLayout,
  MapLayout,
  MapSurface,
  MAX_MARKER_DEPTH,
  MAX_PAGES,
  MarkerStore,
  NOTE_ROOT_COLOR,
  PageKind,
  normalizeColumns,
  normalizeGroupsLayout,
  normalizeMapLayout,
  normalizePageKind,
  snapReviewRefreshSec,
} from './markerStore';
import { normalizeLocale, stringsFor, t } from './i18n';
import { instructionPageHtml, instructionTitle } from './instructionPreview';
import { openClassAt } from './openClass';
import { LINK_PALETTE, LINK_PALETTE_DEFAULT, randomLinkPaletteColor } from './linkPalette';
import { cssColor, normalizeHex, PALETTE } from './palette';
import { postChannelMessage, ReviewChipStatus } from './discordApi';
import {
  ensureSetupProbe,
  isValidChannelId,
  reviewChannelConflicts,
  setupHelloText,
  type SetupChannelKind,
} from './discordSetup';
import { ReviewDepth, ReviewKind } from './reviewPending';
import { ReviewLoadEdge, ReviewMapController, ReviewPageState } from './reviewMap';
import {
  createRepositoryTokenKey,
  deleteFigmaToken,
  deleteProfileHostToken,
  deleteRepositoryToken,
  getSecret,
  readFigmaToken,
  readProfileHostToken,
  readRepositoryToken,
  SECRET_DISCORD,
  secretsStatus,
  storeSecrets,
  writeFigmaToken,
  writeRepositoryToken,
  writeProfileHostToken,
} from './accessStore';
import { figmaLinkPreviewEnabled, figmaPreviewCacheKey, loadFigmaPreview, parseFigmaFrame } from './figmaLink';
import { isReviewHostProvider, ReviewHostProvider, ReviewMr } from './reviewHost';
import { listProjectDirectory } from './projectNav';
import type { CatalogChannels } from './configFormat';

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
  /** Short description shown after a dwell on the group name. */
  description?: string;
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
  description?: string;
  kind: PageKind;
  layout: MapLayout;
  groupsLayout: GroupsLayout;
  collapsed: Record<string, boolean>;
}

/** Groups, notes, and links of a single map page. */
interface PageBody {
  groups: MapGroup[];
  notes: MapNote[];
  links: MapLink[];
}

interface MapLink {
  id: string;
  label: string;
  description?: string;
  url?: string;
  parent?: string;
  page?: string;
  locked?: true;
  depth: number;
  subtreeHeight: number;
  children: string[];
  order: number;
  /** Resolved CSS color from the branch root. */
  color: string;
  /** Stored color id / hex for the settings panel (roots only). */
  colorId?: string;
  /** True when this is the only root layout on its page. */
  lastRoot?: true;
  /** True when delete is allowed. */
  canDelete: boolean;
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
  | 'createLinkLayout'
  | 'collapseGroups'
  | 'expandGroups'
  | 'refresh'
  | 'openSettings'
  | 'createPage'
  | 'createPageFiles'
  | 'createPageNotes'
  | 'createPageLinks'
  | 'createPageReview'
  | 'createMr'
  | 'pullMr'
  | 'renamePage'
  | 'deletePage'
  | 'toggleBottom'
  | 'toggleLeft'
  | 'toggleRight'
  | 'toggleExplorer';

type ColumnSide = 'left' | 'right';

type IncomingMessage =
  | { type: 'ready'; pageId?: string; rev?: string }
  | { type: 'assetsFailed'; rev?: string }
  | { type: 'activePage'; pageId: string }
  | { type: 'mapFocus'; pageId?: string }
  | { type: 'open'; relPath: string }
  | {
      type: 'openAt';
      relPath: string;
      line: number;
      character: number;
      endLine: number;
      endCharacter: number;
    }
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
  | {
      type: 'setColor';
      markerId?: string;
      noteId?: string;
      /** Hex or theme id; omit or empty with `clear: true` to remove color. */
      color?: string;
      clear?: boolean;
    }
  | {
      type: 'createGroup';
      label: string;
      alias?: string;
      description?: string;
      locked?: boolean;
      /** Hex color; omit when `clearColor` or when host should pick random. */
      color?: string;
      clearColor?: boolean;
      randomColor?: boolean;
      parentId?: string;
      pageId?: string;
      requestId?: string;
      columns?: string;
    }
  | { type: 'cancelGroupDraft'; requestId?: string }
  | {
      type: 'updateGroup';
      markerId: string;
      label?: string;
      alias?: string | null;
      description?: string | null;
    }
  | { type: 'deleteLinkLift'; linkId: string }
  | {
      type: 'moveItem';
      relPath: string;
      from: string;
      to: string;
      copy?: boolean;
      blockOrder?: string[];
    }
  | {
      type: 'moveClass';
      classId: string;
      from: string;
      to: string;
      copy?: boolean;
      blockOrder?: string[];
    }
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
  | { type: 'openEntityLink'; url: string }
  | { type: 'stripEntityLink'; noteId: string; url: string }
  | { type: 'clearLinkUrl'; linkId: string }
  | { type: 'toggleNoteLock'; noteId: string }
  | { type: 'toggleLinkLock'; linkId: string }
  | { type: 'setFocus'; kind: 'marker' | 'note'; id: string }
  | {
      type: 'createLinkLayout';
      pageId: string;
    }
  | { type: 'createLinkChild'; parentId: string }
  | {
      type: 'updateLink';
      linkId: string;
      label?: string;
      description?: string | null;
      url?: string | null;
      color?: string;
    }
  | { type: 'deleteLink'; linkId: string }
  | {
      type: 'placeLink';
      id: string;
      targetId: string;
      position: 'before' | 'after';
      copy?: boolean;
    }
  | { type: 'nestLink'; id: string; parentId: string; copy?: boolean }
  | { type: 'unnestLink'; id: string }
  | { type: 'openLinkUrl'; url: string }
  | { type: 'confirmOpenLinkUrl'; url: string }
  | {
      type: 'profile';
      action: 'activate' | 'create' | 'rename' | 'delete' | 'syncPush' | 'syncPull';
      id?: string;
      name?: string;
    }
  | {
      type: 'project';
      action: 'select' | 'create' | 'createSubmit' | 'selectSubmit' | 'syncPush' | 'syncPull' | 'join';
      id?: string;
      name?: string;
      channelId?: string;
      discordToken?: string;
      mode?: 'create' | 'select';
      repoUrl?: string;
      repoProvider?: 'github' | 'gitlab';
    }
  | { type: 'pageCloud'; action: 'push' | 'pull'; pageId: string }
  | { type: 'pageCloud'; action: 'pushAll' }
  | { type: 'pageCloud'; action: 'pullAll' }
  | { type: 'pageCloud'; action: 'check' }
  | { type: 'debugDiff' }
  | { type: 'workspaceCloud'; action: 'push' | 'pull' }
  | { type: 'setPagesFixed'; fixed: boolean }
  | { type: 'profileOpenSettings'; id?: string }
  | {
      type: 'profileSaveSettings';
      id?: string;
      name: string;
      githubNick: string;
      gitlabNick: string;
      githubToken: string;
      gitlabToken: string;
    }
  | { type: 'setAppearance'; appearance: Partial<Appearance> }
  | { type: 'reviewLoad'; pageId: string; force?: boolean }
  | { type: 'reviewLoadOlder'; pageId: string }
  | { type: 'reviewLoadNewer'; pageId: string }
  | { type: 'reviewLoadThread'; pageId: string; messageId: string }
  | { type: 'reviewExpandPlain'; pageId: string; messageId: string }
  | { type: 'reviewOpenPromptExample' }
  | { type: 'reviewClearFocus'; pageId: string }
  | {
      type: 'reviewCreateMr';
      pageId: string;
      title: string;
      draft: boolean;
      targetBranch: string;
      reviewers: string[];
      assignees: string[];
      squash: boolean;
    }
  | {
      type: 'reviewUpdateMr';
      pageId: string;
      messageId: string;
      title?: string;
      draft?: boolean;
      color?: string;
    }
  | { type: 'reviewCloseMr'; pageId: string; messageId: string }
  | { type: 'reviewSetLock'; pageId: string; messageId: string; locked: boolean }
  | { type: 'reviewDeleteReview'; pageId: string; messageId: string }
  | {
      type: 'reviewSetStatus';
      pageId: string;
      messageId: string;
      status: ReviewChipStatus;
    }
  | { type: 'reviewDiscordRefresh'; pageId: string; webUrl: string; sourceBranch: string }
  | {
      type: 'reviewStart';
      pageId: string;
      messageId: string;
      kind: ReviewKind;
      depth?: ReviewDepth;
    }
  | {
      type: 'reviewStartRoot';
      pageId: string;
      kind: ReviewKind;
      depth?: ReviewDepth;
    }
  | { type: 'reviewRetryFile'; pageId: string; messageId: string }
  | { type: 'reviewOpenFile'; pageId: string; messageId: string }
  | { type: 'reviewOpenFileTab'; pageId: string; messageId: string }
  | {
      type: 'reviewCreatePage';
      name: string;
      provider: ReviewHostProvider;
      channelId: string;
      repoUrl: string;
      description?: string;
      gitlabToken?: string;
      githubToken?: string;
      discordToken?: string;
    }
  | { type: 'reviewOpenPageSettings'; pageId: string }
  | { type: 'pageOpenSettings'; pageId: string }
  | {
      type: 'pageSaveSettings';
      pageId?: string;
      kind?: PageKind;
      name: string;
      description?: string;
      channelId?: string;
      discordToken?: string;
      figmaToken?: string;
    }
  | {
      type: 'reviewUpdatePage';
      pageId: string;
      name: string;
      provider: ReviewHostProvider;
      channelId: string;
      repoUrl: string;
      description?: string;
      gitlabToken?: string;
      githubToken?: string;
      discordToken?: string;
    }
  | { type: 'reviewOpenSetupDoc' }
  | { type: 'discordGateOpenHowTo' }
  | {
      type: 'setReviewPaths';
      reviewSkillPath?: string;
      reviewDirPath?: string;
      reviewModel?: string;
      reviewFixModel?: string;
    }
  | {
      type: 'reviewNeurofix';
      pageId: string;
      messageId: string;
      scope: string;
      itemIndex?: number;
    }
  | { type: 'listProjectDir'; seq: number; rel?: string }
  | {
      type: 'discordGateSave';
      profile: string;
      explorer: string;
      notes: string;
      links: string;
      review: string;
      discordToken?: string;
      dirty: SetupChannelKind[];
    };

interface DirListingEntry {
  name: string;
  relPath: string;
  isDir: boolean;
}

/** One diagnostic for the Problems tab / map error marks. Positions are 0-based. */
interface ProblemDiag {
  relPath: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
  line: number;
  character: number;
  endLine: number;
  endCharacter: number;
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

function sniffImageMime(buffer: Buffer): string | undefined {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer.toString('ascii', 1, 4) === 'PNG') {
    return 'image/png';
  }
  if (
    buffer.length >= 6 &&
    (buffer.toString('ascii', 0, 6) === 'GIF87a' || buffer.toString('ascii', 0, 6) === 'GIF89a')
  ) {
    return 'image/gif';
  }
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return undefined;
}

async function fetchImageDataUrl(
  url: string,
  maxBytes: number,
  timeoutMs: number,
): Promise<string | undefined> {
  const result = await downloadPreviewImage(url, maxBytes, timeoutMs);
  return 'dataUrl' in result ? result.dataUrl : undefined;
}

async function downloadPreviewImage(
  url: string,
  maxBytes: number,
  timeoutMs: number,
): Promise<{ dataUrl: string } | { tooBig: true } | { failed: true }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
    });
    if (!response.ok) {
      return { failed: true };
    }
    const headerMime = (response.headers.get('content-type') || '').split(';')[0].trim();
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength === 0) {
      return { failed: true };
    }
    if (buffer.byteLength > maxBytes) {
      return { tooBig: true };
    }
    const mime = sniffImageMime(buffer) || (headerMime.startsWith('image/') ? headerMime : undefined);
    if (!mime) {
      return { failed: true };
    }
    return { dataUrl: `data:${mime};base64,${buffer.toString('base64')}` };
  } catch {
    return { failed: true };
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
  private readonly chromeByWebview = new WeakMap<vscode.Webview, 'view' | 'panel'>();
  /** Document generation. Messages from a replaced document are ignored. */
  private readonly htmlRevByWebview = new Map<vscode.Webview, string>();
  private readonly htmlMountedAt = new Map<vscode.Webview, number>();
  /** How many times css/js were loaded again after a failed boot. */
  private readonly assetRetries = new Map<vscode.Webview, number>();
  private readonly assetRetryTimers = new Map<vscode.Webview, ReturnType<typeof setTimeout>>();
  /** Short retry already queued. The 8s watch uses the same timer map without this flag. */
  private readonly assetRetrySoon = new Set<vscode.Webview>();
  /** Failed while the view was hidden; load again on the next show. */
  private readonly assetRetryOnShow = new Set<vscode.Webview>();
  private static readonly assetRetryLimit = 3;
  /** First state after load should open the page saved for this surface. */
  private readonly needsPageRestore = new WeakSet<vscode.Webview>();
  private readonly subscriptions: vscode.Disposable[];
  private readonly media: vscode.Uri;
  private leftPanel?: vscode.WebviewPanel;
  private rightPanel?: vscode.WebviewPanel;
  private explorerView?: vscode.WebviewView;
  private bottomView?: vscode.WebviewView;
  private lastEditorColumn?: vscode.ViewColumn;
  /** Rendered setup docs, one tab per file. */
  private readonly instructionPanels = new Map<string, vscode.WebviewPanel>();
  /** In-memory link preview cache. Figma keys also include a token stamp. */
  private readonly linkPreviewCache = new Map<
    string,
    { image?: string; description?: string; empty?: true }
  >();
  private readonly linkPreviewInflight = new Map<
    string,
    Promise<{ image?: string; description?: string; empty?: true } | undefined>
  >();
  /** Workspace file that last had the editor. Kept when focus moves to the map. */
  private lastFocusedRel?: string;
  /** Webview that last talked to the host — drives view-title layout/collapse. */
  private lastFocusedWebview?: vscode.Webview;
  /** Batch push/pull of page configs is in flight. */
  private pageCloudBatch = false;
  private baseConfigBatch = false;
  /** Explorer «New marker» draft: resolve with created id or undefined on cancel. */
  private readonly pendingGroupDrafts = new Map<
    string,
    { resolve: (id: string | undefined) => void; webview: vscode.Webview }
  >();
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
  /** Active project and its review channel. A change drops the review window. */
  private reviewProjectKey = '';
  private readonly languages: CodeLanguageService;
  private readonly ownsLanguages: boolean;
  /** On-disk uncommitted paths from the built-in Git extension. */
  private dirtyPaths: string[] = [];
  private readonly dirtyWatcher: DirtyPathWatcher;
  /** Workspace Error diagnostics, pushed like dirty paths. */
  private problems: ProblemDiag[] = [];
  private problemsTimer: ReturnType<typeof setTimeout> | undefined;
  private problemsKey = '';
  /**
   * Bumped on every store change. Page payloads for the same generation are built once
   * and shared by every open map, so several panels do not stat the same files twice.
   */
  private bodyGen = 0;
  private readonly bodyCache = new Map<string, PageBody>();
  private readonly bodyFlight = new Map<string, Promise<PageBody>>();
  /** Latest state push per webview. An older in-flight push must not land after it. */
  private readonly stateSeq = new WeakMap<vscode.Webview, number>();
  /** Coalesces refresh bursts and lets the caller finish switching the active page first. */
  private readonly stateDelay = new Map<vscode.Webview, ReturnType<typeof setTimeout>>();
  private readonly review: ReviewMapController;
  private readonly hostSecrets: vscode.SecretStorage;
  /** MR waiting for Discord retry after a failed post. */
  private pendingDiscordMr?: { pageId: string; mr: ReviewMr };
  /** Per-webview interval for review page Discord poll. */
  private readonly reviewRefreshTimers = new Map<vscode.Webview, ReturnType<typeof setInterval>>();
  /** Workspace-wide auto-fetch for project lock and content checks. */
  private projectFetchTimer: ReturnType<typeof setInterval> | undefined;
  private filesFetchTimer: ReturnType<typeof setInterval> | undefined;
  private notesFetchTimer: ReturnType<typeof setInterval> | undefined;
  private linksFetchTimer: ReturnType<typeof setInterval> | undefined;
  private syncFetchKey = '';

  constructor(
    private readonly store: MarkerStore,
    private readonly extensionUri: vscode.Uri,
    private readonly memento: vscode.Memento,
    private readonly workspaceState: vscode.Memento,
    languages?: CodeLanguageService,
    secrets?: vscode.SecretStorage,
  ) {
    this.media = vscode.Uri.joinPath(extensionUri, 'media');
    this.ownsLanguages = !languages;
    this.languages = languages ?? new CodeLanguageService(extensionUri.fsPath);
    this.hostSecrets = secrets ?? {
      get: async () => undefined,
      store: async () => undefined,
      delete: async () => undefined,
      onDidChange: () => ({ dispose() {} }),
    };
    this.review = new ReviewMapController(
      store.root,
      this.hostSecrets,
      () => {
        const paths = this.store.activeReviewPaths();
        const nicks = this.store.activeGitNicks();
        return {
          ...paths,
          profileId: this.store.activeProfileId,
          profileName: this.store.activeProfileName,
          githubNick: nicks.githubNick,
          gitlabNick: nicks.gitlabNick,
          repositoryTokenKey: this.store.repositoryTokenKey(this.store.activeProfileId) || '',
        };
      },
    );
    this.lastEditorColumn = vscode.window.activeTextEditor?.viewColumn;
    this.lastFocusedRel = this.activeRelPath();
    this.dirtyWatcher = new DirtyPathWatcher(store, (paths) => {
      this.dirtyPaths = paths;
      this.postChanges();
    });
    this.dirtyPaths = this.dirtyWatcher.snapshot();
    this.problems = this.collectProblems();
    this.problemsKey = this.problemSignature(this.problems);
    this.subscriptions = [
      ...(this.ownsLanguages ? [this.languages] : []),
      this.dirtyWatcher,
      this.languages.onDidChangeStamp((stamp) => this.postCodeStamp(stamp)),
      this.languages.onDidChangeTheme(() => this.postThemeGeneration()),
      vscode.languages.onDidChangeDiagnostics(() => this.scheduleProblems()),
      store.onDidChange(() => {
        if (this.store.isSurfaceOnlyChange()) {
          // Active page changed. The body built for this generation is still valid.
          this.scheduleAll();
        } else {
          this.refresh();
        }
        this.postOpenFlags();
        void this.syncOpenSurfacesIfNeeded();
        this.armSyncFetchTimersIfNeeded();
        void this.reloadReviewOnProjectChange();
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

  /** Shared access.json store used by review pages and Discord config sync. */
  reviewAccessStore() {
    return this.review.accessStore();
  }

  dispose(): void {
    if (this.problemsTimer) {
      clearTimeout(this.problemsTimer);
    }
    for (const timer of this.stateDelay.values()) {
      clearTimeout(timer);
    }
    this.stateDelay.clear();
    for (const timer of this.reviewRefreshTimers.values()) {
      clearInterval(timer);
    }
    this.reviewRefreshTimers.clear();
    this.clearSyncFetchTimers();
    for (const timer of this.assetRetryTimers.values()) {
      clearTimeout(timer);
    }
    this.assetRetryTimers.clear();
    this.assetRetrySoon.clear();
    this.assetRetryOnShow.clear();
    this.subscriptions.forEach((s) => s.dispose());
    for (const panel of this.instructionPanels.values()) {
      panel.dispose();
    }
    this.instructionPanels.clear();
  }

  private clearReviewRefresh(webview: vscode.Webview): void {
    const timer = this.reviewRefreshTimers.get(webview);
    if (timer) {
      clearInterval(timer);
      this.reviewRefreshTimers.delete(webview);
    }
  }

  private armReviewRefresh(webview: vscode.Webview): void {
    this.clearReviewRefresh(webview);
    if (!this.readyWebviews.has(webview) || !this.webviews.has(webview)) {
      return;
    }
    const pageId = this.pageIdFor(webview);
    if (this.store.page(pageId)?.kind !== 'review') {
      return;
    }
    const sec = snapReviewRefreshSec(this.store.appearance.reviewRefreshSec);
    const timer = setInterval(() => {
      void this.tickReviewRefresh(webview);
    }, sec * 1000);
    this.reviewRefreshTimers.set(webview, timer);
  }

  private rearmAllReviewRefresh(): void {
    for (const webview of this.webviews) {
      this.armReviewRefresh(webview);
    }
  }

  private async tickReviewRefresh(webview: vscode.Webview): Promise<void> {
    if (!this.webviews.has(webview) || !this.readyWebviews.has(webview)) {
      this.clearReviewRefresh(webview);
      return;
    }
    const pageId = this.pageIdFor(webview);
    if (this.store.page(pageId)?.kind !== 'review') {
      this.clearReviewRefresh(webview);
      return;
    }
    await this.pushReviewState(webview, await this.review.pollRefresh(pageId));
  }

  private clearSyncFetchTimers(): void {
    if (this.projectFetchTimer) {
      clearInterval(this.projectFetchTimer);
      this.projectFetchTimer = undefined;
    }
    if (this.filesFetchTimer) {
      clearInterval(this.filesFetchTimer);
      this.filesFetchTimer = undefined;
    }
    if (this.notesFetchTimer) {
      clearInterval(this.notesFetchTimer);
      this.notesFetchTimer = undefined;
    }
    if (this.linksFetchTimer) {
      clearInterval(this.linksFetchTimer);
      this.linksFetchTimer = undefined;
    }
  }

  /** Arm workspace auto-fetch for lock + content checks from profile appearance. */
  armSyncFetchTimers(): void {
    this.clearSyncFetchTimers();
    if (!this.store.ready) {
      this.syncFetchKey = '';
      return;
    }
    const appearance = this.store.appearance;
    const projectSec = snapReviewRefreshSec(appearance.projectFetchSec);
    const filesSec = snapReviewRefreshSec(appearance.filesFetchSec);
    const notesSec = snapReviewRefreshSec(appearance.notesFetchSec);
    const linksSec = snapReviewRefreshSec(appearance.linksFetchSec);
    this.syncFetchKey = `${projectSec}:${filesSec}:${notesSec}:${linksSec}`;
    this.projectFetchTimer = setInterval(() => {
      void this.store.fetchBaseLockOnly();
    }, projectSec * 1000);
    this.filesFetchTimer = setInterval(() => {
      void this.store.checkCloud();
    }, filesSec * 1000);
    this.notesFetchTimer = setInterval(() => {
      void this.store.checkCloud();
    }, notesSec * 1000);
    this.linksFetchTimer = setInterval(() => {
      void this.store.checkCloud();
    }, linksSec * 1000);
  }

  private armSyncFetchTimersIfNeeded(): void {
    if (!this.store.ready) {
      return;
    }
    const appearance = this.store.appearance;
    const key = [
      snapReviewRefreshSec(appearance.projectFetchSec),
      snapReviewRefreshSec(appearance.filesFetchSec),
      snapReviewRefreshSec(appearance.notesFetchSec),
      snapReviewRefreshSec(appearance.linksFetchSec),
    ].join(':');
    if (key !== this.syncFetchKey) {
      this.armSyncFetchTimers();
    }
  }

  // ---- section inside Explorer ----

  resolveWebviewView(view: vscode.WebviewView): void {
    const surface: MapSurface = view.viewType === MarkersMapProvider.bottomViewId ? 'bottom' : 'explorer';
    if (surface === 'bottom') {
      this.bottomView = view;
    } else {
      this.explorerView = view;
    }
    const webview = view.webview;
    this.attach(webview, 'view', surface);
    view.onDidChangeVisibility(() => {
      if (!view.visible) {
        return;
      }
      this.onSurfaceVisible(webview);
      void this.postState(webview);
      // User selected the Syn3 tab. Switching to Terminal leaves this false.
      if (surface === 'bottom' && this.store.ready && !this.applyingBottom) {
        void this.store.setSurfaceOpen('bottom', true);
      }
      if (this.store.ready) {
        void this.postDiscordGate(webview);
      }
    });
    view.onDidDispose(() => {
      this.clearReviewRefresh(webview);
      this.clearAssetWatch(webview);
      this.webviews.delete(webview);
      if (this.bottomView === view) {
        this.bottomView = undefined;
      }
      if (this.explorerView === view) {
        this.explorerView = undefined;
      }
    });
  }

  /** Close map columns after `.syn3` is removed. Does not write config. */
  async releaseSurfaces(): Promise<void> {
    this.surfacesBootstrapped = false;
    this.clearSyncFetchTimers();
    for (const timer of this.reviewRefreshTimers.values()) {
      clearInterval(timer);
    }
    this.reviewRefreshTimers.clear();
    try {
      if (this.leftPanel) {
        await this.closeColumn('left');
      }
      if (this.rightPanel) {
        await this.closeColumn('right');
      }
    } catch {
      // The column is already gone.
    }
    await this.hideBottomTab();
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
    for (const [id] of this.store.rootLinks(pageId)) {
      if (this.store.isLinkLocked(id)) {
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

  /** Collapse state of unlocked top-level groups, root notes, and link layouts that can fold. */
  private allUnlockedTopCollapsed(pageId: string, collapsed?: Record<string, boolean>): boolean {
    const flags = collapsed ?? this.store.page(pageId)?.collapsed[this.focusedSurface()] ?? {};
    const tops = this.store
      .markers()
      .filter(([id, def]) => !def.parent && this.store.pageOf(id) === pageId && !this.store.isLocked(id));
    const noteTops = this.store
      .rootNotes(pageId)
      .filter(([id]) => !this.store.isNoteLocked(id));
    const linkTops = this.store
      .rootLinks(pageId)
      .filter(([id]) => !this.store.isLinkLocked(id));
    const all = [
      ...tops.map(([id]) => id),
      ...noteTops.map(([id]) => id),
      ...linkTops.map(([id]) => id),
    ];
    return all.length > 0 && all.every((id) => !!flags[id]);
  }

  private async openLinkUrl(url: string): Promise<void> {
    try {
      const uri = vscode.Uri.parse(url);
      if (uri.scheme !== 'http' && uri.scheme !== 'https') {
        return;
      }
      if (this.store.appearance.openLinksInCursor) {
        await vscode.commands.executeCommand('simpleBrowser.show', uri.toString(true));
        return;
      }
      await vscode.env.openExternal(uri);
    } catch {
      // ignore bad urls
    }
  }

  private refuseLinkLocked(linkId: string): boolean {
    if (!this.store.isLinkLocked(linkId)) {
      return false;
    }
    void vscode.window.showWarningMessage('Syn3: макет закрыт');
    return true;
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

  private formatCloudFailures(message: string): string {
    const locale = normalizeLocale(this.store.appearance.language);
    return message
      .split('\n')
      .map((line) => {
        const split = line.indexOf('\t');
        if (split < 0) {
          return line === 'cloudPullFirst' ? t(locale, 'cloudPullFirst') : line;
        }
        const name = line.slice(0, split);
        const code = line.slice(split + 1);
        const detail = code === 'cloudPullFirst' ? t(locale, 'cloudPullFirst') : code;
        return `${name}: ${detail}`;
      })
      .join('; ');
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
    this.bodyGen++;
    this.bodyCache.clear();
    this.scheduleAll();
  }

  /** Push current pages without dropping a body built for this generation. */
  private scheduleAll(): void {
    for (const webview of this.webviews) {
      this.scheduleState(webview);
    }
    if (this.store.ready) {
      void this.syncFocusContext();
    }
  }

  /**
   * Push on the next turn so a page switch that happens in the same call
   * (create/delete page updates the hint after `commit` notifies) is the one we build.
   * Repeated calls collapse into a single push.
   */
  private scheduleState(webview: vscode.Webview): void {
    if (!this.webviews.has(webview)) {
      return;
    }
    const pending = this.stateDelay.get(webview);
    if (pending) {
      clearTimeout(pending);
    }
    this.stateDelay.set(
      webview,
      setTimeout(() => {
        this.stateDelay.delete(webview);
        void this.postState(webview);
      }, 0),
    );
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
   * Open the in-map group draft panel and wait for Enter (create) or cancel.
   * Used by Explorer «New marker…» and command-palette create flows.
   */
  async promptCreateGroup(options?: {
    parentId?: string;
    pageId?: string;
  }): Promise<string | undefined> {
    await this.ensureMapWebview();
    const webview = this.lastFocusedWebview;
    if (!webview) {
      return undefined;
    }
    const requestId = crypto.randomBytes(8).toString('hex');
    const pageId =
      options?.parentId === undefined
        ? options?.pageId && this.store.page(options.pageId)
          ? options.pageId
          : this.store.defaultFilesPageId()
        : undefined;
    if (pageId) {
      this.activePageByWebview.set(webview, pageId);
      void webview.postMessage({ type: 'openPage', pageId });
    }
    return new Promise<string | undefined>((resolve) => {
      this.pendingGroupDrafts.set(requestId, { resolve, webview });
      void webview.postMessage({
        type: 'openGroupDraft',
        requestId,
        parentId: options?.parentId,
        pageId,
      });
    });
  }

  /** True when there is no base channel yet (empty start: create or connect a project). */
  async needsDiscordGate(): Promise<boolean> {
    if (!this.store.ready) {
      return false;
    }
    return !this.store.baseChannelId().trim();
  }

  /** Focus a visible map webview; returns false when none is visible. */
  async focusVisibleMapForGate(): Promise<boolean> {
    if (this.explorerView?.visible) {
      try {
        await vscode.commands.executeCommand(`${MarkersMapProvider.viewId}.focus`);
        return true;
      } catch {
        // View may be missing until reload.
      }
    }
    if (this.bottomView?.visible) {
      try {
        await vscode.commands.executeCommand(`${MarkersMapProvider.bottomViewId}.focus`);
        return true;
      } catch {
        // Bottom view may be unregistered until reload.
      }
    }
    for (const panel of [this.leftPanel, this.rightPanel]) {
      if (!panel?.visible) {
        continue;
      }
      panel.reveal(panel.viewColumn, false);
      return true;
    }
    return false;
  }

  async refuseIfDiscordGate(): Promise<boolean> {
    if (!(await this.needsDiscordGate())) {
      return false;
    }
    if (await this.focusVisibleMapForGate()) {
      await this.pushDiscordGateToVisible();
      return true;
    }
    const locale = normalizeLocale(this.store.appearance.language);
    void vscode.window.showInformationMessage(`Syn3: ${t(locale, 'discordGateOpenMap')}`);
    return true;
  }

  private async pushDiscordGateToVisible(): Promise<void> {
    for (const webview of this.webviews) {
      if (!this.readyWebviews.has(webview)) {
        continue;
      }
      await this.postDiscordGate(webview);
    }
  }

  private async postDiscordGate(webview: vscode.Webview): Promise<void> {
    if (!this.webviews.has(webview) || !this.readyWebviews.has(webview) || !this.store.ready) {
      return;
    }
    if (!(await this.needsDiscordGate())) {
      await webview.postMessage({ type: 'discordGateClear' });
      return;
    }
    const status = await secretsStatus(this.hostSecrets);
    const locale = normalizeLocale(this.store.appearance.language);
    await webview.postMessage({
      type: 'projectCreatePanel',
      needChannel: true,
      hasDiscord: status.hasDiscord,
      mode: 'create',
      gate: true,
      locale,
      i18n: stringsFor(locale),
    });
  }

  private async onDiscordGateSave(
    webview: vscode.Webview,
    message: {
      profile: string;
      explorer: string;
      notes: string;
      links: string;
      review: string;
      discordToken?: string;
      dirty: SetupChannelKind[];
    },
  ): Promise<void> {
    const locale = normalizeLocale(this.store.appearance.language);
    const fail = async (field: SetupChannelKind | 'token', text: string) => {
      await webview.postMessage({ type: 'discordGateError', field, message: text });
    };

    const profile = (message.profile || '').trim();
    const explorer = (message.explorer || '').trim();
    const notes = (message.notes || '').trim();
    const links = (message.links || '').trim();
    const review = (message.review || '').trim();
    const dirty = new Set(
      (Array.isArray(message.dirty) ? message.dirty : []).filter(
        (kind): kind is SetupChannelKind =>
          kind === 'profile' ||
          kind === 'explorer' ||
          kind === 'notes' ||
          kind === 'links' ||
          kind === 'review',
      ),
    );

    if (!profile || !isValidChannelId(profile)) {
      await fail('profile', t(locale, 'reviewFieldChannelId'));
      return;
    }
    for (const [kind, value] of [
      ['explorer', explorer],
      ['notes', notes],
      ['links', links],
      ['review', review],
    ] as const) {
      if (value && !isValidChannelId(value)) {
        await fail(kind, t(locale, 'reviewFieldChannelId'));
        return;
      }
    }
    if (review && reviewChannelConflicts(review, { profile, explorer, notes, links })) {
      await fail('review', t(locale, 'channelReviewMustBeDistinct'));
      return;
    }

    const newToken = (message.discordToken || '').trim();
    if (newToken) {
      await storeSecrets(this.hostSecrets, { discord: newToken });
    }
    const token =
      newToken || (await getSecret(this.hostSecrets, SECRET_DISCORD)) || '';
    if (!token) {
      await fail('token', t(locale, 'reviewFieldDiscordToken'));
      return;
    }

    const effective: CatalogChannels = {
      profile,
      ...(explorer ? { explorer } : {}),
      ...(notes ? { notes } : {}),
      ...(links ? { links } : {}),
      ...(review ? { review } : {}),
    };
    // Profile always: gate closes only when the profile channel answers.
    // Optional channels: only when edited in this form and non-empty.
    const toProbe: SetupChannelKind[] = ['profile'];
    for (const kind of ['explorer', 'notes', 'links', 'review'] as const) {
      if (!dirty.has(kind)) {
        continue;
      }
      if (!(effective[kind]?.trim())) {
        continue;
      }
      toProbe.push(kind);
    }

    for (const kind of toProbe) {
      const channelId = kind === 'profile' ? profile : (effective[kind]?.trim() || '');
      if (!channelId) {
        continue;
      }
      const probed = await ensureSetupProbe(token, channelId, kind, locale);
      if (!probed.ok) {
        await fail(kind, probed.message);
        return;
      }
    }

    const partial: Partial<CatalogChannels> = { profile };
    if (dirty.has('explorer')) {
      partial.explorer = explorer;
    }
    if (dirty.has('notes')) {
      partial.notes = notes;
    }
    if (dirty.has('links')) {
      partial.links = links;
    }
    if (dirty.has('review')) {
      partial.review = review;
    }
    await this.store.setCatalogChannels(partial);
    await this.pushDiscordGateToVisible();
  }

  /** Focus an existing map surface; open the Explorer map view when none is ready. */
  private async ensureMapWebview(): Promise<void> {
    if (this.lastFocusedWebview && this.readyWebviews.has(this.lastFocusedWebview)) {
      return;
    }
    for (const webview of this.webviews) {
      if (this.readyWebviews.has(webview)) {
        this.lastFocusedWebview = webview;
        return;
      }
    }
    try {
      await vscode.commands.executeCommand('workbench.view.explorer');
      await vscode.commands.executeCommand(`${MarkersMapProvider.viewId}.focus`);
    } catch {
      // View may be missing until reload.
    }
    await new Promise<void>((resolve) => {
      const started = Date.now();
      const tick = () => {
        if (this.lastFocusedWebview && this.readyWebviews.has(this.lastFocusedWebview)) {
          resolve();
          return;
        }
        for (const webview of this.webviews) {
          if (this.readyWebviews.has(webview)) {
            this.lastFocusedWebview = webview;
            resolve();
            return;
          }
        }
        if (Date.now() - started > 4000) {
          resolve();
          return;
        }
        setTimeout(tick, 50);
      };
      tick();
    });
  }

  private settleGroupDraft(requestId: string | undefined, id: string | undefined): void {
    if (!requestId) {
      return;
    }
    const pending = this.pendingGroupDrafts.get(requestId);
    if (!pending) {
      return;
    }
    this.pendingGroupDrafts.delete(requestId);
    pending.resolve(id);
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
        this.onSurfaceVisible(panel.webview);
        void this.postState(panel.webview);
      }
    });
    panel.onDidDispose(() => {
      this.clearReviewRefresh(panel.webview);
      this.clearAssetWatch(panel.webview);
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
    this.chromeByWebview.set(webview, chrome);
    webview.options = { enableScripts: true, localResourceRoots: [this.media] };
    this.webviews.add(webview);
    this.mountWebview(webview);
    webview.onDidReceiveMessage((message: IncomingMessage) => this.onMessage(webview, message));
  }

  /**
   * Window reload sometimes 404s css/js: the webview service worker has no parent
   * client yet and does not retry. The document stays as raw toolbar buttons.
   */
  private mountWebview(webview: vscode.Webview): void {
    const chrome = this.chromeByWebview.get(webview);
    const surface = this.surfaceByWebview.get(webview);
    if (!chrome || !surface || !this.webviews.has(webview)) {
      return;
    }
    const rev = Date.now().toString(36);
    this.htmlRevByWebview.set(webview, rev);
    this.htmlMountedAt.set(webview, Date.now());
    this.readyWebviews.delete(webview);
    this.needsPageRestore.add(webview);
    webview.html = this.html(webview, chrome, surface, rev);
    this.armAssetWatch(webview);
  }

  private isWebviewVisible(webview: vscode.Webview): boolean {
    if (this.explorerView?.webview === webview) {
      return this.explorerView.visible;
    }
    if (this.bottomView?.webview === webview) {
      return this.bottomView.visible;
    }
    if (this.leftPanel?.webview === webview) {
      return this.leftPanel.visible;
    }
    if (this.rightPanel?.webview === webview) {
      return this.rightPanel.visible;
    }
    return true;
  }

  private clearAssetTimer(webview: vscode.Webview): void {
    const timer = this.assetRetryTimers.get(webview);
    if (timer) {
      clearTimeout(timer);
    }
    this.assetRetryTimers.delete(webview);
  }

  private clearAssetWatch(webview: vscode.Webview): void {
    this.clearAssetTimer(webview);
    this.assetRetrySoon.delete(webview);
    this.assetRetryOnShow.delete(webview);
    this.assetRetries.delete(webview);
    this.htmlRevByWebview.delete(webview);
    this.htmlMountedAt.delete(webview);
  }

  private noteWebviewReady(webview: vscode.Webview): void {
    this.clearAssetTimer(webview);
    this.assetRetrySoon.delete(webview);
    this.assetRetryOnShow.delete(webview);
    this.assetRetries.delete(webview);
  }

  private armAssetWatch(webview: vscode.Webview): void {
    this.clearAssetTimer(webview);
    this.assetRetrySoon.delete(webview);
    if (!this.isWebviewVisible(webview)) {
      return;
    }
    const timer = setTimeout(() => {
      this.assetRetryTimers.delete(webview);
      if (!this.webviews.has(webview) || this.readyWebviews.has(webview)) {
        return;
      }
      this.scheduleAssetRetry(webview);
    }, 8000);
    this.assetRetryTimers.set(webview, timer);
  }

  private scheduleAssetRetry(webview: vscode.Webview): void {
    if (!this.webviews.has(webview) || this.readyWebviews.has(webview)) {
      return;
    }
    if ((this.assetRetries.get(webview) ?? 0) >= MarkersMapProvider.assetRetryLimit) {
      return;
    }
    if (!this.isWebviewVisible(webview)) {
      this.clearAssetTimer(webview);
      this.assetRetrySoon.delete(webview);
      this.assetRetryOnShow.add(webview);
      return;
    }
    if (this.assetRetrySoon.has(webview)) {
      return;
    }
    this.clearAssetTimer(webview);
    this.assetRetrySoon.add(webview);
    const timer = setTimeout(() => {
      this.assetRetryTimers.delete(webview);
      this.assetRetrySoon.delete(webview);
      if (!this.webviews.has(webview) || this.readyWebviews.has(webview)) {
        return;
      }
      if (!this.isWebviewVisible(webview)) {
        this.assetRetryOnShow.add(webview);
        return;
      }
      const tries = (this.assetRetries.get(webview) ?? 0) + 1;
      this.assetRetries.set(webview, tries);
      this.mountWebview(webview);
    }, 300);
    this.assetRetryTimers.set(webview, timer);
  }

  private onSurfaceVisible(webview: vscode.Webview): void {
    if (!this.webviews.has(webview) || this.readyWebviews.has(webview)) {
      return;
    }
    const forced = this.assetRetryOnShow.delete(webview);
    const mountedAt = this.htmlMountedAt.get(webview) ?? 0;
    if (!forced && Date.now() - mountedAt < 1500) {
      if (!this.assetRetryTimers.has(webview)) {
        this.armAssetWatch(webview);
      }
      return;
    }
    if ((this.assetRetries.get(webview) ?? 0) >= MarkersMapProvider.assetRetryLimit) {
      return;
    }
    this.clearAssetTimer(webview);
    this.assetRetrySoon.delete(webview);
    this.assetRetries.set(webview, (this.assetRetries.get(webview) ?? 0) + 1);
    this.mountWebview(webview);
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
    if (message.type === 'discordGateSave') {
      await this.onDiscordGateSave(webview, message);
      return;
    }
    if (message.type === 'setPagesFixed') {
      await this.store.setPagesFixed(message.fixed === true);
      return;
    }
    if (message.type === 'assetsFailed') {
      if (!message.rev || message.rev !== this.htmlRevByWebview.get(webview)) {
        return;
      }
      this.scheduleAssetRetry(webview);
      return;
    }
    if (message.type === 'ready') {
      if (message.rev !== this.htmlRevByWebview.get(webview)) {
        return;
      }
      this.noteWebviewReady(webview);
      this.readyWebviews.add(webview);
      this.rememberFocus(webview, message.pageId);
      if (!this.store.ready) {
        return;
      }
      await this.postState(webview);
      await this.postDiscordGate(webview);
      await this.syncFocusContext();
      const readyPage = this.pageIdFor(webview);
      if (this.store.page(readyPage)?.kind === 'review') {
        await this.showReviewPage(webview, readyPage);
      }
      this.armReviewRefresh(webview);
      return;
    }
    if (await this.needsDiscordGate()) {
      // Overlay owns the webview until Discord is configured.
      // Create / select submit must reach the handler or the gate can never finish.
      const projectSubmit =
        message.type === 'project' &&
        (message.action === 'createSubmit' || message.action === 'selectSubmit');
      if (
        !projectSubmit &&
        message.type !== 'mapFocus' &&
        message.type !== 'activePage' &&
        message.type !== 'listProjectDir' &&
        message.type !== 'clipboardRead' &&
        message.type !== 'reviewOpenSetupDoc' &&
        message.type !== 'discordGateOpenHowTo'
      ) {
        // Clear optimistic / leftover sync loaders before the gate takes over.
        void webview.postMessage({ type: 'baseConfigBusy', busy: false });
        void webview.postMessage({ type: 'pageCloudBusy', busy: false });
        await this.postDiscordGate(webview);
        // Sync clicks looked dead when the gate swallowed them with no toast.
        if (
          (message.type === 'profile' || message.type === 'project') &&
          (message.action === 'syncPush' || message.action === 'syncPull')
        ) {
          const locale = normalizeLocale(this.store.appearance.language);
          void vscode.window.showWarningMessage(`Syn3: ${t(locale, 'discordGateTitle')}`);
        }
        return;
      }
    }
    if (message.type === 'activePage') {
      const prev = this.pageIdFor(webview);
      const switched = message.pageId !== prev;
      this.rememberFocus(webview, message.pageId);
      if (switched) {
        this.scheduleState(webview);
      }
      await this.syncFocusContext();
      // Only fetch Discord when entering a review page — state churn must not re-hit the API.
      if (switched && this.store.page(message.pageId)?.kind === 'review') {
        await this.showReviewPage(webview, message.pageId);
      }
      if (switched) {
        this.armReviewRefresh(webview);
      }
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
        for (const [id] of this.store.links()) {
          if (!this.store.isLinkLocked(id)) {
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
    if (message.type === 'openEntityLink') {
      const resolved = this.store.resolveEntityLink(message.url);
      if (!resolved) {
        void webview.postMessage({ type: 'entityLinkBroken', url: message.url });
        return;
      }
      void webview.postMessage({
        type: 'entityLinkTarget',
        pageId: resolved.pageId,
        chain: resolved.chain,
      });
      return;
    }
    if (message.type === 'stripEntityLink') {
      await this.store.stripEntityLink(message.noteId, message.url);
      return;
    }
    if (message.type === 'clearLinkUrl') {
      if (this.store.link(message.linkId)) {
        await this.store.updateLink(message.linkId, { url: null });
      }
      return;
    }
    if (message.type === 'profile') {
      await this.onProfile(message.action, message.id, message.name);
      return;
    }
    if (message.type === 'project') {
      await this.onProject(
        webview,
        message.action,
        message.id,
        message.name,
        message.channelId,
        message.discordToken,
        message.mode,
        message.repoUrl,
        message.repoProvider,
      );
      return;
    }
    if (message.type === 'pageCloud') {
      if (message.action === 'pushAll') {
        await this.onPageCloudPushAll(webview);
        return;
      }
      if (message.action === 'pullAll') {
        await this.onPageCloudPullAll(webview);
        return;
      }
      if (message.action === 'check') {
        await this.onPageCloudCheck(webview);
        return;
      }
      await this.onPageCloud(message.action, message.pageId);
      return;
    }
    if (message.type === 'debugDiff') {
      const result = await this.store.debugSendDiff();
      void webview.postMessage({ type: 'debugDiff', sections: result.sections });
      return;
    }
    if (message.type === 'workspaceCloud') {
      await this.onWorkspaceCloud(message.action);
      return;
    }
    if (message.type === 'profileOpenSettings') {
      await this.postProfileSettings(webview, message.id);
      return;
    }
    if (message.type === 'profileSaveSettings') {
      await this.saveProfileSettings(webview, message);
      return;
    }
    if (message.type === 'reviewLoad') {
      if (message.force) {
        await this.runReviewChannelLoad(webview, message.pageId, 'initial', () =>
          this.review.loadInitial(message.pageId),
        );
      } else {
        await this.showReviewPage(webview, message.pageId);
      }
      return;
    }
    if (message.type === 'reviewLoadOlder') {
      await this.runReviewChannelLoad(webview, message.pageId, 'older', () =>
        this.review.loadOlder(message.pageId),
      );
      return;
    }
    if (message.type === 'reviewLoadNewer') {
      await this.runReviewChannelLoad(webview, message.pageId, 'newer', () =>
        this.review.loadNewer(message.pageId),
      );
      return;
    }
    if (message.type === 'reviewLoadThread') {
      await this.pushReviewState(
        webview,
        await this.review.loadMoreThread(message.pageId, message.messageId),
      );
      return;
    }
    if (message.type === 'reviewExpandPlain') {
      await this.pushReviewState(
        webview,
        await this.review.expandPlainThread(message.pageId, message.messageId),
      );
      return;
    }
    if (message.type === 'reviewOpenPromptExample') {
      const doc = vscode.Uri.joinPath(this.extensionUri, 'docs', 'review-prompt-template.md');
      try {
        await vscode.window.showTextDocument(doc, { preview: true });
      } catch {
        await vscode.window.showErrorMessage('Could not open review prompt template');
      }
      return;
    }
    if (message.type === 'reviewClearFocus') {
      this.review.clearFocus(message.pageId);
      await this.pushReviewState(webview, this.review.snapshot(message.pageId));
      return;
    }
    if (message.type === 'reviewCreateMr') {
      const result = await this.withReviewPlaceholder(
        webview,
        () => this.review.beginMrSkeleton(message.pageId, message.title, message.draft === true),
        () => this.review.endMrSkeleton(message.pageId, message.title),
        () =>
          this.review.createMrFromPanel(message.pageId, {
            title: message.title,
            draft: message.draft,
            targetBranch: message.targetBranch,
            reviewers: message.reviewers,
            assignees: message.assignees,
            squash: message.squash,
          }),
      );
      await this.handleReviewMrResult(webview, message.pageId, result);
      return;
    }
    if (message.type === 'reviewUpdateMr') {
      const result = await this.review.updateMrChip(message.pageId, message.messageId, {
        title: message.title,
        draft: message.draft,
        color: message.color,
      });
      if (result.kind === 'error') {
        void vscode.window.showErrorMessage(`Syn3: ${result.message}`);
        return;
      }
      await this.pushReviewState(webview, result.state);
      return;
    }
    if (message.type === 'reviewSetLock') {
      const result = await this.review.setParentLock(
        message.pageId,
        message.messageId,
        message.locked === true,
      );
      if (result.kind === 'error') {
        void vscode.window.showErrorMessage(`Syn3: ${result.message}`);
        return;
      }
      await this.pushReviewState(webview, result.state);
      return;
    }
    if (message.type === 'reviewCloseMr') {
      const result = await this.review.closeMr(message.pageId, message.messageId);
      if (result.kind === 'error') {
        void vscode.window.showErrorMessage(`Syn3: ${result.message}`);
        return;
      }
      await this.pushReviewState(webview, result.state);
      return;
    }
    if (message.type === 'reviewDeleteReview') {
      const result = await this.review.deleteReviewMessage(message.pageId, message.messageId);
      if (result.kind === 'error') {
        void vscode.window.showErrorMessage(`Syn3: ${result.message}`);
        return;
      }
      await this.pushReviewState(webview, result.state);
      return;
    }
    if (message.type === 'reviewSetStatus') {
      const status = message.status === 'inProgress' || message.status === 'done' ? message.status : undefined;
      if (!status) {
        return;
      }
      const result = await this.review.setReviewStatus(message.pageId, message.messageId, status);
      if (result.kind === 'error') {
        void vscode.window.showErrorMessage(`Syn3: ${result.message}`);
        return;
      }
      await this.pushReviewState(webview, result.state);
      return;
    }
    if (message.type === 'reviewDiscordRefresh') {
      const mr =
        this.pendingDiscordMr?.pageId === message.pageId
          ? this.pendingDiscordMr.mr
          : ({
              iid: 0,
              title: '',
              web_url: message.webUrl,
              draft: false,
              source_branch: message.sourceBranch,
              target_branch: '',
              author: { username: '' },
              assignees: [],
              reviewers: [],
            } satisfies ReviewMr);
      const result = await this.withReviewPlaceholder(
        webview,
        () => this.review.beginMrSkeleton(message.pageId, mr.title, mr.draft),
        () => this.review.endMrSkeleton(message.pageId, mr.title),
        () => this.review.retryDiscordPost(message.pageId, mr),
      );
      await this.handleReviewMrResult(webview, message.pageId, result);
      return;
    }
    if (message.type === 'reviewStart') {
      const kind = message.kind === 'branch' || message.kind === 'changes' ? message.kind : undefined;
      if (!kind) {
        return;
      }
      const result = await this.withReviewPlaceholder(
        webview,
        () => this.review.beginReviewSkeleton(message.pageId, message.messageId),
        () => this.review.endReviewSkeleton(message.pageId, message.messageId),
        () =>
          this.review.startOrSendReview(
            message.pageId,
            message.messageId,
            kind,
            message.depth,
          ),
      );
      await this.handleReviewFileResult(webview, message.pageId, message.messageId, result);
      return;
    }
    if (message.type === 'reviewStartRoot') {
      const kind = message.kind === 'branch' || message.kind === 'changes' ? message.kind : undefined;
      if (!kind) {
        return;
      }
      this.review.bindReviewChannel(this.store.catalogChannels().review || '');
      const branch = await this.review.peekCurrentBranch();
      if (!branch.ok) {
        void vscode.window.showErrorMessage(`Syn3: ${branch.message}`);
        return;
      }
      const result = await this.withReviewPlaceholder(
        webview,
        () => this.review.beginRootSkeleton(message.pageId, branch.value),
        () => this.review.endRootSkeleton(message.pageId, branch.value),
        () => this.review.startRootReview(message.pageId, kind, message.depth),
      );
      await this.handleReviewRootFileResult(webview, message.pageId, branch.value, result);
      return;
    }
    if (message.type === 'reviewRetryFile') {
      const result = await this.withReviewPlaceholder(
        webview,
        () => this.review.beginReviewSkeleton(message.pageId, message.messageId),
        () => this.review.endReviewSkeleton(message.pageId, message.messageId),
        () => this.review.retryReviewFile(message.pageId, message.messageId),
      );
      await this.handleReviewFileResult(webview, message.pageId, message.messageId, result);
      return;
    }
    if (message.type === 'reviewOpenFile') {
      const result = await this.review.readReviewAttachment(message.pageId, message.messageId);
      await webview.postMessage({
        type: 'reviewFile',
        pageId: message.pageId,
        messageId: message.messageId,
        ok: result.ok,
        filename: result.ok ? result.filename : undefined,
        text: result.ok ? result.text : undefined,
        message: result.ok ? undefined : result.message,
      });
      return;
    }
    if (message.type === 'reviewOpenFileTab') {
      const result = await this.review.openReviewAttachmentTab(message.pageId, message.messageId);
      if (!result.ok) {
        void vscode.window.showErrorMessage(`Syn3: ${result.message}`);
      }
      return;
    }
    if (message.type === 'reviewCreatePage') {
      await this.createReviewPageFromPanel(webview, message);
      return;
    }
    if (message.type === 'pageSaveSettings') {
      await this.savePageSettingsFromPanel(webview, message);
      return;
    }
    if (message.type === 'pageOpenSettings') {
      await this.openMapPageSettings(webview, message.pageId);
      return;
    }
    if (message.type === 'reviewOpenPageSettings') {
      await this.openReviewPageSettings(webview, message.pageId);
      return;
    }
    if (message.type === 'reviewUpdatePage') {
      await this.updateReviewPageFromPanel(webview, message);
      return;
    }
    if (message.type === 'setReviewPaths') {
      await this.store.setActiveReviewPaths({
        reviewSkillPath: message.reviewSkillPath,
        reviewDirPath: message.reviewDirPath,
        reviewModel: message.reviewModel,
        reviewFixModel: message.reviewFixModel,
      });
      return;
    }
    if (message.type === 'reviewNeurofix') {
      const scope = message.scope;
      const itemIndex =
        typeof message.itemIndex === 'number' && Number.isInteger(message.itemIndex)
          ? message.itemIndex
          : undefined;
      if (itemIndex !== undefined) {
        if (scope === 'H' || scope === 'M' || scope === 'S') {
          await this.review.runNeuroFix(message.pageId, message.messageId, scope, itemIndex);
        }
        return;
      }
      if (scope === 'H' || scope === 'M' || scope === 'S' || scope === 'all') {
        await this.review.runNeuroFix(message.pageId, message.messageId, scope);
      }
      return;
    }
    if (message.type === 'listProjectDir') {
      const listed = await listProjectDirectory(this.store, message.rel);
      await webview.postMessage({ type: 'projectDir', seq: message.seq, ...listed });
      return;
    }
    if (message.type === 'reviewOpenSetupDoc') {
      await this.openInstruction('review-setup.md');
      return;
    }
    if (message.type === 'discordGateOpenHowTo') {
      await this.openInstruction('discord-setup.md');
      return;
    }
    if (message.type === 'setAppearance') {
      this.rememberFocus(webview);
      if (message.appearance && typeof message.appearance === 'object') {
        const prev = this.store.appearance;
        const prevRefresh = prev.reviewRefreshSec;
        const prevProject = prev.projectFetchSec;
        const prevFiles = prev.filesFetchSec;
        const prevNotes = prev.notesFetchSec;
        const prevLinks = prev.linksFetchSec;
        await this.store.setAppearance(message.appearance);
        const next = this.store.appearance;
        if (next.reviewRefreshSec !== prevRefresh) {
          this.rearmAllReviewRefresh();
        }
        if (
          next.projectFetchSec !== prevProject ||
          next.filesFetchSec !== prevFiles ||
          next.notesFetchSec !== prevNotes ||
          next.linksFetchSec !== prevLinks
        ) {
          this.armSyncFetchTimers();
        }
      }
      return;
    }
    if (message.type === 'reorderPages') {
      await this.store.reorderPages(message.orderedIds);
      return;
    }
    if (message.type === 'openExternal' || message.type === 'openLinkUrl') {
      await this.openLinkUrl(message.url);
      return;
    }
    if (message.type === 'confirmOpenLinkUrl') {
      if (this.store.appearance.openLinksInCursor) {
        await this.openLinkUrl(message.url);
        return;
      }
      const answer = await vscode.window.showInformationMessage(
        'Открыть ссылку в браузере?',
        { modal: true },
        'Открыть',
      );
      if (answer === 'Открыть') {
        await this.openLinkUrl(message.url);
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
    if (message.type === 'toggleLinkLock') {
      if (!this.store.link(message.linkId)) {
        return;
      }
      await this.store.toggleLinkLock(message.linkId);
      return;
    }
    if (message.type === 'createLinkLayout') {
      if (!this.store.page(message.pageId) || this.store.page(message.pageId)?.kind !== 'links') {
        return;
      }
      await this.store.createLinkLayout(message.pageId);
      return;
    }
    if (message.type === 'createLinkChild') {
      const parent = this.store.link(message.parentId);
      if (!parent || this.refuseLinkLocked(message.parentId)) {
        return;
      }
      await this.store.createLinkChild(message.parentId);
      return;
    }
    if (message.type === 'updateLink') {
      if (!this.store.link(message.linkId) || this.refuseLinkLocked(message.linkId)) {
        return;
      }
      await this.store.updateLink(message.linkId, {
        label: message.label,
        description: message.description,
        url: message.url,
        color: message.color,
      });
      const nextUrl = typeof message.url === 'string' ? message.url.trim() : '';
      if (figmaLinkPreviewEnabled && nextUrl && parseFigmaFrame(nextUrl)) {
        const token = await readFigmaToken(this.hostSecrets, this.store.activeProfileId);
        if (!token) {
          const locale = normalizeLocale(this.store.appearance.language);
          void vscode.window.showErrorMessage(`Syn3: ${t(locale, 'figmaTokenMissing')}`);
        }
      }
      return;
    }
    if (message.type === 'deleteLink') {
      const def = this.store.link(message.linkId);
      if (!def || this.refuseLinkLocked(message.linkId)) {
        return;
      }
      if (!this.store.canDeleteLink(message.linkId)) {
        return;
      }
      const locale = normalizeLocale(this.store.appearance.language);
      const hasChildren = this.store.linkChildren(message.linkId).length > 0;
      const confirm = await vscode.window.showWarningMessage(
        hasChildren
          ? t(locale, 'linkDeleteSubtreeConfirm', { name: def.label })
          : t(locale, 'linkDeleteConfirm', { name: def.label }),
        { modal: true },
        t(locale, 'menuDeleteTree'),
      );
      if (confirm !== t(locale, 'menuDeleteTree')) {
        return;
      }
      const result = await this.store.deleteLink(message.linkId);
      if (!result.ok) {
        void vscode.window.showWarningMessage(`Syn3: ${result.reason}`);
      }
      return;
    }
    if (message.type === 'deleteLinkLift') {
      const def = this.store.link(message.linkId);
      if (!def || this.refuseLinkLocked(message.linkId)) {
        return;
      }
      if (!this.store.canDeleteLink(message.linkId)) {
        return;
      }
      const locale = normalizeLocale(this.store.appearance.language);
      const confirm = await vscode.window.showWarningMessage(
        t(locale, 'linkDeleteLiftConfirm', { name: def.label }),
        { modal: true },
        t(locale, 'menuDeleteLift'),
      );
      if (confirm !== t(locale, 'menuDeleteLift')) {
        return;
      }
      const result = await this.store.deleteLinkLift(message.linkId);
      if (!result.ok) {
        void vscode.window.showWarningMessage(`Syn3: ${result.reason}`);
      }
      return;
    }
    if (message.type === 'createGroup') {
      const label = typeof message.label === 'string' ? message.label.trim() : '';
      if (!label) {
        this.settleGroupDraft(message.requestId, undefined);
        return;
      }
      const parentId =
        typeof message.parentId === 'string' && this.store.marker(message.parentId)
          ? message.parentId
          : undefined;
      if (parentId !== undefined && this.store.depthOf(parentId) >= MAX_MARKER_DEPTH) {
        void vscode.window.showWarningMessage(
          `Syn3: maximum nesting depth is ${MAX_MARKER_DEPTH} subgroups.`,
        );
        this.settleGroupDraft(message.requestId, undefined);
        return;
      }
      if (parentId && this.refuseLocked(parentId)) {
        this.settleGroupDraft(message.requestId, undefined);
        return;
      }
      let color: string | undefined;
      if (message.clearColor) {
        color = undefined;
      } else if (typeof message.color === 'string' && message.color.trim()) {
        color = normalizeHex(message.color) ?? message.color.trim();
      } else if (message.randomColor !== false) {
        color = randomLinkPaletteColor();
      }
      const page =
        parentId === undefined
          ? message.pageId && this.store.page(message.pageId)
            ? message.pageId
            : this.pageIdFor(webview) || this.store.defaultFilesPageId()
          : undefined;
      try {
        const id = await this.store.createMarker({
          label,
          color,
          parent: parentId,
          page,
          alias:
            typeof message.alias === 'string' && message.alias.trim()
              ? message.alias.trim()
              : undefined,
          description:
            typeof message.description === 'string' ? message.description : undefined,
          locked: message.locked === true ? true : undefined,
          columns: normalizeColumns(message.columns),
        });
        this.settleGroupDraft(message.requestId, id);
      } catch (error) {
        void vscode.window.showWarningMessage(
          `Syn3: ${error instanceof Error ? error.message : String(error)}`,
        );
        this.settleGroupDraft(message.requestId, undefined);
      }
      return;
    }
    if (message.type === 'cancelGroupDraft') {
      this.settleGroupDraft(message.requestId, undefined);
      return;
    }
    if (message.type === 'updateGroup') {
      if (!this.store.marker(message.markerId) || this.refuseLocked(message.markerId)) {
        return;
      }
      const patch: { label?: string; alias?: string; description?: string } = {};
      if (typeof message.label === 'string') {
        const trimmed = message.label.trim();
        if (!trimmed) {
          return;
        }
        patch.label = trimmed;
      }
      if (message.alias !== undefined) {
        patch.alias = message.alias === null ? '' : message.alias;
      }
      if (message.description !== undefined) {
        patch.description = message.description === null ? '' : message.description;
      }
      await this.store.updateMarker(message.markerId, patch);
      return;
    }
    if (message.type === 'placeLink') {
      if (this.refuseLinkLocked(message.id)) {
        return;
      }
      try {
        await this.store.placeLink(message.id, message.targetId, message.position, {
          copy: !!message.copy,
        });
      } catch (error) {
        void vscode.window.showWarningMessage(
          `Syn3: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      return;
    }
    if (message.type === 'nestLink') {
      if (this.refuseLinkLocked(message.id)) {
        return;
      }
      try {
        await this.store.nestLink(message.id, message.parentId, { copy: !!message.copy });
      } catch (error) {
        const locale = normalizeLocale(this.store.appearance.language);
        const text = error instanceof Error ? error.message : String(error);
        void vscode.window.showWarningMessage(
          text.includes('Maximum nesting') ? t(locale, 'linkNestDepthWarn') : `Syn3: ${text}`,
        );
      }
      return;
    }
    if (message.type === 'unnestLink') {
      if (this.refuseLinkLocked(message.id)) {
        return;
      }
      await this.store.unnestLink(message.id);
      return;
    }
    if (message.type === 'setFocus') {
      if (message.kind !== 'marker' && message.kind !== 'note') {
        return;
      }
      if (typeof message.id !== 'string' || !message.id) {
        return;
      }
      await this.store.setWorkingFocus(message.kind, message.id);
      return;
    }
    if (message.type === 'setColor') {
      const clear = message.clear === true || message.color === '' || message.color === null;
      const color = clear ? undefined : normalizeHex(String(message.color ?? '')) ?? String(message.color ?? '');
      if (!clear && !color) {
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
      // Locked target still accepts drops; locked source must not start a drag (webview).
      if (message.from && message.from !== message.to && this.refuseLocked(message.from)) {
        return;
      }
      const blockOrder = Array.isArray(message.blockOrder) ? message.blockOrder : undefined;
      await this.store.moveItem(message.relPath, message.from, message.to, {
        copy: !!message.copy,
        blockOrder,
      });
      return;
    }
    if (message.type === 'moveClass') {
      if (!this.store.marker(message.to) || !this.store.classDef(message.classId)) {
        return;
      }
      if (this.pageKindOfMarker(message.to) === 'notes') {
        return;
      }
      if (message.from && message.from !== message.to && this.refuseLocked(message.from)) {
        return;
      }
      const blockOrder = Array.isArray(message.blockOrder) ? message.blockOrder : undefined;
      await this.store.moveClass(message.classId, message.from, message.to, {
        copy: !!message.copy,
        blockOrder,
      });
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
      const added = await this.store.assign(relPaths, message.to);
      if (added === 0) {
        webview.postMessage({ type: 'dropAlreadyExists' });
      }
      return;
    }
    if (message.type === 'listDir') {
      await this.postDirListing(webview, message.relPath);
      return;
    }
    if (message.type === 'openAt') {
      await this.openDiagnostic(message);
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

  /** Opens the setup doc as a rendered page in an editor tab, outside the map column. */
  private async openInstruction(fileName: string): Promise<void> {
    const uri = vscode.Uri.joinPath(this.extensionUri, 'docs', fileName);
    const column = this.instructionColumn();
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      const markdown = Buffer.from(bytes).toString('utf8');
      const existing = this.instructionPanels.get(fileName);
      if (existing) {
        existing.reveal(column, false);
      } else {
        const panel = vscode.window.createWebviewPanel(
          'syn3Instruction',
          instructionTitle(markdown),
          { viewColumn: column, preserveFocus: false },
          { enableScripts: true, retainContextWhenHidden: true },
        );
        this.instructionPanels.set(fileName, panel);
        panel.onDidDispose(() => {
          if (this.instructionPanels.get(fileName) === panel) {
            this.instructionPanels.delete(fileName);
          }
        });
        panel.webview.onDidReceiveMessage((message: { type?: string; href?: string }) => {
          if (message?.type !== 'openLink' || !message.href) {
            return;
          }
          let target: vscode.Uri;
          try {
            target = vscode.Uri.parse(message.href);
          } catch {
            return;
          }
          if (target.scheme === 'http' || target.scheme === 'https') {
            void vscode.env.openExternal(target);
          }
        });
        panel.webview.html = instructionPageHtml(markdown);
        await this.movePanelOutOfMap(panel);
      }
      await this.closeInstructionSource(uri);
    } catch (error) {
      const detail = error instanceof Error ? `: ${error.message}` : '';
      void vscode.window.showErrorMessage(`Syn3: не удалось открыть инструкцию${detail}`);
    }
  }

  /** Editor column that is not a locked map. */
  private instructionColumn(): vscode.ViewColumn {
    const mapColumns = this.mapColumns();
    const preferred =
      this.lastEditorColumn !== undefined && !mapColumns.has(this.lastEditorColumn)
        ? this.lastEditorColumn
        : undefined;
    const group = vscode.window.tabGroups.all.find((item) => {
      if (item.viewColumn < 1 || mapColumns.has(item.viewColumn)) {
        return false;
      }
      if (preferred !== undefined && item.viewColumn !== preferred) {
        return false;
      }
      return item.tabs.some((tab) => tab.input instanceof vscode.TabInputText);
    });
    if (group) {
      return group.viewColumn;
    }
    const other = vscode.window.tabGroups.all.find(
      (item) => item.viewColumn > 0 && !mapColumns.has(item.viewColumn),
    );
    return other?.viewColumn ?? vscode.ViewColumn.Beside;
  }

  /** Webview opened inside the locked map. Move that tab into a neighboring group. */
  private async movePanelOutOfMap(panel: vscode.WebviewPanel): Promise<void> {
    const column = panel.viewColumn;
    const mapColumns = this.mapColumns();
    if (column === undefined || !mapColumns.has(column)) {
      return;
    }
    panel.reveal(column, false);
    const hasLower = vscode.window.tabGroups.all.some(
      (group) => group.viewColumn > 0 && group.viewColumn < column && !mapColumns.has(group.viewColumn),
    );
    await vscode.commands.executeCommand(
      hasLower ? 'workbench.action.moveEditorToPreviousGroup' : 'workbench.action.moveEditorToNextGroup',
    );
  }

  /** Drops the raw markdown tab so the rendered page is the one on screen. */
  private async closeInstructionSource(uri: vscode.Uri): Promise<void> {
    const key = uri.toString();
    const tabs: vscode.Tab[] = [];
    for (const group of vscode.window.tabGroups.all) {
      for (const tab of group.tabs) {
        if (tab.input instanceof vscode.TabInputText && tab.input.uri.toString() === key) {
          tabs.push(tab);
        }
      }
    }
    if (tabs.length > 0) {
      await vscode.window.tabGroups.close(tabs, true);
    }
  }

  /** Columns that hold a Syn3 map. Those groups are locked so files open elsewhere. */
  private mapColumns(): Set<vscode.ViewColumn> {
    return new Set(
      [this.leftPanel?.viewColumn, this.rightPanel?.viewColumn].filter(
        (column): column is vscode.ViewColumn => column !== undefined,
      ),
    );
  }

  /** Files must never open inside a map column. */
  private targetColumn(): vscode.ViewColumn | undefined {
    const mapColumns = this.mapColumns();
    if (mapColumns.size === 0) {
      return undefined;
    }
    if (this.lastEditorColumn !== undefined && !mapColumns.has(this.lastEditorColumn)) {
      return this.lastEditorColumn;
    }
    const other = vscode.window.tabGroups.all.find((group) => !mapColumns.has(group.viewColumn));
    return other?.viewColumn ?? vscode.ViewColumn.Beside;
  }

  /** One build per store generation, shared by every map that shows this page. */
  private loadPageBody(pageId: string): Promise<PageBody> {
    const gen = this.bodyGen;
    const key = `${gen}:${pageId}`;
    const cached = this.bodyCache.get(key);
    if (cached) {
      return Promise.resolve(cached);
    }
    const existing = this.bodyFlight.get(key);
    if (existing) {
      return existing;
    }
    const promise = this.buildPageBody(pageId)
      .then((body) => {
        if (this.bodyGen === gen) {
          this.bodyCache.set(key, body);
        }
        return body;
      })
      .finally(() => {
        if (this.bodyFlight.get(key) === promise) {
          this.bodyFlight.delete(key);
        }
      });
    this.bodyFlight.set(key, promise);
    return promise;
  }

  /** Markers, notes, and links that belong to `pageId`, including file stats for that page only. */
  private async buildPageBody(pageId: string): Promise<PageBody> {
    const groups: MapGroup[] = await Promise.all(
      this.store
        .markers()
        .filter(([id]) => this.store.pageOf(id) === pageId)
        .map(async ([id, def]) => ({
          id,
          label: def.label,
          icons: def.icons?.length ? def.icons.slice() : undefined,
          color: def.color ? cssColor(def.color) : undefined,
          alias: def.alias,
          description: def.description,
          parent: def.parent,
          page: pageId,
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
    const notes: MapNote[] = this.store
      .notes()
      .filter(([id]) => this.store.pageOfNote(id) === pageId)
      .map(([id, def]) => ({
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
    const links: MapLink[] = this.store
      .links()
      .filter(([id]) => this.store.pageOfLink(id) === pageId)
      .map(([id, def]) => {
        const colorId = this.store.linkColorOf(id) ?? LINK_PALETTE_DEFAULT;
        const resolvedHex =
          normalizeHex(colorId) ?? PALETTE.find((swatch) => swatch.id === colorId)?.hex ?? colorId;
        return {
          id,
          label: def.label,
          description: def.description,
          url: def.url,
          parent: def.parent,
          page: def.page ?? pageId,
          locked: def.locked === true ? true : undefined,
          depth: this.store.linkDepthOf(id),
          subtreeHeight: this.store.linkSubtreeHeight(id),
          children: this.store.linkChildren(id).map(([childId]) => childId),
          order: def.order,
          color: cssColor(resolvedHex),
          colorId: def.parent ? undefined : resolvedHex,
          lastRoot: this.store.isLastRootLink(id) ? true : undefined,
          canDelete: this.store.canDeleteLink(id),
        };
      });
    return { groups, notes, links };
  }

  private async postState(webview: vscode.Webview): Promise<void> {
    if (!this.webviews.has(webview) || !this.store.ready || !this.readyWebviews.has(webview)) {
      return;
    }
    const seq = (this.stateSeq.get(webview) ?? 0) + 1;
    this.stateSeq.set(webview, seq);
    const restorePage = this.needsPageRestore.has(webview);
    let pageId = this.pageIdFor(webview);
    // Only the page on screen: other pages are built when the user opens them.
    let body = await this.loadPageBody(pageId);
    if (!this.webviews.has(webview) || this.stateSeq.get(webview) !== seq) {
      return;
    }
    const latest = this.pageIdFor(webview);
    if (latest !== pageId) {
      pageId = latest;
      body = await this.loadPageBody(pageId);
      if (!this.webviews.has(webview) || this.stateSeq.get(webview) !== seq) {
        return;
      }
      if (this.pageIdFor(webview) !== pageId) {
        this.scheduleState(webview);
        return;
      }
    }
    const surface = this.surfaceOf(webview);
    const pages: MapPage[] = this.store.pages().map(([id, def]) => ({
      id,
      name: def.name,
      ...(def.description ? { description: def.description } : {}),
      kind: def.kind,
      layout: def.layout,
      groupsLayout: def.groupsLayout,
      collapsed: { ...def.collapsed[surface] },
    }));
    if (restorePage) {
      this.persistSurfacePage(webview, pageId);
    }
    const page = this.store.page(pageId);
    const focusNoteId = this.focusNoteId;
    this.focusNoteId = undefined;
    const locale = normalizeLocale(this.store.appearance.language);
    if (this.stateSeq.get(webview) !== seq) {
      if (focusNoteId) {
        this.focusNoteId = focusNoteId;
      }
      return;
    }
    let reviewProvider: ReviewHostProvider | undefined;
    if (page?.kind === 'review') {
      reviewProvider = (await this.review.getAccess(pageId))?.provider;
      if (!this.webviews.has(webview) || this.stateSeq.get(webview) !== seq) {
        if (focusNoteId) {
          this.focusNoteId = focusNoteId;
        }
        return;
      }
    }
    this.needsPageRestore.delete(webview);
    await webview.postMessage({
      type: 'state',
      stateSeq: seq,
      restorePage: restorePage || undefined,
      activePageId: restorePage ? pageId : undefined,
      contentPageId: pageId,
      bodyRev: this.bodyGen,
      pages,
      groups: body.groups,
      notes: body.notes,
      links: body.links,
      focusNoteId,
      maxPages: MAX_PAGES,
      usedPageKinds: this.store.pages().map(([, p]) => p.kind),
      layout: page?.layout ?? 'chips',
      groupsLayout: page?.groupsLayout ?? 'flow',
      appearance: this.store.appearance,
      locale,
      ...(reviewProvider ? { reviewProvider } : {}),
      i18n: stringsFor(locale),
      linkPalette: LINK_PALETTE,
      profiles: this.store.profiles(),
      activeProfileId: this.store.activeProfileId,
      positionSync: this.store.positionSync(),
      profileConfigSync: this.store.profileConfigSync(),
      projects: this.store.projects(),
      activeProjectId: this.store.activeProjectId(),
      projectConfigSync: this.store.projectConfigSync(),
      canToggleProjectLock: this.store.canToggleProjectLock(),
      pageConfigSync: this.store.allPageConfigSync(),
      pendingRemoteCount: this.store.pendingRemoteCount(),
      hasConfigChannel: this.store.hasConfigChannel(),
      pagesFixed: this.store.pagesFixed(),
      pagesFixedSent: this.store.pagesFixedSent(),
      pageDrafts: Object.fromEntries(
        this.store.pages().map(([id]) => [id, this.store.pageDraftIds(id)]),
      ),
      catalogChannels: this.store.catalogChannels(),
      focus: this.store.workingFocus ?? null,
      active: this.activeRelPath(),
      ...this.tabSnapshot(),
      dirtyPaths: this.dirtyPaths,
      error: this.store.lastError,
      history: this.store.historySteps(),
      entities: {
        groups: this.store.markers().map(([id]) => id),
        notes: this.store.notes().map(([id]) => id),
      },
      refactorEpoch: this.store.refactoringEpoch,
      open: this.store.surfaceOpen(),
      surface: this.surfaceOf(webview),
      codeStamp: this.languages.getStamp() ?? null,
      themeGeneration: this.languages.getThemeGeneration(),
      problems: this.problems,
    });
    await this.postDiscordGate(webview);
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

  /** Push diagnostics without a full map re-render. */
  private postProblems(): void {
    if (!this.store.ready) {
      return;
    }
    for (const webview of this.webviews) {
      if (!this.readyWebviews.has(webview)) {
        continue;
      }
      void webview.postMessage({ type: 'problems', problems: this.problems });
    }
  }

  private scheduleProblems(): void {
    if (this.problemsTimer) {
      clearTimeout(this.problemsTimer);
    }
    this.problemsTimer = setTimeout(() => {
      this.problemsTimer = undefined;
      const next = this.collectProblems();
      const key = this.problemSignature(next);
      if (key === this.problemsKey) {
        return;
      }
      this.problems = next;
      this.problemsKey = key;
      this.postProblems();
    }, 200);
  }

  private collectProblems(): ProblemDiag[] {
    const out: ProblemDiag[] = [];
    for (const [uri, diagnostics] of vscode.languages.getDiagnostics()) {
      const relPath = this.store.toRelative(uri);
      if (!relPath) {
        continue;
      }
      for (const diagnostic of diagnostics) {
        const severity = this.problemSeverity(diagnostic.severity);
        if (!severity) {
          continue;
        }
        const message = diagnostic.message.trim();
        if (!message) {
          continue;
        }
        out.push({
          relPath,
          message,
          severity,
          line: diagnostic.range.start.line,
          character: diagnostic.range.start.character,
          endLine: diagnostic.range.end.line,
          endCharacter: diagnostic.range.end.character,
        });
      }
    }
    out.sort(
      (a, b) =>
        a.relPath.localeCompare(b.relPath) ||
        a.line - b.line ||
        a.character - b.character ||
        a.severity.localeCompare(b.severity) ||
        a.message.localeCompare(b.message),
    );
    return out;
  }

  private problemSeverity(
    severity: vscode.DiagnosticSeverity,
  ): ProblemDiag['severity'] | undefined {
    if (severity === vscode.DiagnosticSeverity.Error) {
      return 'error';
    }
    if (severity === vscode.DiagnosticSeverity.Warning) {
      return 'warning';
    }
    if (severity === vscode.DiagnosticSeverity.Information) {
      return 'info';
    }
    return undefined;
  }

  private problemSignature(list: ProblemDiag[]): string {
    return list
      .map((item) =>
        [
          item.relPath,
          item.severity,
          item.line,
          item.character,
          item.endLine,
          item.endCharacter,
          item.message,
        ].join('\n'),
      )
      .join('\n\0');
  }

  private async openDiagnostic(
    message: Extract<IncomingMessage, { type: 'openAt' }>,
  ): Promise<void> {
    const { relPath, line, character, endLine, endCharacter } = message;
    if (
      !relPath ||
      !Number.isInteger(line) ||
      line < 0 ||
      !Number.isInteger(character) ||
      character < 0 ||
      !Number.isInteger(endLine) ||
      endLine < 0 ||
      !Number.isInteger(endCharacter) ||
      endCharacter < 0
    ) {
      return;
    }
    const uri = this.store.toUri(relPath);
    const stat = await vscode.workspace.fs.stat(uri).then(
      (s) => s,
      () => undefined,
    );
    if (!stat || stat.type & vscode.FileType.Directory) {
      return;
    }
    const start = new vscode.Position(line, character);
    let end = new vscode.Position(endLine, endCharacter);
    if (end.isBefore(start)) {
      end = start;
    }
    await vscode.commands.executeCommand('vscode.open', uri, {
      viewColumn: this.targetColumn(),
      selection: new vscode.Range(start, end),
    });
  }

  /** Push on-disk uncommitted paths without a full map re-render. */
  private postChanges(): void {
    if (!this.store.ready) {
      return;
    }
    for (const webview of this.webviews) {
      if (!this.readyWebviews.has(webview)) {
        continue;
      }
      void webview.postMessage({ type: 'changes', dirtyPaths: this.dirtyPaths });
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
    if (action === 'toggleExplorer') {
      await vscode.commands.executeCommand('workbench.action.toggleSidebarVisibility');
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
      for (const [id] of this.store.rootLinks(activePage)) {
        if (this.store.isLinkLocked(id)) {
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
      void webview.postMessage({
        type: 'openGroupDraft',
        pageId: activePage,
      });
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
    if (action === 'createLinkLayout') {
      if (this.store.page(activePage)?.kind === 'links') {
        await this.store.createLinkLayout(activePage);
      }
      return;
    }
    if (action === 'createMr') {
      if (this.store.page(activePage)?.kind === 'review') {
        await this.handleReviewPlus(webview, activePage);
      }
      return;
    }
    if (action === 'pullMr') {
      if (this.store.page(activePage)?.kind === 'review') {
        await this.handleReviewPull(webview, activePage);
      }
      return;
    }
    if (
      action === 'createPage' ||
      action === 'createPageFiles' ||
      action === 'createPageNotes' ||
      action === 'createPageLinks' ||
      action === 'createPageReview'
    ) {
      const kind: PageKind =
        action === 'createPageNotes'
          ? 'notes'
          : action === 'createPageLinks'
            ? 'links'
            : action === 'createPageReview'
              ? 'review'
              : 'files';
      await this.createPageFlow(webview, kind);
      return;
    }
    if (action === 'renamePage') {
      const page = this.store.page(activePage);
      if (!page) {
        return;
      }
      if (page.kind === 'review') {
        await this.openReviewPageSettings(webview, activePage);
        return;
      }
      await this.postPageSettingsPanel(webview, {
        mode: 'edit',
        pageId: activePage,
        kind: page.kind,
        name: page.name,
        description: page.description || '',
      });
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
      return;
    }
    if (action === 'whySyn3') {
      await this.openInstruction('why-syn3.md');
    }
  }

  /** Open the in-map profile editor. Omit id to create a profile. */
  async showProfileSettings(profileId?: string): Promise<void> {
    await this.ensureMapWebview();
    const webview = this.lastFocusedWebview;
    if (!webview) {
      return;
    }
    await this.postProfileSettings(webview, profileId);
  }

  private async postProfileSettings(webview: vscode.Webview, profileId?: string): Promise<void> {
    const profile = profileId ? this.store.profiles().find((p) => p.id === profileId) : undefined;
    if (profileId && !profile) {
      return;
    }
    const nicks = profile ? this.store.gitNicks(profile.id) : { githubNick: '', gitlabNick: '' };
    const host = this.store.projectRepo()?.provider;
    const tokenKey = profile ? this.store.repositoryTokenKey(profile.id) : undefined;
    const opaqueToken = tokenKey
      ? (await readRepositoryToken(this.hostSecrets, tokenKey)) || ''
      : '';
    const githubToken = opaqueToken
      ? host === 'github'
        ? opaqueToken
        : ''
      : profile
        ? (await readProfileHostToken(this.hostSecrets, profile.id, 'github')) || ''
        : '';
    const gitlabToken = opaqueToken
      ? host === 'gitlab'
        ? opaqueToken
        : ''
      : profile
        ? (await readProfileHostToken(this.hostSecrets, profile.id, 'gitlab')) || ''
        : '';
    await webview.postMessage({
      type: 'profileSettingsPanel',
      id: profile?.id ?? '',
      creating: !profile,
      nameLocked: profile?.id === GENERAL_PROFILE_ID,
      name: profile?.name ?? '',
      githubNick: nicks.githubNick,
      gitlabNick: nicks.gitlabNick,
      githubToken,
      gitlabToken,
      projectHost: host || '',
    });
  }

  private async saveProfileSettings(
    webview: vscode.Webview,
    message: {
      id?: string;
      name: string;
      githubNick: string;
      gitlabNick: string;
      githubToken: string;
      gitlabToken: string;
    },
  ): Promise<void> {
    const locale = normalizeLocale(this.store.appearance.language);
    const name = message.name.trim();
    let id = message.id?.trim() || '';
    const creating = !id;
    const host = this.store.projectRepo()?.provider;
    const nick =
      host === 'gitlab' ? message.gitlabNick.trim() : message.githubNick.trim();
    const token =
      host === 'gitlab' ? message.gitlabToken.trim() : message.githubToken.trim();
    if (creating) {
      if (!name) {
        await webview.postMessage({
          type: 'profileSettingsError',
          message: t(locale, 'profileNameEmpty'),
        });
        return;
      }
      if (!this.store.isValidProfileName(name)) {
        await webview.postMessage({
          type: 'profileSettingsError',
          message: t(locale, 'profileNameTaken'),
        });
        return;
      }
      if (!host) {
        await webview.postMessage({
          type: 'profileSettingsError',
          message: t(locale, 'projectRepositoryRequired'),
        });
        return;
      }
      if (!nick) {
        await webview.postMessage({
          type: 'profileSettingsError',
          message: t(locale, 'profileNickRequired'),
        });
        return;
      }
      if (!token) {
        await webview.postMessage({
          type: 'profileSettingsError',
          message: t(locale, 'profileTokenRequired'),
        });
        return;
      }
      const created = await this.store.createProfile(name);
      if (!created) {
        await webview.postMessage({
          type: 'profileSettingsError',
          message: t(locale, 'profileNameTaken'),
        });
        return;
      }
      id = created;
    } else if (id !== GENERAL_PROFILE_ID) {
      const current = this.store.profiles().find((p) => p.id === id);
      if (!current) {
        return;
      }
      if (!name) {
        await webview.postMessage({
          type: 'profileSettingsError',
          message: t(locale, 'profileNameEmpty'),
        });
        return;
      }
      if (current.name !== name) {
        if (!this.store.isValidProfileName(name, id)) {
          await webview.postMessage({
            type: 'profileSettingsError',
            message: t(locale, 'profileNameTaken'),
          });
          return;
        }
        const renamed = await this.store.renameProfile(id, name);
        if (!renamed) {
          await webview.postMessage({
            type: 'profileSettingsError',
            message: t(locale, 'profileNameTaken'),
          });
          return;
        }
      }
    }
    await this.store.setProfileGitNicks(id, {
      githubNick: message.githubNick,
      gitlabNick: message.gitlabNick,
    });
    await this.storeProfileRepositoryToken(id, host, token);
    if (!this.store.machineIsBound() || creating) {
      await this.store.setActiveProfile(id);
    }
    await this.withBaseConfigBusy(async () => {
      const result = await this.store.pushProfileConfig();
      if (!result.ok && result.message && result.message !== 'Nothing to push') {
        this.showBaseConfigResult(result);
      }
    });
    await webview.postMessage({ type: 'profileSettingsSaved' });
  }

  private async storeProfileRepositoryToken(
    profileId: string,
    host: 'github' | 'gitlab' | undefined,
    token: string,
  ): Promise<void> {
    const trimmed = token.trim();
    let key = this.store.repositoryTokenKey(profileId);
    if (!trimmed) {
      if (key) {
        await deleteRepositoryToken(this.hostSecrets, key);
        await this.store.setRepositoryTokenKey(profileId, undefined);
      }
      if (host) {
        await deleteProfileHostToken(this.hostSecrets, profileId, host);
      }
      return;
    }
    if (!key) {
      key = createRepositoryTokenKey();
      await this.store.setRepositoryTokenKey(profileId, key);
    }
    await writeRepositoryToken(this.hostSecrets, key, trimmed);
    if (host) {
      await writeProfileHostToken(this.hostSecrets, profileId, host, trimmed);
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
        await this.withBaseConfigBusy(async () => {
          const result = await this.store.pushProfileConfig();
          if (!result.ok && result.message && result.message !== 'Nothing to push') {
            this.showBaseConfigResult(result);
          }
        });
      }
      return;
    }
    if (action === 'create') {
      await this.showProfileSettings();
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
      await this.withBaseConfigBusy(async () => {
        const result = await this.store.pushProfileConfig();
        this.showBaseConfigResult(result);
      });
      return;
    }
    if (action === 'syncPull') {
      await this.withBaseConfigBusy(async () => {
        const result = await this.store.pullProfileConfig();
        this.showBaseConfigResult(result);
      });
    }
  }

  private async onProject(
    webview: vscode.Webview,
    action: 'select' | 'create' | 'createSubmit' | 'selectSubmit' | 'syncPush' | 'syncPull' | 'join',
    id?: string,
    name?: string,
    channelId?: string,
    discordToken?: string,
    mode?: 'create' | 'select',
    repoUrl?: string,
    repoProvider?: 'github' | 'gitlab',
  ): Promise<void> {
    const locale = normalizeLocale(this.store.appearance.language);
    if (action === 'select') {
      if (!id || id === this.store.activeProjectId()) {
        return;
      }
      if (this.store.hasUnsentChanges()) {
        const continueLabel = t(locale, 'projectSwitchContinue');
        const choice = await vscode.window.showWarningMessage(
          t(locale, 'projectSwitchUnsynced'),
          { modal: true },
          t(locale, 'projectSwitchCancel'),
          continueLabel,
        );
        if (choice !== continueLabel) {
          return;
        }
      }
      await this.store.setActiveProject(id);
      return;
    }
    if (action === 'create') {
      const projects = this.store.projects();
      const needChannel = projects.length === 0 || !this.store.baseChannelId().trim();
      const status = await secretsStatus(this.hostSecrets);
      await webview.postMessage({
        type: 'projectCreatePanel',
        needChannel,
        hasDiscord: status.hasDiscord,
        mode: mode === 'select' ? 'select' : 'create',
        gate: false,
      });
      return;
    }
    if (action === 'createSubmit') {
      const trimmedName = (name || '').trim();
      if (!trimmedName) {
        await webview.postMessage({
          type: 'projectCreateError',
          message: t(locale, 'projectNameEmpty'),
          canRetry: false,
        });
        return;
      }
      const projects = this.store.projects();
      const needChannel = projects.length === 0 || !this.store.baseChannelId().trim();
      let nextChannel: string | undefined;
      if (needChannel) {
        const ch = (channelId || '').trim();
        if (!ch) {
          await webview.postMessage({
            type: 'projectCreateError',
            message: t(locale, 'projectChannelEmpty'),
            canRetry: false,
          });
          return;
        }
        if (!isValidChannelId(ch)) {
          await webview.postMessage({
            type: 'projectCreateError',
            message: t(locale, 'projectChannelInvalid'),
            canRetry: false,
          });
          return;
        }
        nextChannel = ch;
      }
      const newToken = (discordToken || '').trim();
      if (newToken) {
        await storeSecrets(this.hostSecrets, { discord: newToken });
      } else {
        const status = await secretsStatus(this.hostSecrets);
        if (!status.hasDiscord) {
          await webview.postMessage({
            type: 'projectCreateError',
            message: t(locale, 'discordTokenRequired'),
            canRetry: false,
          });
          return;
        }
      }
      const trimmedRepo = (repoUrl || '').trim();
      if (!trimmedRepo || (repoProvider !== 'github' && repoProvider !== 'gitlab')) {
        await webview.postMessage({
          type: 'projectCreateError',
          message: t(locale, 'projectRepositoryRequired'),
          canRetry: false,
        });
        return;
      }
      const repo = { provider: repoProvider, repoUrl: trimmedRepo };
      try {
        const result = await this.store.publishNewProject(trimmedName, nextChannel, repo);
        if (!result.ok) {
          const text = result.message || 'Failed to post base.json';
          void vscode.window.showErrorMessage(`Syn3: ${text}`);
          await webview.postMessage({
            type: 'projectCreateError',
            message: result.canRetry ? t(locale, 'projectCreateRetryHint') : text,
            canRetry: result.canRetry,
          });
          return;
        }
        await webview.postMessage({ type: 'projectCreateDone' });
      } catch (error) {
        const text = error instanceof Error ? error.message : String(error);
        void vscode.window.showErrorMessage(`Syn3: ${text}`);
        await webview.postMessage({
          type: 'projectCreateError',
          message: text,
          canRetry: false,
        });
      }
      return;
    }
    if (action === 'selectSubmit') {
      const ch = (channelId || '').trim();
      if (!ch) {
        await webview.postMessage({
          type: 'projectCreateError',
          message: t(locale, 'projectChannelEmpty'),
          canRetry: false,
        });
        return;
      }
      if (!isValidChannelId(ch)) {
        await webview.postMessage({
          type: 'projectCreateError',
          message: t(locale, 'projectChannelInvalid'),
          canRetry: false,
        });
        return;
      }
      const newToken = (discordToken || '').trim();
      if (newToken) {
        await storeSecrets(this.hostSecrets, { discord: newToken });
      } else {
        const status = await secretsStatus(this.hostSecrets);
        if (!status.hasDiscord) {
          await webview.postMessage({
            type: 'projectCreateError',
            message: t(locale, 'discordTokenRequired'),
            canRetry: false,
          });
          return;
        }
      }
      try {
        const pull = await this.store.pullBaseFromChannel(ch);
        if (!pull.ok && pull.message && pull.message !== 'Nothing to pull') {
          void vscode.window.showErrorMessage(`Syn3: ${pull.message}`);
          await webview.postMessage({
            type: 'projectCreateError',
            message: pull.message,
            canRetry: false,
          });
          return;
        }
        await webview.postMessage({ type: 'projectCreateDone' });
        if (this.store.machineIsBound()) {
          await this.syncOpenSurfacesIfNeeded(true);
        } else {
          await this.postProfileSettings(webview, GENERAL_PROFILE_ID);
        }
      } catch (error) {
        const text = error instanceof Error ? error.message : String(error);
        void vscode.window.showErrorMessage(`Syn3: ${text}`);
        await webview.postMessage({
          type: 'projectCreateError',
          message: text,
          canRetry: false,
        });
      }
      return;
    }
    if (action === 'join') {
      const ch = await vscode.window.showInputBox({
        title: t(locale, 'projectJoinTitle'),
        prompt: t(locale, 'projectChannel'),
        placeHolder: t(locale, 'channelIdPlaceholder'),
        validateInput: (v) => {
          const trimmed = v.trim();
          if (!trimmed) {
            return t(locale, 'projectChannelEmpty');
          }
          if (!isValidChannelId(trimmed)) {
            return t(locale, 'projectChannelInvalid');
          }
          return undefined;
        },
      });
      if (!ch?.trim()) {
        return;
      }
      await this.withBaseConfigBusy(async () => {
        await this.store.setCatalogChannels({ profile: ch.trim() });
        const pull = await this.store.pullProfileConfig();
        if (!pull.ok && pull.message) {
          const text =
            pull.message === 'cloudPullFirst' ? t(locale, 'cloudPullFirst') : pull.message;
          void vscode.window.showErrorMessage(`Syn3: ${text}`);
        }
      });
      return;
    }
    if (action === 'syncPush') {
      await this.withBaseConfigBusy(async () => {
        const result = await this.store.pushProfileConfig();
        this.showBaseConfigResult(result);
      });
      return;
    }
    if (action === 'syncPull') {
      await this.withBaseConfigBusy(async () => {
        const result = await this.store.pullProfileConfig();
        this.showBaseConfigResult(result);
      });
    }
  }

  private showBaseConfigResult(result: { ok: boolean; message?: string }): void {
    if (result.ok) {
      return;
    }
    this.showBaseConfigError(result.message || 'Failed to post base.json');
  }

  private showBaseConfigError(message: string): void {
    const locale = normalizeLocale(this.store.appearance.language);
    const text = message === 'cloudPullFirst' ? t(locale, 'cloudPullFirst') : message;
    void vscode.window.showErrorMessage(`Syn3: ${text}`);
  }

  private postBaseConfigBusy(busy: boolean): void {
    for (const webview of this.webviews) {
      void webview.postMessage({ type: 'baseConfigBusy', busy });
    }
  }

  private async withBaseConfigBusy(task: () => Promise<void>): Promise<void> {
    if (this.baseConfigBatch) {
      this.postBaseConfigBusy(true);
      this.showBaseConfigError('Base config sync is already running');
      return;
    }
    this.baseConfigBatch = true;
    this.postBaseConfigBusy(true);
    try {
      await task();
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      this.showBaseConfigError(text);
    } finally {
      this.baseConfigBatch = false;
      this.postBaseConfigBusy(false);
    }
  }

  private async onPageCloud(
    action: 'push' | 'pull',
    pageId: string | undefined,
  ): Promise<void> {
    if (!pageId || !this.store.page(pageId)) {
      return;
    }
    const locale = normalizeLocale(this.store.appearance.language);
    if (action === 'pull') {
      this.bodyCache.clear();
      this.bodyFlight.clear();
      this.bodyGen += 1;
      this.scheduleAll();
    }
    const result =
      action === 'push'
        ? await this.store.pushPageConfig(pageId)
        : await this.store.pullPageConfig(pageId);
    if (!result.ok && result.message) {
      const text =
        result.message === 'cloudPullFirst' ? t(locale, 'cloudPullFirst') : result.message;
      void vscode.window.showErrorMessage(`Syn3: ${text}`);
    }
  }

  /** Toolbar Accept / Send: BASE then dirty or newer known pages. */
  private async onWorkspaceCloud(action: 'push' | 'pull'): Promise<void> {
    if (this.pageCloudBatch) {
      return;
    }
    if (action === 'pull') {
      this.bodyCache.clear();
      this.bodyFlight.clear();
      this.bodyGen += 1;
      this.scheduleAll();
    }
    await this.withBaseConfigBusy(async () => {
      const result =
        action === 'push'
          ? await this.store.pushWorkspaceCloud()
          : await this.store.pullWorkspaceCloud();
      if (!result.ok && result.message) {
        if (result.message === 'cloudPullFirst' || !result.message.includes('\t')) {
          this.showBaseConfigError(result.message);
          return;
        }
        void vscode.window.showErrorMessage(`Syn3: ${this.formatCloudFailures(result.message)}`);
      }
    });
  }

  /** Send pages that differ from Discord. The lock is one of those differences. */
  private async onPageCloudPushAll(webview: vscode.Webview): Promise<void> {
    if (this.pageCloudBatch) {
      return;
    }
    this.pageCloudBatch = true;
    let pushed = 0;
    let ok = false;
    try {
      const result = await this.store.pushDirtyPageConfigs();
      pushed = result.pushed;
      ok = result.ok;
      if (!result.ok && result.message) {
        void vscode.window.showErrorMessage(`Syn3: ${this.formatCloudFailures(result.message)}`);
      }
    } finally {
      this.pageCloudBatch = false;
      void webview.postMessage({ type: 'pageCloudBusy', busy: false, pushed, ok });
    }
  }

  /** Pull every page that has a newer cloud config. */
  private async onPageCloudPullAll(webview: vscode.Webview): Promise<void> {
    if (this.pageCloudBatch) {
      return;
    }
    this.pageCloudBatch = true;
    this.bodyCache.clear();
    this.bodyFlight.clear();
    this.bodyGen += 1;
    this.scheduleAll();
    try {
      const result = await this.store.pullNewerPageConfigs();
      if (!result.ok && result.message) {
        void vscode.window.showErrorMessage(`Syn3: ${this.formatCloudFailures(result.message)}`);
      }
    } finally {
      this.pageCloudBatch = false;
      void webview.postMessage({ type: 'pageCloudBusy', busy: false });
    }
  }

  /** Manual Discord scan from the pager reload button. */
  private async onPageCloudCheck(webview: vscode.Webview): Promise<void> {
    if (this.pageCloudBatch) {
      return;
    }
    this.pageCloudBatch = true;
    try {
      const result = await this.store.checkCloud();
      if (!result.ok && result.message) {
        void vscode.window.showWarningMessage(`Syn3: ${this.formatCloudFailures(result.message)}`);
      }
    } finally {
      this.pageCloudBatch = false;
      void webview.postMessage({ type: 'pageCloudBusy', busy: false });
    }
  }

  private async createPageFlow(webview: vscode.Webview, kind: PageKind = 'files'): Promise<void> {
    if (this.store.pages().length >= MAX_PAGES) {
      return;
    }
    const pageKind = normalizePageKind(kind) ?? 'files';
    if (this.store.hasPageKind(pageKind)) {
      return;
    }
    if (pageKind === 'review') {
      const defaults = await this.review.createPageDefaults();
      if ('error' in defaults) {
        void vscode.window.showErrorMessage(`Syn3: ${defaults.error}`);
        return;
      }
      const projectRepo = this.store.projectRepo();
      await webview.postMessage({
        type: 'reviewCreatePagePanel',
        origin: defaults.origin,
        suggestedProvider: projectRepo?.provider || defaults.suggestedProvider,
        channelId: this.store.catalogChannels().review || '',
        repoUrl: projectRepo?.repoUrl || '',
        projectRepoLocked: !!projectRepo,
        hasGitlab: defaults.hasGitlab,
        hasGithub: defaults.hasGithub,
        hasDiscord: defaults.hasDiscord,
        githubToken: defaults.githubToken,
        gitlabToken: defaults.gitlabToken,
      });
      return;
    }
    await this.postPageSettingsPanel(webview, { mode: 'create', kind: pageKind });
  }

  private mapKindChannelKey(kind: PageKind): 'explorer' | 'notes' | 'links' | undefined {
    if (kind === 'files') {
      return 'explorer';
    }
    if (kind === 'notes') {
      return 'notes';
    }
    if (kind === 'links') {
      return 'links';
    }
    return undefined;
  }

  private catalogChannelForPageKind(kind: PageKind): string {
    const key = this.mapKindChannelKey(kind);
    if (!key) {
      return '';
    }
    return this.store.catalogChannels()[key] || '';
  }

  private async postPageSettingsPanel(
    webview: vscode.Webview,
    opts: {
      mode: 'create' | 'edit';
      pageId?: string;
      kind: PageKind;
      name?: string;
      description?: string;
    },
  ): Promise<void> {
    const status = await secretsStatus(this.hostSecrets);
    const figmaToken =
      opts.kind === 'links'
        ? (await readFigmaToken(this.hostSecrets, this.store.activeProfileId)) || ''
        : undefined;
    await webview.postMessage({
      type: 'pageSettingsPanel',
      mode: opts.mode,
      pageId: opts.pageId || '',
      kind: opts.kind,
      name: opts.name || '',
      description: opts.description || '',
      channelId: this.catalogChannelForPageKind(opts.kind),
      hasDiscord: status.hasDiscord,
      ...(figmaToken !== undefined ? { figmaToken } : {}),
    });
  }

  private async openMapPageSettings(webview: vscode.Webview, pageId: string): Promise<void> {
    const page = this.store.page(pageId);
    if (!page) {
      return;
    }
    if (page.kind === 'review') {
      await this.openReviewPageSettings(webview, pageId);
      return;
    }
    await this.postPageSettingsPanel(webview, {
      mode: 'edit',
      pageId,
      kind: page.kind,
      name: page.name,
      description: page.description || '',
    });
  }

  private pageSetupKind(kind: PageKind): SetupChannelKind {
    if (kind === 'notes') {
      return 'notes';
    }
    if (kind === 'links') {
      return 'links';
    }
    if (kind === 'review') {
      return 'review';
    }
    return 'explorer';
  }

  /** Post the map hello into the page channel. Does not look for an older hello. */
  private async postPageChannelHello(
    kind: PageKind,
    channelId: string,
  ): Promise<{ ok: true } | { ok: false; message: string }> {
    const locale = normalizeLocale(this.store.appearance.language);
    const token = (await getSecret(this.hostSecrets, SECRET_DISCORD)) || '';
    if (!token) {
      return { ok: false, message: t(locale, 'reviewFieldDiscordToken') };
    }
    const setupKind = this.pageSetupKind(kind);
    const posted = await postChannelMessage(token, channelId, setupHelloText(setupKind, locale));
    if (!posted.ok) {
      return posted;
    }
    return { ok: true };
  }

  /** Page-channel hello and base.json are different channels, so post base right away. */
  private async pushBaseAfterPageHello(): Promise<void> {
    await this.withBaseConfigBusy(async () => {
      const result = await this.store.pushProfileConfig();
      if (!result.ok && result.message && result.message !== 'Nothing to push') {
        this.showBaseConfigResult(result);
      }
    });
  }

  /** Links page settings share the profile Figma token. An empty edit clears it. */
  private async savePageFigmaToken(token: string | undefined, allowClear: boolean): Promise<void> {
    if (typeof token !== 'string') {
      return;
    }
    this.dropFigmaPreviewCache();
    const trimmed = token.trim();
    const profileId = this.store.activeProfileId;
    if (trimmed) {
      await writeFigmaToken(this.hostSecrets, profileId, trimmed);
      return;
    }
    if (allowClear) {
      await deleteFigmaToken(this.hostSecrets, profileId);
    }
  }

  /** A saved token must not keep a preview that failed under the previous one. */
  private dropFigmaPreviewCache(): void {
    for (const key of this.linkPreviewCache.keys()) {
      if (key.startsWith('figma')) {
        this.linkPreviewCache.delete(key);
      }
    }
    for (const key of this.linkPreviewInflight.keys()) {
      if (key.startsWith('figma')) {
        this.linkPreviewInflight.delete(key);
      }
    }
  }

  private async savePageDiscordAndChannel(
    kind: PageKind,
    channelId: string | undefined,
    discordToken: string | undefined,
  ): Promise<void> {
    if (discordToken?.trim()) {
      await storeSecrets(this.hostSecrets, { discord: discordToken });
    }
    const key = this.mapKindChannelKey(kind);
    if (!key || channelId === undefined) {
      return;
    }
    await this.store.setCatalogChannels({ [key]: channelId.trim() });
  }

  private async savePageSettingsFromPanel(
    webview: vscode.Webview,
    message: {
      pageId?: string;
      kind?: PageKind;
      name: string;
      description?: string;
      channelId?: string;
      discordToken?: string;
      figmaToken?: string;
    },
  ): Promise<void> {
    const name = message.name.trim();
    const locale = normalizeLocale(this.store.appearance.language);
    if (!name) {
      await webview.postMessage({
        type: 'pageSettingsError',
        message: t(locale, 'profileNameEmpty'),
      });
      return;
    }
    const channelId = typeof message.channelId === 'string' ? message.channelId.trim() : '';
    if (channelId && !/^\d{5,}$/.test(channelId)) {
      await webview.postMessage({
        type: 'pageSettingsError',
        message: t(locale, 'projectChannelInvalid'),
      });
      return;
    }
    await this.savePageFigmaToken(message.figmaToken, !!message.pageId);
    if (message.pageId) {
      const page = this.store.page(message.pageId);
      if (!page) {
        return;
      }
      await this.store.setPageMeta(message.pageId, name, message.description);
      await this.savePageDiscordAndChannel(page.kind, channelId, message.discordToken);
      return;
    }
    if (this.store.pages().length >= MAX_PAGES) {
      await webview.postMessage({
        type: 'pageSettingsError',
        message: 'Too many pages',
      });
      return;
    }
    if (!/^\d{5,}$/.test(channelId)) {
      await webview.postMessage({
        type: 'pageSettingsError',
        message: channelId ? t(locale, 'projectChannelInvalid') : t(locale, 'projectChannelEmpty'),
      });
      return;
    }
    const kind = normalizePageKind(message.kind) ?? 'files';
    if (kind === 'review') {
      await webview.postMessage({
        type: 'pageSettingsError',
        message: 'Use review create panel',
      });
      return;
    }
    if (this.store.hasPageKind(kind)) {
      await webview.postMessage({
        type: 'pageSettingsError',
        message: t(locale, 'pageKindTaken'),
      });
      return;
    }
    if (message.discordToken?.trim()) {
      await storeSecrets(this.hostSecrets, { discord: message.discordToken });
    }
    const hello = await this.postPageChannelHello(kind, channelId);
    if (!hello.ok) {
      void vscode.window.showErrorMessage(`Syn3: ${hello.message}`);
      await webview.postMessage({
        type: 'pageSettingsError',
        message: hello.message,
      });
      return;
    }
    const id = await this.store.createPage(name, kind, message.description);
    if (!id) {
      await webview.postMessage({
        type: 'pageSettingsError',
        message: 'Failed to create page',
      });
      return;
    }
    await this.savePageDiscordAndChannel(kind, channelId, message.discordToken);
    await this.pushBaseAfterPageHello();
    await webview.postMessage({ type: 'pageSettingsSaved' });
    this.activePageByWebview.set(webview, id);
    this.persistSurfacePage(webview, id);
    await webview.postMessage({ type: 'openPage', pageId: id });
  }

  private async createReviewPageFromPanel(
    webview: vscode.Webview,
    message: {
      name: string;
      provider: ReviewHostProvider;
      channelId: string;
      repoUrl: string;
      description?: string;
      gitlabToken?: string;
      githubToken?: string;
      discordToken?: string;
    },
  ): Promise<void> {
    const fail = async (text: string) => {
      await webview.postMessage({ type: 'reviewCreatePageError', message: text });
      void vscode.window.showErrorMessage(`Syn3: ${text}`);
    };
    if (this.store.pages().length >= MAX_PAGES) {
      await fail('Too many pages');
      return;
    }
    const name = message.name.trim();
    if (!name) {
      await fail('page name is required');
      return;
    }
    const provider = isReviewHostProvider(message.provider) ? message.provider : undefined;
    if (!provider) {
      await fail('choose GitLab or GitHub');
      return;
    }
    const defaults = await this.review.createPageDefaults();
    if ('error' in defaults) {
      await fail(defaults.error);
      return;
    }
    const repoUrl = (message.repoUrl || '').trim() || this.store.projectRepo()?.repoUrl || '';
    if (!repoUrl) {
      await fail(t(normalizeLocale(this.store.appearance.language), 'projectRepoRequired'));
      return;
    }
    const accessError = this.review.validateCreateAccess({
      provider,
      channelId: message.channelId,
      repoUrl,
      origin: defaults.origin,
    });
    if (accessError) {
      await fail(accessError);
      return;
    }
    const secrets = await this.review.applyCreatePageSecrets({
      provider,
      gitlabToken: message.gitlabToken,
      githubToken: message.githubToken,
      discordToken: message.discordToken,
    });
    if (!secrets.ok) {
      await fail(secrets.message);
      return;
    }
    const channelId = message.channelId.trim();
    const hello = await this.postPageChannelHello('review', channelId);
    if (!hello.ok) {
      await fail(hello.message);
      return;
    }
    // Project review channel is what settings and later reloads read.
    // Page access alone is dropped when that project channel is still empty.
    await this.store.setCatalogChannels({ review: channelId });
    await this.store.setProjectRepo({ provider, repoUrl });
    const id = await this.store.createPage(name, 'review', message.description);
    if (!id) {
      await fail('Failed to create page');
      return;
    }
    await this.review.savePageAccess(id, {
      provider,
      channelId,
      repoUrl,
    });
    this.review.bindReviewChannel(channelId);
    await this.store.touchPageConfig(id);
    await this.pushBaseAfterPageHello();
    this.activePageByWebview.set(webview, id);
    this.persistSurfacePage(webview, id);
    await webview.postMessage({ type: 'reviewCreatePageDone' });
    await webview.postMessage({ type: 'openPage', pageId: id });
    // Load once here. Later activePage events for the same pageId are ignored (rate limits).
    await this.runReviewChannelLoad(webview, id, 'initial', () => this.review.loadInitial(id));
    this.armReviewRefresh(webview);
  }

  private async openReviewPageSettings(webview: vscode.Webview, pageId: string): Promise<void> {
    const page = this.store.page(pageId);
    if (!page || page.kind !== 'review') {
      return;
    }
    const defaults = await this.review.createPageDefaults();
    if ('error' in defaults) {
      void vscode.window.showErrorMessage(`Syn3: ${defaults.error}`);
      return;
    }
    const access = await this.review.getAccess(pageId);
    const projectRepo = this.store.projectRepo();
    const paths = this.store.activeReviewPaths();
    await webview.postMessage({
      type: 'reviewPageSettingsPanel',
      pageId,
      name: page.name,
      description: page.description || '',
      origin: defaults.origin,
      repoUrl: projectRepo?.repoUrl || access?.repoUrl || defaults.origin,
      suggestedProvider: projectRepo?.provider || access?.provider || defaults.suggestedProvider,
      channelId: access?.channelId || this.store.catalogChannels().review || '',
      hasGitlab: defaults.hasGitlab,
      hasGithub: defaults.hasGithub,
      hasDiscord: defaults.hasDiscord,
      githubToken: defaults.githubToken,
      gitlabToken: defaults.gitlabToken,
      reviewSkillPath: paths.skillPath,
      reviewDirPath: paths.dirPath,
      reviewModel: paths.model,
      reviewFixModel: paths.fixModel,
    });
  }

  private async updateReviewPageFromPanel(
    webview: vscode.Webview,
    message: {
      pageId: string;
      name: string;
      provider: ReviewHostProvider;
      channelId: string;
      repoUrl: string;
      description?: string;
      gitlabToken?: string;
      githubToken?: string;
      discordToken?: string;
    },
  ): Promise<void> {
    const page = this.store.page(message.pageId);
    if (!page || page.kind !== 'review') {
      return;
    }
    const name = message.name.trim();
    if (!name) {
      void vscode.window.showErrorMessage('Syn3: page name is required');
      return;
    }
    const provider = isReviewHostProvider(message.provider) ? message.provider : undefined;
    if (!provider) {
      void vscode.window.showErrorMessage('Syn3: choose GitLab or GitHub');
      return;
    }
    const defaults = await this.review.createPageDefaults();
    if ('error' in defaults) {
      void vscode.window.showErrorMessage(`Syn3: ${defaults.error}`);
      return;
    }
    const accessError = this.review.validateCreateAccess({
      provider,
      channelId: message.channelId,
      repoUrl: message.repoUrl,
      origin: defaults.origin,
    });
    if (accessError) {
      void vscode.window.showErrorMessage(`Syn3: ${accessError}`);
      return;
    }
    const secrets = await this.review.applyCreatePageSecrets({
      provider,
      gitlabToken: message.gitlabToken,
      githubToken: message.githubToken,
      discordToken: message.discordToken,
    });
    if (!secrets.ok) {
      void vscode.window.showErrorMessage(`Syn3: ${secrets.message}`);
      return;
    }
    const previous = await this.review.getAccess(message.pageId);
    await this.store.setPageMeta(message.pageId, name, message.description);
    const channelId = message.channelId.trim();
    const repoUrl = (message.repoUrl || '').trim() || this.store.projectRepo()?.repoUrl || '';
    if (!repoUrl) {
      void vscode.window.showErrorMessage(
        `Syn3: ${t(normalizeLocale(this.store.appearance.language), 'projectRepoRequired')}`,
      );
      return;
    }
    await this.store.setCatalogChannels({ review: channelId });
    await this.store.setProjectRepo({ provider, repoUrl });
    await this.review.savePageAccess(message.pageId, {
      provider,
      channelId,
      repoUrl,
    });
    this.review.bindReviewChannel(channelId);
    await this.store.touchPageConfig(message.pageId);
    if (previous?.channelId !== channelId) {
      this.review.dropWindow(message.pageId);
      await this.runReviewChannelLoad(webview, message.pageId, 'initial', () =>
        this.review.loadInitial(message.pageId),
      );
    }
  }

  private async pushReviewState(webview: vscode.Webview, state: ReviewPageState): Promise<void> {
    await webview.postMessage({ type: 'reviewState', review: state });
  }

  /**
   * Open a review page. A window already fetched for this page is shown as-is.
   * Discord is hit only for the first load, or when a fetch is not already running.
   * The project's review channel is used when the page binding has none.
   */
  private async showReviewPage(webview: vscode.Webview, pageId: string): Promise<void> {
    const access = await this.review.getAccess(pageId);
    const projectChannel = (this.store.catalogChannels().review || '').trim();
    this.review.bindReviewChannel(projectChannel);
    const channel = (access?.channelId || projectChannel).trim();
    if (!channel) {
      this.review.dropWindow(pageId);
      await this.pushReviewState(webview, this.review.snapshot(pageId));
      return;
    }
    if (this.review.hasWindow(pageId)) {
      await this.pushReviewState(webview, this.review.snapshot(pageId));
      return;
    }
    if (this.review.isLoading(pageId)) {
      return;
    }
    const override = access?.channelId?.trim() ? undefined : projectChannel;
    await this.runReviewChannelLoad(webview, pageId, 'initial', () =>
      this.review.loadInitial(pageId, override),
    );
  }

  /**
   * Project switch: forget messages from the previous review channel.
   * If the new project has a review channel, open review pages read it.
   */
  private async reloadReviewOnProjectChange(): Promise<void> {
    const projectId = this.store.activeProjectId() ?? '';
    const channel = (this.store.catalogChannels().review || '').trim();
    const key = `${projectId}\n${channel}`;
    if (key === this.reviewProjectKey) {
      return;
    }
    const first = this.reviewProjectKey === '';
    this.reviewProjectKey = key;
    if (first) {
      return;
    }
    this.review.dropAllWindows();
    for (const webview of this.webviews) {
      if (!this.readyWebviews.has(webview)) {
        continue;
      }
      const pageId = this.pageIdFor(webview);
      if (this.store.page(pageId)?.kind !== 'review') {
        continue;
      }
      await this.showReviewPage(webview, pageId);
    }
  }

  /**
   * Paint a placeholder, run git/Discord work, then replace the placeholder
   * with the settled snapshot. A failed attempt pushes the cleared page itself.
   */
  private async withReviewPlaceholder<T extends { kind: string; state?: ReviewPageState }>(
    webview: vscode.Webview,
    begin: () => ReviewPageState,
    end: () => ReviewPageState,
    run: () => Promise<T>,
  ): Promise<T> {
    let result: T;
    try {
      await this.pushReviewState(webview, begin());
      result = await run();
    } catch (error) {
      await this.pushReviewState(webview, end());
      throw error;
    }
    const state = end();
    if (result.kind === 'state') {
      return { ...result, state };
    }
    await this.pushReviewState(webview, state);
    return result;
  }

  /** Push a skeleton edge, run the fetch, then push the settled window. */
  private async runReviewChannelLoad(
    webview: vscode.Webview,
    pageId: string,
    edge: ReviewLoadEdge,
    load: () => Promise<ReviewPageState>,
  ): Promise<void> {
    await this.pushReviewState(webview, this.review.beginLoad(pageId, edge));
    try {
      await load();
    } finally {
      await this.pushReviewState(webview, this.review.finishLoad(pageId));
    }
  }

  private async handleReviewPlus(webview: vscode.Webview, pageId: string): Promise<void> {
    const result = await this.review.handleCreateMr(pageId);
    if (result.kind === 'needPanel') {
      await webview.postMessage({
        type: 'reviewMrPanel',
        pageId,
        branches: result.branches,
        parent: result.parent,
        people: result.people,
        defaultAssignee: result.defaultAssignee,
        provider: result.provider,
      });
      return;
    }
    if (result.kind === 'notice') {
      this.toastReviewNotice(result.provider, result.code);
      return;
    }
    void vscode.window.showErrorMessage(`Syn3: ${result.message}`);
  }

  private async handleReviewPull(webview: vscode.Webview, pageId: string): Promise<void> {
    const title = this.review.pullSkeletonTitle();
    const result = await this.withReviewPlaceholder(
      webview,
      () => this.review.beginMrSkeleton(pageId, title, false),
      () => this.review.endMrSkeleton(pageId, title),
      () => this.review.pullExistingMr(pageId),
    );
    if (result.kind === 'notice') {
      this.toastReviewNotice(result.provider, result.code);
      return;
    }
    await this.handleReviewMrResult(webview, pageId, result, true);
  }

  private toastReviewNotice(
    provider: ReviewHostProvider,
    code: 'alreadyOpen' | 'noOpen' | 'alreadyInChannel' | 'added',
  ): void {
    const locale = normalizeLocale(this.store.appearance.language);
    const github = provider === 'github';
    const key =
      code === 'alreadyOpen'
        ? github
          ? 'reviewPrAlreadyOpen'
          : 'reviewMrAlreadyOpen'
        : code === 'noOpen'
          ? github
            ? 'reviewNoOpenPr'
            : 'reviewNoOpenMr'
          : code === 'alreadyInChannel'
            ? github
              ? 'reviewPrInChannel'
              : 'reviewMrInChannel'
            : github
              ? 'reviewPrAdded'
              : 'reviewMrAdded';
    void vscode.window.showInformationMessage(`Syn3: ${t(locale, key)}`);
  }

  private async handleReviewMrResult(
    webview: vscode.Webview,
    pageId: string,
    result:
      | { kind: 'state'; state: ReviewPageState; provider?: ReviewHostProvider }
      | { kind: 'discordFail'; mr: ReviewMr; message: string }
      | { kind: 'error'; message: string },
    announceAdded = false,
  ): Promise<void> {
    if (result.kind === 'error') {
      void vscode.window.showErrorMessage(`Syn3: ${result.message}`);
      return;
    }
    if (result.kind === 'discordFail') {
      this.pendingDiscordMr = { pageId, mr: result.mr };
      const locale = normalizeLocale(this.store.appearance.language);
      const choice = await vscode.window.showErrorMessage(
        t(locale, 'reviewDiscordFail'),
        t(locale, 'reviewRefresh'),
      );
      if (choice === t(locale, 'reviewRefresh')) {
        const retry = await this.withReviewPlaceholder(
          webview,
          () => this.review.beginMrSkeleton(pageId, result.mr.title, result.mr.draft),
          () => this.review.endMrSkeleton(pageId, result.mr.title),
          () => this.review.retryDiscordPost(pageId, result.mr),
        );
        await this.handleReviewMrResult(webview, pageId, retry, announceAdded);
      }
      return;
    }
    this.pendingDiscordMr = undefined;
    await this.pushReviewState(webview, result.state);
    if (!announceAdded) {
      return;
    }
    const provider = result.provider ?? (await this.review.getAccess(pageId))?.provider;
    if (provider) {
      this.toastReviewNotice(provider, 'added');
    }
  }

  private async handleReviewFileResult(
    webview: vscode.Webview,
    pageId: string,
    messageId: string,
    result:
      | { kind: 'state'; state: ReviewPageState }
      | { kind: 'fileFail'; message: string }
      | { kind: 'error'; message: string },
  ): Promise<void> {
    if (result.kind === 'error') {
      void vscode.window.showErrorMessage(`Syn3: ${result.message}`);
      return;
    }
    if (result.kind === 'fileFail') {
      const locale = normalizeLocale(this.store.appearance.language);
      const choice = await vscode.window.showErrorMessage(
        t(locale, 'reviewFileFail'),
        t(locale, 'reviewRetry'),
      );
      if (choice === t(locale, 'reviewRetry')) {
        const retry = await this.withReviewPlaceholder(
          webview,
          () => this.review.beginReviewSkeleton(pageId, messageId),
          () => this.review.endReviewSkeleton(pageId, messageId),
          () => this.review.retryReviewFile(pageId, messageId),
        );
        await this.handleReviewFileResult(webview, pageId, messageId, retry);
      }
      return;
    }
    await this.pushReviewState(webview, result.state);
  }

  private async handleReviewRootFileResult(
    webview: vscode.Webview,
    pageId: string,
    branch: string,
    result:
      | { kind: 'state'; state: ReviewPageState }
      | { kind: 'fileFail'; message: string }
      | { kind: 'error'; message: string },
  ): Promise<void> {
    if (result.kind === 'error') {
      void vscode.window.showErrorMessage(`Syn3: ${result.message}`);
      return;
    }
    if (result.kind === 'fileFail') {
      const locale = normalizeLocale(this.store.appearance.language);
      const choice = await vscode.window.showErrorMessage(
        t(locale, 'reviewFileFail'),
        t(locale, 'reviewRetry'),
      );
      if (choice === t(locale, 'reviewRetry')) {
        this.review.bindReviewChannel(this.store.catalogChannels().review || '');
        const retry = await this.withReviewPlaceholder(
          webview,
          () => this.review.beginRootSkeleton(pageId, branch),
          () => this.review.endRootSkeleton(pageId, branch),
          () => this.review.retryRootReviewFile(pageId),
        );
        await this.handleReviewRootFileResult(webview, pageId, branch, retry);
      }
      return;
    }
    await this.pushReviewState(webview, result.state);
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
    if (!figmaLinkPreviewEnabled && parseFigmaFrame(url)) {
      await webview.postMessage({
        type: 'previewLinkResult',
        requestId,
        url,
        empty: true,
      });
      return;
    }
    const frame = parseFigmaFrame(url);
    const figmaToken = frame
      ? await readFigmaToken(this.hostSecrets, this.store.activeProfileId)
      : undefined;
    const cacheKey = frame ? figmaPreviewCacheKey(url, figmaToken) : url;
    const cached = this.linkPreviewCache.get(cacheKey);
    if (cached) {
      await webview.postMessage({
        type: 'previewLinkResult',
        requestId,
        url,
        ...cached,
      });
      return;
    }
    let inflight = this.linkPreviewInflight.get(cacheKey);
    if (!inflight) {
      inflight = this.fetchLinkPreview(cacheKey, url, frame, figmaToken).finally(() => {
        this.linkPreviewInflight.delete(cacheKey);
      });
      this.linkPreviewInflight.set(cacheKey, inflight);
    }
    const result = (await inflight) ?? this.linkPreviewCache.get(cacheKey) ?? { empty: true as const };
    await webview.postMessage({
      type: 'previewLinkResult',
      requestId,
      url,
      ...result,
    });
  }

  private async fetchLinkPreview(
    cacheKey: string,
    url: string,
    frame: ReturnType<typeof parseFigmaFrame>,
    figmaToken: string | undefined,
  ): Promise<{ image?: string; description?: string; empty?: true } | undefined> {
    try {
      if (frame) {
        if (!figmaToken) {
          const empty = { empty: true as const };
          this.linkPreviewCache.set(cacheKey, empty);
          return empty;
        }
        const found = await loadFigmaPreview(frame, figmaToken, async (imageUrl) => {
          const file = await downloadPreviewImage(imageUrl, 2_500_000, 20_000);
          if ('dataUrl' in file) {
            return file.dataUrl;
          }
          return 'tooBig' in file ? 'too-big' : 'failed';
        });
        const locale = normalizeLocale(this.store.appearance.language);
        if (found.retry) {
          const description = found.limited
            ? found.limitQuota
              ? t(locale, 'figmaPreviewLimitedQuota')
              : t(locale, 'figmaPreviewLimited', {
                  minutes: Math.max(1, Math.ceil((found.retryAfterSec ?? 60) / 60)),
                })
            : found.detail || t(locale, 'figmaPreviewEmpty');
          return { description };
        }
        const description = found.denied
          ? t(locale, 'figmaPreviewDenied')
          : found.detail || t(locale, 'figmaPreviewEmpty');
        if (found.image) {
          const hit = { image: found.image };
          this.linkPreviewCache.set(cacheKey, hit);
          return hit;
        }
        const miss = { description };
        if (!found.denied) {
          this.linkPreviewCache.set(cacheKey, miss);
        }
        return miss;
      }
      const parsed = vscode.Uri.parse(url);
      if (parsed.scheme !== 'http' && parsed.scheme !== 'https') {
        const empty = { empty: true as const };
        this.linkPreviewCache.set(cacheKey, empty);
        return empty;
      }
      const html = await fetchTextLimited(url, 400_000, 8_000);
      if (!html) {
        const empty = { empty: true as const };
        this.linkPreviewCache.set(cacheKey, empty);
        return empty;
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
        const empty = { empty: true as const };
        this.linkPreviewCache.set(cacheKey, empty);
        return empty;
      }
      const hit = { image, description };
      this.linkPreviewCache.set(cacheKey, hit);
      return hit;
    } catch {
      const empty = { empty: true as const };
      this.linkPreviewCache.set(cacheKey, empty);
      return empty;
    }
  }

  private toolIcon(webview: vscode.Webview, name: string, mode?: string, hidden = false): string {
    const light = webview.asWebviewUri(vscode.Uri.joinPath(this.media, 'icons', `${name}-light.svg`));
    const dark = webview.asWebviewUri(vscode.Uri.joinPath(this.media, 'icons', `${name}-dark.svg`));
    const modeAttr = mode ? ` data-mode="${mode}"` : '';
    const hiddenAttr = hidden ? ' hidden' : '';
    return `<img class="tool-icon tone-light" src="${light}" alt=""${modeAttr}${hiddenAttr}><img class="tool-icon tone-dark" src="${dark}" alt=""${modeAttr}${hiddenAttr}>`;
  }

  /** Cache-bust dev reloads without dropping asWebviewUri's own query. */
  private mediaUri(webview: vscode.Webview, rev: string, ...parts: string[]): vscode.Uri {
    const uri = webview.asWebviewUri(vscode.Uri.joinPath(this.media, ...parts));
    const query = uri.query ? `${uri.query}&rev=${rev}` : `rev=${rev}`;
    return uri.with({ query });
  }

  private html(webview: vscode.Webview, chrome: 'view' | 'panel', surface: MapSurface, rev: string): string {
    const nonce = crypto.randomBytes(16).toString('base64');
    const css = this.mediaUri(webview, rev, 'map.css');
    const js = this.mediaUri(webview, rev, 'map.js');
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
<body class="chrome-${chrome}" data-boot-rev="${rev}" data-surface="${surface}"${sideAttr} data-note-icon-light="${noteIconLight}" data-note-icon-dark="${noteIconDark}" data-group-icon-light="${groupIconLight}" data-group-icon-dark="${groupIconDark}" data-vscode-context='{"preventDefaultContextMenuItems": true}'>
  <div class="map-chrome">
  <div class="history-bar">
    <div class="toolbar-profile">
      <button id="toolbar-profile" class="history-btn" type="button" aria-label="Профиль" aria-haspopup="menu" aria-expanded="false">
        ${icon('person')}
      </button>
      <div id="toolbar-profile-menu" class="toolbar-profile-menu" hidden role="menu" aria-label="Профили">
        <div id="toolbar-profile-list" class="toolbar-profile-list"></div>
        <div class="toolbar-profile-create">
          <button id="toolbar-profile-add" class="history-btn" type="button" title="Создать профиль" aria-label="Создать профиль">
            ${icon('add')}
          </button>
        </div>
      </div>
    </div>
    <div class="toolbar-project">
      <button id="toolbar-project" class="history-btn" type="button" aria-label="Project" aria-haspopup="menu" aria-expanded="false">
        ${icon('apps-line')}
      </button>
      <div id="toolbar-project-menu" class="toolbar-profile-menu" hidden role="menu" aria-label="Projects">
        <div id="toolbar-project-list" class="toolbar-profile-list"></div>
        <div class="toolbar-profile-create">
          <button id="toolbar-project-add" class="history-btn" type="button" title="New project" aria-label="New project">
            ${icon('add')}
          </button>
        </div>
      </div>
    </div>
    <button id="toolbar-lock" class="history-btn toolbar-lock" type="button" title="Fix pages" aria-label="Fix pages" aria-pressed="false"></button>
    <button id="toolbar-cloud-check" class="history-btn toolbar-cloud-btn" type="button" title="Проверить Discord" aria-label="Проверить Discord" hidden></button>
    <button id="toolbar-cloud-pull" class="history-btn toolbar-cloud-btn" type="button" title="Принять" aria-label="Принять" disabled></button>
    <button id="toolbar-cloud-push" class="history-btn toolbar-cloud-btn" type="button" title="Отправить" aria-label="Отправить" disabled></button>
    <span id="toolbar-base-loader" class="toolbar-base-loader pager-cloud-loader" hidden aria-hidden="true"></span>
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
          ${icon('stack-line')}
        </button>
        <div id="toolbar-view-menu" class="syn3-menu toolbar-view-menu" hidden role="menu" aria-label="Вид"></div>
      </div>
      <button id="toolbar-collapse" class="history-btn" type="button" title="Свернуть все группы" aria-label="Свернуть все группы">
        ${icon('collapse-all', 'collapse')}
        ${icon('expand-all', 'expand', true)}
      </button>
      <div class="toolbar-view toolbar-create">
        <button id="toolbar-create" class="history-btn" type="button" title="Создать" aria-label="Создать" aria-haspopup="menu" aria-expanded="false">
          ${icon('function-add-line')}
        </button>
        <div id="toolbar-create-menu" class="syn3-menu toolbar-view-menu" hidden role="menu" aria-label="Создать"></div>
      </div>
      <button id="toolbar-review-tab" class="history-btn" type="button" title="Открыть во вкладке" aria-label="Открыть во вкладке" hidden>
        ${icon('split-horizontal')}
      </button>
      <div class="toolbar-panels">
        <button id="toolbar-panels" class="history-btn" type="button" title="Toggle panels" aria-label="Toggle panels" aria-haspopup="true" aria-expanded="false">
          ${icon('dashboard-horizontal-line')}
        </button>
        <div id="toolbar-panels-menu" class="toolbar-panels-menu" hidden role="group" aria-label="Panel toggles">
          <button type="button" id="panel-toggle-bottom" class="history-btn" data-action="toggleBottom" title="Toggle bottom panel" aria-label="Toggle bottom panel" aria-pressed="false">
            ${icon('layout-bottom-fill')}
          </button>
          <button type="button" id="panel-toggle-left" class="history-btn" data-action="toggleLeft" title="Toggle left sidebar" aria-label="Toggle left sidebar" aria-pressed="false">
            ${icon('layout-left-fill')}
          </button>
          <button type="button" id="panel-toggle-right" class="history-btn" data-action="toggleRight" title="Toggle right sidebar" aria-label="Toggle right sidebar" aria-pressed="false">
            ${icon('layout-right-fill')}
          </button>
        </div>
      </div>
      <button id="toolbar-explorer" class="history-btn" type="button" title="Explorer" aria-label="Explorer">
        ${icon('layout-column-fill')}
      </button>
      <div class="toolbar-more">
        <button id="toolbar-more" class="history-btn" type="button" title="Menu" aria-label="Menu" aria-haspopup="menu">
          ${icon('icon')}
        </button>
        <div id="toolbar-menu" class="toolbar-menu" hidden role="menu">
          <div class="toolbar-menu-flyout" id="menu-create-page-wrap">
            <button type="button" class="toolbar-menu-parent" role="menuitem" id="menu-create-page" aria-haspopup="menu" aria-expanded="false"><span data-i18n="menuNewPage">Create page</span><span class="toolbar-menu-caret" aria-hidden="true">▸</span></button>
            <div id="menu-create-page-sub" class="toolbar-menu-sub" hidden role="menu">
              <button type="button" data-action="createPageFiles" role="menuitem"><span data-i18n="menuNewPageGroups">Explorer</span></button>
              <button type="button" data-action="createPageNotes" role="menuitem"><span data-i18n="menuNewPageNotes">Notes</span></button>
              <button type="button" data-action="createPageLinks" role="menuitem"><span data-i18n="menuNewPageLinks">Links</span></button>
              <button type="button" data-action="createPageReview" role="menuitem"><span data-i18n="menuNewPageReview">Review</span></button>
            </div>
          </div>
          <button type="button" data-action="deletePage" role="menuitem" id="menu-delete-page">${icon('ellipsis')}Delete Page</button>
          <button type="button" data-action="openSettings" role="menuitem">${icon('gear')}Settings</button>
          <div class="toolbar-menu-sep" role="separator"></div>
          <button type="button" data-action="whySyn3" role="menuitem" id="menu-why">${icon('bill')}<span data-i18n="menuWhy">Why Syn3</span></button>
        </div>
      </div>
    </div>
  </div>
  <div id="pager" class="pager" hidden>
    <div class="pager-history">
      <button id="history-back" class="history-btn" type="button" title="Назад" aria-label="Назад" disabled>
        ${icon('arrow-left')}
      </button>
      <button id="history-accept" class="history-btn" type="button" title="Готово" aria-label="Готово" hidden>
        ${icon('check')}
      </button>
      <button id="history-forward" class="history-btn" type="button" title="Вперёд" aria-label="Вперёд" disabled>
        ${icon('arrow-right')}
      </button>
    </div>
  </div>
  </div>
  <div id="stage" class="page-stage">
    <div id="root" class="map-page"></div>
    <aside id="review-file" class="review-file" hidden>
      <div class="review-file-head">
        <span id="review-file-title" class="review-file-title"></span>
        <button id="review-file-close" class="history-btn" type="button" aria-label="Закрыть">×</button>
      </div>
      <div id="review-file-body" class="review-file-body"></div>
    </aside>
  </div>
  <script nonce="${nonce}">
    (function () {
      const vscode = acquireVsCodeApi();
      window.__syn3Vscode = vscode;
      const rev = ${JSON.stringify(rev)};
      let reported = false;
      function fail() {
        if (reported) return;
        reported = true;
        vscode.postMessage({ type: 'assetsFailed', rev: rev });
      }
      const link = document.querySelector('link[rel="stylesheet"]');
      if (link) link.addEventListener('error', fail);
      window.addEventListener('error', (event) => {
        const target = event.target;
        if (target && target.tagName === 'SCRIPT' && target.src) fail();
      }, true);
    })();
  </script>
  <script nonce="${nonce}" src="${js}"></script>
</body>
</html>`;
  }
}
