# Chemistry Room (Phase 5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A 🧪 Chemistry room (`chem.html`) where Caleb places atom blocks that hold hands into molecules, hears their names, fills a collection book, and unlocks new atoms, backed by a 69,000-name PubChem list.

**Architecture:** Pure ES modules in `js/chem/` hold the logic: `smiles.js` reads molecules, `canon.js` labels them, `board.js` holds the grid and bonding rules, `book.js` handles the book and unlocks, `lookup.js` finds names, and `save.js` saves. `chem-art.js` draws and `room.js` is the only file that touches the page. A dev-only pipeline (`tools/chem-db/`: Python+RDKit export, then Node `make-db.js` using the *same* `smiles.js` + `canon.js`) produces `data/molecules.json`.

**Tech Stack:** Vanilla HTML/CSS/JS (ES modules, no build, no runtime dependencies), `node --test`, Canvas 2D, Web Speech API, `<dialog>`. Dev only: Python 3 + RDKit in a venv, and Playwright borrowed from `~/LFG/scripts/share_card/node_modules` for the headless check.

**Spec:** `docs/superpowers/specs/2026-10-03-chemistry-room-design.md`

**How this plan was made:** every file below was written and run in a scratch copy of the site first. With it, `npm test` passed 430 tests, a headless iPad run built water, O=O and allene (🌟) with no console errors, and the database built with 0 label clashes. The code here is that tested code.

## Refinements found while prototyping (these override the spec)

1. **Pulling apart (🔗):** with the spec's tap cycle (1 → 2 → 3 → back to 1), **benzene could not be built**. A 2×3 rectangle of carbons auto-bonds its middle rung. Now a tap that can't add a stick pulls the pair **APART** (bond value `-1`). Auto-bond skips apart pairs, and the next tap joins them again. Removing either atom forgets "apart".
2. **Book pictures for 📖 finds:** `book.pictures` (label → layout) stores how he built each hand-written molecule, so the Found tab can show his build.
3. **`data/molecules.json` is not precached.** `sw.js` serves `/data/*` stale-while-revalidate (saved copy first, refreshed in the background). The network-first rule's 3 s timeout would never let 0.84 MB finish on slow Wi-Fi, so it would never get saved.
4. **The database also covers every Kekulé form.** It has 69,700 labels for 69,153 molecules (o-xylene, naphthalene and others have two forms). On disk it's 6.7 MB raw, 0.84 MB gzipped. The labels are longer than estimated, but the download size is unchanged.
5. **Data tests:** the spec's "200 random rows recomputed" check needs the 3 GB source files. Instead, `chem-data.test.js` spot-checks famous molecules, both o-xylene forms, and that isobutane and neopentane are absent. 0 clashes across the whole build is checked by `make-db.js` at build time.
6. **Arynes:** `export.py` only swaps ring single/double bonds. An earlier version also reset ring *triple* bonds, which turned benzyne into cyclohexadiene and caused 60 label clashes.
7. **Fonts:** `chem.html` uses the Draw page's font link (with Andika, which is easier for a parent reading aloud), which `sw.js` already saves.

## Global Constraints

- Vanilla HTML/CSS/JS, ES modules, no build step, **no runtime dependencies**. RDKit is dev-only (`tools/chem-db/`) and never loaded by the site.
- A header comment on every file, a JSDoc `/** ... */` directly above **every** named function (`tests/docs.test.js`, now also recursing into `tools/`), and 🧪 "Try this!" comments on tweakable values.
- Page code touches the DOM only inside `initChem()` and functions it calls, so every `js/chem/` module imports cleanly in Node.
- Atoms and hands: H 1, C 4, N 3, O 2, S 2, Cl 1. Board 12 × 9. At most 8 heavy atoms in the database.
- Save key `calebhamsa.chem.v1`; a broken save is copied to `calebhamsa.chem.v1.broken`.
- `sw.js` `CACHE_NAME` goes `caleb-v5` → `caleb-v6`.
- **Git:** this is the personal site. Commit straight to `main` (no PR, no review bots), and push at the end of each task. **No Claude/AI attribution in commit messages** (user rule).
- Run the whole `npm test` before each commit. All of it must pass.

## Review Focus

These are risks the spec implies but unit tests can't fully cover, most likely first:

1. **No speech on iPad:** iPad Safari only speaks inside a user gesture. `speak()` runs synchronously from the tap that finished the molecule (pointerdown → `changeBoard` → `showNextCard` → `speak`), so it works there. Don't move it behind a `setTimeout`/`await`. *Pinned by:* Task 7's real-iPad checklist item ("says Water!").
2. **The big list on slow or no internet:** the first visit offline must show ⏳ (never 💡), and must resolve once online. *Pinned by:* `chem-book.test.js` "waiting molecules are sorted out…", `loadDatabase` null tests, the sw.js `/data/` strategy test, and the `online` listener in `room.js`.
3. **A drag that finishes several molecules at once** must cheer each one, with cards queued rather than lost. *Pinned by:* `chem-board.test.js` "one finger-drag can finish two molecules", plus the card queue in `room.js` (`state.cards`, shown again on dialog `close`).
4. **Old or odd saves:** a different board size, a corrupt save, or blocked storage must never crash and must keep the book where possible. *Pinned by:* `chem-save.test.js`.
5. **Benzene and other rings:** the middle rung auto-bonds. Caleb must be able to pull it apart and finish the ring. *Pinned by:* `chem-board.test.js` "benzene fits as a 2×3 ring…", and the README tip.

## File map

| File | Responsibility |
|---|---|
| `js/chem/smiles.js` | `HANDS`; `parseSmiles(text)` → molecule graph with explicit H's |
| `js/chem/canon.js` | `canonLabel(graph)` → one label per molecule |
| `js/chem/board.js` | grid, `APART`, auto-bond, place/remove/tapBond, groups, finished/stuck, layouts |
| `js/chem/kid-names.js` | `KID_MOLECULES`: 89 hand-written molecules (name, fact, step) |
| `js/chem/lookup.js` | `kidIndex`, `lookUp`, `loadDatabase` |
| `js/chem/book.js` | `LADDER`, `createBook`, `record`, `resolvePending`, unlocks |
| `js/chem/save.js` | `saveState`, `loadState` |
| `js/chem/chem-art.js` | `ATOM_INFO`, `drawBoard`, `drawAtom` |
| `js/chem/room.js` | `initChem()` + pure helpers `fitCellSize`, `bondTarget`, `atomHint`, `cardWords` |
| `chem.html` | page layout + three `<dialog>`s |
| `tools/chem-db/export.py` | PubChem → `molecules.tsv` (RDKit, dev only) |
| `tools/chem-db/make-db.js` | `molecules.tsv` → `data/molecules.json` via `smiles.js` + `canon.js` |
| `tools/chem-db/README.md` | how to rebuild the list |
| `data/molecules.json` | label → name (committed output) |
| modified | `sw.js`, `css/blocks.css`, `index.html`, `README.md`, `.gitignore`, `tests/{docs,pages,sw,modules}.test.js` |

---

### Task 1: SMILES reader and molecule labels

**Files:**
- Create: `js/chem/smiles.js`, `js/chem/canon.js`
- Test: `tests/chem-smiles.test.js`, `tests/chem-canon.test.js`

