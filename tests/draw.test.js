/**
 * draw.test.js — checks for the drawing pad's math.
 *
 * Drawing itself needs a screen, but two pieces are pure math we can
 * check here (they live in ui.js, shared with the Build page): which
 * grid squares the block brush fills, and the filename a saved picture gets.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cellsAlongLine, filenameForDate } from '../js/ui.js';

test('a tap with the block brush fills exactly one square', () => {
  assert.deepEqual(cellsAlongLine(5, 5, 5, 5, 24), [[0, 0]]);
});

test('squares are counted from the top-left corner, 24px each', () => {
  assert.deepEqual(cellsAlongLine(50, 30, 50, 30, 24), [[2, 1]]);
});

test('a fast swipe leaves no gaps', () => {
  // The finger jumped 100px between two moments, but every square in between is filled.
  assert.deepEqual(cellsAlongLine(0, 0, 100, 0, 24), [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]]);
});

test('diagonal swipes have no gaps and no repeats', () => {
  const cells = cellsAlongLine(0, 0, 200, 130, 24);
  assert.deepEqual(cells[0], [0, 0]);
  assert.deepEqual(cells[cells.length - 1], [8, 5]);
  for (let i = 1; i < cells.length; i++) {
    const [col, row] = cells[i];
    const [prevCol, prevRow] = cells[i - 1];
    assert.ok(Math.abs(col - prevCol) <= 1 && Math.abs(row - prevRow) <= 1, `gap before ${cells[i]}`);
  }
  const keys = cells.map(([col, row]) => `${col},${row}`);
  assert.equal(new Set(keys).size, keys.length);
});

test('saved pictures are named with the date, with leading zeros', () => {
  assert.equal(filenameForDate(new Date(2026, 0, 5)), 'caleb-drawing-2026-01-05.png');
});

test('other pages can name their pictures too', () => {
  assert.equal(filenameForDate(new Date(2026, 9, 2), 'build'), 'caleb-build-2026-10-02.png');
});
