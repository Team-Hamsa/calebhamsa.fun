/**
 * make-icons.js — turns the letter drawing in img/icon-pixels.txt into
 * every icon file the site needs.
 *
 * Run it from the project folder after changing the drawing:
 *
 *     node tools/make-icons.js
 *
 * It makes:
 *   img/icon.svg               the browser-tab icon (sharp at any size)
 *   img/icon-192.png           app icon, small
 *   img/icon-512.png           app icon, big
 *   img/icon-maskable-512.png  app icon with sky around it, for phones that
 *                              cut icons into circles or rounded squares
 *   img/apple-touch-icon.png   the iPad/iPhone home-screen icon
 *   favicon.ico                the old-fashioned icon file some browsers ask for
 *
 * No libraries needed! A PNG file is just a short header plus the pixels,
 * squashed with zlib (which Node has built in), so we write them by hand.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';
import { fileURLToPath } from 'node:url';

/**
 * What color each letter in the drawing means. null = see-through.
 * These match the colors in css/blocks.css.
 * 🧪 Try this! Make W '#ffd54f' for a golden C.
 */
export const PALETTE = {
  G: '#5dbb3f', // grass
  g: '#3f8a2a', // dark grass
  D: '#8b5a2b', // dirt
  d: '#5e3b1a', // dark dirt
  W: '#ffffff', // white
  s: '#3b2412', // shadow
  '.': null,    // see-through
};

/** The sky color, used around the maskable icon. Same as --sky in blocks.css. */
export const SKY = '#7ec8ff';

/**
 * Read the letter drawing: skip notes and blank lines, and check every
 * letter is one we know and every row is the same length.
 *
 * @param {string} text - the contents of icon-pixels.txt
 * @returns {string[]} one string per row of pixels
 */
export function parsePixelMap(text) {
  const rows = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));

  rows.forEach((row, index) => {
    for (const letter of row) {
      if (!(letter in PALETTE)) throw new Error(`Row ${index + 1}: unknown pixel letter "${letter}"`);
    }
  });
  if (rows.some((row) => row.length !== rows[0].length)) {
    throw new Error('Every row of the drawing must be the same length');
  }
  return rows;
}

/**
 * Turn a color like '#ff8000' into four numbers: red, green, blue, alpha.
 * (Alpha is how solid the color is: 255 = solid, 0 = see-through.)
 *
 * @param {string|null} hex - a #RRGGBB color, or null for see-through
 * @returns {number[]} [red, green, blue, alpha], each 0–255
 */
export function hexToRgba(hex) {
  if (!hex) return [0, 0, 0, 0];
  const number = parseInt(hex.slice(1), 16);
  return [(number >> 16) & 255, (number >> 8) & 255, number & 255, 255];
}

/**
 * Paint the drawing into a square picture, each drawing pixel becoming a
 * scale × scale block, centered in the square.
 *
 * @param {string[]} rows - the drawing, from parsePixelMap()
 * @param {number} size - how many real pixels wide and tall the picture is
 * @param {{scale?: number, background?: string|null}} [options]
 *   scale: how big each drawing pixel is (defaults to as big as fits);
 *   background: a color for the space around the drawing (default see-through)
 * @returns {Uint8Array} the picture: 4 numbers (RGBA) per pixel, row by row
 */
export function renderPixels(rows, size, { scale, background = null } = {}) {
  const width = rows[0].length;
  const height = rows.length;
  const blockSize = scale ?? Math.floor(size / Math.max(width, height));
  const left = Math.floor((size - width * blockSize) / 2);
  const top = Math.floor((size - height * blockSize) / 2);

  const picture = new Uint8Array(size * size * 4);
  /**
   * Color one real pixel.
   * @param {number} x - pixels from the left
   * @param {number} y - pixels from the top
   * @param {number[]} rgba - the color as [red, green, blue, alpha]
   * @returns {void}
   */
  const setPixel = (x, y, rgba) => picture.set(rgba, (y * size + x) * 4);

  if (background) {
    const rgba = hexToRgba(background);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) setPixel(x, y, rgba);
  }

  rows.forEach((row, rowIndex) => {
    [...row].forEach((letter, columnIndex) => {
      const color = PALETTE[letter];
      if (!color) return; // see-through: leave the background showing
      const rgba = hexToRgba(color);
      for (let dy = 0; dy < blockSize; dy++) {
        for (let dx = 0; dx < blockSize; dx++) {
          setPixel(left + columnIndex * blockSize + dx, top + rowIndex * blockSize + dy, rgba);
        }
      }
    });
  });
  return picture;
}

/**
 * Pack a picture into a PNG file.
 *
 * A PNG is a signature (8 magic bytes saying "I'm a PNG!") followed by
 * "chunks". Each chunk is: its length, a 4-letter name, the data, and a
 * checksum (a number that proves the data didn't get scrambled).
 *   IHDR  the header: width, height, and what kind of pixels
 *   IDAT  the pixels, squashed with zlib
 *   IEND  "that's the end"
 *
 * @param {number} width - picture width in pixels
 * @param {number} height - picture height in pixels
 * @param {Uint8Array} rgba - 4 numbers per pixel, row by row
 * @returns {Buffer} the PNG file's bytes
 */
