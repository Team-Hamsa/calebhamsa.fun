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
import { readdirSync, readFileSync } from 'node:fs';
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
  return vm.runInContext(`${code}\n;({ strategyFor, missingFiles, fontFilesIn, PRECACHE, FONT_STYLESHEETS });`, world);
}

test('our own pages and code: try the internet first, so edits show up straight away', () => {
  const { strategyFor } = loadServiceWorker();
  assert.equal(strategyFor({ method: 'GET', url: `${SITE}/music.html` }), 'network-first');
  assert.equal(strategyFor({ method: 'GET', url: `${SITE}/js/draw.js` }), 'network-first');
  assert.equal(strategyFor({ method: 'GET', url: `${SITE}/draw.html?mode=trace` }), 'network-first');
});

test('big data files: use the saved copy, and refresh it in the background', () => {
  const { strategyFor } = loadServiceWorker();
  assert.equal(strategyFor({ method: 'GET', url: `${SITE}/data/molecules.json` }), 'stale-while-revalidate');
  assert.equal(strategyFor({ method: 'GET', url: `${SITE}/chem.html` }), 'network-first');
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

test('missingFiles lists the offline files that are not saved yet', () => {
  const { missingFiles } = loadServiceWorker();
  const saved = [`${SITE}/`, `${SITE}/index.html`];
  assert.deepEqual(missingFiles(['./', './index.html', './music.html'], saved, `${SITE}/sw.js`), ['./music.html']);
});

test('missingFiles is empty when everything is saved', () => {
  const { missingFiles } = loadServiceWorker();
  assert.deepEqual(missingFiles(['./', './js/ui.js'], [`${SITE}/`, `${SITE}/js/ui.js`], `${SITE}/sw.js`), []);
});

test('missingFiles also works for whole addresses, like the font stylesheets', () => {
  const { missingFiles } = loadServiceWorker();
  const font = 'https://fonts.googleapis.com/css2?family=Andika&display=swap';
  assert.deepEqual(missingFiles([font], [], `${SITE}/sw.js`), [font]);
  assert.deepEqual(missingFiles([font], [font], `${SITE}/sw.js`), []);
});

test('the helper saves exactly the font stylesheets the pages use', () => {
  const { FONT_STYLESHEETS } = loadServiceWorker();
  const used = new Set();
  for (const page of ['index.html', 'music.html', 'draw.html', 'build.html', 'chem.html']) {
    const html = readFileSync(new URL(`../${page}`, import.meta.url), 'utf8');
    for (const match of html.matchAll(/<link rel="stylesheet" href="(https:\/\/fonts\.googleapis\.com\/[^"]+)"/g)) used.add(match[1]);
  }
  assert.deepEqual([...FONT_STYLESHEETS].sort(), [...used].sort());
});

test('fontFilesIn finds the font files a Google Fonts stylesheet points to', () => {
  const { fontFilesIn } = loadServiceWorker();
  const css = `
    @font-face { font-family: 'Andika'; src: url(https://fonts.gstatic.com/s/andika/v1/a.woff2) format('woff2'); }
    @font-face { font-family: 'Andika'; src: url(https://fonts.gstatic.com/s/andika/v1/b.woff2) format('woff2'); }`;
  assert.deepEqual([...fontFilesIn(css)], [
    'https://fonts.gstatic.com/s/andika/v1/a.woff2',
    'https://fonts.gstatic.com/s/andika/v1/b.woff2',
  ]);
});

test('every page and every js file is saved for offline use', () => {
  const { PRECACHE } = loadServiceWorker();
  const scripts = readdirSync(new URL('../js/', import.meta.url), { recursive: true })
    .filter((name) => name.endsWith('.js'))
    .map((name) => `./js/${name}`);
  for (const path of [...scripts, './index.html', './music.html', './draw.html', './build.html', './chem.html']) {
    assert.ok(PRECACHE.includes(path), `PRECACHE is missing ${path}`);
  }
});
