import json, sys, numpy as np, soundfile as sf
sys.argv = ["x", "none"]; sys.path.insert(0, "/tmp/ntts-lim-d")
import lim_d
w = lim_d.w
a = json.load(open("/tmp/ntts-lim-a/raw/index.json")); out = {}
for case, m in a.items():
    x, _ = sf.read(m["path"], dtype="float64")
    y, g, _ = lim_d.run(x, -21.0, 3.0, 60); gr = -20 * np.log10(g)
    L, P = m["lufs"], m["tp"]
    out[case] = dict(go21=round(L + min(-21 - L, -1.5 - P), 2), L3at21=round(w.integrated_loudness(y)[0], 2), gr=round(float(gr.max()), 2), pct=round(100*float((gr > 1).mean()), 2))
    print(case, out[case], flush=True)
json.dump(out, open("/tmp/ntts-lim-d/a15_21.json", "w"), indent=1)
