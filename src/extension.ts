import * as vscode from 'vscode';
import { CodeLanguageService } from './codeLanguage';
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
  'syn3.addIcon',
  'syn3.removeIcon',
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
  'syn3.copyFromEditor',
  'syn3.vsix',
  'syn3.start',
];

const STARTED_CONTEXT = 'syn3.started';
const START_HINT = 'Syn3: сначала выполните команду «Syn3: start».';

/** True when this workspace already keeps Syn3 files. An empty or missing `.syn3` does not count. */
async function workspaceHasSyn3(root: vscode.Uri): Promise<boolean> {
  try {
    const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.joinPath(root, '.syn3'));
    return entries.length > 0;
  } catch {
    return false;
  }
}

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
  const languages = new CodeLanguageService(context.extensionPath);
  const map = new MarkersMapProvider(
    store,
    context.extensionUri,
    context.globalState,
    context.workspaceState,
    languages,
    context.secrets,
  );
  const settings = new SettingsPanel(store, context.extensionUri, context.secrets, (profileId) => {
    void map.showProfileSettings(profileId);
  });

  function requireStarted(): boolean {
    if (store.ready) {
      return true;
    }
    void vscode.window.showInformationMessage(START_HINT);
    return false;
  }

  async function gated(run: () => void | PromiseLike<void>): Promise<void> {
    if (!requireStarted()) {
      return;
    }
    if (await map.refuseIfDiscordGate()) {
      return;
    }
    await run();
  }

  let enableTask: Promise<void> | undefined;
  async function enableSyn3(create: boolean): Promise<void> {
    if (!enableTask) {
      enableTask = (async () => {
        await map.syncGroupsLayoutContext();
        await map.syncTopCollapsedContext(false);
        await store.init({ create });
        if (!store.ready) {
          await vscode.commands.executeCommand('setContext', STARTED_CONTEXT, false);
          return;
        }
        map.armSyncFetchTimers();
        await map.bootstrapSurfaces();
        if (!store.ready) {
          return;
        }
        await syncExplorerLabelColors(store.appearance.labelSaturation);
        await vscode.commands.executeCommand('setContext', STARTED_CONTEXT, true);
      })().catch((error: unknown) => {
        enableTask = undefined;
        throw error;
      });
    }
    return enableTask;
  }

  context.subscriptions.push(
    store,
    tree,
    decorations,
    languages,
    map,
    settings,
    vscode.commands.registerCommand('syn3.openSettings', () => gated(() => settings.open())),
    vscode.commands.registerCommand('syn3.historyBack', () => gated(() => map.historyBack())),
    vscode.commands.registerCommand('syn3.historyForward', () => gated(() => map.historyForward())),
    vscode.commands.registerCommand('syn3.selectAllInMap', () => gated(() => map.selectAllInMap())),
    vscode.commands.registerCommand('syn3.undoInMap', () => gated(() => map.undoInMap())),
    vscode.commands.registerCommand('syn3.copyInMap', () => gated(() => map.copyInMap())),
    vscode.commands.registerCommand('syn3.copyFromEditor', () => {
      void gated(() => map.copyFromEditor());
    }),
    vscode.commands.registerCommand('syn3.pasteInMap', () => {
      void gated(() => map.pasteInMap());
    }),
    vscode.window.registerFileDecorationProvider(decorations),
    vscode.window.registerWebviewViewProvider(MarkersMapProvider.viewId, map, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.window.registerWebviewViewProvider(MarkersMapProvider.bottomViewId, map, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand('syn3.map.openBottom', async () => {
      if (!requireStarted()) {
        return;
      }
      if (await map.refuseIfDiscordGate()) {
        return;
      }
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
    vscode.commands.registerCommand('syn3.map.toggleColumn', () => gated(() => map.toggleColumn())),
    vscode.commands.registerCommand('syn3.map.toggleRight', () => gated(() => map.toggleRight())),
    ...registerCommands(store, tree, map),
    vscode.commands.registerCommand('syn3.openMap', async () => {
      if (!requireStarted()) {
        return;
      }
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
    vscode.commands.registerCommand('syn3.map.toggleLayout', () => gated(() => map.toggleLayout())),
    ...(['flow', '1', '2', '3'] as const).map((state) => {
      return vscode.commands.registerCommand(`syn3.map.groups.${state}`, () =>
        gated(() => map.setGroupsLayout(state)),
      );
    }),
    vscode.commands.registerCommand('syn3.map.collapseGroups', () =>
      gated(() => map.setTopGroups(true)),
    ),
    vscode.commands.registerCommand('syn3.map.expandGroups', () =>
      gated(() => map.setTopGroups(false)),
    ),
    vscode.commands.registerCommand('syn3.map.move', async () => {
      if (!requireStarted()) {
        return;
      }
      if (await map.refuseIfDiscordGate()) {
        return;
      }
      await vscode.commands.executeCommand(`${MarkersMapProvider.viewId}.focus`);
      await vscode.commands.executeCommand('workbench.action.moveFocusedView');
    }),
    vscode.workspace.onDidRenameFiles(async (e) => {
      if (!store.ready) {
        return;
      }
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
      if (!store.ready) {
        return;
      }
      void syncExplorerLabelColors(store.appearance.labelSaturation);
    }),
    vscode.window.onDidChangeActiveColorTheme(() => {
      if (!store.ready) {
        return;
      }
      void syncExplorerLabelColors(store.appearance.labelSaturation);
    }),
    store.onDidStop(() => {
      enableTask = undefined;
      void map.releaseSurfaces();
      void vscode.commands.executeCommand('setContext', STARTED_CONTEXT, false);
    }),
    vscode.commands.registerCommand('syn3.start', async () => {
      try {
        await enableSyn3(true);
        if (!store.ready) {
          return;
        }
        await vscode.commands.executeCommand('workbench.view.explorer');
        await vscode.commands.executeCommand(`${MarkersMapProvider.viewId}.focus`);
      } catch (error) {
        void vscode.window.showErrorMessage(
          'Syn3: не удалось запустить. ' + (error instanceof Error ? error.message : String(error)),
        );
      }
    }),
  );

  store.bindCloud(map.reviewAccessStore(), context.secrets);

  if (await workspaceHasSyn3(folder.uri)) {
    await enableSyn3(false);
  } else {
    await vscode.commands.executeCommand('setContext', STARTED_CONTEXT, false);
  }
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
