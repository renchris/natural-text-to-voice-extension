# A. Limiter variants against today's single-gain normalization (measured 2026-09-24)

**Verdict.** A lookahead true-peak limiter does what it promises and costs nothing that these instruments can see.
Uncapped (L1), it puts all 15 cases at −16.0 ± 0.1 LUFS with the true peak held at −1.5 dBTP. Today (B) only 2 of 15
reach −16. Intelligibility is unchanged: parakeet returns the **same transcript, word for word**, for the raw audio,
for B and for all six limiter variants in every case. The price is concentrated in a few peaky takes. am_michael/long
needs 10.1 dB of peak reduction and spends 10% of its samples more than 1 dB down. In those takes the spectral-change
proxy approaches the size of the decoder change the fidelity gate is built to catch.

**The variant to set against "no limiter" is L2-60: a 6 dB cap and a 60 ms release.**

- 14 of 15 cases reach −16.0.
- The deepest reduction is 6.0 dB, and at most 9% of samples sit more than 1 dB down.
- The spread across the 15 cases shrinks from **9.0 LU today to 3.3 LU**. The one miss, am_michael/long, rises from
  −25.0 to −19.3 LUFS.
- The 60 ms release beats 150 ms on every measure here with the same loudness result: about half the time under
  reduction and a lower spectral change.

Speech recognition is saturated at this level, so it cannot rule on audibility. The listening check on `ab/` has
the last word.

**What this means for the third option (turning down the system-voice fallback).** It cannot close Kokoro's own
spread. Today the 15 responses land anywhere from −25.0 to −16.0 LUFS. For the hero paragraph alone they range from
−25.0 (am_michael) to −17.4 (bm_george). No single fallback volume matches all of them. Only a limiter narrows that
range.

## Method

- **Corpus.** The same 15 cases as W2 §10: `verify_loudness.py`'s `VOICES` × `TEXTS`, with the same call path
  (`generate_audio_mlx` in-process) and the same seeds (`mx.random.seed(1000+i)`). Normalization was off, using the
  worker's verification switch (`LOUDNESS_NORMALIZE=False` / `NTTS_LOUDNESS_NORMALIZE=0`). The raw audio reproduces
  W2 §10's raw column exactly, for example af_heart/short at −26.09 LUFS / −10.78 dBTP and am_michael/long at
  −27.71 / −4.18. No helper was started and no port was used.
- **B.** The worker's own `normalize_loudness()`: one gain, applied to the raw audio.
- **Limiter (offline numpy, `tools/lim.py`; not product code).** The steps, in order:
  - The per-sample 4× true-peak envelope uses the worker's own interpolation phases (32 taps per phase, Kaiser 8),
    widened by the filter half-length.
  - The required gain is `min(1, ceiling/envelope)`, floored at the cap.
  - A forward-looking minimum over 5 ms (the lookahead).
  - Instant attack, then a one-pole release of 60 or 150 ms.
  - A 5 ms boxcar provides the attack ramp, so attack equals lookahead. This construction guarantees that every peak
    is fully covered.
  - The internal ceiling is −1.55 dBTP, tightened again if the output meter overshoots.
  - Makeup: the static gain is re-aimed until the limited output reads −16 ± 0.05 LUFS. A cap limits the static gain
    to `ceiling + cap − raw true peak`. When that limit binds (`cap_bound`), the output stays below −16 and the
    limiter never exceeds the cap.
- **Metrics (`tools/score.py`).**
  - LUFS and true peak are measured by ffmpeg `ebur128=peak=true`, which is independent of the worker's meter.
  - Gain reduction (GR) comes from the limiter's own gain curve.
  - The spectral-change proxy is `ref_compare.py`'s gated 128-mel log-mel L1 against the raw audio, after
    gain-matching the output's integrated loudness to the raw audio's. It is reported as the file mean and as the p99
    over frames.
  - Crest factor is sample peak over RMS for the whole file. PLR is true peak minus LUFS.
  - WER compares `parakeet-cli` (Parakeet TDT 0.6B v3, `~/Development/wcpp191/models/ggml-parakeet-tdt-0.6b-v3-f16.bin`,
    16 kHz) with the source text, using `asr2.py`'s normalization. All outputs are 16-bit PCM, as shipped.

Re-derive (python-env from `native-helper/`; the scripts read and write `/tmp/ntts-lim-a/`):

