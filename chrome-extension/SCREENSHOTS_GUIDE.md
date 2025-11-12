# Screenshots & Demo Video Guide
**Natural Text-to-Speech Chrome Extension**

This guide provides detailed instructions for capturing screenshots and creating a demo video for the extension's documentation and promotional materials.

---

## Required Screenshots Checklist

### 1. Extension Popup (4 screenshots)

#### Screenshot 1: Popup - Default State
**Filename**: `popup-default.png`
**Dimensions**: 340x400px (natural popup size)
**Description**: Clean popup interface with default settings

**Setup**:
1. Start native helper: `cd ../native-helper && .build/release/natural-tts-helper`
2. Open Chrome and click extension icon
3. Wait for green status indicator (connected)
4. Ensure default voice is selected (Bella)
5. Ensure speed is at 1.0x

**Capture**:
- macOS: `Cmd + Shift + 4`, then `Space`, click popup window
- Or use Chrome DevTools → Right-click popup → "Capture screenshot"

**Key Elements Visible**:
- [ ] Extension title "Natural TTS"
- [ ] Green status indicator (top-right)
- [ ] Settings gear icon
- [ ] Voice dropdown showing "Bella (US) - en-US"
- [ ] Speed slider at 1.0x
- [ ] "Speak Selected Text" button

#### Screenshot 2: Popup - Voice Dropdown Open
**Filename**: `popup-voice-dropdown.png`
**Description**: Showing all available voices

**Setup**:
1. Click on voice dropdown to open it
2. Ensure all 6 voices are visible

**Capture**: Screenshot while dropdown is open

**Key Elements Visible**:
- [ ] All 6 voices listed:
  - Bella (US) - en-US
  - Nicole - en-US
  - Sarah - en-US
  - Sky - en-US
  - Adam - en-US
  - Michael - en-US

#### Screenshot 3: Popup - Speed Slider Adjustment
**Filename**: `popup-speed-slider.png`
**Description**: User adjusting speed slider

**Setup**:
1. Hover mouse over speed slider
2. Set speed to 1.5x
3. Ensure speed value shows "1.5x"

**Key Elements Visible**:
- [ ] Speed slider at 1.5x position
- [ ] Speed value displaying "1.5x"
- [ ] Slider labels (0.5x, 1.0x, 1.5x, 2.0x)

#### Screenshot 4: Popup - Helper Disconnected
**Filename**: `popup-disconnected.png`
**Description**: Error state when helper is not running

**Setup**:
1. Stop native helper (Ctrl+C in terminal)
2. Open popup
3. Wait for status indicator to turn red

**Key Elements Visible**:
- [ ] Red status indicator
- [ ] Error message: "Native helper not running..."
- [ ] "Retry Connection" button visible
- [ ] "Speak" button disabled (grayed out)

---

### 2. Options Page (5 screenshots)

#### Screenshot 5: Options - Full Page
**Filename**: `options-full-page.png`
**Dimensions**: 800x1200px (full page)
**Description**: Complete settings page layout

**Setup**:
1. Right-click extension icon → "Options"
2. Ensure default settings are loaded
3. Scroll to show entire page

**Capture**: Full page screenshot

**Key Elements Visible**:
- [ ] Page title "Natural TTS Settings"
- [ ] Green status indicator + "Checking helper..."
- [ ] Voice Preferences section
- [ ] Speech Settings section (speed slider)
- [ ] Playback Behavior section (auto-play checkbox)
- [ ] Helper Connection section (auto-retry checkbox)
- [ ] About section (version number)
- [ ] Save Settings button
- [ ] Reset to Defaults button

#### Screenshot 6: Options - Voice Selection
**Filename**: `options-voice-section.png`
**Dimensions**: 800x300px (cropped)
**Description**: Voice preferences section close-up

**Setup**:
1. Scroll to Voice Preferences section
2. Ensure voice dropdown is populated

**Capture**: Crop to show just Voice Preferences section

**Key Elements Visible**:
- [ ] "Voice Preferences" heading
- [ ] Voice dropdown with all 6 voices
- [ ] Help text below dropdown

#### Screenshot 7: Options - Speed Settings
**Filename**: `options-speed-section.png`
**Dimensions**: 800x300px (cropped)
**Description**: Speech settings section with speed slider

**Setup**:
1. Scroll to Speech Settings section
2. Set speed to 1.2x for visual variety

