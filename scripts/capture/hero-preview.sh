#!/usr/bin/env bash
# The README hero preview (silent animated WebP): the opening of the hero take up to the popup's speaking state, at
# 20 fps and 960x600, then that last frame held with a "Watch with sound" pill (cws/pill.html) that points at hero.mp4.
#
# Usage: [NEAR_LOSSLESS=40] [KMAX=n] scripts/capture/hero-preview.sh <hero-raw.mov> <first-frame> <last-frame> <hero-seconds> <out.webp> [hold-ms=3000]
#   KMAX forces a key frame at least every n frames: near-lossless inter frames can keep a faint ghost of a window
#   that has closed (the context menu), which a key frame clears.
#   frames are 30 fps frame numbers in the RAW take (the same numbering as the hero cut), so the preview is made from
#   the 2560x1600 recording rather than the CRF-20 1x MP4. The wait between the click and speech is kept as recorded:
#   cutting it would misstate the latency.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
raw=$1; a=$2; b=$3; secs=$4; out=$5; hold=${6:-3000}
CHROME="${CHROME:-$HOME/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell}"
work="$(mktemp -d "${TMPDIR:-/tmp}/ntts-pv.XXXXXX")"; trap 'rm -rf "$work"' EXIT
mkdir -p "$work/f"
ffmpeg -v error -i "$raw" -vf "fps=30,trim=start_frame=$a:end_frame=$b,setpts=PTS-STARTPTS,fps=20,scale=960:600:flags=lanczos" "$work/f/%04d.png"
cp "$here"/cws/pill.html "$here"/cws/base.css "$work"/
perl -e 'alarm 60; exec @ARGV' "$CHROME" --user-data-dir="$work/profile" --no-first-run --hide-scrollbars \
  --default-background-color=00000000 --force-device-scale-factor=1 --window-size=960,600 \
  --screenshot="$work/pill.png" "file://$work/pill.html?s=$secs" >"$work/pill.log" 2>&1
last="$(ls "$work"/f/*.png | tail -1)"
magick "$last" "$work/pill.png" -compose over -composite -alpha off "$work/held.png"
args=(-loop 0 -near_lossless "${NEAR_LOSSLESS:-40}" ${KMAX:+-kmin $((KMAX - 1)) -kmax "$KMAX"})
for f in "$work"/f/*.png; do [ "$f" = "$last" ] || args+=(-d 50 "$f"); done
args+=(-d "$hold" "$work/held.png")
img2webp "${args[@]}" -o "$out"
n=$(ls "$work"/f/*.png | wc -l | tr -d ' ')
echo "$out: $n frames at 20 fps ($(( (n - 1) * 50 )) ms) + ${hold} ms held with the pill; $(stat -f %z "$out") bytes"
