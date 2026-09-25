# W2 integration measurements: helper 1.5.0 vs the C2 baseline (measured 2026-09-23)

**Scope.** These are raw numbers for the integrated v1.5 helper on `main` at `9d296c6`: all four W1 lanes merged,
plus the integration fixes. The baseline is [C2-helper-baseline.md](C2-helper-baseline.md) §4, which measured the
v1.4 helper on the same machine earlier the same day. The method follows C2: the same texts
(`/tmp/ntts-c2/texts.json`: S15, M60, L400, X4985), `curl` as the client, voice `af_bella`, speed 1.0, and RTF =
audio seconds ÷ client wall time.

## Bottom line

On the same M1 Max with the GPU otherwise idle:

- **Helper start is 2.8× faster.** Launch to healthy takes 1.95 s, down from 5.54 s, and that now includes the
  warm-up generate.
- **The first request no longer pays a cold penalty.** The first `/speak` takes 0.35 s, down from 3.0–4.8 s. So a
  freshly launched helper produces its first audio about 2.3 s after launch, where it used to take about 8.5–10 s.
- **Warm synthesis runs at ~26.5× real time at every size**, up from 18.7–22.2×. Latency is 16–30% lower.
- **`/health` answers in under 1 ms during synthesis.** It used to take 6.64 s.
- **The Python environment is 3.2× smaller:** 655 MB with 89 packages, down from 2.1 GB with 183.

Peak unified memory is unchanged at ~7.8 GB, because the MLX buffer cache is still not bounded. Time to first audio
still equals the full synthesis time, because streaming is a W2 item.

**Update (HELPER2, same day):** the MLX buffer cache is now bounded at 256 MB. The worker's peak physical
footprint on X4985 falls from 7.9 GB to 3.6 GB, with no measurable RTF cost and the same audio. See §9.

## 1. Conditions

| Item | Value |
|---|---|
| Machine | Apple M1 Max, macOS 15.7.9 (Darwin 24.6.0), same as C2 |
| Code | `main` @ `9d296c6`. Helper `version 1.5.0`, `apiVersion 2`. Built with `swift build -c release` (Swift 6.2.4), binary 7,379,360 B |
| Python env | `native-helper/python/uv.lock` synced by `Scripts/setup-python-env.sh` (uv 0.11.28): Python 3.12.13, mlx 0.32.2, mlx-audio 0.5.5, `en_core_web_sm` present, no torch |
| Model | `prince-canuma/Kokoro-82M`, HF cache 349 MB (unchanged). The worker runs with `HF_HUB_OFFLINE=1`, set by itself |
| Helper launch | `sandbox-exec` (no bind on 8249–8260, no write under `~/Library/Application Support/NaturalTTS`) `natural-tts-helper --port 18249 --python <env> --worker <tts_worker.py>` |
| Driver | `/tmp/ntts-w2int/measure.py`; raw JSON lines in `/tmp/ntts-w2int/raw-final.jsonl` |
| Window | 18:25:52–18:26:57 |
| GPU | `ioreg` "Device Utilization %" read **0–6% right before the run**. During the run it read 65–94%, all from this run's own requests (sampled every 2 s, 32 samples) |
| CPU | load1 9.9 at the start and 9.6 at the end, from unrelated shell and bats jobs that do not use the GPU. C2's clean runs had load1 ~16.8 |
| Old helper | pid 31790 (v1.4, :8249) stayed running and untouched. It received no requests from this run |

## 2. Startup and first audio

| Metric | 1.5.0 (this run) | C2 baseline (v1.4) | Change |
|---|---|---|---|
| Launch → `/health` 200 `ok` | **1.941 / 2.137 / 1.946 s** (median **1.95 s**, 3 cold starts) | 5.54 s (run4, load1 16.8); 11.7–11.9 s contended | **−65%**; now includes the warm-up generate |
| First `/speak` after healthy (S15) | **0.348 / 0.342 / 0.393 s** (median **0.35 s**) | 4.78 s (run1), 3.14 (run2), 3.00 (run4) | **−88 to −93%**; the cold penalty (~2.5 s in C2) is gone |
| First `/speak` ÷ warm S15 | 1.03× | ~6–10× | IN-03 warm-up target ≤ 1.5× |
| Launch → first audio (S15) | **~2.3 s** | ~8.5–10.3 s | about **4×** faster |

