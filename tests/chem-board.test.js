/**
 * chem-board.test.js — checks the chemistry board (js/chem/board.js):
 * atoms grab hands with side-by-side neighbors, bonds can be tapped up
 * to triple, finished and stuck atoms are found, and a molecule built
 * any way round gets the same label.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  APART, createBoard, findGroups, freeHands, groupGraph, groupLayout, newlyFinished, placeAtom, removeAtom, tapBond,
} from '../js/chem/board.js';
import { canonLabel } from '../js/chem/canon.js';
import { parseSmiles } from '../js/chem/smiles.js';

/**
 * Make a board and place atoms from a little picture, one row per string.
 * '.' is an empty cell, and Cl is written 'L'. Atoms go in row by row.
 * @param {string[]} rows - e.g. ['HOH']
 * @returns {ReturnType<typeof createBoard>} the board
 */
function build(rows) {
  const board = createBoard(8, 6);
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch !== '.') placeAtom(board, y * board.width + x, ch === 'L' ? 'Cl' : ch);
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
 * The label of the only finished group on a board.
 * @param {ReturnType<typeof createBoard>} board - the board
 * @returns {string} its label
 */
function finishedLabel(board) {
  const finished = findGroups(board).filter((g) => g.finished);
  assert.equal(finished.length, 1, 'exactly one finished group');
  return canonLabel(groupGraph(board, finished[0].cells));
}

test('H–O–H in a row is water, and it is finished', () => {
  const board = build(['HOH']);
  assert.equal(finishedLabel(board), canonLabel(parseSmiles('O')));
});

test('water built bent, upside down, or somewhere else gets the same label', () => {
  const water = canonLabel(parseSmiles('O'));
  assert.equal(finishedLabel(build(['.H', 'HO'])), water);
  assert.equal(finishedLabel(build(['OH', 'H.'])), water);
  assert.equal(finishedLabel(build(['....', '...H', '...O', '...H'])), water);
});

test('a lone atom, or an atom with free hands, is not finished', () => {
  assert.equal(findGroups(build(['H'])).some((g) => g.finished), false);
  assert.equal(findGroups(build(['HO'])).some((g) => g.finished), false);
});

test('two H atoms make hydrogen gas', () => {
  assert.equal(finishedLabel(build(['HH'])), 'H2');
});

test('full atoms sit side by side without bonding', () => {
  const board = build(['HOH', 'HOH']);
  const groups = findGroups(board);
  assert.equal(groups.length, 2);
  assert.ok(groups.every((g) => g.finished));
});

test('tapping a bond: single → double, then apart when it cannot go higher, then joined again', () => {
  const board = build(['OO']);
  assert.equal(tapBond(board, at(0, 0), at(1, 0)), 2); // O=O
  assert.equal(finishedLabel(board), canonLabel(parseSmiles('O=O')));
  assert.equal(tapBond(board, at(0, 0), at(1, 0)), APART); // O has only 2 hands
  assert.equal(freeHands(board, at(0, 0)), 2);
  assert.equal(findGroups(board).length, 2); // two lone O atoms now
  assert.equal(tapBond(board, at(0, 0), at(1, 0)), 1);
});

test('nitrogen gas needs a triple bond', () => {
  const board = build(['NN']);
  tapBond(board, at(0, 0), at(1, 0));
  assert.equal(tapBond(board, at(0, 0), at(1, 0)), 3);
  assert.equal(finishedLabel(board), canonLabel(parseSmiles('N#N')));
  assert.equal(tapBond(board, at(0, 0), at(1, 0)), APART);
});

test('tapping an empty cell or atoms that are not side by side does nothing', () => {
  const board = build(['O.O']);
  assert.equal(tapBond(board, at(0, 0), at(1, 0)), 0);
  assert.equal(tapBond(board, at(0, 0), at(2, 0)), 0);
});

test('apart atoms stay apart, even with free hands, until tapped again', () => {
  const board = build(['HH']);
  assert.equal(tapBond(board, at(0, 0), at(1, 0)), APART); // H–H can't take a second stick
  placeAtom(board, at(3, 3), 'O'); // any change re-runs auto-bond
  assert.equal(freeHands(board, at(0, 0)), 1);
  removeAtom(board, at(1, 0)); // taking an atom away forgets "apart"
  placeAtom(board, at(1, 0), 'H');
  assert.equal(finishedLabel(board), 'H2');
});

