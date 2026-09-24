# Homebrew packaging for the Natural TTS helper

The helper ships as a Homebrew formula that **builds from source** (operator ruling OD-1; a
notarized `.app` comes later). This directory is the source of truth. The published copy lives
in the tap repository `renchris/homebrew-tap` (tap name `renchris/tap`), which
`publish-tap.sh` writes.

```
brew install renchris/tap/natural-tts
brew services start natural-tts
```

Then install "Natural TTS: Private Kokoro Voices for Mac" from the Chrome Web Store. The
extension finds the helper on 127.0.0.1, ports 8249-8260.

| File | What it is |
| --- | --- |
| `Formula/natural-tts.rb` | The formula. Its `url` names the release tag. Its `sha256` is a placeholder until `publish-tap.sh` fills it in. |
| `publish-tap.sh` | Operator-run publish: the tag, the tarball sha256, the tap repo, audit, push. Refuses without `--confirm`. |

## What the formula does

- **Requirements:** Apple silicon, macOS 14 (Sonoma) or later, and a Swift 6.0+ toolchain
  (Xcode 16.2+ or its Command Line Tools). Dependencies: `espeak-ng`, `python@3.12`, and `uv`
  (build only).
- **Build:** `swift build --disable-sandbox -c release` in `native-helper/`. Homebrew's swift
  shim exports `SDKROOT` for its own SDK choice, which is the Command Line Tools SDK whenever
  the CLT are installed. But the shim runs `/usr/bin/swift`, which follows `xcode-select`. On a
  machine with a newer Xcode that means Swift 6.2 against the CLT's Swift 6.0 SDK, and
  swift-nio fails (`cannot find type 'SendableMetatype'`). The formula therefore pins `SDKROOT`
  to the SDK that `/usr/bin/xcrun` resolves, which is the SDK of the toolchain that actually
  runs.
- **Layout:** everything lives in `libexec/`, the layout the helper's exe-relative lookup
  expects (`Config.swift`, `PathResolver`):

  ```
  libexec/natural-tts-helper        the binary
  libexec/tts_worker.py             the worker
  libexec/python/                   pyproject.toml, uv.lock, .python-version
  libexec/python-env/               uv sync --frozen, on python@3.12 via its opt path
  libexec/hf-cache/                 the pinned Kokoro snapshot (MODEL_REVISION in tts_worker.py)
  bin/natural-tts-helper            wrapper: sets HF_HOME, NATURAL_TTS_PYTHON and
                                    NATURAL_TTS_WORKER to opt_libexec paths, then exec's the binary
  ```

  The model is fetched at install time, so the installed helper never touches the network. The
  worker forces `HF_HUB_OFFLINE=1`.
- **Why the wrapper pins the interpreter and worker:** left to resolve them itself, the helper
  persists the resolved paths into `config.json`, and those are `Cellar/natural-tts/<version>/`
  paths, which `brew upgrade` deletes. `Config.load` would then refuse to start. The env
  overrides win over `config.json`, so the stable `opt/` paths are what get persisted. They
  also keep a manual `natural-tts-helper` run from reading or writing the shared
  `~/Library/Application Support/NaturalTTS/config.json` that a source checkout uses.
- **Service:** `brew services start natural-tts` runs `opt_bin/natural-tts-helper` with
  `keep_alive` and `NATURAL_TTS_CONFIG_DIR=$(brew --prefix)/var/natural-tts`. It is isolated
  from source checkouts. The log is `$(brew --prefix)/var/log/natural-tts.log`.
  `brew services stop` sends SIGTERM, and the helper exits within about 2 s with its worker
  stopped (`Shutdown.swift`).
- **Test:** `brew test natural-tts` starts the helper on a free port. It asserts `/health`
  reports `apiVersion` 2 and `status` `ok`, and that a `/speak` with `af_heart` returns a WAV.
- **Network at build time:** SwiftPM (the pinned `Package.resolved`), `uv sync --frozen` (the
  hash-locked `uv.lock`) and the Hub download (one pinned commit) all fetch during `install`.
  Homebrew allows network access in the build phase by default (`formula.rb`,
  `DEFAULT_NETWORK_ACCESS_ALLOWED = true`), and `brew audit --strict --online` accepts it.
  homebrew-core would instead require a `resource` block for every wheel. That is a
  requirement for core only, so this tap keeps `uv.lock` as the single pin.

## Releasing a new version

1. Bump the version everywhere it lives: `HelperInfo.version` in
   `native-helper/Sources/NaturalTTSHelper/Models.swift`, `native-helper/python/pyproject.toml`,
   the extension manifest and `CHANGELOG.md`. Then land it on `main`. The formula's `url`
   version is rewritten by the script, so it does not need editing.
2. Preview. This changes nothing, prints the resolved plan and exits 2:

   ```
   packaging/homebrew/publish-tap.sh --version X.Y.Z
   ```

