#!/usr/bin/env python3
"""
Natural TTS Helper - Python MLX Worker
Communicates with Swift via stdin/stdout using Native Messaging protocol
"""

import os

# Offline, always: the model is cached by Scripts/setup-python-env.sh, so the worker never needs the
# network. Forced, not defaulted: huggingface_hub reads "0" or "" as online, so a shell that exports
# HF_HUB_OFFLINE=0 used to send a Hub request at every worker start. Must run before anything imports
# huggingface_hub (it reads the variables at import time).
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"

import sys
import json
import math
import re
import base64
import logging
from io import BytesIO

# Logging, and why it is built this way (privacy). PythonWorker.swift forwards the worker's stderr into
# the helper log, and libraries write text-derived data there: mlx-audio's KokoroPipeline logs the full
# phoneme transcription of any chunk over 510 phonemes through the ROOT logger, whose handler keeps the
# stderr object it was created with, so redirect_stderr() around generate() never silenced it. So the
# worker's own logger is the only writer that can reach the helper: route_logs_privately() (run by main(),
# so importing this module for tests has no side effects) gives it a private duplicate of fd 2 and points
# fd 2 and sys.stderr at /dev/null for everything else (library loggers, warnings, C libraries such as
# espeak-ng). Every line it writes starts with "[worker] " and is one physical line, so the helper can
# forward exactly these lines and drop anything else.
logger = logging.getLogger("tts_worker")
logger.setLevel(logging.INFO)
logger.propagate = False
logger.addHandler(logging.NullHandler())


class _OneLineFormatter(logging.Formatter):
    def format(self, record):
        return super().format(record).replace("\n", " | ")


def route_logs_privately():
    log_stream = os.fdopen(os.dup(2), "w", buffering=1, encoding="utf-8", errors="replace")
    devnull_fd = os.open(os.devnull, os.O_WRONLY)
    os.dup2(devnull_fd, 2)
    os.close(devnull_fd)
    sys.stderr = open(os.devnull, "w")

    handler = logging.StreamHandler(log_stream)
    handler.setFormatter(_OneLineFormatter("[worker] [%(levelname)s] %(message)s"))
    logger.handlers[:] = [handler]
    # Library records stop at the root logger, which only has a NullHandler (and so never falls back to
    # logging.lastResort either).
    logging.getLogger().handlers[:] = [logging.NullHandler()]

    def log_uncaught(exc_type, exc, tb):
        logger.critical(f"Uncaught {exc_type.__name__}", exc_info=(exc_type, exc, tb))

    sys.excepthook = log_uncaught


def describe_exception(e):
    """Type and raising location of an exception, never its message: messages can quote the input (a
    310-digit number makes num2words raise OverflowError('abs(<the number>) must be ...'))."""
    import traceback

    frames = traceback.extract_tb(e.__traceback__)
    where = f" at {os.path.basename(frames[-1].filename)}:{frames[-1].lineno}" if frames else ""
    return f"{type(e).__name__}{where}"

