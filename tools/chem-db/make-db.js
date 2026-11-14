/**
 * make-db.js — turns tools/chem-db/export.py's list of molecules into
 * data/molecules/0.json … 15.json, the chemistry room's big name list
 * (split into parts, so the iPad never has to read one huge file).
 *
 * Each input line is: name <TAB> smiles|smiles|... (every Kekulé form).
 * Each form is read with the SAME smiles.js and labelled with the SAME
 * canon.js the room uses, so a molecule Caleb builds always finds its name.
 *
 * Run (from the repo folder):
 *   node tools/chem-db/make-db.js tools/chem-db/molecules.tsv
 * It writes data/molecules/ and says how many names it kept.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { canonLabel } from '../../js/chem/canon.js';
import { splitParts } from '../../js/chem/lookup.js';
import { parseSmiles } from '../../js/chem/smiles.js';

/**
 * PubChem's "title" for a compound nobody has named is just its number,
 * like "CID 53627737". That's no name for a 5-year-old, so those are left
 * out (the room calls them 💡 inventions instead).
 */
const NO_NAME = /^CID \d+$/;

/**
 * Build the label → name list from export.py's lines.
 * @param {string} text - the whole .tsv file
 * @returns {{names: Record<string, string>, clashes: number, skipped: string[]}}
 *   the list (sorted by label), how many labels two names wanted, and
 *   any SMILES our reader refused
 */
export function buildDatabase(text) {
  const names = new Map();
  let clashes = 0;
  const skipped = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const [name, forms] = line.split('\t');
    if (NO_NAME.test(name)) continue;
    for (const smiles of forms.split('|')) {
      let label;
      try {
        label = canonLabel(parseSmiles(smiles));
      } catch {
        skipped.push(smiles);
        continue;
      }
      // First name wins: export.py lists the oldest (most common) compounds first.
      if (!names.has(label)) names.set(label, name);
      else if (names.get(label) !== name) clashes += 1;
    }
  }
  const sorted = Object.fromEntries([...names].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  return { names: sorted, clashes, skipped };
}

/**
 * Read the .tsv named on the command line and write data/molecules/.
 * @returns {void}
 */
function main() {
  const input = process.argv[2];
  const { names, clashes, skipped } = buildDatabase(readFileSync(input, 'utf8'));
  const folder = new URL('../../data/molecules/', import.meta.url);
  rmSync(new URL('../../data/molecules.json', import.meta.url), { force: true }); // the old one-file list
  mkdirSync(folder, { recursive: true });
  splitParts(names).forEach((part, k) => writeFileSync(new URL(`${k}.json`, folder), `${JSON.stringify(part)}\n`));
  console.log(`${Object.keys(names).length} labels, ${clashes} clashes, ${skipped.length} skipped`);
  if (skipped.length) console.log('skipped (first 10):', skipped.slice(0, 10).join(' '));
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) main();
