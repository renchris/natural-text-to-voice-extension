# Manual Testing Checklist
**Natural TTS: Private Kokoro Voices for Mac, v1.5.0**

**Pre-Release Testing Checklist**

This checklist ensures all functionality works correctly before tagging and releasing v1.5.0. The automated gates cover most of it (`bun test`, `bun run test:e2e`, and `scripts/verify-all.sh` at the repo root); this list is the by-hand pass on a real helper and real pages. Complete all sections and mark items as ✅ (pass), ❌ (fail), or ⏭️ (skipped).

---

## Pre-Testing Setup

### Environment Preparation
- [ ] **Native Helper Running**
  ```bash
  native-helper/Scripts/quickstart.sh     # from the repo root; or: brew services start natural-tts
  ```
  - Verify: the helper log shows "Natural TTS Helper is ready!" (`native-helper/Scripts/logs.sh`)
  - Verify: `curl -s http://127.0.0.1:8249/health` reports `"status":"ok"`, `"apiVersion":2`

- [ ] **Extension Loaded in Chrome**
  ```bash
  cd chrome-extension
  bun run build
  ```
  - Load `dist/` folder in `chrome://extensions`
  - Verify: Extension appears in toolbar
  - Verify: No console errors on load

- [ ] **Clean State**
  - Clear extension storage: `chrome://extensions` → Natural TTS → Inspect views: service worker, then run
    `await chrome.storage.local.clear()` in its console (or remove and reload the unpacked extension)
  - Restart Chrome
  - Reload extension

---

## 1. Installation & Setup Tests

### 1.1 First-Time Installation ✅ / ❌
- [ ] Extension loads without errors
- [ ] Default settings are applied (Heart voice, 1.0x speed)
- [ ] Status indicator shows "checking" then "connected"
- [ ] Voice dropdown populates with 28 voices in 4 groups (American Female/Male, British Female/Male)
- [ ] No console errors in background service worker

**Expected Behavior**: Extension initializes successfully with defaults

---

### 1.2 Helper Connection Tests ✅ / ❌

#### Test 1.2a: Helper Running (Normal Case)
- [ ] Start helper before opening extension
- [ ] Open popup → status pill reads **Connected**
- [ ] Voices load correctly
- [ ] "Speak" button is enabled

**Expected**: Connected, all features enabled

#### Test 1.2b: Helper Not Running, System Voices (Default)
- [ ] Stop helper (`native-helper/Scripts/teardown.sh` or `brew services stop natural-tts`)
- [ ] Open popup → status pill reads **Offline**
- [ ] Message: "The helper isn’t running, so a system voice will read your selection."
- [ ] The install notice shows `brew install renchris/tap/natural-tts && brew services start natural-tts`
- [ ] "Retry connection" button appears; "Speak" is enabled
- [ ] Speak reads the selection in a system voice; the engine line says "System voice"

**Expected**: Speech still works, and the popup says how to get the Kokoro voices

#### Test 1.2b-2: Helper Not Running, "Show an error"
- [ ] In Options, set "When the helper isn't running" to **Show an error** and save
- [ ] Open popup → **Offline**, message "Native helper not running. Please start the helper and click Retry."
- [ ] "Speak" is disabled; the voice list shows "Helper not connected - Start helper to load voices"

**Expected**: A clear error and Retry, no system voice

#### Test 1.2c: Retry connection
- [ ] Start helper while popup is open
- [ ] Click "Retry connection" button
- [ ] Status pill changes from **Offline** → **Checking** → **Connected** (or **Warming** first, then Connected)
- [ ] Success message: "Successfully connected to helper!"
- [ ] Voices load correctly
- [ ] "Speak" button becomes enabled

**Expected**: Successful reconnection without page refresh

---

## 2. Core TTS Functionality Tests

### 2.1 Popup Interface - Basic TTS ✅ / ❌

#### Test 2.1a: Generate Speech from Selected Text
1. [ ] Open any webpage (e.g., Wikipedia)
2. [ ] Select a short paragraph (20-30 words)
3. [ ] Click extension icon to open popup
4. [ ] Click "Speak selected text" button
5. [ ] Verify audio plays
6. [ ] Verify message: "Playing audio…", and the button reads **Stop** until the audio ends

