# R09: visual-evidence capture and recording tooling

**Date:** 2026-09-23 · **Axis:** R09 capture-recording-tooling · **Method:** empirical. I ran everything on this machine and wrote all scratch output under `/tmp/ntts-capture/`. I didn't rebuild the extension (`chrome-extension/dist` v1.4.0 was used as-is), I didn't start or stop the helper, and I didn't change any repo file except this one.

**Machine:** M1 Max, macOS 15.7.9, Google Chrome 153.0.8010.53, Chrome Dev 156.0.8063.3, and Chrome for Testing (CfT) 151.0.7922.34 from `~/Library/Caches/ms-playwright/chromium-1234`. Tools: agent-browser 0.27.1, ffmpeg 9.0.1 (Homebrew), ImageMagick 7.1.2-18, libwebp 1.6.0, VHS 0.11.0, asciinema 3.2.0, gh 2.96.0.

---

## Verdict

**Every visual-evidence target is capturable on this machine today, and I captured each one.** Covered: popup and options pages at 2x, the real toolbar popup anchored to the icon, the native macOS right-click menu with our item, the `chrome://extensions` card, a 60 fps screen video, a demo MP4 with the extension's real audio, a GIF/WebP under 10 MB, and all three Chrome Web Store (CWS) image sizes. One thing didn't transfer from the brief: the "load it in agent-browser" path it assumed. The rig that works is:

> **Branded Chrome with a throwaway profile, `--remote-debugging-port`, `--enable-unsafe-extension-debugging` and CDP `Extensions.loadUnpacked`** (the extension pre-pinned through the profile's `Preferences`)
> **+ a CDP `Fetch` mock of `127.0.0.1:8249`** (a deterministic "Connected" state without touching the real helper)
> **+ ScreenCaptureKit** (a 60 fps window video; audio needs a bundle-aware *exclusion* filter)
> **+ HTML→PNG templates** for CWS assets.

### Ranked recommendations

| # | Recommendation | Action | Conviction |
|---|---|---|---|
| 1 | Build the capture rig above as `scripts/capture/`. The pieces exist as working prototypes in `/tmp/ntts-capture/tools/`: `sckrec.swift`, `demo.mjs`, `mockhelper.mjs`, `cdp*.mjs`, `winlist.swift`, `hover/click.swift`. | adopt-new | 90 |
| 2 | Produce page-content shots (popup.html / options.html at 2x, the `chrome://extensions` card) through CDP screenshots. These are sRGB-true and deterministic. Headless CfT with `--load-extension` works, and so does branded Chrome over `--cdp`. | adopt-new | 92 |
| 3 | Produce the real toolbar popup and native context-menu shots with **branded** Chrome. Pin the extension first, open the popup with `Extensions.triggerAction` or `chrome.action.openPopup()`, then use `screencapture -o -l <windowId>`. CfT shows a permanent "only for automated testing" infobar, so it can't be used for marketing shots of the browser toolbar. | adopt-new | 90 |
| 4 | Demo audio: make **post-mux of the helper's WAV at a measured offset** the canonical, reproducible path. Keep the **live ScreenCaptureKit (SCK) capture** as the proof path (it's proven, but you have to handle the filter quirks). | adopt-new | 88 |
| 5 | README hero: a palette **GIF** at 960 px / 15 fps (1.5 MB, highest fidelity on flat UI), optionally served through `<picture>` with a WebP source. Put the MP4-with-audio in the README via a GitHub-uploaded (user-attachments) video. | adopt-new | 85 |
| 6 | CWS assets: HTML templates rendered at exact size and DPR 1 in headless Chrome, then `magick -alpha off -strip`. Use 1280×800 screenshots (up to 5), a 440×280 tile with no text, a 1400×560 marquee, and a YouTube video. | adopt-new | 88 |
| 7 | **Redesign the store icon before publishing.** `icon128.png` is a full-bleed square with no 16 px transparent padding, has aliased edges, uses a left-pointing "play" glyph, and has no vector source. | operator-decision | 90 |
| 8 | Upgrade agent-browser from 0.27.1 to **0.38.1**: 30 fps default, `--fps 1-60`, MP4 output, `--cursor`, `--contact-sheet`. It still records **no audio** and still can't side-load into branded Chrome. Do it after this research wave, because other agents are using it right now. | upgrade-now | 80 |
| 9 | Minor bumps: ffmpeg 9.0.1→9.0.2, ImageMagick 7.1.2-18→-31, VHS 0.11→0.12, asciinema 3.2.0→3.2.1. None of them changes capture capability. | hold | 70 |
| 10 | Install gifski 1.34.0 for GIF quality. It's optional: the ffmpeg palette GIF already reaches 43.7 dB PSNR at 1.5 MB. | evaluate | 55 |
| 11 | Don't use `screencapture -g` for audio (it records the **microphone**), and don't use agent-browser `record` for popup or menu footage (it captures **page viewport only**). | reject | 95 |

---

## 1. Loading the unpacked extension into an automatable browser

### 1.1 What actually happened (empirical)

