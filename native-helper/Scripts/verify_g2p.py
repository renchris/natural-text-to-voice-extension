#!/usr/bin/env python3
"""Fail-closed check of the text path: tts_worker.normalize_text -> misaki G2P (as mlx-audio builds it).

Rows 1-4 are the R02 section 9 cases (typographic punctuation must survive normalize_text so misaki
reads "we're", "I'll", keeps the dashes and says "three five", not "thirty-five"); rows 5-6 prove the
emoji and non-Latin scripts are still dropped (no "grinning face", no letter-by-letter Cyrillic).
Rows 1-4 depend on IN-04 (typographic punctuation kept); they fail on the pre-1.5 ASCII fold.
Rows 7-11 are the long-token budget (break_long_tokens): after normalize_text no misaki token and no
chunk of mlx-audio's English chunker (KokoroPipeline.en_tokenize) exceeds Kokoro's 510 phonemes, so
nothing is truncated, and no letter or digit is dropped on the way (a 320-digit number, a 600-character
URL, a 64-character hash, a digit run with zeros, and a 250-word run-on sentence with no punctuation).
Row 12: a round number of 16-30 digits keeps its magnitude ("one quintillion", not "one hundred zero zero ...").

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

    import logging

    from misaki import en, espeak

    # espeak's phonemizer warns "words count mismatch" for every spelled-out hash or URL piece; not a result.
    logging.getLogger("phonemizer").setLevel(logging.ERROR)

    # Exactly how mlx-audio 0.5.5 builds the American pipeline (kokoro/pipeline.py).
    g2p = en.G2P(
        trf=False, british=False, fallback=espeak.EspeakFallback(british=False), unk=""
    )

    from mlx_audio.tts.models.kokoro.pipeline import KokoroPipeline

    def phon(text):
        return g2p(text)[0] if text else ""

    BUDGET = 510  # Kokoro's phonemes per chunk (mlx-audio truncates past it)

    def within_budget(n):
        """Every misaki token and every en_tokenize chunk of n fits the budget. en_tokenize only uses
        classmethods, so it runs without a model."""
        tokens = g2p(n)[1]
        if max((len(t.phonemes or "") for t in tokens), default=0) > BUDGET:
            return False
        chunks = [ps for _, ps, _ in KokoroPipeline.en_tokenize(None, tokens)]
        return bool(chunks) and max(len(ps) for ps in chunks) <= BUDGET

    def alnum(text):
        return "".join(c for c in text if c.isalnum())

    digits_320 = "7" * 320
    url_600 = ("https://docs.example.com/" + "chapter-7/section-42/item-913?view=full&lang=en/" * 13)[:600]
    hash_64 = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"
    zeros = "100000000000000007"
    run_on = " ".join(
        ("the quick brown fox jumps over the lazy dog while seven tired painters carry heavy ladders home").split()
        * 20
    )
    run_on = " ".join(run_on.split()[:250])

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
        (
            f"The modulus is {digits_320} and that is all.",
            [
                ("all 320 digits kept", lambda n, p: n.count("7") == 320),
                ("read in groups of three", lambda n, p: "777 777 777" in n),
                ("within 510 phonemes per token and chunk", lambda n, p: within_budget(n)),
            ],
        ),
        (
            f"See {url_600} for details.",
            [
                ("every letter and digit kept", lambda n, p: alnum(n) == alnum(f"See {url_600} for details.")),
                ("slashes still read (slˈæʃ)", lambda n, p: "slˈæʃ" in p),
                ("within 510 phonemes per token and chunk", lambda n, p: within_budget(n)),
            ],
        ),
        (
            f"The checksum is {hash_64}.",
            [
                ("every letter and digit kept", lambda n, p: alnum(n) == alnum(f"The checksum is {hash_64}.")),
                ("within 510 phonemes per token and chunk", lambda n, p: within_budget(n)),
            ],
        ),
        (
            f"Order {zeros} shipped.",
            [
                ("leading zeros spoken one by one", lambda n, p: n == "Order 100 0 0 0 0 0 0 0 0 0 0 0 0 0 0 7 shipped."),
                ("a phoneme for every zero", lambda n, p: all(t.phonemes for t in g2p(n)[1] if t.text == "0")),
            ],
        ),
        (
            run_on,
            [
                ("a run-on sentence is left alone", lambda n, p: n == run_on),
                ("within 510 phonemes per chunk (chunked, not truncated)", lambda n, p: within_budget(n)),
                ("every word in some chunk",
                 lambda n, p: sum(len(t) for _, _, t in KokoroPipeline.en_tokenize(None, g2p(n)[1])) == len(g2p(n)[1])),
            ],
        ),
        (
            "1 ether = 1000000000000000000 wei. It costs 10000000000000000 tokens.",
            [
                ("round numbers kept whole", lambda n, p: n == "1 ether = 1000000000000000000 wei. It costs 10000000000000000 tokens."),
                ("read as quintillion and quadrillion (kwɪntˈɪljən, kwɑdɹˈɪljən)",
                 lambda n, p: "kwɪntˈɪljən" in p and "kwɑdɹˈɪljən" in p and "zˈɪɹO" not in p),
            ],
        ),
        (
            "Short things stay: 1234567, https://ex.com/a and 4111111111111.",
            [
                ("ordinary numbers and short URLs untouched",
                 lambda n, p: n == "Short things stay: 1234567, https://ex.com/a and 4111111111111."),
            ],
        ),
    ]

    def run(f, n, p):
        try:
            return bool(f(n, p))
        except Exception as e:  # a check that raises (misaki's OverflowError) is a failure, not a crash
            print(f"  check raised {type(e).__name__}", file=sys.stderr)
            return False

    failed = 0
    for text, checks in rows:
        n = normalize_text(text)
        try:
            p = phon(n)
        except Exception as e:
            print(f"  G2P raised {type(e).__name__}", file=sys.stderr)
            p = ""
        results = [(d, run(f, n, p)) for d, f in checks]
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
