#!/usr/bin/env bash
# Launch the capture browser for README and store media, in a state that cannot reach the wrong helper.
#
# Usage: [HEADLESS=1] [HOLD_HEALTH=<port>:<ms>] scripts/capture/launch.sh <out-dir> [helper-port=8250] [site-dir]
#
#   HEADLESS=1 runs Chrome with --headless=new (extensions still load). Use it when the console is locked or the
#   display is asleep: nothing then needs the window server, and every capture goes through CDP
#   (Page.captureScreenshot, Page.startScreencast; see shoot.mjs). The native context menu and the anchored
#   popup do not exist in headless mode, so those shots stay in the GUI pass (GUI_PASS.md).
#
#   1. Chrome for Testing 153 (pinned), throwaway profile, the built extension loaded and pinned to the toolbar,
#      light browser colour scheme, 1280x800 window at (40,60), CDP on 9555.
#   2. Occlusion tracking and background throttling are off, so the page keeps painting when another window or
#      the lock screen covers it.
#   3. The extension's stored helper port is seeded to <helper-port>, the voice to af_heart and the speed to 1.0,
#      before anything asks the helper for anything.
#   4. port-guard.mjs is armed in every target: 8249 (where an older helper may be listening) is refused, and
#      https://essays.example/ is served from <site-dir> (default: assets/media/src). HOLD_HEALTH is passed to the
#      guard as --hold-health (status.webp uses 8250:1200 so the popup's real "Checking" pill is visible).
#
# Writes <out-dir>/env.txt (CHROME_PID GUARD_PID WS EXT_ID PROFILE) for the other capture commands and for
# clean-up. Kill only those two pids; never anything else.
set -euo pipefail
OUT=${1:?usage: launch.sh <out-dir> [helper-port] [site-dir]}
PORT=${2:-8250}
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
SITE="$(cd "${3:-$REPO/assets/media/src}" && pwd)"
CFT="$HOME/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
DIST="$(cd "$REPO/chrome-extension/dist" && pwd)"
mkdir -p "$OUT"
MODE_ARGS=(--window-position=40,60)
[ "${HEADLESS:-0}" = 1 ] && MODE_ARGS=(--headless=new)
if lsof -nP -iTCP:9555 -sTCP:LISTEN >/dev/null 2>&1; then echo "port 9555 is in use: close the other capture browser first" >&2; exit 2; fi
EXT_ID=$(node -e 'const h=require("crypto").createHash("sha256").update(process.argv[1]).digest("hex").slice(0,32);console.log([...h].map(c=>String.fromCharCode(97+parseInt(c,16))).join(""))' "$DIST")
PROFILE=$(mktemp -d /tmp/ntts-cft-XXXX)
mkdir -p "$PROFILE/Default"
cat > "$PROFILE/Default/Preferences" <<JSON
{"extensions":{"pinned_extensions":["$EXT_ID"]},
 "browser":{"theme":{"color_scheme":1,"color_scheme2":1},"has_seen_welcome_page":true},
 "translate":{"enabled":false},"credentials_enable_service":false,"autofill":{"profile_enabled":false}}
JSON
nohup "$CFT" --user-data-dir="$PROFILE" --load-extension="$DIST" --test-type=gpu --use-mock-keychain \
  --password-store=basic --no-first-run --no-default-browser-check --hide-crash-restore-bubble \
  --disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-background-timer-throttling \
  --disable-features=CalculateNativeWinOcclusion,MacWebContentsOcclusion,Translate,MediaRouter,OptimizationHints \
  --window-size=1280,800 "${MODE_ARGS[@]}" --remote-debugging-port=9555 about:blank \
  </dev/null >"$OUT/chrome.log" 2>&1 &
CHROME_PID=$!
for _ in $(seq 1 50); do curl -s 127.0.0.1:9555/json/version >/dev/null 2>&1 && break; sleep 0.2; done
WS=$(curl -s 127.0.0.1:9555/json/version | node -pe 'JSON.parse(require("fs").readFileSync(0)).webSocketDebuggerUrl')
HOLD_ARGS=(); [ -n "${HOLD_HEALTH:-}" ] && HOLD_ARGS=(--hold-health "$HOLD_HEALTH")
nohup node "$HERE/port-guard.mjs" "$WS" "$OUT/guard.jsonl" --block 8249 --serve "https://essays.example/=$SITE" ${HOLD_ARGS[@]+"${HOLD_ARGS[@]}"} \
  </dev/null >"$OUT/guard.out" 2>&1 &
GUARD_PID=$!
for _ in $(seq 1 30); do grep -q ready "$OUT/guard.out" 2>/dev/null && break; sleep 0.2; done
for _ in $(seq 1 30); do node "$HERE/cdp.mjs" "$WS" --list | grep -q "^service_worker chrome-extension://$EXT_ID/" && break; sleep 0.3; done
node "$HERE/cdp.mjs" "$WS" "chrome-extension://$EXT_ID/background" \
  "chrome.storage.local.set({selectedVoice:'af_heart',selectedSpeed:1.0,native_tts_helper_config:{port:$PORT,default_voice:'af_heart'}}).then(()=>chrome.storage.local.get(null))"
printf 'CHROME_PID=%s\nGUARD_PID=%s\nWS=%s\nEXT_ID=%s\nPROFILE=%s\n' "$CHROME_PID" "$GUARD_PID" "$WS" "$EXT_ID" "$PROFILE" > "$OUT/env.txt"
cat "$OUT/env.txt"
