// src/rife.js — RIFE frame interpolation (frame doubling) as an ml.js provider.
//
// NoCap-web can't run the TensorRT engine from rife_trt, but it CAN run the same
// underlying ONNX model in-browser via onnxruntime-web. This registers a provider
// for the `rife` capability: it extracts a clip's frames with ffmpeg.wasm, asks the
// model for the in-between frame of each consecutive pair (timestep 0.5 → 2× fps),
// interleaves them, and re-encodes a smooth clip back into the bin.
//
// VERIFY-AGAINST-YOUR-MODEL: input/output tensor NAMES are auto-detected from the
// session, and the standard RIFE convention (two [1,3,H,W] image inputs, t baked at
// 0.5, one [1,3,H,W] output, dims padded to a multiple of 32) is assumed. If your
// rife49_ensemble export differs (e.g. a single concat input, or an explicit
// timestep input), adjust buildFeeds() / the CONFIG below — the rest is generic.
import * as S from './store.js';
import { registerProvider, CAPS } from './ml.js';
import { importBlob } from './media.js';
import { toast } from './hud.js';

const CONFIG = {
  modelKey: 'nocap.rife.modelUrl',  // localStorage key for the ONNX URL
  ortPaths: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/',
  align: 32,                        // pad H/W to a multiple of this
  maxFrames: 480,                   // guard against OOM on long clips
};

export function initRife() {
  registerProvider('rife-web', { caps: new Set(['rife']), run: runRife });
  // flip the catalog entry from "soon" to "downloads model" so the UI is honest
  const cap = CAPS.find((c) => c.id === 'rife');
  if (cap) { cap.status = 'model'; cap.desc = 'Frame doubling (2× fps) via RIFE ONNX, on-device (onnxruntime-web).'; }
}

// ---- model + runtime loading ----------------------------------------------
let _ort = null, _session = null;

async function loadOrt() {
  if (_ort) return _ort;
  // onnxruntime-web ships as a UMD bundle that attaches `ort` to the global scope.
  await import(/* @vite-ignore */ CONFIG.ortPaths + 'ort.webgpu.min.js').catch(() => {});
  const ort = globalThis.ort;
  if (!ort) throw new Error('onnxruntime-web failed to load (warm it in Add-ons)');
  ort.env.wasm.wasmPaths = CONFIG.ortPaths;
  _ort = ort;
  return ort;
}

function modelUrl() {
  let url = localStorage.getItem(CONFIG.modelKey);
  if (!url) {
    url = prompt('RIFE model URL (your rife49…sim.onnx, hosted somewhere CORS-enabled):');
    if (url) localStorage.setItem(CONFIG.modelKey, url.trim());
  }
  return url && url.trim();
}

async function getSession(onStatus) {
  if (_session) return _session;
  const ort = await loadOrt();
  const url = modelUrl();
  if (!url) throw new Error('No RIFE model URL set');
  onStatus?.('Loading RIFE model…');
  _session = await ort.InferenceSession.create(url, {
    executionProviders: ['webgpu', 'wasm'],
    graphOptimizationLevel: 'all',
  });
  return _session;
}

// ---- provider entry: interpolate the selected video clip's media ------------
async function runRife(_capId, _args, onStatus) {
  const sel = S.state.selection && S.findClip(S.state.selection);
  const m = sel && S.media.get(sel.clip.mediaId);
  if (!m || m.kind !== 'video' || !m.file) { toast('Select a video clip first.', { ms: 2600 }); return; }

  const { loadFFmpeg } = await import('./ffmpeg.js');
  const ff = await loadFFmpeg(onStatus);
  const { fetchFile } = await import('../vendor/ffmpeg-util/index.js');
  const session = await getSession(onStatus);

  // 1) explode the source into PNG frames (and copy audio if present)
  onStatus?.('Extracting frames…', 0);
  await ff.writeFile('src', await fetchFile(m.file));
  await ff.exec(['-i', 'src', '-vsync', '0', 'f_%05d.png']);
  const srcFrames = await listFrames(ff, 'f_');
  if (srcFrames.length < 2) throw new Error('Not enough frames to interpolate');
  if (srcFrames.length > CONFIG.maxFrames)
    throw new Error(`Clip too long for in-browser RIFE (${srcFrames.length} frames > ${CONFIG.maxFrames}). Try a shorter clip.`);
  let hasAudio = true;
  try { await ff.exec(['-i', 'src', '-vn', '-c:a', 'aac', '-b:a', '160k', 'audio.m4a']); }
  catch (_) { hasAudio = false; }

  const inNames = session.inputNames, outName = session.outputNames[0];
  const fps = Math.max(1, Math.round((srcFrames.length) / (m.duration || srcFrames.length / 30)));

  // 2) for each consecutive pair, synthesize the midpoint; interleave into out_*
  let outIdx = 0;
  const writeOut = async (bytes) => { await ff.writeFile(`out_${pad(++outIdx)}.png`, bytes); };
  let prev = await frameToInput(ff, srcFrames[0]);
  await writeOut(await ff.readFile(srcFrames[0]));   // keep original frame 0
  for (let i = 1; i < srcFrames.length; i++) {
    onStatus?.(`Interpolating ${i}/${srcFrames.length - 1}…`, Math.round((i / (srcFrames.length - 1)) * 100));
    const cur = await frameToInput(ff, srcFrames[i]);
    const mid = await interpolate(session, _ort, inNames, outName, prev, cur);
    await writeOut(mid);                              // synthesized midpoint
    await writeOut(await ff.readFile(srcFrames[i]));  // then the real frame
    prev = cur;
  }

  // 3) re-encode at 2× fps, web-optimized, audio stream-matched
  onStatus?.('Encoding 2× clip…');
  const encArgs = ['-framerate', String(fps * 2), '-i', 'out_%05d.png'];
  if (hasAudio) encArgs.push('-i', 'audio.m4a');
  encArgs.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p');
  if (hasAudio) encArgs.push('-c:a', 'aac', '-shortest');
  encArgs.push('-movflags', '+faststart', 'rife.mp4');
  await ff.exec(encArgs);
  const data = await ff.readFile('rife.mp4');
  await cleanup(ff, srcFrames, outIdx, hasAudio);

  const blob = new Blob([data.buffer], { type: 'video/mp4' });
  await importBlob(blob, `${baseName(m.name)} 2x.mp4`);
  toast(`RIFE done — ${srcFrames.length} → ${outIdx} frames @ ${fps * 2}fps`, { ms: 3200 });
}

