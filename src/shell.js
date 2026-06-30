// src/shell.js — the Shell: it reads the registry's layout, mounts presenters into the stage,
// and presents the active presenter's contributed verbs. It holds no document truth — it is the
// chrome that projects the namespace (subsystem's Shell.js role, ported to the studio).
//
// The editor is the resting `desktop` presenter (native, kept alive). Paint & 3D are guests,
// mounted on first visit and kept warm so their canvas state survives a tab switch. A guest's
// menu (if it contributes one over the presenter bridge) lands in #shellMenu; both guests ship
// full in-frame UIs today, so the Shell bar is primarily the app switcher.
import * as Registry from './registry.js';
import { presenterFor } from './presenter.js';
import { toggle as vpToggle, mode as vpMode, isForced, subscribe as onViewport } from './viewport.js';

let active = null;
let guestHost = null;
const mounted = new Map();   // id -> presenter (warm)

export function initShell() {
  guestHost = document.getElementById('stage-guests');
  buildRail();
  buildLauncher();
  wireChrome();
  onViewport(syncVpToggle);
  syncVpToggle();
  const home = Registry.landing() || Registry.layout()[0];
  if (home) switchTo(home.id);
}

function buildRail() {
  const rail = document.getElementById('appRail');
  if (!rail) return;
  rail.innerHTML = Registry.layout().map((r) =>
    `<button class="app-tab" data-app="${r.id}" title="${escAttr(r.blurb)}">
       <span class="ic">${r.icon}</span><span class="nm">${escHtml(r.name)}</span></button>`).join('');
  rail.querySelectorAll('.app-tab').forEach((b) => b.addEventListener('click', () => switchTo(b.dataset.app)));
}

// The Launcher front door — big tiles for each surface, projected from the registry. One column
// on phone, a grid on desktop (the layout follows :root[data-vp], not this code).
function buildLauncher() {
  const host = document.getElementById('launchGrid');
  if (!host) return;
  const tiles = Registry.tiles().map((r) =>
    `<button class="launch-tile" data-app="${r.id}">
       <span class="ic">${r.icon}</span>
       <span class="meta"><span class="nm">${escHtml(r.name)}</span><span class="bl">${escHtml(r.blurb)}</span></span>
     </button>`).join('');
  // Quick actions (not surfaces): file in → options/result → share out.
  const convertTile =
    `<button class="launch-tile" data-action="convert">
       <span class="ic">⇄</span>
       <span class="meta"><span class="nm">Convert</span><span class="bl">A video/audio/image → extract audio, trim, outpaint, convert, remove background → share it out.</span></span>
     </button>`;
  const stitchTile =
    `<button class="launch-tile" data-action="stitch">
       <span class="ic">🧵</span>
       <span class="meta"><span class="nm">Stitch</span><span class="bl">Pick several videos → join them end to end → share the result.</span></span>
     </button>`;
  host.innerHTML = tiles + convertTile + stitchTile;
  host.querySelectorAll('.launch-tile').forEach((b) => b.addEventListener('click', () => {
    const a = b.dataset.action;
    if (a === 'convert') import('./convert.js').then((m) => m.pickAndConvert());
    else if (a === 'stitch') import('./convert.js').then((m) => m.pickAndStitch());
    else switchTo(b.dataset.app);
  }));
}

function wireChrome() {
  const brand = document.getElementById('brandHome');
  if (brand) brand.addEventListener('click', () => switchTo('home'));
  const vp = document.getElementById('vpToggle');
  if (vp) vp.addEventListener('click', vpToggle);
}

// Reflect the form-factor in the toggle: it offers the OTHER mode (mirrors "Desktop site").
function syncVpToggle() {
  const vp = document.getElementById('vpToggle');
  if (!vp) return;
  const m = vpMode();
  vp.textContent = m === 'desktop' ? '📱' : '🖥';
  vp.title = (m === 'desktop' ? 'Switch to phone view' : 'Switch to desktop view') + (isForced() ? ' (forced)' : '');
}

export async function switchTo(id) {
  const rec = Registry.resolve(id);
  if (!rec || (active && active.id === id)) return;
  if (active) active.hide();

  let p = mounted.get(id);
  if (!p) {
    const host = rec.kind === 'guest' ? guestHost : document.getElementById('surface-' + id);
    p = presenterFor(rec);
    await p.mount(host, { shell: api, registry: Registry });
    mounted.set(id, p);
  } else {
    p.show();
  }
  active = p;

  // Surface split: the native editor lives in #surface-editor; every guest shares #stage-guests
  // (only the active guest's own frame is shown). The Shell owns which container is visible.
  guestHost.hidden = rec.kind !== 'guest';

  document.querySelectorAll('.app-tab').forEach((t) => t.classList.toggle('active', t.dataset.app === id));
  document.body.dataset.app = id;
  renderMenu(p);
}

// Present a presenter's contributed verbs (grouped by menu), or clear when it has none.
function renderMenu(p) {
  const slot = document.getElementById('shellMenu');
  if (!slot) return;
  const verbs = (p && p.verbs) || [];
  if (!verbs.length) { slot.innerHTML = ''; return; }
  const groups = {};
  for (const v of verbs) (groups[v.menu || 'app'] ||= []).push(v);
  slot.innerHTML = Object.entries(groups).map(([menu, items]) =>
    `<div class="shell-menu-group" data-menu="${escAttr(menu)}">
       <span class="mg-label">${escHtml(menu)}</span>
       ${items.map((v) => `<button class="mg-verb" data-verb="${escAttr(v.verb)}"
            ${v.enabled === false ? 'disabled' : ''}>${escHtml(v.label || v.verb)}${v.checked ? ' ✓' : ''}</button>`).join('')}
     </div>`).join('');
  slot.querySelectorAll('.mg-verb').forEach((b) =>
    b.addEventListener('click', () => active && active.invoke(b.dataset.verb)));
}

// The handle the Shell hands each presenter (UiObject ctx.shell).
const api = {
  switchTo,
  onVerbs(p) { if (p === active) renderMenu(p); },   // a guest re-announced its menu
};

const escHtml = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const escAttr = (s) => String(s).replace(/"/g, '&quot;');
