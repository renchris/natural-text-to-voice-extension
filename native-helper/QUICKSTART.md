# Quick Start Guide

Get the Natural TTS Helper running by hand, step by step. `Scripts/quickstart.sh` does all of this in one command
(and runs the helper in a background tmux session); Homebrew users run
`brew install renchris/tap/natural-tts && brew services start natural-tts` instead (the tap is published together
with the store listing).

---

## Prerequisites Check

Before starting, ensure you have:

```bash
# Check macOS version (need 14.5+ to build; the helper runs on 14.0+)
sw_vers
# ProductName:            macOS
# ProductVersion:         14.5  (or higher)

# Check Xcode Command Line Tools
xcode-select -p
# /Applications/Xcode.app/Contents/Developer (or similar)

# Check uv (it installs Python 3.12 itself; no system Python needed)
uv --version || brew install uv
# uv 0.11.28 (or later)

# Check architecture (need Apple Silicon)
uname -m
# arm64 (M1/M2/M3/M4)
```

---

## Step 1: Install espeak-ng

**REQUIRED** for Kokoro phoneme generation.

```bash
# Install via Homebrew
brew install espeak-ng

# Verify installation
espeak-ng --version
```

**Don't have Homebrew?** Install it first:
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

---

## Step 2: Setup Python Environment

```bash
git clone https://github.com/renchris/natural-text-to-voice-extension.git
cd natural-text-to-voice-extension/native-helper
./Scripts/setup-python-env.sh
```

**What this does**:
- Syncs the hash-locked uv project in `python/` into `Sources/NaturalTTSHelper/Resources/python-env/`
  (Python 3.12, MLX 0.32.2, mlx-audio 0.5.5; ~0.66 GB (655 MB), no torch)
- Pre-fetches Kokoro-82M once (~0.35 GB, 349 MB); after that the helper runs offline
- Verifies the worker end to end (`Scripts/verify_worker.py`)
- Moves a pre-1.5 environment to `native-helper/.python-env.pre-1.5` as a rollback

**Expected output** (abridged):
```
===================================
Natural TTS Helper - Python Setup
===================================
Syncing the locked environment into:
  .../Sources/NaturalTTSHelper/Resources/python-env
Verifying the installation...
Fetching the Kokoro model once (weights + voices, ~350 MB on first run)...
Model revision: e02c9eada7ce7416798af36b190a8a2dd2ecd566
Verifying the worker end to end (Scripts/verify_worker.py)...
Environment size: 655M
===================================
Python environment setup complete
===================================
```

---

## Step 3: Build Release Binary

```bash
swift build -c release
```

The first build also fetches and compiles SwiftNIO; later builds are incremental. It needs a Swift 6.0 toolchain
(Xcode 16.2 or later, or its Command Line Tools).

Binary will be at: `.build/release/natural-tts-helper`

---

## Step 4: Run the Helper

```bash
.build/release/natural-tts-helper
```

Nothing is downloaded here: Step 2 fetched the model. The helper loads it, runs one short warm-up sentence per
English pipeline, and only then opens its port, so the first request is as fast as later ones. About 3-4 s on an
M1 Max (1.95 s before the British pipeline was also warmed at startup).

**Expected output** (abridged; in a terminal the helper prints each message without a timestamp or label):
```
info: Natural TTS Helper 1.5.0 (API 2) starting...
info: Starting Python MLX worker...
info: Waiting for Kokoro model to warm up...
info: [worker] [INFO] Eagerly loading Kokoro weights at startup (revision e02c9ea)...
info: [worker] [INFO] Warming up (one short generation per English pipeline)...
info: Kokoro model loaded and ready
info: Starting HTTP server...
info: ================================
info: Natural TTS Helper is ready!
info: Listening on: http://127.0.0.1:8249
info: Model: Kokoro-82M (MLX Metal)
info: ================================
```

**The port** is 8249 unless something already holds it; then the helper takes the next free port up to 8260 and
the "Listening on" line says which. The extension searches the same range.

---

## Step 5: Test It!

Open a new terminal and run:

```bash
# 8249, or the port from Step 4
curl -X POST http://127.0.0.1:8249/speak \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello from Metal GPU!"}' \
  --output test.wav && afplay test.wav
```

You should hear "Hello from Metal GPU!" in a natural voice.

**Success!** The helper is working.

---

## Step 6 (Optional): Check Performance

The helper reports its own timing in response headers:

```bash
for i in 1 2 3; do
  curl -s -o /dev/null -D - -X POST http://127.0.0.1:8249/speak \
    -H "Content-Type: application/json" \
    -d '{"text":"The quick brown fox jumps over the lazy dog, then naps in the afternoon sun."}' \
    | grep -i '^x-' | tr -d '\r' | paste -sd' ' -
done
```

Each line shows `X-Audio-Duration` (seconds of audio), `X-Generation-Time` and `X-Real-Time-Factor`. On an idle
M1 Max, expect about 26× faster than real time; other GPU work lowers it.

---

## Usage Examples

