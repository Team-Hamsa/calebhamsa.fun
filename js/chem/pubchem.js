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
      // PubChem couldn't read what we sent: our SMILES writer has a bug.
      console.warn(`PubChem could not read ${smiles} (${response.status})`);
      return { cid: 0 };
    }
    if (!response.ok) return null;
    const body = await Promise.race([response.json(), tooSlow]);
    const first = body?.PropertyTable?.Properties?.[0];
    if (!first) return null;
    const name = typeof first.Title === 'string' && !/^CID \d+$/.test(first.Title) ? first.Title : null;
    return first.CID && name ? { cid: first.CID, name } : { cid: 0 };
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
        onAnswer(label, answer);
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
