/* nocap — service worker.
   Extends the ArlineArcade pattern (network-first app code, versioned cache,
   cleanup on activate) with TWO additions nocap needs:
     1. A precached app shell so the editor is fully installable & offline.
     2. A separate, durable "CDN cache" for cross-origin packages (Transformers.js,
        lamejs, ffmpeg.wasm, model weights…). Cross-origin GETs are served
        cache-first from CDN_CACHE so warmed packages work offline; requests to
        known CDN hosts are auto-cached on first network hit.
   Update flow is explicit: we do NOT skipWaiting on install — the page detects the
   waiting worker and offers "Update", then posts SKIP_WAITING. */
const VERSION = 'nocap-v1';
const APP_CACHE = VERSION;
const CDN_CACHE = 'nocap-cdn';      // intentionally NOT version-suffixed: survives app updates
const FALLBACK = './index.html';

const SHELL = [
  './', './index.html', './theme.css', './app.css', './manifest.webmanifest',
  './src/app.js', './src/util.js', './src/hud.js', './src/idb.js', './src/store.js',
  './src/audio.js', './src/media.js', './src/timeline.js', './src/preview.js',
  './src/panels.js', './src/export.js', './src/ml.js', './src/cdn.js', './src/pwa.js',
  './src/addons.js', './src/ffmpeg.js',
  './vendor/ffmpeg/index.js', './vendor/ffmpeg/classes.js', './vendor/ffmpeg/const.js',
  './vendor/ffmpeg/errors.js', './vendor/ffmpeg/types.js', './vendor/ffmpeg/utils.js',
  './vendor/ffmpeg/worker.js',
  './vendor/ffmpeg-util/index.js', './vendor/ffmpeg-util/errors.js',
  './vendor/ffmpeg-util/const.js', './vendor/ffmpeg-util/types.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png',
];

// Hosts whose responses we auto-cache on first fetch (the "CDN" in CDN cache).
const CDN_HOSTS = [
  'cdn.jsdelivr.net', 'unpkg.com', 'esm.sh', 'cdnjs.cloudflare.com',
  'huggingface.co', 'cdn-lfs.huggingface.co', 'cas-bridge.xethub.hf.co',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(APP_CACHE);
    await Promise.allSettled(SHELL.map((u) => c.add(new Request(u, { cache: 'reload' }))));
    // note: no skipWaiting — let the page drive the update prompt
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== APP_CACHE && k !== CDN_CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url; try { url = new URL(req.url); } catch { return; }

  if (url.origin !== self.location.origin) {
    // cross-origin: this is the CDN cache lane
    e.respondWith(cdnStrategy(req, url));
    return;
  }
  // same-origin app code: network-first so deploys propagate; cache-first for the rest
  const appCode = req.mode === 'navigate' || /\.(?:js|css|webmanifest|html|json)$/.test(url.pathname);
  e.respondWith(appCode ? networkFirst(req) : cacheFirst(req, APP_CACHE));
});

async function cdnStrategy(req, url) {
  const cache = await caches.open(CDN_CACHE);
  const hit = await cache.match(req, { ignoreVary: true });
  if (hit) return hit;                                   // warmed package → offline-ready
  try {
    const fresh = await fetch(req);
    if (fresh.ok && CDN_HOSTS.includes(url.hostname)) cache.put(req, fresh.clone()).catch(() => {});
    return fresh;
  } catch {
    return hit || Response.error();
  }
}

async function networkFirst(req) {
  try {
    const fresh = await fetch(req, { cache: 'reload' });
    (await caches.open(APP_CACHE)).put(req, fresh.clone()).catch(() => {});
    return fresh;
  } catch {
    const cached = await caches.match(req);
    return cached || (req.mode === 'navigate' ? caches.match(FALLBACK) : Response.error());
  }
}

async function cacheFirst(req, cacheName) {
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const fresh = await fetch(req);
    (await caches.open(cacheName)).put(req, fresh.clone()).catch(() => {});
    return fresh;
  } catch { return cached || Response.error(); }
}
