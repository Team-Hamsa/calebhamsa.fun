# Block Playground Phase 3: 💧 Fluids Pack — Design Spec

**Date:** 2026-10-02
**Status:** Draft, awaiting review
**Closes:** #4
**Builds on:**
- `docs/superpowers/specs/2026-10-02-block-playground-design.md` (phase 1: engine, packs, systems, saves)
- `docs/superpowers/specs/2026-10-02-electrical-pack-design.md` (phase 2: circuits, signals, events, `drawCell`, `refresh`)

## Purpose

Add a 💧 palette tab to the Build page that teaches how **real amounts of water** behave:
- water falls, spreads, fills containers and levels out
- under depth it **squishes**, so connected containers end at the same level (U-tubes) and a water tower pushes water up a pipe, but only as high as the tower

On top of that sits the **steam power plant**. A burner boils water into steam, the steam rises and spins a turbine that makes ⚡ for the phase 2 circuits, and a chiller turns the steam back into water. A pump uses ⚡ to push water uphill, which is the reverse of the turbine.

### Success criteria

1. Water poured into a glass tank fills it from the bottom, and the level shows how much there is.
2. A U-tube (two columns joined at the bottom) settles with both sides at the same height.
3. A water tower joined by a pipe to a lower spout pushes water out of the spout. A pipe end higher than the tower's water gets none.
4. Burner → steam → turbine in a circuit with a lamp lights the lamp. A chiller turns the steam back into water. A closed loop (boil → spin → cool → back to the burner) keeps running.
5. A powered pump moves water uphill; unpowered, it doesn't.
6. Water and steam amounts are conserved except at the faucet, drain, burner and chiller (tested over hundreds of ticks).
7. Water is saved with the world and comes back after a reload. Phase 1 and phase 2 behavior is unchanged; version 1 saves still load.

### Decisions made during brainstorming

| Question | Decision |
|---|---|
| Realism | Real conserved amounts, with pressure (squishy water) |
| Blocks | Water, pipe, valve, faucet, drain, burner, steam, chiller, turbine, pump |
| Burner | Always fueled; ✋ turns it on and off; doesn't need ⚡ |
| Pump | Pushes one way; ✋ turns it → ↓ ← ↑; powered by the phase 2 circuit |
| Pipes | Connect like wires; a pipe end (only one connection) is open on its far side; the other sides are sealed |
| Solids | Every solid block holds water; water doesn't conduct electricity |
| Model | Squishy-water cellular rules per tick (approach A), not a pipe-network solve |

## Constraints

Same as phases 1–2:
- Vanilla JS, no dependencies.
- Heavy comments; a JSDoc docstring on every function (`tests/docs.test.js`); 🧪 comments on every tweakable value.
- Pure logic importable by `npm test`.
- New `js/` files go in `PRECACHE` (`tests/sw.test.js` checks this), with `CACHE_NAME` bumped once.

## Blocks (js/blocks/water.js)

| Name | Palette | Fluid sides | Notes |
|---|---|---|---|
| `water` (pour) | ✓ | — | Not a block: BUILD pours 1.0 water into the cell if it's open and has room; never changes the cell's name |
| `steam` (pour) | ✓ | — | The same, for steam |
| `pipe` | ✓ | auto (like wire) | Connects to fluid neighbors that face back. If it has exactly one connection, it's also open on the opposite side (a pouring mouth). With none, it's open left and right |
| `valveOpen` | ✓ | its axis (auto-turn) | ✋ → `valveClosed` |
| `valveClosed` | hidden | none | ✋ → `valveOpen` |
| `faucet` | ✓ | down | Adds `FAUCET_RATE` water to the cell below each tick, if it's open and below 1 |
| `drain` | ✓ | all | Water entering it disappears |
| `burnerOn` | ✓ | none (solid) | Boils `BOIL_RATE` of the water in the cell above into steam each tick. ✋ → `burnerOff` |
| `burnerOff` | hidden | none | ✋ → `burnerOn` |
| `chiller` | ✓ | none (solid) | Condenses `CONDENSE_RATE` of the steam in each of its 4 neighbors into water, in place |
| `turbine` | ✓ | its axis (auto-turn) | Fluid passes through. Electric part: resistance 0.05; `pushNow` = the averaged steam flow × `TURBINE_GAIN`, capped at 2 |
| `pumpRight` | ✓ | its direction's axis | Electric part: resistance 1. ✋ → `pumpDown` → `pumpLeft` → `pumpUp` → `pumpRight` |
| `pumpDown`, `pumpLeft`, `pumpUp` | hidden | their axis | Same as above |

