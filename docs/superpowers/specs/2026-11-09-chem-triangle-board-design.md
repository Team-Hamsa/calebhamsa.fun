# 🧪 Chemistry Room: Triangle Board, More Atoms, Online Lookup — Design Spec

Issue #10. Builds on `2026-10-03-chemistry-room-design.md` (read that first; this spec only
describes what changes).

## Why

The user tried to build DMT (N,N-dimethyltryptamine) in the chemistry room and couldn't, for
two reasons:

1. **Odd rings are impossible.** On the square board every bond joins a "light" cell to a
   "dark" cell, so every loop has an even number of atoms. DMT's indole core has a 5-ring.
   Pyrrole, furan, thiophene, cyclopentane, cyclopropane are all impossible today.
2. **Big molecules are never named.** The name list stops at 8 non-H atoms. DMT has 14.

The goal is not DMT in particular; it's **making bigger, famous, real molecules buildable and
recognized**, plus more kinds of atom to build with.

### Decisions made during brainstorming (by the user)

- **The board becomes a triangle board** (each cell touches 6 others). It **replaces** the square
  board; there is no second board type.
- **Built-in list: up to 8 non-H atoms, with more atom kinds**: today's H C N O S Cl, plus
  F Br I B Si P, plus sulfur and phosphorus with extra hands (S 4/6, P 5). Measured: ~245k named
  molecules, ~3.0 MB gzipped. (The user picked this over "today's atoms up to 9": smaller, more
  variety, and the online lookup covers bigger ones.)
- **Bigger or unknown molecules are looked up online at PubChem** from the browser. No hand-picked
  list of famous molecules.
- **No recipe cards** (pictures of target molecules) for now.
- **Offline matters little**: the iPad is mostly on Wi-Fi. It's fine that 9+-atom molecules can't
  be named offline.
- **Extra hands:** tapping a sulfur or phosphorus atom with 🔗 grows two more hands
  (S 2 → 4 → 6 → 2, P 3 → 5 → 3).
- The board/geometry proposal below (hex cells, book carries over, new atoms on the ladder, CPK
  colors) was played back and approved as written.

## Goals

- Rings of any size from 3 up can be built. A 6-ring (benzene) is a natural hexagon.
- DMT, indole, serotonin, caffeine, tryptamine, melatonin etc. can be built and, when online,
  get their real PubChem name.
- Six new atoms, plus extra hands on S and P, so molecules like sulfuric acid (H₂SO₄),
  phosphoric acid, SF₆, chloroform's cousins (CHBr₃, CH₂F₂), silane, boric acid become buildable.
- Everything Caleb already has in his 📖 book survives, including renamed 💡 inventions.

## Non-goals

