/**
 * world.js — the block world: a grid of block names.
 *
 * The world is a big list of names like 'grass', 'sand' or 'air'
 * (empty). Row 0 is the TOP (the sky); the last row is the bottom.
 *
 *        x →  0     1     2   ...
 *   y  0   [air] [air] [air]
 *   ↓  1   [air] [sand][air]
 *      2   [grass][grass][grass]
 *
 * This file doesn't know what any block DOES. That lives in the block
 * packs (js/blocks/). So adding new kinds of blocks never changes this file.
 */

/** The name of an empty cell. */
export const AIR = 'air';

/** The two kinds of fluid a cell can hold (amounts, not blocks: see world.fluid). */
export const FLUIDS = ['water', 'steam'];

/** What the outside of the world counts as: solid, so sand lands on the floor. */
export const EDGE = 'stone';

/**
 * How many blocks wide and tall the world is.
 * 🧪 Try this! 32 × 18 for smaller blocks and more room (old saves still load).
 */
export const WORLD_WIDTH = 24;
export const WORLD_HEIGHT = 14;

/**
 * How many rows of ground a new world starts with: grass, dirt, then stone.
 * 🧪 Try this! 8 for a deep underground to dig into.
 */
export const GROUND_DEPTH = 4;

/**
 * Make an empty world: every cell is air.
 *
 * Besides the blocks, a world carries a few things that are NOT saved:
 *   ticks      how many times the clock has ticked (clickers keep time with it)
 *   signals    what the systems worked out, for drawing (like current in wires)
 *   events     things for the page to do, like { type: 'note', midi: 64, x, y }
 *   animating  set by systems when the picture moves even though no block did
 *
 * And one more thing that IS saved:
 *   fluid      how much water and steam each cell holds: 0 = empty,
 *              1 = full. Water never holds more than 1 (it can't be
 *              squashed); steam squeezed in under a lid can hold a little more
 *
 * @param {number} width - how many blocks across
 * @param {number} height - how many blocks down
 * @returns {object} the world
 */
export function createWorld(width, height) {
  return {
    width,
    height,
    cells: new Array(width * height).fill(AIR),
    ticks: 0,
    signals: {},
    events: [],
    animating: false,
    fluid: { water: new Float64Array(width * height), steam: new Float64Array(width * height) },
  };
}

/**
 * Make the world Caleb starts with: sky on top, then a row of grass,
 * a row of dirt, and stone down to the bottom.
 * @param {number} [width] - how many blocks across
 * @param {number} [height] - how many blocks down
 * @returns {{width: number, height: number, cells: string[]}} the world
 */
export function defaultWorld(width = WORLD_WIDTH, height = WORLD_HEIGHT) {
  const world = createWorld(width, height);
  const grassRow = height - GROUND_DEPTH;
  for (let x = 0; x < width; x++) {
    setBlock(world, x, grassRow, 'grass');
    setBlock(world, x, grassRow + 1, 'dirt');
    for (let y = grassRow + 2; y < height; y++) setBlock(world, x, y, 'stone');
  }
  return world;
}

/**
 * Is this spot inside the world? (Whole numbers only: no half-blocks.)
 * @param {{width: number, height: number}} world - the world
 * @param {number} x - column, 0 = left
 * @param {number} y - row, 0 = top
 * @returns {boolean} true if it's a real cell
 */
export function inBounds(world, x, y) {
  return Number.isInteger(x) && Number.isInteger(y)
    && x >= 0 && y >= 0 && x < world.width && y < world.height;
}

/**
 * What block is at this spot? Outside the world counts as EDGE (stone),
 * so the walls and floor act solid.
 * @param {{width: number, height: number, cells: string[]}} world - the world
 * @param {number} x - column, 0 = left
 * @param {number} y - row, 0 = top
 * @returns {string} the block's name
 */
export function getBlock(world, x, y) {
  return inBounds(world, x, y) ? world.cells[y * world.width + x] : EDGE;
}

/**
 * Put a block at this spot. Outside the world, nothing happens.
 * Any water or steam in the cell is emptied out. This is the plain
 * helper for making worlds (loading a save, tests, DIG). BUILD doesn't
 * use it: it uses placeBlock in fluids.js, which pushes the water out
 * of the way instead. To flip a block without spilling, use swapBlock.
 * @param {{width: number, height: number, cells: string[]}} world - the world
 * @param {number} x - column, 0 = left
 * @param {number} y - row, 0 = top
 * @param {string} name - the block to put there ('air' to empty it)
 * @returns {boolean} true if the cell really changed
 */
export function setBlock(world, x, y, name) {
  if (!swapBlock(world, x, y, name)) return false;
  clearFluid(world, x, y);
  return true;
}

