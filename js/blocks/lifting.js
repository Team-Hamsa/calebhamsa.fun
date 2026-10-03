/**
 * lifting.js — the 🏗️ Lifting pack: a winch, rope, pulleys, a crate and
 * an iron weight. It teaches LOAD and EFFORT:
 *
 *    crank → winch → rope → crate          ✓ lifts it (weight 1)
 *    crank → winch → rope → iron weight    ✗ too heavy (weight 4): it STALLS
 *    crank → small gear → BIG gear → ...   slower, but stronger: ✓
 *
 * A winch turning slower is stronger, so gearing it down lets the same
 * crank lift more. You trade speed for strength. A pulley hook does the
 * same: two bits of rope share the load, so it counts half as heavy, but
 * it goes up half as fast.
 *
 * lift.js knows how rope works (following it, winding it in, letting it
 * out); spin.js stops a group of gears that's too weak for its load (see
 * winchLoad). This file says what each block is, moves the loads every
 * tick, and draws everything.
 */
import { MIN_SPEED } from '../spin.js';
import { canWindIn, letOut, loadBelow, ropeArms, traceRope, windIn } from '../lift.js';
import { TICKS_PER_SECOND, turned } from './gears.js';

/**
 * How many cells of rope a winch winds in for each turn.
 * 🧪 Try this! 4 for a speedy crane.
 */
export const ROPE_PER_TURN = 2;

/**
 * How strong turning things are: how much weight a source turning at
 * 1 turn a second can lift with a winch turning at 1 turn a second.
 * 🧪 Try this! 4, and a crank lifts the iron weight with no gears at all.
 */
export const STRENGTH = 1;

// =============================================================
// Load and effort
// =============================================================

/**
 * How much "drive" a winch needs to turn at this speed: its load's
 * weight × how fast it winds. Turning ↺ lets the rope out, and that's
 * free (the load's weight does the work). spin.js adds these up and
 * stalls the gears if the source isn't strong enough.
 * @param {object} world - the world
 * @param {number} x - the winch's column
 * @param {number} y - the winch's row
 * @param {number} speed - how fast it would turn (+ = ↻, winding in)
 * @param {Function} blockInfo - looks up what a block name means
 * @returns {number} the drive needed (0 if nothing to lift)
 */
export function winchLoad(world, x, y, speed, blockInfo) {
  if (speed <= 0) return 0;
  const rope = traceRope(world, x, y, blockInfo);
  if (!canWindIn(world, rope, blockInfo)) return 0; // wound all the way in: nothing to pull
  return (loadBelow(world, rope.end, blockInfo).weight * speed) / STRENGTH;
}

// =============================================================
// Running the winches
// =============================================================

/**
 * Work out the rope drawing again, but only if a block changed. See
 * refreshSignals in registry.js. Keeps the half-wound rope amounts.
 * @param {object} world - the world
 * @param {Function} blockInfo - looks up what a block name means
 * @returns {void}
 */
export function refreshLift(world, blockInfo) {
  const blocks = world.cells.join(',');
  if (world.signals.lift?.blocks === blocks) return;
  const pull = world.signals.lift?.pull ?? new Map();
  world.signals.lift = { cells: ropeArms(world, blockInfo), pull, blocks };
}

/**
 * The lifting rule that runs every tick, just after the gears (so it
 * knows how fast each winch turns). Each turning winch winds in (↻) or
 * lets out (↺) a little rope. Once it has wound a whole cell's worth (two
 * with a pulley hook), the load moves one cell.
 * @param {object} world - the world
 * @param {Function} blockInfo - looks up what a block name means
 * @returns {boolean} true if any block moved
 */
export function liftSystem(world, blockInfo) {
  const before = world.signals.lift?.pull ?? new Map();
  const pull = new Map();
  let moved = false;
  // Find the winches first: moving loads changes world.cells as we go.
  const winches = [];
  world.cells.forEach((name, index) => {
    if (blockInfo(name)?.winch) winches.push(index);
  });
  for (const index of winches) {
    const speed = world.signals.spin?.cells?.get(index)?.speed ?? 0;
    if (Math.abs(speed) < MIN_SPEED) continue; // stopped (or stalled): forget any half-wound rope
    const x = index % world.width;
    const y = Math.floor(index / world.width);
    let amount = (before.get(index) ?? 0) + (speed * ROPE_PER_TURN) / TICKS_PER_SECOND;
    /**
     * How much rope moves the load one cell: 2 with a pulley hook.
     * @returns {number} cells of rope
     */
    const step = () => (loadBelow(world, traceRope(world, x, y, blockInfo).end, blockInfo).hook ? 2 : 1);
    while (amount >= step()) {
      if (!windIn(world, x, y, blockInfo)) { amount = 0; break; } // all wound in
      amount -= step();
      moved = true;
    }
    while (amount <= -step()) {
      if (!letOut(world, x, y, blockInfo)) { amount = 0; break; } // resting on the ground
      amount += step();
      moved = true;
    }
    pull.set(index, amount);
  }
  world.signals.lift = { cells: ropeArms(world, blockInfo), pull, blocks: world.cells.join(',') };
  return moved;
}

