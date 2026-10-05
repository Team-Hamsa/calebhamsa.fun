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
 * pushes with `part.push` volts (a battery), or, if it has
 * `part.pushNow`, with exactly what that says right now (a motor or
 * generator pushes harder the faster it turns).
 *
 * A part marked `part.port` (a motor or generator) is a PORT: a place
 * where the circuit and the gears meet. How hard a port pushes depends
 * on how fast it turns, and how fast it turns depends on the current
 * through it. So the gears need to know, BEFORE any speed is worked
 * out, what current would flow through each port for any pushes at all.
 * A circuit is "linear" (the current anywhere is just the currents each
 * pusher would make by itself, added up), so that takes only a few
 * numbers for each port, and they depend on the WIRING alone (see
 * circuitPorts). The gears and the circuit are then worked out together
 * (see solveSpin in spin.js), and solveCircuit finishes the picture
 * with the pushes that came out.
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
 * How hard a part pushes right now, in volts: `pushNow` if it has one
 * (a motor or generator: exactly what it says, nothing rounded),
 * otherwise its fixed `push` (a battery), otherwise 0.
 * @param {object|null} part - the part settings
 * @param {object} world - the world
 * @param {number} x - the part's column
 * @param {number} y - the part's row
 * @returns {number} the push
 */
export function partPush(part, world, x, y) {
  if (!part) return 0;
  if (part.pushNow) return part.pushNow(world, x, y) || 0; // "|| 0" turns −0 into a plain 0
  return part.push ?? 0;
}

/**
 * How hard a pusher pushes current OUT through one of its sides:
 * half its push out of the + end, half pulled in at the − end.
 * Anything that isn't pushing pushes 0.
 * @param {{axis: string|null}} point - a point
 * @param {number} push - how hard it pushes, in volts
 * @param {string} side - which side
 * @returns {number} the push out through that side
 */
function pushOut(point, push, side) {
  if (!push) return 0;
  const plus = plusSide(point.axis);
  if (side === plus) return push / 2;
  if (side === OPPOSITE[plus]) return -push / 2;
  return 0;
}

/**
 * The current through every connection of one circuit, for one set of
 * pushes. (The quick half of the sums: the circuit's equations were
 * cleared out already, see prepareCircuit.)
 * @param {{members: number[], links: object[], ready: object}} circuit - one separate circuit (from circuitPorts)
 * @param {Map<number, object>} points - every point
 * @param {Function} pushOf - (cell index) => that point's push, in volts
 * @returns {number[]|null} the current through each of the circuit's
 *   connections (from its `a` end to its `b` end), or null if the
 *   circuit can't be solved
 */
function flows(circuit, points, pushOf) {
  const { members, links, ready } = circuit;
  if (!ready.factored) return null;
  // A pusher's push becomes a current source g × push on each of its connections.
  const pushes = links.map((link) => pushOut(points.get(link.a), pushOf(link.a), link.side)
    - pushOut(points.get(link.b), pushOf(link.b), OPPOSITE[link.side]));
  const rhs = new Array(members.length).fill(0);
  links.forEach((link, k) => {
    if (pushes[k] === 0) return;
    const g = 1 / link.resistance;
    rhs[ready.position.get(link.a)] -= g * pushes[k];
    rhs[ready.position.get(link.b)] += g * pushes[k];
  });
  rhs[0] = 0; // the first point is pinned at 0 volts
  const voltages = solveFactored(ready.factored, rhs);
  if (!voltages) return null;
  return links.map((link, k) => {
    const current = (voltages[ready.position.get(link.a)] - voltages[ready.position.get(link.b)] + pushes[k]) / link.resistance;
    // Rounding leaves crumbs like 0.000000000000002 where the answer is 0.
    return Math.abs(current) < 1e-9 ? 0 : current;
  });
}

/**
 * The current coming OUT of some parts' + ends (their top or right
 * ends), for one circuit and one set of pushes. Negative means the
 * current goes in there.
 * @param {{members: number[], links: object[], ready: object}} circuit - one separate circuit
 * @param {Map<number, object>} points - every point
 * @param {Function} pushOf - (cell index) => that point's push, in volts
 * @param {number[]} parts - the parts we want to know about (cell indexes)
 * @returns {Map<number, number>} part's cell index → current out of its
 *   + end (0 for all of them if the circuit can't be solved)
 */
