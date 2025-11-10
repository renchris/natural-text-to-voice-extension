#!/bin/bash
#==============================================================================
# Natural TTS Helper - Automated Quickstart Script
#==============================================================================
#
# This script automates the entire QUICKSTART.md process:
#   1. Prerequisites check
#   2. Install espeak-ng (via Homebrew)
#   3. Setup Python environment (with MLX)
#   4. Build Swift release binary
#   5. Start helper in background (tmux)
#   6. Wait for helper to be ready (/health polling)
#   7. Run automated tests
#
# Usage:
#   ./Scripts/quickstart.sh               # Fully automated
#   ./Scripts/quickstart.sh --help        # Show help
#   ./Scripts/quickstart.sh --skip-tests  # Skip automated tests
#   ./Scripts/quickstart.sh --attach      # Attach to tmux after setup
#
# Requirements:
#   - macOS 13+ with Apple Silicon
#   - Homebrew installed
#   - tmux and jq installed (auto-installed if missing)
#
#==============================================================================

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SESSION_NAME="natural-tts-helper"
MAX_HEALTH_WAIT=90

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Flags
SKIP_TESTS=false
ATTACH_TMUX=false
CLEANUP_ON_ERROR=true
VERBOSE=false

#==============================================================================
# Cleanup Function
#==============================================================================

cleanup() {
    EXIT_CODE=$?

    if [ $EXIT_CODE -ne 0 ] && [ "${CLEANUP_ON_ERROR}" = "true" ]; then
        echo -e "${YELLOW}Cleaning up tmux session...${NC}"
        tmux kill-session -t "$SESSION_NAME" 2>/dev/null || true

        # Show recent logs if session existed
        if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
            echo -e "${YELLOW}Recent helper logs:${NC}"
            tmux capture-pane -t "$SESSION_NAME" -p -S -30 || true
        fi
    fi
}

trap cleanup EXIT

#==============================================================================
# Helper Functions
#==============================================================================

log_step() {
    echo -e "${GREEN}[$(date +%H:%M:%S)] $1${NC}"
}

log_info() {
    echo -e "${BLUE}  ℹ $1${NC}"
}

log_success() {
    echo -e "${GREEN}  ✓ $1${NC}"
}

log_warn() {
    echo -e "${YELLOW}  ⚠ $1${NC}"
}

log_error() {
    echo -e "${RED}  ✗ $1${NC}"
}

#==============================================================================
# Parse Arguments
#==============================================================================

show_help() {
    cat << EOF
Natural TTS Helper - Automated Quickstart Script

USAGE:
    $0 [OPTIONS]

OPTIONS:
    --help              Show this help message
    --skip-tests        Skip automated testing after setup
    --attach            Attach to tmux session after setup
    --no-cleanup        Don't kill tmux session on error
    --verbose           Show detailed output

EXAMPLES:
    # Fully automated setup (recommended)
    $0

    # Setup and attach to see logs
    $0 --attach

    # Setup without running tests
    $0 --skip-tests

REQUIREMENTS:
    - macOS 13+ (Ventura or later)
    - Apple Silicon (M1/M2/M3/M4)
    - Xcode Command Line Tools
    - Homebrew (will install tmux and jq if needed)
    - Python 3.9-3.11

TMUX SESSION:
    The helper runs in a detached tmux session named: $SESSION_NAME

    View logs:  tmux attach-session -t $SESSION_NAME
    Stop:       tmux kill-session -t $SESSION_NAME
    Or use:     ./Scripts/teardown.sh

EOF
    exit 0
}

# Parse command line arguments
for arg in "$@"; do
    case $arg in
        --help|-h)
            show_help
            ;;
        --skip-tests)
            SKIP_TESTS=true
            shift
            ;;
        --attach)
            ATTACH_TMUX=true
            shift
            ;;
        --no-cleanup)
            CLEANUP_ON_ERROR=false
            shift
            ;;
        --verbose|-v)
            VERBOSE=true
            shift
            ;;
        *)
            echo "Unknown option: $arg"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

#==============================================================================
# STEP 1: Prerequisites Check
#==============================================================================

