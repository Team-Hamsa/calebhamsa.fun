/**
 * chem-save.test.js — checks saving the chemistry room (js/chem/save.js):
 * a round trip, storage that isn't allowed, and a broken save.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBoard, placeAtom } from '../js/chem/board.js';
import { WATER, createBook } from '../js/chem/book.js';
import { canonLabel } from '../js/chem/canon.js';
import { BACKUP_KEY, BROKEN_KEY, OLD_KEY, SAVE_KEY, loadState, saveState, squareLayoutGraph } from '../js/chem/save.js';
import { parseSmiles } from '../js/chem/smiles.js';

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
  placeAtom(board, 1, 'S');
  board.extra[1] = 2; // a sulfur with 4 hands
  const book = createBook();
  book.found.push(WATER);
  book.asked.X = { cid: 1, name: 'X' };
  assert.ok(saveState(storage, { board, book }));
  assert.equal(JSON.parse(storage.getItem(SAVE_KEY)).version, 2);
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
  storage.setItem(SAVE_KEY, JSON.stringify({ version: 2, board: null, book: { step: 'two' } }));
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

test('the keys: v2 now, and v1 (from the square board) kept as a backup', () => {
  assert.equal(SAVE_KEY, 'calebhamsa.chem.v2');
  assert.equal(OLD_KEY, 'calebhamsa.chem.v1');
  assert.equal(BACKUP_KEY, 'calebhamsa.chem.v1.backup');
});

/** An old square-board picture: a ring of 10 O atoms (5 across, 2 down). */
const ringOf10 = {
  width: 5,
  height: 2,
  atoms: new Array(10).fill('O'),
  right: [1, 1, 1, 1, 0, 1, 1, 1, 1, 0],
  down: [1, 0, 0, 0, 1, 0, 0, 0, 0, 0],
};

/** An old square-board picture of water. */
const oldWater = { width: 3, height: 1, atoms: ['H', 'O', 'H'], right: [1, 1, 0], down: [0, 0, 0] };

test('squareLayoutGraph reads an old square picture back into a molecule', () => {
  assert.equal(canonLabel(squareLayoutGraph(oldWater)), WATER);
  assert.equal(canonLabel(squareLayoutGraph(ringOf10)), canonLabel(parseSmiles('O1OOOOOOOOO1')));
});

test('a v1 save from the square board moves to v2: every book entry and name kept, the board cleared', () => {
  const storage = fakeStorage();
  const oldBook = {
    step: 4,
    found: [WATER],
    pictures: { [WATER]: oldWater },
    rare: [{ label: 'C2,C3,O1|0-1:1,0-2:1', name: 'Ethanol', layout: oldWater }],
    inventions: [
      { label: 'O0,O0,O0,O0,O0,O0,O0,O0,O0,O0|~0<0:1,0:1>', name: 'Ring Thing', layout: ringOf10 },
      { label: 'O0,O0|~same-old-label-twice', name: 'Invention #1', layout: ringOf10 }, // the same molecule again
      { label: 'O0,O0,O0,O0,O0,O0,O0,O0|0-1:1', name: 'Invention #3', layout: oldWater },
    ],
    pending: [{ label: WATER, layout: oldWater }],
  };
  const v1 = JSON.stringify({ version: 1, board: { width: 12, height: 9, atoms: [], right: [], down: [] }, book: oldBook });
  storage.setItem(OLD_KEY, v1);
  const { board, book } = loadState(storage, 12, 10);
  assert.equal(board.width, 12);
  assert.ok(board.atoms.every((a) => a === null));
  assert.equal(book.step, 4);
  assert.deepEqual(book.found, [WATER]);
  assert.deepEqual(book.pictures[WATER], oldWater); // old pictures stay as they were (drawn the square way)
  assert.deepEqual(book.rare, oldBook.rare);
  assert.deepEqual(book.pending, oldBook.pending);
  assert.deepEqual(book.asked, {});
  // The old quick labels are worked out again from the pictures, exactly.
  assert.deepEqual(book.inventions.map((i) => i.name), ['Ring Thing', 'Invention #3']);
  assert.equal(book.inventions[0].label, canonLabel(parseSmiles('O1OOOOOOOOO1')));
  assert.equal(storage.getItem(BACKUP_KEY), v1);
  // Saving writes v2; the next load reads v2 (and doesn't migrate again).
  saveState(storage, { board, book });
  assert.deepEqual(loadState(storage, 12, 10).book, book);
});
