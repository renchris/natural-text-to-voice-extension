#!/usr/bin/env bash
# Regenerate every icon PNG from the SVG masters in this directory.
#
#   assets/brand/render-icons.sh            # render + contact sheet
#   CHROME=/path/to/headless-shell assets/brand/render-icons.sh
#
# Rasterizer: Chrome for Testing's headless shell (Skia). ImageMagick's built-in
# MSVG renderer anti-aliases thin arcs poorly, so it is used only for post-processing
# (metadata strip, contact sheet). PNG ancillary chunks (time, text) are stripped so
# a re-run on the same Chrome build produces byte-identical files.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
ICONS="$ROOT/chrome-extension/public/icons"

find_chrome() {
  if [[ -n "${CHROME:-}" ]]; then echo "$CHROME"; return; fi
  local c
  for c in "$HOME"/Library/Caches/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-mac-arm64/chrome-headless-shell \
           "$HOME"/Library/Caches/ms-playwright/chromium-*/chrome-mac-arm64/"Google Chrome for Testing.app"/Contents/MacOS/"Google Chrome for Testing"; do
    [[ -x "$c" ]] && { echo "$c"; }
  done | sort -V | tail -1
}
CHROME_BIN="$(find_chrome)"
[[ -x "$CHROME_BIN" ]] || { echo "render-icons: no headless Chrome found; set CHROME=" >&2; exit 1; }
command -v magick >/dev/null || { echo "render-icons: ImageMagick 7 (magick) required" >&2; exit 1; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# render <svg> <px> <out.png> — rasterize an SVG at exactly px x px, transparent background.
render() {
  local svg="$1" px="$2" out="$3"
  local page="$TMP/page-$px.html"
  cat >"$page" <<HTML
<!doctype html><html><head><style>
html,body{margin:0;padding:0;background:transparent;overflow:hidden}
img{display:block;width:${px}px;height:${px}px}
</style></head><body><img src="file://$HERE/$svg"></body></html>
HTML
  "$CHROME_BIN" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --default-background-color=00000000 --allow-file-access-from-files \
    --window-size="$px,$px" --screenshot="$TMP/raw.png" "file://$page" >/dev/null 2>&1
  magick "$TMP/raw.png" -strip -define png:exclude-chunks=date,time,tEXt,zTXt,iTXt \
    -define png:color-type=6 "PNG32:$out"
  local got
  got="$(magick identify -format '%wx%h' "$out")"
  [[ "$got" == "${px}x${px}" ]] || { echo "render-icons: $out is $got, expected ${px}x${px}" >&2; exit 1; }
}

render icon-16.svg 16  "$ICONS/icon16.png"
render icon-32.svg 32  "$ICONS/icon32.png"   # 16 px toolbar icon @2x (Retina)
render icon-48.svg 48  "$ICONS/icon48.png"
render icon.svg    128 "$ICONS/icon128.png"
render icon.svg    512 "$HERE/icon-512.png"

# --- verification: sizes, alpha, and the 128's 16 px transparent frame ----------------
for f in "$ICONS"/icon{16,32,48,128}.png "$HERE/icon-512.png"; do
  [[ "$(magick identify -format '%[channels]' "$f")" == srgba* ]] || { echo "render-icons: $f has no alpha" >&2; exit 1; }
done
for strip in 128x16+0+0 128x16+0+112 16x128+0+0 16x128+112+0; do
  a="$(magick "$ICONS/icon128.png" -alpha extract -crop "$strip" +repage -format '%[fx:maxima]' info:)"
  [[ "$a" == "0" ]] || { echo "render-icons: icon128 strip $strip not fully transparent (max alpha $a)" >&2; exit 1; }
done
# ...and the artwork really spans the 96 px box (opaque pixels touch 16 and 111).
bbox="$(magick "$ICONS/icon128.png" -alpha extract -threshold 50% -format '%@' info:)"
[[ "$bbox" == "96x96+16+16" ]] || { echo "render-icons: icon128 artwork bbox $bbox, expected 96x96+16+16" >&2; exit 1; }

# --- contact sheet: every size, 1x and zoomed, on Chrome light + dark toolbar colours --
cell() { # cell <png> <scale> <bg> <out> — icon at integer scale on a padded swatch
  local png="$1" scale="$2" bg="$3" out="$4" w
  w="$(magick identify -format '%w' "$png")"
  local s=$(( w * scale ))
  magick -size "$(( s + 24 ))x$(( s + 24 ))" "xc:$bg" \
    \( "$png" -filter point -resize "${s}x${s}" \) -gravity center -compose over -composite "$out"
}
rows=()
for bg in '#ffffff' '#f1f3f4' '#202124' '#35363a'; do
  n="${bg#\#}"
  cell "$ICONS/icon16.png"  1 "$bg" "$TMP/$n-a.png"
  cell "$ICONS/icon32.png"  1 "$bg" "$TMP/$n-b.png"
  cell "$ICONS/icon48.png"  1 "$bg" "$TMP/$n-c.png"
  cell "$ICONS/icon128.png" 1 "$bg" "$TMP/$n-d.png"
  cell "$ICONS/icon16.png"  8 "$bg" "$TMP/$n-e.png"
  cell "$ICONS/icon32.png"  4 "$bg" "$TMP/$n-f.png"
  cell "$ICONS/icon48.png"  3 "$bg" "$TMP/$n-g.png"
  magick "$TMP/$n-"{a,b,c,d,e,f,g}.png -background "$bg" -gravity center +append "$TMP/row-$n.png"
  rows+=("$TMP/row-$n.png")
done
magick "${rows[@]}" -gravity west -background '#ffffff' -append \
  -strip -define png:exclude-chunks=date,time,tEXt,zTXt,iTXt "$HERE/icon-contact-sheet.png"

echo "render-icons: ok ($CHROME_BIN)"
for f in "$ICONS"/icon{16,32,48,128}.png "$HERE/icon-512.png" "$HERE/icon-contact-sheet.png"; do
  magick identify -format '  %f %wx%h %[channels]\n' "$f"
done
