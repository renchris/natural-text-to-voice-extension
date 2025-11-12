# Manual Testing Checklist
**Natural Text-to-Speech Chrome Extension v1.4.0**

**Pre-Release Testing Checklist**

This checklist ensures all functionality works correctly before tagging and releasing v1.4.0. Complete all sections and mark items as ✅ (pass), ❌ (fail), or ⏭️ (skipped).

---

## Pre-Testing Setup

### Environment Preparation
- [ ] **Native Helper Running**
  ```bash
  cd ../native-helper
  .build/release/natural-tts-helper
  ```
  - Verify: Terminal shows "Ready to serve requests"
  - Verify: Port 8249 is listening

- [ ] **Extension Loaded in Chrome**
  ```bash
  cd chrome-extension
  bun run build
  ```
  - Load `dist/` folder in `chrome://extensions`
  - Verify: Extension appears in toolbar
  - Verify: No console errors on load

- [ ] **Clean State**
  - Clear extension storage: `chrome://extensions` → Details → "Clear storage"
  - Restart Chrome
  - Reload extension

---

## 1. Installation & Setup Tests

### 1.1 First-Time Installation ✅ / ❌
- [ ] Extension loads without errors
- [ ] Default settings are applied (Bella voice, 1.0x speed)
- [ ] Status indicator shows "checking" then "connected"
- [ ] Voice dropdown populates with 6 voices
- [ ] No console errors in background service worker

**Expected Behavior**: Extension initializes successfully with defaults

---

### 1.2 Helper Connection Tests ✅ / ❌

#### Test 1.2a: Helper Running (Normal Case)
- [ ] Start helper before opening extension
- [ ] Open popup → Status indicator shows green
- [ ] Voices load correctly
- [ ] "Speak" button is enabled

**Expected**: Green status indicator, all features enabled

#### Test 1.2b: Helper Not Running (Error Case)
- [ ] Stop helper (Ctrl+C in terminal)
- [ ] Open popup → Status indicator shows red
- [ ] Error message: "Native helper not running..."
- [ ] "Retry Connection" button appears
- [ ] "Speak" button is disabled
- [ ] Voice dropdown shows "Helper not connected"

**Expected**: Graceful degradation with clear error messaging

#### Test 1.2c: Retry Connection
- [ ] Start helper while popup is open
- [ ] Click "Retry Connection" button
- [ ] Status indicator changes from red → yellow → green
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
4. [ ] Click "Speak Selected Text" button
5. [ ] Verify audio plays
6. [ ] Verify message: "Playing audio..."

**Expected**: Clear speech audio at normal speed (1.0x)

#### Test 2.1b: No Text Selected
1. [ ] Open popup without selecting text
2. [ ] Click "Speak Selected Text"
3. [ ] Verify warning message: "Please select text..."

**Expected**: Clear warning, no errors

#### Test 2.1c: Long Text (> 5000 characters)
1. [ ] Select very long text (> 5000 chars)
2. [ ] Click "Speak Selected Text"
3. [ ] Verify warning: "Text is too long..."

**Expected**: Validation prevents overflow

---

### 2.2 Voice Selection ✅ / ❌

#### Test Each Voice:
Test all 6 voices individually:

- [ ] **Bella (US)** - Female voice
- [ ] **Nicole** - Female voice
- [ ] **Sarah** - Female voice
- [ ] **Sky** - Female voice
- [ ] **Adam** - Male voice
- [ ] **Michael** - Male voice

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
- [ ] **Accented**: "Café résumé" → Should pronounce correctly

**Expected**: Text normalizes correctly, no pronunciation errors

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

### 3.4 Checkbox Settings ✅ / ❌

#### Test 3.4a: Auto-play Checkbox
1. [ ] Open options page
2. [ ] Check "Auto-play audio from context menu"
3. [ ] Save settings
4. [ ] Use context menu to speak text
5. [ ] Verify audio plays immediately (no manual start)

**Expected**: Auto-play works as configured

#### Test 3.4b: Helper Auto-retry Checkbox
1. [ ] Open options page
2. [ ] Check "Automatically retry connection"
3. [ ] Save settings
4. [ ] Stop helper
5. [ ] Open popup → Verify automatic retry attempts

**Expected**: Extension attempts reconnection automatically

---

### 3.5 Reset to Defaults ✅ / ❌
1. [ ] Change voice to "Sarah"
2. [ ] Change speed to 1.8x
3. [ ] Check both checkboxes
4. [ ] Click "Reset to Defaults"
5. [ ] Confirm reset dialog
6. [ ] Verify:
   - [ ] Voice returns to "Bella"
   - [ ] Speed returns to 1.0x
   - [ ] Checkboxes reset to defaults
