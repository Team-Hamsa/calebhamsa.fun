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
  F: 'burnerOn', T: 'turbine', '^': 'pumpUp', P: 'pipe', C: 'chiller',
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

test('more batteries make a pump lift water HIGHER and faster; one battery stalls part way up', () => {
  /**
   * A pump under a tall shaft, a wide pool behind it, and a loop of wire with some batteries.
   * @param {number} batteries - how many batteries in the loop
   * @returns {{height: number, ticksTo3: number}} how many cells high the water ends up
   *   standing above the pump, and how many ticks it took to get 3 cells up
   */
  const lift = (batteries) => {
    const rows = ['#######...#######'];
    for (let i = 0; i < 12; i++) rows.push('########.########');
    rows.push('WWWWWWWW^WWWWWWWW', `W${'~'.repeat(15)}W`, `W${'#'.repeat(15)}W`, `W${'B'.repeat(batteries)}${'W'.repeat(16 - batteries)}`);
    const world = worldFrom(rows);
    const systems = allSystems();
    let ticksTo3 = Infinity;
    for (let i = 1; i <= 1500; i++) {
      tick(world, systems, blockInfo);
      if (ticksTo3 === Infinity && getFluid(world, 'water', 8, 10) > 0.5) ticksTo3 = i;
    }
    let total = 0;
    world.fluid.water.forEach((amount) => { total += amount; });
    assert.ok(Math.abs(total - 15) < 1e-9, `water went from 15 to ${total}`);
    let height = 0;
    for (let y = 12; y >= 1 && getFluid(world, 'water', 8, y) > 0.5; y--) height++;
    return { height, ticksTo3 };
  };
  const one = lift(1);
  const two = lift(2);
  assert.ok(one.height >= 3 && one.height <= 6, `one battery lifted ${one.height} cells`);
  assert.ok(two.height >= one.height + 3, `two batteries lifted ${two.height}, one lifted ${one.height}`);
  assert.ok(two.ticksTo3 < one.ticksTo3, `two batteries took ${two.ticksTo3} ticks, one took ${one.ticksTo3}`);
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

/**
 * Build a steam plant with some turbines stacked in one chimney over ONE
 * burner, run it until the steam is steady, and read each turbine's push.
 * @param {string[]} chimney - the rows between the top chamber and the pot, like ['##T##', '##T##']
 * @returns {number[]} each turbine's push, in volts, top first
 */
function plantPushes(chimney) {
  const world = worldFrom(['#CCC#', '#...#', ...chimney, '#~~~#', '##F##']);
  const systems = allSystems();
  for (let i = 0; i < 400; i++) tick(world, systems, blockInfo);
  return chimney.map((row, i) => (row.includes('T') ? turbinePush(world, 2, 2 + i) : null)).filter((push) => push !== null);
}

test('turbines in a row share the same steam: three stacked give no more push than one', () => {
  const [one] = plantPushes(['##T##']);
  assert.ok(one > 0.5, `one turbine pushes ${one}`);
  for (const chimney of [['##T##', '##T##'], ['##T##', '##T##', '##T##'], ['##T##', '##P##', '##T##'], ['##T##', '##.##', '##T##']]) {
    const pushes = plantPushes(chimney);
    const together = pushes.reduce((sum, push) => sum + push, 0);
    assert.ok(together <= one + 0.01, `${chimney.join('/')}: ${pushes} adds up to more than one turbine's ${one}`);
    assert.ok(together > one * 0.8, `${chimney.join('/')}: ${pushes} adds up to much less than ${one}`);
    for (const push of pushes) assert.ok(Math.abs(push - pushes[0]) < 0.01, `${chimney.join('/')}: not shared evenly: ${pushes}`);
  }
});

test('turbines side by side in their own chimneys each keep all the push of their own steam', () => {
  const world = worldFrom(['#CCCCC#', '#.....#', '##T#T##', '#~~~~~#', '##F#F##']);
  const systems = allSystems();
  for (let i = 0; i < 400; i++) tick(world, systems, blockInfo);
  const [one] = plantPushes(['##T##']);
  assert.ok(Math.abs(turbinePush(world, 2, 2) - one) < 0.1, `left pushes ${turbinePush(world, 2, 2)}, one alone ${one}`);
  assert.ok(Math.abs(turbinePush(world, 4, 2) - turbinePush(world, 2, 2)) < 1e-9);
});
