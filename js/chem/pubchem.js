/**
 * pubchem.js — asks PubChem what a big molecule is called.
 *
 * PubChem (pubchem.ncbi.nlm.nih.gov) is the US government's free
 * chemistry library. It knows over 100 million molecules. The room's own
 * list only has molecules with up to 8 non-H atoms, so when Caleb builds
 * something bigger (like DMT, with 14) we send PubChem the molecule
 * written as SMILES and it sends back the name, if it knows one.
 *
 * Being polite to PubChem (it asks for at most 5 questions a second):
 *   * only finished molecules are asked about, never every tap
 *   * each molecule is asked about once (the answer is kept in the book)
 *   * one question at a time, with a little wait in between
 *
 * Nothing here touches the page; the tests hand in a pretend fetch.
 */
import { labelGraph } from './canon.js';
import { writeSmiles } from './smiles.js';

/** The start of every PubChem question. */
const PUBCHEM_ADDRESS = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles/';

/**
 * How long to wait for PubChem before giving up (and trying later), in ms.
 * 🧪 Try this! 1 gives up almost straight away: every big molecule waits ⏳.
 */
const ANSWER_MS = 8000;

/**
 * Some PubChem "titles" are just a number from a catalog, not a name
 * ("CID 123", "SCHEMBL12345", "GlyTouCan:G26468BC"). Those count as "no name".
 */
const CATALOG_CODE = /^(CID \d+|NSC \d+|(SCHEMBL|CHEMBL|ZINC|DTXSID|DTXCID|AKOS|MFCD|BDBM|HMS|MLS|SMR|NCGC|EINECS|UNII)[-\dA-Z]*\d|[A-Za-z]+:\S+)$/;

/**
 * "This name is for both mirror-image twins": DL-, (+-), (±), rac-.
 * The board is flat, so it can't tell the twins apart anyway: we drop it
 * ("DL-Nicotine" → "Nicotine").
 */
const BOTH_TWINS = /^(?:(?:dl|rac)-|\((?:\+-|\+\/-|±|rs|r,s)\)-?)\s*/i;

/**
 * The longest name we'll pick from PubChem's other names (same as the
 * longest name Caleb can type for an invention).
 */
const PLAIN_NAME_MAX = 30;

/**
 * How many of PubChem's other names to look through. They come most-used
 * first, so the plain name (if there is one) is near the top.
 */
const SYNONYMS_LOOKED_AT = 15;

/**
 * Is this a chemist's "address" name, full of numbers and brackets, like
 * "3-(1-Methylpyrrolidin-2-yl)pyridine"? (Nicotine's real name!)
 * @param {string} name - a name
 * @returns {boolean} true if it has a digit or a bracket in it
 */
export function looksSystematic(name) {
  return /[\d()[\]{}]/.test(name);
}

/**
 * Tidy a name from PubChem: drop "DL-", and fix SHOUTING or all-small
 * letters ("DIMETHYLTRYPTAMINE", "nicotine") to start with one capital.
 * @param {string} name - a name from PubChem
 * @returns {string} the tidy name
 */
export function tidyName(name) {
  const bare = name.replace(BOTH_TWINS, '').trim();
  if (bare.length > 5 && bare === bare.toUpperCase()) return bare[0] + bare.slice(1).toLowerCase();
  if (bare === bare.toLowerCase()) return bare[0].toUpperCase() + bare.slice(1);
  return bare;
}

/**
 * Pick the everyday name from PubChem's list of other names: the first
 * one that's only letters, spaces and dashes (no numbers, brackets or
 * commas), and not too long.
 * @param {string[]} synonyms - PubChem's other names, most-used first
 * @returns {string|null} the tidy everyday name, or null if there isn't one
 */
export function plainName(synonyms) {
  for (const synonym of synonyms.slice(0, SYNONYMS_LOOKED_AT)) {
    if (typeof synonym !== 'string') continue;
    const name = synonym.replace(BOTH_TWINS, '').trim();
    if (/^[A-Za-z][A-Za-z -]*[A-Za-z]$/.test(name) && name.length <= PLAIN_NAME_MAX && !CATALOG_CODE.test(name)) return tidyName(name);
  }
  return null;
}

/**
 * The address that asks PubChem for all of a molecule's other names.
 * @param {number} cid - its PubChem number
 * @returns {string} the full https address
 */
export function synonymsUrl(cid) {
  return `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/synonyms/JSON`;
}

/**
 * How long to wait between two questions, in ms.
 */
const GAP_MS = 300;

/**
 * The address that asks PubChem for a molecule's name.
 * @param {string} smiles - the molecule
 * @returns {string} the full https address
 */