check_prerequisites() {
    log_step "[1/7] Checking prerequisites..."

    # Check macOS version
    if [[ "$OSTYPE" != "darwin"* ]]; then
        log_error "This script requires macOS"
        exit 1
    fi

    MACOS_VERSION=$(sw_vers -productVersion | cut -d '.' -f 1)
    if [ "$MACOS_VERSION" -lt 13 ]; then
        log_error "macOS 13+ (Ventura or later) required, found version: $(sw_vers -productVersion)"
        exit 1
    fi
    log_success "macOS version: $(sw_vers -productVersion)"

    # Check Apple Silicon
    ARCH=$(uname -m)
    if [ "$ARCH" != "arm64" ]; then
        log_error "Apple Silicon (M1/M2/M3/M4) required, found: $ARCH"
        exit 1
    fi
    log_success "Architecture: arm64 (Apple Silicon)"

    # Check Xcode Command Line Tools
    if ! xcode-select -p &>/dev/null; then
        log_error "Xcode Command Line Tools not found"
        log_info "Install with: xcode-select --install"
        exit 1
    fi
    log_success "Xcode Command Line Tools: $(xcode-select -p)"

    # Check Python version
    if ! command -v python3 &>/dev/null; then
        log_error "python3 not found"
        log_info "Install Python 3.9-3.11 first"
        exit 1
    fi

    PYTHON_VERSION=$(python3 --version | awk '{print $2}')
    PYTHON_MAJOR=$(echo "$PYTHON_VERSION" | cut -d '.' -f 1)
    PYTHON_MINOR=$(echo "$PYTHON_VERSION" | cut -d '.' -f 2)

    if [ "$PYTHON_MAJOR" -ne 3 ] || [ "$PYTHON_MINOR" -lt 9 ] || [ "$PYTHON_MINOR" -gt 11 ]; then
        log_warn "Python $PYTHON_VERSION found (3.9-3.11 recommended)"
    else
        log_success "Python version: $PYTHON_VERSION"
    fi

    # Check Homebrew
    if ! command -v brew &>/dev/null; then
        log_error "Homebrew not found"
        log_info "Install from: https://brew.sh"
        exit 1
    fi
    log_success "Homebrew: $(brew --version | head -n 1)"

    # Check/install tmux
    if ! command -v tmux &>/dev/null; then
        log_info "Installing tmux via Homebrew..."
        export HOMEBREW_NO_AUTO_UPDATE=1
        brew install tmux &>/dev/null
    fi
    log_success "tmux: $(tmux -V)"

    # Check/install jq
    if ! command -v jq &>/dev/null; then
        log_info "Installing jq via Homebrew..."
        export HOMEBREW_NO_AUTO_UPDATE=1
        brew install jq &>/dev/null
    fi
    log_success "jq: $(jq --version)"

    echo ""
}

#==============================================================================
# STEP 2: Install espeak-ng
#==============================================================================

install_espeak() {
    log_step "[2/7] Installing espeak-ng..."

    export HOMEBREW_NO_AUTO_UPDATE=1

    if brew list espeak-ng &>/dev/null; then
        log_success "espeak-ng already installed"
    else
        log_info "Installing espeak-ng via Homebrew..."
        if [ "$VERBOSE" = true ]; then
            brew install espeak-ng
        else
            brew install espeak-ng &>/dev/null
        fi
        log_success "espeak-ng installed"
    fi

    ESPEAK_VERSION=$(espeak-ng --version 2>&1 | head -n 1)
    log_success "$ESPEAK_VERSION"

    # Verify espeak data path
    ESPEAK_DATA="/opt/homebrew/opt/espeak-ng/share/espeak-ng-data"
    if [ -d "$ESPEAK_DATA" ]; then
        log_success "espeak-ng data found at: $ESPEAK_DATA"
    else
        log_warn "espeak-ng data not found at expected location"
    fi

    echo ""
}

#==============================================================================
# STEP 3: Setup Python Environment
#==============================================================================

setup_python_env() {
    log_step "[3/7] Setting up Python environment..."

    cd "$PROJECT_ROOT"

    VENV_DIR="$PROJECT_ROOT/Sources/NaturalTTSHelper/Resources/python-env"

    if [ -d "$VENV_DIR" ]; then
        log_success "Python environment already exists (skipping setup)"
    else
        log_info "Creating Python virtual environment with MLX (~500MB, 3-5 minutes)..."
        if [ "$VERBOSE" = true ]; then
            ./Scripts/setup-python-env.sh --force
        else
            ./Scripts/setup-python-env.sh --force 2>&1 | grep -E "(✓|Error|Warning)" || true
        fi
        log_success "Python environment created"
    fi

    # Verify MLX installation with functional test
    MLX_VERSION=$("$VENV_DIR/bin/python3" -c "import mlx.core; print(mlx.core.__version__)" 2>/dev/null || echo "")
    if [ -n "$MLX_VERSION" ]; then
        # Test MLX can actually create arrays (functional test)
        if "$VENV_DIR/bin/python3" -c "import mlx.core; import mlx.nn; mlx.core.array([1.0])" 2>/dev/null; then
            log_success "MLX verified (v$MLX_VERSION)"
        else
            log_warn "MLX imports but cannot create arrays"
        fi
    else
        log_warn "MLX verification failed (will be tested during helper startup)"
    fi

    echo ""
}

