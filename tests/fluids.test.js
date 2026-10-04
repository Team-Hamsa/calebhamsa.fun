/**
 * fluids.test.js — checks how water and steam move: falling, leveling
 * out, U-tubes, water towers, pipes and valves, steam rising, and the
 * special blocks. Each test draws a little world as a picture of letters.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, getFluid, setBlock, setFluid } from '../js/world.js';
import { REFERENCE_CURRENT } from '../js/circuit.js';
import {
  BOIL_RATE, CONDENSE_RATE, DROP_POWER, FAUCET_RATE, PUMP_HEAD, PUMP_RATE, SQUISH, fallEnergy, headOf, openSides, pumpAmount,
  stableBelow, stepFluids, storedEnergy,
} from '../js/fluids.js';

/**
 * Stand-in blocks with the same fluid settings as the real ones in
 * js/blocks/water.js (fluids.js only reads these fields).
 */
const TEST_BLOCKS = {
  stone: {},
  pipe: { fluid: { sides: 'auto-pipe' } },
  valveOpen: { fluid: { sides: 'axis', prefer: 'h' } },
  valveClosed: { fluid: { sides: 'axis', prefer: 'h', closed: true } },
  drain: { fluid: { sides: 'all' }, drains: true },
  faucet: { faucet: true },
  burnerOn: { burns: true },
  chiller: { chills: true },
  turbine: { fluid: { sides: 'axis', prefer: 'v' }, turbine: true },
  pumpUp: { fluid: { sides: ['up', 'down'], pump: 'up' } },
};

/**
 * Look up a stand-in block.
 * @param {string} name - a block name
 * @returns {object|undefined} its settings (undefined for air)
 */
const blockInfo = (name) => TEST_BLOCKS[name];

/** What each letter means. `~` is air full of water, `s` is air full of steam. */
const LETTERS = {
  '.': 'air', '~': 'air', s: 'air', '#': 'stone', P: 'pipe', V: 'valveOpen', X: 'valveClosed',
  D: 'drain', F: 'faucet', B: 'burnerOn', C: 'chiller', T: 'turbine', '^': 'pumpUp',
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
    if (letter === 's') setFluid(world, 'steam', x, y, 1);
  }));
  return world;
}

/**
 * Run the fluids for a number of ticks.
 * @param {object} world - the world
 * @param {number} ticks - how many
 * @returns {object} the world
 */
function run(world, ticks) {
  for (let i = 0; i < ticks; i++) stepFluids(world, blockInfo);
  return world;
}

/**
 * Add up one fluid over the whole world.
 * @param {object} world - the world
 * @param {'water'|'steam'} kind - which fluid
 * @returns {number} the total
 */
const total = (world, kind) => world.fluid[kind].reduce((sum, amount) => sum + amount, 0);

/**
 * Add up one fluid down a column, between two rows (inclusive).
 * @param {object} world - the world
 * @param {number} x - the column
 * @param {number} top - the first row
 * @param {number} bottom - the last row
 * @returns {number} the total
 */
function column(world, x, top, bottom) {
  let sum = 0;
  for (let y = top; y <= bottom; y++) sum += getFluid(world, 'water', x, y);
  return sum;
}

test('the lower of two stacked cells holds a little extra when both are full (squish)', () => {
  assert.equal(stableBelow(0.5), 1);
  assert.equal(stableBelow(1), 1);
  assert.ok(stableBelow(2) > 1 && stableBelow(2) < 1 + SQUISH);
  assert.ok(stableBelow(4) > 2);
});

test('a drop of water falls and lands on the floor', () => {
  const world = run(worldFrom(['~', '.', '.', '#']), 60);
  assert.ok(getFluid(world, 'water', 0, 2) > 0.99);
  assert.ok(getFluid(world, 'water', 0, 0) < 0.01);
});

test('a pile of water spreads out and levels off', () => {
  const world = run(worldFrom(['#~~~~#', '#....#', '######']), 400);
  for (let x = 1; x <= 4; x++) assert.ok(Math.abs(getFluid(world, 'water', x, 1) - 1) < 0.03, `x=${x}`);
});

test('water in a U-tube ends at the same height on both sides, within 10 seconds', () => {
  const world = worldFrom([
    '#~#.#',
    '#~#.#',
    '#~#.#',
    '#~#.#',
    '#...#',
    '#####',
  ]);
  run(world, 80); // 80 ticks = 10 seconds
  const left = column(world, 1, 0, 3);
  const right = column(world, 3, 0, 3);
  assert.ok(Math.abs(left - right) < 0.05, `left ${left.toFixed(3)} right ${right.toFixed(3)}`);
});

