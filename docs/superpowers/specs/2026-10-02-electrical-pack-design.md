# Block Playground Phase 2: ⚡ Electrical Pack — Design Spec

**Date:** 2026-10-02
**Status:** Draft, awaiting review
**Closes:** #3
**Builds on:** `docs/superpowers/specs/2026-10-02-block-playground-design.md` (phase 1: engine, packs, systems)

## Purpose

Add a ⚡ palette tab to the Build page that teaches **real circuits**:
- current only flows around a complete loop from a battery's + end back to its − end
- lamps share current (series is dim, parallel is bright)
- a battery wired straight back to itself is a dangerous short circuit

Little dots flow along the wires so Caleb can *see* current going around the loop. Switches, a buzzer, a self-flipping clicker and wired note blocks turn circuits into toys and a small music machine.

### Success criteria

1. A battery + wire + lamp loop lights the lamp, and opening a switch in the loop darkens it.
2. Two lamps in series are visibly dimmer than one; two in parallel are each as bright as one; two batteries in series make a lamp brighter.
3. Wiring + straight to − (no lamp) makes the battery spark. Fixing the wiring stops it. Nothing breaks permanently.
4. Dots move along every wire carrying current, in the direction + → −, faster when more current flows.
5. Note blocks in a circuit play when current starts flowing. A clicker in the loop plays them on a beat.
6. Wood, glass, stone, dirt and grass don't conduct; wire and gold do.
7. Phase 1 behavior is unchanged: saves, falling sand, ✋ note blocks, the three worlds.

### Decisions made during brainstorming

| Question | Decision |
|---|---|
| Model | Real closed-loop circuits, not one-way "power spreads" |
| Realism | Brightness from current (series/parallel, battery count), plus short circuits that spark |
| Blocks | Battery, wire, switch, lamp, buzzer, clicker; note blocks become loads; gold conducts, other blocks insulate |
| Part direction | Auto-turn to face the neighboring wires; metal stubs show which way |
| Solver | Every electric cell is a point in a nodal-analysis solve (approach A) |
| Current picture | Flowing dots along wires |

## Constraints

Same as phase 1:
- Vanilla JS, no build step, no dependencies.
- Heavy comments; a JSDoc docstring on every function (`tests/docs.test.js`); 🧪 "Try this!" comments on tweakable values.
- Pure logic importable by `npm test`.
- Everything new is added to `PRECACHE` in `sw.js`, with `CACHE_NAME` bumped.

## Blocks (js/blocks/electric.js unless noted)

| Name | Palette | Electric role | Notes |
|---|---|---|---|
| `battery` | ✓ | part: push 1, resistance 0.05 | + end is **top** (facing up-down) or **right** (facing sideways) |
| `wire` | ✓ | conductor | connects on all 4 sides |
| `switchOpen` | ✓ | gap: no connection | ✋ USE → `switchClosed` |
| `switchClosed` | hidden | part: resistance 0.001 | ✋ USE → `switchOpen` |
| `lamp` | ✓ | part: resistance 1 | glows by current |
| `buzzer` | ✓ | part: resistance 1 | hums by current |
| `clicker` | ✓ | part: resistance 0.001 on the on beat, gap on the off beat | on when `Math.floor(world.ticks / CLICKER_TICKS) % 2 === 0`; 🧪 `CLICKER_TICKS = 8` (1 s at 8 ticks/s) |
| `gold` (basic.js) | already | conductor | gets `conducts: true` |
| `noteC`…`noteB` (basic.js) | already | part: resistance 1 | play their note when current starts; ✋ USE unchanged |

Every block not listed is an insulator.

## Engine additions

### world.js
- `createWorld` also sets three fields:
  - `ticks: 0`
  - `signals: {}`: per-pack, per-cell display data, **never saved**
  - `events: []`: things for the page to do, like sounds
- `defaultWorld` and `deserializeWorld` get them through `createWorld`.
- `tick()` adds 1 to `world.ticks` before running the systems, and still returns "did any block change".
- `world.animating` (boolean) is set by systems when the screen must be redrawn even though no block changed (moving dots, a new solve).
  - `build.js` resets it to false before each tick.
  - After the tick, `build.js` calls `worldChanged()` (redraw + save) if blocks changed, otherwise just `draw()` if `animating` is set.
  - This keeps a lit lamp from resetting the save timer forever.

### Block definition fields (new, all optional)
- **`conducts: true`:** a conductor that faces all 4 sides.
- **`part: { resistance, push }`:** a two-ended part. `push` is in volts and defaults to 0.
- **`partWhen(world): boolean`:** for blocks that are only sometimes a part. Clicker: true on the on beat.
- **`electric: true`:** counts as electric for auto-turn even when it isn't a point right now. Example: `switchOpen`. Blocks with `conducts`, `part` or `partWhen` count automatically.
- **`bare: true`:** `drawBlock` paints no square for it, leaving the sky behind it (wire). Its `drawSignals` draws the whole look. With no signals, as in the palette, it draws a plain sideways wire.
- **`hidden: true`:** not shown in the palette. `blocksInPack` skips it, and `isKnownBlock` still knows it.
- **`drawSignals(ctx, info, left, top, size, cell, ticks)`:** draws over the block using its cell's signals.
- **`use(ctx)` now returns a boolean**, "did I change the world?". `build.js` calls `worldChanged()` when it's true, so a flipped switch is saved. Note blocks return false.

