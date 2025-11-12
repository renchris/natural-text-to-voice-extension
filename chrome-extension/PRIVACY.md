# Privacy Policy
**Natural Text-to-Speech Chrome Extension**

**Last Updated**: November 2025
**Version**: 1.4.0

---

## Overview

Natural Text-to-Speech is a **100% local, privacy-first** Chrome extension. This privacy policy explains how the extension handles your data and protects your privacy.

**TL;DR**:
- ✅ All processing happens on your device
- ✅ No data is sent to external servers
- ✅ No analytics, tracking, or telemetry
- ✅ No user accounts or cloud storage
- ✅ Open source and auditable

---

## Data Collection

### What Data We Collect

**We collect ZERO data.**

The Natural Text-to-Speech extension does not:
- ❌ Collect personal information
- ❌ Track your browsing history
- ❌ Record text you convert to speech
- ❌ Upload any data to external servers
- ❌ Use analytics or telemetry services
- ❌ Store cookies or persistent identifiers
- ❌ Share data with third parties

### What Data Stays Local

The extension stores minimal settings data **locally on your device only**:

| Data Type | Storage Location | Purpose | Synced? |
|-----------|------------------|---------|---------|
| Voice preference | Chrome Storage Sync | Remember your selected voice | Yes (via Chrome Sync) |
| Playback speed | Chrome Storage Sync | Remember your speed setting | Yes (via Chrome Sync) |
| Helper status cache | Chrome Storage Local | Optimize connection checks | No |

**Chrome Storage Sync**: If you enable Chrome Sync in your browser, these settings will sync across your devices using Google's encrypted sync service. You can disable this in Chrome settings.

---

## Data Processing

### Text-to-Speech Conversion

When you use the extension to convert text to speech:

1. **Text stays on your device**: Selected text is processed locally
2. **Local API call**: Extension sends text to `localhost:8249` (your own computer)
3. **Native helper processes**: The helper (running on your Mac) converts text to audio
4. **Audio plays locally**: Generated audio is played through your browser
5. **Nothing is stored**: Text and audio are discarded after playback

**Network diagram**:
```
┌─────────────┐         HTTP (localhost only)        ┌─────────────┐
│   Chrome    │ ──────────────────────────────────> │   Native    │
│  Extension  │         127.0.0.1:8249              │   Helper    │
│             │ <────────────────────────────────── │  (on your   │
│             │         Audio response               │    Mac)     │
└─────────────┘                                      └─────────────┘
```

---

## Network Requests

### Localhost Only

The extension makes **zero external network requests**. The only network communication is:

- **Destination**: `http://127.0.0.1:8249` (localhost)
- **Purpose**: Communicate with the native TTS helper running on your Mac
- **Data sent**: Text to convert, voice name, playback speed
- **Data received**: Generated audio (WAV format)

**Security**: The native helper only accepts connections from `localhost` and rejects all external requests.

### No External Servers

The extension does **NOT** connect to:
- ❌ Cloud APIs
- ❌ Analytics services (Google Analytics, Mixpanel, etc.)
- ❌ Advertising networks
- ❌ Content delivery networks (CDNs)
- ❌ Update servers
- ❌ Authentication servers
- ❌ Any third-party services

---

## Chrome Permissions

The extension requests minimal permissions required for functionality:

| Permission | Purpose | Risk Level |
|------------|---------|------------|
| `storage` | Save voice and speed preferences locally | ⚪ Minimal |
| `contextMenus` | Add "Speak selected text" to right-click menu | ⚪ Minimal |
| `activeTab` | Access selected text when you click context menu | 🟡 Low |
| `scripting` | Inject content script to retrieve selected text | 🟡 Low |
| `offscreen` | Play audio in background (Chrome API requirement) | ⚪ Minimal |

### Host Permissions

The extension declares:
```json
"host_permissions": ["http://127.0.0.1/*"]
```

**Why**: To communicate with the native helper on `localhost:8249`
**Risk**: Minimal (localhost only, no external hosts)

### Content Scripts

The extension injects a content script on `<all_urls>` to:
- Detect when you select text
- Retrieve selected text when you use the context menu

**What it does NOT do**:
- ❌ Modify webpage content
- ❌ Inject ads or tracking scripts
- ❌ Read passwords or form data
- ❌ Monitor your browsing activity

---

## Third-Party Services

### None

