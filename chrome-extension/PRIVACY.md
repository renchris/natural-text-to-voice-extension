# Privacy Policy: Natural TTS

This policy covers **Natural TTS: Private Kokoro Voices for Mac** (the Chrome extension) and the **Natural TTS helper**
(its companion app for macOS).

Version 1.5.0 · Effective 23 September 2026

<!-- Every statement below is traced to the 1.5.0 code, file:line, in docs/publishing/PRIVACY_TRACEABILITY.md.
     If you change the code or this file, update the other and the trace in the same commit. -->

## Summary

The developer receives no data from you. The extension reads the text you ask it to speak and sends it only to the
Natural TTS helper on your own computer, at `127.0.0.1`. If the helper isn't running, the extension can read the text
with a voice built into your operating system instead, also on your computer. It never sends your text to the
developer or to any other server, and it has no analytics.

## What the extension handles

**The text you choose to hear (website content).** The extension reads the text you selected only when you ask it to
speak, in one of three ways: the "Speak selected text" item in the right-click menu, the Speak button in its toolbar
popup, or a keyboard shortcut you have assigned yourself. That action gives it access to the current tab for that
moment only (Chrome's `activeTab`), and it runs a small function there that returns the selection and whether the page
is a PDF. In a PDF, or where the page can't be read that way, it uses the selected text that Chrome passes to the
right-click menu. The extension adds no scripts to the pages you visit, and it reads nothing from a page until you
ask it to speak.

It then sends the text to the helper, with the voice and speed you chose, and the helper returns the audio. The
extension plays the audio from memory and does not store the text or the audio.

**Your settings.** The extension saves four things with `chrome.storage.local`, on this device only:

| Setting | Why |
| --- | --- |
| Your chosen voice | To use it next time |
| Your chosen speed | To use it next time |
| "When the helper isn't running": use system voices, or show an error | Your choice for when the helper can't be reached |
| The helper's port number, stored with the helper's default voice name | To reconnect without probing every port |

It does not use `chrome.storage.sync`, so nothing is copied to your other devices, even with Chrome Sync on. Chrome
deletes these settings when you remove the extension.

## Where the extension sends data

**Only to your own computer.** The extension's only host permission is `http://127.0.0.1/*`, the loopback address of
the computer it runs on. It looks for the helper on ports 8249 to 8260, and before it sends any text it checks that
the answer really comes from the helper. Any other program answering on those ports is skipped and never receives
your text.

**When the helper isn't running.** By default the extension then reads the selection aloud with a voice built into
your operating system, through Chrome's `chrome.tts`. It only uses voices that Chrome reports as local to your
computer: never a voice marked as a network voice, and never a voice provided by another extension. If it finds no
such voice, or can't read the list of voices, it shows an error instead of speaking. To turn this off, open the
extension's settings and set "When the helper isn't running" to "Show an error".

**Links.** The popup can show links to the project's GitHub page. They open only when you click them.

The extension contains no analytics, advertising, tracking, crash reporting or third-party code.

## What the helper does

- **It listens only on your computer.** The helper accepts connections on `127.0.0.1` only, so other computers on your
  network can't reach it.
- **It refuses websites.** It refuses any request whose `Host` is not `127.0.0.1`, `localhost` or `[::1]` with its
  own port, which stops a website that points its own name at your computer. It also refuses requests from web pages
  to read text aloud or list voices. It answers browser extensions, and programs running on your computer (such as
  `curl`). Like any service on `127.0.0.1`, it trusts the extensions and programs you have installed. Its status check
  (`/health`) answers anyone, and reports only whether it is ready and which version it is.
- **It keeps neither your text nor the audio.** It turns the text into audio in memory and sends the audio back. Its
  log records sizes, timings, the voice and speed, error codes, and the `Host` or `Origin` of any request it refused.
  It never records your text. With Homebrew the log is `$(brew --prefix)/var/log/natural-tts.log`. When you run the
  helper yourself, the log goes to your terminal.
- **It keeps a small settings file**, `config.json`, holding its port, the paths to its own files and its default
  voice. With Homebrew the file is in `$(brew --prefix)/var/natural-tts/`.
- **It works offline.** It runs with Hugging Face's offline mode on and its telemetry off, and connects to nothing
  outside your computer while it runs.

**One-time downloads when you install the helper.** Installing it downloads the Kokoro-82M voice model (one pinned
version of `prince-canuma/Kokoro-82M`) from huggingface.co, its Python packages from pypi.org, and its source code and
Swift packages from github.com. These downloads contain no personal data and none of your text, but like any
download, those services can see your IP address. After that, speech works without an internet connection.

## What we do not do

We do not collect, receive, sell or share your data. There are no accounts, cookies, analytics, telemetry,
advertising or tracking.

## Limited Use

The use of information received by this extension adheres to the Chrome Web Store User Data Policy, including the
Limited Use requirements.

## Children

The extension and the helper collect no personal information from anyone, including children.

## Changes and contact

Changes to this policy are published in this file, with a new version and date, and noted in the
[changelog](https://github.com/renchris/natural-text-to-voice-extension/blob/main/CHANGELOG.md).

- **Questions:** [open an issue](https://github.com/renchris/natural-text-to-voice-extension/issues) on GitHub.
- **Security problems:** please don't open a public issue. Report them privately through GitHub's
  [private vulnerability reporting](https://github.com/renchris/natural-text-to-voice-extension/security/advisories/new).
- **Source code:** the extension and the helper are open source under the MIT License, at
  <https://github.com/renchris/natural-text-to-voice-extension>.
