# R01 — Local TTS models, Nov 2025 → Sep 2026: should Natural TTS change its voice engine?

*Axis R01 of the 2026-09 upgrade research · written 2026-09-23 · every version, date, score and licence below was fetched from a primary source in this run (URLs inline and in [Sources](#sources)). Measurements were taken on this machine: Apple M1 Max (8P+2E CPU, 32-core GPU), 64 GB, macOS 15.7.9.*

## Verdict

**Keep Kokoro-82M as the default, and upgrade the runtime underneath it now.** Nothing released between November 2025 and September 2026 makes a better default for this extension. Kokoro is still tied for the best *permissively-licensed* open model on the largest blind arena (Artificial Analysis, Elo 1061 ± 11). It is the fastest candidate on this Mac (25× real time on an M1 Max). And it is the only small model that reads numbers, dates and currency reliably. The change that matters is **mlx-audio 0.2.6 → 0.5.5**, which fixes five decoder bugs: this machine's measurement shows today's Kokoro 2.65 dB quiet and spectrally about 10× the reference's own noise away from real Kokoro, and 0.5.5 closes most of that gap. A second engine is worth adding only for *capability* (voice cloning, five more European languages, instant streaming), not for quality. **Pocket TTS** is the only candidate that fits, and only once a text normaliser sits in front of it.

| # | Recommendation | Action | Conviction | Effort | Deciding evidence |
|---:|---|---|---:|:---:|---|
| 1 | Upgrade the Kokoro runtime: mlx-audio **0.2.6 → 0.5.5**, mlx **0.29.3 → 0.32.2**; install `misaki[en]` explicitly | upgrade now | **93%** | S | §3.1: −2.65 dB → −0.20 dB vs PyTorch Kokoro, log-mel L1 0.577 → 0.126 (floor 0.058), prose 17× → 25× real time, WER unchanged; [PR #859](https://github.com/Blaizzy/mlx-audio/pull/859) |
| 2 | **Keep Kokoro-82M as the default engine** | hold | **90%** | — | §2.1: every open model *clearly* above it (outside its CI) is non-commercial or has an unstated weights licence, and the one that ties it (Magpie, 1063 ± 13) has no MLX build; §3.2: fastest and fewest normalisation errors of the 12 models measured |
| 3 | Fix voice exposure: default **`af_heart`** (grade A), expose the graded 54-voice list, drop or badge F/D voices, **pass `lang_code` from the voice prefix**, fix the `af_sarah` "(UK)" label | adopt now | **90%** | S | §1, §6.2; the helper ships `am_adam` (F+) but not `af_heart` (A) |
| 4 | Do **not** add a second "higher-quality" engine now (Qwen3-TTS, Chatterbox Turbo, VoxCPM2) | hold | **80%** | — | none beats Kokoro in any blind arena; on the M1 Max they run 0.9–2.9× real time with 5–18 GB peaks (§3.2) |
| 5 | Offer **Pocket TTS** as an opt-in second engine for cloning, FR/DE/ES/IT/PT and streaming, **only behind a text normaliser**, with the six permissively-licensed voices | operator decision | **55%** | M | §4.2; numeric-passage errors ("2026" → "226", "$4.2 million" → "$42 million"); CC BY-NC voices to exclude |
| 6 | Reject non-commercial weights: Breeze TTS 2, Fish S2 Pro, Voxtral, Higgs TTS 3, **OmniVoice**, F5/E2, Spark, OpenAudio S1 Mini | reject | **95%** | — | licence text on each model card (§4.8, §4.10, §4.11, §4.14) |
| 7 | Reject Supertonic (archived), VibeVoice (vendor-disabled), Kitten and Soprano (no advantage; measured defects), Dia2 (2-minute cap) | reject | **85%** | — | §4.3–§4.5, §4.13, §4.14, §3.2 |
| 8 | Evaluate running Kokoro in-process through **mlx-audio-swift** to delete the Python 3.11 + torch + spaCy environment | evaluate | **65%** | L | §5: Kokoro plus a Swift misaki port since 2026-03-25; by code reading it already has the #859 level and alignment fixes; per-phoneme durations enable word highlighting |

**What would change this verdict:** (a) a permissively-licensed model with an mlx-audio port that scores above Kokoro's CI on Artificial Analysis *and* runs ≥ 10× real time on an M-series Mac; (b) a Kokoro v1.1-en or v2 from hexgrad; (c) Pocket TTS shipping a text-normalisation front end, which would lift recommendation 5 to about 75%; (d) the product deciding voice cloning or non-English reading is a goal, which makes recommendation 5 the operator's call rather than a research question.

**Two findings for other axes:** the helper hard-codes `ESPEAK_DATA_PATH=/opt/homebrew/opt/espeak-ng/share/espeak-ng-data` (`PythonWorker.swift:39`), a hidden Homebrew dependency on users' machines that mlx-audio 0.2.6 needs and 0.5.5 appears not to (§6.1 step 6; packaging and publishing axes). And the worker's all-at-once response makes users wait for the whole selection, about 11 s for 5,000 characters on the upgraded stack (extrapolated from 5.8 s per 2,534 characters), when Kokoro's first segment is ready in about 1 s (helper-architecture axis).

---

## 1. What the extension runs today (the baseline every candidate is compared against)

| Layer | Today | Where |
|---|---|---|
| Model | Kokoro-82M v1.0, loaded as `prince-canuma/Kokoro-82M` | `native-helper/Sources/NaturalTTSHelper/Resources/tts_worker.py` (`load_model("prince-canuma/Kokoro-82M")`) |
| Runtime | mlx-audio **0.2.6** (2025-11-07), mlx / mlx-metal **0.29.3**, misaki 0.9.4, Python 3.11.4 | `python-env/…/site-packages/*.dist-info` |
| Call shape | whole request (≤ 5,000 chars) synthesised, concatenated, WAV-encoded, base64'd, returned in one response, no streaming | `tts_worker.py` `generate_audio_mlx`, `HTTPServer.swift:152` (5,000-char cap) |
| Voices exposed | **6 of Kokoro's 54**: `af_bella` (default), `af_sarah` (labelled "(UK)"), `af_nicole`, `af_sky`, `am_adam`, `am_michael` | `HTTPServer.swift:203-211`, `Config.swift:43` |

Two facts about this baseline matter for everything below:

- **The helper does not expose Kokoro's best voice.** Kokoro's own grade sheet rates `af_heart` **A**, `af_bella` A-, `af_nicole` B-, `af_sarah` C+, `am_michael` C+, `af_sky` C-, and `am_adam` **F+** ([VOICES.md](https://huggingface.co/hexgrad/Kokoro-82M/raw/main/VOICES.md)). The helper ships `am_adam` and `af_sky` but not `af_heart`, and labels `af_sarah` as UK although the `af_` prefix means American female (`bf_` is British).
- **Because the worker returns nothing until the whole selection is synthesised, time to first audio equals total generation time.** A 5,000-character selection is about 5 minutes of speech. Model speed and streaming therefore matter more to perceived quality here than a few Elo points.

---

## 2. What the independent quality evidence says

### 2.1 Artificial Analysis TTS arena, fetched 2026-09-23: every open-weights model

Blind pairwise human votes. Elo ±95% CI. Source: [artificialanalysis.ai/text-to-speech/leaderboard](https://artificialanalysis.ai/text-to-speech/leaderboard) (raw HTML parsed, 92 models, 16 open-weights).

| Rank | Model | Elo | 95% CI | Samples | Params | Weights licence | Usable in a free, publicly distributed extension? | MLX build |
|---:|---|---:|---|---:|---|---|---|---|
| 9 | Breeze TTS 2 (Aug 2026) | 1204 | ±16 | 1,390 | 3.47B | BreezeBlue Research & **Non-Commercial** | **No**: weights *and self-hosted outputs* are non-commercial | yes (`mlx-community/Breeze-TTS-2-mlx*`) |
| 27 | Fish Audio S2 Pro (Mar 2026) | 1120 | ±13 | 2,213 | 4B + 0.4B | Fish Audio Research (**non-commercial**) | **No** | yes (`mlx-community/fish-audio-s2-pro-*`) |
| 36 | Step Audio EditX (Mar 2026) | 1094 | ±13 | 1,927 | 3.5B | code Apache-2.0; **weights licence not stated** on the model card | Unclear | community port only |
| 42 | Voxtral TTS (Mar 2026) | 1076 | ±13 | 2,036 | 4B | **CC BY-NC 4.0** (voices too) | **No** | yes |
| 48 | Magpie-Multilingual 357M (Feb 2026) | 1063 | ±13 | 1,971 | 364M | NVIDIA Open Model Licence (commercial OK) | Yes | **no** (NeMo only) |
| **49** | **Kokoro 82M v1.0 (Jan 2025)** | **1061** | **±11** | **5,232** | **82M** | **Apache-2.0** | **Yes** | **yes (current)** |
| 60 | OpenAudio S1 Mini | 1041 | ±20 | 1,681 | 1.7 GB model + 1.9 GB codec files | **CC BY-NC-SA 4.0** | No | no |
| 61 | Maya1 | 1041 | ±12 | 3,205 | 3.3B | Apache-2.0 | Yes | no official |
| 63 | Higgs Audio V3 / Higgs TTS 3 (Jun 2026) | 1033 | ±13 | 1,970 | 4.65B | Boson Research & **Non-Commercial** | No | yes |
| 70 | Chatterbox (original) | 1021 | ±11 | 4,600 | 0.5B | MIT (+ mandatory watermark) | Yes | yes |
| 75 | Zonos-v0.1 | 1000 | — | 4,802 | 1.6B | Apache-2.0 | Yes | via ZONOS2 port only |
| 77 | VibeVoice 1.5B | 951 | ±14 | 2,095 | 2.7B | MIT, but "research purpose use", TTS code disabled 2025-09-05 | No (vendor-disabled) | yes |

**Read-out.** Kokoro-82M, a model from January 2025, is still statistically tied for the **best permissively-licensed open model on the only large blind arena that lists open weights** (Magpie 1063±13 vs Kokoro 1061±11, overlapping CIs). Every open model scored clearly higher is either non-commercial (Breeze 2, Fish S2 Pro, Voxtral) or a 3.5B model with an unstated weights licence and no official MLX build (Step Audio EditX). None of the newer small models this axis was asked about (Pocket TTS, Kitten TTS, Soprano, Supertonic, NeuTTS, Chatterbox Turbo, Qwen3-TTS open checkpoints, OmniVoice, VoxCPM2) appears on it at all. AA's "Qwen3 TTS" row (926, Jan 2026) is marked *not* open weights and carries no Hugging Face link, so it cannot be equated with the open Qwen3-TTS checkpoints.

AA's separate **controlled-voice** board (cloning from a fixed reference, where Kokoro cannot compete) ranks the open-weights entries Breeze TTS 2 1025, OpenAudio S1 Mini 1014, Fish S2 Pro 1009, Voxtral 1008, Higgs V3 965, Magpie Zeroshot 942, Chatterbox 936 ([controlled-voice](https://artificialanalysis.ai/text-to-speech/leaderboard/controlled-voice)).

### 2.2 TTS Arena V2 (TTS-AGI), fetched 2026-09-23

From its JSON API ([/api/leaderboard](https://tts-agi-tts-arena-v2.hf.space/api/leaderboard)): Kokoro v1.0 **1477 ± 25** over 1,033 votes, now marked inactive, beside Chatterbox 1479 ± 19. The only other open entries are Fluxions Vui (1392, preliminary) and Veena (1363). This arena has stopped adding open models, so it does not discriminate between the 2026 candidates.

### 2.3 Vendor-reported evaluations (not independent; cited for what they are)

- **Pocket TTS vs Kokoro** ([Kyutai technical report, 2026-01-13](https://kyutai.org/pocket-tts-technical-report)): LibriSpeech test-clean WER with Whisper-large-v3 is **Pocket 1.84 vs Kokoro 1.93** (F5-TTS 2.21, Kyutai TTS 1.6B 1.84, Chatterbox Turbo 3.24). Kokoro was excluded from the human quality and similarity Elo because it cannot clone. In that human test, Chatterbox Turbo scored 2055 ± 23 against Pocket's 2016 ± 25 for audio quality. Kyutai names Pocket and Kokoro as the only two that run faster than real time on a laptop CPU.
- **Soprano 1.1** ([card](https://huggingface.co/ekwek/Soprano-1.1-80M)): "95% fewer hallucinations and a 63% preference rate over Soprano-80M"; trained on only ~1,000 hours, so "mispronunciation of uncommon words may occur".
- **Supertonic 3** ([card](https://huggingface.co/Supertone/supertonic-3)): "competitive WER/CER range against much larger open TTS models such as VoxCPM2".
- **Kokoro-7M-Distill** ([card](https://huggingface.co/oddadmix/Kokoro-7M-Distill)): 4.1× faster than Kokoro-82M on 4 CPU threads, but single voice and English only.

---

## 3. Measured on this machine (M1 Max, 2026-09-23)

### 3.1 Today's Kokoro vs upgraded Kokoro vs the PyTorch reference: same weights, same text, same voice

`prince-canuma/Kokoro-82M`, voice `af_heart`, the 973-character prose passage. The reference is the upstream PyTorch package `kokoro` 0.9.4 (`KPipeline(lang_code="a")`), run twice to measure its own run-to-run noise (the decoder has stochastic noise paths). Kokoro's durations are deterministic, so all four clips are exactly 52.625 s long and can be compared frame by frame. Script: `/tmp/ntts-r01/ref_compare.py`.

| Kokoro-82M on… | Level vs reference | Log-mel L1 vs reference (lower = closer) | Prose speed | Whisper WER prose / numeric / long |
|---|---:|---:|---:|---|
| **mlx-audio 0.2.6 (what users run today)** | **−2.65 dB** | **0.577** | 17.1× real time (RTF 0.051–0.059, n=3) | 0.0% / 5.6% / 1.1% |
| **mlx-audio 0.5.5** | **−0.20 dB** | **0.126** | **25.1× real time** (RTF 0.0395–0.0404, n=3) | 0.0% / 5.6% / 0.7–1.3% |
| PyTorch reference, second run (noise floor) | 0.00 dB | 0.058 | — | — |

This independently reproduces PR #859's claim on this machine: the shipped runtime is 2.65 dB quiet and about 10× the reference's own noise away from it spectrally, while 0.5.5 closes most of that gap. Intelligibility was never the problem (same WER); the fixes are to level, pitch contour and timbre. Long-passage speed is unchanged (25.5× vs 26.0×).

### 3.2 Every runnable candidate

"First chunk" is when the model's generator yields its first audio in default mode; "streamed" is mlx-audio's `stream=True` with a 0.5 s interval. (Today the helper waits for *every* chunk before playing, so a user's actual wait is the total generation time: RTF × duration.) Where a model was run three times in a quiet window (`-rep`), the median is shown; single runs are marked ¹. WER uses Whisper large-v3-turbo on ≤28 s pieces cut at pauses (`/tmp/ntts-r01/asr2.py`), which removes the end-of-file hallucinations that inflated a naive run. Speaking duration is shown against Kokoro's 52.6 s for the same prose.

| Model (runtime) | Licence | Prose speed (RTF) | 2,534-char speed | First chunk: default / streamed | Peak MLX memory | Prose duration | WER prose / numeric / long | What went wrong |
|---|---|---:|---:|---|---:|---:|---|---|
| **Kokoro-82M** (mlx-audio 0.5.5) | Apache-2.0 | **25.1×** (0.040) | **26.0×** (5.8 s total) | 1.0 s (yields per segment) / — | 3.4 GB | 52.6 s | **0.0 / 5.6 / 0.7–1.3%** | "$5.8M" read as "5.8 M" (currency dropped); "Elena" heard as "Alina" |
| Pocket TTS, MLX port (Jan 2026 checkpoint) | CC BY 4.0 | 9.5× (0.105) | 8.0× | 4.1 s / **0.05 s** | 1.0 GB | 50.6 s | 0.0–0.6 / 6.5 / 0.9–2.2% | "$4.2 million" → "$4, $2 million"; "$5.8M" → "$5.00" |
| Pocket TTS 3.2.0 official (Apr 2026 checkpoint, CPU) ¹ | CC BY 4.0 | 3.0× (0.33) | 3.1× | 16 s / not measured | CPU, 1.5 GB RSS | 48.8 s | 0.0 / **11.1** / 2.4% | "2026" → "226", "$4.2 million" → "$42 million", "mid-2027" → "mid-227", "Dr." dropped |
| Soprano 1.1 80M (MLX) | Apache-2.0 | 12.3× (0.081) | 12.2× | 3.8 s / — | 0.9 GB | 47.5 s | 0.0 / 8.3 / 1.1–3.1% | "5th Avenue" → "5 Trilline Avenue"; one warm 72-char run returned 1.15 s of audio (truncated) |
| Kitten TTS mini 0.8 (MLX) | Apache-2.0 | 11.5× (0.087) | 9.4× | 1.3 s / — | 2.9 GB | **70.3 s (+34%)** | 0.0 / 9.3 / 1.3–1.5% | slow pacing; "p.m." → "am" |
| Kitten TTS nano 0.8 (MLX) ¹ | Apache-2.0 | — | did not finish in 10 min | — | — | **218 s (4.1×)** | 4.0 / 34.3 / — | runaway durations |
| Supertonic 3 (ONNX, CPU) ¹ | OpenRAIL-M, **archived** | 3.7× (0.27) | 1.3× | 16 s / — | CPU, 1.4 GB RSS | 60.7 s | 0.0 / 5.6 / 2.2% | throughput collapses on long input |
| Chatterbox Turbo 350M (MLX fp16) ¹ | MIT + watermark | 2.9× (0.34) | 2.7× | 5.5 s / 0.33 s, **but streaming runs at 0.54× real time** | 5.3 GB | 52.7 s | 0.0 / 4.6 / 1.7% | "HTTPS" → "HTT S" |
| Qwen3-TTS 0.6B CustomVoice (MLX 8-bit) ¹ | Apache-2.0 | 2.2× (0.46) | 1.2× | 34 s / 0.19 s (2.9×, peak 2.9 GB) | **17.6 GB** | **77.6 s (+47%)** | 0.0 / 3.7 / 3.3% | long passage stretched to 231 s (+54%) with 10 inserted words |
| Qwen3-TTS 1.7B CustomVoice (MLX 8-bit) ¹ | Apache-2.0 | 2.3× (0.44) | not run | 26 s / — | 12.6 GB | 62.2 s | 0.0 / 4.6 / — | "$5.8M" → "5.8 millionths" |
| OmniVoice (MLX bf16) ¹ | **CC BY-NC** weights | 2.4× (0.41) | 1.2× | 27 s / — | 11.2 GB | 67.1 s | 15.4 / 38.9 / **97.8%** | long-form collapse |
| VoxCPM2 2B (MLX 8-bit) ¹ | Apache-2.0 | 1.2× (0.85) | not run | 37 s / — | 10.5 GB | 46.4 s | 0.0 / 4.6 / — | barely real time |
| Breeze TTS 2 (MLX 8-bit) ¹ | **Non-commercial** | **0.25×** (4.02) | not run | 118 s / — | 11.9 GB | 56.3 s | 0.0 / 6.5 / — | 4× slower than real time |

**Four things the measurements settle:**

1. **Speed.** On an M1 Max, Kokoro is 2–3× faster than every small alternative (Pocket, Soprano, Kitten) and 9–100× faster than every larger one. Only Kokoro, Pocket, Soprano and Kitten mini stay at or above 8× real time on long input, the margin a 5,000-character selection needs.
2. **Words are not the differentiator; numbers are.** Every working model scores 0.0–0.6% WER on clean prose. The numeric passage (dates, currency, "Dr.", "Q3", "HTTPS", times) is where they separate. Kokoro, whose misaki front end normalises text before synthesis, makes two slips: it drops the "$" on "$5.8M", and "Elena" is heard as "Alina" on both runtimes (every other model got the name right). The end-to-end small models (Pocket, Kitten, Soprano) invent or mangle amounts and years, which are exactly the tokens a read-aloud extension meets on every news page.
3. **Long-form stability.** Kokoro, Pocket, Soprano, Kitten mini, Supertonic and Chatterbox Turbo held on the 2,534-character passage (≤3.1% WER). Qwen3-TTS 0.6B stretched and inserted words, OmniVoice collapsed, and Kitten nano ran away even on 973 characters.
4. **Streaming is the real latency lever, and it is an architecture change, not a model change.** Streamed, Pocket's first audio arrives in 0.05 s and Qwen3's in 0.19 s. Kokoro already yields per segment (first segment ready after about 1.0 s), but the helper waits for every segment, so users wait 5.8 s for 2,534 characters and, extrapolating linearly, about 11 s for a full 5,000-character selection. That belongs to the helper-architecture axis.

---

## 4. Model-by-model: current state as of 2026-09-23

Legend: **Fit** = fit as a privacy-first, publicly distributed read-aloud engine on Apple Silicon (long-form stability, prosody, pronunciation, licence, footprint).

### 4.1 Kokoro-82M (current default): stay; upgrade the runtime

- **Upstream state:** no new weights. `hexgrad/Kokoro-82M` last changed **2025-04-10**; the only sibling is `Kokoro-82M-v1.1-zh` (2025-02-27). The `kokoro` package is still **0.9.4** (2025-04-05) and `misaki` **0.9.4**; the GitHub repo was last pushed 2025-08-06 ([HF API](https://huggingface.co/api/models/hexgrad/Kokoro-82M), [PyPI kokoro](https://pypi.org/pypi/kokoro/json), [PyPI misaki](https://pypi.org/pypi/misaki/json), [GitHub](https://github.com/hexgrad/kokoro)). There is **no v1.1-en or v2**.
- **Still the most-downloaded TTS model on Hugging Face** (11.8M downloads, 6,991 likes) ([HF API](https://huggingface.co/api/models?pipeline_tag=text-to-speech&sort=downloads)).
- **What changed that matters here: the MLX runtime, not the model.** mlx-audio went from **0.2.6 → 0.5.5** (23 releases, 2025-11-07 → 2026-09-21) ([PyPI](https://pypi.org/pypi/mlx-audio/json)). For Kokoro specifically:
  - **v0.4.8 (2026-08-10), PR #859: five decoder-path bugs fixed where the MLX iSTFTNet port diverged from the PyTorch reference** ([PR #859](https://github.com/Blaizzy/mlx-audio/pull/859)): a constant **−2.5 dB output attenuation**, a symmetric/periodic window mismatch (~3% reconstruction ripple), a **one-frame misalignment in the F0/energy upsample path** (F0_pred relRMSE 0.134 → 0.0000), wrong initial harmonic-phase distribution, and a negative-index wrap in `interpolate1d`. On a 55-utterance battery against the fp32 PyTorch reference: **log-mel L1 0.601 → 0.187, MCD 7.29 → 4.09 dB, F0 RMSE 11.5 → 5.1 Hz**, speaker cosine 0.996 → 0.999. **The extension's Kokoro is therefore measurably worse than Kokoro itself today, and upgrading the runtime alone closes most of that gap.** The PR also warns: "all Kokoro output becomes ~2.5 dB louder (×4/3)".
  - v0.4.3: `misaki` became an **optional** install ([PR #664](https://github.com/Blaizzy/mlx-audio/pull/664)); quantized Kokoro checkpoints supported and NaN durations guarded ([PR #624](https://github.com/Blaizzy/mlx-audio/pull/624)).
  - v0.4.4: "Fix Kokoro usage from worker threads" ([PR #745](https://github.com/Blaizzy/mlx-audio/pull/745)). v0.4.2: float voice parameter fix ([PR #603](https://github.com/Blaizzy/mlx-audio/pull/603)). v0.3.0rc1: Kokoro lang-code fix ([PR #380](https://github.com/Blaizzy/mlx-audio/pull/380)). v0.2.10: voices loadable as `.safetensors` ([PR #364](https://github.com/Blaizzy/mlx-audio/pull/364)).
- **Model repo:** `prince-canuma/Kokoro-82M` and the README-recommended `mlx-community/Kokoro-82M-bf16` hold the **byte-identical** weight file (same LFS oid `4e9ecdf03b8b…`, 327,115,152 bytes, which is fp32 despite the "bf16" name). Switching repos changes nothing about quality or speed. `mlx-community/Kokoro-82M-8bit` is 289 MB ([HF paths-info](https://huggingface.co/api/models/prince-canuma/Kokoro-82M/paths-info/main)).
- **Breaking changes on the upgrade path:** mlx-audio 0.5.5 requires `mlx>=0.31.1`, `transformers>=5.14.0`, `huggingface_hub>=1.0`, Python ≥3.10, and `misaki[en]` installed explicitly ([PyPI requires_dist](https://pypi.org/pypi/mlx-audio/json)). Output is +2.5 dB louder. The `load_model(...)` / `model.generate(text, voice=, speed=)` call shape the worker uses is unchanged (verified by running the same calls on both versions, §3.1).
- **Fit:** best in class for this use: fixed voices, deterministic duration, per-segment chunking inside `generate`, the best number and date handling measured (§3.2), and the fastest candidate measured on this machine (§3). Weaknesses: no cloning; pronunciation depends on misaki, which has not been updated since April 2025; non-English G2P is uneven (FluidAudio documents 5 of 9 languages lacking a real G2P frontend in its port, [issue #926](https://github.com/FluidInference/FluidAudio/issues/926)).

### 4.2 Kyutai Pocket TTS: the strongest new small model; candidate for an optional second engine

- **Released 2026-01-13**; now **v3.2.0 (released today, 2026-09-23)** ([GitHub releases](https://github.com/kyutai-labs/pocket-tts/releases), [PyPI](https://pypi.org/pypi/pocket-tts/json)). 100M parameters (90M generative + 10M codec decoder, plus an 18M encoder used only once per cloned voice). Weights **CC BY 4.0** (commercial use allowed with attribution), code MIT ([HF](https://huggingface.co/kyutai/pocket-tts-without-voice-cloning), [README](https://github.com/kyutai-labs/pocket-tts)).
- **What changed since launch:** v2.0.0 (2026-04-21) added French, German, Portuguese, Italian and Spanish plus an improved `english_2026-04` model with "better short sentences and … better voice cloning"; 24-layer higher-quality variants for non-English. v2.1.0 added per-language default voices. v3.0.x (2026-08-25) released the training code and set English temperature to 0.3. v3.1.0 documented CPU-only install. v3.2.0 updated French and always ends the prompt with sentence-final punctuation.
- **Claims:** "~200ms to get the first audio chunk", "~6x real-time on a CPU of MacBook Air M4", "Uses only 2 CPU cores"; the authors observed no GPU speed-up on Apple Silicon ([README](https://github.com/kyutai-labs/pocket-tts)). Voice cloning from about 5 seconds of audio.
- **MLX:** supported in mlx-audio (`mlx-community/pocket-tts`, 4/6/8-bit variants). **Caveat: that MLX conversion was last modified 2026-02-06, so it is the January `english_2026-01` checkpoint, not the April model** ([HF API](https://huggingface.co/api/models/mlx-community/pocket-tts)). Also supported natively in Swift by **mlx-audio-swift** and **FluidAudio** (CoreML/ANE), the two routes that would let the helper drop Python.
- **Licence trap on the preset voices:** the voice files come from `kyutai/tts-voices`, whose licences differ per voice ([tts-voices README](https://huggingface.co/kyutai/tts-voices)): `alba` (Alba MacKenna, CC BY 4.0), `azelma` / `eponine` / `fantine` (VCTK, CC BY 4.0), `javert` / `marius` (voice donations, CC0) are fine; **`cosette` (Expresso) and `jean` (EARS) are CC BY-NC 4.0, "Non-commercial use only"**. Ship only the six permissive voices.
- **Measured here (§3.2):** MLX port 9.5× real time on prose and 8.0× on long input, under 1 GB, **first streamed audio in 0.05 s**, long-form WER 0.9–2.2%. The official April model on CPU runs 3.0× real time (below the README's M4 figure of ~6×). **Number handling is its weak point:** with no text normaliser, the April model read "2026" as "226", "$4.2 million" as "$42 million" and "mid-2027" as "mid-227", and the MLX port read "$4.2 million" as "$4, $2 million".
- **Fit:** the only new model that combines a Kokoro-class footprint, a permissive licence, genuine streaming, cloning and five extra European languages. It is 2.6× slower than Kokoro on this machine, absent from every independent arena, and **unsafe on web text until a normaliser (misaki's, or a rules-based pass for numbers, currency and dates) sits in front of it.**

### 4.3 Kitten TTS 0.8: smallest, but no quality evidence

- **0.8 released 2026-02-19** (0.8.1 on 2026-02-24); the previous release was 0.1 (2025-08-05) ([GitHub releases](https://github.com/KittenML/KittenTTS/releases)). Nano 15M (25–56 MB), micro 40M, mini 80M; **8 voices** (Bella, Jasper, Luna, Bruno, Rosie, Hugo, Kiki, Leo); English only; **Apache-2.0**; StyleTTS 2 architecture, ONNX-first ([README](https://github.com/KittenML/KittenTTS), [nano card](https://huggingface.co/KittenML/kitten-tts-nano-0.8), [mini card](https://huggingface.co/KittenML/kitten-tts-mini-0.8)). The PyPI package is stale at 0.1.3; 0.8 ships as a GitHub wheel.
- **MLX:** yes (`mlx-community/kitten-tts-{nano,micro,mini}-0.8`, many quantizations); needs `phonemizer-fork` plus an espeak-ng library at runtime. FluidAudio evaluated and **declined** it: "Not supported due to inefficient espeak alternatives" ([Models.md](https://github.com/FluidInference/FluidAudio/blob/main/Documentation/Models.md)).
- **Measured here (§3.2):** mini runs 11.5× real time (Kokoro 25×) but speaks **34% slower** (70.3 s vs 52.6 s for the same prose) and read "p.m." as "am"; **nano produced runaway durations** (218 s of audio for a 53 s passage) and did not finish the long passage in 10 minutes.
- **Fit:** fewer voices than Kokoro, English-only, no arena presence; the mini model is the same size as Kokoro (80M vs 82M). It does not beat Kokoro on any axis this extension cares about.

### 4.4 Soprano 1.1 (80M): fast on CUDA, English-only, thin training data

- Soprano-80M on 2025-12-17, **Soprano-1.1-80M on 2026-01-14**; Apache-2.0; 32 kHz; English only; no cloning; "trained on only 1,000 hours of audio (~100x less than other TTS models)" ([card](https://huggingface.co/ekwek/Soprano-1.1-80M)). Claims "up to 2000x real-time on GPU and 20x on CPU" (batched CUDA) and "<250 ms" streaming latency on CPU. The GitHub repo has not been pushed since 2026-01-15.
- **MLX:** yes (`mlx-community/Soprano-1.1-80M-*`), plus mlx-audio-swift. Note from PR #859: Soprano's `dsp.istft` path "was not audited" for the same −2.5 dB issue.
- **Measured here (§3.2):** 12.3× real time on the M1 Max via MLX (the 2000× figure is batched CUDA); read "5th Avenue" as "5 Trilline Avenue" and "$5.8M" as "$5. 8 cents million"; one warm run of a 72-character sentence returned only 1.15 s of audio.
- **Fit:** English-only with a single voice and admitted pronunciation weakness; no reason to prefer it over Kokoro.

### 4.5 Supertonic 3 (99M): good specs, **project archived**

- Supertonic 1 (2025-11-18), 2 (2026-01-06), **3 (2026-05-06)**: 31 languages, ~99M parameters, ONNX Runtime, preset voice styles, **OpenRAIL-M** weights with use restrictions ([card](https://huggingface.co/Supertone/supertonic-3)). The card claims 3 "improves reading stability, and reduces repeat/skip failures".
- **The GitHub project is archived**: "This repository is archived. Development and support have ended … No updates, bug fixes, security patches, or support will be provided" ([supertone-oss-archive/supertonic](https://github.com/supertone-oss-archive/supertonic)). Weights moved to the `supertone-oss-archive` HF namespace.
- **MLX / Swift:** community `mlx-community/supertonic-3-mlx` (not in mlx-audio's model table); FluidAudio has a CoreML/ANE port.
- **Measured here (§3.2, `supertonic` 1.3.1 on CPU):** 3.7× real time on prose but only **1.3× on the long passage**; good intelligibility (0.0 / 5.6 / 2.2% WER).
- **Fit:** reject as a dependency. An archived, use-restricted model is the wrong foundation for a product's default voice, whatever its benchmarks.

### 4.6 Chatterbox family (Resemble AI): Turbo (350M), Nano (110M), Multilingual (500M), Flash

- **Chatterbox-Turbo 2025-12-02** (350M, English, paralinguistic tags such as `[laugh]`, distilled decoder); **Chatterbox-Nano 2026-04-14** (110M, English, "3x faster than realtime on 8 cores"); **Chatterbox-Flash 2026-05-28** (block-diffusion, FlashInfer + CUDA graphs, so CUDA-only in practice); Multilingual v3 (23 languages) ported to MLX in mlx-audio 0.4.7 ([Turbo card](https://huggingface.co/ResembleAI/chatterbox-turbo), [Nano card](https://huggingface.co/ResembleAI/chatterbox-nano), [Flash card](https://huggingface.co/ResembleAI/chatterbox-flash), [mlx-audio v0.4.7](https://github.com/Blaizzy/mlx-audio/releases/tag/v0.4.7)). All MIT.
- **Every output carries Resemble's PerTh neural watermark** ([card](https://huggingface.co/ResembleAI/chatterbox-turbo)). That is harmless for read-aloud but worth disclosing.
- Quality: the original Chatterbox scores 1021 on AA (below Kokoro); Turbo is not on AA. Kyutai's human test put Turbo's audio quality above Pocket's, but with WER 3.24 vs 1.84.
- **MLX:** yes (`mlx-community/chatterbox-turbo-{fp16,8bit,4bit}`); mlx-audio-swift added Turbo in v0.1.3.
- **Measured here (§3.2, fp16 MLX):** 2.9× real time on prose, 2.7× on long input, 5.3 GB peak; streaming yields first audio in 0.33 s but then runs at **0.54× real time**. Intelligibility was good in this test (0.0 / 4.6 / 1.7% WER).
- **Fit:** expressive and good for dialogue, but at 350M it is 4× Kokoro's size, autoregressive, English-only, watermarked, and about 9× slower than Kokoro here.

### 4.7 Qwen3-TTS (Alibaba): the best-supported large permissive model

- **Released 2026-01-21**: 12 Hz tokenizer, 0.6B (≈0.9B total with codec) and 1.7B (≈1.9B), in Base (cloning), CustomVoice (**9 premium timbres** plus natural-language style control) and VoiceDesign variants; **10 languages**; **Apache-2.0**; "end-to-end synthesis latency as low as 97ms" ([card](https://huggingface.co/Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice), [arXiv 2601.15621](https://arxiv.org/abs/2601.15621)). The GitHub repo was last pushed 2026-03-17.
- **MLX:** first-class; it is now mlx-audio's headline example, with streaming, batching and many fixes (0.3.0–0.5.1, e.g. "window ICL repetition penalty to stop pace acceleration", [PR #914](https://github.com/Blaizzy/mlx-audio/pull/914)). Also in mlx-audio-swift. FluidAudio tried a CoreML port and rated it "too slow".
- **Independent quality:** none for the open checkpoints (see §2.1).
- **Measured here (§3.2, 8-bit MLX):** 0.6B runs 2.2× real time on prose and **1.2× on the long passage with a 17.6 GB peak** (non-streamed); streaming cuts the peak to 2.9 GB with first audio in 0.19 s at 2.9×. It speaks **47% longer** than Kokoro for the same prose, and on the long passage stretched to 231 s with about 10 inserted words. 1.7B: 2.3×, 12.6 GB.
- **Fit:** the most credible permissively-licensed option for a future "expressive / multilingual" engine, but on an M1 Max it is 11–22× slower than Kokoro and its long-form pacing drifts.

### 4.8 OmniVoice (k2-fsa, 2026-03-30): **weights are non-commercial despite Apache code**

- 0.6B-class (612M safetensors), Qwen3-0.6B bidirectional backbone, masked-diffusion decoding, **646+ languages**, cloning, voice design (trained on zh/en only), "RTF as low as 0.025" on H100 ([README](https://github.com/k2-fsa/OmniVoice), [card](https://huggingface.co/k2-fsa/OmniVoice)). 1.33M downloads; latest release 0.2.1 (2026-07-16).
- **Licence: the GitHub repo shows Apache-2.0, but the model card states "The pre-trained model is licensed under the CC-BY-NC due to constraints from its training data (e.g., Emilia)."** It is easy to misread as permissive.
- **Measured here (§3.2, bf16 MLX, no reference audio):** 2.4× real time, 11.2 GB peak; WER 15.4% on prose and **97.8% on the long passage**, where it collapsed.
- **Fit:** reject for this extension (licence, and long-form collapse without a reference clip). The architecture is interesting for breadth of languages.

### 4.9 VoxCPM2 (OpenBMB, 2026-04-03): 48 kHz, Apache, but 2B

- 2B, 30 languages, **48 kHz** output, voice design, cloning, continuation for long-form; **Apache-2.0, "free for commercial use"**; "RTF as low as ~0.3 on NVIDIA RTX 4090"; ~8 GB VRAM; the card warns of "occasional instability … with very long or highly expressive inputs" ([card](https://huggingface.co/openbmb/VoxCPM2)). Latest release 2.0.3 (2026-05-11) ([GitHub](https://github.com/OpenBMB/VoxCPM/releases)).
- **MLX:** yes (`mlx-community/VoxCPM2-{bf16,8bit,4bit}`).
- **Measured here (§3.2, 8-bit MLX, voice-design prompt):** 1.2× real time on prose and **0.9× on the numeric passage**, 10.5 GB peak; intelligibility good (0.0 / 4.6% WER).
- **Fit:** permissive and high-fidelity, but barely real time on this machine, far too slow for a read-aloud default.

### 4.10 Breeze TTS 2 (BreezeBlue, 2026-08-25): #1 open model on AA, but non-commercial and CUDA-first

- 3.47B; English + Chinese; voice clone / design / direction; vocal events; "0.32 real-time factor … on an NVIDIA H100"; requires "Linux … A CUDA-capable NVIDIA GPU" upstream ([card](https://huggingface.co/BreezeBlue/Breeze-TTS-2)). AA Elo **1204 ± 16**, #9 overall and #1 among open weights.
- **Licence:** "model weights, derivative models, and **self-hosted outputs** are for research and non-commercial use only."
- **MLX:** yes (`mlx-community/Breeze-TTS-2-mlx{,-8bit,-4bit}`, 2026-08-26), also in mlx-audio-swift.
- **Measured here (§3.2, 8-bit MLX):** **0.25× real time** (RTF 4.0; 226 s to synthesise 56 s of prose), 11.9 GB peak.
- **Fit:** reject. The licence forbids it, even the outputs are restricted, and it runs 4× slower than real time on an M1 Max.

### 4.11 Fish Audio S2 Pro (2026-03-09), Voxtral TTS (Mistral, 2026-03-26), Higgs TTS 3 (Boson, 2026-06-04)

All three rank above Kokoro on AA (1120 / 1076 / 1033) and all three have MLX builds. **All three are non-commercial**: Fish Audio Research Licence with an "I agree to use this model for non-commercial use ONLY" gate ([card](https://huggingface.co/fishaudio/s2-pro)); CC BY-NC 4.0, including the 20 reference voices ([card](https://huggingface.co/mistralai/Voxtral-4B-TTS-2603)); Boson "Research and Non-Commercial License" where "embedding in a product/service … requires a separate commercial license" ([card](https://huggingface.co/bosonai/higgs-tts-3-4b)). All are 4B-class. **Reject.** (Older Higgs Audio v2, 3B, uses a community licence that requires an extra grant above 100,000 annual active users ([LICENSE](https://huggingface.co/bosonai/higgs-audio-v2-generation-3B-base/raw/main/LICENSE)).)

### 4.12 NeuTTS (Neuphonic): Air (2025-09) and the Nano family (2025-11 → 2026)

- NeuTTS-Air (~552M total, English, cloning, **Apache-2.0**); NeuTTS-Nano (~229M) plus Nano-French/German/Spanish and NeuTTS-2E (emotional, 4 fixed speakers) under the **"NeuTTS Open License 1.0"**; watermarked outputs; GGUF/llama.cpp-first with streaming "GGUF only" ([README](https://github.com/neuphonic/neutts)). `neutts` PyPI 1.4.1 (2026-07-22). The HF repos are auto-gated. **No MLX port** in mlx-audio. Neuphonic's hosted "NeuTTS Max" ranks 1439 on TTS Arena V2, below Kokoro.
- **Fit:** no advantage over Kokoro for fixed-voice reading; the licence varies by model; not in the MLX ecosystem.

### 4.13 VibeVoice (Microsoft)

- VibeVoice-1.5B (Aug 2025): "limited to research purpose use"; after misuse, Microsoft disabled the TTS code on 2025-09-05 (the README lists VibeVoice-TTS-1.5B as "Disabled"). **VibeVoice-Realtime-0.5B (2025-12-03)**: MIT, English single-speaker, "~300 ms first audible latency", robust long-form; experimental multilingual voices added 2025-12-16; Microsoft still says "We do not recommend using VibeVoice in commercial or real-world applications without further testing" ([README](https://github.com/microsoft/VibeVoice), [Realtime card](https://huggingface.co/microsoft/VibeVoice-Realtime-0.5B)). AA: 951 for the 1.5B. The repo's 2026 activity is all ASR.
- **Fit:** reject. The vendor itself disclaims product use, and quality is below Kokoro.

### 4.14 Kyutai TTS 1.6B / Unmute, Sesame CSM-1B, Orpheus 3B, Dia / Dia2, Marvis, Spark-TTS, Zonos / ZONOS2, IndexTTS2 / 2.5, F5 / E2-TTS

| Model | Latest state (primary source) | Licence | MLX | Verdict here |
|---|---|---|---|---|
| Kyutai TTS 1.6B (en/fr) | weights last changed 2025-09-11; superseded for local use by Pocket TTS; Unmute is Kyutai's voice-chat *system* (repo active 2026-09-09) ([HF](https://huggingface.co/kyutai/tts-1.6b-en_fr), [unmute](https://github.com/kyutai-labs/unmute)) | CC BY 4.0 | via `moshi-mlx` 0.3.0 (2025-08-04) | superseded by Pocket |
| Sesame CSM-1B | unchanged since 2025 (repo push 2025-05-27) ([GitHub](https://github.com/SesameAILabs/csm)) | Apache-2.0 | yes | conversational and needs context; stale |
| Orpheus 3B | last push 2025-12-05; 3.78B; fine-tuned from `Llama-3.2-3B-Instruct`, so the Llama 3.2 licence terms propagate ([HF](https://huggingface.co/canopylabs/orpheus-3b-0.1-ft)) | Apache-2.0 + Llama 3.2 | yes (mlx-audio `llama`, mlx-audio-swift) | too large, stale |
| Dia 1.6B / **Dia2 1B & 2B (2025-11-15)** | Dia2 is a streaming *dialogue* model, "only supports up to 2 minutes of generation in English" ([card](https://huggingface.co/nari-labs/Dia2-2B)) | Apache-2.0 | Dia 1.6B yes; Dia2 no | 2-minute ceiling disqualifies it for reading |
| Marvis TTS 100M / 250M v0.2 | last weights 2025-11-06/08; repo push 2025-08-28 ([HF](https://huggingface.co/Marvis-AI)) | Apache-2.0 | yes (native MLX, mlx-audio-swift) | stale; 250M total 569M params |
| Spark-TTS 0.5B | unchanged since 2025-03 ([HF](https://huggingface.co/SparkAudio/Spark-TTS-0.5B)) | **CC BY-NC-SA 4.0** | yes | licence |
| Zonos v0.1 → **ZONOS2 (2026-06-11)** | ZONOS2: MoE, 6M+ h of training data, 44.1 kHz, cloning; the MLX conversion is **15.3 GB** ([HF](https://huggingface.co/Zyphra/ZONOS2), [mlx](https://huggingface.co/mlx-community/Zyphra-ZONOS2)); `zonos1.cpp` GGUF port of v0.1 (2026-07-15) | Apache-2.0 | yes | far too large |
| IndexTTS2 → **IndexTTS-2.5 (2026-08-10)** | ~0.8B GPT backbone; zh/en/ja/es/ar; emotion control; cloning ([card](https://huggingface.co/IndexTeam/IndexTTS-2.5)) | bilibili Model Licence (extra terms above 100M MAU or a revenue threshold; no use to improve other models) | IndexTTS 1/1.5 only (mlx-audio-swift) | cloning-first; restrictive licence |
| F5-TTS / E2-TTS | code 1.1.22 (2026-07-23), weights unchanged since 2025 ([PyPI](https://pypi.org/pypi/f5-tts/json), [HF](https://huggingface.co/SWivid/F5-TTS)) | code MIT, **weights CC BY-NC 4.0** | `f5-tts-mlx` 0.2.6 (2025-03) | licence |

### 4.15 Other 2026 models surfaced from HF trending and the AA arena

| Model | Date | Size | Licence | Why not here |
|---|---|---|---|---|
| NVIDIA Magpie-Multilingual 357M (v2607) | 2025-12 → 2026-07-21 | 364M | NVIDIA Open Model Licence, "ready for commercial use" | ties Kokoro on AA (1063 vs 1061); 12 languages but **5 voices**; NeMo-only, no MLX ([card](https://huggingface.co/nvidia/magpie_tts_multilingual_357m)) |
| Tencent AuK / AuK-Flash | 2026-08-18 / 21 | 1.5B | MIT | generation-and-editing foundation model; zero-shot/instruct only, no preset voices; no MLX ([card](https://huggingface.co/tencent/AuK)) |
| Step-Audio-EditX | 2025-11 → 2026-02 | 3.5B | code Apache-2.0, weights unstated | editing model; community MLX port only ([card](https://huggingface.co/stepfun-ai/Step-Audio-EditX)) |
| Maya1 | 2025-10-18 | 3.3B | Apache-2.0 | voice design; AA 1041 < Kokoro ([card](https://huggingface.co/maya-research/maya1)) |
| Fun-CosyVoice3-0.5B-2512 | 2025-12-11 | 0.5B | Apache-2.0 | cloning-first; no mlx-audio port ([HF](https://huggingface.co/FunAudioLLM/Fun-CosyVoice3-0.5B-2512)) |
| MOSS-TTS-Nano-100M | 2026-04-02 | 0.1B | Apache-2.0 | 20 languages but "voice clone mode … is the main recommended workflow"; no preset voices ([card](https://huggingface.co/OpenMOSS-Team/MOSS-TTS-Nano-100M)) |
| gepard-1.0 | 2026-06-22 | 556M | Apache-2.0 | vLLM/CUDA streaming model; en/es/pt/nl; no MLX ([card](https://huggingface.co/nineninesix/gepard-1.0)) |
| Audio8-TTS-Preview-0.1B | 2026-08-19 | ~0.17B + 0.12B codec | Audio8 Community Licence | preview, cloning-first ([card](https://huggingface.co/Edge0/Audio8-TTS-Preview-0.1b)) |
| Kokoro-7M-Distill | 2026-09-08 | 7.5M | Apache-2.0 | one voice (`af_msa`), English, 2 weeks old ([card](https://huggingface.co/oddadmix/Kokoro-7M-Distill)) |
| LongCat-AudioDiT-1B | 2026-03-30 | 1.4B | MIT | zh/en cloning ([HF](https://huggingface.co/meituan-longcat/LongCat-AudioDiT-1B)) |
| KugelAudio, MOSS-TTS 8B, Ming-Omni, rumik-oss 1, Irodori, Echo-TTS, TADA, MeloTTS v3 | various | 0.1–17B | mixed | in mlx-audio 0.5.5 but language-specific (Indic, Japanese, European), very large, or weaker than Kokoro for English reading |
| Resemble Dramabox | 2026-04-17 | LTX-2.3-based | LTX-2 Community Licence | prompt-driven drama TTS; not a reading engine |

---

## 5. Runtimes that change how the model decision plays out

The model question and the runtime question are linked: whether a second engine is worth adding depends partly on which runtimes can host both. (The library upgrade itself belongs to the libraries axis; only the facts that bear on model choice are here.)

| Runtime | State on 2026-09-23 | Kokoro | Pocket TTS | Other relevant | What it means here |
|---|---|---|---|---|---|
| **mlx-audio (Python)** | 0.5.5 (2026-09-21); MIT; 7,936★; pushed today ([PyPI](https://pypi.org/pypi/mlx-audio/json), [GitHub](https://github.com/Blaizzy/mlx-audio)) | yes, with the PR #859 decoder fixes | yes, but the January checkpoint | ~40 TTS architectures | The drop-in path: same `load_model` / `generate` calls the worker already makes. |
| **mlx-audio-swift** | v0.1.3 (2026-07-09); MIT; pushed 2026-09-18 ([releases](https://github.com/Blaizzy/mlx-audio-swift/releases)) | **yes**, added 2026-03-25 (#124) with a Swift port of misaki's English G2P and number-to-words; per-phoneme durations exposed 2026-08-16 (#239). Not listed in the README table, but present in `Sources/MLXAudioTTS/Models/StyleTTS2/Kokoro/` ([README](https://github.com/Blaizzy/mlx-audio-swift/blob/main/Sources/MLXAudioTTS/Models/StyleTTS2/Kokoro/README.md)) | yes | Soprano, Qwen3-TTS, Chatterbox Turbo, Marvis, KittenTTS, OmniVoice, Breeze 2, Fish S2 | **Lets the Swift helper run Kokoro in-process and delete the Python 3.11 + torch + spaCy environment.** From reading the code (not measured): its iSTFT already normalises by Σw² with a periodic Hann window and its upsample path is right-padded (aligned), so it does not carry the two audible Python bugs fixed in #859; it still draws initial harmonic phase from `MLXRandom.normal` (#859 fix 4). Per-phoneme durations make word-level highlighting possible. |
| **FluidAudio** (CoreML / Apple Neural Engine) | v0.17.1 (2026-09-23); Apache-2.0 ([GitHub](https://github.com/FluidInference/FluidAudio), [Models.md](https://github.com/FluidInference/FluidAudio/blob/main/Documentation/Models.md)) | "Kokoro ANE (7-stage)", "3-11× RTFx", documented as English (`af_heart`) and Mandarin variants, "≤510 IPA phonemes per call, no chunker / SSML / custom lexicon" | yes, streaming with cloning, 6 languages, 6L and 24L | Supertonic-3; Kitten and Qwen3-TTS evaluated and **declined** | ANE offload with low power draw, at the cost of voice and language coverage today. Watch, don't adopt yet. |
| kokoro-onnx | 0.6.1 (2026-08-19); MIT ([PyPI](https://pypi.org/pypi/kokoro-onnx/json)) | yes (CPU ONNX) | no | — | Only relevant if Metal/MLX is ever dropped. |

**Consequence for the second-engine decision.** Kokoro and Pocket TTS are the only two models supported by **all three** Apple-native runtimes (mlx-audio, mlx-audio-swift, FluidAudio): Kitten and Qwen3-TTS were declined by FluidAudio, and Supertonic is absent from mlx-audio's model directory. Any other second model would keep the helper tied to one runtime.

---

## 6. Migration steps for the recommended changes

### 6.1 Runtime upgrade under the same model (recommendation 1)

1. **Pins** (all current on PyPI 2026-09-23): `mlx==0.32.2`, `mlx-metal==0.32.2`, `mlx-audio==0.5.5`, `misaki[en]==0.9.4` (**now required explicitly**; mlx-audio made it optional in 0.4.3), `transformers>=5.14` (latest 5.17.0), `huggingface_hub>=1.0` (latest 1.32.0), `espeakng-loader` (misaki's out-of-vocabulary fallback). Python 3.11 remains valid (mlx-audio needs ≥3.10; misaki and kokoro need <3.13). Sources: [mlx-audio](https://pypi.org/pypi/mlx-audio/json), [mlx](https://pypi.org/pypi/mlx/json), [misaki](https://pypi.org/pypi/misaki/json), [transformers](https://pypi.org/pypi/transformers/json), [huggingface-hub](https://pypi.org/pypi/huggingface-hub/json).
2. **Keep** `load_model("prince-canuma/Kokoro-82M")`, or switch to `mlx-community/Kokoro-82M-bf16`; the weight file is identical (§4.1).
3. **Keep stdout redirected around `generate`.** In 0.5.5, Kokoro announces pipeline creation with a bare `print(...)` (`mlx_audio/tts/models/kokoro/kokoro.py:285`); 0.2.6 used `logger.info`. The worker already wraps `generate` in `redirect_stdout(devnull)`, and that redirect is now load-bearing for the length-prefixed stdout protocol.
4. **Expect +2.5 dB.** The offscreen player applies no gain (`chrome-extension/src/offscreen/`), so users will hear it. Peaks stay at about −3 dBFS on the test passages (§3), so no clipping was observed.
5. **Regression gate:** re-run `/tmp/ntts-r01/ref_compare.py` (level and log-mel distance to PyTorch Kokoro) and `asr2.py` (Whisper WER) against the upgraded helper; expect about −0.2 dB and 0.13 log-mel L1, and WER no worse than §3.1.
6. **Homebrew espeak dependency:** the helper sets `ESPEAK_DATA_PATH=/opt/homebrew/opt/espeak-ng/share/espeak-ng-data` (`PythonWorker.swift:39`). On mlx-audio 0.2.6 the worker aborts without it, because it reads espeakng-loader's baked-in CI path (`/Users/runner/work/espeakng-loader/…/phontab`, observed here). On 0.5.5 every fixture ran without the variable, since misaki points phonemizer at the bundled `espeakng_loader.get_data_path()` itself (`misaki/espeak.py:8-10`). Confirm with an out-of-vocabulary-heavy fixture, then drop the Homebrew path so users no longer need `brew install espeak-ng`.

### 6.2 Voice exposure (recommendation 3)

1. Replace the hard-coded six voices in `HTTPServer.swift:203-211` with Kokoro's graded list ([VOICES.md](https://huggingface.co/hexgrad/Kokoro-82M/raw/main/VOICES.md)); default to **`af_heart` (A)**; hide or badge D/F-grade voices (`am_adam` is F+).
2. Fix the `af_sarah` "(UK)" label (it is American); add real British voices (`bf_emma` B-, `bm_george` C, `bm_fable` C).
3. **Pass `lang_code` from the voice prefix** (`a`/`b`/`e`/`f`/`h`/`i`/`j`/`p`/`z`). Both 0.2.6 and 0.5.5 default `lang_code="a"`, so a British voice is currently phonemised as American English. This is harmless today only because no British voice is exposed.
4. **Non-English voices remain unusable until `normalize_text()` changes**: the worker NFKD-normalises and then ASCII-strips every request (`tts_worker.py` `normalize_text`), which drops accents and erases CJK. The extension is English-only by construction today, whatever the model.

### 6.3 If the operator opts into Pocket TTS as a second engine (recommendation 5)

1. Add an `engine` field to `/speak` and make `/voices` engine-aware; lazy-load Pocket so Kokoro-only users pay nothing.
2. Use the **April 2026 `english_2026-04` checkpoint** (official `pocket-tts` 3.2.0, CPU) or re-convert it for MLX. The `mlx-community/pocket-tts` port predates it.
3. Ship only the permissively-licensed preset voices (`alba`, `azelma`, `eponine`, `fantine`, `javert`, `marius`); exclude `cosette` and `jean` (CC BY-NC). Add CC BY 4.0 attribution for Kyutai, VCTK and Alba MacKenna in the extension's About and store listing.
4. If cloning is exposed: process the reference clip locally only, never upload it, and gate it behind an explicit consent checkbox that mirrors Kyutai's prohibited-use terms ("voice impersonation or cloning without explicit … consent").
5. Put a text normaliser in front of it (numbers, currency, dates, abbreviations); §3.2 shows what happens without one.
6. Stream it: Pocket's value (0.05 s to first chunk when streamed, §3.2) is only realised if the helper streams audio to the offscreen document, which the current single-response design does not.

---

## 7. Method and caveats

- **Harness:** `/tmp/ntts-r01/bench.py` (one model per process; `load_model(repo)` then `model.generate(text=…, **kwargs)`; wall-clock time to first yielded chunk and to completion; audio duration from samples; peak MLX memory via `mx.get_peak_memory()`; RSS via `getrusage`). CPU runs: `/tmp/ntts-r01/cpu_bench.py`. Fidelity: `/tmp/ntts-r01/ref_compare.py` (RMS level and frame-aligned 80-band log-mel L1 against PyTorch `kokoro` 0.9.4). Intelligibility: `/tmp/ntts-r01/asr2.py` (Whisper large-v3-turbo via mlx-audio; each clip cut into ≤28 s pieces at its quietest 50 ms frame, temperature 0, no conditioning on previous text; lower-cased, punctuation-stripped WER against the source text). A first, naive whole-file pass (`asr_eval.py`) was discarded: Whisper hallucinated extra sentences after the true end of clips whose audio carried speech right up to the last frame, inflating one Kokoro long-form WER to 36.8%.
- **Fixtures:** `short` (72 chars), `prose` (973 chars, no digits, the clean intelligibility and stability signal), `numeric` (583 chars: dates, currency, "Dr.", "Q3", "HTTPS", times), `long` (2,534 chars = prose + numeric + a prose variant, the long-form stress case). Numeric-fixture WER is inflated for every model because Whisper renders spoken numbers as digits while the normaliser compares tokens; compare models against each other there, not against zero.
- **Environments:** new stack = scratch venv (Python 3.12.13, mlx 0.32.2, mlx-audio 0.5.5, transformers 5.17.0, torch 2.14.0); old stack = the repo's own `python-env` (Python 3.11.4, mlx 0.29.3, mlx-audio 0.2.6), executed **read-only** (`PYTHONDONTWRITEBYTECODE=1`, HOME and HF_HOME redirected to `/tmp`). No repo file was modified.
- **Contention:** sibling research sessions ran their own benchmarks on this machine at the same time (`/tmp/ntts-r02`, `/tmp/ntts-r04`). It measurably cost speed: Kokoro's first, contended run was 16.6× real time on prose against 25.1× in the quiet repeats. The small models (Kokoro, Pocket, Soprano, Kitten mini) were therefore re-run three times in a quiet window, and those medians are reported. The single-run large models may be understated by a similar ~35%, which does not change any conclusion: they sit 9–100× behind Kokoro.
- **Not measured:** the long passage for Qwen3-TTS 1.7B, VoxCPM2 and Breeze 2 (skipped for time; each was already ≤2.3× real time on prose), and for Kitten nano (stopped after 10 minutes); Voxtral, Fish S2 Pro and Higgs 3 (excluded on licence before measuring); MOSS-TTS-Nano (refuses to run without reference audio); MeloTTS v3 (needs `g2p_en`, a 2024-era model); Magpie, NeuTTS, AuK, gepard, Step-Audio-EditX (no mlx-audio port). Quality was not judged by ear; §2 cites blind arenas for that.

---

## Sources

All fetched 2026-09-23.

**Leaderboards**
- Artificial Analysis TTS leaderboard: https://artificialanalysis.ai/text-to-speech/leaderboard · controlled-voice: https://artificialanalysis.ai/text-to-speech/leaderboard/controlled-voice
- TTS Arena V2 (TTS-AGI): https://tts-agi-tts-arena-v2.hf.space/api/leaderboard
- Hugging Face text-to-speech, by trending and by downloads: https://huggingface.co/api/models?pipeline_tag=text-to-speech&sort=trendingScore · https://huggingface.co/api/models?pipeline_tag=text-to-speech&sort=downloads

**Kokoro and its runtimes**
- https://huggingface.co/api/models/hexgrad/Kokoro-82M · VOICES.md https://huggingface.co/hexgrad/Kokoro-82M/raw/main/VOICES.md · https://huggingface.co/hexgrad/Kokoro-82M-v1.1-zh · https://github.com/hexgrad/kokoro
- PyPI: https://pypi.org/pypi/kokoro/json · https://pypi.org/pypi/misaki/json · https://pypi.org/pypi/kokoro-onnx/json
- Weight-file identity: https://huggingface.co/api/models/prince-canuma/Kokoro-82M/paths-info/main · https://huggingface.co/mlx-community/Kokoro-82M-bf16 · https://huggingface.co/mlx-community/Kokoro-82M-8bit
- mlx-audio: https://pypi.org/pypi/mlx-audio/json · https://github.com/Blaizzy/mlx-audio · releases https://github.com/Blaizzy/mlx-audio/releases · PR #859 https://github.com/Blaizzy/mlx-audio/pull/859 · PR #664 https://github.com/Blaizzy/mlx-audio/pull/664 · PR #624 https://github.com/Blaizzy/mlx-audio/pull/624 · PR #745 https://github.com/Blaizzy/mlx-audio/pull/745 · PR #603 https://github.com/Blaizzy/mlx-audio/pull/603 · PR #380 https://github.com/Blaizzy/mlx-audio/pull/380 · PR #364 https://github.com/Blaizzy/mlx-audio/pull/364 · PR #914 https://github.com/Blaizzy/mlx-audio/pull/914
- mlx: https://pypi.org/pypi/mlx/json · https://pypi.org/pypi/mlx-metal/json · transformers https://pypi.org/pypi/transformers/json · huggingface-hub https://pypi.org/pypi/huggingface-hub/json · torch https://pypi.org/pypi/torch/json
- mlx-audio-swift: https://github.com/Blaizzy/mlx-audio-swift · Kokoro README https://github.com/Blaizzy/mlx-audio-swift/blob/main/Sources/MLXAudioTTS/Models/StyleTTS2/Kokoro/README.md · releases https://github.com/Blaizzy/mlx-audio-swift/releases
- FluidAudio: https://github.com/FluidInference/FluidAudio · https://github.com/FluidInference/FluidAudio/blob/main/Documentation/Models.md · issue #926 https://github.com/FluidInference/FluidAudio/issues/926

**Candidates (model cards, repos, packages)**
- Pocket TTS: https://github.com/kyutai-labs/pocket-tts · releases https://github.com/kyutai-labs/pocket-tts/releases · https://pypi.org/pypi/pocket-tts/json · https://huggingface.co/kyutai/pocket-tts-without-voice-cloning · tech report https://kyutai.org/pocket-tts-technical-report · voices https://huggingface.co/kyutai/tts-voices · MLX https://huggingface.co/api/models/mlx-community/pocket-tts · CALM paper https://arxiv.org/abs/2509.06926
- Kitten TTS: https://github.com/KittenML/KittenTTS · https://github.com/KittenML/KittenTTS/releases · https://huggingface.co/KittenML/kitten-tts-nano-0.8 · https://huggingface.co/KittenML/kitten-tts-mini-0.8 · https://pypi.org/pypi/kittentts/json
- Soprano: https://huggingface.co/ekwek/Soprano-1.1-80M · https://github.com/ekwek1/soprano
- Supertonic: https://huggingface.co/Supertone/supertonic-3 · https://github.com/supertone-oss-archive/supertonic · https://pypi.org/pypi/supertonic/json
- Chatterbox: https://huggingface.co/ResembleAI/chatterbox · https://huggingface.co/ResembleAI/chatterbox-turbo · https://huggingface.co/ResembleAI/chatterbox-nano · https://huggingface.co/ResembleAI/chatterbox-flash · https://github.com/resemble-ai/chatterbox · https://pypi.org/pypi/chatterbox-tts/json
- Qwen3-TTS: https://huggingface.co/Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice · https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice · https://arxiv.org/abs/2601.15621 · https://github.com/QwenLM/Qwen3-TTS
- OmniVoice: https://huggingface.co/k2-fsa/OmniVoice · https://github.com/k2-fsa/OmniVoice
- VoxCPM2: https://huggingface.co/openbmb/VoxCPM2 · https://github.com/OpenBMB/VoxCPM/releases
- Breeze TTS 2: https://huggingface.co/BreezeBlue/Breeze-TTS-2 · https://github.com/breezeblue-ai/breeze-tts · https://huggingface.co/mlx-community/Breeze-TTS-2-mlx-8bit
- Fish Audio S2 Pro / S1 Mini: https://huggingface.co/fishaudio/s2-pro · https://huggingface.co/api/models/fishaudio/s1-mini · https://github.com/fishaudio/fish-speech
- Voxtral TTS: https://huggingface.co/mistralai/Voxtral-4B-TTS-2603
- Higgs TTS 3 / Higgs Audio v2: https://huggingface.co/bosonai/higgs-tts-3-4b · https://huggingface.co/bosonai/higgs-audio-v2-generation-3B-base/raw/main/LICENSE
- NeuTTS: https://github.com/neuphonic/neutts · https://pypi.org/pypi/neutts/json
- VibeVoice: https://github.com/microsoft/VibeVoice · https://huggingface.co/microsoft/VibeVoice-1.5B · https://huggingface.co/microsoft/VibeVoice-Realtime-0.5B
- Kyutai TTS 1.6B / Unmute: https://huggingface.co/kyutai/tts-1.6b-en_fr · https://github.com/kyutai-labs/delayed-streams-modeling · https://github.com/kyutai-labs/unmute · https://pypi.org/pypi/moshi-mlx/json
- Sesame CSM: https://huggingface.co/sesame/csm-1b · https://github.com/SesameAILabs/csm
- Orpheus: https://huggingface.co/canopylabs/orpheus-3b-0.1-ft · https://github.com/canopyai/Orpheus-TTS
- Dia / Dia2: https://huggingface.co/nari-labs/Dia2-2B · https://huggingface.co/nari-labs/Dia2-1B · https://github.com/nari-labs/dia2
- Marvis: https://huggingface.co/Marvis-AI/marvis-tts-250m-v0.2 · https://github.com/Marvis-Labs/marvis-tts
- Spark-TTS: https://huggingface.co/SparkAudio/Spark-TTS-0.5B
- Zonos / ZONOS2: https://huggingface.co/Zyphra/Zonos-v0.1-transformer · https://huggingface.co/Zyphra/ZONOS2 · https://huggingface.co/mlx-community/Zyphra-ZONOS2 · https://huggingface.co/Zyphra/ZONOS1-GGUF
- IndexTTS: https://huggingface.co/IndexTeam/IndexTTS-2.5 · https://huggingface.co/IndexTeam/IndexTTS-2.5/raw/main/LICENSE · https://github.com/index-tts/index-tts
- F5/E2-TTS: https://huggingface.co/SWivid/F5-TTS · https://pypi.org/pypi/f5-tts/json · https://pypi.org/pypi/f5-tts-mlx/json
- Magpie: https://huggingface.co/nvidia/magpie_tts_multilingual_357m
- Others: https://huggingface.co/tencent/AuK · https://huggingface.co/tencent/AuK-Flash · https://huggingface.co/stepfun-ai/Step-Audio-EditX · https://github.com/stepfun-ai/Step-Audio-EditX · https://huggingface.co/maya-research/maya1 · https://huggingface.co/FunAudioLLM/Fun-CosyVoice3-0.5B-2512 · https://huggingface.co/OpenMOSS-Team/MOSS-TTS-Nano-100M · https://huggingface.co/nineninesix/gepard-1.0 · https://huggingface.co/Edge0/Audio8-TTS-Preview-0.1b · https://huggingface.co/oddadmix/Kokoro-7M-Distill · https://huggingface.co/meituan-longcat/LongCat-AudioDiT-1B · https://huggingface.co/ResembleAI/Dramabox

**This repo (read, not modified)**
- `native-helper/Sources/NaturalTTSHelper/Resources/tts_worker.py`, `HTTPServer.swift` (lines 108-122, 150-153, 203-211), `Config.swift:43`, `PythonWorker.swift:37-40`, `chrome-extension/src/popup/popup.ts:406`, the `python-env/…/site-packages/*.dist-info` pins.

**Reproduction artifacts** (scratch, outside the repo): `/tmp/ntts-r01/bench.py`, `cpu_bench.py`, `asr2.py`, `ref_compare.py`, `results.jsonl`, `asr2.jsonl`, `ref_compare.json`, and every generated WAV under `/tmp/ntts-r01/out/`.

---

## Adversarial verification (2026-09-23)

*Independent verifier pass, appended; the author's text above is unchanged. Every claim was re-fetched from a primary source (PyPI JSON, GitHub API, Hugging Face API/raw cards, the Artificial Analysis page's embedded data). The fidelity numbers were recomputed from the author's WAVs with my own code, and the speed claim was re-run as an interleaved A/B. Scratch: `/tmp/ntts-verifier-r01/` (`refcheck.py`/`refcheck.json`, `ab.py`/`ab.sh`/`ab.log`).*

**Bottom line.** The report's facts are overwhelmingly correct: every version, date, licence, PR and leaderboard number I re-fetched matched. Three sub-claims do not survive, and none of them changes a verdict:

- the 0.2.6 → 0.5.5 **speed-up** is a machine-contention artifact;
- Kokoro made **two** numeric-passage slips, not one;
- Magpie **does** have a community MLX port.

The Pocket TTS voice list is also stale: v3.2.0 ships 26 preset voices, not 8. The consequential miss is a **platform break hidden inside recommendation 1**: every mlx-audio release that carries the Kokoro fix needs mlx ≥ 0.31.1, and mlx has shipped no macOS 13 wheel since 0.29.4. The upgrade therefore silently drops the helper's documented macOS 13 support.

### Verdict table

| # | Claim (abridged) | Verdict | Primary source used | Note |
|---:|---|---|---|---|
| 1a | Kokoro 82M v1.0 Elo 1061 ± 11, 5,232 samples, rank 49. Open models above it: Breeze TTS 2 1204, Fish S2 Pro 1120, Step Audio EditX 1094, Voxtral 1076, Magpie 1063 ± 13 | **confirmed** | AA leaderboard page's embedded `values` records (parsed 2026-09-23): Kokoro 1061.27 / 5232 / ciDelta 11 / rank 49; Breeze 1204.35 / 1390 / 16 / rank 9; Fish 1120.31 / 2213 / 13; Step EditX 1094.28 / 1927 / 13; Voxtral 1075.73 / 2036 / 13; Magpie 1062.67 / 1971 / 13 / rank 48 | AA's own `openWeightsCommercial` flag is `true` for Kokoro and Magpie and `false` for Breeze, Fish, Step EditX and Voxtral, which independently supports the licence reading |
| 1b | Magpie has "no MLX (NeMo only)" | **refuted** | https://huggingface.co/api/models/aufklarer/Magpie-TTS-Multilingual-357M-MLX-8bit (created 2026-05-22, NVIDIA Open Model Licence); https://github.com/soniqo/speech-swift README | Community MLX INT8/INT4 conversions exist and run in the Swift SDK `soniqo/speech-swift` ("MLX INT8 411 MB or CoreML INT8 342 MB, 9 languages, 5 baked speakers, streaming on MLX"). It is still absent from mlx-audio, so the tie-break for rec 2 should rest on 5 speakers and autoregressive decoding, not on MLX availability |
| 2 | 0.2.6 is −2.65 dB and log-mel L1 0.577 from PyTorch kokoro 0.9.4; 0.5.5 is −0.20 dB and 0.126; floor 0.058 | **confirmed** (recomputed, not regenerated) | author WAVs in `/tmp/ntts-r01/out/`, my own 128-band / 2048-point log-mel (`refcheck.py`) | Levels reproduce exactly (−2.65 / −0.20 dB). With a different mel front end, L1 is 0.428 (0.2.6, all 3 runs) vs 0.115 (0.5.5) vs 0.049 floor, i.e. 8.7× and 2.3× the floor (author: 10× and 2.2×). Removing the gain offset leaves 0.379, so the level bug explains only ~11% of the gap and the timbre difference is real. Waveform correlation with the reference goes from −0.007 to 0.54. The generation itself was not re-run |
| 3 | PR #859 merged 2026-08-05, released in v0.4.8; fixes −2.5 dB iSTFT attenuation, window mismatch, F0 upsample misalignment; MCD 7.29 → 4.09 dB, F0 RMSE 11.5 → 5.1 Hz | **confirmed** | `gh api repos/Blaizzy/mlx-audio/pulls/859` (merged_at 2026-08-05T23:13:15Z, body quoted); `compare/v0.4.7...v0.4.8` contains merge commit `be52123ac` | The PR fixes **kitten_tts** too, and its interpolate fix touches soprano. The runtime diff is small: 64 added lines across `dsp.py`, `interpolate.py`, `kokoro/istftnet.py`, `kitten_tts/istftnet.py` |
| 4a | 0.5.5 runs 25.1× real time on prose (RTF 0.0395–0.0404, n=3), 26× on the 2,534-char passage; Whisper WER 0.0% on prose on both stacks | **confirmed** (as recorded) | `/tmp/ntts-r01/results.jsonl` (`kokoro-prince-rep`: 25.3 / 25.1 / 24.8×, long 26.0×); `asr2.jsonl` (prose WER 0.0 on both stacks) | — |
| 4b | "vs 17.1× on 0.2.6", i.e. the runtime upgrade speeds Kokoro up | **refuted** | interleaved A/B, 5 rounds × 3 prose runs + 1 long, same model, same process design (`ab.log`) | Old stack 13.1–25.6×, new stack 12.9–23.9×, with no consistent winner (load average 17–25 from sibling sessions). The author's own long-passage rows already show parity (25.5× vs 26.0×). The 17.1× figure is contention. Strike "prose 17× → 25×" from rec 1's deciding evidence; the upgrade case rests on fidelity alone |
| 5a | Pocket TTS 3.2.0 (english_2026-04, CPU) read "2026" → "226", "$4.2 million" → "$42 million" | **confirmed** (ASR-mediated, one run) | `asr2.jsonl` `pocket-official-cpu` numeric hyp; `venv-cpu` holds `pocket_tts-3.2.0.dist-info`, installed 14:20 CDT, after the PyPI upload at 15:49 UTC | Evidence is a Whisper transcript of a single run, not a listening test. Direction is right, magnitude unproven |
| 5b | Kokoro read the numeric passage "with only a dropped '$' on '$5.8M'" | **refuted** | `asr2.jsonl` `kokoro-prince` and `kokoro-prince-oldstack` numeric hyps | Both runtimes also produced "Dr. **Alina** Martinez" for "Dr. Elena Martinez". The report body (§3.2) says so; the claim summary drops it |
| 6 | Helper exposes 6 of 54 voices incl. `am_adam` (F+) but not `af_heart` (A); `af_sarah` labelled "(UK)" | **confirmed** | `native-helper/Sources/NaturalTTSHelper/HTTPServer.swift:204-211` (`af_sarah` → "Sarah (UK)", `en-GB`); https://huggingface.co/hexgrad/Kokoro-82M/raw/main/VOICES.md (54 voice ids; `af_heart` A, `am_adam` F+) | — |
| 7 | OmniVoice code Apache-2.0, weights CC-BY-NC (Emilia) | **confirmed** | https://huggingface.co/k2-fsa/OmniVoice/raw/main/README.md line 783; `gh api repos/k2-fsa/OmniVoice` → Apache-2.0; HF `license` tag empty | The trap is real: `soniqo/speech-swift`'s README lists OmniVoice as "Apache-2.0" |
| 8 | Breeze TTS 2 weights, derivatives and self-hosted outputs non-commercial; 0.25× real time (RTF 4.02) on M1 Max 8-bit MLX | **confirmed** | https://huggingface.co/BreezeBlue/Breeze-TTS-2/raw/main/README.md (`license_name: breezeblue-research-and-non-commercial-license`; quoted sentence); `results.jsonl` `breeze2-8bit` prose RTF 4.0197 | The RTF is a single contended run |
| 9 | Pocket voices `cosette` (Expresso) and `jean` (EARS) CC BY-NC; `alba`, `azelma`, `eponine`, `fantine` CC BY 4.0; `javert`, `marius` CC0 | **confirmed**, set is stale | https://huggingface.co/kyutai/tts-voices/raw/main/README.md; `pocket_tts/utils/utils.py@v3.2.0` `_ORIGINS_OF_PREDEFINED_VOICES` | v3.2.0 ships **26** preset voices. Only `cosette` and `jean` are NC. 12 English voices are VCTK (CC BY 4.0), 4 are Voice-Zero (CC0), `estelle` is Kyutai's own recording (CC0), `giovanni`/`lola` are Common Voice clips (a CC0 dataset, though Kyutai documents no licence for them), and `juergen`/`rafael` have no licence documented in `tts-voices`. "Ship only the six permissive voices" undercounts: 20 voices are documented as permissive, 22 counting the Common Voice pair, and `juergen`/`rafael` need provenance first. The larger list appeared in the README after 2026-04-17 |
| 10 | Supertonic GitHub repo archived: "Development and support have ended" | **confirmed** | `gh api repos/supertone-oss-archive/supertonic` → `archived: true`; README line 1 | HF `Supertone/supertonic-3` licence `openrail` |
| 11 | mlx-audio-swift has Kokoro (added 2026-03-25, #124) with a Swift misaki G2P port; README model table omits it | **confirmed** | `gh api .../pulls/124` merged 2026-03-25; `Sources/MLXAudioTTS/Models/StyleTTS2/G2P/{MisakiTextProcessor,EnglishG2P}.swift`; Kokoro dir present at tag v0.1.3; root README has no "kokoro" | **But** #239 (per-phoneme durations, merged 2026-08-16) is **not in any release**: latest tag v0.1.3 is 2026-07-09 and `main` is 25 commits ahead. The package also requires **macOS 14 / iOS 17 and swift-tools 6.2** (`Package.swift`), against the helper's 5.9 / `.macOS(.v13)` |
| 12 | `prince-canuma/Kokoro-82M` and `mlx-community/Kokoro-82M-bf16` hold the byte-identical weight file (LFS oid `4e9ecdf03b8b…`, 327,115,152 bytes) | **confirmed** | POST `paths-info/main` on both repos: same oid `4e9ecdf03b8b6cf9…` and size | `hexgrad/Kokoro-82M` last modified 2025-04-10; hexgrad's only models are `Kokoro-82M`, `Kokoro-82M-v1.1-zh`, `styletts2`, `kLegacy`, so there is no v1.1-en or v2 |

Also re-verified with no discrepancy (all primary): mlx-audio 0.5.5 uploaded 2026-09-21, mlx / mlx-metal 0.32.2 on 2026-08-25, transformers 5.17.0, huggingface-hub 1.32.0, pocket-tts 3.2.0 on 2026-09-23, misaki and kokoro 0.9.4 capped at Python `<3.13` (PyPI). Candidate dates and licences come from the HF API: Qwen3-TTS 2026-01-21 Apache-2.0, Chatterbox-Turbo 2025-12-02 MIT, VoxCPM2 2026-04-03 Apache-2.0, Soprano-1.1 2026-01-14, Kitten 0.8 2026-02-19 (GitHub release), Dia2 "only supports up to 2 minutes", Fish S2 Pro `fish-audio-research-license`, Voxtral `cc-by-nc-4.0`, Higgs TTS 3 `boson-higgs-tts-3-research-and-non-commercial-license`, and `mlx-community/pocket-tts` last modified 2026-02-06. From GitHub: VibeVoice's README notes the TTS code was removed on 2025-09-05. From the old env: 0.2.6 uses `logger.info` where 0.5.5 has a bare `print` at `kokoro.py:285`. And 0.2.6 without `ESPEAK_DATA_PATH` really does abort on espeakng-loader's baked-in `/Users/runner/work/…/phontab` path, while 0.5.5 runs.

### Challenges to recommendations with conviction ≥ 80

| Rec | Author | Challenge: what would make it wrong for this project | Adjusted |
|---|---:|---|---:|
| 1. mlx-audio 0.2.6 → 0.5.5, mlx → 0.32.2 | 93% | **This is a platform decision, not only a library bump.** mlx-metal dropped its macOS 13 wheel at 0.29.4 (2025-11-11), and 0.32.2 ships `macosx_14_0`, `15_0` and `26_0` wheels only, with no sdist. Every mlx-audio release that carries #859 (0.4.8 onward) requires `mlx>=0.31.1`. `setup-python-env.sh` builds the env on the user's Mac, so on Ventura the pip install simply fails, yet `native-helper/README.md:98` promises "macOS 13+" and `Package.swift` declares `.macOS(.v13)`. Either raise the floor to macOS 14 explicitly (defensible: Ventura is out of Apple security support), or backport #859 as a local patch to 0.2.6 (64 runtime lines in 4 files). Also: the speed evidence is void (4b above); 0.5.5 is two days old; the dependency set jumps two majors (transformers 5.x, huggingface_hub 1.x) and adds `sounddevice` and `miniaudio`; and a fresh env is safer than upgrading in place, because the old env also carries `mlx_lm` 0.28.3 and `mlx_vlm` 0.3.5. Fidelity alone still justifies the upgrade | **85%** |
| 2. Keep Kokoro-82M as default | 90% | Holds. Two caveats: AA's Elo scores reference Kokoro, not this extension's MLX port, which only approaches it after rec 1; and the Magpie tie-break reason ("no MLX") is wrong (1b). Durability risk: `misaki` and `kokoro` have not shipped since 2025-04-05 and cap Python at `<3.13`, so the Python route is frozen at ≤ 3.12 (3.11 EOL Oct 2027). That argues for rec 8's Swift route over time, not for a different model | **88%** |
| 3. `af_heart` default, graded list, `lang_code` by prefix | 90% | Directionally right, but "expose the graded **54**-voice list" contradicts §6.2 step 4: `normalize_text()` NFKD-folds and ASCII-strips input, so the 26 non-English voices would speak mangled text. Expose the 28 `af_`/`am_`/`bf_`/`bm_` voices until `normalize_text()` changes. `lang_code="b"` builds a second `KokoroPipeline` (a second G2P instance), which costs memory. Users whose stored voice is dropped (`am_adam`, `af_sky`) need a migration path in the extension's storage | **85%** |
| 4. No second "higher-quality" engine now | 80% | Holds. The large-model timings were single runs under the same contention that distorted 4b, but even a 35–45% understatement leaves them 5–10× behind Kokoro. Nothing found that raises it | **80%** |
| 6. Reject non-commercial weights | 95% | Holds. Non-commercial licences bind the end user, and a free extension is used at work. AA independently flags all of these `openWeightsCommercial: false` | **95%** |
| 7. Reject Supertonic, VibeVoice, Kitten, Soprano, Dia2 | 85% | Holds: archive status, the vendor removal and the 2-minute cap are all confirmed at source. The Kitten nano "runaway" is a single run, but mini already loses on every axis | **85%** |

### Items the report missed

1. **The macOS 13 → 14 floor change** hidden in rec 1 (details in the table above). It belongs in the packaging and publishing axes, and the store listing's system requirements must say it.
2. **GPL-3 in Kokoro's G2P chain.** The model is Apache-2.0, but `misaki[en]` pulls `phonemizer-fork` (GPL-3.0-or-later, PyPI classifier), and `espeakng-loader` bundles `libespeak-ng.dylib` (espeak-ng is GPL-3.0). The helper today uses Homebrew espeak-ng, also GPL-3.0. That is harmless while each user builds their own env, but if publishing moves to a **prebuilt, redistributed** helper bundle, GPL source-offer obligations apply. The Swift misaki port (`EnglishG2P.swift`) may avoid this; check it before rec 8.
3. **A third Swift runtime: `soniqo/speech-swift`** (Apache-2.0, 1,190★, v0.0.27 on 2026-09-02, pushed 2026-09-22). It ships Kokoro on CoreML/Neural Engine (54 voices, 10 languages) plus Magpie, Supertonic and Chatterbox. Rec 8 should compare it against `mlx-audio-swift` and FluidAudio.
4. **Rec 8 prerequisites.** `mlx-audio-swift` needs swift-tools 6.2 and macOS 14, and the word-timing feature (#239) is unreleased, so it needs a `main`-branch pin.
5. **Pocket voice inventory is 26, not 8** (row 9). This changes rec 5's attribution text and makes the voice offer larger.
6. **The espeak explanation in §6.1 step 6 is wrong, though its conclusion holds.** `misaki/espeak.py` is byte-identical in both envs (`diff -q`), so misaki's `set_data_path` cannot be what separates 0.2.6 from 0.5.5. The difference lies in how each mlx-audio imports the G2P path. The practical advice (drop the Homebrew variable after an out-of-vocabulary test) stands; I reproduced both behaviours.
7. **Headroom after +2.5 dB.** Only `af_heart` prose was measured, and its peaks are −2.9 to −3.3 dBFS on 0.5.5 (my recomputation). With about 3 dB of headroom, check peaks across every voice you expose, or add a limiter in the offscreen player, before shipping the louder output.
