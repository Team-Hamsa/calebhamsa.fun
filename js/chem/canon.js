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
 * orders. Molecules in the name lists have 8 non-H atoms at most, so only
 * those get step 3. Bigger ones (Caleb can draw a big ring on the board!)
 * get a quicker label made from their teams alone. It's still the same
 * however the molecule is built; two different big inventions might
 * share one, which is harmless (they're inventions either way).
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
    // Too big to try every order: describe each atom by its team and its
    // neighbors' teams, and sort those descriptions.
    const kinds = heavy.map((index, h) => `${atoms[index].el}${hCount[h]}`);
    const described = heavy.map((_, h) => `${color[h]}<${links[h].map(({ to, order }) => `${color[to]}:${order}`).sort().join(',')}>`);
    return `${kinds.sort().join(',')}|~${described.sort().join(';')}`;
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
