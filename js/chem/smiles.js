/**
 * smiles.js — reads molecules written as SMILES, the one-line way
 * chemists type molecules.
 *
 *   O        water (H's are added for you: O has 2 hands, so 2 H's)
 *   CCO      alcohol: C–C–O, plus all the H's
 *   O=C=O    carbon dioxide: "=" is a double bond
 *   N#N      the nitrogen in the air: "#" is a triple bond
 *   CC(C)O   a branch: the (C) hangs off the middle C
 *   C1CCC1   a ring: the two 1's join up
 *   [H][H]   hydrogen gas (atoms in [ ] get no extra H's)
 *
 *   [SiH4]   silane: some atoms (like Si) are always written in [ ]
 *   OS(=O)(=O)O  sulfuric acid: this S uses 6 hands, not 2
 *
 * We only read the little bit of SMILES the chemistry room needs: the
 * atoms H C N O S Cl F Br I B Si P, single/double/triple bonds,
 * branches and rings. Anything else (charges, lowercase "aromatic"
 * atoms, other elements) stops with an error, so a typo in kid-names.js
 * can't sneak through.
 *
 * We can WRITE SMILES too (writeSmiles), to ask PubChem what a big
 * molecule is called.
 *
 * The answer is a "molecule graph": a list of atoms and a list of bonds
 * (which two atoms, and 1, 2 or 3 sticks), with every H written out as
 * its own atom, just like on Caleb's board.
 */

/**
 * How many hands (bonds) each atom has.
 * 🧪 Try this! Real chemistry says these numbers. What would change if
 *    oxygen had 3 hands?
 */
export const HANDS = { H: 1, C: 4, N: 3, O: 2, S: 2, Cl: 1, F: 1, Br: 1, I: 1, B: 3, Si: 4, P: 3 };

/**
 * Sulfur and phosphorus can grow extra hands: these are every number of
 * hands they can have. (On the board, tap one with 🔗 to grow two more.)
 * Real sulfur in sulfuric acid uses 6 hands; phosphorus in the
 * phosphoric acid in cola uses 5.
 */
export const HAND_STEPS = { S: [2, 4, 6], P: [3, 5] };

/**
 * Every number of hands an atom can have.
 * @param {string} el - an element, like 'S'
 * @returns {number[]} smallest first (just one number for most atoms)
 */
export function handChoices(el) {
  return HAND_STEPS[el] ?? (HANDS[el] ? [HANDS[el]] : []);
}

/** Atoms written in SMILES without [ ] (the "organic subset"). Si isn't one. */
const PLAIN_ATOMS = ['Cl', 'Br', 'B', 'C', 'N', 'O', 'S', 'P', 'F', 'I'];

/**
 * Read a SMILES string into a molecule graph.
 * @param {string} smiles - e.g. 'CCO'
 * @returns {{atoms: {el: string}[], bonds: {a: number, b: number, order: number}[]}}
 *   every atom (H's included) and every bond
 * @throws {Error} if the text uses anything we don't read, or an atom has too many bonds
 */
