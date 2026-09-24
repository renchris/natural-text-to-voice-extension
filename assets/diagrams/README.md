# Diagrams

Each `.mmd` here is the source of truth. `bun run diagrams` (from the repo root) renders it to
`<name>-dark.svg` and `<name>-light.svg` with [beautiful-mermaid](https://github.com/lukilabs/beautiful-mermaid)
1.1.3, on GitHub's own dark and light palettes, and fails if any SVG is wider than 838 px (the README column).
Never edit an SVG by hand: CI runs `bun run diagrams:check`, which fails when a committed SVG, or a synced
mermaid fence, no longer matches its source.

| Source | Shows | Type | Size |
|---|---|---|---|
| `architecture.mmd` | Everything inside one "Your Mac" boundary: the extension's parts, the one loopback hop, and the helper, worker and GPU behind it | `flowchart TB` | 723 × 891 |
| `right-click-flow.mmd` | What happens after **Speak selected text**, with the PDF/frame and system-voice branches | `flowchart TB`, numbered steps | 688 × 739 |
| `popup-status.mmd` | What the popup's status pill means and how it changes, each state in its pill's colour | `flowchart TB`, stadium nodes | 660 × 625 |
| `performance.mmd` | Speed by text length, each bar labelled, with the wait before audio under it (generated) | `xychart-beta` | 750 × 514 |

Semantic colours come from `@tokens` in the `classDef` lines (`@chrome-bg`, `@mac-fg`, …), which
`scripts/render-diagrams.mjs` swaps for per-mode values: indigo (the brand accent) for Chrome, green for the Mac,
amber for fallbacks. `popup-status` uses the popup's own pill colours (grey Checking, amber Warming, green
Connected, red Offline); it is a `flowchart` because beautiful-mermaid 1.1.3 ignores `classDef` in state diagrams.
Edges use the palette's muted grey (6.1:1 on white, 6.2:1 on GitHub dark; the themes' own border grey was 1.4:1 and
1.9:1, under WCAG 1.4.11's 3:1) and arrow heads the brand indigo. For `xychart` sources, two comment directives add
static text the library only shows on hover: `%% bar-label-suffix: ×` and `%% x-sublabels: a | b | …`.
Nested subgraphs are avoided on purpose: with edges crossing them, beautiful-mermaid 1.1.3 routes lines outside the
diagram, so the Chrome and helper halves of `architecture` are told apart by colour inside one "Your Mac" boundary.

## Embedding

Paths are relative to the embedding file. The marker comment makes `bun run diagrams` fill the fence and keep it
in step with the `.mmd` (the dark palette is baked in, since native mermaid cannot switch per colour mode). It
syncs markers in `README.md` and in the top-level `.md` files of `docs/`, `chrome-extension/` and
`native-helper/`; marker paths are always repo-root-relative. Leave the fence body empty; the script fills it.

````html
<!-- Diagram source: assets/diagrams/architecture.mmd. Edit it, run `bun run diagrams`, commit the SVGs. -->
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/diagrams/architecture-dark.svg">
  <img src="assets/diagrams/architecture-light.svg" alt="…a full prose description of the diagram…">
</picture>

<details>
<summary>Interactive Diagram</summary>

<!-- mermaid-fence: assets/diagrams/architecture.mmd (auto-synced by `bun run diagrams`) -->
```mermaid
```

<sup><a href="assets/diagrams/architecture-dark.svg?raw=true">full-screen dark</a> · <a href="assets/diagrams/architecture-light.svg?raw=true">light</a> · <a href="assets/diagrams/architecture.mmd">source</a></sup>

</details>
````

Suggested alt text, checked against the code on 2026-09-23:

- **architecture**: "Everything is inside your Mac. In Chrome, the popup and the service worker. The service worker hands text to an offscreen
  document, or, when the helper is not running, speaks it with a chrome.tts system voice. The popup and the
  offscreen document call the Natural TTS helper over HTTP on 127.0.0.1:8249 only. On the Mac, the Swift helper
  checks the Host and Origin headers, passes the request as JSON frames over stdio to a Python worker running
  Kokoro-82M with mlx-audio, which runs on the Apple GPU through MLX and Metal, offline."
- **right-click-flow**: "1, you right-click a selection and choose Speak selected text. 2, the service worker runs
  a script in the clicked frame to read the selection; for a PDF or a cross-origin frame it uses the text Chrome
  passed with the click. 3, it sends the text, voice and speed to the offscreen document. 4, the offscreen
  document posts it to the helper at 127.0.0.1:8249. 5, the helper returns a WAV and the offscreen document plays
  it; or, if no helper answers, a system voice speaks the text and the toolbar icon shows a grey i."
- **popup-status**: "When the popup opens it shows Checking. If the model is loaded it goes to Connected, with
  Kokoro voices. If the helper answers but is still loading, Warming, which polls /health every 2 seconds until
  Connected. If no helper answers, Offline with a system voice (the default setting). Offline with an error and a
  Retry button when system voices are turned off, the helper's engine stopped, or the helper did not reply.
  Retry returns to Checking."

`performance.mmd` is generated by `node bench/chart.mjs` from `bench/results.json`; never edit it by hand. The render
script picks up every `.mmd` in this directory.
