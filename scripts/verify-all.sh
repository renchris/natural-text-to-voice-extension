#!/usr/bin/env bash
# verify-all.sh — the fail-closed integration gate for the v1.5 upgrade (UPGRADE_RESEARCH.md §6).
#
# Usage: scripts/verify-all.sh [python] [swift] [extension] [consistency] [packaging] [docs]   (no argument = all six)
#
# Every check is an assertion. A missing prerequisite is a FAIL naming the missing path, never a skip.
# Prints a PASS/FAIL table and exits non-zero if any check failed. Logs go to a fresh $TMPDIR/ntts-verify.* dir.
#
# The swift section starts ITS OWN helper and never touches another one:
#   - on VERIFY_PORT (default 18249) via `--port/--python/--worker`; ports 8249-8260 are refused outright;
#   - inside a sandbox-exec profile that DENIES binding any of 8249-8260 and DENIES writes under
#     ~/Library/Application Support/NaturalTTS, so a helper that ignores the flags (or tries to persist the
#     override) fails the gate instead of taking the shared port or rewriting the machine-wide config.json;
#   - it kills only the helper PID it launched and that helper's own worker child, via an EXIT trap.
#
# Env overrides: VERIFY_PORT (18249), VERIFY_NODE_PATH ($HOME/Development/node_modules, playwright-core for
# verify-permissions.cjs), VERIFY_READY_TIMEOUT (180 s), VERIFY_BRITISH_WARM_MAX (0.8 s: first bf_ /speak
# after ready; 0.17 s measured warm, 1.1-2.6 s before the British pipeline was warmed at startup),
# VERIFY_FOOTPRINT_MAX_MB (4500: worker phys_footprint_peak after a ~5,000-character /speak; 3.5-3.6 GB
# measured with the 256 MB MLX cache cap, 7.9 GB without it), VERIFY_E2E (1: run the headless extension E2E).
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HELPER_DIR="$REPO/native-helper"
EXT_DIR="$REPO/chrome-extension"
PORT="${VERIFY_PORT:-18249}"
READY_TIMEOUT="${VERIFY_READY_TIMEOUT:-180}"
NODE_PATH_FOR_PERMS="${VERIFY_NODE_PATH:-$HOME/Development/node_modules}"
EXPECTED_WARNINGS='["Read and change your data on 127.0.0.1"]'
EXPECTED_VOICES=28
EXPECTED_DEFAULT_VOICE=af_heart                       # OD-5, both sides
EXPECTED_NAME='Natural TTS: Private Kokoro Voices for Mac'   # OD-7
EXPECTED_VERSION=1.5.0                                # the release: store zip and privacy policy
MEDIA_MAX_BYTES=$((8 * 1024 * 1024))                  # any committed image, video, audio or PDF
LOOP_MAX_BYTES=$((3 * 1024 * 1024))                   # a README loop: any GIF or animated WebP
BRITISH_WARM_MAX="${VERIFY_BRITISH_WARM_MAX:-0.8}"
FOOTPRINT_MAX_MB="${VERIFY_FOOTPRINT_MAX_MB:-4500}"
RUN_E2E="${VERIFY_E2E:-1}"
CONFIG_DIR="$HOME/Library/Application Support/NaturalTTS"
CONFIG_JSON="$CONFIG_DIR/config.json"

if ! [[ "$PORT" =~ ^[0-9]+$ ]] || (( PORT >= 8249 && PORT <= 8260 )); then
  echo "refusing VERIFY_PORT=$PORT: 8249-8260 belong to the user's helper" >&2
  exit 2
fi

LOGDIR="$(mktemp -d "${TMPDIR:-/tmp}/ntts-verify.XXXXXX")"
VOICES_IDS="$LOGDIR/voices-ids.txt"   # written by the swift section, read by consistency
SECTION=""
R_SEC=(); R_NAME=(); R_STAT=(); R_DETAIL=()

record() { # <status> <name> <detail>
  R_SEC+=("$SECTION"); R_STAT+=("$1"); R_NAME+=("$2"); R_DETAIL+=("${3:-}")
  printf '%-4s  %-11s %-34s %s\n' "$1" "$SECTION" "$2" "${3:-}"
}
pass() { record PASS "$1" "${2:-}"; }
fail() { record FAIL "$1" "${2:-}"; }
# need <path> <check-name>: FAIL "missing: <path>" and return 1 when the path is absent.
need() { [[ -e "$1" ]] && return 0; fail "$2" "missing: ${1#"$REPO"/}"; return 1; }
# logged <name> <cmd...>: run with output in $LOGDIR/<section>-<name>.log; returns the command's status.
logged() { local n="$1"; shift; "$@" >"$LOGDIR/$SECTION-$n.log" 2>&1; }
logtail() { tail -n "${2:-3}" "$LOGDIR/$SECTION-$1.log" 2>/dev/null | tr '\n' ' ' | cut -c1-160; }

