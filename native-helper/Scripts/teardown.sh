#!/bin/bash
#==============================================================================
# Natural TTS Helper - Teardown Script
#==============================================================================
#
# Stop the Natural TTS Helper running in the background tmux session.
#
# Usage:
#   ./Scripts/teardown.sh
#
#==============================================================================

set -euo pipefail

SESSION_NAME="natural-tts-helper"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo "Stopping Natural TTS Helper..."

if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    # Show last few lines before killing
    echo ""
    echo "Recent logs:"
    tmux capture-pane -t "$SESSION_NAME" -p -S -10 2>/dev/null || true
    echo ""

    # Kill session
    tmux kill-session -t "$SESSION_NAME" 2>/dev/null

    echo -e "${GREEN}✓ Helper stopped${NC}"
    echo "  (tmux session '$SESSION_NAME' terminated)"
else
    echo -e "${YELLOW}⚠ Helper is not running${NC}"
    echo "  (no tmux session '$SESSION_NAME' found)"
fi

echo ""
