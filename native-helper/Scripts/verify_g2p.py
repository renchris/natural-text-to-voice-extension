#!/usr/bin/env python3
"""Fail-closed check of the text path: tts_worker.normalize_text -> misaki G2P (as mlx-audio builds it).

Rows 1-4 are the R02 section 9 cases (typographic punctuation must survive normalize_text so misaki
reads "we're", "I'll", keeps the dashes and says "three five", not "thirty-five"); rows 5-6 prove the
emoji and non-Latin scripts are still dropped (no "grinning face", no letter-by-letter Cyrillic).
Rows 1-4 depend on IN-04 (typographic punctuation kept); they fail on the pre-1.5 ASCII fold.

Usage (from native-helper/):
  Sources/NaturalTTSHelper/Resources/python-env/bin/python3 Scripts/verify_g2p.py [WORKER]
WORKER defaults to the bundled tts_worker.py; only its normalize_text() is imported (main() never runs).
"""

import importlib.util
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_WORKER = os.path.join(
    os.path.dirname(HERE), "Sources", "NaturalTTSHelper", "Resources", "tts_worker.py"
)
# Same espeak-ng data the helper gives the worker (PythonWorker.swift sets ESPEAK_DATA_PATH).
os.environ.setdefault(
    "ESPEAK_DATA_PATH", "/opt/homebrew/opt/espeak-ng/share/espeak-ng-data"
)
os.environ.setdefault("HF_HUB_OFFLINE", "1")


def load_normalize(path):
    spec = importlib.util.spec_from_file_location("tts_worker_under_test", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.normalize_text


def main():
    worker = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_WORKER
    normalize_text = load_normalize(worker)

    from misaki import en, espeak

    # Exactly how mlx-audio 0.5.5 builds the American pipeline (kokoro/pipeline.py).
    g2p = en.G2P(
        trf=False, british=False, fallback=espeak.EspeakFallback(british=False), unk=""
    )

    def phon(text):
        return g2p(text)[0] if text else ""

    ref_great_job = phon("Great job")

    # (input, [(description, predicate(normalized, phonemes))])
    rows = [
        (
            "We’re sure you’ll love it — it’s great.",
            [
                ("reads we're (wˌɪɹ)", lambda n, p: "wˌɪɹ" in p),
                ("em dash kept", lambda n, p: "—" in p),
            ],
        ),
        (
            "I’ll read “Café Society” on \U0001d69f\U0001d692\U0001d69d\U0001d68e…",
            [
                ("reads I'll (ˌIl)", lambda n, p: "ˌIl" in p),
                ("math monospace folded to vite", lambda n, p: "vite" in n),
            ],
        ),
        (
            "Tech—like AI—moves fast.",
            [
                ("em dashes kept", lambda n, p: p.count("—") == 2),
                ("no 'Techlike' merge", lambda n, p: "tˈɛkl" not in p),
            ],
        ),
        (
            "Don’t stop; it’s 3–5 pm.",
            [
                ("3–5 is three five (θɹˈi)", lambda n, p: "θɹˈi" in p),
                ("not thirty-five", lambda n, p: "θˈɜɹTi" not in p),
            ],
        ),
        (
            "Great job \U0001f600",
            [
                ("emoji dropped", lambda n, p: n == "Great job"),
                ("no phonemes for the emoji", lambda n, p: p == ref_great_job),
            ],
        ),
        (
            "Москва",
            [
                ("Cyrillic dropped", lambda n, p: n == ""),
                ("no phonemes", lambda n, p: p == ""),
            ],
        ),
    ]

    failed = 0
    for text, checks in rows:
        n = normalize_text(text)
        p = phon(n)
        results = [(d, bool(f(n, p))) for d, f in checks]
        ok = all(r for _, r in results)
        failed += not ok
        print(
            json.dumps(
                {
                    "in": text,
                    "normalized": n,
                    "phonemes": p,
                    "ok": ok,
                    "failed": [d for d, r in results if not r],
                },
                ensure_ascii=False,
            )
        )
    print(
        f"verify_g2p: {'PASS' if not failed else 'FAIL'} ({len(rows) - failed}/{len(rows)} rows)"
    )
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
