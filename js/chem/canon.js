/**
 * canon.js — gives every molecule one "label", the same however it was
 * built.
 *
 * Caleb can build water sideways, upside down, in a corner, or by placing
 * the H's first. It's still water. So before we look a molecule up, we
 * write it out in a standard way that only depends on WHICH atoms hold
 * hands with WHICH, never on where they sit. That standard text is the
 * label, and the molecule list (data/molecules.json) is keyed by it.
 *
 * How it works:
 *   1. Fold each H into a count on the atom it holds (CH₄ → "C with 4 H").
 *   2. Sort the other atoms into teams: atoms that look the same (same
 *      element, same H's, same kinds of neighbors) go in the same team.
 *      Keep splitting teams by their neighbors' teams until nothing changes.
 *   3. Teams have a fixed order. Inside a team, try every order of its
 *      atoms, write out the bond list each way, and keep the one that
 *      comes first alphabetically. Every way of building the molecule
 *      ends up at that same "first" list.
 *
 * Step 3 gets slow fast: a ring of 12 identical atoms has 479 million
 * orders. Molecules in the built-in list have 8 non-H atoms at most, so
 * only those get step 3 (and their labels must never change: the list
 * is keyed by them).
 *
 * Bigger ones (Caleb can build DMT, with 14!) get a cleverer search
 * (bigLabel below) that gives the same kind of label: still exact, so two
 * different molecules never share one, but it skips most of the orders:
 *   * Instead of trying every order of a whole team at once, pick ONE
 *     atom of the first team to go first, and let that split the other
 *     teams (atoms near it now look different from atoms far away).
 *     Repeat until every atom is in a team of its own: that's one order.
 *   * When two orders write the SAME bond list, the molecule has a
 *     symmetry (like a ring you can turn). Turning it can't give anything
 *     new, so choices that the symmetry turns into each other are skipped.
 */

/**
 * The most non-H atoms that get the full every-order search (step 3).
 * Must be at least the biggest molecule in data/molecules.json (8).
 */
export const FULL_SEARCH_MAX = 8;

/**
 * The label for a molecule.
 * @param {{atoms: {el: string}[], bonds: {a: number, b: number, order: number}[]}} graph
 *   every atom (H's included) and every bond
 * @returns {string} e.g. 'C1,C2,O1|0-1:1,1-2:1' (the exact text doesn't matter,
 *   only that the same molecule always gets the same text)
 */
export function canonLabel(graph) {
  const { atoms, bonds } = graph;
  const heavy = [];
  const heavyNumber = new Map(); // atom index → its place in `heavy`
  atoms.forEach((atom, index) => {
    if (atom.el !== 'H') {
      heavyNumber.set(index, heavy.length);
      heavy.push(index);
    }
  });
  if (heavy.length === 0) return `H${atoms.length}`; // H₂: just hydrogens

  // Step 1: H counts, and the bonds between non-H atoms.
  const hCount = heavy.map(() => 0);
  const links = heavy.map(() => []); // per heavy atom: [{to, order}]
  for (const { a, b, order } of bonds) {
    const ha = heavyNumber.get(a);
    const hb = heavyNumber.get(b);
    if (ha !== undefined && hb !== undefined) {
      links[ha].push({ to: hb, order });
      links[hb].push({ to: ha, order });
    } else if (ha !== undefined) hCount[ha] += 1;
    else if (hb !== undefined) hCount[hb] += 1;
  }

  // Step 2: teams ("colors"). Start from what each atom is, then split by neighbors.
  let color = rankStrings(heavy.map((index, h) => `${atoms[index].el}${hCount[h]}`));
  for (;;) {
    const next = rankStrings(heavy.map((_, h) => {
      const around = links[h].map(({ to, order }) => `${color[to]}:${order}`).sort();
      return `${color[h]}|${around.join(',')}`;
    }));
    if (new Set(next).size === new Set(color).size) break;
    color = next;
  }

  if (heavy.length > FULL_SEARCH_MAX) {
    return bigLabel(heavy.map((index, h) => `${atoms[index].el}${hCount[h]}`), links);
  }

  // Step 3: teams in order; try every order inside each team.
  const teams = [];
  for (let h = 0; h < heavy.length; h += 1) (teams[color[h]] ??= []).push(h);
  const atomText = teams.flatMap((team) => team.map((h) => `${atoms[heavy[h]].el}${hCount[h]}`)).join(',');

  let best = null;
  const position = heavy.map(() => -1); // heavy atom → its place in the label
  /**
   * Try every order of the atoms in teams[t] and the teams after it.
   * @param {number} t - which team to arrange next
   * @param {number} start - the first label place this team fills
   * @returns {void}
   */
  const arrange = (t, start) => {
    if (t === teams.length) {
      const text = bondText(links, position);
      if (best === null || text < best) best = text;
      return;
    }
    for (const order of permutations(teams[t])) {
      order.forEach((h, k) => { position[h] = start + k; });
      arrange(t + 1, start + teams[t].length);
    }
  };
  arrange(0, 0);
  return `${atomText}|${best}`;
}

