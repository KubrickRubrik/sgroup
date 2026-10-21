import * as vscode from 'vscode';
import { registerCommands } from './commands';
import { MarkerDecorationProvider } from './decorations';
import { clearExplorerLabelColors, syncExplorerLabelColors } from './labelColors';
import { MarkerStore } from './markerStore';
import { MarkersMapProvider } from './markersMap';
import { MarkersTreeProvider } from './markersTree';
import { SettingsPanel } from './settingsPanel';

const COMMAND_IDS = [
  'syn3.assign',
  'syn3.unassign',
  'syn3.unassignFromExplorer',
  'syn3.rename',
  'syn3.reveal',
  'syn3.relink',
  'syn3.createMarker',
  'syn3.createSubgroup',
  'syn3.unnestMarker',
  'syn3.editMarker',
  'syn3.deleteMarker',
  'syn3.changeColor',
  'syn3.changeIcon',
  'syn3.moveMarkerUp',
  'syn3.moveMarkerDown',
  'syn3.openConfig',
  'syn3.openSettings',
  'syn3.refresh',
  'syn3.historyBack',
  'syn3.historyForward',
  'syn3.openMap',
  'syn3.map.toggleLayout',
  'syn3.map.move',
  'syn3.map.toggleColumn',
  'syn3.map.toggleRight',
  'syn3.map.openBottom',
  'syn3.map.groups.flow',
  'syn3.map.groups.1',
  'syn3.map.groups.2',
  'syn3.map.groups.3',
  'syn3.map.collapseGroups',
  'syn3.map.expandGroups',
  'syn3.setColumns.flow',
  'syn3.setColumns.1',
  'syn3.setColumns.2',
  'syn3.setColumns.3',
  'syn3.markClass',
  'syn3.markClassManual',
  'syn3.setAlias',
  'syn3.clearAlias',
  'syn3.openClass',
  'syn3.openItem',
  'syn3.openFull',
  'syn3.vsix',
];

const VSIX_RELOAD_MARKER = 'version/.reload-window';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    for (const id of COMMAND_IDS) {
      context.subscriptions.push(
        vscode.commands.registerCommand(id, () => {
          void vscode.window.showInformationMessage('Syn3: open a folder first.');
        }),
      );
    }
    return;
  }

  const store = new MarkerStore(folder.uri);
  const tree = new MarkersTreeProvider(store);
  const decorations = new MarkerDecorationProvider(store);
  const map = new MarkersMapProvider(
    store,
    context.extensionUri,
    context.globalState,
    context.workspaceState,
  );
  const settings = new SettingsPanel(store, context.extensionUri);

  context.subscriptions.push(
    store,
    tree,
    decorations,
    map,
    settings,
    vscode.commands.registerCommand('syn3.openSettings', () => settings.open()),
    vscode.commands.registerCommand('syn3.historyBack', () => map.historyBack()),
    vscode.commands.registerCommand('syn3.historyForward', () => map.historyForward()),
    vscode.window.registerFileDecorationProvider(decorations),
    vscode.window.registerWebviewViewProvider(MarkersMapProvider.viewId, map, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.window.registerWebviewViewProvider(MarkersMapProvider.bottomViewId, map, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand('syn3.map.openBottom', async () => {
      if (await map.toggleBottom()) {
        return;
      }
      const reload = 'Reload Window';
      const choice = await vscode.window.showWarningMessage(
        'Syn3: вкладка в нижней панели ещё не зарегистрирована — нужна полная перезагрузка окна.',
        reload,
      );
      if (choice === reload) {
        await vscode.commands.executeCommand('workbench.action.reloadWindow');
      }
    }),
    vscode.window.registerWebviewPanelSerializer(MarkersMapProvider.panelType, map),
    vscode.commands.registerCommand('syn3.map.toggleColumn', () => map.toggleColumn()),
    vscode.commands.registerCommand('syn3.map.toggleRight', () => map.toggleRight()),
    ...registerCommands(store, tree),
    vscode.commands.registerCommand('syn3.openMap', async () => {
      await vscode.commands.executeCommand('workbench.view.explorer');
      try {
        await vscode.commands.executeCommand(`${MarkersMapProvider.viewId}.focus`);
      } catch (error) {
        void vscode.window.showWarningMessage(
          'Syn3: панель Syn3 Map не найдена. Сделай Reload Window. ' +
            (error instanceof Error ? error.message : String(error)),
        );
      }
    }),
    vscode.commands.registerCommand('syn3.map.toggleLayout', () => map.toggleLayout()),
    ...['flow', '1', '2', '3'].map((state) => {
      return vscode.commands.registerCommand(`syn3.map.groups.${state}`, () => map.cycleGroupsLayout());
    }),
    vscode.commands.registerCommand('syn3.map.collapseGroups', () => map.setTopGroups(true)),
    vscode.commands.registerCommand('syn3.map.expandGroups', () => map.setTopGroups(false)),
    vscode.commands.registerCommand('syn3.map.move', async () => {
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
    vscode.commands.registerCommand('syn3.vsix', () => {
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
  await map.syncTopCollapsedContext(false);
  await store.init();
  await map.bootstrapSurfaces();
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
