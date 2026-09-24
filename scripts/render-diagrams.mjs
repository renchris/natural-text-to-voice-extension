#!/usr/bin/env bun
// Render assets/diagrams/*.mmd → <name>-dark.svg / <name>-light.svg with
// beautiful-mermaid (the ELK-based engine behind Cursor's agent panel).
//
// Usage:  bun run diagrams          (re)render every SVG and sync README fences
//         bun run diagrams:check    exit 1 if a committed SVG or fence is stale (CI)
//
// Diagrams render transparent on GitHub's exact dark/light palettes and are
// embedded via <picture> + prefers-color-scheme. To change one: edit its .mmd,
// run `bun run diagrams`, commit the .mmd and both SVGs together.
//
// Layout depends on elkjs, which beautiful-mermaid takes with a caret range, so
// the committed bun.lock is what keeps the check byte-stable: install with
// `bun install --frozen-lockfile`.
//
// Semantic colours: classDef lines in a .mmd use @tokens (fill:@chrome-bg),
// substituted per variant from PALETTE, so one source renders with hand-tuned
// colours on both GitHub colour modes.
//
// Adapted from agent-secrets/scripts/render-diagrams.mjs with three changes
// (docs/research/2026-09-upgrade/R08-readme-visual-craft.md §1.4, §1.6):
//   1. no decodeEntities(): beautiful-mermaid >= 1.0.0 decodes XML entities
//      itself, so decoding first turned an intended literal "&lt;" into "<";
//   2. every font @import is stripped (/gm), not only the first;
//   3. the GitHub font stack is swapped in after rendering, never passed as
//      `font:` (the library would quote the whole stack as one family name).
import { renderMermaidSVG, THEMES } from 'beautiful-mermaid'
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const DIR = join(ROOT, 'assets/diagrams')
const CHECK = process.argv.includes('--check')

// The measured width of GitHub's README column at 1280/1440/1920 px viewports
// (R08 §2.2). A wider SVG is scaled down, and its 13 px labels shrink with it.
const MAX_WIDTH = 838

// Brand indigo (assets/brand/README.md: accent #3D4ED7, deep ink #1B2060,
// light surface #F4F5FE) marks what runs inside Chrome; green marks what runs
// on the Mac; amber marks the degraded paths; gray the neutral ones.
const PALETTE = {
  dark: {
    text: '#e6edf3',
    muted: '#8b949e',
    'chrome-bg': '#1b2060', 'chrome-fg': '#8f9cff',
    'mac-bg': '#12261a', 'mac-fg': '#3fb950',
    'warn-bg': '#2b2410', 'warn-fg': '#e3b341',
    'red-bg': '#2b1618', 'red-fg': '#ff7b72',
    'gray-bg': '#161b22', 'gray-fg': '#6e7681',
  },
  light: {
    text: '#1f2328',
    muted: '#59636e',
    'chrome-bg': '#f4f5fe', 'chrome-fg': '#3d4ed7',
    'mac-bg': '#dafbe1', 'mac-fg': '#1a7f37',
    'warn-bg': '#fff8c5', 'warn-fg': '#9a6700',
    'red-bg': '#ffebe9', 'red-fg': '#cf222e',
    'gray-bg': '#f6f8fa', 'gray-fg': '#59636e',
  },
}

const VARIANTS = [
  ['dark', THEMES['github-dark']],
  ['light', THEMES['github-light']],
]

function applyPalette(src, variant) {
  return src.replace(/@([a-z][a-z0-9-]*)/g, (match, token) => {
    const value = PALETTE[variant][token]
    if (!value) throw new Error(`unknown palette token ${match}`)
    return value
  })
}

// GitHub serves README images through a proxy that blocks external loads, so
// the Google-Fonts @import can never resolve there. Strip every one and pin
// GitHub's own font stack. Text width was estimated font-agnostically at
// layout time, so the swap cannot clip a label.
const GITHUB_FONTS =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif'
function githubReady(svg) {
  return svg
    .replace(/^\s*@import url\([^\n]*\);\s*$\n?/gm, '')
    .replaceAll("'Inter', system-ui, sans-serif", GITHUB_FONTS)
}

function svgWidth(svg) {
  const m = svg.match(/<svg[^>]*\swidth="([\d.]+)"/)
  return m ? Number(m[1]) : NaN
}

// Markdown files may carry a native ```mermaid fence inside a <details> block,
// the interactive fallback (zoom, pan, selectable text on github.com). Each
// fence body is synced from the .mmd its marker names, with the dark palette
// baked in (native mermaid cannot switch per colour mode). Marker paths are
// repo-root-relative. A file with no markers is left untouched.
const FENCE_RE =
  /(<!-- mermaid-fence: (\S+) \(auto-synced by `bun run diagrams`\) -->\n```mermaid\n)([\s\S]*?)(```)/g
function markdownFiles() {
  const files = ['README.md']
  for (const dir of ['docs', 'chrome-extension', 'native-helper']) {
    const abs = join(ROOT, dir)
    if (!existsSync(abs)) continue
    for (const f of readdirSync(abs)) if (f.endsWith('.md')) files.push(join(dir, f))
  }
  return files.filter((f) => existsSync(join(ROOT, f)))
}
function syncFences() {
  const changed = []
  for (const rel of markdownFiles()) {
    const path = join(ROOT, rel)
    const text = readFileSync(path, 'utf8')
    const updated = text.replace(FENCE_RE, (_m, head, src, _body, tail) => {
      const mmd = join(ROOT, src)
      if (!existsSync(mmd)) throw new Error(`${rel}: mermaid-fence names a missing source ${src}`)
      return head + applyPalette(readFileSync(mmd, 'utf8'), 'dark') + tail
    })
    if (updated === text) continue
    changed.push(rel)
    if (!CHECK) writeFileSync(path, updated)
  }
  return changed
}

const sources = readdirSync(DIR).filter((f) => f.endsWith('.mmd')).sort()
if (sources.length === 0) {
  console.error(`no .mmd sources found in ${DIR}`)
  process.exit(1)
}

let stale = 0
let tooWide = 0
for (const file of sources) {
  const src = readFileSync(join(DIR, file), 'utf8')
  for (const [variant, theme] of VARIANTS) {
    const out = file.replace(/\.mmd$/, `-${variant}.svg`)
    const svg = githubReady(renderMermaidSVG(applyPalette(src, variant), { ...theme, transparent: true }))
    const width = svgWidth(svg)
    if (!(width <= MAX_WIDTH)) {
      console.error(`TOO WIDE: ${out} is ${width} px; the README column is ${MAX_WIDTH} px`)
      tooWide++
    }
    const path = join(DIR, out)
    if (CHECK) {
      const current = existsSync(path) ? readFileSync(path, 'utf8') : null
      if (current !== svg) {
        console.error(`STALE: ${out} does not match ${file}; run \`bun run diagrams\``)
        stale++
      }
    } else {
      writeFileSync(path, svg)
      console.log(`rendered ${out} (${Math.round(width)} px, ${(svg.length / 1024).toFixed(1)} KB)`)
    }
  }
}

const fences = syncFences()
if (CHECK) {
  for (const rel of fences) {
    console.error(`STALE: mermaid fence(s) in ${rel} do not match their .mmd; run \`bun run diagrams\``)
    stale++
  }
  if (stale || tooWide) process.exit(1)
  console.log(`all ${sources.length * VARIANTS.length} SVGs and mermaid fences up to date`)
} else {
  for (const rel of fences) console.log(`synced mermaid fence(s) in ${rel}`)
  if (tooWide) process.exit(1)
}
