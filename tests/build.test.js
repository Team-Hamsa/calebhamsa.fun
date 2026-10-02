/**
 * build.test.js — checks the Build page's pure helpers: how big the
 * blocks are drawn, and what BUILD and DIG do to the world.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AIR, createWorld, getBlock, setBlock } from '../js/world.js';
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
