# Capture rig: README media and Chrome Web Store assets

The tools that produced every visual in the 2026-09 research run, committed so they outlive `/tmp`. The method and
the measurements behind each step are in `docs/research/2026-09-upgrade/R09-capture-recording-tooling.md` (including
its "Adversarial verification" section) and `UPGRADE_RESEARCH.md` §12. This README is the runnable recipe.

**Capture last.** Every asset is invalidated by a change to the architecture, the voice list, the popup states, the
icon or the default voice. Capture only after those have landed (`UPGRADE_RESEARCH.md` §12, precondition).

## Contents

| File | What it does |
|---|---|
| `build.sh` | Compiles the Swift tools below into `~/.cache/ntts-capture/bin` (or the directory you pass) |
| `axcheck.swift` | Preflight: prints Screen Recording, Accessibility and synthetic-input grants for this terminal |
| `winlist.swift` | Lists on-screen windows (`CGWindowListCopyWindowInfo`): id, pid, layer, bounds. Filter by owner |
| `sckrec.swift` | ScreenCaptureKit recorder for one app's windows, with audio. macOS 15+ |
| `sckapps.swift` | Lists the Chrome-like apps ScreenCaptureKit can share (diagnoses audio filter problems) |
| `hover.swift` | Moves the real cursor, runs a capture command, restores the cursor (highlights a menu item) |
| `click.swift` | One real OS left click at a screen point, then restores the cursor |
| `key.swift` | Posts one key press by virtual key code (does **not** dismiss Chrome's native menu) |
| `cdp.mjs` | Evaluates a JS expression in the first CDP target whose URL contains a substring (`--list` lists targets) |
| `cdp-browser.mjs` | Sends one browser-level CDP command (`Extensions.*`, `Browser.*`) |
| `demo.mjs` | The timed hero-demo driver: selection → real popup → speed ×3 → close → native context menu. Writes a timeline |
| `cws/*.html`, `cws/base.css` | Store-image templates (screenshots 1–2, small tile, marquee) |
| `cws/render.sh` | Renders the templates at the exact size, strips alpha, asserts dimensions, writes 640×400 proofs |
| `versions.sh` | Prints the toolchain versions; save its output next to every capture set |

The helper mock is **not** in this directory: it is `chrome-extension/tests/e2e/mock-helper.mjs`, shared with the
extension's E2E tests, so there is exactly one copy.

## Prerequisites

1. **macOS 15+** on Apple silicon for `sckrec` (`SCRecordingOutput`); every other tool runs on 13+.
2. **Privacy grants for the terminal app that runs these commands** (System Settings → Privacy & Security):
   **Screen Recording** (for `screencapture -l`, `winlist` titles and `sckrec`) and **Accessibility** (for `hover`,
   `click`, `key`). Check both with `axcheck`; all four lines must print `true`.
3. **Chrome for Testing 153** from Playwright's cache (version-pinned, so no auto-update drift between takes):
   `~/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`.
   `cws/render.sh` uses the matching `chromium_headless_shell-1243`. Install both with
   `npx playwright@1.63.0 install chromium chromium-headless-shell` if they are missing (1.63.0 pins revision 1243 = 153.0.8010.12).
4. **ffmpeg** and **ImageMagick 7** (`brew install ffmpeg imagemagick`). Homebrew's ffmpeg has no libwebp encoder;
   use `img2webp` (`brew install webp`) for WebP.
5. **Node 22+ or Bun** (the `.mjs` tools use the global `WebSocket`).
6. A built extension: `cd chrome-extension && bun run build`.

## One-time setup per session

```bash
scripts/capture/build.sh                      # compiles into ~/.cache/ntts-capture/bin
export PATH="$HOME/.cache/ntts-capture/bin:$PATH"
axcheck                                        # all four grants must be true
OUT=$HOME/ntts-captures/$(date +%Y%m%d-%H%M); mkdir -p "$OUT"
scripts/capture/versions.sh > "$OUT/toolchain.txt"
```

## Launch the capture browser

```bash
CFT="$HOME/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
DIST="$(cd chrome-extension/dist && pwd)"
EXT_ID=$(node -e 'const h=require("crypto").createHash("sha256").update(process.argv[1]).digest("hex").slice(0,32);console.log([...h].map(c=>String.fromCharCode(97+parseInt(c,16))).join(""))' "$DIST")
PROFILE=$(mktemp -d); mkdir -p "$PROFILE/Default"
echo "{\"extensions\":{\"pinned_extensions\":[\"$EXT_ID\"]}}" > "$PROFILE/Default/Preferences"   # pin the action
"$CFT" --user-data-dir="$PROFILE" --load-extension="$DIST" --test-type=gpu --use-mock-keychain \
  --password-store=basic --no-first-run --no-default-browser-check --window-size=1280,800 \
  --window-position=40,60 --remote-debugging-port=9555 about:blank &
CHROME_PID=$!
WS=$(curl -s 127.0.0.1:9555/json/version | node -pe 'JSON.parse(require("fs").readFileSync(0)).webSocketDebuggerUrl')
```

- `--test-type=gpu` removes CfT's "for automated testing" infobar. The extension ID is SHA-256 of the absolute
  `dist` path mapped to `a`–`p`, so it changes if the checkout moves (`lahgejbaodkdkgmmjgdbgagkepakpifd` for the main
  checkout).
- **Load first, then navigate.** With the v1.4 content script, tabs opened before the extension loaded got no
  injection. From v1.5 (IN-08) the selection is read on demand, but the order costs nothing, so keep it.
- **Fallback browser:** branded Chrome ignores `--load-extension` since 137. Launch it the same way without that flag
  and load the extension over CDP: `node scripts/capture/cdp-browser.mjs "$WS" Extensions.loadUnpacked "{\"path\":\"$DIST\"}"`.
- The MV3 service worker idles out after ~30 s; opening the popup wakes it.

Deterministic state, then the helper mock (never touches a real helper on 8249):

```bash
node scripts/capture/cdp-browser.mjs "$WS" Extensions.setStorageItems \
  "{\"id\":\"$EXT_ID\",\"storageArea\":\"local\",\"values\":{\"selectedVoice\":\"af_bella\",\"selectedSpeed\":1.0}}"
node chrome-extension/tests/e2e/mock-helper.mjs "$WS" 120 fixtures/<voice>.wav &   # interface: <browser-ws> <secs> <wav>
```

The fixture WAV must be **real output of the upgraded helper for the exact on-screen text and voice**, stored with a
provenance note (model, voice, speed, text, helper sha). The mock's `/voices` must list only voices the real helper
returns. Presenting mocked audio as something else breaks the Web Store's "don't misrepresent" rule.

Then open the article: `node scripts/capture/cdp.mjs "$WS" about:blank 'location.href="https://en.wikipedia.org/wiki/Speech_synthesis"'`.

## Assets

### Anchored popup (README PNG, store screenshot 1 source)

```bash
node scripts/capture/cdp.mjs "$WS" "chrome-extension://$EXT_ID/background" 'chrome.action.openPopup().then(()=>"ok")'
sleep 0.5                                            # popup fade-in: wait >= 400 ms
winlist "Google Chrome for Testing" | grep onscreen=true   # confirm a ~374x367 popup window exists; retry openPopup if not
screencapture -x -o -l <browser-window-id> "$OUT/window-raw.png"
magick "$OUT/window-raw.png" -profile "/System/Library/ColorSync/Profiles/sRGB Profile.icc" "$OUT/window.png"
magick "$OUT/window.png" -crop <w>x<h>+<x>+<y> +repage "$OUT/popup-anchored-crop.png"   # >= 1:1 CSS scale
```

- `screencapture -l` of the browser window returns the window with the popup composited on top; `-o` drops the
  shadow. It embeds the display profile, hence the sRGB conversion.
- **Never** send `Extensions.triggerAction` to the first `tab` target: the hidden component-extension page is listed
  first and crashed Chrome 153 six times in six. `demo.mjs` selects the tab by URL.

### Native context menu (store screenshot 2 source)

```bash
node scripts/capture/demo.mjs "$WS" "$EXT_ID" Speech_synthesis "$OUT/timeline.json"   # ends with the menu open
winlist "Google Chrome for Testing" | grep 'layer=101'                                  # the NSMenu window + bounds
hover <x> <y> 0.6 screencapture -x -o -l <browser-window-id> "$OUT/menu-raw.png"       # x,y = "Speak selected text"
magick "$OUT/menu-raw.png" -profile "/System/Library/ColorSync/Profiles/sRGB Profile.icc" "$OUT/menu.png"
magick "$OUT/menu.png" -crop <w>x<h>+<x>+<y> +repage "$OUT/contextmenu-crop.png"
```

Escape does not dismiss the menu; close the capture browser (`kill $CHROME_PID`) to end it.

### Hero video (README MP4, GIF, YouTube master)

```bash
sckrec $CHROME_PID 12 "$OUT/hero-raw.mov" 40 60 1280 800 --no-cursor &
node scripts/capture/demo.mjs "$WS" "$EXT_ID" Speech_synthesis "$OUT/timeline.json"; wait
ffmpeg -i "$OUT/hero-raw.mov" -vf "tpad=stop_mode=clone:stop_duration=2,fps=30" -c:v libx264 -profile:v high \
  -pix_fmt yuv420p -crf 20 -r 30 -movflags +faststart -an "$OUT/hero-video.mp4"
```

- SCK output is variable frame rate; the `tpad…,fps=30` step makes track durations match.
- **Canonical audio is post-muxed** from the fixture WAV at the offset `timeline.json` records for the speak step.
  Align it per take by cross-correlating against a live-audio take rather than trusting a constant (the measured
  video-to-driver lag was +0.93–1.00 s over only three events):
  `ffmpeg -i "$OUT/hero-video.mp4" -i fixture.wav -filter_complex "[1:a]adelay=<ms>|<ms>,apad[a]" -map 0:v -map "[a]" -shortest -c:v copy -c:a aac -b:a 128k -movflags +faststart "$OUT/hero.mp4"`.
- Live-audio proof needs `--exclude-others`: an inclusion filter records Chrome's audio as silence (−91 dB). Windows
  of apps that start after recording begins are not excluded, so close HUD-style apps first.
- GIF loop (≤ 2 MB):
  `ffmpeg -i "$OUT/hero-video.mp4" -vf "fps=15,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a" -loop 0 "$OUT/hero-960.gif"`.
- YouTube master (1080p, closed GOP 15, 2 B-frames, AAC 48 kHz, no edit list):

```bash
ffmpeg -i "$OUT/hero.mp4" -vf "tpad=stop_mode=clone:stop_duration=2,fps=30,scale=1920:-2:flags=lanczos,format=yuv420p" \
  -c:v libx264 -profile:v high -preset slow -b:v 8M -maxrate 10M -bufsize 16M -bf 2 -g 15 -keyint_min 15 \
  -sc_threshold 0 -flags +cgop -c:a aac -b:a 192k -ar 48000 -ac 2 -movflags +faststart -use_editlist 0 "$OUT/youtube.mp4"
```

### Chrome Web Store images

```bash
scripts/capture/cws/render.sh "$OUT" "$OUT/cws"
```

Needs `window.png`, `contextmenu-crop.png` and `popup-anchored-crop.png` in `$OUT` (from the two sections above).
Writes the two 1280×800 screenshots, the 440×280 small tile and the 1400×560 marquee, asserts each size, and writes
640×400 proofs: the store downscales screenshots to 640×400, so check the popup text is still legible there. Crop the
popup at ≥ 1:1 CSS scale; a whole-window framing leaves ~6 px text.

## Clean-up

`kill $CHROME_PID` (only the browser you launched), then `rm -rf "$PROFILE"`. Keep `$OUT/toolchain.txt` and the
fixture provenance with the assets.
