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
 * make a loop with no current, which is safe.)
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
 * its four neighbors and faces the electric ones:
 *   1. electric on both left and right → sideways
 *   2. electric on both up and down    → up-down
 *   3. electric on the left or right   → sideways
 *   4. electric above or below         → up-down
 *   5. nothing around                  → sideways
 * @param {object} world - the world
 * @param {number} x - the part's column
 * @param {number} y - the part's row
 * @param {Function} blockInfo - looks up what a block name means
 * @returns {'h'|'v'} the direction it faces
 */
export function partAxis(world, x, y, blockInfo) {
  /**
   * Is the neighbor dx, dy away electric?
   * @param {number} dx - columns across
   * @param {number} dy - rows down
   * @returns {boolean} true if it's electric
   */
  const electricAt = (dx, dy) => isElectric(blockInfo(getBlock(world, x + dx, y + dy)));
  const left = electricAt(-1, 0);
  const right = electricAt(1, 0);
  const up = electricAt(0, -1);
  const down = electricAt(0, 1);
  if (left && right) return 'h';
  if (up && down) return 'v';
  if (left || right) return 'h';
  if (up || down) return 'v';
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
 * (a turbine), otherwise its fixed `push` (a battery), otherwise 0.
 * A changing push is rounded to 0.1, the same as the circuit key does
 * (see circuitKey in electric.js), so the math always matches the key:
 * a turbine that has almost stopped pushes exactly 0, not a tiny bit forever.
 * @param {object|null} part - the part settings
 * @param {object} world - the world
 * @param {number} x - the part's column
 * @param {number} y - the part's row
 * @returns {number} the push
 */
export function partPush(part, world, x, y) {
  if (!part) return 0;
  if (part.pushNow) return Math.round(part.pushNow(world, x, y) * 10) / 10;
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
 * Solve a set of equations  A · x = b  by Gaussian elimination (the
 * method taught in school: clear out one unknown at a time). We pick
 * the biggest number in each column to divide by ("partial pivoting"),
 * which keeps rounding errors small.
 * @param {number[][]} matrix - A, a square grid of numbers (it gets changed)
 * @param {number[]} rhs - b, the right-hand side (it gets changed)
 * @returns {number[]|null} x, or null if there's no single answer
 */
export function solveLinear(matrix, rhs) {
  const n = rhs.length;
  for (let col = 0; col < n; col++) {
    let best = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(matrix[row][col]) > Math.abs(matrix[best][col])) best = row;
    }
    if (Math.abs(matrix[best][col]) < 1e-12) return null; // no single answer
    [matrix[col], matrix[best]] = [matrix[best], matrix[col]];
    [rhs[col], rhs[best]] = [rhs[best], rhs[col]];
    for (let row = col + 1; row < n; row++) {
      const factor = matrix[row][col] / matrix[col][col];
      if (factor === 0) continue;
      for (let k = col; k < n; k++) matrix[row][k] -= factor * matrix[col][k];
      rhs[row] -= factor * rhs[col];
    }
  }
  const x = new Array(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    let sum = rhs[row];
    for (let k = row + 1; k < n; k++) sum -= matrix[row][k] * x[k];
    x[row] = sum / matrix[row][row];
  }
  return x.every(Number.isFinite) ? x : null;
}

/**
 * Work out the voltage at every point of one separate circuit.
 * Each connection is a "conductance" g = 1 / resistance (how easily
 * current flows), and a battery's push becomes a current source g × push.
 * @param {number[]} members - the cell indexes in this circuit
 * @param {object[]} links - this circuit's connections
 * @returns {Map<number, number>|null} cell index → voltage, or null if it can't be solved
 */
function solveVoltages(members, links) {
  const position = new Map(members.map((index, k) => [index, k]));
  const n = members.length;
  const matrix = Array.from({ length: n }, () => new Array(n).fill(0));
  const rhs = new Array(n).fill(0);
  for (const link of links) {
    const a = position.get(link.a);
    const b = position.get(link.b);
    const g = 1 / link.resistance;
    matrix[a][a] += g;
    matrix[b][b] += g;
    matrix[a][b] -= g;
    matrix[b][a] -= g;
    rhs[a] -= g * link.push;
    rhs[b] += g * link.push;
  }
  // Voltages only matter compared to each other, so we pin the first
  // point at 0 volts. Without this there'd be endless answers.
  matrix[0] = new Array(n).fill(0);
  matrix[0][0] = 1;
  rhs[0] = 0;
  const voltages = solveLinear(matrix, rhs);
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
 * joined by a path of plain wire (wires, gold, closed switches, other
 * batteries) with nothing to slow the current down, like a lamp.
 * @param {number} battery - the battery's cell index
 * @param {object} point - the battery's point
 * @param {Map<number, object>} points - every point
 * @param {Map<number, number[]>} touching - cell index → the indexes it's connected to
 * @param {number} width - the world's width
 * @returns {boolean} true if + and − are joined by plain wire
 */
function shortedByShape(battery, point, points, touching, width) {
  /**
   * The cell index next to the battery on one side.
   * @param {string} side - which side
   * @returns {number} the neighbor's cell index
   */
  const beside = (side) => battery + STEP[side][0] + STEP[side][1] * width;
  const plus = beside(plusSide(point.axis));
  const minus = beside(OPPOSITE[plusSide(point.axis)]);
  const linked = touching.get(battery) ?? [];
  if (!linked.includes(plus) || !linked.includes(minus)) return false;

  /**
   * Can current pass this point without slowing down?
   * @param {number} index - a cell index
   * @returns {boolean} true for wire-like points and batteries
   */
  const plain = (index) => {
    const p = points.get(index);
    return p.info.conducts || p.part.resistance <= SHORT_PATH_RESISTANCE || p.push !== 0;
  };
  if (!plain(plus) || !plain(minus)) return false;
  const seen = new Set([battery, plus]);
  const queue = [plus];
  while (queue.length > 0) {
    const index = queue.shift();
    if (index === minus) return true;
    for (const next of touching.get(index) ?? []) {
      if (!seen.has(next) && plain(next)) {
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
 *   level  for parts: current through it ÷ REFERENCE_CURRENT (0 to MAX_LEVEL)
 *   spark  true for a short-circuited battery
 *
 * @param {object} world - the world
 * @param {Function} blockInfo - looks up what a block name means
 * @returns {{cells: Map<number, object>, flowing: boolean}} the records, and whether any current flows
 */
export function solveCircuit(world, blockInfo) {
  const cells = new Map();
  const points = new Map();
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      const info = blockInfo(getBlock(world, x, y));
      if (!isElectric(info)) continue;
      const index = y * world.width + x;
      const axis = info.conducts ? null : partAxis(world, x, y, blockInfo);
      cells.set(index, { axis, faces: [], arms: {}, level: 0, spark: false });
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
  for (const members of groupsOf([...points.keys()], links)) {
    if (!members.some((index) => points.get(index).push !== 0)) continue;
    const inside = new Set(members);
    const groupLinks = links.filter((link) => inside.has(link.a));
    const voltages = solveVoltages(members, groupLinks);
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
    cell.level = Math.min(MAX_LEVEL, through / REFERENCE_CURRENT);
    if (point.push !== 0 && through > SHORT_CURRENT) {
      cell.spark = shortedByShape(index, point, points, touching, world.width);
    }
  }

  const flowing = links.some((link) => Math.abs(link.current) > FLOW_MIN);
  return { cells, flowing };
}
