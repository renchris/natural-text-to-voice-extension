# B — Match the fallback by lowering its `chrome.tts` volume (measured 2026-09-24)

## Answer

**A single lower `chrome.tts` volume does not work. A volume keyed to the voice the fallback picks does, but only for
American voices.** The fallback is loud only because, for American Kokoro voices, it lands on **Samantha**. Samantha is
the loudest of the 26 local English speech voices on this Mac: −16.4 LUFS on the hero paragraph, against −18.4 to
−23.2 for the other 25. British Kokoro voices fall back to **Arthur**, which is **2.5–5.1 LU quieter** than Kokoro
already. `chrome.tts` volume stops at 1.0, so nothing on the fallback side can raise it.

| Hero-paragraph set (W2 §10, second table) | American cases (9) | British cases (6) | All 15 |
|---|---|---|---|
| Today (volume unset = 1.0) | +0.0 … +5.1 LU, median \|j\| 1.9 | −5.1 … −2.5 | max \|j\| 5.1, median 3.7 |
| **Samantha → 0.89, every other voice 1.0** | **−2.6 … +2.4, median \|j\| 1.1** | −5.1 … −2.5 (unchanged) | max 5.1, median 2.4 |
| One global volume, 0.84 (hero −20.2 target) | −3.8 … +1.2 | **−8.9 … −5.0** (worse) | max 8.9 |

*j = fallback LUFS − Kokoro LUFS for the same text; positive means the fallback is louder.*

**This changes the limiter framing (option A).** A limiter lifting every response to −16 LUFS matches Samantha to within
0.7 LU. It widens the Arthur gap to **−5.0 … −6.5 LU** and the Daniel gap to −2.8 … −4.0. The fallback sitting "at
about −16" is a property of Samantha, not of the fallback.

## 1. How `chrome.tts` volume reaches the audio on macOS (Chromium source, main, fetched 2026-09-24)

- `chrome/browser/speech/extension_api/tts_extension_api.cc:226-231`. `volume` defaults to
  `kSpeechSynthesisDoublePrefNotSet` (−1). If you pass it, it is validated to [0, 1] (`kErrorInvalidVolume` outside
  that range), then stored with `SetContinuousParameters(rate, pitch, volume)` (`:314`).
- `content/browser/speech/tts_mac.mm:329-331`. `if (params.volume >= 0.0) speech_utterance.volume = params.volume;`
  The value lands, unchanged, on **`AVSpeechUtterance.volume`**, spoken by `AVSpeechSynthesizer` (`:468`). It no longer
  goes through NSSpeechSynthesizer. Unset (−1) leaves AVFoundation's default of 1.0.
- `tts_mac.mm:128-143` sets the voice order: the system default voice first, then `AVSpeechSynthesisVoice.speechVoices`
  sorted by `name`. The default comes from `tts_mac.mm:49-110`: the Accessibility Spoken Content selection first, then
  `NSSpeechSynthesizer.defaultVoice`.

## 2. Which voice the fallback picks on this Mac

`pickSystemVoice` (`chrome-extension/src/shared/system-voice.ts:116-122`) takes the first local, non-novelty voice
whose lang is `en-US`, or `en-GB` for `b*` Kokoro voices (`:74-76`).

- The Accessibility selection names `com.apple.ttsbundle.gryphon-neural_nora_en-US_premium`. That voice is not installed:
  `AVSpeechSynthesisVoice(identifier:)` returns nil. Chrome therefore falls through to `NSSpeechSynthesizer.defaultVoice`,
  which is Samantha. Checked: `say -o def.aiff` and `say -v Samantha -o sam.aiff` are byte-identical (SHA-1 `8e60b586…`).
- `/tmp/ntts-lim-B/listvoices.swift` replicates Chrome's ordering. **en-US → Samantha** (default, listed first).
  **en-GB → Arthur** (`com.apple.ttsbundle.siri_arthur_en-GB_compact`, first en-GB voice by name, ahead of Daniel).
  `say -v '?'` does not list Arthur, so W2's `say` column never measured the British fallback.
