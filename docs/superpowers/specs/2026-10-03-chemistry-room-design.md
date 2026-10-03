# Block Playground Phase 5: 🧪 Chemistry Room — Design Spec

**Date:** 2026-10-03
**Status:** Draft, awaiting review
**Part of:** #6.
**Builds on:** the site conventions and the phase 1 spec (`2026-10-02-block-playground-design.md`). Chemistry is its own room (its own page), not a palette tab in the Build world.

## Purpose

A room where **atom blocks hold hands to make molecules**. Caleb (almost 5) places atoms on a grid. Each atom shows how many hands it has (H 1, O 2, N 3, C 4, Cl 1, S 2). Atoms that sit side by side hold hands automatically. When every hand in a group is holding another, the molecule is finished: the room says its name and puts it in a **collection book**. Finding molecules unlocks new atoms.

It's free play: there are no recipes and nothing to get wrong. Every finished molecule counts. A hand-written list of about 100 gives kid names and fun facts. A database of about 69,000 real molecules from PubChem gives the formal name of almost anything else he builds, with a 🌟 rare badge. Anything left over is **his invention**.

### Success criteria

1. On an iPad, Caleb can build H₂O by himself (place 🔴 O, then ⚪ H on two sides). It glows, says "Water!", and appears in the book.
2. Making water unlocks ⚫ C with a fanfare. Later steps unlock 🔵 N, then 🟢 Cl and 🟡 S.
3. A molecule that isn't hand-written but is in the database (e.g. butanone) gets its PubChem name spoken, plus a 🌟 rare badge, and is saved in the book's Rare tab.
4. A finished molecule in neither list is saved as a 💡 invention, which a grown-up can name.
5. The same molecule gets the same result however it's built: rotated, mirrored, moved, built in a different order, or with a ring's double bonds placed differently (Kekulé forms).
6. Crowded shapes that can't fit show a squished red hand and a 💥 wobble, so he can see why the molecule won't finish.
7. Board, book and unlocks survive closing the iPad. The room works offline once visited, including names once the database has been fetched.
8. Project conventions hold: vanilla JS with no dependencies, a header comment on every file, JSDoc on every function, 🧪 "Try this!" comments, and pure logic covered by `npm test`.

### Decisions made during brainstorming

| Question | Decision |
|---|---|
| Play style | Free play + collection book (no recipe cards) |
| Bonding | Grid snap: neighbors with free hands bond automatically; tap a bond to cycle single → double → triple |
| Unknown finished molecules | Always celebrated. In database → 🌟 rare (formal name). Not in database → 💡 invention |
| Database | Every PubChem compound that fits the rules (see Database), named from PubChem's titles. Built offline with RDKit; the site only ships the result |
| Size limit | ≤ 8 heavy (non-H) atoms. Measured: 69,153 named molecules, 0.78 MB compressed |
| Formal names | Shown and spoken as-is, with a 🌟 rare badge (no made-up nicknames) |
| Hydrogen | A real block that takes a cell. Crowded branched shapes (isobutane, neopentane) are impossible on purpose |
| Bridge to Build world | Not in this phase: a follow-up issue |
| Where it lives | Its own page `chem.html` + `js/chem/` modules (approach 1), not a mode inside `build.html` |

## Constraints

- Vanilla HTML/CSS/JS, ES modules, no build step, and no runtime dependencies. RDKit is a **dev-only** tool used to make the data file, and is never loaded by the site.
- Page code touches the DOM only inside `init…()`, so every `js/chem/` module imports cleanly in Node tests.
- Big touch targets, and no reading needed to play: speech and pictures carry the names.
- Our own art, matching the site's blocky look.

## Measurements (2026-10-03, PubChem bulk files of that date)

| Filter step | Molecules |
|---|---|
| H/C/N/O/S/Cl only, neutral, no isotopes or radicals, one piece, hands exact (H1 C4 N3 O2 S2 Cl1), ≤ 8 heavy atoms, stereo removed, deduplicated | 148,018 |
| …that fit a flat square grid with H as a cell | 69,165 (318 were undecided: the search hit its step budget, counted as not fitting) |
| …with a PubChem title | 69,153 |

