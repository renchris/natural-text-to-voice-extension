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
- **Runtime:** Natural TTS helper 1.5.0, built from git `f6f701e8c429785128ab98b8880a77b35d24f0e8` with
  `swift build -c release`, clean tree; Python worker with mlx 0.32.2 and mlx-audio 0.5.5, **loudness-normalized**
  (every `/speak` response: one gain toward −16 LUFS, never past a −1.5 dBTP true peak; see "Loudness" below)
- **Machine:** Apple M1 Max, macOS 15.7.9
- **Date:** 2026-09-24 22:59 UTC (17:59 local). The first set (helper `9186b17`, 2026-09-24 04:54 UTC, no
  normalization) is superseded; its manifest is in git history
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

**Checked after generation (the first set, 2026-09-24 04:54 UTC).** A local speech recogniser (Parakeet TDT 0.6B v3 in
whisper.cpp 1.9.1) transcribed all six clips back to their exact text, word for word and with the same punctuation.
Peak levels are −5.1 to −8.7 dBFS (no clipping); each clip ends in 0.44–0.74 s of silence.

**Loudness (regenerated 2026-09-24, evening).** The six clips above are the normalized helper's output, made again
with `make-audio.mjs` (port 18249). Each has exactly as many samples as the take it replaces, and cross-correlates
with it at lag 0 (waveform correlation 0.992–0.994; the rest is Kokoro's random phase): the synthesis is the same
and louder. Checked the same way: Parakeet (`parakeet-cli`, whisper.cpp 1.9.1) transcribed all six back to their
exact text; true peak −1.5 dBTP, sample peaks −1.50 to −1.71 dBFS; the same 0.44–0.74 s of closing silence.

| Clip | Before (LUFS / dBTP) | After (LUFS / dBTP) | Gain |
|---|---|---|---|
| `hero.wav` | −25.6 / −6.5 | −20.2 / −1.5 | +5.30 dB |
| `s1-rightclick.wav` | −25.6 / −8.3 | −18.7 / −1.5 | +6.82 dB |
| `s2-british.wav` | −23.8 / −6.3 | −19.3 / −1.5 | +4.48 dB |
| `s3-speed.wav` | −23.5 / −6.3 | −18.6 / −1.5 | +4.81 dB |
| `s4-pdf.wav` | −26.0 / −8.5 | −19.1 / −1.5 | +6.89 dB |
| `s5-offline.wav` | −25.6 / −5.1 | −22.1 / −1.5 | +3.37 dB |

Every clip stops at the true-peak ceiling before it reaches −16 LUFS: Kokoro's speech sits 14–24 dB between true
peak and loudness, and one gain with no limiter cannot close more than 14.5 dB of that
(`docs/research/2026-09-upgrade/W2-integration-measurements.md` §10). Measured with `ffmpeg -af ebur128=peak=true`,
mono, as the WAVs are.

## How each video's audio is produced

The screen is recorded without its audio track (`scripts/capture/sckrec`, inclusion filter). The clip above
for that scene is then muxed in at the moment the driver clicked "Speak selected text", with the offset set by
cross-correlating the clip against a live recording of the same take (research measured a constant lag of
+0.93–1.00 s between click and sound). The audio stream is re-encoded to AAC for MP4 and never otherwise
changed: no music, no gain edits, no cuts inside a clip. See `scripts/capture/README.md` and
`docs/research/2026-09-upgrade/UPGRADE_RESEARCH.md` §12.

**Correction (retake round, 2026-09-24).** The first GUI-pass muxes broke the "no gain edits" rule without meaning to:
they turned each mono clip into stereo with `aresample`/`aformat=channel_layouts=stereo`, and swresample's upmix puts
a mono source on both channels at −3 dB. Every Kokoro clip lost 3 dB per channel (`hero.wav` peaks at −6.5 dBFS; the
first `hero.mp4` peaked at −9.6 dBFS), which made the product's own voice sound ~12 LU quieter than the system-voice
fallback in the promo, against ~9.4 LU in a live take. Every mux now copies the mono samples to both channels exactly
(`pan=stereo|c0=c0|c1=c0`), so a clip's peak in the MP4 equals its peak in the WAV. Measured after the fix:
`hero.mp4` −22.7 LUFS, peak −6.5 dBFS; in the master, Kokoro −20.6 to −22.6 LUFS against the live system-voice scene's
−13.3 LUFS (−2.5 dBFS peak, left exactly as recorded). No gain is applied to anything, so the gap on screen is the
real one: the worker's output is quieter than the macOS system voice. Normalising the worker's loudness (e.g. −16 LUFS,
−1 dBTP) is a product change, not a capture one; the clips would then be regenerated with `make-audio.mjs`.

**Loudness normalization shipped (2026-09-24, evening), and the videos were re-muxed.** The worker now normalizes
every response (−16 LUFS target, −1.5 dBTP ceiling, one gain), the clips were regenerated (above), and `hero.mp4`,
`demo-30s.mp4` and the YouTube master were given the new clips **at exactly the offsets below**, their video streams
copied, never re-encoded. The rule is still "no gain edits": the gain is the helper's own, applied to every response
a user hears, and the mux adds none. How: `scripts/capture/hero-mux.sh` (the hero recipe of
`scripts/capture/GUI_PASS.md` as a script) and `scripts/capture/promo-assemble.py --remux-audio` (the master's and the
demo's sound rebuilt with exactly the graph a full run uses, muxed with the finished file's video). Both were first
run with the OLD clips: `hero-mux.sh` reproduced `hero.mp4` byte for byte, and `--remux-audio` reproduced every packet
of both streams of the master and the demo, timestamps included. Only then did the new clips go in. Checked in the
new files: the video packets are identical to the old files'; every clip sits at exactly the sample where the old clip
sat in the old file (cross-correlation, score ≥ 0.9991); outside the clips the demo and the hero are still silent; the
master's live system-voice scene is unchanged (−13.3 LUFS, −2.5 dBTP; AAC re-encode residual 43 dB below it). Measured
now: `hero.mp4` −17.4 LUFS integrated, true peak −1.4 dBTP (the AAC encode adds ~0.1 dB over the WAV's −1.5); in the
master, Kokoro −15.7 to −16.3 LUFS against the live system voice's −13.3, a gap of ~3 LU where it was 7–9 LU;
integrated −15.3 LUFS. Inside a stereo file the clips read ~3 LU louder than as mono WAVs, because BS.1770 sums the
two identical channels; the system voice in the master is a stereo recording, so the comparison is like for like.

**As done in the GUI pass (2026-09-24):** every take was recorded with `sckrec --exclude-others`, so the picture and
the live audio of the same take are in one file; the published audio is still the canonical clip, placed where it
cross-correlates into that live audio. The lag is **not** constant: measured per take it ran from 0.40 s (the popup's
own Speak button) through 1.08–1.29 s (a sentence from the menu) to 2.08 s (a whole paragraph after the service worker
had idled out). The research figure above came from three events and does not hold in general. The retake round,
with another capture run using the GPU, measured 1.25 s (popup Speak), 1.875 s (a sentence from the menu) and 2.47 s
(the whole paragraph).

- **README hero MP4:** `hero.wav` only.
- **Store / YouTube video:** `s1-rightclick.wav`, `s2-british.wav`, `s3-speed.wav`, `s4-pdf.wav`,
  `s5-offline.wav` in that order, each under its own scene; title and end cards are silent. (As of step 3 the
  PDF scene gives way to a live system-voice fallback scene, so `s4-pdf.wav` is unused; `s5-offline.wav` goes under
  the privacy scene, which never touches Wi-Fi. Spec: `scripts/capture/GUI_PASS.md` item 4.)
- **Silent GIF loops and still images:** no audio.

When a finished video is produced, add a line here naming the video file, the clips it uses and their
offsets.

- **`hero.mp4`** (retake round, 2026-09-24, pointer recorded): `hero.wav` starts at **8.667 s**. The click on
  "Speak selected text" is at 6.200 s (its click flash, frame 186), so the clip starts **2.467 s after the click**, the
  lag measured on this take (below). Speech starts at 9.0 s (2.8 s after the click) and ends at 23.8 s; the video ends
  at 24.8 s.
- **YouTube master** (not committed; 1920×1080, 65.3 s; kept outside `/tmp`, see "Promo video and demo cut" below):
  title card 0–2.5 s (silent); `s1-rightclick.wav` at 8.608 s (click flash 6.733 s); `s2-british.wav` at 24.688 s and
  `s3-speed.wav` at 42.362 s (popup Speak clicks, lags 1.248 s and 1.252 s); the fallback scene from 46.0 s carries its
  own live recording (the macOS system voice, not a clip); the terminal from 52.8 s (silent); the end card from 61.2 s
  (silent). Scenes overlap by a 0.3 s crossfade. Each position is the clip's cross-correlated place in its own take
  moved by the cuts before it. In the file the picture starts 66.7 ms late (the B-frame delay that `-use_editlist 0`
  exposes) and the mix is delayed to match, so each clip measures 67 ms after its listed time and click flash to clip
  onset is exactly the take's lag (scene b: 6.800 s to 8.675 s, 1.875 s).
- **`demo-30s.mp4`** (1280×720, 27.4 s): `s2-british.wav` at 10.205 s (re-measured in the file at 10.188 s, score
  1.000), then the terminal (silent) and a 3 s end card.

## Hero video (retake round, 2026-09-24: the pointer and every gesture are real)

| File | Size | Bytes | What it is |
|---|---|---|---|
| `hero.mp4` | 1280×800, 24.8 s | 810,078 | H.264 High, yuv420p, 30 fps CFR, BT.709 tags, `+faststart`; AAC-LC 128 kb/s, 48 kHz stereo |
| `hero-poster.png` | 1280×800 | 360,647 | Frame 402 of the 2560×1600 raw take (13.4 s, 6.0 s into `hero.mp4`), Lanczos to 1280×800: the native menu open, the pointer on "Speak selected text", highlighted. Stripped to a plain sRGB PNG (no cICP/gAMA/cHRM/pHYs chunks), pixel-identical to the frame before stripping |
| `hero-preview.webp` | 960×600, 14.2 s loop | 2,059,322 | The first 11.2 s of the take (to the popup showing "Speaking your selection…" and the pointer moving off it), silent, 20 fps from the 2x raw, then that frame held 3 s with a "▶ Watch with sound · 25 s" pill (`scripts/capture/cws/pill.html`); `img2webp -near_lossless 40`, a key frame at least every 20 frames. Made by `scripts/capture/hero-preview.sh` |

**The take.** Headed Chrome for Testing 153.0.8010.12 (`scripts/capture/launch.sh` with `CDP_PORT=9556`), the
extension built from this tree, the real helper 1.5.0 built from this tree (`c03f80d`) on 127.0.0.1:8251 (started
with `--port/--python/--worker`, so the shared `config.json` was never read or written), the port guard refusing
8249 and 8250. `scripts/capture/hero.mjs --mode full --cursor` drove it, and **the recording shows the pointer**
(`sckrec` without `--no-cursor`). Every gesture is real OS input: the pointer rests on the page, glides to the first
letter of paragraph 2 of `https://essays.example/article.html` and **drag-selects** the paragraph to its last letter
(`glide --drag`; the driver checks the selection equals the paragraph's text), **right-clicks** inside the selection
(`click --right`), glides onto "Speak selected text" (located through the Accessibility API, `axmenu`) and clicks it,
then glides to the pinned toolbar button (located through Accessibility, `axfind`, and re-located after the glide,
because Chrome adds its media-controls button to the toolbar once audio plays and the icons shift) and **clicks it**:
the popup opens the way a user opens it, never by `chrome.action.openPopup()`. The window was brought to the front
first, and every point was checked to be on the capture window (`winlist` z-order) before anything was pressed there.
Recorded with `sckrec --exclude-others` (picture and live audio), 34 s at 2x, converted to 30 fps **before** the cut
(cutting a variable-frame-rate recording first re-zeroes on the first changed frame), cut from frame 222 (7.4 s, the
pointer at rest) to frame 966, scaled to 1280×800 with Lanczos, encoded at CRF 20.

**Audio sync, measured on this take.** The click frame is the menu item's click flash, found by tracking the item's
mean luma frame by frame through a full decode: hover highlight from 13.2 s, click flash 13.600 s in the recording;
the driver's clock (`click` mouse-down 13.544 s, +0.06 s to mouse-up) agrees. The live audio of the same take was
cross-correlated with `hero.wav` on 10 ms log-RMS envelopes (robust to Kokoro's random phase), refined at 1 ms: best
match at 16.067 s, score 0.907 (the live track also holds four short sounds from outside the extension, none near the
speech). **Lag: 2.467 s** from click to the clip's first sample, 2.8 s to audible speech: a whole paragraph (the helper
log: "Generated 15.57s audio in 1.64s") on a machine where another capture run was using the GPU. `hero.wav` was muxed
at 7.4 s less, 8.667 s, with its mono samples on both channels unchanged (`pan=stereo|c0=c0|c1=c0`), and the finished
file was checked the same way: click flash at 6.200 s, `hero.wav` found at 8.667 s (score 1.000); loudness −22.7 LUFS,
peak −6.5 dBFS, the WAV's own peak. **Re-muxed with the normalized `hero.wav` (2026-09-24, evening):**
`scripts/capture/hero-mux.sh assets/media/hero.mp4 <out>` (video copied; the same 8,667 ms); the new clip found at
8.667 s (score 0.9994, the same sample as before), loudness −17.4 LUFS, true peak −1.4 dBTP. 809,678 → 810,078 bytes.

**Checked by eye:** a 2 fps contact sheet of all 24.8 s, the drag at 5 fps, and full-size frames of the menu and the
popup: the pointer where the driver put it and nowhere else, no infobar, no other app's window, the menu not clipped,
the popup (v1.5.0: navy Stop, indigo slider, "1.0×") reading "Speaking your selection…", "Kokoro · Heart (US)". Two
takes were discarded: in the first the recorder never started (ScreenCaptureKit briefly listed no shareable window
for the browser), in the second the toolbar click landed on the Extensions button, because the media-controls button
had shifted the toolbar after the button was located (hence the re-location). Why it is 24.8 s and not 15–20 s: the
clip is 15.58 s, the real lag is 2.5 s and the gestures take 4.3 s; fitting 20 s would mean cutting the selection
or frames out of the wait, which would misstate the latency.

**The preview's wait is kept.** Between the click (6.2 s) and the popup (9.6 s) the only motion is the pointer going
to the toolbar; cutting that would misstate the latency, so the preview keeps it and holds its payoff frame for 3 s
instead, with the pill pointing at the MP4 that has sound. Embed it as a link to `hero.mp4`, since GitHub does not
play repository MP4s inline:
`<a href="assets/media/hero.mp4"><img src="assets/media/hero-preview.webp" width="960" alt="…"></a>`. The key frame
every 20 frames removes a near-lossless ghost of the closed menu's edge that the first preview carried (up to 4/255
per channel, only under a contrast stretch); re-measured against the source frames, the menu's old edge now differs
by 0.

**Caveat on the PDF scene (checked 2026-09-24).** `article.pdf` does not, on its own, demonstrate the ligature fix:
Skia writes a ToUnicode map that already turns each fi/fl/ffi glyph back into plain letters, so
`pdftotext src/article.pdf -` returns 0 code points in U+FB00–FB06, and a selection in Chrome's viewer carries none either. That was confirmed headless on 2026-09-24:
the viewer's own `getSelectedText()` returned 0 of them (`assets/store/README.md`). With a display (GUI pass, 2026-09-24), the viewer's native
menu lists "Speak selected text" and clicking it speaks through the helper (`assets/store/README.md`). The glyphs on the page are real ligatures; the "fixed" part needs a PDF whose text layer carries
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

**Re-shot at integration (2026-09-24, evening)**, when the GUI pass's branch was rebased onto `main`: the extension
built from the merged tree (its popup source is unchanged since `ceb80e2`, the sentence-case Retry label), the real
helper 1.5.0 built from the same tree (it includes `b1bce78`) on 127.0.0.1:8251, CfT 153 headless (`HEADLESS=1 CDP_PORT=9556
HOLD_HEALTH=8251:600 launch.sh`, the guard refusing 8249-8250 and 8252-8260). `popup.png`, `fallback.png`, both
`assets/store/src/popup-*-speaking.png` and every image `cws/render.sh` writes came out **byte-identical** to the files
already committed, so those files already showed the final popup. `status.webp` was re-assembled from a new grab.

| File | Size | What is on screen, and how it was made |
|---|---|---|
| `popup.png` | 720×700 (360×350 CSS @2x) | Connected to the real helper 1.5.0 on 127.0.0.1:8251 (launched with `--port/--python/--worker`), Heart (`af_heart`) selected, 1.0× |
| `fallback.png` | 720×1178 (360×589 CSS @2x) | The same popup with the capture helper on 8251 stopped and 8249-8250, 8252-8260 refused (all eleven logged as refused): "Offline" pill, the system-voice line, the install hint with the Homebrew command (the tap is the planned install path; it is not published yet), "System voice" in the voice box |
| `status.webp` | 720×700, 4.2 s loop | The popup opening against the real helper: "Checking" → "Connected", the voice box going from "Loading voices…" to "Heart". **One timing change:** the guard held each of the popup's two `/health` requests for 600 ms (`--hold-health 8251:600`), because the real "Checking" state lasts a few milliseconds. Responses were not altered. Frames are full-resolution `Page.captureScreenshot` grabs (~20/s) at their real times (Checking 0.71-1.55 s, Connected settled at 1.81 s). **Two more timing changes, for legibility at README scroll speed:** the first Checking frame is held 1.2 s longer (`--lead 1200`) and the last Connected frame 1.8 s (`--hold 1800`), so Checking is on screen 2.05 s and Connected 2.1 s. Encoded lossless (`img2webp -m 6`): the earlier near-lossless encode left a faint ghost of "Loading voices…" behind "Heart" |
| `helper.webp` | 1182×870, 23.6 s loop | VHS 0.11.0 recording of a real shell: `natural-tts-helper --port 8250` (the helper 1.5.0, built from `b1bce78`) starting to "ready", `curl /health`, a real `/speak` (af_heart, "Hello from a private Kokoro voice.") writing `hello.wav`, and `afinfo` on the result. In a terminal the helper prints each log message bare (no timestamp or label), so nothing filters its output. The helper's paths are shown through `/tmp/natural-tts/` symlinks (`scripts/capture/tapes/env.sh`) so no home path is on screen. Off camera: moving the helper to the background (Ctrl+Z, `bg`, `clear`) and stopping it at the end. **One timing change:** `retime.mjs --idle 2500` caps every unchanging stretch at 2.5 s, which shortens only the model warm-up (every other pause in the tape is shorter); the last screen is held 3.5 s. Lossless |
| `gate.webp` | 1280×1640, 12.8 s loop | VHS recording of a real `bash scripts/verify-all.sh` run from this tree at `b1e3ea6` (`PASS: all 55 checks`, 296 s of real recording cut to 90 distinct screens), sped up by `scripts/capture/tapes/retime.mjs`, which only shortens stretches where the screen does not change (each capped at 120 ms; the final table is held 6 s). The canvas is 62 lines tall so the live run never scrolls and the last screen is the whole results table. Lossless `img2webp -min_size` |

Not made in this step, and why: `voices.webp` (a voice switch needs the native `<select>` dropdown open; the
closed box only changes its one-word label, which would not show the accent groups) and the hero video, poster
and preview (they need the native context menu). Both are in `scripts/capture/GUI_PASS.md`. (The hero set was made in the GUI pass: see "Hero video" above.)

## Promo video and demo cut (retake round, 2026-09-24)

| File | Size | Bytes | What it is |
|---|---|---|---|
| `demo-30s.mp4` | 1280×720, 27.4 s | 737,686 | The README cut: the popup half of (c) (it opens on a real drag selection), the privacy terminal with its caption, and a 3 s end card, joined by 0.3 s crossfades. H.264 High CRF 23 `-preset slow`, BT.709 tags, AAC 128 kb/s target (35 kb/s delivered) 48 kHz stereo, `+faststart` |
| `youtube-master.mp4` (not committed) | 1920×1080, 65.3 s | 37,626,810 | Title, (b), (c), (d), (e1), end card, 0.3 s crossfades, lower-third captions on (d) and (e1). H.264 High, 8 Mb/s ABR target (max 10) and **4.5 Mb/s delivered** (ABR undershoots on a mostly static UI), closed GOP 15, 2 B-frames, BT.709 primaries, transfer and matrix tagged in the stream (`h264_metadata`), AAC 192 kb/s target (**63 kb/s delivered**), 48 kHz stereo, `+faststart`, `-use_editlist 0`. sha256 `ef688c5dbb1410964f6dc4a12f5b340306afaedaf18699fd0d60290f26579613` (re-muxed with the normalized clips; before: `a95b8a1729563baa34620dccd22c938a9bafd47443536ca1620b9d6501a6350c`) |

**Where the master lives.** `/tmp` is wiped on reboot and another capture run writes into `/tmp/ntts-w3-out`, so the
master, its captions and its inputs are kept at `~/ntts-captures/2026-09-24/`: `work/out/youtube-master.mp4` (this
one; the pre-normalization master is kept beside it as `youtube-master.pre-loudness.mp4`, and the demo's as
`demo-30s.pre-loudness.mp4`), `youtube-master.srt` and `chapters.txt` (from `scripts/capture/youtube-meta.mjs`),
`youtube-master.timeline.json`;
`work/gui/` and `work/tapes/` the retake round's takes; `orig/` the first GUI pass as it was (its master, sha256
`15e2f0af7aacd547ac599c483133266fa5b02e191c6c4561e6a4502f20b3373d`, its raw takes, and the PDF-check evidence cited in
`assets/store/README.md`). Every card and caption is rendered from the committed templates by
`scripts/capture/video-cards.sh <dir>` into a directory no other run writes to.

**Upload gate.** The end card's step 2 is the Homebrew tap, which is not published yet (`renchris/homebrew-tap` had no
`natural-tts` formula on 2026-09-24). Do not upload the master until `brew install renchris/tap/natural-tts` works;
the card's repository line is the install path that works today.

