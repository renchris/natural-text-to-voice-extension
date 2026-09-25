# D. Red team: no limiter, limiter, or a quieter fallback (measured 2026-09-24)

## Answer

**Each of the three options fails as specified, and each fails on a measurement that A, B and C never took.** All
three documents calibrated on texts of at most 26 seconds and on 5 of the 28 catalogue voices. They also compared a
mono meter reading with loudness standards written for two-channel playback. Three new measurements change the
decision:

1. **Real reads are long, and long reads are quieter.** On a 1.3–3 minute article, today's gain-only normalization
   puts the default voice (af_heart) at **−22.8 LUFS**, not the −16.8 to −20.6 in W2 §10. am_michael sits at −26.0.
   The louder the loudest syllable, the smaller the gain, and a longer text has more chances of a loud syllable. So
   one voice swings by up to **8.0 LU between a short selection and an article**. That swing happens on every
   read. The fallback switch happens only when the helper is down.
2. **The 5 measured voices are not typical.** Across all 28 catalogue voices on the same 24 s paragraph, the median
   voice lands at −21.1 today. Reaching −16 would need **5.1–5.9 dB** of peak reduction for the median voice, where
   A's "median ~2 dB" figure suggests much less.
3. **−16 LUFS on a mono file plays as −13.** Chrome copies a mono stream to both channels at full level
   (`media/base/channel_mixing_matrix.cc:141-144`, "When up mixing from mono … just do a copy to front LR"), and
   BS.1770 reads that two-channel playback **3 LU louder** (AES TD1008 §6). The worker's −16 target is therefore
   hotter than Apple Podcasts (−16) and Spotify Normal (−14), and 5 LU above TD1008's speech value (−18). The
   mono equivalents are **−19** (Apple) and **−21** (TD1008 speech).

**The option the three missed dominates on every consistency measure, and it is the gentlest processing of any
option.** Aim the worker at **−21 LUFS mono**, add a lookahead limiter **capped at 3 dB** (60 ms release), and key
the Samantha fallback to `chrome.tts` volume **0.80**:

| Option (5 voices × short / medium / 26 s / article) | Kokoro range | Same-voice swing | US fallback \|jump\| max, cases > 4 LU | UK fallback jump | Peak reduction |
|---|---|---|---|---|---|
| 1. No limiter (today) | −25.6 … −16.0 | **8.0 LU** | 9.6, **6/12** | −5.1 … −1.2 | none |
| 2. L2-60 at −16 (A's pick: 6 dB cap, 60 ms release) | −19.8 … −16.0 | 3.8 | 3.8, 0/12 | **−6.5 … −5.0** | ≤ 6 dB; 18% of samples > 1 dB on the worst catalogue voice |
| 3. Samantha at 0.89 (B) | −25.6 … −16.0 | **8.0** | 7.0, 4/12 | −5.1 … −1.2 | none |
| 4a. Target −21 mono, gain only, Samantha 0.80 | −25.6 … −21.0 | 4.6 | 4.8, 2/12 | −1.5 … 0.0 | none |
| **4b. Target −21 mono, ≤ 3 dB limiter, Samantha 0.80** | **−22.7 … −21.0** | **1.7** | **1.9, 0/12** | **−1.5 … 0.0** | **≤ 3 dB; ≤ 0.9% of samples > 1 dB** |

*Jump = fallback minus Kokoro for the same text. Command: `python tools-d/jumps_d.py`.*

**Verdict per option.** Conviction that each option as specified is the right final state:

- No limiter: **10%**.
- A's limiter, L2-60 at −16: **10%**.
- The fallback volume alone: **5%**.
- **4b: 70%.** A further 10% goes to 4a, the gain-only form of the same move, which applies if blind listening
  rejects even 3 dB. So there is **80%** conviction that the retarget beats all three options as specified.

Three checks would lift 4b above 90%. The last one is the operator's to make:

1. A blinded listen to the 3 dB worst case.
2. One live `chrome.tts` capture of Samantha at volume 1.0 against 0.80.
3. Acceptance of a product that plays at TD1008's speech level instead of Samantha's.

## 1. What refutes each option

### Option 1, no limiter

- **Consistency fails on the frequent path.** am_michael runs from −17.6 (2 s) to −25.6 (article). af_heart runs from
  −16.8 to −22.8. NPR Labs puts annoyance onset at about 4 dB (C §3). Moving between a sentence and an article, a
  listener crosses that threshold in the same voice without any fallback involved.
- **Absolute level is less bad than it looks.** At −22.8 mono (−19.8 as played), the default voice sits roughly
  at TD1008's speech target. The quiet voices do not: am_michael, bm_lewis, bm_fable and am_onyx measure −24.1 to
  −26.0 mono, below TD1008's −20 floor even after the 3 LU correction.
- **What would make "wrong" wrong:** if nearly every read is a sentence-length selection, the length swing never
  shows, and "never reshaped" could fairly outweigh a voice-to-voice spread that users choose into.

### Option 2, A's L2-60 limiter at −16 (6 dB cap, 60 ms release)

- **It misses its own target on real reads.** At article length it hits the 6 dB cap and lands at **−17.0 for the
  default voice**, −17.1 for af_bella and −19.8/−20.2 for am_michael (`tools-d/lim_d.json`, `len*`). A's "14 of 15
  reach −16" holds only for texts of 26 s or less.
- **It works hardest across the catalogue.** On the 24 s paragraph the median voice needs 5.9 dB of reduction
  (uncapped L1) and reaches −16 in only 19 of 28 cases. The worst voices spend 18% of their samples more than 1 dB
  down and take up to 54 reductions deeper than 3 dB per minute (`lim_d.json`, `cat-*`).
- **It widens the British gap.** Kokoro rises to −16 while the en-GB fallback, Arthur, stays at −22.2 to −22.5
  mono. `chrome.tts` volume cannot go above 1.0, so the UK jump grows to −5.0 … −6.5 LU (B already flagged this).
- **It aims too loud.** −16 mono plays as −13, louder than every speech reference in C §1. Its only justification
  was matching Samantha. Samantha can be turned down instead, so the target is a free parameter, not a constraint.
- **It costs time.** A's offline implementation takes 2.0–9.2 s per 1.4–3 minute article, against 7–8 s of
  synthesis. Because the worker returns the whole WAV before playback, that time adds directly to the wait.

### Option 3, fallback volume alone (B: Samantha at 0.89; C: about 0.83)

- **It tunes the rare event and leaves the frequent one alone.** The helper is a Homebrew service with `keep_alive
  true` (`packaging/homebrew/Formula/natural-tts.rb:104`). In practice, a mid-session switch from Kokoro to the
  system voice means the 3–4 s startup window or a crash. Most people who hear the fallback have no helper, so they
  never switch, and 0.89 simply makes their only voice 2.6 dB quieter. The same-voice swing of 8.0 LU is untouched.
- **It is calibrated on short texts.** At article length, Samantha at 0.89 (−18.6) is still **4.1–7.0 LU louder**
  than every American voice measured (af_heart +4.2, af_bella +4.1, am_michael +7.0). One volume cannot match a
  Kokoro level that moves 6–8 LU with selection length. B says as much for the W2 matrix.
- **C's constant is mis-specified.** C derives volume ≈ 0.83 for −1.6 dB by assuming linear amplitude. B measured
  `Level(v) = Level(1) − 24·(1 − v)`, and D reproduced it: Samantha at 1.0 / 0.89 / 0.5 reads −16.1 / −18.8 /
  −28.1 LUFS, so −2.7 and −12.0 dB. Under that law 0.83 gives **−4.1 dB, not −1.6**. C's gap table also scores the
  6 British cases against Samantha, but en-GB falls back to Arthur (B §2).
- **What would make "wrong" wrong:** if the operator's only goal is the switch and nearly all reads are shorter than
  a paragraph. B's voice-keyed 0.89 is then a cheap, correct fix for American voices.

## 2. Errors and weak instruments in A, B and C

| Claim | Finding | Evidence |
|---|---|---|
| Meter and gating | **Sound.** The BS.1770-4 gating is correct (−70 absolute, −10 relative, 400 ms blocks at 75% overlap, `tts_worker.py:487-518`), and ffmpeg agrees. D's ffmpeg reads of A's `ab/` files match A's figures. | `ffmpeg -af ebur128=peak=true` on `ab/*.wav` |
| One seed per case | **Robust.** Eight seeds per case vary by at most 0.31 LU after normalization (af_heart and am_michael, medium and 26 s). | `tools-d/gen_d.py seeds`, `raw-index.json` `seed-*` |
| Mono meter against stereo standards | **Wrong frame, in C and in the −16 target itself.** Relative comparisons are unaffected, because both engines play as dual mono. Every comparison with an absolute standard is off by 3 LU. | Chromium `channel_mixing_matrix.cc:141-144`; TD1008 §6, "two-channel reproduction will measure 3 LU higher" |
| A: log-mel L1 "approaches the decoder gate" | **Overstated, and the metric is blind to transients.** Matching on integrated loudness leaves the limited file's untouched frames +0.3 to +1.1 dB above raw. Removing that offset halves L1 (am_michael/medium 0.076 → 0.041; am_michael/long L1-60 0.106 → 0.053). The 85 ms STFT window also cannot see the 5 ms attack, which is the likely artifact. | `tools-d/l1check.py` |
| A: WER unchanged | **Correct, and uninformative.** The transcripts are identical, so there is no difference to read inside the noise. ASR cannot referee this; A says so. | A-limiter-measurements.csv |
| A: "60 ms beats 150 ms on every measure" | **Not shown.** The measures that favour 60 ms (time under reduction, L1) cannot see what a shorter release risks: faster gain modulation on low-pitched voices. 60 ms sits inside common practice (Spotify uses 100 ms), so it is plausible, just unproven. | — |
| A: listening excerpts | **Two biases.** The "matched" files are matched over the whole file, so within the 4 s window they are **0.2–0.7 LU quieter than B**, which biases a listener against the limiter. The filenames also reveal which file is which. | ffmpeg on `ab/`: −21.0 vs −21.6, −20.6 vs −20.8, −24.8 vs −25.5 |
| A: "only a limiter narrows the range" | **Overclaimed.** A lower gain-only target narrows it too. At −21 mono, 14 of A's 15 cases land at exactly −21.0 with no reshaping. | `tools-d/a15_21.py` |
| C: "Kokoro already has a median of −18.0" | **Unrepresentative.** That is the median of 26–243 character texts through the helper. The catalogue median at 24 s is −21.1, and articles run −19.0 to −26.0. | `raw-index.json` `cat-*`, `len*` |
| C: TD1008 citations | **Verified.** Table 1 has speech −18 (+1) and Virtual Assistant −18 (footnote 8). §5 says to keep content above −20. §5C calls upward compression "the preferred approach for raising low level passages". | TD1008 PDF, lines 251–294, 317–323, 414 of `pdftotext -layout` |
| C: "platforms and TTS engines don't limit" | **Category error.** Spotify's gain-only mode normalizes content that was already limited when it was mastered. Here the TTS engine is the only production stage. Samantha's own peak-to-loudness ratio is 14.7 dB on the article; Kokoro's raw ratio is 21.3 dB. | D renders, `vol/sam_long2.caf` |
| B: volume law | **Reproduced offline; the live path is still unmeasured.** 0.89 → −2.7 dB and 0.5 → −12.0 dB through `AVSpeechSynthesizer.write`. | `/tmp/ntts-lim-B/avrender` × 3 volumes |

## 3. What the three missed

1. **Retarget to the mono equivalent of the standard, gain only (4a).** Zero reshaping, and it keeps the product's
   "only the level changes" property. It removes the length swing wherever the voice's peaks allow −21: 14 of A's
   15 cases, 18 of 28 catalogue voices and 4 of 10 articles. The quiet voices stay quiet (am_michael article −25.6).
2. **Retarget plus a 3 dB limiter (4b, recommended).** At −21 the limiter has little to do:
   - **Catalogue:** 27 of 28 voices reach −21 ± 0.5, with a spread of 1.2 LU. The median reduction is 0.1 dB, and
     at most 0.9% of samples sit more than 1 dB down. No reduction goes deeper than 3 dB, and the largest log-mel L1
     is 0.028.
   - **Articles:** 8 of 10 reach −21, with at most 0.2% of samples more than 1 dB down. am_michael reaches
     −22.7/−23.1.
   - **Cost:** offline wall time is 1.5–3.8 s per article. Most responses need no reduction at all, so a product
     version can skip the limiter whenever the gain-only rule already reaches the target.
3. **The Apple-podcast equivalent: −19 mono, 6 dB cap (L2-60 at −19), Samantha 0.885.** This is louder. All 28
   voices reach −19 ± 0.5 (spread 0.4 LU), and so do 8 of 10 articles. The median reduction is 2.2 dB on the
   catalogue and 3.8 dB on articles, with a maximum of 6. Choose this if the operator weighs loudness parity with
   other apps above minimal processing. At −19, Arthur is 3.2–3.5 LU quiet, and preferring Daniel for en-GB fixes
   that: Daniel measures −18.8 to −20.0 (B §3).
4. **Smaller levers, not decision-changing.** Raising the ceiling to −1.0 dBTP, the Apple and AES value, gains 0.5 dB
   for free. Going to −0.5 dBTP gains 1 dB but risks overshoot in the Bluetooth AAC link. Normalizing each mlx-audio
   chunk separately (chunks are ~25 s) lifts articles by 1.5–2.5 LU but adds 1–3 dB steps at chunk joins
   (`lim_d.json` `perchunk`). Upward (parallel) compression, which TD1008 prefers for low passages, was not measured.

## 4. What would make 4b wrong

- **The operator wants Kokoro as loud as other apps.** −21 mono plays at about −18. That is TD1008's speech level, 4
  LU below YouTube and Spotify, and about 4 LU quieter than today's short reads. If loudness parity is the goal, use
  item 3 (−19, deeper limiting) or option 2's territory.
- **Blind listening hears 3 dB on am_michael.** Then ship 4a (gain only). It is still better than today: same-voice
  swing 4.6 against 8.0, and 2 of 12 US cases over 4 LU against 6. A's excerpt `ab/03` carries 6 dB on the same
  voice, so it is an upper bound: if it passes blind, 3 dB passes too. `ab-d/04-*` adds the hero voice on the
  article at L2-60 aimed at −18 (5.0 dB, matched over the 4 s window).
- **The live path diverges from the offline law.** If `speakUtterance` applied volume as linear amplitude, 0.80 would
  be −1.9 dB, not −4.8. One live capture of 1.0 against 0.80 settles it. A relative level through the built-in
  microphone in a quiet room is enough.
- **Users without the helper lose 4.8 dB of Samantha** for no benefit. At −21 mono Samantha still plays at TD1008's
  speech level, and they turn the volume up once. Keying the volume by voice (B §5) leaves other default voices,
  already at −19 to −23, alone.
- **The product claim changes.** "Only the level changes" becomes "at most 3 dB off the loudest syllables, on at most
  1% of the audio". `verify_loudness.py`'s one-gain check would have to allow that. The decoder gate, `ref_compare`
  check 7, is unaffected because it runs before normalization.
- **Untested:** speeds other than 1.0, and Macs whose default voice is neither Samantha nor unset.

## Reproduce

The scripts are in `tools-d/`, and their results JSON is kept beside them. The scripts read and write
`/tmp/ntts-lim-d/`. Run from `native-helper/` with `E=Sources/NaturalTTSHelper/Resources/python-env/bin/python3`:

```
$E ../docs/research/2026-09-upgrade/limiter-decision/tools-d/gen_d.py seeds      # 32 takes, seed variance
$E …/tools-d/gen_d.py length      # 5 voices × 2 articles (texts.py), chunk bounds kept
$E …/tools-d/gen_d.py catalogue   # all 28 voices on verify_loudness's long text
$E …/tools-d/lim_d.py len ; $E …/tools-d/lim_d.py cat-     # A's limiter at −16/−18 (+ per-chunk, −0.5 dBTP)
$E …/tools-d/lim_d2.py            # L3-60 at −21/−19, L2-60 at −19
$E …/tools-d/a15_21.py            # A's 15 cases at −21
$E …/tools-d/l1check.py           # log-mel offset check on A's files
$E …/tools-d/jumps_d.py           # the Answer table
$E …/tools-d/ab_d.py              # ab-d/ excerpts
```

Samantha and Arthur article levels come from B's renderer: `/tmp/ntts-lim-B/avrender <voiceId> 1.0 out.caf "<texts.LONG2>"`,
then `ffmpeg -af ebur128=peak=true`. Samantha measured −16.0 LUFS / −1.3 dBTP and Arthur −22.2 / −3.1. No helper was
started and no port was used.
