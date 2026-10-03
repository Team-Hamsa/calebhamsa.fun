/**
 * spin.js — works out how gears, axles and spinning machines turn.
 *
 * Spinning blocks that touch pass their turning on:
 *
 *   gear ↔ gear      the teeth mesh: the next gear turns the OTHER way,
 *                    faster if it's smaller (big → small = twice as fast)
 *   ↔ axle / hub     a shared shaft: it turns the SAME way, same speed
 *
 * So for every connected group, we pick one block and walk outward,
 * working out each block's "ratio": how fast it turns compared to that
 * first block (−2 means twice as fast, the other way round).
 *
 * If two paths give a block different ratios (like three big gears in a
 * triangle: each one would have to turn both ways at once), the group is
 * JAMMED and nothing in it turns. Then the "sources" (cranks, motors,
 * water wheels) decide how fast the group goes.
 *
 * Speeds are in turns per second. + is clockwise ↻, − is anticlockwise ↺.
 * This file only reads the fields blocks have: `spin` and `spinSource`.
 */
import { getBlock, inBounds } from './world.js';
import { partAxis } from './circuit.js';

/** Which way each side is: [dx, dy]. y counts DOWN, so up is -1. */
const STEP = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };

/** Slower than this counts as standing still. */
export const MIN_SPEED = 0.001;

/**
 * Is this block part of the spinning world?
 * @param {object|undefined} info - the block's definition
 * @returns {boolean} true if it has a `spin` setting
 */
export function isSpin(info) {
  return Boolean(info?.spin);
}

/**
 * Which way an axle faces: sideways ('h') or up-down ('v'), from the
 * spinning blocks around it (the same rule as pipes and wires: both
 * sides, then above and below, then one side, then one above or below).
 * @param {object} world - the world
 * @param {number} x - the axle's column
 * @param {number} y - the axle's row
 * @param {Function} blockInfo - looks up what a block name means
 * @returns {'h'|'v'} the way it faces
 */
export function spinAxis(world, x, y, blockInfo) {
  /**
   * Is the cell dx, dy away a spinning block?
   * @param {number} dx - columns across
   * @param {number} dy - rows down
   * @returns {boolean} true if it is
   */
  const at = (dx, dy) => isSpin(blockInfo(getBlock(world, x + dx, y + dy)));
  const left = at(-1, 0);
  const right = at(1, 0);
  const up = at(0, -1);
  const down = at(0, 1);
  if (left && right) return 'h';
  if (up && down) return 'v';
  if (left || right) return 'h';
  if (up || down) return 'v';
  return 'h';
}

/**
 * Does an axle reach out through this side? Only along its own line.
 * @param {{spin: object, axis: string|null}} point - a spinning block
 * @param {string} side - which side
 * @returns {boolean} true if this block connects through that side
 */
function reaches(point, side) {
  if (point.spin.kind !== 'axle') return true;
  return point.axis === 'v' ? side === 'up' || side === 'down' : side === 'left' || side === 'right';
}

/**
 * How two blocks touching side by side pass on their turning: the
 * number to multiply the first one's speed by to get the second one's.
 * @param {object} a - the first block
 * @param {object} b - the block on its `side`
 * @param {string} side - which side of `a` the block `b` is on
 * @returns {number|null} the ratio, or null if they don't connect
 */
function sideRatio(a, b, side) {
  const opposite = { up: 'down', right: 'left', down: 'up', left: 'right' }[side];
  if (!reaches(a, side) || !reaches(b, opposite)) return null;
  if (a.spin.kind === 'gear' && b.spin.kind === 'gear') return -a.spin.teeth / b.spin.teeth; // teeth mesh
  return 1; // a shared shaft
}

