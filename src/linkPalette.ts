/**
 * Fixed color set for the links map root chips. Stored as `#rrggbb` (not theme ids),
 * so Explorer decorations and `scripts/generate-colors.mjs` stay untouched.
 */
export const LINK_PALETTE: ReadonlyArray<{
  id: string;
  label: string;
  tones: readonly [string, string, string];
}> = [
  { id: 'red', label: 'Red', tones: ['#d65156', '#d3363b', '#99292c'] },
  { id: 'rose', label: 'Rose', tones: ['#d6517e', '#d3366a', '#99294e'] },
  { id: 'orange', label: 'Orange', tones: ['#f46d34', '#f56124', '#af491d'] },
  { id: 'amber', label: 'Amber', tones: ['#f49a34', '#f2870d', '#af6b1d'] },
  { id: 'lime', label: 'Lime', tones: ['#52be37', '#439a2d', '#3a792a'] },
  { id: 'green', label: 'Green', tones: ['#37be7f', '#2d9964', '#2a7954'] },
  { id: 'teal', label: 'Teal', tones: ['#37beb0', '#2d9a8f', '#2a7971'] },
  { id: 'sky', label: 'Sky', tones: ['#51aad6', '#369fd3', '#297499'] },
  { id: 'blue', label: 'Blue', tones: ['#5173d6', '#3658d3', '#234cc7'] },
  { id: 'indigo', label: 'Indigo', tones: ['#6c51d6', '#5636d3', '#3f2999'] },
  { id: 'violet', label: 'Violet', tones: ['#9760c7', '#8245ba', '#693b91'] },
  { id: 'fuchsia', label: 'Fuchsia', tones: ['#d651b3', '#d336a9', '#99297b'] },
  { id: 'slate', label: 'Slate', tones: ['#6a81a0', '#59697f', '#495565'] },
];

/** Flat list of every tone hex, column-major (top → bottom per column). */
export const LINK_PALETTE_HEX: readonly string[] = LINK_PALETTE.flatMap((column) => [...column.tones]);

const LINK_HEX_SET = new Set(LINK_PALETTE_HEX.map((hex) => hex.toLowerCase()));

/** True when `color` is one of the fixed link tones (`#rrggbb`, any case). */
export function isLinkPaletteColor(color: string): boolean {
  return LINK_HEX_SET.has(color.trim().toLowerCase());
}

/** Default root color when none is stored. */
export const LINK_PALETTE_DEFAULT = LINK_PALETTE_HEX[0] ?? '#d65156';

/** Random tone from the set (for one-shot migration of legacy colors). */
export function randomLinkPaletteColor(): string {
  const index = Math.floor(Math.random() * LINK_PALETTE_HEX.length);
  return LINK_PALETTE_HEX[index] ?? LINK_PALETTE_DEFAULT;
}
