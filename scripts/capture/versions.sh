#!/usr/bin/env bash
# Print the capture toolchain versions; save the output next to every capture set (R09 §8, §12 step 11).
# Usage: scripts/capture/versions.sh [chrome-binary] > <out-dir>/toolchain.txt
set -uo pipefail
CHROME="${1:-$HOME/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing}"
repo="$(cd "$(dirname "$0")/../.." && pwd)"
echo "date:     $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "repo sha: $(git -C "$repo" rev-parse HEAD 2>/dev/null || echo unknown)"
echo "macOS:    $(sw_vers -productVersion) ($(uname -m))"
echo "chrome:   $("$CHROME" --version 2>/dev/null || echo "missing: $CHROME")"
echo "ffmpeg:   $(ffmpeg -hide_banner -version 2>/dev/null | head -1 || echo missing)"
echo "magick:   $(magick -version 2>/dev/null | head -1 || echo missing)"
echo "swiftc:   $(swiftc --version 2>&1 | head -1)"
echo "node:     $(node --version 2>/dev/null || echo missing)"
echo "bun:      $(bun --version 2>/dev/null || echo missing)"
