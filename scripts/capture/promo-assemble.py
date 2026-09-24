#!/usr/bin/env python3
"""Assemble the promo video (YouTube master, 1920x1080) and the README demo cut (1280x720) from the GUI-pass takes.

Usage: python3 scripts/capture/promo-assemble.py <takes-dir> <out-master.mp4> <out-demo.mp4>
       python3 scripts/capture/promo-assemble.py --remux-audio <takes-dir> <old-master.mp4> <out-master.mp4> \
               <old-demo.mp4> <out-demo.mp4>

--remux-audio rebuilds ONLY the sound, with exactly the graph a full run uses (same scenes, offsets, crossfades and
AAC settings), and muxes it with the video stream COPIED from the finished file, so the picture is never re-encoded.
This is how the clips are replaced after they are regenerated (1.5.0 loudness normalization). NTTS_AUDIO_DIR points
it at another clip directory: run with the clips the old file was made from and every packet of both streams, with its
timestamps, comes out identical to the old file's (checked 2026-09-24 on the master and the demo), which proves the
rebuild is exact before any new clip goes in.

<takes-dir> holds the raw takes (sckrec, 1612x907 pt at 2x, live audio), tapes/privacy.mp4 and cards/ (video-cards.sh:
title and end cards and the caption overlays). Render the cards into a directory no other capture run writes to.
Every number in SCENES was MEASURED on that take (scripts/capture/GUI_PASS.md, assets/media/PROVENANCE.md):
  keep     raw-time ranges kept; a gap between ranges is a jump cut. The script refuses a cut that falls inside a clip or
           inside a click-to-speech gap, so a cut can only remove dead time, never shorten a measured latency.
  clips    (wav, raw time of its first sample, raw time of the click that caused it). The raw time is where the clip
           cross-correlates into the take's own live audio (10 ms log-RMS envelopes, then 1 ms), i.e. click + lag.
  live     use the take's own recorded audio instead (the system-voice scene: there is no canonical clip for it).
  caption  (png in cards/, from, to): a lower-third overlay, seconds in the scene's own (cut) time; None = to the end.
Video is converted to 30 fps CFR BEFORE cutting (cutting a variable-frame-rate recording first re-zeroes on the first
changed frame and shifts the picture against the audio), then scaled with Lanczos.
Audio: every clip is the helper's mono WAV, put on BOTH channels unchanged (pan=stereo|c0=c0|c1=c0). An upmix
(aformat=channel_layouts=stereo) would apply swresample's -3 dB centre mix and lower every clip by 3 dB per channel.
No clip is gain-edited or cut; the live scene's audio is left exactly as recorded.
Scenes are joined with a short crossfade (FADE s of picture and sound together, so sync inside each scene holds); the
script refuses a clip whose sound would fall inside a crossfade.
Also writes <out-master>.timeline.json (duration, each clip's start, chapters, the live scene's speech) for
scripts/capture/youtube-meta.mjs, which makes the chapter list and youtube-master.srt from it.
"""

import array, json, os, subprocess, sys, wave

REMUX = len(sys.argv) > 1 and sys.argv[1] == "--remux-audio"
if REMUX:
    takes, old_master, out_master, old_demo, out_demo = sys.argv[2:7]
else:
    takes, out_master, out_demo = sys.argv[1:4]
HERE = os.path.dirname(os.path.abspath(__file__))
AUD = os.environ.get("NTTS_AUDIO_DIR") or os.path.join(
    HERE, "../../assets/media/src/audio"
)
T = lambda f: os.path.join(takes, f)
FADE = 0.3

