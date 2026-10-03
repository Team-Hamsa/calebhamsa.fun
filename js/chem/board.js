/**
 * board.js — the chemistry room's grid, and the rules for holding hands.
 *
 * The board is a grid of cells. A cell is empty (null) or holds one atom,
 * like 'O'. Atoms only hold hands with the atoms right beside them (left,
 * right, above, below — never diagonal). Bonds are kept in two lists:
 *
 *   right[i]  how many sticks join cell i to the cell on its right
 *   down[i]   how many sticks join cell i to the cell below it
 *
 * 0 means no sticks yet. APART (−1) means Caleb pulled those two atoms
 * apart with the bond tool, so they stay unjoined even with free hands
 * (that's how a ring of 6 can be a ring, and not grab across the middle).
 *
 * The big rule ("auto-bond"): whenever anything changes, any two
 * side-by-side atoms that both still have a free hand grab hands.
 *
 * A "group" is atoms joined by sticks. A group is FINISHED when every
 * hand in it is holding another hand. A free hand is STUCK when there's
 * no room left next to its atom for anything to hold it.
 *
 * Nothing in here touches the web page, so the tests can use it all.
 */
import { HANDS } from './smiles.js';

/**
 * How big the board is, in cells.
 * 🧪 Try this! A bigger board fits bigger molecules (the cells get smaller).
 */
export const BOARD_WIDTH = 12;
export const BOARD_HEIGHT = 9;

/** The most sticks one bond can have (a triple bond). */
const MAX_ORDER = 3;

/** A bond value meaning "pulled apart: don't grab hands here". */
export const APART = -1;

/**
 * Make an empty board.
 * @param {number} [width] - cells across
 * @param {number} [height] - cells down
 * @returns {{width: number, height: number, atoms: (string|null)[], right: number[], down: number[]}}
 */
export function createBoard(width = BOARD_WIDTH, height = BOARD_HEIGHT) {
  const size = width * height;
  return {
    width,
    height,
    atoms: new Array(size).fill(null),
    right: new Array(size).fill(0),
    down: new Array(size).fill(0),
  };
}

/**
 * The cells beside cell i, with how many sticks join each one to i.
 * @param {ReturnType<typeof createBoard>} board - the board
 * @param {number} i - a cell number (row by row: x + y × width)
 * @returns {{cell: number, order: number}[]} up to 4 neighbors that are on the board
 */
export function neighbors(board, i) {
  const { width, height } = board;
  const x = i % width;
  const y = Math.floor(i / width);
  const list = [];
  if (x > 0) list.push({ cell: i - 1, order: board.right[i - 1] });
  if (x < width - 1) list.push({ cell: i + 1, order: board.right[i] });
  if (y > 0) list.push({ cell: i - width, order: board.down[i - width] });
  if (y < height - 1) list.push({ cell: i + width, order: board.down[i] });
  return list;
}

/**
 * How many of an atom's hands aren't holding anything.
 * @param {ReturnType<typeof createBoard>} board - the board
 * @param {number} i - the atom's cell
 * @returns {number} free hands (0 for an empty cell)
 */
export function freeHands(board, i) {
  const el = board.atoms[i];
  if (!el) return 0;
  const used = neighbors(board, i).reduce((sum, { order }) => sum + Math.max(order, 0), 0);
  return HANDS[el] - used;
}

/**
 * Find which list and spot hold the bond between two side-by-side cells.
 * @param {ReturnType<typeof createBoard>} board - the board
 * @param {number} a - one cell
 * @param {number} b - the other cell
 * @returns {{list: number[], at: number}|null} where the bond lives, or null if not side by side
 */
function bondSlot(board, a, b) {
  const [low, high] = a < b ? [a, b] : [b, a];
  if (high - low === 1 && low % board.width !== board.width - 1) return { list: board.right, at: low };
  if (high - low === board.width) return { list: board.down, at: low };
  return null;
}

/**
 * The auto-bond rule: side-by-side atoms with free hands grab hands.
 * Goes row by row, left to right; each atom tries its right neighbor,
 * then the one below. (Always the same order, so the same board always
 * bonds the same way.)
 * @param {ReturnType<typeof createBoard>} board - the board (changed in place)
 * @returns {void}
 */
export function autoBond(board) {
  for (let i = 0; i < board.atoms.length; i += 1) {
    if (!board.atoms[i]) continue;
    for (const other of [i + 1, i + board.width]) {
      const slot = bondSlot(board, i, other);
      if (!slot || other >= board.atoms.length || !board.atoms[other]) continue;
      if (slot.list[slot.at] === 0 && freeHands(board, i) > 0 && freeHands(board, other) > 0) {
        slot.list[slot.at] = 1;
      }
    }
  }
}

/**
 * Put an atom in an empty cell, then let atoms grab hands.
 * @param {ReturnType<typeof createBoard>} board - the board (changed in place)
 * @param {number} i - the cell
 * @param {string} el - the atom, like 'O'
 * @returns {boolean} true if it was placed (false if the cell was full)
 */
export function placeAtom(board, i, el) {
  if (board.atoms[i]) return false;
  board.atoms[i] = el;
  autoBond(board);
  return true;
}

/**
 * Take an atom away (and its sticks), then let its old neighbors grab
 * other hands.
 * @param {ReturnType<typeof createBoard>} board - the board (changed in place)
 * @param {number} i - the cell
 * @returns {boolean} true if there was an atom to take away
 */
export function removeAtom(board, i) {
  if (!board.atoms[i]) return false;
  board.atoms[i] = null;
  for (const { cell } of neighbors(board, i)) {
    const slot = bondSlot(board, i, cell);
    slot.list[slot.at] = 0;
  }
  autoBond(board);
  return true;
}

