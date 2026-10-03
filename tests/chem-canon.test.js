/**
 * chem-canon.test.js — checks molecule labels (js/chem/canon.js): the
 * same molecule always gets the same label, however its atoms are
 * numbered, and different molecules get different labels.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonLabel } from '../js/chem/canon.js';
import { parseSmiles } from '../js/chem/smiles.js';

/**
 * Renumber a molecule's atoms in a random order and swap bond ends,
 * so it's the same molecule written down differently.
 * @param {{atoms: {el: string}[], bonds: {a: number, b: number, order: number}[]}} graph - a molecule
 * @param {number} seed - which shuffle (the same seed always shuffles the same way)
 * @returns {{atoms: {el: string}[], bonds: {a: number, b: number, order: number}[]}} the shuffled molecule
 */
function shuffle(graph, seed) {
  let state = seed;
  /**
   * A tiny repeatable random number generator.
   * @returns {number} a number from 0 up to (not including) 1
   */
  const random = () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
  const order = graph.atoms.map((_, i) => i).sort(() => random() - 0.5);
  const newIndex = new Map(order.map((old, k) => [old, k]));
  return {
    atoms: order.map((old) => graph.atoms[old]),
    bonds: graph.bonds
      .map(({ a, b, order: sticks }) => (random() < 0.5
        ? { a: newIndex.get(b), b: newIndex.get(a), order: sticks }
        : { a: newIndex.get(a), b: newIndex.get(b), order: sticks }))
      .sort(() => random() - 0.5),
  };
}

/**
 * The label for a SMILES string.
 * @param {string} smiles - e.g. 'CCO'
 * @returns {string} its label
 */
const label = (smiles) => canonLabel(parseSmiles(smiles));

test('the same molecule written many ways gets one label', () => {
  for (const smiles of ['O', 'CCO', 'C1=CC=CC=C1', 'CC(=O)O', 'OC(O)O', 'C1CCC1', 'NCC(=O)O', 'C=CC#N']) {
    const expected = label(smiles);
    for (let seed = 1; seed <= 20; seed += 1) {
      assert.equal(canonLabel(shuffle(parseSmiles(smiles), seed)), expected, `${smiles} seed ${seed}`);
    }
  }
});

test('different SMILES for the same molecule agree', () => {
  assert.equal(label('OCC'), label('CCO'));
  assert.equal(label('C(C)O'), label('CCO'));
  assert.equal(label('C=1C=CC=CC=1'), label('C1=CC=CC=C1'));
});

test('isomers (same atoms, joined differently) get different labels', () => {
  assert.notEqual(label('CCO'), label('COC')); // alcohol vs dimethyl ether
  assert.notEqual(label('CCCC'), label('CC(C)C')); // butane vs isobutane
  assert.notEqual(label('C=C'), label('CC')); // different H's
  assert.notEqual(label('C=CC=C'), label('C=C=CC'));
});

test('hydrogen gas has a label too', () => {
  assert.equal(label('[H][H]'), 'H2');
});

test('the two ways to draw o-xylene double bonds are different graphs', () => {
  // This is why tools/chem-db exports EVERY way: both must point to one name.
  assert.notEqual(label('CC1=CC=CC=C1C'), label('CC1=C(C)C=CC=C1'));
});

test('a ring of 8 identical atoms is still quick', () => {
  const started = Date.now();
  label('C1=CC=CC=CC=C1');
  assert.ok(Date.now() - started < 2000);
});

test('a big ring drawn on the board (more than 8 atoms) is labelled quickly', () => {
  // A 4×4 hollow square of 12 O atoms is one ring of identical atoms:
  // trying every order would be 12! ≈ 479 million tries.
  const ring = { atoms: [], bonds: [] };
  for (let k = 0; k < 12; k += 1) {
    ring.atoms.push({ el: 'O' });
    ring.bonds.push({ a: k, b: (k + 1) % 12, order: 1 });
  }
  const started = Date.now();
  const first = canonLabel(ring);
  assert.ok(Date.now() - started < 200, `took ${Date.now() - started} ms`);
  assert.equal(canonLabel(shuffle(ring, 7)), first); // still the same however it's numbered
  assert.notEqual(canonLabel(parseSmiles('OOOOOOOOOOO')), first); // a chain is not a ring
});
