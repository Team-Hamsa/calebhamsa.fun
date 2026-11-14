/**
 * chem-room.test.js — checks the Chemistry page's small helpers
 * (js/chem/room.js) and its drawing (js/chem/chem-art.js), without a screen.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { APART, cellCentre, createBoard, neighbors, placeAtom } from '../js/chem/board.js';
import { ATOM_INFO, drawBoard, pictureSize } from '../js/chem/chem-art.js';
import { ALL_ATOMS } from '../js/chem/book.js';
import { HANDS } from '../js/chem/smiles.js';
import {
  atomHint, atomTarget, bondPreview, bondTarget, cardWords, cellsAlong, fitCellSize, handsPreview, handWords, primeSpeech,
} from '../js/chem/room.js';

/**
 * A pretend canvas "context" that counts drawing calls.
 * @returns {object} the fake context, with a `count` of each call
 */
function fakeContext() {
  const count = {};
  const ctx = new Proxy({ count }, {
    get(target, key) {
      if (key in target) return target[key];
      return (...args) => { count[key] = (count[key] ?? 0) + 1; return args; };
    },
    set(target, key, value) { target[key] = value; return true; },
  });
  return ctx;
}

test('fitCellSize keeps the whole six-sided board on screen', () => {
  const board = createBoard(12, 10); // 12.5 cells across, 1 + 9 × 0.87 ≈ 8.79 cells down
  assert.equal(fitCellSize(1250, 2000, board), 100);
  assert.equal(fitCellSize(5000, 879, board), 99);
  assert.equal(fitCellSize(5, 5, board), 1);
});

/**
 * A little board with atoms put straight in (no auto-bond), for aiming tests.
 * @param {number} width - cells across
 * @param {number} height - cells down
 * @param {Object<number, string>} atoms - cell → atom
 * @returns {ReturnType<typeof createBoard>} the board
 */
function boardWith(width, height, atoms) {
  const board = createBoard(width, height);
  for (const [i, el] of Object.entries(atoms)) board.atoms[i] = el;
  return board;
}

/**
 * Where on a board (in pixels, 10-px cells) a point between two cells' middles is.
 * @param {ReturnType<typeof createBoard>} board - the board
 * @param {number} a - one cell
 * @param {number} b - another cell
 * @param {number} [share] - how far from a towards b (0.5 = halfway)
 * @returns {[number, number]} x and y in pixels
 */
function between(board, a, b, share = 0.5) {
  const [ax, ay] = cellCentre(board, a);
  const [bx, by] = cellCentre(board, b);
  return [(ax + (bx - ax) * share) * 10, (ay + (by - ay) * share) * 10];
}

test('bondTarget picks the gap nearest the finger, between two touching atoms', () => {
  // A 4×3 board (row 1 is pushed right): atoms at 5 = (1,1), its right 6,
  // its below-left 9 = (1,2), and 10 = (2,2), below both 5 and 6.
  const board = boardWith(4, 3, { 5: 'C', 6: 'C', 9: 'C', 10: 'C' });
  assert.deepEqual(bondTarget(...between(board, 5, 6, 0.45), 10, board), [5, 6]);
  assert.deepEqual(bondTarget(...between(board, 5, 9, 0.55), 10, board), [5, 9]);
  assert.deepEqual(bondTarget(...between(board, 6, 10), 10, board), [6, 10]);
  assert.deepEqual(bondTarget(...between(board, 9, 10), 10, board), [9, 10]);
  assert.equal(bondTarget(...cellCentre(board, 0).map((v) => v * 10), 10, board), null); // a far empty corner
  assert.equal(bondTarget(-3, 5, 10, board), null); // off the board
});

test('bondTarget: a tap on an atom with ONE neighbor means that neighbor', () => {
  const board = boardWith(3, 3, { 4: 'O', 1: 'O' }); // middle, and above it (they touch)
  const [x, y] = cellCentre(board, 4).map((v) => v * 10);
  for (const [dx, dy] of [[0, 0], [-2, 2], [2, -2], [3, 1]]) {
    assert.deepEqual(bondTarget(x + dx, y + dy, 10, board), [1, 4], `${dx},${dy}`);
  }
});

