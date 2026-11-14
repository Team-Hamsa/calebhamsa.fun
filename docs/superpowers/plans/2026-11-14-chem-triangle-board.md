# Chemistry Triangle Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the chemistry room's square board with a triangle (hex-cell) board. Add F Br I B Si P plus extra hands on S/P, grow the built-in list to ~245k names, and name molecules with more than 8 atoms by asking PubChem.

**Architecture:** Pure modules in `js/chem/` change shape but keep their roles: `smiles.js` (read + new writer), `canon.js` (exact labels at every size + label → graph), `board.js` (hex geometry, 6 neighbours, extra hands), `lookup.js` (sharded list + PubChem answers), new `pubchem.js` (one-at-a-time asker), `book.js`/`save.js` (ladder, CIDs, v1→v2 migration). `room.js`/`chem-art.js` draw and drive it. The list is rebuilt by `tools/chem-db` and split into 16 part files, so no single `JSON.parse` stalls the iPad.

**Tech Stack:** Vanilla ES modules, `node --test`, Python + RDKit (tools only), Playwright Chromium borrowed from `~/LFG/scripts/share_card/node_modules` for headless checks.

**Spec:** `docs/superpowers/specs/2026-11-09-chem-triangle-board-design.md`

## Global Constraints

- Vanilla HTML/CSS/JS, heavy kid-readable comments, JSDoc on every function (`tests/docs.test.js`), 🧪 "Try this!" comments; pure logic importable by `npm test`.
- Labels for molecules with ≤ 8 non-H atoms must not change (`FULL_SEARCH_MAX = 8` path untouched).
- Two different molecules never share a label at any size; labelling a full board must not freeze the page.
- Atoms/hands: H1 O2 C4 N3 Cl1 S2(4,6) F1 Br1 I1 B3 Si4 P3(5). S cycles 2→4→6→2, P 3→5→3; going down only if the removed hands are free.
- PubChem: `GET https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles/<encodeURIComponent(smiles)>/property/Title/JSON`; one request at a time, ≥ 250 ms apart, each label at most once per session.
- PubChem answers: 200+title → 🌟 (store CID); 200 with `CID: 0`/no title → 💡; 400/404 → 💡 + `console.warn`; network error/timeout/5xx → ⏳ (never 💡).
- Save: `calebhamsa.chem.v2` / `version: 2`; v1 kept under `calebhamsa.chem.v1.backup`; old board cleared once; every book entry and name kept.
- Ladder: step 5 = F Br I (2 different molecules with Cl or S); step 6 = B Si P (2 different molecules with F, Br or I). 🌟 counts, 💡 doesn't; a second Kekulé form with the same CID doesn't count twice.
- Renamed 💡 that PubChem knows → 🌟, Caleb's name kept, PubChem title stored as `realName` and shown small under it. Unrenamed (`Invention #n`) → 🌟 with PubChem's title.
- `sw.js` `CACHE_NAME` bumped; new module precached.

## Review Focus

1. A molecule finished while offline, with more than 8 atoms, must stay ⏳ (never 💡). It is re-asked on page load and on the `online` event. → Task 5 test `network error stays pending and is asked again`.
2. Caleb's existing book on the iPad (v1 save) must load with every entry, name and picture. Old square pictures still draw. → Task 6 tests `v1 save migrates…` and Task 8 headless check with a v1 fixture.
3. Pictures of hex molecules whose top row is an odd row: `groupLayout` must keep the row offset (`shift`), or bonds draw crooked. → Task 3 test `groupLayout keeps the row shift`.
4. A big symmetric molecule (tert-butyl dendrimer, 30-ring) must label in well under a second. → Task 2 speed test.
5. S/P with extra hands must round-trip through the SMILES writer. A plain `S` written with 2 heavy bonds + 2 H would be read back as SH₀ with valence 2 → wrong. → Task 1 test `writer brackets hypervalent atoms with H`.

---

### Task 1: smiles.js — new atoms, extra hands, SMILES writer

**Files:** Modify `js/chem/smiles.js`; Test `tests/chem-smiles.test.js`

**Interfaces — Produces:**
- `HANDS` adds `F:1, Br:1, I:1, B:3, Si:4, P:3` (base hands).
- `HAND_STEPS = { S: [2, 4, 6], P: [3, 5] }` — every hand count S/P may have.
- `parseSmiles(smiles)` reads `Br`, `B`, `P`, `F`, `I`, bracket atoms `[Si]`, `[SiH3]`, `[SH2]`, `[PH]` … Unbracketed atoms take the smallest allowed valence ≥ bonds used. Bracket atoms must have bonds+H equal to an allowed valence.
- `writeSmiles(graph) → string`: Kekulé SMILES with explicit `=`/`#`, ring-closure digits (two-digit `%10`+ allowed), H folded into atoms. An atom is bracketed (`[SiH3]`, `[SH2]`) when it is Si or when implicit-H reading would give a different H count. `[H][H]` for H₂.

