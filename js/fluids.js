/**
 * fluids.js — how water and steam move, one tick at a time.
 *
 * Every cell holds an AMOUNT of water (and of steam): 0 is empty, 1 is
 * full. Each tick, every wet cell shares its water with its neighbors:
 *
 *   1. FALL: water falls into room below.
 *   2. PRESS: deep water presses harder. The taller the water standing
 *      over a place, the harder it pushes there, and that push sends
 *      water UP a pipe and squirts it out of a hole.
 *   3. SPREAD: water evens out with its left and right neighbors.
 *
 * Rule 2 is the clever part. WATER CAN'T BE SQUASHED: a cell never
 * holds more than one cell of water, however deep it is. So when water
 * is pushed into one end of a full pipe, the same amount has to come
 * out of the other end in the very same moment. The game works that out
 * the way the ⚡ pack works out a circuit, with water as the current
 * and pressure as the voltage (see pressWater). It's why water in a
 * U-shaped tube ends up at the same height on both sides, and why a
 * tall water tower can push water up a pipe, but never higher than the
 * tower itself.
 *
 * Steam rises, and spreads out under ceilings. Steam is a GAS, and a
 * gas CAN be squeezed: steam packed in under a ceiling holds a bit more
 * than 1 in a cell (see STEAM_SQUEEZE). And STEAM HAS TO RISE TO GIVE
 * ITS PUSH: low steam (and squeezed steam) holds energy, and the only
 * push a turbine can catch is what its steam gives up by rising or
 * un-squeezing.
 *
 * WATER HAS TO FALL TO GIVE ITS PUSH. High water holds energy, like a
 * ball at the top of a slide. Every time some water moves, we work out
 * how much lower it ended up (see fallEnergy), or how much pressure it
 * used up on the way (see pressWater): that is the only push a water
 * wheel can catch. Falling water keeps that push for as long as it
 * keeps falling, and gives it to the first wheel it lands on (see
 * stepFluids). And LIFTING WATER USES UP A PUMP'S PUSH: the higher a
 * pump has to lift, the less water it moves, until the water is too
 * heavy for it and it stops (see pumpAmount). Because of those two
 * rules, water going round and round through a pump and some wheels
 * can never give back more than the pump put in.
 *
 * Fluid only moves between two cells if BOTH let it through on the
 * sides that touch: air lets it through everywhere, solid blocks never
 * do, and pipes only along their open sides (see openSides). A PUMP IS
 * A SHUT DOOR: the only water that gets past it is what it pushes
 * itself, so a pump that is switched off holds back a whole tank (and
 * steam can't get through a pump at all). See flowTable.
 */
import { AIR, FLUIDS, getBlock, inBounds, swapBlock } from './world.js';
import { OPPOSITE, REFERENCE_CURRENT, SIDES } from './circuit.js';

/** A full cell. Water never holds more than this in one cell: it can't be squashed. */
export const FULL = 1;

/**
 * How much extra STEAM a cell may hold for each full cell of steam
 * packed in beyond it. Steam is a gas, and a gas can be squeezed (water
 * can't: see pressWater for how water pushes instead).
 * 🧪 Try this! 0.02 for stiff steam: it hardly packs in under a lid.
 */
export const STEAM_SQUEEZE = 0.1;

/**
 * How many small steps the fluids take each tick. More steps = faster
 * water and steam.
 * 🧪 Try this! 1 for slow-motion water.
 */
export const FLUID_STEPS = 4;

/** Less than this counts as dry when drawing and when deciding if anything moved. */
export const MIN_AMOUNT = 0.001;

/**
 * A cell this close to full counts as full. (Adding up lots of little
 * bits of water never comes out as exactly 1.)
 */
export const FULL_SLACK = 1e-9;

/**
 * How easily water goes from one full cell to the next: how much flows
 * in one small step, for each cell of difference in pressure. A long
 * pipe is lots of these in a row, so it rubs some of the push away.
 * 🧪 Try this! 0.1 makes long pipes sluggish, like pipes full of sand.
 */
export const PIPE_EASE = 1;

/**
 * How easily the top of some water moves up or down: how much flows in
 * one small step, for each cell of difference between the push from
 * below and the height of the top.
 * 🧪 Try this! Anything over 1/4 lets a level shoot past where it
 * belongs, and the water starts to wobble.
 */
export const SURFACE_EASE = 1 / 4;

/**
 * How much EXTRA water squirts out of a hole in one small step, for
 * each cell of pressure behind it. (With no pressure, water just
 * spreads out of the hole the usual way.)
 * 🧪 Try this! 1/4 makes a water tower empty in a blink.
 */
export const SQUIRT_EASE = 1 / 32;

/** How many tries pressWater has at one set of sums before giving up for this small step. */
const PRESS_ROUNDS = 8;

/** How many times pressWater may change its mind about which cells are pressed, in one small step. */
const PRESS_PASSES = 64;

/** The most that can move through one side in one small step. */
const MAX_FLOW = 1;

/** Which way is [dx, dy] for each side. */
const STEP = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };

/** Which number each side has in the lists that flowTable makes (the same order as SIDES). */
const SIDE_INDEX = { up: 0, right: 1, down: 2, left: 3 };

/**
 * STEAM ONLY. For two cells stacked on top of each other holding `total`
 * between them, how much should the one that steam falls toward (the
 * upper one: steam falls UP) hold? Usually "full, and the rest in the
 * other one", but when both are full it holds a little extra: steam is
 * a gas, and it is squeezed by the steam packed in behind it.
 * (Water is never squeezed: see pressWater.)
 * @param {number} total - the amount in both cells together
 * @returns {number} how much the cell the steam falls toward should hold
 */
export function stableBelow(total) {
  if (total <= FULL) return FULL;
  if (total < 2 * FULL + STEAM_SQUEEZE) return (FULL * FULL + total * STEAM_SQUEEZE) / (FULL + STEAM_SQUEEZE);
  return (total + STEAM_SQUEEZE) / 2;
}

/**
 * How much "height energy" one cell's fluid holds, counted from the
 * cell's own floor. Up to a full cell, the more water the higher its
 * top, like a taller and taller stack of blocks. Water never goes past
 * full. STEAM can: then it is squeezed like a spring, and squeezing it
 * more takes a LOT more push.
 * (The height of the cell itself is counted separately, in fallEnergy.)
 * @param {number} amount - how much fluid the cell holds
 * @returns {number} its energy, in "one full cell of water, one cell up"
 */
export function storedEnergy(amount) {
  if (amount <= FULL) return (amount * amount) / (2 * FULL);
  const extra = amount - FULL;
  return FULL / 2 + extra + (extra * extra) / (2 * STEAM_SQUEEZE);
}

/**
 * How much energy some fluid gives up by moving from one cell to another:
 * how far it fell, plus how much less piled-up (or, for steam, squeezed)
 * it is now. Water falling one whole cell into an empty cell gives up 1
 * for each full cell of water. Water sliding along a level stream gives
 * up only a tiny bit. Water going uphill gets a NEGATIVE answer: that
 * water GAINED energy, and something had to pay for it.
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
 * and ☁️ palette items. One tap never adds more than one full cell, and
 * you can't pour into a full glass: pour just above the water instead.
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
  if (world.fluid[kind][index] >= FULL - (kind === 'water' ? FULL_SLACK : 0)) return false;
  world.fluid[kind][index] = FULL;
  return true;
}

/**
 * DIG one scoop of water and steam out of a cell: at most ONE full cell
 * of each. A cell never holds more water than that, so the scoop takes
 * all the water in the cell. Squeezed steam can be a bit more than a
 * cellful; the extra stays behind (a bucket only holds a bucketful).
 * @param {object} world - the world
 * @param {number} x - column
 * @param {number} y - row
 * @returns {boolean} true if any fluid was taken
 */
export function scoop(world, x, y) {
  if (!inBounds(world, x, y)) return false;
  const index = y * world.width + x;
  const { water, steam } = world.fluid;
  let took = false;
  if (steam[index] > 0) {
    steam[index] = Math.max(0, steam[index] - FULL);
    took = true;
  }
  if (water[index] > 0) {
    water[index] = Math.max(0, water[index] - FULL);
    took = true;
  }
  return took;
}

/**
 * Is this a cell where water is drawn by its HEIGHT (a rectangle that
 * fills up from the bottom)? That's air, and rope (rope is thin). In
 * pipes and other blocks, water is drawn as a shade instead.
 * @param {string} name - the block in the cell
 * @returns {boolean} true for air and rope
 */
export function showsWaterLevel(name) {
  return name === AIR || name === 'rope';
}

/**
 * Water in an open cell is FALLING if the cell under it still has space
 * for it. It is all falling when that cell is this far from full or
 * further, and less and less of it counts as falling as that cell fills
 * right up (so the picture never snaps from one look to the other).
 */
const FALL_RANGE = 0.05;

/**
 * Work out how to DRAW the water in every cell. The picture is the
 * water: a cell is drawn with just what it holds (water can't be
 * squashed, so ten buckets in a shaft really are ten cells tall).
 *
 * The one thing worked out here is which water is FALLING. Water with
 * room to fall into the cell below is drawn as a thin stream from the
 * top of the cell to the bottom, as wide as there is water, so a
 * waterfall reads as joined-up streams and a trickle is never drawn as
 * a cell full of water.
 *
 * This only reads the world. It never changes it.
 * @param {object} world - the world
 * @param {Function} blockInfo - looks up what a block name means
 * @param {string[][]} [sides] - open sides by cell index (from allOpenSides), if already worked out
 * @returns {{shown: Float64Array, falling: Float64Array}}
 *   `shown`: how much water to draw in each cell (0 to 1). `falling`:
 *   how much of a cell's water is on its way down (0 = it all lies
 *   still, 1 = it is all a falling stream)
 */
export function waterPicture(world, blockInfo, sides = allOpenSides(world, blockInfo)) {
  const { width } = world;
  const water = world.fluid.water;
  const size = water.length;
  const shown = new Float64Array(size);
  const falling = new Float64Array(size);
  for (let index = 0; index < size; index++) {
    if (water[index] < MIN_AMOUNT) continue;
    // (A cell that is full but for a rounding speck is drawn full: no hairline of air on top of it.)
    shown[index] = water[index] >= FULL - FULL_SLACK ? FULL : water[index];
    // Is it falling? In an open cell, yes, as long as the cell under it has
    // space. (A pump holds water back, so nothing "falls" into or out of one.)
    const below = index + width;
    if (below >= size || !showsWaterLevel(world.cells[index])) continue;
    if (!sides[index].includes('down') || !sides[below].includes('up')) continue;
    if (blockInfo(world.cells[below])?.fluid?.pump) continue;
    const room = FULL - water[below];
    falling[index] = room <= FULL_SLACK ? 0 : clamp(room / FALL_RANGE, 0, 1);
  }
  return { shown, falling };
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
 *     or else down. If that cell is full already, the water is passed on
 *     to the nearest room (see makeRoom). So the water level goes UP
 *     when you build in a tank.
 *   • Only when there is nowhere for the water to go (the cell is shut
 *     in on every side, or the tank is full right up to its lid) is it
 *     lost.
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
  if (name !== AIR && !isFluidBlock(blockInfo(name))) {
    pushFluidOut(world, x, y, blockInfo);
    makeRoom(world, blockInfo);
  }
  return true;
}

