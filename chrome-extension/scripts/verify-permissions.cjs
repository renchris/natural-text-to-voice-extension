#!/usr/bin/env node
/**
 * Print the install-time permission warnings Chrome shows for a built extension.
 *
 * Usage (from chrome-extension/):
 *   bun run build && node scripts/verify-permissions.cjs dist
 *   bun run verify:permissions
 *
 * stdout: exactly one line, the JSON array returned by
 *   chrome.management.getPermissionWarningsByManifest(<dist>/manifest.json)
 *   e.g. ["Read and change your data on 127.0.0.1"]
 * stderr: diagnostics (browser binary, version).
 * Exit:   0 on success, 1 on any failure (missing playwright-core, missing
 *         Chrome for Testing, unreadable manifest, API error).
 *
 * Method: the built extension is NOT loaded. A throwaway probe extension with no
 * permissions is loaded into a fresh temporary profile, and its service worker
 * asks Chrome to evaluate the built manifest. This keeps the real service
 * worker (which probes the helper on 127.0.0.1:8249-8260) from ever running.
 *
 * Browser: Chrome for Testing from Playwright's cache
 * (~/Library/Caches/ms-playwright/chromium-<rev>/, newest revision wins).
 * Override with CHROME_PATH=/path/to/binary or PLAYWRIGHT_BROWSERS_PATH=<dir>.
 * Install one with: bunx playwright-core install chromium
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const PKG_ROOT = path.resolve(__dirname, '..');

function fail(msg) {
  process.stderr.write(`verify-permissions: ${msg}\n`);
  process.exit(1);
}

function loadPlaywright() {
  try {
    // Resolve from this package's own node_modules, never a global install.
    const resolved = require.resolve('playwright-core', { paths: [PKG_ROOT] });
    return require(resolved);
  } catch {
    fail(
      'playwright-core is not installed in chrome-extension/node_modules.\n' +
        '  Run: cd chrome-extension && bun install'
    );
  }
}

function findChromeForTesting() {
  if (process.env.CHROME_PATH) {
    if (!fs.existsSync(process.env.CHROME_PATH)) fail(`CHROME_PATH does not exist: ${process.env.CHROME_PATH}`);
    return process.env.CHROME_PATH;
  }
  const cacheDir =
    process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright');
  const candidates = [];
  let entries = [];
  try {
    entries = fs.readdirSync(cacheDir);
  } catch {
    /* handled below */
  }
  for (const name of entries) {
    const m = /^chromium-(\d+)$/.exec(name);
    if (!m) continue;
    for (const plat of ['chrome-mac-arm64', 'chrome-mac-x64', 'chrome-mac']) {
      const bin = path.join(
        cacheDir,
        name,
        plat,
        'Google Chrome for Testing.app',
        'Contents',
        'MacOS',
        'Google Chrome for Testing'
      );
      if (fs.existsSync(bin)) candidates.push({ rev: Number(m[1]), bin });
    }
  }
  if (candidates.length === 0) {
    fail(
      `no Chrome for Testing binary found under ${cacheDir}/chromium-<rev>/.\n` +
        '  Install one with: cd chrome-extension && bunx playwright-core install chromium\n' +
        '  or point CHROME_PATH at a Chrome for Testing / Chromium binary.'
    );
  }
  candidates.sort((a, b) => b.rev - a.rev);
  return candidates[0].bin;
}

async function main() {
  const distArg = process.argv[2] || 'dist';
  const distDir = path.resolve(process.cwd(), distArg);
  const manifestPath = path.join(distDir, 'manifest.json');
  let manifestText;
  try {
    manifestText = fs.readFileSync(manifestPath, 'utf8');
    JSON.parse(manifestText);
  } catch (e) {
    fail(`cannot read ${manifestPath} (${e.message}). Run "bun run build" first.`);
  }

  const { chromium } = loadPlaywright();
  const executablePath = findChromeForTesting();

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ntts-verify-permissions-'));
  const probeDir = path.join(tmp, 'probe-ext');
  const profileDir = path.join(tmp, 'profile');
  fs.mkdirSync(probeDir);
  fs.writeFileSync(
    path.join(probeDir, 'manifest.json'),
    JSON.stringify({
      manifest_version: 3,
      name: 'ntts-permission-probe',
      version: '1',
      background: { service_worker: 'sw.js' },
    })
  );
  fs.writeFileSync(path.join(probeDir, 'sw.js'), '// intentionally empty\n');

  let ctx;
  try {
    ctx = await chromium.launchPersistentContext(profileDir, {
      executablePath,
      headless: true,
      args: [`--disable-extensions-except=${probeDir}`, `--load-extension=${probeDir}`],
    });
    let [sw] = ctx.serviceWorkers();
    if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
    const version = ctx.browser() ? ctx.browser().version() : await sw.evaluate(() => navigator.userAgent);
    process.stderr.write(`verify-permissions: ${executablePath}\n`);
    process.stderr.write(`verify-permissions: browser ${version}\n`);
    process.stderr.write(`verify-permissions: manifest ${manifestPath}\n`);
    const warnings = await sw.evaluate(
      (m) => chrome.management.getPermissionWarningsByManifest(m),
      manifestText
    );
    process.stdout.write(JSON.stringify(warnings) + '\n');
  } catch (e) {
    // Not fail(): exiting here would skip the cleanup in finally.
    process.stderr.write(`verify-permissions: probe failed: ${e && e.message ? e.message : e}\n`);
    process.exitCode = 1;
  } finally {
    if (ctx) await ctx.close().catch(() => {});
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main();
