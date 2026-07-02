// src/shell.js — the Shell: it reads the registry's layout, mounts presenters into the stage,
// and tracks which surface is active + which are warm. It holds no document truth — it is the
// chrome that projects the namespace (subsystem's Shell.js role, ported to the studio).
//
// The editor is the resting `desktop` presenter (native, kept alive). Paint, 3D & Animate are
// guests, mounted on first visit and kept warm so their canvas state survives a switch. The top
// MENU BAR (src/menubar.js) is the studio's single chrome: it subscribes to the state below for
// the surface switcher, and reads activeVerbs() for any menu a guest contributes over the bridge.
import * as Registry from './registry.js';
import { presenterFor } from './presenter.js';

let active = null;
let guestHost = null;
const mounted = new Map();   // id -> presenter (warm)
const subs = new Set();      // menubar et al. — notified when active/warm/verbs state changes

// --- multitasking surface (the menu bar reads these) ------------------------------------------
// Every offered surface, with its live state: `warm` = a presenter is mounted and kept alive
// (its document survives a switch), `active` = it's the one on stage right now.
export function openSurfaces() {
  return Registry.tiles().map((r) => ({
    id: r.id, name: r.name, icon: r.icon, kind: r.kind, type: r.type,
    warm: mounted.has(r.id), active: !!active && active.id === r.id,
  }));
}
export function activeId() { return active ? active.id : null; }
export function activeType() { return active ? active.type : null; }
// The verbs the active presenter contributes (a guest that speaks the menu-context bridge). The
// menu bar folds these into its dropdowns; empty for surfaces that ship their own in-frame chrome.
export function activeVerbs() { return (active && active.verbs) || []; }
export function invokeActiveVerb(verb) { if (active) active.invoke(verb); }
export function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }
function notify() { for (const f of subs) { try { f(); } catch (_) {} } }

// Close a warm guest to free its memory (iframe + listeners). The native editor is the resting
// surface — never closed. If the closing guest is on stage, leave for the editor first.
export async function closeSurface(id) {
  const rec = Registry.resolve(id);
  const p = mounted.get(id);
  if (!p || !rec || rec.kind !== 'guest') return;
  if (active === p) await switchTo('editor');   // switchTo will notify; reveals editor, hides guests
  p.unmount();
  mounted.delete(id);
  notify();
}

export function initShell() {
  guestHost = document.getElementById('stage-guests');
  buildLauncher();
  const home = Registry.landing() || Registry.layout()[0];
  if (home) switchTo(home.id);
}

// The Launcher front door — a composable drill-down (settings.obp shape): first-class templates
// across every surface, projected by the nav engine from launcher.js's tree.
function buildLauncher() {
  const host = document.getElementById('navHost'), crumbs = document.getElementById('navCrumbs');
  if (!host || !crumbs) return;
  import('./launcher.js').then((m) => m.initLauncher(host, crumbs, { switchTo }));
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

  document.body.dataset.app = id;
  notify();
}

// Hand a message to a surface, mounting it first (e.g. open-media with a File — structured
// clone carries blobs fine). GuestPresenter queues it until the guest reports surface-ready.
export async function sendToSurface(id, msg) {
  await switchTo(id);
  const p = mounted.get(id);
  if (p && p.post) p.post(msg);
}

// The handle the Shell hands each presenter (UiObject ctx.shell).
const api = {
  switchTo,
  onVerbs(p) { if (p === active) notify(); },   // a guest re-announced its menu → refresh the menu bar
};
