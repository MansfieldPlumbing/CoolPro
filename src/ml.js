// src/ml.js — on-device AI layer.
// A thin PROVIDER abstraction so the browser can use web ML now (Transformers.js /
// onnxruntime-web, lazy-loaded + cached like art4quinn/assets/ml/segment.js) and a
// future dp-onnx WASM/WebNN build can register as a provider without touching call
// sites. v1 ships ONE real, model-free feature (silence auto-trim); the model-backed
// capabilities are declared with status so the UI is honest about what's live.
import * as S from './store.js';
import { decode } from './audio.js';
import { progress, toast } from './hud.js';

// ---- provider registry (dp-onnx plugs in here) --------------------------
const providers = new Map();   // name -> { caps:Set, run(capId, args, onStatus) }
export function registerProvider(name, impl) { providers.set(name, impl); }
export function providerFor(capId) {
  for (const [name, p] of providers) if (p.caps?.has(capId)) return { name, p };
  return null;
}
// The dp-onnx hook: when the user ships a browser build, call
//   import('...dp-onnx.js').then(rt => registerProvider('dp-onnx', adapter(rt)))
// and flip the matching capabilities' status to 'ready'.

// ---- capability catalog (mirrors the bundle's AI buttons) ---------------
// status: 'ready' (works now) | 'model' (works, downloads a model on first use) |
//         'native' (waiting on dp-onnx) | 'soon' (not implemented yet)
export const CAPS = [
  { id: 'autotrim', group: 'audio', label: 'Smart Auto-Trim', desc: 'Trim silent gaps at the clip edges (Web Audio, no download).', status: 'ready' },
  { id: 'captions', group: 'audio', label: 'Auto-Subtitling',  desc: 'Auto-synced subtitles via Whisper (Transformers.js).', status: 'model' },
  { id: 'denoise',  group: 'audio', label: 'Denoise Audio',    desc: 'Reduce background noise.', status: 'soon' },
  { id: 'stems',    group: 'audio', label: 'Isolate Voice',    desc: 'Separate vocals/music (Demucs). Heavy model — planned v2.', status: 'soon' },
  { id: 'tts',      group: 'audio', label: 'Voiceover (TTS)',  desc: 'Kokoro speech — wires to your dp-onnx runtime.', status: 'native' },
  { id: 'matte',    group: 'video', label: 'Background Removal',desc: 'Subject cut-out via RMBG-1.4 (from art4quinn).', status: 'model' },
  { id: 'crop',     group: 'video', label: 'Smart Crop',       desc: 'Keep the subject centered.', status: 'soon' },
  { id: 'superres', group: 'video', label: 'Super Resolution',  desc: 'Upscale toward 4K on export.', status: 'soon' },
  { id: 'rife',     group: 'video', label: 'RIFE 60fps',        desc: 'AI frame interpolation. Planned.', status: 'soon' },
];

export async function run(capId) {
  const cap = CAPS.find((c) => c.id === capId);
  if (!cap) return;
  if (capId === 'autotrim') return autotrim();
  const ext = providerFor(capId);
  if (ext) { const pr = progress(`${cap.label}…`); try { await ext.p.run(capId, {}, pr.status); pr.done(); } catch (e) { pr.fail(e.message); } return; }
  if (cap.status === 'native') toast('Waiting on the dp-onnx browser runtime — not wired yet.', { ms: 3000 });
  else if (cap.status === 'model') toast(`${cap.label}: model wiring lands in the AI phase.`, { ms: 3000 });
  else toast(`${cap.label} is planned — coming soon.`, { ms: 2600 });
}

// ---- real, model-free: trim leading/trailing silence on the selected clip ----
async function autotrim() {
  const sel = S.state.selection && S.findClip(S.state.selection);
  if (!sel) return toast('Select a clip first.', { ms: 2200 });
  const m = S.media.get(sel.clip.mediaId);
  if (!m || m.kind === 'image' || !m.file) return toast('Auto-Trim needs an audio/video clip.', { ms: 2600 });
  const pr = progress('Analyzing audio…');
  try {
    const buf = await decode(await m.file.arrayBuffer());
    const { startSec, endSec } = silenceBounds(buf);
    if (endSec - startSec < 0.1) { pr.fail('All silent?'); return; }
    // map the detected content window onto the clip (respecting its current in/out)
    const newIn = Math.max(sel.clip.in, startSec);
    const newOut = Math.min(sel.clip.in + sel.clip.dur, endSec);
    const newDur = Math.max(0.1, newOut - newIn);
    const shift = newIn - sel.clip.in;
    S.resizeClip(sel.clip.id, { t0: sel.clip.t0 + shift, inPoint: newIn, dur: newDur });
    pr.done(`Trimmed ${(shift + (sel.clip.dur - newDur - shift)).toFixed(2)}s of silence`);
  } catch (e) { console.error(e); pr.fail(e.message); }
}

// First/last sample above an RMS threshold (in seconds).
function silenceBounds(audioBuffer, thresh = 0.015) {
  const ch = audioBuffer.getChannelData(0), sr = audioBuffer.sampleRate;
  const win = Math.floor(sr * 0.02) || 1;     // 20ms windows
  let first = -1, lastIdx = 0;
  for (let i = 0; i < ch.length; i += win) {
    let sum = 0; for (let j = 0; j < win && i + j < ch.length; j++) { const v = ch[i + j]; sum += v * v; }
    const rms = Math.sqrt(sum / win);
    if (rms > thresh) { if (first < 0) first = i; lastIdx = i + win; }
  }
  if (first < 0) return { startSec: 0, endSec: audioBuffer.duration };
  return { startSec: first / sr, endSec: Math.min(audioBuffer.duration, lastIdx / sr) };
}