```
E=Sources/NaturalTTSHelper/Resources/python-env/bin/python3
T=../docs/research/2026-09-upgrade/limiter-decision/tools
$E $T/gen.py && $E $T/lim.py && $E $T/score.py && $E $T/ab.py
```

All 120 rows (15 cases × raw, B and 6 variants), including each transcript, are in `A-limiter-measurements.csv`.

## Summary by variant (15 cases each)

| Variant | Reach −16 ± 0.5 | Out LUFS min…max (spread) | Max true peak (ffmpeg) | Deepest GR: max / median | % samples GR > 1 dB: mean / max | Log-mel L1: mean / max | p99 frame L1 max | Crest median | PLR median | Word errors / 475 |
|---|---|---|---|---|---|---|---|---|---|---|
| raw | 0 | −27.7…−22.9 (4.8) | −4.2 | — | — | 0 | 0 | 17.4 | 16.3 | 11 |
| **B** (today) | 2 | −25.0…−16.0 (**9.0**) | −1.5 | 0 / 0 | 0 / 0 | 0.003 / 0.007 | 0.009 | 17.4 | 16.3 | 11 |
| L1-60 (uncapped) | **15** | −16.1…−16.0 (0.1) | −1.5 | 10.1 / 2.1 | 3.0 / 10.3 | 0.031 / 0.106 | 0.48 | 15.0 | 14.5 | 11 |
| L1-150 | 15 | −16.1…−16.0 (0.1) | −1.5 | 10.5 / 2.4 | 6.8 / 20.3 | 0.043 / 0.131 | 0.52 | 15.0 | 14.5 | 11 |
| **L2-60** (6 dB cap) | 14 | −19.3…−16.0 (**3.3**) | −1.5 | 6.0 / 2.1 | 2.4 / 9.0 | 0.026 / 0.076 | 0.32 | 15.1 | 14.5 | 11 |
| L2-150 | 14 | −19.3…−16.0 (3.3) | −1.5 | 6.0 / 2.4 | 5.6 / 17.6 | 0.036 / 0.094 | 0.34 | 15.2 | 14.5 | 11 |
| L3-60 (3 dB cap) | 9 | −22.1…−16.0 (6.1) | −1.5 | 3.0 / 2.1 | 1.2 / 3.6 | 0.017 / 0.054 | 0.20 | 15.8 | 14.6 | 11 |
| L3-150 | 8 | −22.1…−16.0 (6.1) | −1.5 | 3.0 / 2.4 | 2.6 / 9.2 | 0.022 / 0.065 | 0.23 | 15.8 | 14.5 | 11 |

How to read the columns:

- **Mean GR** over all samples is 0.04–0.65 dB. The limiter works only on isolated syllable peaks, which is why the
  median deepest GR is about 2 dB.
- **B's log-mel L1** of 0.003–0.007 is the instrument's floor. B is the raw audio times one gain, and 16-bit
  requantization accounts for the residual.
- **Scale for log-mel L1.** `ref_compare.py` measures 0.049 between two PyTorch reference runs and gates a decoder at
  0.13. That was measured on a different fixture, so the comparison is indicative, not like-for-like. By that scale,
  L2-60 exceeds the run-to-run figure in 2 of 15 cases (af_bella/short 0.055, am_michael/medium 0.076). L1-150
  reaches the gate figure in one case (am_michael/long 0.131).
- **Word errors are identical in every column**, and so are the transcripts. The 11 errors are all present in the
  raw audio: "Mac OS" for "macOS" (2 words per long case, a normalization artifact) and "Kakoral" for "Kokoro" in
  am_michael/long. At about 2% WER on clean speech, ASR cannot see a limiter at these depths. This is a limit of the
  instrument, not evidence that the limiter is inaudible.

## Per case

Each cell is out LUFS / deepest GR dB / % samples GR > 1 dB / log-mel L1. B shows out LUFS / log-mel L1. Raw is
LUFS / dBTP.

