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
#   - macOS 14+ with Apple Silicon
#   - Homebrew installed
#   - uv, tmux and jq (auto-installed if missing); uv provides Python 3.12
#
# Re-running it is how an existing install is updated: step 3 always runs
# Scripts/setup-python-env.sh, which syncs the locked environment in place (a
# pre-1.5 pip environment is moved once to native-helper/.python-env.pre-1.5).
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
    - macOS 14+ (Sonoma or later)
    - Apple Silicon (M1 or later)
    - Xcode Command Line Tools (Swift 6.0+, Xcode 16.2 or later)
    - Homebrew (will install uv, tmux and jq if needed)
    - Python 3.12 is installed by uv; no system Python is needed

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
    if [ "$MACOS_VERSION" -lt 14 ]; then
        log_error "macOS 14+ (Sonoma or later) required, found version: $(sw_vers -productVersion)"
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

    # Swift 6.0+: the pinned swift-nio / swift-log manifests declare swift-tools-version 6.0, which an
    # older toolchain cannot even parse (Package.swift, "Build floor").
    SWIFT_VERSION=$(swift --version 2>/dev/null | sed -nE 's/.*Swift version ([0-9]+)\.([0-9]+).*/\1.\2/p' | head -n 1)
    if [ -z "$SWIFT_VERSION" ] || [ "${SWIFT_VERSION%%.*}" -lt 6 ]; then
        log_error "Swift 6.0+ required, found: ${SWIFT_VERSION:-none}"
        log_info "Install Xcode 16.2 or newer (or its Command Line Tools)"
        exit 1
    fi
    log_success "Swift: $SWIFT_VERSION"

    # Check Homebrew
    if ! command -v brew &>/dev/null; then
        log_error "Homebrew not found"
        log_info "Install from: https://brew.sh"
        exit 1
    fi
    log_success "Homebrew: $(brew --version | head -n 1)"

    # Check/install uv (builds the locked environment and provides Python 3.12)
    if ! command -v uv &>/dev/null; then
        log_info "Installing uv via Homebrew..."
        export HOMEBREW_NO_AUTO_UPDATE=1
        brew install uv &>/dev/null
    fi
    log_success "uv: $(uv --version)"

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

    # Always run the setup script, even when an environment exists: it is idempotent
    # (uv sync --frozen reconciles in place), and it is what updates a pre-1.5 install.
    # Skipping it left the old pip environment under a new worker. Failures stop here.
    log_info "Syncing the locked Python environment (first run: ~0.66 GB + ~0.35 GB model)..."
    if [ "$VERBOSE" = true ]; then
        ./Scripts/setup-python-env.sh
    else
        SETUP_LOG="$(mktemp "${TMPDIR:-/tmp}/ntts-python-setup.XXXXXX")"
        if ! ./Scripts/setup-python-env.sh >"$SETUP_LOG" 2>&1; then
            log_error "Python environment setup failed (full log: $SETUP_LOG):"
            tail -n 20 "$SETUP_LOG"
            exit 1
        fi
        rm -f "$SETUP_LOG"
    fi
    log_success "Python environment ready"

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
    # Fail closed on swift build's own exit status. The old "| grep ... || true" hid a failed build, and
    # the existence check below then passed on the PREVIOUS binary: an update run reported success and
    # started the old helper again.
    BUILD_LOG="$(mktemp "${TMPDIR:-/tmp}/ntts-swift-build.XXXXXX")"
    BUILD_STATUS=0
    if [ "$VERBOSE" = true ]; then
        swift build -c release 2>&1 | tee "$BUILD_LOG" || BUILD_STATUS=$?
    else
        swift build -c release >"$BUILD_LOG" 2>&1 || BUILD_STATUS=$?
    fi
    if [ "$BUILD_STATUS" -ne 0 ]; then
        log_error "Swift build failed (exit $BUILD_STATUS; full log: $BUILD_LOG):"
        tail -n 20 "$BUILD_LOG"
        log_info "The helper needs a Swift 6.0+ toolchain (Xcode 16.2 or its Command Line Tools)."
        exit 1
    fi
    rm -f "$BUILD_LOG"

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
            # A helper without apiVersion 2 is an older build (a stale binary, or an old helper still
            # holding the port): the update did not take, whatever the steps above printed.
            if ! echo "$HEALTH" | jq -e '(.apiVersion // 0) >= 2' &>/dev/null; then
                log_error "The helper on port $PORT is an older build (no apiVersion 2): $(echo "$HEALTH" | jq -c .)"
                log_info "Stop it (tmux kill-session -t $SESSION_NAME, or quit the old helper) and run this script again."
                exit 1
            fi
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
