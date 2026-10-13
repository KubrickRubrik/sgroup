/**
 * Marker colors contributed as theme colors (`contributes.colors`), so they work in Explorer decorations,
 * which only accept theme color ids. Keep in sync with package.json.
 *
 * `labelDark` / `labelLight` are light/dark-tinted label colors for Explorer file names:
 * mostly foreground-like, with a subtle group hue.
 */
export const PALETTE: ReadonlyArray<{
  id: string;
  label: string;
  hex: string;
  labelDark: string;
  labelLight: string;
}> = [
  entry('vgroup.red', 'Red', '#e5484d'),
  entry('vgroup.tomato', 'Tomato', '#e54d2e'),
  entry('vgroup.orange', 'Orange', '#f76b15'),
  entry('vgroup.amber', 'Amber', '#ffb224'),
  entry('vgroup.yellow', 'Yellow', '#f5d90a'),
  entry('vgroup.lime', 'Lime', '#99d52a'),
  entry('vgroup.green', 'Green', '#30a46c'),
  entry('vgroup.emerald', 'Emerald', '#10b981'),
  entry('vgroup.teal', 'Teal', '#12a594'),
  entry('vgroup.cyan', 'Cyan', '#00a2c7'),
  entry('vgroup.sky', 'Sky', '#4cc3ff'),
  entry('vgroup.blue', 'Blue', '#3e63dd'),
  entry('vgroup.indigo', 'Indigo', '#5b5bd6'),
  entry('vgroup.violet', 'Violet', '#8e4ec6'),
  entry('vgroup.purple', 'Purple', '#ab4aba'),
  entry('vgroup.plum', 'Plum', '#b658c4'),
  entry('vgroup.pink', 'Pink', '#d6409f'),
  entry('vgroup.rose', 'Rose', '#f43f5e'),
  entry('vgroup.brown', 'Brown', '#ad7f58'),
  entry('vgroup.bronze', 'Bronze', '#a18072'),
  entry('vgroup.gold', 'Gold', '#978365'),
  entry('vgroup.gray', 'Gray', '#8b8d98'),
  entry('vgroup.slate', 'Slate', '#64748b'),
];

function entry(id: string, label: string, hex: string) {
  return {
    id,
    label,
    hex,
    /** ~22% group hue into a near-white label (dark themes). */
    labelDark: mixHex(hex, '#e8e8e8', 0.22),
    /** ~28% group hue into a near-black label (light themes). */
    labelLight: mixHex(hex, '#2a2a2a', 0.28),
  };
}

function mixHex(a: string, b: string, amountOfA: number): string {
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
 * Soft label color for Explorer decorations: light text with a group tint.
 * Uses `vgroup.*.label` theme colors contributed next to the vivid palette colors.
 */
export function themeLabelColorId(color: string): string {
  return resolvePaletteEntry(color).id + '.label';
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
  return PALETTE.find((entry) => entry.id.endsWith('.' + token) || entry.label.toLowerCase() === token) ?? PALETTE.find((entry) => entry.id === 'vgroup.gray')!;
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