**Takes.** Each in the same headed browser (window 1612×969, recorded 1612×907 pt at 2x, exactly 16:9) with
`sckrec --exclude-others`, so every take has its own live audio, and the same helper, guard and ports as the hero.
(b) and (c) were retaken in the retake round **with the pointer recorded and every gesture real** (`--cursor`):
(b) `hero.mjs --sel` on paragraph 1's last sentence, Heart 1.0×: a drag selects it, a right-click opens the menu, a
click on "Speak selected text". (c) `popup-scene.mjs --cursor --pad 700 --scroll2 70`: a drag selects a sentence, a
click on the pinned toolbar button opens the popup, a click opens the native grouped voice list, the pointer walks it
to Emma and picks her, Speak; + three times (1.3×); a real wheel scroll brings the second sentence up, a drag selects
it (that click closes the popup, as it would for anyone), the toolbar button opens the popup again, now on Emma at
1.3×, and Speak. The scroll and the 700 px of bottom padding it needs (`document.body.style.paddingBottom`, below the
article, off screen at the start) exist because another app's window sat over the right of the display for the whole
session and a real press must never land on it: the second sentence's drag had to start above that window. The
helper log shows `bf_emma` for 123 characters at 1.0 and 73 at 1.3. (d) is the first pass's take: the capture helper
stopped (only that pid; the older helper on 8249 was never touched), then a right-click speak: the guard refused 8249
and 8250 and nothing listened on 8251–8260, so the extension fell back to the macOS system voice, and the popup shows
Offline, "System voice" and the install hint. Its audio is the take's own recording, unchanged. (e1)
`scripts/capture/tapes/privacy.tape` (VHS, a real shell) looks the running helper's and worker's pids up on camera:
the Kokoro worker has **0** network sockets, the helper one, `127.0.0.1:8251 (LISTEN)`. It was rendered again in the
retake round, so the pid it shows (83758) is the helper that spoke (b) and (c). Wi-Fi was never touched. The first
pass's (e2), a second right-click speak through that helper, is no longer in the cut: it repeated (b) and showed
nothing new, and (e1) with its caption carries the claim.

