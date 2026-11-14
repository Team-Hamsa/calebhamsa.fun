/**
 * board.js — the chemistry room's board, and the rules for holding hands.
 *
 * The board is made of six-sided cells, in rows, like a honeycomb:
 *
 *    ⬡ ⬡ ⬡ ⬡ ⬡        every other row is pushed half a cell to the
 *     ⬡ ⬡ ⬡ ⬡ ⬡       right, so each cell touches SIX others: left,
 *    ⬡ ⬡ ⬡ ⬡ ⬡        right, two above and two below.
 *
 * (Each cell's middle is a corner of little triangles, so we call it the
 * triangle board.) A cell is empty (null) or holds one atom, like 'O'.
 * Atoms only hold hands with the atoms touching them. Six neighbors means
 * rings of ANY size can be built: 3, 5 (like in DMT) and 6 (benzene is a
 * hexagon around one empty cell).
 *
 * Cells are numbered row by row: i = x + y × width. Bonds are kept in
 * three lists, each going "forward" from a cell:
 *
 *   right[i]      sticks joining cell i to the cell on its right
 *   downLeft[i]   sticks joining cell i to the cell below it, on the left
 *   downRight[i]  sticks joining cell i to the cell below it, on the right
 *
 * 0 means no sticks yet. APART (−1) means Caleb pulled those two atoms
 * apart with the bond tool, so they stay unjoined even with free hands
 * (that's how a ring of 5 can be a ring, and not grab across the middle).
 *
 * extra[i] is how many extra hands a sulfur or phosphorus atom has grown
 * (tapAtom): 0, 2 or 4.
 *
 * The big rule ("auto-bond"): whenever anything changes, any two
 * touching atoms that both still have a free hand grab hands.
 *
 * A "group" is atoms joined by sticks. A group is FINISHED when every
 * hand in it is holding another hand. A free hand is STUCK when there's
 * no room left next to its atom for anything to hold it.
 *
 * Nothing in here touches the web page, so the tests can use it all.
 */
import { HAND_STEPS, HANDS } from './smiles.js';

/**
 * How big the board is, in cells.
 * 🧪 Try this! A bigger board fits bigger molecules (the cells get smaller).
 *    (tools/chem-db/export.py checks molecules fit this size: change it there too.)
 */
export const BOARD_WIDTH = 12;
export const BOARD_HEIGHT = 10;

/**
 * How far apart rows are, in cells. Rows of a honeycomb overlap a bit:
 * three touching cells make a triangle with all sides 1, and its height
 * is √3 ÷ 2 ≈ 0.87.
 */
export const ROW_STEP = Math.sqrt(3) / 2;

/** The most sticks one bond can have (a triple bond). */
const MAX_ORDER = 3;

/** A bond value meaning "pulled apart: don't grab hands here". */
export const APART = -1;

/**
 * Make an empty board.
 * @param {number} [width] - cells across
 * @param {number} [height] - cells down
 * @param {number} [shift] - 1 if the TOP row is pushed right (book pictures
 *   cut from an odd row need this); 0 for the main board
 * @returns {{width: number, height: number, shift: number, atoms: (string|null)[], right: number[], downLeft: number[], downRight: number[], extra: number[]}}
 */
export function createBoard(width = BOARD_WIDTH, height = BOARD_HEIGHT, shift = 0) {
  const size = width * height;
  return {
    width,
    height,
    shift,
    atoms: new Array(size).fill(null),
    right: new Array(size).fill(0),
    downLeft: new Array(size).fill(0),
    downRight: new Array(size).fill(0),
    extra: new Array(size).fill(0),
  };
}

/**
 * Is row y pushed half a cell to the right?
 * @param {{shift: number}} board - the board
 * @param {number} y - the row
 * @returns {boolean} true for pushed rows
 */
function pushed(board, y) {
  return (y + board.shift) % 2 === 1;
}

/**
 * The cells touching cell i that come AFTER it ("forward"): right,
 * down-left, down-right. Each comes with the list its bond lives in.
 * @param {ReturnType<typeof createBoard>} board - the board
 * @param {number} i - a cell
 * @returns {{cell: number, list: number[]}[]} up to 3, in that order
 */
function forward(board, i) {
  const { width, height } = board;
  const x = i % width;
  const y = Math.floor(i / width);
  const list = [];
  if (x < width - 1) list.push({ cell: i + 1, list: board.right });
  if (y < height - 1) {
    const left = pushed(board, y) ? x : x - 1; // the cell below-left's x
    if (left >= 0) list.push({ cell: i + width + left - x, list: board.downLeft });
    if (left + 1 < width) list.push({ cell: i + width + left + 1 - x, list: board.downRight });
  }
  return list;
}

