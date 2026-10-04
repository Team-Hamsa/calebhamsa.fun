# Block Playground Phase 4b: 🏗️ Lifting Pack — Design Spec

**Date:** 2026-10-03
**Status:** Approved in chat (2026-10-03)
**Part of:** #5 (phase 4b; 4a ⚙️ spin is live). The in-game guide (#7) comes right after and will cover these blocks too.
**Builds on:** the 4a gears spec (`2026-10-02-gears-pack-design.md`): `solveSpin`, a group's `drive`, cranks, motors and water wheels.

## Purpose

Teach **load and effort** with a winch, rope and pulleys:

- A crank turning a winch lifts a crate (weight 1), but **not** an iron weight (weight 4). The machine **stalls**: nothing turns, and the winch shows a red ⬇.
- **Gearing down** (small gear → big gear) makes the winch turn slower but stronger. One step down (½ speed) lifts weight 2; two steps down (¼ speed) lift the iron weight. **You trade speed for strength.**
- A **pulley hook** (a moving pulley) does the same: the load counts half as heavy but rises half as fast.
- A **pulley** (fixed) changes the rope's direction, so the winch can sit on the ground and lift something up a tower, like a well.
- Gearing **up** makes lifting harder: a crank geared up ×2 can't even lift a crate.

### Success criteria

1. Crank → winch with rope down to a crate: ↻ lifts the crate one cell at a time, and ↺ lowers it.
2. The same with an iron weight stalls: the crank and winch don't turn, the winch shows red ⬇, and the weight stays put.
3. Crank → small → big → axle → small → big → winch (two steps down) lifts the iron weight.
4. A pulley hook between the rope and the iron weight, with one step down, lifts it, half as fast per rope.
5. Winch on the ground, rope up and over a pulley, hanging down: the load lifts.
6. Digging the rope lets the crate fall. Crates and iron weights fall like sand when nothing holds them.
7. Phases 1–4a are unchanged; the README shows and explains every 🏗️ block.

### Decisions made during brainstorming

| Question | Decision |
|---|---|
| Too heavy | **Stall** (stops dead), not "lifts slowly": clearer for a 5-year-old |
| Effort rule | Reuse the gear group's `drive`: lifting needs `weight × winch speed ≤ drive` |
| Which way lifts | Winch ↻ (+) winds in (lifts); ↺ lets out (lowers) |
| Lowering | Needs no strength. A winch nobody turns holds its load |
| Rope | Real rope cells in the grid, placed by Caleb; the winch adds and removes them |
| Tab | Its own 🏗️ Lifting tab (⚙️ would have 13 blocks). The winch still joins gear trains |
| Rejected | A ropeless "lift block" (hides the idea); swinging/stretchy rope physics (too much) |

## Realistic strength (2026-10-04, replaces the "drive" effort rule)

**Why:** on the iPad, a machine with 12 faucets driving two water wheels on one axle couldn't lift a hooked iron weight. The old rule, `weight × winch speed ≤ drive` with drive = the source's speed, cancelled the source out, so every source was exactly as strong as a crank. Sources didn't add up, and overloads stopped dead. The user asked for real-world behaviour instead.

**Model:** the standard linear torque–speed curve.
- Each source reports `spinSource → { speed, strength }`: its top speed (no load) and its stall torque.
  - Crank: 1 turn/s, strength 2 (`CRANK_STRENGTH`).
  - Motor: level × 1 turn/s, level × 2 (`MOTOR_STRENGTH`).
  - Water wheel: flow × 20 turns/s, |flow| × 40 (`WHEEL_STRENGTH`). One faucet is about a crank.
- Measured at the group's first block (ratio r): top = speed / r, strength′ = strength × |r|. The source pushes `strength′ × (1 − Ω/top)`. Summed over sources: `ahead − slowing × Ω`.
- Loads: `spinLoad → torque` at the block (the winch returns −weight; gravity pulls ↺), referred × r.
- Drag: `spinDrag → c` (torque per turn/s), referred × r².
  - Generator: c = GENERATOR_TORQUE × (current per volt from last tick, remembered in `signals.spin.conducts`) × GENERATOR_GAIN.
  - Generator push = speed × GENERATOR_GAIN. Electric power out = 0.8 × mechanical power in.
- Ω = (ahead + pull) / (slowing + drag).
- If the sources push one way but Ω comes out zero or the other way, the winch's ratchet holds: **stalled**, Ω = 0.
- With no source, Ω = 0 (the ratchet holds the load).
- Opposite sources now **fight** (the stronger wins, slowly) instead of jamming. Geometric jams (an L of big gears) still jam.
- Removed: the `drive` record field, and the "motor powered by its own generator isn't a source" rule. The motor/generator loop now winds down from the 0.8 efficiency alone.

