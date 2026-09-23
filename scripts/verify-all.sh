#!/usr/bin/env bash
# verify-all.sh — the fail-closed integration gate for the v1.5 upgrade (UPGRADE_RESEARCH.md §6).
#
# Usage: scripts/verify-all.sh [python] [swift] [extension] [consistency]     (no argument = all four)
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
# verify-permissions.cjs), VERIFY_READY_TIMEOUT (180 s).
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HELPER_DIR="$REPO/native-helper"
EXT_DIR="$REPO/chrome-extension"
PORT="${VERIFY_PORT:-18249}"
READY_TIMEOUT="${VERIFY_READY_TIMEOUT:-180}"
NODE_PATH_FOR_PERMS="${VERIFY_NODE_PATH:-$HOME/Development/node_modules}"
EXPECTED_WARNINGS='["Read and change your data on 127.0.0.1"]'
EXPECTED_VOICES=28
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

  # British voice synthesises a 24 kHz mono 16-bit WAV.
  c="$(curl -s --max-time 60 -o "$LOGDIR/bf_emma.wav" -w '%{http_code}' -X POST "$base/speak" \
      -H 'Content-Type: application/json' -d "{\"text\":\"Good morning from $sentinel in London.\",\"voice\":\"bf_emma\"}" || echo 000)"
  local fmt; fmt="$(python3 -c 'import sys,wave; w=wave.open(sys.argv[1]); print(w.getnchannels(), w.getframerate(), w.getsampwidth(), w.getnframes())' "$LOGDIR/bf_emma.wav" 2>/dev/null || echo "not-a-wav")"
  if [[ "$c" == 200 ]] && awk -v f="$fmt" 'BEGIN{split(f,a," "); exit !(a[1]==1 && a[2]==24000 && a[3]==2 && a[4]>0)}'; then
    pass "bf_emma -> WAV" "channels rate width frames = $fmt"
  else
    fail "bf_emma -> WAV" "HTTP $c, $fmt"
  fi

  # Privacy: the spoken text never reaches the helper's log.
  if grep -q "$sentinel" "$hlog"; then fail "text absent from helper log" "sentinel found in $hlog"
  else pass "text absent from helper log" "$(wc -l <"$hlog" | tr -d ' ') log lines checked"; fi

  # The machine-wide config.json is untouched (the sandbox also denies the write).
  local cfg_after="absent"
  [[ -f "$CONFIG_JSON" ]] && cfg_after="$(shasum -a 256 "$CONFIG_JSON" | cut -d' ' -f1)"
  if [[ "$cfg_before" == "$cfg_after" ]]; then pass "config.json untouched"
  else fail "config.json untouched" "changed; pre-run copy at $LOGDIR/config.json.before"; fi
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
  local mf="$EXT_DIR/public/manifest.json" pj="$EXT_DIR/package.json"
  if need "$mf" "manifest version == package version" && need "$pj" "manifest version == package version"; then
    local mv pv
    mv="$(json "$mf" "d['version']" 2>/dev/null || echo '?')"; pv="$(json "$pj" "d['version']" 2>/dev/null || echo '?')"
    if [[ "$mv" == "$pv" && "$mv" != '?' ]]; then pass "manifest version == package version" "$mv"
    else fail "manifest version == package version" "manifest $mv, package $pv"; fi
  fi
}

# ---------------------------------------------------------------- main
sections=("$@")
(( ${#sections[@]} )) || sections=(python swift extension consistency)
echo "ntts verify-all — repo $REPO @ $(git -C "$REPO" rev-parse --short HEAD 2>/dev/null || echo '?') — logs $LOGDIR"
for s in "${sections[@]}"; do
  case "$s" in
    python) section_python ;; swift) section_swift ;; extension) section_extension ;; consistency) section_consistency ;;
    *) SECTION=args; fail "section '$s'" "unknown (use python|swift|extension|consistency)" ;;
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
