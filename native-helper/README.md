# Natural TTS Helper

**The macOS helper behind Natural TTS: Private Kokoro Voices for Mac. It runs Kokoro-82M on the Apple GPU with
MLX and serves speech to the Chrome extension over HTTP on 127.0.0.1.**

---

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Prerequisites](#prerequisites)
- [Build Instructions](#build-instructions)
- [API Documentation](#api-documentation)
- [Testing & Validation](#testing--validation)
- [Performance](#performance)
- [Configuration](#configuration)
- [Development](#development)
- [Troubleshooting](#troubleshooting)
- [FAQ](#faq)
- [Future Enhancements](#future-enhancements)

---

## Overview

A Swift command-line app (SwiftNIO) listens on `127.0.0.1`, port 8249 or the next free port up to 8260. It starts
a Python 3.12 worker that runs Kokoro-82M through mlx-audio 0.5.5 on MLX 0.32.2, and the two exchange
length-prefixed JSON frames over the worker's stdin and stdout. The Chrome extension calls `/health`, `/voices`
and `/speak`; the helper answers `/speak` with a WAV.

**Architecture**:
- **Swift HTTP server** (SwiftNIO) on `127.0.0.1:8249` (falling back through 8260). It refuses any request
  whose `Host` is not loopback, and web-page `Origin`s on `/speak` and `/voices`
- **Python worker** (`Sources/NaturalTTSHelper/Resources/tts_worker.py`): Kokoro-82M, 28 English voices,
  offline (`HF_HUB_OFFLINE=1`), weights pinned to one Hugging Face revision
- **Framing**: a 4-byte little-endian length, then JSON, in each direction
- **Supervision**: a worker that exits is restarted, up to 3 times in 2 minutes

**Performance** (M1 Max, helper 1.5.0, GPU otherwise idle): ~26.5× faster than real time at every text length,
0.35 s for the first request, 1.95 s from launch to ready. See [Performance](#performance).

<!-- Diagram source: assets/diagrams/architecture.mmd. Edit it, run `bun run diagrams` at the repo root, commit the SVGs. -->
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../assets/diagrams/architecture-dark.svg">
  <img src="../assets/diagrams/architecture-light.svg" alt="Everything is inside your Mac. In Chrome, the popup and the service worker. The service worker hands text to an offscreen document, or, when the helper is not running, speaks it with a chrome.tts system voice. The popup and the offscreen document call the Natural TTS helper over HTTP on 127.0.0.1:8249 only. On the Mac, the Swift helper checks the Host and Origin headers and passes the request as JSON frames over stdio to a Python worker running Kokoro-82M with mlx-audio, on the Apple GPU through MLX and Metal, offline.">
</picture>

---

## Quick Start

Get up and running in 5 minutes:

```bash
# 1. Install uv (builds the locked Python env) and espeak-ng (phoneme data)
brew install uv espeak-ng

# 2. Clone the repository
git clone https://github.com/renchris/natural-text-to-voice-extension.git
cd natural-text-to-voice-extension/native-helper

# 3. Build the locked Python environment, fetch the model once, verify the worker
./Scripts/setup-python-env.sh

# 4. Build release binary
swift build -c release

# 5. Run helper
.build/release/natural-tts-helper
```

**Expected output** (abridged; timestamps and the `com.naturaltts.helper` labels trimmed):
```
info: Natural TTS Helper 1.5.0 (API 2) starting...
info: Starting Python MLX worker...
info: Waiting for Kokoro model to warm up...
info: [worker] [INFO] MLX buffer cache limit: 256 MB
info: [worker] [INFO] Eagerly loading Kokoro weights at startup (revision e02c9ea)...
info: [worker] [INFO] Warming up (one short generation per English pipeline)...
info: Kokoro model loaded and ready
info: ================================
info: Natural TTS Helper is ready!
info: Listening on: http://127.0.0.1:8249
info: Model: Kokoro-82M (MLX Metal)
info: ================================
```

**Test it**:
```bash
# 8249 unless it was taken; the "Listening on" line says which port
curl -X POST http://127.0.0.1:8249/speak \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello from Metal GPU!"}' \
  --output test.wav && afplay test.wav
```

Step 3 is the only step that needs the network: ~0.65 GB for the Python environment plus a ~0.36 GB
Kokoro-82M download. After that the helper runs offline (the worker sets `HF_HUB_OFFLINE=1`).

`Scripts/quickstart.sh` does steps 1-5 for you and runs the helper in a background tmux session; with Homebrew,
`brew install renchris/tap/natural-tts && brew services start natural-tts` does the same as a login service
(the tap is published together with the store listing).

---

## Prerequisites

### Required

- **macOS 14+** (Sonoma or later) on **Apple silicon** (M1 or later). Current MLX ships macOS 14+ wheels only
- **Xcode Command Line Tools** with a Swift 6.0+ toolchain (Xcode 16.2 or later): `xcode-select --install`
- **uv** 0.11.28 or later. It installs and pins **Python 3.12** itself, so no system Python is needed
- **espeak-ng** (phoneme data for Kokoro)
  ```bash
  brew install uv espeak-ng
  ```

### Optional

- **tmux** and **jq**, which `Scripts/quickstart.sh` uses (it installs both with Homebrew if they are missing)

### Why espeak-ng?

Kokoro's text-to-phoneme step (misaki) falls back to espeak-ng for words outside its dictionary. The Python
environment includes `phonemizer-fork` and `espeakng-loader`, which bundles its own espeak-ng library and data;
both install paths (the Homebrew formula and `quickstart.sh`) also install Homebrew's `espeak-ng`. Whether the
bundled copy alone is enough has not been tested on a clean machine, so keep the Homebrew package.

```bash
brew install espeak-ng
espeak-ng --version
```

---

## Build Instructions

### 1. Setup Python Environment

```bash
cd native-helper
./Scripts/setup-python-env.sh
```

This syncs the hash-locked uv project in `python/` (`pyproject.toml` + `uv.lock`) into
`Sources/NaturalTTSHelper/Resources/python-env/` (~0.65 GB, Python 3.12, no torch). It then pre-fetches
Kokoro-82M (~0.36 GB, into `~/.cache/huggingface/hub/`) and runs `Scripts/verify_worker.py` end to end. Key pins:
- `mlx==0.32.2` (Apple Metal ML framework)
- `mlx-audio==0.5.5` (Kokoro TTS implementation)
- `misaki==0.9.4` + `spacy==3.8.16` + `en_core_web_sm` 3.8.0 (G2P)
- `phonemizer-fork==3.3.2` + `espeakng-loader==0.2.4` (espeak-ng interface)

A pre-1.5 (pip-built) environment is moved once to `native-helper/.python-env.pre-1.5` as the rollback; pass
`--force` to replace it without a copy. Re-running the script is safe.

### 2. Build Swift Package

```bash
swift build -c release
```

The binary will be at: `.build/release/natural-tts-helper`

### 3. Run Helper

```bash
.build/release/natural-tts-helper
```

**Startup** (~2 s on an M1 Max): loads the cached model and runs one warm-up sentence, so the first request
is as fast as later ones. Nothing is downloaded at run time; if the model is missing, the worker exits at
startup with a hint to re-run `Scripts/setup-python-env.sh`.

---

## API Documentation

The helper exposes three HTTP endpoints on `http://127.0.0.1:<port>`, where the port is 8249 unless it was taken
(then the next free one up to 8260).

**Request checks**, applied before the body is read:
- **Host**: must be `127.0.0.1:<port>`, `localhost:<port>` or `[::1]:<port>`, otherwise 403 `bad_host`. This
  stops DNS-rebinding pages.
- **Origin**: on `/speak` and `/voices`, a web-page `Origin` gets 403 `forbidden`. Extension origins
  (`chrome-extension://…`) are allowed and get CORS headers. A request with no `Origin` (curl, local tools) is
  allowed. `/health` answers any origin, so the extension can probe ports.
- **Size**: request bodies are capped at 1 MiB.

### GET /health

Health check and model status. Always `200 OK`; read `status`.

**Response**:
```json
{
  "status": "ok",
  "model": "kokoro-82m",
  "model_loaded": true,
  "uptime_seconds": 123.4,
  "requests_served": 42,
  "version": "1.5.0",
  "apiVersion": 2
}
```

**`status`**:
- `ok`: the model is loaded and the worker is ready
- `warming`: the worker is (re)starting. At launch the helper binds its port only after the warm-up, so this
  appears only while a crashed worker restarts
- `error`: the worker exited more than 3 times in 2 minutes and the helper stopped restarting it; restart the
  helper

`apiVersion` 2 marks a 1.5 helper; the extension asks older helpers to update.

---

### POST /speak

Generate TTS audio.

**Request**:
```json
{
  "text": "Hello from Metal GPU!",
  "voice": "af_heart",  // optional; default: config.json's default_voice, af_heart for new installs
  "speed": 1.0          // optional, 0.25-4.0 (the extension sends 0.5-2.0), default: 1.0
}
```

`text` is at most 5,000 characters. A voice outside the 28 below gets 400 `unknown_voice`.

**Available Voices** (the same 28 in `GET /voices`, best-graded first in each group, grades from Kokoro's
[VOICES.md](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md)):

| Group | Voices |
|---|---|
| American female (11) | `af_heart` (A, the default), `af_bella`, `af_nicole`, `af_aoede`, `af_kore`, `af_sarah`, `af_alloy`, `af_nova`, `af_sky`, `af_jessica`, `af_river` |
| American male (9) | `am_fenrir`, `am_michael`, `am_puck`, `am_echo`, `am_eric`, `am_liam`, `am_onyx`, `am_santa`, `am_adam` |
| British female (4) | `bf_emma`, `bf_isabella`, `bf_alice`, `bf_lily` |
| British male (4) | `bm_fable`, `bm_george`, `bm_lewis`, `bm_daniel` |

`a*` voices use American pronunciation (`lang_code a`), `b*` voices British (`lang_code b`). Both pipelines are
warmed at startup, so the first British request is as fast as later ones.

**Response Headers**:
- `Content-Type: audio/wav`
- `X-Audio-Duration: 5.275` (seconds of audio generated)
- `X-Generation-Time: 0.399` (seconds the worker took)
- `X-Real-Time-Factor: 13.2` (audio duration / generation time; excludes HTTP overhead)

**Response Body**: Binary WAV audio
- Format: WAV, 16-bit PCM, mono
- Sample rate: 24 kHz, so 48,000 bytes per second of audio plus a 44-byte header (a 9 s clip is 432,044 bytes)

**Status Codes**:
- `200 OK`: Audio generated successfully
- `400 Bad Request`: the request is at fault; a different request succeeds. `error` is one of
  `bad_request` (invalid JSON or missing `text`), `empty_text` (nothing speakable), `text_too_long`
  (over 5,000 characters or 100,000 bytes), `audio_too_long` (over 20 minutes of speech),
  `invalid_speed` (not a number from 0.25 to 4.0) or `unknown_voice`
- `503 Service Unavailable`: the speech engine is down or still warming up (`process_not_running`,
  `warmup_timeout`, `too_many_restarts`); `retry_after_seconds` is 5
- `500 Internal Server Error`: synthesis failed on the helper's side (`nan_audio`, `empty_audio`,
  `internal_error`, `invalid_response`)

Every error is JSON, `{"error": "<code>", "message": "..."}`, and never quotes the request text.

**Example**:
```bash
curl -X POST http://127.0.0.1:8249/speak \
  -H "Content-Type: application/json" \
  -d '{"text":"This is a test of Metal GPU acceleration","voice":"af_bella","speed":1.0}' \
  --output test.wav
```

---

### GET /voices

List available voices.

**Response** (28 entries; the first two shown):
```json
{
  "voices": [
    {"id": "af_heart", "name": "Heart (US)", "language": "en-US", "accent": "American", "gender": "female", "grade": "A"},
    {"id": "af_bella", "name": "Bella (US)", "language": "en-US", "accent": "American", "gender": "female", "grade": "A-"}
  ]
}
```

**Status Codes**:
- `200 OK`: Voice list returned

---

## Testing & Validation

### Quick Health Check

```bash
PORT=8249   # or the port in the "Listening on" log line
curl -s http://127.0.0.1:$PORT/health | jq
# "status": "ok", "model_loaded": true, "version": "1.5.0", "apiVersion": 2
```

---

### Test Speech Generation

```bash
curl -X POST http://127.0.0.1:$PORT/speak \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello world"}' \
  --output test.wav && afplay test.wav
```

---

### Timing a few requests

The helper reports its own numbers in response headers, so there is nothing to hard-code:

```bash
for i in 1 2 3; do
  curl -s -o /dev/null -D - -X POST "http://127.0.0.1:$PORT/speak" \
    -H 'Content-Type: application/json' \
    -d '{"text":"The quick brown fox jumps over the lazy dog, then naps in the afternoon sun.","voice":"af_heart"}' \
    | grep -i '^x-' | tr -d '\r' | paste -sd' ' -
done
```

Each line prints `X-Audio-Duration`, `X-Generation-Time` and `X-Real-Time-Factor`. Expect about 26× on an idle
M1-class GPU; anything else using the GPU lowers it. (`Scripts/test-performance-short.sh` and
`test-performance-long.sh` predate these headers and compute the factor from hard-coded audio durations: do not
use their "RTF" lines.)

### The full verification gate

`scripts/verify-all.sh` at the repository root is the fail-closed gate for a release: it builds the helper,
starts it on a private port with `--port/--python/--worker` (so it never touches port 8249 or `config.json`),
and checks the API, the voices, the error codes, long tokens, memory, a clean SIGTERM and the extension.
`Scripts/verify-python.sh` and `Scripts/verify_worker.py` check the Python environment alone.

---

### Audio Quality Validation

```bash
file test.wav
# RIFF (little-endian) data, WAVE audio, Microsoft PCM, 16 bit, mono 24000 Hz
afplay test.wav
```

The 2025 benchmark reports are kept as history: [TEST_RESULTS_OPTIMIZED.md](TEST_RESULTS_OPTIMIZED.md) and the
two before it. Their "25x" long-text figure was not a measurement; see [docs/history.md](../docs/history.md).

---

## Performance

### Measured Results (helper 1.5.0, Apple M1 Max, macOS 15.7.9)

Measured 2026-09-23 with `curl` on an otherwise idle GPU, voice `af_bella`, speed 1.0; real-time factor = audio
seconds ÷ client wall time. Full method and raw numbers:
[W2-integration-measurements.md](../docs/research/2026-09-upgrade/W2-integration-measurements.md).

| Text | Audio | Warm request (median) | Faster than real time |
|---|---:|---:|---:|
| 15 words | 9.0 s | 0.34 s | 26.6× |
| 60 words | 29.0 s | 1.11 s | 26.2× |
| 407 words | 171.5 s | 6.47 s | 26.5× |
| 751 words (4,985 characters) | 325.2 s | 12.2 s | 26.6× |

| Startup and memory | Value |
|---|---|
| Launch to ready (includes the warm-up generation) | 1.95 s |
| First `/speak` after launch (15 words) | 0.35 s |
| `/health` during a long `/speak` | under 1 ms |
| Worker memory between requests | 0.6-0.7 GB |
| Worker memory peak, 5,000-character request | ~3.6 GB (MLX buffer cache capped at 256 MB; `NTTS_MLX_CACHE_LIMIT_MB`) |
| Swift process | ~10 MB idle, ~140 MB peak |
| Python environment on disk | 655 MB (89 packages) |
| Model (Hugging Face cache) | 349 MB |

**Time to first audio** equals the whole synthesis time: the helper returns the complete WAV, so a long selection
starts playing when all of it is ready.

### Real-Time Factor (RTF) Explained

**RTF = Audio Duration / Generation Time**. 1.0× generates audio as fast as it plays; 26× generates 26 seconds
of audio per second of work. `X-Real-Time-Factor` reports it per request, measured inside the helper.

### How it got here

The November 2025 helper went from 0.62× (crashing on the second request) to ~1× (stdout kept off the JSON pipe)
to ~8× (model cached across requests, WAV built in memory). The 1.5.0 rebuild on the locked mlx 0.32.2 stack,
with an eager warm-up, took it to ~26×. The story and the three reports: [docs/history.md](../docs/history.md).

---

## Configuration

A source install reads and writes `~/Library/Application Support/NaturalTTS/config.json`:

```json
{
  "port": 8249,
  "python_path": "/path/to/native-helper/Sources/NaturalTTSHelper/Resources/python-env/bin/python3",
  "worker_script_path": "/path/to/native-helper/Sources/NaturalTTSHelper/Resources/tts_worker.py",
  "default_voice": "af_heart"
}
```

**Fields**:
- `port`: 8249 on first run. If it is taken at launch, the helper scans 8249-8260, uses the first free port and
  saves it
- `python_path`, `worker_script_path`: resolved on first run
- `default_voice`: used when a request names no voice. New configs get `af_heart`; an existing value is kept

A `secret` field written by helpers before 1.5 was never checked; it is ignored and dropped on the next save.

**Overrides**, which are never saved: `--port`, `--python`, `--worker` (or `NATURAL_TTS_PORT`,
`NATURAL_TTS_PYTHON`, `NATURAL_TTS_WORKER`; flags win). With any override the helper does not write the shared
`config.json`, and without `NATURAL_TTS_CONFIG_DIR` it does not read it either. An explicit port that is taken
is an error, never a silent fallback. The Homebrew service uses these overrides and keeps its own config in
`$(brew --prefix)/var/natural-tts`.

**Discovery.** The extension cannot read files. It probes `GET /health` on 127.0.0.1 ports 8249-8260, starting
from the port it last found, and uses the first that identifies as the helper.

---

## Development

### Directory Structure

```
native-helper/
├── Package.swift                 # SwiftPM manifest (macOS 14+, Swift 6.0 toolchain)
├── Package.resolved              # pinned swift-nio 2.97.1, swift-log 1.8.0
├── python/
│   ├── pyproject.toml            # the worker's Python project (Python 3.12)
│   └── uv.lock                   # hash-locked dependencies
├── Sources/
│   └── NaturalTTSHelper/
│       ├── App.swift             # entry point (@main): config, port, worker, server
│       ├── Config.swift          # config.json, launch overrides, port selection
│       ├── HTTPServer.swift      # SwiftNIO server, Host/Origin checks, endpoints
│       ├── PythonWorker.swift    # worker process, framing, restarts, cancellation
│       ├── Models.swift          # request/response types, the 28-voice catalogue
│       ├── Shutdown.swift        # SIGTERM/SIGINT handling
│       └── Resources/
│           ├── tts_worker.py     # the Python worker
│           └── python-env/       # built by setup-python-env.sh (gitignored)
├── Scripts/                      # setup, quickstart, status/logs/teardown, verification
└── examples/sample-texts.json
```

### Key Files

**`Resources/tts_worker.py`**: loads the pinned Kokoro revision offline, warms both English pipelines, normalises
text (punctuation kept; long numbers and tokens split so they are spoken whole), generates every chunk of a
multi-sentence text, and writes a WAV back in one frame.

**`HTTPServer.swift`**: the three endpoints, the Host and Origin gates, and error codes.

**`PythonWorker.swift`**: spawns the worker, frames requests, forwards the worker's own log lines (the
`[worker] ` prefix) with sensitive tokens redacted, cancels a request whose client went away, and restarts a
crashed worker (at most 3 times in 2 minutes).

### Debugging

The log level is set in `App.swift` (`handler.logLevel = .info`). Set it to `.debug` to also see per-request
lines ("Generating audio: … characters") and any output on the worker's stderr that did not come from its own
logger. At `.info` the log never carries the request text; at `.debug` that unprefixed library output can (for
example mlx-audio's phoneme dump of a long token), so keep `.debug` for local debugging only.

### Iterating on the worker

1. Edit `Sources/NaturalTTSHelper/Resources/tts_worker.py`
2. Restart the helper; the model is already cached, so startup takes about 2 s
3. `Sources/NaturalTTSHelper/Resources/python-env/bin/python3 Scripts/verify_worker.py` (from `native-helper/`)
   exercises the worker without the Swift side

### Testing Changes

```bash
# Debug build (faster compilation, slower runtime)
swift build
.build/debug/natural-tts-helper --port 18249   # a private port: leaves 8249 and config.json alone

# Release build
swift build -c release
```

---

## Troubleshooting

### The helper exits at startup: "model is missing" or an import error

The worker loads the model offline and fails at launch, not on the first request, if the environment or the model
is missing. Re-run:

```bash
cd native-helper
./Scripts/setup-python-env.sh
```

It rebuilds the environment from `uv.lock`, fetches the model once, and runs `verify_worker.py`.

---

### "Model warmup timed out after 60s"

The worker did not report ready within 60 s. On a busy GPU the warm-up is slower (it took 26 s on a contended
M1 Max against 2 s idle); a timeout usually means the worker is stuck or crashed. Check the `[worker]` lines
above the error, then run `./Scripts/setup-python-env.sh` to rebuild and verify the environment.

---

### "All ports 8249..8260 are in use"

Twelve other processes, or old helper copies, hold the range:

```bash
lsof -nP -iTCP -sTCP:LISTEN | grep -E ':82(49|5[0-9]|60) '
```

Stop the ones you do not need. A second copy of the helper is the usual cause: `./Scripts/teardown.sh` stops the
tmux one, `brew services stop natural-tts` the Homebrew one.

---

### "Port … is in use and was set explicitly"

You passed `--port` (or `NATURAL_TTS_PORT`) and that port is taken. Explicit ports never fall back; pick
another.

---

### `/health` says `"status": "error"`

The worker crashed more than 3 times in 2 minutes and the helper stopped restarting it. Restart the helper; if it
happens again, the log above says why (often memory pressure on a very long request).

---

### Slow speech

1. **Release build**: `swift build -c release` (the worker does the heavy work, but debug builds add overhead)
2. **The GPU is shared**: other MLX, video or game workloads slow generation; watch GPU History in Activity Monitor
3. **Long text**: the whole WAV is generated before playback starts, so 400 words take ~6.5 s before any audio

---

### Audio is choppy or corrupted

```bash
file test.wav
# RIFF (little-endian) data, WAVE audio, Microsoft PCM, 16 bit, mono 24000 Hz
```

If the file is not a WAV, it is a JSON error body: `cat test.wav` shows the `error` code.

---

## FAQ

### Q: What models are supported?

**A**: Kokoro-82M only, through mlx-audio, pinned to one revision of `prince-canuma/Kokoro-82M`.

---

### Q: Can I run this on an Intel Mac?

**A**: No. MLX needs Apple silicon, and the current MLX needs macOS 14 or later.

---

### Q: How much disk space is needed?

**A**: About 1 GB: the Python environment (655 MB) and the model (349 MB), plus ~0.3 GB for a release build
(`.build`).

---

### Q: Can I use a different voice?

**A**: Pick one in the extension, or name it in a request:

```bash
curl -s http://127.0.0.1:8249/voices | jq '.voices[].id'
curl -X POST http://127.0.0.1:8249/speak \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello","voice":"bf_emma"}' \
  --output test.wav
```

---

### Q: How do I update?

**A**: Homebrew: `brew upgrade natural-tts && brew services restart natural-tts`. From source, in your checkout:

```bash
git pull && native-helper/Scripts/quickstart.sh
```

It rebuilds the environment and the binary and restarts the helper in its tmux session.

---

### Q: Can I change the default voice?

**A**: The extension always names a voice, so set it in the extension's Options. For other clients, edit
`default_voice` in `config.json` and restart the helper.

---

### Q: Why was the first request slow in older versions?

**A**: Before 1.5 the model loaded on the first request (3-5 s). The 1.5 helper loads it and runs a warm-up
sentence before it reports ready, so the first request takes the same ~0.35 s as later ones.

---

### Q: How do I uninstall?

**A**: Homebrew: `brew services stop natural-tts && brew uninstall natural-tts` (the model is inside the keg).
From source:

```bash
native-helper/Scripts/teardown.sh
rm ~/Library/Application\ Support/NaturalTTS/config.json
rm -rf ~/.cache/huggingface/hub/models--prince-canuma--Kokoro-82M   # the model, 349 MB
rm -rf natural-text-to-voice-extension
```

---

## Future Enhancements

- [ ] Streaming audio, so long selections start playing before synthesis finishes
- [ ] A signed, notarized binary (today the helper is built from source, by Homebrew or `quickstart.sh`)
- [ ] Non-English voices, once text normalisation stops folding to ASCII

---

## License

MIT License. See [LICENSE](../LICENSE). The helper's dependencies and their licenses, including the GPL/LGPL
components installed into your own environment (espeak-ng, phonemizer-fork, num2words, libsndfile), are listed in
[THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).

---

## Acknowledgments

- [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) by hexgrad (Apache-2.0), in the MLX conversion
  [prince-canuma/Kokoro-82M](https://huggingface.co/prince-canuma/Kokoro-82M)
- [mlx-audio](https://github.com/Blaizzy/mlx-audio) and [MLX](https://github.com/ml-explore/mlx) by Apple — Kokoro on the Apple GPU
- [SwiftNIO](https://github.com/apple/swift-nio) by Apple — asynchronous networking
- [misaki](https://github.com/hexgrad/misaki) and [espeak-ng](https://github.com/espeak-ng/espeak-ng) — text to phonemes

---

**Version**: 1.5.0