/**
 * Push all the water and steam out of a cell (a solid block was just
 * built there) into the cells next to it: up first, then the sides,
 * then down. A neighbor only takes it through a side it's open on (so
 * not through a pipe's wall), and never a pump (a shut door). With
 * no neighbor to take it, it is lost. (The neighbor may end up with
 * more water than fits: placeBlock calls makeRoom next.)
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

/** Water this much over FULL (or less) is only rounding, and is left alone by makeRoom. */
const ROOM_SLACK = 1e-12;

/**
 * Find room for water that doesn't fit: a cell holding more than FULL.
 * That only happens when something outside the water rules put it
 * there: a block was just built into a full tank, or a world saved by
 * an older version of the game (where deep water was squashed into
 * fewer cells) was just loaded.
 *
 * Every over-full cell is set to FULL, and its extra is handed on to
 * the NEAREST cells with room, searching outward one step at a time
 * through open sides (through full water too, but never through a
 * pump). Of the cells with room that are equally near, the ones reached
 * by a step UP are filled first, then sideways, then down; cells of the
 * same kind share alike. So squashed water in an open tank comes back
 * out on top, where it belongs. Over-full cells that are joined
 * together put their extra in one pot and search together, so a
 * mirrored world gets the mirrored answer.
 *
 * Extra with no room anywhere (a sealed tank that is full already) is
 * dropped: there is nowhere true to put it. Steam is not touched (steam
 * may be squeezed).
 * @param {object} world - the world
 * @param {Function} blockInfo - looks up what a block name means
 * @param {{to: Int32Array}} [table] - from flowTable, if already worked out
 * @returns {number} how much water was dropped (0 when it all found room)
 */
