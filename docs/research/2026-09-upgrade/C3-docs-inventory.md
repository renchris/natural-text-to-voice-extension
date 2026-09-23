# C3 — Documentation inventory and staleness audit

**Date:** 2026-09-23 · **Base:** `main` @ `fe2ea58` (manifest/package `1.4.0`) · **Author:** repo mapper C3
**Scope:** every tracked `*.md` (18 files, 7,275 lines), `CHANGELOG.md`, every tracked image/video, the
`TTS.cpp` gitlink. Each claim below was checked against the code at HEAD. Line anchors are `path:line`.

---

## 0. Governing conclusion

**None of the 18 docs describes the extension that ships at HEAD.** They describe three earlier states:

| Doc family | Frozen at | Describes |
|---|---|---|
| Root `README.md` | `8afc817` (2025-11-10), before the extension had any code | Phase 0 (TTS.cpp + Parler) and Phase 1 (helper v0.2.0). It says the Chrome extension is "In Progress / Coming soon". |
| `native-helper/*.md` (6 files) | `8afc817` / `2af5779` (2025-11-10) | Helper at v0.2.0: a random port, `/health` returning 503, 4 voices, and "Native Messaging" to the extension. |
| `chrome-extension/*.md` (8 files) + `CHANGELOG.md` | `fa65fd0` (tag `v1.4.0`, 2025-11-11) | The extension at 1.3.0: a text-input popup, `storage.sync`, a `scripting` permission, Chrome 88+, and a linear slider. |

On 2026-05-25, 30 commits landed after the `v1.4.0` tag (`eba1086`..`fe2ea58`). They pinned the port, added the CORS/CSRF guard and the warming state, redesigned the UI, and added the log-scale slider. **No doc and no CHANGELOG entry mentions any of them.** `git diff --stat v1.4.0 HEAD -- '*.md'` returns nothing.

Three findings change what the rewrite may claim:

1. **The "25x RTF" headline is not a measurement.** `native-helper/Scripts/test-performance-long.sh:54` hardcodes
   `AUDIO_DURATION=21.7`. The test text is 27 words, not the "50 words" it claims. The docs record the output WAV as **321 KB**. At 24 kHz, 16-bit, mono, that is **≈6.85 s** of audio, not 21.7 s (21.7 s would be ≈1,017 KB). The true figure was therefore about **8x**, not 25x (§5). This number appears in 61 lines across the docs and in 3 badges.
2. **No visual evidence exists.** The only tracked images are 3 icons. `README.md` says "Screenshots: Coming soon". `INSTALL.md`'s 3 images point at `via.placeholder.com`, which no longer resolves (HTTP 000). The 128px icon does not meet the Chrome Web Store icon guidance (§7).
3. **There is no `LICENSE` file**, locally or on GitHub (`gh api …/contents/` lists none, and `licenseInfo` is null). Yet `package.json` says MIT, three docs link `../LICENSE`, and the root README's License section credits TTS.cpp and Parler, neither of which is used any more.

**Disposition, in short:** rewrite the root `README.md` from code-verified facts. Keep and rewrite 3 files: `CHANGELOG.md`, `native-helper/README.md` and `PRIVACY.md`, which moves to the root. Move 8 files to `docs/`, 3 of them the benchmark history. Merge 2 into the new README: `chrome-extension/README.md` shrinks to a dev README, and `QUICKSTART.md` is deleted after the merge. Delete 4 outright (the screenshots guide, the bun evaluation, and 2 posted comment drafts). That accounts for all 18. Remove the dangling `TTS.cpp` gitlink (§8–§9).

---

## 1. Receipts (commands run this session)

| Command | Result |
|---|---|
| `git ls-files '*.md'` + `wc -l` | 18 files, 7,275 lines (table §2) |
| `git ls-files \| grep -iE '\.(png\|jpg\|gif\|svg\|mp4\|webm\|webp\|mov)$'` | 3 files: `chrome-extension/public/icons/icon{16,48,128}.png` |
| `git ls-files -s TTS.cpp` | `160000 c04c77ab… TTS.cpp` (gitlink); `.gitmodules` absent; `git submodule status` → `fatal: no submodule mapping found in .gitmodules for path 'TTS.cpp'` |
| `gh api repos/mmwillet/TTS.cpp/commits/c04c77ab…` | exists: "Merge pull request #117 from mrexodia/msvc-build", 2025-10-05; the repo's `pushed_at` is still 2025-10-05 |
| `cd chrome-extension && bun test` (helper not running) | `122 pass, 1 fail, 303 expect() calls, 123 tests across 6 files`. The fail is the live-helper `beforeAll` guard. |
| static count `grep -cE '^\s*(test\|it)\('` | 16+30+10+31+35 = 122 unit tests, plus 6 integration tests = 128 |
| `git diff --stat v1.4.0 HEAD -- '*.md'` | empty (no doc touched since the tag) |
| `git log v1.4.0..HEAD` | 30 commits, all dated 2026-05-25 |
| `git ls-remote --tags origin` | `v1.4.0^{}` = `fa65fd0`; the local clone lacks tag `v0.0.0` (the remote has it at `67501a5`) |
| `curl https://huggingface.co/api/models/prince-canuma/Kokoro-82M?blobs=true` | Apache-2.0; `kokoro-v1_0.safetensors` = 327,115,152 B; repo total 389.4 MB; 54 voices × (.pt + .safetensors) |
| `curl https://huggingface.co/api/models/hexgrad/Kokoro-82M?blobs=true` | 54 voices across 17 prefixes; 28 English (af 11, am 9, bf 4, bm 4) |
| `du -sh ~/.cache/huggingface/hub/models--prince-canuma--Kokoro-82M` | 348M |
| `curl https://pypi.org/pypi/mlx/0.29.3/json` | `requires_python >=3.9`; wheels for cp39, cp310, cp311, **cp312, cp313** |
| `curl https://pypi.org/pypi/espeakng-loader/0.2.4/json` + venv listing | the wheel (~9.9 MB) bundles `libespeak-ng.1.52.0.dylib` and `espeak-ng-data` |
| `developer.chrome.com/docs/extensions/reference/api/offscreen` | `chrome.offscreen` "Chrome 109+ MV3+" (and `hasDocument()` "Chrome 150+") |
| `developer.chrome.com/docs/extensions/reference/api/runtime` | `getContexts()` "Chrome 116+ MV3+" |
| `developer.chrome.com/docs/webstore/images` + `/cws-dashboard-listing` + `/cws-dashboard-privacy` | icon 128×128 (96×96 artwork + 16 px transparent padding); screenshots 1280×800 or 640×400, at least 1 and up to 5; small promo 440×280 **required**; marquee 1400×560 optional; YouTube video link; single-purpose, permission-justification and remote-code declarations; privacy policy URL |
| `gh api repos/oven-sh/bun/issues/{6338,16968}/comments` | both local "github-comment" drafts **were posted** (2025-11-10/11); both issues are now closed |
| `gh repo view renchris/natural-text-to-voice-extension` | description: "Local TTS Chrome Extension: Evaluating Kokoro (WebGPU) and Parler TTS (native Metal)…" (stale); no topics; no homepage; no license |
| `curl -L https://via.placeholder.com/150x50…` | HTTP 000 (host unreachable) |
| GH API license lookups | espeak-ng **GPL-3.0**; misaki Apache-2.0; mlx-audio (Blaizzy) MIT; mlx MIT; swift-nio Apache-2.0; TTS.cpp MIT |

