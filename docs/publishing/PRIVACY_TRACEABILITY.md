# Privacy policy traceability (v1.5.0)

Each statement in [`chrome-extension/PRIVACY.md`](../../chrome-extension/PRIVACY.md) maps to the code that makes it
true. Line numbers were re-derived on 2026-09-24 for the v1.5.0 release tree (the commit that last changed this file);
`v1.5.0` is tagged at the release HEAD, so re-check them at the tagged commit. When the code or the policy changes,
update both files and this table in the same commit. The Chrome Web Store suspends **every** item a publisher owns when the privacy fields,
the policy and the behaviour disagree (User Data FAQ), so a stale row here is a release blocker.

Paths are shortened: `ext/` = `chrome-extension/`, `sw` = `ext/src/background/service-worker.ts`,
`helper/` = `native-helper/Sources/NaturalTTSHelper/`, `worker` = `helper/Resources/tts_worker.py`,
`formula` = `packaging/homebrew/Formula/natural-tts.rb`.

## Extension

| # | Policy statement | Evidence |
| --- | --- | --- |
| E1 | Reads the selection only when asked: the menu item, the popup's Speak button, or a shortcut the user assigned | `sw:113` (`contextMenus.onClicked`), `sw:151` (`commands.onCommand`), `ext/src/popup/popup.ts:746-760` (popup reads the active tab). Menu item is created with `contexts: ['selection']` (`sw:98-102`). Shortcuts ship with no default keys (`ext/public/manifest.json`, `commands` has no `suggested_key`) |
| E2 | `activeTab` until the user leaves or closes the page; one small function returns the selection and whether the page is a PDF; the page address is checked for `.pdf` and neither stored nor sent | `ext/src/shared/selection.ts:29-36` (`probeSelection` returns `getSelection()` text and `document.contentType === 'application/pdf'`), run by `chrome.scripting.executeScript` at `selection.ts:44-56` |
| E3 | In a PDF, or where the page can't be read, uses the text Chrome passes to the menu | `selection.ts:116-118` (`info.selectionText` fallback) |
| E4 | Installs no content scripts; the only code run in a page is E2's function, when asked; reads nothing until asked | `ext/public/manifest.json` has no `content_scripts` key; `executeScript` is called only from `selection.ts:46`, reached only from E1's handlers |
| E5 | Sends the text with the voice and speed to the helper; receives audio | `ext/src/shared/api-client.ts:241-254` (payload `{text, voice, speed}`, `POST /speak`) |
| E6 | Plays audio from memory; does not store text or audio | Object URLs from the response blob: `ext/src/offscreen/offscreen.ts:293` (created), `:147` (revoked); `ext/src/popup/popup.ts:779` / `:784`. No `storage.*.set` call carries text: every `set` is listed in E7 |
| E7 | Saves exactly four things with `chrome.storage.local` | `selectedVoice`, `selectedSpeed`, `whenHelperUnavailable`: `ext/src/shared/settings-defaults.ts:14-29,113-133`, `popup.ts:1029-1032`. Port + default voice under `native_tts_helper_config`: `ext/src/shared/config.ts:7,68-79,122-124`. `grep -rn 'chrome.storage' ext/src` shows no other writer |
| E8 | No `chrome.storage.sync` | `grep -rn 'storage.sync' ext/src` returns nothing |
| E9 | Only host permission is `http://127.0.0.1/*` | `ext/public/manifest.json:16-18`. Install warning measured on CfT 153 from the packaged zip: `["Read and change your data on 127.0.0.1"]` (`node chrome-extension/scripts/verify-permissions.cjs`) |
| E10 | Looks on 8249-8260 and checks the answer is the helper's status reply before sending text; anything else is skipped | `config.ts:12-18` (ports), `:26-40` (`isHelperHealth`: a 2xx whose JSON has `model === 'kokoro-82m'` and a string `status`; a program that imitates that reply would pass, which the policy no longer denies), `:156-202` (all ports probed at once, lowest port that is the helper wins), `:212-236` (verify stored port, else discover) |
| E11 | The only network calls are to `127.0.0.1` | `fetch(` appears only at `config.ts:160`, `config.ts:220` and `api-client.ts:134`, all built from `http://127.0.0.1:${port}` (`api-client.ts:94`) |
| E12 | Falls back to `chrome.tts` only when the helper can't be reached, and only if the setting allows | `ext/src/shared/system-voice.ts:55-57` (`shouldUseSystemVoice`), `ext/src/shared/helper-errors.ts:160-171` (unreachable only); default `'system-voice'` at `system-voice.ts:22` |
| E13 | Only voices Chrome reports as local; never a network voice or another extension's voice; errors when none | `system-voice.ts:99-107` (`remote !== true`, no `extensionId`), `:133-149` (returns `null` when no local voice); `ext/src/background/system-voice-engine.ts:76-81,108-111` (unreadable list → no voice → error) |
| E14 | "Show an error" turns it off | `ext/src/options/options.ts:176-178` saves the select as `whenHelperUnavailable`; `system-voice.ts:17-26,55-57` (`'error'` never falls back) |
| E15 | Popup links to GitHub open only on click | `ext/src/popup/popup.html:51,57` (`<a target="_blank">`), the only external URLs in the extension's HTML |
| E16 | No analytics, advertising, tracking, crash reporting or third-party code | `ext/package.json` `"dependencies": {}`; the bundles are built only from `ext/src` (`ext/build.ts`); E11 shows no other destination |