export function makeRoom(world, blockInfo, table) {
  const water = world.fluid.water;
  const size = water.length;
  let first = -1;
  for (let index = 0; index < size && first < 0; index++) if (water[index] > FULL + ROOM_SLACK) first = index;
  if (first < 0) return 0; // the usual answer: one quick look, and nothing to do
  const { to } = table ?? flowTable(world, allOpenSides(world, blockInfo), blockInfo);
  /**
   * Where can extra water go from this cell through one side? Out of
   * any open side, but never INTO a pump (so never through one): that
   * is just what flowTable's `to` says.
   * @param {number} cell - the cell it is in
   * @param {number} side - which side (a number: see SIDE_INDEX)
   * @returns {number} the neighbor's index, or −1
   */
  const step = (cell, side) => to[cell * 4 + side];
  const region = new Int32Array(size).fill(-1); // which pot each cell's extra goes in
  const seen = new Int32Array(size).fill(-1);   // which pot's search has been here
  let dropped = 0;
  for (let start = size - 1; start >= 0; start--) {
    if (!(water[start] > FULL + ROOM_SLACK) || region[start] >= 0) continue;
    // One pot: this cell, and every over-full cell it can reach.
    let extra = 0;
    let level = [];
    const todo = [start];
    region[start] = start;
    while (todo.length > 0) {
      const cell = todo.pop();
      if (water[cell] > FULL + ROOM_SLACK) {
        extra += water[cell] - FULL;
        water[cell] = FULL;
        level.push(cell);
        seen[cell] = start;
      }
      for (let side = 0; side < 4; side++) {
        const next = step(cell, side);
        if (next >= 0 && region[next] < 0) {
          region[next] = start;
          todo.push(next);
        }
      }
    }
    // Search outward from all of them at once, one step at a time.
    while (extra > ROOM_SLACK && level.length > 0) {
      const next = [];
      // Up first (side 0), then both sideways (1 and 3) together, then down (2).
      for (const kinds of [[0], [1, 3], [2]]) {
        const found = [];
        for (const cell of level) {
          for (const side of kinds) {
            const reached = step(cell, side);
            if (reached < 0 || seen[reached] === start) continue;
            seen[reached] = start;
            if (water[reached] < FULL - ROOM_SLACK) found.push(reached);
            else next.push(reached);
          }
        }
        // Share alike; a cell that fills up leaves the rest to the others.
        let takers = found;
        while (extra > ROOM_SLACK && takers.length > 0) {
          const each = extra / takers.length;
          const still = [];
          for (const cell of takers) {
            const take = Math.min(each, FULL - water[cell]);
            water[cell] += take;
            extra -= take;
            if (water[cell] < FULL - ROOM_SLACK) still.push(cell);
          }
          if (still.length === takers.length) break;
          takers = still;
        }
        // Cells that are full now pass the search on.
        for (const cell of found) if (water[cell] >= FULL - ROOM_SLACK) next.push(cell);
      }
      level = next;
    }
    if (extra > ROOM_SLACK) dropped += extra; // (less than that is only rounding)
  }
  return dropped;
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
 * Work out, once for the whole tick, where fluid can go from every cell
 * through every side, as plain lists of numbers. For cell `i` and side
 * number `s` (see SIDE_INDEX), look at place `i * 4 + s`:
 *
 *   to      the neighbor fluid may flow INTO from here BY ITSELF
 *           (falling, spreading, steam rising), or −1. Both cells must
 *           be open on the sides that touch. And A PUMP IS A SHUT DOOR:
 *           nothing goes into a pump by itself, from any side. The only
 *           water that gets past a pump is what the pump pushes, from
 *           the cell behind it to the cell in front (see workingPumps
 *           and pressWater). So a pump that is switched off holds a
 *           whole tank back. (Water that is somehow INSIDE a pump, from
 *           an old saved world or a pump built into a pond, may leave
 *           through the pump's front.)
 *   joined  the neighbor that is open BOTH ways, with neither cell a
 *           pump: cells where water stands as one body. Or −1
 *
 * and for each cell `i`:
 *
 *   pump    1 if the cell is a pump
 *   sky     1 if the cell is in the top row and open upward: the top of
 *           the world is open sky for water
 *   floor   how many cells its floor is above the bottom of the world
 * @param {object} world - the world
 * @param {string[][]} sides - open sides by cell index (from allOpenSides)
 * @param {Function} blockInfo - looks up what a block name means
 * @returns {{to: Int32Array, joined: Int32Array, pump: Uint8Array, sky: Uint8Array, floor: Int32Array}} the lists
 */
export function flowTable(world, sides, blockInfo) {
  const { width, height } = world;
  const size = world.cells.length;
  const to = new Int32Array(size * 4).fill(-1);
  const joined = new Int32Array(size * 4).fill(-1);
  const pump = new Uint8Array(size);
  const sky = new Uint8Array(size);
  const floor = new Int32Array(size);
  const open = new Uint8Array(size);  // which sides each cell is open on: one bit for each side
  const front = new Int8Array(size);  // for a pump, the side number of its front; else −1
  for (let index = 0; index < size; index++) {
    for (const side of sides[index]) open[index] |= 1 << SIDE_INDEX[side];
    const name = world.cells[index];
    const way = name === AIR ? undefined : blockInfo(name)?.fluid?.pump;
    front[index] = way ? SIDE_INDEX[way] : -1;
    pump[index] = way ? 1 : 0;
    floor[index] = height - 1 - Math.floor(index / width);
    sky[index] = index < width && (open[index] & 1) ? 1 : 0;
  }
  const across = [-width, 1, width, -1]; // how far away the neighbor on each side is
  for (let index = 0; index < size; index++) {
    if (!open[index]) continue;
    const x = index % width;
    for (let side = 0; side < 4; side++) {
      if (!(open[index] & (1 << side))) continue;
      if ((side === 1 && x === width - 1) || (side === 3 && x === 0)) continue; // the edge of the world
      const next = index + across[side];
      if (next < 0 || next >= size || !(open[next] & (1 << ((side + 2) % 4)))) continue;
      // A pump is a shut door: nothing goes in by itself, and what is inside
      // may only leave through its front.
      if (front[next] >= 0) continue;
      if (front[index] >= 0 && front[index] !== side) continue;
      to[index * 4 + side] = next;
      if (!pump[index] && !pump[next]) joined[index * 4 + side] = next;
    }
  }
  return { to, joined, pump, sky, floor };
}

/**
 * List the pumps that are switched on and can work this tick: enough
 * current, and open cells behind and in front.
 *
 * PUMPS IN A ROW WORK AS ONE. Pumps standing nose to tail, all facing
 * the same way, are listed as one taller pump that takes water from
 * the cell behind the first and puts it in the cell in front of the
 * last. Like batteries in a row, their pushes add up: two pumps lift
 * twice as high as one. But the water has to squeeze through both, so
 * with nothing to lift they move no more than one pump does. Every pump
 * in the row has to be switched on: one that is off is a shut door, and
 * shuts the whole row. (So do two pumps pushing nose to nose.)
 * @param {object} world - the world
 * @param {Function} blockInfo - looks up what a block name means
 * @param {string[][]} sides - open sides by cell index (from allOpenSides)
 * @returns {Array<{index: number, back: number, ahead: number, level: number, count: number}>}
 *   for each pump (or row of pumps): its first cell, the cell behind it,
 *   the cell in front of it, how much electricity it gets (1 = one
 *   battery; for a row, all its pumps' added up), and how many pumps
 *   are in the row
 */
export function workingPumps(world, blockInfo, sides) {
  const pumps = [];
  /**
   * Which way does the pump in this cell push? (undefined if it isn't a pump.)
   * @param {number} index - the cell
   * @returns {string|undefined} the side its front is on
   */
  const frontOf = (index) => (world.cells[index] === AIR ? undefined : blockInfo(world.cells[index])?.fluid?.pump);
  for (let index = 0; index < world.cells.length; index++) {
    const front = frontOf(index);
    if (!front) continue;
    const [dx, dy] = STEP[front];
    const across = dx + dy * world.width;
    let x = index % world.width;
    let y = Math.floor(index / world.width);
    if (!inBounds(world, x - dx, y - dy)) continue;
    const back = index - across;
    // Only the FIRST pump of a row lists the row.
    if (frontOf(back) === front) continue;
    if (frontOf(back) || !sides[back].includes(front)) continue;
    let level = 0;
    let count = 0;
    let ahead = index;
    let on = true;
    while (on && frontOf(ahead) === front) {
      // The real current (not `level`, which stops at 2 so lamps don't get
      // too bright): more batteries really do pump faster and higher.
      const own = (world.signals.electric?.cells?.get(ahead)?.current ?? 0) / REFERENCE_CURRENT;
      if (own < PUMP_ON_LEVEL) on = false;
      level += own;
      count += 1;
      x += dx;
      y += dy;
      if (!inBounds(world, x, y)) on = false;
      ahead += across;
    }
    if (!on || frontOf(ahead) || !sides[ahead].includes(OPPOSITE[front])) continue;
    pumps.push({ index, back, ahead, level, count });
  }
  return pumps;
}

/**
 * Move the steam for one small step. Steam follows three rules, like
 * water upside down (it "falls" toward the sky):
 *
 *   1. UP first: steam rises into room above.
 *   2. SIDEWAYS: steam evens out with its left and right neighbors.
 *   3. DOWN: steam packed in under a ceiling is SQUEEZED (a cell holds a
 *      bit more than 1: see STEAM_SQUEEZE), and the extra pushes back
 *      down. Steam is a gas, so it really can be squeezed. Water can't:
 *      see flowWater and pressWater for how water pushes instead.
 *
 * Every cell's flow is worked out from the amounts at the START of the
 * step and added up in a fresh copy, so it doesn't matter which cell
 * goes first, and left and right are treated just the same.
 *
 * The ENERGY each move gives up is worked out at the end of the step,
 * once we know everything that left and entered each cell. Each cell's
 * energy change is shared out between its moves by how much steam each
 * one carried, so puffs that meet in one cell are never counted for
 * more than the steam really gave up, and left and right get the same.
 * No move's share is less than nothing (see settleShares).
 *
 * @param {object} world - the world
 * @param {Function} canFlow - (index, side) => the neighbor steam may flow into, or −1 (see flowTable's `to`)
 * @param {Function} onMove - told (fromIndex, toIndex, amount, energy, drop, part)
 *   for every move: `energy` is how much the steam gave up by moving (see
 *   fallEnergy, which works for steam with "down" meaning up), `drop` is
 *   how many cells HIGHER it ended up (1 rising, 0 sideways, −1 sinking),
 *   and `part` is how much of the cell's steam this move took (0 to 1)
 * @returns {number} the total amount that moved
 */
export function flowSteam(world, canFlow, onMove) {
  const before = world.fluid.steam;
  let none = true;
  for (let index = 0; index < before.length && none; index++) if (before[index] > 0) none = false;
  if (none) return 0; // not a puff anywhere: nothing to do
  const after = Float64Array.from(before);
  const water = world.fluid.water;
  let moved = 0;
  const moves = [];
  const left = new Map();    // how much left each cell this step
  const entered = new Map(); // how much entered each cell this step

  /**
   * Move some steam from one cell to another.
   * @param {number} from - the cell it leaves
   * @param {number} to - the cell it goes to
   * @param {number} amount - how much
   * @param {number} drop - how many cells higher it ends up (1 rising, 0 sideways, −1 sinking)
   * @returns {void}
   */
  const move = (from, to, amount, drop) => {
    if (amount <= 0) return;
    after[from] -= amount;
    after[to] += amount;
    moved += amount;
    moves.push({ from, to, amount, drop });
    left.set(from, (left.get(from) ?? 0) + amount);
    entered.set(to, (entered.get(to) ?? 0) + amount);
  };

  /**
   * Can steam spread sideways (or sink) into this cell? Not into cells
   * that are mostly water. (Steam may always RISE into water: bubbles!
   * And water may always go into steamy cells.)
   * @param {number} to - the cell index
   * @returns {boolean} true if it may
   */
  const roomFor = (to) => water[to] <= 0.5;

  for (let index = 0; index < before.length; index++) {
    let remaining = before[index];
    if (remaining <= 0) continue;

    const above = canFlow(index, 'up');
    if (above >= 0) {
      const flow = clamp(stableBelow(remaining + before[above]) - before[above], 0, Math.min(MAX_FLOW, remaining));
      move(index, above, flow, 1);
      remaining -= flow;
    }
    if (remaining <= 0) continue;

    // Both sides are worked out from the SAME amount (what's here after
    // the rising), so neither side is the favorite. Each side gets at
    // most a quarter, so together they never take more than is here.
    const level = remaining;
    for (const side of ['left', 'right']) {
      const beside = canFlow(index, side);
      if (beside < 0 || !roomFor(beside)) continue;
      const flow = clamp((level - before[beside]) / 4, 0, remaining);
      move(index, beside, flow, 0);
      remaining -= flow;
    }
    if (remaining <= 0) continue;

    const below = canFlow(index, 'down');
    if (below >= 0 && roomFor(below)) {
      const flow = clamp(remaining - stableBelow(remaining + before[below]), 0, Math.min(MAX_FLOW, remaining));
      move(index, below, flow, -1);
    }
  }

  const energy = new Float64Array(moves.length);
  moves.forEach(({ from, to, amount, drop }, m) => {
    // This move's share of what its two cells' steam lost: the cell it
    // left (by all that left it) and the cell it entered (by all that entered).
    // (Steam's energy is worked out like water's, upside down: see RISE_POWER.)
    const gone = left.get(from);
    const came = entered.get(to);
    energy[m] = amount * drop
      + (storedEnergy(before[from]) - storedEnergy(before[from] - gone)) * (amount / gone)
      + (storedEnergy(before[to]) - storedEnergy(before[to] + came)) * (amount / came);
  });
  // No share below zero, and all of them together no more than the steam lost.
  settleShares(moves.map((move) => move.from), moves.map((move) => move.to), energy, before.length);
  moves.forEach(({ from, to, amount, drop }, m) => {
    onMove(from, to, amount, energy[m], drop, Math.min(1, amount / before[from]));
  });

  for (let index = 0; index < after.length; index++) if (after[index] < 0) after[index] = 0;
  world.fluid.steam = after;
  return moved;
}

/**
 * Make the shares of a set of moves fair: NO MOVE'S SHARE IS LESS THAN
 * NOTHING, and all of them together are still exactly what the fluid
 * gave up.
 *
 * Why it is needed: a cell's energy change is shared between its moves
 * by how much each one carried. That adds up right, but now and then it
 * hands one move a share below zero and its neighbor a share that is
 * too big by just as much. (Say a little water and a lot of water flow
 * into the same cell from two sides. The cell's level goes up past
 * where the little one came from, so that one looks as if it went
 * uphill, and the big one looks better than it was.) If the too-small
 * share were just called 0, a water wheel on the other move would be
 * given a speck more than the water lost.
 *
 * So each share below zero is paid back by the moves it was shared
 * with, each by how big its own share is: first the other moves out of
 * the same cell, then the other moves into the same cell, and last (it
 * hardly ever comes to that) all the moves there are.
 * @param {ArrayLike<number>} from - for each move, the cell it left
 * @param {ArrayLike<number>} to - for each move, the cell it went to
 * @param {Float64Array} energy - each move's share: changed in place
 * @param {number} size - how many cells the world has
 * @returns {void}
 */
export function settleShares(from, to, energy, size) {
  const count = energy.length;
  let short = false;
  for (let m = 0; m < count && !short; m++) if (energy[m] < 0) short = true;
  if (!short) return; // the usual answer: nothing to do
  const plus = new Float64Array(size);
  const minus = new Float64Array(size);
  for (const cells of [from, to]) {
    plus.fill(0);
    minus.fill(0);
    for (let m = 0; m < count; m++) {
      if (energy[m] > 0) plus[cells[m]] += energy[m];
      else minus[cells[m]] -= energy[m];
    }
    for (let m = 0; m < count; m++) {
      const cell = cells[m];
      if (minus[cell] === 0 || plus[cell] === 0) continue;
      // The moves at this cell with something to spare pay for the ones that are short.
      if (energy[m] > 0) energy[m] = plus[cell] > minus[cell] ? energy[m] * (plus[cell] - minus[cell]) / plus[cell] : 0;
      else energy[m] = minus[cell] > plus[cell] ? energy[m] * (minus[cell] - plus[cell]) / minus[cell] : 0;
    }
  }
  let spare = 0;
  let owed = 0;
  for (let m = 0; m < count; m++) {
    if (energy[m] > 0) spare += energy[m];
    else owed -= energy[m];
  }
  if (owed === 0) return;
  const keep = spare > owed ? (spare - owed) / spare : 0;
  for (let m = 0; m < count; m++) energy[m] = energy[m] > 0 ? energy[m] * keep : 0;
}

// =============================================================
// Water: FALL, PRESS, SPREAD
// =============================================================

/**
 * A count of the heavy work done so far, for tests and timing tools
 * (like `work` in circuit.js). `solves` goes up by one every time
 * pressWater works out the pressures in one body of water, and `points`
 * by how many cells were in it. Still water costs nothing: a settled
 * pond is never counted here. `stuck` counts the times a body of water
 * could not be settled in PRESS_ROUNDS tries and was left alone for one
 * small step (hardly ever: once in millions of sums).
 */
export const pressWork = { solves: 0, points: 0, stuck: 0 };

/** Surfaces whose heights differ by less than this are level (see the still-water short cut in pressWater). */
const STILL = 1e-12;

/**
 * Solve a set of straight-line equations  A · x = b  where A is
 * "banded": the only numbers in it that aren't 0 are close to the
 * diagonal (row i only has numbers in columns i − band to i + band),
 * and it is the same when mirrored across the diagonal. The water
 * circuit in pressWater always comes out like that, because a cell only
 * touches its neighbors.
 *
 * (This is called a banded Cholesky solve. It takes about n × band²
 * steps, where the general solver in circuit.js takes n³ ÷ 3: for a
 * world brim full of water that is 66 000 steps against 12 million.)
 * @param {number} n - how many unknowns
 * @param {number} band - how far from the diagonal the numbers reach
 * @param {Float64Array} matrix - the lower half of A, row by row: row i's
 *   number for column j (i − band ≤ j ≤ i) is at i × (band + 1) + j − i + band.
 *   It is changed (used as scratch paper)
 * @param {Float64Array} rhs - b going in, x coming out
 * @returns {boolean} false if the equations have no single answer
 */
export function solveBanded(n, band, matrix, rhs) {
  const wide = band + 1;
  for (let i = 0; i < n; i++) {
    const low = Math.max(0, i - band);
    const row = i * wide + band - i;
    for (let j = low; j <= i; j++) {
      let sum = matrix[row + j];
      const other = j * wide + band - j;
      for (let k = Math.max(low, j - band); k < j; k++) sum -= matrix[row + k] * matrix[other + k];
      if (j === i) {
        if (!(sum > 1e-14)) return false;
        matrix[row + i] = Math.sqrt(sum);
      } else matrix[row + j] = sum / matrix[other + j];
    }
  }
  for (let i = 0; i < n; i++) {
    let sum = rhs[i];
    const row = i * wide + band - i;
    for (let k = Math.max(0, i - band); k < i; k++) sum -= matrix[row + k] * rhs[k];
    rhs[i] = sum / matrix[row + i];
  }
  for (let i = n - 1; i >= 0; i--) {
    let sum = rhs[i];
    const last = Math.min(n - 1, i + band);
    for (let k = i + 1; k <= last; k++) sum -= matrix[k * wide + band - k + i] * rhs[k];
    rhs[i] = sum / matrix[i * wide + band];
  }
  return true;
}

/** Scratch paper for solveBanded's matrix, kept between calls so it isn't made afresh thousands of times. */
let bandScratch = new Float64Array(0);

/**
 * PRESS: the middle part of one small step of water (see flowWater).
 * Deep water presses harder, and this is where that push moves water:
 * up a pipe, out of a hole, round a ring.
 *
 * Water can't be squashed, so a full cell can only take water in if the
 * same amount goes out of it in the same moment. That makes all the
 * full cells that touch each other ONE puzzle, and it is the same
 * puzzle as an electric circuit (see circuit.js), with water as the
 * current:
 *
 *   • Every full cell is a POINT with an unknown HEAD: how high its
 *     water would stand in an open tube (its pressure, plus the height
 *     of its floor). Still water has the same head everywhere.
 *   • Two full cells that touch are joined by a LINK, like a resistor:
 *     flow = PIPE_EASE × the difference of their heads.
 *   • Where a full cell touches a cell that isn't full, there is an END:
 *     a place where the head is known. Above it, that is a SURFACE:
 *     flow = SURFACE_EASE × (head − the height of the surface), either
 *     way. Beside or under it, it is a HOLE: water squirts out, harder
 *     the more pressure is behind it (SQUIRT_EASE), and never comes back
 *     in that way. The top row of the world is open SKY: water there
 *     may sink, but nothing rises past it.
 *   • A PUMP that is switched on is like a battery: it joins the cell
 *     behind it to the cell in front, and pushes (see pumpAmount). A
 *     pump doesn't suck: if the water behind it isn't pressed toward
 *     it, it just empties the cell behind it. A pump that is switched
 *     off is a shut door: no water gets past it at all, pressed or
 *     not (see flowTable). Pumps in a row work as one taller pump
 *     (see workingPumps). And a pump with nothing behind it moves
 *     nothing: an open cell behind it can give no more than it
 *     holds, so a pump running dry never holds up the water it points
 *     into.
 *   • The rule for every point: what flows in, flows out.
 *
 * Solving that (solveBanded) gives every point's head, and so every
 * flow. Then each end is checked: a hole that would suck is shut; an end
 * that would give its cell more water than it has room for gives just
 * that much. And A CELL THAT FILLS RIGHT UP PASSES THE REST OF THE PUSH
 * ON in the same small step (it becomes a point too). So pressure goes
 * straight down a pipe that was only nearly full, and water pressed out
 * into a puddle that fills its cell pushes the puddle on in turn: a
 * tank with a hole at its foot floods the floor outside, faster the
 * deeper the tank, and is never held back by its own puddle. Water
 * squirting into air that has room for it is NOT pressed on: its
 * pressure is used up at the spout, where a water wheel can catch it.
 *
 * STILL WATER COSTS NOTHING: a body of water whose surfaces all stand
 * level, with no hole letting water out and no pump, is not solved at
 * all (its head is just the height of its surface).
 *
 * THE BOOKS. Every flow runs from more head to less, and gives up
 * amount × (the head it lost). That is told to `onMove`, so a water
 * wheel in a pipe gets exactly what the water gave up going through it.
 * Nothing here can raise the water's energy except a pump, and the work
 * each pump did on the water is added up in `pumpWork`.
 *
 * NOTHING HANGS ON A ROUNDING SPECK. Sums like these never come out as
 * exactly nothing: a flow that should be 0 comes out as a speck above or
 * below it. So a flow of a million-millionth or less counts as nothing
 * wherever a choice is made (is this hole pressed? does this pump
 * run?), and that is what makes a mirrored build give the mirrored
 * answer.
 * @param {object} world - the world
 * @param {Float64Array} w - how much water each cell holds, after FALL (not changed)
 * @param {{joined: Int32Array, pump: Uint8Array, sky: Uint8Array, floor: Int32Array}} table - from flowTable
 * @param {Array<{back: number, ahead: number, level: number, count: number}>} pumps - from workingPumps
 * @param {Function} onMove - told (from, to, amount, energy, drop, 0, true) for every pressed move
 * @param {Float64Array} press - filled in with every cell's pressure: for a
 *   point, how tall the water standing over its floor is (a full cell
 *   with 3 full cells on it reads 4); for any other cell, its own amount
 * @returns {{after: Float64Array, moved: number, carried: Uint8Array, pumpWork: number}}
 *   the water after PRESS; how much moved; for cell `i` and side number
 *   `s`, 1 at place i × 4 + s if pressed water (more than a rounding speck) left the cell that way;
 *   and the energy the pumps gave the water
 */
function pressWater(world, w, table, pumps, onMove, press) {
  const { width, height } = world;
  const size = w.length;
  const { joined, pump: isPump, sky, floor } = table;
  const carried = new Uint8Array(size * 4);
  const full = new Uint8Array(size);
  let any = false;
  for (let i = 0; i < size; i++) {
    press[i] = w[i];
    if (w[i] >= FULL - FULL_SLACK && !isPump[i]) {
      full[i] = 1;
      any = true;
    }
  }
  // Nothing full and no pump running: nothing is pressed.
  if (!any && pumps.length === 0) return { after: w, moved: 0, carried, pumpWork: 0 };

  const promoted = new Uint8Array(size); // cells that fill up in this step: points too
  const banned = new Uint8Array(size);   // cells that were tried as points and weren't really pressed
  const opened = new Uint8Array(size);   // full cells a pump is emptying: not points in this step
  const pumpEnd = new Uint8Array(size);  // cells right behind or in front of a pump that can move water
  const node = new Uint8Array(size);      // 1 for every point
  const local = new Int32Array(size).fill(-1); // a point's number inside the group being solved
  const parent = new Int32Array(size);    // for finding which points hang together
  const groupOf = new Int32Array(size);
  const H = new Float64Array(size);       // every point's head
  let flows = [];

  /**
   * Which group of joined points is this point in? (Follows `parent` up to the top.)
   * @param {number} i - a point's cell index
   * @returns {number} the cell index that stands for its whole group
   */
  const find = (i) => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  /**
   * Put two points in the same group.
   * @param {number} a - one point
   * @param {number} b - another
   * @returns {void}
   */
  const union = (a, b) => {
    a = find(a);
    b = find(b);
    if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
  };
  /**
   * The head at a cell: what was just solved for a point of the group
   * in hand, or else the height of the cell's own water.
   * @param {number} cell - the cell index
   * @param {Float64Array} x - the group's answers
   * @returns {number} its head
   */
  const headAt = (cell, x) => (local[cell] >= 0 ? x[local[cell]] : floor[cell] + w[cell]);

  for (let pass = 0; ; pass++) {
    // The last try: no more new points, only what is certain.
    const last = pass >= PRESS_PASSES;
    for (let i = 0; i < size; i++) {
      if (last && promoted[i]) {
        promoted[i] = 0;
        banned[i] = 1;
      }
      node[i] = (full[i] || promoted[i]) && !opened[i] ? 1 : 0;
      press[i] = w[i];
      parent[i] = i;
      groupOf[i] = -1;
    }

    // --- Links, and which points hang together.
    const edges = [];
    for (let i = 0; i < size; i++) {
      if (!node[i]) continue;
      for (let side = 1; side <= 2; side++) { // right, down
        const next = joined[i * 4 + side];
        if (next >= 0 && node[next]) {
          edges.push(i, next);
          union(i, next);
        }
      }
    }
    // --- Pumps. `ease` is the pump's straight line (see pumpAmount), a
    // little gentler for each of its two cells that is open: an open
    // cell's level moves as the pump moves water, and the lift is
    // measured AFTER the water has moved, so the pump never overshoots.
    // A PUMP WITH NOTHING BEHIND IT MOVES NOTHING: an open cell behind
    // the pump can give no more than it holds, and an open cell in front
    // can take no more than it has room for (`cap`). A pump whose cap is
    // nothing is left out: it is as good as switched off.
    const pumpParts = [];
    pumpEnd.fill(0);
    for (const { back, ahead, level, count = 1 } of pumps) {
      const cap = Math.min(node[back] ? Infinity : w[back], node[ahead] ? Infinity : Math.max(0, FULL - w[ahead]));
      if (cap <= 1e-12) continue;
      pumpEnd[back] = 1;
      pumpEnd[ahead] = 1;
      const open = (node[back] ? 0 : 1) + (node[ahead] ? 0 : 1);
      // (A row of `count` pumps: the pushes add up in `level`, and the
      // water has to get through every one of them. See workingPumps.)
      const ease = PUMP_RATE / PUMP_HEAD / FLUID_STEPS / count;
      const stall = PUMP_HEAD * level;
      pumpParts.push({
        back, ahead, stall, ease: ease / (1 + ease * open), on: true, capped: false, starved: false, q: 0,
        cap, most: Math.min(PUMP_RATE * level / count / FLUID_STEPS, cap),
      });
      if (node[back] && node[ahead]) union(back, ahead);
    }
    // --- Groups: the points of each, column by column (so two joined
    // points are never numbered far apart: that keeps the band narrow).
    const groups = [];
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        const i = y * width + x;
        if (!node[i]) continue;
        const root = find(i);
        if (groupOf[root] < 0) {
          groupOf[root] = groups.length;
          groups.push({ nodes: [], edges: [], ends: [], pumps: [] });
        }
        groups[groupOf[root]].nodes.push(i);
      }
    }
    for (let e = 0; e < edges.length; e += 2) groups[groupOf[find(edges[e])]].edges.push(edges[e], edges[e + 1]);
    // --- Ends: where a point touches a cell that isn't one.
    for (let i = 0; i < size; i++) {
      if (!node[i]) continue;
      const ends = groups[groupOf[find(i)]].ends;
      const top = floor[i] + 1;
      if (sky[i]) {
        // Open sky: this cell is its own surface. It can sink; nothing rises past it.
        ends.push({ i, j: i, side: 0, sky: true, ease: SURFACE_EASE, head: top, phi: top, least: -Infinity, state: 0, q: 0, room: 0, high: 0, low: -Math.min(MAX_FLOW, w[i]) });
      }
      for (let side = 0; side < 4; side++) {
        const j = joined[i * 4 + side];
        if (j < 0 || node[j]) continue;
        const room = Math.max(0, FULL - w[j]);
        const phi = floor[j] + w[j];
        if (side === 0) {
          // A surface: the water above goes up or down with the head below it.
          ends.push({ i, j, side, sky: false, ease: SURFACE_EASE, head: phi, phi, least: -Infinity, state: 0, q: 0, room, high: Math.min(MAX_FLOW, room), low: -Math.min(MAX_FLOW, w[j] + w[i]) });
        } else if (side === 2) {
          // A hole underneath: it squirts by all the pressure on the cell's floor.
          ends.push({ i, j, side, sky: false, ease: SQUIRT_EASE, head: floor[i], phi, least: floor[i], state: 0, q: 0, room, high: Math.min(MAX_FLOW, room), low: 0 });
        } else {
          // A hole in the side: un-pressed water already spreads a quarter of
          // the difference (see SPREAD in flowWater); pressure adds to that.
          ends.push({ i, j, side, sky: false, ease: SQUIRT_EASE, head: top - (top - phi) / (4 * SQUIRT_EASE), phi, least: top, state: 0, q: 0, room, high: Math.min(MAX_FLOW, room), low: 0 });
        }
      }
    }
    const loosePumps = []; // pumps between two cells that aren't points: no sums needed
    for (const part of pumpParts) {
      if (node[part.back]) groups[groupOf[find(part.back)]].pumps.push(part);
      else if (node[part.ahead]) groups[groupOf[find(part.ahead)]].pumps.push(part);
      else loosePumps.push(part);
    }

    flows = [];
    let again = false;
    for (const group of groups) {
      const { nodes, ends } = group;
      const n = nodes.length;
      // Shut in, with no pump: nothing can move. It reads "just full".
      if (ends.length === 0 && group.pumps.length === 0) {
        for (const i of nodes) {
          H[i] = floor[i] + 1;
          press[i] = 1;
        }
        continue;
      }
      // STILL WATER COSTS NOTHING: every surface level, no hole that
      // would let water out, no pump, nothing over or under full.
      if (group.pumps.length === 0) {
        let level = NaN;
        let still = true;
        for (const end of ends) {
          if (end.side === 0) {
            if (Number.isNaN(level)) level = end.head;
            else if (Math.abs(end.head - level) > STILL) still = false;
          }
        }
        if (Number.isNaN(level)) still = false;
        for (const end of ends) {
          if (end.side !== 0 && !(level < end.least - STILL)) still = false;
        }
        let spare = 0;
        for (const i of nodes) spare += Math.abs(w[i] - FULL);
        if (still && spare <= STILL) {
          for (const i of nodes) {
            H[i] = level;
            press[i] = level - floor[i];
          }
          continue;
        }
      }

      for (let k = 0; k < n; k++) local[nodes[k]] = k;
      let band = 1;
      for (let e = 0; e < group.edges.length; e += 2) band = Math.max(band, Math.abs(local[group.edges[e]] - local[group.edges[e + 1]]));
      for (const part of group.pumps) {
        if (node[part.back] && node[part.ahead]) band = Math.max(band, Math.abs(local[part.back] - local[part.ahead]));
      }
      const wide = band + 1;
      if (bandScratch.length < n * wide) bandScratch = new Float64Array(n * wide);
      const A = bandScratch;
      const x = new Float64Array(n);
      const part = new Int32Array(n);  // which points hang together in THIS round (a stopped pump joins nothing)
      const held = new Uint8Array(n);  // parts with somewhere of known head to measure from
      const net = new Float64Array(n); // for a part with nowhere to measure from: its known flows, added up
      /**
       * Which part of the group is this point in, this round?
       * @param {number} k - the point's number in the group
       * @returns {number} the number that stands for its part
       */
      const partOf = (k) => {
        while (part[k] !== k) {
          part[k] = part[part[k]];
          k = part[k];
        }
        return k;
      };
      /**
       * Put two points of the group in the same part.
       * @param {number} a - one point's number
       * @param {number} b - another's
       * @returns {void}
       */
      const join = (a, b) => {
        a = partOf(a);
        b = partOf(b);
        if (a !== b) part[Math.max(a, b)] = Math.min(a, b);
      };
      /**
       * Add a link of this ease between two points to the equations.
       * @param {number} a - one point's number
       * @param {number} b - another's
       * @param {number} ease - the link's ease
       * @returns {void}
       */
      const link = (a, b, ease) => {
        A[a * wide + band] += ease;
        A[b * wide + band] += ease;
        const high = Math.max(a, b);
        A[high * wide + Math.min(a, b) - high + band] -= ease;
      };

      let ok = false;
      let bad = false;
      for (let round = 0; round < PRESS_ROUNDS; round++) {
        A.fill(0, 0, n * wide);
        held.fill(0);
        for (let k = 0; k < n; k++) {
          part[k] = k;
          x[k] = w[nodes[k]] - FULL; // what it must push out (or, if it is a speck short, take in)
        }
        for (let e = 0; e < group.edges.length; e += 2) {
          link(local[group.edges[e]], local[group.edges[e + 1]], PIPE_EASE);
          join(local[group.edges[e]], local[group.edges[e + 1]]);
        }
        for (const pump of group.pumps) {
          if (pump.on && node[pump.back] && node[pump.ahead]) join(local[pump.back], local[pump.ahead]);
        }
        for (const end of ends) {
          if (end.state === 2) continue; // shut
          const k = local[end.i];
          if (end.state === 0) { // free: its flow depends on the head
            A[k * wide + band] += end.ease;
            x[k] += end.ease * end.head;
            held[partOf(k)] = 1;
          } else x[k] -= end.q; // held at its most
        }
        for (const pump of group.pumps) {
          if (!pump.on) continue;
          const b = local[pump.back];
          const f = local[pump.ahead];
          if (pump.capped) {
            // Held at all its open cell can give (or take): a flow that is known.
            if (b >= 0) x[b] -= pump.q;
            if (f >= 0) x[f] += pump.q;
          } else if (b >= 0 && f >= 0) {
            link(b, f, pump.ease);
            x[b] -= pump.ease * pump.stall;
            x[f] += pump.ease * pump.stall;
          } else if (b >= 0) {
            A[b * wide + band] += pump.ease;
            x[b] += pump.ease * (floor[pump.ahead] + w[pump.ahead] - pump.stall);
            held[partOf(b)] = 1;
          } else {
            A[f * wide + band] += pump.ease;
            x[f] += pump.ease * (floor[pump.back] + w[pump.back] + pump.stall);
            held[partOf(f)] = 1;
          }
        }
        // A part with nothing to measure from has every one of its flows
        // held at a known amount. If those don't add up (more held coming
        // in than going out, or the other way round), something is held
        // too hard: let go of it, and do the sums again.
        net.fill(0);
        for (let k = 0; k < n; k++) if (!held[partOf(k)]) net[partOf(k)] += x[k];
        let letGo = false;
        for (const pump of group.pumps) {
          if (!pump.on || !pump.capped) continue;
          const b = local[pump.back];
          const f = local[pump.ahead];
          // Too much coming in: a pump pushing in may push less. Too much going out: a pump taking out may take less.
          if ((f >= 0 && !held[partOf(f)] && net[partOf(f)] > 1e-12) || (b >= 0 && !held[partOf(b)] && net[partOf(b)] < -1e-12)) {
            pump.capped = false;
            letGo = true;
          }
        }
        for (const end of ends) {
          if (end.state !== 1) continue;
          const root = partOf(local[end.i]);
          if (held[root]) continue;
          if ((net[root] < -1e-12 && end.q > 0) || (net[root] > 1e-12 && end.q < 0)) {
            end.state = 0;
            letGo = true;
          }
        }
        if (letGo) continue;
        // A part with nothing to measure from is shut in: only differences
        // of head matter in it. Pin one of its points at "just full".
        const loose = [];
        for (let k = 0; k < n; k++) {
          if (partOf(k) === k && !held[k]) {
            loose.push(k);
            A[k * wide + band] += 1;
            x[k] += floor[nodes[k]] + 1;
          }
        }
        pressWork.solves += 1;
        pressWork.points += n;
        if (!solveBanded(n, band, A, x)) break;

        // Check every end and pump against its limits.
        let changed = false;
        for (const end of ends) {
          if (end.state === 2) continue; // a way that is shut stays shut for this small step
          const head = x[local[end.i]];
          let want = end.ease * (head - end.head);
          if (head < end.least - 1e-12) want = -1; // not pressed: it only spreads (or falls) the usual way
          let state = 0;
          let q = want;
          if (want > end.high + 1e-12) {
            state = 1;
            q = end.high;
          } else if (want < end.low - 1e-12) {
            state = end.low === 0 ? 2 : 1;
            q = end.low;
          } else if (end.low === 0 && want <= 1e-12) {
            // (A rounding speck either side of nothing is nothing: which side it fell on must not matter.)
            state = 2;
            q = 0;
          }
          if (state !== end.state || (state === 1 && Math.abs(q - end.q) > 1e-15)) changed = true;
          end.state = state;
          end.q = state === 2 ? 0 : q;
        }
        for (const pump of group.pumps) {
          if (!pump.on) continue;
          const want = pump.ease * (pump.stall - headAt(pump.ahead, x) + headAt(pump.back, x));
          if (want <= 1e-12) {
            // A pump never runs backwards. (If the water behind it isn't even
            // pressed, it is starved.) A pump that can move nothing comes out
            // as a rounding speck either side of 0: that counts as nothing too,
            // so that which side it fell on never matters.
            pump.on = false;
            pump.q = 0;
            changed = true;
            // (Only where there is something to measure the push from: in a
            // shut-in part the heads are only right compared with each other.)
            const b = local[pump.back];
            if (b >= 0 && held[partOf(b)] && x[b] < floor[pump.back] + 1 - 1e-9) pump.starved = true;
          } else if (want > pump.cap + 1e-12) {
            // It would move more than its open cell holds (or has room for):
            // it moves just that much. (A pump with nothing behind it moves nothing.)
            if (!pump.capped || Math.abs(pump.q - pump.cap) > 1e-15) changed = true;
            pump.capped = true;
            pump.q = pump.cap;
          } else {
            if (pump.capped) changed = true;
            pump.capped = false;
            pump.q = want;
          }
        }
        // A shut-in part must not take in or give out any water.
        bad = false;
        for (const k of loose) if (Math.abs(x[k] - floor[nodes[k]] - 1) > 1e-9) bad = true;
        if (!changed) {
          ok = true;
          break;
        }
      }
      if (!ok) {
        // It didn't settle: this group moves nothing in this small step.
        pressWork.stuck += 1;
        for (const i of nodes) {
          H[i] = floor[i] + 1;
          local[i] = -1;
        }
        continue;
      }
      // A shut-in part: call its lowest pressure "just full".
      const least = new Float64Array(n).fill(Infinity);
      for (let k = 0; k < n; k++) {
        const root = partOf(k);
        if (!held[root]) least[root] = Math.min(least[root], x[k] - floor[nodes[k]] - 1);
      }
      for (let k = 0; k < n; k++) {
        const root = partOf(k);
        if (!held[root]) x[k] -= least[root];
      }
      for (let k = 0; k < n; k++) {
        H[nodes[k]] = x[k];
        press[nodes[k]] = x[k] - floor[nodes[k]];
      }
      // A pump does not suck: if the water behind it is not pressed, the
      // pump empties that one cell instead (and it is no point this step).
      for (const pump of group.pumps) {
        const b = local[pump.back];
        if (b >= 0 && (pump.starved || (pump.q > 0 && held[partOf(b)] && x[b] < floor[pump.back] + 1 - 1e-9))) {
          opened[pump.back] = 1;
          again = true;
        }
      }
      // A cell we counted as "fills up" must really come out pressed.
      for (const i of nodes) {
        if (promoted[i] && H[i] < floor[i] + 1 - 1e-9) {
          promoted[i] = 0;
          banned[i] = 1;
          again = true;
        }
      }
      // A CELL THAT FILLS UP PASSES THE PUSH ON: a cell that gets more than
      // it has room for fills up, and counts as a point from now on in this
      // small step. (Not the open sky, and not a pump's own two cells.)
      if (!last) {
        for (const end of ends) {
          if (end.sky || end.state !== 1 || end.q <= 0 || end.q < end.room - 1e-15 || banned[end.j] || pumpEnd[end.j]) continue;
          promoted[end.j] = 1;
          again = true;
        }
      }
      // Write down every flow, with the head energy it gave up (`lin`).
      const list = [];
      if (!bad) {
        for (let e = 0; e < group.edges.length; e += 2) {
          const a = group.edges[e];
          const b = group.edges[e + 1];
          const q = PIPE_EASE * (H[a] - H[b]);
          if (q > 0) list.push({ from: a, to: b, q, lin: q * (H[a] - H[b]), end: null, pump: null });
          else if (q < 0) list.push({ from: b, to: a, q: -q, lin: q * (H[a] - H[b]), end: null, pump: null });
        }
        for (const end of ends) {
          if (end.q > 0 && !end.sky) list.push({ from: end.i, to: end.j, q: end.q, lin: end.q * (H[end.i] - end.phi), end, pump: null });
          else if (end.q < 0) list.push({ from: end.j, to: end.i, q: -end.q, lin: -end.q * (end.phi - H[end.i]), end, pump: null });
        }
        for (const pump of group.pumps) {
          if (pump.q > 0) list.push({ from: pump.back, to: pump.ahead, q: pump.q, lin: 0, end: null, pump });
        }
      }
      flows.push({ list, scale: 1 });
      for (const i of nodes) local[i] = -1;
    }
    for (const pump of loosePumps) {
      const lift = floor[pump.ahead] + w[pump.ahead] - floor[pump.back] - w[pump.back];
      pump.q = Math.min(pump.most, Math.max(0, pump.ease * (pump.stall - lift)));
      if (pump.q > 0) flows.push({ list: [{ from: pump.back, to: pump.ahead, q: pump.q, lin: 0, end: null, pump }], scale: 1 });
    }
    if (!again || last) break;
  }

  // --- A safety net for cells that two groups (or a group and a pump)
  // both use: nothing may be over-filled or run dry. All the flows of a
  // group are scaled down together, so "what goes in comes out" stays true.
  // (A flow that is only a rounding speck doesn't count here: a speck with
  // no room for it must never slow a whole body of water down.)
  const SPECK = 1e-12;
  const into = new Float64Array(size);
  const outOf = new Float64Array(size);
  for (const group of flows) {
    for (const flow of group.list) {
      if (flow.q <= SPECK) continue;
      if (!node[flow.to]) into[flow.to] += flow.q;
      if (!node[flow.from] && !(flow.end && flow.end.side === 0)) outOf[flow.from] += flow.q;
    }
  }
  for (const group of flows) {
    let scale = 1;
    for (const flow of group.list) {
      if (flow.lin < -1e-12 && !flow.pump) scale = 0; // nothing but a pump may push water uphill
      if (flow.q <= SPECK) continue;
      if (!node[flow.to]) {
        const room = Math.max(0, FULL - w[flow.to]);
        if (into[flow.to] > room + 1e-15) scale = Math.min(scale, room / into[flow.to]);
      }
      if (!node[flow.from] && !(flow.end && flow.end.side === 0)) {
        if (outOf[flow.from] > w[flow.from] + 1e-15) scale = Math.min(scale, w[flow.from] / outOf[flow.from]);
      }
    }
    group.scale = scale;
  }

  // --- Move the water. Surfaces that GIVE go last: they take what is
  // still in the cell above, and the point under it is left short by the rest.
  const after = Float64Array.from(w);
  let moved = 0;
  const applied = [];
  for (const givers of [false, true]) {
    for (const group of flows) {
      if (group.scale <= 0) continue;
      for (const flow of group.list) {
        const giving = Boolean(flow.end && flow.end.side === 0 && flow.from === flow.end.j);
        if (giving !== givers) continue;
        let q = flow.q * group.scale;
        if (flow.q <= SPECK && !giving) {
          // A speck goes only as far as there is room for it, and water to take it from.
          if (!node[flow.to]) q = Math.min(q, Math.max(0, FULL - after[flow.to]));
          if (!node[flow.from]) q = Math.min(q, Math.max(0, after[flow.from]));
        }
        if (q <= 0) continue;
        moved += q;
        applied.push({ flow, q, lin: flow.lin * group.scale });
        if (giving && !flow.end.sky) {
          const fromTop = Math.min(q, Math.max(0, after[flow.from]));
          after[flow.from] -= fromTop;
          after[flow.to] += fromTop; // (the point passes all of q on through its other flows)
        } else if (!giving) {
          after[flow.from] -= q;
          after[flow.to] += q;
        }
      }
    }
  }

  // --- The books: what each flow really gave up. A flow's head energy
  // (`lin`) counts an open cell's water at the height it had at the
  // start. But that cell's level also rose (or sank) as it took (or
  // gave), so its real change is a little more: that little extra is
  // taken off the flows at that cell, shared by their head energy.
  /**
   * The height energy of some water in a cell (see storedEnergy).
   * @param {number} index - the cell
   * @param {number} amount - how much water
   * @returns {number} its energy
   */
  const energyOf = (index, amount) => storedEnergy(amount) + amount * floor[index];
  const real = new Float64Array(size);    // the real change of energy booked at each open cell
  const netEnd = new Float64Array(size);  // what came in (+) or went out (−) there through ends
  const linAt = new Float64Array(size);   // the head energy of those flows
  const pumpAt = new Float64Array(size);  // how much pumps moved in or out there
  const booked = new Float64Array(size);  // everything that came in (+) or went out (−) there
  const touched = new Uint8Array(size);
  const owner = new Int32Array(size).fill(-1); // for a point left short: the surface cell above it
  for (const { flow, q, lin } of applied) {
    if (flow.pump) {
      if (!node[flow.from]) {
        pumpAt[flow.from] += q;
        booked[flow.from] -= q;
        touched[flow.from] = 1;
      }
      if (!node[flow.to]) {
        pumpAt[flow.to] += q;
        booked[flow.to] += q;
        touched[flow.to] = 1;
      }
      continue;
    }
    if (!flow.end) continue;
    const j = flow.end.j;
    netEnd[j] += flow.to === j ? q : -q;
    booked[j] += flow.to === j ? q : -q;
    linAt[j] += lin;
    touched[j] = 1;
    if (flow.from === j && flow.end.side === 0 && after[flow.end.i] < w[flow.end.i]) owner[flow.end.i] = j;
  }
  for (let cell = 0; cell < size; cell++) {
    if (after[cell] === w[cell]) continue;
    const change = energyOf(cell, after[cell]) - energyOf(cell, w[cell]);
    if (touched[cell]) real[cell] += change;
    else if (owner[cell] >= 0 && change < 0) real[owner[cell]] += change;
  }
  const extraEnd = new Float64Array(size);  // the extra, for the flows through ends there
  const extraPump = new Float64Array(size); // and for the pumps there
  for (let cell = 0; cell < size; cell++) {
    if (!touched[cell]) continue;
    const extra = real[cell] - booked[cell] * (floor[cell] + w[cell]);
    extraEnd[cell] = pumpAt[cell] > 0 ? Math.min(extra, netEnd[cell] * netEnd[cell] / 2) : extra;
    extraPump[cell] = extra - extraEnd[cell];
  }
  let pumpWork = 0;
  for (const { flow, q, lin } of applied) {
    if (flow.pump) {
      // What the pump gave the water: how much × how far up it pushed it.
      let gain = q * ((node[flow.to] ? H[flow.to] : floor[flow.to] + w[flow.to]) - (node[flow.from] ? H[flow.from] : floor[flow.from] + w[flow.from]));
      if (!node[flow.from]) gain += extraPump[flow.from] * q / pumpAt[flow.from];
      if (!node[flow.to]) gain += extraPump[flow.to] * q / pumpAt[flow.to];
      pumpWork += gain;
      continue;
    }
    if (flow.end && flow.end.sky) continue; // nothing moved between two cells: the top cell just sank
    let energy = lin;
    if (flow.end) {
      const j = flow.end.j;
      if (linAt[j] > 0) energy -= extraEnd[j] * lin / linAt[j];
    }
    const side = flow.to === flow.from - width ? 0 : flow.to === flow.from + 1 ? 1 : flow.to === flow.from + width ? 2 : 3;
    // (A move this small is only rounding being tidied up: not worth
    // telling, and it doesn't count as water pushed out of that side. Its
    // direction is a coin toss, and must not decide what SPREAD does next.)
    if (q <= FULL_SLACK) continue;
    carried[flow.from * 4 + side] = 1;
    onMove(flow.from, flow.to, q, energy, side === 2 ? 1 : side === 0 ? -1 : 0, 0, true);
  }
  return { after, moved, carried, pumpWork };
}

