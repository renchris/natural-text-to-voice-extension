#!/bin/bash
#==============================================================================
# Natural TTS Helper - Interactive Demo Script
#==============================================================================
#
# Interactive menu-driven demo for testing the Natural TTS Helper.
# Explore voices, speeds, custom text, and performance benchmarking.
#
# Usage:
#   ./Scripts/demo.sh
#
#==============================================================================

set -euo pipefail

SESSION_NAME="natural-tts-helper"
CONFIG_FILE="$HOME/Library/Application Support/NaturalTTS/config.json"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Audio playback temp directory
TEMP_DIR="/tmp/natural-tts-demo"
mkdir -p "$TEMP_DIR"

#==============================================================================
# Helper Functions
#==============================================================================

print_header() {
    echo ""
    echo "========================================"
    echo "  $1"
    echo "========================================"
    echo ""
}

print_separator() {
    echo ""
    echo "----------------------------------------"
    echo ""
}

log_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
}

log_error() {
    echo -e "${RED}✗${NC} $1"
}

log_perf() {
    echo -e "${CYAN}⚡${NC} $1"
}

#==============================================================================
# Check Helper Status
#==============================================================================

check_helper_running() {
    if ! tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
        log_error "Helper is not running"
        echo ""
        echo "Start the helper with: ./Scripts/quickstart.sh"
        echo "Or: cd native-helper && swift build -c release && .build/release/natural-tts-helper"
        exit 1
    fi

    if [ ! -f "$CONFIG_FILE" ]; then
        log_error "Config file not found"
        echo "Helper may still be starting up..."
        exit 1
    fi

    PORT=$(jq -r '.port // empty' "$CONFIG_FILE" 2>/dev/null)

    if [ -z "$PORT" ]; then
        log_error "Failed to read port from config"
        exit 1
    fi

    # Test health endpoint
    HEALTH=$(curl -s "http://127.0.0.1:$PORT/health" 2>/dev/null || echo '{}')
    STATUS=$(echo "$HEALTH" | jq -r '.status // "unknown"')
    MODEL_LOADED=$(echo "$HEALTH" | jq -r '.model_loaded // false')

    if [ "$STATUS" != "ok" ] || [ "$MODEL_LOADED" != "true" ]; then
        log_error "Helper is not ready (model still loading)"
        echo "Wait a few seconds and try again..."
        exit 1
    fi

    log_success "Helper is ready on port $PORT"
}

#==============================================================================
# Main Menu
#==============================================================================

show_menu() {
    print_header "Natural TTS Helper - Interactive Demo"

    echo "Choose an option:"
    echo ""
    echo -e "  ${GREEN}1${NC}. Test all voices (hear 6 different voices)"
    echo -e "  ${CYAN}2${NC}. Test different speeds (0.5x to 2.0x)"
    echo -e "  ${BLUE}3${NC}. Custom text (enter your own text)"
    echo -e "  ${MAGENTA}4${NC}. Performance test (benchmark RTF)"
    echo -e "  ${YELLOW}5${NC}. View helper status"
    echo -e "  ${RED}6${NC}. Exit"
    echo ""
    echo -n "Choice [1-6]: "
}

#==============================================================================
# Option 1: Test All Voices
#==============================================================================

