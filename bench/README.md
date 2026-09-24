# Helper benchmark

`bench/run.mjs` measures the Natural TTS helper on the machine it runs on and writes `bench/results.json`.
`bench/chart.mjs` turns that file into `assets/diagrams/performance.mmd`, the README's performance chart. Every
performance number in the README comes from `results.json`; none is typed by hand.

## Reproduce

```bash
cd native-helper && swift build -c release && cd ..                 # the helper binary under test
native-helper/Scripts/setup-python-env.sh                          # once: the Python env and the pinned model
node bench/run.mjs --port 18249                                     # ~4 min on an M1 Max once the machine is idle
node bench/chart.mjs                                                # regenerates assets/diagrams/performance.mmd
node bench/chart.mjs --check                                        # exits 1 if the chart is stale
```

Node 22 or later; no dependencies. The benchmark launches **its own** helper on `--port` and stops it at the
end. It refuses a port that is already in use, so it can never measure, or disturb, a helper you are running.
It always passes `--port`, `--python` and `--worker`, which makes the helper neither read nor write the shared
`~/Library/Application Support/NaturalTTS/config.json`. By default it uses the release binary, the Python env and
the worker script inside this checkout; `--binary`, `--python` and `--worker` point it elsewhere (for example at
the env of another checkout).

Other options: `--voice af_heart`, `--speed 1.0`, `--runs 5`, `--cold-starts 3`, `--out <file>`.

**It waits for an idle machine.** Before the first launch it samples the GPU (`ioreg`, "Device Utilization %")
and the 1-minute load average once a second, and starts only after 10 consecutive seconds with the GPU at
≤ 15 % and load ≤ 12 (`--gpu-idle-max`, `--load-max`, `--gpu-idle-secs`). If that never happens within
`--wait` seconds (default 300) it runs anyway and writes `"clean": false`. `chart.mjs` refuses a result with
`"clean": false` unless you pass `--allow-contended`, and then the chart title says "busy machine". Anything that
shares the GPU or saturates the CPU (a game, a video export, another local model, a large build) slows synthesis
by up to half, so compare only clean runs.

## What it measures

| Field in `results.json` | Meaning |
|---|---|
| `startup.launch_to_ready_s` | From spawning the helper to the first `/health` that reports `status: "ok"` and `model_loaded: true`. It includes loading the model and the worker's warm-up generation. One value per cold start |
| `startup.first_speak_after_ready_s` | Wall time of the first `/speak` (the 15-word text) right after the helper is ready. Shows whether the first request still pays a cold penalty |
| `startup.launch_to_first_audio_s` | The two above added: how long after launch the first sentence of audio exists |
| `warm[].wall_s` | Client wall time of one `/speak`, from sending the request to having the whole WAV. Each text is spoken once untimed first, then `--runs` timed requests per text, round-robin across texts. Reported as median, min, max and every value |
| `warm[].audio_s` | Length of the audio, computed from the WAV header (data bytes ÷ (sample rate × channels × bytes per sample)); never hard-coded. `header_vs_wav_audio_s_max_diff` compares it with the helper's `X-Audio-Duration` header |
| `warm[].rtf` | Real-time factor: `audio_s ÷ wall_s` for the same request. 20× means 20 seconds of speech for each second of waiting. Median, min, max |
| `warm[].ttfb_s` | Time until the response headers arrive. It is within a few milliseconds of `wall_s` because the helper sends the WAV only when all of it exists |
| `warm[].server_generation_s` | The helper's own `X-Generation-Time`, for comparison with the client's view |
| `memory.worker_footprint_peak_mb` | Lifetime peak physical footprint of the Python worker (`footprint -p <pid>`, `phys_footprint_peak`) after every request of the last cold start. The Swift helper itself uses about 10 MB idle and is not included. `worker_footprint_after_ready_mb` is the peak after model load and warm-up, per cold start |
| `machine`, `software` | Chip, core counts, memory, macOS; helper version, git sha, whether `native-helper/` had uncommitted changes, sha256 of the binary and worker, Python, mlx, mlx-audio, model id and pinned revision, MLX cache limit |
| `conditions` | Voice, speed, run counts, the idle check and its samples, GPU utilisation during the run (this includes the benchmark's own work), load average at start and end |
| `clean` | `true` only if the idle check passed and the load average stayed at most 1.5 × `--load-max` at start and end |

The four texts are built from `native-helper/examples/sample-texts.json` exactly as the earlier baselines
(`docs/research/2026-09-upgrade/C2-helper-baseline.md`, `W2-integration-measurements.md`) built them, and the
script refuses to run if their lengths change:

| Id | Label | Words | Characters | Source in `sample-texts.json` |
|---|---|---|---|---|
| S15 | sentence | 15 | 123 | `medium[1]` |
| M60 | paragraph | 60 | 408 | `long[1]` + `medium[0]` |
| L400 | page | 407 | 2,644 | `long[0..2]` + `technical` + `storytelling` + `poetry` + `medium[0..2]` |
| X4985 | long article | 751 | 4,985 | every sample, repeated and cut to 4,985 characters (the helper's limit is 5,000) |

## Time to first audio

**Time to first audio currently equals the full synthesis time.** The helper does not stream: it generates the
whole WAV, then sends it, and the extension starts playback when the response is complete. So a sentence starts
playing after about half a second, but a 5,000-character selection makes you wait the whole of `wall_s` for
X4985 before you hear anything. `ttfb_s` in the results shows this directly. Streaming is planned; when it
lands, this benchmark will need a separate time-to-first-audio measurement.

## Caveats

- One machine, one voice (`af_heart`), speed 1.0×. Other voices use the same model; the worker's warm-up
  prepares both the American and the British pipeline before the helper reports ready.
- Kokoro's output is not bit-identical between runs, and the same text gives a different audio length in each
  voice (S15 is 9.00 s in `af_bella`, the voice of the earlier baselines, and 8.45 s in `af_heart`). The
  real-time factor always divides each request's own audio length by its own wall time.
- The chart shows the warm median only; min and max are in `results.json`.