Scratch files are under `/tmp/ntts-c3/`. No tracked file was edited, and nothing was installed.

---

## 2. Per-document inventory

Key: **RW** rewrite in place · **MV** move to `docs/` · **MG** merge into the new root README, then delete · **DEL** delete · **KEEP** keep with edits.

| # | Path | Lines | Last commit | Purpose / audience | Verdict |
|---|---|---:|---|---|---|
| 1 | `README.md` | 359 | `8afc817` 2025-11-10 | Project overview; Phase 0 validation report; TTS.cpp build steps. Audience: the author at Phase 1. | **RW, full replacement** |
| 2 | `CHANGELOG.md` | 260 | `fa65fd0` 2025-11-11 | Keep-a-Changelog history, 0.0.0 → 1.4.0. Audience: users and contributors. | **KEEP**: backfill and add the next version (§6) |
| 3 | `chrome-extension/README.md` | 455 | `fa65fd0` | Extension features, install, usage, architecture, dev. Users and contributors. | **MG** features, flow and dev commands into the root README; keep a ≤40-line dev README |
| 4 | `chrome-extension/INSTALL.md` | 411 | `fa65fd0` | Step-by-step install for end users. | **MV** → `docs/INSTALL.md` and rewrite (wrong steps, dead images) |
| 5 | `chrome-extension/PRIVACY.md` | 309 | `fa65fd0` | Privacy policy. End users and CWS reviewers. | **MV** → `PRIVACY.md` (root, stable URL for CWS) and rewrite the facts |
| 6 | `chrome-extension/ACCESSIBILITY.md` | 415 | `fa65fd0` | Self-certified WCAG 2.1 AA audit. | **MV** → `docs/ACCESSIBILITY.md`; re-audit against the current UI; drop the "Certification" wording until re-tested |
| 7 | `chrome-extension/SCREENSHOTS_GUIDE.md` | 591 | `fa65fd0` | Specification for 14 screenshots and 2 videos (never captured). | **DEL** after the capture wave; it is superseded by real assets plus a CWS spec in `docs/publishing/` |
| 8 | `chrome-extension/TESTING_CHECKLIST.md` | 585 | `fa65fd0` | Manual QA checklist, 209 boxes, **0 checked**. | **MV** → `docs/testing/manual-checklist.md` and prune items for features that do not exist |
| 9 | `chrome-extension/IMPLEMENTATION_PLAN.md` | 796 | `682bdd2` 2025-11-10 | Phase 2 plan (tech-stack decision, phases 2.1–2.8). | **MV** → `docs/history/phase2-implementation-plan.md`, or DEL |
| 10 | `chrome-extension/BUN_TEST_RESULTS.md` | 222 | `682bdd2` | Bun 1.3.0 evaluation against bun#16968 and bun#6338. | **DEL**, or move to `docs/history/`. It is a tool evaluation, not a project doc. |
| 11 | `chrome-extension/github-comment-16968.md` | 120 | `50c0396` | Draft GitHub comment for oven-sh/bun#16968. | **DEL**. Posted upstream (issuecomment-3514294313…); the issue is closed. |
| 12 | `chrome-extension/github-comment-6338.md` | 66 | `682bdd2` | Draft GitHub comment for oven-sh/bun#6338. | **DEL**. Posted upstream (issuecomment-3514291979…); the issue is closed. |
| 13 | `native-helper/README.md` | 878 | `8afc817` | Helper overview, API reference, perf, config, troubleshooting, FAQ. Developers. | **RW in place**. Its API reference is the best raw material but is wrong in 6 places (§3.13). |
| 14 | `native-helper/QUICKSTART.md` | 365 | `8afc817` | 5-minute helper setup, curl examples, script tour. | **MG** into the root README quick start and helper README, then DEL |
| 15 | `native-helper/TESTING_GUIDE.md` | 741 | `8afc817` | curl-based perf, reliability and memory tests. | **MV** → `docs/testing/helper-testing.md`; replace hardcoded durations with the `X-Audio-Duration` header |
| 16 | `native-helper/TEST_RESULTS.md` | 227 | `2af5779` | 2025-11-09 run: 0.62x RTF and worker crash; NO-GO. | **MV** → `docs/history/benchmarks-2025-11/` (with the two below, plus an erratum) |
| 17 | `native-helper/TEST_RESULTS_PHASE_AB.md` | 220 | `2af5779` | After stdout-redirect fix: ~1.0x RTF. | **MV** as above |
| 18 | `native-helper/TEST_RESULTS_OPTIMIZED.md` | 255 | `2af5779` | "8.3x / 25x RTF, production ready"; GO. | **MV** as above, **with an erratum on the 25x** (§5) |

Untracked, and outside this program's scope (the plan says never stage them): `bun-issue-6338-response.md`, `native-helper/README.md.backup` (a pre-optimization copy of the helper README claiming 2.5x RTF), and `welcome.wav` (7.25 s, 24 kHz mono Int16, 348 KB). Non-doc cruft that is also tracked: `chrome-extension/tests/bun-issue-16968-sveltekit.sh`, a bun-issue repro that is not a test of this extension.

---

## 3. Stale or wrong statements, per document (verified against code)

