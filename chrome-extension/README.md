# Natural Text-to-Speech Chrome Extension

**Privacy-first text-to-speech Chrome extension with local Metal-accelerated processing using Kokoro-82M.**

> ⚡ **100% local processing** - No cloud, no tracking, no data collection
> 🎤 **High-quality voices** - 6 natural-sounding voices
> 📄 **PDF support** - Automatic ligature cleanup for better text extraction
> ⚙️ **Fully customizable** - Adjust speed, voice, and preferences

---

## Features

### Core Functionality
- 🗣️ **Text-to-Speech Conversion**
  - Select text on any webpage or PDF → right-click → "Speak selected text"
  - Or use popup interface with manual text input
  - Multi-sentence paragraph support (no cutoff after first sentence)
  - Unicode text normalization (handles styled/mathematical characters)

- 🎤 **6 Premium Voices**
  - **Female**: Bella (US), Nicole, Sarah, Sky
  - **Male**: Adam, Michael
  - Natural prosody powered by Kokoro-82M model

- ⚡ **Variable Speed Control**
  - Adjustable from 0.5x (slow) to 2.0x (fast)
  - Live preview in settings
  - Default: 1.0x (natural pace)

### Privacy & Performance
- 🔒 **100% Local Processing**
  - All TTS generation happens on your device
  - No cloud API calls, no external servers
  - No analytics, tracking, or data collection
  - No user accounts

- ⚡ **Metal Acceleration**
  - Optimized for Apple Silicon (M1/M2/M3/M4)
  - 8.3x-25x real-time factor performance
  - Low latency audio playback

### User Experience
- 📄 **PDF Text Support**
  - Automatic ligature cleanup (e.g., "tra!c" → "traffic")
  - Handles common PDF encoding errors
  - Works with built-in Chrome PDF viewer

- 🎨 **Modern UI**
  - Popup interface with voice selector and speed slider
  - Comprehensive settings/options page
  - Real-time helper connection status indicator
  - Keyboard navigation and accessibility support

---

## Screenshots

*Coming soon: Popup UI, Options Page, Context Menu in Action*

---

## Requirements

### System Requirements
- **Operating System**: macOS with Apple Silicon (M1/M2/M3/M4)
- **Browser**: Google Chrome 88+ or Microsoft Edge 88+
- **Disk Space**: ~500MB for ML model download
- **Memory**: 2GB RAM recommended

### Prerequisites
1. **Native TTS Helper** running on `localhost:8249`
   - See [parent repository](../native-helper/) for helper setup
   - Helper provides ML inference via MLX framework
   - Automatic connection detection

---

## Installation

### Quick Start (5 minutes)

**Step 1: Install Native Helper**
```bash
# Clone repository (if not already done)
git clone https://github.com/yourusername/natural-text-to-voice-extension.git
cd natural-text-to-voice-extension/native-helper

# Setup and build
./Scripts/setup-python-env.sh
swift build -c release

# Start helper (keep running in background)
.build/release/natural-tts-helper
```

**Step 2: Load Extension in Chrome**
```bash
# Build extension (from chrome-extension directory)
cd ../chrome-extension
bun install
bun run build

# Then in Chrome:
# 1. Navigate to chrome://extensions
# 2. Enable "Developer mode" (top-right toggle)
# 3. Click "Load unpacked"
# 4. Select the `dist/` folder
```

**Step 3: Verify**
- Extension icon should appear in Chrome toolbar
- Click icon → status indicator should show green (connected)
- Select text → right-click → "Speak selected text" → audio plays!

### Detailed Installation Guide
See [INSTALL.md](./INSTALL.md) for step-by-step instructions with screenshots.

---

## Usage

### Method 1: Context Menu (Recommended)
1. **Select text** on any webpage or PDF
2. **Right-click** on selected text
3. **Click** "Speak selected text"
4. **Audio plays** immediately

### Method 2: Popup Interface
1. **Click** extension icon in Chrome toolbar
2. **Type or paste** text into input area (or select text on page first)
3. **Choose** voice from dropdown (optional)
4. **Adjust** speed slider (optional)
5. **Click** "Speak" button

### Method 3: Keyboard Shortcuts
*(Coming in future update)*

### Settings & Customization

**Access Settings:**
- Click extension icon → Click gear icon (⚙️)
- Or right-click extension icon → "Options"

**Available Settings:**
- **Voice Selection**: Choose from 6 voices
- **Playback Speed**: 0.5x - 2.0x range
- **Auto-play**: Automatically play when text is selected (future feature)
- **Helper Auto-retry**: Reconnect to helper if disconnected

