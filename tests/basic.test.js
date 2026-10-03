/**
 * basic.test.js — checks the ⛏️ basic blocks: sand falls, everything
 * else floats, and note blocks know their notes.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AIR, createWorld, getBlock, setBlock, tick } from '../js/world.js';
import basic, { NOTE_BLOCKS, fallingBlocks } from '../js/blocks/basic.js';
import { blockInfo } from '../js/blocks/registry.js';

/**
 * Run the falling rule once.
 * @param {object} world - the world
 * @returns {boolean} whether anything moved
 */
const fall = (world) => tick(world, [fallingBlocks], blockInfo);

test('sand falls one block per tick until it hits the floor', () => {
  const world = createWorld(3, 4);
  setBlock(world, 1, 0, 'sand');
  assert.equal(fall(world), true);
  assert.equal(getBlock(world, 1, 0), AIR);
  assert.equal(getBlock(world, 1, 1), 'sand');
  fall(world);
  fall(world);
  assert.equal(getBlock(world, 1, 3), 'sand'); // the bottom row
  assert.equal(fall(world), false);           // the floor holds it
  assert.equal(getBlock(world, 1, 3), 'sand');
});

test('sand lands on top of other blocks', () => {
  const world = createWorld(3, 4);
  setBlock(world, 1, 2, 'stone');
  setBlock(world, 1, 0, 'sand');
  fall(world);
  assert.equal(fall(world), false);
  assert.equal(getBlock(world, 1, 1), 'sand');
  assert.equal(getBlock(world, 1, 2), 'stone');
});

test('a tower of sand falls together, never through itself', () => {
  const world = createWorld(1, 4);
  setBlock(world, 0, 0, 'sand');
  setBlock(world, 0, 1, 'sand');
  fall(world);
  assert.deepEqual(world.cells, [AIR, 'sand', 'sand', AIR]);
  fall(world);
  assert.deepEqual(world.cells, [AIR, AIR, 'sand', 'sand']);
});

test('sand can land on sand', () => {
  const world = createWorld(1, 3);
  setBlock(world, 0, 2, 'sand');
  setBlock(world, 0, 0, 'sand');
  fall(world);
  assert.deepEqual(world.cells, [AIR, 'sand', 'sand']);
  assert.equal(fall(world), false);
});

test('other blocks float in the air, like in the game', () => {
  const world = createWorld(2, 3);
  for (const name of ['grass', 'stone', 'gold', 'glass', 'noteC']) {
    setBlock(world, 0, 0, name);
    assert.equal(fall(world), false, name);
    assert.equal(getBlock(world, 0, 0), name);
  }
});

test('note blocks play C D E F G A B, starting at middle C', () => {
  assert.deepEqual(NOTE_BLOCKS.map((note) => note.label), ['C', 'D', 'E', 'F', 'G', 'A', 'B']);
  assert.deepEqual(NOTE_BLOCKS.map((note) => note.midi), [60, 62, 64, 65, 67, 69, 71]);
});

test('using a note block plays its note and lights it up', () => {
  const played = [];
  let flashed = 0;
  const ctx = { world: createWorld(1, 1), x: 0, y: 0, playNote: (midi) => played.push(midi), flash: () => { flashed += 1; } };
  basic.blocks.noteG.use(ctx);
  assert.deepEqual(played, [67]);
  assert.equal(flashed, 1);
});

test('the basic pack has its tab, its blocks in palette order, and the falling rule', () => {
  assert.deepEqual(basic.tab, { id: 'basic', icon: '⛏️', label: 'Blocks' });
  assert.deepEqual(Object.keys(basic.blocks), [
    'grass', 'dirt', 'stone', 'wood', 'glass', 'obsidian', 'gold', 'sand',
    'noteC', 'noteD', 'noteE', 'noteF', 'noteG', 'noteA', 'noteB',
  ]);
  assert.deepEqual(basic.systems, [fallingBlocks]);
});

test('note blocks are electric parts, and ✋ on one says the world did not change', () => {
  assert.deepEqual(basic.blocks.noteC.part, { resistance: 1 });
  const ctx = { world: createWorld(1, 1), x: 0, y: 0, playNote() {}, flash() {} };
  assert.equal(basic.blocks.noteC.use(ctx), false);
});

test('gold conducts electricity, like real gold', () => {
  assert.equal(basic.blocks.gold.conducts, true);
});

test('a crate hanging on a rope doesn\'t fall, and nor does sand stuck under it', () => {
  const world = createWorld(2, 5);
  setBlock(world, 0, 0, 'rope');
  setBlock(world, 0, 1, 'crate');
  setBlock(world, 0, 2, 'sand');
  setBlock(world, 1, 1, 'crate'); // next to the rope, not under it: it falls
  for (let i = 0; i < 3; i++) fall(world);
  assert.equal(getBlock(world, 0, 1), 'crate');
  assert.equal(getBlock(world, 0, 2), 'sand');
  assert.equal(getBlock(world, 1, 4), 'crate');
});
