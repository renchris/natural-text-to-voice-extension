# Project history

How Natural TTS got to its current shape: a Chrome extension that sends the selected text to a small helper on
the Mac, which runs Kokoro-82M on the Apple GPU with MLX. The current design is in the [root README](../README.md);
every release is in the [CHANGELOG](../CHANGELOG.md). This page keeps the story and the numbers of the early
phases, condensed from the root README of 2025-11-10 and the helper's test reports of 2025-11-09/10.

| Phase | When | What | Outcome |
|---|---|---|---|
| 0 | 2025-11-09 | Validate TTS.cpp + Parler-TTS Mini v1.1 as a Metal-accelerated backend | **Blocked** on model conversion; pivoted to Kokoro on MLX |
| 1 | 2025-11-09 to 11-10 | Native helper: Swift HTTP server + Python MLX worker running Kokoro-82M | Working helper (tag `v1.0.0`) |
| 2 | 2025-11-10 to 11-11 | The Chrome extension, beta 1 to 1.4.0 | Popup, context menu, offscreen playback, options page (tag `v1.4.0`) |
| — | 2026-05-25 | 30 unreleased commits after the `v1.4.0` tag | Pinned port, CORS/CSRF guard, warming state, UI redesign |
| 1.5 | 2026-09 | The upgrade program | Locked MLX stack, permission reduction, 28 voices, system-voice fallback, Homebrew. See the CHANGELOG and `docs/research/2026-09-upgrade/` |

A WebGPU, in-browser fallback was listed as "Phase 3" in 2025. It was never built. In 2026-09 the extension got
a system-voice fallback (`chrome.tts`) instead. In-browser WebGPU Kokoro was measured at 6-8.5× real time on an
M1 Max, with a 326 MB download, and kept as a possible later tier
(`docs/research/2026-09-upgrade/R03-in-browser-webgpu-tts.md`).

---

## Phase 0: TTS.cpp + Parler Mini (2025-11-09)