// ---- inference helpers ------------------------------------------------------
// Build the model feeds from two preprocessed frames. Auto-detects the input
// arity: 2+ inputs → (img0, img1[, timestep]); 1 input → channel-concat [1,6,H,W].
function buildFeeds(ort, inNames, a, b) {
  if (inNames.length >= 2) {
    const feeds = { [inNames[0]]: a.tensor, [inNames[1]]: b.tensor };
    if (inNames[2]) {
      const t = new Float32Array(a.padH * a.padW).fill(0.5);
      feeds[inNames[2]] = new ort.Tensor('float32', t, [1, 1, a.padH, a.padW]);
    }
    return feeds;
  }
  const cat = new Float32Array(a.data.length + b.data.length);
  cat.set(a.data, 0); cat.set(b.data, a.data.length);
  return { [inNames[0]]: new ort.Tensor('float32', cat, [1, 6, a.padH, a.padW]) };
}

async function interpolate(session, ort, inNames, outName, a, b) {
  const out = await session.run(buildFeeds(ort, inNames, a, b));
  const t = out[outName];
  return tensorToPng(t.data, a.padW, a.padH, a.w, a.h);
}

// Decode a PNG frame from the ffmpeg FS into a padded, normalized CHW tensor.
async function frameToInput(ff, name) {
  const bytes = await ff.readFile(name);
  const bmp = await createImageBitmap(new Blob([bytes.buffer], { type: 'image/png' }));
  const w = bmp.width, h = bmp.height;
  const padW = align(w), padH = align(h);
  const cvs = new OffscreenCanvas(padW, padH);
  const cx = cvs.getContext('2d');
  cx.drawImage(bmp, 0, 0);
  const img = cx.getImageData(0, 0, padW, padH).data;
  const plane = padW * padH;
  const data = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) { data[i] = img[i * 4] / 255; data[plane + i] = img[i * 4 + 1] / 255; data[2 * plane + i] = img[i * 4 + 2] / 255; }
  return { data, tensor: new _ort.Tensor('float32', data, [1, 3, padH, padW]), w, h, padW, padH };
}

// CHW float [0,1] → cropped RGBA PNG bytes.
async function tensorToPng(data, padW, padH, w, h) {
  const plane = padW * padH;
  const cvs = new OffscreenCanvas(padW, padH);
  const cx = cvs.getContext('2d');
  const out = cx.createImageData(padW, padH);
  for (let i = 0; i < plane; i++) {
    out.data[i * 4] = clamp255(data[i]); out.data[i * 4 + 1] = clamp255(data[plane + i]);
    out.data[i * 4 + 2] = clamp255(data[2 * plane + i]); out.data[i * 4 + 3] = 255;
  }
  cx.putImageData(out, 0, 0);
  // crop back to the original (unpadded) size
  const crop = new OffscreenCanvas(w, h);
  crop.getContext('2d').drawImage(cvs, 0, 0, w, h, 0, 0, w, h);
  const blob = await crop.convertToBlob({ type: 'image/png' });
  return new Uint8Array(await blob.arrayBuffer());
}

// ---- ffmpeg FS helpers ------------------------------------------------------
async function listFrames(ff, prefix) {
  const entries = await ff.listDir('/');
  return entries.map((e) => e.name).filter((n) => n.startsWith(prefix) && n.endsWith('.png')).sort();
}
async function cleanup(ff, srcFrames, outCount, hasAudio) {
  const del = async (n) => { try { await ff.deleteFile(n); } catch (_) {} };
  await del('src'); await del('rife.mp4'); if (hasAudio) await del('audio.m4a');
  for (const f of srcFrames) await del(f);
  for (let i = 1; i <= outCount; i++) await del(`out_${pad(i)}.png`);
}

// ---- misc -------------------------------------------------------------------
const align = (n) => Math.ceil(n / CONFIG.align) * CONFIG.align;
const clamp255 = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
const pad = (n) => String(n).padStart(5, '0');
const baseName = (n) => (n || 'clip').replace(/\.[^.]+$/, '');
