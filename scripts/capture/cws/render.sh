#!/usr/bin/env bash
# Render the Chrome Web Store promo images from the HTML templates in this directory.
#
# Usage: scripts/capture/cws/render.sh <captures-dir> <out-dir>
#   <captures-dir> must hold the real captures the templates embed:
#     window.png               browser window with the anchored "Connected" popup  (shot1)
#     contextmenu-crop.png     native menu with "Speak selected text" highlighted  (shot2)
#     popup-anchored-crop.png  the anchored popup, cropped at >= 1:1 CSS scale     (marquee)
#   Writes <out-dir>/{cws-shot1-1280x800,cws-shot2-1280x800,cws-tile-440x280,cws-marquee-1400x560}.png
#
# Renders headless at the exact viewport and DPR 1, strips alpha and metadata, then asserts each size.
# CHROME overrides the renderer (default: Playwright's chrome-headless-shell 153, chromium_headless_shell-1243).
# Measured 2026-09-23: CfT 153 `--headless=new --screenshot` hangs on this Mac (CVDisplayLink error, no file
# written); chrome-headless-shell writes the file and exits. Each render is killed after 60 s regardless.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
[[ $# -eq 2 ]] || { echo "usage: $0 <captures-dir> <out-dir>" >&2; exit 64; }
caps="$(cd "$1" && pwd)"; mkdir -p "$2"; out="$(cd "$2" && pwd)"
CHROME="${CHROME:-$HOME/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell}"
[[ -x "$CHROME" ]] || { echo "missing browser: $CHROME (set CHROME=...)" >&2; exit 1; }
command -v magick >/dev/null || { echo "missing: magick (brew install imagemagick)" >&2; exit 1; }

work="$(mktemp -d "${TMPDIR:-/tmp}/ntts-cws.XXXXXX")"
profile="$work/profile"
trap 'rm -rf "$work"' EXIT
cp "$here"/*.html "$here"/base.css "$work"/
for f in window.png contextmenu-crop.png popup-anchored-crop.png; do
  [[ -f "$caps/$f" ]] || { echo "missing capture: $caps/$f" >&2; exit 1; }
  cp "$caps/$f" "$work/"
done

render() { # <template> <w> <h> <name>
  local tpl="$1" w="$2" h="$3" name="$4"
  perl -e 'alarm 60; exec @ARGV' "$CHROME" --user-data-dir="$profile" --no-first-run --hide-scrollbars \
    --force-device-scale-factor=1 --window-size="$w,$h" --screenshot="$work/$name.raw.png" \
    "file://$work/$tpl" >"$work/$name.log" 2>&1 || { echo "FAIL $name: renderer exited $? (log below)" >&2; tail -5 "$work/$name.log" >&2; exit 1; }
  [[ -s "$work/$name.raw.png" ]] || { echo "FAIL $name: no screenshot written" >&2; exit 1; }
  magick "$work/$name.raw.png" -alpha off -strip "$out/$name.png"
  local got; got="$(magick identify -format '%wx%h' "$out/$name.png")"
  [[ "$got" == "${w}x${h}" ]] || { echo "FAIL $name: $got, want ${w}x${h}" >&2; exit 1; }
  echo "ok   $out/$name.png ($got)"
}
render shot1.html   1280 800 cws-shot1-1280x800
render shot2.html   1280 800 cws-shot2-1280x800
render tile.html     440 280 cws-tile-440x280
render marquee.html 1400 560 cws-marquee-1400x560
# Legibility proof: the store downscales screenshots to 640x400.
for s in cws-shot1-1280x800 cws-shot2-1280x800; do magick "$out/$s.png" -resize 640x400 "$out/$s.proof-640x400.png"; done
echo "proofs: $out/*.proof-640x400.png (check text is still legible)"
