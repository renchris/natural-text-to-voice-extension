# Third-party notices

Natural TTS is released under the MIT License (see [`LICENSE`](LICENSE)). It depends on the third-party
components below. Every licence was checked against the component's primary source on 2026-09-23; the URL in each row
is that source.

## What this repository redistributes, and what it does not

This repository ships **source code only**: the Chrome extension's TypeScript, the helper's Swift, the Python worker
script and the setup scripts. It contains **no third-party binaries, model weights or Python packages**.

- The **Python environment** (`native-helper/Sources/NaturalTTSHelper/Resources/python-env`) is gitignored. It is
  created on the user's own Mac by `native-helper/Scripts/setup-python-env.sh`, which downloads every Python package
  in the tables below from PyPI (and the spaCy model from GitHub) into the user's own environment.
- The **Kokoro-82M weights and voice files** are downloaded by the same script from Hugging Face into the user's own
  Hugging Face cache (`~/.cache/huggingface`). They are not in this repository.
- **espeak-ng** reaches the user's Mac by two routes, and this repository redistributes neither:
  1. **Homebrew** (`brew install espeak-ng`), installed separately by the user. The helper points the worker at its
     data directory (`ESPEAK_DATA_PATH=/opt/homebrew/opt/espeak-ng/share/espeak-ng-data`).
  2. The **`espeakng-loader` wheel**, which `setup-python-env.sh` installs from PyPI. That wheel bundles a prebuilt
     `libespeak-ng` 1.52.0 shared library and its data files. `phonemizer-fork` loads it at runtime as a separate
     dynamic library (`ctypes`); nothing in this repository links against it or copies it.
- The **Swift packages** are fetched by SwiftPM when the user builds the helper and are statically linked into the
  `natural-tts-helper` binary the user builds locally. This repository does not ship that binary.
- The **Homebrew formula** (`packaging/homebrew/Formula/natural-tts.rb`, the primary install path) does the same on
  the user's Mac: it builds the helper, runs `uv sync --frozen` into the keg's `libexec/python-env`, and fetches the
  pinned model into `libexec/hf-cache`. No prebuilt bottle of the formula is published, so nothing is redistributed.
- **Bun, TypeScript and the npm dev-dependencies** are build and test tools only. The built extension (`dist/`)
  contains no third-party code: `chrome-extension/package.json` has no runtime `dependencies`.

**The GPL and LGPL components** (espeak-ng, `phonemizer-fork`, `num2words`, libsndfile) are therefore installed by
`setup-python-env.sh` into the user's own environment and are **not redistributed** by this repository. If a future
release distributes a prebuilt helper bundle that contains `python-env` (for example a notarized `.app`), that bundle
*would* redistribute them, and the GPL-3.0 and LGPL-2.1 source-offer and notice obligations would then apply to it.
This file must be revisited before any such release.

## Model

| Component | Used as | Licence | Primary source |
|---|---|---|---|
| Kokoro-82M (hexgrad) | Speech model: weights + 54 voice style vectors | Apache-2.0 | <https://huggingface.co/hexgrad/Kokoro-82M> (model card `license: apache-2.0`) |
| Kokoro-82M MLX conversion (prince-canuma) | The exact weights the helper loads (`prince-canuma/Kokoro-82M`) | Apache-2.0 | <https://huggingface.co/prince-canuma/Kokoro-82M> (model card `license: apache-2.0`) |

## Helper runtime: Python packages declared by the helper

Versions are the exact pins in `native-helper/python/pyproject.toml` (IN-01).