# ---------------------------------------------------------------- owned processes
HELPER_PID=""
WORKER_PID=""
SPEAK_PID=""
cleanup() {
  [[ -n "$SPEAK_PID" ]] && kill "$SPEAK_PID" 2>/dev/null || true
  if [[ -n "$HELPER_PID" ]] && kill -0 "$HELPER_PID" 2>/dev/null; then
    kill -TERM "$HELPER_PID" 2>/dev/null || true
    for _ in 1 2 3 4 5 6 7 8 9 10; do kill -0 "$HELPER_PID" 2>/dev/null || break; sleep 0.5; done
    kill -KILL "$HELPER_PID" 2>/dev/null || true
  fi
  # The worker is ours only if it is the pid we recorded as our helper's child and still runs tts_worker.py.
  if [[ -n "$WORKER_PID" ]] && ps -o command= -p "$WORKER_PID" 2>/dev/null | grep -q tts_worker.py; then
    kill -TERM "$WORKER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT
trap 'exit 130' INT TERM

json() { # json <file> <python expression over d>
  python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print(eval(sys.argv[2]))' "$1" "$2"
}
# wavinfo <file>: "<frames> <seconds>" of a WAV, or "0 0" when it is not one.
wavinfo() {
  python3 -c 'import sys,wave; w=wave.open(sys.argv[1]); n=w.getnframes(); print(n, "%.2f" % (n / w.getframerate()))' "$1" 2>/dev/null || echo "0 0"
}
# speak <out> <json-body> [max-time]: POST /speak on our helper; prints "<http code> <seconds>".
speak() {
  curl -s --max-time "${3:-120}" -o "$1" -w '%{http_code} %{time_total}\n' -X POST "http://127.0.0.1:$PORT/speak" \
    -H 'Content-Type: application/json' --data-binary "$2" 2>/dev/null || echo "000 0"
}
# body <text> [voice] [speed]: a /speak JSON body; an empty voice is left out of the body.
body() {
  python3 -c 'import json,sys; b={"text": sys.argv[1]}; sys.argv[2] and b.update(voice=sys.argv[2]); sys.argv[3] and b.update(speed=float(sys.argv[3])); print(json.dumps(b))' "$1" "${2:-}" "${3:-}"
}

# ---------------------------------------------------------------- python
section_python() {
  SECTION=python
  local script="$HELPER_DIR/Scripts/verify-python.sh"
  need "$script" verify-python.sh || return 0
  if logged verify-python bash -c 'cd "$1" && bash Scripts/verify-python.sh' _ "$HELPER_DIR"; then
    pass verify-python.sh "log: $LOGDIR/python-verify-python.log"
  else
    fail verify-python.sh "exit $? — $(logtail verify-python)"
  fi
}

# ---------------------------------------------------------------- swift
section_swift() {
  SECTION=swift
  local py="$HELPER_DIR/Sources/NaturalTTSHelper/Resources/python-env/bin/python3"
  local worker="$HELPER_DIR/Sources/NaturalTTSHelper/Resources/tts_worker.py"
  local base="http://127.0.0.1:$PORT" hlog="$LOGDIR/swift-helper.log"
  local ok=1
  need "$py" python-env || ok=0
  need "$worker" tts_worker.py || ok=0
  if ! logged build bash -c 'cd "$1" && swift build -c release' _ "$HELPER_DIR"; then
    fail "swift build -c release" "$(logtail build)"; return 0
  fi
  pass "swift build -c release"
  local bin; bin="$(cd "$HELPER_DIR" && swift build -c release --show-bin-path)/natural-tts-helper"
  need "$bin" helper-binary || ok=0
  (( ok )) || { fail helper-launch "skipped: prerequisites missing (see above)"; return 0; }

  if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    fail helper-launch "port $PORT already has a listener; the gate will not share or stop it"; return 0
  fi

  # Sandbox: no bind on 8249-8260, no write under the machine-wide NaturalTTS config dir (helper + worker).
  local sb="$LOGDIR/helper.sb" p
  {
    echo '(version 1)'; echo '(allow default)'
    printf '(deny file-write* (subpath "%s"))\n' "$CONFIG_DIR"
    for p in $(seq 8249 8260); do printf '(deny network-bind (local ip "*:%s"))\n' "$p"; done
  } >"$sb"
  local cfg_before="absent"
  [[ -f "$CONFIG_JSON" ]] && cfg_before="$(shasum -a 256 "$CONFIG_JSON" | cut -d' ' -f1)" && cp "$CONFIG_JSON" "$LOGDIR/config.json.before"

  sandbox-exec -f "$sb" "$bin" --port "$PORT" --python "$py" --worker "$worker" >"$hlog" 2>&1 &
  HELPER_PID=$!

  local waited=0 status=""
  while (( waited < READY_TIMEOUT * 2 )); do
    kill -0 "$HELPER_PID" 2>/dev/null || break
    if curl -s --max-time 2 -o "$LOGDIR/health.json" "$base/health" 2>/dev/null; then
      status="$(json "$LOGDIR/health.json" "d.get('status')" 2>/dev/null || true)"
      [[ "$status" == ok ]] && break
    fi
    sleep 0.5; waited=$((waited + 1))
  done
  if [[ "$status" != ok ]]; then
    if kill -0 "$HELPER_PID" 2>/dev/null; then fail helper-ready "no status ok on :$PORT after ${READY_TIMEOUT}s"
    else fail helper-ready "helper exited before ready: $(tail -n 3 "$hlog" | tr '\n' ' ' | cut -c1-160)"; fi
    return 0
  fi
  pass helper-ready "pid $HELPER_PID on :$PORT"

  # Worker = the tts_worker.py process whose parent is OUR helper.
  local wpids; wpids="$(pgrep -P "$HELPER_PID" -f tts_worker.py || true)"
  if [[ -n "$wpids" && "$(echo "$wpids" | wc -l | tr -d ' ')" == 1 ]]; then
    WORKER_PID="$wpids"; pass worker-is-child "worker pid $WORKER_PID, parent $HELPER_PID"
  else
    fail worker-is-child "expected exactly one tts_worker.py child of $HELPER_PID, got: ${wpids:-none}"
  fi

  # /health: ok, apiVersion 2, non-empty version.
  local api ver
  api="$(json "$LOGDIR/health.json" "d.get('apiVersion', d.get('api_version'))" 2>/dev/null || echo ERR)"
  ver="$(json "$LOGDIR/health.json" "d.get('version') or ''" 2>/dev/null || echo "")"
  if [[ "$api" == 2 && -n "$ver" ]]; then pass "/health apiVersion+version" "apiVersion=2 version=$ver"
  else fail "/health apiVersion+version" "apiVersion=$api version=${ver:-<empty>} body=$(head -c 200 "$LOGDIR/health.json")"; fi

  # /voices: exactly 28, ids saved for the consistency section.
  local vcode; vcode="$(curl -s --max-time 5 -o "$LOGDIR/voices.json" -w '%{http_code}' "$base/voices" || echo 000)"
  if [[ "$vcode" == 200 ]] && json "$LOGDIR/voices.json" "'\n'.join(sorted(v['id'] for v in d['voices']))" >"$VOICES_IDS" 2>/dev/null; then
    local n; n="$(grep -c . "$VOICES_IDS" || true)"
    if [[ "$n" == "$EXPECTED_VOICES" ]]; then pass "/voices count" "$n"
    else fail "/voices count" "got $n, want $EXPECTED_VOICES"; fi
  else
    rm -f "$VOICES_IDS"; fail "/voices count" "HTTP $vcode"
  fi

  # The British pipeline is built at startup too, so the FIRST bf_ request after ready does not pay for it.
  # This must stay the first bf_ request of the run.
  local wc wt
  read -r wc wt < <(speak "$LOGDIR/bf-first.wav" "$(body 'Good evening, and welcome.' bf_isabella)" 60)
  if [[ "$wc" == 200 ]] && awk -v t="$wt" -v m="$BRITISH_WARM_MAX" 'BEGIN{exit !(t < m)}'; then
    pass "first bf_ /speak is warm" "${wt}s (< ${BRITISH_WARM_MAX}s)"
  else fail "first bf_ /speak is warm" "HTTP $wc in ${wt}s (want 200 in < ${BRITISH_WARM_MAX}s)"; fi

  # OD-5: a /speak naming no voice speaks af_heart (this helper runs with no config.json, i.e. a new install).
  # Kokoro's durations are a deterministic function of text + voice (only the vocoder's phase noise is
  # random), so the voiceless WAV must have af_heart's frame count, and af_bella's must differ.
  local dtext="Checking the default voice: seven tired painters carry heavy ladders home through the quiet rain."
  local dn dh db
  speak "$LOGDIR/default-none.wav" "$(body "$dtext")" >/dev/null
  speak "$LOGDIR/default-heart.wav" "$(body "$dtext" af_heart)" >/dev/null
  speak "$LOGDIR/default-bella.wav" "$(body "$dtext" af_bella)" >/dev/null
  dn="$(wavinfo "$LOGDIR/default-none.wav" | cut -d' ' -f1)"; dh="$(wavinfo "$LOGDIR/default-heart.wav" | cut -d' ' -f1)"
  db="$(wavinfo "$LOGDIR/default-bella.wav" | cut -d' ' -f1)"
  if [[ "$dn" != 0 && "$dn" == "$dh" && "$dh" != "$db" ]]; then
    pass "/speak default voice == $EXPECTED_DEFAULT_VOICE" "frames: no voice $dn, af_heart $dh, af_bella $db"
  else fail "/speak default voice == $EXPECTED_DEFAULT_VOICE" "frames: no voice $dn, af_heart $dh, af_bella $db"; fi

  # A bad request is the client's fault: 400 with a machine-readable code, never 500.
  local sc ec se ee
  read -r sc _ < <(speak "$LOGDIR/bad-speed.json" "$(body 'Too slow.' af_heart 0.1)" 30)
  read -r ec _ < <(speak "$LOGDIR/empty-text.json" "$(body '' af_heart)" 30)
  se="$(json "$LOGDIR/bad-speed.json" "d.get('error')" 2>/dev/null || echo '?')"
  ee="$(json "$LOGDIR/empty-text.json" "d.get('error')" 2>/dev/null || echo '?')"
  if [[ "$sc" == 400 && "$se" == invalid_speed && "$ec" == 400 && "$ee" == empty_text ]]; then
    pass "bad speed / empty text -> 400" "speed 0.1: 400 $se; text '': 400 $ee"
  else fail "bad speed / empty text -> 400" "speed 0.1: $sc $se; text '': $ec $ee"; fi

  # A ~400-word /speak in flight: /health must answer in < 0.1 s, the worker holds no network connection.
  local sentinel="Quillfeatherverify" text
  text="$(python3 -c "import sys; print(('The quick brown fox jumps over the lazy dog near ' + sys.argv[1] + '. ') * 40)" "$sentinel")"
  python3 -c 'import json,sys; print(json.dumps({"text": sys.argv[1], "voice": "af_bella"}))' "$text" >"$LOGDIR/speak-long.json"
  curl -s --max-time 180 -X POST "$base/speak" -H 'Content-Type: application/json' \
    --data-binary @"$LOGDIR/speak-long.json" -o "$LOGDIR/speak-long.wav" -w '%{http_code}' >"$LOGDIR/speak-long.code" 2>/dev/null &
  SPEAK_PID=$!
  sleep 1
  if kill -0 "$SPEAK_PID" 2>/dev/null; then
    local t; t="$(curl -s --max-time 10 -o /dev/null -w '%{time_total}' "$base/health" || echo 99)"
    if awk -v t="$t" 'BEGIN{exit !(t < 0.1)}'; then pass "/health during /speak" "${t}s"
    else fail "/health during /speak" "${t}s (want < 0.1)"; fi
    if [[ -n "$WORKER_PID" ]] && kill -0 "$WORKER_PID" 2>/dev/null; then
      local est; est="$( (lsof -nP -a -p "$WORKER_PID" -i 2>/dev/null || true) | grep -c ESTABLISHED || true)"
      if [[ "$est" == 0 ]]; then pass "worker offline during /speak" "0 ESTABLISHED"
      else fail "worker offline during /speak" "$est ESTABLISHED connection(s)"; fi
    else
      fail "worker offline during /speak" "no worker pid to inspect"
    fi
  else
    fail "/health during /speak" "the ~400-word /speak finished within 1 s, so nothing was in flight"
    fail "worker offline during /speak" "the ~400-word /speak finished within 1 s, so nothing was in flight"
  fi
  wait "$SPEAK_PID" 2>/dev/null || true; SPEAK_PID=""
  local lcode; lcode="$(cat "$LOGDIR/speak-long.code" 2>/dev/null || echo 000)"
  if [[ "$lcode" == 200 ]]; then pass "long /speak" "HTTP 200, $(wc -c <"$LOGDIR/speak-long.wav" | tr -d ' ') bytes"
  else fail "long /speak" "HTTP $lcode"; fi

  # A /speak whose client goes away (Stop, or a newer selection) is cancelled in the worker at the next
  # chunk, so the next request does not queue behind a synthesis nobody will play.
  python3 -c 'import json,sys; print(json.dumps({"text": sys.argv[1], "voice": "af_bella"}))' "$text" >"$LOGDIR/speak-abandon.json"
  curl -s --max-time 1.5 -o /dev/null -X POST "$base/speak" -H 'Content-Type: application/json' \
    --data-binary @"$LOGDIR/speak-abandon.json" 2>/dev/null || true
  local short_t short_c
  read -r short_c short_t < <(curl -s --max-time 120 -o /dev/null -w '%{http_code} %{time_total}\n' -X POST "$base/speak" \
      -H 'Content-Type: application/json' -d '{"text":"Right after a stop.","voice":"af_bella"}' || echo "000 0") || true
  if [[ "$short_c" == 200 ]] && grep -q 'Request cancelled after\|Request cancelled before' "$hlog"; then
    pass "abandoned /speak cancelled" "worker stopped it; next /speak HTTP 200 in ${short_t}s"
  else fail "abandoned /speak cancelled" "next /speak HTTP $short_c in ${short_t}s; cancel line in log: $(grep -c 'Request cancelled' "$hlog")"; fi

  # Unknown voice -> 400.
  local c
  c="$(curl -s --max-time 30 -o "$LOGDIR/unknown-voice.json" -w '%{http_code}' -X POST "$base/speak" \
      -H 'Content-Type: application/json' -d '{"text":"Hi","voice":"zz_nope"}' || echo 000)"
  if [[ "$c" == 400 ]]; then pass "unknown voice -> 400"; else fail "unknown voice -> 400" "HTTP $c"; fi

  # DNS-rebinding guard: a foreign Host header is refused on the data endpoints.
  c="$(curl -s --max-time 10 -o /dev/null -w '%{http_code}' -H 'Host: evil.example' "$base/voices" || echo 000)"
  if [[ "$c" == 403 ]]; then pass "Host: evil.example /voices -> 403"; else fail "Host: evil.example /voices -> 403" "HTTP $c"; fi
  c="$(curl -s --max-time 30 -o /dev/null -w '%{http_code}' -H 'Host: evil.example' -X POST "$base/speak" \
      -H 'Content-Type: application/json' -d '{"text":"Hi","voice":"af_bella"}' || echo 000)"
  if [[ "$c" == 403 ]]; then pass "Host: evil.example /speak -> 403"; else fail "Host: evil.example /speak -> 403" "HTTP $c"; fi

  # Rejected requests are answered from their head, before any body is read: a foreign Origin or Host
  # with a declared 500 MB body gets its 403 at once (it used to be buffered in full first).
  local early
  early="$(python3 - "$PORT" <<'PY' 2>&1
import socket, sys
port = int(sys.argv[1])
out = []
for host, origin in ((f"127.0.0.1:{port}", "https://evil.example"), ("evil.example", None)):
    s = socket.create_connection(("127.0.0.1", port)); s.settimeout(5)
    head = f"POST /speak HTTP/1.1\r\nHost: {host}\r\nContent-Type: application/json\r\nContent-Length: 500000000\r\n"
    if origin: head += f"Origin: {origin}\r\n"
    s.sendall((head + "\r\n").encode())
    try: out.append(s.recv(64).split(b"\r\n")[0].decode())
    except OSError as e: out.append(f"no answer ({e.__class__.__name__})")
    s.close()
print(" | ".join(out))
PY
)"
  if [[ "$early" == "HTTP/1.1 403 Forbidden | HTTP/1.1 403 Forbidden" ]]; then pass "rejected before the body" "$early"
  else fail "rejected before the body" "$early"; fi

  # Size bounds: 5,000 graphemes of 'e' + 1,100 combining accents (11 MB) used to pass the character
  # check, make the worker exit on its 10 MB frame limit, and kill the helper with SIGPIPE.
  python3 -c 'import json; print(json.dumps({"text": ("e" + "́" * 1100) * 5000}))' >"$LOGDIR/zalgo-11mb.json"
  python3 -c 'import json; print(json.dumps({"text": ("e" + "́" * 100) * 1000}))' >"$LOGDIR/zalgo-200kb.json"
  local big_code mid_code
  big_code="$(curl -s --max-time 30 -o /dev/null -w '%{http_code}' -X POST "$base/speak" -H 'Content-Type: application/json' \
      --data-binary @"$LOGDIR/zalgo-11mb.json" || echo 000)"
  mid_code="$(curl -s --max-time 30 -o /dev/null -w '%{http_code}' -X POST "$base/speak" -H 'Content-Type: application/json' \
      --data-binary @"$LOGDIR/zalgo-200kb.json" || echo 000)"
  c="$(curl -s --max-time 30 -o /dev/null -w '%{http_code}' -X POST "$base/speak" -H 'Content-Type: application/json' \
      -d '{"text":"Still here.","voice":"af_bella"}' || echo 000)"
  if [[ "$big_code" == 413 && "$mid_code" == 400 && "$c" == 200 ]] && kill -0 "$HELPER_PID" 2>/dev/null; then
    pass "oversized text refused, helper up" "11 MB body 413, 200 KB text 400, then /speak 200"
  else fail "oversized text refused, helper up" "11 MB body $big_code, 200 KB text $mid_code, then /speak $c"; fi

  # British voice synthesises a 24 kHz mono 16-bit WAV.
  c="$(curl -s --max-time 60 -o "$LOGDIR/bf_emma.wav" -w '%{http_code}' -X POST "$base/speak" \
      -H 'Content-Type: application/json' -d "{\"text\":\"Good morning from $sentinel in London.\",\"voice\":\"bf_emma\"}" || echo 000)"
  local fmt; fmt="$(python3 -c 'import sys,wave; w=wave.open(sys.argv[1]); print(w.getnchannels(), w.getframerate(), w.getsampwidth(), w.getnframes())' "$LOGDIR/bf_emma.wav" 2>/dev/null || echo "not-a-wav")"
  if [[ "$c" == 200 ]] && awk -v f="$fmt" 'BEGIN{split(f,a," "); exit !(a[1]==1 && a[2]==24000 && a[3]==2 && a[4]>0)}'; then
    pass "bf_emma -> WAV" "channels rate width frames = $fmt"
  else
    fail "bf_emma -> WAV" "HTTP $c, $fmt"
  fi

  # Long tokens. Privacy: one chunk over 510 phonemes made mlx-audio log its whole phoneme string (the
  # number, spelled out), and a 320-digit number once came back as a 500 quoting str(OverflowError).
  # Now a digit run of 16+ is read in groups and a long unbroken token is split, so both are SPOKEN WHOLE:
  # 200 with audio as long as the whole token takes to say (measured 189 s for 320 digits, 91 s for the
  # 600-character URL; a token cut at 510 phonemes says about 40 s).
  local digits="4111411141114111" big url
  big="$(python3 -c 'print("7" * 320)')"
  url="$(python3 -c 'print(("https://docs.example.com/" + "chapter-7/section-42/item-913?view=full&lang=en/" * 13)[:600])')"
  read -r c _ < <(speak /dev/null "$(body "My card number is ${digits}${digits}${digits}${digits} and my PIN is 9876." af_bella)")
  local c2 c3 s2 s3
  read -r c2 _ < <(speak "$LOGDIR/digits-320.wav" "$(body "The modulus is $big and that is all." af_heart)" 180)
  read -r c3 _ < <(speak "$LOGDIR/url-600.wav" "$(body "$url" af_heart)" 180)
  s2="$(wavinfo "$LOGDIR/digits-320.wav" | cut -d' ' -f2)"; s3="$(wavinfo "$LOGDIR/url-600.wav" | cut -d' ' -f2)"
  if [[ "$c" != 200 ]]; then fail "no phonemes/digits in helper log" "64-digit /speak HTTP $c"
  elif grep -qE 'ps ==|len\(ps\)' "$hlog"; then fail "no phonemes/digits in helper log" "phoneme dump in $hlog"
  # Also the worker's grouped form of both numbers (normalize_text reads a 16+ digit run in threes).
  elif grep -qE "$digits|7777777777777777|411 141 114 111|777 777 777 777" "$hlog"; then fail "no phonemes/digits in helper log" "request digits in $hlog"
  else pass "no phonemes/digits in helper log" "64-digit HTTP $c, 320-digit HTTP $c2, URL HTTP $c3"; fi
  if [[ "$c2" == 200 && "$c3" == 200 ]] && awk -v a="$s2" -v b="$s3" 'BEGIN{exit !(a >= 90 && b >= 60)}'; then
    pass "320 digits + 600-char URL spoken" "HTTP 200 ${s2}s (>= 90), HTTP 200 ${s3}s (>= 60)"
  else fail "320 digits + 600-char URL spoken" "digits HTTP $c2 ${s2}s (want >= 90), URL HTTP $c3 ${s3}s (want >= 60)"; fi

  # A 250-word run-on with no punctuation is split for synthesis but spoken at a normal pace
  # (the band verify_worker.py uses; 3.0 words/s measured).
  local runon rc rs
  runon="$(python3 -c 'w = ("the quick brown fox jumps over the lazy dog while seven tired painters carry heavy ladders home").split() * 20; print(" ".join(w[:250]))')"
  read -r rc _ < <(speak "$LOGDIR/run-on.wav" "$(body "$runon" af_heart 1.0)" 180)
  rs="$(wavinfo "$LOGDIR/run-on.wav" | cut -d' ' -f2)"
  if [[ "$rc" == 200 ]] && awk -v s="$rs" 'BEGIN{exit !(s > 0 && 250 / s >= 1.8 && 250 / s <= 4.5)}'; then
    pass "250-word run-on pace" "${rs}s = $(awk -v s="$rs" 'BEGIN{printf "%.2f", 250 / s}') words/s (band 1.8-4.5)"
  else fail "250-word run-on pace" "HTTP $rc, ${rs}s (want 250 words at 1.8-4.5 words/s)"; fi

  # Privacy: the spoken text never reaches the helper's log.
  if grep -q "$sentinel" "$hlog"; then fail "text absent from helper log" "sentinel found in $hlog"
  else pass "text absent from helper log" "$(wc -l <"$hlog" | tr -d ' ') log lines checked"; fi

  # A dead worker is restarted, and the helper does not spin on the closed stderr pipe while it waits.
  # Only OUR worker child is killed; the new child becomes WORKER_PID so cleanup still owns it.
  if [[ -n "$WORKER_PID" ]] && kill -0 "$WORKER_PID" 2>/dev/null; then
    cputime() { ps -o time= -p "$1" 2>/dev/null | awk -F: '{ n = split($0, a, ":"); s = 0; for (i = 1; i <= n; i++) s = s * 60 + a[i]; print s }'; }
    local old="$WORKER_PID" t0 t1 new="" rstatus=""
    kill -KILL "$old"; WORKER_PID=""
    t0="$(cputime "$HELPER_PID")"; sleep 3; t1="$(cputime "$HELPER_PID")"
    if awk -v a="$t0" -v b="$t1" 'BEGIN{exit !(b - a < 1.0)}'; then pass "no spin after worker death" "helper CPU +$(awk -v a="$t0" -v b="$t1" 'BEGIN{printf "%.2f", b - a}')s in 3s"
    else fail "no spin after worker death" "helper CPU +$(awk -v a="$t0" -v b="$t1" 'BEGIN{printf "%.2f", b - a}')s in 3s"; fi
    waited=0
    while (( waited < READY_TIMEOUT * 2 )); do
      rstatus="$(curl -s --max-time 2 "$base/health" 2>/dev/null | python3 -c 'import json,sys; print(json.load(sys.stdin).get("status"))' 2>/dev/null || true)"
      [[ "$rstatus" == ok ]] && break
      sleep 0.5; waited=$((waited + 1))
    done
    new="$(pgrep -P "$HELPER_PID" -f tts_worker.py || true)"
    [[ "$new" =~ ^[0-9]+$ ]] && WORKER_PID="$new"
    c="$(curl -s --max-time 60 -o /dev/null -w '%{http_code}' -X POST "$base/speak" -H 'Content-Type: application/json' \
        -d '{"text":"Back again.","voice":"af_bella"}' || echo 000)"
    if [[ "$rstatus" == ok && -n "$WORKER_PID" && "$WORKER_PID" != "$old" && "$c" == 200 ]]; then
      pass "worker restarted after death" "worker $old -> $WORKER_PID, /speak HTTP $c"
    else fail "worker restarted after death" "status=$rstatus worker=${new:-none} /speak HTTP $c"; fi
  else
    fail "worker restarted after death" "no worker pid of ours to kill"
  fi

  # Memory: the MLX buffer cache is capped, so a ~5,000-character request peaks near the ~3.2 GB active-array
  # floor instead of 7.9 GB. Measured on the (restarted) worker's lifetime peak.
  if [[ -n "$WORKER_PID" ]] && kill -0 "$WORKER_PID" 2>/dev/null; then
    local xtext xc peak
    xtext="$(python3 -c '
s = ("Text to speech has come a long way. The helper runs Kokoro on this Mac, so nothing leaves the machine. "
     "Seven tired painters carry heavy ladders home through the quiet rain, and the quick brown fox naps. "
     "Every paragraph is split into sentences, and every sentence is spoken at an even, natural pace. ")
t = s * 20
print(t[:t.rfind(" ", 0, 4985)])')"
    read -r xc _ < <(speak "$LOGDIR/x5000.wav" "$(body "$xtext" af_heart)" 300)
    peak="$(footprint -j "$LOGDIR/worker-footprint.json" "$WORKER_PID" >/dev/null 2>&1 && python3 -c '
import json, sys
d = json.load(open(sys.argv[1])); pid = int(sys.argv[2])
p = next(p for p in d["processes"] if p["pid"] == pid)
print(p["auxiliary"]["phys_footprint_peak"] * d["bytes per unit"] // 1048576)' "$LOGDIR/worker-footprint.json" "$WORKER_PID" 2>/dev/null || echo '?')"
    if [[ "$xc" == 200 && "$peak" =~ ^[0-9]+$ ]] && (( peak < FOOTPRINT_MAX_MB )); then
      pass "worker peak footprint (5k chars)" "${peak} MB (< $FOOTPRINT_MAX_MB), ${#xtext} chars HTTP $xc"
    else fail "worker peak footprint (5k chars)" "HTTP $xc, peak ${peak} MB (want < $FOOTPRINT_MAX_MB)"; fi
  else
    fail "worker peak footprint (5k chars)" "no worker pid of ours to measure"
  fi

  # The machine-wide config.json is untouched (the sandbox also denies the write).
  local cfg_after="absent"
  [[ -f "$CONFIG_JSON" ]] && cfg_after="$(shasum -a 256 "$CONFIG_JSON" | cut -d' ' -f1)"
  if [[ "$cfg_before" == "$cfg_after" ]]; then pass "config.json untouched"
  else fail "config.json untouched" "changed; pre-run copy at $LOGDIR/config.json.before"; fi

  # SIGTERM (launchd, brew services stop) stops the worker and exits 0 within 3 s. The helper is our own
  # child, so a zombie ('Z') counts as exited; wait then collects its status.
  local hp="$HELPER_PID" wp="$WORKER_PID" t0 gone=0 code worker_left
  t0="$(python3 -c 'import time; print(time.time())')"
  kill -TERM "$hp" 2>/dev/null || true
  for _ in $(seq 1 30); do
    case "$(ps -o stat= -p "$hp" 2>/dev/null | tr -d ' ')" in ''|Z*) gone=1; break ;; esac
    sleep 0.1
  done
  local dt; dt="$(python3 -c 'import sys,time; print("%.2f" % (time.time() - float(sys.argv[1])))' "$t0")"
  if (( gone )); then wait "$hp" 2>/dev/null && code=0 || code=$?; HELPER_PID=""; else code="still running"; fi
  worker_left=none
  [[ -n "$wp" ]] && ps -o command= -p "$wp" 2>/dev/null | grep -q tts_worker.py && worker_left="$wp"
  if (( gone )) && [[ "$code" == 0 && "$worker_left" == none ]]; then
    WORKER_PID=""; pass "SIGTERM: exit 0 < 3 s, worker gone" "exited in ${dt}s, worker $wp gone"
  else fail "SIGTERM: exit 0 < 3 s, worker gone" "after ${dt}s: exit $code, worker left: $worker_left"; fi
}