**Key Elements Visible**:
- [ ] "Speech Settings" heading
- [ ] Speed slider at 1.2x
- [ ] Speed value "1.2x" displayed
- [ ] Help text explaining speed setting

#### Screenshot 8: Options - Checkboxes
**Filename**: `options-checkboxes.png`
**Dimensions**: 800x400px (cropped)
**Description**: Playback and connection settings

**Setup**:
1. Check "Auto-play audio" checkbox
2. Check "Automatically retry connection" checkbox

**Capture**: Crop to show both checkbox sections

**Key Elements Visible**:
- [ ] Both checkboxes checked
- [ ] Help text for each option
- [ ] Section headings visible

#### Screenshot 9: Options - About Section
**Filename**: `options-about.png`
**Dimensions**: 800x250px (cropped)
**Description**: About section with version info

**Setup**:
1. Scroll to About section
2. Ensure version number is visible (1.4.0)
3. Ensure helper status shows "Connected"

**Key Elements Visible**:
- [ ] Extension name and version
- [ ] Description text
- [ ] Helper status: "Connected (Kokoro-82M)"

---

### 3. Context Menu Integration (2 screenshots)

#### Screenshot 10: Context Menu - Text Selected
**Filename**: `context-menu-in-action.png`
**Dimensions**: 1000x600px (browser window)
**Description**: Right-click menu on selected text

**Setup**:
1. Open any webpage (e.g., Wikipedia article)
2. Select a paragraph of text (10-20 words)
3. Right-click on selected text
4. Ensure context menu shows "Speak selected text"

**Capture**: Screenshot showing:
- Selected text (highlighted in blue)
- Context menu open
- "Speak selected text" menu item

**Key Elements Visible**:
- [ ] Text selected on webpage
- [ ] Browser context menu
- [ ] "Speak selected text" option with speaker icon
- [ ] Browser chrome (address bar) for context

#### Screenshot 11: Context Menu - PDF Support
**Filename**: `context-menu-pdf.png`
**Dimensions**: 1000x600px (browser window)
**Description**: Extension working on PDF document

**Setup**:
1. Open a PDF in Chrome (built-in PDF viewer)
2. Select text from PDF
3. Right-click to show context menu

**Key Elements Visible**:
- [ ] PDF document visible
- [ ] Text selected in PDF
- [ ] "Speak selected text" in context menu

---

### 4. Chrome Extensions Page (2 screenshots)

#### Screenshot 12: Extension Installed
**Filename**: `chrome-extensions-page.png`
**Dimensions**: 1200x400px (cropped)
**Description**: Extension card on chrome://extensions

**Setup**:
1. Navigate to `chrome://extensions`
2. Find "Natural Text-to-Speech" extension
3. Ensure extension is enabled

**Capture**: Crop to show just the extension card

**Key Elements Visible**:
- [ ] Extension icon (48x48)
- [ ] Extension name "Natural Text-to-Speech"
- [ ] Version number (1.4.0)
- [ ] Description text
- [ ] "Details" and "Remove" buttons
- [ ] Enabled toggle (ON)

#### Screenshot 13: Extension Icon in Toolbar
**Filename**: `toolbar-icon.png`
**Dimensions**: 400x100px (cropped)
**Description**: Extension icon pinned to Chrome toolbar

**Setup**:
1. Ensure extension icon is visible in Chrome toolbar
2. Click extensions puzzle icon if needed
3. Pin extension to toolbar

**Capture**: Crop to show toolbar area

**Key Elements Visible**:
- [ ] Extension icon in toolbar
- [ ] Address bar for context
- [ ] Other toolbar icons for scale

---

### 5. Native Helper Terminal (1 screenshot)

#### Screenshot 14: Helper Running
**Filename**: `helper-terminal.png`
**Dimensions**: 800x400px (terminal window)
**Description**: Terminal showing helper startup and running

**Setup**:
1. Start helper: `.build/release/natural-tts-helper`
2. Wait for startup messages
3. Make 1-2 TTS requests to show request logs

**Capture**: Terminal window screenshot

**Key Elements Visible**:
- [ ] "[INFO] Natural TTS Helper starting..."
- [ ] "[INFO] Loading Kokoro-82M model..."
- [ ] "[INFO] Server listening on http://127.0.0.1:8249"
- [ ] "[INFO] Ready to serve requests!"
- [ ] (Optional) Request/response logs

---

## Screenshot Requirements