| Scene | Click (take) | Clip in take | Lag |
|---|---|---|---|
| (b) right-click, `s1-rightclick.wav` | 12.233 s | 14.108 s (score 0.995) | 1.875 s |
| (c) popup Speak, `s2-british.wav` | 19.107 s | 20.355 s (0.995) | 1.248 s |
| (c) popup Speak at 1.3×, `s3-speed.wav` | 38.877 s | 40.129 s (0.993) | 1.252 s |
| (d) right-click, system voice (live) | 11.105 s | speech from 12.37 s | 1.26 s |

Right-click clicks are the menu item's click flash, from a frame-by-frame luma trace of the item; popup clicks are
`click.swift`'s mouse-down on the recorder's clock. The lags are longer than the first pass's (1.08 s and 0.40–0.54 s):
another capture run was generating speech on the same GPU through the session. `scripts/capture/promo-assemble.py`
cuts every scene at 30 fps on whole frames, puts each clip at its measured time with its mono samples on both channels
unchanged, and refuses any cut inside a clip, inside a click-to-speech gap, or a clip whose speech would sit in a
crossfade. The cuts in (c) fall only inside stretches where no pixel moves (found with `mpdecimate`), so the pointer
never jumps. Captions (`scripts/capture/cws/caption.html`, overlaid with `overlay=enable=…`; this ffmpeg has no
`drawtext`): (d) "Helper not running? A voice built into your Mac reads instead." with "The Natural TTS helper was
stopped for this scene; this is the macOS system voice."; (e1) "The Kokoro worker has 0 network sockets. The helper
listens on 127.0.0.1 only." with "This capture ran the helper on port 8251; the default is 8249." (a viewer who checks
their own helper sees the shipped default). The spoken text is also a caption track, `youtube-master.srt`: one cue per
sentence from `src/selections.json` at each clip's speech, plus the fallback scene's sentence at its measured speech;
chapters `0:00`, `0:14`, `0:46`. Cards: `scripts/capture/video-cards.sh` (a text-only title card, so the video never
shows an older popup, and an end card with a numbered call to action: 1, add Natural TTS to Chrome from the Chrome Web
Store; 2, the Homebrew commands; then the repository, smaller). Measured in the finished master: every clip within
1 ms of its place (after the 67 ms start offset both streams share), Kokoro −20.6 to −22.6 LUFS, the live scene −13.3
LUFS, integrated −17.9 LUFS. After the loudness re-mux (`promo-assemble.py --remux-audio`, 2026-09-24 evening; the
timeline, and so the `.srt` and chapters, unchanged): every clip at the same sample as before, `s1-rightclick` −15.8,
`s2-british` −16.3, `s3-speed` −15.7 LUFS (true peak −1.5 to −1.6 dBTP), the live scene −13.3 LUFS unchanged,
integrated −15.3 LUFS; in `demo-30s.mp4`, `s2-british.wav` −16.3 LUFS at 10.188 s as before.
**Discarded takes:** in the first pass, first takes of (b) and (c) (the macOS volume display
appeared over them) and an earlier (b) framing that cut the title off.

