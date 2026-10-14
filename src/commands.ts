import * as path from 'path';
import * as vscode from 'vscode';
import { EMOJI } from './emoji';
import { MAX_MARKER_DEPTH, MarkerDef, MarkerStore } from './markerStore';
import { openTargets, targetsForDirectory, targetsForMarker } from './openBatch';
import { openClassAt, symbolAtCursor } from './openClass';
import { PALETTE, normalizeHex, themeColorId } from './palette';
import { ClassNode, ItemNode, MarkersTreeProvider, Node } from './markersTree';

const BADGE_MIN = 2;
const BADGE_MAX = 40;

export function registerCommands(
  store: MarkerStore,
  tree: MarkersTreeProvider,
): vscode.Disposable[] {
  function selected(node?: Node, nodes?: readonly Node[]): Node[] {
    if (nodes && nodes.length > 0) {
      return [...nodes];
    }
    return node ? [node] : [];
  }

  /** Returns the chosen color, `undefined` for "none", or `null` if cancelled. */
  async function pickColor(current?: string): Promise<string | undefined | null> {
    const NONE = '__none__';
    const CUSTOM = '__custom__';
    type ColorItem = vscode.QuickPickItem & { id: string };
    const items: ColorItem[] = [
      { label: 'None', id: NONE, iconPath: new vscode.ThemeIcon('circle-outline') },
      { label: 'Palette', id: '', kind: vscode.QuickPickItemKind.Separator },
      ...PALETTE.map((c) => ({
        label: c.label,
        description: c.id === current ? 'current' : c.hex,
        id: c.id,
        iconPath: new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor(c.id)),
      })),
      { label: 'Custom', id: '', kind: vscode.QuickPickItemKind.Separator },
      {
        label: 'Custom HEX…',
        description: current?.startsWith('#') ? `current ${current}` : undefined,
        detail: 'Tip: click the color bar of a group in the map to open the system color picker.',
        id: CUSTOM,
        iconPath: new vscode.ThemeIcon('symbol-color'),
      },
    ];
    const picked = await vscode.window.showQuickPick(items, {
      title: 'Marker color',
      placeHolder: 'Choose a color',
      matchOnDescription: true,
    });
    if (!picked) {
      return null;
    }
    if (picked.id === NONE) {
      return undefined;
    }
    if (picked.id !== CUSTOM) {
      return picked.id;
    }
    const hex = await vscode.window.showInputBox({
      title: 'Custom marker color',
      prompt: 'HEX color, e.g. #ff8800. In the Explorer the nearest palette color is used.',
      value: current?.startsWith('#') ? current : '#',
      validateInput: (v) => (normalizeHex(v) ? undefined : 'Expected #rgb or #rrggbb'),
    });
    return hex === undefined ? null : normalizeHex(hex);
  }

  /** Returns the badge, `undefined` for "no badge", or `null` if cancelled. */
  async function askBadge(value: string): Promise<string | undefined | null> {
    const badge = await vscode.window.showInputBox({
      title: 'Marker badge',
      prompt: `${BADGE_MIN}–${BADGE_MAX} characters, shown in the map. The Explorer shows only the first 2. Leave empty for no badge.`,
      value,
      validateInput: (v) => {
        const length = Array.from(v.trim()).length;
        if (length === 0 || (length >= BADGE_MIN && length <= BADGE_MAX)) {
          return undefined;
        }
        return `From ${BADGE_MIN} to ${BADGE_MAX} characters`;
      },
    });
    if (badge === undefined) {
      return null;
    }
    return badge.trim() || undefined;
  }

  /** Returns the emoji, `undefined` for "no icon", or `null` if cancelled. */
  async function pickIcon(current?: string): Promise<string | undefined | null> {
    const NONE = '__none__';
    const OTHER = '__other__';
    type IconItem = vscode.QuickPickItem & { id: string };
    const items: IconItem[] = [
      { label: 'No icon', id: NONE, iconPath: new vscode.ThemeIcon('circle-slash') },
      {
        label: 'Other emoji…',
        description: 'type or paste any emoji (Ctrl+Cmd+Space opens the macOS emoji picker)',
        id: OTHER,
        iconPath: new vscode.ThemeIcon('smiley'),
      },
    ];
    for (const { category, items: emoji } of EMOJI) {
      items.push({ label: category, id: '', kind: vscode.QuickPickItemKind.Separator });
      for (const [char, name] of emoji) {
        items.push({ label: `${char}  ${name}`, description: char === current ? 'current' : undefined, id: char });
      }
    }
    const picked = await vscode.window.showQuickPick(items, { title: 'Marker icon', placeHolder: 'Search by name, e.g. rocket' });
    if (!picked) {
      return null;
    }
    if (picked.id === NONE) {
      return undefined;
    }
    if (picked.id !== OTHER) {
      return picked.id;
    }
    const custom = await vscode.window.showInputBox({
      title: 'Marker icon',
      prompt: 'Any emoji or up to 2 characters',
      value: current ?? '',
      validateInput: (v) => (Array.from(v.trim()).length <= 4 ? undefined : 'Too long for an icon'),
    });
    if (custom === undefined) {
      return null;
    }
    return custom.trim() || undefined;
  }

  function defaultBadge(label: string): string {
    return Array.from(label.trim().replace(/\s+/g, '')).slice(0, BADGE_MIN).join('').toLocaleUpperCase();
  }

  async function createMarkerFlow(parentId?: string): Promise<string | undefined> {
    if (parentId) {
      const parentDepth = store.depthOf(parentId);
      if (parentDepth >= MAX_MARKER_DEPTH) {
        void vscode.window.showWarningMessage(`VGroup: maximum nesting depth is ${MAX_MARKER_DEPTH} subgroups.`);
        return undefined;
      }
    }
    const label = await vscode.window.showInputBox({
      title: parentId ? 'New subgroup' : 'New marker',
      prompt: 'Marker name',
      placeHolder: 'e.g. Ads, Shells, Placeholders',
      validateInput: (v) => (v.trim() ? undefined : 'Name cannot be empty'),
    });
    if (!label) {
      return undefined;
    }
    const color = await pickColor();
    if (color === null) {
      return undefined;
    }
    const icon = await pickIcon();
    if (icon === null) {
      return undefined;
    }
    const badge = await askBadge(defaultBadge(label));
    if (badge === null) {
      return undefined;
    }
    return store.createMarker({ label: label.trim(), color, icon, badge, parent: parentId });
  }

  async function pickMarker(title: string): Promise<string | undefined> {
    const NEW = '__new__';
    const items = [
      ...store.markers().map(([id, def]) => {
        const depth = store.depthOf(id);
        const indent = depth > 0 ? `${'··'.repeat(depth)} ` : '';
        return {
          label: `${indent}${def.icon ? `${def.icon} ` : ''}${def.label}`,
          description: def.badge,
          id,
          iconPath: new vscode.ThemeIcon('tag', def.color ? new vscode.ThemeColor(themeColorId(def.color)) : undefined),
        };
      }),
      { label: 'New marker…', description: undefined, id: NEW, iconPath: new vscode.ThemeIcon('add') },
    ];
    const picked = await vscode.window.showQuickPick(items, { title, placeHolder: 'Choose a marker' });
    if (!picked) {
      return undefined;
    }
    return picked.id === NEW ? createMarkerFlow() : picked.id;
  }

  async function assign(uri?: vscode.Uri, uris?: vscode.Uri[]): Promise<void> {
    const targets = uris && uris.length > 0 ? uris : uri ? [uri] : activeUri();
    const relPaths = targets.map((u) => store.toRelative(u)).filter((p): p is string => p !== undefined);
    if (relPaths.length === 0) {
      void vscode.window.showWarningMessage('VGroup: select files or folders inside the first workspace folder.');
      return;
    }
    const title = relPaths.length === 1 ? `Mark ${path.posix.basename(relPaths[0])}` : `Mark ${relPaths.length} items`;
    const markerId = await pickMarker(title);
    if (markerId) {
      await store.assign(relPaths, markerId);
    }
  }

  async function unassign(node?: Node, nodes?: readonly Node[]): Promise<void> {
    const nodesList = selected(node, nodes);
    const items = nodesList
      .filter((n): n is ItemNode => n.kind === 'item')
      .map((n) => ({ relPath: n.relPath, markerId: n.markerId }));
    const classes = nodesList
      .filter((n): n is ClassNode => n.kind === 'class')
      .map((n) => ({ classId: n.classId, markerId: n.markerId }));
    if (items.length > 0) {
      await store.unassign(items);
    }
    if (classes.length > 0) {
      await store.unassignClass(classes);
    }
  }

  async function markClass(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      void vscode.window.showWarningMessage('VGroup: open a file and place the cursor on a class.');
      return;
    }
    const relPath = store.toRelative(editor.document.uri);
    if (!relPath) {
      void vscode.window.showWarningMessage('VGroup: file must be inside the workspace folder.');
      return;
    }
    const symbol = await symbolAtCursor(editor);
    if (!symbol?.name) {
      void vscode.window.showWarningMessage('VGroup: no symbol under the cursor.');
      return;
    }
    const markerId = await pickMarker(`Mark class ${symbol.name}`);
    if (!markerId) {
      return;
    }
    await store.assignClass({ relPath, name: symbol.name, line: symbol.line }, markerId);
  }

  async function markClassManual(uri?: vscode.Uri): Promise<void> {
    let fileUri = uri;
    if (!fileUri) {
      const picked = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        defaultUri: store.root,
        openLabel: 'Select file',
      });
      fileUri = picked?.[0];
    }
    if (!fileUri) {
      return;
    }
    const relPath = store.toRelative(fileUri);
    if (!relPath) {
      void vscode.window.showWarningMessage('VGroup: file must be inside the workspace folder.');
      return;
    }
    const name = await vscode.window.showInputBox({
      title: 'Class name',
      prompt: 'Name of the class / type / interface',
      validateInput: (v) => (v.trim() ? undefined : 'Name cannot be empty'),
    });
    if (!name) {
      return;
    }
    const lineRaw = await vscode.window.showInputBox({
      title: 'Line number (optional)',
      prompt: '1-based line hint. Leave empty to skip.',
      validateInput: (v) => {
        if (!v.trim()) {
          return undefined;
        }
        const n = Number(v);
        return Number.isInteger(n) && n > 0 ? undefined : 'Enter a positive integer or leave empty';
      },
    });
    if (lineRaw === undefined) {
      return;
    }
    const line = lineRaw.trim() ? Number(lineRaw.trim()) : undefined;
    const markerId = await pickMarker(`Mark class ${name.trim()}`);
    if (!markerId) {
      return;
    }
    await store.assignClass({ relPath, name: name.trim(), line }, markerId);
  }

  async function setAlias(node?: Node): Promise<void> {
    if (!node) {
      return;
    }
    let current = '';
    let prompt = 'Display name shown above the real name. Leave empty to clear.';
    if (node.kind === 'item') {
      current = store.aliasOf(node.relPath) ?? '';
      prompt = 'Display name shown above the real file/folder name. Leave empty to clear.';
    } else if (node.kind === 'class') {
      current = store.classAliasOf(node.classId) ?? '';
      prompt = 'Display name shown above the class name. Leave empty to clear.';
    } else if (node.kind === 'marker') {
      current = store.markerAliasOf(node.markerId) ?? '';
      prompt = 'Display name shown above the group label. Leave empty to clear.';
    } else {
      return;
    }
    const value = await vscode.window.showInputBox({
      title: 'Set alias',
      prompt,
      value: current,
    });
    if (value === undefined) {
      return;
    }
    const next = value.trim() || undefined;
    if (node.kind === 'item') {
      await store.setAlias(node.relPath, next);
    } else if (node.kind === 'class') {
      await store.setClassAlias(node.classId, next);
    } else {
      await store.setMarkerAlias(node.markerId, next);
    }
  }

  async function clearAlias(node?: Node): Promise<void> {
    if (!node) {
      return;
    }
    if (node.kind === 'item') {
      await store.setAlias(node.relPath, undefined);
    } else if (node.kind === 'class') {
      await store.setClassAlias(node.classId, undefined);
    } else if (node.kind === 'marker') {
      await store.setMarkerAlias(node.markerId, undefined);
    }
  }

  async function openClassCommand(node?: Node): Promise<void> {
    if (node?.kind !== 'class') {
      return;
    }
    const def = store.classDef(node.classId);
    if (!def) {
      return;
    }
    await openClassAt(store, def);
  }

  async function openItemOrFull(node: Node | undefined, full: boolean): Promise<void> {
    if (!node) {
      return;
    }
    if (node.kind === 'marker') {
      await openTargets(store, targetsForMarker(store, node.markerId, full));
      return;
    }
    if (node.kind === 'item' && node.isDir) {
      await openTargets(store, await targetsForDirectory(store, node.markerId, node.relPath, full));
    }
  }

  async function unassignFromExplorer(uri?: vscode.Uri, uris?: vscode.Uri[]): Promise<void> {
    const targets = uris && uris.length > 0 ? uris : uri ? [uri] : activeUri();
    const entries = targets
      .map((u) => store.toRelative(u))
      .filter((p): p is string => p !== undefined)
      .map((relPath) => ({ relPath }));
    if (entries.length > 0) {
      await store.unassign(entries);
    }
  }

  async function rename(node?: Node): Promise<void> {
    const oldUri = node ? tree.uriOf(node) : undefined;
    if (!node || !oldUri) {
      return;
    }
    const oldName = path.posix.basename(oldUri.path);
    const isDir = (node.kind === 'item' || node.kind === 'child') && node.isDir;
    const ext = isDir ? '' : path.posix.extname(oldName);
    const parentUri = vscode.Uri.joinPath(oldUri, '..');

    const newName = await vscode.window.showInputBox({
      title: `Rename ${oldName}`,
      value: oldName,
      valueSelection: [0, oldName.length - ext.length],
      validateInput: async (value) => {
        const name = value.trim();
        if (!name) {
          return 'Name cannot be empty';
        }
        if (/[\\/:*?"<>|]/.test(name)) {
          return 'Name contains invalid characters';
        }
        if (name !== oldName && (await exists(vscode.Uri.joinPath(parentUri, name)))) {
          return `"${name}" already exists`;
        }
        return undefined;
      },
    });
    if (!newName || newName.trim() === oldName) {
      return;
    }
    const edit = new vscode.WorkspaceEdit();
    edit.renameFile(oldUri, vscode.Uri.joinPath(parentUri, newName.trim()));
    const ok = await vscode.workspace.applyEdit(edit);
    if (!ok) {
      void vscode.window.showErrorMessage(`VGroup: could not rename ${oldName}.`);
    }
  }

  async function relink(node?: Node): Promise<void> {
    const target = node;
    if (!target || target.kind !== 'item') {
      return;
    }
    const name = path.posix.basename(target.relPath);
    const found = await vscode.workspace.findFiles(
      new vscode.RelativePattern(store.root, `**/${name}`),
      '**/{node_modules,.git,build,.dart_tool}/**',
      50,
    );
    const BROWSE = '__browse__';
    const items = [
      ...found
        .map((uri) => store.toRelative(uri))
        .filter((p): p is string => p !== undefined)
        .map((relPath) => ({ label: path.posix.basename(relPath), description: path.posix.dirname(relPath), relPath })),
      { label: '$(folder-opened) Browse…', description: undefined, relPath: BROWSE },
    ];
    const picked = await vscode.window.showQuickPick(items, {
      title: `Relink ${target.relPath}`,
      placeHolder: found.length > 0 ? 'Files with the same name' : 'No files with the same name found',
    });
    if (!picked) {
      return;
    }
    let newRel: string | undefined = picked.relPath;
    if (newRel === BROWSE) {
      const chosen = await vscode.window.showOpenDialog({
        defaultUri: store.root,
        canSelectFiles: true,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: 'Relink',
      });
      newRel = chosen?.[0] ? store.toRelative(chosen[0]) : undefined;
    }
    if (newRel && store.renamePath(target.relPath, newRel)) {
      await store.commit();
    }
  }

  async function editMarker(node?: Node): Promise<void> {
    const target = node;
    if (!target || target.kind !== 'marker') {
      return;
    }
    const def = store.marker(target.markerId);
    if (!def) {
      return;
    }
    const label = await vscode.window.showInputBox({
      title: 'Edit marker',
      prompt: 'Marker name',
      value: def.label,
      validateInput: (v) => (v.trim() ? undefined : 'Name cannot be empty'),
    });
    if (!label) {
      return;
    }
    const color = await pickColor(def.color);
    if (color === null) {
      return;
    }
    const icon = await pickIcon(def.icon);
    if (icon === null) {
      return;
    }
    const badge = await askBadge(def.badge ?? '');
    if (badge === null) {
      return;
    }
    const patch: Partial<Omit<MarkerDef, 'order'>> = { label: label.trim(), color, icon, badge };
    await store.updateMarker(target.markerId, patch);
  }

  function editMarkerField<K extends 'color' | 'icon' | 'badge'>(
    field: K,
    ask: (current: string | undefined) => Promise<string | undefined | null>,
  ) {
    return async (node?: Node): Promise<void> => {
      if (node?.kind !== 'marker') {
        return;
      }
      const def = store.marker(node.markerId);
      if (!def) {
        return;
      }
      const value = await ask(def[field]);
      if (value !== null) {
        await store.updateMarker(node.markerId, { [field]: value });
      }
    };
  }

  async function createSubgroup(node?: Node): Promise<void> {
    if (node?.kind !== 'marker') {
      return;
    }
    await createMarkerFlow(node.markerId);
  }

  async function unnestMarker(node?: Node): Promise<void> {
    if (node?.kind !== 'marker') {
      return;
    }
    const def = store.marker(node.markerId);
    if (!def?.parent) {
      return;
    }
    await store.unnestMarker(node.markerId);
  }

  async function deleteMarker(node?: Node): Promise<void> {
    const target = node;
    if (!target || target.kind !== 'marker') {
      return;
    }
    const def = store.marker(target.markerId);
    const count = store.itemsOf(target.markerId).length;
    const childCount = store.children(target.markerId).length;
    const details: string[] = [];
    if (count > 0) {
      details.push(`It will be removed from ${count} item(s). Files are not touched.`);
    }
    if (childCount > 0) {
      details.push(`${childCount} subgroup(s) will move up one level.`);
    }
    const answer = await vscode.window.showWarningMessage(
      `Delete marker "${def?.label ?? target.markerId}"?`,
      { modal: true, detail: details.length > 0 ? details.join(' ') : undefined },
      'Delete',
    );
    if (answer === 'Delete') {
      await store.deleteMarker(target.markerId);
    }
  }

  async function moveMarker(node: Node | undefined, delta: -1 | 1): Promise<void> {
    const target = node;
    if (target?.kind === 'marker') {
      await store.moveMarker(target.markerId, delta);
    }
  }

  async function openConfig(): Promise<void> {
    await store.ensureConfigExists();
    await vscode.window.showTextDocument(store.configUri);
  }

  /** Accepts a `data-vscode-context` object from the map webview. */
  async function toNode(arg: unknown): Promise<Node | undefined> {
    if (!arg || typeof arg !== 'object') {
      return undefined;
    }
    if ('kind' in arg) {
      return arg as Node;
    }
    const context = arg as { markerId?: unknown; relPath?: unknown; classId?: unknown };
    if (typeof context.markerId !== 'string') {
      return undefined;
    }
    if (typeof context.classId === 'string') {
      return tree.classNode(context.markerId, context.classId);
    }
    if (typeof context.relPath === 'string') {
      return tree.itemNode(context.markerId, context.relPath);
    }
    return tree.markerNode(context.markerId);
  }

  function withNode(fn: (node?: Node, nodes?: readonly Node[]) => Promise<unknown>) {
    return async (arg?: unknown, nodes?: unknown) => {
      return fn(await toNode(arg), Array.isArray(nodes) ? (nodes as Node[]) : undefined);
    };
  }

  return [
    vscode.commands.registerCommand('vgroup.assign', assign),
    vscode.commands.registerCommand('vgroup.unassign', withNode(unassign)),
    vscode.commands.registerCommand('vgroup.unassignFromExplorer', unassignFromExplorer),
    vscode.commands.registerCommand('vgroup.rename', withNode(rename)),
    vscode.commands.registerCommand(
      'vgroup.reveal',
      withNode(async (node) => {
        const target = node;
        const uri = target ? tree.uriOf(target) : undefined;
        if (uri) {
          await vscode.commands.executeCommand('revealInExplorer', uri);
        }
      }),
    ),
    vscode.commands.registerCommand('vgroup.relink', withNode(relink)),
    vscode.commands.registerCommand('vgroup.createMarker', () => createMarkerFlow()),
    vscode.commands.registerCommand('vgroup.createSubgroup', withNode(createSubgroup)),
    vscode.commands.registerCommand('vgroup.unnestMarker', withNode(unnestMarker)),
    vscode.commands.registerCommand('vgroup.editMarker', withNode(editMarker)),
    vscode.commands.registerCommand('vgroup.deleteMarker', withNode(deleteMarker)),
    vscode.commands.registerCommand('vgroup.changeColor', withNode(editMarkerField('color', pickColor))),
    vscode.commands.registerCommand('vgroup.changeIcon', withNode(editMarkerField('icon', pickIcon))),
    vscode.commands.registerCommand(
      'vgroup.changeBadge',
      withNode(editMarkerField('badge', (current) => askBadge(current ?? ''))),
    ),
    ...(['flow', '2', '3'] as const).map((columns) =>
      vscode.commands.registerCommand(
        `vgroup.setColumns.${columns}`,
        withNode(async (node) => {
          if (node?.kind === 'marker') {
            await store.setColumns(node.markerId, columns);
          }
        }),
      ),
    ),
    vscode.commands.registerCommand('vgroup.markClass', () => markClass()),
    vscode.commands.registerCommand('vgroup.markClassManual', (uri?: vscode.Uri) => markClassManual(uri)),
    vscode.commands.registerCommand('vgroup.setAlias', withNode(setAlias)),
    vscode.commands.registerCommand('vgroup.clearAlias', withNode(clearAlias)),
    vscode.commands.registerCommand('vgroup.openClass', withNode(openClassCommand)),
    vscode.commands.registerCommand('vgroup.openItem', withNode((node) => openItemOrFull(node, false))),
    vscode.commands.registerCommand('vgroup.openFull', withNode((node) => openItemOrFull(node, true))),
    vscode.commands.registerCommand('vgroup.moveMarkerUp', withNode((node) => moveMarker(node, -1))),
    vscode.commands.registerCommand('vgroup.moveMarkerDown', withNode((node) => moveMarker(node, 1))),
    vscode.commands.registerCommand('vgroup.openConfig', openConfig),
    vscode.commands.registerCommand('vgroup.refresh', () => store.load()),
  ];
}

function activeUri(): vscode.Uri[] {
  const uri = vscode.window.activeTextEditor?.document.uri;
  return uri ? [uri] : [];
}

async function exists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}
