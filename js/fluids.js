/**
 * fluids.js — how water and steam move, one tick at a time.
 *
 * Every cell holds an AMOUNT of water (and of steam): 0 is empty, 1 is
 * full. Each tick, every wet cell shares its water with its neighbors:
 *
 *   1. DOWN first: water falls into room below.
 *   2. SIDEWAYS: water evens out with its left and right neighbors.
 *   3. UP: water under a lot of other water gets slightly "squished"
 *      (it holds a bit more than 1), and the extra pushes upward.
 *
 * Rule 3 is the clever part. It's why water in a U-shaped tube ends up
 * at the same height on both sides, and why a tall water tower can push
 * water up a pipe, but never higher than the tower itself.
 *
 * Steam follows the very same rules upside down: it rises, and spreads
 * out under ceilings.
 *
 * Fluid only moves between two cells if BOTH let it through on the
 * sides that touch: air lets it through everywhere, solid blocks never
 * do, and pipes only along their open sides (see openSides).
 */
import { AIR, getBlock, inBounds } from './world.js';
import { OPPOSITE, SIDES } from './circuit.js';

/** A full cell. */
export const FULL = 1;

/**
 * How much extra a cell may hold for each full cell of water above it.
 * Squishier water pushes harder, so it levels out faster.
 * 🧪 Try this! 0.02 for stiff water: it's slow to climb up U-tubes.
 */
export const SQUISH = 0.1;

/**
 * How many small steps the water takes each tick. More steps = faster
 * water (a U-tube levels out in about 5 seconds with 4).
 * 🧪 Try this! 1 for slow-motion water.
 */
export const FLUID_STEPS = 4;

/** Less than this counts as dry when drawing and when deciding if anything moved. */
export const MIN_AMOUNT = 0.001;

/** The most that can move through one side in one tick. */
const MAX_FLOW = 1;

/** Which way is [dx, dy] for each side. */
const STEP = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };

/**
 * For two cells stacked on top of each other holding `total` between
 * them, how much should the LOWER one hold? Usually "full, and the rest
 * on top", but when both are full the lower one holds a little extra:
 * it's squished by the weight above it.
 * @param {number} total - the amount in both cells together
 * @returns {number} how much the lower cell should hold
 */
export function stableBelow(total) {
  if (total <= FULL) return FULL;
  if (total < 2 * FULL + SQUISH) return (FULL * FULL + total * SQUISH) / (FULL + SQUISH);
  return (total + SQUISH) / 2;
}

/**
 * Is this block a fluid block (pipe, valve, pump...)? Pipes connect to these.
 * @param {object|undefined} info - the block's definition
 * @returns {boolean} true if it has a `fluid` setting
 */
function isFluidBlock(info) {
  return Boolean(info?.fluid);
}

/**
 * Which way a valve or turbine faces, from the fluid blocks around it:
 * pipes on both sides wins, then pipes above and below, then pipes on
 * one side, then one above or below, then its favorite (`prefer`).
 * @param {object} world - the world
 * @param {number} x - column
 * @param {number} y - row
 * @param {Function} blockInfo - looks up what a block name means
 * @param {'h'|'v'} prefer - the way to face with nothing around
 * @returns {'h'|'v'} sideways or up-down
 */
export function fluidAxis(world, x, y, blockInfo, prefer) {
  /**
   * Is the cell dx, dy away a fluid block?
   * @param {number} dx - columns across
   * @param {number} dy - rows down
   * @returns {boolean} true if it is
   */
  const at = (dx, dy) => isFluidBlock(blockInfo(getBlock(world, x + dx, y + dy)));
  const left = at(-1, 0);
  const right = at(1, 0);
  const up = at(0, -1);
  const down = at(0, 1);
  if (left && right) return 'h';
  if (up && down) return 'v';
  if (left || right) return 'h';
  if (up || down) return 'v';
  return prefer;
}

/**
 * The sides a non-pipe fluid block lets fluid through (a closed valve
 * still "connects" to pipes, but lets nothing through: see openSides).
 * @param {object} world - the world
 * @param {number} x - column
 * @param {number} y - row
 * @param {object} fluid - the block's `fluid` setting
 * @param {Function} blockInfo - looks up what a block name means
 * @returns {string[]} the sides
 */
function connectSides(world, x, y, fluid, blockInfo) {
  if (fluid.sides === 'all') return SIDES;
  if (fluid.sides === 'axis') {
    return fluidAxis(world, x, y, blockInfo, fluid.prefer ?? 'h') === 'v' ? ['up', 'down'] : ['left', 'right'];
  }
  if (Array.isArray(fluid.sides)) return fluid.sides;
  return [];
}