// =============================================================
// Drawing
// =============================================================
// Blocks are drawn on an 8 × 8 grid of little pixels: p = size / 8.

/** The rope's color. */
const ROPE = '#c8a165';

/**
 * Draw rope from the middle of a cell out through some of its sides.
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {{up: boolean, right: boolean, down: boolean, left: boolean}} arms - which sides
 * @param {number} left - the cell's left edge
 * @param {number} top - the cell's top edge
 * @param {number} size - the cell's size
 * @returns {void}
 */
function drawRopeArms(ctx, arms, left, top, size) {
  const p = size / 8;
  ctx.fillStyle = ROPE;
  ctx.fillRect(left + 3.5 * p, top + 3.5 * p, p, p); // the middle
  if (arms.up) ctx.fillRect(left + 3.5 * p, top, p, 4 * p);
  if (arms.down) ctx.fillRect(left + 3.5 * p, top + 3.5 * p, p, 4.5 * p);
  if (arms.left) ctx.fillRect(left, top + 3.5 * p, 4 * p, p);
  if (arms.right) ctx.fillRect(left + 3.5 * p, top + 3.5 * p, 4.5 * p, p);
}

/**
 * Draw a bit of rope, joined to its neighbors. In the palette (no
 * record) it just hangs straight down.
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {object} info - the block's definition
 * @param {number} left - the cell's left edge
 * @param {number} top - the cell's top edge
 * @param {number} size - the cell's size
 * @param {object|undefined} cell - its arms (from ropeArms)
 * @returns {void}
 */
function drawRope(ctx, info, left, top, size, cell) {
  drawRopeArms(ctx, cell ?? { up: true, right: false, down: true, left: false }, left, top, size);
}

/**
 * Draw a pulley: a wheel with a groove for the rope, and the rope
 * going round it.
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {object} info - the block's definition
 * @param {number} left - the cell's left edge
 * @param {number} top - the cell's top edge
 * @param {number} size - the cell's size
 * @param {object|undefined} cell - its arms (from ropeArms)
 * @returns {void}
 */
function drawPulley(ctx, info, left, top, size, cell) {
  const p = size / 8;
  ctx.fillStyle = '#90a4ae';
  ctx.fillRect(left + 2 * p, top + p, 4 * p, 6 * p);
  ctx.fillRect(left + p, top + 2 * p, 6 * p, 4 * p);
  ctx.fillStyle = '#546e7a'; // the groove
  ctx.fillRect(left + 2 * p, top + 2 * p, 4 * p, 4 * p);
  if (cell) drawRopeArms(ctx, cell, left, top, size);
  ctx.fillStyle = '#263238'; // the axle in the middle
  ctx.fillRect(left + 3.5 * p, top + 3.5 * p, p, p);
}

/**
 * Draw a pulley hook: a little wheel with two bits of rope going up
 * (that's why the load counts half as heavy) and a hook underneath.
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {object} info - the block's definition
 * @param {number} left - the cell's left edge
 * @param {number} top - the cell's top edge
 * @param {number} size - the cell's size
 * @param {object|undefined} cell - its arms (from ropeArms)
 * @returns {void}
 */
function drawHook(ctx, info, left, top, size, cell) {
  const p = size / 8;
  if (cell?.up ?? true) {
    ctx.fillStyle = ROPE; // the rope comes down, then two strands share the load
    ctx.fillRect(left + 3.5 * p, top, p, p);
    ctx.fillRect(left + 2 * p, top + p, 4 * p, p);
    ctx.fillRect(left + 2 * p, top + p, p, 2 * p);
    ctx.fillRect(left + 5 * p, top + p, p, 2 * p);
  }
  ctx.fillStyle = '#90a4ae';
  ctx.fillRect(left + 2 * p, top + 2 * p, 4 * p, 3 * p); // the wheel
  ctx.fillStyle = '#263238';
  ctx.fillRect(left + 3.5 * p, top + 3 * p, p, p);
  ctx.fillStyle = '#616161'; // the hook: down, then curling up
  ctx.fillRect(left + 3.5 * p, top + 5 * p, p, 2 * p);
  ctx.fillRect(left + 2.5 * p, top + 7 * p, 2 * p, p);
  ctx.fillRect(left + 2.5 * p, top + 6 * p, p, p);
}

