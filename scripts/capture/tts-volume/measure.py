#!/usr/bin/env python3
"""measure.py <capture.wav> <volume>...: split a recording of N utterances on silence and print each one's
integrated loudness (ffmpeg ebur128) against the first, next to the two candidate volume laws: macOS's measured
-24 dB per unit of volume (limiter-decision/B-fallback-volume.md) and linear amplitude, 20*log10(v).
Exit 0 prints a verdict line; exit 1 if the number of utterances found differs from the number of volumes."""

import math
import re
import subprocess
import sys


def ffmpeg_stderr(args):
    return subprocess.run(["ffmpeg", "-hide_banner", "-nostats", *args, "-f", "null", "-"],
                          capture_output=True, text=True).stderr


def main():
    wav, volumes = sys.argv[1], [float(v) for v in sys.argv[2:]]
    h, m, s = re.search(r"Duration: (\d+):(\d+):([\d.]+)", ffmpeg_stderr(["-i", wav])).groups()
    duration = int(h) * 3600 + int(m) * 60 + float(s)
    log = ffmpeg_stderr(["-i", wav, "-af", "silencedetect=n=-50dB:d=0.7"])
    starts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", log)]
    ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", log)]
    takes, t = [], 0.0
    for start, end in zip(starts, ends + [duration]):
        if start - t > 1.0:
            takes.append((t, start))
        t = end
    if duration - t > 1.0:
        takes.append((t, duration))
    if len(takes) != len(volumes):
        print(f"found {len(takes)} utterances, expected {len(volumes)}: not measured")
        return 1
    print("| volume | start s | length s | LUFS | vs first | -24(1-v) law | 20log10(v) |")
    print("|---|---|---|---|---|---|---|")
    first, deltas = None, {}
    for (a, b), v in zip(takes, volumes):
        out = ffmpeg_stderr(["-i", wav, "-af", f"atrim={max(0.0, a - 0.2)}:{b + 0.2},ebur128=peak=true"])
        lufs = float(re.findall(r"I:\s+(-?[\d.]+) LUFS", out)[-1])
        first = lufs if first is None else first
        deltas.setdefault(v, lufs - first)
        print(f"| {v:.2f} | {a:.2f} | {b - a:.2f} | {lufs:.1f} | {lufs - first:+.1f} | {-24 * (1 - v):+.1f} | "
              f"{20 * math.log10(v):+.1f} |")
    if 0.8 in deltas:
        d = deltas[0.8]
        law = "the -24(1-v) law (0.8 is right)" if abs(d + 4.8) <= 0.7 else \
            "linear amplitude (set Samantha to about 0.58)" if abs(d + 1.9) <= 0.7 else "neither law"
        print(f"VERDICT volume 0.8 reads {d:+.1f} dB: {law}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
