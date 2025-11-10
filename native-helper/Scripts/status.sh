#!/bin/bash
#==============================================================================
# Natural TTS Helper - Status Check Script
#==============================================================================
#
# Check the status of the Natural TTS Helper by querying the /health endpoint.
#
# Usage:
#   ./Scripts/status.sh         # Check status
#   ./Scripts/status.sh --json  # Output raw JSON
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
NC='\033[0m'

# Parse arguments
RAW_JSON=false
if [ $# -gt 0 ] && [ "$1" = "--json" ]; then
    RAW_JSON=true
fi

# Check if tmux session exists
if ! tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    echo -e "${RED}✗ Helper is not running${NC}"
    echo "  (no tmux session '$SESSION_NAME' found)"
    echo ""
    echo "Start the helper with: ./Scripts/quickstart.sh"
    exit 1
fi

echo -e "${BLUE}Helper tmux session: ${GREEN}✓ running${NC}"

# Check if config file exists
if [ ! -f "$CONFIG_FILE" ]; then
    echo -e "${YELLOW}⚠ Config file not found${NC}"
    echo "  Helper may still be starting up..."
    exit 1
fi

# Read port from config
PORT=$(jq -r '.port // empty' "$CONFIG_FILE" 2>/dev/null)

if [ -z "$PORT" ]; then
    echo -e "${RED}✗ Failed to read port from config${NC}"
    exit 1
fi

echo -e "${BLUE}Port: ${NC}$PORT"
echo ""

# Query /health endpoint
HEALTH=$(curl -s "http://127.0.0.1:$PORT/health" 2>/dev/null || echo '{}')

if [ "$RAW_JSON" = true ]; then
    # Output raw JSON
    echo "$HEALTH" | jq .
else
    # Parse and display nicely
    STATUS=$(echo "$HEALTH" | jq -r '.status // "unknown"')
    MODEL=$(echo "$HEALTH" | jq -r '.model // "unknown"')
    MODEL_LOADED=$(echo "$HEALTH" | jq -r '.model_loaded // false')
    UPTIME=$(echo "$HEALTH" | jq -r '.uptime_seconds // 0')
    REQUESTS=$(echo "$HEALTH" | jq -r '.requests_served // 0')

    echo -e "${BLUE}Status:${NC} $STATUS"
    echo -e "${BLUE}Model:${NC} $MODEL"
    echo -e "${BLUE}Model loaded:${NC} $MODEL_LOADED"
    echo -e "${BLUE}Uptime:${NC} ${UPTIME}s"
    echo -e "${BLUE}Requests served:${NC} $REQUESTS"

    echo ""

    if [ "$STATUS" = "ok" ] && [ "$MODEL_LOADED" = "true" ]; then
        echo -e "${GREEN}✓ Helper is ready and accepting requests${NC}"
    else
        echo -e "${YELLOW}⚠ Helper is starting up (model loading)...${NC}"
    fi
fi

echo ""
