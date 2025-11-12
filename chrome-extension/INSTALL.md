# Installation Guide
**Natural Text-to-Speech Chrome Extension**

> **Total time**: 15-20 minutes
> **Difficulty**: Beginner (command-line basics required)

This guide will walk you through installing both the **Native TTS Helper** (backend) and the **Chrome Extension** (frontend).

---

## Prerequisites

Before you begin, make sure you have:

✅ **macOS with Apple Silicon**
   - M1, M2, M3, or M4 chip
   - Check: Apple menu → About This Mac → Chip

✅ **Google Chrome or Microsoft Edge**
   - Version 88 or later
   - Download: [chrome.google.com](https://www.google.com/chrome/)

✅ **~500MB free disk space**
   - For ML model download

✅ **Terminal app**
   - Pre-installed on macOS (Applications → Utilities → Terminal)

✅ **Xcode Command Line Tools** (if not already installed)
```bash
# Check if installed:
xcode-select -p

# If not installed, run:
xcode-select --install
```

---

## Part 1: Install Native TTS Helper (15 minutes)

The native helper is a background service that performs the actual text-to-speech conversion using Apple's Metal framework for GPU acceleration.

### Step 1.1: Clone the Repository

Open **Terminal** and run:

```bash
# Clone the repository
git clone https://github.com/yourusername/natural-text-to-voice-extension.git

# Navigate to the native helper directory
cd natural-text-to-voice-extension/native-helper
```

### Step 1.2: Setup Python Environment

This script will:
- Create a Python virtual environment
- Install ML dependencies (PyTorch, transformers, MLX)
- Download the Kokoro-82M model (~500MB)

```bash
./Scripts/setup-python-env.sh
```

**Expected output:**
```
Setting up Python environment...
Installing dependencies...
Downloading Kokoro-82M model...
✓ Setup complete!
```

⏱️ **This may take 5-10 minutes** depending on your internet connection.

### Step 1.3: Build the Swift Helper

```bash
swift build -c release
```

**Expected output:**
```
Building for production...
Build complete! (XX.XX seconds)
```

⏱️ **This takes 1-2 minutes**.

### Step 1.4: Start the Helper

```bash
.build/release/natural-tts-helper
```

**Expected output:**
```
[INFO] Natural TTS Helper starting...
[INFO] Loading Kokoro-82M model...
[INFO] Server listening on http://127.0.0.1:8249
[INFO] Ready to serve requests!
```

✅ **Success!** The helper is now running.

**Important**:
- Keep this Terminal window open
- The helper must remain running for the extension to work
- You'll see log messages as the extension makes requests

**To stop the helper later**: Press `Ctrl+C` in the Terminal window

---

## Part 2: Install Chrome Extension (5 minutes)

### Step 2.1: Build the Extension

Open a **new** Terminal window (keep the helper running in the first one).

```bash
# Navigate to extension directory
cd /path/to/natural-text-to-voice-extension/chrome-extension

# Install dependencies
bun install

# Build the extension
bun run build
```

**Expected output:**
```
🚀 Building Chrome extension with Bun...
✅ Build complete!
📦 Check dist/ for Chrome extension files
```

**Don't have Bun installed?**
```bash
curl -fsSL https://bun.sh/install | bash
```

### Step 2.2: Load Extension in Chrome

1. **Open Google Chrome**

2. **Navigate to Extensions page**:
   - Type in address bar: `chrome://extensions`
   - Or: Menu (⋮) → Extensions → Manage Extensions

3. **Enable Developer Mode**:
   - Toggle the switch in the top-right corner
   - ![Developer Mode Toggle](https://via.placeholder.com/150x50?text=Developer+Mode)

4. **Load Unpacked Extension**:
   - Click "Load unpacked" button (top-left)
   - ![Load Unpacked Button](https://via.placeholder.com/150x50?text=Load+Unpacked)

5. **Select the dist/ folder**:
   - Navigate to: `natural-text-to-voice-extension/chrome-extension/dist/`
   - Click "Select" or "Open"
   - ⚠️ **Important**: Select the `dist/` folder, NOT the `chrome-extension/` parent folder

6. **Verify Installation**:
   - Extension should appear in your extensions list
   - Icon should be visible in Chrome toolbar
   - No error messages should appear

![Extension Loaded Successfully](https://via.placeholder.com/500x200?text=Extension+Loaded)

---

## Part 3: Verify Installation (2 minutes)

### Test 1: Check Helper Connection

1. **Click the extension icon** in Chrome toolbar (looks like a speaker)
2. **Check the status indicator** (top-left corner of popup)
   - 🟢 **Green dot** = Connected to helper ✅
   - 🟡 **Yellow dot** = Connecting...
   - 🔴 **Red dot** = Helper offline ❌

If you see a red dot:
- Verify the helper is still running in Terminal
- Check that Terminal shows "Ready to serve requests"
- Try closing and reopening the extension popup

### Test 2: Generate Speech

**Method A: Use the Popup**

1. Click the extension icon
2. Type some text in the input area (e.g., "Hello world")
3. Click the "Speak" button
4. 🔊 **Audio should play!**

**Method B: Use Context Menu**

1. Open any webpage (e.g., news article)
2. Select some text with your mouse
3. Right-click on the selected text
4. Click "Speak selected text" from the menu
5. 🔊 **Audio should play!**

### Test 3: Try Different Voices

1. Click extension icon
2. Click the settings gear icon (⚙️) or right-click extension icon → "Options"
3. Change the voice dropdown (try "Nicole" or "Sarah")
4. Click "Save Settings"
5. Go back to popup and test again

🎉 **If all tests pass, installation is complete!**

---

## Troubleshooting

### Issue: "Helper not found" (red status indicator)

**Symptoms**: Extension shows red dot, no audio plays

**Checklist**:
1. ✅ Is the helper Terminal window still open?
2. ✅ Does Terminal show "Ready to serve requests"?
3. ✅ Did the helper crash? (check for error messages in Terminal)

**Solution**:
```bash
# In the helper Terminal window:
# Stop: Ctrl+C
# Restart:
.build/release/natural-tts-helper
```

### Issue: "Extension not loading" in Chrome

**Symptoms**: Error message when clicking "Load unpacked"

**Checklist**:
1. ✅ Did you select the `dist/` folder (not `chrome-extension/`)?
2. ✅ Did you run `bun run build`?
3. ✅ Does the `dist/` folder contain files like `manifest.json`?

**Solution**:
```bash
# Rebuild the extension
cd chrome-extension
rm -rf dist
bun run build
# Then reload in Chrome
```

### Issue: No audio plays

**Symptoms**: Extension works but no sound

**Checklist**:
1. ✅ Is system volume turned up?
2. ✅ Is Chrome allowed to play audio? (check macOS System Settings → Sound)
3. ✅ Are you wearing headphones? (check headphones are connected)
4. ✅ Check Chrome site permissions (🔒 icon → Site settings → Sound)

**Solution**:
- Adjust system volume
- Check Chrome audio permissions
- Try with different audio output device

### Issue: Build fails with "swift: command not found"

**Symptoms**: Error when running `swift build`

**Solution**:
```bash
# Install Xcode Command Line Tools
xcode-select --install

# Verify installation
swift --version
# Should show: Swift version 5.x
```

### Issue: Python setup fails

**Symptoms**: Error during `setup-python-env.sh`

**Solution**:
```bash
# Check Python version (need 3.9+)
python3 --version

# If too old, install via Homebrew:
brew install python@3.11

# Retry setup
cd native-helper
./Scripts/setup-python-env.sh
```

### Issue: Model download fails

**Symptoms**: "Failed to download Kokoro-82M"

**Solution**:
```bash
# Check internet connection
ping huggingface.co

# Try manual download
cd native-helper
./Scripts/download-model.sh

# Or download from browser:
# https://huggingface.co/hexgrad/Kokoro-82M-GGUF
```

### Issue: Port 8249 already in use

**Symptoms**: "Address already in use" when starting helper

**Solution**:
```bash
# Find process using port 8249
lsof -i :8249

# Kill the process (replace <PID> with actual process ID)
kill <PID>

# Restart helper
.build/release/natural-tts-helper
```

---

## Uninstallation

### Remove Chrome Extension
1. Go to `chrome://extensions`
2. Find "Natural Text-to-Speech"
3. Click "Remove"
4. Confirm

### Stop Native Helper
1. In Terminal where helper is running:
2. Press `Ctrl+C`
3. Close Terminal window

### Delete Files (Optional)
```bash
# Delete the entire repository
cd ~
rm -rf natural-text-to-voice-extension
```

The ML model will also be deleted (~500MB freed).

---

## Next Steps

✅ **Installation complete!** Now you can:

- Read the [README](./README.md) for usage tips
- Explore the [Settings Page](chrome://extensions/?options=<extension-id>) to customize voices
- Try selecting text on different websites and PDFs
- Adjust playback speed for your preference

### Usage Tips

**Best practices**:
- Keep helper running in background (it's lightweight)
- Use context menu for quick access (right-click → Speak)
- Adjust speed in settings (0.5x for learning, 1.5x for efficiency)
- Try different voices to find your favorite

**Performance tips**:
- First request takes 2-3 seconds (model loading)
- Subsequent requests are much faster (8x-25x real-time)
- Helper uses ~500MB RAM when idle, ~1GB when processing

---

## Getting Help

**Need assistance?**

1. Check [Troubleshooting](#troubleshooting) section above
2. Review [README.md](./README.md) for detailed documentation
3. Check helper logs in Terminal for error messages
4. Open Chrome console: chrome://extensions → "Service worker" → "inspect views"
5. File an issue: [GitHub Issues](https://github.com/yourusername/natural-text-to-voice-extension/issues)

**Common Questions**:

**Q: Can I close the Terminal window?**
A: No, the helper must remain running. Minimize it instead.

**Q: Does this work offline?**
A: Yes! After initial model download, everything runs locally.

**Q: Will this work on Windows/Linux?**
A: No, currently macOS Apple Silicon only (M1/M2/M3/M4 required).

**Q: How much battery does it use?**
A: Minimal impact (~5-10% additional drain during active use).

---

**Installation complete! Enjoy privacy-first, local text-to-speech. 🎉**
