import * as vscode from 'vscode';
import type { AdminProfile, LinkRow, ProjectRow } from './supabase';

export interface BetaConfig {
  key: string;
  admin: AdminProfile;
  links: LinkRow[];
  projects: ProjectRow[];
  activeProjectId: number | null;
}

export interface StoredSession {
  key: string;
  activeProjectId: number | null;
}

export function pickProject(projects: ProjectRow[], activeProjectId: number | null): ProjectRow | undefined {
  if (projects.length === 0) {
    return undefined;
  }
  if (activeProjectId !== null) {
    const saved = projects.find((project) => project.id === activeProjectId);
    if (saved) {
      return saved;
    }
  }
  return projects.reduce((best, project) => (project.id < best.id ? project : best));
}

export async function readConfig(folder: vscode.Uri): Promise<StoredSession | undefined> {
  try {
    const raw = await vscode.workspace.fs.readFile(configUri(folder));
    const parsed: unknown = JSON.parse(new TextDecoder().decode(raw));
    const row = asRecord(parsed);
    if (!row || typeof row.key !== 'string') {
      return undefined;
    }
    const key = row.key.trim();
    if (!key) {
      return undefined;
    }
    return {
      key,
      activeProjectId: asInt(row.activeProjectId),
    };
  } catch {
    return undefined;
  }
}

export async function writeConfig(folder: vscode.Uri, config: BetaConfig): Promise<void> {
  const dir = vscode.Uri.joinPath(folder, '.beta');
  await vscode.workspace.fs.createDirectory(dir);
  const body = `${JSON.stringify(config, null, 2)}\n`;
  await vscode.workspace.fs.writeFile(configUri(folder), new TextEncoder().encode(body));
}

function configUri(folder: vscode.Uri): vscode.Uri {
  return vscode.Uri.joinPath(folder, '.beta', 'config.json');
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function asInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isSafeInteger(value)) {
    return value;
  }
  if (typeof value === 'string' && /^-?\d+$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed)) {
      return parsed;
    }
  }
  return null;
}
