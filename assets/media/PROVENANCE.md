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

- **`hero.mp4`** (GUI pass, 2026-09-24): `hero.wav` starts at **5.755 s**. The click on "Speak selected text" is at
  3.667 s (frame 110), so the clip starts **2.08 s after the click**, the lag measured on this take (below).
  Speech (energy above −45 dBFS) starts at 6.075 s and ends at 20.875 s; the video ends at 21.4 s.
- **YouTube master** (`/tmp/ntts-w3-out/youtube-master.mp4`, not committed; 1920×1080, 64.6 s): title card 0–2.5 s
  (silent); `s1-rightclick.wav` at 6.751 s (click 5.667 s); `s2-british.wav` at 19.747 s and `s3-speed.wav` at
  31.091 s (popup Speak clicks, lags 0.540 s and 0.399 s); the fallback scene 34.90–41.97 s carries its own live
  recording (the macOS system voice, not a clip); the terminal 41.97–50.60 s (silent); `s5-offline.wav` at 53.527 s
  (click 52.24 s); end card 60.57–64.57 s (silent). Each position is the clip's cross-correlated place in its own take
  moved by the cuts before it; re-measured in the finished file, every clip is within 21 ms of it (the AAC priming
  that `-use_editlist 0` leaves in).
- **`demo-30s.mp4`** (1280×720, 30.0 s): `s1-rightclick.wav` at 2.751 s (click flash 1.667 s), `s2-british.wav` at
  15.547 s, then the terminal (silent). Both re-measured in the file: score 1.000 each.

## Hero video (GUI pass, 2026-09-24)

| File | Size | Bytes | What it is |
|---|---|---|---|
| `hero.mp4` | 1280×800, 21.4 s | 740,757 | H.264 High, yuv420p, 30 fps CFR, `+faststart`; AAC-LC 128 kb/s, 48 kHz stereo |
| `hero-poster.png` | 1280×800 | 382,780 | Frame 96 (3.2 s) of `hero.mp4`: the native menu open, "Speak selected text" highlighted |
| `hero-preview.webp` | 960×600, 9.45 s loop | 1,305,176 | The first 8 s of `hero.mp4`, silent, 20 fps, last frame held 1.5 s; `img2webp -near_lossless 40` |

