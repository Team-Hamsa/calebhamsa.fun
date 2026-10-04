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
 * JAMMED and nothing in it turns.
 *
 * HOW FAST a group turns works like real machines. Every source (a crank,
 * motor or water wheel) has two numbers:
 *
 *   speed      how fast it turns with nothing to push against
 *   strength   how hard it can push (its "torque") before it stops
 *
 * The harder it has to push, the slower it goes: pushing half its
 * strength, it turns at half speed; pushing all of it, it stops.
 * Sources on the same gears ADD their strength together. Gears trade one
 * for the other: a gear turning half as fast pushes twice as hard.
 *
 * Things that push back:
 *   spinLoad   a steady pull, like a weight hanging on a winch's rope.
 *              A weight lying on the ground is different: its rope is
 *              slack, so it can't pull the winch round. It only pulls
 *              back when the winch tries to lift it (see `balance`).
 *   spinDrag   a push back that grows with speed, like a generator
 *              making electricity (more lamps = harder to turn)
 *
 * The group settles at the speed where the pushing and the pushing back
 * balance. Speeds are in turns per second. + is clockwise ↻, − is
 * anticlockwise ↺. Strengths are in "crank-pushes" (see CRANK_STRENGTH).
 * This file only reads the fields blocks have: `spin`, `spinSource`
 * (which is also told the indexes of the blocks in its group), `spinLoad`
 * and `spinDrag`.
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
 * Tidy up what a block's `spinLoad` gave us. It can be just a number (a
 * pull that's always there), or a record:
 *   pull      how hard it pulls (+ is the ↻ way)
 *   resting   true if the load is lying on the ground: its rope is slack,
 *             so it only pulls back while it's being lifted
 *   topSpeed  the fastest the load can pull this block round (turns per
 *             second). A weight on a rope can't go down faster than it
 *             would fall with no rope at all: any faster, and the rope
 *             would go slack.
 * @param {number|{pull: number, resting?: boolean, topSpeed?: number}|undefined} load - from spinLoad
 * @returns {{pull: number, limit: number}} the pull, and the speed (the
 *   way it pulls) at which it stops pulling: 0 for a load on the ground,
 *   Infinity for one that always pulls
 */
function loadOf(load) {
  if (typeof load === 'number') return { pull: load, limit: Infinity };
  if (!load) return { pull: 0, limit: Infinity };
  return { pull: load.pull, limit: load.resting ? 0 : load.topSpeed ?? Infinity };
}

/**
 * Find the speed where all the pushing and pulling on a group balance:
 *
 *   ahead − slowing × speed + (every load that's pulling right now) = 0
 *
 * A plain load always pulls. A load with a `limit` only pulls while the
 * group turns slower than that limit the way the load pulls:
 *
 *   • A weight on the ground has limit 0: it pulls back when it's being
 *     lifted, and not at all when rope is let out. If lifting it is too
 *     much, the group settles at exactly 0: the ground holds the weight
 *     and nothing moves.
 *   • A hanging weight's limit is how fast it would fall. It can speed
 *     the group up to that and no further (the group settles right at
 *     the limit). If the sources go even faster by themselves, the rope
 *     is slack and the weight doesn't push at all.
 *
 * Each load switches off as the speed goes up past its limit, so we try
 * the stretches between the limits one at a time, slowest first.
 * @param {number} ahead - the sources' strengths added up (+ or −)
 * @param {number} slowing - how fast the push fades as the group speeds up (more than 0)
 * @param {Array<{pull: number, limit: number}>} loads - the loads, at the first block
 * @returns {number} the group's speed, at the first block
 */
function balance(ahead, slowing, loads) {
  /**
   * The speed (with + or −) where a load stops pulling.
   * @param {{pull: number, limit: number}} load - a load
   * @returns {number} that speed
   */
  const edge = (load) => Math.sign(load.pull) * load.limit;
  const edges = [...new Set(loads.map(edge).filter(Number.isFinite))].sort((a, b) => a - b);
  for (let k = 0; k <= edges.length; k++) {
    const low = k === 0 ? -Infinity : edges[k - 1];
    const high = k === edges.length ? Infinity : edges[k];
    // Any speed inside this stretch tells us which loads are pulling in it.
    const inside = k === 0 ? (edges.length > 0 ? high - 1 : 0) : (k === edges.length ? low + 1 : (low + high) / 2);
    let pull = 0;
    for (const load of loads) {
      if (inside * Math.sign(load.pull) < load.limit) pull += load.pull;
    }
    const speed = (ahead + pull) / slowing;
    if (speed > high) continue;     // faster than this stretch: try the next one
    if (speed < low) return low;    // a load switches off (or on) right at this edge and holds it there
    return speed;
  }
  return 0; // (never reached: the last stretch has no top)
}

/**
 * Work out how every spinning block turns.
 *
 * Returns a record for every spinning block:
 *   speed     turns per second (+ = ↻ clockwise, − = ↺ anticlockwise)
 *   jammed    true if its group can't turn (two paths disagree)
 *   stalled   true if its group's sources are too weak for its load
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

    // Add up the pushing, all measured at the first block (a gear turning
    // r times as fast as the first block pushes like r times as hard on it).
    // Each source pushes `strength` when still, less as it speeds up, and
    // nothing at its own top speed:   push = strength × (1 − speed / top)
    // So all of them together push    push = ahead − slowing × speed
    // where `ahead` is their strengths added up (with + or −) and
    // `slowing` says how fast their push fades as the group speeds up.
    let ahead = 0;
    let slowing = 0;
    const loads = []; // loads (a hanging weight), at the first block
    let drag = 0; // push-back that grows with speed (generators)
    const members = [...ratio.keys()];
    for (const [index, r] of ratio) {
      const point = points.get(index);
      const source = point.info.spinSource?.(world, point.x, point.y, members) ?? null;
      if (source && source.speed && source.strength > 0) {
        const top = source.speed / r;                // its top speed, at the first block
        const strength = source.strength * Math.abs(r);
        ahead += Math.sign(top) * strength;
        slowing += strength / Math.abs(top);
      }
      const load = loadOf(point.info.spinLoad?.(world, point.x, point.y, blockInfo));
      if (load.pull !== 0) loads.push({ pull: load.pull * r, limit: load.limit / Math.abs(r) });
      drag += (point.info.spinDrag?.(world, point.x, point.y) ?? 0) * r * r;
    }

    // The speed where the pushing and the pushing back balance:
    //   ahead − slowing × speed + pull − drag × speed = 0
    let speed = slowing > 0 ? balance(ahead, slowing + drag, loads) : 0;
    // A winch has a ratchet (a little catch), so a load too heavy for the
    // sources can't pull them backwards: everything just STALLS. (A load
    // on the ground that's too heavy to lift lands here too, at speed 0.)
    let stalled = false;
    if (ahead !== 0 && Math.sign(speed) !== Math.sign(ahead)) {
      speed = 0;
      stalled = true;
    }
    const stopped = jammed || stalled;

    for (const [index, r] of ratio) {
      done.add(index);
      const point = points.get(index);
      const turns = stopped ? 0 : speed * r;
      const own = Math.abs(turns) < MIN_SPEED ? 0 : turns; // also turns −0 into a plain 0
      if (Math.abs(own) > MIN_SPEED) turning = true;
      cells.set(index, {
        speed: own,
        jammed,
        stalled,
        axis: point.axis,
        partAxis: point.info.part ? partAxis(world, point.x, point.y, blockInfo) : null,
      });
    }
  }
  return { cells, turning };
}