### 3.1 `README.md` (root)
| Claim | Truth at HEAD | Evidence |
|---|---|---|
| Tagline "using **WebGPU** and Metal acceleration" | No WebGPU anywhere in code (`git grep -i webgpu` outside `*.md` → 0 hits) | — |
| Phase 2 "🔄 In Progress", "chrome-extension/ (TBD)", "Coming soon (Phase 2)", unchecked feature list | The extension is complete: popup, options, context menu, offscreen, content script | `chrome-extension/src/**` |
| "Current Version: v0.2.0", "Last Updated 2025-11-10" | manifest/package 1.4.0 | `chrome-extension/public/manifest.json:4` |
| Helper "on localhost:random-port" | Pinned 8249, falling back through 8249..8260 | `Config.swift:17-18`, `App.swift:23-33` |
| "Communication: Length-prefixed JSON (Native Messaging protocol)", and "Native Messaging client for IPC with helper" | Extension ↔ helper is **HTTP** (`fetch`). The length-prefixed JSON (4-byte little-endian) is only the Swift ↔ Python stdin/stdout pipe; Chrome Native Messaging is not used. | `api-client.ts:86`, `PythonWorker.swift:208-215` |
| Repo tree lists `main.swift` and `Tests/` | The entry point is `App.swift` (`@main`). `Tests/NaturalTTSHelperTests` exists on disk but is empty and untracked, and `Package.swift:33-36` still declares the test target. | `git ls-files native-helper` |
| "Clone with Submodules … `cd …/phase0-validation`", "Build TTS.cpp", "Download Parler Mini" | `phase0-validation/` was removed in `87ac86b`; `.gitmodules` was deleted in `8afc817`; TTS.cpp is a dangling gitlink (§8) | — |
| Prereqs "Python 3.9-3.11", "CMake ≥ 3.14" | CMake is not used. MLX 0.29.3 ships cp312/cp313 wheels. | PyPI `mlx/0.29.3` |
| "Performance Targets (Untested)" table for TTS.cpp | Obsolete | — |
| RTF badge "8.3x (short) \| 25x (long)" | 25x is not a measurement (§5) | `test-performance-long.sh:54` |
| License section: "This repository: MIT (see LICENSE)"; TTS.cpp MIT; Parler Apache-2.0 | No LICENSE file. TTS.cpp and Parler are unused. The attributions actually needed are Kokoro-82M (Apache-2.0), misaki (Apache-2.0), mlx and mlx-audio (MIT), swift-nio (Apache-2.0), and espeak-ng (**GPL-3.0**, bundled in the venv via espeakng-loader). | GH API license lookups |
| Acknowledgments: TTS.cpp, Parler, GGML | None are used | — |
| "Hardware: M1/M2/M3/M4" | Unverified beyond the dev machine (M1 Max) | — |

**Keep from it (for `docs/history/`):** the Phase 0 finding, 3 lines: TTS.cpp's GGUF DAC encoder rejects Parler v1.1 `parametrizations.weight.original0` tensors, which led to the pivot to MLX Kokoro. It makes a good "why this stack" footnote.

### 3.2 `CHANGELOG.md`
See §6. In short: the `[Unreleased]` section is empty despite 30 commits; `[0.2.0]`, `[1.0.0]` and `[1.2.0]` are missing, although GitHub releases exist for them. The doc line counts quoted for 1.4.0 are wrong: ACCESSIBILITY "685+" vs 415; PRIVACY "363+" vs 309; SCREENSHOTS "370+" vs 591; TESTING "490+" vs 585. The files are unchanged since the tag.

### 3.3 `chrome-extension/README.md`
| Claim | Truth at HEAD | Evidence |
|---|---|---|
| "Or use popup interface with manual text input"; Method 2 "Type or paste text into input area" | **No text input exists.** The popup speaks only the page selection via the content script. | `popup.html` (no textarea); `popup.ts:386-399` |
| "6 Premium Voices" with gender names | The helper returns 6 hard-coded voices, and **mislabels `af_sarah` as "Sarah (UK)", en-GB**. In the popup it then sits in the "American Female" group as "Sarah (UK)". | `HTTPServer.swift:206`; `popup.ts:268-285` |
| "Live preview in settings" for speed | No preview; the options page only stores the value | `options.ts:161-174` |
| "Browser: Google Chrome 88+ or Microsoft Edge 88+" | The code requires **Chrome 116+** (`chrome.runtime.getContexts`, `service-worker.ts:215`; offscreen needs 109+). The manifest has no `minimum_chrome_version`. | developer.chrome.com runtime/offscreen pages |
| "Disk Space: ~500MB for ML model" / "Memory: 2GB" | The model weights are 327 MB (the local HF cache is 348 MB); the venv adds its own size. Not re-measured here. | HF API |
| "Native helper running on `localhost:8249`"; "Only network request is to localhost:8249" | The extension probes **8249–8260** | `config.ts:17` |
| Step 1 omits `brew install espeak-ng`, yet other docs call it "REQUIRED" | Unresolved. The venv bundles libespeak-ng 1.52.0 plus data through espeakng-loader, but `PythonWorker.swift:39` hard-codes the Homebrew `ESPEAK_DATA_PATH`. Needs a clean-machine test. | venv listing |
| `git clone https://github.com/yourusername/…` (also in INSTALL and PRIVACY; 8 occurrences) | Real: `renchris/natural-text-to-voice-extension` | `git remote -v` |
| "Screenshots: Coming soon" | Still none | §7 |
| "Keyboard Shortcuts (Coming in future update)" | The manifest has **no `commands`**, yet the popup footer shows a `⌥⇧S` hint. That shortcut does nothing. | `popup.html:123`; `manifest.json` |
| Settings: "Auto-play: Automatically play when text is selected (future feature)"; "Helper Auto-retry: Reconnect to helper" | `autoPlay` is stored but ignored (`service-worker.ts:139`). `helperAutoRetry` is stored and **never read** anywhere. The options copy promises behaviour for both (`options.html:93`). | `git grep helperAutoRetry` |
| Architecture "Native Helper Side (separate repository)" | Same repository | — |
| Flow step 6 "Background → API client: POST /speak", step 10 "Helper returns WAV audio (base64 encoded)", step 11 "Background → Offscreen: Play audio" | **The offscreen document** calls the API and plays the audio. The background only forwards text. HTTP returns **binary** `audio/wav`; base64 exists only on the Python→Swift pipe. | `offscreen.ts:88-96`; `HTTPServer.swift:171-180` |
| "Background Service Worker - Always running" | MV3 service workers are event-driven and terminate when idle | — |
| Security: "Strict CSP", "Minimal permissions (storage, contextMenus, activeTab)" | No `content_security_policy` key (MV3 default applies). The list omits `offscreen`, and it omits the **`<all_urls>` content script**, which reviewers treat as broad host access. | `manifest.json` |
| Tech stack "Bundler: Vite 5.3.0"; Bundle "61.47 KB … Optimized with Vite + Terser, CSS minified with lightningcss" | The production build is **`tsc && bun run build.ts` (Bun.build)**. `vite.config.ts`'s terser and lightningcss settings are never used by `build`, and neither package is installed or declared. Current `dist/` = 74,240 B across 16 files (built 2026-09-23 14:05). | `package.json:8`; `ls node_modules` |
| "TypeScript 5.5.0" | 5.9.3 installed (range `^5.5.0`) | `node_modules/typescript/package.json` |
| "✅ 128 tests passing, ✅ 322 assertions" | True **only with the helper running**: 122 unit + 6 integration = 128; 303 + 19 = 322. Offline: 122 pass / 1 fail. | `bun test` run above |
| Roadmap "Current Version: v1.3.0 ✅ / Next Version: v1.4.0 (In Progress)" | 1.4.0 shipped (twice: tag and bump, §6) | — |
| "Kokoro-82M: … by [source TBD]" | hexgrad/Kokoro-82M (Apache-2.0); the MLX weights come from `prince-canuma/Kokoro-82M` (Apache-2.0) | HF API |
| "MIT License - See ../LICENSE" | Broken link; no LICENSE | — |

