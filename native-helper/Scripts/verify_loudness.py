#!/usr/bin/env python3
"""Loudness gate for tts_worker.py's normalization (verify-python.sh check 8).

Two phases, every check an assertion; exits 1 if any failed, and prints one row per case.

  meter  (no model) the worker's own meter against known answers:
         - K-weighting coefficients derived at 48 kHz == the ITU-R BS.1770-4 table (1e-8)
         - a 997 Hz sine at 0 dBFS reads -3.01 LUFS (BS.1770-4's calibration point), at 24 kHz and 48 kHz
         - a fs/4 sine sampled 45 degrees off its crest: sample peak -3.01 dBFS, true peak 0.0 dBTP (+-0.2)
         - silence and a -80 LUFS signal come back unchanged (gain 0); a 300 ms tone (too short to gate)
           reaches the target through the ungated fallback
  model  5 voices x 3 text lengths through generate_audio_mlx(), each twice under the same MLX seed: once
         with NTTS_LOUDNESS_NORMALIZE off (the pre-normalization synthesis) and once on. For each case:
         - the normalized output is the raw one times ONE gain (residual <= 1e-3 of its RMS: 16-bit
           quantization only) and has exactly the same number of samples and the same "duration"
         - true peak <= -1.5 dBTP, by the worker's 4x meter and by ffmpeg's ebur128 (192 kHz; its value
           is printed to 0.1 dB, so <= -1.45 rounds to the ceiling)
         - integrated loudness by ffmpeg's ebur128 (an independent implementation): within +-0.5 LU of
           -16 LUFS, OR below it with the true peak AT the ceiling (>= -1.6 dBTP), i.e. no larger gain
           was possible without clipping. Never louder than -15.5 LUFS.
           Why the second arm: the brief's box (-16 LUFS, -1.5 dBTP, one gain, no limiter) holds only
           speech whose true peak sits <= 14.5 dB above its loudness, and Kokoro's sits 14-24 dB above
           (W2-integration-measurements.md §10); a limiter is what would close the rest, and the brief
           rules it out. The printed "reached" count keeps that visible.

Usage (from native-helper/):  $E Scripts/verify_loudness.py [WORKER]    (E = the helper's python-env)
Env: NTTS_FFMPEG (default: ffmpeg on PATH).
"""

import base64
import importlib.util
import io
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile

os.environ.setdefault("ESPEAK_DATA_PATH", "/opt/homebrew/opt/espeak-ng/share/espeak-ng-data")

import numpy as np
import soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_WORKER = os.path.join(os.path.dirname(HERE), "Sources", "NaturalTTSHelper", "Resources", "tts_worker.py")
VOICES = ("af_heart", "af_bella", "am_michael", "bf_emma", "bm_george")
TEXTS = {
    "short": "Hello there, welcome back.",
    "medium": "Natural text to speech reads the passage you select aloud, using a voice that runs entirely on your Mac.",
    "long": (
        "Select any passage on a web page and press play. The extension sends the text to a small helper "
        "running on your own computer, which turns it into speech with the Kokoro model. Nothing leaves "
        "the machine, there is no account to create, and the voices sound natural enough to listen to for "
        "an entire article. If the helper is not running, the extension falls back to the voices built into macOS."
    ),
}
TARGET, CEILING, TOLERANCE_LU = -16.0, -1.5, 0.5
# BS.1770-4 Table 1 and Table 2 (48 kHz): (b0, b1, b2), (a1, a2)
TABLE_48K = (
    ((1.53512485958697, -2.69169618940638, 1.19839281085285), (-1.69065929318241, 0.73248077421585)),
    ((1.0, -2.0, 1.0), (-1.99004745483398, 0.99007225036621)),
)

failures = []


def check(cond, msg):
    if not cond:
        failures.append(msg)
        print(f"FAIL {msg}")
    return cond