MODEL_ID = "prince-canuma/Kokoro-82M"
# The model is pinned to one Hub commit, as the Python environment is pinned by uv.lock. Weights AND voices
# load from that commit's snapshot: by repo id alone mlx-audio resolves the cache's refs/main, i.e. whatever
# upstream main held the day setup ran (voices are fetched by id, with no revision, even when load_model is
# given one). Scripts/setup-python-env.sh reads this line and fetches exactly this commit. Change it only
# together with a fidelity re-run (Scripts/ref_compare.py).
MODEL_REVISION = "e02c9eada7ce7416798af36b190a8a2dd2ecd566"
# What the worker needs from the snapshot; setup fetches the same set.
MODEL_FILES = ["config.json", "*.safetensors"]
SETUP_HINT = "run Scripts/setup-python-env.sh (model not cached or dependency missing)"
# Voice for a request that names none (the helper always names one; OD-5: af_heart, grade A).
DEFAULT_VOICE = "af_heart"
# One warm-up generation per English pipeline (lang_code, voice), in this order, before the ready line.
WARMUP_VOICES = (("a", DEFAULT_VOICE), ("b", "bf_emma"))
PEAK_LIMIT = 0.98
SAMPLE_RATE = 24000
# Largest request frame the worker accepts. The helper caps request text far below this (HTTPServer.swift
# maxTextBytes), so a bigger frame is a bug or a hostile client, and it is drained and answered rather than
# treated as a shutdown.
MAX_MESSAGE_BYTES = 10 * 1024 * 1024
# Longest audio one response may carry. The helper rejects a response frame of 100 MiB or more
# (PythonWorker.swift maxResponseBytes); 20 minutes of 16-bit mono WAV is 57.6 MB, 76.8 MB as base64.
# 5,000 digit-dense characters at 1.0x made ~38 minutes, which used to desync the pipe for good.
MAX_AUDIO_SECONDS = float(os.environ.get("NTTS_MAX_AUDIO_SECONDS", "1200"))
# The helper writes a request's id here when that request's HTTP client goes away (Stop, or a newer
# selection superseding it); generation stops at the next chunk and answers "cancelled", so the discarded
# synthesis does not hold the worker while the next request waits.
CANCEL_FILE = os.environ.get("NTTS_CANCEL_FILE")
# Bound on MLX's buffer cache (freed GPU buffers kept for reuse). Unbounded, the cache defaults to the memory
# limit (1.5x the GPU's recommended working set), and inside one segment's forward pass it grew to ~4.2 GB on
# top of ~3.2 GB of live arrays: the worker's physical footprint peaked at 7.9 GB, enough to push an 8 GB Mac
# into swap. mlx-audio already clears the cache after every segment, so only this limit bounds that growth.
# The value is measured (docs/research/2026-09-upgrade/W2-integration-measurements.md §9): the smallest
# limit that costs <= 5% real-time factor. Set with MLX's top-level API (mx.metal.* is deprecated in 0.32).
MLX_CACHE_LIMIT_MB = int(os.environ.get("NTTS_MLX_CACHE_LIMIT_MB", "256"))

# Loudness normalization of every /speak response (ITU-R BS.1770-4 integrated loudness, gated). Kokoro
# speaks at about -23 to -28 LUFS and the macOS system voice the extension falls back to at about -13, so
# the engine switch was a jump of ~10 LU. One gain per response, never a compressor or limiter: the gain is
# the smallest of the one that reaches LOUDNESS_TARGET_LUFS, the one that puts the 4x-oversampled true peak
# at TRUE_PEAK_CEILING_DBTP (so no sample can clip) and MAX_GAIN_DB. Kokoro's speech runs 14-24 dB from
# true peak to loudness, more than the 14.5 dB between the target and the ceiling, so most responses stop
# at the ceiling below the target (W2-integration-measurements.md §10 has the numbers).
LOUDNESS_TARGET_LUFS = -16.0
TRUE_PEAK_CEILING_DBTP = -1.5
# BS.1770-4's absolute gate. A response whose loudness is below it is silence (or nearly), and is returned
# unchanged rather than amplified.
LOUDNESS_FLOOR_LUFS = -70.0
# Upper bound on the gain, so an almost-silent response is never lifted into audible noise. Kokoro's
# speech needs +3 to +12 dB.
MAX_GAIN_DB = 24.0
# Verification only: "0" returns the synthesis exactly as generated (the pre-normalization audio), so
# Scripts/ref_compare.py can hold the decoder's own level against the PyTorch reference. The helper never
# sets it.
LOUDNESS_NORMALIZE = os.environ.get("NTTS_LOUDNESS_NORMALIZE", "1") != "0"


def bound_mlx_memory():
    import mlx.core as mx

    mx.set_cache_limit(MLX_CACHE_LIMIT_MB * 1024 * 1024)
    logger.info(f"MLX buffer cache limit: {MLX_CACHE_LIMIT_MB} MB")


def release_mlx_cache():
    """Give the cache back once a request is answered, so an idle worker holds only the model. A failure
    here never turns into a failed request."""
    try:
        import mlx.core as mx

        mx.clear_cache()
    except Exception as e:
        logger.error(f"Could not clear the MLX cache: {describe_exception(e)}")


def is_cancelled(request_id):
    if request_id is None or not CANCEL_FILE:
        return False
    try:
        with open(CANCEL_FILE) as f:
            return f.read().strip() == str(request_id)
    except OSError:
        return False

# Global model cache for reuse across requests, and the pinned snapshot directory it was loaded from
_model_cache = None
_model_dir = None


def load_pinned_model():
    """Load the weights of MODEL_REVISION and remember its snapshot directory for the voices. Offline:
    fails if setup has not fetched that commit."""
    global _model_dir
    from huggingface_hub import snapshot_download
    from mlx_audio.tts.utils import load_model

    _model_dir = snapshot_download(
        MODEL_ID, revision=MODEL_REVISION, allow_patterns=MODEL_FILES, local_files_only=True
    )
    return load_model(MODEL_ID, revision=MODEL_REVISION)


