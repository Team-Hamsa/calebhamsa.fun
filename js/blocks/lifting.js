/**
 * lifting.js — the 🏗️ Lifting pack: a winch, rope, pulleys, a crate and
 * an iron weight. It teaches LOAD and EFFORT:
 *
 *    crank → winch → rope → crate          ✓ lifts it (weight 1)
 *    crank → winch → rope → iron weight    ✗ too heavy (weight 4): it STALLS
 *    crank → small gear → BIG gear → ...   slower, but stronger: ✓
 *
 * A winch turning slower is stronger, so gearing it down lets the same
 * crank lift more. You trade speed for strength. And the heavier the
 * load, the slower it goes, just like a real crane. A pulley hook does the
 * same: two bits of rope share the load, so it counts half as heavy, but
 * it goes up half as fast.
 *
 * lift.js knows how rope works (following it, winding it in, letting it
 * out); spin.js stops a group of gears that's too weak for its load (see
 * winchLoad). This file says what each block is, moves the loads every
 * tick, and draws everything.
 */
import { MIN_SPEED } from '../spin.js';
import { canLower, letOut, loadBelow, ownsRopeEnd, ropeArms, traceRope, windIn } from '../lift.js';
import { TICKS_PER_SECOND, turned } from './gears.js';

/**
 * How many cells of rope a winch winds in for each turn.
 * 🧪 Try this! 4 for a speedy crane.
 */
export const ROPE_PER_TURN = 2;

// =============================================================
// Load and effort
// =============================================================

/**
 * How hard the load on a winch's rope pulls on it: its weight, pulling
 * the rope out (that's the ↺ way, so it's a minus). spin.js adds it to
 * the gears: if the cranks, motors and water wheels can't push harder
 * than this, it stalls. The closer the load is to their strength, the
 * slower it goes up.
 *
 * A load that's RESTING on the ground is different. The ground holds it
 * up, so the rope is slack: it can't pull the winch round, and it's no
 * use as a counterweight. But it still has to be lifted, so it pulls
 * back as soon as the winch tries to wind it in.
 *
 * And a load going DOWN helps turn the winch, but only up to the speed
 * it would fall with no rope at all (one cell a tick, like sand). Rope
 * can only pull, never push: if the winch lets rope out faster than
 * that, the rope goes slack and the load isn't pushing any more.
 * @param {object} world - the world
 * @param {number} x - the winch's column
 * @param {number} y - the winch's row
 * @param {Function} blockInfo - looks up what a block name means
 * @param {Function} [isDriven] - (cell index) => true if something is turning
 *   that block (from spin.js): a shared rope end is carried by the winch being turned
 * @returns {{pull: number, resting: boolean, topSpeed: number}} the pull
 *   (0 if nothing hangs on it), whether the load is resting on
 *   something, and the fastest the load can turn the winch
 */
