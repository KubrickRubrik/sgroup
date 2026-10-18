import * as vscode from 'vscode';
import {
  DEFAULT_LABEL_SATURATION,
  PALETTE,
  isSgroupLabelColorKey,
  labelDarkAt,
  labelLightAt,
} from './palette';

/**
 * FileDecoration only accepts ThemeColor ids. Soft labels are contributed as `sgroup.*.label`
 * with fixed light/dark defaults (20%). For other mid saturations we override those ids in
 * the user's global `workbench.colorCustomizations` for the active theme kind.
 */
export async function syncExplorerLabelColors(saturation: number): Promise<void> {
  const config = vscode.workspace.getConfiguration('workbench');
  const inspected = config.inspect<Record<string, unknown>>('colorCustomizations');
  const globalValue = { ...(inspected?.globalValue ?? {}) };

  for (const key of Object.keys(globalValue)) {
    if (isSgroupLabelColorKey(key) || isLegacyVgroupLabelKey(key)) {
      delete globalValue[key];
    }
  }

  // 0 / 100 use foreground / vivid stripe in decorations — no soft-label override needed.
  // Default 20% matches package.json contributes.colors light/dark defaults.
  if (saturation > 0 && saturation < 100 && saturation !== DEFAULT_LABEL_SATURATION) {
    const kind = vscode.window.activeColorTheme.kind;
    const light =
      kind === vscode.ColorThemeKind.Light || kind === vscode.ColorThemeKind.HighContrastLight;
    for (const entry of PALETTE) {
      globalValue[entry.id + '.label'] = light
        ? labelLightAt(entry.hex, saturation)
        : labelDarkAt(entry.hex, saturation);
    }
  }

  const next = Object.keys(globalValue).length > 0 ? globalValue : undefined;
  await config.update('colorCustomizations', next, vscode.ConfigurationTarget.Global);
}

export async function clearExplorerLabelColors(): Promise<void> {
  const config = vscode.workspace.getConfiguration('workbench');
  const inspected = config.inspect<Record<string, unknown>>('colorCustomizations');
  const globalValue = { ...(inspected?.globalValue ?? {}) };
  let changed = false;
  for (const key of Object.keys(globalValue)) {
    if (isSgroupLabelColorKey(key) || isLegacyVgroupLabelKey(key)) {
      delete globalValue[key];
      changed = true;
    }
  }
  if (!changed) {
    return;
  }
  const next = Object.keys(globalValue).length > 0 ? globalValue : undefined;
  await config.update('colorCustomizations', next, vscode.ConfigurationTarget.Global);
}

function isLegacyVgroupLabelKey(key: string): boolean {
  return /^vgroup\.[a-z]+\.label$/.test(key);
}
