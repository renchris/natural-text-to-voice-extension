#!/usr/bin/env bash
# Publish the natural-tts Homebrew formula to the renchris/homebrew-tap tap.
#
# Operator-run. Idempotent. Fail-closed: every check that cannot be proven stops the run.
#
#   packaging/homebrew/publish-tap.sh [--version 1.5.0] [--ref origin/main] \
#       [--confirm v1.5.0] [--confirm renchris/homebrew-tap]
#
# What it does, in order:
#   1. The release tag v<version> on origin: used as-is if it exists. Otherwise it is created
#      as an annotated tag on --ref and pushed            (GATED: --confirm v<version>).
#   2. The formula is read from the TAGGED tree (packaging/homebrew/Formula/natural-tts.rb at
#      the tag), and the tag's helper must report the same version (Models.swift).
#   3. Downloads GitHub's release tarball for the tag and computes its sha256.
#   4. The tap repo renchris/homebrew-tap: created with gh if absent
#                                                          (GATED: --confirm renchris/homebrew-tap).
#   5. Writes Formula/natural-tts.rb into the local tap checkout (brew --repo renchris/tap)
#      with the tag's url and the real sha256, then runs brew audit --strict --online on it.
#   6. Commits and pushes the tap                          (GATED: --confirm renchris/homebrew-tap).
#
# Without the --confirm arguments a step needs, it prints the full plan with the resolved
# commands and exits 2 BEFORE changing anything. Re-running after a successful publish finds
# the tag, the repo and an identical formula ON ORIGIN, and exits 0 without a commit. A run
# whose commit succeeded but whose push failed leaves the tap checkout ahead of origin; the
# next run pushes that commit (same gate) instead of reporting "already current".
#
# Exit codes: 0 published or already current · 1 a check failed · 2 refused (confirm missing)
#             · 64 bad usage.

set -euo pipefail

SOURCE_REPO="renchris/natural-text-to-voice-extension"
TAP_REPO="renchris/homebrew-tap"
TAP_NAME="renchris/tap"
FORMULA_NAME="natural-tts"
FORMULA_REL="packaging/homebrew/Formula/${FORMULA_NAME}.rb"
MODELS_REL="native-helper/Sources/NaturalTTSHelper/Models.swift"

VERSION="1.5.0"
REF="origin/main"
CONFIRMS=()

usage() { sed -n '2,27p' "$0" | sed 's/^# \{0,1\}//'; }
die() { echo "publish-tap: FAIL: $*" >&2; exit 1; }
step() { printf '\n==> %s\n' "$*"; }

while [ $# -gt 0 ]; do
    case "$1" in
        --version) [ $# -ge 2 ] || { usage >&2; exit 64; }; VERSION="$2"; shift 2 ;;
        --ref) [ $# -ge 2 ] || { usage >&2; exit 64; }; REF="$2"; shift 2 ;;
        --confirm) [ $# -ge 2 ] || { usage >&2; exit 64; }; CONFIRMS+=("$2"); shift 2 ;;
        -h|--help) usage; exit 0 ;;
        *) echo "publish-tap: unknown argument: $1" >&2; usage >&2; exit 64 ;;
    esac
done

