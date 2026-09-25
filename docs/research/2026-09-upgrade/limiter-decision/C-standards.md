# Research C: standards and practice for the limiter decision

*2026-09-24. Web research plus arithmetic on the measurements in `../W2-integration-measurements.md` §10. No audio was
synthesised for this note. Scratch files are in `/tmp/ntts-lim-C/`.*

## Answer

**The evidence favours option 3.** Leave Kokoro unprocessed and lower the system-voice fallback by about 1.6 dB, so it
plays at **−18 LUFS**. Conviction: **80%** against the limiter (option 1). **85%** that option 3 beats doing nothing,
provided the `chrome.tts` volume mapping is measured first (see Caveats).

Four findings support this:

1. **−16 LUFS is the podcast delivery spec, not the speech-playback norm.** The standard closest to this product is AES
   TD1008 (2021), which covers internet streaming and file playback. It sets **−18 LUFS** for speech, and **−18 LUFS
   for a "Virtual Assistant"**, meaning a digitally generated voice. It allows content to be only partly normalized to
   keep its dynamics, and it asks that content stay above −20 LUFS. Kokoro through the real helper already has a
   **median of −18.0 LUFS**, and 12 of 15 cases are at −20 or louder.
2. **The major platforms do what the worker does now.** Spotify's default mode raises a quiet track only as far as its
   true peak allows, with no limiter. Spotify's own example is a −20 LUFS track peaking at −5 dBTP, which is lifted to
   −16 and no further. Spotify adds a limiter only in "Loud", which the listener has to choose. EBU Tech 3343 says that
   leaving quiet programmes below target "prevents unnecessary True-Peak limiting".
3. **None of the TTS engines or services found apply a limiter by default.** OpenAI, Google, Azure and ElevenLabs's
   plain TTS output document no loudness processing. The OS engines (SAPI, Android, AVSpeech/`chrome.tts`) only offer
   attenuation, with the default at maximum. Microsoft states that "different voices may have different maximum volume
   levels". ElevenLabs normalizes only in its Studio audiobook export, and only when the user turns it on. A limiter
   that is always on would be unusual for a TTS engine.
4. **Lowering the fallback removes the jarring part of the switch without touching Kokoro.** NPR Labs found listener
   annoyance "rapidly sets in" once a level shift passes about 4 dB. Today the gap between Kokoro and the system voice is
   0 to **5.1 LU**, and 4 of 15 cases exceed 3. With the fallback 1.6 dB lower, the largest gap is **3.5 LU** and 2 of
   15 exceed 3. The limiter's cost is concrete: up to **9 dB** of peak reduction. Practitioner guidance calls 8 to 10
   dB destructive to transients. No peer-reviewed study was found on limiter artifacts in synthetic speech at 2 to 9 dB.

**What option 3 does not fix.** Kokoro's own spread stays as it is: −16.0 to −25.0 LUFS across voices and lengths, and
7.4 LU between am_michael's short and long takes. Only option 1 removes that. If the operator wants a tighter spread
without a limiter, the standards point to a gain-only refinement: set the target to −18 (see §4).

## 1. Loudness targets for speech playback

| Source (primary unless marked) | Target | Peak | Notes |
|---|---|---|---|
| Apple Podcasts, *Audio requirements* | −16 LKFS ±1 | ≤ −1 dBFS true peak | BS.1770-5. It applies to delivered, produced podcasts. The stated reason is that "a listener might have to adjust the playback volume". |
| AES TD1004 (2015), superseded by TD1008 | −16 to −20 LUFS | ≤ −1 dBTP | The target should not exceed −16, "to avoid excessive peak limiting", and should not go below −20, "to improve audibility". |
| **AES TD1008 (2021), Table 1** | **Speech −18 LUFS (+1)**; **Virtual Assistant −18 LUFS**; track-normalized music −16; album-loudest −14 | ≤ −1 dBTP at the codec input | Footnote 8: an upper tolerance "does not apply" to a digitally generated voice. Listening panels hear speech 2 to 3 dB louder than music at the same LUFS, which is why speech targets sit below music. |
| EBU R 128 s1 (short-form) | −23.0 LUFS ±0.2 | ≤ −1 dBTP | Broadcast. Maximum short-term loudness is −18 LUFS. |
| EBU Tech 3343 | −23 ±0.2 (±1.0 for live) | — | Not normalizing low-loudness programmes "leaves the original headroom intact and prevents unnecessary True-Peak limiting". |
| ACX (audiobooks; secondary sources, consistent with each other) | −23 to −18 dB RMS (unweighted, not LUFS) | ≤ −3 dBFS sample peak | A production spec. ACX's −3 dB peak is lower than the −1.5 the worker uses. |
| Spotify, *Loudness normalization* | −14 (Normal), −11 (Loud), −19 (Quiet) | Leaves 1 dB of headroom | Normal and Quiet use gain only, capped by the true peak. Loud uses a limiter "at −1 dB (sample values), 5 ms attack, 100 ms decay". |
| YouTube (secondary only; no primary document found) | about −14 | — | Reported to turn loud content down and not to raise quiet content. |