**Expected**: Clear speech audio at normal speed (1.0x)

#### Test 2.1b: No Text Selected
1. [ ] Open popup without selecting text
2. [ ] Click "Speak selected text"
3. [ ] Verify warning message: "Select some text on the page first."

**Expected**: Clear warning, no errors

#### Test 2.1c: Long Text (> 5000 characters)
1. [ ] Select very long text (> 5000 chars)
2. [ ] Click "Speak selected text"
3. [ ] Verify warning: "Text is too long..."

**Expected**: Validation prevents overflow

---

### 2.2 Voice Selection ✅ / ❌

#### Test Each Voice:
Test at least one voice from each group (the full list of 28 is in
`src/shared/voices.ts`):

- [ ] **Heart** - American Female (default)
- [ ] **Michael** - American Male
- [ ] **Emma** - British Female
- [ ] **George** - British Male
- [ ] **Sarah** appears under American Female (not "UK")

**For each voice**:
1. Select voice from dropdown
2. Generate speech with same test text
3. Verify voice sounds correct
4. Verify no audio artifacts or distortion

**Expected**: All voices produce clear, natural speech

---

### 2.3 Speed Control ✅ / ❌

#### Test Speed Settings:
- [ ] **0.5x** - Very slow, clear speech
- [ ] **0.7x** - Slow speed
- [ ] **1.0x** - Normal speed (default)
- [ ] **1.3x** - Slightly faster
- [ ] **1.5x** - Fast speed
- [ ] **1.8x** - Very fast
- [ ] **2.0x** - Maximum speed

**For each speed**:
1. Adjust slider to speed value
2. Verify speed value updates in UI
3. Generate speech
4. Verify audio plays at correct speed
5. Verify no chipmunk effect (pitch preservation)

**Expected**: Speed adjustment works smoothly, audio quality maintained

---

### 2.4 Context Menu Integration ✅ / ❌

#### Test 2.4a: Context Menu on Webpage
1. [ ] Open Wikipedia article
2. [ ] Select 2-3 sentences
3. [ ] Right-click on selected text
4. [ ] Verify "Speak selected text" appears in menu
5. [ ] Click context menu item
6. [ ] Verify audio plays

**Expected**: Context menu works seamlessly

#### Test 2.4b: Context Menu on PDF
1. [ ] Open PDF in Chrome (built-in viewer)
2. [ ] Select text from PDF
3. [ ] Right-click → "Speak selected text"
4. [ ] Verify audio plays
5. [ ] Verify PDF ligature cleanup works (test with "traffic" if available)

**Expected**: PDF text extraction works correctly

#### Test 2.4c: Context Menu on Different Websites
Test on various sites to ensure compatibility:
- [ ] **Wikipedia** (en.wikipedia.org)
- [ ] **Medium** (medium.com) - Article page
- [ ] **GitHub** (github.com) - README file
- [ ] **MDN Docs** (developer.mozilla.org)
- [ ] **News site** (e.g., nytimes.com)

**Expected**: Works consistently across different DOM structures

---

### 2.5 Multi-Sentence Support ✅ / ❌
- [ ] Select paragraph with 5+ sentences
- [ ] Generate speech
- [ ] Verify ALL sentences are spoken (not just first sentence)
- [ ] Verify no cutoff mid-paragraph

**Expected**: Complete paragraph spoken without truncation

---

### 2.6 Unicode Text Normalization ✅ / ❌
Test special characters and formatting:
- [ ] **Styled text**: "𝐁𝐨𝐥𝐝" → Should read as "Bold"
- [ ] **Mathematical**: "ℝ𝕖𝕒𝕝" → Should read as "Real"
- [ ] **Emoji**: "Hello 👋 World" → Should skip emoji gracefully
- [ ] **Accented**: "Café résumé" → Read with the accents folded ("Cafe resume")
- [ ] **Typographic punctuation**: curly quotes, dashes and "…" shape the pauses instead of being dropped
- [ ] **Long tokens**: a 20-digit number is read in groups of three; a 300-character URL is read in full

**Expected**: Text normalizes correctly, no pronunciation errors

---