- Recipe cards / target pictures.
- A hand-picked list of big famous molecules.
- Our own server or database. (PubChem's public REST API is called directly from the page.)
- Keeping the square board as an option.
- Ions, charges, salts, aromatic notation, 3D / stereo (same as the original spec).
- Molecules over 8 non-H atoms in the built-in list.

## Anti-goals (would be a failure even if it "works")

- Losing or garbling anything in Caleb's existing book.
- Two different big molecules sharing one name in the book (see "Telling big molecules apart").
- The room freezing or stuttering on the iPad (big-molecule matching, loading a much bigger list).
- A wrong 💡 "you invented it!" for a real molecule just because the network hiccupped.
- Spamming PubChem (a request on every tap).

## Constraints

- Vanilla HTML/CSS/JS, heavily commented, JSDoc on every function (`tests/docs.test.js`), 🧪
  "Try this!" comments; pure logic importable by `npm test`. Served by GitHub Pages (static only).
- PubChem PUG REST: allows any origin (`access-control-allow-origin: *`, checked 2026-11-09);
  asks clients to stay under 5 requests/second.
- The build tools need the RDKit venv and the PubChem bulk files already in `tools/chem-db/`
  (`CID-SMILES.gz`, `CID-Title.gz`; not committed).
- Must stay usable on Caleb's iPad (Safari) — check memory and parse time of the bigger list.

## Measurements (2026-10-28 PubChem files; `tools/chem-db/measure.py` + `analyze.py`)

Named molecules (PubChem titles that aren't just "CID 123") that fit each board:

| Atoms | ≤ | Square | Triangle |
|---|---|---|---|
| today (C N O S Cl) | 8 | 68,933 (0.84 MB) | 144,870 (1.79 MB) |
| today | 9 | 125,041 (1.70 MB) | 313,959 (4.30 MB) |
| + F Br I B Si P | 8 | 114,615 (1.37 MB) | 225,666 (2.75 MB) |
| **+ extra hands (S 4/6, P 5)** | **8** | 126,606 (1.51 MB) | **244,542 (2.97 MB)** ← chosen |

Sizes are guessed gzipped `molecules.json`. Today's file is 6.7 MB raw / 0.87 MB gzipped, so the
chosen list is roughly **23 MB raw**; see "Loading the bigger list". 1,313 molecules at ≤ 8 hit the
fit-search step budget on the triangle board ("gave up") and are currently left out.

## The board (js/chem/board.js)

### Shape

- **Hex cells in offset rows** ("each cell touches 6"): same idea as a triangle lattice of points.
  About the same size as today (12 × 9); exact width/height left to the builder so it fills the
  iPad screen in both orientations.
- Neighbors of a cell: left, right, and two above, two below (which two depends on the row's
  offset). `neighbors(board, i)` returns up to 6.
- Bonds: today the board stores `right[]` and `down[]` per cell. With 6 neighbors it needs three
  directions per cell (e.g. right, down-left, down-right). Representation is the builder's call.

```
  ⬡ ⬡ ⬡ ⬡ ⬡ ⬡
 ⬡ ⬡ C C ⬡ ⬡        benzene: six carbons around one empty cell.
  ⬡ C · C ⬡ ⬡       No cross-bonds, nothing to pull apart.
 ⬡ ⬡ C C ⬡ ⬡
  ⬡ ⬡ ⬡ ⬡ ⬡ ⬡
```

### Rules that carry over unchanged

- One atom per cell; H takes a cell.
- Auto-bond: after every change, scan side-by-side pairs in a fixed order; any unbonded pair where
  both atoms have a free hand gets a single bond. The scan order must be deterministic (e.g. cells
  row by row, left to right; for each cell its right, then down-left, then down-right neighbor).
- 🔗 bond tool: raise a bond one step; when it can't go higher, pull the atoms apart (`APART`);
  the next tap joins them again. Glow preview (🔗/✂️/🚫), commits on pointerup, `BOND_REACH` nearest
  gap. Needs re-tuning for hex geometry.
- Finished / stuck-hand / finish moment / found again: as today.

### Rings on the new board (worked out from the geometry, not yet tried on a board)

- **3-ring:** three mutually touching cells. Auto-bond closes it by itself.
- **6-ring:** six cells around an empty cell. Closes naturally, no cross-bonds.
- **5-ring:** any 5 cells forming a loop on this grid enclose no empty cell; the loop covers 3
  small triangles, so **one atom always touches the two atoms across the ring** (e.g. cells
  a b c in a row and d e above, ring a-b-c-e-d: b also touches d and e). If b has free hands when
  they arrive, auto-bond joins them, and Caleb pulls **up to two** pairs apart with 🔗 — the same
  move benzene needs today. *My call (found by the builder check): accept up to two pulls; auto-bond
  rules stay unchanged.* The wiki should show it with a picture.
- Crowding is much milder than on the square board (6 places around each atom instead of 4).

## Atoms

| Atom | Color (CPK) | Hands | New? |
|---|---|---|---|
| H | ⚪ white | 1 | |
| O | 🔴 red | 2 | |
| C | ⚫ black | 4 | |
| N | 🔵 blue | 3 | |
| Cl | 🟢 green | 1 | |
| S | 🟡 yellow | 2 (4, 6) | extra hands |
| F | pale green | 1 | ✅ |
| Br | dark red | 1 | ✅ |
| I | purple | 1 | ✅ |
| B | salmon | 3 | ✅ |
| Si | tan | 4 | ✅ |
| P | orange | 3 (5) | ✅ |

F and Cl are both green; the letter on the ball tells them apart. Exact shades are the builder's
call (they live in `ATOM_INFO` in `chem-art.js`).

### Extra hands (S and P)

- An S or P atom starts with its usual hands (S 2, P 3).
- **Tapping the atom itself** with 🔗 (not the gap between two atoms) grows two more hands:
  S 2 → 4 → 6 → back to 2; P 3 → 5 → back to 3. New stubs wave like any free hand, and auto-bond
  runs, so neighbors with free hands grab them.
- Going back down is only allowed if the hands being removed are free. If they're holding
  something, the tap shows 🚫 and nothing changes.
- A molecule is finished when every hand is held, same as now. So SH₂ (S with 2) and H₂SO₄
  (S with 6: two double bonds to O, two single bonds to OH) are both finished molecules.
- The current hand count is part of the board state and the save.
- Tapping any other atom with 🔗 does nothing (or 🚫). How the 🔗 tool tells "tap on atom" from
  "tap on gap" (e.g. inner part of the ball vs. between balls) is the builder's call.

### Unlock ladder

Today: 1 H O → 2 C (water) → 3 N (3 C molecules) → 4 Cl S (2 N molecules). Add *(my call; easy to
change in the `LADDER` table)*:

| Step | Unlocks | How |
|---|---|---|
| 5 | F, Br, I | find 2 different molecules containing Cl or S |
| 6 | B, Si, P | find 2 different molecules containing F, Br or I |

S's extra hands are available as soon as S is unlocked. 🌟 finds count toward goals, inventions
don't (as today). PubChem-named finds count like 🌟. "🔓 unlock all" in the grown-up corner
covers the new atoms. Players already past step 4 just continue to step 5.

## Built-in list (tools/chem-db → data/molecules.json)

- `export.py`: widen the filters to the new atoms and hands (`measure.py`'s `HANDS` / `EXTRA`
  already do this), keep `MAX_HEAVY = 8`, and replace the square `fits_grid` with the triangle fit
  search (`measure.py`'s `fits_tri`). The fit search must respect the real board's width and
  height. Should the 1,313 "gave up" molecules be kept, with a bigger step budget or by counting
  "gave up" as fits? *My call: raise the budget and see how many are left.*
- `make-db.js` and `smiles.js` must parse the new elements (`F Br I B Si P`, two-letter `Br`/`Si`)
  and S/P with extra bonds.
- Keep "every Kekulé form" and "lowest CID's title wins" as today.
- Commit `measure.py` and `analyze.py` with the tools (not `measure.tsv` / `measure.log`; add those
  to `.gitignore`). Post the measurement table on issue #10.

### Loading the bigger list

~23 MB of JSON (~3 MB over the wire) is a big jump from 6.7 MB. Before building around it,
measure fetch + `JSON.parse` time and memory on iPad-sized Chromium emulation, and on the real
iPad. If it's too slow or heavy, change the format (shorter labels, a compact text format parsed
lazily, or splitting the file, e.g. by the molecule's atom kinds). The builder picks; the
requirement is that the room is usable while it loads (as today: kid list and pending ⏳ work
before it arrives) and doesn't stutter after.

The service worker (`sw.js`) must still cache the list for offline use; bump `CACHE_NAME`.

## Online lookup (js/chem/lookup.js + a small fetch helper)

### When

Lookup order on a finished molecule:

1. 📖 hand-written list (`kid-names.js`)
2. 🌟 built-in list
3. ⏳ built-in list not loaded yet → pending (as today)
4. **≤ 8 non-H atoms and not in the list → 💡 invention** (the list already holds every named
   molecule that size; no network needed)
5. **> 8 non-H atoms → ask PubChem** (new)
   - PubChem has a name → 🌟 with PubChem's title (counts toward unlocks like any 🌟).
   - PubChem says it doesn't know it (`CID: 0`, or no title) → 💡 invention.
   - No answer (offline, error, timeout) → ⏳ pending, never 💡. Pending ones are asked again when
     the page loads or comes back online (`online` event).

Only finished molecules are looked up, and each molecule label is asked at most once per session.
Requests go one at a time, at most a few per second.

### How

- Turn the molecule's graph into a SMILES string (needs a small **SMILES writer**; today
  `smiles.js` only reads). Kekulé form with explicit bond orders is fine. PubChem standardizes
  what it's sent, so the string doesn't have to be canonical.
- `GET https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles/<encodeURIComponent(smiles)>/property/Title/JSON`
  - Known: `{"PropertyTable":{"Properties":[{"CID":6089,"Title":"N,N-Dimethyltryptamine"}]}}`
    (DMT, checked 2026-11-09).
  - Unknown: `{"PropertyTable":{"Properties":[{"CID":0}]}}` (HTTP 200, checked 2026-11-09).
- The fetch helper takes a `fetchFn` (like `loadDatabase`) so tests use a pretend one.
- **Answers** *(my call)*:
  - HTTP 200 with a title → 🌟. HTTP 200 with `CID: 0` or no title → 💡.
  - HTTP 400/404 (PubChem couldn't read our SMILES) → 💡, not retried, and logged to the console
    (it means our SMILES writer has a bug; tests should keep it from happening). PubChem reads
    S/P with extra bonds fine: sulfuric acid, SF₆, phosphoric acid all checked 2026-11-09.
  - Network error, timeout, 5xx, 503 "busy" → ⏳, asked again later.
- **One molecule, one entry** *(my call)*: the same big ring with its double bonds placed the other
  way (another Kekulé form) has a different label, so it's a separate request. Store PubChem's CID
  on 🌟 entries from the lookup; a second form with the same CID is "found again!", gets the same
  name and picture slot, and doesn't count twice toward unlocks. (Remember label → CID so each form
  is asked once.)
- PubChem titles can be long IUPAC names ("Bicyclo[2.2.1]heptan-7-amine"). Show and say them as
  they are; Caleb can rename via the 💡/🌟 window if that window allows it. *(Whether 🌟 entries
  are renamable like 💡 ones is left to the builder; today only 💡 are.)* Very long names need to
  fit the card (wrap or shrink).

### Telling big molecules apart

`canon.js` only does the exact every-order search up to `FULL_SEARCH_MAX = 8` heavy atoms; bigger
molecules get a quick label that two different molecules can share. That was harmless when big
ones were all inventions, but now they get real names, so a shared label could show the wrong name
from the book.

Requirement: **two different molecules never share a label at any size the board can hold**, and
labeling stays fast on the iPad (a big molecule on a full board must not freeze the page; the
original spec notes bigger rings froze it before the cap). Labels for ≤ 8 atoms must not change,
or `molecules.json` and the saved book need rebuilding/migrating together. How (a smarter search
that prunes symmetric choices, or something else) is the builder's call.

## Saving and the existing book (js/chem/save.js, book.js)

- Bump the save to `calebhamsa.chem.v2` / `version: 2`, migrating from v1:
  - **Book**: found labels, 🌟 rare, 💡 inventions (with Caleb's names), ⏳ pending, unlock step:
    all kept. Labels don't depend on board shape, so they stay valid.
  - **Pictures**: book entries store a `layout` (where each atom sat, from `groupLayout`) in
    *square-board* coordinates. These must still draw correctly in the book: keep a square-layout
    drawing path for old entries, or convert them. Builder's call.
  - **Old big inventions (> 8 atoms)** carry the old quick `|~` labels, which the exact labels
    replace. Recompute each label from its stored `layout` (it holds every atom and stick).
    Then ask PubChem about them like any new big molecule. If two old inventions had been merged
    under one shared quick label, they stay one entry (nothing to split them with). If PubChem
    knows a molecule Caleb already renamed, **his name stays**: the entry becomes 🌟 (counts
    toward unlocks), PubChem's title is remembered as the entry's real name and shown small under
    his. *(Builder's call, made 2026-11-14; the user didn't answer before the build.)*
  - **Board**: the half-built board on screen is cleared once (it can't be mapped onto hexes).
- Keep the old v1 data in a backup key so it can be recovered if migration fails (like
  `.broken` today).

## Docs

- `wiki/Chemistry-room.md`: new board, the 5-ring pull-apart, new atoms and colors, extra hands,
  new ladder steps, online names (PubChem credit stays).
- Close issue #10 when it's live and the user has tried DMT.

## Testing

Test-first, under `npm test`:

- **board.js:** hex neighbors (even/odd rows, edges); auto-bond scan order; 3-ring closes; benzene
  around an empty cell has no cross-bond; a 5-ring needs exactly one pull-apart; extra hands on S
  (2→4→6→2) and P (3→5→3), blocked when hands are held; H₂SO₄ and SF₆ finish; the same molecule
  built in different places/rotations gives the same label.
- **smiles.js:** parses the new elements and hypervalent S/P; the new writer round-trips
  (write → read → same label) for a set of molecules including DMT, caffeine, H₂SO₄.
- **canon.js:** exact labels above 8 atoms (e.g. two different 14-atom molecules whose old quick
  labels collide get different labels); a speed test on a large symmetric case; ≤ 8 labels
  unchanged.
- **lookup.js:** order 1–5; PubChem known / unknown / network error / timeout with a pretend fetch;
  pending re-asked later; one request per label.
- **book.js / save.js:** v1 → v2 migration keeps every entry and name; old square pictures still
  draw; new ladder steps.
- **Data checks:** every `kid-names.js` entry fits the triangle board and is in the list; random
  rows' labels recompute; spot checks (sulfuric acid, SF₆, CHBr₃ present).
- **Headless** (Playwright Chromium iPad emulation, borrowing `~/LFG/scripts/share_card/node_modules`):
  build benzene and water; build DMT with a stubbed PubChem reply and see its name. Then a real-iPad
  check, including load time of the bigger list.

## Left to the builder

Exact board size; bond storage; how 🔗 tells atom-tap from gap-tap; new atom shades; list format if
23 MB JSON is too heavy; how exact big-molecule labels are computed; square-picture compatibility
approach; long-name display; whether 🌟 entries can be renamed; the step budget for the fit search.

## Open questions for the user

- None left open. The renamed-invention question above was decided by the builder (Caleb's name wins).
