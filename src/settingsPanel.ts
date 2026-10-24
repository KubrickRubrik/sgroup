import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { normalizeLocale, stringsFor, t, Syn3Locale } from './i18n';
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
      type: 'profile';
      action: 'activate' | 'create' | 'rename' | 'delete' | 'syncPush' | 'syncPull';
      id?: string;
      name?: string;
    };

export class SettingsPanel implements vscode.Disposable {
  static readonly viewType = 'syn3Settings';

  private panel?: vscode.WebviewPanel;
  private readonly subscriptions: vscode.Disposable[];

  constructor(
    private readonly store: MarkerStore,
    private readonly extensionUri: vscode.Uri,
  ) {
    this.subscriptions = [
      store.onDidChange(() => {
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
    if (message.type === 'profile') {
      await this.onProfile(message.action, message.id, message.name);
    }
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
      await this.store.deleteProfile(id);
      return;
    }
    if (action === 'syncPush') {
      await this.store.syncPositionsLocalToRemote();
      return;
    }
    if (action === 'syncPull') {
      await this.store.syncPositionsRemoteToLocal();
    }
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
    await this.panel.webview.postMessage({
      type: 'state',
      appearance: this.store.appearance,
      defaults: DEFAULT_APPEARANCE,
      profiles: this.store.profiles(),
      activeProfileId: this.store.activeProfileId,
      activeProfileName: this.store.activeProfileName,
      positionSync: this.store.positionSync(),
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
      align-items: flex-start;
      display: flex;
      gap: 16px;
      justify-content: space-between;
      margin: 0 0 6px;
    }
    h1 {
      font-size: 1.35em;
      font-weight: 600;
      margin: 0;
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
    .sync-row {
      align-items: center;
    }
    .sync-actions {
      display: flex;
      gap: 6px;
      grid-column: 2 / span 2;
    }
    .sync-actions button {
      align-items: center;
      background: var(--vscode-button-secondaryBackground, var(--vscode-button-background));
      border: none;
      border-radius: 4px;
      color: var(--vscode-button-secondaryForeground, var(--vscode-button-foreground));
      cursor: pointer;
      display: flex;
      font: inherit;
      font-size: 16px;
      height: 28px;
      justify-content: center;
      line-height: 1;
      padding: 0;
      width: 36px;
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
  </style>
</head>
<body>
  <main>
    <div class="title-row">
      <h1 data-i18n="settingsTitle">Syn3 Settings</h1>
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
            <input id="profile-name" type="text" data-i18n-placeholder="profileNewPlaceholder" data-i18n-aria="profileNewAria" maxlength="64">
            <button type="button" id="profile-add" data-i18n-title="profileCreate" data-i18n-aria="profileCreate">+</button>
          </div>
        </div>
      </div>
    </div>
    <p class="hint" id="settings-hint"></p>

    <section>
      <h2 data-i18n="language">Language</h2>
      <div class="row">
        <label for="language" data-i18n="language">Language</label>
        <select id="language">
          <option value="en" data-i18n="languageEn">English</option>
          <option value="ru" data-i18n="languageRu">Russian</option>
        </select>
      </div>
    </section>

    <section>
      <h2 data-i18n="sectionPositions">Card positions</h2>
      <div class="row sync-row">
        <span></span>
        <div class="sync-actions">
          <button type="button" id="pos-sync-push" data-i18n-title="profileSyncPush" data-i18n-aria="profileSyncPush">↑</button>
          <button type="button" id="pos-sync-pull" data-i18n-title="profileSyncPull" data-i18n-aria="profileSyncPull">↓</button>
        </div>
      </div>
      <p class="note" data-i18n="notePositions"></p>
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
  </main>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const GENERAL_ID = ${JSON.stringify(generalId)};
    const keys = [
      'fontGroup', 'fontSubgroup', 'fontFolder', 'fontFile', 'fontScale',
      'gradientDirection', 'cardFill', 'cardBorder',
      'bgFolder', 'bgFile', 'bgSubgroup', 'bgClass', 'bgNote', 'bgHover',
      'labelSaturation', 'openFileDuration',
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

    const toggles = ['cardGradient', 'openFileMark', 'openFileAnimate'];
    const switchWrap = document.getElementById('profile-switch');
    const switchBtn = document.getElementById('profile-switch-btn');
    const switchName = document.getElementById('profile-switch-name');
    const profileMenu = document.getElementById('profile-menu');
    const profileList = document.getElementById('profile-list');
    const profileName = document.getElementById('profile-name');
    const profileAdd = document.getElementById('profile-add');
    const languageSelect = document.getElementById('language');
    const settingsHint = document.getElementById('settings-hint');
    const posSyncPush = document.getElementById('pos-sync-push');
    const posSyncPull = document.getElementById('pos-sync-pull');
    /** @type {{ canPush?: boolean, canPull?: boolean }} */
    let positionSync = { canPush: false, canPull: false };

    function tr(key) {
      return i18n[key] || key;
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
        if (profile.id === activeId) {
          const pushBtn = document.createElement('button');
          pushBtn.type = 'button';
          pushBtn.title = tr('profileSyncPush');
          pushBtn.setAttribute('aria-label', tr('profileSyncPush'));
          pushBtn.setAttribute('data-profile-action', 'syncPush');
          pushBtn.setAttribute('data-profile-id', profile.id);
          pushBtn.textContent = '↑';
          pushBtn.disabled = !positionSync.canPush;
          const pullBtn = document.createElement('button');
          pullBtn.type = 'button';
          pullBtn.title = tr('profileSyncPull');
          pullBtn.setAttribute('aria-label', tr('profileSyncPull'));
          pullBtn.setAttribute('data-profile-action', 'syncPull');
          pullBtn.setAttribute('data-profile-id', profile.id);
          pullBtn.textContent = '↓';
          pullBtn.disabled = !positionSync.canPull;
          actions.append(pushBtn, pullBtn);
        }
        if (profile.id !== GENERAL_ID) {
          const renameBtn = document.createElement('button');
          renameBtn.type = 'button';
          renameBtn.title = tr('profileRename');
          renameBtn.setAttribute('aria-label', tr('profileRename'));
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

    function isCreatableProfileName(name) {
      const lower = name.toLocaleLowerCase();
      if (lower === 'общий' || lower === 'general') return false;
      const rows = profileList ? profileList.querySelectorAll('[data-profile-id]') : [];
      for (const row of rows) {
        const label = row.querySelector('.profile-name');
        if (label && label.textContent && label.textContent.toLocaleLowerCase() === lower) {
          return false;
        }
      }
      return true;
    }

    function submitCreate() {
      const name = (profileName && profileName.value || '').trim();
      if (!name || !isCreatableProfileName(name)) return;
      vscode.postMessage({ type: 'profile', action: 'create', name });
      if (profileName) profileName.value = '';
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
    profileName?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        submitCreate();
      }
    });
    profileList?.addEventListener('click', (event) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const actionBtn = target && target.closest('[data-profile-action]');
      if (actionBtn instanceof HTMLElement) {
        event.stopPropagation();
        const action = actionBtn.getAttribute('data-profile-action');
        const id = actionBtn.getAttribute('data-profile-id') || undefined;
        if (action === 'rename' || action === 'delete' || action === 'syncPush' || action === 'syncPull') {
          vscode.postMessage({ type: 'profile', action, id });
          if (action === 'rename' || action === 'delete') {
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
        applyPositionSync(event.data.positionSync);
        renderProfiles(event.data.profiles, event.data.activeProfileId, event.data.activeProfileName);
      }
    });

    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
  }
}
