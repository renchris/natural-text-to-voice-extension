#!/usr/bin/env python3
"""media-budget.py <repo> <media-max-bytes> <loop-max-bytes>: committed media stay inside their byte budgets.

Every tracked image, video, audio file or PDF outside docs/research/ is checked. A loop (any GIF, or a WebP with
an ANIM chunk) must be <= loop-max; everything else <= media-max. Prints one summary line; exit 1 names every
file over budget.
"""

import os
import re
import subprocess
import sys

MEDIA = r"\.(?:png|jpe?g|webp|gif|mp4|mov|webm|wav|mp3|m4a|pdf)$"


def is_loop(path: str) -> bool:
    if path.lower().endswith(".gif"):
        return True
    with open(path, "rb") as fh:
        head = fh.read(64)
    # An animated WebP is RIFF/WEBP with a VP8X chunk whose animation flag (0x02) is set.
    return (
        head[:4] == b"RIFF"
        and head[8:12] == b"WEBP"
        and head[12:16] == b"VP8X"
        and bool(head[20] & 0x02)
    )


def main() -> int:
    repo, media_max, loop_max = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
    tracked = subprocess.run(
        ["git", "-C", repo, "ls-files"], capture_output=True, text=True, check=True
    ).stdout.split("\n")
    bad, count, loops, largest = [], 0, 0, (0, "")
    for rel in tracked:
        if not re.search(MEDIA, rel, re.I) or rel.startswith("docs/research/"):
            continue
        path = os.path.join(repo, rel)
        if not os.path.isfile(path):
            continue
        size = os.path.getsize(path)
        loop = is_loop(path)
        limit = loop_max if loop else media_max
        count += 1
        loops += loop
        largest = max(largest, (size, rel))
        if size > limit:
            bad.append(
                f"{rel} {size / 1048576:.2f} MB > {limit / 1048576:.0f} MB{' (loop)' if loop else ''}"
            )
    if bad:
        print("; ".join(bad))
        return 1
    print(
        f"{count} media files, {loops} loops <= {loop_max / 1048576:.0f} MB, the rest <= {media_max / 1048576:.0f} MB; "
        f"largest {largest[1]} {largest[0] / 1048576:.2f} MB"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
