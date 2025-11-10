#!/usr/bin/env python3
"""
Natural TTS Helper - Python MLX Worker
Communicates with Swift via stdin/stdout using Native Messaging protocol
"""

import sys
import json
import base64
import logging
from io import BytesIO

# Setup logging to stderr (captured by Swift)
logging.basicConfig(
    level=logging.INFO,
    format='[%(levelname)s] %(message)s',
    stream=sys.stderr
)
logger = logging.getLogger(__name__)

# Global model cache for reuse across requests
_model_cache = None


def read_message():
    """Read length-prefixed JSON message from stdin (Native Messaging protocol)"""
    try:
        # Read 4-byte length prefix (little-endian)
        length_bytes = sys.stdin.buffer.read(4)
        if len(length_bytes) == 0:
            return None

        length = int.from_bytes(length_bytes, 'little')
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
            logger.error(f"Incomplete message: expected {length}, got {len(message_bytes)}")
            return None

        message = json.loads(message_bytes.decode('utf-8'))
        return message
    except Exception as e:
        logger.error(f"Error reading message: {e}")
        return None


def write_message(obj):
    """Write length-prefixed JSON message to stdout"""
    try:
        message_bytes = json.dumps(obj).encode('utf-8')
        length = len(message_bytes).to_bytes(4, 'little')
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
        _model_cache = load_model("prince-canuma/Kokoro-82M")
        logger.info("Model loaded and cached")
    else:
        logger.info("Using cached model")
    return _model_cache


def load_mlx_model():
    """Verify MLX dependencies are available (model will lazy-load on first request)"""
    try:
        from mlx_audio.tts.generate import generate_audio
        logger.info("MLX audio dependencies loaded successfully")
        logger.info("Model loaded, ready for requests")
        return True
    except Exception as e:
        logger.error(f"Failed to load MLX dependencies: {e}", exc_info=True)
        return False


def generate_audio_mlx(text, voice, speed):
    """Generate audio using MLX with cached model and in-memory processing"""
    try:
        import time
        import soundfile as sf
        import os
        from contextlib import redirect_stdout, redirect_stderr

        t_start = time.time()

        logger.info(f"Generating: {text[:50]}... (voice={voice}, speed={speed})")

        # Get cached model
        t_model_start = time.time()
        model = get_cached_model()
        t_model_end = time.time()
        logger.info(f"Model retrieval: {t_model_end - t_model_start:.3f}s")

        # Generate audio using cached model
        t_gen_start = time.time()
        # Redirect stdout/stderr to prevent MLX/espeak from corrupting the Native Messaging protocol
        with open(os.devnull, 'w') as devnull:
            with redirect_stdout(devnull), redirect_stderr(devnull):
                # Use model's direct generate method (returns a generator)
                result_gen = model.generate(text, voice=voice, speed=speed)
                # Get the first (and only) result from the generator
                result = next(result_gen)
        t_gen_end = time.time()
        logger.info(f"MLX generation: {t_gen_end - t_gen_start:.3f}s")

        # Convert to numpy array (if not already)
        t_convert_start = time.time()
        import numpy as np
        audio_np = np.asarray(result.audio)
        t_convert_end = time.time()
        logger.info(f"Array conversion: {t_convert_end - t_convert_start:.3f}s")

        # Write to in-memory BytesIO buffer (no file I/O)
        t_wav_start = time.time()
        buffer = BytesIO()
        sf.write(buffer, audio_np, 24000, format='WAV')
        wav_bytes = buffer.getvalue()
        t_wav_end = time.time()
        logger.info(f"WAV encoding (in-memory): {t_wav_end - t_wav_start:.3f}s ({len(wav_bytes)} bytes)")

        # Calculate actual duration from audio samples
        duration = len(audio_np) / 24000.0

        # Base64 encoding
        t_b64_start = time.time()
        audio_b64 = base64.b64encode(wav_bytes).decode('utf-8')
        t_b64_end = time.time()
        logger.info(f"Base64 encoding: {t_b64_end - t_b64_start:.3f}s ({len(audio_b64)} chars)")

        t_end = time.time()
        logger.info(f"Total generation time: {t_end - t_start:.3f}s")

        return {
            'audio_base64': audio_b64,
            'duration': duration,
            'sample_rate': 24000,
            'format': 'wav'
        }

    except Exception as e:
        logger.error(f"Error generating audio: {e}", exc_info=True)
        return {'error': str(e)}


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
            text = request.get('text', '')
            voice = request.get('voice', 'af_bella')
            speed = request.get('speed', 1.0)

            if not text:
                write_message({'error': 'empty_text'})
                continue

            # Generate audio
            response = generate_audio_mlx(text, voice, speed)

            # Send response
            write_message(response)

            if 'error' not in response:
                logger.debug(f"Generated {response.get('duration', 0):.2f}s of audio")

        except KeyboardInterrupt:
            logger.info("Interrupted by user")
            break
        except Exception as e:
            logger.error(f"Unexpected error in main loop: {e}", exc_info=True)
            write_message({'error': str(e)})

    logger.info("Python worker shutting down")


if __name__ == '__main__':
    main()
