import * as vscode from 'vscode';
import { registerCommands } from './commands';
import { MarkerDecorationProvider } from './decorations';
import { clearExplorerLabelColors, syncExplorerLabelColors } from './labelColors';
import { MarkerStore } from './markerStore';
import { MarkersMapProvider } from './markersMap';
import { MarkersTreeProvider } from './markersTree';
import { SettingsPanel } from './settingsPanel';

const COMMAND_IDS = [
  'sgroup.assign',
  'sgroup.unassign',
  'sgroup.unassignFromExplorer',
  'sgroup.rename',
  'sgroup.reveal',
  'sgroup.relink',
  'sgroup.createMarker',
  'sgroup.createSubgroup',
  'sgroup.unnestMarker',
  'sgroup.editMarker',
  'sgroup.deleteMarker',
  'sgroup.changeColor',
  'sgroup.changeIcon',
  'sgroup.changeBadge',
  'sgroup.moveMarkerUp',
  'sgroup.moveMarkerDown',
  'sgroup.openConfig',
  'sgroup.openSettings',
  'sgroup.refresh',
  'sgroup.historyBack',
  'sgroup.historyForward',
  'sgroup.openMap',
  'sgroup.map.toggleLayout',
  'sgroup.map.move',
  'sgroup.map.toggleColumn',
  'sgroup.map.toggleRight',
  'sgroup.map.openBottom',
  'sgroup.map.groups.flow',
  'sgroup.map.groups.1',
  'sgroup.map.groups.2',
  'sgroup.map.groups.3',
  'sgroup.setColumns.flow',
  'sgroup.setColumns.2',
  'sgroup.setColumns.3',
  'sgroup.markClass',
  'sgroup.markClassManual',
  'sgroup.setAlias',
  'sgroup.clearAlias',
  'sgroup.openClass',
  'sgroup.openItem',
  'sgroup.openFull',
  'sgroup.vsix',
];

