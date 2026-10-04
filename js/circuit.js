/**
 * circuit.js — works out how electricity flows through the world.
 *
 * Every wire, gold block and electric part is a "point". Points that
 * touch (and face each other) are joined by a connection, which is
 * like a tiny resistor, and batteries add a push:
 *
 *     🔋 ━━ ━━ 💡 ━━         each ━━ joint is a connection
 *
 * Then we solve the circuit the way electricians do (Kirchhoff's law:
 * at every point, the current flowing in equals the current flowing
 * out). That tells us the current through every connection, which way
 * it goes, and so how bright each lamp is.
 *
 * This file knows nothing about which blocks exist. It only reads the
 * fields blocks have: `conducts`, `part`, `partWhen`, `electric`. A part
 * pushes with `part.push` volts, or, if it has `part.pushNow`, with
 * whatever that says right now (a turbine pushes harder with more steam).
 * A part with `part.feelsLoad` (a generator) is also told its "load", and
 * every part in its circuit is told how much of its current comes from
 * each generator (see shareOut).
 */
import { getBlock, inBounds } from './world.js';

/** The four sides of a cell, in the order we always list them. */
export const SIDES = ['up', 'right', 'down', 'left'];

/** Which way each side is: [dx, dy]. y counts DOWN, so up is -1. */
const STEP = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };

/** The side facing back the other way. */
export const OPPOSITE = { up: 'down', right: 'left', down: 'up', left: 'right' };

/**
 * Half of a wire's resistance (each connection gets half from each end).
 * Real wire has a tiny bit of resistance, so we give it a tiny number.
 */
export const WIRE_HALF_RESISTANCE = 0.0005;

/**
 * The current that flows when one lamp (resistance 1) sits in a loop
 * with one battery (push 1, resistance 0.05). A lamp with exactly this
 * much current shows brightness level 1.
 */
export const REFERENCE_CURRENT = 1 / (1 + 0.05);

/** The brightest a lamp can show (twice as bright as normal). */
export const MAX_LEVEL = 2;

/** Parts at least this "wire-like" (low resistance) count as wire when hunting for short circuits. */
const SHORT_PATH_RESISTANCE = 0.01;

/**
 * A short circuit only sparks if the battery is really pushing a lot of
 * current: more than this. (Two batteries pushing against each other
 * make a loop with no current, which is safe.) A big current alone is
 * NOT a short circuit: a battery lighting six lamps works hard, but
 * every bit of its current goes through a lamp.
 */
const SHORT_CURRENT = 2 * REFERENCE_CURRENT;

/**
 * A changing push (a turbine's, a generator's) is counted in steps this
 * big, in volts. Less than one step counts as no push at all.
 */
export const PUSH_STEP = 0.01;

/** Less current than this counts as "nothing is flowing". */
export const FLOW_MIN = 0.01;

/**
 * Is this block part of electricity at all (even a switch that's open
 * right now)? Parts use this to decide which way to face.
 * @param {object|undefined} info - the block's definition
 * @returns {boolean} true for wires, conductors, parts and `electric` blocks
 */
export function isElectric(info) {
  return Boolean(info && (info.conducts || info.part || info.electric));
}

/**
 * The block's part settings if it's a working part RIGHT NOW. A clicker
 * is only a part on its "on" beat; the rest of the time it's a gap.
 * @param {object|undefined} info - the block's definition
 * @param {object} world - the world (the clicker reads world.ticks)
 * @returns {{resistance: number, push?: number}|null} the part, or null
 */
export function activePart(info, world) {
  if (!info?.part) return null;
  if (info.partWhen && !info.partWhen(world)) return null;
  return info.part;
}

