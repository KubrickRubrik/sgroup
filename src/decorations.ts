import * as vscode from 'vscode';
import { MarkerStore } from './markerStore';
import { themeColorId, themeLabelColorId } from './palette';

export class MarkerDecorationProvider implements vscode.FileDecorationProvider, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>();
  private readonly subscriptions: vscode.Disposable[];

  readonly onDidChangeFileDecorations = this.emitter.event;

  constructor(private readonly store: MarkerStore) {
    this.subscriptions = [
      store.onDidChange(() => this.emitter.fire(undefined)),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (
          e.affectsConfiguration('sgroup.showDecorations') ||
          e.affectsConfiguration('workbench.colorCustomizations')
        ) {
          this.emitter.fire(undefined);
        }
      }),
    ];
  }

  dispose(): void {
    this.subscriptions.forEach((s) => s.dispose());
    this.emitter.dispose();
  }

  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    if (!vscode.workspace.getConfiguration('sgroup').get<boolean>('showDecorations', true)) {
      return undefined;
    }
    const relPath = this.store.toRelative(uri);
    if (!relPath) {
      return undefined;
    }
    const markerIds = this.store.markersOf(relPath);
    if (markerIds.length === 0) {
      return undefined;
    }
    const defs = markerIds.map((id) => this.store.marker(id)).filter((def) => def !== undefined);
    const primary = defs[0];
    const labels = defs.map((def) => (def.icon ? `${def.icon} ${def.label}` : def.label)).join(', ');
    return new vscode.FileDecoration(
      shortBadge(primary?.badge),
      `SGROUP: ${labels}`,
      labelColor(defs, this.store.appearance.labelSaturation),
    );
  }
}

/** File decoration badges are limited to two characters. */
export function shortBadge(badge: string | undefined): string | undefined {
  if (!badge) {
    return undefined;
  }
  return Array.from(badge).slice(0, 2).join('') || undefined;
}

function labelColor(
  defs: Array<{ color?: string }>,
  saturation: number,
): vscode.ThemeColor | undefined {
  // Several markers on one file → keep the theme foreground.
  if (defs.length !== 1) {
    return undefined;
  }
  const color = defs[0]?.color;
  if (!color) {
    return undefined;
  }
  if (saturation <= 0) {
    return new vscode.ThemeColor('foreground');
  }
  if (saturation >= 100) {
    return new vscode.ThemeColor(themeColorId(color));
  }
  return new vscode.ThemeColor(themeLabelColorId(color));
}