**Length.** The spec asked for a 30–50 s master and a 20–30 s demo; `scripts/capture/GUI_PASS.md` now says 45–70 s for
the master. The master is 65.3 s: real gestures (a drag, a right-click, the pointer travelling to each control)
take 2–3 s per scene that the first pass hid, the scenes carry ~20 s of real speech plus real latencies, and the only
way under 50 s would be cutting inside a wait, speeding up the UI or dropping the 1.3× speak. The demo is 27.4 s: it
leaves out (b), whose right-click the README hero already shows.

## Voices loop (GUI pass, 2026-09-24; re-cropped in the retake round)

| File | Size | Bytes | What it is |
|---|---|---|---|
| `voices.webp` | 720×1518, 6.4 s loop | 2,904,724 | The anchored toolbar popup on Heart; its voice box opened as the native macOS list with the four real groups (American Female 11, American Male 9, British Female 4, British Male 4); the highlight walks down to Emma; Emma is picked and the box reads "Emma". Silent. Embed it at `width="360"` (it is 2x) |

Same capture browser, helper and guard as the hero. The window was made 1280×969 (`Browser.setWindowBounds`) so the
open list stays inside the browser window and nothing of another app is recorded. `scripts/capture/voices.mjs`
opened the real anchored popup (`chrome.action.openPopup()`), then clicked the voice box with a **real** OS click
(that is what opens the native list), walked the real cursor down the rows one by one (each row located through the
Accessibility API) and clicked Emma for real. Recorded with `sckrec` (app-only filter, cursor hidden), 480×860 pt at
2x. Two earlier takes were discarded: one recorder window ended before the pick, and in the other the display switched
to another Space right after the pick, so the box's repaint was never recorded. A contact sheet of this take shows the
highlight moving row by row, nothing else moving.

