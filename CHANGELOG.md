# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.5.1] - 2026-09-24

A loudness release. Kokoro speech now plays at one steady level whatever the length of the selection, and the
system-voice fallback plays at that level too. The decision, its measurements and the options weighed are in
`docs/research/2026-09-upgrade/limiter-decision/README.md`.

### Changed
- **The helper's speech is at −21 LUFS, with a true-peak limiter of at most 3 dB.** 1.5.0 aimed at −16 LUFS with a
  single gain per response. The loudest syllable capped that gain, so a long read landed up to 8 LU quieter than a
  short one in the same voice: af_heart went from −16.8 to −22.9 LUFS, am_michael from −17.6 to −25.6.
  - **How it works now.** The worker aims at −21 LUFS, which plays at about −18 in stereo, AES TD1008's level for
    speech. When the peak ceiling (−1.5 dBTP, unchanged) stops the single gain short of that, a lookahead limiter
    takes at most 3 dB off the loudest peaks. It has a 5 ms attack and a 60 ms release.
  - **Measured on the 15-case gate** (5 voices × 3 lengths): 14 of 15 cases land at −21.0 LUFS by ffmpeg's meter.
    The peakiest, am_michael's 26 s read, stops at the 3 dB cap at −22.1. No sample passes −1.5 dBTP, and at most
    0.27% of samples are more than 1 dB down.
  - **On 85 files including 1.5–3 minute articles:** −23.1 … −21.0 LUFS, where 1.5.0 spread from −25.6 to −16.0.
  - **Cost:** 3.2–3.7% of synthesis time.
  - **Against 1.5.0:** short selections play up to 5 dB quieter. Long, peaky reads that 1.5.0 left near −25 play up
    to 3 dB louder.
  - **Rollback:** `LIMITER_MAX_GR_DB = 0.0` in `tts_worker.py` turns the limiter off, leaving the single gain
    toward −21.
- **The system-voice fallback plays Samantha at `chrome.tts` volume 0.8.**
  - **Why:** Samantha, the American default, speaks at about −16.4 LUFS at full volume. 0.8 lowers her 4.8 dB, to
    Kokoro's level.
  - **Every other voice stays at 1.0.** The British fallbacks are already at or below Kokoro.
  - **Measured across 5 voices × 4 lengths,** Kokoro against the fallback for the same text: the largest American
    jump goes from 9.6 LU to 1.9, and the British one is −1.5 … 0.
- Versions: extension, helper `/health` and the worker environment report 1.5.1; the Homebrew formula points at the
  v1.5.1 tag.

### Not measured
- **The fallback volume through Chrome's live audio path.** CoreAudio output on the build Mac was stalled for the whole
  session. Volume 0.8 rests on `AVSpeechSynthesizer` renders with the same `AVSpeechUtterance.volume` that Chrome
  sets. If a live capture reads about −1.9 dB at 0.8 rather than −4.8, the value becomes about 0.58.
- **A blind listening test of the 3 dB worst case.** If one ever hears the limiting, set `LIMITER_MAX_GR_DB = 0.0`.
- The README's recordings were made by the 1.5.0 helper at −16 LUFS and are left as made (`assets/media/PROVENANCE.md`).

## [1.5.0] - 2026-09-23

The 2026-09 upgrade program. It rebuilds the helper on a locked, current MLX stack. It narrows the extension's
permission to the local helper only, and it turns every silent failure into a visible one. The specs are
`docs/research/2026-09-upgrade/UPGRADE_RESEARCH.md` §6 (IN-01 … IN-17). The before/after numbers are in
`docs/research/2026-09-upgrade/W2-integration-measurements.md`.

### Breaking
- **The helper now needs macOS 14 (Sonoma) or later on Apple silicon.** Every mlx release after 0.29.3 ships macOS
  14+ wheels only, and the Kokoro fidelity fix needs mlx ≥ 0.31.1. Building it (every install path does, Homebrew
  included) needs a Swift 6.0 toolchain (Xcode 16.2 or its Command Line Tools), which needs macOS 14.5 or later.