## 3. Warm latency and real-time factor (`af_bella`, 1.0×)

| Text | Words / chars | Audio | 1.5.0 totals (s) | **1.5.0 median** | **RTF median** | C2 pooled median | C2 RTF median | Change in latency |
|---|---|---|---|---|---|---|---|---|
| S15 | 15 / 123 | 9.00 s | 0.339 / 0.338 / 0.334 | **0.338 s** | **26.6×** | 0.481 s | 18.7× | −30% |
| M60 | 60 / 408 | 29.00 s | 1.076 / 1.106 / 1.132 | **1.106 s** | **26.2×** | 1.316 s | 22.0× | −16% |
| L400 | 407 / 2,644 | 171.50 s | 6.526 / 6.488 / 6.399, plus in-flight runs 6.458 / 6.358 / 6.513 | **6.473 s** (n=6) | **26.5×** | 7.733 s | 22.2× | −16% |
| X4985 (single) | 751 / 4,985 | 325.15 s | 12.230 | **12.23 s** | **26.6×** | 15–18 s | 18.3–21.5× | −18 to −32% |

- WAV bytes are identical to C2 for every size (432,044 / 1,392,044 / 8,232,044 / 15,607,244), so the audio
  duration and format are unchanged: 24 kHz, mono, 16-bit.
- TTFB still ≈ total (L400: 6.519 vs 6.526 s). The whole WAV is produced before the first byte, so time to first
  audio for long text is still the full synthesis time. Streaming is W2.
- X4985 now finishes in 12.2 s on an idle GPU, against the extension's 30 s `/speak` timeout. C2 measured 45 s
  under contention; that case was not re-measured here.

## 4. `/health` latency

| Condition | 1.5.0 | C2 baseline |
|---|---|---|
| Idle (5 samples) | 0.52 / 0.50 / 0.44 / 0.41 / 0.41 ms (median **0.44 ms**) | 2–11 ms |
| 1 s into an in-flight L400 `/speak` (3 samples) | **0.54 / 0.69 / 0.68 ms** | **6.64 s** |
| Same, from `scripts/verify-all.sh` (two gate runs) | 0.74 ms, 1.08 ms | — |

## 5. Memory

| Metric | 1.5.0 | C2 baseline | How |
|---|---|---|---|
| Worker RSS idle, after load (before any `/speak`) | **617 MB** | 806 MB | `ps -o rss` |
| Worker physical footprint, after load | **520 MB** (peak so far 1,503 MB, from load plus warm-up) | 692 MB | `footprint -p` |
| Worker physical footprint peak after the first S15 | **4,362 MB** | 4.5 GB (run4) | `footprint -p` |
| Worker RSS peak over the whole run | **911 MB** | 1,187 MB | `ps` sampled every 0.2 s (253 samples) |
| Worker physical footprint **peak**, end of run (after X4985 + 6× L400) | **7,845 MB** | 7.9 GB (run1), 8.0 GB (run4) | `footprint -p`; the MLX buffer cache is still unbounded (W2) |
| Worker physical footprint current, end of run | **636 MB** | 885 MB (run1); 4.0 GB retained after X4985 (run4) | `footprint -p` |
| Swift helper RSS idle / peak | **10.4 MB / 142 MB** | 9 MB / 151 MB | `ps` sampler |

## 6. Disk

