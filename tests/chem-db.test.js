/**
 * chem-db.test.js — checks tools/chem-db/make-db.js, which turns
 * export.py's list into data/molecules.json: every Kekulé form gets a
 * label, the first (oldest) name wins, and clashes are counted.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonLabel } from '../js/chem/canon.js';
import { partOf, splitParts } from '../js/chem/lookup.js';
import { parseSmiles } from '../js/chem/smiles.js';
import { buildDatabase } from '../tools/chem-db/make-db.js';

/**
 * The label for a SMILES string.
 * @param {string} smiles - e.g. 'CCO'
 * @returns {string} its label
 */
const label = (smiles) => canonLabel(parseSmiles(smiles));

test('every Kekulé form of a molecule points to its name', () => {
  const { names, clashes } = buildDatabase('O-Xylene\tCC1=C(C)C=CC=C1|CC1=CC=CC=C1C\n');
  assert.equal(names[label('CC1=CC=CC=C1C')], 'O-Xylene');
  assert.equal(names[label('CC1=C(C)C=CC=C1')], 'O-Xylene');
  assert.equal(clashes, 0);
});

test('the first name wins, and a second name for the same label is a clash', () => {
  const { names, clashes } = buildDatabase('Ethanol\tCCO\nAlcohol\tOCC\nWater\tO\n');
  assert.equal(names[label('CCO')], 'Ethanol');
  assert.equal(clashes, 1);
  assert.deepEqual(Object.keys(names), Object.keys(names).slice().sort()); // sorted for stable diffs
});

test('SMILES the room cannot read are skipped, not fatal', () => {
  const { names, skipped } = buildDatabase('Benzene\tc1ccccc1\nWater\tO\n');
  assert.deepEqual(skipped, ['c1ccccc1']);
  assert.equal(names[label('O')], 'Water');
});

test('PubChem compounds with no real name ("CID 123") are left out', () => {
  const { names } = buildDatabase('CID 53627737\tCCCC=O\nWater\tO\n');
  assert.equal(names[label('CCCC=O')], undefined);
  assert.equal(names[label('O')], 'Water');
});

test('the list is written in parts: each label in the part the room looks in', () => {
  const { names } = buildDatabase('Water\tO\nEthanol\tCCO\nSulfuric acid\tOS(=O)(=O)O\n');
  const parts = splitParts(names);
  for (const [l, name] of Object.entries(names)) assert.equal(parts[partOf(l)][l], name);
  assert.equal(names[label('OS(=O)(=O)O')], 'Sulfuric acid'); // S with 6 hands is read fine
});