/**
 * Move the water for one small step, in three parts. Each part starts
 * from what the part before left:
 *
 *   1. FALL. Water falls into room in the cell below. The rows go from
 *      the bottom up, and each cell looks at the water as it is NOW, so
 *      a stack of water over a gap slides down together, and a full
 *      column over a leak stays full all the way up (only its top cell
 *      goes down).
 *   2. PRESS. Deep water presses harder: see pressWater. It moves water
 *      between full cells, in and out of surfaces, out of holes and
 *      through pumps.
 *   3. SPREAD. Water evens out with its left and right neighbors, by a
 *      quarter of the difference. Both sides are worked out from the
 *      SAME amount, so neither is the favorite: a stream landing on the
 *      middle of a ridge splits exactly in half. Water that only just
 *      arrived in this step doesn't spread yet, so a falling stream
 *      stays a stream. And water doesn't spread through a side that
 *      PRESS just pushed water out of (PRESS has done that already).
 *
 * No part ever puts more than FULL in a cell: water can't be squashed.
 *
 * The ENERGY each FALL and SPREAD move gives up is worked out once all
 * the moves of its part are known. Each cell's own change is shared
 * between its moves by how much water each one carried: what leaves is
 * counted off what the cell had, and what comes in lands on what was
 * left. So the shares add up to exactly what the water lost, and none
 * of them is less than nothing (see settleShares).
 * @param {object} world - the world
 * @param {{to: Int32Array, joined: Int32Array, pump: Uint8Array, sky: Uint8Array, floor: Int32Array}} table - from flowTable
 * @param {Function} onMove - told (fromIndex, toIndex, amount, energy, drop, part, pressed)
 *   for every move: `energy` is how much the water gave up by moving,
 *   `drop` is how many cells lower it ended up (1 falling, 0 sideways,
 *   −1 rising), `part` is how much of the water the cell held at the
 *   start of the small step this move took (0 to 1; always 0 for a
 *   pressed move), and `pressed` is true for water moved by pressure
 * @param {Array<{back: number, ahead: number, level: number, count: number}>} [pumps] - the pumps that are running (from workingPumps)
 * @returns {{moved: number, pumpWork: number}} the total amount that
 *   moved, and the energy the pumps gave the water
 */
