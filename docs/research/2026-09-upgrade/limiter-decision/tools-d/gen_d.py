"""Red-team corpus D: seed variance, article length, whole catalogue. Same call path as the worker's
generate_audio_mlx (normalize_text -> model.generate(voice_file, lang_code) -> concatenate chunks), with
normalization OFF; chunk boundaries kept. Writes /tmp/ntts-lim-d/raw/<tag>.npz and index.json."""
import json, os, sys, time, importlib.util
os.environ.setdefault("ESPEAK_DATA_PATH", "/opt/homebrew/opt/espeak-ng/share/espeak-ng-data")
os.environ["NTTS_LOUDNESS_NORMALIZE"] = "0"
import numpy as np
NH = "/Users/chrisren/Development/natural-text-to-voice-extension/native-helper"
sys.path.insert(0, NH + "/Scripts"); sys.path.insert(0, "/tmp/ntts-lim-d")
import verify_loudness as vl, texts
spec = importlib.util.spec_from_file_location("w", vl.DEFAULT_WORKER); w = importlib.util.module_from_spec(spec); spec.loader.exec_module(w)
import mlx.core as mx
from contextlib import redirect_stdout, redirect_stderr
assert w.load_mlx_model()
model = w.get_cached_model()
os.makedirs("/tmp/ntts-lim-d/raw", exist_ok=True)
IDX = "/tmp/ntts-lim-d/raw/index.json"
idx = json.load(open(IDX)) if os.path.exists(IDX) else {}

def synth(text, voice, seed):
    if seed is not None:
        mx.random.seed(seed)
    chunks = []
    with open(os.devnull, "w") as dn, redirect_stdout(dn), redirect_stderr(dn):
        for c in model.generate(w.normalize_text(text), voice=w.voice_file(voice), speed=1.0, lang_code=voice[0]):
            chunks.append(np.asarray(c.audio, dtype=np.float64).reshape(-1))
    w.release_mlx_cache()
    bounds = np.cumsum([0] + [len(c) for c in chunks])
    return np.concatenate(chunks), bounds

def rec(tag, text, voice, seed):
    if tag in idx: return
    t = time.time(); x, b = synth(text, voice, seed)
    lufs, _ = w.integrated_loudness(x); tp = w.true_peak_dbtp(x)
    y, rep = w.normalize_loudness(x); lo, _ = w.integrated_loudness(y)
    np.savez(f"/tmp/ntts-lim-d/raw/{tag}.npz", x=x, bounds=b)
    idx[tag] = dict(voice=voice, seed=seed, sec=round(len(x)/24000, 2), nchunks=len(b)-1, raw_lufs=round(lufs, 2),
                    raw_tp=round(tp, 2), B_gain=round(rep["gain_db"], 2), B_lufs=round(lo, 2), B_by=rep["limited_by"])
    print(tag, json.dumps(idx[tag]), f"{time.time()-t:.1f}s", flush=True)
    json.dump(idx, open(IDX, "w"), indent=1)

mode = sys.argv[1]
if mode == "determinism":
    for s in (1006, 1006):
        x, _ = synth(vl.TEXTS["medium"], "af_heart", s); print(s, len(x), float(np.abs(x).max()), float(x[:2000].sum()))
if mode == "seeds":
    for v in ("af_heart", "am_michael"):
        for L in ("medium", "long"):
            for s in range(2000, 2008):
                rec(f"seed-{v}-{L}-{s}", vl.TEXTS[L], v, s)
if mode == "length":
    for v in ("af_heart", "af_bella", "am_michael", "bf_emma", "bm_george"):
        rec(f"len2-{v}", texts.LONG2, v, 3000)
        rec(f"len5-{v}", texts.LONG5, v, 3001)
if mode == "catalogue":
    VOICES = [l.split("'")[1] for l in open("/Users/chrisren/Development/natural-text-to-voice-extension/chrome-extension/src/shared/voices.ts") if l.strip().startswith("voice('")]
    print(len(VOICES), VOICES, flush=True)
    for i, v in enumerate(VOICES):
        rec(f"cat-{v}-long", vl.TEXTS["long"], v, 4000 + i)
