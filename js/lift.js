/**
 * lift.js — the rope rules: how a winch lifts things with a rope.
 *
 *        [winch]          the winch winds the rope in or lets it out
 *          |              rope, hanging down (maybe over a pulley first)
 *          |  ← the END   the rope's last bit
 *        [crate]          the LOAD: the block hanging on the end
 *
 * Winding in takes away the end of the rope and moves the load up into
 * its place. Letting out moves the load down and adds a bit of rope.
 *
 * Rope goes straight. It only turns a corner at a PULLEY (or as it
 * leaves the winch), just like real rope: so two ropes side by side
 * never get muddled up.
 *
 * Only ONE block hangs on the end (or a pulley hook with one block under
 * it). Anything under that is just resting, so it isn't lifted, and it
 * falls if there's nothing under it.
 *
 * How heavy the load is matters (see winchLoad in js/blocks/lifting.js):
 * a crate weighs 1, an iron weight 4, and a pulley hook makes the load
 * count half as heavy (two bits of rope share it).
 *
 * This file only reads the fields blocks have: `winch`, `rope` (rope and
 * pulleys: the rope runs through them), `pulley`, `falls`, `weight` and `hook`.
 */
import { AIR, getBlock, inBounds, moveBlock, swapBlock } from './world.js';

/**
 * The order we look round a cell, as [name, dx, dy]: down first (ropes
 * hang down), then right, left and up. y counts DOWN, so up is -1.
 */
const SIDES = [['down', 0, 1], ['right', 1, 0], ['left', -1, 0], ['up', 0, -1]];

/** The side you get to by going the other way. */
const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

/**
 * What block is at x, y, and what it means.
 * @param {object} world - the world
 * @param {number} x - column
 * @param {number} y - row
 * @param {Function} blockInfo - looks up what a block name means
 * @returns {object|undefined} the block's definition (undefined outside the world)
 */
function infoAt(world, x, y, blockInfo) {
  return inBounds(world, x, y) ? blockInfo(getBlock(world, x, y)) : undefined;
}

/**
 * Follow the rope from a winch. It leaves the winch on any side (down
 * first), then goes STRAIGHT on, turning only at pulleys.
 * @param {object} world - the world
 * @param {number} x - the winch's column
 * @param {number} y - the winch's row
 * @param {Function} blockInfo - looks up what a block name means
 * @returns {{path: Array<{x: number, y: number, side: string}>, end: object|null, hanging: boolean}}
 *   every cell the rope runs through (and the side it went out of the
 *   cell before), its last bit of rope (null if the winch has none), and
 *   whether that end hangs straight down (only then can it hold a load)
 */
export function traceRope(world, x, y, blockInfo) {
  const path = [];
  const seen = new Set([`${x},${y}`]);
  let at = { x, y };
  let turns = true; // the rope can leave the winch any way
  let going = null;
  for (;;) {
    let next = null;
    for (const [side, dx, dy] of SIDES) {
      if (!turns && side !== going) continue; // plain rope only goes straight on
      const spot = { x: at.x + dx, y: at.y + dy, side };
      const info = infoAt(world, spot.x, spot.y, blockInfo);
      if (seen.has(`${spot.x},${spot.y}`) || !info?.rope) continue;
      if (path.length === 0 && info.pulley) continue; // the first step must be real rope
      next = spot;
      break;
    }
    if (!next) break;
    seen.add(`${next.x},${next.y}`);
    path.push(next);
    at = next;
    going = next.side;
    turns = Boolean(infoAt(world, next.x, next.y, blockInfo).pulley); // pulleys turn the rope
  }
  const last = path[path.length - 1];
  const end = last && !infoAt(world, last.x, last.y, blockInfo).pulley ? last : null;
  return { path, end, hanging: Boolean(end) && end.side === 'down' };
}