def voice_file(voice):
    """The pinned snapshot's file for a voice id, or None if the snapshot lacks it. mlx-audio loads a
    voice given as a .safetensors path directly, instead of resolving the id through refs/main. With no
    pinned model loaded (a test stub) the id is returned unchanged."""
    if _model_dir is None:
        return voice
    path = os.path.join(_model_dir, "voices", f"{voice}.safetensors")
    return path if os.path.isfile(path) else None


class BadFrame(Exception):
    """A request frame that was read whole but cannot be served. The stream is still in sync, so the worker
    answers it with an error code instead of exiting (exiting made the helper's next write hit a closed
    pipe, and SIGPIPE killed the helper)."""

    def __init__(self, code):
        super().__init__(code)
        self.code = code


def read_message():
    """Read one length-prefixed JSON message from stdin (Native Messaging protocol).

    Returns the message, or None on EOF or the zero-length shutdown frame. Raises BadFrame for an oversized
    frame (drained first) or a body that is not UTF-8 JSON. Never logs the frame's bytes: they are the
    request text."""
    length_bytes = sys.stdin.buffer.read(4)
    if len(length_bytes) < 4:
        return None

    length = int.from_bytes(length_bytes, "little")
    if length == 0:
        return None
    if length > MAX_MESSAGE_BYTES:
        logger.error(f"Oversized request frame: {length} bytes; draining it")
        remaining = length
        while remaining:
            chunk = sys.stdin.buffer.read(min(remaining, 1 << 20))
            if not chunk:
                return None
            remaining -= len(chunk)
        raise BadFrame("text_too_long")

    message_bytes = sys.stdin.buffer.read(length)
    if len(message_bytes) != length:
        logger.error(f"Incomplete message: expected {length}, got {len(message_bytes)}")
        return None

    try:
        return json.loads(message_bytes.decode("utf-8"))
    except (UnicodeDecodeError, ValueError) as e:
        logger.error(f"Undecodable request frame: {describe_exception(e)}")
        raise BadFrame("bad_request")


def write_message(obj):
    """Write length-prefixed JSON message to stdout"""
    try:
        message_bytes = json.dumps(obj).encode("utf-8")
        length = len(message_bytes).to_bytes(4, "little")
        sys.stdout.buffer.write(length)
        sys.stdout.buffer.write(message_bytes)
        sys.stdout.buffer.flush()
    except Exception as e:
        logger.error(f"Error writing message: {describe_exception(e)}")


def get_cached_model():
    """Get or create cached MLX model instance"""
    global _model_cache
    if _model_cache is None:
        logger.info("Loading model (first time)...")
        _model_cache = load_pinned_model()
        logger.info("Model loaded and cached")
    else:
        logger.info("Using cached model")
    return _model_cache


def load_mlx_model():
    """Eagerly load Kokoro weights and run one warm-up generation so the first /speak is fast and a
    missing dependency (e.g. misaki) fails here, at startup, instead of on the first request."""
    global _model_cache
    try:
        from contextlib import redirect_stdout, redirect_stderr

        bound_mlx_memory()
        logger.info(f"Eagerly loading Kokoro weights at startup (revision {MODEL_REVISION[:7]})...")
        _model_cache = load_pinned_model()

        logger.info("Warming up (one short generation per English pipeline)...")
        # mlx-audio print()s to stdout; stdout is the length-prefixed protocol channel, so silence it.
        # Both pipelines, American (a) and British (b): mlx-audio builds a KokoroPipeline (its misaki G2P
        # and lexicon) per lang_code on first use, so the first British request used to take 1.1-2.6 s (now
        # ~0.17 s, like any warm request), at the cost of ~1-2 s more before the ready line.
        with open(os.devnull, "w") as devnull:
            with redirect_stdout(devnull), redirect_stderr(devnull):
                for lang_code, voice in WARMUP_VOICES:
                    for _ in _model_cache.generate(
                        "Ready.", voice=voice_file(voice), speed=1.0, lang_code=lang_code
                    ):
                        pass
        release_mlx_cache()

        # PythonWorker.swift matches this exact line; do not reword it.
        logger.info("Model loaded, ready for requests")
        return True
    except Exception as e:
        logger.error(
            f"Failed to load or warm up model: {e}; {SETUP_HINT}", exc_info=True
        )
        return False


