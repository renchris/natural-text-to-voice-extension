# R07: Chrome Web Store publishing, as of 23 Sep 2026

*Axis R07 of the 2026-09 upgrade program. Research only: no tracked file was edited. Scratch work, fetched primary pages, competitor listing captures and the two permission-warning probes are in `/tmp/ntts-r07/` (see §16, Reproduction). Each claim cites a source that was fetched during this run. `[S#]` refers to §15.*

---

## Verdict

**We can publish this extension, but not as v1.4.0.** Five defects would cause a rejection, a takedown, or a listing that loses to every competitor. All five are cheap to fix. Two of them were measured in this run.

1. **The `<all_urls>` content script shows the worst install warning Chrome has.** I loaded `chrome-extension/dist` v1.4.0 into Chrome for Testing 151, and `chrome.management.getPermissionWarningsById` returned `["Read and change all your data on all websites"]`. The same build with the content script removed and `scripting` added returned only `["Read and change your data on 127.0.0.1"]` (§16). The content script only answers a `GET_SELECTED_TEXT` message (`chrome-extension/src/content/content-script.ts:20-35`). Both callers, the popup and the context menu, are user gestures that grant `activeTab` [S52]. So `activeTab` + `scripting.executeScript` does the same job, needs no broad host access, and avoids the longer review Google says broad host patterns get [S28].
2. **`PRIVACY.md` contradicts both the code and the dashboard. Google's sanction for that is suspension of *all* the publisher's items** [S15 §"Simplifying privacy practices" Q3]. It says settings use `chrome.storage.sync`, but the code only calls `storage.local` (`settings-defaults.ts:96,109`, `popup.ts:674,698`, `config.ts:36,64`). It lists a `scripting` permission that the manifest doesn't request. Its GitHub URL (`yourusername`) and contact email are placeholders. It has no Limited Use statement, which is required [S16]. It says "We collect ZERO data", but Google's User Data FAQ says handling must be disclosed "even when data is processed or stored locally on a user's device" [S15 Q3].
3. **The store icon breaks Google's icon spec.** `icon128.png` is a full-bleed opaque RGB square: no alpha channel, and the corner pixel is `srgb(42,98,245)`. The spec wants 96×96 artwork with 16 px of *transparent* padding. The store puts alpha-less icons in a 12 px rounded frame [S10]. The glyph is also a left-pointing triangle, which reads as "back", not "speak".
4. **A reviewer can't hear any speech without the macOS helper.** CWS can't restrict installs by OS (visibility and region only [S33]). So Windows, Linux, ChromeOS and Intel-Mac users can install an extension that does nothing for them, and Minimum Functionality forbids "broken functionality… non-functioning features" [S19]. Precedent says a local-server design is publishable. "Read Aloud TTS with Kokoro" (needs a local Kokoro-FastAPI server) and "Kokoro TTS Sender" are live, and "Page Assist" (needs local Ollama) holds the **Featured** badge [S61]. But the robust fix is R03's hybrid engine: helper → in-browser Kokoro → local `chrome.tts` voices. With it, the extension does its single purpose on every install.
5. **Any CI written against the old API breaks in 22 days.** Chrome Web Store API **v1 is supported only until 15 Oct 2026** [S35]. v2 replaced it in Oct 2025 [S34]. Both maintained CLIs moved to v2 in 2026 [S42, S44].

Timing: Google posted a PSA on 23 Apr 2026 about a submission surge causing "longer-than-expected wait times" [S29]. The official guidance is "a few days, but it can take up to a few weeks", with support contact after three weeks. New developers and new extensions are named signals for closer review [S28]. **Allow 3 weeks for the first submission.** Submit with deferred (staged) publishing so launch day is under our control [S7].

### Ranked recommendations