- **The helper's Python environment is built with [uv](https://docs.astral.sh/uv/)** (`brew install uv`). Re-run
  `native-helper/Scripts/setup-python-env.sh`. It moves the old environment to `native-helper/.python-env.pre-1.5`
  as a rollback.
- **The extension needs Chromium 148 or later** (`minimum_chrome_version`). Every current Chrome, Edge, Brave,
  Opera, Vivaldi, Arc and Dia build is at 152 or later.

### Product (operator rulings of 2026-09-23)
- **New name: "Natural TTS: Private Kokoro Voices for Mac"** (OD-7). The toolbar tooltip and short name are now
  "Natural TTS" (previously "Natural Text-to-Speech"), and the store description fits the 132-character limit.
- **System voices when the helper is not running** (OD-2). Selections are spoken with Chrome's `chrome.tts`, using
  local platform voices only (never a network voice, never another extension's voice, never a macOS sound-effect
  voice; with no such voice, or an unreadable voice list, it reports an error rather than speak), and the popup
  explains how to install the helper for Kokoro voices. After right-click or shortcut speech in a system voice, the
  toolbar icon shows a grey "i" whose tooltip says to install the helper; the next Kokoro speech clears it. Options
  → "When the helper isn't running" chooses "Use system voices" (the default) or "Show an error". The new `tts`
  permission adds no install warning.
- **af_heart is the default voice for new installs** (OD-5), in the helper and the extension. A voice already
  chosen and stored is left as it is, and an install updated from an earlier release that never stored a voice
  keeps af_bella, the default it was using.
- **Homebrew install** (OD-1). `packaging/homebrew/Formula/natural-tts.rb` builds the helper from source, installs
  the uv-locked worker environment on python@3.12, prefetches the pinned Kokoro snapshot for offline use, and runs
  as `brew services start natural-tts`. `packaging/homebrew/publish-tap.sh` publishes it to `renchris/tap`, and
  only with explicit `--confirm` flags. The popup's install notice shows the `brew install` command, with a
  link for users who build from source. Its update notice, which only helpers older than 1.5 see (all installed
  from source), shows `git pull && native-helper/Scripts/quickstart.sh`; `brew upgrade` is kept for a later API
  bump. The root README has an Install section for both. The tap is not published yet.
- **New icon** (OD-10): a speaker with waveform arcs on an indigo tile, from vector masters in `assets/brand/`
  and rendered by the deterministic `assets/brand/render-icons.sh`. The 16 and 48 px sizes are drawn separately,
  a 32 px icon now serves Retina toolbars, and a 512 px listing icon is included.

### Changed: helper
- **Kokoro speaks louder, closer to the system voice.** Every response gets one gain toward −16 LUFS (ITU-R
  BS.1770-4), never past a −1.5 dBTP true peak, with no compressor or limiter and no clipping. Speech that measured
  −23 to −28 LUFS now measures about −16 to −21 (−25 at worst). The jump when the extension falls back to the
  macOS system voice (about −16) shrinks from 7–12 LU to 0–5 LU. Most responses stop at the peak ceiling before
  −16, because Kokoro's peaks sit 14–24 dB above its loudness. Measuring and applying the gain costs about 0.3% of
  the audio's length (0.08 s for 25 s of speech), about 7% of a response's wait at ~26× real time; the speeds below
  were measured before it. The demo clips and videos were regenerated.
  `verify-python.sh` gains a loudness check, and its fidelity check still compares the synthesis before
  normalization, so a decoder gain drift stays visible.
- **`/speak` status codes say whose fault it was.** A bad request answers 400 with a code (`invalid_speed` for
  speeds outside 0.25–4.0, `empty_text`, `text_too_long`, `unknown_voice`, `audio_too_long`, `bad_request`).
  While the engine is down or restarting it answers 503 with `retry_after_seconds: 5`. Everything else is 500.
- **British voices are warm on the first request.** The worker also warms the British pipeline at startup, so the
  first `bf_`/`bm_` request takes 0.17 s instead of 1.1–2.6 s. Launch to ready takes about 1–2 s longer.