**The take.** Headed Chrome for Testing 153.0.8010.12 (`scripts/capture/launch.sh` with `CDP_PORT=9556`), the
extension built from this tree, the real helper 1.5.0 built from this tree on 127.0.0.1:8251 (started with
`--port/--python/--worker`, so the shared `config.json` was never read or written), the port guard refusing 8249
and 8250. `scripts/capture/hero.mjs --mode full` drove it: paragraph 2 of `https://essays.example/article.html`
(served from `src/article.html`) selected word by word through the DOM, a CDP right-click on the selection (that is
what opens Chrome's native menu), then a **real** OS cursor move onto "Speak selected text" and a real click, the
item found through the Accessibility API (`axmenu`). At 6.5 s the driver opened the real anchored toolbar popup
(`chrome.action.openPopup()` from the service worker), which shows the speaking state. The window was recorded
with `sckrec --exclude-others` (picture and live audio, cursor hidden), 25 s at 2x, then cut from 2.9 s, converted
to 30 fps **before** the cut (cutting a variable-frame-rate recording first re-zeroes on the first changed frame
and shifted this take 0.37 s early, caught by the check below), scaled to 1280×800 with Lanczos and encoded at
CRF 20.

**Audio sync, measured on this take.** The click frame is the menu item's click flash, found by tracking the
menu's mean luma frame by frame through a full decode (no seeking): menu open 4.900 s, hover highlight 5.588 s,
click flash 6.572 s in the recording; the driver's clock (`click` mouse-down, +0.06 s to mouse-up) put it at
6.576 s. The live audio of the same take was cross-correlated with `hero.wav` on 10 ms log-RMS envelopes (robust to
Kokoro's random phase), refined at 1 ms: best match at 8.655 s, score 0.998. **Lag: 2.083 s** from click to the
clip's first sample (2.41 s to audible speech). It is longer than the ~1 s in the research because this is a whole
paragraph: the helper log shows "Generated 15.57s audio in 1.21s", and the service worker had idled out and was
woken by the click (the guard log re-arms it at the click). `hero.wav` was muxed at 2.9 s less, 5.755 s
(`adelay=5755`), and the finished file was checked the same way: click flash at 3.667 s, `hero.wav` found at
5.755 s (score 1.000). The guard logged one `POST /speak` for the click, to 127.0.0.1:8251. The live track also
caught a sub-second sound about 2 s before the click with no request in the guard log (not from the extension; it
is not in the published file, whose only audio is `hero.wav`).

**Checked by eye:** a 2 fps contact sheet of all 21.4 s and full-size frames at 3.2 s and 14 s: no cursor, no
infobar, no other app's window, the menu not clipped, the popup reading "Speaking your selection…",
"Kokoro · Heart (US)", 1.0×, Stop. Why it is 21.4 s and not 15–20 s: the clip is 15.58 s and the real lag is 2.08 s,
so fitting 20 s would mean cutting the selection and the menu, or cutting frames out of the wait, which would
misstate the latency.

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
and preview (they need the native context menu). Both are in `scripts/capture/GUI_PASS.md`. (The hero set was made in the GUI pass: see "Hero video" above.)

## Promo video and demo cut (GUI pass, 2026-09-24)

| File | Size | Bytes | What it is |
|---|---|---|---|
| `demo-30s.mp4` | 1280×720, 30.0 s | 666,075 | Scenes (b), the voice-switch half of (c), and the privacy terminal from the master. H.264 High CRF 23 `-preset slow`, AAC 128 kb/s 48 kHz stereo, `+faststart` |
| `/tmp/ntts-w3-out/youtube-master.mp4` (not committed) | 1920×1080, 64.6 s | 34,707,419 | The R07 storyboard: title, (b), (c), (d), (e), end card. The R09 encode: H.264 High 8 Mb/s (max 10), closed GOP 15, 2 B-frames, AAC 192 kb/s 48 kHz stereo, `+faststart`, `-use_editlist 0` |

**Takes.** One live take per scene, each in the same headed browser (window 1612×969, recorded 1612×907 pt at 2x,
exactly 16:9) with `sckrec --exclude-others` so every take has its own live audio, and the same helper, guard and
ports as the hero. (b) `hero.mjs --sel` on paragraph 1's last sentence, Heart 1.0×. (c) `popup-scene.mjs`: the
real anchored popup, a real click on its voice box, the native grouped list, Emma, Speak, + three times (1.3×), a
second sentence, Speak; the helper log shows `voice=bf_emma` at 1.0 for 123 characters and at 1.3 for 73. (d) the
capture helper stopped (only that pid; the older helper on 8249 was never touched), then a right-click speak: the
guard refused 8249 and 8250 and nothing listened on 8251–8260, so the extension fell back to the macOS system voice,
and the popup shows Offline, "System voice" and the install hint. That scene's audio is the take's own recording,
unchanged (it is about 10 dB louder than the Kokoro clips; no gain was applied to anything). (e) the helper
restarted; `scripts/capture/tapes/privacy.tape` (VHS, a real shell) looks the helper and worker pids up on camera:
the Kokoro worker has **0** network sockets, the helper one, `127.0.0.1:8251 (LISTEN)`; then a right-click speak
through that same helper, whose 16 guard-logged requests all went to 127.0.0.1:8251. Wi-Fi was never touched. For
(e) the article got 400 px of bottom padding (`document.body.style.paddingBottom`) so paragraph 5 could scroll to
where its menu fits inside the frame; nothing else on the page changed. Scenes (d) and (e) start with the menu
already open (the sentence is selected on screen); the gesture itself is shown in (b).

| Scene | Click (take) | Clip in take | Lag |
|---|---|---|---|
| (b) right-click, `s1-rightclick.wav` | 11.167 s | 12.251 s (score 0.993) | 1.084 s |
| (c) popup Speak, `s2-british.wav` | 12.107 s | 12.647 s (0.999) | 0.540 s |
| (c) popup Speak at 1.3×, `s3-speed.wav` | 24.392 s | 24.791 s (0.999) | 0.399 s |
| (d) right-click, system voice (live) | 11.105 s | speech from 12.37 s | 1.26 s |
| (e) right-click, `s5-offline.wav` | 10.942 s | 12.227 s (0.997) | 1.285 s |

Right-click clicks are the menu item's click flash, from a frame-by-frame luma trace of the menu; popup clicks are
`click.swift`'s mouse-down, whose wall-clock mapping matched the Speak button's own reaction to within 6 ms.
`scripts/capture/promo-assemble.py` cuts every scene at 30 fps on whole frames, puts each clip at its measured time,
and refuses any cut inside a clip or inside a click-to-speech gap: the only cuts (four in (c), 0.35–0.8 s each)
remove idle time between actions. Cards: `scripts/capture/video-cards.sh` (a text-only title card, so the video never
shows the older popup that `youtube-thumbnail-1280x720.png` embeds, and an end card with the Homebrew commands and the
repository). **Discarded takes:** first takes of (b) and (c) (the macOS volume display appeared over them when the
volume was changed mid-take), and an earlier (b) framing that cut the title off.

**Length.** The spec asked for a 30–50 s master and a 20–30 s demo. The master is 64.6 s: its five scenes carry
~28 s of real speech plus real latencies and the actions that cause them, and the only way under 50 s would be
cutting inside a wait or speeding up the UI. The demo is 30.0 s because it drops the second (1.3×) speak and the
fallback scene.

## Voices loop (GUI pass, 2026-09-24)

| File | Size | Bytes | What it is |
|---|---|---|---|
| `voices.webp` | 720×1290, 6.4 s loop | 1,380,484 | The anchored toolbar popup on Heart; its voice box opened as the native macOS list with the four real groups (American Female 11, American Male 9, British Female 4, British Male 4); the highlight walks down to Emma; Emma is picked and the box reads "Emma". Silent |

Same capture browser, helper and guard as the hero. The window was made 1280×969 (`Browser.setWindowBounds`) so the
open list stays inside the browser window and nothing of another app is recorded. `scripts/capture/voices.mjs`
opened the real anchored popup (`chrome.action.openPopup()`), then clicked the voice box with a **real** OS click
(that is what opens the native list), walked the real cursor down the rows one by one (each row located through the
Accessibility API) and clicked Emma for real. Recorded with `sckrec` (app-only filter, cursor hidden), 480×860 pt at
2x; cut from 6.3 s to the box's repaint at 10.65 s at 20 fps constant frame rate, scaled to 720 px wide with Lanczos,
the last frame held 2 s, `img2webp -near_lossless 40`. Two earlier takes were discarded: one recorder window ended
before the pick, and in the other the display switched to another Space right after the pick, so the box's repaint
was never recorded. A contact sheet of this take shows the highlight moving row by row, nothing else moving.

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