function currentsOut(circuit, points, pushOf, parts) {
  const out = new Map(parts.map((index) => [index, 0]));
  const currents = flows(circuit, points, pushOf);
  if (!currents) return out;
  const other = new Map(); // the current out of the − end, for a part whose + end isn't joined to anything
  const plusJoined = new Set();
  circuit.links.forEach((link, k) => {
    for (const [index, side, amount] of [[link.a, link.side, currents[k]], [link.b, OPPOSITE[link.side], -currents[k]]]) {
      if (!out.has(index)) continue;
      if (side === plusSide(points.get(index).axis)) {
        out.set(index, amount || 0); // "|| 0" turns −0 into a plain 0
        plusJoined.add(index);
      } else {
        other.set(index, amount);
      }
    }
  });
  for (const index of parts) {
    // What comes out of one end went in at the other.
    if (!plusJoined.has(index)) out.set(index, -(other.get(index) ?? 0) || 0);
  }
  return out;
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
 * Is this pusher (a battery, mostly) short-circuited? That's when its + end and − end are
 * joined by a path of plain wire with nothing to slow the current down,
 * like a lamp. However long the wire is, it's still a short circuit.
 *
 * "Plain wire" means wires, gold and closed switches. ANOTHER battery on
 * the path counts as plain wire only if the path goes through it the
 * way it pushes (in at −, out at +): batteries in a row, wired straight
 * back, short each other. A healthy battery side by side with this one
 * (parallel) is not that: it pushes back just as hard, so no current
 * goes round through it, and it is not a short circuit.
 *
 * A motor's or generator's coil is NEVER plain wire, turning or stopped:
 * it has real resistance, like a lamp. A battery wired straight across
 * one is a stalled motor (lots of current, but no sparks), and it starts
 * to turn.
 *
 * A spinning machine is a pusher too, and the same rule goes for it: it
 * is short-circuited when it is pushing a lot of current round a loop of
 * nothing but plain wire. (A battery in that loop is not plain wire for
 * it: the battery is doing pushing of its own.)
 * @param {number} battery - the pusher's cell index
 * @param {Map<number, object>} points - every point
 * @param {Map<number, number>} pushes - cell index → how hard that point pushes right now
 * @param {Map<number, number[]>} touching - cell index → the indexes it's connected to
 * @param {number} width - the world's width
 * @returns {boolean} true if + and − are joined by plain wire
 */
function shortedByShape(battery, points, pushes, touching, width) {
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
   * @param {number} index - a pushing point's cell index
   * @returns {string} the side
   */
  const outSide = (index) => (pushes.get(index) > 0 ? plusSide(points.get(index).axis) : OPPOSITE[plusSide(points.get(index).axis)]);
  const isBattery = points.get(battery).part.push !== undefined;
  const plus = beside(battery, outSide(battery));
  const minus = beside(battery, OPPOSITE[outSide(battery)]);
  const linked = touching.get(battery) ?? [];
  if (!linked.includes(plus) || !linked.includes(minus)) return false;

  /**
   * Can current step from one point into the next without being slowed
   * down or pushed back?
   * @param {number} from - the cell index it comes from
   * @param {number} index - the cell index it steps into
   * @returns {boolean} true for wire-like points, and batteries the right way round (see above)
   */
  const plain = (from, index) => {
    const p = points.get(index);
    if (p.info.conducts || p.part.resistance <= SHORT_PATH_RESISTANCE) return true;
    if (p.part.push === undefined) return false; // a lamp, or a motor's or generator's coil
    if (!isBattery) return false; // a spinning machine only shorts ITSELF: a battery on the path is doing its own pushing
    return beside(index, OPPOSITE[outSide(index)]) === from; // a battery: only going through it the way it pushes
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
 * Work out everything about the electricity that depends only on the
 * WIRING: which blocks are joined to which, the separate circuits, and
 * what each port (a part marked `part.port`: a motor or generator) needs
 * to know. Nothing here depends on how fast anything turns, so it is
 * worked out once and kept until a block, a switch or a clicker's beat
 * changes (see refreshWiring in electric.js).
 *
 * For every port, the current coming out of its + end (its right or top
 * end) is always
 *
 *   current = fixed + perVolt(p1) × p1's push + perVolt(p2) × p2's push + ...
 *
 *   fixed    the current the batteries send through it, with every port
 *            standing still (pushing nothing)
 *   perVolt  for each port in the same circuit (itself too): the current
 *            that port sends through this one for each volt it pushes
 *
 * A circuit of plain resistors sends the same current from A's volt
 * through B as from B's volt through A. So `perVolt` is the same both
 * ways round between two ports. (Grown-ups call that reciprocity.)
 *
 * Every one of these sums uses the same wiring, so the slow half of the
 * math is done just once for each circuit (see prepareCircuit), however
 * many ports there are.
 * @param {object} world - the world
 * @param {Function} blockInfo - looks up what a block name means
 * @returns {{cells: Map<number, object>, points: Map<number, object>, touching: Map<number, number[]>,
 *   circuits: object[], ports: Map<number, {fixed: number, perVolt: Map<number, number>}>, width: number}}
 *   the wiring: a blank record for every electric cell, every point,
 *   who touches whom, every circuit that could carry current (its
 *   members, connections, cleared-out equations and ports), and what
 *   each port needs to know
 */
export function circuitPorts(world, blockInfo) {
  const cells = new Map();
  const points = new Map();
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      const info = blockInfo(getBlock(world, x, y));
      if (!isElectric(info)) continue;
      const index = y * world.width + x;
      const axis = info.conducts ? null : partAxis(world, x, y, blockInfo);
      cells.set(index, { axis, faces: [], group: null });
      const part = activePart(info, world);
      if (info.conducts || part) points.set(index, { x, y, info, part, axis, sides: sidesFor(info, axis) });
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
      links.push({ a, b, side, resistance: halfResistance(pa) + halfResistance(pb) });
      cells.get(a).faces.push(side);
      cells.get(b).faces.push(OPPOSITE[side]);
      touching.set(a, [...(touching.get(a) ?? []), b]);
      touching.set(b, [...(touching.get(b) ?? []), a]);
    }
  }

  const circuits = [];
  const ports = new Map();
  let groupNumber = 0;
  for (const members of groupsOf([...points.keys()], links)) {
    groupNumber += 1;
    for (const index of members) cells.get(index).group = groupNumber; // which separate circuit it's in
    const batteries = members.some((index) => points.get(index).part?.push);
    const pushers = batteries || members.some((index) => points.get(index).part?.pushNow);
    if (!pushers) continue; // nothing here could ever push: no sums needed
    const inside = new Set(members);
    const circuit = {
      members,
      links: links.filter((link) => inside.has(link.a)),
      ports: members.filter((index) => points.get(index).part?.port),
    };
    circuit.ready = prepareCircuit(members, circuit.links); // the slow half, done once for this circuit
    circuits.push(circuit);
    if (circuit.ports.length === 0) continue;
    const fixed = batteries
      ? currentsOut(circuit, points, (index) => (points.get(index).part?.port ? 0 : points.get(index).part?.push ?? 0), circuit.ports)
      : null;
    for (const index of circuit.ports) ports.set(index, { fixed: fixed?.get(index) ?? 0, perVolt: new Map() });
    for (const maker of circuit.ports) {
      const out = currentsOut(circuit, points, (index) => (index === maker ? 1 : 0), circuit.ports);
      for (const index of circuit.ports) ports.get(index).perVolt.set(maker, out.get(index));
    }
    // The same both ways round, to the last crumb of rounding.
    for (const a of circuit.ports) {
      for (const b of circuit.ports) {
        if (a >= b) continue;
        const share = (ports.get(a).perVolt.get(b) + ports.get(b).perVolt.get(a)) / 2;
        ports.get(a).perVolt.set(b, share);
        ports.get(b).perVolt.set(a, share);
      }
    }
  }
  return { cells, points, touching, circuits, ports, width: world.width };
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
 *   spark  true for a short-circuited battery
 *   fixed, perVolt  only for ports (parts marked `part.port`): how the
 *          current out of its + end is made up (see circuitPorts)
 *   group  which separate circuit it's in (a number), or null if it's a gap
 *
 * @param {object} world - the world
 * @param {Function} blockInfo - looks up what a block name means
 * @param {object} [net] - the wiring, from circuitPorts, but ONLY if
 *   nothing about the wiring has changed since it was worked out (the
 *   same blocks, switches and clicker beat). Then just the quick half of
 *   the sums is done: one answer for each circuit, with the pushes as
 *   they are right now.
 * @returns {{cells: Map<number, object>, flowing: boolean}} the records, and whether any current flows
 */
export function solveCircuit(world, blockInfo, net = circuitPorts(world, blockInfo)) {
  const { points, touching } = net;
  const cells = new Map();
  for (const [index, blank] of net.cells) {
    cells.set(index, { axis: blank.axis, faces: blank.faces, arms: Object.fromEntries(blank.faces.map((side) => [side, 0])), level: 0, current: 0, spark: false, group: blank.group });
  }
  for (const [index, port] of net.ports) Object.assign(cells.get(index), port);
  const pushes = new Map();
  for (const [index, point] of points) pushes.set(index, partPush(point.part, world, point.x, point.y));

  // Solve each separate circuit that has somebody pushing in it.
  let flowing = false;
  for (const circuit of net.circuits) {
    if (!circuit.members.some((index) => pushes.get(index) !== 0)) continue;
    const currents = flows(circuit, points, (index) => pushes.get(index));
    if (!currents) {
      console.warn('A circuit could not be solved, so it gets no current.');
      continue;
    }
    circuit.links.forEach((link, k) => {
      cells.get(link.a).arms[link.side] = currents[k];
      cells.get(link.b).arms[OPPOSITE[link.side]] = -currents[k] || 0;
      if (Math.abs(currents[k]) > FLOW_MIN) flowing = true;
    });
  }

  for (const [index, point] of points) {
    if (!point.part) continue;
    const cell = cells.get(index);
    const through = Math.max(0, ...point.sides.map((side) => Math.abs(cell.arms[side] ?? 0)));
    cell.current = through;
    cell.level = Math.min(MAX_LEVEL, through / REFERENCE_CURRENT);
    if (pushes.get(index) !== 0 && through > SHORT_CURRENT) {
      cell.spark = shortedByShape(index, points, pushes, touching, world.width);
    }
  }
  return { cells, flowing };
}
