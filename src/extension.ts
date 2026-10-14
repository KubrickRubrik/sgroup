import * as vscode from 'vscode';
import { registerCommands } from './commands';
import { MarkerDecorationProvider } from './decorations';
import { MarkerStore } from './markerStore';
import { MarkersMapProvider } from './markersMap';
import { MarkersTreeProvider } from './markersTree';

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
];

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

  const config = () => vscode.workspace.getConfiguration('vgroup');
  const store = new MarkerStore(folder.uri, config().get<string>('configPath', '.vscode/vgroup.json'));
  const tree = new MarkersTreeProvider(store);
  const decorations = new MarkerDecorationProvider(store);
  const map = new MarkersMapProvider(store, context.extensionUri, context.globalState);

  context.subscriptions.push(
    store,
    tree,
    decorations,
    map,
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
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (e.affectsConfiguration('vgroup.configPath')) {
        await store.setConfigPath(config().get<string>('configPath', '.vscode/vgroup.json'));
      }
    }),
    watchMarkedItems(store, () => {
      tree.refresh();
      map.refresh();
    }),
  );

  await map.syncGroupsLayoutContext();
  await store.init();
}

export function deactivate(): void {}

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
