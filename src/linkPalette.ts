/**
 * Fixed color set for map chips. Stored as `#rrggbb` or `#rrggbbaa`
 * (not theme ids), so Explorer decorations and `scripts/generate-colors.mjs` stay untouched.
 *
 * `row` is the picker band: 0 is the warm→cool ramp, 1 is the red–magenta family.
 * `tones` are the vivid tab, `pastels` the soft tab. Array order is the picker order.
 * Automatic assignment uses {@link LINK_PALETTE_HEX} and never picks Red, Rose, Fuchsia,
 * Orange, or Amber — those stay selectable by hand. Pastels are selectable only.
 */
export const LINK_PALETTE: ReadonlyArray<{
  id: string;
  label: string;
  row: 0 | 1;
  tones: readonly [string, string, string];
  pastels: readonly [string, string, string];
}> = [
  { id: 'orange', label: 'Orange', row: 0, tones: ['#f46d34', '#f56124', '#af491d'], pastels: ['#e6c2b3', '#e3b4a1', '#d09880'] },
  { id: 'amber', label: 'Amber', row: 0, tones: ['#f49a34', '#f2870d', '#af6b1d'], pastels: ['#e6ceb3', '#e3c4a1', '#d0ab80'] },
  { id: 'lime', label: 'Lime', row: 0, tones: ['#52be37', '#439a2d', '#3a792a'], pastels: ['#bde6b3', '#aee3a1', '#90d080'] },
  { id: 'green', label: 'Green', row: 0, tones: ['#37be7f', '#2d9964', '#2a7954'], pastels: ['#b3e6ce', '#a1e3c4', '#80d0ab'] },
  { id: 'teal', label: 'Teal', row: 0, tones: ['#37beb0', '#2d9a8f', '#2a7971'], pastels: ['#b3e6e0', '#a1e3dc', '#80d0c8'] },
  { id: 'sky', label: 'Sky', row: 0, tones: ['#51aad6', '#369fd3', '#297499'], pastels: ['#b3d4e6', '#a1cde3', '#80b6d0'] },
  { id: 'blue', label: 'Blue', row: 0, tones: ['#5173d6', '#3658d3', '#234cc7'], pastels: ['#b3bfe6', '#a1b2e3', '#8095d0'] },
  { id: 'indigo', label: 'Indigo', row: 0, tones: ['#6c51d6', '#5636d3', '#3f2999'], pastels: ['#beb3e6', '#aea1e3', '#9180d0'] },
  { id: 'violet', label: 'Violet', row: 0, tones: ['#9760c7', '#8245ba', '#693b91'], pastels: ['#ceb3e6', '#c4a1e3', '#ab80d0'] },
  { id: 'slate', label: 'Slate', row: 0, tones: ['#6a81a0', '#59697f', '#495565'], pastels: ['#becada', '#afbfd4', '#95a5bb'] },
  { id: 'red', label: 'Red', row: 1, tones: ['#d65156', '#d3363b', '#99292c'], pastels: ['#e6b3b4', '#e3a1a3', '#d08083'] },
  { id: 'rose', label: 'Rose', row: 1, tones: ['#d6517e', '#d3366a', '#99294e'], pastels: ['#e6b3c3', '#e3a1b7', '#d0809b'] },
  { id: 'fuchsia', label: 'Fuchsia', row: 1, tones: ['#d651b3', '#d336a9', '#99297b'], pastels: ['#e6b3d8', '#e3a1d1', '#d080bb'] },
];

/**
 * Hues a new chip may receive on its own. Red, Rose, Fuchsia, Orange, and Amber stay
 * in the picker and on chips that already have them, but never come up as the default.
 * Remaining order is the old hue walk, so the next free color still steps lime → slate.
 */
const LINK_ASSIGN_IDS = [
  'lime',
  'green',
  'teal',
  'sky',
  'blue',
  'indigo',
  'violet',
  'slate',
] as const;

/** Tones handed out automatically, column-major (top → bottom per column). */
export const LINK_PALETTE_HEX: readonly string[] = LINK_ASSIGN_IDS.flatMap((id) => {
  const column = LINK_PALETTE.find((item) => item.id === id);
  return column ? [...column.tones] : [];
});

const LINK_HEX_SET = new Set(
  LINK_PALETTE.flatMap((column) =>
    [...column.tones, ...column.pastels].map((hex) => hex.toLowerCase()),
  ),
);

/** True when `color` is a fixed link tone, with or without an alpha byte. */
export function isLinkPaletteColor(color: string): boolean {
  const hex = color.trim().toLowerCase();
  if (LINK_HEX_SET.has(hex)) {
    return true;
  }
  return /^#[0-9a-f]{8}$/.test(hex) && LINK_HEX_SET.has(hex.slice(0, 7));
}

/** Default root color when none is stored. First auto tone: Lime. */
export const LINK_PALETTE_DEFAULT = LINK_PALETTE_HEX[0] ?? '#52be37';

/** Random auto tone. Never Red, Rose, Fuchsia, Orange, or Amber. */
export function randomLinkPaletteColor(): string {
  const index = Math.floor(Math.random() * LINK_PALETTE_HEX.length);
  return LINK_PALETTE_HEX[index] ?? LINK_PALETTE_DEFAULT;
}
