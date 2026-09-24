# GUI pass: the assets that need a real display

Capture step 2 ran **headless only** (the console was locked and the display asleep for much of the night; nothing
may take over the operator's screen). Everything that can be captured through CDP alone is done and committed:

| Asset | State |
|---|---|
| `assets/media/popup.png` | done, headless (720×700, 2x, Connected, Heart, 1.0×); re-shot from the v1.5.0 popup in the retake round |
| `assets/media/fallback.png` | done, headless (720×1178, 2x, helper stopped, system-voice line + install hint); re-shot in the retake round |
| `assets/media/status.webp` | done, headless (720×700, Checking → Connected loop); re-shot in the retake round |
| `assets/media/helper.webp`, `assets/media/gate.webp` | done, VHS (renders headlessly) |
| `assets/store/screenshot-{2,3,4,5}-*.png`, `small-tile-440x280.png`, `marquee-1400x560.png`, `youtube-thumbnail-1280x720.png`, `assets/brand/social-preview.png` | done, headless (capture step 3): `cws/capture-inputs.sh` + `cws/render.sh`, listed in `assets/store/README.md`; inputs re-captured from the v1.5.0 popup and every image re-rendered in the retake round |
| `assets/store/screenshot-1-right-click.png` (+ `assets/store/src/contextmenu-crop.png`) | **done, GUI pass 2026-09-24**: the native menu over the article, "Speak selected text" highlighted by a real hover (`hero.mjs --mode menu`) |
| PDF viewer check (`article.pdf`, native menu) | **done, GUI pass 2026-09-24: PASS**, recorded in `assets/store/README.md` |
| `assets/media/hero.mp4`, `hero-poster.png`, `hero-preview.webp` | **retaken 2026-09-24 with the pointer recorded** (`hero.mjs --cursor`: real drag, right-click, menu click, toolbar click); lag 2.467 s, in `assets/media/PROVENANCE.md`; preview by `hero-preview.sh` |
| `assets/media/voices.webp` | **done, GUI pass 2026-09-24** (`voices.mjs`): the anchored popup's native grouped list, Heart → Emma; re-cropped by `voices-loop.sh` in the retake round |
| `assets/media/demo-30s.mp4` + the YouTube master (not committed; `~/ntts-captures/2026-09-24/work/out/`) | **scenes (b) and (c) retaken 2026-09-24 with the pointer recorded** (`hero.mjs --cursor`, `popup-scene.mjs --cursor`), `tapes/privacy.tape`, `video-cards.sh` (cards and captions), `promo-assemble.py`, `youtube-meta.mjs`; master 65.3 s, demo 27.4 s |

**Nothing in this file is outstanding after the 2026-09-24 GUI pass and its retake round.** The recipe below is kept
to remake the assets; the lessons are in "What the GUI pass learned" at the end. One gate is the operator's: the
master's end card and store screenshot 5 name the Homebrew tap, which is not published yet, so neither goes public
until `brew install renchris/tap/natural-tts` works.

What remains needs the window server: the **native context menu**, the **anchored toolbar popup** (headless opens
`popup.html` as a tab, not the anchored bubble) and the **native `<select>` dropdown**. This file is the one-go
recipe for that pass.

## Remaining assets

1. **`assets/media/hero.mp4`** (15–25 s: a take with real gestures runs ~25 s, since the clip is 15.6 s and the
   lag ~2–2.5 s; 1280×800, H.264 High, yuv420p, 30 fps, AAC, `+faststart`, ≤ 8 MB), plus
   **`hero-poster.png`** (a strong frame: the menu open with "Speak selected text" highlighted, from the 2x raw,
   stripped to a plain sRGB PNG) and **`hero-preview.webp`** (silent, the opening up to the popup's speaking state,
   that frame held 3 s with a "Watch with sound" pill, ≤ 3 MB, `hero-preview.sh`; GIF only if the WebP fails the
   demo-recording skill's seam check). **Record the pointer** (`sckrec` without `--no-cursor`, `hero.mjs --cursor`):
   the gesture is the product, and a popup that appears with no click on the toolbar button misleads. Story: the article at `https://essays.example/article.html`, paragraph 2
   gets selected, right-click, the native menu with "Speak selected text" highlighted, click, the real Kokoro voice
   reads it. Audio: `assets/media/src/audio/hero.wav` (af_heart, 1.0x, 15.58 s), post-muxed at the measured offset.
2. **`assets/media/voices.webp`**: a voice switch in the grouped 28-voice list. Needs the native `<select>` dropdown
   open (its optgroups are the whole point: American / British, female / male). Headless cannot show it truthfully:
   the closed select only changes its one-word label, so this was **skipped**, not faked.
3. **Store screenshot 1 only** ("Select text. Right-click. Listen.", template `cws/shot1.html`). Shots 2–5, the tile,
   the marquee, the thumbnail and the social preview were rendered headless in step 3 from real popup captures.
   `render.sh` renders shot 1 as soon as **`assets/store/src/contextmenu-crop.png`** exists: the native menu over the
   article at `https://essays.example/article.html`, paragraph 2 selected, "Speak selected text" highlighted, cropped
   at ≥ 1:1 CSS scale. The template fits it into a 560×660 box (`object-fit: cover`, anchored right). Look at the
   render, and move `object-position` if the menu item falls outside the box. Then run `scripts/capture/cws/render.sh`
   and update the Slots table in `assets/store/README.md`.
   - **PDF check still owed (display needed):** right-click a selection in the PDF viewer
     (`https://essays.example/article.pdf`) and confirm "Speak selected text" is in the menu and speaks. The logic
     half passed headless on 2026-09-24, and the viewer's selected text is spoken by the real helper: see
     `assets/store/README.md`, "Why screenshot 4 is not the PDF shot". Record the result there. Store shot 4 stays
     the fallback shot either way, because the ligature fix cannot be shown with `article.pdf`.
4. **YouTube master + `demo-30s`** (not committed; under `/tmp/ntts-w3-out/`): the R07 storyboard, one real clip per
   scene from `assets/media/src/audio/` (`s1-rightclick`, `s2-british`, `s3-speed`, `s4-pdf`, `s5-offline`).
   **Deferred from capture step 3** (headless-only), with this exact spec:
   - **The YouTube master** (outside `/tmp`: `~/ntts-captures/<date>/`): 1920×1080, 45–70 s (it was 30–50 s; real
     gestures and real latencies put the retake round's cut at 65.3 s, see `assets/media/PROVENANCE.md`), no music
     under speech. Scenes, each with its own
     real clip, muxed at the click time plus the lag measured on that take:
     (a) title card, silent, 2–3 s: `cws/titlecard.html` at 1920×1080 (`video-cards.sh`);
     (b) right-click speak on the article, `s1-rightclick.wav` (af_heart 1.0×, 5.78 s);
     (c) popup: switch to Emma in the grouped list, speak, `s2-british.wav` (bf_emma, 7.13 s); then speed to 1.3×,
     speak, `s3-speed.wav` (3.78 s);
     (d) **fallback scene, not PDF.** The ligature fix cannot be shown (step 3). Stop the capture helper, right-click
     speak, and let the system voice read it (live audio: record with `sckrec --exclude-others`). The popup shows
     Offline and the system-voice line. Restart the helper for the next scene;
     (e) privacy proof **without touching Wi-Fi**: `lsof -nP -a -p <worker pid> -i` printing nothing (expected: the
     worker has no network sockets and talks to the helper over pipes. Run it once before recording, and cut the
     scene if it prints anything) plus `lsof -nP -a -p <helper pid> -i` showing only `127.0.0.1:8250 (LISTEN)`, in a VHS
     tape or a terminal window. Then speak again with `s5-offline.wav` over it, as proof that speech does not need
     the network. Optionally, add the guard's `guard.jsonl` lines showing only `127.0.0.1:8250`;
     (f) end card, silent, 4 s, in the `cws/` style: a numbered call to action, "1 Add Natural TTS to Chrome · Chrome
     Web Store", "2 Install the free helper" with the two Homebrew commands, then the repository, smaller.
     **Retake round changes:** captions on (d) and (e) (`video-cards.sh`, overlaid by `promo-assemble.py`) including
     the note that the capture helper ran on 8251 (the default is 8249); (e)'s second right-click speak was dropped
     (it repeated (b)); scenes are joined by 0.3 s crossfades; `youtube-meta.mjs` writes the chapters and the `.srt`.
     Encode with the R09 §3.4 command already in "Hero video" below (H.264 High, 8 Mbps, closed GOP 15, 2 B-frames,
     AAC 48 kHz stereo, `+faststart`, `-use_editlist 0`). Check it with `ffprobe` and a contact sheet, and add a
     line to `assets/media/PROVENANCE.md` naming each clip and its offset.
   - **`assets/media/demo-30s.mp4`** (committed, ≤ 8 MB): the popup half of (c) + the captioned terminal + a short end
     card since the retake round (with real gestures (b)+(c) alone pass 30 s, and the hero shows (b)), 20–30 s,
     1280×720, `-crf 23 -preset slow`, AAC 128k, `+faststart`. Check its size with `stat` before committing.
   - The thumbnail for the upload is already made: `assets/store/youtube-thumbnail-1280x720.png`.
   - **PDF scene (optional, not a store shot):** `article.pdf` cannot show the ligature fix. Chrome/Skia writes a
     ToUnicode map that already turns the fi/fl/ffi glyphs back into plain letters;
     `pdftotext assets/media/src/article.pdf - | grep -c $'ﬁ'` finds 0 ligature code points. A PDF scene needs a PDF
     whose text layer really carries U+FB01–FB04 (pdfTeX, or a font with a ligature ToUnicode entry), proved with
     that `pdftotext` check. Store shot 4 is the no-helper fallback either way (`assets/store/README.md`).
   - **Offline scene**: never toggle Wi-Fi. Show the helper's `/speak` succeeding while the port guard's log shows
     no request left 127.0.0.1, or cut the scene.

## Preconditions (check all before starting)

- The console is **unlocked** and the display **awake**, and the operator has agreed to hand over the screen for
  the run (about 10 minutes). Check:
  `ioreg -n Root -d1 -a | plutil -extract IOConsoleUsers.0.CGSSessionScreenIsLocked raw - 2>/dev/null || echo false`
  prints `false`. (`plutil` exits 1 when the key is absent, which is the unlocked case, hence the `|| echo false`.)
- Keep it awake for the whole run: `caffeinate -d -t 3600` (run in the background; stop it afterwards). Anything
  that waits on compositor frames (screencapture, ScreenCaptureKit, CDP screencast) stalls while the display
  sleeps, and the tool call never returns: that is what killed three earlier attempts.
- `scripts/capture/build.sh && export PATH="$HOME/.cache/ntts-capture/bin:$PATH" && axcheck`: all four lines
  `true` (**Screen Recording** and **Accessibility** for the terminal chain). Never try to grant them from a
  script; if either is false, stop and ask.
- Close HUD-style and notification apps; turn on Do Not Disturb by hand.
- `lsof -nP -iTCP:9555 -sTCP:LISTEN` and `lsof -nP -iTCP:8250 -sTCP:LISTEN` are empty. An older helper on 8249
  may be running, and a sibling session's helper on another port: leave them alone; the guard refuses every
  port 8249-8260 except 8250 inside the capture browser.
- Never write `~/Library/Application Support/NaturalTTS/config.json`: always start the helper with overrides.

## Commands

```bash
cd <worktree>
(cd chrome-extension && bun install --frozen-lockfile && bun run build)
OUT=/tmp/ntts-w3-out/gui-$(date +%Y%m%d-%H%M); mkdir -p "$OUT"
scripts/capture/versions.sh > "$OUT/toolchain.txt"

# 1. The real v1.5 helper on 8250 (overrides => the shared config.json is never read or written).
PY=<main checkout>/native-helper/Sources/NaturalTTSHelper/Resources/python-env/bin/python3
nohup native-helper/.build/release/natural-tts-helper --port 8250 --python "$PY" \
  --worker "$PWD/native-helper/Sources/NaturalTTSHelper/Resources/tts_worker.py" </dev/null >"$OUT/helper.log" 2>&1 &
echo $! > "$OUT/helper.pid"
timeout 60 bash -c 'until curl -sf 127.0.0.1:8250/health | grep -q "\"status\":\"ok\""; do sleep 1; done'

# 2. The capture browser, HEADED this time (no HEADLESS=1): window at (40,60), 1280x800, extension pinned,
#    stored port seeded to 8250, the guard refusing 8249-8260 but 8250 and serving https://essays.example/.
scripts/capture/launch.sh "$OUT" 8250
source "$OUT/env.txt"
node scripts/capture/cdp.mjs "$WS" about:blank 'location.href="https://essays.example/article.html"'
```

### Hero video

`hero.mjs --cursor` drives the committed take: every gesture is real OS input and the pointer is recorded (a drag
selects paragraph 2, a right-click opens the native menu, the pointer hovers "Speak selected text" and clicks it,
then clicks the toolbar button so the anchored popup shows the voice speaking). Its timeline carries each click's
mouse-down time. (`demo.mjs --menu-only` is the older driver for the same story with CDP gestures and no pointer;
use it only for a take that hides the cursor.)

The audio offset is measured, never assumed. Every WAV opens with 0.26–0.33 s of silence, so align against the
**start of the WAV**, not the speech onset: record a second, live-audio take the same way with
`sckrec … --exclude-others` (after the dry run in "YouTube master" proves it records sound), and cross-correlate its
audio with `hero.wav`; the peak lag, in ms, is `<ms>` below. (R09 measured +0.93–1.00 s from click to sound; a
`<ms>` far from `click − rec-start + ~950` means the take is wrong.)

```bash
node scripts/capture/hero.mjs "$WS" "$EXT_ID" essays.example "$OUT/prep.json" --mode prep   # then click the page margin once
sckrec $CHROME_PID 34 "$OUT/hero-raw.mov" 40 60 1280 800 --exclude-others &   # start first; the pointer is recorded
node scripts/capture/hero.mjs "$WS" "$EXT_ID" essays.example "$OUT/timeline.json" --mode full --cursor \
  --pid $CHROME_PID --at select=0.6,right=4.2,hover=4.9,click=5.7 --popup-at 8.4; wait
# 1280x800 exactly: sckrec records at the display's pixel scale (2560x1600 on Retina), so scale before fps.
ffmpeg -i "$OUT/hero-raw.mov" -vf "scale=1280:800:flags=lanczos,tpad=stop_mode=clone:stop_duration=2,fps=30" \
  -c:v libx264 -profile:v high -pix_fmt yuv420p -crf 20 -r 30 -movflags +faststart -an "$OUT/hero-video.mp4"
# <ms> = speak-click time in timeline.json + the measured video lag (R09: constant +0.93-1.00 s). Measure the lag on
# THIS take (a live-audio take with sckrec --exclude-others, cross-correlated with hero.wav), never assume it.
# pan copies the mono clip to both channels exactly; an upmix (aformat=channel_layouts=stereo) lowers it by 3 dB.
ffmpeg -i "$OUT/hero-video.mp4" -i assets/media/src/audio/hero.wav \
  -filter_complex "[1:a]aresample=48000,pan=stereo|c0=c0|c1=c0,adelay=<ms>|<ms>,apad[a]" -map 0:v -map "[a]" -shortest \
  -c:v copy -c:a aac -b:a 128k -ar 48000 -movflags +faststart assets/media/hero.mp4
ffprobe -v error -show_entries stream=codec_name,profile,width,height,avg_frame_rate,pix_fmt -of compact assets/media/hero.mp4
stat -f %z assets/media/hero.mp4                                              # <= 8 MB (8388608)
```

Confirm the `/speak` the click caused: `guard.jsonl` has a `127.0.0.1:8250/speak` line from the offscreen document,
and the helper log has its `[worker] [INFO] Generating [N chars] (voice=af_heart …)` and `Generated … audio in …`
lines (the helper logs every request; it never logs the text).

Poster and preview, both from the 2x raw take (frame numbers at 30 fps, the hero cut's numbering):

```bash
ffmpeg -i "$OUT/hero-raw.mov" -vf "fps=30,select=eq(n\,<hover frame>),scale=1280:800:flags=lanczos" -frames:v 1 "$OUT/poster.png"
magick "$OUT/poster.png" -strip -define png:exclude-chunks=all PNG24:assets/media/hero-poster.png   # plain sRGB, no cICP
KMAX=20 scripts/capture/hero-preview.sh "$OUT/hero-raw.mov" <first frame> <popup speaking + ~1.5 s> <hero s> \
  assets/media/hero-preview.webp   # <= 3 MB; wrap it in a link to hero.mp4 in the README
```

`hero-preview.sh` encodes `-near_lossless 40` (a lossless take of a moving page is far over 3 MB) with a key frame at
least every `KMAX` frames. Decode it (`magick x.webp -coalesce f%03d.png`) and compare the last frame with its source
PNG (`magick compare -metric AE`): near-lossless inter frames can keep a ghost of an earlier frame, as they did in
`status.webp`, which is why `assemble-loop.mjs` (flat UI, small lossless) encodes lossless.

### Store inputs

```bash
# Follow the README's "Native context menu" recipe (demo.mjs ... 'article .lede + p' --menu-only). Then:
magick "$OUT/menu.png" -crop <w>x<h>+<x>+<y> +repage assets/store/src/contextmenu-crop.png
scripts/capture/cws/render.sh          # renders screenshot 1 now that its input exists, and re-renders the rest
```

Keep the headless inputs (`assets/store/src/popup-*-speaking.png`). They are real, and `render.sh` re-renders every
other image from them byte for byte.

### Voices loop

The native `<select>` list, opened in the anchored popup, recorded without audio. The committed loop is cut from the
raw take by `voices-loop.sh` (the popup-and-list crop, a left-edge fade over the page only, 720 px wide, lossless);
the `img2webp` line below is the same encode without the crop.

```bash
node scripts/capture/cdp.mjs "$WS" "chrome-extension://$EXT_ID/background" 'chrome.action.openPopup().then(()=>"ok")'
sleep 0.6; winlist "Google Chrome for Testing" | grep onscreen=true     # the ~360x350 popup window: its x,y,w,h
# The voice <select> is 32-360 CSS px across and ~110 px down in the popup: its centre is (x+180, y+124).
sckrec $CHROME_PID 9 "$OUT/voices-raw.mov" <popup x> <popup y> 360 520 --no-cursor &
sleep 1; click <x+180> <y+124>                            # opens the native list (American, then British groups)
sleep 1.2; hover <x+180> <y+220> 1.0 true                 # down the American voices…
hover <x+180> <y+380> 1.0 true                            # …into the British ones
hover <x+180> <y+430> 1.2 true; key 53                    # Escape closes the list; the popup stays
wait
mkdir -p "$OUT/voices"; ffmpeg -v error -i "$OUT/voices-raw.mov" -vf "fps=20,scale=720:-1:flags=lanczos" "$OUT/voices/%04d.png"
scripts/capture/voices-loop.sh "$OUT/voices-raw.mov" <from s> <to s> assets/media/voices.webp   # <= 3 MB
# or, uncropped and lossless: img2webp -loop 0 -d 50 -m 6 "$OUT"/voices/*.png -o assets/media/voices.webp
```

`key 53` is Escape (it does not dismiss Chrome's context menu, but it does close a `<select>` list). Look at a
contact sheet: the list must show both accent groups, and no voice may be picked by accident.

### YouTube master

The committed cut was made by the retake round's tools: `video-cards.sh <takes>/cards` (title and end cards plus the
lower-third captions), `tapes/render.sh privacy <dir>`, then `promo-assemble.py <takes> <master.mp4> <demo.mp4>`, whose
`SCENES` table holds every measured range, clip time and caption, and which writes the master's timeline for
`youtube-meta.mjs`. It puts each clip on both channels **unchanged** (no gain), joins scenes with 0.3 s crossfades and
refuses any cut that would shorten a measured latency. The recipe below is the same pipeline by hand, one ffmpeg call
per scene; it applies the uniform `volume=4.5dB` described next, which `promo-assemble.py` does not.

Every scene is recorded like the hero (`sckrec` at 1280×800, no audio), then scaled and pillarboxed to 1920×1080 in
the brand's deep ink, given its clip, and concatenated. One static gain applies to **every** clip: the WAVs measure
−23.5 to −26.0 LUFS (`ffmpeg -af ebur128`), YouTube only turns loud videos down, and `volume=4.5dB` brings them to
about −20 LUFS with peaks still ≤ −0.6 dBFS. A uniform gain is a level change, not a content edit; record it in
PROVENANCE.

```bash
V='scale=-2:1080:flags=lanczos,pad=1920:1080:(ow-iw)/2:0:color=0x1B2060,fps=30,format=yuv420p'
A='aresample=48000,aformat=channel_layouts=stereo'
enc='-c:v libx264 -profile:v high -preset slow -b:v 8M -maxrate 10M -bufsize 16M -bf 2 -g 15 -keyint_min 15 -sc_threshold 0 -flags +cgop -c:a aac -b:a 192k -ar 48000 -ac 2'
card() { ffmpeg -v error -loop 1 -t "$2" -i "$1" -f lavfi -t "$2" -i anullsrc=r=48000:cl=stereo \
  -vf "fps=30,format=yuv420p" $enc -shortest "$3"; }
scene() { # scene <raw.mov> <clip id> <adelay ms> <out.mp4>   (the clip's WAV starts <ms> into the scene)
  ffmpeg -v error -i "$1" -i "assets/media/src/audio/$2.wav" -filter_complex \
    "[0:v]$V[v];[1:a]volume=4.5dB,adelay=$3|$3,apad,$A[a]" -map "[v]" -map "[a]" -shortest $enc "$4"; }
scripts/capture/video-cards.sh /tmp/ntts-w3-out/cards          # -> {title,end}-1920x1080.png + caption overlays
card /tmp/ntts-w3-out/cards/title-1920x1080.png 3 "$OUT/a.mp4"
# (b) right-click: the hero recipe (sckrec 12 s), selecting exactly s1-rightclick's sentence:
#     demo.mjs "$WS" "$EXT_ID" essays.example "$OUT/b.json" 'article p' --menu-only \
#       --text "$(node -pe 'require("./assets/media/src/selections.json").selections.find(s=>s.id==="s1-rightclick").text')"
scene "$OUT/b-raw.mov" s1-rightclick <ms> "$OUT/b.mp4"
# (c) popup: Emma in the grouped list, Speak; then + three times to 1.3×, Speak. Two clips in one scene:
ffmpeg -v error -i "$OUT/c-raw.mov" -i assets/media/src/audio/s2-british.wav -i assets/media/src/audio/s3-speed.wav \
  -filter_complex "[0:v]$V[v];[1:a]volume=4.5dB,adelay=<ms1>|<ms1>[x];[2:a]volume=4.5dB,adelay=<ms2>|<ms2>[y];[x][y]amix=inputs=2:normalize=0,apad,$A[a]" \
  -map "[v]" -map "[a]" -shortest $enc "$OUT/c.mp4"
# (d) fallback, live system voice. Dry run first: 3 s while chrome.tts speaks must be louder than -60 dB.
sckrec $CHROME_PID 3 /tmp/tts-probe.mov --exclude-others & \
  node scripts/capture/cdp.mjs "$WS" "chrome-extension://$EXT_ID/background" 'chrome.tts.speak("Testing the system voice.")'; wait
ffmpeg -i /tmp/tts-probe.mov -af volumedetect -f null - 2>&1 | grep max_volume   # silent? exclude only the HUD apps,
                                                                                    # or record unfiltered with DND on
# The take (helper stopped): sckrec … --exclude-others. Level-match its speech to the clips: measure it
# (ffmpeg -i d-raw.mov -af ebur128 -f null -), and use volume=<-20 minus its integrated LUFS>dB instead of 4.5dB:
ffmpeg -v error -i "$OUT/d-raw.mov" -filter_complex "[0:v]$V[v];[0:a]volume=<gain>dB,$A[a]" -map "[v]" -map "[a]" $enc "$OUT/d.mp4"
# (e) privacy terminal + s5-offline:
scene "$OUT/e-raw.mov" s5-offline <ms> "$OUT/e.mp4"
card /tmp/ntts-w3-out/cards/end-1920x1080.png 4 "$OUT/f.mp4"
printf "file '%s'\n" "$OUT"/{a,b,c,d,e,f}.mp4 > "$OUT/list.txt"
ffmpeg -v error -f concat -safe 0 -i "$OUT/list.txt" -c copy -movflags +faststart -use_editlist 0 /tmp/ntts-w3-out/youtube-master.mp4
ffprobe -v error -show_entries format=duration:stream=codec_name,width,height,avg_frame_rate -of compact /tmp/ntts-w3-out/youtube-master.mp4
```

Every part shares one encoder setting (the R09 §3.4 profile: H.264 High, 8 Mbps, closed GOP 15, 2 B-frames, AAC
48 kHz stereo; also in `scripts/capture/README.md` § Hero video), so the concat demuxer joins them without
re-encoding. Then write the chapter times and captions from the cut points (each part's start in the master is the
running sum of the earlier parts' durations):

```bash
# master-timeline.json: {"duration":…, "clips":[{"id":"s1-rightclick","at":<b start + ms/1000>},…],
#                        "chapters":[{"at":0,"title":"Select text, right-click, listen"},
#                                    {"at":<c start>,"title":"Voices, speed, and no helper: system voices"},
#                                    {"at":<e start>,"title":"Private and offline; set up with Homebrew"}]}
node scripts/capture/youtube-meta.mjs "$OUT/master-timeline.json" /tmp/ntts-w3-out
```

## Clean-up

Kill only `$CHROME_PID`, `$GUARD_PID` and the pid in `$OUT/helper.pid`; stop `caffeinate`; `rm -rf "$PROFILE"`.
Then contact-sheet every video (`ffmpeg -i x.mp4 -vf "fps=1,scale=320:-1,tile=5x4" -frames:v 1 sheet.png`) and
look at it: the pointer only where the driver put it, no infobar, no other app, menu not clipped, audio in sync.

## What the GUI pass learned (2026-09-24)

- **`article p:nth-of-type(2)` is the dek, not paragraph 2** (the kicker and dek are `<p>` too). `hero.mjs` finds
  the paragraph by its opening words (`--para`) or a sentence (`--sel`).
- **Locate native menu items through Accessibility, never by offset.** `axmenu <pid> "Speak selected text"` returns
  the item's centre for Chrome's page context menu and for a `<select>` list. The PDF viewer's menu is not in the AX
  tree; there, check the menu window (`winlist … layer=101`) contains the point before clicking.
- **Never click a menu blind.** If the operator clicks elsewhere the menu closes, and a click at its old position lands
  on whatever window is behind it (this happened once, on another app's window, before the check existed). The
  drivers re-read the menu right before the click and refuse if it has gone.
- **Cut variable-frame-rate recordings only after converting to 30 fps.** `trim` + `setpts=PTS-STARTPTS` on the raw
  SCK file re-zeroes on the first *changed* frame and shifted the hero 0.37 s against its audio; cut with
  `fps=30` first, on whole frames (`trim=start_frame/end_frame`), and re-measure sync in the finished file.
- **`-ss` before `-i` is not frame-accurate on these files**: find click frames by a full decode (luma trace of the
  menu region), never by seeking.
- **Measure the lag on every take.** It is not a constant: 2.08 s for a whole paragraph after a service-worker wake,
  1.08–1.29 s for a sentence from the menu, 0.40–0.54 s from the popup's own Speak button.
- **Interference to watch for in contact sheets:** the macOS volume display (the operator changed the volume during
  two takes), a Space switch (the window goes `onscreen=false`, SCK stops delivering frames, and the last frame is
  stale), and the pick of a native list whose repaint never reached the recording. Retake, never patch.
- **Ports for a second capture run beside another:** `CDP_PORT=9556 BLOCK=8249,8250 HOLD=1 scripts/capture/launch.sh
  <out> 8251`, the helper on 8251. The extension's discovery probes 8249–8260, so check nothing else listens there
  before a fallback scene.
- **`sckrec --exclude-others` records the live audio in the same take** as the picture, which makes the lag
  measurement direct: cross-correlate the canonical clip against it on 10 ms log-RMS envelopes (Kokoro's random
  phase defeats waveform correlation), then refine at 1 ms.

Learned in the retake round (2026-09-24):

- **Record the pointer, and make every gesture real.** `glide` (eased pointer moves, `--drag` for a real drag-select),
  `click --right --stay`, `scroll` (wheel), `axfind` (the pinned toolbar button through Accessibility), driven by
  `hero.mjs --cursor` and `popup-scene.mjs --cursor`. Real presses land on whatever window is on top, so the drivers
  bring the browser to the front and check every point against `winlist`'s z-order before pressing; they refuse
  rather than press on another app.
- **Re-locate the toolbar button right before clicking it.** Once audio plays, Chrome adds its media-controls button to
  the toolbar and every icon to its right shifts; a position read a few seconds earlier opened the Extensions menu.
- **Another app's window can float over the capture window** (a Docker Desktop panel did, for the whole session). The
  recording never shows it (`--exclude-others`), but real presses would reach it: plan presses around it (scene (c)
  scrolls its second sentence above it) or wait for it to go, never click through it.
- **Focus the page before a take**: after `location.href=…` the address bar keeps focus and its URL shows selected in
  every frame; one click on the page margin before recording fixes it.
- **Mono clips go on both channels with `pan=stereo|c0=c0|c1=c0`**, never `aformat=channel_layouts=stereo` (−3 dB).
- **`-use_editlist 0` shifts the picture 66.7 ms (2 B-frames) but the audio only by its 21.3 ms AAC priming**:
  `promo-assemble.py` delays the master's mix by the 45.3 ms difference; re-measure click flash to clip in the file.
- **Near-lossless inter frames leave ghosts** of closed menus and replaced text, and forced key frames only clear them
  where a key frame lands: `voices-loop.sh` kept a key frame every 10 frames and still held a ghost of the closed list
  in its last frame for 2 s. UI loops are lossless now (`assemble-loop.mjs`, `voices-loop.sh`); where a loop must stay
  near-lossless (`hero-preview.sh`, `KMAX`), decode it and compare every held frame with its source.
- **Never post a key to "close" something**: the Space may already have switched, and the key lands in the operator's
  app. Close popups with a click on the capture page instead.
- **The lag depends on the machine's load**: with another capture run using the GPU it was 1.25–2.47 s where the first
  pass measured 0.40–2.08 s. Measure it on every take; never reuse a number.

