"""Regenerate the W2 §10 corpus UN-normalized: same voices, texts, seeds (1000+i) and call path as
native-helper/Scripts/verify_loudness.py model_phase, with NTTS_LOUDNESS_NORMALIZE off."""
import base64, io, json, os, sys, importlib.util
os.environ.setdefault("ESPEAK_DATA_PATH", "/opt/homebrew/opt/espeak-ng/share/espeak-ng-data")
os.environ["NTTS_LOUDNESS_NORMALIZE"] = "0"
import numpy as np, soundfile as sf
NH = "/Users/chrisren/Development/natural-text-to-voice-extension/native-helper"
sys.path.insert(0, NH + "/Scripts")
import verify_loudness as vl
spec = importlib.util.spec_from_file_location("w", vl.DEFAULT_WORKER); w = importlib.util.module_from_spec(spec); spec.loader.exec_module(w)
import mlx.core as mx
assert w.load_mlx_model()
w.LOUDNESS_NORMALIZE = False
out = {}
for seed, (voice, (length, text)) in enumerate((v, t) for v in vl.VOICES for t in vl.TEXTS.items()):
    mx.random.seed(1000 + seed)
    r = w.generate_audio_mlx(text, voice, 1.0)
    x, sr = sf.read(io.BytesIO(base64.b64decode(r["audio_base64"])), dtype="float64")
    assert sr == 24000
    p = f"/tmp/ntts-lim-a/raw/{voice}-{length}.wav"
    sf.write(p, x, sr, subtype="PCM_16")
    lufs, _ = w.integrated_loudness(x); tp = w.true_peak_dbtp(x)
    out[f"{voice}/{length}"] = dict(text=text, path=p, lufs=round(lufs, 2), tp=round(tp, 2), sec=round(len(x)/sr, 2))
    print(f"{voice}/{length} {len(x)/sr:.2f}s {lufs:.2f} LUFS {tp:.2f} dBTP", flush=True)
json.dump(out, open("/tmp/ntts-lim-a/raw/index.json", "w"), indent=1)
