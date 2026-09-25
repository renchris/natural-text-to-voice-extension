"""3 A/B excerpts, B (today) vs L2-60 (6 dB cap, 60 ms release), 4 s centred on L2's deepest gain reduction,
same window for both, 15 ms fades. Plus L2 gain-matched to B's loudness, to hear the limiter without the level jump."""
import json, sys, numpy as np, soundfile as sf
sys.path.insert(0, "/tmp/ntts-lim-a")
import lim
D = "/Users/chrisren/Development/natural-text-to-voice-extension/docs/research/2026-09-upgrade/limiter-decision/ab"
S = json.load(open("/tmp/ntts-lim-a/out/score.json"))
SR, WIN, FADE = 24000, 4 * 24000, int(0.015 * 24000)
for i, case in enumerate(["af_heart/long", "am_michael/medium", "am_michael/long"], 1):
    x, _ = sf.read(f"/tmp/ntts-lim-a/raw/{case.replace('/', '-')}.wav", dtype="float64")
    lufs_in, _ = lim.w.integrated_loudness(x)
    # recover L2-60's gain curve with the exact static gain lim.py settled on
    G = S[f"{case}|L2-60"]["static_gain_db"]
    y0 = x * 10 ** (G / 20)
    g = lim.limiter_gain(y0, lim.CEIL - 0.05, 60, 10 ** (-6 / 20))
    c = int(np.argmin(g)); a = max(0, min(len(x) - WIN, c - WIN // 2))
    fade = np.ones(WIN); fade[:FADE] = np.linspace(0, 1, FADE); fade[-FADE:] = np.linspace(1, 0, FADE)
    b, _ = sf.read(S[f"{case}|B"]["path"] if "path" in S[f"{case}|B"] else f"/tmp/ntts-lim-a/out/{case.replace('/', '-')}-B.wav", dtype="float64")
    l2, _ = sf.read(f"/tmp/ntts-lim-a/out/{case.replace('/', '-')}-L2-60.wav", dtype="float64")
    tag = f"{i:02d}-{case.replace('/', '-')}"
    match = 10 ** ((S[f"{case}|B"]["lufs_ff"] - S[f"{case}|L2-60"]["lufs_ff"]) / 20)
    for name, sig in (("B", b), ("L2", l2), ("L2-matched-to-B", l2 * match)):
        sf.write(f"{D}/{tag}-{name}.wav", sig[a:a + WIN] * fade, SR, subtype="PCM_16")
    print(tag, f"window {a/SR:.2f}-{(a+WIN)/SR:.2f}s, deepest GR {-20*np.log10(g[c]):.2f} dB at {c/SR:.2f}s,",
          f"B {S[f'{case}|B']['lufs_ff']} LUFS vs L2 {S[f'{case}|L2-60']['lufs_ff']} LUFS (whole file)")
