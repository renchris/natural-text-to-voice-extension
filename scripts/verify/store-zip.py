#!/usr/bin/env python3
"""store-zip.py <zip> <version>: the Chrome Web Store upload is well-formed.

manifest.json at the zip root, every entry passes its CRC, no "key" in the manifest, and the manifest version is
<version>. Prints one summary line; exit 1 with the reason otherwise.
"""

import json
import sys
import zipfile


def main() -> int:
    path, version = sys.argv[1], sys.argv[2]
    if not zipfile.is_zipfile(path):
        print(f"{path} is not a zip file")
        return 1
    with zipfile.ZipFile(path) as z:
        names = z.namelist()
        if "manifest.json" not in names:
            print("no manifest.json at the zip root")
            return 1
        broken = z.testzip()
        if broken is not None:
            print(f"{broken} fails its CRC")
            return 1
        manifest = json.loads(z.read("manifest.json"))
    if "key" in manifest:
        print('the manifest has a "key" (the store assigns the ID)')
        return 1
    if manifest.get("version") != version:
        print(f"manifest version {manifest.get('version')}, want {version}")
        return 1
    print(f"{len(names)} entries, manifest.json at root, no key, version {version}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
