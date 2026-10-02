/**
 * icons.test.js — checks the icon maker (tools/make-icons.js).
 *
 * The icon is drawn as letters in img/icon-pixels.txt. These tests check
 * that the letters are read correctly, that the PNG and ICO files come out
 * in the right format, and that the saved icon files match the letters
 * (so nobody forgets to run the maker after editing the drawing).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import {
  parsePixelMap, renderPixels, encodePng, encodeIco, makeSvg, hexToRgba, SKY,
} from '../tools/make-icons.js';

const PIXEL_FILE = new URL('../img/icon-pixels.txt', import.meta.url);

test('the drawing is a 16 × 16 square of known letters', () => {
  const rows = parsePixelMap(readFileSync(PIXEL_FILE, 'utf8'));
  assert.equal(rows.length, 16);
  for (const row of rows) assert.equal(row.length, 16);
});

test('note lines starting with # are skipped', () => {
  assert.deepEqual(parsePixelMap('# a note\nGG\nDD\n'), ['GG', 'DD']);
});

test('an unknown letter is an error that says which row', () => {
  assert.throws(() => parsePixelMap('GG\nGZ\n'), /Row 2: unknown pixel letter "Z"/);
});

test('rows of different lengths are an error', () => {
  assert.throws(() => parsePixelMap('GGG\nGG\n'), /same length/);
});

test('hex colors turn into red, green, blue, alpha numbers', () => {
  assert.deepEqual(hexToRgba('#ff8000'), [255, 128, 0, 255]);
  assert.deepEqual(hexToRgba(null), [0, 0, 0, 0]); // see-through
});

test('each drawing pixel becomes a square block of real pixels', () => {
  const rgba = renderPixels(['WD'], 4, { scale: 2 }); // 2×1 drawing, 2× bigger, centered in 4×4
  const pixelAt = (x, y) => [...rgba.slice((y * 4 + x) * 4, (y * 4 + x) * 4 + 4)];
  assert.deepEqual(pixelAt(0, 1), [255, 255, 255, 255]); // W, top-left of the drawing
  assert.deepEqual(pixelAt(1, 2), [255, 255, 255, 255]); // still W (2× bigger)
  assert.deepEqual(pixelAt(2, 1), hexToRgba('#8b5a2b'));  // D
  assert.deepEqual(pixelAt(0, 0), [0, 0, 0, 0]);          // empty space above: see-through
});

test('the background color fills the space around the drawing', () => {
  const rgba = renderPixels(['W'], 3, { scale: 1, background: SKY });
  assert.deepEqual([...rgba.slice(0, 4)], hexToRgba(SKY));
});

test('PNG files start with the PNG signature and record their size', () => {
  const png = encodePng(3, 2, new Uint8Array(3 * 2 * 4));
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.toString('ascii', 12, 16), 'IHDR');
  assert.equal(png.readUInt32BE(16), 3); // width
  assert.equal(png.readUInt32BE(20), 2); // height
});

test('the PNG picture data unpacks to exactly the pixels we put in', () => {
  const rgba = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]); // 2×1 picture
  const png = encodePng(2, 1, rgba);
  const idatStart = png.indexOf('IDAT') + 4;
  const idatLength = png.readUInt32BE(idatStart - 8);
  const raw = inflateSync(png.subarray(idatStart, idatStart + idatLength));
  assert.deepEqual([...raw], [0, 1, 2, 3, 4, 5, 6, 7, 8]); // filter byte 0, then the row
});

test('ICO files hold several PNG sizes', () => {
  const ico = encodeIco([
    { size: 16, png: Buffer.from('a') },
    { size: 32, png: Buffer.from('bb') },
  ]);
  assert.equal(ico.readUInt16LE(2), 1); // type 1 = icon
  assert.equal(ico.readUInt16LE(4), 2); // 2 pictures
  assert.equal(ico[6], 16);             // first picture is 16 wide
  assert.equal(ico.readUInt32LE(6 + 8), 1); // and 1 byte long
  assert.equal(ico.readUInt32LE(6 + 12), 6 + 16 * 2); // stored right after the list
});

test('img/icon.svg matches the drawing (run `node tools/make-icons.js` after editing it)', () => {
  const rows = parsePixelMap(readFileSync(PIXEL_FILE, 'utf8'));
  const saved = readFileSync(new URL('../img/icon.svg', import.meta.url), 'utf8');
  assert.equal(saved, makeSvg(rows));
});