def load_worker(path):
    spec = importlib.util.spec_from_file_location("tts_worker_loudness", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def meter_phase(w):
    for (b, a), (tb, ta) in zip(w.k_weighting_coefficients(48000), TABLE_48K):
        err = max(abs(x - y) for x, y in zip(b + a[1:], tb + ta))
        print(f"METER 48 kHz coefficients max |error| {err:.2e}")
        check(err < 1e-8, f"K-weighting at 48 kHz differs from the BS.1770-4 table by {err:.2e}")
    for rate in (24000, 48000):
        t = np.arange(rate * 5) / rate
        lufs, gated = w.integrated_loudness(np.sin(2 * np.pi * 997 * t), rate)
        print(f"METER 997 Hz 0 dBFS sine at {rate} Hz: {lufs:.3f} LUFS (gated={gated})")
        check(gated and abs(lufs - -3.01) <= 0.05, f"997 Hz sine at {rate} Hz read {lufs} LUFS, want -3.01")
    n = np.arange(24000)
    isp = np.sin(2 * np.pi * n / 4 + np.pi / 4)
    sample_db, tp = 20 * math.log10(np.max(np.abs(isp))), w.true_peak_dbtp(isp)
    print(f"METER fs/4 sine at 45 deg: sample peak {sample_db:.2f} dBFS, true peak {tp:.2f} dBTP")
    check(abs(tp) <= 0.2, f"inter-sample peak read {tp:.2f} dBTP, want 0.0")
    for label, buf in (("silence", np.zeros(24000)), ("-80 LUFS", 1e-4 * np.sin(2 * np.pi * 997 * n / 24000))):
        out, rep = w.normalize_loudness(buf)
        print(f"METER {label}: {rep}")
        check(rep["gain_db"] == 0.0 and np.array_equal(out, buf), f"{label} was not returned unchanged: {rep}")
    tone = 0.05 * np.sin(2 * np.pi * 440 * np.arange(7200) / 24000)
    out, rep = w.normalize_loudness(tone)
    after, gated = w.integrated_loudness(out)
    print(f"METER 300 ms tone: {rep} -> {after:.2f} LUFS")
    check(not rep["gated"] and rep["limited_by"] == "target", f"300 ms tone did not take the ungated path: {rep}")
    check(abs(after - TARGET) <= 0.01, f"300 ms tone normalized to {after} LUFS, want {TARGET}")


def ffmpeg_ebur128(ffmpeg, path):
    err = subprocess.run(
        [ffmpeg, "-hide_banner", "-nostats", "-i", path, "-af", "ebur128=peak=true:framelog=quiet", "-f", "null", "-"],
        capture_output=True, text=True, timeout=60,
    ).stderr
    summary = err[err.rfind("Summary:"):]
    i = re.search(r"I:\s+(-?[\d.]+) LUFS", summary)
    p = re.search(r"Peak:\s+(-?[\d.]+|-inf) dBFS", summary)
    if not (i and p):
        raise RuntimeError(f"no ebur128 summary for {path}")
    return float(i.group(1)), float(p.group(1))


def decode(resp):
    x, sr = sf.read(io.BytesIO(base64.b64decode(resp["audio_base64"])), dtype="float64")
    assert sr == 24000, sr
    return x


def model_phase(w, ffmpeg, tmp):
    import mlx.core as mx

    if not check(w.load_mlx_model(), "the worker could not load the model"):
        return
    rows, reached = [], 0
    for seed, (voice, (length, text)) in enumerate((v, t) for v in VOICES for t in TEXTS.items()):
        out = {}
        for on in (False, True):
            w.LOUDNESS_NORMALIZE = on
            mx.random.seed(1000 + seed)
            out[on] = w.generate_audio_mlx(text, voice, 1.0)
        w.LOUDNESS_NORMALIZE = True
        label = f"{voice}/{length}"
        if not check(all("audio_base64" in r for r in out.values()), f"{label}: no audio {out[True].get('error')}"):
            continue
        raw, norm = decode(out[False]), decode(out[True])
        check(len(raw) == len(norm), f"{label}: {len(norm)} samples normalized vs {len(raw)} raw")
        check(out[True]["duration"] == out[False]["duration"], f"{label}: duration changed")
        n = min(len(raw), len(norm))
        gain = float(np.dot(norm[:n], raw[:n]) / np.dot(raw[:n], raw[:n]))
        residual = float(np.sqrt(np.mean((norm[:n] - gain * raw[:n]) ** 2)) / np.sqrt(np.mean(norm[:n] ** 2)))
        check(residual <= 1e-3, f"{label}: normalized output is not the raw one times one gain (residual {residual:.2e})")
        path = os.path.join(tmp, f"{voice}-{length}.wav")
        sf.write(path, norm, 24000, subtype="PCM_16")
        raw_path = os.path.join(tmp, f"{voice}-{length}-raw.wav")
        sf.write(raw_path, raw, 24000, subtype="PCM_16")
        lufs_ff, tp_ff = ffmpeg_ebur128(ffmpeg, path)
        raw_lufs_ff, raw_tp_ff = ffmpeg_ebur128(ffmpeg, raw_path)
        tp_own = w.true_peak_dbtp(norm)
        at_target = abs(lufs_ff - TARGET) <= TOLERANCE_LU
        peak_bound = lufs_ff < TARGET - TOLERANCE_LU and tp_own >= CEILING - 0.1
        reached += at_target
        row = dict(case=label, seconds=round(len(norm) / 24000, 2), raw_lufs=raw_lufs_ff, raw_tp=raw_tp_ff,
                   gain_db=round(20 * math.log10(gain), 2), lufs=lufs_ff, tp_ffmpeg=tp_ff, tp_own=round(tp_own, 2),
                   residual=float(f"{residual:.1e}"), bound="target" if at_target else "true_peak" if peak_bound else "NEITHER")
        rows.append(row)
        print("CASE " + json.dumps(row))
        check(tp_own <= CEILING + 0.01, f"{label}: true peak {tp_own:.2f} dBTP (worker meter) above {CEILING}")
        check(tp_ff <= CEILING + 0.05, f"{label}: true peak {tp_ff} dBTP (ffmpeg) above {CEILING}")
        check(lufs_ff <= TARGET + TOLERANCE_LU, f"{label}: {lufs_ff} LUFS is louder than the target")
        check(at_target or peak_bound, f"{label}: {lufs_ff} LUFS, true peak {tp_own:.2f}: neither at target nor peak-bound")
    print(f"MODEL {len(rows)} cases: {reached} at {TARGET}+-{TOLERANCE_LU} LUFS, {len(rows) - reached} held at the "
          f"{CEILING} dBTP ceiling; output {min(r['lufs'] for r in rows)}..{max(r['lufs'] for r in rows)} LUFS, "
          f"raw {min(r['raw_lufs'] for r in rows)}..{max(r['raw_lufs'] for r in rows)} LUFS")
    check(len(rows) == len(VOICES) * len(TEXTS), f"{len(rows)} of {len(VOICES) * len(TEXTS)} cases measured")


def main():
    worker = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_WORKER
    ffmpeg = os.environ.get("NTTS_FFMPEG") or shutil.which("ffmpeg")
    w = load_worker(worker)
    meter_phase(w)
    if check(bool(ffmpeg) and os.path.exists(ffmpeg), "missing: ffmpeg (ebur128 is the independent meter)"):
        with tempfile.TemporaryDirectory() as tmp:
            try:
                model_phase(w, ffmpeg, tmp)
            except Exception as e:
                check(False, f"model phase raised {type(e).__name__}: {e}")
    print(f"verify_loudness: {'PASS' if not failures else f'FAIL ({len(failures)})'}")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
