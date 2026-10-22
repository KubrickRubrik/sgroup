import * as crypto from 'crypto';
import * as vscode from 'vscode';
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
  | { type: 'profile'; action: 'activate' | 'create' | 'rename' | 'delete'; id?: string; name?: string };

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
    action: 'activate' | 'create' | 'rename' | 'delete',
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
      const next = await vscode.window.showInputBox({
        title: 'Переименовать профиль',
        prompt: 'Имя профиля',
        value: current.name,
        validateInput: (v) => {
          const trimmed = v.trim();
          if (!trimmed) {
            return 'Имя не может быть пустым';
          }
          if (!this.store.isValidProfileName(trimmed, id)) {
            return 'Такое имя уже занято';
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
      const confirm = await vscode.window.showWarningMessage(
        `Удалить профиль «${current.name}»? Восстановить будет невозможно.`,
        { modal: true },
        'Удалить',
      );
      if (confirm !== 'Удалить') {
        return;
      }
      await this.store.deleteProfile(id);
    }
  }

  private async postState(): Promise<void> {
    if (!this.panel) {
      return;
    }
    await this.panel.webview.postMessage({
      type: 'state',
      appearance: this.store.appearance,
      defaults: DEFAULT_APPEARANCE,
      profiles: this.store.profiles(),
      activeProfileId: this.store.activeProfileId,
      activeProfileName: this.store.activeProfileName,
    });
  }

  private html(webview: vscode.Webview): string {
    const nonce = crypto.randomBytes(16).toString('base64');
    const generalId = GENERAL_PROFILE_ID;
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
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
      background: var(--vscode-button-secondaryBackground, transparent);
      border: 1px solid var(--vscode-button-border, var(--vscode-widget-border, transparent));
      border-radius: 4px;
      color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
      cursor: pointer;
      display: flex;
      flex-direction: column;
      font: inherit;
      gap: 2px;
      min-width: 120px;
      padding: 6px 10px;
      text-align: right;
    }
    .profile-switch-btn:hover {
      background: var(--vscode-toolbar-hoverBackground, var(--vscode-list-hoverBackground));
    }
    .profile-switch-label {
      font-size: 0.85em;
      opacity: 0.85;
    }
    .profile-switch-name {
      font-weight: 600;
    }
    .profile-menu {
      background: var(--vscode-menu-background, var(--vscode-editor-background));
      border: 1px solid var(--vscode-menu-border, var(--vscode-widget-border, transparent));
      border-radius: 4px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.36);
      min-width: 200px;
      padding: 4px 0;
      position: absolute;
      right: 0;
      top: 100%;
      z-index: 40;
    }
    .profile-menu[hidden] {
      display: none;
    }
    .profile-list {
      display: flex;
      flex-direction: column;
      max-height: 240px;
      overflow: auto;
    }
    .profile-row {
      align-items: center;
      background: transparent;
      border: none;
      color: var(--vscode-menu-foreground, var(--vscode-foreground));
      cursor: pointer;
      display: flex;
      font: inherit;
      font-size: 13px;
      gap: 6px;
      padding: 4px 8px 4px 12px;
      text-align: left;
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
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
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
    .profile-create {
      align-items: center;
      border-top: 1px solid var(--vscode-menu-border, var(--vscode-widget-border, transparent));
      display: flex;
      gap: 4px;
      margin-top: 4px;
      padding: 6px 8px;
    }
    .profile-create input {
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 2px;
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
  </style>
</head>
<body>
  <main>
    <div class="title-row">
      <h1>Syn3 Settings</h1>
      <div class="profile-switch" id="profile-switch">
        <button type="button" class="profile-switch-btn" id="profile-switch-btn" aria-haspopup="menu" aria-expanded="false">
          <span class="profile-switch-label">Активный профиль</span>
          <span class="profile-switch-name" id="profile-switch-name"></span>
        </button>
        <div class="profile-menu" id="profile-menu" hidden role="menu" aria-label="Профили">
          <div class="profile-list" id="profile-list"></div>
          <div class="profile-create">
            <input id="profile-name" type="text" placeholder="Новый профиль" aria-label="Имя нового профиля" maxlength="64">
            <button type="button" id="profile-add" title="Создать профиль" aria-label="Создать профиль">+</button>
          </div>
        </div>
      </div>
    </div>
    <p class="hint">Стили активного профиля сохраняются в <code>${STYLES_PATH}</code> этого проекта.</p>

    <section>
      <h2>Шрифт карты</h2>
      <div class="row">
        <label for="fontGroup">Группа</label>
        <input id="fontGroup" type="range" min="0.6" max="2" step="0.05">
        <span class="value" data-for="fontGroup"></span>
      </div>
      <div class="row">
        <label for="fontSubgroup">Подгруппа</label>
        <input id="fontSubgroup" type="range" min="0.6" max="2" step="0.05">
        <span class="value" data-for="fontSubgroup"></span>
      </div>
      <div class="row">
        <label for="fontFolder">Папка</label>
        <input id="fontFolder" type="range" min="0.6" max="2" step="0.05">
        <span class="value" data-for="fontFolder"></span>
      </div>
      <div class="row">
        <label for="fontFile">Файл</label>
        <input id="fontFile" type="range" min="0.6" max="2" step="0.05">
        <span class="value" data-for="fontFile"></span>
      </div>
      <div class="row">
        <label for="fontScale">Множитель</label>
        <input id="fontScale" type="range" min="1" max="5" step="0.1">
        <span class="value" data-for="fontScale"></span>
      </div>
      <p class="note">Итоговый размер = база × множитель × шрифт редактора.</p>
    </section>

    <section>
      <h2>Группа</h2>
      <div class="row">
        <label for="cardGradient">Градиент</label>
        <input id="cardGradient" type="checkbox">
        <span class="value" data-for="cardGradient"></span>
      </div>
      <div class="row">
        <label for="cardFill">Фон карточки</label>
        <input id="cardFill" type="range" min="0" max="100" step="1">
        <span class="value" data-for="cardFill"></span>
      </div>
      <div class="row">
        <label for="cardBorder">Бордер карточки</label>
        <input id="cardBorder" type="range" min="0" max="100" step="1">
        <span class="value" data-for="cardBorder"></span>
      </div>
      <div class="row">
        <label for="gradientDirection">Направление градиента</label>
        <input id="gradientDirection" type="range" min="0" max="100" step="1">
        <span class="value" data-for="gradientDirection"></span>
      </div>
      <p class="note">Градиент красит фон и бордер вместе. Выключенный убирает оба цвета, ползунки при этом сохраняются. 0 у силы — прозрачно, 100 — сплошной яркий край. Направление: 0 — угол по умолчанию, 100% — полный оборот.</p>
    </section>

    <section>
      <h2>Фон содержимого</h2>
      <div class="row">
        <label for="bgFolder">Папка</label>
        <input id="bgFolder" type="range" min="0" max="100" step="1">
        <span class="value" data-for="bgFolder"></span>
      </div>
      <div class="row">
        <label for="bgFile">Файл</label>
        <input id="bgFile" type="range" min="0" max="100" step="1">
        <span class="value" data-for="bgFile"></span>
      </div>
      <div class="row">
        <label for="bgSubgroup">Подгруппа</label>
        <input id="bgSubgroup" type="range" min="0" max="100" step="1">
        <span class="value" data-for="bgSubgroup"></span>
      </div>
      <div class="row">
        <label for="bgClass">Класс</label>
        <input id="bgClass" type="range" min="0" max="100" step="1">
        <span class="value" data-for="bgClass"></span>
      </div>
      <div class="row">
        <label for="bgNote">Заметка</label>
        <input id="bgNote" type="range" min="0" max="100" step="1">
        <span class="value" data-for="bgNote"></span>
      </div>
      <div class="row">
        <label for="bgHover">Наведение</label>
        <input id="bgHover" type="range" min="0" max="100" step="1">
        <span class="value" data-for="bgHover"></span>
      </div>
      <p class="note">Одна доля и у чипа, и у полосы списка. 0 — прозрачно, 100 — сплошной цвет группы. Наведение кладёт белый поверх фона: 0 ничего не добавляет, 100 — сплошной белый. Заголовок родителя в покое прозрачный и берёт то же наведение.</p>
    </section>

    <section>
      <h2>Explorer</h2>
      <div class="row">
        <label for="labelSaturation">Насыщенность имени</label>
        <input id="labelSaturation" type="range" min="0" max="100" step="5">
        <span class="value" data-for="labelSaturation"></span>
      </div>
      <p class="note">0 — цвет текста темы, 100 — цвет полоски группы. Несколько меток — цвет темы.</p>
    </section>

    <section>
      <h2>Открытый файл</h2>
      <div class="row">
        <label for="openFileMark">Показывать маркер</label>
        <input id="openFileMark" type="checkbox">
        <span class="value" data-for="openFileMark"></span>
      </div>
      <div class="row">
        <label for="openFileAnimate">Показывать анимацию</label>
        <input id="openFileAnimate" type="checkbox">
        <span class="value" data-for="openFileAnimate"></span>
      </div>
      <div class="row">
        <label for="openFileDuration">Время анимации</label>
        <input id="openFileDuration" type="range" min="0" max="3" step="0.1">
        <span class="value" data-for="openFileDuration"></span>
      </div>
      <p class="note">Уголок на бейдже, если файл открыт во вкладке. Анимация мигает только у цепочки вкладки в фокусе. Время — длина одного цикла, от 0 до 3 с.</p>
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

    const toggles = ['cardGradient', 'openFileMark', 'openFileAnimate'];
    const switchWrap = document.getElementById('profile-switch');
    const switchBtn = document.getElementById('profile-switch-btn');
    const switchName = document.getElementById('profile-switch-name');
    const profileMenu = document.getElementById('profile-menu');
    const profileList = document.getElementById('profile-list');
    const profileName = document.getElementById('profile-name');
    const profileAdd = document.getElementById('profile-add');

    function format(key, value) {
      if (percentKeys[key]) return Math.round(value) + '%';
      if (key === 'fontScale') return Number(value).toFixed(1) + '×';
      if (key === 'openFileDuration') return Number(value).toFixed(1) + ' с';
      return Number(value).toFixed(2);
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
        toggleLabel.textContent = appearance[key] ? 'вкл' : 'выкл';
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
        if (profile.id !== GENERAL_ID) {
          const actions = document.createElement('span');
          actions.className = 'profile-actions';
          const renameBtn = document.createElement('button');
          renameBtn.type = 'button';
          renameBtn.title = 'Переименовать';
          renameBtn.setAttribute('aria-label', 'Переименовать');
          renameBtn.setAttribute('data-profile-action', 'rename');
          renameBtn.setAttribute('data-profile-id', profile.id);
          renameBtn.textContent = '✎';
          const deleteBtn = document.createElement('button');
          deleteBtn.type = 'button';
          deleteBtn.title = 'Удалить';
          deleteBtn.setAttribute('aria-label', 'Удалить');
          deleteBtn.setAttribute('data-profile-action', 'delete');
          deleteBtn.setAttribute('data-profile-id', profile.id);
          deleteBtn.textContent = '×';
          actions.append(renameBtn, deleteBtn);
          row.append(actions);
        }
        profileList.append(row);
      }
    }

    function isCreatableProfileName(name) {
      const lower = name.toLocaleLowerCase();
      if (lower === 'общий') return false;
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
        toggleLabel.textContent = toggle.checked ? 'вкл' : 'выкл';
        vscode.postMessage({ type: 'setAppearance', appearance: { [key]: toggle.checked } });
      });
    }

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
        if (action === 'rename' || action === 'delete') {
          vscode.postMessage({ type: 'profile', action, id });
          closeProfileMenu();
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

    window.addEventListener('message', (event) => {
      if (event.data?.type === 'state') {
        apply(event.data.appearance);
        renderProfiles(event.data.profiles, event.data.activeProfileId, event.data.activeProfileName);
      }
    });

    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
  }
}
