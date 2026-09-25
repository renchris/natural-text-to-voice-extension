#!/usr/bin/env bash
# Make the README hero a playable GitHub video (with sound), then commit it.
#
#   scripts/release/embed-hero-video.sh [--confirm renchris/natural-text-to-voice-extension] [--push] [--dry-run]
#
# GitHub strips <video> tags from READMEs. The one way to get an inline player with sound is a bare
# github.com/user-attachments/assets/<uuid> URL on its own line, and GitHub mints those only for files
# uploaded to an issue, a pull request or a comment. So this program:
#
#   1. Preflight, no side effects: the natural-text-to-voice-extension checkout, on main, README.md clean,
#      main == origin/main (git ls-remote, nothing fetched), assets/media/hero.mp4 an MP4 <= 10 MB, exactly one
#      "<!-- hero-video -->" line, and the hero block under it in the shape the rewrite expects.
#   2. Consent rides IN the command: without --confirm renchris/natural-text-to-voice-extension it prints the resolved
#      plan (the README diff included) and what cannot be undone, and exits 2 having made no write and no gh call.
#      It never prompts, so it runs under Claude Code's "!" (no keyboard). --dry-run also resolves, read-only through
#      gh, whether an upload is needed, and exits 0 without a write.
#   3. Reuses the URL from an existing issue titled "README media: demo video" (open or closed) when its body carries
#      one; otherwise creates that issue with --attach assets/media/hero.mp4, reads the URL back through a DIFFERENT
#      call (gh issue view --json body), and closes the issue with a comment saying it is closed on purpose.
#      (Reuse is by title, so after re-recording hero.mp4, retitle the old issue first to force a new upload.)
#   4. Rewrites the hero block: the marker line stays, the bare URL goes directly under it, then a caption.
#   5. Verifies by effect: README.md rendered by GitHub (gh api markdown) must contain a <video> for that asset;
#      otherwise README.md is restored and it exits 1.
#   6. Commits README.md alone ("docs(readme): playable hero video"). Pushes only with --push, then reads the live
#      README back from GitHub; without --push it prints the push command.
#
# THE HERO BLOCK, and why the silent preview goes. Before: the marker, then the silent animated WebP preview linked to
# hero.mp4, then a caption paragraph. After: the marker, the URL line, then a caption paragraph of "▶ Press play, then
# unmute." (GitHub's player starts muted), the existing provenance sentences, and a one-line text link to the MP4 for
# renderers that do not expand attachment URLs (editors, mirrors). The preview image is REMOVED rather than kept as a
# fallback: it ends on a "▶ Watch with sound" pill, so under a real player it would be a second, dead play button and
# 2 MB of extra load, and the text link already covers the no-player case. The rewrite touches only the lines from the
# one under the marker to the end of the caption paragraph; every other byte is kept, so `git revert` of the commit it
# makes restores the old hero exactly. It is a no-op whenever an attachment URL is already under the marker: it never
# swaps one video for another (git revert first to re-embed).
#
# WHY mode=gfm: measured 2026-09-24 against a published attachment video, `gh api markdown -f mode=markdown` renders
# the URL as a plain <a>; only mode=gfm with the owning repository as context renders <video>. GitHub also rewrites
# the src to a signed private-user-images URL ending in <n>-<uuid>.mp4, so the check matches the asset's uuid.
#
# Test mode: NTTS_EMBED_TEST_URL=<a user-attachments URL> NTTS_EMBED_README=<a COPY of README.md> runs the local
# rewrite and its checks on the copy and nothing else: no git, no gh, no network, no commit.
#
# Exit: 0 embedded, already embedded, or a dry run · 1 a check failed · 2 refused (no or wrong --confirm; nothing
#       changed) · 64 bad usage.

set -euo pipefail

SOURCE_REPO="renchris/natural-text-to-voice-extension"
ORIGIN_URLS="https://github.com/${SOURCE_REPO}.git https://github.com/${SOURCE_REPO} git@github.com:${SOURCE_REPO}.git"
MARKER='<!-- hero-video -->'
ISSUE_TITLE="README media: demo video"
VIDEO_REL="assets/media/hero.mp4"
VIDEO_MAX_BYTES=10000000         # GitHub's attachment limit for video is 10 MB
GH_MIN_MAJOR=2 GH_MIN_MINOR=99   # gh issue create --attach
COMMIT_SUBJECT="docs(readme): playable hero video"
URL_RE='https://github\.com/user-attachments/assets/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
PLACEHOLDER_URL="https://github.com/user-attachments/assets/<uuid-of-the-uploaded-hero.mp4>"