SCENES = {
    "title": {"image": T("cards/title-1920x1080.png"), "dur": 2.5},
    # (b) right-click speak on the article, Heart 1.0x, cursor recorded: a real drag selects the sentence, a real
    # right-click opens the menu, the pointer clicks "Speak selected text". Click flash 12.233 s; clip at 14.108 s
    # (lag 1.875 s).
    "b": {
        "src": T("sb-raw.mov"),
        "keep": [(7.7, 20.3)],
        "clips": [("s1-rightclick.wav", 14.108, 12.233)],
    },
    # (c) the popup, cursor recorded: a real drag selects sentence 1, a real click on the pinned toolbar button opens
    # the popup, a real click opens the native voice list, the pointer walks it to Emma and picks her, Speak
    # (mouse-down 19.107, clip 20.355, lag 1.248 s); + three times -> 1.3x; a real wheel scroll brings sentence 2 up
    # (the page has 700 px of bottom padding for that: another app's window sat over the right of the screen, so the
    # drag had to start above it), a real drag selects it (that click closes the popup), the toolbar button opens it
    # again on Emma at 1.3x, Speak (mouse-down 38.877, clip 40.129, lag 1.252 s). Every cut falls inside a stretch
    # where no pixel moves (mpdecimate), so the pointer never jumps.
    "c": {
        "src": T("sc-raw.mov"),
        "keep": [
            (6.7, 9.6),
            (10.45, 12.2),
            (12.7, 13.75),
            (14.35, 16.1),
            (16.75, 17.4),
            (18.25, 27.6),
            (28.0, 30.1),
            (30.75, 32.95),
            (33.35, 35.5),
            (36.2, 44.05),
        ],
        "clips": [("s2-british.wav", 20.355, 19.107), ("s3-speed.wav", 40.129, 38.877)],
    },
    # the first half of (c) only, for the short README cut
    "c1": {
        "src": T("sc-raw.mov"),
        "keep": [
            (6.7, 9.6),
            (10.45, 12.2),
            (12.7, 13.75),
            (14.35, 16.1),
            (16.75, 17.4),
            (18.25, 27.9),
        ],
        "clips": [("s2-british.wav", 20.355, 19.107)],
    },
    # (d) helper stopped: right-click speak, the system voice reads it (live audio of the take). Click flash 11.105 s.
    "d": {
        "src": T("sd-raw.mov"),
        "keep": [(9.45, 16.55)],
        "live": True,
        "clicks": [11.105],
        "speech": (
            12.37,
            16.2,
            "A story spoken is a story shared, and the listener fills in the rest.",
        ),
        "caption": ("cap-d.png", 0.4, None),
    },
    # (e1) the helper's sockets (VHS, real shell): the same helper pid that spoke (b) and (c); final output held 2.8 s
    "e1": {
        "src": T("tapes/privacy.mp4"),
        "keep": [(0.3, 9.0)],
        "caption": ("cap-e1.png", 5.9, None),
    },
    # the same with its idle stretches removed (typing and every output kept), for the README cut
    "e1s": {
        "src": T("tapes/privacy.mp4"),
        "keep": [(0.3, 2.2), (2.8, 3.97), (4.7, 8.9)],
        "caption": ("cap-e1.png", 4.5, None),
    },
    # (e2) speak again through that helper. Click flash 10.942 s; clip at 12.227 s (lag 1.285 s). Not in the cut since
    # the 2026-09-24 retake round: it repeated (b) and added nothing on screen. The captioned terminal carries the
    # claim, and the helper it shows is the one that spoke (b) and (c).
    "e2": {
        "src": T("se-raw.mov"),
        "keep": [(9.3, 19.25)],
        "clips": [("s5-offline.wav", 12.227, 10.942)],
        "caption": ("cap-e2.png", 1.2, None),
    },
    "end": {"image": T("cards/end-1920x1080.png"), "dur": 4.0},
    "end-short": {"image": T("cards/end-1920x1080.png"), "dur": 3.0},
}
MASTER = ["title", "b", "c", "d", "e1", "end"]
# The README cut: the popup half of (c) (it opens on a real drag selection) and the privacy terminal. The hero already
# shows the right-click, and with real gestures (b) + (c1) alone would run past 30 s.
DEMO = ["c1", "e1s", "end-short"]
CHAPTERS = [
    ("title", "Select text, right-click, listen"),
    ("c", "Pick a voice and a speed"),
    ("d", "No helper, no network: what still works"),
]


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        sys.exit(f"FAIL {' '.join(cmd[:6])}...\n{r.stderr[-2000:]}")


