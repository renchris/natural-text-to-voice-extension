#!/usr/bin/env python3
"""Fail-closed protocol check for the helper's Python worker (tts_worker.py).

Spawns the worker exactly as PythonWorker.swift does (4-byte little-endian length prefix + JSON on
stdin/stdout, logs on stderr) and asserts:

  * an OK response, each a 24 kHz / mono / 16-bit WAV, for every request expected "ok" (af_bella,
    bf_emma, af_heart, and a 64-digit number that crosses mlx-audio's 510-phoneme warning);
  * the `empty_text` error for "" and the `invalid_speed` error for speed 0, and an `internal_error:`
    code (never the exception message) for a 320-digit number that makes num2words raise;
  * privacy: every stderr line comes from the worker's own "[worker] " logger, with no phoneme dump
    and no request text;
  * no stray bytes on stdout after the last frame, and exit code 0 on stdin EOF;
  * stderr carries the exact readiness sentinel PythonWorker.swift matches.

Usage (from native-helper/):
  E=Sources/NaturalTTSHelper/Resources/python-env/bin/python3
  $E Scripts/verify_worker.py [PYTHON] [WORKER]
PYTHON defaults to the interpreter running this script; WORKER defaults to the bundled tts_worker.py.
Exit 0 only if every assertion holds. Derived from the R02 driver (docs/research/2026-09-upgrade/R02).
"""

import base64
import io
import json
import os
import struct
import subprocess
import sys
import tempfile
import time
import wave

HERE = os.path.dirname(os.path.abspath(__file__))
HELPER = os.path.dirname(HERE)
DEFAULT_WORKER = os.path.join(
    HELPER, "Sources", "NaturalTTSHelper", "Resources", "tts_worker.py"
)
SENTINEL = (
    "Model loaded, ready for requests"  # PythonWorker.swift matches this exact text
)
# PythonWorker.swift always sets this for the worker (Homebrew espeak-ng 1.52.0 data). Without it the
# bundled libespeak-ng falls back to its compiled-in CI path and the first request kills the worker.
ESPEAK_DATA_PATH = "/opt/homebrew/opt/espeak-ng/share/espeak-ng-data"

LONG_TOKEN = "4111" * 16  # 64 digits: ~950 phonemes, one chunk
LONG_TOKEN_TEXT = f"My card number is {LONG_TOKEN} and my PIN is 9876."
OVERFLOW_TOKEN = "7" * 320
OVERFLOW_TEXT = f"The modulus is {OVERFLOW_TOKEN} and that is all."
WORKER_LINE_PREFIX = "[worker] "  # PythonWorker.swift logs only lines with this prefix at info

REQUESTS = [
    (
        {
            "text": "Hello there. This is the migrated worker.",
            "voice": "af_bella",
            "speed": 1.0,
        },
        "ok",
    ),
    (
        {
            "text": "We’re sure you’ll love it — it’s great.\n\nTech—like AI—moves fast; 3–5 pm.",
            "voice": "bf_emma",
            "speed": 1.2,
        },
        "ok",
    ),
    (
        {
            "text": "Reading \U0001d69f\U0001d692\U0001d69d\U0001d68e docs…",
            "voice": "af_heart",
            "speed": 0.9,
        },
        "ok",
    ),
    ({"text": "", "voice": "af_bella"}, "empty_text"),
    ({"text": "x", "voice": "af_bella", "speed": 0}, "invalid_speed"),
    # Privacy: one token over 510 phonemes made mlx-audio log the whole phoneme string (the number,
    # spelled out) through the root logger, which reached the helper log.
    ({"text": LONG_TOKEN_TEXT, "voice": "af_bella", "speed": 1.0}, "ok"),
    # Privacy: a 320-digit number makes num2words raise OverflowError quoting the number. The worker
    # must answer with a code, never str(e).
    ({"text": OVERFLOW_TEXT, "voice": "af_bella", "speed": 1.0}, "internal_error"),
]


def bounds_phase(py, worker, env, check):
    """A second worker, with NTTS_MAX_AUDIO_SECONDS=2: an oversized request frame is drained and answered
    `text_too_long` (it used to be read as a shutdown, and the helper then died of SIGPIPE writing the
    rest), a request past the audio bound is answered `audio_too_long` (it used to produce a response
    frame over the helper's 100 MiB cap, which desynced the pipe for good), and the worker still serves a
    normal request afterwards, so the stream stayed in sync."""
    p = subprocess.Popen(
        [py, worker],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        env=dict(env, NTTS_MAX_AUDIO_SECONDS="2"),
    )

    def recv():
        h = p.stdout.read(4)
        if len(h) != 4:
            return None
        return json.loads(p.stdout.read(struct.unpack("<I", h)[0]))

    def send(o):
        b = json.dumps(o).encode()
        p.stdin.write(struct.pack("<I", len(b)) + b)
        p.stdin.flush()

    try:
        big = 11 * 1024 * 1024
        p.stdin.write(struct.pack("<I", big) + b"x" * big)
        p.stdin.flush()
        r = recv()
        print(f"BOUNDS oversized frame -> {r}")
        check(r == {"error": "text_too_long"}, f"oversized frame answered {r}, want text_too_long")
        send({"text": "This sentence is certainly longer than two seconds when it is read aloud at normal speed.", "voice": "af_bella", "speed": 1.0})
        r = recv()
        print(f"BOUNDS long audio -> {r}")
        check(r == {"error": "audio_too_long"}, f"audio past the bound answered {r}, want audio_too_long")
        send({"text": "Hi.", "voice": "af_bella", "speed": 1.0})
        r = recv()
        ok = isinstance(r, dict) and "audio_base64" in r
        print(f"BOUNDS short after -> {'audio' if ok else r}")
        check(ok, f"worker did not serve a normal request after the bounded ones: {r}")
    except (BrokenPipeError, OSError) as e:
        check(False, f"bounds phase: worker pipe broke: {e}")
    finally:
        try:
            p.stdin.close()
        except OSError:
            pass
        try:
            p.wait(timeout=60)
        except subprocess.TimeoutExpired:
            p.kill()
            p.wait()