**Settings sync** automatically across all extension contexts.

---

## How It Works

### Architecture Overview

```
┌─────────────────┐
│  Chrome Browser │
│  ┌───────────┐  │      HTTP (localhost:8249)      ┌──────────────────┐
│  │ Extension │  │ ◄────────────────────────────► │  Native Helper   │
│  │  (popup,  │  │      JSON request/response      │  (Swift + MLX)   │
│  │ content,  │  │                                  │                  │
│  │background)│  │                                  │  ┌────────────┐  │
│  └───────────┘  │                                  │  │ MLX Python │  │
└─────────────────┘                                  │  │  Worker    │  │
                                                      │  └────────────┘  │
                                                      │  ┌────────────┐  │
                                                      │  │ Kokoro-82M │  │
                                                      │  │   Model    │  │
                                                      │  └────────────┘  │
                                                      └──────────────────┘
```

### Components

**Extension Side:**
- **Popup** (`popup/`): User interface for manual text input
- **Options** (`options/`): Settings and preferences page
- **Content Script** (`content/`): Text selection on webpages
- **Background Worker** (`background/`): Message routing, context menu handling
- **Offscreen Document** (`offscreen/`): Audio playback (Chrome requirement)

**Native Helper Side** (separate repository):
- **SwiftNIO HTTP Server**: Handles API requests on `localhost:8249`
- **Python MLX Worker**: ML inference with Kokoro-82M model
- **Metal Acceleration**: GPU-accelerated tensor operations

### API Endpoints
- `GET /health` - Check helper status
- `GET /voices` - List available voices
- `POST /speak` - Generate TTS audio (returns WAV file)

---

## Troubleshooting

### Common Issues

#### "Helper not found" or red status indicator
**Cause**: Native helper is not running
**Solution**:
```bash
cd ../native-helper
.build/release/natural-tts-helper
```
Keep this terminal window open. Helper must run in background.

#### "Extension not loading" in Chrome
**Cause**: Wrong folder selected or build not complete
**Solution**:
1. Ensure you selected the `dist/` folder (not `chrome-extension/` root)
2. Run `bun run build` first to create dist folder
3. Check console for errors: chrome://extensions → "Errors" button

#### No audio plays when clicking "Speak"
**Possible causes**:
- System volume muted → Check macOS sound settings
- Chrome audio blocked → Check site permissions
- Invalid text selection → Try typing text manually in popup

#### PDF text has garbled characters
**Expected**: Extension auto-fixes common PDF issues (e.g., "tra!c" → "traffic")
**If still garbled**: Some PDFs have severe encoding errors that can't be auto-corrected. Try copying text to popup manually.

#### Slow performance or high CPU usage
**Normal**: First request takes 2-3 seconds (model loading)
**After warm-up**: Should achieve 8x-25x real-time factor
**If consistently slow**:
- Check Activity Monitor for other ML workloads
- Ensure native helper is using Release build (not Debug)