### Packs
`PACKS = [basic, electric]`: the electric system runs after falling blocks. The ⚡ tab is labeled **POWER**.

A pack may also export `refresh(world, blockInfo)`. `registry.refreshSignals(world)` runs every pack's `refresh`, and `build.js` calls it at the start of `draw()`, so signals are never stale between ticks (for example, right after a wire is placed). The electric `refresh` re-solves only when the circuit key changed. *(Added while planning.)*

### Sound (js/sound.js)
`setHum(level)` keeps one shared buzzer tone (🧪 square wave, about 220 Hz):
- `level` 0 stops it.
- 0–2 sets its volume, smoothly.
- It never creates an AudioContext before the first unlocking tap; until then it does nothing.

`build.js` calls `setHum(world.signals.electric?.hum ?? 0)` after every tick, and `setHum(0)` when the page is hidden.

### Events
- Systems push `{ type: 'note', midi, x, y }` to `world.events`.
- After each tick, `build.js` takes every event out of the list:
  - each `note` event is played with `playTones([midi])`, and its cell flashes
  - unknown event types are ignored

## The circuit (js/circuit.js, pure)

### 1. Points
Every cell whose block conducts, or is a part right now (`part`, or `partWhen(world)` true), is a point. Open switches and off-beat clickers are not points: they're gaps.

### 2. Auto-turn
A part's direction is decided from its 4 neighbors, counting any **electric** block. Electric blocks are conductors, parts, and blocks with `partWhen` or a `part` sibling such as `switchOpen` (`electric: true` flag). Counting those means flipping a switch never re-turns its neighbors. In order:
1. electric on both left and right → **sideways**
2. else electric on both up and down → **up-down**
3. else electric on left or right → **sideways**
4. else electric on up or down → **up-down**
5. else **sideways**

### 3. Connections
Two side-by-side cells are connected if both are points and both face that side. Conductors face all 4 sides; parts face only their two ends.

Each connection is a resistor:
- resistance = half of each cell's resistance (wire and gold: 0.0005 each half; a part: `resistance / 2`)
- push = half of each battery's push on that side, pointing toward the battery's + end

### 4. Solve
- Split the points into separate circuits (connected groups). A circuit with no battery has zero current everywhere.
- For the others, use nodal analysis:
  - each connection becomes conductance `g = 1/R` plus a source current `g × push`
  - fix one point at 0 volts
  - solve `G·v = I` by Gaussian elimination with partial pivoting
  - each connection's current = `g × (v_a − v_b + push_ab)`
- If the solve fails (a zero pivot, or a non-finite number), that circuit gets zero current and a `console.warn`. It never crashes.

### 5. Results: `world.signals.electric`
- **`cells[i]`** for every electric cell:
  - `faces` (which of up/right/down/left it connects to)
  - `arms`: signed current per connected side, positive = flowing **out** that side
  - `level`: for a part, |current through it| ÷ `REFERENCE_CURRENT`, capped at 2
  - `spark` (battery only)
- **`REFERENCE_CURRENT`** = `1 / (1 + 0.05)`, the current of one lamp on one battery, so that lamp shows level 1.
- **Short circuit:** a battery sparks (`spark: true`) when both of these are true:
  - **By shape:** its + neighbor and − neighbor are linked by a path of only plain-wire points: conductors, parts with resistance ≤ 0.01 (closed switches, on-beat clickers), and other batteries.
  - **By current:** more than 2 × `REFERENCE_CURRENT` flows through it.

  So two batteries wired straight to each other spark, but two batteries pushing against each other (no current) don't. The solver still runs, so a short naturally steals current from anything in parallel. *(Refined while planning: the original shape-only rule missed shorted battery stacks.)*
- **`hum`** = the highest `level` of any buzzer (0 if none).
- **Note events:** a note block whose level rises above 🧪 `NOTE_ON_LEVEL = 0.25` this solve, and wasn't above it last solve (kept in `signals.electric.wasOn`), pushes a `note` event.

### 6. When to solve
- The system keeps a key: the cells joined into one string, plus the clicker beat. It re-solves only when the key changes.
- Every tick where any current flows or any battery sparks, it sets `world.animating = true` so the dots move. A tick that re-solves also sets it, so lamps that just went dark get redrawn.

## Drawing (block-art.js + pack `drawSignals`)

