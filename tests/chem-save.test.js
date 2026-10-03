/**
 * chem-save.test.js — checks saving the chemistry room (js/chem/save.js):
 * a round trip, storage that isn't allowed, and a broken save.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBoard, placeAtom } from '../js/chem/board.js';
import { WATER, createBook } from '../js/chem/book.js';
import { BROKEN_KEY, SAVE_KEY, loadState, saveState } from '../js/chem/save.js';

/**
 * A pretend localStorage that keeps things in a Map.
 * @returns {Storage} the pretend storage
 */
function fakeStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); },
  };
}

/** A storage that throws on everything, like a locked-down browser. */
const blocked = {
  getItem() { throw new Error('blocked'); },
  setItem() { throw new Error('blocked'); },
};

test('save and load gives back the same board and book', () => {
  const storage = fakeStorage();
  const board = createBoard(4, 3);
  placeAtom(board, 0, 'H');
  placeAtom(board, 1, 'O');
  const book = createBook();
  book.found.push(WATER);
  assert.ok(saveState(storage, { board, book }));
  assert.deepEqual(loadState(storage, 4, 3), { board, book });
});

test('nothing saved yet: a fresh board and book', () => {
  const { board, book } = loadState(fakeStorage(), 4, 3);
  assert.equal(board.atoms.length, 12);
  assert.deepEqual(book, createBook());
});

test('blocked storage never crashes', () => {
  assert.equal(saveState(blocked, { board: createBoard(2, 2), book: createBook() }), false);
  assert.equal(saveState(null, { board: createBoard(2, 2), book: createBook() }), false);
  assert.equal(loadState(blocked, 2, 2).board.atoms.length, 4);
  assert.equal(loadState(null, 2, 2).board.atoms.length, 4);
});

test('a broken save starts fresh and keeps a copy', () => {
  const storage = fakeStorage();
  storage.setItem(SAVE_KEY, '{oops');
  assert.deepEqual(loadState(storage, 2, 2).book, createBook());
  assert.equal(storage.getItem(BROKEN_KEY), '{oops');
  storage.setItem(SAVE_KEY, JSON.stringify({ version: 1, board: null, book: { step: 'two' } }));
  assert.deepEqual(loadState(storage, 2, 2).book, createBook());
});

test('a board saved at another size is dropped, but the book is kept', () => {
  const storage = fakeStorage();
  const book = createBook();
  book.found.push(WATER);
  saveState(storage, { board: createBoard(4, 3), book });
  const loaded = loadState(storage, 5, 3);
  assert.equal(loaded.board.width, 5);
  assert.deepEqual(loaded.book.found, [WATER]);
});