def wav_len(wav):
    return float(
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


def speech_end(wav):
    """Seconds to the last sample above -40 dBFS (each clip ends in ~0.5 s of silence, which may sit in a crossfade)."""
    w = wave.open(os.path.join(AUD, wav))
    x = array.array("h", w.readframes(w.getnframes()))
    last = max(i for i, v in enumerate(x) if abs(v) > 327)
    return (last + 1) / w.getframerate()


def check(name, s):
    for wav, at, click in s.get("clips", []):
        span = (click, at + wav_len(wav))
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


def frames(s):
    return dict(
        s, keep=[(round(a * 30) / 30, round(b * 30) / 30) for a, b in s["keep"]]
    )


def audio_graph(s, total, k0, inputs, fc):
    """Append the scene's sound to inputs/fc as [a]: the take's own track (live), or silence with each clip on it.
    Input 0 is the take; k0 is the index of the next input."""
    n = len(s["keep"])
    if s.get("live"):
        fc.append(f"[0:a]asplit={n}" + "".join(f"[t{i}]" for i in range(n)))
        for i, (a, b) in enumerate(s["keep"]):
            fc.append(f"[t{i}]atrim=start={a}:end={b},asetpts=PTS-STARTPTS[u{i}]")
        # the take's own stereo 48 kHz track: resampling and the layout are no-ops, kept only as guards
        fc.append(
            "".join(f"[u{i}]" for i in range(n))
            + f"concat=n={n}:v=0:a=1,aresample=48000,aformat=channel_layouts=stereo,apad,atrim=0:{total}[a]"
        )
    else:
        inputs += ["-f", "lavfi", "-t", f"{total}", "-i", "anullsrc=r=48000:cl=stereo"]
        mix = [f"[{k0}:a]"]
        for k, (wav, at, _click) in enumerate(s.get("clips", [])):
            inputs += ["-i", os.path.join(AUD, wav)]
            ms = round(seg_time(s, at) * 1000)
            fc.append(
                f"[{k0 + 1 + k}:a]aresample=48000,pan=stereo|c0=c0|c1=c0,adelay={ms}|{ms}[c{k}]"
            )
            mix.append(f"[c{k}]")
        fc.append(
            "".join(mix)
            + f"amix=inputs={len(mix)}:normalize=0:duration=first,atrim=0:{total}[a]"
        )


def segment_audio(name, out):
    """--remux-audio: the scene's sound alone, the same samples segment() puts in its .mov, as 16-bit PCM."""
    s = SCENES[name]
    if "image" in s:
        run(
            [
                "ffmpeg",
                "-v",
                "error",
                "-y",
                "-f",
                "lavfi",
                "-t",
                str(s["dur"]),
                "-i",
                "anullsrc=r=48000:cl=stereo",
                "-c:a",
                "pcm_s16le",
                out,
            ]
        )
        return s["dur"]
    s = frames(s)
    check(name, s)
    total = sum(b - a for a, b in s["keep"])
    inputs, fc = ["-i", s["src"]], []
    audio_graph(s, total, 1, inputs, fc)
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
            "[a]",
            "-c:a",
            "pcm_s16le",
            "-t",
            f"{total}",
            out,
        ]
    )
    return total


# Output options that concern the sound or the container; --remux-audio keeps these and copies the video.
AUDIO_AND_CONTAINER = {"-c:a", "-b:a", "-ar", "-ac", "-movflags", "-use_editlist"}


def segment(name, w, h, out):
    s = SCENES[name]
    enc = [
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
    ]
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
                *enc,
                "-shortest",
                out,
            ]
        )
        return s["dur"]
    # Cut on whole frames: every range becomes [A/30, B/30), so video and audio lengths match exactly at each join.
    s = frames(s)
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
        + f"concat=n={n}:v=1:a=0,scale={w}:{h}:flags=lanczos[vs]"
    )
    inputs = ["-i", s["src"]]
    k0 = 1
    if s.get("caption"):
        png, a, b = s["caption"]
        inputs += ["-i", T(f"cards/{png}")]
        fc.append(f"[1:v]scale={w}:{h}:flags=lanczos,format=rgba[cap]")
        fc.append(
            f"[vs][cap]overlay=0:0:enable='between(t,{a},{total if b is None else b})',format=yuv420p[v]"
        )
        k0 = 2
    else:
        fc.append("[vs]format=yuv420p[v]")
    audio_graph(s, total, k0, inputs, fc)
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
            *enc,
            "-t",
            f"{total}",
            out,
        ]
    )
    return total