test('bondTarget: sliding from one atom onto a touching atom means those two', () => {
  const board = boardWith(4, 3, { 5: 'C', 6: 'C', 9: 'C', 1: 'C' });
  const on = (i) => cellCentre(board, i).map((v) => v * 10);
  assert.deepEqual(bondTarget(...on(6), 10, board, 5), [5, 6]); // slid right
  assert.deepEqual(bondTarget(...on(9), 10, board, 5), [5, 9]); // slid down-left
  assert.deepEqual(bondTarget(...on(9), 10, board, 1), [5, 9]); // 1 and 9 don't touch: nearest gap instead
});

test('atomTarget: the middle of a sulfur or phosphorus atom, not its edge, not other atoms', () => {
  const board = boardWith(3, 2, { 0: 'S', 1: 'C', 2: 'P' });
  const on = (i) => cellCentre(board, i).map((v) => v * 10);
  assert.equal(atomTarget(...on(0), 10, board), 0);
  assert.equal(atomTarget(...on(2), 10, board), 2);
  assert.equal(atomTarget(...on(1), 10, board), null); // carbon can't grow hands
  const [x, y] = on(0);
  assert.equal(atomTarget(x + 4, y, 10, board), null); // near its edge: that's for gaps
});

test('handsPreview says what tapping a sulfur or phosphorus atom will do', () => {
  const board = createBoard(3, 3);
  placeAtom(board, 4, 'S');
  assert.equal(handsPreview(board, 4), 'grow');
  board.extra[4] = 4;
  assert.equal(handsPreview(board, 4), 'shrink');
  const full = createBoard(3, 3);
  placeAtom(full, 4, 'P');
  full.extra[4] = 2;
  for (const { cell } of neighbors(full, 4).slice(0, 5)) placeAtom(full, cell, 'H'); // 5 hands held
  assert.equal(handsPreview(full, 4), 'nothing');
});