| Attempt | Result | Evidence |
|---|---|---|
| `agent-browser --extension dist open …` (default, which is **branded Chrome 153**) | **Ignored silently.** Chrome launched with `--load-extension=… --disable-extensions-except=…`, but `chrome://extensions` lists nothing and no service worker target appears. | `/tmp/ntts-capture/ab-chrome153-extensions-page.png` (empty list). The process args were read with `ps`. |
| `agent-browser --executable-path <CfT 151> --extension dist` | **Works.** A service worker appears at `chrome-extension://lahgejbaodkdkgmmjgdbgagkepakpifd/background/service-worker.js`. | CDP `/json/list` |
| Same run: headless? | agent-browser **drops `--headless`** whenever `--extension` is given, so it runs headed. Without an extension it passes `--headless=new`. | `ps` args compared between sessions `ntts-cft` and `ntts-hl` |
| Forced headless: `--args "--headless=new"` + CfT + extension | **Works.** The service worker loads, `popup.html` renders at 2x, and `chrome.action.openPopup()` resolves. | `/tmp/ntts-capture/popup-headless-cft-2x.png` |
| **Branded Chrome 153** with `--remote-debugging-port=9555 --enable-unsafe-extension-debugging`, then CDP `Extensions.loadUnpacked {path}` | **Works over a TCP port.** It returned `{"id":"lahgejbaodkdkgmmjgdbgagkepakpifd"}`, and `Extensions.getExtensions` shows it enabled. | Command log. `/tmp/ntts-capture/chrome153-branded-window-with-popup.png` |
| Branded Chrome, after a restart | The CDP-loaded extension is **not persisted** (it's absent from `Preferences.extensions.settings`), but `chrome.storage.local` did survive: speed 1.2x carried over. | Python read of `profile-chrome153a/Default/Preferences` |

**Extension id is deterministic:** `lahgejbaodkdkgmmjgdbgagkepakpifd`. Chrome derives an unpacked extension's id from the SHA-256 of its absolute path (first 32 hex digits mapped to a–p), which I verified with a one-line Python hash. The id therefore **changes if the repo moves or a worktree is used**. A capture-only manifest copy carrying a `"key"` would pin it.

### 1.2 Why branded Chrome ignores the flag (primary sources)

- Chrome 137 removed `--load-extension` from **branded** builds only: "`--load-extension` will continue to function as before in non Chrome brands, such as Chromium and Chrome For Testing." Suggested alternatives: CfT, Load unpacked, Puppeteer, WebDriver BiDi. Source: [chromium-extensions PSA, 2025-04-04](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/1-g8EFx2BBY/m/S0ET5wPjCAAJ).
- Chrome 139 also removed `--disable-extensions-except` and `--extensions-on-chrome-urls` from branded builds; both remain in Chromium and CfT. Source: [PSA, 2025-06-12](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/FxMU1TvxWWg/m/daZVTYNlBQAJ).
- The CDP `Extensions` domain (experimental) provides `loadUnpacked`, `triggerAction`, `getExtensions`, `uninstall` and `get/set/remove/clearStorageItems`. Source: [devtools-protocol `Extensions.pdl`](https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/pdl/domains/Extensions.pdl).
- In Chromium, `triggerAction` requires a **`tab`-type** target (`"Action can only be triggered on a tab target."`) and calls `ExecuteUserAction(InvocationSource::kCdp)`. In other words it's a normal user action, not inspect mode. Source: [`chrome/browser/devtools/protocol/extensions_handler.cc`](https://chromium.googlesource.com/chromium/src/+/main/chrome/browser/devtools/protocol/extensions_handler.cc). Extension loading is only allowed on the **browser** session: [`chrome_devtools_session.cc`](https://chromium.googlesource.com/chromium/src/+/main/chrome/browser/devtools/chrome_devtools_session.cc).
- Library routes:
  - **Puppeteer** has `launch({enableExtensions:[path]})`, `browser.installExtension()` and `page.triggerExtensionAction()`. Latest is 25.12.0, published 2026-09-23. Sources: [pptr.dev guide](https://pptr.dev/guides/chrome-extensions), [npm](https://registry.npmjs.org/puppeteer).
  - **Playwright** needs `channel:'chromium'`, because "Google Chrome and Microsoft Edge removed side-loading". Headless works on that channel. Latest is 1.63.0, published 2026-09-04. Sources: [playwright.dev](https://playwright.dev/docs/chrome-extensions), [npm](https://registry.npmjs.org/playwright).

### 1.3 Gotchas found empirically (each cost a retry)

1. **Content scripts aren't injected into tabs that loaded before `loadUnpacked`.** The popup reported "Please select text on the webpage…" until the tab was reloaded. Always load the extension first, then navigate.
2. **The MV3 service worker idles out** after about 30 s and disappears from `/json/list`. Wake it by opening the popup. Playwright documents the same idle behavior ([source](https://playwright.dev/docs/chrome-extensions)).
3. **An unpinned action plus automation is flaky.** In two scripted runs one `triggerAction` created the popup page target with no visible window, and one run showed a full DevTools window for the popup. After pinning, **`triggerAction` succeeded 3/3 and `chrome.action.openPopup()` 3/3.** To pin, write `extensions.pinned_extensions:["<id>"]` into `Default/Preferences` before launch; `chrome.action.getUserSettings()` then returns `isOnToolbar:true`. `openPopup()` is available to all extensions since Chrome 127 ([chrome.action docs](https://developer.chrome.com/docs/extensions/reference/api/action)).
4. **Make state deterministic** with CDP `Extensions.setStorageItems` (voice and speed) before capture. Without it, persisted state leaks between takes (speed 1.2x→1.5x across my runs).
5. Launch branded Chrome with `--use-mock-keychain --password-store=basic`, which agent-browser already passes. Otherwise a fresh profile can raise a Keychain prompt. (The SecurityAgent prompt I saw on screen was *another agent's* `swift-package` asking for "github.com", not Chrome.)
6. Branded Chrome 153 lists the CDP-loaded extension under **"Safety Check: Chrome can't verify where this extension comes from"** (`/tmp/ntts-capture/out/chrome-extensions-page-2x.png`). Don't use that page state for marketing. Capture the `chrome://extensions` card from the published CWS install, or with Developer mode on.

## 2. Capturing things that aren't page content

**Permissions (read-only preflight, no settings changed):** a compiled Swift probe (`tools/axcheck`) reported `CGPreflightScreenCaptureAccess=true`, `AXIsProcessTrusted=true` and `CGPreflightPostEventAccess=true` for this terminal chain. Screen Recording, Accessibility and synthetic input are all available.

| Target | Working method | Output |
|---|---|---|
| Popup page (not anchored) | CDP screenshot, `set viewport 360 <contentHeight> 2`. **Avoid `screenshot --full` at DPR 2**: it produced a 1440×2240 canvas with the layout doubled. | `popup-cft-2x-tight.png` (720×938) · `out/popup-connected-2x.png` (720×708, "Connected") |
| Options page | CDP screenshot at 1280×800 @2x | `options-cft-1280x800-2x.png` (2560×1600) |
| **Real toolbar popup, anchored to the icon** | Open it (`Extensions.triggerAction` on the *tab* target, or `chrome.action.openPopup()` from the service worker), find the window with `tools/winlist` (a `CGWindowListCopyWindowInfo` wrapper), then `screencapture -x -o -l <browserWindowId>` | `out/chrome153-popup-connected-window.png` (2560×1600, branded, no infobar, "Connected") |
| **Native right-click menu with our item** | A CDP `Input.dispatchMouseEvent` right-click on a selection opens the **real NSMenu** (a layer-101 window). Capture it with `screencapture -l` or `-R x,y,w,h`. To highlight our item, move the real cursor over it with `tools/hover` (a CGEvent move, then the cursor is restored). | `ctxmenu-region-speak-highlighted.png` · `out/frame-contextmenu-2560x1600.png` |
| `chrome://extensions` card | CDP page screenshot (chrome:// WebUI can be captured) | `out/chrome-extensions-page-2x.png` |

Empirical facts about `screencapture` (local `man screencapture` on macOS 15.7.9):
- `-l <id>` of the **popup or menu window** returns the whole browser window with the popup or menu composited on top, byte-identical (ImageMagick AE=0) to `-l <browserId>`.
- `-o` drops the shadow.
- `-R` captures screen pixels, so it includes any window that overlaps the rectangle.
- **Color:** `screencapture` PNGs carry the display profile ("Color LCD"). The button measured `rgb(46,105,219)`, and converting to sRGB gives about `(6,107,227)`, matching CDP's sRGB `rgb(7,107,227)`. Convert before compositing: `magick in.png -profile "/System/Library/ColorSync/Profiles/sRGB Profile.icc" out.png`.

The menu item is titled **"Speak selected text"**, not "Read aloud" (`contextMenus.create({title:"Speak selected text"})` in `dist/background/service-worker.js`). Branded Chrome shows the extension icon beside it, and CfT showed no icon.

**NSMenu limits:** a CGEvent Escape did **not** dismiss the menu, and neither did page navigation. One real CGEvent click on the item didn't activate it (`mouseEventClickState` was probably 0; the tool now sets it to 1 but I didn't re-verify, because the menu closed). The reliable dismissal is to close the capture browser. **For the end-to-end speak demo, trigger speech from the popup** (proven below), not from the menu.

## 3. Video, audio, and the demo MP4

### 3.1 Recording methods compared (all run)

| Method | Frames | Audio | Captures popup/menu? | Evidence |
|---|---|---|---|---|
| agent-browser 0.27.1 `record` | VP8 WebM, **10 fps**, viewport only (2560×1426) | **None** | **No** (page only) | `ab-record-test.webm` (ffprobe: one vp8 stream) |
| `screencapture -v -V 3 -R …` | H.264, 2560×1600, ~59.6 fps, bt709 | Mic only (`-g`/`-G`) | Yes | `sc-video-region.mov` |
| **ScreenCaptureKit** `tools/sckrec` (Swift, `SCRecordingOutput`) | H.264, 2560×1600, up to 60 fps, **VFR** (a frame only on change) | **Yes, AAC 48 kHz stereo** (needs the right filter, below) | Yes | `hero-raw-sck2.mov`, `e2e-popup-speak3.mov` |

API availability (Apple docs data):
- `SCRecordingOutput`: macOS 15.0+ ([doc](https://developer.apple.com/documentation/screencapturekit/screcordingoutput)).
- `capturesAudio`: 13.0+ ([doc](https://developer.apple.com/documentation/screencapturekit/scstreamconfiguration/capturesaudio)).
- Both content-filter initializers: 12.3+ ([include](https://developer.apple.com/documentation/screencapturekit/sccontentfilter/init(display:including:exceptingwindows:)), [exclude](https://developer.apple.com/documentation/screencapturekit/sccontentfilter/init(display:excludingapplications:exceptingwindows:))).

No loopback audio device is installed; ffmpeg avfoundation lists only the MacBook mic and "Microsoft Teams Audio". So **SCK is the only way to capture Chrome's audio without installing anything.**

### 3.2 SCK audio: three measured filter behaviors (the non-obvious part)

| Filter | Video | Audio | Why |
|---|---|---|---|
| `SCContentFilter(display:, including:[Chrome app])` | good | **silent (−91 dB)** | Chrome renders audio in its AudioService helper, which isn't a shareable `SCRunningApplication` (verified with `tools/sckapps`) |
| `excludingApplications:` every app whose **pid** ≠ ours | **black** | good (−36.8 dB) | SCK groups by **bundle id**. Excluding the operator's other `com.google.Chrome` processes excluded ours too. |
| `excludingApplications:` every app whose **bundleIdentifier** ≠ ours (`--exclude-others`) | good | good (−36.8 dB) | This works. But windows from apps that appear *after* start aren't excluded: a third-party HUD ("Bound 8 app shortcuts") leaked into one take. |

**Proof that the captured audio is the played audio:** the source `welcome.wav` (24 kHz mono, 7.25 s) has a 0.528 s pause. The capture shows a 0.535 s pause at a constant +0.236 s offset (ffmpeg `silencedetect`).

**Proof on the extension's real playback path:** with the mock serving `/speak`, I clicked the popup's **Speak Selected Text** (content script → service worker → offscreen document → `fetch /speak` → `new Audio(blobURL)`). The mock logged `{"GET /health":2,"GET /voices":1,"POST /speak":1}`, the popup button turned green with "Stop", and SCK captured speech at mean −30.8 dB. The gap measured 0.528 s and the second phrase 3.70 s, both matching the source exactly. Output: `out/e2e-real-extension-audio-1280x800.mp4` (H.264 + AAC, 10 s, 594 KB, loudnorm → −21.1 dB mean).

**Recommendation:** use an **inclusion** filter for picture (clean) and either
(a) an exclusion filter for audio, or
(b) better, **post-mux the WAV the helper returned**. The offscreen document receives `audio/wav` (`HTTPServer.swift:170`) and plays it through a blob URL. The exact bytes are available via CDP `Network.getResponseBody` on the offscreen target, or via the mock's fixture.

The post-mux path is proven: `demo-postmux.mp4` puts speech exactly at 0.800 s delay + 0.445 s source lead-in = 1.245 s. The offset comes from the demo driver's timeline (`demo.mjs` writes wall-clock marks). The measured video−driver lag was a constant +0.93–1.00 s across three events.

### 3.3 Deterministic "Connected" state without touching the helper

`tools/mockhelper.mjs` runs `Fetch.enable` on the **browser-level** CDP session with pattern `http://127.0.0.1:8249/*` and fulfils `/health`, `/voices` (the six voices the real helper returned) and `/speak` (a real Kokoro WAV). The popup showed "Connected" with Bella/Sarah/Nicole/Sky/Adam/Michael, and the real helper on 8249 was never contacted. This is how marketing captures stay deterministic while another agent benchmarks the helper. **Caveat:** fixture audio must be real Kokoro output from the voice being shown. Presenting mocked output as something else would violate the CWS "don't misrepresent" rule ([best practices](https://developer.chrome.com/docs/webstore/best-listing)).

### 3.4 Encodes produced (all within budget)

| File | Spec | Size |
|---|---|---|
| `out/hero-demo-1280x800.mp4` | H.264 High@4.1, CFR 30, yuv420p, `+faststart` (moov at byte 36, before mdat) | 490 KB |
| `out/hero-demo-with-audio-1280x800.mp4` | Same, plus AAC-LC 48 kHz stereo, loudnorm −16 LUFS | 694 KB |
| `out/hero-960.gif` | ffmpeg `palettegen stats_mode=diff` + `paletteuse sierra2_4a`, 15 fps, loop, 960 w | **1.51 MB**, PSNR 43.7 dB vs source frame |
| `out/hero-800.gif` | 12 fps, 128 colors, bayer | 0.53 MB |
| `out/hero-960.webp` | `img2webp -lossy -q 72 -m 6` (ffmpeg here has **no libwebp encoder**) | 0.37 MB, PSNR 36.4 dB |
| `out/hero-960-mixed.webp` | `img2webp -mixed -q 80` | 0.94 MB, PSNR 37.4 dB |

All four are far under GitHub's 10 MB limit for images and GIFs ([docs](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/attaching-files)). On this flat UI, **the palette GIF beats lossy WebP on fidelity** (single-frame PSNR, frame alignment approximate), so the GIF is the primary asset.

SCK output is **VFR**: a static scene gave a 0.92 s video track against 6.5 s of audio. Always normalize with `tpad=stop_mode=clone:stop_duration=N,fps=30`, which I verified produces matching track durations.

**YouTube master (for the CWS video field)** follows [YouTube's upload spec](https://support.google.com/youtube/answer/1722171): MP4 with moov at the front and no edit lists; H.264 High, progressive, 2 consecutive B-frames, closed GOP of half the frame rate, CABAC, VBR, 4:2:0; AAC-LC 48 kHz stereo; about 8 Mbps at 1080p (5 Mbps at 720p). The command:

```
ffmpeg -i in.mov -vf "tpad=stop_mode=clone:stop_duration=2,fps=30,scale=1920:-2:flags=lanczos,format=yuv420p" \
  -c:v libx264 -profile:v high -preset slow -b:v 8M -maxrate 10M -bufsize 16M -bf 2 -g 15 -keyint_min 15 \
  -sc_threshold 0 -flags +cgop -c:a aac -b:a 192k -ar 48000 -ac 2 -movflags +faststart -use_editlist 0 out.mp4
```

My sample encodes used x264 defaults (bf 3, keyint 250). Use the command above for the YouTube upload.

**README video:** GitHub renders uploaded video "on repository Markdown files such as READMEs" ([changelog, 2021-05-13](https://github.blog/changelog/2021-05-13-video-uploads-now-generally-available/)). The limit is 10 MB on Free plans and 100 MB on paid ones ([docs](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/attaching-files)). `gh --attach` (gh ≥ 2.99.0; installed 2.96.0) only reaches issues, PRs and comments, not README files ([changelog, 2026-09-01](https://github.blog/changelog/2026-09-01-github-cli-media-in-issues-pull-requests-and-comments/)). That means a README video needs a one-time drag-and-drop in the web editor. `<picture>` is supported in GitHub Markdown ([docs](https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax)), so `<picture><source srcset="hero.webp" type="image/webp"><img src="hero.gif"></picture>` degrades safely. I didn't test a repo-relative `.mp4` rendering as a player; treat it as unsupported.

## 4. Chrome Web Store asset production

**Spec** ([images doc](https://developer.chrome.com/docs/webstore/images), [dashboard listing](https://developer.chrome.com/docs/webstore/cws-dashboard-listing), [best practices](https://developer.chrome.com/docs/webstore/best-listing)):
- Store icon 128×128 PNG, drawn as 96×96 artwork with 16 px transparent padding on each side, and working on light and dark backgrounds.
- 1 to 5 screenshots at 1280×800 (preferred) or 640×400, with square corners and full bleed.
- Small promo tile 440×280, required; guidance is "Avoid text", keep it legible at half size, and use saturated colors.
- Marquee 1400×560, optional.
- A YouTube video link.
- The small tile and marquee **can't be localized**.
- "Screenshots should demonstrate the actual user experience."

**Pipeline (proven):** HTML template plus real captures, rendered at an **exact viewport with DPR 1** in headless Chrome, then `magick -alpha off -strip`. All outputs have the exact sizes:

| Asset | File | Notes |
|---|---|---|
| Screenshot 1 | `out/cws-shot1-1280x800.final.png` | Real branded-Chrome window with the anchored "Connected" popup on a brand gradient. **Fix before shipping:** crop to the popup region at ≥1:1 CSS scale; at whole-window scale the popup text is about 6 px. |
| Screenshot 2 | `out/cws-shot2-1280x800.final.png` | Native menu with "Speak selected text". **Re-take** with the item highlighted (`tools/hover`, proven), not "Copy". |
| Small tile | `out/cws-tile-440x280.final.png` | No text: glyph plus waveform |
| Marquee | `out/cws-marquee-1400x560.final.png` | Title plus the real popup crop |

**Blocking design finding for (c):** `dist/icons/icon128.png` is 1,166 bytes, full-bleed with no transparent padding, aliased, and draws a **left-pointing** triangle (reads as "rewind"). There's no SVG or vector source anywhere in `chrome-extension/`. The CWS guidance asks for 96 px artwork with 16 px transparent padding that works on light and dark backgrounds. The icon needs a vector redesign before publishing.

**Other visual defects the captures exposed:**
1. The offline "Retry Connection" button renders as an unstyled native button (`popup-cft-2x.png`).
2. `popup.css` and `options.css` have no `prefers-color-scheme` rules, so the UI stays light in dark-mode Chrome. That matters for dark-variant README images.
3. The popup has a fade-in, so wait at least 400 ms after opening before capturing.

## 5. Current vs latest (tool versions, all fetched 2026-09-23)

| Tool | Installed | Latest | Source | Relevance |
|---|---|---|---|---|
| agent-browser | 0.27.1 | **0.38.1** (2026-09-16) | [npm](https://registry.npmjs.org/agent-browser), [releases](https://github.com/vercel-labs/agent-browser/releases) | 0.37.0: 30 fps default, `--fps 1-60`, `Page.startScreencast`, MP4 output, `doctor` checks ffmpeg. 0.38.0: `--cursor` (animated pointer and click ripple), `--contact-sheet`, `screenshot --if-changed`. 0.38.1: cursor timing fix. **No audio and no extension-loading changes** in the last 40 releases. |
| Google Chrome (branded) | 153.0.8010.53 | CfT Stable **154.0.8037.57** | [CfT last-known-good JSON](https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions.json) | Auto-update pending. Branded builds ignore side-load flags (137/139). |
| Chrome Dev | 156.0.8063.3 | 156.0.8063.3 | same | Current. Its distinct bundle id (`com.google.Chrome.dev`) isolates SCK capture from the operator's own Chrome windows. |
| CfT via Playwright cache | 151.0.7922.34 (chromium-1234) | Playwright **1.63.0** (2026-09-04) | [npm](https://registry.npmjs.org/playwright) | Side-load works, but the infobar rules it out for toolbar shots |
| Puppeteer | not installed | **25.12.0** (2026-09-23) | [npm](https://registry.npmjs.org/puppeteer) | `installExtension` / `triggerExtensionAction` on all channels. An alternative to raw CDP. |
| FFmpeg | 9.0.1 | **9.0.2** (2026-09-18) | [ffmpeg.org](https://ffmpeg.org/download.html) | Point release. The Homebrew build lacks `libwebp`. |
| ImageMagick | 7.1.2-18 | **7.1.2-31** (2026-09-03) | [GitHub](https://github.com/ImageMagick/ImageMagick/releases) | Point releases |
| libwebp (img2webp) | 1.6.0 | 1.6.0 | [webmproject](https://storage.googleapis.com/downloads.webmproject.org/releases/webp/index.html) | Current |
| gifski | — | 1.34.0 (2025-07-13) | [GitHub](https://github.com/ImageOptim/gifski/releases) | Optional quality upgrade |
| VHS | 0.11.0 | **0.12.0** (2026-09-09) | [GitHub](https://github.com/charmbracelet/vhs/releases) | Adds Rows/Cols sizing. For a terminal clip of the helper. |
| asciinema | 3.2.0 | 3.2.1 (2026-06-16) | [GitHub](https://github.com/asciinema/asciinema/releases) | Patch release |
| gh | 2.96.0 | needs ≥2.99.0 for `--attach` | [changelog](https://github.blog/changelog/2026-09-01-github-cli-media-in-issues-pull-requests-and-comments/) | Issues and PRs only |

**Migration steps:**
- `npm i -g agent-browser@0.38.1 && agent-browser doctor`. Wait until concurrent agents' sessions (`default`, `r07c`) are idle.
- `brew upgrade ffmpeg imagemagick vhs asciinema`.
- Optionally `brew install gifski`.
- None of these is a breaking change for the rig. agent-browser 0.37 added **stricter recording validation**: missing ffmpeg or an extensionless output path now fails early.

## 6. Reproduction recipe (condensed, all steps proven)

```bash
# 1. Isolated branded Chrome with the action pinned (seed Preferences once, then launch)
mkdir -p /tmp/cap/profile/Default && echo '{"extensions":{"pinned_extensions":["lahgejbaodkdkgmmjgdbgagkepakpifd"]}}' > /tmp/cap/profile/Default/Preferences
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --user-data-dir=/tmp/cap/profile \
  --remote-debugging-port=9555 --enable-unsafe-extension-debugging --use-mock-keychain --password-store=basic \
  --no-first-run --no-default-browser-check --window-size=1280,800 --window-position=40,60 about:blank &
# 2. Extensions.loadUnpacked {path: <abs dist>} on the browser WS, THEN navigate the tab (content scripts)
# 3. node mockhelper.mjs <ws> 60 kokoro.wav   (browser-level Fetch mock of 127.0.0.1:8249)
# 4. Extensions.setStorageItems {id, storageArea:"local", values:{selectedVoice, selectedSpeed}}
# 5. sckrec <chromePid> <secs> out.mov 40 60 1280 800 [--exclude-others for audio] --no-cursor
#    while node demo.mjs <ws> <extId> <urlSubstring> timeline.json  (selection -> popup -> speed -> menu)
# 6. ffmpeg: tpad+fps=30 normalize -> MP4 faststart; palettegen GIF; adelay post-mux WAV at timeline offset
# 7. CWS: headless render of HTML templates at exact viewport, DPR 1; magick -alpha off -strip
```

## 7. Sample outputs (all under `/tmp/ntts-capture/`)

- `out/`:
  - `chrome153-popup-connected-window.png`
  - `popup-connected-2x.png`
  - `frame-contextmenu-2560x1600.png`
  - `chrome-extensions-page-2x.png`
  - `hero-demo-1280x800.mp4`
  - `hero-demo-with-audio-1280x800.mp4`
  - `e2e-real-extension-audio-1280x800.mp4`
  - `hero-960.gif`
  - `hero-800.gif`
  - `hero-960.webp`
  - `hero-960-mixed.webp`
  - `cws-shot1-1280x800.final.png`
  - `cws-shot2-1280x800.final.png`
  - `cws-tile-440x280.final.png`
  - `cws-marquee-1400x560.final.png`
- Root:
  - `popup-cft-2x-tight.png`
  - `popup-headless-cft-2x.png`
  - `options-cft-1280x800-2x.png`
  - `sc-window-cft-options.png`
  - `popup-real-anchored-region.png`
  - `ctxmenu-region-speak-highlighted.png`
  - `ab-record-test.webm`
  - `sc-video-region.mov`
  - `sck-bundle-exclude-test.mov`
  - `hero-raw-sck2.mov`
  - `e2e-popup-speak3.mov`
  - `demo-postmux.mp4`
- `tools/`:
  - `sckrec.swift`
  - `sckapps.swift`
  - `winlist.swift`
  - `axcheck.swift`
  - `hover.swift`
  - `click.swift`
  - `key.swift`
  - `cdp.mjs`
  - `cdp-browser.mjs`
  - `demo.mjs`
  - `mockhelper.mjs`
- `cws/`: the HTML templates and `base.css`.

**Side effects on this machine:**
- The real cursor was moved twice (hover and click) and restored each time.
- One CGEvent Escape was posted.
- My three short audio test clips played on the speakers.
- All of my browser sessions and the isolated Chrome on port 9555 are closed.
- CfT pid 24513 and agent-browser session `r07c` belong to another agent and were left alone.

---

## Adversarial verification (2026-09-23)

**Verifier method.** I re-derived each load-bearing claim from a primary source fetched today, and re-ran the empirical ones on this machine. Every browser launch used a throwaway `--user-data-dir` under `/tmp/ntts-r09v/`. I killed only processes I had started, and I changed no repo file except this appended section. Scripts and evidence are in `/tmp/ntts-r09v/`: `cdp-test.mjs`, `trig.mjs`, `trials.sh`, `trials2.sh`, `cft-infobar.sh`, `cft-default.png`, `cft-gputest.png` and `icon128-x4.png`.

**Result: 11 of 12 claims confirmed, 5 of them with corrections; 1 claim partly unverifiable (the "why" behind the SCK audio behaviour). Nothing was refuted outright.** Three findings change the recommendations:
- The Chrome for Testing (CfT) infobar is **not permanent**.
- `Extensions.triggerAction` can **crash Chrome**.
- `--enable-unsafe-extension-debugging` is **not what enables** `loadUnpacked` on Chrome 153.

### Verdict table

| # | Claim | Verdict | Primary source / what I ran | Correction |
|---|---|---|---|---|
| 1 | Branded Chrome 153 ignores `--load-extension` | **confirmed** | Own run: 153.0.8010.53 with `--load-extension=<dist>`. `Extensions.getExtensions` returned `[]` and there was no `lahgej…` service worker. The [PSA of 2025-04-04](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/1-g8EFx2BBY/m/S0ET5wPjCAAJ) says "`--load-extension` will continue to function as before in non Chrome brands, such as Chromium and Chrome For Testing". | My run was `--headless=new`; the author's was headed. Both agree. |
| 2 | CDP `Extensions.loadUnpacked` over a TCP port with `--enable-unsafe-extension-debugging` loads into branded 153 | **confirmed** | Own run returned `{"id":"lahgejbaodkdkgmmjgdbgagkepakpifd"}`, and the headed run started `background/service-worker.js`. The id equals SHA-256(abs path) mapped to a–p. | **The flag is not what enables it.** My negative control *without* the flag loaded too, both headless and headed. On `main`, `extensions_handler.cc` gates loading only on the *browser* session (`allow_loading_extensions_`), and the current [`Extensions.pdl`](https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/pdl/domains/Extensions.pdl) no longer has the older "Available if … `--remote-debugging-pipe` … and `--enable-unsafe-extension-debugging`" sentence. Third-party PDL copies still carry it (e.g. `mattsse/chromiumoxide`). Keeping the flag is harmless. |
| 3 | `triggerAction` requires a tab-type target and runs `ExecuteUserAction(InvocationSource::kCdp)` | **confirmed** | [`extensions_handler.cc` @main](https://chromium.googlesource.com/chromium/src/+/main/chrome/browser/devtools/protocol/extensions_handler.cc), `TriggerAction` (about L165-201): `"Action can only be triggered on a tab target."` then `ExecuteUserAction(…::kCdp)`. | **Crash hazard the report missed.** The handler dereferences `GetBrowserForTabContents(...)` and `GetActionForId(...)` with **no null check**. `Target.getTargets({filter:[{type:'tab'}]})` lists the hidden component-extension background page (`chrome-extension://nkeimho…/background.html`) **first**. Passing that target **segfaulted Chrome 153 in 6/6 runs** (`Segmentation fault: 11`). Select the tab by URL or window. |
| 4 | Pinned via `extensions.pinned_extensions`, `triggerAction` and `openPopup` each opened the visible popup 3/3; unpinned was flaky | **confirmed** | The pref name is in `extensions/browser/pref_names.h:131` (`kPinnedExtensions = "extensions.pinned_extensions"`). [action docs](https://developer.chrome.com/docs/extensions/reference/api/action): `openPopup()` "Chrome 127+", policy-only in 118–126. Own trials used `trig.mjs` with a CGWindowList check for a 374×367 popup window. | Replication: pinned `openPopup` **3/3**. Pinned `triggerAction` **6/7**: one run created the `popup.html` target with no visible window, which is the same failure mode the author attributed to unpinned runs. Unpinned `triggerAction` 1/3. Unpinned `openPopup` 2/3, with one `"Could not find an active browser window."` Pinning helps but isn't a guarantee, so the rig needs a visible-window check plus a retry. |
| 5 | agent-browser drops `--headless` when `--extension` is passed; CfT 151 loads the extension and shows a permanent "only for automated testing" infobar | **confirmed (first half) / corrected (second)** | agent-browser source: `cli/src/native/cdp/chrome.rs` at [v0.27.1](https://github.com/vercel-labs/agent-browser/blob/v0.27.1/cli/src/native/cdp/chrome.rs) L177-180 and at v0.38.1 L504-507, "Skip --headless when extensions are loaded". The CfT default launch shows the infobar (`cft-default.png`). | **The infobar is NOT permanent.** Per [`infobar_utils.cc` @main](https://chromium.googlesource.com/chromium/src/+/main/chrome/browser/ui/startup/infobar_utils.cc) L108-113 and L182-195, the CfT infobar is skipped when `--test-type=gpu` is passed, or when the managed policy `CommandLineFlagSecurityWarningsEnabled=false` is set. Verified: the same CfT 151.0.7922.34 build with `--test-type=gpu` renders **no infobar** (`cft-gputest.png`), and the toolbar is otherwise identical. |
| 6 | SCK inclusion filter on the Chrome app gives silent audio (−91 dB); a bundle-id-aware exclusion filter gives −36.8 dB with correct video | **confirmed (measurement) / unverifiable (explanation)** | `ffmpeg volumedetect`: `sck-app-audio-test.mov` mean −91.0 dB, `sck-bundle-exclude-test.mov` mean −36.8 dB (max −18.0). Frame 0 of both is non-black (mean luma 0.90). Apple doc JSON: `SCRecordingOutput` macOS 15.0, `capturesAudio` 13.0, both `SCContentFilter` initializers 12.3. | Neither cause is in Apple's docs: "Chrome audio comes from a non-shareable AudioService helper" and "SCK groups by bundle id". Treat both as hypotheses. The measured behaviour is what the rig should encode. |
| 7 | Real playback path captured live; the 0.528 s gap matches the source WAV exactly; helper mocked via browser-level CDP `Fetch` | **confirmed, "exactly" corrected** | `mock6.log` = `{"GET /health":2,"GET /voices":1,"POST /speak":1}`, written 13 s after `e2e-popup-speak3.mov` (the take behind the MP4). `mockhelper.mjs` calls `Fetch.enable` on `http://127.0.0.1:8249/*`. The MP4 is 593,762 B, 10.0 s, H.264 + AAC, mean −21.1 dB. | `silencedetect` depends on the threshold. Mid-phrase gap, source vs capture: −30 dB 0.557 vs 0.533 s; −40 dB 0.532 vs 0.520 s; −50 dB 0.518 vs 0.510 s. Second phrase at −40 dB: 3.696 vs 3.702 s. That is a match **within 8–24 ms**, not an exact one. It's still strong evidence the captured audio is the served WAV. I didn't re-run the click-through itself. |
| 8 | agent-browser 0.27.1 `record` gives 10 fps VP8 WebM, viewport only, no audio; 0.37.0+ adds 30 fps/MP4, and the notes don't mention audio | **confirmed** | `ffprobe ab-record-test.webm`: a single `vp8` stream, 2560×1426, `r_frame_rate=10/1`. [Releases](https://github.com/vercel-labs/agent-browser/releases): v0.37.0 (2026-09-08) adds "30 fps by default, `--fps 1-60`, `Page.startScreencast`… WebM and MP4". v0.38.0 adds `--cursor` and `--contact-sheet`. "audio" appears in none of the 45 releases from v0.23.0 to v0.38.1. | — |
| 9 | CWS: 1–5 screenshots at 1280×800 or 640×400, full bleed; 440×280 small tile (avoid text); optional 1400×560 marquee; 128×128 icon with 96×96 artwork and 16 px transparent padding | **confirmed** | [images](https://developer.chrome.com/docs/webstore/images) ("The actual icon size should be 96x96… an additional 16 pixels per side should be transparent padding"; "Square corners, no padding (full bleed) 1280x800 or 640x400"; "Small: 440x280 pixels (required) Marquee: 1400x560"; "Avoid text"). [dashboard listing](https://developer.chrome.com/docs/webstore/cws-dashboard-listing): "At least one 1280x800 px screenshot, up to 5 total". | Two items the report missed. (a) The images page (last updated 2018-06-11) says "**Currently, all screenshots are downscaled to 640x400 pixels**". (b) The two pages **disagree about video**. The dashboard page puts "A link to a YouTube video" among the items you "must provide… with the exception of the Marquee promo tile", while the images page says "Only the extension icon, a small promotional image, and a screenshot are mandatory". |
| 10 | GitHub allows 10 MB for images/GIFs and renders uploaded video in READMEs | **confirmed** | [attaching-files](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/attaching-files): "10MB for images and gifs; 10MB for videos… free… 100MB… paid". [changelog 2021-05-13](https://github.blog/changelog/2021-05-13-video-uploads-now-generally-available/): "…as well as on repository Markdown files such as READMEs". | — |
| 11 | `icon128.png` is a 1,166-byte full-bleed square, aliased, with a left-pointing glyph and no vector source | **confirmed** | 1166 bytes. `magick identify`: Palette, sRGB, **no alpha channel**. The 4× view shows stair-stepped edges and a left-pointing triangle in two rings. `public/icons/icon128.png` is byte-identical to the `dist` copy. There's no `.svg`/`.icns`/`.ai`/`.fig` outside `node_modules` and `.build`. | Nuance: the white artwork already sits in a 97×97 box at +16+16. The 96-px safe area exists, but the 16-px margin is **opaque blue**, not transparent. |
| 12 | agent-browser latest is 0.38.1 (2026-09-16) vs 0.27.1 installed; CfT Stable is 154.0.8037.57 vs branded 153.0.8010.53 installed | **confirmed** | [npm](https://registry.npmjs.org/agent-browser): `latest` 0.38.1, published 2026-09-16T20:06:53Z. [CfT JSON](https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions.json), timestamp 2026-09-23T17:20:45Z: Stable 154.0.8037.57, Dev 156.0.8063.3. Local `--version`: 153.0.8010.53 and 0.27.1. | — |

**§5 table spot-checks: all confirmed.**
- ffmpeg 9.0.2, released 2026-09-18 ([download page](https://ffmpeg.org/download.html)). The Homebrew `ffmpeg` 9.0.2 formula has no `webp` dependency ([formulae API](https://formulae.brew.sh/api/formula/ffmpeg.json)).
- GitHub releases:
  - ImageMagick 7.1.2-31 (2026-09-03)
  - VHS v0.12.0 (2026-09-09)
  - asciinema v3.2.1 (2026-06-16)
  - gifski 1.34.0 (2025-07-13), which is 14 months old but still latest
- npm: Puppeteer 25.12.0 (2026-09-23T12:57Z) and Playwright 1.63.0 (2026-09-04).
- gh `--attach` needs v2.99.0 (2026-09-01) and covers only `issue create/edit/comment` and `pr create/edit/comment` ([changelog](https://github.blog/changelog/2026-09-01-github-cli-media-in-issues-pull-requests-and-comments/)). The current gh is v2.101.0 (2026-09-15).
- `man screencapture`: "`-g` Captures audio during a video recording using default input". That's the mic, so reject #11 stands.

### Challenges to recommendations with conviction ≥ 80

| Rec | Author | Challenge | Adjusted |
|---|---|---|---|
| **1. Branded Chrome + CDP `loadUnpacked` rig** | 90 | (a) **Version drift.** Branded Chrome auto-updates (Stable is already 154, local is 153), and the `Extensions` domain is `experimental`, so the rig's behaviour can change between takes with no signal. The report's only reason to reject a pinnable browser, the CfT infobar, is refuted: CfT with `--test-type=gpu` has no infobar, supports `--load-extension` natively, and doesn't auto-update. Screenshot CfT and branded side by side before committing to branded. (b) **Crash hazard.** The rig's `triggerAction` must select the tab by URL or window id, never the first `tab` target. Prefer `chrome.action.openPopup()` from the service worker, and wrap it in a winlist visible-window check with a retry. (c) Puppeteer 25.12 already wraps `installExtension` and `triggerExtensionAction`. Hand-rolled `cdp*.mjs` means maintaining protocol code for an experimental domain. (d) The project runtime is **bun**; `node` exists only via fnm. Write `scripts/capture/` for `bun`, which has a global `WebSocket`. | 78 |
| **2. Page-content shots via CDP** | 92 | `popup.html` opened as a tab isn't the popup context. Its `chrome.tabs.query` "active tab" becomes the popup's own tab; commit `fe2ea58` "robust tab query for detached popups" exists because of this. So selection-dependent states ("Speak Selected Text" enabled) need the real anchored popup. agent-browser's own source comment says content scripts aren't injected under `--headless=new`, so any shot that depends on the content script must be headed. The pure-UI shots (connected state, options) are fine. | 88 |
| **4. Post-mux helper WAV as the canonical audio** | 88 | (a) **Sequencing.** Every fixture is tied to today's Kokoro-82M voices: `mockhelper.mjs` serves a six-voice `/voices` list and a v1.4.0-era WAV. If R01's model or voice upgrade lands, every demo asset is stale, so capture **after** the model decision and after the UI fixes this report found (unstyled Retry button, no dark mode, icon). (b) The offset comes from a measured +0.93–1.00 s video-to-driver lag over only 3 events. Align per take by cross-correlating the live SCK track against the WAV instead of trusting a constant. | 82 |
| **5. README hero: palette GIF plus a `<picture>` WebP source, and an uploaded MP4** | 85 | (a) GitHub's motion setting covers "animated **.gif** images" and syncs with the OS reduced-motion preference by default ([accessibility settings](https://docs.github.com/en/account-and-profile/setting-up-and-managing-your-personal-account-on-github/managing-user-account-settings/managing-accessibility-settings)). An animated WebP `<source>` may bypass that. Ship GIF-only, or add a static `media="(prefers-reduced-motion: reduce)"` source. (b) The README video is a manual web-editor upload that yields an unversioned `user-attachments` URL. An untested scriptable route is `gh issue/pr comment --attach` (gh ≥ 2.99.0) to mint the URL, then reference it from the README. Testing it creates a public comment, so it's the operator's call. (c) Uploaded video has no caption track. Burn in on-screen text, or add a transcript line. | 80 |
| **6. CWS assets via HTML templates** | 88 | The spec says screenshots are **downscaled to 640×400**, so a whole-window 1280×800 shot puts popup text at about 3 px. Crop to the popup at ≥ 2× CSS scale and proof every asset at 640×400. The docs disagree on whether the YouTube link is mandatory, so check the live dashboard. Publishing a YouTube video under the operator's identity is an operator decision. | 85 |
| **7. Store icon redesign (operator-decision)** | 90 | The defect is confirmed, but only part of it is a taste call. Making the 16-px margin transparent, anti-aliasing the edges and adding an SVG source are objective CWS-compliance work an agent can do. Only the glyph (the left-pointing "rewind" reading) and the style need the operator. Split it: the agent drafts vector variants that meet the spec, and the operator picks one. Also, the 16/48 px toolbar icons need their own full-bleed treatment and shouldn't just be downscales of the padded 128. | 90 (split) |
| **8. agent-browser 0.27.1 → 0.38.1, upgrade-now** | 80 | The recommended rig uses agent-browser for **none** of its hard parts. 0.38.1 still side-loads only via `--load-extension` (`chrome.rs` L553-557), which branded Chrome ignores. It records no audio. It can't capture the popup or native menu. Its gain, 30–60 fps page-viewport recording plus `--cursor`, is already covered by SCK at 60 fps. It's also installed under an fnm-managed Node (`~/Library/Caches/fnm_multishells/…/bin/agent-browser`), so `npm i -g` upgrades one Node version, machine-wide, with other agents using it. That's not "upgrade-now". | 55 → **hold/evaluate** |
| **11. Reject `screencapture -g` / agent-browser `record` for popup** | 95 | Stands. The man page says "default input", and 0.38.x still uses `Page.startScreencast`, which captures page content only. | 95 |

### Items the author missed

1. **CfT without the infobar.** `--test-type=gpu` (verified) or the managed policy `CommandLineFlagSecurityWarningsEnabled=false` removes it. That makes a version-pinned, `--load-extension`-capable CfT a real candidate for every shot, including toolbar marketing shots, and it removes the auto-update drift risk.
2. **`Extensions.triggerAction` can take down the browser.** There's no null check on the browser pointer, and the hidden component-extension "tab" is listed first. It crashed 6/6 when misdirected. Encode "select the tab by URL" in the rig and prefer `openPopup()`.
3. **Documentation drift on the gating flag.** On Chrome 153, `loadUnpacked` over TCP works without `--enable-unsafe-extension-debugging`. Don't cite the flag as the enabler. Keep it only as forward-compat insurance.
4. **Puppeteer 25.12 as the maintained implementation** (`enableExtensions`, `installExtension`, `page.triggerExtensionAction`; [guide](https://github.com/puppeteer/puppeteer/blob/main/docs/guides/chrome-extensions.md)) instead of bespoke `cdp*.mjs`. The report names it but never evaluates it.
5. **Capture belongs last in the program.** R01 (model/voices), the UI defects found here (no `prefers-color-scheme`, unstyled Retry button, 400 ms fade) and the icon redesign each invalidate captured assets. Capture after all of them.
6. **README accessibility.** Reduced motion, alt text, captions or a transcript for the MP4, and dark/light `<picture>` variants, which the UI can't provide until dark mode exists.
7. **The CWS 640×400 downscale** and the **conflicting YouTube requirement** (see verdict 9).
8. **Pin and record the capture toolchain** in `scripts/capture/`: the browser build, the agent-browser/ffmpeg/magick versions, and a TCC preflight like `axcheck`. Captures then become reproducible artifacts, not one-offs.
9. **Mock honesty guard.** The mock's `/voices` must list only voices the real (post-upgrade) helper returns, and each fixture WAV must be real output from the voice on screen. Store fixture provenance (model id, voice, text, helper version) next to each WAV.

**Verifier side effects:**
- About 25 short-lived headed Chrome 153 or CfT 151 windows and 3 headless instances opened and closed, all on throwaway profiles under `/tmp/ntts-r09v/`.
- One of my own hung Chrome processes (pid 3703, profile `pt-unpinned-open-1`) needed `kill -9` after I checked its profile path.
- Six throwaway-profile Chrome instances segfaulted, all from the misdirected `triggerAction` batch. The two correctly targeted batches (6 and 4 runs) had no crashes.
- No real helper traffic, no cursor moves, no audio played.
- No repo file changed except this appended section.