### 2.7 Keyboard Commands and Stop ✅ / ❌
- [ ] `chrome://extensions/shortcuts` lists **Speak the selected text** and **Stop speaking**, with no keys bound
- [ ] The popup footer shows **Set a shortcut** until one is bound, then the bound key
- [ ] Bind both; select text and press the speak key → audio plays
- [ ] Press the stop key → audio stops at once
- [ ] Right-click speak a long passage, open the popup → it offers **Stop**, and Stop ends the speech

**Expected**: Commands work once bound; Stop ends speech from any entry point

---

## 3. Options/Settings Page Tests

### 3.1 Settings Page Access ✅ / ❌
- [ ] Click settings gear icon in popup → Opens options page
- [ ] Right-click extension icon → "Options" → Opens options page
- [ ] Navigate to `chrome://extensions` → Details → "Extension options"

**Expected**: Options page opens successfully via all methods

---

### 3.2 Voice Preference Persistence ✅ / ❌
1. [ ] Open options page
2. [ ] Change voice to "Michael"
3. [ ] Click "Save Settings"
4. [ ] Close options page
5. [ ] Open popup → Verify voice is "Michael"
6. [ ] Close and reopen popup → Verify still "Michael"
7. [ ] Restart Chrome → Verify still "Michael"

**Expected**: Voice preference persists across sessions

---

### 3.3 Speed Preference Persistence ✅ / ❌
1. [ ] Open options page
2. [ ] Change speed to 1.5x
3. [ ] Click "Save Settings"
4. [ ] Close options page
5. [ ] Open popup → Verify speed is 1.5x
6. [ ] Restart Chrome → Verify still 1.5x

**Expected**: Speed preference persists across sessions

---

### 3.4 When the Helper Isn't Running ✅ / ❌
1. [ ] Open options page; the setting shows **Use system voices** (the default)
2. [ ] Change it to **Show an error**, click "Save Settings"
3. [ ] Stop the helper, right-click a selection → "Speak selected text"
4. [ ] Verify the toolbar icon shows a red **!**, and hovering it gives the reason
5. [ ] Change the setting back to **Use system voices**, save, right-click again
6. [ ] Verify a system voice speaks, and the icon shows a grey **i** whose tooltip says to install the helper
7. [ ] Start the helper, speak again → the badge clears

**Expected**: The setting decides between a system voice and an error, on both the popup and the right-click path

---

### 3.5 Reset to Defaults ✅ / ❌
1. [ ] Change voice to "Sarah"
2. [ ] Change speed to 1.8x
3. [ ] Click "Reset to Defaults"
4. [ ] Confirm reset dialog
5. [ ] Verify:
   - [ ] Voice returns to "Heart"
   - [ ] Speed returns to 1.0x
6. [ ] Verify success message shown

**Expected**: All settings reset to default values

---

### 3.6 Popup and Options Share Settings ✅ / ❌
1. [ ] Open popup, change voice to "Nicole"
2. [ ] Save (settings auto-save in popup)
3. [ ] Open options page
4. [ ] Verify voice shows "Nicole" in options
5. [ ] Change voice in options to "Adam"
6. [ ] Save settings
7. [ ] Open popup
8. [ ] Verify popup shows "Adam"

**Expected**: Popup and options read and write the same settings (`chrome.storage.local`; not synced to other computers)

---

## 4. Error Handling Tests

### 4.1 Network Errors ✅ / ❌
- [ ] Stop helper mid-request
- [ ] Verify graceful error handling
- [ ] Verify error message is user-friendly (for example "The Natural TTS helper is not running. Start it, then try again."), never "Server error: 500"

**Expected**: No crashes, clear error messages

---

### 4.2 Invalid Input ✅ / ❌
- [ ] Select empty text (whitespace only)
- [ ] Verify warning: "Select some text on the page first."
- [ ] Select text with nothing speakable (only emoji, or only CJK) → "There is no speakable text in the selection."

**Expected**: Validation prevents empty requests

---

### 4.3 Console Errors ✅ / ❌
Check for errors in:
- [ ] **Background Service Worker**: `chrome://extensions` → "Service worker" → "inspect views"
- [ ] **Popup Console**: Right-click popup → Inspect
- [ ] **Options Console**: Right-click options page → Inspect

**Expected**: No uncaught errors or warnings