Fit by heavy-atom count: 0 → 1 (H₂), 1 → 5, 2 → 28, 3 → 114, 4 → 703, 5 → 2,696, 6 → 8,564, 7 → 19,884, 8 → 37,170.
Size of label → name JSON: 3.27 MB raw, 0.78 MB gzipped. Most names are formal IUPAC-style names (only 11,609 contain no digits or commas). That's expected, and it's why the 🌟 rare badge exists.

## The room (chem.html, js/chem/room.js)

```
┌──────────────────────────────────────────────┐
│ 🏠  🧪 CHEMISTRY            📖 BOOK   ⚙️      │
├──────────────────────────────────────────────┤
│                                              │
│            12 × 9 grid of big cells          │
│        (H)                                   │
│         |                                    │
│   (H)-(O)        (C)=(O)                     │
│                                              │
├──────────────────────────────────────────────┤
│ 🧱 PLACE   ⛏️ REMOVE   🔗 BOND        🗑️       │
│ ⚪H  🔴O  ⚫C  🔒  🔒  🔒                      │
└──────────────────────────────────────────────┘
```

- **Board:** 12 × 9 cells. One atom per cell.
  🧪 Try this: `BOARD_WIDTH`/`BOARD_HEIGHT` constants.
- **Palette:** unlocked atoms as colored balls with their letter and hand stubs. Locked atoms are grey with 🔒.

  | Atom | Color | Hands |
  |---|---|---|
  | H | ⚪ white | 1 |
  | O | 🔴 red | 2 |
  | C | ⚫ black | 4 |
  | N | 🔵 blue | 3 |
  | Cl | 🟢 green | 1 |
  | S | 🟡 yellow | 2 |

  These are the standard modeling-kit (CPK) colors, so they match real molecule kits.
- **Tools:**
  - 🧱 **Place:** tap or drag. You can't place on a filled cell.
  - ⛏️ **Remove:** tap or drag. Removes the atom and its bonds.
  - 🔗 **Bond:** tap between two bonded atoms to raise the bond one step (single → double → triple). It goes back to single when it can't go higher, either because it's already triple or because one of the atoms has no free hand left.
- **Auto-bond rule:** after every change, the board scans pairs of side-by-side atoms (row by row, left to right, and for each atom its right neighbor then its lower neighbor). Any unbonded pair where both atoms have a free hand gets a single bond. Only side neighbors bond; diagonals never do. Two side-by-side atoms with no free hands just sit there unbonded.
- **Drawing:**
  - Atoms are balls with a letter.
  - A bond is one, two or three sticks between the cell centers.
  - Free hands are small waving stubs spread evenly around the ball (not tied to a grid side).