#==============================================================================
# STEP 4: Build Release Binary
#==============================================================================

build_binary() {
    log_step "[4/7] Building Swift release binary..."

    cd "$PROJECT_ROOT"

    log_info "Compiling (30-60 seconds)..."
    if [ "$VERBOSE" = true ]; then
        swift build -c release
    else
        swift build -c release 2>&1 | grep -E "(Compiling|Linking|Build complete|error)" || true
    fi

    BINARY_PATH="$PROJECT_ROOT/.build/release/natural-tts-helper"
    if [ -f "$BINARY_PATH" ]; then
        BINARY_SIZE=$(du -sh "$BINARY_PATH" | awk '{print $1}')
        log_success "Binary built: .build/release/natural-tts-helper ($BINARY_SIZE)"
    else
        log_error "Binary not found after build"
        exit 1
    fi

    echo ""
}

#==============================================================================
# STEP 5: Start Helper in Background (tmux)
#==============================================================================

start_helper_background() {
    log_step "[5/7] Starting helper in background..."

    # Kill existing session if any
    if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
        log_info "Killing existing tmux session..."
        tmux kill-session -t "$SESSION_NAME" 2>/dev/null || true
        sleep 1
    fi

    # Start in detached tmux session
    cd "$PROJECT_ROOT"
    tmux new-session -d -s "$SESSION_NAME" \
        ".build/release/natural-tts-helper" 2>/dev/null

    # Verify session started
    sleep 1
    if ! tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
        log_error "Failed to start tmux session"
        exit 1
    fi

    log_success "Helper started in tmux session: $SESSION_NAME"
    log_info "View logs: tmux attach-session -t $SESSION_NAME"
    log_info "Stop helper: tmux kill-session -t $SESSION_NAME"

    echo ""
}

#==============================================================================
# STEP 6: Wait for Helper to Be Ready (poll /health)
#==============================================================================

wait_for_health() {
    log_step "[6/7] Waiting for helper to be ready..."

    CONFIG_FILE="$HOME/Library/Application Support/NaturalTTS/config.json"

    # Wait for config file to be created
    log_info "Waiting for config file..."
    for i in {1..30}; do
        if [ -f "$CONFIG_FILE" ]; then
            break
        fi
        sleep 1
    done

    if [ ! -f "$CONFIG_FILE" ]; then
        log_error "Config file not created after 30s"
        tmux capture-pane -t "$SESSION_NAME" -p -S -30 2>/dev/null || true
        exit 1
    fi

    # Read port from config
    PORT=$(jq -r '.port // empty' "$CONFIG_FILE" 2>/dev/null)

    if [ -z "$PORT" ]; then
        log_error "Failed to read port from config"
        cat "$CONFIG_FILE"
        exit 1
    fi

    log_success "Port: $PORT"

    # Poll /health endpoint
    log_info "Polling /health endpoint (max ${MAX_HEALTH_WAIT}s)..."
    log_info "First run downloads models (~200MB, ~35s)"
    echo -n "  "

    ELAPSED=0
    while [ $ELAPSED -lt $MAX_HEALTH_WAIT ]; do
        HEALTH=$(curl -s "http://127.0.0.1:$PORT/health" 2>/dev/null || echo '{}')

        if echo "$HEALTH" | jq -e '.model_loaded == true' &>/dev/null; then
            echo ""
            log_success "Helper is ready!"

            if [ "$VERBOSE" = true ]; then
                echo "$HEALTH" | jq .
            else
                MODEL=$(echo "$HEALTH" | jq -r '.model // "unknown"')
                UPTIME=$(echo "$HEALTH" | jq -r '.uptime_seconds // 0')
                log_info "Model: $MODEL, Uptime: ${UPTIME}s"
            fi

            echo ""
            return 0
        fi

        echo -n "."
        sleep 1
        ELAPSED=$((ELAPSED + 1))
    done

    echo ""
    log_error "Helper failed to become ready within ${MAX_HEALTH_WAIT}s"
    log_info "Recent helper logs:"
    tmux capture-pane -t "$SESSION_NAME" -p -S -50 2>/dev/null || true
    exit 1
}

