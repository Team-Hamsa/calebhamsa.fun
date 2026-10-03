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
 * We only read the little bit of SMILES the chemistry room needs: the
 * atoms H C N O S Cl, single/double/triple bonds, branches and rings.
 * Anything else (charges, lowercase "aromatic" atoms, other elements)
 * stops with an error, so a typo in kid-names.js can't sneak through.
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
export const HANDS = { H: 1, C: 4, N: 3, O: 2, S: 2, Cl: 1 };

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
    if (ch === 'C' && smiles[i + 1] === 'l') {
      addAtom('Cl', false, 0);
      i += 2;
    } else if ('CNOS'.includes(ch)) {
      addAtom(ch, false, 0);
      i += 1;
    } else if (ch === '[') {
      const close = smiles.indexOf(']', i);
      const inside = close < 0 ? '' : smiles.slice(i + 1, close);
      const match = inside.match(/^(Cl|H|C|N|O|S)(?:H(\d?))?$/);
      if (!match) throw new Error(`Can't read [${inside}] in ${smiles}`);
      const hCount = match[2] === undefined ? 0 : Number(match[2] || 1);
      addAtom(match[1], true, hCount);
      i = close + 1;
    } else if (ch === '-' || ch === '=' || ch === '#') {
      pendingOrder = { '-': 1, '=': 2, '#': 3 }[ch];
      i += 1;
    } else if (ch === '(') {
      branchStack.push(previous);
      i += 1;
    } else if (ch === ')') {
      if (branchStack.length === 0) throw new Error(`Extra ")" in ${smiles}`);
      previous = branchStack.pop();
      i += 1;
    } else if (ch >= '1' && ch <= '9') {
      if (previous < 0) throw new Error(`Ring number before any atom in ${smiles}`);
      const open = openRings.get(ch);
      if (open) {
        const order = pendingOrder || open.order || 1;
        bonds.push({ a: open.atom, b: previous, order });
        openRings.delete(ch);
      } else {
        openRings.set(ch, { atom: previous, order: pendingOrder });
      }
      pendingOrder = 0;
      i += 1;
    } else {
      throw new Error(`Can't read "${ch}" in ${smiles}`);
    }
  }
  if (branchStack.length > 0) throw new Error(`Missing ")" in ${smiles}`);
  if (openRings.size > 0) throw new Error(`Ring not closed in ${smiles}`);

  // Count each atom's sticks, then fill its spare hands with H atoms.
  const used = atoms.map(() => 0);
  for (const { a, b, order } of bonds) {
    used[a] += order;
    used[b] += order;
  }
  const heavyCount = atoms.length;
  for (let index = 0; index < heavyCount; index += 1) {
    const { el, bracket, hCount } = atoms[index];
    const spare = HANDS[el] - used[index];
    const hydrogens = bracket ? hCount : spare;
    if (spare < 0 || (bracket && hCount !== spare)) {
      throw new Error(`${el} has the wrong number of bonds in ${smiles}`);
    }
    for (let h = 0; h < hydrogens; h += 1) {
      const hIndex = atoms.length;
      atoms.push({ el: 'H', bracket: true, hCount: 0 });
      bonds.push({ a: index, b: hIndex, order: 1 });
    }
  }
  return { atoms: atoms.map(({ el }) => ({ el })), bonds };
}