| Component | Version | Licence | Primary source |
|---|---|---|---|
| MLX (`mlx`, `mlx-metal`) — Apple | 0.32.2 | MIT | <https://github.com/ml-explore/mlx/blob/main/LICENSE> |
| mlx-audio — Prince Canuma | 0.5.5 | MIT | <https://github.com/Blaizzy/mlx-audio/blob/main/LICENSE> |
| misaki (G2P) — hexgrad | 0.9.4 | Apache-2.0 | <https://github.com/hexgrad/misaki/blob/main/LICENSE> |
| spaCy — ExplosionAI | 3.8.16 | MIT | <https://github.com/explosion/spaCy/blob/master/LICENSE> |
| en_core_web_sm (spaCy English model) | 3.8.0 | MIT | <https://github.com/explosion/spacy-models/blob/master/meta/en_core_web_sm-3.8.0.json> (`"license": "MIT"`; its training-data sources are listed in the same file) |
| phonemizer-fork | 3.3.2 | GPL-3.0-or-later | <https://pypi.org/project/phonemizer-fork/3.3.2/> (classifier "GNU General Public License v3 or later (GPLv3+)"; upstream <https://github.com/bootphon/phonemizer>) |
| espeakng-loader (loader code) | 0.2.4 | MIT | <https://github.com/thewh1teagle/espeakng-loader/blob/main/LICENSE> |
| └ libespeak-ng + espeak-ng-data, bundled inside the espeakng-loader wheel | 1.52.0 | GPL-3.0-or-later | <https://github.com/espeak-ng/espeak-ng/blob/master/COPYING>, README "License Information" |
| num2words | 0.5.14 | LGPL-2.1-or-later | <https://github.com/savoirfairelinux/num2words/blob/master/COPYING> (source headers: "version 2.1 … or (at your option) any later version") |
| soundfile (python-soundfile) | 0.14.0 | BSD-3-Clause | <https://github.com/bastibe/python-soundfile/blob/master/LICENSE> |
| └ libsndfile, bundled inside the soundfile wheel (`_soundfile_data/libsndfile_arm64.dylib`) | — | LGPL-2.1-or-later | <https://github.com/libsndfile/libsndfile/blob/master/COPYING> |
| sounddevice (dependency of mlx-audio) | 0.5.6 | MIT | <https://github.com/spatialaudio/python-sounddevice/blob/master/LICENSE> |
| └ PortAudio, bundled inside the sounddevice wheel | — | MIT-style (PortAudio licence) | <https://github.com/PortAudio/portaudio/blob/master/LICENSE.txt> |

## Helper runtime: system component installed separately

| Component | Version | Licence | Primary source |
|---|---|---|---|
| espeak-ng (Homebrew) | 1.52.0 | GPL-3.0-or-later | <https://github.com/espeak-ng/espeak-ng/blob/master/COPYING> |

## Helper runtime: Swift packages (statically linked into the locally built helper)

| Component | Licence | Primary source |
|---|---|---|
| SwiftNIO (`swift-nio`) | Apache-2.0 | <https://github.com/apple/swift-nio/blob/main/LICENSE.txt>, NOTICE: <https://github.com/apple/swift-nio/blob/main/NOTICE.txt> |
| SwiftLog (`swift-log`) | Apache-2.0 | <https://github.com/apple/swift-log/blob/main/LICENSE.txt> |
| swift-atomics (via SwiftNIO) | Apache-2.0 with Runtime Library Exception | <https://github.com/apple/swift-atomics/blob/main/LICENSE.txt> |
| swift-collections (via SwiftNIO) | Apache-2.0 with Runtime Library Exception | <https://github.com/apple/swift-collections/blob/main/LICENSE.txt> |
| swift-system (via SwiftNIO) | Apache-2.0 with Runtime Library Exception | <https://github.com/apple/swift-system/blob/main/LICENSE.txt> |

## Build and test tools only (never shipped in `dist/`)

| Component | Licence | Primary source |
|---|---|---|
| Bun | MIT (Bun itself; statically links JavaScriptCore/WebKit under LGPL-2 and other libraries listed in its licence file) | <https://github.com/oven-sh/bun/blob/main/LICENSE.md> |
| TypeScript, `@types/*`, happy-dom, `@testing-library/dom` | see each package's `LICENSE` under `chrome-extension/node_modules/` | npm registry entries for each package |

## Appendix: transitive Python packages

The complete, authoritative list of what `setup-python-env.sh` installs is `native-helper/python/uv.lock`. The table
below is the licence each transitive package declares in its own installed metadata (`License-Expression`, else its
`License ::` classifiers), read from an environment resolved at the same pins (mlx 0.32.2, mlx-audio 0.5.5, misaki
0.9.4, spaCy 3.8.16) on 2026-09-23. `transformers` is a declared dependency of mlx-audio but is never imported on the
Kokoro path. `scipy` ships the GCC runtime libraries (`libgfortran`, `libquadmath`, `libgcc_s`), which are GPL-3.0
with the GCC Runtime Library Exception.

To regenerate it against the locked environment:

```bash
native-helper/Sources/NaturalTTSHelper/Resources/python-env/bin/python3 -c "import importlib.metadata as m; [print(d.metadata['Name'], d.version, d.metadata.get('License-Expression') or [c for c in (d.metadata.get_all('Classifier') or []) if c.startswith('License')]) for d in m.distributions()]"
```

