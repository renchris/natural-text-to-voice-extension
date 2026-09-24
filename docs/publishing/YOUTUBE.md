# YouTube demo video: upload kit

The Chrome Web Store's promo video field takes only a YouTube URL, so the demo lives on YouTube. Uploading is
**OPERATOR** work (it needs the channel owner's sign-in); everything to paste is below.

## The file

| Item | Value |
| --- | --- |
| Master | `~/ntts-captures/2026-09-24/work/out/youtube-master.mp4`: 65.3 s, 37,626,810 bytes, sha256 `ef688c5dbb1410964f6dc4a12f5b340306afaedaf18699fd0d60290f26579613`, made with the spec in `scripts/capture/GUI_PASS.md` (item 4). **Not committed** (too large for the repository); kept outside `/tmp`, which is wiped on reboot. Where it came from: [`assets/media/PROVENANCE.md`](../../assets/media/PROVENANCE.md) ("Where the master lives"). The copy in `/tmp/ntts-w3-out` is an older first pass: do not upload it |
| Format | 1920×1080, 30 fps, H.264 High, closed GOP of 15 frames, 2 B-frames, AAC 48 kHz stereo, `+faststart`, no edit list: YouTube's recommended upload settings |
| Audio | The real output of the upgraded helper for the exact on-screen text and voice, muxed from the `/speak` WAV (loudness-normalized by the helper itself, like every 1.5.0 response). **No music under speech**: for a speech product the voice is what viewers judge [R07 §4.6] |
| Thumbnail | `assets/store/youtube-thumbnail-1280x720.png`: 1280×720, under 2 MB, PNG (capture lane) |

Check the master before uploading:

```bash
ffprobe -v error -show_entries format=duration:stream=codec_name,width,height,r_frame_rate,sample_rate -of compact ~/ntts-captures/2026-09-24/work/out/youtube-master.mp4
shasum -a 256 ~/ntts-captures/2026-09-24/work/out/youtube-master.mp4
magick identify -format '%wx%h %b\n' assets/store/youtube-thumbnail-1280x720.png
```

## Details tab

**Title** (66 of 100 characters):

```text
Natural TTS: Private Kokoro Voices for Mac | Chrome extension demo
```

**Description.** Paste this as it is; the chapter times are the master's, from `chapters.txt` beside it (see
[Chapters](#chapters)). YouTube rejects `<` and `>` in descriptions; there are none.

```text
Select text in Chrome and hear it read aloud in a natural Kokoro voice, generated on your own Mac, not in the cloud. The Kokoro voices you hear are the real output of the Kokoro-82M model running on an M1 Max, with no music over them.

Natural TTS is a free, open-source Chrome extension with a small companion app, the Natural TTS helper. The extension sends the text you select only to 127.0.0.1, your own computer, where the helper turns it into speech on the Mac's GPU. No account, no analytics, and after setup it works offline. Without the helper, the extension reads with your computer's built-in voices.

Chapters
0:00 Select text, right-click, listen
0:14 Pick a voice and a speed
0:46 No helper, no network: what still works

Get it
Chrome Web Store: STORE_URL
Helper (macOS 14.5 or later, Apple silicon):
brew install renchris/tap/natural-tts
brew services start natural-tts

Source code and setup guide: https://github.com/renchris/natural-text-to-voice-extension
Privacy policy: https://github.com/renchris/natural-text-to-voice-extension/blob/main/chrome-extension/PRIVACY.md

Credits: Kokoro-82M by hexgrad (Apache-2.0). Natural TTS is MIT-licensed.

#texttospeech #accessibility #macos
```

**OPERATOR:** replace `STORE_URL` with the listing's URL (`https://chromewebstore.google.com/detail/<item-id>`) once the item exists.
Until the item is published the link shows "not found", so either upload the video **unlisted** first and edit the
description after launch, or use the GitHub URL in its place and change it after launch. Everything else in the
block is true of 1.5.0: see the claim table in [CHROME_WEB_STORE.md §2.1](CHROME_WEB_STORE.md#21-product-details).

### Chapters

The chapters follow the capture lane's storyboard (title card, right-click speak, voices and speed, the no-helper
fallback, privacy proof, end card: `scripts/capture/GUI_PASS.md` item 4). The fourth scene is the system-voice
fallback, not a PDF. YouTube shows chapters only when **the first starts at 0:00, there are at least three, and each
lasts at least 10 seconds**. The master is 65.3 s and carries **three** chapters, which is what the block above
pastes:

- The 3-second title card opens the first chapter instead of being a chapter of its own, and the 4-second end card
  closes the last one.
- The times are capture-lane work, not yours: `scripts/capture/youtube-meta.mjs` writes them to `chapters.txt` beside
  the master, from the take's `timeline.json` cut points (never estimated). If the master is ever re-cut, paste the
  new `chapters.txt` in place of the three lines above.
- A beat shorter than 10 seconds merges into its neighbour, and its title joins theirs. Do not pad the video to make
  a chapter fit.

Check a filled-in block against the master (prints `ok` or the first rule it breaks):

```bash
python3 - ~/ntts-captures/2026-09-24/work/out/youtube-master.mp4 <<'EOF'
import re, subprocess, sys
dur = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", sys.argv[1]]))
block = """0:00 Select text, right-click, listen
0:14 Pick a voice and a speed
0:46 No helper, no network: what still works
"""  # the chapter lines from the description
t = [int(m) * 60 + int(s) for m, s in re.findall(r"^(\d+):(\d\d) ", block, re.M)] + [dur]
assert t[0] == 0, "first chapter must start at 0:00"
assert len(t) - 1 >= 3, "YouTube needs at least 3 chapters"
short = [i for i in range(len(t) - 1) if t[i + 1] - t[i] < 10]
assert not short, f"chapter(s) {[i + 1 for i in short]} shorter than 10 s"
print("ok", len(t) - 1, "chapters,", round(dur, 1), "s")
EOF
```

**Tags** (252 of 500 characters):

```text
text to speech, tts, kokoro, kokoro tts, read aloud, chrome extension, local ai, on-device ai, private text to speech, offline text to speech, mac, apple silicon, mlx, accessibility, screen reader alternative, natural voices, ai voice, speech synthesis
```

| Setting | Value | Why |
| --- | --- | --- |
| Thumbnail | `assets/store/youtube-thumbnail-1280x720.png` | Custom thumbnails need a phone-verified channel (**OPERATOR**) |
| Playlist | none | |
| Audience | **No, it's not made for kids** | "Made for kids" disables comments and some embedding features |
| Age restriction | No | |
| Paid promotion | No | |
| Altered or synthetic content | **Yes** | The voices are AI-generated speech; YouTube asks creators to disclose realistic synthetic audio |
| Category | Science & Technology | |
| Video language / caption language | English | |
| Captions | Upload `~/ntts-captures/2026-09-24/work/out/youtube-master.srt`, which `scripts/capture/youtube-meta.mjs` writes from `assets/media/src/audio/selections.json` (the exact text of each clip) and the take's `timeline.json` (when each clip starts) | Accessibility, and the listing's category is Accessibility. Auto-captions of synthetic speech are usually good, but the real text is exact |
| License | Standard YouTube License | |
| **Allow embedding** | **On** | The Chrome Web Store embeds the video; with embedding off the listing shows an error |
| Comments | Your choice | |

## Visibility

**Public** is recommended: it is the only setting that also helps discovery, and the store's promo field is meant for
a public video. **Unlisted** also plays when embedded, and is commonly used for store listings, but no Google page says
the store accepts it (R07 §4.6), so treat it as the fallback, for example while the store link in the description is
not live yet. Never **Private**: nobody but you can play it, and the listing would show a broken player.

## After upload

1. Copy the watch URL (`https://www.youtube.com/watch?v=…`). Paste it into the dashboard's **Global promo video**
   field yourself, and into the `YOUTUBE_URL` slot of the reviewer's test instructions, or pass it to
   `release.sh --youtube-url '<watch URL>'` (quoted: `?` is a glob in zsh), which fills it into the printed test
   instructions only.
2. Open the URL signed out, or in a private window, and confirm it plays. Then open
   `https://www.youtube.com/embed/<id>`: that is what the store embeds, and it fails if embedding is off.
3. After the store listing is live, edit the description's `STORE_URL`, and switch to Public if you uploaded unlisted.