"Auto-turn" uses the phase 2 rule, but it looks at **fluid** neighbors (blocks with `fluid`, plus air with water or steam) instead of electric ones.

**Turbines and pumps face two ways at once.** Their **fluid** direction comes from the pipes around them (a turbine) or their name (a pump). Their **electric** direction comes from the wires around them (the phase 2 rule; pipes aren't electric). For example, steam goes up through a turbine while wires leave it left and right.

Every other block is solid: no fluid enters it. Air is open on all sides.

**🧪 Rates:**
- `FAUCET_RATE` 0.05
- `BOIL_RATE` 0.05
- `CONDENSE_RATE` 0.05
- `TURBINE_GAIN` 20, so one burner's steady steam ≈ push 1 ≈ one battery
- `PUMP_RATE` 0.1 × the pump's circuit level

## Engine additions

### World (js/world.js)
- `createWorld` adds `fluid: { water: Float64Array(n), steam: Float64Array(n) }`, all zeros.
- `defaultWorld` gets it through `createWorld`.
- Helpers:
  - `getFluid(world, kind, x, y)`: out of bounds → 0
  - `setFluid(world, kind, x, y, amount)`: out of bounds → no-op
- **Building, digging or changing a cell's block clears both fluids in that cell.** `setBlock` does this whenever the name changes. ✋ state flips (switch, valve, burner, pump) are exempt: they use a new `swapBlock(world, x, y, name)` that keeps the fluid.
- **New `moveBlock(world, x1, y1, x2, y2)`:** moves a block into an air cell, and moves that cell's fluid back into the cell the block left. `fallingBlocks` uses it, so **sand sinks through water and the water rises around it**, and nothing is lost.

### Saves (js/saves.js)
- `SAVE_VERSION = 2`. `serializeWorld` adds `water` and `steam`: number lists rounded to 3 decimals, with exact zeros kept as `0`.
- `deserializeWorld` accepts **version 1** (dry) and **version 2**.
  - A fluid list that is missing, the wrong length, or holds non-finite or negative numbers makes that layer **dry**; the blocks still load.
  - The same bottom-left alignment as the blocks is used for a different-size save.
- A version above 2 is unreadable (the existing rule).

### Block fields (new, optional)
- **`fluid: { sides }`:** `sides` is `'auto-pipe'`, `'axis'` (auto-turned), `'all'`, `'down'`, or a fixed list.
- **`pours: 'water' | 'steam'`:** a palette item that pours instead of placing.
- **`part.pushNow(world, x, y) → number`:** used by the circuit when present (it overrides `part.push`).
- **`drawLayer`** (on a **pack**, not a block): `drawLayer(ctx, world, size)`, drawn after every cell by `drawWorld`.

### Circuit (js/circuit.js)
- **Push:** `pushOut` uses `point.part.pushNow?.(world, x, y) ?? point.part.push ?? 0`.
- **Batteries:** a point "has push" when that value isn't 0. The `+` side rules stay the same; a turbine's + end is top or right, like a battery.
- **Shorts:** short detection treats any part with push as a battery.
- **Circuit key:** `circuitKey` adds every turbine's push, rounded to 0.1.

### build.js
- **BUILD with a `pours` item** calls `pour(world, kind, x, y)` (in water.js): it tops the cell up to 1.0 if the cell is open.
- **DIG** empties the cell's water and steam, and removes the block if there is one (a solid block's cell is dry anyway).
- **Tick:** the water system returns true (blocks changed) only when a block changed. When more than `MOVE_EPSILON` (0.001) of fluid moved in total, it sets `world.fluidChanged = true`. After the tick, `build.js` treats `fluidChanged` like a world change (redraw + save).
- **Save cap:**
  - `scheduleSave` keeps its 1-second wait after the last change.
  - New: if the oldest unsaved change is more than 🧪 `SAVE_MAX_WAIT_MS = 5000` old, it saves now.
  - The pure helper `saveDelay(now, firstUnsavedAt)` returns the wait in ms, and is tested.