3. Publish. It creates and pushes the tag `vX.Y.Z` on `origin/main` if absent, computes the
   GitHub tarball sha256, writes the formula into `$(brew --repo renchris/tap)`, runs
   `brew audit --strict --online`, then commits and pushes the tap:

   ```
   packaging/homebrew/publish-tap.sh --version X.Y.Z --confirm vX.Y.Z --confirm renchris/homebrew-tap
   ```

The script is fail-closed and idempotent:

- It refuses an unlanded `--ref`, a tagged tree without the formula, a helper version that
  differs from `--version`, and a dirty local tap checkout.
- It restores the tap checkout if the audit fails.
- Re-running after a publish exits 0 with "already current".

## Local proof (2026-09-23, branch `w2b/helper2`)

The proof installed from a scratch tap and a `file://` tarball, then removed everything. It
ran on Homebrew 7.0.6, macOS 15 arm64, Xcode (Swift 6.2.4) plus CLT (Swift 6.0.3). It used
`HOMEBREW_NO_AUTO_UPDATE=1 HOMEBREW_NO_INSTALL_CLEANUP=1`. The proof copy of the formula
differed from this file in exactly three lines:

- `url` pointed at the file:// tarball.
- `sha256` was that tarball's hash.
- The service added `NATURAL_TTS_PORT: "18249"`, so the service stayed off 8249-8260, where a
  v1.4 helper was running.

| # | Command | Result |
| --- | --- | --- |
| 1 | `git archive --format=tar.gz --prefix=natural-text-to-voice-extension-1.5.0/ HEAD > /tmp/ntts-brew-proof/…-1.5.0.tar.gz` (HEAD = `1d19d62`) | 3.0 MB, sha256 `34ec6f52…4972b5` |
| 2 | `brew tap-new --no-git local/ntts-proof`, then write the proof copy into it | tap created |
| 3 | `brew style` / `brew audit --strict local/ntts-proof/natural-tts` | first run: 3 offenses (dependency order, `formula_opt_bin`, `post_install`), all fixed; then clean, exit 0 |
| 4 | `brew install --build-from-source local/ntts-proof/natural-tts` | **attempt 1 failed:** swift-nio `cannot find type 'SendableMetatype'` (the SDKROOT mismatch above). Clearing `SDKROOT` did not help, because the shim re-exports it. **Pinning SDKROOT to `/usr/bin/xcrun --show-sdk-path` fixed it.** Attempt 3 failed on reading the worker after `libexec.install` had moved it (fixed). **Attempt 4: installed, 21,057 files, 995.8 MB (python-env 664 MB, hf-cache 340 MB with 54 voices), built in 1 min 46 s** |
| 5 | `brew test local/ntts-proof/natural-tts` | exit 0, 23 s (health apiVersion 2 + status ok + /speak WAV) |
| 6 | `natural-tts-helper --port 18249`, `curl /health`, `curl -d '{"text":…,"voice":"af_heart"}' /speak`, then SIGTERM | health `status ok, apiVersion 2` after 7 s; /speak 200, 142,844 bytes, `RIFF … WAVE, PCM 16 bit mono 24000 Hz`; the worker ran on `Cellar/python@3.12` against the keg's `tts_worker.py`; SIGTERM: exit 0 in about 600 ms, worker gone |
| 7 | `brew services start local/ntts-proof/natural-tts` | health `ok`/apiVersion 2 on 18249 after 11 s. **Found:** `var/natural-tts/config.json` held `Cellar/natural-tts/1.5.0/…` paths (the upgrade break described above) |
| 8 | `brew services stop …` | helper gone in about 100 ms, worker gone, 18249 released, log ends `Natural TTS Helper stopped` |
| 9 | Wrapper fix (`NATURAL_TTS_PYTHON`/`WORKER` = `opt_libexec`), then `brew reinstall --build-from-source`, `brew test` | reinstall 1 min 21 s; test exit 0, 24 s |
| 10 | Rerun of 6-8 with the fix, and the stale Cellar-path `config.json` left in place | manual: health ok in 5 s, /speak 200 WAV, exit 0. Service: health ok in 6 s, and `config.json` was **rewritten to `/opt/homebrew/opt/natural-tts/libexec/…`**. Stop: gone in about 100 ms, worker gone, port released |
| 11 | `brew audit --strict --online local/ntts-proof/natural-tts` | exit 0 |
| 12 | `brew uninstall local/ntts-proof/natural-tts` (auto-removed `python@3.12`, which the proof had installed), `brew untap local/ntts-proof`, remove `var/natural-tts`, `var/log/natural-tts.log` and the tarball | `brew list --formula` identical to the pre-proof snapshot; no service, no LaunchAgent, no process left |

Side effects that remain: installing `python@3.12` upgraded three existing formulae it needed,
`readline` 8.3.3 → 8.3.6, `xz` 5.8.3 → 5.8.4 and `uv` 0.11.28 → 0.12.17. The old kegs are still
in the Cellar, because install cleanup was off. The shared
`~/Library/Application Support/NaturalTTS/config.json` was not touched (mtime before the proof).
