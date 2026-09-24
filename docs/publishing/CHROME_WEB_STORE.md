# Chrome Web Store listing: Natural TTS 1.5.0

Every field of the Chrome Web Store Developer Dashboard, final and ready to paste, in the order the dashboard asks for
them. Copy the text inside each `text` block exactly; the character counts below were measured on these blocks.

**OPERATOR** marks a step only the account owner can do (sign-in, payment, identity, uploads to YouTube). Everything
else is decided here.

Sources: [R07](../research/2026-09-upgrade/R07-chrome-web-store-publishing.md) (store research, with its adversarial
verification), [UPGRADE_RESEARCH §11](../research/2026-09-upgrade/UPGRADE_RESEARCH.md#11-publishing-inputs) (its
corrections), the operator rulings of 2026-09-23 (OD-1, OD-2, OD-5, OD-7, OD-8, OD-9), and the 1.5.0 code.

## Before you open the dashboard

Every claim in the listing is true only once these are. `scripts/release/release.sh` drives all of them except the
last two, and prints this list with each item's live status (see [RELEASE.md](RELEASE.md)).

| # | Must be true | Why | Who |
| --- | --- | --- | --- |
| 1 | Tag `v1.5.0` and its GitHub Release (with the zip) exist | The description and test instructions point at the repository and the Homebrew formula builds from the tag | `release.sh` (gated) |
| 2 | `brew install renchris/tap/natural-tts` works | The Requirements block and the reviewer's steps depend on it. **The tap is not published yet** | `release.sh` → `publish-tap.sh` (gated) |
| 3 | GitHub private vulnerability reporting is on | `PRIVACY.md` links to it. Measured `{"enabled":false}` on 2026-09-23 | `release.sh` (gated) |
| 4 | `chrome-extension/PRIVACY.md` on `main` is the 1.5.0 policy | The privacy policy URL serves `main` | already landed with this kit |
| 5 | The store images exist under `assets/store/` at the sizes in [§2.2](#22-graphic-assets) | The dashboard rejects a listing without an icon or a screenshot | W3 capture lane |
| 6 | The demo video is on YouTube, public or unlisted | The promo video field takes only a YouTube URL | **OPERATOR** ([YOUTUBE.md](YOUTUBE.md)) |

## 0. Account (once) — OPERATOR

Dashboard: <https://chrome.google.com/webstore/devconsole>

| Field | Value | Notes |
| --- | --- | --- |
| Google account | A dedicated account you check often | **OPERATOR.** The developer email can never be changed later; changing it means a new account and an item transfer [R07 §2] |
| 2-Step Verification | On | **OPERATOR.** Required to publish or update anything [R07 §2, S36] |
| Registration fee | US$5, one time | **OPERATOR.** Paid on the registration screen. Primary source: the dashboard's What's New entry of 30 Apr 2026 [R07 verification item 3] |
| Publisher name | `Chris Ren` (or a project name you prefer) | **OPERATOR.** Shown under the title on the listing |
| Contact email | An address you check | **OPERATOR.** Must be verified from the Account page before the first submission. Shown to Google, not to users |
| Trader status (EU DSA) | **Non-trader** | Operator ruling OD-9. A free, MIT-licensed, non-commercial tool with no payments, ads or data use is the ordinary non-trader case. Switch to Trader (which publishes your address and phone number) before any monetisation [R07 §2] |
| Physical address | Not needed | Only for items that sell something |

A new publisher may have at most 2 published extensions at first [R07 §1].

## 1. Package

Click **Add new item** and upload the zip.

| Item | Value |
| --- | --- |
| File | `chrome-extension/release/natural-tts-1.5.0.zip`, built by `cd chrome-extension && bun run package` (or by `release.sh`, which also attaches it to the GitHub Release) |
| Checks the packager enforces | manifest version = `package.json` version = 1.5.0, no `key`, name ≤ 75 and description ≤ 132 characters, every file the manifest names is present, no source maps, tests, dotfiles or logs, `manifest.json` at the zip root, every entry re-read and CRC-checked |
| Measured (2026-09-23, this tree) | 15 files, 111,085 bytes unpacked, **43,117-byte zip**, sha256 `a809c11be2e473ee94b015793478929be1ad211457a7e586a0f99effbc03d642`. The zip is deterministic: the same `dist` gives the same hash |
| Install warning | `["Read and change your data on 127.0.0.1"]`, measured on Chrome for Testing 153 from the unzipped package (`node scripts/verify-permissions.cjs <dir>`) |

The upload assigns the **item ID**. Record it: the post-launch helper origin pin (W2-6) needs it.

## 2. Store listing tab

### 2.1 Product details

**Title** comes from the package (`manifest.json` `name`) and cannot be edited in the dashboard:

```text
Natural TTS: Private Kokoro Voices for Mac
```

42 of 75 characters (operator ruling OD-7). No "Chrome" in the name, as the branding rules require.

**Summary** also comes from the package (`manifest.json` `description`):

```text
Natural Kokoro voices, generated on your Mac, not in the cloud, with the free Natural TTS helper. System voices otherwise.
```

122 of 132 characters. *Reconciled:* the research drafts proposed "…Requires the free Natural TTS Helper." (R07 §12.1,
UPGRADE_RESEARCH §11). That wording became false when OD-2 added the system-voice fallback, because the helper is no
longer required for speech. The manifest's sentence is the one that ships, it is true of 1.5.0, and the dashboard
cannot override it, so this listing uses it unchanged. The detailed description below opens with the same promise, as
the leading listings do [R07 §4.3].

**Description.** Paste exactly this (2,979 characters, 41 lines; the dashboard takes plain text, so the bullets are
`•` characters and the blank lines are kept):

```text
Select text in Chrome and hear it read aloud in a natural Kokoro voice, generated on your own Mac instead of in the cloud. Your text goes only to 127.0.0.1, your own computer.

HOW IT WORKS
Select text on a web page or in a PDF, right-click, and choose "Speak selected text". Or click the toolbar button, pick a voice and a speed, and press Speak. You can also assign keyboard shortcuts for Speak and Stop at chrome://extensions/shortcuts.

The speech comes from Kokoro-82M, an open-weight model that runs on your Mac's GPU inside the free, open-source Natural TTS helper app. On an M1 Max it generates speech more than 20 times faster than real time, so a paragraph is ready in about a second.

FEATURES
• 28 English voices, American and British, grouped by accent and gender. Heart is the default.
• Speed from 0.5× to 2.0×
• Works in Chrome's built-in PDF viewer, and repairs broken ligatures in PDF text (for example "tra!c" becomes "traffic")
• Up to 5,000 characters at a time
• A status light that shows when the helper is ready, and plain-language messages when something goes wrong
• Popup and settings work from the keyboard
• No account, no subscription, no usage limits

PRIVATE BY DESIGN
• The extension can reach only 127.0.0.1. Chrome's install prompt says exactly that: "Read and change your data on 127.0.0.1".
• It reads a page only when you ask it to speak, and it saves nothing but your settings.
• No analytics, no tracking, no ads. The developer receives no data.
• After setup, speech works offline.

REQUIREMENTS
• Kokoro speech needs macOS 14 (Sonoma) or later on Apple silicon (M1 or later), and the free Natural TTS helper. Install it with Homebrew, which builds it in a few minutes:
  brew install renchris/tap/natural-tts
  brew services start natural-tts
• Installing the helper downloads the Kokoro model (about 350 MB) once from huggingface.co. The helper takes about 1 GB of disk space.
• Without the helper, including on Windows, Linux, ChromeOS and Intel Macs, the extension reads your selection with your computer's built-in system voices where it has them, and the popup shows how to install the helper.
• Chrome 148 or later.

PERMISSIONS, EXPLAINED
• "Read and change your data on 127.0.0.1": lets the extension reach the helper on your own computer, and no other address.
• Active tab and scripting: read the text you selected, only when you press Speak, choose the menu item or use a shortcut.
• Context menu: adds "Speak selected text" to the right-click menu.
• Offscreen document: plays the audio.
• Text-to-speech: uses your system voices when the helper isn't running.
• Storage: remembers your settings on this device.

OPEN SOURCE
The extension and the helper are MIT-licensed. Kokoro-82M is Apache-2.0 licensed, by hexgrad. Source code, setup guide and issues: https://github.com/renchris/natural-text-to-voice-extension
Privacy policy: https://github.com/renchris/natural-text-to-voice-extension/blob/main/chrome-extension/PRIVACY.md
```

Every claim in it, and where it is proven:

| Claim | Source of truth |
| --- | --- |
| Text goes only to 127.0.0.1; the only install warning | `manifest.json` `host_permissions`; measured warning in §1 |
| Right-click "Speak selected text"; popup Speak; shortcuts with no default keys | `service-worker.ts:98-102,151`; manifest `commands` (no `suggested_key`); CHANGELOG 1.5.0 |
| Kokoro-82M on the Mac's GPU; more than 20× real time on an M1 Max; a paragraph in about a second | W2-integration-measurements §3: warm RTF 26.2-26.6× at every size, 60 words in 1.106 s (idle GPU). `bench/results.json` (the README chart): 21.6-23.3× with other GPU work running, 60 words in 1.24 s. "More than 20×" is true of both; see [§8](#8-timings-behind-the-numbers) |
| 28 voices, US and UK, grouped; Heart default | `src/shared/voices.ts` (20 `a*`, 8 `b*`, `DEFAULT_VOICE = 'af_heart'`); `src/shared/voice-options.ts` (optgroups) |
| Speed 0.5-2.0× | `src/shared/settings-defaults.ts:34-39` |
| PDF viewer; ligature repair, "tra!c" → "traffic" | `src/shared/selection.ts:70-122`; `src/shared/text-cleanup.ts` (its own example) |
| 5,000 characters | helper `HTTPServer.swift` `text_too_long`; `helper-errors.ts` message |
| Status light; plain-language errors | popup status pill (Checking / Warming / Connected / Offline); `helper-errors.ts` messages |
| Keyboard use | `chrome-extension/ACCESSIBILITY.md` (keyboard navigation audit) |
| Reads only on request; saves only settings; no analytics; offline | [PRIVACY_TRACEABILITY.md](PRIVACY_TRACEABILITY.md) E1-E16, H9 |
| macOS 14+, Apple silicon | formula `depends_on macos: :sonoma`, `depends_on arch: :arm64`; CHANGELOG "Breaking" |
| Homebrew builds it in a few minutes | Local proof: build and install in 1 min 46 s, reinstall 1 min 21 s, on an M1 Max (`packaging/homebrew/README.md`) |
| ~350 MB model once from huggingface.co; ~1 GB on disk | W2 §1: HF cache 349 MB; formula proof: 995.8 MB installed (python-env 664 MB, hf-cache 340 MB) |
| System voices without the helper, where the OS has them | `src/shared/system-voice.ts:99-149` (local voices only, error when none); CHANGELOG OD-2 |
| Chrome 148 or later | manifest `minimum_chrome_version` |
| MIT; Kokoro-82M Apache-2.0 by hexgrad | `LICENSE`; `THIRD_PARTY_NOTICES.md` |

*Keyword check* (the policy forbids keyword lists and "unnatural repetition of the same keyword more than 5 times"):
there is no keyword list. Counted case-insensitively as whole words: "Kokoro" 5, "speech" 5, "voice/voices" 7,
"helper" 10, "text" 10. The last three are the product's own nouns in ordinary sentences ("the helper", "selected
text"), not repeated search terms; "read aloud", the phrase people search, appears once.

**Category:** `Accessibility` (operator ruling). Read Aloud, the category leader, is listed there [R07 §4.3].

**Language:** `English (United States)`.

### 2.2 Graphic assets

The images are produced by the W3 capture lane with `scripts/capture/cws/render.sh`, which renders at the exact size,
strips alpha and metadata, and asserts the dimensions. **These file names are the contract between the capture lane
and this listing**; `release.sh` checks that each one exists at its size before printing the dashboard steps.

| Dashboard field | File | Size | Required | Content |
| --- | --- | --- | --- | --- |
| Store icon | `chrome-extension/public/icons/icon128.png` (the same file is in the zip) | 128×128 PNG with alpha | yes | OD-10 icon. Measured: `srgba`, transparent corners, as the spec's 96 px artwork + 16 px transparent padding requires |
| Global promo video | YouTube URL — **OPERATOR** | — | no, but strongly advised | See [YOUTUBE.md](YOUTUBE.md). Paste the `https://www.youtube.com/watch?v=…` URL |
| Screenshot 1 | `assets/store/screenshot-1-right-click.png` | 1280×800 | at least 1 | "Select text. Right-click. Listen." The native context menu on a real article |
| Screenshot 2 | `assets/store/screenshot-2-voices.png` | 1280×800 | | "Natural voices, at your speed." The popup with Emma (UK) speaking at 1.3×, beside the 28 voices by accent (20 American, 8 British) |
| Screenshot 3 | `assets/store/screenshot-3-on-device.png` | 1280×800 | | "Made on your Mac. Not in the cloud." Chrome → 127.0.0.1 → helper → Apple GPU, next to the Connected popup |
| Screenshot 4 | `assets/store/screenshot-4-no-helper.png` | 1280×800 | | "Works without the helper, too." The popup with no helper: Offline, the system-voice line, the Homebrew hint. (Not the PDF shot: Chrome's PDF selection carries no ligature code points, so the repair cannot be shown; see `assets/store/README.md`) |
| Screenshot 5 | `assets/store/screenshot-5-setup.png` | 1280×800 | | "Install once. It's always ready." The Homebrew one-liner as two commands, the Connected popup, and the system-voice fallback line |
| Small promo tile | `assets/store/small-tile-440x280.png` | 440×280 | **yes** (items without one are listed after items that have one) | Glyph and waveform, no text |
| Marquee promo tile | `assets/store/marquee-1400x560.png` | 1400×560 | no (needed for marquee placement) | Wordmark, "Private, on-device voices", the real popup crop |

Screenshot rules [R07 §4.2]: square corners, full bleed, the real UI, and every caption legible at the 640×400 the
store downscales to (the render script writes `*.proof-640x400.png` for that check). The screenshots are uploaded in
the order above. Avoid the caption "Five-minute setup" unless it has been timed on a clean Mac; the measured build
alone is about 2 minutes, and a fresh Homebrew and Command Line Tools install is not counted in it.

### 2.3 Additional fields

| Field | Value |
| --- | --- |
| Official URL | Leave empty. It needs a site verified in Search Console, and the picker is reported flaky [R07 verification item 6] |
| Homepage URL | `https://github.com/renchris/natural-text-to-voice-extension` |
| Support URL | `https://github.com/renchris/natural-text-to-voice-extension/issues` (a web page, as the field requires, not an email address) |
| Mature content | No |

## 3. Privacy tab

### 3.1 Single purpose

```text
Reads aloud the text the user selects in the browser, using speech generated on the user's own computer: by the companion Natural TTS helper app on 127.0.0.1, or by the operating system's built-in voices when the helper isn't running.
```

(One purpose, reading the selection aloud; both engines serve it. Adapted from R07 §5.1 to include the OD-2 fallback,
which R07 predates.)

### 3.2 Permission justifications

One field per permission, then one for the host permission. Paste each block into the field of the same name.

**storage**

```text
Saves the user's chosen voice, speed and "When the helper isn't running" setting, and the local port the helper was found on, in chrome.storage.local on this device. Nothing is synced or sent anywhere.
```

**contextMenus**

```text
Adds one item, "Speak selected text", to the right-click menu. It appears only when text is selected, and choosing it is how most users start speech.
```

**activeTab**

```text
When the user chooses "Speak selected text", presses Speak in the toolbar popup, or uses a keyboard shortcut they assigned, activeTab gives temporary access to that tab so the extension can read the text the user selected. Nothing is accessed without that action, and the access ends when the user leaves the page.
```

**scripting**

```text
Used only together with activeTab, after the user's action. It runs one function in the current tab that returns the selected text (window.getSelection()) and whether the page is a PDF. The extension has no content scripts and runs nothing in a page the user has not asked it to read.
```

**offscreen**

```text
Manifest V3 service workers cannot play audio. The extension creates one offscreen document with the reasons AUDIO_PLAYBACK and BLOBS: it plays the speech audio the helper returns, through object URLs created from the response. The document closes itself after 60 seconds without playback.
```

**tts**

```text
When the Natural TTS helper app is not running, the extension reads the user's selection aloud with a voice built into the operating system, through chrome.tts. It only uses local voices (never a network voice or another extension's voice), and the user can turn this off in the settings. The permission adds no install warning.
```

**Host permission (`http://127.0.0.1/*`)**

```text
The speech is generated by the open-source Natural TTS helper app, which listens only on the loopback address of the user's own computer (127.0.0.1, ports 8249-8260). The extension sends the selected text there and receives WAV audio back. It contacts no other host. The port wildcard is needed because the helper moves to the next free port in that range when 8249 is taken.
```

Each is true of 1.5.0: `manifest.json:7-18`; offscreen reasons and 60 s idle close at `service-worker.ts:399-406` and
`offscreen.ts:58`; the rest in [PRIVACY_TRACEABILITY.md](PRIVACY_TRACEABILITY.md).

### 3.3 Remote code

Select **"No, I am not using remote code."** All JavaScript ships in the package; the helper returns audio, never
code [R07 §5.3].

### 3.4 Data usage

Tick exactly one data type (operator ruling OD-8):

- [x] **Website content** ("For example: text, images, sounds, videos, or hyperlinks")

Leave every other type unticked: personally identifiable information, health information, financial and payment
information, authentication information, personal communications, location, web history, user activity.

Tick all three certifications:

- [x] I do not sell or transfer user data to third parties, outside of the approved use cases
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes

*Why "Website content" when nothing leaves the computer:* the User Data FAQ counts "capturing data from a web page"
as handling and requires disclosure "even when data is processed or stored locally on a user's device". Disclosing
has no enforcement downside; failing to disclose can suspend every item the publisher owns [R07 §5.4]. The policy
names the same category in its first section.

### 3.5 Privacy policy URL

```text
https://github.com/renchris/natural-text-to-voice-extension/blob/main/chrome-extension/PRIVACY.md
```

The repository is public (measured 2026-09-23), so the page loads while signed out, and the URL is stable for as long
as the file stays at that path on `main`. It was chosen over GitHub Pages because Pages is not enabled
(`has_pages: false`) and would be new infrastructure. If the file ever moves, update this field in the same change.

## 4. Distribution tab

| Field | Value |
| --- | --- |
| Payments | Free of charge |
| Visibility | **Public** |
| Distribution (regions) | **All regions**. The store cannot target by operating system, so excluding regions gains nothing [R07 §12.6] |

Publishing is **deferred**: see [§6](#6-submit).

## 5. Test instructions tab

The reviewer can always hear speech: path A works on any computer, path B shows the Kokoro voices. Paste exactly
this (1,949 characters):

```text
Natural TTS reads selected text aloud. You can hear it on any computer: path A needs nothing else, path B adds the natural Kokoro voices on a Mac.

A. WITHOUT THE HELPER (any OS, about 1 minute)
1. Install the extension and open https://en.wikipedia.org/wiki/Speech_synthesis
2. Select the first paragraph, right-click, and choose "Speak selected text". A voice built into your operating system reads it (chrome.tts, local voices only). The toolbar icon shows a grey "i"; its tooltip says to install the helper.
3. Click the toolbar icon. The status reads "Offline", the popup shows the helper's install command, and "Speak Selected Text" reads the selection with the system voice.
If the system has no local voice (some Linux setups), the extension shows an error rather than send the text anywhere.

B. WITH THE HELPER (Kokoro voices; macOS 14 or later on Apple silicon; about 5 minutes)
1. In Terminal: brew install renchris/tap/natural-tts
   It builds from source in about 2 minutes on an M1 Max and downloads the Kokoro model (about 350 MB) once from huggingface.co.
2. brew services start natural-tts
   The helper is ready within about 10 seconds: curl -s http://127.0.0.1:8249/health shows "status":"ok".
3. Click the toolbar icon. The status reads "Connected".
4. On the Wikipedia page, select a paragraph, right-click, and choose "Speak selected text". The Kokoro voice "Heart" starts after about 1 to 2 seconds.
5. In the popup, choose "Michael" and speed 1.3x, select text, and press "Speak Selected Text".
6. Privacy check: right-click inside the popup, choose Inspect, open Network, and press Speak. Every request goes to http://127.0.0.1:8249 (/health, /voices, /speak). There are no other hosts.
7. Run brew services stop natural-tts and speak again: the system voice from path A takes over.

A short video of the extension in use: YOUTUBE_URL
Source code and setup guide: https://github.com/renchris/natural-text-to-voice-extension
```

**OPERATOR:** replace `YOUTUBE_URL` with the video's URL before pasting (`release.sh` prints the block with it filled in
when you pass `--youtube-url`). The timings are re-measured; see [§8](#8-timings-behind-the-numbers).

## 6. Submit

1. Press **Submit for review**. In the dialog, **untick "Publish … automatically after it has passed review"**. This
   is deferred publishing: after approval you have **30 days** to press Publish, or the item returns to draft
   [R07 §8].
2. Do not cancel and resubmit while the item is pending: that resets its place in the queue [R07 §8, S29].
3. Expect **3-4 weeks** of review for a new publisher and a new item (Google's April 2026 surge notice; developers
   reported 28-day waits), then **up to 7 days** before the item appears in store search. Share the direct listing URL
   until then [R07 verification items 4 and 11].
4. A rejection can be appealed from the dashboard.
5. After approval: press **Publish**. Rollback to the previous version is one click and needs no review. Percentage
   rollout is not available below 10,000 weekly users.

## 7. Policy risks, and how each is addressed

| Policy | How it could bite | How 1.5.0 addresses it | Residual risk |
| --- | --- | --- | --- |
| **Minimum Functionality** ("broken functionality… non-functioning features") | A reviewer on Windows, or without the helper, hears nothing | The OD-2 system-voice fallback speaks on any computer that has local voices; test path A shows it first; the summary and the Requirements block state what needs the Mac and the helper; the video shows both | Low (~10% per R07 §6). Precedent: several local-server extensions are live, and Page Assist (needs Ollama) is Featured |
| **"for Mac" in the name vs. installs on other systems** | Reads as misleading metadata | The name describes the Kokoro voices, which are Mac-only; the summary says "System voices otherwise", and the description has a Requirements block. "Mac" and "Apple silicon" are used only as compatibility statements, never to imply Apple's endorsement | Low |
| **Localhost** | A helper on 127.0.0.1 could look like "functionality not provided by the extension" or trip Local Network Access | No CWS policy forbids a local companion app; the helper *is* the synthesis engine and is disclosed in line 1 of the summary. Chrome exempts extensions that hold the host permission from Local Network Access, which is why `http://127.0.0.1/*` stays a required host permission. The User Data FAQ waives encryption for traffic "between a Chrome extension and a native program on the same computer" [R07 §6, S15 Q16, S55] | Very low |
| **Use of Permissions** (least privilege) | Broad host access or unused permissions | No content scripts; `activeTab` + `scripting` on a user gesture instead of `<all_urls>`; one host, loopback only; the `tts` permission is used only by the fallback. Every permission has a justification in §3.2. Measured install warning: only "Read and change your data on 127.0.0.1" | ~0 |
| **Privacy consistency** (fields ↔ policy ↔ behaviour) | A mismatch can suspend every item the publisher owns | The policy was rewritten against the 1.5.0 code, and each sentence is traced to file:line in [PRIVACY_TRACEABILITY.md](PRIVACY_TRACEABILITY.md). The dashboard's data usage ("Website content") matches the policy's first section; the Limited Use statement is present; the listing's Privacy block says nothing the policy does not | ~0, provided the policy link is live and private vulnerability reporting is on (release.sh checks both) |
| **Listing requirements** (accurate metadata, no keyword spam, no testimonials) | Stale numbers or repeated keywords | Every claim is mapped to its source in §2.1; no keyword lists; no user counts, ratings or "best" claims; no third-party logos | Low |
| **Remote code** (MV3) | Loading code from a server | None: all JS is packaged; the helper returns audio | 0 |
| **Single purpose** | Unrelated features | One purpose: read the selection aloud. Both engines serve it | 0 |
| **Code readability** | Minified code slows review | The bundles are minified, which is allowed; the full source is public and linked from the description | Low |
| **Deceptive installation** ("requiring unrelated user action") | Asking users to install a helper | The helper is directly related (it generates the speech), is optional thanks to the fallback, and is disclosed in the summary and the Requirements block | Low |

## 8. Timings behind the numbers

The reviewer steps and the description quote these.

| Measure | Idle M1 Max (W2, 2026-09-23) | Re-measured on this branch, 2026-09-23 23:44, **heavily loaded** machine |
| --- | --- | --- |
| Conditions | GPU 0-6% before the run, load1 ~10 | Helper built from this tree (`swift build -c release`, 1 min 25 s), port 18249, throwaway config dir; load1 47-72, GPU 94% busy with another job |
| Launch → `/health` "ok" | 1.95 s median (3 cold starts) | 9.4 / 16.2 / 3.9 s |
| First `/speak`, Wikipedia lead paragraph (406 characters, 26.1 s of audio), `af_heart` | M60 (408 characters): 1.106 s | 4.47 / 3.35 / 1.18 s |
| Warm `/speak`, same paragraph | 1.08-1.13 s | 1.50-3.01 s |
| `am_michael` at 1.3× | — | 1.06-2.49 s |
| First British voice (`bf_emma`) | 0.17 s after the startup warm-up (CHANGELOG) | 1.25-1.99 s |
| Homebrew build and install | 1 min 46 s (local proof, `packaging/homebrew/README.md`) | not re-run: the tap is not published |
| Service start → `/health` "ok" | 6-11 s (local proof, steps 7 and 10) | — |

So the reviewer text says "about 1 to 2 seconds" for first speech (the idle figure plus the extension's own overhead)
and "within about 10 seconds" for the service. The loaded figures show what a busy machine does; review machines are
not expected to be running another GPU job. Driver: `/tmp/ntts-w3-publish-measure/measure.py`; the spoken text
appeared in none of the 264 helper log lines.

## 9. How these words were checked

- Character counts: Python `len()` on each pasted block (summary 122, name 42, description 2,979, test instructions
  1,949).
- Name and summary: read from `chrome-extension/public/manifest.json`; the packager asserts the 75/132 limits.
- Install warning: `node scripts/verify-permissions.cjs` on the unzipped release package.
- Privacy statements: [PRIVACY_TRACEABILITY.md](PRIVACY_TRACEABILITY.md).
- Nothing here claims the Homebrew tap is live. It is the install path, and item 2 of the checklist at the top must
  hold before submission.
