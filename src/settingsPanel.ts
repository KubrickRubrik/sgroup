import * as crypto from 'crypto';
import * as vscode from 'vscode';
import {
  clearAllSyn3Secrets,
  deleteProfileHostToken,
  deleteProfileHostTokens,
  GitHostProvider,
  readProfileHostToken,
  secretsStatus,
  storeSecrets,
  writeProfileHostToken,
} from './accessStore';
import { isValidChannelId, reviewChannelConflicts } from './discordSetup';
import { normalizeLocale, stringsFor, t, Syn3Locale } from './i18n';
import { listProjectDirectory } from './projectNav';
import {
  Appearance,
  DEFAULT_APPEARANCE,
  GENERAL_PROFILE_ID,
  MarkerStore,
  STYLES_PATH,
} from './markerStore';

type IncomingMessage =
  | { type: 'ready' }
  | { type: 'setAppearance'; appearance: Partial<Appearance> }
  | {
      type: 'setReviewPaths';
      reviewSkillPath?: string;
      reviewDirPath?: string;
      reviewModel?: string;
      reviewFixModel?: string;
    }
  | { type: 'openReviewPromptExample' }
  | { type: 'listProjectDir'; seq: number; rel?: string }
  | {
      type: 'setGitBinding';
      provider: GitHostProvider;
      nick?: string;
      token?: string;
      clearToken?: boolean;
    }
  | {
      type: 'setCatalogChannels';
      channelProfile?: string;
      channelExplorer?: string;
      channelNotes?: string;
      channelLinks?: string;
      channelReview?: string;
      discordToken?: string;
    }
  | {
      type: 'profile';
      action: 'activate' | 'create' | 'rename' | 'delete' | 'syncPush' | 'syncPull';
      id?: string;
      name?: string;
    }
  | { type: 'openProfileEditor'; id?: string }
  | { type: 'clearAllData' };

export class SettingsPanel implements vscode.Disposable {
  static readonly viewType = 'syn3Settings';

  private panel?: vscode.WebviewPanel;
  private readonly subscriptions: vscode.Disposable[];

  constructor(
    private readonly store: MarkerStore,
    private readonly extensionUri: vscode.Uri,
    private readonly secrets: vscode.SecretStorage,
    private readonly openProfileEditor?: (profileId?: string) => void,
  ) {
    this.subscriptions = [
      store.onDidChange(() => {
        if (this.panel) {
          void this.postState();
        }
      }),
      secrets.onDidChange(() => {
        if (this.panel) {
          void this.postState();
        }
      }),
    ];
  }

  dispose(): void {
    this.panel?.dispose();
    this.subscriptions.forEach((s) => s.dispose());
  }