- **`drawWorld(ctx, world, size, blockInfo, sky)` keeps its signature.** It reads `world.signals` and `world.ticks` itself. Each cell is drawn by the new `drawCell(ctx, info, left, top, size, cell, ticks)`, which draws the block and then calls `info.drawSignals(...)` if the block has one. `cell` is the first `world.signals[*].cells.get(index)`, or `undefined`. The palette uses `drawCell` with `undefined`. *(Refined while planning.)*
- **Wire:**
  - the base is the sky, plus a copper arm from the center toward each side in `faces` (a lone wire is a dot)
  - idle `#7a4a1e`, carrying current `#e08a3c`
  - **Dots:** small yellow squares on each arm with current.
    - Position = `(ticks × speed) mod 1` along the arm, moving out of the cell when `arm > 0` and into it when `arm < 0`.
    - 🧪 speed = clamp(|current| × 0.25, 0.05, 0.5) cells per tick.
    - Because the dots on two neighboring cells share the same phase, they read as one continuous stream.
- **Gold:** the normal gold block, plus the same dots when it carries current.
- **Parts:** two small gray metal stubs on the faced ends.
- **Lamp:**
  - dark: a gray bulb
  - lit: a yellow bulb `#ffe066` plus a translucent glow square whose size grows with `level`
- **Battery:**
  - a red top half and a black bottom half (turned when sideways), with a "+" on the + end
  - when `spark`: a few yellow/white zig-zag lines and a gray puff that flicker on alternate ticks
- **Switch:** a lever. Open is tilted up with a gap; closed is flat across the ends.
- **Buzzer:** a dark grill. While humming (`level > 0`), its lines shift by one pixel on alternate ticks.
- **Clicker:** a clock face with a hand at one of 4 positions from `world.ticks`, and a green dot on the on beat.
- **Palette swatches** draw parts facing sideways with no signals.

## Error handling and edge cases

| Case | Behavior |
|---|---|
| No battery in a circuit | No current; wires idle, lamps dark |
| Batteries facing against each other in one loop | Pushes cancel, so ~0 current (real behavior) |
| Lamp touching a wire on one side only | Not a loop, so no current |
| Short via a long wire | Detected by shape: sparks |
| Short in parallel with a lamp | Spark; the lamp gets ≈0 current |
| Battery sideways next to a vertical wire | Auto-turn rule 3/4 picks the side with wires; stubs show it |
| Solve fails | That circuit has zero current, plus `console.warn`; no crash |
| Full screen of wire (336 points) | Solved only when blocks or the beat change; ≤ ~10 ms |
| Old/older-page saves | Unknown names → air (existing rule); `switchClosed` round-trips |
| Page hidden | Ticks stop (existing); hum set to 0 |

## Testing

- **`tests/circuit.test.js`:**
  - **Auto-turn:** all five rules; an open switch still counts for its neighbors.
  - **Loops:**
    - no loop → 0
    - battery + lamp loop → lamp level 1 (±0.02)
    - 2 lamps in series → 0.5 each
    - 2 in parallel → ≈1 each
    - 2 batteries in series → about 2 (> 1.8: the batteries' own resistance takes a little)
    - opposing batteries → ≈0
  - **Switches and clicker:** open switch → 0, closed → 1; clicker on its on and off beats.
  - **Shorts:** a short is detected, including a 20-cell shorting wire; a lamp in parallel with a short gets ≈0; two batteries wired straight to each other spark; two pushing against each other do not.
  - **Direction:** current leaves the battery's + end (positive `arms` on the + side).
  - **Conductors:** wood/stone between wires blocks the loop; gold in place of wire works.
  - A failed solve returns zero currents without throwing (a forced bad matrix).
- **`tests/electric.test.js`:**
  - switch ✋ toggles open ↔ closed and returns true
  - clicker beat from `ticks`
  - a note event fires once per off → on change and not again while it stays on
  - `hum` = the highest buzzer level
  - re-solve only when the key changes (count solves)
  - `animating` set when current flows
  - `switchClosed` is hidden from the palette but known
- **`tests/world.test.js`:** `ticks` counts up, and `signals`/`events` exist on new, default and loaded worlds.
- **`tests/block-art.test.js`:** `drawWorld` calls `drawSignals` with the cell's signals; a wire draws arms only toward the sides it faces.
- **Updated:** `modules.test.js`, `registry.test.js` (hidden blocks, the electric pack), `sw.test.js` (PRECACHE, already generic).
- **Browser check (Chromium, iPad emulation):**
  - Build a battery + 3 wires + lamp loop and check the lamp cell's center pixel is yellow.
  - Flip a switch in the loop with ✋ and check it's dark; reload and check the switch is still open.
  - Build a short and look at the sparks in a screenshot.
  - Check the dots move: compare two screenshots of a wire cell a few ticks apart.
  - No console errors.

## Addenda 2026-10-04: fixes from the physics audit

### Generators (issue #11)
- A changing push (`part.pushNow`) is rounded toward zero to 0.01 V (`PUSH_STEP`), not 0.1.
- New optional part field `feelsLoad`: such a part's record gets `load`, the current per volt it would push if it alone pushed (`loadOn` in circuit.js). The generator uses it to know how hard its lamps make it to turn before it has started turning. Details in the gears spec addendum.
