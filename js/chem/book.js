/**
 * book.js — the collection book, and which atoms are unlocked.
 *
 * The book remembers:
 *   found       labels of hand-written molecules Caleb has made (📖)
 *   pictures    label → layout: how he built each 📖 one
 *   rare        real molecules from the big list: {label, name, layout} (🌟)
 *   inventions  molecules nobody has named: {label, name, layout} (💡)
 *   pending     made while the big list wasn't loaded: {label, layout} (⏳)
 *   step        how far up the unlock LADDER he is
 *
 * A "layout" is the little picture of how he built it (board.js groupLayout).
 * Nothing here touches the web page.
 */

/**
 * The unlock ladder. Each step's goal must be met to reach it.
 * `goal(book)` answers true once it's met. Rare finds count too, but
 * inventions don't (nobody has checked them).
 * 🧪 Try this! Make carbon easier to unlock: change the 3 to a 1.
 */
export const LADDER = [
  { step: 1, unlocks: ['H', 'O'], hint: 'start', goal: () => true },
  { step: 2, unlocks: ['C'], hint: '💧 make water', goal: (book) => book.found.includes(WATER) },
  { step: 3, unlocks: ['N'], hint: '3 molecules with ⚫ carbon', goal: (book) => countWith(book, 'C') >= 3 },
  { step: 4, unlocks: ['Cl', 'S'], hint: '2 molecules with 🔵 nitrogen', goal: (book) => countWith(book, 'N') >= 2 },
];

/** Water's label (see canon.js): one O with two H's. */
export const WATER = 'O2|';

/** Every atom, in palette order. */
export const ALL_ATOMS = ['H', 'O', 'C', 'N', 'Cl', 'S'];

/**
 * A brand-new, empty book.
 * @returns {{step: number, found: string[], pictures: Record<string, object>, rare: object[], inventions: object[], pending: object[]}} the book
 */
export function createBook() {
  return { step: 1, found: [], pictures: {}, rare: [], inventions: [], pending: [] };
}

/**
 * Which elements a label has in it ("C1,Cl0|0-1:1" → C and Cl).
 * @param {string} label - a label from canon.js
 * @returns {Set<string>} the element symbols
 */
export function elementsIn(label) {
  if (/^H\d+$/.test(label)) return new Set(['H']);
  const atoms = label.split('|')[0].split(',');
  const elements = new Set(atoms.map((atom) => atom.match(/^[A-Z][a-z]?/)[0]));
  if (atoms.some((atom) => !atom.endsWith('0'))) elements.add('H'); // any H's on any atom
  return elements;
}

/**
 * How many different checked molecules (📖 and 🌟) contain an element.
 * @param {ReturnType<typeof createBook>} book - the book
 * @param {string} element - like 'C'
 * @returns {number} how many
 */
export function countWith(book, element) {
  const labels = [...book.found, ...book.rare.map((r) => r.label)];
  return labels.filter((label) => elementsIn(label).has(element)).length;
}

/**
 * The atoms Caleb can use now.
 * @param {ReturnType<typeof createBook>} book - the book
 * @returns {string[]} element symbols, in palette order
 */
export function unlockedAtoms(book) {
  const open = new Set(LADDER.filter((s) => s.step <= book.step).flatMap((s) => s.unlocks));
  return ALL_ATOMS.filter((el) => open.has(el));
}

/**
 * Climb the ladder as far as the goals allow.
 * @param {ReturnType<typeof createBook>} book - the book (changed in place)
 * @returns {string[]} atoms that just got unlocked (empty if none)
 */
export function climbLadder(book) {
  const unlocked = [];
  for (const rung of LADDER) {
    if (rung.step === book.step + 1 && rung.goal(book)) {
      book.step = rung.step;
      unlocked.push(...rung.unlocks);
    }
  }
  return unlocked;
}

/**
 * Put a finished molecule in the book.
 * @param {ReturnType<typeof createBook>} book - the book (changed in place)
 * @param {string} label - its label
 * @param {object} layout - the little picture of it
 * @param {{kind: string, name?: string}} result - what lookup.js said it is
 * @returns {{again: boolean, unlocked: string[], name: string|null}} whether
 *   it was already in the book, which atoms it unlocked, and its book name
 *   (for an invention: "Invention #n" or the name a grown-up gave it)
 */
export function record(book, label, layout, result) {
  let again = false;
  let name = result.name ?? null;
  if (result.kind === 'found') {
    again = book.found.includes(label);
    if (!again) {
      book.found.push(label);
      book.pictures[label] = layout;
    }
  } else if (result.kind === 'rare') {
    again = book.rare.some((r) => r.label === label);
    if (!again) book.rare.unshift({ label, name: result.name, layout });
  } else if (result.kind === 'invention') {
    const old = book.inventions.find((r) => r.label === label);
    again = Boolean(old);
    if (old) name = old.name;
    else {
      name = `Invention #${book.inventions.length + 1}`;
      book.inventions.unshift({ label, name, layout });
    }
  } else if (result.kind === 'pending') {
    again = book.pending.some((r) => r.label === label);
    if (!again) book.pending.push({ label, layout });
  }
  return { again, unlocked: climbLadder(book), name };
}

/**
 * The big list just arrived: sort out everything that was waiting (⏳).
 * @param {ReturnType<typeof createBook>} book - the book (changed in place)
 * @param {Function} look - label → lookup result (lookUp with the list filled in)
 * @returns {string[]} atoms this unlocked (rare finds count toward goals)
 */
export function resolvePending(book, look) {
  const waiting = book.pending;
  book.pending = [];
  const unlocked = [];
  for (const { label, layout } of waiting) {
    const result = look(label);
    if (result.kind === 'pending') book.pending.push({ label, layout }); // still not loaded
    else unlocked.push(...record(book, label, layout, result).unlocked);
  }
  return unlocked;
}

/**
 * The longest name an invention can have, so it still fits under its
 * picture in the book.
 * 🧪 Try this! Make it 10 and see a long name get cut short.
 */
export const INVENTION_NAME_MAX = 30;

/**
 * Give one of Caleb's inventions a new name (any of them, old or new).
 * @param {ReturnType<typeof createBook>} book - the book (changed in place)
 * @param {string} label - which invention (its label)
 * @param {string} name - the new name (spaces at the ends don't count)
 * @returns {boolean} true if it was renamed; false if the name was blank
 *   or there's no invention with that label
 */
export function renameInvention(book, label, name) {
  const trimmed = name.trim().slice(0, INVENTION_NAME_MAX).trim();
  const invention = book.inventions.find((r) => r.label === label);
  if (!invention || !trimmed) return false;
  invention.name = trimmed;
  return true;
}

/**
 * The 🔓 grown-up switch: unlock every atom.
 * @param {ReturnType<typeof createBook>} book - the book (changed in place)
 * @returns {void}
 */
export function unlockAll(book) {
  book.step = LADDER[LADDER.length - 1].step;
}
