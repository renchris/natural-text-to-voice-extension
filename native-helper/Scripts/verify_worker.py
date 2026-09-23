#!/usr/bin/env python3
"""Fail-closed protocol check for the helper's Python worker (tts_worker.py).

Spawns the worker exactly as PythonWorker.swift does (4-byte little-endian length prefix + JSON on
stdin/stdout, logs on stderr) and asserts:

  * exactly 3 OK responses, each a 24 kHz / mono / 16-bit WAV, for af_bella, bf_emma and af_heart;
  * the `empty_text` error for "" and the `invalid_speed` error for speed 0;
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
]


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
                print(f"ERR voice={req.get('voice')} -> {resp}  latency={dt:.2f}s")
                check(
                    resp.get("error") == expect,
                    f"voice={req.get('voice')} expected {expect!r}, got {resp}",
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

    check(
        ok_voices == ["af_bella", "bf_emma", "af_heart"],
        f"OK voices {ok_voices}, want af_bella,bf_emma,af_heart",
    )
    check(len(rest) == 0, f"stray_stdout_bytes={len(rest)}")
    check(rc == 0, f"exit={rc}")
    check(
        any(line.rstrip().endswith(SENTINEL) for line in stderr.splitlines()),
        f"stderr lacks the sentinel line {SENTINEL!r}",
    )

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
