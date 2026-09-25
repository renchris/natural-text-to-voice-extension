// Driven over CDP by scripts/capture/tts-volume.sh. An extension page, not a service worker: a worker goes idle
// after ~30 s, in the middle of the takes.
self.voices = () => new Promise(resolve => chrome.tts.getVoices(vs => resolve(vs.map(v => `${v.voiceName}|${v.lang}`))));
// Speak `text` with `voice` at `volume`; resolves on the terminal event.
self.speakAt = (text, voice, volume) => new Promise(resolve => {
  const t0 = Date.now();
  chrome.tts.speak(text, {
    voiceName: voice, lang: 'en-US', rate: 1, volume,
    onEvent: e => {
      if (['end', 'error', 'interrupted', 'cancelled'].includes(e.type)) {
        resolve({ volume, event: e.type, error: e.errorMessage ?? null, ms: Date.now() - t0 });
      }
    },
  }, () => { if (chrome.runtime.lastError) resolve({ volume, error: chrome.runtime.lastError.message }); });
});
