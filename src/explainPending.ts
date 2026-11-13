import * as vscode from 'vscode';
import { ReviewKind } from './reviewPending';
import { isPendingBranchKey, pendingBranchKey } from './reviewPending';

export const EXPLAIN_PENDING_REL = '.syn3/explain-pending.md';

export interface PendingExplain {
  /**
   * Host MR/PR URL, or `branch:<name>` for a root explain without MR.
   */
  webUrl: string;
  kind: ReviewKind;
  /** Absolute fs path to the assembled explain file. */
  fsPath: string;
  /** Branch name stamped on the Discord message. */
  branch: string;
}

function parseKind(raw: string): ReviewKind | undefined {
  const v = raw.trim().toLowerCase();
  if (v === 'branch' || v === 'ревью ветки' || v === 'explain branch' || v === 'что и как ветки') {
    return 'branch';
  }
  if (
    v === 'changes' ||
    v === 'ревью изменений' ||
    v === 'explain changes' ||
    v === 'что и как изменений'
  ) {
    return 'changes';
  }
  return undefined;
}

function isPendingKey(raw: string): boolean {
  return raw.startsWith('http') || isPendingBranchKey(raw);
}

export class ExplainPendingStore {
  constructor(private readonly root: vscode.Uri) {}

  private uri(): vscode.Uri {
    return vscode.Uri.joinPath(this.root, EXPLAIN_PENDING_REL);
  }

  async read(): Promise<PendingExplain | undefined> {
    try {
      const buf = await vscode.workspace.fs.readFile(this.uri());
      const text = Buffer.from(buf).toString('utf8');
      const lines = text.split(/\r?\n/);
      const webUrl = (lines[0] || '').trim();
      const kind = parseKind(lines[1] || '');
      const fsPath = (lines[2] || '').trim();
      const branch = (lines[3] || '').trim();
      if (!isPendingKey(webUrl) || !kind || !fsPath || !branch) {
        return undefined;
      }
      return { webUrl, kind, fsPath, branch };
    } catch {
      return undefined;
    }
  }

  async write(
    webUrl: string,
    kind: ReviewKind,
    fsPath: string,
    branch: string,
  ): Promise<PendingExplain> {
    const dir = vscode.Uri.joinPath(this.root, '.syn3');
    try {
      await vscode.workspace.fs.createDirectory(dir);
    } catch {
      // exists
    }
    const body = `${webUrl.trim()}\n${kind}\n${fsPath.trim()}\n${branch.trim()}\n`;
    await vscode.workspace.fs.writeFile(this.uri(), Buffer.from(body, 'utf8'));
    return {
      webUrl: webUrl.trim(),
      kind,
      fsPath: fsPath.trim(),
      branch: branch.trim(),
    };
  }

  async clear(): Promise<void> {
    try {
      await vscode.workspace.fs.delete(this.uri());
    } catch {
      // missing
    }
  }
}

export { pendingBranchKey, isPendingBranchKey };
