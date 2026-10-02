/**
 * world.test.js — checks the block world: the grid every Build-page
 * block lives in.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AIR, EDGE, WORLD_HEIGHT, WORLD_WIDTH, createWorld, defaultWorld, getBlock,
  inBounds, neighbors, setBlock, tick,
} from '../js/world.js';

test('a new world is all air', () => {
  const world = createWorld(3, 2);
  assert.equal(world.width, 3);
  assert.equal(world.height, 2);
  assert.deepEqual(world.cells, [AIR, AIR, AIR, AIR, AIR, AIR]);
});

test('setBlock puts a block where getBlock finds it, counting y from the top', () => {
  const world = createWorld(3, 2);
  assert.equal(setBlock(world, 2, 1, 'gold'), true);
  assert.equal(getBlock(world, 2, 1), 'gold');
  assert.equal(world.cells[1 * 3 + 2], 'gold');
});

test('setBlock says false when nothing changed', () => {
  const world = createWorld(3, 2);
  setBlock(world, 0, 0, 'dirt');
  assert.equal(setBlock(world, 0, 0, 'dirt'), false);
});

test('outside the world reads as solid stone, and writing there does nothing', () => {
  const world = createWorld(3, 2);
  assert.equal(getBlock(world, -1, 0), EDGE);
  assert.equal(getBlock(world, 0, 2), EDGE);
  assert.equal(setBlock(world, 3, 0, 'gold'), false);
  assert.equal(setBlock(world, 1.5, 0, 'gold'), false);
  assert.ok(world.cells.every((name) => name === AIR));
});

test('inBounds only accepts whole numbers inside the grid', () => {
  const world = createWorld(3, 2);
  assert.equal(inBounds(world, 0, 0), true);
  assert.equal(inBounds(world, 2, 1), true);
  assert.equal(inBounds(world, 3, 1), false);
  assert.equal(inBounds(world, 0, -1), false);
  assert.equal(inBounds(world, 0.5, 0), false);
});

test('neighbors: up, right, down, left, skipping the outside', () => {
  const world = createWorld(3, 3);
  assert.deepEqual(neighbors(world, 1, 1), [{ x: 1, y: 0 }, { x: 2, y: 1 }, { x: 1, y: 2 }, { x: 0, y: 1 }]);
  assert.deepEqual(neighbors(world, 0, 0), [{ x: 1, y: 0 }, { x: 0, y: 1 }]);
});

test('the default world: sky, then one grass row, one dirt row, and stone to the bottom', () => {
  const world = defaultWorld();
  assert.equal(world.width, WORLD_WIDTH);
  assert.equal(world.height, WORLD_HEIGHT);
  for (let x = 0; x < WORLD_WIDTH; x++) {
    assert.equal(getBlock(world, x, 9), AIR);
    assert.equal(getBlock(world, x, 10), 'grass');
    assert.equal(getBlock(world, x, 11), 'dirt');
    assert.equal(getBlock(world, x, 12), 'stone');
    assert.equal(getBlock(world, x, 13), 'stone');
  }
});

test('tick runs every system in order and says whether anything changed', () => {
  const world = createWorld(2, 2);
  const order = [];
  const quiet = () => { order.push('quiet'); return false; };
  const busy = () => { order.push('busy'); return true; };
  assert.equal(tick(world, [busy, quiet], () => undefined), true);
  assert.deepEqual(order, ['busy', 'quiet']); // quiet still ran after busy changed things
  assert.equal(tick(world, [quiet], () => undefined), false);
});

test('tick hands each system the world and the block lookup', () => {
  const world = createWorld(2, 2);
  const lookup = () => ({ falls: true });
  let seen = null;
  tick(world, [(w, info) => { seen = [w, info]; return false; }], lookup);
  assert.equal(seen[0], world);
  assert.equal(seen[1], lookup);
});

test('a new world starts its clock at 0, with no signals or events yet', () => {
  const world = createWorld(2, 2);
  assert.equal(world.ticks, 0);
  assert.deepEqual(world.signals, {});
  assert.deepEqual(world.events, []);
  assert.equal(world.animating, false);
  assert.equal(defaultWorld().ticks, 0);
});

test('every tick counts up the clock, before the systems run', () => {
  const world = createWorld(2, 2);
  let seenTicks = null;
  tick(world, [(w) => { seenTicks = w.ticks; return false; }], () => undefined);
  assert.equal(seenTicks, 1);
  tick(world, [], () => undefined);
  assert.equal(world.ticks, 2);
});
