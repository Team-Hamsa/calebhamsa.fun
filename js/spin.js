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
 * A source can say it will turn `eitherWay`: then it helps whichever way
 * the other sources on its gears are pushing, or the way it was already
 * turning. A source can also say it is an `echo` (see solveSpin).
 *
 * Things that push back:
 *   spinLoad   a steady pull, like a weight hanging on a winch's rope.
 *              A weight lying on the ground is different: its rope is
 *              slack, so it can't pull the winch round. It only pulls
 *              back when the winch tries to lift it (see `balance`).
 *   spinDrag   a plain push back that grows with speed, whichever way
 *              the block turns (like stirring honey). No block in the
 *              game uses it right now: the generator used to, and now
 *              has a spinBrake instead. It is kept for new blocks.
 *   spinBrake  a push back that only ever works AGAINST the turning (it
 *              can stop a group, never drive it), like a generator making
 *              electricity (more lamps = harder to turn; see `balance`).
 *              It is told its group's ratios and can ask how fast any
 *              block turns, because generators in one circuit load each
 *              other (see generatorBrake in gears.js).
 *   spinStop   a HARD STOP one way round: the block says it can't turn
 *              ↻ (or ↺) any further, like a winch whose load has been
 *              wound right up to the top. If the group would turn it
 *              that way, the whole group stops dead instead (a hand
 *              crank stops, a motor stalls). The other way is still free.
 *
 * A winch has a RATCHET (a little catch), like a real one: a load
 * hanging on its rope can never pull the gears round by itself. With
 * nothing driving, or with sources that cancel out, the load just hangs
 * there. It comes down only when a source turns the winch the let-out way.
 *
 * The group settles at the speed where the pushing and the pushing back
 * balance. Speeds are in turns per second. + is clockwise ↻, − is
 * anticlockwise ↺. Strengths are in "crank-pushes" (see CRANK_STRENGTH).
 * This file only reads the fields blocks have: `spin`, `spinSource`
 * (which is also told the indexes of the blocks in its group), `spinLoad`
 * (which is also told which blocks have a source turning them), `spinDrag`,
 * `spinBrake` and `spinStop`.
 */
import { getBlock, inBounds } from './world.js';
import { partAxis } from './circuit.js';

/** Which way each side is: [dx, dy]. y counts DOWN, so up is -1. */
const STEP = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };

/** Slower than this counts as standing still. */
export const MIN_SPEED = 0.001;

/** Sources whose pushes add up to less than this cancel each other out. */
const BALANCED = 1e-9;

/** Groups that lean on each other have settled when no speed changes by more than this in a round. */
const SETTLED = 1e-9;

/** The most rounds we go through groups that lean on each other (they nearly always settle much sooner). */
const MAX_ROUNDS = 200;

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
 * spinning blocks around it. Like pipes and wires: both sides, then
 * above and below, then one side, then one above or below.
 *
 * One extra rule, for an axle with just ONE neighbor on each line (the
 * end of a shaft with something beside it): it stays in line with the
 * SHAFT. An axle that points at it with something more behind it (a
 * real shaft) counts most; then a crank, winch or other hub, or a loose
 * axle; then a gear. So putting a gear, a winch or a generator beside
 * the end of a turning shaft never swings the axle round and cuts the
 * shaft. The block beside it just isn't joined: put it on the END.
 * @param {object} world - the world
 * @param {number} x - the axle's column
 * @param {number} y - the axle's row
 * @param {Function} blockInfo - looks up what a block name means
 * @returns {'h'|'v'} the way it faces
 */