| Package | Version | Declared licence |
|---|---|---|
| addict | 2.4.0 | MIT |
| annotated-doc | 0.0.5 | MIT |
| annotated-types | 0.8.0 | MIT |
| anyio | 4.15.1 | MIT |
| attrs | 26.1.0 | MIT |
| babel | 2.18.0 | BSD (variant not stated in metadata) |
| blis | 1.3.3 | BSD (variant not stated in metadata) |
| catalogue | 2.0.10 | MIT |
| certifi | 2026.7.22 | MPL-2.0 |
| cffi | 2.1.1 | MIT-0 |
| charset-normalizer | 3.5.1 | MIT |
| click | 8.5.0 | BSD-3-Clause |
| cloudpathlib | 0.25.0 | MIT |
| cloudpickle | 3.1.2 | BSD (variant not stated in metadata) |
| confection | 1.3.3 | MIT |
| csvw | 4.1.0 | Apache-2.0 |
| cymem | 2.0.13 | MIT |
| dlinfo | 2.0.0 | MIT |
| docopt | 0.6.2 | MIT |
| filelock | 4.0.1 | MIT |
| fsspec | 2026.9.0 | BSD-3-Clause |
| h11 | 0.16.0 | MIT |
| hf-xet | 1.6.0 | Apache-2.0 |
| httpcore | 1.0.9 | BSD-3-Clause |
| httpx | 0.28.1 | BSD (variant not stated in metadata) |
| huggingface_hub | 1.32.0 | Apache-2.0 |
| idna | 3.20 | BSD-3-Clause |
| isodate | 0.7.2 | BSD (variant not stated in metadata) |
| Jinja2 | 3.1.6 | BSD (variant not stated in metadata) |
| joblib | 1.6.0 | BSD-3-Clause |
| jsonschema | 4.26.0 | MIT |
| jsonschema-specifications | 2025.9.1 | MIT |
| language-tags | 1.3.1 | MIT |
| markdown-it-py | 4.2.0 | MIT |
| MarkupSafe | 3.0.3 | BSD-3-Clause |
| mdurl | 0.1.2 | MIT |
| miniaudio | 1.71 | MIT |
| murmurhash | 1.0.15 | MIT |
| numpy | 2.5.3 | BSD-3-Clause AND 0BSD AND MIT AND Zlib AND CC0-1.0 |
| packaging | 26.3 | Apache-2.0 OR BSD-2-Clause |
| preshed | 3.0.13 | MIT |
| pycparser | 3.0 | BSD-3-Clause |
| pydantic | 2.13.5 | MIT |
| pydantic_core | 2.46.5 | MIT |
| Pygments | 2.21.0 | BSD-2-Clause |
| pyparsing | 3.3.3 | MIT |
| python-dateutil | 2.9.0.post0 | BSD-3-Clause OR Apache-2.0 (dual) |
| PyYAML | 6.0.3 | MIT |
| rdflib | 7.6.0 | BSD (variant not stated in metadata) |
| referencing | 0.37.0 | MIT |
| regex | 2026.9.10 | Apache-2.0 AND CNRI-Python |
| requests | 2.34.2 | Apache-2.0 |
| rfc3986 | 1.5.0 | Apache-2.0 |
| rich | 15.0.0 | MIT |
| rpds-py | 2026.6.3 | MIT |
| safetensors | 0.8.0 | Apache-2.0 |
| scipy | 1.18.1 | BSD (variant not stated in metadata) |
| segments | 2.4.0 | Apache-2.0 |
| setuptools | 84.0.0 | MIT |
| shellingham | 1.5.4 | ISC |
| six | 1.17.0 | MIT |
| smart_open | 8.0.1 | MIT |
| spacy-legacy | 3.0.12 | MIT |
| spacy-loggers | 1.0.5 | MIT |
| srsly | 2.5.3 | MIT |
| termcolor | 3.3.0 | MIT |
| thinc | 8.3.13 | MIT |
| tokenizers | 0.23.2 | Apache-2.0 |
| tqdm | 4.70.1 | MPL-2.0 AND MIT |
| transformers | 5.17.0 | Apache-2.0 |
| typer | 0.27.2 | MIT |
| typing-inspection | 0.4.4 | MIT |
| typing_extensions | 4.16.0 | PSF-2.0 |
| uritemplate | 4.2.0 | BSD 3-Clause OR Apache-2.0 |
| urllib3 | 2.8.0 | MIT |
| wasabi | 1.1.3 | MIT |
| weasel | 1.0.0 | MIT |
| wrapt | 2.4.1 | BSD-2-Clause |