---

## 5. Performance Tests

### 5.1 Speed Tests ✅ / ❌
- [ ] **Short text** (10 words) - Should generate in < 2 seconds
- [ ] **Medium text** (50 words) - Should generate in < 5 seconds
- [ ] **Long text** (200 words) - Should complete without timeout

**Expected**: Reasonable generation times, no hangs

---

### 5.2 Memory Usage ✅ / ❌
1. [ ] Open Chrome Task Manager (`Shift + Esc`)
2. [ ] Find "Natural TTS" extension
3. [ ] Generate 10 TTS requests
4. [ ] Verify memory doesn't continuously grow

**Expected**: Memory usage stays reasonable (< 100MB)

---

### 5.3 Concurrent Requests ✅ / ❌
- [ ] Click "Speak" button rapidly 5 times
- [ ] Verify only one request is sent (clicks while it generates are ignored)
- [ ] Right-click speak a second selection while the first plays → the second replaces the first
- [ ] Verify no overlapping audio

**Expected**: One request at a time, no audio overlap

---

## 6. UI/UX Tests

### 6.1 Visual Design ✅ / ❌
- [ ] Popup: Clean layout, no text overflow
- [ ] Options: Sections well-organized
- [ ] Focus indicators visible on Tab navigation
- [ ] Hover states work on all buttons
- [ ] Status pill label and colour match the state (Checking, Warming, Connected, Offline)

**Expected**: Professional, polished UI

---

### 6.2 Keyboard Navigation ✅ / ❌
Popup:
- [ ] Tab through all elements (voice, speed, speak, settings)
- [ ] Enter key triggers "Speak" button
- [ ] Arrow keys adjust speed slider (known issue at 1.5.0: the popup slider moves only with PageUp/PageDown and the − and + buttons; see ACCESSIBILITY.md, Known issues)
- [ ] Escape closes popup

Options:
- [ ] Tab through all form elements
- [ ] Enter activates buttons

**Expected**: Full keyboard accessibility

---

### 6.3 Screen Reader Support ✅ / ❌
Test with VoiceOver (macOS):
- [ ] Enable VoiceOver (`Cmd + F5`)
- [ ] Navigate popup with VoiceOver
- [ ] Verify all ARIA labels are announced
- [ ] Verify live region announcements (messages)
- [ ] Test slider value announcements

**Expected**: Fully screen reader accessible

---

## 7. Browser Compatibility Tests

### 7.1 Chrome Versions ✅ / ❌
- [ ] **Chrome Stable** (latest) - Primary target
- [ ] **Chrome Beta** (if available)
- [ ] Verify extension works on all tested versions

**Expected**: Works on Chromium 148+ (`minimum_chrome_version`); Chrome refuses to install it on older versions

---

### 7.2 Edge Chromium ✅ / ❌
- [ ] Load extension in Microsoft Edge
- [ ] Test core TTS functionality
- [ ] Verify context menu works

**Expected**: Works identically to Chrome

---

## 8. Edge Cases & Stress Tests

### 8.1 Special Characters ✅ / ❌
- [ ] Text with emojis: "Hello 👋 World"
- [ ] Text with numbers: "The year 2025"
- [ ] Text with symbols: "Price: $19.99"
- [ ] Text with URLs: "Visit example.com"

**Expected**: Handles gracefully, no crashes

---

### 8.2 Different Languages ✅ / ❌
- [ ] Spanish text: "Hola mundo"
- [ ] French text: "Bonjour le monde"
- [ ] German text: "Hallo Welt"
- [ ] Japanese or Russian text

**Expected**: Latin-script text is read with English pronunciation (accents folded). Text in other scripts is
dropped by the helper's ASCII folding, so an all-CJK or all-Cyrillic selection reports "There is no speakable
text in the selection."

---

### 8.3 Repeated Use ✅ / ❌
- [ ] Generate 20 TTS requests in a row
- [ ] Verify no degradation in quality
- [ ] Verify no memory leaks

**Expected**: Consistent performance over time

---

## 9. Documentation Tests

### 9.1 README Accuracy ✅ / ❌
- [ ] Follow installation instructions in README
- [ ] Verify all commands work as documented
- [ ] Verify feature list matches actual features

