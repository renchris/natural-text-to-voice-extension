# Installation Guide
**Natural TTS: Private Kokoro Voices for Mac**

> **Total time**: about 10 minutes, most of it the one-time build and model download
> **Difficulty**: Beginner (you paste two or three commands into Terminal)

Natural TTS has two parts: the **Natural TTS helper**, a small app that generates the Kokoro voices on your Mac,
and the **Chrome extension**. Install the helper first. The extension works without it, reading with your Mac's
built-in system voices, but the natural Kokoro voices need the helper.

---

## Prerequisites

✅ **A Mac with Apple silicon on macOS 14 (Sonoma) or later**
   - Check: Apple menu → About This Mac → Chip (an Apple M-series chip) and macOS version

✅ **A Chromium browser, version 148 or later**
   - Chrome, Edge, Brave, Opera, Vivaldi, Arc or Dia

✅ **[Homebrew](https://brew.sh)**

✅ **Xcode 16.2 or later, or its Command Line Tools** (the helper is built from source)
```bash
# Check if installed:
xcode-select -p

# If not installed, run:
xcode-select --install
```

✅ **About 1.5 GB of free disk space**: the helper's Python environment (~0.66 GB), the Kokoro model (~0.35 GB)
and the build

---

## Part 1: Install the Natural TTS Helper

The helper listens on `127.0.0.1` only (port 8249, or the next free port up to 8260) and runs the Kokoro-82M
model on your Mac's GPU. It downloads the model once, during setup, and works offline after that.

### Option A: Homebrew (recommended)

```bash
brew install renchris/tap/natural-tts
brew services start natural-tts
```

The formula builds the helper, installs its locked Python 3.12 environment and fetches the model.
`brew services` starts the helper now and at every login. Details:
[packaging/homebrew/README.md](../packaging/homebrew/README.md).

> The `renchris/tap` tap is published together with the store listing. Until then, use Option B.

### Option B: From source

```bash
git clone https://github.com/renchris/natural-text-to-voice-extension.git
cd natural-text-to-voice-extension
native-helper/Scripts/quickstart.sh
```

`quickstart.sh` installs uv, espeak-ng, tmux and jq with Homebrew if they are missing, builds the locked Python
environment (`Scripts/setup-python-env.sh`, which also fetches the model once), builds the release binary, and
starts the helper in a background tmux session named `natural-tts-helper`. When the helper is up, its log says:

```
Natural TTS Helper is ready!
Listening on: http://127.0.0.1:8249
```

⏱️ **The first run takes several minutes** (the environment, the model download and the Swift build). Later runs
reuse all three.

**Useful commands** (from `native-helper/`):
- `./Scripts/status.sh`: is it running, and on which port
- `./Scripts/logs.sh` (or `--follow`): the helper's log
- `./Scripts/teardown.sh`: stop it

The helper does not start again by itself after a restart of your Mac; run `quickstart.sh` again, or use
Homebrew.

---

## Part 2: Install the Chrome Extension

### From the Chrome Web Store

Install **Natural TTS: Private Kokoro Voices for Mac** and pin it to the toolbar. Chrome's only install warning
is "Read and change your data on 127.0.0.1": the extension can reach nothing but your own computer.

### Or build it yourself

You need [Bun](https://bun.sh) 1.3 or later (`curl -fsSL https://bun.sh/install | bash`).

```bash
cd natural-text-to-voice-extension/chrome-extension
bun install
bun run build
```

**Expected output** (last lines):
```
✅ Build complete!
📦 Check dist/ for Chrome extension files
```

Then load it:

1. Open `chrome://extensions` (or Menu ⋮ → Extensions → Manage Extensions).
2. Turn on **Developer mode** (the switch in the top-right corner).
3. Click **Load unpacked** and select `natural-text-to-voice-extension/chrome-extension/dist/`.
   ⚠️ Select the `dist/` folder, not `chrome-extension/`.
4. **Natural TTS** appears in the list with no errors. Pin it from the puzzle-piece menu so its icon stays in the
   toolbar.

---

## Part 3: Verify Installation (2 minutes)

### Test 1: Check the helper connection

1. **Click the Natural TTS icon** in the toolbar.
2. **Read the status pill** in the popup's top-right corner:
   - **Connected**: the helper is running and its model is loaded ✅
   - **Warming**: the helper is loading its model; the popup checks again every 2 seconds
   - **Checking**: the popup is looking for the helper
   - **Offline**: no helper answered. By default Speak still works, with a system voice, and the popup shows
     how to install the helper

If it says **Offline** and you installed the helper, see [Troubleshooting](#troubleshooting).

### Test 2: Generate speech

**Method A: the right-click menu**

1. Open any web page (or a PDF) and select a sentence.
2. Right-click the selection and choose **Speak selected text**.
3. 🔊 **Audio plays.** It keeps playing if you click elsewhere.

**Method B: the popup**

1. Select some text on the page.
2. Click the Natural TTS icon, then **Speak Selected Text**. While it plays the button is **Stop**.
3. 🔊 **Audio plays** until it ends or you close the popup.

### Test 3: Try different voices

1. In the popup, open the voice list: 28 English voices, grouped American and British, female and male.
2. Pick one (for example **Emma**, a British voice) and speak again.
3. To change the default for right-click speech too, click the gear icon (or right-click the toolbar icon →
   **Options**), choose a voice and click **Save Settings**.

🎉 **If all three work, installation is complete!**

---

## Troubleshooting

### Issue: the popup says "Offline"

**Symptoms**: the status pill reads **Offline**; Speak uses a system voice (or shows an error, if you chose
"Show an error" in Options).

**Checklist**:
1. ✅ Is the helper running? Homebrew: `brew services list | grep natural-tts`. Source: `native-helper/Scripts/status.sh`.
2. ✅ Did it finish starting? Its log ends with "Natural TTS Helper is ready!". Homebrew logs to
   `$(brew --prefix)/var/log/natural-tts.log`; a source install: `native-helper/Scripts/logs.sh`.
3. ✅ Then click **Retry connection** in the popup.

**Solution**: start it. Homebrew: `brew services restart natural-tts`. Source: `native-helper/Scripts/quickstart.sh`.

### Issue: "The helper's voice engine stopped - restart the helper"

The helper is running, but its Python worker kept exiting: the helper restarts it up to 3 times within two
minutes, then stops trying. Restart the helper as above; if it happens again, the helper log says why.

### Issue: "Update the Natural TTS helper"

The running helper is older than this extension. Speech still works with the voices it offers. The notice shows
the update command: for a source install, `git pull && native-helper/Scripts/quickstart.sh` in your checkout. To
move to Homebrew, stop the old helper first (`native-helper/Scripts/teardown.sh`): while an old helper answers on
port 8249, the extension keeps using it.

### Issue: "Extension not loading" in Chrome

**Symptoms**: an error when you click **Load unpacked**

**Checklist**:
1. ✅ Did you select the `dist/` folder (not `chrome-extension/`)?
2. ✅ Did `bun run build` finish without errors?
3. ✅ Does `dist/` contain `manifest.json`?
4. ✅ Is your browser at version 148 or later? The manifest requires it.

**Solution**:
```bash
cd chrome-extension
rm -rf dist
bun run build
# Then click the reload arrow on the extension's card in chrome://extensions
```

### Issue: No audio plays

**Checklist**:
1. ✅ Is the system volume up, and is the right output device selected?
2. ✅ Was text selected? The popup and keyboard shortcuts read the tab's own selection; for a PDF or an embedded
   frame from another site, right-click the selection instead.
3. ✅ Did the toolbar icon show a red **!**? Hover over it to read why.

### Issue: `quickstart.sh` stops at the Swift build

The helper needs a Swift 6.0 toolchain: Xcode 16.2 or later, or its Command Line Tools, on macOS 14.5+.

```bash
xcode-select --install
swift --version   # must report Swift 6.0 or later
```

### Issue: Python setup or the model download fails

`quickstart.sh` runs `native-helper/Scripts/setup-python-env.sh`, which builds the environment with uv (Python
3.12 is fetched by uv, not taken from your system) and downloads the Kokoro model from Hugging Face once. It stops
at the first failed step. Check your connection to huggingface.co and run it again: it reuses what it already
built. `brew install uv` if uv is missing.

### Issue: Port 8249 already in use

The helper then takes the next free port, up to 8260, and the extension finds it there. If another copy of the
helper holds 8249 (for example an old source install next to a Homebrew one), the extension talks to that copy:
stop the one you do not want (`native-helper/Scripts/teardown.sh`, or `brew services stop natural-tts`).

```bash
lsof -nP -iTCP:8249 -sTCP:LISTEN   # which process is listening
```

---

## Uninstallation

### Remove the Chrome extension
1. Go to `chrome://extensions`
2. Find **Natural TTS: Private Kokoro Voices for Mac**
3. Click **Remove** and confirm

### Remove a Homebrew helper
```bash
brew services stop natural-tts
brew uninstall natural-tts
```
The model lives inside the Homebrew keg and goes with it. Its config and log stay in `$(brew --prefix)/var`
(`natural-tts/` and `log/natural-tts.log`) until you delete them.

### Remove a source install
```bash
natural-text-to-voice-extension/native-helper/Scripts/teardown.sh
rm -rf natural-text-to-voice-extension
```
The model stays in the Hugging Face cache (`~/.cache/huggingface/hub/models--prince-canuma--Kokoro-82M`,
~0.35 GB), and the helper's settings in `~/Library/Application Support/NaturalTTS/`. Delete both if nothing else
uses them.

---

## Next Steps

✅ **Installation complete!** Now you can:

- Read the [README](./README.md) for features and how it works
- Open **Options** (gear icon in the popup) to set your default voice and speed
- Bind the **Speak the selected text** and **Stop speaking** shortcuts at `chrome://extensions/shortcuts`
  (they ship with no keys)

### Usage Tips

- The right-click menu works in PDFs and embedded frames; the popup and the shortcuts read the tab's own
  selection.
- Speed runs from 0.5× to 2.0×; the popup's − and + buttons step by 0.1×.
- The helper answers a 15-word sentence in about a third of a second and a 400-word passage in about 6.5 s on an
  M1 Max. Audio starts when the whole passage is ready, so long selections take a moment.
- While speaking, the helper's worker uses up to ~3.6 GB of memory for the longest (5,000-character) selections,
  and falls back to ~0.6 GB between requests.

---

## Getting Help

1. Check [Troubleshooting](#troubleshooting) above
2. Read [README.md](./README.md) and [native-helper/README.md](../native-helper/README.md)
3. Check the helper log (see "Offline" above) and the extension's service worker console:
   `chrome://extensions` → Natural TTS → "Inspect views: service worker"
4. File an issue: [GitHub Issues](https://github.com/renchris/natural-text-to-voice-extension/issues)

**Common Questions**:

**Q: Does it work offline?**
A: Yes. The helper downloads the model once, during setup, and never goes online after that.

**Q: Does it work on Windows or Linux, or on an Intel Mac?**
A: The Kokoro voices need the helper, which needs a Mac with Apple silicon. Elsewhere the extension can only use
system voices.

**Q: Can I close Terminal?**
A: Yes. Both install paths run the helper in the background (a Homebrew service, or a tmux session).

---

**Installation complete! Enjoy private, local text-to-speech. 🎉**
