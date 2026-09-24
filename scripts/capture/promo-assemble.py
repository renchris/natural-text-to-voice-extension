#!/usr/bin/env python3
"""Assemble the promo video (YouTube master, 1920x1080) and the README demo cut (1280x720) from the GUI-pass takes.

Usage: python3 scripts/capture/promo-assemble.py <takes-dir> <out-master.mp4> <out-demo.mp4>

<takes-dir> holds the raw takes (sckrec, 1612x907 pt at 2x, live audio) and the other inputs named in SCENES below.
Every number in SCENES was MEASURED on that take (scripts/capture/GUI_PASS.md, assets/media/PROVENANCE.md):
  keep   raw-time ranges kept; a gap between ranges is a jump cut. The script refuses a cut that falls inside a clip or
         inside a click-to-speech gap, so a cut can only remove dead time, never shorten a measured latency.
  clips  (wav, raw time of its first sample, raw time of the click that caused it). The raw time is where the clip
         cross-correlates into the take's own live audio (10 ms log-RMS envelopes, then 1 ms), i.e. click + lag.
  live   use the take's own recorded audio instead (the system-voice scene: there is no canonical clip for it).
Video is converted to 30 fps CFR BEFORE cutting (cutting a variable-frame-rate recording first re-zeroes on the first
changed frame and shifts the picture against the audio), then scaled with Lanczos. Clips are never gain-edited or cut.
"""

import os, subprocess, sys

takes, out_master, out_demo = sys.argv[1:4]
AUD = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "../../assets/media/src/audio"
)
T = lambda f: os.path.join(takes, f)

SCENES = {
    "title": {"image": T("cards/title-1920x1080.png"), "dur": 2.5},
    # (b) right-click speak on the article, Heart 1.0x. Click flash 11.167 s; clip at 12.251 s (lag 1.084 s).
    "b": {
        "src": T("sb-raw.mov"),
        "keep": [(8.0, 18.1)],
        "clips": [("s1-rightclick.wav", 12.251, 11.167)],
    },
    # (c) popup: native list -> Emma, Speak (click 12.107, clip 12.647); + x3 -> 1.3x; Speak (click 24.392, clip 24.791).
    "c": {
        "src": T("sc-raw.mov"),
        "keep": [
            (4.35, 6.9),
            (7.25, 10.9),
            (11.7, 19.95),
            (20.35, 22.35),
            (22.75, 28.6),
        ],
        "clips": [("s2-british.wav", 12.647, 12.107), ("s3-speed.wav", 24.791, 24.392)],
    },
    # the short README cut starts (b) at the open menu (the sentence is already selected on screen)
    "b1": {
        "src": T("sb-raw.mov"),
        "keep": [(9.5, 18.1)],
        "clips": [("s1-rightclick.wav", 12.251, 11.167)],
    },
    # the first half of (c) only, for the short README cut
    "c1": {
        "src": T("sc-raw.mov"),
        "keep": [(4.35, 6.9), (7.25, 10.9), (11.9, 19.8)],
        "clips": [("s2-british.wav", 12.647, 12.107)],
    },
    # (d) helper stopped: right-click speak, the system voice reads it (live audio of the take). Click flash 11.105 s.
    "d": {
        "src": T("sd-raw.mov"),
        "keep": [(9.45, 16.55)],
        "live": True,
        "clicks": [11.105],
    },
    # (e1) the helper's sockets (VHS, real shell, the same helper pid as e2)
    "e1": {"src": T("tapes/privacy.mp4"), "keep": [(0.3, 8.92)]},
    # the same, final output held 1.7 s instead of 3 s (README cut)
    "e1s": {"src": T("tapes/privacy.mp4"), "keep": [(0.3, 7.6)]},
    # (e2) speak again through that helper. Click flash 10.942 s; clip at 12.227 s (lag 1.285 s).
    "e2": {
        "src": T("se-raw.mov"),
        "keep": [(9.3, 19.25)],
        "clips": [("s5-offline.wav", 12.227, 10.942)],
    },
    "end": {"image": T("cards/end-1920x1080.png"), "dur": 4.0},
}
MASTER = ["title", "b", "c", "d", "e1", "e2", "end"]
DEMO = ["b1", "c1", "e1s"]


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        sys.exit(f"FAIL {' '.join(cmd[:6])}...\n{r.stderr[-2000:]}")


def check(name, s):
    for wav, at, click in s.get("clips", []):
        dur = float(
            subprocess.run(
                [
                    "ffprobe",
                    "-v",
                    "error",
                    "-show_entries",
                    "format=duration",
                    "-of",
                    "csv=p=0",
                    os.path.join(AUD, wav),
                ],
                capture_output=True,
                text=True,
            ).stdout
        )
        span = (click, at + dur)
        if not any(a <= span[0] and span[1] <= b for a, b in s["keep"]):
            sys.exit(
                f"{name}: {wav} (click {click} .. clip end {span[1]:.3f}) is not inside one kept range"
            )
    for c in s.get("clicks", []):
        if not any(a <= c <= b for a, b in s["keep"]):
            sys.exit(f"{name}: click {c} cut")


def seg_time(s, t):
    acc = 0.0
    for a, b in s["keep"]:
        if a <= t <= b:
            return acc + (t - a)
        acc += b - a
    raise ValueError(t)


