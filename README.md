# NoCap

**FOSS relief from Play Store slop** — a client-side, no-build, vanilla-JS video & audio
editor in the browser. The goal: a CapCut / mobile-audio-editor replacement that runs
entirely on-device, with real on-device AI (no accounts, no uploads, no backend).

> Decomposed from the React/Vite (Google AI Studio) "No Cap — Cap Cut Killer"
> prototype into plain HTML/CSS/JS. The original React project has been removed now
> that the rewrite stands on its own (it remains in git history if ever needed). The
> live app is the vanilla build served from `index.html`. A few standalone vanilla UI
> mockups from the prototype are kept under [`examples/`](examples/) as design references.

## What works today

- **Media bin** — import video / audio / images (file picker, drag-and-drop, **clipboard
  paste**, or **by URL / data-URL**), with generated thumbnails and audio waveforms.
  Legacy containers (AVI/MKV/WMV/…) are **auto-modernized to MP4 on import** so they play.
- **Audio from video** — pull any clip's audio onto an audio track (🎵 on a video in the bin).
- **Convert** — a HandBrake-style standalone tool: compress a video **lean & mean**
  (downscale + CRF presets), **web-optimize** MP4 (`+faststart`), or extract WAV/MP3 audio
  — reports the real size delta and offers **Download or Share** (Web Share API).
- **Multi-track timeline** — canvas-rendered video & audio tracks; drag to move,
  edge-drag to trim, click the ruler to scrub, snapping, zoom, split, delete.
- **Preview** — canvas compositor + Web-Audio playback with per-clip / per-track volume.
- **Export** — deterministic offline audio mixdown to **WAV** (built-in) or **MP3**
  (lamejs); **video** via realtime canvas+audio capture → **MP4** (H.264/AAC,
  transcoded by **ffmpeg.wasm**) or fast **WebM**.
- **Projects** — saved to browser storage (IndexedDB) and restored on reload.
- **AI layer** — a thin provider abstraction (dp-onnx-ready). Live now: **Smart Auto-Trim**
  (silence detection, no download) and **RIFE frame doubling** (2× fps via an ONNX model
  in onnxruntime-web — point it at your `rife*.onnx`; ported in spirit from the native
  `rife_trt` engine). Declared with honest status: captions (Whisper), background removal
  (RMBG-1.4), voiceover (Kokoro via dp-onnx), and more.
- **Installable PWA** — install to home screen; **explicit update checking** (a banner
  offers "Update" — you're in control, no surprise reloads).
- **Full offline** — the entire app shell is precached, so it boots and edits in
  airplane mode. Updating the app **never wipes your CDN cache**.
- **Add-ons / CDN cache** — a package manager (the bundle's "CDN Marketplace"): add/remove
  CDN packages (ESM, wasm, model weights) and **warm them for offline use**. The app cache
  (`NoCap-v*`) and the CDN cache (`NoCap-cdn`) are independent, so updates and add-ons don't
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
| `ffmpeg.js` | generic ffmpeg.wasm transcode + MP4 (H.264/AAC) (vendored glue + CDN core) |
| `convert.js` | standalone HandBrake-style converter (compress / web-optimize / extract audio / share) |
| `ml.js` | on-device AI provider abstraction + capability catalog |
| `rife.js` | RIFE frame doubling provider (onnxruntime-web) |
| `cdn.js` | CDN package registry + warm/uncache into the durable CDN cache |
| `pwa.js` | service-worker registration, install prompt, update checking |
| `addons.js` | Add-ons modal: manage CDN packages, install, check updates |
| `panels.js` | inspector: clip props, Audio FX, Video FX, AI |
| `app.js` | wiring: bin, top bar, transport, keyboard |

`sw.js` precaches the shell (offline) and serves a separate `NoCap-cdn` cache for
cross-origin packages; `manifest.webmanifest` + `icons/` make it installable.

`theme.css` holds the design tokens (house style); `app.css` holds layout only.

## Run it
It's static — serve the folder and open `index.html`:

```sh
python3 -m http.server 8080
# open http://localhost:8080
```

No special headers needed: MP4 export uses the **single-threaded** ffmpeg.wasm core, so
it works without cross-origin isolation (COOP/COEP) — on plain static hosting and on
GitHub Pages. (A multi-threaded core would be faster but would require COOP/COEP and is
not used.) Installing the PWA and full offline both require **HTTPS** (or `localhost`);
the included GitHub Pages workflow handles that once merged to `main`.

## Roadmap
- Real captions (Whisper) + background removal (RMBG-1.4, ported from art4quinn).
- dp-onnx browser runtime → Kokoro voiceover; heavier models (Demucs, super-res, RIFE).
- Frame-accurate MP4 export (render frames straight to ffmpeg instead of realtime capture).
- Transitions & keyframes.
- Single-file build: inline `src/` + CSS into one self-contained `NoCap.html`.
