# Block Playground (Phase 1: Engine + Basic Blocks) — Design Spec

**Date:** 2026-10-02
**Status:** Draft, awaiting review
**Closes:** #1 (make "building with blocks" clickable)

## Purpose

A side-view, Minecraft-*inspired* block playground for Caleb (almost 5) on
`calebhamsa.fun`. He places and digs blocks in one shared world. Over several
phases, themed block packs (electrical, fluids, mechanical) are added as palette
tabs to the **same world**, so he can discover cross-section chains such as
water → turbine → lamp. Chemistry will be its own room.

This spec covers **Phase 1 only**: the engine every later pack plugs into, plus
the basic ⛏️ blocks. Later phases each get their own spec.

### Success criteria

1. Caleb can build, dig, and play note blocks by himself on an iPad: big targets, no reading needed.
2. Sand visibly falls, which proves the tick loop that later packs (water, power, gears) depend on.
3. His builds survive closing the iPad (autosave), and he can keep 3 favorites in save slots.
4. A later pack (e.g. electrical) can be added by writing one new pack file and registering it. No changes to `world.js`.
5. The project conventions hold: vanilla JS, heavy comments, JSDoc on every function, pure logic covered by `npm test`, works offline.

### Decisions made during brainstorming

| Question | Decision |
|---|---|
| View | Side view with gravity (like Minecraft), not top-down |
| Sections | One shared world, with palette tabs per section (chemistry is a separate room later) |
| World size | One screen, 24 × 14, no scrolling |
| Saving | Autosave + 3 save slots with thumbnails + 🗑️ new world + 📷 save picture |
| Basic blocks | Plain blocks float; **sand falls**; **note blocks sing** |
| Interaction | Three tools: 🧱 Build, ⛏️ Dig, ✋ Use |
| Engine | Canvas rendering + block packs + whole-world systems (approach A) |

## Constraints

- Vanilla HTML/CSS/JS, ES modules, no build step, no dependencies.
- Blocky look in our own art: no Mojang textures, names, or logos.
- Header comment on every file, JSDoc on every function (`tests/docs.test.js`), 🧪 "Try this!" comments on tweakable values.
- Page code touches the DOM only inside `init…()` functions, so modules import cleanly in Node tests.

## Architecture

### Files

```
build.html              the page: canvas, toolbar, tabs, palette, slots
js/world.js     (pure)  the grid: get/set, inBounds, neighbors, tick(), defaultWorld()
js/blocks/registry.js   list of packs (in tick order) + shared signal names
js/blocks/basic.js      ⛏️ pack: grass, dirt, stone, wood, glass, obsidian,
                        gold, sand (falls), note blocks C D E F G A B
js/saves.js     (pure)  serialize/deserialize + autosave/slot storage
js/sound.js             shared audio, moved out of music.js
js/build.js             the screen: drawing, pointer, tools, tabs, tick timer,
                        autosave timing, slots, 📷
```

### world.js (pure, never changes when packs are added)

- A world is `{ width, height, cells }`. `cells` is a flat array of block names (`'air'` for empty), indexed `y * width + x`, with **y = 0 at the top**.
- Functions: `createWorld(width, height)`, `defaultWorld()` (sky; a grass row, then a dirt row, then stone down to the bottom; 🧪 tweakable heights), `inBounds`, `getBlock`, `setBlock` (out-of-bounds get returns `'stone'` so the floor and walls act solid; out-of-bounds set does nothing), `neighbors`.
- `tick(world, systems)` runs each system in order. Each system is `(world, registry) => boolean` ("did I change anything?"), and `tick` returns true if any system did.
- It knows nothing about what block names mean.

### Block packs

Each pack file default-exports:

```js
{
  tab: { id: 'basic', icon: '⛏️', label: 'Blocks' },
  blocks: {
    sand:  { color: '#e3d38f', falls: true },
    noteC: { color: '#e74c3c', label: 'C', midi: 60, use: (ctx) => ctx.playNote(60) },
    // ...
  },
  systems: [fallingBlocks],
}
```

- **Block definition fields (Phase 1):**
  - `color` (base color for the pixel texture)
  - `label?` (letter drawn on the block)
  - `falls?` (gravity)
  - `use?(ctx)`, where `ctx = { world, x, y, playNote, flash }`
- Later packs add fields (e.g. `conducts`) without changing the fields above.
- `registry.js` exports `PACKS` (an ordered array; the fixed tick order for later phases is basic → water → mechanical → electric), `blockInfo(name)`, and `SIGNALS` (`POWER`, `SPIN`), reserved for phases 2–4 and unused now.
- Block names are unique across all packs. A test enforces this.

### Systems

- **Systems** are whole-world rules that run every tick. This is why the engine can handle both local rules (sand, water) and connected-network rules (electric circuits, gear trains), which per-block code can't do cleanly.
- **`fallingBlocks`** (in `basic.js`):
  - Scan rows **bottom-up**. Any `falls` block with air directly below it moves down one cell.
  - Scanning bottom-up means a stacked column of sand falls together, one row per tick, and never passes through itself.
  - The world floor counts as solid.

### Tick loop (in build.js)

- `setInterval` at 🧪 `TICKS_PER_SECOND = 8`. Each tick runs `tick(world, allSystems)`, and the canvas is redrawn only if something changed.
- The loop pauses when the page is hidden (`visibilitychange`).

### sound.js (refactor)

- Move the Web Audio setup and the iOS first-tap unlock out of `music.js` into `js/sound.js`. Exports: `getAudio()`, `unlockAudio()`, `playNote(midi, …)`.
- `music.js` imports them. Its behavior is unchanged, and the existing keyboard tests must stay green.

## Screen and interaction