| Item | 1.5.0 | C2 baseline |
|---|---|---|
| `Resources/python-env` | **655 MB**, 89 distributions (`uv.lock`: 90 `name =` entries, including the project) | 2.1 GB, 183 packages |
| Rollback copy of the old env | 2.1 GB at `native-helper/.python-env.pre-1.5` (gitignored; delete once 1.5 is accepted) | — |
| HF model cache | 349 MB | 349 MB |
| `.build` from a clean 1.5 build (H-SWIFT worktree) | **323 MB**; resource bundle 12 KB (`tts_worker.py` only) | 4.8 GB; the bundle held a 2.1 GB venv copy |
| `.build` in the main checkout | still 4.8 GB. `NaturalTTSHelper_NaturalTTSHelper.bundle/Resources/python-env` is a stale copy from pre-1.5 builds, and SwiftPM does not prune it. The 1.5 resolver never reads that path: the Python candidates are `exeDir/../Resources/python-env` and `exeDir/python-env`, then the source root. Deleting `.build` reclaims it | — |
| Release binary | 7.38 MB | 7.25 MB |

## 7. Network

The spoken text never appears in the helper log, and the worker holds **0 ESTABLISHED** connections during an
in-flight `/speak`. Both were checked by `scripts/verify-all.sh` on the same build. C2 measured 1 connection, a live TLS
connection to huggingface.co, plus a per-request `hf_hub_download` of about 72 ms.

## 8. Caveats

- n=3 per size (L400 n=6), against C2's pooled n=6. The spread within each size is ≤ 6%.
- The first British-voice request still builds the `lang_code b` pipeline, which takes about 1.1–1.2 s. The warm-up
  covers only the American pipeline (H-PY observation). The gate's `bf_emma` check passed.
- Contended-GPU behaviour (C2 run3off/run4) was not re-measured.

## 9. Bounding the MLX buffer cache (HELPER2, measured 2026-09-23)

**Result.** The worker now calls `mx.set_cache_limit(256 MB)` before it loads the model, and `mx.clear_cache()` after
the warm-up and after every request. On the X4985 text the worker's peak physical footprint falls from **7,909 MB to
3,605 MB (−54%)**. RTF shows no measurable cost, and the audio matches within GPU rounding. The limit can be overridden
with `NTTS_MLX_CACHE_LIMIT_MB`.

**API in mlx 0.32.2.** The top-level functions are current: `mx.set_cache_limit`, `mx.set_memory_limit`,
`mx.set_wired_limit`, `mx.clear_cache`, `mx.get_cache_memory`, `mx.get_active_memory`, `mx.get_peak_memory` and
`mx.reset_peak_memory`. The `mx.metal.*` versions still exist, but each call warns "deprecated ... Use mx.<name>
instead". `set_memory_limit` is not used. It is a guideline for graph evaluation, and the peak is live arrays, which
it cannot shrink. Past it, MLX waits or raises. The cache limit defaults to the memory limit, 1.5× the recommended
working set: 72 GB on this 64 GB M1 Max, so in effect unbounded.

**Where the 7.9 GB came from.** The worker read MLX's own counters around each request. Active arrays peak at
**2,437 MB (S15), 3,154 MB (M60) and 3,236 MB (L400, X4985)**, with 313 MB of that being the model. At the end of a
request the cache holds only 1.7–57 MB, because mlx-audio already calls `mx.clear_cache()` after every segment
(`mlx_audio/tts/models/kokoro/kokoro.py:370`). So the extra ~4.2 GB in the footprint peak is buffers that were freed
and cached *inside* one segment's forward pass. A clear after the request cannot reach them; only a cache limit can.
The footprint returns to 0.6–0.7 GB after every request, with or without a limit.