**Effects:**
- Heavier loads lift slower. Lowering with a load runs faster than the crank's top speed (the load helps).
- Gearing a generator up slows the crank.
- More lamps make a generator harder to turn.
- A hand crank lights a lamp at about half a battery's brightness.

## Changes after the final review (2026-10-03)

These override the details below:
1. **Rope goes straight.** `traceRope` leaves the winch on any side, then only turns at a pulley. Two ropes side by side no longer get crossed.
2. **The load is one block.** It's the block under a hanging end, or a pulley hook plus the one block under it. What it rests on isn't lifted, so a crate lowered onto sand can be lifted off again.
3. **Only hanging loads are held.** `isHeld` = "is a hanging load of some winch's rope" (`hangingLoads`). A cut rope, rope with no winch, or a sideways rope holds nothing, and there is no `holds` field. `traceRope` returns `hanging` (the end was reached going down).
4. **Rope is drawn along its path.** `ropeArms` joins cells along each winch's path. Loose rope only joins the rope above and below it.

## Constraints

Same as phases 1–4a: vanilla JS, heavy comments, JSDoc on every function, 🧪 on tweakables, pure logic in `npm test`, new `js/` files in `sw.js` `PRECACHE` with `CACHE_NAME` bumped, and a README picture + entry for every palette block (`tests/readme.test.js`, `tools/make-block-pictures.cjs`).

## Blocks (js/blocks/lifting.js, tab `{ id: 'lift', icon: '🏗️', label: 'Lifting' }`)

| Name | Fields | Notes |
|---|---|---|
| `winch` | `spin: { kind: 'hub' }`, `spinLoad: winchLoad`, `winch: true` | A drum. Joins gear trains like any hub (shaft, ratio +1) |
| `rope` | `bare: true`, `holds: true`, `rope: true`, `fluid: { sides: 'all' }` | Water flows through it (a well rope can hang in water) |
| `pulley` | `holds: true`, `rope: true` | A fixed wheel; the rope path passes through it |
| `pulleyHook` | `falls: true`, `weight: 0`, `hook: true` | Hangs on the rope's end, the load hangs under it |
| `crate` | `falls: true`, `weight: 1`, `label: '1'` | |
| `ironWeight` | `falls: true`, `weight: 4`, `label: '4'` | |

Any other `falls` block (sand) also counts as load, with weight `info.weight ?? 1`.

**🧪 Values (lifting.js):**
- `ROPE_PER_TURN` 2: cells of rope wound per winch turn.
- `STRENGTH` 1: drive needed per weight per turn-per-second.

At the 8-ticks-a-second clock, rope wound per tick = `speed × ROPE_PER_TURN / 8`. Crank direct (speed 1): one cell every 4 ticks (½ s). Two steps down (¼): one cell every 16 ticks (2 s).

## Pure logic: js/lift.js

