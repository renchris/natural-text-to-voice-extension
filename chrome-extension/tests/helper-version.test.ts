/**
 * Version skew between the extension and the helper.
 */

import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  HELPER_BREW_UPDATE_COMMAND,
  HELPER_INSTALL_COMMAND,
  HELPER_SOURCE_UPDATE_COMMAND,
  HELPER_SOURCE_UPDATE_URL,
  HELPER_SOURCE_URL,
  MIN_HELPER_API_VERSION,
  helperNeedsUpdate,
  helperUpdate,
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

  test('install goes through Homebrew (OD-1), with the README for source installs', () => {
    expect(HELPER_INSTALL_COMMAND).toBe('brew install renchris/tap/natural-tts && brew services start natural-tts');
    expect(HELPER_SOURCE_URL).toBe('https://github.com/renchris/natural-text-to-voice-extension#install');
  });
});

describe('helperUpdate', () => {
  test('a pre-1.5 helper (no apiVersion) was installed from source: the source update, never brew upgrade', () => {
    for (const health of [{}, { apiVersion: undefined }, { apiVersion: Number.NaN }]) {
      const update = helperUpdate(health);
      expect(update).toEqual({ fromSource: true, command: HELPER_SOURCE_UPDATE_COMMAND, url: HELPER_SOURCE_UPDATE_URL });
      expect(update.command).not.toContain('brew');
    }
    expect(HELPER_SOURCE_UPDATE_COMMAND).toBe('git pull && native-helper/Scripts/quickstart.sh');
  });

  test('a helper reporting an older apiVersion can be a Homebrew install: brew upgrade', () => {
    expect(helperUpdate({ apiVersion: 1 })).toEqual({
      fromSource: false,
      command: HELPER_BREW_UPDATE_COMMAND,
      url: HELPER_SOURCE_URL,
    });
    expect(HELPER_BREW_UPDATE_COMMAND).toBe('brew upgrade natural-tts && brew services restart natural-tts');
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

  test('HELPER_SOURCE_URL and HELPER_SOURCE_UPDATE_URL point at headings the root README has', () => {
    const anchors = headingAnchors(readFileSync(join(repoRoot, 'README.md'), 'utf8'));
    for (const link of [HELPER_SOURCE_URL, HELPER_SOURCE_UPDATE_URL]) {
      const url = new URL(link);
      expect(url.pathname).toBe('/renchris/natural-text-to-voice-extension');
      const anchor = decodeURIComponent(url.hash.slice(1));
      expect(anchor.length).toBeGreaterThan(0);
      expect(anchors.has(anchor)).toBe(true);
    }
  });

  test('popup.html links to the same URL before popup.ts sets it', () => {
    const html = readFileSync(join(repoRoot, 'chrome-extension', 'src', 'popup', 'popup.html'), 'utf8');
    const hrefs = [...html.matchAll(/href="(https:\/\/github\.com\/[^"]*)"/g)].map(m => m[1]);
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) expect(href).toBe(HELPER_SOURCE_URL);
  });
});
