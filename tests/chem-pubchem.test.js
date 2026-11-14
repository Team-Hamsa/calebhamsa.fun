/**
 * chem-pubchem.test.js — checks js/chem/pubchem.js, which asks PubChem
 * (the US government's free chemistry library) for the name of a big
 * molecule. These tests never touch the internet: they hand in a pretend
 * fetch that answers the way PubChem does.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonLabel } from '../js/chem/canon.js';
import { askPubChem, makeAsker, pubchemUrl } from '../js/chem/pubchem.js';
import { parseSmiles } from '../js/chem/smiles.js';

/**
 * A pretend fetch answer.
 * @param {number} status - the HTTP status, like 200
 * @param {object} [body] - the JSON it sends
 * @returns {object} something shaped like a Response
 */
const reply = (status, body = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

/** PubChem's real answers (checked 2026-11-09). */
const KNOWN = { PropertyTable: { Properties: [{ CID: 6089, Title: 'N,N-Dimethyltryptamine' }] } };
const UNKNOWN = { PropertyTable: { Properties: [{ CID: 0 }] } };

test('the PubChem address has the SMILES safely inside it', () => {
  assert.equal(
    pubchemUrl('C1=CC=CC=C1'),
    'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles/C1%3DCC%3DCC%3DC1/property/Title/JSON',
  );
  assert.ok(pubchemUrl('C#N').includes('C%23N')); // a raw # would end the address
});

test('a molecule PubChem knows: its CID and its name', async () => {
  assert.deepEqual(await askPubChem('CN(C)CCC1=CNC2=CC=CC=C12', async () => reply(200, KNOWN)), { cid: 6089, name: 'N,N-Dimethyltryptamine' });
});

test('a molecule PubChem has never heard of: CID 0, an invention', async () => {
  assert.deepEqual(await askPubChem('CCCC', async () => reply(200, UNKNOWN)), { cid: 0 });
  const unnamed = { PropertyTable: { Properties: [{ CID: 123 }] } };
  assert.deepEqual(await askPubChem('CCCC', async () => reply(200, unnamed)), { cid: 0 }); // known, but no name
  const numbered = { PropertyTable: { Properties: [{ CID: 123, Title: 'CID 123' }] } };
  assert.deepEqual(await askPubChem('CCCC', async () => reply(200, numbered)), { cid: 0 }); // a number is no name
});

test('PubChem could not read our SMILES (400/404): an invention, not asked again, and a warning for grown-ups', async (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  assert.deepEqual(await askPubChem('C(', async () => reply(400)), { cid: 0 });
  assert.deepEqual(await askPubChem('C(', async () => reply(404)), { cid: 0 });
  assert.equal(warn.mock.callCount(), 2);
});

test('no answer (offline, busy, broken, too slow): null, so it waits ⏳ and is asked again later', async () => {
  assert.equal(await askPubChem('CCCC', async () => { throw new TypeError('offline'); }), null);
  assert.equal(await askPubChem('CCCC', async () => reply(503)), null);
  assert.equal(await askPubChem('CCCC', async () => reply(500)), null);
  assert.equal(await askPubChem('CCCC', async () => reply(200, 'nonsense')), null);
  assert.equal(await askPubChem('CCCC', () => new Promise(() => {}), 10), null); // never answers
});

const DMT = canonLabel(parseSmiles('CN(C)CCC1=CNC2=CC=CC=C12'));
const CAFFEINE = canonLabel(parseSmiles('CN1C=NC2=C1C(=O)N(C(=O)N2C)C'));

test('the asker asks about each label once, one question at a time', async () => {
  const urls = [];
  let busy = 0;
  let overlapped = false;
  const fetchFn = async (url) => {
    busy += 1;
    if (busy > 1) overlapped = true;
    urls.push(url);
    await new Promise((resolve) => setTimeout(resolve, 5));
    busy -= 1;
    return reply(200, KNOWN);
  };
  const answers = [];
  const asker = makeAsker({ fetchFn, onAnswer: (label, answer) => answers.push([label, answer]), gapMs: 0 });
  asker.ask(DMT);
  asker.ask(DMT);
  await asker.ask(CAFFEINE);
  assert.equal(urls.length, 2);
  assert.equal(overlapped, false);
  assert.deepEqual(answers.map(([label]) => label), [DMT, CAFFEINE]);
  // The SMILES it sent really is DMT.
  const sent = decodeURIComponent(urls[0].split('/smiles/')[1].split('/property')[0]);
  assert.equal(canonLabel(parseSmiles(sent)), DMT);
});

test('the asker waits between questions, so PubChem isn’t flooded', async () => {
  const waits = [];
  const asker = makeAsker({ fetchFn: async () => reply(200, UNKNOWN), onAnswer() {}, gapMs: 300, wait: async (ms) => { waits.push(ms); } });
  asker.ask(DMT);
  await asker.ask(CAFFEINE);
  assert.deepEqual(waits, [300, 300]);
});

test('a label with no answer can be asked again after retry()', async () => {
  let online = false;
  const answers = [];
  const asker = makeAsker({
    fetchFn: async () => { if (!online) throw new TypeError('offline'); return reply(200, KNOWN); },
    onAnswer: (label, answer) => answers.push(answer),
    gapMs: 0,
  });
  await asker.ask(DMT);
  await asker.ask(DMT); // asked already this time round: no second question
  assert.deepEqual(answers, [null]);
  online = true;
  asker.retry();
  await asker.ask(DMT);
  assert.deepEqual(answers, [null, { cid: 6089, name: 'N,N-Dimethyltryptamine' }]);
});
