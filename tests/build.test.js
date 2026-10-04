/**
 * build.test.js — checks the Build page's pure helpers: how big the
 * blocks are drawn, and what BUILD and DIG do to the world.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AIR, createWorld, getBlock, setBlock, setFluid, tick } from '../js/world.js';
import { allSystems, blockInfo } from '../js/blocks/registry.js';
import { applyTool, fitCellSize, saveDelay } from '../js/build.js';

test('blocks are as big as fits, and always square', () => {
  assert.equal(fitCellSize(960, 560, 24, 14), 40);  // fits exactly
  assert.equal(fitCellSize(2000, 560, 24, 14), 40); // a very wide box: the height decides
  assert.equal(fitCellSize(480, 2000, 24, 14), 20); // a tall box (iPad portrait): the width decides
  assert.equal(fitCellSize(500, 300, 24, 14), 20);  // rounds down to whole pixels: 20.8 → 20
});

test('even a tiny box gets 1-pixel blocks instead of 0 or a crash', () => {
  assert.equal(fitCellSize(0, 0, 24, 14), 1);
  assert.equal(fitCellSize(-12, 5, 24, 14), 1);
});

test('BUILD puts the chosen block down, even on top of another block', () => {
  const world = createWorld(3, 3);
  assert.equal(applyTool(world, 'build', 1, 1, 'gold'), true);
  assert.equal(getBlock(world, 1, 1), 'gold');
  assert.equal(applyTool(world, 'build', 1, 1, 'stone'), true); // swaps it
  assert.equal(getBlock(world, 1, 1), 'stone');
  assert.equal(applyTool(world, 'build', 1, 1, 'stone'), false); // already stone
});

test('DIG empties a cell', () => {
  const world = createWorld(3, 3);
  setBlock(world, 0, 2, 'dirt');
  assert.equal(applyTool(world, 'dig', 0, 2, 'gold'), true);
  assert.equal(getBlock(world, 0, 2), AIR);
  assert.equal(applyTool(world, 'dig', 0, 2, 'gold'), false);
});

test('USE never changes the world by itself, and nothing happens off the edge', () => {
  const world = createWorld(3, 3);
  assert.equal(applyTool(world, 'use', 1, 1, 'gold'), false);
  assert.equal(applyTool(world, 'build', 5, 1, 'gold'), false);
  assert.equal(applyTool(world, 'build', -1, 0, 'gold'), false);
  assert.ok(world.cells.every((name) => name === AIR));
});

test('saving waits 1 second after a change, but never more than 5 seconds after the first one', () => {
  assert.equal(saveDelay(1000, 1000), 1000);  // just changed
  assert.equal(saveDelay(4500, 1000), 1000);  // 3.5 s in: still the normal wait
  assert.equal(saveDelay(5500, 1000), 500);   // 4.5 s in: only half a second left
  assert.equal(saveDelay(9000, 1000), 0);     // past 5 s: save now
});

test('BUILD with water pours it; DIG scoops it out', () => {
  const world = createWorld(2, 1);
  assert.equal(applyTool(world, 'build', 0, 0, 'water'), true);
  assert.equal(world.cells[0], AIR);       // pouring never places a block
  assert.equal(world.fluid.water[0], 1);
  assert.equal(applyTool(world, 'build', 0, 0, 'water'), false); // already full
  assert.equal(applyTool(world, 'dig', 0, 0, 'gold'), true);
  assert.equal(world.fluid.water[0], 0);
});

test('you cannot pour water into a solid block', () => {
  const world = createWorld(1, 1);
  setBlock(world, 0, 0, 'stone');
  assert.equal(applyTool(world, 'build', 0, 0, 'water'), false);
  assert.equal(world.fluid.water[0], 0);
});

/**
 * Make a world from a picture: `#` stone, `.` air, `~` air full of water, `P` pipe.
 * @param {string[]} rows - the picture
 * @returns {object} the world
 */