/**
 * The sides of a pipe that are open. A pipe joins every neighboring
 * fluid block that joins back. A pipe END (only one join) is also open
 * on its far side, so water pours out of it. A lone pipe is open on its
 * left and right.
 * @param {object} world - the world
 * @param {number} x - column
 * @param {number} y - row
 * @param {Function} blockInfo - looks up what a block name means
 * @returns {string[]} the open sides
 */
function pipeSides(world, x, y, blockInfo) {
  const joined = SIDES.filter((side) => {
    const [dx, dy] = STEP[side];
    const info = blockInfo(getBlock(world, x + dx, y + dy));
    if (!isFluidBlock(info)) return false;
    if (info.fluid.sides === 'auto-pipe') return true; // pipes always join pipes
    return connectSides(world, x + dx, y + dy, info.fluid, blockInfo).includes(OPPOSITE[side]);
  });
  if (joined.length === 0) return ['left', 'right'];
  if (joined.length === 1) return [joined[0], OPPOSITE[joined[0]]];
  return joined;
}

/**
 * The sides fluid can pass through in this cell. Air: every side.
 * Solid blocks, closed valves and outside the world: none.
 * @param {object} world - the world
 * @param {number} x - column
 * @param {number} y - row
 * @param {Function} blockInfo - looks up what a block name means
 * @returns {string[]} the open sides
 */
export function openSides(world, x, y, blockInfo) {
  if (!inBounds(world, x, y)) return [];
  const name = getBlock(world, x, y);
  if (name === AIR) return SIDES;
  const fluid = blockInfo(name)?.fluid;
  if (!fluid || fluid.closed) return [];
  if (fluid.sides === 'auto-pipe') return pipeSides(world, x, y, blockInfo);
  return connectSides(world, x, y, fluid, blockInfo);
}

/**
 * The sides to DRAW a fluid block with: its open sides, except that a
 * closed valve is still drawn joined to its pipes (just blocked).
 * @param {object} world - the world
 * @param {number} x - column
 * @param {number} y - row
 * @param {Function} blockInfo - looks up what a block name means
 * @returns {string[]} the sides
 */
export function drawingSides(world, x, y, blockInfo) {
  const fluid = blockInfo(getBlock(world, x, y))?.fluid;
  if (fluid?.closed) return connectSides(world, x, y, fluid, blockInfo);
  return openSides(world, x, y, blockInfo);
}

/**
 * Pour a full cell of water (or steam) into a cell, if it can hold
 * fluid and isn't full already. This is what BUILD does with the 💧
 * and ☁️ palette items.
 * @param {object} world - the world
 * @param {'water'|'steam'} kind - which fluid
 * @param {number} x - column
 * @param {number} y - row
 * @param {Function} blockInfo - looks up what a block name means
 * @returns {boolean} true if any fluid was added
 */
export function pour(world, kind, x, y, blockInfo) {
  if (openSides(world, x, y, blockInfo).length === 0) return false;
  const index = y * world.width + x;
  if (world.fluid[kind][index] >= FULL) return false;
  world.fluid[kind][index] = FULL;
  return true;
}

/**
 * The open sides of every cell, worked out once per tick.
 * @param {object} world - the world
 * @param {Function} blockInfo - looks up what a block name means
 * @returns {string[][]} open sides, by cell index
 */
export function allOpenSides(world, blockInfo) {
  const sides = [];
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) sides.push(openSides(world, x, y, blockInfo));
  }
  return sides;
}

/**
 * Make a "can fluid go from cell i out through this side?" checker.
 * Both cells must be open on the touching sides. A pump is a one-way
 * door: fluid may only leave it from its front, and only enter it from
 * its back.
 * @param {object} world - the world
 * @param {string[][]} sides - open sides by cell index (from allOpenSides)
 * @param {Function} blockInfo - looks up what a block name means
 * @returns {Function} (index, side) => the neighbor's index, or -1 if blocked
 */
export function flowChecker(world, sides, blockInfo) {
  return (index, side) => {
    const x = index % world.width;
    const y = Math.floor(index / world.width);
    const [dx, dy] = STEP[side];
    if (!inBounds(world, x + dx, y + dy)) return -1;
    const next = index + dx + dy * world.width;
    if (!sides[index].includes(side) || !sides[next].includes(OPPOSITE[side])) return -1;
    const from = blockInfo(world.cells[index])?.fluid?.pump;
    if (from && side !== from) return -1;
    const into = blockInfo(world.cells[next])?.fluid?.pump;
    if (into && side !== into) return -1;
    return next;
  };
}

