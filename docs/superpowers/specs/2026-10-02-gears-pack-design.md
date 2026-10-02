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
