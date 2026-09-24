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
| Screenshot 1 | `screenshot-1-right-click.png` | 1280×800 | 205,812 | **"Select text. Right-click. Listen."** The native macOS context menu over the demo article (`https://essays.example/article.html`), paragraph 2 selected, "Speak selected text" highlighted by a real cursor hover. Sub-line: "A Kokoro voice starts in a second or two", measured in the GUI pass (a right-clicked sentence is audible 1.4–1.6 s after the click, a whole paragraph 2.4 s; it said "about a second" before) | Done (GUI pass, 2026-09-24): `src/contextmenu-crop.png`, a 560×660 CSS px crop at 2x of the headed CfT 153 window, converted to sRGB |
| Screenshot 2 | `screenshot-2-voices.png` | 1280×800 | 136,883 | **"Natural voices, at your speed."** Emma (UK) is speaking at 1.3×: "Speaking your selection…", "Kokoro · Emma (UK)", Stop, with a lens (2.4× CSS) on the first two so they read at 640×400. The counts (20 American English: 11 female, 9 male; 8 British English: 4 female, 4 male) are the live popup's four voice groups (`src/voice-groups.json`) | Done |
| Screenshot 3 | `screenshot-3-on-device.png` | 1280×800 | 154,981 | **"Made on your Mac. Not in the cloud."** A "Your Mac" boundary around Chrome → 127.0.0.1 → Natural TTS helper (Kokoro-82M) → Apple GPU (MLX), beside the popup with Heart (US) speaking and a lens on "Kokoro · Heart (US)" | Done |
| Screenshot 4 | `screenshot-4-no-helper.png` | 1280×800 | 130,261 | **"Works without the helper, too."** The popup with no helper: Offline, "a system voice will read your selection" and the Homebrew install hint, shown at 1.9× CSS (the top of `assets/media/fallback.png`), the cut fading into the page. This **replaces "PDFs too, with ligatures fixed"** (see below) | Done |
| Screenshot 5 | `screenshot-5-setup.png` | 1280×800 | 130,821 | **"Install once. It's always ready."** "Two Homebrew commands set up the helper and start it at login." over the two commands (`brew install renchris/tap/natural-tts`, `brew services start natural-tts`), the connected popup (Heart, 1.0×) with a lens on its Connected pill, and the fallback line "Until then, a voice built into your Mac reads instead." | Done. The tap is the planned install path and is not published yet; publish it before the listing goes live |
| Small promo tile | `small-tile-440x280.png` | 440×280 | 60,516 | The icon's white glyph, its arcs continuing outward, and the "Natural TTS" wordmark, so the tile names the product in a carousel | Done |
| Marquee promo tile | `marquee-1400x560.png` | 1400×560 | 256,554 | The icon (with a thin white ring, so it separates from the background) and the "Natural TTS" wordmark, the tagline "Private, on-device voices", and the popup (Emma speaking) rising out of the frame | Done |
| Promo video thumbnail (YouTube) | `youtube-thumbnail-1280x720.png` | 1280×720 | 303,285 | **"Natural voices. On your Mac."** plus "Kokoro text-to-speech for Chrome." and the popup (Emma speaking). Checked legible at 320×180 | Done. The video itself waits for the GUI pass |
| GitHub social preview (repo settings) | `../brand/social-preview.png` | 1280×640 | 267,653 | The icon and wordmark, "Private Kokoro voices for Mac", "Select text in Chrome and hear it read aloud. The speech is made on your Mac.", and the popup | Done. Uploading it is a repo setting, so it stays manual |

All files are 24-bit sRGB PNGs with no alpha and no metadata chunks. They are written with zlib level 9 and adaptive
filtering; this machine has no oxipng or pngquant, and lossy quantisation would soften the popup text. Square corners
and full bleed, as the store asks. The Chrome Web Store icon is `chrome-extension/public/icons/icon128.png` (128×128,
`docs/publishing/CHROME_WEB_STORE.md` §2.2); `assets/brand/icon-512.png` is for the README and other listings.

**Recommended upload order:** 1, 2, 3, 5, 4. The store shows screenshot 1 first, so the listing leads with the gesture
(right-click, speak), then the voice, privacy, setup, and the fallback last.

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
- **The native menu, checked with a display (GUI pass, 2026-09-24): PASS.** In headed CfT 153, paragraph 2 of
  `article.pdf` was drag-selected in Chrome's PDF viewer and right-clicked. The viewer's own native menu (it carries
  "Rotate Clockwise" and "Rotate Counterclockwise") lists **"Speak selected text"**. A real click on it made the
  extension's offscreen document send `GET /health` and `POST /speak` to the capture helper on 127.0.0.1:8251 (the port
  guard's log; nothing else left the browser), and a live-audio recording of the take (`sckrec --exclude-others`) has
  speech starting 2.28 s after the click frame and still playing when the 21 s take ended (paragraph 2 is 15.6 s of
  audio). The 2.28 s includes a cold start: the extension's service worker had idled out and was restarted by the click.

Screenshot 4 therefore shows the system-voice fallback (OD-2), a behaviour the image *can* prove. Screenshot 2 covers
the "28 voices, American and British" story.

## Product defects these images used to show (fixed 2026-09-24)

The first render showed three popup defects. They were fixed in `chrome-extension/`, and every image here was then
re-captured and re-rendered with the commands below:

1. The install command wrapped between the two ampersands ("…natural-tts &" / "& brew services…"), because
   `.fallback-notice code` used `word-break: break-all`. It now wraps only after `&&`.
2. Every popup rendered `#076BE3` (`oklch(0.55 0.20 258)` from an `@supports` override in `variables.css`) instead of
   the brand accent `#3D4ED7`. The override is gone, so the popup and the icon match.
3. The Retry connection button had no `.secondary-button` style. It is now an outline button with a refresh icon.

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
#    (pass a third argument for a private proof directory when another session may render at the same time)
scripts/capture/cws/render.sh
```

Then stop only the pids in `/tmp/ntts-cap/env.txt` and the helper you started.

`src/` holds the committed inputs: the two popup captures, the context-menu crop below, and `voice-groups.json`.

| Input | File | Size |
|---|---|---|
| The popup with Emma (UK) speaking at 1.3× (360×440 CSS at 2x) | `src/popup-emma-speaking.png` | 720×880 |
| The popup with Heart (US) speaking at 1.0× (360×440 CSS at 2x) | `src/popup-heart-speaking.png` | 720×880 |
| The native context menu over the article, "Speak selected text" highlighted (560×660 CSS at 2x, GUI pass) | `src/contextmenu-crop.png` | 1120×1320 |

`scripts/verify-all.sh docs` checks every image in this directory against the Size column of these two tables.

**How the speaking state is made.** The service worker sends its offscreen document the same `SPEAK_IN_OFFSCREEN` message that the right-click handler sends. The text is the demo article's paragraph 2. The
offscreen document fetches real audio from the helper's `/speak` and plays it. The popup, opened during playback, shows
what it reports. Only the native menu click is skipped, because it needs a display. Every request went to
`127.0.0.1:8250` through `scripts/capture/port-guard.mjs`: 37 requests were logged, none to any other port.
