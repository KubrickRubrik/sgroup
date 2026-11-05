import {
  type CatalogFile,
  type CatalogPageEntry,
  type CloudStamp,
  emptyCatalog,
  normalizeCatalog,
  normalizeCloudStamp,
  packCatalogChannels,
  pageFilePath,
  CATALOG_PATH,
  PAGES_DIR,
} from './configFormat';
import type {
  ClassDef,
  ColumnsMode,
  GroupsLayout,
  LinkDef,
  MapLayout,
  MarkerDef,
  NoteDef,
  PageDef,
  PageKind,
  SurfaceCollapsed,
} from './markerStore';

function emptyCollapsedLocal(): SurfaceCollapsed {
  return { explorer: {}, bottom: {}, left: {}, right: {} };
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

function normalizePageKindLocal(value: unknown): PageKind | undefined {
  return value === 'files' || value === 'notes' || value === 'links' || value === 'review'
    ? value
    : undefined;
}

function normalizeGroupDescriptionLocal(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n').slice(0, 3);
  const clipped = lines.join('\n').slice(0, 144);
  const trimmed = clipped.trim();
  return trimmed || undefined;
}

function normalizeIconsLocal(icons?: unknown): string[] | undefined {
  const out: string[] = [];
  if (Array.isArray(icons)) {
    for (const item of icons) {
      if (typeof item === 'string' && item.trim()) {
        out.push(item.trim());
        if (out.length >= 3) {
          break;
        }
      }
    }
  }
  return out.length > 0 ? out : undefined;
}

/** Review binding stored with the page, not in PROFILE_SYN3. */
export interface PageAccessConfig {
  provider: 'github' | 'gitlab';
  channelId: string;
  repoUrl: string;
}

/** On-disk page fallback (and Discord attachment body). */
export interface PageConfigFile {
  version: 1;
  /** Which page this file is. Several pages of one kind share a channel. */
  pageId?: string;
  /** Latest message drops this pageId only. Peers remove it on pull. */
  deleted?: true;
  page: {
    name: string;
    kind: PageKind;
    description?: string;
    /** Pager position. Lives with the page, not in the profile config. */
    order?: number;
    layout?: MapLayout;
    groupsLayout?: GroupsLayout;
  };
  /** Review pages only. */
  access?: PageAccessConfig;
  markers?: Record<string, PageMarkerEntry>;
  items?: Record<string, string[]>;
  added?: Record<string, Record<string, number>>;
  aliases?: Record<string, string>;
  classes?: Record<string, ClassDef>;
  classItems?: Record<string, string[]>;
  classAdded?: Record<string, Record<string, number>>;
  notes?: Record<string, PageNoteEntry>;
  links?: Record<string, PageLinkEntry>;
  cloud?: CloudStamp;
  /** Workspace lock at the moment this page was sent. */
  fixed?: boolean;
}

export interface PageMarkerEntry {
  label: string;
  color?: string;
  icons?: string[];
  alias?: string;
  description?: string;
  parent?: string;
  page?: string;
  columns?: ColumnsMode;
  locked?: true;
  order: number;
}

export interface PageNoteEntry {
  page?: string;
  markerId?: string;
  parentNote?: string;
  text: string;
  order: number;
  color?: string;
  icons?: string[];
  locked?: true;
}

export interface PageLinkEntry {
  label: string;
  description?: string;
  url?: string;
  parent?: string;
  page?: string;
  color?: string;
  order: number;
  locked?: true;
}

/** Assembled workspace from catalog + page files. */
export interface SplitWorkspace {
  catalog: CatalogFile;
  pages: Record<string, PageDef>;
  markers: Record<string, MarkerDef>;
  items: Record<string, string[]>;
  added: Record<string, Record<string, number>>;
  aliases: Record<string, string>;
  classes: Record<string, ClassDef>;
  classItems: Record<string, string[]>;
  classAdded: Record<string, Record<string, number>>;
  notes: Record<string, NoteDef>;
  links: Record<string, LinkDef>;
  pageCloud: Record<string, CloudStamp>;
}

export { CATALOG_PATH, PAGES_DIR, pageFilePath };

export function catalogEntryFromPage(id: string, page: PageDef): CatalogPageEntry {
  return {
    name: page.name,
    kind: page.kind,
    order: page.order,
    ...(page.description ? { description: page.description } : {}),
  };
}

export function buildCatalogFromPages(
  pages: Record<string, PageDef>,
  channels: CatalogFile['channels'] = { profile: '' },
  cloud?: CloudStamp,
): CatalogFile {
  const catalog = emptyCatalog();
  catalog.channels = packCatalogChannels(channels);
  for (const [id, page] of Object.entries(pages)) {
    catalog.pages[id] = catalogEntryFromPage(id, page);
  }
  if (cloud) {
    catalog.cloud = cloud;
  }
  return catalog;
}

export function packPageConfig(opts: {
  pageId: string;
  page: PageDef;
  markers: Record<string, MarkerDef>;
  items: Record<string, string[]>;
  added: Record<string, Record<string, number>>;
  aliases: Record<string, string>;
  classes: Record<string, ClassDef>;
  classItems: Record<string, string[]>;
  classAdded: Record<string, Record<string, number>>;
  notes: Record<string, NoteDef>;
  links: Record<string, LinkDef>;
  markerIdsOnPage: string[];
  noteIdsOnPage: string[];
  linkIdsOnPage: string[];
  access?: PageAccessConfig;
  cloud?: CloudStamp;
  /** Current workspace lock, written onto every sent page. */
  fixed?: boolean;
}): PageConfigFile {
  const markerSet = new Set(opts.markerIdsOnPage);
  const pagePayload: PageConfigFile['page'] = {
    name: opts.page.name,
    kind: opts.page.kind,
    order: opts.page.order,
    layout: opts.page.layout,
    groupsLayout: opts.page.groupsLayout,
    ...(opts.page.description ? { description: opts.page.description } : {}),
  };

  if (opts.page.kind === 'review') {
    return {
      version: 1,
      pageId: opts.pageId,
      page: pagePayload,
      ...(opts.access ? { access: opts.access } : {}),
      ...(opts.cloud ? { cloud: opts.cloud } : {}),
      ...(typeof opts.fixed === 'boolean' ? { fixed: opts.fixed } : {}),
    };
  }

  const markers: Record<string, PageMarkerEntry> = {};
  for (const id of opts.markerIdsOnPage) {
    const src = opts.markers[id];
    if (!src) {
      continue;
    }
    const entry: PageMarkerEntry = {
      label: src.label,
      order: src.order,
    };
    if (src.color) {
      entry.color = src.color;
    }
    if (src.icons?.length) {
      entry.icons = src.icons;
    }
    if (src.alias) {
      entry.alias = src.alias;
    }
    if (src.description) {
      entry.description = src.description;
    }
    if (src.columns && src.columns !== 'flow') {
      entry.columns = src.columns;
    }
    if (src.locked) {
      entry.locked = true;
    }
    if (src.parent && markerSet.has(src.parent)) {
      entry.parent = src.parent;
    } else {
      entry.page = opts.pageId;
    }
    markers[id] = entry;
  }

  const items: Record<string, string[]> = {};
  const added: Record<string, Record<string, number>> = {};
  for (const relPath of Object.keys(opts.items).sort()) {
    const ids = (opts.items[relPath] ?? []).filter((id) => markerSet.has(id));
    if (ids.length === 0) {
      continue;
    }
    items[relPath] = ids;
    const dates: Record<string, number> = {};
    for (const id of ids) {
      const at = opts.added[relPath]?.[id];
      if (at !== undefined) {
        dates[id] = at;
      }
    }
    if (Object.keys(dates).length > 0) {
      added[relPath] = dates;
    }
  }

  const aliases: Record<string, string> = {};
  for (const relPath of Object.keys(items)) {
    const value = opts.aliases[relPath]?.trim();
    if (value) {
      aliases[relPath] = value;
    }
  }

  const classes: Record<string, ClassDef> = {};
  const classItems: Record<string, string[]> = {};
  const classAdded: Record<string, Record<string, number>> = {};
  for (const classId of Object.keys(opts.classes).sort()) {
    const classDef = opts.classes[classId];
    const ids = (opts.classItems[classId] ?? []).filter((id) => markerSet.has(id));
    if (!classDef || ids.length === 0) {
      continue;
    }
    classes[classId] = {
      relPath: classDef.relPath,
      name: classDef.name,
      ...(classDef.line !== undefined ? { line: classDef.line } : {}),
      ...(classDef.alias ? { alias: classDef.alias } : {}),
    };
    classItems[classId] = ids;
    const dates: Record<string, number> = {};
    for (const markerId of ids) {
      const at = opts.classAdded[classId]?.[markerId];
      if (at !== undefined) {
        dates[markerId] = at;
      }
    }
    if (Object.keys(dates).length > 0) {
      classAdded[classId] = dates;
    }
    const alias = opts.aliases[classDef.relPath]?.trim();
    if (alias) {
      aliases[classDef.relPath] = alias;
    }
  }

  const notes: Record<string, PageNoteEntry> = {};
  for (const noteId of opts.noteIdsOnPage) {
    const src = opts.notes[noteId];
    if (!src) {
      continue;
    }
    const entry: PageNoteEntry = {
      text: src.text,
      order: src.order,
    };
    if (src.page) {
      entry.page = src.page;
    }
    if (src.markerId) {
      entry.markerId = src.markerId;
    }
    if (src.parentNote) {
      entry.parentNote = src.parentNote;
    }
    if (src.color) {
      entry.color = src.color;
    }
    if (src.icons?.length) {
      entry.icons = src.icons;
    }
    if (src.locked) {
      entry.locked = true;
    }
    notes[noteId] = entry;
  }

  const links: Record<string, PageLinkEntry> = {};
  for (const linkId of opts.linkIdsOnPage) {
    const src = opts.links[linkId];
    if (!src) {
      continue;
    }
    const entry: PageLinkEntry = {
      label: src.label,
      order: src.order,
    };
    if (src.description) {
      entry.description = src.description;
    }
    if (src.url) {
      entry.url = src.url;
    }
    if (src.parent) {
      entry.parent = src.parent;
    }
    if (src.page) {
      entry.page = src.page;
    }
    if (src.color) {
      entry.color = src.color;
    }
    if (src.locked) {
      entry.locked = true;
    }
    links[linkId] = entry;
  }

  const payload: PageConfigFile = {
    version: 1,
    pageId: opts.pageId,
    page: pagePayload,
    ...(typeof opts.fixed === 'boolean' ? { fixed: opts.fixed } : {}),
  };
  if (Object.keys(markers).length > 0) {
    payload.markers = markers;
  }
  if (Object.keys(items).length > 0) {
    payload.items = items;
  }
  if (Object.keys(added).length > 0) {
    payload.added = added;
  }
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
  if (Object.keys(links).length > 0) {
    payload.links = links;
  }
  if (opts.cloud) {
    payload.cloud = opts.cloud;
  }
  return payload;
}

function normalizePageAccess(raw: unknown): PageAccessConfig | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return undefined;
  }
  const source = raw as Partial<PageAccessConfig>;
  const provider = source.provider === 'github' || source.provider === 'gitlab' ? source.provider : undefined;
  const channelId = typeof source.channelId === 'string' ? source.channelId.trim() : '';
  const repoUrl = typeof source.repoUrl === 'string' ? source.repoUrl.trim() : '';
  if (!provider || !channelId || !repoUrl) {
    return undefined;
  }
  return { provider, channelId, repoUrl };
}

