# Limiter decision for Natural TTS 1.5.x: synthesis of A–D (2026-09-24)

**Answer.** Ship a combination: move the worker's target from −16 to **−21 LUFS**, add a true-peak limiter **capped
at 3 dB**, and play the Samantha fallback at **`chrome.tts` volume 0.80**. If a blind listen hears the limiter, ship
the same new target without it (option 4a below).

**Conviction: 80%** that this is the right course for 1.5.x. D puts 70 of those points on the limiter version and 10
on the gain-only version. The figure is below 90, so the call is the operator's. Three doubts remain, and no
measurement in A–D can settle them:

- **Loudness preference.** Do you accept a quieter product? −21 on the worker's mono meter plays at about −18, which
  is AES TD1008's level for speech. Short reads get up to 5 dB quieter than in 1.5.0.
- **Audibility.** Nobody has yet done a blind listen to the 3 dB worst case with levels matched inside the excerpt.
- **The fallback volume curve.** It has not been captured live: Samantha at `chrome.tts` volume 1.0 against 0.80.

## Why

1. **The biggest level jump happens inside Kokoro on every read, not at the fallback switch.** The fallback only
   starts when the helper is down. Today one voice swings by up to **8.0 LU** between a short selection and a
   1.3–3 minute article: af_heart goes from −16.8 to −22.9 LUFS, am_michael from −17.6 to −25.6. That is twice the
   ~4 dB shift at which NPR Labs found annoyance sets in.
   - **Why long reads come out quieter.** The worker applies one gain per response, capped by the loudest peak. A
     longer text has more chances of one loud syllable, and that syllable caps the gain for the whole read.
   - **What each option does to it.** Turning down the fallback leaves the swing at 8.0. The recommended combination
     cuts it to **1.7**.
   - Source: D §1; `tools-d/raw-index.json` (`len*`).
2. **−16 is too loud a target for a mono file, and at −21 the limiter barely has to work.**
   - **What the target means as played.** Kokoro plays through `new Audio()` (`chrome-extension/src/offscreen/offscreen.ts:294`).
     Chrome copies a mono stream to both channels at full level (`channel_mixing_matrix.cc:141-144`). Two-channel
     playback then measures 3 LU louder (TD1008 §6). So today's −16 plays at about −13, louder than every speech
     reference in C §1. The new −21 plays at about −18, TD1008's value for speech and for virtual assistants.
   - **How little the limiter does at −21**, across all 28 catalogue voices:
     - 27 of 28 land within 0.5 LU of −21.
     - The median gain reduction is **0.1 dB** and the largest is 3.0 dB.
     - At most **0.9%** of samples sit more than 1 dB down.
   - **A's pick, by contrast.** A's L2-60 limiter at −16 needs 5.1–5.9 dB of reduction for the median voice. It also
     falls short of −16 on articles: −17.0 for af_heart and −19.8 for am_michael.
3. **It is the only option that closes both fallback gaps.**
   - **Why a −16 limiter can't.** American voices fall back to Samantha (−16.4 LUFS) and British voices to Arthur
     (−22.5). `chrome.tts` volume cannot go above 1.0. A limiter that lifts Kokoro to −16 therefore widens the
     British gap to **−5.0 … −6.5 LU**, and nothing on the fallback side can close it.
   - **Why −21 works.** At −21, Arthur is already at Kokoro's level. Only Samantha needs turning down, by **4.8 dB**,
     which is volume 0.80 under B's measured law `Level(v) = Level(1) − 24·(1 − v)`.
   - **Result across 5 voices × 4 lengths.** The largest American jump is **1.9 LU**, and no case exceeds 4 LU.
     Today the largest is 9.6 LU and 6 of 12 cases exceed 4 LU. The British jump is −1.5 … 0.

## Options

Five voices × four lengths: short, medium, 26 s and article. Each jump is the fallback's level minus Kokoro's for
the same text. Rows 1–4b come from `python3 tools-d/jumps_d.py`, re-run for this synthesis; the output matches D
exactly. Row 5 comes from `tools-d/lim_d2.json`.

