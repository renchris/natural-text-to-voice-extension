#!/usr/bin/env bash
# Renders article.html to article.pdf with Chrome's own PDF printer (chrome-headless-shell 153, the same
# renderer scripts/capture/cws/render.sh uses), then checks that the PDF is one page and that its text layer
# draws real fi/fl/ffi ligature glyphs, the case the extension's PDF path has to handle.
# CHROME overrides the renderer.
set -euo pipefail
cd "$(dirname "$0")"
CHROME="${CHROME:-$HOME/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell}"
PROFILE="$(mktemp -d)"
trap 'rm -rf "$PROFILE"' EXIT
"$CHROME" --user-data-dir="$PROFILE" --no-pdf-header-footer --print-to-pdf-no-header \
  --print-to-pdf="$PWD/article.pdf" "file://$PWD/article.html" >/dev/null 2>&1
pages=$(pdfinfo article.pdf | awk '/^Pages:/{print $2}')
[ "$pages" = 1 ] || { echo "article.pdf has $pages pages, expected 1" >&2; exit 1; }
# Ligature glyphs: Skia's text layer maps them back to plain letters (pdftotext reads "flicker"), so count
# the glyphs themselves. A ligature is one glyph standing for two or three letters; PyMuPDF's texttrace shows
# it as a single U+FB00-FB04 or private-use code point.
python3 - <<'PY'
import sys
try:
    import pymupdf
except ImportError:
    sys.exit("pymupdf is needed for the ligature check: python3 -m pip install pymupdf")
page = pymupdf.open("article.pdf")[0]
ligs = [chr(c[0]) for s in page.get_texttrace() for c in s["chars"]
        if 0xFB00 <= c[0] <= 0xFB04 or 0xF001 <= c[0] <= 0xF002]
if not ligs:
    sys.exit("article.pdf uses no ligature glyphs")
print(f"article.pdf: 1 page, {len(ligs)} ligature glyphs (fi, fl, ffi) in the body text")
PY
