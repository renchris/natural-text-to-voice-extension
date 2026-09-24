#!/usr/bin/env bash
# Render the promo video's silent title and end cards at 1920x1080 (the 1280x720 templates cws/titlecard.html and
# cws/endcard.html at device scale 1.5), with the same headless renderer and inputs as cws/render.sh, and its
# lower-third captions (cws/caption.html, transparent PNGs the assembler overlays on scenes d, e1 and e2).
# Usage: scripts/capture/video-cards.sh <out-dir>
#   -> <out-dir>/title-1920x1080.png, end-1920x1080.png, cap-d.png, cap-e1.png, cap-e2.png
# Render into a directory no other capture run writes to: promo-assemble.py reads the cards from its takes dir.
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
# Captions: name|text|note. The note on e1 says which port the capture helper used, because a viewer who checks their
# own helper with lsof sees the shipped default instead.
urlenc() { node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$1"; }
while IFS='|' read -r name text note; do
  [ -n "$name" ] || continue
  url="file://$work/caption.html?t=$(urlenc "$text")"; [ -n "$note" ] && url="$url&n=$(urlenc "$note")"
  perl -e 'alarm 60; exec @ARGV' "$CHROME" --user-data-dir="$work/profile" --no-first-run --hide-scrollbars \
    --default-background-color=00000000 --force-device-scale-factor=1.5 --window-size=1280,720 \
    --screenshot="$work/$name.png" "$url" >"$work/$name.log" 2>&1
  magick "$work/$name.png" -strip "PNG32:$out/$name.png"
  got="$(magick identify -format '%wx%h' "$out/$name.png")"
  [[ "$got" == 1920x1080 ]] || { echo "FAIL $name: $got" >&2; exit 1; }
  echo "ok $out/$name.png $got"
done <<'CAPTIONS'
cap-d|Helper not running? A voice built into your Mac reads instead.|The Natural TTS helper was stopped for this scene; this is the macOS system voice.
cap-e1|The Kokoro worker has 0 network sockets. The helper listens on 127.0.0.1 only.|This capture ran the helper on port 8251; the default is 8249.
cap-e2|Still speaking, through that same helper.|
CAPTIONS