**Method.** A harness drove the worker directly with its stdin frames (no helper), using the texts from
`/tmp/ntts-c2/texts.json`, voice `af_bella` at 1.0×. Each run used a fresh worker and sent
S15, M60, L400, X4985, S15, M60, L400. After each request the harness read `phys_footprint_peak` (lifetime peak) with
`footprint -p <pid> -j`. A wrapper applied the cache policy and seeded `mx.random` (1234) before each request, so the
audio can be compared across configs. Kokoro's iSTFTNet draws random phase and noise, so unseeded runs differ. Each
config ran 3 times, round-robin, alternating the order. Other lanes had the GPU at 36–93% `ioreg` utilization
throughout, so absolute RTF is below §3 and noisy. RTF was therefore also measured **paired**: one warm worker, the
limit switched before each request in shuffled order, 6 reps × 4 texts × 5 limits, so the contention hits every
limit alike. Harness and raw JSON lines: `/tmp/ntts-h2mem/` (`bench.py`, `wrap.py`, `paired.py`, `raw.jsonl`,
`paired.jsonl`, `final.jsonl`). These files are ephemeral.

Sweep (median of 3 fresh workers; footprint in MB, the lifetime peak after each request):

| Cache policy | Load + warm-up peak | Peak after S15 | after M60 | after L400 | after X4985 | Warm RTF S15 / M60 / L400 / X | Pooled RTF (21 req) |
|---|---|---|---|---|---|---|---|
| unbounded (1.5.0) | 1,498 | 4,420 | 7,699 | 7,727 | **7,921** | 26.1 / 26.5 / 26.9 / 26.0 | 26.2× |
| unbounded + clear after request | 1,500 | 4,416 | 7,700 | 7,724 | 7,916 | 26.6 / 27.0 / 26.7 / 26.8 | 25.4× (−3.1%) |
| 0 (cache off) | 810 | 1,674 | 3,558 | 3,563 | 3,610 | 23.9 / 22.2 / 22.0 / 22.2 | 19.0× (**−27.7%**) |
| 128 MB | 939 | 1,937 | 3,417 | 3,706 | 3,709 | 26.7 / 26.1 / 26.9 / 26.6 | 23.8× (−9.3%) |
| **256 MB** | 1,124 | 2,090 | 3,514 | 3,580 | **3,680** | 27.7 / 27.9 / 27.3 / 28.1 | 25.9× (−1.4%) |
| 512 MB | 1,393 | 2,341 | 3,667 | 3,800 | 3,850 | 26.5 / 26.7 / 27.1 / 26.8 | 27.1× (+3.4%) |
| 1 GB | 1,503 | 3,050 | 4,200 | 4,287 | 4,462 | 28.0 / 28.0 / 27.9 / 28.2 | 26.1× (−0.6%) |
| 2 GB | 1,498 | 4,030 | 5,213 | 5,330 | 5,495 | 27.2 / 27.9 / 27.8 / 26.9 | 24.8× (−5.4%) |

The pooled column includes each size's first request in a fresh worker. The "clear" and "2 GB" rows show the noise
band: neither can slow synthesis by 3–5%.

Paired RTF against unbounded (24 pairs per limit; unbounded median 20.7× under contention):

| Limit | Geometric-mean ratio | 95% CI | Median ratio |
|---|---|---|---|
| 128 MB | −3.2% | −10.1% … +4.4% | +0.8% |
| **256 MB** | −1.5% | −10.6% … +8.4% | +2.0% |
| 512 MB | −1.7% | −9.1% … +6.4% | +1.9% |
| 1 GB | +0.0% | −6.3% … +6.8% | +3.3% |

**Why 256 MB.** Cache off and 128 MB reach the same floor, about 3.6 GB. That is the 3.2 GB active peak plus the
worker's ~0.5 GB baseline. They cost 28% and ~9% RTF in the sweep. 256 MB sits on that floor (3,680 vs 3,610 MB) with
no measurable cost in either design. 512 MB adds ~170 MB and gains nothing that could be measured.

**The shipped worker** was measured the same way, interleaved with the unbounded 1.5.0 worker, 3 fresh workers each:

