/**
 * Marker colors contributed as theme colors (`contributes.colors`), so they work in Explorer decorations,
 * which only accept theme color ids. Keep in sync with package.json via `npm run generate:colors`.
 *
 * Soft Explorer labels use `syn3.*.label`. Mid saturation is applied at runtime by writing the mixed
 * hex into `workbench.colorCustomizations` (FileDecoration cannot take a raw hex).
 */
export const PALETTE: ReadonlyArray<{
  id: string;
  label: string;
  hex: string;
}> = [
  { id: 'syn3.red', label: 'Red', hex: '#e5484d' },
  { id: 'syn3.tomato', label: 'Tomato', hex: '#e54d2e' },
  { id: 'syn3.orange', label: 'Orange', hex: '#f76b15' },
  { id: 'syn3.amber', label: 'Amber', hex: '#ffb224' },
  { id: 'syn3.yellow', label: 'Yellow', hex: '#f5d90a' },
  { id: 'syn3.lime', label: 'Lime', hex: '#99d52a' },
  { id: 'syn3.green', label: 'Green', hex: '#30a46c' },
  { id: 'syn3.emerald', label: 'Emerald', hex: '#10b981' },
  { id: 'syn3.teal', label: 'Teal', hex: '#12a594' },
  { id: 'syn3.cyan', label: 'Cyan', hex: '#00a2c7' },
  { id: 'syn3.sky', label: 'Sky', hex: '#4cc3ff' },
  { id: 'syn3.blue', label: 'Blue', hex: '#3e63dd' },
  { id: 'syn3.indigo', label: 'Indigo', hex: '#5b5bd6' },
  { id: 'syn3.violet', label: 'Violet', hex: '#8e4ec6' },
  { id: 'syn3.purple', label: 'Purple', hex: '#ab4aba' },
  { id: 'syn3.plum', label: 'Plum', hex: '#b658c4' },
  { id: 'syn3.pink', label: 'Pink', hex: '#d6409f' },
  { id: 'syn3.rose', label: 'Rose', hex: '#f43f5e' },
  { id: 'syn3.brown', label: 'Brown', hex: '#ad7f58' },
  { id: 'syn3.bronze', label: 'Bronze', hex: '#a18072' },
  { id: 'syn3.gold', label: 'Gold', hex: '#978365' },
  { id: 'syn3.gray', label: 'Gray', hex: '#8b8d98' },
  { id: 'syn3.slate', label: 'Slate', hex: '#64748b' },
];

/** Default soft-label mix written into package.json (matches appearance.labelSaturation default). */
export const DEFAULT_LABEL_SATURATION = 20;

const NEAR_WHITE = '#e8e8e8';
const NEAR_BLACK = '#2a2a2a';

export function mixHex(a: string, b: string, amountOfA: number): string {
  const [ar, ag, ab] = rgb(a);
  const [br, bg, bb] = rgb(b);
  const t = amountOfA;
  const mix = (x: number, y: number) => Math.round(x * t + y * (1 - t));
  return (
    '#' +
    [mix(ar, br), mix(ag, bg), mix(ab, bb)]
      .map((n) => n.toString(16).padStart(2, '0'))
      .join('')
  );
}

/** Dark-theme label tint at saturation 0–100. */
export function labelDarkAt(hex: string, saturation: number): string {
  return mixHex(hex, NEAR_WHITE, clamp01(saturation / 100));
}

/** Light-theme label tint at saturation 0–100. */
export function labelLightAt(hex: string, saturation: number): string {
  return mixHex(hex, NEAR_BLACK, clamp01(saturation / 100));
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function isHexColor(value: string): boolean {
  return HEX_RE.test(value.trim());
}

/** Returns `#rrggbb` or undefined. */
export function normalizeHex(value: string): string | undefined {
  const match = HEX_RE.exec(value.trim());
  if (!match) {
    return undefined;
  }
  const digits = match[1].length === 3 ? [...match[1]].map((c) => c + c).join('') : match[1];
  return '#' + digits.toLowerCase();
}

/** Theme color id usable by VS Code APIs: palette/theme ids as is, custom hex mapped to the nearest palette color. */
export function themeColorId(color: string): string {
  const hex = normalizeHex(color);
  if (hex && (color.trim().startsWith('#') || HEX_RE.test(color.trim()))) {
    return nearestByHex(hex).id;
  }
  return color;
}

/**
 * Soft label color for Explorer decorations.
 * Uses `syn3.*.label`; mid saturations are pushed into workbench.colorCustomizations at runtime.
 */
export function themeLabelColorId(color: string): string {
  return resolvePaletteEntry(color).id + '.label';
}

export function isSyn3LabelColorKey(key: string): boolean {
  return PALETTE.some((entry) => key === entry.id + '.label');
}

function resolvePaletteEntry(color: string): (typeof PALETTE)[number] {
  const known = PALETTE.find((entry) => entry.id === color);
  if (known) {
    return known;
  }
  const hex = normalizeHex(color);
  if (hex && (color.trim().startsWith('#') || HEX_RE.test(color.trim()))) {
    return nearestByHex(hex);
  }
  const token = color.toLowerCase().split('.').pop() ?? '';
  return (
    PALETTE.find((entry) => entry.id.endsWith('.' + token) || entry.label.toLowerCase() === token) ??
    PALETTE.find((entry) => entry.id === 'syn3.gray')!
  );
}

function nearestByHex(hex: string): (typeof PALETTE)[number] {
  const [r, g, b] = rgb(hex);
  let best = PALETTE[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const item of PALETTE) {
    const [pr, pg, pb] = rgb(item.hex);
    const distance = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
    if (distance < bestDistance) {
      best = item;
      bestDistance = distance;
    }
  }
  return best;
}

/** CSS value for the map webview. */
export function cssColor(color: string): string {
  if (color.startsWith('#')) {
    return color;
  }
  return `var(--vscode-${color.replace(/\./g, '-')})`;
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
