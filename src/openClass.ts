import * as vscode from 'vscode';
import { ClassDef, MarkerStore } from './markerStore';

const TYPE_KINDS = new Set<vscode.SymbolKind>([
  vscode.SymbolKind.Class,
  vscode.SymbolKind.Struct,
  vscode.SymbolKind.Interface,
  vscode.SymbolKind.Enum,
  vscode.SymbolKind.Module,
  vscode.SymbolKind.Namespace,
  vscode.SymbolKind.Object,
]);

export async function openClassAt(
  store: MarkerStore,
  def: ClassDef,
  viewColumn?: vscode.ViewColumn,
): Promise<void> {
  const uri = store.toUri(def.relPath);
  const doc = await vscode.workspace.openTextDocument(uri);
  const editor = await vscode.window.showTextDocument(doc, {
    viewColumn,
    preview: false,
    preserveFocus: false,
  });

  const range = await resolveClassRange(doc, def);
  if (range) {
    editor.selection = new vscode.Selection(range.start, range.start);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
    return;
  }

  if (def.line !== undefined && def.line > 0) {
    const line = Math.min(def.line, doc.lineCount) - 1;
    const pos = new vscode.Position(line, 0);
    editor.selection = new vscode.Selection(pos, pos);
    editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
  }
  void vscode.window.showWarningMessage(`SGroup: class "${def.name}" not found in ${def.relPath}.`);
}

async function resolveClassRange(doc: vscode.TextDocument, def: ClassDef): Promise<vscode.Range | undefined> {
  if (def.line !== undefined && def.line > 0) {
    const around = rangeAroundLine(doc, def.line, 2);
    if (around && textContainsName(doc.getText(around), def.name)) {
      return around;
    }
  }

  const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
    'vscode.executeDocumentSymbolProvider',
    doc.uri,
  );
  const fromSymbols = findSymbol(symbols ?? [], def.name);
  if (fromSymbols) {
    return fromSymbols.selectionRange ?? fromSymbols.range;
  }

  return findTextRange(doc, def.name);
}

function rangeAroundLine(doc: vscode.TextDocument, line1: number, radius: number): vscode.Range | undefined {
  if (doc.lineCount === 0) {
    return undefined;
  }
  const center = Math.min(Math.max(line1, 1), doc.lineCount) - 1;
  const start = Math.max(0, center - radius);
  const end = Math.min(doc.lineCount - 1, center + radius);
  return new vscode.Range(start, 0, end, doc.lineAt(end).text.length);
}

function textContainsName(text: string, name: string): boolean {
  try {
    return new RegExp(`\\b${escapeRegExp(name)}\\b`).test(text);
  } catch {
    return text.includes(name);
  }
}

function findSymbol(symbols: vscode.DocumentSymbol[], name: string): vscode.DocumentSymbol | undefined {
  for (const symbol of symbols) {
    if (symbol.name === name || symbol.name.endsWith('.' + name) || symbol.name.startsWith(name + '<')) {
      if (TYPE_KINDS.has(symbol.kind) || symbol.name === name) {
        return symbol;
      }
    }
    const nested = findSymbol(symbol.children ?? [], name);
    if (nested) {
      return nested;
    }
  }
  for (const symbol of symbols) {
    if (symbol.name === name) {
      return symbol;
    }
    const nested = findSymbol(symbol.children ?? [], name);
    if (nested) {
      return nested;
    }
  }
  return undefined;
}

function findTextRange(doc: vscode.TextDocument, name: string): vscode.Range | undefined {
  const patterns = [
    new RegExp(`\\b(?:class|struct|interface|enum|type|trait|object)\\s+${escapeRegExp(name)}\\b`),
    new RegExp(`\\b${escapeRegExp(name)}\\b`),
  ];
  const text = doc.getText();
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (!match) {
      continue;
    }
    const start = doc.positionAt(match.index);
    const end = doc.positionAt(match.index + match[0].length);
    return new vscode.Range(start, end);
  }
  return undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Symbol under cursor suitable for marking as a class. */
export async function symbolAtCursor(
  editor: vscode.TextEditor,
): Promise<{ name: string; line: number } | undefined> {
  const pos = editor.selection.active;
  const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
    'vscode.executeDocumentSymbolProvider',
    editor.document.uri,
  );
  const hit = deepestSymbolAt(symbols ?? [], pos);
  if (hit && (TYPE_KINDS.has(hit.kind) || hit.name)) {
    const name = hit.name.replace(/<.*$/, '').split('.').pop() ?? hit.name;
    return { name, line: hit.selectionRange.start.line + 1 };
  }
  const word = editor.document.getWordRangeAtPosition(pos);
  if (!word) {
    return undefined;
  }
  return { name: editor.document.getText(word), line: pos.line + 1 };
}

function deepestSymbolAt(
  symbols: vscode.DocumentSymbol[],
  pos: vscode.Position,
): vscode.DocumentSymbol | undefined {
  for (const symbol of symbols) {
    if (!symbol.range.contains(pos)) {
      continue;
    }
    const nested = deepestSymbolAt(symbol.children ?? [], pos);
    return nested ?? symbol;
  }
  return undefined;
}