- [ ] Test: parses `FC(F)(F)F`, `BrC(Br)Br`, `II`, `OB(O)O`, `[SiH4]`, `C[Si](C)(C)C`, `OS(=O)(=O)O` (S has 6 bonds), `FS(F)(F)(F)(F)F`, `O=P(O)(O)O`, `P`. Counts each element and checks the total H. `CS(C)(=O)=O` → S with 6 bonds, no H; `[SH2](C)C` → S with 4 bonds; `[CH5]` and `[SH3]` throw (5 and 3 are not allowed hand counts).
- [ ] Test `writer round-trips`: for `O`, `[H][H]`, `CCO`, `C1=CC=CC=C1`, `OS(=O)(=O)O`, `FS(F)(F)(F)(F)F`, `C[Si](C)(C)C`, DMT `CN(C)CCC1=CNC2=CC=CC=C12`, caffeine `CN1C=NC2=C1C(=O)N(C(=O)N2C)C`, melatonin `CC(=O)NCCC1=CNC2=C1C=C(C=C2)OC`: `canonLabel(parseSmiles(writeSmiles(parseSmiles(s)))) === canonLabel(parseSmiles(s))`.
- [ ] Test `writer brackets hypervalent atoms with H`: graph S with 4 hands (2 C, 2 H): written text contains `[SH2]` and round-trips.
- [ ] Run `node --test tests/chem-smiles.test.js` → FAIL; implement; → PASS; commit.

### Task 2: canon.js — exact labels above 8 atoms, label → graph

**Files:** Modify `js/chem/canon.js`; Test `tests/chem-canon.test.js`

**Interfaces — Produces:**
- `canonLabel(graph)`: unchanged output for ≤ 8 heavy atoms. Above that, same `atomText|bondText` format (no `~`), computed by individualization–refinement:
  1. Colour refinement as today, but colours are re-ranked by sorted invariant strings (equivariant).
  2. Target cell = first (by colour order) cell with > 1 atom. For each member: individualize (it sorts before its cell-mates), refine, recurse.
  3. At a discrete leaf, position = colour; text = `bondText`. Keep the smallest text.
  4. Automorphism pruning: compare each leaf's text with the first leaf's text. Equal means `γ = firstLeaf⁻¹ ∘ thisLeaf` is an automorphism; store it. At a node whose path is v₁…v_k, skip child w if an automorphism fixing v₁…v_k pointwise maps an already-tried child to w (union-find over the stored generators that fix the path).
  atomText = atoms in final position order (`El` + H count), the same for every leaf.
- `labelGraph(label) → {atoms, bonds}` with every H written out (inverse of `canonLabel` up to isomorphism; `H2` → H–H).
- `heavyCount(label) → number`.

- [ ] Test: ≤ 8 labels unchanged. Hard-code today's labels for `CCO`, benzene, `CC(C)=O`, o-xylene and compare.
- [ ] Test: no `~` in any label; the same 14-atom molecule written two ways (DMT `CN(C)CCC1=CNC2=CC=CC=C12` vs `C1=CC=C2C(=C1)C(=CN2)CCN(C)C`) gives one label. Decalin `C1CCC2CCCCC2C1` and bicyclopentyl `C1CCC(C1)C1CCCC1` (both 2 CH + 8 CH₂, which shared one old quick label) get different labels.
- [ ] Test: `canonLabel(labelGraph(L)) === L` for labels of benzene, DMT, caffeine, H₂, water, SF₆.
- [ ] Test speed: `C(C(C)(C)C)(C(C)(C)C)(C(C)(C)C)C(C)(C)C` (17 heavy, |Aut| = 31104) and a 30-carbon ring `C1CCC…C1` each label in < 500 ms, and every atom ordering of the input (shuffle 5 times) gives the same label.
- [ ] Run → FAIL; implement; → PASS; commit.

### Task 3: board.js — hex board, 6 neighbours, extra hands, geometry

**Files:** Modify `js/chem/board.js`; Test `tests/chem-board.test.js` (rewrite square-specific tests)