/**
 * Work out how every spinning block turns.
 *
 * Returns a record for every spinning block:
 *   speed     turns per second (+ = ↻ clockwise, − = ↺ anticlockwise)
 *   jammed    true if its group can't turn
 *   axis      for axles: the way it faces
 *   partAxis  for blocks that are also electric parts (motors,
 *             generators): the way they face in a circuit
 *
 * @param {object} world - the world
 * @param {Function} blockInfo - looks up what a block name means
 * @returns {{cells: Map<number, object>, turning: boolean}} the records, and whether anything turns
 */
export function solveSpin(world, blockInfo) {
  const points = new Map();
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      const info = blockInfo(getBlock(world, x, y));
      if (!isSpin(info)) continue;
      const axis = info.spin.kind === 'axle' ? spinAxis(world, x, y, blockInfo) : null;
      points.set(y * world.width + x, { x, y, info, spin: info.spin, axis });
    }
  }

  // Who's connected to whom, and with what ratio (both ways round).
  const links = new Map([...points.keys()].map((index) => [index, []]));
  /**
   * Connect two blocks.
   * @param {number} a - one block's index
   * @param {number} b - the other block's index
   * @param {number} ratio - b's speed = a's speed × ratio
   * @returns {void}
   */
  const connect = (a, b, ratio) => {
    links.get(a).push({ to: b, ratio });
    links.get(b).push({ to: a, ratio: 1 / ratio });
  };
  for (const [a, pa] of points) {
    for (const side of ['right', 'down']) { // looking right and down meets every pair once
      const [dx, dy] = STEP[side];
      if (!inBounds(world, pa.x + dx, pa.y + dy)) continue;
      const b = a + dx + dy * world.width;
      const pb = points.get(b);
      const ratio = pb ? sideRatio(pa, pb, side) : null;
      if (ratio !== null) connect(a, b, ratio);
    }
    if (!pa.spin.diagonal) continue;
    for (const [dx, dy] of [[1, -1], [1, 1]]) { // big gears also mesh corner to corner
      if (!inBounds(world, pa.x + dx, pa.y + dy)) continue;
      const b = a + dx + dy * world.width;
      const pb = points.get(b);
      if (pb?.spin.diagonal) connect(a, b, -pa.spin.teeth / pb.spin.teeth);
    }
  }

  const cells = new Map();
  let turning = false;
  const done = new Set();
  for (const start of points.keys()) {
    if (done.has(start)) continue;
    // Walk the group, giving every block its ratio to the first block.
    const ratio = new Map([[start, 1]]);
    const queue = [start];
    let jammed = false;
    while (queue.length > 0) {
      const at = queue.shift();
      for (const link of links.get(at)) {
        const expected = ratio.get(at) * link.ratio;
        if (!ratio.has(link.to)) {
          ratio.set(link.to, expected);
          queue.push(link.to);
        } else if (Math.abs(ratio.get(link.to) - expected) > 1e-9 * Math.max(1, Math.abs(expected))) {
          jammed = true; // two paths disagree: this block would have to turn two ways at once
        }
      }
    }

    // The sources say how fast the first block must turn. They must all
    // agree on the direction (or it's jammed); the fastest one wins.
    let speed = 0;
    for (const index of ratio.keys()) {
      const point = points.get(index);
      const wants = point.info.spinSource?.(world, point.x, point.y) ?? null;
      if (!wants) continue; // null or 0: not driving right now
      const first = wants / ratio.get(index);
      if (speed !== 0 && Math.sign(first) !== Math.sign(speed)) jammed = true;
      if (Math.abs(first) > Math.abs(speed)) speed = first;
    }

    for (const [index, r] of ratio) {
      done.add(index);
      const point = points.get(index);
      const own = jammed ? 0 : speed * r;
      if (Math.abs(own) > MIN_SPEED) turning = true;
      cells.set(index, {
        speed: own,
        jammed,
        axis: point.axis,
        partAxis: point.info.part ? partAxis(world, point.x, point.y, blockInfo) : null,
      });
    }
  }
  return { cells, turning };
}