test_all_voices() {
    print_header "Test All Voices"

    log_info "Fetching available voices..."
    VOICES_JSON=$(curl -s "http://127.0.0.1:$PORT/voices" 2>/dev/null)

    if [ -z "$VOICES_JSON" ]; then
        log_error "Failed to fetch voices"
        return
    fi

    # Get voice IDs
    VOICE_IDS=$(echo "$VOICES_JSON" | jq -r '.voices[].id' 2>/dev/null)
    VOICE_COUNT=$(echo "$VOICE_IDS" | wc -l | tr -d ' ')

    log_success "Found $VOICE_COUNT voices"
    echo ""

    # Test each voice
    local counter=1
    while IFS= read -r voice_id; do
        VOICE_NAME=$(echo "$VOICES_JSON" | jq -r ".voices[] | select(.id==\"$voice_id\") | .name")

        echo -e "${CYAN}[$counter/$VOICE_COUNT]${NC} Testing voice: ${GREEN}$VOICE_NAME${NC} ($voice_id)"

        START_TIME=$(date +%s.%N)

        HTTP_CODE=$(curl -X POST "http://127.0.0.1:$PORT/speak" \
            -H "Content-Type: application/json" \
            -d "{\"text\":\"Hello! This is $VOICE_NAME, voice ID $voice_id.\",\"voice\":\"$voice_id\"}" \
            --output "$TEMP_DIR/voice_$voice_id.wav" \
            -w "%{http_code}" \
            -s 2>/dev/null)

        END_TIME=$(date +%s.%N)
        GEN_TIME=$(echo "$END_TIME - $START_TIME" | bc)

        if [ "$HTTP_CODE" = "200" ]; then
            log_perf "Generated in ${GEN_TIME}s"
            log_info "Playing audio..."
            afplay "$TEMP_DIR/voice_$voice_id.wav" 2>/dev/null
            echo ""
        else
            log_error "Failed (HTTP $HTTP_CODE)"
            echo ""
        fi

        counter=$((counter + 1))
    done <<< "$VOICE_IDS"

    log_success "Tested $VOICE_COUNT voices"
    print_separator
}

#==============================================================================
# Option 2: Test Different Speeds
#==============================================================================

test_different_speeds() {
    print_header "Test Different Speeds"

    SPEEDS=(0.5 0.75 1.0 1.25 1.5 2.0)
    SPEED_LABELS=("0.5x (Very Slow)" "0.75x (Slow)" "1.0x (Normal)" "1.25x (Fast)" "1.5x (Very Fast)" "2.0x (Maximum)")

    log_info "Testing ${#SPEEDS[@]} different speeds..."
    echo ""

    for i in "${!SPEEDS[@]}"; do
        SPEED="${SPEEDS[$i]}"
        LABEL="${SPEED_LABELS[$i]}"

        echo -e "${CYAN}[$((i+1))/${#SPEEDS[@]}]${NC} Testing speed: ${GREEN}$LABEL${NC}"

        START_TIME=$(date +%s.%N)

        HTTP_CODE=$(curl -X POST "http://127.0.0.1:$PORT/speak" \
            -H "Content-Type: application/json" \
            -d "{\"text\":\"This is speed $SPEED. The quick brown fox jumps over the lazy dog.\",\"speed\":$SPEED}" \
            --output "$TEMP_DIR/speed_$SPEED.wav" \
            -w "%{http_code}" \
            -s 2>/dev/null)

        END_TIME=$(date +%s.%N)
        GEN_TIME=$(echo "$END_TIME - $START_TIME" | bc)

        if [ "$HTTP_CODE" = "200" ]; then
            log_perf "Generated in ${GEN_TIME}s"
            log_info "Playing audio..."
            afplay "$TEMP_DIR/speed_$SPEED.wav" 2>/dev/null
            echo ""
        else
            log_error "Failed (HTTP $HTTP_CODE)"
            echo ""
        fi
    done

    log_success "Tested ${#SPEEDS[@]} speeds"
    print_separator
}

#==============================================================================
# Option 3: Custom Text
#==============================================================================

