/** One tagged node found in a Figma file. */
export interface FigmaTagHit {
  /** Settings link whose scope produced this hit. */
  fileUrl: string;
  /** Link of the node that carries the tag. */
  link: string;
  /** Raw JSON Metadata Tagger string. */
  tag: string;
}

/** Stored on a chip. Several files can share one tag path. */
export interface FigmaTagSource {
  fileUrl: string;
  link: string;
  tag: string;
}

export const FIGMA_PAGE_LABEL = 'Страница';
export const FIGMA_LAYER_LABEL = 'Слой';
export const FIGMA_FRAME_LABEL = 'Макет';

/** Placeholder for a chip added by hand, before a tag gives it a name. */
export function figmaDepthLabel(depth: number): string {
  if (depth <= 0) {
    return FIGMA_PAGE_LABEL;
  }
  if (depth === 1) {
    return FIGMA_LAYER_LABEL;
  }
  return FIGMA_FRAME_LABEL;
}

/** Path segment that names this chip when the tag has no `(Название)`. */
export function figmaSegmentLabel(key: string): string {
  const segment = key.split('/').pop()?.trim() || key.trim();
  return figmaSegmentDisplay(segment);
}

/** Identity of a tag path. `Главная/MOBILE` and `главная/mobile` fold together. */
export function foldFigmaTag(key: string): string {
  return key.trim().toLocaleLowerCase();
}

/**
 * Chip text is always `Главная/Mobile`: the first letter is capital, the rest is lower.
 * `ГЛАВНАЯ`, `главная` and `widgetPlaceholeders` become `Главная` and `Widgetplaceholeders`.
 */
export function figmaSegmentDisplay(segment: string): string {
  const trimmed = segment.trim().toLocaleLowerCase();
  if (!trimmed) {
    return trimmed;
  }
  return trimmed.charAt(0).toLocaleUpperCase() + trimmed.slice(1);
}

/** Display form of a whole path: `главная/MOBILE` → `Главная/Mobile`. */
export function canonicalFigmaTag(raw: string): string {
  return raw
    .split('/')
    .map((part) => figmaSegmentDisplay(part))
    .filter(Boolean)
    .join('/');
}

export interface ParsedFigmaTagStep {
  /** Path without parentheses, from the root through this segment. */
  key: string;
  depth: number;
  title?: string;
}

export interface ParsedFigmaTag {
  key: string;
  depth: number;
  title?: string;
  /** Root first, this tag last. At most three steps. */
  chain: ParsedFigmaTagStep[];
}

const SEGMENT = /^([^/()]+?)(?:\(([^)]*)\))?$/;

/**
 * `loyaut(Главный экран)` and `loyaut/genres/list(Общий список)`.
 * Four or more segments are ignored.
 */
export function parseFigmaTag(raw: string): ParsedFigmaTag | undefined {
  const text = raw.trim();
  if (!text || text.includes('//')) {
    return undefined;
  }
  const parts = text.split('/').map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0 || parts.length > 3) {
    return undefined;
  }
  const chain: ParsedFigmaTagStep[] = [];
  const keys: string[] = [];
  for (const part of parts) {
    const match = SEGMENT.exec(part);
    if (!match) {
      return undefined;
    }
    const segment = match[1].trim();
    if (!segment) {
      return undefined;
    }
    keys.push(segment);
    const title = (match[2] ?? '').trim();
    chain.push({
      key: keys.join('/'),
      depth: keys.length - 1,
      ...(title ? { title } : {}),
    });
  }
  const last = chain[chain.length - 1];
  return {
    key: last.key,
    depth: last.depth,
    ...(last.title ? { title: last.title } : {}),
    chain,
  };
}

/** `icon_tagger` / `tags`: a JSON array or one plain string. */
export function parseIconTaggerValue(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof raw !== 'string') {
    return [];
  }
  const text = raw.trim();
  if (!text) {
    return [];
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item).trim()).filter(Boolean);
    }
  } catch {
    // A plain string is still a tag.
  }
  return [text];
}

export function readFigmaLinkMeta(raw: {
  figmaTag?: unknown;
  figmaSources?: unknown;
  figmaUnsynced?: unknown;
}): { figmaTag?: string; figmaSources?: FigmaTagSource[]; figmaUnsynced?: true } {
  const figmaTag = typeof raw.figmaTag === 'string' ? raw.figmaTag.trim() : '';
  const figmaSources = normalizeFigmaSources(raw.figmaSources);
  return {
    ...(figmaTag ? { figmaTag } : {}),
    ...(figmaSources ? { figmaSources } : {}),
    ...(raw.figmaUnsynced === true ? { figmaUnsynced: true as const } : {}),
  };
}

export function normalizeFigmaSources(raw: unknown): FigmaTagSource[] | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }
  const out: FigmaTagSource[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const row = item as { fileUrl?: unknown; link?: unknown; tag?: unknown };
    const fileUrl = typeof row.fileUrl === 'string' ? row.fileUrl.trim() : '';
    const link = typeof row.link === 'string' ? row.link.trim() : '';
    const tag = typeof row.tag === 'string' ? row.tag.trim() : '';
    if (!fileUrl || !link || !tag) {
      continue;
    }
    if (out.some((source) => source.link === link)) {
      continue;
    }
    out.push({ fileUrl, link, tag });
  }
  return out.length > 0 ? out : undefined;
}

