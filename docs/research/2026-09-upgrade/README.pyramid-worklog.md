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
   *Superseded in Session 10 round 1:* the loudness lane landed (`ddf80fa`, then `142fd52` added it to this README
   without a pyramid node, finding F36), and the lead ruled it into KL1. See the Session 3 repair.
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

**Session 10 round 1 repair** (F2, F23, F35, F36 of `.claude-plans/readme-s10-round1.json`). The pyramid above stays
as the record of what the first draft was built from.

- **F23, F35: G carried no limit.** G says "your Mac", but the product runs only on Apple silicon with macOS 14.5 or
  later, in a Chromium browser 148 or later, and today it installs only from source. That limits G itself; it is not a
  reason beside the Key Line. So it goes where G is read: on the first screen, after the Key Line and before the hero.
  Sources: CHANGELOG 1.5.0 "Breaking" (macOS 14.5, Xcode 16.2), `manifest.json:7` (`minimum_chrome_version` 148),
  `chrome-extension/INSTALL.md:19-20` (Chrome, Edge, Brave, Opera, Vivaldi, Arc, Dia).
- **F2 (KL1 had no grouping of its own) and F36 (the loudness change had no node).** One move repairs both. KL1 gets
  its own section, and loudness becomes its fourth support, as the lead ruled. The measured fact: each response is
  turned up toward −16 LUFS, capped at a −1.5 dBTP peak, so most speech lands at about −16 to −25 LUFS, and the gap
  to the system voice fell from 7-12 LU to 0-5 LU (W2 §10). **Half of the lead's parenthetical is not carried:**
  "evens out level across voices". W2 §10's own table refutes it for long texts. The spread across its five voices is
  3.8 / 3.9 / 3.9 LU raw (short / medium / long) and 2.4 / 3.5 / 7.6 LU normalized. So the README states only the
  mechanism (every response is turned up toward one target) and the result it measured against the system voice.

Repaired pyramid, to one level below the Key Line (children the draft adds are audited in Session 10):

```
G   Select text in Chrome and hear it in a natural Kokoro voice made on your own Mac; nothing you select leaves it.
    LIMIT  Apple silicon, macOS 14.5+, Chrome or another Chromium browser 148+; installed from source until v1.5.0
           is released, then also by Homebrew and a release zip          [first screen, after the Key Line]
├─ KL1 NATURAL  It sounds like a person reading, in 28 English voices, and plays about as loud as your Mac's own.
│    raises: can I hear it, which voices, will it match my Mac?
│    ├─ the hero: a paragraph in Heart, the helper's own output       [PROVENANCE "Hero video"]
│    ├─ 28 voices, 20 US / 8 UK, British pronunciation; Heart default [voices.ts; CHANGELOG]
│    ├─ 0.5× to 2×                                                    [settings-defaults.ts:36-37]
│    └─ level: one gain toward −16 LUFS, peak ≤ −1.5 dBTP, so most speech is −16…−25 LUFS; 7-12 LU under the
│         system voice before, 0-5 LU now                              [W2 §10; native-helper/README.md:260-262]
├─ KL2 PRIVATE  Nothing you select leaves your Mac, and you can check each place it goes.
│    (children unchanged; the fallback's check is repaired in Session 5)
└─ KL3 FAST  On an M1 Max a sentence is ready in about 0.4 s and a 400-word page in about 7 to 8 s; the sound starts
     when the whole selection is ready.                                (children regrouped in Session 5)
```

**Session 10 round 2 repair** (R10, R24, R38, R40, R41, R42 of the round-2 findings; numbering in the Session 10 —
round 2 entry). Four defects, all in the round-1 pyramid above.

- **R24, R38: the LIMIT node named the platform and the route, not what the route costs.** A Mac user read "one script
  builds the helper" and stopped there, though today's path needs Terminal, Homebrew, Xcode's Command Line Tools and
  Bun (CHANGELOG 1.5.0 "Breaking"; `chrome-extension/INSTALL.md`). The node now carries that cost, and it moves above
  the Key Line, straight under G, so it no longer sits between KL1 and its exhibit (R14, Session 9).
- **R10, R41: KL1 held two claims joined by "also".** Loudness is not a reason of the same kind as "sounds like a
  person", and at the Key Line the reader does not yet know the product ever switches to a system voice. KL1 goes back
  to the one judgment. Loudness stays under KL1, as the lead ruled, one level down, as a fact about how it sounds
  (Session 5 repair).
- **R42: KL3 asserted "fast" from the best case with no comparison.** The one comparison the committed data supports
  is against listening time: speech is made about 20 times faster than it plays. No governing document measures the
  wait against macOS voices or a cloud voice, so neither is claimed. That comparison is also the chart's own metric,
  so it gives the chart a message (R17).
- **R40: Next Steps held actions the reader cannot take today** (a copy-pasteable `brew install` block, a store path
  with no action). Code blocks now carry only today's paths. The not-yet paths become one future-tense sentence each,
  with inline commands, and the Install opening says once that 1.5.0 is here but its release is not out. This is not
  one separate not-yet note: the lead ruled Homebrew second inside step 1 and the zip second inside step 2.

Repaired pyramid, round 2 (to one level below the Key Line):

```
G   Select text in Chrome and hear it in a natural Kokoro voice, made on your Mac's GPU, not in the cloud.
    LIMIT  an Apple silicon Mac on macOS 14.5+, Chrome 148+ or another browser on Chromium 148+; built from source today,
           in Terminal, with Homebrew, Xcode's Command Line Tools and Bun, then loaded in Developer mode
           [straight under G, before the Key Line]
├─ KL1 NATURAL  It sounds like a person reading, not a machine, in any of 28 English voices.
│    raises: can I hear it, which voices, how loud is it?
│    ├─ the hero: Heart, the default, reading a paragraph as the helper made it      [PROVENANCE "Hero video"]
│    ├─ 28 voices, 20 US / 8 UK, British pronunciation                               [voices.ts; CHANGELOG]
│    └─ volume nearer the Mac's own voices: raw output 7-12 LU under the system voice, sent 0-5 LU under
│         [W2 §10, second table]; the absolute level (−16 LUFS target, −1.5 dBTP cap) moves to the API paragraph
├─ KL2 PRIVATE  Nothing you select leaves your Mac: it goes only to a helper on this Mac, which makes the speech
│    without going online, or to your Mac's own on-device voices.       (children: Session 5 round 2 repair)
└─ KL3 FAST  It makes speech about 20 times faster than it plays: a sentence is ready in under half a second, a
     400-word page in 7 to 8 seconds.                                    (children: Session 6 round 2 repair)
     ["about 20": warm RTF 21.6-23.3 busy (bench/results.json), 26.2-26.6 quiet (W2 §3), less the loudness step's
      7-8% (bench/README.md; W2 §10 "Cost") → about 20.2-21.8 busy, about 24.5 quiet; 20 is the low end]
NEXT STEPS  Install: requirements → 1 helper (source today | Homebrew once v1.5.0 is released) → 2 extension (clone
            today | zip once released; store later) → 3 speak → updating. Code blocks only for today's paths
REFERENCE   Fixing (its own H2, after Install) · Development · License
```

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