test_custom_text() {
    print_header "Custom Text"

    echo "Enter your text (or press Enter for sample text):"
    echo -n "> "
    read -r USER_TEXT

    if [ -z "$USER_TEXT" ]; then
        USER_TEXT="The Natural TTS Helper uses MLX Kokoro-82M to generate speech on Apple Silicon with Metal GPU acceleration, achieving eight point three times real-time factor for short text and twenty-five times for longer text."
        log_info "Using sample text"
    fi

    echo ""
    log_info "Text: \"$USER_TEXT\""
    echo ""

    # Get available voices for selection
    VOICES_JSON=$(curl -s "http://127.0.0.1:$PORT/voices" 2>/dev/null)
    VOICE_IDS=($(echo "$VOICES_JSON" | jq -r '.voices[].id' 2>/dev/null))

    echo "Select voice:"
    for i in "${!VOICE_IDS[@]}"; do
        VOICE_ID="${VOICE_IDS[$i]}"
        VOICE_NAME=$(echo "$VOICES_JSON" | jq -r ".voices[] | select(.id==\"$VOICE_ID\") | .name")
        echo "  $((i+1)). $VOICE_NAME ($VOICE_ID)"
    done
    echo "  Enter: Use default (af_bella)"
    echo ""
    echo -n "Choice [1-${#VOICE_IDS[@]}] or Enter: "
    read -r VOICE_CHOICE

    if [ -z "$VOICE_CHOICE" ]; then
        SELECTED_VOICE="af_bella"
    else
        SELECTED_VOICE="${VOICE_IDS[$((VOICE_CHOICE-1))]}"
    fi

    echo ""
    echo "Select speed:"
    echo "  1. 0.5x (Very Slow)"
    echo "  2. 1.0x (Normal)"
    echo "  3. 1.5x (Fast)"
    echo "  Enter: Use normal (1.0x)"
    echo ""
    echo -n "Choice [1-3] or Enter: "
    read -r SPEED_CHOICE

    case "$SPEED_CHOICE" in
        1) SELECTED_SPEED=0.5 ;;
        3) SELECTED_SPEED=1.5 ;;
        *) SELECTED_SPEED=1.0 ;;
    esac

    echo ""
    log_info "Voice: $SELECTED_VOICE, Speed: ${SELECTED_SPEED}x"
    log_info "Generating audio..."

    START_TIME=$(date +%s.%N)

    # Use jq to properly escape the JSON
    JSON_PAYLOAD=$(jq -n \
        --arg text "$USER_TEXT" \
        --arg voice "$SELECTED_VOICE" \
        --argjson speed "$SELECTED_SPEED" \
        '{text: $text, voice: $voice, speed: $speed}')

    RESPONSE=$(curl -X POST "http://127.0.0.1:$PORT/speak" \
        -H "Content-Type: application/json" \
        -d "$JSON_PAYLOAD" \
        --output "$TEMP_DIR/custom.wav" \
        -w "\n%{http_code}\n%{header_json}" \
        -s 2>/dev/null)

    HTTP_CODE=$(echo "$RESPONSE" | tail -n 2 | head -n 1)

    END_TIME=$(date +%s.%N)
    GEN_TIME=$(echo "$END_TIME - $START_TIME" | bc)

    if [ "$HTTP_CODE" = "200" ]; then
        log_success "Generated successfully"
        log_perf "Generation time: ${GEN_TIME}s"

        # Try to extract audio duration if available
        AUDIO_SIZE=$(ls -lh "$TEMP_DIR/custom.wav" 2>/dev/null | awk '{print $5}')
        log_info "Audio file size: $AUDIO_SIZE"

        echo ""
        log_info "Playing audio..."
        afplay "$TEMP_DIR/custom.wav" 2>/dev/null

        echo ""
        log_success "Audio saved to: $TEMP_DIR/custom.wav"
    else
        log_error "Failed (HTTP $HTTP_CODE)"
    fi

    print_separator
}

#==============================================================================
# Option 4: Performance Test
#==============================================================================

