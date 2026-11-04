import { fingerprint } from './history';
import type {
  ColumnsMode,
  GroupsLayout,
  MapLayout,
  SurfaceCollapsed,
} from './markerStore';

/** Live layout of the active profile — not committed. */
export const POS_LOCAL_PATH = '.syn3/pos_local.json';
/** Committed layout backup per profile. */
export const POS_REMOTE_PATH = '.syn3/pos_remote.json';

export interface PageLayoutPos {
  order: number;
  layout: MapLayout;
  groupsLayout: GroupsLayout;
  collapsed: SurfaceCollapsed;
}

export interface MarkerLayoutPos {
  order: number;
  columns?: ColumnsMode;
}

export interface NoteLayoutPos {
  order: number;
}

export interface LinkLayoutPos {
  order: number;
}

/** Layout fingerprint of one style profile. */
export interface ProfileLayout {
  pages: Record<string, PageLayoutPos>;
  markers: Record<string, MarkerLayoutPos>;
  notes: Record<string, NoteLayoutPos>;
  links: Record<string, LinkLayoutPos>;
}

/** Working card (group or note) for one profile — local-only. */
export interface WorkingFocus {
  kind: 'marker' | 'note';
  id: string;
}

/** Local queue: tell the page channel this page was removed. */
export interface PageTombstone {
  kind: 'EXPLORER' | 'NOTES' | 'LINKS' | 'REVIEW';
  channelId: string;
  name: string;
  pageKind: 'files' | 'notes' | 'links' | 'review';
  order: number;
  number: number;
  headerDate: string;
  messageId: string;
}

/** Active map page per surface — local-only, not in Discord configs. */
export interface LocalSurfaces {
  explorer: { page: string };
  bottom: { page: string };
  left: { page: string };
  right: { page: string };
}

export interface PositionsFile {
  version: 1;
  profiles: Record<string, ProfileLayout>;
  /**
   * Working card per profile id. Lives only in pos_local; never packed into
   * ProfileLayout / pos_remote fingerprints.
   */
  focus?: Record<string, WorkingFocus>;
  /** Entity ids under the draft divider, per page. Cleared after a successful push. */
  drafts?: Record<string, string[]>;
  /** Fingerprint of the last pushed or pulled page snapshot. A mismatch means the page can be sent. */
  pageClean?: Record<string, string>;
  /**
   * Pages removed locally whose Discord message still exists.
   * Retried until the channel accepts a deleted page config.
   */
  pageTombstones?: Record<string, PageTombstone>;
  /** Active page per panel. */
  surfaces?: LocalSurfaces;
  /** Lock shown on every page tab. A difference from pagesFixedSent is a pending send. */
  pagesFixed?: true;
  /** Lock value last published to Discord. Absent means the sent pages were unlocked. */
  pagesFixedSent?: true;
}

function emptyCollapsedLocal(): SurfaceCollapsed {
  return { explorer: {}, bottom: {}, left: {}, right: {} };
}

function packFlagsLocal(flags: Record<string, boolean> | undefined): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  if (!flags) {
    return result;
  }
  for (const id of Object.keys(flags).sort()) {
    if (flags[id]) {
      result[id] = true;
    }
  }
  return result;
}

function packCollapsedLocal(collapsed: SurfaceCollapsed): SurfaceCollapsed {
  return {
    explorer: packFlagsLocal(collapsed.explorer),
    bottom: packFlagsLocal(collapsed.bottom),
    left: packFlagsLocal(collapsed.left),
    right: packFlagsLocal(collapsed.right),
  };
}

function normalizeColumnsLocal(value: unknown): ColumnsMode | undefined {
  return value === 'flow' || value === '1' || value === '2' || value === '3' ? value : undefined;
}

function normalizeMapLayoutLocal(value: unknown): MapLayout {
  return value === 'list' ? 'list' : 'chips';
}

function normalizeGroupsLayoutLocal(value: unknown): GroupsLayout {
  return value === '1' || value === '2' || value === '3' ? value : 'flow';
}

export function emptyProfileLayout(): ProfileLayout {
  return { pages: {}, markers: {}, notes: {}, links: {} };
}

export function emptyPositions(): PositionsFile {
  return { version: 1, profiles: {} };
}

export function cloneProfileLayout(layout: ProfileLayout): ProfileLayout {
  return JSON.parse(JSON.stringify(packProfileLayout(layout))) as ProfileLayout;
}