**Re-cropped from the same raw take in the retake round** (`scripts/capture/voices-loop.sh`): the first crop was the
whole 960 px recording, so article words ran cut down its left edge, a sliver of the address field sat top left and
half the profile icon top right. The crop now starts 12 CSS px left of the popup and ends just after the Extensions
button (816×1720 px from x = 69), and the left edge fades to the page colour over the page only: 24 px beside the popup
(to the toolbar's white above the page) and, below the popup, 150 px while the list is closed but only up to the list's
own edge while it is open, so the list's pixels are untouched. Cut from 6.3 s to 10.7 s at 20 fps constant rate,
Lanczos to 720 px wide, the last frame (Emma) held 2 s. **Re-encoded lossless at integration** (`img2webp -m 6`,
2,904,724 bytes, under the 3 MB loop budget): the `-near_lossless 40` encode, even with a key frame every 10 frames,
left a ghost of the closed list ("American Female", "Heart", "Bella", "Nicole"…) in the held Emma frame, 21.6% of its
pixels off the source. Now all 35 stored frames equal a source frame pixel for pixel.

## Store images (capture step 3, headless, 2026-09-24; re-shot in the retake round)

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

In the retake round both captures were made again the same way from the shipping v1.5.0 popup (the first ones showed
an earlier build's green Stop and blue slider), with the real helper 1.5.0 on 127.0.0.1:8251 and the guard refusing
8249 and 8250; the live voice groups were unchanged. Every store image was then re-rendered from them.

## Remaking the clips

```bash
cd native-helper && swift build -c release && cd ..
node assets/media/src/make-audio.mjs --port 18249          # a free port; the script starts and stops its own helper
node assets/media/src/make-audio.mjs --check
assets/media/src/render-pdf.sh                              # only if article.html changed
# then put the new clips under the finished videos at their recorded offsets, video copied (see "Loudness" above):
scripts/capture/hero-mux.sh assets/media/hero.mp4 /tmp/hero.mp4 && mv /tmp/hero.mp4 assets/media/hero.mp4
python3 scripts/capture/promo-assemble.py --remux-audio ~/ntts-captures/2026-09-24/work/takes \
  <old youtube-master.mp4> <new youtube-master.mp4> assets/media/demo-30s.mp4 <new demo-30s.mp4>
```

`make-audio.mjs` always passes `--port`, `--python` and `--worker` to the helper, so it never reads or writes
the shared `~/Library/Application Support/NaturalTTS/config.json`, and it refuses a port that is already in use.
If you change a sentence in `article.html`, change it in `selections.json` too, then remake the clips and update
this file.
