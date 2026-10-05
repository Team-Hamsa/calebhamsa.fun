# Water that can't be squashed: pressure worked out from depth — Design Spec

**Date:** 2026-10-05
**Status:** Ready to build. Every open question in #30 is decided here, and the law was run on a throwaway prototype first (numbers below).
**Issue:** #30 (split out of #20)
**Builds on:** the fluids spec (`2026-10-02-fluids-pack-design.md`, with its #17 and #20 addenda), the turbine spec (`2026-10-05-turbine-spin-source-design.md` and its three addenda: the steam ledger, `floatsOn`, loads paying for the fluid they move).
**Replaces:** `SQUISH` for water (extra water stored in deep cells), the "UP" flow rule, `headOf` for water, `pumpAmount`'s search, the pump round in `runSpecials`, and almost all of `waterPicture` (steps 2 to 5: bodies, room, shelves, brims).
**Not in this pass:** steam cooling under the open sky (#29), the motor–generator law (`2026-10-05-motor-generator-law-design.md`: not touched), drawing pressure as a colour. All three are kept easy: see "What this leaves for later".

## Purpose

Today the game makes pressure by letting a cell hold 0.1 more water for every full cell standing on it. That pushes water up a U-tube, but it means deep water really is squashed: 10 cells of water stand 7.5 tall, a 10-cell shaft swallows 14.5 cells, a full-height tank holds 60% more than its size, and sand stops sinking part way down a deep tank because the water there is "heavier". #20 hid most of this in the picture. This pass removes it from the world.

After this pass:

- **No cell ever holds more than one cell of water.** Ten buckets are ten cells, in the world and in the picture.
- **Deep water presses harder.** Every cell of pressed water has a pressure number (how tall the water standing over it is). Pressure, not stored extra water, is what pushes water up a pipe and squirts it out of a hole.
- **The books still balance.** Water only ever loses height energy by itself. A wheel gets at most what its water gave up. A pump pays for every bit it lifts.

### Success criteria

1. In any world, after any tick, every cell's water is ≤ `FULL` (to rounding: `FULL + 1e-9`), and water is never made or lost by moving (to 1e-9 over a long run).
2. Ten cells poured into a shaft stand 10.000 tall; a 10-cell shaft takes exactly 10; a 4 × 13 tank holds 52.
3. Still water in joined containers ends level, exactly. A U-tube is level (within 0.05) in under 20 ticks, a 22-cell pipe in under 40, and no arm ever turns back on its way (no sloshing).
4. The pressure at the foot of N cells of still water reads N, the same in every arm.
5. Every perpetual-motion test and sweep in the repo passes; the new ledger tests (below) pass.
6. A taller tower drives an enclosed wheel at its spout faster and harder; a wheel in the middle of a full pipe turns feebly.
7. Sand and an iron weight sink to the bottom of a 12-deep tank. A crate floats on top.
8. `SQUISH`, the brim rule, `source`, and the words "squished" / "squish" are gone from the water code, guide, wiki and README. Steam keeps its own squeeze (`STEAM_SQUEEZE`).
9. A saved world from before loads with every cell ≤ `FULL` and with all the water that was drawn.
10. `npm test` passes in full.

### Decisions

| Question | Decision | Why |
|---|---|---|
| How is pressure worked out? | Each small step, the **full** cells that touch are solved together like a circuit: flow between two full cells = `PIPE_EASE` × their difference in head. Surfaces are where the head is known | It is the water analogy the ⚡ pack already teaches, run the other way: pressure is voltage, flow is current, a long pipe is resistance, a pump is a battery. It gives one answer whatever the shape (loops too), it is the same in a mirror, and "flow × head lost" on every link is exactly the energy given up |
| Does a cell store pressure? | No. Pressure is worked out afresh every small step and kept only for looking at (`world.signals.press`) | Nothing to save, nothing to go stale, no water hidden in it |
| What moves un-pressed water? | Today's rules 1 and 2 (fall, spread sideways by a quarter of the difference). Only rule 3 (UP by squish) is replaced. One change to rule 1: a stack of water over a gap falls together | Streams, puddles, faucets, wheels under a fall: all as they are now. A column must stay full while it drains, or nothing in it is pressed |
| How fast? | `PIPE_EASE = 1`, `SURFACE_EASE = 1/4`, `SQUIRT_EASE = 1/32`, still 4 small steps a tick | Measured: U-tube level in 7 to 9 ticks (it was about 38), a 22-cell pipe in 14 to 21. A tower empties a little faster than today (half gone in 47 ticks, was 68). A quarter at a surface is also the most that can never overshoot |
| Sloshing? | Impossible: water here has no momentum. Every flow goes from more head to less, and each surface moves at most to its neighbours' level, never past | Proven below, and measured: no arm ever turned back |
| Steam | **Stays squeezable, exactly as it is.** Its number is renamed `STEAM_SQUEEZE` (0.1) | Steam is a gas, and gases really can be squeezed: that is the honest difference between the two fluids, and worth teaching. Its ledger, the turbine numbers and every steam test stay as they are. Treating steam like water would be less real (a sealed boiler would just stop instead of building pressure) |
| Pumps | The same law (`PUMP_RATE`, `PUMP_HEAD`), with the lift read from the pressure. The pump works inside the pressure step, a quarter of a tick's worth each small step | A pump in a pipe that is full all the way round has to push the whole ring at once; only the joint solve can do that |
| Saved worlds | No new save version. Over-full cells are given room when a world loads: the extra goes to the nearest room, upward first. Only water shut in with no room anywhere is dropped | The water a child SAW is kept exactly; what is dropped was never drawn (see "Saved worlds") |
| The picture | A cell is drawn with what it holds. Steps 2 to 5 of `waterPicture` and `source` are deleted | With no over-full cells there is nothing to put back on top |
| Buoyancy | No code change. Water is never more than 1 a cell, so iron and sand (4) always beat `WATER_WEIGHT` × water (2.5 at most) | The "stops about 6 cells down" leftover came only from squashed water |
| World's top edge | Open sky. A full cell in the top row is its own surface: it can sink, nothing rises past it | Otherwise a tower built to the top of the world is "sealed" and will not drain |
| Does a pump suck? | No. If the water behind a pump is not pressed toward it, the pump empties the cell behind it and no more | As today. A real pump can't pull water up more than a little either; and it stops a sealed pot from "stretching" |
| A pump that is switched off | Holds pressure back, both ways. Water still trickles through it forwards by falling and spreading | A stopped pump is a shut door to pressure. (Today squish leaks through it forwards; nothing in the tests or the wiki leans on that) |

## The physical law

### Words used

- `floor(i)` — how many cells cell `i` is above the bottom of the world: `world.height − 1 − row`.
- `level(i)` — for a cell that is not pressed: `floor(i) + water[i]`, the height of its water's top.
- `H(i)` — the **head** of a pressed cell: how high its water would stand in an open tube. Still water has the same head everywhere it is joined.
- `press[i] = H(i) − floor(i)` — the cell's **pressure**, in cells of water standing over its floor. A full cell with 3 full cells on it reads 4 (the convention `headOf` had). A cell that is not pressed reads its own amount.
- Energy of a cell's water: `storedEnergy(water) + water × floor`, with `storedEnergy(a) = a² ÷ 2` (water never reaches the squeezed branch any more). This is the ledger from #17, unchanged.

### Constants (fluids.js)

```js
export const FULL = 1;
export const FLUID_STEPS = 4;          // unchanged
export const FULL_SLACK = 1e-9;        // a cell this close to full counts as full (sums of fractions are never exact)
export const PIPE_EASE = 1;            // flow between two full cells, for each cell of head difference, each small step
export const SURFACE_EASE = 1 / 4;     // flow in or out of a surface, for each cell of head difference
export const SQUIRT_EASE = 1 / 32;     // the EXTRA flow out of a hole, for each cell of pressure behind it
export const STEAM_SQUEEZE = 0.1;      // was SQUISH; steam only
const PRESS_ROUNDS = 8;                // tries at one solve (see "Limits")
const PRESS_PASSES = 64;               // tries at which cells count as pressed (see "The lid rule")
```

`SQUISH` is deleted, not aliased. `PUMP_RATE`, `PUMP_HEAD`, `DROP_POWER`, `RISE_POWER`, `FAUCET_RATE`, `BOIL_RATE`, `CONDENSE_RATE`, `MIN_AMOUNT`, `MAX_FLOW` keep their values.

Each has a 🧪 "Try this!" note in the code, as the old ones did: `PIPE_EASE = 0.1` makes long pipes sluggish; `SQUIRT_EASE = 1/4` makes a tower empty in a blink; `SURFACE_EASE` above 1/4 lets a level overshoot.

### One small step of water: FALL, PRESS, SPREAD

`flowWater(world, canFlow, onMove, pumps, sides)` replaces `flowFluid(world, 'water', …)`. Each of its three parts starts from what the part before left.

**1. FALL.** Rows from the bottom up; in each cell with water and an open way down:

```
flow = min(water[i], FULL − water[below], MAX_FLOW)      // skip if flow ≤ FULL_SLACK and it isn't the cell's last speck
```

using the amounts **as they are now** (the cell below has already dropped its own). So a stack of water over a gap slides down together, and a full column over a leak stays full all the way up with only its top cell going down. (Today each cell looks at the start of the step, so a bubble of "not quite full" runs up every draining column. Then no cell in it is full and nothing would be pressed.) A lone drop falls one cell per small step, as today.

**2. PRESS.** See the next section. It moves water between full cells, in and out of surfaces, out of holes, and through pumps.

**3. SPREAD.** Today's rule 2, on what is left. For each cell, `rest = min(water at the start of the step − what it dropped in FALL, water now)`: water that arrived in this step does not spread yet, so a falling stream stays a stream. To each side with an open way:

```
flow = clamp((rest − water[beside] now) ÷ 4, 0, what is left of rest)     // skip if ≤ FULL_SLACK ÷ 4
```

**but not through a side that PRESS just pushed water out of** (PRESS has already done that side's spreading, and more). Both sides are worked out from the same `rest`, as today, so left and right are treated alike.

None of the three can put a cell over `FULL`: FALL and PRESS never give a cell more than its room, and SPREAD gives each neighbour at most a quarter of what it is short of, from each of two sides.

### PRESS: the water circuit

**Points.** Every cell with `water ≥ FULL − FULL_SLACK` that is not a pump is a *point*: it has an unknown head `H`. (Plus cells that fill up in this step under a lid, minus cells a pump has opened: both below.) Points whose touching sides are open to each other are joined by a **link**:

```
flow a → b = PIPE_EASE × (H(a) − H(b))
```

**Ends.** For a point `i` and each side where the neighbour `j` is open to it, is not a point and is not a pump, there is an *end*: a place where the head is known. `level(j) = floor(j) + water[j]` as it is at the start of PRESS.

| End | Flow out of the point | When | Most |
|---|---|---|---|
| **Surface** (`j` is above `i`) | `SURFACE_EASE × (H(i) − level(j))`, either way | always | up: `j`'s room. Down: `MAX_FLOW`, and `water[j] + water[i]` (taken from `j` first, the rest out of `i` itself, which is then no longer full) |
| **Sky** (`i` is in the top row and open upward) | the same with `level = floor(i) + 1`, **downward only** | always | `MAX_FLOW`, `water[i]`; it comes out of `i` itself |
| **Hole in the side** | `(floor(i) + 1 − level(j)) ÷ 4 + SQUIRT_EASE × (H(i) − floor(i) − 1)` | only while `H(i) ≥ floor(i) + 1` (the cell really is pressed) | `j`'s room, `MAX_FLOW` |
| **Hole underneath** | `SQUIRT_EASE × (H(i) − floor(i))` | only while `H(i) ≥ floor(i)` | `j`'s room, `MAX_FLOW` |

The first part of the side hole is exactly what SPREAD would move out of a full, un-pressed cell; pressure adds the second part. So nothing jumps when a cell becomes pressed, and a hole 5 cells down squirts about as hard as it does today. A hole never sucks: water only comes back into a pressed body through a surface. A full cell whose side hole is "off" (it is hanging, not pressed) simply spreads by rule 3.

**Pumps.** A powered pump (`level ≥ PUMP_ON_LEVEL`, open at its back and front as today, and neither of those cells a pump) is a link from the cell behind it, `b`, to the cell in front, `f`, skipping its own cell as today:

```
flow b → f = g × (PUMP_HEAD × level − lift)        never less than 0
lift       = head(f) − head(b)                      head = H for a point, level for any other cell
g          = G ÷ (1 + G × c),  G = PUMP_RATE ÷ (PUMP_HEAD × FLUID_STEPS),  c = how many of b and f are NOT points (0, 1 or 2)
```

Over a tick that is `pumpAmount(level, lift) = PUMP_RATE × level × (1 − lift ÷ (PUMP_HEAD × level))`: today's law. (`÷ (1 + G × c)` is "measured after the water has moved", which `pumpAmount` used to search for: an open cell's level changes by the amount moved.) Two things differ from today, both on purpose:

- There is no "at most `PUMP_RATE × level`" stop when the lift is negative. Water pressing downhill through a running pump helps it along: `|lift| ÷ 120` more a tick (a third more with 2 cells of head behind one battery; 0.12 more under a head of 14, the most the world has room for). That keeps the pump a plain straight line, which is what lets it sit inside the solve, and it can only take energy out of the water.
- **A pump does not suck.** If, with the pump running, the point behind it comes out with `H(b) < floor(b) + 1`, or the pump can move nothing because nothing can follow the water it takes, then `b` is *opened*: for this small step it is not a point, the pump takes water out of that cell alone (at most what it holds), and the solve is done again.

An unpowered pump is no link at all: it holds pressure back, both ways. Water still trickles through its cell by FALL and SPREAD in the direction of its arrow, as today.

**The equation.** For every point: all its flows out add up to `water[i] − FULL`. For a full cell that is 0 (what goes in comes out). The tiny leftover otherwise is what keeps rounding from piling up: a cell at 1.0000000003 pushes the 0.0000000003 out.

That is one set of straight-line equations for each group of joined points: `solveBanded` (below). After solving, each end and pump is checked against the table ("Limits"), and then the water is moved.

**The lid rule: cells that fill up pass the push on.** A hole or surface that wants to give its cell `j` more than `j` has room for gives it exactly its room. If `j` has a **lid** (no open way up, or the cell above it is a point) and is not the cell behind or in front of a pump, `j` then counts as a point for this small step: its own equation says "takes in exactly my room", and the rest of the push goes on through it. Solve again; repeat while new cells fill (at most `PRESS_PASSES` times, then carry on with what there is). A cell counted this way must come out really pressed (`H ≥ floor + 1`); if it does not, it goes back to being an end and is not tried again this step.

Why a lid: without the rule, a pipe whose cells are all 0.99 full would only pass pressure one cell further each small step, because SPREAD keeps taking a little out of each. With no lid over it (open air above), water that gets more than its room simply fills its cell and rises next step; it is not pressed. That is what makes a spout work like a nozzle: the pressure is used up at the hole, where a wheel can catch it, not smeared over a blob of air outside.

**Limits.**

1. After each solve: an end that would run the wrong way is shut for the rest of this small step; an end past its "most" is held at its most; a pump that would run backwards is off. If anything changed, solve again, up to `PRESS_ROUNDS` times. If it still has not settled, that group moves nothing this small step. (Prototype: 0 times in 1.5 million solves with the final rules.)
2. A part of a group with no end whose head is known and no pump to an open cell is **shut in**: only differences of head matter in it. Fix one of its points at "just full" for the solve, then shift the part so its lowest pressure reads exactly "just full". If a shut-in part would have to take in or give out water (its fixed point's head moved), the group moves nothing this small step.
3. A group with no end and no pump at all is not solved. Neither is a group with no holes, no pump and no leftover, whose surfaces (and sky cells) all stand at the same head within 1e-12: still water costs nothing. (This short cut is the one rule here the prototype did not have; it changes no answer.)
4. Last, a safety net for cells that two groups, or a group and a pump, both use: if everything promised into an open cell is more than its room, or everything taken out of it (by holes and pumps; surfaces take what is left afterwards) is more than it holds, all the flows of those groups are scaled down together by the same fraction. Scaling every flow of a group alike keeps "what goes in comes out" true at every point.

**Moving the water.** Every flow is a plain move from one cell to the other, so no water is made or lost. Surfaces that give are done last: they take what is still in `j`, and the point under them is left short by the rest.

### The solver (`solveBanded`)

A group's points are numbered column by column (left to right, top to bottom in each column). Two joined points are then never more than one column's worth of points apart (at most 14), so the equations form a narrow band. `solveBanded(n, band, matrix, rhs)` is a banded Cholesky solve: about `n × band²` steps (66 000 for a world brim full of water), against `n³ ÷ 3` (12 million) for the general solver in circuit.js, which is why that one is not reused. The matrix is symmetric with a positive diagonal: links put `PIPE_EASE` on the diagonal of both points and `−PIPE_EASE` between them; a free end puts its ease on its point's diagonal and `ease × head` on the right-hand side; a held end puts its fixed flow on the right-hand side; a pump between two points is a link with `∓ g × PUMP_HEAD × level` on the right-hand sides.

## Data flow per tick

Pack order is unchanged: basic, 💧 water, ⚙️ gears, 🏗️ lifting, ⚡ electric.

1. **`stepFluids`** first gives room to any over-full cell (`makeRoom`, below; one cheap look, and it only ever finds one after a load or an outside edit). Then it lists the powered pumps once (their current is last tick's, as today). Then, `FLUID_STEPS` times: `flowWater`, the `falling` bookkeeping, `flowSteam`, the `rising` bookkeeping. Then `runSpecials`.
2. **`flowWater`** tells `onMove(from, to, amount, energy, drop, part, pressed)` about every move. FALL and SPREAD moves are as today (`pressed` false). PRESS moves have `pressed` true and `part` 0.
3. **`countWheels`** (inside `stepFluids`) counts `gross`, `sideOut`, `down`, `lean` for every move, pressed or not. For a pressed move the energy goes to the wheel it leaves, or else the wheel it lands on, or else nowhere: **pressed water does not carry a push on with it**, and it does not use up or pass on the push in `world.signals.falling`. (Water that fell into the top of a full pipe has splashed its push away in the pool, like any water that lands. What comes out at the bottom is pushed by pressure, and that energy is counted at the spout.) Pump moves and sky moves are not told to `onMove`, as pump moves are not today. Nor is a pressed move of `FULL_SLACK` or less: it is rounding being tidied.
4. **`flowSteam`** is today's `flowFluid` for steam, untouched except for its name and `STEAM_SQUEEZE`. `stableBelow`, `headOf` and the over-full branch of `storedEnergy` stay, for steam only; their comments say so.
5. **`runSpecials`**: faucets, burners, chillers, then drains. The pump round is gone. A chiller makes at most the room its cell has: `cool = min(CONDENSE_RATE, steam, FULL − water)`. (A faucet already stops at `FULL`.)
6. **`world.signals.press`** (a `Float64Array`, one number a cell) is filled by the last small step's PRESS: `H − floor` for points (and "just full" for shut-in ones), the cell's own amount for everything else. It is for tests, tools and a later picture. Nothing in the solver reads it back.
7. `waterSystem`, `gearsSystem`, the wheel and turbine sources, `inTheWay`, `floatsOn`, `fallingBlocks`: unchanged.

### The books: what each move gave up

- **FALL and SPREAD moves** use today's sharing, with one line made exact. A cell's own change is shared between its moves by how much each carried; what leaves is counted off what the cell had, and **what comes in lands on what was left** (`storedEnergy(left) − storedEnergy(left + came)`, with `left = had − gone`), not on what it had at the start. Today's line under-counts whenever a cell both gives and takes in one round; with whole stacks sliding it would be badly wrong. Now the shares add up to exactly what the water lost.
- **PRESS moves.** Give every point the potential `H`, and every other cell `φ = level` (at the start of PRESS). A move of `q` from `a` to `b` has the head energy `q × (φ(a) − φ(b))`. It is never negative: links and ends only run downhill. An open cell's water also rises or sinks as it takes or gives, so its real change is a little more than `φ × what it took`; that extra (`½ × net²` for one cell) is taken off the head energy of the moves at that cell, shared by their head energy. A cell that gave from a surface *and* was emptied below (the point under it left short) counts as one stack. With a pump at the same open cell, the surface and hole moves pay `½ × (their own net)²` and the pump's books take the rest.
- **A cell that fills up under the lid rule** takes water in at the head `H`, which is at least its own top: the water gave up more than the cell gained. That difference is not credited to anyone. It is lost, like a splash.
- **A pump's work** on the water this small step is `q × lift` plus its share at its open ends. `stepFluids` returns the tick's total as `pumpWork` (in the same units as `waterWork`), for the tests.

## What is deleted

| Where | Gone |
|---|---|
| fluids.js | `SQUISH` (→ `STEAM_SQUEEZE`, steam only); rule 3 "UP" for water; `flowFluid`'s use for water (the function becomes `flowSteam`); `pumpAmount`'s four arguments and its 40-step search (→ `pumpAmount(level, lift)`, one line); round 2 of `runSpecials`; `NEAR`, `levelFor`, and steps 2, 3, 3b, 4, 4b, 5 of `waterPicture` with their `source` result; the "only LOOKS wet" halves of `pour` and `scoop`; every "squished" in a comment about water |
| fluids.js, kept but simpler | `waterPicture` returns `{ shown, falling }`: `shown = water ≥ MIN_AMOUNT ? min(water, FULL) : 0`, `falling` as now except that a cell below within `FULL_SLACK` of full counts as full. `pour`: refuses when the cell is already full (`≥ FULL − FULL_SLACK`), else sets it to `FULL`. `scoop`: takes the cell's water (it is never more than a scoop) and up to `FULL` of its steam |
| world.js | the words "a little over 1 = squished by the weight above" (now: water is never over 1; squeezed steam can be) |
| water.js | the comment at `drawWaterLayer` about squished water; nothing else |
| tests | see "Tests" |

`placeBlock` / `pushFluidOut` keep their rule (up, else both sides, else down) and then call `makeRoom`, because the neighbour may already be full.

### `makeRoom(world, blockInfo)` (new, exported)

For every cell holding more than `FULL` of water, bottom row first: set it to `FULL` and hand the extra on. Search outward through open sides (never through a pump), one step at a time, passing through full cells. At the first distance where any cell has room, fill those: cells reached by a step **up** first, then sideways, then down; cells of the same kind share alike. Carry what is left to the next distance. What is left when the search runs out is dropped, and the amount dropped is returned. Steam is not touched (it may be squeezed).

## Saved worlds

- **No new version.** `SAVE_VERSION` stays 2; saves written after this pass simply never hold water over 1. An old page reading a new save is not a case.
- **Loading.** `loadWorld`'s callers in build.js (three places) call `makeRoom(world, blockInfo)` on the loaded world before the first draw, so the first picture is already right. `stepFluids` does it too, so nothing depends on that call.
- **What a child sees.** Checked on worlds settled with today's solver and saved (amounts rounded to 3 places):

  | Saved world | Saved | Today's picture drew | Loaded | Dropped |
  |---|---|---|---|---|
  | Open shaft, 10 cells poured (7 over-full cells) | 10.000 | 10.000 | 10.000 | 0 |
  | Tank 4 wide, 20 cells (16 over-full) | 20.008 | 20.000 | 20.008 | 0 |
  | U-tube (9 over-full) | 10.997 | 11.000 | 10.997 | 0 |
  | Shaft with a lid, crammed full (1, 1.1 … 1.5) | 7.500 | 6.000 | 6.000 | 1.500 |

  So wherever there is room above, the extra goes back on top of the water it was squashed under, which is exactly where #20's picture drew it: the world looks the same before and after. Under a lid there is no room, the picture never showed the extra, and it is dropped: the tank looked full and is full.
- **The one case that shows:** a tank that was brim-full to an open rim, with extra squashed in below (the case #20 called "under-drawn"). On loading, that extra stands above the rim and spills over in the first second. That is the child's own water coming back into view, not new water; hiding it would mean destroying it. A 3-deep brim-full tank spills 0.3 of a cell for each column; it happens once.
- `falling`, `rising` and `press` are not saved, as before.

## Why no build can make energy

Call the water's energy `E` (every cell's `storedEnergy(water) + water × floor`).

1. **FALL never raises E:** water goes one cell down into room. **SPREAD never raises E:** water goes from a fuller cell to an emptier one at the same height, and never more than a quarter of the difference each way.
2. **PRESS never raises E, pumps aside.** Every link and every end runs from more head to less. Add up `flow × head lost` over all of them: each point's own term cancels (what goes in comes out), so the sum is the head energy the open cells lost, which is what E lost, less the `½ × net²` the open cells gained by rising. An end moves at most a quarter of its head difference (`SURFACE_EASE`, the spread quarter, `SQUIRT_EASE` are all ≤ 1/4) and a cell has at most four sides, so `½ × net²` is never more than the head energy at that cell: E goes down, and every move's share is ≥ 0. Scaling a group's flows down, shutting an end, and skipping a group all keep every flow downhill.
3. **So it cannot slosh for ever.** The same quarter means a surface never moves past the heads it is joined to. E only falls, it cannot fall for ever, and nothing in the rules remembers which way water was going. Flows die away.
4. **Each bit of energy is handed out at most once.** A move's energy goes to one wheel, or rides on with falling water in `falling`, or is lost. The shares add up to what E lost (FALL, SPREAD) or less (PRESS). So work credited to wheels + push still carried ≤ what E has lost + what pumps put in. (Tested tick by tick.)
5. **A wheel never does more work than its count** (unchanged: `WHEEL_STRENGTH`, the torque–speed line, #17). A generator gives back 8 tenths (unchanged).
6. **A pump pays.** The water it moves gains `q × lift`, at most. On its straight line that is biggest at half its stall height: `0.75 × level²` a tick in work units (`DROP_POWER ×`), under the `0.9 × current²` its electricity holds (0.82 `× level²`). Friction in the pipes beyond the pump is part of `lift`, so it is paid for too. With the lift negative the water loses energy through the pump.
7. **A shut-in ring is no exception.** In a ring of pipe full all the way round, the only head there is comes from the pump, and the links use it up going round. Wheels in the ring get the head lost over their own two links, which is the pump's work or less. Height does not come into it: what goes up one side comes down the other, pressed all the way. (The tall-loop tests pass; their wheels now turn feebly, as they should.)
8. **Blocks.** A block that sinks one cell swaps places with at most one cell of water, lifting it one cell: E rises by exactly `water × 1`, which is what `WATER_WEIGHT × water` makes the block (or its rope) pay (`inTheWay`, `floatsOn`, addenda 2 and 3 of the turbine spec). With squashed water the cell below could hold 1.6 and the ledger counted spring energy on top; now the price is exact at every depth.
9. **What does raise E, and who pays:** a faucet (an outside source, like a battery), a pump (electricity), a chiller making water high up (the steam's own energy: the heat engine of the turbine spec), a block sinking (its weight), and a hand (pouring, building a block into water, loading a save). No spinning or electric block moves water except the pump.

Steam's argument is the turbine spec's, word for word: nothing about steam moves.

## What a prototype measured (throwaway, not committed)

The law above was written into a copy of the repo (scratch only) and the whole test suite run against it: **824 of 837 pass.** The 13 that fail are the ones listed for rewriting under "Tests": eight test how squashed water was drawn, two call `pumpAmount` the old way, one starts its random worlds with over-full cells, one is the level-stream limit (0.0501 against 0.05), and one is the docs test (the prototype had no JSDoc). Every perpetual-motion test passes as it stands: the level channel, the level ring, the tall loop in all its gearings, the clicker loop, steam plant → pump → wheel, the winch dipping a load in a pool, the load shuttled through steam, and the random-world ledgers for water and steam.

Whole game, today's solver against the prototype:

| | Today | Prototype |
|---|---|---|
| 10 cells poured into a shaft stand | 7.53 tall (bottom cell holds 1.65) | 10.00 (1.00) |
| A 10-cell shaft takes | 14.48 | 10.00 |
| A 4 × 13 tank (52 cells) holds | 83.13 | 52.00 |
| Wheel under a faucet | speed 0.994, strength 1.988 | 1.000, 2.000 (the books are exact now) |
| Wheel in a level stream, best work | 0.0376 | 0.0501 |
| Pump, 1 / 2 / 3 batteries, water standing above it | 4 / 9 / 10 cells tall (5.2 / 13.0 / 15.0 cells of water) | 4.5 / 9.5 / 13 cells tall, and that much water |
| Pump: 3 cells up after | 111 / 43 / 28 ticks | 95 / 37 / 24 |
| Sealed full loop, pump with 2 batteries: a wheel in it | flow 0.039 a tick, speed 0.36 | flow 0.049, speed 0.16 |
| Sand, iron dropped into a settled 12-deep shaft | stop at row 10 of 12 | reach the bottom |
| Crate dropped into it | sinks 3 cells | floats on top |
| A 3 × 7 tank through a valve at its foot: half gone after | 68 ticks | 47 |

Levelling (ticks to within 5% / 1% of level; "back" = times an arm turned back):

| | 5% | 1% | back | still after |
|---|---|---|---|---|
| The U-tube of tests/fluids.test.js | 7 | 9 | 0 | 14 |
| Tower and pipe of tests/fluids.test.js | 9 | 12 | 0 | 20 |
| 5-tall arm, 22 cells of pipe, 5-tall arm | 14 | 21 | 0 | — |
| 11-deep arm, 8 cells of pipe, a 4-wide basin | 12 | 18 | 0 | — |

An enclosed wheel at the end of a pipe from the foot of a tower, the water then falling free (second tick; "fall" is `work ÷ gross`, what the wheel's speed and strength come from):

| Tower | Head left | Flow a tick | Fall | of the head |
|---|---|---|---|---|
| 3 wide, 2 cells of pipe | 6.5 | 1.39 | 4.31 | 66% |
| 3 wide, 2 cells of pipe | 10.4 | 1.74 | 7.10 | 68% |
| 3 wide, 8 cells of pipe | 10.5 | 1.51 | 5.30 | 50% |
| 1 wide, 2 cells of pipe | 9.5 | 1.38 | 4.20 | 44% |
| 3 wide, 8 of pipe, wheel in the MIDDLE of the pipe | 6.6 | 1.21 | 0.61 | 9% |

So: taller is faster and stronger; a wide tank with a short pipe gets about two thirds of its height to the wheel; long pipes and thin towers rub more of it away; a wheel inside a full pipe gets only the rubbing.

Sweeps (seeded random worlds, 4 to 24 wide and 3 to 14 tall, of stone, pipes, valves, wheels, rope and water in random amounts, 200 ticks each):

- 400 worlds, no pumps: E never rose by itself (worst +6.8e-13); water made or lost, worst 1.7e-13; fullest cell ever, `FULL` + 2.4e-14; work credited + push carried − energy lost, worst 0.
- 300 worlds with pumps in all four directions at 0.3 to 3.5 batteries, their current changed at random: water worst 2.1e-13; fullest cell `FULL` + 2.8e-14; ledger worst 0; E gained beyond the pumps' counted work, worst 1.7e-13; `DROP_POWER ×` pump work never above `0.9 ×` the pumps' electricity in any tick.
- In those 1.5 million solves no group failed to settle, and no pass limit was reached.

Speed (ms a tick on the build machine, `stepFluids` only; the prototype is written for reading, with maps and objects):

| World (24 × 14) | Today | Prototype |
|---|---|---|
| Empty | 0.20 | 0.40 |
| Random worlds, mean | — | 0.9 to 1.0 |
| Maze of full pipes with an open end | 0.62 | 2.0 |
| Brim full, one column emptied (336 points, levelling all the time) | 0.90 | 5.8 (worst tick 19) |

A tick has 125 ms. The build should come in well under the prototype: see "Performance".

## Performance

- All working lists are typed arrays made once per tick (or kept on a module-level scratch object sized to the world), not per small step. The neighbour-through-open-side answer (`canFlow`) is worked out once per tick into four `Int32Array`s; today it is a string search at every call.
- A group whose ends all read the same head is skipped (limit 3 above). A settled pond, a full sealed tank and a brim-full world then cost a scan and no solve.
- Like `work` in circuit.js, export a counter `pressWork = { solves, points }` so tests can pin the cost without a clock.
- Target: no world over 3 ms a tick on the build machine, a typical world under 1.

## Known edges, on purpose

- **A hole lets water out in every open direction.** Water squirting out of a pipe's end rises a little above the end if the tank is higher than the end. With no momentum, pressed water spreads like water soaking through sand. It was the same with squish.
- **A water wheel is open on all four sides**, so a wheel in a pipe with air above it is a leak, and the water fountains out of its top. Put a block over it (the wiki says so now). Not new, but faster pressure makes it plainer.
- **Water never hangs under pressure it does not have.** A full pipe above its tank's level, or a jar turned upside down in a pond, runs down to the level (a gap is left at the top; the game has no air to keep out). Water with a lid over it and nothing open under or beside it stays, as today.
- **No siphons.** Water with room under it falls, whatever is behind it.
- **A pump that is off is a shut door to pressure** (see Decisions). A pump put in a pipe "so the wire can cross", as four tests do, must be powered to let the water through fast; in those tests it is.
- **A drain still takes one cell a tick** (it is emptied at the end of the tick, and fills meanwhile). A big squirt can back up over it. Not changed.
- **Building a block into a sealed, full tank loses that cell of water** (nowhere for it to go). The guide's "shut in on every side, it is lost" now covers this.
- **The grain of the grid** (a floating crate sits in the cell above the water): unchanged.

## Not chosen

- **Lowering `SQUISH` to 0.02 with more small steps** (#20's first idea): still squashes a little, costs more, and breaks the U-tube and tower tests.
- **Keeping a pressure number in every cell and nudging it toward the right answer each tick:** until it has settled, the flows it gives do not add up, so some full cell ends up over full or short. Tidying that up afterwards either breaks "no water made or lost" or brings the sloshing back.
- **One pressure for each whole body of full water, no equations** (flows only where the body meets a surface): cheap, and it levels a U-tube. But a ring of pipe full all the way round cannot move at all, a wheel in a pipe sees nothing, and where the water goes round a loop is anybody's guess, so a mirrored machine could run differently.
- **Making steam a proper gas** (pressure in step with the amount, spreading every way): more real than today's steam, but it changes how every boiler and chimney behaves and what the turbine spec measured. A pass of its own, if ever; nothing here stands in its way.

## What this leaves for later

- **#29 (steam cooling):** steam is untouched, so nothing there moved. One rule for whoever writes it: water made in place must fit, `min(rate, steam, FULL − water)`, as the chiller now does. Rain made in the top row falls by rule 1 the next small step. The top row being open sky to water changes nothing for steam.
- **The motor–generator law:** not touched. Wheels and turbines hand the ⚙️ pack the same five counts; pumps read the same current.
- **Drawing pressure:** `world.signals.press` is there. A darker blue for harder-pressed water would show "deep water presses harder" at a glance. Left out so that this pass changes how the water moves and not also how it looks.
- **A pipe elbow that keeps steam's push** (#29) and a **wire through a pipe**: as before.

## Tests

### tests/fluids.test.js

Change:
- Imports: drop `SQUISH`, `headOf`'s water use; add `FULL_SLACK`, `PIPE_EASE`, `SURFACE_EASE`, `SQUIRT_EASE`, `STEAM_SQUEEZE`, `makeRoom`, `pressWork`. Stand-in blocks gain a water wheel and the other three pumps.
- "the lower of two stacked cells holds a little extra (squish)" → **steam can be squeezed, water cannot**: `stableBelow` with `STEAM_SQUEEZE` as now; and 300 ticks of a water column never show a cell over `FULL`.
- "a powered pump pushes water uphill": as it is (it passes).
- "lifting water uses up a pump's push" → `pumpAmount(level, lift)`: `PUMP_RATE × level` at lift 0; less at 1, 2, 3; exactly 0 at `PUMP_HEAD × level`; two batteries still lift there; a little more than `PUMP_RATE × level` at lift −2.
- "a pump never gives the water more energy than its electricity holds" → for the same spread of levels and lifts from −14 to 14: `DROP_POWER × pumpAmount × lift ≤ 0.9 × electricity`. And in a world: pumps in a shaft, a pond and a sealed ring, 300 ticks: each tick `DROP_POWER × pumpWork ≤ 0.9 ×` the electricity, and E never rises by more than `pumpWork`.
- "water gives up energy by falling, and hardly any by sliding along": drop the `headOf(1 + SQUISH)` line; add "still water gives nothing: the pressure down a 5-deep tank reads 1, 2, 3, 4, 5 and nothing moves".
- "in lots of random worlds, wheels never get more energy…": no cell starts over `FULL` (use `random()` and 1); add pumps to a second copy of it, with `pumpWork` on the other side of the books.
- The U-tube and the two tower tests: tighten to what is now true (U-tube level within 0.05 after 20 ticks; tower and pipe within 0.02 after 40).

Add:
- **No cell ever holds more than a cellful** (60 seeded random worlds with faucets, chillers under steam, pumps and blocks built into water mid-run; every tick `max ≤ FULL + 1e-9`).
- **Ten buckets stand ten tall; a 10-cell shaft takes exactly ten; a tank holds its size.**
- **Deep water presses harder:** `press` at the foot of 1 to 12 cells of still water reads the depth; the same in both arms of a settled U-tube; a sealed full tank reads 1 everywhere.
- **Levelling never turns back** (U-tube, wide-and-narrow, three arms: each arm's amount moves one way only), and it stops (`moved < 0.001` after 60 ticks).
- **A long pipe is slower than a short one, and both are level within 40 ticks.**
- **A stack of water falls together** (a 4-cell stack over a 3-cell gap: all four cells have moved after one small step's worth, none is lost).
- **A hole squirts harder the deeper it is** (outflow in the first 4 ticks from a hole under 2, 5, 9 cells: each more than the last), **and with no pressure it is just spreading** (a full cell with nothing on it gives the same as today's rule 2).
- **A spout is a nozzle:** tower 3 wide and 6 or 10 deep, 2 cells of pipe, a wheel with stone over and under it, then a free fall: the wheel's `work ÷ gross` is over half the head and grows with the tower; the same wheel in the middle of 8 cells of pipe gets under a fifth.
- **Open air is not pressed:** water squirting from a spout into open air never makes a cell of air read a pressure over 1 in the same small step.
- **The top of the world is open sky:** a tower built to the top row drains through a hole at its foot, at once.
- **A pump does not suck:** a pump on a sealed full cell empties that cell and then moves nothing; a pump over a 3-deep well lifts only the top cell; a pump at the foot of a deep open tank is helped by the depth (it lifts higher than one over a puddle, by about the depth).
- **A pump drives a sealed full ring round**, both ways up and mirrored: water passes every cell, no cell changes, and wheels in the ring get work ≤ `pumpWork`.
- **A pump that is switched off holds pressure back** (a 6-deep tower, a pump pointing along the pipe, a riser beyond it: the water in the riser never stands higher than the pump's own row; with the pump taken out and a pipe put in, it rises level with the tower).
- **Pressed water counts the same in a mirror** (a pressed scene, 40 ticks: flows the other way, energy the same to 1e-12).
- **Still water costs nothing:** a settled pond, a sealed full tank and a brim-full world do no solves (`pressWork.solves` unchanged over 10 ticks).
- **`makeRoom`:** the four worlds of the table in "Saved worlds" (amounts written in by hand, as a save would hold them): nothing over `FULL`, the totals as in the table, the dropped amount returned; a second call does nothing; a mirrored world gives the mirrored answer.
- **A chiller never over-fills a cell** (steam bubbling through a full tank under a chiller: water ≤ `FULL`, water + steam conserved).

### tests/water-picture.test.js

Most of this file tested how squashed water was drawn. Rewrite it as "the picture is the water":

- Keep, now about the real water: N cells in a shaft are N tall at every moment (1 to 13); pouring ten one at a time shows 1 … 10; a wide tank with a deep end, a U-tube, a wide-and-narrow U-tube and a pipe beside a tower are level **in the world** once settled, and the picture's total equals the water's total at every tick; never shimmers (settled column drawn the same every tick; a filling shaft never dips); mirrored world, mirrored picture; working out the picture never changes the world; the falling / lying tests (stream width, trickle on a puddle, smooth change-over, "a settled deep column has no streams in it").
- Change: "one scoop from the bottom of a 12-deep column takes exactly one cell" (drop the "is squished" line: the cell holds exactly 1); "pour never overfills"; "you cannot pour into a full cell; pour just above"; the tank with a step (the real water now stands on the step).
- Delete (nothing left to test): "the real water is still squished", "a sealed full tank is drawn full and no more", "never drawn standing above the rim", "extra is only drawn straight above real water", "its squished-in extra is drawn on the tower, not on the puddle", "digging at water you can see… even where it is only drawn", "a speck of real water in a cell that is drawn full", "water drawn on a step can be dug", "a ledge only counts beside calm water", "a tower joined by a pipe to an open spout… drawn level with the pool", "a pump holds water back, so the water behind it is not drawn up".
- Add: `waterPicture` returns only `shown` and `falling`; `shown` is `min(water, FULL)` for every cell of 40 random worlds.

### tests/gears.test.js

- "a wheel in a level stream still turns, but feebly": best work is now 0.0501 against a limit of 0.0500. Make the limit `0.11 ×` a crank's best ("about a tenth"); the speed and strength lines pass as they are.
- Add: **a taller tower turns its wheel faster and harder** (whole game: the nozzle scene above with a gear on the wheel, towers of 4 and 8: speed and strength both greater).
- Add: **in a sealed full loop the wheels turn feebly, however tall it is** (the tall loop with 3 and 6 wheels, generators out: the wheels' top speed is under 0.3 and no greater for the taller loop).
- The loop tests, the ledger test "water power cannot loop forever either", and "no steam machine runs without its fire": unchanged, and they must pass unchanged. That is the point of them.

### tests/lifting.test.js, tests/basic.test.js

- Add: **sand and an iron weight sink to the bottom of a 12-deep tank**, loose and on a rope, and the water is all still there.
- Add: **an iron weight pulls the same at every depth** (`winchLoad` pull at 2, 6 and 11 cells down a full shaft: equal).
- Add: **a crate floats on a deep tank and on a shallow one alike.**
- Everything else unchanged.

### tests/saves.test.js, tests/build.test.js

- saves: add **an old save with squashed water loads with every cell ≤ FULL and all its drawn water** (through `makeRoom`), and **a new save never holds a number over 1**.
- build: "a rock built into a tank pushes the water up" uses `setFluid(…, 1.09)`: make that 1 and add a case with a full tank and open air above (the level rises by exactly one cell's worth, shared over the surface); add **a block built into a sealed full tank loses that cell of water and no more**.

### Others

- `tests/water.test.js`: the pump-height test passes as it is (measured 4.5 and 9.5); the steam tests are untouched.
- `tests/guide.test.js`, `tests/wiki.test.js`: add "the 💧 guide and the wiki's Water page do not say squish / squished, and do say 'presses harder'".
- `tests/docs.test.js`: every new function needs its JSDoc (`flowWater`, `pressWater` and its inner helpers, `solveBanded`, `makeRoom`, `flowSteam`).
- `tests/sw.test.js`: no change. `sw.js` fetches our own files from the internet first and no file is added or renamed, so `CACHE_NAME` stays `caleb-v8`.

### Sweeps to run again (throwaway scripts, as before; say the numbers in the "as built" addendum)

1. The two random-world sweeps above, on the real code, at least 1000 worlds each.
2. The #17 water sweeps: random pump → wheels → generator → pump loops (level and tall, 1 to 6 wheels, every gearing), battery swapped for wire: all wind down and stay down.
3. The turbine spec's sweeps: 900 random plants; 750 plants feeding a motor on their own shaft; random soups with wire loops. (Steam is unchanged, but pumps and falling rain are water.)
4. Addendum 2's winch sweep (400 runs) and addendum 3's `r3fix` sweep (1200 runs of 2000 ticks): the ledger never climbs back above an earlier low.
5. A new one for this pass: 500 worlds of towers, pipes with wheels in and at the end of them, valves flipped at random, pumps switched at random: wheel work + carried push ≤ energy lost + pump work at every tick, pump work ≤ 0.9 × electricity.

## Docs, guide and pictures

**💧 guide (water.js)**
- Rule 2 becomes: "Water falls and spreads out. Deep water presses harder: the taller the water standing over it, the harder it pushes. That push sends water UP a pipe or a U-tube until it is level, and squirts it out of a hole."
- Rule 3 becomes: "Water can't be squashed: ten buckets are ten cells, however deep. Falling water is a stream as wide as there is water: a trickle looks like a trickle. One tap of DIG takes one scoop. You can't pour into a full cell: pour just above the water."
- Rule 1: "…Only DIG and drains take water away (and building a block into a full tank with a lid on it: there is nowhere for that water to go)."
- `pumpRight`: add "A pump doesn't suck: it takes the water right behind it, so let the water run to it."
- `waterWheel` (gears.js guide): add "At the end of a pipe from a tall tank it is strong too: put a block over it so the water can't squirt out of its top."
- The file's header comment and fluids.js's header: rewrite rule 3 ("Deep water presses harder… worked out like a circuit, see pressWater") and drop "squished water" from the energy paragraphs; steam's paragraph says "squeezed steam", which is still true.

**wiki/Water.md**
- Replace the long bracket in the second paragraph ("Inside the game, deep water is really *squished*… issue #30.)") with: "Water can't be squashed: ten cells of water are ten cells, at the top of a tank or the bottom."
- New short paragraph after it: "**Deep water presses harder.** The taller the water standing over a place, the harder it pushes there: that is pressure. It pushes water up a pipe until both sides are level, and squirts it out of a hole, harder the deeper the hole. A long thin pipe rubs some of the push away. Steam is different: it is a gas, and a gas CAN be squeezed."
- The Water row of the block table: "…Deep water presses harder, so it pushes **up** through pipes and U-tubes."
- Pump paragraph: "one battery lifts about 5 blocks, two about 10" stays true (measured 4.5 and 9.5). Add the "doesn't suck" sentence.

**wiki/Machines-to-build.md:** the U-tube and water-tower sections lose any "squished" wording if present; add one line to the water tower: "Try a taller tower, and put a water wheel with a block on top of it at the end of the pipe."
**wiki/Lifting.md:** no change. It says "sand and iron sink" and nothing about stopping part way down (only the turbine spec's addenda said that), so it is simply true now at every depth.
**wiki/Experiments.md:** add "How deep can you make it squirt?" (a tank, a hole near the top and one near the bottom).

**README:** file table: "`js/fluids.js` | How water and steam move: falling, spreading, pressure (pure)". Check the "how it works" text for "squish".

**Pictures (`tools/make-block-pictures.cjs`):**
- `u-tube`: 80 ticks → 20 (it is level by 14; the picture is the same level one).
- `water-tower`: 160 ticks → 8. Checked on the prototype: at tick 8 the tower is still 4.6 deep and water is squirting out of the pipe and a little above its end; by tick 30 the tower has emptied into the yard and everything is level, which shows nothing.
- `pump-uphill`, `hydro-dam`, `sand-in-water`, `well`: same scenes; they will differ by a few pixels. Look at each.
- Regenerate with the house command, then `git checkout` `crate.png`, `ironWeight.png` and `music-machine.png` unless they were meant to change.

**Older specs:** two-line addenda, not rewrites: the fluids spec ("water no longer squishes; `SQUISH`, rule 3 and the #20 picture rules are replaced: see 2026-10-05-water-pressure-from-depth-design.md; steam keeps `STEAM_SQUEEZE`") and the turbine spec's addenda 2 and 3 ("the 'about 6 cells down' edge is gone").

## Suggested commit order

1. fluids.js: `STEAM_SQUEEZE` and `flowSteam` (pure rename; all tests pass).
2. fluids.js: `solveBanded`, `flowWater` (FALL, PRESS, SPREAD), pumps into PRESS, `pumpAmount(level, lift)`, `makeRoom`, the chiller's room, `world.signals.press`; fluids tests. (The tree will not pass in between, so this is one commit, as in the turbine pass.)
3. `waterPicture`, `pour`, `scoop` made simple; water-picture tests.
4. build.js load path; saves, build, gears, lifting tests.
5. Guide, wiki, README, older-spec addenda.
6. Pictures.
7. Sweeps, and the "as built" addendum to this file.

## Addendum 2026-10-05: as built

Built as specified, with the changes below. `npm test`: 863 pass (837 before: 13 rewritten or deleted as listed, the rest added). Every perpetual-motion test passes as it stood; the only energy test that was edited is the level-stream limit (0.0501 against "a tenth of a crank": now `0.11 ×`), as the spec said.

### What was built differently, and why

1. **A new rule, `NO_ROOM` (0.01): a cell with no room to speak of passes the push on even in open air.** The prototype had a flaw the spec's table did not show. Water pressed sideways into the bottom of a pond that is *almost* full to the next row (a tall column beside a basin, a tank emptying into a pit) could only give each cell its last speck of room in each small step, and SPREAD then took a little out of that cell again. So the cell never counted as full, the push never got past it, and the column stood too high until every cell of the row had crept to within `FULL_SLACK`: about 110 ticks (14 seconds) for a 7-deep column beside a 5-wide basin, then a sudden rush. Now a hole whose cell has less than `NO_ROOM` of room counts as lidded for the lid rule: it fills and passes the push on (and must still come out really pressed, like any cell under a lid, so the books are unchanged). The same scene levels in 22 ticks with no pause. A spout into open air is still a nozzle (the cells outside it are nowhere near full), and the nozzle numbers of the spec's table came out the same to two decimals. One number moved: the 3 × 7 tank through a valve into a 3-wide pit is half gone after 15 ticks (prototype 47, squished water 68), because once the pit has filled to the valve the two are a U-tube.
2. **`flowWater(world, table, onMove, pumps)`**, not `(world, canFlow, onMove, pumps, sides)`. `flowTable(world, sides, blockInfo)` works out once a tick, as typed arrays, where fluid may go from every cell (`to`, one-way through pumps), which cells stand as one body (`joined`), and each cell's `pump`, `sky` and `floor`. `workingPumps(world, blockInfo, sides)` lists the pumps that are running. Both are exported, with `solveBanded`, for the tests. Steam's `canFlow` is now a look-up in the same table. A test checks the table against `flowChecker` in 60 random worlds.
3. **`makeRoom` puts the extra of joined over-full cells in one pot and searches from all of them at once** (the spec had each cell search by itself, bottom row first). The answer is the same in the four saved worlds of the table, but it no longer depends on which over-full cell comes first, so a mirrored world always gets the mirrored answer (tested on a lop-sided world). Two smaller points: the extra of an over-full *pump* cell may leave through the pump's front (the spec would have dropped it), and extra of `1e-12` or less is left alone as rounding.
4. **The still-water short cut is a little wider than "no holes".** A body of water is skipped when it has no pump, nothing over or under full (to `1e-12`), every surface and sky cell at one head (to `1e-12`), no hole underneath, and no hole in the side that this head would press on (`head < the hole's own top`). So a settled pond with a step in it is skipped too. Checked against the same code with the short cut switched off, in 400 random worlds: the same to rounding (the short cut leaves specks of `1e-15` untidied, nothing more).
5. **`waterPicture` draws a cell that is full but for a rounding speck (`FULL_SLACK`) as full.** Otherwise a draining tower showed hairlines of air between its cells (the surface line is drawn in any cell under 1). `shown` is otherwise the cell's own amount.
6. **`world.signals.press`** reads the cell's amount *at the end* of the small step for every cell that is not pressed (the spec: at the start of PRESS).
7. **`scoop(world, x, y)`** lost its `blockInfo` argument (it no longer needs the picture). build.js loads through one new helper, `openWorld(n)`, which calls `makeRoom`.
8. **`pressWork` has a third count, `stuck`**: the times a body of water did not settle in `PRESS_ROUNDS` tries and was left alone for a small step.
9. **"A stack of water falls together" is tested as what is true:** after one small step the stack has moved down one cell and is still one stack with no gaps, but its top cell is a tenth short, because PRESS has already pushed a little out of the bottom (the stack's own weight over the gap). None is lost.
10. **tests/basic.test.js is unchanged.** Loose sand and iron sinking through 12 cells of water are tested in tests/lifting.test.js, with the whole game running.
11. **wiki/Experiments.md** also gained `PIPE_EASE` as a thing to change.

### Known edges found while building

- **A hole that is shut early in a small step stays shut for that step, even if it should have opened.** The sums start with every surface free; a hole that is "not pressed" then is shut, and "shut stays shut" (the rule that stops the sums going round in circles). If a surface is then held at its most and the pressure rises, the hole still only spreads (the usual quarter) in that small step. It errs on the slow side and can only lose energy. It also means the answer depends a little on the order the limits are found in, so starting the sums from last step's answer (tried, for speed: 6 rounds became 1 in a full world with a pump) changed about 1 world in 100 by a few hundredths of a cell. It was taken out again: nothing is carried over from one small step to the next, as the spec decided.
- **A pump's "does it suck?" test is a hard switch** (`H < floor + 1 − 1e-9`). In a soup of dozens of pumps a difference of `1e-15` can flip it and change a tick by 0.07 of a cell. It is the same for both answers' energy books, and nothing was seen to flicker from it.
- **A group that does not settle** (`stuck`) happened once in 2.8 million solves, in the random worlds with pumps (never without pumps, never in the tower sweep). That body of water waits one small step.

### Sweeps (throwaway node scripts in the session scratchpad, `build30/`)

| Sweep | What | Result |
|---|---|---|
| `sweep1-random-worlds.mjs`, no pumps | 1000 random worlds (4 to 24 wide, 3 to 14 tall) × 200 ticks | Energy never rose by itself (worst +6.8e-13); water made or lost, worst 1.7e-13; fullest cell `FULL` + 2.7e-14; credited work + carried push − energy lost, worst 0 |
| `sweep1-random-worlds.mjs`, pumps | 1000 worlds with pumps all four ways at 0.3 to 3.5 batteries, switched at random | Water worst 2.6e-13; fullest cell `FULL` + 5.2e-14; ledger worst 0; energy gained beyond the pumps' counted work, worst 4.5e-13; `DROP_POWER ×` pump work never above `0.9 ×` electricity |
| `sweep5-towers.mjs` (new) | 2 × 500 worlds of towers, pipes with wheels in and at the end of them (1880 wheels), valves flipped and pumps switched at random, 700 ticks, the last 300 untouched | Ledger worst +1.2e-14; energy beyond pump work worst 4.5e-13; water worst 1.8e-13; pump work ≤ 0.9 × electricity at every tick; no world flickered at the end (most turn-backs of any cell in the last 100 ticks: 3) |
| `sweep6-steady.mjs` (new) | 13 whole-game machines with steady flows (faucets, drains, pumps, a sealed ring, the wiki's hydro dam), 800 ticks then 200 watched | Every cell's water and every wheel's speed hold still (worst swing 1.8e-15) |
| `fuzz-whole-game.mjs` (new) | 700 random whole-game worlds with sand, crates, iron, ropes, winches, pumps, faucets, burners and chillers, blocks built in at random | No cell over `FULL` after any pack's turn in any tick; no water made (worst 9.7e-14) |
| `old/law/sweep3-waterloops.mjs` (the #17 loops, as the motor–generator pass left them) | 2 × 400 closed pump → wheels → generator → pump loops (channel, ring, tall; any gearing; primed, as built or flooded) and steam plant → pump → wheel chains | 0 bad: all wind down and stay down, no water made or lost (591 really ran before the power went) |
| `old/law/sweep2-soup.mjs`, `sweep4-winch.mjs`, `sweep5-feedback.mjs`, `sweep7-wheels-batteries.mjs` | 400 soups with wire loops; 300 winch towers; 750 plants feeding a motor on their own shaft; 400 wheel and turbine builds with batteries | 0 bad in each |
| `old/turbine/sweep1-steam-ledger.mjs` | 1200 random worlds × 250 ticks with burners and chillers | 0 bad; the moves never raised the steam's energy (worst +5.7e-14) |
| `old/repair/sweep-lift.mjs` (addendum 2 of the turbine spec) | 400 runs × 2000 ticks | The ledger never climbed back above an earlier low (worst +0.0000) |
| `old/r3fix/sweep.mjs` (addendum 3) | 1200 runs × 2000 ticks | The same: worst +0.0000 |

The turbine pass's own plant, soup and feedback scripts (`old/turbine/sweep2` to `4`) test "heat ≤ 8 tenths of the shaft work", which the motor–generator law replaced; they give exactly the same output on the commit before this pass and after it (656, 62 and 448 "bad" by that old rule), so the new water changed nothing in them. The motor–generator pass's versions of those sweeps are the ones in the table.

In those sweeps the water that started over-full (the old scripts poured in up to 1.3 a cell) was capped at 1: `makeRoom` would otherwise lift it at the first tick, which is a hand's work and not the machine's.

### Speed (ms a tick, `stepFluids` only, on the build machine, after the code has warmed up)

| World (24 × 14) | Before | Now |
|---|---|---|
| Empty | 0.08 | 0.11 |
| Brim full of still water | 0.82 | 0.52 (no solves) |
| Brim full, 3 columns emptied (levelling all the time) | 0.85 | 1.7 (worst tick 3.0) |
| Two big tanks joined by a pipe, one full | 0.62 | 1.2 (worst 2.0) |
| Maze of full pipes | 0.58 | 0.47 |
| Tower sweep worlds, mean | | 0.41 |
| Brim full of water with a pump in the middle of it | | 5.5 (worst 6.2) |
| Random worlds with dozens of pumps | | mean 1.7, 99 in 100 ticks under 9.3, worst 15.5 |

The 3 ms target is met by every world without a pump in a sea. A pump standing in a world that is brim full (335 points in one body, six rounds of sums each small step) is the costly case: it is the one that starting from last step's answer would have fixed (see "Known edges"). The first few ticks after the page loads run 3 to 4 times slower, until the browser has warmed the code up.

### Measured on the code as built

Ten cells in a shaft stand 10.000 (bottom cell 1.000); a 10-cell shaft takes 10.00; a 4 × 13 tank holds 52.00. Wheel under a faucet: speed 1.000, strength 2.000; in a level stream 0.317 and 0.633 (best work 0.0501). Pump with 1, 2, 3 batteries: 4.50, 9.47, 13.00 cells of water standing over it; 3 cells up after 94, 37, 24 ticks. Sealed full loop, 2 batteries: flow 0.049 a tick, wheel speed 0.156. Sand and iron dropped into a settled 12-deep shaft reach the bottom; a crate stays on top. Levelling (within 5% / 1%, ticks): the U-tube 7 / 9, tower and pipe 9 / 12, 22 cells of pipe 14 / 21; no arm turned back in any of them. Nozzle (second tick, fall ÷ head): 3 wide, 2 of pipe, 4.31 of 5.6 and 7.10 of 9.3; 8 of pipe 5.30 of 9.5; the wheel in the middle of the pipe 0.61 of 5.7.

### Pictures

`u-tube` (20 ticks), `water-tower` (8 ticks), `pump-uphill`, `hydro-dam` and `power-plant` changed and were looked at; `sand-in-water` and `well` came out the same file. `CACHE_NAME` stays `caleb-v8`.