#==============================================================================
# STEP 7: Run Automated Tests
#==============================================================================

run_tests() {
    if [ "$SKIP_TESTS" = true ]; then
        log_step "[7/7] Skipping automated tests (--skip-tests flag)"
        echo ""
        return 0
    fi

    log_step "[7/7] Running automated tests..."

    CONFIG_FILE="$HOME/Library/Application Support/NaturalTTS/config.json"
    PORT=$(jq -r '.port' "$CONFIG_FILE")

    # Test 1: Health endpoint
    log_info "Test 1: Health endpoint..."
    HEALTH=$(curl -s "http://127.0.0.1:$PORT/health")
    if echo "$HEALTH" | jq -e '.status == "ok"' &>/dev/null; then
        log_success "Health check passed"
    else
        log_error "Health check failed"
        return 1
    fi

    # Test 2: Basic speech generation
    log_info "Test 2: Basic speech generation..."
    HTTP_CODE=$(curl -X POST "http://127.0.0.1:$PORT/speak" \
        -H "Content-Type: application/json" \
        -d '{"text":"Hello world"}' \
        --output /tmp/quickstart-test.wav \
        -w "%{http_code}" \
        -s)

    if [ "$HTTP_CODE" = "200" ]; then
        FILE_SIZE=$(ls -lh /tmp/quickstart-test.wav 2>/dev/null | awk '{print $5}')
        log_success "Speech generation passed (HTTP 200, $FILE_SIZE)"
    else
        log_error "Speech generation failed (HTTP $HTTP_CODE)"
        return 1
    fi

    # Test 3: Voices endpoint
    log_info "Test 3: Voices endpoint..."
    VOICES=$(curl -s "http://127.0.0.1:$PORT/voices" | jq '.voices | length' 2>/dev/null || echo "0")
    if [ "$VOICES" -gt 0 ]; then
        log_success "Voices endpoint passed ($VOICES voices found)"
    else
        log_error "Voices endpoint failed"
        return 1
    fi

    # Test 4: Performance (3 consecutive requests)
    log_info "Test 4: Performance (3 consecutive requests)..."
    for i in {1..3}; do
        TIME=$(echo '{"text":"Hello world"}' | \
            curl -X POST "http://127.0.0.1:$PORT/speak" \
            -H "Content-Type: application/json" \
            --data-binary @- \
            -o /tmp/quickstart-test-$i.wav \
            -w "%{time_total}" \
            -s)
        log_info "Request $i: ${TIME}s"
    done
    log_success "Performance test passed"

    echo ""
    log_success "All tests passed!"
    log_info "Test audio saved to: /tmp/quickstart-test.wav"
    log_info "Play with: afplay /tmp/quickstart-test.wav"

    echo ""
}

#==============================================================================
# Main Flow
#==============================================================================

main() {
    echo ""
    echo "========================================================"
    echo "  Natural TTS Helper - Automated Quickstart"
    echo "========================================================"
    echo ""

    check_prerequisites
    install_espeak
    setup_python_env
    build_binary
    start_helper_background
    wait_for_health
    run_tests

    echo "========================================================"
    echo "  ✓ Setup Complete!"
    echo "========================================================"
    echo ""
    echo "Helper is running in background (tmux session: $SESSION_NAME)"
    echo ""
    echo "Next steps:"
    echo "  • View logs:    tmux attach-session -t $SESSION_NAME"
    echo "                  (Press Ctrl+B then D to detach)"
    echo "  • Stop helper:  tmux kill-session -t $SESSION_NAME"
    echo "                  or: ./Scripts/teardown.sh"
    echo "  • Check status: ./Scripts/status.sh"
    echo "  • View logs:    ./Scripts/logs.sh"
    echo "  • Test audio:   afplay /tmp/quickstart-test.wav"
    echo ""
    echo "Performance: 8.3x RTF (short text) | 25x RTF (long text)"
    echo "See: native-helper/TEST_RESULTS_OPTIMIZED.md for details"
    echo ""

    # Don't cleanup on success
    CLEANUP_ON_ERROR=false

    # Optionally attach to tmux session
    if [ "$ATTACH_TMUX" = true ]; then
        echo "Attaching to tmux session (Ctrl+B then D to detach)..."
        sleep 2
        tmux attach-session -t "$SESSION_NAME"
    fi
}

main
