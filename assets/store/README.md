# Chrome Web Store and promo images

Every image here is a designed frame around a **real capture** of the Natural TTS 1.5.0 popup, connected to the real
helper 1.5.0 (Kokoro-82M on MLX). Nothing in the popup is mocked or redrawn. The frames come from the HTML templates in
`scripts/capture/cws/`, rendered headless at DPR 1 and checked for size. Each screenshot is also checked at 640×400,
the size the store shows it.

**Look.** A light, indigo-tinted surface (`#F4F5FE`). Deep-ink serif headlines (`#1B2060`, Iowan Old Style, the demo
article's own reading face) and the system sans for the rest. The popup is the one object on the page. The promo images
invert this: they use the icon's tile gradient (`#5B6CF3` → `#3441C6`) with white type, and the icon's three sound arcs
continue outward as a faint motif. Palette: `assets/brand/README.md`.

## Slots

| Store field | File | Size | Bytes | Headline / content | State |
|---|---|---|---|---|---|
| Screenshot 1 | `screenshot-1-right-click.png` | 1280×800 | — | **"Select text. Right-click. Listen."** The native context menu over the demo article, with "Speak selected text" highlighted | **Waiting for the GUI pass.** The native menu has no headless equivalent. The template is `cws/shot1.html`, and it needs `src/contextmenu-crop.png` (`scripts/capture/GUI_PASS.md`) |
| Screenshot 2 | `screenshot-2-voices.png` | 1280×800 | 115,446 | **"Natural voices, at your speed."** Emma (UK) is speaking at 1.3×: "Speaking your selection…", "Kokoro · Emma (UK)", Stop. The counts (20 American English: 11 female, 9 male; 8 British English: 4 female, 4 male) are the live popup's four voice groups (`src/voice-groups.json`) | Done |
| Screenshot 3 | `screenshot-3-on-device.png` | 1280×800 | 133,529 | **"Made on your Mac. Not in the cloud."** A "Your Mac" boundary around Chrome → 127.0.0.1 → Natural TTS helper (Kokoro-82M) → Apple GPU (MLX), beside the popup with Heart (US) speaking | Done |
| Screenshot 4 | `screenshot-4-no-helper.png` | 1280×800 | 125,809 | **"Works without the helper, too."** The popup with no helper: Offline, "a system voice will read your selection", the Homebrew install hint, and "System voice" in the voice box (the top 330 CSS px of `assets/media/fallback.png`). This **replaces "PDFs too, with ligatures fixed"** (see below) | Done |
| Screenshot 5 | `screenshot-5-setup.png` | 1280×800 | 121,758 | **"Install once. It's always ready."** The Homebrew one-liner as two commands (`brew install renchris/tap/natural-tts`, `brew services start natural-tts`), the connected popup (Heart, 1.0×), and the fallback line "Until then, a voice built into your Mac reads instead." | Done. The tap is the planned install path and is not published yet; publish it before the listing goes live |
| Small promo tile | `small-tile-440x280.png` | 440×280 | 54,325 | No text. The icon's white glyph, with its arcs continuing outward | Done |
| Marquee promo tile | `marquee-1400x560.png` | 1400×560 | 255,755 | The icon and the "Natural TTS" wordmark, the tagline "Private, on-device voices", and the popup (Emma speaking) rising out of the frame | Done |
| Promo video thumbnail (YouTube) | `youtube-thumbnail-1280x720.png` | 1280×720 | 302,747 | **"Natural voices. On your Mac."** plus "Kokoro text-to-speech for Chrome." and the popup (Emma speaking). Checked legible at 320×180 | Done. The video itself waits for the GUI pass |
| GitHub social preview (repo settings) | `../brand/social-preview.png` | 1280×640 | 266,932 | The icon and wordmark, "Private Kokoro voices for Mac", "Select text in Chrome and hear it read aloud. The speech is made on your Mac.", and the popup | Done. Uploading it is a repo setting, so it stays manual |

All files are 24-bit sRGB PNGs with no alpha and no metadata chunks. They are written with zlib level 9 and adaptive
filtering; this machine has no oxipng or pngquant, and lossy quantisation would soften the popup text. Square corners
and full bleed, as the store asks. The listing icon is `assets/brand/icon-512.png`, and `chrome-extension/public/icons/icon128.png` is the
128 px store icon.

**Recommended upload order:** the store shows screenshot 1 first. Until the GUI pass fills it, upload 2, 3, 5 and 4 in
that order. That leads with the voice, then privacy, then setup, then the fallback. Put the right-click shot first once
it exists.

## Why screenshot 4 is not the PDF shot

The brief was: first verify the PDF path on Chrome for Testing 153, and replace the shot if it cannot be shown truthfully.
The check was run headless on 2026-09-24, with CfT 153.0.8010.12 and the extension from this tree:

- **The selection works.** `https://essays.example/article.pdf` (`assets/media/src/article.pdf`) was opened in Chrome's
  PDF viewer. The viewer frame's own plugin controller was driven over CDP (`selectAll()`, then `getSelectedText()`,
  the text a right-click hands the extension as `info.selectionText`). It returned 1,182 characters, and the scene's
  sentence was verbatim, apart from one line break where the PDF line wraps.