/** Drop unknown ids; returns whether anything was removed. */
export function pruneProfileLayout(
  layout: ProfileLayout,
  pageIds: Set<string>,
  markerIds: Set<string>,
  noteIds: Set<string>,
  linkIds: Set<string> = new Set(),
): boolean {
  let changed = false;
  for (const id of Object.keys(layout.pages)) {
    if (!pageIds.has(id)) {
      delete layout.pages[id];
      changed = true;
      continue;
    }
    const page = layout.pages[id];
    const nextCollapsed = emptyCollapsedLocal();
    for (const surface of ['explorer', 'bottom', 'left', 'right'] as const) {
      for (const [foldId, on] of Object.entries(page.collapsed[surface])) {
        if (on && (markerIds.has(foldId) || noteIds.has(foldId) || linkIds.has(foldId))) {
          nextCollapsed[surface][foldId] = true;
        } else if (on) {
          changed = true;
        }
      }
    }
    page.collapsed = nextCollapsed;
  }
  for (const id of Object.keys(layout.markers)) {
    if (!markerIds.has(id)) {
      delete layout.markers[id];
      changed = true;
    }
  }
  for (const id of Object.keys(layout.notes)) {
    if (!noteIds.has(id)) {
      delete layout.notes[id];
      changed = true;
    }
  }
  if (!layout.links) {
    layout.links = {};
  }
  for (const id of Object.keys(layout.links)) {
    if (!linkIds.has(id)) {
      delete layout.links[id];
      changed = true;
    }
  }
  return changed;
}

export function prunePositionsFile(
  file: PositionsFile,
  pageIds: Set<string>,
  markerIds: Set<string>,
  noteIds: Set<string>,
  linkIds: Set<string> = new Set(),
): boolean {
  let changed = false;
  for (const layout of Object.values(file.profiles)) {
    if (pruneProfileLayout(layout, pageIds, markerIds, noteIds, linkIds)) {
      changed = true;
    }
  }
  if (pruneFocusMap(file, markerIds, noteIds)) {
    changed = true;
  }
  return changed;
}

/** Drop focus entries whose marker/note no longer exists. */
export function pruneFocusMap(
  file: PositionsFile,
  markerIds: Set<string>,
  noteIds: Set<string>,
): boolean {
  if (!file.focus) {
    return false;
  }
  let changed = false;
  for (const [profileId, entry] of Object.entries(file.focus)) {
    const ok =
      entry.kind === 'marker' ? markerIds.has(entry.id) : entry.kind === 'note' ? noteIds.has(entry.id) : false;
    if (!ok) {
      delete file.focus[profileId];
      changed = true;
    }
  }
  if (Object.keys(file.focus).length === 0) {
    delete file.focus;
    changed = true;
  }
  return changed;
}