/**
 * Every cell touching cell i, with where the bond between them lives.
 * @param {ReturnType<typeof createBoard>} board - the board
 * @param {number} i - a cell
 * @returns {{cell: number, list: number[], at: number}[]} up to 6
 */
function around(board, i) {
  const { width } = board;
  const x = i % width;
  const y = Math.floor(i / width);
  const list = forward(board, i).map(({ cell, list: bonds }) => ({ cell, list: bonds, at: i }));
  // The ones BEFORE it: left, and the two above. Their bond is in THEIR forward lists.
  const before = [];
  if (x > 0) before.push(i - 1);
  if (y > 0) {
    const left = pushed(board, y) ? x : x - 1;
    if (left >= 0) before.push(i - board.width + left - x);
    if (left + 1 < width) before.push(i - board.width + left + 1 - x);
  }
  for (const cell of before) {
    const slot = forward(board, cell).find((f) => f.cell === i);
    list.push({ cell, list: slot.list, at: cell });
  }
  return list;
}

/**
 * The cells touching cell i, with how many sticks join each one to i.
 * @param {ReturnType<typeof createBoard>} board - the board
 * @param {number} i - a cell number (row by row: x + y × width)
 * @returns {{cell: number, order: number}[]} up to 6 neighbors that are on the board
 */
export function neighbors(board, i) {
  return around(board, i).map(({ cell, list, at }) => ({ cell, order: list[at] }));
}

/**
 * Do two cells touch?
 * @param {ReturnType<typeof createBoard>} board - the board
 * @param {number} a - one cell
 * @param {number} b - the other cell
 * @returns {boolean} true if they're side by side
 */
export function touching(board, a, b) {
  return bondSlot(board, a, b) !== null;
}

/**
 * How many hands an atom has (sulfur and phosphorus may have grown more).
 * @param {ReturnType<typeof createBoard>} board - the board
 * @param {number} i - the atom's cell
 * @returns {number} hands (0 for an empty cell)
 */
export function handsOf(board, i) {
  const el = board.atoms[i];
  return el ? HANDS[el] + (board.extra?.[i] ?? 0) : 0;
}

/**
 * How many of an atom's hands aren't holding anything.
 * @param {ReturnType<typeof createBoard>} board - the board
 * @param {number} i - the atom's cell
 * @returns {number} free hands (0 for an empty cell)
 */
export function freeHands(board, i) {
  if (!board.atoms[i]) return 0;
  const used = neighbors(board, i).reduce((sum, { order }) => sum + Math.max(order, 0), 0);
  return handsOf(board, i) - used;
}

/**
 * Find which list and spot hold the bond between two touching cells.
 * @param {ReturnType<typeof createBoard>} board - the board
 * @param {number} a - one cell
 * @param {number} b - the other cell
 * @returns {{list: number[], at: number}|null} where the bond lives, or null if they don't touch
 */
function bondSlot(board, a, b) {
  if (a < 0 || b < 0 || a >= board.atoms.length || b >= board.atoms.length) return null;
  const [low, high] = a < b ? [a, b] : [b, a];
  const slot = forward(board, low).find((f) => f.cell === high);
  return slot ? { list: slot.list, at: low } : null;
}

/**
 * The auto-bond rule: touching atoms with free hands grab hands.
 * Goes row by row, left to right; each atom tries its right neighbor,
 * then down-left, then down-right. (Always the same order, so the same
 * board always bonds the same way.)
 * @param {ReturnType<typeof createBoard>} board - the board (changed in place)
 * @returns {void}
 */