### 3.4 `chrome-extension/INSTALL.md`
- "Chrome or Edge **Version 88 or later**": needs 116+.
- Step 1.2 says `setup-python-env.sh` "Install[s] … PyTorch, transformers, MLX" and "Download[s] the Kokoro-82M model (~500MB)". The script installs **only** `mlx==0.29.3 mlx-audio==0.2.6 soundfile==0.13.1` (`setup-python-env.sh:81-85`); the rest are transitive. It **does not download the model**, which happens on first helper run (`tts_worker.py:84-97`). Its "Expected output" block is invented.
- Step 1.4 "Expected output" (`[INFO] Server listening… Ready to serve requests!`) does not match the real log strings (`App.swift:15-63`, e.g. "Natural TTS Helper is ready!").
- Test 1 "status indicator (top-left)… 🟢/🟡/🔴 dot": the popup now shows a **status pill with a text label** (Checking / Warming / Connected / Offline), top-right (`popup.html:26-35`, `popup.ts:190-201`).
- Test 2 Method A "Type some text in the input area": no input exists.
- Troubleshooting "Try manual download: `./Scripts/download-model.sh`": **the script does not exist**. The link `https://huggingface.co/hexgrad/Kokoro-82M-GGUF` is the wrong repository family (GGUF is not what the helper loads).
- 3 images at `via.placeholder.com`, which is unreachable (HTTP 000).
- "Helper uses ~500MB RAM when idle, ~1GB when processing" contradicts the helper README's "~2GB". Neither is re-measured.
- "Swift version 5.x": toolchain on this machine is 6.2.4; `swift-tools-version: 5.9`.
- "Settings Page (chrome://extensions/?options=<extension-id>)" is a placeholder.

### 3.5 `chrome-extension/PRIVACY.md` (the CWS privacy-policy candidate, so accuracy is load-bearing)
| Claim | Truth | Evidence |
|---|---|---|
| Voice and speed stored in "**Chrome Storage Sync** … Synced via Chrome Sync" | **`chrome.storage.local`** only; no `storage.sync` anywhere | `git grep storage.sync` → 0; `settings-defaults.ts:95-110`, `popup.ts:668-701` |
| "Helper status cache" | Actually key `native_tts_helper_config` = `{port, secret:'', default_voice}` | `config.ts:6,46-50` |
| Permissions table lists **`scripting`** | Not requested. The manifest has `storage, contextMenus, activeTab, offscreen`. | `manifest.json:6-11` |
| "Destination: `http://127.0.0.1:8249`" | Probes 8249–8260 | `config.ts:17` |
| "native helper … rejects all external requests" | It binds 127.0.0.1 (`HTTPServer.swift:40`). `/speak` and `/voices` reject non-extension `Origin`s (`HTTPServer.swift:88-92`), but **`/health` is open to any origin**, and requests with no `Origin` header (any local process) are accepted. The `secret` UUID is generated (`Config.swift:40`) but **never checked**: `unauthorized()` is dead code. | — |
| "zero external network requests" | True for the extension. **The helper** downloads model weights from huggingface.co on first run (`tts_worker.py:91`), plus the spaCy/misaki assets. A CWS-grade policy should disclose that one-time download. | — |
| Contact: "[Your contact email if applicable]", "[Security contact email]" | Placeholders. The CWS dashboard requires a real contact and a privacy-policy URL. | cws-dashboard-privacy |
| "Frontend: TypeScript, **Vite**, Bun" | Prod build is Bun only | §3.3 |
| "Version 1.4.0 … Last Updated November 2025" | The policy predates the 2026-05 CORS change it should describe | — |

### 3.6 `chrome-extension/ACCESSIBILITY.md`
- Every `file:line` anchor predates the 2026-05 UI redesign (for example "Settings button popup.html:15-25", "Status indicator aria-label='Helper status indicator' (line 30)"). The status is now a `role="status"` pill with `aria-label="Helper status: checking"` (`popup.html:26-35`).
- The colour table is obsolete. It lists `#333333`, `#1a73e8` and `#0f9d58`; the tokens are now `--color-text-primary #202124`, `--color-primary #3D4ED7` / `oklch(0.55 0.20 258)`, and split `*-text` colours (`variables.css:4-26`).
- "Message Container: `role="alert" aria-live="polite"`": the role and aria-live now switch by severity (`popup.ts:585-592`).
- The popup slider is now a **log-scale 0..1 position** (`popup.html:74-76`) carrying `aria-valuemin="0.5" aria-valuemax="2.0"` overrides, while the options slider is linear 0.5–2.0 (`options.html:59-61`). The audit's slider description no longer holds.
- "Keyboard Shortcuts: Documented and non-conflicting" (§ Best practices): there are none (§3.3).
- "Score: 95/100", "Audit Completed By: Accessibility Team", "Certification": no test artefacts back these. They are self-assertions and should not be repeated in a store listing.
- It does not mention the post-tag a11y fixes (`0d30634` focus ring, `c43dfb3` role/aria-live, `505d993` reduced-motion, `b06ccec` WCAG text colours), which are real improvements worth claiming **after** a re-test.

