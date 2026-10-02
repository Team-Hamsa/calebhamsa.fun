/**
 * sw.test.js — checks the service worker's "what do I do with this
 * request?" rule.
 *
 * sw.js runs inside the browser as a service worker, not as a normal
 * module, so we can't import it. Instead we load its code into a little
 * pretend world (a "vm context") that has a fake `self`, then call its
 * strategyFor() function directly.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SITE = 'https://calebhamsa.fun';

/**
 * Load sw.js into a pretend service-worker world and hand back its functions.
 * @returns {object} the pretend world, with sw.js's functions on it
 */
function loadServiceWorker() {
  const world = {
    self: { addEventListener() {}, location: { origin: SITE } },
    URL,
  };
  vm.createContext(world);
  const code = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  // The last line hands back the pieces we test (a script's `const`s
  // aren't visible from outside, but its final expression's value is).
  return vm.runInContext(`${code}\n;({ strategyFor, PRECACHE });`, world);
}

test('our own pages and code: try the internet first, so edits show up straight away', () => {
  const { strategyFor } = loadServiceWorker();
  assert.equal(strategyFor({ method: 'GET', url: `${SITE}/music.html` }), 'network-first');
  assert.equal(strategyFor({ method: 'GET', url: `${SITE}/js/draw.js` }), 'network-first');
  assert.equal(strategyFor({ method: 'GET', url: `${SITE}/draw.html?mode=trace` }), 'network-first');
});

test('Google Fonts: use the saved copy, and refresh it in the background', () => {
  const { strategyFor } = loadServiceWorker();
  assert.equal(strategyFor({ method: 'GET', url: 'https://fonts.googleapis.com/css2?family=Andika' }), 'stale-while-revalidate');
  assert.equal(strategyFor({ method: 'GET', url: 'https://fonts.gstatic.com/s/andika/v1/a.woff2' }), 'stale-while-revalidate');
});

test('anything else is left alone', () => {
  const { strategyFor } = loadServiceWorker();
  assert.equal(strategyFor({ method: 'GET', url: 'https://example.com/tracker.js' }), 'skip');
  assert.equal(strategyFor({ method: 'POST', url: `${SITE}/music.html` }), 'skip');
});

test('the files saved for offline use all start with ./ (so the site works in any folder)', () => {
  const { PRECACHE } = loadServiceWorker();
  assert.ok(PRECACHE.length > 0);
  for (const path of PRECACHE) assert.ok(path.startsWith('./'), path);
});

test('every file saved for offline use really exists', () => {
  const { PRECACHE } = loadServiceWorker();
  for (const path of PRECACHE) {
    const file = path === './' ? 'index.html' : path.slice(2);
    assert.doesNotThrow(() => readFileSync(new URL(`../${file}`, import.meta.url)), `missing ${file}`);
  }
});
