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

// Extract the audio track of ANY media (video or audio, any codec) to a 48k stereo PCM WAV.
// This is the codec-agnostic, never-hangs path that the browser's decodeAudioData can't give us
// for video containers — it's what makes "video → audio" reliable (export + the Convert sheet).
export async function extractWav(blob, { onStatus } = {}) {
  const ff = await loadFFmpeg(onStatus);
  const { fetchFile } = await import('../vendor/ffmpeg-util/index.js');
  const inName = 'in', outName = 'out.wav';
  await ff.writeFile(inName, await fetchFile(blob));
  onStatus?.('Extracting audio…');
  await ff.exec(['-i', inName, '-vn', '-ac', '2', '-ar', '48000', '-c:a', 'pcm_s16le', outName]);
  const data = await ff.readFile(outName);
  try { await ff.deleteFile(inName); await ff.deleteFile(outName); } catch (_) {}
  if (!data || !data.length) throw new Error('No audio track found');
  return new Blob([data.buffer], { type: 'audio/wav' });
}

// Transcode a recorded blob (WebM from MediaRecorder) to H.264/AAC MP4.
export async function transcodeToMp4(blob, { onStatus } = {}) {
  const ff = await loadFFmpeg(onStatus);
  const { fetchFile } = await import('../vendor/ffmpeg-util/index.js');
  const inName = 'input', outName = 'output.mp4';
  await ff.writeFile(inName, await fetchFile(blob));
  onStatus?.('Transcoding to MP4…', 0);
  await ff.exec([
    '-i', inName,
    '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-crf', '23',
    '-c:a', 'aac', '-b:a', '192k',
    '-movflags', '+faststart',
    outName,
  ]);
  const data = await ff.readFile(outName);
  try { await ff.deleteFile(inName); await ff.deleteFile(outName); } catch (_) {}
  return new Blob([data.buffer], { type: 'video/mp4' });
}
