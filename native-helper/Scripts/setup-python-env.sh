#!/bin/bash
# Setup Python environment for Natural TTS Helper
# This script creates a virtual environment with MLX dependencies
#
# Usage:
#   ./setup-python-env.sh          # Interactive mode
#   ./setup-python-env.sh --force  # Auto-skip if venv exists

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
VENV_DIR="$PROJECT_ROOT/Sources/NaturalTTSHelper/Resources/python-env"

# Parse arguments
FORCE_MODE=false
for arg in "$@"; do
    case $arg in
        --force|-f)
            FORCE_MODE=true
            shift
            ;;
    esac
done

echo "==================================="
echo "Natural TTS Helper - Python Setup"
echo "==================================="
echo

# Check Python version
if ! command -v python3 &> /dev/null; then
    echo "Error: python3 not found"
    echo "Please install Python 3.9+ first"
    exit 1
fi

PYTHON_VERSION=$(python3 --version | awk '{print $2}')
echo "Python version: $PYTHON_VERSION"

# Create virtual environment
echo
echo "Creating virtual environment at:"
echo "  $VENV_DIR"
echo

if [ -d "$VENV_DIR" ]; then
    if [ "$FORCE_MODE" = true ]; then
        echo "✓ Virtual environment already exists (--force mode, skipping)"
        exit 0
    else
        echo "Warning: Virtual environment already exists"
        read -p "Remove and recreate? (y/N) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            rm -rf "$VENV_DIR"
        else
            echo "Using existing environment"
            exit 0
        fi
    fi
fi

python3 -m venv "$VENV_DIR"

# Activate virtual environment
source "$VENV_DIR/bin/activate"

# Upgrade pip
echo
echo "Upgrading pip..."
pip install --upgrade pip --quiet

# Install dependencies
echo
echo "Installing dependencies..."
echo "  - mlx (Apple's ML framework)"
echo "  - mlx-audio (MLX audio utilities)"
echo "  - soundfile (WAV I/O)"
echo

pip install \
    mlx==0.29.3 \
    mlx-audio==0.2.6 \
    soundfile==0.13.1 \
    --quiet

# Verify installation
echo
echo "Verifying installation..."
python3 << 'EOF'
import sys
import mlx
import mlx_audio
import soundfile

print(f"✓ MLX version: {mlx.__version__}")
print(f"✓ mlx-audio installed")
print(f"✓ soundfile installed")
print(f"✓ Python: {sys.version.split()[0]}")
EOF

# Strip unnecessary files to reduce size
echo
echo "Cleaning up to reduce size..."
find "$VENV_DIR" -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
find "$VENV_DIR" -type d -name "*.dist-info" -exec rm -rf {} + 2>/dev/null || true
find "$VENV_DIR" -type f -name "*.pyc" -delete 2>/dev/null || true
find "$VENV_DIR" -type f -name "*.pyo" -delete 2>/dev/null || true

# Calculate size
VENV_SIZE=$(du -sh "$VENV_DIR" | awk '{print $1}')
echo "Final environment size: $VENV_SIZE"

echo
echo "==================================="
echo "Python environment setup complete!"
echo "==================================="
echo
echo "To test the worker script:"
echo "  source $VENV_DIR/bin/activate"
echo "  python $PROJECT_ROOT/Sources/NaturalTTSHelper/Resources/tts_worker.py"
echo
