"""Mono-corrected targets: L3-60 (3 dB cap) and L2-60 (6 dB cap) at -19 and -21 LUFS (mono meter) on D's catalogue and articles."""
import json, os, sys, time
import numpy as np
sys.argv = ["x", "none"]; sys.path.insert(0, "/tmp/ntts-lim-d")
import lim_d
idx = json.load(open("/tmp/ntts-lim-d/raw/index.json"))
OUT = "/tmp/ntts-lim-d/lim_d2.json"
res = json.load(open(OUT)) if os.path.exists(OUT) else {}
VARS = [("L3-60@-21", -21.0, 3.0), ("L3-60@-19", -19.0, 3.0), ("L2-60@-19", -19.0, 6.0)]
for tag, meta in idx.items():
    if tag.startswith("seed") or tag in res: continue
    x = np.load(f"/tmp/ntts-lim-d/raw/{tag}.npz")["x"]; mins = len(x) / 24000 / 60; r = {}
    for name, tgt, cap in VARS:
        t = time.time(); y, g, it = lim_d.run(x, tgt, cap, 60); gr = -20 * np.log10(g)
        r[name] = dict(lufs=round(lim_d.w.integrated_loudness(y)[0], 2), max_gr=round(float(gr.max()), 2), pct_gt1=round(100 * float((gr > 1).mean()), 2),
                       ev3_per_min=round(lim_d.events(gr, 3) / mins, 1), l1=lim_d.l1(y, x), wall_s=round(time.time() - t, 2))
    res[tag] = r; print(tag, json.dumps(r), flush=True); json.dump(res, open(OUT, "w"), indent=1)
