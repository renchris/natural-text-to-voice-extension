# GUI pass: the assets that need a real display

Capture step 2 ran **headless only** (the console was locked and the display asleep for much of the night; nothing
may take over the operator's screen). Everything that can be captured through CDP alone is done and committed:

| Asset | State |
|---|---|
| `assets/media/popup.png` | done, headless (720×700, 2x, Connected, Heart, 1.0x) |
| `assets/media/fallback.png` | done, headless (720×1124, 2x, helper stopped, system-voice line + install hint) |
| `assets/media/status.webp` | done, headless (720×700, Checking → Connected loop) |
| `assets/media/helper.webp`, `assets/media/gate.webp` | done, VHS (renders headlessly) |

What remains needs the window server: the **native context menu**, the **anchored toolbar popup** (headless opens
`popup.html` as a tab, not the anchored bubble) and the **native `<select>` dropdown**. This file is the one-go
recipe for that pass.

## Remaining assets

1. **`assets/media/hero.mp4`** (15–20 s, 1280×800, H.264 High, yuv420p, 30 fps, AAC, `+faststart`, ≤ 8 MB), plus
   **`hero-poster.png`** (a strong frame: the menu open with "Speak selected text" highlighted) and
   **`hero-preview.webp`** (silent, first ~6–8 s, ≤ 3 MB, `img2webp -near_lossless 40`; GIF only if the WebP fails
   the demo-recording skill's seam check). Story: the article at `https://essays.example/article.html`, paragraph 2
   gets selected, right-click, the native menu with "Speak selected text" highlighted, click, the real Kokoro voice
   reads it. Audio: `assets/media/src/audio/hero.wav` (af_heart, 1.0x, 15.58 s), post-muxed at the measured offset.
2. **`assets/media/voices.webp`**: a voice switch in the grouped 28-voice list. Needs the native `<select>` dropdown
   open (its optgroups are the whole point: American / British, female / male). Headless cannot show it truthfully:
   the closed select only changes its one-word label, so this was **skipped**, not faked.
3. **Store screenshots** (`scripts/capture/cws/render.sh` needs `window.png`, `contextmenu-crop.png`,
   `popup-anchored-crop.png`): shot 1 (native menu on the article), shot 2 (anchored popup, 1.3x, Connected), plus
   the tile and marquee, which the same script renders once its three inputs exist. Output under `assets/store/`.
4. **YouTube master + `demo-30s`** (not committed; under `/tmp/ntts-w3-out/`): the R07 storyboard, one real clip per
   scene from `assets/media/src/audio/` (`s1-rightclick`, `s2-british`, `s3-speed`, `s4-pdf`, `s5-offline`).
   - **PDF scene (store shot 4, "PDFs too, with ligatures fixed")**: `article.pdf` does NOT demonstrate the fix.
     Chrome/Skia writes a ToUnicode map that already turns the fi/fl/ffi glyphs back into plain letters;
     `pdftotext assets/media/src/article.pdf - | grep -c $'ﬁ'` finds 0 ligature code points. Either render a
     PDF whose text layer really carries U+FB01–FB04 (pdfTeX or a font with a ligature ToUnicode entry) and prove it
     with that `pdftotext` check, or drop the claim from shot 4 and the scene.
   - **Offline scene**: never toggle Wi-Fi. Show the helper's `/speak` succeeding while the port guard's log shows
     no request left 127.0.0.1, or cut the scene.

## Preconditions (check all before starting)

- The console is **unlocked** and the display **awake**, and the operator has agreed to hand over the screen for
  the run (about 10 minutes). Check: `ioreg -n Root -d1 -a | plutil -extract IOConsoleUsers.0.CGSSessionScreenIsLocked raw -`
  prints `false` (missing key also means unlocked).
- Keep it awake for the whole run: `caffeinate -d -t 3600` (run in the background; stop it afterwards). Anything
  that waits on compositor frames (screencapture, ScreenCaptureKit, CDP screencast) stalls while the display
  sleeps, and the tool call never returns: that is what killed three earlier attempts.
- `scripts/capture/build.sh && export PATH="$HOME/.cache/ntts-capture/bin:$PATH" && axcheck`: all four lines
  `true` (**Screen Recording** and **Accessibility** for the terminal chain). Never try to grant them from a
  script; if either is false, stop and ask.
- Close HUD-style and notification apps; turn on Do Not Disturb by hand.
- `lsof -nP -iTCP:9555 -sTCP:LISTEN` and `lsof -nP -iTCP:8250 -sTCP:LISTEN` are empty. An older helper on 8249
  may be running: leave it alone; the guard refuses 8249 inside the capture browser.
- Never write `~/Library/Application Support/NaturalTTS/config.json`: always start the helper with overrides.

## Commands

```bash
cd <worktree>
(cd chrome-extension && bun install --frozen-lockfile && bun run build)
OUT=/tmp/ntts-w3-out/gui-$(date +%Y%m%d-%H%M); mkdir -p "$OUT"
scripts/capture/versions.sh > "$OUT/toolchain.txt"

# 1. The real v1.5 helper on 8250 (overrides => the shared config.json is never read or written).
PY=<main checkout>/native-helper/Sources/NaturalTTSHelper/Resources/python-env/bin/python3
nohup native-helper/.build/release/natural-tts-helper --port 8250 --python "$PY" \
  --worker "$PWD/native-helper/Sources/NaturalTTSHelper/Resources/tts_worker.py" </dev/null >"$OUT/helper.log" 2>&1 &
echo $! > "$OUT/helper.pid"
timeout 60 bash -c 'until curl -sf 127.0.0.1:8250/health | grep -q "\"status\":\"ok\""; do sleep 1; done'

# 2. The capture browser, HEADED this time (no HEADLESS=1): window at (40,60), 1280x800, extension pinned,
#    stored port seeded to 8250, the guard refusing 8249 and serving https://essays.example/ from assets/media/src.
scripts/capture/launch.sh "$OUT" 8250
source "$OUT/env.txt"
node scripts/capture/cdp.mjs "$WS" about:blank 'location.href="https://essays.example/article.html"'
```

### Hero video

`demo.mjs` still drives the older Wikipedia story (selection → toolbar popup → speed ×3 → context menu). For the
hero, drive: select paragraph 2 (`article p:nth-of-type(2)`) with an animated selection, CDP right-click on it
(`Input.dispatchMouseEvent` type `mousePressed`, button `right`), wait for the NSMenu window (`winlist … layer=101`),
`hover` onto "Speak selected text", `click` it, then let the audio play out. Record each step's wall time.

```bash
sckrec $CHROME_PID 22 "$OUT/hero-raw.mov" 40 60 1280 800 --no-cursor &     # start first; it runs 22 s
node scripts/capture/<hero driver>.mjs "$WS" "$EXT_ID" essays.example "$OUT/timeline.json"; wait
ffmpeg -i "$OUT/hero-raw.mov" -vf "tpad=stop_mode=clone:stop_duration=2,fps=30" -c:v libx264 -profile:v high \
  -pix_fmt yuv420p -crf 20 -r 30 -movflags +faststart -an "$OUT/hero-video.mp4"
# <ms> = speak-click time in timeline.json + the measured video lag (R09: constant +0.93-1.00 s). Measure the lag on
# THIS take (a live-audio take with sckrec --exclude-others, cross-correlated with hero.wav), never assume it.
ffmpeg -i "$OUT/hero-video.mp4" -i assets/media/src/audio/hero.wav \
  -filter_complex "[1:a]adelay=<ms>|<ms>,apad[a]" -map 0:v -map "[a]" -shortest \
  -c:v copy -c:a aac -b:a 128k -movflags +faststart assets/media/hero.mp4
ffprobe -v error -show_entries stream=codec_name,profile,width,height,avg_frame_rate,pix_fmt -of compact assets/media/hero.mp4
```

Check the helper's own log shows the `/speak` that the click caused (the helper does not log request lines today;
the guard's `guard.jsonl` records every `127.0.0.1:8250/speak` the browser sent, with the target that sent it).

Poster and preview:

```bash
ffmpeg -ss <menu-open second> -i assets/media/hero.mp4 -frames:v 1 assets/media/hero-poster.png
mkdir -p "$OUT/pv"; ffmpeg -v error -t 7 -i assets/media/hero.mp4 -vf "fps=20,scale=960:-1:flags=lanczos" "$OUT/pv/%04d.png"
img2webp -loop 0 -d 50 -near_lossless 40 "$OUT"/pv/*.png -o assets/media/hero-preview.webp   # <= 3 MB
```

### Store inputs

```bash
node scripts/capture/cdp.mjs "$WS" "chrome-extension://$EXT_ID/background" 'chrome.storage.local.set({selectedSpeed:1.3})'
node scripts/capture/cdp.mjs "$WS" "chrome-extension://$EXT_ID/background" 'chrome.action.openPopup().then(()=>"ok")'
# then the README's "Anchored popup" and "Native context menu" recipes -> window.png, popup-anchored-crop.png,
# contextmenu-crop.png in $OUT, and:
scripts/capture/cws/render.sh "$OUT" assets/store
```

### Voices loop

Open the anchored popup, click the voice `<select>` (a real `click` at its centre opens the native menu), `hover`
down the American and British groups, and record with `sckrec` (no audio). Assemble with
`ffmpeg … fps=20` to PNGs and `img2webp -near_lossless 40` (≤ 3 MB).

## Clean-up

Kill only `$CHROME_PID`, `$GUARD_PID` and the pid in `$OUT/helper.pid`; stop `caffeinate`; `rm -rf "$PROFILE"`.
Then contact-sheet every video (`ffmpeg -i x.mp4 -vf "fps=1,scale=320:-1,tile=5x4" -frames:v 1 sheet.png`) and
look at it: no cursor, no infobar, no other app, menu not clipped, audio in sync.
