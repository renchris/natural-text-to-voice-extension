#!/usr/bin/env python3
"""Kokoro runtime probe: 2 voices x 3 speeds x 5 texts straight through mlx-audio.

Mirrors tts_worker.py usage (load_model + model.generate(text, voice=, speed=)) and prints one JSON
document. The W1 gate (verify-python.sh) parses it and asserts summary.ok == 30, summary.any_nan is
false and summary.max_peak <= 0.98; the 0.5x / 2.0x duration ratio is expected in 3.5-4.0.

Usage (from native-helper/):
  Sources/NaturalTTSHelper/Resources/python-env/bin/python3 Scripts/kokoro_probe.py [MODEL_ID]
Offline by default (HF_HUB_OFFLINE=1); run setup-python-env.sh first to cache the model.
Source: /tmp/ntts-r10/kokoro_probe.py (docs/research/2026-09-upgrade/R10).
"""
import sys, time, json, os, traceback
os.environ.setdefault("HF_HUB_OFFLINE", "1")
# Same espeak-ng data the helper gives the worker (PythonWorker.swift sets ESPEAK_DATA_PATH).
os.environ.setdefault("ESPEAK_DATA_PATH", "/opt/homebrew/opt/espeak-ng/share/espeak-ng-data")
import numpy as np
# mlx-audio 0.5.5 print()s to stdout; keep stdout for the JSON document alone.
_json_out, sys.stdout = sys.stdout, sys.stderr
res = {"python": sys.version.split()[0]}
try:
    import mlx.core as mx
    import mlx_audio, importlib.metadata as md
    res["mlx"] = mx.__version__
    res["mlx_audio"] = md.version("mlx-audio")
    for p in ("transformers", "huggingface-hub", "misaki", "numpy", "spacy"):
        try: res[p] = md.version(p)
        except Exception: res[p] = None
    from mlx_audio.tts.utils import load_model
    t0 = time.time()
    model = load_model(sys.argv[1] if len(sys.argv) > 1 else "prince-canuma/Kokoro-82M")
    res["load_s"] = round(time.time() - t0, 2)
    texts = ["Hello there.", "Hello world.", "The cat sat.",
             "Voice synthesis on Apple Silicon is remarkably fast once the model is warm.",
             ("Natural text to speech reads selected passages aloud using a local model. " * 6).strip()]
    runs = []
    for voice in ("af_bella", "am_adam"):
        for speed in (0.5, 1.0, 2.0):
            for txt in texts:
                r = {"voice": voice, "speed": speed, "chars": len(txt)}
                try:
                    t0 = time.time()
                    chunks = [np.array(x.audio) for x in model.generate(txt, voice=voice, speed=speed)]
                    a = np.concatenate([c.reshape(-1) for c in chunks]) if chunks else np.zeros(0)
                    r.update(ok=True, secs=round(len(a) / 24000, 3), nan=int(np.isnan(a).sum()),
                             peak=float(np.nanmax(np.abs(a))) if a.size else 0.0, gen_s=round(time.time() - t0, 3))
                except Exception as e:
                    r.update(ok=False, err=f"{type(e).__name__}: {str(e)[:160]}")
                runs.append(r)
    res["runs"] = runs
    ok = [r for r in runs if r.get("ok")]
    res["summary"] = {"total": len(runs), "ok": len(ok), "any_nan": any(r["nan"] for r in ok),
                      "max_peak": max((r["peak"] for r in ok), default=None)}
    # speed check: duration ratio for the long text at 0.5 vs 2.0 for af_bella
    def dur(v, s): 
        m = [r for r in ok if r["voice"] == v and r["speed"] == s and r["chars"] == len(texts[-1])]
        return m[0]["secs"] if m else None
    res["speed_ratio_0.5_over_2.0"] = (dur("af_bella", 0.5) / dur("af_bella", 2.0)) if dur("af_bella", 0.5) and dur("af_bella", 2.0) else None
    import resource
    res["maxrss_MB"] = round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1e6, 1)
except Exception as e:
    res["fatal"] = f"{type(e).__name__}: {e}"
    res["tb"] = traceback.format_exc()[-1500:]
print(json.dumps(res, indent=1), file=_json_out)
sys.exit(1 if "fatal" in res else 0)