test('a full pair that was never joined can be marked apart, and an apart pair with no free hands stays apart', () => {
  const board = build(['HOH', 'HOH']);
  assert.equal(tapBond(board, at(1, 0), at(1, 1)), APART);
  assert.equal(tapBond(board, at(1, 0), at(1, 1)), APART); // both full: can't join
});

test('pulling a bond apart lets the freed hands grab a neighbor', () => {
  // H–H on top, with another H under the left one (it's alone: its H friend is taken).
  const board = build(['HH', 'H.']);
  assert.equal(findGroups(board).filter((g) => g.finished).length, 1);
  tapBond(board, at(0, 0), at(1, 0)); // apart → top-left H grabs the H below it
  const finished = findGroups(board).filter((g) => g.finished);
  assert.deepEqual(finished.map((g) => g.cells), [[at(0, 0), at(0, 1)]]);
});

test('removing an atom frees its neighbors, who grab other hands', () => {
  // H–H on top; take one H away, and the other grabs the H below it.
  const board = build(['HH', 'H.']);
  assert.equal(findGroups(board).filter((g) => g.finished).length, 1);
  removeAtom(board, at(1, 0));
  assert.equal(finishedLabel(board), 'H2');
  assert.equal(removeAtom(board, at(5, 5)), false);
});

test('benzene fits as a 2×3 ring of carbons with their H atoms around it', () => {
  const board = createBoard(8, 6);
  // ring cells: (2,1)(3,1)(4,1)(4,2)(3,2)(2,2)
  for (const [x, y] of [[2, 1], [3, 1], [4, 1], [4, 2], [3, 2], [2, 2]]) placeAtom(board, at(x, y), 'C');
  // The two middle carbons grabbed hands across the ring: pull them apart.
  // (Each has 1 hand left, so the first tap makes a double bond; then they're full, so the next tap pulls apart.)
  assert.equal(tapBond(board, at(3, 1), at(3, 2)), 2);
  assert.equal(tapBond(board, at(3, 1), at(3, 2)), APART);
  // make it alternate: double bonds (2,1)=(3,1), (4,1)=(4,2), (3,2)=(2,2)
  tapBond(board, at(2, 1), at(3, 1));
  tapBond(board, at(4, 1), at(4, 2));
  tapBond(board, at(3, 2), at(2, 2));
  for (const [x, y] of [[1, 1], [3, 0], [5, 1], [5, 2], [3, 3], [1, 2]]) placeAtom(board, at(x, y), 'H');
  assert.equal(finishedLabel(board), canonLabel(parseSmiles('C1=CC=CC=C1')));
});

test('a free hand with no room left is stuck', () => {
  const methane = build(['.H.', 'HCH', '.H.']);
  assert.deepEqual(findGroups(methane)[0].stuck, []); // finished: nothing free

  // On a 3×2 board: water on top, then H . H below, then a C in the gap.
  // The C grabs both H's and still has 2 free hands, but above it is a
  // full O and below it is the board's edge: stuck.
  const board = createBoard(3, 2);
  for (const [cell, el] of [[0, 'H'], [1, 'O'], [2, 'H'], [3, 'H'], [5, 'H'], [4, 'C']]) placeAtom(board, cell, el);
  const ch2 = findGroups(board).find((g) => g.cells.includes(4));
  assert.deepEqual(ch2.stuck, [4]);
  assert.equal(ch2.finished, false);

  // A free hand next to an empty cell is not stuck.
  const open = build(['HO.']);
  assert.deepEqual(findGroups(open)[0].stuck, []);
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

test('groupLayout cuts out a small picture of the group', () => {
  const board = build(['....', '..H.', '.HO.']);
  const group = findGroups(board).find((g) => g.finished);
  const small = groupLayout(board, group.cells);
  assert.equal(small.width, 2);
  assert.equal(small.height, 2);
  assert.deepEqual(small.atoms, [null, 'H', 'H', 'O']);
  assert.deepEqual(small.right, [0, 0, 1, 0]);
  assert.deepEqual(small.down, [0, 1, 0, 0]);
});

test('one finger-drag can finish two molecules at once, and both are new', () => {
  // A PLACE drag across 4 cells puts down H H H H in one change.
  // Auto-bond pairs them up: (H–H)(H–H), two finished molecules.
  const board = createBoard(8, 6);
  const before = findGroups(board);
  for (let x = 0; x < 4; x += 1) placeAtom(board, at(x, 0), 'H');
  assert.equal(newlyFinished(before, findGroups(board)).length, 2);
});
