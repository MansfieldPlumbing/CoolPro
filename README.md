# nocap-editor

**FOSS relief from Play Store slop** — a client-side, no-build, vanilla-JS video & audio
editor in the browser. The goal: a CapCut / mobile-audio-editor replacement that runs
entirely on-device, with real on-device AI (no accounts, no uploads, no backend).

> Decomposed from a minified React/Vite (Google AI Studio) prototype into plain
> HTML/CSS/JS. The original prototype is kept for reference at
> [`reference-ai-studio-bundle.html`](reference-ai-studio-bundle.html).

## Status — foundation
A working editor core is in place:

- **Media bin** — import video / audio / images (file picker or drag-and-drop), with
  generated thumbnails and audio waveforms.
- **Multi-track timeline** — canvas-rendered video & audio tracks; drag to move,
  edge-drag to trim, click the ruler to scrub, snapping, zoom, split, delete.
- **Preview** — canvas compositor + Web-Audio playback with per-clip / per-track volume.
- **Export** — deterministic offline audio mixdown to **WAV** (built-in) or **MP3**
  (lamejs, lazy-loaded); **video** via realtime canvas+audio capture (WebM today,
  ffmpeg.wasm MP4 planned).
- **Projects** — saved to browser storage (IndexedDB) and restored on reload.
- **AI layer** — a thin provider abstraction (dp-onnx-ready). Live now: **Smart Auto-Trim**
  (silence detection, no download). Declared with honest status: captions (Whisper),
  background removal (RMBG-1.4), voiceover (Kokoro via dp-onnx), and more.
- **Installable PWA** — install to home screen; **explicit update checking** (a banner
  offers "Update" — you're in control, no surprise reloads).
- **Full offline** — the entire app shell is precached, so it boots and edits in
  airplane mode. Updating the app **never wipes your CDN cache**.
- **Add-ons / CDN cache** — a package manager (the bundle's "CDN Marketplace"): add/remove
  CDN packages (ESM, wasm, model weights) and **warm them for offline use**. The app cache
  (`nocap-v*`) and the CDN cache (`nocap-cdn`) are independent, so updates and add-ons don't
  step on each other.

## Architecture
No framework, no bundler. `index.html` loads ES modules from `src/`:

| module | role |
| --- | --- |
| `store.js` | project model, mutations, pub/sub, IndexedDB persistence |
| `media.js` | import + decode, thumbnails, waveforms |
| `timeline.js` | canvas timeline render + pointer interactions |
| `preview.js` | transport, canvas compositor, audio sync |
| `audio.js` | shared Web-Audio graph (per-element gain → master) |
| `export.js` | offline mixdown, WAV/MP3 encoders, realtime video capture |
| `ml.js` | on-device AI provider abstraction + capability catalog |
| `cdn.js` | CDN package registry + warm/uncache into the durable CDN cache |
| `pwa.js` | service-worker registration, install prompt, update checking |
| `addons.js` | Add-ons modal: manage CDN packages, install, check updates |
| `panels.js` | inspector: clip props, Audio FX, Video FX, AI |
| `app.js` | wiring: bin, top bar, transport, keyboard |

`sw.js` precaches the shell (offline) and serves a separate `nocap-cdn` cache for
cross-origin packages; `manifest.webmanifest` + `icons/` make it installable.

`theme.css` holds the design tokens (house style); `app.css` holds layout only.

## Run it
It's static — serve the folder and open `index.html`:

```sh
python3 -m http.server 8080
# open http://localhost:8080
```

(For ffmpeg.wasm threading later you'll want cross-origin isolation — COOP/COEP headers
or a `coi-serviceworker` shim.)

## Roadmap
- Real captions (Whisper) + background removal (RMBG-1.4, ported from art4quinn).
- dp-onnx browser runtime → Kokoro voiceover; heavier models (Demucs, super-res, RIFE).
- ffmpeg.wasm true MP4 mux; transitions & keyframes; PWA install + offline.
- Single-file build: inline `src/` + CSS into one self-contained `nocap.html`.
