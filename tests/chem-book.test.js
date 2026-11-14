/**
 * chem-book.test.js — checks the collection book and the unlock ladder
 * (js/chem/book.js), and the "what is it?" lookup (js/chem/lookup.js).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  WATER, betterName, climbLadder, countWith, createBook, elementsIn, INVENTION_NAME_MAX, promoteInventions, record, renameInvention, resolvePending,
  unlockAll, unlockedAtoms,
} from '../js/chem/book.js';
import { canonLabel } from '../js/chem/canon.js';
import { DATABASE_PARTS, kidIndex, loadDatabase, lookUp, partOf, partUrl, splitParts } from '../js/chem/lookup.js';
import { parseSmiles } from '../js/chem/smiles.js';

/**
 * The label for a SMILES string.
 * @param {string} smiles - e.g. 'CCO'
 * @returns {string} its label
 */
const label = (smiles) => canonLabel(parseSmiles(smiles));

const kids = kidIndex();
/** A tiny pretend big list: butanone (rare) and water, split into its parts. */
const names = { [label('CCC(C)=O')]: 'Butanone', [label('O')]: 'Water' };
const database = { parts: splitParts(names) };
/** DMT has 14 non-H atoms: too big for the built-in list, so PubChem is asked. */
const DMT = label('CN(C)CCC1=CNC2=CC=CC=C12');
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
  for (const smiles of ['OOOOOO', 'OOOOOOO', 'OOOOOOOO']) { // not in the pretend list
    const made = record(book, label(smiles), layout, lookUp(label(smiles), kids, database));
    assert.deepEqual(made.unlocked, []);
  }
  assert.equal(book.step, 2);
  assert.deepEqual(book.inventions.map((i) => i.name), ['Invention #3', 'Invention #2', 'Invention #1']);
});

test('any invention can be renamed, not just the newest', () => {
  const book = createBook();
  for (const smiles of ['CCCCCCCCC', 'CCCCCCCCCC', 'CCCCCCCCCCC']) {
    record(book, label(smiles), layout, { kind: 'invention' });
  }
  const oldest = label('CCCCCCCCC');
  assert.ok(renameInvention(book, oldest, '  Super Chain  '));
  assert.deepEqual(book.inventions.map((i) => i.name), ['Invention #3', 'Invention #2', 'Super Chain']);
  const again = record(book, oldest, layout, { kind: 'invention' });
  assert.equal(again.name, 'Super Chain');
});

test('a blank name or a molecule that is not an invention changes nothing', () => {
  const book = createBook();
  record(book, label('CCCCCCCCC'), layout, { kind: 'invention' });
  assert.equal(renameInvention(book, label('CCCCCCCCC'), '   '), false);
  assert.equal(renameInvention(book, WATER, 'Splashy'), false);
  assert.deepEqual(book.inventions.map((i) => i.name), ['Invention #1']);
});

test('a very long invention name is cut to fit the book', () => {
  const book = createBook();
  record(book, label('CCCCCCCCC'), layout, { kind: 'invention' });
  assert.ok(renameInvention(book, label('CCCCCCCCC'), 'a'.repeat(INVENTION_NAME_MAX + 10)));
  assert.equal(book.inventions[0].name, 'a'.repeat(INVENTION_NAME_MAX));
});

test('lookup order: hand-written, then the big list, then waiting, then invention', () => {
  assert.equal(lookUp(WATER, kids, database).kind, 'found');
  assert.equal(lookUp(WATER, kids, null).kind, 'found'); // hand-written ones work offline
  assert.deepEqual(lookUp(label('CCC(C)=O'), kids, database), { kind: 'rare', name: 'Butanone' });
  assert.deepEqual(lookUp(label('CCC(C)=O'), kids, null), { kind: 'pending' });
  assert.deepEqual(lookUp(label('OOOOOOOO'), kids, database), { kind: 'invention' }); // 8 atoms, not in the list
  assert.deepEqual(lookUp('constructor', kids, { parts: splitParts({}) }), { kind: 'invention' }); // no tricks from Object's own names
});