# Typographic punctuation misaki reads natively. The ASCII fold used to delete these ("We’re" -> "Were",
# "3–5" -> "35"), so they are protected: U+2019 U+2018 U+201C U+201D U+2014 U+2013 U+2026.
PROTECTED_PUNCTUATION = "’‘“”—–…"


# Long-token budget. Kokoro reads at most 510 phonemes per chunk, and mlx-audio's English chunker
# (kokoro/pipeline.py en_tokenize) only breaks BETWEEN misaki tokens, so one token over 510 phonemes was cut
# at 510 (the rest silently dropped) or, for a number past num2words' range, raised OverflowError (HTTP 500).
# Measured with misaki as mlx-audio builds it: a digit run costs up to ~13.5 phonemes per digit (16 digits =
# 159, 24 = 324, 64 = 977; 320 raises), any other character at most ~8 ("W" = "double-u", "%" = "percent"),
# so a 40-character run stays under ~450 phonemes whatever it holds once its digit runs are grouped.
# Digit runs this long or longer are read in groups of three, unless they are a round number num2words
# still reads as one quantity (see _group_digits).
DIGIT_GROUP_MIN = 16
# num2words reads a round number correctly through 30 digits ("one hundred octillion"); at 31 it spells
# the scale word letter by letter ("... NONILLION ..."). A digit run of DIGIT_GROUP_MIN..NUMBER_WORDS_MAX
# digits with no leading zero and at most ROUND_SIGNIFICANT_MAX digits before its trailing zeros
# ("1000000000000000000" -> "one quintillion", 40 phonemes) is left whole, so its magnitude is heard.
NUMBER_WORDS_MAX = 30
ROUND_SIGNIFICANT_MAX = 6
# Whitespace-free runs longer than this are broken at their punctuation ...
LONG_RUN = 40
# ... and letter/digit stretches still longer than this, every PIECE characters, when misaki would spell
# them out (they hold a digit, or capitals past the first letter: a hash, base64, an all-caps token).
PIECE = 20
# A plain lower-case or Capitalized word is read as a word, not spelled, so it is cut only past this length
# (no dictionary word comes close; 45-letter "Pneumonoultramicroscopicsilicovolcanoconiosis" is 51 phonemes).
PLAIN_WORD_MAX = 60
# Inside a long run, 3 or more of one symbol ("=====", "#####", "/////") is a rule line or a banner, not
# content: misaki named each one once split apart ("equals" x 80). A run of pause punctuation keeps one
# character; any other symbol run becomes a space.
PAUSE_PUNCTUATION = ".,;:!?-" + "–—…"


def _group_digits(match):
    """"4111111111111111" -> "411 111 111 111 111 1". A group's leading zeros are spoken one by one ("012" alone
    reads "twelve", "000" reads "zero"): "100000000000000007" -> "100 0 0 0 0 0 0 0 0 0 0 0 0 0 0 7". Every
    digit is still spoken. A round number num2words can still read ("1000000000000000000" -> "one
    quintillion") is left whole."""
    digits = match.group(0)
    if (
        len(digits) <= NUMBER_WORDS_MAX
        and digits[0] != "0"
        and len(digits.rstrip("0")) <= ROUND_SIGNIFICANT_MAX
    ):
        return digits
    words = []
    for i in range(0, len(digits), 3):
        group = digits[i : i + 3]
        rest = group.lstrip("0")
        words.extend("0" * (len(group) - len(rest)))
        if rest:
            words.append(rest)
    return " ".join(words)


def _collapse_symbol_run(match):
    symbol = match.group(1)
    return symbol if symbol in PAUSE_PUNCTUATION else " "


def _split_word(word):
    """Cut a letter/digit stretch misaki would spell out every PIECE characters; a plain word only past
    PLAIN_WORD_MAX. Apostrophes are part of the word ("don’t" stays one token) and are not counted."""
    letters = word.replace("'", "").replace("’", "")
    plain = letters.isalpha() and (letters.islower() or (letters[0].isupper() and letters[1:].islower()))
    limit = PLAIN_WORD_MAX if plain else PIECE
    if len(word) <= limit:
        return [word]
    return [word[i : i + PIECE] for i in range(0, len(word), PIECE)]