export function parseSmiles(smiles) {
  const atoms = []; // {el, bracket, hCount}
  const bonds = [];
  const branchStack = []; // atoms to go back to after a ")"
  const openRings = new Map(); // ring digit → {atom, order}
  let previous = -1; // the atom the next one bonds to (-1 = none)
  let pendingOrder = 0; // a "=" or "#" waiting for the next atom (0 = plain)
  let i = 0;

  /**
   * Add an atom and bond it to the previous one.
   * @param {string} el - element symbol
   * @param {boolean} bracket - written in [ ], so it gets no automatic H's
   * @param {number} hCount - H's written inside the brackets
   * @returns {void}
   */
  const addAtom = (el, bracket, hCount) => {
    const index = atoms.length;
    atoms.push({ el, bracket, hCount });
    if (previous >= 0) bonds.push({ a: previous, b: index, order: pendingOrder || 1 });
    previous = index;
    pendingOrder = 0;
  };

  while (i < smiles.length) {
    const ch = smiles[i];
    const plain = PLAIN_ATOMS.find((el) => smiles.startsWith(el, i)); // 'Cl' and 'Br' come first, so they win
    if (plain) {
      addAtom(plain, false, 0);
      i += plain.length;
    } else if (ch === '[') {
      const close = smiles.indexOf(']', i);
      const inside = close < 0 ? '' : smiles.slice(i + 1, close);
      const match = inside.match(/^(Cl|Br|Si|[HBCNOSPFI])(?:H(\d?))?$/);
      if (!match) throw new Error(`Can't read [${inside}] in ${smiles}`);
      const hCount = match[2] === undefined ? 0 : Number(match[2] || 1);
      addAtom(match[1], true, hCount);
      i = close + 1;
    } else if (ch === '-' || ch === '=' || ch === '#' || ch === '/' || ch === '\\') {
      // "/" and "\\" are single bonds that say which way round a double
      // bond sits in 3D. The board is flat, so they're just single bonds.
      pendingOrder = { '-': 1, '=': 2, '#': 3, '/': 1, '\\': 1 }[ch];
      i += 1;
    } else if (ch === '(') {
      branchStack.push(previous);
      i += 1;
    } else if (ch === ')') {
      if (branchStack.length === 0) throw new Error(`Extra ")" in ${smiles}`);
      previous = branchStack.pop();
      i += 1;
    } else if ((ch >= '1' && ch <= '9') || ch === '%') {
      // A ring number: 1–9, or % and two digits (%10, %11…) for lots of rings.
      const digit = ch === '%' ? smiles.slice(i, i + 3) : ch;
      if (ch === '%' && !/^%\d\d$/.test(digit)) throw new Error(`Can't read ${digit} in ${smiles}`);
      if (previous < 0) throw new Error(`Ring number before any atom in ${smiles}`);
      const open = openRings.get(digit);
      if (open) {
        const order = pendingOrder || open.order || 1;
        bonds.push({ a: open.atom, b: previous, order });
        openRings.delete(digit);
      } else {
        openRings.set(digit, { atom: previous, order: pendingOrder });
      }
      pendingOrder = 0;
      i += digit.length;
    } else {
      throw new Error(`Can't read "${ch}" in ${smiles}`);
    }
  }
  if (branchStack.length > 0) throw new Error(`Missing ")" in ${smiles}`);
  if (openRings.size > 0) throw new Error(`Ring not closed in ${smiles}`);

  // Count each atom's sticks, then fill its spare hands with H atoms.
  // An atom without [ ] gets the fewest hands it can have that still
  // holds all its sticks (S with 4 sticks gets 4 hands, so no H's).
  // An atom in [ ] gets exactly the H's written, and must add up to one
  // of its hand numbers.
  const used = atoms.map(() => 0);
  for (const { a, b, order } of bonds) {
    used[a] += order;
    used[b] += order;
  }
  const heavyCount = atoms.length;
  for (let index = 0; index < heavyCount; index += 1) {
    const { el, bracket, hCount } = atoms[index];
    const choices = handChoices(el);
    const hands = bracket ? used[index] + hCount : choices.find((n) => n >= used[index]);
    if (!choices.includes(hands)) throw new Error(`${el} has the wrong number of bonds in ${smiles}`);
    const hydrogens = hands - used[index];
    for (let h = 0; h < hydrogens; h += 1) {
      const hIndex = atoms.length;
      atoms.push({ el: 'H', bracket: true, hCount: 0 });
      bonds.push({ a: index, b: hIndex, order: 1 });
    }
  }
  return { atoms: atoms.map(({ el }) => ({ el })), bonds };
}

/**
 * Write a molecule as SMILES (the opposite of parseSmiles). H's are
 * folded into the atom they hold, double bonds are written "=", and every
 * ring gets a number. It doesn't come out the same for every way of
 * building the molecule: PubChem tidies that up itself.
 * @param {{atoms: {el: string}[], bonds: {a: number, b: number, order: number}[]}} graph
 *   every atom (H's included) and every bond, all in one piece
 * @returns {string} e.g. 'C(O)C' for alcohol
 */
