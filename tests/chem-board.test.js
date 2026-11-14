/**
 * chem-board.test.js — checks the chemistry board (js/chem/board.js):
 * six-sided cells where each one touches six others, atoms grab hands
 * with touching neighbors, bonds can be tapped up to triple, sulfur and
 * phosphorus grow extra hands, finished and stuck atoms are found, and a
 * molecule built any way round gets the same label.
 *
 * Board pictures in these tests: one string per row, '.' for an empty
 * cell. Every other row (row 1, 3, …) is pushed half a cell right on the
 * real board, so those rows are written with a space in front. Spaces
 * are only for our eyes: build() skips them.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  APART, boardSize, cellAtPoint, cellCentre, createBoard, findGroups, freeHands, groupGraph, groupLayout,
  neighbors, newlyFinished, placeAtom, removeAtom, tapAtom, tapBond,
} from '../js/chem/board.js';
import { canonLabel } from '../js/chem/canon.js';
import { parseSmiles } from '../js/chem/smiles.js';

/** Letters for two-letter atoms in the board pictures. */
const LETTERS = { L: 'Cl', R: 'Br', Z: 'Si' };

/**
 * Make an 8×6 board and place atoms from a little picture (see the top).
 * @param {string[]} rows - e.g. ['HOH']
 * @returns {ReturnType<typeof createBoard>} the board
 */
function build(rows) {
  const board = createBoard(8, 6);
  rows.forEach((row, y) => [...row.replaceAll(' ', '')].forEach((ch, x) => {
    if (ch !== '.') placeAtom(board, at(x, y), LETTERS[ch] ?? ch);
  }));
  return board;
}

/**
 * The cell number of (x, y) on an 8-wide board.
 * @param {number} x - across
 * @param {number} y - down
 * @returns {number} the cell number
 */
const at = (x, y) => y * 8 + x;

/**
 * The label of a SMILES string.
 * @param {string} smiles - e.g. 'O'
 * @returns {string} its label
 */
const label = (smiles) => canonLabel(parseSmiles(smiles));

/**
 * The label of the only finished group on a board.
 * @param {ReturnType<typeof createBoard>} board - the board
 * @returns {string} its label
 */
function finishedLabel(board) {
  const finished = findGroups(board).filter((g) => g.finished);
  assert.equal(finished.length, 1, 'exactly one finished group');
  return canonLabel(groupGraph(board, finished[0].cells));
}

/**
 * Put an atom next to `cell`, in an empty cell where no OTHER atom with a
 * free hand could grab it (so it's sure to hold hands with `cell`).
 * @param {ReturnType<typeof createBoard>} board - the board
 * @param {number} cell - the atom to hold
 * @param {string} el - the atom to place, like 'H'
 * @returns {number} where it went
 */
function placeBeside(board, cell, el) {
  const spot = neighbors(board, cell).map((n) => n.cell).find((c) => !board.atoms[c]
    && neighbors(board, c).every((n) => n.cell === cell || !board.atoms[n.cell] || freeHands(board, n.cell) === 0));
  assert.notEqual(spot, undefined, `room beside ${cell}`);
  placeAtom(board, spot, el);
  return spot;
}

/**
 * Fill every free hand of these atoms with H's.
 * @param {ReturnType<typeof createBoard>} board - the board
 * @param {number[]} cells - the atoms
 * @returns {void}
 */
function addHydrogens(board, cells) {
  for (const cell of cells) while (freeHands(board, cell) > 0) placeBeside(board, cell, 'H');
}

test('each cell touches six others: left, right, two above, two below', () => {
  const board = createBoard(8, 6);
  const cellsAround = (x, y) => neighbors(board, at(x, y)).map((n) => n.cell).sort((a, b) => a - b);
  // Row 2 is not pushed: the cells above and below are up/down-LEFT and straight up/down.
  assert.deepEqual(cellsAround(3, 2), [at(2, 1), at(3, 1), at(2, 2), at(4, 2), at(2, 3), at(3, 3)]);
  // Row 1 is pushed right: the cells above and below are straight and up/down-RIGHT.
  assert.deepEqual(cellsAround(3, 1), [at(3, 0), at(4, 0), at(2, 1), at(4, 1), at(3, 2), at(4, 2)]);
  // Corners and edges have fewer.
  assert.deepEqual(cellsAround(0, 0), [at(1, 0), at(0, 1)]);
  assert.deepEqual(cellsAround(7, 1), [at(7, 0), at(6, 1), at(7, 2)]);
});

