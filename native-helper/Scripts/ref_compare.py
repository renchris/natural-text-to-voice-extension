#!/usr/bin/env python3
"""Fidelity gate: our Kokoro output vs the PyTorch reference Kokoro (hexgrad `kokoro` 0.9.4).

The reference is the R01 "prose" fixture (af_heart, speed 1.0, American G2P) synthesised twice by the
PyTorch implementation; both runs are committed losslessly as FLAC under fixtures/fidelity/. Kokoro
durations are deterministic, so a candidate is sample-aligned with the reference up to the stochastic
noise paths and can be compared frame by frame:

  level_vs_ref_db  RMS level difference in dB            (gate: |x| <= --max-level-db, default 0.5)
  logmel_l1        mean |log-mel| difference, 128 mels,  (gate: <= --max-l1, default 0.13)
                   n_fft 2048, hop 240, log-amplitude in nats: the R01 verifier's independent recompute
  logmel_l1_r01    the R01 author's metric (80 mels, n_fft 1024, hop 256), reported, never gated

Calibration (docs/research/2026-09-upgrade/R01 + verifier refcheck, same machine):
  PyTorch run 2 (noise floor)   level 0.00 dB   logmel_l1 0.049   logmel_l1_r01 0.058
  mlx-audio 0.2.6 (pre-1.5)     level -2.65 dB  logmel_l1 0.428   logmel_l1_r01 0.577
  mlx-audio 0.5.5               level -0.20 dB  logmel_l1 0.115   logmel_l1_r01 0.126
The thresholds are parameters because the shipped path can move them: IN-03 adds a peak guard (only
scales when the peak exceeds 0.98; the prose fixture peaks near -3 dBFS, so it should not engage) and
IN-04 changes normalize_text (the prose fixture is plain ASCII, so it should not change the text).

Usage (from native-helper/):
  E=Sources/NaturalTTSHelper/Resources/python-env/bin/python3
  $E Scripts/ref_compare.py                       # synthesise through the bundled tts_worker.py
  $E Scripts/ref_compare.py --worker PATH         # ... through another worker file
  $E Scripts/ref_compare.py --direct              # straight through mlx-audio (the R01 method)
  $E Scripts/ref_compare.py --wav candidate.wav   # compare an existing 24 kHz mono file
Prints one JSON document on stdout; exits 1 if a gate fails.
"""

import argparse
import base64
import io
import json
import os
import struct
import subprocess
import sys

import numpy as np
import soundfile as sf
from scipy.signal import stft

HERE = os.path.dirname(os.path.abspath(__file__))
FIXDIR = os.path.join(HERE, "fixtures", "fidelity")
DEFAULT_WORKER = os.path.join(
    os.path.dirname(HERE), "Sources", "NaturalTTSHelper", "Resources", "tts_worker.py"
)
ESPEAK_DATA_PATH = (
    "/opt/homebrew/opt/espeak-ng/share/espeak-ng-data"  # as PythonWorker.swift sets it
)
SR = 24000
VOICE, SPEED = "af_heart", 1.0


