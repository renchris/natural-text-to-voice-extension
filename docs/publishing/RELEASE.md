# Releasing Natural TTS

One program takes a green `main` to the point where only the browser steps remain:
[`scripts/release/release.sh`](../../scripts/release/release.sh). It **drives** every step it can and **gates**
each one that cannot be taken back. A gated step runs only when its `--confirm <target>` is on the command line;
without it, the step prints the exact command it would run and changes nothing. It never prompts, so it works from a
shell with no keyboard (Claude Code's `!`).

## Run it

From an up-to-date checkout of `main`:

```bash
scripts/release/release.sh
```

That first run checks everything, builds the store package, and prints each gated step's resolved command. Read them,
then run the command it prints at the end, which carries exactly the confirms still needed:

```bash
scripts/release/release.sh --version 1.5.0 --confirm v1.5.0 --confirm release/v1.5.0 --confirm renchris/natural-text-to-voice-extension --confirm renchris/homebrew-tap --confirm private-vulnerability-reporting
```

Rerun it any time. Steps already done are verified and reported `CURRENT`, never repeated.

## What it does, in order

| Step | What happens | Gate | Idempotency and failure |
| --- | --- | --- | --- |
| **0. Preflight** | `origin` is `renchris/natural-text-to-voice-extension`; `HEAD` == `origin/main`; no tracked changes; no untracked file under `chrome-extension/src` or `public` (it would be packaged); one version in `package.json`, `manifest.json`, `Models.swift`, `pyproject.toml`, a dated CHANGELOG section and the formula's tag URL; `scripts/verify-all.sh` green; `bun run package` builds and re-reads the zip and writes its `.sha256` | none (drives) | Any failure stops the run (exit 1) before anything is published. verify-all's pass is cached per commit sha in `~/.cache/natural-tts-release/`, so a rerun on the same commit skips it; `--reverify` forces it |
| **1. Tag** | Annotated tag `vX.Y.Z` at `origin/main`, pushed | `--confirm vX.Y.Z` | On origin at `HEAD` → `CURRENT`. On origin at another commit → **FAIL**: tags are never moved; bump the version. The one exception: commits after the tag that change only `README.md` (step 2b's), so a rerun still works |
| **2. GitHub Release** | `gh release create --verify-tag --latest`, titled "Natural TTS X.Y.Z", notes = the CHANGELOG section plus the zip's size and sha256, assets = the zip and its `.sha256` | `--confirm release/vX.Y.Z` | Exists with a zip whose sha256 matches this build → `CURRENT`. A missing asset is uploaded (same gate). A different hash, or a draft, → **FAIL**, never overwritten |
| **2b. README hero video** | Runs [`scripts/release/embed-hero-video.sh`](../../scripts/release/embed-hero-video.sh) `--push`: uploads `assets/media/hero.mp4` to a closed issue titled "README media: demo video", puts that attachment URL under `<!-- hero-video -->` (GitHub renders it as a player with sound; the silent preview becomes a text link), checks that GitHub renders a `<video>` for it, then commits `README.md` alone and pushes `main` | `--confirm renchris/natural-text-to-voice-extension` | An attachment URL already under the marker → `CURRENT`. An existing issue with the URL is reused, never uploaded twice. No `<video>` in GitHub's render → README restored, **FAIL**. The script also runs on its own, commit-only unless given `--push` |
| **3. Homebrew tap** | Runs `packaging/homebrew/publish-tap.sh --version X.Y.Z --ref origin/main`, passing it `--confirm renchris/homebrew-tap` (and `--confirm vX.Y.Z` only if you gave it). That script downloads the tag's tarball, writes the formula with its real sha256, runs `brew audit --strict --online`, and pushes the tap | `--confirm renchris/homebrew-tap` | Without the confirm, publish-tap.sh's own read-only plan is shown. It exits 0 "already current" when the published formula matches. Blocked until the tag exists |
| **4. Security contact** | Turns on GitHub private vulnerability reporting, which `PRIVACY.md` links to | `--confirm private-vulnerability-reporting` | Already on → `CURRENT`. Checked again after enabling |
| **5. GUI handoff** | Checks that the listing's inputs are true: steps 1-4 and 2b `CURRENT` or `DONE`; each store image at its exact size; `chrome-extension/PRIVACY.md` on GitHub's `main` identical to this commit's (blob sha) and its URL answering; the root README carrying `## Install` and `### Updating a helper installed from source` (the zip links to both) and none of "WebGPU", "Phase 0", "IN PROGRESS". Only then prints the dashboard and YouTube steps, the zip's path and sha256, and the reviewer's test instructions ready to paste (`--youtube-url '<watch URL>'` fills in the video link; quote it, since `?` is a glob in zsh). Otherwise it prints **NOT READY — do not submit** and what is missing | none | Images, policy or README not ready → exit 3 (a refused gated step still exits 2) |

**Exit codes:** `0` released and the listing inputs are ready · `1` a check failed · `2` refused: a gated step needs its
`--confirm` (the refused steps changed nothing) · `3` released, but the listing is not ready (store images, the policy
on GitHub, or the README) · `64` bad usage
(including a `--confirm` that names no step, so a typo can never silently confirm nothing).

Every run is logged to `$TMPDIR/ntts-release.XXXXXX/release.log`; the path is printed in the summary.

## What it needs

- `gh` signed in with `repo` scope (`gh auth status`), `git`, `bun`, `node`, and macOS's `shasum`, `sips` and `curl`.
- For verify-all: the helper's Python environment (`native-helper/Scripts/setup-python-env.sh`), a Swift 6 toolchain,
  and Chrome for Testing from Playwright's cache. verify-all starts its own helper on port 18249 inside a sandbox
  that forbids ports 8249-8260 and the shared `config.json`, so it never touches a helper you are running.
- For the tap step: Homebrew. publish-tap.sh taps `renchris/tap` locally if it is not tapped yet.

## What stays yours

These need a person at a browser, and the program prints them with their URLs at step 5:

1. **YouTube:** upload the demo (see [YOUTUBE.md](YOUTUBE.md)), then rerun with `--youtube-url '<watch URL>'`
   (quoted) to get the test instructions with the link filled in. Paste the same URL into the dashboard's Global promo
   video field yourself; the program does not fill that field.
2. **Chrome Web Store dashboard** (<https://chrome.google.com/webstore/devconsole>): account setup once (2-Step
   Verification, the US$5 fee, a verified contact email, Non-trader), upload the zip, paste every field from
   [CHROME_WEB_STORE.md](CHROME_WEB_STORE.md), and submit with deferred publishing.

Publishing through the Chrome Web Store API is deliberately not automated for launch: the first item must be created
in the dashboard anyway, and the one-time service-account setup is only worth it for later updates (R07 §9). If it is
added, use **API v2** only: v1 stops working on 15 October 2026.

## Undoing a step

| Step | Undo | Cost |
| --- | --- | --- |
| Tag | `git push origin :refs/tags/vX.Y.Z` and `git tag -d vX.Y.Z` | Only safe before the release and the tap use it; anyone who fetched it keeps it. Prefer a new patch version |
| GitHub Release | `gh release delete vX.Y.Z -R renchris/natural-text-to-voice-extension` | Watchers were already notified |
| Homebrew tap | Revert the commit in `renchris/homebrew-tap` and push | Users who installed or upgraded keep that version |
| README hero video | `git revert` the "docs(readme): playable hero video" commit and push | Never delete the issue while the README links it: that removes the video |
| Private vulnerability reporting | `gh api -X DELETE repos/renchris/natural-text-to-voice-extension/private-vulnerability-reporting` | PRIVACY.md's security link then fails; change the policy first |
| Chrome Web Store | Dashboard → Package → Rollback (one click, no review) | Rollback publishes the previous version under a new version number |

## How it was tested (2026-09-23)

`bash -n` and `shellcheck` are clean, and the script runs under macOS's own bash 3.2. The refusal paths were exercised
in a scratch clone whose `origin` URL is the real GitHub URL, rewritten with `url.<local bare>.insteadOf` to a local
bare repository, so the one confirmed push (a tag) provably landed locally (`git push --dry-run -v` printed the local
path, and `ls-remote` listed a branch that exists only locally). Every GitHub-side read was live and read-only.

| Test | Result |
| --- | --- |
| `--confirm v9.9.9`, `--version 1.5`, a bad `--youtube-url`, an unknown flag | exit 64, before any change or network access |
| Run from a branch that is not `origin/main` (this worktree) | exit 1 at preflight; tags, working tree and the zip unchanged |
| verify-all red (`VERIFY_PORT=8249`, which verify-all itself refuses) | exit 1, no cache stamp written, origin refs unchanged |
| No confirms, verify-all stamp seeded for the commit | exit 2: tag REFUSED, release and tap BLOCKED (publish-tap.sh's read-only plan shown), PVR REFUSED, GUI NOT READY (screenshot 1 and the small tile missing). GitHub (release, PVR, tap contents, tags), the origin refs, the local tags and the local tap checkout were all unchanged. The zip built in the clone had the same sha256 as the lane's own build |
| `--confirm v1.5.0` only | tag pushed to the local bare; release, tap and PVR REFUSED; exit 2; real GitHub unchanged |
| The same command again | tag `CURRENT`, nothing pushed |
| `main` moved past an existing `v1.5.0` | exit 1: "Tags are never moved; bump the version instead"; origin refs unchanged |
| An untracked `chrome-extension/src/stray.ts`; then a modified `CHANGELOG.md` | exit 1 each, naming the file |
| `pyproject.toml` committed at 1.5.1 | exit 1: "native-helper/python/pyproject.toml says '1.5.1', not 1.5.0" |

Not exercised here, because they publish: the confirmed release, tap and PVR steps. Each is one `gh` or
publish-tap.sh call, printed verbatim by the refused run for review before it is confirmed.