export function pubchemUrl(smiles) {
  // encodeURIComponent: "#" (a triple bond) and "=" must not be read as part of the address.
  return `${PUBCHEM_ADDRESS}${encodeURIComponent(smiles)}/property/Title/JSON`;
}

/**
 * Ask PubChem for one molecule's name. Never throws.
 *
 * PubChem's main name is sometimes a chemist's address name, because the
 * board is flat: nicotine without its 3D shape is filed as
 * "3-(1-Methylpyrrolidin-2-yl)pyridine". Then we ask a second time, for
 * its other names, and use the everyday one ("Nicotine") if there is one.
 * @param {string} smiles - the molecule
 * @param {Function} [fetchFn] - fetch (the tests hand in a pretend one)
 * @param {number} [timeoutMs] - how long to wait for an answer
 * @returns {Promise<{cid: number, name: string}|{cid: 0}|null>} its PubChem number (CID)
 *   and name; {cid: 0} if PubChem doesn't know it (an invention!); null if
 *   there was no answer (offline, busy, too slow): ask again later
 */
export async function askPubChem(smiles, fetchFn = globalThis.fetch, timeoutMs = ANSWER_MS) {
  let timer;
  const tooSlow = new Promise((resolve) => { timer = setTimeout(() => resolve(null), timeoutMs); });
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  try {
    const response = await Promise.race([fetchFn(pubchemUrl(smiles), { signal: controller?.signal }), tooSlow]);
    if (!response) return null;
    if (response.status === 400 || response.status === 404) {
      // PubChem couldn't read what we sent: either it can't be a real
      // molecule (like a sulfur holding 4 H's), or our SMILES writer has a bug.
      console.warn(`PubChem could not read ${smiles} (${response.status}): not a real molecule, or a SMILES writer bug`);
      return { cid: 0 };
    }
    if (!response.ok) return null;
    const body = await Promise.race([response.json(), tooSlow]);
    const first = body?.PropertyTable?.Properties?.[0];
    if (!first) return null;
    const name = typeof first.Title === 'string' && !CATALOG_CODE.test(first.Title) ? tidyName(first.Title) : null;
    if (!first.CID || !name) return { cid: 0 };
    if (!looksSystematic(name)) return { cid: first.CID, name };
    // A second, small question: its other names. No answer? Keep the address name.
    let synonyms = null;
    try {
      const more = await Promise.race([fetchFn(synonymsUrl(first.CID), { signal: controller?.signal }), tooSlow]);
      const list = more?.ok ? await Promise.race([more.json(), tooSlow]) : null;
      synonyms = list?.InformationList?.Information?.[0]?.Synonym;
    } catch {
      synonyms = null;
    }
    return { cid: first.CID, name: (Array.isArray(synonyms) && plainName(synonyms)) || name };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    controller?.abort(); // stop waiting for a slow answer we've given up on
  }
}

/**
 * Make an "asker": hand it labels, and it asks PubChem about each one,
 * one at a time, never the same label twice (until retry()).
 * @param {{fetchFn?: Function, onAnswer: Function, gapMs?: number, wait?: Function, timeoutMs?: number}} options
 *   fetchFn: fetch; onAnswer(label, answer): called with each answer
 *   (null = no answer); gapMs: wait between questions; wait(ms): how to
 *   wait (tests skip it); timeoutMs: see askPubChem
 * @returns {{ask: Function, retry: Function}} ask(label) → a promise that
 *   finishes when that question (and every one before it) is done;
 *   retry() lets labels that got no answer be asked again
 */
export function makeAsker({ fetchFn = globalThis.fetch, onAnswer, gapMs = GAP_MS, wait, timeoutMs = ANSWER_MS }) {
  const pause = wait ?? ((ms) => new Promise((resolve) => { setTimeout(resolve, ms); }));
  const asked = new Set();
  const unanswered = new Set();
  let line = Promise.resolve(); // the questions, one after another
  return {
    /**
     * Ask about one label (if it hasn't been asked already).
     * @param {string} label - a finished molecule's label
     * @returns {Promise<void>} finishes when the question has been answered
     */
    ask(label) {
      if (asked.has(label)) return line;
      asked.add(label);
      line = line.then(async () => {
        let answer = null;
        try {
          answer = await askPubChem(writeSmiles(labelGraph(label)), fetchFn, timeoutMs);
        } catch {
          answer = null;
        }
        if (answer === null) unanswered.add(label);
        try {
          onAnswer(label, answer);
        } catch (error) {
          console.error(error); // a mistake handling one answer mustn't stop the questions after it
        }
        await pause(gapMs);
      });
      return line;
    },
    /**
     * Forget which labels got no answer, so they can be asked again
     * (when the internet comes back, or the page opens).
     * @returns {void}
     */
    retry() {
      for (const label of unanswered) asked.delete(label);
      unanswered.clear();
    },
  };
}