const VSIX_RELOAD_MARKER = 'version/.reload-window';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    for (const id of COMMAND_IDS) {
      context.subscriptions.push(
        vscode.commands.registerCommand(id, () => {
          void vscode.window.showInformationMessage('SGroup: open a folder first.');
        }),
      );
    }
    return;
  }

  const store = new MarkerStore(folder.uri);
  const tree = new MarkersTreeProvider(store);
  const decorations = new MarkerDecorationProvider(store);
  const map = new MarkersMapProvider(store, context.extensionUri, context.globalState);
  const settings = new SettingsPanel(store, context.extensionUri);

  context.subscriptions.push(
    store,
    tree,
    decorations,
    map,
    settings,
    vscode.commands.registerCommand('sgroup.openSettings', () => settings.open()),
    vscode.commands.registerCommand('sgroup.historyBack', () => store.undo()),
    vscode.commands.registerCommand('sgroup.historyForward', () => store.redo()),
    vscode.window.registerFileDecorationProvider(decorations),
    vscode.window.registerWebviewViewProvider(MarkersMapProvider.viewId, map, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.window.registerWebviewViewProvider(MarkersMapProvider.bottomViewId, map, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand('sgroup.map.openBottom', async () => {
      if (await map.toggleBottom()) {
        return;
      }
      const reload = 'Reload Window';
      const choice = await vscode.window.showWarningMessage(
        'SGroup: вкладка в нижней панели ещё не зарегистрирована — нужна полная перезагрузка окна.',
        reload,
      );
      if (choice === reload) {
        await vscode.commands.executeCommand('workbench.action.reloadWindow');
      }
    }),
    vscode.window.registerWebviewPanelSerializer(MarkersMapProvider.panelType, map),
    vscode.commands.registerCommand('sgroup.map.toggleColumn', () => map.toggleColumn()),
    vscode.commands.registerCommand('sgroup.map.toggleRight', () => map.toggleRight()),
    ...registerCommands(store, tree),
    vscode.commands.registerCommand('sgroup.openMap', async () => {
      await vscode.commands.executeCommand('workbench.view.explorer');
      try {
        await vscode.commands.executeCommand(`${MarkersMapProvider.viewId}.focus`);
      } catch (error) {
        void vscode.window.showWarningMessage(
          'SGroup: панель SGroup Map не найдена. Сделай Reload Window. ' +
            (error instanceof Error ? error.message : String(error)),
        );
      }
    }),
    vscode.commands.registerCommand('sgroup.map.toggleLayout', () => map.toggleLayout()),
    ...['flow', '1', '2', '3'].map((state) => {
      return vscode.commands.registerCommand(`sgroup.map.groups.${state}`, () => map.cycleGroupsLayout());
    }),
    vscode.commands.registerCommand('sgroup.map.move', async () => {
      await vscode.commands.executeCommand(`${MarkersMapProvider.viewId}.focus`);
      await vscode.commands.executeCommand('workbench.action.moveFocusedView');
    }),
    vscode.workspace.onDidRenameFiles(async (e) => {
      let changed = false;
      for (const { oldUri, newUri } of e.files) {
        const oldRel = store.toRelative(oldUri);
        const newRel = store.toRelative(newUri);
        if (oldRel && newRel) {
          changed = store.renamePath(oldRel, newRel) || changed;
        }
      }
      if (changed) {
        await store.commit();
      }
    }),
    watchMarkedItems(store, () => {
      tree.refresh();
      map.refresh();
    }),
    watchVsixReloadMarker(folder.uri),
    vscode.commands.registerCommand('sgroup.vsix', () => {
      const term = vscode.window.createTerminal({ name: '📦 Vsix', cwd: folder.uri.fsPath });
      term.show();
      term.sendText('sh ./sh_vsix.sh');
    }),
    store.onDidChange(() => {
      void syncExplorerLabelColors(store.appearance.labelSaturation);
    }),
    vscode.window.onDidChangeActiveColorTheme(() => {
      void syncExplorerLabelColors(store.appearance.labelSaturation);
    }),
  );

  await map.syncGroupsLayoutContext();
  await store.init();
  await syncExplorerLabelColors(store.appearance.labelSaturation);
}

export function deactivate(): void {
  void clearExplorerLabelColors();
}

/** sh_vsix.sh touches version/.reload-window → full window reload (CLI cannot do this). */
function watchVsixReloadMarker(root: vscode.Uri): vscode.Disposable {
  const marker = vscode.Uri.joinPath(root, VSIX_RELOAD_MARKER);
  const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(root, VSIX_RELOAD_MARKER));
  let reloading = false;
  const trigger = async () => {
    if (reloading) {
      return;
    }
    try {
      await vscode.workspace.fs.stat(marker);
    } catch {
      return;
    }
    reloading = true;
    try {
      await vscode.workspace.fs.delete(marker);
    } catch {
      // ignore missing file
    }
    await vscode.commands.executeCommand('workbench.action.reloadWindow');
  };
  // Host restart does not apply a new VSIX. If the marker is already there, reload the window.
  void trigger();
  return vscode.Disposable.from(watcher, watcher.onDidCreate(() => void trigger()), watcher.onDidChange(() => void trigger()));
}

/** Refreshes the map when marked files appear or disappear (git checkout, terminal, other tools). */
function watchMarkedItems(store: MarkerStore, onMarkedItemsChanged: () => void): vscode.Disposable {
  const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(store.root, '**/*'), false, true, false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const onChange = (uri: vscode.Uri) => {
    const relPath = store.toRelative(uri);
    if (!relPath || !store.hasAnyMarkedUnder(relPath)) {
      return;
    }
    clearTimeout(timer);
    timer = setTimeout(onMarkedItemsChanged, 300);
  };
  const subscriptions = [watcher, watcher.onDidCreate(onChange), watcher.onDidDelete(onChange)];
  return new vscode.Disposable(() => {
    clearTimeout(timer);
    subscriptions.forEach((s) => s.dispose());
  });
}