/**
 * Keep a number between two limits.
 * @param {number} value - the number
 * @param {number} low - the smallest allowed
 * @param {number} high - the biggest allowed
 * @returns {number} the number, squeezed between low and high
 */
function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

/**
 * Move one kind of fluid for one small step, using the three rules (down,
 * sideways, up). For steam, "down" means up: it falls toward the sky.
 *
 * Every cell's flow is worked out from the amounts at the START of the
 * step and added up in a fresh copy, so it doesn't matter which cell
 * goes first.
 *
 * @param {object} world - the world
 * @param {'water'|'steam'} kind - which fluid
 * @param {Function} canFlow - from flowChecker
 * @param {Function} onMove - told (fromIndex, toIndex, amount) for every move
 * @returns {number} the total amount that moved
 */
export function flowFluid(world, kind, canFlow, onMove) {
  const before = world.fluid[kind];
  const after = Float64Array.from(before);
  const water = world.fluid.water;
  const fall = kind === 'water' ? 'down' : 'up';
  const rise = OPPOSITE[fall];
  let moved = 0;

  /**
   * Move some fluid from one cell to another.
   * @param {number} from - the cell it leaves
   * @param {number} to - the cell it goes to
   * @param {number} amount - how much
   * @returns {void}
   */
  const move = (from, to, amount) => {
    if (amount <= 0) return;
    after[from] -= amount;
    after[to] += amount;
    moved += amount;
    onMove(from, to, amount);
  };

  /**
   * Can steam spread sideways (or sink) into this cell? Not into cells
   * that are mostly water. (Steam may always RISE into water: bubbles!
   * And water may always go into steamy cells.)
   * @param {number} to - the cell index
   * @returns {boolean} true if it may
   */
  const roomFor = (to) => kind !== 'steam' || water[to] <= 0.5;

  for (let index = 0; index < before.length; index++) {
    let remaining = before[index];
    if (remaining <= 0) continue;

    const below = canFlow(index, fall); // for steam, this is the cell ABOVE
    if (below >= 0) {
      const flow = clamp(stableBelow(remaining + before[below]) - before[below], 0, Math.min(MAX_FLOW, remaining));
      move(index, below, flow);
      remaining -= flow;
    }
    if (remaining <= 0) continue;

    for (const side of ['left', 'right']) {
      const beside = canFlow(index, side);
      if (beside < 0 || !roomFor(beside)) continue;
      const flow = clamp((remaining - before[beside]) / 4, 0, remaining);
      move(index, beside, flow);
      remaining -= flow;
    }
    if (remaining <= 0) continue;

    const above = canFlow(index, rise);
    if (above >= 0 && roomFor(above)) {
      const flow = clamp(remaining - stableBelow(remaining + before[above]), 0, Math.min(MAX_FLOW, remaining));
      move(index, above, flow);
    }
  }

  for (let index = 0; index < after.length; index++) if (after[index] < 0) after[index] = 0;
  world.fluid[kind] = after;
  return moved;
}

// =============================================================
// The special blocks
// =============================================================

/**
 * How much water a faucet adds each tick.
 * 🧪 Try this! 0.2 for a gushing faucet.
 */
export const FAUCET_RATE = 0.05;

/**
 * How much water a burner turns into steam each tick.
 * 🧪 Try this! 0.01 for a gentle simmer.
 */
export const BOIL_RATE = 0.05;

/** How much steam a chiller turns back into water each tick (in each touching cell). */
export const CONDENSE_RATE = 0.05;

/**
 * How much water a fully powered pump moves each tick. Kept small enough
 * that a pump pushing water through a water wheel that turns the
 * generator powering the pump loses energy each time round (see
 * gears.js): no water machine can run forever on its own.
 * 🧪 Try this! 0.5 for a super pump (and a water perpetual-motion machine!).
 */
export const PUMP_RATE = 0.05;

/** A pump needs at least this much circuit level to work. */
export const PUMP_ON_LEVEL = 0.25;

/** A pump won't squeeze the cell in front of it fuller than this. */
const PUMP_FRONT_CAP = FULL + SQUISH;

/**
 * A burner stops boiling when the cell above it already holds this much
 * steam, like a lid rattling on a full kettle. Without it, a faucet
 * dripping onto a burner would pack the sky with steam forever.
 */
const BOIL_STEAM_CAP = FULL + SQUISH;

