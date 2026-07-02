// src/viewport.js — the device signal. CoolPro is a DESKTOP suite: one landscape, multi-column
// layout, always. There is no "phone" form factor and no mobile column any more.
//
// What survives is TOUCH AWARENESS for 2-in-1 / hybrid devices: we detect a coarse pointer and
// stamp :root[data-touch="on"|"off"] so the chrome can enlarge hit targets (see the pointer:coarse
// rules in app.css) without ever switching to a different layout. Long-press context menus and
// touch-drag keep working on any device; the geometry never changes.
//
// The old form-factor exports (mode/toggle/isForced/preference/setPreference) are kept as thin
// desktop-always shims so existing import sites don't break — the studio no longer has a mode.
const subs = new Set();

function detectTouch() {
  try {
    return (window.matchMedia && matchMedia('(pointer: coarse)').matches)
      || 'ontouchstart' in window
      || (navigator.maxTouchPoints || 0) > 0;
  } catch (_) { return false; }
}

let _touch = detectTouch();
export function hasTouch() { return _touch; }
export function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }

function apply() {
  const t = detectTouch();
  const changed = t !== _touch;
  _touch = t;
  const R = document.documentElement;
  R.dataset.vp = 'desktop';                 // legacy hook: the layout is always the desktop grid
  R.dataset.touch = t ? 'on' : 'off';
  if (changed) for (const fn of subs) { try { fn(t); } catch (_) {} }
}

export function initViewport() {
  apply();
  // A hybrid can gain/lose its touch digitizer (dock/undock); react, but never reflow the layout.
  try { matchMedia('(pointer: coarse)').addEventListener('change', apply); } catch (_) {
    try { matchMedia('(pointer: coarse)').addListener(apply); } catch (_) {}
  }
  window.addEventListener('resize', apply, { passive: true });
}

// ---- desktop-always shims (a form factor no longer exists) --------------------------------
export function mode() { return 'desktop'; }
export function preference() { return 'desktop'; }
export function isForced() { return false; }
export function setPreference() {}
export function toggle() {}