def _break_long_run(match):
    """Split an over-long whitespace-free run (a URL, a hash, a base64 blob, words joined by dashes) into
    short tokens. A rule line or banner of one repeated symbol is dropped first (_collapse_symbol_run).
    Words keep their apostrophes; each other punctuation character stands alone, where misaki still reads
    it ("/" -> slash, "=" -> equals, "&" -> and; "." and "-" become a pause, as they already were inside a
    URL). No letter or digit is dropped."""
    run = re.sub(r"([^A-Za-z0-9\s'’])\1{2,}", _collapse_symbol_run, match.group(0))
    words = []
    for part in re.findall(r"[A-Za-z0-9]+(?:['’][A-Za-z0-9]+)*|\S", run):
        words.extend(_split_word(part))
    return " ".join(words)


def break_long_tokens(text):
    """Keep every misaki token under Kokoro's 510-phoneme chunk budget without dropping content: digit runs
    of DIGIT_GROUP_MIN or more are grouped in threes (round numbers num2words reads are kept whole), then
    runs over LONG_RUN characters lose their rule lines and are broken at punctuation and, where misaki
    would spell them, every PIECE characters. Ordinary words, numbers and short URLs are untouched."""
    text = re.sub(r"\d{%d,}" % DIGIT_GROUP_MIN, _group_digits, text)
    text = re.sub(r"\S{%d,}" % (LONG_RUN + 1), _break_long_run, text)
    # A dropped rule line leaves a double space behind.
    return re.sub(r" {2,}", " ", text).strip()


def normalize_text(text):
    """Normalize Unicode text for better TTS pronunciation.

    The 7 PROTECTED_PUNCTUATION characters pass through unchanged. Every other segment gets the
    NFKD + ASCII fold, which turns formatted/mathematical Unicode into ASCII (𝚟𝚒𝚝𝚎 -> vite) and still
    drops emoji, CJK, Cyrillic and Arabic. Whitespace, including newlines (PDF selections break every
    line), collapses to single spaces. Finally break_long_tokens() splits any token that would overflow
    Kokoro's 510-phoneme chunk (a very long number, URL or hash).
    """
    import unicodedata

    parts = re.split("([" + PROTECTED_PUNCTUATION + "])", text)
    folded = "".join(
        part
        if len(part) == 1 and part in PROTECTED_PUNCTUATION
        else unicodedata.normalize("NFKD", part)
        .encode("ascii", "ignore")
        .decode("ascii")
        for part in parts
    )

    # Clean up any excessive whitespace
    return break_long_tokens(re.sub(r"\s+", " ", folded).strip())


