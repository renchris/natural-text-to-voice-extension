/**
 * Version skew between the extension and the helper.
 */

import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  HELPER_INSTALL_COMMAND,
  HELPER_SOURCE_URL,
  HELPER_UPDATE_COMMAND,
  MIN_HELPER_API_VERSION,
  helperNeedsUpdate,
} from '../src/shared/helper-version';

describe('helperNeedsUpdate', () => {
  test('a helper without apiVersion (pre-v1.5) needs an update', () => {
    expect(helperNeedsUpdate({})).toBe(true);
    expect(helperNeedsUpdate({ apiVersion: undefined })).toBe(true);
  });

  test('apiVersion below 2 needs an update', () => {
    expect(MIN_HELPER_API_VERSION).toBe(2);
    expect(helperNeedsUpdate({ apiVersion: 1 })).toBe(true);
    expect(helperNeedsUpdate({ apiVersion: 0 })).toBe(true);
  });

  test('apiVersion 2 or later does not', () => {
    expect(helperNeedsUpdate({ apiVersion: 2 })).toBe(false);
    expect(helperNeedsUpdate({ apiVersion: 3 })).toBe(false);
  });

  test('a malformed apiVersion is treated as missing', () => {
    expect(helperNeedsUpdate({ apiVersion: Number.NaN })).toBe(true);
    expect(helperNeedsUpdate({ apiVersion: '2' as unknown as number })).toBe(true);
  });

  test('install and update go through Homebrew (OD-1), with the README for source installs', () => {
    expect(HELPER_INSTALL_COMMAND).toBe('brew install renchris/tap/natural-tts && brew services start natural-tts');
    expect(HELPER_UPDATE_COMMAND).toBe('brew upgrade natural-tts && brew services restart natural-tts');
    expect(HELPER_SOURCE_URL).toBe('https://github.com/renchris/natural-text-to-voice-extension#install');
  });
});

/** GitHub's heading anchor: lower case, punctuation dropped, spaces to hyphens. */
function githubSlug(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s/g, '-');
}

/** Heading anchors of a Markdown file, skipping fenced code (a "# comment" in a bash block is no heading). */
function headingAnchors(markdown: string): Set<string> {
  const anchors = new Set<string>();
  let fenced = false;
  for (const line of markdown.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    else if (!fenced) {
      const heading = /^#{1,6}\s+(.*)$/.exec(line);
      if (heading) anchors.add(githubSlug(heading[1]));
    }
  }
  return anchors;
}

describe('the source-install link', () => {
  const repoRoot = join(import.meta.dir, '..', '..');

  test('HELPER_SOURCE_URL points at a heading the root README has', () => {
    const url = new URL(HELPER_SOURCE_URL);
    expect(url.pathname).toBe('/renchris/natural-text-to-voice-extension');
    const anchor = decodeURIComponent(url.hash.slice(1));
    expect(anchor.length).toBeGreaterThan(0);
    expect(headingAnchors(readFileSync(join(repoRoot, 'README.md'), 'utf8')).has(anchor)).toBe(true);
  });

  test('popup.html links to the same URL before popup.ts sets it', () => {
    const html = readFileSync(join(repoRoot, 'chrome-extension', 'src', 'popup', 'popup.html'), 'utf8');
    const hrefs = [...html.matchAll(/href="(https:\/\/github\.com\/[^"]*)"/g)].map(m => m[1]);
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) expect(href).toBe(HELPER_SOURCE_URL);
  });
});