test('lookup: molecules with more than 8 non-H atoms wait for PubChem, whatever the list says', () => {
  assert.deepEqual(lookUp(DMT, kids, database), { kind: 'pending', ask: true });
  assert.deepEqual(lookUp(DMT, kids, null), { kind: 'pending', ask: true });
  const asked = { [DMT]: { cid: 6089, name: 'N,N-Dimethyltryptamine' } };
  assert.deepEqual(lookUp(DMT, kids, null, asked), { kind: 'rare', name: 'N,N-Dimethyltryptamine', cid: 6089 });
  assert.deepEqual(lookUp(DMT, kids, null, { [DMT]: { cid: 0 } }), { kind: 'invention' });
});

test('the list is split into parts, and each label always lives in the same part', () => {
  assert.equal(DATABASE_PARTS, 16);
  assert.equal(partOf(WATER), partOf(WATER));
  const used = new Set();
  for (let k = 0; k < 1000; k += 1) used.add(partOf(`C${k}|0-1:1`));
  assert.equal(used.size, DATABASE_PARTS);
  const parts = splitParts(names);
  assert.equal(parts.length, DATABASE_PARTS);
  assert.equal(parts[partOf(WATER)][WATER], 'Water');
  assert.equal(partUrl(3), 'data/molecules/3.json');
});

test('a second way of building a PubChem molecule (same CID) is "found again", and counts once', () => {
  const book = createBook();
  record(book, 'A', layout, { kind: 'rare', name: 'Indole thing', cid: 42 });
  const second = record(book, 'B', layout, { kind: 'rare', name: 'Indole thing', cid: 42 });
  assert.equal(second.again, true);
  assert.equal(book.rare.length, 1);
  assert.equal(book.rare[0].cid, 42);
});

test('a big molecule made offline waits (⏳), and gets its PubChem name once it is answered', () => {
  const book = createBook();
  record(book, DMT, layout, lookUp(DMT, kids, database, book.asked));
  assert.equal(book.pending.length, 1);
  assert.equal(book.inventions.length, 0); // never called an invention just because there was no answer
  let { settled } = resolvePending(book, (l) => lookUp(l, kids, database, book.asked)); // still no answer
  assert.deepEqual(settled, []);
  book.asked[DMT] = { cid: 6089, name: 'N,N-Dimethyltryptamine' };
  ({ settled } = resolvePending(book, (l) => lookUp(l, kids, database, book.asked)));
  assert.equal(settled.length, 1);
  assert.equal(settled[0].result.kind, 'rare');
  assert.equal(book.rare[0].name, 'N,N-Dimethyltryptamine');
  assert.equal(book.pending.length, 0);
});

test('an old invention PubChem knows becomes 🌟; a name Caleb gave it stays', () => {
  const book = createBook();
  record(book, 'A', layout, { kind: 'invention' }); // Invention #1
  record(book, 'B', layout, { kind: 'invention' }); // Invention #2
  record(book, 'C', layout, { kind: 'invention' }); // Invention #3: PubChem doesn't know it
  renameInvention(book, 'A', 'Zoomy');
  const answers = { A: { cid: 1, name: 'Real A' }, B: { cid: 2, name: 'Real B' }, C: { cid: 0 } };
  const look = (l) => (answers[l]?.name ? { kind: 'rare', name: answers[l].name, cid: answers[l].cid } : { kind: 'invention' });
  const { promoted } = promoteInventions(book, look);
  assert.equal(promoted.length, 2);
  assert.deepEqual(book.inventions.map((i) => i.label), ['C']);
  const a = book.rare.find((r) => r.label === 'A');
  assert.equal(a.name, 'Zoomy');
  assert.equal(a.realName, 'Real A');
  assert.equal(book.rare.find((r) => r.label === 'B').name, 'Real B');
  // The next invention gets a number nobody has used.
  assert.equal(record(book, 'D', layout, { kind: 'invention' }).name, 'Invention #4');
});

