# Natural TTS Helper

Native macOS helper application for Metal-accelerated text-to-speech using MLX Kokoro.

## Overview

This Swift-based helper app provides a local HTTP API for the Natural Text-to-Voice Chrome extension. It spawns a Python subprocess that runs MLX Kokoro-82M with Metal GPU acceleration, achieving ~2.5x real-time generation.

**Architecture**:
- **Swift HTTP Server** (SwiftNIO) on `127.0.0.1:random-port`
- **Python Worker** subprocess with MLX audio generation
- **Communication**: Length-prefixed JSON (Native Messaging protocol)
- **Performance**: ~2.5s warm startup, 2.5x real-time factor

## Prerequisites

- macOS 13+ (Ventura or later)
- Xcode Command Line Tools: `xcode-select --install`
- Python 3.9-3.11
- Apple Silicon (M1/M2/M3) for Metal GPU acceleration

## Build Instructions

### 1. Setup Python Environment

```bash
cd native-helper
./Scripts/setup-python-env.sh
```

This creates a virtual environment with MLX dependencies (~500MB):
- mlx 0.29.3
- mlx-audio 0.2.6
- soundfile 0.13.1

### 2. Build Swift Package

```bash
swift build -c release
```

The binary will be at: `.build/release/natural-tts-helper`

### 3. Run Helper

```bash
.build/release/natural-tts-helper
```

Expected output:
```
[info] Natural TTS Helper starting...
[info] Loading configuration...
[info] Starting Python MLX worker...
[info] Waiting for Kokoro model to warm up...
[Python] [INFO] Loading Kokoro-82M model...
[Python] [INFO] Model loaded, ready for requests
[info] Kokoro model loaded and ready
[info] Starting HTTP server...
================================
Natural TTS Helper is ready!
Listening on: http://127.0.0.1:8423
Model: Kokoro-82M (MLX Metal)
================================
```

First run will download Kokoro-82M (~200MB) and spaCy model (~13MB).

## API Documentation

### GET /health

Health check and model status.

**Response**:
```json
{
  "status": "ok",
  "model": "kokoro-82m",
  "model_loaded": true,
  "uptime_seconds": 123.45,
  "requests_served": 42
}
```

### POST /speak

Generate TTS audio.

**Request**:
```json
{
  "text": "Hello from Metal GPU!",
  "voice": "af_bella",  // optional
  "speed": 1.0          // optional, 0.5-2.0
}
```

**Response Headers**:
- `Content-Type: audio/wav`
- `X-Audio-Duration: 6.1` (seconds)
- `X-Generation-Time: 2.43` (seconds)
- `X-Real-Time-Factor: 2.51` (RTF)

**Response Body**: Binary WAV audio (24kHz, 16-bit, mono)

### GET /voices

List available voices.

**Response**:
```json
{
  "voices": [
    {"id": "af_bella", "name": "Bella (US)", "language": "en-US"},
    {"id": "af_sarah", "name": "Sarah (UK)", "language": "en-GB"},
    ...
  ]
}
```

## Testing

### Test Health Endpoint

```bash
# Find port from config
PORT=$(cat ~/Library/Application\ Support/NaturalTTS/config.json | grep -o '"port":[0-9]*' | grep -o '[0-9]*')

# Test health
curl http://127.0.0.1:$PORT/health | jq
```

### Test Speech Generation

```bash
curl -X POST http://127.0.0.1:$PORT/speak \
  -H "Content-Type: application/json" \
  -d '{"text":"This is a test of Metal GPU acceleration"}' \
  --output test.wav

# Play audio (macOS)
afplay test.wav
```

### Test Voices Endpoint

```bash
curl http://127.0.0.1:$PORT/voices | jq
```

## Configuration

Config is saved to: `~/Library/Application Support/NaturalTTS/config.json`

```json
{
  "port": 8423,
  "secret": "uuid-token",
  "python_path": "/path/to/python3",
  "worker_script_path": "/path/to/tts_worker.py",
  "default_voice": "af_bella"
}
```

The Chrome extension reads this file to discover the helper's port.

## Performance

Based on Metal GPU validation (M1 Max):

| Metric | Value |
|--------|-------|
| **Cold start** | 35s (first time, downloads models) |
| **Warm start** | 2.5s (subsequent runs) |
| **Generation RTF** | 2.51x real-time |
| **Memory** | ~2GB (Kokoro model) |
| **Latency** | <100ms (HTTP overhead) |

## Development

### Directory Structure

```
native-helper/
├── Package.swift              # Swift Package Manager config
├── Sources/
│   └── NaturalTTSHelper/
│       ├── main.swift         # Entry point
│       ├── HTTPServer.swift   # SwiftNIO HTTP server
│       ├── PythonWorker.swift # Subprocess manager
│       ├── Config.swift       # Configuration
│       ├── Models.swift       # Data models
│       └── Resources/
│           ├── tts_worker.py  # Python MLX worker
│           └── python-env/    # Bundled venv (gitignored)
├── Tests/
├── Scripts/
│   └── setup-python-env.sh    # Python setup
└── README.md
```

### Debugging

Enable debug logging by editing `main.swift`:
```swift
handler.logLevel = .debug  // Change from .info
```

View Python worker logs:
```
[Python] [INFO] ...
[Python] [DEBUG] ...
```

### Hot Reload (Development)

For faster iteration:
1. Keep helper running
2. Edit Python worker: `Sources/NaturalTTSHelper/Resources/tts_worker.py`
3. Restart helper (Ctrl+C, then rerun)
4. Model stays cached, warm startup is fast

## Troubleshooting

### "Python worker process not running"

Check Python path in config is valid:
```bash
cat ~/Library/Application\ Support/NaturalTTS/config.json
```

Ensure Python has MLX installed:
```bash
python3 -c "import mlx; print(mlx.__version__)"
```

### "Model warmup timed out"

First run downloads models (~200MB). Check network connection.

Subsequent runs should warm in ~2.5s.

### "Failed to start HTTP server"

Port already in use. Kill existing process:
```bash
lsof -ti :8423 | xargs kill
```

Or delete config to get new random port:
```bash
rm ~/Library/Application\ Support/NaturalTTS/config.json
```

## Future Enhancements

- [ ] LaunchAgent for auto-start on login
- [ ] Code signing and notarization
- [ ] DMG installer
- [ ] Streaming audio for long texts
- [ ] Multiple voice selection
- [ ] Caching frequently used phrases
- [ ] Native MLX Swift bindings (when available)

## License

MIT License (see project root LICENSE)

## Acknowledgments

- [MLX](https://github.com/ml-explore/mlx) by Apple
- [SwiftNIO](https://github.com/apple/swift-nio) by Apple
- [Kokoro-82M](https://huggingface.co/prince-canuma/Kokoro-82M) TTS model
