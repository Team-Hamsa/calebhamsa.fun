/**
 * chem-data.test.js — checks the big molecule list (data/molecules.json)
 * and the hand-written one (js/chem/kid-names.js) agree with the room.
 *
 * The big list was made by tools/chem-db (see its README). If these fail
 * after changing canon.js, the list must be rebuilt: its labels come
 * from canon.js.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canonLabel } from '../js/chem/canon.js';
import { KID_MOLECULES } from '../js/chem/kid-names.js';
import { parseSmiles } from '../js/chem/smiles.js';

const database = JSON.parse(readFileSync(new URL('../data/molecules.json', import.meta.url), 'utf8'));

/**
 * The label for a SMILES string.
 * @param {string} smiles - e.g. 'CCO'
 * @returns {string} its label
 */
const label = (smiles) => canonLabel(parseSmiles(smiles));

test('every hand-written molecule can really be built (it is in the big list)', () => {
  const missing = KID_MOLECULES.filter((k) => !Object.hasOwn(database, label(k.smiles))).map((k) => k.name);
  assert.deepEqual(missing, []);
});

test('no molecule is hand-written twice', () => {
  const labels = KID_MOLECULES.map((k) => label(k.smiles));
  assert.equal(new Set(labels).size, labels.length);
});

test('every hand-written molecule has a name, a fact, and a step 1–4 that has its atoms', () => {
  const atomsByStep = { 1: 'HO', 2: 'HOC', 3: 'HOCN', 4: 'HOCNClS' };
  for (const k of KID_MOLECULES) {
    assert.ok(k.name && k.fact, k.smiles);
    const elements = new Set(parseSmiles(k.smiles).atoms.map((a) => a.el));
    for (const el of elements) assert.ok(atomsByStep[k.step]?.includes(el), `${k.name} needs ${el} but is on step ${k.step}`);
  }
});

test('the big list knows some famous molecules by their real names', () => {
  const expected = {
    CCO: 'Ethanol', COC: 'Dimethyl Ether', 'CC(C)=O': 'Acetone', CCCC: 'Butane',
    'NCC(=O)O': 'Glycine', 'O=C(N)N': 'Urea', 'C1=CC=CC=C1': 'Benzene',
  };
  for (const [smiles, name] of Object.entries(expected)) assert.equal(database[label(smiles)], name, smiles);
});

test('both ways of drawing o-xylene double bonds find the same name', () => {
  assert.equal(database[label('CC1=CC=CC=C1C')], 'O-Xylene');
  assert.equal(database[label('CC1=C(C)C=CC=C1')], 'O-Xylene');
});

test('molecules too crowded for the grid are not in the list', () => {
  assert.equal(database[label('CC(C)C')], undefined); // isobutane
  assert.equal(database[label('CC(C)(C)C')], undefined); // neopentane
});