### Pack order
`PACKS = [basic, water, electric]`.

## Refinements made while prototyping (they override the details below)

1. **Faster water.**
   - `SQUISH` is **0.1** (not 0.02), with **no halving** of big flows, and **4 small steps per tick** (`FLUID_STEPS`).
   - Measured: the original settings needed about 800 ticks (100 s) to level a U-tube; these need about 38 ticks (5 s), and still settle completely.
   - The pump's front-cell limit is `FULL + SQUISH`.
2. **Exact conservation.** No amounts are ever deleted. `MIN_AMOUNT` only decides "is it wet?" (drawing, and whether anything moved). `MIN_FLOW` is gone.
3. **Steam in water.** Steam may always **rise** into water, and spreads sideways only into cells that are at most half water. (The "only up in wet cells" rule trapped steam under ceilings.)
4. **Valves and turbines face by neighboring fluid *blocks*, not by wet air,** with a favorite when nothing's around (`fluid.prefer`: valve `'h'`, turbine `'v'`). So they never flip as water moves.
5. **Pumps are one-way doors for ordinary flow.** Fluid enters only from their back and leaves only from their front, so pumped water doesn't fall back through.
6. **Drawing:**
   - the water layer is drawn by `registry.drawLayers(ctx, world, size)`, which `build.js` calls after `drawWorld`; `block-art.js` stays pack-agnostic
   - fluid blocks get drawing records in `world.signals.water.cells` (open sides, turbine flow, pump level)
   - the steam edge wobble is dropped
7. **Helpers:** `world.clearFluid(world, x, y)`; `fluids.pour(world, kind, x, y, blockInfo)`.
8. **`circuitKey(world, blockInfo)`** takes `blockInfo`, to read turbines' `pushNow`.

## The fluid rules (js/fluids.js, pure)

`stepFluids(world, blockInfo) → movedAmount`, run by the water pack's system each tick.

**Constants (🧪):**
- `FULL` 1
- `SQUISH` 0.02 (extra a cell may hold per full cell above it)
- `MIN_AMOUNT` 0.001 (anything less becomes 0)
- `MIN_FLOW` 0.005
- `MAX_FLOW` 1 per tick per side

**Open(a, side):** cell `a` lets fluid through that side. Air is open on all sides; fluid blocks use `fluid.sides`; solids, the world edge, and a closed valve are never open. **Fluid moves between `a` and its neighbor `b` only if `a` is open toward `b` and `b` is open back toward `a`.**

**How much a lower cell should hold:** for two stacked cells with `total` fluid between them:
- `total ≤ 1` → 1
- `total < 2 + SQUISH` → `(1 + total × SQUISH) / (1 + SQUISH)`
- otherwise → `(total + SQUISH) / 2`

(This is the standard "compressible water" rule.)

**Water, for every cell with water > 0, using a snapshot of the amounts and writing moves into a "next" copy:**
1. **Down** (if open): `flow = clamp(stable(remaining + below) − below, 0, min(MAX_FLOW, remaining))`. If `flow > MIN_FLOW` it's halved, to settle smoothly.
2. **Left, then right** (if open): `flow = clamp((remaining − neighbor) / 4, 0, remaining)`, with the same smoothing.
3. **Up** (if open): `flow = clamp(remaining − stable(remaining + above), 0, min(MAX_FLOW, remaining))`, with the same smoothing.

**Steam:** the same three steps with up and down swapped.
- A cell holding both water and steam: its steam may only move **up** that tick (bubbles rise through water).
- Steam may not move into a cell whose water is above 0.5.

**Specials, after the moves:**
- faucet adds
- drain removes
- burner boils
- chiller condenses
- pump moves water from the cell behind it into the cell in front of it, through itself, ignoring pressure. It moves at most `PUMP_RATE × level` and never fills the front cell beyond `FULL + SQUISH × 10`.

**Turbine flow:** the steam that left each turbine cell this tick is recorded in `world.signals.water.turbineFlow[i]`, a moving average over the last 8 ticks. `pushNow` reads it.

**Cleanup:** amounts below `MIN_AMOUNT` become 0. Fluid never sits in a solid cell. Returns the total amount moved (for `fluidChanged`).

**Conservation:** with no specials, the total water + steam after a step equals the total before (to 1e-9). This is tested.

## Drawing

