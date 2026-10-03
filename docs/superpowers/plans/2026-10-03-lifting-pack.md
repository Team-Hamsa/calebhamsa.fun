# Lifting Pack (Phase 4b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A 🏗️ Lifting tab (winch, rope, pulley, pulley hook, crate, iron weight) that teaches load and effort: too heavy stalls the machine, gearing down or a pulley hook trades speed for strength.

**Architecture:** `spin.js` learns "stalls" through a new optional `spinLoad` block field. A new pure `js/lift.js` traces rope, finds the hanging load and moves it. A new pack `js/blocks/lifting.js` defines the blocks, runs a `liftSystem` after gears, and draws them. `basic.js` stops held blocks from falling.

**Tech Stack:** vanilla ES modules, `node --test`, Canvas 2D.

**Spec:** `docs/superpowers/specs/2026-10-03-lifting-pack-design.md`

## Global Constraints

- Vanilla JS, no dependencies; heavy comments; a JSDoc docstring on every function (tests/docs.test.js enforces it); 🧪 "Try this!" on tweakables.
- Pure logic importable by `npm test`.
- New `js/` files go in `sw.js` `PRECACHE`; bump `CACHE_NAME` once (`caleb-v6` → `caleb-v7`).
- Every palette block has `docs/blocks/<name>.png` and a README entry (tests/readme.test.js).
- `PACKS = [basic, water, gears, lift, electric]`.
- `ROPE_PER_TURN = 2`, `STRENGTH = 1`; winch ↻ (+) winds in.

## Review Focus

1. **A load moved into water / a rope hanging in water** — water must not be deleted (use `swapBlock`/`moveBlock`, never `setBlock`, when moving). Test: lift a crate whose rope cell holds water; total water unchanged.
2. **Winding in until the rope is gone** — one rope cell must always stay under the winch/pulley so ↺ still works. Test: wind a crate all the way up, then let it out again.
3. **Geared UP (crank → big → small → winch)** — even a crate stalls. Test in lifting.test.js.
4. **Digging the rope while a crate hangs** — the crate falls on the next tick. Test.
5. **A stalled group also holds a generator** — generator push 0, no crash. Covered by speed 0 path; test that a stalled group's records all have speed 0.

---

### Task 1: spin.js stalls

**Files:** Modify `js/spin.js` (solveSpin, records); Test `tests/spin.test.js`.

**Interfaces:** Produces optional block field `spinLoad(world, x, y, speed, blockInfo) → number`; records gain `stalled: boolean`.

- [ ] **Step 1: failing tests** — add stand-ins `heavy: { spin: { kind: 'hub' }, spinLoad: (w, x, y, speed) => (speed > 0 ? 2 * speed : 0) }` (letter `K`) and `light` (`spinLoad` = `0.5 * speed`, letter `k`):
  Tests: `['RK']` (crank ↻ at 1 shafts to the heavy hub at +1: needs 2 > drive 1) → `at(0,0).speed === 0`, `at(1,0).stalled === true`, `jammed === false`. `['Rk']` → speed 1, `stalled false`. `['QK']` (turning ↺: load 0) → speed −1. `['FK']` (fast crank 3 drives at 3, needs 6 > 3) → stalls. A jammed L of big gears with a heavy hub → `jammed true`.
- [ ] **Step 2:** `node --test tests/spin.test.js` → FAIL (`stalled` undefined / speed not 0).
- [ ] **Step 3: implement** in solveSpin, after the sources loop:

```js
    // Is it too heavy? Every block that needs effort (a winch lifting)
    // says how much drive it takes at its own speed. More than the
    // source has: the group STALLS (stops dead).
    let stalled = false;
    if (!jammed && speed !== 0) {
      let needed = 0;
      for (const [index, r] of ratio) {
        const point = points.get(index);
        needed += point.info.spinLoad?.(world, point.x, point.y, speed * r, blockInfo) ?? 0;
      }
      stalled = needed > drive + 1e-9;
    }
```
  and use `const stopped = jammed || stalled;` for `turns`/`drive`, adding `stalled` to each record. Update the doc comment's record list.