export function writeSmiles(graph) {
  const { atoms, bonds } = graph;
  if (atoms.every(({ el }) => el === 'H')) return '[H]'.repeat(atoms.length);

  // Fold H's into counts, and list each heavy atom's heavy neighbors.
  const hCount = atoms.map(() => 0);
  const used = atoms.map(() => 0); // sticks to heavy atoms
  const links = atoms.map(() => []); // [{to, order}]
  for (const { a, b, order } of bonds) {
    if (atoms[a].el === 'H') hCount[b] += 1;
    else if (atoms[b].el === 'H') hCount[a] += 1;
    else {
      links[a].push({ to: b, order });
      links[b].push({ to: a, order });
      used[a] += order;
      used[b] += order;
    }
  }
  const start = atoms.findIndex(({ el }) => el !== 'H');

  // Pass 1: walk the molecule (depth first). A bond back to an atom
  // already visited is a ring bond: it gets a number instead.
  const seen = new Set([start]);
  const children = atoms.map(() => []);
  const rings = atoms.map(() => []); // [{to, order}] ring bonds at each atom
  const walk = [{ atom: start, parent: -1 }];
  // An explicit to-do list (not a function calling itself), so a long
  // chain can't overflow.
  while (walk.length > 0) {
    const { atom, parent } = walk.pop();
    if (parent >= 0) children[parent].push(atom);
    for (const { to, order } of links[atom]) {
      if (to === parent || rings[atom].some((r) => r.to === to)) continue;
      if (seen.has(to)) {
        rings[atom].push({ to, order });
        rings[to].push({ to: atom, order });
      } else {
        seen.add(to);
        walk.push({ atom: to, parent: atom });
      }
    }
  }

  // Pass 2: write it out, following the same walk.
  const free = []; // ring numbers we can use again
  let next = 1;
  const open = new Map(); // "a,b" → ring number while that ring is open
  const written = new Set();
  /**
   * The text for one atom, ring numbers, and everything hanging off it.
   * @param {number} atom - which atom
   * @returns {string} its SMILES
   */
  const write = (atom) => {
    written.add(atom);
    let text = atomText(atoms[atom].el, hCount[atom], used[atom]);
    for (const { to, order } of rings[atom]) {
      const key = atom < to ? `${atom},${to}` : `${to},${atom}`;
      if (open.has(key)) { // the ring closes here
        const number = open.get(key);
        open.delete(key);
        free.push(number);
        free.sort((x, y) => x - y);
        text += ringNumber(number);
      } else { // the ring opens here: the bond's sticks go on the opening
        const number = free.length ? free.shift() : next++;
        open.set(key, number);
        text += BOND_MARK[order] + ringNumber(number);
      }
    }
    const kids = children[atom];
    kids.forEach((kid, k) => {
      const { order } = links[atom].find((l) => l.to === kid);
      const branch = BOND_MARK[order] + write(kid);
      text += k < kids.length - 1 ? `(${branch})` : branch;
    });
    return text;
  };
  return write(start);
}

/** How each bond is written: single bonds need nothing. */
const BOND_MARK = { 1: '', 2: '=', 3: '#' };

/**
 * A ring number as SMILES writes it: 1–9, then %10, %11…
 * @param {number} number - the ring number
 * @returns {string} e.g. '3' or '%12'
 */
function ringNumber(number) {
  return number < 10 ? String(number) : `%${number}`;
}

/**
 * One atom as SMILES: plain ("S") when a reader would work out the right
 * H's by itself, or in [ ] with its H's ("[SH2]", "[SiH3]") when not.
 * @param {string} el - the element
 * @param {number} h - how many H's it holds
 * @param {number} used - sticks to non-H atoms
 * @returns {string} e.g. 'C', '[SH2]'
 */
function atomText(el, h, used) {
  const guess = handChoices(el).find((n) => n >= used);
  if (PLAIN_ATOMS.includes(el) && guess === used + h) return el;
  return `[${el}${h ? `H${h > 1 ? h : ''}` : ''}]`;
}