[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "--version must be X.Y.Z, got '$VERSION'"
TAG="v${VERSION}"
TARBALL_URL="https://github.com/${SOURCE_REPO}/archive/refs/tags/${TAG}.tar.gz"

confirmed() {
    local want="$1" c
    for c in "${CONFIRMS[@]+"${CONFIRMS[@]}"}"; do [ "$c" = "$want" ] && return 0; done
    return 1
}

for tool in git gh brew curl shasum tar; do
    command -v "$tool" >/dev/null 2>&1 || die "$tool not found on PATH"
done

REPO_ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
gh auth status >/dev/null 2>&1 || die "gh is not authenticated (gh auth login)"

WORK="$(mktemp -d "${TMPDIR:-/tmp}/ntts-publish-tap.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

# ---------------------------------------------------------------- read-only survey
step "Survey (read-only)"
git -C "$REPO_ROOT" fetch --quiet --tags origin || die "git fetch origin failed"

TAG_EXISTS=false
TAG_COMMIT=""
if git -C "$REPO_ROOT" ls-remote --exit-code --tags origin "refs/tags/${TAG}" >/dev/null 2>&1; then
    TAG_EXISTS=true
    TAG_COMMIT="$(git -C "$REPO_ROOT" rev-parse "refs/tags/${TAG}^{commit}")" \
        || die "tag ${TAG} is on origin but not fetchable locally"
    echo "tag ${TAG}: exists on origin -> ${TAG_COMMIT}"
else
    TAG_COMMIT="$(git -C "$REPO_ROOT" rev-parse --verify "${REF}^{commit}")" \
        || die "--ref '${REF}' does not resolve to a commit"
    # A release tag never points at work that has not landed: pushing it would publish a
    # commit no branch on origin carries.
    git -C "$REPO_ROOT" merge-base --is-ancestor "$TAG_COMMIT" origin/main \
        || die "${REF} (${TAG_COMMIT:0:7}) is not on origin/main; land it first"
    echo "tag ${TAG}: ABSENT on origin; would tag ${REF} = ${TAG_COMMIT}"
fi

# The tagged tree must carry the formula and report the same helper version.
git -C "$REPO_ROOT" cat-file -e "${TAG_COMMIT}:${FORMULA_REL}" 2>/dev/null \
    || die "${FORMULA_REL} is not in ${TAG_COMMIT}; tag a commit that contains the formula"
HELPER_VERSION="$(git -C "$REPO_ROOT" show "${TAG_COMMIT}:${MODELS_REL}" \
    | sed -nE 's/^[[:space:]]*static let version = "([^"]+)"$/\1/p')"
[ "$HELPER_VERSION" = "$VERSION" ] \
    || die "${MODELS_REL} at ${TAG_COMMIT} says version '${HELPER_VERSION}', not '${VERSION}'"
echo "helper version at ${TAG_COMMIT:0:7}: ${HELPER_VERSION}"

TAP_REPO_EXISTS=false
if gh repo view "$TAP_REPO" --json name >/dev/null 2>&1; then
    TAP_REPO_EXISTS=true
    echo "tap repo ${TAP_REPO}: exists"
else
    echo "tap repo ${TAP_REPO}: ABSENT; would create it (public)"
fi

TAP_DIR=""
if brew tap | grep -qx "$TAP_NAME"; then
    TAP_DIR="$(brew --repo "$TAP_NAME")"
    echo "local tap checkout: ${TAP_DIR}"
    [ -z "$(git -C "$TAP_DIR" status --porcelain)" ] \
        || die "local tap checkout ${TAP_DIR} has uncommitted changes; commit or discard them first"
else
    echo "local tap checkout: not tapped; would run: brew tap ${TAP_NAME}"
fi

# ---------------------------------------------------------------- the plan + the gates
NEED=()
step "Plan"
n=1
if [ "$TAG_EXISTS" = false ]; then
    echo "  ${n}. git -C ${REPO_ROOT} tag -a ${TAG} -m 'Natural TTS ${VERSION}' ${TAG_COMMIT}"
    echo "     git -C ${REPO_ROOT} push origin refs/tags/${TAG}"
    echo "     (a pushed tag is public and GitHub serves release tarballs from it)"
    NEED+=("$TAG"); n=$((n + 1))
fi
echo "  ${n}. curl -fsSL ${TARBALL_URL} | shasum -a 256"; n=$((n + 1))
if [ "$TAP_REPO_EXISTS" = false ]; then
    echo "  ${n}. gh repo create ${TAP_REPO} --public --description 'Homebrew tap for renchris formulae'"
    n=$((n + 1))
fi
[ -n "$TAP_DIR" ] || { echo "  ${n}. brew tap ${TAP_NAME}"; n=$((n + 1)); }
echo "  ${n}. write Formula/${FORMULA_NAME}.rb (url ${TARBALL_URL}, real sha256) into the tap checkout"
n=$((n + 1))
echo "  ${n}. brew audit --strict --online ${TAP_NAME}/${FORMULA_NAME}"; n=$((n + 1))
echo "  ${n}. git commit -m '${FORMULA_NAME} ${VERSION}' && git push origin HEAD  (in the tap checkout;"
echo "     the commit is skipped if the formula is already identical; a commit an earlier run"
echo "     could not push is pushed)"
NEED+=("$TAP_REPO")

MISSING=()
for c in "${NEED[@]}"; do confirmed "$c" || MISSING+=("$c"); done
if [ ${#MISSING[@]} -gt 0 ]; then
    echo
    echo "REFUSED: nothing was changed. These steps publish to GitHub and cannot be taken back"
    echo "silently. To run the plan above, pass:"
    args=""; for c in "${NEED[@]}"; do args="${args} --confirm ${c}"; done
    echo "  ${0} --version ${VERSION} --ref ${REF}${args}"
    exit 2
fi

# ---------------------------------------------------------------- 1. tag
if [ "$TAG_EXISTS" = false ]; then
    step "Tagging ${TAG} at ${TAG_COMMIT}"
    git -C "$REPO_ROOT" tag -a "$TAG" -m "Natural TTS ${VERSION}" "$TAG_COMMIT"
    git -C "$REPO_ROOT" push origin "refs/tags/${TAG}"
    git -C "$REPO_ROOT" ls-remote --exit-code --tags origin "refs/tags/${TAG}" >/dev/null \
        || die "tag ${TAG} is not visible on origin after the push"
fi

# ---------------------------------------------------------------- 2. tarball sha256
step "Release tarball"
TARBALL="$WORK/${TAG}.tar.gz"
curl -fsSL --retry 5 --retry-delay 3 --retry-all-errors -o "$TARBALL" "$TARBALL_URL" \
    || die "could not download ${TARBALL_URL}"
tar -tzf "$TARBALL" "natural-text-to-voice-extension-${VERSION}/native-helper/Package.swift" >/dev/null 2>&1 \
    || die "the tarball does not contain natural-text-to-voice-extension-${VERSION}/native-helper/Package.swift"
SHA256="$(shasum -a 256 "$TARBALL" | cut -d' ' -f1)"
[[ "$SHA256" =~ ^[0-9a-f]{64}$ ]] || die "bad sha256 '${SHA256}'"
echo "sha256 ${SHA256}  ${TARBALL_URL}"

# ---------------------------------------------------------------- 3. tap repo + checkout
if [ "$TAP_REPO_EXISTS" = false ]; then
    step "Creating ${TAP_REPO}"
    gh repo create "$TAP_REPO" --public --description "Homebrew tap for renchris formulae" \
        --add-readme
fi
if [ -z "$TAP_DIR" ]; then
    brew tap "$TAP_NAME"
    TAP_DIR="$(brew --repo "$TAP_NAME")"
fi
git -C "$TAP_DIR" pull --ff-only --quiet || die "could not fast-forward ${TAP_DIR}"

# Commits in the tap checkout that origin does not have (an earlier run committed, then its push
# failed). Dies if the checkout and origin have diverged.
unpushed_count() {
    local local_head remote_head
    local_head="$(git -C "$TAP_DIR" rev-parse HEAD)"
    remote_head="$(git -C "$TAP_DIR" ls-remote origin HEAD | cut -f1)" \
        || die "could not read origin HEAD of ${TAP_DIR}"
    if [ -z "$remote_head" ]; then
        git -C "$TAP_DIR" rev-list --count HEAD
    elif [ "$remote_head" = "$local_head" ]; then
        echo 0
    elif git -C "$TAP_DIR" merge-base --is-ancestor "$remote_head" HEAD 2>/dev/null; then
        git -C "$TAP_DIR" rev-list --count "${remote_head}..HEAD"
    else
        die "${TAP_DIR} (${local_head:0:7}) and origin (${remote_head:0:7}) have diverged; reconcile by hand"
    fi
}

push_tap() {
    git -C "$TAP_DIR" push --quiet origin HEAD
    LOCAL_HEAD="$(git -C "$TAP_DIR" rev-parse HEAD)"
    REMOTE_HEAD="$(git -C "$TAP_DIR" ls-remote origin HEAD | cut -f1)"
    [ "$LOCAL_HEAD" = "$REMOTE_HEAD" ] || die "push not visible: local ${LOCAL_HEAD}, origin ${REMOTE_HEAD}"
}

published() {
    step "Published ${TAP_NAME}/${FORMULA_NAME} ${VERSION} (${LOCAL_HEAD:0:7})"
    echo "Users install it with:"
    echo "  brew install ${TAP_NAME}/${FORMULA_NAME} && brew services start ${FORMULA_NAME}"
}

# ---------------------------------------------------------------- 4. formula
step "Writing Formula/${FORMULA_NAME}.rb"
mkdir -p "$TAP_DIR/Formula"
NEW="$WORK/${FORMULA_NAME}.rb"
# From the TAGGED tree: point url at this tag, drop the placeholder note, set the real sha256.
git -C "$REPO_ROOT" show "${TAG_COMMIT}:${FORMULA_REL}" | awk -v url="$TARBALL_URL" -v sha="$SHA256" '
    /^  url "/                  { print "  url \"" url "\""; next }
    /^  # PLACEHOLDER/          { skip = 1 }
    skip && /^  sha256 "/        { skip = 0 }
    skip                        { next }
    /^  sha256 "/               { print "  sha256 \"" sha "\""; next }
    { print }
' > "$NEW"
[ "$(grep -c "^  url \"${TARBALL_URL}\"$" "$NEW")" = 1 ] || die "url line not rewritten exactly once"
[ "$(grep -c "^  sha256 \"${SHA256}\"$" "$NEW")" = 1 ] || die "sha256 line not rewritten exactly once"
grep -q "PLACEHOLDER\|0\{64\}" "$NEW" && die "placeholder text survived in the formula"

TARGET="$TAP_DIR/Formula/${FORMULA_NAME}.rb"
if [ -f "$TARGET" ] && cmp -s "$NEW" "$TARGET"; then
    # Identical in the checkout; the tree is clean, so it is committed. Current only if origin has it.
    UNPUSHED="$(unpushed_count)"
    if [ "$UNPUSHED" = 0 ]; then
        echo "Formula/${FORMULA_NAME}.rb is already current at ${VERSION} (${SHA256:0:12}) on origin; nothing to publish."
        exit 0
    fi
    step "Pushing ${UNPUSHED} tap commit(s) an earlier run could not push"
    push_tap
    published
    exit 0
fi
cp "$NEW" "$TARGET"

# ---------------------------------------------------------------- 5. audit
step "brew audit --strict --online ${TAP_NAME}/${FORMULA_NAME}"
if ! HOMEBREW_NO_AUTO_UPDATE=1 brew audit --strict --online "${TAP_NAME}/${FORMULA_NAME}"; then
    git -C "$TAP_DIR" checkout -- "Formula/${FORMULA_NAME}.rb" 2>/dev/null || rm -f "$TARGET"
    die "brew audit failed; the tap checkout was restored, nothing was pushed"
fi

# ---------------------------------------------------------------- 6. commit + push
step "Commit and push ${TAP_REPO}"
git -C "$TAP_DIR" add "Formula/${FORMULA_NAME}.rb"
[ "$(git -C "$TAP_DIR" diff --cached --name-only)" = "Formula/${FORMULA_NAME}.rb" ] \
    || die "unexpected staged files in ${TAP_DIR}"
if git -C "$TAP_DIR" cat-file -e "HEAD:Formula/${FORMULA_NAME}.rb" 2>/dev/null; then
    MSG="${FORMULA_NAME} ${VERSION}"
else
    MSG="${FORMULA_NAME} ${VERSION} (new formula)"
fi
git -C "$TAP_DIR" commit --quiet -m "$MSG"
push_tap
published