| | Unbounded (1.5.0) | Shipped (256 MB + clear) |
|---|---|---|
| Footprint peak after load + warm-up | 1,494 MB | 1,115 MB |
| Peak after S15 / M60 / L400 / X4985 | 4,409 / 7,699 / 7,717 / **7,909 MB** | 2,046 / 3,482 / 3,584 / **3,605 MB** |
| Footprint after the last request | 690 MB | 680 MB |
| RTF median S15 / M60 / L400 / X4985 (contended GPU) | 21.6 / 22.7 / 20.4 / 20.2 | 25.3 / 24.9 / 23.8 / 23.1 |
| Audio vs unbounded (seeded) | — | max \|Δ\| 1 LSB on 0.006–0.008% of samples |

Two runs of the unchanged worker with the same seed differ in the same way: 1 LSB on 0.01% of samples. This is GPU
rounding, not the cache policy. `Scripts/verify-python.sh`: PASS 7/7, fidelity level −0.2 dB, log-mel L1 0.1152
(0.1156 before; gate ≤ 0.13). Helper smoke test on :18249 (real helper, unseeded): X4985 with `af_heart` → 200 in
14.8 s; `bf_emma` S15 → 200 in 0.29 s. Worker footprint peak 3,555 MB, current 676 MB. SIGTERM left no worker behind.

**What is left.** The ~3.2 GB floor is live arrays in one segment's decoder pass. Even S15 reaches 2.4 GB active. A
cache setting cannot lower it; that would take shorter segments or a chunked decoder. On an 8 GB Mac the worker now
peaks at ~3.6 GB instead of ~7.9 GB.

## 10. Loudness normalization (W4, measured 2026-09-24)

**Result.** Every `/speak` response now gets one gain: the smaller of the gain to **−16 LUFS** integrated (ITU-R
BS.1770-4, K-weighted, gated) and the gain that puts the 4×-oversampled true peak at **−1.5 dBTP** (capped at +24 dB).
There is no compressor or limiter, and nothing clips. Across 5 voices × 3 lengths, output moved from **−27.7…−22.9
LUFS (median −25.2)** to **−25.0…−16.0 LUFS (median −17.8)**, +2.7 to +9.3 dB. **Only 2 of the 15 reach −16 ± 0.5
LUFS.** The other 13 stop at the true-peak ceiling, because Kokoro's speech is peaky: its true peak sits **14.1–23.5
dB** above its loudness, and a single gain can meet both −16 LUFS and −1.5 dBTP only when that distance is ≤ 14.5 dB.
The peaks that bind are ordinary speech, not clicks at chunk joins. Around each one the local 20 ms crest is 8–14 dB,
and a second peak within 2 dB of it sits elsewhere in the same take. Reaching −16 everywhere would need up to 9.0 dB of
peak reduction (median ~2 dB) from a limiter, which the brief rules out. That call is open for the operator (see
"Open").

| Case (ffmpeg ebur128) | Raw LUFS / dBTP | Gain | Out LUFS / dBTP | Bound by |
|---|---|---|---|---|
| af_heart short / medium / long | −26.1/−10.8 · −25.8/−9.5 · −25.6/−6.5 | +9.28 · +8.01 · +5.07 | −16.8 · −17.8 · −20.6 / −1.5 | ceiling ×3 |
| af_bella | −25.7/−8.7 · −24.8/−8.5 · −24.4/−6.0 | +7.29 · +6.96 · +4.52 | −18.4 · −17.8 · −19.9 / −1.5 | ceiling ×3 |
| am_michael | −26.7/−10.5 · −27.6/−8.1 · −27.7/−4.2 | +9.03 · +6.61 · +2.68 | −17.6 · −21.0 · −25.0 / −1.5 | ceiling ×3 |
| bf_emma | −22.9/−8.5 · −23.7/−5.2 · −23.8/−5.8 | +6.86 · +3.67 · +4.28 | **−16.0**/−1.6 · −20.0 · −19.5 / −1.5 | target · ceiling ×2 |
| bm_george | −24.1/−9.5 · −25.0/−9.0 · −25.2/−9.3 | +7.99 · +7.54 · +7.83 | **−16.1** · −17.5 · −17.4 / −1.5 | target · ceiling ×2 |

