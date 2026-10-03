/**
 * chem-room.test.js — checks the Chemistry page's small helpers
 * (js/chem/room.js) and its drawing (js/chem/chem-art.js), without a screen.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBoard, placeAtom } from '../js/chem/board.js';
import { ATOM_INFO, drawBoard } from '../js/chem/chem-art.js';
import { HANDS } from '../js/chem/smiles.js';
import { atomHint, bondTarget, cardWords, fitCellSize, primeSpeech } from '../js/chem/room.js';

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

test('bondTarget picks the neighbor on the side the finger is nearest', () => {
  // 10-px cells on a 4×3 board; the cell (1,1) is number 5.
  assert.deepEqual(bondTarget(19, 15, 10, 4, 3), [5, 6]); // right edge of (1,1)
  assert.deepEqual(bondTarget(11, 15, 10, 4, 3), [5, 4]); // left edge
  assert.deepEqual(bondTarget(15, 11, 10, 4, 3), [5, 1]); // top edge
  assert.deepEqual(bondTarget(15, 19, 10, 4, 3), [5, 9]); // bottom edge
  assert.equal(bondTarget(1, 5, 10, 4, 3), null); // left of the left column: off the board
  assert.equal(bondTarget(-3, 5, 10, 4, 3), null);
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
