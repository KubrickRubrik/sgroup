import * as path from 'path';
import * as vscode from 'vscode';
import { MarkerStore } from './markerStore';

export interface ProjectDirEntry {
  name: string;
  relPath: string;
  isDir: boolean;
}

const NAV_SKIP = new Set(['.git', '.DS_Store', 'node_modules']);

/** Directory listing rooted at the workspace. `..` cannot leave the project. */
export async function listProjectDirectory(
  store: MarkerStore,
  relRaw: string | undefined,
): Promise<{ relDir: string; entries: ProjectDirEntry[]; error?: string }> {
  const hidden = excludedNames();
  let rel = startRel(store, relRaw);
  let error: string | undefined;
  let entries: ProjectDirEntry[] = [];
  for (let hop = 0; hop < 64; hop++) {
    const uri = rel ? store.toUri(rel) : store.root;
    try {
      const stat = await vscode.workspace.fs.stat(uri);
      if ((stat.type & vscode.FileType.Directory) === 0) {
        rel = parentRel(rel);
        continue;
      }
      const listed = await vscode.workspace.fs.readDirectory(uri);
      entries = listed
        .filter(([name]) => {
          if (NAV_SKIP.has(name)) {
            return false;
          }
          if (name.startsWith('.')) {
            return true;
          }
          return !hidden.has(name);
        })
        .map(([name, type]) => ({
          name,
          relPath: rel ? `${rel}/${name}` : name,
          isDir: (type & vscode.FileType.Directory) !== 0,
        }))
        .sort(
          (a, b) =>
            Number(b.isDir) - Number(a.isDir) ||
            a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
        );
      error = undefined;
      break;
    } catch {
      if (!rel) {
        error = 'unreadable';
        entries = [];
        break;
      }
      rel = parentRel(rel);
    }
  }
  return { relDir: rel, entries, error };
}

function startRel(store: MarkerStore, raw: string | undefined): string {
  const trimmed = (raw ?? '').trim();
  if (!trimmed || trimmed === '.') {
    return '';
  }
  if (path.isAbsolute(trimmed)) {
    let uri: vscode.Uri;
    try {
      uri = vscode.Uri.file(trimmed);
    } catch {
      return '';
    }
    return store.toRelative(uri) ?? '';
  }
  return projectRelative(trimmed);
}

function projectRelative(raw: string): string {
  const norm = raw.replace(/\\/g, '/');
  const parts: string[] = [];
  for (const part of norm.split('/')) {
    if (!part || part === '.') {
      continue;
    }
    if (part === '..') {
      return '';
    }
    parts.push(part);
  }
  return parts.join('/');
}

function parentRel(rel: string): string {
  if (!rel) {
    return '';
  }
  const parent = path.posix.dirname(rel);
  return parent === '.' ? '' : parent;
}

function excludedNames(): Set<string> {
  const exclude = vscode.workspace.getConfiguration('files').get<Record<string, boolean>>('exclude') ?? {};
  const names = new Set<string>();
  for (const [pattern, enabled] of Object.entries(exclude)) {
    if (enabled !== true) {
      continue;
    }
    const name = pattern.replace(/^\*\*\//, '');
    if (!/[*?{}[\]/]/.test(name)) {
      names.add(name);
    }
  }
  return names;
}