**Objective.** Check whether [TTS.cpp](https://github.com/mmwillet/TTS.cpp) with Parler-TTS Mini v1.1 could be the
native, Metal-accelerated backend.

| Component | Version | Status |
|---|---|---|
| TTS.cpp | Oct 2025 (`c04c77a`) | ✅ Built with Metal (`tts-cli`, `quantize`, `tts-server`) |
| Parler Mini | v1.1 (3.5 GB safetensors) | ✅ Downloaded |
| Python ML stack | PyTorch 2.6, transformers 4.46, Python 3.11 | ✅ Configured |
| GGUF conversion | fp16 → Q5_0 | ❌ **Failed** |

**The blocker.** TTS.cpp's GGUF export rejected the Parler v1.1 audio codec:

```
ValueError: Part model.0.parametrizations.weight.original0 is not in DAC_ENCODER_PARTS.
```

Parler v1.1 uses PyTorch's newer `weight_norm` parametrization, which stores the DAC codec's weights as
`parametrizations.weight.original0` tensors. TTS.cpp's `dac_gguf_encoder.py` expected the older flat layout of
Parler v1.0. Without the conversion there was no Q5_0 model, so no Metal inference could be tested; the
performance targets written for it (50-200 ms start, ~1.0× real time) were never measured.

**Options considered:** (A) pre-converted GGUF models, probably Parler v1.0; (B) the Python `parler-tts` library
in the helper, ~3.5 GB of RAM unquantised; (C) wait for TTS.cpp to support v1.1; (D) ship with Kokoro only.

**Decision.** Kokoro-82M on Apple's MLX, through mlx-audio, in a Python worker behind a native helper. The
`phase0-validation/` directory was removed in `87ac86b`, and the TTS.cpp submodule entry in `8afc817`; the
leftover gitlink was removed in 1.5.0.

---

## Phase 1: the native helper (2025-11-09 to 11-10)

**Objective.** A native macOS helper reaching at least 2.5× real time.

**Design.** A Swift HTTP server (SwiftNIO) on 127.0.0.1, and a Python worker subprocess running Kokoro-82M with
MLX, speaking length-prefixed JSON over stdin/stdout. (The 2025 docs called that pipe "Native Messaging"; it is
not Chrome's Native Messaging, and the extension has always talked to the helper over HTTP.)

**Three benchmark runs.** The reports are kept in `native-helper/` as historical records.

| Report | Date | Change | Warm real-time factor | Result |
|---|---|---|---|---|
| [TEST_RESULTS.md](../native-helper/TEST_RESULTS.md) | 2025-11-09 | First integration | 0.62× (first request); the worker crashed on the 2nd request | NO-GO |
| [TEST_RESULTS_PHASE_AB.md](../native-helper/TEST_RESULTS_PHASE_AB.md) | 2025-11-09 | MLX's stdout redirected away from the JSON pipe; protocol validation | ~1.0× | Crash fixed, still slow |
| [TEST_RESULTS_OPTIMIZED.md](../native-helper/TEST_RESULTS_OPTIMIZED.md) | 2025-11-10 | Model cached across requests; WAV built in memory | 8.3× short; "25×" long (see erratum) | GO |

**Erratum: the "25×" was never measured.** `native-helper/Scripts/test-performance-long.sh` hard-coded the audio
duration as 21.7 s and divided it by the request time. Its test text was 27 words, not the "50 words" the
reports say, and the reports' own output size (321 KB of 24 kHz, 16-bit mono WAV) is about 6.85 s of audio. So
the long-text figure was about **8×**, the same as the short one, and the finding that speed "scales with text
length" rested on the wrong duration. The optimized report's code also generated only the first sentence of a
multi-sentence text, a bug fixed in 1.3.0. (Source: `docs/research/2026-09-upgrade/C3-docs-inventory.md` §5.)

For today's numbers, measured from the helper's own `X-Audio-Duration` and wall time, see
[W2-integration-measurements.md](research/2026-09-upgrade/W2-integration-measurements.md): about 26.5× real time
at every text length on an M1 Max, with helper 1.5.0.

---

## Phase 2: the Chrome extension (2025-11-10 to 11-11)

| Version | Date | What shipped |
|---|---|---|
| 1.1.0-beta.1 | 2025-11-10 | The API client (`/health`, `/voices`, `/speak`), port discovery, retries, Bun tests, the MV3 manifest |
| 1.1.0-beta.2 | 2025-11-10 | The popup: voice dropdown, 0.5-2.0× slider, status indicator, saved preferences |
| 1.2.0 | 2025-11-10 | The offscreen document for playback after the popup closes; a retry button (GitHub release only, no CHANGELOG entry) |
| 1.3.0 | 2025-11-10 | The options page; the multi-sentence fix; Unicode normalisation; PDF ligature cleanup |
| 1.4.0 | 2025-11-11 | Documentation (README, install guide, privacy policy, accessibility audit, test checklist). The tag's manifest still said 1.3.0 |

The build tooling was evaluated first: Bun 1.3.0 passed its test-runner checks, and the findings were added as
comments on two Bun issues (oven-sh/bun#16968 and #6338), both since closed.

**2026-05-25.** Thirty commits landed after the `v1.4.0` tag with no release: the helper's port pinned to 8249
with a fallback range, CORS limited to extension origins, a visible "warming" state, eager model loading, and a
redesigned popup (status pill, grouped voices, speed stepper, log-scale slider). They are listed in the
CHANGELOG under 1.5.0, "Previously unlogged".

---

## Where the rest lives

- **Why the 2026 stack looks the way it does:** `docs/research/2026-09-upgrade/UPGRADE_RESEARCH.md`
- **The 2025 extension plan:** [chrome-extension/IMPLEMENTATION_PLAN.md](../chrome-extension/IMPLEMENTATION_PLAN.md)
- **Every release:** [CHANGELOG.md](../CHANGELOG.md)