Through the water pack's `drawLayer`, after the blocks:

- **Water in an open cell:** a blue `#2f7fe0` rectangle (alpha 0.8) from the bottom of the cell up to `min(amount, 1)`. If the cell above has water, it's drawn full height, so columns read as solid. A lighter `#7fb8ff` 1-pixel top line marks the surface when it's not full.
- **Steam:** white, alpha 0.6, drawn from the top down to `min(amount, 1)`. A 1-pixel edge wobble moves with `ticks`.
- **Inside pipes, valves, pumps and turbines:** the same, but only inside the channel (the middle 4 of 8 little pixels along the open sides).

Each block's `drawSignals` draws its own look:
- **Pipe:** walls with mouths at open ends.
- **Valve:** a wheel; the channel turns red and blocked when closed.
- **Faucet:** a tap. **Drain:** a grate.
- **Burner:** a flame on alternate ticks when on, a gray ring when off.
- **Chiller:** frost. **Turbine:** blades whose angle steps by push. **Pump:** an arrow that glows when its level > 0.25.

## Error handling and edge cases

| Case | Behavior |
|---|---|
| Pouring with no room (solid, closed, or full) | Nothing happens |
| Building/digging a cell with fluid in it | That cell's fluid disappears |
| ✋ on a valve/burner/pump | Its fluid stays (`swapBlock`) |
| Pump facing a solid block | Moves nothing |
| Turbine not in a circuit | Fans spin with steam; no ⚡ |
| Sealed box with a burner, no chiller | Steam builds up and squishes; nothing breaks |
| Faucet running forever | Water fills the world and squishes; saves happen at least every 5 s |
| Version 1 save | Loads dry; saved later as version 2 |
| Broken fluid list in a save | That layer is dry; blocks load |
| Negative/NaN amounts | Impossible by clamping; a save with them makes that layer dry |

## Testing

- **`tests/fluids.test.js`:**
  - a drop falls and lands on the floor
  - a pool levels out (left/right within 0.02)
  - **U-tube:** both columns within 0.05 of each other after settling
  - **water tower → pipe:** water rises to near the tower's level and not above
  - conservation over 300 ticks (no specials)
  - a closed valve blocks; a pipe's sealed sides don't leak; an open pipe end pours
  - steam rises and spreads under a ceiling; steam bubbles up through water
  - burner, chiller, faucet and drain rates
  - a pump moves water uphill only with a level
  - the turbine flow average for a steady stream
  - amounts never go negative
- **`tests/water.test.js`:**
  - ✋ cycles valve/burner/pump and keeps fluid
  - sand falling into water swaps places with it (the totals stay the same)
  - a turbine with steam going up and wires left/right faces both ways correctly
  - pouring rules; digging empties; building into water removes it
  - `pushNow` + circuit: a burner + turbine + lamp circuit lights the lamp after the flow builds up
  - the pump's strength follows its circuit level
  - hidden variants are known but not in the palette
- **`tests/saves.test.js`:** version 2 round-trip with fluids; version 1 loads dry; broken fluid layers are dry; rounding.
- **`tests/world.test.js`:** fluid layers exist; `setBlock` clears fluid on a name change; `swapBlock` keeps it.
- **`tests/circuit.test.js`:** `pushNow` overrides `push`; a part with dynamic push counts as a battery for shorts.
- **`tests/build.test.js`:** `saveDelay` (1 s normally; 0 once 5 s have passed since the first unsaved change).
- **Browser check (Chromium iPad emulation):**
  - pour 3 waters into a glass U and read the water rows on both sides
  - build burner → water → pipe → turbine → lamp circuit and check the lamp lights within 10 s
  - reload and check the water is still there (read the save)
  - no console errors

## Addendum 2026-10-04: push rounding (issue #11)

`partPush` and `circuitKey` now round a changing push (a turbine's or a generator's) toward zero to **0.01 V** (`PUSH_STEP` in circuit.js), not 0.1. A turbine pushing under 0.01 V still pushes exactly nothing, so a stopped turbine still stops the circuit. See the gears spec addendum of the same date for why.

## Addendum 2026-10-04: shorts and turbines (issue #13)

"Short detection treats any part with push as a battery" is refined: see "Short-circuit sparks (issue #13)" in the electrical spec. An idle turbine now counts as plain wire, so a battery wired straight across one sparks.

