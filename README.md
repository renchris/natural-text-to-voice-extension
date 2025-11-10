# Natural Text-to-Voice Extension

**Local, privacy-first text-to-speech Chrome extension using WebGPU and Metal acceleration**

---

## Project Overview

A Chrome Manifest V3 extension providing natural text-to-speech with two offline engines:
- **Kokoro** (WebGPU): In-browser, zero-install, fast startup
- **Parler-TTS Mini** (Native helper): Higher realism, Metal-accelerated on Apple Silicon

**Privacy guarantee**: All processing happens locally. No data leaves your machine.

---

## Phase 0: Pipeline Validation (COMPLETED)

### Objective
Validate the feasibility of TTS.cpp + Parler Mini v1.1 as the native Metal-accelerated backend for high-quality local TTS.

### What Was Tested

| Component | Version | Status |
|-----------|---------|--------|
| TTS.cpp | Oct 2025 (c04c77a) | ✅ Built with Metal |
| Parler Mini | v1.1 (3.5GB) | ✅ Downloaded |
| Python ML Stack | PyTorch 2.6, transformers 4.46 | ✅ Configured |
| GGUF Conversion | fp16 → Q5_0 pipeline | ❌ **FAILED** |

### Key Findings

#### ✅ Successes
1. **TTS.cpp builds correctly** on Apple Silicon with Metal acceleration
   - Compiled binaries: `tts-cli`, `quantize`, `tts-server`
   - Metal framework detected and enabled
   - ARM64 optimizations active

2. **Parler Mini v1.1 acquired**
   - Model: 3.5GB safetensors format
   - Tokenizer: v1.1 with improved prompt parsing
   - All dependencies resolved

3. **Development environment validated**
   - Python 3.11 + 100+ ML packages
   - CMake 3.23, Xcode Command Line Tools
   - Build system functional on macOS

#### ❌ Blocker: GGUF Conversion Incompatibility

**Critical Issue**: TTS.cpp's GGUF export script is **incompatible with Parler Mini v1.1**

```
ValueError: Part model.0.parametrizations.weight.original0 is not in DAC_ENCODER_PARTS.
```

**Root Cause**:
- Parler v1.1 uses PyTorch's newer `weight_norm` parametrization
- This creates `parametrizations.weight.original0` tensors in the DAC audio codec
- TTS.cpp's `dac_gguf_encoder.py` expects the older flat weight structure from Parler v1.0

**Impact**: Cannot proceed with quantization (Q5_0) or Metal inference testing.

---

## Validation Conclusions

### TTS.cpp Viability Assessment

| Criterion | Status | Notes |
|-----------|--------|-------|
| **Build System** | ✅ Production-ready | Clean CMake, Metal support works |
| **Model Support** | ⚠️ **Experimental** | Parler v1.1 unsupported; v1.0 may work |
| **Performance** | ⏸️ **Untested** | Blocked by conversion failure |
| **Maturity** | ❌ **Proof-of-Concept** | Active development, breaking changes expected |

### Recommendations

**DO NOT** proceed with TTS.cpp for MVP without one of the following:

#### Option A: Pre-Converted GGUF Models
- Test `koboldcpp/tts` or `ecyht2/parler-tts-mini-v1-GGUF`
- Likely Parler v1.0 (older tokenizer, degraded prompt accuracy)
- **Risk**: Unknown quality, may have other compatibility issues

#### Option B: Native Python Parler-TTS
- Use HuggingFace `parler-tts` library directly in helper
- **Pros**: Guaranteed compatibility, official implementation
- **Cons**: No quantization (~3.5GB RAM), larger helper binary

#### Option C: Wait for TTS.cpp Support
- Monitor [mmwillet/TTS.cpp](https://github.com/mmwillet/TTS.cpp) for Parler v1.1 patches
- **Timeline**: Unknown (repo is proof-of-concept status)

#### Option D: Pivot to Kokoro-Only MVP
- Ship WebGPU-only for v0.1
- Add Parler later once tooling matures
- **Fastest path to production**

---

## Repository Structure

```
phase0-validation/
├── README.md                  # This file
├── CHANGELOG.md               # Version history
├── TTS.cpp/                   # [SUBMODULE] mmwillet/TTS.cpp
│   ├── build/                 # [IGNORED] Compiled binaries
│   ├── src/                   # C++ source
│   ├── py-gguf/               # GGUF conversion scripts
│   └── CMakeLists.txt
├── models/                    # [IGNORED] Downloaded model weights
│   └── parler-mini-v1.1/      # 3.5GB (excluded from git)
└── venv/                      # [IGNORED] Python environment
```

---

## Setup Instructions

### Prerequisites
- macOS with Apple Silicon (M1/M2/M3)
- Xcode Command Line Tools: `xcode-select --install`
- Python 3.9-3.11
- CMake ≥ 3.14

### Clone with Submodules
```bash
git clone --recurse-submodules https://github.com/YOUR_USERNAME/natural-text-to-voice-extension.git
cd natural-text-to-voice-extension/phase0-validation
```

### Build TTS.cpp
```bash
cd TTS.cpp
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --config Release -j $(sysctl -n hw.ncpu)

# Verify Metal acceleration
./build/bin/tts-cli --help | grep -i metal
```

### Download Parler Mini (Optional)
```bash
cd ..
python3 -m venv venv
source venv/bin/activate
pip install huggingface_hub

python -c "from huggingface_hub import snapshot_download; \
  snapshot_download('parler-tts/parler-tts-mini-v1.1', local_dir='models/parler-mini-v1.1')"
```

**Note**: This downloads 3.5GB. You may skip this if testing pre-converted GGUF models.

---

## Performance Targets (Untested)

Based on TTS.cpp documentation and research, **expected** performance on Apple Silicon:

| Metric | Target | Status |
|--------|--------|--------|
| Helper start | 50-200ms | ⏸️ Not measured |
| Model warm (Q5_0) | 1-3.5s | ⏸️ Not measured |
| First audio (warm) | 100-300ms | ⏸️ Not measured |
| Real-time factor | ~1.0x | ⏸️ Not measured |
| Memory (warm) | ~1-2GB | ⏸️ Not measured |

**These targets remain unvalidated** due to GGUF conversion failure.

---

## Next Steps

1. **Decision Point**: Choose Option A, B, C, or D (see Recommendations)
2. **If Option A/B**: Implement helper prototype (Rust or Swift)
3. **If Option C**: Monitor TTS.cpp; pivot if no progress in 2-4 weeks
4. **If Option D**: Begin Kokoro WebGPU integration for MVP

---

## License

This project combines multiple components:

- **This repository**: MIT License (see LICENSE)
- **TTS.cpp**: MIT License - [mmwillet/TTS.cpp](https://github.com/mmwillet/TTS.cpp)
- **Parler-TTS**: Apache 2.0 - [huggingface/parler-tts](https://github.com/huggingface/parler-tts)

When distributing:
- Include TTS.cpp's LICENSE in helper binaries
- Attribute Parler-TTS per Apache 2.0 if using their models
- Do not redistribute model weights without checking HuggingFace terms

---

## Acknowledgments

- [TTS.cpp](https://github.com/mmwillet/TTS.cpp) by mmwillet - C++ TTS inference
- [Parler-TTS](https://github.com/huggingface/parler-tts) by HuggingFace - Controllable TTS model
- [GGML](https://github.com/ggerganov/ggml) - Machine learning tensor library

---

**Status**: ⚠️ Phase 0 incomplete - GGUF conversion blocker
**Last Updated**: 2025-11-09
**Hardware**: Apple Silicon (M1/M2/M3)
