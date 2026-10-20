import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { Appearance, DEFAULT_APPEARANCE, MarkerStore } from './markerStore';

type IncomingMessage = { type: 'ready' } | { type: 'setAppearance'; appearance: Partial<Appearance> };

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
    });
  }

  private html(webview: vscode.Webview): string {
    const nonce = crypto.randomBytes(16).toString('base64');
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
    h1 {
      font-size: 1.35em;
      font-weight: 600;
      margin: 0 0 6px;
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
    <h1>Syn3 Settings</h1>
    <p class="hint">Сохраняются в <code>.syn3/syn3.json</code> этого проекта.</p>

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
  </main>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const keys = [
      'fontGroup', 'fontSubgroup', 'fontFolder', 'fontFile', 'fontScale',
      'gradientDirection', 'cardFill', 'cardBorder',
      'bgFolder', 'bgFile', 'bgSubgroup', 'bgClass', 'bgNote', 'bgHover',
      'labelSaturation',
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

    function format(key, value) {
      if (percentKeys[key]) return Math.round(value) + '%';
      if (key === 'fontScale') return Number(value).toFixed(1) + '×';
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
      const toggle = document.getElementById('cardGradient');
      const toggleLabel = document.querySelector('[data-for="cardGradient"]');
      if (toggle && toggleLabel) {
        toggle.checked = !!appearance.cardGradient;
        toggleLabel.textContent = appearance.cardGradient ? 'вкл' : 'выкл';
      }
      suppress = false;
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

    const gradientToggle = document.getElementById('cardGradient');
    const gradientLabel = document.querySelector('[data-for="cardGradient"]');
    gradientToggle.addEventListener('change', () => {
      if (suppress) return;
      gradientLabel.textContent = gradientToggle.checked ? 'вкл' : 'выкл';
      vscode.postMessage({ type: 'setAppearance', appearance: { cardGradient: gradientToggle.checked } });
    });

    window.addEventListener('message', (event) => {
      if (event.data?.type === 'state') {
        apply(event.data.appearance);
      }
    });

    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
  }
}
