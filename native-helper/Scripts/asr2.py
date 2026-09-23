#!/usr/bin/env python3
"""Hallucination-resistant ASR intelligibility check (R01 method): word error rate of a TTS clip.

Splits each clip into <= 28 s pieces at the quietest 50 ms frame between 18 and 28 s, transcribes each
piece independently with Whisper large-v3-turbo (MLX; temperature 0, no conditioning on previous text),
joins them and computes WER against the source text. Normalisation: lowercase, `&`/`%` spelled out,
apostrophes removed, other punctuation stripped. The "prose" fixture (no digits) is the clean
intelligibility signal; "numeric" also measures text normalisation.

Usage (from native-helper/):
  E=Sources/NaturalTTSHelper/Resources/python-env/bin/python3
  $E Scripts/asr2.py --fixture prose clip1.wav [clip2.wav ...]
  $E Scripts/asr2.py --text-file my.txt clip.wav
Prints one JSON line per clip. Downloads the Whisper model (~1.6 GB) on first use, so it is a research
tool, not part of the verify-python.sh gate. Fixture texts: fixtures/fidelity/texts.json.
Source: /tmp/ntts-r01/asr2.py + asr_eval.py (docs/research/2026-09-upgrade/R01).
"""

import argparse
import json
import os
import re
from math import gcd

import numpy as np
import soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
TEXTS = os.path.join(HERE, "fixtures", "fidelity", "texts.json")
ASR_MODEL = "mlx-community/whisper-large-v3-turbo-asr-fp16"


def norm(s):
    s = s.lower()
    s = s.replace("&", " and ").replace("%", " percent ")
    s = re.sub(r"[‘’']", "", s)
    s = re.sub(r"[^a-z0-9\s]", " ", s)
    return s.split()


def wer(ref, hyp):
    r, h = norm(ref), norm(hyp)
    d = list(range(len(h) + 1))
    for i in range(1, len(r) + 1):
        prev, d[0] = d[0], i
        for j in range(1, len(h) + 1):
            cur = d[j]
            d[j] = min(d[j] + 1, d[j - 1] + 1, prev + (r[i - 1] != h[j - 1]))
            prev = cur
    return d[len(h)] / max(1, len(r)), len(r), len(h)


def pieces(x, sr, lo=18.0, hi=28.0):
    out, start, n = [], 0, len(x)
    f = int(0.05 * sr)
    while n - start > hi * sr:
        a, b = start + int(lo * sr), start + int(hi * sr)
        seg = x[a:b]
        k = len(seg) // f
        e = (seg[: k * f].reshape(k, f) ** 2).mean(1)
        cut = a + int(np.argmin(e)) * f + f // 2
        out.append(x[start:cut])
        start = cut
    out.append(x[start:])
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--fixture", choices=["short", "prose", "numeric", "long"])
    src.add_argument("--text-file")
    ap.add_argument("wavs", nargs="+")
    a = ap.parse_args()

    if a.fixture:
        ref_text = json.load(open(TEXTS, encoding="utf-8"))[a.fixture]
    else:
        ref_text = open(a.text_file, encoding="utf-8").read()

    import mlx.core as mx
    from mlx_audio.stt.utils import load

    model = load(ASR_MODEL)
    for p in a.wavs:
        x, sr = sf.read(p, dtype="float32")
        if x.ndim > 1:
            x = x.mean(1)
        if sr != 16000:
            from scipy.signal import resample_poly

            g = gcd(sr, 16000)
            x = resample_poly(x, 16000 // g, sr // g).astype(np.float32)
            sr = 16000
        texts = []
        for seg in pieces(x, sr):
            if len(seg) < 0.3 * sr:
                continue
            r = model.generate(
                mx.array(seg),
                language="en",
                temperature=0.0,
                condition_on_previous_text=False,
            )
            texts.append((r.text if hasattr(r, "text") else str(r)).strip())
        hyp = " ".join(texts)
        w, nr, nh = wer(ref_text, hyp)
        print(
            json.dumps(
                dict(
                    wav=p,
                    fixture=a.fixture,
                    wer=round(w, 4),
                    ref_words=nr,
                    hyp_words=nh,
                    n_pieces=len(texts),
                    audio_s=round(len(x) / sr, 1),
                    hyp=hyp,
                )
            ),
            flush=True,
        )


if __name__ == "__main__":
    main()
