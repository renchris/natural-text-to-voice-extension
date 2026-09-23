#!/usr/bin/env bash
# Compile the capture rig's Swift tools. Usage: scripts/capture/build.sh [out-dir]
# Default out-dir: ${XDG_CACHE_HOME:-~/.cache}/ntts-capture/bin (outside the repo, so nothing to gitignore).
# sckrec needs macOS 15 (SCRecordingOutput); the other tools run on macOS 13+.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
out="${1:-${XDG_CACHE_HOME:-$HOME/.cache}/ntts-capture/bin}"
mkdir -p "$out"
for src in "$here"/*.swift; do
  name="$(basename "$src" .swift)"
  flags=()
  grep -q '^@main' "$src" && flags+=(-parse-as-library)   # async @main needs library parsing
  swiftc -O "${flags[@]+"${flags[@]}"}" -o "$out/$name" "$src"
  echo "built $out/$name"
done