/**
 * Let the special blocks do their jobs: faucets add water, drains take
 * it away, burners boil water into steam, chillers turn steam back
 * into water, and powered pumps push water from behind them to in front.
 * @param {object} world - the world
 * @param {Function} blockInfo - looks up what a block name means
 * @param {string[][]} sides - open sides by cell index
 * @returns {number} the total amount that changed
 */
export function runSpecials(world, blockInfo, sides) {
  const { water, steam } = world.fluid;
  let changed = 0;
  /**
   * The index of the neighbor on one side, or -1 outside the world.
   * @param {number} index - a cell index
   * @param {string} side - which side
   * @returns {number} the neighbor's index, or -1
   */
  const beside = (index, side) => {
    const x = index % world.width + STEP[side][0];
    const y = Math.floor(index / world.width) + STEP[side][1];
    return inBounds(world, x, y) ? y * world.width + x : -1;
  };
  for (let index = 0; index < world.cells.length; index++) {
    const info = blockInfo(world.cells[index]);
    if (!info) continue;
    if (info.faucet) {
      const below = beside(index, 'down');
      if (below >= 0 && sides[below].includes('up')) {
        const add = Math.min(FAUCET_RATE, Math.max(0, FULL - water[below]));
        water[below] += add;
        changed += add;
      }
    }
    if (info.drains && water[index] > 0) {
      changed += water[index];
      water[index] = 0;
    }
    if (info.burns) {
      const above = beside(index, 'up');
      if (above >= 0 && sides[above].length > 0) {
        const boil = Math.min(BOIL_RATE, water[above], Math.max(0, BOIL_STEAM_CAP - steam[above]));
        water[above] -= boil;
        steam[above] += boil;
        changed += boil;
      }
    }
    if (info.chills) {
      for (const side of SIDES) {
        const next = beside(index, side);
        if (next < 0 || sides[next].length === 0) continue;
        const cool = Math.min(CONDENSE_RATE, steam[next]);
        steam[next] -= cool;
        water[next] += cool;
        changed += cool;
      }
    }
    const front = info.fluid?.pump;
    if (front) {
      const level = world.signals.electric?.cells?.get(index)?.level ?? 0;
      if (level < PUMP_ON_LEVEL) continue;
      const back = beside(index, OPPOSITE[front]);
      const ahead = beside(index, front);
      if (back < 0 || ahead < 0 || !sides[back].includes(front) || !sides[ahead].includes(OPPOSITE[front])) continue;
      const push = Math.min(PUMP_RATE * level, water[back], Math.max(0, PUMP_FRONT_CAP - water[ahead]));
      water[back] -= push;
      water[ahead] += push;
      changed += push;
    }
  }
  return changed;
}

/**
 * One tick of fluids: water and steam move (in FLUID_STEPS small
 * steps), then the special blocks do their jobs once.
 * @param {object} world - the world
 * @param {Function} blockInfo - looks up what a block name means
 * @returns {{moved: number, steamOut: Map<number, number>, waterOut: Map<number, number>, sides: string[][]}}
 *   how much changed in total, how much steam left each turbine, how much
 *   water left each water wheel (+ going down or right, − going up or left),
 *   and every cell's open sides
 */
export function stepFluids(world, blockInfo) {
  const sides = allOpenSides(world, blockInfo);
  const canFlow = flowChecker(world, sides, blockInfo);
  const steamOut = new Map();
  /**
   * Count steam leaving a turbine (that's what spins it).
   * @param {number} from - the cell the steam left
   * @param {number} to - where it went
   * @param {number} amount - how much
   * @returns {void}
   */
  const countTurbines = (from, to, amount) => {
    if (blockInfo(world.cells[from])?.turbine) steamOut.set(from, (steamOut.get(from) ?? 0) + amount);
  };
  const waterOut = new Map();
  /**
   * Count water leaving a water wheel, and which way it went (that's
   * what turns it): down or right counts +, up or left counts −.
   * @param {number} from - the cell the water left
   * @param {number} to - where it went
   * @param {number} amount - how much
   * @returns {void}
   */
  const countWheels = (from, to, amount) => {
    if (!blockInfo(world.cells[from])?.wheel) return;
    const signed = to > from ? amount : -amount; // down (+width) and right (+1) are bigger indexes
    waterOut.set(from, (waterOut.get(from) ?? 0) + signed);
  };
  let moved = 0;
  for (let step = 0; step < FLUID_STEPS; step++) {
    moved += flowFluid(world, 'water', canFlow, countWheels);
    moved += flowFluid(world, 'steam', canFlow, countTurbines);
  }
  moved += runSpecials(world, blockInfo, sides);
  return { moved, steamOut, waterOut, sides };
}
