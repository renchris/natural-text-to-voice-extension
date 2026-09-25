"""One extra A/B set: the hero voice (af_heart) on a 2.8-min article, B (today) vs L2-60 aimed at -18 LUFS (6 dB cap),
4 s centred on the deepest gain reduction, 15 ms fades (as ab.py). The matched file is matched to B over the
4-s WINDOW (ab.py matched over the whole file, which left its matched excerpts 0.2-0.7 LU quieter than B)."""
import os, sys, numpy as np, soundfile as sf
sys.path.insert(0, "/tmp/ntts-lim-d")
import lim_d
w = lim_d.w
D = "/Users/chrisren/Development/natural-text-to-voice-extension/docs/research/2026-09-upgrade/limiter-decision/ab-d"
os.makedirs(D, exist_ok=True)
SR, WIN, FADE = 24000, 4 * 24000, int(0.015 * 24000)
x = np.load("/tmp/ntts-lim-d/raw/len5-af_heart.npz")["x"]
b, _ = w.normalize_loudness(x)
y, g, _ = lim_d.run(x, -18.0, 6.0, 60)
c = int(np.argmin(g)); a = max(0, min(len(x) - WIN, c - WIN // 2))
fade = np.ones(WIN); fade[:FADE] = np.linspace(0, 1, FADE); fade[-FADE:] = np.linspace(1, 0, FADE)
eb, ey = b[a:a + WIN], y[a:a + WIN]
m = 10 ** ((w.integrated_loudness(eb)[0] - w.integrated_loudness(ey)[0]) / 20)
for name, sig in (("B", eb), ("L2at18", ey), ("L2at18-matched-to-B", ey * m)):
    sf.write(f"{D}/04-af_heart-article-{name}.wav", sig * fade, SR, subtype="PCM_16")
print(f"window {a/SR:.2f}-{(a+WIN)/SR:.2f}s deepest GR {-20*np.log10(g[c]):.2f} dB at {c/SR:.2f}s; whole file B {w.integrated_loudness(b)[0]:.2f} vs L2@-18 {w.integrated_loudness(y)[0]:.2f}; window match {20*np.log10(m):+.2f} dB")