/**
 * What hangs on the end of the rope: the block right under it, or a
 * pulley hook and the block under the hook.
 * @param {object} world - the world
 * @param {{end: object|null, hanging: boolean}} rope - from traceRope
 * @param {Function} blockInfo - looks up what a block name means
 * @returns {{cells: Array<{x: number, y: number}>, weight: number, hook: boolean}}
 *   the load's cells (top first), its weight (halved by a pulley hook),
 *   and whether it hangs on a pulley hook
 */
export function loadBelow(world, rope, blockInfo) {
  const cells = [];
  let weight = 0;
  let hook = false;
  if (rope.hanging) {
    const { x } = rope.end;
    const first = infoAt(world, x, rope.end.y + 1, blockInfo);
    if (first?.falls) {
      cells.push({ x, y: rope.end.y + 1 });
      weight += first.weight ?? 1;
      hook = Boolean(first.hook);
      const second = infoAt(world, x, rope.end.y + 2, blockInfo);
      if (hook && second?.falls && !second.hook) {
        cells.push({ x, y: rope.end.y + 2 });
        weight += second.weight ?? 1;
      }
    }
  }
  return { cells, weight: hook ? weight / 2 : weight, hook };
}

/**
 * Can the rope be wound in any further? Only if its end hangs straight
 * down from another bit of rope. So the last bit of rope under the winch
 * (or a pulley) always stays, and the rope can always be let out again.
 * @param {object} world - the world
 * @param {{path: Array<object>, hanging: boolean}} rope - from traceRope
 * @param {Function} blockInfo - looks up what a block name means
 * @returns {boolean} true if it can
 */
export function canWindIn(world, rope, blockInfo) {
  if (!rope.hanging || rope.path.length < 2) return false;
  const before = rope.path[rope.path.length - 2];
  return !infoAt(world, before.x, before.y, blockInfo).pulley;
}

/**
 * Wind the rope in one cell: the end of the rope goes, and the load moves
 * up into its place (top block first, so nothing bumps).
 * @param {object} world - the world
 * @param {number} x - the winch's column
 * @param {number} y - the winch's row
 * @param {Function} blockInfo - looks up what a block name means
 * @returns {boolean} true if it moved
 */
export function windIn(world, x, y, blockInfo) {
  const rope = traceRope(world, x, y, blockInfo);
  if (!canWindIn(world, rope, blockInfo)) return false;
  const load = loadBelow(world, rope, blockInfo);
  swapBlock(world, rope.end.x, rope.end.y, AIR); // swap, not set: any water there stays
  for (const cell of load.cells) moveBlock(world, cell.x, cell.y, cell.x, cell.y - 1);
  return true;
}

/**
 * Is there room under the load (or under the bare end of the rope) for
 * it to go down one cell? If not, it's RESTING on something: the ground
 * holds it up, the rope is slack, and it doesn't pull on the winch.
 * @param {object} world - the world
 * @param {{end: object|null, hanging: boolean}} rope - from traceRope
 * @param {{cells: Array<{x: number, y: number}>}} load - from loadBelow
 * @returns {boolean} true if the cell under it is empty air
 */
export function canLower(world, rope, load) {
  if (!rope.hanging) return false;
  const bottom = load.cells[load.cells.length - 1] ?? rope.end;
  return inBounds(world, bottom.x, bottom.y + 1) && getBlock(world, bottom.x, bottom.y + 1) === AIR;
}

/**
 * Let the rope out one cell: the load moves down (bottom block first)
 * and a bit of rope fills the gap. With nothing hanging, the rope itself
 * gets longer. Stops when the load (or the rope) rests on something.
 * @param {object} world - the world
 * @param {number} x - the winch's column
 * @param {number} y - the winch's row
 * @param {Function} blockInfo - looks up what a block name means
 * @returns {boolean} true if it moved
 */