def segment(name, w, h, out):
    s = SCENES[name]
    if "image" in s:
        run(
            [
                "ffmpeg",
                "-v",
                "error",
                "-y",
                "-loop",
                "1",
                "-framerate",
                "30",
                "-t",
                str(s["dur"]),
                "-i",
                s["image"],
                "-f",
                "lavfi",
                "-t",
                str(s["dur"]),
                "-i",
                "anullsrc=r=48000:cl=stereo",
                "-vf",
                f"scale={w}:{h}:flags=lanczos,format=yuv420p",
                "-c:v",
                "libx264",
                "-crf",
                "12",
                "-preset",
                "fast",
                "-r",
                "30",
                "-c:a",
                "pcm_s16le",
                "-shortest",
                out,
            ]
        )
        return sum([s["dur"]])
    # Cut on whole frames: every range becomes [A/30, B/30), so video and audio lengths match exactly at each join.
    s = dict(s, keep=[(round(a * 30) / 30, round(b * 30) / 30) for a, b in s["keep"]])
    check(name, s)
    n = len(s["keep"])
    total = sum(b - a for a, b in s["keep"])
    fc = [f"[0:v]fps=30,split={n}" + "".join(f"[s{i}]" for i in range(n))]
    for i, (a, b) in enumerate(s["keep"]):
        fc.append(
            f"[s{i}]trim=start_frame={round(a * 30)}:end_frame={round(b * 30)},setpts=PTS-STARTPTS[v{i}]"
        )
    fc.append(
        "".join(f"[v{i}]" for i in range(n))
        + f"concat=n={n}:v=1:a=0,scale={w}:{h}:flags=lanczos,format=yuv420p[v]"
    )
    inputs = ["-i", s["src"]]
    if s.get("live"):
        fc.append(f"[0:a]asplit={n}" + "".join(f"[t{i}]" for i in range(n)))
        for i, (a, b) in enumerate(s["keep"]):
            fc.append(f"[t{i}]atrim=start={a}:end={b},asetpts=PTS-STARTPTS[u{i}]")
        fc.append(
            "".join(f"[u{i}]" for i in range(n))
            + f"concat=n={n}:v=0:a=1,aresample=48000,aformat=channel_layouts=stereo,apad,atrim=0:{total}[a]"
        )
    else:
        inputs += ["-f", "lavfi", "-t", f"{total}", "-i", "anullsrc=r=48000:cl=stereo"]
        mix = ["[1:a]"]
        for k, (wav, at, _click) in enumerate(s.get("clips", [])):
            inputs += ["-i", os.path.join(AUD, wav)]
            ms = round(seg_time(s, at) * 1000)
            fc.append(
                f"[{k + 2}:a]aresample=48000,aformat=channel_layouts=stereo,adelay={ms}|{ms}[c{k}]"
            )
            mix.append(f"[c{k}]")
        fc.append(
            "".join(mix)
            + f"amix=inputs={len(mix)}:normalize=0:duration=first,atrim=0:{total}[a]"
        )
    run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-y",
            *inputs,
            "-filter_complex",
            ";".join(fc),
            "-map",
            "[v]",
            "-map",
            "[a]",
            "-c:v",
            "libx264",
            "-crf",
            "12",
            "-preset",
            "fast",
            "-r",
            "30",
            "-c:a",
            "pcm_s16le",
            "-t",
            f"{total}",
            out,
        ]
    )
    return total


def build(order, w, h, out, venc):
    work = os.path.join(takes, f"seg-{w}")
    os.makedirs(work, exist_ok=True)
    parts, t = [], 0.0
    for name in order:
        p = os.path.join(work, f"{name}.mov")
        d = segment(name, w, h, p)
        parts.append(p)
        print(f"  {name:5s} starts {t:6.2f}s  length {d:5.2f}s")
        t += d
    ins = sum((["-i", p] for p in parts), [])
    fc = (
        "".join(f"[{i}:v][{i}:a]" for i in range(len(parts)))
        + f"concat=n={len(parts)}:v=1:a=1[v][a]"
    )
    run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-y",
            *ins,
            "-filter_complex",
            fc,
            "-map",
            "[v]",
            "-map",
            "[a]",
            *venc,
            out,
        ]
    )
    print(f"{out}: {t:.2f}s")


print("master")
build(
    MASTER,
    1920,
    1080,
    out_master,
    [
        "-c:v",
        "libx264",
        "-profile:v",
        "high",
        "-preset",
        "slow",
        "-b:v",
        "8M",
        "-maxrate",
        "10M",
        "-bufsize",
        "16M",
        "-bf",
        "2",
        "-g",
        "15",
        "-keyint_min",
        "15",
        "-sc_threshold",
        "0",
        "-flags",
        "+cgop",
        "-pix_fmt",
        "yuv420p",
        "-r",
        "30",
        "-colorspace",
        "bt709",
        "-color_primaries",
        "bt709",
        "-color_trc",
        "bt709",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-ar",
        "48000",
        "-ac",
        "2",
        "-movflags",
        "+faststart",
        "-use_editlist",
        "0",
    ],
)
print("demo")
build(
    DEMO,
    1280,
    720,
    out_demo,
    [
        "-c:v",
        "libx264",
        "-profile:v",
        "high",
        "-preset",
        "slow",
        "-crf",
        "23",
        "-pix_fmt",
        "yuv420p",
        "-r",
        "30",
        "-colorspace",
        "bt709",
        "-color_primaries",
        "bt709",
        "-color_trc",
        "bt709",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-ar",
        "48000",
        "-ac",
        "2",
        "-movflags",
        "+faststart",
    ],
)