export function normalizeFocus(raw: unknown): Record<string, WorkingFocus> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return undefined;
  }
  const result: Record<string, WorkingFocus> = {};
  for (const [profileId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      continue;
    }
    const entry = value as { kind?: unknown; id?: unknown };
    if (
      (entry.kind === 'marker' || entry.kind === 'note') &&
      typeof entry.id === 'string' &&
      entry.id.length > 0
    ) {
      result[profileId] = { kind: entry.kind, id: entry.id };
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/** Stable sorted focus map for writing pos_local. */
export function packFocus(
  focus: Record<string, WorkingFocus> | undefined,
): Record<string, WorkingFocus> | undefined {
  if (!focus) {
    return undefined;
  }
  const result: Record<string, WorkingFocus> = {};
  for (const profileId of Object.keys(focus).sort()) {
    const entry = focus[profileId];
    if (
      (entry.kind === 'marker' || entry.kind === 'note') &&
      typeof entry.id === 'string' &&
      entry.id.length > 0
    ) {
      result[profileId] = { kind: entry.kind, id: entry.id };
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

export function positionsIsEmpty(file: PositionsFile): boolean {
  return Object.keys(file.profiles).length === 0;
}

export function packProfileLayout(layout: ProfileLayout): ProfileLayout {
  const pages: Record<string, PageLayoutPos> = {};
  for (const id of Object.keys(layout.pages).sort()) {
    const page = layout.pages[id];
    pages[id] = {
      order: page.order,
      layout: normalizeMapLayoutLocal(page.layout),
      groupsLayout: normalizeGroupsLayoutLocal(page.groupsLayout),
      collapsed: packCollapsedLocal(page.collapsed),
    };
  }
  const markers: Record<string, MarkerLayoutPos> = {};
  for (const id of Object.keys(layout.markers).sort()) {
    const marker = layout.markers[id];
    const entry: MarkerLayoutPos = { order: marker.order };
    const columns = normalizeColumnsLocal(marker.columns);
    if (columns && columns !== 'flow') {
      entry.columns = columns;
    }
    markers[id] = entry;
  }
  const notes: Record<string, NoteLayoutPos> = {};
  for (const id of Object.keys(layout.notes ?? {}).sort()) {
    notes[id] = { order: layout.notes[id].order };
  }
  const links: Record<string, LinkLayoutPos> = {};
  for (const id of Object.keys(layout.links ?? {}).sort()) {
    links[id] = { order: layout.links[id].order };
  }
  return { pages, markers, notes, links };
}

/** Stable JSON used to compare local vs remote fingerprints. */
export function profileLayoutJson(layout: ProfileLayout): string {
  return JSON.stringify(packProfileLayout(layout)) + '\n';
}

export function profileLayoutFingerprint(layout: ProfileLayout | undefined): string {
  if (!layout) {
    return '';
  }
  return fingerprint(profileLayoutJson(layout));
}

export function normalizeProfileLayout(raw: unknown): ProfileLayout {
  const result = emptyProfileLayout();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return result;
  }
  const source = raw as {
    pages?: unknown;
    markers?: unknown;
    notes?: unknown;
    links?: unknown;
  };
  if (source.pages && typeof source.pages === 'object' && !Array.isArray(source.pages)) {
    let index = 0;
    for (const [id, value] of Object.entries(source.pages as Record<string, unknown>)) {
      index++;
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        continue;
      }
      const def = value as Partial<PageLayoutPos>;
      result.pages[id] = {
        order: typeof def.order === 'number' ? def.order : index,
        layout: normalizeMapLayoutLocal(def.layout),
        groupsLayout: normalizeGroupsLayoutLocal(def.groupsLayout),
        collapsed: normalizeCollapsedField(def.collapsed),
      };
    }
  }
  if (source.markers && typeof source.markers === 'object' && !Array.isArray(source.markers)) {
    let index = 0;
    for (const [id, value] of Object.entries(source.markers as Record<string, unknown>)) {
      index++;
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        continue;
      }
      const def = value as Partial<MarkerLayoutPos>;
      const entry: MarkerLayoutPos = {
        order: typeof def.order === 'number' ? def.order : index,
      };
      const columns = normalizeColumnsLocal(def.columns);
      if (columns && columns !== 'flow') {
        entry.columns = columns;
      }
      result.markers[id] = entry;
    }
  }
  if (source.notes && typeof source.notes === 'object' && !Array.isArray(source.notes)) {
    let index = 0;
    for (const [id, value] of Object.entries(source.notes as Record<string, unknown>)) {
      index++;
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        continue;
      }
      const def = value as Partial<NoteLayoutPos>;
      result.notes[id] = {
        order: typeof def.order === 'number' ? def.order : index,
      };
    }
  }
  if (source.links && typeof source.links === 'object' && !Array.isArray(source.links)) {
    let index = 0;
    for (const [id, value] of Object.entries(source.links as Record<string, unknown>)) {
      index++;
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        continue;
      }
      const def = value as Partial<LinkLayoutPos>;
      result.links[id] = {
        order: typeof def.order === 'number' ? def.order : index,
      };
    }
  }
  return packProfileLayout(result);
}

/**
 * @param options.focus — keep the local-only working-card map (pos_local only).
 */