/**
 * Turn strings into team numbers: equal strings get the same number,
 * and numbers follow alphabetical order (so they never depend on atom order).
 * @param {string[]} strings - one per atom
 * @returns {number[]} one team number per atom
 */
function rankStrings(strings) {
  const sorted = [...new Set(strings)].sort();
  return strings.map((s) => sorted.indexOf(s));
}

/**
 * Write the bond list using label places, sorted.
 * @param {{to: number, order: number}[][]} links - bonds per heavy atom
 * @param {number[]} position - each heavy atom's place in the label
 * @returns {string} e.g. '0-1:1,1-2:2'
 */
function bondText(links, position) {
  const parts = [];
  links.forEach((list, h) => {
    for (const { to, order } of list) {
      if (position[h] < position[to]) parts.push([position[h], position[to], order]);
    }
  });
  parts.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  return parts.map(([a, b, order]) => `${a}-${b}:${order}`).join(',');
}

/**
 * Every order of a list (for 3 items: 6 orders).
 * @param {number[]} items - the list
 * @returns {number[][]} every order
 */
function permutations(items) {
  if (items.length <= 1) return [items.slice()];
  const all = [];
  items.forEach((item, i) => {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const order of permutations(rest)) all.push([item, ...order]);
  });
  return all;
}

/**
 * The exact label for a big molecule (more than FULL_SEARCH_MAX non-H
 * atoms), found by splitting teams one atom at a time and skipping
 * choices that a symmetry makes the same. (Chemists' computers do it this
 * way too; the trick is called "individualization–refinement".)
 * @param {string[]} kinds - per non-H atom: element and H count, like 'C3'
 * @param {{to: number, order: number}[][]} links - bonds per non-H atom
 * @returns {string} the label: the same text format as small molecules
 */
function bigLabel(kinds, links) {
  const n = kinds.length;
  let best = null; // the first bond list (alphabetically) found so far
  let first = null; // the first order found, and its bond list
  const symmetries = []; // each one: atom → the atom it swaps with

  /**
   * Try every useful way to finish splitting these teams.
   * @param {number[]} color - each atom's team (teams are numbered in order)
   * @param {number[]} path - atoms already picked to go first in their team
   * @returns {void}
   */
  const search = (color, path) => {
    const sizes = new Map();
    for (const c of color) sizes.set(c, (sizes.get(c) ?? 0) + 1);
    if (sizes.size === n) {
      // Every atom has its own team: team number = place in the label.
      const text = bondText(links, color);
      if (first === null) first = { text, color };
      else if (text === first.text) symmetries.push(symmetryBetween(first.color, color));
      if (best === null || text < best) best = text;
      return;
    }
    // The first team that still has more than one atom.
    let team = Infinity;
    for (const [c, size] of sizes) if (size > 1 && c < team) team = c;
    const members = [];
    color.forEach((c, h) => { if (c === team) members.push(h); });
    const tried = [];
    for (const h of members) {
      if (tried.length && sameUnderSymmetry(h, tried, path, symmetries, n)) continue;
      tried.push(h);
      search(refine(pickFirst(color, h), links), [...path, h]);
    }
  };

  search(refine(rankStrings(kinds), links), []);
  // Every order puts the same kinds of atom in the same places, so any
  // order gives the atom list. The first one will do.
  const atomText = kinds.map((kind, h) => [first.color[h], kind]).sort((x, y) => x[0] - y[0]).map(([, kind]) => kind).join(',');
  return `${atomText}|${best}`;
}