| Option | Kokoro range, LUFS | Largest same-voice swing | American fallback: largest jump / cases > 4 LU | British fallback jump | Peak reshaping |
|---|---|---|---|---|---|
| 1. No limiter (today: gain only, −16) | −25.6 … −16.0 | 8.0 | 9.6 / 6 of 12 | −5.1 … −1.2 | none |
| 2. Limiter at −16 (A: L2-60, 6 dB cap) | −19.8 … −16.0 | 3.8 | 3.8 / 0 | **−6.5 … −5.0** | ≤ 6 dB |
| 3. Fallback volume only (B: Samantha at 0.89) | −25.6 … −16.0 | 8.0 | 7.0 / 4 | −5.1 … −1.2 | none |
| 4a. Gain only at −21, Samantha at 0.80 | −25.6 … −21.0 | 4.6 | 4.8 / 2 | −1.5 … 0.0 | none |
| **4b. −21 with a ≤ 3 dB limiter, Samantha at 0.80 (recommended)** | **−22.7 … −21.0** | **1.7** | **1.9 / 0** | **−1.5 … 0.0** | ≤ 3 dB; ≤ 0.9% of samples > 1 dB down |
| 5. −19 with a 6 dB cap (L2-60), Samantha at 0.885 (the louder alternative) | −19.4 … −19.0 (catalogue); −20.2 … −19.0 (articles) | not computed | not computed | Arthur 3.2–3.5 LU quiet unless en-GB prefers Daniel | median 2.2 dB on the catalogue, 3.8 dB on articles; max 6 |

**What building 4b involves:**

- **Worker target.** Change `LOUDNESS_TARGET_LUFS` from −16.0 to −21.0 (`tts_worker.py:117`). The −1.5 dBTP
  ceiling stays.
- **When the limiter runs.** Only when one gain, capped by the peak ceiling, cannot reach −21. The loud part of the
  gain is capped at `ceiling + 3 − raw true peak`, so the limiter never reduces a peak by more than 3 dB. The
  construction is A's `tools/lim.py`: a 4× true-peak envelope, a 5 ms lookahead equal to the attack, and a 60 ms
  release.
- **Latency must be measured before shipping.** D's offline code takes up to 3.75 s per article, where synthesis
  takes 7–8 s. A product version has to cost a small fraction of synthesis time. If it cannot, ship 4a.
- **Fallback volume.** Add `volume`, keyed `{ Samantha: 0.80 }` and 1.0 for every other voice
  (`chrome-extension/src/shared/system-voice.ts:137/145/147`). Update the three assertions at
  `tests/system-voice.test.ts:123, 132, 145` (B §5).
- **Verification.** `verify_loudness.py`'s single-gain check must allow up to 3 dB of limiting. The product claim
  becomes: "at most 3 dB off the loudest syllables, on at most 1% of the audio".

## What would change the call

- **You want Kokoro as loud as other apps.** Choose option 5 (−19).
- **A blind listen with level-matched excerpts hears 3 dB of limiting on am_michael.** Ship 4a.
  - A's `ab/03` excerpt carries 6 dB of limiting, so it is an upper bound: if it passes, 3 dB passes too.
  - It is not a blind test yet. Within the 4 s window its "matched" file is 0.2–0.7 LU quieter than B, and the
    filenames give the answer away (D §2).
- **A live capture shows `chrome.tts` volume scaling amplitude linearly.** Then 0.80 would be only −1.9 dB, and
  the constant becomes about 0.58.
- **The product limiter cannot meet the latency budget.** Ship 4a.
- **Nearly every read is sentence-length.** The length swing then never shows, and option 3 becomes a cheap fix, for
  American voices only.
- **Not tested:** speech rates other than 1.0, Macs whose default voice is neither Samantha nor unset, and
  `chrome.tts` on Windows or Linux.

## Re-derive

From `native-helper/`, with `E=Sources/NaturalTTSHelper/Resources/python-env/bin/python3`:

- **The option table:** `$E ../docs/research/2026-09-upgrade/limiter-decision/tools-d/jumps_d.py`. It reads
  `/tmp/ntts-lim-d/`; regenerate that with the `gen_d.py` and `lim_d*.py` steps in D's Reproduce section.
- **The per-note sources:** A-limiter-measurements.md, B-fallback-volume.md, C-standards.md and D-red-team.md in
  this directory.
