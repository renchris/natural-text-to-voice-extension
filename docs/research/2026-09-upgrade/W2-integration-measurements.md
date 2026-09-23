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