test('cellsAlong: a finger sliding along a row passes over each cell once', () => {
  const board = createBoard(6, 2);
  const [x0, y0] = cellCentre(board, 0).map((v) => v * 10);
  const [x1, y1] = cellCentre(board, 5).map((v) => v * 10);
  assert.deepEqual(cellsAlong(board, { x: x0, y: y0 }, { x: x1, y: y1 }, 10), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(cellsAlong(board, { x: x0, y: y0 }, { x: x0, y: y0 }, 10), [0]); // a tap
});

test('handWords: sulfur and phosphorus say they can grow more hands', () => {
  assert.equal(handWords('O'), 'Oxygen has 2 hands.');
  assert.equal(handWords('H'), 'Hydrogen has 1 hand.');
  assert.equal(handWords('P'), 'Phosphorus has 3 hands. Tap it with 🔗 to give it more!');
});

test('bondPreview says what 🔗 will do, without changing the board', () => {
  const board = createBoard(3, 1);
  placeAtom(board, 0, 'O');
  placeAtom(board, 1, 'O'); // O–O
  const copy = structuredClone(board);
  assert.equal(bondPreview(board, 0, 1), 'more'); // → O=O
  assert.deepEqual(board, copy);
  board.right[0] = 2;
  assert.equal(bondPreview(board, 0, 1), 'apart'); // O has only 2 hands
  board.right[0] = APART;
  assert.equal(bondPreview(board, 0, 1), 'join');
  const full = createBoard(3, 1);
  for (const [i, el] of [[0, 'H'], [1, 'H'], [2, 'H']]) placeAtom(full, i, el); // H–H  H
  full.right[1] = APART;
  // H(1) and H(2): H(1)'s hand is already holding H(0), so they can't join.
  assert.equal(bondPreview(full, 1, 2), 'nothing');
});

test('atomHint shows which atoms a molecule needs', () => {
  assert.equal(atomHint('O'), '🔴⚪⚪');
  assert.equal(atomHint('CCCCCCCC'), '⚫×8 ⚪×18');
  assert.equal(atomHint('ClCl'), '🟢🟢');
});

test('cardWords: the name card for each kind of find', () => {
  const water = { kind: 'found', entry: { name: 'Water', fact: 'Wet!' } };
  assert.deepEqual(cardWords(water, { again: false, name: null }), { name: 'Water', badge: '📖', fact: 'Wet!' });
  assert.equal(cardWords(water, { again: true, name: null }).badge, '📖 Found again!');
  assert.equal(cardWords({ kind: 'rare', name: 'Butanone' }, { again: false, name: 'Butanone' }).badge, '🌟 Super rare!');
  assert.equal(cardWords({ kind: 'invention' }, { again: false, name: 'Invention #1' }).name, 'Invention #1');
  assert.equal(cardWords({ kind: 'pending' }, { again: false, name: null }).badge, '⏳');
});

test('every atom has a look, a name and an emoji', () => {
  for (const el of [...Object.keys(HANDS), ...ALL_ATOMS]) {
    assert.ok(ATOM_INFO[el]?.color && ATOM_INFO[el].name && ATOM_INFO[el].emoji, el);
  }
});

test('drawBoard draws a ball for each atom and a stick for each bond', () => {
  const board = createBoard(3, 1);
  for (const [i, el] of [[0, 'H'], [1, 'O'], [2, 'H']]) placeAtom(board, i, el);
  const ctx = fakeContext();
  drawBoard(ctx, board, 40, { grid: false });
  assert.equal(ctx.count.arc, 3); // three balls, no free hands (water is finished)
  assert.equal(ctx.count.fillText, 3); // H, O, H
  const free = fakeContext();
  drawBoard(free, createBoard(1, 1), 40); // empty board: no balls
  assert.equal(free.count.arc, undefined);
});

test('drawBoard shows the 🔗 aim: a glow under the two atoms and a sign in the gap', () => {
  const board = createBoard(3, 1);
  for (const [i, el] of [[0, 'H'], [1, 'O'], [2, 'H']]) placeAtom(board, i, el);
  const ctx = fakeContext();
  drawBoard(ctx, board, 40, { grid: false, aim: { pair: [0, 1], will: 'apart' } });
  assert.equal(ctx.count.fillText, 4); // H, O, H, and ✂️
  const none = fakeContext();
  drawBoard(none, board, 40, { grid: false, aim: { pair: null, will: null } }); // aiming at nothing
  assert.equal(none.count.fillText, 3);
});

test('primeSpeech says one silent word on the first real tap, then stops listening', () => {
  const listeners = new Map();
  const target = {
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: (type) => listeners.delete(type),
  };
  const spoken = [];
  const synth = { speak: (words) => spoken.push(words.text) };
  /** A pretend SpeechSynthesisUtterance. @param {string} text - the words */
  function Words(text) { this.text = text; }
  primeSpeech(target, synth, Words);
  assert.deepEqual([...listeners.keys()].sort(), ['click', 'keydown', 'pointerup', 'touchend']);
  listeners.get('pointerup')();
  assert.deepEqual(spoken, ['']);
  assert.equal(listeners.size, 0); // only once
});

test('primeSpeech does nothing in a browser with no speech', () => {
  const target = { addEventListener: () => assert.fail('should not listen'), removeEventListener() {} };
  primeSpeech(target, undefined, undefined);
});

test('pictureSize: old square book pictures and new six-sided ones', () => {
  const square = { width: 3, height: 2, atoms: [], right: [], down: [] }; // saved before the triangle board
  assert.deepEqual(pictureSize(square, 10), { width: 30, height: 20 });
  assert.deepEqual(pictureSize(createBoard(3, 2), 10), { width: 35, height: Math.ceil(10 * (Math.sqrt(3) / 2 + 1)) });
});

test('drawBoard still draws an old square book picture: balls and sticks', () => {
  const water = { width: 3, height: 1, atoms: ['H', 'O', 'H'], right: [1, 1, 0], down: [0, 0, 0] };
  const ctx = fakeContext();
  drawBoard(ctx, water, 20, { grid: false, hands: false });
  assert.equal(ctx.count.arc, 3);
  assert.equal(ctx.count.stroke > 3, true); // two sticks, and each ball's outline
});

test('drawBoard draws free hands: a lone sulfur with 6 hands has 6 stubs', () => {
  const board = createBoard(3, 3);
  placeAtom(board, 4, 'S');
  board.extra[4] = 4;
  const ctx = fakeContext();
  drawBoard(ctx, board, 40, { grid: false });
  assert.equal(ctx.count.arc, 7); // 6 little hands and the ball
});