**Reading.** Only Apple asks for −16 with a tight tolerance, and that is a spec for produced podcasts, which reach it
through compression and limiting in production. TD1008 is written for the playback case, names synthetic voices
explicitly, puts them at −18, and treats partial normalization as legitimate. It also sets out the trade-off this
decision faces. From TD1008 §7B:

> If peak limiting is required to meet this document's recommended Distribution Loudness, the distributor must trade off
> possible limiter-induced audio degradation against the possibility that reducing the loudness of such material will
> cause one or more of the problems set forth in [Wide Dynamic Range Content].

TD1008 lists those problems: content may sound too quiet next to compliant content, and players with little gain may
sound unsatisfying. Both mainly concern content below −20 LUFS. Kokoro falls below −20 in 3 of 15 cases in each table,
at −20.2 to −21.5 through the helper and down to −25.0 in the matrix.

TD1008 has two more relevant passages. On peak-to-loudness ratio: "A recording with high peak to loudness ratio (PLR)
is often perceived as clearer and less fatiguing than one that has been excessively peak-limited". Kokoro's PLR is
14.4 to 23.5 dB. On system voices: developers "should strive to match the loudness of virtual assistants and other
system-generated sounds to surrounding audio content", and TD1008 expects some deviations. Matching the fallback to
Kokoro is exactly that practice.

**Mono.** The `say` and Kokoro numbers in §10 are both mono files, measured the same way. TD1008 §6 notes that mono
content played on two speakers can sound up to 3 LU different from how it meters. Both engines have that offset, so
it does not change the comparison between them.

## 2. What OS TTS engines and comparable services do

