/**
 * lift.js — the rope rules: how a winch lifts things with a rope.
 *
 *        [winch]          the winch winds the rope in or lets it out
 *          |              rope, hanging down (maybe over a pulley first)
 *          |  ← the END   the rope's last bit
 *        [crate]          the LOAD: everything that would fall, hanging
 *        [sand ]          under the end, in one column
 *
 * Winding in takes away the end of the rope and moves the load up into
 * its place. Letting out moves the load down and adds a bit of rope.
 *
 * How heavy the load is matters (see spinLoad in js/blocks/lifting.js):
 * a crate weighs 1, an iron weight 4, and a pulley hook on top makes the
 * load count half as heavy (two bits of rope share it).
 *
 * This file only reads the fields blocks have: `rope` (rope and
 * pulleys: the rope runs through them), `pulley`, `holds` (blocks that
 * hold up what hangs under them), `falls`, `weight` and `hook`.
 */
import { AIR, getBlock, inBounds, moveBlock, swapBlock } from './world.js';

/**
 * The order we look round a cell, as [name, dx, dy]: down first (ropes
 * hang down), then right, left and up. y counts DOWN, so up is -1.
 */
const SIDES = [['down', 0, 1], ['right', 1, 0], ['left', -1, 0], ['up', 0, -1]];

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
 * Follow the rope from a winch: find a bit of rope touching it, then keep
 * going from rope to rope (and through pulleys) until it runs out.
 * @param {object} world - the world
 * @param {number} x - the winch's column
 * @param {number} y - the winch's row
 * @param {Function} blockInfo - looks up what a block name means
 * @returns {{path: Array<{x: number, y: number}>, end: {x: number, y: number}|null}}
 *   every cell the rope runs through, and its last bit of rope (null if
 *   the winch has no rope)
 */
export function traceRope(world, x, y, blockInfo) {
  const path = [];
  const seen = new Set([`${x},${y}`]);
  let at = { x, y };
  for (;;) {
    let next = null;
    for (const [, dx, dy] of SIDES) {
      const spot = { x: at.x + dx, y: at.y + dy };
      if (seen.has(`${spot.x},${spot.y}`) || !infoAt(world, spot.x, spot.y, blockInfo)?.rope) continue;
      // The first step from the winch must be a real rope, not a pulley.
      if (path.length === 0 && infoAt(world, spot.x, spot.y, blockInfo).pulley) continue;
      next = spot;
      break;
    }
    if (!next) break;
    seen.add(`${next.x},${next.y}`);
    path.push(next);
    at = next;
  }
  // The end is the last bit of real rope (a pulley isn't an end).
  const ropes = path.filter((spot) => !infoAt(world, spot.x, spot.y, blockInfo).pulley);
  return { path, end: ropes.length > 0 ? ropes[ropes.length - 1] : null };
}

/**
 * What hangs on the end of the rope: the column of falling blocks right
 * under it, and how heavy it is.
 * @param {object} world - the world
 * @param {{x: number, y: number}|null} end - the rope's end
 * @param {Function} blockInfo - looks up what a block name means
 * @returns {{cells: Array<{x: number, y: number}>, weight: number, hook: boolean}}
 *   the load's cells (top first), its weight (halved by a pulley hook on
 *   top), and whether it hangs on a pulley hook
 */
export function loadBelow(world, end, blockInfo) {
  const cells = [];
  let weight = 0;
  if (end) {
    for (let y = end.y + 1; infoAt(world, end.x, y, blockInfo)?.falls; y++) {
      cells.push({ x: end.x, y });
      weight += infoAt(world, end.x, y, blockInfo).weight ?? 1;
    }
  }
  const hook = cells.length > 0 && Boolean(infoAt(world, cells[0].x, cells[0].y, blockInfo).hook);
  return { cells, weight: hook ? weight / 2 : weight, hook };
}

/**
 * Can the rope be wound in any further? Only if its end hangs straight
 * down from another bit of rope. So the last bit of rope under the winch
 * (or a pulley) always stays, and the rope can always be let out again.
 * @param {object} world - the world
 * @param {{path: Array<{x: number, y: number}>, end: object|null}} rope - from traceRope
 * @param {Function} blockInfo - looks up what a block name means
 * @returns {boolean} true if it can
 */
export function canWindIn(world, rope, blockInfo) {
  const { path, end } = rope;
  if (!end || path.length < 2) return false;
  const before = path[path.length - 2];
  if (path[path.length - 1] !== end) return false; // the rope ends in a pulley
  const info = infoAt(world, before.x, before.y, blockInfo);
  return before.x === end.x && before.y === end.y - 1 && info.rope && !info.pulley;
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
  const load = loadBelow(world, rope.end, blockInfo);
  swapBlock(world, rope.end.x, rope.end.y, AIR); // swap, not set: any water there stays
  for (const cell of load.cells) moveBlock(world, cell.x, cell.y, cell.x, cell.y - 1);
  return true;
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
  const { end } = traceRope(world, x, y, blockInfo);
  if (!end) return false;
  const load = loadBelow(world, end, blockInfo);
  const top = load.cells[0] ?? { x: end.x, y: end.y + 1 };
  const bottom = load.cells[load.cells.length - 1] ?? end;
  if (!inBounds(world, bottom.x, bottom.y + 1) || getBlock(world, bottom.x, bottom.y + 1) !== AIR) return false;
  for (const cell of [...load.cells].reverse()) moveBlock(world, cell.x, cell.y, cell.x, cell.y + 1);
  swapBlock(world, top.x, top.y, 'rope');
  return true;
}

/**
 * Is this block held up by a rope? Look straight up past any other
 * falling blocks: if we get to a rope (or pulley), it's hanging, so it
 * doesn't fall.
 * @param {object} world - the world
 * @param {number} x - column
 * @param {number} y - row
 * @param {Function} blockInfo - looks up what a block name means
 * @returns {boolean} true if it's held up
 */
export function isHeld(world, x, y, blockInfo) {
  for (let above = y - 1; above >= 0; above--) {
    const info = infoAt(world, x, above, blockInfo);
    if (info?.holds) return true;
    if (!info?.falls) return false;
  }
  return false;
}

/**
 * Which way each bit of rope (and each pulley and hook) has rope going
 * out of it, so it can be drawn joined up: toward rope, pulleys, winches
 * and hooks next to it, and down to anything hanging under it.
 * @param {object} world - the world
 * @param {Function} blockInfo - looks up what a block name means
 * @returns {Map<number, {up: boolean, right: boolean, down: boolean, left: boolean}>}
 *   for each cell's index (y * width + x)
 */
export function ropeArms(world, blockInfo) {
  const arms = new Map();
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      const info = infoAt(world, x, y, blockInfo);
      if (!info?.rope && !info?.hook) continue;
      const out = { up: false, right: false, down: false, left: false };
      for (const [side, dx, dy] of SIDES) {
        const next = infoAt(world, x + dx, y + dy, blockInfo);
        if (info.hook) {
          out[side] = side === 'up' && Boolean(next?.rope); // a hook hangs from the rope above
        } else {
          out[side] = Boolean(next?.rope || next?.winch || next?.hook || (side === 'down' && next?.falls));
        }
      }
      arms.set(y * world.width + x, out);
    }
  }
  return arms;
}
