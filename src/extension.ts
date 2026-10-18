import * as vscode from 'vscode';
import { registerCommands } from './commands';
import { MarkerDecorationProvider } from './decorations';
import { MarkerStore } from './markerStore';
import { MarkersMapProvider } from './markersMap';
import { MarkersTreeProvider } from './markersTree';
import { SettingsPanel } from './settingsPanel';

const COMMAND_IDS = [
  'vgroup.assign',
  'vgroup.unassign',
  'vgroup.unassignFromExplorer',
  'vgroup.rename',
  'vgroup.reveal',
  'vgroup.relink',
  'vgroup.createMarker',
  'vgroup.createSubgroup',
  'vgroup.unnestMarker',
  'vgroup.editMarker',
  'vgroup.deleteMarker',
  'vgroup.changeColor',
  'vgroup.changeIcon',
  'vgroup.changeBadge',
  'vgroup.moveMarkerUp',
  'vgroup.moveMarkerDown',
  'vgroup.openConfig',
  'vgroup.openSettings',
  'vgroup.refresh',
  'vgroup.openMap',
  'vgroup.map.toggleLayout',
  'vgroup.map.move',
  'vgroup.map.toggleColumn',
  'vgroup.map.openBottom',
  'vgroup.map.groups.flow',
  'vgroup.map.groups.1',
  'vgroup.map.groups.2',
  'vgroup.map.groups.3',
  'vgroup.setColumns.flow',
  'vgroup.setColumns.2',
  'vgroup.setColumns.3',
  'vgroup.markClass',
  'vgroup.markClassManual',
  'vgroup.setAlias',
  'vgroup.clearAlias',
  'vgroup.openClass',
  'vgroup.openItem',
  'vgroup.openFull',
  'vgroup.vsix',
];

const VSIX_RELOAD_MARKER = 'version/.reload-window';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    for (const id of COMMAND_IDS) {
      context.subscriptions.push(
        vscode.commands.registerCommand(id, () => {
          void vscode.window.showInformationMessage('VGroup: open a folder first.');
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
    vscode.commands.registerCommand('vgroup.openSettings', () => settings.open()),
    vscode.window.registerFileDecorationProvider(decorations),
    vscode.window.registerWebviewViewProvider(MarkersMapProvider.viewId, map, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.window.registerWebviewViewProvider(MarkersMapProvider.bottomViewId, map, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand('vgroup.map.openBottom', async () => {
      const available = await vscode.commands.getCommands(true);
      const candidates = [`${MarkersMapProvider.bottomViewId}.focus`, 'workbench.view.extension.vgroupPanel'];
      const command = candidates.find((id) => available.includes(id));
      if (command) {
        await vscode.commands.executeCommand(command);
        return;
      }
      const reload = 'Reload Window';
      const choice = await vscode.window.showWarningMessage(
        'VGroup: вкладка в нижней панели ещё не зарегистрирована — нужна полная перезагрузка окна.',
        reload,
      );
      if (choice === reload) {
        await vscode.commands.executeCommand('workbench.action.reloadWindow');
      }
    }),
    vscode.window.registerWebviewPanelSerializer(MarkersMapProvider.panelType, map),
    vscode.commands.registerCommand('vgroup.map.toggleColumn', () => map.toggleColumn()),
    ...registerCommands(store, tree),
    vscode.commands.registerCommand('vgroup.openMap', async () => {
      await vscode.commands.executeCommand('workbench.view.explorer');
      try {
        await vscode.commands.executeCommand(`${MarkersMapProvider.viewId}.focus`);
      } catch (error) {
        void vscode.window.showWarningMessage(
          'VGroup: панель VGroup Map не найдена. Сделай Reload Window. ' +
            (error instanceof Error ? error.message : String(error)),
        );
      }
    }),
    vscode.commands.registerCommand('vgroup.map.toggleLayout', () => map.toggleLayout()),
    ...['flow', '1', '2', '3'].map((state) => {
      return vscode.commands.registerCommand(`vgroup.map.groups.${state}`, () => map.cycleGroupsLayout());
    }),
    vscode.commands.registerCommand('vgroup.map.move', async () => {
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
    vscode.commands.registerCommand('vgroup.vsix', () => {
      const term = vscode.window.createTerminal({ name: '📦 Vsix', cwd: folder.uri.fsPath });
      term.show();
      term.sendText('sh ./sh_vsix.sh');
    }),
  );

  await map.syncGroupsLayoutContext();
  await store.init();
}

export function deactivate(): void {}

/** sh_vsix.sh touches version/.reload-window → full window reload (CLI cannot do this). */
function watchVsixReloadMarker(root: vscode.Uri): vscode.Disposable {
  const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(root, VSIX_RELOAD_MARKER));
  let reloading = false;
  const trigger = async (uri: vscode.Uri) => {
    if (reloading) {
      return;
    }
    reloading = true;
    try {
      await vscode.workspace.fs.delete(uri);
    } catch {
      // ignore missing file
    }
    await vscode.commands.executeCommand('workbench.action.reloadWindow');
  };
  return vscode.Disposable.from(watcher, watcher.onDidCreate(trigger), watcher.onDidChange(trigger));
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