### 3.7 `chrome-extension/SCREENSHOTS_GUIDE.md`
- Its specs are **not** CWS specs. It asks for a 340×400 popup at 144 DPI, an 800×1200 options page, and 1000×600 context-menu shots. CWS requires **1280×800 or 640×400** full-bleed screenshots (1 to 5), a **440×280** small promo (required), an optional 1400×560 marquee, and a **YouTube** link for video.
- The popup is now 360 px wide (`popup.css:23`), not 340. Voices render inside optgroups, not as "Bella (US) - en-US". The popup slider has 3 labels, not 4. There is no "green dot" any more; it is a text pill.
- Screenshot 14's "expected" terminal lines are not the real log strings.
- It is useful only as a shot list (§9.2). None of the 14 shots or 2 videos exist.

### 3.8 `chrome-extension/TESTING_CHECKLIST.md`
- 209 unchecked boxes and 0 checked, so it was never executed; "Ready for v1.4.0 release" was never signed.
- It tests things that do not exist: "manifest.json has strict CSP" (no CSP key), "Works on Chrome 88+", "Verify only `http://127.0.0.1:8249` requests" (8249–8260), and "128/128 tests" (offline 122).
- §8.2 "Different Languages … English model attempts pronunciation": `normalize_text` NFKD-folds then **drops all non-ASCII** (`tts_worker.py:99-115`). A CJK or Cyrillic selection reduces to an empty string after the `if not text` guard (`tts_worker.py:233` runs before normalization). The service-worker comment (`service-worker.ts:31-37`) records that an empty post-normalization text hung the worker.

### 3.9 `chrome-extension/IMPLEMENTATION_PLAN.md`
- Status reads "READY TO BEGIN"; every phase has since shipped. "Chrome 88+" is wrong. The Phase 2.8 "Package for Chrome Web Store (optional)" and Phase 4 "Publish to Chrome Web Store" items are the only CWS planning that exists, and they are one-liners.
- Its "Performance Targets" table (bundle <50 KB gzipped, popup open <100 ms, speak latency <300 ms, memory <20 MB) was **never measured**. That is useful as acceptance criteria for W3 capture, not as claims.
- It correctly says production builds use the Bun bundler, which contradicts the extension README's "Vite + Terser".

### 3.10 `chrome-extension/BUN_TEST_RESULTS.md`, 3.11–3.12 `github-comment-*.md`
Tool-evaluation records for bun issues #16968 and #6338. Both comment drafts were **posted** (GitHub issuecomment-3514294313, -3514291979 and later), and both issues are now **closed**. Deleting them loses nothing.

### 3.13 `native-helper/README.md`
| Claim | Truth | Evidence |
|---|---|---|
| "on `127.0.0.1:random-port`"; config "`port`: Random port assigned at first run" | Pinned 8249 with fallback to 8260; atomic config write | `Config.swift:17-18,93`; `App.swift:23-33` |
| `/health` "503 Service Unavailable: Model still loading" | **Always 200**, with `"status":"warming"` and `model_loaded:false`. HTTP also only starts **after** warmup completes (`App.swift:47` before `:53`), so "warming" appears only if the Python worker dies later. The worker is never restarted: `maxRestarts` is declared and unused (`PythonWorker.swift:15,193-197`). | `HTTPServer.swift:111-125` |
| `/voices` example: 4 voices incl. "am_michael (UK Male) en-GB"; `/speak` list "af_sarah (UK Female)" | 6 voices. `am_michael` is "Michael (US) en-US". `af_sarah` is mislabelled "Sarah (UK) en-GB" **in the code itself**; `af_` is Kokoro's American-female prefix. Kokoro ships 28 English voices; `af_heart` is absent. | `HTTPServer.swift:203-213`; HF API |
| "The Chrome extension reads this file to discover the helper's port" | It **cannot** read files. It probes `GET /health` on 8249–8260. | `config.ts:19-28,93-128` |
| `secret`: "UUID token for future authentication (not yet implemented)" | Still not implemented. The extension sends `X-Secret` only if non-empty, and it is always `''`. | `api-client.ts:83-85`; `config.ts:47` |
| Installs "`phonemizer==3.3.0`" | Not installed directly. `phonemizer-fork>=3.3.2` arrives transitively via mlx-audio 0.2.6. | `setup-python-env.sh:81-85`; PyPI mlx-audio 0.2.6 `requires_dist` |
| "Python 3.9-3.11 (Python 3.12+ not yet supported by MLX)" | False for the pinned MLX 0.29.3 (cp312/cp313 wheels) | PyPI |
| "Downloads Kokoro-82M model (~200MB)"; uninstall "saves ~215MB" | `kokoro-v1_0.safetensors` alone is 327 MB; the local cache is 348 MB | HF API; `du` |
| "First run (~35s)… Subsequent runs (~2.5s)" | Not re-measured. The startup warm timeout is 60 s (`App.swift:47`). | — |
| Key files "`tts_worker.py:22-158`", "`HTTPServer.swift:45-120` … Spawns Python worker … Native Messaging IPC", "`PythonWorker.swift:30-85`" | Anchors have drifted: `_model_cache` is at :20, `get_cached_model` :70, `generate_audio_mlx` :118-208. HTTPServer does not spawn anything; PythonWorker does. | grep |
| Debugging: "edit `main.swift:15`" | `App.swift:10` | — |
| Python log lines "`[Python] [INFO] Loading…`" shown in expected output | Python stderr is forwarded at **debug** level (`PythonWorker.swift:52`) and the root level is `.info`, so these lines never print by default | — |
| Badges link `native-helper/TEST_RESULTS_OPTIMIZED.md` | This resolves to `native-helper/native-helper/…`, a **broken** relative link (×2) | link check |
| "Base64 encoding (~67% of warm request time, ~0.12s)" | Implausible: base64 of 74 KB takes microseconds. The breakdown was never reproduced. | — |
| FAQ "Chrome extension timeline… Native Messaging client in extension" | The extension exists and uses HTTP | — |
| "Version: v0.2.0" | 1.4.0 | — |
| "MIT License (see project root LICENSE)" | No LICENSE | — |

