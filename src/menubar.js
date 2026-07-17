// src/menubar.js — the studio's one piece of top chrome: a traditional desktop menu bar.
//
// Layout:  [ CoolPro ]  File  Edit  View  Help  ·········  [Editor][Paint][3D][Animate]
//
// The left half is a classic pull-down menu bar (File · Edit · View · Help); the right half is the
// surface switcher that replaced the old bottom taskbar — one chip per surface, a live dot on the
// warm ones, click to switch, right-click / long-press for its per-surface menu. Menus are
// CONTEXTUAL: when the Editor is on stage they drive the editor's real actions; for a guest they
// offer the shell verbs plus anything the guest contributes over the presenter bridge.
//
// The dropdowns reuse the homespun context-menu atom (openMenu) — same acrylic flyout the whole
// suite uses — so a menu-bar pull-down and a right-click menu are visibly one vocabulary.
import * as Shell from './shell.js';
import { openMenu, closeMenu, isMenuOpen, attachContextMenu } from './contextmenu.js';

let bar = null, switcher = null;

const MENUS = ['file', 'edit', 'view', 'help'];
const MENU_LABEL = { file: 'File', edit: 'Edit', view: 'View', help: 'Help' };

export function initMenubar() {
  bar = document.getElementById('menubar');
  if (!bar) return;
  bar.innerHTML =
    '<button class="mb-brand" id="mbBrand" title="Home — all surfaces">' +
      '<span class="mb-logo">◆</span>Cool<span class="no">Pro</span></button>' +
    '<nav class="mb-menus" role="menubar">' +
      MENUS.map((m) => `<button class="mb-menu" data-menu="${m}" role="menuitem">${MENU_LABEL[m]}</button>`).join('') +
    '</nav>' +
    '<div class="mb-spacer"></div>' +
    '<div class="mb-switch" id="mbSwitch" role="tablist" aria-label="Surfaces"></div>';

  switcher = bar.querySelector('#mbSwitch');
  bar.querySelector('#mbBrand').addEventListener('click', () => Shell.switchTo('home'));

  bar.querySelectorAll('.mb-menu').forEach((btn) => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); openFor(btn); });
    // real menu-bar feel: once any pull-down is open, hovering a sibling switches to it
    btn.addEventListener('pointerenter', () => { if (isMenuOpen() && btn !== _openTitle) openFor(btn); });
    // right-clicking a title opens its pull-down too (no stray native menu on the bar)
    btn.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); openFor(btn); });
  });

  renderSwitcher();
  wireGlobalContextMenu();
  Shell.subscribe(refresh);   // active / warm / contributed-verbs changed
}