```
┌──────────────────────────────────────────────┐
│ 🏠                BUILD           💾1 💾2 💾3 │
├──────────────────────────────────────────────┤
│              24 × 14 world (canvas)           │
├──────────────────────────────────────────────┤
│ [🧱 BUILD] [⛏️ DIG] [✋ USE]    [📷] [🗑️]     │
│ [⛏️ Blocks]   ← tabs (one tab in Phase 1)     │
│ ▦ ▦ ▦ ▦ ▦ ▦ ▦ ▦ ▦ ▦ ▦ ▦ ▦ ▦ ▦                │
└──────────────────────────────────────────────┘
```

- **Canvas sizing:**
  - It grows to the largest size that fits, with square cells (about 40px on an iPad in landscape).
  - In portrait it's smaller but still usable.
  - It's drawn at `devicePixelRatio` so it's sharp on Retina.
- **Look:**
  - Each block is its `color` plus a fixed darker speckle pattern, drawn the same way every time so it doesn't flicker.
  - Glass is mostly see-through with a frame.
  - Note blocks draw their letter. Air is sky blue.
- **🧱 Build:**
  - Tap or drag places the selected block. Placing on an existing block swaps it.
  - Drag uses `cellsAlongLine()` from `draw.js` so fast swipes don't skip cells.
- **⛏️ Dig:** tap or drag turns cells into air.
- **✋ Use:**
  - Tapping calls the block's `use`. Blocks without `use` give a small shake.
  - Note blocks play their note (C4–B4) and flash.
- **Selecting a palette block** switches to 🧱 Build automatically.
- **One finger only:** only the first active pointer paints; extra touches are ignored (resting palms).
- **💾 Slots:**
  - An empty slot saves the current world into it.
  - A filled slot shows a thumbnail. Tapping it asks "swap worlds?", autosaves the current world, then loads the slot.
  - A small ✕ on a filled slot clears it after "are you sure?".
- **📷:** saves a `caleb-build-YYYY-MM-DD.png` of the canvas, the same way as the Draw page (`filenameForDate`-style helper).
- **🗑️ New world:** after "are you sure?", resets to `defaultWorld()`.
- **Homepage:**
  - "building with blocks" becomes a link to `build.html`.
  - A 4th big BUILD block is added beside MUSIC / DRAW / WRITE.
- **Offline:** add the new files to `PRECACHE` in `sw.js` and bump `CACHE_NAME`.

## Saving

**Format** (`saves.js`):

```json
{ "version": 1, "width": 24, "height": 14,
  "blocks": ["air", "grass", "dirt", "sand"],
  "cells": [0, 0, 0, 1, 1, 2, 2] }
```

- `blocks` is a per-save list of names. `cells` stores indexes into it, which keeps a world to a few KB.
- **Storage keys:** `build-autosave`, `build-slot-1` … `build-slot-3`. Each slot also stores a thumbnail data URL (about 96×56).
- **Storage access:** every storage call takes a `storage` argument, so tests pass a fake (same pattern as `loadBest`/`saveBest` in `music.js`).
- **Autosave timing:** 🧪 1 second after the last change (debounced), and on `pagehide` / `visibilitychange` to hidden.

### Error handling

| Problem | Behavior |
|---|---|
| Storage throws or is full (private browsing) | Keep playing; show a small "can't save here" badge; never crash |
| Corrupt or unreadable save | Ignore it, `console.warn`, start `defaultWorld()` |
| Unknown block name in a save | That cell becomes air |
| Save of a different size | Align bottom-left: crop or pad with air, so the ground stays on the ground |
| `version` newer than the code understands | Treat as unreadable (above) |
| Audio not unlocked yet (iOS) | First tap anywhere unlocks it (shared `unlockAudio`) |

## Testing

- **`tests/world.test.js`:**
  - create/get/set
  - out-of-bounds reads as solid and out-of-bounds writes are ignored
  - neighbors
  - `tick` runs systems in order and returns "changed"
  - `defaultWorld` layout
- **`tests/basic.test.js`:**
  - sand falls one cell per tick and stops on solid blocks and the floor
  - a stacked sand column falls together
  - non-falling blocks float
  - note blocks map to MIDI 60, 62, 64, 65, 67, 69, 71
- **`tests/registry.test.js`:**
  - block names are unique across packs
  - every block has a `color`
  - every pack has a tab
- **`tests/saves.test.js`:**
  - round trip
  - corrupt JSON
  - unknown blocks
  - size mismatch (bottom-left alignment)
  - future version
  - storage that throws
  - slot save/load/clear
- **Updated:**
  - `modules.test.js` (new modules)
  - `pages.test.js` (`build.html`, homepage link and button)
  - `sw.test.js` (PRECACHE has the new files)
  - existing music/keyboard tests stay green after the `sound.js` move
- **Real-browser check:**
  - Headless Playwright (borrowed from `~/LFG/scripts/share_card/node_modules`).
  - Load `build.html`, place, drag-paint, dig, drop sand and watch it land, reload, and confirm autosave restored it.
  - Take a screenshot to review.

## Roadmap (separate specs, not in this phase)

1. ⛏️ **Engine + basic blocks:** this spec (#1)
2. ⚡ **Electrical:** battery, wire, switch, lamp; wired note blocks → music machine (#3)
3. 💧 **Fluids:** water, pipes, valve, heater/chiller, steam, turbine (makes ⚡) (#4)
4. ⚙️ **Mechanical:** gears, axles, pulleys, water wheel (🔄 spin ↔ ⚡) (#5)
5. 🧪 **Chemistry room:** atoms, bonds, molecules, unlockable elements (#6)

## Out of scope for Phase 1

Scrolling or bigger worlds, undo, sharing builds, any phase 2–5 blocks, and sound effects other than note blocks.
