# Natural TTS — brand assets

Icon for **Natural TTS: Private Kokoro Voices for Mac** (operator ruling OD-10): a white speaker with sound
arcs on an indigo continuous-corner tile. It reads as "read aloud / voice", and the Mac-style tile hints at
"runs on your Mac". The icon contains no text.

![icon](icon-512.png)

## Files

| File | What it is |
|---|---|
| `icon.svg` | **Vector master.** 128×128 canvas, 96×96 tile at (16,16), 16 px transparent padding, three arcs. Source of `icon128.png` and `icon-512.png` |
| `icon-48.svg` | Hand-tuned 48 px variant: 44×44 tile at (2,2), two arcs, speaker edges and arc middles on whole pixels |
| `icon-32.svg` | Hand-tuned 32 px variant: the 16 px toolbar icon at 2× (Retina), full-canvas tile, two 3 px arcs on whole columns |
| `icon-16.svg` | Hand-tuned 16 px toolbar variant: full-canvas tile, speaker on whole pixels, two flat 2 px arcs with a 1 px gap |
| `render-icons.sh` | Regenerates every PNG below from the SVGs, verifies them, and rebuilds the contact sheet |
| `icon-512.png` | 512 px render of the master, for listings and the README |
| `icon-contact-sheet.png` | Every size, 1× and zoomed, on Chrome's light (`#ffffff`, `#f1f3f4`) and dark (`#202124`, `#35363a`) toolbar colours |
| `../../chrome-extension/public/icons/icon{16,32,48,128}.png` | The shipped extension icons |

`icon32.png` is rendered, but the manifest does not reference it yet. Add `"32": "icons/icon32.png"` to both
`icons` and `action.default_icon` in `chrome-extension/public/manifest.json`, so Retina toolbars use the tuned
32 px file instead of downscaling the 48.

## Palette

The store tiles, marquee and screenshots reuse this palette. The accent is the extension UI's existing
`--color-primary` (`chrome-extension/src/shared/variables.css`), so the icon and the popup match.

| Role | Hex | Notes |
|---|---|---|
| Accent (UI primary) | `#3D4ED7` | The flat brand colour. Use it where a gradient is not possible |
| Tile gradient, top | `#5B6CF3` | Vertical linear gradient, top to bottom |
| Tile gradient, bottom | `#3441C6` | |
| Glyph | `#FFFFFF` | Contrast against the tile is 4.3:1 at the top and 7.7:1 at the bottom |
| Deep ink (text on light tiles) | `#1B2060` | Indigo-tinted near-black for headlines on light backgrounds |
| Light surface (tile backgrounds) | `#F4F5FE` | Indigo-tinted off-white |

On dark toolbars the tile's luminance contrast is low (2.1–3.7:1 against `#202124`, 1.6–2.8:1 against
`#35363a`). Instead, the tile separates from those greys by saturation: a saturated indigo against a
neutral. The contact sheet confirms it stays distinct, so no outer glow is needed.

## Geometry

- **Tile:** a continuous-corner ("squircle") square. Each corner is a single cubic Bézier that starts
  0.34 × side from the corner, with handles 0.75 × that distance. That is close to the macOS app-icon mask.
- **Glyph (master):** a speaker (body plus cone, 4 px round-join stroke) and three 6 px round-capped arcs
  (r = 13, 24, 35, centred on the cone mouth). The glyph is scaled to 92% and shifted 1 px right, to
  offset the speaker's left-heavy mass.
- **Small sizes:** every size is drawn separately rather than downscaled. The 48, 32 and 16 drop to two
  arcs and snap the speaker edges and the arcs' vertical middles to whole pixels. The 48 and 32 inset the
  speaker by 0.5 px and use a 1 px round-join stroke, which keeps its straight edges on whole pixels and
  softens its corners.
- **Chrome Web Store spec (128):** 128×128 PNG with an alpha channel, 96×96 artwork, and a fully
  transparent 16 px border. `render-icons.sh` asserts all of this on every run.

## Regenerate

```bash
assets/brand/render-icons.sh
```

Requirements: ImageMagick 7 (`magick`) and a headless Chrome. The script finds Playwright's Chrome for Testing
headless shell under `~/Library/Caches/ms-playwright/`, or uses the path in `CHROME=`. Chrome (Skia) rasterizes
the SVGs, because ImageMagick's built-in SVG renderer anti-aliases thin arcs poorly. ImageMagick strips the
PNG metadata chunks and builds the contact sheet. With the same Chrome build, a re-run produces
byte-identical files.

The script fails if any PNG has the wrong size or no alpha channel. It also fails if the 128's outer 16 px
contain any non-transparent pixel, or if its artwork does not fill exactly `96x96+16+16`.
