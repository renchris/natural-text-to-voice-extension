#!/bin/bash
# Setup the Python environment for the Natural TTS Helper.
#
# Builds Sources/NaturalTTSHelper/Resources/python-env from the hash-locked uv project in
# native-helper/python (pyproject.toml + uv.lock; Python 3.12, mlx 0.32.2, mlx-audio 0.5.5),
# pre-fetches the Kokoro model once, then verifies the worker end to end.
#
# Usage:
#   ./Scripts/setup-python-env.sh                      # keep a legacy env as the rollback, then build
#   ./Scripts/setup-python-env.sh --force              # rebuild in place, no rollback copy
#   ./Scripts/setup-python-env.sh --skip-worker-check  # build + prefetch only (no verify_worker.py)
#
# Safe to re-run: `uv sync --frozen` reconciles an existing uv environment in place; a legacy
# (pip-built) environment is moved ONCE to native-helper/.python-env.pre-1.5 (outside Sources, so
# the Swift resource copy never bundles it). Fails closed: any failed step exits non-zero.
#
# Rollback:
#   rm -rf Sources/NaturalTTSHelper/Resources/python-env
#   mv .python-env.pre-1.5 Sources/NaturalTTSHelper/Resources/python-env   # then git revert

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
UV_PROJECT_DIR="$PROJECT_ROOT/python"
VENV_DIR="$PROJECT_ROOT/Sources/NaturalTTSHelper/Resources/python-env"
ROLLBACK_DIR="$PROJECT_ROOT/.python-env.pre-1.5"
WORKER="$PROJECT_ROOT/Sources/NaturalTTSHelper/Resources/tts_worker.py"
MODEL_ID="prince-canuma/Kokoro-82M"

FORCE_MODE=false
CHECK_WORKER=true
for arg in "$@"; do
    case "$arg" in
        --force|-f) FORCE_MODE=true ;;
        --skip-worker-check) CHECK_WORKER=false ;;
        -h|--help) sed -n '2,19p' "$0"; exit 0 ;;
        *) echo "Error: unknown argument: $arg" >&2; exit 2 ;;
    esac
done

echo "==================================="
echo "Natural TTS Helper - Python Setup"
echo "==================================="

if ! command -v uv >/dev/null 2>&1; then
    echo "Error: uv not found. Install it with:" >&2
    echo "  brew install uv" >&2
    exit 1
fi
echo "uv: $(uv --version)"

for f in pyproject.toml uv.lock .python-version; do
    [ -f "$UV_PROJECT_DIR/$f" ] || { echo "Error: missing $UV_PROJECT_DIR/$f" >&2; exit 1; }
done

# A uv-managed venv records "uv = <version>" in pyvenv.cfg; anything else is the legacy pip env.
is_uv_env() { [ -f "$1/pyvenv.cfg" ] && grep -q '^uv = ' "$1/pyvenv.cfg"; }

if [ -e "$VENV_DIR" ] && ! is_uv_env "$VENV_DIR"; then
    if [ "$FORCE_MODE" = true ]; then
        echo "Legacy environment found; --force: replacing it without a rollback copy"
        rm -rf "$VENV_DIR"
    elif [ -e "$ROLLBACK_DIR" ]; then
        echo "Error: legacy environment at $VENV_DIR, but the rollback slot" >&2
        echo "  $ROLLBACK_DIR already exists. Remove one of them, or pass --force." >&2
        exit 1
    else
        echo "Moving the legacy environment to the rollback slot:"
        echo "  $ROLLBACK_DIR"
        mv "$VENV_DIR" "$ROLLBACK_DIR"
    fi
fi

echo
echo "Syncing the locked environment into:"
echo "  $VENV_DIR"
UV_PROJECT_ENVIRONMENT="$VENV_DIR" \
    uv sync --project "$UV_PROJECT_DIR" --frozen --compile-bytecode

PY="$VENV_DIR/bin/python3"
[ -x "$PY" ] || { echo "Error: $PY missing after uv sync" >&2; exit 1; }

echo
echo "Verifying the installation..."
"$PY" - <<'EOF'
import importlib.metadata as m
import sys

import mlx.core as mx
import spacy

assert sys.version_info[:2] == (3, 12), sys.version
assert mx.__version__ == "0.32.2", mx.__version__
assert m.version("mlx-audio") == "0.5.5", m.version("mlx-audio")
assert spacy.util.is_package("en_core_web_sm"), "en_core_web_sm not installed (dist-info missing?)"
try:
    m.version("torch")
except m.PackageNotFoundError:
    pass
else:
    raise AssertionError("torch must not be installed")
print(f"  Python {sys.version.split()[0]} | mlx {mx.__version__} | mlx-audio {m.version('mlx-audio')} | en_core_web_sm OK")
EOF

echo
echo "Fetching the Kokoro model once (weights + voices, ~360 MB on first run)..."
# The worker pins the model commit (MODEL_REVISION in tts_worker.py); fetch exactly that commit and the
# files the worker loads (MODEL_FILES), so a fresh install gets the weights and voices the gate measured,
# not whatever upstream main holds today.
MODEL_REVISION="$(sed -nE 's/^MODEL_REVISION = "([0-9a-f]{40})"$/\1/p' "$WORKER")"
if [ -z "$MODEL_REVISION" ]; then
    echo "Error: no MODEL_REVISION line in $WORKER" >&2
    exit 1
fi
echo "Model revision: $MODEL_REVISION"
PREFETCH="from huggingface_hub import snapshot_download as s; s('$MODEL_ID', revision='$MODEL_REVISION', allow_patterns=['config.json', '*.safetensors'])"
if ! "$PY" -c "$PREFETCH"; then
    echo "Online fetch failed; checking the local cache instead (HF_HUB_OFFLINE=1)..."
    if ! HF_HUB_OFFLINE=1 "$PY" -c "$PREFETCH"; then
        echo "Error: $MODEL_ID is not cached and could not be downloaded" >&2
        exit 1
    fi
fi

if [ "$CHECK_WORKER" = true ]; then
    echo
    echo "Verifying the worker end to end (Scripts/verify_worker.py)..."
    "$PY" "$SCRIPT_DIR/verify_worker.py" "$PY" "$WORKER"
fi

echo
echo "Environment size: $(du -sh "$VENV_DIR" | awk '{print $1}')"
if [ -d "$ROLLBACK_DIR" ]; then
    echo "Rollback copy:    $ROLLBACK_DIR"
fi
echo "==================================="
echo "Python environment setup complete"
echo "==================================="
