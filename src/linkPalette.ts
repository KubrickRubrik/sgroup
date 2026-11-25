/**
 * Fixed color set for map chips. Stored as `#rrggbb` or `#rrggbbaa`
 * (not theme ids), so Explorer decorations and `scripts/generate-colors.mjs` stay untouched.
 *
 * `row` is the picker band: 0 is the warm→cool ramp, 1 is the red–magenta family.
 * Array order is the picker order. Automatic assignment uses {@link LINK_PALETTE_HEX}
 * and never picks Red, Rose, Fuchsia, Orange, or Amber — those stay selectable by hand.
 */
export const LINK_PALETTE: ReadonlyArray<{
  id: string;
  label: string;
  row: 0 | 1;
  tones: readonly [string, string, string];
}> = [
  { id: 'orange', label: 'Orange', row: 0, tones: ['#f46d34', '#f56124', '#af491d'] },
  { id: 'amber', label: 'Amber', row: 0, tones: ['#f49a34', '#f2870d', '#af6b1d'] },
  { id: 'lime', label: 'Lime', row: 0, tones: ['#52be37', '#439a2d', '#3a792a'] },
  { id: 'green', label: 'Green', row: 0, tones: ['#37be7f', '#2d9964', '#2a7954'] },
  { id: 'teal', label: 'Teal', row: 0, tones: ['#37beb0', '#2d9a8f', '#2a7971'] },
  { id: 'sky', label: 'Sky', row: 0, tones: ['#51aad6', '#369fd3', '#297499'] },
  { id: 'blue', label: 'Blue', row: 0, tones: ['#5173d6', '#3658d3', '#234cc7'] },
  { id: 'indigo', label: 'Indigo', row: 0, tones: ['#6c51d6', '#5636d3', '#3f2999'] },
  { id: 'violet', label: 'Violet', row: 0, tones: ['#9760c7', '#8245ba', '#693b91'] },
  { id: 'slate', label: 'Slate', row: 0, tones: ['#6a81a0', '#59697f', '#495565'] },
  { id: 'red', label: 'Red', row: 1, tones: ['#d65156', '#d3363b', '#99292c'] },
  { id: 'rose', label: 'Rose', row: 1, tones: ['#d6517e', '#d3366a', '#99294e'] },
  { id: 'fuchsia', label: 'Fuchsia', row: 1, tones: ['#d651b3', '#d336a9', '#99297b'] },
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
  LINK_PALETTE.flatMap((column) => column.tones.map((hex) => hex.toLowerCase())),
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