## Addendum 2026-10-04: no favorite side (issue #18)

Step 2 of the water rule ("Left, then right") worked out the right-hand flow from what was left after the left-hand flow had gone, so a stream landing on the middle of a ridge split 4 : 3 in favor of the left. Both side flows are now worked out from the **same** amount (what the cell holds after the falling step): `flow = clamp((level − neighbor) / 4, 0, remaining)` for each side. Together they are at most half the cell, so nothing else changes. A symmetric splitter now gives exactly half to each side; steam uses the same loop and is fixed too.

## Addendum 2026-10-04: water energy — wheels need a fall, lifting costs the pump (issue #17)

A pump → water wheels → generator → same pump loop ran forever with 3 or more wheels, because a wheel got full power from any water passing through it (even along a level pipe) and a pump paid nothing for height. The fix is one energy ledger, used by both ends. It overrides "The pump's front-cell limit is `FULL + SQUISH`" (refinement 1) and the pump line under "Specials".

**Height energy.** Each cell's water holds `storedEnergy(a)`: `a²/2` up to full, then `½ + (a−1) + (a−1)²/(2·SQUISH)` (squished water is a spring). Its derivative is the cell's **head** `headOf(a)`: `a` up to full, then `1 + (a−1)/SQUISH`, i.e. one more cell of head for each full cell standing on it. With the cell's own height added, this is exactly the quantity `stableBelow` levels out, so still water has the same total head everywhere, every ordinary move goes downhill in head, and the world's total (stored + amount × height) never rises by itself (tested).

**`fallEnergy(from, to, amount, drop)`** is the energy one move gives up, taken on its own: `stored(from) − stored(from − amount) + stored(to) − stored(to + amount) + amount × drop`. `flowFluid` passes it to `onMove` as a 4th argument (0 for steam).

**Wheels.** `stepFluids` also returns `waterWork: Map<index, energy>`: the positive `fallEnergy` of every move that leaves a wheel, or lands on a wheel from a cell that isn't one. Each move's energy goes to exactly one wheel. See the gears spec addendum for how the wheel uses it.

**Pumps** (`pumpAmount(level, behind, ahead, rise)`): a straight-line pump curve, like a real one:

`amount = PUMP_RATE × level × min(1, 1 − lift / (PUMP_HEAD × level))`

- `lift = rise + headOf(ahead + amount) − headOf(behind − amount)`: the head difference across the pump **after** the move (found by halving), so the work done is never under-counted. `rise` is +2 for an up-pump (from the cell below it to the cell above it), 0 sideways, −2 down.
- `PUMP_RATE` = 0.05, `PUMP_HEAD` = 6 cells per unit of level. More current moves more water **and** lifts higher; one battery stalls with the water about 5 cells above the pump, two at about 10.
- Work on the water is `DROP_POWER × amount × lift ≤ DROP_POWER × PUMP_RATE × PUMP_HEAD × level² / 4 = 0.75 × level²`; the electricity used is `current² × 1 Ω = 0.907 × level²`. So a pump is at best 83% efficient (tested for many levels and heads).
- `DROP_POWER` = 10 turning-work units per (full cell of water × cell of fall). It is the single exchange rate between water energy and work, shared by pump and wheel.

**Not changed:** turbines still count steam flow only (stacked turbines over one burner each get full push). A burner is an endless source, so that is not a closed loop, but it is not head-accurate either.

## Addendum 2026-10-04: building into water (issue #19)

The edge-case row "Building/digging a cell with fluid in it: that cell's fluid disappears" now only holds for **digging**. BUILD calls `placeBlock(world, x, y, name, blockInfo)` in fluids.js (not `setBlock`; world.js has no `blockInfo`):

- a block with a `fluid` setting (pipe, valves, water wheel, pumps, turbine, drain, rope) keeps the cell's water and steam;
- any other block pushes them into a neighbor: **up** first, else the **sides** (split evenly when both are open, so left and right stay equal), else **down**. A neighbor only counts if it is open on the touching side (`openSides`), and pumps never count (one-way doors);
- with no such neighbor (shut in on every side), the fluid is lost. This and DIG, faucets and drains are the only ways water is made or lost.

The pushed water may overfill the neighbor for a moment (it is squished); the ordinary flow rules spread it out. `setBlock` still empties the cell: it is the plain helper for loading saves and tests.