7. [ ] Verify success message shown

**Expected**: All settings reset to default values

---

### 3.6 Settings Sync ✅ / ❌
1. [ ] Open popup, change voice to "Nicole"
2. [ ] Save (settings auto-save in popup)
3. [ ] Open options page
4. [ ] Verify voice shows "Nicole" in options
5. [ ] Change voice in options to "Adam"
6. [ ] Save settings
7. [ ] Open popup
8. [ ] Verify popup shows "Adam"

**Expected**: Settings sync across popup and options

---

## 4. Error Handling Tests

### 4.1 Network Errors ✅ / ❌
- [ ] Stop helper mid-request
- [ ] Verify graceful error handling
- [ ] Verify error message is user-friendly

**Expected**: No crashes, clear error messages

---

### 4.2 Invalid Input ✅ / ❌
- [ ] Select empty text (whitespace only)
- [ ] Verify warning: "Please select text..."

**Expected**: Validation prevents empty requests

---

### 4.3 Console Errors ✅ / ❌
Check for errors in:
- [ ] **Background Service Worker**: `chrome://extensions` → "Service worker" → "inspect views"
- [ ] **Popup Console**: Right-click popup → Inspect
- [ ] **Options Console**: Right-click options page → Inspect
- [ ] **Content Script**: Any webpage → F12 → Console

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
- [ ] Verify only one request processes at a time
- [ ] Verify no race conditions or overlapping audio

**Expected**: Requests queue properly, no audio overlap

---

## 6. UI/UX Tests

### 6.1 Visual Design ✅ / ❌
- [ ] Popup: Clean layout, no text overflow
- [ ] Options: Sections well-organized
- [ ] Focus indicators visible on Tab navigation
- [ ] Hover states work on all buttons
- [ ] Status indicator colors correct (red/yellow/green)

**Expected**: Professional, polished UI

---

### 6.2 Keyboard Navigation ✅ / ❌
Popup:
- [ ] Tab through all elements (voice, speed, speak, settings)
- [ ] Enter key triggers "Speak" button
- [ ] Arrow keys adjust speed slider
- [ ] Escape closes popup

Options:
- [ ] Tab through all form elements
- [ ] Space toggles checkboxes
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

**Expected**: Works on Chrome 88+

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

**Expected**: English model attempts pronunciation (may not be perfect)

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
- [ ] All tests pass (128/128)
- [ ] No flaky tests
- [ ] Coverage is adequate

**Expected**: 100% test pass rate

---

### 10.2 Integration Tests ✅ / ❌
- [ ] API client integration tests pass
- [ ] Helper connectivity tests pass

**Expected**: All integration tests green

---

## 11. Security Tests

### 11.1 Permissions ✅ / ❌
- [ ] Verify only required permissions requested
- [ ] No unnecessary host permissions
- [ ] Storage permission used correctly

**Expected**: Minimal permissions, no overreach

---

### 11.2 Network Security ✅ / ❌
- [ ] Open Chrome DevTools → Network tab
- [ ] Generate TTS request
- [ ] Verify only `http://127.0.0.1:8249` requests
- [ ] Verify no external network calls

**Expected**: Zero external network traffic

---

### 11.3 Content Security Policy ✅ / ❌
- [ ] Verify manifest.json has strict CSP
- [ ] No inline scripts in HTML
- [ ] No eval() usage in code

**Expected**: Strict CSP enforced

---

## 12. Final Checklist

### Pre-Release Requirements
- [ ] All automated tests pass (`bun test`)
- [ ] All manual tests completed above
- [ ] No critical or high-priority bugs
- [ ] Documentation is complete and accurate
- [ ] CHANGELOG.md updated with v1.4.0 changes
- [ ] Version numbers synced (manifest.json, package.json)
- [ ] Screenshots captured (see SCREENSHOTS_GUIDE.md)
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
- [ ] ✅ **APPROVED** - Ready for v1.4.0 release
- [ ] ❌ **NOT APPROVED** - Critical issues must be fixed

---

## Notes

- **Priority**: Focus on sections 1-4 (core functionality) first
- **Time Estimate**: Allow 2-3 hours for complete testing
- **Automation**: Sections 2-5 could be automated in future (Playwright/Puppeteer)
- **Regression**: Re-run this checklist for all minor/major releases

---

**Testing complete!** If all checks pass, proceed to STEP 8: Update CHANGELOG and STEP 9: Release.
