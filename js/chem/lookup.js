/**
 * lookup.js — "what did Caleb just make?"
 *
 * A finished molecule's label (see canon.js) is checked in order:
 *   1. 📖 the hand-written list (kid-names.js): a kid name and a fun fact
 *   2. 🌟 the big list (data/molecules.json): its real chemistry name
 *   3. ⏳ the big list hasn't loaded yet (no internet the first time):
 *      we'll check again later, so it's never called an invention by mistake
 *   4. 💡 nobody has a name for it: Caleb invented it!
 */
import { canonLabel } from './canon.js';
import { KID_MOLECULES } from './kid-names.js';
import { parseSmiles } from './smiles.js';

/** Where the big list lives, next to chem.html. */
export const DATABASE_URL = 'data/molecules.json';

/**
 * Work out the label of every hand-written molecule.
 * @param {{smiles: string}[]} [list] - the hand-written molecules
 * @returns {Map<string, object>} label → its entry from the list
 */
export function kidIndex(list = KID_MOLECULES) {
  return new Map(list.map((entry) => [canonLabel(parseSmiles(entry.smiles)), entry]));
}

/**
 * Look a label up.
 * @param {string} label - a finished molecule's label
 * @param {Map<string, object>} kids - from kidIndex()
 * @param {Record<string, string>|null} database - the big list, or null if not loaded yet
 * @returns {{kind: 'found', entry: object}|{kind: 'rare', name: string}|{kind: 'pending'}|{kind: 'invention'}}
 *   what it is
 */
export function lookUp(label, kids, database) {
  if (kids.has(label)) return { kind: 'found', entry: kids.get(label) };
  if (!database) return { kind: 'pending' };
  if (Object.hasOwn(database, label)) return { kind: 'rare', name: database[label] };
  return { kind: 'invention' };
}

/**
 * Fetch the big list. Never throws: no internet just means null.
 * @param {Function} [fetchFn] - fetch (the tests hand in a pretend one)
 * @param {string} [url] - where the list is
 * @returns {Promise<Record<string, string>|null>} the list, or null if it couldn't be loaded
 */
export async function loadDatabase(fetchFn = globalThis.fetch, url = DATABASE_URL) {
  try {
    const response = await fetchFn(url);
    if (!response.ok) return null;
    const list = await response.json();
    return list && typeof list === 'object' ? list : null;
  } catch {
    return null;
  }
}