/** Walk a REST file payload. `linkFor` builds the node URL. */
export function hitsFromSharedTree(
  fileUrl: string,
  linkFor: (nodeId: string) => string,
  body: unknown,
): FigmaTagHit[] {
  const hits: FigmaTagHit[] = [];
  const roots: unknown[] = [];
  if (body && typeof body === 'object') {
    const record = body as { document?: unknown; nodes?: unknown };
    if (record.document) {
      roots.push(record.document);
    }
    if (record.nodes && typeof record.nodes === 'object') {
      for (const value of Object.values(record.nodes as Record<string, unknown>)) {
        if (value && typeof value === 'object' && 'document' in value) {
          roots.push((value as { document: unknown }).document);
        }
      }
    }
  }
  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') {
      return;
    }
    const row = node as { id?: unknown; sharedPluginData?: unknown; children?: unknown };
    const id = typeof row.id === 'string' ? row.id.trim() : '';
    if (id) {
      const tags = tagsFromShared(row.sharedPluginData);
      for (const tag of tags) {
        hits.push({ fileUrl, link: linkFor(id), tag });
      }
    }
    if (Array.isArray(row.children)) {
      for (const child of row.children) {
        visit(child);
      }
    }
  };
  for (const root of roots) {
    visit(root);
  }
  return hits;
}

function tagsFromShared(shared: unknown): string[] {
  if (!shared || typeof shared !== 'object') {
    return [];
  }
  const namespace = (shared as { icon_tagger?: unknown }).icon_tagger;
  if (!namespace || typeof namespace !== 'object') {
    return [];
  }
  return parseIconTaggerValue((namespace as { tags?: unknown }).tags);
}

export interface FigmaScanFile {
  url: string;
  ok: boolean;
  error?: string;
  hits: FigmaTagHit[];
}

/** Last JSON object in an agent answer that has a `files` array. */
export function parseFigmaScanAnswer(text: string): FigmaScanFile[] | undefined {
  const parsed = lastFilesObject(text);
  if (!parsed) {
    return undefined;
  }
  const files = (parsed as { files?: unknown }).files;
  if (!Array.isArray(files)) {
    return undefined;
  }
  const out: FigmaScanFile[] = [];
  for (const item of files) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const row = item as { url?: unknown; ok?: unknown; error?: unknown; tags?: unknown };
    const url = typeof row.url === 'string' ? row.url.trim() : '';
    if (!url) {
      continue;
    }
    if (row.ok === false) {
      const error = typeof row.error === 'string' ? row.error.trim() : '';
      out.push({ url, ok: false, ...(error ? { error } : {}), hits: [] });
      continue;
    }
    const hits: FigmaTagHit[] = [];
    if (Array.isArray(row.tags)) {
      for (const tagRow of row.tags) {
        if (!tagRow || typeof tagRow !== 'object') {
          continue;
        }
        const tag = typeof (tagRow as { tag?: unknown }).tag === 'string'
          ? (tagRow as { tag: string }).tag.trim()
          : '';
        const link = typeof (tagRow as { link?: unknown }).link === 'string'
          ? (tagRow as { link: string }).link.trim()
          : '';
        if (!tag || !link) {
          continue;
        }
        hits.push({ fileUrl: url, link, tag });
      }
    }
    out.push({ url, ok: true, hits });
  }
  return out.length > 0 ? out : undefined;
}

function lastFilesObject(text: string): unknown {
  let end = text.length;
  while (end > 0) {
    const start = text.lastIndexOf('{', end - 1);
    if (start < 0) {
      return undefined;
    }
    const close = matchingBrace(text, start);
    if (close > start) {
      try {
        const parsed = JSON.parse(text.slice(start, close + 1)) as unknown;
        if (
          parsed &&
          typeof parsed === 'object' &&
          Array.isArray((parsed as { files?: unknown }).files)
        ) {
          return parsed;
        }
      } catch {
        // This brace is not the payload. Try the one before it.
      }
    }
    end = start;
  }
  return undefined;
}

function matchingBrace(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === '\\') {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

/** Prompt for the MCP walk. The skill's scan section owns the Figma calls. */
export function figmaScanPrompt(skillPath: string, urls: string[]): string {
  const lines = [
    `Follow the Figma tag skill at: ${skillPath}`,
    'Use the section «Собрать все теги» and scan.js next to that skill. Do not use the single-tag lookup.',
    'Do not write to Figma. Do not call setPluginData or setSharedPluginData. Do not print tokens.',
    'Scan every link below. The last thing you print is one JSON object and nothing after it.',
    'Shape: {"files":[{"url":"<the link>","ok":true,"tags":[{"tag":"<raw tag>","link":"<node link>"}]}]}',
    'A link you could not scan is {"url":"<the link>","ok":false,"error":"<short reason>"} and stays in the same array as the links that worked.',
    'Links:',
    ...urls.map((url) => `- ${url}`),
  ];
  return lines.join('\n');
}