export function normalizeDrafts(raw: unknown): Record<string, string[]> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return undefined;
  }
  const result: Record<string, string[]> = {};
  for (const [pageId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(value)) {
      continue;
    }
    const ids = value.filter((id): id is string => typeof id === 'string' && id.length > 0);
    if (ids.length > 0) {
      result[pageId] = ids;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/** Last synced page fingerprints. Local-only, same lifetime as drafts. */
export function normalizePageClean(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return undefined;
  }
  const result: Record<string, string> = {};
  for (const [pageId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string' && value.trim()) {
      result[pageId] = value.trim();
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function normalizePageTombstones(raw: unknown): Record<string, PageTombstone> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return undefined;
  }
  const result: Record<string, PageTombstone> = {};
  for (const [pageId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      continue;
    }
    const item = value as Partial<PageTombstone>;
    const kind = item.kind;
    const pageKind = item.pageKind;
    const channelId = typeof item.channelId === 'string' ? item.channelId.trim() : '';
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    if (
      (kind !== 'EXPLORER' && kind !== 'NOTES' && kind !== 'LINKS' && kind !== 'REVIEW') ||
      (pageKind !== 'files' && pageKind !== 'notes' && pageKind !== 'links' && pageKind !== 'review') ||
      !channelId ||
      !name
    ) {
      continue;
    }
    result[pageId] = {
      kind,
      channelId,
      name,
      pageKind,
      order: typeof item.order === 'number' ? item.order : 0,
      number: typeof item.number === 'number' ? item.number : 0,
      headerDate: typeof item.headerDate === 'string' ? item.headerDate : '',
      messageId: typeof item.messageId === 'string' ? item.messageId : '',
    };
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

export function normalizeLocalSurfaces(raw: unknown): LocalSurfaces | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return undefined;
  }
  const source = raw as Partial<LocalSurfaces>;
  const pick = (key: keyof LocalSurfaces): { page: string } | undefined => {
    const entry = source[key];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return undefined;
    }
    const page = typeof (entry as { page?: unknown }).page === 'string'
      ? (entry as { page: string }).page.trim()
      : '';
    return page ? { page } : undefined;
  };
  const explorer = pick('explorer');
  const bottom = pick('bottom');
  const left = pick('left');
  const right = pick('right');
  if (!explorer || !bottom || !left || !right) {
    return undefined;
  }
  return { explorer, bottom, left, right };
}

export function normalizePositions(
  raw: unknown,
  options?: { focus?: boolean },
): PositionsFile {
  const result = emptyPositions();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return result;
  }
  const source = raw as {
    profiles?: unknown;
    focus?: unknown;
    drafts?: unknown;
    pageClean?: unknown;
    pageTombstones?: unknown;
    surfaces?: unknown;
    pagesFixed?: unknown;
    pagesFixedSent?: unknown;
  };
  if (!source.profiles || typeof source.profiles !== 'object' || Array.isArray(source.profiles)) {
    return result;
  }
  for (const [id, value] of Object.entries(source.profiles as Record<string, unknown>)) {
    result.profiles[id] = normalizeProfileLayout(value);
  }
  if (options?.focus) {
    const focus = normalizeFocus(source.focus);
    if (focus) {
      result.focus = focus;
    }
    const drafts = normalizeDrafts(source.drafts);
    if (drafts) {
      result.drafts = drafts;
    }
    const pageClean = normalizePageClean(source.pageClean);
    if (pageClean) {
      result.pageClean = pageClean;
    }
    const pageTombstones = normalizePageTombstones(source.pageTombstones);
    if (pageTombstones) {
      result.pageTombstones = pageTombstones;
    }
    const surfaces = normalizeLocalSurfaces(source.surfaces);
    if (surfaces) {
      result.surfaces = surfaces;
    }
    if (source.pagesFixed === true) {
      result.pagesFixed = true;
    }
    if (source.pagesFixedSent === true) {
      result.pagesFixedSent = true;
    }
  }
  return result;
}

function normalizeCollapsedField(raw: unknown): SurfaceCollapsed {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return emptyCollapsedLocal();
  }
  const source = raw as Partial<Record<'explorer' | 'bottom' | 'left' | 'right', unknown>>;
  const result = emptyCollapsedLocal();
  for (const surface of ['explorer', 'bottom', 'left', 'right'] as const) {
    const map = source[surface];
    if (!map || typeof map !== 'object' || Array.isArray(map)) {
      continue;
    }
    for (const [id, on] of Object.entries(map as Record<string, unknown>)) {
      if (on) {
        result[surface][id] = true;
      }
    }
  }
  return packCollapsedLocal(result);
}

export interface PositionSyncState {
  /** Local → remote is meaningful (local exists and differs). */
  canPush: boolean;
  /** Remote → local is meaningful (remote exists and differs). */
  canPull: boolean;
}

export function positionSyncState(
  local: ProfileLayout | undefined,
  remote: ProfileLayout | undefined,
): PositionSyncState {
  const localFp = profileLayoutFingerprint(local);
  const remoteFp = profileLayoutFingerprint(remote);
  if (!localFp && !remoteFp) {
    return { canPush: false, canPull: false };
  }
  if (!localFp) {
    return { canPush: false, canPull: !!remoteFp };
  }
  if (!remoteFp) {
    return { canPush: true, canPull: false };
  }
  if (localFp === remoteFp) {
    return { canPush: false, canPull: false };
  }
  return { canPush: true, canPull: true };
}