CONFIRM=""
DRY_RUN=false
PUSH=false
usage() { sed -n '2,4p' "$0" | sed 's/^# \{0,1\}//'; echo "Details: the comment at the top of $0"; }
die() { echo "embed-hero-video: FAIL: $*" >&2; exit 1; }
say() { printf '  %s\n' "$*"; }

while [ $# -gt 0 ]; do
    case "$1" in
        --confirm) [ $# -ge 2 ] || { usage >&2; exit 64; }; CONFIRM="$2"; shift 2 ;;
        --dry-run) DRY_RUN=true; shift ;;
        --push) PUSH=true; shift ;;
        -h|--help) usage; exit 0 ;;
        *) echo "embed-hero-video: unknown argument: $1" >&2; usage >&2; exit 64 ;;
    esac
done

TEST_URL="${NTTS_EMBED_TEST_URL:-}"
TEST_MODE=false
if [ -n "$TEST_URL" ]; then
    TEST_MODE=true
    [[ "$TEST_URL" =~ ^${URL_RE}$ ]] || { echo "embed-hero-video: NTTS_EMBED_TEST_URL is not a user-attachments URL" >&2; exit 64; }
    [ -n "${NTTS_EMBED_README:-}" ] || { echo "embed-hero-video: test mode rewrites a COPY: set NTTS_EMBED_README" >&2; exit 64; }
    [ "$PUSH" = false ] || { echo "embed-hero-video: --push is meaningless in test mode" >&2; exit 64; }
fi

REPO="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
README="${NTTS_EMBED_README:-$REPO/README.md}"
VIDEO="$REPO/$VIDEO_REL"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/ntts-embed.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

