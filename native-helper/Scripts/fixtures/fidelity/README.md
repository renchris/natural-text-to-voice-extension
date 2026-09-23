# Fidelity reference (Scripts/ref_compare.py, Scripts/asr2.py)

- `ref-torch-prose0.flac`, `ref-torch-prose1.flac`: the PyTorch reference Kokoro (hexgrad `kokoro` 0.9.4,
  `hexgrad/Kokoro-82M`, voice `af_heart`, speed 1.0, `lang_code="a"`) reading the `prose` text, generated
  twice by the R01 run (`/tmp/ntts-r01/ref_compare.py gen_ref`). 24 kHz mono PCM16, stored as lossless FLAC
  (sample-identical to the original WAVs). Run 0 is the reference; run 1 measures the noise floor.
- `texts.json`: the R01 benchmark texts (`short`, `prose`, `numeric`, `long`).

Calibration, reproduced from these files by `ref_compare.py --wav`: noise floor log-mel L1 0.0491;
mlx-audio 0.2.6 0.4273 at -2.65 dB; mlx-audio 0.5.5 0.1154 at -0.20 dB
(docs/research/2026-09-upgrade/R01-local-tts-models.md, UPGRADE_RESEARCH.md §1).
