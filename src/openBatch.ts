import * as path from 'path';
import * as vscode from 'vscode';
import { ClassDef, MarkerStore } from './markerStore';
import { openClassAt } from './openClass';

export const OPEN_BATCH_LIMIT = 30;

export type OpenTarget =
  | { kind: 'file'; relPath: string }
  | { kind: 'class'; classId: string; def: ClassDef };

/** Collect open targets for a marker (optionally including subgroups). */
export function targetsForMarker(store: MarkerStore, markerId: string, full: boolean): OpenTarget[] {
  const markerIds = full ? store.descendantMarkers(markerId, true) : [markerId];
  const targets: OpenTarget[] = [];
  const seenFiles = new Set<string>();
  const seenClasses = new Set<string>();

  for (const id of markerIds) {
    for (const relPath of store.itemsOf(id)) {
      if (seenFiles.has(relPath)) {
        continue;
      }
      seenFiles.add(relPath);
      targets.push({ kind: 'file', relPath });
    }
    for (const [classId, def] of store.classesOf(id)) {
      if (seenClasses.has(classId)) {
        continue;
      }
      seenClasses.add(classId);
      targets.push({ kind: 'class', classId, def });
    }
  }
  return targets;
}

/** Disk files under a directory plus matching classes from the same marker. */
export async function targetsForDirectory(
  store: MarkerStore,
  markerId: string,
  dirRel: string,
  full: boolean,
): Promise<OpenTarget[]> {
  const prefix = dirRel.endsWith('/') ? dirRel : dirRel + '/';
  const files = await listFiles(store.toUri(dirRel), store.root, full);
  const targets: OpenTarget[] = files.map((relPath) => ({ kind: 'file' as const, relPath }));
  const seen = new Set(files);

  for (const [classId, def] of store.classesOf(markerId)) {
    const under =
      full
        ? def.relPath === dirRel || def.relPath.startsWith(prefix)
        : path.posix.dirname(def.relPath) === dirRel;
    if (!under || seen.has(`class:${classId}`)) {
      continue;
    }
    seen.add(`class:${classId}`);
    targets.push({ kind: 'class', classId, def });
  }
  return targets;
}

export async function openTargets(
  store: MarkerStore,
  targets: OpenTarget[],
  viewColumn?: vscode.ViewColumn,
): Promise<void> {
  const filesOnly = targets.filter((t) => t.kind === 'file');
  const classes = targets.filter((t) => t.kind === 'class');

  // Skip directories when opening "files" from a group — only real files.
  const fileTargets: OpenTarget[] = [];
  for (const target of filesOnly) {
    if (target.kind !== 'file') {
      continue;
    }
    try {
      const stat = await vscode.workspace.fs.stat(store.toUri(target.relPath));
      if (stat.type & vscode.FileType.Directory) {
        continue;
      }
      fileTargets.push(target);
    } catch {
      // Missing path — still try to open (may fail quietly).
      fileTargets.push(target);
    }
  }

  const ordered = [...fileTargets, ...classes];
  if (ordered.length === 0) {
    void vscode.window.showInformationMessage('VGroup: nothing to open.');
    return;
  }
  let list = ordered;
  if (list.length > OPEN_BATCH_LIMIT) {
    void vscode.window.showWarningMessage(
      `VGroup: opening first ${OPEN_BATCH_LIMIT} of ${list.length} items.`,
    );
    list = list.slice(0, OPEN_BATCH_LIMIT);
  }

  for (const target of list) {
    if (target.kind === 'file') {
      const uri = store.toUri(target.relPath);
      await vscode.commands.executeCommand('vscode.open', uri, {
        viewColumn,
        preview: false,
        preserveFocus: true,
      });
    } else {
      await openClassAt(store, target.def, viewColumn);
    }
  }
}

async function listFiles(dirUri: vscode.Uri, root: vscode.Uri, recursive: boolean): Promise<string[]> {
  const result: string[] = [];
  let entries: [string, vscode.FileType][];
  try {
    entries = await vscode.workspace.fs.readDirectory(dirUri);
  } catch {
    return result;
  }
  for (const [name, type] of entries) {
    if (name.startsWith('.')) {
      continue;
    }
    const child = vscode.Uri.joinPath(dirUri, name);
    if (type & vscode.FileType.Directory) {
      if (recursive) {
        result.push(...(await listFiles(child, root, true)));
      }
      continue;
    }
    if (type & vscode.FileType.File) {
      const rel = path.posix.relative(root.path, child.path);
      if (rel && !rel.startsWith('..')) {
        result.push(rel);
      }
    }
  }
  return result.sort();
}
