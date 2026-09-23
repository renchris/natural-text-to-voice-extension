#!/bin/bash
# Fail-closed gate for the helper's Python side (the H-PY half of the W1 gate, UPGRADE_RESEARCH.md §6).
#
# Every check is an assertion (test / python assert / JSON parsed, never grep-for-a-phrase). All checks
# run so one pass reports every red; the script exits non-zero if ANY check failed or could not run.
#
#   1 lock      uv lock --check (pyproject.toml and uv.lock agree)
#   2 no-torch  uv.lock resolves no torch
#   3 imports   Python 3.12, mlx 0.32.2, mlx-audio 0.5.5, en_core_web_sm installed, no torch
#   4 worker    Scripts/verify_worker.py      (3 OK WAVs, empty_text + invalid_speed, clean stdout)
#   5 probe     Scripts/kokoro_probe.py       (ok == 30, any_nan false, max_peak <= 0.98)
#   6 g2p       Scripts/verify_g2p.py         (normalize_text + misaki rows)
#   7 fidelity  Scripts/ref_compare.py        (|level| <= NTTS_MAX_LEVEL_DB, log-mel L1 <= NTTS_MAX_L1)
#
# Checks 4, 6 and 7 run the shipped tts_worker.py, so they guard IN-03 (worker hardening) and IN-04
# (typographic punctuation) against regression; all 7 are green from IN-04 on. Thresholds for 7 are
# parameters (defaults 0.5 dB / 0.13, calibrated
# against the R01 reference method: noise floor 0.049, mlx-audio 0.5.5 = 0.115, 0.2.6 = 0.428).
#
# Usage (any cwd):  native-helper/Scripts/verify-python.sh
# Env:  NTTS_PY=<python3>  NTTS_WORKER=<tts_worker.py>  NTTS_MAX_LEVEL_DB=0.5  NTTS_MAX_L1=0.13

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"
E="${NTTS_PY:-$ROOT/Sources/NaturalTTSHelper/Resources/python-env/bin/python3}"
WORKER="${NTTS_WORKER:-$ROOT/Sources/NaturalTTSHelper/Resources/tts_worker.py}"
MAX_LEVEL_DB="${NTTS_MAX_LEVEL_DB:-0.5}"
MAX_L1="${NTTS_MAX_L1:-0.13}"
# The helper gives the worker Homebrew espeak-ng data (PythonWorker.swift); run every check the same way.
export ESPEAK_DATA_PATH="${ESPEAK_DATA_PATH:-/opt/homebrew/opt/espeak-ng/share/espeak-ng-data}"
export HF_HUB_OFFLINE=1

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

PASSED=()
FAILED=()
check() {  # check <name> <command...>: record, never abort the run
    local name="$1"; shift
    echo "=== [$name] $*"
    if "$@"; then
        PASSED+=("$name")
        echo "--- [$name] PASS"
    else
        local rc=$?
        FAILED+=("$name")
        echo "--- [$name] FAIL (exit $rc)"
    fi
}

lock_check()  { (cd "$ROOT/python" && uv lock --check); }
no_torch()    { test -f "$ROOT/python/uv.lock" && ! grep -q '^name = "torch"$' "$ROOT/python/uv.lock"; }
imports() {
    test -x "$E" && "$E" - <<'EOF'
import importlib.metadata as m
import sys

import mlx.core as mx
import spacy

assert sys.version_info[:2] == (3, 12), sys.version
assert mx.__version__ == "0.32.2", mx.__version__
assert m.version("mlx-audio") == "0.5.5", m.version("mlx-audio")
assert spacy.util.is_package("en_core_web_sm"), "en_core_web_sm missing"
try:
    m.version("torch")
    raise AssertionError("torch is installed")
except m.PackageNotFoundError:
    pass
print(mx.__version__, m.version("mlx-audio"))
EOF
}
worker() { "$E" "$SCRIPT_DIR/verify_worker.py" "$E" "$WORKER"; }
probe() {
    "$E" "$SCRIPT_DIR/kokoro_probe.py" >"$TMP/probe.json" 2>"$TMP/probe.err" || { tail -5 "$TMP/probe.err"; return 1; }
    "$E" - "$TMP/probe.json" <<'EOF'
import json, sys
d = json.load(open(sys.argv[1]))
assert "fatal" not in d, d.get("fatal")
s = d["summary"]
print(json.dumps(s), "speed_ratio_0.5_over_2.0 =", d.get("speed_ratio_0.5_over_2.0"))
assert s["total"] == 30 and s["ok"] == 30, f"ok={s['ok']}/{s['total']}"
assert s["any_nan"] is False, "NaN audio"
assert s["max_peak"] is not None and s["max_peak"] <= 0.98, f"max_peak={s['max_peak']}"
EOF
}
g2p() { "$E" "$SCRIPT_DIR/verify_g2p.py" "$WORKER"; }
fidelity() {
    "$E" "$SCRIPT_DIR/ref_compare.py" --python "$E" --worker "$WORKER" \
        --max-level-db "$MAX_LEVEL_DB" --max-l1 "$MAX_L1" >"$TMP/ref.json" 2>"$TMP/ref.err" || true
    "$E" - "$TMP/ref.json" "$MAX_LEVEL_DB" "$MAX_L1" <<'EOF'
import json, sys
d = json.load(open(sys.argv[1]))
lvl, l1 = float(sys.argv[2]), float(sys.argv[3])
c, f = d["candidate"], d["noise_floor"]
print(f"level_vs_ref_db={c['level_vs_ref_db']} logmel_l1={c['logmel_l1']} noise_floor={f['logmel_l1']} "
      f"(gate: |level|<={lvl}, l1<={l1})")
assert abs(c["level_vs_ref_db"]) <= lvl, f"level {c['level_vs_ref_db']} dB outside +/-{lvl}"
assert c["logmel_l1"] <= l1, f"logmel_l1 {c['logmel_l1']} > {l1}"
assert f["logmel_l1"] < l1, "reference noise floor is not below the threshold"
assert d["ok"] is True, d["failures"]
EOF
}

check lock lock_check
check no-torch no_torch
check imports imports
check worker worker
check probe probe
check g2p g2p
check fidelity fidelity

echo
echo "verify-python: PASS ${#PASSED[@]} [${PASSED[*]:-}]  FAIL ${#FAILED[@]} [${FAILED[*]:-}]"
test "${#FAILED[@]}" -eq 0