/**
 * Which way a part faces: sideways ('h') or up-down ('v'). It looks at
 * its four neighbors. Wires (and gold) come first, because a part can
 * always join a wire; then anything electric (other parts, switches):
 *   1. wire on both left and right     → sideways
 *   2. wire both above and below       → up-down
 *   3. electric on both left and right → sideways
 *   4. electric on both up and down    → up-down
 *   5. electric on the left or right   → sideways
 *   6. electric above or below         → up-down
 *   7. nothing around                  → sideways
 * Rules 1 and 2 are why lamps packed side by side between two wire
 * rails all face the rails (and all light), instead of the middle ones
 * turning to face their neighbor lamps. Switches never count as wire,
 * open or closed, so flipping one never turns its neighbors.
 * @param {object} world - the world
 * @param {number} x - the part's column
 * @param {number} y - the part's row
 * @param {Function} blockInfo - looks up what a block name means
 * @returns {'h'|'v'} the direction it faces
 */
export function partAxis(world, x, y, blockInfo) {
  /**
   * What the neighbor dx, dy away is.
   * @param {number} dx - columns across
   * @param {number} dy - rows down
   * @returns {{wire: boolean, electric: boolean}} is it wire (or gold)? is it electric at all?
   */
  const look = (dx, dy) => {
    const info = blockInfo(getBlock(world, x + dx, y + dy));
    return { wire: Boolean(info?.conducts), electric: isElectric(info) };
  };
  const left = look(-1, 0);
  const right = look(1, 0);
  const up = look(0, -1);
  const down = look(0, 1);
  if (left.wire && right.wire) return 'h';
  if (up.wire && down.wire) return 'v';
  if (left.electric && right.electric) return 'h';
  if (up.electric && down.electric) return 'v';
  if (left.electric || right.electric) return 'h';
  if (up.electric || down.electric) return 'v';
  return 'h';
}

/**
 * Which side is a battery's + end? The top when it faces up-down, the
 * right when it faces sideways.
 * @param {'h'|'v'} axis - the way the battery faces
 * @returns {string} 'up' or 'right'
 */
export function plusSide(axis) {
  return axis === 'v' ? 'up' : 'right';
}

/**
 * The sides a point connects through: all four for a wire, or just its
 * two ends for a part.
 * @param {object} info - the block's definition
 * @param {'h'|'v'|null} axis - the way a part faces (null for wires)
 * @returns {string[]} the sides
 */
function sidesFor(info, axis) {
  if (info.conducts) return SIDES;
  return axis === 'v' ? ['up', 'down'] : ['right', 'left'];
}

/**
 * Half of a point's resistance: each connection gets half from each end.
 * @param {{info: object, part: object|null}} point - a point
 * @returns {number} half its resistance
 */
function halfResistance(point) {
  return point.info.conducts ? WIRE_HALF_RESISTANCE : point.part.resistance / 2;
}

/**
 * Round a changing push DOWN (toward zero) to a whole number of PUSH_STEPs.
 * @param {number} push - the push, in volts (+ or −)
 * @returns {number} the rounded push: 0.016 → 0.01, −0.016 → −0.01
 */
export function roundPush(push) {
  // The tiny 1e-9 stops 0.3 (which computers store as 0.29999...) rounding down to 0.29.
  const perVolt = Math.round(1 / PUSH_STEP); // dividing by a whole number keeps 0.57 exactly 0.57
  return Math.sign(push) * Math.floor(Math.abs(push) * perVolt + 1e-9) / perVolt || 0; // "|| 0" turns −0 into a plain 0
}

/**
 * How hard a part pushes right now, in volts: `pushNow` if it has one
 * (a turbine), otherwise its fixed `push` (a battery), otherwise 0.
 * A changing push is rounded DOWN (toward zero) to PUSH_STEP (a hundredth
 * of a volt), the same as the circuit key does (see circuitKey in
 * electric.js), so the math always matches the key: a turbine that has
 * almost stopped pushes exactly 0, not a tiny bit forever. Rounding toward
 * zero (never up) also means a motor that powers its own generator winds
 * down instead of getting stuck. The steps are small, so a slowly turned
 * generator still makes a little electricity, like a real one.
 * @param {object|null} part - the part settings
 * @param {object} world - the world
 * @param {number} x - the part's column
 * @param {number} y - the part's row
 * @returns {number} the push
 */
export function partPush(part, world, x, y) {
  if (!part) return 0;
  if (part.pushNow) {
    const push = part.pushNow(world, x, y);
    return roundPush(push);
  }
  return part.push ?? 0;
}

