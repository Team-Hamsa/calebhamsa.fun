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
 * water wheel or turbine) has two numbers:
 *
 *   speed      how fast it turns with nothing to push against
 *   strength   how hard it can push (its "torque") before it stops
 *
 * The harder it has to push, the slower it goes: pushing half its
 * strength, it turns at half speed; pushing all of it, it stops.
 * Sources on the same gears ADD their strength together. Gears trade one
 * for the other: a gear turning half as fast pushes twice as hard.
 * A source can say it will turn `eitherWay`: then it helps whichever way
 * its gears are pushed, or the way it was already turning (see solveSpin).
 *
 * Things that push back:
 *   spinLoad   a steady pull, like a weight hanging on a winch's rope.
 *              A weight lying on the ground is different: its rope is
 *              slack, so it can't pull the winch round. It only pulls
 *              back when the winch tries to lift it (see `balance`).
 *              And a load can be harder to LIFT than it is heavy coming
 *              down (it has steam to push out of its way: see `loadsOf`).
 *   spinDrag   a plain push back that grows with speed, whichever way
 *              the block turns (like stirring honey, or a bearing that
 *              rubs). Motors and generators have a little.
 *   spinStop   a HARD STOP one way round: the block says it can't turn
 *              ↻ (or ↺) any further, like a winch whose load has been
 *              wound right up to the top. If the group would turn it
 *              that way, the whole group stops dead instead (a hand
 *              crank stops, a motor stalls). The other way is still free.
 *
 * And one thing that can push EITHER way, and joins groups together:
 *   spinLink   a push that depends on how fast OTHER blocks turn, maybe
 *              blocks on quite different gears. A motor or generator has
 *              one: the current through its coil pushes on its shaft, and
 *              that current depends on every machine wired into the same
 *              circuit. The block says:
 *
 *                push on me = still − perTurn(a) × a's speed − perTurn(b) × b's speed − ...
 *
 *              `still` is the push when everything stands still (a
 *              battery's current). `perTurn` lists the blocks whose
 *              turning changes the push (the block itself is one of them).
 *              The block PROMISES two things, and real coils keep both:
 *              `perTurn` is the same both ways round between two blocks,
 *              and all together it never helps the turning along, it only
 *              ever rubs like a slipping clutch. So turning is passed on,
 *              never made.
 *
 * Groups joined by links can't be worked out one at a time: each one's
 * speed depends on the others'. We work them out TOGETHER (see
 * solveSpin), always starting from standing still, so the answer never
 * depends on what happened a tick ago.
 *
 * A winch has a RATCHET (a little catch), like a real one: a load
 * hanging on its rope can never pull the gears round by itself. With
 * nothing driving, or with pushes that cancel, the load just hangs
 * there. It comes down only when something turns the winch the let-out way.
 *
 * The group settles at the speed where the pushing and the pushing back
 * balance. Speeds are in turns per second. + is clockwise ↻, − is
 * anticlockwise ↺. Strengths are in "crank-pushes" (see CRANK_STRENGTH).
 * This file only reads the fields blocks have: `spin`, `spinSource`
 * (which is also told the indexes of the blocks in its group), `spinLoad`
 * (which is also told which blocks have something turning them),
 * `spinDrag`, `spinLink` and `spinStop`.
 */
import { getBlock, inBounds } from './world.js';
import { partAxis, solveLinear } from './circuit.js';
import { drawingSides } from './fluids.js';

/** Which way each side is: [dx, dy]. y counts DOWN, so up is -1. */
const STEP = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };

/** Slower than this counts as standing still. */
export const MIN_SPEED = 0.001;

/** Pushes that add up to less than this cancel each other out. */
const BALANCED = 1e-9;

/** Groups that lean on each other have settled when no speed is further than this from where its pushes balance. */
const SETTLED = 1e-9;

/** The most straight-line steps we take to settle groups that lean on each other (two is nearly always enough). */
const NEWTON_STEPS = 20;

/** If the steps don't settle: the most plain rounds we go through the groups one at a time. */
const SWEEPS = 60;

/**
 * A count of the work done so far settling groups that lean on each
 * other, for tests and timing tools. `clusters` goes up every time a
 * set of such groups is settled, `passes` for every straight-line step
 * that takes, `sweeps` for every plain round, and `holds` every time a
 * group had to be held still because it would not settle.
 */