  open(): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Active);
      void this.postState();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      SettingsPanel.viewType,
      'Syn3 Settings',
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    this.panel = panel;
    panel.iconPath = {
      light: vscode.Uri.joinPath(this.extensionUri, 'media', 'map-icon.svg'),
      dark: vscode.Uri.joinPath(this.extensionUri, 'media', 'map-icon.svg'),
    };
    panel.webview.html = this.html(panel.webview);
    panel.webview.onDidReceiveMessage((message: IncomingMessage) => this.onMessage(message));
    panel.onDidDispose(() => {
      this.panel = undefined;
    });
  }

  private async onMessage(message: IncomingMessage): Promise<void> {
    if (message.type === 'ready') {
      await this.postState();
      return;
    }
    if (message.type === 'setAppearance') {
      await this.store.setAppearance(message.appearance);
      return;
    }
    if (message.type === 'setReviewPaths') {
      await this.store.setActiveReviewPaths({
        reviewSkillPath: message.reviewSkillPath,
        reviewDirPath: message.reviewDirPath,
        reviewModel: message.reviewModel,
        reviewFixModel: message.reviewFixModel,
      });
      return;
    }
    if (message.type === 'setGitBinding') {
      await this.onGitBinding(message);
      return;
    }
    if (message.type === 'setCatalogChannels') {
      await this.onCatalogChannels(message);
      return;
    }
    if (message.type === 'listProjectDir') {
      await this.listProjectDir(message.seq, message.rel);
      return;
    }
    if (message.type === 'openReviewPromptExample') {
      const doc = vscode.Uri.joinPath(this.extensionUri, 'docs', 'review-prompt-template.md');
      try {
        await vscode.window.showTextDocument(doc, { preview: true, viewColumn: vscode.ViewColumn.Beside });
      } catch {
        await vscode.window.showErrorMessage('Could not open review prompt template');
      }
      return;
    }
    if (message.type === 'openProfileEditor') {
      this.openProfileEditor?.(message.id);
      return;
    }
    if (message.type === 'clearAllData') {
      await this.onClearAllData();
      return;
    }
    if (message.type === 'profile') {
      await this.onProfile(message.action, message.id, message.name);
    }
  }

  private async onClearAllData(): Promise<void> {
    const locale = this.locale();
    const confirm = t(locale, 'clearAllConfirmAction');
    const choice = await vscode.window.showWarningMessage(
      t(locale, 'clearAllConfirm'),
      { modal: true },
      confirm,
    );
    if (choice !== confirm) {
      return;
    }
    const profileIds = this.store.profiles().map((p) => p.id);
    if (!profileIds.includes(GENERAL_PROFILE_ID)) {
      profileIds.push(GENERAL_PROFILE_ID);
    }
    await clearAllSyn3Secrets(this.secrets, profileIds);
    await this.store.clearAllData();
    await this.postState();
    void vscode.window.showInformationMessage(`Syn3: ${t(locale, 'clearAllDone')}`);
  }

  private async onProfile(
    action: 'activate' | 'create' | 'rename' | 'delete' | 'syncPush' | 'syncPull',
    id?: string,
    name?: string,
  ): Promise<void> {
    if (action === 'activate') {
      if (id) {
        await this.store.setActiveProfile(id);
      }
      return;
    }
    if (action === 'create') {
      const trimmed = (name ?? '').trim();
      if (!trimmed || !this.store.isValidProfileName(trimmed)) {
        return;
      }
      await this.store.createProfile(trimmed);
      return;
    }
    if (action === 'rename') {
      if (!id || id === GENERAL_PROFILE_ID) {
        return;
      }
      const current = this.store.profiles().find((p) => p.id === id);
      if (!current) {
        return;
      }
      const locale = this.locale();
      const next = await vscode.window.showInputBox({
        title: t(locale, 'profileRenameTitle'),
        prompt: t(locale, 'profileRenamePrompt'),
        value: current.name,
        validateInput: (v) => {
          const trimmed = v.trim();
          if (!trimmed) {
            return t(locale, 'profileNameEmpty');
          }
          if (!this.store.isValidProfileName(trimmed, id)) {
            return t(locale, 'profileNameTaken');
          }
          return undefined;
        },
      });
      if (!next) {
        return;
      }
      await this.store.renameProfile(id, next);
      return;
    }
    if (action === 'delete') {
      if (!id || id === GENERAL_PROFILE_ID) {
        return;
      }
      const current = this.store.profiles().find((p) => p.id === id);
      if (!current) {
        return;
      }
      const locale = this.locale();
      const deleteLabel = t(locale, 'profileDeleteAction');
      const confirm = await vscode.window.showWarningMessage(
        t(locale, 'profileDeleteConfirm', { name: current.name }),
        { modal: true },
        deleteLabel,
      );
      if (confirm !== deleteLabel) {
        return;
      }
      const removed = await this.store.deleteProfile(id);
      if (removed) {
        await deleteProfileHostTokens(this.secrets, id);
      }
      return;
    }
    if (action === 'syncPush') {
      const profileChannel = this.store.catalogChannels().profile?.trim() || '';
      if (!profileChannel) {
        void vscode.window.showErrorMessage(`Syn3: ${t(this.locale(), 'channelProfileRequired')}`);
        return;
      }
      const result = await this.store.pushProfileConfig();
      if (!result.ok && result.message) {
        const text =
          result.message === 'cloudPullFirst'
            ? t(this.locale(), 'cloudPullFirst')
            : result.message;
        void vscode.window.showErrorMessage(`Syn3: ${text}`);
      }
      return;
    }
    if (action === 'syncPull') {
      const result = await this.store.pullProfileConfig();
      if (!result.ok && result.message) {
        void vscode.window.showErrorMessage(`Syn3: ${result.message}`);
      }
    }
  }

  private async onGitBinding(message: {
    provider: GitHostProvider;
    nick?: string;
    token?: string;
    clearToken?: boolean;
  }): Promise<void> {
    const provider: GitHostProvider = message.provider === 'github' ? 'github' : 'gitlab';
    if (typeof message.nick === 'string') {
      await this.store.setActiveGitNick(provider, message.nick);
    }
    const profileId = this.store.activeProfileId;
    if (message.clearToken) {
      await deleteProfileHostToken(this.secrets, profileId, provider);
    } else if (message.token?.trim()) {
      await writeProfileHostToken(this.secrets, profileId, provider, message.token);
    }
    await this.postState();
  }

  private async onCatalogChannels(message: {
    channelProfile?: string;
    channelExplorer?: string;
    channelNotes?: string;
    channelLinks?: string;
    channelReview?: string;
    discordToken?: string;
  }): Promise<void> {
    const values = [
      message.channelProfile,
      message.channelExplorer,
      message.channelNotes,
      message.channelLinks,
      message.channelReview,
    ];
    for (const value of values) {
      const trimmed = (value ?? '').trim();
      if (trimmed && !isValidChannelId(trimmed)) {
        void vscode.window.showErrorMessage(`Syn3: ${t(this.locale(), 'reviewFieldChannelId')}`);
        return;
      }
    }
    const review = (message.channelReview ?? '').trim();
    if (
      review &&
      reviewChannelConflicts(review, {
        profile: message.channelProfile ?? '',
        explorer: message.channelExplorer,
        notes: message.channelNotes,
        links: message.channelLinks,
      })
    ) {
      void vscode.window.showErrorMessage(`Syn3: ${t(this.locale(), 'channelReviewMustBeDistinct')}`);
      return;
    }
    if (message.discordToken?.trim()) {
      await storeSecrets(this.secrets, { discord: message.discordToken });
    }
    await this.store.setCatalogChannels({
      profile: message.channelProfile ?? '',
      explorer: message.channelExplorer ?? '',
      notes: message.channelNotes ?? '',
      links: message.channelLinks ?? '',
      review: message.channelReview ?? '',
    });
    await this.postState();
  }

  private async listProjectDir(seq: number, relRaw: string | undefined): Promise<void> {
    if (!this.panel) {
      return;
    }
    const listed = await listProjectDirectory(this.store, relRaw);
    await this.panel.webview.postMessage({
      type: 'projectDir',
      seq,
      ...listed,
    });
  }

  private locale(): Syn3Locale {
    return normalizeLocale(this.store.appearance.language);
  }

  private async postState(): Promise<void> {
    if (!this.panel) {
      return;
    }
    const locale = this.locale();
    this.panel.title = t(locale, 'settingsTitle');
    const reviewPaths = this.store.activeReviewPaths();
    const nicks = this.store.activeGitNicks();
    const profileId = this.store.activeProfileId;
    const githubToken = (await readProfileHostToken(this.secrets, profileId, 'github')) || '';
    const gitlabToken = (await readProfileHostToken(this.secrets, profileId, 'gitlab')) || '';
    const channels = this.store.catalogChannels();
    const secrets = await secretsStatus(this.secrets);
    await this.panel.webview.postMessage({
      type: 'state',
      appearance: this.store.appearance,
      defaults: DEFAULT_APPEARANCE,
      profiles: this.store.profiles(),
      activeProfileId: profileId,
      activeProfileName: this.store.activeProfileName,
      gitBindings: {
        githubNick: nicks.githubNick,
        gitlabNick: nicks.gitlabNick,
        githubToken,
        gitlabToken,
      },
      reviewSkillPath: reviewPaths.skillPath,
      reviewDirPath: reviewPaths.dirPath,
      reviewModel: reviewPaths.model,
      reviewFixModel: reviewPaths.fixModel,
      positionSync: this.store.positionSync(),
      catalogChannels: {
        profile: channels.profile || '',
        explorer: channels.explorer || '',
        notes: channels.notes || '',
        links: channels.links || '',
        review: channels.review || '',
      },
      hasDiscord: secrets.hasDiscord,
      locale,
      i18n: stringsFor(locale),
      stylesPath: STYLES_PATH,
    });
  }

  private html(webview: vscode.Webview): string {
    const nonce = crypto.randomBytes(16).toString('base64');
    const generalId = GENERAL_PROFILE_ID;
    const personLight = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'icons', 'person-light.svg'),
    );
    const personDark = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'icons', 'person-dark.svg'),
    );
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    html, body {
      background: var(--vscode-editor-background);
      color: var(--vscode-foreground);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      margin: 0;
      padding: 0;
    }
    main {
      box-sizing: border-box;
      margin: 0 auto;
      max-width: 560px;
      padding: 20px 24px 40px;
    }
    .title-row {
      align-items: center;
      display: flex;
      flex-wrap: wrap;
      gap: 10px 16px;
      justify-content: space-between;
      margin: 0 0 6px;
    }
    h1 {
      font-size: 1.35em;
      font-weight: 600;
      margin: 0 0 12px;
    }
    .profile-switch {
      position: relative;
      text-align: right;
    }
    .profile-switch-btn {
      align-items: center;
      background: var(--vscode-button-secondaryBackground, transparent);
      border: 1px solid var(--vscode-button-border, var(--vscode-widget-border, transparent));
      border-radius: 4px;
      color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
      cursor: pointer;
      display: flex;
      flex-direction: row;
      font: inherit;
      gap: 10px;
      min-width: 0;
      padding: 4px 6px 4px 10px;
    }
    .profile-switch-btn:hover {
      background: var(--vscode-toolbar-hoverBackground, var(--vscode-list-hoverBackground));
    }
    .profile-switch-text {
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: 1px;
      min-width: 0;
      text-align: right;
    }
    .profile-switch-name {
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .profile-switch-label {
      color: var(--vscode-descriptionForeground);
      font-size: 0.85em;
    }
    .profile-switch-avatar {
      align-items: center;
      background: var(--vscode-button-secondaryBackground, rgba(127, 127, 127, 0.18));
      border: 1px solid var(--vscode-widget-border, transparent);
      border-radius: 50%;
      display: flex;
      flex-shrink: 0;
      height: 32px;
      justify-content: center;
      width: 32px;
    }
    .profile-switch-avatar img {
      display: none;
      height: 16px;
      width: 16px;
    }
    body:not(.vscode-dark):not(.vscode-high-contrast) .profile-switch-avatar .tone-light,
    body.vscode-high-contrast-light .profile-switch-avatar .tone-light {
      display: block;
    }
    body.vscode-dark .profile-switch-avatar .tone-dark,
    body.vscode-high-contrast .profile-switch-avatar .tone-dark {
      display: block;
    }
    .profile-menu {
      background: var(--vscode-menu-background, var(--vscode-editor-background));
      border: 1px solid var(--vscode-menu-border, var(--vscode-widget-border, transparent));
      border-radius: 4px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.36);
      box-sizing: border-box;
      min-width: 100%;
      overflow: hidden;
      padding: 4px 0;
      position: absolute;
      right: 0;
      top: 100%;
      width: max-content;
      z-index: 40;
    }
    .profile-menu[hidden] {
      display: none;
    }
    .profile-list {
      display: flex;
      flex-direction: column;
      max-height: 240px;
      overflow-x: hidden;
      overflow-y: auto;
    }
    .profile-row {
      align-items: center;
      background: transparent;
      border: none;
      box-sizing: border-box;
      color: var(--vscode-menu-foreground, var(--vscode-foreground));
      cursor: pointer;
      display: flex;
      font: inherit;
      font-size: 13px;
      gap: 6px;
      padding: 4px 8px 4px 12px;
      text-align: left;
      white-space: nowrap;
      width: 100%;
    }
    .profile-row:hover {
      background: color-mix(in srgb, var(--vscode-list-hoverBackground) 70%, transparent);
    }
    .profile-row.is-active {
      background: color-mix(in srgb, var(--vscode-list-activeSelectionBackground, var(--vscode-list-hoverBackground)) 55%, transparent);
    }
    .profile-row .profile-name {
      flex: 1;
      white-space: nowrap;
    }
    .profile-row .profile-bound-count {
      color: var(--vscode-descriptionForeground, var(--vscode-foreground));
      flex-shrink: 0;
      font-size: 12px;
      font-variant-numeric: tabular-nums;
      opacity: 0.75;
    }
    .profile-row .profile-actions {
      display: flex;
      flex-shrink: 0;
      gap: 2px;
      opacity: 0.75;
    }
    .profile-row .profile-actions button {
      align-items: center;
      background: transparent;
      border: none;
      border-radius: 3px;
      color: inherit;
      cursor: pointer;
      display: flex;
      font: inherit;
      height: 22px;
      justify-content: center;
      padding: 0;
      width: 22px;
    }
    .profile-row .profile-actions button:hover {
      background: var(--vscode-toolbar-hoverBackground, var(--vscode-list-hoverBackground));
    }
    .profile-row .profile-actions button:disabled {
      cursor: default;
      opacity: 0.35;
    }
    .sync-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin: 0;
    }
    .sync-actions button {
      align-items: center;
      background: var(--vscode-button-secondaryBackground, var(--vscode-button-background));
      border: none;
      border-radius: 4px;
      color: var(--vscode-button-secondaryForeground, var(--vscode-button-foreground));
      cursor: pointer;
      display: inline-flex;
      font: inherit;
      font-size: 12px;
      gap: 6px;
      height: 28px;
      justify-content: center;
      line-height: 1;
      min-width: 36px;
      padding: 0 10px;
      white-space: nowrap;
    }
    .sync-actions button .sync-arrow {
      font-size: 14px;
      line-height: 1;
    }
    .sync-actions button:hover:not(:disabled) {
      background: var(--vscode-button-secondaryHoverBackground, var(--vscode-button-hoverBackground));
    }
    .sync-actions button:disabled {
      cursor: default;
      opacity: 0.4;
    }
    .profile-create {
      align-items: center;
      border-top: 1px solid var(--vscode-menu-border, var(--vscode-widget-border, transparent));
      box-sizing: border-box;
      display: flex;
      gap: 4px;
      margin-top: 4px;
      padding: 6px 8px;
      width: 100%;
    }
    .profile-create input {
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 2px;
      box-sizing: border-box;
      color: var(--vscode-input-foreground);
      flex: 1;
      font: inherit;
      font-size: 12px;
      min-width: 0;
      padding: 3px 6px;
    }
    .profile-create input:focus {
      outline: 1px solid var(--vscode-focusBorder, #4daafc);
    }
    .profile-create button {
      background: var(--vscode-button-secondaryBackground, transparent);
      border: 1px solid var(--vscode-button-border, transparent);
      border-radius: 3px;
      color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
      cursor: pointer;
      font: inherit;
      height: 26px;
      line-height: 1;
      min-width: 26px;
      padding: 0 6px;
    }
    .profile-create button.profile-add-wide {
      flex: 1;
      width: 100%;
    }
    .hint {
      color: var(--vscode-descriptionForeground);
      margin: 0 0 22px;
    }
    section {
      border-top: 1px solid var(--vscode-widget-border, var(--vscode-panel-border, #444));
      margin-top: 18px;
      padding-top: 16px;
    }
    section:first-of-type {
      border-top: 0;
      margin-top: 0;
      padding-top: 0;
    }
    section.bindings {
      margin-bottom: 16px;
    }
    h2 {
      font-size: 1em;
      font-weight: 600;
      margin: 0 0 12px;
    }
    .row {
      align-items: center;
      display: grid;
      gap: 10px 14px;
      grid-template-columns: minmax(120px, 1.1fr) minmax(140px, 2fr) 52px;
      margin-bottom: 12px;
    }
    label {
      color: var(--vscode-foreground);
    }
    input[type="range"] {
      width: 100%;
      accent-color: var(--vscode-focusBorder, #4daafc);
    }
    input[type="checkbox"] {
      accent-color: var(--vscode-focusBorder, #4daafc);
      height: 16px;
      justify-self: start;
      width: 16px;
    }
    .value {
      color: var(--vscode-descriptionForeground);
      font-variant-numeric: tabular-nums;
      text-align: right;
    }
    .note {
      color: var(--vscode-descriptionForeground);
      font-size: 0.9em;
      margin: 4px 0 0;
    }
    select {
      background: var(--vscode-dropdown-background, var(--vscode-input-background));
      border: 1px solid var(--vscode-dropdown-border, var(--vscode-input-border, transparent));
      border-radius: 2px;
      color: var(--vscode-dropdown-foreground, var(--vscode-input-foreground));
      font: inherit;
      grid-column: 2 / span 2;
      justify-self: stretch;
      max-width: 220px;
      padding: 4px 8px;
    }
    .row.text-row {
      align-items: center;
      grid-template-columns: minmax(8rem, 11rem) 1fr;
    }
    .row.text-row input[type="text"],
    .row.text-row input[type="password"] {
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 2px;
      color: var(--vscode-input-foreground);
      font: inherit;
      justify-self: stretch;
      max-width: none;
      padding: 4px 8px;
      width: 100%;
    }
    .channels {
      margin-bottom: 20px;
    }
    .channels > .note[data-i18n="noteChannels"] {
      margin-bottom: 14px;
    }
    .danger-btn {
      background: var(--vscode-button-secondaryBackground, var(--vscode-button-background));
      border: 1px solid var(--vscode-inputValidation-errorBorder, #f14c4c);
      border-radius: 2px;
      color: var(--vscode-errorForeground, #f14c4c);
      cursor: pointer;
      font: inherit;
      padding: 6px 12px;
    }
    .danger-btn:hover {
      background: var(--vscode-inputValidation-errorBackground, rgba(241, 76, 76, 0.15));
    }
    #reviewModel,
    #reviewFixModel {
      text-transform: lowercase;
    }
    .row.bind-row {
      grid-template-columns: 4.6rem minmax(0, 0.9fr) minmax(0, 1.35fr);
    }
    .row.bind-row input {
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 2px;
      box-sizing: border-box;
      color: var(--vscode-input-foreground);
      font: inherit;
      min-width: 0;
      padding: 4px 8px;
      width: 100%;
    }
    .row.bind-row input:focus {
      outline: 1px solid var(--vscode-focusBorder, #4daafc);
    }
    .token-field {
      align-items: center;
      display: flex;
      gap: 4px;
      min-width: 0;
    }
    .token-field input {
      flex: 1;
    }
    .token-clear {
      background: transparent;
      border: 1px solid var(--vscode-button-border, transparent);
      border-radius: 3px;
      color: var(--vscode-foreground);
      cursor: pointer;
      flex: 0 0 auto;
      font: inherit;
      height: 26px;
      line-height: 1;
      padding: 0;
      width: 26px;
    }
    .token-clear:hover {
      background: var(--vscode-toolbar-hoverBackground, rgba(128, 128, 128, 0.2));
    }
    .review-example {
      background: var(--vscode-button-secondaryBackground, var(--vscode-button-background));
      border: none;
      border-radius: 2px;
      box-sizing: border-box;
      color: var(--vscode-button-secondaryForeground, var(--vscode-button-foreground));
      cursor: pointer;
      display: block;
      font: inherit;
      margin: 4px 0 12px;
      padding: 8px 16px;
      text-align: center;
      width: 100%;
    }
    .review-example:hover {
      background: var(--vscode-button-secondaryHoverBackground, var(--vscode-button-hoverBackground));
    }
    .path-field {
      display: flex;
      gap: 6px;
      min-width: 0;
    }
    .row.text-row .path-field input[type="text"] {
      flex: 1 1 auto;
      min-width: 0;
      width: auto;
    }
    .path-browse {
      background: var(--vscode-button-secondaryBackground, transparent);
      border: 1px solid var(--vscode-button-border, var(--vscode-input-border, transparent));
      border-radius: 2px;
      color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
      cursor: pointer;
      flex: 0 0 auto;
      font: inherit;
      height: 26px;
      line-height: 1;
      padding: 0 8px;
    }
    .path-browse:hover {
      background: var(--vscode-button-secondaryHoverBackground, var(--vscode-toolbar-hoverBackground));
    }
    .path-nav {
      align-items: flex-start;
      background: rgba(0, 0, 0, 0.35);
      box-sizing: border-box;
      display: flex;
      inset: 0;
      justify-content: center;
      padding: 48px 16px 16px;
      position: fixed;
      z-index: 60;
    }
    .path-nav[hidden] {
      display: none;
    }
    .path-nav-panel {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border, #444));
      border-radius: 6px;
      box-shadow: 0 8px 28px rgba(0, 0, 0, 0.4);
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      max-height: min(520px, calc(100vh - 64px));
      width: min(480px, 100%);
    }
    .path-nav-title {
      font-size: 0.95em;
      font-weight: 600;
      margin: 0;
      padding: 12px 12px 0;
    }
    .path-nav-bar {
      align-items: center;
      display: flex;
      gap: 6px;
      padding: 8px 8px 6px;
    }
    .path-nav-icon {
      align-items: center;
      background: transparent;
      border: none;
      border-radius: 3px;
      color: var(--vscode-foreground);
      cursor: pointer;
      display: flex;
      flex: 0 0 auto;
      font: inherit;
      height: 26px;
      justify-content: center;
      padding: 0;
      width: 26px;
    }
    .path-nav-icon:hover:not(:disabled) {
      background: var(--vscode-toolbar-hoverBackground, var(--vscode-list-hoverBackground));
    }
    .path-nav-icon:disabled {
      cursor: default;
      opacity: 0.35;
    }
    .path-nav-crumbs {
      display: flex;
      flex: 1;
      flex-wrap: wrap;
      gap: 2px;
      min-width: 0;
    }
    .path-crumb {
      background: transparent;
      border: none;
      border-radius: 3px;
      color: var(--vscode-textLink-foreground);
      cursor: pointer;
      font: inherit;
      max-width: 100%;
      overflow: hidden;
      padding: 2px 4px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .path-crumb:hover {
      background: var(--vscode-toolbar-hoverBackground, var(--vscode-list-hoverBackground));
    }
    .path-crumb-sep {
      color: var(--vscode-descriptionForeground);
      padding: 2px 0;
    }
    .path-nav-list {
      flex: 1;
      min-height: 160px;
      outline: none;
      overflow: auto;
      padding: 0 4px 4px;
    }
    .path-nav-empty {
      color: var(--vscode-descriptionForeground);
      margin: 12px 8px;
    }
    .path-nav-row {
      align-items: center;
      display: flex;
      gap: 2px;
    }
    .path-nav-row:hover {
      background: color-mix(in srgb, var(--vscode-list-hoverBackground) 70%, transparent);
    }
    .path-nav-open {
      align-items: center;
      background: transparent;
      border: none;
      color: var(--vscode-foreground);
      cursor: pointer;
      display: flex;
      flex: 1;
      font: inherit;
      gap: 6px;
      min-width: 0;
      padding: 5px 8px;
      text-align: left;
    }
    .path-nav-mark {
      color: var(--vscode-descriptionForeground);
      flex: 0 0 0.8em;
      text-align: center;
    }
    .path-nav-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .path-nav-pick {
      background: transparent;
      border: none;
      border-radius: 3px;
      color: var(--vscode-foreground);
      cursor: pointer;
      flex: 0 0 auto;
      font: inherit;
      height: 24px;
      margin-right: 4px;
      padding: 0 6px;
    }
    .path-nav-pick:hover {
      background: var(--vscode-toolbar-hoverBackground, var(--vscode-list-hoverBackground));
    }
    .path-nav-foot {
      border-top: 1px solid var(--vscode-widget-border, var(--vscode-panel-border, #444));
      padding: 8px;
    }
    .path-nav-foot button {
      background: var(--vscode-button-secondaryBackground, var(--vscode-button-background));
      border: none;
      border-radius: 2px;
      color: var(--vscode-button-secondaryForeground, var(--vscode-button-foreground));
      cursor: pointer;
      font: inherit;
      padding: 4px 10px;
      width: 100%;
    }
    .path-nav-foot button:hover {
      background: var(--vscode-button-secondaryHoverBackground, var(--vscode-button-hoverBackground));
    }
  </style>
</head>
<body>
  <main>
    <h1 data-i18n="settingsTitle">Syn3 Settings</h1>
    <section class="channels">
      <h2 data-i18n="sectionChannels">Discord channels</h2>
      <p class="note" data-i18n="noteChannels"></p>
      <div class="row text-row">
        <label for="channelProfile" data-i18n="labelChannelProfile">Profile channel</label>
        <input id="channelProfile" type="text" spellcheck="false" autocomplete="off" data-i18n-placeholder="channelIdPlaceholder" inputmode="numeric">
      </div>
      <div class="row text-row">
        <label for="channelExplorer" data-i18n="labelChannelExplorer">Explorer channel</label>
        <input id="channelExplorer" type="text" spellcheck="false" autocomplete="off" data-i18n-placeholder="channelIdPlaceholder" inputmode="numeric">
      </div>
      <div class="row text-row">
        <label for="channelNotes" data-i18n="labelChannelNotes">Notes maps</label>
        <input id="channelNotes" type="text" spellcheck="false" autocomplete="off" data-i18n-placeholder="channelIdPlaceholder" inputmode="numeric">
      </div>
      <div class="row text-row">
        <label for="channelLinks" data-i18n="labelChannelLinks">Links maps</label>
        <input id="channelLinks" type="text" spellcheck="false" autocomplete="off" data-i18n-placeholder="channelIdPlaceholder" inputmode="numeric">
      </div>
      <div class="row text-row">
        <label for="channelReview" data-i18n="labelChannelReview">Review channel</label>
        <input id="channelReview" type="text" spellcheck="false" autocomplete="off" data-i18n-placeholder="channelIdPlaceholder" inputmode="numeric">
      </div>
      <div class="row text-row" id="discord-token-row">
        <label for="discordToken" data-i18n="reviewFieldDiscordToken">Discord bot token</label>
        <input id="discordToken" type="password" spellcheck="false" autocomplete="new-password">
      </div>
      <p class="note" id="discord-token-saved" hidden></p>
      <p class="note" data-i18n="clearAllNote"></p>
      <div class="row">
        <button type="button" id="clear-all-data" class="danger-btn" data-i18n="clearAll">Clear all Syn3 data</button>
      </div>
    </section>
    <div class="title-row">
      <div class="profile-switch" id="profile-switch">
        <button type="button" class="profile-switch-btn" id="profile-switch-btn" aria-haspopup="menu" aria-expanded="false">
          <span class="profile-switch-text">
            <span class="profile-switch-name" id="profile-switch-name"></span>
            <span class="profile-switch-label" data-i18n="profileActive">active</span>
          </span>
          <span class="profile-switch-avatar" aria-hidden="true">
            <img class="tone-light" src="${personLight}" alt="">
            <img class="tone-dark" src="${personDark}" alt="">
          </span>
        </button>
        <div class="profile-menu" id="profile-menu" hidden role="menu" data-i18n-aria="profiles">
          <div class="profile-list" id="profile-list"></div>
          <div class="profile-create">
            <button type="button" id="profile-add" class="profile-add-wide" data-i18n="profileCreate">Create profile</button>
          </div>
        </div>
      </div>
      <div class="sync-actions">
        <button type="button" id="pos-sync-pull" data-i18n-title="profileSyncPull" data-i18n-aria="profileSyncPull">
          <span class="sync-arrow" aria-hidden="true">↓</span>
          <span data-i18n="labelPositionsPull">Pull</span>
        </button>
        <button type="button" id="pos-sync-push" data-i18n-title="profileSyncPush" data-i18n-aria="profileSyncPush">
          <span class="sync-arrow" aria-hidden="true">↑</span>
          <span data-i18n="labelPositionsPush">Send</span>
        </button>
      </div>
    </div>
    <p class="note" data-i18n="notePositions"></p>
    <section class="bindings">
      <h2 data-i18n="sectionBindings">Accounts</h2>
      <div class="row bind-row">
        <label for="githubNick" data-i18n="labelGithub">GitHub</label>
        <input id="githubNick" type="text" spellcheck="false" autocomplete="off" data-i18n-placeholder="gitNickPlaceholder" maxlength="128">
        <span class="token-field">
          <input id="githubToken" type="password" spellcheck="false" autocomplete="new-password" data-i18n-placeholder="gitTokenPlaceholder">
          <button type="button" id="githubTokenClear" class="token-clear" hidden data-i18n-aria="gitTokenClear">×</button>
        </span>
      </div>
      <div class="row bind-row">
        <label for="gitlabNick" data-i18n="labelGitlab">GitLab</label>
        <input id="gitlabNick" type="text" spellcheck="false" autocomplete="off" data-i18n-placeholder="gitNickPlaceholder" maxlength="128">
        <span class="token-field">
          <input id="gitlabToken" type="password" spellcheck="false" autocomplete="new-password" data-i18n-placeholder="gitTokenPlaceholder">
          <button type="button" id="gitlabTokenClear" class="token-clear" hidden data-i18n-aria="gitTokenClear">×</button>
        </span>
      </div>
      <p class="note" data-i18n="noteBindings"></p>
    </section>
    <div class="row">
      <label for="showProblemsTab" data-i18n="labelShowProblemsTab">Show problems tab</label>
      <input id="showProblemsTab" type="checkbox">
      <span class="value" data-for="showProblemsTab"></span>
    </div>
    <div class="row">
      <label for="cyclePageScroll" data-i18n="labelCyclePageScroll">Cycle page scroll</label>
      <input id="cyclePageScroll" type="checkbox">
      <span class="value" data-for="cyclePageScroll"></span>
    </div>
    <div class="row">
      <label for="openLinksInCursor" data-i18n="labelOpenLinksInCursor">Open links in Cursor</label>
      <input id="openLinksInCursor" type="checkbox">
      <span class="value" data-for="openLinksInCursor"></span>
    </div>
    <p class="hint" id="settings-hint"></p>

    <section>
      <div class="row">
        <label for="language" data-i18n="language">Language</label>
        <select id="language">
          <option value="en" data-i18n="languageEn">English</option>
          <option value="ru" data-i18n="languageRu">Russian</option>
        </select>
      </div>
    </section>

    <section>
      <h2 data-i18n="sectionSyncFetch">Auto fetch</h2>
      <div class="row">
        <label for="projectFetchSec" data-i18n="labelProjectFetchSec">Project lock interval</label>
        <input id="projectFetchSec" type="range" min="30" max="3600" step="10">
        <span class="value" data-for="projectFetchSec"></span>
      </div>
      <p class="note" data-i18n="noteProjectFetch"></p>
      <div class="row">
        <label for="filesFetchSec" data-i18n="labelFilesFetchSec">Explorer content check</label>
        <input id="filesFetchSec" type="range" min="30" max="3600" step="10">
        <span class="value" data-for="filesFetchSec"></span>
      </div>
      <p class="note" data-i18n="noteFilesFetch"></p>
      <div class="row">
        <label for="notesFetchSec" data-i18n="labelNotesFetchSec">Notes content check</label>
        <input id="notesFetchSec" type="range" min="30" max="3600" step="10">
        <span class="value" data-for="notesFetchSec"></span>
      </div>
      <p class="note" data-i18n="noteNotesFetch"></p>
      <div class="row">
        <label for="linksFetchSec" data-i18n="labelLinksFetchSec">Links content check</label>
        <input id="linksFetchSec" type="range" min="30" max="3600" step="10">
        <span class="value" data-for="linksFetchSec"></span>
      </div>
      <p class="note" data-i18n="noteLinksFetch"></p>
    </section>

    <section>
      <h2 data-i18n="sectionReview">Review</h2>
      <div class="row">
        <label for="reviewRefreshSec" data-i18n="labelReviewRefreshSec">Review MR interval</label>
        <input id="reviewRefreshSec" type="range" min="30" max="3600" step="10">
        <span class="value" data-for="reviewRefreshSec"></span>
      </div>
      <p class="note" data-i18n="noteReviewRefresh"></p>
    </section>

    <section>
      <h2 data-i18n="sectionFont">Map font</h2>
      <div class="row">
        <label for="fontGroup" data-i18n="labelFontGroup">Group</label>
        <input id="fontGroup" type="range" min="0.6" max="2" step="0.05">
        <span class="value" data-for="fontGroup"></span>
      </div>
      <div class="row">
        <label for="fontSubgroup" data-i18n="labelFontSubgroup">Subgroup</label>
        <input id="fontSubgroup" type="range" min="0.6" max="2" step="0.05">
        <span class="value" data-for="fontSubgroup"></span>
      </div>
      <div class="row">
        <label for="fontFolder" data-i18n="labelFontFolder">Folder</label>
        <input id="fontFolder" type="range" min="0.6" max="2" step="0.05">
        <span class="value" data-for="fontFolder"></span>
      </div>
      <div class="row">
        <label for="fontFile" data-i18n="labelFontFile">File</label>
        <input id="fontFile" type="range" min="0.6" max="2" step="0.05">
        <span class="value" data-for="fontFile"></span>
      </div>
      <div class="row">
        <label for="fontScale" data-i18n="labelFontScale">Multiplier</label>
        <input id="fontScale" type="range" min="1" max="5" step="0.1">
        <span class="value" data-for="fontScale"></span>
      </div>
      <p class="note" data-i18n="noteFont"></p>
    </section>

    <section>
      <h2 data-i18n="sectionGroup">Group</h2>
      <div class="row">
        <label for="cardGradient" data-i18n="labelCardGradient">Gradient</label>
        <input id="cardGradient" type="checkbox">
        <span class="value" data-for="cardGradient"></span>
      </div>
      <div class="row">
        <label for="cardFill" data-i18n="labelCardFill">Card fill</label>
        <input id="cardFill" type="range" min="0" max="100" step="1">
        <span class="value" data-for="cardFill"></span>
      </div>
      <div class="row">
        <label for="cardBorder" data-i18n="labelCardBorder">Card border</label>
        <input id="cardBorder" type="range" min="0" max="100" step="1">
        <span class="value" data-for="cardBorder"></span>
      </div>
      <div class="row">
        <label for="gradientDirection" data-i18n="labelGradientDirection">Gradient direction</label>
        <input id="gradientDirection" type="range" min="0" max="100" step="1">
        <span class="value" data-for="gradientDirection"></span>
      </div>
      <p class="note" data-i18n="noteGroup"></p>
    </section>

    <section>
      <h2 data-i18n="sectionContentBg">Content background</h2>
      <div class="row">
        <label for="bgFolder" data-i18n="labelBgFolder">Folder</label>
        <input id="bgFolder" type="range" min="0" max="100" step="1">
        <span class="value" data-for="bgFolder"></span>
      </div>
      <div class="row">
        <label for="bgFile" data-i18n="labelBgFile">File</label>
        <input id="bgFile" type="range" min="0" max="100" step="1">
        <span class="value" data-for="bgFile"></span>
      </div>
      <div class="row">
        <label for="bgSubgroup" data-i18n="labelBgSubgroup">Subgroup</label>
        <input id="bgSubgroup" type="range" min="0" max="100" step="1">
        <span class="value" data-for="bgSubgroup"></span>
      </div>
      <div class="row">
        <label for="bgClass" data-i18n="labelBgClass">Class</label>
        <input id="bgClass" type="range" min="0" max="100" step="1">
        <span class="value" data-for="bgClass"></span>
      </div>
      <div class="row">
        <label for="bgNote" data-i18n="labelBgNote">Note</label>
        <input id="bgNote" type="range" min="0" max="100" step="1">
        <span class="value" data-for="bgNote"></span>
      </div>
      <div class="row">
        <label for="bgHover" data-i18n="labelBgHover">Hover</label>
        <input id="bgHover" type="range" min="0" max="100" step="1">
        <span class="value" data-for="bgHover"></span>
      </div>
      <p class="note" data-i18n="noteContentBg"></p>
    </section>

    <section>
      <h2 data-i18n="sectionExplorer">Explorer</h2>
      <div class="row">
        <label for="labelSaturation" data-i18n="labelSaturation">Name saturation</label>
        <input id="labelSaturation" type="range" min="0" max="100" step="5">
        <span class="value" data-for="labelSaturation"></span>
      </div>
      <p class="note" data-i18n="noteExplorer"></p>
    </section>

    <section>
      <h2 data-i18n="sectionOpenFile">Open file</h2>
      <div class="row">
        <label for="openFileMark" data-i18n="labelOpenFileMark">Show marker</label>
        <input id="openFileMark" type="checkbox">
        <span class="value" data-for="openFileMark"></span>
      </div>
      <div class="row">
        <label for="showErrorIcon" data-i18n="labelShowErrorIcon">Show error icon</label>
        <input id="showErrorIcon" type="checkbox">
        <span class="value" data-for="showErrorIcon"></span>
      </div>
      <div class="row">
        <label for="openFileAnimate" data-i18n="labelOpenFileAnimate">Show animation</label>
        <input id="openFileAnimate" type="checkbox">
        <span class="value" data-for="openFileAnimate"></span>
      </div>
      <div class="row">
        <label for="openFileDuration" data-i18n="labelOpenFileDuration">Animation time</label>
        <input id="openFileDuration" type="range" min="0" max="3" step="0.1">
        <span class="value" data-for="openFileDuration"></span>
      </div>
      <p class="note" data-i18n="noteOpenFile"></p>
    </section>

    <section>
      <h2 data-i18n="sectionReview">Review</h2>
      <div class="row text-row">
        <label for="reviewSkillPath" data-i18n="labelReviewSkillPath">Review skill path</label>
        <span class="path-field">
          <input id="reviewSkillPath" type="text" spellcheck="false">
          <button type="button" id="browse-review-skill" class="path-browse" data-i18n-aria="browseProject" data-i18n-title="browseProject">…</button>
        </span>
      </div>
      <div class="row text-row">
        <label for="reviewDirPath" data-i18n="labelReviewDirPath">Review files directory</label>
        <span class="path-field">
          <input id="reviewDirPath" type="text" spellcheck="false">
          <button type="button" id="browse-review-dir" class="path-browse" data-i18n-aria="browseProject" data-i18n-title="browseProject">…</button>
        </span>
      </div>
      <div class="row text-row">
        <label for="reviewModel" data-i18n="labelReviewModel">Review agent model</label>
        <input id="reviewModel" type="text" spellcheck="false" autocapitalize="none" autocomplete="off" placeholder="e.g. sonnet-4-thinking">
      </div>
      <div class="row text-row">
        <label for="reviewFixModel" data-i18n="labelReviewFixModel">Fix agent model</label>
        <input id="reviewFixModel" type="text" spellcheck="false" autocapitalize="none" autocomplete="off" placeholder="e.g. sonnet-4-thinking">
      </div>
      <button type="button" id="review-prompt-example" class="review-example" data-i18n="reviewPromptExample">Required review prompt example</button>
      <p class="note" data-i18n="noteReviewPaths"></p>
    </section>
    <div id="path-nav" class="path-nav" hidden>
      <div class="path-nav-panel" role="dialog" aria-modal="true">
        <h3 id="path-nav-title" class="path-nav-title"></h3>
        <div class="path-nav-bar">
          <button type="button" id="path-nav-up" class="path-nav-icon" data-i18n-aria="pathNavUp" data-i18n-title="pathNavUp">↑</button>
          <div id="path-nav-crumbs" class="path-nav-crumbs"></div>
          <button type="button" id="path-nav-close" class="path-nav-icon" data-i18n-aria="pathNavClose" data-i18n-title="pathNavClose">×</button>
        </div>
        <div id="path-nav-list" class="path-nav-list" tabindex="-1"></div>
        <div class="path-nav-foot">
          <button type="button" id="path-nav-pick-dir" data-i18n="pathNavSelectDir">Select this folder</button>
        </div>
      </div>
    </div>
  </main>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const GENERAL_ID = ${JSON.stringify(generalId)};
    const keys = [
      'fontGroup', 'fontSubgroup', 'fontFolder', 'fontFile', 'fontScale',
      'gradientDirection', 'cardFill', 'cardBorder',
      'bgFolder', 'bgFile', 'bgSubgroup', 'bgClass', 'bgNote', 'bgHover',
      'labelSaturation', 'openFileDuration', 'reviewRefreshSec',
      'projectFetchSec', 'filesFetchSec', 'notesFetchSec', 'linksFetchSec',
    ];
    const percentKeys = {
      labelSaturation: true,
      gradientDirection: true,
      cardFill: true,
      cardBorder: true,
      bgFolder: true,
      bgFile: true,
      bgSubgroup: true,
      bgClass: true,
      bgNote: true,
      bgHover: true,
    };
    let suppress = false;
    /** @type {Record<string, string>} */
    let i18n = {};
    let stylesPath = ${JSON.stringify(STYLES_PATH)};

    const toggles = [
      'showProblemsTab',
      'cyclePageScroll',
      'openLinksInCursor',
      'cardGradient',
      'openFileMark',
      'showErrorIcon',
      'openFileAnimate',
    ];
    const switchWrap = document.getElementById('profile-switch');
    const switchBtn = document.getElementById('profile-switch-btn');
    const switchName = document.getElementById('profile-switch-name');
    const profileMenu = document.getElementById('profile-menu');
    const profileList = document.getElementById('profile-list');
    const profileAdd = document.getElementById('profile-add');
    const languageSelect = document.getElementById('language');
    const settingsHint = document.getElementById('settings-hint');
    const posSyncPush = document.getElementById('pos-sync-push');
    const posSyncPull = document.getElementById('pos-sync-pull');
    const channelProfile = document.getElementById('channelProfile');
    const channelExplorer = document.getElementById('channelExplorer');
    const channelNotes = document.getElementById('channelNotes');
    const channelLinks = document.getElementById('channelLinks');
    const channelReview = document.getElementById('channelReview');
    const discordToken = document.getElementById('discordToken');
    const discordTokenRow = document.getElementById('discord-token-row');
    const discordTokenSaved = document.getElementById('discord-token-saved');
    const reviewSkillPath = document.getElementById('reviewSkillPath');
    const reviewDirPath = document.getElementById('reviewDirPath');
    const reviewModel = document.getElementById('reviewModel');
    const reviewFixModel = document.getElementById('reviewFixModel');
    const reviewPromptExample = document.getElementById('review-prompt-example');
    const browseReviewSkill = document.getElementById('browse-review-skill');
    const browseReviewDir = document.getElementById('browse-review-dir');
    const pathNav = document.getElementById('path-nav');
    const pathNavTitle = document.getElementById('path-nav-title');
    const pathNavUp = document.getElementById('path-nav-up');
    const pathNavCrumbs = document.getElementById('path-nav-crumbs');
    const pathNavClose = document.getElementById('path-nav-close');
    const pathNavList = document.getElementById('path-nav-list');
    const pathNavPickDir = document.getElementById('path-nav-pick-dir');
    let browseTarget = 'skill';
    let browseSeq = 0;
    let navRel = '';
    /** @type {{ relDir: string, entries: Array<{ name: string, relPath: string, isDir: boolean }>, error?: string } | null} */
    let navPayload = null;
    let focusNav = false;
    const githubNick = document.getElementById('githubNick');
    const gitlabNick = document.getElementById('gitlabNick');
    const githubToken = document.getElementById('githubToken');
    const gitlabToken = document.getElementById('gitlabToken');
    const githubTokenClear = document.getElementById('githubTokenClear');
    const gitlabTokenClear = document.getElementById('gitlabTokenClear');
    let boundProfileId = '';
    /** @type {{ canPush?: boolean, canPull?: boolean }} */
    let positionSync = { canPush: false, canPull: false };

    function tr(key) {
      return i18n[key] || key;
    }

    function applyCatalogChannels(channels, hasDiscord) {
      const next = channels && typeof channels === 'object' ? channels : {};
      if (channelProfile instanceof HTMLInputElement) channelProfile.value = next.profile || '';
      if (channelExplorer instanceof HTMLInputElement) channelExplorer.value = next.explorer || '';
      if (channelNotes instanceof HTMLInputElement) channelNotes.value = next.notes || '';
      if (channelLinks instanceof HTMLInputElement) channelLinks.value = next.links || '';
      if (channelReview instanceof HTMLInputElement) channelReview.value = next.review || '';
      const saved = hasDiscord === true;
      if (discordTokenRow) discordTokenRow.hidden = saved;
      if (discordTokenSaved) {
        discordTokenSaved.hidden = !saved;
        discordTokenSaved.textContent = saved
          ? tr('reviewFieldDiscordToken') + ': ' + tr('reviewTokenSaved')
          : '';
      }
      if (!saved && discordToken instanceof HTMLInputElement) {
        discordToken.value = '';
      }
    }

    function emitCatalogChannels() {
      if (suppress) return;
      vscode.postMessage({
        type: 'setCatalogChannels',
        channelProfile: channelProfile instanceof HTMLInputElement ? channelProfile.value : '',
        channelExplorer: channelExplorer instanceof HTMLInputElement ? channelExplorer.value : '',
        channelNotes: channelNotes instanceof HTMLInputElement ? channelNotes.value : '',
        channelLinks: channelLinks instanceof HTMLInputElement ? channelLinks.value : '',
        channelReview: channelReview instanceof HTMLInputElement ? channelReview.value : '',
        discordToken: discordToken instanceof HTMLInputElement ? discordToken.value : undefined,
      });
    }

    function applyPositionSync(sync) {
      positionSync = sync && typeof sync === 'object' ? sync : { canPush: false, canPull: false };
      if (posSyncPush) posSyncPush.disabled = !positionSync.canPush;
      if (posSyncPull) posSyncPull.disabled = !positionSync.canPull;
    }

    function format(key, value) {
      if (percentKeys[key]) return Math.round(value) + '%';
      if (key === 'fontScale') return Number(value).toFixed(1) + '×';
      if (key === 'openFileDuration') return Number(value).toFixed(1) + ' ' + tr('secondsUnit');
      if (
        key === 'reviewRefreshSec' ||
        key === 'projectFetchSec' ||
        key === 'filesFetchSec' ||
        key === 'notesFetchSec' ||
        key === 'linksFetchSec'
      ) {
        return Math.round(Number(value)) + ' ' + tr('secondsUnit');
      }
      return Number(value).toFixed(2);
    }

    function applyLocale() {
      document.querySelectorAll('[data-i18n]').forEach((node) => {
        const key = node.getAttribute('data-i18n');
        if (key) node.textContent = tr(key);
      });
      document.querySelectorAll('[data-i18n-placeholder]').forEach((node) => {
        const key = node.getAttribute('data-i18n-placeholder');
        if (key) node.setAttribute('placeholder', tr(key));
      });
      document.querySelectorAll('[data-i18n-aria]').forEach((node) => {
        const key = node.getAttribute('data-i18n-aria');
        if (key) node.setAttribute('aria-label', tr(key));
      });
      document.querySelectorAll('[data-i18n-title]').forEach((node) => {
        const key = node.getAttribute('data-i18n-title');
        if (key) node.setAttribute('title', tr(key));
      });
      if (settingsHint) {
        settingsHint.innerHTML = '';
        const text = tr('settingsHint');
        const parts = text.split('{path}');
        settingsHint.append(document.createTextNode(parts[0] || ''));
        const code = document.createElement('code');
        code.textContent = stylesPath;
        settingsHint.append(code);
        settingsHint.append(document.createTextNode(parts[1] || ''));
      }
      if (pathNav && !pathNav.hidden && pathNavTitle) {
        pathNavTitle.textContent = browseTarget === 'dir' ? tr('labelReviewDirPath') : tr('labelReviewSkillPath');
      }
      if (navPayload && pathNav && !pathNav.hidden) renderPathNav(navPayload);
    }

    function apply(appearance) {
      suppress = true;
      for (const key of keys) {
        const input = document.getElementById(key);
        const label = document.querySelector('[data-for="' + key + '"]');
        if (!input || !label) continue;
        input.value = String(appearance[key]);
        label.textContent = format(key, appearance[key]);
      }
      for (const key of toggles) {
        const toggle = document.getElementById(key);
        const toggleLabel = document.querySelector('[data-for="' + key + '"]');
        if (!toggle || !toggleLabel) continue;
        toggle.checked = !!appearance[key];
        toggleLabel.textContent = appearance[key] ? tr('toggleOn') : tr('toggleOff');
      }
      if (languageSelect) {
        languageSelect.value = appearance.language === 'ru' ? 'ru' : 'en';
      }
      suppress = false;
    }

    function applyReviewPaths(skill, dir, model, fixModel) {
      suppress = true;
      if (reviewSkillPath instanceof HTMLInputElement) reviewSkillPath.value = skill || '';
      if (reviewDirPath instanceof HTMLInputElement) reviewDirPath.value = dir || '';
      if (reviewModel instanceof HTMLInputElement) reviewModel.value = (model || '').toLowerCase();
      if (reviewFixModel instanceof HTMLInputElement) reviewFixModel.value = (fixModel || '').toLowerCase();
      suppress = false;
    }

    function applyGitBindings(profileId, git) {
      const switched = profileId !== boundProfileId;
      boundProfileId = profileId || '';
      const bindings = git && typeof git === 'object' ? git : {};
      const rows = [
        { provider: 'github', nick: githubNick, token: githubToken, clear: githubTokenClear, nickValue: bindings.githubNick, tokenValue: bindings.githubToken },
        { provider: 'gitlab', nick: gitlabNick, token: gitlabToken, clear: gitlabTokenClear, nickValue: bindings.gitlabNick, tokenValue: bindings.gitlabToken },
      ];
      suppress = true;
      for (const row of rows) {
        if (row.nick instanceof HTMLInputElement && (switched || document.activeElement !== row.nick)) {
          row.nick.value = typeof row.nickValue === 'string' ? row.nickValue : '';
        }
        const tokenValue = typeof row.tokenValue === 'string' ? row.tokenValue : '';
        if (row.token instanceof HTMLInputElement && (switched || document.activeElement !== row.token)) {
          row.token.value = tokenValue;
          row.token.placeholder = tr('gitTokenPlaceholder');
        }
        if (row.clear instanceof HTMLButtonElement) {
          row.clear.hidden = !tokenValue;
        }
      }
      suppress = false;
    }

    function emitGitNick(provider, input) {
      if (suppress || !(input instanceof HTMLInputElement)) return;
      vscode.postMessage({ type: 'setGitBinding', provider, nick: input.value });
    }

    function emitGitToken(provider, input) {
      if (suppress || !(input instanceof HTMLInputElement)) return;
      const token = input.value.trim();
      if (!token) {
        vscode.postMessage({ type: 'setGitBinding', provider, clearToken: true });
        return;
      }
      vscode.postMessage({ type: 'setGitBinding', provider, token });
    }

    function emitReviewPaths() {
      if (suppress) return;
      vscode.postMessage({
        type: 'setReviewPaths',
        reviewSkillPath: reviewSkillPath instanceof HTMLInputElement ? reviewSkillPath.value : '',
        reviewDirPath: reviewDirPath instanceof HTMLInputElement ? reviewDirPath.value : '',
        reviewModel: reviewModel instanceof HTMLInputElement ? reviewModel.value.toLowerCase() : '',
        reviewFixModel: reviewFixModel instanceof HTMLInputElement ? reviewFixModel.value.toLowerCase() : '',
      });
    }

    function closeProfileMenu() {
      if (profileMenu) profileMenu.hidden = true;
      if (switchBtn) switchBtn.setAttribute('aria-expanded', 'false');
    }

    function openProfileMenu() {
      if (profileMenu) profileMenu.hidden = false;
      if (switchBtn) switchBtn.setAttribute('aria-expanded', 'true');
    }

    function renderProfiles(profiles, activeId, activeName) {
      if (switchName) switchName.textContent = activeName || '';
      if (!profileList) return;
      profileList.replaceChildren();
      const list = Array.isArray(profiles) ? profiles : [];
      for (const profile of list) {
        const row = document.createElement('div');
        row.className = 'profile-row' + (profile.id === activeId ? ' is-active' : '');
        row.setAttribute('role', 'menuitem');
        row.setAttribute('data-profile-id', profile.id);
        const name = document.createElement('span');
        name.className = 'profile-name';
        name.textContent = profile.name;
        row.append(name);
        const bound = typeof profile.boundCount === 'number' ? profile.boundCount : 0;
        if (bound > 0) {
          const count = document.createElement('span');
          count.className = 'profile-bound-count';
          count.textContent = String(bound);
          count.title = tr('profileBound').replace('{n}', String(bound));
          row.append(count);
        }
        const actions = document.createElement('span');
        actions.className = 'profile-actions';
        if (profile.id !== GENERAL_ID) {
          const renameBtn = document.createElement('button');
          renameBtn.type = 'button';
          renameBtn.title = tr('profileEdit');
          renameBtn.setAttribute('aria-label', tr('profileEdit'));
          renameBtn.setAttribute('data-profile-action', 'rename');
          renameBtn.setAttribute('data-profile-id', profile.id);
          renameBtn.textContent = '✎';
          const deleteBtn = document.createElement('button');
          deleteBtn.type = 'button';
          deleteBtn.title = tr('profileDelete');
          deleteBtn.setAttribute('aria-label', tr('profileDelete'));
          deleteBtn.setAttribute('data-profile-action', 'delete');
          deleteBtn.setAttribute('data-profile-id', profile.id);
          deleteBtn.textContent = '×';
          actions.append(renameBtn, deleteBtn);
        }
        if (actions.childNodes.length > 0) {
          row.append(actions);
        }
        profileList.append(row);
      }
    }

    function submitCreate() {
      vscode.postMessage({ type: 'openProfileEditor' });
      closeProfileMenu();
    }

    function emit(key, raw) {
      vscode.postMessage({ type: 'setAppearance', appearance: { [key]: Number(raw) } });
    }

    for (const key of keys) {
      const input = document.getElementById(key);
      const label = document.querySelector('[data-for="' + key + '"]');
      input.addEventListener('input', () => {
        if (suppress) return;
        label.textContent = format(key, input.value);
        emit(key, input.value);
      });
    }

    for (const key of toggles) {
      const toggle = document.getElementById(key);
      const toggleLabel = document.querySelector('[data-for="' + key + '"]');
      toggle.addEventListener('change', () => {
        if (suppress) return;
        toggleLabel.textContent = toggle.checked ? tr('toggleOn') : tr('toggleOff');
        vscode.postMessage({ type: 'setAppearance', appearance: { [key]: toggle.checked } });
      });
    }

    languageSelect?.addEventListener('change', () => {
      if (suppress) return;
      const value = languageSelect.value === 'ru' ? 'ru' : 'en';
      vscode.postMessage({ type: 'setAppearance', appearance: { language: value } });
    });

    switchBtn?.addEventListener('click', (event) => {
      event.stopPropagation();
      if (!profileMenu) return;
      if (profileMenu.hidden) openProfileMenu();
      else closeProfileMenu();
    });
    switchWrap?.addEventListener('mouseleave', () => closeProfileMenu());
    profileAdd?.addEventListener('click', (event) => {
      event.stopPropagation();
      submitCreate();
    });
    profileList?.addEventListener('click', (event) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const actionBtn = target && target.closest('[data-profile-action]');
      if (actionBtn instanceof HTMLElement) {
        event.stopPropagation();
        const action = actionBtn.getAttribute('data-profile-action');
        const id = actionBtn.getAttribute('data-profile-id') || undefined;
        if (action === 'rename') {
          vscode.postMessage({ type: 'openProfileEditor', id });
          closeProfileMenu();
          return;
        }
        if (action === 'delete' || action === 'syncPush' || action === 'syncPull') {
          vscode.postMessage({ type: 'profile', action, id });
          if (action === 'delete') {
            closeProfileMenu();
          }
        }
        return;
      }
      const row = target && target.closest('[data-profile-id]');
      if (!(row instanceof HTMLElement)) return;
      const id = row.getAttribute('data-profile-id');
      if (!id) return;
      vscode.postMessage({ type: 'profile', action: 'activate', id });
      closeProfileMenu();
    });
    document.addEventListener('click', (event) => {
      if (!switchWrap || !profileMenu || profileMenu.hidden) return;
      if (event.target instanceof Node && switchWrap.contains(event.target)) return;
      closeProfileMenu();
    });

    posSyncPush?.addEventListener('click', () => {
      vscode.postMessage({ type: 'profile', action: 'syncPush' });
    });
    posSyncPull?.addEventListener('click', () => {
      vscode.postMessage({ type: 'profile', action: 'syncPull' });
    });

    for (const input of [
      channelProfile,
      channelExplorer,
      channelNotes,
      channelLinks,
      channelReview,
      discordToken,
    ]) {
      input?.addEventListener('change', () => emitCatalogChannels());
    }

    document.getElementById('clear-all-data')?.addEventListener('click', () => {
      vscode.postMessage({ type: 'clearAllData' });
    });

    for (const input of [reviewSkillPath, reviewDirPath, reviewModel, reviewFixModel]) {
      input?.addEventListener('change', () => emitReviewPaths());
    }
    function lowerModelInput(input) {
      if (!(input instanceof HTMLInputElement)) return;
      const next = input.value.toLowerCase();
      if (next === input.value) return;
      const start = input.selectionStart;
      const end = input.selectionEnd;
      input.value = next;
      if (start !== null && end !== null) input.setSelectionRange(start, end);
    }
    reviewModel?.addEventListener('input', () => lowerModelInput(reviewModel));
    reviewFixModel?.addEventListener('input', () => lowerModelInput(reviewFixModel));
    githubNick?.addEventListener('change', () => emitGitNick('github', githubNick));
    gitlabNick?.addEventListener('change', () => emitGitNick('gitlab', gitlabNick));
    githubToken?.addEventListener('change', () => emitGitToken('github', githubToken));
    gitlabToken?.addEventListener('change', () => emitGitToken('gitlab', gitlabToken));
    githubTokenClear?.addEventListener('click', () => {
      vscode.postMessage({ type: 'setGitBinding', provider: 'github', clearToken: true });
    });
    gitlabTokenClear?.addEventListener('click', () => {
      vscode.postMessage({ type: 'setGitBinding', provider: 'gitlab', clearToken: true });
    });
    reviewPromptExample?.addEventListener('click', () => {
      vscode.postMessage({ type: 'openReviewPromptExample' });
    });

    function closePathNav() {
      if (pathNav) pathNav.hidden = true;
    }

    function requestDir(rel) {
      browseSeq += 1;
      navRel = rel || '';
      vscode.postMessage({ type: 'listProjectDir', seq: browseSeq, rel: navRel });
    }

    function choosePath(rel) {
      const input = browseTarget === 'dir' ? reviewDirPath : reviewSkillPath;
      if (!(input instanceof HTMLInputElement)) return;
      input.value = rel || '.';
      closePathNav();
      emitReviewPaths();
    }

    function openPathNav(target) {
      browseTarget = target === 'dir' ? 'dir' : 'skill';
      if (pathNavTitle) {
        pathNavTitle.textContent = browseTarget === 'dir' ? tr('labelReviewDirPath') : tr('labelReviewSkillPath');
      }
      const input = browseTarget === 'dir' ? reviewDirPath : reviewSkillPath;
      const current = input instanceof HTMLInputElement ? input.value : '';
      if (pathNav) pathNav.hidden = false;
      focusNav = true;
      requestDir(current);
    }

    function renderPathNav(payload) {
      navPayload = payload;
      navRel = payload && typeof payload.relDir === 'string' ? payload.relDir : '';
      if (pathNavUp instanceof HTMLButtonElement) pathNavUp.disabled = !navRel;
      if (pathNavCrumbs) {
        pathNavCrumbs.replaceChildren();
        const rootBtn = document.createElement('button');
        rootBtn.type = 'button';
        rootBtn.className = 'path-crumb';
        rootBtn.textContent = tr('pathNavRoot');
        rootBtn.addEventListener('click', () => requestDir(''));
        pathNavCrumbs.append(rootBtn);
        if (navRel) {
          let acc = '';
          for (const part of navRel.split('/')) {
            acc = acc ? acc + '/' + part : part;
            const sep = document.createElement('span');
            sep.className = 'path-crumb-sep';
            sep.textContent = '/';
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'path-crumb';
            btn.textContent = part;
            const target = acc;
            btn.addEventListener('click', () => requestDir(target));
            pathNavCrumbs.append(sep, btn);
          }
        }
      }
      if (!pathNavList) return;
      pathNavList.replaceChildren();
      const entries = payload && Array.isArray(payload.entries) ? payload.entries : [];
      if (payload && payload.error) {
        const note = document.createElement('p');
        note.className = 'path-nav-empty';
        note.textContent = tr('pathNavUnreadable');
        pathNavList.append(note);
      } else if (entries.length === 0) {
        const note = document.createElement('p');
        note.className = 'path-nav-empty';
        note.textContent = tr('pathNavEmpty');
        pathNavList.append(note);
      }
      for (const entry of entries) {
        const row = document.createElement('div');
        row.className = 'path-nav-row';
        const open = document.createElement('button');
        open.type = 'button';
        open.className = 'path-nav-open';
        const mark = document.createElement('span');
        mark.className = 'path-nav-mark';
        mark.textContent = entry.isDir ? '▸' : '';
        const name = document.createElement('span');
        name.className = 'path-nav-name';
        name.textContent = entry.name;
        open.append(mark, name);
        if (entry.isDir) {
          open.addEventListener('click', () => requestDir(entry.relPath));
          const pick = document.createElement('button');
          pick.type = 'button';
          pick.className = 'path-nav-pick';
          pick.textContent = tr('pathNavPick');
          pick.title = tr('pathNavPick');
          pick.setAttribute('aria-label', tr('pathNavPick'));
          pick.addEventListener('click', () => choosePath(entry.relPath));
          row.append(open, pick);
        } else {
          open.title = tr('pathNavPick');
          open.addEventListener('click', () => choosePath(entry.relPath));
          row.append(open);
        }
        pathNavList.append(row);
      }
      if (focusNav) {
        focusNav = false;
        pathNavList.focus();
      }
    }

    browseReviewSkill?.addEventListener('click', () => openPathNav('skill'));
    browseReviewDir?.addEventListener('click', () => openPathNav('dir'));
    pathNavUp?.addEventListener('click', () => requestDir(navRel.includes('/') ? navRel.slice(0, navRel.lastIndexOf('/')) : ''));
    pathNavClose?.addEventListener('click', () => closePathNav());
    pathNavPickDir?.addEventListener('click', () => choosePath(navRel));
    pathNav?.addEventListener('click', (event) => {
      if (event.target === pathNav) closePathNav();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && pathNav && !pathNav.hidden) closePathNav();
    });

    window.addEventListener('message', (event) => {
      if (event.data?.type === 'state') {
        if (event.data.i18n && typeof event.data.i18n === 'object') {
          i18n = event.data.i18n;
        }
        if (typeof event.data.stylesPath === 'string') {
          stylesPath = event.data.stylesPath;
        }
        applyLocale();
        apply(event.data.appearance);
        applyReviewPaths(
          event.data.reviewSkillPath,
          event.data.reviewDirPath,
          event.data.reviewModel,
          event.data.reviewFixModel,
        );
        applyGitBindings(event.data.activeProfileId, event.data.gitBindings);
        applyCatalogChannels(event.data.catalogChannels, event.data.hasDiscord);
        applyPositionSync(event.data.positionSync);
        renderProfiles(event.data.profiles, event.data.activeProfileId, event.data.activeProfileName);
      }
      if (event.data?.type === 'projectDir' && event.data.seq === browseSeq) {
        renderPathNav(event.data);
      }
    });

    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
  }
}