# ------------------------------------------------------------------------------ the rewrite (pure, local)
# rewrite <in> <url> <out>: writes the rewritten README to <out>.
# Exit 0 rewritten (stdout: "lines A-B"), 3 the URL line is already there, 4 a different attachment URL is there,
# 1 the hero block is not in the expected shape (stderr says why).
rewrite() {
    perl -e '
        use strict; use warnings;
        my ($in, $url, $out) = @ARGV;
        sub fail { print STDERR "$_[0]\n"; exit 1 }
        open(my $fh, "<:raw", $in) or fail("cannot read $in");
        my $s = do { local $/; <$fh> }; close $fh;
        my @l = split /\n/, $s, -1;
        my @m = grep { $l[$_] eq "<!-- hero-video -->" } 0 .. $#l;
        @m == 1 or fail("expected exactly one <!-- hero-video --> line, found " . scalar(@m));
        my $i = $m[0];
        my $next = defined $l[$i + 1] ? $l[$i + 1] : "";
        (my $trimmed = $next) =~ s/\s+$//;
        if ($trimmed =~ m{^https://github\.com/user-attachments/assets/[0-9a-f-]{36}$}) {
            if ($trimmed eq $url) { print "$trimmed\n"; exit 3 }
            print "$trimmed\n"; exit 4;
        }
        # The hero media: every non-blank line directly under the marker.
        my $a = $i + 1; my $b = $a;
        $b++ while $b <= $#l && $l[$b] =~ /\S/;
        $b > $a or fail("the line under the marker is blank; expected the hero media block");
        my $media = join "\n", @l[$a .. $b - 1];
        $media =~ m{assets/media/hero} or fail("the block under the marker does not reference assets/media/hero*; refusing to guess what it is");
        # The caption: the next blank-line-separated block, which must carry the provenance.
        my $c = $b; $c++ while $c <= $#l && $l[$c] !~ /\S/;
        my $d = $c; $d++ while $d <= $#l && $l[$d] =~ /\S/;
        $c <= $#l or fail("nothing follows the hero media; expected its caption");
        my $cap = join "\n", @l[$c .. $d - 1];
        $cap !~ /^\s*(#|<details|<!--)/ or fail("the block after the hero media is not a caption (it starts: " . substr($l[$c], 0, 40) . ")");
        # Provenance = what the recording is: a voice id (af_heart) and a helper version. The wording around it is
        # owned by the README lane, so the check keys on those facts, never on a fixed phrase.
        my $prov = qr/\b[a-z]{2}_[a-z]+\b.*\bhelper\s+\d+\.\d+|\bhelper\s+\d+\.\d+.*\b[a-z]{2}_[a-z]+\b/s;
        $cap =~ $prov or fail("the caption under the hero media has no provenance sentence (a voice id such as af_heart and \"helper <version>\")");
        my $t = $cap =~ m{<sub>(.*?)</sub>}s ? $1 : $cap;
        $t =~ s{<[^>]+>}{}g; $t =~ s/\s+/ /g; $t =~ s/^\s+//; $t =~ s/\s+$//;
        my @keep;
        for my $sentence (split /(?<=\.)\s+(?=[A-Z])/, $t) {
            my @clauses = grep { !/preview|press play|unmute|watch with sound|click to watch/i } split /;\s*/, $sentence;
            next unless @clauses;
            my $x = join "; ", @clauses; $x =~ s/[.;,\s]+$//; push @keep, "$x.";
        }
        @keep && join(" ", @keep) =~ $prov or fail("could not isolate the provenance sentence from the caption");
        my @new = (
            $url,
            "",
            "<p align=\"center\">",
            "  <b>\x{e2}\x{96}\x{b6} Press play, then unmute.</b><br>",
            "  <sub>" . join(" ", @keep) . " No player here? Open <a href=\"assets/media/hero.mp4\">the MP4 with sound</a>.</sub>",
            "</p>",
        );
        my @o = (@l[0 .. $i], @new, @l[$d .. $#l]);
        open(my $oh, ">:raw", $out) or fail("cannot write $out");
        print $oh join("\n", @o); close $oh or fail("cannot write $out");
        printf "lines %d-%d\n", $a + 1, $d;
        exit 0;
    ' "$1" "$2" "$3"
}

# check_rewritten <file> <url>: the marker once, the URL line directly under it, nothing else carries the URL.
check_rewritten() {
    local f="$1" url="$2" n
    [ "$(grep -cxF "$MARKER" "$f")" = 1 ] || die "after the rewrite, the marker is not on exactly one line"
    n="$(grep -nxF "$MARKER" "$f" | cut -d: -f1)"
    [ "$(sed -n "$((n + 1))p" "$f")" = "$url" ] || die "after the rewrite, the line under the marker is not the URL"
    [ "$(grep -cF "$url" "$f")" = 1 ] || die "after the rewrite, the URL appears more than once"
    if ! grep -qx '## Install' "$f" || ! grep -qx '### Updating a helper installed from source' "$f"; then
        die "after the rewrite, a heading the extension links to is missing"
    fi
}

# ------------------------------------------------------------------------------ 1. preflight (no side effects)
echo "embed-hero-video: preflight"
[ -f "$README" ] || die "no README at ${README}"
[ "$(grep -cxF "$MARKER" "$README")" = 1 ] \
    || die "README.md must have exactly one line '${MARKER}' (found $(grep -cxF "$MARKER" "$README"))"
[ "$(grep -cF 'hero-video -->' "$README")" = 1 ] || die "README.md mentions the marker outside its own line"

if [ "$TEST_MODE" = false ]; then
    ORIGIN_URL="$(git -C "$REPO" config --get remote.origin.url || true)"
    case " $ORIGIN_URLS " in
        *" $ORIGIN_URL "*) ;;
        *) die "origin is '${ORIGIN_URL}', not ${SOURCE_REPO}; run this from the real checkout" ;;
    esac
    BRANCH="$(git -C "$REPO" symbolic-ref --quiet --short HEAD || echo DETACHED)"
    [ "$BRANCH" = main ] || die "on '${BRANCH}', not main (git -C ${REPO} switch main)"
    [ -z "$(git -C "$REPO" status --porcelain -- README.md)" ] || die "README.md has uncommitted changes; commit or stash them"
    HEAD_SHA="$(git -C "$REPO" rev-parse HEAD)"
    REMOTE_SHA="$(git -C "$REPO" ls-remote --exit-code origin refs/heads/main | cut -f1)" \
        || die "could not read origin's main (git ls-remote)"
    if [ "$HEAD_SHA" != "$REMOTE_SHA" ]; then
        if git -C "$REPO" merge-base --is-ancestor "$REMOTE_SHA" "$HEAD_SHA" 2>/dev/null; then
            die "main ${HEAD_SHA:0:7} is ahead of origin/main ${REMOTE_SHA:0:7}; push it first: git -C ${REPO} push origin HEAD:main"
        fi
        die "main ${HEAD_SHA:0:7} is not origin/main ${REMOTE_SHA:0:7}; git -C ${REPO} pull --ff-only"
    fi
    say "checkout ${REPO}, main = origin/main = ${HEAD_SHA:0:12}, README.md clean"
fi

[ -f "$VIDEO" ] || die "missing ${VIDEO_REL}"
VIDEO_BYTES="$(wc -c < "$VIDEO" | tr -d ' ')"
[ "$VIDEO_BYTES" -le "$VIDEO_MAX_BYTES" ] || die "${VIDEO_REL} is ${VIDEO_BYTES} bytes; GitHub attaches video only up to 10 MB"
[ "$(head -c 8 "$VIDEO" | tail -c 4)" = ftyp ] || die "${VIDEO_REL} is not an MP4 (no ftyp box)"
say "${VIDEO_REL}: ${VIDEO_BYTES} bytes, MP4"

# The shape check: rewrite into a scratch file with a placeholder URL. 3 or 4 mean a URL line is already there.
set +e
EXISTING="$(rewrite "$README" "${TEST_URL:-$PLACEHOLDER_URL}" "$WORK/plan.md" 2> "$WORK/rewrite.err")"
RW=$?
set -e
case "$RW" in
    0) RANGE="$EXISTING"; say "hero block: README.md ${RANGE} (the silent preview and its caption) will be replaced" ;;
    3|4) # Already embedded. Any attachment URL under the marker counts: this never swaps one video for another.
       echo "embed-hero-video: CURRENT: README.md already carries ${EXISTING} under the marker; nothing to do"
       exit 0 ;;
    *) die "the hero block is not in the shape this program rewrites: $(cat "$WORK/rewrite.err")" ;;