test('H–O–H in a row is water, and it is finished', () => {
  assert.equal(finishedLabel(build(['HOH'])), label('O'));
});

test('water built bent, turned, or somewhere else gets the same label', () => {
  const water = label('O');
  assert.equal(finishedLabel(build(['.H..', ' .O..', '..H.'])), water);
  assert.equal(finishedLabel(build(['....', ' ....', '..H.', ' .O.', '.H..'])), water);
  assert.equal(finishedLabel(build(['....', ' ..HO', '....H'])), water);
});

test('a lone atom, or an atom with free hands, is not finished', () => {
  assert.equal(findGroups(build(['H'])).some((g) => g.finished), false);
  assert.equal(findGroups(build(['HO'])).some((g) => g.finished), false);
});

test('two H atoms make hydrogen gas', () => {
  assert.equal(finishedLabel(build(['HH'])), 'H2');
});

test('full atoms touching each other do not bond', () => {
  const groups = findGroups(build(['HOH', ' HOH']));
  assert.equal(groups.length, 2);
  assert.ok(groups.every((g) => g.finished));
});

test('three atoms that all touch close a ring of 3 by themselves (cyclopropane)', () => {
  const board = createBoard(8, 6);
  const ring = [at(3, 2), at(4, 2), at(3, 3)]; // row 3 is pushed: (3,3) touches both
  for (const cell of ring) placeAtom(board, cell, 'C');
  assert.equal(groupGraph(board, ring).bonds.length, 3);
  addHydrogens(board, ring);
  assert.equal(finishedLabel(board), label('C1CC1'));
});

test('benzene is a hexagon of carbons around one empty cell, with no bond across the middle', () => {
  const board = createBoard(8, 6);
  const middle = at(3, 2);
  const ring = neighbors(board, middle).map((n) => n.cell);
  for (const cell of ring) placeAtom(board, cell, 'C');
  assert.equal(groupGraph(board, ring).bonds.length, 6); // just the ring
  // Every other bond becomes a double bond, going round the ring.
  const order = [at(2, 1), at(3, 1), at(4, 2), at(3, 3), at(2, 3), at(2, 2)]; // round the middle
  for (let k = 0; k < 6; k += 2) assert.equal(tapBond(board, order[k], order[k + 1]), 2);
  addHydrogens(board, ring);
  assert.equal(finishedLabel(board), label('C1=CC=CC=C1'));
});

test('a ring of 5 needs one middle atom pulled apart from two others (cyclopentane)', () => {
  // a b c in a row, d e above them: the ring is a-b-c-e-d. b touches d and e too.
  const board = createBoard(8, 6);
  const [a, b, c, d, e] = [at(1, 3), at(2, 3), at(3, 3), at(2, 2), at(3, 2)];
  for (const cell of [a, b, c, d, e]) placeAtom(board, cell, 'C');
  assert.equal(groupGraph(board, [a, b, c, d, e]).bonds.length, 7); // the 5 ring bonds, and b–d, b–e
  assert.equal(tapBond(board, b, d), APART); // b's hands were all full: straight to apart
  assert.equal(tapBond(board, b, e), 2); // now b and e both have a free hand: a double bond first…
  assert.equal(tapBond(board, b, e), APART); // …and the next tap pulls them apart
  addHydrogens(board, [a, c, d, e, b]); // b last: the cells under it touch a and c too
  assert.equal(finishedLabel(board), label('C1CCCC1'));
});