## Helper

| # | Policy statement | Evidence |
| --- | --- | --- |
| H1 | Accepts connections on `127.0.0.1` only | `helper/HTTPServer.swift:65` (`bind(host: "127.0.0.1", …)`) |
| H2 | Refuses a `Host` other than `127.0.0.1`/`localhost`/`[::1]` with its port (DNS rebinding) | `HTTPServer.swift:140-154`, `:348-351` |
| H3 | Refuses web pages on the text and voices endpoints; answers extensions and local programs | `HTTPServer.swift:156-178` (403 for a non-extension `Origin` on `/speak` and `/voices`; no `Origin` allowed), `:353-357` (`chrome-extension://`, `moz-extension://`, `safari-web-extension://`) |
| H4 | `/health` answers anyone, and reports readiness, version, uptime and requests served; never any text | `HTTPServer.swift:169-171` (policy comment), `:193-220` (`status`, `model`, `modelLoaded`, `uptimeSeconds`, `requestsServed`, `version`, `apiVersion`) |
| H5 | Makes audio in memory and returns it; keeps no text or audio | The only file writes in the helper are `Config.swift:307` (config.json) and `PythonWorker.swift:269` (a cancel marker holding the request id). The worker returns audio over its pipe (`worker:210-219`) |
| H6 | Log: sizes, timings, voice and speed, error codes, refused Host/Origin; never the text | `worker:417` and `:430-432` (lengths, voice, speed); `HTTPServer.swift:147,174` (refused Host/Origin, 100 chars max); only `[worker]` lines are logged at info, through a redactor (`PythonWorker.swift:115-142`, `:523-530`); the handler level is `.info` (`App.swift:18,22`), so the `debug` lines at `PythonWorker.swift:141,206` are dropped. Gate: `scripts/verify-all.sh:356-357` asserts a sentinel sent to `/speak` never reaches the log. Re-checked 2026-09-23 on this branch: the spoken paragraph appears in none of 264 log lines over 3 runs |
| H7 | Log location: Homebrew `$(brew --prefix)/var/log/natural-tts.log`; otherwise the terminal | `formula:107-108`; the logger writes to standard output (`App.swift:15-24`: bare messages in a terminal, `TerminalLogHandler.swift`; the full format elsewhere) |
| H8 | `config.json` holds the port, the helper's own paths and its default voice; Homebrew keeps it in `var/natural-tts`, otherwise `~/Library/Application Support/NaturalTTS/` | `helper/Config.swift:136-140`; `formula:106` (`NATURAL_TTS_CONFIG_DIR`); the default directory: `Config.swift:152-154` (`configDirectory`) |
| H9 | Hugging Face offline mode on, telemetry off; nothing outside the computer while it runs | `PythonWorker.swift:108-113` and `worker:11-14` (`HF_HUB_OFFLINE=1`, `HF_HUB_DISABLE_TELEMETRY=1`); the only socket the Swift side opens is a loopback port probe (`Config.swift:254-280`). Gate: `verify-all.sh:237-239` asserts 0 ESTABLISHED worker connections during `/speak` (W2 §7) |
| H10 | Install downloads the pinned `prince-canuma/Kokoro-82M` from huggingface.co, Python packages from pypi.org, source and Swift packages from github.com, and with Homebrew the formula's dependencies (uv, Python 3.12, espeak-ng) from Homebrew's servers | Model: `worker:73-79` (`MODEL_ID`, `MODEL_REVISION`), `formula:62-73`, `native-helper/Scripts/setup-python-env.sh:117`. PyPI: `native-helper/python/uv.lock` (every `registry = "https://pypi.org/simple"`). GitHub: `formula:11` (tarball), `native-helper/Package.swift:33-38`. Homebrew bottles: `formula:22-26` (`depends_on`) |

## Other statements

| # | Policy statement | Evidence |
| --- | --- | --- |
| O1 | Limited Use sentence | Required wording, Chrome Web Store Limited Use policy (R07 §12.8, [S16]) |
| O2 | Questions via GitHub issues | Issues are enabled (`gh api repos/renchris/natural-text-to-voice-extension --jq .has_issues` → `true`, 2026-09-23) |
| O3 | Private vulnerability reporting link | **Not true until the release step runs.** Measured 2026-09-23: `gh api repos/renchris/natural-text-to-voice-extension/private-vulnerability-reporting` → `{"enabled":false}`. `scripts/release/release.sh` enables it (gated `--confirm private-vulnerability-reporting`, step 4), and step 5 prints "NOT READY — do not submit" instead of the dashboard steps while step 4 is not `CURRENT` or `DONE`, so the link works before the listing is submitted |
| O4 | Open source, MIT | `LICENSE` (repo root); `formula:19` |

## What the rewrite removed, and why

The pre-1.5.0 policy (last in `9186b17`) had claims that no code can prove, so they were dropped rather than kept:
"complies with GDPR, CCPA, COPPA" (legal conclusions, not behaviour), "Chrome Storage API (encrypted by Chrome)"
(`chrome.storage.local` is not documented as encrypted), "We will respond within 48 hours" (a promise nothing
enforces), "Export: settings are human-readable JSON" (no export feature exists), and the `localhost:8249` diagram
(the helper uses 8249-8260). Everything true in it survives above, reworded.
