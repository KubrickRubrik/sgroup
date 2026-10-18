/**
 * Marker colors contributed as theme colors (`contributes.colors`), so they work in Explorer decorations,
 * which only accept theme color ids. Keep in sync with package.json via `npm run generate:colors`.
 *
 * Label tints are stepped 5…95% group hue mixed into near-foreground bases (dark/light).
 */
export const PALETTE: ReadonlyArray<{
  id: string;
  label: string;
  hex: string;
}> = [
  { id: 'vgroup.red', label: 'Red', hex: '#e5484d' },
  { id: 'vgroup.tomato', label: 'Tomato', hex: '#e54d2e' },
  { id: 'vgroup.orange', label: 'Orange', hex: '#f76b15' },
  { id: 'vgroup.amber', label: 'Amber', hex: '#ffb224' },
  { id: 'vgroup.yellow', label: 'Yellow', hex: '#f5d90a' },
  { id: 'vgroup.lime', label: 'Lime', hex: '#99d52a' },
  { id: 'vgroup.green', label: 'Green', hex: '#30a46c' },
  { id: 'vgroup.emerald', label: 'Emerald', hex: '#10b981' },
  { id: 'vgroup.teal', label: 'Teal', hex: '#12a594' },
  { id: 'vgroup.cyan', label: 'Cyan', hex: '#00a2c7' },
  { id: 'vgroup.sky', label: 'Sky', hex: '#4cc3ff' },
  { id: 'vgroup.blue', label: 'Blue', hex: '#3e63dd' },
  { id: 'vgroup.indigo', label: 'Indigo', hex: '#5b5bd6' },
  { id: 'vgroup.violet', label: 'Violet', hex: '#8e4ec6' },
  { id: 'vgroup.purple', label: 'Purple', hex: '#ab4aba' },
  { id: 'vgroup.plum', label: 'Plum', hex: '#b658c4' },
  { id: 'vgroup.pink', label: 'Pink', hex: '#d6409f' },
  { id: 'vgroup.rose', label: 'Rose', hex: '#f43f5e' },
  { id: 'vgroup.brown', label: 'Brown', hex: '#ad7f58' },
  { id: 'vgroup.bronze', label: 'Bronze', hex: '#a18072' },
  { id: 'vgroup.gold', label: 'Gold', hex: '#978365' },
  { id: 'vgroup.gray', label: 'Gray', hex: '#8b8d98' },
  { id: 'vgroup.slate', label: 'Slate', hex: '#64748b' },
];

/** Explorer label saturation steps contributed as `vgroup.*.label.N` theme colors. */
export const LABEL_SATURATION_STEPS: readonly number[] = [
  5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95,
];

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
 * Soft label color for Explorer decorations at a saturation step (5…95).
 * Uses `vgroup.*.label.N` theme colors. Callers handle 0 (foreground) and 100 (stripe).
 */
export function themeLabelColorId(color: string, saturation: number): string {
  const step = nearestSaturationStep(saturation);
  return resolvePaletteEntry(color).id + '.label.' + step;
}

export function nearestSaturationStep(saturation: number): number {
  let best = LABEL_SATURATION_STEPS[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const step of LABEL_SATURATION_STEPS) {
    const distance = Math.abs(step - saturation);
    if (distance < bestDistance) {
      best = step;
      bestDistance = distance;
    }
  }
  return best;
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
    PALETTE.find((entry) => entry.id === 'vgroup.gray')!
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