export function autoBond(board) {
  for (let i = 0; i < board.atoms.length; i += 1) {
    if (!board.atoms[i]) continue;
    for (const { cell: other, list } of forward(board, i)) {
      if (!board.atoms[other]) continue;
      if (list[i] === 0 && freeHands(board, i) > 0 && freeHands(board, other) > 0) list[i] = 1;
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
  board.extra[i] = 0;
  for (const { list, at } of around(board, i)) list[at] = 0;
  autoBond(board);
  return true;
}

/**
 * Tap a sulfur or phosphorus atom itself with the bond tool: it grows two
 * more hands (S 2 → 4 → 6 → back to 2; P 3 → 5 → back to 3). Going back
 * down only works if the hands it loses aren't holding anything.
 * 🧪 Try this! Sulfuric acid is an S with 6 hands: 2 double bonds to O,
 *    and 2 single bonds to O–H.
 * @param {ReturnType<typeof createBoard>} board - the board (changed in place)
 * @param {number} i - the atom's cell
 * @returns {number} its new number of hands, or 0 if nothing changed
 *   (not S or P, or the hands it would lose are holding on)
 */
export function tapAtom(board, i) {
  const el = board.atoms[i];
  const steps = HAND_STEPS[el];
  if (!steps) return 0;
  const hands = handsOf(board, i);
  const next = steps[(steps.indexOf(hands) + 1) % steps.length];
  const holding = hands - freeHands(board, i);
  if (holding > next) return 0;
  board.extra[i] = next - HANDS[el];
  autoBond(board);
  return next;
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
 * @param {number} b - the other atom's cell, touching it
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
 * touching it is the board's edge or an atom with no free hands.)
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
    for (const { cell: other, list } of forward(board, cell)) {
      if (list[cell] > 0 && number.has(other)) bonds.push({ a: number.get(cell), b: number.get(other), order: list[cell] });
    }
  }
  return { atoms, bonds };
}

/**
 * Every bond with sticks on the board (for drawing them).
 * @param {ReturnType<typeof createBoard>} board - the board
 * @returns {{a: number, b: number, order: number}[]} the two cells and how many sticks
 */
export function stickList(board) {
  const sticks = [];
  board.atoms.forEach((el, i) => {
    if (!el) return;
    for (const { cell, list } of forward(board, i)) if (list[i] > 0 && board.atoms[cell]) sticks.push({ a: i, b: cell, order: list[i] });
  });
  return sticks;
}

/**
 * Cut a group out of the board as a small picture of itself, for the
 * collection book: just the rows and columns around it, with its atoms
 * and sticks. The little board remembers whether its top row is pushed
 * right (shift), so every stick still points at the right atom.
 * @param {ReturnType<typeof createBoard>} board - the board
 * @param {number[]} cells - the group's cells
 * @returns {ReturnType<typeof createBoard>} a little board holding only this group
 */
export function groupLayout(board, cells) {
  const xs = cells.map((i) => i % board.width);
  const ys = cells.map((i) => Math.floor(i / board.width));
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  const small = createBoard(Math.max(...xs) - left + 1, Math.max(...ys) - top + 1, (top + board.shift) % 2);
  /**
   * Where a big-board cell goes on the little board.
   * @param {number} i - a cell on the big board
   * @returns {number} the cell on the little board
   */
  const move = (i) => (Math.floor(i / board.width) - top) * small.width + (i % board.width) - left;
  const inGroup = new Set(cells);
  for (const i of cells) {
    small.atoms[move(i)] = board.atoms[i];
    small.extra[move(i)] = board.extra[i];
    for (const { cell, list } of forward(board, i)) {
      if (!inGroup.has(cell)) continue;
      // The same direction on the little board: find it by the moved cells.
      const slot = bondSlot(small, move(i), move(cell));
      slot.list[slot.at] = Math.max(list[i], 0); // an APART pair is just "no sticks" in a picture
    }
  }
  return small;
}

/**
 * Where cell i's middle is, measured in cells from the board's top-left
 * corner (pushed rows are half a cell further right; rows are ROW_STEP apart).
 * @param {{width: number, shift: number}} board - the board
 * @param {number} i - a cell
 * @returns {[number, number]} x and y, in cells
 */
export function cellCentre(board, i) {
  const x = i % board.width;
  const y = Math.floor(i / board.width);
  return [x + 0.5 + (pushed(board, y) ? 0.5 : 0), y * ROW_STEP + 0.5];
}

/**
 * How big a board is, in cells, edge to edge.
 * @param {{width: number, height: number, shift: number}} board - the board
 * @returns {{width: number, height: number}} its size, in cells
 */
export function boardSize(board) {
  const anyPushed = board.height > 1 || board.shift === 1;
  return { width: board.width + (anyPushed ? 0.5 : 0), height: (board.height - 1) * ROW_STEP + 1 };
}

/**
 * Which cell is under a point (the cell whose middle is nearest)?
 * @param {{width: number, height: number, shift: number}} board - the board
 * @param {number} x - in cells from the board's left
 * @param {number} y - in cells from the board's top
 * @returns {number|null} the cell, or null if the point is off the board
 */
export function cellAtPoint(board, x, y) {
  const row = Math.round((y - 0.5) / ROW_STEP);
  let best = null;
  let bestDistance = 1 / Math.sqrt(3) + 1e-9; // a hexagon's corner is this far from its middle
  for (let r = row - 1; r <= row + 1; r += 1) {
    if (r < 0 || r >= board.height) continue;
    const col = Math.floor(x - (pushed(board, r) ? 0.5 : 0));
    for (let c = col - 1; c <= col + 1; c += 1) {
      if (c < 0 || c >= board.width) continue;
      const [cx, cy] = cellCentre(board, r * board.width + c);
      const distance = Math.hypot(x - cx, y - cy);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = r * board.width + c;
      }
    }
  }
  return best;
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