**`traceRope(world, x, y, blockInfo) → { path: [{x, y}], end, attached }`**, starting at a winch:
- Look for a `rope` cell next to the winch (order: down, right, left, up).
- Walk on through neighboring cells whose block has `rope: true` (rope or pulley), never revisiting, in the same side order.
- `path` is the cells walked (not the winch). `end` is the last **rope** cell in it (pulleys don't count as an end), or null.

**`loadBelow(world, end, blockInfo) → { cells: [{x, y}] top-first, weight, hook }`:** the column of `falls` blocks directly under `end`, until the first cell that isn't `falls`. `hook` is true if the top one has `hook: true`. `weight` = sum of `weight ?? 1`, halved if `hook`.

**`canWindIn(world, rope, blockInfo) → boolean`:** there's an `end`, and the cell directly **above** `end` is the previous path cell **and is a rope** (not the winch or a pulley). So the last rope cell under a pulley or winch always stays, and the rope can always be let out again.

**`windIn(world, x, y, blockInfo) → boolean`:** if `canWindIn`: turn `end` to air (`swapBlock`, keeping water), then move each load cell up one (`moveBlock`, top-first). True if it moved.

**`letOut(world, x, y, blockInfo) → boolean`:** with an `end`:
- with a load: if the cell under the bottom load cell is air, move the load down one (bottom-first), then `swapBlock` the load's old top cell to `rope`.
- with no load: if the cell under `end` is air, `swapBlock` it to `rope`.
- otherwise false (resting on the ground).

**`winchLoad(world, x, y, speed, blockInfo) → number`:** the drive needed to turn this winch at `speed`: 0 when `speed ≤ 0` (letting out is free) or `!canWindIn`; otherwise `weight × speed / STRENGTH`. (Defined in lifting.js, where `STRENGTH` lives; it calls lift.js.)

**`isHeld(world, x, y, blockInfo) → boolean`:** walk up from the cell above while blocks are `falls`; held if the walk stops at a `holds` block.

**`ropeArms(world, blockInfo) → Map<index, {up, right, down, left}>`** for drawing every rope/pulley/hook cell: an arm toward each neighbor that is `rope`, `winch` or `hook` (for rope/pulley); plus `down` on a rope whose cell below is a `falls` block (something hangs there); a hook's `up` arm if a rope is above.

## Engine changes

**spin.js — stalls.** Blocks may have `spinLoad(world, x, y, speed, blockInfo) → number`. After a group's speed is known (not jammed), sum every member's `spinLoad` at its own speed. If the sum > `drive + 1e-9`, the group is **stalled**: every speed 0, `stalled: true` on every record. Records gain `stalled` (false otherwise).

**basic.js — held blocks don't fall.** `fallingBlocks` skips a `falls` block when `isHeld` (imported from lift.js).

**lifting.js — the system** `liftSystem(world, blockInfo)`, running after gears (`PACKS = [basic, water, gears, lift, electric]`):
- For each winch with a spin record that is turning and not stalled: `pull = before + speed × ROPE_PER_TURN / TICKS_PER_SECOND`. A step needs `2` rope with a hook on top of the load, else `1`. While `pull ≥ step`: `windIn` (stop and set pull to 0 if it can't). While `pull ≤ −step`: `letOut` likewise.
- Pull amounts live in `world.signals.lift.pull` (not saved: half a cell of rope is forgotten on reload).
- Then `world.signals.lift.cells = ropeArms(...)`, and `world.animating = true` while any winch moves.
- Returns true if any block moved. `refresh` recomputes `cells` when blocks changed (cached on `cells.join(',')`, like `refreshSpin`).

**Stall order:** gears solve first (with `spinLoad`), so the lift system only sees speeds that aren't stalled.

## Drawing

- **Winch:** a brown drum (4×4 little pixels) with rope coils, a stripe that steps round with the turn like the axle, and a red ⬇ (arrow of 1×1 squares) when `stalled`. Gets the spin record. Stalled groups show no ❌ (that's for jams); the crank simply doesn't turn.
- **Rope:** `bare`; a 1-pixel-wide brown line from the middle toward each arm.
- **Pulley:** a gray wheel with a dark groove, plus rope arms (the rope draws over it).
- **Pulley hook:** a small gray wheel with a hook below; two rope strands up when hanging (that's why it's half as heavy).
- **Crate, iron weight:** plain blocks with their weight as the label.
- `signalsAt` gives the winch its spin record (spin is stored before lift), and rope/pulley/hook their lift record.

## Edge cases

| Case | Behavior |
|---|---|
| Winch with no rope next to it | Turns freely, lifts nothing |
| Rope wound up to the winch/pulley | Stops winding (one rope cell stays); gears keep turning; no load counted |
| Load on the ground, letting out | Stops; gears keep turning |
| Two winches in one group | Their loads add up |
| A rope end over a gap with nothing under | ↺ lets rope down until it touches something; a crate there is then hooked |
| Crate next to a rope, not under it | Not held, falls |
| Geared up ×2, crate | `1 × 2 > 1`: stalls |
| Stalled group with a generator | Push 0 (speed 0) |
| Old saves | Nothing new saved; unknown names → air as before |

## Testing

- **`tests/lift.test.js`** (pure, real blocks via registry): `traceRope` through rope and a pulley; `loadBelow` weights (crate 1, iron 4, sand 1, hook halves); `canWindIn` false when the end hangs from the winch or a pulley; `windIn` moves a 2-block column up and removes the end; `letOut` with and without a load; on the ground false; `isHeld` for a column under rope, and false next to rope.
- **`tests/spin.test.js`:** a stand-in `spinLoad` bigger than drive stalls the group (speed 0, `stalled`); smaller doesn't; a jammed group stays `jammed`.
- **`tests/lifting.test.js`** (real blocks, `allSystems`): success criteria 1–6 as world pictures run for N ticks; the palette order; geared-up crank can't lift a crate; rope dug → crate falls.
- **`tests/basic.test.js`:** a crate under a rope doesn't fall; sand on a crate under a rope doesn't fall.
- **`tests/registry.test.js`:** pack order `['basic', 'water', 'gears', 'lift', 'electric']`.
- **README:** a 🏗️ LIFTING table with pictures, extra `winch-stalled` picture, and machines: crane, gear it down for iron, a well over a pulley.
- **Browser check (Chromium iPad emulation):** crank → winch lifts a crate; iron stalls with red ⬇; no console errors.
