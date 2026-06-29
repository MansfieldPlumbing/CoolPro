// src/convert.js — "Convert": a HandBrake-style standalone transcoder.
// Drop in any file and convert it on-device via ffmpeg.wasm, independent of the
// timeline:
//   • make videos "lean and mean" — compress + downscale, web-optimized (+faststart)
//   • pull WAV / MP3 audio straight out of an MP4
// Truth in advertising: NoCap reports the real size delta, then lets you download
// or Share the result (Web Share API, falling back to download).
import { $, fmtBytes } from './util.js';
import { transcode } from './ffmpeg.js';
import { progress, toast } from './hud.js';

// Quality presets. CRF is per-codec (higher = smaller); maxH caps height without
// ever upscaling; audio bitrates per container.
const QUALITY = {
  lean:     { label: 'Lean & Mean', sub: 'smallest file · ≤720p · web-optimized', x264: 30, vp9: 37, maxH: 720,  preset: 'slow',   aac: '128k', mp3: '192k' },
  balanced: { label: 'Balanced',    sub: 'good size & quality · ≤1080p',          x264: 24, vp9: 32, maxH: 1080, preset: 'medium', aac: '160k', mp3: '256k' },
  high:     { label: 'High',        sub: 'best quality · keeps resolution',       x264: 20, vp9: 28, maxH: 0,    preset: 'medium', aac: '192k', mp3: '320k' },
};

// Only downscale (the min() guard prevents upscaling small sources).
const vf = (q) => (q.maxH ? ['-vf', `scale=-2:'min(ih,${q.maxH})'`] : []);

function plan(target, q) {
  switch (target) {
    case 'mp4':  return { ext: 'mp4',  mime: 'video/mp4',  args: ['-i', 'input', ...vf(q),
      '-c:v', 'libx264', '-preset', q.preset, '-crf', String(q.x264), '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', q.aac, '-movflags', '+faststart', 'output.mp4'] };
    case 'webm': return { ext: 'webm', mime: 'video/webm', args: ['-i', 'input', ...vf(q),
      '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', String(q.vp9), '-row-mt', '1',
      '-c:a', 'libopus', '-b:a', q.aac, 'output.webm'] };
    case 'wav':  return { ext: 'wav',  mime: 'audio/wav',   args: ['-i', 'input', '-vn', '-c:a', 'pcm_s16le', 'output.wav'] };
    case 'mp3':  return { ext: 'mp3',  mime: 'audio/mpeg',  args: ['-i', 'input', '-vn', '-c:a', 'libmp3lame', '-b:a', q.mp3, 'output.mp3'] };
    default: throw new Error(`Unknown target: ${target}`);
  }
}

export async function convert(file, target, qualityKey) {
  const q = QUALITY[qualityKey] || QUALITY.balanced;
  const p = plan(target, q);
  const pr = progress(`Converting → ${p.ext.toUpperCase()}…`);
  try {
    const blob = await transcode(file, { args: p.args, outName: `output.${p.ext}`, mime: p.mime, onStatus: pr.status });
    const name = `${baseName(file.name)}.${p.ext}`;
    const delta = file.size ? Math.round((1 - blob.size / file.size) * 100) : null;
    pr.done(delta > 0 ? `Done — ${fmtBytes(blob.size)} (${delta}% smaller)` : `Done — ${fmtBytes(blob.size)}`);
    return { blob, name, delta };
  } catch (e) { console.error(e); pr.fail(e.message); return null; }
}

// ---- Web Share API (level 2, files) with a download fallback ---------------
function canShareFiles(file) {
  return !!(navigator.canShare && navigator.canShare({ files: [file] }));
}
async function shareOrDownload(blob, name) {
  const file = new File([blob], name, { type: blob.type });
  if (canShareFiles(file)) {
    try { await navigator.share({ files: [file], title: name }); return; }
    catch (e) { if (e?.name === 'AbortError') return; /* else fall through */ }
  }
  download(blob, name);
  toast('Sharing not available here — downloaded instead', { ms: 2600 });
}

// ---- modal ----------------------------------------------------------------
let back = null;
export function initConvert() { $('#btnConvert')?.addEventListener('click', openConvert); }

