import sys, numpy as np, soundfile as sf
sys.path.insert(0, "/Users/chrisren/Development/natural-text-to-voice-extension/native-helper/Scripts")
import ref_compare as rc, verify_loudness as vl
for case in ("am_michael-medium", "af_heart-long", "am_michael-long", "af_bella-short"):
    rp = f"/tmp/ntts-lim-a/raw/{case}.wav"; raw, _ = sf.read(rp, dtype="float64"); rl, _ = vl.ffmpeg_ebur128("ffmpeg", rp)
    b = rc.logmel_gate(raw)
    for v in ("B", "L2-60", "L1-60"):
        p = f"/tmp/ntts-lim-a/out/{case}-{v}.wav"; y, _ = sf.read(p, dtype="float64"); yl, _ = vl.ffmpeg_ebur128("ffmpeg", p)
        ym = y * 10 ** ((rl - yl) / 20); n = min(len(ym), len(raw))
        a = rc.logmel_gate(ym[:n]); d = a - b[:, :a.shape[1]]
        live = (a > -10) & (b[:, :a.shape[1]] > -10)          # bins above the 1e-10 floor in both
        off = np.median(d[live])
        l1A = np.mean(np.mean(np.abs(d), axis=0)); l1M = np.mean(np.mean(np.abs(np.where(live, d - off, d)), axis=0))
        print(f"{case:18s} {v:6s} L1(A)={l1A:.4f}  L1(offset removed)={l1M:.4f}  median offset={off*20/np.log(10):+.2f} dB")