/**
 * Change a block but keep the water or steam inside it. ✋ uses this to
 * flip valves, burners and pumps, which shouldn't spill their water.
 * @param {{width: number, height: number, cells: string[]}} world - the world
 * @param {number} x - column, 0 = left
 * @param {number} y - row, 0 = top
 * @param {string} name - the new block
 * @returns {boolean} true if the cell really changed
 */
export function swapBlock(world, x, y, name) {
  if (!inBounds(world, x, y)) return false;
  const index = y * world.width + x;
  if (world.cells[index] === name) return false;
  world.cells[index] = name;
  return true;
}

/**
 * Move a block into an empty (air) cell, and move that cell's water and
 * steam back into the cell the block left. That's how sand sinks
 * through water: the sand and the water trade places, so no water is lost.
 * (Moving the fluid is not free: a load on a winch's rope pays for it,
 * and a loose block only sinks if it is heavy enough. See inTheWay and
 * floatsOn in js/blocks/lifting.js.)
 *
 * A block that water flows THROUGH (a pulley hook) pushes nothing out of
 * its way: say `through` and the water and steam stay just where they are.
 * @param {object} world - the world
 * @param {number} fromX - where the block is
 * @param {number} fromY - where the block is
 * @param {number} toX - the air cell it moves into
 * @param {number} toY - the air cell it moves into
 * @param {boolean} [through] - true for a block that fluid flows through:
 *   the fluid in both cells stays put
 * @returns {boolean} true if it moved
 */
export function moveBlock(world, fromX, fromY, toX, toY, through = false) {
  if (!inBounds(world, fromX, fromY) || !inBounds(world, toX, toY)) return false;
  const from = fromY * world.width + fromX;
  const to = toY * world.width + toX;
  if (world.cells[to] !== AIR || world.cells[from] === AIR) return false;
  world.cells[to] = world.cells[from];
  world.cells[from] = AIR;
  if (through) return true;
  for (const kind of FLUIDS) {
    world.fluid[kind][from] = world.fluid[kind][to];
    world.fluid[kind][to] = 0;
  }
  return true;
}

/**
 * How much water (or steam) is in a cell. Outside the world there's none.
 * @param {object} world - the world
 * @param {'water'|'steam'} kind - which fluid
 * @param {number} x - column
 * @param {number} y - row
 * @returns {number} the amount (1 = a full cell)
 */
export function getFluid(world, kind, x, y) {
  return inBounds(world, x, y) ? world.fluid[kind][y * world.width + x] : 0;
}

/**
 * Set how much water (or steam) is in a cell. Outside the world, nothing happens.
 * @param {object} world - the world
 * @param {'water'|'steam'} kind - which fluid
 * @param {number} x - column
 * @param {number} y - row
 * @param {number} amount - the new amount (never below 0)
 * @returns {void}
 */
export function setFluid(world, kind, x, y, amount) {
  if (inBounds(world, x, y)) world.fluid[kind][y * world.width + x] = Math.max(0, amount);
}

/**
 * Empty a cell of water and steam.
 * @param {object} world - the world
 * @param {number} x - column
 * @param {number} y - row
 * @returns {boolean} true if there was any fluid to empty
 */
export function clearFluid(world, x, y) {
  if (!inBounds(world, x, y)) return false;
  const index = y * world.width + x;
  let had = false;
  for (const kind of FLUIDS) {
    if (world.fluid[kind][index] > 0) had = true;
    world.fluid[kind][index] = 0;
  }
  return had;
}

/**
 * The cells touching this one (up, right, down, left), skipping any
 * that are outside the world.
 * @param {{width: number, height: number}} world - the world
 * @param {number} x - column
 * @param {number} y - row
 * @returns {Array<{x: number, y: number}>} the touching cells
 */
export function neighbors(world, x, y) {
  return [[0, -1], [1, 0], [0, 1], [-1, 0]]
    .map(([dx, dy]) => ({ x: x + dx, y: y + dy }))
    .filter((spot) => inBounds(world, spot.x, spot.y));
}

/**
 * One tick of the world's clock: count it in world.ticks, then let
 * every "system" (a rule like "sand falls") have a turn, in order. Each
 * system changes the world and says true if it changed any BLOCKS.
 * @param {{width: number, height: number, cells: string[]}} world - the world
 * @param {Function[]} systems - (world, blockInfo) => boolean, run in this order
 * @param {Function} blockInfo - looks up what a block name means
 * @returns {boolean} true if any system changed the world
 */
export function tick(world, systems, blockInfo) {
  world.ticks += 1;
  let changed = false;
  for (const system of systems) {
    // Run the system FIRST, so a change from an earlier one never skips it.
    changed = system(world, blockInfo) || changed;
  }
  return changed;
}
