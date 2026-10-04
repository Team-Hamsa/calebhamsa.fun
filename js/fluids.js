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
 * WATER HAS TO FALL TO GIVE ITS PUSH. High water (and squished water)
 * holds energy, like a ball at the top of a slide. Every time some water
 * moves, we work out how much lower it ended up (see fallEnergy): that
 * is the only push a water wheel can catch. And LIFTING WATER USES UP A
 * PUMP'S PUSH: the higher a pump has to lift, the less water it moves,
 * until the water is too heavy for it and it stops (see pumpAmount).
 * Because of those two rules, water going round and round through a
 * pump and some wheels can never give back more than the pump put in.
 *
 * Fluid only moves between two cells if BOTH let it through on the
 * sides that touch: air lets it through everywhere, solid blocks never
 * do, and pipes only along their open sides (see openSides).
 */
import { AIR, FLUIDS, getBlock, inBounds, swapBlock } from './world.js';
import { OPPOSITE, REFERENCE_CURRENT, SIDES } from './circuit.js';

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
 * How much "height energy" one cell's water holds, counted from the
 * cell's own floor. Up to a full cell, the more water the higher its
 * top, like a taller and taller stack of blocks. Past full, the water is
 * squished like a spring, and squishing it more takes a LOT more push.
 * (The height of the cell itself is counted separately, in fallEnergy.)
 * @param {number} amount - how much water the cell holds
 * @returns {number} its energy, in "one full cell of water, one cell up"
 */
export function storedEnergy(amount) {
  if (amount <= FULL) return (amount * amount) / (2 * FULL);
  const extra = amount - FULL;
  return FULL / 2 + extra + (extra * extra) / (2 * SQUISH);
}

/**
 * How hard the water in a cell pushes: how high its water would stand
 * above the cell's floor, in cells (its "head"). Half full is 0.5. Full
 * with 3 full cells of water standing on it is 4, because each cell
 * standing on it squishes it by SQUISH.
 * @param {number} amount - how much water the cell holds
 * @returns {number} the height, in cells
 */
export function headOf(amount) {
  return amount <= FULL ? amount : FULL + (amount - FULL) / SQUISH;
}

/**
 * How much energy some water gives up by moving from one cell to another:
 * how far it fell, plus how much less squished or piled-up it is now.
 * Water falling one whole cell into an empty cell gives up 1 for each
 * full cell of water. Water sliding along a level stream gives up only a
 * tiny bit. A pump pushing water uphill gets a NEGATIVE answer: that
 * water GAINED energy, and the pump had to pay for it.
 * @param {number} from - how much water the cell it leaves holds
 * @param {number} to - how much water the cell it goes to holds
 * @param {number} amount - how much water moves
 * @param {number} drop - how many cells lower the new cell is (up is negative)
 * @returns {number} the energy given up
 */