### Getting Help
- Check [parent repository issues](https://github.com/yourusername/natural-text-to-voice-extension/issues)
- Review helper logs in terminal where helper is running
- Check Chrome extension console: chrome://extensions → "Service worker" → "inspect views"

---

## Development

### Project Structure
```
chrome-extension/
├── src/
│   ├── popup/           # Popup UI (click extension icon)
│   ├── options/         # Settings page
│   ├── background/      # Service worker (message routing)
│   ├── content/         # Content script (text selection)
│   ├── offscreen/       # Offscreen document (audio playback)
│   └── shared/          # Shared utilities (API client, types)
├── public/
│   ├── manifest.json    # Extension manifest (Manifest V3)
│   └── icons/           # Extension icons (16, 48, 128px)
├── tests/               # Bun test suite
├── dist/                # Build output (load this in Chrome)
└── package.json
```

### Build Commands
```bash
# Production build
bun run build

# Run tests
bun test

# Run tests in watch mode
bun test:watch

# Type checking only
bun run type-check
```

### Technology Stack
- **Runtime**: Bun 1.3.0
- **Bundler**: `Bun.build` (see `build.ts`)
- **Language**: TypeScript 6.0.3
- **Testing**: Bun Test with happy-dom
- **Manifest**: Chrome Manifest V3
- **UI**: Vanilla HTML/CSS/TypeScript (no framework)

### Testing
```bash
# Run all tests (unit + integration)
bun test

# Integration tests require native helper running
cd ../native-helper && .build/release/natural-tts-helper
```

**Test coverage**:
- ✅ 128 tests passing
- ✅ 322 assertions
- ✅ API client (unit + integration)
- ✅ Content script
- ✅ Service worker
- ✅ Offscreen document
- ✅ Message type safety

### Code Style
- Use TypeScript strict mode
- Prefer `const` over `let`
- Async/await for promises
- Descriptive variable names
- JSDoc comments for public APIs

---

## Architecture Details

### Extension Contexts
Chrome Manifest V3 uses multiple isolated contexts:

1. **Popup** - Runs when user clicks extension icon (ephemeral)
2. **Options Page** - Runs when user opens settings (persistent tab)
3. **Content Script** - Injected into every webpage (isolated from page)
4. **Background Service Worker** - Always running (event-driven)
5. **Offscreen Document** - Hidden page for audio playback (Chrome API requirement)

### Communication Flow

**Text Selection → Speech**:
```
1. User selects text on webpage
2. User right-clicks → "Speak selected text"
3. Background worker receives context menu click
4. Background → Content script: "Get selected text"
5. Content script → Background: Returns text
6. Background → API client: POST /speak request
7. API client → Native helper (localhost:8249)
8. Native helper → Python MLX worker
9. MLX worker → Kokoro-82M model inference
10. Helper returns WAV audio (base64 encoded)
11. Background → Offscreen document: Play audio
12. Offscreen creates audio blob and plays
```

### Security Model
- **Content Security Policy**: Strict CSP prevents inline scripts
- **Permissions**: Minimal required permissions (storage, contextMenus, activeTab)
- **Network**: Only `http://127.0.0.1/*` allowed (localhost)
- **No eval()**: No dynamic code execution
- **No external scripts**: All code bundled statically

---

## Privacy Policy

See [PRIVACY.md](./PRIVACY.md) for full privacy policy.

**TL;DR**:
- 100% local processing on your device
- No data sent to external servers
- No analytics, tracking, or telemetry
- No user accounts or cloud storage
- Only network request is to localhost:8249 (your own computer)

---

## Performance

### Bundle Size
- Total: **61.47 KB** (uncompressed), ~22 KB (gzipped)
- JavaScript bundled and minified by `Bun.build` (`minify: true`)
- CSS copied as-is (not minified)
- Shared CSS variables to eliminate duplication

### TTS Performance (Native Helper)
- **Short text** (5-10 words): ~8.3x RTF
- **Long text** (50-100 words): ~25x RTF
- **First request latency**: 2-3 seconds (model loading)
- **Subsequent requests**: Sub-second latency

---

## Roadmap

### Current Version: v1.3.0 ✅
- ✅ Core TTS functionality
- ✅ 6 premium voices
- ✅ Variable speed control
- ✅ PDF support with ligature cleanup
- ✅ Settings page
- ✅ Context menu integration
- ✅ Accessibility (keyboard nav, ARIA labels)

### Next Version: v1.4.0 (In Progress)
- 📝 Documentation complete
- 📝 Installation guide
- 📝 Privacy policy
- 📝 Accessibility audit
- 📝 Screenshots and demo video

### Future Versions (Planned)
- 🔮 Keyboard shortcuts
- 🔮 Export audio to file
- 🔮 Reading queue (batch processing)
- 🔮 Text highlighting as spoken
- 🔮 Pronunciation dictionary
- 🔮 Multi-language support
- 🔮 Custom voice fine-tuning (if Kokoro supports)

---

## Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes with clear commit messages
4. Add tests if applicable
5. Run `bun test` to ensure all tests pass
6. Submit a pull request

### Development Guidelines
- Follow existing code style
- Add TypeScript types for all new code
- Include JSDoc comments for public APIs
- Write tests for new features
- Update documentation as needed

---

## License

MIT License - See [parent repository LICENSE](../LICENSE) for details.

---

## Acknowledgments

- **Kokoro-82M**: High-quality TTS model by [source TBD]
- **MLX Framework**: Apple's ML framework for Metal acceleration
- **SwiftNIO**: High-performance networking in Swift
- **Bun**: Fast JavaScript runtime and bundler

---

## Links

- **Parent Repository**: [Natural TTS Extension](../)
- **Native Helper**: [Setup Guide](../native-helper/README.md)
- **Issue Tracker**: [GitHub Issues](https://github.com/yourusername/natural-text-to-voice-extension/issues)
- **Changelog**: [CHANGELOG.md](../CHANGELOG.md)

---

**Built with ❤️ for privacy and performance**
