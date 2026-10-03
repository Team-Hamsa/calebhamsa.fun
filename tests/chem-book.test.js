/**
 * chem-book.test.js — checks the collection book and the unlock ladder
 * (js/chem/book.js), and the "what is it?" lookup (js/chem/lookup.js).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  WATER, climbLadder, countWith, createBook, elementsIn, nameNewestInvention, record, resolvePending, unlockAll, unlockedAtoms,
} from '../js/chem/book.js';
import { canonLabel } from '../js/chem/canon.js';
import { kidIndex, loadDatabase, lookUp } from '../js/chem/lookup.js';
import { parseSmiles } from '../js/chem/smiles.js';

/**
 * The label for a SMILES string.
 * @param {string} smiles - e.g. 'CCO'
 * @returns {string} its label
 */
const label = (smiles) => canonLabel(parseSmiles(smiles));

const kids = kidIndex();
/** A tiny pretend big list: butanone (rare) and water. */
const database = { [label('CCC(C)=O')]: 'Butanone', [label('O')]: 'Water' };
/** A tiny pretend picture. */
const layout = { width: 1, height: 1, atoms: ['O'], right: [0], down: [0] };

test('WATER is the label canon.js gives water', () => {
  assert.equal(WATER, label('O'));
});

test('elementsIn reads the elements out of a label', () => {
  assert.deepEqual([...elementsIn(label('CCl'))].sort(), ['C', 'Cl', 'H']);
  assert.deepEqual([...elementsIn(label('ClC(Cl)(Cl)Cl'))].sort(), ['C', 'Cl']);
  assert.deepEqual([...elementsIn('H2')], ['H']);
  assert.deepEqual([...elementsIn(label('N#N'))], ['N']);
});

test('a new book has H and O, and making water unlocks C', () => {
  const book = createBook();
  assert.deepEqual(unlockedAtoms(book), ['H', 'O']);
  const result = record(book, WATER, layout, lookUp(WATER, kids, null));
  assert.deepEqual(result, { again: false, unlocked: ['C'], name: null });
  assert.deepEqual(unlockedAtoms(book), ['H', 'O', 'C']);
  assert.deepEqual(book.pictures[WATER], layout); // the book shows how he built it
});

test('making the same molecule twice counts once', () => {
  const book = createBook();
  record(book, WATER, layout, lookUp(WATER, kids, null));
  const again = record(book, WATER, layout, lookUp(WATER, kids, null));
  assert.equal(again.again, true);
  assert.deepEqual(book.found, [WATER]);
});

test('three carbon molecules unlock N, and rare finds count toward it', () => {
  const book = createBook();
  record(book, WATER, layout, lookUp(WATER, kids, null));
  for (const smiles of ['C', 'CC']) record(book, label(smiles), layout, lookUp(label(smiles), kids, database));
  assert.equal(book.step, 2);
  const butanone = label('CCC(C)=O');
  const result = record(book, butanone, layout, lookUp(butanone, kids, database));
  assert.deepEqual(result.unlocked, ['N']);
  assert.equal(book.rare[0].name, 'Butanone');
  assert.equal(countWith(book, 'C'), 3);
});

test('inventions do not count toward unlocks, and get numbered names', () => {
  const book = createBook();
  record(book, WATER, layout, lookUp(WATER, kids, null));
  for (const smiles of ['CCCCCCCCC', 'CCCCCCCCCC', 'CCCCCCCCCCC']) {
    const made = record(book, label(smiles), layout, lookUp(label(smiles), kids, database));
    assert.deepEqual(made.unlocked, []);
  }
  assert.equal(book.step, 2);
  assert.deepEqual(book.inventions.map((i) => i.name), ['Invention #3', 'Invention #2', 'Invention #1']);
  assert.ok(nameNewestInvention(book, '  Super Chain  '));
  assert.equal(book.inventions[0].name, 'Super Chain');
  assert.equal(nameNewestInvention(book, '   '), false);
  const again = record(book, label('CCCCCCCCCCC'), layout, { kind: 'invention' });
  assert.equal(again.name, 'Super Chain');
});

test('lookup order: hand-written, then the big list, then waiting, then invention', () => {
  assert.equal(lookUp(WATER, kids, database).kind, 'found');
  assert.equal(lookUp(WATER, kids, null).kind, 'found'); // hand-written ones work offline
  assert.deepEqual(lookUp(label('CCC(C)=O'), kids, database), { kind: 'rare', name: 'Butanone' });
  assert.deepEqual(lookUp(label('CCC(C)=O'), kids, null), { kind: 'pending' });
  assert.deepEqual(lookUp(label('CCCCCCCCCC'), kids, database), { kind: 'invention' });
  assert.deepEqual(lookUp('constructor', kids, {}), { kind: 'invention' }); // no tricks from Object's own names
});

test('waiting molecules are sorted out when the big list arrives', () => {
  const book = createBook();
  record(book, WATER, layout, lookUp(WATER, kids, null));
  for (const smiles of ['C', 'CC', 'CCC(C)=O', 'CCCCCCCCCC']) record(book, label(smiles), layout, lookUp(label(smiles), kids, null));
  assert.equal(book.pending.length, 2);
  assert.deepEqual(resolvePending(book, (l) => lookUp(l, kids, null)), []); // still offline
  assert.equal(book.pending.length, 2);
  assert.deepEqual(resolvePending(book, (l) => lookUp(l, kids, database)), ['N']);
  assert.equal(book.pending.length, 0);
  assert.equal(book.rare.length, 1);
  assert.equal(book.inventions.length, 1);
});

test('unlockAll opens every atom; climbing twice does nothing more', () => {
  const book = createBook();
  unlockAll(book);
  assert.deepEqual(unlockedAtoms(book), ['H', 'O', 'C', 'N', 'Cl', 'S']);
  assert.deepEqual(climbLadder(book), []);
});

test('several steps can unlock at once (e.g. after the big list arrives)', () => {
  const book = createBook();
  book.found.push(WATER, label('C'), label('CC'), label('CCC'), label('N#N'), label('N'));
  assert.deepEqual(climbLadder(book), ['C', 'N', 'Cl', 'S']);
});

test('loadDatabase gives null instead of crashing when offline or broken', async () => {
  assert.equal(await loadDatabase(async () => { throw new Error('offline'); }), null);
  assert.equal(await loadDatabase(async () => ({ ok: false })), null);
  assert.equal(await loadDatabase(async () => ({ ok: true, json: async () => { throw new SyntaxError('bad'); } })), null);
  assert.deepEqual(await loadDatabase(async () => ({ ok: true, json: async () => database })), database);
});