/**
 * Draw a winch: a drum with rope wrapped round it. The rope's stripes
 * roll as it turns. If its gears are too weak to lift the load, it shows
 * a red ⬇ (too heavy!).
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {object} info - the block's definition
 * @param {number} left - the cell's left edge
 * @param {number} top - the cell's top edge
 * @param {number} size - the cell's size
 * @param {object|undefined} cell - its spin record (from spin.js)
 * @param {number} ticks - the world's clock
 * @returns {void}
 */
function drawWinch(ctx, info, left, top, size, cell, ticks) {
  const p = size / 8;
  ctx.fillStyle = '#5d4037'; // the stand
  ctx.fillRect(left + p, top + p, p, 6 * p);
  ctx.fillRect(left + 6 * p, top + p, p, 6 * p);
  ctx.fillStyle = '#8d6e63'; // the drum
  ctx.fillRect(left + 2 * p, top + 2 * p, 4 * p, 4 * p);
  ctx.fillStyle = ROPE; // rope wound round it, rolling as it turns
  const roll = Math.floor(turned(cell, ticks) * 4); // 0..3
  for (let row = 0; row < 4; row += 2) ctx.fillRect(left + 2 * p, top + (2 + ((row + roll) % 4)) * p, 4 * p, p);
  if (cell?.stalled) {
    ctx.fillStyle = '#e53935'; // a red ⬇: too heavy!
    ctx.fillRect(left + 3.5 * p, top, p, 6 * p);
    ctx.fillRect(left + 2.5 * p, top + 5 * p, 3 * p, p);
    ctx.fillRect(left + 1.5 * p, top + 4 * p, p, p);
    ctx.fillRect(left + 5.5 * p, top + 4 * p, p, p);
  }
}

// =============================================================
// The blocks
// =============================================================

/**
 * Every block in this pack, in the order the palette shows them.
 *   spin       the winch joins gear trains like any hub (a shared shaft)
 *   spinLoad   how much drive the winch needs to lift its load
 *   rope       rope runs through it (rope and pulleys)
 *   holds      holds up what hangs under it
 *   falls      falls like sand (unless a rope holds it up)
 *   weight     how heavy it is to lift (1 if not given)
 *   hook       a pulley hook: the load under it counts half as heavy
 * 🧪 Try this! Make the iron weight 8, and gear the winch down three times.
 */
const blocks = {
  winch: {
    title: 'Winch', color: '#8d6e63', bare: true, winch: true,
    spin: { kind: 'hub' }, spinLoad: winchLoad, drawSignals: drawWinch,
  },
  rope: {
    title: 'Rope', color: ROPE, bare: true, rope: true, holds: true,
    fluid: { sides: 'all' }, // water flows through it, like a well rope
    drawSignals: drawRope,
  },
  pulley: { title: 'Pulley', color: '#90a4ae', bare: true, rope: true, holds: true, pulley: true, drawSignals: drawPulley },
  pulleyHook: { title: 'Pulley hook', color: '#90a4ae', bare: true, falls: true, weight: 0, hook: true, drawSignals: drawHook },
  crate: { title: 'Crate', color: '#b07d4f', falls: true, weight: 1, label: '1' },
  ironWeight: { title: 'Iron weight', color: '#5f6a72', falls: true, weight: 4, label: '4' },
};

/**
 * What the ❓ guide on the Build page says about this tab: its rules,
 * and what each block in the palette does (and what ✋ USE does to it).
 * tests/guide.test.js checks every palette block is here.
 */
const guide = {
  rules: [
    'A winch turning ↻ winds the rope in (up). Turning ↺ lets it out (down).',
    'Heavy things need more effort. Too heavy, and everything STALLS: nothing turns and the winch shows a red ⬇.',
    'Slower is stronger! A small gear driving a big gear makes the winch slower, so it can lift more. Gearing UP makes it weaker.',
    'Dig the rope and whatever hangs on it falls.',
  ],
  blocks: {
    winch: { does: 'A drum that winds rope. Turn it with a crank, gears or a motor touching it.' },
    rope: { does: 'Put some next to the winch and let it hang down. The winch adds and takes away rope as it moves.' },
    pulley: { does: 'A wheel the rope runs over, so it can change direction: up a tower and down the other side.' },
    pulleyHook: { does: 'Hang it on the rope with the load under it. The load counts half as heavy, but goes up half as fast.' },
    crate: { does: 'Weighs 1. Falls like sand, unless a rope holds it up.' },
    ironWeight: { does: 'Weighs 4. Too heavy for a crank on its own: gear it down!' },
  },
};

export default {
  tab: { id: 'lift', icon: '🏗️', label: 'Lifting' },
  blocks,
  guide,
  systems: [liftSystem],
  refresh: refreshLift,
};