| Engine or service | What the documentation says about output level | Loudness processing |
|---|---|---|
| macOS: `chrome.tts` → AVSpeechUtterance | Chromium `content/browser/speech/tts_mac.mm` sets `speech_utterance.volume = params.volume` directly. Apple documents `volume` as 0.0 (silent) to 1.0 (loudest), default 1.0. The Chrome API documents 0 to 1, default 1.0. The extension sets no `volume`, so it plays at 1.0. | None documented. `say` measured −16.1 to −16.7 LUFS (§10). |
| Windows SAPI 5.3 `ISpVoice::SetVolume` | 0 to 100, default 100, "a percentage of the maximum volume of the current voice. **Different voices may have different maximum volume levels.**" | None. Attenuation only. |
| Android `TextToSpeech.Engine.KEY_PARAM_VOLUME` (via Microsoft's .NET mirror of the Android docs) | Float from 0 (silence) to 1, "the maximum volume (the default behavior)". | None. Attenuation only. |
| OpenAI TTS guide | Nothing about loudness, gain or normalization. Output formats: mp3, opus, aac, flac, wav, pcm. | None documented. Developers report quiet output and uneven loudness between voices (community forum). |
| Google Cloud TTS `AudioConfig` | `volumeGainDb`: 0 = "native signal amplitude"; ±6 dB is roughly ×2 or ×½ amplitude; do not exceed +10. `effectsProfileId` device profiles are opt-in and "adjust a range of audio effects", with the processing unspecified. | Gain only by default. The optional profiles are opaque. |
| Azure neural TTS | SSML `<prosody volume>` with named steps or percentages, default 100%. | None documented. Gain only. |
| ElevenLabs | Studio lets you set per-voice volume from −30 to +5 dB, default 0. The Studio project API has `volume_normalization`, "postprocessing … compliant with audiobook normalized volume requirements", listed as optional (default false per the search index; no default is stated on the fetched page). | Only on an opt-in audiobook export. Nothing for plain TTS. |
| Read Aloud, Speechify (browser readers) | No documentation found. | Unknown. Normalizer extensions for tab audio exist separately. |

**Reading.** Across the field, a TTS engine ships the model's native level, sometimes with a gain parameter, and leaves
loudness to the player. The one exception found, ElevenLabs Studio, normalizes on request to meet a distributor's
spec. A peak-safe gain toward a target, as the worker does now, is already more than any of these engines documents.
An always-on limiter would put the product outside the norm.

## 3. Perception: the JND and how big a jump is jarring

- **The just-noticeable difference.** Jesteadt, Wier & Green (1977, JASA 61:169) fit intensity discrimination as
  ΔI/I = 0.463·(I/I₀)^−0.072 at 71% correct. That gives about **0.9 dB at 40 dB SL, 0.7 at 60 and 0.5 at 80**
  (computed here from the fit). These are tones compared back to back, so they are the best case. The usual rule of
  thumb is 1 LU. EBU R 128 allows ±1 LU for live programmes, and ATSC A/85 allows ±2 dB.
- **How big a jump annoys listeners.** NPR Labs had listeners register their reaction to shifts in programme loudness:
  "Beyond a 4 dB shift, annoyance rapidly sets in, and listeners would quickly change from 'doing nothing' to 'turn
  off'" (Kean, Radio World, 2014). Two further figures circulate on secondary sites: tolerance up to about 3 dB, and
  95% of listeners adjusting after +5 dB or −8 dB. No primary source was found for either, so neither is relied on
  here.
- **Where the switch happens.** One read is one `/speak` request (`chrome-extension/src/shared/api-client.ts`). The
  worker joins its sentence chunks and applies one gain to the whole response (§10). The fallback starts only when the helper cannot be reached
  (`chrome-extension/src/shared/system-voice.ts`, header). So the Kokoro-to-system jump always falls between reads,
  never inside one. That is the "changing streams" case NPR tested.

Gap between Kokoro and the system voice, from §10's real-helper table (Kokoro minus `say`, per text):

| Fallback volume | Kokoro − system (15 cases) | Largest gap | Median gap | Cases over 3 LU |
|---|---|---|---|---|
| Today (1.0) | 0.0 … −5.1 | 5.1 | 1.8 | 4 |
| Lowered 1.6 dB (system at about −18 LUFS) | +2.3 … −3.5 | **3.5** | 1.3 | 2 |

The −1.6 dB comes from moving `say`'s mean of −16.4 LUFS to Kokoro's helper median of −18.0. That median is also
TD1008's speech and virtual-assistant target. If AVSpeech's `volume` scales amplitude linearly, this is `volume ≈ 0.83`.
It is not documented as linear; see Caveats.

## 4. Limiter artifacts on speech

- **The size of the reduction needed.** §10 measured up to **9.0 dB** of peak reduction (am_michael, long) with a
  median of about 2 dB. The peaks that bind are ordinary speech, with a local crest of 8 to 14 dB, not clicks.
- **Practice** (secondary sources: iZotope; mastering and podcast guides). About 2 dB of reduction is standard
  mastering practice. Occasional 1 to 3 dB on dialogue is "usually transparent". Constant heavy limiting makes speech
  "clicky, dense, or fatiguing". "8 to 10 dB of gain reduction is destroying the transients". iZotope's examples of
  over-limiting show "obvious distortion on the vocals". The typical case here falls in the transparent band and the
  worst case in the destructive one.
- **Literature** (hearing aids, the closest peer-reviewed body; PMC4168964). Compression limiting keeps harmonic
  distortion low: 1.1%, against 18.4% for peak clipping at the same input. Fast-acting compression reduces the contrast
  between loud and soft speech sounds and can change consonant-burst amplitude, enough to cause /t/→/p/ confusions.
  Listeners "prefer the quality of speech with the least complex processing". Intelligibility is barely affected, so
  the cost is quality: consonant onsets, plosive bursts and loud vowel attacks lose their shape.
- **Gap.** No listening test was found that grades lookahead true-peak limiting of synthetic (neural TTS) speech at 2
  to 9 dB. The artifact risk is inferred from practice and the hearing-aid literature, not measured on Kokoro.

**A limiter-free refinement, if the operator wants Kokoro's own spread tighter.** Lower the worker's target from −16 to
**−18 LUFS**, TD1008's speech value. This is gain only and reshapes nothing. It pulls down only the cases that
currently land above −18. On the §10 matrix, the same `min(target gain, ceiling gain)` rule, which reproduces §10's
numbers exactly at −16, gives:

| Target | Reach target ±0.5 | Output range | Spread | Median |
|---|---|---|---|---|
| −16 (shipped) | 2/15 | −25.0 … −16.0 | 9.0 LU | −17.8 |
| **−18** | **9/15** | −25.0 … −18.0 | **7.0 LU** | −18.0 |
| −20 | 12/15 | −25.0 … −20.0 | 5.0 LU | −20.0 |

At −18 both engines would sit at the AES speech value. This touches the Kokoro path, which option 3 as framed leaves
alone, so it is offered as optional. Conviction that it helps: **70%**. It lowers the loudest cases by up to 2 LU, and
nothing measures whether users want that.

## Caveats (what would change the answer)

1. **The `chrome.tts` volume mapping is undocumented.** Chromium passes the value straight to
   `AVSpeechUtterance.volume`, but whether 0.83 means −1.6 dB is not documented. Measure it through the real Chrome
   path before choosing a constant. The voice also matters: §10 measured `say`'s default voice, while the extension
   picks its voice via `systemVoiceLang`.
2. **Other platforms.** `chrome.tts` on Windows or Linux routes to SAPI or speech-dispatcher, whose native levels
   differ ("different voices may have different maximum volume levels"). A macOS-calibrated constant does not carry
   over.
3. **Kokoro's quiet cases.** am_michael long (−25.0) and the three helper cases at −20.2 to −21.5 fall below TD1008's
   −20 floor. Option 3 leaves them as they are. If users report those voices as too quiet, the argument for a limiter,
   or for a gentle upward compressor, which TD1008 names as "the preferred approach for raising low level passages",
   gets stronger.

## Sources

Primary:
- Apple Podcasts for Creators, *Audio requirements*: https://podcasters.apple.com/support/893-audio-requirements
- AES TD1008.1.21-9: https://aes.org/wp-content/uploads/2024/01/20210924_TD1008_v3.13.pdf (Table 1; §5 Normalization
  Principles; §6; §7B Peak Control; "Loudness, System Sounds and the Virtual Assistant")