esac

# ------------------------------------------------------------------------------ 2. consent (in the command)
plan() {
    echo
    echo "PLAN for ${SOURCE_REPO}:"
    say "1. Look for an issue titled \"${ISSUE_TITLE}\" (open or closed) whose body carries a user-attachments URL; reuse it."
    say "2. Otherwise:  gh issue create -R ${SOURCE_REPO} --title \"${ISSUE_TITLE}\" --body-file <why this issue exists> --attach ${VIDEO_REL}"
    say "   then read the URL back with  gh issue view <n> -R ${SOURCE_REPO} --json body"
    say "   and close it:  gh issue close <n> -R ${SOURCE_REPO} --reason \"not planned\" --comment <closed on purpose, do not delete>"
    say "3. README.md ${RANGE}: replaced as below (<uuid...> is the uploaded asset)"
    say "4. Verify: gh api markdown -f mode=gfm -f context=${SOURCE_REPO} -F text=@README.md must render a <video> for it;"
    say "   otherwise README.md is restored and this exits 1"
    say "5. git commit -m \"${COMMIT_SUBJECT}\" -- README.md$([ "$PUSH" = true ] && echo ", then git push origin HEAD:main and read the live README back" || echo "   (push only with --push)")"
    echo
    diff -u "$README" "$WORK/plan.md" | sed '1,2d; s/^/    /' || true
    echo
    say "Cannot be undone: a PUBLIC issue on ${SOURCE_REPO} hosts the video. Deleting that issue later removes the README video."
    say "(The README change itself is one commit; git revert restores the silent preview.)"
}

if [ "$DRY_RUN" = false ] && [ "$CONFIRM" != "$SOURCE_REPO" ]; then
    if [ -n "$CONFIRM" ]; then echo "embed-hero-video: --confirm '${CONFIRM}' is not ${SOURCE_REPO}; nothing was changed"
    else echo "embed-hero-video: REFUSED: nothing was changed"; fi
    plan
    echo
    echo "Runs only with:  $0 --confirm ${SOURCE_REPO}$([ "$PUSH" = true ] && echo " --push")"
    exit 2
fi

# ------------------------------------------------------------------------------ test mode: the copy, nothing else
if [ "$TEST_MODE" = true ]; then
    [ "$DRY_RUN" = false ] || { plan; echo; echo "embed-hero-video: DRY RUN (test mode): nothing was changed"; exit 0; }
    cp "$WORK/plan.md" "$README"
    check_rewritten "$README" "$TEST_URL"
    echo "embed-hero-video: TEST: rewrote ${README} (${RANGE}) with ${TEST_URL}; no git, no gh, no network"
    exit 0
fi

