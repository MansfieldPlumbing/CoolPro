// src/addons.js — "Add-ons" modal: manage the CDN package cache + PWA install/update.
// The bundle teased "AI CDN Add-ons / CDN Marketplace / Install more AI models";
// this is the real, working version: add/remove CDN packages, warm them for
// offline use, see cache usage, install the PWA, and check for updates.
import { $, $$, fmtBytes } from './util.js';
import * as CDN from './cdn.js';
import * as PWA from './pwa.js';
import { progress, toast } from './hud.js';

let back = null;
let unsub = null;

export function initAddons() {
  $('#btnAddons')?.addEventListener('click', openAddons);
}

export function openAddons() {
  if (back) return;
  back = document.createElement('div');
  back.style.cssText = 'position:fixed;inset:0;z-index:200;background:rgba(0,0,0,.55);display:grid;place-items:center';
  back.innerHTML = `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);
      box-shadow:var(--shadow);width:min(560px,94vw);max-height:88vh;display:flex;flex-direction:column">
      <div style="display:flex;align-items:center;gap:10px;padding:16px 18px;border-bottom:1px solid var(--border)">
        <h3 style="margin:0;flex:1">Add-ons &amp; CDN cache</h3>
        <button class="btn ghost" id="aoClose">✕</button>
      </div>
      <div style="padding:14px 18px;overflow:auto" id="aoBody"></div>
    </div>`;
  document.body.appendChild(back);
  $('#aoClose', back).addEventListener('click', close);
  back.addEventListener('click', (e) => { if (e.target === back) close(); });
  unsub = CDN.subscribe(render);
  render();
}

function close() { unsub?.(); unsub = null; back?.remove(); back = null; }

async function render() {
  if (!back) return;
  const body = $('#aoBody', back);
  const pkgs = CDN.list();
  const est = await CDN.estimate();
  const usage = est ? `${fmtBytes(est.usage)} used of ${fmtBytes(est.quota)}` : `${fmtBytes(CDN.totalBytes())} cached`;

  body.innerHTML = `
    <!-- app / PWA -->
    <div class="fx-row" style="align-items:flex-start">
      <div class="t"><b>This app</b><span>Install nocap & check for updates. Updating keeps your cached add-ons. ${usage}.</span></div>
      <div style="display:flex;gap:6px;flex-shrink:0">
        <button class="btn ${PWA.canInstall() ? 'primary' : ''}" id="aoInstall" ${PWA.canInstall() ? '' : 'disabled'}>Install</button>
        <button class="btn ghost" id="aoUpdate">Check updates</button>
      </div>
    </div>

    <div class="side" style="background:transparent"><h3 style="padding-left:0">CDN packages</h3></div>
    <div id="aoList"></div>

    <div class="side" style="background:transparent"><h3 style="padding-left:0">Add a package</h3></div>
    <div class="field"><label>Name</label><input id="aoName" type="text" placeholder="My add-on"></div>
    <div class="field"><label>URL(s) — ESM module, wasm or model weights (comma/space separated)</label>
      <input id="aoUrl" type="text" placeholder="https://cdn.jsdelivr.net/npm/…"></div>
    <div class="field"><label>Type</label>
      <select id="aoType"><option value="esm">ESM module</option><option value="wasm">WASM / asset</option><option value="model">Model weights</option></select></div>
    <div style="display:flex;justify-content:flex-end;margin-top:8px"><button class="btn primary" id="aoAdd">＋ Add package</button></div>`;

  // package rows
  $('#aoList', back).innerHTML = pkgs.map((p) => `
    <div class="fx-row" style="align-items:flex-start">
      <div class="t"><b>${esc(p.name)} <span class="chip" style="margin-left:4px">${p.type}</span></b>
        <span>${esc(p.desc)}</span>
        <span style="display:block;margin-top:3px;color:${p.cached ? 'var(--success)' : 'var(--muted)'}">
          ${p.cached ? `● cached · ${fmtBytes(p.bytes)}` : '○ not cached'}</span></div>
      <div style="display:flex;gap:6px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end">
        ${p.cached
          ? `<button class="btn ghost" data-uncache="${p.id}">Remove from cache</button>`
          : `<button class="btn" data-warm="${p.id}">Cache</button>`}
        ${p.builtin ? '' : `<button class="btn ghost" data-del="${p.id}" title="Delete add-on">🗑</button>`}
      </div>
    </div>`).join('');

  // wire
  $('#aoInstall', back).addEventListener('click', PWA.promptInstall);
  $('#aoUpdate', back).addEventListener('click', PWA.checkForUpdates);
  $('#aoAdd', back).addEventListener('click', async () => {
    try {
      await CDN.add({ name: $('#aoName', back).value.trim(), url: $('#aoUrl', back).value.trim(), type: $('#aoType', back).value });
      toast('Add-on added'); $('#aoName', back).value = $('#aoUrl', back).value = '';
    } catch (e) { toast(e.message, { err: true, ms: 3200 }); }
  });
  $$('[data-warm]', back).forEach((b) => b.addEventListener('click', async () => {
    const pr = progress('Caching…');
    try { const n = await CDN.warm(b.dataset.warm, pr.status); pr.done(`Cached ${fmtBytes(n)}`); }
    catch (e) { pr.fail(e.message); }
  }));
  $$('[data-uncache]', back).forEach((b) => b.addEventListener('click', () => CDN.uncache(b.dataset.uncache)));
  $$('[data-del]', back).forEach((b) => b.addEventListener('click', () => CDN.remove(b.dataset.del)));
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
