/**
 * chem-smiles.test.js — checks the SMILES reader (js/chem/smiles.js):
 * it fills in the H's, reads double/triple bonds, branches and rings,
 * and refuses anything the chemistry room doesn't use.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSmiles } from '../js/chem/smiles.js';

/**
 * Count the atoms of each element, like { C: 2, H: 6, O: 1 }.
 * @param {{atoms: {el: string}[]}} graph - a molecule graph
 * @returns {Record<string, number>} element → how many
 */
function formula(graph) {
  const counts = {};
  for (const { el } of graph.atoms) counts[el] = (counts[el] ?? 0) + 1;
  return counts;
}

test('water: one O gets two H atoms', () => {
  const water = parseSmiles('O');
  assert.deepEqual(formula(water), { O: 1, H: 2 });
  assert.equal(water.bonds.length, 2);
});

test('alcohol (CCO) has 2 C, 6 H, 1 O and 8 bonds', () => {
  const ethanol = parseSmiles('CCO');
  assert.deepEqual(formula(ethanol), { C: 2, O: 1, H: 6 });
  assert.equal(ethanol.bonds.length, 8);
});

test('double and triple bonds', () => {
  assert.deepEqual(parseSmiles('O=C=O').bonds.map((b) => b.order), [2, 2]);
  assert.deepEqual(parseSmiles('N#N').bonds.map((b) => b.order), [3]);
  assert.deepEqual(formula(parseSmiles('C#N')), { C: 1, N: 1, H: 1 });
});

test('hydrogen gas written as [H][H]', () => {
  const h2 = parseSmiles('[H][H]');
  assert.deepEqual(formula(h2), { H: 2 });
  assert.deepEqual(h2.bonds, [{ a: 0, b: 1, order: 1 }]);
});

test('branches and rings', () => {
  assert.deepEqual(formula(parseSmiles('CC(C)O')), { C: 3, O: 1, H: 8 });
  const benzene = parseSmiles('C1=CC=CC=C1');
  assert.deepEqual(formula(benzene), { C: 6, H: 6 });
  assert.equal(benzene.bonds.filter((b) => b.order === 2).length, 3);
  assert.deepEqual(formula(parseSmiles('C=1CCC=1')), { C: 4, H: 6 }); // ring bond order on the digit
});

test('chlorine is one atom, not C then l', () => {
  assert.deepEqual(formula(parseSmiles('CCl')), { C: 1, Cl: 1, H: 3 });
});

test('refuses things the room does not use', () => {
  for (const bad of ['c1ccccc1', '[NH4+]', 'Na', 'C(C)(C)(C)(C)C', 'O=O=O', 'C1CC', 'C(C', 'CC)', 'F', '[2H]O']) {
    assert.throws(() => parseSmiles(bad), Error, bad);
  }
});
