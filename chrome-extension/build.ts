import { $ } from 'bun';

// Strip debug logging from shipped bundles. console.warn/error stay: they are
// the only trace of real failures (e.g. an offscreen createDocument error).
const PRODUCTION_DROP = ['console.log', 'console.info', 'console.debug'];

console.log('🚀 Building Chrome extension with Bun...');

// Clean dist
await $`rm -rf dist`;
await $`mkdir -p dist`;

// Copy manifest and static assets
console.log('📋 Copying manifest and static assets...');
await $`cp -r public/* dist/`;

// Copy shared CSS (variables.css is referenced via @import from popup/options CSS)
await $`mkdir -p dist/shared`;
await $`cp src/shared/variables.css dist/shared/`;

// Build popup
console.log('🔨 Building popup...');
await Bun.build({
  entrypoints: ['./src/popup/popup.ts'],
  outdir: './dist/popup',
  target: 'browser',
  minify: true,
  sourcemap: 'none',
  drop: PRODUCTION_DROP,
});

// Copy popup HTML and CSS
await $`mkdir -p dist/popup`;
await $`cp src/popup/popup.html dist/popup/`;
await $`cp src/popup/popup.css dist/popup/`;

// Build options page
console.log('⚙️  Building options page...');
await Bun.build({
  entrypoints: ['./src/options/options.ts'],
  outdir: './dist/options',
  target: 'browser',
  minify: true,
  sourcemap: 'none',
  drop: PRODUCTION_DROP,
});

// Copy options HTML and CSS
await $`mkdir -p dist/options`;
await $`cp src/options/options.html dist/options/`;
await $`cp src/options/options.css dist/options/`;

// Build background service worker
console.log('⚡ Building background service worker...');
await Bun.build({
  entrypoints: ['./src/background/service-worker.ts'],
  outdir: './dist/background',
  target: 'browser',
  minify: true,
  sourcemap: 'none',
  drop: PRODUCTION_DROP,
});

// Build offscreen document
console.log('🎵 Building offscreen document...');
await Bun.build({
  entrypoints: ['./src/offscreen/offscreen.ts'],
  outdir: './dist/offscreen',
  target: 'browser',
  minify: true,
  sourcemap: 'none',
  drop: PRODUCTION_DROP,
});

// Copy offscreen HTML
await $`mkdir -p dist/offscreen`;
await $`cp src/offscreen/offscreen.html dist/offscreen/`;

console.log('✅ Build complete!');
console.log('📦 Check dist/ for Chrome extension files');
