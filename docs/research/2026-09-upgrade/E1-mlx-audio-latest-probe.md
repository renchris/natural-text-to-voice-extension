# E1: Latest mlx + mlx-audio on our Kokoro path (measured 2026-09-23)

**Question.** Does the latest mlx and mlx-audio run `tts_worker.py` unchanged, and is it better than the pinned stack (mlx 0.29.3, mlx-audio 0.2.6) that C2 measured?

**Answer: yes on both counts. Upgrade, with four conditions.** mlx **0.32.2** plus mlx-audio **0.5.5** run the worker **byte-for-byte unchanged** (no patch). The upgrade brings:

- **higher-fidelity audio**: upstream fixed five decoder bugs, including a constant −2.5 dB attenuation and an F0 misalignment;
- a worker that is ready in **0.38 s instead of 3.83 s**, with **first audio 2.3 s after spawn instead of 5.4 s**;
- a **520 MB** Python environment instead of 2.1 GB, with no torch;
- **all 54 voices working offline** (today only 8 do);
- about **420 MB less idle RSS**.

**Warm synthesis compute speed is unchanged.** The 80–160 ms per-request win measured online is the removed Hugging Face round-trip, not faster inference.

The four conditions are each a way the upgrade breaks if done naively:

1. The floor moves to **macOS 14**.
2. **misaki must be installed explicitly.** Otherwise the worker reports ready and then fails every request.
3. Python must be **≤ 3.12**.
4. The helper needs a **warm-up `generate`**, run inside the existing stdout redirect.

On the model ID and the streaming question:

- **Model ID.** The README-canonical ID `mlx-community/Kokoro-82M-bf16` has **byte-identical weights** to our `prince-canuma/Kokoro-82M`, and voices still load from `prince-canuma` either way. Keep our ID. The quantized variants are not faster, save only about 40 MB, and drift the pitch contour, so do not use them.
- **Streaming.** A segment generator already exists in both versions. Splitting off only the first sentence ("hybrid") cuts time to first audio from **~1.3 s to 0.09–0.52 s** and adds under 1% audio (+0.75 s on L400). Per-sentence splitting adds 11–14% audio, mostly as extra pauses.

Scratch work, logs, drivers and every WAV are under `/tmp/ntts-e1/`. No tracked file was touched. The only repo write is this file.

---

## 1. Target versions (every value fetched 2026-09-23)

| Package | Pinned today | **Latest → target** | Uploaded | Source |
|---|---|---|---|---|
| mlx | 0.29.3 | **0.32.2** | 2026-08-25 | https://pypi.org/pypi/mlx/json |
| mlx-metal | 0.29.3 | **0.32.2** | 2026-08-25 | https://pypi.org/pypi/mlx-metal/json |
| mlx-audio | 0.2.6 | **0.5.5** (25 releases later) | 2026-09-21 | https://pypi.org/pypi/mlx-audio/json |
| misaki | 0.9.4 | **0.9.4** (no newer release) | 2025-04-05 | https://pypi.org/pypi/misaki/json |
| spacy / en_core_web_sm | 3.8.8 / 3.8.0 | **3.8.16** / **3.8.0** | 2026-08-24 | https://pypi.org/pypi/spacy/json · wheel `https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.8.0/en_core_web_sm-3.8.0-py3-none-any.whl` |
| phonemizer-fork / espeakng-loader / num2words | 3.3.2 / 0.2.4 / – | **3.3.2 / 0.2.4 / 0.5.14** (unchanged) | 2025 | PyPI JSON for each |
| soundfile | 0.13.1 | **0.14.0** | 2026-06-06 | https://pypi.org/pypi/soundfile/json |
| numpy | 2.2.6 | **2.5.3** on Python 3.12 (2.5 requires ≥ 3.12); **2.4.6** on 3.11 | 2026-09-06 | https://pypi.org/pypi/numpy/json |
| huggingface-hub | 0.36.0 | **1.32.0** (httpx-based, 1.x API) | 2026-09-17 | https://pypi.org/pypi/huggingface-hub/json |
| transformers | 4.57.1 | **5.17.0**, a hard dependency of mlx-audio (`>=5.14.0`) but **never imported** on the Kokoro path | 2026-09-09 | https://pypi.org/pypi/mlx-audio/0.5.5/json (`requires_dist`) |
| torch | 2.9.0 | **not installed** (only `misaki[en]` would pull 2.14.0) | – | https://pypi.org/pypi/misaki/0.9.4/json |
| Python | 3.11.4 | **3.12.13** (uv-managed); 3.11.4 also verified | – | §2.3 |
| Kokoro weights | `prince-canuma/Kokoro-82M` @ `e02c9ea` | **same** (see §4) | 2026-01-05 | https://huggingface.co/api/models/prince-canuma/Kokoro-82M |