- AES TD1004 summary (superseded): https://productionadvice.co.uk/td1008/ ; https://forum.waves.com/t/recommendation-for-loudness-of-audio-streaming-and-network-file-playback/159
- EBU R 128 s1: https://tech.ebu.ch/docs/r/r128s1.pdf
- EBU Tech 3343: https://tech.ebu.ch/docs/tech/tech3343.pdf (low-loudness programmes and TP limiting; tolerances)
- EBU Tech 3344: https://tech.ebu.ch/docs/tech/tech3344.pdf (limiter after positive gain in devices)
- Spotify, *Loudness normalization*: https://support.spotify.com/us/artists/article/loudness-normalization/
- Chrome `chrome.tts`: https://developer.chrome.com/docs/extensions/reference/api/tts
- Chromium `tts_mac.mm`: https://raw.githubusercontent.com/chromium/chromium/main/content/browser/speech/tts_mac.mm
- Apple `AVSpeechUtterance.volume`: https://developer.apple.com/documentation/avfaudio/avspeechutterance/volume
- Microsoft SAPI 5.3 `ISpVoice::SetVolume`: https://learn.microsoft.com/en-us/previous-versions/windows/desktop/ms719811(v=vs.85)
- Android `KEY_PARAM_VOLUME` (Microsoft .NET mirror): https://learn.microsoft.com/en-us/dotnet/api/android.speech.tts.texttospeech.engine.keyparamvolume
- OpenAI TTS guide: https://developers.openai.com/api/docs/guides/text-to-speech
- Google Cloud TTS device profiles: https://docs.cloud.google.com/text-to-speech/docs/audio-profiles ; `AudioConfig`: https://docs.cloud.google.com/text-to-speech/docs/reference/rest/v1/AudioConfig
- Azure SSML voice and prosody: https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-synthesis-markup-voice
- ElevenLabs Studio: https://elevenlabs.io/docs/eleven-creative/products/studio ; Create Studio Project API: https://elevenlabs.io/docs/api-reference/studio/add-project
- Jesteadt, Wier & Green 1977, JASA 61(1):169–177, doi:10.1121/1.381278: https://pubmed.ncbi.nlm.nih.gov/833368/
- Kean (NPR Labs), *NPR Labs Studies Streaming Loudness*, Radio World 2014: https://www.radioworld.com/news-and-business/npr-labs-studies-streaming-loudness
- Souza, *Effects of Compression on Speech Acoustics, Intelligibility, and Sound Quality*: https://pmc.ncbi.nlm.nih.gov/articles/PMC4168964/

Secondary or practice:
- ACX specs: https://www.trevorohare.com/blog/understanding-the-acx-submission-requirements-for-audio
- YouTube: https://www.criticallisteninglab.com/en/learn/loudness/youtube
- iZotope, limiters: https://www.izotope.com/en/learn/an-introduction-to-limiters-and-how-to-use-them.html
- Dialogue limiting practice: https://www.masteringbox.com/learn/podcast-mastering ; https://audiosorcerer.com/post/true-peak-limiting
- OpenAI community reports: https://community.openai.com/t/tts-output-is-extremely-quiet/892999

## Reproduce

- Primary PDFs: `curl -sL <url> -o x.pdf && pdftotext -layout x.pdf x.txt`, then `grep -n -i "speech\|virtual assistant\|limit" x.txt`.
  TD1008 Table 1 is at lines 236–294 of the extracted text, and §7B Peak Control at 512–541.
- Target table in §4 and gap table in §3: inline `python3` over the §10 numbers, using gain `min(T−L, −1.5−TP, 24)`.
  It reproduces §10's shipped medians (−17.8 on the matrix, −18.0 through the helper). The script is in this session's
  transcript and was not kept as a file.