/**
 * How hard a battery pushes current OUT through one of its sides:
 * half its push out of the + end, half pulled in at the − end.
 * Anything that isn't pushing pushes 0.
 * @param {{push: number, axis: string|null}} point - a point
 * @param {string} side - which side
 * @returns {number} the push out through that side
 */
function pushOut(point, side) {
  const push = point.push;
  if (!push) return 0;
  const plus = plusSide(point.axis);
  if (side === plus) return push / 2;
  if (side === OPPOSITE[plus]) return -push / 2;
  return 0;
}

/**
 * The current coming OUT of each part's + end (its top or right end), for
 * one circuit whose connections have been solved. Negative means the
 * current goes in there.
 * @param {object} ready - the circuit, ready for solving (from prepareCircuit)
 * @param {number[]} members - the cell indexes in this circuit
 * @param {object[]} links - this circuit's connections (with their pushes)
 * @param {Map<number, object>} points - every point
 * @returns {Map<number, number>|null} part's cell index → current out of
 *   its + end, or null if the circuit can't be solved
 */
function currentsOut(ready, members, links, points) {
  const voltages = solveVoltages(ready, members, links);
  if (!voltages) return null;
  const out = new Map();
  const other = new Map(); // the current out of the − end, for a part whose + end isn't joined to anything
  for (const link of links) {
    const current = (voltages.get(link.a) - voltages.get(link.b) + link.push) / link.resistance;
    for (const [index, side, amount] of [[link.a, link.side, current], [link.b, OPPOSITE[link.side], -current]]) {
      const point = points.get(index);
      if (!point.part) continue;
      if (side === plusSide(point.axis)) out.set(index, amount);
      else other.set(index, amount);
    }
  }
  for (const index of members) {
    if (!points.get(index).part) continue;
    // What comes out of one end went in at the other.
    const current = out.get(index) ?? -(other.get(index) ?? 0);
    out.set(index, Math.abs(current) < 1e-9 ? 0 : current);
  }
  return out;
}

/**
 * Work out, for one circuit with generators in it (parts marked
 * `feelsLoad`), how much of every part's current each generator is
 * answerable for. A circuit is "linear": the current anywhere is just
 * the currents each pusher would make by itself, added up. So:
 *
 *   current out of a part's + end = fixed + perVolt(g1) × g1's push + perVolt(g2) × g2's push + ...
 *
 *   perVolt  the current each generator sends through this part, for
 *            each volt that generator pushes
 *   fixed    the current the OTHER pushers (batteries, turbines) send
 *            through it, with every generator standing still
 *
 * The gears use these to find how hard each generator is to turn at any
 * speed, and how a group of generators load each other, without having
 * to solve the circuit again and again. A generator's own perVolt is its
 * `load`: lots of lamps side by side = a big load, nothing wired to it
 * = none, plain wire across its ends = a huge one.
 *
 * Every one of these sums uses the same wiring, so the slow half of the
 * math is done just once for the whole circuit (`ready`, see
 * prepareCircuit), however many generators there are.
 * @param {object} ready - the circuit, ready for solving (from prepareCircuit)
 * @param {number[]} members - the cell indexes in this circuit
 * @param {object[]} links - this circuit's connections
 * @param {Map<number, object>} points - every point
 * And `perVolt` only depends on the wiring, not on how hard anybody
 * pushes right now. So when the wiring is the same as the last time the
 * circuit was worked out (only a generator's speed changed), we keep
 * the old `perVolt` lists (`known`) and only work out `fixed` again.
 * @param {Map<number, object>} cells - every cell's record (gets `perVolt`, `fixed`, and `load` for generators)
 * @param {Map<number, object>|null} known - the records from last time, if the wiring is still the same
 * @returns {void}
 */