export function normalizePageConfig(raw: unknown): PageConfigFile {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      version: 1,
      page: { name: 'Карта', kind: 'files', layout: 'chips', groupsLayout: 'flow' },
    };
  }
  const source = raw as PageConfigFile;
  const pageRaw = source.page && typeof source.page === 'object' ? source.page : undefined;
  const kind = normalizePageKindLocal(pageRaw?.kind) ?? 'files';
  const name =
    typeof pageRaw?.name === 'string' && pageRaw.name.trim() ? pageRaw.name.trim() : 'Карта';
  const description = normalizeGroupDescriptionLocal(pageRaw?.description);
  const order = typeof pageRaw?.order === 'number' && Number.isFinite(pageRaw.order) ? pageRaw.order : undefined;
  const pageId = typeof source.pageId === 'string' ? source.pageId.trim() : '';
  const result: PageConfigFile = {
    version: 1,
    ...(pageId ? { pageId } : {}),
    ...(source.deleted ? { deleted: true as const } : {}),
    ...(source.fixed === true ? { fixed: true } : source.fixed === false ? { fixed: false } : {}),
    page: {
      name,
      kind,
      ...(order !== undefined ? { order } : {}),
      layout: normalizeMapLayoutLocal(pageRaw?.layout),
      groupsLayout: normalizeGroupsLayoutLocal(pageRaw?.groupsLayout),
      ...(description ? { description } : {}),
    },
  };
  const access = normalizePageAccess(source.access);
  if (access) {
    result.access = access;
  }
  const cloud = normalizeCloudStamp(source.cloud);
  if (cloud) {
    result.cloud = cloud;
  }
  if (source.markers && typeof source.markers === 'object') {
    result.markers = {};
    let index = 0;
    for (const [id, value] of Object.entries(source.markers)) {
      index += 1;
      if (!value || typeof value !== 'object') {
        continue;
      }
      const def = value as Partial<PageMarkerEntry>;
      const label = typeof def.label === 'string' ? def.label : id;
      const entry: PageMarkerEntry = {
        label,
        order: typeof def.order === 'number' ? def.order : index,
      };
      if (typeof def.color === 'string') {
        entry.color = def.color;
      }
      const icons = normalizeIconsLocal(def.icons);
      if (icons) {
        entry.icons = icons;
      }
      if (typeof def.alias === 'string' && def.alias.trim()) {
        entry.alias = def.alias.trim();
      }
      const desc = normalizeGroupDescriptionLocal(def.description);
      if (desc) {
        entry.description = desc;
      }
      if (typeof def.parent === 'string') {
        entry.parent = def.parent;
      }
      if (typeof def.page === 'string') {
        entry.page = def.page;
      }
      const columns = normalizeColumnsLocal(def.columns);
      if (columns && columns !== 'flow') {
        entry.columns = columns;
      }
      if (def.locked) {
        entry.locked = true;
      }
      result.markers[id] = entry;
    }
  }
  if (source.items && typeof source.items === 'object') {
    result.items = source.items as Record<string, string[]>;
  }
  if (source.added && typeof source.added === 'object') {
    result.added = source.added as Record<string, Record<string, number>>;
  }
  if (source.aliases && typeof source.aliases === 'object') {
    result.aliases = source.aliases as Record<string, string>;
  }
  if (source.classes && typeof source.classes === 'object') {
    result.classes = source.classes as Record<string, ClassDef>;
  }
  if (source.classItems && typeof source.classItems === 'object') {
    result.classItems = source.classItems as Record<string, string[]>;
  }
  if (source.classAdded && typeof source.classAdded === 'object') {
    result.classAdded = source.classAdded as Record<string, Record<string, number>>;
  }
  if (source.notes && typeof source.notes === 'object') {
    result.notes = {};
    let index = 0;
    for (const [id, value] of Object.entries(source.notes)) {
      index += 1;
      if (!value || typeof value !== 'object') {
        continue;
      }
      const def = value as Partial<PageNoteEntry>;
      const entry: PageNoteEntry = {
        text: typeof def.text === 'string' ? def.text : '',
        order: typeof def.order === 'number' ? def.order : index,
      };
      if (typeof def.page === 'string') {
        entry.page = def.page;
      }
      if (typeof def.markerId === 'string') {
        entry.markerId = def.markerId;
      }
      if (typeof def.parentNote === 'string') {
        entry.parentNote = def.parentNote;
      }
      if (typeof def.color === 'string') {
        entry.color = def.color;
      }
      const icons = normalizeIconsLocal(def.icons);
      if (icons) {
        entry.icons = icons;
      }
      if (def.locked) {
        entry.locked = true;
      }
      result.notes[id] = entry;
    }
  }
  if (source.links && typeof source.links === 'object') {
    result.links = {};
    let index = 0;
    for (const [id, value] of Object.entries(source.links)) {
      index += 1;
      if (!value || typeof value !== 'object') {
        continue;
      }
      const def = value as Partial<PageLinkEntry>;
      const entry: PageLinkEntry = {
        label: typeof def.label === 'string' ? def.label : id,
        order: typeof def.order === 'number' ? def.order : index,
      };
      if (typeof def.description === 'string' && def.description.trim()) {
        entry.description = def.description.trim();
      }
      if (typeof def.url === 'string') {
        entry.url = def.url;
      }
      if (typeof def.parent === 'string') {
        entry.parent = def.parent;
      }
      if (typeof def.page === 'string') {
        entry.page = def.page;
      }
      if (typeof def.color === 'string') {
        entry.color = def.color;
      }
      if (def.locked) {
        entry.locked = true;
      }
      result.links[id] = entry;
    }
  }
  return result;
}

