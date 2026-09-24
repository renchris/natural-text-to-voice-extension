# Accessibility Review
**Natural TTS: Private Kokoro Voices for Mac**

**Review Date**: 2026-09-24
**Version Reviewed**: 1.5.0
**Standard**: WCAG 2.1 Level AA, as the target
**Method**: code review of the popup and options pages, with contrast ratios computed from the CSS tokens. The
November 2025 audit this replaces (of v1.4.0) described a UI that has since been redesigned, and its VoiceOver
and zoom results have **not** been re-run on 1.5.0. Treat this as a self-assessment, not a certification.

---

## Summary

The popup and options pages use native controls, labelled form fields, visible focus rings, live regions whose
urgency follows the message's severity, and `prefers-reduced-motion`. Two text colours fall just short of
the 4.5:1 AA contrast ratio, and the popup's log-scale slider does not move with arrow keys (PageUp/PageDown and
the − and + buttons beside it do the same job from the keyboard). See [Known issues](#known-issues).

**Key Strengths**:
- Native `<button>`, `<select>` and `<input type="range">` everywhere; no div-buttons
- Every control has a `<label>` or an `aria-label`
- The status pill is a `role="status"` live region with a text label, not a colour dot
- Messages are `role="status"`/polite for info and success, `role="alert"`/assertive for warnings and errors
- A visible 2px `:focus-visible` outline on every focusable element
- Animations stop under `prefers-reduced-motion: reduce`

---

## Detailed Findings

### 1. Keyboard Navigation

#### Popup Interface (`src/popup/popup.html`)
- **Tab Navigation**: all interactive elements are native and reachable with Tab, in visual order
  - Settings button: lines 15-24
  - Voice dropdown: lines 64-70
  - Speed − button, slider, + button: lines 85-100
  - Speak / Stop button: lines 111-125
  - Retry button (shown when offline): lines 127-135
  - Footer shortcut chip (opens `chrome://extensions/shortcuts`): line 139
  - The install and update notices' links, when shown: lines 50 and 56

- **Keys**:
  - Enter or Space on the focused Speak button activates it once (native `<button>` behaviour; the popup adds
    no keydown handler of its own)
  - While audio plays the same button is an enabled **Stop**
  - Escape closes the popup (browser default)
  - The extension's two commands, *Speak the selected text* and *Stop speaking*, ship with no keys bound, so
    they never take a key from a page or from macOS Option-key typing; users bind them at
    `chrome://extensions/shortcuts`

- **Focus Indicators**: `src/popup/popup.css:369-376`
  - `*:focus-visible` draws a 2px solid outline in the brand primary colour, offset 2px (3px on the Speak button)

#### Options Page (`src/options/options.html`)
- **Tab Navigation**: voice select (lines 35-41), speed slider (55-68), "When the helper isn't running" select
  (80-87), Save (108-114) and Reset (115-121)
- **Focus Indicators**: `src/options/options.css:514-517`, the same 2px outline
- Reset asks for confirmation (`confirm()`) before it discards settings

---

### 2. Screen Reader Support

#### ARIA Labels

**Popup**:
- Settings button: `aria-label="Open settings"` (line 19)
- Status pill: `role="status" aria-live="polite"`, `aria-label="Helper status: checking"` (lines 29-31),
  updated to `connected`, `warming` or `offline` by `updateStatusIndicator` (`popup.ts:397-408`)
- Voice select: `aria-label="Select voice for text-to-speech"` (line 67), plus `<label for="voiceSelect">`;
  each option carries its group, e.g. `aria-label="British Female: Emma"` (`shared/voice-options.ts`)
- Speed slider: `aria-label="Adjust speech speed"` (line 94); − and + buttons: `aria-label="Decrease speed"` /
  `"Increase speed"` (lines 85, 100)
- Speak button: `aria-label="Generate speech from selected text"` (line 114)
- Retry button: `aria-label="Retry connection to native helper"` (line 131)
- Decorative SVG icons and the spinner are `aria-hidden="true"`

**Options**:
- Voice select: `aria-label="Select default voice for text-to-speech"` (line 38)
- Speed slider: `aria-label="Adjust default speech speed"` (line 63)
- Fallback select: `<label for="fallbackSelect">` and `aria-describedby="fallbackHelp"` (lines 79-83)
- Save button: `aria-label="Save settings"` (line 111)
- Reset button: `aria-label="Reset to default settings"` (line 118)
- Status: a coloured dot with `aria-label="Helper status indicator"` (line 19) next to a visible text line
  (`#statusText`, line 21). The dot is a plain `<div>` without a role, so its label is not announced; the text
  line carries the state.

#### ARIA Live Regions
- **Message Container** (popup line 42, options line 26): `role="status" aria-live="polite"` by default. For
  warnings and errors the popup switches it to `role="alert" aria-live="assertive"`, and back for info and
  success (`popup.ts:885-893`).
- **Engine line** (popup line 45): `aria-live="polite"`, announces "Kokoro · Bella (US)" or "System voice".
- **Speed Value** (popup line 81, options line 52): `aria-live="polite"`.

#### ARIA Value Attributes (Range Sliders)
- **Options**: a linear slider, `min="0.5" max="2.0" step="0.1"`, with matching `aria-valuenow` and
  `aria-valuetext="1.0 times speed"`, updated in `options.ts:160-161`.
- **Popup**: a **log-scale** slider. The input's own range is a position from 0 to 1 (`step="0.001"`), so
  `aria-valuemin="0.5"`, `aria-valuemax="2.0"`, `aria-valuenow` and `aria-valuetext` report the speed instead
  (updated in `popup.ts:559-560`).

#### Semantic HTML
- `<header>`, `<main>`, `<footer>` (popup), `<section>` with `<h2>` headings (options)
- `<h1>` page titles; `<label>` elements associated with every form control
- `<html lang="en">` and a descriptive `<title>` on both pages

---

### 3. Visual Accessibility

#### Color Contrast
Computed with the WCAG 2.1 formula from `src/shared/variables.css` and the page CSS. The popup background is
`--color-bg-primary` `#FAFAFA`. `--color-primary` is the brand indigo `#3D4ED7` in every browser (the `oklch()`
override that rendered `#076BE3` was removed in 1.5.0, so the popup matches the icon).

| Text | Size | Ratio | AA (4.5:1) |
|---|---|---:|---|
| Primary text `#202124` on `#FAFAFA` | 13-16px | 15.42 | ✅ |
| Secondary text `#5F6368` on `#FAFAFA` (slider labels, footer) | 11px | 5.80 | ✅ |
| White on primary `#3D4ED7` (Speak button) | 14px | 6.42 | ✅ |
| White on deep ink `#1B2060` (Stop button, while speaking) | 14px | 14.77 | ✅ |
| **Warming** pill: `#A05000` on 15% `#F9AB00` | 11px | 5.01 | ✅ |
| **Offline** pill: `#B71C1C` on 12% `#D93025` | 11px | 5.27 | ✅ |
| **Connected** pill: `#0A7A42` on 15% `#0F9D58` | 11px | **4.38** | ❌ (by 0.12) |
| Error message: `#B71C1C` on 10% `#D93025` | 12px | 5.43 | ✅ |
| Warning message: `#A05000` on 10% `#F9AB00` | 12px | 5.18 | ✅ |
| Success message: `#0A7A42` on 10% `#0F9D58` | 12px | 4.64 | ✅ |
| Info message: primary `#3D4ED7` on 8% `#3D4ED7` | 12px | 5.47 | ✅ |

**Focus Indicators**: the primary colour against `#FAFAFA` is 6.15:1, above the 3:1 that WCAG 2.1 asks of
non-text contrast.

#### Font Sizes
- Smallest text: 11px (status pill, slider labels, footer)
- Body text: 12-14px; headings 16px (popup) and larger on the options page

#### Motion
`@media (prefers-reduced-motion: reduce)` stops the status-dot pulse, the message slide-in, the spinner and the
button press transforms (`popup.css:397-403`, `options.css:565`).

#### Color independence
The status pill always carries a text label (Checking, Warming, Connected, Offline); colour is never the only
signal. The toolbar badge uses a symbol ("!" or "i") and a tooltip with the reason.

---

### 4. Language and Internationalization

#### Language Declaration
- Both HTML files declare: `<html lang="en">`
- Allows screen readers to use correct pronunciation

#### Text Expansion
- The UI is English only; it has no translations to expand into

---

### 5. Form Accessibility

#### Labels
All form controls have proper labels:
- Voice selects: `<label for="voiceSelect">` explicitly associated
- Sliders: `<label for="speedSlider">` explicitly associated
- Fallback select: `<label for="fallbackSelect">`, with its help text linked by `aria-describedby`

#### Helper Text
Descriptive help text provided for complex controls:
- Voice select: "Choose the voice that will be used by default in the popup and context menu."
- Speed slider: visual labels (0.5x, 1.0x, 1.5x, 2.0x on the options page; 0.5x, 1.0x, 2.0x on the popup's
  log scale)
- Fallback select: "System voices are built into your Mac. The natural Kokoro voices need the free Natural TTS helper."

#### Error Messages
Accessible error handling:
- In the popup, errors and warnings switch the message container to `role="alert"` / assertive, so they are
  announced at once
- Messages say what happened and what to do ("The helper’s voice engine stopped. Restart the helper, then click
  Retry."), never a raw status code

---

## Testing Methodology

### This review (2026-09-24, v1.5.0)
1. **Code review** of `popup.html`, `popup.ts`, `options.html`, `options.ts`, `popup.css`, `options.css` and
   `variables.css`, with the line anchors above
2. **Contrast**: computed from the tokens, alpha backgrounds blended
   over `#FAFAFA`
3. **Automated**: the unit suite (`bun test`) covers the popup and options behaviour, including the status
   labels and message roles

### Not re-run on 1.5.0
- VoiceOver navigation of the popup and options page
- Zoom at 200% and 400%
- Keyboard-only walkthrough in a real browser

These are the open items for the next review; `TESTING_CHECKLIST.md` §6.2-6.3 lists the steps.

---

## Known issues

1. **Connected pill contrast, 4.38:1** (needs 4.5:1 at 11px). Darkening `--color-success-text` slightly, or
   lowering the pill's background tint, would clear it.
2. *Fixed in 1.5.0:* the info message was 4.21:1 with the old `oklch()` primary (`#076BE3`) on a `#1A73E8`
   tint. With the brand `#3D4ED7` on its own 8% tint it is 5.47:1.
3. **Popup slider and arrow keys** (confirmed in headless Chromium 153 against the built popup, 2026-09-24).
   The slider's range is a 0-1 position with `step="0.001"`, and `handleSpeedChange` snaps every input to the
   nearest 0.1×. An arrow press moves the position by 0.001, which rounds back to the same speed: five
   ArrowRight presses left it at 1.0×. PageUp/PageDown (a tenth of the range) do move it, by about 0.1×, and the
   − and + buttons step by 0.1× from the keyboard, so speed remains adjustable (WCAG 2.1.1 still holds). The
   options page slider is linear and unaffected.
4. **Options status dot** has an `aria-label` but no role, so the label is not exposed; the text beside it is.

---

## Recommendations

### Still open from the 2025 review (low priority)

#### 1. Add Skip Link
**Current**: No skip link on the options page
**Impact**: Minor; the page is short

#### 2. Label the Options Sections
**Current**: Sections use `<h2>` headings but no `aria-labelledby`
**Recommendation**: `<section aria-labelledby="voice-heading">` with an `id` on each `<h2>`

#### 3. Explicit Button Types on the Options Page
**Current**: The speed steppers and the shortcut chip declare `type="button"`; the popup's Settings, Speak
and Retry and the options page's Save and Reset do not. None is inside a `<form>`, so nothing submits, but an
explicit `type="button"` guards future edits.

---

## Accessibility Features Summary

### ✅ Implemented Features

| Feature | Popup | Options | Status |
|---------|-------|---------|--------|
| Semantic HTML | ✅ | ✅ | Complete |
| ARIA Labels | ✅ | ✅ | Complete |
| ARIA Live Regions | ✅ | ✅ | Complete |
| Keyboard Navigation | ✅ | ✅ | Complete |
| Focus Indicators | ✅ | ✅ | Complete |
| Color Contrast | ⚠️ | ✅ | 2 popup colours at 4.2-4.4:1 |
| Form Labels | ✅ | ✅ | Complete |
| Error Messages | ✅ | ✅ | Complete |
| Screen Reader Support | ✅ | ✅ | By code review; VoiceOver not re-run on 1.5.0 |
| Zoom Support | ⏸️ | ⏸️ | Not re-tested on 1.5.0 |

### 🎯 Best Practices Followed

1. **Semantic HTML**: `<header>`, `<main>`, `<footer>`, `<section>`, `<button>`
2. **Native controls first**: ARIA only where native semantics fall short (the log-scale slider's values)
3. **Focus Management**: Clear focus indicators on all interactive elements
4. **Live Regions**: urgency follows severity (polite for info, assertive for errors)
5. **Form Accessibility**: All inputs properly labeled and described
6. **Color Independence**: Information not conveyed by color alone
7. **Keyboard Commands**: shipped unbound, so they never conflict with page or system keys
8. **Reduced motion**: honoured on both pages

---

## WCAG 2.1 Compliance Checklist

### Level A (Required)

| Criterion | Status | Evidence |
|-----------|--------|----------|
| 1.1.1 Non-text Content | ✅ Pass | All icons have text alternatives |
| 1.3.1 Info and Relationships | ✅ Pass | Semantic HTML + ARIA |
| 1.3.2 Meaningful Sequence | ✅ Pass | Logical tab order |
| 2.1.1 Keyboard | ✅ Pass | All functionality keyboard accessible (popup speed via the − and + buttons) |
| 2.1.2 No Keyboard Trap | ✅ Pass | Can navigate away from all elements |
| 2.4.1 Bypass Blocks | ⚠️ Minor | No skip link (low priority for extension) |
| 2.4.2 Page Titled | ✅ Pass | Descriptive page titles |
| 2.4.3 Focus Order | ✅ Pass | Logical focus order |
| 2.4.4 Link Purpose | ✅ Pass | Descriptive button labels |
| 3.1.1 Language of Page | ✅ Pass | `lang="en"` declared |
| 3.2.1 On Focus | ✅ Pass | No unexpected context changes |
| 3.2.2 On Input | ✅ Pass | Form changes are expected |
| 4.1.1 Parsing | ✅ Pass | Valid HTML |
| 4.1.2 Name, Role, Value | ✅ Pass | ARIA labels on all controls |

### Level AA (Target)

| Criterion | Status | Evidence |
|-----------|--------|----------|
| 1.4.3 Contrast (Minimum) | ❌ 1 item | Connected pill 4.38:1; everything else ≥ 4.64:1 |
| 1.4.5 Images of Text | ✅ Pass | No images of text |
| 2.4.5 Multiple Ways | n/a | Two single-screen pages |
| 2.4.6 Headings and Labels | ✅ Pass | Descriptive headings/labels |
| 2.4.7 Focus Visible | ✅ Pass | Clear focus indicators |
| 3.1.2 Language of Parts | ✅ Pass | Single language (English) |
| 3.2.3 Consistent Navigation | ✅ Pass | Consistent UI patterns |
| 3.2.4 Consistent Identification | ✅ Pass | Consistent icons/labels |
| 3.3.1 Error Identification | ✅ Pass | Errors described in text |
| 3.3.2 Labels or Instructions | ✅ Pass | All inputs labeled |
| 3.3.3 Error Suggestion | ✅ Pass | Actionable error messages |
| 3.3.4 Error Prevention | ✅ Pass | Confirmation for reset |

**Overall**: WCAG 2.1 Level AA **except 1.4.3** (one colour, see [Known issues](#known-issues)), by code review.

---

## Conclusion

The 1.5.0 popup and options pages are built accessibly: native controls, complete labelling, severity-aware
live regions, visible focus and reduced-motion support. Before claiming WCAG 2.1 AA in a store listing, fix the
two contrast values and the popup slider's arrow keys, and re-run the VoiceOver and zoom checks listed above.

---

## Testing Checklist for Future Updates

When making changes to the UI, verify:
- [ ] All new interactive elements have ARIA labels
- [ ] New elements are keyboard accessible (Tab + Enter/Space)
- [ ] Focus indicators visible on new elements
- [ ] Color contrast meets 4.5:1 ratio for text
- [ ] Dynamic content uses ARIA live regions
- [ ] Forms have proper labels
- [ ] Error messages are descriptive
- [ ] Test with VoiceOver/NVDA screen reader
- [ ] Test with 200% zoom

---

**Reviewed**: 2026-09-24, by code review of v1.5.0
**Next Review**: after the known issues are fixed, with VoiceOver and zoom re-run
