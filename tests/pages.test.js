/**
 * pages.test.js — checks the <head> of every page: app icons, the app
 * manifest, sharing previews, and that every file a page points at exists.
 *
 * These are easy to break by accident (a typo in a file name just shows a
 * missing icon), so we check them automatically.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const PAGES = ['index.html', 'music.html', 'draw.html'];
const SITE = 'https://calebhamsa.fun/';

/**
 * Read one page's HTML.
 * @param {string} page - the file name, like 'index.html'
 * @returns {string} the HTML text
 */
const read = (page) => readFileSync(new URL(page, ROOT), 'utf8');

/**
 * Find the content="..." of a <meta> tag.
 * @param {string} html - the page's HTML
 * @param {string} attribute - 'name' or 'property'
 * @param {string} value - e.g. 'og:image'
 * @returns {string|undefined} the content, or undefined if the tag is missing
 */
function metaContent(html, attribute, value) {
  const match = html.match(new RegExp(`<meta\\s+${attribute}="${value}"\\s+content="([^"]*)"`));
  return match?.[1];
}

for (const page of PAGES) {
  test(`${page} links the app manifest and icons`, () => {
    const html = read(page);
    assert.match(html, /<link rel="manifest" href="manifest\.webmanifest">/);
    assert.match(html, /<link rel="icon" href="favicon\.ico" sizes="32x32">/);
    assert.match(html, /<link rel="icon" href="img\/icon\.svg" type="image\/svg\+xml">/);
    assert.match(html, /<link rel="apple-touch-icon" href="img\/apple-touch-icon\.png">/);
    assert.ok(metaContent(html, 'name', 'theme-color'), 'theme-color');
    assert.equal(metaContent(html, 'name', 'apple-mobile-web-app-title'), 'Caleb');
  });

  test(`${page} has sharing previews with full https addresses`, () => {
    const html = read(page);
    assert.equal(metaContent(html, 'property', 'og:image'), `${SITE}img/share-card.png`);
    assert.ok(metaContent(html, 'property', 'og:url')?.startsWith(SITE), 'og:url');
    assert.ok(metaContent(html, 'property', 'og:title'), 'og:title');
    assert.ok(metaContent(html, 'property', 'og:description'), 'og:description');
    assert.ok(metaContent(html, 'name', 'description'), 'description');
    assert.equal(metaContent(html, 'name', 'twitter:card'), 'summary_large_image');
  });

  test(`${page} starts the offline helper`, () => {
    assert.match(read(page), /registerServiceWorker\(\);/);
  });

  test(`every local file ${page} points at exists`, () => {
    const html = read(page);
    const paths = [...html.matchAll(/(?:href|src)="([^"#?]+)/g)]
      .map((match) => match[1])
      .filter((path) => !/^(https?:|data:|mailto:)/.test(path));
    for (const path of paths) assert.ok(existsSync(new URL(path, ROOT)), `${page} points at missing ${path}`);
  });
}

test('the manifest is valid JSON with the app name, colors and icons', () => {
  const manifest = JSON.parse(read('manifest.webmanifest'));
  assert.equal(manifest.name, "Caleb's Blocky World");
  assert.equal(manifest.short_name, 'Caleb');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, './');
  const sizes = manifest.icons.map((icon) => `${icon.sizes} ${icon.purpose ?? 'any'}`);
  assert.deepEqual(sizes, ['192x192 any', '512x512 any', '512x512 maskable']);
  for (const icon of manifest.icons) assert.ok(existsSync(new URL(icon.src, ROOT)), icon.src);
});

test('the sharing picture exists and is 1200 × 630 (the size link previews expect)', () => {
  const png = readFileSync(new URL('img/share-card.png', ROOT));
  assert.equal(png.toString('ascii', 12, 16), 'IHDR');
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 630);
});
