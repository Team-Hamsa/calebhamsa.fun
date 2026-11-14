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
import { DATABASE_PARTS, kidIndex, partOf } from '../js/chem/lookup.js';
import { parseSmiles } from '../js/chem/smiles.js';

const parts = Array.from({ length: DATABASE_PARTS }, (_, k) => JSON.parse(readFileSync(new URL(`../data/molecules/${k}.json`, import.meta.url), 'utf8')));
/** Every part together, as one label → name list. */
const database = Object.assign({}, ...parts);

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

test('every hand-written molecule has a name, a fact, and a step 1–6 that has its atoms', () => {
  const newAtoms = { 1: ['H', 'O'], 2: ['C'], 3: ['N'], 4: ['Cl', 'S'], 5: ['F', 'Br', 'I'], 6: ['B', 'Si', 'P'] };
  for (const k of KID_MOLECULES) {
    assert.ok(k.name && k.fact, k.smiles);
    const open = Object.entries(newAtoms).filter(([step]) => Number(step) <= k.step).flatMap(([, atoms]) => atoms);
    const elements = new Set(parseSmiles(k.smiles).atoms.map((a) => a.el));
    for (const el of elements) assert.ok(open.includes(el), `${k.name} needs ${el} but is on step ${k.step}`);
  }
});

test('every label is in the part of the list the room looks in', () => {
  parts.forEach((part, k) => {
    const wrong = Object.keys(part).filter((l) => partOf(l) !== k);
    assert.deepEqual(wrong.slice(0, 3), [], `part ${k}`);
  });
});

test('the triangle board’s new molecules are in the list', () => {
  for (const smiles of ['OS(=O)(=O)O', 'FS(F)(F)(F)(F)F', 'BrC(Br)Br', 'O=P(O)(O)O', '[SiH4]', 'OB(O)O', 'C1CCCC1', 'C1CC1', 'O1C=CC=C1']) {
    assert.ok(Object.hasOwn(database, label(smiles)), smiles);
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

test('molecules too crowded for the old square board fit the triangle board', () => {
  assert.equal(database[label('CC(C)C')], 'Isobutane');
  assert.equal(database[label('CC(C)(C)C')], 'Neopentane');
});

test('no label in the list has more than 8 non-H atoms (bigger ones are asked of PubChem)', () => {
  const big = Object.keys(database).filter((l) => l.split('|')[0].split(',').length > 8);
  assert.deepEqual(big.slice(0, 3), []);
});

test('every way of building a hand-written molecule finds its 📖 entry (all Kekulé forms)', () => {
  // The big list has every Kekulé form under the same name, so any label
  // sharing a hand-written molecule's big-list name is that molecule too.
  const kids = kidIndex();
  const kidNames = new Set([...kids.keys()].map((l) => database[l]));
  const missed = Object.entries(database)
    .filter(([l, name]) => kidNames.has(name) && !kids.has(l))
    .map(([, name]) => name);
  assert.deepEqual(missed, []);
});

test('no name in the big list is just a PubChem number', () => {
  const numbers = Object.values(database).filter((name) => /^CID \d+$/.test(name));
  assert.deepEqual(numbers.slice(0, 3), []);
});
