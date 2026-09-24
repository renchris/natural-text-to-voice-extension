# Media provenance

Every sound in the Natural TTS README and store media is real output of the Natural TTS helper, for the exact
text shown on screen, in the voice and at the speed shown on screen. Nothing is re-voiced, edited or
synthesised any other way. This file records how each clip was made, so anyone can check it and remake it.

## Demo content

| File | What it is |
|---|---|
| `src/article.html` | The demo web page, "The Long Habit of Reading Aloud". Original prose written for this project, byline "Natural TTS demo". No third-party text, images, trademarks or web fonts (system fonts only: Iowan Old Style for the body, the system sans for labels), so it renders the same offline |
| `src/article.pdf` | The same article as a one-page US Letter PDF, printed by Chrome's own PDF printer (`src/render-pdf.sh`: chrome-headless-shell 153, Skia/PDF m153). The body text is set with real ligature glyphs: "fl" in *flicker* and *flows*, "fi" in *finishing* and *fills*, "ffi" in *difficult* (5 in all, counted by the script). Skia's text layer maps each glyph back to plain letters |
| `src/selections.json` | The exact text of every clip, with its voice, speed and the scene it is for |
| `src/make-audio.mjs` | Launches its own helper, speaks every selection through `POST /speak`, saves each response body unmodified, and writes `src/audio/manifest.json` (duration, format, sha256, identity). `--check` confirms, with no helper, that every text is still verbatim in the article and every WAV still matches the manifest |

## Clips

Common to every clip:

- **Model:** `prince-canuma/Kokoro-82M` at pinned revision `e02c9eada7ce7416798af36b190a8a2dd2ecd566` (MLX, Apache-2.0)
- **Runtime:** Natural TTS helper 1.5.0, built from git `9186b17fac62b0a35faee148b99c4a7874d178a3` with
  `swift build -c release`, clean tree; Python worker with mlx 0.32.2 and mlx-audio 0.5.5
- **Machine:** Apple M1 Max, macOS 15.7.9
- **Date:** 2026-09-24 04:54 UTC (2026-09-23 local)
- **Format:** WAV, 24 kHz, mono, 16-bit PCM, exactly as the helper returned it
- **Request:** `POST http://127.0.0.1:<port>/speak` with `{"text", "voice", "speed"}`, one clip per request

| Clip | Voice | Speed | Length | Exact text | Used in |
|---|---|---|---|---|---|
| `src/audio/hero.wav` | `af_heart` (Heart, US) | 1.0× | 15.58 s | Reading aloud never really left us. It moved into kitchens and classrooms, into the flicker of a bedside lamp, into the patient voice of a parent finishing one more chapter. A story spoken is a story shared, and the listener fills in the rest. | README hero video: the whole second paragraph is selected, right-click, "Speak selected text" |
| `src/audio/s1-rightclick.wav` | `af_heart` | 1.0× | 5.78 s | The silent reader, eyes moving and lips still, was once rare enough to be remarked upon. | Store video, scene 2 (right-click on the article) |
| `src/audio/s2-british.wav` | `bf_emma` (Emma, UK) | 1.0× | 7.13 s | Scribes murmured as they copied, and a letter that arrived in a village was often read to everyone who gathered to hear it. | Store video, scene 3a (a British voice chosen in the popup) |
| `src/audio/s3-speed.wav` | `bf_emma` | 1.3× | 3.78 s | Listening turned long shifts into something closer to a shared education. | Store video, scene 3b (speed raised to 1.3× in the popup) |
| `src/audio/s4-pdf.wav` | `af_heart` | 1.0× | 7.65 s | A voice gives a page its pace, lets tired eyes rest, and turns a difficult paragraph into one that simply flows. | Store video, scene 4 (the same sentence selected in `article.pdf`; the selection crosses the "ffi" and "fl" ligatures, and this is the text the extension sends once ligatures are expanded) |
| `src/audio/s5-offline.wav` | `af_heart` | 1.0× | 6.98 s | The tools keep changing, from the lectern to the radio to the speaker on a desk, but the pleasure stays the same. | Store video, scene 5 (speaking again with no network connection) |

The sha256 of each committed file is in `src/audio/manifest.json`. Kokoro draws random phase, so a re-run
sounds the same but is not byte-identical; the manifest identifies these particular takes.