### Technical Specifications
- **Format**: PNG (lossless compression)
- **Color Space**: sRGB
- **DPI**: 144 DPI (Retina quality)
- **Background**: Actual browser/OS background (no mockups)
- **Browser**: Google Chrome (latest stable version)
- **OS**: macOS (as per extension requirements)

### Quality Guidelines
- ✅ **Sharp and clear**: No blur or compression artifacts
- ✅ **Well-lit**: UI elements clearly visible
- ✅ **Clean interface**: Close unnecessary tabs/windows
- ✅ **Realistic use**: Show actual usage scenarios
- ✅ **Consistent theming**: Use same Chrome theme for all screenshots
- ✅ **No personal data**: Avoid showing personal bookmarks, history, etc.

---

## Demo Video Requirements

### Video 1: Quick Feature Tour (60-90 seconds)

**Filename**: `demo-quick-tour.mp4`
**Format**: MP4 (H.264)
**Resolution**: 1920x1080 (1080p)
**Frame Rate**: 30fps
**Audio**: No voiceover (optional: light background music)

**Script / Storyboard**:

1. **Opening (5 sec)**
   - Show extension icon in Chrome toolbar
   - Title overlay: "Natural Text-to-Speech"

2. **Popup Interface (15 sec)**
   - Click extension icon
   - Show voice selection dropdown
   - Adjust speed slider
   - Highlight status indicator (green)

3. **Context Menu Usage (20 sec)**
   - Navigate to Wikipedia article
   - Select a paragraph of text
   - Right-click → "Speak selected text"
   - Show audio playing (waveform or speaker icon animation)

4. **Settings Page (15 sec)**
   - Right-click extension → "Options"
   - Show voice preferences
   - Adjust speed setting
   - Toggle checkboxes
   - Click "Save Settings"

5. **PDF Support (15 sec)**
   - Open PDF in Chrome
   - Select text from PDF
   - Right-click → Speak selected text
   - Show audio playing

6. **Helper Status (10 sec)**
   - Show Terminal with helper running
   - Switch back to extension
   - Show green status indicator

7. **Closing (5 sec)**
   - Fade to black
   - Show text: "100% Local • 6 Voices • Privacy-First"
   - GitHub URL

**Recording Tips**:
- Use QuickTime Player (File → New Screen Recording)
- Or use OBS Studio for more control
- Record in a single take if possible
- Use cursor highlighting for clarity
- Keep mouse movements smooth and deliberate

### Video 2: Installation Walkthrough (3-5 minutes)

**Filename**: `installation-guide.mp4`
**Description**: Step-by-step installation tutorial

**Script**:
1. Clone repository
2. Install dependencies (Xcode tools, Python, etc.)
3. Build native helper
4. Start helper
5. Build Chrome extension
6. Load extension in Chrome
7. Verify installation
8. First TTS request

**Style**: Screen recording with text overlays (no voiceover required)

---

## Recommended Tools

### Screenshot Tools (macOS)
1. **Built-in Screenshot** (`Cmd + Shift + 4`)
   - Free, built-in
   - Supports window capture (Space after Cmd+Shift+4)
   - Saves to Desktop by default

2. **Chrome DevTools**
   - Built-in browser tool
   - Right-click element → "Capture screenshot"
   - Pixel-perfect captures

3. **CleanShot X** (Optional, paid)
   - Professional screenshot tool
   - Annotations and highlights
   - Cloud upload

### Screen Recording Tools (macOS)
1. **QuickTime Player** (Free, built-in)
   - File → New Screen Recording
   - Simple and reliable
   - Good quality

2. **OBS Studio** (Free, open source)
   - Professional-grade recording
   - Scene composition
   - Overlays and transitions
   - Download: https://obsproject.com

3. **ScreenFlow** (Paid)
   - Easy editing
   - Cursor highlighting
   - Annotations

### Image Editing (Optional)
1. **Preview** (Free, built-in)
   - Basic cropping and annotations
   - Color adjustments

2. **Pixelmator Pro** (Paid)
   - Professional image editing
   - Retouching and optimization

---

## Post-Processing Checklist

### Screenshots
- [ ] Resize to standard dimensions (if needed)
- [ ] Optimize file size (use ImageOptim or similar)
- [ ] Verify DPI is 144 (Retina)
- [ ] Check no personal data visible
- [ ] Rename files according to naming convention
- [ ] Place in `chrome-extension/docs/screenshots/` directory

