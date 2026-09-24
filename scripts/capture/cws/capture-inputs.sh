#!/usr/bin/env bash
# Capture the real popup states the store images embed, headless, through CDP only.
#
# Usage: scripts/capture/cws/capture-inputs.sh <launch-out-dir> <captures-dir> [helper-port=8250]
#   <launch-out-dir> holds env.txt from `HEADLESS=1 scripts/capture/launch.sh <dir> <port>`, and a real helper must
#   be listening on <port> (start it with --port/--python/--worker so config.json is never written).
#
# Writes to <captures-dir>:
#   popup-emma-speaking.png   Emma (bf_emma) at 1.3x, speaking: "Speaking your selection...", "Kokoro · Emma (UK)", Stop
#   popup-heart-speaking.png  Heart (af_heart) at 1.0x, speaking
#   voice-groups.json         the live popup's <optgroup> labels and voices (the counts shot 2 prints)
#
# How the speaking state is made: the service worker creates its offscreen document and sends it the same
# SPEAK_IN_OFFSCREEN message the right-click handler sends (voice, speed, port), with the demo article's paragraph 2
# (assets/media/src/selections.json "hero"). The offscreen document fetches real audio from the helper's /speak and
# plays it; the popup, opened while it plays, asks the offscreen document for its state and shows it. Only the
# native menu click is skipped (it needs a display). Nothing is mocked.
set -euo pipefail
LOUT=${1:?usage: capture-inputs.sh <launch-out-dir> <captures-dir> [port]}; CAPS=${2:?}; PORT=${3:-8250}
HERE="$(cd "$(dirname "$0")/.." && pwd)"; REPO="$(cd "$HERE/../.." && pwd)"
# shellcheck disable=SC1091
source "$LOUT/env.txt"; mkdir -p "$CAPS"; CAPS="$(cd "$CAPS" && pwd)"   # absolute: node require()s voice-groups.json
curl -sf "127.0.0.1:$PORT/health" | grep -q '"status":"ok"' || { echo "no healthy helper on $PORT" >&2; exit 1; }
SW="chrome-extension://$EXT_ID/background"; P="chrome-extension://$EXT_ID/popup/popup.html"; ID='document.getElementById'
TXT=$(node -pe 'JSON.stringify(require(process.argv[1]).selections.find(s=>s.id==="hero").text)' "$REPO/assets/media/src/selections.json")

speaking() { # <file> <voice> <speed>
  node "$HERE/cdp.mjs" "$WS" "$SW" "chrome.runtime.sendMessage({type:'STOP_IN_OFFSCREEN'}).catch(()=>0).then(()=>chrome.storage.local.set({selectedVoice:'$2',selectedSpeed:$3})).then(()=>1)" >/dev/null
  sleep 0.5
  node "$HERE/cdp.mjs" "$WS" "$SW" "(async()=>{const ex=await chrome.runtime.getContexts({contextTypes:['OFFSCREEN_DOCUMENT']});
    if(!ex.length){await chrome.offscreen.createDocument({url:'offscreen/offscreen.html',reasons:['AUDIO_PLAYBACK','BLOBS'],justification:'Plays audio from the local helper'});await new Promise(r=>setTimeout(r,500));}
    return JSON.stringify(await chrome.runtime.sendMessage({type:'SPEAK_IN_OFFSCREEN',text:$TXT,voice:'$2',speed:$3,port:$PORT}));})()" &
  local sp=$!; sleep 0.3
  node "$HERE/shoot.mjs" "$WS" "$P" --png "$CAPS/$1" --fit --settle 400 \
    --wait-for "$ID('statusLabel').textContent==='Connected' && $ID('voiceSelect').value==='$2' && /Stop/.test($ID('speakButton').textContent)"
  wait "$sp"
}
speaking popup-emma-speaking.png bf_emma 1.3
speaking popup-heart-speaking.png af_heart 1.0
node "$HERE/cdp.mjs" "$WS" "$SW" "chrome.runtime.sendMessage({type:'STOP_IN_OFFSCREEN'}).catch(()=>0).then(()=>chrome.storage.local.set({selectedVoice:'af_heart',selectedSpeed:1.0})).then(()=>1)" >/dev/null

# The grouped voice list, read from a real popup tab.
node "$HERE/cdp-browser.mjs" "$WS" Target.createTarget "{\"url\":\"$P\"}" >/dev/null; sleep 3
node "$HERE/cdp.mjs" "$WS" "popup/popup.html" "JSON.stringify([...document.querySelectorAll('#voiceSelect optgroup')].map(g=>({label:g.label,voices:[...g.querySelectorAll('option')].map(o=>o.value)})),null,1)" \
  | node -e 'const s=JSON.parse(require("fs").readFileSync(0,"utf8").trim());console.log(s)' > "$CAPS/voice-groups.json"
node "$HERE/cdp.mjs" "$WS" "popup/popup.html" "window.close();1" >/dev/null || true
node -e 'const g=require(process.argv[1]);console.log(g.map(x=>x.label+" "+x.voices.length).join(", "),"=",g.reduce((a,x)=>a+x.voices.length,0))' "$CAPS/voice-groups.json"
magick identify "$CAPS"/popup-*-speaking.png