export function flowWater(world, table, onMove, pumps = []) {
  const { width, height } = world;
  const start = world.fluid.water;
  const size = start.length;
  const { to } = table;
  if (world.signals.press?.length !== size) world.signals.press = new Float64Array(size);
  const press = world.signals.press;
  let dry = true;
  for (let index = 0; index < size && dry; index++) if (start[index] > 0) dry = false;
  if (dry) { // not a drop anywhere: nothing to do
    press.fill(0);
    return { moved: 0, pumpWork: 0 };
  }
  let moved = 0;
  /**
   * Tell onMove about a list of moves, with the energy each gave up.
   * Each move's `part` is its share of the water the cell held when
   * the small step BEGAN (not of what an earlier part left behind):
   * that is the water any push the cell carries belongs to, so all the
   * shares out of one cell in one small step never add up to more than 1.
   * @param {Float64Array} had - what every cell held before these moves
   * @param {number[]} moves - the moves, four numbers each: from, to, amount, drop
   * @returns {void}
   */
  const report = (had, moves) => {
    if (moves.length === 0) return;
    const gone = new Float64Array(size);
    const came = new Float64Array(size);
    for (let m = 0; m < moves.length; m += 4) {
      gone[moves[m]] += moves[m + 2];
      came[moves[m + 1]] += moves[m + 2];
      moved += moves[m + 2];
    }
    const count = moves.length / 4;
    const from = new Int32Array(count);
    const into = new Int32Array(count);
    const energy = new Float64Array(count);
    for (let k = 0; k < count; k++) {
      from[k] = moves[k * 4];
      into[k] = moves[k * 4 + 1];
      const amount = moves[k * 4 + 2];
      // What a cell gives leaves what it had; what comes in lands on what was left.
      const left = had[into[k]] - gone[into[k]];
      energy[k] = amount * moves[k * 4 + 3]
        + (storedEnergy(had[from[k]]) - storedEnergy(had[from[k]] - gone[from[k]])) * (amount / gone[from[k]])
        + (storedEnergy(left) - storedEnergy(left + came[into[k]])) * (amount / came[into[k]]);
    }
    // No share below zero, and all of them together still exactly what the water lost.
    settleShares(from, into, energy, size);
    for (let k = 0; k < count; k++) {
      const amount = moves[k * 4 + 2];
      onMove(from[k], into[k], amount, energy[k], moves[k * 4 + 3], Math.min(1, amount / start[from[k]]), false);
    }
  };

  // 1. FALL (bottom row first, so a stack of water slides down together).
  const fallen = Float64Array.from(start);
  const fell = new Float64Array(size);
  const falls = [];
  for (let y = height - 2; y >= 0; y--) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      const here = fallen[index];
      if (here <= 0) continue;
      const below = to[index * 4 + 2];
      if (below < 0) continue;
      const flow = Math.min(here, FULL - fallen[below], MAX_FLOW);
      if (flow <= FULL_SLACK && flow < here) continue; // no room worth the name (but a last speck may still drop)
      fallen[index] -= flow;
      fallen[below] += flow;
      fell[index] = flow;
      falls.push(index, below, flow, 1);
    }
  }
  report(start, falls);

  // 2. PRESS.
  const pressed = pressWater(world, fallen, table, pumps, onMove, press);
  moved += pressed.moved;
  const squeezed = pressed.after;

  // 3. SPREAD: water that was already here, and did not fall, evens out sideways.
  const water = Float64Array.from(squeezed);
  const spreads = [];
  for (let index = 0; index < size; index++) {
    const level = Math.min(start[index] - fell[index], squeezed[index]);
    if (level <= 0) continue;
    let remaining = level;
    for (let side = 3; side >= 1; side -= 2) { // left, then right
      const beside = to[index * 4 + side];
      if (beside < 0 || pressed.carried[index * 4 + side]) continue;
      const flow = clamp((level - squeezed[beside]) / 4, 0, remaining);
      if (flow <= FULL_SLACK / 4) continue;
      water[index] -= flow;
      water[beside] += flow;
      remaining -= flow;
      spreads.push(index, beside, flow, 0);
    }
  }
  report(squeezed, spreads);
  for (let index = 0; index < size; index++) {
    if (water[index] < 0) water[index] = 0;
    // A cell that isn't pressed reads its own amount (see pressWater).
    if (press[index] <= FULL || water[index] < FULL - FULL_SLACK) press[index] = water[index];
  }
  world.fluid.water = water;
  return { moved, pumpWork: pressed.pumpWork };
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
 * nothing to lift (pushing along a level pipe). More batteries move more.
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
 * crank (see WHEEL_STRENGTH in gears.js). Both the wheel and the pump use
 * this same number: that's what keeps the energy books honest.
 */