| Case | Raw | B | L1-60 | L2-60 | L3-60 | L1-150 | L2-150 | L3-150 |
|---|---|---|---|---|---|---|---|---|
| af_heart/short | −26.1 / −10.8 | −16.8 / 0.002 | −16.0 / 1.0 / 0.0% / 0.010 | −16.0 / 1.0 / 0.0% / 0.010 | −16.0 / 1.0 / 0.0% / 0.010 | −16.0 / 1.0 / 0.6% / 0.014 | −16.0 / 1.0 / 0.6% / 0.014 | −16.0 / 1.0 / 0.6% / 0.014 |
| af_heart/medium | −25.8 / −9.5 | −17.8 / 0.002 | −16.1 / 2.1 / 2.4% / 0.031 | −16.1 / 2.1 / 2.4% / 0.031 | −16.1 / 2.1 / 2.4% / 0.031 | −16.0 / 2.2 / 5.0% / 0.036 | −16.0 / 2.2 / 5.0% / 0.036 | −16.0 / 2.2 / 5.0% / 0.036 |
| af_heart/long | −25.6 / −6.5 | −20.6 / 0.007 | −16.0 / 4.9 / 4.1% / 0.038 | −16.0 / 4.9 / 4.1% / 0.038 | −17.7 / 3.0 / 0.6% / 0.016 | −16.0 / 5.1 / 9.2% / 0.055 | −16.0 / 5.1 / 9.2% / 0.055 | −17.7 / 3.0 / 1.4% / 0.017 |
| af_bella/short | −25.7 / −8.7 | −18.4 / 0.001 | −16.0 / 3.4 / 3.9% / 0.055 | −16.0 / 3.4 / 3.9% / 0.055 | −16.3 / 3.0 / 3.6% / 0.054 | −16.0 / 4.3 / 14.5% / 0.092 | −16.0 / 4.3 / 14.5% / 0.092 | −16.6 / 3.0 / 7.4% / 0.065 |
| af_bella/medium | −24.8 / −8.5 | −17.8 / 0.004 | −16.0 / 2.0 / 1.0% / 0.014 | −16.0 / 2.0 / 1.0% / 0.014 | −16.0 / 2.0 / 1.0% / 0.014 | −16.0 / 2.2 / 2.2% / 0.025 | −16.0 / 2.2 / 2.2% / 0.025 | −16.0 / 2.2 / 2.2% / 0.025 |
| af_bella/long | −24.4 / −6.0 | −19.9 / 0.003 | −16.0 / 4.2 / 1.5% / 0.027 | −16.0 / 4.2 / 1.5% / 0.027 | −17.1 / 3.0 / 0.5% / 0.020 | −16.0 / 4.3 / 3.2% / 0.040 | −16.0 / 4.3 / 3.2% / 0.040 | −17.1 / 3.0 / 0.8% / 0.021 |
| am_michael/short | −26.7 / −10.5 | −17.6 / 0.005 | −16.1 / 2.0 / 3.2% / 0.026 | −16.1 / 2.0 / 3.2% / 0.026 | −16.1 / 2.0 / 3.2% / 0.026 | −16.0 / 2.4 / 9.2% / 0.041 | −16.0 / 2.4 / 9.2% / 0.041 | −16.0 / 2.4 / 9.2% / 0.041 |
| am_michael/medium | −27.6 / −8.1 | −21.0 / 0.001 | −16.0 / 5.8 / 9.0% / 0.076 | −16.0 / 5.8 / 9.0% / 0.076 | −18.2 / 3.0 / 1.5% / 0.021 | −16.0 / 6.1 / 17.9% / 0.093 | −16.1 / 6.0 / 17.6% / 0.094 | −18.3 / 3.0 / 3.2% / 0.032 |
| am_michael/long | −27.7 / −4.2 | −25.0 / 0.002 | −16.0 / 10.1 / 10.3% / 0.106 | **−19.3** / 6.0 / 1.4% / 0.029 | −22.1 / 3.0 / 0.3% / 0.007 | −16.1 / 10.5 / 20.3% / 0.131 | −19.3 / 6.0 / 2.7% / 0.031 | −22.1 / 3.0 / 0.7% / 0.008 |
| bf_emma/short | −22.9 / −8.5 | −16.0 / 0.003 | −16.0 / 0.0 / 0.0% / 0.003 | −16.0 / 0.0 / 0.0% / 0.003 | −16.0 / 0.0 / 0.0% / 0.003 | −16.0 / 0.0 / 0.0% / 0.003 | −16.0 / 0.0 / 0.0% / 0.003 | −16.0 / 0.0 / 0.0% / 0.003 |
| bf_emma/medium | −23.7 / −5.2 | −20.0 / 0.003 | −16.0 / 4.3 / 2.8% / 0.026 | −16.0 / 4.3 / 2.8% / 0.026 | −17.2 / 3.0 / 1.4% / 0.017 | −16.0 / 4.5 / 6.3% / 0.040 | −16.0 / 4.5 / 6.3% / 0.040 | −17.2 / 3.0 / 2.8% / 0.019 |
| bf_emma/long | −23.8 / −5.8 | −19.5 / 0.002 | −16.0 / 4.0 / 5.6% / 0.041 | −16.0 / 4.0 / 5.6% / 0.041 | −16.7 / 3.0 / 2.1% / 0.019 | −16.0 / 4.2 / 12.3% / 0.056 | −16.0 / 4.2 / 12.3% / 0.056 | −16.8 / 3.0 / 4.1% / 0.028 |
| bm_george/short | −24.1 / −9.5 | −16.1 / 0.001 | −16.0 / 0.2 / 0.0% / 0.003 | −16.0 / 0.2 / 0.0% / 0.003 | −16.0 / 0.2 / 0.0% / 0.003 | −16.0 / 0.2 / 0.0% / 0.003 | −16.0 / 0.2 / 0.0% / 0.003 | −16.0 / 0.2 / 0.0% / 0.003 |
| bm_george/medium | −25.0 / −9.0 | −17.4 / 0.005 | −16.0 / 1.5 / 0.3% / 0.003 | −16.0 / 1.5 / 0.3% / 0.003 | −16.0 / 1.5 / 0.3% / 0.003 | −16.0 / 1.6 / 0.8% / 0.007 | −16.0 / 1.6 / 0.8% / 0.007 | −16.0 / 1.6 / 0.8% / 0.007 |
| bm_george/long | −25.2 / −9.3 | −17.4 / 0.003 | −16.0 / 1.4 / 0.3% / 0.003 | −16.0 / 1.4 / 0.3% / 0.003 | −16.0 / 1.4 / 0.3% / 0.003 | −16.0 / 1.5 / 0.6% / 0.010 | −16.0 / 1.5 / 0.6% / 0.010 | −16.0 / 1.5 / 0.6% / 0.010 |

