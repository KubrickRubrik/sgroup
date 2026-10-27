import * as vscode from 'vscode';
import { MarkerStore } from './markerStore';

/** Built-in Git extension API (version 1). */
interface GitExtension {
  getAPI(version: 1): GitAPI;
}

type GitAPIState = 'uninitialized' | 'initialized';

interface GitAPI {
  state: GitAPIState;
  onDidChangeState: vscode.Event<GitAPIState>;
  repositories: GitRepository[];
  onDidOpenRepository: vscode.Event<GitRepository>;
  onDidCloseRepository: vscode.Event<GitRepository>;
}

interface GitRepository {
  rootUri: vscode.Uri;
  state: GitRepositoryState;
}

interface GitRepositoryState {
  onDidChange: vscode.Event<void>;
  workingTreeChanges: readonly GitChange[];
  indexChanges: readonly GitChange[];
  mergeChanges: readonly GitChange[];
}

interface GitChange {
  uri: vscode.Uri;
  originalUri: vscode.Uri;
  renameUri?: vscode.Uri;
  status: number;
}

/** Matches vscode.git Status.IGNORED. */
const STATUS_IGNORED = 8;

/**
 * Watches the built-in Git extension and reports workspace-relative paths that
 * have on-disk uncommitted changes (working tree, index, merge). Ignored files
 * are skipped. Paths use the same posix form as MarkerStore.toRelative.
 */
export class DirtyPathWatcher implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private readonly repoListeners = new Map<string, vscode.Disposable>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private paths: string[] = [];
  private ready = false;

  constructor(
    private readonly store: MarkerStore,
    private readonly onDidChange: (paths: string[]) => void,
  ) {
    void this.start();
  }

  /** Latest snapshot. Empty until the Git API is ready or when there is no repo. */
  snapshot(): string[] {
    return this.paths;
  }

  dispose(): void {
    clearTimeout(this.timer);
    for (const sub of this.repoListeners.values()) {
      sub.dispose();
    }
    this.repoListeners.clear();
    this.disposables.forEach((d) => d.dispose());
  }

  private async start(): Promise<void> {
    const extension = vscode.extensions.getExtension<GitExtension>('vscode.git');
    if (!extension) {
      this.publish([]);
      return;
    }
    let api: GitAPI;
    try {
      const exports = extension.isActive ? extension.exports : await extension.activate();
      api = exports.getAPI(1);
    } catch {
      this.publish([]);
      return;
    }
    this.ready = true;
    const bind = () => {
      this.bindRepositories(api);
      this.schedule();
    };
    if (api.state === 'initialized') {
      bind();
    }
    this.disposables.push(
      api.onDidChangeState((state) => {
        if (state === 'initialized') {
          bind();
        }
      }),
      api.onDidOpenRepository(() => bind()),
      api.onDidCloseRepository(() => bind()),
    );
  }

  private bindRepositories(api: GitAPI): void {
    const seen = new Set<string>();
    for (const repo of api.repositories) {
      const key = repo.rootUri.toString();
      seen.add(key);
      if (this.repoListeners.has(key)) {
        continue;
      }
      this.repoListeners.set(
        key,
        repo.state.onDidChange(() => {
          this.schedule();
        }),
      );
    }
    for (const [key, sub] of this.repoListeners) {
      if (seen.has(key)) {
        continue;
      }
      sub.dispose();
      this.repoListeners.delete(key);
    }
  }

  private schedule(): void {
    if (!this.ready) {
      return;
    }
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.refresh(), 300);
  }

  private refresh(): void {
    const extension = vscode.extensions.getExtension<GitExtension>('vscode.git');
    if (!extension?.isActive) {
      this.publish([]);
      return;
    }
    let api: GitAPI;
    try {
      api = extension.exports.getAPI(1);
    } catch {
      this.publish([]);
      return;
    }
    if (api.state !== 'initialized') {
      this.publish([]);
      return;
    }
    const next = new Set<string>();
    for (const repo of api.repositories) {
      this.collect(repo.state.workingTreeChanges, next);
      this.collect(repo.state.indexChanges, next);
      this.collect(repo.state.mergeChanges, next);
    }
    this.publish([...next].sort());
  }

  private collect(changes: readonly GitChange[], into: Set<string>): void {
    for (const change of changes) {
      if (change.status === STATUS_IGNORED) {
        continue;
      }
      this.addUri(change.uri, into);
      this.addUri(change.originalUri, into);
      if (change.renameUri) {
        this.addUri(change.renameUri, into);
      }
    }
  }

  private addUri(uri: vscode.Uri, into: Set<string>): void {
    const rel = this.store.toRelative(uri);
    if (rel) {
      into.add(rel);
    }
  }

  private publish(paths: string[]): void {
    const prev = this.paths.join('\0');
    const next = paths.join('\0');
    this.paths = paths;
    if (prev === next) {
      return;
    }
    this.onDidChange(paths);
  }
}
