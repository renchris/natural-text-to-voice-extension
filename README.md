# Natural Text-to-Voice Extension

**Local, privacy-first text-to-speech Chrome extension using WebGPU and Metal acceleration**

[![Status](https://img.shields.io/badge/Phase%201-Complete%20%E2%9C%85-success)]()
[![Performance](https://img.shields.io/badge/RTF-8.3x%20(short)%20%7C%2025x%20(long)-brightgreen)](native-helper/TEST_RESULTS_OPTIMIZED.md)
[![Phase](https://img.shields.io/badge/Next-Phase%202%20(Chrome%20Extension)-blue)]()

---

## Project Overview

A Chrome Manifest V3 extension providing natural text-to-speech with **production-ready native Metal acceleration** on Apple Silicon.

**Current Implementation**:
- **Kokoro-82M** (Native helper): MLX Metal-accelerated, 8.3x-25x real-time factor
  - Status: ✅ **Production Ready**
  - Performance: Far exceeds 2.5x target
  - Reliability: 100% (20/20 requests, zero crashes)

**Privacy guarantee**: All processing happens locally. No data leaves your machine.

---

## Install

Natural TTS has two parts: the Chrome extension, and a small helper app that runs the Kokoro voices on
your Mac. Without the helper, the extension reads with your Mac's built-in system voices.

**Requirements:** a Mac with Apple silicon, macOS 14 (Sonoma) or later.

### The helper, with Homebrew (recommended)

```bash
brew install renchris/tap/natural-tts
brew services start natural-tts
```

The formula builds the helper from source (it needs Xcode 16.2+ or its Command Line Tools) and downloads
the Kokoro model once, at install time; after that the helper runs offline. `brew services` starts it
now and at every login. Details: [packaging/homebrew/README.md](packaging/homebrew/README.md).

### The helper, from source

```bash
brew install uv espeak-ng
git clone https://github.com/renchris/natural-text-to-voice-extension.git
cd natural-text-to-voice-extension
native-helper/Scripts/quickstart.sh
```

`quickstart.sh` builds the locked Python 3.12 environment and the release binary, then starts the helper
in a tmux session named `natural-tts-helper` (stop it with `tmux kill-session -t natural-tts-helper`).
Step by step: [native-helper/QUICKSTART.md](native-helper/QUICKSTART.md).

### Updating a helper installed from source

Every helper older than 1.5 was installed from source. In your checkout, run:

```bash
git pull && native-helper/Scripts/quickstart.sh
```

It rebuilds the helper, moves a pre-1.5 Python environment aside once, and restarts the helper in its
tmux session. If you started the old helper some other way, stop it first so the new one can take its
port. To switch to Homebrew instead, stop the source helper before `brew services start natural-tts`:
while the old helper still answers on port 8249, the extension keeps using it.

### The extension

Install **Natural TTS: Private Kokoro Voices for Mac** from the Chrome Web Store, or build it yourself:
`cd chrome-extension && bun install && bun run build`, then open `chrome://extensions`, turn on
Developer mode, choose **Load unpacked** and select `chrome-extension/dist`. The extension finds the
helper on 127.0.0.1, ports 8249-8260.

---

## Project Status

| Phase | Status | Description | Performance |
|-------|--------|-------------|-------------|
| **Phase 0** | ✅ Complete | TTS.cpp validation (failed, see below) | N/A |
| **Phase 1** | ✅ Complete | Native helper with MLX Kokoro-82M | **8.3x-25x RTF** |
| **Phase 2** | 🔄 In Progress | Chrome extension development | TBD |
| **Phase 3** | ⏸️ Planned | WebGPU in-browser fallback | TBD |

---

## Phase 1: Native Helper (COMPLETE ✅)

### Objective
Build a production-ready native macOS helper with Metal-accelerated TTS achieving ≥2.5x real-time factor.

### Implementation

**Architecture**:
- **Swift HTTP Server** (SwiftNIO) on localhost:random-port
- **Python MLX Worker** subprocess with Kokoro-82M
- **Communication**: Length-prefixed JSON (Native Messaging protocol)

**Optimizations Applied**:
- Phase 1: Global model caching (eliminates 1-2s reload overhead)
- Phase 2: In-memory BytesIO WAV generation (eliminates file I/O)

### Results

| Metric | Target | Achieved | Status |
|--------|--------|----------|--------|
| **RTF (short text)** | ≥2.5x | **8.3x** | ✅ **3.3x better** |
| **RTF (long text)** | ≥2.5x | **25x** | ✅ **10x better** |
| **Reliability** | 100% | 100% (20/20) | ✅ **PASS** |
| **Audio quality** | Valid WAV | Valid WAV, 24kHz | ✅ **PASS** |

**Status**: ✅ **Production Ready** — Ready for Phase 2 Chrome extension development

**See**: [native-helper/README.md](native-helper/README.md) for full documentation

---

## Phase 0: Pipeline Validation (COMPLETED ⚠️)

### Objective
Validate the feasibility of TTS.cpp + Parler Mini v1.1 as the native Metal-accelerated backend for high-quality local TTS.

### Outcome
**BLOCKER**: TTS.cpp GGUF conversion incompatible with Parler v1.1 — **pivoted to MLX Kokoro**

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
natural-text-to-voice-extension/
├── README.md                           # This file (project overview)
├── .gitignore                          # Excludes build artifacts, models
│
├── native-helper/                      # Phase 1: Production-ready helper ✅
│   ├── README.md                       # Full documentation (878 lines)
│   ├── QUICKSTART.md                   # 5-minute setup guide
│   ├── TESTING_GUIDE.md                # Comprehensive test workflows
│   ├── TEST_RESULTS_OPTIMIZED.md       # Phase 1 & 2 validation results
│   ├── Package.swift                   # Swift Package Manager config
│   ├── Sources/
│   │   └── NaturalTTSHelper/
│   │       ├── main.swift              # Entry point
│   │       ├── HTTPServer.swift        # SwiftNIO HTTP server
│   │       ├── PythonWorker.swift      # Subprocess manager
│   │       ├── Config.swift            # Configuration
│   │       ├── Models.swift            # Data models
│   │       └── Resources/
│   │           ├── tts_worker.py       # Python MLX worker (optimized)
│   │           └── python-env/         # [IGNORED] Python venv
│   ├── Scripts/
│   │   └── setup-python-env.sh         # Python setup script
│   └── Tests/
│
└── chrome-extension/                   # Phase 2: Coming soon
    └── (TBD)
```

**Note**: Phase 0 validation directory (`phase0-validation/`) has been removed. The TTS.cpp + Parler approach was abandoned due to GGUF conversion incompatibility. The project successfully pivoted to MLX Kokoro-82M (Phase 1 complete).

---

## Phase 0 Setup (historical)

> **Do not follow this section.** It set up the abandoned TTS.cpp + Parler pipeline, which is no longer
> in the repository. To install Natural TTS, see [Install](#install).

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

---

## Phase 2: Chrome Extension (IN PROGRESS 🔄)

### Objective
Build a Chrome Manifest V3 extension that integrates with the production-ready native helper.

### Planned Features

**Core Functionality**:
- [ ] Native Messaging client for IPC with helper
- [ ] Text selection context menu ("Read aloud")
- [ ] Popup UI for voice selection and settings
- [ ] Audio playback controls (play, pause, stop)
- [ ] Keyboard shortcuts for quick access

**Extension Architecture**:
- **Background Service Worker**: Native Messaging communication
- **Content Scripts**: Text selection and injection
- **Popup**: Voice settings and controls
- **Options Page**: Configuration (port, voice, speed)

**Testing**:
- [ ] Extension loads and connects to helper
- [ ] Text selection triggers TTS
- [ ] Voice selection works
- [ ] Audio plays correctly
- [ ] Native Messaging handshake succeeds

**Timeline**: TBD (now that Phase 1 is complete)

---

## Getting Started

### For Local Usage (Native Helper Only)

To install or update the helper, see [Install](#install). For a 5-minute setup guide, see
[native-helper/QUICKSTART.md](native-helper/QUICKSTART.md).

**Quick start**:
```bash
# 1. Install espeak-ng
brew install espeak-ng

# 2. Setup Python environment
cd native-helper
./Scripts/setup-python-env.sh

# 3. Build and run
swift build -c release
.build/release/natural-tts-helper
```

**Performance**: 8.3x RTF (short text), 25x RTF (long text)

### For Chrome Extension Development

Coming soon (Phase 2)

---

## Documentation

| Document | Description |
|----------|-------------|
| [native-helper/README.md](native-helper/README.md) | Full native helper documentation |
| [native-helper/QUICKSTART.md](native-helper/QUICKSTART.md) | 5-minute setup guide |
| [native-helper/TESTING_GUIDE.md](native-helper/TESTING_GUIDE.md) | Comprehensive testing workflows |
| [native-helper/TEST_RESULTS_OPTIMIZED.md](native-helper/TEST_RESULTS_OPTIMIZED.md) | Phase 1 & 2 performance validation |

---

## Next Steps

1. ✅ **Phase 1 Complete**: Native helper production-ready (8.3x-25x RTF)
2. 🔄 **Phase 2 Begin**: Chrome extension development
   - Implement Native Messaging client
   - Create popup UI for voice selection
   - Add content scripts for text selection
   - Integrate with helper HTTP API
3. ⏸️ **Phase 3 Future**: WebGPU in-browser fallback (optional)

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

**Project Status**:
- ✅ **Phase 1 Complete**: Native helper production-ready (8.3x-25x RTF)
- 🔄 **Phase 2 In Progress**: Chrome extension development
- 🎯 **Current Version**: v0.2.0

**Last Updated**: 2025-11-10
**Hardware**: Apple Silicon (M1/M2/M3/M4)
**Performance**: 8.3x RTF (short text) | 25x RTF (long text)
