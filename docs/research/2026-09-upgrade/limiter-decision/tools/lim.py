"""Offline lookahead true-peak limiter variants vs today's single-gain normalization (B).
Meter = the worker's own integrated_loudness / true_peak_dbtp (cross-checked by ffmpeg ebur128 in score.py)."""
import json, math, os, sys, importlib.util
import numpy as np, soundfile as sf
from scipy.ndimage import minimum_filter1d
NH = "/Users/chrisren/Development/natural-text-to-voice-extension/native-helper"
spec = importlib.util.spec_from_file_location("w", NH + "/Sources/NaturalTTSHelper/Resources/tts_worker.py")
w = importlib.util.module_from_spec(spec); spec.loader.exec_module(w)
SR, TARGET, CEIL, MAXG = 24000, -16.0, -1.5, 24.0
LA = int(round(0.005 * SR))  # 5 ms lookahead = attack = 120 samples

w.true_peak_dbtp(np.zeros(8))  # populate the worker's 3 interpolation phases (4x, 32 taps/phase, Kaiser 8)
PH = w._true_peak_phases

def tp_env(y):
    """Per-sample 4x-oversampled |peak|: max of |y[n]| and the interpolated points either side of n."""
    env = np.abs(y).copy()
    for taps in PH:
        v = np.abs(w._fir(y, taps))
        # align exactly as the worker's meter does: it only takes the max, so find the lag once
        env = np.maximum(env, v[: len(y)])
        env[:-1] = np.maximum(env[:-1], v[1: len(y)])
        env[1:] = np.maximum(env[1:], v[: len(y) - 1])
        if len(v) > len(y):
            pass
    # the FIR has group delay; widen by the filter half-length so any alignment is covered
    return maximum_filter(env, w._TRUE_PEAK_HALF_TAPS)

def maximum_filter(x, k):
    from scipy.ndimage import maximum_filter1d
    return maximum_filter1d(x, size=2 * k + 1, mode="nearest")

def limiter_gain(y, ceil_db, release_ms, floor_lin):
    """Gain curve g[n] <= 1: lookahead min-hold (LA+1) -> instant-attack / one-pole release -> LA boxcar
    (the attack ramp, = lookahead). At any peak p, every r[k] for k in [p-LA, p] is <= g_req[p], so the
    boxcar mean is too: the peak is fully covered, and the gain moves smoothly (linear ramp in, exp out)."""
    c = 10 ** (ceil_db / 20)
    env = tp_env(y)
    req = np.minimum(1.0, c / np.maximum(env, 1e-12))
    req = np.maximum(req, floor_lin)
    # forward-looking min over [n, n+LA]
    h = minimum_filter1d(req, size=LA + 1, origin=-(LA // 2) if LA % 2 == 0 else -(LA // 2), mode="nearest")
    # make it exactly forward-looking regardless of scipy origin conventions
    h = np.array([req[i: i + LA + 1].min() for i in range(0)]) if False else fwd_min(req, LA)
    a = math.exp(-1.0 / (release_ms * 1e-3 * SR))
    r = np.empty_like(h); prev = 1.0
    for i, v in enumerate(h):  # 24k-600k samples, fine
        prev = v if v < prev else v + a * (prev - v)
        r[i] = prev
    k = np.ones(LA + 1) / (LA + 1)
    s = np.convolve(np.concatenate([np.full(LA, r[0]), r]), k, mode="valid")  # trailing mean over [n-LA, n]
    return s

def fwd_min(x, L):
    pad = np.concatenate([x, np.full(L, x[-1])])
    from numpy.lib.stride_tricks import sliding_window_view
    return sliding_window_view(pad, L + 1).min(axis=1)

def run(x, cap_db, release_ms):
    """Static gain G aimed at -16 LUFS, lookahead limiter to the ceiling, then makeup: G is re-aimed until the
    LIMITED output reads -16 +- 0.05 LUFS. A cap bounds G at (ceiling + cap - raw true peak), the largest static
    gain whose peak excess the limiter can absorb within cap_db; when that binds, the output stays below -16."""
    lufs_in, _ = w.integrated_loudness(x)
    tp_in = w.true_peak_dbtp(x)
    G = min(TARGET - lufs_in, MAXG)
    gmax = MAXG if cap_db is None else CEIL + cap_db - tp_in
    floor = 10 ** (-(cap_db if cap_db is not None else 60) / 20)
    ceil = CEIL - 0.05
    for it in range(12):
        G = min(G, gmax)
        y0 = x * 10 ** (G / 20)
        g = limiter_gain(y0, ceil, release_ms, floor)
        y = y0 * g
        tp = w.true_peak_dbtp(y)
        if tp > CEIL:  # interpolation/rounding overshoot: tighten, and for a binding cap lower the static gain
            over = tp - CEIL + 0.02
            ceil -= over
            if cap_db is not None:
                gmax -= over
            continue
        lufs = w.integrated_loudness(y)[0]
        if abs(lufs - TARGET) <= 0.05 or (G >= gmax - 1e-9 and lufs < TARGET):
            break
        G += TARGET - lufs
    gr = -20 * np.log10(g)
    return y, dict(static_gain_db=round(G, 2), cap_bound=bool(cap_db is not None and G >= gmax - 1e-9 and lufs < TARGET - 0.05),
                   max_gr_db=round(float(gr.max()), 2), mean_gr_db=round(float(gr.mean()), 3),
                   pct_gr_gt1db=round(100 * float((gr > 1).mean()), 2), iters=it + 1)

VARIANTS = [("B", None, None)] + [(f"L{n}-{rel}", cap, rel) for n, cap in ((1, None), (2, 6.0), (3, 3.0)) for rel in (60, 150)]

if __name__ == "__main__":
    idx = json.load(open("/tmp/ntts-lim-a/raw/index.json"))
    os.makedirs("/tmp/ntts-lim-a/out", exist_ok=True)
    res = {}
    for case, meta in idx.items():
        x, _ = sf.read(meta["path"], dtype="float64")
        for name, cap, rel in VARIANTS:
            if name == "B":
                y, rep = w.normalize_loudness(x)
                info = dict(static_gain_db=round(rep["gain_db"], 2), max_gr_db=0.0, mean_gr_db=0.0, pct_gr_gt1db=0.0, iters=0)
            else:
                y, info = run(x, cap, rel)
            p = f"/tmp/ntts-lim-a/out/{case.replace('/', '-')}-{name}.wav"
            sf.write(p, y, SR, subtype="PCM_16")
            yq, _ = sf.read(p, dtype="float64")
            info.update(path=p, lufs=round(w.integrated_loudness(yq)[0], 2), tp=round(w.true_peak_dbtp(yq), 2))
            res[f"{case}|{name}"] = info
            print(case, name, json.dumps({k: v for k, v in info.items() if k != "path"}), flush=True)
    json.dump(res, open("/tmp/ntts-lim-a/out/lim.json", "w"), indent=1)