test('a water tower pushes water up a pipe and out of a lower spout', () => {
  const world = worldFrom([
    '#.#......',
    '#~#......',
    '#~#......',
    '#~#..P...',
    '#~#..P...',
    '#~#..P...',
    '#~#..P...',
    '#~PPPP...',
    '#########',
  ]);
  run(world, 160); // 20 seconds
  let outside = 0;
  for (let y = 0; y <= 7; y++) for (let x = 3; x <= 8; x++) if (x !== 5) outside += getFluid(world, 'water', x, y);
  outside += column(world, 5, 0, 2);
  assert.ok(outside > 0.5, `only ${outside.toFixed(3)} came out`);
});

test('water in a pipe ends level with the water in the tower, and no higher', () => {
  // 7 waters: 5 fill the bottom row (tower + pipe), the other 2 share
  // the tower and the pipe's upright part, so both end about 1 high.
  const world = worldFrom([
    '#.#..P.',
    '#~#..P.',
    '#~#..P.',
    '#~#..P.',
    '#~#..P.',
    '#~#..P.',
    '#~#..P.',
    '#~PPPP.',
    '#######',
  ]);
  run(world, 400); // 50 seconds: a tall tower takes a while
  const tower = column(world, 1, 0, 6);
  const pipe = column(world, 5, 0, 6);
  assert.ok(Math.abs(tower - pipe) < 0.1, `tower ${tower.toFixed(3)} pipe ${pipe.toFixed(3)}`);
  assert.ok(column(world, 5, 0, 4) < 0.05, 'water rose above the tower level');
  assert.ok(pipe > 0.7, 'water should have climbed the pipe');
});

test('water is never made or lost when nothing special happens', () => {
  const world = worldFrom([
    '~~~~~~~~',
    '~#..P..~',
    '~#..P..~',
    '..PPP...',
    '.#....#.',
    '########',
  ]);
  const before = total(world, 'water');
  run(world, 300);
  assert.ok(Math.abs(total(world, 'water') - before) < 1e-9);
  for (const amount of world.fluid.water) assert.ok(amount >= 0);
});

test('a closed valve stops water; an open one lets it through', () => {
  const closed = run(worldFrom(['#~X..#', '######']), 200);
  assert.ok(getFluid(closed, 'water', 3, 0) < 0.001);
  const open = run(worldFrom(['#~V..#', '######']), 400);
  assert.ok(getFluid(open, 'water', 4, 0) > 0.1);
});

test('pipes are sealed along their sides, and open at their ends', () => {
  const world = worldFrom(['PPP']);
  assert.deepEqual(openSides(world, 1, 0, blockInfo), ['right', 'left']); // middle: joined both ways
  assert.deepEqual(openSides(world, 0, 0, blockInfo).sort(), ['left', 'right']); // end: open past its end
  const flooded = worldFrom(['~~~~', '.PP.', '....', '####']);
  run(flooded, 50);
  assert.ok(getFluid(flooded, 'water', 1, 1) < 0.01, 'water leaked into the pipe through its top');
});

test('steam rises and spreads out under a ceiling', () => {
  const world = run(worldFrom(['####', '....', '....', 's...']), 400);
  let top = 0;
  for (let x = 0; x < 4; x++) top += getFluid(world, 'steam', x, 1);
  assert.ok(top > 0.95, `steam at the top: ${top.toFixed(3)}`);
});

test('steam bubbles up through water', () => {
  const world = worldFrom(['#.#', '#~#', '#~#', '#s#', '###']);
  run(world, 300);
  assert.ok(getFluid(world, 'steam', 1, 0) > 0.5);
});

test('a burner boils the water above it into steam', () => {
  const world = worldFrom(['###', '#~#', '#B#']);
  stepFluids(world, blockInfo);
  assert.ok(Math.abs(getFluid(world, 'steam', 1, 1) - BOIL_RATE) < 1e-9);
  assert.ok(Math.abs(getFluid(world, 'water', 1, 1) - (1 - BOIL_RATE)) < 1e-9);
});

test('a chiller turns the steam around it back into water', () => {
  const world = worldFrom(['###', 'sC#', '###']);
  stepFluids(world, blockInfo);
  assert.ok(Math.abs(getFluid(world, 'water', 0, 1) - CONDENSE_RATE) < 1e-9);
});

test('a faucet drips water into the cell below; a drain swallows water', () => {
  const tap = worldFrom(['F', '.', '#']);
  stepFluids(tap, blockInfo);
  assert.ok(Math.abs(total(tap, 'water') - FAUCET_RATE) < 1e-9);
  const sink = run(worldFrom(['~', 'D', '#']), 50);
  assert.ok(total(sink, 'water') < 0.001);
});