- [ ] **Step 4:** run spin + gears tests → PASS.
- [ ] **Step 5:** commit `Lifting: a load that's too heavy stalls the gears`.

### Task 2: js/lift.js (rope, load, winding) and held blocks

**Files:** Create `js/lift.js`; Modify `js/blocks/basic.js` (fallingBlocks); Test `tests/lift.test.js`, `tests/basic.test.js`.

**Interfaces (produced, all take `blockInfo` last):**
- `traceRope(world, x, y, blockInfo) → { path: {x,y}[], end: {x,y}|null }`
- `loadBelow(world, end, blockInfo) → { cells: {x,y}[] (top first), weight: number, hook: boolean }`
- `canWindIn(world, rope, blockInfo) → boolean` (`rope` = a traceRope result; the path cell before `end` must be directly above `end` and be a rope, not a pulley: `info.rope && !info.pulley`)
- `windIn(world, x, y, blockInfo) → boolean`, `letOut(world, x, y, blockInfo) → boolean` (x, y = the winch)
- `isHeld(world, x, y, blockInfo) → boolean`
- `ropeArms(world, blockInfo) → Map<index, {up,right,down,left: boolean}>`

Task 2's tests use stand-in blocks with the spec's fields (the real pack comes in Task 3):
`winch {spin:{kind:'hub'}, winch:true}`, `rope {rope:true, holds:true, fluid:{sides:'all'}}`, `pulley {rope:true, holds:true, pulley:true}`, `pulleyHook {falls:true, weight:0, hook:true}`, `crate {falls:true, weight:1}`, `ironWeight {falls:true, weight:4}`, `sand {falls:true}`, `stone {}`.

- [ ] **Step 1: failing tests** (pictures: `w` winch, `|` rope, `P` pulley, `h` hook, `c` crate, `I` iron, `s` sand, `#` stone):
  - trace `['w', '|', '|', 'c', '#']` → path length 2, end (0,2); `loadBelow` → 1 cell weight 1.
  - trace through a pulley `['.P|', '.|.', ... ]`: `['|P.', '|..', 'w..']`? use `['P||w'...]` — concretely `['P|w', '|..', 'c..', '#..']`: from winch (2,0) left to rope (1,0), pulley (0,0), down rope (0,1) → end (0,1), load crate.
  - `loadBelow` of `h,I` → weight 2, hook true; of `c,s` → weight 2; `I` → 4.
  - `canWindIn` false for `['w','|','c']` (end hangs from the winch), true for `['w','|','|','c']`.
  - `windIn` on `['w','|','|','c','s','#']` → rows become `w | c s . #`: crate at (0,2), sand at (0,3), (0,4) air; returns true. Water in the end rope cell (0,2) set to 0.5 before: total water afterwards still 0.5.
  - `letOut` on `['w','|','c','.','#']` → `w | | c #`; on `['w','|','c','#']` → false; with no load `['w','|','.','#']` → `w | | #`.
  - wind up then let out again: `['w','|','|','|','c','#']` windIn ×5 → only 2 succeed (rope stays 1 cell), then letOut → true.
  - `isHeld`: crate under rope true; sand on crate under rope true; crate beside rope false; crate under stone false.
  - basic.test.js: `['|','c','.','.','#']` run fallingBlocks 3× → crate still at row 1; `['c','.','#']` (no rope) → lands.
  - `ropeArms`: rope at (0,1) in `['w','|','c']` → `{up:true, down:true}`.
- [ ] **Step 2:** run → FAIL (module missing).
- [ ] **Step 3: implement** lift.js per spec (side order down, right, left, up; `moveBlock` top-first going up, bottom-first going down; `swapBlock` for rope add/remove). basic.js: `if (info?.falls && below === AIR && !isHeld(world, x, y, blockInfo))`.
- [ ] **Step 4:** run lift + basic + full suite → PASS.
- [ ] **Step 5:** commit `Lifting: rope, hanging loads, winding in and letting out`.

### Task 3: the 🏗️ pack: blocks, system, drawing

**Files:** Create `js/blocks/lifting.js`; Modify `js/blocks/registry.js` (import, PACKS); Test `tests/lifting.test.js`, `tests/registry.test.js`.

