#!/usr/bin/env bash
# Render the promo video's silent title and end cards at 1920x1080 (the 1280x720 templates cws/titlecard.html and
# cws/endcard.html at device scale 1.5), with the same headless renderer and inputs as cws/render.sh.
# Usage: scripts/capture/video-cards.sh <out-dir>   -> <out-dir>/title-1920x1080.png, <out-dir>/end-1920x1080.png
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"; repo="$(cd "$here/../.." && pwd)"
out="${1:?usage: video-cards.sh <out-dir>}"; mkdir -p "$out"; out="$(cd "$out" && pwd)"
CHROME="${CHROME:-$HOME/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell}"
work="$(mktemp -d "${TMPDIR:-/tmp}/ntts-cards.XXXXXX")"; trap 'rm -rf "$work"' EXIT
cp "$here"/cws/*.html "$here"/cws/base.css "$here"/cws/arcs.js "$here"/cws/glyph.svg "$work"/
cp "$repo/assets/brand/icon.svg" "$work/icon.svg"; cp "$repo/assets/store/src/popup-emma-speaking.png" "$work/"
for pair in titlecard.html:title endcard.html:end; do
  tpl=${pair%%:*}; name=${pair##*:}
  perl -e 'alarm 60; exec @ARGV' "$CHROME" --user-data-dir="$work/profile" --no-first-run --hide-scrollbars \
    --force-device-scale-factor=1.5 --window-size=1280,720 --screenshot="$work/$name.png" "file://$work/$tpl" >"$work/$name.log" 2>&1
  magick "$work/$name.png" -alpha off -colorspace sRGB -strip "$out/$name-1920x1080.png"
  got="$(magick identify -format '%wx%h' "$out/$name-1920x1080.png")"
  [[ "$got" == 1920x1080 ]] || { echo "FAIL $name: $got" >&2; exit 1; }
  echo "ok $out/$name-1920x1080.png $got"
done