The lengths are 2.0–2.6 s, 6.7–8.1 s and 22.5–26.0 s (`Scripts/verify_loudness.py` `TEXTS`). Each case was seeded
(`mx.random.seed`) and synthesised twice, once with normalization off and once on. The normalized output is the raw
one times a single gain: the residual is 1.9–3.4e-4 of its RMS, which is 16-bit quantization. The sample count and
`duration` are identical.

**Against the macOS system voice, through a real helper.** The helper was built from this tree and run on :18249 with
`--python` (the main checkout's python-env) and `--worker` (this tree's). Each `/speak` answered 200, and each file
was measured with `ffmpeg -af ebur128=peak=true`. The system voice for the same text was rendered with `say -o`
(default voice, 22.05 kHz mono AIFF). Both are mono files, so the numbers compare like for like:

| Text | System voice (`say`) | af_heart | af_bella | am_michael | bf_emma | bm_george |
|---|---|---|---|---|---|---|
| short (26 chars) | −16.7 / −3.0 | −16.7 | −18.3 | −17.4 | −16.0 (−2.2 dBTP) | −16.0 |
| medium (104) | −16.1 / −2.3 | −18.0 | −17.9 | −20.8 | −20.0 | −17.9 |
| hero paragraph (243) | −16.4 / −2.0 | −20.2 | −19.3 | −21.5 | −18.8 | −17.4 |

Every Kokoro true peak is −1.5 dBTP unless noted. Before this change the same Kokoro voices measured −23 to −28 LUFS,
7 to 12 LU under the system voice; the gap is now 0 to 5 LU. The helper log carries one numbers-only line per request,
such as `Loudness -26.10 LUFS (gated), true peak -10.89 dBTP; gain +9.39 dB (limited by true_peak) in 0.020s`. No
request text appears in it (checked). The PROVENANCE figure of −13.3 LUFS for the system voice is a different
measurement: Chrome's playback captured live, in stereo. A stereo file with the same signal on both channels reads ~3
LU louder, because BS.1770 sums the channels. In the promo master, measured stereo against stereo, Kokoro now sits at
−15.7…−16.3 LUFS against −13.3 (`assets/media/PROVENANCE.md`).

**The meter.** It uses numpy only, adds no dependency and has no filter loop per sample. The K-weighting biquads are
derived for any rate from BS.1770-4's analogue prototypes (the libebur128 / pyloudnorm derivation). At 48 kHz they
reproduce the standard's table to 8.9e-16. The filters run as an FFT convolution with their impulse response,
truncated at 16,384 samples, where it has decayed below 1e-30. Checks against known answers:

- A 997 Hz 0 dBFS sine reads −3.010 LUFS at 48 kHz and −2.984 at 24 kHz. The bilinear warp at 24 kHz costs 0.026 LU.
- A fs/4 sine sampled 45° off its crest has a sample peak of −3.01 dBFS and a true peak of +0.10 dBTP (exact: 0.0). The
  32-tap-per-phase interpolator reads high by 0.1 dB, the safe direction.
- On the 15 cases it agrees with ffmpeg's ebur128, an independent implementation that resamples to 48 kHz and
  oversamples to 192 kHz, within 0.05 LU and 0.05 dB (harness: `/tmp/ntts-w4-loud/matrix.py`, ephemeral).
- A signal under −70 LUFS, the absolute gate, is returned unchanged.
- A response shorter than one 400 ms block cannot be gated, so it is measured ungated: a 300 ms tone lands at
  −16.00 LUFS.

pyloudnorm was not used, so no dependency was added. ffmpeg is the cross-check instead, and it is independent in both
filter design and sample rate.