test('a powered pump pushes water uphill; an unpowered one does not', () => {
  const build = () => worldFrom(['#.#', '#^#', '#~#', '###']);
  const off = run(build(), 100);
  assert.ok(getFluid(off, 'water', 1, 0) < 0.001);
  const on = build();
  on.signals.electric = { cells: new Map([[1 * 3 + 1, { level: 1, current: REFERENCE_CURRENT }]]) };
  stepFluids(on, blockInfo);
  // Lifting uses up some of its push: it moves a bit less than it would on the level.
  const lifted = getFluid(on, 'water', 1, 0);
  assert.ok(lifted > 0.7 * PUMP_RATE && lifted < PUMP_RATE, `lifted ${lifted}`);
  assert.ok(Math.abs(total(on, 'water') - 1) < 1e-12);
});

test('lifting water uses up a pump\'s push: the higher the water stands on it, the less it moves, until it stalls', () => {
  // On the level (or downhill) it moves its full PUMP_RATE.
  assert.ok(Math.abs(pumpAmount(1, 1, 0, 0) - PUMP_RATE) < 0.01 * PUMP_RATE);
  assert.ok(Math.abs(pumpAmount(1, 0.5, 0, -2) - PUMP_RATE) < 1e-12);
  // Pushing up against 0, 1, 2, 3 full cells standing on the cell in front: less and less.
  const amounts = [0, 1, 2, 3].map((cells) => pumpAmount(1, 1, 1 + SQUISH * cells, 2));
  for (let i = 1; i < amounts.length; i++) assert.ok(amounts[i] < amounts[i - 1], `${amounts}`);
  assert.ok(amounts[3] > 0);
  // PUMP_HEAD cells up is too heavy for one battery's worth: it stalls...
  assert.equal(pumpAmount(1, 1, 1 + SQUISH * (PUMP_HEAD - 2), 2), 0);
  // ...but two batteries' worth still lifts there, and moves more everywhere.
  assert.ok(pumpAmount(2, 1, 1 + SQUISH * (PUMP_HEAD - 2), 2) > 0);
  assert.ok(pumpAmount(2, 1, 1, 2) > pumpAmount(1, 1, 1, 2));
  // No water behind it, nothing to move.
  assert.equal(pumpAmount(1, 0, 0, 2), 0);
});

test('a pump never gives the water more energy than its electricity holds', () => {
  for (const level of [0.25, 0.5, 1, 2, 3.5, 6]) {
    const electricity = (level * REFERENCE_CURRENT) ** 2 * 1; // current² × the pump's resistance (1)
    for (const behind of [0.2, 1, 1.3]) {
      for (let ahead = 0; ahead < 5; ahead += 0.05) {
        for (const rise of [2, 0, -2]) {
          const amount = pumpAmount(level, behind, ahead, rise);
          assert.ok(amount >= 0 && amount <= behind && amount <= PUMP_RATE * level + 1e-12);
          const gained = -fallEnergy(behind, ahead, amount, -rise); // the water went UP: it gained
          assert.ok(DROP_POWER * gained <= 0.9 * electricity, `level ${level}, ${behind} → ${ahead}: gained ${DROP_POWER * gained} of ${electricity}`);
        }
      }
    }
  }
});

test('water gives up energy by falling, and hardly any by sliding along', () => {
  // A full cell of water falling one cell into an empty cell gives up 1.
  assert.ok(Math.abs(fallEnergy(1, 0, 1, 1) - 1) < 1e-12);
  // A little water falling one cell: 1 for each cell's worth.
  assert.ok(Math.abs(fallEnergy(0.05, 0, 0.05, 1) - 0.05) < 1e-12);
  // The same amount sliding sideways between two nearly level cells: almost nothing.
  assert.ok(fallEnergy(0.55, 0.5, 0.0125, 0) < 0.001);
  assert.ok(fallEnergy(0.55, 0.5, 0.0125, 0) > 0);
  // Lifting water costs energy (a negative "fall").
  assert.ok(fallEnergy(1, 0, 0.05, -1) < 0);
  // Water resting level gives nothing either way: deep water's squish holds it up exactly.
  assert.ok(Math.abs(headOf(1 + SQUISH) - 1 - headOf(1)) < 1e-12);
});

test('settling water only ever loses height energy: it never gains any by itself', () => {
  /**
   * All the height energy in a world (each cell's own, plus how high the cell is).
   * @param {object} world - the world
   * @returns {number} the total
   */
  const energy = (world) => world.fluid.water.reduce((sum, amount, index) => {
    const up = world.height - 1 - Math.floor(index / world.width);
    return sum + storedEnergy(amount) + amount * up;
  }, 0);
  for (const rows of [['~..', '~..', '~..', '###'], ['~#.', '~#.', '~#.', '~..', '###'], ['#~~#....', '#~~#....', '#~~#..P.', '#~~PPPP.', '########']]) {
    const world = worldFrom(rows);
    let last = energy(world);
    for (let i = 0; i < 200; i++) {
      stepFluids(world, blockInfo);
      const now = energy(world);
      assert.ok(now <= last + 1e-9, `${rows.join('/')} tick ${i}: energy rose from ${last} to ${now}`);
      last = now;
    }
  }
});

