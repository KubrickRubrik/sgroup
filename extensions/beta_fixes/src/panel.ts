import * as vscode from 'vscode';
import { pickProject, readConfig, writeConfig, type BetaConfig } from './config';
import { listMessages, type Chip } from './discord';
import { loadSession, type SessionResult } from './supabase';

const WRONG_KEY = 'Неверный public KEY supabase';
const PROFILE_ERROR = 'Не удалось обновить профиль';
const NO_PROJECTS = 'Нет доступных проектов';
const DISCORD_ERROR = 'Не удалось загрузить сообщения';

type ViewMessage =
  | { type: 'auth'; error?: string; busy?: boolean }
  | { type: 'status'; text: string; spin?: boolean }
  | { type: 'chips'; chips: Chip[]; mode: 'replace' | 'prepend'; hasMore: boolean }
  | { type: 'banner'; text: string }
  | { type: 'idle' };

type ReadySession = Extract<SessionResult, { ok: true }>;

export function attachBetaPanel(
  panel: vscode.WebviewPanel,
  folder: vscode.Uri,
  extensionUri: vscode.Uri,
): vscode.Disposable {
  const session = new BetaSession(panel, folder, extensionUri);
  session.start();
  return session;
}

class BetaSession implements vscode.Disposable {
  private disposed = false;
  private ready = false;
  private latest?: ViewMessage;
  private busy = false;
  private loadingOlder = false;
  private hasMore = false;
  private chips: Chip[] = [];
  private channelId = '';
  private token = '';

  private readonly listener: vscode.Disposable;

  constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly folder: vscode.Uri,
    extensionUri: vscode.Uri,
  ) {
    const media = vscode.Uri.joinPath(extensionUri, 'media');
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [media],
    };
    this.listener = panel.webview.onDidReceiveMessage((message: unknown) => {
      void this.onMessage(message);
    });
    panel.webview.html = html(panel.webview, media);
  }

  start(): void {
    void this.bootstrap();
  }

  dispose(): void {
    this.disposed = true;
    this.listener.dispose();
  }

  private async bootstrap(): Promise<void> {
    const stored = await readConfig(this.folder);
    if (this.disposed) {
      return;
    }
    if (!stored) {
      this.post({ type: 'auth' });
      return;
    }
    this.post({ type: 'status', text: '', spin: true });
    const session = await loadSession(stored.key);
    if (this.disposed) {
      return;
    }
    if (!session.ok) {
      if (session.reason === 'rejected') {
        this.post({ type: 'auth', error: WRONG_KEY });
        return;
      }
      this.post({ type: 'status', text: PROFILE_ERROR });
      return;
    }
    await this.publish(stored.key, session, stored.activeProjectId);
  }

  private async onMessage(message: unknown): Promise<void> {
    const row = asRecord(message);
    if (!row || typeof row.type !== 'string') {
      return;
    }
    if (row.type === 'ready') {
      const wasReady = this.ready;
      this.ready = true;
      if (!wasReady && this.latest) {
        void this.panel.webview.postMessage(this.latest);
      }
      return;
    }
    if (row.type === 'login' && typeof row.key === 'string') {
      await this.login(row.key.trim());
      return;
    }
    if (row.type === 'loadOlder') {
      await this.loadOlder();
    }
  }

  private async login(key: string): Promise<void> {
    if (this.busy) {
      return;
    }
    if (!key) {
      this.post({ type: 'auth', error: WRONG_KEY });
      return;
    }
    this.busy = true;
    this.post({ type: 'auth', busy: true });
    try {
      const session = await loadSession(key);
      if (this.disposed) {
        return;
      }
      if (!session.ok) {
        this.post({
          type: 'auth',
          error: session.reason === 'rejected' ? WRONG_KEY : PROFILE_ERROR,
          busy: false,
        });
        return;
      }
      const stored = await readConfig(this.folder);
      if (this.disposed) {
        return;
      }
      await this.publish(key, session, stored?.activeProjectId ?? null);
    } finally {
      this.busy = false;
    }
  }

  private async publish(key: string, session: ReadySession, activeProjectId: number | null): Promise<void> {
    const project = pickProject(session.projects, activeProjectId);
    const config: BetaConfig = {
      key,
      admin: session.admin,
      links: session.links,
      projects: session.projects,
      activeProjectId: project?.id ?? null,
    };
    try {
      await writeConfig(this.folder, config);
    } catch {
      if (!this.disposed) {
        this.post({ type: 'status', text: PROFILE_ERROR });
      }
      return;
    }
    if (this.disposed) {
      return;
    }
    if (!project) {
      this.clearChannel();
      this.post({ type: 'status', text: NO_PROJECTS });
      return;
    }
    this.channelId = project.id_channel;
    this.token = project.token;
    const page = await listMessages(project.token, project.id_channel);
    if (this.disposed) {
      return;
    }
    if (!page.ok) {
      this.clearChannel();
      this.post({ type: 'status', text: DISCORD_ERROR });
      return;
    }
    this.chips = page.page.chips;
    this.hasMore = page.page.hasMore;
    this.post({ type: 'chips', chips: page.page.chips, mode: 'replace', hasMore: page.page.hasMore });
  }

  private async loadOlder(): Promise<void> {
    if (this.loadingOlder) {
      return;
    }
    const oldest = this.chips[0]?.id;
    if (!this.hasMore || !this.token || !this.channelId || !oldest) {
      this.post({ type: 'idle' });
      return;
    }
    this.loadingOlder = true;
    try {
      const page = await listMessages(this.token, this.channelId, oldest);
      if (this.disposed) {
        return;
      }
      if (!page.ok) {
        this.post({ type: 'banner', text: DISCORD_ERROR });
        return;
      }
      const seen = new Set(this.chips.map((chip) => chip.id));
      const fresh = page.page.chips.filter((chip) => !seen.has(chip.id));
      if (fresh.length === 0) {
        this.hasMore = false;
        this.post({ type: 'chips', chips: [], mode: 'prepend', hasMore: false });
        return;
      }
      this.chips = [...fresh, ...this.chips];
      this.hasMore = page.page.hasMore;
      this.post({
        type: 'chips',
        chips: fresh,
        mode: 'prepend',
        hasMore: page.page.hasMore,
      });
    } finally {
      this.loadingOlder = false;
    }
  }

  private clearChannel(): void {
    this.channelId = '';
    this.token = '';
    this.chips = [];
    this.hasMore = false;
  }

  private post(message: ViewMessage): void {
    if (message.type === 'chips') {
      this.latest = { type: 'chips', chips: this.chips, mode: 'replace', hasMore: this.hasMore };
    } else if (message.type === 'auth' || message.type === 'status') {
      this.latest = message;
    }
    if (!this.ready || this.disposed) {
      return;
    }
    void this.panel.webview.postMessage(message);
  }
}

function html(webview: vscode.Webview, media: vscode.Uri): string {
  const css = webview.asWebviewUri(vscode.Uri.joinPath(media, 'panel.css'));
  const script = webview.asWebviewUri(vscode.Uri.joinPath(media, 'panel.js'));
  const csp = [
    "default-src 'none'",
    `style-src ${webview.cspSource}`,
    `script-src ${webview.cspSource}`,
  ].join('; ');
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="${css}" />
  <title>beta_fixes</title>
</head>
<body>
  <section id="boot"><span class="spinner"></span></section>
  <section id="auth" hidden>
    <h1>Авторизация</h1>
    <label for="key">public KEY</label>
    <input id="key" type="text" spellcheck="false" autocomplete="off" />
    <button type="button" id="login"><span>Войти</span><span id="login-spin" class="spinner" hidden></span></button>
    <p id="auth-error" class="error" hidden></p>
  </section>
  <section id="status" hidden>
    <span id="status-spin" class="spinner" hidden></span>
    <p id="status-text"></p>
  </section>
  <section id="list-view" hidden>
    <p id="banner" class="error" hidden></p>
    <div id="list-wrap">
      <div id="list">
        <div id="chips"></div>
      </div>
      <div id="bar" hidden><div id="thumb"></div></div>
    </div>
  </section>
  <script src="${script}"></script>
</body>
</html>`;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}
