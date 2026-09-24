# Testing & Validation Guide

Hands-on checks for the Natural TTS helper's API, speed, reliability and audio, with `curl`. The automated,
fail-closed gate for a release is `scripts/verify-all.sh` at the repository root (it starts its own helper on a
private port); use this guide to look at a running helper yourself.

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
- Helper is running: `.build/release/natural-tts-helper`, `Scripts/quickstart.sh`, or `brew services start natural-tts`
- `jq` installed for JSON formatting: `brew install jq`

**Find your port** (8249 unless it was taken; the helper's "Listening on" log line says which):
```bash
PORT=8249
curl -s http://127.0.0.1:$PORT/health | jq -r .version   # 1.5.0
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
  "requests_served": 0,
  "version": "1.5.0",
  "apiVersion": 2
}
```

**Pass criteria**:
- HTTP 200 response
- `status`: "ok" (`warming` while a crashed worker restarts, `error` once it gave up)
- `model_loaded`: true
- `apiVersion`: 2

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

**Expected output** (the time is about 0.1-0.4 s on an idle M1-class GPU):
```
HTTP: 200, Time: <seconds>s
```

**Play audio**:
```bash
afplay /tmp/quick_test.wav
```

**Pass criteria**:
- HTTP 200 response
- Audio file created (48,000 bytes per second of audio, plus a 44-byte header)
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
    {"id": "af_heart", "name": "Heart (US)", "language": "en-US", "accent": "American", "gender": "female", "grade": "A"},
    {"id": "af_bella", "name": "Bella (US)", "language": "en-US", "accent": "American", "gender": "female", "grade": "A-"},
    ...
  ]
}
```

**Pass criteria**:
- HTTP 200 response
- 28 voices: 11 `af_`, 9 `am_`, 4 `bf_`, 4 `bm_`
- `af_sarah` is "Sarah (US)", `en-US` (older helpers mislabelled it UK)

---

## Performance Testing

The helper measures itself: every `/speak` response carries `X-Audio-Duration` (seconds of audio),
`X-Generation-Time` (seconds the worker took) and `X-Real-Time-Factor` (their ratio). Read those instead of
guessing the audio length. (The 2025 version of this guide, and `Scripts/test-performance-*.sh`, hard-coded the
duration; the long-text "25x" they printed was really about 8x. See [docs/history.md](../docs/history.md).)

```bash
#!/bin/bash
# Save as /tmp/test_performance.sh; run with PORT set
TEXTS=(
  "The quick brown fox jumps over the lazy dog."
  "$(jq -r '.long[0]' examples/sample-texts.json)"
)
for text in "${TEXTS[@]}"; do
  echo "=== ${#text} characters ==="
  for i in $(seq 1 5); do
    jq -n --arg t "$text" '{text: $t, voice: "af_heart", speed: 1.0}' |
      curl -s -o /dev/null -D - -X POST "http://127.0.0.1:$PORT/speak" \
        -H 'Content-Type: application/json' --data-binary @- -w 'wall %{time_total}\n' |
      grep -iE '^(x-audio-duration|x-real-time-factor|wall)' | tr -d '\r' | paste -sd' ' -
  done
done
```

Run it from `native-helper/` (it reads `examples/sample-texts.json`).

**Reference** (helper 1.5.0, M1 Max, idle GPU, `af_bella`, 2026-09-23; from
[W2-integration-measurements.md](../docs/research/2026-09-upgrade/W2-integration-measurements.md)):

| Text | Audio | Wall time (median) | Faster than real time |
|---|---:|---:|---:|
| 15 words | 9.0 s | 0.34 s | 26.6× |
| 60 words | 29.0 s | 1.11 s | 26.2× |
| 407 words | 171.5 s | 6.47 s | 26.5× |
| 751 words | 325.2 s | 12.2 s | 26.6× |

**Pass criteria**:
- The first request after launch is no slower than later ones (the worker warms up before it opens its port)
- On an idle M1-class GPU, `X-Real-Time-Factor` is roughly 20× or more for anything past a sentence. Anything
  else using the GPU lowers it: measured with other work running, a 5-second clip came in at 13-14×

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

The model lives in the **Python worker**, a child process of the helper, and most of its memory is GPU buffers,
which `ps` RSS does not count. Watch the worker with `footprint`:

```bash
#!/bin/bash
# Save as /tmp/test_memory.sh
HELPER=$(lsof -ti tcp:$PORT -sTCP:LISTEN)
WORKER=$(pgrep -P "$HELPER" | head -1)
echo "helper $HELPER, worker $WORKER"
for i in $(seq 1 50); do
  curl -s -o /dev/null -X POST "http://127.0.0.1:$PORT/speak" \
    -H "Content-Type: application/json" -d '{"text":"Memory test request '$i'"}'
  if (( i % 10 == 0 )); then
    echo "after $i: $(footprint -p "$WORKER" 2>/dev/null | grep -m1 -o 'Footprint: [0-9.]* [KMG]B')"
  fi