- **It speaks.** That exact string was sent through the extension's offscreen document to the real helper on 8250. The
  helper made 7.65 s of af_heart audio, the same length as `assets/media/src/audio/s4-pdf.wav`.
- **"With ligatures fixed" cannot be shown.** The selected text had **0** code points in U+FB00–FB06. Skia's ToUnicode
  map already turns the fi/fl/ffi glyphs back into plain letters, so the extension's ligature cleanup has nothing to do
  on this PDF. The headline would claim a fix the image cannot demonstrate.
- **Not verified (needs a display):** that the native menu shows "Speak selected text" inside the PDF viewer, and that
  clicking it speaks. This is in `scripts/capture/GUI_PASS.md`.

Screenshot 4 therefore shows the system-voice fallback (OD-2), a behaviour the image *can* prove. Screenshot 2 covers
the "28 voices, American and British" story.

## Known product defects visible in these images

These are in `chrome-extension/` and were left as they are, because the images must show the real UI. Fix them, then
re-run the two commands below, which rebuild every image here byte for byte from the new captures:

1. **Screenshot 4:** the install command wraps between the two ampersands ("…natural-tts &" / "& brew services…"),
   because `.fallback-notice code` uses `word-break: break-all`.
2. **Every popup** uses a `#0B6BE0`-like blue for the Speak button, the slider and the speed value, not the brand accent
   `#3D4ED7` that `assets/brand/README.md` says it shares.
3. The Retry Connection button has no `.secondary-button` style. It is below the crop in screenshot 4, but visible in
   `assets/media/fallback.png`.

## Regenerate

```bash
# 1. Real captures (headless; a real helper on 8250 started with overrides, so config.json is never written)
PY=<main checkout>/native-helper/Sources/NaturalTTSHelper/Resources/python-env/bin/python3
nohup native-helper/.build/release/natural-tts-helper --port 8250 --python "$PY" \
  --worker "$PWD/native-helper/Sources/NaturalTTSHelper/Resources/tts_worker.py" </dev/null >/tmp/helper.log 2>&1 &
HEADLESS=1 scripts/capture/launch.sh /tmp/ntts-cap 8250
scripts/capture/cws/capture-inputs.sh /tmp/ntts-cap assets/store/src 8250   # popup-*-speaking.png, voice-groups.json
# assets/media/popup.png and fallback.png: scripts/capture/README.md, "Headless capture"
# 2. Every image in this directory, plus assets/brand/social-preview.png, with 640x400 proofs in /tmp/ntts-cws-proofs
scripts/capture/cws/render.sh
```

Then stop only the pids in `/tmp/ntts-cap/env.txt` and the helper you started.

`src/` holds the committed inputs: the two popup captures below and `voice-groups.json`.

| Input | File | Size |
|---|---|---|
| The popup with Emma (UK) speaking at 1.3× (360×440 CSS at 2x) | `src/popup-emma-speaking.png` | 720×880 |
| The popup with Heart (US) speaking at 1.0× (360×440 CSS at 2x) | `src/popup-heart-speaking.png` | 720×880 |

`scripts/verify-all.sh docs` checks every image in this directory against the Size column of these two tables.

**How the speaking state is made.** The service worker sends its offscreen document the same `SPEAK_IN_OFFSCREEN` message that the right-click handler sends. The text is the demo article's paragraph 2. The
offscreen document fetches real audio from the helper's `/speak` and plays it. The popup, opened during playback, shows
what it reports. Only the native menu click is skipped, because it needs a display. Every request went to
`127.0.0.1:8250` through `scripts/capture/port-guard.mjs`: 37 requests were logged, none to any other port.
