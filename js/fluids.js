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
 * out under ceilings. And STEAM HAS TO RISE TO GIVE ITS PUSH, the same
 * way: low steam (and squished steam) holds energy, and the only push a
 * turbine can catch is what its steam gives up by rising or un-squeezing.
 *
 * WATER HAS TO FALL TO GIVE ITS PUSH. High water (and squished water)
 * holds energy, like a ball at the top of a slide. Every time some water
 * moves, we work out how much lower it ended up (see fallEnergy): that
 * is the only push a water wheel can catch. Falling water keeps that
 * push for as long as it keeps falling, and gives it to the first wheel
 * it lands on (see stepFluids). And LIFTING WATER USES UP A
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
 * and ☁️ palette items. One tap never adds more than one full cell.
 *
 * A cell at the top of deep water that already LOOKS full takes no
 * more, even though the water drawn there really sits squished in the
 * cells below (see waterPicture): you can't pour into a full glass.
 * Pour just above the water instead.
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
  if (kind === 'water') {
    const picture = waterPicture(world, blockInfo);
    if (picture.source[index] >= 0 && picture.shown[index] >= FULL - MIN_AMOUNT) return false;
  }
  world.fluid[kind][index] = FULL;
  return true;
}

/**
 * DIG one scoop of water and steam out of a cell: at most ONE full cell
 * of each. Deep water is squished, so a deep cell holds a bit more than
 * one cell's worth; the extra stays behind (a bucket only holds a
 * bucketful).
 *
 * If the cell only LOOKS wet (its water is really squished into the
 * cells below: see waterPicture), the scoop takes what is drawn there
 * from the top of that water instead. So digging at water you can see
 * always takes water away.
 * @param {object} world - the world
 * @param {number} x - column
 * @param {number} y - row
 * @param {Function} blockInfo - looks up what a block name means
 * @returns {boolean} true if any fluid was taken
 */