test('tapping a bond: single → double, then apart when it cannot go higher, then joined again', () => {
  const board = build(['OO']);
  assert.equal(tapBond(board, at(0, 0), at(1, 0)), 2); // O=O
  assert.equal(finishedLabel(board), label('O=O'));
  assert.equal(tapBond(board, at(0, 0), at(1, 0)), APART); // O has only 2 hands
  assert.equal(freeHands(board, at(0, 0)), 2);
  assert.equal(findGroups(board).length, 2); // two lone O atoms now
  assert.equal(tapBond(board, at(0, 0), at(1, 0)), 1);
});

test('nitrogen gas needs a triple bond', () => {
  const board = build(['NN']);
  tapBond(board, at(0, 0), at(1, 0));
  assert.equal(tapBond(board, at(0, 0), at(1, 0)), 3);
  assert.equal(finishedLabel(board), label('N#N'));
  assert.equal(tapBond(board, at(0, 0), at(1, 0)), APART);
});

test('tapping an empty cell or atoms that do not touch does nothing', () => {
  const board = build(['O.O']);
  assert.equal(tapBond(board, at(0, 0), at(1, 0)), 0);
  assert.equal(tapBond(board, at(0, 0), at(2, 0)), 0);
});

test('apart atoms stay apart, even with free hands, until tapped again', () => {
  const board = build(['HH']);
  assert.equal(tapBond(board, at(0, 0), at(1, 0)), APART); // H–H can't take a second stick
  placeAtom(board, at(6, 4), 'O'); // any change re-runs auto-bond
  assert.equal(freeHands(board, at(0, 0)), 1);
  removeAtom(board, at(1, 0)); // taking an atom away forgets "apart"
  placeAtom(board, at(1, 0), 'H');
  assert.equal(finishedLabel(board), 'H2');
});

test('a full pair that was never joined can be marked apart, and an apart pair with no free hands stays apart', () => {
  const board = build(['HOH', ' HOH']);
  assert.equal(tapBond(board, at(1, 0), at(1, 1)), APART);
  assert.equal(tapBond(board, at(1, 0), at(1, 1)), APART); // both full: can't join
});

test('pulling a bond apart lets the freed hands grab a neighbor', () => {
  // H–H on top, with another H under them (it touches both, but they're taken).
  const board = build(['HH', ' H.']);
  assert.equal(findGroups(board).filter((g) => g.finished).length, 1);
  tapBond(board, at(0, 0), at(1, 0)); // apart → the top-left H grabs the H below it
  const finished = findGroups(board).filter((g) => g.finished);
  assert.deepEqual(finished.map((g) => g.cells), [[at(0, 0), at(0, 1)]]);
});

test('removing an atom frees its neighbors, who grab other hands', () => {
  const board = build(['HH', ' H.']);
  removeAtom(board, at(1, 0));
  assert.equal(finishedLabel(board), 'H2');
  assert.equal(removeAtom(board, at(5, 5)), false);
});

test('sulfur grows hands 2 → 4 → 6 → 2, phosphorus 3 → 5 → 3; other atoms can’t', () => {
  const board = build(['S.P.C']);
  assert.deepEqual([1, 2, 3].map(() => tapAtom(board, at(0, 0))), [4, 6, 2]);
  assert.deepEqual([1, 2].map(() => tapAtom(board, at(2, 0))), [5, 3]);
  assert.equal(tapAtom(board, at(4, 0)), 0);
  assert.equal(tapAtom(board, at(1, 0)), 0); // an empty cell
  tapAtom(board, at(0, 0));
  assert.equal(freeHands(board, at(0, 0)), 4);
  removeAtom(board, at(0, 0)); // a new atom in that cell starts with its usual hands
  placeAtom(board, at(0, 0), 'S');
  assert.equal(freeHands(board, at(0, 0)), 2);
});

test('sulfur hexafluoride: a sulfur with 6 hands and 6 F all around it; its hands can’t shrink while held', () => {
  const board = createBoard(8, 6);
  const s = at(3, 2);
  placeAtom(board, s, 'S');
  tapAtom(board, s);
  tapAtom(board, s);
  for (const { cell } of neighbors(board, s)) placeAtom(board, cell, 'F');
  assert.equal(finishedLabel(board), label('FS(F)(F)(F)(F)F'));
  assert.equal(tapAtom(board, s), 0); // back to 2 would drop 4 held hands: not allowed
  assert.equal(freeHands(board, s), 0);
});