test_performance() {
    print_header "Performance Test"

    log_info "Running 10 consecutive requests..."
    echo ""

    TEST_TEXT="Hello from Natural TTS Helper! This is a performance test."
    AUDIO_DURATION=2.5  # Approximate

    declare -a TIMES
    TOTAL_TIME=0

    for i in {1..10}; do
        echo -n "Request $i: "

        START=$(date +%s.%N)

        HTTP_CODE=$(curl -X POST "http://127.0.0.1:$PORT/speak" \
            -H "Content-Type: application/json" \
            -d "{\"text\":\"$TEST_TEXT\"}" \
            --output "$TEMP_DIR/perf_$i.wav" \
            -w "%{http_code}" \
            -s 2>/dev/null)

        END=$(date +%s.%N)
        TIME=$(echo "$END - $START" | bc)
        TIMES+=("$TIME")
        TOTAL_TIME=$(echo "$TOTAL_TIME + $TIME" | bc)

        RTF=$(echo "scale=2; $AUDIO_DURATION / $TIME" | bc)

        if [ "$HTTP_CODE" = "200" ]; then
            echo -e "${GREEN}${TIME}s${NC} (${CYAN}${RTF}x RTF${NC})"
        else
            echo -e "${RED}FAILED${NC} (HTTP $HTTP_CODE)"
        fi
    done

    echo ""
    AVG_TIME=$(echo "scale=3; $TOTAL_TIME / 10" | bc)
    AVG_RTF=$(echo "scale=2; $AUDIO_DURATION / $AVG_TIME" | bc)

    log_success "Performance Summary:"
    echo "  Average generation time: ${AVG_TIME}s"
    echo "  Average RTF: ${AVG_RTF}x"
    echo "  Target: ≥2.5x RTF"

    if (( $(echo "$AVG_RTF >= 2.5" | bc -l) )); then
        log_success "Performance: EXCELLENT (exceeds target)"
    else
        log_error "Performance: Below target"
    fi

    print_separator
}

#==============================================================================
# Option 5: View Status
#==============================================================================

view_status() {
    print_header "Helper Status"

    HEALTH=$(curl -s "http://127.0.0.1:$PORT/health" 2>/dev/null)

    if [ -z "$HEALTH" ]; then
        log_error "Failed to fetch status"
        return
    fi

    STATUS=$(echo "$HEALTH" | jq -r '.status // "unknown"')
    MODEL=$(echo "$HEALTH" | jq -r '.model // "unknown"')
    MODEL_LOADED=$(echo "$HEALTH" | jq -r '.model_loaded // false')
    UPTIME=$(echo "$HEALTH" | jq -r '.uptime_seconds // 0')
    REQUESTS=$(echo "$HEALTH" | jq -r '.requests_served // 0')

    # Convert uptime to human readable
    UPTIME_MIN=$(echo "scale=0; $UPTIME / 60" | bc)
    UPTIME_HOURS=$(echo "scale=0; $UPTIME / 3600" | bc)

    echo "Status:          $STATUS"
    echo "Model:           $MODEL"
    echo "Model loaded:    $MODEL_LOADED"
    echo "Port:            $PORT"
    echo "Uptime:          ${UPTIME_HOURS}h ${UPTIME_MIN}m"
    echo "Requests served: $REQUESTS"
    echo ""

    if [ "$STATUS" = "ok" ] && [ "$MODEL_LOADED" = "true" ]; then
        log_success "Helper is ready and accepting requests"
    else
        log_error "Helper is not ready"
    fi

    print_separator
}

#==============================================================================
# Main Loop
#==============================================================================

main() {
    # Check helper is running before showing menu
    check_helper_running
    echo ""

    while true; do
        show_menu
        read -r choice

        case $choice in
            1)
                test_all_voices
                ;;
            2)
                test_different_speeds
                ;;
            3)
                test_custom_text
                ;;
            4)
                test_performance
                ;;
            5)
                view_status
                ;;
            6)
                echo ""
                log_info "Exiting demo..."
                echo ""
                exit 0
                ;;
            *)
                echo ""
                log_error "Invalid choice. Please enter 1-6."
                echo ""
                ;;
        esac
    done
}

# Cleanup temp files on exit
trap "rm -rf $TEMP_DIR" EXIT

main
