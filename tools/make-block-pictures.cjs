/**
 * make-block-pictures.cjs — draws a picture of every Build page block
 * (docs/blocks/*.png) and of some little machines running
 * (docs/machines/*.png), for the README.
 *
 * It opens tools/block-pictures.html in a real browser, which uses the
 * game's own drawing code, so the pictures always match the game. Run it
 * again whenever a block's look changes. It is NOT part of the website.
 *
 *     npm install --no-save playwright
 *     npx playwright install chromium
 *     node tools/make-block-pictures.cjs
 *
 * (The page loads JavaScript modules, and browsers won't load those
 * from a plain file, so this script runs a tiny web server while it works.)
 */
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');

/** How big each block picture is, in pixels. */
const BLOCK_PX = 64;

/** How big each block is in the machine pictures, in pixels. */
const SCENE_CELL_PX = 32;

/**
 * Extra block pictures that aren't in the palette: the other side of a
 * switch, a lit lamp, and so on. [file name, block name, pretend signals]
 */
const EXTRA_PICTURES = [
  ['switchClosed', 'switchClosed', undefined],
  ['lamp-lit', 'lamp', { axis: 'h', faces: ['left', 'right'], arms: {}, level: 1 }],
  ['battery-spark', 'battery', { axis: 'h', faces: [], arms: {}, level: 2, spark: true }],
  ['valveClosed', 'valveClosed', undefined],
  ['burnerOff', 'burnerOff', undefined],
  ['pumpUp', 'pumpUp', undefined],
  ['crankCW', 'crankCW', undefined],
  ['gearBig-jammed', 'gearBig', { speed: 0, jammed: true }],
  ['winch-stalled', 'winch', { speed: 0, stalled: true }],
  ['winch-top', 'winch', { speed: 0, blocked: true, stopper: true }],
];

/**
 * What the letters in the machine pictures mean: [block, fluid to fill it with].
 */
const LETTERS = {
  '.': ['air'],
  '#': ['stone'],
  g: ['glass'],
  o: ['gold'],
  s: ['sand'],
  n: ['noteE'],
  W: ['wire'],
  B: ['battery'],
  L: ['lamp'],
  S: ['switchClosed'],
  K: ['clicker'],
  Z: ['buzzer'],
  P: ['pipe'],
  T: ['turbine'],
  F: ['burnerOn'],
  C: ['chiller'],
  '^': ['pumpUp'],
  '~': ['air', 'water'],
  D: ['drain'],
  f: ['faucet'],
  i: ['gearSmall'],
  G: ['gearBig'],
  '-': ['axle'],
  R: ['crankCW'],
  O: ['waterWheel'],
  E: ['generator'],
  Q: ['crankCCW'],
  w: ['winch'],
  '|': ['rope'],
  U: ['pulley'],
  h: ['pulleyHook'],
  c: ['crate'],
  I: ['ironWeight'],
};

/**
 * The machines. Each one is a little world drawn with LETTERS, run for
 * `ticks` ticks before its picture is taken (8 ticks = 1 second).
 */