# ------------------------------------------------------------------------------ gh preflight (read-only)
command -v gh >/dev/null 2>&1 || die "gh not found on PATH"
GH_VER="$(gh --version | sed -nE '1s/^gh version ([0-9]+)\.([0-9]+).*/\1 \2/p')"
read -r GH_MAJOR GH_MINOR <<< "${GH_VER:-0 0}"
{ [ "$GH_MAJOR" -gt "$GH_MIN_MAJOR" ] || { [ "$GH_MAJOR" -eq "$GH_MIN_MAJOR" ] && [ "$GH_MINOR" -ge "$GH_MIN_MINOR" ]; }; } \
    || die "gh ${GH_MAJOR}.${GH_MINOR} is too old; ${GH_MIN_MAJOR}.${GH_MIN_MINOR}+ has 'gh issue create --attach' (brew upgrade gh)"
gh issue create --help 2>/dev/null | grep -q -- '--attach' || die "this gh has no 'gh issue create --attach'"
gh auth status >/dev/null 2>&1 || die "gh is not signed in (gh auth login)"
say "gh ${GH_MAJOR}.${GH_MINOR}, signed in"

# ------------------------------------------------------------------------------ 3. reuse an existing upload
url_in_body() { { grep -oE "$URL_RE" || true; } | sort -u; }
URL=""
ISSUE=""
CANDIDATES="$(gh issue list -R "$SOURCE_REPO" --state all --limit 1000 --json number,title \
    --jq "map(select(.title == \"${ISSUE_TITLE}\")) | sort_by(.number) | .[].number")" \
    || die "could not list issues on ${SOURCE_REPO}"
for n in $CANDIDATES; do
    found="$(gh issue view "$n" -R "$SOURCE_REPO" --json body --jq .body | url_in_body)" \
        || die "could not read issue #${n}"
    [ -n "$found" ] || { say "issue #${n} has the title but no attachment URL (a failed upload?); not reused"; continue; }
    [ "$(printf '%s\n' "$found" | wc -l | tr -d ' ')" = 1 ] || die "issue #${n} carries more than one attachment URL; resolve it by hand"
    URL="$found"; ISSUE="$n"; break
done

if [ "$DRY_RUN" = true ]; then
    if [ -n "$URL" ]; then say "would REUSE ${URL} from issue #${ISSUE} (no upload)"
    else say "would UPLOAD: no issue titled \"${ISSUE_TITLE}\" carries an attachment URL"; fi
    plan
    echo
    echo "embed-hero-video: DRY RUN: nothing was changed"
    exit 0
fi

# ------------------------------------------------------------------------------ 4. upload (the public, gated write)
if [ -n "$URL" ]; then
    say "reusing ${URL} from issue #${ISSUE}"
else
    cat > "$WORK/issue-body.md" <<EOF
This issue hosts the demo video at the top of the [README](https://github.com/${SOURCE_REPO}#readme), under its \`<!-- hero-video -->\` line. GitHub plays a README video only from an attachment like the one below, so the README links to this upload.

**Do not delete this issue:** deleting it removes the video from the README. It is closed on purpose; nothing here needs doing. Made by \`scripts/release/embed-hero-video.sh\`.
EOF
    set +e
    CREATED="$(gh issue create -R "$SOURCE_REPO" --title "$ISSUE_TITLE" --body-file "$WORK/issue-body.md" --attach "$VIDEO")"
    CREATE_STATUS=$?
    set -e
    ISSUE="$(printf '%s\n' "$CREATED" | sed -nE "s#^https://github\.com/${SOURCE_REPO}/issues/([0-9]+)\$#\1#p" | tail -n 1)"
    [ -n "$ISSUE" ] || die "gh issue create exited ${CREATE_STATUS} and printed no issue URL: ${CREATED}"
    [ "$CREATE_STATUS" -eq 0 ] || echo "embed-hero-video: gh issue create exited ${CREATE_STATUS} (an attachment failed?); checking issue #${ISSUE}" >&2
    # Read back through a different call than the one that created it.
    URL="$(gh issue view "$ISSUE" -R "$SOURCE_REPO" --json body --jq .body | url_in_body)" \
        || die "could not read issue #${ISSUE} back"
    [ -n "$URL" ] || die "issue #${ISSUE} was created but its body carries no user-attachments URL; the upload failed. Delete it (gh issue delete ${ISSUE} -R ${SOURCE_REPO}) and rerun"
    [ "$(printf '%s\n' "$URL" | wc -l | tr -d ' ')" = 1 ] || die "issue #${ISSUE} carries more than one attachment URL"
    say "uploaded: ${URL} (issue #${ISSUE})"
fi
if [ "$(gh issue view "$ISSUE" -R "$SOURCE_REPO" --json state --jq .state)" != CLOSED ]; then
    gh issue close "$ISSUE" -R "$SOURCE_REPO" --reason "not planned" --comment \
        "Closed on purpose: this issue only hosts the README's demo video (scripts/release/embed-hero-video.sh). Do not delete it; that would remove the video from the README." >/dev/null
    [ "$(gh issue view "$ISSUE" -R "$SOURCE_REPO" --json state --jq .state)" = CLOSED ] || die "issue #${ISSUE} did not close"
    say "closed issue #${ISSUE} with a comment saying it is closed on purpose"
fi

# ------------------------------------------------------------------------------ 5. rewrite README.md
set +e
rewrite "$README" "$URL" "$WORK/README.new" > "$WORK/rewrite.out" 2> "$WORK/rewrite.err"
RW=$?
set -e
case "$RW" in
    0) ;;
    3) echo "embed-hero-video: CURRENT: README.md already carries ${URL}"; exit 0 ;;
    *) die "rewrite failed ($RW): $(cat "$WORK/rewrite.err" "$WORK/rewrite.out")" ;;
esac
check_rewritten "$WORK/README.new" "$URL"
cp "$WORK/README.new" "$README"
restore() { git -C "$REPO" checkout -- README.md; }

# ------------------------------------------------------------------------------ 6. verify by effect, commit, push
UUID="${URL##*/}"
has_video() { grep -oE '<video[^>]*>' | grep -qF "$UUID"; }
if ! gh api markdown -f mode=gfm -f context="$SOURCE_REPO" -F text=@"$README" > "$WORK/rendered.html" 2> "$WORK/render.err"; then
    restore; die "gh api markdown failed ($(cat "$WORK/render.err")); README.md restored"
fi
if ! has_video < "$WORK/rendered.html"; then
    restore
    KEPT="${TMPDIR:-/tmp}/ntts-embed-rendered.html"
    cp "$WORK/rendered.html" "$KEPT"
    die "GitHub renders README.md with no <video> for ${UUID}; README.md restored. The rendered HTML: ${KEPT}"
fi
say "verified: GitHub renders README.md with a <video> for ${UUID}"

git -C "$REPO" diff --stat -- README.md | sed 's/^/  /'
git -C "$REPO" add -- README.md
git -C "$REPO" commit --quiet -m "$COMMIT_SUBJECT" -m "The hero is now GitHub's inline player for ${URL} (hosted by issue #${ISSUE}, closed on purpose; deleting it removes the video). Made by scripts/release/embed-hero-video.sh; git revert restores the silent preview." -- README.md
COMMIT="$(git -C "$REPO" rev-parse HEAD)"
[ "$(git -C "$REPO" diff-tree --no-commit-id --name-only -r "$COMMIT")" = README.md ] || die "commit ${COMMIT:0:7} touches more than README.md"
say "committed ${COMMIT:0:12} ${COMMIT_SUBJECT}"

if [ "$PUSH" = false ]; then
    echo "embed-hero-video: DONE (committed, not pushed). To publish it:"
    echo "  git -C ${REPO} push origin HEAD:main"
    exit 0
fi
git -C "$REPO" push origin HEAD:main
[ "$(git -C "$REPO" ls-remote --exit-code origin refs/heads/main | cut -f1)" = "$COMMIT" ] \
    || die "origin/main is not ${COMMIT:0:7} after the push"
say "pushed: origin/main = ${COMMIT:0:12}"
# The live README, read back from GitHub (a different surface than the render above). GitHub may lag a few seconds.
LIVE_OK=false
for _ in 1 2 3 4 5 6; do
    if gh api "repos/${SOURCE_REPO}/readme" -H 'Accept: application/vnd.github.html' 2>/dev/null | has_video; then LIVE_OK=true; break; fi
    sleep 5
done
[ "$LIVE_OK" = true ] || die "pushed, but GitHub's README for ${SOURCE_REPO} shows no <video> for ${UUID} after 30 s; open https://github.com/${SOURCE_REPO}#readme"
say "live: https://github.com/${SOURCE_REPO}#readme plays the hero video"
echo "embed-hero-video: DONE (committed and pushed)"
