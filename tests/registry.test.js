/**
 * registry.test.js — checks the list of block packs: every block has
 * what the Build page needs, and no two packs use the same block name.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AIR } from '../js/world.js';
import { fallingBlocks } from '../js/blocks/basic.js';
import {
  AIR_INFO, PACKS, SIGNALS, allSystems, blockInfo, blocksInPack, isKnownBlock,
} from '../js/blocks/registry.js';

const HEX = /^#[0-9a-f]{6}$/i;

test('no two packs use the same block name (and none is called "air")', () => {
  const names = PACKS.flatMap((pack) => Object.keys(pack.blocks));
  assert.equal(new Set(names).size, names.length);
  assert.ok(!names.includes(AIR));
});

test('every pack has a tab with an id, an icon and a label', () => {
  for (const pack of PACKS) {
    assert.ok(pack.tab.id && pack.tab.icon && pack.tab.label, JSON.stringify(pack.tab));
    assert.ok(Array.isArray(pack.systems), pack.tab.id);
  }
});

test('every block has a title and #rrggbb colors', () => {
  for (const pack of PACKS) {
    for (const [name, block] of Object.entries(pack.blocks)) {
      assert.ok(block.title, name);
      assert.match(block.color, HEX, name);
      if (block.topColor) assert.match(block.topColor, HEX, name);
    }
  }
});

test('blockInfo finds a block, tells you its name and pack, and knows air', () => {
  const sand = blockInfo('sand');
  assert.equal(sand.name, 'sand');
  assert.equal(sand.pack, 'basic');
  assert.equal(sand.falls, true);
  assert.equal(blockInfo(AIR), AIR_INFO);
  assert.equal(blockInfo('banana'), undefined);
});

test('isKnownBlock says yes to real blocks and air, no to anything else', () => {
  assert.equal(isKnownBlock('gold'), true);
  assert.equal(isKnownBlock(AIR), true);
  assert.equal(isKnownBlock('banana'), false);
  assert.equal(isKnownBlock(undefined), false);
});

test('allSystems lists every pack\'s systems in pack order', () => {
  assert.deepEqual(allSystems(), PACKS.flatMap((pack) => pack.systems));
  assert.ok(allSystems().includes(fallingBlocks));
});

test('the packs run basic first, then electric', () => {
  assert.deepEqual(PACKS.map((pack) => pack.tab.id), ['basic', 'electric']);
});

test('blocksInPack gives the palette for one tab', () => {
  assert.equal(blocksInPack('basic')[0], 'grass');
  assert.deepEqual(blocksInPack('nope'), []);
});

test('the shared signals later packs will use are named', () => {
  assert.deepEqual(SIGNALS, { POWER: 'power', SPIN: 'spin' });
});