### Demo Videos
- [ ] Trim unnecessary beginning/end
- [ ] Add title overlays (optional)
- [ ] Compress to reasonable file size (< 50MB)
- [ ] Export as MP4 (H.264 codec)
- [ ] Verify playback on different devices
- [ ] Upload to YouTube or host on GitHub releases
- [ ] Add video links to README.md

---

## Screenshot Directory Structure

Create this folder structure:

```
chrome-extension/
├── docs/
│   ├── screenshots/
│   │   ├── popup-default.png
│   │   ├── popup-voice-dropdown.png
│   │   ├── popup-speed-slider.png
│   │   ├── popup-disconnected.png
│   │   ├── options-full-page.png
│   │   ├── options-voice-section.png
│   │   ├── options-speed-section.png
│   │   ├── options-checkboxes.png
│   │   ├── options-about.png
│   │   ├── context-menu-in-action.png
│   │   ├── context-menu-pdf.png
│   │   ├── chrome-extensions-page.png
│   │   ├── toolbar-icon.png
│   │   └── helper-terminal.png
│   └── videos/
│       ├── demo-quick-tour.mp4
│       └── installation-guide.mp4
└── README.md
```

---

## Updating Documentation

After capturing screenshots and videos:

### 1. Update README.md
Add screenshot references:

```markdown
## Screenshots

### Popup Interface
![Extension Popup](docs/screenshots/popup-default.png)

### Options Page
![Settings Page](docs/screenshots/options-full-page.png)

### Context Menu Integration
![Context Menu](docs/screenshots/context-menu-in-action.png)

## Demo Video
[![Demo Video](docs/screenshots/popup-default.png)](docs/videos/demo-quick-tour.mp4)
```

### 2. Update INSTALL.md
Add visual guides:

```markdown
### Step 2.2: Load Extension in Chrome

![Chrome Extensions Page](docs/screenshots/chrome-extensions-page.png)

1. Navigate to chrome://extensions
2. Enable Developer Mode
3. Click "Load unpacked"
4. Select the dist/ folder

![Extension Loaded](docs/screenshots/toolbar-icon.png)
```

---

## Quick Start Commands

### Taking Screenshots
```bash
# Create screenshots directory
mkdir -p docs/screenshots docs/videos

# On macOS, screenshots go to Desktop by default
# Move them to docs/screenshots/ after capturing
mv ~/Desktop/Screenshot*.png docs/screenshots/

# Rename to match convention
cd docs/screenshots
mv "Screenshot 2025-11-11 at 10.30.45 AM.png" popup-default.png
```

### Recording Screen
```bash
# Using QuickTime Player
open -a "QuickTime Player"
# Then: File → New Screen Recording

# Or using FFmpeg (if installed)
ffmpeg -f avfoundation -i "1" -r 30 output.mp4
```

### Optimizing Images
```bash
# Install ImageOptim (optional)
brew install imageoptim

# Optimize all screenshots
imageoptim docs/screenshots/*.png
```

---

## Completion Checklist

### Screenshots (14 total)
- [ ] Screenshot 1: Popup - Default State
- [ ] Screenshot 2: Popup - Voice Dropdown
- [ ] Screenshot 3: Popup - Speed Slider
- [ ] Screenshot 4: Popup - Disconnected
- [ ] Screenshot 5: Options - Full Page
- [ ] Screenshot 6: Options - Voice Section
- [ ] Screenshot 7: Options - Speed Section
- [ ] Screenshot 8: Options - Checkboxes
- [ ] Screenshot 9: Options - About Section
- [ ] Screenshot 10: Context Menu - Text Selected
- [ ] Screenshot 11: Context Menu - PDF Support
- [ ] Screenshot 12: Extension Installed
- [ ] Screenshot 13: Toolbar Icon
- [ ] Screenshot 14: Helper Terminal

### Videos (2 total)
- [ ] Video 1: Quick Feature Tour (60-90 sec)
- [ ] Video 2: Installation Walkthrough (3-5 min)

### Documentation Updates
- [ ] Add screenshots to README.md
- [ ] Add screenshots to INSTALL.md
- [ ] Update CHANGELOG.md with "Added screenshots and demo video"
- [ ] Verify all image links work

---

## Notes

- **Priority**: Screenshots 1, 5, 10 are most important for README
- **Timeline**: Allocate 1-2 hours for capturing all screenshots and videos
- **Storage**: Keep original high-res versions, commit optimized versions to Git
- **Accessibility**: Ensure screenshots have descriptive alt text in markdown

---

**Ready to capture!** Follow this guide to create professional documentation assets for v1.4.0.
