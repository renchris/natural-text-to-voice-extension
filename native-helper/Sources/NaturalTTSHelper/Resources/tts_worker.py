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

# Setup logging to stderr (captured by Swift)
logging.basicConfig(
    level=logging.INFO, format="[%(levelname)s] %(message)s", stream=sys.stderr
)
logger = logging.getLogger(__name__)

MODEL_ID = "prince-canuma/Kokoro-82M"
SETUP_HINT = "run Scripts/setup-python-env.sh (model not cached or dependency missing)"
PEAK_LIMIT = 0.98

# Global model cache for reuse across requests
_model_cache = None


def read_message():
    """Read length-prefixed JSON message from stdin (Native Messaging protocol)"""
    try:
        # Read 4-byte length prefix (little-endian)
        length_bytes = sys.stdin.buffer.read(4)
        if len(length_bytes) == 0:
            return None

        length = int.from_bytes(length_bytes, "little")
        if length == 0 or length > 10 * 1024 * 1024:  # Max 10MB message
            logger.error(f"Invalid message length: {length} (0x{length:08x})")
            # Log next few bytes for debugging
            try:
                peek = sys.stdin.buffer.read(min(16, sys.stdin.buffer.readable()))
                logger.error(f"Next bytes (hex): {peek.hex()}")
                logger.error(f"Next bytes (ascii): {repr(peek)}")
            except:
                pass
            return None

        # Read message body
        message_bytes = sys.stdin.buffer.read(length)
        if len(message_bytes) != length:
            logger.error(
                f"Incomplete message: expected {length}, got {len(message_bytes)}"
            )
            return None

        message = json.loads(message_bytes.decode("utf-8"))
        return message
    except Exception as e:
        logger.error(f"Error reading message: {e}")
        return None


def write_message(obj):
    """Write length-prefixed JSON message to stdout"""
    try:
        message_bytes = json.dumps(obj).encode("utf-8")
        length = len(message_bytes).to_bytes(4, "little")
        sys.stdout.buffer.write(length)
        sys.stdout.buffer.write(message_bytes)
        sys.stdout.buffer.flush()
    except Exception as e:
        logger.error(f"Error writing message: {e}")


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


def normalize_text(text):
    """Normalize Unicode text for better TTS pronunciation"""
    import unicodedata
    import re

    # NFKD normalization: converts formatted/mathematical Unicode to ASCII equivalents
    # e.g., 𝚟𝚒𝚝𝚎 (mathematical monospace) -> vite (normal ASCII)
    normalized = unicodedata.normalize("NFKD", text)

    # Remove any remaining non-ASCII combining marks
    # Keep only printable ASCII and common punctuation
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")

    # Clean up any excessive whitespace
    ascii_text = re.sub(r"\s+", " ", ascii_text).strip()

    return ascii_text


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
                # Collect all audio chunks from the generator
                audio_chunks = []
                for chunk in result_gen:
                    audio_chunks.append(chunk.audio)
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
        logger.error(f"Error generating audio: {e}", exc_info=True)
        return {"error": str(e)}


def main():
    """Main event loop"""
    logger.info("Natural TTS Helper - Python Worker starting")

    # Load model
    if not load_mlx_model():
        logger.error("Failed to load model, exiting")
        sys.exit(1)

    # Event loop: read requests, generate audio, write responses
    while True:
        try:
            request = read_message()
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
            logger.error(f"Unexpected error in main loop: {e}", exc_info=True)
            write_message({"error": str(e)})

    logger.info("Python worker shutting down")


if __name__ == "__main__":
    main()
