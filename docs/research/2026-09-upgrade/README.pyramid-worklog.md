# README.md — pyramid worklog (Minto, full method, Mode C)

The audit trail for the 1.5.0 rewrite of the root `README.md`: each session's decisions, its artifact and its exit
checklist, in order. Sessions 0 and 3-9 ran inline in one context (no subagents). Session 10, the critique panel, is
run by the orchestrator after this lane, over the frozen draft.

## Session 0 — Intake, classification, routing

**Mode.** C (Communication). The message is already settled by the 1.5.0 work and its research: select text, hear a
natural Kokoro voice generated on the Mac, nothing leaves the machine. The job is a rigorous README, not new
analysis. Route: 3 → 4 → 5 → 6 → 7 → 8 → 9, then stop (10 is the orchestrator's).

**Reader.** A developer or Mac user who lands on `github.com/renchris/natural-text-to-voice-extension` and decides in
about 30 seconds whether to install. Three secondary readers arrive by deep link and must land on the right heading:

| Arrives from | Link | Must find |
|---|---|---|
| The popup's "or build it from source" / "Installed from source?" links | `…#install` (`chrome-extension/src/popup/popup.html:51,57`, `src/shared/helper-version.ts:32`) | the from-source install |
| The "Update the Natural TTS helper" notice (helpers older than 1.5) | `…#updating-a-helper-installed-from-source` (`helper-version.ts:35`) | the update command |
| Chrome Web Store reviewers, via the listing's test instructions | the README (`docs/publishing/CHROME_WEB_STORE.md:27`) | install + what it does |

**Medium.** A GitHub README with visuals (fixed by the brief): rendered GFM, 838 px content column
(`UPGRADE_RESEARCH.md` §10), dark and light modes, no `<video>` (GitHub strips it), no JS.

**What the reader should KNOW and DO.** Know: this reads selected text aloud in a natural voice generated on the
Mac, and nothing selected leaves the machine. Do: install the helper (Homebrew, or from source) and the extension,
then right-click a selection.

**Hard constraints found at intake** (each is a machine check or an operator ruling, not a style choice):

1. `## Install` and `### Updating a helper installed from source` must exist as exact lines, and the README must
   contain none of `WebGPU`, `Phase 0`, `IN PROGRESS` — `scripts/release/release.sh:404-408` refuses the listing
   handoff otherwise. So the in-browser comparison figure from §10 ("WebGPU Kokoro 6–8.5×") cannot appear.
2. The old product name `Natural Text-to-Speech` must not appear (`scripts/verify-all.sh` docs section, "no old
   product name").
3. Name "Natural TTS: Private Kokoro Voices for Mac", short "Natural TTS"; default voice `af_heart`; system-voice
   fallback through `chrome.tts`, local voices only; helper via `brew install renchris/tap/natural-tts && brew
   services start natural-tts` (published with v1.5.0, right after this lands) plus a from-source path that works
   today; category Accessibility; no default shortcut keys (operator rulings, brief).
4. ≤ 4 badges, all live; no store badge until listed; CI badge allowed because `.github/workflows/ci.yml` exists in
   the tree (it is not on `origin/main` yet, so it goes live when this lands; `gh run list` shows no runs today).
5. Every diagram in a dark/light `<picture>`, ≤ 838 px wide, full-prose alt text, plus the collapsed
   `Interactive Diagram` fence with its sync marker (beautiful-mermaid-docs skill).
6. `<!-- hero-video -->` alone on its own line directly above the hero preview; caption "Press play, then unmute" +
   one-line provenance; a transcript of the hero audio.
7. Do not state the loudness change (a parallel lane may land it). Time to first audio equals full synthesis — say so.
8. The committed benchmark is from a busy machine (`clean: false`); state numbers with their conditions.

**Input body, bounded to the governing documents** (Execution contract rule 1). Words by `wc -w`; partial reads
counted at the part read.

| Document | Part read | Words |
|---|---|---|
| `README.md` (current, what to keep) | all | 1,885 |
| `CHANGELOG.md` | `[1.5.0]` section, lines 10-206 | ~3,300 |
| `docs/research/2026-09-upgrade/UPGRADE_RESEARCH.md` | §10 README inputs, §11 publishing inputs | ~1,450 |
| `docs/research/2026-09-upgrade/W2-integration-measurements.md` | all | 2,497 |
| `bench/README.md` + `bench/results.json` | all | 2,107 |
| `assets/media/PROVENANCE.md` | clip table, hero section, screens table, voices row | ~2,100 |
| `assets/diagrams/README.md` + the four `.mmd` | all | 1,230 |
| `docs/README.md`, `chrome-extension/public/manifest.json`, `packaging/homebrew/README.md` §1-2, `release.sh` README check | parts | ~1,050 |
| **Total** | | **~15,600 words ≈ 21,900 tokens** (× 1.4) |

**Tier A** (≤ 30K tokens): inline, no subagents. Not read, deliberately: the R01-R10 and C1-C3 research reports, the
rest of UPGRADE_RESEARCH, `GUI_PASS.md` and `assets/store/README.md` beyond their media rows. They produced the
governing documents; they do not govern the message.

**Measured at intake, and one conflict with the brief.** `webpmux -info` on the committed media: `hero-preview.webp`
is 960×600, 153 frames, **14.2 s** (the brief says "9.45 s"; `PROVENANCE.md` agrees with the file, so the README states
no duration for it); `voices.webp` 720×1518 6.35 s; `status.webp` 720×700 4.15 s; `helper.webp` 1182×870 23.6 s;
`gate.webp` 1280×1640 12.8 s; `hero.mp4` 1280×800 24.8 s; `demo-30s.mp4` 1280×720 27.4 s; `popup.png` 720×700;
`fallback.png` 720×1178; `icon-512.png` 512×512.

**Exit checklist.** [x] input named and bounded, token estimate and tier recorded · [x] reader, medium, KNOW/DO
stated · [x] mode and route chosen · [x] hard constraints listed.

## Session 3 — Build the pyramid (top-down)

**Top box.** Subject: Natural TTS, the extension plus its Mac helper. The reader's question: *is there a natural
read-aloud voice for Chrome that keeps what I select on my Mac, and is this it?* Answer: yes.

**Introduction, thought S → C → Q** (caveat 2):

- **S** (known, accepted): you read in Chrome, and Chrome and macOS can already read text aloud.
- **C** (known to this reader): the voices that sound natural are cloud services, so the selected text goes to a
  server; the voices that stay on the Mac sound mechanical.
- **Q**: can I have a natural voice that stays on my Mac?
- **Recheck C → Q**: the complication is exactly the trade-off the question asks to escape. Holds.

**Governing thought (G).** *Select text in Chrome and hear it in a natural Kokoro voice generated on your own Mac;
nothing you select leaves it.* (Wording source: `UPGRADE_RESEARCH.md` §10 governing line; "not in the cloud" from
the manifest `description`, `chrome-extension/public/manifest.json:6`.)

**New question raised by G:** *why should I believe it is good enough to install?* → **Key Line = reasons,
inductive**, plural noun **"reasons to install it"**:

```
G  Select text in Chrome and hear it in a natural Kokoro voice made on your own Mac; nothing you select leaves it.
│    answers: is there a natural voice that stays on my Mac?   raises: why believe it? (and: how do I get it?)
├─ KL1 NATURAL  It sounds like a person reading: Kokoro-82M, 28 English voices (US and UK), 0.5x-2x.
│    raises: which voices, and can I hear one?
│    ├─ the hero: a whole paragraph in Heart (af_heart), 1.0x, the helper's own unedited output
│    │     [assets/media/PROVENANCE.md "Hero video"; src/selections.json id=hero]
│    ├─ 28 voices: 20 American, 8 British, grouped by accent; British voices use British pronunciation
│    │     [CHANGELOG 1.5.0 "All 28 English Kokoro voices"; chrome-extension/src/shared/voices.ts]
│    ├─ Heart is the default for new installs [CHANGELOG OD-5; voices.ts DEFAULT_VOICE]
│    └─ speed 0.5x to 2.0x [chrome-extension/src/shared/settings-defaults.ts:36-37]
├─ KL2 PRIVATE  Nothing you select leaves your Mac, and you can check every hop it takes.
│    raises: where exactly does the text go, and how would I know?
│    ├─ the extension's only host permission is 127.0.0.1; it reads a selection only after your click
│    │     (activeTab + scripting, no content scripts); the only install warning names 127.0.0.1
│    │     [manifest.json:8-18; CHANGELOG "Permission reduction"; scripts/verify-all.sh:29 EXPECTED_WARNINGS]
│    ├─ the helper binds 127.0.0.1 only, answers 403 to web-page Origins, never logs the text
│    │     [native-helper/.../HTTPServer.swift:65, 156-176; CHANGELOG "Helper log privacy"]
│    ├─ the voice engine runs offline: HF_HUB_OFFLINE=1, model fetched once at install, 0 connections while
│    │     it speaks [CHANGELOG "Offline, always, and pinned"; W2-integration-measurements.md §7]
│    ├─ without the helper, macOS's own voices read it: chrome.tts, local voices only [CHANGELOG OD-2]
│    └─ the check: lsof on the helper and on its worker child, the same commands the demo runs on camera
│          [assets/media/PROVENANCE.md scene (e1); scripts/verify-all.sh:237; tried read-only on pid 31790]
└─ KL3 FAST  A sentence is ready in about 0.4 s and a 400-word page in 6.5 to 8 s on an M1 Max.
     raises: under what conditions, and what do I wait for?
     ├─ warm medians, committed run on a busy machine: 21.6-23.3x; S15 0.385 s, M60 1.24 s, L400 7.75 s,
     │     X4985 14.8 s [bench/results.json warm[], clean:false]
     ├─ same helper on a quiet machine the day before: ~26.5x; 0.338 / 1.106 / 6.473 / 12.23 s
     │     [W2-integration-measurements.md §3, voice af_bella]
     ├─ time to first audio = the whole synthesis: no streaming [bench/README.md "Time to first audio"; W2 §3]
     ├─ start: launch to ready 1.95 s quiet (before the British warm-up was added), 3.9 s busy; first request
     │     0.35-0.52 s, not cold [W2 §2; results.json startup]
     └─ memory: the worker peaks at 3.7 GB and falls back to 0.7 GB [results.json memory; W2 §9]

NEXT STEPS (the action G implies; placed first in the body, see Session 4)
  Install: 1 the helper (Homebrew, published with v1.5.0 | from source, works today)
           2 the extension (store not listed yet | the release zip | a local build)
           3 speak a selection (right-click | popup | shortcuts you assign)
     + Updating a helper installed from source        [packaging/homebrew/README.md; native-helper/Scripts/quickstart.sh;
                                                        scripts/release/release.sh:17-20; chrome-extension/build.ts]
REFERENCE (outside the thinking structure, like fees in a proposal): Troubleshooting · Development · License
```

**Six caveats, by name.** (1) Top-down first: yes, the top box came before any listing. (2) Situation-first: S → C →
Q written before G. (3) Introduction thought through: yes; it compresses to the promise line (Session 4). (4)
Chronology only in the introduction: the project's phase history leaves the body entirely, to `docs/history.md`.
(5) Introduction holds only accepted truths: that cloud voices receive your text is common knowledge to this reader;
nothing contestable is in it. (6) Induction at the Key Line: three reasons, not a chain.

**Considered and left off the Key Line.** "Easy to install" is the cost of the action, not a reason of the same kind;
it is stated where the action is (Install's first sentence). "Free and open source" is true (MIT) but is not why a
reader picks this over another local reader; it rides in License and the word "free" in Install.

**Exit checklist.** [x] top box written; subject of G = subject of the document · [x] S and C stated, C → Q
rechecked · [x] Key Line: new question named, inductive, plural noun, each point a sentence · [x] one level of
support under each point, with citations · [x] every node annotated with the question it answers or raises ·
[x] groupings ≤ 5 · [x] six caveats checked · [x] pyramid drawn.

## Session 4 — Introductions

**Main introduction: the Direct order (A → S/C).** A README reader expects the answer first, so the promise line
carries G, and the S-C contrast survives as its last clause: *"…made on your Mac's GPU, not in the cloud."* That
clause reminds (every reader knows natural voices usually live in the cloud) and informs nothing. No exhibit sits in
the introduction: the hero, the first exhibit, follows the Key Line.

**Pattern matched.** Appendix B, *"Should we do it? — is it the right action?"* (S = you want X; C = a way to get it
is offered; Q = is it the right one?), answered with reasons. The buyer's-reasons variant of §8 checks the Key Line:
*this solves it* (Natural + Private), *favourable economics* (free, MIT: stated in Install and License, not a Key Line
reason), *extras* (Fast).

**The one deliberate departure: Next Steps (Install) comes first in the body, not last.** Minto puts the action's
detail at the end as Next Steps, admitting only actions the reader will not question. Installing qualifies. It moves
up for three reasons, each measured rather than assumed: (1) the first screen already delivers the whole argument
(G + Key Line) in 30 seconds, so a persuaded reader must be able to act without scrolling past proof; (2) three
deep links land on `#install` and `#updating-a-helper-installed-from-source` (Session 0 table); (3)
`release.sh:404-408` requires those headings. The evidence sections that follow serve the reader who is not yet
persuaded, in Key Line order.

**Key Line on display.** Long document → set out the three points before the first heading, as bold-led bullets,
and **before the hero** (the R08 skeleton put the hero first; the pyramid puts the Key Line before its first
exhibit, and the 30-second test must pass for a reader who never presses play).

**Mini S-C-Q per section** (each becomes the section's first sentence, reminding the reader where he stands):

| Section | S (where the reader is) | C | Q | Opening idea |
|---|---|---|---|---|
| Install | persuaded by the first screen | it has two parts | what do I install, in what order? | two parts; the helper first; the extension works without it |
| How it works | installed, or about to | "nothing leaves your Mac" is a claim about a path | what path does the text take? | one hop, to 127.0.0.1, then the GPU, then back |
| Privacy | has seen the path | a diagram is not proof | how would I check? | every hop can be checked; here is how |
| Performance | knows it runs locally | local models can be slow | how long do I wait? | 22-26× real time; the wait you feel is long selections, because audio starts at the end |
| Troubleshooting | something is off | the popup already knows what | what does each state mean? | the pill names the state; each state has one fix |
| Development | wants to change it | many parts, two languages | how do I know I broke nothing? | one fail-closed gate checks the whole tree |

**Exit checklist.** [x] main introduction drafted, S noncontroversial, C the last thing known, A = G · [x] Business
Week test: "natural voices are usually cloud services" · [x] tone order chosen (Direct) and why · [x] pattern named ·
[x] mini S-C-Q per section · [x] one question · [x] set-out plan decided (bullets before the first heading).

## Session 5 — Horizontal logic

| Grouping | D / I | Plural noun or chain | Checks |
|---|---|---|---|
| Key Line (Natural, Private, Fast) | I | reasons to install it | no misfit (each is a property the reader weighs); no news (shared judgment: why it is worth installing); inference ("worth installing, and nothing leaves your Mac") stays within the three; no masquerade (no point causes another) |
| KL1 support | I | facts about the voices | model, count, default, speed: one subject (the voices) |
| KL2 support | I | places the text can go | extension → helper → worker, or → macOS voices; plus how each is checked, stated per place (first draft listed "check it" as a fourth sibling, a misfit: an action among situation ideas. Fixed by attaching each check to its place) |
| KL3 support | I | measured costs of speaking | wait by length, wait before audio, start-up, memory. Memory is a cost like the others, so it stays; the section summary names both time and memory (Session 7) |
| Install | I (action) | steps | helper → extension → speak; effect: Chrome reads selections in Kokoro voices |
| Troubleshooting (reference) | I | popup states | one row per state of `popup-status.mmd`, then the toolbar badges |
| Development (reference) | I (action) | steps to change and verify | build → test → gate → re-render |

No deductive grouping exists above paragraph level. The Key Line is inductive.

**Exit checklist.** [x] every grouping labelled · [x] plural nouns named, misfit found and fixed · [x] Key Line
inductive.

## Session 6 — Logical order

| Grouping | Source analysis | Order | Completeness interrogated |
|---|---|---|---|
| Key Line | the reader's evaluation, a process | time: hear it (the hero plays) → ask where the text goes → ask how long it takes | Missing reasons? Language: English only, so "28 English voices" says it. Browsers: any Chromium 148+ (Install). Accessibility (the store category): keyboard shortcuts with no default keys, in step 3 |
| Install | a process | time: requirements → helper → extension → speak; then update, a separate case | Missing steps? Stopping or removing the helper (one clause each); a helper already running from an older checkout (the update section's "stop it first") |
| KL2 / Privacy | the architecture, a structure | structural: the order the text travels (extension → helper → worker), then the no-helper branch | Every node of `architecture.mmd` is covered: popup, service worker, offscreen, chrome.tts, loopback hop, helper, worker, GPU. The GPU does no I/O, so it needs no check |
| KL3 / Performance | a class | degree: by text length, then the costs that do not scale with length (start-up, memory) | Missing costs? Disk (~1 GB) belongs to Install's requirements, not here |
| Troubleshooting | the popup's state machine, a structure | structural: the states in the order the popup passes through them | States of `popup-status.mmd`: Checking, Warming, Connected, Offline (system voice), Offline (error). Plus badges (red "!", grey "i"), the update notice, ports, logs |
| Development | a process | time: build → test → gate → re-render → capture | Also where the docs are: the index, the history, the CHANGELOG |

**Exit checklist.** [x] source and order named per grouping · [x] completeness hunted, findings above · [x] groupings
≤ 5 (Install has three steps; Troubleshooting's five rows are the five states of one diagram) · [x] none without an
order.

## Session 7 — Summaries

No intellectually blank assertions: no parent reads "three reasons" or "several states". Each parent, before and
after:

| Node | Before (placeholder) | After (the summary it now states) |
|---|---|---|
| G | "A local, privacy-first TTS extension" (the old tagline) | Select text in Chrome and hear it in a natural Kokoro voice, made on your Mac's GPU, not in the cloud |
| KL2 | "Privacy" | Nothing you select leaves your Mac, and you do not have to take that on trust |
| KL3 | "Performance" | 22 to 26 times faster than real time; the wait you feel is long selections, because audio starts when all of it is ready. The worker peaks at 3.7 GB |
| Install (action) | "Install" | Effect of the steps: Chrome reads your selections in Kokoro voices. Opening: two parts, the helper first, the extension works without it |
| How it works | "Architecture" | The selection makes one hop, to 127.0.0.1, and comes back as a WAV |
| Troubleshooting | "Troubleshooting" | The pill names the state and each state has one fix |
| Development | "Development" | One fail-closed gate checks the whole tree |

Universal interrogation, *why these ideas and no others?* Key Line: they are the properties that decide the install,
and the only ones (Session 6 hunted the rest). Privacy: they are every place the text can go. Performance: every
cost a user pays per selection. Install: all the actions needed to get the effect.

**Exit checklist.** [x] no blank assertions · [x] action parents state effects · [x] situation parents state the
insight · [x] every parent still answers the question above it.

## Session 8 — Pre-writing gate

| Gate | Evidence inspected |
|---|---|
| A · pyramid rules | Each parent in the Session 7 table summarises its children; each grouping has one plural noun (Session 5); each has an order (Session 6); G governs all |
| B · relationships | Every box is a sentence; each grouping answers the question its parent raises (Session 3 annotations); the Key Line is purely inductive; G answers the planted question (S-C in the promise's last clause) |
| C · building | Top-down honoured (Session 3); six caveats re-checked: history is out of the body, induction at the Key Line |
| D · introduction | Direct order, reminds only, no exhibit before the Key Line; one question; pattern named; mini S-C-Q per section |
| E · logic | No deduction above paragraph level; the misfit in KL2 fixed; action (Install) before argument, justified in Session 4 |
| F · order | Orders named per grouping; completeness findings recorded; groupings ≤ 5 |
| G · summaries | Every grouping MECE: KL2 against the architecture's nodes, Troubleshooting against the state diagram, Performance against per-selection costs; no blank assertions |
| H · problem-solving | n/a (mode C) |
| I · 30-second test | Read alone — promise, three bullets: a cold reader learns what it does (reads selections aloud), how it sounds (Kokoro, 28 voices), where the text goes (127.0.0.1 or macOS voices), how fast (0.4 s a sentence, 6.5-8 s a page), and sees Install next. He could stop and act |

All gates pass. Drafting may begin.

## Session 9 — The pyramid on the page

**Format.** A long document on a page → the Key Line set out before the first heading, then a heading per section.
The pyramid maps to the page like this:

| Pyramid node | On the page |
|---|---|
| G | the `<h1>` name and the bold promise line under it |
| Key Line | the three bold-led bullets, before the hero |
| KL1 support | the hero (with its transcript) and, in Install step 3, the voices loop |
| Next Steps | `## Install`: `### 1. Install the helper`, `### 2. Add the extension`, `### 3. Speak a selection`, then `### Updating a helper installed from source` |
| KL2 support | `## How it works` (the path, two diagrams) → `## Privacy: verify it yourself` (the permissions table, the two `lsof` checks, the no-helper branch) |
| KL3 support | `## Performance` (the chart, a busy/quiet table, then first audio, start-up, memory, how to re-measure) |
| Reference | `## Troubleshooting` (state diagram, state table, two popup images, badges, ports, log) · `## Development` · `## License` |

**Heading rules.** Never one of an element: four H3s under Install, none elsewhere. Parallel within the group: the
three step H3s are verb-first; the update H3 is fixed by `release.sh`. The H2s are navigation labels, the GitHub
medium's convention (one of them is machine-required), so each section's *idea* is its first sentence, not its
heading (Session 9 rule 4: headings sit outside the text). The document reads correctly with the headings removed.

**Transitions.** Each section opens by referring back to where the reader stands: Install's "two parts" picks up the
Private bullet's "helper app"; How it works's "one hop" is what Privacy then checks hop by hop; Performance opens on
the one wait the reader will feel. No "this section describes" sentences.

**Image test, applied to the load-bearing sentences.** "Your selection makes one hop, to 127.0.0.1" (a line from
Chrome to one box and back); "the wait you notice comes from long selections, because playback starts only when all
of the audio is ready" (a bar that must fill before sound). Rewritten from their images: the first draft's "the
helper answers requests from web pages with 403" was wrong in its picture (the `/health` probe is open to any
Origin), so it became "refuses to speak for a web page".

**Media placement, and what was left out.** Every committed visual was looked at (contact sheets for the five loops
and both MP4s). Placed: icon, hero preview (linked to `hero.mp4`, `<!-- hero-video -->` alone on the line above it),
`voices.webp` (width 360), four diagrams, `status.webp` + `fallback.png` side by side (width 360), `helper.webp`
(width 700), `gate.webp` inside a collapsed `<details>`, and `demo-30s.mp4` linked from Privacy, since its last scene
runs the same `lsof` check. The Privacy block uses the demo's check: the worker is found as the helper's child
(`pgrep -P`), which is port-independent. Not placed: `popup.png`, because it repeats the last frame of `status.webp`
and the first frame of `voices.webp`.

**Facts, each from a committed source.**

| Claim in the README | Source |
|---|---|
| 28 English voices, 20 US / 8 UK; Heart default; British pronunciation | `chrome-extension/src/shared/voices.ts`; CHANGELOG 1.5.0 |
| speed 0.5× to 2× | `chrome-extension/src/shared/settings-defaults.ts:36-37` |
| 0.39 / 1.24 / 7.75 / 14.8 s and 21.9 / 23.3 / 21.8 / 21.6×, busy, `clean: false` | `bench/results.json` `warm[]`; `bench/README.md` "The committed result" |
| 0.34 / 1.11 / 6.47 / 12.2 s and 26.6 / 26.2 / 26.5 / 26.6×, quiet, Bella, n=3 (L400 n=6) | `W2-integration-measurements.md` §3 |
| first audio = the whole synthesis; 5,000 characters the maximum | `bench/README.md` "Time to first audio"; `chrome-extension/src/shared/helper-errors.ts:122` |
| launch to ready about 3 to 4 s; first request warm | CHANGELOG 1.5.0 "Faster start"; `bench/results.json` `startup` (3.9 s median) |
| worker peak 3.7 GB, back to 0.7 GB; helper ~10 MB | `bench/results.json` `memory` (3,678 / 699.9 MB); W2 §5 (10.4 MB) |
| macOS 14.5 to build, Xcode 16.2 CLT, Chrome 148 | CHANGELOG 1.5.0 "Breaking"; `manifest.json:7` |
| ~1 GB disk | `native-helper/QUICKSTART.md` (655 MB env) + W2 §6 (349 MB model) |
| permissions table | `manifest.json:8-18`; wording from `docs/publishing/CHROME_WEB_STORE.md` §3.2 |
| only install warning | `scripts/verify-all.sh:29`; gate.webp "install warnings" row |
| helper binds 127.0.0.1, 403 to web-page Origins on `/speak` and `/voices`, never logs text | `HTTPServer.swift:65, 156-176`; CHANGELOG "Helper log privacy" |
| worker offline, model once at install | CHANGELOG "Offline, always, and pinned"; `packaging/homebrew/README.md` |
| fallback: local voices only, error rather than a network voice, Options switch | CHANGELOG OD-2; `chrome-extension/src/shared/system-voice.ts:94-102` |
| red "!" tooltip gives the reason; grey "i" | `chrome-extension/src/shared/error-badge.ts:42`; CHANGELOG |
| brew log path; tmux session name; `teardown.sh` | `packaging/homebrew/README.md`; `quickstart.sh` `SESSION_NAME`; `native-helper/Scripts/teardown.sh` |
| hero transcript | `assets/media/src/selections.json` `id: hero` |
| Kokoro-82M Apache-2.0 by hexgrad; GPL/LGPL components installed, not shipped | `docs/publishing/CHROME_WEB_STORE.md:125`; `THIRD_PARTY_NOTICES.md`; CHANGELOG "Added" |

Deliberately **not** stated: the loudness change (a parallel lane); the in-browser comparison figure (the word the
release check forbids); a duration for the hero preview (brief and file disagree, see Session 0); the check count in
a command comment (a parallel lane may add checks; the `gate.webp` summary keeps "55", which is true of that
recording).

**Verification run in this session** (the renderer only formats; nothing was published):

| Check | Result |
|---|---|
| `bun run diagrams` (fills the four fences), then `bun run diagrams:check` after every later edit | exit 0, "all 8 SVGs and mermaid fences up to date"; the re-render left every SVG byte-identical (`git status`), so no diagram changed |
| every relative link, image and `#anchor` (script: `/tmp/ntts-readme-w4/check-links.py`, GitHub slug rules) | 50 checked, 0 broken |
| `release.sh:405-406` rule, replayed | both headings present; no `WebGPU` / `Phase 0` / `IN PROGRESS`; no old product name |
| `bash scripts/verify-all.sh docs` | PASS, 8 of 8 |
| `cd chrome-extension && bun install && bun run build` (the README's build line) | exit 0, `dist/` written |
| `bash -n` on `quickstart.sh`, `teardown.sh`, `setup-python-env.sh`, `verify-all.sh`; `node --check bench/run.mjs`; `node bench/chart.mjs --check --allow-contended` | all pass |
| the Privacy `lsof` lines, in bash **and** zsh, against the running helper (pid 31790, read-only) | the helper resolves port-independently; its worker child is found; the helper shows only `127.0.0.1:8249 (LISTEN)` |
| `gh api markdown -f mode=gfm -f context=renchris/natural-text-to-voice-extension -F text=@README.md`, wrapped in github-markdown-css 5.8.1 at 1012 px, Chrome for Testing (chromium-1243) headless via CDP, light and dark, details closed and open | every local image loads in both modes; the dark `<source>` picks the dark SVGs; looked at every slice |

**Could not verify, and why** (recorded, not guessed):

- **The CI badge renders as a broken image today**: `.github/workflows/ci.yml` is not on `origin/main`, so GitHub
  answers 404. It becomes live when this branch lands (the push itself touches `ci.yml`, which triggers a run).
- **`brew install renchris/tap/natural-tts`**: the tap is published by the operator's release program after this
  lands; the README says so beside the command.
- **The worker half of the `lsof` check on a 1.5 helper**: starting a private helper from the main checkout on
  18251 was refused by the permission system, so it was not retried. The running helper is v1.4, whose worker still
  holds a Hugging Face socket (`CLOSE_WAIT` to port 443): exactly the leak 1.5 removed. The 1.5 result ("prints
  nothing") rests on the gate's `worker offline during /speak: 0 ESTABLISHED` and on the demo's scene (e1), which
  showed `0` sockets for the 1.5 worker.
- **`quickstart.sh`, `setup-python-env.sh`, `verify-all.sh` in full, `bench/run.mjs`**: each builds, installs, or
  starts helpers; syntax-checked only, as the environment rules require.

**Exit checklist.** [x] format applied, heading rules checked · [x] headings navigational by necessity, ideas in first
sentences · [x] transitions written · [x] load-bearing sentences pass the image test · [x] the deliverable exists in
full (`README.md`, 437 lines) · [x] worklog appended.

## Variance log

- **Hero before or after the Key Line.** The R08 skeleton puts the hero first; the pyramid puts the three bullets
  first so the 30-second test passes without pressing play. One rework, no loop.
- **Install before the evidence** (Session 4): a deliberate, justified departure from Minto's Next-Steps-last.
- **Rework rounds: 1** (Sessions 5 and 9 each fixed one defect in place: the KL2 misfit, the 403 wording). Well under
  the cap of 2. The critique panel (Session 10) is the orchestrator's.
