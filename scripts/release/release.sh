#!/usr/bin/env bash
# Natural TTS release program: everything between a green main and the Chrome Web Store dashboard.
#
#   scripts/release/release.sh [--version X.Y.Z] [--youtube-url URL] [--reverify]
#                              [--confirm TARGET]...
#
# Run it from a checkout of main. It DRIVES every step it can and GATES each irreversible one:
# a gated step runs only when its --confirm TARGET is on the command line. Without it, the step
# prints the exact command it would run and changes nothing. There are no prompts, so it works
# from a shell without a keyboard (Claude Code's "!").
#
#   0. Preflight (drives; any failure stops the run, exit 1)
#      - HEAD == origin/main, no tracked changes, no untracked files under chrome-extension/src|public
#      - one version everywhere: package.json, manifest.json, Models.swift, pyproject.toml,
#        a dated CHANGELOG section, and the Homebrew formula's tag url
#      - scripts/verify-all.sh green for this exact commit (cached per commit sha; --reverify reruns)
#      - bun run package: release/natural-tts-X.Y.Z.zip, re-read and hashed, plus its .sha256
#   1. Tag vX.Y.Z at origin/main and push it                     GATED  --confirm vX.Y.Z
#   2. GitHub Release vX.Y.Z: CHANGELOG section as notes,
#      the zip and its .sha256 as assets                         GATED  --confirm release/vX.Y.Z
#   3. Homebrew tap: packaging/homebrew/publish-tap.sh, with its own confirms
#                                                                GATED  --confirm renchris/homebrew-tap
#   4. GitHub private vulnerability reporting on (PRIVACY.md links to it)
#                                                                GATED  --confirm private-vulnerability-reporting
#   5. The GUI-only steps: checks the store images, then prints the dashboard and YouTube steps,
#      with the reviewer's test instructions ready to paste (--youtube-url fills the video link)
#
# Idempotent: a step already done is verified and reported CURRENT, never repeated. A tag that points
# at another commit, or a release asset whose hash differs, is a FAIL, never overwritten.
#
# Exit: 0 released and the listing inputs are ready · 1 a check failed · 2 refused (a gated step
#       needs --confirm; nothing was changed by it) · 3 released, but store images are missing
#       · 64 bad usage.
# Log: every run is also written to $TMPDIR/ntts-release.XXXXXX/release.log (path printed at the end).

set -euo pipefail

SOURCE_REPO="renchris/natural-text-to-voice-extension"
ORIGIN_URLS="https://github.com/${SOURCE_REPO}.git https://github.com/${SOURCE_REPO} git@github.com:${SOURCE_REPO}.git"
TAP_REPO="renchris/homebrew-tap"
PVR_TARGET="private-vulnerability-reporting"
DASHBOARD_URL="https://chrome.google.com/webstore/devconsole"
YOUTUBE_UPLOAD_URL="https://studio.youtube.com"

VERSION=""
YOUTUBE_URL=""
REVERIFY=false
CONFIRMS=()

usage() { sed -n '2,33p' "$0" | sed 's/^# \{0,1\}//'; }
die() { echo "release: FAIL: $*" >&2; exit 1; }
step() { printf '\n==> %s\n' "$*"; }
note() { printf '    %s\n' "$*"; }

while [ $# -gt 0 ]; do
    case "$1" in
        --version) [ $# -ge 2 ] || { usage >&2; exit 64; }; VERSION="$2"; shift 2 ;;
        --youtube-url) [ $# -ge 2 ] || { usage >&2; exit 64; }; YOUTUBE_URL="$2"; shift 2 ;;
        --confirm) [ $# -ge 2 ] || { usage >&2; exit 64; }; CONFIRMS+=("$2"); shift 2 ;;
        --reverify) REVERIFY=true; shift ;;
        -h|--help) usage; exit 0 ;;
        *) echo "release: unknown argument: $1" >&2; usage >&2; exit 64 ;;
    esac
done

REPO="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
EXT="$REPO/chrome-extension"