- **Long numbers, URLs and hashes are spoken whole.** A run of 16 or more digits is read in groups of three (a
  round number of up to 30 digits keeps its magnitude: "one quintillion"), and an unbroken token longer than 40
  characters is split, so a 320-digit number and a 600-character URL are spoken in full (they used to fail or be
  cut off at 510 phonemes). The split drops rule lines and banners ("=====", "#####") instead of naming each
  symbol, keeps contractions whole, and cuts only tokens misaki would spell out, not plain words.
- **Peak memory halved.** The worker caps the MLX buffer cache at 256 MB (`NTTS_MLX_CACHE_LIMIT_MB`). A
  ~5,000-character request now peaks at ~3.6 GB instead of ~7.9 GB, with no measurable speed cost.
- **SIGTERM and SIGINT exit cleanly** within 2 s with status 0, and stop the worker first.
- **Hash-locked Python environment** (`native-helper/python/pyproject.toml` + `uv.lock`). It pins Python 3.12,
  mlx 0.32.2 and mlx-audio 0.5.5. misaki, spaCy and `en_core_web_sm` are declared explicitly, and torch is not
  installed. The old script pinned 3 packages, let ~178 float, and deleted every `*.dist-info`, which broke a fresh
  install. The environment shrinks from 2.1 GB (183 packages) to 655 MB (89).
- **Faster start, and the first request is not cold.** The worker runs a warm-up sentence before it reports ready.
  A missing model or dependency now fails at launch, not on the first `/speak`. Launch to healthy took 1.95 s
  (was 5.5 s) before the British pipeline was also warmed at startup (above); it is now about 3–4 s. The first
  `/speak` takes 0.35 s (was 3.0–4.8 s). Warm synthesis runs at ~26.5× real time (was
  18.7–22.2×).
- **Offline by default.** The worker sets `HF_HUB_OFFLINE=1`, and the setup script fetches the model once. Before,
  every `/speak` resolved its voice on huggingface.co.
- **All 28 English Kokoro voices**, with correct US/UK labels (the old list had "Sarah (UK)"). British voices use
  British pronunciation (`lang_code b`). An unknown voice returns 400 `unknown_voice`, not a 500 that leaked the
  Hub URL.
- **`/health` never waits on synthesis.** It takes under 1 ms during a long `/speak`, where it used to take 6.6 s,
  so the extension's 2 s probe no longer reports a busy helper as missing. `/health` also reports `version` and
  `apiVersion: 2`.
- **A quick restart keeps port 8249.** The port probe now survives TIME_WAIT, so a restart no longer drifts to
  8250 and saves that port into `config.json`. The new `--port`, `--python` and `--worker` overrides are never
  saved to the shared `config.json`; with `NATURAL_TTS_CONFIG_DIR` set they are saved into `<dir>/config.json`,
  which is how the Homebrew service pins its `opt/` paths.
- **Text keeps its punctuation.** Curly quotes, dashes and ellipses now reach the G2P instead of being dropped.
- **Worker guards.** Invalid speeds, empty text after normalisation and NaN audio return named errors, not raw
  exceptions. Audio that would clip is scaled down.
- **swift-nio 2.97.1 and swift-log 1.8.0.** These are the newest releases that still build on Xcode 16.2, the
  last Xcode for Sonoma.
- **A readable log in a terminal.** Run by hand, the helper prints each message bare (warnings and errors keep their
  level); the `brew services` log file keeps the full timestamp-level-label format. A `/speak` logs "Generated 2.52s
  audio in 0.20s (12.7× faster than real time)" instead of an inverted "RTF", and `/health` reports
  `uptime_seconds` in tenths.
- **The build bundles only `tts_worker.py`.** It used to copy the 2.1 GB venv into `.build`. The empty Swift test
  target that broke fresh-clone builds is gone.

### Changed: extension
- **Permission reduction.** The `<all_urls>` content script is gone. The selection is read on demand through
  `activeTab` + `scripting`, with `info.selectionText` as the fallback for PDFs and frames. The install warning
  changes from "Read and change all your data on all websites" to "Read and change your data on 127.0.0.1".