**Interfaces:** Consumes Task 1 `spinLoad`/`stalled`, Task 2 functions. Produces `default { tab: {id:'lift', icon:'🏗️', label:'Lifting'}, blocks, systems: [liftSystem], refresh: refreshLift }`, exports `ROPE_PER_TURN`, `STRENGTH`, `winchLoad`, `liftSystem`.

- [ ] **Step 1: failing tests** (`tests/lifting.test.js`, real registry, letters as gears.test plus `w | P h c I`, crate y found by scanning the column):
  - palette order `['winch','rope','pulley','pulleyHook','crate','ironWeight']`; registry order test → `['basic','water','gears','lift','electric']`.
  - `['Rw', '.|', '.|', '.|', '.c', '##']` 12 ticks → crate moved up ≥ 2 rows. Same with `Q` (↺) and crate starting at row 2 with air below → crate lower.
  - iron: `['Rw', '.|', '.|', '.I', '.#']` 16 ticks → iron still row 3, `world.signals.spin.cells.get(1).stalled === true`, crank speed 0.
  - two steps down lifts iron: `['RsG-sGw', '......|', '......|', '......|', '......I', '......#']` 40 ticks → iron row < 4. (crank 1 → s 1 → G −½ → axle −½ → s −½ → G ¼ → winch ¼.)
  - hook + one step down: `['RsGw', '...|', '...|', '...|', '...h', '...I', '...#']` 40 ticks → iron moved up.
  - geared UP: `['RGsw', '...|', '...|', '...c', '...#']` → stalled, crate stays.
  - pulley well: `['P|w', '|.R', '|.#', 'c..', '...', '###']` (rope from the winch runs left over the pulley and hangs down; the crank under the winch shares its shaft). 16 ticks → crate up.
  - dig the rope: crate hanging at rest, `setBlock(world, x, ropeY, 'air')`, 2 ticks → crate fell.
  - drawing: `drawWorld` on a stub canvas context with every block incl. a stalled winch doesn't throw.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: implement** lifting.js: constants; `winchLoad(world, x, y, speed, blockInfo)` = `speed <= 0 || !canWindIn ? 0 : load.weight * speed / STRENGTH`; `liftSystem` per spec (pull map, step = hook ? 2 : 1, windIn/letOut loops, `cells = ropeArms`, animating); `refreshLift` cached on blocks string; drawing `drawWinch` (drum, stripe via ticks × speed, red ⬇ when stalled), `drawRope`, `drawPulley`, `drawHook`; blocks table. registry: import and put `lift` after `gears`.
- [ ] **Step 4:** full `npm test` → PASS (docs.test checks JSDoc; fix any gaps).
- [ ] **Step 5:** commit `Lifting: the 🏗️ tab — winch, rope, pulleys, crates and the iron weight`.

### Task 4: offline, README pictures, browser check

**Files:** Modify `sw.js` (PRECACHE + `./js/lift.js`, `./js/blocks/lifting.js`; `CACHE_NAME` `caleb-v7`), `tools/make-block-pictures.cjs` (letters `w | P h c I`, extra picture `winch-stalled` with `{ speed: 0, stalled: true }`, machine scenes `crane`, `iron-geared`, `well`), `README.md` (### 🏗️ LIFTING table after ⚙️ GEARS; machines); generated `docs/blocks/*.png`, `docs/machines/*.png`.

- [ ] **Step 1:** run `npm test` → readme tests FAIL for the 6 new blocks; sw test checks every js file is precached → FAIL.
- [ ] **Step 2:** edit sw.js; run `NODE_PATH=~/LFG/scripts/share_card/node_modules node tools/make-block-pictures.cjs`; write README section (picture, name, what it does, ✋ —) and the three machine recipes.
- [ ] **Step 3:** `npm test` → all PASS.
- [ ] **Step 4:** browser check with Playwright Chromium (iPad emulation) against a local server: place crank+winch+rope+crate via saved world in localStorage, ✋ the crank, confirm crate cell changes; iron shows stall; no console errors. Screenshot to scratchpad and look at it.
- [ ] **Step 5:** commit `Lifting: README, pictures and offline`; push to main (live via GitHub Pages); comment on #5 and close it.
