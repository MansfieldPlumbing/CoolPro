// src/ffmpeg.js — true MP4 export via ffmpeg.wasm (the "@ffmpeg JS module").
// Cross-origin loading of ffmpeg.wasm is finicky: passing classWorkerURL forces a
// module worker, and the ESM worker has relative imports that break when blobbed.
// Proven-working recipe (verified end-to-end in headless Chromium): vendor the tiny
// @ffmpeg ESM *glue* same-origin (vendor/ffmpeg, vendor/ffmpeg-util) so the worker
// loads natively, and pull only the heavy ~30MB core/wasm from the CDN (warmable &
// cacheable through the Add-ons manager). Single-threaded core → no cross-origin
// isolation / COOP-COEP needed, so it runs on plain GitHub Pages and the CDN add-ons
// keep working.
const CORE_BASE = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm';
export const CORE_URLS = [`${CORE_BASE}/ffmpeg-core.js`, `${CORE_BASE}/ffmpeg-core.wasm`];

let _ff = null;
let _loading = null;

export function isLoaded() { return !!_ff; }

export async function loadFFmpeg(onStatus) {
  if (_ff) return _ff;
  if (_loading) return _loading;
  _loading = (async () => {
    onStatus?.('Loading ffmpeg…');
    const { FFmpeg } = await import('../vendor/ffmpeg/index.js');
    const { toBlobURL } = await import('../vendor/ffmpeg-util/index.js');
    const ff = new FFmpeg();
    ff.on('log', ({ message }) => { /* console.debug('[ffmpeg]', message) */ });
    ff.on('progress', ({ progress }) => {
      if (progress >= 0 && progress <= 1) onStatus?.(`Transcoding… ${Math.round(progress * 100)}%`, Math.round(progress * 100));
    });
    onStatus?.('Downloading ffmpeg core (~30 MB, cached after first use)…');
    await ff.load({
      coreURL: await toBlobURL(CORE_URLS[0], 'text/javascript'),
      wasmURL: await toBlobURL(CORE_URLS[1], 'application/wasm'),
    });
    _ff = ff;
    return ff;
  })().catch((e) => { _loading = null; throw e; });
  return _loading;
}

// Generic transcode: write `file` (Blob/File/Uint8Array) as 'input', run ffmpeg
// with `args` (which must reference 'input' and produce `outName`), and return the
// result as a Blob of `mime`. The standalone converter (convert.js) and the timeline
// MP4 export both build on this.
export async function transcode(file, { args, outName, mime, onStatus } = {}) {
  const ff = await loadFFmpeg(onStatus);
  const { fetchFile } = await import('../vendor/ffmpeg-util/index.js');
  await ff.writeFile('input', await fetchFile(file));
  onStatus?.('Transcoding…', 0);
  await ff.exec(args);
  const data = await ff.readFile(outName);
  try { await ff.deleteFile('input'); await ff.deleteFile(outName); } catch (_) {}
  return new Blob([data.buffer], { type: mime });
}

// Transcode a recorded blob (WebM from MediaRecorder) to H.264/AAC MP4.
export function transcodeToMp4(blob, { onStatus } = {}) {
  return transcode(blob, {
    outName: 'output.mp4', mime: 'video/mp4', onStatus,
    args: ['-i', 'input',
      '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-crf', '23',
      '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', 'output.mp4'],
  });
}
