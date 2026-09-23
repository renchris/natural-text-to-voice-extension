# R10 — Red team: reasons not to upgrade, and ways the publishing plan fails

*Axis R10 of the 2026-09 upgrade research · written 2026-09-23 · base `main` @ `fe2ea58` (extension 1.4.0).
Every version, date and policy claim below was fetched from a primary source in this run (URLs inline and in
[Sources](#sources)). Every "it works / it breaks" claim was **measured on this machine** (Apple M1 Max, macOS
15.7.9) in scratch environments under `/tmp/ntts-r10/`. Nothing in the repo or its existing venv was touched.
Caveat on timings: the machine ran at load average 15–30 throughout, so timings are only compared when the runs
were interleaved.*

---

## Verdict

**The red team could not break the upgrade itself. What it did find: the plan fails on four things around the
upgrade.**

1. **The environment is not locked.** The setup script pins 3 of about 600 packages. A fresh install today already
   gets a different stack from the one that was tested.
2. **The upgrade drops macOS 13, and nothing says so.** Every mlx wheel after 0.29.3 requires macOS 14.
3. **Kokoro is now a second-class citizen in mlx-audio.** A maintainer called it "not a SOTA model anymore". One
   release broke it for most inputs for 33 days.
4. **The store listing assumes a companion app, and the store cannot target an OS.** Every Windows, Linux,
   ChromeOS and Intel-Mac user, and possibly the reviewer, gets an extension that does nothing.

Holding back is not free either. The pinned mlx-audio 0.2.6 has a measured **−2.5 dB level error and pitch-contour
error** against the Kokoro reference. mlx-audio 0.4.8 fixed it, and this run reproduced the fix (+2.42 dB).

### Ranked risks: "do not do X", with likelihood, impact, mitigation and conviction

| # | Do NOT … | Likelihood | Impact | Mitigation | Conviction |
|---:|---|---|---|---|---:|
| 1 | …submit a helper-only extension (no in-browser fallback) to the Chrome Web Store | **Medium–high.** Reviewers reject what they "cannot reproduce" (Red Potassium). Yellow Magnesium was issued to a working extension that needed an outside account. The store has no OS targeting. | High: rejection round-trips, and 1★ reviews from users who cannot run the helper | Ship a working **fallback engine** (chrome.tts system voices at minimum). Put "Requires macOS 14+ on Apple Silicon + free companion app for neural voices" in the first line of the description. Fill in the **Test instructions** tab and add a YouTube demo. Make the helper-missing UI name the fix. | **75%** |
| 2 | …upgrade *anything* before the Python env is locked | **Certain (already happening).** A fresh resolve gives transformers 5.17.0 / hf-hub 1.32.0 / torch 2.10.0. The tested env has 4.57.1 / 0.36.0 / 2.9.0. | High: users run an untested stack; the maintainer can't reproduce bugs | Commit a hash-locked lock file (`uv pip compile --generate-hashes`), install `en_core_web_sm` at setup, and pin the HF revision | **95%** |
| 3 | …bump mlx past 0.29.3 without also raising the stated minimum macOS to 14 | **Certain if upgraded.** mlx 0.29.4+ ships only `macosx_14_0`+ wheels; uv refused to resolve mlx 0.32.2 for macOS 13. | Medium: the helper silently cannot install on Ventura, while `Package.swift` still says `.macOS(.v13)` | Operator decision: raise the floor to macOS 14 everywhere (Package.swift, README, listing), or stay on 0.29.3 and keep the audio bugs | **97%** |
| 4 | …let mlx-audio float (ranges, `latest`, or `>=`) | **High.** 21 releases in 10 months. 0.4.4 broke Kokoro for most inputs (2026-06-06 → fixed in 0.4.5, 2026-07-09). 0.3.0 hard-pinned a transformers **release candidate**. | High: synthesis raises on ordinary sentences | Pin exact versions (`mlx==0.32.2 mlx-audio==0.5.5`). Gate every bump on the Kokoro probe in §1 (30 utterances, NaN check, speed ratio). | **95%** |
| 5 | …take a model's licence from its `mlx-community` tag, or ship any NC / research-only / Llama-derived model | **High.** Ports mislabel: Higgs v2 ports are tagged `apache-2.0`, but upstream is a Llama-3-derived licence with a 100k-user cap. csm-1b and pocket-tts ports are ungated copies of gated upstreams. The OmniVoice port has no tag, while upstream weights are CC-BY-NC. | High: licence breach, forced takedown | Trace every licence to the upstream card or LICENSE. Allow-list only Apache/MIT/CC-BY. Reject gated models: they return 401 without a Hugging Face token. | **95%** (tags); **88%** (reject NC) |
| 6 | …ship espeak-ng (the helper's python-env, or phonemizer.js in a WebGPU build) under an "MIT" banner without GPL-3.0 compliance | **High if distributed.** `espeakng-loader` bundles `libespeak-ng.dylib`; phonemizer.js ships a 1.4 MB espeak-ng wasm build labelled Apache-2.0. | Medium: licence non-compliance. This is not a store violation code. | Ship COPYING and offer the source for espeak-ng. Better: have the installer fetch it on the user's machine instead of bundling it. Add the missing root LICENSE. | **85%** |
| 7 | …publish with the `<all_urls>` content script, an unused `activeTab`, and the current PRIVACY.md | **Medium.** In-depth review is triggered by `<all_urls>`. `activeTab` is never used in `src/`. PRIVACY.md claims Chrome Sync, but the code uses `storage.local`, and it lists a `scripting` permission that the manifest does not declare. | Medium–high: Purple Potassium, or Purple Lithium / inaccurate privacy fields | Inject the script on demand (`activeTab` + `scripting.executeScript`) instead of on all URLs. Rewrite the policy from the code. Declare **Website content** in the data-usage fields: local-only handling still must be disclosed. | **85%** |
| 8 | …launch under the bare name "Natural Text-to-Speech" | **Low** chance of a complaint (~15%) | Medium: renaming after launch loses ratings and search position | Pick a distinctive brand plus a descriptive subtitle. "NATURALREADER" is a registered US mark (Reg. 4,039,798) for TTS software, and its owner's extension is Featured with 1M users. "Natural Text Reader" also exists. | **70%** |
| 9 | …take TypeScript 6/7, `@types/chrome` 0.3.0 or vite 8 as drop-in bumps | **Certain (verified).** TS 6.0.3 → TS5101 and TS 7.0.2 → TS5102 on `baseUrl`. `@types/chrome` 0.3.0 → 3 type errors. vite isn't used by the build. | Low–medium: `bun run build` runs `tsc` first and fails | Remove `baseUrl` and use `"./src/*"`. Fix 3 `storage.get` typings. **Delete** vite and vite-plugin-web-extension instead of upgrading them. | **92%** |
| 10 | …replace the MLX helper with in-browser WebGPU Kokoro | **Not blocked**, but costly: fp32 is 325.5 MB, since fp16 produces NaNs. kokoro-js was last released 2025-05-03 and is pinned to transformers.js ^3. It has an open WebGPU memory leak and GPL espeak inside. A 70k-user competitor already ships exactly this, rated 2.9★. | Medium: a me-too product and a large first-run download | Evaluate WebGPU as the **fallback tier** for non-Mac users. Bundle the ORT wasm to avoid Blue Argon. Create the offscreen doc with the WORKERS reason. | **70%** |
| 11 | …distribute an un-notarized helper `.app`, or one that runs `pip` at runtime | **High on macOS 15.** Sequoia removed the Control-click Gatekeeper override. misaki runs `spacy.cli.download` on first use, which calls pip/uv and **`sys.exit`s on failure**. | High: the helper won't open, or the worker dies on the first /speak | Use Developer ID, hardened runtime and notarization. Pre-install `en_core_web_sm`. Use the slim env (520 MB instead of 1.9 GB, verified). | **85%** |
| 12 | …remove `host_permissions: http://127.0.0.1/*` or move the helper fetch into a content script | **Low today** | High: the Chrome 142+ Local Network Access prompt would gate the calls | Keep host_permissions. Extensions that hold them are exempt (Chrome DevRel, 2025-11-06). | **85%** |

**Counter-findings: things that looked like risks and are not.** A red team that only reports risks is biased;
these results favour the upgrade.

- The **current pins still install and run today**: 30/30 utterances, no NaN, speed works. The **candidate
  stack also runs** (mlx 0.32.2 + mlx-audio 0.5.5): 30/30, no NaN, identical durations, no memory growth over 120
  utterances, and throughput level with today's stack in interleaved runs (§1).
- **Plain HTTP to 127.0.0.1 is not a Purple Copper violation.** The policy FAQ exempts "transmissions between a
  Chrome extension or app and a native program on the same computer" ([User Data FAQ Q16](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)).
- **Localhost-dependent TTS extensions are published today.** "Read Aloud TTS with Kokoro" requires "A running
  Kokoro-FastAPI server at http://localhost:8880" and was updated 2026-07-23. Zotero Connector declares
  `http://127.0.0.1/*`. Caveat: this is survivorship evidence, because rejected submissions are not visible.
- **WebGPU works inside an MV3 offscreen document** on Chrome 153 on this M1 Max. Measured, no flags: adapter
  `apple`/`metal-3`, device created, `shader-f16` present.

---

## 1. Receipts (commands run this session)

| Probe | Command (scratch only) | Result |
|---|---|---|
| Fresh resolve of today's pins | `uv pip compile` of `mlx==0.29.3 mlx-audio==0.2.6 soundfile==0.13.1`, py3.11, arm64 | 603-line lock: **transformers 5.17.0, huggingface-hub 1.32.0, torch 2.10.0**, spacy 3.8.16, numpy 2.4.6, mlx-lm 0.29.1, mlx-vlm 0.3.9 |
| Candidate resolve targeting macOS 13 (uv's default for aarch64-apple-darwin) | `mlx==0.32.2 mlx-audio==0.5.5 misaki[en]==0.9.4` | **"No solution found … mlx==0.32.2 has no wheels with a matching platform tag (e.g., `macosx_13_0_arm64`)"** |
| Candidate resolve with `MACOSX_DEPLOYMENT_TARGET=14.0` | same | 287-line lock, torch 2.14.0 (pulled in by `spacy-curated-transformers`) |
| Kokoro probe: exactly the worker's call shape, `load_model("prince-canuma/Kokoro-82M")` + `model.generate(text, voice=, speed=)`, 2 voices × 3 speeds × 5 texts including the 0.4.4 crash inputs "Hello there." / "Hello world." | `kokoro_probe.py` | **A (today's pins):** 30/30 OK, 0 NaN, peak 0.54, speed ratio 0.5×/2.0× = 3.76. **B (0.32.2/0.5.5):** 30/30 OK, 0 NaN, peak 0.76, ratio 3.76. **C (slim, no torch):** 30/30 OK, ratio 3.76 |
| First run in a fresh uv venv without `en_core_web_sm` | same | **The process exited with no output.** spaCy tried `uv pip install` ("No virtual environment found") and called `sys.exit`. |
| Level / spectrum A vs B, same sentence | `rms.py` | B is **+2.42 dB** RMS, uniformly across 0–12 kHz bands (+2.29…+2.56 dB). Log-spectrogram correlation 0.87 (within-version 0.997). This matches the −2.5 dB fix in mlx-audio PR #859. |
| Cold start (import + load + first `generate("Hello.")`), 2 runs each | `cold.py` | A: 5.9+1.21+1.55 s and 3.36+0.9+2.16 s. B: 0.45+0.05+5.07 s and 0.37+0.05+3.47 s. **B is faster to first audio in total, but the cost moves into the first generate.** |
| Memory, 120 utterances | `leak.py` | Active MLX memory flat at **328.3 MB** in both. Peak 2.38 GB. RSS A 1075→1094 MB, C 673→686 MB (plateau). |
| Throughput, interleaved A/C ×3, 45 utterances, 246 s of audio each | `perf.py` | A 15.2 / 18.6 / 14.7× real time; C 19.5 / 17.3 / 14.7×. **No regression within noise.** |
| Env size | `du -sh` | A 1.9 GB · B 1.1 GB · **C 520 MB** (misaki without `[en]`, so no torch) |
| WebGPU in extension contexts | a throwaway MV3 extension in Chrome for Testing 153.0.8010.12, no flags | Service worker: adapter OK. **Offscreen doc (reason WORKERS): adapter `apple`, arch `metal-3`, `requestDevice()` OK, `shader-f16` true, maxBufferSize 4,294,967,292.** |
| TS / types majors | scratch copy of `chrome-extension/` | TS 5.9.3 + @types/chrome 0.0.268: clean. @types/chrome **0.3.0: 3 errors** (`popup.ts:677,681`, `config.ts:39`). TS **6.0.3: TS5101** `baseUrl` deprecated. TS **7.0.2: TS5102** `baseUrl` removed, plus TS5090 on non-relative `paths`. |
| happy-dom 15.11.7 → 20.14.5 | `bun test` in the scratch copy (helper running) | **128 pass, 0 fail** |

---

## 2. The Python / MLX stack

### 2.1 mlx: the upgrade drops macOS 13

- **Current → latest:** mlx / mlx-metal **0.29.3 (2025-10-17) → 0.32.2 (2026-08-25)**
  ([PyPI mlx](https://pypi.org/pypi/mlx/json)).
- **What changed:** 0.29.3 is the **last release with `macosx_13_0_arm64` wheels**. From 0.29.4 (2025-11-11) the
  wheels are `macosx_14_0` / `15_0` / `26_0` only. Upstream PR: "only build for macos 14 and up"
  ([#2731](https://github.com/ml-explore/mlx/pull/2731), listed in the
  [v0.30.0 notes](https://github.com/ml-explore/mlx/releases/tag/v0.30.0)). Python 3.9 was dropped at the same time.
- **Why it matters here:** `native-helper/Package.swift` declares `.macOS(.v13)`. mlx-audio ≥ 0.4.4 requires
  `mlx>=0.31.1` ([PyPI mlx-audio 0.5.5](https://pypi.org/pypi/mlx-audio/0.5.5/json)). So *any* mlx-audio upgrade past
  0.4.3 forces the macOS 14 floor. uv refused the resolve outright when targeting macOS 13 (§1).
- **Other behavioural change:** mlx 0.31.2 made "each thread have its own default stream"
  ([#3281](https://github.com/ml-explore/mlx/pull/3281), [v0.31.2 notes](https://github.com/ml-explore/mlx/releases/tag/v0.31.2)).
  mlx-audio users calling `generate()` from a worker thread then hit "There is no Stream(gpu, 0) in current thread"
  ([mlx-audio #744](https://github.com/Blaizzy/mlx-audio/issues/744)). The worker's single-threaded stdin loop is
  safe. **Do not** move synthesis into a thread pool or async executor without creating a stream per thread.
- **Open MLX bugs worth knowing about:** `mx.random.normal` is not bit-exact on M1 Max vs M3 Ultra / M5
  ([#3568](https://github.com/ml-explore/mlx/issues/3568)). Kokoro's SineGen uses random noise, so **golden-audio
  tests cannot be byte-exact across machines**; use duration, NaN, level and spectrogram-correlation checks.
  0.31.2 had a `mx.clear_cache()` SIGSEGV regression for streaming decoders
  ([#3450](https://github.com/ml-explore/mlx/issues/3450), closed). 0.32.x had an interpreter-exit abort after
  `mx.compile` ([#4327](https://github.com/ml-explore/mlx/issues/4327), closed; the fix is in the v0.32.2 notes).
- **Migration:** raise the floor to macOS 14 in Package.swift, README, INSTALL and the store listing, or stay on
  0.29.3. The share of real users still on Ventura is **not measured**; this is the operator's call.

### 2.2 mlx-audio: Kokoro has been demoted upstream

- **Current → latest:** **0.2.6 (2025-11-07) → 0.5.5 (2026-09-21)**, with **21 releases in between**
  ([PyPI](https://pypi.org/pypi/mlx-audio/json)). The repo (MIT, 7.9k★, 106 open issues) now ports about 35 TTS
  families ([models dir](https://github.com/Blaizzy/mlx-audio/tree/main/mlx_audio/tts/models)).
- **Stated deprioritisation.** In [#648](https://github.com/Blaizzy/mlx-audio/issues/648) (2026-04-21), a maintainer
  wrote: *"This is intentional -- the `misaki` dependency is huge and introduces a lot of issues with different
  versions of python. Given that Kokoro isn't a SOTA model anymore, we've moved this to an optional dependency."*
  From 0.4.4 onward, misaki, spacy, phonemizer and espeakng-loader are **not declared at all**, not even as extras
  (per-version `requires_dist`, [0.4.4](https://pypi.org/pypi/mlx-audio/0.4.4/json)). The pipeline only raises "pip
  install misaki" at runtime ([pipeline.py](https://github.com/Blaizzy/mlx-audio/blob/main/mlx_audio/tts/models/kokoro/pipeline.py)).
- **Regression history for Kokoro:**
  - 0.4.4 (2026-06-06) made Kokoro fail **on most inputs** with `[broadcast_shapes] (1,N,1) vs (1,N+300,9)`. The
    fault was a `math.ceil` vs `mx.ceil` rounding change ([#784](https://github.com/Blaizzy/mlx-audio/issues/784),
    [#786](https://github.com/Blaizzy/mlx-audio/issues/786), [#803](https://github.com/Blaizzy/mlx-audio/issues/803):
    *"Kokoro TTS synthesis raises for the majority of inputs"*). The fix
    ([#785](https://github.com/Blaizzy/mlx-audio/pull/785)) shipped in **0.4.5 on 2026-07-09**, **33 days** later.
  - 0.3.0 (2026-01-25) hard-pinned `transformers==5.0.0rc3`, a release candidate
    ([0.3.0 metadata](https://pypi.org/pypi/mlx-audio/0.3.0/json)). 0.4.5 capped `transformers<5.13.0` with no stated
    reason ([#849](https://github.com/Blaizzy/mlx-audio/issues/849)).
  - Install breakage with uv or Python 3.13 is still **open** ([#452](https://github.com/Blaizzy/mlx-audio/issues/452),
    [#420](https://github.com/Blaizzy/mlx-audio/issues/420)).
- **The honest counterweight:** 0.2.6 is *wrong*, not just old.
  [PR #859](https://github.com/Blaizzy/mlx-audio/pull/859), merged 2026-08-05 and released in
  [v0.4.8](https://github.com/Blaizzy/mlx-audio/releases/tag/v0.4.8) on 2026-08-10, fixed five divergences from the
  PyTorch reference. They include a **constant −2.5 dB attenuation** and a one-frame misalignment in the F0 path:
  *"`F0_pred` relRMSE 0.134 (corr 0.975) before → 0.0000 after"*. This run measured **+2.42 dB** after upgrading,
  matching the PR's "⚠️ User-facing change: all Kokoro output becomes ~2.5 dB louder".
- **Migration steps:**
  1. Pin `mlx==0.32.2 mlx-metal==0.32.2 mlx-audio==0.5.5` exactly (never below 0.4.8).
  2. Declare `misaki==0.9.4 spacy num2words phonemizer-fork espeakng-loader` yourself, plus `en_core_web_sm`.
  3. Because the first generate now carries 3.5–5 s of lazy imports and pipeline construction (§1), **add a warm-up
     `generate("Hello.")` before `/health` reports ready**. Otherwise the helper's "warming" state stops meaning
     "the first /speak is fast".
  4. Recheck any playback gain calibration, since output is +2.5 dB.
  5. Run the §1 probe on every bump.

### 2.3 Today's environment is not reproducible (fix this before any upgrade)

- `native-helper/Scripts/setup-python-env.sh:82-86` pins only `mlx==0.29.3 mlx-audio==0.2.6 soundfile==0.13.1`.
  mlx-audio 0.2.6 declares open floors such as `transformers>=4.49.0`, `huggingface_hub>=0.27.0` and
  `mlx-vlm>=0.1.27` ([0.2.6 metadata](https://pypi.org/pypi/mlx-audio/0.2.6/json)). So a user who installs today
  gets **transformers 5.17.0 and huggingface-hub 1.32.0**, two major versions the author never ran (§1).
  huggingface-hub 1.0 replaced `requests` with `httpx` and removed `huggingface-cli`
  ([v1.0.0 release](https://github.com/huggingface/huggingface_hub/releases/tag/v1.0.0)). It happens to work today;
  that is luck, not a guarantee.
- **The first synthesis needs the network.** misaki calls `spacy.cli.download("en_core_web_sm")` if the model is
  missing ([misaki/en.py:525-529](https://github.com/hexgrad/misaki/blob/main/misaki/en.py)). spaCy 3.8 shells out to
  `pip` or `uv` and exits the process on failure (`spacy/cli/download.py:189-202`, `exits=1`; observed in §1). In
  `tts_worker.py` the pipeline is built lazily at the first `generate`, and `load_mlx_model()` catches only
  `Exception` (`tts_worker.py:84-96`), so a `SystemExit` there kills the worker. Two consequences:
  - A fresh install makes a **network call at first use**, which contradicts PRIVACY.md's "No data is sent to
    external servers".
  - A **signed, read-only helper bundle cannot pip-install into itself**.
- **Model weights are unpinned:** `load_model("prince-canuma/Kokoro-82M")` (`tts_worker.py:77,91`) follows `main`.
  That repo changed on **2026-01-05**, when 54 `voices/*.safetensors` were uploaded beside the `.pt` files
  ([commits](https://huggingface.co/api/models/prince-canuma/Kokoro-82M/commits/main)). This time nothing was
  removed; next time it might be. **Migration:** pass `revision="e02c9eada7ce7416798af36b190a8a2dd2ecd566"`, the
  current head and the one in the local cache, or pin the README-recommended `mlx-community/Kokoro-82M-bf16`
  ([mlx-audio README](https://github.com/Blaizzy/mlx-audio/blob/main/README.md)) by sha.
- **Mitigation:** `uv pip compile --generate-hashes` → commit `requirements.lock`; install with `--require-hashes`;
  install `en_core_web_sm` from its pinned wheel URL at setup time.

### 2.4 Python version window

- numpy ≥ 2.5.0 requires Python ≥ 3.12 ([PyPI numpy](https://pypi.org/pypi/numpy/json)). Python 3.11 caps you at
  numpy 2.4.6.
- misaki declares `Requires-Python <3.13,>=3.8` and has **not released since 0.9.4 (2025-04-05)**; its repo was last
  pushed 2025-08-11 ([PyPI misaki](https://pypi.org/pypi/misaki/json), [repo](https://github.com/hexgrad/misaki)).
  Kokoro-via-misaki is therefore **blocked on Python 3.13+**.
- Python 3.11 is security-only until 2027-10; 3.12 until 2028-10 ([release cycle](https://peps.python.org/api/release-cycle.json)).
- → **Target Python 3.12.** It is the only version that gets current numpy and still runs misaki. Do not go to
  3.13/3.14. (Conviction 75%: not probed on 3.12 in this run.)

### 2.5 Dead weight: torch

`misaki[en]` pulls `spacy-curated-transformers`, which pulls **torch**: 380 MB (2.10) / 545 MB (2.14) on disk. The
transformer spaCy model is never used; misaki loads `en_core_web_sm`. Installing misaki **without** `[en]` and
declaring `spacy num2words phonemizer-fork espeakng-loader` explicitly gives a **520 MB env instead of 1.9 GB**. It
passed the same 30/30 probe with RSS about 687 MB instead of 1,094 MB (§1). This matters most for notarization
(§8): every nested `.so`/`.dylib` must be signed.

---

## 3. Licence traps in candidate models

Upstream licence from the Hugging Face API (`/api/models/<id>`, tags + `cardData`) or the model card, fetched
2026-09-23. **The mlx-community tag is not the licence.** Several ports are mislabelled or drop the gate.

| Model (upstream) | Upstream licence / terms | mlx-community port | Trap |
|---|---|---|---|
| hexgrad/Kokoro-82M | apache-2.0 | apache-2.0 | none; upstream dormant (last model change 2025-04-10, repo push 2025-08-06) |
| KittenML/kitten-tts-*-0.8 | apache-2.0 | apache-2.0 | none |
| ekwek/Soprano-1.1-80M | apache-2.0 | **no licence tag** | port untagged |
| Qwen/Qwen3-TTS-12Hz-* | apache-2.0 | apache-2.0 | none (large: 0.6B/1.7B) |
| openbmb/VoxCPM2, OpenMOSS MOSS-TTS-Nano | apache-2.0 | apache-2.0 | none |
| ResembleAI/chatterbox(-turbo) | MIT | MIT | **mandatory PerTh watermark on every output** ([card](https://huggingface.co/ResembleAI/chatterbox)): disclose it |
| kyutai/pocket-tts | CC-BY-4.0, **gated** (prohibited-use terms; 401 without an HF token) | CC-BY-4.0, **ungated** | the port strips the gate; attribution is required |
| sesame/csm-1b · neuphonic/neutts-air · canopylabs/orpheus-3b | apache-2.0 tag but **gated** (401 unauthenticated) | csm-1b port **ungated** | cannot auto-download for end users without HF login |
| bosonai/higgs-audio-v2 (now `higgs-tts-2-3b-base`) | **Boson licence based on the Meta Llama 3 Community Licence; >100,000 annual active users needs a separate licence; "Built with…" attribution required** ([LICENSE](https://huggingface.co/bosonai/higgs-audio-v2-generation-3B-base/blob/main/LICENSE)) | **tagged apache-2.0** (q8, q6) | **licence laundering** |
| bosonai/higgs-audio-v3 (now `higgs-tts-3-4b`) | Boson research & **non-commercial** | — | NC |
| k2-fsa/OmniVoice | code Apache-2.0; **weights "CC-BY-NC due to constraints from its training data (e.g., Emilia)"** ([card](https://huggingface.co/k2-fsa/OmniVoice)) | **no licence tag** | NC hidden by a missing tag |
| mistralai/Voxtral-4B-TTS-2603 | **cc-by-nc-4.0** | cc-by-nc-4.0 | NC |
| SparkAudio/Spark-TTS-0.5B · fishaudio/s1-mini | **cc-by-nc-sa-4.0** | cc-by-nc-sa-4.0 | NC + share-alike |
| fishaudio/s2-pro | fish-audio-research-license | — | research only |
| SWivid/F5-TTS · rumik-ai/rumik-oss-1 | **cc-by-nc-4.0** | — | NC |
| coqui/XTTS-v2 | Coqui Public Model Licence (non-commercial) | — | NC |
| microsoft/VibeVoice-1.5B | MIT, but *"limited to research purpose use"*; **Microsoft removed the TTS code on 2025-09-05 after misuse** ([README](https://github.com/microsoft/VibeVoice)) | — | vendor-disabled |

**Rules:**

- Allow-list Apache-2.0, MIT and CC-BY-4.0 with attribution.
- Reject NC, research-only, Llama-derived and gated models.
- Re-verify against the upstream card, not the port.
- Any voice-cloning model also raises impersonation risk. The OmniVoice, VibeVoice and Pocket TTS terms all
  prohibit cloning without consent, and cloning is out of scope for a read-aloud extension anyway.

(Quality ranking of these models is R01's axis. This table covers only whether they are legally shippable.)

---

## 4. GPL-3.0 exposure from espeak-ng (applies today, and on any route)

- eSpeak NG is **GPL-3.0** ([espeak-ng](https://github.com/espeak-ng/espeak-ng)).
- The helper env contains `espeakng_loader/libespeak-ng.1.52.0.dylib` (inspected wheel
  `espeakng_loader-0.2.4-…macosx…arm64.whl`) and `phonemizer-fork`, whose PyPI licence field is the GPL-3.0 text
  ([PyPI](https://pypi.org/pypi/phonemizer-fork/json)).
- The WebGPU route's `kokoro-js` depends on npm `phonemizer` 1.2.1. It is labelled **Apache-2.0**
  ([npm](https://registry.npmjs.org/phonemizer)), but it ships `espeakng.worker.js` (1.45 MB) and
  `espeakng.worker.data`, an Emscripten build of eSpeak NG ([phonemizer.js src](https://github.com/xenova/phonemizer.js/tree/main/src)).
- mlx-audio itself had to remove a vendored eSpeak NG from its MIT repo ([#228](https://github.com/Blaizzy/mlx-audio/issues/228)).
- **Consequence:** distributing a helper bundle, or a CWS zip with phonemizer.js inside, means distributing GPL-3.0
  code, and the repo has **no LICENSE file at all** (C3 §0).
- **Mitigation:** ship `COPYING` plus a source offer for espeak-ng. Better: don't bundle it; let the installer fetch
  it on the user's machine. Add the missing root `LICENSE`.

---

## 5. Chrome Web Store failure modes

### 5.1 The violation codes that apply to this extension

Source: [Troubleshooting CWS violations](https://developer.chrome.com/docs/webstore/troubleshooting), updated 2026-07-20.

| Code | What triggers it | Exposure here |
|---|---|---|
| **Yellow Magnesium** | "minimum quality level… make sure that your extensions clearly communicate error conditions to the user" | **High.** Without the helper, every feature fails. It was issued to a 300k-user extension that "required an active account with our company" ([thread](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/tqJBTb4ncCU)). |
| **Red Potassium / Red Nickel / Red Silicon** | "Ensure the functionality promised by your extension is working as intended" | **High.** The reviewer's note in [this thread](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/E_mezSURRio): features "do not work or were not reproducible… in our review". Fixed by re-describing and a demo video. |
| **Yellow Potassium** | "Ensure that any claimed functionality is performed directly by the item itself." [Minimum Functionality](https://developer.chrome.com/docs/webstore/program-policies/minimum-functionality) lists "functionality that is not directly provided by the extension" as a violation | **Medium.** Voice synthesis happens in a separate program. The fallback engine (Verdict #1) is what makes the item do something by itself. |
| **Purple Potassium** | "Remove all unused permissions" | **Medium.** `activeTab` is declared but nothing in `src/` uses it (no `executeScript`, no `tab.url`). The `<all_urls>` content script is the broadest possible scope for a feature that runs on user click. |
| **Purple Lithium / listing accuracy** | "valid, working and accessible link to your privacy policy"; "All information provided in the privacy fields… must be up to date and accurate" ([listing requirements](https://developer.chrome.com/docs/webstore/program-policies/listing-requirements)) | **Medium.** `chrome-extension/PRIVACY.md:43-47` says voice and speed sync via "Chrome Storage Sync", but the code uses `chrome.storage.local` (`popup.ts:674,698`, `settings-defaults.ts:96,109`, `config.ts:36,64`). `PRIVACY.md:110` lists a `scripting` permission the manifest does not request. It claims "open source" with no LICENSE file. |
| **Purple Copper** | "Don't transmit user data over HTTP" | **Not applicable.** Exempt for "a native program on the same computer" ([FAQ Q16](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)). Say so in the permission justification. |
| **Blue Argon** | remotely hosted code | None today. **It becomes live on the WebGPU route**: transformers.js/ORT load `ort-wasm-*.mjs` from jsDelivr by default ([kokoro #115](https://github.com/hexgrad/kokoro/issues/115)). |
| **Red Titanium** | obfuscation | Low. Bun minification is allowed, but "minification is allowed but complicates review" ([review process](https://developer.chrome.com/docs/webstore/review-process)). Consider an unminified store build. |
| **Yellow Zinc** | missing or poor icon, screenshots or description | Covered by the listing axes. The 128 px icon lacks the 16 px transparent padding the [image spec](https://developer.chrome.com/docs/webstore/images) requires (C3 §7). |

### 5.2 The store cannot limit who installs

- The only manifest `requirements` are `3D` and `plugins` ([docs](https://developer.chrome.com/docs/extensions/reference/manifest/requirements)).
- The dashboard targets **regions** and visibility (public / unlisted / private), not OS or CPU
  ([distribution](https://developer.chrome.com/docs/webstore/cws-dashboard-distribution)).
- So every Windows, Linux, ChromeOS and Intel-Mac user can install an extension whose only engine cannot run on
  their machine.
- **Mitigations, strongest first:**
  1. An in-extension fallback: `chrome.tts` system voices, and optionally WebGPU Kokoro (§6).
  2. Line 1 of the description states the requirement.
  3. The helper-missing UI names the fix in one click.
  4. The **Test instructions** tab ([docs](https://developer.chrome.com/docs/webstore/cws-dashboard-test-instructions),
     "only if needed"). Here it is needed: give the helper download plus two commands.

### 5.3 Permissions and review time

- The review process names `<all_urls>` as the pattern that "give[s] extensions extensive access to the user's web
  activity", and names new developers and new extensions as in-depth-review signals
  ([review process](https://developer.chrome.com/docs/webstore/review-process)).
- `content_scripts.matches` counts as a host permission ([declare permissions](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions)).
- The content script only answers `GET_SELECTED_TEXT` (`content-script.ts:21-33`), and the context menu already
  receives `info.selectionText`.
- **Replace it** with `activeTab` + `scripting.executeScript` on popup open. `activeTab` "does not display a
  permission warning" ([permission warnings](https://developer.chrome.com/docs/extensions/develop/concepts/permission-warnings)).
  That also resolves the unused-`activeTab` finding.

### 5.4 The privacy policy is required even though nothing leaves the device

- *"Does an extension need to disclose user data handling if the data is only processed or stored locally on a
  user's device? Yes."* ([FAQ Q3](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)).
- "Website content" is a disclosure category ([privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)).
- The selected text is website content. Declare it, describe it as processed locally and sent only to
  `127.0.0.1`, and remove the "We collect ZERO data" framing that the dashboard answers would contradict.
- If the WebGPU tier downloads weights from Hugging Face, the policy must say that too. The download redirects to
  `us.aws.cdn.hf.co` (observed `302 location`).

### 5.5 Local Network Access (Chrome 141/142+)

- Chrome now puts a permission prompt in front of page requests to loopback. The
  [intent to ship](https://groups.google.com/a/chromium.org/g/blink-dev/c/cwu_RUmBpzY) names M141, and the
  [Chrome blog](https://developer.chrome.com/blog/local-network-access) names M142.
- Chrome DevRel, 2025-11-06: *"as long as an extension has the correct host permissions, then they will not be
  impacted by this"*. Policy-related bugs were fixed for Chrome ≥ 144.0.7512.0
  ([thread](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/pUDh8RiTjJk)).
- Today every helper fetch is in extension pages (`api-client.ts`, `config.ts` from popup, options and offscreen).
  **Keep it that way and keep `http://127.0.0.1/*`.** A fetch from a content script runs as the page's origin and
  would be gated.

### 5.6 The name

- **NaturalReader - AI Text to Speech** (NaturalSoft Limited, **1,000,000 users**, Featured, 4.2★ from 2.4K ratings,
  updated 2026-09-21) is the top CWS result for "natural text to speech"
  ([listing](https://chromewebstore.google.com/detail/naturalreader-ai-text-to/kohfgcgbkjodfcfkcackpagifgbcmimk),
  [search](https://chromewebstore.google.com/search/natural%20text%20to%20speech)).
- **NATURALREADER** is a registered US mark (Serial 85197680, Reg. 4039798, 2011-10-11, "computer software in the
  field of text-to-speech conversion"). This comes from a search result for the
  [Justia record](https://trademarks.justia.com/851/97/naturalreader-85197680.html); the page itself returned 403.
- **Natural Text Reader** (22 users) also exists ([listing](https://chromewebstore.google.com/detail/natural-text-reader/ocjogcohpijkgcnfllakpdhkjjiiledp)).
- The policy bans infringing "trademark… proprietary rights" and says Google "may reduce visibility"
  ([impersonation & IP](https://developer.chrome.com/docs/webstore/program-policies/impersonation-and-intellectual-property)).
- "Natural Text-to-Speech" is descriptive, so a successful claim is unlikely (~15%). But a fully generic name also
  cannot be found in search and cannot be defended. Rename **before** the first publish, when it costs nothing.

### 5.7 Listing assets

- The promo video field takes a **YouTube URL** ([store listing](https://developer.chrome.com/docs/webstore/cws-dashboard-listing)).
  WebM screen recordings must go to YouTube for the store; the README can embed them.
- Screenshots must be **1280×800 or 640×400**, square corners, full bleed, 1–5 of them. The small promo tile
  440×280 is required ([images](https://developer.chrome.com/docs/webstore/images)).
- Every developer must also declare trader or non-trader status for the EU DSA
  ([trader disclosure](https://developer.chrome.com/docs/webstore/program-policies/trader-disclosure)). Traders' contact
  details are shown publicly.

---

## 6. The WebGPU in-browser route: not blocked, but not free

| Question | Finding | Source |
|---|---|---|
| Is WebGPU available where an MV3 extension would run it? | **Yes.** Service workers since Chrome 124. **Offscreen documents: measured working** on Chrome for Testing 153 / M1 Max (adapter, device, `shader-f16`). | [New in WebGPU 124](https://developer.chrome.com/blog/new-in-webgpu-124); §1 probe |
| Offscreen lifetime | `AUDIO_PLAYBACK` "sets the document to close after 30 seconds without audio playing"; only one offscreen doc per profile. A model loaded under AUDIO_PLAYBACK alone is torn down between reads. **Create with `['AUDIO_PLAYBACK','WORKERS']`.** | [offscreen API](https://developer.chrome.com/docs/extensions/reference/api/offscreen) (updated 2026-09-21) |
| Download size | Kokoro ONNX: fp32 **325.5 MB**, fp16 163.2 MB, q8f16 86.0 MB, quantized 92.4 MB; 55 voices × 524 KB | [HF tree](https://huggingface.co/api/models/onnx-community/Kokoro-82M-v1.0-ONNX/tree/main/onnx) |
| Can we use the small files on WebGPU? | **fp16 produces NaNs** ("changing to fp32 made it work"); WebGPU audio is distorted on some AMD GPUs | [kokoro #74](https://github.com/hexgrad/kokoro/issues/74), [#98](https://github.com/hexgrad/kokoro/issues/98) |
| Memory | open: *"memory leak occurs only when using WebGPU"* | [kokoro #275](https://github.com/hexgrad/kokoro/issues/275) |
| Maintenance | `kokoro-js` last release **1.2.1, 2025-05-03**, depends on `@huggingface/transformers ^3.5.1`; transformers.js is at **4.3.0** (2026-09-16) | [npm kokoro-js](https://registry.npmjs.org/kokoro-js), [npm transformers](https://registry.npmjs.org/@huggingface/transformers) |
| CSP | MV3 allows at most `script-src 'self' 'wasm-unsafe-eval'` | [CSP](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy) |
| Remote code | Default ORT wasm paths point at jsDelivr (Blue Argon). Set `wasmPaths` to packaged files. | [kokoro #115](https://github.com/hexgrad/kokoro/issues/115) |
| Package size | ≤ 2 GB per zip, so bundling fp32 fits, but every update re-ships it. Differential updates were not verified. | [publish](https://developer.chrome.com/docs/webstore/publish) |
| Market | **"Text to Speech for Google Chrome™"** (70,000 users, 2.9★ / 321, v4.0.0, 2026-06-16, 6.05 MiB) already sells "Kokoro neural AI voices… entirely on your own device" via WebGPU with a one-time **330 MB** download, with system-voice fallback. It is the proof that the route passes review, and the incumbent to beat. | [listing](https://chromewebstore.google.com/detail/text-to-speech-for-google/ihjphbgdciilclbpcmagkacpohgokpep) |
| Licence | phonemizer.js = espeak-ng wasm (GPL-3.0) under an Apache label (§4) | §4 |

**Call:** use WebGPU Kokoro as the **fallback tier** for machines without the helper, not as a replacement for MLX
on Apple Silicon. Conviction 70%; quality parity with MLX was not measured in this run.

---

## 7. JS toolchain majors (verified in a scratch copy)

| Package | Current → latest (npm) | Verified effect | Call |
|---|---|---|---|
| typescript | 5.9.3 → **7.0.2** (2026-07-08); 6.0.3 (2026-04-16) | TS 6: `TS5101 Option 'baseUrl' is deprecated`. TS 7: `TS5102 Option 'baseUrl' has been removed` + `TS5090 Non-relative paths`. TS 6.0 notes: "TypeScript 7.0 **will not** support any of these deprecated options" ([TS 6.0](https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/)). | Hold until `tsconfig.json:22-24` drops `baseUrl` and uses `"@/*": ["./src/*"]`; that fix is small |
| @types/chrome | 0.0.268 → **0.3.0** (2026-09-15), after 0.1.0 (2025-07) and 0.2.0 (2026-06), each a breaking 0.x minor | 3 errors: `storage.local.get` results typed `{}` (`popup.ts:677,681`, `config.ts:39`) | Evaluate; the fix is 3 casts or typed getters |
| happy-dom | 15.11.7 → **20.14.5** | 15.11.7 is inside critical [GHSA-37j7-fg3j-429f](https://github.com/advisories/GHSA-37j7-fg3j-429f) (VM escape, <20.0.0) and high [GHSA-6q6h-j7hj-3r64](https://github.com/advisories/GHSA-6q6h-j7hj-3r64) / [GHSA-w4gp-fjgq-3q4g](https://github.com/advisories/GHSA-w4gp-fjgq-3q4g). **128/128 tests pass on 20.14.5.** | **Upgrade now** (test-only dependency, so real exposure is low, but it is free) |
| vite / vite-plugin-web-extension | 5.4.21 → 8.3.0 / 4.5.0 → 4.5.1 | The build is `tsc && bun run build.ts` (Bun.build); vite is only `"dev"` + `vite.config.ts` | **Delete**, don't upgrade |
| bun | 1.3.0 → 1.4.2 (2026-09-05) | not probed | Evaluate separately |

---

## 8. Distributing the helper

- **Gatekeeper:** "In macOS Sequoia, users will no longer be able to Control-click to override Gatekeeper when
  opening software that isn't signed correctly or notarized" ([Apple](https://developer.apple.com/news/?id=saqachfa)).
- **Notarization** needs a Developer ID certificate, "the Hardened Runtime capability for your app and command line
  targets" and a secure timestamp ([Apple docs](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)).
  In a bundled Python env that means every nested `.so`/`.dylib`: torch, mlx, spacy, espeak.
- The slim env (§2.5) cuts that surface by about 73%.
- The runtime `spacy.cli.download` (§2.3) would try to write into a signed bundle. Pre-install the model.
- The `native-helper` SwiftPM deps are fine to bump on this toolchain (Swift 6.2.4). SwiftNIO 2.98+ needs Swift 6.1
  (latest 2.103.0, 2026-09-17), and swift-log 1.15.1 declares `swift-tools-version:6.2`
  ([swift-nio README](https://github.com/apple/swift-nio#swift-versions),
  [swift-log Package.swift](https://github.com/apple/swift-log/blob/main/Package.swift)). A contributor on an older
  Xcode would fail to build.

---

## 9. Legal watch item: EU AI Act Article 50(2)

- Article 50(2): "Providers of AI systems… generating synthetic audio… shall ensure that the outputs… are marked in
  a machine-readable format". It applies from **2 August 2026**
  ([Art. 50](https://artificialintelligenceact.eu/article/50/)).
- A law-firm reading says systems already on the market before that date have until **2 December 2026**, and new
  systems have no grace period ([Stibbe, 2026-07-29](https://www.stibbe.com/publications-and-insights/water-marking-the-machine-making-ai-generated-content-detectable)).
- Whether reading **user-supplied text** aloud falls under the "does not substantially alter the input data… or the
  semantics" exception is **not settled** in those sources. Conviction that it applies to this extension: **45%**.
- This is an operator/legal call. Chatterbox's built-in watermark would satisfy it, but no action is recommended
  until the Commission's guidance covers TTS.

---

## 10. Helper hardening (not a store issue, but a red-team finding)

- `HTTPServer.swift:219-223` accepts **any** `chrome-extension://`, `moz-extension://` or `safari-web-extension://`
  origin.
- It also lets requests with **no Origin** through (`HTTPServer.swift:83-91`).
- So any other installed extension, or any local process, can drive `/speak`. The extension auto-probes ports
  8249–8260 (`config.ts:86-92`), so a squatting local process could also receive the selected text.
- After publishing, pin the helper to the store extension ID(s) plus the dev ID. Consider a pairing secret.
- Conviction 70%: likelihood is low, but the fix is cheap.

---

## 11. Visual-evidence plan: two ways it silently fails

- **Branded Google Chrome 137+ ignores `--load-extension`**
  ([PSA](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/1-g8EFx2BBY/m/S0ET5wPjCAAJ)). Automating the
  installed Chrome 153 with `--extension` will show a browser **without** the extension.
- **Use Chrome for Testing.** Verified here: CfT 153.0.8010.12 loaded an unpacked MV3 extension. Or load it once by
  hand in `chrome://extensions`.
- Store screenshots must be 1280×800 or 640×400, and the video must be a YouTube URL (§5.7). Size capture to that
  from the start.

---

## Sources

**PyPI / npm / release metadata**

- mlx: https://pypi.org/pypi/mlx/json
- mlx-metal: https://pypi.org/pypi/mlx-metal/json
- mlx-audio: https://pypi.org/pypi/mlx-audio/json, plus the per-version pages
  [0.2.6](https://pypi.org/pypi/mlx-audio/0.2.6/json),
  [0.2.10](https://pypi.org/pypi/mlx-audio/0.2.10/json),
  [0.3.0](https://pypi.org/pypi/mlx-audio/0.3.0/json),
  [0.4.4](https://pypi.org/pypi/mlx-audio/0.4.4/json),
  [0.5.5](https://pypi.org/pypi/mlx-audio/0.5.5/json)
- misaki: https://pypi.org/pypi/misaki/json
- numpy: https://pypi.org/pypi/numpy/json
- transformers: https://pypi.org/pypi/transformers/json
- huggingface-hub: https://pypi.org/pypi/huggingface-hub/json
- torch: https://pypi.org/pypi/torch/json
- spacy: https://pypi.org/pypi/spacy/json
- soundfile: https://pypi.org/pypi/soundfile/json
- espeakng-loader: https://pypi.org/pypi/espeakng-loader/json
- phonemizer-fork: https://pypi.org/pypi/phonemizer-fork/json
- npm packages:
  [kokoro-js](https://registry.npmjs.org/kokoro-js) ·
  [@huggingface/transformers](https://registry.npmjs.org/@huggingface/transformers) ·
  [phonemizer](https://registry.npmjs.org/phonemizer) ·
  [typescript](https://registry.npmjs.org/typescript) ·
  [@types/chrome](https://registry.npmjs.org/@types/chrome) ·
  [happy-dom](https://registry.npmjs.org/happy-dom) ·
  [vite](https://registry.npmjs.org/vite)
- Python release cycle: https://peps.python.org/api/release-cycle.json

**GitHub**

- MLX releases: https://github.com/ml-explore/mlx/releases
- MLX PRs: [#2731](https://github.com/ml-explore/mlx/pull/2731) · [#3281](https://github.com/ml-explore/mlx/pull/3281)
- MLX issues: [#3568](https://github.com/ml-explore/mlx/issues/3568) · [#3450](https://github.com/ml-explore/mlx/issues/3450) · [#4327](https://github.com/ml-explore/mlx/issues/4327)
- mlx-audio issues: [#648](https://github.com/Blaizzy/mlx-audio/issues/648) · [#784](https://github.com/Blaizzy/mlx-audio/issues/784) · [#786](https://github.com/Blaizzy/mlx-audio/issues/786) · [#803](https://github.com/Blaizzy/mlx-audio/issues/803) · [#813](https://github.com/Blaizzy/mlx-audio/issues/813) · [#815](https://github.com/Blaizzy/mlx-audio/issues/815) · [#744](https://github.com/Blaizzy/mlx-audio/issues/744) · [#849](https://github.com/Blaizzy/mlx-audio/issues/849) · [#452](https://github.com/Blaizzy/mlx-audio/issues/452) · [#420](https://github.com/Blaizzy/mlx-audio/issues/420) · [#228](https://github.com/Blaizzy/mlx-audio/issues/228)
- mlx-audio PRs: [#785](https://github.com/Blaizzy/mlx-audio/pull/785) · [#859](https://github.com/Blaizzy/mlx-audio/pull/859)
- mlx-audio releases: [v0.4.5](https://github.com/Blaizzy/mlx-audio/releases/tag/v0.4.5) · [v0.4.8](https://github.com/Blaizzy/mlx-audio/releases/tag/v0.4.8)
- mlx-audio sources: [README](https://github.com/Blaizzy/mlx-audio/blob/main/README.md) · [kokoro pipeline.py](https://github.com/Blaizzy/mlx-audio/blob/main/mlx_audio/tts/models/kokoro/pipeline.py)
- misaki: [en.py](https://github.com/hexgrad/misaki/blob/main/misaki/en.py) · [repo](https://github.com/hexgrad/misaki)
- kokoro-js issues: [#74](https://github.com/hexgrad/kokoro/issues/74) · [#98](https://github.com/hexgrad/kokoro/issues/98) · [#115](https://github.com/hexgrad/kokoro/issues/115) · [#275](https://github.com/hexgrad/kokoro/issues/275)
- phonemizer.js: https://github.com/xenova/phonemizer.js
- espeak-ng: https://github.com/espeak-ng/espeak-ng
- VibeVoice: https://github.com/microsoft/VibeVoice
- huggingface_hub v1.0.0: https://github.com/huggingface/huggingface_hub/releases/tag/v1.0.0
- swift-nio: https://github.com/apple/swift-nio
- swift-log: https://github.com/apple/swift-log
- Zotero Connector manifest: https://github.com/zotero/zotero-connectors/blob/master/src/browserExt/manifest-v3.json
- Security advisories:
  [GHSA-37j7-fg3j-429f](https://github.com/advisories/GHSA-37j7-fg3j-429f) ·
  [GHSA-6q6h-j7hj-3r64](https://github.com/advisories/GHSA-6q6h-j7hj-3r64) ·
  [GHSA-w4gp-fjgq-3q4g](https://github.com/advisories/GHSA-w4gp-fjgq-3q4g)

**Hugging Face** (via `/api/models/<id>`, the model cards and LICENSE files)

- Kokoro, current pin: [prince-canuma/Kokoro-82M](https://huggingface.co/api/models/prince-canuma/Kokoro-82M) and [its commits](https://huggingface.co/api/models/prince-canuma/Kokoro-82M/commits/main)
- Kokoro, upstream: [hexgrad/Kokoro-82M](https://huggingface.co/api/models/hexgrad/Kokoro-82M)
- Kokoro, ONNX build: [onnx-community/Kokoro-82M-v1.0-ONNX tree](https://huggingface.co/api/models/onnx-community/Kokoro-82M-v1.0-ONNX/tree/main/onnx)
- Higgs v2 licence: [bosonai/higgs-audio-v2 LICENSE](https://huggingface.co/bosonai/higgs-audio-v2-generation-3B-base/blob/main/LICENSE)
- Model cards: [k2-fsa/OmniVoice](https://huggingface.co/k2-fsa/OmniVoice) · [ResembleAI/chatterbox](https://huggingface.co/ResembleAI/chatterbox) · [microsoft/VibeVoice-1.5B](https://huggingface.co/microsoft/VibeVoice-1.5B) · [kyutai/pocket-tts](https://huggingface.co/kyutai/pocket-tts)
- Licence tags checked, upstream and port for each: kitten-tts, Soprano, Qwen3-TTS, VoxCPM2, Dia, OuteTTS, Spark-TTS, csm-1b, Voxtral-4B-TTS, MeloTTS, MOSS-TTS-Nano, LongCat-AudioDiT, Zonos, maya1, orpheus, rumik-oss-1, kugelaudio, F5-TTS, XTTS-v2, neutts-air, fish s1-mini / s2-pro

**Chrome / Chrome Web Store**

- Violation codes: [troubleshooting](https://developer.chrome.com/docs/webstore/troubleshooting)
- Program policies: [minimum functionality](https://developer.chrome.com/docs/webstore/program-policies/minimum-functionality) · [listing requirements](https://developer.chrome.com/docs/webstore/program-policies/listing-requirements) · [impersonation & IP](https://developer.chrome.com/docs/webstore/program-policies/impersonation-and-intellectual-property) · [user data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq) · [trader disclosure](https://developer.chrome.com/docs/webstore/program-policies/trader-disclosure)
- Review and publishing: [review process](https://developer.chrome.com/docs/webstore/review-process) · [publish](https://developer.chrome.com/docs/webstore/publish)
- Dashboard: [test instructions](https://developer.chrome.com/docs/webstore/cws-dashboard-test-instructions) · [privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy) · [distribution](https://developer.chrome.com/docs/webstore/cws-dashboard-distribution) · [store listing](https://developer.chrome.com/docs/webstore/cws-dashboard-listing)
- Listing assets: [images](https://developer.chrome.com/docs/webstore/images)
- Extension platform: [offscreen](https://developer.chrome.com/docs/extensions/reference/api/offscreen) · [CSP](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy) · [requirements](https://developer.chrome.com/docs/extensions/reference/manifest/requirements) · [declare permissions](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions) · [permission warnings](https://developer.chrome.com/docs/extensions/develop/concepts/permission-warnings)
- Local Network Access: [blog](https://developer.chrome.com/blog/local-network-access) · [intent to ship](https://groups.google.com/a/chromium.org/g/blink-dev/c/cwu_RUmBpzY) · [extensions thread](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/pUDh8RiTjJk)
- WebGPU: [New in WebGPU 124](https://developer.chrome.com/blog/new-in-webgpu-124)
- chromium-extensions threads: [Yellow Magnesium takedown](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/tqJBTb4ncCU) · [Red Potassium rejection](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/E_mezSURRio) · [`--load-extension` PSA](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/1-g8EFx2BBY/m/S0ET5wPjCAAJ)
- CWS listings: [NaturalReader](https://chromewebstore.google.com/detail/naturalreader-ai-text-to/kohfgcgbkjodfcfkcackpagifgbcmimk) · [Natural Text Reader](https://chromewebstore.google.com/detail/natural-text-reader/ocjogcohpijkgcnfllakpdhkjjiiledp) · [Text to Speech for Google Chrome™](https://chromewebstore.google.com/detail/text-to-speech-for-google/ihjphbgdciilclbpcmagkacpohgokpep) · [Read Aloud TTS with Kokoro](https://chromewebstore.google.com/detail/beecigdnohbfcabanacghdoembiodljc) · [Kokoro TTS Sender](https://chromewebstore.google.com/detail/befhghjhbjpjnbamdginljoiaafoclmf)
- CWS searches: ["natural text to speech"](https://chromewebstore.google.com/search/natural%20text%20to%20speech) · ["kokoro"](https://chromewebstore.google.com/search/kokoro)

**Other**

- Trademark (search-result snippet; the page returned 403): https://trademarks.justia.com/851/97/naturalreader-85197680.html
- Apple: [Sequoia runtime protection](https://developer.apple.com/news/?id=saqachfa) · [notarization](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)
- TypeScript 6.0: https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/
- EU AI Act: [Article 50](https://artificialintelligenceact.eu/article/50/) · [Stibbe](https://www.stibbe.com/publications-and-insights/water-marking-the-machine-making-ai-generated-content-detectable)

---

## Adversarial verification (2026-09-23)

*Independent verifier. Every claim was re-fetched from a primary source or re-measured in fresh scratch
environments under `/tmp/ntts-verifier-r10/`. The deployed env was APFS-cloned with `cp -Rc`, so the repo venv
was never modified. Nothing tracked was edited except this appended section.*

**Result:** all 12 load-bearing claims survive. Three statements in the body do not, and the red team missed one
defect that outranks everything in its risk table: **the documented install path produces a helper that cannot
load Kokoro, today, on either stack** (M1 below).

### Verdicts on the load-bearing claims

| # | Claim | Verdict | Independent evidence, and corrections |
|---:|---|---|---|
| 1 | mlx 0.29.3 is the last release with `macosx_13_0_arm64` wheels; uv refuses mlx 0.32.2 for macOS 13 | **Confirmed** | [PyPI mlx](https://pypi.org/pypi/mlx/json) and [mlx-metal](https://pypi.org/pypi/mlx-metal/json): 0.29.0–0.29.3 carry 13/14/15 wheels, and 0.29.4 (2025-11-11) onward carry 14/15/26 only. Neither package ships an sdist, so a source build cannot rescue macOS 13. [PR #2731](https://github.com/ml-explore/mlx/pull/2731), merged 2025-11-04: "Deprecate support for macos 13.5". Re-ran `uv pip compile` (uv 0.11.28) and got the same refusal. |
| 2 | mlx-audio 0.4.4 broke Kokoro; the fix (#785) shipped in 0.4.5 on 2026-07-09 | **Confirmed** | [#803](https://github.com/Blaizzy/mlx-audio/issues/803): "raises for the majority of inputs", with "Hello there." / "Hello world." failing. PR #785 was merged 2026-07-01, and [v0.4.5](https://github.com/Blaizzy/mlx-audio/releases/tag/v0.4.5) was published 2026-07-09T16:32Z with it in the notes. [#784](https://github.com/Blaizzy/mlx-audio/issues/784) traces the regression to commit `aaf5ee6`, "Fix Kokoro usage from worker threads". |
| 3 | Maintainer said Kokoro "isn't a SOTA model anymore"; from 0.4.4 onward misaki, spacy and espeak are undeclared | **Confirmed, wrong boundary** | Quote verbatim from lucasnewman (COLLABORATOR), 2026-04-21, in [#648](https://github.com/Blaizzy/mlx-audio/issues/648). The dependencies are already undeclared in **[0.4.3](https://pypi.org/pypi/mlx-audio/0.4.3/json)** (2026-04-28). 0.3.0–0.4.2 declared them under the `tts` extra. |
| 4 | PR #859 (in v0.4.8, 2026-08-10) fixed −2.5 dB and an F0 misalignment (relRMSE 0.134→0); +2.42 dB measured | **Confirmed** | PR text matches, merged 2026-08-05, [v0.4.8](https://github.com/Blaizzy/mlx-audio/releases/tag/v0.4.8) published 2026-08-10. The installed 0.2.6 `mlx_audio/utils.py` `istft` divides by Σw, not Σw², so the bug is present in the pin. ffmpeg `volumedetect` on the author's retained WAVs: A −27.9 dB, B −25.5 dB. My own probe, with different texts and voices: A −29.61 dB, B −27.18 dB (**+2.43 dB**). |
| 5 | mlx 0.32.2 + mlx-audio 0.5.5: 30/30, 0 NaN, ratio 3.76, flat 328 MB, throughput within noise | **Confirmed, with corrections** | Two corrections. The author's memory and throughput runs used env **C** (slim), not B. The author's env **A** ran transformers 5.17.0 / hf-hub 1.32.0, not the deployed 4.57.1 / 0.36.0. I re-ran against the **deployed** env and B directly. Both passed 30/30 with 0 NaN and identical durations; the ratio was 3.69 on my texts, which is text-dependent. MLX active memory stayed flat at 328.4 MB over 60 utterances in both. Interleaved throughput over 3 rounds: A 23.8 / 17.3 / 16.8× and B 21.1 / 22.5 / 15.6× (means 19.3 vs 19.7×). |
| 6 | A fresh resolve of today's pins pulls transformers 5.17.0, hf-hub 1.32.0 and torch 2.10.0 | **Confirmed (uv)** | Reproduced. torch stops at 2.10.0 because `curated-transformers` caps it; the latest is 2.14.0. A pip `--only-binary` dry-run fails instead, because `webrtcvad` (hard-required by 0.2.6) is [sdist-only in every version](https://pypi.org/pypi/webrtcvad/json). The script's plain `pip install` would compile it. |
| 7 | CWS FAQ: local-only processing must be disclosed (Q3); a native program on the same computer is exempt from secure transmission (Q16) | **Confirmed** | Both are verbatim in the [User Data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq). The page is dated "Last updated 2016-04-23". "Native program" is not defined as HTTP-to-localhost, so say so in the justification, as R10 advises. |
| 8 | The `requirements` key supports only 3D and plugins; distribution targets regions and visibility, not OS | **Confirmed, with nuance** | [requirements](https://developer.chrome.com/docs/extensions/reference/manifest/requirements): `plugins` "has been deprecated, and can no longer be used", so only `3D` is usable. [Distribution](https://developer.chrome.com/docs/webstore/cws-dashboard-distribution) (last updated 2020-12-07) covers Visibility and geographic regions only. |
| 9 | Chrome DevRel: extensions with correct host permissions are not affected by LNA | **Confirmed** | Patrick Kettner said it on 2025-11-06 in [the thread](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/pUDh8RiTjJk). More primary: the [LNA adoption guide](https://docs.google.com/document/d/1QQkqehw8umtAgz5z0um7THx-aoU251p705FbIQjDuGs), linked from the [Chrome blog](https://developer.chrome.com/blog/local-network-access), says "We do not **currently** have plans to apply LNA restrictions to extensions." That is a shelf-life statement, not a guarantee. |
| 10 | WebGPU adapter and device work in an MV3 offscreen doc (WORKERS) on CfT 153.0.8010.12, no flags | **Confirmed** | I rebuilt the probe independently and ran it in `chromium-1243` (CfT 153.0.8010.12). It also works with R10's recommended `['AUDIO_PLAYBACK','WORKERS']`: vendor `apple`, `metal-3`, device plus a buffer allocated, `shader-f16` true. It was tested only on CfT and this M1 Max, not on branded Chrome or other GPUs. |
| 11 | mlx-community Higgs v2 ports are tagged apache-2.0; upstream is a Llama-3-derived Boson licence with a 100k AAU cap | **Confirmed** | [HF API q8](https://huggingface.co/api/models/mlx-community/higgs-audio-v2-3B-mlx-q8) and q6: `license:apache-2.0`, ungated, `base_model` bosonai. The [upstream LICENSE](https://huggingface.co/bosonai/higgs-audio-v2-generation-3B-base/resolve/main/LICENSE) is "based upon the Meta Llama 3 Community License"; §2 sets the >100,000 annual-active-user cap, and §1.b.i requires "Built with…" attribution. |
| 12 | TS 6.0.3 → TS5101, TS 7.0.2 → TS5102 on `baseUrl`; @types/chrome 0.3.0 → 3 errors | **Confirmed** | Reproduced in a fresh scratch copy: TS5101; TS5102 plus TS5090; and 3 errors at `popup.ts:677,681` and `config.ts:39`. Registry dates match ([typescript](https://registry.npmjs.org/typescript), [@types/chrome](https://registry.npmjs.org/@types/chrome)). |

### Statements in the body that do not survive

| Statement | Verdict | Evidence |
|---|---|---|
| "The setup script pins 3 of about **600** packages" (Verdict #1) | **Refuted** | The 603 is the lock file's **line** count, comments included. The author's own `cur.lock.txt` holds **178** packages, and the deployed env has 181 `dist-info` dirs. |
| "*Any* mlx-audio upgrade past **0.4.3** forces the macOS 14 floor" (§2.1) | **Refuted** | 0.4.3 itself requires `mlx>=0.31.1`. Transitively the floor arrives at **0.3.0**: `mlx-lm==0.30.5` requires `mlx>=0.30.3` ([mlx-lm 0.30.5](https://pypi.org/pypi/mlx-lm/0.30.5/json)). The last macOS-13-capable mlx-audio is **0.2.10**, which caps mlx-lm below 0.30. The conclusion gets stronger: no release both fixes the audio and keeps Ventura. |
| "Pass `revision="e02c9ea…"`" to pin the weights (§2.3) | **Refuted as written** | The sha is the current head ([HF API](https://huggingface.co/api/models/prince-canuma/Kokoro-82M)). But 0.2.6 `load_model` calls `get_model_path(model_path)` **without** the revision. Both 0.2.6 (`hf_hub_download`) and 0.5.5 (`snapshot_download`) also fetch each `voices/<v>` file **lazily with no revision**. Pinning needs `snapshot_download(repo, revision=sha)` of the whole repo, voices included, and loading from that path. |

### Challenges to recommendations with conviction ≥ 80

| Recommendation (conviction) | Challenge: what makes it wrong for this project | Adjusted |
|---|---|---:|
| Lock the Python env first (95) | Right direction, but a lock alone does not fix a fresh install. `setup-python-env.sh:107` deletes every `*.dist-info` **after** installing, and that alone breaks Kokoro (M1). The script also runs whatever `python3` is first on PATH (M3). The revision pin does not work as written (above). uv-compiled locks ignore `Requires-Python` upper bounds: uv resolved `misaki 0.9.4` for a 3.13 target despite `<3.13`, so compile the lock with the same installer that installs it. Finally, locking **today's** pins freezes the −2.5 dB bug and 178 packages. | 90 |
| mlx 0.32.2 + mlx-audio 0.5.5 (80, operator) | The case is **understated**. The upgrade also removes gradio 5.50, fastrtc, numba/llvmlite, librosa and a source-built `webrtcvad` (M5): 178 packages become 95, or 88 slim. There is no middle version that keeps Ventura (the boundary is 0.3.0). What would make it wrong: a real Ventura user share. A cheap bridge for those users is a ×4/3 output gain on 0.2.6, which fixes the level but not the F0 error. | 85 |
| Reject floating mlx-audio (95) | No counter found. It applies equally to transitive floors: 0.5.5 declares `transformers>=5.14.0` and `huggingface_hub>=1.0`, both open-ended. | 95 |
| Reject NC / research / Llama-derived / gated models (88) | Too broad. `sesame/csm-1b` and `neuphonic/neutts-air` are Apache-2.0 with `gated: auto` (auto-approve), so they can legally be mirrored with a NOTICE; gating is a download-UX problem, not a licence bar. Pocket TTS is CC-BY-4.0, which R10's own allow-list admits; its rejection rests on the gate's use terms. Orpheus deserves a stronger reason than gating: its `base_model` is `meta-llama/Llama-3.2-3B-Instruct`, the Higgs laundering pattern at the upstream level. The NC and research-only subset stands at ~95. | 80 |
| Replace `<all_urls>` content script with activeTab + scripting (85) | This holds, and a second reason strengthens it: `<all_urls>` content scripts also trigger the install-time "Read and change all your data on all websites" warning. Caveats: add `scripting` (no warning); injection fails on the PDF viewer, `chrome://` and CWS pages, and `service-worker.ts:88-105` already falls back to `info.selectionText` there. Today's script also injects CSS and `console.log`s on every page. | 88 |
| GPL-3.0 espeak-ng compliance + root LICENSE (85) | "Applies today" (§4 heading) is overstated. Today the project ships source plus a script, and PyPI delivers espeak-ng to the user's machine, so no distribution occurs. The obligation starts with a bundled helper or phonemizer.js. Meanwhile the same `dist-info` purge deletes **323 licence files**, including `phonemizer_fork-3.3.2.dist-info/licenses/LICENSE` (GPL). The `espeakng_loader` 0.2.4 wheel ships `libespeak-ng` with **no licence file at all**. A bundle built from this script would therefore breach the GPL by construction. | 85 |
| Hold TS 6/7 and @types/chrome 0.3.0 (92) | Measured: removing `baseUrl` and writing `"@/*": ["./src/*"]` gives **0 errors on TS 6.0.3 and on TS 7.0.2**. The @types fix is 3 casts. `"typescript": "^5.5.0"` already blocks an accidental major bump. This is "adopt after a 2-line fix", not a hold. | 55 (for "hold") |
| happy-dom 15.11.7 → 20.14.5 now (90) | Reproduced 128/128 on both versions. Advisory ranges verified via `gh api /advisories`: critical <20.0.0, highs ≤20.8.7 and <20.8.9. Real exposure is about zero (tests run no untrusted code), but the upgrade is free. | 90 |
| Delete vite / vite-plugin-web-extension (80) | This is correct (`build.ts` uses `Bun.build` 5×), but not a one-liner. `tsconfig.json` `include` lists `vite.config.ts`, and removing the packages alone gives **2× TS2307**, which breaks `bun run build` (`tsc && …`). Also delete `vite.config.ts` and the `dev` / `preview` scripts. | 85 |
| Slim env: misaki without `[en]` (80) | Reproduced: **502 MB**, 30/30, no torch. This only works on mlx-audio ≥ 0.4.3, because 0.2.6 hard-requires `misaki[en]`, so it is coupled to the upgrade. It also needs `en_core_web_sm` pre-installed and the purge removed (M1). | 85 |
| Notarized helper, no runtime pip (85, operator) | Only needed if a **prebuilt** `.app`/`.pkg` ships. Gatekeeper assesses quarantined files. A from-source path (git clone, `swift build`, `pip`) creates none, and Sequoia still allows System Settings › Privacy & Security › Open Anyway ([Apple](https://developer.apple.com/news/?id=saqachfa)). Notarization needs the paid Developer Program and signing every nested `.so`. The "no runtime pip" half stands at 95. | 75 |

### Items the red team missed

- **M1: the documented install is broken today.** `native-helper/Scripts/setup-python-env.sh:107` runs
  `find "$VENV_DIR" -type d -name "*.dist-info" -exec rm -rf {} +` after installing. README:291, INSTALL.md:64,
  QUICKSTART.md:56 and `quickstart.sh:301` all route through it. I applied that exact line to an APFS clone of the
  deployed env, offline:
  - `import transformers` raises `PackageNotFoundError: 'tqdm>=4.27' … not found`.
  - `from mlx_audio.tts.utils import load_model` fails the same way, so the worker cannot load Kokoro.
  - `spacy.util.is_package("en_core_web_sm")` flips to `False`, so misaki would call `spacy.cli.download` on every
    pipeline build.

  On a clone of the candidate stack, `load_model` succeeds but the pipeline raises "Kokoro requires the optional
  'misaki' package". The repo's own venv works only because it still has its 181 `dist-info` dirs. **Fix: delete
  that line.** This precedes every item in the risk table.
- **M2: the licence texts are purged as well** (323 files, GPL included), and `espeakng_loader` ships no licence file
  at all. See the GPL row above.
- **M3: the interpreter is unpinned.** The script uses the first `python3` on PATH and checks for "3.9+".
  - Apple's `/usr/bin/python3` is 3.9.6. It fails today's pins (`fastrtc[stt]` needs ≥3.10, so the resolve is
    unsatisfiable) and the candidate (mlx 0.32.2 has cp310+ wheels only).
  - This machine's Homebrew `python3` is 3.14.7. It fails today's pins (mlx 0.29.3 has no cp314 wheel), and
    misaki declares `<3.13`.
  - Pin 3.11 or 3.12 explicitly, for example with `uv python install 3.12`.
- **M4: the macOS-13 boundary is mlx-audio 0.3.0, not 0.4.4.** See above; this changes the operator's
  "stay on Ventura" option to "stay on ≤0.2.10".
- **M5: the upgrade's biggest dependency win is absent from a report about upgrade risk.** 0.2.6 hard-requires
  `fastrtc[stt,vad]`, which brings in gradio 5.50, numba 0.67, llvmlite, librosa and the sdist-only `webrtcvad`
  (it needs a C compiler and a signed `.so`). 0.5.5 moves `webrtcvad` to extras. Package count: 178 → 95 → 88 slim.
- **M6: the helper downloads per voice, whatever the lock says.** Each voice's first use hits huggingface.co with no
  revision, in both versions. The helper sets no `HF_HUB_OFFLINE` and prefetches nothing. Consequences: offline
  first use of an uncached voice fails, and PRIVACY.md's "zero external network requests" (line 79) is untrue for
  the helper, though no user text is sent. **Fix:** prefetch the pinned snapshot, voices included, at setup, and run
  the worker with `HF_HUB_OFFLINE=1`.
- **M7: shelf-life caveats.** The LNA exemption is "currently", and the Q16 FAQ text dates from 2016. Re-check both at
  submission time.

*Receipts in `/tmp/ntts-verifier-r10/`:*
- `probe_strip.py` / `strip.out` (M1)
- `vprobe.py` / `vA.json` / `vB.json` (claim 5)
- `perfv.py` (throughput)
- `cur.lock`, `cand14.lock`, `slim.lock`, `c313.lock` (resolves)
- `gpu/` (WebGPU probe)
- `ext/`, `ext2/` (TS / happy-dom / vite runs)
- `higgs-LICENSE`, `lna-guide.txt`, `udfaq.html` (policy sources)