**Accurate and reusable:** the endpoint shapes (JSON field names match `Models.swift`), the response headers `X-Audio-Duration`, `X-Generation-Time` and `X-Real-Time-Factor` (`HTTPServer.swift:171-174`), the 400 and 500 error JSON, the 5,000-character limit (`HTTPServer.swift:151`), the WAV format (24 kHz mono PCM16, `tts_worker.py:175-185`), and the config path `~/Library/Application Support/NaturalTTS/config.json`.

### 3.14 `native-helper/QUICKSTART.md`
- "Check Python version (need 3.9-3.11)": see above.
- "Installs soundfile, phonemizer…": transitive only.
- The "Expected output" of setup and build is invented; the build line even names `main.swift`.
- "Note the port number (8249 in this example)": it is always 8249 unless occupied.
- "first run downloads ~215MB of models": ≥327 MB.
- The voice loop covers 4 of the 6 voices. `demo.sh` "hear 6 different voices" is correct.
- **Accurate and reusable:** the Scripts tour (`status.sh`, `logs.sh [--follow]`, `teardown.sh`, `demo.sh`, `quickstart.sh`, `test-performance-*.sh`) and `examples/sample-texts.json`.

### 3.15 `native-helper/TESTING_GUIDE.md`
- It hardcodes `AUDIO_DURATION=1.57` and `21.7` in the scripts it tells users to paste. Replace them with the `X-Audio-Duration` response header.
- "Health Check Fails (HTTP 503)": the helper never returns 503 (§3.13).
- "`/voices` … Expected: 4 (or more)": 6.
- Memory test uses `lsof -ti :$PORT`, which measures the Swift PID only. The Python worker, which holds the model, is a separate process, so the "~2000-2500 MB" expectation cannot come from this command.
- "validate the helper before Phase 2 development": obsolete framing.

### 3.16–3.18 `native-helper/TEST_RESULTS*.md`
Historical, dated 2025-11-09/10, three runs:

| File | RTF | Outcome |
|---|---|---|
| `TEST_RESULTS.md` | 0.62x | crash on the 2nd request; NO-GO |
| `TEST_RESULTS_PHASE_AB.md` | ~1.0x | after stdout→/dev/null |
| `TEST_RESULTS_OPTIMIZED.md` | "8.3x / 25x" | GO |

The "Key Code" in the optimized report shows `result = next(result_gen)`, which generates the **first sentence only**. That was fixed in 1.3.0 (`tts_worker.py:151-155` now iterates every chunk). Treat all three as history, and attach the §5 erratum to the third.

---

## 4. Cross-cutting defects (counts from `git grep` over tracked `*.md`)

| Pattern | Occurrences | Fix in rewrite |
|---|---:|---|
| "8.3x" / "25x" RTF claims | 61 lines | Re-measure with `X-Audio-Duration`; publish one number with its method |
| "Native Messaging" (misnomer for HTTP or the pipe) | 14 | "HTTP on 127.0.0.1:8249; length-prefixed JSON over stdio to the Python worker" |
| `yourusername` / `YOUR_USERNAME` placeholders | 8 | `renchris/natural-text-to-voice-extension` |
| "random port" | 4 | 8249, falling back to 8260 |
| `main.swift` | 4 | `App.swift` |
| `via.placeholder.com` images | 3 | Real captures |
| Broken relative links | 10 (`../LICENSE`; 2× the helper-README badge; 7 unrealised screenshot paths in SCREENSHOTS_GUIDE) | Add LICENSE; fix paths |
| "Chrome 88+" | README, INSTALL, IMPLEMENTATION_PLAN, TESTING_CHECKLIST | "Chrome 116+", and add `minimum_chrome_version: "116"` to the manifest |

---

## 5. The headline benchmark: erratum

- **Source of "25x":** `test-performance-long.sh:54` sets `AUDIO_DURATION=21.7` and `:73` computes RTF as `AUDIO_DURATION / curl time_total`. The duration is never read from the response, even though the helper returns `X-Audio-Duration` (`HTTPServer.swift:171`). `test-performance-short.sh:50` hardcodes 1.57 the same way.
- **The test text** (`test-performance-long.sh:46-52`): "The development of modern text-to-speech systems has revolutionized … accuracy and speed." `wc -w` gives **27 words**. The docs call it "50 words" (the 2-sentence version in `examples/sample-texts.json` is ~45 words, but the scripts use one sentence).
- **The docs' own evidence contradicts 21.7 s.** They report "321KB for 21.7s audio" (`TEST_RESULTS_OPTIMIZED.md`, `native-helper/README.md`). PCM16 mono at 24 kHz is 48,000 B/s, so (321×1024 − 44)/48,000 = **6.85 s**, and 21.7 s would be ~1,017 KB. The short case is self-consistent: 74 KB = 1.58 s, which matches the 1.58 s logged in `TEST_RESULTS.md`.
- **Implied true RTF:** 6.85 s ÷ 0.85 s ≈ **8.1x**. It is not text-length-dependent at 25x, and the "RTF scales with text length" finding rests on the wrong duration.
- **Consequence for W4:** do not reuse 8.3x or 25x. Re-measure on HEAD, or on the upgraded stack, using `X-Audio-Duration / X-Generation-Time`. `X-Real-Time-Factor` already excludes HTTP overhead. Record the text, the voice, the machine (M1 Max, macOS 15.7.9) and N.

---

## 6. CHANGELOG: what each version says shipped, and what it misses