- **Visible errors.** Helper errors become plain messages (for example "The Natural TTS helper is not running.
  Start it, then try again."), not "Server error: 500". A failed right-click or shortcut sets a red "!" badge that
  gives the reason. A helper older than apiVersion 2 gets an "Update the Natural TTS helper" notice.
- **Keyboard commands.** `speak-selection` and `stop-speaking` ship with no default keys (bind them at
  `chrome://extensions/shortcuts`), and Stop now really stops playback.
- **Long selections play.** The offscreen document declares `BLOBS`, so Chrome no longer closes it during a long
  synthesis. It closes itself after 60 s idle. The `/speak` timeout scales with length, up to 120 s, and a `/speak`
  is never retried, because a retry synthesised the text twice.
- **Popup fixes.** Stop is reachable while audio plays, and Enter sends one request, not two. Voice labels are
  built as text, not HTML. The `autoPlay` and `helperAutoRetry` toggles did nothing and are removed. Retry works
  again after a successful retry.
- **One voice catalogue** (`src/shared/voices.ts`, 28 voices) is the single source of voice ids and labels.
- **The popup matches the icon, and clears WCAG AA.** An `oklch()` override had turned the accent into `#076BE3`;
  every browser now renders the brand indigo `#3D4ED7`. The Stop button is the brand deep ink (14.8:1; the green it
  replaces was 3.51:1 and read as "go"), the Connected pill and the info message clear 4.5:1, the settings gear has
  a visible hub, Retry has a refresh icon and an outline style, and the labels use "…", "×" and sentence case.
- **The install command wraps only after its `&&`**, never between the two ampersands.
- **Discovery probes all twelve ports at once**, and the lowest port that is the helper wins. With no helper, the
  fallback no longer waits one timeout per port where a refused loopback connect is slow (Windows).
- **Production build hygiene.** `console.log`/`info`/`debug` are dropped from `dist`, and no test hooks ship.
- **The offscreen document starts at the stored helper port**, and the port the helper actually answered on is
  saved back, so a new offscreen document does not rediscover the helper every time.
- **Options names a stopped engine** ("The helper's voice engine stopped - restart the helper") and a warming one,
  instead of "Model not loaded".
- **Tests.** 60 tests that restated string literals without importing any code are replaced by tests against the
  real modules.
- **Toolchain.** The unused vite chain is removed, and the project moves to TypeScript 6, @types/chrome 0.3.0 and
  happy-dom 20. `bun audit` goes from 45 advisories to 0.

### Fixed (pre-release review)
- **Helper log privacy.** Only the worker's own log lines reach the helper log. mlx-audio's phoneme dump of a long
  token (a card number, a reset-URL token) and exception messages that quote the input no longer appear there or
  in error responses.
- **A dead worker is restarted** (at most 3 times in 2 minutes; after that `/health` reports `status: "error"`),
  and the helper no longer spins a core at 100% once its worker has exited.
- **One request cannot poison or kill the helper.** Audio past 20 minutes is refused (`audio_too_long`) instead of
  desyncing the worker pipe; request text is also capped at 100,000 UTF-8 bytes and bodies at 1 MiB; a refused
  Host or Origin is answered before the body is read; a write to a dead worker no longer kills the helper.
- **Stop frees the helper.** A stopped or superseded request is cancelled in the worker at the next chunk, so the
  next one does not wait behind it.
- **Offline, always, and pinned.** The worker forces `HF_HUB_OFFLINE=1` whatever the shell exports, and loads the
  model weights and voices from one pinned Hub commit (`MODEL_REVISION`) that the setup script fetches.
- **Extension.** Right-click reads the frame that was clicked, never an older top-frame selection; PDFs at URLs
  without `.pdf` get ligature cleanup; text is sent only to a port whose `/health` identifies the helper; the popup
  can stop right-click and shortcut speech; a stop pressed while a request is being prepared is kept; the service
  worker is answered when playback starts, so long playback no longer loses its result; discovery is retried after
  a failure; Retry during warm-up polls until ready.
- **`quickstart.sh` fails closed** on a failed build (and checks for Swift 6.0+), instead of restarting the old
  helper and reporting success.

### Changed: policy and documentation
- **Privacy policy rewritten against the 1.5.0 code** (Version 1.5.0, effective 23 September 2026). Every statement
  is traced to file:line in `docs/publishing/PRIVACY_TRACEABILITY.md`; claims no code proves (GDPR/CCPA
  compliance, "encrypted by Chrome", `storage.sync`) are gone.
- **Accessibility review redone for 1.5.0** (`chrome-extension/ACCESSIBILITY.md`): contrast from the tokens, the
  keyboard paths with line anchors, and the open items.

### Added
- The store package: `bun run package` (`chrome-extension/scripts/package.mjs`) builds a deterministic, checked
  zip.
- `scripts/release/release.sh`, the release program (preflight, tag, GitHub Release, Homebrew tap, security contact,
  and the store handoff it prints only when the listing's inputs are true), and the `docs/publishing/` kit: the
  store listing, the release steps, the YouTube kit and the privacy trace.
- `bench/` (run.mjs, with an idle-machine gate, and chart.mjs), which generates the README's performance chart.
- Diagrams rendered with beautiful-mermaid from `assets/diagrams/*.mmd` (`bun run diagrams`), with a CI staleness
  check (`bun run diagrams:check`).
- README media (`assets/media/`: popup captures, the status loop, terminal casts, the demo article and its real
  clips, with `PROVENANCE.md`) and the store images (`assets/store/`, rendered from real captures).
- `docs/history.md`, the project's story before 1.5.
- A `docs` section in `scripts/verify-all.sh`: diagrams, the chart, the demo audio, store image sizes, media size
  budgets, the store zip, the privacy policy and the old name.
- MIT `LICENSE` and `THIRD_PARTY_NOTICES.md`. The GPL/LGPL components (espeak-ng, phonemizer-fork, num2words,
  libsndfile) are installed into the user's own environment and are not redistributed.
- Verification tooling:
  - `scripts/verify-all.sh`: the fail-closed integration gate. It also asserts this release's product rulings:
    af_heart as the default on both sides, the warm British first request, the 400 codes, long tokens spoken
    whole, the run-on pace, the worker's peak memory, a clean SIGTERM, the `tts` permission and store name, the
    icon's transparent border, the Homebrew formula (`ruby -c`, `brew style`), and the headless end-to-end suite.
  - `native-helper/Scripts/verify-python.sh`, `verify_worker.py`, `kokoro_probe.py`, `verify_g2p.py`, plus
    fidelity reference audio.
  - `chrome-extension/scripts/verify-permissions.cjs` and a headed end-to-end suite (`bun run test:e2e`).
  - The capture rig in `scripts/capture/`.

### Removed
- The dangling `TTS.cpp` gitlink and its ignore rules.
- The helper's config `secret`, which was generated but never checked, and the extension's `X-Secret` header that
  sent it. A secret left in a 1.4 stored config is dropped on the next save.

### Previously unlogged: 2026-05-25 (30 commits after the `v1.4.0` tag)
- Helper: pinned the port to 8249 with fallback and an atomic config write. CORS is restricted to extension
  origins, and web-page CSRF is rejected. The model loads eagerly at startup.
- Extension: a 12-port helper probe and a visible "warming" state, plus a defence against the offscreen
  listener-registration race. A prewarm-on-install was added and then reverted, because it broke `/speak` on
  lazy-loading helpers.
- UI redesign:
  - a token system and a 360 px popup;
  - voices grouped by accent;
  - a speed stepper and a log-scale slider;
  - a status pill with a label, and a two-state Speak/Stop button;
  - a footer with the shortcut hint and the version;
  - `prefers-reduced-motion` support;
  - accessibility fixes: a focus ring, `aria-live` per severity, a stable retry button, and WCAG text colours.
- The build copies `variables.css`, and the manifest was bumped to 1.4.0. The `v1.4.0` tag's manifest still says
  1.3.0.

## [1.4.0] - 2025-11-11

### Added
- **Phase 2.7: Documentation & Polish (Documentation Sprint)**
  - Comprehensive chrome-extension/README.md (450+ lines)
    - Features overview with all 6 voices and speed control
    - Installation quick start guide
    - Usage instructions (context menu, popup, settings)
    - Architecture diagrams and communication flow
    - Troubleshooting section for common issues
    - Development guidelines and project structure
    - Performance metrics (bundle size, TTS speed)
    - Roadmap and feature timeline
  - User-friendly INSTALL.md guide (411 lines)
    - Step-by-step installation walkthrough (15-20 minutes total)
    - Prerequisites checklist with verification commands
    - Part 1: Native Helper setup (Python env, Swift build, 15 min)
    - Part 2: Chrome Extension setup (Bun build, load unpacked, 5 min)
    - Part 3: Verification tests (connection, speech, voices, 2 min)
    - Comprehensive troubleshooting section with solutions
    - Uninstallation instructions
    - Usage tips and next steps
  - PRIVACY.md policy document (309 lines)
    - 100% local processing guarantee
    - Zero data collection statement
    - Network requests transparency (localhost only)
    - Chrome permissions explanation with risk levels
    - GDPR/CCPA/COPPA compliance details
    - Open source transparency and auditability
    - Contact information for privacy concerns
  - ACCESSIBILITY.md audit report (415 lines)
    - **WCAG 2.1 Level AA compliance certification**
    - Detailed keyboard navigation testing (95/100 score)
    - Screen reader support verification (VoiceOver tested)
    - ARIA labels and live regions documentation
    - Color contrast ratios for all UI elements
    - Focus indicators and visual accessibility
    - Testing methodology and tools used
    - Recommendations for future enhancements
  - SCREENSHOTS_GUIDE.md (591 lines)
    - 14 screenshot specifications with dimensions and setup
    - 2 demo video requirements with storyboards
    - Technical specifications (PNG, 144 DPI, 1080p video)
    - Recommended tools (QuickTime, OBS Studio, ImageOptim)
    - Post-processing checklist
    - Directory structure for assets
  - TESTING_CHECKLIST.md (585 lines)
    - 12 major test sections covering all functionality
    - Installation and setup tests
    - Core TTS functionality tests (popup, voices, speed)
    - Context menu integration tests (webpages, PDFs)
    - Options/settings page tests with persistence
    - Error handling and edge case tests
    - Performance and stress tests
    - UI/UX and accessibility tests
    - Browser compatibility tests
    - Security tests (permissions, network, CSP)
    - Pre-release readiness checklist

### Changed
- Synced package.json version from 1.1.0 to 1.3.0 (aligning with manifest.json)

### Technical Details
- **Documentation**: 2500+ lines of comprehensive user and developer docs
- **Accessibility**: self-assessed as WCAG 2.1 AA; no test artefacts back it (re-reviewed for 1.5.0 in ACCESSIBILITY.md)
- **Quality**: Ready for production release with complete testing coverage
- **Target Audience**: End users and open source contributors

### Notes
- **Phase 2.7 completes the documentation sprint**
- Extension is now fully documented and ready for public release
- All core features (TTS, voices, speed, context menu, settings) are functional and tested
- Comprehensive guides for installation, usage, privacy, and accessibility
- Next: v1.4.0 release with all documentation (no code changes)

## [1.3.0] - 2025-11-10

### Added
- **Phase 2.6: Options/Settings Page**
  - Complete settings page with comprehensive preferences UI
  - Centralized settings management system (`settings-defaults.ts`)
  - Voice selection dropdown with 6 voices (Bella, Nicole, Sarah, Sky, Adam, Michael)
  - Speed control slider (0.5x - 2.0x) with live value display
  - Auto-play toggle for future features
  - Helper auto-retry configuration
  - Save and reset to defaults functionality
  - Real-time helper status indicator
  - Settings synchronization across extension contexts
  - Chrome storage integration with validation
  - ARIA labels and accessibility support
- **Settings Infrastructure**
  - `ExtensionSettings` interface with type safety
  - `DEFAULT_SETTINGS` constants with sensible defaults
  - `SETTINGS_CONSTRAINTS` for validation (speed range, valid voices)
  - `validateSettings()` function with boundary checking
  - `loadSettings()` and `saveSettings()` async helpers
  - Settings change listener for live updates

### Fixed
- **Context Menu Not Working**: Removed autoPlay check that was blocking explicit user actions (right-click → "Speak selected text")
- **Multi-Sentence TTS Support**: Fixed Python worker to collect all audio chunks from generator instead of just the first sentence
  - Generator now iterates through all chunks with `for chunk in result_gen`
  - Audio chunks concatenated with numpy for complete text rendering
  - Logs show chunk count for debugging (e.g., "Generated 5 audio chunks")
- **Unicode Text Pronunciation**: Added NFKD normalization to convert styled Unicode characters to ASCII
  - Handles mathematical monospace (𝚟𝚒𝚝𝚎 → vite), bold, italic variants
  - `normalize_text()` function with `unicodedata.normalize('NFKD', text)`
  - Fallback to ASCII-compatible equivalents for better pronunciation
  - Logs text transformation for debugging

### Changed
- Updated popup settings button to open options page via `chrome.runtime.openOptionsPage()`
- Background service worker now uses centralized `loadSettings()` for preference loading
- Bumped extension version from 1.2.0 to 1.3.0

### Technical Details
- **Options Page**: 1040+ lines of production code (HTML/CSS/TS)
- **Settings Management**: Single source of truth with validation layer
- **Storage**: chrome.storage.local with change event listeners
- **Type Safety**: Full TypeScript interfaces for settings
- **Audio Quality**: Multi-sentence support handles 781+ character paragraphs correctly
- **Unicode Handling**: NFKD normalization in Python worker before TTS generation

### Notes
- Phase 2.6 completes the extension settings infrastructure
- All core TTS features now functional (popup, context menu, multi-sentence, Unicode)
- Ready for production use with Kokoro-82M MLX model

## [1.1.0-beta.2] - 2025-11-10

### Added
- **Phase 2.3: Chrome Extension Popup UI**
  - Complete popup interface with voice selection dropdown
  - Speed control slider (0.5x - 2.0x) with live visual feedback
  - Helper status indicator with animated states (checking/connected/disconnected)
  - Message system for success/error/warning notifications
  - Chrome storage integration for preference persistence
  - Comprehensive error handling with custom error types
  - ARIA labels and keyboard navigation support
  - Modern CSS design with animations and transitions
  - Temporary text input via browser prompt (Phase 2.4 will add content script)
- **Placeholder Files for Future Phases**
  - Background service worker placeholder (Phase 2.5)
  - Content script placeholders (Phase 2.4)
  - Options page placeholders (Phase 2.6)

### Technical Details
- **Popup Implementation**: 1015+ lines of production code (HTML/CSS/TS)
- **State Management**: PopupState interface with voice, speed, helper status tracking
- **Audio Playback**: Blob URL-based audio player with proper cleanup
- **Type Safety**: Full TypeScript integration with API client
- **Bundle Size**: ~21KB total (9.6KB JS minified, 7.8KB CSS, 3.7KB HTML)
- **Performance**: Fixed 340px width, optimized for fast popup rendering

### Changed
- Updated `api-client.ts` headers type to `Record<string, string>` for better type safety
- Updated `vite.config.ts` to include all extension entry points

### Notes
- This is a **beta release** - Phase 2 is not yet complete
- Popup UI is fully functional and ready for testing
- Text selection from webpages will be added in Phase 2.4 (Content Script)
- Upcoming: Phase 2.4 (Content Script), Phase 2.5 (Background Worker), Phase 2.6 (Options Page)

## [1.1.0-beta.1] - 2025-11-10

### Added
- **Phase 2.2: Chrome Extension Core API Client**
  - HTTP client for Native TTS Helper API with `/health`, `/voices`, `/speak` endpoints
  - Auto-discovery system for helper connection (tries ports 8249-8251)
  - Configuration management with chrome.storage.local caching
  - Retry logic with exponential backoff (max 2 retries, 500ms base delay)
  - Custom error types: `HelperNotFoundError`, `ConfigNotFoundError`, `NetworkTimeoutError`, `InvalidResponseError`
  - Configurable timeouts: 10s for health/voices, 30s for speak
  - Singleton pattern for efficient client reuse
- **Testing Infrastructure**
  - Bun Test framework with happy-dom (13x faster than Jest)
  - 16 comprehensive unit tests for API client (100% pass rate)
  - 6 integration tests against live Native TTS Helper
  - Mock chrome.storage and fetch APIs for isolated testing
- **Project Structure**
  - Hybrid Bun + Vite architecture (Vite for dev HMR, Bun for tests & prod builds)
  - TypeScript 5.x with strict type checking
  - Manifest V3 configuration with required permissions
  - Chrome extension icons (16x16, 48x48, 128x128)
  - Production build pipeline with Bun bundler

### Documentation
- Comprehensive Phase 2 implementation plan (all 5 subphases)
- Bun v1.3.0 test validation results
- GitHub issue references for Bun Test research

### Technical Details
- **API Client**: Lazy config loading, parameter validation, proper error propagation
- **Configuration**: Verifies cached config before use, graceful fallback to defaults
- **Type Safety**: Full TypeScript coverage with strict interfaces
- **Test Coverage**: 22 unit test assertions, 19 integration test assertions

### Notes
- This is a **beta release** - Phase 2 is not yet complete
- Upcoming: Phase 2.3 (Popup UI), Phase 2.4 (Content Script), Phase 2.5 (Background Worker)
- Full v1.1.0 release will follow after all Phase 2 components complete

## [0.0.0] - 2025-11-09

### Added
- Initial Phase 0 validation workspace for TTS.cpp + Parler Mini evaluation
- TTS.cpp integration as git submodule (mmwillet/TTS.cpp @ c04c77a)
- Build configuration for Apple Silicon with Metal acceleration
- Python environment setup with ML dependencies (PyTorch 2.6, transformers 4.46)
- Parler TTS Mini v1.1 model acquisition pipeline (3.5GB safetensors)
- CMake build system for compiling TTS binaries (tts-cli, quantize, tts-server)
- Comprehensive README documentation of validation results
- .gitignore configuration to exclude models, venv, and build artifacts

### Discovered
- **CRITICAL**: TTS.cpp GGUF conversion incompatibility with Parler Mini v1.1
  - Root cause: DAC audio codec uses newer PyTorch weight_norm parametrization
  - Error: `ValueError: Part model.0.parametrizations.weight.original0 is not in DAC_ENCODER_PARTS`
  - Conversion pipeline expects Parler v1.0 flat weight structure
- TTS.cpp is proof-of-concept quality (not production-ready)
- Need for alternative approach: pre-converted GGUF models, native Python Parler-TTS, or Kokoro-only MVP

### Validated
- ✅ TTS.cpp builds successfully on Apple Silicon (ARM64 + Metal)
- ✅ Metal framework detection and acceleration enabled
- ✅ Python ML stack installable and functional (100+ packages)
- ✅ Parler Mini v1.1 model downloadable from HuggingFace
- ✅ Development environment setup reproducible on macOS

### Blocked
- ⏸️ GGUF quantization (fp16 → Q5_0) - conversion fails before quantization
- ⏸️ Metal inference performance testing - no GGUF model to test
- ⏸️ Audio quality assessment - cannot generate samples
- ⏸️ Real-time factor benchmarking - blocked by conversion failure

### Recommendations
Four paths forward documented in README:
- Option A: Test pre-converted GGUF models (unknown quality)
- Option B: Use native Python Parler-TTS (larger memory footprint)
- Option C: Wait for TTS.cpp Parler v1.1 support (timeline unknown)
- Option D: Pivot to Kokoro-only MVP (fastest to production)

---

[Unreleased]: https://github.com/renchris/natural-text-to-voice-extension/compare/v1.5.1...HEAD
[1.5.1]: https://github.com/renchris/natural-text-to-voice-extension/compare/v1.5.0...v1.5.1
[1.5.0]: https://github.com/renchris/natural-text-to-voice-extension/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/renchris/natural-text-to-voice-extension/releases/tag/v1.4.0
[1.3.0]: https://github.com/renchris/natural-text-to-voice-extension/releases/tag/v1.3.0
[1.1.0-beta.2]: https://github.com/renchris/natural-text-to-voice-extension/releases/tag/v1.1.0-beta.2
[1.1.0-beta.1]: https://github.com/renchris/natural-text-to-voice-extension/releases/tag/v1.1.0-beta.1
[0.0.0]: https://github.com/renchris/natural-text-to-voice-extension/releases/tag/v0.0.0
