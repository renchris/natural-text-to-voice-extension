"""Score raw + every variant: ffmpeg ebur128 (independent meter), log-mel L1 vs raw after loudness matching
(ref_compare.py's gated 128-mel metric: mean over the file and p99 over frames), crest factor, PLR, and
parakeet-cli WER vs the source text (asr2.py's normalisation)."""
import json, math, os, re, subprocess, sys
import numpy as np, soundfile as sf
NH = "/Users/chrisren/Development/natural-text-to-voice-extension/native-helper"
sys.path.insert(0, NH + "/Scripts")
import ref_compare as rc, verify_loudness as vl
from asr2 import norm
MODEL = "/Users/chrisren/Development/wcpp191/models/ggml-parakeet-tdt-0.6b-v3-f16.bin"
idx = json.load(open("/tmp/ntts-lim-a/raw/index.json"))
lim = json.load(open("/tmp/ntts-lim-a/out/lim.json"))

def wer(ref, hyp):
    r, h = norm(ref), norm(hyp)
    d = list(range(len(h) + 1))
    for i in range(1, len(r) + 1):
        prev, d[0] = d[0], i
        for j in range(1, len(h) + 1):
            cur = min(d[j] + 1, d[j - 1] + 1, prev + (r[i - 1] != h[j - 1]))
            prev, d[j] = d[j], cur
    return d[len(h)] / len(r), d[len(h)]

def asr(path):
    p16 = path.replace(".wav", ".16k.wav")
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", path, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", p16], check=True, timeout=60)
    out = subprocess.run(["parakeet-cli", "-m", MODEL, "-np", p16], capture_output=True, text=True, timeout=120).stdout.strip()
    os.remove(p16)
    return out

def frames_l1(y, ref):
    n = min(len(y), len(ref))
    a, b = rc.logmel_gate(y[:n]), rc.logmel_gate(ref[:n])
    per = np.mean(np.abs(a - b), axis=0)
    return float(np.mean(per)), float(np.percentile(per, 99))

rows = {}
for case, meta in idx.items():
    raw, _ = sf.read(meta["path"], dtype="float64")
    raw_l, raw_tp = vl.ffmpeg_ebur128("ffmpeg", meta["path"])
    items = [("raw", meta["path"], {})] + [(k.split("|")[1], v["path"], v) for k, v in lim.items() if k.split("|")[0] == case]
    for name, path, info in items:
        y, _ = sf.read(path, dtype="float64")
        lufs, tp = vl.ffmpeg_ebur128("ffmpeg", path)
        ym = y * 10 ** ((raw_l - lufs) / 20)  # loudness-matched to raw
        l1, l1p99 = frames_l1(ym, raw)
        rms = math.sqrt(float(np.mean(y ** 2)))
        crest = 20 * math.log10(float(np.max(np.abs(y))) / rms)
        hyp = asr(path)
        wr, errs = wer(meta["text"], hyp)
        row = dict(case=case, variant=name, lufs_ff=lufs, tp_ff=tp, lufs_own=info.get("lufs"), tp_own=info.get("tp"),
                   static_gain_db=info.get("static_gain_db"), cap_bound=info.get("cap_bound"), max_gr_db=info.get("max_gr_db", 0.0),
                   mean_gr_db=info.get("mean_gr_db", 0.0), pct_gr_gt1db=info.get("pct_gr_gt1db", 0.0),
                   logmel_l1=round(l1, 4), logmel_l1_p99=round(l1p99, 4), crest_db=round(crest, 2), plr_db=round(tp - lufs, 2),
                   wer=round(wr, 4), word_errors=errs, hyp=hyp)
        rows[f"{case}|{name}"] = row
        print(json.dumps({k: v for k, v in row.items() if k != "hyp"}), flush=True)
json.dump(rows, open("/tmp/ntts-lim-a/out/score.json", "w"), indent=1)
