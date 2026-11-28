const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

function copyOnigWasm() {
  const pkgJson = require.resolve('vscode-oniguruma/package.json');
  const src = path.join(path.dirname(pkgJson), 'release', 'onig.wasm');
  const destDir = path.join(__dirname, 'dist');
  const dest = path.join(destDir, 'onig.wasm');
  if (!fs.existsSync(src)) {
    console.warn('onig.wasm not found at', src);
    return;
  }
  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(src, dest);
}

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node18',
    outfile: 'dist/extension.js',
    external: ['vscode'],
    minify: production,
    sourcemap: !production,
    logLevel: 'info',
  });
  const after = async () => {
    copyOnigWasm();
  };
  if (watch) {
    await ctx.watch();
    await after();
    return;
  }
  await ctx.rebuild();
  await after();
  await ctx.dispose();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