/**
 * Tap between two side-by-side atoms with the bond tool:
 *   joined → one more stick (single → double → triple), if both atoms
 *            have a free hand for it
 *   joined, but can't take another stick → pulled APART (their hands
 *            let go, and may grab someone else)
 *   apart  → join again with one stick, if both have a free hand
 * Two atoms that never joined (both hands full) can be pulled apart too,
 * so they won't grab each other later.
 * @param {ReturnType<typeof createBoard>} board - the board (changed in place)
 * @param {number} a - one atom's cell
 * @param {number} b - the other atom's cell, right beside it
 * @returns {number} the new bond value: 1–3 sticks, APART, or 0 if nothing happened
 */
export function tapBond(board, a, b) {
  const slot = bondSlot(board, a, b);
  if (!slot || !board.atoms[a] || !board.atoms[b]) return 0;
  const order = slot.list[slot.at];
  const roomForOne = freeHands(board, a) > 0 && freeHands(board, b) > 0;
  if (order === APART) {
    if (!roomForOne) return APART;
    slot.list[slot.at] = 1;
  } else if (order > 0 && order < MAX_ORDER && roomForOne) {
    slot.list[slot.at] = order + 1;
  } else {
    slot.list[slot.at] = APART;
  }
  autoBond(board);
  return slot.list[slot.at];
}

/**
 * Is this atom's free hand stuck? (It has a free hand, but every cell
 * beside it is the board's edge or an atom with no free hands.)
 * @param {ReturnType<typeof createBoard>} board - the board
 * @param {number} i - the atom's cell
 * @returns {boolean} true if stuck
 */
export function isStuck(board, i) {
  if (freeHands(board, i) === 0) return false;
  return neighbors(board, i).every(({ cell }) => board.atoms[cell] && freeHands(board, cell) === 0);
}

/**
 * Find every group of atoms joined by sticks.
 * @param {ReturnType<typeof createBoard>} board - the board
 * @returns {{cells: number[], finished: boolean, stuck: number[]}[]}
 *   each group's cells (smallest first), whether every hand is holding,
 *   and which of its atoms are stuck
 */
export function findGroups(board) {
  const seen = new Set();
  const groups = [];
  for (let start = 0; start < board.atoms.length; start += 1) {
    if (!board.atoms[start] || seen.has(start)) continue;
    const cells = [];
    const todo = [start];
    seen.add(start);
    while (todo.length > 0) {
      const i = todo.pop();
      cells.push(i);
      for (const { cell, order } of neighbors(board, i)) {
        if (order > 0 && !seen.has(cell)) {
          seen.add(cell);
          todo.push(cell);
        }
      }
    }
    cells.sort((a, b) => a - b);
    const finished = cells.length > 1 && cells.every((i) => freeHands(board, i) === 0);
    groups.push({ cells, finished, stuck: cells.filter((i) => isStuck(board, i)) });
  }
  return groups;
}

/**
 * Turn a group into a molecule graph (the shape canon.js labels).
 * @param {ReturnType<typeof createBoard>} board - the board
 * @param {number[]} cells - the group's cells
 * @returns {{atoms: {el: string}[], bonds: {a: number, b: number, order: number}[]}} the molecule
 */
export function groupGraph(board, cells) {
  const number = new Map(cells.map((cell, k) => [cell, k]));
  const atoms = cells.map((cell) => ({ el: board.atoms[cell] }));
  const bonds = [];
  for (const cell of cells) {
    for (const other of [cell + 1, cell + board.width]) {
      const slot = bondSlot(board, cell, other);
      if (slot && slot.list[slot.at] > 0 && number.has(other)) {
        bonds.push({ a: number.get(cell), b: number.get(other), order: slot.list[slot.at] });
      }
    }
  }
  return { atoms, bonds };
}

/**
 * Cut a group out of the board as a small picture of itself, for the
 * collection book: just the rectangle around it, with its atoms and sticks.
 * @param {ReturnType<typeof createBoard>} board - the board
 * @param {number[]} cells - the group's cells
 * @returns {{width: number, height: number, atoms: (string|null)[], right: number[], down: number[]}}
 *   a little board holding only this group
 */
export function groupLayout(board, cells) {
  const xs = cells.map((i) => i % board.width);
  const ys = cells.map((i) => Math.floor(i / board.width));
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  const small = createBoard(Math.max(...xs) - left + 1, Math.max(...ys) - top + 1);
  const inGroup = new Set(cells);
  for (const i of cells) {
    const j = (Math.floor(i / board.width) - top) * small.width + (i % board.width) - left;
    small.atoms[j] = board.atoms[i];
    // Math.max: an APART pair is just "no sticks" in a picture.
    if (inGroup.has(i + 1) && i % board.width !== board.width - 1) small.right[j] = Math.max(board.right[i], 0);
    if (inGroup.has(i + board.width)) small.down[j] = Math.max(board.down[i], 0);
  }
  return small;
}

/**
 * Which finished groups are NEW: finished now, but that exact set of
 * cells wasn't a finished group before the change. (So loading a saved
 * board, or tapping somewhere else, doesn't cheer for old molecules.)
 * @param {{cells: number[], finished: boolean}[]} before - findGroups() before the change
 * @param {{cells: number[], finished: boolean}[]} after - findGroups() after the change
 * @returns {{cells: number[], finished: boolean}[]} the newly finished groups
 */
export function newlyFinished(before, after) {
  const old = new Set(before.filter((g) => g.finished).map((g) => g.cells.join(',')));
  return after.filter((g) => g.finished && !old.has(g.cells.join(',')));
}