**Expected**: Documentation is accurate and up-to-date

---

### 9.2 INSTALL Guide ✅ / ❌
- [ ] Follow INSTALL.md step-by-step
- [ ] Verify all steps work correctly
- [ ] Check troubleshooting section covers common issues

**Expected**: Installation guide is complete and correct

---

### 9.3 PRIVACY Policy ✅ / ❌
- [ ] Review PRIVACY.md claims
- [ ] Verify no data is sent externally (use Network tab)
- [ ] Verify only localhost requests are made

**Expected**: Privacy claims are accurate

---

## 10. Automated Tests

### 10.1 Unit Tests ✅ / ❌
```bash
cd chrome-extension
bun test
```
- [ ] All tests pass (at v1.5.0: 242 pass, 7 skipped, 0 fail; the skips are the live-helper suite)
- [ ] No flaky tests
- [ ] `bun run type-check` and `bun run build` succeed

**Expected**: 100% test pass rate

---

### 10.2 Integration Tests ✅ / ❌
```bash
NTTS_LIVE_HELPER_PORT=8249 bun test tests/integration   # against a running helper
bun run test:e2e                                        # headed Chrome for Testing + mock helper
```
- [ ] API client integration tests pass
- [ ] End-to-end suite passes

**Expected**: All integration tests green

---

## 11. Security Tests

### 11.1 Permissions ✅ / ❌
- [ ] Permissions are exactly `storage`, `contextMenus`, `activeTab`, `scripting`, `offscreen`, `tts`
- [ ] Host permissions are exactly `http://127.0.0.1/*`; no content scripts
- [ ] `bun run verify:permissions` prints only `["Read and change your data on 127.0.0.1"]`

**Expected**: Minimal permissions, no overreach

---

### 11.2 Network Security ✅ / ❌
- [ ] Open Chrome DevTools → Network tab
- [ ] Generate TTS request
- [ ] Verify only `http://127.0.0.1` requests, on ports 8249-8260
- [ ] Verify no external network calls

**Expected**: Zero external network traffic

---

### 11.3 Content Security Policy ✅ / ❌
- [ ] manifest.json sets no `content_security_policy`, so Manifest V3's default applies
- [ ] No inline scripts in HTML
- [ ] No eval() usage in code

**Expected**: MV3's default CSP holds (no inline scripts, no eval, no remote code)

---

## 12. Final Checklist

### Pre-Release Requirements
- [ ] All automated tests pass (`bun test`)
- [ ] All manual tests completed above
- [ ] No critical or high-priority bugs
- [ ] Documentation is complete and accurate
- [ ] CHANGELOG.md updated with v1.5.0 changes
- [ ] Version numbers synced: package.json, manifest.json, Models.swift, pyproject.toml, the formula url and a dated
  CHANGELOG section (`scripts/release/release.sh` preflight checks all six)
- [ ] Store images and README media captured (see `scripts/capture/README.md`)
- [ ] Clean git state (no uncommitted changes)

### Release Readiness ✅ / ❌
- [ ] Extension is stable and production-ready
- [ ] User-facing features work correctly
- [ ] Error handling is robust
- [ ] Performance is acceptable
- [ ] Accessibility is excellent (WCAG AA)
- [ ] Documentation is comprehensive

---

## Testing Summary

**Test Date**: _____________
**Tester**: _____________
**Environment**:
- Chrome Version: _____________
- macOS Version: _____________
- Helper Version: _____________

**Results**:
- Total Tests: ______
- Passed: ✅ ______
- Failed: ❌ ______
- Skipped: ⏭️ ______

**Critical Issues Found**: (list here if any)

**Recommendation**:
- [ ] ✅ **APPROVED** - Ready for v1.5.0 release
- [ ] ❌ **NOT APPROVED** - Critical issues must be fixed

---

## Notes

- **Priority**: Focus on sections 1-4 (core functionality) first
- **Time Estimate**: Allow 2-3 hours for complete testing
- **Automation**: `bun run test:e2e` already drives context-menu speech, a 40 s synthesis, Stop and the helper-down badge in Chrome for Testing
- **Regression**: Re-run this checklist for all minor/major releases

---

**Testing complete!** If all checks pass, the release can be tagged.
