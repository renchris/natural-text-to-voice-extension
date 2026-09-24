#!/usr/bin/env python3
"""store-images.py <repo>: every image under assets/store/ has the size its README documents.

Reads the Markdown tables in assets/store/README.md that have "File" and "Size" columns: a row whose File cell
is one backticked image path (relative to assets/store/) and whose Size cell is "W×H" documents that file. Then,
for every tracked image under assets/store/ and every documented image:

  - a tracked image with no documented size fails;
  - a documented image that is missing fails, unless its row says "Waiting for the GUI pass";
  - an image whose size differs, or which is not 3-channel sRGB (alpha, grey), fails.

Prints one summary line; exit 1 names every failure.
"""

import os
import re
import subprocess
import sys

IMAGE = r"\.(?:png|jpe?g|webp|gif)$"


def main() -> int:
    repo = sys.argv[1]
    store = os.path.join(repo, "assets", "store")
    documented, waiting = {}, set()
    header: list[str] = []
    with open(os.path.join(store, "README.md"), encoding="utf-8") as fh:
        for line in fh:
            if not line.startswith("|"):
                header = []
                continue
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            if not header:
                header = [c.lower() for c in cells]
                continue
            if "file" not in header or "size" not in header or len(cells) != len(header):
                continue
            name = re.fullmatch(r"`([^`]+)`", cells[header.index("file")])
            size = re.fullmatch(r"(\d+)×(\d+)", cells[header.index("size")])
            if not name or not size or not re.search(IMAGE, name.group(1)):
                continue
            path = os.path.normpath(os.path.join(store, name.group(1)))
            documented[path] = (int(size.group(1)), int(size.group(2)))
            if "Waiting for the GUI pass" in line:
                waiting.add(path)

    tracked = subprocess.run(
        ["git", "-C", repo, "ls-files", "assets/store"],
        capture_output=True,
        text=True,
        check=True,
    ).stdout.split("\n")
    bad, absent, ok = [], [], 0
    for rel in tracked:
        if re.search(IMAGE, rel) and os.path.join(repo, rel) not in documented:
            bad.append(f"{rel}: no documented size in assets/store/README.md")
    for path, (w, h) in sorted(documented.items()):
        rel = os.path.relpath(path, repo)
        if not os.path.exists(path):
            if path in waiting:
                absent.append(os.path.basename(path))
            else:
                bad.append(f"{rel}: documented but missing")
            continue
        got = (
            subprocess.run(
                ["magick", "identify", "-format", "%w %h %[channels]\n", path],
                capture_output=True,
                text=True,
            )
            .stdout.split("\n")[0]
            .split()
        )
        if got[:2] != [str(w), str(h)]:
            bad.append(f"{rel}: {'x'.join(got[:2]) or '?'}, want {w}x{h}")
        elif got[2:3] != ["srgb"]:
            bad.append(
                f"{rel}: channels {' '.join(got[2:]) or '?'}, want srgb (no alpha)"
            )
        else:
            ok += 1
    if bad:
        print("; ".join(bad))
        return 1
    note = f"; waiting for the GUI pass: {', '.join(absent)}" if absent else ""
    print(f"{ok} images at their documented size, sRGB, no alpha{note}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