def _melfb(n_fft, n_mels, fmin, fmax, hz2m, m2hz, bins_mode):
    pts = m2hz(np.linspace(hz2m(fmin), hz2m(fmax), n_mels + 2))
    fb = np.zeros((n_mels, n_fft // 2 + 1))
    if bins_mode:  # R01 author: triangular filters on integer FFT bins
        bins = np.floor((n_fft + 1) * pts / SR).astype(int)
        for i in range(1, n_mels + 1):
            lo, c, hi = bins[i - 1], bins[i], bins[i + 1]
            for k in range(lo, c):
                fb[i - 1, k] = (k - lo) / max(1, c - lo)
            for k in range(c, hi):
                fb[i - 1, k] = (hi - k) / max(1, hi - c)
    else:  # verifier: continuous triangles on the FFT frequency grid
        freqs = np.linspace(0, SR / 2, n_fft // 2 + 1)
        for i in range(n_mels):
            lo, c, hi = pts[i], pts[i + 1], pts[i + 2]
            fb[i] = np.maximum(
                0, np.minimum((freqs - lo) / (c - lo), (hi - freqs) / (hi - c))
            )
    return fb


FB_GATE = _melfb(
    2048,
    128,
    20,
    11000,
    lambda h: 1127 * np.log(1 + h / 700),
    lambda m: 700 * (np.exp(m / 1127) - 1),
    False,
)
FB_R01 = _melfb(
    1024,
    80,
    0,
    12000,
    lambda h: 2595 * np.log10(1 + h / 700),
    lambda m: 700 * (10 ** (m / 2595) - 1),
    True,
)


def logmel_gate(x):
    _, _, z = stft(x, fs=SR, nperseg=2048, noverlap=2048 - 240, window="hann")
    return np.log(np.maximum(FB_GATE @ (np.abs(z) ** 2), 1e-10)) / 2


def logmel_r01(x):
    _, _, z = stft(x, fs=SR, nperseg=1024, noverlap=1024 - 256)
    return np.log(np.maximum(FB_R01 @ np.abs(z), 1e-5))


def rms_db(x):
    return float(20 * np.log10(np.sqrt(np.mean(x.astype(np.float64) ** 2)) + 1e-12))


def compare(x, ref, lm_ref_gate, lm_ref_r01):
    n = min(len(x), len(ref))
    lg, lr = logmel_gate(x[:n]), logmel_r01(x[:n])
    return {
        "len_s": round(len(x) / SR, 3),
        "len_diff_s": round((len(x) - len(ref)) / SR, 3),
        "level_vs_ref_db": round(rms_db(x) - rms_db(ref), 2),
        "peak_dbfs": round(float(20 * np.log10(np.max(np.abs(x)) + 1e-12)), 2),
        "logmel_l1": round(
            float(np.mean(np.abs(lg - lm_ref_gate[:, : lg.shape[1]]))), 4
        ),
        "logmel_l1_r01": round(
            float(np.mean(np.abs(lr - lm_ref_r01[:, : lr.shape[1]]))), 4
        ),
    }


def synth_worker(py, worker, text):
    env = dict(os.environ, HF_HUB_OFFLINE="1", ESPEAK_DATA_PATH=ESPEAK_DATA_PATH)
    p = subprocess.Popen(
        [py, worker],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        env=env,
    )
    body = json.dumps({"text": text, "voice": VOICE, "speed": SPEED}).encode()
    p.stdin.write(struct.pack("<I", len(body)) + body)
    p.stdin.flush()
    head = p.stdout.read(4)
    resp = (
        json.loads(p.stdout.read(struct.unpack("<I", head)[0]))
        if len(head) == 4
        else {"error": "worker died"}
    )
    p.stdin.close()
    p.wait(timeout=60)
    if "audio_base64" not in resp:
        raise SystemExit(f"ref_compare: worker returned no audio: {resp}")
    x, sr = sf.read(io.BytesIO(base64.b64decode(resp["audio_base64"])), dtype="float32")
    assert sr == SR, sr
    return x


def synth_direct(text):
    os.environ.setdefault("HF_HUB_OFFLINE", "1")
    os.environ.setdefault("ESPEAK_DATA_PATH", ESPEAK_DATA_PATH)
    from contextlib import redirect_stdout

    from mlx_audio.tts.utils import load_model

    with redirect_stdout(sys.stderr):  # mlx-audio 0.5.5 print()s to stdout
        model = load_model("prince-canuma/Kokoro-82M")
        chunks = [
            np.asarray(r.audio, dtype=np.float32).reshape(-1)
            for r in model.generate(text, voice=VOICE, speed=SPEED, lang_code="a")
        ]
    return np.concatenate(chunks)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    src = ap.add_mutually_exclusive_group()
    src.add_argument(
        "--worker",
        default=DEFAULT_WORKER,
        help="tts_worker.py to synthesise through (default)",
    )
    src.add_argument(
        "--direct", action="store_true", help="synthesise straight through mlx-audio"
    )
    src.add_argument("--wav", help="compare an existing 24 kHz mono file")
    ap.add_argument(
        "--python",
        default=sys.executable,
        help="interpreter for --worker (default: this one)",
    )
    ap.add_argument("--max-level-db", type=float, default=0.5)
    ap.add_argument("--max-l1", type=float, default=0.13)
    a = ap.parse_args()

    text = json.load(open(os.path.join(FIXDIR, "texts.json"), encoding="utf-8"))[
        "prose"
    ]
    refs = [
        sf.read(os.path.join(FIXDIR, f"ref-torch-prose{i}.flac"), dtype="float32")[0]
        for i in range(2)
    ]
    ref = refs[0]
    lm_g, lm_r = logmel_gate(ref), logmel_r01(ref)

    if a.wav:
        x, sr = sf.read(a.wav, dtype="float32")
        if x.ndim > 1:
            x = x.mean(1)
        assert sr == SR, f"{a.wav}: {sr} Hz, want {SR}"
        source = a.wav
    elif a.direct:
        x, source = synth_direct(text), "mlx-audio direct"
    else:
        x, source = synth_worker(a.python, a.worker, text), a.worker

    floor = compare(refs[1], ref, lm_g, lm_r)
    cand = compare(x, ref, lm_g, lm_r)
    failures = []
    if abs(cand["level_vs_ref_db"]) > a.max_level_db:
        failures.append(
            f"level {cand['level_vs_ref_db']} dB outside +/-{a.max_level_db}"
        )
    if cand["logmel_l1"] > a.max_l1:
        failures.append(f"logmel_l1 {cand['logmel_l1']} > {a.max_l1}")
    if floor["logmel_l1"] >= a.max_l1:
        failures.append(
            f"instrument: reference noise floor {floor['logmel_l1']} >= threshold {a.max_l1}"
        )

    out = {
        "source": source,
        "ref_len_s": round(len(ref) / SR, 3),
        "ref_rms_db": round(rms_db(ref), 2),
        "noise_floor": floor,
        "candidate": cand,
        "thresholds": {"max_level_db": a.max_level_db, "max_l1": a.max_l1},
        "ok": not failures,
        "failures": failures,
    }
    print(json.dumps(out, indent=1))
    sys.exit(0 if not failures else 1)


if __name__ == "__main__":
    main()