/**
 * Keep splitting teams by their neighbors' teams until nothing changes.
 * Team numbers keep their order: a team that splits becomes neighboring
 * numbers in the same spot.
 * @param {number[]} color - each atom's team
 * @param {{to: number, order: number}[][]} links - bonds per atom
 * @returns {number[]} the new teams
 */
function refine(color, links) {
  // Padded numbers, so "10" sorts after "9" like a number would.
  const pad = (k) => String(k).padStart(4, '0');
  let count = new Set(color).size;
  for (;;) {
    const next = rankStrings(color.map((c, h) => {
      const around = links[h].map(({ to, order }) => `${pad(color[to])}:${order}`).sort();
      return `${pad(c)}|${around.join(',')}`;
    }));
    const nextCount = new Set(next).size;
    if (nextCount === count) return next;
    color = next;
    count = nextCount;
  }
}

/**
 * Put one atom first in its team (in a little team of its own).
 * @param {number[]} color - each atom's team
 * @param {number} chosen - the atom to go first
 * @returns {number[]} the new teams
 */
function pickFirst(color, chosen) {
  const pad = (k) => String(k).padStart(4, '0');
  return rankStrings(color.map((c, h) => `${pad(c)}${h === chosen ? 'a' : 'b'}`));
}

/**
 * Two orders that wrote the same bond list show a symmetry: the atom in
 * place k of one order swaps with the atom in place k of the other.
 * @param {number[]} placeA - each atom's place in the first order
 * @param {number[]} placeB - each atom's place in the second order
 * @returns {number[]} atom → the atom it swaps with
 */
function symmetryBetween(placeA, placeB) {
  const atomAt = [];
  placeB.forEach((place, h) => { atomAt[place] = h; });
  return placeA.map((place) => atomAt[place]);
}

/**
 * Can a symmetry we already know turn atom h into an atom we already
 * tried (without moving the atoms picked so far)? Then trying h would
 * only find the same labels again.
 * @param {number} h - the atom we might try
 * @param {number[]} tried - atoms already tried in this team
 * @param {number[]} path - atoms already picked (the symmetry must keep them still)
 * @param {number[][]} symmetries - the symmetries found so far
 * @param {number} n - how many atoms
 * @returns {boolean} true if h can be skipped
 */
function sameUnderSymmetry(h, tried, path, symmetries, n) {
  const group = Array.from({ length: n }, (_, k) => k); // "union-find": each atom's group leader
  const leader = (k) => {
    while (group[k] !== k) k = group[k] = group[group[k]];
    return k;
  };
  for (const symmetry of symmetries) {
    if (!path.every((p) => symmetry[p] === p)) continue;
    symmetry.forEach((to, from) => { group[leader(from)] = leader(to); });
  }
  return tried.some((t) => leader(t) === leader(h));
}

/**
 * How many non-H atoms a label's molecule has.
 * @param {string} label - a label from canonLabel
 * @returns {number} 0 for hydrogen gas
 */
export function heavyCount(label) {
  if (/^H\d+$/.test(label)) return 0;
  return label.split('|')[0].split(',').length;
}

/**
 * Turn a label back into a molecule graph (with every H written out),
 * so a molecule remembered only by its label can be written as SMILES.
 * @param {string} label - a label from canonLabel
 * @returns {{atoms: {el: string}[], bonds: {a: number, b: number, order: number}[]}} the molecule
 */
export function labelGraph(label) {
  if (/^H\d+$/.test(label)) return { atoms: [{ el: 'H' }, { el: 'H' }], bonds: [{ a: 0, b: 1, order: 1 }] };
  const [atomText, bondList] = label.split('|');
  const atoms = [];
  const bonds = [];
  const kinds = atomText.split(',').map((kind) => kind.match(/^([A-Z][a-z]?)(\d+)$/));
  for (const [, el] of kinds) atoms.push({ el });
  for (const part of bondList ? bondList.split(',') : []) {
    const [, a, b, order] = part.match(/^(\d+)-(\d+):(\d)$/).map(Number);
    bonds.push({ a, b, order });
  }
  kinds.forEach(([, , h], index) => {
    for (let k = 0; k < Number(h); k += 1) {
      bonds.push({ a: index, b: atoms.length, order: 1 });
      atoms.push({ el: 'H' });
    }
  });
  return { atoms, bonds };
}