| # | Action | Item | Conviction | Effort |
|---|---|---|---|---|
| 1 | **adopt-new** | Replace the `<all_urls>` content script with `activeTab` + `scripting.executeScript` (popup and context-menu paths). Add `minimum_chrome_version: "116"` | **90%** | S |
| 2 | **upgrade-now** | Rewrite `PRIVACY.md` (draft in §12.8) and host it at a stable HTTPS URL. Fix `storage.sync`→`local`, permissions, placeholders, the Limited Use statement, the helper's Hugging Face model download, and a "website content is handled locally" disclosure | **95%** | S |
| 3 | **operator-decision** | Privacy tab: tick **"Website content"** under data usage, even though the text only goes to 127.0.0.1 | **75%** (§5.4) | S |
| 4 | **adopt-new** | Redesign the store icon: 96×96 artwork, 16 px transparent padding, PNG with alpha, legible on light and dark, a speech or waveform glyph | **90%** | S |
| 5 | **adopt-new** | Make the extension functional without the helper (R03 hybrid; at minimum `chrome.tts` voices with `remote === false`). Add a first-run onboarding page that detects the platform (`runtime.getPlatformInfo`) and the helper | **80%** that it changes the review outcome; 90% that it's worth doing | M–L |
| 6 | **adopt-new** | Ship a **signed, notarized helper download** (`.dmg`/`.pkg` on GitHub Releases) and write the reviewer's **Test instructions** around it (draft §7) | **80%** | M |
| 7 | **adopt-new** | Produce 5 captioned 1280×800 screenshots, a 440×280 tile, a 1400×560 marquee and a 30–50 s YouTube demo **with the real synthesized audio** (storyboards §4.4–4.6). Capture rig per R09 | **90%** | M |
| 8 | **adopt-new** | CI on **CWS API v2**: a tag-triggered GitHub Actions job with keyless Workload Identity Federation → service account → `:upload` + `:publish` (`STAGED_PUBLISH`). The first item has to be created by hand | **80%** | S–M |
| 9 | **operator-decision** | EU DSA status. Declare **Non-trader** while the extension is free and non-commercial. Switch to Trader, which publishes your address and phone, before any monetization | **80%** (legal self-determination [S5]) | S |
| 10 | **operator-decision** | Store name. Recommend **"Natural TTS: Private Kokoro Voices for Mac"** (42/75 chars) over the generic "Natural Text-to-Speech", which competes with NaturalReader in search | **65%** | S |
| 11 | **adopt-new** | Ship unminified code (it's 116 KB) and strip the test hooks (`__contentScriptTestHelpers` on `window`, `__serviceWorkerTestHelpers` on `globalThis`) and the selected-text `console.log` previews | **70%** | S |
| 12 | **adopt-new** | Pin the helper's CORS allow-list to the published extension origin (the CWS item ID, kept stable in development through the manifest `key` [S59]). Today it accepts **any** `chrome-extension://` origin (`HTTPServer.swift:219-223`) | **80%** | S |
| 13 | **evaluate** | Verified-publisher "official URL" (needs a Search-Console-verified site) and a later **Featured** nomination through One Stop Support [S46] | **60%** | S |
| 14 | **reject** | Percentage/staged rollout at launch. It is only available above **10,000 seven-day active users** [S31, S39] | **95%** | — |
| 15 | **reject** | A Private/trusted-tester phase before going Public. It costs an extra full review cycle, and visibility is part of every publish [S31, S36]. Use `STAGED_PUBLISH` instead | **70%** | — |

---

## 1. What changed since the Nov 2025 baseline

| Area | Nov 2025 assumption | Sep 2026 reality | Source |
|---|---|---|---|
| Publish API | v1.1 (`googleapis.com/chromewebstore/v1.1`) | **v2** (`chromewebstore.googleapis.com/v2/publishers/{pub}/items/{id}:upload\|:publish\|:fetchStatus\|:cancelSubmission\|:setPublishedDeployPercentage`). v1 "deprecated and will only be supported until 15th October 2026" | [S34, S35, S36] |
| API auth | OAuth refresh token only | **Service accounts** supported (one per publisher, linked in Dashboard → Account). A **publisher ID** is now required in every path | [S37, S36] |
| `chrome-webstore-upload-cli` | 3.x (v1 API) | **4.0.1** (28 May 2026): v2 API, requires `--publisher-id`/`PUBLISHER_ID`, Node ≥20, secrets via env only. Still refresh-token auth | [S42] |
| `publish-browser-extension` (WXT's submitter) | 3.x | **6.1.1** (10 Aug 2026): v2 since 5.0.0, service-account JWT, **Node ≥22** | [S44] |
| Review capacity | "usually a few days" | PSA of **23 Apr 2026**: a submission surge is causing longer waits. "Do not resubmit pending items", because that resets your queue position | [S29] |
| New-publisher quota | not documented | New publishers may have **at most 2 published extensions**. Increases are requested in the dashboard | [S7] |
| User-data disclosure | "no data leaves device ⇒ nothing to disclose" | User Data FAQ Q3: disclose handling **even when data is processed or stored locally** | [S15] |
| Localhost from Chrome | Private Network Access preflights | **Local Network Access** permission prompt shipped in **Chrome 142**. "Extensions that have the necessary host permissions are allowed to make local network requests", so we're unaffected because we declare `http://127.0.0.1/*` | [S54, S55] |
| Loading unpacked builds for capture | `--load-extension` | **Removed from branded Chrome 137+**. Works in Chromium and Chrome for Testing. Re-measured here: branded Chrome loaded 0 extensions and CfT loaded ours | [S60], §16 |
| Featured badge | editor-selected only | Editors still decide, and developers can now **nominate** through One Stop Support (trial). Criteria in §10 | [S46, S47] |

---

## 2. Developer account

| Requirement | Detail for us | Source |
|---|---|---|
| Registration fee | A one-time fee "in an amount determined in Google's sole discretion". The docs don't state the amount. It's widely reported as **US$5**. Conviction 90%; confirm on the registration screen | [S1, S3, S64] |
| Developer email | **Can't be changed after the account is created.** Changing it means a new account plus item transfer. Google recommends a dedicated address you check often | [S1] |
| Contact email verification | Required for a new account (Account page → Add email → verification link) | [S2] |
| Publisher name | Required. Shown under the title, unless you are a verified publisher showing an official URL | [S2] |
| 2-Step Verification | **Required** on the Google Account to publish or update, through the dashboard or the API | [S36] |
| Physical address | Only needed for items that sell items, features or subscriptions. Not us | [S2] |
| Trader / Non-trader (EU) | Every developer must self-declare. **Traders** must give a legal name, an SMS-verified phone number and an address, and these are **shown publicly** on the listing. A Google Payments profile is required to verify (free). **Non-traders**: EU consumers are told consumer-rights law doesn't apply to contracts with you | [S4, S5, S6] |
| Trusted testers | A comma-separated email list on the Account page (no Google Groups). Groups can be added per item | [S2, S33] |
| Item limit | 2 published extensions at first | [S7] |
| Package size | Max 2 GB per zip | [S7] |

**DSA call (recommendation 9).** The EU definition turns on whether you act "for purposes relating to [your] trade, business, craft or profession" [S4]. A free, MIT-licensed hobby tool with no payments, ads or data monetization is the ordinary non-trader case. For comparison, Read Aloud and Speechify both show **Non-trader**, while NaturalReader and ElevenLabs show **Trader** with a D-U-N-S number [S61]. **Conviction 80%**, and it's the operator's legal call. If you declare Trader, your phone number and address go public on the listing [S5].

---

## 3. Listing fields and limits

| Field | Where it comes from | Limit / rule | Source |
|---|---|---|---|
| **Name** | `manifest.json` `name` | **≤75 characters**, in every locale. Enforced at upload since Feb 2024 | [S11, S12] |
| **Summary** | `manifest.json` `description` | **≤132 characters**, plain text. This is what search results, the homepage and category pages show | [S9, S13] |
| **Detailed description** | Dashboard → Store listing | Plain text. "Start… with a concise statement of what your item does", then an overview paragraph and a short feature list. Keyword-spam rules apply. The dashboard enforces a maximum. I couldn't find it in a primary source (commonly reported as 16,000 chars, **unverified**; our draft is 2,176) | [S8, S9, S22] |
| Category | Dashboard | One primary category. **Accessibility** fits best ("screen readers… voice commands" [S48]). Read Aloud uses Accessibility, Speechify uses Education, and NaturalReader and ElevenReader use Tools [S61] | [S48] |
| Language | Dashboard | Required | [S8] |
| Store icon | In the zip (`icons.128`) and on the dashboard | 128×128 PNG, see §4.1 | [S10] |
| Screenshots | Dashboard | **1 required, max 5.** 1280×800 (preferred) or 640×400, square corners, full bleed | [S8, S10] |
| Small promo tile | Dashboard | **440×280 PNG/JPEG, required.** Items without one are listed after items that have one | [S10] |
| Marquee | Dashboard | 1400×560 PNG/JPEG, optional. Required for marquee placement | [S8, S10] |
| Promo video | Dashboard | A **YouTube URL**. It's listed with the "must provide" assets [S8], but it isn't mandatory in practice: Speechify and ElevenReader have none [S61] | [S8, S61] |
| Official URL | Dashboard | Only sites verified to you in Search Console. Shows the "Created by the owner of the listed website" line | [S8] |
| Homepage URL / Support URL | Dashboard | Optional. The support *URL* has to be a web page, not an email address [S64-dev.to] | [S8] |
| Mature content | Dashboard | Off | [S8] |
| Localized listings | Dashboard | Per-locale description, screenshots and video. The promo tiles can't be localized | [S8] |

**Listing requirements that are enforced** [S22]: a blank description, or a missing icon or screenshots, is rejected. Metadata must not be "misleading, inaccurate, incomplete… out of date". The privacy fields must match the privacy policy and the extension's behaviour. No keyword lists. No "unnatural repetition of the same keyword more than 5 times". No unattributed testimonials. [S24] adds: no "Editor's Choice / Number One" claims, and nothing that mimics Chrome or OS UI.

---

## 4. Graphic assets

### 4.1 Store icon: current vs required

| Property | Required [S10] | Current `public/icons/icon128.png` (measured) |
|---|---|---|
| Canvas | 128×128 PNG | 128×128 ✔ |
| Artwork | 96×96 for square icons (a circle ≈112 px diameter) | 128×128, full bleed ✘ |
| Padding | 16 px per side, **transparent** | none. Corner pixel `srgb(42,98,245)` ✘ |
| Alpha | expected. "If you upload an image that has no alpha, it will be placed in a frame with rounded corners (12-pixel corner radius)" | `channels=srgb 3.0`, `opaque=True` ✘ |
| Light/dark | "should work well on both light and dark backgrounds". A mostly dark icon may use a subtle white outer glow | saturated blue square. OK on light, weak edge on dark |
| Style | front-facing, no edge around the canvas, no large drop shadow | left-pointing triangle ("back" semantics) ✘ |

Recommendation: a speech-bubble or speaker glyph with 2–3 waveform arcs, drawn as a vector master. Export 16/32/48/128 from the same source, with the 128 at 96 px artwork + 16 px transparent padding. The *Do/Don't* in [S9]: no screenshots or UI elements in the icon, and colours consistent with the other assets. R09 reached the same conclusion independently (its recommendation 7).

### 4.2 Screenshots: rules

The rules [S9, S10]: 1–5 images at 1280×800 (or 640×400), square corners, full bleed. They must "demonstrate the actual user experience", "reflect the most up-to-date functionality", and avoid "overwhelming amounts of text". Branding should match the icon and tiles. Google also notes that "currently, all screenshots are downscaled to 640x400" in some surfaces [S10], so **every caption must be legible at half size.**

`chrome-extension/SCREENSHOTS_GUIDE.md` doesn't meet the store spec. It plans 14 shots at 340×400, 800×1200, 1000×600 and so on. It shows "Sarah (UK)", but `af_sarah` is an **American** voice: Kokoro's `a` prefix is American English [S63], and the label is in `HTTPServer.swift:206`. It also plans a terminal screenshot. Keep the guide for README and docs imagery, but the store needs its own 5-frame set.

### 4.3 What the leading TTS listings actually show (fetched 23 Sep 2026)

| Listing | Users · rating · category | Badges | Media | What the screenshots show | Data disclosure |
|---|---|---|---|---|---|
| **Read Aloud** (`hdhinadidafjejdhmfkjgnolgimiaplp`) | 6,000,000 · 4.1 (3.6K) · Accessibility | Featured, verified site (lsdsoftware.com) | 1 YouTube ("How to use the Read Aloud browser extension") + **1** screenshot | A plain browser crop with the popup's play button on a maze pattern. Its strength is the text and the reputation, not the art | PII, auth info, **website content** |
| **Speechify** (`ljflmlehinmoeknoonhibbjpldiijjmm`) | 1,000,000 · 4.6 (22.6K) · Education | Featured, verified site | **5** screenshots, no video | A big headline caption ("Listen with Realistic, Natural Voices", "Works Seamlessly on Any Website") above a real browser-window mockup on a navy→blue gradient. One frame is a logo grid of supported sites | PII, **website content** |
| **NaturalReader** (`kohfgcgbkjodfcfkcackpagifgbcmimk`) | 1,000,000 · 4.2 (2.4K) · Tools | Featured | 1 YouTube + **5** screenshots | Headline caption ("Finish Readings Faster", "Select from 100+ natural sounding voices") above a white "document card" with the real player UI docked. Consistent blue gradient | PII |
| **ElevenReader** (`mahgnmmldchnmmdfkfcoindpgkadhhhc`) | 20,000 · 4.1 (58) · Tools | — | **4** screenshots | An editorial style: a large screenshot cropped at the top, then a title and a one-line subtitle on white, plus a small wordmark. Warm gradient behind the product | **website content** |
| *Precedent:* **Page Assist** (needs local Ollama) | 300,000 · 4.8 · Tools | **Featured** | — | — | "will not collect or use your data" |
| *Precedent:* **Read Aloud TTS with Kokoro** (needs a local Kokoro-FastAPI server on :8880) | 8 users · Tools | — | — | — | "will not collect or use your data" |

Sources: the listing pages [S61], video titles through YouTube oEmbed [S62]. Screenshot counts come from the `Item media N (screenshot)` alt attributes. Images were downloaded at original resolution and inspected (all 1280×800).

**Patterns worth copying:**

- Every top listing uses the 5-slot maximum except Read Aloud, whose 6M users carry it without.
- Captions are short benefit headlines, not feature names.
- The product is always shown *in context*, on a real article, Doc or PDF.
- The brand gradient is consistent across all frames.
- The first line of the description repeats the summary's promise.
- The big three all declare "Website content" (Read Aloud, Speechify, ElevenReader).

**Patterns to avoid:** celebrity or partner voices and "Trusted by 50+ million users" claims (we have no basis for them; [S22] forbids unattributed testimonials). Also avoid logo grids of third-party brands. They imply endorsement [S24], and we don't need them.

**The Kokoro niche is thin.** "Kokoro TTS Engine" has 112 users and a 1.0 rating. "Kokoro Speak" (WebGPU) has 260 users at 3.3. "Local Reader" (WebGPU) has 98 users at 3.9. "FreeVoice Reader" has 935 users at 3.3 [S61]. None of them has a polished listing. **The niche can be won with craft**, and the helper's native-Metal speed (R03 measured ~24× real time against ~6× for WebGPU) is a real differentiator to show in the video.

### 4.4 Screenshot storyboard (5 × 1280×800, captions ≤7 words, legible at 640×400)

| # | Caption (headline) | Real UI shown | Evidence value |
|---|---|---|---|
| 1 | **Select text. Right-click. Listen.** | A Wikipedia article with a paragraph selected and the **native** macOS context menu open on "Speak selected text", captured with OS-level capture (R09 rec. 3; CDP can't see native menus) | the core flow in one frame |
| 2 | **Natural voices, at your speed.** | The toolbar popup anchored to the pinned icon: voice picker grouped by accent, speed slider at 1.3×, green "Connected" dot | the product UI |
| 3 | **Made on your Mac. Not in the cloud.** | DevTools → Network, filtered, showing requests only to `127.0.0.1:8249`, next to a one-line diagram (Chrome → 127.0.0.1 → Helper → Apple GPU) | *proof* of the privacy claim, not just an assertion |
| 4 | **PDFs too, with ligatures fixed.** | Chrome's PDF viewer, selected text, the context menu, and a before/after of "tra!c → traffic" | a differentiating feature that is real (`text-cleanup.ts`) |
| 5 | **Five-minute setup. Then it just works.** | The helper app (menu-bar or window) with "Ready", plus the popup's green status. If the fallback ships: "No helper? System voices still work." | sets expectations and prevents 1-star "doesn't work" reviews |

Template: one brand gradient taken from the new icon, a headline at ~64 px, and the real capture inset with a subtle shadow. Rendered from HTML at exactly 1280×800, DPR 1, `magick -strip` (R09 rec. 6).

### 4.5 Promo tiles

- **Small, 440×280 (required).** The new icon glyph with the "Natural TTS" wordmark and a waveform on a saturated gradient. Follow [S10]: minimal text (the brand name only), works at half size, fills the whole region, and assumes a light-grey page background.
- **Marquee, 1400×560.** The wordmark, the line "Private, on-device voices" and a stylized laptop with waveform. Uncluttered, and the same palette [S9]. Without it the item can't be in the marquee carousel [S10].

### 4.6 YouTube demo video

For a TTS product the audio *is* the product. `SCREENSHOTS_GUIDE.md`'s "No voiceover (optional: light background music)" gets this backwards. Music over synthesized speech hides exactly the thing users are evaluating.

- **Format:** 1920×1080 at 30 or 60 fps, 30–50 s, with **the real Kokoro audio** and burned-in captions of the sentence being spoken. No music under speech.
- **Beats:**
  1. 0–3 s: title card.
  2. 3–15 s: select a paragraph → right-click → Speak. Audio plays with captions.
  3. 15–24 s: popup, switch voice to Michael, speed 1.3×, Speak.
  4. 24–32 s: PDF selection.
  5. 32–42 s: **turn Wi-Fi off in Control Center and speak again.** This shows offline operation in the strongest way possible.
  6. 42–50 s: end card with the setup URL.
- **Audio method:** mux the helper's WAV (`curl -X POST http://127.0.0.1:8249/speak …`) at a measured offset onto a silent screen capture. It's deterministic and needs no loopback driver (R09 rec. 4).
- **Upload:** public on YouTube. The dashboard takes a YouTube link only [S8]. Unlisted YouTube videos are commonly used, but I found no primary source that says they're accepted.

---

## 5. Privacy practices tab

The tab has four parts [S14]: single purpose, permission justifications (one field per declared permission **and** for host permissions), the remote code declaration, and data-usage disclosures with certifications. The privacy policy URL is required once the item handles user data, and it must match the disclosures and the behaviour [S14, S15, S18, S22].

### 5.1 Single purpose

> Reads aloud text that the user selects in the browser, using speech that is synthesized on the user's own computer by a companion app.

This is narrow enough under [S23]: one focus area, and every feature serves it.

### 5.2 Permission justifications

Drafted for the **recommended** manifest: `storage, contextMenus, activeTab, offscreen, scripting` + `http://127.0.0.1/*`, with no `content_scripts`.

| Permission | Justification to paste | Install warning (measured/documented) |
|---|---|---|
| `activeTab` | When the user clicks the toolbar button or the "Speak selected text" menu item, activeTab gives temporary access to that tab so the extension can read the text the user selected. Nothing is accessed without that click, and access ends when the user leaves the page. | none [S51, S52] |
| `scripting` | Used only together with activeTab. After the user's click, it runs one function in the current tab that returns the selected text (`window.getSelection()`). No script runs on any page unless the user invokes the extension. | none [S51] |
| `contextMenus` | Adds a single "Speak selected text" item to the right-click menu, shown only when text is selected. | none [S51] |
| `offscreen` | Manifest V3 service workers can't play audio. The extension creates one offscreen document (reason `AUDIO_PLAYBACK`) to play the speech the user asked for. It closes itself after 30 s of silence. | none [S51, S57] |
| `storage` | Saves the user's voice, speed and the helper's local port in `chrome.storage.local`. Nothing is synced or sent anywhere. | none [S51] |
| Host `http://127.0.0.1/*` | The speech is generated by the open-source Natural TTS Helper app, which listens only on the loopback address of the user's own computer (ports 8249–8260). The extension sends the selected text there and receives WAV audio back. No other host is contacted. The port wildcard is needed because the helper falls back across that port range (`config.ts:12-20`). | "Read and change your data on 127.0.0.1" (measured, §16) |

If v1.4.0 were submitted **as is**, `content_scripts.matches: ["<all_urls>"]` would need a justification too, and it would carry the all-sites warning. There is no honest justification for it that `activeTab` doesn't already satisfy [S21: "If more than one permission could be used… request those with the least access"].

### 5.3 Remote code

**"No, I am not using remote code."** True today: all JS is packaged, and the helper returns audio, not logic [S20]. **Stays true under R03's hybrid only if** the ONNX Runtime `.wasm` ships in the package and model weights (data) are the only thing fetched. R03 recommendation 5 already requires that ("jsDelivr… is remotely hosted code and is rejected").

### 5.4 Data usage disclosure (conviction call)

The dashboard's categories are PII, health, financial, authentication, personal communications, location, web history, user activity and **website content**. These are observed on the dashboard and on live listings' "handles the following" blocks [S61, S64]. The FAQ list is in [S15 Q4]. Three certifications follow, the same three that appear on every listing: not sold to third parties, not used for unrelated purposes, not used for creditworthiness.

**Recommendation: tick "Website content" only, and certify all three.** Conviction **75%**.

- *For declaring it:* FAQ Q2 defines handling as including "capturing data from a web page", and Q3 requires disclosure "even when data is processed or stored locally" [S15]. A secondary guide reports that "Website content" is expected whenever content scripts read DOM text [S64]. Over-disclosure has **no** enforcement downside. Under-disclosure triggers the "discrepancies… suspension of all the items owned by the publisher" clause [S15]. The listing ends up looking like Read Aloud, Speechify and ElevenReader [S61].
- *Against:* three live local-server precedents (Page Assist, Read Aloud TTS with Kokoro, Kokoro TTS Sender) declare no data at all [S61]. The chip "handles Website content" is slightly less reassuring than "does not collect".
- Encryption: localhost HTTP is fine. The secure-transmission requirement "does not apply to transmissions between a Chrome extension… and a native program on the same computer" [S15 Q16].
- A prominent in-product disclosure/consent dialog is **not** needed. Reading the text the user explicitly selected *is* the user-facing feature described in the listing [S15 Q12–13, S16].

### 5.5 Privacy policy URL

A policy is required even for local-only handling [S15 Q14]. It needs a stable public URL. Options: a GitHub Pages page (`has_pages: false` today; the repo is public [§16]), or the blob URL of `PRIVACY.md` on `main`. A Pages URL survives file moves. The draft is in §12.8.

---

## 6. Policies that could bite this extension

| Policy | How it could bite us | Likelihood today (v1.4.0 as is) | After the fixes | Mitigation | Source |
|---|---|---|---|---|---|
| **Minimum Functionality**: "broken functionality… non-functioning features", "functionality not directly provided by the extension" | A reviewer without the helper, or on Windows, gets no speech | **Medium (35%)**. Precedents exist [S61], so it isn't automatic | Low (10%) with the fallback; low–medium (20%) with only test instructions and a notarized helper | Rec. 5 + rec. 6 + a requirements block in the description | [S19] |
| **Use of Permissions / minimum permission** | `<all_urls>` content script where activeTab suffices | **Medium–high (40%)** of a rejection or a request to narrow | ~0 | Rec. 1 | [S21, S15 "Minimum Permission" Q3] |
| **Privacy fields ↔ policy ↔ behaviour consistency** | `PRIVACY.md` claims sync storage and a `scripting` permission, has placeholder contacts, and says "zero data" | **High (50%)** of a rejection or a later warning. The worst case is a publisher-wide sanction | ~0 | Rec. 2, rec. 3 | [S15, S22] |
| **Limited Use statement** | Missing affirmative statement on a site "belonging to your extension" | Medium | 0 | Include the statement (§12.8) | [S16] |
| **Listing requirements / misleading metadata** | Stale claims in the docs, which feed the listing: "Chrome 88+" (the real minimum is **116**, because `runtime.getContexts` [S56]), "Edge" support, "manual text input" in the popup (there is **no** text field: `popup.html` has only buttons and the slider), "open source MIT" with **no LICENSE file** in the repo, "Sarah (UK)" | Medium if copied into the listing | 0 | Use only the §12 draft copy. Add `LICENSE`. Fix the voice label | [S22] |
| **Keyword spam** | Repetition or keyword lists | Low | Low | Draft keeps each keyword ≤5 natural uses (counted: "voice" appears 4× in prose) | [S22] |
| **Impersonation / branding** | "Chrome" or Google marks in the name or icon, Apple marks implying endorsement | Low | Low | Name avoids "Chrome". Say "for Google Chrome™" if referencing it. Use "Apple silicon" only as a compatibility statement | [S24, S49] |
| **MV3 remote code** | Future WebGPU path loading WASM from a CDN | 0 today | 0 if the R03 rules are followed | Bundle `.wasm`, fetch only weights | [S20] |
| **Code readability** | Minified bundles slow review. Obfuscation is banned | Low (minification is allowed) | Lower | Rec. 11 | [S25, S28] |
| **Deceptive installation / "unrelated user action"** | Requiring a helper install could look like "requiring unrelated user action" | Low. The helper is *related*: it *is* the synthesis engine | Low | Disclose the requirement in line 1 of the requirements block and in the summary | [S26] |
| **Single purpose** | Adding unrelated features later, like summarization | 0 now | — | Keep the scope | [S23] |
| **Spam & abuse / duplicate items** | Publishing a separate "beta" item | 0 | — | If you publish a test item, follow the guidance in [S31] to avoid a "Repetitive Content" flag | [S27, S31] |
| **Local Network Access** (a Chrome platform change, not a CWS policy) | Could block the 127.0.0.1 fetch behind a prompt | 0. Extensions with host permissions are exempt | 0 | Keep the `http://127.0.0.1/*` host permission. Don't replace it with an optional permission | [S55] |

**Localhost itself isn't a policy problem.** No CWS policy forbids talking to a local server. The only relevant rule is user-data handling, and the FAQ explicitly waives encryption for same-machine native programs [S15 Q16]. Google's own manifest-`key` doc names "configure a server to only accept requests from your Chrome Extension origin" as a use case [S59]. That is our recommendation 12.

---

## 7. Reviewer "Test instructions" tab

Google says this tab "is only useful if the item requires restricted credentials or a paid account" and that it's optional [S30, S7]. It's still a free-text channel to the reviewer, and our item has an unusual prerequisite. **Use it.** Conviction 80% that it lowers the Minimum Functionality risk. It costs nothing.

Draft:

```text
This extension needs its free companion app, which runs on macOS 13+ with Apple silicon (M1 or later).

1. Download NaturalTTSHelper.dmg (Developer ID signed + notarized):
   https://github.com/renchris/natural-text-to-voice-extension/releases/latest
   Open it, drag to Applications, launch. The first launch downloads the Kokoro-82M
   voice model (~330 MB) from huggingface.co once; about 1 minute.
2. Click the extension's toolbar icon. The status dot turns green ("Connected").
3. Open https://en.wikipedia.org/wiki/Speech_synthesis, select a paragraph,
   right-click > "Speak selected text". Audio starts within ~2 seconds.
4. In the popup, choose another voice (e.g. Michael) and speed 1.3x, select text,
   press "Speak Selected Text".
5. Privacy check: open chrome://extensions > this item > "service worker" > Network.
   Every request goes to http://127.0.0.1:82xx. There are no other hosts.

Testing on Windows/Linux or without the helper: the popup shows "Helper not running"
with a link to the setup guide [and speaks with the system's local voices].
A 45-second video of the full flow: https://youtu.be/<id>
```

The text in brackets holds only if recommendation 5 ships. Numbers like "~2 seconds" must be **re-measured on the release build** before submission (C2/R01 own the helper baseline). The ~330 MB comes from the Hugging Face API: `kokoro-v1_0.safetensors` is 327.1 MB and the whole repo is 389.4 MB [S63].

---

## 8. Review, publishing mechanics, rollout, rollback

| Mechanic | Rule | Source |
|---|---|---|
| Review time | "Most… within a few days, but it can take up to a few weeks." Contact support after 3 weeks. Signals that slow review: new developer, new extension, dangerous permissions, large code changes, broad host permissions, a lot of or hard-to-read code. Surge PSA of 23 Apr 2026 | [S28, S29] |
| Every version is reviewed | "All item submissions—whether for a new item or an update… are subject to the same review process" | [S28] |
| Deferred publishing | Untick "publish automatically" or use API `publishType: STAGED_PUBLISH`. **You have 30 days** after approval to publish, or the item reverts to draft | [S7, S31, S38] |
| Cancel review | Allowed. Don't cancel and resubmit just to "bump" a submission (it resets your queue position) | [S29] |
| Visibility | Public / Unlisted / Private (trusted testers, Google Groups). Same policy and same review for all three | [S33] |
| Percentage rollout | **Only for items with >10,000 seven-day active users**. It can only increase, and one rollout runs at a time | [S31, S39] |
| Rollback | One click to the previous version, published under a **new** version number, **without review**, live "within a minute". It discards pending submissions. Keep stored data backward-compatible | [S32] |
| Skip review | Only for declarativeNetRequest static-ruleset-only changes. Not applicable to us | [S38] |
| Adding permissions later | Disables the extension for existing users until they accept. So get the permission set right in v1.x | [S15 Minimum Permission Q1, S50] |
| Version | Every upload needs a higher `version` than the last one | [S31] |

---

## 9. CI publishing with the CWS API v2

**Constraints:**

- **The first item has to be created in the dashboard.** The API can upload to an existing item but has no create method [S36, S40]. The Store listing and Privacy tabs must also be filled before the first publish [S36].
- 2-Step Verification is mandatory [S36].
- v1 stops working after 15 Oct 2026 [S35].

**Auth choice:**

- **OAuth refresh token**, as in Google's own guide and in `chrome-webstore-upload-cli`. Google's guide has you create an *External* consent screen and add yourself as a *Test user* [S36]. Google Identity then states that a project in "Testing" status "is issued a refresh token expiring in 7 days" [S41]. **So a pipeline built exactly by the guide breaks after a week**, unless you move the consent screen to "In production". Unverified apps are fine for personal use: "Unverified status won't block your ability to utilize this API" [S34].
- **Service account** (recommended). One service account can be linked per publisher [S37]. With GitHub OIDC → Workload Identity Federation through `google-github-actions/auth@v3`, there's **no long-lived secret in the repo** (`token_format: access_token`, `access_token_scopes: …/chromewebstore`) [S45].

**Tooling:**

| Tool | Version (verified) | API | Auth | Verdict |
|---|---|---|---|---|
| plain `curl` against v2 | — | v2 | any bearer token | **Recommended.** It's three calls, and every field is documented [S36, S38, S40] |
| `chrome-webstore-upload-cli` | 4.0.1 (2026-05-28) | v2 | refresh token only (`CLIENT_ID/SECRET/REFRESH_TOKEN` + `PUBLISHER_ID`), Node ≥20 | fine if you choose refresh-token auth [S42] |
| `chrome-webstore-upload` (library) | 6.0.0 (2026-05-12) | v2 | accepts a pre-fetched `token`, so it can be combined with WIF | alternative [S43] |
| `publish-browser-extension` | 6.1.1 (2026-08-10) | v2 | service-account JSON key (client email + private key), Node ≥22 | fine, but it needs a downloaded key [S44] |

**Workflow draft** (tag-triggered, with a manual approval gate through a GitHub *environment*). I haven't created it in the repo. Action versions verified: `actions/checkout` v7.0.1, `oven-sh/setup-bun` v2.2.0, `google-github-actions/auth` v3 [§16]:

```yaml
name: publish-chrome-web-store
on:
  push:
    tags: ['v*']
permissions:
  contents: read
  id-token: write          # GitHub OIDC for Workload Identity Federation
jobs:
  publish:
    runs-on: ubuntu-latest
    environment: chrome-web-store   # add a required reviewer = human gate before submission
    steps:
      - uses: actions/checkout@v7
      - uses: oven-sh/setup-bun@v2
      - name: Test and build
        working-directory: chrome-extension
        run: bun install --frozen-lockfile && bun test && bun run build
      - name: Tag must equal manifest version
        run: test "v$(jq -r .version chrome-extension/dist/manifest.json)" = "$GITHUB_REF_NAME"
      - name: Zip (manifest at root)
        run: cd chrome-extension/dist && zip -r -X "$GITHUB_WORKSPACE/extension.zip" .
      - id: auth
        uses: google-github-actions/auth@v3
        with:
          workload_identity_provider: ${{ vars.WIF_PROVIDER }}
          service_account: ${{ vars.CWS_SERVICE_ACCOUNT }}
          token_format: access_token
          access_token_scopes: https://www.googleapis.com/auth/chromewebstore
      - name: Upload + submit (staged)
        env:
          TOKEN: ${{ steps.auth.outputs.access_token }}
          NAME: publishers/${{ vars.CWS_PUBLISHER_ID }}/items/${{ vars.CWS_ITEM_ID }}
        run: |
          set -euo pipefail
          api=https://chromewebstore.googleapis.com
          curl -fsS -H "Authorization: Bearer $TOKEN" -X POST -T extension.zip "$api/upload/v2/$NAME:upload" | tee up.json
          for i in $(seq 1 30); do
            state=$(curl -fsS -H "Authorization: Bearer $TOKEN" "$api/v2/$NAME:fetchStatus" | jq -r '.lastAsyncUploadState // "SUCCEEDED"')
            [ "$state" = "IN_PROGRESS" ] || break; sleep 10
          done
          [ "$state" = "SUCCEEDED" ] || { echo "upload state: $state"; exit 1; }
          curl -fsS -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -X POST \
            -d '{"publishType":"STAGED_PUBLISH","blockOnWarnings":true}' "$api/v2/$NAME:publish" | tee pub.json
          jq -e '.state=="PENDING_REVIEW" or .state=="STAGED"' pub.json
```

`STAGED_PUBLISH` means the version waits after approval. Calling `:publish` again on a staged item publishes it without a new review [S38]. The states are `PENDING_REVIEW`, `STAGED`, `PUBLISHED`, `PUBLISHED_TO_TESTERS`, `REJECTED` and `CANCELLED`. Upload states are `SUCCEEDED`, `IN_PROGRESS`, `FAILED` and `NOT_FOUND` [ItemState/UploadState pages, S38]. The exact `fetchStatus` response field names need **one dry run** against the real item; conviction 75% on `lastAsyncUploadState`, which is the name used in the UploadState enum doc. One-time setup is the operator's: Cloud project, enable the API, service account, WIF pool bound to this repo, service account email added in Dashboard → Account [S37, S45].

---

## 10. Badges and discovery

- **Ranking**: ratings plus usage ("downloads vs. uninstalls over time"), design, a clear purpose, and intuitive onboarding [S9, S46]. Every macOS-less install that uninstalls within minutes costs rank. That's one more reason for recommendation 5 and for a truthful Requirements block.
- **Featured badge** (shown as "Follows recommended practices for Chrome extensions"): reviewed by the CWS team for "adherence to CWS best practices, an intuitive user experience, and use of the latest platform APIs" [S47]. The nomination trial through One Stop Support requires: an extension you own, English support, published and public, no active violations, and "core features… accessible without additional credentials or payments" [S46]. A required helper is neither a credential nor a payment. Page Assist, which needs Ollama, is Featured [S61]. **Conviction 60%** it's attainable after launch, rising with the fallback. One developer reported a nomination unanswered after more than 5 weeks in 2026 [S29-thread].
- **Established Publisher badge**: automatic, for a verified identity plus a positive track record. "For new developers, it will take at least a few months" [S46].
- **Verified publisher / official URL**: needs a site verified in Search Console [S8]. Whether a `github.io` project path can serve as the official URL is **unverified** (conviction 55%). A cheap custom domain is certain.

---

## 11. Required fixes to repo documents before listing

The findings below come from reading the files and, where stated, from measurement.

| File | Problem | Fix |
|---|---|---|
| `chrome-extension/PRIVACY.md` | Says `storage.sync` but the code uses `storage.local` (all 6 call sites). Lists `scripting`, which v1.4.0 doesn't declare. Describes the content script as "detect when you select text", but it responds only on request. Placeholder repo URL and emails. "We collect ZERO data" versus the FAQ Q3 handling standard. No Limited Use statement. No mention of the helper's model download from huggingface.co. Relative `../CHANGELOG.md` link. "localhost:8249" (it's a port range) | Replace with §12.8 |
| `chrome-extension/INSTALL.md` | "Chrome 88+" (the real floor is 116 [S56]), Edge claimed, `via.placeholder.com` images, "Type some text in the input area" (no such field), placeholder GitHub URL | Correct the facts. Link the notarized helper |
| `chrome-extension/README.md` | "Or use popup interface with manual text input" (false), "Chrome 88+", "Coming soon" screenshots | Correct |
| root `README.md` | Says "MIT License (see LICENSE)", but there's **no LICENSE file**. Describes "WebGPU" as the stack | Add `LICENSE`. R08 owns the README rewrite |
| `SCREENSHOTS_GUIDE.md` | Non-store sizes, music-only video, "Sarah (UK)" | Add a CWS section per §4.4–4.6 |
| `native-helper/Sources/NaturalTTSHelper/HTTPServer.swift:206` | `af_sarah` labelled "Sarah (UK)". The `a` prefix is American English [S63] | "Sarah (US)" |
| `public/manifest.json` | `description` is jargon ("Metal-accelerated"). No `minimum_chrome_version`. `<all_urls>` content script | §12.1 |

---

## 12. Drafts of every listing field

### 12.1 Manifest fields

```jsonc
{
  "name": "Natural TTS: Private Kokoro Voices for Mac",        // 42 / 75
  "description": "Read selected text aloud in natural AI voices generated on your Mac, not in the cloud. Requires the free Natural TTS Helper.", // 124 / 132
  "minimum_chrome_version": "116",                              // runtime.getContexts [S56]
  "permissions": ["storage", "contextMenus", "activeTab", "offscreen", "scripting"],
  "host_permissions": ["http://127.0.0.1/*"]
  // content_scripts removed; selection read via scripting.executeScript on user gesture
}
```

Name alternatives (the operator decides; conviction 65% on A): **A** "Natural TTS: Private Kokoro Voices for Mac" (42). **B** "Natural TTS — On-Device Read Aloud for Mac" (42). **C**, keep "Natural Text-to-Speech" (22), which is generic and has near-collisions in search (NaturalReader, "Text to Speech TTS" and others [S61]). "Kokoro" in the name is accurate and descriptive: the model is Apache-2.0 [S63], and it targets exactly the users searching "kokoro tts" (8 small competitors, none polished). Don't put "Chrome" in the name [S49].

### 12.2 Category, language, URLs

- Category: **Accessibility**. Conviction 70%; Tools is the alternative.
- Language: English (United States).
- Homepage URL: `https://github.com/renchris/natural-text-to-voice-extension`, or a Pages site.
- Support URL: `https://github.com/renchris/natural-text-to-voice-extension/issues`.
- Official URL: only after site verification (§10).
- Mature content: off.

### 12.3 Detailed description (2,176 chars; keyword counts checked)

```text
Natural TTS is a text-to-speech reader for Chrome. Select text on a web page or PDF and hear it read aloud in natural-sounding Kokoro voices. The speech is generated on your own Mac, not on a server.

Select text, right-click, and choose "Speak selected text". Or click the toolbar button, pick a voice and a speed, and press Speak.

WHY IT'S DIFFERENT
• On-device: the open-weight Kokoro-82M model runs on your computer's GPU inside the free Natural TTS Helper app. Your text goes only to 127.0.0.1, which is your own computer.
• No account, no subscription, no usage limits, no analytics.
• Works offline once the model has downloaded.

FEATURES
• "Speak selected text" in the right-click menu, on web pages and in Chrome's built-in PDF viewer
• 6 English voices (4 female, 2 male)
• Speed from 0.5× to 2.0×
• PDF clean-up: fixes broken ligatures (for example "tra!c" becomes "traffic") so words are pronounced correctly
• A popup and settings page you can use from the keyboard
• A status light that shows whether the helper is connected

REQUIREMENTS
• macOS 13 or later on Apple silicon (M1 or later)
• The free, open-source Natural TTS Helper app, running on the same computer. Setup takes about 5 minutes: https://github.com/renchris/natural-text-to-voice-extension#install
If the helper isn't running, the popup says so and links to the setup guide.

PERMISSIONS, EXPLAINED
• "Read and change your data on 127.0.0.1": lets the extension reach the helper app on your own computer. It doesn't contact any other address.
• Active tab, scripting and context menu: read the text you selected, only when you click the button or the menu item.
• Offscreen document: plays the audio.
• Storage: remembers your settings.

PRIVACY
The developer receives no data. The text you choose to hear is sent only to the helper on your own computer, and the text and audio are discarded after playback. Privacy policy: https://renchris.github.io/natural-text-to-voice-extension/privacy

OPEN SOURCE
The extension and helper are MIT-licensed. Kokoro-82M is Apache-2.0 licensed, by hexgrad. Source code, issues and the changelog: https://github.com/renchris/natural-text-to-voice-extension
```

Preconditions for this copy to be *true*:

- the popup links to the setup guide when the helper is down (today it shows a retry, per `SCREENSHOTS_GUIDE.md` §4);
- a `LICENSE` file exists;
- the Pages URL is live;
- the "5 minutes" is re-timed with the notarized installer.

If R03's hybrid ships, replace the Requirements block's second bullet with: "For the fastest voices, install the free Natural TTS Helper app. Without it, speech runs in the browser (WebGPU) or uses your system's voices." Also update the privacy text to mention the one-time model download from huggingface.co.

Why the "Permissions, explained" block is there: Google's own FAQ recommends listing "permissions used and the reasons you require them in your Chrome Web Store listing or in an 'about page'" [S15 Minimum Permission Q4].

### 12.4 Single purpose, permission justifications, remote code, data usage

See §5.1–5.4. Paste them verbatim.

### 12.5 Test instructions

See §7.

### 12.6 Distribution

- Visibility **Public**.
- **All regions**. There's no OS targeting to use, and excluding regions gains nothing.
- Paid: no.
- Submit with **deferred publishing**.

### 12.7 Graphic assets

See §4.1 (icon), §4.4 (5 screenshots), §4.5 (tiles) and §4.6 (video).

### 12.8 Privacy policy (replacement for `chrome-extension/PRIVACY.md`, to be hosted at a public URL)

```markdown
# Privacy Policy — Natural TTS
Effective: <release date> · Applies to: the Natural TTS Chrome extension and the Natural TTS Helper app

## Summary
The developer receives no data from you. The extension reads the text you ask it to speak and
sends it only to the Natural TTS Helper running on your own computer (127.0.0.1). Nothing is sent
to the developer or to any third party.

## What the extension handles, and why
- Website content: the text you select, only when you click "Speak selected text" or the
  toolbar button's Speak. It is sent to http://127.0.0.1 (ports 8249–8260) to generate speech,
  then discarded. It is never stored or logged by the extension.
- Settings: your chosen voice, speed and the helper's port, stored with chrome.storage.local on
  your device. They are not synced and are removed when you uninstall the extension.

## What the helper app does
The helper listens only on your computer's loopback address and accepts requests only from the
Natural TTS extension. It turns text into audio on your computer and keeps neither the text nor the audio.
On first launch it downloads the open-source Kokoro-82M voice model from huggingface.co. That
download sends no personal data; like any web request, Hugging Face can see your IP address.
After that, speech works offline.

## What we do not do
No analytics, telemetry, advertising, tracking, accounts, cookies, or sale or transfer of data.

## Limited Use
The use of information received by this extension adheres to the Chrome Web Store User Data
Policy, including the Limited Use requirements.

## Children
The extension collects no personal information from anyone, including children.

## Changes and contact
Changes are published in this file and noted in the changelog:
https://github.com/renchris/natural-text-to-voice-extension/blob/main/CHANGELOG.md
Questions: <real support email> · https://github.com/renchris/natural-text-to-voice-extension/issues
```

Adjust "accepts requests only from the Natural TTS extension" to what is actually true. It is true only after recommendation 12 lands: today any extension origin is accepted (`HTTPServer.swift:219-223`). The Limited Use sentence adapts Google's model wording [S16], which is written for Google APIs.

---

## 13. How this axis interacts with others

- **R03 (in-browser WebGPU TTS).** Its hybrid engine is the structural fix for §6's Minimum Functionality row. It adds 21.6 MB of WASM to the package (more code to review [S28]), a huggingface.co model download (privacy policy text), `unlimitedStorage` (no warning) and `wasm-unsafe-eval` in the CSP. None of those adds an install warning, per R03. Re-run the §16 warning probe on the hybrid build before submission.
- **R09 (capture tooling).** It owns the capture rig. This report only sets the *store* targets (§4.4–4.6).
- **R08 (README).** Store copy and README should share the same claims so the listing is never "out of date" relative to the repo [S22].

---

## 14. Publishing checklist, in order

**A. Account (operator, once)**
- [ ] Create or choose a dedicated Google account for publishing. The email is permanent [S1]
- [ ] Turn on 2-Step Verification [S36]
- [ ] Register in the Developer Dashboard, accept the agreement, pay the one-time fee (~US$5) [S1, S3]
- [ ] Set the publisher name, add and verify the contact email [S2]
- [ ] Declare Non-trader (or Trader, with verified phone and address) [S4, S5]
- [ ] (optional) Verify a site in Search Console for the official URL [S8]

**B. Code (agent-drivable)**
- [ ] Remove `content_scripts`, add `scripting`, read the selection via `scripting.executeScript` in the popup and in `contextMenus.onClicked` (§5.2). Re-run the §16 probe and expect only "Read and change your data on 127.0.0.1"
- [ ] `minimum_chrome_version: "116"`
- [ ] Popup: link to the setup guide when the helper is down. Onboarding page on `runtime.onInstalled` that checks `getPlatformInfo()` and helper `/health`
- [ ] (strongly recommended) Fallback engine per R03, or at minimum `chrome.tts` voices with `remote === false` [S58]
- [ ] Helper: pin CORS to `chrome-extension://<CWS item id>`, and use manifest `key` in dev builds so the ID stays stable [S59]
- [ ] Unminified production build. Strip test hooks and selected-text logging
- [ ] New icon set (16/32/48/128), with the 128 at 96 px art, transparent padding and alpha [S10]
- [ ] Fix the "Sarah (UK)" label. Add `LICENSE`
- [ ] Bump the version (e.g. 1.5.0). Zip `dist/` with the manifest at the root

**C. Helper distribution**
- [ ] Developer-ID-signed, notarized `.dmg` or `.pkg` on GitHub Releases (the only release asset today is a raw `natural-tts-helper` binary on v0.2.0 [§16])
- [ ] Re-time "5-minute setup" and "~2 s to first audio" on a clean machine

**D. Documents**
- [ ] Publish the privacy policy (§12.8) at a stable HTTPS URL. Check it loads while logged out
- [ ] Correct INSTALL.md, the extension README, and SCREENSHOTS_GUIDE.md (§11)

**E. Assets**
- [ ] 5 × 1280×800 screenshots per §4.4. Check legibility at 640×400
- [ ] 440×280 small tile, 1400×560 marquee [S10]
- [ ] YouTube demo with real audio (§4.6)

**F. Dashboard**
- [ ] Add new item → upload the zip [S7]
- [ ] Store listing: description (§12.3), category, language, icon, screenshots, tiles, video, homepage and support URLs
- [ ] Privacy: single purpose, 6 justifications, remote code "No", data usage "Website content" + 3 certifications, privacy policy URL (§5)
- [ ] Distribution: Public, all regions
- [ ] Test instructions (§7)
- [ ] Submit for review with **deferred publishing**. Don't resubmit while pending [S29]
- [ ] Record the item ID and publisher ID. Link the service account for CI [S37]

**G. After approval**
- [ ] Publish within 30 days [S7]
- [ ] Put the item ID into the helper's origin pin and ship a helper update
- [ ] Wire up the v2 CI (§9) before the next release. Never touch the v1 endpoints (they stop working 15 Oct 2026) [S35]
- [ ] Watch uninstall rates and reviews. Consider a Featured nomination once the fallback ships [S46]

---

## 15. Sources

Chrome for Developers pages show their own "Last updated" dates, noted where present. Everything was fetched on 2026-09-23.

- **S1** Register your developer account (2024-02-13): https://developer.chrome.com/docs/webstore/register
- **S2** Set up your developer account (2023-10-16): https://developer.chrome.com/docs/webstore/set-up-account
- **S3** Chrome Web Store Developer Agreement (registration fee clause): https://developer.chrome.com/docs/webstore/program-policies/terms
- **S4** Trader/Non-Trader identification and verification (2024-02-09): https://developer.chrome.com/docs/webstore/program-policies/trader-disclosure
- **S5** Trader FAQ: https://developer.chrome.com/docs/webstore/program-policies/trader-verification-faq
- **S6** PSA, trader requirement updates (2024-02-15): https://groups.google.com/a/chromium.org/g/chromium-extensions/c/ZI9R_KAA3BQ
- **S7** Publish in the Chrome Web Store (item limit 2, 2 GB, deferred 30 days): https://developer.chrome.com/docs/webstore/publish
- **S8** Complete your listing information (2020-12-07): https://developer.chrome.com/docs/webstore/cws-dashboard-listing
- **S9** Creating a great listing page (2024-08-02; summary ≤132): https://developer.chrome.com/docs/webstore/best-listing
- **S10** Supplying images (2018-06-11): https://developer.chrome.com/docs/webstore/images
- **S11** Manifest `name` (≤75): https://developer.chrome.com/docs/extensions/reference/manifest/name
- **S12** PSA, extension name length 75 (2024-02-22): https://groups.google.com/a/chromium.org/g/chromium-extensions/c/mpDvFpT0KJM
- **S13** Manifest `description` (≤132): https://developer.chrome.com/docs/extensions/reference/manifest/description
- **S14** Fill out the privacy fields (2020-06-12): https://developer.chrome.com/docs/webstore/cws-dashboard-privacy
- **S15** User Data FAQ (Q2–Q4, Q14, Q16; Minimum Permission; consistency and suspension): https://developer.chrome.com/docs/webstore/program-policies/user-data-faq
- **S16** Limited Use (2022-11-01): https://developer.chrome.com/docs/webstore/program-policies/limited-use
- **S17** Disclosure requirements: https://developer.chrome.com/docs/webstore/program-policies/disclosure-requirements
- **S18** Privacy policies: https://developer.chrome.com/docs/webstore/program-policies/privacy
- **S19** Minimum functionality: https://developer.chrome.com/docs/webstore/program-policies/minimum-functionality
- **S20** MV3 additional requirements (2024-04-03): https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements
- **S21** Use of permissions: https://developer.chrome.com/docs/webstore/program-policies/permissions
- **S22** Listing requirements, including keyword spam (2024-07-10): https://developer.chrome.com/docs/webstore/program-policies/listing-requirements
- **S23** Quality guidelines FAQ (single purpose): https://developer.chrome.com/docs/webstore/program-policies/quality-guidelines-faq
- **S24** Impersonation and IP: https://developer.chrome.com/docs/webstore/program-policies/impersonation-and-intellectual-property
- **S25** Code readability: https://developer.chrome.com/docs/webstore/program-policies/code-readability
- **S26** Deceptive installation tactics (2024-07-10): https://developer.chrome.com/docs/webstore/program-policies/deceptive-installation-tactics
- **S27** Spam and abuse: https://developer.chrome.com/docs/webstore/program-policies/spam-and-abuse
- **S28** Review process (2021-12-10): https://developer.chrome.com/docs/webstore/review-process
- **S29** PSA, increased review times (2026-04-23, CWS team): https://groups.google.com/a/chromium.org/g/chromium-extensions/c/VJ6DcpEn51Y/m/yuxvHWdwCAAJ. Related 2026 threads: https://groups.google.com/a/chromium.org/g/chromium-extensions/c/vBsbXp5EiAQ , https://groups.google.com/a/chromium.org/g/chromium-extensions/c/dPmDpxvo0m0
- **S30** Provide test instructions (2025-05-16): https://developer.chrome.com/docs/webstore/cws-dashboard-test-instructions
- **S31** Update your item, including partial rollout >10,000 users (2020-12-03): https://developer.chrome.com/docs/webstore/update
- **S32** Rollback (2024-04-09): https://developer.chrome.com/docs/webstore/rollback
- **S33** Distribution / visibility (2020-12-07): https://developer.chrome.com/docs/webstore/cws-dashboard-distribution
- **S34** API reference overview (V2 since Oct 2025; client verification) (2025-10-13): https://developer.chrome.com/docs/webstore/api
- **S35** API V1 reference, deprecated, supported until 15 Oct 2026 (2026-09-16): https://developer.chrome.com/docs/webstore/api/v1
- **S36** Use the Chrome Web Store API (2SV, publisher ID, v2 curl examples) (2026-09-16): https://developer.chrome.com/docs/webstore/using-api
- **S37** Service accounts (2025-10-15): https://developer.chrome.com/docs/webstore/service-accounts
- **S38** v2 `publishers.items.publish` (PublishType, skipReview, blockOnWarnings) (2026-06-02): https://developer.chrome.com/docs/webstore/api/reference/rest/v2/publishers.items/publish. Also ItemState: https://developer.chrome.com/docs/webstore/api/reference/rest/v2/ItemState and UploadState: https://developer.chrome.com/docs/webstore/api/reference/rest/v2/UploadState. Skip review: https://developer.chrome.com/docs/webstore/skip-review
- **S39** v2 `setPublishedDeployPercentage` (2025-10-15): https://developer.chrome.com/docs/webstore/api/reference/rest/v2/publishers.items/setPublishedDeployPercentage
- **S40** v2 `media.upload` (2025-11-04): https://developer.chrome.com/docs/webstore/api/reference/rest/v2/media/upload
- **S41** Google OAuth 2.0, refresh token expiration ("Testing" status → 7 days): https://developers.google.com/identity/protocols/oauth2
- **S42** `chrome-webstore-upload-cli`: https://registry.npmjs.org/chrome-webstore-upload-cli (4.0.1, 2026-05-28), releases https://github.com/fregante/chrome-webstore-upload-cli/releases
- **S43** `chrome-webstore-upload`: https://registry.npmjs.org/chrome-webstore-upload (6.0.0, 2026-05-12), release notes https://github.com/fregante/chrome-webstore-upload/releases
- **S44** `publish-browser-extension` releases (v5.0.0 v2 support; v6.0.0 Node ≥22; v6.1.1): https://github.com/aklinker1/publish-browser-extension/releases. Service-account JWT in `src/stores/chrome-web-store-v2.ts`
- **S45** `google-github-actions/auth` (v3; `token_format`, `access_token_scopes`): https://github.com/google-github-actions/auth
- **S46** Discovery (badges, Featured nomination criteria, Established Publisher): https://developer.chrome.com/docs/webstore/discovery
- **S47** CWS Help, badges: https://support.google.com/chrome_webstore/answer/1050673
- **S48** Best practices (category definitions): https://developer.chrome.com/docs/webstore/best-practices
- **S49** Branding guidelines: https://developer.chrome.com/docs/webstore/branding
- **S50** Declare permissions (2024-02-05): https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions
- **S51** Permissions list and warnings (2026-09-09): https://developer.chrome.com/docs/extensions/reference/permissions-list
- **S52** activeTab (user gestures that grant it): https://developer.chrome.com/docs/extensions/develop/concepts/activeTab
- **S53** Match patterns (ports wildcarded by default): https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns
- **S54** Local Network Access blog (prompt ships Chrome 142): https://developer.chrome.com/blog/local-network-access
- **S55** LNA adoption guide (extensions with host permissions exempt): https://docs.google.com/document/d/1QQkqehw8umtAgz5z0um7THx-aoU251p705FbIQjDuGs/edit
- **S56** `chrome.runtime` (`getContexts` Chrome 116+, `getPlatformInfo`): https://developer.chrome.com/docs/extensions/reference/api/runtime
- **S57** `chrome.offscreen` (Chrome 109+, AUDIO_PLAYBACK 30 s lifetime): https://developer.chrome.com/docs/extensions/reference/api/offscreen
- **S58** `chrome.tts` (`TtsVoice.remote`) (2026-09-11): https://developer.chrome.com/docs/extensions/reference/api/tts
- **S59** Manifest `key` (consistent ID; server origin allow-listing): https://developer.chrome.com/docs/extensions/reference/manifest/key
- **S60** PSA, removing `--load-extension` in branded Chrome: https://groups.google.com/a/chromium.org/g/chromium-extensions/c/1-g8EFx2BBY/m/S0ET5wPjCAAJ
- **S61** Live listings (fetched 2026-09-23):
  - Read Aloud: https://chromewebstore.google.com/detail/hdhinadidafjejdhmfkjgnolgimiaplp
  - Speechify: https://chromewebstore.google.com/detail/ljflmlehinmoeknoonhibbjpldiijjmm
  - NaturalReader: https://chromewebstore.google.com/detail/kohfgcgbkjodfcfkcackpagifgbcmimk
  - ElevenReader: https://chromewebstore.google.com/detail/mahgnmmldchnmmdfkfcoindpgkadhhhc
  - Page Assist: https://chromewebstore.google.com/detail/jfgfiigpkhlkbnfnbobbkinehhfdhndo
  - KeePassXC-Browser: https://chromewebstore.google.com/detail/oboonakemofpalcgghocfoadofidjkkk
  - Read Aloud TTS with Kokoro: https://chromewebstore.google.com/detail/beecigdnohbfcabanacghdoembiodljc
  - Kokoro TTS Sender: https://chromewebstore.google.com/detail/befhghjhbjpjnbamdginljoiaafoclmf
  - Local Reader: https://chromewebstore.google.com/detail/fojpmmgbjcffadgoppmojnggkjhggimc
  - Kokoro Speak: https://chromewebstore.google.com/detail/apfbmojocfgjmleahkfaphoehbphpigm
  - Kokoro TTS Engine: https://chromewebstore.google.com/detail/mefecoigjodlohjacogkbbfpnifhfocb
  - FreeVoice Reader: https://chromewebstore.google.com/detail/bfhihejhhjfocdggkfpeignglimmpoho
  - BetterTTS: https://chromewebstore.google.com/detail/dbhnenfaglccblnhebbcfdpooodmbpec
  - Search results: https://chromewebstore.google.com/search/kokoro%20tts
- **S62** YouTube oEmbed for the listing videos: https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=hXkn0DVPEl4 , https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=8gC-aMgPkUc
- **S63** Hugging Face:
  - https://huggingface.co/api/models/hexgrad/Kokoro-82M (apache-2.0)
  - https://huggingface.co/api/models/prince-canuma/Kokoro-82M?blobs=true (apache-2.0; 327.1 MB weights, 389.4 MB repo)
  - https://huggingface.co/hexgrad/Kokoro-82M/raw/main/VOICES.md (`a` = American English)
- **S64** Secondary (used only where no primary source exists):
  - "$5" fee: https://support.google.com/chrome/thread/13959323 and https://pearpages.com/blog/2026/07/19/publishing-chrome-extensions-what-it-takes-what-it-costs
  - "Website content" expectation and support-URL gotcha: https://dev.to/amrita-labs/chrome-web-store-submission-the-gotchas-nobody-warns-you-about-2g7
  - Data-category list: https://ultrafastutilities.com/chrome-web-store-privacy-policy-requirements

---

## 16. Reproduction

All scratch files are in `/tmp/ntts-r07/`: `pages/` (raw HTML and cleaned text of every doc page), `cws/` (listing HTML/TXT, competitor images, contact sheets), `proposed/` (the probe manifest) and `draft/` (field and description counts).

```bash
# Permission warnings — current build (measured: ["Read and change all your data on all websites"])
EXE="$HOME/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
agent-browser --session w1 --executable-path "$EXE" --extension chrome-extension/dist open chrome://extensions
agent-browser --session w1 eval "new Promise(r=>chrome.management.getAll(x=>chrome.management.getPermissionWarningsById(x[0].id,w=>r(JSON.stringify(w)))))"

# Proposed manifest (no content_scripts, + scripting): measured ["Read and change your data on 127.0.0.1"]
cp -R chrome-extension/dist /tmp/ntts-r07/proposed   # then drop content_scripts, add "scripting"
agent-browser --session w2 --executable-path "$EXE" --extension /tmp/ntts-r07/proposed open chrome://extensions
# same eval as above

# Branded Chrome 137+ ignores --extension (measured: chrome.management.getAll() → [])

# Icon compliance
magick identify -format "%f %wx%h channels=%[channels] opaque=%[opaque]\n" chrome-extension/public/icons/*.png
magick chrome-extension/public/icons/icon128.png -format "corner=%[pixel:p{0,0}]\n" info:

# API v1 sunset, v2 endpoints
curl -sL https://developer.chrome.com/docs/webstore/api/v1 | grep -o 'supported until [^.]*'
# Tool versions
curl -s https://registry.npmjs.org/chrome-webstore-upload-cli | jq -r '."dist-tags".latest'
gh api repos/aklinker1/publish-browser-extension/releases --jq '.[0].tag_name'
gh api repos/google-github-actions/auth/releases/latest --jq .tag_name

# Repo facts used above
gh api repos/renchris/natural-text-to-voice-extension --jq '{visibility,has_pages,license:.license.spdx_id}'
gh api repos/renchris/natural-text-to-voice-extension/releases --jq '.[]|"\(.tag_name) \([.assets[].name]|join(","))"'
```

---

## Adversarial verification (2026-09-23)

*An independent verifier re-fetched every load-bearing source and re-ran the permission probe on a newer browser. Evidence is in `/tmp/ntts-r07v/`: the fetched pages as `.html`/`.txt`, the listings in `cws/`, the four manifest variants `cur/ prop/ native/ nohost/`, and the Google Groups threads in `thr/`. The author's content above is unchanged.*

**Result: all 12 load-bearing claims hold against primary sources. None is refuted.** Several need a nuance, listed below. The weak points are in the recommendations. Two are over-convicted (rec 5, rec 8), rec 2 depends on a lower-conviction rec that has to land first, and the report doesn't reconcile with R04's Native Messaging move.

### Claim verdicts

| # | Claim | Verdict | Primary evidence (fetched 2026-09-23) | Nuance |
|---|---|---|---|---|
| 1 | v1.4.0 warns "Read and change all your data on all websites"; no content script plus `scripting` gives only "…on 127.0.0.1" | **confirmed** | Re-measured on **Chrome for Testing 153.0.8010.12** (the author used 151) with `chrome.management.getPermissionWarningsById`: `cur` → `["Read and change all your data on all websites"]`, `prop` → `["Read and change your data on 127.0.0.1"]` | Reproduces across two Chrome versions |
| 2 | activeTab is granted by an action or a context-menu item and shows no install warning | **confirmed** | developer.chrome.com/docs/extensions/develop/concepts/activeTab: "Executing an action / Executing a context menu item / …keyboard shortcut / …omnibox"; "displays no warning message during installation" | That page was last updated 2012-09-21, but the list-and-warning claim is still in the live permissions list (updated 2026-09-09) |
| 3 | Disclosure is required even for local-only processing; mismatches can suspend all of a publisher's items | **confirmed** | User Data FAQ Q3: "even when data is processed or stored locally on a user's device". Same page: "suspension of all the items owned by the publisher… ban of the entire publisher entity" | — |
| 4 | Same-machine extension ↔ native-program traffic needn't be encrypted | **confirmed** | User Data FAQ Q16, verbatim | — |
| 5 | API v1 deprecated, supported until 15 Oct 2026; v2 current since Oct 2025 | **confirmed** | …/webstore/api/v1 (updated 2026-09-16): "deprecated and will only be supported until 15th October 2026". …/webstore/api (2025-10-13): "Prior to October 2025, the Chrome Web Store API (V1) was the latest version" | v1 could **create** items (`POST /upload/chromewebstore/v1.1/items`). The v2 REST index has only `media.upload`, `cancelSubmission`, `fetchStatus`, `publish` and `setPublishedDeployPercentage`, so "first item by hand" is correct for v2 |
| 6 | An OAuth consent screen in "Testing" issues refresh tokens that expire in 7 days | **confirmed** | developers.google.com/identity/protocols/oauth2 (updated 2026-05-26): external user type + "Testing" → "refresh token expiring in 7 days" unless the scopes are only name/email/profile | The `chromewebstore` scope is outside that exemption, so the 7-day expiry applies |
| 7 | Percentage rollout only for items with >10,000 seven-day active users | **confirmed** | …/webstore/update, and v2 `setPublishedDeployPercentage` (2025-10-15): "only available to items with over 10,000 seven-day active users" | — |
| 8 | 128 icon = 96 art + 16 px transparent padding; no alpha → 12 px rounded frame; 1–5 screenshots at 1280×800 or 640×400; 440×280 tile required | **confirmed** | …/webstore/images, verbatim on all points | The page was last updated **2018-06-11**, including "all screenshots are downscaled to 640x400". It's official but old |
| 9 | Name ≤75 chars (enforced since Feb 2024); description ≤132 | **confirmed** | PSA 22 Feb 2024 (mpDvFpT0KJM): "universal limit of 75 characters… upload will be blocked". Manifest `name` ("maximum of 75"), `description` ("no more than 132") | Author's counts re-computed: 42 / 124 / 42 ✔ |
| 10 | LNA restrictions don't apply to extensions with host permissions | **confirmed** | LNA adoption guide (Google Doc export): "We do not currently have plans to apply LNA restrictions to extensions. Currently, extensions that have the necessary host permissions are allowed…". chromestatus feature 5152728072060928 is milestone 142 | The guide goes **further** than the report: it says there are no plans to apply LNA to extensions at all. Measured on CfT 153: a public page's loopback fetch fails (LNA active), while an extension page **without** host permission gets `GET /health` → 200 |
| 11 | 23 Apr 2026 PSA on a submission surge; official range a few days to a few weeks | **confirmed** | Thread VJ6DcpEn51Y: Sebastian Benz, "Thursday, April 23, 2026 at 6:53:52 p.m. UTC-4", "surge in new extensions… longer-than-expected wait times". review-process: "within a few days, but it can take up to a few weeks"; contact support after three weeks | The same thread has developers reporting **28-day** waits (24 Apr) and ">3 weeks". "Allow 3 weeks" is the optimistic end |
| 12 | Local-server TTS/AI extensions are live; Page Assist is Featured; Read Aloud, Speechify and ElevenReader declare "Website content" | **confirmed** | Live listings: Page Assist "Featured", 300,000 users, "will not collect or use your data". Read Aloud TTS with Kokoro: 8 users, needs "Kokoro-FastAPI server at http://localhost:8880". Kokoro TTS Sender: **185 users**. Read Aloud: PII + auth + **Website content**. Speechify: PII + **Website content**. ElevenReader: **Website content** | ElevenReader is **Trader** and the other two are Non-trader, which matches §2 |

### Challenges to recommendations with conviction ≥80%

| Rec | Author | Challenge | Adjusted |
|---|---|---|---|
| **1** activeTab + `scripting.executeScript`, min Chrome 116 | 90 | **Holds**, and it was re-measured. Three refinements. (a) The context-menu path doesn't need injection at all: `info.selectionText` is already used for PDFs (`service-worker.ts:88-105`). Using it on every page also covers iframes and `<input>`/`<textarea>` selections, which `window.getSelection()` in the top frame misses. Only the popup needs `executeScript`. (b) `content-script.css` (the selection-flash overlay) must move to `scripting.insertCSS` or inline styles. (c) 116 is the right floor: `runtime.getContexts` is used at `service-worker.ts:215`. | 90 |
| **2** Rewrite and host PRIVACY.md | 95 | The §12.8 draft says the text is "never stored or logged by the extension", which is **false today**. `service-worker.ts` and `popup.ts` `console.log` 50-char previews of the selected text, and so does `content-script.ts`. That makes rec 11 (only 70%) a **hard precondition**, not a nice-to-have. On the helper side, `tts_worker.py:133` logs 30 chars at INFO. It never reaches disk only because `PythonWorker.swift:50` re-logs Python stderr at `.debug` while `App.swift:10` sets `.info`. That is true but fragile; pin it with a test or remove the line. "Accepts requests only from the Natural TTS extension" is false until rec 12 lands, and the Pages URL doesn't exist (`has_pages:false`). | 90 (coupled to rec 11 → 95) |
| **4** Icon redesign to spec | 90 | Holds for listing quality. But an alpha-less icon is **framed, not rejected**, so this is a "listing loses" defect, not a rejection cause as the Verdict's opening line implies. | 90 |
| **5** Work without the helper (R03 hybrid / `chrome.tts`) | 80 ("changes review outcome") | Three hard-dependency precedents passed review with no fallback (Read Aloud TTS with Kokoro, Kokoro TTS Sender, Featured Page Assist). The report's own §6 puts Minimum-Functionality risk at 35% as-is and 20% with a notarized helper plus test instructions. The fallback removes about 10 more points; it doesn't decide the outcome. It also adds 21.6 MB of WASM to the review surface, and it clashes with the "…for Mac" name in rec 10. Worth doing for users and uninstall rate, not as a review gate. | **55** for the review claim; 85 for "worth doing" |
| **6** Signed and notarized helper | 80 | The direction is right, but the **effort is understated**. The $99/yr Apple Developer Program is never mentioned; R04 has it. `native-helper/Sources/NaturalTTSHelper/Resources/python-env` is **2.1 GB with 587 `.so`/`.dylib` files**, and every Mach-O must be Developer-ID-signed under hardened runtime. With the Python env that is L, not M. It becomes M only after R04's Swift-only port. | 80, effort **L** unless R04 lands first |
| **7** Store media set | 90 | Holds. Frame 3 (DevTools → Network) arguably doesn't "demonstrate the actual user experience" (images doc). Put that proof in the video or description and use the slot for an in-context frame. | 85 |
| **8** CI on v2 via GitHub OIDC → WIF | 80 | **There is no CI in this repo** (no `.github/` directory), so Verdict defect 5 ("Any CI… breaks in 22 days") doesn't apply here. The CWS service-accounts doc (2025-10-15) documents only `gcloud --impersonate-service-account` and JSON-key JWT. WIF is standard GCP impersonation (it needs `roles/iam.serviceAccountTokenCreator` or `workloadIdentityUser` on the service account) but hasn't been verified end to end against CWS. Whether 2-Step Verification applies to service accounts is unverified. For a low-cadence hobby extension, manual upload is enough for launch. Correction in the author's favour: `lastAsyncUploadState` **is** in the v2 `fetchStatus` response schema (`…/v2/publishers.items/fetchStatus`), so the author's 75% on that field is now confirmed. | **60** (defer until after launch) |
| **9** Declare Non-trader | 80 | Correct for a free, non-commercial tool. Trader status turns on acting "for purposes relating to [one's] trade, business, craft or profession". If the listing promotes the operator's professional brand or links to paid services, that changes. It stays the operator's call. | 80 |
| **12** Pin helper CORS to the store ID | 80 | Measured: the helper **already returns 403** for a non-extension `Origin` (`https://evil.example` → 403) and serves requests with **no** Origin (curl → 200, 60 KB WAV). Pinning therefore only blocks *other installed extensions*; any local process still gets in by omitting Origin. The cost: dev builds need the manifest `key`, and an Edge Add-ons listing would have a second ID. Timing fix: the item ID exists once the draft is uploaded (manifest-key doc: "upload… without publishing"), so pin **before** submission, not after approval as §14 G says. The rec is moot if R04's Native Messaging lands (`allowed_origins` pins it natively). | **65** |
| **14** Reject percentage rollout | 95 | Confirmed. It isn't available below 10k 7-day users, so it isn't really a choice. | 95 |

### Items the author missed

1. **Native Messaging conflict with R04 (reconcile before writing the listing).** R04 recommends moving the helper to Native Messaging. Measured on CfT 153, `nativeMessaging` (no host permission) warns **"Communicate with cooperating native applications"**. That change rewrites R07 §5.2 (justifications), the §12.3 "Permissions, explained" block, the LNA row, and rec 12 (`allowed_origins` replaces the CORS pin). `tts_worker.py:147` still mentions "the Native Messaging protocol", so the codebase has history here. Pick one transport before submission. Adding a permission after launch disables the extension until each user accepts it (§8).
2. **A zero-warning option exists.** Dropping `host_permissions` entirely measured **`[]`** warnings. Without host permission, `GET /health` and `GET /voices` from an extension page still return 200, because the helper echoes `chrome-extension://` origins and the LNA guide exempts extensions. But `POST /speak` **fails**, because the helper answers the CORS preflight `OPTIONS /speak` with **404**. Adding a preflight handler (204 with Allow-Methods/Headers for the pinned origin) would make zero-warning install possible. The alternative is `optional_host_permissions` requested on the onboarding page. The report's advice "Don't replace it with an optional permission" is too strong: a granted optional host permission *is* a host permission, and LNA exempts extensions anyway. The one risk is that the LNA exemption is worded "currently". Evaluate at about 60%.
3. **The $5 fee now has a primary source.** The What's New entry of 30 Apr 2026 says "without paying the $5 registration fee". §2's "unverified, widely reported" can be upgraded to confirmed. The same entry adds **publisher roles**: members can be invited at no cost, which is a cleaner way to add a maintainer than sharing the permanent developer email.
4. **Search indexing lag.** Google DevRel (Patrick Kettner, 14 Sep 2026, thread `c2GM6j-IbtM`): "It can take up to 7 days for the Chrome Web Store search to start showing new items." Plan launch comms to use the direct listing URL, or wait. Combined with the 28-day reports in claim 11, plan **about 4–5 weeks from submit to discoverable**, not 3.
5. **In-dashboard appeals** (What's New, 8 Apr 2026). This is the rejection-handling path, and §8 doesn't include it.
6. **Official-URL verification is currently flaky.** Open community reports (18 Sep 2026, thread `zxTZ0FMKL7o`) say Search-Console-verified sites don't appear in the Official URL picker. That is a risk to rec 13.
7. **The competitive set is wider than Kokoro.** Supertonic-based on-device readers outrank every Kokoro listing: "Supertonic Text-to-Speech Voices" (2,000 users, 4.5, Accessibility), "TLDRL | Lightning TTS Powered by Supertonic" (1,000 users, 4.3) and "OfflineTTS" (145, 5.0). All three disclose "will not collect or use your data". §4.3's "the Kokoro niche is thin" is true but frames the field too narrowly. Position against on-device TTS as a whole (R01 covers Supertonic as a model).
8. **Chrome 153 is testing default toolbar pinning** (What's New, 3 Aug 2026). Don't hard-code "pin the extension" steps into the onboarding or the screenshots.
9. **Don't add `ttsEngine`** if the fallback is ever widened to register the helper as a system-wide Chrome voice. It carries the warning "Read all text spoken using synthesized speech" (permissions list). `tts` carries none.