## Addendum 2026-10-04 (later): turbines in one tube share the steam (issue #17 review)

Each turbine's push was `steam flow × TURBINE_GAIN`, so three turbines stacked in one chimney over one burner each pushed a full 1.000 V from the same steam.

- `turbineRuns` (in `fluids.js`) walks from each turbine both ways through "tube" cells (exactly two open, connected ways: pipes, turbines, a one-wide gap) and counts the turbines in that tube. `turbinePush` divides by the count: 1 → 1.000, 2 → 0.500 each, 3 → 0.333 each, also with a pipe or a one-cell gap between them. Turbines in separate chimneys keep their own steam's full push.
- It is a sharing rule, not an energy ledger: steam still loses nothing by turning a turbine (issue #21, open).

## Addendum 2026-10-04 (later): the wheel ledger — exact merges, mirror-symmetric, and the fall travels with the water (issues #17 and #18 review)

- **Per-move energy.** `flowFluid` used `fallEnergy(here, before[to], …)` for every inflow, so two streams merging into one cell in a step missed their cross term and the wheels were credited ×1.02 of the real drop (`~~O~~`). It also depended on which side was handled first, so mirrored worlds credited different energy (2.064 vs 2.116). Moves are now collected and priced at the end of the step: each move gets `amount × drop`, plus its share (by amount) of `S(b) − S(b − left)` for the cell it left and of `S(b) − S(b + entered)` for the cell it entered. Per cell that never exceeds the true change (S is convex), and it is the same for left and right. `onMove` now gets `(from, to, amount, energy, drop, part)`.
- **Per-wheel counts.** `stepFluids` returns `wheels: Map<index, {lean, sideOut, down, gross, work}>` (sideways lean in and out, + right; sideways outflow; downward outflow; unsigned outflow; energy). `waterOut` is `wheelTurn` of those and `waterWork` is `work`, kept for tests and tools.
- **Head.** Energy a move gives up away from any wheel is no longer simply lost. `world.signals.falling` (per cell, not saved) holds the energy that falling water is carrying. A downward move takes its share along (plus what the move itself gave up); landing on a wheel hands it all to that wheel; water that moves sideways or up, or sits in a cell nothing fell out of this step, loses it (the splash). Leaving a wheel, water starts again with nothing. So one faucet 9 cells above a wheel credits 9 cells, a 1-wide column 8 deep draining through a wheel credits 4.86 per unit (was 1.96), and a wheel in a stream fed by a waterfall that hit the ground first gets nothing extra. Every bit still comes from `fallEnergy` and is given to one wheel at most; a seeded test of 60 random worlds checks the running total never exceeds the energy the water has really given up.
- Not modelled: pressure head through a full, still pipe into a side wheel is only what `fallEnergy` gives at the wheel (0.9–1.9 strength for depths 1–6, was 0.17 flat).

## Addendum 2026-10-04 (later): special blocks run in rounds, so left and right are the same (issue #18 review)

`runSpecials` did every block's job in one pass in cell order. A chiller to the right of a drain condensed water into the drain cell AFTER the drain had emptied it, so it sat there a tick and leaked sideways (0.046 beside the drain; chiller on the left: 0). Now three rounds: (1) faucets, burners, chillers; (2) pumps, each working out its push from a snapshot taken at the start of the round (capped by what is still behind it); (3) drains. Mirrored random worlds with chiller + burner + faucet + drain: 0 of 400 differ (was 21).

## Addendum 2026-10-04 (final review): steam gives its push once — a ledger replaces the tube rule (issue #17 review)

`turbineRuns` shared the push by the SHAPE of the tube, and a tube ended at any cell with more or fewer than two open ways. So two turbines with a 3-wide room between them, or a pipe with a dead-end stub, each got the full push again (1.000 + 1.000; three with rooms between: 3.000).

- `turbineRuns` and `signals.water.turbineRun` are gone. `stepFluids` keeps `world.signals.used` (a `Float64Array`, like `falling`): how much of each cell's steam has already been through a turbine. Used steam moves with the steam (each move takes its share, `part`); steam leaving a turbine cell becomes all used; a cell never holds more used steam than steam.
- `steamOut` (so `turbineFlow`, `turbinePush` and the drawn spin) counts only the FRESH steam leaving a turbine.
- Result: one turbine 1.000; three stacked 0 / 0 / 1.000 (top first: the lowest, which the steam meets first, gets it); with a wide room, a stubbed pipe, or two rooms between: the same, sum 1.000. Side-by-side chimneys still get their own steam's full push.
- Changed from the tube rule: the push is no longer split evenly. The turbines further along get nothing and are drawn still.
- Steam becomes fresh again only by being condensed and boiled again. `used` is not saved: after a reload all steam counts as fresh once (a one-off, at most one pass of the steam then in the pipes).
- Still not an energy ledger for heat (issue #21, open): a burner is an endless source.

## Addendum 2026-10-04: water is drawn by depth; DIG and pour take one cell (issue #20, option 1)

With `SQUISH = 0.1` a deep cell holds up to ~1.65, so 10 cells of water settled into ~7.5 cells and LOOKED 7.5 tall, and one DIG at the bottom of a 12-deep column removed 1.77 cells. The decision on #20 was two steps: fix what a child sees and touches now (this addendum), and make water truly incompressible in the solver later (#30). **The solver is unchanged**: `stableBelow`, `flowFluid`, the energy ledger, pumps and wheels all still work on the real, squished amounts.

**DIG** (`scoop` in fluids.js, used by `applyTool`): takes `min(amount, FULL)` of water and of steam from the cell; the rest stays. DIG uses `swapBlock`, not `setBlock`, so digging a pipe out of deep water also leaves the rest. If the cell holds no water but water is DRAWN there (see below), the scoop takes the drawn amount from the real water underneath, top cell first. **Pour** still tops a cell up to `FULL` (never more than one cell per tap), but refuses a cell at the top of deep water that already looks full.

**Drawing** (`waterPicture(world, blockInfo)` in fluids.js, pure, tested in tests/water-picture.test.js; the water pack stores its `shown` array in `world.signals.water.shown` every tick and every refresh, and `drawWaterLayer` draws from it). It overrides "Water in an open cell" under "Drawing":

1. Every wet cell is drawn with `min(amount, 1)`; a cell with water standing on it is drawn full (as before).
2. A **column** is a vertical run of wet cells joined top to bottom; its top cell has the surface. Its **room** is the dry cells straight above, as far as the first lid, and only where the whole sideways stretch of open cells in that row is wet or is room too (so nothing is ever drawn standing above a rim, beside open air, or over a pipe mouth it would run into).
3. Each over-full cell's extra (`amount − 1`) is shared between the columns of its own body of water (cells joined through open sides; pumps separate bodies): its own column gets a full share, and any other column a share of `1 − |H − s|` (never below 0), where `H = floor + headOf(amount)` is the surface height that squishes the cell and `s` is that column's real surface height. Shares are divided by their sum, or by 1 if the sum is smaller, so a surface that only just qualifies gets only a little and nothing jumps. What does not fit under a column's lid is offered to the columns level with it.

Results (all tested): N cells in a 1-wide shaft are drawn N tall for N = 1..13 (within 0.01 settled, 0.1 at every tick while settling; before: 10 → 7.53); a tank with a deep end and a U-tube with unequal arms are drawn level and their drawn total equals their amount; a pipe arm is drawn (as shade) level with its tower; the picture is mirror-symmetric, the same every tick once settled, and each U-tube arm moves one way only while settling.

**What the picture cannot do (left for #30):**

- **Under a lid** (a sealed tank, or a shaft drawn to its brim) the extra has nowhere to be drawn, so it isn't: the tank looks full while the solver can still squeeze in up to ~45% more. A faucet into a brim-full-looking tank therefore keeps running for a while before it overflows.
- **Machines feel the real water, not the drawn water.** The top of a deep column is drawn in cells that hold none (2.5 cells for a 10-deep column). Pipes, wheels, pumps and sand in those cells do not react to it: a pipe mouth between the real surface and the drawn one stays dry. DIG is the one tool made to agree with the picture. We chose to draw into those cells anyway (rather than only filling the real top cell fuller) because the amount a child sees is then right in every open tank, and showing the top cell fuller can hide at most one cell of the missing 2.5.
- While water is rushing through a U-tube, the extra shut under the lid has no level surface yet and up to ~0.5 cell is left out of the picture for a few seconds; it never draws water that isn't there (beyond the old "cell under a stream is drawn full" look).
- Steam is drawn as before (it squishes too, upside down).


## Addendum 2026-10-04 (round 1 review): water is drawn on steps and ledges too (issue #20 review)

Rule 2 of the drawing ("room only where the whole sideways stretch is wet or is room") treated every other dry cell as a hole, also one standing on a solid floor: the top of a step in a tank, a ledge, the closed top of a horizontal pipe. So when the drawn level reached a step whose top the real (squished) water had not reached, the whole row lost its room and the picture stopped rising. A 10-wide open tank with a 7-high step drew 63 cells for every pour from 63 to 81 (18 cells, 22%, not drawn); 51 of 300 random settled stone-and-pipe tanks were under-drawn by more than half a cell (129 cells in all).

- A dry open cell with a closed floor (`joined(index, 'down') < 0`) is a **shelf**. It no longer breaks containment, provided its stretch holds a surface cell or a room cell, and is **calm**: no wet cell in the stretch has water on top of it (so no film is drawn on the floor beside a falling tower). A dry cell that is open downward onto a dry, roomless cell is still a hole.
- A shelf starts a column of its own with no real water (`shelf: true`, surface = its floor, `from` = the top cell of the nearest real column in its stretch). Dry cells above it get room from it in the usual way. Shelves take no part in the sharing of step 3.
- New step 4b: every contained stretch with a shelf column in it is a **pool**. Pools are handled bottom row first: the drawn water above `max(row floor, real surface)` of each column in the stretch is added up and poured back level (`levelFor`: lowest room first, each column between its base and its lid). Only drawn extra moves; no column is drawn below its real water; the drawn total is unchanged.
- `source` of water drawn on a shelf is `from`, so DIG there takes the scoop from the real water beside it.
- Result: the stepped tanks are drawn exactly (drawn = real at every pour, level across the step); the 300 random tanks: 1 under-drawn by more than half a cell (a pocket under a lid, as documented), 1.1 cells missing in all, none over-drawn.
- Side effect: a brim-full shaft whose rim is level ground between walls now shows its squished-in extra as a thin film on that ground, instead of not at all. A rim with open air beside it is unchanged (nothing drawn above it).


## Addendum 2026-10-04 (round 2 review): a brim is a lid for all the water joined to it (issue #20 review)

A settled water tower joined by a pipe to an open spout one cell up (`#~~#......` ×7, `#~~#..P...`, `#~~PPPP...`, 18 cells) was drawn with a 0.2-cell blob of water standing in the open air over the pipe's mouth, with nothing beside it and a 1.4-cell drop next to it, and the tower was drawn 0.2 higher than the pool it is joined to (tower 2.2, pool 2.0). Two causes:

- **Room in a basin nobody can fill.** The cell over the mouth counted as contained because the dry ground beside it lies in a walled basin whose puddle "has room" all the way up. Room now also needs reach: a column has room in a cell only if `real surface + all the extra of its body` gets at least to that cell's floor (`reachOf`; a shelf goes by the column it is drawn from). A cell refused for that reason is a hole for its stretch, like any other dry cell with nothing under it.
- **No brim.** New step 3b: a column whose highest cell (its top, or its last room cell) has open, dry air above that is not room is a **brim**, at the height of its lid. Still water can't stand higher than its lowest brim anywhere, so for every column of the same body: if its real surface is at or below the brim, its lid is cut down to the brim; if it is above (water on its way out), its room is scaled by `(surface − brim) ÷ NEAR`, capped at 1, so a tower emptying through a spout is still drawn as tall as it is and nothing jumps as it comes down to the brim.
- Result: that scene is drawn level at 2.0 in the tower, the pool and the mouth, with nothing over the mouth and nothing over the ground (mirrored too); 17.40 of its 18.00 cells are drawn. The missing 0.6 is squished in below the brim: the same leftover as under a lid ("looks full, holds a bit more"), now also at a brim.
- Cost, measured on the 300 random settled stone-and-pipe tanks of the round 1 addendum: 10 are under-drawn by more than half a cell (13.7 cells in all; was 1 and 1.1), none over-drawn. Every one looked at is a pool that is full to a rim it would spill over, with more squished in below; before, that extra was drawn as a slab standing over the rim and over the empty space beside it.