def parse_speed(value):
    """Return the speed as a positive finite float, or None if it is not one (0, negative, NaN, inf,
    a bool or a non-number): speed 0 used to reach the model and fail with an HTTP 500."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    speed = float(value)
    if not math.isfinite(speed) or speed <= 0:
        return None
    return speed


# ---------------------------------------------------------------------------------------------- loudness
# numpy only. The two K-weighting biquads are derived for any sample rate from the analogue prototypes
# behind BS.1770-4's 48 kHz table (the libebur128 / pyloudnorm derivation: bilinear transform with
# prewarping); at 48 kHz they reproduce the table's coefficients to 1e-8 (Scripts/verify_loudness.py
# checks it). The filters run as an FFT convolution with their impulse response, truncated at 16,384
# samples where it has decayed below 1e-30, which keeps every call vectorised.
_K_SHELF = (1681.974450955533, 3.999843853973347, 0.7071752369554196)  # f0 Hz, gain dB, Q
_K_HIGHPASS = (38.13547087602444, 0.5003270373238773)  # f0 Hz, Q
_K_IR_SAMPLES = 16384
_TRUE_PEAK_OVERSAMPLE = 4
_TRUE_PEAK_HALF_TAPS = 16  # input samples each side of an interpolated point


def k_weighting_coefficients(rate):
    """((b, a) of the high shelf, (b, a) of the high-pass) at `rate` Hz, each a[0] == 1."""
    f0, gain_db, q = _K_SHELF
    k = math.tan(math.pi * f0 / rate)
    vh = 10.0 ** (gain_db / 20.0)
    vb = vh**0.4996667741545416
    a0 = 1.0 + k / q + k * k
    shelf = (
        ((vh + vb * k / q + k * k) / a0, 2.0 * (k * k - vh) / a0, (vh - vb * k / q + k * k) / a0),
        (1.0, 2.0 * (k * k - 1.0) / a0, (1.0 - k / q + k * k) / a0),
    )
    f0, q = _K_HIGHPASS
    k = math.tan(math.pi * f0 / rate)
    a0 = 1.0 + k / q + k * k
    highpass = ((1.0, -2.0, 1.0), (1.0, 2.0 * (k * k - 1.0) / a0, (1.0 - k / q + k * k) / a0))
    return shelf, highpass


_k_ir_cache = {}


def _k_weighting_ir(rate):
    """Impulse response of the two K-weighting biquads in cascade (direct form I, computed once per rate)."""
    if rate not in _k_ir_cache:
        import numpy as np

        h = [1.0] + [0.0] * (_K_IR_SAMPLES - 1)
        for (b0, b1, b2), (_, a1, a2) in k_weighting_coefficients(rate):
            out, x1, x2, y1, y2 = [], 0.0, 0.0, 0.0, 0.0
            for x0 in h:
                y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
                out.append(y0)
                x2, x1, y2, y1 = x1, x0, y1, y0
            h = out
        _k_ir_cache[rate] = np.asarray(h)
    return _k_ir_cache[rate]


def _fir(x, h, block=1 << 16):
    """x convolved with h, full length len(x) + len(h) - 1, by overlap-add FFT in bounded memory."""
    import numpy as np

    n_fft = 1 << (block + len(h) - 2).bit_length()
    h_f = np.fft.rfft(h, n_fft)
    y = np.zeros(len(x) + len(h) - 1)
    for start in range(0, len(x), block):
        seg = x[start : start + block]
        n = len(seg) + len(h) - 1
        y[start : start + n] += np.fft.irfft(np.fft.rfft(seg, n_fft) * h_f, n_fft)[:n]
    return y


def integrated_loudness(audio, rate=SAMPLE_RATE):
    """(LUFS, gated) of a mono signal per ITU-R BS.1770-4: K-weighting, 400 ms blocks with 75% overlap, the
    -70 LUFS absolute gate, then the relative gate 10 LU below the absolutely-gated mean. A signal shorter
    than one block cannot be gated, so it gets the ungated K-weighted mean square (gated=False). The LUFS is
    None when it is below LOUDNESS_FLOOR_LUFS: silence."""
    import numpy as np

    x = np.asarray(audio, dtype=np.float64).reshape(-1)
    if x.size == 0:
        return None, False
    y = _fir(x, _k_weighting_ir(rate))[: x.size]
    energy = np.concatenate(([0.0], np.cumsum(y * y)))
    block, step = int(round(0.4 * rate)), int(round(0.1 * rate))

    def lufs(mean_square):
        return -0.691 + 10.0 * math.log10(mean_square) if mean_square > 0 else -math.inf

    if x.size < block:
        level = lufs(energy[-1] / x.size)
        return (level if level >= LOUDNESS_FLOOR_LUFS else None), False
    starts = np.arange(0, x.size - block + 1, step)
    z = np.maximum((energy[starts + block] - energy[starts]) / block, 0.0)
    with np.errstate(divide="ignore"):
        z = z[-0.691 + 10.0 * np.log10(z) > LOUDNESS_FLOOR_LUFS]
        if z.size == 0:
            return None, True
        relative_gate = lufs(float(np.mean(z))) - 10.0
        z = z[-0.691 + 10.0 * np.log10(z) > relative_gate]
    return lufs(float(np.mean(z))), True


_true_peak_phases = []


def true_peak_dbtp(audio):
    """True peak in dBTP: the largest |sample| of the signal and of its 4x interpolation (windowed sinc, 32
    taps per phase, Kaiser beta 8, each phase normalised to unity gain at DC)."""
    import numpy as np

    x = np.asarray(audio, dtype=np.float64).reshape(-1)
    if x.size == 0:
        return -math.inf
    if not _true_peak_phases:
        m, half = _TRUE_PEAK_OVERSAMPLE, _TRUE_PEAK_HALF_TAPS
        k = np.arange(-half + 1, half + 1)
        for p in range(1, m):
            taps = np.sinc(k - p / m) * np.kaiser(2 * half, 8.0)  # the point p/m past each input sample
            _true_peak_phases.append((taps / taps.sum())[::-1])
    peak = float(np.max(np.abs(x)))
    for taps in _true_peak_phases:
        peak = max(peak, float(np.max(np.abs(_fir(x, taps)))))
    return 20.0 * math.log10(peak) if peak > 0 else -math.inf


def normalize_loudness(audio, rate=SAMPLE_RATE):
    """(audio * gain, report). The gain is the smallest of the loudness gain to LOUDNESS_TARGET_LUFS, the
    gain that puts the true peak at TRUE_PEAK_CEILING_DBTP and MAX_GAIN_DB; silence is returned unchanged.
    The report holds numbers only, never text: lufs_in, gated, true_peak_in, gain_db, limited_by."""
    lufs_in, gated = integrated_loudness(audio, rate)
    peak_in = true_peak_dbtp(audio)
    report = {"lufs_in": lufs_in, "gated": gated, "true_peak_in": peak_in, "gain_db": 0.0, "limited_by": "silence"}
    if lufs_in is None or not math.isfinite(peak_in):
        return audio, report
    report["gain_db"], report["limited_by"] = min(
        (LOUDNESS_TARGET_LUFS - lufs_in, "target"),
        (TRUE_PEAK_CEILING_DBTP - peak_in, "true_peak"),
        (MAX_GAIN_DB, "max_gain"),
    )
    return audio * (10.0 ** (report["gain_db"] / 20.0)), report


def generate_audio_mlx(text, voice, speed, request_id=None):
    """Generate audio using MLX with cached model and in-memory processing"""
    try:
        import time
        import soundfile as sf
        import os
        from contextlib import redirect_stdout, redirect_stderr

        t_start = time.time()

        # Normalize Unicode text for better pronunciation
        original_text = text
        text = normalize_text(text)

        # Lengths only, never the text itself (privacy: the helper keeps no user text).
        if text != original_text:
            logger.info(f"Text normalized: {len(original_text)} -> {len(text)} chars")

        if not text:
            # Nothing speakable survived normalization (e.g. only emoji or non-Latin script).
            return {"error": "empty_text"}

        # Only American (a) and British (b) voices are exposed; j/z would need extra misaki extras.
        lang_code = voice[0] if voice[:1] in ("a", "b") else "a"
        voice_ref = voice_file(voice)
        if voice_ref is None:
            logger.error(f"Voice {voice} is not in the pinned model snapshot")
            return {"error": "unknown_voice"}

        logger.info(
            f"Generating [{len(text)} chars] (voice={voice}, lang_code={lang_code}, speed={speed})"
        )

        if is_cancelled(request_id):
            logger.info("Request cancelled before generation")
            return {"error": "cancelled"}

        # Get cached model
        t_model_start = time.time()
        model = get_cached_model()
        t_model_end = time.time()
        logger.info(f"Model retrieval: {t_model_end - t_model_start:.3f}s")

        # Generate audio using cached model
        t_gen_start = time.time()
        # Redirect stdout/stderr to prevent MLX/espeak from corrupting the Native Messaging protocol
        with open(os.devnull, "w") as devnull:
            with redirect_stdout(devnull), redirect_stderr(devnull):
                # Use model's direct generate method (returns a generator)
                # The generator yields one result per sentence/chunk
                result_gen = model.generate(
                    text, voice=voice_ref, speed=speed, lang_code=lang_code
                )
                # Collect all audio chunks from the generator, stopping at the response-size bound.
                audio_chunks = []
                samples = 0
                for chunk in result_gen:
                    audio_chunks.append(chunk.audio)
                    samples += int(chunk.audio.size)
                    if samples > MAX_AUDIO_SECONDS * SAMPLE_RATE:
                        logger.error(f"Audio longer than {MAX_AUDIO_SECONDS:.0f}s; not returning it")
                        return {"error": "audio_too_long"}
                    if is_cancelled(request_id):
                        logger.info(f"Request cancelled after {len(audio_chunks)} chunk(s)")
                        return {"error": "cancelled"}
                logger.info(f"Generated {len(audio_chunks)} audio chunks")
        t_gen_end = time.time()
        logger.info(f"MLX generation: {t_gen_end - t_gen_start:.3f}s")

        # Convert to numpy array and concatenate all chunks
        t_convert_start = time.time()
        import numpy as np

        if not audio_chunks:
            return {"error": "empty_audio"}
        if len(audio_chunks) == 1:
            audio_np = np.asarray(audio_chunks[0])
        else:
            # Concatenate all audio chunks
            audio_np = np.concatenate([np.asarray(chunk) for chunk in audio_chunks])
        t_convert_end = time.time()
        logger.info(
            f"Array conversion and concatenation: {t_convert_end - t_convert_start:.3f}s"
        )

        # Guard the output: never ship NaN or ±inf, and keep peaks below full scale so the 16-bit WAV
        # encode cannot clip. An inf sample (overlap-add overflow in the iSTFT) made the peak inf and the
        # scaling below turned every other sample into 0: silence returned as a success.
        if audio_np.size == 0:
            return {"error": "empty_audio"}
        if not np.isfinite(audio_np).all():
            logger.error("Generated audio contains NaN or inf")
            return {"error": "nan_audio"}
        if LOUDNESS_NORMALIZE:
            t_loud_start = time.time()
            audio_np, loud = normalize_loudness(audio_np)
            level = "silence" if loud["lufs_in"] is None else f"{loud['lufs_in']:.2f} LUFS"
            logger.info(
                f"Loudness {level} ({'gated' if loud['gated'] else 'ungated: under 400 ms'}), true peak "
                f"{loud['true_peak_in']:.2f} dBTP; gain {loud['gain_db']:+.2f} dB (limited by "
                f"{loud['limited_by']}) in {time.time() - t_loud_start:.3f}s"
            )
        # With normalization the true-peak ceiling (-1.5 dBTP, 0.84) already keeps every sample below this
        # limit; the guard stays for NTTS_LOUDNESS_NORMALIZE=0 and as the last line before the 16-bit encode.
        peak = float(np.max(np.abs(audio_np)))
        if peak > PEAK_LIMIT:
            logger.info(f"Peak {peak:.3f} above {PEAK_LIMIT}; scaling down")
            audio_np = audio_np * (PEAK_LIMIT / peak)

        # Write to in-memory BytesIO buffer (no file I/O)
        t_wav_start = time.time()
        buffer = BytesIO()
        sf.write(buffer, audio_np, 24000, format="WAV")
        wav_bytes = buffer.getvalue()
        t_wav_end = time.time()
        logger.info(
            f"WAV encoding (in-memory): {t_wav_end - t_wav_start:.3f}s ({len(wav_bytes)} bytes)"
        )

        # Calculate actual duration from audio samples
        duration = len(audio_np) / 24000.0

        # Base64 encoding
        t_b64_start = time.time()
        audio_b64 = base64.b64encode(wav_bytes).decode("utf-8")
        t_b64_end = time.time()
        logger.info(
            f"Base64 encoding: {t_b64_end - t_b64_start:.3f}s ({len(audio_b64)} chars)"
        )

        t_end = time.time()
        logger.info(f"Total generation time: {t_end - t_start:.3f}s")

        return {
            "audio_base64": audio_b64,
            "duration": duration,
            "sample_rate": 24000,
            "format": "wav",
        }

    except Exception as e:
        # Neither the message nor the traceback: both can carry the request text (see describe_exception).
        logger.error(f"Error generating audio: {describe_exception(e)}")
        return {"error": f"internal_error: {type(e).__name__}"}
    finally:
        # Every exit, including cancelled and audio_too_long, which return mid-generation.
        release_mlx_cache()


def main():
    """Main event loop"""
    route_logs_privately()
    logger.info("Natural TTS Helper - Python Worker starting")

    # Load model
    if not load_mlx_model():
        logger.error("Failed to load model, exiting")
        sys.exit(1)

    # Event loop: read requests, generate audio, write responses
    while True:
        try:
            try:
                request = read_message()
            except BadFrame as e:
                write_message({"error": e.code})
                continue
            if request is None:
                logger.info("Received shutdown signal")
                break

            # Extract parameters
            text = request.get("text", "")
            voice = request.get("voice", DEFAULT_VOICE)
            speed = request.get("speed", 1.0)

            if not text:
                write_message({"error": "empty_text"})
                continue

            speed = parse_speed(speed)
            if speed is None:
                write_message({"error": "invalid_speed"})
                continue

            # Generate audio
            response = generate_audio_mlx(text, voice, speed, request.get("id"))

            # Send response
            write_message(response)

            if "error" not in response:
                logger.debug(f"Generated {response.get('duration', 0):.2f}s of audio")

        except KeyboardInterrupt:
            logger.info("Interrupted by user")
            break
        except Exception as e:
            logger.error(f"Unexpected error in main loop: {describe_exception(e)}")
            write_message({"error": f"internal_error: {type(e).__name__}"})

    logger.info("Python worker shutting down")


if __name__ == "__main__":
    main()
