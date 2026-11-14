/**
 * save.js — keeps the chemistry board and the collection book in the
 * browser's storage (localStorage), so closing the iPad loses nothing.
 *
 * It's all saved as one bit of JSON text under SAVE_KEY. Like saves.js
 * on the Build page, every function takes the storage as an argument
 * (so tests can hand in a pretend one) and never crashes: blocked
 * storage just means nothing is saved.
 *
 * Version 1 was the square board. Version 2 is the triangle board. A
 * version 1 save is moved over once (migrateBook): the whole book is
 * kept, the half-built board is cleared (square cells don't fit on the
 * new board), and the old save is kept under BACKUP_KEY, just in case.
 */
import { createBoard } from './board.js';
import { createBook } from './book.js';
import { canonLabel } from './canon.js';

/** The name everything is saved under. */
export const SAVE_KEY = 'calebhamsa.chem.v2';

/** Where the square board's save was. */
export const OLD_KEY = 'calebhamsa.chem.v1';

/** Where the square board's save is kept after moving it over. */
export const BACKUP_KEY = `${OLD_KEY}.backup`;

/** Where a save we couldn't read is kept, so a grown-up could rescue it. */
export const BROKEN_KEY = `${SAVE_KEY}.broken`;

/** The lists a book must have. */
const BOOK_LISTS = ['found', 'rare', 'inventions', 'pending'];

/** The lists a saved board must have, one number (or atom) per cell. */
const BOARD_LISTS = ['atoms', 'right', 'downLeft', 'downRight', 'extra'];

/**
 * Save the board and the book.
 * @param {Storage|null} storage - localStorage (or null if not allowed)
 * @param {{board: object, book: object}} state - what to save
 * @returns {boolean} true if it saved
 */
export function saveState(storage, { board, book }) {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify({ version: 2, board, book }));
    return true;
  } catch {
    return false;
  }
}

/**
 * Is this a book we can use? (Every list there, the step a whole number.)
 * @param {object} book - a book read from a save
 * @returns {boolean} true if it looks right
 */
function bookOk(book) {
  const picturesOk = book.pictures && typeof book.pictures === 'object' && !Array.isArray(book.pictures);
  const askedOk = book.asked && typeof book.asked === 'object' && !Array.isArray(book.asked);
  return Number.isInteger(book.step) && picturesOk && askedOk && BOOK_LISTS.every((k) => Array.isArray(book[k]));
}

/**
 * Load the board and the book. Anything missing or broken starts fresh.
 * @param {Storage|null} storage - localStorage (or null if not allowed)
 * @param {number} width - the board size now, in cells
 * @param {number} height - the board size now, in cells
 * @returns {{board: object, book: object}} the saved state, or a fresh one
 */
export function loadState(storage, width, height) {
  const fresh = { board: createBoard(width, height), book: createBook() };
  let text = null;
  let oldText = null;
  try {
    text = storage.getItem(SAVE_KEY);
    if (text === null) oldText = storage.getItem(OLD_KEY);
  } catch {
    return fresh;
  }
  if (text === null && oldText !== null) return moveOldSave(storage, oldText, fresh);
  if (text === null) return fresh;
  try {
    const saved = JSON.parse(text);
    const book = { ...createBook(), ...saved.book };
    if (saved.version !== 2 || !bookOk(book)) throw new Error('not a save we know');
    const { board } = saved;
    const size = width * height;
    // A board saved at a different size starts empty, but the book is kept.
    const boardFits = board?.width === width && board?.height === height && board.shift === 0
      && BOARD_LISTS.every((k) => Array.isArray(board[k]) && board[k].length === size);
    return { board: boardFits ? board : createBoard(width, height), book };
  } catch {
    keep(storage, BROKEN_KEY, text);
    return fresh;
  }
}

/**
 * Move a square-board (version 1) save over to version 2: keep the book,
 * clear the board, and keep the old save as a backup.
 * @param {Storage} storage - localStorage
 * @param {string} oldText - the version 1 save
 * @param {{board: object, book: object}} fresh - a fresh state, for anything broken
 * @returns {{board: object, book: object}} the moved-over state
 */
function moveOldSave(storage, oldText, fresh) {
  keep(storage, BACKUP_KEY, oldText);
  try {
    const saved = JSON.parse(oldText);
    const book = migrateBook({ ...createBook(), ...saved.book });
    if (saved.version !== 1 || !bookOk(book)) throw new Error('not a save we know');
    return { board: fresh.board, book };
  } catch {
    return fresh; // the backup still has it, for a grown-up to rescue
  }
}

/**
 * Tidy up a square-board book for the triangle board. Big inventions
 * (more than 8 non-H atoms) had quick labels with a "~" in them, which
 * two different molecules could share. Work out each one's exact label
 * again from its picture. If two end up the same, they were the same
 * molecule all along: keep the first.
 * @param {object} book - the old book (changed in place)
 * @returns {object} the same book
 */
export function migrateBook(book) {
  book.asked ??= {};
  for (const list of ['inventions', 'pending']) {
    if (!Array.isArray(book[list])) continue;
    const seen = new Set();
    book[list] = book[list].filter((entry) => {
      if (typeof entry?.label === 'string' && entry.label.includes('|~') && entry.layout) {
        entry.label = canonLabel(squareLayoutGraph(entry.layout));
      }
      if (seen.has(entry.label)) return false;
      seen.add(entry.label);
      return true;
    });
  }
  return book;
}

/**
 * Read an old square-board picture back into a molecule graph: its atoms,
 * and its sticks going right (`right`) and down (`down`).
 * @param {{width: number, atoms: (string|null)[], right: number[], down: number[]}} layout - the picture
 * @returns {{atoms: {el: string}[], bonds: {a: number, b: number, order: number}[]}} the molecule
 */
export function squareLayoutGraph(layout) {
  const number = new Map();
  const atoms = [];
  layout.atoms.forEach((el, i) => {
    if (!el) return;
    number.set(i, atoms.length);
    atoms.push({ el });
  });
  const bonds = [];
  for (const [i, a] of number) {
    const rightCell = (i + 1) % layout.width === 0 ? -1 : i + 1;
    for (const [other, order] of [[rightCell, layout.right[i]], [i + layout.width, layout.down[i]]]) {
      if (order > 0 && number.has(other)) bonds.push({ a, b: number.get(other), order });
    }
  }
  return { atoms, bonds };
}

/**
 * Keep a copy of some text, if storage allows (never crashes).
 * @param {Storage} storage - localStorage
 * @param {string} key - where
 * @param {string} text - what
 * @returns {void}
 */
function keep(storage, key, text) {
  try {
    storage.setItem(key, text);
  } catch {
    // Can't keep a copy: that's OK.
  }
}
