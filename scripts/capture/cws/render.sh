#!/usr/bin/env bash
# Render the Chrome Web Store images, the YouTube thumbnail and the GitHub social preview from the HTML templates
# in this directory. Every image embeds a REAL capture of the extension's popup; the frame around it is the design.
#
# Usage: scripts/capture/cws/render.sh [captures-dir=assets/store/src] [out-dir=assets/store] [proof-dir=/tmp/ntts-cws-proofs]
#   <captures-dir> holds the real captures (capture-inputs.sh makes the first two, headless):
#     popup-emma-speaking.png   Emma (UK) at 1.3x, speaking                   shot 2, marquee, thumbnail, social
#     popup-heart-speaking.png  Heart (US) at 1.0x, speaking                  shot 3
#     contextmenu-crop.png      OPTIONAL, GUI pass: the native menu over the article, "Speak selected text"
#                               highlighted. Shot 1 is rendered only when it exists (scripts/capture/GUI_PASS.md).
#   and from assets/media (scripts/capture/README.md, "Headless capture"):
#     popup.png -> popup-connected.png   Connected, Heart, 1.0x               shot 5
#     fallback.png -> popup-fallback.png no helper: system voice + install hint  shot 4 (top 330 CSS px)
#   The icon comes from its vector master, assets/brand/icon.svg (glyph.svg is its glyph without the tile).
#
# Writes <out-dir>/screenshot-{1..5}-*.png (1280x800), small-tile-440x280.png, marquee-1400x560.png,
# youtube-thumbnail-1280x720.png, and assets/brand/social-preview.png (1280x640). Renders headless at the exact
# viewport and DPR 1, drops alpha and metadata, asserts each size, and writes 640x400 legibility proofs of the
# screenshots (the store shows them at that size) plus proof-sheet.png to <proof-dir>. LOOK at the proofs.
#
# CHROME overrides the renderer (default: Playwright's chrome-headless-shell 153, chromium_headless_shell-1243).
# Measured 2026-09-23: CfT 153 `--headless=new --screenshot` hangs on this Mac (CVDisplayLink error, no file
# written); chrome-headless-shell writes the file and exits. Each render is killed after 60 s regardless.
# Fonts: Iowan Old Style and the system font ship with macOS; the mono face is loaded from
# /System/Library/Fonts/SFNSMono.ttf (Menlo if missing). Re-renders on the same machine are byte-identical.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../../.." && pwd)"
caps="$(cd "${1:-$repo/assets/store/src}" && pwd)"
mkdir -p "${2:-$repo/assets/store}" "${3:-/tmp/ntts-cws-proofs}"
out="$(cd "${2:-$repo/assets/store}" && pwd)"; proofs="$(cd "${3:-/tmp/ntts-cws-proofs}" && pwd)"
# Proofs from an earlier run (or another session sharing the default dir) must never reach this run's proof sheet.
rm -f "$proofs"/screenshot-*.proof-640x400.png "$proofs"/youtube-thumbnail.proof-320x180.png "$proofs"/proof-sheet.png
CHROME="${CHROME:-$HOME/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell}"
[[ -x "$CHROME" ]] || { echo "missing browser: $CHROME (set CHROME=...)" >&2; exit 1; }
command -v magick >/dev/null || { echo "missing: magick (brew install imagemagick)" >&2; exit 1; }

work="$(mktemp -d "${TMPDIR:-/tmp}/ntts-cws.XXXXXX")"
profile="$work/profile"
trap 'rm -rf "$work"' EXIT
cp "$here"/*.html "$here"/base.css "$here"/arcs.js "$here"/glyph.svg "$work"/
cp "$repo/assets/brand/icon.svg" "$work/icon.svg"
need() { [[ -f "$1" ]] || { echo "missing capture: $1" >&2; exit 1; }; cp "$1" "$work/$2"; }
need "$caps/popup-emma-speaking.png"  popup-emma-speaking.png
need "$caps/popup-heart-speaking.png" popup-heart-speaking.png
need "$repo/assets/media/popup.png"    popup-connected.png
need "$repo/assets/media/fallback.png" popup-fallback.png
have_menu=0; [[ -f "$caps/contextmenu-crop.png" ]] && { cp "$caps/contextmenu-crop.png" "$work/"; have_menu=1; }

render() { # <template> <w> <h> <output path>
  local tpl="$1" w="$2" h="$3" dst="$4" name; name="$(basename "$4" .png)"
  perl -e 'alarm 60; exec @ARGV' "$CHROME" --user-data-dir="$profile" --no-first-run --hide-scrollbars \
    --force-device-scale-factor=1 --window-size="$w,$h" --screenshot="$work/$name.raw.png" \
    "file://$work/$tpl" >"$work/$name.log" 2>&1 || { echo "FAIL $name: renderer exited $? (log below)" >&2; tail -5 "$work/$name.log" >&2; exit 1; }
  [[ -s "$work/$name.raw.png" ]] || { echo "FAIL $name: no screenshot written" >&2; exit 1; }
  # 24-bit sRGB, no alpha, no metadata chunks, zlib level 9 with adaptive filtering.
  magick "$work/$name.raw.png" -alpha off -colorspace sRGB -strip -define png:color-type=2 -quality 95 "$dst"
  local got; got="$(magick identify -format '%wx%h' "$dst")"
  [[ "$got" == "${w}x${h}" ]] || { echo "FAIL $name: $got, want ${w}x${h}" >&2; exit 1; }
  printf 'ok   %-60s %s %7d B\n' "${dst#"$repo"/}" "$got" "$(stat -f %z "$dst")"
}
shots=()
if [[ $have_menu == 1 ]]; then render shot1.html 1280 800 "$out/screenshot-1-right-click.png"; shots+=("$out/screenshot-1-right-click.png")
else echo "skip screenshot-1-right-click.png: no $caps/contextmenu-crop.png (needs the GUI pass, scripts/capture/GUI_PASS.md)"; fi
render shot2.html   1280 800 "$out/screenshot-2-voices.png";          shots+=("$out/screenshot-2-voices.png")
render shot3.html   1280 800 "$out/screenshot-3-on-device.png";       shots+=("$out/screenshot-3-on-device.png")
render shot4.html   1280 800 "$out/screenshot-4-no-helper.png";       shots+=("$out/screenshot-4-no-helper.png")
render shot5.html   1280 800 "$out/screenshot-5-setup.png";           shots+=("$out/screenshot-5-setup.png")
render tile.html     440 280 "$out/small-tile-440x280.png"
render marquee.html 1400 560 "$out/marquee-1400x560.png"
render thumb.html   1280 720 "$out/youtube-thumbnail-1280x720.png"
render social.html  1280 640 "$repo/assets/brand/social-preview.png"

# Legibility proofs: the store downscales screenshots to 640x400; YouTube lists thumbnails at about 320x180.
for s in "${shots[@]}"; do magick "$s" -resize 640x400 "$proofs/$(basename "$s" .png).proof-640x400.png"; done
magick "$out/youtube-thumbnail-1280x720.png" -resize 320x180 "$proofs/youtube-thumbnail.proof-320x180.png"
magick montage "$proofs"/screenshot-*.proof-640x400.png -tile 2x -geometry +6+6 -background '#c9ccd8' -font /System/Library/Fonts/Helvetica.ttc "$proofs/proof-sheet.png"
echo "proofs: $proofs (LOOK at proof-sheet.png: every headline and the popup text must still read at 640x400)"