- The unit-test fixture (`tests/system-voice.test.ts:38-44`) expects Daniel for en-GB. That is a fixture, not this Mac.

## 3. Volume → loudness: linear in dB, not 20·log10(v)

Measured on 140 renders: Samantha, Arthur and Daniel × 4 texts × 7 volumes, through both paths.
`AVSpeechSynthesizer.write` with `utterance.volume = v` is Chrome's property, measured with `/tmp/ntts-lim-B/avrender`.
`say [[volm v]]` is the cross-check. Each file was read by `ffmpeg -af ebur128=peak=true` and by the worker's own
`integrated_loudness` / `true_peak_dbtp` (`tts_worker.py:487/521`). The two meters agree within 0.06 LU on every
file. The AV and `say` paths agree within 0.1 LU on every pair.

| v | 1.0 | 0.9 | 0.8 | 0.7 | 0.6 | 0.5 | 0.4 | 0.3 | 0.2 | 0.1 | 0.05 | 0.0 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ΔLU (1.0–0.4: all 3 voices × 4 texts; 0.3–0.0: Samantha hero) | 0 | −2.4 | −4.8 | −7.2 | −9.6 | −12.0/−12.1 | −14.4 | −16.8 | −19.2 | −21.6 | −22.8 | mute (−70 floor) |

