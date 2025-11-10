# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.0.0] - 2025-11-09

### Added
- Initial Phase 0 validation workspace for TTS.cpp + Parler Mini evaluation
- TTS.cpp integration as git submodule (mmwillet/TTS.cpp @ c04c77a)
- Build configuration for Apple Silicon with Metal acceleration
- Python environment setup with ML dependencies (PyTorch 2.6, transformers 4.46)
- Parler TTS Mini v1.1 model acquisition pipeline (3.5GB safetensors)
- CMake build system for compiling TTS binaries (tts-cli, quantize, tts-server)
- Comprehensive README documentation of validation results
- .gitignore configuration to exclude models, venv, and build artifacts

### Discovered
- **CRITICAL**: TTS.cpp GGUF conversion incompatibility with Parler Mini v1.1
  - Root cause: DAC audio codec uses newer PyTorch weight_norm parametrization
  - Error: `ValueError: Part model.0.parametrizations.weight.original0 is not in DAC_ENCODER_PARTS`
  - Conversion pipeline expects Parler v1.0 flat weight structure
- TTS.cpp is proof-of-concept quality (not production-ready)
- Need for alternative approach: pre-converted GGUF models, native Python Parler-TTS, or Kokoro-only MVP

### Validated
- ✅ TTS.cpp builds successfully on Apple Silicon (ARM64 + Metal)
- ✅ Metal framework detection and acceleration enabled
- ✅ Python ML stack installable and functional (100+ packages)
- ✅ Parler Mini v1.1 model downloadable from HuggingFace
- ✅ Development environment setup reproducible on macOS

### Blocked
- ⏸️ GGUF quantization (fp16 → Q5_0) - conversion fails before quantization
- ⏸️ Metal inference performance testing - no GGUF model to test
- ⏸️ Audio quality assessment - cannot generate samples
- ⏸️ Real-time factor benchmarking - blocked by conversion failure

### Recommendations
Four paths forward documented in README:
- Option A: Test pre-converted GGUF models (unknown quality)
- Option B: Use native Python Parler-TTS (larger memory footprint)
- Option C: Wait for TTS.cpp Parler v1.1 support (timeline unknown)
- Option D: Pivot to Kokoro-only MVP (fastest to production)

---

[Unreleased]: https://github.com/YOUR_USERNAME/natural-text-to-voice-extension/compare/v0.0.0...HEAD
[0.0.0]: https://github.com/YOUR_USERNAME/natural-text-to-voice-extension/releases/tag/v0.0.0
