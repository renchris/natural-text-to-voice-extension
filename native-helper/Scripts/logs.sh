#!/bin/bash
#==============================================================================
# Natural TTS Helper - View Logs Script
#==============================================================================
#
# Display logs from the Natural TTS Helper tmux session.
#
# Usage:
#   ./Scripts/logs.sh           # Show last 100 lines
#   ./Scripts/logs.sh 50        # Show last 50 lines
#   ./Scripts/logs.sh --follow  # Follow logs (attach to session)
#
#==============================================================================

set -euo pipefail

SESSION_NAME="natural-tts-helper"

# Colors
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# Parse arguments
LINES=100
FOLLOW=false

if [ $# -gt 0 ]; then
    case "$1" in
        --follow|-f)
            FOLLOW=true
            ;;
        [0-9]*)
            LINES=$1
            ;;
        *)
            echo "Usage: $0 [LINES] or $0 --follow"
            echo "  LINES:   Number of lines to show (default: 100)"
            echo "  --follow: Attach to tmux session to follow logs"
            exit 1
            ;;
    esac
fi

if ! tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    echo -e "${RED}✗ Helper is not running${NC}"
    echo "  (no tmux session '$SESSION_NAME' found)"
    echo ""
    echo "Start the helper with: ./Scripts/quickstart.sh"
    exit 1
fi

if [ "$FOLLOW" = true ]; then
    echo -e "${BLUE}Following logs (Ctrl+B then D to detach)...${NC}"
    echo ""
    sleep 1
    tmux attach-session -t "$SESSION_NAME"
else
    echo -e "${BLUE}Last $LINES lines from Natural TTS Helper:${NC}"
    echo ""
    tmux capture-pane -t "$SESSION_NAME" -p -S -$LINES
fi
