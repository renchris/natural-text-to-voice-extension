#!/usr/bin/env bash
# hero-mux.sh <video.mp4> <out.mp4> [clip.wav] [offset-ms]
#
# Puts the hero clip under the hero picture: the recipe of scripts/capture/GUI_PASS.md ("README hero"), as a script.
# The video stream is COPIED from <video.mp4> (the silent hero-video.mp4, or hero.mp4 itself when only the clip
# changes), never re-encoded. The clip's mono samples go on both channels unchanged (pan, not an upmix, which would
# lower it by 3 dB), delayed by the offset measured on the take: 8667 ms (assets/media/PROVENANCE.md), padded with
# silence to the end of the picture. AAC-LC 128 kb/s, 48 kHz stereo, +faststart.
#
# Run it with the clip the committed hero.mp4 was made from and every packet comes out identical to the committed
# file's (checked 2026-09-24), so replacing the clip changes the sound and nothing else.
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
video="$1" out="$2"
wav="${3:-$REPO/assets/media/src/audio/hero.wav}"
ms="${4:-8667}"
[[ "$ms" =~ ^[0-9]+$ ]] || { echo "offset must be whole milliseconds: $ms" >&2; exit 2; }
ffmpeg -v error -y -i "$video" -i "$wav" \
  -filter_complex "[1:a]aresample=48000,pan=stereo|c0=c0|c1=c0,adelay=${ms}|${ms},apad[a]" -map 0:v -map "[a]" -shortest \
  -c:v copy -c:a aac -b:a 128k -ar 48000 -movflags +faststart "$out"
