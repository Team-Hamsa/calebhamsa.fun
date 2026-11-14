/**
 * make-chem-pictures.cjs — draws the chemistry room pictures on the wiki
 * page (wiki/chemistry/*.png): benzene, a ring of five, and sulfuric acid,
 * built on a real triangle board with the room's own code (board.js) and
 * drawn with its own drawing (chem-art.js), so they always match the room.
 * It is NOT part of the website.
 *
 *     npm install --no-save playwright
 *     npx playwright install chromium
 *     node tools/make-chem-pictures.cjs
 *
 * (Like make-block-pictures.cjs, it runs a tiny web server while it works,
 * because browsers won't load modules from a plain file.)
 */
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');

/** How big a cell is in the pictures, in pixels. */
const CELL_PX = 40;

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
 * Build the three molecules in the browser and draw each one.
 * This function runs INSIDE the browser page (page.evaluate).
 * @param {number} cellPx - cell size in pixels
 * @returns {Promise<Record<string, string>>} picture name → PNG data: URL
 */
async function drawInPage(cellPx) {
  const board = await import('/js/chem/board.js');
  const art = await import('/js/chem/chem-art.js');
  /**
   * Put an atom next to `cell`, where no other atom with a free hand could grab it.
   * @param {object} b - the board
   * @param {number} cell - the atom to hold
   * @param {string} el - the atom to place
   * @param {Set<number>} keepEmpty - cells to leave empty (the middle of a ring)
   * @returns {void}
   */
  const beside = (b, cell, el, keepEmpty) => {
    const spot = board.neighbors(b, cell).map((n) => n.cell).find((c) => !b.atoms[c] && !keepEmpty.has(c)
      && board.neighbors(b, c).every((n) => n.cell === cell || !b.atoms[n.cell] || board.freeHands(b, n.cell) === 0));
    board.placeAtom(b, spot, el);
  };
  /**
   * Fill every free hand of these atoms with H's.
   * @param {object} b - the board
   * @param {number[]} cells - the atoms
   * @param {number[]} [keepEmpty] - cells to leave empty
   * @returns {void}
   */
  const hydrogens = (b, cells, keepEmpty = []) => {
    for (const cell of cells) while (board.freeHands(b, cell) > 0) beside(b, cell, 'H', new Set(keepEmpty));
  };
  /**
   * Cut the finished molecule out of the board and draw it.
   * @param {object} b - the board
   * @returns {string} a PNG data: URL
   */
  const picture = (b) => {
    const group = board.findGroups(b).find((g) => g.finished);
    const layout = board.groupLayout(b, group.cells);
    const size = art.pictureSize(layout, cellPx);
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    art.drawBoard(canvas.getContext('2d'), layout, cellPx, { grid: false, hands: false, glow: new Set(layout.atoms.map((_, i) => i)) });
    return canvas.toDataURL('image/png');
  };
  /**
   * The cell number of (x, y) on an 8-wide board.
   * @param {number} x - across
   * @param {number} y - down
   * @returns {number} the cell
   */
  const at = (x, y) => y * 8 + x;
  const pictures = {};

  // Benzene: six carbons around one empty cell, every other bond doubled.
  let b = board.createBoard(8, 7);
  // Row 3 is pushed right, so the six cells around (3,3), going round, are:
  const ring = [at(3, 2), at(4, 2), at(4, 3), at(4, 4), at(3, 4), at(2, 3)];
  for (const cell of ring) board.placeAtom(b, cell, 'C');
  for (let k = 0; k < 6; k += 2) board.tapBond(b, ring[k], ring[k + 1]);
  hydrogens(b, ring, [at(3, 3)]);
  pictures.benzene = picture(b);

  // A ring of five: the middle of the bottom three is pulled apart from the two above it.
  b = board.createBoard(8, 7);
  const [p, q, r, s, t] = [at(1, 3), at(2, 3), at(3, 3), at(2, 2), at(3, 2)];
  for (const cell of [p, q, r, s, t]) board.placeAtom(b, cell, 'C');
  board.tapBond(b, q, s);
  board.tapBond(b, q, t);
  board.tapBond(b, q, t);
  hydrogens(b, [p, r, s, t, q]);
  pictures['five-ring'] = picture(b);

  // Sulfuric acid: a sulfur with 6 hands.
  b = board.createBoard(8, 7);
  const sulfur = at(3, 2);
  board.placeAtom(b, sulfur, 'S');
  board.tapAtom(b, sulfur);
  board.tapAtom(b, sulfur);
  for (const o of [at(2, 2), at(2, 1)]) {
    board.placeAtom(b, o, 'O');
    board.tapBond(b, sulfur, o);
  }
  for (const o of [at(2, 3), at(3, 3)]) {
    board.placeAtom(b, o, 'O');
    hydrogens(b, [o]);
  }
  pictures['sulfuric-acid'] = picture(b);
  return pictures;
}

/**
 * Draw and save every chemistry picture.
 * @returns {Promise<void>} finishes when they're saved
 */
async function main() {
  const server = await startServer();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  const pictures = await page.evaluate(drawInPage, CELL_PX);
  for (const [name, dataUrl] of Object.entries(pictures)) {
    const file = path.join(ROOT, 'wiki', 'chemistry', `${name}.png`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
    console.log(`wrote wiki/chemistry/${name}.png`);
  }
  await browser.close();
  server.close();
}

main();