// A native-app feel: right-clicking the host chrome always yields an app menu, never the browser's.
// Element-specific handlers (bin items, clips, the stage, switcher chips) open first and win; this
// only fires when nothing more specific did. Text fields keep the native menu so copy/paste works.
function wireGlobalContextMenu() {
  document.addEventListener('contextmenu', (e) => {
    if (e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    e.preventDefault();
    if (isMenuOpen()) return;                     // a more specific menu already opened
    openMenu(e.clientX, e.clientY, defaultMenu());
  });
}
function defaultMenu() {
  const items = [{ label: 'Home / Launcher', icon: '🏠', run: () => Shell.switchTo('home') }, '-', ...surfaceSwitchItems()];
  if (Shell.activeType() === 'editor') items.push('-',
    { label: 'Save project', icon: '💾', run: () => document.getElementById('btnSave')?.click() },
    { label: 'Export…', icon: '⤓', run: () => document.getElementById('btnExport')?.click() });
  return items;
}

let _openTitle = null;
function openFor(btn) {
  const items = menuItems(btn.dataset.menu);
  if (!items.length) { closeMenu(); markOpen(null); return; }
  const r = btn.getBoundingClientRect();
  markOpen(btn);
  const m = openMenu(r.left, r.bottom + 3, items);
  // when the flyout closes (Esc / outside tap), drop the pressed styling
  const obs = new MutationObserver(() => { if (!document.body.contains(m)) { markOpen(null); obs.disconnect(); } });
  obs.observe(document.body, { childList: true });
}
function markOpen(btn) {
  _openTitle = btn;
  bar.querySelectorAll('.mb-menu').forEach((b) => b.classList.toggle('open', b === btn));
}

// ---- the contextual menu model -----------------------------------------------------------
const click = (id) => () => document.getElementById(id)?.click();
const avail = (id) => { const el = document.getElementById(id); return !!el && !el.hidden; };
const proj = (p) => () => document.querySelector(`#edProj button[data-proj="${p}"]`)?.click();
const projOn = (p) => !!document.querySelector(`#edProj button[data-proj="${p}"]`)?.classList.contains('on');

function menuItems(menu) {
  const type = Shell.activeType();
  const base = (type === 'editor') ? editorMenu(menu) : guestMenu(menu, type);
  return withBridged(base, menu);
}

// The editor's File/Edit/View driven by its real (already-wired) controls — proxy-clicks, so
// addons.js / pwa.js / app.js keep their single source of wiring.
function editorMenu(menu) {
  if (menu === 'file') {
    const items = [
      { label: 'Open media…', icon: '📂', run: click('dropzone') },
      { label: 'Save project', icon: '💾', run: click('btnSave') },
      { label: 'Export…', icon: '⤓', run: click('btnExport') },
    ];
    if (avail('btnInstall')) items.push('-', { label: 'Install app', icon: '⤓', run: click('btnInstall') });
    items.push('-', { label: 'Add-ons & CDN cache', icon: '⚙', run: click('btnAddons') });
    return items;
  }
  if (menu === 'edit') return [
    { label: 'Split at playhead', icon: '⎯', run: click('btnSplit') },
    { label: 'Delete selected clip', icon: '🗑', danger: true, run: click('btnDelete') },
    '-',
    { label: 'Add video track', icon: '＋', run: click('btnAddVideoTrack') },
    { label: 'Add audio track', icon: '＋', run: click('btnAddAudioTrack') },
  ];
  if (menu === 'view') return [
    { label: 'Edit layout', icon: '▦', checked: projOn('edit'), run: proj('edit') },
    { label: 'Wide layout', icon: '▭', checked: projOn('wide'), run: proj('wide') },
    { label: 'Preview layout', icon: '▶', checked: projOn('preview'), run: proj('preview') },
    '-',
    { label: 'Toggle timeline', icon: '⇕', run: click('tlGrip') },
    '-',
    { label: 'Home / Launcher', icon: '🏠', run: () => Shell.switchTo('home') },
  ];
  if (menu === 'help') return helpMenu();
  return [];
}

// Guests own their in-frame chrome; the menu bar still offers the shell-level verbs.
function guestMenu(menu, type) {
  const id = Shell.activeId();
  if (menu === 'file') {
    const items = [{ label: 'Home / Launcher', icon: '🏠', run: () => Shell.switchTo('home') }];
    const warm = Shell.openSurfaces().find((s) => s.id === id && s.kind === 'guest' && s.warm);
    if (warm) items.push('-', { label: 'Close surface (free memory)', icon: '✕', danger: true, run: () => Shell.closeSurface(id) });
    return items;
  }
  if (menu === 'view') return [
    { label: 'Home / Launcher', icon: '🏠', run: () => Shell.switchTo('home') },
    '-',
    ...surfaceSwitchItems(),
  ];
  if (menu === 'help') return helpMenu();
  return [];   // 'edit' is the guest's own; bridged verbs (if any) get appended below
}

function surfaceSwitchItems() {
  const cur = Shell.activeId();
  return Shell.openSurfaces().map((s) => ({
    label: s.name, icon: s.icon, checked: s.id === cur, disabled: s.id === cur,
    run: () => Shell.switchTo(s.id),
  }));
}

function helpMenu() {
  return [
    { label: 'About CoolPro', icon: 'ℹ', run: () => window.open('https://github.com/yourusername/coolpro', '_blank') },
    { label: 'Keyboard: Space play · S split · Del delete', icon: '⌨', disabled: true },
  ];
}

// Fold in any verbs the active guest contributed over the presenter bridge, grouped by their
// declared menu (file/edit/view/…). Lets a guest that speaks menu-context extend these pull-downs.
function withBridged(items, menu) {
  const verbs = Shell.activeVerbs().filter((v) => (v.menu || 'app').toLowerCase() === menu);
  if (!verbs.length) return items;
  const extra = verbs.map((v) => ({
    label: v.label || v.verb, checked: !!v.checked, disabled: v.enabled === false,
    run: () => Shell.invokeActiveVerb(v.verb),
  }));
  return items.length ? [...items, '-', ...extra] : extra;
}

// ---- the surface switcher (ex-taskbar) ---------------------------------------------------
function renderSwitcher() {
  if (!switcher) return;
  switcher.replaceChildren();
  for (const s of Shell.openSurfaces()) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'mb-chip' + (s.active ? ' active' : '') + (s.warm ? ' live' : '');
    chip.dataset.id = s.id;
    chip.title = s.name;
    chip.setAttribute('role', 'tab');
    chip.innerHTML = `<span class="mb-ic">${s.icon}</span><span class="mb-nm">${s.name}</span><span class="mb-dot"></span>`;
    chip.addEventListener('click', () => Shell.switchTo(s.id));
    attachContextMenu(chip, () => chipMenu(s.id));
    switcher.appendChild(chip);
  }
}

function chipMenu(id) {
  const s = Shell.openSurfaces().find((x) => x.id === id);
  if (!s) return [];
  const items = [
    { label: s.active ? 'Current surface' : `Open ${s.name}`, icon: s.icon, disabled: s.active, run: () => Shell.switchTo(id) },
  ];
  if (s.kind === 'guest') items.push('-', {
    label: s.warm ? 'Close (free memory)' : 'Not running', icon: '✕',
    danger: s.warm, disabled: !s.warm, run: () => Shell.closeSurface(id),
  });
  return items;
}

// active / warm changed — just retoggle the chip classes (no rebuild)
function refresh() {
  if (!switcher) return;
  const map = new Map(Shell.openSurfaces().map((s) => [s.id, s]));
  for (const chip of switcher.children) {
    const s = map.get(chip.dataset.id); if (!s) continue;
    chip.classList.toggle('active', s.active);
    chip.classList.toggle('live', s.warm);
  }
}
