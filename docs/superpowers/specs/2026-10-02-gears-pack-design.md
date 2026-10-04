# Block Playground Phase 4a: ⚙️ Spin (Gears) Pack — Design Spec

**Date:** 2026-10-02
**Status:** Draft, awaiting review
**Part of:** #5. Phase 4 is split: **4a spin** (this spec) and **4b lifting** (pulleys, rope and weights, plus load/effort, in a later spec).
**Builds on:** the phase 1–3 specs in this folder (engine and saves; circuits with `pushNow`; fluids).

## Purpose

Add a ⚙️ palette tab that teaches how spinning parts pass motion along:
- **Direction:** touching gears turn opposite ways. Three big gears in a triangle can't turn at all (a **jam**).
- **Speed:** a big gear driving a small one makes it spin faster, and small driving big makes it slower.
- **Energy changing form:**
  - a **water wheel** turns 💧 water into spin
  - a **motor** turns ⚡ into spin
  - a **generator** turns spin into ⚡
  - a **crank** is hand power

  A hydro dam (water → wheel → gears → generator → lamp) works, and a motor powered only by its own generator winds down (no perpetual motion).

### Success criteria

1. Turning a crank turns a train of gears, alternating directions, which you can see in the teeth.
2. A big gear driving a small gear makes the small one turn twice as fast (shown by its teeth stepping faster).
3. Three big gears in an L shape jam (red ❌, nothing turns). Two cranks turning opposite ways on one group also jam.
4. Crank → gears → generator wired to a lamp lights the lamp. Turning the crank the other way still lights it (the generator's + end swaps).
5. Battery → motor turns gears. Reversing the battery reverses them.
6. A water wheel with water flowing through it spins.
7. A motor and generator wired only to each other wind down to stopped.
8. The crank position is saved. Phases 1–3 are unchanged, and the README shows and explains every ⚙️ block.

### Decisions made during brainstorming

| Question | Decision |
|---|---|
| Scope | Phase 4 split: 4a spin (direction, speed, energy conversion) now; 4b lifting + load later |
| Big gear | One cell, 16 teeth (small gear: 8). No multi-cell blocks |
| Realism | Motion only: no effort/load (load comes in 4b) |
| Diagonals | Big gears also mesh diagonally with big gears, so a triangle can jam |
| Solver | A ratio walk over each connected group (approach A), not spreading over time or the circuit solver |

## Constraints

Same as phases 1–3:
- Vanilla JS, no dependencies.
- Heavy comments; a JSDoc docstring on every function; 🧪 on tweakables.
- Pure logic importable by `npm test`.
- New `js/` files go in `PRECACHE`, with `CACHE_NAME` bumped once.
- **README:** every palette block needs a picture and a README entry (`tests/readme.test.js`). Pictures are made with `tools/make-block-pictures.cjs`.

## Blocks (js/blocks/gears.js)

| Name | Palette | `spin` | Other | ✋ USE |
|---|---|---|---|---|
| `gearSmall` | ✓ | `{ kind: 'gear', teeth: 8 }` | — | — |
| `gearBig` | ✓ | `{ kind: 'gear', teeth: 16, diagonal: true }` | — | — |
| `axle` | ✓ | `{ kind: 'axle' }` | — | — |
| `crankStop` | ✓ | `{ kind: 'hub' }` | no source | → `crankCW` |
| `crankCW` | hidden | `{ kind: 'hub' }` | source: `+CRANK_SPEED` | → `crankCCW` |
| `crankCCW` | hidden | `{ kind: 'hub' }` | source: `−CRANK_SPEED` | → `crankStop` |
| `waterWheel` | ✓ | `{ kind: 'hub' }` | `fluid: { sides: 'all' }`, `wheel: true`; source: smoothed signed water flow × `WHEEL_GAIN`, or none below 0.05 | — |
| `motor` | ✓ | `{ kind: 'hub' }` | `part: { resistance: 1 }`; source: `level × MOTOR_SPEED × direction`, or none when level < 0.05 | — |
| `generator` | ✓ | `{ kind: 'hub' }` | `part: { resistance: 0.05, pushNow }`: push = `speed × GENERATOR_GAIN` (signed) | — |

**🧪 Values:**
- `CRANK_SPEED` 1 (turn per second)
- `MOTOR_SPEED` 1
- `WHEEL_GAIN` 20 (one faucet's 0.05/tick of water ≈ 1 turn per second)
- `GENERATOR_GAIN` 0.8

Speeds are **signed**: + is clockwise ↻.

**Motor direction:** the current through the motor, read from `signals.electric.cells.get(i).arms`. Current flowing **out** of its right end (facing sideways) or its top end (facing up-down) gives +; the opposite gives −.

**Water wheel direction:** water leaving the wheel cell downward or rightward counts +; upward or leftward counts −. It's smoothed over 8 ticks, like the turbine.

## Refinements made while prototyping (they override the details below)

1. **`circuit.partPush` rounds a `pushNow` value toward zero** (to 0.1), not to the nearest 0.1. With nearest rounding, a motor powered only by its own generator stuck at speed 0.2 (0.2 × 0.8 = 0.16 rounds back up to 0.2). Rounding toward zero lets it wind down. A 1e-9 nudge keeps 0.3 at 0.3.
2. **Gears are drawn 4× slower than their speed** (`DRAW_SLOWDOWN`). At 1 turn a second, an 8-tooth gear moves exactly one tooth per tick, so every frame looked the same, as if it had stopped.
3. **The crank shows turning with its knob color** (green turning, red stopped) instead of a ↻/↺ mark.
4. **The generator's "+" is drawn only while it turns.**
5. **The motor reads its direction from its own electric record** (`signals.electric.cells`: `axis` + `arms`).

## Engine additions

### Block fields (new, optional)
- **`spin`**, as above.
- **`spinSource(world, x, y) → number | null`**: the speed this block demands right now, or null if it isn't driving.

### js/spin.js (pure)

**`spinAxis(world, x, y, blockInfo) → 'h' | 'v'`:** for axles. It uses the auto-turn rule with **spin** neighbors (blocks with `spin`): both sides → h, both up and down → v, one side → h, one up or down → v, else h.

**Links**, built over every pair of neighboring spin blocks (each pair once):
- **gear ↔ gear, sharing a side:** a mesh. `ratio = −teethA / teethB` (b's speed = a's speed × ratio).
- **gear ↔ gear, diagonal neighbors:** a mesh only when **both** have `diagonal: true`.
- **gear or axle or hub ↔ hub, sharing a side:** a shaft, `ratio = +1`.
- **axle ↔ (gear | axle | hub), sharing a side:** a shaft (`+1`), but only if that side is along the axle's axis. For axle ↔ axle, both axles must point along it.
- **Hubs don't link to each other diagonally,** and nothing else links diagonally.

**`solveSpin(world, blockInfo) → { cells: Map<index, { speed, jammed, axis }>, turning }`:**
1. **Group the blocks.** Walk outward through links from each unvisited block (breadth-first), giving every block a `ratio` to the group's first block (that one gets 1).
2. **Look for jams.** For every link, if `ratio_b` isn't `ratio_a × link.ratio` (within 1e-9 relative), the group is **jammed**.
3. **Sources.** For each block with `spinSource` ≠ null, it demands the first block turn at `source / ratio`.
   - Demands of both signs: **jammed**.
   - Otherwise the first block's speed is the demand with the largest size (0 if there are none).
4. **Speeds.** Every block's speed = the first block's speed × its `ratio`. A jammed group is all 0, with `jammed: true`.
5. **`turning`** is true if any |speed| > 0.001.

### Gears pack system
`gearsSystem(world, blockInfo)`:
- solves, and stores `world.signals.spin = { cells, wheelFlow }`
- sets `world.animating` while turning
- returns false (no blocks moved)
- has a `refresh` that solves without updating the wheel flow, so `draw()` is never stale

### fluids.js
`stepFluids` also returns `waterOut: Map<index, signed amount>` for cells whose block has `wheel: true`: + for moves down or right, − for up or left. The gears pack smooths it into `wheelFlow`.

### Packs and circuit
- `PACKS = [basic, water, gears, electric]`.
- The generator uses the phase 3 `pushNow`: its value is rounded to 0.1 by `partPush`, and a negative push swaps the + end.
- The motor reads last tick's electric signals (a one-tick lag).

### Saves
Nothing new. The crank's position is in its block name.

## Drawing (each block's `drawSignals`)

The cell record comes from `signals.spin.cells`. `signalsAt` returns the first pack record holding the index, and packs refresh in `PACKS` order, so `signals.spin` comes before `signals.electric`. That means the motor and generator, which are also electric parts, get their **spin** record. That record therefore also carries `partAxis` (the electric facing, from `circuit.partAxis`) for those two, so their stubs and + end can be drawn.

**Small gear:**
- a gray body (radius 2.5 of 8 little pixels), a hub dot, and 8 teeth (1×1) around radius 3.5
- the teeth's angle steps by `floor(ticks × speed × 8 / 8) mod 8`, i.e. 8 positions per turn at 8 ticks a second (gears.js keeps its own `TICKS_PER_SECOND = 8` constant with a comment pointing at build.js)

**Big gear:**
- body radius 3.5, 16 teeth around radius 4, reaching the corners
- the same stepping: 16 positions, so a big gear at speed 0.5 looks half as fast as a small gear at speed 1

**Other blocks:**
- **Axle:** a rod along its axis, and a stripe whose offset steps with the angle.
- **Crank:** a handle at one of 4 positions, plus a little ↻ or ↺ mark while turning.
- **Water wheel:** a hub plus 4 paddles at one of 2 angles.
- **Motor:** a box with a shaft-end square at one of 4 positions.
- **Generator:** a box, a coil (stripes), and a "+" at its current + end. Like a battery, + is on top or right when it's pushing forward, and the opposite end when pushing backward. Electric stubs on its axis.
- **Jammed:** any spin block gets a red ❌ (two diagonal lines of 1×1 squares).
- **Palette** (no record): still, facing sideways.

## Error handling and edge cases

| Case | Behavior |
|---|---|
| A spin block touching no other | Still (speed 0), unless it's a source: a crank alone turns |
| L of three big gears | Jammed |
| Two sources, same direction | The fastest demand wins |
| Two sources, opposite directions | Jammed |
| Jammed group with a generator | Push 0 |
| Motor in a jammed group | Still a circuit part (current flows); no spin |
| Motor ↔ generator only | Winds down: 0.8 gain per loop, rounding stops it |
| Water near gears, axle, crank, motor, generator | Solid; water flows around. The wheel is open (`fluid.sides: 'all'`) |
| Old saves | Unknown names → air; `crank*` round-trip |

## Testing

- **`tests/spin.test.js`** (stand-in blocks with `spin` / `spinSource`):
  - **Meshing and ratios:** meshing flips direction; small → small keeps the speed; big → small ×2; small → big ×½.
  - **Axles:** keep the direction; they link only along their axis (a sideways axle doesn't link to a gear above it).
  - **Hubs:** link on all 4 sides.
  - **Diagonals:** big-big diagonal meshes; small-small and small-big diagonals don't.
  - **Jams:** an L of 3 big gears jams; a 2×2 square of small gears turns.
  - **Sources:** opposite sources jam; same-direction sources use the faster demand; no source means 0; a source in one group doesn't drive another.
- **`tests/gears.test.js`** (real blocks, `allSystems`):
  - ✋ crank cycle
  - crank + gear train speeds and directions
  - crank → generator → lamp level > 0.5 (both crank directions)
  - battery → motor → gear turns, and swapping the battery's side reverses it
  - motor ↔ generator only winds down to 0 within 40 ticks
  - faucet → water wheel spins
- **`tests/fluids.test.js`:** wheel `waterOut` signs (falling water through a wheel is +).
- **`tests/registry.test.js`:** pack order `['basic', 'water', 'gears', 'electric']`.
- **README:**
  - a ⚙️ table with every block (pictures from the tool)
  - "Machines to build": gear train, jam triangle, hydro dam
  - the extra pictures `crankCW`, `gearBig-jammed`
- **Browser check (Chromium iPad emulation):**
  - ✋ a crank in a gear train, and the gear pixels differ between frames
  - crank → generator → lamp lights
  - an L of big gears shows red
  - reload and check the crank still turns
  - no console errors

## Addendum 2026-10-04: generator fixes from the physics audit (issue #11)

These override refinement 1 and the "rounded to 0.1" line below.

- **`partPush` rounds a `pushNow` value toward zero to 0.01 V** (`PUSH_STEP`, via `roundPush`), not 0.1. With 0.1 steps a generator slower than 0.125 turns/s made no electricity at all while still being braked, and its lamp was up to 14% too dim. It is still rounded **toward zero**, never to nearest, so a self-powered motor still winds down (tested, also with two generators in series).
- **The generator remembers nothing.** `signals.spin.conducts` is gone: it only updated while the rounded push was ≥ 0.1 V, so a generator that had been short-circuited stayed stiff forever, even after the wire, the battery or the generator itself was replaced. Now `generatorDrag` reads only last tick's `signals.electric` record:
  - turning (rounded push > 0): drag = `GENERATOR_TORQUE` × (current out of its + end, counted only in the direction it pushes) ÷ rounded push × `GENERATOR_GAIN`. This uses the real current, so generators in series each feel the whole current.
  - stopped, or pushing less than one step: drag = `GENERATOR_TORQUE` × (`load` × `GENERATOR_GAIN` + |current| ÷ (`PUSH_STEP` ÷ `GENERATOR_GAIN`)). `load` is a new field on the electric record of parts marked `part.feelsLoad`: the current per volt the part would push if it alone pushed (one extra solve per generator, in `loadOn`). The second term means a current forced through a stopped generator by something else (a battery) holds it still unless the source is stronger than that current's push-back.
- **A shorted generator shows its current** (about 1.6 A for one crank: dots flow), and recovers the moment the wiring is fixed.
- **Efficiency** is 0.8 × (rounded push ÷ exact push)²: 0.75 to 0.8 in practice, never above 0.8. The README says "at most 8 tenths".
- **Known simplification:** a generator is never a motor. Current pushed backwards through a turning generator by a battery would help turn a real one; here it gives no help (and no push-back). A battery wired straight across a generator holds it almost still.

## Addendum 2026-10-04: a water wheel's strength comes from the fall (issue #17)

Before: speed = flow × `WHEEL_GAIN`, strength = |flow| × 40, for any water passing through, in any direction, and nothing was taken from the water. N wheels on one stream gave N times the power, and a pump-fed loop of 3 wheels ran forever.

Now (`wheelSource`):

- **top speed** = smoothed flow × `WHEEL_GAIN` (20), as before: one faucet = 1 turn/s. More water = faster.
- **strength** = `4 × DROP_POWER × work ÷ |top speed|`, where `work` is the smoothed `waterWork` for that wheel (the energy the water gave up at it; see the fluids spec addendum). That equals `WHEEL_STRENGTH` (= 4 × `DROP_POWER` ÷ `WHEEL_GAIN` = 2, one crank) for each cell the water falls at the wheel.
- So the most work a wheel can do (half strength × half top speed) is exactly `DROP_POWER × work`: what the water gave up, never more (tested).
- `world.signals.spin` gains `wheelWork` beside `wheelFlow` (same 8-tick smoothing).

What that means in the playground:

| Wheel | Strength |
|---|---|
| faucet right above, drain right below (1 cell of fall) | 2 (a crank) |
| water falls onto it from the cell above and off it below (the hydro-dam machine) | about 4 |
| in a level stream (undershot) | turns at full speed with no load, strength about 0.15 |
| N wheels stacked under a faucet | each about 2: a taller fall really has more energy |
| in still water, or water split evenly left and right | none |

A single wheel only catches the fall at the wheel (the cells either side of it); water that fell further before reaching it has already splashed its energy away. That under-counts a real tall overshot wheel, but never over-counts.

`tests/gears.test.js` builds real loops (the issue's 3- and 5-wheel channel loop, level pipe rings with 3–6 wheels geared ×2, ×4 and ÷2, and tall loops with 3–6 stacked wheels in the down leg) and checks each one runs with its batteries and stops without them, with water conserved.

## Addendum 2026-10-04: an axle at the end of a shaft stays in line with the shaft (issue #28)

`spinAxis` put "one side → h" before "one up or down → v". So a gear placed beside the top axle of an upright shaft swung that axle sideways: it let go of the axle under it and the shaft was cut (top axle speed 0, the rest still 1).

Added rule, only for an axle with exactly one spin neighbor on each line: each neighbor scores 2 if it is shaft (a hub, or an axle that could point back: not one forced to face across by neighbors on both of its other sides), 1 if it is a gear, 0 otherwise. The axle faces `v` only if its up/down score beats its sideways score; a tie stays `h` as before. The both-sides and both-ends cases, and pipes and wires, are untouched. A gear beside a shaft's end therefore simply doesn't connect.

## Addendum 2026-10-04: the drawn angle is added up, and one tooth is marked (issue #22)

- **Added-up angle.** `turned()` used `ticks × speed ÷ 32`, so any change of speed moved every gear by `ticks × Δspeed ÷ 32` turns at once: a wheel running down looked like it whirled about, even backwards. Each spin record now has `angle` (turns so far, kept modulo `DRAW_SLOWDOWN`). `gearsSystem` adds `speed ÷ TICKS_PER_SECOND` to it each tick; `refreshSpin` carries it over without adding (a redraw still never moves the gears). `turned(cell)` reads `angle ÷ DRAW_SLOWDOWN` and no longer takes the clock. Angles are kept per cell, so a newly placed gear starts at 0 and a stopped gear stays where it stopped. Meshed gears keep step with each other because each gets its own ratio's share every tick.
- **Marked tooth.** Tooth 0 of every gear is yellow (`MARK`), with a small dot halfway to the middle; the water wheel has one yellow paddle tip that steps through 8 positions. The plain teeth still alias (a small gear at speed 2 shows two alternating frames, at speed 4 the same frame every tick), but the mark moves `speed ÷ 32` of a turn per tick, which reads the right way round up to 16 turns/s. `DRAW_SLOWDOWN` is unchanged.


## Addendum 2026-10-04 (later): a hub or loose axle beside a shaft's end doesn't cut it either (issue #28 review)

The score above tied at 2–2 when the block beside the end was a hub (winch, generator, motor, stopped crank, water wheel) or a loose axle, and the tie went to `h`: the shaft was still cut (top axle 1 → 0). An axle neighbor that can point back AND has another spin block behind it (a shaft that goes on) now scores 3. Hub against hub (an axle between a crank below and a winch beside) still ties and stays `h`, the pipe rule: there is no shaft there to tell which line is meant.

## Addendum 2026-10-04 (later): a generator feels this tick's wiring (issue #17 review, clicker loophole)

Systems run water → gears → lift → electric, and `generatorDrag` read the electric record from the END of the last tick. While a clicker (or switch) was open the generator had no drag and free-wheeled at its source's top speed; on the tick the clicker closed, the circuit was solved with that free-wheel speed, so one tick of full-voltage current flowed that no torque had been charged for. Lamps got up to 63× the crank's work, and a level pump/wheel ring geared ×32 ran forever on 20 A pulses with no battery.

- `gearsSystem` (and `refreshSpin`) now call `refreshElectric` first. It only re-solves when the circuit key changed (blocks, clicker beat, pushes), so on the closing tick the generator's drag comes from the closed circuit, the group slows at once, and `electricSystem` then solves with the loaded speed.
- Result: lamp ÷ crank work is the same with and without a clicker (0.49–0.75); the ×32 and ×64 clicker rings and tall loops stop without their batteries.
- Still true: the pump and motors read the electricity of the tick before (water runs first). That lag is the same on the closing and the opening tick, and the current they read was paid for.

## Addendum 2026-10-04 (later): a generator with a battery in its loop has ONE answer (issue #11 review; part of #14)

`generatorDrag` had two branches (turning: real current ÷ push; stopped: load plus `|current| ÷ slowest`). With a battery straight across the generator they disagreed: a crank present from the start ran free at 1.0 (1.887 A), the same crank started later was clamped at 0.003 (9.434 A, sparking) for ever.

The law is now written once, without branches. The current through a generator is `forced + load × GENERATOR_GAIN × speed`, where `load` is `loadOn` (current per volt of its own push) and `forced` is what the other pushers put through it (real current minus `load ×` the rounded push the circuit was solved with). It pushes back `GENERATOR_TORQUE × current`, but only while that works against the turning (while it is really generating).

- `forced` = 0 (the usual case): a plain `spinDrag` of `GENERATOR_TORQUE × load × GENERATOR_GAIN`, as before.
- `forced` ≠ 0: a new block field `spinBrake` → `{pull, perTurn}`. `balance` in `spin.js` takes brakes alongside loads: a brake pushes back `pull + perTurn × speed` only while `(pull + perTurn × speed) × speed > 0`; its edges are 0 and `−pull ÷ perTurn`. The total push is still non-increasing in speed, so the stretch-by-stretch search still finds the one root. A group held at 0 by a brake is `stalled`.
- Result: `.R./WEW/W.W/WBW` is 1.000 turn/s, 1.887 A, no spark, and `.Q.` is 0 turn/s, 9.434 A, spark, in every build order.
- **Not done (issue #14): motoring.** In the free stretch a real machine is a motor (torque with the turning). Trying it (`spinSource` of strength `GAIN² ÷ TORQUE × |forced|`, top speed `−forced ÷ (load × GAIN)`, with the brake carrying the rest) worked and was order-independent, but a free generator in series with a battery then spins up until no current flows, which starves the pump in every battery-in-series loop the perpetual-motion tests use, and needs its own energy audit of generator-to-generator rings. Left for #14; the guide and README now say a generator is not a motor here.

## Addendum 2026-10-04 (later): the water wheel's speed and strength the right way round (issues #17 and #18 review)

The first #17 fix set `speed = flow × WHEEL_GAIN` and `strength = 4 × DROP_POWER × work ÷ |speed|`. The power bound was right, but the split was backwards (more water made a wheel faster, not stronger: three faucets could not lift what one could not), `speed` used the signed NET outflow so a nearly balanced spill divided full work by a tiny speed (strength 4.6 from one faucet on a lopsided ledge, unbounded near the cut-off), and the sign rule (down or right = +) made a mirrored wheel turn at a different speed (0.926 vs −0.770).

Now, from the smoothed per-wheel counts `{lean, sideOut, down, gross, work}` (see the fluids spec):

- `fall = work ÷ gross` (cells fallen per unit of water), `water = min(gross, |turn|)` where `turn = wheelTurn(...)`.
- `speed = ±WHEEL_SPEED × √fall` (WHEEL_SPEED = 1), `strength = WHEEL_STRENGTH × water × √fall` (WHEEL_STRENGTH = 4 × DROP_POWER ÷ WHEEL_SPEED = 40). `WHEEL_GAIN` is gone.
- Best work = strength × speed ÷ 4 = DROP_POWER × work × (water ÷ gross) ≤ DROP_POWER × work: the same ledger as before.
- One faucet, one cell: speed 1, strength 2 (a crank). Three faucets: speed 1, strength 6. One faucet falling 4 cells: speed 2, strength 4; 9 cells: 3 and 6. Level stream: about 0.28 and 0.56 (best work 0.04).
- Water leaving both sides cancels: a symmetric ledge gives no source; a lopsided one is weaker than a one-sided one, never stronger.
- Direction (`wheelTurn`): sideways outflow right is ↻, left is ↺; downward outflow takes the sign of the sideways lean (in and out); with no sideways water at all, down is ↻. So mirrored builds turn at equal and opposite speeds. The one case that cannot be opposite is water falling dead straight through (its mirror image is itself): that stays ↻.
- Known jump: because of that default, a tiny sideways lean decides the sign of a big straight-down flow.
