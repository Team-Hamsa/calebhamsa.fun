/**
 * sw.js — the service worker: a little helper that sits between the
 * pages and the internet, so the site still works with no internet
 * (in the car, on a plane).
 *
 * The browser starts it in the background (js/pwa.js asks it to). Every
 * time a page asks for a file, the helper decides what to do:
 *
 *   our own files      → "network-first": try the internet, so the newest
 *                        code always shows up; save a copy; if there's no
 *                        internet, use the saved copy.
 *   Google Fonts       → "stale-while-revalidate": use the saved copy right
 *                        away (fonts hardly ever change) and quietly fetch a
 *                        fresh one for next time.
 *   anything else      → leave it alone.
 *
 * It lives next to index.html (not in js/) on purpose: a service worker
 * can only look after files in its own folder and the folders below it.
 *
 * Unlike the other scripts, this is a plain script, not a module, because
 * not every browser can run a service worker as a module yet.
 */

/**
 * The name of the box where saved files are kept.
 * 🧪 Change the number (v1 → v2) after adding or renaming files in PRECACHE
 *    below, so every device fetches a fresh set.
 */
const CACHE_NAME = 'caleb-v1';

/**
 * Files to save straight away, the first time the site is opened, so
 * every page works offline even if Caleb hasn't visited it yet.
 */
const PRECACHE = [
  './',
  './index.html',
  './music.html',
  './draw.html',
  './css/blocks.css',
  './js/ui.js',
  './js/pwa.js',
  './js/music-theory.js',
  './js/music.js',
  './js/draw.js',
  './js/trace.js',
  './manifest.webmanifest',
  './favicon.ico',
  './img/icon.svg',
  './img/icon-192.png',
  './img/icon-512.png',
  './img/icon-maskable-512.png',
  './img/apple-touch-icon.png',
];

/** Where the fonts come from (Google Fonts uses two addresses). */
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

/**
 * If the internet takes longer than this to answer, use the saved copy
 * instead of making Caleb wait (slow car Wi-Fi!).
 */
const NETWORK_TIMEOUT_MS = 3000;

/**
 * Decide how to handle one request. This is the "brain" of the helper.
 * It only looks at the request, so tests/sw.test.js can check it.
 *
 * @param {{method: string, url: string}} request - what the page asked for
 * @returns {'network-first'|'stale-while-revalidate'|'skip'} what to do
 */
function strategyFor(request) {
  if (request.method !== 'GET') return 'skip'; // only "fetch me a file" requests
  const url = new URL(request.url);
  if (url.origin === self.location.origin) return 'network-first';
  if (FONT_HOSTS.includes(url.hostname)) return 'stale-while-revalidate';
  return 'skip';
}

/**
 * Try the internet first; save what comes back; fall back to the saved copy.
 * @param {Request} request - what the page asked for
 * @returns {Promise<Response>} the answer to give the page
 */
async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetchWithTimeout(request, NETWORK_TIMEOUT_MS);
    if (response.ok) cache.put(request, response.clone()); // keep a copy for offline
    return response;
  } catch {
    // No internet (or too slow). ignoreSearch lets "draw.html?mode=trace"
    // use the saved "draw.html".
    const saved = await cache.match(request, { ignoreSearch: true });
    if (saved) return saved;
    throw new Error(`Offline and no saved copy of ${request.url}`);
  }
}

/**
 * Answer from the saved copy if there is one, and fetch a fresh copy in
 * the background for next time.
 * @param {Request} request - what the page asked for
 * @returns {Promise<Response>} the answer to give the page
 */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const saved = await cache.match(request);
  const fresh = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => saved); // offline: the saved copy is all we have
  return saved ?? fresh;
}

/**
 * fetch(), but give up after a while.
 * @param {Request} request - what to fetch
 * @param {number} ms - how long to wait, in milliseconds
 * @returns {Promise<Response>} the response, or an error if it took too long
 */
function fetchWithTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out')), ms);
    fetch(request).then(
      (response) => { clearTimeout(timer); resolve(response); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

// "install" happens once per new version: save the PRECACHE files.
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)));
  self.skipWaiting(); // start helping right away instead of waiting for every tab to close
});

// "activate": throw away boxes from older versions, then look after open pages.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

// "fetch": a page asked for a file. Decide what to do with it.
self.addEventListener('fetch', (event) => {
  const strategy = strategyFor(event.request);
  if (strategy === 'network-first') event.respondWith(networkFirst(event.request));
  if (strategy === 'stale-while-revalidate') event.respondWith(staleWhileRevalidate(event.request));
  // 'skip': do nothing, and the browser fetches it the normal way.
});