const SCENES = {
  'lamp-loop': { ticks: 3, rows: [
    'WWWWW',
    'W...W',
    'B...L',
    'W...W',
    'WWWWW',
  ] },
  'series-parallel': { ticks: 3, rows: [
    'WWWWW..WWWWW',
    'B...W..B.L.L',
    'WLLWW..WWWWW',
  ] },
  'short-circuit': { ticks: 2, rows: [
    'WWW',
    'B.W',
    'WWW',
  ] },
  'music-machine': { ticks: 4, rows: [
    'WKWW',
    'B..W',
    'WnWW',
  ] },
  'u-tube': { ticks: 80, rows: [
    'g~g.g',
    'g~g.g',
    'g~g.g',
    'g~g.g',
    'g...g',
    'ggggg',
  ] },
  'water-tower': { ticks: 160, rows: [
    '#~~#......',
    '#~~#......',
    '#~~#......',
    '#~~#......',
    '#~~#......',
    '#~~#......',
    '#~~#......',
    '#~~#..P...',
    '#~~PPPP...',
    '##########',
  ] },
  'power-plant': { ticks: 40, rows: [
    'WWWLWWW',
    'W....CW',
    'WWWTWWW',
    '###~###',
    '###F###',
    '#######',
  ] },
  'pump-uphill': { ticks: 20, rows: [
    'WWWWW',
    'B#.#W',
    'WW^WW',
    '##~##',
    '#####',
  ] },
  'gear-train': { ticks: 3, rows: [
    'RiGi--i',
  ] },
  'jam-triangle': { ticks: 3, rows: [
    'GG',
    'GR',
  ] },
  'hydro-dam': { ticks: 40, rows: [
    '.f.....',
    '....WWW',
    '.OiiE.L',
    '.D..WWW',
    '#######',
  ] },
  'crane': { ticks: 12, rows: [
    'Rw',
    '.|',
    '.|',
    '.|',
    '.c',
    '##',
  ] },
  'at-the-top': { ticks: 30, rows: [
    'Rw',
    '.|',
    '.|',
    '.|',
    '.c',
    '##',
  ] },
  'too-heavy': { ticks: 4, rows: [
    'Rw',
    '.|',
    '.|',
    '.I',
    '.#',
  ] },
  'iron-geared': { ticks: 48, rows: [
    'RiG-iGw',
    '......|',
    '......|',
    '......|',
    '......I',
    '......#',
  ] },
  'pulley-hook': { ticks: 48, rows: [
    'QiGw',
    '...|',
    '...|',
    '...|',
    '...h',
    '...I',
    '...#',
  ] },
  'well': { ticks: 16, rows: [
    'U||w',
    '|..R',
    '|...',
    '|...',
    'c...',
    '####',
  ] },
  'sand-in-water': { ticks: 4, rows: [
    'gsssg',
    'g~~~g',
    'g~~~g',
    'ggggg',
  ] },
};

/**
 * Serve the project folder on a free port, so the browser can load modules.
 * @returns {Promise<http.Server>} the running server
 */
function startServer() {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
  const server = http.createServer((request, response) => {
    const file = path.join(ROOT, decodeURIComponent(new URL(request.url, 'http://x').pathname));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(response);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

/**
 * Save a data: URL as a PNG file.
 * @param {string} dataUrl - what the page drew
 * @param {string} relative - where to save it, from the project folder
 * @returns {void}
 */
function savePng(dataUrl, relative) {
  const file = path.join(ROOT, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
}

/**
 * Draw and save every block picture and every machine picture.
 * @returns {Promise<void>} finishes when they're all saved
 */
async function main() {
  const server = await startServer();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/tools/block-pictures.html`);
  await page.evaluate(() => window.ready);

  const names = await page.evaluate(async () => {
    const { PACKS, blocksInPack } = await import('../js/blocks/registry.js');
    return PACKS.flatMap((pack) => blocksInPack(pack.tab.id));
  });
  const pictures = [...names.map((name) => [name, name, undefined]), ...EXTRA_PICTURES];
  for (const [file, name, cell] of pictures) {
    savePng(await page.evaluate(([n, s, c]) => window.blockPicture(n, s, c), [name, BLOCK_PX, cell]), `docs/blocks/${file}.png`);
  }
  for (const [name, scene] of Object.entries(SCENES)) {
    const dataUrl = await page.evaluate(([s, px]) => window.scenePicture(s, px), [{ ...scene, letters: LETTERS }, SCENE_CELL_PX]);
    savePng(dataUrl, `docs/machines/${name}.png`);
  }

  await browser.close();
  server.close();
  console.log(`made ${pictures.length} block pictures and ${Object.keys(SCENES).length} machine pictures`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