done
```

**Expected** (1.5.0): the worker's footprint returns to about 0.6-0.7 GB between requests. Its lifetime peak depends on
the longest request so far: about 2.1 GB after a short sentence, about 3.6 GB after 5,000 characters, with the
MLX buffer cache capped at 256 MB (`NTTS_MLX_CACHE_LIMIT_MB`). `footprint` prints both the current and the peak
figure. The Swift helper itself stays near 10 MB, 140 MB
at most.

**Pass criteria**:
- No continuous growth of the between-request footprint
- Helper remains responsive (`/health` answers in under a millisecond even during a long `/speak`)

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

The WAV is 16-bit mono at 24 kHz: 48,000 bytes per second of audio plus a 44-byte header, so size and the
`X-Audio-Duration` header must agree:

```bash
curl -s -D /tmp/h.txt -X POST http://127.0.0.1:$PORT/speak \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello world"}' \
  --output /tmp/size_short.wav
DUR=$(grep -i '^x-audio-duration' /tmp/h.txt | tr -d '\r' | awk '{print $2}')
echo "expected $(echo "$DUR * 48000 + 44" | bc | cut -d. -f1) bytes, got $(stat -f %z /tmp/size_short.wav)"
```

**Pass criteria**:
- The two numbers match (within a few bytes of rounding)

---

### Playback Validation

Manually verify audio quality:

```bash
# Generate samples with different voices
for voice in af_heart am_michael bf_emma bm_george; do
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
- Voice matches requested voice ID (British `bf_`/`bm_` voices with British pronunciation)
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
- Contains `status`, `model`, `model_loaded`, `uptime_seconds`, `requests_served`, `version`, `apiVersion`

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
# < X-Audio-Duration: <seconds of audio>
# < X-Generation-Time: <seconds>
# < X-Real-Time-Factor: <ratio>
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

**Unknown voice, bad speed, web-page origin**:
```bash
curl -s -X POST http://127.0.0.1:$PORT/speak -H "Content-Type: application/json" \
  -d '{"text":"hi","voice":"xx_nope"}' -w ' %{http_code}\n'
# {"error":"unknown_voice","message":"Unknown voice 'xx_nope'. GET /voices lists the supported IDs."} 400

curl -s -X POST http://127.0.0.1:$PORT/speak -H "Content-Type: application/json" \
  -d '{"text":"hi","speed":9}' -w ' %{http_code}\n'
# {"error":"invalid_speed",...} 400

curl -s -X POST http://127.0.0.1:$PORT/speak -H "Origin: https://example.com" \
  -H "Content-Type: application/json" -d '{"text":"hi"}' -w ' %{http_code}\n'
# {"error":"forbidden","message":"Origin not allowed"} 403
```

**Pass criteria**:
- Valid request: HTTP 200, valid WAV
- Missing text: HTTP 400 (`bad_request`)
- Invalid JSON: HTTP 400 (`bad_request`)
- Unknown voice: 400 `unknown_voice`; speed outside 0.25-4.0: 400 `invalid_speed`
- A web-page `Origin`: 403 `forbidden`; a non-loopback `Host`: 403 `bad_host`
- Error bodies never quote the request text

---

### `/voices` Endpoint

