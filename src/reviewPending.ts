import * as vscode from 'vscode';

export const REVIEW_PENDING_REL = '.syn3/review-pending.md';

export type ReviewKind = 'branch' | 'changes';

/** Context-menu depth. Shallow `/rs`, medium `/rm`, deep `/rd`. */
export type ReviewDepth = 'shallow' | 'medium' | 'deep';

export function reviewDepthCommand(depth: ReviewDepth): '/rs' | '/rm' | '/rd' {
  if (depth === 'shallow') {
    return '/rs';
  }
  if (depth === 'deep') {
    return '/rd';
  }
  return '/rm';
}

export function parseReviewDepth(raw: unknown): ReviewDepth {
  if (raw === 'shallow' || raw === 'medium' || raw === 'deep') {
    return raw;
  }
  return 'medium';
}

export interface PendingReview {
  /**
   * Host MR/PR URL, or `branch:<name>` for a root review without MR.
   */
  webUrl: string;
  kind: ReviewKind;
  /** Absolute fs path to the assembled review file. */
  fsPath: string;
}

/** Pending key for a channel-root review (no MR URL). */
export function pendingBranchKey(branch: string): string {
  return `branch:${branch.trim()}`;
}

export function isPendingBranchKey(key: string): boolean {
  return key.startsWith('branch:') && key.slice('branch:'.length).trim().length > 0;
}

function parseKind(raw: string): ReviewKind | undefined {
  const v = raw.trim().toLowerCase();
  if (v === 'branch' || v === 'ревью ветки') {
    return 'branch';
  }
  if (v === 'changes' || v === 'ревью изменений') {
    return 'changes';
  }
  return undefined;
}

function isPendingKey(raw: string): boolean {
  return raw.startsWith('http') || isPendingBranchKey(raw);
}

export class ReviewPendingStore {
  constructor(private readonly root: vscode.Uri) {}

  private uri(): vscode.Uri {
    return vscode.Uri.joinPath(this.root, REVIEW_PENDING_REL);
  }

  async read(): Promise<PendingReview | undefined> {
    try {
      const buf = await vscode.workspace.fs.readFile(this.uri());
      const text = Buffer.from(buf).toString('utf8');
      const lines = text.split(/\r?\n/);
      const webUrl = (lines[0] || '').trim();
      const kind = parseKind(lines[1] || '');
      const fsPath = (lines[2] || '').trim();
      if (!isPendingKey(webUrl) || !kind || !fsPath) {
        return undefined;
      }
      return { webUrl, kind, fsPath };
    } catch {
      return undefined;
    }
  }

  async write(webUrl: string, kind: ReviewKind, fsPath: string): Promise<PendingReview> {
    const dir = vscode.Uri.joinPath(this.root, '.syn3');
    try {
      await vscode.workspace.fs.createDirectory(dir);
    } catch {
      // exists
    }
    const body = `${webUrl.trim()}\n${kind}\n${fsPath.trim()}\n`;
    await vscode.workspace.fs.writeFile(this.uri(), Buffer.from(body, 'utf8'));
    return { webUrl: webUrl.trim(), kind, fsPath: fsPath.trim() };
  }

  async clear(): Promise<void> {
    try {
      await vscode.workspace.fs.delete(this.uri());
    } catch {
      // missing
    }
  }
}