The extension uses **zero third-party services**:
- No analytics (Google Analytics, Amplitude, etc.)
- No crash reporting (Sentry, Bugsnag, etc.)
- No A/B testing platforms
- No advertising networks
- No social media integrations

---

## Open Source Transparency

### Auditable Code

The extension is **fully open source** under the MIT License:
- **Repository**: [GitHub](https://github.com/yourusername/natural-text-to-voice-extension)
- **License**: MIT (permissive, allows auditing)
- **Audit**: Anyone can review the source code to verify privacy claims

### Technologies Used

- **Frontend**: TypeScript, Vite, Bun
- **Backend**: Swift (SwiftNIO), Python (MLX framework)
- **ML Model**: Kokoro-82M (local inference, no cloud)

All dependencies are open source and listed in `package.json`.

---

## Data Retention

### Short-Term (Session Only)

The following data is stored **temporarily** and discarded after use:
- Selected text (cleared after TTS generation)
- Generated audio (cleared after playback)
- API responses (cleared after processing)

### Long-Term (Persistent)

The only persistent data is:
- Voice preference (stored until you change it or uninstall)
- Playback speed (stored until you change it or uninstall)

**Storage location**: Chrome Storage API (encrypted by Chrome)

---

## User Rights

### Your Data, Your Control

You have full control over your data:

**Access**: All data is stored locally and accessible via Chrome DevTools
**Modify**: Change settings anytime via the Options page
**Delete**: Uninstall the extension to remove all stored data
**Export**: Settings are human-readable JSON (no proprietary format)

### No Accounts

The extension does **not** require:
- User accounts
- Email addresses
- Login credentials
- Payment information

---

## Children's Privacy

The extension is safe for all ages. We do not:
- Collect data from children (or anyone)
- Require age verification
- Show targeted advertising
- Share data with third parties

The extension complies with COPPA (Children's Online Privacy Protection Act) by collecting zero personal information.

---

## Changes to This Policy

We may update this privacy policy as the extension evolves. Changes will be:
- Documented in the [CHANGELOG](../CHANGELOG.md)
- Reflected in the "Last Updated" date above
- Published in the repository before release

**Current version**: 1.4.0 (Documentation Release)

---

## Contact

### Questions or Concerns?

If you have privacy questions or concerns:

1. **File an issue**: [GitHub Issues](https://github.com/yourusername/natural-text-to-voice-extension/issues)
2. **Review the code**: Source code is fully public and auditable
3. **Email**: [Your contact email if applicable]

### Security Issues

If you discover a security vulnerability:
1. **Do NOT** open a public issue
2. **Email**: [Security contact email]
3. We will respond within 48 hours

---

## Compliance

### Legal Framework

This extension is designed to comply with:
- ✅ **GDPR** (General Data Protection Regulation) - EU
- ✅ **CCPA** (California Consumer Privacy Act) - California, USA
- ✅ **COPPA** (Children's Online Privacy Protection Act) - USA
- ✅ **Chrome Web Store Policies** - Google

**How we comply**: By collecting zero personal data, we avoid most regulatory requirements.

### Data Protection Principles

We adhere to:
1. **Data minimization**: Collect only what's necessary (settings only)
2. **Purpose limitation**: Use data only for stated purposes
3. **Storage limitation**: Keep data only as long as needed
4. **Security**: Use Chrome's encrypted storage
5. **Transparency**: Open source code and clear documentation

---

## Summary

### Privacy Highlights

| Aspect | Status |
|--------|--------|
| Data collection | ❌ None |
| External servers | ❌ None |
| Analytics/tracking | ❌ None |
| Third-party services | ❌ None |
| User accounts | ❌ None |
| Cloud processing | ❌ None |
| Local processing | ✅ 100% |
| Open source | ✅ Yes |
| Minimal permissions | ✅ Yes |

### Your Privacy Is Our Priority

Natural Text-to-Speech is built with **privacy by design**:
- All processing happens on your device
- No data leaves your computer (except to localhost)
- No tracking, no analytics, no telemetry
- Open source and auditable
- Minimal permissions

**We respect your privacy because we believe it's a fundamental right.**

---

## Acknowledgments

Thank you for trusting Natural Text-to-Speech. If you have any questions about this privacy policy, please don't hesitate to reach out via the contact methods above.

---

**Built with ❤️ for privacy and performance**