**Interfaces — Produces:**
- `BOARD_WIDTH = 12`, `BOARD_HEIGHT = 10`, `ROW_STEP = Math.sqrt(3) / 2`, `APART = -1`.
- `createBoard(width, height, shift = 0)` → `{width, height, shift, atoms, right, downLeft, downRight, extra}`. Row y is pushed half a cell right when `(y + shift) % 2 === 1`. `extra[i]` = extra hands grown on S/P (0, 2, 4).
- `neighbors(board, i)` → up to 6 `{cell, order}`. Order: left, right, up-left, up-right, down-left, down-right.
- `handsOf(board, i)` = `HANDS[el] + extra[i]`; `freeHands` uses it.
- `autoBond`: cells in order; each tries right, then down-left, then down-right.
- `placeAtom`, `removeAtom` (also resets `extra[i]`), `tapBond(board, a, b)` (same rules as today), `isStuck`, `findGroups`, `groupGraph`, `newlyFinished`: same contracts.
- `tapAtom(board, i) → number`: the new hand count, or 0 if nothing changed (not S/P, or the hands it would drop are holding). Runs `autoBond` after growing.
- `groupLayout(board, cells)` → small board with `shift = (top + board.shift) % 2`.
- `cellCentre(board, i) → [x, y]` in cell units (x = col + 0.5 + 0.5·shifted, y = row·ROW_STEP + 0.5); `boardSize(board) → {width: W + 0.5, height: (H − 1)·ROW_STEP + 1}`; `cellAtPoint(board, x, y) → number|null` (nearest centre within 0.5/ROW_STEP·… — nearest centre whose distance < 0.58, else null).

