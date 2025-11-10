# Quick Start Guide

Get the Natural TTS Helper running in 5 minutes.

---

## Prerequisites Check

Before starting, ensure you have:

```bash
# Check macOS version (need 13+)
sw_vers
# ProductName:            macOS
# ProductVersion:         14.0  (or higher)

# Check Xcode Command Line Tools
xcode-select -p
# /Applications/Xcode.app/Contents/Developer (or similar)

# Check Python version (need 3.9-3.11)
python3 --version
# Python 3.11.x (or 3.9.x, 3.10.x)

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
# Expected: eSpeak NG text-to-speech: 1.52.0
```

**Don't have Homebrew?** Install it first:
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

---

## Step 2: Setup Python Environment

```bash
cd /path/to/natural-text-to-voice-extension/native-helper
./Scripts/setup-python-env.sh
```

**What this does**:
- Creates Python virtual environment at `Sources/NaturalTTSHelper/Resources/python-env/`
- Installs MLX 0.29.3 (~150MB)
- Installs mlx-audio 0.2.6 (~50MB)
- Installs soundfile, phonemizer, and other dependencies

**Time**: ~3-5 minutes (downloads ~500MB of packages)

**Expected output**:
```
Setting up Python environment for Natural TTS Helper...
Creating virtual environment...
Installing dependencies...
Successfully installed mlx-0.29.3 mlx-audio-0.2.6 ...
Setup complete!
```

---

## Step 3: Build Release Binary

```bash
swift build -c release
```

**Time**: ~30-60 seconds

**Expected output**:
```
Building for production...
[1/8] Compiling NaturalTTSHelper main.swift
[2/8] Compiling NaturalTTSHelper HTTPServer.swift
...
Build complete! (30.45s)
```

Binary will be at: `.build/release/natural-tts-helper`

---

## Step 4: Run the Helper

```bash
.build/release/natural-tts-helper
```

**First run** (~35s):
- Downloads Kokoro-82M model (~200MB from HuggingFace)
- Downloads spaCy model (~13MB)
- Loads and warms up model

**Expected output**:
```
[info] Natural TTS Helper starting...
[info] Loading configuration...
[info] Starting Python MLX worker...
[info] Waiting for Kokoro model to warm up...
[Python] [INFO] Loading Kokoro-82M model...
[Python] Fetching model from HuggingFace... (first time only)
[Python] [INFO] Model loaded, ready for requests
[info] Kokoro model loaded and ready
[info] Starting HTTP server...
================================
Natural TTS Helper is ready!
Listening on: http://127.0.0.1:8249
Model: Kokoro-82M (MLX Metal)
================================
```

**Note the port number** (8249 in this example) — you'll need it for testing.

**Subsequent runs** (~2.5s): Models are cached, much faster startup.

---

## Step 5: Test It!

Open a new terminal and run:

```bash
# Replace 8249 with your port from Step 4
curl -X POST http://127.0.0.1:8249/speak \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello from Metal GPU!"}' \
  --output test.wav && afplay test.wav
```

You should hear "Hello from Metal GPU!" in a natural voice.

**Success!** The helper is working.

---

## Step 6 (Optional): Check Performance

Run 3 quick requests to see the performance:

```bash
# Replace 8249 with your port
for i in 1 2 3; do
  echo -n "Request $i: "
  echo '{"text":"Hello world"}' | \
    curl -X POST http://127.0.0.1:8249/speak \
      -H "Content-Type: application/json" \
      --data-binary @- \
      -o /tmp/test_$i.wav \
      -w "%{time_total}s\n" \
      -s
done
```

**Expected output**:
```
Request 1: 0.31s  (cold start, model loading)
Request 2: 0.19s  (warm, 8.3x RTF)
Request 3: 0.18s  (warm, 8.7x RTF)
```

**RTF (Real-Time Factor)**: The helper generates audio ~8x faster than playback time.

---

## Usage Examples

### Interactive Demo (Easiest Way to Explore!)

Run the interactive demo for a menu-driven experience:

```bash
./Scripts/demo.sh
```

**Interactive menu**:
- Test all voices (hear 6 different voices)
- Test different speeds (0.5x to 2.0x)
- Custom text (enter your own text)
- Performance test (benchmark RTF)
- View helper status

The demo automatically plays audio and shows performance metrics!

---

### Quick curl Examples

#### 1. List Available Voices

```bash
curl http://127.0.0.1:8249/voices | jq
```

**Returns**: 6 voices (af_bella, af_sarah, am_adam, am_michael, etc.)

#### 2. Test Different Voices

```bash
# Try all voices
for voice in af_bella af_sarah am_adam am_michael; do
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

#### 4. Longer Text (Best Performance)

```bash
curl -X POST http://127.0.0.1:8249/speak \
  -H "Content-Type: application/json" \
  -d '{"text":"The Natural TTS Helper uses MLX Kokoro-82M to generate speech on Apple Silicon with Metal GPU acceleration, achieving eight point three times real-time factor for short text and twenty-five times for longer text."}' \
  --output test_long.wav && afplay test_long.wav
```

---

### Performance Testing Scripts

#### Short Text Test (8.3x RTF expected)

```bash
./Scripts/test-performance-short.sh
```

Runs 10 consecutive requests with short text (~1.57s audio).

#### Long Text Test (25x RTF expected)

```bash
./Scripts/test-performance-long.sh
```

Runs 10 consecutive requests with longer text (~21.7s audio).

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
# Install espeak-ng
brew install espeak-ng
```

### "Python worker process not running"

```bash
# Re-run Python setup
cd native-helper
./Scripts/setup-python-env.sh
```

### "Port already in use"

```bash
# Kill existing helper
pkill -f natural-tts-helper
sleep 2
.build/release/natural-tts-helper
```

### "Model warmup timed out"

Check your internet connection — first run downloads ~215MB of models from HuggingFace.

---

## Summary

You now have:
- ✅ Native TTS Helper running on `http://127.0.0.1:<port>`
- ✅ Kokoro-82M model loaded and cached
- ✅ 8.3x-25x real-time performance
- ✅ 100% local, privacy-first TTS

**Config saved to**: `~/Library/Application Support/NaturalTTS/config.json`

**Next time**: Just run `.build/release/natural-tts-helper` — models are cached, startup is ~2.5s.

---

**Questions?** See [README.md](README.md) or [TESTING_GUIDE.md](TESTING_GUIDE.md).