**Checked after generation.** A local speech recogniser (Parakeet TDT 0.6B v3 in whisper.cpp 1.9.1)
transcribed all six clips back to their exact text, word for word and with the same punctuation. Peak levels
are −5.1 to −8.7 dBFS (no clipping); each clip ends in 0.44–0.74 s of silence.

## How each video's audio is produced

The screen is recorded without its audio track (`scripts/capture/sckrec`, inclusion filter). The clip above
for that scene is then muxed in at the moment the driver clicked "Speak selected text", with the offset set by
cross-correlating the clip against a live recording of the same take (research measured a constant lag of
+0.93–1.00 s between click and sound). The audio stream is re-encoded to AAC for MP4 and never otherwise
changed: no music, no gain edits, no cuts inside a clip. See `scripts/capture/README.md` and
`docs/research/2026-09-upgrade/UPGRADE_RESEARCH.md` §12.

- **README hero MP4:** `hero.wav` only.
- **Store / YouTube video:** `s1-rightclick.wav`, `s2-british.wav`, `s3-speed.wav`, `s4-pdf.wav`,
  `s5-offline.wav` in that order, each under its own scene; title and end cards are silent. (As of step 3 the
  PDF scene gives way to a live system-voice fallback scene, so `s4-pdf.wav` is unused; `s5-offline.wav` goes under
  the privacy scene, which never touches Wi-Fi. Spec: `scripts/capture/GUI_PASS.md` item 4.)
- **Silent GIF loops and still images:** no audio.

When a finished video is produced, add a line here naming the video file, the clips it uses and their
offsets.

**Caveat on the PDF scene (checked 2026-09-24).** `article.pdf` does not, on its own, demonstrate the ligature fix:
Skia writes a ToUnicode map that already turns each fi/fl/ffi glyph back into plain letters, so
`pdftotext src/article.pdf -` returns 0 code points in U+FB00–FB06, and a selection in Chrome's viewer carries none either. That was confirmed headless on 2026-09-24:
the viewer's own `getSelectedText()` returned 0 of them (`assets/store/README.md`). The glyphs on the page are real ligatures; the "fixed" part needs a PDF whose text layer carries
U+FB01-style code points before any store image or scene claims it (`scripts/capture/GUI_PASS.md`).

## Screens and loops (capture step 2, headless, 2026-09-24)

Captured through the Chrome DevTools Protocol only (`scripts/capture/launch.sh` with `HEADLESS=1`,
`scripts/capture/shoot.mjs`), because the console was locked for much of the session. Chrome for Testing
153.0.8010.12, `--headless=new`, the extension built from this tree (`chrome-extension/dist`, v1.5.0) and loaded
with `--load-extension`, light colour scheme, device scale factor 2. The popup page is the real
`chrome-extension://<id>/popup/popup.html`, opened in a tab whose viewport is sized to the popup's rendered content
(`--fit`: measured until two readings agree), scrollbars hidden as in the real popup window. It is not the anchored
bubble; that one needs a display (GUI pass).

Every request the capture browser made to 127.0.0.1 went through `scripts/capture/port-guard.mjs`, which refused
port 8249 (an older helper runs there on this machine) and logged each request with the page that sent it. Since the
re-shoot below, the guard refuses every discovery port 8249-8260 except the capture helper's 8250 (a sibling
session's helper was listening on 8251).

**Re-shot 2026-09-24 (afternoon)** after the popup fixes landed: the brand indigo accent (the `oklch()` override that
rendered `#076BE3` is gone), the deep-ink Stop button, the legible settings gear, the refresh icon and outline style
on Retry, the install command that wraps only after `&&`, the AA Connected pill, and `…`, `×` and sentence case in
every label. `popup.png`, `fallback.png`, `status.webp` and both `assets/store/src/popup-*-speaking.png` are from that
build (helper 1.5.0 built from `6b881a1`), with the same commands.