export const spinWork = { clusters: 0, passes: 0, sweeps: 0, holds: 0 };
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
 *   lifting   how hard it pulls back while it is being LIFTED (turned
 *             against its pull), if that is harder than `pull`: a load
 *             that has to push steam out of its way going up is harder
 *             to lift than it is heavy coming down. Left out, it pulls
 *             the same both ways.
 *   resting   true if the load is lying on the ground (or floating on
 *             water): its rope is slack, so it only pulls back while
 *             it's being lifted
 *   topSpeed  the fastest the load can pull this block round (turns per
 *             second). A weight on a rope can't go down faster than it
 *             would fall with no rope at all: any faster, and the rope
 *             would go slack.
 * @param {number|{pull: number, lifting?: number, resting?: boolean, topSpeed?: number}|undefined} load - from spinLoad
 * @returns {Array<{pull: number, limit: number}>} its pulls, each with
 *   the speed (the way it pulls) at which it stops pulling: 0 for a pull
 *   that is only there while the load is being lifted, Infinity for one
 *   that is always there. (Pulls of 0 are left out.)
 */
function loadsOf(load) {
  if (typeof load === 'number') return load !== 0 ? [{ pull: load, limit: Infinity }] : [];
  if (!load) return [];
  const lifting = load.lifting ?? load.pull;
  // Coming down (or just hanging) it pulls with `pull`. Being lifted, it
  // pulls with `lifting`: that's `pull`, and the rest only while it goes up.
  const hanging = load.resting ? 0 : load.pull;
  const loads = [{ pull: hanging, limit: load.topSpeed ?? Infinity }, { pull: lifting - hanging, limit: 0 }];
  return loads.filter((one) => one.pull !== 0);
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
 *     the limit). If the pushes go even faster by themselves, the rope
 *     is slack and the weight doesn't push at all.
 *
 * Loads switch on or off at their edges. So between two edges the push
 * is a plain straight line, and we can look at the stretches between
 * the edges one at a time.
 *
 * We always START FROM STANDING STILL, like a real machine does, and ask
 * which way the push goes there:
 *
 *   • pushed ↻: the group speeds up ↻ until the push runs out. That is
 *     its speed. (`climb` walks up the stretches to find it.)
 *   • pushed ↺: the same, the other way round.
 *   • neither: it stays still.
 *
 * The speed we return is always one where the pushing and the pushing
 * back really balance (or an edge that holds it), so the group never
 * turns without something paying for it.
 * @param {number} ahead - the push on the group standing still (+ or −)
 * @param {number} slowing - how fast the push fades as the group speeds up (more than 0)
 * @param {Array<{pull: number, limit: number}>} loads - the loads, at the first block
 * @returns {{speed: number, free: boolean}} the group's speed, at the
 *   first block, and whether it is running FREE there: in the middle of
 *   a stretch, so a little more push would make it a little faster.
 *   (Standing still, or held at an edge, it isn't.)
 */
function balance(ahead, slowing, loads) {
  const up = climb(ahead, slowing, loads);
  if (up !== null) return up;
  // The same question the other way round: flip every push, climb, flip the answer back.
  const down = climb(-ahead, slowing, loads.map((load) => ({ ...load, pull: -load.pull })));
  return down === null ? { speed: 0, free: false } : { speed: -down.speed || 0, free: down.free }; // "|| 0" turns −0 into a plain 0
}

/**
 * Starting from standing still, how fast does a group get going the ↻
 * way (see `balance`)?
 *
 * We walk up the stretches between the edges, from speed 0. In each one
 * the push is  ahead + pull − slowing × speed.  The group keeps speeding
 * up while the push is more than 0, and settles:
 *
 *   • where the push comes down to 0 inside a stretch, or
 *   • at an edge, if the push is still there just below the edge and
 *     gone (or backwards) just above it: a load that switches right
 *     there holds the group at that speed.
 * @param {number} ahead - the push on the group standing still (+ or −)
 * @param {number} slowing - how fast the push fades as the group speeds up (more than 0)
 * @param {Array<{pull: number, limit: number}>} loads - the loads, at the first block
 * @returns {{speed: number, free: boolean}|null} the speed (more than 0)
 *   and whether it is in the middle of a stretch, or null if nothing
 *   pushes the group ↻ from standing still
 */
function climb(ahead, slowing, loads) {
  /**
   * The speed (with + or −) where a load stops pulling.
   * @param {{pull: number, limit: number}} load - a load
   * @returns {number} that speed
   */
  const edge = (load) => Math.sign(load.pull) * load.limit;
  const edges = [...new Set(loads.map(edge).filter((value) => Number.isFinite(value) && value > 0))].sort((a, b) => a - b);
  for (let k = 0; k <= edges.length; k++) {
    const low = k === 0 ? 0 : edges[k - 1];
    const high = k === edges.length ? Infinity : edges[k];
    // Any speed inside this stretch tells us which loads are pulling in it.
    const inside = k === edges.length ? low + 1 : (low + high) / 2;
    let pull = 0;
    for (const load of loads) {
      if (inside * Math.sign(load.pull) < load.limit) pull += load.pull;
    }
    // The push at the slow end of this stretch. None left (or it pushes
    // back)? Then the group gets no faster than this: standing still
    // (null: not turning ↻ at all), or held at the edge it has reached.
    const push = ahead + pull - slowing * low;
    if (push <= BALANCED) return k === 0 ? null : { speed: low, free: false };
    const speed = (ahead + pull) / slowing;
    if (speed <= high) return { speed, free: true };
  }
  return null; // (never reached: in the last stretch the push always runs out)
}

/**
 * Work out how every spinning block turns.
 *
 * Returns a record for every spinning block:
 *   speed     turns per second (+ = ↻ clockwise, − = ↺ anticlockwise)
 *   jammed    true if its group can't turn (two paths disagree)
 *   stalled   true if its group's pushes are too weak for its load
 *   blocked   true if its group is held still by a hard stop: some block
 *             in it can't turn any further the way it is pushed (a
 *             winch whose load has reached the top). Never true together
 *             with `stalled` or `jammed`.
 *   stopper   true if THIS block is the one doing the stopping
 *   driven    true if something is trying to turn its group: a source on
 *             it (even a stalled or jammed one), a battery's current in
 *             one of its machines, or a link to a group that has those
 *   axis      for axles: the way it faces
 *   partAxis  for blocks that are also electric parts (motors,
 *             generators): the way they face in a circuit
 *   sides     for blocks that are also fluid blocks (water wheels,
 *             turbines): the sides fluid goes in and out by, for drawing
 *
 * HOW GROUPS THAT LEAN ON EACH OTHER ARE SETTLED. A block with a
 * `spinLink` (a motor or generator) is pushed by how fast other blocks
 * turn. Put every block's push at its group's first block, and each
 * group g feels
 *
 *   push(g) = still(g) − lean(g, g) × speed(g) − lean(g, h) × speed(h) − ...
 *
 * for every group h it is linked to. Groups linked like that (directly,
 * or through others) are a CLUSTER, and a cluster is settled like this:
 *
 *   1. Everybody starts from standing still.
 *   2. Each group works out where it would settle if the others kept the
 *      speeds they have now (`settle`: sources, loads, the ratchet, hard
 *      stops), and whether it is running free there.
 *   3. If nobody would move, that's the answer.
 *   4. Otherwise: between its edges every group's speed is a straight
 *      line in the others' speeds. So we solve all those lines at once
 *      (a small grid of sums, one unknown for each group), and go back
 *      to step 2 to check. When no group switched between "free" and
 *      "held", that one solve IS the answer: two goes, however hard the
 *      groups lean on each other. (Grown-ups call this Newton's method.)
 *
 * If that hasn't settled after NEWTON_STEPS goes (only a winch's catch
 * can do that: it lets go with a jump), we go round the groups one at a
 * time for a while. Any group STILL changing after that is held still,
 * and the rest are settled again around it. Each time at least one more
 * group is held, so it always ends.
 *
 * THE PROMISE: every group we report as turning has its pushes exactly
 * balanced at the speeds we report, and every other group stands still.
 * A group standing still does no work. So nothing here, not even the
 * emergency way out, can report turning that nobody pays for.
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

  // First, find every group: walk it, giving every block its ratio to the first block.
  const groups = [];
  const groupOf = new Map(); // cell index → its group
  for (const start of points.keys()) {
    if (groupOf.has(start)) continue;
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
    const group = { ratio, jammed, held: false, gaveUp: false, speed: 0 };
    for (const index of ratio.keys()) groupOf.set(index, group);
    groups.push(group);
  }

  // Next, the links (see the top of this file), all measured at each
  // group's first block. A gear turning r times as fast as the first
  // block pushes like r times as hard on it, and turns r times as fast:
  //   still(g)   = every linked block's `still` × its r, added up
  //   lean(g, h) = perTurn(block in g, block in h) × the one's r × the other's r, added up
  for (const group of groups) {
    group.still = 0;
    group.lean = new Map(); // group → how hard its turning pushes back on this one
    for (const [index, r] of group.ratio) {
      const point = points.get(index);
      const link = point.info.spinLink?.(world, point.x, point.y) ?? null;
      if (!link) continue;
      group.still += link.still * r;
      for (const [other, perTurn] of link.perTurn) {
        const far = groupOf.get(other);
        if (!far || perTurn === 0) continue;
        group.lean.set(far, (group.lean.get(far) ?? 0) + perTurn * r * far.ratio.get(other));
      }
    }
  }

  // Then the sources. Each pushes `strength` when still, less as it
  // speeds up, and nothing at its own top speed:
  //     push = strength × (1 − speed / top)
  // So all of them together push    push = ahead − slowing × speed
  // where `ahead` is their strengths added up (with + or −) and
  // `slowing` says how fast their push fades as the group speeds up.
  for (const group of groups) {
    let ahead = 0;
    let slowing = 0;
    const members = [...group.ratio.keys()];
    const eitherWay = []; // sources that don't mind which way they turn
    for (const [index, r] of group.ratio) {
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
      }
    }
    // A source marked `eitherWay` (a water wheel with water falling dead
    // straight through it, or a turbine) helps whichever way its gears
    // go. Which way is that? We decide it now, before any speed is worked
    // out, and ask in this order:
    //   1. the pushes that don't depend on any turning at all: the other
    //      sources on its gears (a crank, a wheel with water coming off
    //      one side) and what a battery's current pushes through a motor
    //      or generator on them (`still`). It joins in the way they push.
    //      So two wheels on one shaft never fight, and a mirrored build
    //      works the same.
    //   2. the way it was already turning: a turning wheel keeps going.
    //   3. nothing at all: the first one goes the way it says (↻ for a
    //      wheel) and the rest follow it.
    // A link's push that comes from OTHER gears turning gets no say: it
    // is only ever passed on from turning that is already there. (If
    // something stronger does turn the wheel backwards, the wheel pushes
    // back harder, like a crank turned the wrong way, and on the next
    // tick rule 2 lets it go along.)
    let pointing = ahead + group.still;
    for (const { top, strength, before } of eitherWay) {
      let way = Math.sign(top);
      if (Math.abs(pointing) > BALANCED) way = Math.sign(pointing);
      else if (before !== 0) way = before;
      ahead += way * strength;
      pointing += way * strength;
      slowing += strength / Math.abs(top);
    }
    group.ahead = ahead;
    group.slowing = slowing;
    // Is something trying to turn it? A source, or a battery's current in a machine...
    group.powered = slowing > 0 || Math.abs(group.still) > BALANCED;
  }

  // ...or a link to a group that has those. Groups joined by links
  // (directly, or through others) are a CLUSTER: they are settled together.
  const clusters = [];
  for (const group of groups) {
    for (const [far, lean] of group.lean) {
      // The promise says a link is the same both ways round. We join both ways anyway.
      if (far !== group && lean !== 0 && !far.lean.has(group)) far.lean.set(group, 0);
    }
  }
  for (const start of groups) {
    if (start.cluster) continue;
    const cluster = [start];
    start.cluster = cluster;
    for (let k = 0; k < cluster.length; k++) {
      for (const far of cluster[k].lean.keys()) {
        if (far.cluster) continue;
        far.cluster = cluster;
        cluster.push(far);
      }
    }
    clusters.push(cluster);
    if (cluster.some((group) => group.powered)) for (const group of cluster) group.powered = true;
  }
  /**
   * Is something trying to turn this block's group right now (a crank, a
   * wheel with water, a battery's motor, or a machine wired to gears
   * that have one)?
   * @param {number} index - a spinning block's cell index
   * @returns {boolean} true if there is
   */
  const isDriven = (index) => Boolean(groupOf.get(index)?.powered);

  // What pushes back on each group, worked out once.
  for (const group of groups) {
    group.loads = []; // loads (a hanging weight), at the first block
    group.drag = 0; // push-back that grows with speed
    group.stops = []; // hard stops: which block, and which way the FIRST block can't turn because of it
    group.reach = 0; // how fast its fastest block turns, compared to the first block
    for (const [index, r] of group.ratio) {
      const point = points.get(index);
      for (const load of loadsOf(point.info.spinLoad?.(world, point.x, point.y, blockInfo, isDriven))) {
        group.loads.push({ pull: load.pull * r, limit: load.limit / Math.abs(r) });
      }
      group.drag += (point.info.spinDrag?.(world, point.x, point.y) ?? 0) * r * r;
      const stop = point.info.spinStop?.(world, point.x, point.y, blockInfo, isDriven) ?? 0;
      if (stop !== 0) group.stops.push({ index, way: Math.sign(stop * r) });
      group.reach = Math.max(group.reach, Math.abs(r));
    }
  }

  /**
   * Where one group would settle if every other group kept the speed it
   * has right now.
   * @param {object} group - the group
   * @returns {{speed: number, give: number, stalled: boolean, blockedWay: number}} its
   *   speed at the first block; its `give`: how much faster it would go
   *   for each bit of extra push (0 when it is held: stalled, at a load's
   *   edge, at a hard stop, jammed, or with nothing turning it); whether
   *   it's stalled; and the way (+1 or −1, at the first block) a hard
   *   stop is holding it (0 if none is)
   */
  const settle = (group) => {
    if (group.jammed) return { speed: 0, give: 0, stalled: false, blockedWay: 0 };
    if (group.held) return { speed: 0, give: 0, stalled: group.gaveUp, blockedWay: 0 };
    // The push on it standing still: its sources, a battery's current in
    // its machines, and what the OTHER groups' turning pushes through its links.
    let push = group.ahead + group.still;
    for (const [far, lean] of group.lean) {
      if (far !== group) push -= lean * far.speed;
    }
    // How fast that push fades as it speeds up: its sources tire, its
    // bearings rub, and its own machines push back harder.
    const fading = group.slowing + group.drag + (group.lean.get(group) ?? 0);
    // The speed where the pushing and the pushing back balance:
    //   push − fading × speed + loads = 0
    const driven = Math.abs(push) > BALANCED;
    let { speed, free } = driven && fading > 0 ? balance(push, fading, group.loads) : { speed: 0, free: false };
    // A winch has a ratchet (a little catch): a hanging load can never
    // pull the winch round by itself. It only comes down when the
    // pushes really turn the winch the let-out way. So:
    //   • the pushes go one way but the load would win: everything
    //     STALLS. (A load on the ground that's too heavy to lift lands
    //     here too, at speed 0.)
    //   • the pushes cancel out (two cranks, one each way): no push is
    //     left to lift with, so it stalls just the same.
    //   • nothing is trying to turn it at all: the catch holds. That
    //     isn't called stalled.
    const hanging = group.loads.reduce((sum, load) => sum + (load.limit > 0 ? load.pull : 0), 0);
    let stalled = false;
    if (driven ? Math.sign(speed) !== Math.sign(push) : group.powered && hanging !== 0) stalled = true;
    if (stalled || !driven) {
      speed = 0;
      free = false;
    }
    // A hard stop (a winch whose load is already at the top): if the
    // group would turn that block the way it can't go, everything stops
    // dead, just like a real winch when the hook reaches the drum. The
    // stop takes all the push, so nothing moves and no work is done.
    // Push the other way and it turns freely again.
    let blockedWay = 0;
    if (speed !== 0 && group.stops.some((stop) => stop.way === Math.sign(speed))) {
      blockedWay = Math.sign(speed);
      speed = 0;
      free = false;
    }
    return { speed, give: free ? 1 / fading : 0, stalled, blockedWay };
  };

  /**
   * Write down where a group has settled.
   * @param {object} group - the group
   * @param {{speed: number, stalled: boolean, blockedWay: number}} answer - from `settle`
   * @returns {void}
   */
  const keep = (group, answer) => {
    group.speed = answer.speed;
    group.stalled = answer.stalled;
    group.blockedWay = answer.blockedWay;
  };

  /**
   * Settle one cluster (see the top of this function): straight-line
   * steps first; if those don't settle, plain rounds; and at the very
   * last, hold still whatever is still changing and settle the rest again.
   * @param {object[]} cluster - the groups that lean on each other
   * @returns {void}
   */
  const settleCluster = (cluster) => {
    for (;;) {
      for (const group of cluster) group.speed = 0; // always from standing still
      if (cluster.length === 1) {
        keep(cluster[0], settle(cluster[0])); // nobody else to wait for: one go
      } else if (!stepTogether(cluster) && !goRound(cluster)) {
        continue; // some groups were held still: settle the rest again
      }
      // Too slow to see counts as standing still. But a group we hold
      // still pushes differently on its neighbors than one that creeps,
      // so the others are settled again around it: what we report is
      // exactly balanced.
      const creeping = cluster.filter((group) => group.speed !== 0 && Math.abs(group.speed) * group.reach < MIN_SPEED);
      if (creeping.length === 0) return;
      for (const group of creeping) group.held = true;
      if (cluster.length === 1) {
        keep(cluster[0], settle(cluster[0]));
        return;
      }
    }
  };

  /**
   * Settle a cluster by straight-line steps (step 2 to 4 at the top of
   * solveSpin).
   * @param {object[]} cluster - the groups
   * @returns {boolean} true if it settled
   */
  const stepTogether = (cluster) => {
    const place = new Map(cluster.map((group, k) => [group, k]));
    spinWork.clusters += 1;
    for (let step = 0; step < NEWTON_STEPS; step++) {
      spinWork.passes += 1;
      const answers = cluster.map(settle);
      if (answers.every((answer, k) => Math.abs(answer.speed - cluster[k].speed) <= SETTLED)) {
        cluster.forEach((group, k) => keep(group, answers[k]));
        return true;
      }
      // Every free group's line:  speed(g) + give(g) × lean(g, h) × speed(h) + ... = the same with the speeds we have now.
      // Every held group just keeps its answer.
      const grid = cluster.map((group, k) => cluster.map((other, j) => (j === k ? 1 : 0)));
      const sums = answers.map((answer) => answer.speed);
      cluster.forEach((group, k) => {
        const give = answers[k].give;
        if (give === 0) return;
        for (const [far, lean] of group.lean) {
          if (far === group) continue;
          grid[k][place.get(far)] += give * lean;
          sums[k] += give * lean * far.speed;
        }
      });
      const speeds = solveLinear(grid, sums) ?? answers.map((answer) => answer.speed);
      cluster.forEach((group, k) => { group.speed = speeds[k] || 0; });
    }
    return false;
  };

  /**
   * Settle a cluster the plain way: go round the groups one at a time,
   * each using the newest speeds, until nothing changes. If that doesn't
   * end either, hold still every group that is still changing.
   * @param {object[]} cluster - the groups
   * @returns {boolean} true if it settled; false if groups had to be
   *   held still (the cluster must then be settled again)
   */
  const goRound = (cluster) => {
    for (const group of cluster) group.speed = 0;
    let changes = [];
    for (let round = 0; round < SWEEPS; round++) {
      spinWork.sweeps += 1;
      changes = cluster.map((group) => {
        const answer = settle(group);
        const change = Math.abs(answer.speed - group.speed);
        keep(group, answer);
        return change;
      });
      if (changes.every((change) => change <= SETTLED)) return true;
    }
    cluster.forEach((group, k) => {
      if (changes[k] <= SETTLED) return;
      group.held = true;
      group.gaveUp = true; // it shows as stalled
      spinWork.holds += 1;
    });
    return false;
  };

  for (const cluster of clusters) settleCluster(cluster);

  const cells = new Map();
  let turning = false;
  for (const { ratio, jammed, powered, speed, stalled, blockedWay, stops } of groups) {
    const stoppers = new Set(stops.filter((stop) => stop.way === blockedWay).map((stop) => stop.index));
    if (speed !== 0) turning = true;
    for (const [index, r] of ratio) {
      const point = points.get(index);
      cells.set(index, {
        speed: speed * r || 0, // "|| 0" turns −0 into a plain 0
        jammed,
        stalled,
        blocked: blockedWay !== 0,
        stopper: stoppers.has(index),
        driven: powered,
        axis: point.axis,
        partAxis: point.info.part ? partAxis(world, point.x, point.y, blockInfo) : null,
        sides: point.info.fluid ? drawingSides(world, point.x, point.y, blockInfo) : null,
      });
    }
  }
  return { cells, turning };
}
