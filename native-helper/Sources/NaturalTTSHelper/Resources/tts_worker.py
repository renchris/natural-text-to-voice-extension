#!/usr/bin/env python3
"""
Natural TTS Helper - Python MLX Worker
Communicates with Swift via stdin/stdout using Native Messaging protocol
"""

import os

# Offline by default: the model is cached by Scripts/setup-python-env.sh, so the worker never needs the
# network. Must run before anything imports huggingface_hub (it reads the variable at import time).
os.environ.setdefault("HF_HUB_OFFLINE", "1")

import sys
import json
import math
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
SETUP_HINT = "run Scripts/setup-python-env.sh (model not cached or dependency missing)"
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

# Global model cache for reuse across requests
_model_cache = None


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
        from mlx_audio.tts.utils import load_model

        logger.info("Loading model (first time)...")
        _model_cache = load_model(MODEL_ID)
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
        from mlx_audio.tts.utils import load_model

        logger.info("Eagerly loading Kokoro weights at startup...")
        _model_cache = load_model(MODEL_ID)

        logger.info("Warming up (one short generation)...")
        # mlx-audio print()s to stdout; stdout is the length-prefixed protocol channel, so silence it.
        with open(os.devnull, "w") as devnull:
            with redirect_stdout(devnull), redirect_stderr(devnull):
                for _ in _model_cache.generate("Ready.", voice="af_bella", speed=1.0):
                    pass

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


def normalize_text(text):
    """Normalize Unicode text for better TTS pronunciation.

    The 7 PROTECTED_PUNCTUATION characters pass through unchanged. Every other segment gets the
    NFKD + ASCII fold, which turns formatted/mathematical Unicode into ASCII (𝚟𝚒𝚝𝚎 -> vite) and still
    drops emoji, CJK, Cyrillic and Arabic. Whitespace, including newlines (PDF selections break every
    line), collapses to single spaces.
    """
    import unicodedata
    import re

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
    return re.sub(r"\s+", " ", folded).strip()


def parse_speed(value):
    """Return the speed as a positive finite float, or None if it is not one (0, negative, NaN, inf,
    a bool or a non-number): speed 0 used to reach the model and fail with an HTTP 500."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    speed = float(value)
    if not math.isfinite(speed) or speed <= 0:
        return None
    return speed


def generate_audio_mlx(text, voice, speed):
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

        logger.info(
            f"Generating [{len(text)} chars] (voice={voice}, lang_code={lang_code}, speed={speed})"
        )

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
                    text, voice=voice, speed=speed, lang_code=lang_code
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

        # Guard the output: never ship NaN, and keep peaks below full scale so the 16-bit WAV
        # encode cannot clip.
        if audio_np.size == 0:
            return {"error": "empty_audio"}
        if np.isnan(audio_np).any():
            logger.error("Generated audio contains NaN")
            return {"error": "nan_audio"}
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
            voice = request.get("voice", "af_bella")
            speed = request.get("speed", 1.0)

            if not text:
                write_message({"error": "empty_text"})
                continue

            speed = parse_speed(speed)
            if speed is None:
                write_message({"error": "invalid_speed"})
                continue

            # Generate audio
            response = generate_audio_mlx(text, voice, speed)

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
