# Sourced (hidden) at the start of every tape. Gives the recording a neutral shell: no username, no home path.
#
#   TAPE_PYTHON  a Python 3.12 venv with mlx-audio 0.5.5 (default: the main checkout's python-env, which a
#                worktree does not have). Its DIRECTORY is symlinked, not the interpreter, so the venv still resolves.
#
# Everything the helper prints (its --python and --worker paths included) then reads /tmp/natural-tts/..., and
# the helper runs with environment overrides, so it never reads or writes the shared config.json.
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
VENV="${TAPE_PYTHON_ENV:-$HOME/Development/natural-text-to-voice-extension/native-helper/Sources/NaturalTTSHelper/Resources/python-env}"
D=/tmp/natural-tts
mkdir -p "$D/bin" "$D/demo"
ln -sfn "$VENV" "$D/python-env"
ln -sf "$REPO/native-helper/Sources/NaturalTTSHelper/Resources/tts_worker.py" "$D/tts_worker.py"
ln -sf "$REPO/native-helper/.build/release/natural-tts-helper" "$D/bin/natural-tts-helper"
export NATURAL_TTS_PYTHON="$D/python-env/bin/python3" NATURAL_TTS_WORKER="$D/tts_worker.py"
export PATH="$D/bin:$PATH" REPO
export PS1='\[\e[38;2;139;151;255m\]$\[\e[0m\] '
export PS2='  '
unset PROMPT_COMMAND
cd "$D/demo"
rm -f hello.wav
clear