# The version defaults to the extension's package.json; every other place must agree (preflight).
if [ -z "$VERSION" ]; then
    VERSION="$(sed -nE 's/^  "version": "([^"]+)",?$/\1/p' "$EXT/package.json" | head -n 1)"
fi
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "release: --version must be X.Y.Z, got '$VERSION'" >&2; exit 64; }
TAG="v${VERSION}"
TAG_TARGET="$TAG"
RELEASE_TARGET="release/${TAG}"
ZIP="$EXT/release/natural-tts-${VERSION}.zip"

# A --confirm that names no step is a typo; refuse it rather than silently not confirming anything.
for c in "${CONFIRMS[@]+"${CONFIRMS[@]}"}"; do
    case "$c" in
        "$TAG_TARGET"|"$RELEASE_TARGET"|"$TAP_REPO"|"$PVR_TARGET") ;;
        *) echo "release: --confirm '$c' names no step. Valid: $TAG_TARGET $RELEASE_TARGET $TAP_REPO $PVR_TARGET" >&2
           exit 64 ;;
    esac
done
if [ -n "$YOUTUBE_URL" ] && ! [[ "$YOUTUBE_URL" =~ ^https://(www\.)?(youtube\.com/watch\?v=|youtu\.be/)[A-Za-z0-9_-]{11}$ ]]; then
    echo "release: --youtube-url must be https://www.youtube.com/watch?v=<11-char id> or https://youtu.be/<id>" >&2
    exit 64
fi
confirmed() {
    local want="$1" c
    for c in "${CONFIRMS[@]+"${CONFIRMS[@]}"}"; do [ "$c" = "$want" ] && return 0; done
    return 1
}

WORK="$(mktemp -d "${TMPDIR:-/tmp}/ntts-release.XXXXXX")"
LOG="$WORK/release.log"
exec > >(tee -a "$LOG") 2>&1

# Step results, for the summary: parallel arrays (bash 3.2 has no associative arrays).
S_NAME=(); S_STATE=(); S_NOTE=()
result() { S_NAME+=("$1"); S_STATE+=("$2"); S_NOTE+=("${3:-}"); }
NEEDED=()      # confirms that would let refused steps run
need() { local c; for c in "${NEEDED[@]+"${NEEDED[@]}"}"; do [ "$c" = "$1" ] && return 0; done; NEEDED+=("$1"); }

gated() { # gated <target> <what> <why irreversible> <command lines...>
    local target="$1" what="$2" why="$3"; shift 3
    echo "    GATED: ${what}"
    local line; for line in "$@"; do echo "      \$ ${line}"; done
    echo "      Cannot be taken back: ${why}"
    echo "      Runs only with: --confirm ${target}"
}

# ------------------------------------------------------------------------------ 0. preflight
step "0. Preflight: ${REPO} (version ${VERSION})"
for tool in git gh bun node shasum sips curl; do
    command -v "$tool" >/dev/null 2>&1 || die "$tool not found on PATH"
done
gh auth status >/dev/null 2>&1 || die "gh is not signed in (run: gh auth login)"

ORIGIN_URL="$(git -C "$REPO" config --get remote.origin.url || true)"
case " $ORIGIN_URLS " in
    *" $ORIGIN_URL "*) note "origin: ${ORIGIN_URL}" ;;
    *) die "origin is '${ORIGIN_URL}', not ${SOURCE_REPO}; release from a clone of the real repository" ;;
esac

git -C "$REPO" fetch --quiet --tags origin || die "git fetch origin failed"
HEAD_SHA="$(git -C "$REPO" rev-parse HEAD)"
MAIN_SHA="$(git -C "$REPO" rev-parse origin/main)"
[ "$HEAD_SHA" = "$MAIN_SHA" ] \
    || die "HEAD ${HEAD_SHA:0:7} is not origin/main ${MAIN_SHA:0:7}; check out main and git pull --ff-only"
note "HEAD = origin/main = ${HEAD_SHA:0:12}"

DIRTY="$(git -C "$REPO" status --porcelain --untracked-files=no)"
[ -z "$DIRTY" ] || die "tracked files have changes; commit or stash them first:
${DIRTY}"
# Untracked files elsewhere cannot reach the package or the tag; under src/ or public/ they would ship.
STRAY="$(git -C "$REPO" status --porcelain --untracked-files=all -- chrome-extension/src chrome-extension/public)"
[ -z "$STRAY" ] || die "untracked files under chrome-extension/src or public would be packaged; remove them:
${STRAY}"
OTHER_UNTRACKED="$(git -C "$REPO" status --porcelain --untracked-files=normal | grep -c '^??' || true)"
note "tracked tree clean; ${OTHER_UNTRACKED} untracked path(s) elsewhere (not packaged, not tagged)"