export const DROP_POWER = 10;

/**
 * How much turning-work the energy of RISING steam is worth: the same as
 * falling water (DROP_POWER). Steam is water going the other way: low
 * steam, and squeezed steam, holds energy the way high water does, and
 * gives it up by rising (see storedEnergy and fallEnergy, which work for
 * steam with "down" meaning up). So one burner's steam (0.05 a tick)
 * rising one cell through a turbine is as good as one faucet's water
 * falling one cell through a water wheel.
 */
export const RISE_POWER = DROP_POWER;

/** A pump needs at least this much circuit level to work. */
export const PUMP_ON_LEVEL = 0.25;

/**
 * How much water a pump moves in a tick.
 *
 * A pump is like you carrying buckets upstairs: on flat ground you carry
 * lots, the higher the stairs the fewer you manage, and at some height
 * you can't lift the bucket at all. So:
 *
 *   amount = PUMP_RATE × level × (1 − lift ÷ (PUMP_HEAD × level))
 *
 * `lift` is how much harder the water pushes back in front of the pump
 * than it pushes behind it, in cells of water: how much higher the pump
 * has to lift, plus what the pipes beyond it rub away. `level` is how
 * much electricity the pump gets (1 = one battery): more batteries move
 * more water AND lift it higher. Water pressing DOWNHILL through a
 * running pump (a lift below 0) helps it along a little.
 *
 * The work it does on the water (amount × lift × DROP_POWER) is biggest
 * half way up, and even there it is less than the electricity the pump
 * uses. The rest is lost as heat, like in a real pump.
 *
 * (pressWater uses this same straight line, a quarter of it in each
 * small step, as one more part of its water circuit: a pump there is
 * like a battery. And like batteries, pumps in a row add up: two pumps
 * nose to tail lift twice as high as one. See workingPumps.)
 * @param {number} level - the pump's current ÷ REFERENCE_CURRENT
 * @param {number} lift - how many cells of water it has to lift (downhill is negative)
 * @returns {number} how much water it moves in one tick
 */