def main():
    py = sys.argv[1] if len(sys.argv) > 1 else sys.executable
    worker = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_WORKER
    env = dict(os.environ, HF_HUB_OFFLINE="1", ESPEAK_DATA_PATH=ESPEAK_DATA_PATH)
    if (
        os.environ.get("DRV_UNSET_ESPEAK") == "1"
    ):  # reproduce a spawn without the Swift override
        env.pop("ESPEAK_DATA_PATH", None)
    failures = []

    def check(cond, msg):
        if not cond:
            failures.append(msg)
        return cond

    t0 = time.time()
    with tempfile.TemporaryFile() as err:
        p = subprocess.Popen(
            [py, worker],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=err,
            env=env,
        )

        def send(o):
            b = json.dumps(o).encode()
            p.stdin.write(struct.pack("<I", len(b)) + b)
            p.stdin.flush()

        def recv():
            h = p.stdout.read(4)
            if len(h) != 4:
                return None
            n = struct.unpack("<I", h)[0]
            return json.loads(p.stdout.read(n))

        ok_voices = []
        for req, expect in REQUESTS:
            t = time.time()
            try:
                send(req)
                resp = recv()
            except (BrokenPipeError, OSError) as e:
                resp = None
                check(False, f"worker pipe broke on voice={req.get('voice')}: {e}")
            dt = time.time() - t
            if resp is None:
                check(False, f"no response for voice={req.get('voice')} (worker died?)")
                print(f"ERR voice={req.get('voice')} -> <no response>")
                break
            if "audio_base64" in resp:
                w = wave.open(io.BytesIO(base64.b64decode(resp["audio_base64"])))
                sr, ch, width, frames = (
                    w.getframerate(),
                    w.getnchannels(),
                    w.getsampwidth(),
                    w.getnframes(),
                )
                print(
                    f"OK  voice={req['voice']:8} sr={sr} ch={ch} width={width} frames={frames} "
                    f"dur={resp.get('duration', 0):.2f}s latency={dt:.2f}s"
                )
                check(
                    expect == "ok",
                    f"voice={req['voice']} expected error {expect!r}, got audio",
                )
                check(
                    (sr, ch, width) == (24000, 1, 2),
                    f"voice={req['voice']} format {sr}/{ch}/{width}, want 24000/1/2",
                )
                check(frames > 0, f"voice={req['voice']} returned 0 frames")
                if expect == "ok":
                    ok_voices.append(req["voice"])
            else:
                shown = {k: (v[:80] + "…" if isinstance(v, str) and len(v) > 80 else v) for k, v in resp.items()}
                print(f"ERR voice={req.get('voice')} -> {shown}  latency={dt:.2f}s")
                code = str(resp.get("error", ""))
                check(
                    code == expect or code.startswith(expect + ":"),
                    f"voice={req.get('voice')} expected {expect!r}, got {shown}",
                )
                check(
                    "7777777777777777" not in code,
                    "a worker error response quotes the request text",
                )

        try:
            p.stdin.close()
        except OSError:
            pass
        rest = p.stdout.read()
        try:
            rc = p.wait(timeout=60)
        except subprocess.TimeoutExpired:
            p.kill()
            rc = p.wait()
        print(f"stray_stdout_bytes={len(rest)} exit={rc} total={time.time() - t0:.1f}s")
        err.seek(0)
        stderr = err.read().decode("utf-8", "replace")

    want_ok = [req["voice"] for req, expect in REQUESTS if expect == "ok"]
    check(ok_voices == want_ok, f"OK voices {ok_voices}, want {want_ok}")
    # Privacy: stderr is what the helper forwards to its log. Every line must come from the worker's own
    # logger, and none may carry the request text or its phoneme transcription.
    lines = [line for line in stderr.splitlines() if line.strip()]
    foreign = [line for line in lines if not line.startswith(WORKER_LINE_PREFIX)]
    check(not foreign, f"{len(foreign)} stderr line(s) not from the worker's logger, first: {foreign[:1]}")
    check(not any("ps ==" in line or "len(ps)" in line for line in lines), "stderr carries a phoneme dump")
    for secret in (LONG_TOKEN[:16], OVERFLOW_TOKEN[:16], "My card number"):
        check(secret not in stderr, f"stderr carries request text ({secret[:8]}…)")
    check(len(rest) == 0, f"stray_stdout_bytes={len(rest)}")
    check(rc == 0, f"exit={rc}")
    check(
        any(line.rstrip().endswith(SENTINEL) for line in stderr.splitlines()),
        f"stderr lacks the sentinel line {SENTINEL!r}",
    )

    bounds_phase(py, worker, env, check)

    if failures:
        print("verify_worker: FAIL", file=sys.stderr)
        for f in failures:
            print(f"  - {f}", file=sys.stderr)
        tail = "\n".join(stderr.splitlines()[-15:])
        print(f"--- worker stderr (tail) ---\n{tail}", file=sys.stderr)
        sys.exit(1)
    print("verify_worker: PASS")


if __name__ == "__main__":
    main()
