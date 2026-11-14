/**
 * chem-smiles.test.js — checks the SMILES reader (js/chem/smiles.js):
 * it fills in the H's, reads double/triple bonds, branches and rings,
 * and refuses anything the chemistry room doesn't use.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonLabel } from '../js/chem/canon.js';
import { parseSmiles, writeSmiles } from '../js/chem/smiles.js';

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
  for (const bad of ['c1ccccc1', '[NH4+]', 'Na', 'C(C)(C)(C)(C)C', 'O=O=O', 'C1CC', 'C(C', 'CC)', 'Xe', '[2H]O', '[CH5]', '[SH3]', '[Si+]']) {
    assert.throws(() => parseSmiles(bad), Error, bad);
  }
});

test('the newer atoms: F, Br, I, B, Si and P', () => {
  assert.deepEqual(formula(parseSmiles('FC(F)(F)F')), { C: 1, F: 4 });
  assert.deepEqual(formula(parseSmiles('BrC(Br)Br')), { C: 1, Br: 3, H: 1 }); // bromoform
  assert.deepEqual(formula(parseSmiles('II')), { I: 2 });
  assert.deepEqual(formula(parseSmiles('OB(O)O')), { B: 1, O: 3, H: 3 }); // boric acid
  assert.deepEqual(formula(parseSmiles('[SiH4]')), { Si: 1, H: 4 }); // silane: Si is always in [ ]
  assert.deepEqual(formula(parseSmiles('C[Si](C)(C)C')), { C: 4, Si: 1, H: 12 });
  assert.deepEqual(formula(parseSmiles('P')), { P: 1, H: 3 }); // phosphine
  assert.deepEqual(formula(parseSmiles('F')), { F: 1, H: 1 }); // hydrogen fluoride
});

test('sulfur and phosphorus can use extra hands (S 2, 4 or 6; P 3 or 5)', () => {
  assert.deepEqual(formula(parseSmiles('OS(=O)(=O)O')), { S: 1, O: 4, H: 2 }); // sulfuric acid: S uses 6
  assert.deepEqual(formula(parseSmiles('FS(F)(F)(F)(F)F')), { S: 1, F: 6 }); // SF6
  assert.deepEqual(formula(parseSmiles('O=P(O)(O)O')), { P: 1, O: 4, H: 3 }); // phosphoric acid: P uses 5
  assert.deepEqual(formula(parseSmiles('CS(C)(=O)=O')), { C: 2, S: 1, O: 2, H: 6 }); // S uses 6, no H
  assert.deepEqual(formula(parseSmiles('CS(C)=O')), { C: 2, S: 1, O: 1, H: 6 }); // S uses 4
  assert.deepEqual(formula(parseSmiles('[SH2](C)C')), { C: 2, S: 1, H: 8 }); // S uses 4: 2 C and 2 H
});

/**
 * The label of a SMILES string.
 * @param {string} smiles - e.g. 'CCO'
 * @returns {string} its label
 */
const label = (smiles) => canonLabel(parseSmiles(smiles));

test('writeSmiles writes a molecule that reads back as the same molecule', () => {
  const molecules = [
    'O', '[H][H]', 'CCO', 'C1=CC=CC=C1', 'OS(=O)(=O)O', 'FS(F)(F)(F)(F)F', 'C[Si](C)(C)C', 'O=P(O)(O)O', 'N#N',
    'CN(C)CCC1=CNC2=CC=CC=C12', // DMT
    'CN1C=NC2=C1C(=O)N(C(=O)N2C)C', // caffeine
    'CC(=O)NCCC1=CNC2=C1C=C(C=C2)OC', // melatonin
    'C12C3C4C1C5C2C3C45', // cubane: lots of rings at once
  ];
  for (const smiles of molecules) {
    const written = writeSmiles(parseSmiles(smiles));
    assert.equal(label(written), label(smiles), `${smiles} → ${written}`);
  }
});

test('writeSmiles puts sulfur with extra hands AND hydrogens in [ ], so the H count survives', () => {
  const written = writeSmiles(parseSmiles('[SH2](C)C'));
  assert.match(written, /\[SH2\]/);
  assert.equal(label(written), label('[SH2](C)C'));
});

test('ring numbers past 9 are written %10, %11… and read back', () => {
  assert.deepEqual(formula(parseSmiles('C%10CC%10')), { C: 3, H: 6 });
});
