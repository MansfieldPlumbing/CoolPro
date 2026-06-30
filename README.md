# CoolPro

**FOSS relief from Play Store slop** — a client-side, no-build, vanilla-JS creative studio in
the browser. One app that is a **CapCut**-style A/V editor, a **Paint-Shop-Pro**-style raster
studio, and a **3D model maker** — sharing one inference runtime and one object model, running
entirely on-device (no accounts, no uploads, no backend).

> Merged from three sibling repos — the **nocap** A/V editor (this repo's origin), **art4quinn**
> (paint + 3D + image ML), and **arlinearcade** (the shared painter + audio helpers) — onto the
> architectural spine of **subsystem** (the VOM object model and the dp-onnx → **dpx** runtime).
> The shared code is shared *on purpose*: one ML harness and one UI chrome power every surface.

## The three surfaces (one shell)

The top bar is the **Shell** — an app switcher that mounts one *presenter* at a time. Switch
with the rail; everything shares the same media, the same ML runtime, and the same house style.

| surface | what it is | brings |
| --- | --- | --- |
| 🎬 **Editor** | CapCut-style multitrack A/V editor | timeline, preview compositor, Web-Audio mix, WAV/MP3/WebM/**MP4** (ffmpeg.wasm) export |
| 🖌️ **Paint** | Paint-Shop-Pro raster studio (`apps/paint`) | layers, blend modes, brush/pencil/marker/fill, blur/smudge/dodge/burn, **AI Magic Wand** (SlimSAM), **Magic Eraser** (LaMa), **Erase Background** (RMBG) |
| 🧊 **3D** | image → silhouette → paintable standee (`apps/three`) | drop any image, extrude to a 2-sided relief on a floor, paint on the mesh by raycast, **AI cut-out** (RMBG) |

## Architecture — the subsystem doctrine, in the browser

CoolPro mirrors **subsystem**'s discipline: *one namespace of refcounted objects, the UI is a
projection of it, nothing holds its own truth, behaviours are verbs on objects.*

- **`src/vom.js` — the VOM (Virtual Object Manager).** JS parity of subsystem's `vom.h`/`Vom.cs`
  kernel: one namespace of refcounted, **generational handles**; authority *is* the handle;
  reclaim is deterministic — **free-on-zero**, owner-scoped, cascade-kill on terminate. The
  difference from the native seam: a region holds a live JS *node* (a clip, a layer, a mesh, a
  model session) instead of a byte span. "JavaScript when it actually comes correct."
- **`src/dpx.js` — the inference runtime.** Formerly the editor's thin `ml` seam; promoted to
  *the* runtime (subsystem's **dp-onnx → dpx**). One provider registry, one capability catalog,
  one job lock — and the load-bearing tie-in: **a loaded model is a VOM region.** Its refcount is
  its authority; at zero the region frees and the session's `dispose()` releases the GPU/WASM
  weights. Inference can't leak because the namespace owns it. A future **dpx-wasm/WebNN** build
  of the native engine registers as a provider and the call sites never move.
- **`src/registry.js` — resolve-by-id.** The one place that knows how a presenter is *located*
  (static manifest now; a `Cm` query later — callers don't change). Resolve-known, degrade-to-empty.
- **`src/presenter.js` + `src/shell.js` — the chrome.** A presenter holds no truth: it is handed
  a host + context, renders, and contributes **verbs** the Shell presents. Native presenters
  (the editor) mount in-realm; **guests** (paint, 3D) are hosted one-HTML-file apps in an iframe,
  with menus bridged over the postMessage protocol in `shared/presenter.js` — the exact
  html-applet-as-guest model subsystem uses. (Paint already ships as an `.obp` object-presenter
  with a `Sys.vom` of its own, designed to bind a host-injected provider with zero UI change.)

```
index.html ── Shell (app rail)
   ├─ src/shell.js · registry.js · presenter.js   the chrome (projects the namespace)
   ├─ src/vom.js                                   the model (one refcounted namespace)
   ├─ src/dpx.js  → vendor/ml/{segment,select,inpaint}.js   the runtime (RMBG · SlimSAM · LaMa)
   ├─ surface: Editor (native)  src/{store,timeline,preview,audio,export,panels,…}.js
   ├─ surface: Paint  (guest)   apps/paint/   ← shared vendor/ml + vendor/ui
   └─ surface: 3D     (guest)   apps/three/   ← shared vendor/ml + vendor/ui
```

`theme.css` holds the editor's design tokens; `vendor/ui/flickpaint-ui.css` is the guests' shared
glass chrome. `sw.js` precaches the whole studio (offline) and serves a durable `nocap-cdn` cache
for cross-origin packages; the app cache and CDN cache are independent, so updates and add-ons
don't step on each other.

## Run it

It's static — serve the folder and open `index.html`:

```sh
python3 -m http.server 8080
# open http://localhost:8080
```

No special headers needed: MP4 export uses the **single-threaded** ffmpeg.wasm core, so it works
without cross-origin isolation (COOP/COEP) — on plain static hosting and on GitHub Pages.
Installing the PWA and full offline both require **HTTPS** (or `localhost`).

## Roadmap (the merge, continued)

This is **increment 1**: the spine (`vom`/`dpx`/`registry`/`shell`/`presenter`), the three
surfaces brought in and switchable, the shared ML/UI deduplicated, and the editor's AI tab
running real RMBG background removal on image clips through `dpx`.

- **Hoist ML into `dpx` across the frame boundary** — today each guest realm loads its own ML
  instance; route paint/3D inference through the host `dpx` so the model loads once, governed by
  the VOM.
- **Bind the guests' `Sys.vom` to `src/vom.js`** — paint's `__SUBSYSTEM_PROVIDER__` seam already
  exists; make CoolPro the injected provider so layers live in the real namespace.
- **dpx-wasm** — register the native engine's browser build as the `dpx` provider; flip `tts`
  (Kokoro) and the heavier video caps from `native`/`soon` to `ready`.
- **Cross-surface flow** — send a Paint cut-out or a 3D screenshot straight onto the editor timeline.
- **Audio surface** (Cool-Edit-Pro side) — a dedicated waveform editor reusing `vendor/audio/`.
- Frame-accurate MP4 export, transitions & keyframes, single-file build.