| Version | Date | What the CHANGELOG (or the GH release, where no entry exists) says shipped | Tag → commit |
|---|---|---|---|
| **0.0.0** | 2025-11-09 | Phase 0 workspace: TTS.cpp submodule @ c04c77a; Metal build; Parler Mini v1.1 acquisition; **blocker**: GGUF DAC conversion fails on `parametrizations.weight.original0`; 4 options recommended (A pre-converted GGUF, B Python Parler, C wait, D Kokoro-only) | `67501a5` (remote tag only) |
| 0.2.0 | 2025-11-10 | **No CHANGELOG entry.** GH release "Native Helper Optimized (Production Ready)": model caching, in-memory WAV, "8.3x/25x RTF". Assets: a 7.25 MB `natural-tts-helper` binary and TEST_RESULTS_OPTIMIZED.md. | `87ac86b` ("add TTS.cpp as git submodule"; an odd tag target) |
| 1.0.0 | 2025-11-10 | **No CHANGELOG entry.** GH release "Phase 1 Complete: Production-Ready Native Helper" (same claims) | `8afc817` |
| **1.1.0-beta.1** | 2025-11-10 | Phase 2.2 API client: `/health`, `/voices`, `/speak`; discovery "ports 8249-8251"; retry with backoff (2 retries, 500 ms); error types; timeouts 10 s / 30 s; Bun test + happy-dom; 16 unit + 6 integration tests; MV3 manifest; icons | `682bdd2` |
| **1.1.0-beta.2** | 2025-11-10 | Phase 2.3 popup: voice dropdown, 0.5–2.0 slider, status indicator, messages, storage persistence; "temporary text input via browser prompt"; ~21 KB bundle; 340 px | `3ca40b0` |
| 1.2.0 | 2025-11-10 | **No CHANGELOG entry.** GH release: retry-connection button, offscreen document, offscreen path fix, popup-loading fixes | `995f9f1` |
| **1.3.0** | 2025-11-10 | Phase 2.6 options page and settings infra (6-voice `SETTINGS_CONSTRAINTS`, `validateSettings`); fixed the context-menu autoPlay block; **multi-sentence fix** (iterate all chunks); NFKD Unicode normalization. (The `1bac4f1` PDF ligature cleanup landed under this tag but is not in the entry.) | `1bac4f1` |
| **1.4.0** | 2025-11-11 | Phase 2.7 documentation sprint only (README, INSTALL, PRIVACY, ACCESSIBILITY, SCREENSHOTS_GUIDE, TESTING_CHECKLIST); package.json synced to 1.3.0. **Manifest at this tag still says 1.3.0.** (`9423315` bundle 108→61 KB and `6b2a78e` test fix are also under this tag but unlisted.) | `fa65fd0` |
| *(unlisted)* | 2026-05-25 | **30 commits**: `eba1086` port pin with atomic config; `2219b57` CORS restricted to extension origins plus CSRF rejection; `b286ef0` 12-port probe and warming state; `6565879` eager model load; `446331b` → `9f915ab` prewarm added then **reverted** (the code comment calls this "v1.4.1", a version that exists nowhere); 6 a11y fixes; v1 token system; popup redesign (optgroups, stepper, status pill, 2-state speak/stop, footer); `af822dd` **manifest bumped to 1.4.0**; `4cc5707` build copies `variables.css`; `767725b` offscreen race defence; `fe2ea58` log-scale slider | — |

**Consequences.** "1.4.0" names two different artefacts: tag `fa65fd0`, whose manifest says 1.3.0, and HEAD, whose manifest says 1.4.0. The first CWS upload must therefore carry a **new** version (for example 1.5.0, or 2.0.0 if the model or voice set changes), with a CHANGELOG entry covering the 30 commits plus the W2 upgrades. Also: backfill 0.2.0, 1.0.0 and 1.2.0 from their GH release bodies; add link refs for them; and fetch the missing local tag `v0.0.0` (`git fetch --tags`).

---

## 7. Visual assets inventory