function shareOut(ready, members, links, points, cells, known) {
  const makers = members.filter((index) => points.get(index).part?.feelsLoad);
  if (makers.length === 0) return;
  const parts = members.filter((index) => points.get(index).part);
  /**
   * The connections again, with only some of the points pushing.
   * @param {Function} pushOf - (cell index) => that point's push, in volts
   * @returns {object[]} the connections
   */
  const pushedBy = (pushOf) => links.map((link) => ({
    ...link,
    push: pushOut({ push: pushOf(link.a), axis: points.get(link.a).axis }, link.side)
      - pushOut({ push: pushOf(link.b), axis: points.get(link.b).axis }, OPPOSITE[link.side]),
  }));
  const kept = Boolean(known) && parts.every((index) => known.get(index)?.perVolt?.size === makers.length);
  for (const index of parts) {
    cells.get(index).perVolt = kept ? known.get(index).perVolt : new Map();
    cells.get(index).fixed = 0;
  }
  for (const maker of makers) {
    if (kept) {
      cells.get(maker).load = known.get(maker).load;
      continue;
    }
    const out = currentsOut(ready, members, pushedBy((index) => (index === maker ? 1 : 0)), points);
    for (const index of parts) cells.get(index).perVolt.set(maker, out?.get(index) ?? 0);
    cells.get(maker).load = Math.abs(out?.get(maker) ?? 0);
  }
  const others = members.some((index) => !makers.includes(index) && points.get(index).push !== 0);
  if (!others) return;
  const out = currentsOut(ready, members, pushedBy((index) => (makers.includes(index) ? 0 : points.get(index).push)), points);
  for (const index of parts) cells.get(index).fixed = out?.get(index) ?? 0;
}

/**
 * A count of the heavy work done so far, for tests and timing tools.
 * `factorings` goes up by one every time factorLinear clears out a grid
 * of equations (the slow part of working out a circuit), `answers` every
 * time solveFactored answers them for one set of pushes.
 */
export const work = { factorings: 0, answers: 0 };

/**
 * The slow half of solving a set of equations  A · x = b  by Gaussian
 * elimination (the method taught in school: clear out one unknown at a
 * time). We pick the biggest number in each column to divide by
 * ("partial pivoting"), which keeps rounding errors small.
 *
 * This half only needs A, not b. It writes down every step it took, so
 * the same steps can be done to ANY b afterwards, quickly (see
 * solveFactored). A circuit with fifty generators asks for fifty
 * different b's with the very same A: clearing A out once instead of
 * fifty times is fifty times less work. (Grown-ups call this an "LU
 * factorization".)
 * @param {number[][]} matrix - A, a square grid of numbers (it gets changed)
 * @returns {{matrix: number[][], swaps: number[]}|null} the cleared-out
 *   grid with the steps written into it, and which rows were swapped;
 *   null if there's no single answer
 */
export function factorLinear(matrix) {
  work.factorings += 1;
  const n = matrix.length;
  const swaps = new Array(n);
  for (let col = 0; col < n; col++) {
    let best = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(matrix[row][col]) > Math.abs(matrix[best][col])) best = row;
    }
    if (Math.abs(matrix[best][col]) < 1e-12) return null; // no single answer
    [matrix[col], matrix[best]] = [matrix[best], matrix[col]];
    swaps[col] = best;
    const pivot = matrix[col];
    for (let row = col + 1; row < n; row++) {
      const line = matrix[row];
      const factor = line[col] / pivot[col];
      line[col] = factor; // write the step down where the cleared-out number was
      if (factor === 0) continue;
      for (let k = col + 1; k < n; k++) line[k] -= factor * pivot[k];
    }
  }
  return { matrix, swaps };
}

/**
 * The quick half: answer  A · x = b  for one b, using the steps that
 * factorLinear wrote down for A.
 * @param {{matrix: number[][], swaps: number[]}} factored - from factorLinear
 * @param {number[]} rhs - b, the right-hand side (it gets changed)
 * @returns {number[]|null} x, or null if the numbers went wrong
 */
