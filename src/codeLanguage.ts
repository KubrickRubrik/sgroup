import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as vsctm from 'vscode-textmate';
import * as oniguruma from 'vscode-oniguruma';

/** Last editor/note copy that carried a language. */
export interface CodeStamp {
  text: string;
  languageId: string;
  label: string;
}

export interface HighlightSpan {
  text: string;
  color?: string;
}

export interface HighlightResult {
  lines: HighlightSpan[][];
  themeGeneration: number;
}

interface GrammarContribution {
  language?: string;
  scopeName: string;
  path: string;
  embeddedLanguages?: Record<string, string>;
}

interface ThemeTokenColor {
  scope?: string | string[];
  settings?: { foreground?: string; fontStyle?: string };
}

/**
 * Clipboard language stamp + TextMate highlighting against the active VS Code theme.
 */
export class CodeLanguageService implements vscode.Disposable {
  private stamp: CodeStamp | undefined;
  private themeGeneration = 0;
  private readonly subscriptions: vscode.Disposable[] = [];
  private onigurumaReady: Promise<void> | undefined;
  private registry: vsctm.Registry | undefined;
  /** scopeName → absolute grammar path */
  private readonly grammarPaths = new Map<string, string>();
  /** languageId → scopeName */
  private readonly languageScopes = new Map<string, string>();
  /** languageId → short label (ts, css, …) */
  private readonly labelCache = new Map<string, string | undefined>();
  private themeRules: Array<{ scope: string; foreground?: string }> = [];
  private themeLoadedFor: string | undefined;
  private grammarsLoaded = false;
  private readonly highlightCache = new Map<string, HighlightResult>();
  private stampListeners = new Set<(stamp: CodeStamp | undefined) => void>();
  private themeListeners = new Set<() => void>();
  private watchTimer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly extensionPath: string) {
    this.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('workbench.colorTheme')) {
          this.bumpTheme();
        }
      }),
      vscode.window.onDidChangeActiveColorTheme(() => this.bumpTheme()),
      vscode.extensions.onDidChange(() => {
        this.grammarsLoaded = false;
        this.labelCache.clear();
        this.grammarPaths.clear();
        this.languageScopes.clear();
        this.registry = undefined;
        this.highlightCache.clear();
      }),
      vscode.window.onDidChangeTextEditorSelection(() => {
        void this.tryStampFromEditorSelection();
      }),
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor) {
          this.startWatch();
          void this.tryStampFromEditorSelection();
        } else {
          this.stopWatch();
        }
      }),
    );
    if (vscode.window.activeTextEditor) {
      this.startWatch();
    }
  }

  dispose(): void {
    this.stopWatch();
    for (const sub of this.subscriptions) {
      sub.dispose();
    }
    this.stampListeners.clear();
    this.themeListeners.clear();
  }

  getStamp(): CodeStamp | undefined {
    return this.stamp;
  }

  /**
   * Stamp that matches pasted text (CR/LF and a single trailing newline ignored).
   */
  matchStamp(text: string): CodeStamp | undefined {
    if (!this.stamp) {
      return undefined;
    }
    const a = this.stamp.text;
    const b = text.replace(/\r\n/g, '\n');
    if (a === b || a.replace(/\n$/, '') === b.replace(/\n$/, '')) {
      return this.stamp;
    }
    return undefined;
  }

  onDidChangeStamp(listener: (stamp: CodeStamp | undefined) => void): vscode.Disposable {
    this.stampListeners.add(listener);
    return new vscode.Disposable(() => this.stampListeners.delete(listener));
  }

  onDidChangeTheme(listener: () => void): vscode.Disposable {
    this.themeListeners.add(listener);
    return new vscode.Disposable(() => this.themeListeners.delete(listener));
  }

  setStamp(stamp: CodeStamp | undefined): void {
    const prev = this.stamp;
    const next = stamp
      ? {
          text: stamp.text.replace(/\r\n/g, '\n'),
          languageId: stamp.languageId,
          label: stamp.label,
        }
      : undefined;
    this.stamp = next;
    if (
      prev?.text === next?.text &&
      prev?.languageId === next?.languageId &&
      prev?.label === next?.label
    ) {
      return;
    }
    for (const listener of this.stampListeners) {
      listener(this.stamp);
    }
  }

  /** Stamp from an editor language id + copied text. */
  stampFromLanguage(text: string, languageId: string): CodeStamp | undefined {
    const label = this.languageLabel(languageId);
    const normalized = text.replace(/\r\n/g, '\n');
    if (!label || !normalized) {
      return undefined;
    }
    return { text: normalized, languageId, label };
  }

  languageLabel(languageId: string): string | undefined {
    if (!languageId || languageId === 'plaintext') {
      return undefined;
    }
    if (this.labelCache.has(languageId)) {
      return this.labelCache.get(languageId);
    }
    let label: string | undefined;
    for (const ext of vscode.extensions.all) {
      const langs = ext.packageJSON?.contributes?.languages;
      if (!Array.isArray(langs)) {
        continue;
      }
      for (const lang of langs) {
        if (lang?.id !== languageId) {
          continue;
        }
        const extensions = lang.extensions;
        if (Array.isArray(extensions)) {
          for (const item of extensions) {
            if (typeof item === 'string' && item.startsWith('.') && item.length > 1) {
              label = item.slice(1).toLowerCase();
              break;
            }
          }
        }
        break;
      }
      if (label) {
        break;
      }
    }
    this.labelCache.set(languageId, label);
    return label;
  }

  /** Cmd/Ctrl+C in the text editor: copy, then stamp from the active document. */
  async copyFromEditor(): Promise<void> {
    await vscode.commands.executeCommand('editor.action.clipboardCopyAction');
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }
    const text = await vscode.env.clipboard.readText();
    if (!text) {
      this.setStamp(undefined);
      return;
    }
    const next = this.stampFromLanguage(text, editor.document.languageId);
    this.setStamp(next);
  }

  /** Context-menu copy: when selection matches clipboard, stamp the editor language. */
  async tryStampFromEditorSelection(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }
    const selection = editor.document.getText(editor.selection).replace(/\r\n/g, '\n');
    if (!selection) {
      return;
    }
    let clip: string;
    try {
      clip = (await vscode.env.clipboard.readText()).replace(/\r\n/g, '\n');
    } catch {
      return;
    }
    if (clip !== selection) {
      if (this.stamp && this.stamp.text !== clip) {
        this.setStamp(undefined);
      }
      return;
    }
    const next = this.stampFromLanguage(clip, editor.document.languageId);
    this.setStamp(next);
  }

  getThemeGeneration(): number {
    return this.themeGeneration;
  }

  async highlight(text: string, languageId: string): Promise<HighlightResult | undefined> {
    const label = this.languageLabel(languageId);
    if (!label) {
      return undefined;
    }
    await this.ensureGrammars();
    const scopeName = this.languageScopes.get(languageId);
    if (!scopeName) {
      return undefined;
    }
    await this.ensureTheme();
    const cacheKey = `${this.themeGeneration}\0${languageId}\0${text}`;
    const cached = this.highlightCache.get(cacheKey);
    if (cached) {
      return cached;
    }
    try {
      await this.ensureOniguruma();
      const registry = this.ensureRegistry();
      const grammar = await registry.loadGrammar(scopeName);
      if (!grammar) {
        return undefined;
      }
      const lines = text.split('\n');
      const resultLines: HighlightSpan[][] = [];
      let ruleStack = vsctm.INITIAL;
      for (const line of lines) {
        const { tokens, ruleStack: next } = grammar.tokenizeLine(line, ruleStack);
        ruleStack = next;
        const spans: HighlightSpan[] = [];
        let last = 0;
        for (const token of tokens) {
          const start = Math.min(token.startIndex, line.length);
          const end = Math.min(token.endIndex, line.length);
          if (start > last) {
            spans.push({ text: line.slice(last, start) });
          }
          if (end > start) {
            const scopes = token.scopes;
            const color = this.colorForScopes(scopes);
            spans.push({ text: line.slice(start, end), color });
          }
          last = end;
        }
        if (last < line.length) {
          spans.push({ text: line.slice(last) });
        }
        if (spans.length === 0) {
          spans.push({ text: '' });
        }
        resultLines.push(spans);
      }
      const result: HighlightResult = { lines: resultLines, themeGeneration: this.themeGeneration };
      if (this.highlightCache.size > 200) {
        this.highlightCache.clear();
      }
      this.highlightCache.set(cacheKey, result);
      return result;
    } catch {
      return undefined;
    }
  }

  private startWatch(): void {
    if (this.watchTimer) {
      return;
    }
    this.watchTimer = setInterval(() => {
      void this.tryStampFromEditorSelection();
    }, 800);
  }

  private stopWatch(): void {
    if (this.watchTimer) {
      clearInterval(this.watchTimer);
      this.watchTimer = undefined;
    }
  }

  private bumpTheme(): void {
    this.themeGeneration += 1;
    this.themeLoadedFor = undefined;
    this.themeRules = [];
    this.highlightCache.clear();
    for (const listener of this.themeListeners) {
      listener();
    }
  }

  private async ensureOniguruma(): Promise<void> {
    if (!this.onigurumaReady) {
      const wasmPath = path.join(this.extensionPath, 'dist', 'onig.wasm');
      const fallback = path.join(
        this.extensionPath,
        'node_modules',
        'vscode-oniguruma',
        'release',
        'onig.wasm',
      );
      const file = fs.existsSync(wasmPath) ? wasmPath : fallback;
      const wasmBin = fs.readFileSync(file).buffer;
      this.onigurumaReady = oniguruma.loadWASM(wasmBin);
    }
    await this.onigurumaReady;
  }

  private ensureRegistry(): vsctm.Registry {
    if (this.registry) {
      return this.registry;
    }
    this.registry = new vsctm.Registry({
      onigLib: Promise.resolve({
        createOnigScanner: (patterns: string[]) => new oniguruma.OnigScanner(patterns),
        createOnigString: (s: string) => new oniguruma.OnigString(s),
      }),
      loadGrammar: async (scopeName: string) => {
        const filePath = this.grammarPaths.get(scopeName);
        if (!filePath) {
          return null;
        }
        try {
          const raw = fs.readFileSync(filePath, 'utf8');
          return vsctm.parseRawGrammar(raw, filePath);
        } catch {
          return null;
        }
      },
    });
    return this.registry;
  }

  private async ensureGrammars(): Promise<void> {
    if (this.grammarsLoaded) {
      return;
    }
    this.grammarPaths.clear();
    this.languageScopes.clear();
    for (const ext of vscode.extensions.all) {
      const grammars = ext.packageJSON?.contributes?.grammars as GrammarContribution[] | undefined;
      if (!Array.isArray(grammars)) {
        continue;
      }
      const extPath = ext.extensionPath;
      for (const g of grammars) {
        if (!g?.scopeName || typeof g.path !== 'string') {
          continue;
        }
        const abs = path.join(extPath, g.path);
        if (!this.grammarPaths.has(g.scopeName)) {
          this.grammarPaths.set(g.scopeName, abs);
        }
        if (typeof g.language === 'string' && g.language && !this.languageScopes.has(g.language)) {
          this.languageScopes.set(g.language, g.scopeName);
        }
      }
    }
    this.grammarsLoaded = true;
    this.registry = undefined;
  }

  private async ensureTheme(): Promise<void> {
    const themeName = vscode.workspace.getConfiguration('workbench').get<string>('colorTheme');
    if (!themeName) {
      return;
    }
    if (this.themeLoadedFor === themeName && this.themeRules.length) {
      return;
    }
    this.themeRules = [];
    this.themeLoadedFor = themeName;
    const themePath = this.findThemePath(themeName);
    if (!themePath) {
      return;
    }
    const colors = await this.loadThemeTokenColors(themePath);
    for (const entry of colors) {
      const scopes = entry.scope;
      const fg = entry.settings?.foreground;
      if (!scopes || !fg) {
        continue;
      }
      const list = Array.isArray(scopes) ? scopes : String(scopes).split(',').map((s) => s.trim());
      for (const scope of list) {
        if (scope) {
          this.themeRules.push({ scope, foreground: fg });
        }
      }
    }
  }

  private findThemePath(themeName: string): string | undefined {
    for (const ext of vscode.extensions.all) {
      const themes = ext.packageJSON?.contributes?.themes;
      if (!Array.isArray(themes)) {
        continue;
      }
      for (const theme of themes) {
        if (theme?.label === themeName || theme?.id === themeName) {
          if (typeof theme.path === 'string') {
            return path.join(ext.extensionPath, theme.path);
          }
        }
      }
    }
    return undefined;
  }

  private async loadThemeTokenColors(themePath: string): Promise<ThemeTokenColor[]> {
    const seen = new Set<string>();
    const collect = async (filePath: string): Promise<ThemeTokenColor[]> => {
      const resolved = path.normalize(filePath);
      if (seen.has(resolved)) {
        return [];
      }
      seen.add(resolved);
      let raw: string;
      try {
        raw = fs.readFileSync(resolved, 'utf8');
      } catch {
        return [];
      }
      let json: { include?: string; tokenColors?: ThemeTokenColor[] };
      try {
        json = JSON.parse(stripJsonc(raw)) as {
          include?: string;
          tokenColors?: ThemeTokenColor[];
        };
      } catch {
        return [];
      }
      const out: ThemeTokenColor[] = [];
      if (typeof json.include === 'string') {
        const included = path.resolve(path.dirname(resolved), json.include);
        out.push(...(await collect(included)));
      }
      if (Array.isArray(json.tokenColors)) {
        out.push(...json.tokenColors);
      }
      return out;
    };
    return collect(themePath);
  }

  private colorForScopes(scopes: string[]): string | undefined {
    if (!scopes.length || !this.themeRules.length) {
      return undefined;
    }
    let best: { score: number; foreground?: string } | undefined;
    for (const rule of this.themeRules) {
      for (const scope of scopes) {
        if (scope === rule.scope || scope.startsWith(rule.scope + '.')) {
          const score = rule.scope.length;
          if (!best || score >= best.score) {
            best = { score, foreground: rule.foreground };
          }
        }
      }
    }
    return best?.foreground;
  }
}

/** Strip // and /* *\/ comments from theme JSONC. */
function stripJsonc(text: string): string {
  let out = '';
  let i = 0;
  let inString = false;
  while (i < text.length) {
    const ch = text[i];
    if (inString) {
      out += ch;
      if (ch === '\\' && i + 1 < text.length) {
        out += text[i + 1];
        i += 2;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      i += 1;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === '/' && text[i + 1] === '/') {
      i += 2;
      while (i < text.length && text[i] !== '\n') {
        i += 1;
      }
      continue;
    }
    if (ch === '/' && text[i + 1] === '*') {
      i += 2;
      while (i + 1 < text.length && !(text[i] === '*' && text[i + 1] === '/')) {
        i += 1;
      }
      i += 2;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}
