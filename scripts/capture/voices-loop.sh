#!/usr/bin/env bash
# The README voices loop (silent animated WebP) from the GUI-pass voices take: the anchored popup, its native grouped
# voice list open, the highlight walking to Emma, Emma picked.
#
# Usage: scripts/capture/voices-loop.sh <voices-raw.mov> <from-s> <to-s> <out.webp> [crop=816x1720+69+0] [hold-ms=2000]
#   The crop (raw pixels, 2x) starts 12 CSS px left of the popup and ends just after the Extensions button, so no half
#   profile icon shows. The left edge then fades to the page colour, a frame treatment over the page only, so article
#   words cut by the frame's edge read as a vignette: 24 px beside the popup (the toolbar's colour above the page),
#   and below the popup 150 px while the voice list is closed but only up to the list's own edge while it is open.
#   The popup, the list and every other UI pixel are untouched. Then Lanczos to 720 px wide (embed at width="360"),
#   20 fps constant rate, the last frame held, lossless img2webp -m 6 (~2.9 MB): every stored frame is a source frame
#   pixel for pixel. The earlier -near_lossless 40, even with a key frame every 10 frames, left a ghost of the closed
#   list ("American Female", "Heart", "Bella"…) in the held Emma frame, 21.6% of its pixels off the source.
set -euo pipefail
raw=$1; from=$2; to=$3; out=$4; crop=${5:-816x1720+69+0}; hold=${6:-2000}
work="$(mktemp -d "${TMPDIR:-/tmp}/ntts-voices.XXXXXX")"; trap 'rm -rf "$work"' EXIT
IFS='x+' read -r cw ch cx cy <<<"$crop"
mkdir -p "$work/f"
ffmpeg -v error -i "$raw" -vf "fps=30,trim=start=$from:end=$to,setpts=PTS-STARTPTS,fps=20,crop=$cw:$ch:$cx:$cy" "$work/f/%04d.png"
# plates (alpha 1 at the left edge -> 0): rows above y=88 (the toolbar's bottom at 2x) fade to the toolbar white, rows
# down to POPUP_BOTTOM fade over 24 px (the popup's own edge is 24 px in), rows below it over WIDE px with the list
# closed and NARROW px with it open (the list's shadow starts ~31 px in). The list counts as open when at least 5 of 6
# probes down its left padding (x=LIST_X, never text and never the row highlight) are the list's neutral grey
# (g == b, 215..245) rather than the page's cream (g > b) or a glyph of the article.
POPUP_BOTTOM=${POPUP_BOTTOM:-800}; WIDE=${WIDE:-150}; NARROW=${NARROW:-30}; LIST_X=${LIST_X:-44}
plate() { # <below-width> <out>: RGBA, built as raw bytes (alpha falls linearly from 1 at x=0 to 0 at the width)
  python3 - "$1" "$cw" "$ch" "$POPUP_BOTTOM" <<'PYPLATE' | magick -size "${cw}x${ch}" -depth 8 rgba:- "$2"
import sys
below, w, h, pb = map(int, sys.argv[1:])
out = bytearray()
for y in range(h):
    width, rgb = (24, (255, 255, 255)) if y < 88 else ((24 if y < pb else below), (252, 249, 246))
    row = bytearray()
    for x in range(w):
        a = max(0.0, 1.0 - x / width)
        row += bytes((*rgb, round(255 * a)))
    out += row
sys.stdout.buffer.write(out)
PYPLATE
}
plate "$WIDE" "$work/plate-closed.png"; plate "$NARROW" "$work/plate-open.png"
for f in "$work"/f/*.png; do
  n=0
  for py in 1000 1100 1200 1300 1400 1500; do
    read -r g b <<<"$(magick "$f" -format "%[fx:int(255*p{$LIST_X,$py}.g)] %[fx:int(255*p{$LIST_X,$py}.b)]" info:)"
    [ "$g" = "$b" ] && [ "$g" -ge 215 ] && [ "$g" -le 245 ] && n=$((n + 1))
  done
  pl=closed; [ "$n" -ge 5 ] && pl=open
  echo "$(basename "$f") $pl" >>"$work/lists.txt"
  magick "$f" "$work/plate-$pl.png" -compose over -composite -alpha off -filter Lanczos -resize 720x "$f"
done
echo "list open in $(grep -c ' open' "$work/lists.txt") of $(wc -l <"$work/lists.txt" | tr -d ' ') frames: $(awk '$2=="open"{print $1}' "$work/lists.txt" | sed -n '1p;$p' | tr '\n' ' ')"
last="$(ls "$work"/f/*.png | tail -1)"
args=(-loop 0 -m 6)
for f in "$work"/f/*.png; do [ "$f" = "$last" ] || args+=(-d 50 "$f"); done
args+=(-d "$hold" "$last")
img2webp "${args[@]}" -o "$out" >/dev/null 2>&1
echo "$out: $(ls "$work"/f/*.png | wc -l | tr -d ' ') frames, $(magick identify -format '%wx%h' "$last"), $(stat -f %z "$out") bytes"