export function letOut(world, x, y, blockInfo) {
  const rope = traceRope(world, x, y, blockInfo);
  if (!rope.hanging) return false;
  const load = loadBelow(world, rope, blockInfo);
  const top = load.cells[0] ?? { x: rope.end.x, y: rope.end.y + 1 };
  if (!canLower(world, rope, load)) return false;
  for (const cell of [...load.cells].reverse()) moveBlock(world, cell.x, cell.y, cell.x, cell.y + 1);
  swapBlock(world, top.x, top.y, 'rope');
  return true;
}

/**
 * Every block hanging on a winch's rope right now.
 * @param {object} world - the world
 * @param {Function} blockInfo - looks up what a block name means
 * @returns {Set<number>} their cell indexes (y * width + x)
 */
export function hangingLoads(world, blockInfo) {
  const held = new Set();
  world.cells.forEach((name, index) => {
    if (!blockInfo(name)?.winch) return;
    const rope = traceRope(world, index % world.width, Math.floor(index / world.width), blockInfo);
    for (const cell of loadBelow(world, rope, blockInfo).cells) held.add(cell.y * world.width + cell.x);
  });
  return held;
}

/**
 * Is this block held up by a rope? Only if it hangs on the end of a
 * winch's rope. A cut rope, or one with no winch, holds nothing.
 * @param {object} world - the world
 * @param {number} x - column
 * @param {number} y - row
 * @param {Function} blockInfo - looks up what a block name means
 * @returns {boolean} true if it's held up
 */
export function isHeld(world, x, y, blockInfo) {
  return hangingLoads(world, blockInfo).has(y * world.width + x);
}

/**
 * Which way each bit of rope (and each pulley and hook) has rope going
 * out of it, so it can be drawn joined up. Rope on a winch's path joins
 * along the path (and down to its load); loose rope just joins the rope
 * above and below it; a hook hangs from the rope above.
 * @param {object} world - the world
 * @param {Function} blockInfo - looks up what a block name means
 * @returns {Map<number, {up: boolean, right: boolean, down: boolean, left: boolean}>}
 *   for each cell's index (y * width + x)
 */
export function ropeArms(world, blockInfo) {
  const arms = new Map();
  /**
   * The arms record for a cell, made empty the first time.
   * @param {number} x - column
   * @param {number} y - row
   * @returns {object} its arms
   */
  const armsAt = (x, y) => {
    const index = y * world.width + x;
    if (!arms.has(index)) arms.set(index, { up: false, right: false, down: false, left: false });
    return arms.get(index);
  };
  // Loose rope and hooks first: up and down only.
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      const info = infoAt(world, x, y, blockInfo);
      if (info?.hook) armsAt(x, y).up = Boolean(infoAt(world, x, y - 1, blockInfo)?.rope);
      if (!info?.rope || info.pulley) continue;
      armsAt(x, y).up = Boolean(infoAt(world, x, y - 1, blockInfo)?.rope);
      armsAt(x, y).down = Boolean(infoAt(world, x, y + 1, blockInfo)?.rope);
    }
  }
  // Then every winch's rope, joined along its path.
  world.cells.forEach((name, index) => {
    if (!blockInfo(name)?.winch) return;
    const rope = traceRope(world, index % world.width, Math.floor(index / world.width), blockInfo);
    for (const cell of rope.path) {
      const mine = armsAt(cell.x, cell.y);
      if (!blockInfo(getBlock(world, cell.x, cell.y)).pulley) Object.assign(mine, { up: false, right: false, down: false, left: false });
    }
    for (const cell of rope.path) armsAt(cell.x, cell.y)[OPPOSITE[cell.side]] = true; // back toward where it came from
    rope.path.forEach((cell, k) => {
      const next = rope.path[k + 1];
      if (next) armsAt(cell.x, cell.y)[next.side] = true;
    });
    if (loadBelow(world, rope, blockInfo).cells.length > 0) armsAt(rope.end.x, rope.end.y).down = true;
  });
  return arms;
}
