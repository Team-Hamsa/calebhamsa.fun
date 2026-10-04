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
