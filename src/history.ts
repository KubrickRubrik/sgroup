import * as crypto from 'crypto';

/** Undo/redo snapshots, beside the shared markers file. */
export const HISTORY_PATH = '.syn3/history.json';

/** How many steps Back can restore per page. */
export const HISTORY_LIMIT = 200;

export interface HistoryStacks {
  /** Older snapshots, newest at the end. */
  past: string[];
  /** Newer snapshots, newest at the end. */
  future: string[];
}

/** Per-page undo/redo stacks in one history file. */
export interface PageHistoryBook {
  pages: Record<string, HistoryStacks>;
}

export function emptyStacks(): HistoryStacks {
  return { past: [], future: [] };
}

export function emptyHistory(): PageHistoryBook {
  return { pages: {} };
}

export function pageStacks(book: PageHistoryBook, pageId: string): HistoryStacks {
  let stacks = book.pages[pageId];
  if (!stacks) {
    stacks = emptyStacks();
    book.pages[pageId] = stacks;
  }
  return stacks;
}

export function dropPageHistory(book: PageHistoryBook, pageId: string): void {
  delete book.pages[pageId];
}

export function fingerprint(snapshot: string): string {
  return crypto.createHash('sha256').update(snapshot).digest('hex');
}

/** Push the state from before an edit and drop the redo branch. */
export function remember(stacks: HistoryStacks, previous: string): void {
  stacks.past.push(previous);
  if (stacks.past.length > HISTORY_LIMIT) {
    stacks.past.splice(0, stacks.past.length - HISTORY_LIMIT);
  }
  stacks.future = [];
}

export function peek(stacks: HistoryStacks, direction: -1 | 1): string | undefined {
  const source = direction < 0 ? stacks.past : stacks.future;
  return source[source.length - 1];
}

/** Move one snapshot across the cursor. `present` is the state being left. */
export function take(stacks: HistoryStacks, direction: -1 | 1, present: string): string | undefined {
  const source = direction < 0 ? stacks.past : stacks.future;
  const snapshot = source.pop();
  if (snapshot === undefined) {
    return undefined;
  }
  const target = direction < 0 ? stacks.future : stacks.past;
  target.push(present);
  return snapshot;
}

interface HistoryFileV2 {
  version: 2;
  pages: Record<
    string,
    {
      /** Fingerprint of the page snapshot at the cursor. A mismatch drops that page. */
      cursor: string;
      past: string[];
      future: string[];
    }
  >;
}

export function encodeHistory(book: PageHistoryBook, cursors: Record<string, string>): string {
  const pages: HistoryFileV2['pages'] = {};
  for (const [pageId, stacks] of Object.entries(book.pages)) {
    if (stacks.past.length === 0 && stacks.future.length === 0) {
      continue;
    }
    pages[pageId] = {
      cursor: cursors[pageId] ?? '',
      past: stacks.past,
      future: stacks.future,
    };
  }
  const file: HistoryFileV2 = { version: 2, pages };
  return JSON.stringify(file) + '\n';
}

/**
 * Empty book when the file is missing or broken.
 * Version 1 (full-file stacks) is discarded.
 * A page whose cursor no longer matches is dropped.
 */
export function decodeHistory(
  raw: string,
  cursors: Record<string, string>,
  legacyCursors: Record<string, string> = {},
): PageHistoryBook {
  try {
    const parsed = JSON.parse(raw) as Partial<HistoryFileV2>;
    if (parsed.version !== 2 || !parsed.pages || typeof parsed.pages !== 'object') {
      return emptyHistory();
    }
    const book = emptyHistory();
    for (const [pageId, entry] of Object.entries(parsed.pages)) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }
      if (entry.cursor !== cursors[pageId] && entry.cursor !== legacyCursors[pageId]) {
        continue;
      }
      book.pages[pageId] = {
        past: stringList(entry.past).slice(-HISTORY_LIMIT),
        future: stringList(entry.future).slice(-HISTORY_LIMIT),
      };
    }
    return book;
  } catch {
    return emptyHistory();
  }
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}