**Cost.** 0.016 s for 2 s of audio, 0.083 s for 25 s, 0.88 s for 5 min and 3.6 s at the worker's 20-minute cap. That
is about 0.3% of the audio's duration, against synthesis at ~26× real time (§3): +8% on a response's wall time.

**The fidelity gate still sees the decoder.** `Scripts/ref_compare.py` (verify-python.sh check 7) compares the
synthesis before normalization. It runs the worker with `NTTS_LOUDNESS_NORMALIZE=0`, which only verification tooling
sets. The alternatives were comparing the normalized output, or gain-matching it to the reference. The reference is
PyTorch Kokoro's un-normalized output, and the level check exists to catch a decoder gain drift: mlx-audio 0.2.6 sat
2.65 dB low. Normalizing, or gain-matching, would hide exactly that drift. Measured: the normalized prose fixture
fails both thresholds (level +1.38 dB, log-mel L1 0.182 > 0.13). With the switch, check 7 reads −0.2 dB / 0.1153, as
it did before this change. Check 8 (`Scripts/verify_loudness.py`) covers the shipped path. It proves the normalized
output is that synthesis times one gain, and it holds the 15 cases to three rules:

- true peak ≤ −1.5 dBTP, by both meters;
- never louder than −15.5 LUFS;
- −16 ± 0.5 LUFS, or peak-bound: the true peak at the ceiling (≥ −1.6 dBTP), so no larger gain was possible.

The brief asked for ±0.5 LU on all 15. As shown above, that is impossible without a limiter, so the check asserts
what the algorithm guarantees and prints the reached count. `verify-python.sh`: PASS 8/8.

**Media.** All six demo clips were regenerated. The hero, the demo and the YouTube master were re-muxed at their
recorded offsets, with the video copied. Every clip sits at the same sample as before, and each rebuild was first
proven exact with the old clips (`assets/media/PROVENANCE.md`).

**Open.**
1. Whether to add a true-peak limiter so every response reaches −16 LUFS. This is the operator's call. It needs up to
   9 dB of peak reduction on am_michael's long text, and it changes the sound, not just its level.
2. The AAC encode of the videos adds ~0.1 dB of true peak, so `hero.mp4` peaks at −1.4 dBTP against the WAV's −1.5.

## 11. Loudness 1.5.1: −21 LUFS and a 3 dB limiter (measured 2026-09-24)

**What changed.** This closes §10's open item 1. The operator approved the course in decision packet `2df6627d38cc`;
the reasoning is in `limiter-decision/README.md`, option 4b.

- **Target.** `tts_worker.py` moves from −16 to −21 LUFS. The −1.5 dBTP ceiling is unchanged.
- **When the limiter runs.** Only when the true peak stops the single gain short of −21. It is a lookahead true-peak
  limiter: a 4× envelope, a 5 ms lookahead equal to the attack, a 60 ms release, and at most `LIMITER_MAX_GR_DB`
  = 3 dB of gain reduction.
- **Fallback.** The extension plays Samantha at `chrome.tts` volume 0.8.

**Gate (`verify_loudness.py`, ffmpeg ebur128, the same 15 cases and seeds as §10).**

| | §10 (1.5.0, −16, one gain) | 1.5.1 |
|---|---|---|
| Output LUFS | −25.0 … −16.0 (9.0 LU) | −22.1 … −21.0 (1.1 LU) |
| Cases at target ± 0.5 LU | 2 of 15 | 14 of 15 |
| Deepest limiting | none | 3.0 dB (am_michael/long, held by the cap at −22.1) |
| Samples more than 1 dB down | 0 | at most 0.27% |
| True peak (ffmpeg) | ≤ −1.5 dBTP | ≤ −1.5 dBTP |

At −21, 14 of the 15 cases reach the target with the single gain alone. The limiter runs only on am_michael/long:
the single gain stops at +2.7 dB there, and the limiter lifts that to +5.6 dB. (The 0.02–0.03 dB of "limiting"
that `verify_loudness.py` prints for the other 14 is 16-bit rounding in its per-sample ratio, as its docstring says.)