**Level(v) = Level(1.0) − 24·(1 − v) dB** for 0 < v ≤ 1, with a residual of ±0.1 LU; v = 0 is silence. The linear-
amplitude hypothesis (20·log10 v) is refuted: it predicts −6.0 at 0.5 and −1.9 at 0.8, against −12.0 and −4.8
measured. A 40·log10 law matches at 0.5 only, by coincidence: it misses by 0.9 LU at 0.8 and 1.5 LU at 0.4. The volume
that moves a voice by Δ dB is **v = 1 + Δ/24**. True peak moves by the same amount, so there is no clipping concern
(Samantha's peaks: −1.9 to −3.0 dBFS at 1.0).

Level of each fallback voice at volume 1.0 (worker meter):

| Voice | short | medium | hero | long (verify_loudness) |
|---|---|---|---|---|
| Samantha (en-US pick) | −16.7 | −16.1 | −16.4 | −16.2 |
| Arthur (en-GB pick) | −21.0 | −22.5 | −22.5 | −22.5 |
| Daniel (en-GB if Arthur absent) | −20.0 | −18.8 | −19.1 | −19.0 |

The 26-voice spread on the hero text, after dropping Chrome-order novelty voices, is Samantha −16.4, then Flo −18.4 …
Ralph −23.2. Of those 25, the median is about −21, and the Siri compact voices Aaron, Nicky and Martha sit at −21.3,
−21.9 and −20.7. So a user whose default voice is not Samantha already hears a fallback at Kokoro's level or below.

## 4. The volume that matches Kokoro's typical level, and the 15 jumps

Kokoro reference levels are W2 §10's helper table: the same texts as its system-voice column. The median of all 15 is
−18.0 LUFS; the median of the 9 Samantha-served cases is −18.3; hero af_heart is −20.2. Samantha's mean over the three
texts is −16.40.

- To −18.0 → v = 1 − 1.6/24 = **0.93**. To hero −20.2 → v = **0.84**. The min-max value for the American cases
  (centre the +0.0…+5.1 spread) is **0.89**.

Jumps at Samantha 0.89 (Arthur left at 1.0), fallback minus Kokoro in LU:

| | short | medium | hero |
|---|---|---|---|
| af_heart | −2.6 | −0.8 | +1.1 |
| af_bella | −1.0 | −0.9 | +0.2 |
| am_michael | −1.9 | +2.0 | +2.4 |
| bf_emma (→ Arthur) | −5.0 | −2.5 | −3.7 |
| bm_george (→ Arthur) | −5.0 | −4.6 | −5.1 |

Other volumes and the full per-case grid are in `/tmp/ntts-lim-B/jumps.txt` and `jumps2.txt`. Against W2's matrix table
(`short/medium/long`, where am_michael long sits at −25.0), the American spread at 1.0 is +0.1 … +8.8, the min-max
volume is 0.81, and 0.89 gives −2.5 … +6.1. One long, quiet am_michael take dominates that table. The fallback volume
cannot fix it, because the spread lives inside Kokoro.

## 5. Where the fallback sets volume today, and the size of the change

- **Nowhere.** `systemVoiceOptions` builds `{ rate, enqueue }` at `chrome-extension/src/shared/system-voice.ts:138-142`,
  adds `voiceName`/`lang` at `:145`/`:147`, and types the return as `Pick<…, 'rate' | 'lang' | 'voiceName' | 'enqueue'>`
  at `:137`. `speakWithSystemVoice` spreads it straight into `chrome.tts.speak(text, { ...options, onEvent })` at
  `chrome-extension/src/background/system-voice-engine.ts:164`. Volume is therefore unset, which means 1.0 (§1).
  Kokoro playback also sets no volume (`grep volume chrome-extension/src/offscreen` returns nothing), so the system
  output slider scales both engines equally and the jumps above are what a user hears.
- **Change for the voice-keyed variant: about 5 source lines plus 3 test assertions.** Add `'volume'` to the `Pick` at
  `:137`, add one constant `SYSTEM_VOICE_VOLUME = { Samantha: 0.89 }`, and add
  `volume: SYSTEM_VOICE_VOLUME[name] ?? 1` where `:145` and `:147` set `voiceName`. `system-voice-engine.ts` needs no
  change. The exact-object `toEqual` assertions at `tests/system-voice.test.ts:123, 132, 145` need `volume` added; the
  `:145` case picks Samantha, so it gets 0.89. The e2e harness is unaffected: it forces `volume: 0` over whatever the
  extension passes (`tests/e2e/run-e2e.mjs:161`) and never asserts it.

## 6. Limits of this measurement

- **Rendered offline, not captured live.** Every figure comes from `AVSpeechSynthesizer.write` or `say -o`. Chrome calls
  `speakUtterance`, the live path. Both set the same `AVSpeechUtterance.volume`, and `say`'s independent `[[volm]]`
  command reproduces the curve to 0.1 LU. Live playback was not captured, because this Mac has no loopback audio device
  (`system_profiler SPAudioDataType` shows no BlackHole, Loopback or Soundflower).
- **The voice order is derived, not observed.** It comes from Chromium's `LoadVoices`, replicated in Swift, not from
  `chrome.tts.getVoices()` in a running Chrome. The e2e harness logs the chosen `voiceName`
  (`tests/e2e/run-e2e.mjs:534`), so one e2e run on this Mac would confirm "Arthur".
- **The fallback voice depends on the user's Mac.** The Samantha rows hold wherever the system default is Samantha. A
  global constant would also quiet users whose default voice already sits at −19 to −23; the voice-keyed form
  leaves them alone. If Arthur is absent, the en-GB fallback is Daniel, with jumps of −4.0 … +1.2 on the hero set.
- **One take per case.** Kokoro levels are W2's single seeded takes. System-voice renders repeat within 0.1 LU (frame
  counts differed 0.4% between two renders of the same text).

## Reproduce

```
cd /tmp/ntts-lim-B
swiftc -O avrender.swift -o avrender && swiftc -O listvoices.swift -o listvoices   # listvoices needs `import AppKit`
./listvoices                                                                      # Chrome-order en-US/en-GB voices
<repo>/native-helper/Sources/NaturalTTSHelper/Resources/python-env/bin/python sweep.py   # 140 renders -> sweep.json
```

The core of `avrender.swift` builds `AVSpeechUtterance(string:)` with `voice = AVSpeechSynthesisVoice(identifier:)`,
`rate = AVSpeechUtteranceDefaultSpeechRate` (chrome.tts rate 1, `tts_mac.mm:286`) and `volume = v`. It then calls
`AVSpeechSynthesizer.write(_:toBufferCallback:)` into an `AVAudioFile` (22.05 kHz mono float32). Scratch is ephemeral;
the numbers above are the record.