# One version everywhere.
json_version() { node -e 'process.stdout.write(String(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).version))' "$1"; }
V_PKG="$(json_version "$EXT/package.json")"
V_MANIFEST="$(json_version "$EXT/public/manifest.json")"
V_HELPER="$(sed -nE 's/^[[:space:]]*static let version = "([^"]+)"$/\1/p' "$REPO/native-helper/Sources/NaturalTTSHelper/Models.swift")"
V_PY="$(sed -nE 's/^version = "([^"]+)"$/\1/p' "$REPO/native-helper/python/pyproject.toml" | head -n 1)"
FORMULA_URL="$(sed -nE 's/^  url "([^"]+)"$/\1/p' "$REPO/packaging/homebrew/Formula/natural-tts.rb")"
for pair in "chrome-extension/package.json:$V_PKG" "chrome-extension/public/manifest.json:$V_MANIFEST" \
            "native-helper Models.swift:$V_HELPER" "native-helper/python/pyproject.toml:$V_PY"; do
    [ "${pair##*:}" = "$VERSION" ] || die "${pair%%:*} says '${pair##*:}', not ${VERSION}"
done
[ "$FORMULA_URL" = "https://github.com/${SOURCE_REPO}/archive/refs/tags/${TAG}.tar.gz" ] \
    || die "the formula's url is '${FORMULA_URL}', not the ${TAG} tarball"
NOTES="$WORK/notes.md"
awk -v v="$VERSION" '
    index($0, "## [" v "] - ") == 1 { found = 1; next }
    found && /^## \[/              { exit }
    found                          { print }
' "$REPO/CHANGELOG.md" > "$NOTES"
grep -qE "^## \[${VERSION//./\\.}\] - [0-9]{4}-[0-9]{2}-[0-9]{2}$" "$REPO/CHANGELOG.md" \
    || die "CHANGELOG.md has no dated '## [${VERSION}] - YYYY-MM-DD' section"
[ "$(grep -c '[^[:space:]]' "$NOTES")" -ge 3 ] || die "the CHANGELOG ${VERSION} section is empty"
note "version ${VERSION} everywhere: package.json, manifest.json, Models.swift, pyproject.toml, CHANGELOG ($(wc -l < "$NOTES" | tr -d ' ') lines), formula url"

# The integration gate, once per commit. The stamp names the exact sha, so any new commit reruns it.
CACHE="${NTTS_RELEASE_CACHE:-${XDG_CACHE_HOME:-$HOME/.cache}/natural-tts-release}"
STAMP="$CACHE/verify-all-${HEAD_SHA}.pass"
mkdir -p "$CACHE"
if [ "$REVERIFY" = false ] && [ -f "$STAMP" ]; then
    note "scripts/verify-all.sh: green for ${HEAD_SHA:0:12} at $(head -n 1 "$STAMP") (--reverify to rerun)"
else
    note "running scripts/verify-all.sh (all sections, several minutes; it starts its own helper on VERIFY_PORT, default 18249, and touches no other)"
    if "$REPO/scripts/verify-all.sh" > "$WORK/verify-all.log" 2>&1; then
        { date -u +%Y-%m-%dT%H:%M:%SZ; echo "log: $WORK/verify-all.log"; } > "$STAMP"
        note "scripts/verify-all.sh: green ($(grep -c '^PASS' "$WORK/verify-all.log" || true) checks passed)"
    else
        tail -n 25 "$WORK/verify-all.log" >&2
        die "scripts/verify-all.sh is not green; full log: $WORK/verify-all.log"
    fi
fi

# The store package: built, checked and re-read by chrome-extension/scripts/package.mjs.
[ -d "$EXT/node_modules" ] || (cd "$EXT" && bun install --frozen-lockfile) > "$WORK/bun-install.log" 2>&1 \
    || die "bun install --frozen-lockfile failed; log: $WORK/bun-install.log"
(cd "$EXT" && bun run package) > "$WORK/package.log" 2>&1 \
    || { tail -n 15 "$WORK/package.log" >&2; die "bun run package failed; log: $WORK/package.log"; }
PKG_LINE="$(grep '^OK ' "$WORK/package.log" | tail -n 1)"
[ -f "$ZIP" ] || die "the packager did not write ${ZIP}"
ZIP_SHA="$(shasum -a 256 "$ZIP" | cut -d' ' -f1)"
[ "${PKG_LINE##* }" = "$ZIP_SHA" ] || die "the zip changed after the packager hashed it"
ZIP_BYTES="$(wc -c < "$ZIP" | tr -d ' ')"
( cd "$(dirname "$ZIP")" && shasum -a 256 "$(basename "$ZIP")" ) > "$ZIP.sha256"
note "package: ${ZIP#"$REPO"/} (${ZIP_BYTES} bytes) sha256 ${ZIP_SHA}"
result "0 preflight" DONE "HEAD ${HEAD_SHA:0:7}, verify-all green, zip ${ZIP_SHA:0:12}"

# ------------------------------------------------------------------------------ 1. tag
step "1. Tag ${TAG}"
TAG_READY=false
if git -C "$REPO" ls-remote --exit-code --tags origin "refs/tags/${TAG}" >/dev/null 2>&1; then
    TAG_SHA="$(git -C "$REPO" rev-parse "refs/tags/${TAG}^{commit}")"
    [ "$TAG_SHA" = "$HEAD_SHA" ] \
        || die "${TAG} already exists on origin at ${TAG_SHA:0:7}, not at origin/main ${HEAD_SHA:0:7}. Tags are never moved; bump the version instead"
    note "${TAG} is on origin at ${HEAD_SHA:0:12}"
    TAG_READY=true
    result "1 tag ${TAG}" CURRENT "on origin at ${HEAD_SHA:0:7}"
else
    TAG_CMDS=("git -C $REPO tag -a $TAG -m 'Natural TTS ${VERSION}' $HEAD_SHA" "git -C $REPO push origin refs/tags/$TAG")
    if git -C "$REPO" rev-parse -q --verify "refs/tags/${TAG}" >/dev/null; then
        LOCAL_TAG_SHA="$(git -C "$REPO" rev-parse "refs/tags/${TAG}^{commit}")"
        [ "$LOCAL_TAG_SHA" = "$HEAD_SHA" ] \
            || die "a local ${TAG} points at ${LOCAL_TAG_SHA:0:7}, not ${HEAD_SHA:0:7}; delete it (git tag -d ${TAG}) and rerun"
        TAG_CMDS=("git -C $REPO push origin refs/tags/$TAG   (the local tag already exists at HEAD)")
    fi
    if confirmed "$TAG_TARGET"; then
        git -C "$REPO" rev-parse -q --verify "refs/tags/${TAG}" >/dev/null \
            || git -C "$REPO" tag -a "$TAG" -m "Natural TTS ${VERSION}" "$HEAD_SHA"
        git -C "$REPO" push origin "refs/tags/${TAG}"
        git -C "$REPO" ls-remote --exit-code --tags origin "refs/tags/${TAG}" >/dev/null \
            || die "${TAG} is not visible on origin after the push"
        note "pushed ${TAG} at ${HEAD_SHA:0:12}"
        TAG_READY=true
        result "1 tag ${TAG}" DONE "pushed at ${HEAD_SHA:0:7}"
    else
        gated "$TAG_TARGET" "create and push the annotated tag ${TAG} at ${HEAD_SHA:0:12} (origin/main)" \
            "a pushed tag is public; GitHub serves the Homebrew tarball from it" "${TAG_CMDS[@]}"
        need "$TAG_TARGET"
        result "1 tag ${TAG}" REFUSED "needs --confirm ${TAG_TARGET}"
    fi
fi

# ------------------------------------------------------------------------------ 2. GitHub Release
step "2. GitHub Release ${TAG}"
{
    cat "$NOTES"
    echo
    echo "---"
    echo
    echo "**Chrome extension package:** \`natural-tts-${VERSION}.zip\` (${ZIP_BYTES} bytes), sha256 \`${ZIP_SHA}\`."
    echo "It is the file uploaded to the Chrome Web Store; \`cd chrome-extension && bun run package\` rebuilds it byte for byte."
} > "$WORK/release-notes.md"
if gh release view "$TAG" -R "$SOURCE_REPO" --json tagName >/dev/null 2>&1; then
    [ "$(gh release view "$TAG" -R "$SOURCE_REPO" --json isDraft --jq .isDraft)" = false ] \
        || die "release ${TAG} exists as a draft; publish or delete it in the GitHub UI, then rerun"
    ASSETS="$(gh release view "$TAG" -R "$SOURCE_REPO" --json assets --jq '.assets[].name')"
    MISSING_ASSETS=()
    for a in "natural-tts-${VERSION}.zip" "natural-tts-${VERSION}.zip.sha256"; do
        if printf '%s\n' "$ASSETS" | grep -qxF "$a"; then
            if [ "$a" = "natural-tts-${VERSION}.zip" ]; then
                gh release download "$TAG" -R "$SOURCE_REPO" -p "$a" -D "$WORK/published" --clobber >/dev/null \
                    || die "could not download the published ${a} to check it"
                PUB_SHA="$(shasum -a 256 "$WORK/published/$a" | cut -d' ' -f1)"
                [ "$PUB_SHA" = "$ZIP_SHA" ] \
                    || die "the published ${a} has sha256 ${PUB_SHA:0:12}, this build ${ZIP_SHA:0:12}. Never overwritten; investigate"
            fi
        else
            MISSING_ASSETS+=("$a")
        fi
    done
    if [ ${#MISSING_ASSETS[@]} -eq 0 ]; then
        note "release ${TAG} is published with the zip (sha256 matches this build) and its .sha256"
        result "2 GitHub Release" CURRENT "assets match this build"
    else
        UPLOAD=()
        for a in "${MISSING_ASSETS[@]}"; do UPLOAD+=("$(dirname "$ZIP")/$a"); done
        if confirmed "$RELEASE_TARGET"; then
            gh release upload "$TAG" -R "$SOURCE_REPO" "${UPLOAD[@]}"
            result "2 GitHub Release" DONE "uploaded ${MISSING_ASSETS[*]}"
        else
            gated "$RELEASE_TARGET" "upload ${MISSING_ASSETS[*]} to the existing release ${TAG}" \
                "release assets are public downloads" "gh release upload $TAG -R $SOURCE_REPO ${UPLOAD[*]}"
            need "$RELEASE_TARGET"
            result "2 GitHub Release" REFUSED "needs --confirm ${RELEASE_TARGET}"
        fi
    fi
else
    CREATE_CMD="gh release create $TAG -R $SOURCE_REPO --verify-tag --latest --title 'Natural TTS ${VERSION}' --notes-file $WORK/release-notes.md $ZIP $ZIP.sha256"
    if [ "$TAG_READY" = false ]; then
        echo "    BLOCKED by step 1 (the release needs the tag). When it runs:"
        echo "      \$ ${CREATE_CMD}"
        need "$RELEASE_TARGET"
        result "2 GitHub Release" BLOCKED "needs the tag first"
    elif confirmed "$RELEASE_TARGET"; then
        gh release create "$TAG" -R "$SOURCE_REPO" --verify-tag --latest --title "Natural TTS ${VERSION}" \
            --notes-file "$WORK/release-notes.md" "$ZIP" "$ZIP.sha256"
        note "published release ${TAG}"
        result "2 GitHub Release" DONE "created with the zip and notes"
    else
        gated "$RELEASE_TARGET" "publish the GitHub Release ${TAG} with the CHANGELOG ${VERSION} section as notes and the zip + .sha256" \
            "a published release notifies watchers and becomes Latest" "$CREATE_CMD"
        note "notes preview: $WORK/release-notes.md ($(wc -l < "$WORK/release-notes.md" | tr -d ' ') lines)"
        need "$RELEASE_TARGET"
        result "2 GitHub Release" REFUSED "needs --confirm ${RELEASE_TARGET}"
    fi
fi

# ------------------------------------------------------------------------------ 3. Homebrew tap
step "3. Homebrew tap ${TAP_REPO}"
TAP_ARGS=(--version "$VERSION" --ref origin/main)
PUBLISH_TAP="$REPO/packaging/homebrew/publish-tap.sh"
[ -x "$PUBLISH_TAP" ] || die "missing or not executable: ${PUBLISH_TAP}"
# Read-only probe of the published formula: its url names the tag when this version is live.
LIVE_URL="$(gh api "repos/${TAP_REPO}/contents/Formula/natural-tts.rb" --jq .content 2>/dev/null \
    | base64 --decode 2>/dev/null | sed -nE 's/^  url "([^"]+)"$/\1/p' || true)"
if [ "$LIVE_URL" = "$FORMULA_URL" ]; then
    note "the published formula already points at ${TAG}"
fi
if [ "$TAG_READY" = false ]; then
    echo "    BLOCKED by step 1 (the formula downloads the ${TAG} tarball). Its plan, read-only:"
    "$PUBLISH_TAP" "${TAP_ARGS[@]}" 2>&1 | sed 's/^/      /' || true
    echo "      (Publish through release.sh, not publish-tap.sh directly, so the tag and the release come first.)"
    need "$TAP_REPO"
    result "3 Homebrew tap" BLOCKED "needs the tag first"
elif confirmed "$TAP_REPO"; then
    # The tag exists by now (step 1), so publish-tap.sh only needs the tap confirm. The tag confirm is
    # forwarded only if the operator gave it, never invented.
    ! confirmed "$TAG_TARGET" || TAP_ARGS+=(--confirm "$TAG_TARGET")
    TAP_ARGS+=(--confirm "$TAP_REPO")
    set +e
    "$PUBLISH_TAP" "${TAP_ARGS[@]}" 2>&1 | sed 's/^/      /'
    TAP_STATUS=${PIPESTATUS[0]}
    set -e
    [ "$TAP_STATUS" -eq 0 ] || die "publish-tap.sh exited ${TAP_STATUS}; see its output above"
    if [ "$LIVE_URL" = "$FORMULA_URL" ]; then result "3 Homebrew tap" CURRENT "publish-tap verified it"
    else result "3 Homebrew tap" DONE "renchris/tap/natural-tts ${VERSION}"; fi
else
    echo "    GATED: publish Formula/natural-tts.rb for ${TAG} to ${TAP_REPO} (publish-tap.sh plan below; it changed nothing)"
    "$PUBLISH_TAP" "${TAP_ARGS[@]}" 2>&1 | sed 's/^/      /' || true
    echo "      Cannot be taken back: users' brew install and brew upgrade read the pushed formula"
    echo "      Runs only with: --confirm ${TAP_REPO}   (release.sh passes publish-tap.sh its own confirms)"
    need "$TAP_REPO"
    if [ "$LIVE_URL" = "$FORMULA_URL" ]; then
        result "3 Homebrew tap" REFUSED "live url is ${TAG}; --confirm ${TAP_REPO} verifies the sha256 and exits CURRENT"
    else
        result "3 Homebrew tap" REFUSED "needs --confirm ${TAP_REPO}"
    fi
fi

# ------------------------------------------------------------------------------ 4. private vulnerability reporting
step "4. Private vulnerability reporting (PRIVACY.md links to it)"
PVR="$(gh api "repos/${SOURCE_REPO}/private-vulnerability-reporting" --jq .enabled 2>/dev/null || echo unknown)"
case "$PVR" in
    true)
        note "enabled"
        result "4 security contact" CURRENT "private vulnerability reporting on" ;;
    false)
        if confirmed "$PVR_TARGET"; then
            gh api -X PUT "repos/${SOURCE_REPO}/private-vulnerability-reporting" >/dev/null
            [ "$(gh api "repos/${SOURCE_REPO}/private-vulnerability-reporting" --jq .enabled)" = true ] \
                || die "private vulnerability reporting is still off after enabling it"
            note "enabled"
            result "4 security contact" DONE "private vulnerability reporting on"
        else
            gated "$PVR_TARGET" "turn on private vulnerability reporting for ${SOURCE_REPO}" \
                "a public repository setting (undo: gh api -X DELETE repos/${SOURCE_REPO}/private-vulnerability-reporting)" \
                "gh api -X PUT repos/${SOURCE_REPO}/private-vulnerability-reporting"
            need "$PVR_TARGET"
            result "4 security contact" REFUSED "needs --confirm ${PVR_TARGET}"
        fi ;;
    *) die "could not read the private-vulnerability-reporting setting (got '${PVR}')" ;;
esac

# ------------------------------------------------------------------------------ 5. GUI-only steps
step "5. Store images and the GUI-only steps"
ASSETS_OK=true
check_image() { # check_image <path> <WxH> <required|optional> <label>
    local path="$REPO/$1" want="$2" req="$3" label="$4" got
    if [ ! -f "$path" ]; then
        if [ "$req" = required ]; then echo "    MISSING   $1  (${want}, ${label}, required)"; ASSETS_OK=false
        else echo "    missing   $1  (${want}, ${label}, optional)"; fi
        return 0
    fi
    got="$(sips -g pixelWidth -g pixelHeight "$path" 2>/dev/null | awk '/pixelWidth/{w=$2} /pixelHeight/{h=$2} END{print w "x" h}')"
    if [ "$got" = "$want" ]; then echo "    ok        $1  (${got}, $(wc -c < "$path" | tr -d ' ') bytes)"
    else echo "    WRONG     $1  is ${got}, want ${want}"; ASSETS_OK=false; fi
}
check_image chrome-extension/public/icons/icon128.png 128x128 required "store icon"
check_image assets/store/cws-shot1-1280x800.png 1280x800 required "screenshot 1"
for n in 2 3 4 5; do check_image "assets/store/cws-shot${n}-1280x800.png" 1280x800 optional "screenshot ${n}"; done
check_image assets/store/cws-tile-440x280.png 440x280 required "small promo tile"
check_image assets/store/cws-marquee-1400x560.png 1400x560 optional "marquee"
check_image assets/store/youtube-thumbnail.png 1280x720 optional "YouTube thumbnail"

TESTS="$WORK/test-instructions.txt"
awk '
    /^## 5\. Test instructions tab/ { sect = 1; next }
    sect && /^```text$/             { inb = 1; next }
    inb && /^```$/                  { exit }
    inb                             { print }
' "$REPO/docs/publishing/CHROME_WEB_STORE.md" > "$TESTS"
[ -s "$TESTS" ] || die "could not read the test instructions from docs/publishing/CHROME_WEB_STORE.md §5"
if [ -n "$YOUTUBE_URL" ]; then
    sed -i '' "s#YOUTUBE_URL#${YOUTUBE_URL}#" "$TESTS"
    grep -q YOUTUBE_URL "$TESTS" && die "YOUTUBE_URL placeholder survived in the test instructions"
fi

cat <<EOF

    These steps need a person at a browser. Every field is in docs/publishing/CHROME_WEB_STORE.md, in order.

    A. YouTube (docs/publishing/YOUTUBE.md): upload the demo at ${YOUTUBE_UPLOAD_URL}
       Public (or unlisted), embedding on, thumbnail assets/store/youtube-thumbnail.png.
       Then rerun this with --youtube-url <watch URL> to fill the link into the test instructions.

    B. Chrome Web Store dashboard: ${DASHBOARD_URL}
       1. Account (once): 2-Step Verification, the US\$5 fee, a verified contact email, Non-trader.
       2. Add new item > upload ${ZIP#"$REPO"/}
          sha256 ${ZIP_SHA}
       3. Store listing, Privacy, Distribution: paste from CHROME_WEB_STORE.md §2-§4.
       4. Test instructions: paste the block below.
       5. Submit for review with "publish automatically" UNTICKED (deferred), then record the item ID.

    ---- test instructions (${TESTS}) ----
EOF
sed 's/^/    /' "$TESTS"
echo "    ---- end ----"
[ -n "$YOUTUBE_URL" ] || echo "    (YOUTUBE_URL is still a placeholder: pass --youtube-url, or replace it by hand)"

if [ "$ASSETS_OK" = true ]; then result "5 GUI handoff" READY "images ok; dashboard and YouTube steps printed"
else result "5 GUI handoff" "NOT READY" "required store images missing or wrong size (W3 capture lane)"; fi

# ------------------------------------------------------------------------------ summary
step "Summary"
i=0
while [ $i -lt ${#S_NAME[@]} ]; do
    printf '    %-20s %-10s %s\n' "${S_NAME[$i]}" "${S_STATE[$i]}" "${S_NOTE[$i]}"
    i=$((i + 1))
done
echo "    log: ${LOG}"
if [ ${#NEEDED[@]} -gt 0 ]; then
    args=""; for c in "${NEEDED[@]}"; do args="${args} --confirm ${c}"; done
    [ -z "$YOUTUBE_URL" ] || args="${args} --youtube-url ${YOUTUBE_URL}"
    echo
    echo "REFUSED: the gated steps above changed nothing. Read their commands, then run:"
    echo "  scripts/release/release.sh --version ${VERSION}${args}"
    exit 2
fi
[ "$ASSETS_OK" = true ] || exit 3
exit 0
