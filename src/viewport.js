// src/viewport.js — the ONE form-factor signal. Two awarenesses, your words: `phone`
// (single-column) and `desktop` (landscape, multi-column). Everything keys off
// :root[data-vp]; nothing else decides the form factor. (subsystem doctrine: one source of
// truth, the layout is a projection of it.)
//
// We bank off the browser's "Desktop site" checkbox for free: enabling it widens the layout
// viewport (~980px), which pushes our width past the break → `desktop`. Disabling it returns
// the narrow viewport → `phone`. Plus an in-app toggle that forces either, persisted — so the
// user is never stuck on the wrong one.
const KEY = 'coolpro-view';                 // 'auto' | 'desktop' | 'phone'
const BREAK = 820;                          // px: at/above = room for landscape (covers desktop-site ~980)
const subs = new Set();
let pref = 'auto';
try { pref = localStorage.getItem(KEY) || 'auto'; } catch (_) {}

// Effective mode: an explicit override wins; otherwise it's the viewport width (which the
// "Desktop site" toggle moves).
export function mode() {
  if (pref === 'desktop' || pref === 'phone') return pref;
  const w = window.innerWidth || document.documentElement.clientWidth || 1024;
  return w >= BREAK ? 'desktop' : 'phone';
}
export function preference() { return pref; }
export function isForced() { return pref !== 'auto'; }
export function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }

let _last = null;
function apply() {
  const m = mode();
  if (m === _last) return;
  _last = m;
  document.documentElement.dataset.vp = m;
  for (const fn of subs) { try { fn(m); } catch (_) {} }
}

export function setPreference(p) {
  pref = (p === 'desktop' || p === 'phone') ? p : 'auto';
  try { localStorage.setItem(KEY, pref); } catch (_) {}
  _last = null; apply();
}
// Flip to the opposite of what's showing now (and make it sticky) — the in-app "Desktop view".
export function toggle() { setPreference(mode() === 'desktop' ? 'phone' : 'desktop'); }

export function initViewport() {
  apply();
  let raf = 0;
  window.addEventListener('resize', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(apply); });
  window.addEventListener('orientationchange', () => setTimeout(apply, 80));
}
