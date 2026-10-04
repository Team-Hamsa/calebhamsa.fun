/**
 * chem-room.test.js — checks the Chemistry page's small helpers
 * (js/chem/room.js) and its drawing (js/chem/chem-art.js), without a screen.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { APART, createBoard, placeAtom } from '../js/chem/board.js';
import { ATOM_INFO, drawBoard } from '../js/chem/chem-art.js';
import { HANDS } from '../js/chem/smiles.js';
import { atomHint, bondPreview, bondTarget, cardWords, fitCellSize, primeSpeech } from '../js/chem/room.js';

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

test('fitCellSize keeps the whole board on screen', () => {
  assert.equal(fitCellSize(1200, 900, 12, 9), 100);
  assert.equal(fitCellSize(600, 900, 12, 9), 50);
  assert.equal(fitCellSize(5, 5, 12, 9), 1);
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

test('bondTarget picks the gap nearest the finger, between two atoms', () => {
  // 10-px cells on a 4×3 board; atoms at (1,1)=5, its right (6) and below (9).
  const board = boardWith(4, 3, { 5: 'C', 6: 'C', 9: 'C' });
  assert.deepEqual(bondTarget(19, 15, 10, board), [5, 6]); // right edge of (1,1)
  assert.deepEqual(bondTarget(15, 19, 10, board), [5, 9]); // bottom edge
  assert.deepEqual(bondTarget(24, 15, 10, board), [5, 6]); // middle of the right atom: its only gap
  assert.deepEqual(bondTarget(11, 17, 10, board), [5, 9]); // its empty left side: its nearest real gap
  assert.equal(bondTarget(5, 15, 10, board), null); // the empty cell to its left: too far from any gap
  assert.equal(bondTarget(35, 5, 10, board), null); // far from any atoms
  assert.equal(bondTarget(-3, 5, 10, board), null); // off the board
});

test('bondTarget: a tap on an atom with ONE neighbor means that neighbor', () => {
  // The old aim picked a side by a hair's width, and often hit an empty cell.
  const board = boardWith(3, 3, { 4: 'O', 1: 'O' }); // middle, and above it
  for (const [x, y] of [[15, 15], [13, 17], [17, 13], [18, 16]]) {
    assert.deepEqual(bondTarget(x, y, 10, board), [1, 4], `${x},${y}`);
  }
});

test('bondTarget: sliding from one atom onto its neighbor means those two', () => {
  const board = boardWith(3, 3, { 4: 'C', 1: 'C', 5: 'C', 7: 'C' });
  // Started on the middle (4), now on the right one (5), near the gap below it.
  assert.deepEqual(bondTarget(25, 19, 10, board, 4), [4, 5]);
  assert.deepEqual(bondTarget(15, 25, 10, board, 4), [4, 7]); // slid down
  // Still on the start atom: the nearest gap, as for a tap.
  assert.deepEqual(bondTarget(15, 11, 10, board, 4), [1, 4]);
  // Slid onto an empty corner: no slide pair, so the nearest gap again.
  assert.deepEqual(bondTarget(21, 21, 10, board, 4), [4, 5]);
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
  for (const el of Object.keys(HANDS)) {
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