**Interfaces:**
- Produces: `HANDS` (`{H:1,C:4,N:3,O:2,S:2,Cl:1}`); `parseSmiles(smiles: string) → {atoms: {el}[], bonds: {a, b, order}[]}` (H's explicit; throws `Error` on anything outside the subset); `canonLabel(graph) → string` (`'H2'` for hydrogen gas; water is `'O2|'`).

- [ ] **Step 1: Write the failing tests**

`tests/chem-smiles.test.js`:

```js
/**
 * chem-smiles.test.js — checks the SMILES reader (js/chem/smiles.js):
 * it fills in the H's, reads double/triple bonds, branches and rings,
 * and refuses anything the chemistry room doesn't use.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSmiles } from '../js/chem/smiles.js';

/**
 * Count the atoms of each element, like { C: 2, H: 6, O: 1 }.
 * @param {{atoms: {el: string}[]}} graph - a molecule graph
 * @returns {Record<string, number>} element → how many
 */
function formula(graph) {
  const counts = {};
  for (const { el } of graph.atoms) counts[el] = (counts[el] ?? 0) + 1;
  return counts;
}

test('water: one O gets two H atoms', () => {
  const water = parseSmiles('O');
  assert.deepEqual(formula(water), { O: 1, H: 2 });
  assert.equal(water.bonds.length, 2);
});

test('alcohol (CCO) has 2 C, 6 H, 1 O and 8 bonds', () => {
  const ethanol = parseSmiles('CCO');
  assert.deepEqual(formula(ethanol), { C: 2, O: 1, H: 6 });
  assert.equal(ethanol.bonds.length, 8);
});

test('double and triple bonds', () => {
  assert.deepEqual(parseSmiles('O=C=O').bonds.map((b) => b.order), [2, 2]);
  assert.deepEqual(parseSmiles('N#N').bonds.map((b) => b.order), [3]);
  assert.deepEqual(formula(parseSmiles('C#N')), { C: 1, N: 1, H: 1 });
});

test('hydrogen gas written as [H][H]', () => {
  const h2 = parseSmiles('[H][H]');
  assert.deepEqual(formula(h2), { H: 2 });
  assert.deepEqual(h2.bonds, [{ a: 0, b: 1, order: 1 }]);
});

test('branches and rings', () => {
  assert.deepEqual(formula(parseSmiles('CC(C)O')), { C: 3, O: 1, H: 8 });
  const benzene = parseSmiles('C1=CC=CC=C1');
  assert.deepEqual(formula(benzene), { C: 6, H: 6 });
  assert.equal(benzene.bonds.filter((b) => b.order === 2).length, 3);
  assert.deepEqual(formula(parseSmiles('C=1CCC=1')), { C: 4, H: 6 }); // ring bond order on the digit
});

test('chlorine is one atom, not C then l', () => {
  assert.deepEqual(formula(parseSmiles('CCl')), { C: 1, Cl: 1, H: 3 });
});

test('refuses things the room does not use', () => {
  for (const bad of ['c1ccccc1', '[NH4+]', 'Na', 'C(C)(C)(C)(C)C', 'O=O=O', 'C1CC', 'C(C', 'CC)', 'F', '[2H]O']) {
    assert.throws(() => parseSmiles(bad), Error, bad);
  }
});
```

`tests/chem-canon.test.js`:

```js
/**
 * chem-canon.test.js — checks molecule labels (js/chem/canon.js): the
 * same molecule always gets the same label, however its atoms are
 * numbered, and different molecules get different labels.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonLabel } from '../js/chem/canon.js';
import { parseSmiles } from '../js/chem/smiles.js';

/**
 * Renumber a molecule's atoms in a random order and swap bond ends,
 * so it's the same molecule written down differently.
 * @param {{atoms: {el: string}[], bonds: {a: number, b: number, order: number}[]}} graph - a molecule
 * @param {number} seed - which shuffle (the same seed always shuffles the same way)
 * @returns {{atoms: {el: string}[], bonds: {a: number, b: number, order: number}[]}} the shuffled molecule
 */
function shuffle(graph, seed) {
  let state = seed;
  /**
   * A tiny repeatable random number generator.
   * @returns {number} a number from 0 up to (not including) 1
   */
  const random = () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
  const order = graph.atoms.map((_, i) => i).sort(() => random() - 0.5);
  const newIndex = new Map(order.map((old, k) => [old, k]));
  return {
    atoms: order.map((old) => graph.atoms[old]),
    bonds: graph.bonds
      .map(({ a, b, order: sticks }) => (random() < 0.5
        ? { a: newIndex.get(b), b: newIndex.get(a), order: sticks }
        : { a: newIndex.get(a), b: newIndex.get(b), order: sticks }))
      .sort(() => random() - 0.5),
  };
}

/**
 * The label for a SMILES string.
 * @param {string} smiles - e.g. 'CCO'
 * @returns {string} its label
 */
const label = (smiles) => canonLabel(parseSmiles(smiles));

test('the same molecule written many ways gets one label', () => {
  for (const smiles of ['O', 'CCO', 'C1=CC=CC=C1', 'CC(=O)O', 'OC(O)O', 'C1CCC1', 'NCC(=O)O', 'C=CC#N']) {
    const expected = label(smiles);
    for (let seed = 1; seed <= 20; seed += 1) {
      assert.equal(canonLabel(shuffle(parseSmiles(smiles), seed)), expected, `${smiles} seed ${seed}`);
    }
  }
});

test('different SMILES for the same molecule agree', () => {
  assert.equal(label('OCC'), label('CCO'));
  assert.equal(label('C(C)O'), label('CCO'));
  assert.equal(label('C=1C=CC=CC=1'), label('C1=CC=CC=C1'));
});

test('isomers (same atoms, joined differently) get different labels', () => {
  assert.notEqual(label('CCO'), label('COC')); // alcohol vs dimethyl ether
  assert.notEqual(label('CCCC'), label('CC(C)C')); // butane vs isobutane
  assert.notEqual(label('C=C'), label('CC')); // different H's
  assert.notEqual(label('C=CC=C'), label('C=C=CC'));
});

test('hydrogen gas has a label too', () => {
  assert.equal(label('[H][H]'), 'H2');
});

test('the two ways to draw o-xylene double bonds are different graphs', () => {
  // This is why tools/chem-db exports EVERY way: both must point to one name.
  assert.notEqual(label('CC1=CC=CC=C1C'), label('CC1=C(C)C=CC=C1'));
});

test('a ring of 8 identical atoms is still quick', () => {
  const started = Date.now();
  label('C1=CC=CC=CC=C1');
  assert.ok(Date.now() - started < 2000);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test tests/chem-smiles.test.js tests/chem-canon.test.js`
Expected: FAIL: `Cannot find module '../js/chem/smiles.js'`

- [ ] **Step 3: Write `js/chem/smiles.js`**

```js
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
```

- [ ] **Step 4: Write `js/chem/canon.js`**

```js
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
 * Molecules here are small (8 non-H atoms at most), so step 3 is quick.
 */

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
```

- [ ] **Step 5: Run the tests**

Run: `node --test tests/chem-smiles.test.js tests/chem-canon.test.js`
Expected: PASS: 13 tests, 0 failing

- [ ] **Step 6: Commit**

```bash
npm test
git add js/chem/smiles.js js/chem/canon.js tests/chem-smiles.test.js tests/chem-canon.test.js
git commit -m "Chemistry room: SMILES reader and molecule labels"
git push origin main
```

---

### Task 2: The chemistry board

**Files:**
- Create: `js/chem/board.js`
- Test: `tests/chem-board.test.js`

**Interfaces:**
- Consumes: `HANDS` from `smiles.js`; tests use `canonLabel`, `parseSmiles`.
- Produces: `BOARD_WIDTH` (12), `BOARD_HEIGHT` (9), `APART` (-1); `createBoard(w?, h?) → {width, height, atoms: (string|null)[], right: number[], down: number[]}`; `neighbors(board, i)`; `freeHands(board, i) → number`; `autoBond(board)`; `placeAtom(board, i, el) → boolean`; `removeAtom(board, i) → boolean`; `tapBond(board, a, b) → 1|2|3|APART|0`; `isStuck(board, i) → boolean`; `findGroups(board) → {cells: number[], finished: boolean, stuck: number[]}[]`; `groupGraph(board, cells) → graph`; `groupLayout(board, cells) → small board`; `newlyFinished(before, after) → groups`.

- [ ] **Step 1: Write the failing test**

```js
/**
 * chem-board.test.js — checks the chemistry board (js/chem/board.js):
 * atoms grab hands with side-by-side neighbors, bonds can be tapped up
 * to triple, finished and stuck atoms are found, and a molecule built
 * any way round gets the same label.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  APART, createBoard, findGroups, freeHands, groupGraph, groupLayout, newlyFinished, placeAtom, removeAtom, tapBond,
} from '../js/chem/board.js';
import { canonLabel } from '../js/chem/canon.js';
import { parseSmiles } from '../js/chem/smiles.js';

/**
 * Make a board and place atoms from a little picture, one row per string.
 * '.' is an empty cell, and Cl is written 'L'. Atoms go in row by row.
 * @param {string[]} rows - e.g. ['HOH']
 * @returns {ReturnType<typeof createBoard>} the board
 */
function build(rows) {
  const board = createBoard(8, 6);
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch !== '.') placeAtom(board, y * board.width + x, ch === 'L' ? 'Cl' : ch);
  }));
  return board;
}

/**
 * The cell number of (x, y) on an 8-wide board.
 * @param {number} x - across
 * @param {number} y - down
 * @returns {number} the cell number
 */
const at = (x, y) => y * 8 + x;

/**
 * The label of the only finished group on a board.
 * @param {ReturnType<typeof createBoard>} board - the board
 * @returns {string} its label
 */
function finishedLabel(board) {
  const finished = findGroups(board).filter((g) => g.finished);
  assert.equal(finished.length, 1, 'exactly one finished group');
  return canonLabel(groupGraph(board, finished[0].cells));
}

test('H–O–H in a row is water, and it is finished', () => {
  const board = build(['HOH']);
  assert.equal(finishedLabel(board), canonLabel(parseSmiles('O')));
});

test('water built bent, upside down, or somewhere else gets the same label', () => {
  const water = canonLabel(parseSmiles('O'));
  assert.equal(finishedLabel(build(['.H', 'HO'])), water);
  assert.equal(finishedLabel(build(['OH', 'H.'])), water);
  assert.equal(finishedLabel(build(['....', '...H', '...O', '...H'])), water);
});

test('a lone atom, or an atom with free hands, is not finished', () => {
  assert.equal(findGroups(build(['H'])).some((g) => g.finished), false);
  assert.equal(findGroups(build(['HO'])).some((g) => g.finished), false);
});

test('two H atoms make hydrogen gas', () => {
  assert.equal(finishedLabel(build(['HH'])), 'H2');
});

test('full atoms sit side by side without bonding', () => {
  const board = build(['HOH', 'HOH']);
  const groups = findGroups(board);
  assert.equal(groups.length, 2);
  assert.ok(groups.every((g) => g.finished));
});

test('tapping a bond: single → double, then apart when it cannot go higher, then joined again', () => {
  const board = build(['OO']);
  assert.equal(tapBond(board, at(0, 0), at(1, 0)), 2); // O=O
  assert.equal(finishedLabel(board), canonLabel(parseSmiles('O=O')));
  assert.equal(tapBond(board, at(0, 0), at(1, 0)), APART); // O has only 2 hands
  assert.equal(freeHands(board, at(0, 0)), 2);
  assert.equal(findGroups(board).length, 2); // two lone O atoms now
  assert.equal(tapBond(board, at(0, 0), at(1, 0)), 1);
});

test('nitrogen gas needs a triple bond', () => {
  const board = build(['NN']);
  tapBond(board, at(0, 0), at(1, 0));
  assert.equal(tapBond(board, at(0, 0), at(1, 0)), 3);
  assert.equal(finishedLabel(board), canonLabel(parseSmiles('N#N')));
  assert.equal(tapBond(board, at(0, 0), at(1, 0)), APART);
});

test('tapping an empty cell or atoms that are not side by side does nothing', () => {
  const board = build(['O.O']);
  assert.equal(tapBond(board, at(0, 0), at(1, 0)), 0);
  assert.equal(tapBond(board, at(0, 0), at(2, 0)), 0);
});

test('apart atoms stay apart, even with free hands, until tapped again', () => {
  const board = build(['HH']);
  assert.equal(tapBond(board, at(0, 0), at(1, 0)), APART); // H–H can't take a second stick
  placeAtom(board, at(3, 3), 'O'); // any change re-runs auto-bond
  assert.equal(freeHands(board, at(0, 0)), 1);
  removeAtom(board, at(1, 0)); // taking an atom away forgets "apart"
  placeAtom(board, at(1, 0), 'H');
  assert.equal(finishedLabel(board), 'H2');
});

test('a full pair that was never joined can be marked apart, and an apart pair with no free hands stays apart', () => {
  const board = build(['HOH', 'HOH']);
  assert.equal(tapBond(board, at(1, 0), at(1, 1)), APART);
  assert.equal(tapBond(board, at(1, 0), at(1, 1)), APART); // both full: can't join
});

test('pulling a bond apart lets the freed hands grab a neighbor', () => {
  // H–H on top, with another H under the left one (it's alone: its H friend is taken).
  const board = build(['HH', 'H.']);
  assert.equal(findGroups(board).filter((g) => g.finished).length, 1);
  tapBond(board, at(0, 0), at(1, 0)); // apart → top-left H grabs the H below it
  const finished = findGroups(board).filter((g) => g.finished);
  assert.deepEqual(finished.map((g) => g.cells), [[at(0, 0), at(0, 1)]]);
});

test('removing an atom frees its neighbors, who grab other hands', () => {
  // H–H on top; take one H away, and the other grabs the H below it.
  const board = build(['HH', 'H.']);
  assert.equal(findGroups(board).filter((g) => g.finished).length, 1);
  removeAtom(board, at(1, 0));
  assert.equal(finishedLabel(board), 'H2');
  assert.equal(removeAtom(board, at(5, 5)), false);
});

test('benzene fits as a 2×3 ring of carbons with their H atoms around it', () => {
  const board = createBoard(8, 6);
  // ring cells: (2,1)(3,1)(4,1)(4,2)(3,2)(2,2)
  for (const [x, y] of [[2, 1], [3, 1], [4, 1], [4, 2], [3, 2], [2, 2]]) placeAtom(board, at(x, y), 'C');
  // The two middle carbons grabbed hands across the ring: pull them apart.
  // (Each has 1 hand left, so the first tap makes a double bond; then they're full, so the next tap pulls apart.)
  assert.equal(tapBond(board, at(3, 1), at(3, 2)), 2);
  assert.equal(tapBond(board, at(3, 1), at(3, 2)), APART);
  // make it alternate: double bonds (2,1)=(3,1), (4,1)=(4,2), (3,2)=(2,2)
  tapBond(board, at(2, 1), at(3, 1));
  tapBond(board, at(4, 1), at(4, 2));
  tapBond(board, at(3, 2), at(2, 2));
  for (const [x, y] of [[1, 1], [3, 0], [5, 1], [5, 2], [3, 3], [1, 2]]) placeAtom(board, at(x, y), 'H');
  assert.equal(finishedLabel(board), canonLabel(parseSmiles('C1=CC=CC=C1')));
});

test('a free hand with no room left is stuck', () => {
  const methane = build(['.H.', 'HCH', '.H.']);
  assert.deepEqual(findGroups(methane)[0].stuck, []); // finished: nothing free

  // On a 3×2 board: water on top, then H . H below, then a C in the gap.
  // The C grabs both H's and still has 2 free hands, but above it is a
  // full O and below it is the board's edge: stuck.
  const board = createBoard(3, 2);
  for (const [cell, el] of [[0, 'H'], [1, 'O'], [2, 'H'], [3, 'H'], [5, 'H'], [4, 'C']]) placeAtom(board, cell, el);
  const ch2 = findGroups(board).find((g) => g.cells.includes(4));
  assert.deepEqual(ch2.stuck, [4]);
  assert.equal(ch2.finished, false);

  // A free hand next to an empty cell is not stuck.
  const open = build(['HO.']);
  assert.deepEqual(findGroups(open)[0].stuck, []);
});

test('newlyFinished cheers only for groups that just finished', () => {
  const board = build(['HOH']);
  const before = findGroups(board);
  placeAtom(board, at(5, 5), 'H');
  assert.deepEqual(newlyFinished(before, findGroups(board)), []);
  const before2 = findGroups(board);
  placeAtom(board, at(4, 5), 'H');
  assert.equal(newlyFinished(before2, findGroups(board)).length, 1);
});

test('groupLayout cuts out a small picture of the group', () => {
  const board = build(['....', '..H.', '.HO.']);
  const group = findGroups(board).find((g) => g.finished);
  const small = groupLayout(board, group.cells);
  assert.equal(small.width, 2);
  assert.equal(small.height, 2);
  assert.deepEqual(small.atoms, [null, 'H', 'H', 'O']);
  assert.deepEqual(small.right, [0, 0, 1, 0]);
  assert.deepEqual(small.down, [0, 1, 0, 0]);
});

test('one finger-drag can finish two molecules at once, and both are new', () => {
  // A PLACE drag across 4 cells puts down H H H H in one change.
  // Auto-bond pairs them up: (H–H)(H–H), two finished molecules.
  const board = createBoard(8, 6);
  const before = findGroups(board);
  for (let x = 0; x < 4; x += 1) placeAtom(board, at(x, 0), 'H');
  assert.equal(newlyFinished(before, findGroups(board)).length, 2);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test tests/chem-board.test.js`
Expected: FAIL: `Cannot find module '../js/chem/board.js'`

- [ ] **Step 3: Write `js/chem/board.js`**

```js
/**
 * board.js — the chemistry room's grid, and the rules for holding hands.
 *
 * The board is a grid of cells. A cell is empty (null) or holds one atom,
 * like 'O'. Atoms only hold hands with the atoms right beside them (left,
 * right, above, below — never diagonal). Bonds are kept in two lists:
 *
 *   right[i]  how many sticks join cell i to the cell on its right
 *   down[i]   how many sticks join cell i to the cell below it
 *
 * 0 means no sticks yet. APART (−1) means Caleb pulled those two atoms
 * apart with the bond tool, so they stay unjoined even with free hands
 * (that's how a ring of 6 can be a ring, and not grab across the middle).
 *
 * The big rule ("auto-bond"): whenever anything changes, any two
 * side-by-side atoms that both still have a free hand grab hands.
 *
 * A "group" is atoms joined by sticks. A group is FINISHED when every
 * hand in it is holding another hand. A free hand is STUCK when there's
 * no room left next to its atom for anything to hold it.
 *
 * Nothing in here touches the web page, so the tests can use it all.
 */
import { HANDS } from './smiles.js';

/**
 * How big the board is, in cells.
 * 🧪 Try this! A bigger board fits bigger molecules (the cells get smaller).
 */
export const BOARD_WIDTH = 12;
export const BOARD_HEIGHT = 9;

/** The most sticks one bond can have (a triple bond). */
const MAX_ORDER = 3;

/** A bond value meaning "pulled apart: don't grab hands here". */
export const APART = -1;

/**
 * Make an empty board.
 * @param {number} [width] - cells across
 * @param {number} [height] - cells down
 * @returns {{width: number, height: number, atoms: (string|null)[], right: number[], down: number[]}}
 */
export function createBoard(width = BOARD_WIDTH, height = BOARD_HEIGHT) {
  const size = width * height;
  return {
    width,
    height,
    atoms: new Array(size).fill(null),
    right: new Array(size).fill(0),
    down: new Array(size).fill(0),
  };
}

/**
 * The cells beside cell i, with how many sticks join each one to i.
 * @param {ReturnType<typeof createBoard>} board - the board
 * @param {number} i - a cell number (row by row: x + y × width)
 * @returns {{cell: number, order: number}[]} up to 4 neighbors that are on the board
 */
export function neighbors(board, i) {
  const { width, height } = board;
  const x = i % width;
  const y = Math.floor(i / width);
  const list = [];
  if (x > 0) list.push({ cell: i - 1, order: board.right[i - 1] });
  if (x < width - 1) list.push({ cell: i + 1, order: board.right[i] });
  if (y > 0) list.push({ cell: i - width, order: board.down[i - width] });
  if (y < height - 1) list.push({ cell: i + width, order: board.down[i] });
  return list;
}

/**
 * How many of an atom's hands aren't holding anything.
 * @param {ReturnType<typeof createBoard>} board - the board
 * @param {number} i - the atom's cell
 * @returns {number} free hands (0 for an empty cell)
 */
export function freeHands(board, i) {
  const el = board.atoms[i];
  if (!el) return 0;
  const used = neighbors(board, i).reduce((sum, { order }) => sum + Math.max(order, 0), 0);
  return HANDS[el] - used;
}

/**
 * Find which list and spot hold the bond between two side-by-side cells.
 * @param {ReturnType<typeof createBoard>} board - the board
 * @param {number} a - one cell
 * @param {number} b - the other cell
 * @returns {{list: number[], at: number}|null} where the bond lives, or null if not side by side
 */
function bondSlot(board, a, b) {
  const [low, high] = a < b ? [a, b] : [b, a];
  if (high - low === 1 && low % board.width !== board.width - 1) return { list: board.right, at: low };
  if (high - low === board.width) return { list: board.down, at: low };
  return null;
}

/**
 * The auto-bond rule: side-by-side atoms with free hands grab hands.
 * Goes row by row, left to right; each atom tries its right neighbor,
 * then the one below. (Always the same order, so the same board always
 * bonds the same way.)
 * @param {ReturnType<typeof createBoard>} board - the board (changed in place)
 * @returns {void}
 */
export function autoBond(board) {
  for (let i = 0; i < board.atoms.length; i += 1) {
    if (!board.atoms[i]) continue;
    for (const other of [i + 1, i + board.width]) {
      const slot = bondSlot(board, i, other);
      if (!slot || other >= board.atoms.length || !board.atoms[other]) continue;
      if (slot.list[slot.at] === 0 && freeHands(board, i) > 0 && freeHands(board, other) > 0) {
        slot.list[slot.at] = 1;
      }
    }
  }
}

/**
 * Put an atom in an empty cell, then let atoms grab hands.
 * @param {ReturnType<typeof createBoard>} board - the board (changed in place)
 * @param {number} i - the cell
 * @param {string} el - the atom, like 'O'
 * @returns {boolean} true if it was placed (false if the cell was full)
 */
export function placeAtom(board, i, el) {
  if (board.atoms[i]) return false;
  board.atoms[i] = el;
  autoBond(board);
  return true;
}

/**
 * Take an atom away (and its sticks), then let its old neighbors grab
 * other hands.
 * @param {ReturnType<typeof createBoard>} board - the board (changed in place)
 * @param {number} i - the cell
 * @returns {boolean} true if there was an atom to take away
 */
export function removeAtom(board, i) {
  if (!board.atoms[i]) return false;
  board.atoms[i] = null;
  for (const { cell } of neighbors(board, i)) {
    const slot = bondSlot(board, i, cell);
    slot.list[slot.at] = 0;
  }
  autoBond(board);
  return true;
}

/**
 * Tap between two side-by-side atoms with the bond tool:
 *   joined → one more stick (single → double → triple), if both atoms
 *            have a free hand for it
 *   joined, but can't take another stick → pulled APART (their hands
 *            let go, and may grab someone else)
 *   apart  → join again with one stick, if both have a free hand
 * Two atoms that never joined (both hands full) can be pulled apart too,
 * so they won't grab each other later.
 * @param {ReturnType<typeof createBoard>} board - the board (changed in place)
 * @param {number} a - one atom's cell
 * @param {number} b - the other atom's cell, right beside it
 * @returns {number} the new bond value: 1–3 sticks, APART, or 0 if nothing happened
 */
export function tapBond(board, a, b) {
  const slot = bondSlot(board, a, b);
  if (!slot || !board.atoms[a] || !board.atoms[b]) return 0;
  const order = slot.list[slot.at];
  const roomForOne = freeHands(board, a) > 0 && freeHands(board, b) > 0;
  if (order === APART) {
    if (!roomForOne) return APART;
    slot.list[slot.at] = 1;
  } else if (order > 0 && order < MAX_ORDER && roomForOne) {
    slot.list[slot.at] = order + 1;
  } else {
    slot.list[slot.at] = APART;
  }
  autoBond(board);
  return slot.list[slot.at];
}

/**
 * Is this atom's free hand stuck? (It has a free hand, but every cell
 * beside it is the board's edge or an atom with no free hands.)
 * @param {ReturnType<typeof createBoard>} board - the board
 * @param {number} i - the atom's cell
 * @returns {boolean} true if stuck
 */
export function isStuck(board, i) {
  if (freeHands(board, i) === 0) return false;
  return neighbors(board, i).every(({ cell }) => board.atoms[cell] && freeHands(board, cell) === 0);
}

/**
 * Find every group of atoms joined by sticks.
 * @param {ReturnType<typeof createBoard>} board - the board
 * @returns {{cells: number[], finished: boolean, stuck: number[]}[]}
 *   each group's cells (smallest first), whether every hand is holding,
 *   and which of its atoms are stuck
 */
export function findGroups(board) {
  const seen = new Set();
  const groups = [];
  for (let start = 0; start < board.atoms.length; start += 1) {
    if (!board.atoms[start] || seen.has(start)) continue;
    const cells = [];
    const todo = [start];
    seen.add(start);
    while (todo.length > 0) {
      const i = todo.pop();
      cells.push(i);
      for (const { cell, order } of neighbors(board, i)) {
        if (order > 0 && !seen.has(cell)) {
          seen.add(cell);
          todo.push(cell);
        }
      }
    }
    cells.sort((a, b) => a - b);
    const finished = cells.length > 1 && cells.every((i) => freeHands(board, i) === 0);
    groups.push({ cells, finished, stuck: cells.filter((i) => isStuck(board, i)) });
  }
  return groups;
}

/**
 * Turn a group into a molecule graph (the shape canon.js labels).
 * @param {ReturnType<typeof createBoard>} board - the board
 * @param {number[]} cells - the group's cells
 * @returns {{atoms: {el: string}[], bonds: {a: number, b: number, order: number}[]}} the molecule
 */
export function groupGraph(board, cells) {
  const number = new Map(cells.map((cell, k) => [cell, k]));
  const atoms = cells.map((cell) => ({ el: board.atoms[cell] }));
  const bonds = [];
  for (const cell of cells) {
    for (const other of [cell + 1, cell + board.width]) {
      const slot = bondSlot(board, cell, other);
      if (slot && slot.list[slot.at] > 0 && number.has(other)) {
        bonds.push({ a: number.get(cell), b: number.get(other), order: slot.list[slot.at] });
      }
    }
  }
  return { atoms, bonds };
}

/**
 * Cut a group out of the board as a small picture of itself, for the
 * collection book: just the rectangle around it, with its atoms and sticks.
 * @param {ReturnType<typeof createBoard>} board - the board
 * @param {number[]} cells - the group's cells
 * @returns {{width: number, height: number, atoms: (string|null)[], right: number[], down: number[]}}
 *   a little board holding only this group
 */
export function groupLayout(board, cells) {
  const xs = cells.map((i) => i % board.width);
  const ys = cells.map((i) => Math.floor(i / board.width));
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  const small = createBoard(Math.max(...xs) - left + 1, Math.max(...ys) - top + 1);
  const inGroup = new Set(cells);
  for (const i of cells) {
    const j = (Math.floor(i / board.width) - top) * small.width + (i % board.width) - left;
    small.atoms[j] = board.atoms[i];
    // Math.max: an APART pair is just "no sticks" in a picture.
    if (inGroup.has(i + 1) && i % board.width !== board.width - 1) small.right[j] = Math.max(board.right[i], 0);
    if (inGroup.has(i + board.width)) small.down[j] = Math.max(board.down[i], 0);
  }
  return small;
}

/**
 * Which finished groups are NEW: finished now, but that exact set of
 * cells wasn't a finished group before the change. (So loading a saved
 * board, or tapping somewhere else, doesn't cheer for old molecules.)
 * @param {{cells: number[], finished: boolean}[]} before - findGroups() before the change
 * @param {{cells: number[], finished: boolean}[]} after - findGroups() after the change
 * @returns {{cells: number[], finished: boolean}[]} the newly finished groups
 */
export function newlyFinished(before, after) {
  const old = new Set(before.filter((g) => g.finished).map((g) => g.cells.join(',')));
  return after.filter((g) => g.finished && !old.has(g.cells.join(',')));
}
```

- [ ] **Step 4: Run the test**

Run: `node --test tests/chem-board.test.js`
Expected: PASS: 17 tests

- [ ] **Step 5: Commit**

```bash
npm test
git add js/chem/board.js tests/chem-board.test.js
git commit -m "Chemistry room: the board, holding hands, pulling apart"
git push origin main
```

---

### Task 3: Molecule database tools and data/molecules.json

**Files:**
- Create: `tools/chem-db/export.py`, `tools/chem-db/make-db.js`, `tools/chem-db/README.md`, `data/molecules.json` (generated)
- Modify: `.gitignore`, `tests/docs.test.js` (check `tools/` recursively)

**Interfaces:**
- Consumes: `parseSmiles`, `canonLabel`.
- Produces: `buildDatabase(text) → {names: Record<label,string>, clashes: number, skipped: string[]}` (exported from `make-db.js`); `data/molecules.json`: `{label: name}`, sorted by label.

- [ ] **Step 1: Make the docs test also check `tools/chem-db/` (it fails until make-db.js exists and has docstrings)**

```diff
--- a/tests/docs.test.js
+++ b/tests/docs.test.js
@@ -17,7 +17,7 @@
 const FILES = [
   // recursive: also js/blocks/ (the Build page's block packs)
   ...readdirSync(new URL('js/', ROOT), { recursive: true }).map((name) => `js/${name}`),
-  ...readdirSync(new URL('tools/', ROOT)).map((name) => `tools/${name}`),
+  ...readdirSync(new URL('tools/', ROOT), { recursive: true }).map((name) => `tools/${name}`),
   'sw.js',
 ].filter((name) => /\.c?js$/.test(name));
 
```

- [ ] **Step 2: Ignore the big downloads**

```diff
--- a/.gitignore
+++ b/.gitignore
@@ -1 +1,5 @@
 .remember/
+# tools/chem-db downloads and in-between files (see tools/chem-db/README.md)
+tools/chem-db/*.gz
+tools/chem-db/molecules.tsv
+tools/chem-db/venv/
```

- [ ] **Step 3: Write `tools/chem-db/export.py`**

```python
"""export.py: makes the chemistry room's molecule list from PubChem.

This runs on a computer, NOT in the web page. It reads PubChem's two big
free download files and writes molecules.tsv, which make-db.js turns
into data/molecules.json (see README.md in this folder).

It keeps a PubChem compound only if Caleb could build it on the board:
  * only H, C, N, O, S, Cl atoms; no charges, no special isotopes; one piece
  * every atom has exactly its number of hands (H 1, C 4, N 3, O 2, S 2, Cl 1)
  * at most MAX_HEAVY atoms that aren't H
  * it fits flat on a square grid, one atom (H's too) per cell, with
    every bonded pair side by side (fits_grid below)

For each one it writes:   name <TAB> smiles|smiles|...
with EVERY Kekule form (each way the double bonds in a benzene-like ring
can sit), because Caleb might build any of them.

Run:  python export.py CID-SMILES.gz CID-Title.gz > molecules.tsv
"""
import gzip
import re
import sys
from multiprocessing import Pool

from rdkit import Chem, RDLogger

RDLogger.DisableLog('rdApp.*')

# The most non-H atoms a molecule can have. Try this! 9 makes a bigger list.
MAX_HEAVY = 8

# Hands per atom: the same numbers as js/chem/smiles.js.
HANDS = {'H': 1, 'C': 4, 'N': 3, 'O': 2, 'S': 2, 'Cl': 1}

# How hard fits_grid tries before giving up (and saying "doesn't fit").
GRID_BUDGET = 200_000

# Quick text checks, before the slow RDKit ones.
OK_CHARS = re.compile(r'^[CNOSHcnosl\[\]()=#0-9@/\\]+$')
ATOM_TOKEN = re.compile(r'Cl|\[[^\]]*\]|[CNOScnos]')
SIDES = ((1, 0), (-1, 0), (0, 1), (0, -1))


def keep(smiles):
    """The molecule, stereo removed, if Caleb could make it; else None."""
    if not OK_CHARS.match(smiles):
        return None
    if len([t for t in ATOM_TOKEN.findall(smiles) if t != '[H]']) > MAX_HEAVY:
        return None
    mol = Chem.MolFromSmiles(smiles)
    if mol is None or len(Chem.GetMolFrags(mol)) != 1 or mol.GetNumHeavyAtoms() > MAX_HEAVY:
        return None
    for atom in Chem.AddHs(mol).GetAtoms():
        el = atom.GetSymbol()
        if (el not in HANDS or atom.GetFormalCharge() or atom.GetIsotope()
                or atom.GetNumRadicalElectrons() or atom.GetTotalValence() != HANDS[el]):
            return None
    Chem.RemoveStereochemistry(mol)  # the board is flat: no 3D
    return mol


def fits_grid(mol):
    """Can every atom (H's too) sit in its own cell, bonded pairs side by side?"""
    mol = Chem.AddHs(mol)
    n = mol.GetNumAtoms()
    nbrs = [[b.GetIdx() for b in a.GetNeighbors()] for a in mol.GetAtoms()]
    if any(len(x) > 4 for x in nbrs):
        return False
    start = max(range(n), key=lambda i: (mol.GetAtomWithIdx(i).GetAtomicNum() > 1, len(nbrs[i])))
    order, seen = [start], {start}
    for i in order:  # breadth-first: each atom is placed next to one already placed
        for j in sorted(nbrs[i], key=lambda k: -len(nbrs[k])):
            if j not in seen:
                seen.add(j)
                order.append(j)
    pos, used, steps = {start: (0, 0)}, {(0, 0)}, [0]

    def place(k):
        if k == n:
            return True
        steps[0] += 1
        if steps[0] > GRID_BUDGET:
            raise TimeoutError
        a = order[k]
        placed = [b for b in nbrs[a] if b in pos]
        x0, y0 = pos[placed[0]]
        for dx, dy in SIDES:
            c = (x0 + dx, y0 + dy)
            if c in used or any(abs(pos[b][0] - c[0]) + abs(pos[b][1] - c[1]) != 1 for b in placed[1:]):
                continue
            pos[a] = c
            used.add(c)
            if place(k + 1):
                return True
            del pos[a]
            used.discard(c)
        return False

    try:
        return place(1)
    except TimeoutError:
        return False


def kekule_forms(mol):
    """Every Kekule form, as kekule SMILES (only ring single/double bonds swap)."""
    base = Chem.Mol(mol)
    Chem.Kekulize(base, clearAromaticFlags=True)
    ring = [b for b in mol.GetBonds() if b.GetIsAromatic()
            and base.GetBondWithIdx(b.GetIdx()).GetBondType() in (Chem.BondType.SINGLE, Chem.BondType.DOUBLE)]
    if not ring:
        return [Chem.MolToSmiles(base, kekuleSmiles=True)]
    need = set()  # atoms that hold a ring double bond
    for b in ring:
        if base.GetBondWithIdx(b.GetIdx()).GetBondType() == Chem.BondType.DOUBLE:
            need.update((b.GetBeginAtomIdx(), b.GetEndAtomIdx()))
    edges = [(b.GetIdx(), b.GetBeginAtomIdx(), b.GetEndAtomIdx()) for b in ring
             if b.GetBeginAtomIdx() in need and b.GetEndAtomIdx() in need]
    forms = set()

    def pair_up(left, chosen):
        if not left:
            form = Chem.RWMol(base)
            for b in ring:
                form.GetBondWithIdx(b.GetIdx()).SetBondType(Chem.BondType.SINGLE)
            for idx in chosen:
                form.GetBondWithIdx(idx).SetBondType(Chem.BondType.DOUBLE)
            forms.add(Chem.MolToSmiles(form, kekuleSmiles=True))
            return
        a = min(left)
        for idx, x, y in edges:
            other = y if x == a else x if y == a else None
            if other is not None and other in left:
                pair_up(left - {a, other}, chosen + [idx])

    pair_up(frozenset(need), [])
    return sorted(forms)


def check(line):
    """One CID-SMILES line → (cid, canonical smiles, forms) or None."""
    cid, _, smiles = line.rstrip('\n').partition('\t')
    mol = keep(smiles)
    if mol is None or not fits_grid(mol):
        return None
    return int(cid), Chem.MolToSmiles(mol), kekule_forms(mol)


def main(smiles_file, title_file):
    """Write molecules.tsv to stdout (oldest CID wins for each molecule)."""
    best = {}  # canonical smiles → (cid, forms)
    with gzip.open(smiles_file, 'rt') as lines, Pool() as pool:
        for found in pool.imap(check, lines, chunksize=5000):
            if found and (found[1] not in best or found[0] < best[found[1]][0]):
                best[found[1]] = (found[0], found[2])
    wanted = {cid: forms for cid, forms in best.values()}
    names = {}
    with gzip.open(title_file, 'rt') as lines:
        for line in lines:
            cid, _, title = line.rstrip('\n').partition('\t')
            if cid.isdigit() and int(cid) in wanted:
                names[int(cid)] = title
    for cid in sorted(wanted):
        if cid in names:
            print(f"{names[cid]}\t{'|'.join(wanted[cid])}")


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
```

- [ ] **Step 4: Write `tools/chem-db/make-db.js`**

```js
/**
 * make-db.js — turns tools/chem-db/export.py's list of molecules into
 * data/molecules.json, the chemistry room's big name list.
 *
 * Each input line is: name <TAB> smiles|smiles|... (every Kekulé form).
 * Each form is read with the SAME smiles.js and labelled with the SAME
 * canon.js the room uses, so a molecule Caleb builds always finds its name.
 *
 * Run (from the repo folder):
 *   node tools/chem-db/make-db.js molecules.tsv
 * It writes data/molecules.json and says how many names it kept.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { canonLabel } from '../../js/chem/canon.js';
import { parseSmiles } from '../../js/chem/smiles.js';

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
 * Read the .tsv named on the command line and write data/molecules.json.
 * @returns {void}
 */
function main() {
  const input = process.argv[2];
  const { names, clashes, skipped } = buildDatabase(readFileSync(input, 'utf8'));
  writeFileSync(new URL('../../data/molecules.json', import.meta.url), `${JSON.stringify(names, null, 0)}\n`);
  console.log(`${Object.keys(names).length} labels, ${clashes} clashes, ${skipped.length} skipped`);
  if (skipped.length) console.log('skipped (first 10):', skipped.slice(0, 10).join(' '));
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) main();
```

- [ ] **Step 5: Write `tools/chem-db/README.md`**

````markdown
# tools/chem-db: making the chemistry room's molecule list

The chemistry room (`chem.html`) names about 69,000 real molecules. That list,
`data/molecules.json`, is made here in two steps. You only need to redo this
to change the rules (like allowing 9 atoms), or after changing
`js/chem/canon.js`, because the list's labels come from it.
`tests/chem-data.test.js` fails if the list and `canon.js` disagree.

## 1. export.py: pick the molecules from PubChem (Python + RDKit)

[PubChem](https://pubchem.ncbi.nlm.nih.gov) is the US government's free
chemistry library (public domain). Download its two big lists
(about 3.4 GB; **don't** commit them):

```sh
curl -O https://ftp.ncbi.nlm.nih.gov/pubchem/Compound/Extras/CID-SMILES.gz
curl -O https://ftp.ncbi.nlm.nih.gov/pubchem/Compound/Extras/CID-Title.gz
```

RDKit is a chemistry toolkit. It only runs here, never in the web page:

```sh
python3 -m venv venv
./venv/bin/pip install rdkit
./venv/bin/python export.py CID-SMILES.gz CID-Title.gz > molecules.tsv
```

This takes about 7 minutes on a 20-core machine. `export.py` explains which
molecules it keeps: only atoms Caleb has, every hand used, at most 8 non-H
atoms, and it must fit flat on the grid.

## 2. make-db.js: label them the room's way (Node)

From the repo folder:

```sh
node tools/chem-db/make-db.js tools/chem-db/molecules.tsv
```

This reads every molecule with the room's own `smiles.js`, labels it with the
room's own `canon.js`, and writes `data/molecules.json`. It prints how many
labels it made, and how many **clashes** it found (two names for one label).
Clashes should be 0. If they're not, `canon.js` or `export.py` has a bug.

Built 2026-10-03: 69,700 labels (69,153 molecules, some with two Kekulé
forms), 0 clashes, 6.7 MB on disk, 0.84 MB gzipped.
````

- [ ] **Step 6: Build the list**

From `tools/chem-db/`, follow its README:

```sh
cd tools/chem-db
curl -O https://ftp.ncbi.nlm.nih.gov/pubchem/Compound/Extras/CID-SMILES.gz
curl -O https://ftp.ncbi.nlm.nih.gov/pubchem/Compound/Extras/CID-Title.gz
python3 -m venv venv && ./venv/bin/pip install rdkit
./venv/bin/python export.py CID-SMILES.gz CID-Title.gz > molecules.tsv
cd ../..
node tools/chem-db/make-db.js tools/chem-db/molecules.tsv
```

Expected: `molecules.tsv` has 69,153 lines; make-db prints `69700 labels, 0 clashes, 0 skipped`. `gzip -9 -c data/molecules.json | wc -c` is about 841,000.
(Shortcut: the prototype's verified `molecules.tsv` and `CID-*.gz` are in the session scratchpad `chem/` folder. Copying them in saves the download.)

- [ ] **Step 7: Spot-check names**

```sh
node --input-type=module -e "const {canonLabel}=await import('./js/chem/canon.js');const {parseSmiles}=await import('./js/chem/smiles.js');const db=JSON.parse((await import('node:fs')).readFileSync('data/molecules.json','utf8'));for (const s of ['O','CCO','COC','CC(C)C','CC1=C(C)C=CC=C1']) console.log(s, db[canonLabel(parseSmiles(s))]);"
```
Expected: `O Water`, `CCO Ethanol`, `COC Dimethyl Ether`, `CC(C)C undefined`, `CC1=C(C)C=CC=C1 O-Xylene`.

- [ ] **Step 8: Run all tests**

Run: `npm test`
Expected: all pass (the docs test now covers `tools/chem-db/make-db.js`)

- [ ] **Step 9: Commit (data is ~6.7 MB; that's expected)**

```bash
npm test
git add .gitignore tests/docs.test.js tools/chem-db/export.py tools/chem-db/make-db.js tools/chem-db/README.md data/molecules.json
git commit -m "Chemistry room: 69,000 molecule names from PubChem, and the tools that make them"
git push origin main
```

---

### Task 4: Hand-written molecules, lookup, and the collection book

**Files:**
- Create: `js/chem/kid-names.js`, `js/chem/lookup.js`, `js/chem/book.js`
- Test: `tests/chem-book.test.js`, `tests/chem-data.test.js`

**Interfaces:**
- Consumes: `canonLabel`, `parseSmiles`, `data/molecules.json`.
- Produces: `KID_MOLECULES: {smiles, name, fact, step}[]`; `DATABASE_URL`; `kidIndex(list?) → Map<label, entry>`; `lookUp(label, kids, database|null) → {kind:'found',entry}|{kind:'rare',name}|{kind:'pending'}|{kind:'invention'}`; `loadDatabase(fetchFn?, url?) → Promise<object|null>`; `LADDER` (`{step, unlocks, hint, goal(book)}`), `WATER` (`'O2|'`), `ALL_ATOMS` (`['H','O','C','N','Cl','S']`); `createBook() → {step, found, pictures, rare, inventions, pending}`; `elementsIn(label) → Set`; `countWith(book, el)`; `unlockedAtoms(book) → string[]`; `climbLadder(book) → string[]`; `record(book, label, layout, result) → {again, unlocked, name}`; `resolvePending(book, look) → string[]`; `nameNewestInvention(book, name) → boolean`; `unlockAll(book)`.

- [ ] **Step 1: Write the failing tests**

`tests/chem-book.test.js`:

```js
/**
 * chem-book.test.js — checks the collection book and the unlock ladder
 * (js/chem/book.js), and the "what is it?" lookup (js/chem/lookup.js).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  WATER, climbLadder, countWith, createBook, elementsIn, nameNewestInvention, record, resolvePending, unlockAll, unlockedAtoms,
} from '../js/chem/book.js';
import { canonLabel } from '../js/chem/canon.js';
import { kidIndex, loadDatabase, lookUp } from '../js/chem/lookup.js';
import { parseSmiles } from '../js/chem/smiles.js';

/**
 * The label for a SMILES string.
 * @param {string} smiles - e.g. 'CCO'
 * @returns {string} its label
 */
const label = (smiles) => canonLabel(parseSmiles(smiles));

const kids = kidIndex();
/** A tiny pretend big list: butanone (rare) and water. */
const database = { [label('CCC(C)=O')]: 'Butanone', [label('O')]: 'Water' };
/** A tiny pretend picture. */
const layout = { width: 1, height: 1, atoms: ['O'], right: [0], down: [0] };

test('WATER is the label canon.js gives water', () => {
  assert.equal(WATER, label('O'));
});

test('elementsIn reads the elements out of a label', () => {
  assert.deepEqual([...elementsIn(label('CCl'))].sort(), ['C', 'Cl', 'H']);
  assert.deepEqual([...elementsIn(label('ClC(Cl)(Cl)Cl'))].sort(), ['C', 'Cl']);
  assert.deepEqual([...elementsIn('H2')], ['H']);
  assert.deepEqual([...elementsIn(label('N#N'))], ['N']);
});

test('a new book has H and O, and making water unlocks C', () => {
  const book = createBook();
  assert.deepEqual(unlockedAtoms(book), ['H', 'O']);
  const result = record(book, WATER, layout, lookUp(WATER, kids, null));
  assert.deepEqual(result, { again: false, unlocked: ['C'], name: null });
  assert.deepEqual(unlockedAtoms(book), ['H', 'O', 'C']);
  assert.deepEqual(book.pictures[WATER], layout); // the book shows how he built it
});

test('making the same molecule twice counts once', () => {
  const book = createBook();
  record(book, WATER, layout, lookUp(WATER, kids, null));
  const again = record(book, WATER, layout, lookUp(WATER, kids, null));
  assert.equal(again.again, true);
  assert.deepEqual(book.found, [WATER]);
});

test('three carbon molecules unlock N, and rare finds count toward it', () => {
  const book = createBook();
  record(book, WATER, layout, lookUp(WATER, kids, null));
  for (const smiles of ['C', 'CC']) record(book, label(smiles), layout, lookUp(label(smiles), kids, database));
  assert.equal(book.step, 2);
  const butanone = label('CCC(C)=O');
  const result = record(book, butanone, layout, lookUp(butanone, kids, database));
  assert.deepEqual(result.unlocked, ['N']);
  assert.equal(book.rare[0].name, 'Butanone');
  assert.equal(countWith(book, 'C'), 3);
});

test('inventions do not count toward unlocks, and get numbered names', () => {
  const book = createBook();
  record(book, WATER, layout, lookUp(WATER, kids, null));
  for (const smiles of ['CCCCCCCCC', 'CCCCCCCCCC', 'CCCCCCCCCCC']) {
    const made = record(book, label(smiles), layout, lookUp(label(smiles), kids, database));
    assert.deepEqual(made.unlocked, []);
  }
  assert.equal(book.step, 2);
  assert.deepEqual(book.inventions.map((i) => i.name), ['Invention #3', 'Invention #2', 'Invention #1']);
  assert.ok(nameNewestInvention(book, '  Super Chain  '));
  assert.equal(book.inventions[0].name, 'Super Chain');
  assert.equal(nameNewestInvention(book, '   '), false);
  const again = record(book, label('CCCCCCCCCCC'), layout, { kind: 'invention' });
  assert.equal(again.name, 'Super Chain');
});

test('lookup order: hand-written, then the big list, then waiting, then invention', () => {
  assert.equal(lookUp(WATER, kids, database).kind, 'found');
  assert.equal(lookUp(WATER, kids, null).kind, 'found'); // hand-written ones work offline
  assert.deepEqual(lookUp(label('CCC(C)=O'), kids, database), { kind: 'rare', name: 'Butanone' });
  assert.deepEqual(lookUp(label('CCC(C)=O'), kids, null), { kind: 'pending' });
  assert.deepEqual(lookUp(label('CCCCCCCCCC'), kids, database), { kind: 'invention' });
  assert.deepEqual(lookUp('constructor', kids, {}), { kind: 'invention' }); // no tricks from Object's own names
});

test('waiting molecules are sorted out when the big list arrives', () => {
  const book = createBook();
  record(book, WATER, layout, lookUp(WATER, kids, null));
  for (const smiles of ['C', 'CC', 'CCC(C)=O', 'CCCCCCCCCC']) record(book, label(smiles), layout, lookUp(label(smiles), kids, null));
  assert.equal(book.pending.length, 2);
  assert.deepEqual(resolvePending(book, (l) => lookUp(l, kids, null)), []); // still offline
  assert.equal(book.pending.length, 2);
  assert.deepEqual(resolvePending(book, (l) => lookUp(l, kids, database)), ['N']);
  assert.equal(book.pending.length, 0);
  assert.equal(book.rare.length, 1);
  assert.equal(book.inventions.length, 1);
});

test('unlockAll opens every atom; climbing twice does nothing more', () => {
  const book = createBook();
  unlockAll(book);
  assert.deepEqual(unlockedAtoms(book), ['H', 'O', 'C', 'N', 'Cl', 'S']);
  assert.deepEqual(climbLadder(book), []);
});

test('several steps can unlock at once (e.g. after the big list arrives)', () => {
  const book = createBook();
  book.found.push(WATER, label('C'), label('CC'), label('CCC'), label('N#N'), label('N'));
  assert.deepEqual(climbLadder(book), ['C', 'N', 'Cl', 'S']);
});

test('loadDatabase gives null instead of crashing when offline or broken', async () => {
  assert.equal(await loadDatabase(async () => { throw new Error('offline'); }), null);
  assert.equal(await loadDatabase(async () => ({ ok: false })), null);
  assert.equal(await loadDatabase(async () => ({ ok: true, json: async () => { throw new SyntaxError('bad'); } })), null);
  assert.deepEqual(await loadDatabase(async () => ({ ok: true, json: async () => database })), database);
});
```

`tests/chem-data.test.js`:

```js
/**
 * chem-data.test.js — checks the big molecule list (data/molecules.json)
 * and the hand-written one (js/chem/kid-names.js) agree with the room.
 *
 * The big list was made by tools/chem-db (see its README). If these fail
 * after changing canon.js, the list must be rebuilt: its labels come
 * from canon.js.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canonLabel } from '../js/chem/canon.js';
import { KID_MOLECULES } from '../js/chem/kid-names.js';
import { parseSmiles } from '../js/chem/smiles.js';

const database = JSON.parse(readFileSync(new URL('../data/molecules.json', import.meta.url), 'utf8'));

/**
 * The label for a SMILES string.
 * @param {string} smiles - e.g. 'CCO'
 * @returns {string} its label
 */
const label = (smiles) => canonLabel(parseSmiles(smiles));

test('every hand-written molecule can really be built (it is in the big list)', () => {
  const missing = KID_MOLECULES.filter((k) => !Object.hasOwn(database, label(k.smiles))).map((k) => k.name);
  assert.deepEqual(missing, []);
});

test('no molecule is hand-written twice', () => {
  const labels = KID_MOLECULES.map((k) => label(k.smiles));
  assert.equal(new Set(labels).size, labels.length);
});

test('every hand-written molecule has a name, a fact, and a step 1–4 that has its atoms', () => {
  const atomsByStep = { 1: 'HO', 2: 'HOC', 3: 'HOCN', 4: 'HOCNClS' };
  for (const k of KID_MOLECULES) {
    assert.ok(k.name && k.fact, k.smiles);
    const elements = new Set(parseSmiles(k.smiles).atoms.map((a) => a.el));
    for (const el of elements) assert.ok(atomsByStep[k.step]?.includes(el), `${k.name} needs ${el} but is on step ${k.step}`);
  }
});

test('the big list knows some famous molecules by their real names', () => {
  const expected = {
    CCO: 'Ethanol', COC: 'Dimethyl Ether', 'CC(C)=O': 'Acetone', CCCC: 'Butane',
    'NCC(=O)O': 'Glycine', 'O=C(N)N': 'Urea', 'C1=CC=CC=C1': 'Benzene',
  };
  for (const [smiles, name] of Object.entries(expected)) assert.equal(database[label(smiles)], name, smiles);
});

test('both ways of drawing o-xylene double bonds find the same name', () => {
  assert.equal(database[label('CC1=CC=CC=C1C')], 'O-Xylene');
  assert.equal(database[label('CC1=C(C)C=CC=C1')], 'O-Xylene');
});

test('molecules too crowded for the grid are not in the list', () => {
  assert.equal(database[label('CC(C)C')], undefined); // isobutane
  assert.equal(database[label('CC(C)(C)C')], undefined); // neopentane
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test tests/chem-book.test.js tests/chem-data.test.js`
Expected: FAIL: `Cannot find module '../js/chem/book.js'` / `kid-names.js`

- [ ] **Step 3: Write `js/chem/kid-names.js`**

Facts were checked for accuracy while prototyping. A grown-up should still read them over before Caleb sees them.

```js
/**
 * kid-names.js — the collection book's hand-written molecules: a kid
 * name and a fun fact for each, to read out loud.
 *
 * Each one is written in SMILES (see smiles.js), so the room can work
 * out its label and spot it when Caleb builds it. `step` says which page
 * of the book it's on: the unlock step whose atoms it needs.
 *
 * Every molecule here must fit on the board and be in data/molecules.json
 * (tests/chem-data.test.js checks), so Caleb can really build them all.
 *
 * 🧪 Try this! Add a molecule you like. Find its SMILES on PubChem
 *    (pubchem.ncbi.nlm.nih.gov), and run `npm test` to check it fits.
 */

/** @type {{smiles: string, name: string, fact: string, step: number}[]} */
export const KID_MOLECULES = [
  // ---- Step 1: ⚪ H and 🔴 O ----
  { step: 1, smiles: '[H][H]', name: 'Hydrogen', fact: 'The lightest stuff there is. The Sun is mostly hydrogen!' },
  { step: 1, smiles: 'O=O', name: 'Oxygen', fact: 'The part of the air you breathe in. Your body needs it every minute.' },
  { step: 1, smiles: 'O', name: 'Water', fact: 'Two hydrogens holding hands with one oxygen. You are more than half water!' },
  { step: 1, smiles: 'OO', name: 'Hydrogen peroxide', fact: 'Fizzes on a scraped knee to clean it.' },

  // ---- Step 2: ⚫ C joins ----
  { step: 2, smiles: 'C', name: 'Methane', fact: 'The gas in a gas stove. Cows burp lots of it!' },
  { step: 2, smiles: 'CC', name: 'Ethane', fact: 'Two carbons holding hands, with hydrogens all around.' },
  { step: 2, smiles: 'CCC', name: 'Propane', fact: 'The gas in a barbecue grill tank.' },
  { step: 2, smiles: 'CCCC', name: 'Butane', fact: 'The fuel inside a lighter.' },
  { step: 2, smiles: 'CCCCC', name: 'Pentane', fact: 'A runny liquid that dries up super fast.' },
  { step: 2, smiles: 'CCCCCC', name: 'Hexane', fact: 'Six carbons in a row. Used to squeeze oil out of seeds.' },
  { step: 2, smiles: 'CCCCCCCC', name: 'Octane', fact: 'Part of the gasoline in a car. Eight carbons long!' },
  { step: 2, smiles: 'O=C=O', name: 'Carbon dioxide', fact: 'The fizz in soda. You breathe it out, and plants breathe it in.' },
  { step: 2, smiles: 'C=C', name: 'Ethylene', fact: 'Bananas give it off, and it helps fruit get ripe.' },
  { step: 2, smiles: 'CC=C', name: 'Propylene', fact: 'Becomes the plastic in lots of food boxes.' },
  { step: 2, smiles: 'C#C', name: 'Acetylene', fact: 'Burns so hot it can cut through metal!' },
  { step: 2, smiles: 'CC#C', name: 'Propyne', fact: 'A carbon chain with a triple bond: three sticks!' },
  { step: 2, smiles: 'C=CC=C', name: 'Butadiene', fact: 'Used to make the rubber in tires.' },
  { step: 2, smiles: 'CC(=C)C=C', name: 'Isoprene', fact: 'Trees give off so much of it on hot days that it makes a blue haze.' },
  { step: 2, smiles: 'C=C=O', name: 'Ketene', fact: 'A very jumpy molecule that grabs onto other things fast.' },
  { step: 2, smiles: 'CO', name: 'Methanol', fact: 'Windshield washer fluid. Poison: never drink it!' },
  { step: 2, smiles: 'CCO', name: 'Alcohol', fact: 'The alcohol in hand sanitizer.' },
  { step: 2, smiles: 'CC(C)O', name: 'Rubbing alcohol', fact: 'Feels cold on your skin because it dries so fast.' },
  { step: 2, smiles: 'OCCO', name: 'Antifreeze', fact: 'Keeps car engines from freezing in winter.' },
  { step: 2, smiles: 'OCC(O)CO', name: 'Glycerol', fact: 'Sweet and gooey. It is in soap and toothpaste.' },
  { step: 2, smiles: 'COC', name: 'Dimethyl ether', fact: 'Same atoms as alcohol, holding hands a different way. A whole different molecule!' },
  { step: 2, smiles: 'C=O', name: 'Formaldehyde', fact: 'Scientists use it to keep old animal specimens from rotting.' },
  { step: 2, smiles: 'CC=O', name: 'Acetaldehyde', fact: 'Gives ripe apples part of their smell.' },
  { step: 2, smiles: 'OCC=O', name: 'Glycolaldehyde', fact: 'A tiny sugar that astronomers found floating in outer space!' },
  { step: 2, smiles: 'OCC(O)C=O', name: 'Glyceraldehyde', fact: 'A simple sugar with just three carbons.' },
  { step: 2, smiles: 'OCC(=O)CO', name: 'Dihydroxyacetone', fact: 'The stuff in sunless tanning lotion that turns skin brown.' },
  { step: 2, smiles: 'CC(C)=O', name: 'Acetone', fact: 'Nail polish remover. It smells strong!' },
  { step: 2, smiles: 'CC(=O)C(C)=O', name: 'Diacetyl', fact: 'Gives butter its buttery smell.' },
  { step: 2, smiles: 'OC=O', name: 'Formic acid', fact: 'What makes an ant bite sting!' },
  { step: 2, smiles: 'CC(=O)O', name: 'Vinegar', fact: 'Acetic acid: the sour in vinegar.' },
  { step: 2, smiles: 'CCC(=O)O', name: 'Propionic acid', fact: 'Made by the bacteria that put holes in Swiss cheese.' },
  { step: 2, smiles: 'CCCC(=O)O', name: 'Butyric acid', fact: 'Smells like rancid butter and stinky cheese. Pee-yew!' },
  { step: 2, smiles: 'OC(=O)O', name: 'Carbonic acid', fact: 'Forms when fizz dissolves in soda. It makes soda a little sour.' },
  { step: 2, smiles: 'OC(=O)C(=O)O', name: 'Oxalic acid', fact: 'In rhubarb leaves and spinach.' },
  { step: 2, smiles: 'CC(O)C(=O)O', name: 'Lactic acid', fact: 'Makes yogurt sour.' },
  { step: 2, smiles: 'CCOC(C)=O', name: 'Ethyl acetate', fact: 'Smells like pear drops and nail polish.' },
  { step: 2, smiles: 'CCCCCC=O', name: 'Hexanal', fact: 'Part of the smell of freshly cut grass.' },
  { step: 2, smiles: 'C1CCC1', name: 'Cyclobutane', fact: 'Four carbons holding hands in a square ring.' },
  { step: 2, smiles: 'C1=CC=CC=C1', name: 'Benzene', fact: 'A ring of six carbons. Its smell is sweet, but it is poisonous.' },
  { step: 2, smiles: 'CC1=CC=CC=C1', name: 'Toluene', fact: 'In paint thinner. Smells like markers.' },
  { step: 2, smiles: 'CC1=CC=CC=C1C', name: 'Xylene', fact: 'Used to clean paint brushes.' },
  { step: 2, smiles: 'OC1=CC=CC=C1', name: 'Phenol', fact: 'One of the first germ killers ever used in hospitals.' },
  { step: 2, smiles: 'OC1=CC=CC=C1O', name: 'Catechol', fact: 'Helps turn a cut apple brown.' },
  { step: 2, smiles: 'OC1=CC=C(O)C=C1', name: 'Hydroquinone', fact: 'Bombardier beetles mix it to spray a hot, stinky blast at enemies!' },
  { step: 2, smiles: 'O=CC1=CC=CC=C1', name: 'Benzaldehyde', fact: 'Smells like almonds and cherries.' },
  { step: 2, smiles: 'C=CC1=CC=CC=C1', name: 'Styrene', fact: 'Becomes Styrofoam, the white foam in cups and packing.' },
  { step: 2, smiles: 'O=C1C=CC(=O)C=C1', name: 'Quinone', fact: 'A ring with two oxygens. Bugs use it to taste yucky.' },

  // ---- Step 3: 🔵 N joins ----
  { step: 3, smiles: 'N#N', name: 'Nitrogen', fact: 'Most of the air is nitrogen! Its triple bond is super strong.' },
  { step: 3, smiles: 'N', name: 'Ammonia', fact: 'Has a strong cleaner smell. Farmers use it to help plants grow.' },
  { step: 3, smiles: 'NN', name: 'Hydrazine', fact: 'Rocket fuel that steers spaceships!' },
  { step: 3, smiles: 'NO', name: 'Hydroxylamine', fact: 'A little nitrogen and oxygen pair that chemists build with.' },
  { step: 3, smiles: 'C#N', name: 'Hydrogen cyanide', fact: 'Very poisonous, but found in comet tails!' },
  { step: 3, smiles: 'CN', name: 'Methylamine', fact: 'Smells fishy.' },
  { step: 3, smiles: 'CC#N', name: 'Acetonitrile', fact: 'Found in space, around baby stars.' },
  { step: 3, smiles: 'C=CC#N', name: 'Acrylonitrile', fact: 'Made into cozy fake-wool sweaters.' },
  { step: 3, smiles: 'C#CC#N', name: 'Cyanoacetylene', fact: 'One of the molecules found in the clouds between the stars.' },
  { step: 3, smiles: 'NC=O', name: 'Formamide', fact: 'Some scientists think life might have started with it.' },
  { step: 3, smiles: 'NC(N)=O', name: 'Urea', fact: 'It is in pee! It also feeds plants.' },
  { step: 3, smiles: 'NC(N)=N', name: 'Guanidine', fact: 'Three nitrogens around one carbon. Muscles make something like it.' },
  { step: 3, smiles: 'NCC(=O)O', name: 'Glycine', fact: 'The smallest building block of proteins. Found on a comet!' },
  { step: 3, smiles: 'CC(N)C(=O)O', name: 'Alanine', fact: 'A protein building block. Silk is full of it.' },
  { step: 3, smiles: 'OCC(N)C(=O)O', name: 'Serine', fact: 'A protein building block your body can make by itself.' },
  { step: 3, smiles: 'NCCCCN', name: 'Putrescine', fact: 'Smells like rotting meat. Yuck!' },
  { step: 3, smiles: 'NCCCCCN', name: 'Cadaverine', fact: 'Another rotten smell. Even worse!' },
  { step: 3, smiles: 'NC1=CC=CC=C1', name: 'Aniline', fact: 'Used to make the first purple dye made in a lab.' },
  { step: 3, smiles: 'C1=CC=NC=C1', name: 'Pyridine', fact: 'Like benzene, but one carbon swapped for a nitrogen. Smells awful!' },

  // ---- Step 4: 🟢 Cl and 🟡 S join ----
  { step: 4, smiles: 'ClCl', name: 'Chlorine', fact: 'A yellow-green gas. A little bit keeps pool water clean.' },
  { step: 4, smiles: 'Cl', name: 'Hydrochloric acid', fact: 'Your stomach makes it to break down food!' },
  { step: 4, smiles: 'OCl', name: 'Hypochlorous acid', fact: 'The germ-killer that bleach makes when it mixes with water.' },
  { step: 4, smiles: 'NCl', name: 'Chloramine', fact: 'The "pool smell" is really chloramine.' },
  { step: 4, smiles: 'CCl', name: 'Methyl chloride', fact: 'Seaweed and fungi make it.' },
  { step: 4, smiles: 'ClCCl', name: 'Dichloromethane', fact: 'Takes the caffeine out of coffee beans.' },
  { step: 4, smiles: 'ClC(Cl)Cl', name: 'Chloroform', fact: 'Long ago, doctors used it to make people sleep for operations.' },
  { step: 4, smiles: 'ClC(Cl)(Cl)Cl', name: 'Carbon tetrachloride', fact: 'Four chlorines all around one carbon.' },
  { step: 4, smiles: 'C=CCl', name: 'Vinyl chloride', fact: 'Becomes PVC, the plastic in white water pipes.' },
  { step: 4, smiles: 'S', name: 'Hydrogen sulfide', fact: 'Smells like rotten eggs!' },
  { step: 4, smiles: 'CS', name: 'Methanethiol', fact: 'Part of the smell of bad breath and toots!' },
  { step: 4, smiles: 'CCS', name: 'Ethanethiol', fact: 'Added to gas on purpose, so you can smell a leak.' },
  { step: 4, smiles: 'C=CCS', name: 'Allyl mercaptan', fact: 'Why garlic breath smells like garlic.' },
  { step: 4, smiles: 'CSC', name: 'Dimethyl sulfide', fact: 'The smell of the seaside!' },
  { step: 4, smiles: 'CSSC', name: 'Dimethyl disulfide', fact: 'Part of the smell of cooked cabbage.' },
  { step: 4, smiles: 'S=C=S', name: 'Carbon disulfide', fact: 'Like carbon dioxide, but with sulfurs instead of oxygens.' },
  { step: 4, smiles: 'O=C=S', name: 'Carbonyl sulfide', fact: 'Found in volcano gas and in outer space.' },
  { step: 4, smiles: 'ClSCl', name: 'Sulfur dichloride', fact: 'A red liquid used to make rubber tough.' },
  { step: 4, smiles: 'NC(CS)C(=O)O', name: 'Cysteine', fact: 'A protein building block. Hair and nails are full of it.' },
];
```

- [ ] **Step 4: Write `js/chem/lookup.js`**

```js
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
```

- [ ] **Step 5: Write `js/chem/book.js`**

```js
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
 * Give the newest invention a name (a grown-up types it).
 * @param {ReturnType<typeof createBook>} book - the book (changed in place)
 * @param {string} name - the new name
 * @returns {boolean} true if there was an invention to name
 */
export function nameNewestInvention(book, name) {
  const trimmed = name.trim();
  if (!book.inventions.length || !trimmed) return false;
  book.inventions[0].name = trimmed;
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
```

- [ ] **Step 6: Run the tests**

Run: `node --test tests/chem-book.test.js tests/chem-data.test.js`
Expected: PASS: 17 tests

- [ ] **Step 7: Commit**

```bash
npm test
git add js/chem/kid-names.js js/chem/lookup.js js/chem/book.js tests/chem-book.test.js tests/chem-data.test.js
git commit -m "Chemistry room: collection book, unlock ladder, 89 kid molecules"
git push origin main
```

---

### Task 5: Saving the room

**Files:**
- Create: `js/chem/save.js`
- Test: `tests/chem-save.test.js`

**Interfaces:**
- Consumes: `createBoard`, `createBook`.
- Produces: `SAVE_KEY` (`'calebhamsa.chem.v1'`), `BROKEN_KEY`; `saveState(storage|null, {board, book}) → boolean`; `loadState(storage|null, width, height) → {board, book}` (never throws).

- [ ] **Step 1: Write the failing test**

```js
/**
 * chem-save.test.js — checks saving the chemistry room (js/chem/save.js):
 * a round trip, storage that isn't allowed, and a broken save.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBoard, placeAtom } from '../js/chem/board.js';
import { WATER, createBook } from '../js/chem/book.js';
import { BROKEN_KEY, SAVE_KEY, loadState, saveState } from '../js/chem/save.js';

/**
 * A pretend localStorage that keeps things in a Map.
 * @returns {Storage} the pretend storage
 */
function fakeStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); },
  };
}

/** A storage that throws on everything, like a locked-down browser. */
const blocked = {
  getItem() { throw new Error('blocked'); },
  setItem() { throw new Error('blocked'); },
};

test('save and load gives back the same board and book', () => {
  const storage = fakeStorage();
  const board = createBoard(4, 3);
  placeAtom(board, 0, 'H');
  placeAtom(board, 1, 'O');
  const book = createBook();
  book.found.push(WATER);
  assert.ok(saveState(storage, { board, book }));
  assert.deepEqual(loadState(storage, 4, 3), { board, book });
});

test('nothing saved yet: a fresh board and book', () => {
  const { board, book } = loadState(fakeStorage(), 4, 3);
  assert.equal(board.atoms.length, 12);
  assert.deepEqual(book, createBook());
});

test('blocked storage never crashes', () => {
  assert.equal(saveState(blocked, { board: createBoard(2, 2), book: createBook() }), false);
  assert.equal(saveState(null, { board: createBoard(2, 2), book: createBook() }), false);
  assert.equal(loadState(blocked, 2, 2).board.atoms.length, 4);
  assert.equal(loadState(null, 2, 2).board.atoms.length, 4);
});

test('a broken save starts fresh and keeps a copy', () => {
  const storage = fakeStorage();
  storage.setItem(SAVE_KEY, '{oops');
  assert.deepEqual(loadState(storage, 2, 2).book, createBook());
  assert.equal(storage.getItem(BROKEN_KEY), '{oops');
  storage.setItem(SAVE_KEY, JSON.stringify({ version: 1, board: null, book: { step: 'two' } }));
  assert.deepEqual(loadState(storage, 2, 2).book, createBook());
});

test('a board saved at another size is dropped, but the book is kept', () => {
  const storage = fakeStorage();
  const book = createBook();
  book.found.push(WATER);
  saveState(storage, { board: createBoard(4, 3), book });
  const loaded = loadState(storage, 5, 3);
  assert.equal(loaded.board.width, 5);
  assert.deepEqual(loaded.book.found, [WATER]);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test tests/chem-save.test.js`
Expected: FAIL: `Cannot find module '../js/chem/save.js'`

- [ ] **Step 3: Write `js/chem/save.js`**

```js
/**
 * save.js — keeps the chemistry board and the collection book in the
 * browser's storage (localStorage), so closing the iPad loses nothing.
 *
 * It's all saved as one bit of JSON text under SAVE_KEY. Like saves.js
 * on the Build page, every function takes the storage as an argument
 * (so tests can hand in a pretend one) and never crashes: blocked
 * storage just means nothing is saved.
 */
import { createBoard } from './board.js';
import { createBook } from './book.js';

/** The name everything is saved under. */
export const SAVE_KEY = 'calebhamsa.chem.v1';

/** Where a save we couldn't read is kept, so a grown-up could rescue it. */
export const BROKEN_KEY = `${SAVE_KEY}.broken`;

/**
 * Save the board and the book.
 * @param {Storage|null} storage - localStorage (or null if not allowed)
 * @param {{board: object, book: object}} state - what to save
 * @returns {boolean} true if it saved
 */
export function saveState(storage, { board, book }) {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify({ version: 1, board, book }));
    return true;
  } catch {
    return false;
  }
}

/**
 * Load the board and the book. Anything missing or broken starts fresh.
 * @param {Storage|null} storage - localStorage (or null if not allowed)
 * @param {number} width - the board size now, in cells
 * @param {number} height - the board size now, in cells
 * @returns {{board: object, book: object}} the saved state, or a fresh one
 */
export function loadState(storage, width, height) {
  const fresh = { board: createBoard(width, height), book: createBook() };
  let text = null;
  try {
    text = storage.getItem(SAVE_KEY);
  } catch {
    return fresh;
  }
  if (text === null) return fresh;
  try {
    const saved = JSON.parse(text);
    const book = { ...createBook(), ...saved.book };
    const lists = ['found', 'rare', 'inventions', 'pending'];
    const picturesOk = book.pictures && typeof book.pictures === 'object' && !Array.isArray(book.pictures);
    if (saved.version !== 1 || !Number.isInteger(book.step) || !picturesOk || !lists.every((k) => Array.isArray(book[k]))) {
      throw new Error('not a save we know');
    }
    const { board } = saved;
    const size = width * height;
    // A board saved at a different size starts empty, but the book is kept.
    const boardFits = board?.width === width && board?.height === height
      && ['atoms', 'right', 'down'].every((k) => Array.isArray(board[k]) && board[k].length === size);
    return { board: boardFits ? board : createBoard(width, height), book };
  } catch {
    try {
      storage.setItem(BROKEN_KEY, text);
    } catch {
      // Can't keep a copy: that's OK.
    }
    return fresh;
  }
}
```

- [ ] **Step 4: Run the test**

Run: `node --test tests/chem-save.test.js`
Expected: PASS: 5 tests

- [ ] **Step 5: Commit**

```bash
npm test
git add js/chem/save.js tests/chem-save.test.js
git commit -m "Chemistry room: saving the board and book"
git push origin main
```

---

### Task 6: The Chemistry page: drawing, room, layout, offline

**Files:**
- Create: `js/chem/chem-art.js`, `js/chem/room.js`, `chem.html`
- Modify: `css/blocks.css`, `index.html`, `sw.js`, `tests/pages.test.js`, `tests/sw.test.js`, `tests/modules.test.js`
- Test: `tests/chem-room.test.js`

**Interfaces:**
- Consumes: everything from Tasks 1–5; `cellsAlongLine`, `choose`, `flash` from `js/ui.js`; `listenForUnlock`, `playTones` from `js/sound.js`; `registerServiceWorker` from `js/pwa.js`.
- Produces: `ATOM_INFO` (`{name, color, ink, emoji}` per atom), `drawBoard(ctx, board, cell, marks?)`, `drawAtom(ctx, el, cx, cy, cell, look?)`; `initChem()`, `fitCellSize`, `bondTarget(x, y, cell, w, h) → [a, b]|null`, `atomHint(smiles) → string`, `cardWords(result, recorded) → {name, badge, fact}`.

- [ ] **Step 1: Write the failing test**

```js
/**
 * chem-room.test.js — checks the Chemistry page's small helpers
 * (js/chem/room.js) and its drawing (js/chem/chem-art.js), without a screen.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBoard, placeAtom } from '../js/chem/board.js';
import { ATOM_INFO, drawBoard } from '../js/chem/chem-art.js';
import { HANDS } from '../js/chem/smiles.js';
import { atomHint, bondTarget, cardWords, fitCellSize } from '../js/chem/room.js';

/**
 * A pretend canvas "context" that counts drawing calls.
 * @returns {object} the fake context, with a `count` of each call
 */
function fakeContext() {
  const count = {};
  const ctx = new Proxy({ count }, {
    get(target, key) {
      if (key in target) return target[key];
      return (...args) => { count[key] = (count[key] ?? 0) + 1; return args; };
    },
    set(target, key, value) { target[key] = value; return true; },
  });
  return ctx;
}

test('fitCellSize keeps the whole board on screen', () => {
  assert.equal(fitCellSize(1200, 900, 12, 9), 100);
  assert.equal(fitCellSize(600, 900, 12, 9), 50);
  assert.equal(fitCellSize(5, 5, 12, 9), 1);
});

test('bondTarget picks the neighbor on the side the finger is nearest', () => {
  // 10-px cells on a 4×3 board; the cell (1,1) is number 5.
  assert.deepEqual(bondTarget(19, 15, 10, 4, 3), [5, 6]); // right edge of (1,1)
  assert.deepEqual(bondTarget(11, 15, 10, 4, 3), [5, 4]); // left edge
  assert.deepEqual(bondTarget(15, 11, 10, 4, 3), [5, 1]); // top edge
  assert.deepEqual(bondTarget(15, 19, 10, 4, 3), [5, 9]); // bottom edge
  assert.equal(bondTarget(1, 5, 10, 4, 3), null); // left of the left column: off the board
  assert.equal(bondTarget(-3, 5, 10, 4, 3), null);
});

test('atomHint shows which atoms a molecule needs', () => {
  assert.equal(atomHint('O'), '🔴⚪⚪');
  assert.equal(atomHint('CCCCCCCC'), '⚫×8 ⚪×18');
  assert.equal(atomHint('ClCl'), '🟢🟢');
});

test('cardWords: the name card for each kind of find', () => {
  const water = { kind: 'found', entry: { name: 'Water', fact: 'Wet!' } };
  assert.deepEqual(cardWords(water, { again: false, name: null }), { name: 'Water', badge: '📖', fact: 'Wet!' });
  assert.equal(cardWords(water, { again: true, name: null }).badge, '📖 Found again!');
  assert.equal(cardWords({ kind: 'rare', name: 'Butanone' }, { again: false, name: 'Butanone' }).badge, '🌟 Super rare!');
  assert.equal(cardWords({ kind: 'invention' }, { again: false, name: 'Invention #1' }).name, 'Invention #1');
  assert.equal(cardWords({ kind: 'pending' }, { again: false, name: null }).badge, '⏳');
});

test('every atom has a look, a name and an emoji', () => {
  for (const el of Object.keys(HANDS)) {
    assert.ok(ATOM_INFO[el]?.color && ATOM_INFO[el].name && ATOM_INFO[el].emoji, el);
  }
});

test('drawBoard draws a ball for each atom and a stick for each bond', () => {
  const board = createBoard(3, 1);
  for (const [i, el] of [[0, 'H'], [1, 'O'], [2, 'H']]) placeAtom(board, i, el);
  const ctx = fakeContext();
  drawBoard(ctx, board, 40, { grid: false });
  assert.equal(ctx.count.arc, 3); // three balls, no free hands (water is finished)
  assert.equal(ctx.count.fillText, 3); // H, O, H
  const free = fakeContext();
  drawBoard(free, createBoard(1, 1), 40); // empty board: no balls
  assert.equal(free.count.arc, undefined);
});
```

- [ ] **Step 2: Update the page, offline and module tests (they fail until the page exists)**

`tests/pages.test.js`:

```diff
--- a/tests/pages.test.js
+++ b/tests/pages.test.js
@@ -10,7 +10,7 @@
 import { readFileSync, existsSync } from 'node:fs';
 
 const ROOT = new URL('../', import.meta.url);
-const PAGES = ['index.html', 'music.html', 'draw.html', 'build.html'];
+const PAGES = ['index.html', 'music.html', 'draw.html', 'build.html', 'chem.html'];
 const SITE = 'https://calebhamsa.fun/';
 
 /**
```

`tests/sw.test.js`:

```diff
--- a/tests/sw.test.js
+++ b/tests/sw.test.js
@@ -37,6 +37,12 @@
   assert.equal(strategyFor({ method: 'GET', url: `${SITE}/draw.html?mode=trace` }), 'network-first');
 });
 
+test('big data files: use the saved copy, and refresh it in the background', () => {
+  const { strategyFor } = loadServiceWorker();
+  assert.equal(strategyFor({ method: 'GET', url: `${SITE}/data/molecules.json` }), 'stale-while-revalidate');
+  assert.equal(strategyFor({ method: 'GET', url: `${SITE}/chem.html` }), 'network-first');
+});
+
 test('Google Fonts: use the saved copy, and refresh it in the background', () => {
   const { strategyFor } = loadServiceWorker();
   assert.equal(strategyFor({ method: 'GET', url: 'https://fonts.googleapis.com/css2?family=Andika' }), 'stale-while-revalidate');
@@ -84,7 +90,7 @@
 test('the helper saves exactly the font stylesheets the pages use', () => {
   const { FONT_STYLESHEETS } = loadServiceWorker();
   const used = new Set();
-  for (const page of ['index.html', 'music.html', 'draw.html', 'build.html']) {
+  for (const page of ['index.html', 'music.html', 'draw.html', 'build.html', 'chem.html']) {
     const html = readFileSync(new URL(`../${page}`, import.meta.url), 'utf8');
     for (const match of html.matchAll(/<link rel="stylesheet" href="(https:\/\/fonts\.googleapis\.com\/[^"]+)"/g)) used.add(match[1]);
   }
@@ -107,7 +113,7 @@
   const scripts = readdirSync(new URL('../js/', import.meta.url), { recursive: true })
     .filter((name) => name.endsWith('.js'))
     .map((name) => `./js/${name}`);
-  for (const path of [...scripts, './index.html', './music.html', './draw.html', './build.html']) {
+  for (const path of [...scripts, './index.html', './music.html', './draw.html', './build.html', './chem.html']) {
     assert.ok(PRECACHE.includes(path), `PRECACHE is missing ${path}`);
   }
 });
```

`tests/modules.test.js`:

```diff
--- a/tests/modules.test.js
+++ b/tests/modules.test.js
@@ -12,7 +12,7 @@
 import assert from 'node:assert/strict';
 
 /** Every file in js/. Add new ones here! */
-const MODULES = ['ui.js', 'music-theory.js', 'music.js', 'draw.js', 'trace.js', 'pwa.js', 'sound.js', 'world.js', 'blocks/basic.js', 'blocks/registry.js', 'saves.js', 'block-art.js', 'build.js', 'circuit.js', 'blocks/electric.js', 'fluids.js', 'blocks/water.js', 'spin.js', 'blocks/gears.js'];
+const MODULES = ['ui.js', 'music-theory.js', 'music.js', 'draw.js', 'trace.js', 'pwa.js', 'sound.js', 'world.js', 'blocks/basic.js', 'blocks/registry.js', 'saves.js', 'block-art.js', 'build.js', 'circuit.js', 'blocks/electric.js', 'fluids.js', 'blocks/water.js', 'spin.js', 'blocks/gears.js', 'chem/smiles.js', 'chem/canon.js', 'chem/board.js', 'chem/book.js', 'chem/kid-names.js', 'chem/lookup.js', 'chem/save.js', 'chem/chem-art.js', 'chem/room.js'];
 
 for (const name of MODULES) {
   test(`js/${name} loads`, async () => {
```

- [ ] **Step 3: Run them to see them fail**

Run: `npm test`
Expected: FAIL: chem-room (no `room.js`), pages (no `chem.html`), sw (`/data/` strategy, PRECACHE), modules

- [ ] **Step 4: Write `js/chem/chem-art.js`**

```js
/**
 * chem-art.js — draws the chemistry board: atoms as colored balls with
 * their letter, bonds as sticks, and free hands as little stubs.
 *
 * Sticks always go left/right/up/down (atoms only hold hands with side
 * neighbors), so free hands are drawn pointing DIAGONALLY. That way a
 * free hand never hides behind a stick, and Caleb can count them.
 *
 * The same drawing makes the little pictures in the collection book.
 */
import { freeHands } from './board.js';

/**
 * How each atom looks, and its name to say out loud.
 * The colors are the ones real molecule-model kits use.
 * 🧪 Try this! Make oxygen purple: change '#e53935' to '#8e24aa'.
 */
export const ATOM_INFO = {
  H: { name: 'Hydrogen', color: '#f5f5f5', ink: '#333333', emoji: '⚪' },
  O: { name: 'Oxygen', color: '#e53935', ink: '#ffffff', emoji: '🔴' },
  C: { name: 'Carbon', color: '#333333', ink: '#ffffff', emoji: '⚫' },
  N: { name: 'Nitrogen', color: '#1e66e5', ink: '#ffffff', emoji: '🔵' },
  Cl: { name: 'Chlorine', color: '#43a047', ink: '#ffffff', emoji: '🟢' },
  S: { name: 'Sulfur', color: '#fdd835', ink: '#333333', emoji: '🟡' },
};

/**
 * How big an atom's ball is, as a share of the cell.
 * 🧪 Try this! 0.45 for chunky atoms, 0.25 for tiny ones.
 */
const BALL = 0.32;

/** Gap between the sticks of a double or triple bond, as a share of the cell. */
const STICK_GAP = 0.1;

/** The four diagonal directions free hands point in (never where sticks go). */
const DIAGONALS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

/**
 * Draw a board (or a little book picture, which is a small board).
 * @param {CanvasRenderingContext2D} ctx - where to draw
 * @param {{width: number, height: number, atoms: (string|null)[], right: number[], down: number[]}} board - what to draw
 * @param {number} cell - cell size in pixels
 * @param {{grid?: boolean, stuck?: Set<number>, glow?: Set<number>, boom?: Set<number>, hands?: boolean}} [marks]
 *   grid: draw the cell lines; stuck: atoms with stuck hands (red stubs);
 *   glow: atoms in finished molecules; boom: atoms to draw 💥 on;
 *   hands: draw free hands (book pictures have none)
 * @returns {void}
 */
export function drawBoard(ctx, board, cell, marks = {}) {
  const { grid = true, stuck = new Set(), glow = new Set(), boom = new Set(), hands = true } = marks;
  const { width, height } = board;
  ctx.fillStyle = '#fffaf0';
  ctx.fillRect(0, 0, width * cell, height * cell);
  if (grid) {
    ctx.strokeStyle = '#e8dcc4';
    ctx.lineWidth = 1;
    for (let x = 1; x < width; x += 1) line(ctx, x * cell, 0, x * cell, height * cell);
    for (let y = 1; y < height; y += 1) line(ctx, 0, y * cell, width * cell, y * cell);
  }

  // Sticks first, so the balls sit on top of their ends.
  ctx.strokeStyle = '#555555';
  ctx.lineWidth = Math.max(2, cell * 0.06);
  board.atoms.forEach((el, i) => {
    if (!el) return;
    const [cx, cy] = centre(i, width, cell);
    if (board.right[i] > 0) sticks(ctx, cx, cy, cx + cell, cy, board.right[i], cell);
    if (board.down[i] > 0) sticks(ctx, cx, cy, cx, cy + cell, board.down[i], cell);
  });

  board.atoms.forEach((el, i) => {
    if (!el) return;
    const [cx, cy] = centre(i, width, cell);
    const free = hands ? freeHands(board, i) : 0;
    drawAtom(ctx, el, cx, cy, cell, { free, stuck: stuck.has(i), glow: glow.has(i) });
    if (boom.has(i)) {
      ctx.font = `${Math.round(cell * 0.5)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('💥', cx + cell * 0.3, cy - cell * 0.3);
    }
  });
}

/**
 * Draw one atom: its free hands, its ball, and its letter.
 * @param {CanvasRenderingContext2D} ctx - where to draw
 * @param {string} el - the atom, like 'O'
 * @param {number} cx - centre, in pixels
 * @param {number} cy - centre, in pixels
 * @param {number} cell - cell size in pixels
 * @param {{free?: number, stuck?: boolean, glow?: boolean}} [look] - free hands
 *   to draw (stubs), whether they're stuck (red and squished), and a gold glow
 * @returns {void}
 */
export function drawAtom(ctx, el, cx, cy, cell, look = {}) {
  const { free = 0, stuck = false, glow = false } = look;
  const info = ATOM_INFO[el];
  const r = cell * BALL;

  // Free hands: a stub with a little round "hand" on the end.
  const reach = stuck ? r * 1.3 : r * 1.9;
  ctx.strokeStyle = stuck ? '#d32f2f' : info.color === '#f5f5f5' ? '#9e9e9e' : info.color;
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = Math.max(2, cell * 0.07);
  for (const [dx, dy] of DIAGONALS.slice(0, Math.max(0, free))) {
    const hx = cx + (dx * reach) / Math.SQRT2;
    const hy = cy + (dy * reach) / Math.SQRT2;
    line(ctx, cx, cy, hx, hy);
    circle(ctx, hx, hy, cell * 0.08);
    ctx.fill();
  }

  if (glow) {
    ctx.fillStyle = 'rgba(242, 183, 5, 0.55)';
    circle(ctx, cx, cy, r * 1.35);
    ctx.fill();
  }
  ctx.fillStyle = info.color;
  circle(ctx, cx, cy, r);
  ctx.fill();
  ctx.strokeStyle = '#00000055';
  ctx.lineWidth = Math.max(1, cell * 0.03);
  ctx.stroke();

  ctx.fillStyle = info.ink;
  ctx.font = `${Math.round(r * (el.length > 1 ? 0.8 : 1.05))}px 'Press Start 2P', monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(el, cx, cy + r * 0.08);
}

/**
 * The centre of cell i, in pixels.
 * @param {number} i - cell number
 * @param {number} width - cells across
 * @param {number} cell - cell size in pixels
 * @returns {[number, number]} x and y
 */
function centre(i, width, cell) {
  return [(i % width) * cell + cell / 2, Math.floor(i / width) * cell + cell / 2];
}

/**
 * Draw 1, 2 or 3 side-by-side sticks between two centres.
 * @param {CanvasRenderingContext2D} ctx - where to draw
 * @param {number} x1 - from
 * @param {number} y1 - from
 * @param {number} x2 - to
 * @param {number} y2 - to
 * @param {number} order - how many sticks
 * @param {number} cell - cell size in pixels
 * @returns {void}
 */
function sticks(ctx, x1, y1, x2, y2, order, cell) {
  const across = y1 === y2 ? [0, 1] : [1, 0]; // sideways from the stick's direction
  for (let k = 0; k < order; k += 1) {
    const shift = (k - (order - 1) / 2) * cell * STICK_GAP;
    line(ctx, x1 + across[0] * shift, y1 + across[1] * shift, x2 + across[0] * shift, y2 + across[1] * shift);
  }
}

/**
 * Draw a straight line.
 * @param {CanvasRenderingContext2D} ctx - where to draw
 * @param {number} x1 - from
 * @param {number} y1 - from
 * @param {number} x2 - to
 * @param {number} y2 - to
 * @returns {void}
 */
function line(ctx, x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

/**
 * Start a circle path (fill or stroke it after).
 * @param {CanvasRenderingContext2D} ctx - where to draw
 * @param {number} x - centre
 * @param {number} y - centre
 * @param {number} r - radius
 * @returns {void}
 */
function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}
```

- [ ] **Step 5: Write `js/chem/room.js`**

```js
/**
 * room.js — makes the Chemistry page work.
 *
 * Caleb picks an atom and puts it on the board. Atoms side by side hold
 * hands by themselves (board.js). When every hand in a molecule is
 * holding another, the molecule glows, the room says its name, and it
 * goes in the 📖 collection book. Finding molecules unlocks new atoms.
 *
 *   🧱 PLACE   tap or drag to put the chosen atom down
 *   ⛏️ REMOVE  tap or drag to take atoms away
 *   🔗 BOND    tap between two atoms: one more stick, or pull them apart
 *
 * chem.html calls initChem() once. Everything else here only runs after that.
 */
import { BOARD_HEIGHT, BOARD_WIDTH, createBoard, findGroups, groupGraph, groupLayout, newlyFinished, placeAtom, removeAtom, tapBond } from './board.js';
import { ALL_ATOMS, LADDER, createBook, nameNewestInvention, record, resolvePending, unlockAll, unlockedAtoms } from './book.js';
import { canonLabel } from './canon.js';
import { ATOM_INFO, drawAtom, drawBoard } from './chem-art.js';
import { KID_MOLECULES } from './kid-names.js';
import { kidIndex, loadDatabase, lookUp } from './lookup.js';
import { loadState, saveState } from './save.js';
import { HANDS, parseSmiles } from './smiles.js';
import { cellsAlongLine, choose, flash } from '../ui.js';
import { listenForUnlock, playTones } from '../sound.js';

// =============================================================
// Settings to play with
// =============================================================

/** The board's border, in CSS pixels (css/blocks.css #board says the same). */
const BOARD_BORDER_PX = 6;

/**
 * How long the 💥 shows on a stuck atom, in milliseconds.
 * 🧪 Try this! 2000 for a long 💥.
 */
const BOOM_MS = 700;

/**
 * The unlock fanfare: notes played one after another (MIDI numbers, 60 = middle C).
 * 🧪 Try this! [72, 67, 64, 60] plays it upside down.
 */
const FANFARE = [60, 64, 67, 72];

/** The cheer when a molecule is finished: a happy chord. */
const CHEER = [64, 67, 72];

/** How big book pictures are drawn, per cell, in CSS pixels. */
const PICTURE_CELL_PX = 22;

/** How big the name card's picture is drawn, per cell (bigger: it's the star). */
const CARD_CELL_PX = 44;

// =============================================================
// Pure helpers (no screen needed, so tests/chem-room.test.js checks them)
// =============================================================

/**
 * How big each cell can be so the whole board fits in the box.
 * @param {number} boxWidth - the space we have, in CSS pixels
 * @param {number} boxHeight - the space we have, in CSS pixels
 * @param {number} columns - cells across
 * @param {number} rows - cells down
 * @returns {number} the cell size in whole pixels (at least 1)
 */
export function fitCellSize(boxWidth, boxHeight, columns, rows) {
  return Math.max(1, Math.floor(Math.min(boxWidth / columns, boxHeight / rows)));
}

/**
 * 🔗 BOND: which two cells did a tap mean? The cell under the finger,
 * and the neighbor on the side the finger is closest to.
 * @param {number} x - finger position, in pixels from the board's left
 * @param {number} y - finger position, in pixels from the board's top
 * @param {number} cell - cell size in pixels
 * @param {number} width - cells across
 * @param {number} height - cells down
 * @returns {[number, number]|null} the two cell numbers, or null if off the board
 */
export function bondTarget(x, y, cell, width, height) {
  const cx = Math.floor(x / cell);
  const cy = Math.floor(y / cell);
  if (cx < 0 || cy < 0 || cx >= width || cy >= height) return null;
  const dx = x / cell - cx - 0.5; // −0.5 (left edge) … +0.5 (right edge)
  const dy = y / cell - cy - 0.5;
  let nx = cx;
  let ny = cy;
  if (Math.abs(dx) >= Math.abs(dy)) nx += dx < 0 ? -1 : 1;
  else ny += dy < 0 ? -1 : 1;
  if (nx < 0 || ny < 0 || nx >= width || ny >= height) return null;
  return [cy * width + cx, ny * width + nx];
}

/**
 * A short "which atoms" hint for a molecule not found yet: ⚪⚪🔴 for
 * water, or ⚫×8 ⚪×18 when there are too many to show one by one.
 * @param {string} smiles - the molecule
 * @returns {string} the hint
 */
export function atomHint(smiles) {
  const counts = new Map();
  for (const { el } of parseSmiles(smiles).atoms) counts.set(el, (counts.get(el) ?? 0) + 1);
  const order = ALL_ATOMS.filter((el) => counts.has(el)).sort((a, b) => (a === 'H') - (b === 'H')); // H last
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  if (total <= 6) return order.map((el) => ATOM_INFO[el].emoji.repeat(counts.get(el))).join('');
  return order.map((el) => `${ATOM_INFO[el].emoji}×${counts.get(el)}`).join(' ');
}

/**
 * What the name card says for a lookup result.
 * @param {{kind: string, entry?: object, name?: string}} result - from lookUp()
 * @param {{again: boolean, name: string|null}} recorded - from record()
 * @returns {{name: string, badge: string, fact: string}} the card's words
 */
export function cardWords(result, recorded) {
  const again = recorded.again ? ' Found again!' : '';
  if (result.kind === 'found') return { name: result.entry.name, badge: `📖${again}`, fact: result.entry.fact };
  if (result.kind === 'rare') return { name: result.name, badge: `🌟 Super rare!${again}`, fact: 'A real molecule, with its real chemistry name.' };
  if (result.kind === 'invention') return { name: recorded.name, badge: `💡 Your invention!${again}`, fact: 'Nobody has a name for this one. You made it up!' };
  return { name: 'Finished!', badge: '⏳', fact: "I'll look up its name when we have internet." };
}

// =============================================================
// The page
// =============================================================

/** Everything the page is doing right now. */
const state = {
  board: createBoard(),
  book: createBook(),
  tool: 'place',
  selected: 'H',
  database: null, // the big list, once it arrives
  cell: 0,
  boom: new Map(), // cell → time its 💥 ends
  cards: [], // name cards waiting to be shown
};

/** label → hand-written entry (made once, at the start). */
let kids = new Map();

let canvas;
let ctx;
let frame;
let pointer = null; // the finger that's building, if any

/**
 * Find an element by id.
 * @param {string} id - its id
 * @returns {HTMLElement} the element
 */
const byId = (id) => document.getElementById(id);

/**
 * Set up the whole page. chem.html calls this once.
 * @returns {void}
 */
export function initChem() {
  canvas = byId('board');
  ctx = canvas.getContext('2d');
  frame = byId('board-frame');
  kids = kidIndex();
  Object.assign(state, loadState(storage(), BOARD_WIDTH, BOARD_HEIGHT));
  if (!unlockedAtoms(state.book).includes(state.selected)) state.selected = 'H';

  setupTools();
  buildPalette();
  setupPointer();
  setupDialogs();
  listenForUnlock();
  new ResizeObserver(resizeCanvas).observe(frame);
  resizeCanvas();
  fetchDatabase();
  window.addEventListener('online', fetchDatabase);
}

/**
 * localStorage, or null if the browser doesn't allow it.
 * @returns {Storage|null} the storage
 */
function storage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Save, and show "can't save here" if it didn't work.
 * @returns {void}
 */
function save() {
  byId('save-problem').hidden = saveState(storage(), state);
}

/**
 * Fetch the big name list in the background. When it arrives, sort out
 * molecules that were waiting (⏳) for it.
 * @returns {Promise<void>} finishes when tried
 */
async function fetchDatabase() {
  if (state.database) return;
  const database = await loadDatabase();
  if (!database) return; // offline: we'll try again when the internet comes back
  state.database = database;
  const unlocked = resolvePending(state.book, (label) => lookUp(label, kids, database));
  for (const el of unlocked) queueUnlockCard(el);
  save();
  buildPalette();
  showNextCard();
}

// ---- Tools and palette ----

/**
 * Hook up the 🧱 ⛏️ 🔗 tool buttons and 🗑️.
 * @returns {void}
 */
function setupTools() {
  for (const button of document.querySelectorAll('[data-tool]')) {
    button.addEventListener('click', () => setTool(button.dataset.tool));
  }
  byId('clear').addEventListener('click', () => {
    state.board = createBoard(BOARD_WIDTH, BOARD_HEIGHT);
    save();
    draw();
  });
}

/**
 * Choose a tool.
 * @param {string} tool - 'place', 'remove' or 'bond'
 * @returns {void}
 */
function setTool(tool) {
  state.tool = tool;
  const buttons = [...document.querySelectorAll('[data-tool]')];
  choose(buttons, buttons.find((b) => b.dataset.tool === tool));
}

/**
 * Make the atom buttons: unlocked ones show the atom, locked ones a 🔒.
 * @returns {void}
 */
function buildPalette() {
  const palette = byId('atoms');
  palette.replaceChildren();
  const open = unlockedAtoms(state.book);
  for (const el of ALL_ATOMS) {
    const button = document.createElement('button');
    button.className = 'block atom-button';
    button.dataset.atom = el;
    if (!open.includes(el)) {
      button.disabled = true;
      button.textContent = '🔒';
      button.setAttribute('aria-label', 'Locked atom');
    } else {
      button.setAttribute('aria-label', `${ATOM_INFO[el].name}, ${HANDS[el]} hands`);
      button.append(atomPicture(el));
      button.addEventListener('click', () => {
        state.selected = el;
        setTool('place');
        markSelected();
        speak(`${ATOM_INFO[el].name}. ${HANDS[el]} ${HANDS[el] === 1 ? 'hand' : 'hands'}.`);
      });
    }
    palette.append(button);
  }
  markSelected();
}

/**
 * Press in the chosen atom's button.
 * @returns {void}
 */
function markSelected() {
  const buttons = [...document.querySelectorAll('[data-atom]')];
  choose(buttons, buttons.find((b) => b.dataset.atom === state.selected) ?? null);
}

/**
 * A small canvas showing one atom with all its hands free.
 * @param {string} el - the atom
 * @returns {HTMLCanvasElement} the picture
 */
function atomPicture(el) {
  const size = 44;
  const ratio = window.devicePixelRatio || 1;
  const picture = document.createElement('canvas');
  picture.width = size * ratio;
  picture.height = size * ratio;
  picture.style.width = `${size}px`;
  picture.style.height = `${size}px`;
  const pctx = picture.getContext('2d');
  pctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  drawAtom(pctx, el, size / 2, size / 2, size * 0.9, { free: HANDS[el] });
  return picture;
}

// ---- The board ----

/**
 * Make the canvas as big as fits in its box, sharp on Retina screens.
 * @returns {void}
 */
function resizeCanvas() {
  const border = BOARD_BORDER_PX * 2;
  const cell = fitCellSize(frame.clientWidth - border, frame.clientHeight - border, BOARD_WIDTH, BOARD_HEIGHT);
  if (cell === state.cell) return;
  state.cell = cell;
  const ratio = window.devicePixelRatio || 1;
  canvas.style.width = `${cell * BOARD_WIDTH}px`;
  canvas.style.height = `${cell * BOARD_HEIGHT}px`;
  canvas.width = Math.round(cell * BOARD_WIDTH * ratio);
  canvas.height = Math.round(cell * BOARD_HEIGHT * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  draw();
}

/**
 * Redraw the board: glowing finished molecules, red stuck hands, 💥.
 * @returns {void}
 */
function draw() {
  if (!state.cell) return;
  const groups = findGroups(state.board);
  const glow = new Set(groups.filter((g) => g.finished).flatMap((g) => g.cells));
  const stuck = new Set(groups.flatMap((g) => g.stuck));
  const now = Date.now();
  for (const [cell, until] of state.boom) if (until <= now) state.boom.delete(cell);
  drawBoard(ctx, state.board, state.cell, { glow, stuck, boom: new Set(state.boom.keys()) });
}

/**
 * Do something to the board, then cheer for new molecules, 💥 for newly
 * stuck atoms, save, and redraw.
 * @param {Function} change - changes state.board; returns true if anything changed
 * @returns {void}
 */
function changeBoard(change) {
  const before = findGroups(state.board);
  if (!change()) return;
  const after = findGroups(state.board);

  const wasStuck = new Set(before.flatMap((g) => g.stuck));
  const newlyStuck = after.flatMap((g) => g.stuck).filter((cell) => !wasStuck.has(cell));
  if (newlyStuck.length) {
    for (const cell of newlyStuck) state.boom.set(cell, Date.now() + BOOM_MS);
    flash(frame, 'nope', 400);
    setTimeout(draw, BOOM_MS + 20);
  }

  for (const group of newlyFinished(before, after)) finished(group);
  save();
  draw();
  showNextCard();
}

/**
 * A molecule was just finished: look it up, put it in the book, and
 * get its name card (and any unlock cards) ready.
 * @param {{cells: number[]}} group - the finished group
 * @returns {void}
 */
function finished(group) {
  const label = canonLabel(groupGraph(state.board, group.cells));
  const layout = groupLayout(state.board, group.cells);
  const result = lookUp(label, kids, state.database);
  const recorded = record(state.book, label, layout, result);
  state.cards.push({ ...cardWords(result, recorded), layout, sound: CHEER });
  for (const el of recorded.unlocked) queueUnlockCard(el);
  if (recorded.unlocked.length) buildPalette();
}

/**
 * Get a "🔓 Carbon! 4 hands!" card ready.
 * @param {string} el - the atom that just unlocked
 * @returns {void}
 */
function queueUnlockCard(el) {
  const layout = createBoard(1, 1);
  layout.atoms[0] = el;
  state.cards.push({
    name: `${ATOM_INFO[el].name}!`,
    badge: '🔓 New atom!',
    fact: `${ATOM_INFO[el].name} has ${HANDS[el]} ${HANDS[el] === 1 ? 'hand' : 'hands'}.`,
    layout,
    hands: true,
    sound: FANFARE,
  });
}

// ---- Fingers ----

/**
 * Listen for fingers (and mice) on the board.
 * @returns {void}
 */
function setupPointer() {
  canvas.addEventListener('pointerdown', (event) => {
    if (pointer) return;
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      // Still works without capture.
    }
    const point = pointFrom(event);
    pointer = { id: event.pointerId, ...point };
    if (state.tool === 'bond') bondAt(point);
    else paintLine(point, point);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!pointer || event.pointerId !== pointer.id || state.tool === 'bond') return;
    const point = pointFrom(event);
    paintLine(pointer, point);
    pointer = { id: pointer.id, ...point };
  });
  for (const type of ['pointerup', 'pointercancel']) {
    window.addEventListener(type, (event) => {
      if (pointer?.id === event.pointerId) pointer = null;
    });
  }
}

/**
 * Where a pointer is, from the board's top-left corner (inside its border).
 * @param {PointerEvent} event - the pointer event
 * @returns {{x: number, y: number}} the position in CSS pixels
 */
function pointFrom(event) {
  const box = canvas.getBoundingClientRect();
  return { x: event.clientX - box.left - canvas.clientLeft, y: event.clientY - box.top - canvas.clientTop };
}

/**
 * PLACE or REMOVE every cell along a finger's path.
 * @param {{x: number, y: number}} from - where the finger was
 * @param {{x: number, y: number}} to - where it is now
 * @returns {void}
 */
function paintLine(from, to) {
  changeBoard(() => {
    let changed = false;
    for (const [x, y] of cellsAlongLine(from.x, from.y, to.x, to.y, state.cell)) {
      if (x < 0 || y < 0 || x >= BOARD_WIDTH || y >= BOARD_HEIGHT) continue;
      const i = y * BOARD_WIDTH + x;
      changed = (state.tool === 'place' ? placeAtom(state.board, i, state.selected) : removeAtom(state.board, i)) || changed;
    }
    return changed;
  });
}

/**
 * 🔗 BOND: tap between two atoms.
 * @param {{x: number, y: number}} point - where the finger is
 * @returns {void}
 */
function bondAt(point) {
  const target = bondTarget(point.x, point.y, state.cell, BOARD_WIDTH, BOARD_HEIGHT);
  changeBoard(() => {
    if (!target) return false;
    const before = [state.board.right.slice(), state.board.down.slice()].join();
    tapBond(state.board, ...target);
    return [state.board.right, state.board.down].join() !== before;
  });
}

// ---- Cards, book, grown-up corner ----

/**
 * Say something out loud (if this browser can).
 * @param {string} text - what to say
 * @returns {void}
 */
function speak(text) {
  try {
    speechSynthesis.cancel();
    const words = new SpeechSynthesisUtterance(text);
    words.rate = 0.9;
    speechSynthesis.speak(words);
  } catch {
    // No voice: the card's words are enough.
  }
}

/**
 * Play notes one after another (a little tune).
 * @param {number[]} notes - MIDI numbers
 * @returns {void}
 */
function playTune(notes) {
  notes.forEach((midi, k) => setTimeout(() => playTones([midi]), k * 140));
}

/**
 * Show the next waiting name card, if no card is showing.
 * @returns {void}
 */
function showNextCard() {
  const dialog = byId('card');
  if (dialog.open || state.cards.length === 0) return;
  const card = state.cards.shift();
  byId('card-badge').textContent = card.badge;
  byId('card-name').textContent = card.name;
  byId('card-fact').textContent = card.fact;
  byId('card-picture').replaceChildren(picture(card.layout, card.hands, CARD_CELL_PX));
  dialog.showModal();
  if (card.sound === FANFARE) playTune(FANFARE);
  else playTones(card.sound);
  speak(card.name);
}

/**
 * A book picture of a molecule, the way it was built.
 * @param {{width: number, height: number}} layout - the little board
 * @param {boolean} [hands] - draw free hands (for a single new atom)
 * @param {number} [cell] - cell size in CSS pixels
 * @returns {HTMLCanvasElement} the picture
 */
function picture(layout, hands = false, cell = PICTURE_CELL_PX) {
  const ratio = window.devicePixelRatio || 1;
  const pic = document.createElement('canvas');
  pic.className = 'molecule-picture';
  pic.width = layout.width * cell * ratio;
  pic.height = layout.height * cell * ratio;
  pic.style.width = `${layout.width * cell}px`;
  pic.style.height = `${layout.height * cell}px`;
  const pctx = pic.getContext('2d');
  pctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  drawBoard(pctx, layout, cell, { grid: false, hands });
  return pic;
}

/**
 * Hook up the name card, the 📖 book and the ⚙️ grown-up corner.
 * @returns {void}
 */
function setupDialogs() {
  byId('card').addEventListener('close', showNextCard);
  byId('open-book').addEventListener('click', () => {
    showBookTab('found');
    byId('book').showModal();
  });
  for (const button of document.querySelectorAll('[data-book-tab]')) {
    button.addEventListener('click', () => showBookTab(button.dataset.bookTab));
  }
  byId('open-grownup').addEventListener('click', () => byId('grownup').showModal());
  byId('unlock-all').addEventListener('click', () => {
    unlockAll(state.book);
    save();
    buildPalette();
  });
  byId('name-invention').addEventListener('click', () => {
    if (!state.book.inventions.length) return;
    const name = window.prompt('A name for the newest 💡 invention?', state.book.inventions[0].name);
    if (name && nameNewestInvention(state.book, name)) save();
  });
  byId('reset-book').addEventListener('click', () => {
    if (!window.confirm('Erase the whole collection book and the board? This can’t be undone.')) return;
    state.board = createBoard(BOARD_WIDTH, BOARD_HEIGHT);
    state.book = createBook();
    state.selected = 'H';
    save();
    buildPalette();
    draw();
  });
}

/**
 * Fill the book with one tab's molecules.
 * @param {string} tab - 'found', 'rare' or 'inventions'
 * @returns {void}
 */
function showBookTab(tab) {
  const tabs = [...document.querySelectorAll('[data-book-tab]')];
  choose(tabs, tabs.find((b) => b.dataset.bookTab === tab));
  const list = byId('book-list');
  list.replaceChildren();
  if (tab === 'found') {
    for (const rung of LADDER) {
      const heading = document.createElement('h3');
      heading.textContent = rung.unlocks.map((el) => ATOM_INFO[el].emoji).join(' ');
      list.append(heading);
      for (const entry of KID_MOLECULES.filter((k) => k.step === rung.step)) list.append(foundTile(entry));
    }
  } else if (tab === 'rare') {
    for (const item of state.book.pending) list.append(tile(item.layout, '⏳ …', null));
    for (const item of state.book.rare) list.append(tile(item.layout, item.name, item.name));
    const credit = document.createElement('p');
    credit.className = 'credit';
    credit.textContent = 'Rare names come from PubChem (pubchem.ncbi.nlm.nih.gov).';
    list.append(credit);
  } else {
    for (const item of state.book.inventions) list.append(tile(item.layout, item.name, item.name));
  }
  if (!list.querySelector('.book-tile')) {
    const empty = document.createElement('p');
    empty.textContent = 'Nothing here yet. Keep building!';
    list.prepend(empty);
  }
}

/**
 * A 📖 tile: the picture and name if found, or a ❓ and an atom hint if not.
 * @param {{smiles: string, name: string, fact: string}} entry - a hand-written molecule
 * @returns {HTMLElement} the tile
 */
function foundTile(entry) {
  const label = canonLabel(parseSmiles(entry.smiles));
  if (!state.book.found.includes(label)) {
    const hint = tile(null, atomHint(entry.smiles), null);
    hint.classList.add('not-found');
    return hint;
  }
  return tile(state.book.pictures[label] ?? null, entry.name, `${entry.name}. ${entry.fact}`);
}

/**
 * One tile in the book. Tapping it says its words.
 * @param {object|null} layout - the picture, or null for a ❓
 * @param {string} text - the words under it
 * @param {string|null} say - what to say when tapped (null = nothing)
 * @returns {HTMLElement} the tile
 */
function tile(layout, text, say) {
  const button = document.createElement('button');
  button.className = 'book-tile';
  if (layout) button.append(picture(layout));
  else {
    const mystery = document.createElement('span');
    mystery.className = 'mystery';
    mystery.textContent = '❓';
    button.append(mystery);
  }
  const words = document.createElement('span');
  words.textContent = text;
  button.append(words);
  if (say) button.addEventListener('click', () => speak(say));
  return button;
}
```

- [ ] **Step 6: Write `chem.html`**

```html
<!DOCTYPE html>
<!--
  chem.html: the Chemistry room. Atoms hold hands to make molecules.

  The board is drawn on one <canvas> by js/chem/room.js. Below it: the
  three tools (PLACE, REMOVE, BOND), 🗑️, and the atom buttons (locked
  ones show 🔒). The 📖 button opens the collection book, and ⚙️ is the
  grown-up corner. The three <dialog>s are the name card, the book, and
  the grown-up corner; room.js opens and fills them.
-->
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Chemistry · Caleb's Blocky World</title>
  <!-- Icons: the browser tab, the iPad home screen, and old browsers.
       All drawn from img/icon-pixels.txt by tools/make-icons.js. -->
  <link rel="icon" href="favicon.ico" sizes="32x32">
  <link rel="icon" href="img/icon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="img/apple-touch-icon.png">
  <!-- The app manifest lets the site be added to the home screen and open
       full-screen like an app (see manifest.webmanifest). -->
  <link rel="manifest" href="manifest.webmanifest">
  <meta name="theme-color" content="#7ec8ff">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-title" content="Caleb">
  <meta name="description" content="Caleb's blocky corner of the internet: music blocks with chords and scales, drawing, and print and cursive handwriting practice.">
  <!-- Sharing previews: the card that shows up when the link is texted or
       posted. These must be full https:// addresses, not "img/...". -->
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Caleb's Blocky World">
  <meta property="og:title" content="Chemistry · Caleb's Blocky World">
  <meta property="og:description" content="Caleb's blocky corner of the internet: music blocks with chords and scales, drawing, and print and cursive handwriting practice.">
  <meta property="og:url" content="https://calebhamsa.fun/chem.html">
  <meta property="og:image" content="https://calebhamsa.fun/img/share-card.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="HI, I'M CALEB! with music, draw and write blocks on grass">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <!-- Two fonts: the pixel font, and Andika (made for kids learning to read) for the fun facts.
       crossorigin lets the offline helper (sw.js) save this, so the fonts work offline too. -->
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Andika&family=Playwrite+US+Trad&family=Press+Start+2P&display=swap" crossorigin>
  <link rel="stylesheet" href="css/blocks.css">
</head>
<body class="build-page chem-page">
  <header class="top-bar">
    <a class="block home" href="index.html" aria-label="Home">🏠</a>
    <h1 class="page-title">🧪 CHEMISTRY</h1>
    <button class="block gold" id="open-book" aria-label="Collection book">📖</button>
    <button class="block" id="open-grownup" aria-label="Grown-up settings">⚙️</button>
    <p class="save-problem" id="save-problem" hidden>can't save here</p>
  </header>

  <main class="build-main">
    <div class="world-frame" id="board-frame">
      <canvas id="board" aria-label="Chemistry board"></canvas>
    </div>

    <div class="toolbar">
      <button class="block grass" data-tool="place" aria-pressed="true">🧱 PLACE</button>
      <button class="block dirt" data-tool="remove" aria-pressed="false">⛏️ REMOVE</button>
      <button class="block gold" data-tool="bond" aria-pressed="false">🔗 BOND</button>
      <button class="block obsidian" id="clear" aria-label="Clear the board">🗑️</button>
    </div>

    <!-- room.js fills this: one button per atom. -->
    <div class="toolbar palette" id="atoms"></div>
  </main>

  <!-- The name card: pops up when a molecule is finished (or an atom unlocks). -->
  <dialog class="chem-dialog" id="card">
    <form method="dialog">
      <p class="card-badge" id="card-badge"></p>
      <div class="card-picture" id="card-picture"></div>
      <h2 id="card-name"></h2>
      <p id="card-fact"></p>
      <button class="block grass">👍 OK</button>
    </form>
  </dialog>

  <!-- The collection book. -->
  <dialog class="chem-dialog book" id="book">
    <form method="dialog">
      <div class="toolbar">
        <button type="button" class="block" data-book-tab="found" aria-pressed="true">📖</button>
        <button type="button" class="block" data-book-tab="rare" aria-pressed="false">🌟</button>
        <button type="button" class="block" data-book-tab="inventions" aria-pressed="false">💡</button>
        <button class="block obsidian" aria-label="Close">✖</button>
      </div>
      <div class="book-list" id="book-list"></div>
    </form>
  </dialog>

  <!-- The grown-up corner. -->
  <dialog class="chem-dialog" id="grownup">
    <form method="dialog">
      <h2>Grown-ups</h2>
      <button type="button" class="block gold" id="unlock-all">🔓 Unlock every atom</button>
      <button type="button" class="block" id="name-invention">💡 Name the newest invention</button>
      <button type="button" class="block obsidian" id="reset-book">🗑️ Erase the book</button>
      <button class="block grass">Done</button>
    </form>
  </dialog>

  <script type="module">
    import { initChem } from './js/chem/room.js';
    initChem();
    import { registerServiceWorker } from './js/pwa.js';
    registerServiceWorker(); // the offline helper (see js/pwa.js)
  </script>
</body>
</html>
```

- [ ] **Step 7: Styles: apply to `css/blocks.css`**

```diff
--- a/css/blocks.css
+++ b/css/blocks.css
@@ -156,6 +156,7 @@
 .block.dirt     { --face: var(--dirt);     --edge: var(--dirt-dark); }
 .block.gold     { --face: var(--gold);     --edge: var(--gold-dark); }
 .block.obsidian { --face: var(--obsidian); --edge: var(--obsidian-dark); }
+.block.chem     { --face: #26a69a;         --edge: #1b7a71; } /* the 🧪 CHEMISTRY block */
 
 
 /* -----------------------------------------------------------------
@@ -609,6 +610,72 @@
 
 
 /* -----------------------------------------------------------------
+   8b. Chemistry room (chem.html). It borrows the Build page's layout
+   (.build-page, .build-main, .world-frame) and adds the board, the atom
+   buttons, and the pop-up cards.
+   ----------------------------------------------------------------- */
+.chem-page { --page-bg: #b8e0d2; } /* a minty lab color */
+
+/* touch-action: none means a finger on the board builds, it doesn't scroll. */
+#board {
+  display: block;
+  border: 6px solid var(--stone-dark); /* room.js knows this is 6px (BOARD_BORDER_PX) */
+  touch-action: none;
+}
+
+.atom-button { padding: 4px; min-width: 64px; font-size: 20px; }
+.atom-button canvas { display: block; }
+
+/* The pop-ups: name card, collection book, grown-up corner. */
+.chem-dialog {
+  max-width: min(92vw, 640px);
+  border: 6px solid var(--stone-dark);
+  padding: 16px;
+  background: var(--paper);
+  font-family: var(--pixel-font);
+  text-align: center;
+}
+.chem-dialog::backdrop { background: rgba(0, 0, 0, 0.5); }
+.chem-dialog form { display: flex; flex-direction: column; align-items: center; gap: 12px; }
+.chem-dialog h2 { margin: 0; font-size: clamp(14px, 3.5vw, 20px); line-height: 1.5; }
+.chem-dialog p { margin: 0; font-family: 'Andika', sans-serif; font-size: 18px; line-height: 1.4; }
+.chem-dialog .card-badge { font-family: var(--pixel-font); font-size: 14px; }
+#card[open] { animation: cheer 700ms ease-out; }
+
+.book { width: min(92vw, 640px); }
+.book-list {
+  display: flex;
+  flex-wrap: wrap;
+  justify-content: center;
+  gap: 8px;
+  max-height: 60vh;
+  overflow-y: auto;
+}
+.book-list h3 { flex-basis: 100%; margin: 8px 0 0; font-size: 18px; }
+.book-list .credit { flex-basis: 100%; font-size: 12px; }
+.book-tile {
+  display: flex;
+  flex-direction: column;
+  align-items: center;
+  justify-content: center;
+  gap: 4px;
+  min-width: 96px;
+  min-height: 96px;
+  max-width: 180px;
+  padding: 6px;
+  border: 3px solid var(--stone);
+  background: #fffaf0;
+  font-family: 'Andika', sans-serif;
+  font-size: 13px;
+  overflow-wrap: anywhere;
+  cursor: pointer;
+}
+.book-tile.not-found { opacity: 0.6; }
+.book-tile .mystery { font-size: 32px; }
+.molecule-picture { display: block; max-width: 100%; height: auto; }
+.book-tile .molecule-picture { max-width: 168px; }
+
+/* -----------------------------------------------------------------
    9. Animations
    @keyframes describes a little movie: where things are at 0%, 50%, 100%...
    ----------------------------------------------------------------- */
@@ -649,7 +716,8 @@
   .message.cheer,
   .shake,
   .canvas-stack.wiped,
-  .block.recording {
+  .block.recording,
+  #card[open] {
     animation: none;
   }
 }
```

- [ ] **Step 8: Home page block: apply to `index.html`**

```diff
--- a/index.html
+++ b/index.html
@@ -64,6 +64,7 @@
       <!-- "?mode=trace" tells the drawing page to open in tracing mode. -->
       <a class="block big dirt" href="draw.html?mode=trace"><span class="icon">✍️</span>WRITE</a>
       <a class="block big" href="build.html"><span class="icon">⛏️</span>BUILD</a>
+      <a class="block big chem" href="chem.html"><span class="icon">🧪</span>CHEMISTRY</a>
     </nav>
 
     <section class="favorites">
@@ -74,6 +75,7 @@
         <li>🎨 drawing</li>
         <li>✍️ writing</li>
         <li><a href="build.html">⛏️ building with blocks</a></li>
+        <li><a href="chem.html">🧪 making molecules</a></li>
       </ul>
     </section>
   </main>
```

- [ ] **Step 9: Offline: apply to `sw.js`**

```diff
--- a/sw.js
+++ b/sw.js
@@ -26,7 +26,7 @@
  * 🧪 Change the number (v1 → v2) after adding or renaming files in PRECACHE
  *    below, so every device fetches a fresh set.
  */
-const CACHE_NAME = 'caleb-v5';
+const CACHE_NAME = 'caleb-v6';
 
 /**
  * Files to save straight away, the first time the site is opened, so
@@ -58,6 +58,16 @@
   './js/blocks/water.js',
   './js/spin.js',
   './js/blocks/gears.js',
+  './chem.html',
+  './js/chem/board.js',
+  './js/chem/book.js',
+  './js/chem/canon.js',
+  './js/chem/chem-art.js',
+  './js/chem/kid-names.js',
+  './js/chem/lookup.js',
+  './js/chem/room.js',
+  './js/chem/save.js',
+  './js/chem/smiles.js',
   './manifest.webmanifest',
   './favicon.ico',
   './img/icon.svg',
@@ -99,6 +109,10 @@
 function strategyFor(request) {
   if (request.method !== 'GET') return 'skip'; // only "fetch me a file" requests
   const url = new URL(request.url);
+  // Big data files (the chemistry room's 3 MB name list) hardly ever
+  // change, and on slow Wi-Fi they'd never beat NETWORK_TIMEOUT_MS, so
+  // they'd never get saved. Saved copy first; refresh in the background.
+  if (url.origin === self.location.origin && url.pathname.startsWith('/data/')) return 'stale-while-revalidate';
   if (url.origin === self.location.origin) return 'network-first';
   if (FONT_HOSTS.includes(url.hostname)) return 'stale-while-revalidate';
   return 'skip';
```

- [ ] **Step 10: Run all tests**

Run: `npm test`
Expected: PASS: everything (about 430 tests)

- [ ] **Step 11: Headless iPad check**

Serve the site and drive it with Playwright (Chromium, iPad landscape). Save as `/tmp/…/smoke.cjs` (scratch, not committed):

```js
const { chromium, devices } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ ...devices['iPad (gen 7) landscape'] });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('http://localhost:8765/chem.html');
  await page.waitForTimeout(800);
  const box = await page.locator('#board').boundingBox();
  const cell = (box.width - 12) / 12;
  const tap = async (x, y) => page.mouse.click(box.x + 6 + (x + 0.5) * cell, box.y + 6 + (y + 0.5) * cell);
  console.log('palette:', await page.locator('#atoms button').evaluateAll((bs) => bs.map((b) => (b.disabled ? 'locked' : b.dataset.atom)).join(' ')));
  await page.locator('[data-atom="O"]').click();
  await tap(5, 4);
  await page.locator('[data-atom="H"]').click();
  await tap(4, 4);
  await page.screenshot({ path: process.argv[2] + '/shot-half.png' });
  await tap(6, 4);
  await page.waitForTimeout(300);
  console.log('card open:', await page.locator('#card').evaluate((d) => d.open), '|', await page.locator('#card-badge').textContent(), '|', await page.locator('#card-name').textContent(), '|', await page.locator('#card-fact').textContent());
  await page.screenshot({ path: process.argv[2] + '/shot-card.png' });
  await page.locator('#card button').click();
  await page.waitForTimeout(200);
  console.log('next card:', await page.locator('#card').evaluate((d) => d.open), '|', await page.locator('#card-name').textContent());
  await page.locator('#card button').click();
  console.log('palette:', await page.locator('#atoms button').evaluateAll((bs) => bs.map((b) => (b.disabled ? 'locked' : b.dataset.atom)).join(' ')));
  // O=O: two O atoms, then 🔗 on the bond between them
  await page.locator('[data-atom="O"]').click();
  await tap(1, 1); await tap(2, 1);
  await page.locator('[data-tool="bond"]').click();
  await page.mouse.click(box.x + 6 + 2 * cell - 2, box.y + 6 + 1.5 * cell);
  await page.waitForTimeout(300);
  console.log('O2 card:', await page.locator('#card-name').textContent());
  await page.locator('#card button').click();
  await page.waitForTimeout(1500); // give the database time
  console.log('db loaded:', await page.evaluate(async () => (await (await fetch('data/molecules.json')).json()) !== null));
  // A 🌟 rare one: allene, H2C=C=CH2 (not hand-written, but in the big list)
  await page.locator('[data-tool="place"]').click();
  await page.locator('[data-atom="C"]').click();
  for (const x of [1,2,3]) await tap(x, 7);
  await page.locator('[data-tool="bond"]').click();
  // C1=C2 and C2=C3
  await page.mouse.click(box.x + 6 + 2 * cell - 2, box.y + 6 + 7.5 * cell);
  await page.mouse.click(box.x + 6 + 3 * cell - 2, box.y + 6 + 7.5 * cell);
  await page.locator('[data-tool="place"]').click();
  await page.locator('[data-atom="H"]').click();
  for (const [x,y] of [[0,7],[1,6],[3,6],[4,7]]) await tap(x, y);
  await page.waitForTimeout(300);
  console.log('rare card:', await page.locator('#card-badge').textContent(), '|', await page.locator('#card-name').textContent());
  await page.screenshot({ path: process.argv[2] + '/shot-rare.png' });
  await page.locator('#card button').click();
  await page.locator('#open-book').click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: process.argv[2] + '/shot-book.png' });
  await page.locator('[data-book-tab="rare"]').click();
  console.log('rare tab:', (await page.locator('#book-list').innerText()).replace(/\n/g, ' / ').slice(0, 200));
  await page.locator('#book button[aria-label="Close"]').click();
  await page.reload();
  await page.waitForTimeout(800);
  console.log('after reload card open:', await page.locator('#card').evaluate((d) => d.open), 'palette:', await page.locator('#atoms button').evaluateAll((bs) => bs.map((b) => (b.disabled ? 'locked' : b.dataset.atom)).join(' ')));
  await page.screenshot({ path: process.argv[2] + '/shot-reload.png' });
  console.log('errors:', errors);
  await browser.close();
})();
```

```sh
python3 -m http.server 8765 &   # from the repo folder
NODE_PATH=~/LFG/scripts/share_card/node_modules node smoke.cjs /tmp/shots
```
Expected output: `card open: true | 📖 | Water | …`, `next card: true | Carbon!`, palette `H O C locked locked locked`, `O2 card: Oxygen`, `rare card: 🌟 Super rare! | Allene`, after reload `card open: false`, `errors: []`. Look at the screenshots: free hands are visible stubs, finished molecules glow, and the book shows ❓ tiles with atom hints.

- [ ] **Step 12: Commit**

```bash
npm test
git add js/chem/chem-art.js js/chem/room.js chem.html css/blocks.css index.html sw.js tests/chem-room.test.js tests/pages.test.js tests/sw.test.js tests/modules.test.js
git commit -m "Chemistry room: the page, drawing, name cards, book, offline"
git push origin main
```

---

### Task 7: README, real-iPad check, follow-ups

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: the finished room.
- Produces: docs only.

- [ ] **Step 1: Apply the README changes**

```diff
--- a/README.md
+++ b/README.md
@@ -24,10 +24,11 @@
 
 | File | What it does |
 |---|---|
-| `index.html` | The homepage: title, four big blocks, favorite things |
+| `index.html` | The homepage: title, five big blocks, favorite things |
 | `music.html` | The Note Blocks page layout |
 | `draw.html` | The Draw & Trace page layout |
 | `build.html` | The Build page layout |
+| `chem.html` | The Chemistry room layout |
 | `css/blocks.css` | How everything **looks**: colors, block buttons, animations |
 | `js/music-theory.js` | The music brain: notes as numbers, chords, scales (pure math) |
 | `js/music.js` | Makes Note Blocks work: sound, modes, record, Guess it! |
@@ -44,6 +45,16 @@
 | `js/blocks/registry.js` | The list of block packs (add new packs here) |
 | `js/block-art.js` | Draws blocks pixel-art style |
 | `js/saves.js` | Keeps the three Build worlds saved |
+| `js/chem/room.js` | Makes the Chemistry room work: tools, atoms, name cards, the book |
+| `js/chem/board.js` | The chemistry board: atoms holding hands, finished and stuck molecules (pure) |
+| `js/chem/smiles.js` | Reads molecules written as SMILES text, like `CCO` (pure) |
+| `js/chem/canon.js` | Gives each molecule one label, however it was built (pure) |
+| `js/chem/book.js` | The collection book and the unlock ladder (pure) |
+| `js/chem/lookup.js` | "What did I make?": hand-written list, then the big list |
+| `js/chem/kid-names.js` | The hand-written molecules: kid names and fun facts |
+| `js/chem/chem-art.js` | Draws atoms, sticks and hands |
+| `js/chem/save.js` | Keeps the chemistry board and book saved |
+| `data/molecules.json` | 69,000 real molecule names from PubChem (made by `tools/chem-db/`) |
 | `js/draw.js` | The drawing pad: brushes, colors, clear, save |
 | `js/trace.js` | Handwriting sheets: lines, print/cursive letters, fade-out rows |
 | `js/ui.js` | Little helpers every page shares (buttons, grid swipes, picture names) |
@@ -233,6 +244,35 @@
 
 ![Sand sinking through water in a glass tank](docs/machines/sand-in-water.png)
 
+## 🧪 The Chemistry room
+
+Atoms are balls with **hands**: ⚪ H has 1, 🔴 O has 2, 🔵 N has 3, ⚫ C has 4,
+🟢 Cl has 1, 🟡 S has 2. Put atoms side by side and they hold hands by
+themselves. When **every** hand in a molecule is holding another one, it's
+finished: it glows, the room says its name, and it goes in the 📖 book.
+
+| Tool | What it does |
+|---|---|
+| 🧱 PLACE | Tap or drag to put the chosen atom down |
+| ⛏️ REMOVE | Tap or drag to take atoms away |
+| 🔗 BOND | Tap between two atoms: one more stick (double, triple bonds). When they can't take more sticks, the tap pulls them apart, and the next tap joins them again |
+
+- **Name cards:** 📖 a molecule from the book (with a fun fact), 🌟 a real
+  molecule with its real chemistry name ("super rare!"), 💡 a molecule nobody
+  has named: your invention. ⏳ means "no internet yet, I'll look it up later".
+- **Unlocking:** start with H and O. 💧 Water unlocks ⚫ C. Three carbon
+  molecules unlock 🔵 N. Two nitrogen molecules unlock 🟢 Cl and 🟡 S.
+- **Crowding:** H atoms take up a cell, so some shapes don't fit. A hand with
+  no room left turns red and squished, with a 💥. Move something!
+- **Rings:** a ring of 6 carbons (benzene) is a 2×3 rectangle. The two middle
+  carbons grab hands across the ring, so pull them apart with 🔗.
+- **Grown-ups (⚙️):** unlock every atom, name the newest invention, or erase the book.
+
+The big name list comes from [PubChem](https://pubchem.ncbi.nlm.nih.gov)
+(public domain, from the US National Library of Medicine): every molecule
+with up to 8 non-H atoms that fits on the board. See `tools/chem-db/README.md`
+to remake it.
+
 ## 🧪 Experiments to try
 
 Search the code for `🧪 Try this!` to find them all. Some favorites:
@@ -252,6 +292,8 @@
 13. **Dimmer lamps:** in `js/blocks/electric.js`, change the lamp's `resistance` to 2.
 14. **Slow-motion water:** in `js/fluids.js`, set `FLUID_STEPS` to 1.
 15. **Super gears:** in `js/blocks/gears.js`, give the big gear 24 teeth: small gears it drives spin 3 times as fast.
+16. **Easy carbon:** in `js/chem/book.js`, change the N step's goal from 3 carbon molecules to 1.
+17. **Your own molecule:** add one to `js/chem/kid-names.js` with its SMILES, a name and a fact, then run `npm test`.
 
 ## Using it like an app (offline)
 
@@ -315,6 +357,9 @@
 - [ ] Rotating the tablet keeps the drawing and redraws the guides.
 - [ ] Nothing scrolls sideways on a phone.
 - [ ] Add to Home Screen shows the grass-block icon and opens full-screen.
+- [ ] Chemistry: H–O–H says "Water!" and unlocks C; the book shows the water picture.
+- [ ] Chemistry: 🔗 on O–O makes O=O (Oxygen); 🔗 on a full pair pulls it apart.
+- [ ] Chemistry: a molecule with a long chemistry name gets 🌟 (needs the internet once).
 - [ ] Turn on Airplane Mode and open the home-screen app: every page still works.
 
 ## Publishing
```

- [ ] **Step 2: Run all tests and commit**

```bash
npm test
git add README.md
git commit -m "README: the Chemistry room, its tools, unlocks and PubChem credit"
git push origin main
```

- [ ] **Step 3: Check the live site**

After GitHub Pages deploys (about 1 minute), open https://calebhamsa.fun/chem.html and confirm the page loads and `data/molecules.json` is served (`curl -sI https://calebhamsa.fun/data/molecules.json` → 200).

- [ ] **Step 4: Real iPad with Caleb**

Go through the README checklist's three chemistry lines on the iPad: speech says "Water!", O=O works, and a 🌟 rare find appears. Also check Airplane Mode after one online visit.

- [ ] **Step 5: Follow-ups**

Open an issue for the Build-world bridge (molecule → block, spec "Out of scope"):
```sh
gh issue create --repo Team-Hamsa/calebhamsa.fun --title "Chemistry → Build bridge: finished molecules become blocks" --body "Follow-up to #6 (chemistry room). Idea from the spec: e.g. 💧 water unlocks water/faucet in Build. Needs its own brainstorm → spec → plan."
```
Close #6 with a comment linking the commits, once Caleb has played it.

---