test('sulfuric acid: a sulfur with 6 hands, two double-bonded O and two O–H', () => {
  const board = createBoard(8, 6);
  const s = at(3, 2);
  placeAtom(board, s, 'S');
  tapAtom(board, s);
  tapAtom(board, s);
  for (const o of [at(2, 2), at(2, 1)]) { // two O=S
    placeAtom(board, o, 'O');
    assert.equal(tapBond(board, s, o), 2);
  }
  for (const o of [at(2, 3), at(3, 3)]) { // two O–H
    placeAtom(board, o, 'O');
    addHydrogens(board, [o]);
  }
  assert.equal(finishedLabel(board), label('OS(=O)(=O)O'));
});

test('a free hand with no room left is stuck', () => {
  const methane = createBoard(8, 6);
  placeAtom(methane, at(3, 2), 'C');
  addHydrogens(methane, [at(3, 2)]);
  assert.deepEqual(findGroups(methane)[0].stuck, []); // finished: nothing free

  // A 2×1 board: C next to H. The C still has 3 free hands, but there's
  // nowhere left for anything to hold them.
  const board = createBoard(2, 1);
  placeAtom(board, 0, 'C');
  placeAtom(board, 1, 'H');
  assert.deepEqual(findGroups(board)[0].stuck, [0]);

  // A free hand next to an empty cell is not stuck.
  assert.deepEqual(findGroups(build(['HO.']))[0].stuck, []);
});

test('newlyFinished cheers only for groups that just finished', () => {
  const board = build(['HOH']);
  const before = findGroups(board);
  placeAtom(board, at(5, 5), 'H');
  assert.deepEqual(newlyFinished(before, findGroups(board)), []);
  const before2 = findGroups(board);
  placeAtom(board, at(4, 5), 'H');
  assert.equal(newlyFinished(before2, findGroups(board)).length, 1);
});

test('groupLayout cuts out a small picture, and keeps which rows are pushed right', () => {
  // Water on rows 1 and 2: its top row is a pushed row.
  const board = build(['....', ' .HO.', '...H']);
  const group = findGroups(board).find((g) => g.finished);
  const small = groupLayout(board, group.cells);
  assert.equal(small.width, 3);
  assert.equal(small.height, 2);
  assert.equal(small.shift, 1);
  assert.deepEqual(small.atoms, ['H', 'O', null, null, null, 'H']);
  assert.equal(small.right[0], 1); // H–O
  assert.equal(small.downRight[1], 1); // O down-right to the second H (only true if row 0 is pushed)
  assert.equal(canonLabel(groupGraph(small, [0, 1, 5])), label('O'));
});

test('one finger-drag can finish two molecules at once, and both are new', () => {
  const board = createBoard(8, 6);
  const before = findGroups(board);
  for (let x = 0; x < 4; x += 1) placeAtom(board, at(x, 0), 'H');
  assert.equal(newlyFinished(before, findGroups(board)).length, 2);
});

test('cell middles and finding the cell under a point', () => {
  const board = createBoard(8, 6);
  assert.deepEqual(cellCentre(board, at(0, 0)), [0.5, 0.5]);
  assert.deepEqual(cellCentre(board, at(0, 1)).map((v) => v.toFixed(3)), ['1.000', (0.5 + Math.sqrt(3) / 2).toFixed(3)]);
  for (let i = 0; i < 48; i += 1) assert.equal(cellAtPoint(board, ...cellCentre(board, i)), i);
  assert.equal(cellAtPoint(board, -1, 0.5), null);
  assert.equal(cellAtPoint(board, 0.1, 0.5 + Math.sqrt(3) / 2), null); // the half-cell gap before a pushed row
  const size = boardSize(board);
  assert.equal(size.width, 8.5);
  assert.ok(Math.abs(size.height - (5 * Math.sqrt(3) / 2 + 1)) < 1e-9);
});