### Interactive Demo (Easiest Way to Explore!)

Run the interactive demo for a menu-driven experience:

```bash
./Scripts/demo.sh
```

**Interactive menu**:
- Test all voices (every voice `/voices` lists: 28)
- Test different speeds (0.5x to 2.0x)
- Custom text (enter your own text)
- Performance test (it assumes ~2.5 s of audio per request rather than reading it, so treat its RTF as a rough
  guide; Step 6 above uses the helper's own numbers)
- View helper status

The demo automatically plays audio and shows performance metrics!

---

### Quick curl Examples

#### 1. List Available Voices

```bash
curl http://127.0.0.1:8249/voices | jq
```

**Returns**: 28 voices, 20 American (`af_*`, `am_*`) and 8 British (`bf_*`, `bm_*`), each with a label such as
"Heart (US)", its language, accent, gender and grade

#### 2. Test Different Voices

```bash
# Try all voices
for voice in af_heart am_michael bf_emma bm_george; do
  curl -X POST http://127.0.0.1:8249/speak \
    -H "Content-Type: application/json" \
    -d '{"text":"Hello, this is voice '$voice'","voice":"'$voice'"}' \
    --output test_$voice.wav
  afplay test_$voice.wav
done
```

#### 3. Test Different Speeds

```bash
# Slow (0.5x)
curl -X POST http://127.0.0.1:8249/speak \
  -H "Content-Type: application/json" \
  -d '{"text":"This is very slow","speed":0.5}' \
  --output test_slow.wav && afplay test_slow.wav

# Fast (1.5x)
curl -X POST http://127.0.0.1:8249/speak \
  -H "Content-Type: application/json" \
  -d '{"text":"This is fast","speed":1.5}' \
  --output test_fast.wav && afplay test_fast.wav
```

#### 4. Longer Text

```bash
curl -X POST http://127.0.0.1:8249/speak \
  -H "Content-Type: application/json" \
  -d '{"text":"The Natural TTS Helper uses MLX Kokoro-82M to generate speech on Apple silicon, entirely on your Mac, about twenty-six times faster than real time."}' \
  --output test_long.wav && afplay test_long.wav
```

---

### Performance Testing Scripts

`./Scripts/test-performance-short.sh` and `./Scripts/test-performance-long.sh` run 10 requests each. They date from
2025 and compute their "RTF" from hard-coded audio durations (1.57 s and 21.7 s), so the long script's figure is
about three times too high; use their timings, not their RTF lines, or the header loop in Step 6.

---

### Helper Management

```bash
# Check helper status
./Scripts/status.sh

# View logs (last 100 lines)
./Scripts/logs.sh

# Follow logs in real-time
./Scripts/logs.sh --follow

# Stop helper
./Scripts/teardown.sh
```

---

### Sample Texts

Pre-written example texts are available in `examples/sample-texts.json`:
- Short texts (5-10 words)
- Medium texts (20-30 words)
- Long texts (40-50 words)
- Creative examples (poetry, dialogue, storytelling)

**Try a creative example**:
```bash
# Poetry example
TEXT=$(jq -r '.creative.poetry[0]' examples/sample-texts.json)
curl -X POST http://127.0.0.1:8249/speak \
  -H "Content-Type: application/json" \
  -d "{\"text\":\"$TEXT\"}" \
  --output poetry.wav && afplay poetry.wav
```

---

### Full Documentation

For comprehensive testing and API details, see:

- **[TESTING_GUIDE.md](TESTING_GUIDE.md)** — Detailed performance and reliability tests
- **[README.md](README.md)** — Complete API documentation, performance details, troubleshooting

---

## Common Issues

### "espeak not found"

```bash
brew install espeak-ng
```

### The helper exits at startup (missing model or module)

```bash
cd native-helper
./Scripts/setup-python-env.sh   # rebuilds the environment, fetches the model, verifies the worker
```

### "All ports 8249..8260 are in use", or the wrong helper answers

Another copy of the helper is usually running. Stop it (`./Scripts/teardown.sh` for the tmux one,
`brew services stop natural-tts` for the Homebrew one) and start again:

```bash
lsof -nP -iTCP:8249 -sTCP:LISTEN   # who holds 8249
```

### "Model warmup timed out after 60s"

The worker did not finish its warm-up. Look at the `[worker]` lines above the error; if the environment is
damaged, re-run `./Scripts/setup-python-env.sh`.

---

## Summary

You now have:
- ✅ The Natural TTS helper on `http://127.0.0.1:8249` (or the next free port up to 8260)
- ✅ Kokoro-82M loaded, warmed up and cached; the helper runs offline
- ✅ About 26× faster than real time on an idle M1 Max
- ✅ Speech generated entirely on your Mac

**Config saved to**: `~/Library/Application Support/NaturalTTS/config.json`

**Next time**: run `.build/release/natural-tts-helper` (or `Scripts/quickstart.sh`); startup takes about 3-4 s.

---

**Questions?** See [README.md](README.md) or [TESTING_GUIDE.md](TESTING_GUIDE.md).
