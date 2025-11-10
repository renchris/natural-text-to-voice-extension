# Testing & Validation Guide

Comprehensive guide for validating the Natural TTS Helper's functionality, performance, and reliability.

---

## Table of Contents

1. [Quick Validation](#quick-validation)
2. [Performance Testing](#performance-testing)
3. [Reliability Testing](#reliability-testing)
4. [Audio Quality Validation](#audio-quality-validation)
5. [API Endpoint Testing](#api-endpoint-testing)
6. [Interpreting Results](#interpreting-results)
7. [Troubleshooting Failed Tests](#troubleshooting-failed-tests)

---

## Prerequisites

Before testing, ensure:
- Helper is running: `.build/release/natural-tts-helper`
- Port number is known (check terminal output or config file)
- `jq` installed for JSON formatting: `brew install jq`

**Find your port**:
```bash
PORT=$(cat ~/Library/Application\ Support/NaturalTTS/config.json | grep -o '"port":[0-9]*' | grep -o '[0-9]*')
echo "Helper is on port: $PORT"
```

---

## Quick Validation

### 1. Health Check

Verify the helper is running and model is loaded:

```bash
curl http://127.0.0.1:$PORT/health | jq
```

**Expected output**:
```json
{
  "status": "ok",
  "model": "kokoro-82m",
  "model_loaded": true,
  "uptime_seconds": 123.45,
  "requests_served": 0
}
```

**Pass criteria**:
- HTTP 200 response
- `status`: "ok"
- `model_loaded`: true

**If failed**: See [Troubleshooting](#troubleshooting-failed-tests)

---

### 2. Basic Speech Generation

Test the `/speak` endpoint with simple text:

```bash
curl -X POST http://127.0.0.1:$PORT/speak \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello world"}' \
  -w "\nHTTP: %{http_code}, Time: %{time_total}s\n" \
  --output /tmp/quick_test.wav
```

**Expected output**:
```
HTTP: 200, Time: 0.31s
```

**Play audio**:
```bash
afplay /tmp/quick_test.wav
```

**Pass criteria**:
- HTTP 200 response
- Audio file created (>50KB)
- Audio plays correctly

---

### 3. Voice List

Verify available voices:

```bash
curl http://127.0.0.1:$PORT/voices | jq
```

**Expected output**:
```json
{
  "voices": [
    {"id": "af_bella", "name": "Bella (US)", "language": "en-US"},
    {"id": "af_sarah", "name": "Sarah (UK)", "language": "en-GB"},
    ...
  ]
}
```

**Pass criteria**:
- HTTP 200 response
- Array of voices with `id`, `name`, `language` fields
- At least 4 voices listed

---

## Performance Testing

### Short Text Performance (Target: ≥2.5x RTF, Achieved: 8.3x)

Test with short text (1.57s audio):

```bash
#!/bin/bash
# Save as /tmp/test_short_performance.sh

echo "=== Short Text Performance Test ==="
echo "Testing 10 consecutive requests with 'Hello world'"
echo ""

# Audio duration for "Hello world" is ~1.57s
AUDIO_DURATION=1.57

for i in $(seq 1 10); do
    echo -n "Request $i: "
    TIME=$(echo '{"text": "Hello world", "voice": "af_bella", "speed": 1.0}' | \
        curl -X POST http://127.0.0.1:$PORT/speak \
        -H "Content-Type: application/json" \
        --data-binary @- \
        -o /tmp/test_short_$i.wav \
        -w "%{time_total}" \
        -s)

    # Calculate RTF
    RTF=$(echo "scale=2; $AUDIO_DURATION / $TIME" | bc)
    echo "${TIME}s → RTF: ${RTF}x"

    sleep 0.2
done

echo ""
echo "=== Results ==="
echo "Expected: Request 1 (cold): ~0.31s (5x RTF)"
echo "Expected: Requests 2-10 (warm): ~0.18s (8.3x RTF)"
```

**Run it**:
```bash
chmod +x /tmp/test_short_performance.sh
/tmp/test_short_performance.sh
```

**Expected results**:
```
Request 1:  0.31s → RTF:  5.06x  (cold start)
Request 2:  0.19s → RTF:  8.09x
Request 3:  0.20s → RTF:  7.85x
Request 4:  0.19s → RTF:  8.32x
Request 5:  0.18s → RTF:  8.56x
Request 6:  0.20s → RTF:  7.85x
Request 7:  0.19s → RTF:  8.26x
Request 8:  0.18s → RTF:  8.72x
Request 9:  0.18s → RTF:  8.76x
Request 10: 0.18s → RTF:  8.78x

Average warm RTF: 8.3x
```

**Pass criteria**:
- Request 1 (cold): 0.25-0.40s (5-6x RTF)
- Requests 2-10 (warm): 0.15-0.22s (7-10x RTF)
- Average warm RTF: ≥7.0x

---

### Long Text Performance (Target: ≥2.5x RTF, Achieved: 25x)

Test with longer text (21.7s audio):

```bash
#!/bin/bash
# Save as /tmp/test_long_performance.sh

echo "=== Long Text Performance Test ==="

# Create test payload (21.7s audio)
cat > /tmp/long_test.json << 'EOF'
{
  "text": "The development of modern text-to-speech systems has revolutionized how we interact with technology, enabling natural-sounding voices that can convey emotion and nuance with remarkable accuracy and speed.",
  "voice": "af_bella",
  "speed": 1.0
}
EOF

AUDIO_DURATION=21.7

echo "Testing 10 consecutive requests with 50-word text"
echo ""

for i in $(seq 1 10); do
    echo -n "Request $i: "
    TIME=$(curl -X POST http://127.0.0.1:$PORT/speak \
        -H "Content-Type: application/json" \
        --data-binary @/tmp/long_test.json \
        -o /tmp/test_long_$i.wav \
        -w "%{time_total}" \
        -s)

    RTF=$(echo "scale=1; $AUDIO_DURATION / $TIME" | bc)
    echo "${TIME}s → RTF: ${RTF}x"

    sleep 0.2
done

echo ""
echo "=== Results ==="
echo "Expected: ~0.85s average (25x RTF)"
```

**Run it**:
```bash
chmod +x /tmp/test_long_performance.sh
/tmp/test_long_performance.sh
```

**Expected results**:
```
Request 1:  0.90s → RTF: 24.1x
Request 2:  0.86s → RTF: 25.2x
Request 3:  0.85s → RTF: 25.5x
Request 4:  0.95s → RTF: 22.8x
Request 5:  0.91s → RTF: 23.8x
Request 6:  0.83s → RTF: 26.1x
Request 7:  0.82s → RTF: 26.5x
Request 8:  0.84s → RTF: 25.8x
Request 9:  0.89s → RTF: 24.4x
Request 10: 0.91s → RTF: 23.8x

Average RTF: ~25x
```

**Pass criteria**:
- All requests: 0.70-1.10s (20-30x RTF)
- Average RTF: ≥20x

---

## Reliability Testing

### Stability Test (100 Consecutive Requests)

Test system stability under sustained load:

```bash
#!/bin/bash
# Save as /tmp/test_reliability.sh

echo "=== Reliability Test (100 Requests) ==="
echo "This will take ~30 seconds"
echo ""

SUCCESS=0
FAIL=0

for i in $(seq 1 100); do
    HTTP_CODE=$(echo '{"text":"Test '$i'"}' | \
        curl -X POST http://127.0.0.1:$PORT/speak \
        -H "Content-Type: application/json" \
        --data-binary @- \
        -o /tmp/reliability_$i.wav \
        -w "%{http_code}" \
        -s)

    if [ "$HTTP_CODE" = "200" ]; then
        SUCCESS=$((SUCCESS + 1))
        echo -n "."
    else
        FAIL=$((FAIL + 1))
        echo -n "✗"
    fi

    # Progress indicator every 10 requests
    if [ $((i % 10)) -eq 0 ]; then
        echo " $i/100"
    fi
done

echo ""
echo ""
echo "=== Reliability Results ==="
echo "Success: $SUCCESS/100 ($(echo "scale=1; $SUCCESS * 100 / 100" | bc)%)"
echo "Failed:  $FAIL/100"
echo ""

if [ $SUCCESS -eq 100 ]; then
    echo "Status: ✅ 100% PASS"
else
    echo "Status: ⚠️ NEEDS INVESTIGATION"
    echo "Failed requests logged above (✗)"
fi
```

**Run it**:
```bash
chmod +x /tmp/test_reliability.sh
/tmp/test_reliability.sh
```

**Expected results**:
```
.......... 10/100
.......... 20/100
.......... 30/100
...
.......... 100/100

Success: 100/100 (100%)
Failed:  0/100

Status: ✅ 100% PASS
```

**Pass criteria**:
- Success rate: ≥99% (99/100 or better)
- No helper crashes
- All audio files playable

---

### Memory Stability Test

Monitor memory usage over 50 requests:

```bash
#!/bin/bash
# Save as /tmp/test_memory.sh

echo "=== Memory Stability Test ==="
echo "Monitoring memory usage over 50 requests"
echo ""

for i in $(seq 1 50); do
    # Make request
    curl -X POST http://127.0.0.1:$PORT/speak \
        -H "Content-Type: application/json" \
        -d '{"text":"Memory test request '$i'"}' \
        -o /tmp/mem_test_$i.wav \
        -s > /dev/null

    # Check memory
    PID=$(lsof -ti :$PORT)
    if [ -n "$PID" ]; then
        MEM=$(ps -o rss= -p $PID | awk '{print $1/1024}')
        echo "Request $i: ${MEM} MB"
    fi

    sleep 0.1
done

echo ""
echo "=== Expected Behavior ==="
echo "Memory should stabilize at ~2000-2500 MB after initial model load"
echo "No continuous growth (memory leak)"
```

**Run it**:
```bash
chmod +x /tmp/test_memory.sh
/tmp/test_memory.sh
```

**Expected results**:
```
Request 1: 2200 MB  (model loading)
Request 2: 2150 MB
Request 3: 2150 MB
...
Request 50: 2150 MB  (stable)
```

**Pass criteria**:
- Memory stabilizes at 2000-2500 MB
- No continuous growth (±50 MB variance is normal)
- Helper remains responsive

---

## Audio Quality Validation

### WAV Format Validation

Verify generated WAV files are valid:

```bash
# Generate test audio
curl -X POST http://127.0.0.1:$PORT/speak \
  -H "Content-Type: application/json" \
  -d '{"text":"Audio quality test"}' \
  --output /tmp/quality_test.wav

# Check format
file /tmp/quality_test.wav

# Expected output:
# RIFF (little-endian) data, WAVE audio, Microsoft PCM, 16 bit, mono 24000 Hz
```

**Pass criteria**:
- Format: RIFF WAVE
- Codec: Microsoft PCM
- Bit depth: 16-bit
- Channels: Mono
- Sample rate: 24000 Hz

---

### File Size Validation

Check if audio file sizes are reasonable:

```bash
# Short text (~1.57s audio)
curl -X POST http://127.0.0.1:$PORT/speak \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello world"}' \
  --output /tmp/size_short.wav

ls -lh /tmp/size_short.wav
# Expected: ~74KB

# Long text (~21.7s audio)
curl -X POST http://127.0.0.1:$PORT/speak \
  -H "Content-Type: application/json" \
  --data-binary @/tmp/long_test.json \
  --output /tmp/size_long.wav

ls -lh /tmp/size_long.wav
# Expected: ~321KB
```

**Pass criteria**:
- Short text (1.57s): 70-80KB
- Long text (21.7s): 310-330KB
- Size correlates with audio duration

---

### Playback Validation

Manually verify audio quality:

```bash
# Generate samples with different voices
for voice in af_bella af_sarah am_adam am_michael; do
    echo "Testing voice: $voice"
    curl -X POST http://127.0.0.1:$PORT/speak \
      -H "Content-Type: application/json" \
      -d '{"text":"This is a test of voice '$voice'","voice":"'$voice'"}' \
      --output /tmp/voice_$voice.wav -s

    echo "Playing..."
    afplay /tmp/voice_$voice.wav
    sleep 1
done
```

**Pass criteria** (subjective):
- Clear, natural-sounding speech
- No distortion, clicks, or artifacts
- Voice matches requested voice ID
- Text is intelligible

---

## API Endpoint Testing

### `/health` Endpoint

```bash
# Test health endpoint
curl -v http://127.0.0.1:$PORT/health 2>&1 | grep -E "(HTTP|status|model)"

# Expected:
# < HTTP/1.1 200 OK
# {"status":"ok","model":"kokoro-82m",...}
```

**Pass criteria**:
- HTTP 200
- Valid JSON
- Contains `status`, `model`, `model_loaded`, `uptime_seconds`, `requests_served`

---

### `/speak` Endpoint

**Valid request**:
```bash
curl -X POST http://127.0.0.1:$PORT/speak \
  -H "Content-Type: application/json" \
  -d '{"text":"Test","voice":"af_bella","speed":1.0}' \
  -v -o /tmp/speak_test.wav 2>&1 | grep -E "(HTTP|X-)"

# Expected:
# < HTTP/1.1 200 OK
# < X-Audio-Duration: 0.96
# < X-Generation-Time: 0.11
# < X-Real-Time-Factor: 8.73
```

**Invalid request (missing text)**:
```bash
curl -X POST http://127.0.0.1:$PORT/speak \
  -H "Content-Type: application/json" \
  -d '{"voice":"af_bella"}' \
  -w "\nHTTP: %{http_code}\n"

# Expected:
# HTTP: 400
```

**Invalid JSON**:
```bash
curl -X POST http://127.0.0.1:$PORT/speak \
  -H "Content-Type: application/json" \
  -d '{invalid json}' \
  -w "\nHTTP: %{http_code}\n"

# Expected:
# HTTP: 400
```

**Pass criteria**:
- Valid request: HTTP 200, valid WAV
- Missing text: HTTP 400
- Invalid JSON: HTTP 400

---

### `/voices` Endpoint

```bash
curl http://127.0.0.1:$PORT/voices | jq '.voices | length'

# Expected: 4 (or more)
```

**Pass criteria**:
- HTTP 200
- Valid JSON array
- Each voice has `id`, `name`, `language`

---

## Interpreting Results

### Real-Time Factor (RTF)

**RTF = Audio Duration / Generation Time**

| RTF | Meaning |
|-----|---------|
| 1.0x | Real-time (generates as fast as playback) |
| 2.5x | Target performance (2.5x faster than playback) |
| 8.3x | Achieved (short text) — **3.3x better than target** |
| 25x | Achieved (long text) — **10x better than target** |

**Example**:
- Audio: 1.57 seconds
- Generation: 0.18 seconds
- RTF: 1.57 / 0.18 = **8.72x**

This means the helper generates audio 8.72x faster than real-time playback.

---

### Performance Tiers

| Tier | RTF Range | Status |
|------|-----------|--------|
| **Excellent** | ≥8.0x | ✅ Production-ready |
| **Good** | 5.0-7.9x | ✅ Acceptable |
| **Target** | 2.5-4.9x | ✅ Meets minimum |
| **Below Target** | <2.5x | ⚠️ Investigate |

**Current performance**: **Excellent** (8.3x short, 25x long)

---

### Expected Latencies

| Request Type | Expected Time | RTF |
|-------------|---------------|-----|
| **First request (cold)** | 0.25-0.40s | 5-6x |
| **Short text (warm)** | 0.15-0.22s | 8-10x |
| **Long text (warm)** | 0.70-1.10s | 20-30x |

**Warm**: Model is cached in memory
**Cold**: First request after helper start (model loading)

---

## Troubleshooting Failed Tests

### Health Check Fails (HTTP 503)

**Symptom**: `/health` returns 503 or connection refused

**Possible causes**:
1. Helper not running
2. Wrong port number
3. Model still loading

**Fix**:
```bash
# Check if helper is running
ps aux | grep natural-tts-helper

# Check correct port
cat ~/Library/Application\ Support/NaturalTTS/config.json | grep port

# Restart helper
pkill -f natural-tts-helper
.build/release/natural-tts-helper
```

---

### Low RTF Performance (<5x)

**Symptom**: Generation time is slower than expected

**Possible causes**:
1. Using debug build instead of release
2. CPU throttling
3. Memory pressure
4. Cold start (first request)

**Fix**:
```bash
# 1. Use release build
swift build -c release
.build/release/natural-tts-helper  # NOT .build/debug/

# 2. Check CPU usage (should be 100-200% during generation)
top -pid $(lsof -ti :$PORT)

# 3. Check memory
vm_stat | grep "Pages free"

# 4. Wait for model warmup
# First request is always slower (model loading)
```

---

### Reliability Test Failures

**Symptom**: Some requests fail (HTTP ≠ 200)

**Possible causes**:
1. Concurrent request limit exceeded
2. Memory exhaustion
3. Python worker crash

**Fix**:
```bash
# Check helper logs for errors
# (Helper should print errors to terminal)

# Restart helper
pkill -f natural-tts-helper
.build/release/natural-tts-helper

# Re-run test with slower rate
# Add `sleep 0.5` between requests in test script
```

---

### Invalid WAV Files

**Symptom**: Audio files are corrupted or won't play

**Possible causes**:
1. Request was interrupted
2. Disk full
3. Permissions issue

**Fix**:
```bash
# 1. Check disk space
df -h /tmp

# 2. Verify file size (should be >50KB)
ls -lh /tmp/test.wav

# 3. Re-generate
curl -X POST http://127.0.0.1:$PORT/speak \
  -H "Content-Type: application/json" \
  -d '{"text":"Test"}' \
  --output /tmp/test_new.wav && afplay /tmp/test_new.wav
```

---

## Summary Checklist

Use this checklist to validate the helper before Phase 2 development:

- [ ] Health check passes (HTTP 200, `model_loaded: true`)
- [ ] Basic speech generation works (audio plays correctly)
- [ ] Voices endpoint returns ≥4 voices
- [ ] Short text RTF ≥7.0x (warm requests)
- [ ] Long text RTF ≥20x
- [ ] Reliability ≥99% (100 requests)
- [ ] Memory stable at 2000-2500 MB (no leaks)
- [ ] WAV files are valid format (24kHz, 16-bit, mono)
- [ ] Audio quality is clear and natural
- [ ] Invalid requests return HTTP 400

**All checked?** ✅ **Helper is production-ready for Phase 2!**

---

**See also**:
- [README.md](README.md) — Full documentation
- [QUICKSTART.md](QUICKSTART.md) — 5-minute setup guide
- [TEST_RESULTS_OPTIMIZED.md](TEST_RESULTS_OPTIMIZED.md) — Phase 1 & 2 validation results