export function winchLoad(world, x, y, blockInfo, isDriven) {
  const rope = traceRope(world, x, y, blockInfo);
  // A rope end shared with another winch that owns it is that winch's to carry: no load here.
  if (!ownsRopeEnd(world, x, y, rope, blockInfo, isDriven)) return { pull: 0, resting: false, topSpeed: Infinity };
  const load = loadBelow(world, rope, blockInfo);
  // Falling speed is 1 cell a tick. With a pulley hook, each cell takes 2 cells of rope.
  const topSpeed = (TICKS_PER_SECOND * (load.hook ? 2 : 1)) / ROPE_PER_TURN;
  return { pull: -load.weight, resting: !canLower(world, rope, load), topSpeed };
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
 * with a pulley hook), the load moves one cell. Going down, a load moves
 * one cell a tick at the very most: that's how fast things fall.
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
  /**
   * Is something turning this winch (this tick, from spin.js)?
   * @param {number} index - the winch's cell index
   * @returns {boolean} true if its gears have a source
   */
  const isDriven = (index) => Boolean(world.signals.spin?.cells?.get(index)?.driven);
  for (const index of winches) {
    const speed = world.signals.spin?.cells?.get(index)?.speed ?? 0;
    if (Math.abs(speed) < MIN_SPEED) continue; // stopped (or stalled): forget any half-wound rope
    const x = index % world.width;
    const y = Math.floor(index / world.width);
    // Two winches sharing one rope end: only its owner winds it (the other just spins).
    if (!ownsRopeEnd(world, x, y, traceRope(world, x, y, blockInfo), blockInfo, isDriven)) continue;
    let amount = (before.get(index) ?? 0) + (speed * ROPE_PER_TURN) / TICKS_PER_SECOND;
    /**
     * How much rope moves the load one cell: 2 with a pulley hook.
     * @returns {number} cells of rope
     */
    const step = () => (loadBelow(world, traceRope(world, x, y, blockInfo), blockInfo).hook ? 2 : 1);
    if (Math.abs(amount) < 1) { // not even one cell's worth yet: nothing to move
      pull.set(index, amount);
      continue;
    }
    while (amount >= step()) {
      if (!windIn(world, x, y, blockInfo)) { amount = 0; break; } // all wound in
      amount -= step();
      moved = true;
    }
    while (amount <= -step()) {
      const loaded = loadBelow(world, traceRope(world, x, y, blockInfo), blockInfo).cells.length > 0;
      if (!letOut(world, x, y, blockInfo)) { amount = 0; break; } // resting on the ground
      amount += step();
      moved = true;
      if (loaded) {
        // Rope can't push: a load never goes down faster than it would
        // fall, one cell a tick. Any more rope than that is just slack.
        amount %= step();
        break;
      }
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

/** The color of the winch's little metal catch. */
const CATCH = '#eceff1';

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
 * Draw a winch: a drum with rope wrapped round it, and its catch (the
 * ratchet that stops the load pulling it round) at the top. The rope's
 * stripes roll as it turns. If its gears are too weak to lift the load,
 * it shows a red ⬇ (too heavy!).
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
  const roll = Math.floor(turned(cell) * 4); // 0..3
  for (let row = 0; row < 4; row += 2) ctx.fillRect(left + 2 * p, top + (2 + ((row + roll) % 4)) * p, 4 * p, p);
  ctx.fillStyle = CATCH; // the catch (ratchet): a little metal finger leaning on the drum
  ctx.fillRect(left + 5 * p, top + p, p, p);
  ctx.fillRect(left + 4.5 * p, top + 1.5 * p, p, p);
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
 *   spinLoad   how hard its load pulls on it
 *   rope       rope runs through it (rope and pulleys; it only turns at pulleys)
 *   falls      falls like sand (unless it hangs on a winch's rope)
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
    title: 'Rope', color: ROPE, bare: true, rope: true,
    fluid: { sides: 'all' }, // water flows through it, like a well rope
    drawSignals: drawRope,
  },
  pulley: { title: 'Pulley', color: '#90a4ae', bare: true, rope: true, pulley: true, drawSignals: drawPulley },
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
    'A winch has a little catch (a ratchet): let go and the load stays up. The load can\'t pull the winch round by itself. It only comes down when you turn the winch ↺.',
    'Heavy things go up slower. Too heavy for the crank, motor or water wheel, and everything STALLS: nothing turns and the winch shows a red ⬇.',
    'Slower is stronger! A small gear driving a big gear makes the winch slower, so it can lift more. Gearing UP makes it weaker.',
    'Or add strength: two cranks, more batteries for a motor, or a longer fall of water onto a water wheel.',
    'Going down, a hanging load helps turn the winch, but it never goes down faster than it would fall. A load lying on the ground helps nothing: its rope is slack. It only pulls when you lift it.',
    'Dig the rope and whatever hangs on it falls.',
  ],
  blocks: {
    winch: { does: 'A drum that winds rope. Turn it with a crank, gears or a motor touching it. Its little catch holds the load up when nothing turns it.' },
    rope: { does: 'Put some next to the winch and let it hang down. Rope goes straight: it only turns a corner at a pulley.' },
    pulley: { does: 'A wheel the rope runs over, so it can change direction: up a tower and down the other side.' },
    pulleyHook: { does: 'Hang it on the rope with the load under it. The load counts half as heavy, but goes up half as fast.' },
    crate: { does: 'Weighs 1. Falls like sand, unless it hangs on the end of a winch\'s rope.' },
    ironWeight: { does: 'Weighs 4. Too heavy for a crank on its own: gear it down, or add strength!' },
  },
};

export default {
  tab: { id: 'lift', icon: '🏗️', label: 'Lifting' },
  blocks,
  guide,
  systems: [liftSystem],
  refresh: refreshLift,
};