The upstream changes that matter for Kokoro, from the release notes (`gh api repos/Blaizzy/mlx-audio/releases`):

- **v0.4.8, [PR #859](https://github.com/Blaizzy/mlx-audio/pull/859)** (merged 2026-08-05). Five decoder fixes to match the PyTorch reference: the constant **−2.5 dB** output attenuation, a symmetric-vs-periodic window mismatch, a one-frame misalignment in the F0/energy path, the SineGen phase distribution, and an interpolation wrap. The PR reports, as its own claims: mel-L1 0.601 → 0.187, MCD 7.29 → 4.09 dB, F0 RMSE 11.5 → 5.1 Hz, and "output durations are unchanged". The PR warns: *"all Kokoro output becomes ~2.5 dB louder (×4/3)"*.
- **v0.4.3, [PR #664](https://github.com/Blaizzy/mlx-audio/pull/664).** misaki moved to an **optional** install.
- **v0.4.3, [PR #624](https://github.com/Blaizzy/mlx-audio/pull/624).** Quantized Kokoro checkpoints load correctly, and NaN durations are guarded.
- **v0.4.4, [PR #745](https://github.com/Blaizzy/mlx-audio/pull/745).** Kokoro works from worker threads.
- **v0.2.10, [PR #364](https://github.com/Blaizzy/mlx-audio/pull/364).** Voices load from `.safetensors`, local cache first.
- **v0.2.8, [PR #290](https://github.com/Blaizzy/mlx-audio/pull/290).** Lazy TTS/STT imports.

mlx 0.30.0 notes "Faster fully depthwise-separable 1D conv" (`gh api repos/ml-explore/mlx/releases`), which is relevant to Kokoro's conv decoder. It produced no measurable compute gain here (§3.2).

There is no newer English Kokoro model. `hexgrad/Kokoro-82M` (v1.0) was last modified 2025-04-10 and has 11.8 M downloads. Its only sibling is `Kokoro-82M-v1.1-zh`, which is Chinese-only (https://huggingface.co/api/models?author=hexgrad). The gains are all library-side.

## 2. Install: minimal set, footprint, and the traps

### 2.1 The minimal set that runs Kokoro (verified: the venv equals this lock plus one wheel, diff-checked)

```bash
uv venv --python 3.12 /tmp/ntts-e1/venv
# req-minimal.in: mlx-audio==0.5.5  mlx==0.32.2  misaki==0.9.4  num2words  spacy  phonemizer-fork  espeakng-loader  soundfile
MACOSX_DEPLOYMENT_TARGET=14.0 uv pip compile --python-version 3.12 --python-platform aarch64-apple-darwin req-minimal.in -o lock-minimal-py312.txt
uv pip install --python /tmp/ntts-e1/venv/bin/python -r lock-minimal-py312.txt \
  https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.8.0/en_core_web_sm-3.8.0-py3-none-any.whl
```

The lock files are `/tmp/ntts-e1/lock-minimal-py312.txt` (88 pins) and `lock-minimal-py311.txt`. Both re-resolved to the same pins at 15:5x, so they are reproducible.

| | Repo venv (today) | **Latest, minimal** | mlx-audio only (no misaki) |
|---|---|---|---|
| Size on disk (`du -sh`) | **2.1 G** | **520 M** (504 M on Python 3.11) | 361 M |
| Packages | 183 | **91** | 37 |
| torch / gradio / opencv / pyarrow / onnxruntime / librosa / numba / pandas / sklearn / mlx-lm / mlx-vlm | all present | **none** | none |
| transformers | 4.57.1 | 5.17.0, installed but never imported (checked `sys.modules` after a real `generate`) | 5.17.0 |
| What `import mlx_audio.tts.utils` loads | **3,309 modules in 3.96 s, 410 MB RSS**, including torch, transformers, scipy, pandas, sklearn | **616 modules in 0.21 s, 63 MB** | – |

The last row is the cause of both the startup gap and the idle-memory gap in §3.

### 2.2 Traps, each measured

1. **Bumping only the pin breaks silently.** In a venv with `mlx-audio==0.5.5 soundfile` only (what `setup-python-env.sh:82-86` would produce after a version bump), the unchanged worker logs **"Model loaded, ready for requests"** after 1.8 s, so Swift marks it warm and binds HTTP. Every request then fails with `Kokoro requires the optional 'misaki' package…` (`/tmp/ntts-e1/log_nomisaki_nomisaki.txt`). The health check would read 200 while every `/speak` returns 500.
2. **`misaki[en]` pulls torch.** The extra adds `spacy-curated-transformers`, which pulls **torch 2.14.0** (a 127 MB wheel; C2 measured torch at 387 MB installed) plus sympy and networkx. Our path imports none of them. Install misaki's English deps explicitly instead, as in §2.1.
3. **`en_core_web_sm` must be preinstalled.** Otherwise `misaki/en.py:499-501` runs `spacy.cli.download()` on the **first request**, a runtime pip install into the app's venv (and a uv venv has no pip).
4. **macOS 14 is the new floor.** mlx **0.29.3 is the last release with `macosx_13_0` wheels**. 0.29.4 and later ship only 14, 15 and 26 (PyPI file list). mlx-audio 0.5.5 needs `mlx>=0.31.1`. Resolving for uv's default `aarch64-apple-darwin` target (macOS 13) **fails**: *"Wheels are available for mlx (v0.32.2) on … macosx_14_0_arm64 …; requirements are unsatisfiable"*. The helper declares `.macOS(.v13)` (`native-helper/Package.swift:8`) and "macOS 13+" (`native-helper/README.md:98`). Both must move to 14.
5. **Python ceiling is 3.12.** misaki 0.9.4 declares `Requires-Python <3.13,>=3.8`. `pip download --python-version 3.13 misaki==0.9.4` exits 1 ("Ignored the following versions that require a different python version"). uv resolves it anyway because it does not enforce the upper bound, so a uv lock for 3.13 is misleading. mlx itself ships cp310–cp314, so the repo's "Python 3.9-3.11 (Python 3.12+ not yet supported by MLX)" (`native-helper/README.md:101`) is stale.

### 2.3 Python 3.11 vs 3.12

Both work with the same lock and the unchanged worker. Warm latency is at parity (paired ratios 0.91–1.06, n=2 per text, tag `py311`). The only lock differences are numpy (2.4.6 vs 2.5.3) and scipy (1.17.1 vs 1.18.1). Recommendation: 3.12, the newest that pip will install misaki on.

## 3. Baseline vs latest (same machine, same unchanged `tts_worker.py`, same length-prefixed stdin protocol, voice `af_bella`, speed 1.0)

### 3.1 Headline table

| Metric | Baseline (mlx 0.29.3, mlx-audio 0.2.6, py 3.11.4) | **Latest (mlx 0.32.2, mlx-audio 0.5.5, py 3.12.13)** | Change | Runs |
|---|---|---|---|---|
| Worker spawn → "ready" | 3.83 s [3.77–4.07] | **0.38 s** [0.36–0.42] | **−90%** | cold1–5 (n=5 each, load 6–7) |
| …of which `import mlx_audio` | 2.90 s | 0.22 s | −92% | same |
| Cold first request (S15) | **1.56 s** [1.51–1.58] | 1.89 s [1.84–1.93] | **+0.33 s** (imports moved to first use) | same |
| **Spawn → first audio (S15)** | 5.36 s [5.35–5.63] | **2.30 s** [2.21–2.31] | **−57%** | same |
| Warm S15 (15 words, 9.0 s audio) | 0.467 s · RTF 19.3× | **0.381 s · RTF 23.6×** | −86 ms, 3/3 paired | pair3 (cleanest) |
| Warm M60 (60 words, 29.0 s) | 1.212 s · 23.9× | **1.167 s · 24.8×** | −76 ms, 3/3 | pair3 |
| Warm L400 (407 words, 171.5 s) | 6.935 s · 24.7× | **6.718 s · 25.5×** | −159 ms, 3/3 | pair3 |
| Warm, pooled paired ratio latest/baseline | – | S15 **0.80** · M60 **0.94** · L400 **0.98** | latest faster in 9/9 · 8/9 · 6/9 | pair2–4 (n=9 per text) |
| X5000 (4,985 chars, 325 s audio) | 14.31 / 14.69 s | 13.15 / 13.53 s | ≈ −8% (n=2) | long1 (predecessor session) |
| **Both offline (`HF_HUB_OFFLINE=1`)**, paired ratio | – | S15 1.10 · M60 0.95 · L400 1.05 | **parity** (1/3, 3/3, 1/3) | pair5 |
| Per-request Hugging Face calls | 1 voice resolve per request (C2: ~72 ms online) | **0** (httpx log); 1 revision call at startup; 0 when offline | – | logs, off2 |
| Voices usable offline | **8** (the `.pt` files cached at `refs/main`) | **54** (all cached `.safetensors`) | `bm_george` offline: baseline 500-equivalent error, latest OK | off2, off_* |
| Worker RSS after ready | 806–809 MB | **387–388 MB** | −420 MB | pair2–4 |
| Worker RSS peak | 1,086–1,099 MB | **727–743 MB** | −350 MB | pair2–4 |
| Physical footprint after load (`vmmap`) | 690–694 MB | **369 MB** | −47% | pair2–5 |
| Footprint retained after L400 | 887–892 MB | **607–618 MB** | −280 MB | pair2–4 |
| Footprint lifetime peak | 7.7 GB | 7.5 GB | ≈ same (activation memory, not weights) | pair2–4 |
| Output | 24 kHz mono PCM16, identical durations | same format, **identical durations** (9.0 / 29.0 / 171.5 / 325.15 s), **+2.45 dB** louder | §6 | all |
| Python env | 2.1 GB · 183 pkgs | **520 MB · 91 pkgs** | −75% | §2.1 |

**Reading the speed rows.** With both stacks offline (pair5) the compute is at parity. The consistent 80–160 ms online win is the per-request voice lookup that 0.2.6 performs on huggingface.co (`pipeline.py:135 hf_hub_download` in the repo venv). 0.5.5 resolves voices local-first (`pipeline.py:169-199`, `snapshot_download(..., local_files_only=True)`). Baseline can get the same win today with `HF_HUB_OFFLINE=1`, but only for the 8 cached voices.

Worker-level numbers are consistent with C2's HTTP-level baseline (S15 0.481 s, M60 1.316 s, L400 7.733 s through Swift and curl).

### 3.2 First run after a fresh install: a new cost, now measured

The first request ever served from a **freshly installed** venv is slow. This happened on every fresh venv tried:

| Venv | 1st cold S15 | 2nd | 3rd |
|---|---|---|---|
| New 3.12 venv (`venv312b`, tags first1–3) | **17.07 s** (spawn → audio 18.8 s) | 2.64 s | 2.64 s |
| New 3.11 venv (`venv311`, tag py311) | **13.18 s** | later runs 1.9–2.9 s | – |
| Predecessor's first run of `venv` (tag smoke) | 22.2 s (included a model download) | 0.61 s warm | – |

Missing bytecode explains only ~0.6 s of it. Removing all `.pyc` files gives a cold request of 2.5–2.9 s, versus 1.9–2.3 s with them, and `compileall` takes 3.0 s and adds 163 MB. The remaining ~11–14 s is **not attributed** (candidates: first load of new native libraries, first Metal pipeline build). Whatever the cause, the mitigation is the same: run **one warm-up `generate` when the helper starts** (and once at install). That also removes the steady +0.33 s cold penalty.

The Swift helper today reports ready before any `generate` has run, so without a warm-up the first user request after an upgrade would take ~17–19 s. That is under the extension's 30 s `/speak` timeout, but only just.

## 4. The model ID: what is canonical today, and should we switch?

| Repo (https://huggingface.co/api/models/<id>) | Last modified | Downloads | Weights | Our measurement (ids2, n=3, load ≈ 12.5) |
|---|---|---|---|---|
| `prince-canuma/Kokoro-82M` (**ours**) | 2026-01-05 | 7,632 | `kokoro-v1_0.safetensors` 327,115,152 B, LFS sha256 `4e9ecdf03b8b6cf9…`, **548 tensors, all F32** | S15 0.395 · M60 1.177 · L400 7.161 s |
| `mlx-community/Kokoro-82M-bf16` (**mlx-audio README's default**, `README.md` "Kokoro TTS") | 2025-12-02 | 45,153 | **byte-identical**: same sha256, same size; `config.json` identical too. The "bf16" name is inaccurate; the tensors are F32 | parity (ratio 0.98–1.00); F0 contour vs ours matches the within-stack noise floor (corr 0.988, 0 cents) |
| `mlx-community/Kokoro-82M-8bit` | 2026-01-05 | 552 | 289 MB: only 87 tensors quantized (13.2 MB packed), 276 MB still F32; `{"group_size":64,"bits":8}` | parity (ratio 1.00–1.05). F0 drift **20 cents** median, contour corr 0.77 |
| `mlx-community/Kokoro-82M-6bit` | 2026-01-05 | 99 | 286 MB | parity. F0 drift **28 cents** |
| `mlx-community/Kokoro-82M-4bit` | 2026-01-05 | 866 | 283 MB (plus a 327 MB `.pth` that the default download patterns also fetch) | parity. F0 drift **60 cents**, contour corr 0.72; durations shift (M60 29.025 s vs 29.0) |

- **Keep `prince-canuma/Kokoro-82M`.** The recommended bf16 ID loads the same bytes. Worse, `base_load_model` builds `Model(config)` without a `repo_id` (`mlx_audio/utils.py:393`), so voices always resolve from `KokoroModel.REPO_ID = "prince-canuma/Kokoro-82M"` (`kokoro.py:72, 288`). Switching IDs would make the offline cache depend on **two** repos. This was reproduced: `mlx-community/Kokoro-82M-bf16` offline failed on a voice missing from the `prince-canuma` cache (`log_off_bf16_bf16off.txt`).
- **Do not use the quantized variants.** They are not faster, save about 40 MB of RSS (346–351 vs 386–390 MB), and leave the 7.4 GB activation peak unchanged. Their pitch contour drifts further from full precision as bit width drops (M60: 20, 28 and 60 cents median |ΔF0|, where the full-precision render-to-render noise floor is 0 cents and corr 0.98).
- `mlx-audio` 0.5.5 still resolves `refs/main` with one Hub API call at startup (`utils.py:145 snapshot_download`). Run the helper with `HF_HUB_OFFLINE=1` after prefetching the voices, or pin a local path, for a zero-network helper.

## 5. Streaming: a segment API exists, and the hybrid split is the right shape

`KokoroModel.generate()` is a **generator that yields one `GenerationResult` per segment** in both 0.2.6 and 0.5.5 (`kokoro.py:293-370`). Segmentation is `re.split(split_pattern)` (default `r"\n+"`) followed by ≤ 510-phoneme chunks (`pipeline.py:425-460`). mlx-audio's `stream=True` and `streaming_interval` arguments are swallowed by Kokoro's `**kwargs`, so for Kokoro, streaming means iterating segments.

mlx-audio's own server shows the pattern: it emits each segment as its own encoded blob and checks a cancel event between segments (`server.py:655-673`). But it never passes `split_pattern`, so its Kokoro stream also starts with a ~29 s chunk.

Probe: `/tmp/ntts-e1/stream2_probe.py`, in-process, pipeline pre-warmed, arms rotated per rep, n=3. *Stall* is the worst gap if segments play back-to-back from the first one.

| Text | Arm | **Latest TTFA** (median, range) | First chunk | Total | Audio | Chunks | Stall | Baseline TTFA |
|---|---|---|---|---|---|---|---|---|
| M60 | newline (today) | 1.256 s [1.15–1.33] | 29.0 s | 1.30 s | 29.00 s | 1 | 0 | 1.903 s |
| M60 | per-sentence | 0.548 s | 10.25 s | 1.75 s | 31.98 s (+10%) | 3 | 0 | 0.642 s |
| M60 | **hybrid** | **0.429 s** | 10.25 s | 1.35 s | 30.95 s (+6.7%) | 2 | 0 | 0.867 s |
| L400 | newline (today) | 1.263 s [1.15–1.38] | 29.2 s | 7.07 s | 171.50 s | 7 | 0 | 1.264 s |
| L400 | per-sentence | 0.501 s | 14.25 s | 8.07 s | 190.78 s (**+11%**) | 23 | 0 | 1.067 s |
| L400 | **hybrid** | **0.522 s** | 14.25 s | 7.26 s | 172.25 s (+0.4%) | 7 | 0 | 0.823 s |
| X5000 | newline (today) | 1.809 s [1.17–1.86] | 29.4 s | 19.3 s* | 325.15 s | 13 | 0 | 1.302 s |
| X5000 | per-sentence | 0.095 s | 1.62 s | 18.1 s | 371.15 s (**+14%**) | 58 | 0 | 0.152 s |
| X5000 | **hybrid** | **0.085 s** | 1.62 s | 16.2 s | 325.93 s (+0.2%) | 14 | 0 | 0.153 s |

\* One X5000 newline rep ran during sibling GPU load (RTF 16.9×). The baseline probe ran sequentially after latest, under some contention (RTF 13–19×), so compare TTFA within a stack, not across.

- **Hybrid** means `generate(first_sentence)` followed by `generate(rest)` with today's default split. TTFA then equals the synthesis time of the first sentence: 0.09 s for a short one, 0.5 s for L400's 32-word opener. Everything after that is chunked exactly as today. Per-sentence splitting instead adds **~1 s of lead-plus-trail silence per segment**: pause time went 32.0 → 42.2 s on L400 and 59.1 → 91.3 s on X5000 (`stream2_sanity.jsonl`). **No arm ever starved playback** (stall 0 in all 54 runs), because generation runs at ≥ 17× real time.
- **This is roughly a 12× TTFA improvement for long text, with no model change.** It needs the helper to stream (framed chunks over the stdin/stdout pipe and HTTP). That design belongs to R04; this probe only establishes the model-side numbers.
- **Protocol hazard introduced by 0.5.5.** `_get_pipeline` now `print()`s "Creating new KokoroPipeline for language: a" **to stdout** (`kokoro.py:285`); 0.2.6 used loguru on stderr (`kokoro.py:261`). The worker is safe only because `generate` is iterated inside `redirect_stdout(devnull)` (`tts_worker.py:149`). No run produced a corrupt frame. A startup warm-up, or a streaming loop that writes frames, **must keep that guard** (or write frames via `sys.__stdout__.buffer`). Otherwise that line is read as a 4-byte length prefix.

## 6. Listen-proxy (crude sanity, not a MOS)

- **Format and integrity.** All **261 WAVs** from this session are 24 kHz, mono, PCM_16, with **0 clipped samples, 0 NaN, 0 silent files** (`/tmp/ntts-e1/wav_sanity2.jsonl`, `stream2_sanity.jsonl`).
- **Durations** are identical baseline vs latest for every text (9.000 / 29.000 / 171.500 / 325.150 s), matching PR #859's claim that durations are unchanged.
- **Level.** For `af_bella`, baseline RMS is −27.2 to −27.8 dBFS and latest is −25.0 to −25.4 dBFS: **+2.45 dB**, matching the PR's ×4/3 (+2.50 dB). The highest `af_bella` peak is −5.84 dBFS on baseline and −3.78 dBFS on latest.
- **Clipping headroom across all 54 voices** (latest, M60, the worker's exact call, `voice_sweep.jsonl`). **No sample reached full scale**, but headroom is thin for some voices: `if_sara` −0.44 dBFS, `jm_kumo` −0.92, `zm_yunyang` −1.50; the loudest English voice is `bf_isabella` at −2.09. Add a peak guard in the worker (scale down if `max|x| > 0.98`) before the upgrade ships.
- **What changed in the sound.** The same stack rendered twice already differs, because the decoder is stochastic: waveform corr 0.997, log-spectrogram corr 0.98. Across stacks the waveform corr is −0.16 and the log-spectrogram corr 0.53. `timbre_pitch.py` decomposes that gap:
  - the **long-term spectrum is identical** (every band from 50 Hz to 12 kHz within ±0.6 dB after level normalisation);
  - **median F0 is the same** (~198 Hz);
  - but the **F0 micro-contour moved**: contour corr 0.82–0.86 across stacks vs 0.97–0.98 within, median |ΔF0| 15–18 cents vs 0.

  This is exactly the F0-path fix PR #859 describes (upstream reports "F0_pred relRMSE 0.134 → 0.0000" against PyTorch). Same voice, same timbre, corrected intonation. Whether it *sounds* better is upstream's measured claim (MCD 7.29 → 4.09 dB against the PyTorch reference), not ours. A human A/B listen is the remaining check.
- **Files to listen to:**
  - `/tmp/ntts-e1/wav/pair3_baseline_warm_M60_r1.wav` vs `/tmp/ntts-e1/wav/pair3_latest_warm_M60_r1.wav`
  - `/tmp/ntts-e1/wav/pair3_{baseline,latest}_warm_L400_r1.wav`
  - streaming first chunks in `/tmp/ntts-e1/stream2/latest_*_hybrid_first.wav`
  - all 54 voices in `/tmp/ntts-e1/voices/*.wav`

## 7. The diff

**No diff to `tts_worker.py` is needed.** The copy at `/tmp/ntts-e1/tts_worker.py` is byte-identical to `native-helper/Sources/NaturalTTSHelper/Resources/tts_worker.py` (`diff` exit 0). It ran on both stacks for every row above.

The only patch in this probe is a **test-harness** change, used solely to point the ids2 arms at different repos (`/tmp/ntts-e1/patch_modelid.diff`). It is not proposed for the repo:

```diff
-        _model_cache = load_model("prince-canuma/Kokoro-82M")
+        _model_cache = load_model(__import__("os").environ.get("NTTS_MODEL_ID", "prince-canuma/Kokoro-82M"))
```

It is applied at both `load_model` call sites (`tts_worker.py:77` and `:91`).

**Changes the upgrade PR should carry.** These come from the measurements above; none was applied here.

- `setup-python-env.sh`: install the §2.1 set plus the `en_core_web_sm` wheel, from a committed lockfile. Never bump the `mlx-audio` pin alone (§2.2 trap 1).
- `Package.swift` and the READMEs: macOS 14; Python 3.12.
- Worker:
  - one warm-up `generate("Warm up.", voice=…)` inside the redirect, before printing "ready";
  - a peak guard;
  - optionally `lang_code` taken from the voice prefix. The "Language mismatch" warning for `b*`/`j*` voices is unchanged from baseline, because the worker still never passes `lang_code`.
- Helper launch environment: `HF_HUB_OFFLINE=1` after prefetching the voices.

## 8. Method and conditions

- **Machine and load.** M1 Max, 64 GB, macOS 15.7.9. The GPU was shared with sibling agents: an R01 ASR benchmark, a repo helper on :8249 (pid 31790, left untouched), and tsc/bats jobs. Load average ranged from 6 to 84.
- **Gating.** Every run in this session waited for **6–8 consecutive seconds of GPU utilisation ≤ 15%** (`ioreg` "Device Utilization %") before starting (`run_all.sh`, `run2.sh`, `run_cold.sh`).
- **Harness** (`/tmp/ntts-e1/driver.py`):
  - spawns each arm's worker **sequentially**, so startup is uncontended;
  - then runs rounds that **alternate arm order** (A,B then B,A), so drift in sibling load hits both arms;
  - uses a 50 ms heartbeat to detect driver stalls;
  - records the worker's own "Total generation time" as a second, independent clock (they agree within 1–50 ms);
  - samples RSS every 0.2 s and calls `vmmap --summary` after each request;
  - runs the baseline arm from the repo venv's interpreter with `PYTHONDONTWRITEBYTECODE=1`, so nothing is written into the repo venv.
- **Which runs count.** The predecessor session (14:35–15:18, same harness, interrupted before writing this report) produced tags pair1–3, start1–3, startoff, long1, ids1, off_*, prefetch, stream (v1). This session (15:37–16:18) produced pair4, pair5, ids2, off2, stream2, cold1–5, py311, pyc_*, first1–3, nomisaki, and the voice sweep.

| Status | Tags | Why |
|---|---|---|
| **Clean, used** | pair2, pair3, long1, ids2, pair5, cold1–5, stream2-latest | Low load; low within-arm variance |
| **Paired, used** | pair4 | Rounds 1–2 under sibling load (RTF 12–17×), round 3 clean; alternation spreads the load across both arms |
| **Functional only** | off_*, off2, nomisaki, first1–3, pyc_*, voice sweep | Correctness or presence results; timing not the point |
| **Excluded** | pair1 (one latest L400 round-trip of 64 s vs worker 7.3 s, a driver stall), ids1 (load 27), stream v1 latest (RTF fell to 5–7×), smoke (first run of the venv plus download) | Contaminated |

## 9. Reproduce

```bash
cd /tmp/ntts-e1
python3 driver.py pairN "baseline=<repo venv python>::tts_worker.py::PYTHONDONTWRITEBYTECODE=1" "latest=venv/bin/python::tts_worker.py::PYTHONDONTWRITEBYTECODE=1"
python3 aggregate.py pair2,pair3,pair4 ; python3 paired.py pair2,pair3,pair4 baseline latest
venv/bin/python stream2_probe.py latest 3          # TTFA per split arm
venv/bin/python analyze_wav.py sanity              # listen-proxy over wav/
venv/bin/python timbre_pitch.py '[["wav/pair3_baseline_warm_M60_r1.wav","wav/pair3_latest_warm_M60_r1.wav"]]'
```

Artifacts in `/tmp/ntts-e1/`:
- `results_*.jsonl`: every request;
- `log_<tag>_<arm>.txt`: worker stderr;
- `wav/`, `stream2/`, `voices/`: audio;
- `fresh/`: HF API, GitHub release and PR JSON fetched in this run;
- `lock-minimal-py3{11,12}.txt`;
- `run_all.log`: gate and step timeline.

## 10. Gaps

- **No human listening test.** The quality claim (MCD, F0 RMSE, WER parity) is upstream's, from PR #859. Our evidence shows same timbre, same durations, a changed F0 micro-contour, correct level, and no clipping.
- **Cause of the first-run cost (§3.2) not attributed.** Measured on two fresh venvs plus the predecessor's run. The baseline stack's first run after install was not measured, because the repo venv cannot be reproduced from its setup script (C2 §4.6).
- **Measured on the worker, not through Swift/HTTP.** The upgrade has not been benchmarked end-to-end through the Swift helper. C2's HTTP numbers sit within ~10% of the worker-level baseline here.
- **Hybrid split is a model-side prototype.** A streaming wire format for the pipe and HTTP (R04's scope) is still needed before users see the TTFA gain.
- **Python 3.13+ and macOS 13 not runnable** on this stack, for the reasons in §2.2.