**Session 10 round 1 repair** (F13 structural; F16, F18, F7 editorial).

| Grouping | Was | Now |
|---|---|---|
| KL3 support | one list, "measured costs of speaking", holding two kinds: conditions (busy run, quiet run, loudness later) and costs (no streaming, start-up, memory) | two groupings. **Conditions of the measurement** (I): one Mac, the busy run, the quiet run, the texts, the loudness step. **Waits** (I): by length (the table, now ending in today's wait) and start-up. Memory leaves KL3: it is something the Mac must have, not a speed, so it joins Install's requirements beside disk (F15). "No streaming" leaves the list: it is the governing sentence's own mechanism |
| KL2 support | each place with its check, but the fallback had an off-switch and no check (F16) | the fallback's check is its code, `isLocalSpeechVoice` (`chrome-extension/src/shared/system-voice.ts:99-107`). The summary now says which check each place has: the extension, the helper and its engine on your Mac; the fallback in its code |
| Development (reference) | steps to change and verify, plus an orphaned API paragraph (F18) | two groupings, one gerund H3 each: calling the helper from a script; changing the code (build → test → gate → re-render → watch a run) |
| Troubleshooting (reference) | popup states, then a mixed bullet list (F7) | three kinds, each introduced: the pill's states (the table); the icon's badges and the popup's update notice; two commands that check the helper itself |

Gates re-run for these groupings only: plural noun per grouping, no misfit, no news. All pass.

**Session 10 round 2 repair** (R10 structural; R12, R15, R16, R19, R43, R49 editorial).

| Grouping | Was (round 1) | Now |
|---|---|---|
| KL1 support | "facts about the voices": the hero, 28 voices, 0.5× to 2×, and a loudness paragraph told as news ("now plays…", "used to play…"). Loudness was a misfit under "a person reading", and speed supported neither half | **facts about how it sounds**: the voice (the hero), the voices (28, by accent), the volume (nearer the Mac's own). Speed leaves for step 3, where the reader sets it. The volume child is stated as a present-tense mechanism: raw output 7-12 LU under the system voice, sent 0-5 LU under. No before-and-after, no absolute range (that goes to the API paragraph, where a script receives the WAV) |
| KL2 support | four places plus a fifth item (the privacy policy). The helper also carried two facts about who may use it and what it keeps (403 to web pages, no text in its log), which are not places the text can go. The extension's evidence was its code, though the opening promised an on-Mac check | **places the text can go**: the extension, the helper, its voice engine, your Mac's own voices, each bold-led by a place. The policy link moves into the opening as the section-wide evidence. The 403 fact stays only under Development (it answers who can use the helper). The no-log fact leaves the README; `PRIVACY.md` carries it. The opening now says which check each place has: the helper and engine on your Mac, the extension and the fallback in their code |
| KL3 conditions | "The texts" bullet held a result (12.9× for a 2.5-second line) and "The loudness step" bullet held a wait cost | **conditions only**: the busy run, the quiet run, the texts, under a lead-in naming the one Mac. The 12.9× line leaves Fast; it stays in the `helper.webp` alt text under Development. The loudness cost is only in the table's lead-in and its column |

Gates re-run for these groupings only: one plural noun each, no misfit, no news. All pass.

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

**Session 10 round 1 repair** (F1, F3, F4 structural; F6, F8, F38, F43, F44, F45 editorial).

- **F1: the install paths were ranked by what is best after the release.** The reader asks "how do I install it
  now?", so degree order ranks by *works today* (lead ruling). The helper: from source, then Homebrew once v1.5.0 is
  released. The extension: built in the clone and loaded unpacked, then the release zip once v1.5.0 is released, then
  the Chrome Web Store once listed. The Offline rows' fix column follows the same order.
- **F3: seven H2s in no one order.** Sorted by what the reader does with each: **use it** (Install: three steps, then
  two upkeep items, updating and fixing what the popup reports), **trust it** (one H2 over the three Key Line
  sections, in Key Line order), **build on it** (Development), then License. Four H2s. The use group stays first
  (Session 4's justified departure). Troubleshooting joins it as the failure branch of Install.
- **F4: the Performance list mixed types.** Re-sorted into the two groupings of the Session 5 repair. The conditions
  run machine → the two runs → the texts → the step that came after them.
- **Completeness, hunted again.** Machines (F44): one M1 Max was measured and no other chip; the text says so and
  points to the benchmark. Browsers (F45): this session's own answer, "any Chromium 148+", now reaches the page.
  Limits (F43): 5,000 characters, about 750 words, and a longer selection is refused (`helper-errors.ts:122`); stated
  where the reader acts, in step 3. After a restart (F38): a from-source helper does not start again
  (`quickstart.sh` runs it in tmux; only `brew services` starts at login), so Chrome falls back to a macOS voice.
- **F6 is rejected as worded** (see Session 10 round 1). Moving the update H3 between steps 2 and 3 would put an
  existing user's task inside a new user's sequence. Its time-order point is met at step 1 instead, with a pointer.
- **F8: Development listed its parts in three orders.** Now one order, the gate's own, which the `gate.webp` recording
  fixes (python → swift → extension → consistency → packaging → docs). The prose, the path table and the command
  block all run helper → extension → formula.

**Session 10 round 2 repair** (R1, R26, R39 structural; R6, R7, R8, R9 editorial).

- **R1: Fast's two groupings were interleaved on the page.** The round-1 regrouping named them, but the draft ran
  waits → conditions (holding two results) → the start-up wait → re-measure. Order now: the multiple (the opening,
  then the chart) → **waits** (the table by length, then start-up, the one wait that does not grow) → **conditions**
  (one lead-in naming the Mac, then the busy run, the quiet run, the texts) → "no other Mac was measured; measure
  yours". The last sentence answers the question the conditions raise, directly after them.
- **R26: in the headings, fixing read as a step of installing.** `## Install` is a contract label and cannot widen,
  so fixing leaves it and becomes its own H2, straight after Install. H2s: Install · Fixing · the evidence ·
  Development · License, so the use group (Install, Fixing) still comes first, as the round-1 F3 grouping required.
  Updating stays under Install: it installs a newer helper.
- **R39: completeness, the restart.** Every restart dropped a from-source install back to a macOS voice, and the only
  start the page gave was the full install script. The missing step is a start that does not rebuild:
  `tmux new-session -d -s natural-tts-helper native-helper/.build/release/natural-tts-helper`. It is the line
  `quickstart.sh:390-391` runs, from the repo root instead of `native-helper/`. That is safe because
  `Config.swift:320-343` resolves the Python env and the worker from the binary's own ancestors before the cwd.
  `native-helper/QUICKSTART.md:337` gives the same "next time" start. The Offline row's fix points to it.
- **R7: the right-click diagram under "The extension" walked the helper and the fallback too.** Trimming its `.mmd` to
  steps 1-3 would also change `chrome-extension/README.md:333-336`, which embeds the same diagram, and that file is
  not this lane's. So the diagram moves instead, to step 3, "Speak a selection", where the reader asks what a
  right-click does. The embed moved byte for byte, and `diagrams:check` still passes. The extension part is now its
  reach, then its permissions table, straight after the sentence that introduces it (also R35's 43-line reach-back).
- **R6:** the privacy-policy paragraph had no place in the four-part order. It moves into the opening (Session 5
  repair).
- **R8: requirements order.** Now by type, from what you have to what you add: the Mac (chip, macOS, disk, memory) →
  the browser → the build tools (the helper's, then the extension's).
- **R9: Development's commands ran build → test → gate → re-render**, which puts a check before the thing it checks.
  Now build → test → re-render → gate.

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

**Session 10 round 1 repair** (F11 structural; F9, F15, F17, F21, F42 editorial). KL1 was missing from the table
above, so no session checked its summary, and the draft wrote specs under the label. Rows added or restated:

| Node | Before (as drafted) | After |
|---|---|---|
| KL1 | "Kokoro-82M … reads in any of 28 English voices … at 0.5× to 2× speed" (specs) | It sounds like a person reading, not a machine, in any of 28 voices, and plays about as loud as your Mac's own voices |
| KL2 (Key Line bullet) | "Your selection goes only to a small helper app on 127.0.0.1 …" (a route) | Nothing you select leaves your Mac: it goes only to a helper on this Mac (127.0.0.1), or to your Mac's own voices |
| KL3 | "20 to 25 times faster … less about 7% …" (a correction) | the Key Line's own figures, plus the one other wait, start-up (3 to 4 s). Memory moves out (Session 5 repair) |
| Install (action) | "two parts … the helper first" (structure, not effect) | install the helper, then the extension, and Chrome reads your selections in Kokoro voices |
| Troubleshooting | "the pill names the state" (covered half the section) | the pill, the toolbar icon or a notice says why, and each has one fix; two commands check the helper itself |
| Key Line support H2 (new) | — | each of the three claims rests on something you can hear, read or run yourself |
| Development | "one gate checks the whole tree" (covered half) | scripts on your Mac can call the helper directly, and one gate checks every change |

Universal interrogation re-run for the changed parents only: each now names every child below it and no other.

**Session 10 round 2 repair** (R25 structural; R2, R3, R11, R13, R16, R21, R22, R29 editorial). The round-1 claim just
above ("each now names every child below it and no other") was false for KL1: the speed range stayed in the section
after it left the summary (R13). Rows restated:

| Node | Round 1 | Round 2 |
|---|---|---|
| KL3 | the Key Line's figures plus a caveat ("the sound starts once the whole selection is ready"), with no judgment | **It makes speech about 20 times faster than it plays**: a sentence in under half a second, a 400-word page in 7 to 8 seconds. The judgment is a comparison with listening time. The caveat goes one level down, as the mechanism behind "the wait grows with what you select" |
| KL1 (Key Line) | "…and plays about as loud as your Mac's own voices" (R29: no reason at that level) | the one judgment, in 28 voices. Loudness goes one level down |
| KL1 (section opening) | a pointer to the recording; the idea only in the heading (R13, R27) | sounds like a person reading, not a machine, in any of 28 voices, and the helper brings its volume nearer your Mac's own: one clause per child. "About as loud" is gone. Its boundary with "noticeably quieter" was 2 LU, and nothing on the page supported that line (R11); the numbers now carry the comparison |
| Private (opening) | "check the extension, the helper and its engine on your Mac, and the fallback in its code" | the helper and its engine on your Mac; the extension and the fallback in their code; the policy traces each statement to that code |
| Install | the effect of steps 1-3 only (R21) | the effect, free and open source, the one not-yet statement, and the update in place |
| Fixing | "when Chrome doesn't read in a Kokoro voice … each has one fix". Three of five pill rows are not failures, and the red "!" named no fix (R2, R22) | the pill always shows one of five states and each says what to do, if anything; the icon marks what happened to speech started without the popup; a notice flags an old helper; two commands ask the helper itself. The red "!" row now names its fix: the tooltip gives the reason and what to do (`error-badge.ts:37-44`; `helper-errors.ts:117-125`, e.g. "Select less text") |
| List lead-ins (R3) | "You need:", "The toolbar icon and the popup's update notice:", "The two commands:", "How the numbers were taken:" | "You need an Apple silicon Mac, a Chromium browser, and the tools that build both parts"; "The icon's two marks and the popup's notice each come with their fix"; "The helper answers two questions itself"; "Every figure comes from one M1 Max, in two runs a day apart" |

Universal interrogation re-run for these parents only: each names every child below it and no other. Checked by
listing each section's children against its opening sentence.

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

**Session 10 round 1 repair** (F12, F24 structural; the editorial findings this session owns are dispositioned in the
Session 10 entry). The page map above stays as the record; this one replaces it.

| Pyramid node | On the page |
|---|---|
| G and its limit | the `<h1>` and the bold promise line; after the Key Line, the **Runs on** paragraph (eligibility and today's install path) |
| Key Line | three bold-led bullets, each linking to its own H3 |
| KL1's exhibit | the hero, straight after the Runs on paragraph. Caption "Click to watch with sound", true for a linked preview; the embed script replaces the block later |
| Next Steps | `## Install`: requirements as a list; `### 1.` to `### 3.`; then the upkeep pair, `### Updating a helper installed from source` and `### Fixing what the popup or the toolbar icon reports` |
| Key Line support | `## Why it's natural, private and fast`, then `### Natural: …`, `### Private: …`, `### Fast: …` |
| Reference | `## Development` (`### Calling the helper from a script`, `### Changing the code`) · `## License` |

**Headings précis (F24).** Install (install the helper, add the extension, speak a selection; updating, fixing) →
why it's natural, private and fast (natural: a person reading, as loud as your Mac's voices; private: nothing you
select leaves your Mac; fast: a sentence in under half a second) → development → license. The argument now reads off
the headings. Two H2s stay bare: `## Install`, fixed by `release.sh:405`, and `## License`, a convention. Development
is reference outside the pyramid (Session 3) and keeps the label readers look for.

**KL3 figures (F12, F39).** The Key Line's "about 0.4 seconds" and "about 7 to 8 seconds" now appear in the Fast
opening and in the table's last column. The table shows the sum: measured wait plus the loudness step's share.
Sources: `bench/results.json` `warm[]` (busy), W2 §3 (quiet), W2 §10 and `bench/README.md:45-46` (the step costs about
0.3% of the audio's length, about 7% of the wait). Sentence 0.34-0.39 + 0.03 → 0.37-0.42 s; paragraph 1.11-1.24 +
0.09 → 1.2-1.3 s; page 6.47-7.75 + 0.5 → 7.0-8.3 s; long article 12.2-14.8 + 1 → 13-16 s. The "6.5 to 8 s" in
Sessions 3 and 8 predates the step and is superseded by this line.

**Session 10 round 2 repair** (R23 structural; R4, R14, R17, R18, R27, R28, R30-R37, R44-R48 editorial, dispositioned
in the Session 10 — round 2 entry). The page map, replacing round 1's:

| Pyramid node | On the page |
|---|---|
| G and its limit | the `<h1>`, the bold promise line, the badges, then the **Runs on** paragraph, whose two bold leads are the limit ("Runs on an Apple silicon Mac", "Today you build it from source") |
| Key Line | three bullets whose bold leads are the three H3 headings word for word, each ending in a parallel imperative link: "Hear it", "Check it", "Measure it" (R34) |
| KL1's exhibit | the hero, straight after the Key Line (R14: the Runs on paragraph no longer sits between the claim and its recording). Caption "Click to watch with sound", true for a linked preview; the sub-caption names Heart, the default voice, so it ties back to Natural. The `<!-- hero-video -->` block keeps its shape for `embed-hero-video.sh` |
| Next Steps | `## Install`: opening, requirements, `### 1.` to `### 3.` (the right-click diagram in step 3), `### Updating a helper installed from source` |
| Reference (use) | `## Fixing what the popup, the icon or the helper reports`, covering the three kinds its opening names (R36) |
| Key Line support | `## You can check each claim yourself` (an idea; R4), then `### Natural: …`, `### Private: …`, `### Fast: …` |
| Reference | `## Development` (`### Calling the helper from a script`, which now carries the absolute level; `### Changing the code`) · `## License` |

**Headings précis.** Install (1. install the helper · 2. add the extension · 3. speak a selection · updating a helper
installed from source) → fixing what the popup, the icon or the helper reports → you can check each claim yourself
(natural: it sounds like a person reading, not a machine · private: nothing you select leaves your Mac · fast: it
makes speech about 20 times faster than it plays) → development (calling the helper from a script · changing the
code) → license. The three argument H3s are now parallel ("Label: full clause", R28), and each claims no more than
its section (R18, R28).

**30-second test on the artifact (R23).** Measured as the finding measured it: `wc -w` on README lines 5-26 (title,
promise, badges, Runs on, Key Line), tags stripped, link text kept. **153 words**, about 38 s at 240 wpm, down from
199 (about 50 s). The title, the promise and the bold leads alone: **62 words**, about 16 s. The bold leads now carry
the ideas (the limit, then three reasons), not category labels. The full read is still about 8 s over. That residual
is the limit that R24, R38 and the lead's first-screen ruling require (about 40 words). It is logged in the variance
log. Trimmed to get here: the lead's own "14.5+ / 148+" notation, shorter parallel links ("Hear it", "Check it",
"Measure it") and a tighter Private support clause.

## Session 10 — round 1

**Input.** The critique panel's 48 findings over the frozen draft (`eb969da` plus the loudness lines of `142fd52`):
`.claude-plans/readme-s10-round1.json`, 11 structural and 37 editorial, each naming its owning session. Round 1 of
at most 2. The structural findings were repaired once, in their owning sessions above (look for "Session 10 round 1
repair" under Sessions 3, 5, 6, 7 and 9). The README was then redrafted from the repaired pyramid, and the editorial
findings were applied to that draft. Binding lead rulings for this round: install leads with what works today; the
eligibility gate and a gloss of `127.0.0.1` as "this Mac" go on the first screen; the hero caption must be true for a
linked silent preview; loudness belongs to Natural, in plain words, with the numbers one level down.

**One lead ruling is carried in part, and why.** The ruling says loudness "evens out level across voices and against
the system voices". The second half is measured (0-5 LU from the system voice, down from 7-12). The first half is
refuted by the same measurements: across five voices the spread grows from 3.9 to 7.6 LU on long texts (W2 §10
table; the numbers are in the Session 3 repair). The README therefore says Kokoro "now plays about as loud as your
Mac's own voices", and says nothing about voices matching each other.

**Dispositions** (A applied · P partly applied · R rejected, with the reason):

| # | Sev. | Session | Disposition |
|---|---|---|---|
| F1 | S | 6 | A: from source first, Homebrew "once v1.5.0 is released"; the extension built and loaded unpacked, then the zip, then the store; the Offline fixes follow the same order |
| F2 | S | 3 | A: KL1 has its own section (voices loop, speeds, level) and the Key Line links to it |
| F3 | S | 6 | A: four H2s in three groups: use it (Install, with fixing inside it), trust it (one H2 over the three claims), build on it (Development), then License |
| F4 | S | 6 | A: two groupings, the conditions of the measurement and the waits |
| F5 | E | 6 | A: the loudness sentence left the one-hop paragraph and moved to Natural |
| F6 | E | 6 | R as worded: putting the update H3 between steps 2 and 3 would push an existing user's task into a new user's sequence, and that H3 is a deep-link target in its own right. Its time-order point is met at step 1, with a pointer: "If you already run a helper from before 1.5, update it instead" |
| F7 | E | 6 | A: the fixing section introduces three kinds: pill states, icon badges plus the update notice, and two commands |
| F8 | E | 6 | A: one order everywhere, the gate's; the API and the gate are separate H3s; the "More" links are announced in the opening |
| F9 | E | 7 | A: Install opens on the effect, in the steps' own order |
| F10 | E | 9 | P: the argument headings now carry ideas. `## Install` (contract), `## License` (convention) and `## Development` (reference, Session 3) stay labels. The four `<summary>Interactive Diagram</summary>` stay: the beautiful-mermaid-docs skill fixes that label by operator ruling ("Keep the `<summary>` to exactly 'Interactive Diagram'"), and the sentence before each picture states what it shows |
| F11 | S | 7 | A: KL1 states the judgment ("sounds like a person reading, not a machine"); the specs moved one level down |
| F12 | S | 9 | A: the Fast opening repeats the Key Line figures, and the table's last two columns show how they are reached |
| F13 | S | 5 | A: with F4 |
| F14 | E | 5 | A: with F5 |
| F15 | E | 9 | A: memory moved to Install's requirements; start-up is named in Fast's opening |
| F16 | E | 5 | A: the fallback's check is its code, `isLocalSpeechVoice`, linked; the opening says which check each place has |
| F17 | E | 7 | A: the opening names the pill, the icon and the notice, plus the two commands |
| F18 | E | 5 | A: the API has its own H3, announced by Development's first sentence |
| F19 | E | 9 | A: "cannot make it speak or list voices" (`HTTPServer.swift:158-176`; `/health` is open) |
| F20 | E | 9 | A: "The texts" bullet puts 12.9× for a 2.5-second line beside the chart's 15-to-751-word texts |
| F21 | E | 9 | A: with F9 |
| F22 | E | 9 | A: the voices loop moved from step 3 to Natural |
| F23 | S | 3 | A: the **Runs on** paragraph on the first screen: the eligibility gate and today's install path |
| F24 | S | 9 | A: précis in the Session 9 repair |
| F25 | E | 9 | P: the H3s form two parallel runs, three numbered imperatives and then two gerunds (the updating heading is fixed, and "Fixing …" matches it). The H2s cannot all be parallel: `## Install` is fixed by `release.sh:405` |
| F26 | E | 9 | A: the first sentence of the updating section and the first sentence of Development each carry the turn |
| F27 | E | 9 | A: with F12; the Fast opening states the wait first |
| F28 | E | 9 | A: the old boundary is gone. The evidence H2 opens by referring back ("the three claims at the top"), and Development opens on its own summary |
| F29 | E | 9 | A: with F18 |
| F30 | E | 9 | A: the picture comes first ("you don't reach for the volume"), then the numbers, with LU and dBTP glossed |
| F31 | E | 9 | A: no derived multiples in prose; the table does the sum; one percentage left, with one base |
| F32 | E | 9 | A: the requirements are a list |
| F33 | E | 9 | A: "another app, the iOS Simulator" |
| F34 | E | 9 | A: two destinations, two sentences; `127.0.0.1` glossed as "this Mac" |
| F35 | S | 3 | A: with F23 |
| F36 | S | 3 | A: the loudness node now exists, under KL1 (Session 3 repair); Session 0's constraint 7 is annotated as superseded |
| F37 | E | 9 | A: every not-yet path reads "once v1.5.0 is released" and links to Releases. "helper 1.5.0" in the hero caption stays: it is the version string of the helper that made the recording, true whether or not the tag exists |
| F38 | E | 7 | A: step 1 says what a restart does to a helper built from source |
| F39 | E | 9 | A: with F12; the "6.5 to 8 s" in Sessions 3 and 8 is marked superseded |
| F40 | E | 9 | A: "the loudness step" is glossed where Fast uses it |
| F41 | E | 9 | P: KL1 now states the idea. Hearing it on the first screen needs the playable hero, which `embed-hero-video.sh` provides when the operator runs it (lead ruling: until then, the linked preview) |
| F42 | E | 9 | A: with F34 |
| F43 | E | 6 | A: 5,000 characters (about 750 words) and what happens past it, in step 3; the long-article row is tied to the limit |
| F44 | E | 6 | A: "One Mac" bullet: no other chip was measured; the benchmark measures yours |
| F45 | E | 9 | A: the requirements name Chromium browsers (`INSTALL.md:19-20`) |
| F46 | E | 9 | A: "Click to watch with sound", and the sub-caption says the picture is a silent preview that opens the MP4 |
| F47 | E | 9 | A: `lsof -nP -iTCP:8249 -sTCP:LISTEN` gives the PID, then `kill` it or press Ctrl-C (`native-helper/QUICKSTART.md:313-318`) |
| F48 | E | 9 | A: with F33 |

Tally: 44 applied, 3 partly applied, 1 rejected.

**Session 8 gates re-run, only the ones these repairs touch.**

| Gate | Evidence |
|---|---|
| A · summaries | KL1, KL3, Install, fixing, the evidence H2 and Development each state what is below them (Session 7 repair table) |
| E · logic | KL3's single mixed list is now two inductive groupings, each with its plural noun (Session 5 repair) |
| F · order | install paths by *works today*; H2s use → trust → build; Fast's conditions machine → runs → texts → step; the gate's order in Development (Session 6 repair) |
| G · MECE | Fast: conditions and waits do not overlap, and memory went to requirements. Fixing: every signal the extension shows is one of the three kinds |
| I · 30 seconds | The top zone is about 190 words (it was about 109; the growth is the Runs on limit F23 and F35 asked for). Read by its bold leads, it tells a cold reader what this does, why it is natural, private and fast, whether his Mac qualifies, and what installing takes today. He can stop there and act |

Worklog lint (`scripts/pyramid-worklog-lint.sh`) is not on this machine, so rules 1 and 4 were checked by hand:
Session 0 records a bounded input (~21,900 tokens, tier A), and this is round 1 of 2.

**Verification (this round).**

| Check | Result |
|---|---|
| `bun run diagrams:check` | exit 0, "all 8 SVGs and mermaid fences up to date"; no `.mmd` edited |
| links, images and `#anchors` (`/tmp/ntts-s10r1/check-links.py`, GitHub slug rules, anchors into other `.md` files included) | 56 checked, 0 broken; the heading ids GitHub's renderer emits match the three Key Line links |
| contract lines | `## Install` ×1, `### Updating a helper installed from source` ×1, `<!-- hero-video -->` ×1 on its own line and directly above the hero `<p>`; no `WebGPU`, `Phase 0`, `IN PROGRESS` or old product name |
| `bash scripts/verify-all.sh docs` | PASS, 8 of 8 |
| render: `gh api markdown -f mode=markdown …`, github-markdown-css 5.8.1 at 1012 px, Chrome for Testing (chromium-1243), light and dark | looked at the whole page in both modes. In `mode=markdown` output the API wraps each `<picture>`'s `<img>` in an `<a>`, so the dark `<source>` is skipped in a local render. Unwrapped, the dark page picks all four dark SVGs; `mode=gfm` does not wrap. The `<picture>` markup is byte-identical to the committed draft's |
| CI badge | still broken locally: `ci.yml` is not on `origin/main` yet (Session 9) |

## Session 10 — round 2

**Input.** The critique panel's round-2 findings over the round-1 README (`54f8d43`), 49 in all: 11 structural and 38
editorial. They are numbered R1-R49 here in the order the panel returned them. This is round 2 of 2, the last. The
structural findings were repaired once, in their owning sessions (look for "Session 10 round 2 repair" under Sessions
3, 5, 6, 7 and 9). The README was then redrafted from the repaired pyramid, and the editorial findings were applied to
that draft. A structural defect still standing after this round is logged in the variance log, not looped.

**Lead rulings for this round, and how each was carried.**

- Install leads with what works today, and the not-yet paths say so plainly, never in a future-as-present tense:
  carried. "From source, today" comes first in steps 1 and 2. Homebrew and the zip are "once v1.5.0 is released",
  worded in the future tense ("will build", "will start", "You will not need Bun"). The store is "will follow".
- The eligibility gate on the first screen, with `127.0.0.1` glossed as "this Mac": carried. It is now straight under
  the promise line and adds today's install cost (R24, R38). The gloss is in the Private bullet.
- The hero, before the embed: carried. The silent preview is linked to `assets/media/hero.mp4`, captioned "Click to
  watch with sound". The marker line, the linked `<p>` and the caption `<p>` keep round 1's shape for
  `embed-hero-video.sh`, which does not exist yet in this tree.
- Loudness where it belongs to Natural, in plain words, with the precision one level down: carried, **in part, for
  the round-1 reason, still true.** It sits under Natural as a fact about how it sounds, in plain words ("the volume
  changes much less" when Chrome switches to a system voice and back). The numbers move out of the Key Line. The
  absolute level (−16 LUFS target, −1.5 dBTP cap, about −16 to −21 LUFS, −25 at worst) goes to the API paragraph
  under Development, where a script receives the WAV. "Evens out level across voices" is not carried: W2 §10's first
  table puts the spread across its five voices at 2.4 / 3.5 / 7.6 LU normalized, against 3.8 / 3.9 / 3.9 LU raw. For
  long texts the spread grows. Only the comparison with the system voice is stated.
- Every figure traceable to a committed source: see the table below.

**Dispositions** (A applied · P partly applied · R rejected, with the reason):

| # | Sev. | Session | Finding, in brief | Disposition |
|---|---|---|---|---|
| R1 | S | 6 | Fast: conditions and waits interleaved | A: waits (table, start-up), then conditions, then measure yours (Session 6 repair) |
| R2 | E | 7 | Fixing opening sets a failure class; the table is a state machine | A: the opening now describes all five states ("each tells you what to do, if anything") |
| R3 | E | 7 | Blank lead-ins: "You need", "Two commands", "The two commands", "The toolbar icon and…", "How the numbers were taken" | A: each is a point now (Session 7 repair table) |
| R4 | E | 9 | "Why it's natural, private and fast" is a topic heading | A: `## You can check each claim yourself`, whose opening names what you hear, check and measure |
| R5 | E | 9 | The Private bullet's fallback clause lacks "local only" | A: "your Mac's own on-device voices" |
| R6 | E | 6 | The privacy-policy paragraph is a fifth item | A: moved into the Private opening |
| R7 | E | 6 | The right-click diagram under "The extension" walks the whole path | A: moved to step 3. The `.mmd` is shared with `chrome-extension/README.md:333-336`, so it was moved, not trimmed |
| R8 | E | 6 | Requirements in no order | A: the Mac → the browser → the build tools |
| R9 | E | 6 | Re-render listed after the gate that checks it | A: build → test → re-render → gate |
| R10 | S | 5 | Natural induction holds a misfit (loudness) | A: KL1 support is "facts about how it sounds"; speed leaves (Session 5 repair) |
| R11 | E | 7 | "About as loud" vs "noticeably quieter": 2 LU apart | A: both verdicts gone; the numbers carry the comparison ("7 to 12 LU quieter", "0 to 5 LU quieter") |
| R12 | E | 5 | The loudness paragraph is a mixed argument ending on an unrelated absolute range | A: one chain (raw gap → turned up as far as the peak allows → smaller gap → the switch changes volume much less); the absolute range moves to the API paragraph |
| R13 | E | 7 | Natural never states its point; speed dangles | A: the first sentence states the point with one clause per child; speed moves to step 3 |
| R14 | E | 9 | Runs on raises "how do I install?", the hero answers something else | A: Runs on moves above the Key Line, so the hero follows the claims it proves |
| R15 | E | 5 | The extension's "on-Mac" check is its code | A: the opening puts the extension's check in its code, beside the fallback's |
| R16 | E | 7 | 403 and the log are not ways the text leaves | A: 403 stays only under Development; the log fact leaves (it is in `PRIVACY.md`, now linked from the opening) |
| R17 | E | 9 | The chart is orphaned; its metric is never introduced | A: the opening states the multiple; the chart's lead-in states its message (21.6 to 23.3 at every length, before the loudness step) |
| R18 | E | 9 | The Fast heading claims only the best row | A: "Fast: it makes speech about 20 times faster than it plays", which holds at every length |
| R19 | E | 5 | The conditions carry results | A: with R1; the 12.9× line and the 7% bullet left |
| R20 | E | 9 | "How do I measure mine?" is deferred behind start-up | A: with R1; "No other Mac was measured. To measure yours…" follows the conditions directly |
| R21 | E | 7 | The Install opening covers only steps 1-3 | A: Fixing left Install (R26); the opening now covers the update too |
| R22 | E | 7 | The Fixing opening overclaims ("each has one fix"; the red "!" has none) | A: with R2; the red "!" row gives its fix: the tooltip names the reason and what to do |
| R23 | S | 9 | The 30-second test fails: 199 words, label-only bold leads | P: bold leads now carry the ideas (62 words, about 16 s); the full read is 153 words, about 38 s. Residual in the variance log |
| R24 | S | 3 | The first screen hides what installing takes | A: "Today you build it from source in Terminal, with Homebrew, Xcode's Command Line Tools and Bun, then load it in Chrome's Developer mode" |
| R25 | S | 7 | KL3 is figures and a caveat, not a judgment | A: "it makes speech about 20 times faster than it plays" (Session 7 repair) |
| R26 | S | 6 | In the headings, fixing reads as an install step | A: `## Fixing what the popup, the icon or the helper reports`, its own H2 after Install |
| R27 | E | 9 | The Natural heading does the text's job | A: with R13 |
| R28 | E | 9 | The argument H3s are not parallel; two overclaim | A: all three read "Label: full clause"; none claims more than its section |
| R29 | E | 7 | KL1's loudness sentence gives no reason at the Key Line | A: removed from the Key Line (R10) |
| R30 | E | 9 | The loudness paragraph fails the image test | A: rewritten around one picture (the switch changes volume much less); LU glossed once; LUFS only under Development, with a gloss ("count down from a file's maximum, so −16 is the louder end") |
| R31 | E | 9 | Fast splits the waits and restates start-up | A: with R1; start-up is stated once, as the one wait that does not grow |
| R32 | E | 9 | "A much shorter line runs at a lower multiple" contradicts its figure | A: the sentence left Fast |
| R33 | E | 9 | The updating opening gives no picture; its precondition follows the command | A: "Homebrew starts at 1.5, so a helper older than that was built from source" (CHANGELOG 1.5.0 "Homebrew install (OD-1)"); the "stop it first" step now precedes the command |
| R34 | E | 9 | The Key Line links are not parallel | A: "Hear it", "Check it", "Measure it" |
| R35 | E | 9 | Bold-led lists break parallel form; a 43-line reach-back | A: conditions all "**The …:**"; the commands are two questions; the four Private places are bold-led by place; the permissions table follows its sentence directly |
| R36 | E | 9 | The Fixing heading covers two of three kinds | A: "…the popup, the icon or the helper reports" |
| R37 | E | 9 | "makes the voice offline" parses as "disables it" | A: "makes the speech without going online" |
| R38 | S | 3 | The first screen shows install as one script | A: with R24 |
| R39 | S | 6 | After every restart a from-source install falls back, and the only start is the full script | A: a no-rebuild start line in step 1; the Offline row points to it (Session 6 repair) |
| R40 | S | 3 | Next Steps hold actions the reader cannot take today | P: no code block for a not-yet path; one future-tense sentence each; the one not-yet statement is in Install's opening. Not a single separate note: the lead ruled Homebrew second inside step 1 and the zip second inside step 2 |
| R41 | S | 3 | KL1 joins an unrelated assertion (loudness) | A: with R10 |
| R42 | S | 3 | "Fast" from the best case, with no comparison | A: the comparison is listening time, the only one the committed data supports; none is claimed against macOS or cloud voices, which no governing document measures |
| R43 | E | 5 | The extension has no on-Mac procedure; Load unpacked shows no install warning | A: with R15; the warning row no longer implies the reader sees it at install ("the one permission Chrome warns about", `verify-all.sh:29`) |
| R44 | E | 9 | Garden path, "makes the voice offline" | A: with R37 |
| R45 | E | 9 | "148" reads as the browser's own version | A: "another browser on Chromium 148+"; the requirement adds "the engine's version, which can differ from the browser's own number" |
| R46 | E | 9 | Does 1.5 exist? | A: Install's opening: building from source "gives you version 1.5.0, the one this page describes. Its release … is not out yet" |
| R47 | E | 9 | 0.38 s in the chart, 0.39 s in the "(the chart)" column | A: the column now shows the chart's own figures, time to first audio: 0.38 / 1.2 / 7.7 / 14.8 s (`bench/results.json` `warm[].ttfb_s` medians 0.3844 / 1.2354 / 7.7411 / 14.8233) |
| R48 | E | 9 | "Free" dropped between pyramid and page | A: "Both parts are free and open source" (Install); "free and MIT-licensed" (License) |
| R49 | E | 3 | Loudness framed as a before-and-after change | A: with R12; stated as the present mechanism (raw output vs what the helper sends) |

Tally: 47 applied, 2 partly applied (R23, R40), 0 rejected.

**New or moved figures, each to its committed source.**

| Claim | Source |
|---|---|
| about 20 times faster than it plays; 21.6 to 23.3 in the chart | `bench/results.json` `warm[].rtf` medians 21.55-23.29; W2 §3 26.2-26.6×; less 7-8% for the loudness step (`bench/README.md` "The committed result"; W2 §10 "Cost") |
| a 400-word page is nearly 3 minutes of speech | `bench/results.json` L400 `audio_s` 168.8 s; W2 §3 171.5 s |
| busy column 0.38 / 1.2 / 7.7 / 14.8 s | `bench/results.json` `warm[].ttfb_s` medians; `assets/diagrams/performance.mmd` x-sublabels |
| the loudness step adds about 0.3% of the audio's length | `bench/README.md` "The committed result"; W2 §10 "Cost" |
| raw 7 to 12 LU under the system voice, sent 0 to 5 LU under | W2 §10, second table and the sentence under it |
| 13 of 15 cases stop at the peak cap; about −16 to −21 LUFS, −25 at worst | W2 §10, first table; `native-helper/README.md:260-262` |
| the no-rebuild start line; ready 3 to 4 s later | `quickstart.sh:390-391`; `Config.swift:320-343`; `native-helper/QUICKSTART.md:105-109, 337` |
| the red "!" tooltip gives the reason and what to do | `chrome-extension/src/shared/error-badge.ts:37-44`; `helper-errors.ts:117-125` |
| Homebrew starts at 1.5 | CHANGELOG 1.5.0 "Homebrew install (OD-1)" and "The tap is not published yet" |
| the one permission Chrome warns about | `scripts/verify-all.sh:29` `EXPECTED_WARNINGS` |
| on-device voices only | `chrome-extension/src/shared/system-voice.ts:94-107` (`remote !== true`, no `extensionId`) |

**Input read this round**, beyond Session 0's body: `quickstart.sh` steps 3-5, `Config.swift` `PathResolver`,
`error-badge.ts`, `helper-errors.ts` messages, `system-voice.ts:90-110`, W2 §2, §3 and §10, `bench/README.md` to "What
it measures". About 6,500 words, about 9,100 tokens. The run stays in tier A (Session 0's ~21,900 plus this is under
30K).

**Session 8 gates re-run, only the ones these repairs touch.**

| Gate | Evidence |
|---|---|
| A · summaries | KL1, KL3, Install, Fixing, Private and the evidence H2 each state what is below them and no more (Session 7 round 2 table) |
| E · logic | KL1 support is one inductive grouping ("how it sounds"); KL3's conditions hold only conditions; Private's places hold only places (Session 5 round 2) |
| F · order | the top zone runs G → limit → reasons → exhibit → act; Fast runs multiple → waits → conditions → measure yours; H2s run Install → Fixing → evidence → Development → License; Development's commands run cause before check (Session 6 round 2) |
| G · MECE | the right-click diagram no longer overlaps the helper and fallback parts; conditions and waits do not share an item; Fixing's opening names the pill, the icon, the notice and the helper, which are exactly its three lists |
| I · 30 seconds | the bold-lead read gives G, the limit and three reasons in 62 words, about 16 s; the full top zone is 153 words, about 38 s (Session 9 round 2) |

**Verification (this round).** Nothing was published, pushed, or started on a port.

| Check | Result |
|---|---|
| `bun run diagrams:check` | exit 0, "all 8 SVGs and mermaid fences up to date"; no `.mmd` edited; the moved right-click embed is byte-identical |
| links, images and `#anchors` (`/tmp/ntts-s10r2/check-links.py`, GitHub slug rules, anchors into other `.md` files included) | 58 checked, 0 broken |
| heading ids from GitHub's own renderer (`gh api markdown`) | `user-content-` ids exist for all three Key Line targets, `install` and `updating-a-helper-installed-from-source` |
| contract lines | `## Install` ×1, `### Updating a helper installed from source` ×1, `<!-- hero-video -->` ×1, alone on its line and directly above the hero `<p>`; no `WebGPU`, `Phase 0`, `IN PROGRESS` or old product name |
| no inbound link broken by the renamed headings | `git grep` for `README.md#` and the repo URL with `#`: only `#install` and `#updating-a-helper-installed-from-source` are linked from code (popup, `helper-version.ts`, tests), and both are unchanged |
| `bash scripts/verify-all.sh docs` | PASS, 8 of 8 |
| render: `gh api markdown -f mode=markdown …`, github-markdown-css 5.8.1 at 1012 px, Chrome for Testing (chromium-1243) headless, light and dark, the `<picture>` images unwrapped from the API's `<a>` (round 1's finding) | looked at every slice of both modes, 12.5K px each. Every local image loads; the dark page picks all four dark SVGs; the first 900 px show the eligibility gate, today's install cost and all three reasons |
| the no-rebuild start line | **not run.** Port 8249 is held by the v1.4 helper (pid 31790), and a default-port run writes `config.json`, which this environment forbids. Checked by reading: it is `quickstart.sh`'s own tmux line, and `Config.swift:320-343` resolves the env and worker from the binary's location, so the repo-root cwd works |
| CI badge | still broken locally: `.github/workflows/ci.yml` is in `HEAD` but not on `origin/main` |

Worklog lint (`scripts/pyramid-worklog-lint.sh`) is still not on this machine. Rules 1 and 4 checked by hand: Session
0 records a bounded input (tier A, still under 30K tokens with this round's reads), and this is round 2 of 2.

**Closure.** Passes 1-3 were re-run over the round-2 draft for every finding above, with the evidence in the tables.
The deliverable is `README.md` at the repository root. **Verdict.** Yes, with two logged residuals. The first screen
tells the reader what he doesn't know, in answer to his one question, and he can act on it. The bold-lead read takes
about 16 s; the full top zone takes about 38 s, and the limit it now has to carry is why.

## Variance log

- **Hero before or after the Key Line.** The R08 skeleton puts the hero first; the pyramid puts the three bullets
  first so the 30-second test passes without pressing play. One rework, no loop.
- **Install before the evidence** (Session 4): a deliberate, justified departure from Minto's Next-Steps-last.
- **Rework rounds: 1** (Sessions 5 and 9 each fixed one defect in place: the KL2 misfit, the 403 wording). Well under
  the cap of 2. The critique panel (Session 10) is the orchestrator's.
- **Session 10, round 1 of 2.** 48 findings. The 11 structural ones were repaired in their owning sessions: 3 (limit
  on G, the KL1 section, the loudness node), 5 (KL3's two groupings), 6 (install order, four H2s in three groups),
  7 (KL1's summary) and 9 (page map, Key Line figures). Editorial: 44 applied in all, 3 partly, 1 rejected (F6).
- **Residual risks, accepted.** `## Development` stays a label (reference, and what readers search for). The hero
  stays silent until the operator runs `embed-hero-video.sh`. The CI badge stays broken until `ci.yml` is on `main`.
  Loudness is claimed against the system voice only; across voices the measurements do not support it. The top zone
  grew to about 190 words to carry the eligibility limit.
- **Session 10, round 2 of 2 (the last).** 49 findings. The 11 structural ones were repaired once, in their owning
  sessions: 3 (the limit now carries the install cost; KL1 back to one judgment; KL3's comparison; not-yet paths
  without code blocks), 5 (KL1 support "how it sounds"; Private's places only; Fast's conditions only), 6 (Fast's
  order; Fixing as its own H2; the no-rebuild restart), 7 (KL3's judgment) and 9 (page map, 30-second timing).
  Editorial: 47 applied in all, 2 partly (R23, R40), 0 rejected. No third round runs. Two structural findings stand
  in part after the round, and both are logged here instead of looped:
  - **R23, the 30-second test.** The full top zone is 153 words, about 38 s at 240 wpm, about 8 s over. The bold-lead
    read carries G, the limit and all three reasons in 62 words, about 16 s. The overrun is the limit R24 and R38
    required, and the lead ruled onto the first screen: eligibility plus today's install cost, about 40 words.
    Cutting it would reopen those findings. Accepted.
  - **R40, the not-yet paths.** They sit inside steps 1 and 2 as one future-tense sentence each, with no code block,
    not in one separate note, because the lead ruled that order. Accepted. Once v1.5.0 is released, those sentences
    and Install's opening need a pass to drop "once … is released". That is a doc edit for the release follow-up, not
    a defect in this round.
- **Residual risks, round 2.** The no-rebuild start line was checked by reading, not run: 8249 is held by the v1.4
  helper, and a default-port run writes `config.json`. KL3's "about 20 times" rests on one M1 Max, with the loudness
  step estimated from its measured cost, not re-benchmarked. The next clean `bench/run.mjs` run measures it in.