export function openConvert() {
  if (back) return;
  let chosen = null;          // the selected File
  let result = null;          // { blob, name, delta }
  back = document.createElement('div');
  back.style.cssText = 'position:fixed;inset:0;z-index:200;background:rgba(0,0,0,.55);display:grid;place-items:center';
  back.innerHTML = `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);
      box-shadow:var(--shadow);width:min(480px,94vw);max-height:88vh;display:flex;flex-direction:column">
      <div style="display:flex;align-items:center;gap:10px;padding:16px 18px;border-bottom:1px solid var(--border)">
        <h3 style="margin:0;flex:1">Convert — lean &amp; mean</h3>
        <button class="btn ghost" id="cvClose">✕</button>
      </div>
      <div style="padding:14px 18px;overflow:auto">
        <p style="margin:0 0 12px;color:var(--muted);font-size:12px">
          On-device transcode via ffmpeg.wasm — no upload. Shrink a video, optimize it for
          web playback, or pull the audio out as WAV / MP3.</p>

        <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px">
          <button class="btn" id="cvPick">📂 Choose file…</button>
          <span id="cvFile" style="color:var(--muted);font-size:12px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">No file chosen</span>
          <input id="cvInput" type="file" accept="video/*,audio/*" hidden>
        </div>

        <div class="field"><label>Output</label>
          <select id="cvTarget">
            <option value="mp4">MP4 — H.264/AAC (web-optimized)</option>
            <option value="webm">WebM — VP9/Opus</option>
            <option value="wav">WAV — extract audio (PCM)</option>
            <option value="mp3">MP3 — extract audio</option>
          </select></div>

        <div class="field" id="cvQualityWrap"><label>Quality</label>
          <select id="cvQuality">
            <option value="lean">Lean &amp; Mean — smallest file · ≤720p</option>
            <option value="balanced" selected>Balanced — good size &amp; quality · ≤1080p</option>
            <option value="high">High — best quality · keeps resolution</option>
          </select></div>

        <div style="display:flex;justify-content:flex-end;margin-top:6px">
          <button class="btn primary" id="cvGo" disabled>Convert</button>
        </div>

        <div id="cvResult" hidden style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border)">
          <div id="cvResultText" style="font-size:13px;margin-bottom:10px"></div>
          <div style="display:flex;gap:8px;justify-content:flex-end">
            <button class="btn" id="cvDownload">⤓ Download</button>
            <button class="btn primary" id="cvShare">↗ Share</button>
          </div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(back);

  const close = () => { back?.remove(); back = null; };
  $('#cvClose', back).addEventListener('click', close);
  back.addEventListener('click', (e) => { if (e.target === back) close(); });

  const input = $('#cvInput', back), go = $('#cvGo', back), target = $('#cvTarget', back);
  const qualityWrap = $('#cvQualityWrap', back), resultBox = $('#cvResult', back);

  $('#cvPick', back).addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    chosen = input.files[0] || null;
    $('#cvFile', back).textContent = chosen ? `${chosen.name} · ${fmtBytes(chosen.size)}` : 'No file chosen';
    go.disabled = !chosen;
  });
  // audio-only targets don't use the video quality presets (bitrate aside)
  const syncQuality = () => { qualityWrap.style.opacity = (target.value === 'wav') ? '.5' : '1'; };
  target.addEventListener('change', syncQuality); syncQuality();

  go.addEventListener('click', async () => {
    if (!chosen) return;
    go.disabled = true; resultBox.hidden = true;
    result = await convert(chosen, target.value, $('#cvQuality', back).value);
    go.disabled = false;
    if (result) {
      $('#cvResultText', back).innerHTML = `<b>${esc(result.name)}</b> · ${fmtBytes(result.blob.size)}` +
        (result.delta > 0 ? ` <span style="color:var(--success)">(${result.delta}% smaller)</span>` : '');
      resultBox.hidden = false;
    }
  });
  $('#cvDownload', back).addEventListener('click', () => result && download(result.blob, result.name));
  $('#cvShare', back).addEventListener('click', () => result && shareOrDownload(result.blob, result.name));
}

// ---- helpers --------------------------------------------------------------
function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const baseName = (n) => (n || 'output').replace(/\.[^.]+$/, '');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
