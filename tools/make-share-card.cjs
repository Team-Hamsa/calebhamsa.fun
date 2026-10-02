/**
 * make-share-card.cjs — takes a picture of img/share-card.html and saves
 * it as img/share-card.png, the preview image for shared links.
 *
 * This one needs a real browser to draw the fonts and blocks, so it uses
 * Playwright (a tool that drives a browser). It is NOT part of the website
 * and the website doesn't need it. To run it:
 *
 *     npm install --no-save playwright
 *     npx playwright install chromium
 *     node tools/make-share-card.cjs
 *
 * (It's a .cjs file, the older "require" style of JavaScript, because
 * that's the easiest way to load Playwright from wherever it's installed.)
 */
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');

/**
 * Open the share card page at exactly 1200 × 630 and save a screenshot.
 * @returns {Promise<void>} finishes when the picture is saved
 */
async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.goto(pathToFileURL(path.join(ROOT, 'img/share-card.html')).href, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready); // wait for the pixel font
  await page.screenshot({ path: path.join(ROOT, 'img/share-card.png') });
  await browser.close();
  console.log('made img/share-card.png');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
