import * as vscode from 'vscode';
import { attachBetaPanel } from './panel';

const COLUMN_WIDTH = 260;

interface EditorGroupLayout {
  size?: number;
  groups?: EditorGroupLayout[];
}

interface EditorLayout {
  orientation: 0 | 1;
  groups: EditorGroupLayout[];
}

export class BetaColumn implements vscode.WebviewPanelSerializer, vscode.Disposable {
  static readonly viewType = 'beta.panel';
  static readonly title = 'beta_fixes';

  private panel?: vscode.WebviewPanel;
  private session?: vscode.Disposable;
  private opening?: Promise<void>;

  constructor(private readonly extensionUri: vscode.Uri) {}

  async open(): Promise<void> {
    if (this.opening) {
      await this.opening;
      return;
    }
    this.opening = this.openInner();
    try {
      await this.opening;
    } finally {
      this.opening = undefined;
    }
  }

  async deserializeWebviewPanel(panel: vscode.WebviewPanel): Promise<void> {
    if (this.panel && this.panel !== panel) {
      panel.dispose();
      return;
    }
    const folder = workspaceFolder();
    if (!folder) {
      panel.dispose();
      return;
    }
    this.adopt(panel, folder);
  }

  dispose(): void {
    const panel = this.panel;
    this.session?.dispose();
    this.session = undefined;
    this.panel = undefined;
    panel?.dispose();
  }

  private async openInner(): Promise<void> {
    const folder = workspaceFolder();
    if (!folder) {
      void vscode.window.showErrorMessage('beta: откройте папку воркспейса');
      return;
    }
    if (this.panel) {
      this.panel.reveal(this.panel.viewColumn, true);
      return;
    }

    const previous = vscode.window.activeTextEditor?.document;
    try {
      // Cursor keeps an agent editor group at the end of the grid. Splitting that
      // group puts the panel beside the chat, not beside the code.
      const focused = await this.focusEdgeCodeGroup();
      if (!focused) {
        await vscode.commands.executeCommand('workbench.action.focusFirstEditorGroup');
      }
      await vscode.commands.executeCommand('workbench.action.newGroupRight');
      const group = vscode.window.tabGroups.activeTabGroup;
      if (group.tabs.length > 0) {
        void vscode.window.showErrorMessage('beta: не удалось создать пустую колонку справа от кода');
        return;
      }
      const panel = vscode.window.createWebviewPanel(
        BetaColumn.viewType,
        BetaColumn.title,
        { viewColumn: group.viewColumn, preserveFocus: false },
        webviewOptions(this.extensionUri),
      );
      this.adopt(panel, folder);
      await vscode.commands.executeCommand('workbench.action.lockEditorGroup');
      await this.narrowViewColumn(panel.viewColumn ?? group.viewColumn);

      const back =
        previous && vscode.window.visibleTextEditors.find((editor) => editor.document === previous);
      if (back?.viewColumn !== undefined) {
        await vscode.window.showTextDocument(back.document, {
          viewColumn: back.viewColumn,
          preserveFocus: false,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'beta: не удалось открыть панель';
      void vscode.window.showErrorMessage(message);
    }
  }

  private adopt(panel: vscode.WebviewPanel, folder: vscode.Uri): void {
    this.panel = panel;
    this.session?.dispose();
    this.session = attachBetaPanel(panel, folder, this.extensionUri);
    panel.onDidDispose(() => {
      if (this.panel !== panel) {
        return;
      }
      this.session?.dispose();
      this.session = undefined;
      this.panel = undefined;
    });
  }

  /** Focuses the rightmost group that actually holds a file. */
  private async focusEdgeCodeGroup(): Promise<boolean> {
    const ownColumn = this.panel?.viewColumn;
    const groups = vscode.window.tabGroups.all.filter((group) => {
      if (group.viewColumn < 1 || group.viewColumn === ownColumn) {
        return false;
      }
      return group.tabs.some((tab) => tabUri(tab) !== undefined);
    });
    if (groups.length === 0) {
      return false;
    }
    const group = groups.reduce((best, item) => (item.viewColumn > best.viewColumn ? item : best));
    const uri = group.tabs.map(tabUri).find((item): item is vscode.Uri => item !== undefined);
    if (!uri) {
      return false;
    }
    await vscode.commands.executeCommand('vscode.open', uri, {
      viewColumn: group.viewColumn,
      preserveFocus: false,
    });
    return true;
  }

  /** Shrinks the column that holds the panel, leaving the agent group alone. */
  private async narrowViewColumn(viewColumn: vscode.ViewColumn): Promise<void> {
    if (viewColumn < 1) {
      return;
    }
    const layout = await vscode.commands.executeCommand<EditorLayout>('vscode.getEditorLayout');
    if (!layout || layout.orientation !== 0 || layout.groups.some((group) => group.groups?.length)) {
      return;
    }
    const ordered = vscode.window.tabGroups.all
      .filter((group) => group.viewColumn > 0)
      .sort((left, right) => left.viewColumn - right.viewColumn);
    if (ordered.length !== layout.groups.length) {
      return;
    }
    const index = ordered.findIndex((group) => group.viewColumn === viewColumn);
    if (index < 0) {
      return;
    }
    await applyColumnWidth(layout, index);
  }
}

function workspaceFolder(): vscode.Uri | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri;
}

function webviewOptions(extensionUri: vscode.Uri): vscode.WebviewPanelOptions & vscode.WebviewOptions {
  return {
    enableScripts: true,
    retainContextWhenHidden: true,
    localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
  };
}

function tabUri(tab: vscode.Tab): vscode.Uri | undefined {
  const input = tab.input;
  if (input instanceof vscode.TabInputText || input instanceof vscode.TabInputNotebook) {
    return input.uri;
  }
  if (input instanceof vscode.TabInputTextDiff) {
    return input.modified;
  }
  return undefined;
}

async function applyColumnWidth(layout: EditorLayout, index: number): Promise<void> {
  if (layout.groups[index]?.groups?.length) {
    return;
  }
  try {
    const sizes = layout.groups.map((group) => group.size ?? 1);
    const total = sizes.reduce((sum, size) => sum + size, 0);
    const others = total - sizes[index];
    if (others <= 0) {
      return;
    }
    const target = Math.min(COLUMN_WIDTH, total * 0.4);
    layout.groups = layout.groups.map((group, groupIndex) => ({
      ...group,
      size: groupIndex === index ? target : (sizes[groupIndex] / others) * (total - target),
    }));
    await vscode.commands.executeCommand('vscode.setEditorLayout', layout);
  } catch {
    // Unusual grids stay as they are.
  }
}
