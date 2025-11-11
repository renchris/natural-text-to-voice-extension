# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.0-beta.2] - 2025-11-10

### Added
- **Phase 2.3: Chrome Extension Popup UI**
  - Complete popup interface with voice selection dropdown
  - Speed control slider (0.5x - 2.0x) with live visual feedback
  - Helper status indicator with animated states (checking/connected/disconnected)
  - Message system for success/error/warning notifications
  - Chrome storage integration for preference persistence
  - Comprehensive error handling with custom error types
  - ARIA labels and keyboard navigation support
  - Modern CSS design with animations and transitions
  - Temporary text input via browser prompt (Phase 2.4 will add content script)
- **Placeholder Files for Future Phases**
  - Background service worker placeholder (Phase 2.5)
  - Content script placeholders (Phase 2.4)
  - Options page placeholders (Phase 2.6)

### Technical Details
- **Popup Implementation**: 1015+ lines of production code (HTML/CSS/TS)
- **State Management**: PopupState interface with voice, speed, helper status tracking
- **Audio Playback**: Blob URL-based audio player with proper cleanup
- **Type Safety**: Full TypeScript integration with API client
- **Bundle Size**: ~21KB total (9.6KB JS minified, 7.8KB CSS, 3.7KB HTML)
- **Performance**: Fixed 340px width, optimized for fast popup rendering

### Changed
- Updated `api-client.ts` headers type to `Record<string, string>` for better type safety
- Updated `vite.config.ts` to include all extension entry points

### Notes
- This is a **beta release** - Phase 2 is not yet complete
- Popup UI is fully functional and ready for testing
- Text selection from webpages will be added in Phase 2.4 (Content Script)
- Upcoming: Phase 2.4 (Content Script), Phase 2.5 (Background Worker), Phase 2.6 (Options Page)

## [1.1.0-beta.1] - 2025-11-10

### Added
- **Phase 2.2: Chrome Extension Core API Client**
  - HTTP client for Native TTS Helper API with `/health`, `/voices`, `/speak` endpoints
  - Auto-discovery system for helper connection (tries ports 8249-8251)
  - Configuration management with chrome.storage.local caching
  - Retry logic with exponential backoff (max 2 retries, 500ms base delay)
  - Custom error types: `HelperNotFoundError`, `ConfigNotFoundError`, `NetworkTimeoutError`, `InvalidResponseError`
  - Configurable timeouts: 10s for health/voices, 30s for speak
  - Singleton pattern for efficient client reuse
- **Testing Infrastructure**
  - Bun Test framework with happy-dom (13x faster than Jest)
  - 16 comprehensive unit tests for API client (100% pass rate)
  - 6 integration tests against live Native TTS Helper
  - Mock chrome.storage and fetch APIs for isolated testing
- **Project Structure**
  - Hybrid Bun + Vite architecture (Vite for dev HMR, Bun for tests & prod builds)
  - TypeScript 5.x with strict type checking
  - Manifest V3 configuration with required permissions
  - Chrome extension icons (16x16, 48x48, 128x128)
  - Production build pipeline with Bun bundler

### Documentation
- Comprehensive Phase 2 implementation plan (all 5 subphases)
- Bun v1.3.0 test validation results
- GitHub issue references for Bun Test research

### Technical Details
- **API Client**: Lazy config loading, parameter validation, proper error propagation
- **Configuration**: Verifies cached config before use, graceful fallback to defaults
- **Type Safety**: Full TypeScript coverage with strict interfaces
- **Test Coverage**: 22 unit test assertions, 19 integration test assertions

### Notes
- This is a **beta release** - Phase 2 is not yet complete
- Upcoming: Phase 2.3 (Popup UI), Phase 2.4 (Content Script), Phase 2.5 (Background Worker)
- Full v1.1.0 release will follow after all Phase 2 components complete

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

[Unreleased]: https://github.com/renchris/natural-text-to-voice-extension/compare/v1.1.0-beta.2...HEAD
[1.1.0-beta.2]: https://github.com/renchris/natural-text-to-voice-extension/releases/tag/v1.1.0-beta.2
[1.1.0-beta.1]: https://github.com/renchris/natural-text-to-voice-extension/releases/tag/v1.1.0-beta.1
[0.0.0]: https://github.com/renchris/natural-text-to-voice-extension/releases/tag/v0.0.0