**The wider corpus.** 85 raw files: decision note D's 70 (the 28-voice catalogue, seed repeats, and 90 s and 2.5–3
minute articles in 5 voices) plus A's 15.

- **Output level.** −23.1 … −21.0 LUFS. Every file that reached the target is within 0.07 LU of −21.
- **Held below −21 by the cap (15 files), all long or peaky reads.**
  - am_michael's long text: the catalogue take and 8 seeds at −22.2 … −22.5, and the gate's take at −22.1.
  - Its articles: −23.1 at 90 s, −22.7 at 3 minutes.
  - The catalogue's am_onyx, bm_fable and bm_lewis long takes: −21.4 … −21.5.
- **Limiting.** At most 0.76% of samples are more than 1 dB down (am_onyx, catalogue text).
- **True peak.** ≤ −1.5 dBTP after 16-bit encoding for every file.
- **Meter unchanged.** The worker's own meter matches 1.5.0's to 7e-15.

**Cost.** Measured as CPU time (best of 5), because this run's load average was ~300 and wall time was noise.

- **What the limiter adds:** 1.45–1.71 ms per second of audio on the five 2.5–3 minute articles, 0.15–0.31 s each.
- **Against synthesis:** synthesis costs 46 ms per second of audio (warm RTF 21.6, `bench/results.json`, X4985), so
  the limiter adds **3.2–3.7%** of synthesis time. That meets the decision's bar of "a small fraction", target < 5%,
  so the limiter ships on (`LIMITER_MAX_GR_DB = 3.0`).
- **How it gets there.** The true-peak phases are computed once and shared by the meter and the limiter. Each re-aim
  pass meters the K-weighted input times the gain curve; the curve moves over milliseconds, so that reads within
  0.07 LU of the exact meter. The output is built and its true peak checked only once a pass has converged. The
  32-tap interpolation filters now run as a direct convolution, 3× faster than the FFT blocks and equal to 2e-16.
- **Memory.** The 5,000-character footprint check in `verify-all.sh` still applies.

**Fallback volume.** 0.8 applies B's law, `Level(v) = Level(1) − 24·(1 − v)`, measured through
`AVSpeechSynthesizer.write` with `AVSpeechUtterance.volume`, the property Chrome sets (`tts_mac.mm:329-331`).

**Measured live after the release (2026-09-24 23:36, once CoreAudio output worked again).**
`scripts/capture/tts-volume.sh` recorded Chrome for Testing 153 speaking the same sentence with Samantha (en-US,
rate 1) at `chrome.tts` volume 1.0, 0.8, 0.6, then 1.0 again. Loudness is ffmpeg ebur128, on the stereo capture:

| volume | LUFS | vs 1.0 | −24·(1−v) law | 20·log10(v) |
|---|---|---|---|---|
| 1.00 | −13.3 | +0.0 | 0.0 | 0.0 |
| 0.80 | −18.1 | **−4.8** | −4.8 | −1.9 |
| 0.60 | −22.9 | −9.6 | −9.6 | −4.4 |
| 1.00 (drift control) | −13.3 | +0.0 | 0.0 | 0.0 |

The live path follows B's law exactly, so Samantha's 0.8 is right and the 0.58 fallback is not needed. At volume 1
the capture reads −13.3 in stereo, about −16.3 as a mono file, which matches B's −16.4. Receipt:
`limiter-decision/live-volume/`.

Two findings about the tool. First, macOS renders `chrome.tts` speech in its own speech plug-ins, not in Chrome's
process, so an app-scoped capture records silence; `sckrec --all-audio` records every sound the Mac plays instead.
Second, even so, 3 of 4 runs that night recorded digital silence while the speech played (and `say` was recorded
the same way). `measure.py` refuses a capture without the expected four utterances, so a bad run prints "not
measured", never a wrong verdict; re-run it.
