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
const CACHE_NAME = 'caleb-v2';

/**
 * Files to save straight away, the first time the site is opened, so
 * every page works offline even if Caleb hasn't visited it yet.
 */
const PRECACHE = [
  './',
  './index.html',
  './music.html',
  './draw.html',
  './build.html',
  './css/blocks.css',
  './js/ui.js',
  './js/pwa.js',
  './js/music-theory.js',
  './js/music.js',
  './js/draw.js',
  './js/trace.js',
  './js/sound.js',
  './js/world.js',
  './js/saves.js',
  './js/block-art.js',
  './js/build.js',
  './js/blocks/registry.js',
  './js/blocks/basic.js',
  './manifest.webmanifest',
  './favicon.ico',
  './img/icon.svg',
  './img/icon-192.png',
  './img/icon-512.png',
  './img/icon-maskable-512.png',
  './img/apple-touch-icon.png',
];

/**
 * The Google Fonts stylesheets our pages use. They're saved at install
 * time too (with the font files they point to), because on the very
 * first visit the helper isn't looking after the page yet, so it can't
 * catch the page's own font requests.
 * 🧪 If you change a font <link> in a page, change it here to match
 *    (tests/sw.test.js checks they agree).
 */
const FONT_STYLESHEETS = [
  'https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap',
  'https://fonts.googleapis.com/css2?family=Andika&family=Playwrite+US+Trad&family=Press+Start+2P&display=swap',
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
  // ignoreVary: Google says its answer depends on who asked (the page or
  // this helper), but the files are the same, so either saved copy will do.
  const saved = await cache.match(request, { ignoreVary: true });
  const fresh = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => saved); // offline: the saved copy is all we have
  return saved ?? fresh;
}

/**
 * Which PRECACHE files aren't saved yet? The "ready offline" badge
 * (js/pwa.js) asks, so it can say how many are still to go.
 * It only compares lists, so tests/sw.test.js can check it.
 *
 * @param {string[]} wanted - files to save, like './music.html'
 * @param {string[]} savedUrls - full addresses already saved, like 'https://calebhamsa.fun/music.html'
 * @param {string} base - this helper's own address, which './...' is measured from
 * @returns {string[]} the wanted files that aren't saved yet
 */
function missingFiles(wanted, savedUrls, base) {
  const saved = new Set(savedUrls);
  return wanted.filter((file) => !saved.has(new URL(file, base).href));
}

/**
 * Find the font files a Google Fonts stylesheet points to.
 * @param {string} css - the stylesheet's text
 * @returns {string[]} the font files' addresses
 */
function fontFilesIn(css) {
  return [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map((match) => match[1]);
}

/**
 * Save the FONT_STYLESHEETS, and every font file they point to.
 * @param {Cache} cache - the box to save them in
 * @returns {Promise<void>} finishes when they're all saved
 */
async function saveFonts(cache) {
  for (const url of FONT_STYLESHEETS) {
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) throw new Error(`${url} answered ${response.status}`);
    const css = await response.clone().text();
    await cache.put(url, response);
    await cache.addAll(fontFilesIn(css).map((file) => new Request(file, { mode: 'cors' })));
  }
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
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => Promise.all([
    cache.addAll(PRECACHE),
    // The pages still work without the fonts (just in a plainer font),
    // so a font hiccup shouldn't stop everything else being saved.
    saveFonts(cache).catch((error) => console.warn('Could not save the fonts:', error)),
  ])));
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

// "message": a page asked "which files are still missing?" (see js/pwa.js).
// It sends a MessageChannel port along, and we answer on that port.
self.addEventListener('message', (event) => {
  if (event.data !== 'missing-files' || !event.ports[0]) return;
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.keys())
      .then((requests) => missingFiles([...PRECACHE, ...FONT_STYLESHEETS], requests.map((request) => request.url), self.location.href))
      .catch(() => [...PRECACHE, ...FONT_STYLESHEETS]) // can't look in the box: count everything as missing
      .then((missing) => event.ports[0].postMessage(missing)),
  );
});

// "fetch": a page asked for a file. Decide what to do with it.
self.addEventListener('fetch', (event) => {
  const strategy = strategyFor(event.request);
  if (strategy === 'network-first') event.respondWith(networkFirst(event.request));
  if (strategy === 'stale-while-revalidate') event.respondWith(staleWhileRevalidate(event.request));
  // 'skip': do nothing, and the browser fetches it the normal way.
});
