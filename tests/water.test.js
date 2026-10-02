/**
 * water.test.js — checks the 💧 pack with the real blocks: flipping
 * valves, burners and pumps, the palette, a steam power plant lighting a
 * lamp, and a battery-powered pump pushing water uphill.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, getBlock, getFluid, setBlock, setFluid, tick } from '../js/world.js';
import { allSystems, blockInfo, blocksInPack, isKnownBlock } from '../js/blocks/registry.js';
import { partAxis } from '../js/circuit.js';
import { openSides } from '../js/fluids.js';
import water, { turbinePush } from '../js/blocks/water.js';

/** What each letter in a test picture means. `~` is air full of water. */
const LETTERS = {
  '.': 'air', '~': 'air', '#': 'stone', W: 'wire', L: 'lamp', B: 'battery',
  F: 'burnerOn', T: 'turbine', '^': 'pumpUp', P: 'pipe',
};

/**
 * Build a world from a picture, one string per row.
 * @param {string[]} rows - the picture
 * @returns {object} the world
 */
function worldFrom(rows) {
  const world = createWorld(rows[0].length, rows.length);
  rows.forEach((row, y) => [...row].forEach((letter, x) => {
    setBlock(world, x, y, LETTERS[letter]);
    if (letter === '~') setFluid(world, 'water', x, y, 1);
  }));
  return world;
}

/**
 * ✋ a block, the way build.js does.
 * @param {object} world - the world
 * @param {number} x - column
 * @param {number} y - row
 * @returns {boolean} what use() said
 */
function use(world, x, y) {
  return blockInfo(getBlock(world, x, y)).use({ world, x, y, playNote() {}, flash() {} });
}

test('the water tab shows one of each block, plus water and steam to pour', () => {
  assert.deepEqual(blocksInPack('water'), [
    'water', 'steam', 'pipe', 'valveOpen', 'faucet', 'drain', 'burnerOn', 'chiller', 'turbine', 'pumpRight',
  ]);
  for (const name of ['valveClosed', 'burnerOff', 'pumpDown', 'pumpLeft', 'pumpUp']) assert.equal(isKnownBlock(name), true);
  assert.deepEqual(water.tab, { id: 'water', icon: '💧', label: 'Water' });
});

test('✋ flips valves and burners, and turns pumps round, without spilling', () => {
  const world = worldFrom(['P']);
  setBlock(world, 0, 0, 'valveOpen');
  setFluid(world, 'water', 0, 0, 0.5);
  assert.equal(use(world, 0, 0), true);
  assert.equal(getBlock(world, 0, 0), 'valveClosed');
  assert.equal(getFluid(world, 'water', 0, 0), 0.5);
  use(world, 0, 0);
  assert.equal(getBlock(world, 0, 0), 'valveOpen');

  setBlock(world, 0, 0, 'burnerOn');
  use(world, 0, 0);
  assert.equal(getBlock(world, 0, 0), 'burnerOff');

  setBlock(world, 0, 0, 'pumpRight');
  const turns = [];
  for (let i = 0; i < 4; i++) {
    use(world, 0, 0);
    turns.push(getBlock(world, 0, 0));
  }
  assert.deepEqual(turns, ['pumpDown', 'pumpLeft', 'pumpUp', 'pumpRight']);
});

test('a turbine faces two ways: steam goes up through it, wires leave it sideways', () => {
  const world = worldFrom(['...', 'WTW', '...']);
  assert.deepEqual(openSides(world, 1, 1, blockInfo), ['up', 'down']);
  assert.equal(partAxis(world, 1, 1, blockInfo), 'h');
});

test('a steam power plant lights a lamp: burner → steam → turbine → ⚡', () => {
  const world = worldFrom([
    'WWWLWWW',
    'W.....W',
    'WWWTWWW',
    '###~###',
    '###F###',
    '#######',
  ]);
  const systems = allSystems();
  let brightest = 0;
  for (let i = 0; i < 40; i++) {
    tick(world, systems, blockInfo);
    brightest = Math.max(brightest, world.signals.electric.cells.get(3).level);
  }
  assert.ok(brightest > 0.5, `the lamp only reached ${brightest.toFixed(3)}`);
  assert.ok(turbinePush(world, 3, 2) > 0); // still spinning from the steam
});

test('a battery-powered pump pushes water uphill; without power it does not', () => {
  const plan = (battery) => [
    'WWWWW',
    `${battery}#.#W`,
    'WW^WW',
    '##~##',
    '#####',
  ];
  const systems = allSystems();
  const powered = worldFrom(plan('B'));
  for (let i = 0; i < 20; i++) tick(powered, systems, blockInfo);
  assert.ok(getFluid(powered, 'water', 2, 1) > 0.5, 'the pump did not lift the water');

  const unpowered = worldFrom(plan('#'));
  for (let i = 0; i < 20; i++) tick(unpowered, systems, blockInfo);
  assert.equal(getFluid(unpowered, 'water', 2, 1), 0);
});

test('sand sinks through water: they trade places and no water is lost', () => {
  const world = createWorld(1, 3);
  setBlock(world, 0, 0, 'sand');
  setFluid(world, 'water', 0, 1, 1);
  setBlock(world, 0, 2, 'stone');
  const systems = allSystems();
  for (let i = 0; i < 5; i++) tick(world, systems, blockInfo);
  assert.equal(getBlock(world, 0, 1), 'sand');
  assert.ok(Math.abs(getFluid(world, 'water', 0, 0) - 1) < 1e-9);
});
