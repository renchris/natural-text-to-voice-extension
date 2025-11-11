import { $ } from 'bun';

console.log('🚀 Building Chrome extension with Bun...');

// Clean dist
await $`rm -rf dist`;
await $`mkdir -p dist`;

// Copy manifest and static assets
console.log('📋 Copying manifest and static assets...');
await $`cp -r public/* dist/`;

// Build popup
console.log('🔨 Building popup...');
await Bun.build({
  entrypoints: ['./src/popup/popup.ts'],
  outdir: './dist/popup',
  target: 'browser',
  minify: true,
  sourcemap: 'none',
});

// Copy popup HTML and CSS
await $`mkdir -p dist/popup`;
await $`cp src/popup/popup.html dist/popup/`;
await $`cp src/popup/popup.css dist/popup/` || true;

// Build options page
console.log('⚙️  Building options page...');
await Bun.build({
  entrypoints: ['./src/options/options.ts'],
  outdir: './dist/options',
  target: 'browser',
  minify: true,
  sourcemap: 'none',
});

// Copy options HTML and CSS
await $`mkdir -p dist/options`;
await $`cp src/options/options.html dist/options/`;
await $`cp src/options/options.css dist/options/` || true;

// Build background service worker
console.log('⚡ Building background service worker...');
await Bun.build({
  entrypoints: ['./src/background/service-worker.ts'],
  outdir: './dist/background',
  target: 'browser',
  minify: true,
  sourcemap: 'none',
});

// Build content script
console.log('📄 Building content script...');
await Bun.build({
  entrypoints: ['./src/content/content-script.ts'],
  outdir: './dist/content',
  target: 'browser',
  minify: true,
  sourcemap: 'none',
});

// Copy content script CSS
await $`mkdir -p dist/content`;
await $`cp src/content/content-script.css dist/content/` || true;

// Build offscreen document
console.log('🎵 Building offscreen document...');
await Bun.build({
  entrypoints: ['./src/offscreen/offscreen.ts'],
  outdir: './dist/offscreen',
  target: 'browser',
  minify: true,
  sourcemap: 'none',
});

// Copy offscreen HTML
await $`mkdir -p dist/offscreen`;
await $`cp src/offscreen/offscreen.html dist/offscreen/`;

console.log('✅ Build complete!');
console.log('📦 Check dist/ for Chrome extension files');