- [ ] Tests: neighbours of a corner, an even-row middle cell and an odd-row middle cell (exact sets). Auto-bond order: three mutually touching C close a 3-ring by themselves. Benzene (6 C around an empty cell, plus 6 H outward) finishes with no cross-bond. A 5-ring (row: a b c, above: d e, ring a-b-c-e-d with H's) needs exactly one or two `tapBond` APART pulls to finish. Label of cyclopentane built on the board = `canonLabel(parseSmiles('C1CCCC1'))`. S: `tapAtom` 2→4→6→2; P 3→5→3; C → 0. Blocked shrink: S with 6 hands holding 6 F → `tapAtom` returns 0, unchanged. H₂SO₄ and SF₆ built on the board finish and label like `OS(=O)(=O)O` / `FS(F)(F)(F)(F)F`. Water built at two places and two rotations: same label. `groupLayout keeps the row shift`: water placed with its top on row 1 → `small.shift === 1`, and the small board's bonds point at the same atoms. `cellAtPoint(cellCentre(i)) === i` for every cell; a point off the board → null.
- [ ] Run → FAIL; implement; → PASS; commit.

### Task 4: chem-art.js — hex drawing, new atoms, legacy square pictures

**Files:** Modify `js/chem/chem-art.js`; Test `tests/chem-room.test.js` (pure parts)

**Interfaces — Produces:**
- `ATOM_INFO` adds F (pale green `#9ccc65`), Br (dark red `#8d2a1a`), I (purple `#7b1fa2`), B (salmon `#ffab91`), Si (tan `#d2b48c`), P (orange `#fb8c00`), each with name, ink and emoji (F 🍏? — use 🟩 F, 🟤 Br, 🟣 I, 🍑 B, 🟫 Si, 🟠 P).
- `drawBoard(ctx, board, cell, marks)`: hex boards drawn at `cellCentre`, sticks to any of the 6 neighbours, hex cell outlines for `grid`. A board with a `down` array (an old square book picture) uses the old square drawing, kept as `drawSquareBoard`. `marks.aim` gains `{atom, will}` for a hand-grow tap (sign ✋ / 🚫).
- `drawAtom`: free hands point at 30°+60°k, so they sit between sticks (up to 6).
- `pictureSize(board, cell) → {width, height}` in px (square: W·c × H·c; hex: `boardSize`·c).

- [ ] Test: `pictureSize` for a square layout 3×2 at 10 px = 30×20; a hex 3×2 at 10 px = 35 × round(10·(ROW_STEP+1)). Every atom in `ALL_ATOMS` has an `ATOM_INFO` entry.
- [ ] Implement; run `npm test`; commit.

### Task 5: lookup.js + pubchem.js + book.js — parts, PubChem, ladder, CIDs

**Files:** Modify `js/chem/lookup.js`, `js/chem/book.js`; Create `js/chem/pubchem.js`; Tests `tests/chem-book.test.js`, new `tests/chem-pubchem.test.js`

**Interfaces — Produces:**
- `lookup.js`: `DATABASE_PARTS = 16`; `partOf(label) → 0..15` (FNV-1a 32-bit of the label, mod 16); `partUrl(k) → 'data/molecules/' + k + '.json'`. `loadDatabase(fetchFn)` → `{parts: Record<string,string>[]}` or null (fetches parts one after another; any failure → null). `nameIn(database, label) → string|undefined`. `lookUp(label, kids, database, asked = {})`: kids → found. Above 8 heavy: `asked[label]?.name` → `{kind:'rare', name, cid}`; `asked[label]` with no name → invention; else `{kind:'pending', ask: true}`. ≤ 8: no database → pending; known → rare; else invention.
- `pubchem.js`: `pubchemUrl(smiles)`; `askPubChem(smiles, fetchFn, timeoutMs = 8000) → Promise<{cid, name}|{cid: 0}|null>` (null = no answer); `makeAsker({fetchFn, onAnswer, gapMs = 300, wait})` → `{ask(label)}`. It writes the SMILES with `writeSmiles(labelGraph(label))`, skips labels already asked this session, runs one at a time with `gapMs` between, calls `onAnswer(label, answer)` (answer null on no-answer; such labels may be asked again only after `retry()`). `{retry()}` clears the "asked this session" mark for labels that got null.
- `book.js`: `ALL_ATOMS` adds `F Br I B Si P`; `LADDER` steps 5, 6 (Global Constraints); `createBook()` adds `asked: {}`; `record()` for rare also stores `cid` and treats a rare entry with the same non-zero `cid` as `again`; `resolvePending(book, look) → {unlocked, settled: [{label, layout, result, recorded}]}`; `promoteInventions(book, look) → {unlocked, promoted}` (inventions whose look is now rare move to `rare`; a renamed one keeps its name and gets `realName`).

- [ ] Tests (pubchem): known DMT reply → `{cid: 6089, name: 'N,N-Dimethyltryptamine'}`; `{CID:0}` → `{cid:0}`; 404 → `{cid:0}`; 503, throw, timeout (fetch never resolves, timeoutMs 10) → null. `makeAsker` with two `ask` calls of one label → one fetch; two labels → fetches strictly one after another. `retry()` lets a null-answered label be asked again.
- [ ] Tests (lookup): order 1–5 using a 2-part pretend database; `partOf` is stable and spreads 1,000 labels over all 16 parts. `loadDatabase` with one failing part → null.
- [ ] Tests (book): new ladder steps unlock F/Br/I after 2 Cl/S molecules and B/Si/P after 2 F/Br/I molecules. Two forms with the same cid → second `again`, `countWith` unchanged. `network error stays pending and is asked again`: `record` pending, then `resolvePending` with an answer → rare. `promoteInventions`: renamed invention → rare with `name` kept and `realName`; `Invention #2` → rare with PubChem title.
- [ ] Run → FAIL; implement; → PASS; commit.

### Task 6: save.js — v2 save and v1 migration

**Files:** Modify `js/chem/save.js`; Test `tests/chem-save.test.js`

**Interfaces — Produces:** `SAVE_KEY = 'calebhamsa.chem.v2'`, `OLD_KEY = 'calebhamsa.chem.v1'`, `BACKUP_KEY = 'calebhamsa.chem.v1.backup'`, `BROKEN_KEY = SAVE_KEY + '.broken'`; `saveState` writes `version: 2`. `loadState(storage, width, height)`: v2 as today, checking `atoms right downLeft downRight extra`. With no v2 but a v1 save, it copies v1 to `BACKUP_KEY`, migrates the book (`migrateBook`), and returns a fresh board. `migrateBook(book)`: adds `asked: {}`. It relabels every `|~` invention/pending from its square `layout` (via `squareLayoutGraph(layout)`, also exported) and merges entries that end up with the same label (first kept).

- [ ] Tests: `v1 save migrates every entry and name`. Fixture v1 save with found/pictures/rare/2 inventions (one renamed)/pending/step 4 → v2 book has all of them, names intact, step 4, board empty, backup key holds the v1 text. A `|~` invention built from a square 10-carbon ring layout gets `canonLabel(parseSmiles('C1CCCCCCCCC1'))`. A broken v2 save → `.broken` (as today). A v2 round trip keeps `extra`.
- [ ] Run → FAIL; implement; → PASS; commit.

### Task 7: The list — export.py, make-db.js parts, data tests, kid molecules

**Files:** Modify `tools/chem-db/export.py` (triangle fit inside 12×10, new atoms/hands, budget 2,000,000, prints "gave up" count), `tools/chem-db/measure.py` (keeps its own copy of the old square check), `tools/chem-db/make-db.js` (writes `data/molecules/0.json`…`15.json` via `partOf`, deletes `data/molecules.json`), `tools/chem-db/README.md`, `js/chem/kid-names.js`, `tests/chem-data.test.js`, `tests/chem-db.test.js`, `.gitignore`.

**Interfaces — Consumes:** `partOf`, `DATABASE_PARTS` (Task 5), `canonLabel`/`parseSmiles` (Tasks 1–2). **Produces:** `splitParts(names) → Record<string,string>[]` in make-db.js.

- [ ] Kid molecules: step 4 adds sulfuric acid `OS(=O)(=O)O`. Step 5: hydrogen fluoride `F`, SF₆, tetrafluoroethylene `FC(F)=C(F)F`, bromoform `BrC(Br)Br`, iodine `II`, iodomethane `CI`, Freon-12 `FC(F)(Cl)Cl`. Step 6: silane `[SiH4]`, boric acid `OB(O)O`, phosphine `P`, phosphoric acid `O=P(O)(O)O`. Each gets a kid fact.
- [ ] Data tests: everything from `data/molecules/*.json`. Isobutane and neopentane are now IN the list (triangle fits them). Sulfuric acid, SF₆ and CHBr₃ are named. Every kid molecule is in the list. Steps 5/6 in `atomsByStep`. Each label sits in its `partOf` part. `chem-db.test.js`: `splitParts` puts each label in `partOf(label)`.
- [ ] Run export (≈ 10–20 min), then `node tools/chem-db/make-db.js tools/chem-db/molecules.tsv` → 0 clashes. Record counts, size and gzip size in the README. Commit the list and the tools.

### Task 8: room.js, chem.html, css, sw.js — the page

**Files:** Modify `js/chem/room.js`, `chem.html` (only if needed), `css/blocks.css` (long names wrap), `sw.js`, `tests/chem-room.test.js`, `tests/sw.test.js` if it lists files.

**Interfaces — Consumes:** everything above. **Produces (pure, tested):**
- `fitCellSize(boxWidth, boxHeight, board)` uses `boardSize`.
- `bondTarget(x, y, cell, board, from)` on hex: a slide onto a touching atom → that pair. Otherwise the nearest gap midpoint (pairs of touching atoms) within `BOND_REACH = 0.9` cells.
- `atomTarget(x, y, cell, board) → number|null`: an S/P atom whose centre is within `ATOM_TAP = 0.25` cells.
- `handsPreview(board, i) → 'grow'|'shrink'|'nothing'`.
- `cellsAlong(board, from, to, cell) → number[]`: cells under a finger's path, sampled every ¼ cell.
- `cardWords` unchanged for kinds; rare with `realName` adds it to the fact.
- Page behaviour: 🔗 on an S/P centre grows hands (on lift, with ✋ preview). A finished molecule above 8 atoms is recorded ⏳ and asked through `makeAsker`. When the answer arrives, `resolvePending` turns it into its card (🌟 name or 💡). With no answer, a ⏳ card shows. On load and on `online`, every ⏳ and every unasked big 💡 is asked (`promoteInventions`). Book tiles: 🌟 with `realName` show it small. Unlock cards for S/P say "Tap it with 🔗 for more hands!".
- `sw.js`: `CACHE_NAME = 'caleb-v11'`; precache `./js/chem/pubchem.js`.

- [ ] Tests: `bondTarget` picks the right/down-left pair near their gap midpoints, and a slide between touching cells. `atomTarget` on an S centre → its cell; on a C centre → null. `handsPreview` for S at 2 → grow, P holding 5 → nothing. `cellsAlong` across a row gives each cell once. `fitCellSize` for a 12×10 board.
- [ ] Headless (Chromium iPad emulation, `NODE_PATH=~/LFG/scripts/share_card/node_modules`, `python3 -m http.server`): load with a v1 fixture save (book survives, old pictures draw); build water and benzene; unlock all; build DMT with PubChem routed to a stubbed reply → card says "N,N-Dimethyltryptamine". Time the list loading. Screenshots checked by eye.
- [ ] `npm test` green; commit.

### Task 9: Docs and ship

**Files:** `wiki/Chemistry-room.md` (new board, 5-ring pull-apart, atoms + colours, extra hands, ladder, online names), memory note.

- [ ] Update the wiki; `npm test`; fresh-eyes review of the whole diff on the most capable model; fix; push `main` (GitHub Pages deploys). Verify the live site loads chem.html and a data part. Comment the measurement table + results on issue #10 (leave it open until the user tries DMT on the iPad).
