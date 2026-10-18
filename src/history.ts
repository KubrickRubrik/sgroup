import * as crypto from 'crypto';

/** Undo/redo snapshots, beside the shared markers file. */
export const HISTORY_PATH = '.sgroup/history.json';

/** How many steps Back can restore. */
export const HISTORY_LIMIT = 50;

export interface HistoryStacks {
  /** Older snapshots, newest at the end. */
  past: string[];
  /** Newer snapshots, newest at the end. */
  future: string[];
}

export function emptyHistory(): HistoryStacks {
  return { past: [], future: [] };
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

interface HistoryFile {
  version: 1;
  /** Fingerprint of the markers file at the cursor. A mismatch drops the stacks. */
  cursor: string;
  past: string[];
  future: string[];
}

export function encodeHistory(stacks: HistoryStacks, cursor: string): string {
  const file: HistoryFile = {
    version: 1,
    cursor,
    past: stacks.past,
    future: stacks.future,
  };
  return JSON.stringify(file) + '\n';
}

/** Empty stacks when the file is missing, broken, or belongs to another markers revision. */
export function decodeHistory(raw: string, cursor: string): HistoryStacks {
  try {
    const parsed = JSON.parse(raw) as Partial<HistoryFile>;
    if (parsed.version !== 1 || parsed.cursor !== cursor) {
      return emptyHistory();
    }
    return {
      past: stringList(parsed.past).slice(-HISTORY_LIMIT),
      future: stringList(parsed.future).slice(-HISTORY_LIMIT),
    };
  } catch {
    return emptyHistory();
  }
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}
