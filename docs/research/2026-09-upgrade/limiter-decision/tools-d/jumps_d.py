"""Fallback jump (fallback minus Kokoro, LU) and same-voice length swing per option, 5 voices x 4 lengths.
Kokoro: A's CSV (short/medium/long) + D's article runs. Fallback: B's table (Samantha/Arthur, worker meter) + D's
article renders (ffmpeg), volume law Level(v) = Level(1) - 24(1-v) (B §3, re-checked in D)."""
import json, csv
D = "/Users/chrisren/Development/natural-text-to-voice-extension/docs/research/2026-09-upgrade/limiter-decision"
rows = {(r["case"], r["variant"]): float(r["lufs_ff"]) for r in csv.DictReader(open(f"{D}/A-limiter-measurements.csv"))}
a21 = json.load(open("/tmp/ntts-lim-d/a15_21.json")); r1 = json.load(open("/tmp/ntts-lim-d/lim_d.json"))
r2 = json.load(open("/tmp/ntts-lim-d/lim_d2.json")); idx = json.load(open("/tmp/ntts-lim-d/raw/index.json"))
V = ["af_heart", "af_bella", "am_michael", "bf_emma", "bm_george"]; LEN = ["short", "medium", "long", "article"]
SAM = dict(short=-16.7, medium=-16.1, long=-16.2, article=-16.0); ART = dict(short=-21.0, medium=-22.5, long=-22.5, article=-22.2)
def kok(opt, v, L):
    if L == "article":
        k = f"len5-{v}"; m = idx[k]
        return {"1": m["B_lufs"], "2": r1[k]["L2-60@-16"]["lufs"], "3": m["B_lufs"], "4a": m["raw_lufs"] + min(-21 - m["raw_lufs"], -1.5 - m["raw_tp"]), "4b": r2[k]["L3-60@-21"]["lufs"]}[opt]
    c = f"{v}/{L}"
    return {"1": rows[(c, "B")], "2": rows[(c, "L2-60")], "3": rows[(c, "B")], "4a": a21[c]["go21"], "4b": a21[c]["L3at21"]}[opt]
FB = {"1": 0.0, "2": 0.0, "3": -24 * (1 - 0.89), "4a": -24 * (1 - 0.80), "4b": -24 * (1 - 0.80)}
names = {"1": "no limiter (today)", "2": "L2-60 @-16 (A's pick)", "3": "Samantha 0.89 (B)", "4a": "-21 mono, gain only, Samantha 0.80", "4b": "-21 mono, <=3 dB limiter, Samantha 0.80"}
for opt in names:
    js = {(v, L): ((SAM[L] + FB[opt]) if v[0] == "a" else ART[L]) - kok(opt, v, L) for v in V for L in LEN}
    us = [abs(j) for (v, L), j in js.items() if v[0] == "a"]; gb = [j for (v, L), j in js.items() if v[0] == "b"]
    kl = [kok(opt, v, L) for v in V for L in LEN]
    swing = max(max(kok(opt, v, L) for L in LEN) - min(kok(opt, v, L) for L in LEN) for v in V)
    print(f"{names[opt]:42s} Kokoro {min(kl):6.1f}..{max(kl):6.1f} | same-voice swing {swing:4.1f} | US |jump| max {max(us):4.1f}, >4 LU {sum(u > 4 for u in us)}/12 | GB jump {min(gb):+5.1f}..{max(gb):+5.1f}")
    print("    article jumps:", {v: round(js[(v, 'article')], 1) for v in V})
