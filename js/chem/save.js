/**
 * save.js — keeps the chemistry board and the collection book in the
 * browser's storage (localStorage), so closing the iPad loses nothing.
 *
 * It's all saved as one bit of JSON text under SAVE_KEY. Like saves.js
 * on the Build page, every function takes the storage as an argument
 * (so tests can hand in a pretend one) and never crashes: blocked
 * storage just means nothing is saved.
 */
import { createBoard } from './board.js';
import { createBook } from './book.js';

/** The name everything is saved under. */
export const SAVE_KEY = 'calebhamsa.chem.v1';

/** Where a save we couldn't read is kept, so a grown-up could rescue it. */
export const BROKEN_KEY = `${SAVE_KEY}.broken`;

/**
 * Save the board and the book.
 * @param {Storage|null} storage - localStorage (or null if not allowed)
 * @param {{board: object, book: object}} state - what to save
 * @returns {boolean} true if it saved
 */
export function saveState(storage, { board, book }) {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify({ version: 1, board, book }));
    return true;
  } catch {
    return false;
  }
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
  try {
    text = storage.getItem(SAVE_KEY);
  } catch {
    return fresh;
  }
  if (text === null) return fresh;
  try {
    const saved = JSON.parse(text);
    const book = { ...createBook(), ...saved.book };
    const lists = ['found', 'rare', 'inventions', 'pending'];
    const picturesOk = book.pictures && typeof book.pictures === 'object' && !Array.isArray(book.pictures);
    if (saved.version !== 1 || !Number.isInteger(book.step) || !picturesOk || !lists.every((k) => Array.isArray(book[k]))) {
      throw new Error('not a save we know');
    }
    const { board } = saved;
    const size = width * height;
    // A board saved at a different size starts empty, but the book is kept.
    const boardFits = board?.width === width && board?.height === height
      && ['atoms', 'right', 'down'].every((k) => Array.isArray(board[k]) && board[k].length === size);
    return { board: boardFits ? board : createBoard(width, height), book };
  } catch {
    try {
      storage.setItem(BROKEN_KEY, text);
    } catch {
      // Can't keep a copy: that's OK.
    }
    return fresh;
  }
}