export function pumpAmount(level, lift) {
  if (!(level > 0)) return 0;
  return Math.max(0, PUMP_RATE * level * (1 - lift / (PUMP_HEAD * level)));
}

/**
 * A burner stops boiling when the cell above it already holds this much
 * steam, like a lid rattling on a full kettle. Without it, a faucet
 * dripping onto a burner would pack the sky with steam forever.
 */
const BOIL_STEAM_CAP = FULL + STEAM_SQUEEZE;

/**
 * Let the special blocks do their jobs: faucets add water, burners boil
 * water into steam, chillers turn steam back into water, and drains
 * take water away. (Pumps are not here: they push while the water
 * moves. See pressWater.)
 *
 * They go in two rounds, so that it never matters which block comes
 * first in the world (a machine built the other way round, mirrored,
 * works just the same):
 *   1. faucets, burners and chillers. None of them ever puts more water
 *      in a cell than it has room for.
 *   2. drains, last of all: whatever ended up in a drain this tick is gone
 * @param {object} world - the world
 * @param {Function} blockInfo - looks up what a block name means
 * @param {string[][]} sides - open sides by cell index
 * @param {Map<number, number>} [chilled] - if given, it is filled in with
 *   how much steam the chillers turned back into water in each cell (by
 *   cell index): stepFluids uses it for steam chilled inside a turbine
 * @returns {number} the total amount that changed
 */
export function runSpecials(world, blockInfo, sides, chilled) {
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
  const drains = [];
  // Round 1: faucets, burners and chillers.
  for (let index = 0; index < world.cells.length; index++) {
    const info = blockInfo(world.cells[index]);
    if (!info) continue;
    if (info.drains) drains.push(index);
    if (info.faucet) {
      const below = beside(index, 'down');
      if (below >= 0 && sides[below].includes('up')) {
        const add = Math.min(FAUCET_RATE, Math.max(0, FULL - water[below]));
        water[below] += add;
        changed += add;
      }
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
        // Only as much as the cell has room for: water can't be squashed in.
        const cool = Math.min(CONDENSE_RATE, steam[next], Math.max(0, FULL - water[next]));
        steam[next] -= cool;
        water[next] += cool;
        changed += cool;
        if (chilled && cool > 0) chilled.set(next, (chilled.get(next) ?? 0) + cool);
      }
    }
  }
  // Round 2: drains.
  for (const index of drains) {
    if (water[index] <= 0) continue;
    changed += water[index];
    water[index] = 0;
  }
  return changed;
}

/**
 * Does the water going through a wheel lean to one side? If no water
 * goes sideways at all (it falls dead straight through the middle), the
 * water has no way round of its own to turn the wheel.
 * @param {{lean: number}} wheel - the water's sideways lean (+ to the right)
 * @returns {boolean} true if it leans left or right
 */
export function wheelLeans(wheel) {
  return Math.abs(wheel.lean) > 1e-9;
}

/**
 * Which way, and how much, the water going through a wheel turns it.
 *
 *   • Water leaving to the right turns it ↻ (+), to the left ↺ (−). Water
 *     leaving both ways pushes both ways, and that cancels.
 *   • Water leaving downward turns it the way the water LEANS: the way
 *     the sideways water goes (coming in or going out). So a mirrored
 *     machine turns the other way, just as fast. With no sideways water
 *     at all (straight down through the middle), down counts as ↻: but
 *     only if nothing else on its gears has a way of its own (see
 *     wheelLeans, and wheelSource in gears.js).
 * @param {{lean: number, sideOut: number, down: number}} wheel - the water's
 *   sideways lean (in and out, + to the right), the water that left
 *   sideways (+ right, − left) and the water that left down (+) or up (−)
 * @returns {number} the turning flow (+ = ↻)
 */
export function wheelTurn(wheel) {
  const amount = Math.abs(wheel.sideOut) + Math.abs(wheel.down);
  const way = wheelLeans(wheel) ? Math.sign(wheel.lean) : Math.sign(wheel.down);
  return way * amount || 0; // "|| 0" turns −0 into a plain 0
}