| Asset | Status |
|---|---|
| `chrome-extension/public/icons/icon{16,48,128}.png` | 16/48/128 px; **no alpha channel**; **2 colours** (no anti-aliasing: visibly aliased circles at 4× zoom); full-bleed blue square. The glyph is a **left-pointing triangle in concentric rings**, which reads as "rewind/back" rather than speech (INSTALL says it "looks like a speaker"). The blue (~#2B63F0) does not match the brand token `#3D4ED7`. **Fails the CWS icon guidance**: 96×96 artwork inside 16 px transparent padding, and working on light and dark. Unchanged since `147ee99` (2025-11-10). |
| Screenshots / GIFs / video / SVG diagrams | **None tracked.** 0 of SCREENSHOTS_GUIDE's 14 shots and 0 of 2 videos exist. No architecture diagram exists except ASCII art (`chrome-extension/README.md` "Architecture Overview"; `PRIVACY.md` "Network diagram"). |
| `dist/icons/*` | Build copies of the above (gitignored) |
| `welcome.wav` (untracked, root) | 7.25 s Kokoro sample. The program plan says never stage it. A **fresh** audio sample should be generated for the README instead. |
| GH release v0.2.0 asset `natural-tts-helper` | 7,253,312 B unsigned binary from 2025-11. Not a visual asset, but the only distributable binary ever published. It predates every fix since. |
| `.gitignore` | Does **not** ignore `png/jpg/gif/svg/mp4/webm/wav` or `assets/` / `docs/` (checked with `git check-ignore`), so W3 captures can be committed without `-f`. |

---

## 8. The `TTS.cpp` situation

- `TTS.cpp` is tracked as a **gitlink** (mode 160000 → `c04c77ab`, which is mmwillet/TTS.cpp "Merge PR #117", 2025-10-05). It entered via the merge `e47cbaf`. `.gitmodules` was deleted in `8afc817`, whose own message says "TTS.cpp submodule removed", yet the gitlink stayed.
- The on-disk `TTS.cpp/` is an **empty directory**. `git submodule status` fails with "no submodule mapping found". GitHub shows an unclickable `TTS.cpp @ c04c77a` entry in the root tree listing, the first thing a store reviewer or a README visitor sees.
- The historical `.gitmodules` URL was `https://github.com/synesthesiam/TTS.cpp.git`, which now returns 404. Upstream mmwillet/TTS.cpp has had no push since 2025-10-05.
- `.gitignore:79-82` carries dead `TTS.cpp/build/`, `TTS.cpp/*.gguf` and `TTS.cpp/models/` rules.
- **Fix (a single atomic commit, for the implementation wave):** `git rm --cached TTS.cpp && rmdir TTS.cpp`, then drop the 4 `.gitignore` lines. Record the Phase 0 finding in `docs/history/`. Also update the GitHub repo description (currently "Evaluating Kokoro (WebGPU) and Parler TTS (native Metal)"), and add topics and a license.

---

## 9. Raw material for the rewrite

### 9.1 For the new root `README.md` (best sources, in pyramid order)

| README slot | Best existing source | Needed correction |
|---|---|---|
| One-line value proposition | `manifest.json:5` "Privacy-first TTS with local Metal-accelerated processing"; chrome-ext README tagline | Drop "WebGPU"; state that it needs Apple Silicon and runs a local helper |
| "How it works" diagram | chrome-ext README ASCII architecture plus its 12-step flow (§ Communication Flow) | Correct steps 6, 10 and 11 (offscreen calls the API; binary WAV over HTTP; base64 only on stdio). Render with beautiful-mermaid as a sequence diagram: content script → SW → offscreen → `POST /speak` → Swift NIO → stdio JSON → Python mlx-audio Kokoro → WAV. |
| Quick start | `native-helper/Scripts/quickstart.sh` (581 lines, the real automation) + QUICKSTART steps 1–5 + chrome-ext README install steps 1–3 | Real clone URL; Python version per the upgrade outcome; `bun install && bun run build`; load `dist/` |
| Features (truthful) | chrome-ext README § Features | Keep: context menu on pages and PDFs, PDF ligature cleanup (`text-cleanup.ts`), multi-sentence, 0.5–2.0× log slider with ± steppers, grouped voices, warming/offline status pill, retry, options page, 5,000-character limit, reduced-motion support. **Remove:** text input, 6 "premium" voices phrasing (fix the `af_sarah` label, and consider exposing Kokoro's 28 English voices including `af_heart`), auto-play, auto-retry, the keyboard shortcut (or implement a `commands` entry for ⌥⇧S). |
| Privacy | PRIVACY.md TL;DR | Correct per §3.5: `storage.local`, 8249–8260, Origin gate, a one-time model download by the helper |
| API reference (collapsible or `docs/API.md`) | native-helper README § API Documentation | Per §3.13 |
| Troubleshooting | chrome-ext README § Troubleshooting + helper README § Troubleshooting ("Address already in use", "Model warmup timed out") | Delete the 503 and "random port" advice |
| Performance | none trustworthy | Re-measure (§5) |
| History / why this stack | root README Phase 0 + TEST_RESULTS trilogy (0.62x → 1.0x → ~8x) | Put it in `docs/history/`; link one line from the README |
| License and credits | none correct | New LICENSE (MIT per `package.json`); credits: Kokoro-82M (hexgrad, Apache-2.0), MLX weights (prince-canuma, Apache-2.0), mlx-audio (MIT), MLX (MIT), misaki (Apache-2.0), espeak-ng (GPL-3.0, loaded at runtime via espeakng-loader), SwiftNIO (Apache-2.0) |

### 9.2 For the Chrome Web Store listing

| Listing field | Best existing source | Note |
|---|---|---|
| Name / short description (≤132 chars) | `manifest.json:3,5` | The name "Natural Text-to-Speech" is fine. The description must also say it **requires a free local macOS helper (Apple Silicon)**; otherwise reviewers and users hit "Offline" on first open. |
| Single-purpose statement | chrome-ext README opening sentence | "Reads selected text aloud using a speech model running locally on your Mac." |
| Permission justifications | PRIVACY.md § Chrome Permissions table | **Rewrite from the manifest**: `storage` (preferences), `contextMenus` ("Speak selected text"), `activeTab` (read the selection on click), `offscreen` (play audio after the popup closes, AUDIO_PLAYBACK), host `http://127.0.0.1/*` (the local helper only). Justify or remove the `<all_urls>` content script. Consider replacing it with `activeTab` + `chrome.scripting.executeScript` on click, which removes broad host access (it would add a `scripting` permission). |
| Remote code | none | Declare "No remote code" (all JS is bundled; the helper is a separate native app) |
| Data-usage certification | PRIVACY.md § Data Collection | "Does not collect" holds for the extension |
| Privacy policy URL | PRIVACY.md | Must be public and stable, and must have the placeholders removed. The root `PRIVACY.md` GitHub URL works. |
| Screenshots (1280×800, 1–5) | SCREENSHOTS_GUIDE shots 1, 5, 10, 11, 4 (popup, options, context menu on a page, on a PDF, offline state) | Capture as 1280×800 composites. Fix the "Sarah (UK)" label first, or it appears in the voice list. |
| Small promo 440×280 (required), marquee 1400×560 | none | New; the icon must be redone first (§7) |
| Video (YouTube link) | SCREENSHOTS_GUIDE "Video 1: Quick Feature Tour" storyboard (7 beats, 60–90 s) | Usable storyboard, but it must be hosted on YouTube for the listing |
| Support / homepage URL | none | GitHub repo URL; an issues URL |

---

## 10. UI copy and behaviour that no document should repeat (fix or remove)

These are code-level contradictions the README and listing writers must route around. They may also warrant W2 fixes.

1. `⌥⇧S` footer hint (`popup.html:123`) with no `commands` in the manifest.
2. `af_sarah` labelled "Sarah (UK) / en-GB" (`HTTPServer.swift:206`).
3. The auto-play checkbox copy promises behaviour that is ignored (`options.html:93` vs `service-worker.ts:139`).
4. The auto-retry checkbox is stored but never read.
5. Popup warning "…or enter text to speak" (`popup.ts:401`) with no input field.
6. Options `versionText` defaults to `1.2.0` in HTML (`options.html:119`). It is overwritten at runtime, so this is cosmetic unless JS fails.
7. The popup log slider versus the options linear slider: same setting, two scales.
8. The context-menu path validates the voice against the 6-voice allowlist (`settings-defaults.ts:38-45,66-68`), while the popup accepts any `/voices` id. **Expanding the voice set upstream will silently revert context-menu speech to `af_bella`** unless `SETTINGS_CONSTRAINTS.voices` is derived from `/voices`.
9. Popup "Speak" plays audio in the popup document (`popup.ts:537`), so closing the popup stops playback. Only the context menu uses the offscreen document.
10. The `/health` "warming" state can never occur at startup (HTTP binds after warmup), and a dead worker is never restarted.

---

## 11. Gaps (not verified in this pass)

- **No live helper run.** The true current RTF, startup time and memory are not re-measured. §5 is an arithmetic erratum from the docs' own recorded byte counts, not a new measurement. It was skipped to avoid colliding with sibling agents on port 8249 and the shared `config.json`.
- Whether Homebrew `espeak-ng` is still required, given the bundled espeakng-loader library and data, needs a clean-machine (or Homebrew-absent) test.
- The "128 tests / 322 assertions" count with a live helper is inferred from a static count (122 + 6) and the CHANGELOG's "19 integration assertions", not executed.
- Accessibility claims (VoiceOver, zoom, contrast) were not re-tested. Colour values were read from tokens only.
- `vite build`, with its terser and lightningcss config, was not executed. Its failure is inferred from the absent packages, not observed.
