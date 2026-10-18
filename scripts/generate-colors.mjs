/**
 * Regenerates contributes.colors in package.json from the palette hex values.
 * Run: node scripts/generate-colors.mjs
 *
 * Each palette color gets a vivid id and a soft `.label` id (default 20% mix).
 * Other saturations are applied at runtime via workbench.colorCustomizations.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const packagePath = join(root, 'package.json');

const PALETTE = [
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

const DEFAULT_SATURATION = 20;
const NEAR_WHITE = '#e8e8e8';
const NEAR_BLACK = '#2a2a2a';

function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mixHex(a, b, amountOfA) {
  const [ar, ag, ab] = rgb(a);
  const [br, bg, bb] = rgb(b);
  const mix = (x, y) => Math.round(x * amountOfA + y * (1 - amountOfA));
  return (
    '#' +
    [mix(ar, br), mix(ag, bg), mix(ab, bb)]
      .map((n) => n.toString(16).padStart(2, '0'))
      .join('')
  );
}

function colorEntry(id, description, dark, light) {
  return {
    id,
    description,
    defaults: {
      dark,
      light,
      highContrast: dark,
      highContrastLight: light,
    },
  };
}

const amount = DEFAULT_SATURATION / 100;
const colors = [];
for (const item of PALETTE) {
  colors.push(colorEntry(item.id, `VGroup marker color: ${item.label}`, item.hex, item.hex));
  colors.push(
    colorEntry(
      `${item.id}.label`,
      `VGroup Explorer label tint: ${item.label}`,
      mixHex(item.hex, NEAR_WHITE, amount),
      mixHex(item.hex, NEAR_BLACK, amount),
    ),
  );
}

const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
pkg.contributes.colors = colors;
writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');
console.log(`Wrote ${colors.length} colors to package.json`);
