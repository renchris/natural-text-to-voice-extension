#!/bin/bash
#==============================================================================
# Natural TTS Helper - Long Text Performance Test
#==============================================================================
#
# Tests performance with longer text (~21.7s audio, 50 words).
# Runs 10 consecutive requests and calculates average RTF.
#
# Expected: 25x RTF average
#
# Usage:
#   ./Scripts/test-performance-long.sh
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
echo "  Long Text Performance Test"
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

# Create test payload (50 words, ~21.7s audio)
cat > /tmp/long_test.json << 'EOF'
{
  "text": "The development of modern text-to-speech systems has revolutionized how we interact with technology, enabling natural-sounding voices that can convey emotion and nuance with remarkable accuracy and speed.",
  "voice": "af_bella",
  "speed": 1.0
}
EOF

AUDIO_DURATION=21.7

echo "Testing 10 consecutive requests with 50-word text"
echo "Audio duration: ~${AUDIO_DURATION}s"
echo ""

declare -a TIMES
declare -a RTFS
TOTAL_TIME=0

for i in $(seq 1 10); do
    echo -n "Request $i: "

    START=$(date +%s.%N)

    TIME=$(curl -X POST "http://127.0.0.1:$PORT/speak" \
        -H "Content-Type: application/json" \
        --data-binary @/tmp/long_test.json \
        -o /tmp/test_long_$i.wav \
        -w "%{time_total}" \
        -s)

    TIMES+=("$TIME")
    TOTAL_TIME=$(echo "$TOTAL_TIME + $TIME" | bc)

    # Calculate RTF
    RTF=$(echo "scale=1; $AUDIO_DURATION / $TIME" | bc)
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
AVG_TIME=$(echo "scale=2; $TOTAL_TIME / 10" | bc)
AVG_RTF=$(echo "scale=1; $AUDIO_DURATION / $AVG_TIME" | bc)

echo "Audio duration: ${AUDIO_DURATION}s"
echo "Average generation time: ${AVG_TIME}s"
echo "Average RTF: ${AVG_RTF}x"
echo ""

# Expected performance
echo "Expected: ~0.85s (25x RTF)"
echo "Target: ≥2.5x RTF"
echo ""

# Status
if (( $(echo "$AVG_RTF >= 20.0" | bc -l) )); then
    echo -e "${GREEN}✓ Performance: EXCELLENT${NC} (far exceeds target)"
elif (( $(echo "$AVG_RTF >= 10.0" | bc -l) )); then
    echo -e "${GREEN}✓ Performance: GOOD${NC} (exceeds target)"
elif (( $(echo "$AVG_RTF >= 2.5" | bc -l) )); then
    echo -e "${GREEN}✓ Performance: ACCEPTABLE${NC} (meets target)"
else
    echo -e "${RED}✗ Performance: BELOW TARGET${NC}"
fi

echo ""
echo "Audio files saved to: /tmp/test_long_*.wav"
echo ""