test('steps 5 and 6: Cl or S molecules unlock F, Br and I; F, Br or I molecules unlock B, Si and P', () => {
  const book = createBook();
  book.step = 4;
  record(book, label('CCl'), layout, { kind: 'found', entry: {} });
  assert.deepEqual(record(book, label('S'), layout, { kind: 'rare', name: 'Hydrogen sulfide' }).unlocked, ['F', 'Br', 'I']);
  record(book, label('F'), layout, { kind: 'rare', name: 'HF' });
  assert.deepEqual(record(book, label('CBr'), layout, { kind: 'rare', name: 'Bromomethane' }).unlocked, ['B', 'Si', 'P']);
  assert.deepEqual(unlockedAtoms(book), ['H', 'O', 'C', 'N', 'Cl', 'S', 'F', 'Br', 'I', 'B', 'Si', 'P']);
});

test('waiting molecules are sorted out when the big list arrives', () => {
  const book = createBook();
  record(book, WATER, layout, lookUp(WATER, kids, null));
  for (const smiles of ['C', 'CC', 'CCC(C)=O', 'OOOOOOOO']) record(book, label(smiles), layout, lookUp(label(smiles), kids, null));
  assert.equal(book.pending.length, 2);
  assert.deepEqual(resolvePending(book, (l) => lookUp(l, kids, null)).unlocked, []); // still offline
  assert.equal(book.pending.length, 2);
  assert.deepEqual(resolvePending(book, (l) => lookUp(l, kids, database)).unlocked, ['N']);
  assert.equal(book.pending.length, 0);
  assert.equal(book.rare.length, 1);
  assert.equal(book.inventions.length, 1);
});

test('unlockAll opens every atom; climbing twice does nothing more', () => {
  const book = createBook();
  unlockAll(book);
  assert.deepEqual(unlockedAtoms(book), ['H', 'O', 'C', 'N', 'Cl', 'S', 'F', 'Br', 'I', 'B', 'Si', 'P']);
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
  // Every part arrives: the list is all the parts, in order.
  const fetched = [];
  const loaded = await loadDatabase(async (url) => {
    fetched.push(url);
    return { ok: true, json: async () => database.parts[Number(url.match(/(\d+)\.json$/)[1])] };
  });
  assert.deepEqual(loaded, database);
  assert.deepEqual(fetched, database.parts.map((_, k) => partUrl(k)));
  // One part missing: no list yet (the room tries again later).
  assert.equal(await loadDatabase(async (url) => (url.endsWith('/7.json') ? { ok: false } : { ok: true, json: async () => ({}) })), null);
});

test('an invention Caleb named is never lost, even when PubChem says the same molecule is already a 🌟', () => {
  const book = createBook();
  record(book, 'A', layout, { kind: 'invention' }); // Invention #1
  record(book, 'B', layout, { kind: 'invention' }); // the same molecule, double bonds the other way
  renameInvention(book, 'A', 'Rocket'); // the older one: it's looked at last
  const look = (l) => ({ kind: 'rare', name: 'Naphthalene', cid: 931, l });
  promoteInventions(book, look);
  assert.equal(book.inventions.length, 0);
  assert.equal(book.rare.length, 1); // one molecule, counted once
  assert.equal(book.rare[0].name, 'Rocket'); // Caleb's name wins
  assert.equal(book.rare[0].realName, 'Naphthalene');
});

test('a better PubChem name replaces the old one, but never a name Caleb gave', () => {
  const book = createBook();
  const address = '3-(1-Methylpyrrolidin-2-yl)pyridine';
  book.rare.push({ label: 'a', name: address, layout: null, cid: 942 });
  book.rare.push({ label: 'b', name: 'Smoky', realName: address, layout: null, cid: 942 });
  book.rare.push({ label: 'c', name: address, layout: null, cid: 7 }); // another molecule
  assert.equal(betterName(book, 942, address, 'Nicotine'), 2);
  assert.deepEqual(book.rare.map((r) => [r.name, r.realName]), [['Nicotine', undefined], ['Smoky', 'Nicotine'], [address, undefined]]);
});