```bash
curl http://127.0.0.1:$PORT/voices | jq '.voices | length'

# Expected: 28
```

**Pass criteria**:
- HTTP 200
- Valid JSON array of 28
- Each voice has `id`, `name`, `language`, `accent`, `gender`, `grade`

---

## Interpreting Results

### Real-Time Factor (RTF)

**RTF = Audio Duration / Generation Time**. 1.0× generates audio as fast as it plays. The 2025 target was 2.5×;
helper 1.5.0 reaches about 26.5× on an idle M1 Max, at every text length.

`X-Real-Time-Factor` uses the worker's own generation time. Dividing `X-Audio-Duration` by `curl`'s
`time_total` instead includes HTTP overhead and gives a slightly lower number; the reference table above uses
that client-side method.

### Expected Latencies (helper 1.5.0, idle M1 Max)

| Request | Expected time |
|---|---|
| First request after launch | same as later ones (~0.35 s for 15 words) |
| One sentence | 0.1-0.4 s |
| 400 words | ~6.5 s |
| 5,000 characters (the extension's limit) | ~12 s |

Audio starts only when the whole WAV is ready, so these are also the times to first audio.

---

## Troubleshooting Failed Tests

### Health Check Fails

**Symptom**: connection refused, or `status` is not `ok`

**Possible causes**:
1. Helper not running, or on another port (8250-8260)
2. `status: "warming"`: the worker is restarting after a crash
3. `status: "error"`: the worker crashed more than 3 times in 2 minutes and the helper gave up

**Fix**:
```bash
# Is it running, and on which port?
lsof -nP -iTCP -sTCP:LISTEN | grep natural-t

# Restart it: Scripts/quickstart.sh (source), or brew services restart natural-tts
```

---

### Low RTF Performance (<5x)

**Symptom**: Generation time is slower than expected

**Possible causes**:
1. Using debug build instead of release
2. Other work on the GPU (MLX, video, games)
3. Memory pressure

**Fix**:
```bash
# 1. Use release build
swift build -c release
.build/release/natural-tts-helper  # NOT .build/debug/

# 2. Check GPU load: Activity Monitor → Window → GPU History

# 3. Check memory
vm_stat | grep "Pages free"
```

---

### Reliability Test Failures

**Symptom**: Some requests fail (HTTP ≠ 200)

**Possible causes**:
1. Requests that are refused on purpose (400 codes: check the `error` field)
2. Memory exhaustion on very long requests
3. A Python worker crash (the helper restarts it; `/health` shows `warming` meanwhile)

**Fix**:
```bash
# Check the helper log: Scripts/logs.sh (source install), or
# $(brew --prefix)/var/log/natural-tts.log (Homebrew)

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

# 2. Is it a JSON error instead of a WAV?
file /tmp/test.wav; head -c 200 /tmp/test.wav

# 3. Re-generate
curl -X POST http://127.0.0.1:$PORT/speak \
  -H "Content-Type: application/json" \
  -d '{"text":"Test"}' \
  --output /tmp/test_new.wav && afplay /tmp/test_new.wav
```

---

## Summary Checklist

- [ ] Health check passes (HTTP 200, `status: "ok"`, `model_loaded: true`, `apiVersion: 2`)
- [ ] Basic speech generation works (audio plays correctly)
- [ ] Voices endpoint returns 28 voices
- [ ] The first request after launch is as fast as later ones
- [ ] `X-Real-Time-Factor` is roughly 20× or more past a sentence on an idle GPU
- [ ] Reliability ≥99% (100 requests)
- [ ] Worker footprint returns to ~0.6-0.7 GB between requests (no leaks)
- [ ] WAV files are valid (24 kHz, 16-bit, mono) and their size matches `X-Audio-Duration`
- [ ] Audio quality is clear and natural, in American and British voices
- [ ] Invalid requests return the documented 400 and 403 codes

---

**See also**:
- [README.md](README.md) — Full documentation
- [QUICKSTART.md](QUICKSTART.md) — step-by-step setup
- [TEST_RESULTS_OPTIMIZED.md](TEST_RESULTS_OPTIMIZED.md) — the 2025 validation run (historical)
