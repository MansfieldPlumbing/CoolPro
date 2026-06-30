// src/launcher.js — the Launcher as a composable drill-down (settings.obp shape). The home tree
// is first-class templates across every surface: Create (sized video projects · canvas · 3D),
// Edit (open a surface), Quick tools (the ffmpeg/dpx workflows), and Settings (live theme). One
// nav engine, one tree; add a workflow by adding a node.
import { mountNav } from './nav.js';
import * as Theme from './theme-engine.js';

export function initLauncher(host, crumbsHost, api) {
  mountNav(host, crumbsHost, buildHome(api));
}

function buildHome(api) {
  const vp = (label, w, h, icon) => ({ type: 'action', icon: icon || '🎬', label, caption: `${w}×${h}`, run: () => newVideoProject(label, w, h, api) });

  const createView = { title: 'Create', children: [
    { type: 'group', title: 'New video project', children: [
      vp('Reel / Short', 1080, 1920, '📱'),
      vp('Square', 1080, 1080, '⬛'),
      vp('Widescreen', 1920, 1080, '🖥️'),
      vp('Cinematic', 1920, 816, '🎞️'),
    ] },
    { type: 'group', title: 'Other surfaces', children: [
      { type: 'action', icon: '🖌️', label: 'New canvas', caption: 'Paint studio — layers, brushes, AI select', open: () => api.switchTo('paint') },
      { type: 'action', icon: '🧊', label: 'New 3D scene', caption: 'Image → paintable standee', open: () => api.switchTo('model') },
    ] },
  ] };

  const toolsView = { title: 'Quick tools', children: [
    { type: 'group', children: [
      { type: 'action', icon: '⇄', label: 'Convert a file', caption: 'Extract audio · trim · outpaint · convert · remove background', run: () => run('pickAndConvert') },
      { type: 'action', icon: '🧵', label: 'Stitch videos', caption: 'Join several clips end to end', run: () => run('pickAndStitch') },
    ] },
    { type: 'group', title: 'On a media clip in the editor', children: [
      { type: 'action', icon: '🎬', label: 'Open the editor', caption: 'Then drop media — Split, FX, AI tools, Export', open: () => api.switchTo('editor') },
    ] },
  ] };

  const settingsView = { title: 'Settings', children: [
    { type: 'group', title: 'Appearance', children: [
      { type: 'segment', label: 'Theme', caption: 'Reskins every open surface instantly', value: Theme.getMode(),
        options: [{ k: 'dark', v: 'Dark' }, { k: 'light', v: 'Light' }, { k: 'auto', v: 'Auto' }], onChange: (m) => Theme.setMode(m) },
      { type: 'color', label: 'Accent', caption: 'The chrome highlight color', value: cssVar('--accent'), onChange: (h) => Theme.setAccent(h) },
      { type: 'toggle', label: 'Glass (mica)', caption: 'Frosted blur on bars and panels', value: Theme.getMica(), onChange: (v) => Theme.setMica(v) },
      { type: 'slider', label: 'Opacity', caption: 'Surface translucency while glass is on', min: 0.4, max: 1, step: 0.05, value: Theme.getOpacity(), mult: 100, unit: '%', onChange: (v) => Theme.setOpacity(v) },
    ] },
    { type: 'group', title: 'Storage', children: [{ type: 'custom', mount: mountStorage }] },
    { type: 'header', title: 'CoolPro', subtitle: 'FOSS on-device studio — video · audio · image · 3D',
      note: 'Merged from nocap · art4quinn · arlinearcade, on the subsystem doctrine. MIT.' },
  ] };

  return { title: 'Home', children: [
    { type: 'group', title: 'Create', children: [
      { type: 'action', icon: '✦', label: 'New project / template', caption: 'Reels, square, widescreen, canvas, 3D', to: createView },
    ] },
    { type: 'group', title: 'Edit', children: [
      { type: 'action', icon: '🎬', label: 'Video editor', caption: 'CapCut-style multitrack A/V', open: () => api.switchTo('editor') },
      { type: 'action', icon: '🖌️', label: 'Paint studio', caption: 'Paint-Shop-Pro raster + AI', open: () => api.switchTo('paint') },
      { type: 'action', icon: '🧊', label: '3D maker', caption: 'Image → silhouette → paint', open: () => api.switchTo('model') },
    ] },
    { type: 'group', title: 'Do', children: [
      { type: 'action', icon: '🛠️', label: 'Quick tools', caption: 'Convert · Stitch · Extract · Outpaint · Remove BG', to: toolsView },
      { type: 'action', icon: '⚙️', label: 'Settings', caption: 'Appearance · storage · about', to: settingsView },
    ] },
  ] };
}

const run = (fn) => import('./convert.js').then((m) => m[fn] && m[fn]());

async function newVideoProject(label, w, h, api) {
  const S = await import('./store.js');
  S.setProject({ name: `${label}`, width: w, height: h });
  const c = document.getElementById('preview'); if (c) { c.width = w; c.height = h; }
  api.switchTo('editor');
  try { const P = await import('./preview.js'); P.drawAt && P.drawAt(S.state.transport.time); } catch (_) {}
  try { const { toast } = await import('./hud.js'); toast(`New project — ${label} ${w}×${h}`); } catch (_) {}
}

async function mountStorage(el) {
  el.innerHTML = `<div class="nv-cap" style="padding:4px 0">Reading storage…</div>`;
  let usage = 'Storage estimate unavailable';
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const e = await navigator.storage.estimate();
      usage = `${(e.usage / 1e6).toFixed(0)} MB used${e.quota ? ` · ${(e.quota / 1e9).toFixed(1)} GB available` : ''}`;
    }
  } catch (_) {}
  el.innerHTML = `<div class="nv-ctrl"><div class="nv-ctrl-h"><span>On-device storage</span></div>
    <div class="nv-cap">${usage}</div>
    <button class="btn ghost" data-clear style="margin-top:10px;align-self:flex-start">🧹 Clear downloaded models & packages</button></div>`;
  el.querySelector('[data-clear]').addEventListener('click', async () => {
    try { await caches.delete('nocap-cdn'); } catch (_) {}
    try { const { toast } = await import('./hud.js'); toast('Cleared the model & package cache'); } catch (_) {}
    mountStorage(el);
  });
}

function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#5b8cff'; }
