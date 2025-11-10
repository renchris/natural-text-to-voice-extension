#!/bin/bash
#==============================================================================
# Natural TTS Helper - Short Text Performance Test
#==============================================================================
#
# Tests performance with short text (~1.57s audio).
# Runs 10 consecutive requests and calculates average RTF.
#
# Expected: 8.3x RTF average (warm requests)
#
# Usage:
#   ./Scripts/test-performance-short.sh
#
#==============================================================================

set -euo pipefail

CONFIG_FILE="$HOME/Library/Application Support/NaturalTTS/config.json"

# Colors
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo "========================================"
echo "  Short Text Performance Test"
echo "========================================"
echo ""

# Check helper is running
if [ ! -f "$CONFIG_FILE" ]; then
    echo "Error: Config file not found"
    echo "Helper may not be running. Start with: ./Scripts/quickstart.sh"
    exit 1
fi

PORT=$(jq -r '.port' "$CONFIG_FILE" 2>/dev/null)

if [ -z "$PORT" ]; then
    echo "Error: Failed to read port from config"
    exit 1
fi

echo "Testing 10 consecutive requests with 'Hello world'"
echo "Audio duration: ~1.57s"
echo ""

# Audio duration for "Hello world" is ~1.57s
AUDIO_DURATION=1.57

declare -a TIMES
declare -a RTFS
TOTAL_TIME=0

for i in $(seq 1 10); do
    echo -n "Request $i: "

    START=$(date +%s.%N)

    TIME=$(echo '{"text": "Hello world", "voice": "af_bella", "speed": 1.0}' | \
        curl -X POST "http://127.0.0.1:$PORT/speak" \
        -H "Content-Type: application/json" \
        --data-binary @- \
        -o /tmp/test_short_$i.wav \
        -w "%{time_total}" \
        -s)

    TIMES+=("$TIME")
    TOTAL_TIME=$(echo "$TOTAL_TIME + $TIME" | bc)

    # Calculate RTF
    RTF=$(echo "scale=2; $AUDIO_DURATION / $TIME" | bc)
    RTFS+=("$RTF")

    echo -e "${GREEN}${TIME}s${NC} → RTF: ${CYAN}${RTF}x${NC}"

    sleep 0.2
done

echo ""
echo "========================================"
echo "  Results"
echo "========================================"
echo ""

# Calculate average
AVG_TIME=$(echo "scale=3; $TOTAL_TIME / 10" | bc)
AVG_RTF=$(echo "scale=1; $AUDIO_DURATION / $AVG_TIME" | bc)

echo "Audio duration: ${AUDIO_DURATION}s"
echo "Average generation time: ${AVG_TIME}s"
echo "Average RTF: ${AVG_RTF}x"
echo ""

# Expected performance
echo "Expected (warm): ~0.18s (8.3x RTF)"
echo "Expected (cold):  0.31s (5.0x RTF)"
echo "Target: ≥2.5x RTF"
echo ""

# Status
if (( $(echo "$AVG_RTF >= 8.0" | bc -l) )); then
    echo -e "${GREEN}✓ Performance: EXCELLENT${NC} (far exceeds target)"
elif (( $(echo "$AVG_RTF >= 5.0" | bc -l) )); then
    echo -e "${GREEN}✓ Performance: GOOD${NC} (exceeds target)"
elif (( $(echo "$AVG_RTF >= 2.5" | bc -l) )); then
    echo -e "${GREEN}✓ Performance: ACCEPTABLE${NC} (meets target)"
else
    echo -e "${RED}✗ Performance: BELOW TARGET${NC}"
fi

echo ""