| File | Size | What is on screen, and how it was made |
|---|---|---|
| `popup.png` | 720×700 (360×350 CSS @2x) | Connected to the real helper 1.5.0 on 127.0.0.1:8250 (launched with `--port/--python/--worker`), Heart (`af_heart`) selected, 1.0× |
| `fallback.png` | 720×1178 (360×589 CSS @2x) | The same popup with no helper on 8250 and 8249, 8251-8260 refused (all eleven logged as refused): "Offline" pill, the system-voice line, the install hint with the Homebrew command (the tap is the planned install path; it is not published yet), "System voice" in the voice box |
| `status.webp` | 720×700, 4.5 s loop | The popup opening against the real helper: "Checking" → "Connected", the voice box going from "Loading voices…" to "Heart". **One timing change:** the guard held each of the popup's two `/health` requests for 600 ms (`--hold-health 8250:600`), because the real "Checking" state lasts a few milliseconds. Responses were not altered. Frames are full-resolution `Page.captureScreenshot` grabs (~20/s) at their real times (Checking 0.37-1.53 s, Connected settled at 1.83 s). **Two more timing changes, for legibility at README scroll speed:** the first Checking frame is held 1.2 s longer (`--lead 1200`) and the last Connected frame 1.8 s (`--hold 1800`), so Checking is on screen 2.4 s and Connected 2.0 s. Encoded lossless (`img2webp -m 6`): the earlier near-lossless encode left a faint ghost of "Loading voices…" behind "Heart" |
| `helper.webp` | 1182×870, 23.6 s loop | VHS 0.11.0 recording of a real shell: `natural-tts-helper --port 8250` (the helper 1.5.0, built from `b1bce78`) starting to "ready", `curl /health`, a real `/speak` (af_heart, "Hello from a private Kokoro voice.") writing `hello.wav`, and `afinfo` on the result. In a terminal the helper prints each log message bare (no timestamp or label), so nothing filters its output. The helper's paths are shown through `/tmp/natural-tts/` symlinks (`scripts/capture/tapes/env.sh`) so no home path is on screen. Off camera: moving the helper to the background (Ctrl+Z, `bg`, `clear`) and stopping it at the end. **One timing change:** `retime.mjs --idle 2500` caps every unchanging stretch at 2.5 s, which shortens only the model warm-up (every other pause in the tape is shorter); the last screen is held 3.5 s. Lossless |
| `gate.webp` | 1280×1640, 12.8 s loop | VHS recording of a real `bash scripts/verify-all.sh` run from this tree at `b1e3ea6` (`PASS: all 55 checks`, 296 s of real recording cut to 90 distinct screens), sped up by `scripts/capture/tapes/retime.mjs`, which only shortens stretches where the screen does not change (each capped at 120 ms; the final table is held 6 s). The canvas is 62 lines tall so the live run never scrolls and the last screen is the whole results table. Lossless `img2webp -min_size` |

Not made in this step, and why: `voices.webp` (a voice switch needs the native `<select>` dropdown open; the
closed box only changes its one-word label, which would not show the accent groups) and the hero video, poster
and preview (they need the native context menu). Both are in `scripts/capture/GUI_PASS.md`.

## Store images (capture step 3, headless, 2026-09-24)

Web Store screenshots 2–5, the small tile, the marquee, the YouTube thumbnail and `assets/brand/social-preview.png`
frame real popup captures. Two captures are new: `assets/store/src/popup-emma-speaking.png` (Emma (UK), 1.3×) and
`popup-heart-speaking.png` (Heart (US), 1.0×), each made while the real helper 1.5.0 on 127.0.0.1:8250 was speaking
(re-shot with the fixed popup, see above).
The speech was started by the service worker. It sent its offscreen document the same `SPEAK_IN_OFFSCREEN` message the
right-click handler sends, with this article's paragraph 2. The native menu click was skipped, because it needs a
display. The helper log shows each request (12.07 s of Emma audio at 1.3× in 0.75 s). The guard logged 37 requests,
all to 127.0.0.1:8250. The voice counts printed on screenshot 2 are read from the live popup
(`assets/store/src/voice-groups.json`). The PDF check, the slot list and the regenerate commands are in
`assets/store/README.md`.

## Remaking the clips

```bash
cd native-helper && swift build -c release && cd ..
node assets/media/src/make-audio.mjs --port 18249          # a free port; the script starts and stops its own helper
node assets/media/src/make-audio.mjs --check
assets/media/src/render-pdf.sh                              # only if article.html changed
```

`make-audio.mjs` always passes `--port`, `--python` and `--worker` to the helper, so it never reads or writes
the shared `~/Library/Application Support/NaturalTTS/config.json`, and it refuses a port that is already in use.
If you change a sentence in `article.html`, change it in `selections.json` too, then remake the clips and update
this file.
