/** `pageId://group/id/...` or `pageId://note/groupIds.../noteIds...`. */

export type EntityLinkKind = 'group' | 'note';

export interface ParsedEntityLink {
  pageId: string;
  kind: EntityLinkKind;
  /** Root-first ids. The last one is the target. */
  ids: string[];
}

const SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*$/;
const FULL = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/(group|note)\/([^?\s#]+)$/;
const ENTITY_BODY = String.raw`[a-zA-Z][a-zA-Z0-9+.-]*:\/\/(?:group|note)\/[^\s<>"')\]]+`;
const IN_TEXT = new RegExp(String.raw`\[([^\]]*)\]\((${ENTITY_BODY})\)|(${ENTITY_BODY})`, 'g');

export const NOTE_JSON_PREFIX = 'syn3json:';

function isSegment(id: string): boolean {
  return !!id && !/[\s/?#]/.test(id);
}

export function formatEntityLink(
  pageId: string,
  kind: EntityLinkKind,
  ids: readonly string[],
): string | undefined {
  if (!SCHEME.test(pageId) || ids.length === 0 || ids.some((id) => !isSegment(id))) {
    return undefined;
  }
  return `${pageId}://${kind}/${ids.join('/')}`;
}

export function parseEntityLink(raw: string): ParsedEntityLink | undefined {
  const match = FULL.exec(raw.trim());
  if (!match) {
    return undefined;
  }
  const ids = match[3].split('/').filter((id) => id.length > 0);
  if (ids.length === 0 || ids.some((id) => !isSegment(id))) {
    return undefined;
  }
  const kind = match[2] === 'note' ? 'note' : 'group';
  return { pageId: match[1], kind, ids };
}

/**
 * Rewrite entity URLs in a plain string.
 * `mapUrl` returns the new URL, `''` to drop the whole token, or `undefined` to keep it.
 */
export function applyEntityLinksInText(
  text: string,
  mapUrl: (url: string) => string | undefined,
): { text: string; count: number } {
  let count = 0;
  const next = text.replace(
    IN_TEXT,
    (full, label: string | undefined, mdUrl: string | undefined, bare: string | undefined) => {
      const url = mdUrl || bare;
      if (!url) {
        return full;
      }
      const mapped = mapUrl(url);
      if (mapped === undefined) {
        return full;
      }
      count += 1;
      if (!mapped) {
        return '';
      }
      if (mdUrl) {
        return `[${label ?? ''}](${mapped})`;
      }
      return mapped;
    },
  );
  return { text: next, count };
}

interface NoteRun {
  text?: string;
}

interface NoteBlock {
  type?: string;
  runs?: NoteRun[];
}

/** Rewrite note text. Code blocks stay byte-for-byte; an unchanged note is returned as-is. */
export function mapNoteEntityLinks(
  raw: string,
  mapUrl: (url: string) => string | undefined,
): { text: string; count: number } {
  if (!raw.startsWith(NOTE_JSON_PREFIX)) {
    return applyEntityLinksInText(raw, mapUrl);
  }
  let doc: { blocks?: NoteBlock[] };
  try {
    doc = JSON.parse(raw.slice(NOTE_JSON_PREFIX.length)) as { blocks?: NoteBlock[] };
  } catch {
    return { text: raw, count: 0 };
  }
  if (!doc || !Array.isArray(doc.blocks)) {
    return { text: raw, count: 0 };
  }
  let count = 0;
  for (const block of doc.blocks) {
    if (!block || block.type === 'code' || !Array.isArray(block.runs)) {
      continue;
    }
    for (const run of block.runs) {
      if (!run || typeof run.text !== 'string' || !run.text) {
        continue;
      }
      const next = applyEntityLinksInText(run.text, mapUrl);
      if (next.count > 0) {
        run.text = next.text;
        count += next.count;
      }
    }
  }
  if (count === 0) {
    return { text: raw, count: 0 };
  }
  return { text: NOTE_JSON_PREFIX + JSON.stringify(doc), count };
}

export function stripNoteEntityLink(raw: string, url: string): { text: string; count: number } {
  const target = url.trim();
  if (!target) {
    return { text: raw, count: 0 };
  }
  return mapNoteEntityLinks(raw, (found) => (found === target ? '' : undefined));
}