export function solveFactored(factored, rhs) {
  work.answers += 1;
  const { matrix, swaps } = factored;
  const n = rhs.length;
  // First the same row swaps, in the same order; then the same clearing out.
  for (let col = 0; col < n; col++) {
    const best = swaps[col];
    if (best !== col) [rhs[col], rhs[best]] = [rhs[best], rhs[col]];
  }
  for (let col = 0; col < n; col++) {
    const value = rhs[col];
    if (value === 0) continue;
    for (let row = col + 1; row < n; row++) {
      const factor = matrix[row][col];
      if (factor !== 0) rhs[row] -= factor * value;
    }
  }
  const x = new Array(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    const line = matrix[row];
    let sum = rhs[row];
    for (let k = row + 1; k < n; k++) sum -= line[k] * x[k];
    x[row] = sum / line[row];
  }
  return x.every(Number.isFinite) ? x : null;
}

/**
 * Solve a set of equations  A · x = b  in one go (see factorLinear and
 * solveFactored for the two halves).
 * @param {number[][]} matrix - A, a square grid of numbers (it gets changed)
 * @param {number[]} rhs - b, the right-hand side (it gets changed)
 * @returns {number[]|null} x, or null if there's no single answer
 */
export function solveLinear(matrix, rhs) {
  const factored = factorLinear(matrix);
  return factored && solveFactored(factored, rhs);
}

/**
 * Get one separate circuit ready for solving: do the slow half of the
 * sums, which only depends on how the circuit is WIRED (who is joined
 * to whom, and every connection's resistance), not on who is pushing.
 * Each connection is a "conductance" g = 1 / resistance (how easily
 * current flows).
 * @param {number[]} members - the cell indexes in this circuit
 * @param {object[]} links - this circuit's connections
 * @returns {{position: Map<number, number>, factored: object|null}} where
 *   each point is in the equations, and the cleared-out equations (null
 *   if they can't be solved)
 */
function prepareCircuit(members, links) {
  const position = new Map(members.map((index, k) => [index, k]));
  const n = members.length;
  const matrix = Array.from({ length: n }, () => new Array(n).fill(0));
  for (const link of links) {
    const a = position.get(link.a);
    const b = position.get(link.b);
    const g = 1 / link.resistance;
    matrix[a][a] += g;
    matrix[b][b] += g;
    matrix[a][b] -= g;
    matrix[b][a] -= g;
  }
  // Voltages only matter compared to each other, so we pin the first
  // point at 0 volts. Without this there'd be endless answers.
  matrix[0] = new Array(n).fill(0);
  matrix[0][0] = 1;
  return { position, factored: factorLinear(matrix) };
}

/**
 * Work out the voltage at every point of one separate circuit, for one
 * set of pushes. A battery's push becomes a current source g × push.
 * @param {{position: Map<number, number>, factored: object|null}} ready - from prepareCircuit
 * @param {number[]} members - the cell indexes in this circuit
 * @param {object[]} links - this circuit's connections (with their pushes)
 * @returns {Map<number, number>|null} cell index → voltage, or null if it can't be solved
 */
function solveVoltages(ready, members, links) {
  if (!ready.factored) return null;
  const rhs = new Array(members.length).fill(0);
  for (const link of links) {
    if (link.push === 0) continue;
    const g = 1 / link.resistance;
    rhs[ready.position.get(link.a)] -= g * link.push;
    rhs[ready.position.get(link.b)] += g * link.push;
  }
  rhs[0] = 0; // the first point is pinned at 0 volts
  const voltages = solveFactored(ready.factored, rhs);
  return voltages && new Map(members.map((index, k) => [index, voltages[k]]));
}

/**
 * Group the points into separate circuits: points joined by connections
 * (directly or through others) are in the same group.
 * @param {number[]} indexes - every point's cell index
 * @param {object[]} links - every connection
 * @returns {number[][]} the groups, each a list of cell indexes
 */
function groupsOf(indexes, links) {
  const parent = new Map(indexes.map((index) => [index, index]));
  /**
   * Find the "leader" of a point's group.
   * @param {number} index - a cell index
   * @returns {number} the group leader's index
   */
  const leader = (index) => {
    while (parent.get(index) !== index) index = parent.get(index);
    return index;
  };
  for (const link of links) parent.set(leader(link.a), leader(link.b));
  const groups = new Map();
  for (const index of indexes) {
    const key = leader(index);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(index);
  }
  return [...groups.values()];
}

