import * as vscode from 'vscode';
import { BetaColumn } from './column';

export function activate(context: vscode.ExtensionContext): void {
  const column = new BetaColumn(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewPanelSerializer(BetaColumn.viewType, column),
    vscode.commands.registerCommand('beta.init', () => {
      void column.open();
    }),
    column,
  );
}

export function deactivate(): void {}