test('steam leaving a turbine is counted (that is what makes it spin)', () => {
  const world = worldFrom(['#.#', '#T#', '#s#', '###']);
  let out = 0;
  for (let i = 0; i < 20; i++) out += stepFluids(world, blockInfo).steamOut.get(1 * 3 + 1) ?? 0;
  assert.ok(out > 0.5);
});

test('a kettle (faucet into a pot on a burner) does not fill the world with endless steam', () => {
  // A sealed box: the faucet drips into a pot (x = 3) that sits on the burner.
  const world = worldFrom([
    '#..F..#',
    '#.....#',
    '#.....#',
    '#.#.#.#',
    '#.#.#.#',
    '###B###',
    '#######',
  ]);
  run(world, 3000);
  const before = total(world, 'steam');
  run(world, 1000);
  const after = total(world, 'steam');
  assert.ok(after - before < 0.5, `steam kept growing: ${before.toFixed(2)} → ${after.toFixed(2)}`);
  assert.ok(Math.max(...world.fluid.steam) < 3, `steam squished to ${Math.max(...world.fluid.steam).toFixed(2)}`);
});

test('water flowing down through a water wheel is counted, going down = +', () => {
  TEST_BLOCKS.waterWheel = { fluid: { sides: 'all' }, wheel: true };
  LETTERS.O = 'waterWheel';
  const world = worldFrom(['~', 'O', '.', '#']);
  let out = 0;
  let work = 0;
  for (let i = 0; i < 10; i++) {
    const step = stepFluids(world, blockInfo);
    out += step.waterOut.get(1) ?? 0;
    work += step.waterWork.get(1) ?? 0;
  }
  assert.ok(out > 0.5, `only ${out}`);
  // The energy it gave up is counted too: a full cell fell onto the wheel and off it again.
  assert.ok(work > 1.5 && work <= 2 + 1e-9, `work ${work}`);
});

test('water sliding level through a wheel gives up hardly any energy; no energy is counted twice', () => {
  const stream = worldFrom(['F....', '..O.D', '#####']);
  run(stream, 300);
  const level = stepFluids(stream, blockInfo);
  const flow = level.waterOut.get(1 * 5 + 2);
  assert.ok(flow > 0.04, `flow ${flow}`);
  assert.ok(level.waterWork.get(1 * 5 + 2) < 0.2 * flow, `work ${level.waterWork.get(1 * 5 + 2)} for flow ${flow}`);
  // Three wheels stacked under a faucet, a drain at the bottom: the water falls
  // 3 cells past them, so all three together get about 3 cells' worth, not 6.
  const stack = worldFrom(['#F#', '#O#', '#O#', '#O#', '#D#']);
  run(stack, 300);
  const fall = stepFluids(stack, blockInfo);
  const sum = [1, 2, 3].reduce((all, y) => all + fall.waterWork.get(y * 3 + 1), 0);
  assert.ok(sum > 2.5 * FAUCET_RATE && sum < 3.2 * FAUCET_RATE, `three wheels got ${sum / FAUCET_RATE} cells of fall`);
});

test('water spreads the same to the left and to the right (no favorite side)', () => {
  // One step: a full cell with an empty cell on each side gives each the same.
  const puddle = worldFrom(['.~.', '###']);
  stepFluids(puddle, blockInfo);
  assert.ok(
    Math.abs(getFluid(puddle, 'water', 0, 0) - getFluid(puddle, 'water', 2, 0)) < 1e-12,
    `left ${getFluid(puddle, 'water', 0, 0)} right ${getFluid(puddle, 'water', 2, 0)}`,
  );
  // A faucet over the middle of a ridge: both drains get the same stream.
  TEST_BLOCKS.waterWheel = { fluid: { sides: 'all' }, wheel: true };
  LETTERS.O = 'waterWheel';
  const split = worldFrom(['#F#', 'O.O', 'D#D']);
  run(split, 300);
  let left = 0;
  let right = 0;
  for (let i = 0; i < 100; i++) {
    const { waterOut } = stepFluids(split, blockInfo);
    left += waterOut.get(1 * 3 + 0) ?? 0;
    right += waterOut.get(1 * 3 + 2) ?? 0;
  }
  assert.ok(Math.abs(left - right) < 1e-9, `left wheel ${left} right wheel ${right}`);
});

test('steam spreads the same to the left and to the right too', () => {
  const cloud = worldFrom(['###', '.s.']);
  stepFluids(cloud, blockInfo);
  assert.ok(Math.abs(getFluid(cloud, 'steam', 0, 1) - getFluid(cloud, 'steam', 2, 1)) < 1e-12);
});
