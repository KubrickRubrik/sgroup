import * as vscode from 'vscode';

export const REVIEW_PENDING_REL = '.syn3/review-pending.md';

export type ReviewKind = 'branch' | 'changes';

export interface PendingReview {
  webUrl: string;
  kind: ReviewKind;
  /** Absolute fs path to the pending file. */
  fsPath: string;
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

export class ReviewPendingStore {
  constructor(private readonly root: vscode.Uri) {}

  private uri(): vscode.Uri {
    return vscode.Uri.joinPath(this.root, REVIEW_PENDING_REL);
  }

  fsPath(): string {
    return this.uri().fsPath;
  }

  async read(): Promise<PendingReview | undefined> {
    try {
      const buf = await vscode.workspace.fs.readFile(this.uri());
      const text = Buffer.from(buf).toString('utf8');
      const lines = text.split(/\r?\n/);
      const webUrl = (lines[0] || '').trim();
      const kind = parseKind(lines[1] || '');
      if (!webUrl.startsWith('http') || !kind) {
        return undefined;
      }
      return { webUrl, kind, fsPath: this.fsPath() };
    } catch {
      return undefined;
    }
  }

  async write(webUrl: string, kind: ReviewKind): Promise<PendingReview> {
    const dir = vscode.Uri.joinPath(this.root, '.syn3');
    try {
      await vscode.workspace.fs.createDirectory(dir);
    } catch {
      // exists
    }
    const body = `${webUrl.trim()}\n${kind}\n`;
    await vscode.workspace.fs.writeFile(this.uri(), Buffer.from(body, 'utf8'));
    return { webUrl: webUrl.trim(), kind, fsPath: this.fsPath() };
  }

  async clear(): Promise<void> {
    try {
      await vscode.workspace.fs.delete(this.uri());
    } catch {
      // missing
    }
  }
}
