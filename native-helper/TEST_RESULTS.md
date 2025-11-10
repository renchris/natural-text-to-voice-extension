# Phase 1: Native Helper Validation Results

**Date**: 2025-11-09
**Test Environment**: macOS 15.6 (Darwin 24.6.0), Apple Silicon
**Model**: Kokoro-82M via MLX
**Framework**: Swift (SwiftNIO) + Python (MLX)

## Summary

Phase 1 validation completed with **mixed results**. Core functionality is working but performance is below target and reliability issues were discovered.

## Test Results

### ✅ Startup Performance

| Metric | Result | Target | Status |
|--------|--------|--------|--------|
| Cold start | 3.0s | <5s | ✅ PASS |
| Warm start | 3.0s | <5s | ✅ PASS |

**Details:**
- Helper starts successfully and initializes HTTP server
- Python MLX worker subprocess launches correctly
- Config file created at `~/Library/Application Support/NaturalTTS/config.json`
- Port assignment works (8249)

### ✅ Endpoint Functionality

#### GET /health
```json
{
  "status": "ok",
  "model": "kokoro-82m",
  "model_loaded": true,
  "uptime_seconds": 15.49,
  "requests_served": 1
}
```
**Status**: ✅ Working correctly

#### GET /voices
```json
{
  "voices": [
    {"id": "af_bella", "name": "Bella (US)", "language": "en-US"},
    {"id": "af_sarah", "name": "Sarah (UK)", "language": "en-GB"},
    {"id": "af_nicole", "name": "Nicole (US)", "language": "en-US"},
    {"id": "af_sky", "name": "Sky (US)", "language": "en-US"},
    {"id": "am_adam", "name": "Adam (US)", "language": "en-US"},
    {"id": "am_michael", "name": "Michael (US)", "language": "en-US"}
  ]
}
```
**Status**: ✅ Working correctly

#### POST /speak

**First Request (Cold Generation)**:
- Input: "Hello world" (2 words)
- Audio duration: 1.58s
- Generation time: 2.53s
- **RTF: 0.62x** ⚠️
- File size: 74KB
- Format: WAV, 16-bit mono, 24kHz
- **Status**: ⚠️  Works but below target

**Subsequent Requests**:
- **Status**: ❌ FAIL - Python worker crashes with corrupted data
- Error: `Invalid message length: 962272010`

### ⚠️  Performance Analysis

| Metric | Result | Target | Status |
|--------|--------|--------|--------|
| Real-Time Factor (RTF) | 0.62x | ≥2.5x | ❌ **FAIL** |
| Audio Quality | Valid WAV | Good | ✅ PASS |
| First Generation | Works | Works | ✅ PASS |
| Subsequent Generations | Crashes | Works | ❌ FAIL |

**RTF Analysis:**
- **Target**: ≥2.5x (generate audio 2.5x faster than playback)
- **Actual**: 0.62x (slower than real-time!)
- **Gap**: 4x slower than target
- **Impact**: Cannot support real-time use cases

## Issues Discovered

### 🔴 Critical Issues

1. **Performance Below Target** (Priority: HIGH)
   - RTF is 0.62x vs target 2.5x (4x gap)
   - Generation is actually slower than real-time playback
   - Blocks real-time use cases like reading assistance

2. **Python Worker Reliability** (Priority: HIGH)
   - Worker crashes after first generation
   - Corrupted Native Messaging protocol data
   - No automatic recovery/restart

3. **espeak-ng Dependency** (Priority: MEDIUM)
   - Requires `brew install espeak-ng`
   - Not bundled with application
   - Hardcoded path: `/opt/homebrew/opt/espeak-ng/share/espeak-ng-data`
   - Will fail on non-Homebrew systems (Intel Macs, different install locations)

### 🟡 Medium Issues

4. **Error Handling**
   - No graceful handling of Python worker crashes
   - Poor error messages for missing dependencies
   - No retry logic

5. **Threading Issues** (FIXED)
   - SwiftNIO precondition failure when handling requests
   - Fixed by using `context.eventLoop.execute` for channel operations

## Bugs Fixed During Testing

1. **Config.swift Python Path Detection**
   - Added development path detection for running from `.build/debug`

2. **tts_worker.py Model Loading**
   - Removed warmup test to reduce startup time from >60s to 3s
   - Model now lazy-loads on first request

3. **HTTPServer.swift Threading**
   - Fixed NIO channel operations to run on correct EventLoop

4. **Missing ESPEAK_DATA_PATH**
   - Added environment variable in PythonWorker.swift

## Go/No-Go Assessment for Phase 2

### ❌ **NO-GO RECOMMENDATION**

**Rationale:**
1. **Performance is 4x below target** - Cannot proceed to Chrome extension with 0.62x RTF
2. **Reliability issues** - Worker crashes make it unusable beyond first request
3. **Unmet requirements** - Phase 0 validation showed 2.51x RTF with direct MLX; native helper should match or exceed this

### Required Actions Before Phase 2

**Must Fix (Blocking):**
1. **Investigate RTF performance**:
   - Profile Python worker to identify bottlenecks
   - Compare with Phase 0 baseline (2.51x RTF achieved)
   - Possible causes:
     - Native Messaging protocol overhead
     - Base64 encoding overhead
     - File I/O in Python worker
     - Inefficient message passing

2. **Fix Python worker reliability**:
   - Debug corrupted message issue
   - Add proper error handling
   - Implement worker restart on crash
   - Add message validation

3. **Bundle espeak-ng dependency**:
   - Include espeak-ng-data in app bundle
   - Support both Intel and ARM architectures
   - Remove hardcoded Homebrew path

**Should Fix (Important):**
4. Improve error messages and logging
5. Add retry logic for transient failures
6. Add memory usage monitoring

## Next Steps

1. **Debug performance regression**
   - Why is RTF 0.62x vs Phase 0's 2.51x?
   - Profile the full request pipeline

2. **Debug worker crashes**
   - Fix Native Messaging protocol corruption
   - Add message validation and recovery

3. **Re-run Phase 1 validation** once fixes are in place

4. **Only proceed to Phase 2** if:
   - RTF ≥ 2.5x
   - No crashes over 100 requests
   - All dependencies bundled

## Test Commands Used

```bash
# Health check
curl http://127.0.0.1:8249/health | jq

# Voices list
curl http://127.0.0.1:8249/voices | jq

# Speech generation
echo '{"text": "Hello world", "voice": "af_bella", "speed": 1.0}' > /tmp/request.json
curl -X POST http://127.0.0.1:8249/speak \
  -H "Content-Type: application/json" \
  --data-binary @/tmp/request.json \
  -o /tmp/audio.wav
```

## Environment Setup

```bash
# Install dependencies
brew install espeak-ng

# Setup Python environment
cd native-helper
./Scripts/setup-python-env.sh

# Build and run
swift build
.build/debug/natural-tts-helper
```

## Files Modified

1. `Config.swift` - Added development Python path detection
2. `tts_worker.py` - Simplified model loading (removed warmup)
3. `HTTPServer.swift` - Fixed NIO threading issue
4. `PythonWorker.swift` - Added ESPEAK_DATA_PATH environment variable

---

**Conclusion**: Native helper architecture is sound, but performance and reliability issues must be resolved before proceeding to Chrome extension development.