export function encodePng(width, height, rgba) {
  // Each row starts with a "filter" byte. 0 means "no tricks, just the pixels".
  const rowLength = width * 4;
  const raw = Buffer.alloc((rowLength + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (rowLength + 1)] = 0;
    raw.set(rgba.subarray(y * rowLength, (y + 1) * rowLength), y * (rowLength + 1) + 1);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;  // 8 bits per color number (0–255)
  header[9] = 6;  // color type 6 = red, green, blue and alpha
  // bytes 10–12 stay 0: standard compression, standard filters, no interlacing

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Make one PNG chunk: length, name, data, checksum.
 * @param {string} name - the 4-letter chunk name, like 'IHDR'
 * @param {Buffer} data - what goes inside
 * @returns {Buffer} the chunk's bytes
 */
function pngChunk(name, data) {
  const nameAndData = Buffer.concat([Buffer.from(name, 'ascii'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(nameAndData));
  return Buffer.concat([length, nameAndData, checksum]);
}

/**
 * Pack several PNG pictures into one .ico file.
 *
 * An ICO file is a little list ("this file holds 2 pictures: a 16-pixel
 * one at byte 38, a 32-pixel one at byte 400...") followed by the pictures.
 *
 * @param {{size: number, png: Buffer}[]} pictures - square PNGs and their sizes
 * @returns {Buffer} the .ico file's bytes
 */
export function encodeIco(pictures) {
  const listStart = 6;
  const entrySize = 16;
  const header = Buffer.alloc(listStart);
  header.writeUInt16LE(0, 0);               // always 0
  header.writeUInt16LE(1, 2);               // 1 = icon (2 would be a mouse cursor)
  header.writeUInt16LE(pictures.length, 4);

  let offset = listStart + entrySize * pictures.length; // pictures start after the list
  const entries = pictures.map(({ size, png }) => {
    const entry = Buffer.alloc(entrySize);
    entry[0] = size >= 256 ? 0 : size;      // width (0 means 256)
    entry[1] = size >= 256 ? 0 : size;      // height
    entry.writeUInt16LE(1, 4);              // color planes
    entry.writeUInt16LE(32, 6);             // bits per pixel
    entry.writeUInt32LE(png.length, 8);     // how many bytes the picture is
    entry.writeUInt32LE(offset, 12);        // where the picture starts
    offset += png.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...pictures.map(({ png }) => png)]);
}

/**
 * Turn the drawing into an SVG: one rectangle per run of same-colored
 * pixels in a row. crispEdges keeps the pixels sharp, with no blur.
 *
 * @param {string[]} rows - the drawing, from parsePixelMap()
 * @returns {string} the SVG file's text
 */
export function makeSvg(rows) {
  const rects = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const letter = row[x];
      let runLength = 1;
      while (row[x + runLength] === letter) runLength++;
      if (PALETTE[letter]) {
        rects.push(`<rect x="${x}" y="${y}" width="${runLength}" height="1" fill="${PALETTE[letter]}"/>`);
      }
      x += runLength;
    }
  });
  return [
    '<!-- Made by tools/make-icons.js from img/icon-pixels.txt. Edit that file, not this one! -->',
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${rows[0].length} ${rows.length}" shape-rendering="crispEdges">`,
    ...rects.map((rect) => `  ${rect}`),
    '</svg>',
    '',
  ].join('\n');
}

/**
 * Read the drawing and write every icon file.
 * @returns {void}
 */
function main() {
  const root = new URL('../', import.meta.url);
  const rows = parsePixelMap(readFileSync(new URL('img/icon-pixels.txt', root), 'utf8'));

  /**
   * Draw the icon at a size and save it as a PNG.
   * @param {string} path - where to save, from the project folder
   * @param {number} size - width and height in pixels
   * @param {object} [options] - passed to renderPixels()
   * @returns {Buffer} the PNG bytes
   */
  const savePng = (path, size, options) => {
    const png = encodePng(size, size, renderPixels(rows, size, options));
    writeFileSync(new URL(path, root), png);
    console.log(`made ${path}`);
    return png;
  };

  writeFileSync(new URL('img/icon.svg', root), makeSvg(rows));
  console.log('made img/icon.svg');
  savePng('img/icon-192.png', 192);
  savePng('img/icon-512.png', 512);
  // Phones may cut the maskable icon into a circle, keeping only the middle
  // 80%. So the block is drawn smaller (18 × 16 = 288 pixels) with sky around it.
  savePng('img/icon-maskable-512.png', 512, { scale: 18, background: SKY });
  // iPads round the corners themselves; 192 is plenty (they shrink it smoothly).
  savePng('img/apple-touch-icon.png', 192);

  writeFileSync(new URL('favicon.ico', root), encodeIco([
    { size: 16, png: encodePng(16, 16, renderPixels(rows, 16)) },
    { size: 32, png: encodePng(32, 32, renderPixels(rows, 32)) },
  ]));
  console.log('made favicon.ico');
}

// Only make the files when run as `node tools/make-icons.js`, not when the tests import this file.
if (process.argv[1] === fileURLToPath(import.meta.url)) main();