export function spinAxis(world, x, y, blockInfo) {
  /**
   * The spin settings of the cell dx, dy away from px, py.
   * @param {number} px - column to start from
   * @param {number} py - row to start from
   * @param {number} dx - columns across
   * @param {number} dy - rows down
   * @returns {object|undefined} its `spin` (undefined if it isn't a spinning block)
   */
  const spinOf = (px, py, dx, dy) => blockInfo(getBlock(world, px + dx, py + dy))?.spin;
  /**
   * How much the neighbor dx, dy away looks like more of this axle's shaft:
   * 3 for an axle that can point back at us and has another spinning
   * block behind it (a shaft that goes on), 2 for a hub or a loose axle,
   * 1 for a gear, 0 for nothing (or an axle that has to face across us).
   * @param {number} dx - columns across
   * @param {number} dy - rows down
   * @returns {number} 0, 1, 2 or 3
   */
  const pulls = (dx, dy) => {
    const spin = spinOf(x, y, dx, dy);
    if (!spin) return 0;
    if (spin.kind !== 'axle') return spin.kind === 'gear' ? 1 : 2;
    // Would that axle have to face across us? It does if it has spinning
    // blocks on both of its sides the other way (and not both our way).
    const nx = x + dx;
    const ny = y + dy;
    const sideways = Boolean(spinOf(nx, ny, -1, 0)) && Boolean(spinOf(nx, ny, 1, 0));
    const upDown = Boolean(spinOf(nx, ny, 0, -1)) && Boolean(spinOf(nx, ny, 0, 1));
    const facesAcross = dx !== 0 ? upDown && !sideways : sideways;
    if (facesAcross) return 0;
    return spinOf(nx, ny, dx, dy) ? 3 : 2;
  };
  const left = Boolean(spinOf(x, y, -1, 0));
  const right = Boolean(spinOf(x, y, 1, 0));
  const up = Boolean(spinOf(x, y, 0, -1));
  const down = Boolean(spinOf(x, y, 0, 1));
  if (left && right) return 'h';
  if (up && down) return 'v';
  if ((left || right) && (up || down)) {
    // One neighbor on each line: stay in line with the shaft.
    const across = Math.max(pulls(-1, 0), pulls(1, 0));
    const along = Math.max(pulls(0, -1), pulls(0, 1));
    return along > across ? 'v' : 'h';
  }
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
 *   ahead − slowing × speed + (every load and brake that's working right now) = 0
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
 * A brake pushes back with  pull + perTurn × speed,  but only while that
 * push-back works AGAINST the turning. So it has two edges: speed 0, and
 * the speed where its push-back is nothing.
 *
 * Loads and brakes switch on or off at their edges. So between two edges
 * the push is a plain straight line, and we can look at the stretches
 * between the edges one at a time.
 *
 * We always START FROM STANDING STILL, like a real machine does, and ask
 * which way the push goes there:
 *
 *   • pushed ↻: the group speeds up ↻ until the push runs out. That is
 *     its speed. (`climb` walks up the stretches to find it.)
 *   • pushed ↺: the same, the other way round.
 *   • neither (a push ↻ would be pushed back harder, and so would a push
 *     ↺): it stays still. It is HELD.
 *
 * This matters when a brake gets WEAKER as the group speeds up (a
 * generator in a loop with a battery and another generator that pushes
 * against it). Then there can be a fast speed where the brakes would let
 * go. But a group that is held at standing still can never get there:
 * nothing gives it the push to start. The speed we return is always one
 * where the pushing and the pushing back really balance (or an edge that
 * holds it), so the group never turns without something paying for it.
 * @param {number} ahead - the sources' strengths added up (+ or −)
 * @param {number} slowing - how fast the push fades as the group speeds up (more than 0)
 * @param {Array<{pull: number, limit: number}>} loads - the loads, at the first block
 * @param {Array<{pull: number, perTurn: number}>} [brakes] - the brakes, at the first block
 * @returns {number} the group's speed, at the first block
 */
function balance(ahead, slowing, loads, brakes = []) {
  const up = climb(ahead, slowing, loads, brakes);
  if (up !== null) return up;
  // The same question the other way round: flip every push, climb, flip the answer back.
  /**
   * A load or brake as it looks with ↻ and ↺ swapped.
   * @param {{pull: number}} thing - a load or a brake
   * @returns {object} the same, pulling the other way
   */
  const flip = (thing) => ({ ...thing, pull: -thing.pull });
  const down = climb(-ahead, slowing, loads.map(flip), brakes.map(flip));
  return down === null ? 0 : -down || 0; // "|| 0" turns −0 into a plain 0
}

/**
 * Starting from standing still, how fast does a group get going the ↻
 * way (see `balance`)?
 *
 * We walk up the stretches between the edges, from speed 0. In each one
 * the push is  ahead + pull − fading × speed.  The group keeps speeding
 * up while the push is more than 0, and settles:
 *
 *   • where the push comes down to 0 inside a stretch, or
 *   • at an edge, if the push is still there just below the edge and
 *     gone (or backwards) just above it: a load or brake that switches
 *     right there holds the group at that speed.
 * @param {number} ahead - the sources' strengths added up (+ or −)
 * @param {number} slowing - how fast the push fades as the group speeds up (more than 0)
 * @param {Array<{pull: number, limit: number}>} loads - the loads, at the first block
 * @param {Array<{pull: number, perTurn: number}>} brakes - the brakes, at the first block
 * @returns {number|null} the speed (more than 0), or null if nothing
 *   pushes the group ↻ from standing still
 */
function climb(ahead, slowing, loads, brakes) {
  /**
   * The speed (with + or −) where a load stops pulling.
   * @param {{pull: number, limit: number}} load - a load
   * @returns {number} that speed
   */
  const edge = (load) => Math.sign(load.pull) * load.limit;
  const brakeEdges = brakes.flatMap((brake) => (brake.perTurn !== 0 ? [-brake.pull / brake.perTurn] : []));
  const edges = [...new Set([...loads.map(edge), ...brakeEdges].filter((value) => Number.isFinite(value) && value > 0))].sort((a, b) => a - b);
  for (let k = 0; k <= edges.length; k++) {
    const low = k === 0 ? 0 : edges[k - 1];
    const high = k === edges.length ? Infinity : edges[k];
    // Any speed inside this stretch tells us which loads and brakes are working in it.
    const inside = k === edges.length ? low + 1 : (low + high) / 2;
    let pull = 0;
    let fading = slowing;
    for (const load of loads) {
      if (inside * Math.sign(load.pull) < load.limit) pull += load.pull;
    }
    for (const brake of brakes) {
      if (brake.pull + brake.perTurn * inside <= 0) continue; // it would help the turning: a brake never does
      pull -= brake.pull;
      fading += brake.perTurn;
    }
    // The push at the slow end of this stretch. None left (or it pushes
    // back)? Then the group gets no faster than this: standing still
    // (null: not turning ↻ at all), or held at the edge it has reached.
    const push = ahead + pull - fading * low;
    if (push <= BALANCED) return k === 0 ? null : low;
    // `fading` is 0 or less when the brakes let go faster than the
    // sources tire: the push only grows in this stretch, so on we go.
    if (fading <= 0) continue;
    const speed = (ahead + pull) / fading;
    if (speed <= high) return speed;
  }
  return null; // (never reached: in the last stretch the push always runs out)
}

/**
 * Leap ahead to where the rounds in solveSpin are heading.
 *
 * Each round moves every group's speed a bit. If two rounds in a row
 * move them almost the same (a long slow creep), we can work out where
 * the creep ends and jump there: it's the spot where "how far a round
 * moves the speeds" would shrink to nothing, if it keeps shrinking the
 * way it did between the last two rounds. (Grown-ups call this Anderson
 * acceleration, or the secant method.)
 * @param {object[]} groups - the groups (their `speed` gets the leap)
 * @param {Map<number, number>} speeds - every block's speed so far (gets the leap too)
 * @param {number[]} from - the speeds this round started from, one for each group
 * @param {number[]} moved - how far this round moved each of them
 * @param {{from: number[], moved: number[]}} last - the same two lists for the round before
 * @returns {void}
 */
function leap(groups, speeds, from, moved, last) {
  let top = 0;
  let bottom = 0;
  moved.forEach((step, k) => {
    const turn = step - last.moved[k]; // how the step itself changed from one round to the next
    top += step * turn;
    bottom += turn * turn;
  });
  if (bottom < 1e-30) return; // the steps didn't change: nothing to go by
  const share = top / bottom;
  if (!Number.isFinite(share)) return;
  groups.forEach((group, k) => {
    if (group.jammed) return;
    const landed = from[k] + moved[k];           // where this round ended
    const before = last.from[k] + last.moved[k]; // where the round before ended
    group.speed = landed - share * (landed - before);
    for (const [index, r] of group.ratio) speeds.set(index, group.speed * r || 0);
  });
}

/**
 * Work out how every spinning block turns.
 *
 * Returns a record for every spinning block:
 *   speed     turns per second (+ = ↻ clockwise, − = ↺ anticlockwise)
 *   jammed    true if its group can't turn (two paths disagree)
 *   stalled   true if its group's sources are too weak for its load
 *   blocked   true if its group is held still by a hard stop: some block
 *             in it can't turn any further the way the sources push (a
 *             winch whose load has reached the top). Never true together
 *             with `stalled` or `jammed`.
 *   stopper   true if THIS block is the one doing the stopping
 *   driven    true if its group has a source trying to turn it (even a
 *             stalled or jammed one)
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

  // First, find every group and add up its sources. (We need to know
  // which groups have something turning them BEFORE weighing the loads:
  // a rope end shared by two winches is carried by the one being turned.)
  const groups = [];
  const drivenCells = new Set();
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
    let pointing = 0; // the push of the sources that get a say in which way an `eitherWay` source turns
    const members = [...ratio.keys()];
    const eitherWay = []; // sources that don't mind which way they turn
    for (const [index, r] of ratio) {
      done.add(index);
      const point = points.get(index);
      const source = point.info.spinSource?.(world, point.x, point.y, members) ?? null;
      if (source && source.speed && source.strength > 0) {
        const top = source.speed / r;                // its top speed, at the first block
        const strength = source.strength * Math.abs(r);
        if (source.eitherWay) {
          // Which way was it turning a moment ago (seen from the first block)?
          const before = (world.signals?.spin?.cells?.get(index)?.speed ?? 0) / r;
          eitherWay.push({ top, strength, before: Math.abs(before * r) > MIN_SPEED ? Math.sign(before) : 0 });
          continue;
        }
        ahead += Math.sign(top) * strength;
        slowing += strength / Math.abs(top);
        if (!source.echo) pointing += Math.sign(top) * strength;
      }
    }
    // A source marked `eitherWay` (a water wheel with water falling dead
    // straight through it) helps whichever way its gears go. Which way is
    // that? We ask, in this order:
    //   1. the other sources with a mind of their own (a crank, a wheel
    //      with water coming off one side, a battery's motor): it joins
    //      in the way they push. So two wheels on one shaft never fight,
    //      and a mirrored build works the same.
    //   2. the way it was already turning: a turning wheel keeps going.
    //      A source marked `echo` (a motor fed by a generator on these
    //      same gears) gets no say in step 1, because its push is only
    //      an echo of that turning. (If it did, a motor wired to push
    //      back would turn the wheel round, which turns the generator's
    //      current round, which turns the motor round... the wheel would
    //      swap ways on every tick. A real wheel is just slowed down.)
    //   3. standing still, with nobody from step 1: any push there is.
    //   4. nothing at all: the first one goes the way it says (↻ for a
    //      wheel) and the rest follow it.
    for (const { top, strength, before } of eitherWay) {
      let way = Math.sign(top);
      if (Math.abs(pointing) > BALANCED) way = Math.sign(pointing);
      else if (before !== 0) way = before;
      else if (Math.abs(ahead) > BALANCED) way = Math.sign(ahead);
      ahead += way * strength;
      pointing += way * strength;
      slowing += strength / Math.abs(top);
    }
    if (slowing > 0) for (const index of members) drivenCells.add(index);
    groups.push({ ratio, jammed, ahead, slowing });
  }
  /**
   * Does this block's group have a source (a crank, a powered motor, a
   * wheel with water) trying to turn it right now?
   * @param {number} index - a spinning block's cell index
   * @returns {boolean} true if it has
   */
  const isDriven = (index) => drivenCells.has(index);

  // What pushes back on each group. Loads and drags are worked out once.
  // Brakes are asked again every time round (see below).
  for (const group of groups) {
    group.loads = []; // loads (a hanging weight), at the first block
    group.drag = 0; // push-back that grows with speed
    group.brakers = []; // the blocks with a spinBrake
    group.stops = []; // hard stops: which block, and which way the FIRST block can't turn because of it
    for (const [index, r] of group.ratio) {
      const point = points.get(index);
      const load = loadOf(point.info.spinLoad?.(world, point.x, point.y, blockInfo, isDriven));
      if (load.pull !== 0) group.loads.push({ pull: load.pull * r, limit: load.limit / Math.abs(r) });
      group.drag += (point.info.spinDrag?.(world, point.x, point.y) ?? 0) * r * r;
      if (point.info.spinBrake) group.brakers.push({ point, r });
      const stop = point.info.spinStop?.(world, point.x, point.y, blockInfo, isDriven) ?? 0;
      if (stop !== 0) group.stops.push({ index, way: Math.sign(stop * r) });
    }
  }

  // Every block's speed so far. We start from last time's speeds: a good
  // first guess, so a machine that's running steadily settles at once.
  const speeds = new Map();
  for (const index of points.keys()) speeds.set(index, world.signals?.spin?.cells?.get(index)?.speed ?? 0);
  let asked = false; // did a brake ask how fast a block in ANOTHER group turns?
  /**
   * Work out one group's speed, from its sources, loads and brakes.
   * @param {object} group - the group
   * @returns {{speed: number, stalled: boolean, blockedWay: number}} its
   *   speed at the first block, whether it's stalled, and the way (+1 or
   *   −1, at the first block) a hard stop is holding it (0 if none is)
   */
  const settle = (group) => {
    const { ratio, ahead, slowing, loads, drag } = group;
    const brakes = [];
    /**
     * How fast a block is turning (for brakes that depend on other groups).
     * @param {number} index - a spinning block's cell index
     * @returns {number} turns per second
     */
    const speedOf = (index) => {
      if (!ratio.has(index)) asked = true;
      return speeds.get(index) ?? 0;
    };
    for (const { point, r } of group.brakers) {
      const brake = point.info.spinBrake(world, point.x, point.y, { ratio, speedOf }) ?? null;
      if (brake) brakes.push({ pull: brake.pull * r, perTurn: brake.perTurn * r * r });
    }
    // The speed where the pushing and the pushing back balance:
    //   ahead − slowing × speed + pull − drag × speed − brakes = 0
    let speed = slowing > 0 ? balance(ahead, slowing + drag, loads, brakes) : 0;
    // A winch has a ratchet (a little catch): a hanging load can never
    // pull the winch round by itself. It only comes down when the
    // sources really turn the winch the let-out way. So:
    //   • the sources push one way but the load would win: everything
    //     STALLS. (A load on the ground that's too heavy to lift lands
    //     here too, at speed 0.)
    //   • the sources push the same both ways (two cranks that cancel
    //     out): no push is left to lift with, so it stalls just the same.
    //   • no sources at all: the catch holds. Nothing is even trying, so
    //     that isn't called stalled.
    const driven = Math.abs(ahead) > BALANCED;
    const hanging = loads.reduce((sum, load) => sum + (load.limit > 0 ? load.pull : 0), 0);
    let stalled = false;
    if (driven ? Math.sign(speed) !== Math.sign(ahead) : slowing > 0 && hanging !== 0) stalled = true;
    if (stalled || !driven) speed = 0;
    // A hard stop (a winch whose load is already at the top): if the
    // group would turn that block the way it can't go, everything stops
    // dead, just like a real winch when the hook reaches the drum. The
    // stop takes all the push, so nothing moves and no work is done.
    // Push the other way and it turns freely again.
    let blockedWay = 0;
    if (speed !== 0 && group.stops.some((stop) => stop.way === Math.sign(speed))) {
      blockedWay = Math.sign(speed);
      speed = 0;
    }
    return { speed, stalled, blockedWay };
  };

  // Groups can lean on each other: two generators in the same circuit,
  // each on its own gears, both feel the current they make TOGETHER. So
  // one group's speed depends on the other's. We go round all the groups
  // again and again, each time using the newest speeds, until nothing
  // changes any more. (That always settles: every generator only ever
  // pushes back.) Groups that don't lean on any other need just one go.
  //
  // While we go round we keep every speed exactly as worked out, however
  // tiny. Only at the very end does "slower than MIN_SPEED" count as
  // standing still. (Cutting tiny speeds off on the way made two machines
  // exactly alike come out different: the first one turned, the second
  // was cut to 0, and the rounds stopped there.)
  let guess = null; // the last round: the speeds it started from, and how far it moved them
  let leaping = true; // are the leaps ahead (see `leap`) still helping?
  for (const group of groups) group.speed = speeds.get(group.ratio.keys().next().value) ?? 0; // the first block's speed is the group's
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const from = groups.map((group) => group.speed);
    let change = 0;
    for (const group of groups) {
      const { speed, stalled, blockedWay } = settle(group);
      group.speed = group.jammed || stalled ? 0 : speed;
      group.stalled = stalled;
      group.blockedWay = group.jammed ? 0 : blockedWay;
      for (const [index, r] of group.ratio) {
        const own = group.speed * r || 0; // "|| 0" turns −0 into a plain 0
        change = Math.max(change, Math.abs(own - speeds.get(index)));
        speeds.set(index, own);
      }
    }
    if (!asked || change < SETTLED) break;
    // Groups that lean hard on each other creep toward the answer in ever
    // smaller steps. So we look at how the last two rounds went and LEAP
    // ahead to where the steps are heading. The next round checks the
    // leap like any other guess, so a bad leap can't give a wrong answer.
    const moved = groups.map((group, k) => group.speed - from[k]);
    if (leaping && guess && round < MAX_ROUNDS - 1) {
      const size = Math.hypot(...moved);
      if (size > guess.size * 2) leaping = false; // the leaps are making it worse: plain rounds from here on
      else leap(groups, speeds, from, moved, guess);
    }
    guess = { from, moved, size: Math.hypot(...moved) };
  }
  for (const [index, speed] of speeds) {
    if (Math.abs(speed) < MIN_SPEED) speeds.set(index, 0);
  }

  const cells = new Map();
  let turning = false;
  for (const { ratio, jammed, slowing, stalled, blockedWay, stops } of groups) {
    const stoppers = new Set(stops.filter((stop) => stop.way === blockedWay).map((stop) => stop.index));
    for (const index of ratio.keys()) {
      const point = points.get(index);
      const own = speeds.get(index);
      if (Math.abs(own) > MIN_SPEED) turning = true;
      cells.set(index, {
        speed: own,
        jammed,
        stalled,
        blocked: blockedWay !== 0,
        stopper: stoppers.has(index),
        driven: slowing > 0,
        axis: point.axis,
        partAxis: point.info.part ? partAxis(world, point.x, point.y, blockInfo) : null,
      });
    }
  }
  return { cells, turning };
}