# ---------------------------------------------------------------- extension
section_extension() {
  SECTION=extension
  need "$EXT_DIR/package.json" package.json || return 0
  local step
  for step in "install --frozen-lockfile" "run type-check"; do
    if logged "${step%% *}" bash -c 'cd "$1" && bun $2' _ "$EXT_DIR" "$step"; then pass "bun $step"
    else fail "bun $step" "$(logtail "${step%% *}")"; fi
  done
  # tests/integration/ talks to a live helper (opt-in via NTTS_LIVE_HELPER_PORT) and, if that port fails, falls
  # back to config.ts discovery over 127.0.0.1:8249-8260, which this gate must never touch;
  # every other test file runs.
  local tests; tests="$(cd "$EXT_DIR" && find tests -name '*.test.ts' -not -path 'tests/integration/*' | sort | sed 's|^|./|' | tr '\n' ' ')"
  if [[ -z "$tests" ]]; then fail "bun test" "no test files found"
  elif logged test bash -c 'cd "$1" && shift && bun test "$@"' _ "$EXT_DIR" $tests; then
    pass "bun test" "$(echo "$tests" | wc -w | tr -d ' ') files (tests/integration/ excluded: live helper, discovery reaches :8249-8260)"
  else fail "bun test" "$(logtail test)"; fi
  if logged build bash -c 'cd "$1" && bun run build' _ "$EXT_DIR"; then pass "bun run build"
  else fail "bun run build" "$(logtail build)"; fi
  if logged audit bash -c 'cd "$1" && bun audit' _ "$EXT_DIR"; then pass "bun audit" "0 vulnerabilities"
  else fail "bun audit" "$(grep -iE 'vulnerabilit' "$LOGDIR/extension-audit.log" | tail -1 | cut -c1-120)"; fi

  local dist="$EXT_DIR/dist"
  need "$dist/manifest.json" "dist/manifest.json" || return 0
  if need "$EXT_DIR/scripts/verify-permissions.cjs" "install warnings"; then
    if logged perms bash -c 'cd "$1" && NODE_PATH="$2" node scripts/verify-permissions.cjs dist' _ "$EXT_DIR" "$NODE_PATH_FOR_PERMS"; then
      # The warnings are the LAST JSON array of strings the script prints (bare, pretty-printed or "dist => [...]").
      local got; got="$(python3 -c '
import json, re, sys
found = []
for m in re.finditer(r"\[[^\[\]]*\]", open(sys.argv[1]).read(), re.S):
    try: v = json.loads(m.group(0))
    except ValueError: continue
    if isinstance(v, list) and all(isinstance(x, str) for x in v): found.append(v)
print(json.dumps(found[-1]) if found else "")' "$LOGDIR/extension-perms.log" 2>/dev/null || true)"
      if python3 -c 'import json,sys; sys.exit(0 if json.loads(sys.argv[1]) == json.loads(sys.argv[2]) else 1)' "${got:-null}" "$EXPECTED_WARNINGS" 2>/dev/null; then
        pass "install warnings" "$got"
      else fail "install warnings" "got ${got:-<no JSON array printed>}, want $EXPECTED_WARNINGS"; fi
    else fail "install warnings" "verify-permissions.cjs exited non-zero: $(logtail perms)"; fi
  fi
  if grep -q '<all_urls>' "$dist/manifest.json"; then fail "no <all_urls> in dist manifest"
  else pass "no <all_urls> in dist manifest"; fi
  # OD-2: the system-voice fallback needs "tts", which adds no install warning (checked above).
  if [[ "$(json "$dist/manifest.json" "'tts' in d.get('permissions', [])" 2>/dev/null)" == True ]]; then
    pass "dist manifest has tts permission"
  else fail "dist manifest has tts permission" "permissions: $(json "$dist/manifest.json" "d.get('permissions')" 2>/dev/null)"; fi
  local mname; mname="$(json "$dist/manifest.json" "d.get('name')" 2>/dev/null || echo '?')"
  if [[ "$mname" == "$EXPECTED_NAME" ]]; then pass "manifest name (OD-7)" "$mname"
  else fail "manifest name (OD-7)" "got '$mname', want '$EXPECTED_NAME'"; fi
  # OD-10: the 128 px icon is 96 px of artwork inside a fully transparent 16 px border.
  if need "$dist/icons/icon128.png" "icon128 96 px art, 16 px clear"; then
    local icon; icon="$(python3 - "$dist/icons/icon128.png" <<'PY' 2>&1
import struct, sys, zlib
raw = open(sys.argv[1], "rb").read()
assert raw[:8] == b"\x89PNG\r\n\x1a\n", "not a PNG"
pos, idat, ihdr = 8, b"", None
while pos < len(raw):
    n, kind = struct.unpack(">I4s", raw[pos:pos + 8]); data = raw[pos + 8:pos + 8 + n]; pos += 12 + n
    if kind == b"IHDR": ihdr = struct.unpack(">IIBBBBB", data)
    elif kind == b"IDAT": idat += data
w, h, depth, ctype, _, _, interlace = ihdr
if (depth, ctype, interlace) != (8, 6, 0):
    sys.exit(f"{w}x{h} depth {depth} colour type {ctype} interlace {interlace}: want 8-bit RGBA, not interlaced")
px, stride, rows, prev = zlib.decompress(idat), w * 4, [], bytearray(w * 4)
for y in range(h):
    f, line = px[y * (stride + 1)], bytearray(px[y * (stride + 1) + 1:(y + 1) * (stride + 1)])
    for i in range(stride):
        a = line[i - 4] if i >= 4 else 0; b = prev[i]; c = prev[i - 4] if i >= 4 else 0
        if f == 1: line[i] = (line[i] + a) & 255
        elif f == 2: line[i] = (line[i] + b) & 255
        elif f == 3: line[i] = (line[i] + (a + b) // 2) & 255
        elif f == 4:
            p = a + b - c; pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
            line[i] = (line[i] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
    rows.append(line); prev = line
alpha = [[r[x * 4 + 3] for x in range(w)] for r in rows]
opaque = [(x, y) for y in range(h) for x in range(w) if alpha[y][x]]
xs = [x for x, _ in opaque]; ys = [y for _, y in opaque]
bbox = (min(xs), min(ys), max(xs), max(ys)) if opaque else None
print(f"{w}x{h} art bbox {bbox}")
sys.exit(0 if (w, h) == (128, 128) and bbox == (16, 16, 111, 111) else 1)
PY
)" && pass "icon128 96 px art, 16 px clear" "$icon" || fail "icon128 96 px art, 16 px clear" "$icon (want 128x128, art bbox (16, 16, 111, 111))"
  fi
  # Headless E2E: the built extension in Chrome for Testing against the mock helper. Every request to
  # 127.0.0.1:8249-8260 is intercepted over CDP, so it never reaches a real helper.
  if [[ "$RUN_E2E" == 1 ]]; then
    if logged e2e bash -c 'cd "$1" && E2E_HEADLESS=1 node tests/e2e/run-e2e.mjs' _ "$EXT_DIR"; then
      pass "e2e (headless)" "$(grep -Eo '[0-9]+/[0-9]+ passed[^)]*' "$LOGDIR/extension-e2e.log" | tail -1)"
    else fail "e2e (headless)" "$(logtail e2e)"; fi
  else
    fail "e2e (headless)" "VERIFY_E2E=$RUN_E2E: skipped, so the gate is not green"
  fi
  local hits
  hits="$(grep -rl --include='*.js' 'console\.log' "$dist" || true)"
  if [[ -z "$hits" ]]; then pass "no console.log in dist"; else fail "no console.log in dist" "$(echo "$hits" | sed "s|$dist/||" | tr '\n' ' ')"; fi
  hits="$(grep -rl 'TestHelpers' "$dist" || true)"
  if [[ -z "$hits" ]]; then pass "no TestHelpers in dist"; else fail "no TestHelpers in dist" "$(echo "$hits" | sed "s|$dist/||" | tr '\n' ' ')"; fi
}

# ---------------------------------------------------------------- consistency
section_consistency() {
  SECTION=consistency
  local vts="$EXT_DIR/src/shared/voices.ts"
  if need "$vts" "voices: helper == extension"; then
    if [[ ! -s "$VOICES_IDS" ]]; then
      fail "voices: helper == extension" "no /voices capture from the swift section in this run"
    else
      local ext_ids="$LOGDIR/voices-ts-ids.txt"
      # Evaluate the module's own VOICE_IDS export rather than pattern-matching its source: the catalogue
      # is built by a helper call (voice('af_heart', …)), so no `id: '…'` literal exists to match.
      ( cd "$EXT_DIR" && bun -e 'import { VOICE_IDS } from "./src/shared/voices.ts"; console.log([...new Set(VOICE_IDS)].sort().join("\n"));' ) \
        >"$ext_ids" 2>"$LOGDIR/consistency-voices-ts.log" || : >"$ext_ids"
      if diff -q "$VOICES_IDS" "$ext_ids" >/dev/null && [[ "$(grep -c . "$ext_ids")" == "$EXPECTED_VOICES" ]]; then
        pass "voices: helper == extension" "$EXPECTED_VOICES ids identical"
      else
        fail "voices: helper == extension" "$(diff "$VOICES_IDS" "$ext_ids" | grep '^[<>]' | tr '\n' ' ' | cut -c1-160) (< helper, > voices.ts; voices.ts has $(grep -c . "$ext_ids") ids)"
      fi
    fi
  fi
  # OD-5 on the extension side: its DEFAULT_VOICE is the helper's default (checked in the swift section).
  local dv; dv="$(cd "$EXT_DIR" && bun -e 'import { DEFAULT_VOICE } from "./src/shared/voices.ts"; console.log(DEFAULT_VOICE);' 2>/dev/null || echo '?')"
  if [[ "$dv" == "$EXPECTED_DEFAULT_VOICE" ]]; then pass "extension DEFAULT_VOICE" "$dv"
  else fail "extension DEFAULT_VOICE" "got $dv, want $EXPECTED_DEFAULT_VOICE"; fi
  local mf="$EXT_DIR/public/manifest.json" pj="$EXT_DIR/package.json"
  if need "$mf" "manifest version == package version" && need "$pj" "manifest version == package version"; then
    local mv pv
    mv="$(json "$mf" "d['version']" 2>/dev/null || echo '?')"; pv="$(json "$pj" "d['version']" 2>/dev/null || echo '?')"
    if [[ "$mv" == "$pv" && "$mv" != '?' ]]; then pass "manifest version == package version" "$mv"
    else fail "manifest version == package version" "manifest $mv, package $pv"; fi
  fi
}

# ---------------------------------------------------------------- packaging
section_packaging() {
  SECTION=packaging
  local formula="$REPO/packaging/homebrew/Formula/natural-tts.rb" publish="$REPO/packaging/homebrew/publish-tap.sh"
  if need "$formula" "formula: ruby -c"; then
    if logged ruby ruby -c "$formula"; then pass "formula: ruby -c" "Syntax OK"
    else fail "formula: ruby -c" "$(logtail ruby)"; fi
    # brew style runs offline (Homebrew's vendored rubocop); a missing brew is a FAIL, not a skip.
    if ! command -v brew >/dev/null 2>&1; then fail "formula: brew style" "brew not on PATH"
    elif logged style env HOMEBREW_NO_AUTO_UPDATE=1 HOMEBREW_NO_ANALYTICS=1 brew style "$formula"; then
      pass "formula: brew style" "$(grep -E 'inspected' "$LOGDIR/packaging-style.log" | tail -1)"
    else fail "formula: brew style" "$(logtail style 4)"; fi
  fi
  if need "$publish" "publish-tap.sh: bash -n"; then
    if logged bashn bash -n "$publish"; then pass "publish-tap.sh: bash -n"
    else fail "publish-tap.sh: bash -n" "$(logtail bashn)"; fi
  fi
}

# ---------------------------------------------------------------- docs
# The README, store and publishing artifacts: diagrams current, store images at their documented sizes, media inside
# their byte budgets, the store zip well-formed, the privacy policy on this version, the old name gone.
section_docs() {
  SECTION=docs
  local out
  # Diagrams: every committed SVG and mermaid fence matches its .mmd (the CI guard, run here too).
  if need "$REPO/package.json" "diagrams:check" && need "$REPO/bun.lock" "diagrams:check"; then
    if logged diagrams-install bash -c 'cd "$1" && bun install --frozen-lockfile' _ "$REPO" \
      && logged diagrams bash -c 'cd "$1" && bun run diagrams:check' _ "$REPO"; then
      pass "diagrams:check" "$(grep -Eo 'all [0-9]+ SVGs.*' "$LOGDIR/docs-diagrams.log" | tail -1)"
    else fail "diagrams:check" "$(logtail diagrams-install 2) $(logtail diagrams 3)"; fi
  fi
  # The performance chart is generated from bench/results.json. A contended run is allowed only because the chart
  # title then says "busy machine" (bench/chart.mjs refuses otherwise).
  if need "$REPO/bench/chart.mjs" "performance chart == bench"; then
    if logged chart node "$REPO/bench/chart.mjs" --check --allow-contended; then
      local clean; clean="$(json "$REPO/bench/results.json" "d.get('clean')" 2>/dev/null || echo '?')"
      if [[ "$clean" == True ]]; then pass "performance chart == bench" "results.json clean=True"
      else pass "performance chart == bench" "results.json clean=$clean; the chart title says busy machine"; fi
    else fail "performance chart == bench" "$(logtail chart)"; fi
  fi
  # Demo audio fixtures: texts verbatim in the article, sha256s as in the manifest (no helper needed).
  if need "$REPO/assets/media/src/make-audio.mjs" "demo audio fixtures"; then
    if logged audio node "$REPO/assets/media/src/make-audio.mjs" --check; then pass "demo audio fixtures" "$(logtail audio 1)"
    else fail "demo audio fixtures" "$(logtail audio)"; fi
  fi
  # Store images: every image under assets/store/ has the exact size its README documents, in sRGB with no alpha;
  # a documented image may be absent only while its row says it is waiting for the GUI pass.
  if need "$REPO/assets/store/README.md" "store images: documented sizes"; then
    if out="$(python3 "$REPO/scripts/verify/store-images.py" "$REPO" 2>&1)"; then pass "store images: documented sizes" "$out"
    else fail "store images: documented sizes" "$(echo "$out" | tail -1 | cut -c1-220)"; fi
  fi
  # Media budgets: a README loop (animated WebP, any GIF) <= 3 MB; any other committed media file <= 8 MB.
  if out="$(python3 "$REPO/scripts/verify/media-budget.py" "$REPO" "$MEDIA_MAX_BYTES" "$LOOP_MAX_BYTES" 2>&1)"; then
    pass "media size budgets" "$out"
  else fail "media size budgets" "$(echo "$out" | tail -1 | cut -c1-220)"; fi
  # Store package: the zip the listing uploads has manifest.json at its root, no "key", and this version.
  if need "$EXT_DIR/scripts/package.mjs" "store zip"; then
    local zip="$EXT_DIR/release/natural-tts-$EXPECTED_VERSION.zip"
    if ! logged package bash -c 'cd "$1" && bun run package' _ "$EXT_DIR"; then fail "store zip" "bun run package failed: $(logtail package)"
    elif [[ ! -f "$zip" ]]; then fail "store zip" "package ran but ${zip#"$REPO"/} is missing"
    elif out="$(python3 "$REPO/scripts/verify/store-zip.py" "$zip" "$EXPECTED_VERSION" 2>&1)"; then pass "store zip" "$out"
    else fail "store zip" "$(echo "$out" | tail -1 | cut -c1-220)"; fi
  fi
  # Privacy policy: states this version.
  if need "$EXT_DIR/PRIVACY.md" "PRIVACY.md version"; then
    if grep -qF "Version $EXPECTED_VERSION" "$EXT_DIR/PRIVACY.md"; then pass "PRIVACY.md version" "Version $EXPECTED_VERSION"
    else fail "PRIVACY.md version" "no 'Version $EXPECTED_VERSION' in chrome-extension/PRIVACY.md"; fi
  fi
  # OD-7: the old product name survives only in history (research, CHANGELOG, the original implementation plan).
  # The pattern is split so this line does not match itself.
  local oldname; oldname="$(git -C "$REPO" grep -n "Natural Text-to""-Speech" -- . ':!docs/research' ':!CHANGELOG.md' \
    ':!chrome-extension/IMPLEMENTATION_PLAN.md' 2>/dev/null | cut -c1-120 | head -3 | tr '\n' ' ' || true)"
  if [[ -z "$oldname" ]]; then pass "no old product name (OD-7)" "tracked files outside history"
  else fail "no old product name (OD-7)" "$oldname"; fi
}

# ---------------------------------------------------------------- main
sections=("$@")
(( ${#sections[@]} )) || sections=(python swift extension consistency packaging docs)
echo "ntts verify-all — repo $REPO @ $(git -C "$REPO" rev-parse --short HEAD 2>/dev/null || echo '?') — logs $LOGDIR"
for s in "${sections[@]}"; do
  case "$s" in
    python) section_python ;; swift) section_swift ;; extension) section_extension ;; consistency) section_consistency ;;
    packaging) section_packaging ;; docs) section_docs ;;
    *) SECTION=args; fail "section '$s'" "unknown (use python|swift|extension|consistency|packaging|docs)" ;;
  esac
done
cleanup; HELPER_PID=""; WORKER_PID=""

echo
printf '%-4s  %-11s %-34s %s\n' RESULT SECTION CHECK DETAIL
printf '%s\n' "------------------------------------------------------------------------------------------------"
if (( ${#R_NAME[@]} == 0 )); then echo "FAIL: no checks ran"; exit 1; fi
nfail=0
for i in "${!R_NAME[@]}"; do
  printf '%-4s  %-11s %-34s %s\n' "${R_STAT[$i]}" "${R_SEC[$i]}" "${R_NAME[$i]}" "${R_DETAIL[$i]}"
  [[ "${R_STAT[$i]}" == PASS ]] || nfail=$((nfail + 1))
done
echo
if (( nfail )); then echo "FAIL: $nfail of ${#R_NAME[@]} checks failed (logs: $LOGDIR)"; exit 1; fi
echo "PASS: all ${#R_NAME[@]} checks (logs: $LOGDIR)"