export function fallEnergy(from, to, amount, drop) {
  return storedEnergy(from) - storedEnergy(from - amount) + storedEnergy(to) - storedEnergy(to + amount) + amount * drop;
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
 * BUILD a block into a cell without making its water vanish. This is
 * what BUILD does with every real block.
 *
 *   • A block that carries water (a pipe, valve, water wheel, pump,
 *     turbine, drain or rope) just keeps the water that was there.
 *   • A solid block (stone, sand, a battery...) PUSHES the water and
 *     steam out of the way, like a rock dropped in a full glass: up if
 *     it can, or else out to the sides (half each way if both are open),
 *     or else down. So the water level goes UP when you build in a tank.
 *   • Only when the cell is shut in on every side is there nowhere for
 *     the water to go, and it is lost.
 *
 * (This lives here and not in world.js because only the blocks know
 * which of them carry water.)
 * @param {object} world - the world
 * @param {number} x - column
 * @param {number} y - row
 * @param {string} name - the block to build
 * @param {Function} blockInfo - looks up what a block name means
 * @returns {boolean} true if the cell really changed
 */
export function placeBlock(world, x, y, name, blockInfo) {
  if (!swapBlock(world, x, y, name)) return false;
  if (name !== AIR && !isFluidBlock(blockInfo(name))) pushFluidOut(world, x, y, blockInfo);
  return true;
}

/**
 * Push all the water and steam out of a cell (a solid block was just
 * built there) into the cells next to it: up first, then the sides,
 * then down. A neighbor only takes it through a side it's open on (so
 * not through a pipe's wall), and never a pump (a one-way door). With
 * no neighbor to take it, it is lost.
 * @param {object} world - the world
 * @param {number} x - column
 * @param {number} y - row
 * @param {Function} blockInfo - looks up what a block name means
 * @returns {void}
 */
function pushFluidOut(world, x, y, blockInfo) {
  const index = y * world.width + x;
  /**
   * The neighbor on one side, if fluid can be pushed into it.
   * @param {string} side - which side
   * @returns {number[]} its index in a list, or an empty list if it's closed
   */
  const room = (side) => {
    const [dx, dy] = STEP[side];
    if (blockInfo(getBlock(world, x + dx, y + dy))?.fluid?.pump) return [];
    return openSides(world, x + dx, y + dy, blockInfo).includes(OPPOSITE[side]) ? [index + dx + dy * world.width] : [];
  };
  const choices = [room('up'), [...room('left'), ...room('right')], room('down')];
  const into = choices.find((cells) => cells.length > 0) ?? [];
  for (const kind of FLUIDS) {
    const amounts = world.fluid[kind];
    for (const cell of into) amounts[cell] += amounts[index] / into.length;
    amounts[index] = 0;
  }
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
 * How many turbines share the same steam with each turbine. Steam that
 * rushes up a chimney through three turbines, one after the other, is
 * still the same steam: it can only give its push once, so the three
 * have to share it.
 *
 * Turbines share when they sit in the same TUBE: starting at a turbine,
 * we walk both ways through cells that are open on exactly two sides
 * that lead somewhere (pipes, other turbines, a one-cell-wide gap). The
 * tube ends at a room (a cell open more ways) or at a dead end.
 * @param {object} world - the world
 * @param {Function} blockInfo - looks up what a block name means
 * @param {string[][]} sides - open sides by cell index (from allOpenSides)
 * @returns {Map<number, number>} for each turbine's cell index, how many turbines are in its tube (itself too)
 */
export function turbineRuns(world, blockInfo, sides) {
  /**
   * The cells fluid can go to from a cell (never mind which way pumps face).
   * @param {number} index - the cell's index
   * @returns {number[]} the neighbors' indexes
   */
  const ways = (index) => {
    const x = index % world.width;
    const y = Math.floor(index / world.width);
    const out = [];
    for (const side of sides[index]) {
      const [dx, dy] = STEP[side];
      if (!inBounds(world, x + dx, y + dy)) continue;
      const next = index + dx + dy * world.width;
      if (sides[next].includes(OPPOSITE[side])) out.push(next);
    }
    return out;
  };
  const runs = new Map();
  world.cells.forEach((name, start) => {
    if (!blockInfo(name)?.turbine) return;
    const tube = new Set([start]);
    for (const first of ways(start)) {
      let at = first;
      // Walk on while we're in a tube: exactly two ways, in and out.
      while (!tube.has(at) && ways(at).length === 2) {
        tube.add(at);
        at = ways(at).find((next) => !tube.has(next)) ?? at;
      }
    }
    runs.set(start, [...tube].filter((index) => blockInfo(world.cells[index])?.turbine).length);
  });
  return runs;
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
 * goes first, and left and right are treated just the same.
 *
 * @param {object} world - the world
 * @param {'water'|'steam'} kind - which fluid
 * @param {Function} canFlow - from flowChecker
 * @param {Function} onMove - told (fromIndex, toIndex, amount, energy) for every
 *   move: `energy` is how much the water gave up by moving (see fallEnergy; 0 for steam)
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
   * @param {number} here - how much the cell it leaves holds right now
   * @param {number} drop - how many cells lower it ends up (1 falling, 0 sideways, −1 rising)
   * @returns {void}
   */
  const move = (from, to, amount, here, drop) => {
    if (amount <= 0) return;
    after[from] -= amount;
    after[to] += amount;
    moved += amount;
    onMove(from, to, amount, kind === 'water' ? fallEnergy(here, before[to], amount, drop) : 0);
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
      move(index, below, flow, remaining, 1);
      remaining -= flow;
    }
    if (remaining <= 0) continue;

    // Both sides are worked out from the SAME amount (what's here after
    // the falling), so neither side is the favorite: a stream landing on
    // the middle of a ridge splits exactly in half. Each side gets at
    // most a quarter, so together they never take more than is here.
    const level = remaining;
    for (const side of ['left', 'right']) {
      const beside = canFlow(index, side);
      if (beside < 0 || !roomFor(beside)) continue;
      const flow = clamp((level - before[beside]) / 4, 0, remaining);
      move(index, beside, flow, remaining, 0);
      remaining -= flow;
    }
    if (remaining <= 0) continue;

    const above = canFlow(index, rise);
    if (above >= 0 && roomFor(above)) {
      const flow = clamp(remaining - stableBelow(remaining + before[above]), 0, Math.min(MAX_FLOW, remaining));
      move(index, above, flow, remaining, -1);
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
 * How much water a pump with one battery moves each tick when it has
 * nothing to lift (pushing along a level pipe, or downhill). More
 * batteries move more.
 */
export const PUMP_RATE = 0.05;

/**
 * How many cells high a pump with one battery can lift water before it
 * stalls: the water standing on it is then too heavy to push. Two
 * batteries lift twice as high.
 * 🧪 Try this! 8: now the pump gives the water more energy than its
 * electricity holds, and you can build a machine that runs forever
 * (tests/gears.test.js will tell you off!).
 */
export const PUMP_HEAD = 6;

/**
 * How much turning-work the energy of falling water is worth: one full
 * cell of water falling one cell can do this much work on a water wheel,
 * and a pump must spend at least this much electricity to lift it back.
 * 10 makes one faucet falling one cell through a wheel as good as one
 * crank (see WHEEL_GAIN in gears.js). Both the wheel and the pump use
 * this same number: that's what keeps the energy books honest.
 */
export const DROP_POWER = 10;

/** A pump needs at least this much circuit level to work. */
export const PUMP_ON_LEVEL = 0.25;

/**
 * How much water a pump moves this tick.
 *
 * A pump is like you carrying buckets upstairs: on flat ground you carry
 * lots, the higher the stairs the fewer you manage, and at some height
 * you can't lift the bucket at all. So:
 *
 *   amount = PUMP_RATE × level × (1 − lift ÷ (PUMP_HEAD × level))
 *
 * `lift` is how much higher the water pushes in front of the pump than
 * behind it (headOf, plus how many cells higher the front cell is),
 * measured AFTER the water has moved, so the pump never overshoots.
 * `level` is how much electricity it gets (1 = one battery): more
 * batteries move more water AND lift it higher.
 *
 * The work it does on the water (amount × lift × DROP_POWER) is biggest
 * half way up, and even there it is less than the electricity the pump
 * uses. The rest is lost as heat, like in a real pump.
 * @param {number} level - the pump's current ÷ REFERENCE_CURRENT
 * @param {number} behind - how much water the cell behind it holds
 * @param {number} ahead - how much water the cell in front of it holds
 * @param {number} rise - how many cells higher the front cell is than the back one (down is negative)
 * @returns {number} how much water it moves
 */
export function pumpAmount(level, behind, ahead, rise) {
  const most = PUMP_RATE * level;
  const stall = PUMP_HEAD * level;
  /**
   * How much MORE the pump could move, if it had already moved `amount`.
   * @param {number} amount - how much it moved
   * @returns {number} positive if it can do more, negative if that was too much
   */
  const spare = (amount) => {
    const lift = rise + headOf(ahead + amount) - headOf(behind - amount);
    return most * Math.min(1, 1 - lift / stall) - amount;
  };
  let high = Math.min(most, behind);
  if (high <= 0 || spare(0) <= 0) return 0;
  if (spare(high) >= 0) return high;
  // Somewhere in between: keep halving the gap until we've found it.
  let low = 0;
  for (let i = 0; i < 40; i++) {
    const middle = (low + high) / 2;
    if (spare(middle) >= 0) low = middle;
    else high = middle;
  }
  return low;
}

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
      // The real current (not `level`, which stops at 2 so lamps don't get
      // too bright): more batteries really do pump faster and higher.
      const level = (world.signals.electric?.cells?.get(index)?.current ?? 0) / REFERENCE_CURRENT;
      if (level < PUMP_ON_LEVEL) continue;
      const back = beside(index, OPPOSITE[front]);
      const ahead = beside(index, front);
      if (back < 0 || ahead < 0 || !sides[back].includes(front) || !sides[ahead].includes(OPPOSITE[front])) continue;
      // Lifting costs flow: see pumpAmount. STEP's y counts down, so up is a rise of +2
      // (from the cell under the pump to the cell above it).
      const rise = -2 * STEP[front][1];
      const push = pumpAmount(level, water[back], water[ahead], rise);
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
 * @returns {{moved: number, steamOut: Map<number, number>, waterOut: Map<number, number>, waterWork: Map<number, number>, sides: string[][]}}
 *   how much changed in total, how much steam left each turbine, how much
 *   water left each water wheel (+ going down or right, − going up or left),
 *   how much energy the water gave up at each water wheel, and every
 *   cell's open sides
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
  const waterWork = new Map();
  /**
   * Count water leaving a water wheel, and which way it went (that's
   * what says how fast it turns, and which way): down or right counts
   * +, up or left counts −.
   *
   * Also count the ENERGY the water gave up leaving a wheel, or landing
   * on one from somewhere that isn't a wheel (that's what says how hard
   * the wheel can push). Each bit of energy is only ever given to ONE
   * wheel: when water goes straight from one wheel into another, the
   * one it leaves gets it.
   * @param {number} from - the cell the water left
   * @param {number} to - where it went
   * @param {number} amount - how much
   * @param {number} energy - how much energy the water gave up (see fallEnergy)
   * @returns {void}
   */
  const countWheels = (from, to, amount, energy) => {
    const leaves = Boolean(blockInfo(world.cells[from])?.wheel);
    if (leaves) {
      const signed = to > from ? amount : -amount; // down (+width) and right (+1) are bigger indexes
      waterOut.set(from, (waterOut.get(from) ?? 0) + signed);
    }
    if (energy <= 0) return;
    const wheel = leaves ? from : to;
    if (leaves || blockInfo(world.cells[to])?.wheel) waterWork.set(wheel, (waterWork.get(wheel) ?? 0) + energy);
  };
  let moved = 0;
  for (let step = 0; step < FLUID_STEPS; step++) {
    moved += flowFluid(world, 'water', canFlow, countWheels);
    moved += flowFluid(world, 'steam', canFlow, countTurbines);
  }
  moved += runSpecials(world, blockInfo, sides);
  return { moved, steamOut, waterOut, waterWork, sides };
}
