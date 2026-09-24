#!/usr/bin/env bash
# Render the terminal casts (VHS 0.11) and encode them for the README.
#
# Usage: scripts/capture/tapes/render.sh helper|gate [out-dir=assets/media]
#
#   helper  tape -> /tmp/ntts-w3-out/tapes/helper.gif -> <out>/helper.webp (gif2webp -m 6 -min_size: lossless, the
#           demo-recording skill's recipe for flat terminal output). Needs port 8250 free.
#   gate    tape -> /tmp/ntts-w3-out/tapes/gate.gif of a real `bash scripts/verify-all.sh` (~3.5 min) ->
#           <out>/gate.webp, sped up by retime.mjs: every stretch where the screen does not change is cut to at most
#           120 ms, typing keeps its pace, and the final table is held 6 s. Nothing on screen is edited; only idle
#           time is removed. Takes ~4-5 min; needs the python-env the gate itself needs.
#
# Both tapes source env.sh first (hidden), so no username or home path is ever on screen.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
OUTDIR="$(cd "${2:-$REPO/assets/media}" && pwd)"
TMP=/tmp/ntts-w3-out/tapes
mkdir -p "$TMP"
export TAPE_ENV="$HERE/env.sh"
case "${1:?usage: render.sh helper|gate [out-dir]}" in
  helper)
    if lsof -nP -iTCP:8250 -sTCP:LISTEN >/dev/null 2>&1; then echo "port 8250 is in use" >&2; exit 2; fi
    (cd "$REPO" && vhs "$HERE/helper.tape")
    gif2webp -m 6 -min_size -mt "$TMP/helper.gif" -o "$OUTDIR/helper.webp"
    ;;
  gate)
    [ -e "$REPO/native-helper/Sources/NaturalTTSHelper/Resources/python-env/bin/python3" ] || {
      echo "verify-all needs native-helper/Sources/NaturalTTSHelper/Resources/python-env (a worktree can symlink the main checkout's)" >&2; exit 2; }
    mkdir -p /tmp/natural-tts && ln -sfn "$REPO" /tmp/natural-tts/repo
    mkdir -p /tmp/natural-tts/tmp
    (cd "$REPO" && vhs "$HERE/gate.tape")
    node "$HERE/retime.mjs" "$TMP/gate.gif" "$OUTDIR/gate.webp" --fps 25 --idle 120 --hold 6000
    ;;
  *) echo "unknown tape: $1" >&2; exit 64 ;;
esac
ls -la "$OUTDIR"/$1.webp
