/**
 * lookup.js — "what did Caleb just make?"
 *
 * A finished molecule's label (see canon.js) is checked in order:
 *   1. 📖 the hand-written list (kid-names.js): a kid name and a fun fact
 *   2. 🌟 the big list (data/molecules/): its real chemistry name
 *   3. ⏳ the big list hasn't loaded yet (no internet the first time):
 *      we'll check again later, so it's never called an invention by mistake
 *   4. 💡 8 non-H atoms or fewer, and not in the big list: Caleb invented
 *      it! (The big list has EVERY named molecule that small.)
 *   5. More than 8 non-H atoms: too big for the big list, so we ask
 *      PubChem on the internet (pubchem.js). Its answers are kept in the
 *      book (`asked`): a name makes it 🌟, "never heard of it" makes it 💡,
 *      and no answer yet keeps it ⏳.
 *
 * The big list is split into DATABASE_PARTS files, so the iPad reads it a
 * bit at a time instead of freezing while it reads one huge file.
 */
import { canonLabel, FULL_SEARCH_MAX, heavyCount } from './canon.js';
import { KID_MOLECULES } from './kid-names.js';
import { parseSmiles } from './smiles.js';

/**
 * How many files the big list is split into.
 * (tools/chem-db/make-db.js splits it the same way: change both.)
 */
export const DATABASE_PARTS = 16;

/**
 * Which part of the big list a label lives in. Mixes up the label's
 * letters into one number (the "FNV-1a hash"), so labels spread out
 * evenly over the parts, and the same label always lands in the same part.
 * @param {string} label - a label from canon.js
 * @returns {number} 0 up to DATABASE_PARTS − 1
 */
export function partOf(label) {
  let hash = 2166136261;
  for (let i = 0; i < label.length; i += 1) {
    hash ^= label.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash % DATABASE_PARTS;
}

/**
 * Where one part of the big list lives, next to chem.html.
 * @param {number} part - which part
 * @returns {string} e.g. 'data/molecules/3.json'
 */
export function partUrl(part) {
  return `data/molecules/${part}.json`;
}

/**
 * Split a label → name list into its parts.
 * @param {Record<string, string>} names - label → name
 * @returns {Record<string, string>[]} DATABASE_PARTS lists, each label in partOf(label)
 */
export function splitParts(names) {
  const parts = Array.from({ length: DATABASE_PARTS }, () => ({}));
  for (const [label, name] of Object.entries(names)) parts[partOf(label)][label] = name;
  return parts;
}

/**
 * Every label one hand-written molecule can have (one per way to build it).
 * @param {{smiles: string, forms?: string[]}} entry - a hand-written molecule
 * @returns {string[]} its labels
 */
export function labelsOf(entry) {
  return [entry.smiles, ...(entry.forms ?? [])].map((smiles) => canonLabel(parseSmiles(smiles)));
}

/**
 * Work out the labels of every hand-written molecule.
 * @param {{smiles: string, forms?: string[]}[]} [list] - the hand-written molecules
 * @returns {Map<string, object>} label → its entry from the list
 */
export function kidIndex(list = KID_MOLECULES) {
  return new Map(list.flatMap((entry) => labelsOf(entry).map((label) => [label, entry])));
}

/**
 * Look a label up.
 * @param {string} label - a finished molecule's label
 * @param {Map<string, object>} kids - from kidIndex()
 * @param {{parts: Record<string, string>[]}|null} database - the big list, or null if not loaded yet
 * @param {Record<string, {cid: number, name?: string}>} [asked] - PubChem's answers so far (label → answer)
 * @returns {{kind: 'found', entry: object}|{kind: 'rare', name: string, cid?: number}|{kind: 'pending', ask?: boolean}|{kind: 'invention'}}
 *   what it is (ask: true means "ask PubChem about this one")
 */
export function lookUp(label, kids, database, asked = {}) {
  if (kids.has(label)) return { kind: 'found', entry: kids.get(label) };
  if (heavyCount(label) > FULL_SEARCH_MAX) {
    const answer = Object.hasOwn(asked, label) ? asked[label] : null;
    if (!answer) return { kind: 'pending', ask: true };
    return answer.name ? { kind: 'rare', name: answer.name, cid: answer.cid } : { kind: 'invention' };
  }
  if (!database) return { kind: 'pending' };
  const part = database.parts[partOf(label)];
  if (Object.hasOwn(part, label)) return { kind: 'rare', name: part[label] };
  return { kind: 'invention' };
}

/**
 * Fetch the big list. All the parts download at the same time (much
 * faster on slow Wi-Fi), but they're read one after another, so the page
 * gets a breather between parts. Never throws: no internet just means null.
 * @param {Function} [fetchFn] - fetch (the tests hand in a pretend one)
 * @returns {Promise<{parts: Record<string, string>[]}|null>} the list, or null if any part couldn't be loaded
 */
export async function loadDatabase(fetchFn = globalThis.fetch) {
  // Start every download now. A part that can't be fetched becomes null
  // (not an error), so nothing is left failing with no one listening.
  const downloads = Array.from({ length: DATABASE_PARTS }, (_, part) => {
    try {
      return Promise.resolve(fetchFn(partUrl(part))).catch(() => null);
    } catch {
      return Promise.resolve(null);
    }
  });
  const parts = [];
  try {
    for (const download of downloads) {
      const response = await download;
      if (!response?.ok) return null;
      const list = await response.json();
      if (!list || typeof list !== 'object' || Array.isArray(list)) return null;
      parts.push(list);
    }
  } catch {
    return null;
  }
  return { parts };
}