function wetWorld(rows) {
  const world = createWorld(rows[0].length, rows.length);
  rows.forEach((row, y) => [...row].forEach((letter, x) => {
    setBlock(world, x, y, { '#': 'stone', P: 'pipe' }[letter] ?? AIR);
    if (letter === '~') setFluid(world, 'water', x, y, 1);
  }));
  return world;
}

/**
 * All the water in a world.
 * @param {object} world - the world
 * @returns {number} the total amount
 */
const allWater = (world) => world.fluid.water.reduce((sum, amount) => sum + amount, 0);

test('a rock built into a tank of water pushes the water up: the level RISES and none is lost', () => {
  const tank = wetWorld(['#...#', '#~~~#', '#~~~#', '#####']);
  assert.equal(applyTool(tank, 'build', 2, 2, 'stone'), true);
  assert.equal(tank.fluid.water[2 * 5 + 2], 0); // no water inside the rock
  assert.ok(Math.abs(allWater(tank) - 6) < 1e-9, `water went from 6 to ${allWater(tank)}`);
  const systems = allSystems();
  for (let i = 0; i < 100; i++) tick(tank, systems, blockInfo);
  assert.ok(Math.abs(allWater(tank) - 6) < 1e-9);
  // 6 cells of water, with only 5 cells of room in the bottom two rows: the top row is wet now.
  const topRow = tank.fluid.water[1] + tank.fluid.water[2] + tank.fluid.water[3];
  assert.ok(topRow > 0.5, `only ${topRow} rose above the old level`);
});

test('a block that carries water (pipe, valve, water wheel, pump, turbine, rope) keeps the water when built into it', () => {
  for (const name of ['pipe', 'valveOpen', 'waterWheel', 'pumpRight', 'turbine', 'rope']) {
    const tank = wetWorld(['#...#', '#~~~#', '#~~~#', '#####']);
    setFluid(tank, 'water', 1, 2, 1.09); // squished, like at the bottom of a tank
    assert.equal(applyTool(tank, 'build', 1, 2, name), true);
    assert.equal(tank.fluid.water[2 * 5 + 1], 1.09, `${name} lost its water`);
  }
});

test('with no room above, a built block pushes the water out sideways, the same to both sides', () => {
  const world = wetWorld(['#####', '#.~.#', '#####']);
  applyTool(world, 'build', 2, 1, 'stone');
  assert.equal(world.fluid.water[1 * 5 + 1], 0.5);
  assert.equal(world.fluid.water[1 * 5 + 3], 0.5);
  const oneWay = wetWorld(['#####', '##~.#', '#####']);
  applyTool(oneWay, 'build', 2, 1, 'sand');
  assert.equal(oneWay.fluid.water[1 * 5 + 3], 1);
});

test('with no room above or beside, the water is pushed down; shut in on every side, it is lost', () => {
  const world = wetWorld(['###', '#~#', '#.#', '###']);
  applyTool(world, 'build', 1, 1, 'stone');
  assert.equal(world.fluid.water[2 * 3 + 1], 1);
  const sealed = wetWorld(['###', '#~#', '###']);
  applyTool(sealed, 'build', 1, 1, 'stone');
  assert.equal(allWater(sealed), 0);
});

test('water is only pushed into a pipe through a side the pipe is open on', () => {
  // The pipe above runs left-right (it joins the pipe beside it), so its bottom is sealed.
  const world = wetWorld(['#PP#', '#~.#', '####']);
  applyTool(world, 'build', 1, 1, 'stone');
  assert.equal(world.fluid.water[0 * 4 + 1], 0);
  assert.equal(world.fluid.water[1 * 4 + 2], 1);
});

test('steam is pushed out of the way too', () => {
  const world = wetWorld(['#.#', '#.#', '###']);
  setFluid(world, 'steam', 1, 1, 0.8);
  applyTool(world, 'build', 1, 1, 'stone');
  assert.equal(world.fluid.steam[0 * 3 + 1], 0.8);
});
