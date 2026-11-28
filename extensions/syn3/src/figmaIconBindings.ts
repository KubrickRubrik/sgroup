import { normalizeHex } from './palette';

/** Light gray for an unset avatar or an unset thread. */
export const FIGMA_ICON_GRAY = '#c5c8ce';

/** Lucide icon used when no binding matches. */
export const FIGMA_ICON_FALLBACK = 'tag';

const ICON_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_BINDINGS = 80;
const MAX_TEXT = 80;

export interface FigmaIconBinding {
  icon: string;
  text: string;
  color?: string;
  /** Starter row. Can be edited, cannot be removed. */
  builtin?: true;
}

export interface FigmaIconMatch {
  caseSensitive?: true;
  whole?: true;
}

/** Same hues as the hierarchy mock, pushed brighter and more saturated. */
const FIGMA_ICON_MINT = '#47f5dc';
const FIGMA_ICON_LIGHT = '#f7f9fc';
const FIGMA_ICON_AMBER = '#ffb224';

/** Earlier starter hexes. A builtin row that still has one takes the current palette. */
const FIGMA_ICON_PREVIOUS_COLORS = [
  '#7ed9cc',
  '#7ed9cc',
  '#e7eaee',
  '#e7eaee',
  '#e7eaee',
  '#e7eaee',
  '#e7eaee',
  '#e7eaee',
  '#e7eaee',
  '#f0a040',
] as const;

export const FIGMA_ICON_DEFAULTS: readonly FigmaIconBinding[] = [
  { icon: 'house', text: 'Главная', color: FIGMA_ICON_MINT, builtin: true },
  { icon: 'image', text: 'Баннеры', color: FIGMA_ICON_MINT, builtin: true },
  { icon: 'smartphone', text: 'Мобайл', color: FIGMA_ICON_LIGHT, builtin: true },
  { icon: 'monitor', text: 'Веб', color: FIGMA_ICON_LIGHT, builtin: true },
  { icon: 'tag', text: 'Жанры', color: FIGMA_ICON_LIGHT, builtin: true },
  { icon: 'file-text', text: 'Список', color: FIGMA_ICON_LIGHT, builtin: true },
  { icon: 'puzzle', text: 'Футер', color: FIGMA_ICON_LIGHT, builtin: true },
  { icon: 'box', text: 'Заглушки', color: FIGMA_ICON_LIGHT, builtin: true },
  { icon: 'tag', text: 'Теги', color: FIGMA_ICON_LIGHT, builtin: true },
  { icon: 'layout-grid', text: 'LayoutPage', color: FIGMA_ICON_AMBER, builtin: true },
];

export function defaultFigmaIconBindings(): FigmaIconBinding[] {
  return FIGMA_ICON_DEFAULTS.map((row) => ({ ...row }));
}

export function isFigmaIconName(value: string): boolean {
  return ICON_NAME.test(value) && value.length <= 64;
}

export function normalizeFigmaIconMatch(raw: unknown): FigmaIconMatch | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return undefined;
  }
  const source = raw as { caseSensitive?: unknown; whole?: unknown };
  const match: FigmaIconMatch = {};
  if (source.caseSensitive === true) {
    match.caseSensitive = true;
  }
  if (source.whole === true) {
    match.whole = true;
  }
  return match.caseSensitive || match.whole ? match : undefined;
}

export function normalizeFigmaIconBindings(raw: unknown): FigmaIconBinding[] | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }
  const rows: FigmaIconBinding[] = [];
  for (const item of raw) {
    if (rows.length >= MAX_BINDINGS) {
      break;
    }
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      continue;
    }
    const source = item as { icon?: unknown; text?: unknown; color?: unknown; builtin?: unknown };
    const icon = typeof source.icon === 'string' ? source.icon.trim().toLowerCase() : '';
    if (!isFigmaIconName(icon)) {
      continue;
    }
    const text = typeof source.text === 'string' ? source.text.trim().slice(0, MAX_TEXT) : '';
    const color = typeof source.color === 'string' ? normalizeHex(source.color) : undefined;
    const row: FigmaIconBinding = { icon, text };
    if (color && color.toLowerCase() !== FIGMA_ICON_GRAY) {
      row.color = color;
    }
    if (source.builtin === true) {
      row.builtin = true;
    }
    rows.push(row);
  }
  return rows.length > 0 ? rows : undefined;
}

