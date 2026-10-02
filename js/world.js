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
 * @param {number} width - how many blocks across
 * @param {number} height - how many blocks down
 * @returns {{width: number, height: number, cells: string[]}} the world
 */
export function createWorld(width, height) {
  return { width, height, cells: new Array(width * height).fill(AIR) };
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
 * @param {{width: number, height: number, cells: string[]}} world - the world
 * @param {number} x - column, 0 = left
 * @param {number} y - row, 0 = top
 * @param {string} name - the block to put there ('air' to empty it)
 * @returns {boolean} true if the cell really changed
 */
export function setBlock(world, x, y, name) {
  if (!inBounds(world, x, y)) return false;
  const index = y * world.width + x;
  if (world.cells[index] === name) return false;
  world.cells[index] = name;
  return true;
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
 * One tick of the world's clock: let every "system" (a rule like "sand
 * falls") have a turn, in order. Each system changes the world and says
 * true if it changed anything.
 * @param {{width: number, height: number, cells: string[]}} world - the world
 * @param {Function[]} systems - (world, blockInfo) => boolean, run in this order
 * @param {Function} blockInfo - looks up what a block name means
 * @returns {boolean} true if any system changed the world
 */
export function tick(world, systems, blockInfo) {
  let changed = false;
  for (const system of systems) {
    // Run the system FIRST, so a change from an earlier one never skips it.
    changed = system(world, blockInfo) || changed;
  }
  return changed;
}