The caps only change the peaky takes. Where the needed reduction is at most 3 dB, L1, L2 and L3 give identical
output: bm_george, the short cases and af_bella/medium. bf_emma/short is target-bound under B already (−16.0 at
−1.62 dBTP), so the limiter does nothing to it.

## A/B excerpts for the listening check (`ab/`, 1.7 MB)

Each excerpt is 4 s (24 kHz, 16-bit mono, 15 ms fades), cut from the same window of each file and centred on L2-60's
deepest gain reduction. There are three files per case:

- `-B`: today's output.
- `-L2`: L2-60 at its real level, which is what a user would hear.
- `-L2-matched-to-B`: L2-60 gain-matched to B's whole-file loudness. Listen to this one for the limiter itself,
  without the level jump; louder audio tends to be preferred on level alone.

| Set | Why this case | Deepest GR in window | Whole file: B vs L2 |
|---|---|---|---|
| `01-af_heart-long` | hero voice and hero paragraph | 4.9 dB at 0.74 s | −20.6 vs −16.0 LUFS |
| `02-am_michael-medium` | deepest GR among L2's cases that reach −16 | 5.8 dB at 5.26 s | −21.0 vs −16.0 LUFS |
| `03-am_michael-long` | cap-bound: the 6 dB cap at full depth | 6.0 dB at 11.45 s | −25.0 vs −19.3 LUFS |

Files 02 and 03 carry the most limiting in the corpus. If they sound clean with the level jump removed, nothing else
here will sound worse.

## Caveats

- **Cost is not product-ready.** This offline pass takes 0.23 s per limiter pass on 26 s of audio, and the full L1 run
  with its makeup loop (up to 6 passes) takes 1.58 s (measured on am_michael/long, M1 Max). That is comparable to the
  synthesis time itself (about 26× real time, W2 §3), against 0.083 s for today's normalization. A product version
  would need a vectorized release and a one- or two-pass makeup estimate, and it has not been measured. The worker
  already holds the whole response before normalizing, so the lookahead adds no streaming latency.
- **One seed per case, 15 cases, 475 words.** Log-mel L1 is a proxy for spectral and dynamic change. It measures how
  much changed, not whether anyone can hear it.
- **The ceiling.** The limiter aims at −1.55 dBTP internally, so ffmpeg reads −1.5 and the worker meter −1.55. No
  output exceeds −1.5 dBTP on either meter.