/**
 * One tick of fluids: water and steam move (in FLUID_STEPS small
 * steps: see flowWater and flowSteam), then the special blocks do their
 * jobs once.
 *
 * WATER MOVED BY PRESSURE GIVES ITS PUSH WHERE IT IS USED UP. Pressed
 * water going through a water wheel (in a pipe, or at a spout) gives
 * the wheel what it lost on the way through, and no more. It carries no
 * push onward: water that fell into the top of a full pipe has splashed
 * its push away in the pool, like any water that lands, and what comes
 * out at the bottom is pushed by pressure.
 *
 * FALLING WATER CARRIES ITS PUSH WITH IT. The energy water gives up
 * while it falls stays with that water (in world.signals.falling, by
 * cell) for as long as it keeps falling. If it lands on a water wheel,
 * the wheel gets all of it: so a taller waterfall really is stronger.
 * If it lands anywhere else and stops falling, or runs off sideways, it
 * has splashed its push away, like real water.
 *
 * RISING STEAM CARRIES ITS PUSH WITH IT, just the same, upside down
 * (world.signals.rising). The energy steam gives up while it rises
 * stays with it for as long as it keeps rising, and the first turbine
 * it meets WHILE IT IS STILL RISING gets all of it. Steam that stops
 * under a ceiling, or turns a corner and goes sideways, has lost its
 * push (like water that has splashed into a pool): so a turbine lying
 * on its side at the end of a pipe only gets the little its steam gives
 * up on that last step. Each bit of energy goes to ONE turbine at
 * the most: so turbines one after the other in a chimney share what the
 * steam gave up rising past them, and never get more.
 *
 * STEAM CHILLED INSIDE A TURBINE HAS GONE THROUGH IT. A chiller right
 * next to a turbine turns the steam back into water while it is still
 * in the turbine's cell. That steam came in through the blades and gave
 * up its push there, so it is counted as steam that went through, the
 * way it was going (a real power plant's turbine blows straight into
 * its condenser, just like this).
 * @param {object} world - the world
 * @param {Function} blockInfo - looks up what a block name means
 * @returns {{moved: number, turbines: Map<number, object>, waterOut: Map<number, number>, waterWork: Map<number, number>, wheels: Map<number, object>, sides: string[][], pumpWork: number}}
 *   how much changed in total, each turbine's count ({out, gross, work,
 *   into, inWay}: the steam that left it (or was chilled inside it), + up
 *   or right and − down or left; all the steam that left it; the energy
 *   the steam gave up there; all the steam that came into it; and the
 *   steam that came into it, + going up or right and − down or left), the
 *   turning flow of each water wheel (see wheelTurn), how much energy the
 *   water gave up at each water wheel, each wheel's full count
 *   ({lean, sideOut, down, gross, work}), every cell's open sides, and
 *   the energy the pumps gave the water this tick (in the same units as
 *   waterWork: × DROP_POWER to compare it with electricity)
 */
export function stepFluids(world, blockInfo) {
  const sides = allOpenSides(world, blockInfo);
  const table = flowTable(world, sides, blockInfo);
  /**
   * Can fluid go from cell `index` out through this side by itself?
   * (Looked up in the table: see flowTable's `to`.)
   * @param {number} index - the cell
   * @param {string} side - which side
   * @returns {number} the neighbor's index, or −1 if blocked
   */
  const canFlow = (index, side) => table.to[index * 4 + SIDE_INDEX[side]];
  const size = world.cells.length;
  // Water that doesn't fit (from an old save, or an edit from outside) is
  // given room first. Nearly always there is none: one quick look.
  makeRoom(world, blockInfo, table);
  // The pumps that are running. (Their current is last tick's.)
  const pumps = workingPumps(world, blockInfo, sides);
  const turbines = new Map();
  /**
   * The count for one turbine, made empty the first time.
   * @param {number} index - the turbine's cell index
   * @returns {{out: number, gross: number, work: number, into: number, inWay: number}} its count
   */
  const turbineAt = (index) => {
    if (!turbines.has(index)) turbines.set(index, { out: 0, gross: 0, work: 0, into: 0, inWay: 0 });
    return turbines.get(index);
  };
  // The push that rising steam is carrying, by cell (see above).
  let rising = world.signals.rising?.length === size ? world.signals.rising : new Float64Array(size);
  // Tidy up first: a cell whose steam has gone (chilled, dug) carries nothing,
  // and no steam can carry more than a rise from the bottom of the world.
  for (let index = 0; index < size; index++) {
    rising[index] = Math.min(rising[index], world.fluid.steam[index] * world.height);
  }
  let riseNext = new Float64Array(size);
  let roseFrom = new Uint8Array(size);    // 1 if steam rose out of this cell in this step
  let riseTaken = new Float64Array(size); // how much of each cell's steam moved away in this step
  /**
   * Count steam going through a turbine: countWheels (below) upside
   * down. How much leaves it and which way, how much comes in and which
   * way, and the ENERGY the steam gives up leaving a turbine, or brings
   * with it landing on one from somewhere that isn't a turbine. Each bit of energy is only ever
   * given to ONE turbine: when steam goes straight from one turbine into
   * another, the one it leaves gets it.
   *
   * Steam that isn't at a turbine keeps the energy it gives up for as
   * long as it keeps rising, and loses it when it goes sideways or down.
   * @param {number} from - the cell the steam left
   * @param {number} to - where it went
   * @param {number} amount - how much
   * @param {number} energy - how much energy the steam gave up (see fallEnergy)
   * @param {number} drop - how many cells HIGHER it ended up (1, 0 or −1): steam falls upward
   * @param {number} part - how much of the cell's steam this move took (0 to 1)
   * @returns {void}
   */
  const countTurbines = (from, to, amount, energy, drop, part) => {
    const leaves = Boolean(blockInfo(world.cells[from])?.turbine);
    const lands = Boolean(blockInfo(world.cells[to])?.turbine);
    // Up (drop 1) and right count +, down and left −.
    const way = (drop === 0 ? to > from : drop === 1) ? amount : -amount;
    if (leaves) {
      const turbine = turbineAt(from);
      turbine.gross += amount;
      turbine.out += way;
    }
    if (lands) {
      const turbine = turbineAt(to);
      turbine.into += amount;
      turbine.inWay += way;
    }
    // What this steam has to give: what it carried, and what it gave up just now.
    const brought = rising[from] * part;
    riseTaken[from] += part;
    if (drop === 1) roseFrom[from] = 1;
    const gives = Math.max(0, brought + energy);
    if (leaves) turbineAt(from).work += gives;
    else if (lands) turbineAt(to).work += gives;
    else if (drop === 1) riseNext[to] += gives; // still rising: it keeps its push
  };
  const wheels = new Map();
  /**
   * The count for one water wheel, made empty the first time.
   * @param {number} index - the wheel's cell index
   * @returns {{lean: number, sideOut: number, down: number, gross: number, work: number}} its count
   */
  const wheelAt = (index) => {
    if (!wheels.has(index)) wheels.set(index, { lean: 0, sideOut: 0, down: 0, gross: 0, work: 0 });
    return wheels.get(index);
  };
  // The push that falling water is carrying, by cell (see above).
  let falling = world.signals.falling?.length === size ? world.signals.falling : new Float64Array(size);
  // Tidy up first: a cell whose water has gone (drained, dug, boiled) carries
  // nothing, and no water can carry more than a fall from the top of the world.
  for (let index = 0; index < size; index++) {
    falling[index] = Math.min(falling[index], world.fluid.water[index] * world.height);
  }
  let next = new Float64Array(size);
  let fellFrom = new Uint8Array(size);   // 1 if water fell out of this cell in this step
  let taken = new Float64Array(size);    // how much of each cell's water moved away in this step
  /**
   * Count water going through a water wheel: how much leaves it and which
   * way (that says which way it turns), and the ENERGY the water gives up
   * leaving a wheel, or brings with it landing on one from somewhere that
   * isn't a wheel (that says how hard the wheel can push). Each bit of
   * energy is only ever given to ONE wheel: when water goes straight from
   * one wheel into another, the one it leaves gets it.
   *
   * Water that isn't at a wheel keeps the energy it gives up for as long
   * as it keeps falling, and loses it when it goes sideways or up.
   * @param {number} from - the cell the water left
   * @param {number} to - where it went
   * @param {number} amount - how much
   * @param {number} energy - how much energy the water gave up (see fallEnergy)
   * @param {number} drop - how many cells lower it ended up (1, 0 or −1)
   * @param {number} part - how much of the cell's water this move took (0 to 1)
   * @param {boolean} pressed - true if pressure moved it (see pressWater)
   * @returns {void}
   */
  const countWheels = (from, to, amount, energy, drop, part, pressed) => {
    const leaves = Boolean(blockInfo(world.cells[from])?.wheel);
    const lands = Boolean(blockInfo(world.cells[to])?.wheel);
    const sideways = drop === 0 ? (to > from ? amount : -amount) : 0; // + to the right
    if (leaves) {
      const wheel = wheelAt(from);
      wheel.gross += amount;
      wheel.sideOut += sideways;
      wheel.lean += sideways;
      wheel.down += drop * amount;
    }
    if (lands) wheelAt(to).lean += sideways;
    if (pressed) {
      // Pressed water gives what it lost on this move to the wheel it leaves
      // (or else lands on). It brings no push with it and carries none on.
      const gives = Math.max(0, energy);
      if (leaves) wheelAt(from).work += gives;
      else if (lands) wheelAt(to).work += gives;
      return;
    }
    // What this water has to give: what it carried, and what it gave up just now.
    const brought = falling[from] * part;
    taken[from] += part;
    if (drop === 1) fellFrom[from] = 1;
    const gives = Math.max(0, brought + energy);
    if (leaves) wheelAt(from).work += gives;
    else if (lands) wheelAt(to).work += gives;
    else if (drop === 1) next[to] += gives; // still falling: it keeps its push
  };
  let moved = 0;
  let pumpWork = 0;
  for (let step = 0; step < FLUID_STEPS; step++) {
    const flowed = flowWater(world, table, countWheels, pumps);
    moved += flowed.moved;
    pumpWork += flowed.pumpWork;
    // Water that stayed behind in a column that is still falling keeps its
    // share of the push. Water that has stopped falling has splashed it away.
    for (let index = 0; index < size; index++) {
      if (fellFrom[index] && falling[index] > 0) next[index] += falling[index] * Math.max(0, 1 - taken[index]);
    }
    falling = next;
    next = new Float64Array(size);
    fellFrom = new Uint8Array(size);
    taken = new Float64Array(size);
    moved += flowSteam(world, canFlow, countTurbines);
    // The same for steam left behind in a column that is still rising.
    for (let index = 0; index < size; index++) {
      if (roseFrom[index] && rising[index] > 0) riseNext[index] += rising[index] * Math.max(0, 1 - riseTaken[index]);
    }
    rising = riseNext;
    riseNext = new Float64Array(size);
    roseFrom = new Uint8Array(size);
    riseTaken = new Float64Array(size);
  }
  world.signals.falling = falling;
  world.signals.rising = rising;
  const chilled = new Map();
  moved += runSpecials(world, blockInfo, sides, chilled);
  // Steam chilled inside a turbine has gone through it (see above): it
  // counts as leaving the way this tick's steam came in (or, if none
  // came in just now, the way the rest is leaving; or else up).
  for (const [index, amount] of chilled) {
    if (!blockInfo(world.cells[index])?.turbine) continue;
    const turbine = turbineAt(index);
    turbine.gross += amount;
    turbine.out += (Math.sign(turbine.inWay) || Math.sign(turbine.out) || 1) * amount;
  }
  const waterOut = new Map();
  const waterWork = new Map();
  for (const [index, wheel] of wheels) {
    waterOut.set(index, wheelTurn(wheel));
    waterWork.set(index, wheel.work);
  }
  return { moved, turbines, waterOut, waterWork, wheels, sides, pumpWork };
}
