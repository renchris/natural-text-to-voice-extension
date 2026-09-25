#!/usr/bin/env bash
# Measure how chrome.tts `volume` changes the level of a macOS system voice, through Chrome's live audio path.
#
#   scripts/capture/tts-volume.sh [voice]        (default Samantha; no prompts; safe to re-run)
#
# Chrome for Testing 153 (the rig's pinned build) with its own throwaway profile and only the probe extension in
# scripts/capture/tts-volume/, on a free CDP port in 9300-9399. sckrec records Chrome's audio (a display filter that
# excludes every other app, so Chrome's audio service is kept) while the probe speaks one sentence at volume 1.0,
# 0.8, 0.6 and 1.0 again (the drift control). tts-volume/measure.py splits the takes on silence and prints each one's
# ebur128 loudness against the first and a VERDICT line for 0.8. The extension's SYSTEM_VOICE_VOLUME
# (chrome-extension/src/shared/system-voice.ts) assumes macOS's -24 dB per unit of volume, measured offline in
# docs/research/2026-09-upgrade/limiter-decision/B-fallback-volume.md: 0.8 should read about -4.8 dB.
#
# Needs: Screen Recording permission for this terminal, the Swift tools (scripts/capture/build.sh), ffmpeg, node.
# Changes no system setting, and stops only the Chrome it started. Writes to a fresh $TMPDIR/ntts-tts-volume.* dir.
# Exit: 0 measured (read the VERDICT) · 1 failed · 3 macOS audio output is stalled, so nothing can be measured.
set -euo pipefail

VOICE="${1:-Samantha}"
HERE="$(cd "$(dirname "$0")" && pwd)"
BIN="${XDG_CACHE_HOME:-$HOME/.cache}/ntts-capture/bin"
CFT="$HOME/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
SENTENCE="Select any passage on a web page and press play. The extension sends the text to a small helper running on your own computer."
OUT="$(mktemp -d "${TMPDIR:-/tmp}/ntts-tts-volume.XXXXXX")"
die() { echo "tts-volume: FAIL: $*" >&2; exit 1; }

[ -x "$CFT" ] || die "Chrome for Testing 153 not found at $CFT"
[ -x "$BIN/sckrec" ] || bash "$HERE/build.sh" "$BIN" >/dev/null || die "could not build the Swift tools into $BIN"

# 1. A 0.3 s near-silent tone must finish playing within 4 s, or live speech stalls too (seen 2026-09-24:
#    coreaudiod at ~110% CPU holding hundreds of audio-out assertions; a restart of coreaudiod or a reboot clears it).
ffmpeg -hide_banner -loglevel error -y -f lavfi -i "sine=f=440:d=0.3" -af volume=-50dB "$OUT/preflight.wav"
if ! timeout 4 afplay "$OUT/preflight.wav"; then
  echo "tts-volume: BLOCKED: macOS audio output is stalled (afplay of a 0.3 s file did not finish in 4 s)."
  echo "  coreaudiod CPU $(ps -o %cpu= -p "$(pgrep -x coreaudiod)" | tr -d ' ')%, $(pmset -g assertions | grep -c 'audio-out') audio-out assertions."
  echo "  'sudo killall coreaudiod' (macOS restarts it) or a reboot clears it; then run this again."
  exit 3
fi

# 2. Our own Chrome, the probe extension only.
PORT=""
for p in $(seq 9300 9399); do lsof -nP -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1 || { PORT=$p; break; }; done
[ -n "$PORT" ] || die "no free port in 9300-9399"
"$CFT" --user-data-dir="$OUT/profile" --load-extension="$HERE/tts-volume" --disable-extensions-except="$HERE/tts-volume" \
  --test-type=gpu --use-mock-keychain --password-store=basic --no-first-run --no-default-browser-check \
  --hide-crash-restore-bubble --window-position=40,60 --window-size=500,400 --remote-debugging-port="$PORT" \
  about:blank </dev/null >"$OUT/chrome.log" 2>&1 &
CHROME_PID=$!
# A Chrome whose speech is stuck in a stalled audio service can ignore SIGTERM: escalate.
stop_chrome() {
  kill "$CHROME_PID" 2>/dev/null || return 0
  for _ in 1 2 3 4 5 6; do kill -0 "$CHROME_PID" 2>/dev/null || return 0; sleep 0.5; done
  pkill -9 -f -- "--user-data-dir=$OUT/profile" 2>/dev/null || true
}
trap stop_chrome EXIT
WS=""
for _ in $(seq 1 40); do
  WS="$(curl -sf "127.0.0.1:$PORT/json/version" | sed -n 's/.*"webSocketDebuggerUrl": "\(.*\)".*/\1/p' || true)"
  [ -n "$WS" ] && break; sleep 0.5
done
[ -n "$WS" ] || die "Chrome did not open CDP on $PORT ($OUT/chrome.log)"
# An unpacked extension's id is the sha256 of its path, the first 32 hex digits mapped 0-f -> a-p.
EXT="$(python3 -c 'import hashlib,sys; print("".join(chr(97 + int(c, 16)) for c in hashlib.sha256(sys.argv[1].encode()).hexdigest()[:32]))' "$HERE/tts-volume")"
node "$HERE/cdp-browser.mjs" "$WS" Target.createTarget "{\"url\":\"chrome-extension://$EXT/probe.html\"}" >/dev/null
sleep 1.5
voices="$(node "$HERE/cdp.mjs" "$WS" probe.html 'voices()')"
grep -q "\"$VOICE|en" <<< "$(tr ',' '\n' <<< "$voices")" || die "chrome.tts does not offer $VOICE (en-*) on this Mac"

# 3. Record while speaking at 1.0, 0.8, 0.6, 1.0.
"$BIN/sckrec" "$CHROME_PID" 60 "$OUT/capture.mov" 40 60 400 300 --exclude-others --no-cursor --any-space \
  >"$OUT/sckrec.log" 2>&1 &
REC_PID=$!
sleep 2.5
text_json="$(python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$SENTENCE")"
node "$HERE/cdp.mjs" "$WS" probe.html "(async () => { const out = []; for (const v of [1, 0.8, 0.6, 1]) {
  out.push(await Promise.race([speakAt($text_json, '$VOICE', v), new Promise(r => setTimeout(() => r({ volume: v, event: 'timeout' }), 25000))]));
  await new Promise(r => setTimeout(r, 1500)); } return out; })()" | tee "$OUT/events.json"
wait "$REC_PID" || die "sckrec failed ($OUT/sckrec.log)"
grep -q '"timeout"' "$OUT/events.json" && die "an utterance never ended ($OUT/events.json): audio is stalling"

# 4. Measure.
ffmpeg -hide_banner -loglevel error -y -i "$OUT/capture.mov" -vn -map 0:a:0 -ac 1 -ar 48000 -c:a pcm_f32le "$OUT/capture.wav"
python3 "$HERE/tts-volume/measure.py" "$OUT/capture.wav" 1.0 0.8 0.6 1.0 | tee "$OUT/result.md"
echo "tts-volume: recording and results in $OUT"