- **Molecule:** a group of atoms connected by bonds.
- **Finished:** every atom in the group has zero free hands. A lone atom is never finished, except that two H's bonded together make H₂, which is finished.
- **Stuck hand:** an atom has a free hand, but every side cell is either taken by an atom with no free hands or is off the board. Its stubs turn red and squished, and the atom wobbles with 💥 when it becomes stuck.
- **Finish moment:** a group that changes from not finished to finished (and only then; reloading the page doesn't replay it):
  1. The group glows.
  2. It's looked up (see Lookup).
  3. The name is spoken with the Web Speech API (`speechSynthesis`). If speech isn't available, the name card is shown on its own.
  4. A name card pops up showing a picture, the name, and a badge (📖 / 🌟 / 💡 / ⏳).
  5. The result is added to the book. If it's already there, the card says "found again!", and it doesn't count twice toward unlocks.
- **⚙️ Grown-up corner:**
  - 🔓 unlock all
  - reset book and progress (asks first)
  - name the latest invention (a text box)

## Collection book (js/chem/book.js + overlay in room.js)

- **📖 Found tab:** the hand-written list, grouped by unlock step.
  - A found entry shows its picture, kid name and fun fact.
  - An unfound entry shows a silhouette plus an atom-count hint (e.g. `⚪⚪🔴`), so he can hunt without reading.
- **🌟 Rare tab:** database finds, newest first, each with a picture and formal name. The tab's footer credits PubChem.
- **💡 Inventions tab:** a picture, plus the grown-up-given name or "Invention #n".
- Tapping any entry speaks its name. Book entries speak their fun fact too.
- **Pictures** come from the molecule's own layout as he built it: the cells and bonds of the group, cropped and drawn small. The saved picture is that layout, not an image.

### Unlock ladder

| Step | Unlocks | How |
|---|---|---|
| 1 | ⚪ H, 🔴 O | start |
| 2 | ⚫ C | find 💧 water |
| 3 | 🔵 N | find 3 different molecules containing C |
| 4 | 🟢 Cl, 🟡 S | find 2 different molecules containing N |

- Found entries and 🌟 rare finds both count toward these goals. Inventions don't count, because they're unchecked.
- Unlocking plays a fanfare and shows a "🔓 Carbon! 4 hands!" card, and the new atom drops into the palette.
  🧪 Try this: the goals live in one `LADDER` table.

### Hand-written list (js/chem/kid-names.js)

About 100 entries, each `{ smiles, name, fact, step }`. For example, step 1 has H₂, O₂, H₂O and H₂O₂. Later steps include CH₄, CO₂, ethane, ethylene, acetylene, methanol, formaldehyde, ethanol ("alcohol"), acetic acid ("vinegar"), N₂ ("most of the air!"), NH₃, HCN, methylamine, HCl, Cl₂, H₂S ("rotten eggs"), methanethiol ("skunk / gas smell"), CH₃Cl, benzene, and others. Every entry must fit the grid and be in the database (a test checks this). The facts are short and true, written for reading aloud. A grown-up can review them in the file.

## Lookup and the database

### js/chem/smiles.js (pure)

A small parser for the subset we need:
- atoms `H C N O S Cl`, plus `[H]`
- bonds `-` `=` `#`
- branches `( )` and ring digits `1–9`

Output: `{ atoms: [{el}], bonds: [{a, b, order}] }`, with hydrogens made explicit by filling each atom's spare hands. Anything else throws a clear error: charges, aromatic lowercase, unknown elements, `%nn` rings, or atoms with too many bonds.

### js/chem/canon.js (pure)

`canonLabel(graph)` → string. It's the same for any two graphs that are the same molecule (same atoms, same bonds), and different otherwise.
- **Hydrogen handling:** H atoms are folded into an H count on their heavy atom. H₂ (no heavy atom) gets the special label `H2`.
- **Method:**
  1. Color refinement: start from (element, H count, bond orders) and repeat with neighbor classes until stable.
  2. Try every ordering within each tied class and keep the smallest label string. That's cheap at ≤ 8 heavy atoms; symmetric molecules have small tied classes.
- **Label format:** heavy atoms in canonical order as `El+Hcount`, then the sorted bond list `i-j:order`.
  The exact format is internal. Tests pin its *behavior*, not its text.
- **The board side:** `board.js` turns a finished group into a graph and calls `canonLabel`.
- **The build side:** `make-db.js` calls the very same function, so labels can't drift apart.

### Build pipeline (tools/chem-db/, dev-only)

1. **`export.py`** (Python 3 + RDKit in a venv; `README.md` there explains setup):
   - Streams PubChem `CID-SMILES.gz`.
   - Applies the filters from Measurements, including the grid-fit backtracking search (budget 200,000 steps; undecided counts as not fitting).
   - Joins titles from `CID-Title.gz`.
   - For each molecule, writes `name<TAB>kekule_smiles_1|kekule_smiles_2|…`. That's **every Kekulé form** (RDKit `ResonanceMolSupplier` with `KEKULE_ALL`), so a ring built with its double bonds placed either way still matches.
   - Each structure keeps the lowest CID's title, because older CIDs are usually the common compounds.
2. **`make-db.js`** (Node):
   - Parses every form with `smiles.js` and labels it with `canon.js`.
   - Writes `data/molecules.json` as a `{label: name}` object, sorted for stable diffs.
   - If two different names claim one label, it keeps the first and reports a count.
   - Hand-written names take priority in the room at lookup time; the database file isn't edited for them.

Only `data/molecules.json` and the tool sources are committed. The raw PubChem downloads (~3.4 GB) are not.

### Lookup order (js/chem/lookup.js)

1. Hand-written list (labels computed from `kid-names.js` at startup) → 📖
2. `data/molecules.json` → 🌟
3. Database not loaded yet (offline, first visit) → ⏳ "I'll look it up later". The group is kept in a pending list and re-checked when the database arrives. It's never called an invention by mistake.
4. Otherwise → 💡 invention

The database is fetched in the background when the page opens (one `fetch`, about 0.8 MB over the wire). Until it arrives, steps 1, 3 and 4 still work.

## Saving (js/chem/save.js)

- **Storage:** `localStorage["calebhamsa.chem.v1"]`:
  - the board: atom cells and bonds
  - found labels
  - rare finds: label, name, picture layout
  - inventions: label, name, picture layout
  - pending ⏳ groups
  - unlock step
- Saved after every change, wrapped in try/catch. If storage is blocked or corrupt, the room starts fresh in memory and still works.
- 🗑️ clears the board only. The book is reset only from the grown-up corner, and it asks first.

## Offline and site wiring

- Add `chem.html`, every `js/chem/*.js`, and `data/molecules.json` to `sw.js` PRECACHE, and bump `CACHE_NAME`.
  *Revisit at planning:* if precaching 3.3 MB on a first visit to any page is too heavy, leave the JSON out of PRECACHE and rely on the network-first runtime cache when the room fetches it.
- Add a 🧪 CHEMISTRY block to `index.html`.
- Use the existing `pwa.js` registration.
- README: add a chemistry room section with the atom table, how bonding works, the unlock ladder, the PubChem credit, and how to rebuild the database.

## Error handling and edge cases

- **Placing next to several neighbors at once:** auto-bond follows the scan order, so the result is deterministic.
- **Removing an atom:** frees its neighbors' hands, then auto-bond runs again (a neighbor may now hold hands with someone else).
- **A bond tap that can't go up** (no free hands): the bond goes back to single, freeing hands, and auto-bond runs.
- **Two finished molecules side by side:** separate groups, each announced once.
- **A finished group gets an atom added and stops being finished:** it can finish again later. Re-finishing as the same molecule shows "found again!" and doesn't count twice.
- **A molecule with more than 8 heavy atoms:** if finished, it's looked up like any other. The database won't have it, so it becomes an 💡 invention (unless hand-written).
- **No speech voices (some iPads before first touch):** speech is started from the tap that finished the molecule. If it's still unavailable, the name card alone is shown.
- **Corrupt save:** start fresh and keep a copy in `calebhamsa.chem.v1.broken`, so it can be recovered.

## Testing

All of these run under `npm test` (node --test), written test-first:
- **smiles.js:**
  - water, ethanol, benzene in Kekulé form, `[H][H]`, branches, and rings
  - rejects `c1ccccc1`, `[NH4+]`, `Na`, and `C(C)(C)(C)(C)C`
- **canon.js:**
  - the same molecule gives the same label after shuffling atom order or swapping bond ends
  - ethanol ≠ dimethyl ether; butane ≠ isobutane; ethylene ≠ ethane
  - both Kekulé forms of o-xylene, once built into the database, resolve to one name
- **board.js:**
  - auto-bond scan order
  - bond cycling limits
  - finished detection (including H₂, and a lone H that isn't finished)
  - stuck-hand detection
  - benzene as a 2×3 ring
  - water built sideways, upside down, or moved gives the same label
  - removing an atom re-bonds its neighbors
- **book.js:**
  - the ladder steps
  - rare finds count toward goals and inventions don't
  - the same molecule twice counts once
  - ⏳ pending items resolve when the database arrives
- **lookup.js:** priority order, using a small fixture database.
- **save.js:** round trip, blocked storage, and a corrupt save.
- **Data checks:**
  - every `kid-names.js` entry parses, fits the grid, and is in `molecules.json`
  - 200 random database rows agree with their labels when recomputed
  - isobutane is absent
- **Existing tests:**
  - `tests/docs.test.js` covers the new files (JSDoc).
  - `tests/readme.test.js` stays green.
- **Headless:** Playwright with Chromium iPad emulation (borrowing `~/LFG/scripts/share_card/node_modules`). It opens `chem.html`, builds water, and checks the card says Water and that C unlocks. Then a real-iPad check with Caleb.

## Out of scope

- The bridge to the Build world (molecule → block): follow-up issue.
- Auto-hydrogen / H "mittens".
- 3D shapes, cis/trans and mirror-image (chiral) differences.
- Ions, charges and salts (NaCl).
- Elements beyond H C N O S Cl.
- Molecules over 8 heavy atoms in the database.
- Multiple boards.
- Sharing molecules.