/**
 * Starter rows keep the default color until the user picks another.
 * A saved list that still has the previous starter hex is refreshed.
 */
function paintBuiltinIconColors(rows: FigmaIconBinding[]): FigmaIconBinding[] {
  let index = 0;
  for (const row of rows) {
    if (!row.builtin) {
      continue;
    }
    const starter = FIGMA_ICON_DEFAULTS[index];
    const previous = FIGMA_ICON_PREVIOUS_COLORS[index];
    index += 1;
    if (!starter?.color) {
      continue;
    }
    const current = row.color?.toLowerCase();
    if (!current || current === previous) {
      row.color = starter.color;
    }
  }
  return rows;
}

/** Stored list, or the ten starter rows when the page has none yet. */
export function resolveFigmaIconBindings(stored: FigmaIconBinding[] | undefined): FigmaIconBinding[] {
  const rows = stored?.length ? stored.map((row) => ({ ...row })) : defaultFigmaIconBindings();
  return paintBuiltinIconColors(rows);
}

export function figmaIconTextKey(text: string, match: FigmaIconMatch | undefined): string {
  const trimmed = text.trim();
  return match?.caseSensitive ? trimmed : trimmed.toLocaleLowerCase();
}

export function figmaIconBindingsDuplicate(
  rows: readonly { text: string }[],
  match: FigmaIconMatch | undefined,
): boolean {
  const seen = new Set<string>();
  for (const row of rows) {
    const key = figmaIconTextKey(row.text, match);
    if (seen.has(key)) {
      return true;
    }
    seen.add(key);
  }
  return false;
}

export function prepareFigmaIconBindings(
  raw: unknown,
  previous: FigmaIconBinding[] | undefined,
  matchRaw: unknown,
):
  | { ok: true; bindings: FigmaIconBinding[]; match?: FigmaIconMatch }
  | { ok: false; reason: 'duplicate' | 'builtin' } {
  const rows = normalizeFigmaIconBindings(raw) ?? [];
  const match = normalizeFigmaIconMatch(matchRaw);
  const required = resolveFigmaIconBindings(previous).filter((row) => row.builtin).length;
  if (rows.filter((row) => row.builtin).length !== required) {
    return { ok: false, reason: 'builtin' };
  }
  if (figmaIconBindingsDuplicate(rows, match)) {
    return { ok: false, reason: 'duplicate' };
  }
  return { ok: true, bindings: rows, ...(match ? { match } : {}) };
}

/** Longest matching text wins. Equal length keeps the earlier row. */
export function matchFigmaIcon(
  label: string,
  rows: readonly FigmaIconBinding[],
  flags: FigmaIconMatch | undefined,
): { icon: string; color: string } {
  const list = rows.length ? rows : defaultFigmaIconBindings();
  const hay = flags?.caseSensitive ? label : label.toLocaleLowerCase();
  let best: { icon: string; color?: string; length: number; index: number } | undefined;
  list.forEach((row, index) => {
    const needleRaw = row.text.trim();
    if (!needleRaw) {
      return;
    }
    const needle = flags?.caseSensitive ? needleRaw : needleRaw.toLocaleLowerCase();
    const hit = flags?.whole ? hay === needle : hay.includes(needle);
    if (!hit) {
      return;
    }
    if (!best || needleRaw.length > best.length || (needleRaw.length === best.length && index < best.index)) {
      best = { icon: row.icon, color: row.color, length: needleRaw.length, index };
    }
  });
  const color = best?.color ? normalizeHex(best.color) : undefined;
  return {
    icon: best && isFigmaIconName(best.icon) ? best.icon : FIGMA_ICON_FALLBACK,
    color: color || FIGMA_ICON_GRAY,
  };
}

export function figmaIconPageFields(page: {
  kind?: string;
  figmaIconBindings?: FigmaIconBinding[];
  figmaIconMatch?: FigmaIconMatch;
}): { figmaIconBindings?: FigmaIconBinding[]; figmaIconMatch?: FigmaIconMatch } {
  if (page.kind !== 'figma') {
    return {};
  }
  const bindings = page.figmaIconBindings?.length ? page.figmaIconBindings : undefined;
  const match =
    page.figmaIconMatch && (page.figmaIconMatch.caseSensitive || page.figmaIconMatch.whole)
      ? page.figmaIconMatch
      : undefined;
  return {
    ...(bindings ? { figmaIconBindings: bindings } : {}),
    ...(match ? { figmaIconMatch: match } : {}),
  };
}