/**
 * Is this battery short-circuited? That's when its + end and − end are
 * joined by a path of plain wire with nothing to slow the current down,
 * like a lamp. However long the wire is, it's still a short circuit.
 *
 * "Plain wire" means wires, gold and closed switches. ANOTHER pusher (a
 * battery, turbine or generator) on the path counts as plain wire only if:
 *   • the path goes through it the way it pushes (in at −, out at +):
 *     batteries in a row, wired straight back, short each other; or
 *   • it isn't pushing right now: a stopped generator's coil is just wire; or
 *   • it's being overpowered: so much current is forced through it
 *     BACKWARDS that it plainly isn't holding anything back.
 * A healthy battery side by side with this one (parallel) is none of
 * those: it pushes back just as hard, so no current goes round through
 * it, and it is not a short circuit.
 * @param {number} battery - the battery's cell index
 * @param {object} point - the battery's point
 * @param {Map<number, object>} points - every point
 * @param {Map<number, number[]>} touching - cell index → the indexes it's connected to
 * @param {Map<number, object>} cells - every cell's record (for the currents)
 * @param {number} width - the world's width
 * @returns {boolean} true if + and − are joined by plain wire
 */
function shortedByShape(battery, point, points, touching, cells, width) {
  /**
   * The cell index next to a cell on one side.
   * @param {number} index - a cell index
   * @param {string} side - which side
   * @returns {number} the neighbor's cell index
   */
  const beside = (index, side) => index + STEP[side][0] + STEP[side][1] * width;
  /**
   * The side a pusher is pushing current OUT of right now: its + end, or
   * the other end if its push is backwards (a generator turning ↺).
   * @param {{push: number, axis: string}} p - a pushing point
   * @returns {string} the side
   */
  const outSide = (p) => (p.push > 0 ? plusSide(p.axis) : OPPOSITE[plusSide(p.axis)]);
  const plus = beside(battery, outSide(point));
  const minus = beside(battery, OPPOSITE[outSide(point)]);
  const linked = touching.get(battery) ?? [];
  if (!linked.includes(plus) || !linked.includes(minus)) return false;

  /**
   * Can current step from one point into the next without being slowed
   * down or pushed back?
   * @param {number} from - the cell index it comes from
   * @param {number} index - the cell index it steps into
   * @returns {boolean} true for wire-like points, and other pushers (see above)
   */
  const plain = (from, index) => {
    const p = points.get(index);
    if (p.info.conducts || p.part.resistance <= SHORT_PATH_RESISTANCE) return true;
    if (p.part.push === undefined && !p.part.pushNow) return false; // a lamp, a motor...
    if (p.push === 0) return true; // a pusher that's stopped
    if (beside(index, OPPOSITE[outSide(p)]) === from) return true; // going through it the way it pushes
    return (cells.get(index).arms[outSide(p)] ?? 0) < -SHORT_CURRENT; // overpowered
  };
  if (!plain(battery, plus)) return false;
  const seen = new Set([battery, plus]);
  const queue = [plus];
  while (queue.length > 0) {
    const index = queue.shift();
    if (index === minus) return true;
    for (const next of touching.get(index) ?? []) {
      if (!seen.has(next) && plain(index, next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return false;
}

/**
 * Work out the electricity in the whole world.
 *
 * Returns a record for every electric cell:
 *   axis   'h' or 'v' for parts (null for wires)
 *   faces  the sides it's connected through
 *   arms   current out through each connected side (negative = flowing in)
 *   level  for parts: current through it ÷ REFERENCE_CURRENT (0 to MAX_LEVEL),
 *          for drawing (a lamp can only shine so bright)
 *   current  for parts: the real current through it, with no limit
 *          (a motor's strength and a generator's push-back use this)
 *   spark  true for a short-circuited battery
 *   load   only for parts marked `part.feelsLoad` (generators): the current
 *          that flows through it for each volt it pushes (see shareOut)
 *   perVolt, fixed  only for parts in a circuit that has a generator in it:
 *          how the current out of its + end is made up (see shareOut)
 *   group  which separate circuit it's in (a number), or null if it's a gap
 *
 * @param {object} world - the world
 * @param {Function} blockInfo - looks up what a block name means
 * @param {Map<number, object>|null} [known] - the records from the last
 *   time, but ONLY if nothing about the wiring has changed since (the same
 *   blocks, switches and clicker beat): then the `perVolt` lists are kept
 *   instead of worked out again (see shareOut)
 * @returns {{cells: Map<number, object>, flowing: boolean}} the records, and whether any current flows
 */
export function solveCircuit(world, blockInfo, known = null) {
  const cells = new Map();
  const points = new Map();
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      const info = blockInfo(getBlock(world, x, y));
      if (!isElectric(info)) continue;
      const index = y * world.width + x;
      const axis = info.conducts ? null : partAxis(world, x, y, blockInfo);
      cells.set(index, { axis, faces: [], arms: {}, level: 0, current: 0, spark: false, group: null });
      const part = activePart(info, world);
      if (info.conducts || part) {
        points.set(index, { x, y, info, part, axis, sides: sidesFor(info, axis), push: partPush(part, world, x, y) });
      }
    }
  }

  // Join touching points that face each other. We only look right and
  // down from each point, so every pair is joined exactly once.
  const links = [];
  const touching = new Map();
  for (const [a, pa] of points) {
    for (const side of ['right', 'down']) {
      const [dx, dy] = STEP[side];
      if (!inBounds(world, pa.x + dx, pa.y + dy)) continue;
      const b = a + dx + dy * world.width;
      const pb = points.get(b);
      if (!pb || !pa.sides.includes(side) || !pb.sides.includes(OPPOSITE[side])) continue;
      links.push({
        a, b, side,
        resistance: halfResistance(pa) + halfResistance(pb),
        push: pushOut(pa, side) - pushOut(pb, OPPOSITE[side]),
        current: 0,
      });
      cells.get(a).faces.push(side);
      cells.get(b).faces.push(OPPOSITE[side]);
      cells.get(a).arms[side] = 0;
      cells.get(b).arms[OPPOSITE[side]] = 0;
      touching.set(a, [...(touching.get(a) ?? []), b]);
      touching.set(b, [...(touching.get(b) ?? []), a]);
    }
  }

  // Solve each separate circuit that has a battery in it.
  let groupNumber = 0;
  for (const members of groupsOf([...points.keys()], links)) {
    groupNumber += 1;
    for (const index of members) cells.get(index).group = groupNumber; // which separate circuit it's in
    const inside = new Set(members);
    const groupLinks = links.filter((link) => inside.has(link.a));
    const makers = members.some((index) => points.get(index).part?.feelsLoad);
    const pushing = members.some((index) => points.get(index).push !== 0);
    if (!makers && !pushing) continue; // nothing here could ever push: no sums needed
    const ready = prepareCircuit(members, groupLinks); // the slow half, done once for this circuit
    shareOut(ready, members, groupLinks, points, cells, known);
    if (!pushing) continue;
    const voltages = solveVoltages(ready, members, groupLinks);
    if (!voltages) {
      console.warn('A circuit could not be solved, so it gets no current.');
      continue;
    }
    for (const link of groupLinks) {
      const current = (voltages.get(link.a) - voltages.get(link.b) + link.push) / link.resistance;
      // Rounding leaves crumbs like 0.000000000000002 where the answer is 0.
      link.current = Math.abs(current) < 1e-9 ? 0 : current;
      cells.get(link.a).arms[link.side] = link.current;
      cells.get(link.b).arms[OPPOSITE[link.side]] = -link.current;
    }
  }

  for (const [index, point] of points) {
    if (!point.part) continue;
    const cell = cells.get(index);
    const through = Math.max(0, ...point.sides.map((side) => Math.abs(cell.arms[side] ?? 0)));
    cell.current = through;
    cell.level = Math.min(MAX_LEVEL, through / REFERENCE_CURRENT);
    if (point.push !== 0 && through > SHORT_CURRENT) {
      cell.spark = shortedByShape(index, point, points, touching, cells, world.width);
    }
  }

  const flowing = links.some((link) => Math.abs(link.current) > FLOW_MIN);
  return { cells, flowing };
}