export function scoop(world, x, y, blockInfo) {
  if (!inBounds(world, x, y)) return false;
  const index = y * world.width + x;
  const { water, steam } = world.fluid;
  let took = false;
  if (steam[index] > 0) {
    steam[index] = Math.max(0, steam[index] - FULL);
    took = true;
  }
  if (water[index] >= MIN_AMOUNT) {
    water[index] = Math.max(0, water[index] - FULL);
    return true;
  }
  // No water really here (or only a speck too small to see or draw: that
  // goes into the bucket too). Is some DRAWN here? Then take that much
  // from the water underneath, starting at its top cell and working down.
  const picture = waterPicture(world, blockInfo);
  if (water[index] > 0) {
    water[index] = 0;
    took = true;
  }
  let want = picture.shown[index];
  let from = picture.source[index];
  while (want > 0 && from >= 0 && from < water.length && water[from] > 0) {
    const take = Math.min(want, water[from]);
    water[from] -= take;
    want -= take;
    took = true;
    from += world.width; // the next cell down
    if (from < water.length && !openSides(world, from % world.width, Math.floor(from / world.width), blockInfo).includes('up')) break;
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
 * How near (in cells of height) a water surface must stand to the
 * height that is squishing an over-full cell, to be drawn with a share
 * of that cell's extra (see waterPicture). A surface right at that
 * height gets a full share, one this far away gets none.
 */
const NEAR = 1;

/**
 * Water in an open cell is FALLING if the cell under it still has space
 * for it. It is all falling when that cell is this far from full or
 * further, and less and less of it counts as falling as that cell fills
 * right up (so the picture never snaps from one look to the other).
 */
const FALL_RANGE = 0.05;

/**
 * Work out how much water to DRAW in every cell, so that water LOOKS
 * as tall as the amount there really is.
 *
 * Why this is needed: in this game deep water is squished (see SQUISH),
 * so ten cells' worth of water in a shaft really sits in about seven
 * and a half cells. Real water doesn't squish: ten buckets stand ten
 * buckets tall. So the picture puts the squished-in extra back on top:
 *
 *   1. Every wet cell is drawn with what it holds, up to full. Water
 *      with room to fall into the cell below is marked as FALLING (a
 *      thin stream from the top of the cell to the bottom, as wide as
 *      there is water), so a waterfall reads as joined-up streams and
 *      a trickle is never drawn as a cell full of water.
 *   2. The EXTRA in an over-full cell is drawn on top of the water that
 *      is squishing it: on its own column, and on the other surfaces of
 *      the same connected water that stand at the height that squishes
 *      it. Still water is level, so every surface of it rises by the
 *      same amount: a tank stays level, and both arms of a U-tube rise
 *      together.
 *   3. Extra is only ever drawn where water could really stand: straight
 *      up from a real water surface, with a wall or more water on both
 *      sides, and never through a lid. A step or ledge beside calm water
 *      counts too: once the drawn level reaches it, water is drawn
 *      standing on it, level with the rest (it is taken from the columns
 *      beside it, so the total stays right). Under a lid (a sealed full tank,
 *      or a full shaft) there is nowhere to draw it, so it isn't drawn:
 *      the tank just looks full.
 *   4. A BRIM works like a lid for all the water joined to it. A brim is
 *      a surface that is as high as it can go: the rim of a full tank,
 *      the open mouth of a pipe. Any higher and the water would run out
 *      there, so no surface of that water is drawn higher than the brim:
 *      a tower joined to a spout is drawn level with the spout. And a
 *      dry basin only counts as somewhere water could stand as high as
 *      its own water could ever fill it.
 *
 * Under a lid and at a brim are the two places where the picture still
 * shows less water than there is.
 *
 * The machines (pipes, wheels, pumps, sand) still only feel the REAL
 * water. `source` says, for a cell that is drawn with more water than
 * it really holds, which real cell that water sits on top of (the top
 * cell of the real water below; DIG and pour use it: see scoop).
 *
 * This only reads the world. It never changes it.
 * @param {object} world - the world
 * @param {Function} blockInfo - looks up what a block name means
 * @param {string[][]} [sides] - open sides by cell index (from allOpenSides), if already worked out
 * @returns {{shown: Float64Array, source: Int32Array, falling: Float64Array}}
 *   `shown`: how much water to draw in each cell (0 to 1). `source`: for
 *   cells drawn with squished-in extra, the index of the real top cell it
 *   sits on; else −1. `falling`: how much of a cell's drawn water is on
 *   its way down (0 = it all lies still, 1 = it is all a falling stream)
 */
export function waterPicture(world, blockInfo, sides = allOpenSides(world, blockInfo)) {
  const { width, height } = world;
  const water = world.fluid.water;
  const size = water.length;
  const shown = new Float64Array(size);
  const source = new Int32Array(size).fill(-1);
  const falling = new Float64Array(size);
  const pump = world.cells.map((name) => Boolean(blockInfo(name)?.fluid?.pump));

  /**
   * Does this cell hold enough water to count as wet?
   * @param {number} index - the cell
   * @returns {boolean} true if it does
   */
  const wet = (index) => water[index] >= MIN_AMOUNT;
  /**
   * The neighbor on one side, if water could stand in both cells as one
   * body: both open on the touching sides, and neither is a pump (a
   * pump holds water back, so the water on its two sides isn't level).
   * @param {number} index - the cell
   * @param {string} side - which side
   * @returns {number} the neighbor's index, or −1
   */
  const joined = (index, side) => {
    const x = index % width + STEP[side][0];
    const y = Math.floor(index / width) + STEP[side][1];
    if (x < 0 || y < 0 || x >= width || y >= height) return -1;
    const next = y * width + x;
    if (pump[index] || pump[next]) return -1;
    return sides[index].includes(side) && sides[next].includes(OPPOSITE[side]) ? next : -1;
  };
  /**
   * How high a cell's floor is, counted in cells from the bottom of the world.
   * @param {number} index - the cell
   * @returns {number} the height of its floor
   */
  const floorOf = (index) => height - 1 - Math.floor(index / width);

  // --- 1. Columns. A column is a stack of wet cells; its TOP cell has the surface.
  const columnOf = new Int32Array(size).fill(-1); // which column each wet cell is in
  const columns = [];
  let anyExtra = false;
  for (let index = 0; index < size; index++) {
    if (!wet(index)) continue;
    if (water[index] > FULL) anyExtra = true;
    shown[index] = Math.min(water[index], FULL);
    // Is it falling? In an open cell, yes, as long as the cell under it has space.
    const below = joined(index, 'down');
    if (below >= 0 && showsWaterLevel(world.cells[index])) falling[index] = clamp((FULL - water[below]) / FALL_RANGE, 0, 1);
    const above = joined(index, 'up');
    if (above >= 0 && wet(above)) {
      columnOf[index] = columnOf[above]; // rows go top to bottom, so the cell above is done
      continue;
    }
    columnOf[index] = columns.length;
    columns.push({ top: index, body: -1, surface: floorOf(index) + shown[index], lid: floorOf(index) + shown[index], room: [] });
  }
  // Nothing is squished (a puddle, a stream, a shallow pond): the plain picture is right.
  if (!anyExtra) return { shown, source, falling };

  // --- 2. Bodies. Wet cells that touch are one body of water.
  const bodyOf = new Int32Array(size).fill(-1);
  let bodies = 0;
  for (let start = 0; start < size; start++) {
    if (!wet(start) || bodyOf[start] >= 0) continue;
    bodyOf[start] = bodies;
    const todo = [start];
    while (todo.length > 0) {
      const index = todo.pop();
      for (const side of SIDES) {
        const next = joined(index, side);
        if (next >= 0 && wet(next) && bodyOf[next] < 0) {
          bodyOf[next] = bodies;
          todo.push(next);
        }
      }
    }
    bodies += 1;
  }
  for (const column of columns) column.body = bodyOf[column.top];
  // How much extra each body has in all. A surface can never be drawn
  // higher than that above where it really is: there isn't the water.
  const extraOf = new Float64Array(bodies);
  for (let index = 0; index < size; index++) {
    if (wet(index) && water[index] > FULL) extraOf[bodyOf[index]] += water[index] - FULL;
  }
  /**
   * The highest a column could possibly be drawn: its real surface plus
   * all the extra of its body. (A shelf goes by the column it is drawn from.)
   * @param {object} column - a column
   * @returns {number} that height, in cells from the bottom of the world
   */
  const reachOf = (column) => {
    const real = column.shelf ? columns[columnOf[column.from]] : column;
    return real.surface + extraOf[real.body];
  };

  // --- 3. Room. Where could each column's surface be drawn higher? Row
  // by row from the bottom: a dry cell has room if it is straight above
  // a surface (or above a cell with room), and every cell beside it in
  // its row, as far as the walls, is wet or has room too. Otherwise the
  // water drawn there would have to spill sideways, so none is drawn.
  //
  // A dry cell with a FLOOR under it (a step in a tank, a ledge, the
  // closed top of a pipe) is no hole: water can stand on it. It counts as
  // room too, as long as the water beside it is calm (no wet cell in its
  // row has more water falling on top of it). Such a cell starts a column
  // of its own with no real water in it (a "shelf"); the water drawn
  // beside it is levelled out over it further down (see 4b).
  //
  // And a column only has room as high as its water could ever be drawn
  // (reachOf). So a puddle at the bottom of a big dry basin does not make
  // the whole basin count as "about to fill up", and water is not drawn
  // standing on the basin's rim with nothing beside it.
  const roomOf = new Int32Array(size).fill(-1); // which column may be drawn up into each dry cell
  const tooHigh = new Uint8Array(size); // dry cells a column would have room in, if only it had the water
  const pools = []; // the stretches where drawn water has to be levelled out over a shelf, bottom row first
  for (let y = height - 1; y >= 0; y--) {
    const maybe = new Int32Array(width).fill(-1);
    const floored = new Array(width).fill(false); // dry, open, and standing on a floor
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      if (wet(index)) continue;
      const below = joined(index, 'down');
      if (below < 0) {
        floored[x] = sides[index].length > 0;
        continue;
      }
      // Above a surface: only once that surface cell itself can be drawn full.
      if (wet(below) && columns[columnOf[below]].top === below) {
        if (columns[columnOf[below]].lid >= floorOf(below) + 1) maybe[x] = columnOf[below];
      }
      else if (roomOf[below] >= 0) maybe[x] = roomOf[below];
      if (maybe[x] >= 0 && reachOf(columns[maybe[x]]) < floorOf(index) - 1e-9) {
        maybe[x] = -1;
        tooHigh[index] = 1;
      }
    }
    // Walk along each stretch of cells that are open to each other sideways.
    let x = 0;
    while (x < width) {
      let end = x;
      let contained = true;
      let shelves = 0;    // dry cells standing on a floor
      let calm = true;    // no wet cell here has more water on top of it
      let standing = false; // is there a surface, or room above one, in this stretch?
      for (;;) {
        const index = y * width + end;
        if (wet(index)) {
          if (columns[columnOf[index]].top === index) standing = true;
          else calm = false;
        } else if (maybe[end] >= 0) standing = true;
        else if (floored[end]) shelves += 1;
        else if (sides[index].length > 0) contained = false;
        if (joined(index, 'right') < 0) break;
        end += 1;
      }
      if (shelves > 0 && !(calm && standing)) contained = false;
      const members = []; // the columns with their surface, or room, in this stretch: {id, at}
      let pooled = false; // does any of them stand on a shelf?
      for (let at = x; at <= end && contained; at++) {
        const index = y * width + at;
        if (maybe[at] >= 0) {
          roomOf[index] = maybe[at];
          columns[maybe[at]].room.push(index);
          columns[maybe[at]].lid = floorOf(index) + 1;
          members.push({ id: maybe[at], at });
          if (columns[maybe[at]].shelf) pooled = true;
        } else if (wet(index) && columns[columnOf[index]].top === index) {
          // A surface cell with walls or water on both sides can be drawn up to full.
          columns[columnOf[index]].lid = Math.max(columns[columnOf[index]].lid, floorOf(index) + 1);
          members.push({ id: columnOf[index], at });
        }
      }
      for (let at = x; at <= end && contained && shelves > 0; at++) {
        if (!floored[at]) continue;
        // A shelf: a column that starts here, on the floor, with no real water.
        // `from` is the real water it will be drawn from: the nearest column's.
        const index = y * width + at;
        const near = members.reduce((best, member) => (Math.abs(member.at - at) < Math.abs(best.at - at) ? member : best));
        const from = columns[near.id].shelf ? columns[near.id].from : columns[near.id].top;
        roomOf[index] = columns.length;
        columns.push({ top: -1, shelf: true, from, body: -1, surface: floorOf(index), lid: floorOf(index) + 1, room: [index] });
        pooled = true;
      }
      if (pooled) {
        const ids = new Set(members.map((member) => member.id));
        for (let at = x; at <= end; at++) if (floored[at]) ids.add(roomOf[y * width + at]);
        pools.push({ floor: floorOf(y * width), ids: [...ids] });
      }
      x = end + 1;
    }
  }

  // --- 3b. Brims. A surface with open air above it that is NOT room
  // (water drawn there would run off sideways) is a brim: the rim of a
  // full tank, the open mouth of a pipe. Still water joined to a brim
  // can't stand higher than the brim anywhere: it would run out there
  // first. So a brim works like a lid for its whole body of water: no
  // column of it is drawn higher than its lowest brim. (That is the other
  // place where the picture shows less water than there is: the extra
  // squished in below a brim has nowhere true to be drawn.)
  //
  // Water that stands HIGHER than the brim is on its way out (a tower
  // emptying through a spout). It is still drawn as tall as it is, but
  // less and less so as it comes down to within NEAR of the brim, so
  // nothing jumps when it gets there.
  const brimOf = new Float64Array(bodies).fill(Infinity);
  for (const column of columns) {
    if (column.shelf) continue;
    const last = column.room.length > 0 ? column.room[column.room.length - 1] : column.top; // its highest cell
    const above = joined(last, 'up');
    if (above >= 0 && !wet(above) && roomOf[above] < 0 && !tooHigh[above]) brimOf[column.body] = Math.min(brimOf[column.body], column.lid);
  }
  for (const column of columns) {
    if (column.shelf || column.lid <= column.surface) continue;
    const brim = brimOf[column.body];
    if (column.surface <= brim) column.lid = Math.min(column.lid, brim);
    else column.lid = column.surface + (column.lid - column.surface) * clamp((column.surface - brim) / NEAR, 0, 1);
  }

  // --- 4. Put the extra back on top. An over-full cell is squished by the
  // water standing over it, and how squished it is says how high that
  // water stands (headOf). Its extra is drawn on its own column, and on
  // every other surface of the same body that stands at about that
  // height: the nearer, the bigger its share. So a puddle far below a
  // tower's surface gets none of the tower's extra.
  const add = new Float64Array(columns.length);
  const byBody = new Map(); // body → the columns with room to be drawn higher
  columns.forEach((column, id) => {
    column.id = id;
    if (column.shelf || column.lid <= column.surface) return; // (a shelf gets its water in 4b)
    if (!byBody.has(column.body)) byBody.set(column.body, []);
    byBody.get(column.body).push(column);
  });
  /**
   * Share some water between the columns of one body that have room.
   * @param {number} body - which body of water
   * @param {number} amount - how much to share out
   * @param {number} level - the surface height this water belongs at
   * @param {number} own - the column it comes from (always gets a full share), or −1
   * @returns {void}
   */
  const share = (body, amount, level, own) => {
    const takers = byBody.get(body) ?? [];
    let weights = 0;
    const weight = takers.map((column) => {
      const part = column.id === own ? 1 : clamp(1 - Math.abs(level - column.surface) / NEAR, 0, 1);
      weights += part;
      return part;
    });
    // With no surface near (water shut in under a lid, or still rushing to
    // find its level) there is nowhere to draw it. A surface that is only
    // just near enough gets only a little, so nothing ever jumps.
    weights = Math.max(weights, 1);
    takers.forEach((column, at) => { add[column.id] += amount * weight[at] / weights; });
  };
  for (let index = 0; index < size; index++) {
    if (wet(index) && water[index] > FULL) {
      share(bodyOf[index], water[index] - FULL, floorOf(index) + headOf(water[index]), columnOf[index]);
    }
  }
  // A column can't be drawn past its lid. What doesn't fit is offered to
  // the other columns standing level with it (a few rounds are plenty).
  const real = columns.map((column) => column.surface);
  for (let round = 0; round < 4; round++) {
    const spill = [];
    columns.forEach((column, id) => {
      const fits = Math.min(add[id], column.lid - column.surface);
      column.surface += fits;
      if (add[id] - fits > 1e-12) spill.push([id, add[id] - fits]);
      add[id] = 0;
    });
    if (spill.length === 0) break;
    for (const [body, takers] of byBody) byBody.set(body, takers.filter((column) => column.lid > column.surface));
    const before = columns.map((column) => column.surface);
    columns.forEach((column, id) => { column.surface = real[id]; }); // share by the REAL surfaces
    for (const [id, amount] of spill) share(columns[id].body, amount, real[id], -1);
    columns.forEach((column, id) => { column.surface = before[id]; });
  }

  // --- 4b. Level the drawn water out over the shelves. In every stretch
  // with a shelf in it (bottom row first), the water drawn ABOVE that
  // row's floor is shared out again so it stands level: over the shelf
  // too, and lowest places first. Only drawn extra is moved: no column is
  // ever drawn lower than its real water.
  for (const pool of pools) {
    const members = pool.ids.map((id) => {
      const column = columns[id];
      const base = Math.min(column.surface, Math.max(pool.floor, real[id]));
      return { column, base };
    });
    const amount = members.reduce((sum, { column, base }) => sum + column.surface - base, 0);
    if (amount <= 1e-12) continue;
    const level = levelFor(members.map(({ column, base }) => ({ base, lid: column.lid })), amount);
    for (const { column, base } of members) column.surface = clamp(level, base, column.lid);
  }

  // --- 5. Draw each column up to its new surface.
  for (const column of columns) {
    if (column.shelf) {
      for (const index of column.room) {
        shown[index] = clamp(column.surface - floorOf(index), 0, FULL);
        if (shown[index] > 0) source[index] = column.from;
      }
      continue;
    }
    const raised = clamp(column.surface - floorOf(column.top), shown[column.top], FULL);
    if (raised > shown[column.top]) source[column.top] = column.top;
    shown[column.top] = raised;
    for (const index of column.room) {
      shown[index] = clamp(column.surface - floorOf(index), 0, FULL);
      if (shown[index] > 0) source[index] = column.top;
    }
  }
  return { shown, source, falling };
}

/**
 * How high does some water stand when it is poured into a row of tubes
 * that are joined together? Each tube has a `base` (where its own room
 * starts) and a `lid` (where it ends). The water fills the lowest tubes
 * first and ends up level.
 * @param {Array<{base: number, lid: number}>} tubes - the tubes
 * @param {number} amount - how much water (1 = one cell of one tube)
 * @returns {number} the height of the level surface
 */
function levelFor(tubes, amount) {
  const marks = [...new Set(tubes.flatMap((tube) => [tube.base, tube.lid]))].sort((a, b) => a - b);
  let left = amount;
  for (let k = 0; k + 1 < marks.length; k++) {
    const low = marks[k];
    const high = marks[k + 1];
    const wide = tubes.filter((tube) => tube.base <= low && tube.lid >= high).length; // how many tubes are open at this height
    if (left <= wide * (high - low)) return wide > 0 ? low + left / wide : low;
    left -= wide * (high - low);
  }
  return marks[marks.length - 1] ?? 0; // more water than room: full to the top
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
 * The ENERGY each move gives up is worked out at the end of the step,
 * once we know everything that left and entered each cell. Each cell's
 * energy change is shared out between its moves by how much water each
 * one carried, so streams that meet in one cell are never counted for
 * more than the water really gave up, and left and right get the same.
 *
 * @param {object} world - the world
 * @param {'water'|'steam'} kind - which fluid
 * @param {Function} canFlow - from flowChecker
 * @param {Function} onMove - told (fromIndex, toIndex, amount, energy, drop, part)
 *   for every move: `energy` is how much the fluid gave up by moving (see
 *   fallEnergy), `drop` is how many cells lower it ended up (1 falling,
 *   0 sideways, −1 rising; for steam it is the other way up: 1 is a
 *   move UP), and `part` is how much of the cell's fluid this move took
 *   (0 to 1)
 * @returns {number} the total amount that moved
 */
export function flowFluid(world, kind, canFlow, onMove) {
  const before = world.fluid[kind];
  const after = Float64Array.from(before);
  const water = world.fluid.water;
  const fall = kind === 'water' ? 'down' : 'up';
  const rise = OPPOSITE[fall];
  let moved = 0;
  const moves = [];
  const left = new Map();    // how much left each cell this step
  const entered = new Map(); // how much entered each cell this step

  /**
   * Move some fluid from one cell to another.
   * @param {number} from - the cell it leaves
   * @param {number} to - the cell it goes to
   * @param {number} amount - how much
   * @param {number} drop - how many cells lower it ends up (1 falling, 0 sideways, −1 rising)
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
  const roomFor = (to) => kind !== 'steam' || water[to] <= 0.5;

  for (let index = 0; index < before.length; index++) {
    let remaining = before[index];
    if (remaining <= 0) continue;

    const below = canFlow(index, fall); // for steam, this is the cell ABOVE
    if (below >= 0) {
      const flow = clamp(stableBelow(remaining + before[below]) - before[below], 0, Math.min(MAX_FLOW, remaining));
      move(index, below, flow, 1);
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
      move(index, beside, flow, 0);
      remaining -= flow;
    }
    if (remaining <= 0) continue;

    const above = canFlow(index, rise);
    if (above >= 0 && roomFor(above)) {
      const flow = clamp(remaining - stableBelow(remaining + before[above]), 0, Math.min(MAX_FLOW, remaining));
      move(index, above, flow, -1);
    }
  }

  for (const { from, to, amount, drop } of moves) {
    // This move's share of what its two cells' fluid lost: the cell it
    // left (by all that left it) and the cell it entered (by all that entered).
    // (Steam is worked out just like water, upside down: see RISE_POWER.)
    const gone = left.get(from);
    const came = entered.get(to);
    const energy = amount * drop
      + (storedEnergy(before[from]) - storedEnergy(before[from] - gone)) * (amount / gone)
      + (storedEnergy(before[to]) - storedEnergy(before[to] + came)) * (amount / came);
    onMove(from, to, amount, energy, drop, Math.min(1, amount / before[from]));
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
 * crank (see WHEEL_STRENGTH in gears.js). Both the wheel and the pump use
 * this same number: that's what keeps the energy books honest.
 */
export const DROP_POWER = 10;

/**
 * How much turning-work the energy of RISING steam is worth: the same as
 * falling water (DROP_POWER). Steam is water going the other way: low
 * steam, and squished steam, holds energy the way high water does, and
 * gives it up by rising (see storedEnergy and fallEnergy, which work for
 * steam with "down" meaning up). So one burner's steam (0.05 a tick)
 * rising one cell through a turbine is as good as one faucet's water
 * falling one cell through a water wheel.
 */
export const RISE_POWER = DROP_POWER;

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
 * Let the special blocks do their jobs: faucets add water, burners boil
 * water into steam, chillers turn steam back into water, powered pumps
 * push water from behind them to in front, and drains take water away.
 *
 * They go in three rounds, so that it never matters which block comes
 * first in the world (a machine built the other way round, mirrored,
 * works just the same):
 *   1. faucets, burners and chillers
 *   2. pumps (each one looks at the water as it was when the round began)
 *   3. drains, last of all: whatever ended up in a drain this tick is gone
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
  const pumps = [];
  const drains = [];
  // Round 1: faucets, burners and chillers.
  for (let index = 0; index < world.cells.length; index++) {
    const info = blockInfo(world.cells[index]);
    if (!info) continue;
    if (info.fluid?.pump) pumps.push(index);
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
        const cool = Math.min(CONDENSE_RATE, steam[next]);
        steam[next] -= cool;
        water[next] += cool;
        changed += cool;
        if (chilled && cool > 0) chilled.set(next, (chilled.get(next) ?? 0) + cool);
      }
    }
  }
  // Round 2: pumps. Each works out its push from the water as it is now,
  // before any pump has moved any.
  const start = Float64Array.from(water);
  for (const index of pumps) {
    const front = blockInfo(world.cells[index]).fluid.pump;
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
    const push = Math.min(pumpAmount(level, start[back], start[ahead], rise), water[back]);
    water[back] -= push;
    water[ahead] += push;
    changed += push;
  }
  // Round 3: drains.
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
 * steps), then the special blocks do their jobs once.
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
 * @returns {{moved: number, turbines: Map<number, object>, waterOut: Map<number, number>, waterWork: Map<number, number>, wheels: Map<number, object>, sides: string[][]}}
 *   how much changed in total, each turbine's count ({out, gross, work,
 *   into, inWay}: the steam that left it (or was chilled inside it), + up
 *   or right and − down or left; all the steam that left it; the energy
 *   the steam gave up there; all the steam that came into it; and the
 *   steam that came into it, + going up or right and − down or left), the
 *   turning flow of each water wheel (see wheelTurn), how much energy the
 *   water gave up at each water wheel, each wheel's full count
 *   ({lean, sideOut, down, gross, work}), and every cell's open sides
 */
export function stepFluids(world, blockInfo) {
  const sides = allOpenSides(world, blockInfo);
  const canFlow = flowChecker(world, sides, blockInfo);
  const size = world.cells.length;
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
   * @returns {void}
   */
  const countWheels = (from, to, amount, energy, drop, part) => {
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
  for (let step = 0; step < FLUID_STEPS; step++) {
    moved += flowFluid(world, 'water', canFlow, countWheels);
    // Water that stayed behind in a column that is still falling keeps its
    // share of the push. Water that has stopped falling has splashed it away.
    for (let index = 0; index < size; index++) {
      if (fellFrom[index] && falling[index] > 0) next[index] += falling[index] * Math.max(0, 1 - taken[index]);
    }
    falling = next;
    next = new Float64Array(size);
    fellFrom = new Uint8Array(size);
    taken = new Float64Array(size);
    moved += flowFluid(world, 'steam', canFlow, countTurbines);
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
  return { moved, turbines, waterOut, waterWork, wheels, sides };
}
