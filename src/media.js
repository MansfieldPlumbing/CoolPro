// src/media.js — import files into the media bin.
// Builds a media record { id, name, kind, url, file, duration, width, height,
// waveform, thumbUrl } with a generated poster thumbnail and (for audio/video)
// a downsampled waveform for the timeline.
import { uid, mediaKind } from './util.js';
import { addMedia, addClipFromMedia } from './store.js';
import { decode } from './audio.js';
import { toast, progress } from './hud.js';

export async function importFiles(fileList, { autoPlace = true } = {}) {
  const files = [...fileList];
  for (const file of files) {
    try {
      const m = await importFile(file);
      addMedia(m);
      if (autoPlace) addClipFromMedia(m.id);
    } catch (e) {
      console.error(e);
      toast(`Couldn't import ${file.name}: ${e.message}`, { err: true, ms: 3500 });
    }
  }
}

// Import a Blob/File directly — the path used by clipboard paste and fetched URLs
// (the Paint Pro / gallery interchange seam). A bare Blob is wrapped in a File so
// mediaKind() can read its type, and a sensible extension is appended to the name.
export async function importBlob(blob, name = 'pasted', { autoPlace = true } = {}) {
  const type = blob.type || '';
  const ext = type.includes('/') ? '.' + type.split('/')[1].split('+')[0] : '';
  const file = blob instanceof File ? blob
    : new File([blob], /\.\w+$/.test(name) ? name : name + ext, { type });
  const m = await importFile(file);
  addMedia(m);
  if (autoPlace) addClipFromMedia(m.id);
  return m;
}

// Import a remote asset by URL (also handles data: URLs, e.g. a Paint Pro export).
// We fetch to a same-origin blob FIRST so the canvas compositor never taints —
// drawing a cross-origin <img> straight to canvas would break export.
export async function importFromUrl(url, { autoPlace = true } = {}) {
  url = (url || '').trim();
  if (!url) return null;
  const pr = progress('Fetching asset…');
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const name = decodeURIComponent((url.split('/').pop() || 'asset').split('?')[0]) || 'asset';
    const m = await importBlob(blob, name, { autoPlace });
    pr.done(`Added ${m.name}`);
    return m;
  } catch (e) {
    console.error(e);
    pr.fail(`Couldn't load asset: ${e.message}`);
    return null;
  }
}

async function importFile(file) {
  const kind = mediaKind(file);
  const url = URL.createObjectURL(file);
  const base = { id: uid('med'), name: file.name, kind, url, file };
  if (kind === 'image') return { ...base, ...(await probeImage(url)) };
  if (kind === 'audio') return { ...base, ...(await probeAudio(file, url)) };
  return { ...base, ...(await probeVideo(url)) };
}

function probeImage(url) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res({ duration: 5, width: img.naturalWidth, height: img.naturalHeight,
      thumbUrl: url });
    img.onerror = () => rej(new Error('image decode failed'));
    img.src = url;
  });
}

function probeVideo(url) {
  return new Promise((res, rej) => {
    const v = document.createElement('video');
    v.preload = 'metadata'; v.muted = true; v.src = url;
    v.onloadedmetadata = () => {
      const w = v.videoWidth, h = v.videoHeight, duration = v.duration || 0;
      // grab a poster frame a little into the clip
      v.currentTime = Math.min(0.2, duration / 2 || 0);
      v.onseeked = () => {
        const c = document.createElement('canvas');
        const s = Math.min(1, 240 / Math.max(w, 1));
        c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s));
        try { c.getContext('2d').drawImage(v, 0, 0, c.width, c.height); } catch (_) {}
        res({ duration, width: w, height: h, thumbUrl: c.toDataURL('image/jpeg', 0.6) });
      };
      // some browsers won't fire seeked for tiny seeks — fall back
      setTimeout(() => res({ duration, width: w, height: h, thumbUrl: null }), 1200);
    };
    v.onerror = () => rej(new Error('video metadata failed'));
  });
}

async function probeAudio(file, url) {
  const buf = await file.arrayBuffer();
  let audioBuffer;
  try { audioBuffer = await decode(buf); }
  catch (_) {
    // fall back to <audio> metadata if decode fails (e.g. unsupported codec for WebAudio)
    return { duration: await audioDuration(url), waveform: null, thumbUrl: waveThumb(null) };
  }
  const waveform = peaks(audioBuffer, 600);
  return { duration: audioBuffer.duration, waveform, thumbUrl: waveThumb(waveform) };
}

function audioDuration(url) {
  return new Promise((res) => {
    const a = document.createElement('audio'); a.preload = 'metadata'; a.src = url;
    a.onloadedmetadata = () => res(a.duration || 0);
    a.onerror = () => res(0);
  });
}

// Downsample an AudioBuffer to N min/max peak pairs in [0,1].
export function peaks(audioBuffer, n = 600) {
  const ch = audioBuffer.getChannelData(0);
  const block = Math.floor(ch.length / n) || 1;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let max = 0;
    const start = i * block;
    for (let j = 0; j < block; j++) { const v = Math.abs(ch[start + j] || 0); if (v > max) max = v; }
    out[i] = max;
  }
  return out;
}

function waveThumb(wave) {
  const c = document.createElement('canvas'); c.width = 240; c.height = 150;
  const g = c.getContext('2d');
  g.fillStyle = '#1c2a26'; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = '#2fa37f'; g.lineWidth = 1;
  if (wave) {
    const mid = c.height / 2, step = c.width / wave.length;
    g.beginPath();
    for (let i = 0; i < wave.length; i++) {
      const x = i * step, h = wave[i] * mid;
      g.moveTo(x, mid - h); g.lineTo(x, mid + h);
    }
    g.stroke();
  } else {
    g.fillStyle = '#2fa37f'; g.font = '14px sans-serif'; g.textAlign = 'center';
    g.fillText('audio', c.width / 2, mid_or(c.height / 2));
  }
  return c.toDataURL('image/jpeg', 0.7);
}
const mid_or = (v) => v + 5;