export function assembleSplitWorkspace(
  catalog: CatalogFile,
  pageFiles: Record<string, PageConfigFile>,
): SplitWorkspace {
  const pages: Record<string, PageDef> = {};
  const markers: Record<string, MarkerDef> = {};
  const items: Record<string, string[]> = {};
  const added: Record<string, Record<string, number>> = {};
  const aliases: Record<string, string> = {};
  const classes: Record<string, ClassDef> = {};
  const classItems: Record<string, string[]> = {};
  const classAdded: Record<string, Record<string, number>> = {};
  const notes: Record<string, NoteDef> = {};
  const links: Record<string, LinkDef> = {};
  const pageCloud: Record<string, CloudStamp> = {};

  const orderedIds = Object.keys(catalog.pages).sort(
    (a, b) => catalog.pages[a].order - catalog.pages[b].order || a.localeCompare(b),
  );

  for (const pageId of orderedIds) {
    const meta = catalog.pages[pageId];
    const file = pageFiles[pageId] ?? {
      version: 1 as const,
      page: {
        name: meta.name,
        kind: meta.kind,
        layout: 'chips' as const,
        groupsLayout: 'flow' as const,
        ...(meta.description ? { description: meta.description } : {}),
      },
    };
    pages[pageId] = {
      name: file.page.name || meta.name,
      kind: normalizePageKindLocal(file.page.kind) ?? meta.kind,
      order: typeof file.page.order === 'number' ? file.page.order : meta.order,
      layout: normalizeMapLayoutLocal(file.page.layout),
      groupsLayout: normalizeGroupsLayoutLocal(file.page.groupsLayout),
      collapsed: emptyCollapsedLocal(),
      ...(file.page.description || meta.description
        ? { description: file.page.description || meta.description }
        : {}),
    };
    if (file.cloud) {
      pageCloud[pageId] = file.cloud;
    }
    for (const [id, def] of Object.entries(file.markers ?? {})) {
      markers[id] = {
        label: def.label,
        order: def.order,
        ...(def.color ? { color: def.color } : {}),
        ...(def.icons ? { icons: def.icons } : {}),
        ...(def.alias ? { alias: def.alias } : {}),
        ...(def.description ? { description: def.description } : {}),
        ...(def.parent ? { parent: def.parent } : {}),
        ...(def.page ? { page: def.page } : !def.parent ? { page: pageId } : {}),
        ...(def.columns ? { columns: def.columns } : {}),
        ...(def.locked ? { locked: true } : {}),
      };
    }
    for (const [relPath, ids] of Object.entries(file.items ?? {})) {
      items[relPath] = [...(items[relPath] ?? []), ...ids];
    }
    for (const [relPath, dates] of Object.entries(file.added ?? {})) {
      added[relPath] = { ...(added[relPath] ?? {}), ...dates };
    }
    for (const [relPath, alias] of Object.entries(file.aliases ?? {})) {
      aliases[relPath] = alias;
    }
    for (const [classId, def] of Object.entries(file.classes ?? {})) {
      classes[classId] = def;
    }
    for (const [classId, ids] of Object.entries(file.classItems ?? {})) {
      classItems[classId] = [...(classItems[classId] ?? []), ...ids];
    }
    for (const [classId, dates] of Object.entries(file.classAdded ?? {})) {
      classAdded[classId] = { ...(classAdded[classId] ?? {}), ...dates };
    }
    for (const [id, def] of Object.entries(file.notes ?? {})) {
      notes[id] = {
        text: def.text,
        order: def.order,
        ...(def.page ? { page: def.page } : {}),
        ...(def.markerId ? { markerId: def.markerId } : {}),
        ...(def.parentNote ? { parentNote: def.parentNote } : {}),
        ...(def.color ? { color: def.color } : {}),
        ...(def.icons ? { icons: def.icons } : {}),
        ...(def.locked ? { locked: true } : {}),
      };
    }
    for (const [id, def] of Object.entries(file.links ?? {})) {
      links[id] = {
        label: def.label,
        order: def.order,
        ...(def.description ? { description: def.description } : {}),
        ...(def.url ? { url: def.url } : {}),
        ...(def.parent ? { parent: def.parent } : {}),
        ...(def.page ? { page: def.page } : {}),
        ...(def.color ? { color: def.color } : {}),
        ...(def.locked ? { locked: true } : {}),
      };
    }
  }

  return {
    catalog: normalizeCatalog(catalog),
    pages,
    markers,
    items,
    added,
    aliases,
    classes,
    classItems,
    classAdded,
    notes,
    links,
    pageCloud,
  };
}

export function stringifyCatalog(catalog: CatalogFile): string {
  const pages: Record<string, CatalogPageEntry> = {};
  for (const id of Object.keys(catalog.pages).sort(
    (a, b) => catalog.pages[a].order - catalog.pages[b].order || a.localeCompare(b),
  )) {
    const page = catalog.pages[id];
    pages[id] = {
      name: page.name,
      kind: page.kind,
      order: page.order,
      ...(page.description ? { description: page.description } : {}),
    };
  }
  const payload: CatalogFile = {
    version: 1,
    pages,
    channels: packCatalogChannels(catalog.channels),
  };
  if (catalog.cloud) {
    payload.cloud = catalog.cloud;
  }
  return JSON.stringify(payload, null, 2) + '\n';
}

export function stringifyPageConfig(file: PageConfigFile): string {
  return JSON.stringify(file, null, 2) + '\n';
}

/** Stable content fingerprint of a page file without the cloud stamp. */
export function pageConfigContentJson(file: PageConfigFile): string {
  const { cloud: _cloud, ...rest } = file;
  return JSON.stringify(rest) + '\n';
}
