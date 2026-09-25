"""Apply A's limiter (tools/lim.py, unchanged gain-curve code) at -16 and -18 LUFS targets to the D corpus.
Adds: GR events per minute, wall time per case, per-chunk single-gain (no limiter), -0.5 dBTP ceiling (gain only)."""
import json, math, os, sys, time, importlib.util
import numpy as np
A = "/Users/chrisren/Development/natural-text-to-voice-extension/docs/research/2026-09-upgrade/limiter-decision/tools"
NH = "/Users/chrisren/Development/natural-text-to-voice-extension/native-helper"
sys.path.insert(0, A); sys.path.insert(0, NH + "/Scripts")
import lim  # A's module: loads the worker as lim.w
import ref_compare as rc
w = lim.w
SR, CEIL, MAXG = 24000, -1.5, 24.0

def run(x, target, cap_db, release_ms):
    """lim.run with the target as a parameter; also returns the gain curve."""
    lufs_in, _ = w.integrated_loudness(x); tp_in = w.true_peak_dbtp(x)
    G = min(target - lufs_in, MAXG)
    gmax = MAXG if cap_db is None else CEIL + cap_db - tp_in
    floor = 10 ** (-(cap_db if cap_db is not None else 60) / 20)
    ceil = CEIL - 0.05
    for it in range(12):
        G = min(G, gmax)
        y0 = x * 10 ** (G / 20)
        g = lim.limiter_gain(y0, ceil, release_ms, floor)
        y = y0 * g
        tp = w.true_peak_dbtp(y)
        if tp > CEIL:
            over = tp - CEIL + 0.02; ceil -= over
            if cap_db is not None: gmax -= over
            continue
        lufs = w.integrated_loudness(y)[0]
        if abs(lufs - target) <= 0.05 or (G >= gmax - 1e-9 and lufs < target): break
        G += target - lufs
    return y, g, it + 1

def events(gr, thr):
    on = gr > thr
    return int(np.count_nonzero(on[1:] & ~on[:-1]) + int(on[0]))

def l1(y, x):
    lx = w.integrated_loudness(x)[0]; ly = w.integrated_loudness(y)[0]
    ym = y * 10 ** ((lx - ly) / 20)
    a, b = rc.logmel_gate(ym), rc.logmel_gate(x)
    per = np.mean(np.abs(a - b), axis=0)
    return round(float(np.mean(per)), 4), round(float(np.percentile(per, 99)), 3)

def perchunk(x, bounds, target=-16.0):
    ys, gains = [], []
    for a, b in zip(bounds[:-1], bounds[1:]):
        yc, rep = w.normalize_loudness(x[a:b]); ys.append(yc); gains.append(rep["gain_db"])
    return np.concatenate(ys), gains

idx = json.load(open("/tmp/ntts-lim-d/raw/index.json"))
OUT = "/tmp/ntts-lim-d/lim_d.json"
res = json.load(open(OUT)) if os.path.exists(OUT) else {}
sel = sys.argv[1]
VARS = [("L1-60@-16", -16.0, None, 60), ("L2-60@-16", -16.0, 6.0, 60), ("L3-60@-18", -18.0, 3.0, 60), ("L2-60@-18", -18.0, 6.0, 60)]
for tag, meta in idx.items():
    if not tag.startswith(sel) or tag in res: continue
    d = np.load(f"/tmp/ntts-lim-d/raw/{tag}.npz"); x, bounds = d["x"], d["bounds"]
    mins = len(x) / SR / 60
    r = dict(sec=meta["sec"], B_lufs=meta["B_lufs"], raw_tp=meta["raw_tp"], raw_lufs=meta["raw_lufs"])
    # gain-only at a -0.5 dBTP ceiling
    r["B@-0.5dBTP_lufs"] = round(min(-16.0, meta["raw_lufs"] + min(-16.0 - meta["raw_lufs"], -0.5 - meta["raw_tp"])), 2)
    if meta["nchunks"] > 1:
        yc, gains = perchunk(x, bounds)
        r["perchunk"] = dict(lufs=round(w.integrated_loudness(yc)[0], 2), gains=[round(g, 2) for g in gains],
                             step_max=round(float(np.max(np.abs(np.diff(gains)))), 2))
    for name, tgt, cap, rel in VARS:
        t = time.time(); y, g, it = run(x, tgt, cap, rel); dt = time.time() - t
        gr = -20 * np.log10(g)
        r[name] = dict(lufs=round(w.integrated_loudness(y)[0], 2), tp=round(w.true_peak_dbtp(y), 2), max_gr=round(float(gr.max()), 2),
                       pct_gt1=round(100 * float((gr > 1).mean()), 2), ev1_per_min=round(events(gr, 1) / mins, 1),
                       ev3_per_min=round(events(gr, 3) / mins, 1), wall_s=round(dt, 2), iters=it, l1=l1(y, x))
    res[tag] = r
    print(tag, json.dumps(r), flush=True)
    json.dump(res, open(OUT, "w"), indent=1)