def build(order, w, h, out, venc, no_editlist=False, old=None):
    work = os.path.join(
        os.path.dirname(os.path.abspath(out)), f"seg-{w}" + ("-audio" if old else "")
    )
    os.makedirs(work, exist_ok=True)
    parts, durs, starts = [], [], {}
    t = 0.0
    for i, name in enumerate(order):
        p = os.path.join(work, f"{name}.wav" if old else f"{name}.mov")
        d = segment_audio(name, p) if old else segment(name, w, h, p)
        start = 0.0 if i == 0 else t - FADE
        s = SCENES[name]
        if "keep" in s:
            for wav, at, _ in s.get("clips", []):
                st = seg_time(frames(s), at)
                if st < FADE or st + speech_end(wav) > d - FADE:
                    sys.exit(f"{name}: {wav} would sound inside a {FADE} s crossfade")
        starts[name] = start
        parts.append(p)
        durs.append(d)
        print(f"  {name:9s} starts {start:6.2f}s  length {d:5.2f}s")
        t = start + d
    ins = sum((["-i", p] for p in parts), [])
    fc, vprev, aprev, acc = [], "[0:v]", "[0:a]", durs[0]
    for i in range(1, len(parts)):
        if not old:
            fc.append(
                f"{vprev}[{i}:v]xfade=transition=fade:duration={FADE}:offset={acc - FADE:.4f}[xv{i}]"
            )
        fc.append(f"{aprev}[{i}:a]acrossfade=d={FADE}:c1=tri:c2=tri[xa{i}]")
        vprev, aprev, acc = f"[xv{i}]", f"[xa{i}]", acc + durs[i] - FADE
    if no_editlist:
        # Without an edit list (-use_editlist 0) the muxer starts the video at its 2-frame B-frame delay (66.7 ms)
        # while the audio keeps its 1024-sample AAC priming (21.3 ms) at the front, so a decoder puts every sound
        # 45.3 ms ahead of its picture. Delaying the mix by the difference (2176 samples at 48 kHz) puts them back
        # together; measured in the finished file, click flash to clip onset equals the take's lag.
        fc.append(f"{aprev}adelay=2176S|2176S[xaout]")
        aprev = "[xaout]"
    if old:
        keep = [
            o
            for i in range(0, len(venc), 2)
            if venc[i] in AUDIO_AND_CONTAINER
            for o in venc[i : i + 2]
        ]
        if no_editlist:
            # The copied video keeps the old file's timestamps: dts from 0, pts from its B-frame delay. A fresh
            # encode hands the muxer dts from MINUS that delay, and the muxer's shift to non-negative timestamps is
            # what places the sound (first AAC packet 45.3 ms long); move the copy back by the delay so the muxer
            # sees the same thing and writes the same timestamps.
            v0 = subprocess.run(
                [
                    "ffprobe",
                    "-v",
                    "error",
                    "-select_streams",
                    "v:0",
                    "-show_entries",
                    "stream=start_time",
                    "-of",
                    "csv=p=0",
                    old,
                ],
                capture_output=True,
                text=True,
            ).stdout.strip()
            ins += ["-itsoffset", f"-{v0}"]
        ins += ["-i", old]
        run(
            [
                "ffmpeg",
                "-v",
                "error",
                "-y",
                *ins,
                "-filter_complex",
                ";".join(fc),
                "-map",
                f"{len(parts)}:v",
                "-map",
                aprev,
                "-c:v",
                "copy",
                *keep,
                out,
            ]
        )
        print(f"{out}: {acc:.2f}s (sound rebuilt, video copied from {old})")
        return starts, acc
    run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-y",
            *ins,
            "-filter_complex",
            ";".join(fc),
            "-map",
            vprev,
            "-map",
            aprev,
            *venc,
            out,
        ]
    )
    print(f"{out}: {acc:.2f}s")
    return starts, acc


def timeline(order, starts, total, out):
    clips, live = [], []
    for name in order:
        s = SCENES[name]
        for wav, at, _ in s.get("clips", []):
            clips.append(
                {"id": wav[:-4], "at": round(starts[name] + seg_time(frames(s), at), 3)}
            )
        if s.get("speech"):
            a, b, text = s["speech"]
            live.append(
                {
                    "from": round(starts[name] + seg_time(frames(s), a), 3),
                    "to": round(starts[name] + seg_time(frames(s), b), 3),
                    "text": text,
                }
            )
    chapters = [
        {"at": round(0 if starts[n] == 0 else starts[n] + FADE / 2, 1), "title": title}
        for n, title in CHAPTERS
        if n in starts
    ]
    json.dump(
        {
            "duration": round(total, 3),
            "clips": clips,
            "live": live,
            "chapters": chapters,
        },
        open(out, "w"),
        indent=2,
    )
    print(f"{out}: {len(clips)} clips, {len(chapters)} chapters")


VENC_COMMON = [
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
    "-bsf:v",
    "h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1",
    "-ar",
    "48000",
    "-ac",
    "2",
    "-movflags",
    "+faststart",
]
print("master")
starts, total = build(
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
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        *VENC_COMMON,
        "-use_editlist",
        "0",
    ],
    no_editlist=True,
    old=old_master if REMUX else None,
)
timeline(MASTER, starts, total, os.path.splitext(out_master)[0] + ".timeline.json")
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
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        *VENC_COMMON,
    ],
    old=old_demo if REMUX else None,
)
