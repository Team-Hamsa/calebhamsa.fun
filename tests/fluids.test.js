/**
 * fluids.test.js — checks how water and steam move: falling, leveling
 * out, U-tubes, water towers, pipes and valves, steam rising, and the
 * special blocks. Each test draws a little world as a picture of letters.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWorld, getFluid, setBlock, setFluid } from '../js/world.js';
import { REFERENCE_CURRENT } from '../js/circuit.js';
import {
  BOIL_RATE, CONDENSE_RATE, DROP_POWER, FAUCET_RATE, FULL, FULL_SLACK, PIPE_EASE, PUMP_HEAD, PUMP_RATE, RISE_POWER, SQUIRT_EASE,
  STEAM_SQUEEZE, allOpenSides, fallEnergy, flowTable, flowWater, makeRoom, openSides, placeBlock, pressWork, pumpAmount,
  settleShares, solveBanded, stableBelow, stepFluids, storedEnergy, workingPumps,
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
  pumpDown: { fluid: { sides: ['up', 'down'], pump: 'down' } },
  pumpLeft: { fluid: { sides: ['left', 'right'], pump: 'left' } },
  pumpRight: { fluid: { sides: ['left', 'right'], pump: 'right' } },
  waterWheel: { fluid: { sides: 'all' }, wheel: true },
};

/**
 * Look up a stand-in block.
 * @param {string} name - a block name
 * @returns {object|undefined} its settings (undefined for air)
 */
const blockInfo = (name) => TEST_BLOCKS[name];

/**
 * What each letter means. `~` is air full of water, `s` is air full of
 * steam, and the small letters `p`, `o`, `u`, `d`, `l`, `r` are a pipe, a
 * water wheel and the four pumps, FULL of water.
 */
const LETTERS = {
  '.': 'air', '~': 'air', s: 'air', '#': 'stone', P: 'pipe', V: 'valveOpen', X: 'valveClosed',
  D: 'drain', F: 'faucet', B: 'burnerOn', C: 'chiller', T: 'turbine', '^': 'pumpUp',
  v: 'pumpDown', '<': 'pumpLeft', '>': 'pumpRight', O: 'waterWheel',
  p: 'pipe', o: 'waterWheel', u: 'pumpUp', d: 'pumpDown', l: 'pumpLeft', r: 'pumpRight',
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
    if ('~poudlr'.includes(letter)) setFluid(world, 'water', x, y, 1);
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

/**
 * All the height energy the water in a world holds (each cell's own,
 * plus how high the cell is).
 * @param {object} world - the world
 * @returns {number} the total
 */
const waterEnergy = (world) => world.fluid.water.reduce((sum, amount, index) => {
  const up = world.height - 1 - Math.floor(index / world.width);
  return sum + storedEnergy(amount) + amount * up;
}, 0);

/**
 * Switch pumps on: give each a current, as the ⚡ pack would.
 * @param {object} world - the world
 * @param {number} level - how many batteries' worth each pump gets
 * @returns {Map<number, object>} the records, by cell index (change `current` to change the power)
 */
function powerPumps(world, level) {
  const cells = new Map();
  world.cells.forEach((name, index) => {
    if (blockInfo(name)?.fluid?.pump) cells.set(index, { level: Math.min(level, 2), current: level * REFERENCE_CURRENT });
  });
  world.signals.electric = { cells };
  return cells;
}

/**
 * The same picture, left and right swapped (pumps too).
 * @param {string[]} rows - the picture
 * @returns {string[]} its mirror image
 */
function mirrored(rows) {
  const swap = { '<': '>', '>': '<', l: 'r', r: 'l' };
  return rows.map((row) => [...row].reverse().map((letter) => swap[letter] ?? letter).join(''));
}

test('steam can be squeezed (the nearer the ceiling, the more a cell holds); water cannot', () => {
  assert.equal(stableBelow(0.5), 1);
  assert.equal(stableBelow(1), 1);
  assert.ok(stableBelow(2) > 1 && stableBelow(2) < 1 + STEAM_SQUEEZE);
  assert.ok(stableBelow(4) > 2);
  // Squeezed steam pushes harder: full, with 3 more cells' worth packed in
  // behind it, it pushes like 4. (How hard it pushes is how fast its energy
  // grows as a little more is packed in.)
  const push = (amount) => (storedEnergy(amount + 1e-7) - storedEnergy(amount - 1e-7)) / 2e-7;
  assert.ok(Math.abs(push(0.5) - 0.5) < 1e-6);
  assert.ok(Math.abs(push(1 + 3 * STEAM_SQUEEZE) - 4) < 1e-6);
  // Water: a tall column, with more poured on top, never shows a cell over full.
  const world = worldFrom(['#~#', '#~#', '#~#', '#~#', '#~#', '#~#', '#~#', '#~#', '###']);
  for (let i = 0; i < 300; i++) {
    stepFluids(world, blockInfo);
    assert.ok(Math.max(...world.fluid.water) <= FULL + 1e-9, `tick ${i}: a cell holds ${Math.max(...world.fluid.water)}`);
  }
  assert.ok(Math.abs(total(world, 'water') - 8) < 1e-9);
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

test('water in a U-tube ends at the same height on both sides, within 3 seconds', () => {
  const world = worldFrom([
    '#~#.#',
    '#~#.#',
    '#~#.#',
    '#~#.#',
    '#...#',
    '#####',
  ]);
  run(world, 20); // 8 ticks = 1 second
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
  run(world, 40); // 5 seconds
  const tower = column(world, 1, 0, 6);
  const pipe = column(world, 5, 0, 6);
  assert.ok(Math.abs(tower - pipe) < 0.02, `tower ${tower.toFixed(3)} pipe ${pipe.toFixed(3)}`);
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

test('lifting water uses up a pump\'s push: the higher it has to lift, the less it moves, until it stalls', () => {
  // On the level it moves its full PUMP_RATE.
  assert.ok(Math.abs(pumpAmount(1, 0) - PUMP_RATE) < 1e-12);
  // Lifting 1, 2, 3 cells: less and less.
  const amounts = [0, 1, 2, 3].map((lift) => pumpAmount(1, lift));
  for (let i = 1; i < amounts.length; i++) assert.ok(amounts[i] < amounts[i - 1], `${amounts}`);
  assert.ok(amounts[3] > 0);
  // PUMP_HEAD cells up is too heavy for one battery's worth: it stalls (and never runs backwards)...
  assert.equal(pumpAmount(1, PUMP_HEAD), 0);
  assert.equal(pumpAmount(1, PUMP_HEAD + 3), 0);
  // ...but two batteries' worth still lifts there, and moves more everywhere.
  assert.ok(pumpAmount(2, PUMP_HEAD) > 0);
  assert.ok(pumpAmount(2, 2) > pumpAmount(1, 2));
  // Water pressing downhill through a running pump helps it along a little.
  assert.ok(pumpAmount(1, -2) > PUMP_RATE && pumpAmount(1, -2) < 1.5 * PUMP_RATE);
  // No electricity, nothing moves.
  assert.equal(pumpAmount(0, -2), 0);
});

test('a pump never gives the water more energy than its electricity holds', () => {
  for (const level of [0.25, 0.5, 1, 2, 3.5, 6]) {
    const electricity = (level * REFERENCE_CURRENT) ** 2 * 1; // current² × the pump's resistance (1)
    for (let lift = -14; lift <= 14; lift += 0.05) {
      const amount = pumpAmount(level, lift);
      assert.ok(amount >= 0);
      // Lifting `amount` by `lift` cells gives the water amount × lift.
      assert.ok(DROP_POWER * amount * lift <= 0.9 * electricity, `level ${level}, lift ${lift}: gave ${DROP_POWER * amount * lift} of ${electricity}`);
    }
  }
});

test('pumps in a shaft, a pond and a sealed ring: each tick the water gains no more than the pumps\' work, and that is less than their electricity', () => {
  const pictures = [
    ['#.#', '#.#', '#.#', '#.#', '#.#', '#^#', '#~#', '#~#', '###'],                 // lifting up a shaft
    ['#....#....#', '#~~~~>....#', '#~~~~#....#', '###########'],                     // from one pond into the next
    ['#.........#', '#~~~~^~~~~#', '#~~~~~~~~~#', '###########'],                     // stirring a pond
    ['#####', '#ppp#', '#u#p#', '#ppp#', '#####'],                                     // a sealed ring, full all the way round
    ['#.#.#', '#~#.#', '#~#.#', '#~#.#', '#~<~#', '#####'],                           // pushing a U-tube out of level
    ['#.#', '#.#', '#.#', '#.#', '#.#', '#.#', '#.#', '#.#', '#.#', '#^#', '#^#', '#~#', '#~#', '###'], // two pumps in a row, lifting
    ['#....#....#', '#~~~>>>...#', '#~~~###...#', '###########'],                     // three in a row, on the level
    ['######', '#pppp#', '#u##d#', '#u##d#', '#pppp#', '######'],                       // a sealed ring with two rows of two
  ];
  for (const rows of pictures) {
    for (const level of [0.5, 1, 2, 3.5]) {
      const world = worldFrom(rows);
      const pumps = powerPumps(world, level).size;
      const electricity = pumps * (level * REFERENCE_CURRENT) ** 2;
      const water = total(world, 'water');
      let last = waterEnergy(world);
      for (let i = 0; i < 300; i++) {
        const { pumpWork } = stepFluids(world, blockInfo);
        const now = waterEnergy(world);
        const what = `${rows.join('/')} with ${level} batteries, tick ${i}`;
        assert.ok(DROP_POWER * pumpWork <= 0.9 * electricity + 1e-9, `${what}: the pumps did ${DROP_POWER * pumpWork} of work with ${electricity} of electricity`);
        assert.ok(now - last <= pumpWork + 1e-9, `${what}: the water gained ${now - last}, the pumps gave ${pumpWork}`);
        last = now;
      }
      assert.ok(Math.abs(total(world, 'water') - water) < 1e-9);
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
});

test('still water gives nothing: the pressure down a 5-deep tank reads 1, 2, 3, 4, 5 and nothing moves', () => {
  const world = worldFrom(['#..#', '#~~#', '#~~#', '#~~#', '#~~#', '#~~#', '####']);
  const before = Float64Array.from(world.fluid.water);
  for (let i = 0; i < 5; i++) {
    const { moved } = stepFluids(world, blockInfo);
    assert.equal(moved, 0);
  }
  assert.deepEqual(world.fluid.water, before);
  for (let depth = 1; depth <= 5; depth++) {
    for (const x of [1, 2]) assert.ok(Math.abs(world.signals.press[depth * 4 + x] - depth) < 1e-12, `${depth} deep reads ${world.signals.press[depth * 4 + x]}`);
  }
});

test('settling water only ever loses height energy: it never gains any by itself', () => {
  const energy = waterEnergy;
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
  let gross = 0;
  let out = 0;
  let work = 0;
  for (let i = 0; i < 20; i++) {
    const count = stepFluids(world, blockInfo).turbines.get(1 * 3 + 1);
    gross += count?.gross ?? 0;
    out += count?.out ?? 0;
    work += count?.work ?? 0;
  }
  assert.ok(gross > 0.5, `only ${gross} left it`);
  assert.ok(out > 0.5, `it left upward, which counts +: ${out}`);
  // A full cell of steam rose into the turbine and out of it again: 2 cells' worth at the most.
  assert.ok(work > 1 && work <= 2 + 1e-9, `work ${work}`);
});

/**
 * All the energy the steam in a world holds: each cell's own squeeze,
 * plus how LOW the cell is (steam gives up energy by rising: water's
 * energy upside down).
 * @param {object} world - the world
 * @returns {number} the total
 */
const steamEnergy = (world) => world.fluid.steam.reduce((sum, amount, index) => {
  return sum + storedEnergy(amount) + amount * Math.floor(index / world.width);
}, 0);

test('rising steam only ever loses energy: it never gains any by itself', () => {
  assert.equal(RISE_POWER, DROP_POWER); // steam is water going the other way
  const pictures = [
    ['###', '..s', '..s', '..s'], ['###', 's..', 's#.', 's#.', 's#.'], ['########', '#ssPPPP.', '#ss#..P.', '#ss#....', '#ss#....'],
    ['#.#', '#T#', '#s#', '#s#', '###'], ['.....', '~~~~~', '~~s~~', '#####'],
  ];
  for (const rows of pictures) {
    const world = worldFrom(rows);
    let last = steamEnergy(world);
    for (let i = 0; i < 200; i++) {
      stepFluids(world, blockInfo);
      const now = steamEnergy(world);
      assert.ok(now <= last + 1e-9, `${rows.join('/')} tick ${i}: energy rose from ${last} to ${now}`);
      last = now;
    }
  }
});

test('turbines never get more energy than the steam has lost, tick by tick', () => {
  const pictures = [
    ['#.#', '#.#', '#T#', '#s#', '#s#', '###'],                 // a straight chimney
    ['#.#', '#T#', '#T#', '#s#', '#s#', '###'],                 // two stacked turbines
    ['######', '#sTT..', '######'],                             // a level duct
    ['#...#', '#.T.#', '#s..#', '#s..#', '#####'],              // a turbine off to the side of the rising steam
    ['#.#.#', '#T#T#', '#...#', '#sss#', '#####'], ['sssss', 'sTTTs', 'sT.Ts', '#####'], ['.....', '.T.T.', '.sss.', '#####'],
    ['#.#', '#T#', '#~#', '#s#', '###'],                        // bubbling up through water first
  ];
  for (const rows of pictures) {
    const world = worldFrom(rows);
    const start = steamEnergy(world);
    let credited = 0;
    for (let i = 0; i < 400; i++) {
      for (const turbine of stepFluids(world, blockInfo).turbines.values()) credited += turbine.work;
      // What the steam still carries (rising) has not been handed out yet, and never adds up to more than was lost.
      const carried = world.signals.rising.reduce((sum, push) => sum + push, 0);
      const lost = start - steamEnergy(world);
      assert.ok(credited + carried <= lost + 1e-9, `${rows.join('/')} tick ${i}: credited ${credited} + carried ${carried}, lost ${lost}`);
    }
    assert.ok(credited > 0 || rows[1] === '#sTT..', `${rows.join('/')}: the turbines got nothing at all`);
  }
});

test('in lots of random worlds, turbines never get more energy than the steam has given up so far, and no steam is lost', () => {
  let seed = 11;
  /**
   * The next make-believe random number (the same ones every run).
   * @returns {number} from 0 up to 1
   */
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let trial = 0; trial < 60; trial++) {
    const world = createWorld(6 + Math.floor(random() * 4), 5 + Math.floor(random() * 5));
    world.cells.forEach((_, index) => {
      const pick = random();
      const name = pick < 0.5 ? 'air' : pick < 0.65 ? 'stone' : pick < 0.85 ? 'turbine' : 'pipe';
      setBlock(world, index % world.width, Math.floor(index / world.width), name);
      if (name !== 'stone' && random() < 0.5) world.fluid.steam[index] = random() < 0.3 ? 1 + random() * 0.8 : random();
      if (name !== 'stone' && random() < 0.2) world.fluid.water[index] = random();
    });
    const steam = total(world, 'steam');
    const start = steamEnergy(world);
    let credited = 0;
    for (let i = 0; i < 120; i++) {
      for (const turbine of stepFluids(world, blockInfo).turbines.values()) credited += turbine.work;
      const carried = world.signals.rising.reduce((sum, push) => sum + push, 0);
      const lost = start - steamEnergy(world);
      assert.ok(credited + carried <= lost + 1e-9, `world ${trial} tick ${i}: credited ${credited} + carried ${carried}, gave up ${lost}`);
    }
    assert.ok(Math.abs(total(world, 'steam') - steam) < 1e-9, `world ${trial}: steam ${steam} → ${total(world, 'steam')}`);
  }
});

test('rising steam carries its push to the first turbine; steam that has spread out under a ceiling has lost it', () => {
  // A long way up to the turbine: it gets the whole rise, not just its own two cells.
  const tall = worldFrom(['#.#', '#T#', '#.#', '#.#', '#.#', '#.#', '#.#', '#.#', '#s#', '###']);
  let work = 0;
  let carriedOnTheWay = 0;
  for (let i = 0; i < 60; i++) {
    for (const turbine of stepFluids(tall, blockInfo).turbines.values()) work += turbine.work;
    carriedOnTheWay = Math.max(carriedOnTheWay, tall.signals.rising.reduce((sum, push) => sum + push, 0));
  }
  assert.ok(carriedOnTheWay > 1, `the rising steam carried only ${carriedOnTheWay}`);
  assert.ok(work > 7 && work <= 8 + 1e-9, `a full cell rose 8 cells to and through the turbine, which got ${work}`);
  // Steam that rises, hits a ceiling and has to go sideways to find the turbine has splashed its push away.
  const bent = worldFrom(['###.#', '###T#', '#...#', '#.###', '#.###', '#s###', '#####']);
  let got = 0;
  for (let i = 0; i < 300; i++) for (const turbine of stepFluids(bent, blockInfo).turbines.values()) got += turbine.work;
  assert.ok(got < 2.5, `the turbine round the corner got ${got}: it should only get about its own two cells`);
  // And once everything is still, nothing is carried any more.
  const still = worldFrom(['#####', '#s..#', '#...#']);
  run(still, 400);
  assert.ok(still.signals.rising.every((push) => push < 1e-6));
});

test('water falling through a turbine does not turn it, and keeps its push for a wheel below', () => {
  const through = worldFrom(['#~#', '#T#', '#O#', '#.#', '###']);
  const plain = worldFrom(['#~#', '#P#', '#O#', '#.#', '###']);
  let turbineWork = 0;
  let wheelWork = 0;
  let plainWork = 0;
  for (let i = 0; i < 40; i++) {
    const step = stepFluids(through, blockInfo);
    for (const turbine of step.turbines.values()) turbineWork += turbine.work + turbine.gross;
    wheelWork += step.waterWork.get(2 * 3 + 1) ?? 0;
    plainWork += stepFluids(plain, blockInfo).waterWork.get(2 * 3 + 1) ?? 0;
  }
  assert.equal(turbineWork, 0);
  assert.ok(wheelWork > 2.5, `the wheel under the turbine got ${wheelWork}`);
  assert.ok(Math.abs(wheelWork - plainWork) < 1e-9, `to water a turbine is a pipe: ${wheelWork} through it, ${plainWork} through a pipe`);
});

test('the old "used steam" bookkeeping is gone', () => {
  const world = worldFrom(['#.#', '#T#', '#s#', '###']);
  const step = stepFluids(world, blockInfo);
  assert.equal(world.signals.used, undefined);
  assert.equal(step.steamOut, undefined);
  assert.ok(world.signals.rising instanceof Float64Array);
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
  assert.ok(Math.max(...world.fluid.steam) < 3, `steam squeezed to ${Math.max(...world.fluid.steam).toFixed(2)}`);
});

test('water flowing down through a water wheel is counted, going down = +', () => {
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
  const split = worldFrom(['#F#', 'O.O', 'D#D']);
  run(split, 300);
  let left = 0;
  let right = 0;
  for (let i = 0; i < 100; i++) {
    const { waterOut } = stepFluids(split, blockInfo);
    left += waterOut.get(1 * 3 + 0) ?? 0;
    right += waterOut.get(1 * 3 + 2) ?? 0;
  }
  // The same stream through each, turning them opposite ways (the left one's water leans left: ↺).
  assert.ok(right > 2, `right wheel ${right}`);
  assert.ok(Math.abs(left + right) < 1e-9, `left wheel ${left} right wheel ${right}`);
});

test('steam spreads the same to the left and to the right too', () => {
  const cloud = worldFrom(['###', '.s.']);
  stepFluids(cloud, blockInfo);
  assert.ok(Math.abs(getFluid(cloud, 'steam', 0, 1) - getFluid(cloud, 'steam', 2, 1)) < 1e-12);
});

test('when streams meet in one cell, the wheels still get no more energy than the water really gave up', () => {
  const energy = waterEnergy;
  const pictures = [
    ['~~O~~', '#####'], ['#~~~#', '#~O~#', '##.##', '##.##', '#####'], ['~~~~~', '~OOO~', '~O.O~', '#####'],
    ['~~~', '~~~', 'OOO', '...', '###'], ['~#~', '~#~', '~#~', '~O~', '###'], ['~.~', '~.~', '~O~', '###'],
  ];
  for (const rows of pictures) {
    const world = worldFrom(rows);
    const start = energy(world);
    let credited = 0;
    for (let i = 0; i < 400; i++) {
      for (const work of stepFluids(world, blockInfo).waterWork.values()) credited += work;
      assert.ok(credited <= start - energy(world) + 1e-9, `${rows.join('/')} tick ${i}: credited ${credited}, gave up ${start - energy(world)}`);
    }
  }
});

test('water wheels are counted the same in a mirrored world: the flow the other way, the energy just the same', () => {
  for (const rows of [['~~~..', '~~O..', '####.', '.....'], ['.~...', '.O...', '#..#.', '####.'], ['~~.', '~O.', '~..', '#..']]) {
    const world = worldFrom(rows);
    const mirror = worldFrom(rows.map((row) => [...row].reverse().join('')));
    const at = world.cells.indexOf('waterWheel');
    const other = mirror.cells.indexOf('waterWheel');
    for (let i = 0; i < 40; i++) {
      const a = stepFluids(world, blockInfo);
      const b = stepFluids(mirror, blockInfo);
      const one = a.wheels.get(at) ?? { lean: 0, sideOut: 0, down: 0, gross: 0, work: 0 };
      const two = b.wheels.get(other) ?? { lean: 0, sideOut: 0, down: 0, gross: 0, work: 0 };
      const what = `${rows.join('/')} tick ${i}: ${JSON.stringify(one)} and ${JSON.stringify(two)}`;
      assert.ok(Math.abs(one.lean + two.lean) < 1e-12, what);       // sideways water: the other way
      assert.ok(Math.abs(one.sideOut + two.sideOut) < 1e-12, what);
      assert.ok(Math.abs(one.down - two.down) < 1e-12, what);       // falling water: just the same
      assert.ok(Math.abs(one.gross - two.gross) < 1e-12, what);
      assert.ok(Math.abs(one.work - two.work) < 1e-12, what);
      // Once any water leans sideways, the wheels turn opposite ways.
      if (Math.abs(one.lean) > 1e-9) assert.ok(Math.abs(a.waterOut.get(at) + b.waterOut.get(other)) < 1e-12, what);
    }
  }
});

test('in lots of random worlds, wheels never get more energy than the water has given up so far, and no water is lost', () => {
  let seed = 7;
  /**
   * The next make-believe random number (the same ones every run).
   * @returns {number} from 0 up to 1
   */
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const energy = waterEnergy;
  for (let trial = 0; trial < 60; trial++) {
    const world = createWorld(6 + Math.floor(random() * 4), 5 + Math.floor(random() * 5));
    world.cells.forEach((_, index) => {
      const pick = random();
      const name = pick < 0.5 ? 'air' : pick < 0.65 ? 'stone' : pick < 0.85 ? 'waterWheel' : 'pipe';
      setBlock(world, index % world.width, Math.floor(index / world.width), name);
      if (name !== 'stone' && random() < 0.5) world.fluid.water[index] = random() < 0.3 ? 1 : random();
    });
    const water = total(world, 'water');
    const start = energy(world);
    let credited = 0;
    for (let i = 0; i < 120; i++) {
      for (const work of stepFluids(world, blockInfo).waterWork.values()) credited += work;
      assert.ok(credited <= start - energy(world) + 1e-9, `world ${trial} tick ${i}: credited ${credited}, gave up ${start - energy(world)}`);
    }
    assert.ok(Math.abs(total(world, 'water') - water) < 1e-9, `world ${trial}: water ${water} → ${total(world, 'water')}`);
  }
});

test('a chiller beside a drain is the same on either side: the water it makes in the drain goes down the drain', () => {
  LETTERS.C = 'chiller';
  LETTERS.D = 'drain';
  const left = worldFrom(['#CD.#', '#####']);
  const right = worldFrom(['#.DC#', '#####']);
  setFluid(left, 'steam', 2, 0, 1);
  setFluid(right, 'steam', 2, 0, 1);
  for (let i = 0; i < 20; i++) {
    stepFluids(left, blockInfo);
    stepFluids(right, blockInfo);
    for (let x = 0; x < 5; x++) {
      for (const kind of ['water', 'steam']) {
        const a = getFluid(left, kind, x, 0);
        const b = getFluid(right, kind, 4 - x, 0);
        assert.ok(Math.abs(a - b) < 1e-12, `tick ${i}, ${kind} in column ${x}: ${a} with the chiller on the left, ${b} on the right`);
      }
    }
  }
  assert.equal(getFluid(right, 'water', 1, 0), 0); // none leaks past the drain
});

// =============================================================
// Water that can't be squashed: pressure worked out from depth (#30)
// =============================================================

/**
 * Make-believe random numbers (the same ones every run).
 * @param {number} seed - where to start
 * @returns {Function} gives the next number, from 0 up to 1
 */
function randomFrom(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/**
 * Run ONE small step of water (stepFluids runs four each tick).
 * @param {object} world - the world
 * @returns {{moved: number, pumpWork: number}} what flowWater said
 */
function smallStep(world) {
  const table = flowTable(world, allOpenSides(world, blockInfo), blockInfo);
  return flowWater(world, table, () => {});
}

/**
 * The rule for where fluid may go by itself, written out the slow and
 * plain way, to check flowTable against: both cells open on the sides
 * that touch; nothing goes INTO a pump; out of a pump only by its front.
 * @param {object} world - the world
 * @param {string[][]} sides - open sides by cell index (from allOpenSides)
 * @returns {Function} (index, side) => the neighbor's index, or −1 if blocked
 */
function plainFlowRule(world, sides) {
  const step = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };
  const opposite = { up: 'down', down: 'up', left: 'right', right: 'left' };
  return (index, side) => {
    const x = index % world.width + step[side][0];
    const y = Math.floor(index / world.width) + step[side][1];
    if (x < 0 || y < 0 || x >= world.width || y >= world.height) return -1;
    const next = y * world.width + x;
    if (!sides[index].includes(side) || !sides[next].includes(opposite[side])) return -1;
    if (blockInfo(world.cells[next])?.fluid?.pump) return -1;
    const from = blockInfo(world.cells[index])?.fluid?.pump;
    if (from && side !== from) return -1;
    return next;
  };
}

test('flowTable gives the same answers as the rule written out plainly, for every cell and side of lots of random worlds', () => {
  const random = randomFrom(17);
  const names = Object.keys(TEST_BLOCKS);
  const sideNames = ['up', 'right', 'down', 'left'];
  for (let trial = 0; trial < 60; trial++) {
    const world = createWorld(3 + Math.floor(random() * 8), 2 + Math.floor(random() * 8));
    world.cells.forEach((_, index) => {
      if (random() < 0.6) setBlock(world, index % world.width, Math.floor(index / world.width), names[Math.floor(random() * names.length)]);
    });
    const sides = allOpenSides(world, blockInfo);
    const canFlow = plainFlowRule(world, sides);
    const table = flowTable(world, sides, blockInfo);
    world.cells.forEach((name, index) => {
      const pump = Boolean(blockInfo(name)?.fluid?.pump);
      assert.equal(table.pump[index], pump ? 1 : 0);
      assert.equal(table.floor[index], world.height - 1 - Math.floor(index / world.width));
      assert.equal(table.sky[index], index < world.width && sides[index].includes('up') ? 1 : 0);
      sideNames.forEach((side, k) => {
        const next = canFlow(index, side);
        assert.equal(table.to[index * 4 + k], next, `world ${trial}, cell ${index} (${name}), ${side}`);
        // "joined": open both ways, and neither cell a pump.
        const both = next >= 0 && !pump;
        assert.equal(table.joined[index * 4 + k], both ? next : -1, `world ${trial}, cell ${index} (${name}), ${side}: joined`);
      });
    });
  }
});

test('the settings of the water circuit are what the energy sums rely on', () => {
  // (The top of the water is a link like any other: there is no setting of
  // its own for it. With a link's ease of 1 a level goes straight to where
  // it belongs and never past it; more than 1 would overshoot.)
  assert.equal(PIPE_EASE, 1);
  // A hole is narrower than a pipe.
  assert.ok(SQUIRT_EASE <= 1 / 4 && SQUIRT_EASE < PIPE_EASE);
  assert.ok(FULL_SLACK > 0 && FULL_SLACK < 1e-6);
});

test('solveBanded solves a small set of banded equations', () => {
  // [2 −1 0; −1 2 −1; 0 −1 2] · x = [1, 0, 1]  →  x = [1, 1, 1]
  const band = 1;
  const matrix = new Float64Array([0, 2, -1, 2, -1, 2]); // each row: [the number left of the diagonal, the diagonal]
  const rhs = new Float64Array([1, 0, 1]);
  assert.equal(solveBanded(3, band, matrix, rhs), true);
  for (const x of rhs) assert.ok(Math.abs(x - 1) < 1e-12);
  // Equations with no single answer are refused.
  assert.equal(solveBanded(2, 1, new Float64Array([0, 1, -1, 1]), new Float64Array([1, -1])), false);
});

test('no cell ever holds more than a cellful, whatever is built', () => {
  const random = randomFrom(3);
  const names = ['stone', 'stone', 'pipe', 'pipe', 'waterWheel', 'faucet', 'chiller', 'pumpUp', 'pumpDown', 'pumpLeft', 'pumpRight', 'valveOpen', 'drain'];
  for (let trial = 0; trial < 60; trial++) {
    const world = createWorld(5 + Math.floor(random() * 8), 4 + Math.floor(random() * 8));
    world.cells.forEach((_, index) => {
      const x = index % world.width;
      const y = Math.floor(index / world.width);
      if (random() < 0.35) setBlock(world, x, y, names[Math.floor(random() * names.length)]);
      if (openSides(world, x, y, blockInfo).length === 0) return;
      if (random() < 0.6) world.fluid.water[index] = random() < 0.6 ? 1 : random();
      if (random() < 0.2) world.fluid.steam[index] = random() * 1.5;
    });
    const pumps = powerPumps(world, 1);
    for (const record of pumps.values()) record.current = REFERENCE_CURRENT * [0, 0.5, 1, 2, 3.5][Math.floor(random() * 5)];
    for (let i = 0; i < 80; i++) {
      // Now and then, a block is built right into the water.
      if (random() < 0.1) placeBlock(world, Math.floor(random() * world.width), Math.floor(random() * world.height), random() < 0.7 ? 'stone' : 'pipe', blockInfo);
      const fullest = Math.max(...world.fluid.water);
      assert.ok(fullest <= FULL + 1e-9, `world ${trial} tick ${i}: after building, a cell holds ${fullest}`);
      stepFluids(world, blockInfo);
      const after = Math.max(...world.fluid.water);
      assert.ok(after <= FULL + 1e-9, `world ${trial} tick ${i}: a cell holds ${after}`);
      assert.ok(Math.min(...world.fluid.water) >= 0);
    }
  }
});

test('ten buckets stand ten tall; a 10-cell shaft takes exactly ten; a tank holds its size', () => {
  // Ten cells of water dropped into a shaft.
  const rows = [];
  for (let y = 0; y < 14; y++) rows.push(y < 10 ? '#~#' : '#.#');
  rows.push('###');
  const shaft = run(worldFrom(rows), 60);
  for (let y = 0; y < 14; y++) {
    const amount = getFluid(shaft, 'water', 1, y);
    assert.ok(Math.abs(amount - (y >= 4 ? 1 : 0)) < 1e-9, `row ${y} holds ${amount}`);
  }
  // A 10-deep shaft in a yard, with 13 cells poured in at its mouth: it takes 10, the rest runs over.
  const yard = ['..~..', '..~..', '..~..'];
  for (let y = 0; y < 10; y++) yard.push('##~##');
  yard.push('#####');
  const over = run(worldFrom(yard), 200);
  assert.ok(Math.abs(column(over, 2, 3, 12) - 10) < 1e-6, `the shaft holds ${column(over, 2, 3, 12)}`);
  assert.ok(Math.abs(total(over, 'water') - 13) < 1e-9);
  // A tank 4 wide and 13 deep, brim full: 52 cells, and not a drop more goes in.
  const tank = [];
  for (let y = 0; y < 13; y++) tank.push('#~~~~#');
  tank.push('######');
  const full = run(worldFrom(tank), 100);
  assert.ok(Math.abs(total(full, 'water') - 52) < 1e-9);
  assert.ok(Math.max(...full.fluid.water) <= FULL + 1e-12);
});

test('deep water presses harder: the pressure at the foot of N cells of still water reads N', () => {
  for (let depth = 1; depth <= 12; depth++) {
    const rows = ['#.#'];
    for (let y = 0; y < depth; y++) rows.push('#~#');
    rows.push('###');
    const world = run(worldFrom(rows), 3);
    assert.ok(Math.abs(world.signals.press[depth * 3 + 1] - depth) < 1e-9, `${depth} cells of water read ${world.signals.press[depth * 3 + 1]}`);
  }
  // The same in both arms of a settled U-tube, whatever their width...
  const tube = run(worldFrom(['#~#..#', '#~#..#', '#~#..#', '#~#..#', '#~#..#', '#~#..#', '#~~~~#', '######']), 200);
  const press = tube.signals.press;
  for (let y = 4; y <= 6; y++) {
    assert.ok(press[y * 6 + 1] > 1, `row ${y} is pressed`);
    assert.ok(Math.abs(press[y * 6 + 1] - press[y * 6 + 3]) < 1e-6 && Math.abs(press[y * 6 + 3] - press[y * 6 + 4]) < 1e-6, `row ${y}: ${press[y * 6 + 1]}, ${press[y * 6 + 3]}, ${press[y * 6 + 4]}`);
    if (y > 4) assert.ok(Math.abs(press[y * 6 + 1] - press[(y - 1) * 6 + 1] - 1) < 1e-6, 'one more for each cell deeper');
  }
  // ...and a sealed tank that is full reads "just full" everywhere: nothing stands over it.
  const sealed = run(worldFrom(['#####', '#~~~#', '#~~~#', '#~~~#', '#####']), 5);
  for (const index of [6, 7, 8, 11, 12, 13, 16, 17, 18]) assert.equal(sealed.signals.press[index], 1);
});

test('levelling never turns back (no sloshing), and it stops', () => {
  const pictures = {
    'a U-tube': [['#~#.#', '#~#.#', '#~#.#', '#~#.#', '#~#.#', '#~#.#', '#~~~#', '#####'], [1, 3]],
    'wide and narrow': [['#~~~~#.#', '#~~~~#.#', '#~~~~#.#', '#~~~~#.#', '#~~~~#.#', '#~~~~#.#', '#~~~~ppp', '########'], [1, 6]],
    'narrow and wide': [['#~#....#', '#~#....#', '#~#....#', '#~#....#', '#~#....#', '#~#....#', '#~#....#', '#~.....#', '########'], [1]],
    'three arms': [['#~#.#.#', '#~#.#.#', '#~#.#.#', '#~#.#.#', '#~#.#.#', '#~#.#.#', '#~ppppp', '#######'], [1, 3, 5]],
  };
  for (const [name, [rows, arms]] of Object.entries(pictures)) {
    const world = worldFrom(rows);
    const way = arms.map(() => 0);
    let last = arms.map((x) => column(world, x, 0, rows.length - 3));
    let moved = Infinity;
    for (let i = 0; i < 120; i++) {
      moved = stepFluids(world, blockInfo).moved;
      const now = arms.map((x) => column(world, x, 0, rows.length - 3));
      arms.forEach((x, k) => {
        const change = Math.abs(now[k] - last[k]) < 1e-7 ? 0 : Math.sign(now[k] - last[k]);
        assert.ok(!(change && way[k] && change !== way[k]), `${name}: the arm at column ${x} turned back at tick ${i} (${last[k]} → ${now[k]})`);
        if (change) way[k] = change;
      });
      last = now;
      if (i === 60) assert.ok(moved < 0.001, `${name}: still moving ${moved} a tick after 60 ticks`);
    }
    assert.ok(moved < 1e-6, `${name}: still moving ${moved} a tick after 120 ticks`);
  }
});

test('a long pipe is slower than a short one, and both are level within 40 ticks', () => {
  /**
   * How far from level two 5-tall arms joined by a pipe are, after some ticks.
   * @param {number} length - how many cells of pipe between the arms
   * @param {number} ticks - how long to run
   * @returns {number} the difference between the arms' water
   */
  const apart = (length, ticks) => {
    const rows = [];
    for (let y = 0; y < 5; y++) rows.push(`#~${'#'.repeat(length)}.#`);
    rows.push(`#~${'p'.repeat(length)}.#`, '#'.repeat(length + 4));
    const world = run(worldFrom(rows), ticks);
    return Math.abs(column(world, 1, 0, 5) - column(world, length + 2, 0, 5));
  };
  assert.ok(apart(22, 6) > apart(2, 6) + 0.2, `after 6 ticks: long ${apart(22, 6)}, short ${apart(2, 6)}`);
  assert.ok(apart(2, 40) < 0.05, `short: ${apart(2, 40)}`);
  assert.ok(apart(22, 40) < 0.05, `long: ${apart(22, 40)}`);
});

test('a stack of water falls together', () => {
  const world = worldFrom(['#~#', '#~#', '#~#', '#~#', '#.#', '#.#', '#.#', '###']);
  smallStep(world);
  // One small step: every cell of the stack has moved down one. It is still
  // one stack with no gaps in it (only its top is a little short: the weight
  // of the stack has pushed a bit out of the bottom already). None is lost.
  assert.equal(getFluid(world, 'water', 1, 0), 0);
  for (let y = 2; y <= 4; y++) assert.ok(Math.abs(getFluid(world, 'water', 1, y) - 1) < 1e-12, `row ${y} holds ${getFluid(world, 'water', 1, y)}`);
  assert.ok(getFluid(world, 'water', 1, 1) > 0.8);
  assert.ok(Math.abs(total(world, 'water') - 4) < 1e-12);
  run(world, 20);
  for (let y = 0; y < 7; y++) assert.ok(Math.abs(getFluid(world, 'water', 1, y) - (y >= 3 ? 1 : 0)) < 1e-9, `row ${y}`);
});

test('a hole squirts harder the deeper it is, and with no pressure it is just spreading', () => {
  /**
   * How much water comes out of a hole at the foot of a tower in 4 ticks.
   * @param {number} depth - how many cells of water stand in the tower
   * @returns {number} the water outside
   */
  const squirted = (depth) => {
    const rows = [];
    for (let y = 0; y < depth - 1; y++) rows.push('#~~~#.....');
    rows.push('#~~~......', '##########');
    const world = run(worldFrom(rows), 4);
    let out = 0;
    for (let y = 0; y < depth; y++) for (let x = 4; x < 10; x++) out += getFluid(world, 'water', x, y);
    return out;
  };
  const amounts = [2, 5, 9].map(squirted);
  assert.ok(amounts[1] > amounts[0] + 0.1 && amounts[2] > amounts[1] + 0.1, `${amounts}`);
  // A full cell with nothing standing on it has no pressure: it spreads a quarter of the difference, as ever.
  const puddle = worldFrom(['#~.#', '####']);
  smallStep(puddle);
  assert.ok(Math.abs(getFluid(puddle, 'water', 2, 0) - 0.25) < 1e-12, `it gave ${getFluid(puddle, 'water', 2, 0)}`);
  // Pressure adds to that: SQUIRT_EASE for each cell of pressure (here there are 2 cells of water on top).
  const pressed = worldFrom(['#~~~#.', '#~~~#.', '#~~~..', '######']);
  smallStep(pressed);
  const out = getFluid(pressed, 'water', 4, 2);
  assert.ok(out > 0.25 + SQUIRT_EASE && out <= 0.25 + 2 * SQUIRT_EASE + 1e-12, `it gave ${out}`);
  // A hole is the narrow place: that is the most that gets through it, however
  // much water is in the cell outside already (and with some there, it is all of it:
  // the hole is not held back by what stands outside it).
  for (const outside of [0.2, 0.5, 0.7]) {
    const puddled = worldFrom(['#~~~#.', '#~~~#.', '#~~~.#', '######']);
    setFluid(puddled, 'water', 4, 2, outside);
    smallStep(puddled);
    const through = getFluid(puddled, 'water', 4, 2) - outside;
    assert.ok(through <= 0.25 + 2 * SQUIRT_EASE + 1e-12, `with ${outside} outside it gave ${through}`);
    if (outside >= 0.5) assert.ok(through > 0.25 + SQUIRT_EASE || getFluid(puddled, 'water', 4, 2) >= FULL - FULL_SLACK, `with ${outside} outside it gave ${through}`);
  }
});

/**
 * A tower with a pipe from its foot to a water wheel that has stone
 * over and under it, and then a free fall into a pit.
 * @param {number} depth - how deep the tower is
 * @param {number} wide - how wide the tower is
 * @param {number} length - how many cells of pipe
 * @param {boolean} middle - put the wheel in the MIDDLE of the pipe instead of at its end
 * @returns {string[]} the picture
 */
function nozzleScene(depth, wide, length, middle) {
  const across = wide + length + 5;
  /**
   * Fill a row out to the full width, with a wall at the far end.
   * @param {string} start - the left part of the row
   * @returns {string} the whole row
   */
  const pad = (start) => `${start.padEnd(across - 1, '.')}#`;
  const rows = [];
  for (let y = 0; y < depth - 1; y++) rows.push(pad(`#${'~'.repeat(wide)}#`));
  rows.push(pad(`#${'~'.repeat(wide)}${'#'.repeat(length + 1)}`));
  const half = Math.floor(length / 2);
  rows.push(pad(`#${'~'.repeat(wide)}${middle ? `${'p'.repeat(half)}o${'p'.repeat(length - half)}` : `${'p'.repeat(length)}o`}`));
  for (let k = 0; k < 8; k++) rows.push(pad('#'.repeat(wide + length + 2)));
  rows.push('#'.repeat(across));
  return rows;
}

/**
 * Run a nozzle scene for 2 ticks and say how much energy each bit of
 * water gave the wheel on the second tick (its "fall": work ÷ flow).
 * @param {string[]} rows - from nozzleScene
 * @returns {{fall: number, flow: number, head: number}} the wheel's fall and flow, and the head left in the tower
 */
function nozzle(rows) {
  const world = worldFrom(rows);
  const at = world.cells.indexOf('waterWheel');
  stepFluids(world, blockInfo);
  const head = column(world, 1, 0, rows.length - 1) - 0.5; // how high the water stands over the middle of the pipe
  const wheel = stepFluids(world, blockInfo).wheels.get(at);
  return { fall: wheel.work / wheel.gross, flow: wheel.gross, head };
}

test('a spout is a nozzle: a wheel at the end of a pipe from a tall tank gets most of the head, a wheel inside the pipe hardly any', () => {
  const low = nozzle(nozzleScene(6, 3, 2, false));
  const high = nozzle(nozzleScene(10, 3, 2, false));
  assert.ok(low.fall > 0.5 * low.head, `6 deep: fall ${low.fall} of head ${low.head}`);
  assert.ok(high.fall > 0.5 * high.head, `10 deep: fall ${high.fall} of head ${high.head}`);
  assert.ok(low.fall <= low.head && high.fall <= high.head, 'never more than the head there is');
  assert.ok(high.fall > low.fall + 1 && high.flow > low.flow, 'a taller tower: more push for each bit of water, and more water');
  const inside = nozzle(nozzleScene(6, 3, 8, true));
  assert.ok(inside.fall < 0.2 * inside.head, `in the middle of a pipe: fall ${inside.fall} of head ${inside.head}`);
  assert.ok(inside.fall > 0, 'but it does get the little its own two links rub away');
});

test('air with room in it is not pressed: water squirting out of a spout does not push on through the air', () => {
  // A tower, a short pipe, and open air beyond the spout.
  const world = worldFrom(['#~#.....', '#~#.....', '#~#.....', '#~#.....', '#~#.....', '#~pp....', '########']);
  for (let i = 0; i < 30; i++) {
    stepFluids(world, blockInfo);
    for (let y = 0; y < 6; y++) {
      for (let x = 4; x < 8; x++) {
        // Outside, a cell is only pressed by water really standing on it: never more than its depth.
        let over = 0;
        for (let up = y; up >= 0 && getFluid(world, 'water', x, up) > 0; up--) over += 1;
        assert.ok(world.signals.press[y * 8 + x] <= over + 1e-9, `tick ${i}: the air at ${x},${y} reads ${world.signals.press[y * 8 + x]} under ${over} cells of water`);
      }
    }
  }
  // A cell that fills right up is different: the push goes straight on down a pipe that was only nearly full.
  const lidded = worldFrom(['#~######', '#~######', '#~######', '#~######', '#~######', '#~pppp..', '########']);
  for (let x = 2; x <= 5; x++) setFluid(lidded, 'water', x, 5, 0.99);
  stepFluids(lidded, blockInfo);
  assert.ok(getFluid(lidded, 'water', 6, 5) > 0.5, `only ${getFluid(lidded, 'water', 6, 5)} came out of the far end in the first tick`);
});

test('the top of the world is open sky: a tower built right up to it drains through a hole at its foot, at once', () => {
  const world = worldFrom(['#~#...', '#~#...', '#~#...', '#~....', '######']);
  stepFluids(world, blockInfo);
  assert.ok(getFluid(world, 'water', 1, 0) < 0.9, `the top cell still holds ${getFluid(world, 'water', 1, 0)}`);
  run(world, 200);
  assert.ok(getFluid(world, 'water', 1, 1) < 0.01, 'the tower emptied into the yard');
  assert.ok(Math.abs(total(world, 'water') - 4) < 1e-9);
  // A world brim full of water under the open sky just stands there.
  const full = worldFrom(['~~~', '~~~', '~~~']);
  assert.equal(stepFluids(full, blockInfo).moved, 0);
});

test('a pump does not suck: it takes the water right behind it, and no more', () => {
  // A pump on top of one sealed full cell empties that cell and then moves nothing.
  const sealed = worldFrom(['#.#', '#.#', '#^#', '#~#', '###']);
  powerPumps(sealed, 1);
  run(sealed, 200);
  assert.ok(getFluid(sealed, 'water', 1, 3) < 1e-6, `the cell under the pump still holds ${getFluid(sealed, 'water', 1, 3)}`);
  assert.equal(stepFluids(sealed, blockInfo).moved, 0);
  // A pump over a 3-deep well lifts only the top cell: the rest can't follow it up.
  const well = worldFrom(['#...#', '#...#', '##^##', '##~##', '##~##', '##~##', '#####']);
  powerPumps(well, 1);
  run(well, 300);
  assert.ok(getFluid(well, 'water', 2, 3) < 1e-6);
  assert.ok(Math.abs(column(well, 2, 4, 5) - 2) < 1e-6, `the well still holds ${column(well, 2, 4, 5)} below its top cell`);
  // A pump at the foot of a deep open tank is HELPED by the depth: it lifts higher than one over a puddle.
  /**
   * How high one battery lifts water up a shaft, from a tank this deep.
   * @param {number} depth - how deep the tank beside the pump is
   * @returns {number} how much water ends up standing in the shaft
   */
  const lifted = (depth) => {
    const rows = [];
    for (let y = 0; y < 11; y++) rows.push(`${y >= 12 - depth ? '#~~~#' : '#...#'}.#`);
    rows.push(`${depth > 1 ? '#~~~#' : '#...#'}^#`, '#~~~~~#', '#######');
    const world = worldFrom(rows);
    powerPumps(world, 1);
    run(world, 1500);
    return column(world, 5, 0, 10);
  };
  const shallow = lifted(1);
  const deep = lifted(5);
  assert.ok(deep > shallow + 3, `from a puddle ${shallow}, from a deep tank ${deep}`);
});

test('a pump drives a sealed full ring of pipe round and round, and the wheels in it get no more than the pump gives', () => {
  const ring = ['#######', '#ppopp#', '#p###p#', '#u###o#', '#p###p#', '#ppopp#', '#######'];
  const upsideDown = [...ring].reverse().map((row) => row.replaceAll('u', 'd'));
  for (const rows of [ring, mirrored(ring), upsideDown, mirrored(upsideDown)]) {
    const world = worldFrom(rows);
    powerPumps(world, 2);
    const before = Float64Array.from(world.fluid.water);
    const through = new Float64Array(world.cells.length); // how much water went through each wheel
    let credited = 0;
    let pumped = 0;
    for (let i = 0; i < 100; i++) {
      const step = stepFluids(world, blockInfo);
      pumped += step.pumpWork;
      for (const [index, wheel] of step.wheels) {
        credited += wheel.work;
        through[index] += wheel.gross;
      }
      assert.ok(credited <= pumped + 1e-9, `${rows.join('/')} tick ${i}: wheels got ${credited}, the pump gave ${pumped}`);
      for (let index = 0; index < before.length; index++) assert.ok(Math.abs(world.fluid.water[index] - before[index]) < 1e-9, `tick ${i}: cell ${index} changed`);
    }
    assert.ok(pumped > 0.1, `the pump did ${pumped} of work`);
    assert.ok(credited > 0.01, `the wheels got ${credited}`);
    // Every wheel, all the way round the ring, had the same water go through it.
    const flows = [...world.cells.keys()].filter((index) => world.cells[index] === 'waterWheel').map((index) => through[index]);
    assert.equal(flows.length, 3);
    for (const flow of flows) assert.ok(flow > 1 && Math.abs(flow - flows[0]) < 1e-9, `flows ${flows}`);
  }
});

test('a pump that is switched off holds pressure back; a plain pipe lets it through', () => {
  const rows = ['#~#.#', '#~#.#', '#~#.#', '#~#.#', '#~#.#', '#~#.#', '#~>.#', '#####'];
  const off = run(worldFrom(rows), 300);
  // The water behind the pump never rises above the pump's own row.
  assert.ok(column(off, 3, 0, 5) < 1e-9, `water rose ${column(off, 3, 0, 5)} past a pump that is off`);
  // Not a drop has got past it: a pump that is off is a shut door.
  assert.equal(column(off, 1, 0, 6), 7);
  assert.equal(column(off, 2, 6, 6) + column(off, 3, 0, 6), 0);
  assert.ok(Math.abs(total(off, 'water') - 7) < 1e-9);
  const open = run(worldFrom(rows.map((row) => row.replace('>', 'P'))), 300);
  assert.ok(Math.abs(column(open, 1, 0, 6) - column(open, 3, 0, 6)) < 0.01, `tower ${column(open, 1, 0, 6)}, riser ${column(open, 3, 0, 6)}`);
  // Switched on, it lets the tower's water through too (and pushes it higher than the tower).
  const on = worldFrom(rows);
  powerPumps(on, 1);
  run(on, 300);
  assert.ok(column(on, 3, 0, 6) > column(on, 1, 0, 6) + 1, `tower ${column(on, 1, 0, 6)}, riser ${column(on, 3, 0, 6)}`);
});

test('pressed water counts the same in a mirrored world: the flow the other way, the energy just the same', () => {
  const pictures = [
    ['#~~#......', '#~~#......', '#~~#......', '#~~#......', '#~~ppo....', '####.#....', '####......', '##########'],
    ['#~#.#', '#~#.#', '#~#.#', '#~#.#', '#~o.#', '#####'],
    ['#~~#...', '#~~#...', '#~~#.o.', '#~~>po.', '#######'],
  ];
  for (const rows of pictures) {
    const world = worldFrom(rows);
    const mirror = worldFrom(mirrored(rows));
    powerPumps(world, 2);
    powerPumps(mirror, 2);
    for (let i = 0; i < 40; i++) {
      const a = stepFluids(world, blockInfo);
      const b = stepFluids(mirror, blockInfo);
      assert.ok(Math.abs(a.pumpWork - b.pumpWork) < 1e-12);
      for (let index = 0; index < world.cells.length; index++) {
        const other = index - (index % world.width) + world.width - 1 - (index % world.width);
        assert.ok(Math.abs(world.fluid.water[index] - mirror.fluid.water[other]) < 1e-12, `${rows.join('/')} tick ${i}: cell ${index}`);
        assert.ok(Math.abs(world.signals.press[index] - mirror.signals.press[other]) < 1e-9, `${rows.join('/')} tick ${i}: pressure at ${index}`);
        const one = a.wheels.get(index);
        if (!one) continue;
        const two = b.wheels.get(other);
        const what = `${rows.join('/')} tick ${i}: ${JSON.stringify(one)} and ${JSON.stringify(two)}`;
        assert.ok(Math.abs(one.lean + two.lean) < 1e-12, what);
        assert.ok(Math.abs(one.sideOut + two.sideOut) < 1e-12, what);
        assert.ok(Math.abs(one.down - two.down) < 1e-12, what);
        assert.ok(Math.abs(one.gross - two.gross) < 1e-12, what);
        assert.ok(Math.abs(one.work - two.work) < 1e-12, what);
      }
    }
  }
});

test('still water costs nothing: a settled pond, a sealed full tank and a brim-full world are never solved', () => {
  const pond = run(worldFrom(['#......#', '#~~~~..#', '#~~~~~~#', '#~~#~~~#', '########']), 400);
  const tube = run(worldFrom(['#~#.#', '#~#.#', '#~#.#', '#~#.#', '#~~~#', '#####']), 400);
  const sealed = worldFrom(['######', '#~~~~#', '#~pp~#', '#~~~~#', '######']);
  const brim = worldFrom(['~~~~~~', '~~~~~~', '~~#~~~', '~~~~~~']);
  const tall = createWorld(24, 14);
  tall.fluid.water.fill(1);
  for (const world of [pond, tube, sealed, brim, tall]) {
    const before = pressWork.solves;
    const water = Float64Array.from(world.fluid.water);
    for (let i = 0; i < 10; i++) assert.equal(stepFluids(world, blockInfo).moved, 0);
    assert.equal(pressWork.solves, before);
    assert.deepEqual(world.fluid.water, water);
  }
  // Moving water IS solved (so the counter really counts).
  const before = pressWork.solves;
  run(worldFrom(['#~#.#', '#~#.#', '#~#.#', '#~~~#', '#####']), 3);
  assert.ok(pressWork.solves > before && pressWork.points > 0);
});

/**
 * Write amounts of water into one column of a world, top to bottom.
 * @param {object} world - the world
 * @param {number} x - the column
 * @param {number} top - the row of the first amount
 * @param {number[]} amounts - the amounts
 * @returns {void}
 */
function writeColumn(world, x, top, amounts) {
  amounts.forEach((amount, k) => setFluid(world, 'water', x, top + k, amount));
}

test('makeRoom finds room for water that does not fit (an old save, with deep water squashed into fewer cells)', () => {
  // An open shaft: ten cells' worth, squashed into 8 (as the old game held them).
  const shaftRows = [];
  for (let y = 0; y < 14; y++) shaftRows.push('#.#');
  shaftRows.push('###');
  const shaft = worldFrom(shaftRows);
  writeColumn(shaft, 1, 6, [0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6]);
  assert.equal(makeRoom(shaft, blockInfo), 0);
  assert.ok(Math.abs(total(shaft, 'water') - 10) < 1e-12, 'all of it is still there');
  assert.ok(Math.max(...shaft.fluid.water) <= FULL);
  // It stands as tall as its amount now: ten cells, from the floor up.
  for (let y = 0; y < 14; y++) assert.ok(Math.abs(getFluid(shaft, 'water', 1, y) - (y >= 4 ? 1 : 0)) < 1e-9, `row ${y} holds ${getFluid(shaft, 'water', 1, y)}`);
  // A second look finds nothing to do.
  const after = Float64Array.from(shaft.fluid.water);
  assert.equal(makeRoom(shaft, blockInfo), 0);
  assert.deepEqual(shaft.fluid.water, after);

  // A tank 4 wide: the extra comes back out on top, shared alike, so it stays level.
  const tank = worldFrom(['#....#', '#....#', '#....#', '#....#', '#....#', '#....#', '#....#', '######']);
  for (let x = 1; x <= 4; x++) writeColumn(tank, x, 3, [0.602, 1.1, 1.2, 1.3]);
  const tankHad = total(tank, 'water');
  assert.equal(makeRoom(tank, blockInfo), 0);
  assert.ok(Math.abs(total(tank, 'water') - tankHad) < 1e-12);
  assert.ok(Math.max(...tank.fluid.water) <= FULL);
  for (let y = 0; y < 7; y++) for (let x = 2; x <= 4; x++) assert.ok(Math.abs(getFluid(tank, 'water', x, y) - getFluid(tank, 'water', 1, y)) < 1e-12, `row ${y} is level`);

  // A U-tube: both arms get their water back.
  const tube = worldFrom(['#.#.#', '#.#.#', '#.#.#', '#.#.#', '#.#.#', '#.#.#', '#...#', '#####']);
  for (const x of [1, 3]) writeColumn(tube, x, 3, [0.7, 1.1, 1.2, 1.3]);
  setFluid(tube, 'water', 2, 6, 1.35);
  const tubeHad = total(tube, 'water');
  assert.equal(makeRoom(tube, blockInfo), 0);
  assert.ok(Math.abs(total(tube, 'water') - tubeHad) < 1e-12);
  assert.ok(Math.max(...tube.fluid.water) <= FULL);
  assert.ok(Math.abs(column(tube, 1, 0, 6) - column(tube, 3, 0, 6)) < 1e-12);

  // A shaft with a lid, crammed full the old way: there is no room anywhere, so
  // the extra (which the old picture never drew) is dropped, and we are told how much.
  const lidded = worldFrom(['###', '#.#', '#.#', '#.#', '#.#', '#.#', '#.#', '###']);
  writeColumn(lidded, 1, 1, [1, 1.1, 1.2, 1.3, 1.4, 1.5]);
  assert.ok(Math.abs(makeRoom(lidded, blockInfo) - 1.5) < 1e-12);
  assert.ok(Math.abs(total(lidded, 'water') - 6) < 1e-12);

  // Extra never crosses a wall into a tank it was not in.
  const two = worldFrom(['###...#', '#.#...#', '#.#...#', '#######']);
  writeColumn(two, 1, 1, [1.2, 1.4]);
  assert.ok(Math.abs(makeRoom(two, blockInfo) - 0.6) < 1e-12);
  assert.equal(column(two, 4, 0, 2), 0);

  // A mirrored world gets the mirrored answer.
  const lop = ['#......#', '#.#....#', '#.#..#.#', '#......#', '########'];
  const one = worldFrom(lop);
  const other = worldFrom(mirrored(lop));
  [[1, 3, 1.7], [2, 3, 1.3], [3, 3, 1.9], [4, 3, 0.4], [1, 2, 1.2], [6, 3, 1.1]].forEach(([x, y, amount]) => {
    setFluid(one, 'water', x, y, amount);
    setFluid(other, 'water', 7 - x, y, amount);
  });
  makeRoom(one, blockInfo);
  makeRoom(other, blockInfo);
  for (let y = 0; y < 5; y++) for (let x = 0; x < 8; x++) assert.ok(Math.abs(getFluid(one, 'water', x, y) - getFluid(other, 'water', 7 - x, y)) < 1e-12, `${x},${y}`);
  assert.ok(Math.max(...one.fluid.water) <= FULL);
});

test('stepFluids gives over-full water room by itself, and steam may stay squeezed', () => {
  const world = worldFrom(['#.#', '#.#', '#.#', '#.#', '###']);
  writeColumn(world, 1, 1, [1, 1.3, 1.6]);
  setFluid(world, 'steam', 1, 0, 1.4);
  stepFluids(world, blockInfo);
  assert.ok(Math.max(...world.fluid.water) <= FULL + 1e-9);
  assert.ok(Math.abs(total(world, 'water') - 3.9) < 1e-9);
  assert.ok(Math.abs(total(world, 'steam') - 1.4) < 1e-9);
});

test('a chiller never over-fills a cell: steam bubbling through a full tank under a chiller', () => {
  const world = worldFrom(['#C#', '#~#', '#~#', '#~#', '###']);
  for (let y = 1; y <= 3; y++) setFluid(world, 'steam', 1, y, 1);
  const both = total(world, 'water') + total(world, 'steam');
  for (let i = 0; i < 200; i++) {
    stepFluids(world, blockInfo);
    assert.ok(Math.max(...world.fluid.water) <= FULL + 1e-9, `tick ${i}: a cell holds ${Math.max(...world.fluid.water)} of water`);
    assert.ok(Math.abs(total(world, 'water') + total(world, 'steam') - both) < 1e-9, `tick ${i}: water and steam together changed`);
  }
  // With the tank full, the steam has to stay steam.
  assert.ok(total(world, 'steam') > 2.9);
  // With room for it, the chiller does make water.
  const roomy = worldFrom(['#C#', '#s#', '#~#', '###']);
  run(roomy, 100);
  assert.ok(total(roomy, 'water') > 1.9, `water ${total(roomy, 'water')}`);
});

test('in lots of random worlds with pumps, wheels get no more than the water gave up plus what the pumps put in', () => {
  const random = randomFrom(21);
  const names = ['stone', 'stone', 'pipe', 'pipe', 'pipe', 'waterWheel', 'waterWheel', 'valveOpen', 'pumpUp', 'pumpUp', 'pumpDown', 'pumpLeft', 'pumpRight'];
  for (let trial = 0; trial < 60; trial++) {
    const world = createWorld(5 + Math.floor(random() * 8), 4 + Math.floor(random() * 8));
    world.cells.forEach((_, index) => {
      const x = index % world.width;
      const y = Math.floor(index / world.width);
      if (random() < 0.4) setBlock(world, x, y, names[Math.floor(random() * names.length)]);
      if (openSides(world, x, y, blockInfo).length > 0 && random() < 0.6) world.fluid.water[index] = random() < 0.6 ? 1 : random();
    });
    const pumps = powerPumps(world, 1);
    for (const record of pumps.values()) record.current = REFERENCE_CURRENT * [0.3, 1, 1, 2, 3.5][Math.floor(random() * 5)];
    const water = total(world, 'water');
    const start = waterEnergy(world);
    let last = start;
    let credited = 0;
    let pumped = 0;
    for (let i = 0; i < 120; i++) {
      if (random() < 0.02) for (const record of pumps.values()) record.current = REFERENCE_CURRENT * [0, 0.3, 1, 2, 3.5][Math.floor(random() * 5)];
      let electricity = 0;
      for (const record of pumps.values()) electricity += record.current ** 2;
      const step = stepFluids(world, blockInfo);
      for (const work of step.waterWork.values()) credited += work;
      pumped += step.pumpWork;
      const now = waterEnergy(world);
      const carried = world.signals.falling.reduce((sum, push) => sum + push, 0);
      const what = `world ${trial} tick ${i}`;
      assert.ok(now - last <= step.pumpWork + 1e-9, `${what}: the water gained ${now - last}, the pumps gave ${step.pumpWork}`);
      assert.ok(DROP_POWER * step.pumpWork <= 0.9 * electricity + 1e-9, `${what}: pump work ${DROP_POWER * step.pumpWork}, electricity ${electricity}`);
      assert.ok(credited + carried <= start - now + pumped + 1e-9, `${what}: credited ${credited} + carried ${carried}, gave up ${start - now}, pumped ${pumped}`);
      last = now;
    }
    assert.ok(Math.abs(total(world, 'water') - water) < 1e-9, `world ${trial}: water ${water} → ${total(world, 'water')}`);
  }
  // And in all the worlds of this file, the water circuit always settled.
  assert.equal(pressWork.stuck, 0);
});

test('a pump that is switched off is a shut door: a tank does not run out through it, sideways or down', () => {
  // A dead pump in a tank's wall, with open floor beyond; and one in a tank's floor.
  const wall = ['#~~~#....', '#~~~#....', '#~~~#....', '#~~~#....', '#~~~>....', '#########'];
  const floor = ['#~~~#', '#~~~#', '#~~~#', '##v##', '#...#', '#...#', '#...#', '#####'];
  for (const [rows, inside, held] of [[wall, [1, 3, 0, 4], 15], [mirrored(wall), [5, 7, 0, 4], 15], [floor, [1, 3, 0, 2], 9]]) {
    const world = run(worldFrom(rows), 100);
    let kept = 0;
    for (let x = inside[0]; x <= inside[1]; x++) kept += column(world, x, inside[2], inside[3]);
    assert.equal(kept, held, `${rows[rows.length - 2]}: the tank holds ${kept} of ${held}`);
    // Switched on, the same pump lets the tank run out, and never faster than the pump's own law.
    const on = worldFrom(rows);
    powerPumps(on, 1);
    let before = held;
    for (let tick = 0; tick < 100; tick++) {
      stepFluids(on, blockInfo);
      let now = 0;
      for (let x = inside[0]; x <= inside[1]; x++) now += column(on, x, inside[2], inside[3]);
      // (The lift is downhill: at most the whole tank's depth, and a cell or two more.)
      assert.ok(before - now <= pumpAmount(1, -8) + 1e-9, `tick ${tick}: ${before - now} went through in one tick`);
      before = now;
    }
    assert.ok(before < held - 2, `only ${held - before} went through the running pump`);
    assert.ok(Math.abs(total(on, 'water') - held) < 1e-9);
  }
  // And a U-tube with a dead pump for its bend does not level: with the pump on it does (and more).
  const tube = ['#~#.#', '#~#.#', '#~#.#', '#~#.#', '#~>~#', '#####'];
  const off = run(worldFrom(tube), 100);
  assert.equal(column(off, 1, 0, 4), 5);
  assert.equal(column(off, 3, 0, 4), 1);
});

test('steam does not get through a pump either', () => {
  const world = run(worldFrom(['#.#', '#^#', '#s#', '###']), 50);
  assert.equal(getFluid(world, 'steam', 1, 0) + getFluid(world, 'steam', 1, 1), 0);
  assert.ok(Math.abs(total(world, 'steam') - 1) < 1e-12);
});

test('water left inside a pump (an old save, or a pump built into a pond) runs out of its front, and nothing gets in', () => {
  const world = worldFrom(['#~r.#', '###.#', '###.#', '#####']);
  run(world, 200);
  assert.ok(getFluid(world, 'water', 2, 0) < 0.001, `the pump still holds ${getFluid(world, 'water', 2, 0)}`);
  assert.equal(getFluid(world, 'water', 1, 0), 1);
  assert.ok(Math.abs(getFluid(world, 'water', 3, 2) - 1) < 0.001);
  assert.ok(Math.abs(total(world, 'water') - 2) < 1e-12);
});

test('pumps in a row work as one taller pump: two lift about twice as high as one, and no faster on the level', () => {
  /**
   * How much water ends up over the pumps, with one battery's worth each.
   * @param {string[]} pumps - the pump rows
   * @returns {{lifted: number, world: object}} the water above the pumps, and the world
   */
  const lift = (pumps) => {
    const wall = '#'.repeat(8);
    const world = worldFrom([...Array(16).fill(`${wall}.${wall}`), ...pumps.map((pump) => `${wall}${pump}${wall}`), '~'.repeat(17), '~'.repeat(17), '#'.repeat(17)]);
    powerPumps(world, 1);
    const height = world.height;
    for (let tick = 0; tick < 1500; tick++) {
      const electricity = pumps.length * REFERENCE_CURRENT ** 2; // current² × resistance (1), for each pump
      const { pumpWork } = stepFluids(world, blockInfo);
      assert.ok(DROP_POWER * pumpWork <= 0.9 * electricity + 1e-9, `tick ${tick}: the pumps did ${DROP_POWER * pumpWork} of work with ${electricity} of electricity`);
    }
    assert.ok(Math.abs(total(world, 'water') - 34) < 1e-9);
    return { lifted: column(world, 8, 0, height - 4 - pumps.length), world };
  };
  const one = lift(['^']).lifted;
  const two = lift(['^', '^']).lifted;
  const three = lift(['^', '^', '^']).lifted;
  assert.ok(one > 3.5 && one < PUMP_HEAD, `one pump lifted ${one}`);
  assert.ok(two > one + 3.5 && two < 2 * PUMP_HEAD, `two pumps lifted ${two}, one lifted ${one}`);
  assert.ok(three > two + 3.5 && three < 3 * PUMP_HEAD, `three pumps lifted ${three}, two lifted ${two}`);
  // The list: one entry for the row, with the pushes added up.
  const world = worldFrom(['#~>>>.#', '#######']);
  powerPumps(world, 2);
  const sides = allOpenSides(world, blockInfo);
  assert.deepEqual(workingPumps(world, blockInfo, sides), [{ index: 2, back: 1, ahead: 5, level: 6, count: 3 }]);
  // On the level a row moves what one pump moves (the water has to get through them all)...
  stepFluids(world, blockInfo);
  const single = worldFrom(['#~>.#', '#####']);
  powerPumps(single, 2);
  stepFluids(single, blockInfo);
  assert.ok(Math.abs(getFluid(world, 'water', 5, 0) - getFluid(single, 'water', 3, 0)) < 1e-12);
  assert.ok(getFluid(single, 'water', 3, 0) > 0.05);
  // ...one pump of the row switched off shuts the whole row, and so do two pumps nose to nose.
  const broken = worldFrom(['#~>>>.#', '#######']);
  powerPumps(broken, 1).get(3).current = 0;
  assert.deepEqual(workingPumps(broken, blockInfo, allOpenSides(broken, blockInfo)), []);
  run(broken, 50);
  assert.equal(getFluid(broken, 'water', 1, 0), 1);
  const clash = worldFrom(['#~><~#', '######']);
  powerPumps(clash, 1);
  assert.deepEqual(workingPumps(clash, blockInfo, allOpenSides(clash, blockInfo)), []);
});

/**
 * All the push that falling water is still carrying (see stepFluids).
 * @param {object} world - the world
 * @returns {number} the total
 */
const carriedPush = (world) => (world.signals.falling ?? []).reduce((sum, push) => sum + push, 0);

test('a cell\'s carried push is handed out once: the shares of its water that move away in one small step never add up to more than 1', () => {
  // The start of the 1.5× bug: water that fell AND then spread had its second
  // share measured against the little that was left, not against what it began with.
  const random = randomFrom(3);
  let most = 0;
  for (let trial = 0; trial < 60; trial++) {
    const world = createWorld(4 + Math.floor(random() * 10), 4 + Math.floor(random() * 8));
    world.cells.forEach((_, index) => {
      const pick = random();
      setBlock(world, index % world.width, Math.floor(index / world.width), pick < 0.2 ? 'stone' : pick < 0.3 ? 'waterWheel' : pick < 0.35 ? 'pipe' : 'air');
      if (world.cells[index] !== 'stone' && random() < 0.5) world.fluid.water[index] = random() < 0.6 ? 1 : random();
    });
    const table = flowTable(world, allOpenSides(world, blockInfo), blockInfo);
    for (let step = 0; step < 200; step++) {
      const shares = new Map();
      flowWater(world, table, (from, to, amount, energy, drop, part, pressed) => {
        if (pressed) assert.equal(part, 0);
        assert.ok(part >= 0 && part <= 1);
        shares.set(from, (shares.get(from) ?? 0) + part);
      });
      for (const [cell, share] of shares) {
        most = Math.max(most, share);
        assert.ok(share <= 1 + 1e-9, `world ${trial}, small step ${step}, cell ${cell}: shares add up to ${share}`);
      }
    }
  }
  assert.ok(most > 0.9, 'some cell should have given nearly all its water away');
});

test('one cellful dropped down a shaft onto three water wheels: together they get no more than the water lost', () => {
  for (const [fall, puddle] of [[10, 0.01], [10, 0.3], [5, 0.01], [12, 0.05]]) {
    // A wheel on each side of where the water lands, and one underneath holding a small puddle.
    const world = worldFrom([...Array(fall).fill('#.#'), 'O.O', '#O#', '###']);
    setFluid(world, 'water', 1, 0, 1);
    setFluid(world, 'water', 1, fall + 1, puddle);
    const start = waterEnergy(world);
    let credited = 0;
    for (let tick = 0; tick < 200; tick++) {
      const before = waterEnergy(world) + carriedPush(world);
      let now = 0;
      for (const work of stepFluids(world, blockInfo).waterWork.values()) now += work;
      credited += now;
      const lost = before - (waterEnergy(world) + carriedPush(world));
      assert.ok(now <= lost + 1e-9, `fall ${fall}, tick ${tick}: the wheels got ${now}, the water lost ${lost}`);
    }
    const lost = start - waterEnergy(world);
    assert.ok(credited <= lost + 1e-9, `fall ${fall}: the wheels got ${credited}, the water lost ${lost}`);
    // (And most of it does reach them: a taller fall is a stronger one.)
    assert.ok(credited > 0.8 * lost, `fall ${fall}: the wheels got only ${credited} of ${lost}`);
  }
});

test('a steady waterfall onto three water wheels, for ever: in every tick the wheels get no more than the water lost', () => {
  // A faucet at the top of a 10-deep shaft. Where the stream lands there is
  // a wheel on each side, each emptying into a drain, and under it a wheel
  // whose only way out is a long level pipe to a drain (so it stays nearly full).
  const fall = 10;
  const pipe = 18;
  const world = worldFrom([
    `##F##${'#'.repeat(pipe)}`,
    ...Array(fall).fill(`##.##${'#'.repeat(pipe)}`),
    `DO.OD${'#'.repeat(pipe)}`,
    `##O${'P'.repeat(pipe)}D#`,
    `#####${'#'.repeat(pipe)}`,
  ]);
  /** The same blocks with the faucets and drains switched off: only the water's own moves. */
  const quiet = (name) => (name === 'faucet' ? {} : name === 'drain' ? { fluid: { sides: 'all' } } : blockInfo(name));
  let credited = 0;
  let given = 0;
  for (let tick = 0; tick < 1200; tick++) {
    // What the water really lost in this tick's moves, from a twin with no faucet and no drain.
    const twin = structuredClone(world);
    const before = waterEnergy(twin) + carriedPush(twin);
    let now = 0;
    for (const work of stepFluids(twin, quiet).waterWork.values()) now += work;
    const lost = before - (waterEnergy(twin) + carriedPush(twin));
    assert.ok(now <= lost + 1e-9, `tick ${tick}: the wheels got ${now}, the water lost ${lost}`);
    stepFluids(world, blockInfo);
    if (tick >= 1000) {
      credited += now;
      given += lost;
    }
  }
  // A faucet's water falling 12 cells has 0.05 × 12 to give, and no more.
  assert.ok(credited / 200 <= FAUCET_RATE * (fall + 2) + 1e-9, `the wheels get ${credited / 200} a tick`);
  assert.ok(credited > 0.5 * given, `the wheels got ${credited} of ${given}`);
});

test('in lots of random worlds, in every single tick: the wheels get no more than the water lost (counting the push falling water still carries as not lost yet)', () => {
  const random = randomFrom(11);
  for (let trial = 0; trial < 60; trial++) {
    const world = createWorld(4 + Math.floor(random() * 12), 4 + Math.floor(random() * 9));
    world.cells.forEach((_, index) => {
      const pick = random();
      setBlock(world, index % world.width, Math.floor(index / world.width), pick < 0.2 ? 'stone' : pick < 0.32 ? 'waterWheel' : pick < 0.4 ? 'pipe' : 'air');
      if (world.cells[index] !== 'stone' && random() < 0.5) world.fluid.water[index] = random() < 0.6 ? 1 : random();
    });
    for (let tick = 0; tick < 150; tick++) {
      const before = waterEnergy(world) + carriedPush(world);
      let now = 0;
      for (const work of stepFluids(world, blockInfo).waterWork.values()) now += work;
      const lost = before - (waterEnergy(world) + carriedPush(world));
      assert.ok(now <= lost + 1e-9, `world ${trial}, tick ${tick}: the wheels got ${now}, the water lost ${lost}`);
    }
  }
});

test('a build that is the same on both sides stays the same on both sides, and a mirrored build gives the mirrored answer', () => {
  // (Once, a rounding-sized flow between two full cells, whose direction is
  // a coin toss, could switch SPREAD off on one side and not the other.)
  const one = ['######', '#~####', '#.+~##', '#~~~~#', '#~..##', '##..##', '######'];
  for (const rows of [one, mirrored(one)]) {
    const flip = rows !== one;
    const world = worldFrom(rows.map((row) => row.replace('+', '.')));
    setFluid(world, 'water', flip ? 3 : 2, 2, 0.799);
    smallStep(world);
    const at = (x, y) => getFluid(world, 'water', flip ? 5 - x : x, y);
    if (!flip) one.answer = [1, 2, 3, 4].flatMap((x) => [2, 3, 4, 5].map((y) => at(x, y)));
    else assert.deepEqual([1, 2, 3, 4].flatMap((x) => [2, 3, 4, 5].map((y) => at(x, y))).map((v, k) => Math.abs(v - one.answer[k]) < 1e-12), Array(16).fill(true));
  }
  const random = randomFrom(1);
  for (let trial = 0; trial < 80; trial++) {
    const half = 2 + Math.floor(random() * 7);
    const width = 2 * half + (random() < 0.5 ? 1 : 0);
    const world = createWorld(width, 4 + Math.floor(random() * 9));
    for (let y = 0; y < world.height; y++) {
      for (let x = 0; x < Math.ceil(width / 2); x++) {
        const pick = random();
        const name = pick < 0.3 ? 'stone' : pick < 0.4 ? 'pipe' : pick < 0.45 ? 'waterWheel' : 'air';
        const amount = random() < 0.5 ? (random() < 0.7 ? 1 : Math.round(random() * 8) / 8) : 0;
        for (const column of [x, width - 1 - x]) {
          setBlock(world, column, y, name);
          if (name !== 'stone') setFluid(world, 'water', column, y, amount);
        }
      }
    }
    for (let tick = 0; tick < 200; tick++) {
      stepFluids(world, blockInfo);
      world.fluid.water.forEach((amount, index) => {
        const other = Math.floor(index / width) * width + (width - 1 - index % width);
        assert.ok(Math.abs(amount - world.fluid.water[other]) < 1e-6, `world ${trial}, tick ${tick}: ${amount} on one side, ${world.fluid.water[other]} on the other`);
      });
    }
  }
});

test('a hole at ground level is not held back by its own puddle: it floods the floor faster the deeper the tank', () => {
  /**
   * A 3-wide tank standing on the ground and kept topped up, a hole at
   * the foot of its wall, 16 cells of open floor and a drain at the end.
   * @param {number} depth - how deep the tank is kept
   * @returns {number} how much water left the tank in tick 40
   */
  const outflow = (depth) => {
    const rows = [];
    for (let y = 0; y < 13; y++) rows.push(`#${y >= 13 - depth ? '~~~' : '...'}#${'.'.repeat(16)}`);
    rows[12] = `${rows[12].slice(0, 4)}.${rows[12].slice(5)}`;
    rows.push(`${'#'.repeat(20)}D`);
    const world = worldFrom(rows);
    let out = 0;
    for (let tick = 0; tick < 40; tick++) {
      for (let y = 13 - depth; y < 13; y++) for (let x = 1; x <= 3; x++) setFluid(world, 'water', x, y, 1);
      stepFluids(world, blockInfo);
      out = 3 * depth - (column(world, 1, 0, 12) + column(world, 2, 0, 12) + column(world, 3, 0, 12));
    }
    return out;
  };
  const shallow = outflow(2);
  const middling = outflow(5);
  const deep = outflow(10);
  assert.ok(middling > 1.5 * shallow, `5 deep: ${middling} a tick, 2 deep: ${shallow}`);
  assert.ok(deep > 1.5 * middling, `10 deep: ${deep} a tick, 5 deep: ${middling}`);
  // And a tank with a hole at its foot, filled by three faucets, does not fill up:
  // the hole lets out all they pour in while the water is still shallow.
  const fed = worldFrom(['#FFF#################', ...Array(12).fill(`#...#${'.'.repeat(16)}`), `${'#'.repeat(20)}D`]);
  setBlock(fed, 4, 12, 'air');
  run(fed, 800);
  const stands = column(fed, 2, 0, 12);
  assert.ok(stands < 3, `the tank stands ${stands} deep`);
});

test('a wheel at a spout is strong when its water falls away, and feeble standing in its own puddle', () => {
  /**
   * A 3-wide tank kept 10 deep, two cells of pipe from its foot, a
   * wheel with stone over and under it, and then the way out.
   * @param {string[]} out - what is beyond the wheel, for the wheel's row and the two rows under it
   * @returns {number} the work the wheel gets in tick 200
   */
  const work = (out) => {
    const rows = [...Array(8).fill(`#~~~###${'.'.repeat(out[0].length)}`), `#~~~###${out[0]}`, `#~~~PPO${out[0]}`, `#######${out[1]}`, `#######${out[2]}`, `#######${'#'.repeat(out[0].length)}`];
    const world = worldFrom(rows);
    const at = world.cells.indexOf('waterWheel');
    let last = 0;
    for (let tick = 0; tick < 200; tick++) {
      for (let y = 0; y < 10; y++) for (let x = 1; x <= 3; x++) setFluid(world, 'water', x, y, 1);
      last = stepFluids(world, blockInfo).waterWork.get(at) ?? 0;
    }
    return last;
  };
  const falls = work(['....', '....', '.DDD']);      // a drop, and drains at the bottom of it
  const puddle = work(['....D', '#####', '#####']); // a level floor, with a drain at the far end
  assert.ok(puddle > 0, 'water does go through the wheel in the puddle');
  assert.ok(falls > 3 * puddle, `falling away: ${falls} a tick; standing in its puddle: ${puddle}`);
});

test('no share of the energy is less than nothing: a little water and a lot meeting in one cell give a wheel no more than was lost', () => {
  // settleShares by itself: a share below zero is paid back by the moves it was shared with.
  /**
   * Settle some shares.
   * @param {number[]} from - the cell each move left
   * @param {number[]} to - the cell each move went to
   * @param {number[]} shares - each move's share
   * @returns {number[]} the shares afterwards
   */
  const settle = (from, to, shares) => {
    const energy = Float64Array.from(shares);
    settleShares(from, to, energy, 6);
    return Array.from(energy);
  };
  assert.deepEqual(settle([0, 2], [1, 3], [2, 5]), [2, 5]);            // nothing short: nothing changes
  assert.deepEqual(settle([0, 0], [1, 2], [-1, 5]), [0, 4]);           // paid by the other move out of the same cell
  assert.deepEqual(settle([0, 2], [1, 1], [-1, 5]), [0, 4]);           // or by the other move into the same cell
  assert.deepEqual(settle([0, 0, 0], [1, 2, 3], [-2, 6, 2]), [0, 4.5, 1.5]); // each by how big its own share is
  assert.deepEqual(settle([0, 2], [1, 3], [-1, 5]), [0, 4]);           // or, last of all, by all the moves there are
  assert.deepEqual(settle([0, 2], [1, 3], [-3, 2]), [0, 0]);           // never below nothing
  // In a world: a wheel full of water and a nearly level cell both spread into the
  // cell between them. Every move's share is 0 or more, and together they are
  // exactly what the water lost: so the wheel is told no more than that.
  const world = worldFrom(['#..O#', '#####']);
  setFluid(world, 'water', 1, 0, 0.52);
  setFluid(world, 'water', 2, 0, 0.5);
  setFluid(world, 'water', 3, 0, 1);
  const table = flowTable(world, allOpenSides(world, blockInfo), blockInfo);
  for (let step = 0; step < 12; step++) {
    const before = waterEnergy(world);
    let told = 0;
    let fromWheel = 0;
    flowWater(world, table, (from, to, amount, energy) => {
      assert.ok(energy >= 0, `small step ${step}: the move from ${from} to ${to} was given ${energy}`);
      told += energy;
      if (world.cells[from] === 'waterWheel') fromWheel += energy;
    });
    const lost = before - waterEnergy(world);
    assert.ok(Math.abs(told - lost) < 1e-12, `small step ${step}: told ${told}, lost ${lost}`);
    assert.ok(fromWheel <= lost + 1e-12, `small step ${step}: the wheel's water was given ${fromWheel} of ${lost}`);
    if (step === 0) assert.ok(fromWheel > 0.04, `the wheel's water was given ${fromWheel}`);
  }
});

test('worlds that once came out differently in a mirror (because of the sign of a rounding speck) now come out the same', () => {
  // Each world was caught by a sweep of random worlds against their mirror
  // images. In all of them a number that should be exactly nothing came
  // out as a speck above or below it, and which one decided what happened.
  const worlds = JSON.parse(readFileSync(new URL('./fixtures/mirror-worlds.json', import.meta.url), 'utf8'));
  for (const { why, rows, water, current } of worlds) {
    const width = rows[0].length;
    /**
     * Where a cell lands in the mirror image.
     * @param {number} index - the cell
     * @returns {number} the mirrored cell
     */
    const across = (index) => Math.floor(index / width) * width + (width - 1 - index % width);
    const plain = worldFrom(rows);
    const flipped = worldFrom(mirrored(rows));
    water.forEach((amount, index) => {
      plain.fluid.water[index] = amount;
      flipped.fluid.water[across(index)] = amount;
    });
    plain.signals.electric = { cells: new Map(current.map(([index, amps]) => [index, { current: amps }])) };
    flipped.signals.electric = { cells: new Map(current.map(([index, amps]) => [across(index), { current: amps }])) };
    for (let tick = 0; tick < 5; tick++) {
      stepFluids(plain, blockInfo);
      stepFluids(flipped, blockInfo);
      plain.fluid.water.forEach((amount, index) => {
        const other = flipped.fluid.water[across(index)];
        assert.ok(Math.abs(amount - other) < 1e-9, `${why}: tick ${tick}, cell ${index} holds ${amount}, its mirror image ${other}`);
      });
    }
  }
});

test('a pump with nothing behind it moves nothing, and does not hold up the water it points into', () => {
  // A tank levels with a basin. A pump in the basin's roof points down into
  // it, with only air behind it. Switched on or off, the water does the same.
  const rows = ['#~#####', '#~#####', '#~#...#', '#~##v.#', '#~~...#', '#######'];
  const off = worldFrom(rows);
  const on = worldFrom(rows);
  powerPumps(on, 1);
  for (let tick = 0; tick < 40; tick++) {
    stepFluids(off, blockInfo);
    const { pumpWork } = stepFluids(on, blockInfo);
    assert.equal(pumpWork, 0);
    on.fluid.water.forEach((amount, index) => assert.ok(Math.abs(amount - off.fluid.water[index]) < 1e-9, `tick ${tick}, cell ${index}: ${amount} with the pump on, ${off.fluid.water[index]} with it off`));
  }
  assert.ok(Math.abs(column(on, 1, 0, 4) - column(on, 5, 0, 4)) < 0.01, `the tank stands ${column(on, 1, 0, 4)}, the far side ${column(on, 5, 0, 4)}`);
  // And a pump fed by a trickle moves the trickle, and no more: the tank and
  // the far side still come level (both a little higher, with the faucet's water).
  const fed = worldFrom(['#~##F##', '#~##.##', '#~#...#', '#~##v.#', '#~~...#', '#######']);
  powerPumps(fed, 1);
  run(fed, 20);
  assert.ok(Math.abs(column(fed, 1, 0, 4) - column(fed, 5, 3, 4)) < 0.05, `with a trickle through the pump the tank stands ${column(fed, 1, 0, 4)}, the far side ${column(fed, 5, 3, 4)}`);
  assert.ok(Math.abs(total(fed, 'water') - (6 + 20 * FAUCET_RATE)) < 1e-9);
  assert.ok(column(fed, 4, 1, 2) < 3 * FAUCET_RATE, `the pump is not keeping up with its trickle: ${column(fed, 4, 1, 2)} is waiting behind it`);
});

/**
 * A tank 3 wide, KEPT a number of cells deep (it is topped up before
 * every tick), with a way out through its left wall, the water then
 * falling away into drains. Run it until it is steady.
 * @param {string[]} rows - the picture
 * @param {number} left - the first of the tank's three columns of water
 * @param {number} top - the tank's top row of water
 * @param {number} bottom - the tank's bottom row of water
 * @param {number} ticks - how long to run it
 * @returns {{flow: number, world: object, last: object}} how much water had to be topped up before the last
 *   tick (the steady flow out), the world, and what the last stepFluids said
 */
function keptFull(rows, left, top, bottom, ticks) {
  const world = worldFrom(rows);
  let flow = 0;
  let last = null;
  for (let tick = 0; tick < ticks; tick++) {
    flow = 0;
    for (let y = top; y <= bottom; y++) {
      for (let x = left; x <= left + 2; x++) {
        flow += FULL - getFluid(world, 'water', x, y);
        setFluid(world, 'water', x, y, FULL);
      }
    }
    last = stepFluids(world, blockInfo);
  }
  return { flow, world, last };
}

/**
 * A tank kept 10 deep with a pipe (or a bare hole) through its wall,
 * some cells below the top of the water.
 * @param {number} depth - which row of the tank's water the way out is in (1 = the top row)
 * @param {number} length - how many cells long the way out is
 * @param {string} letter - what it is made of: `P` an empty pipe, `p` a pipe full of water, `.` or `~` a bare hole, empty or full
 * @returns {number} the steady flow out, in cells a tick
 */
function tankFlow(depth, length, letter) {
  const rows = [];
  // (Two open columns on the left for the water to fall down.)
  for (let y = 0; y < 12; y++) rows.push(`..${'#'.repeat(length)}${y >= 2 ? '~~~' : '...'}#`);
  rows[1 + depth] = `..${letter.repeat(length)}~~~#`;
  rows.push(`DD${'#'.repeat(length + 4)}`);
  return keptFull(rows, 2 + length, 2, 11, 300).flow;
}

test('the same tank and the same hole have ONE steady flow, whether the hole began empty or full, and it grows smoothly with the depth', () => {
  // (Once, a hole that began full ran about twice as fast as the very same
  // hole that began empty, for ever, and the flow jumped to double between
  // 6 and 7 cells deep.)
  for (const [length, empty, full] of [[1, '.', '~'], [3, 'P', 'p']]) {
    const flows = [];
    for (let depth = 1; depth <= 8; depth++) {
      const fromEmpty = tankFlow(depth, length, empty);
      const fromFull = tankFlow(depth, length, full);
      assert.ok(Math.abs(fromEmpty - fromFull) < 1e-6, `${length} of ${empty}, ${depth} deep: ${fromEmpty} from empty, ${fromFull} from full`);
      flows.push(fromEmpty);
    }
    for (let depth = 2; depth <= 8; depth++) {
      const [before, now] = [flows[depth - 2], flows[depth - 1]];
      assert.ok(now > before, `${length} of ${empty}: deeper is faster (${flows})`);
      // From the second row down, each cell deeper adds a little (not a jump).
      if (depth > 2) assert.ok(now < 1.3 * before, `${length} of ${empty}: ${before} at ${depth - 1} deep, ${now} at ${depth} (${flows})`);
    }
    // The top row is the odd one out: water there is not pressed at all, it
    // only spills over the lip, half a hole deep. A real tank does the same
    // (a weir against a hole that runs full). (Along a pipe, with nothing
    // to push it, such a spill only creeps: the longer the pipe the slower.)
    if (length === 1) assert.ok(flows[1] < 3 * flows[0], `${flows}`);
  }
});

test('a long pipe gives one steady flow too, and more for every cell deeper the tank is', () => {
  // (Once, a pipe that began empty and one that began full gave different
  // steady flows over a band of depths that moved with the pipe's length.)
  const flows = [];
  for (let depth = 1; depth <= 8; depth++) {
    const fromEmpty = tankFlow(depth, 9, 'P');
    const fromFull = tankFlow(depth, 9, 'p');
    assert.ok(Math.abs(fromEmpty - fromFull) < 1e-6, `${depth} deep: ${fromEmpty} from empty, ${fromFull} from full`);
    if (depth > 1) assert.ok(fromEmpty > flows[flows.length - 1], `deeper is faster: ${flows}, then ${fromEmpty}`);
    flows.push(fromEmpty);
  }
  // A long pipe rubs: with little head over it the water gets through slower than out of a bare hole.
  assert.ok(flows[1] < tankFlow(2, 1, 'P'), `${flows}`);
});

/**
 * A tank kept `depth` deep, two cells of pipe out of its foot, and a
 * water wheel with stone over and under it; the water then falls away.
 * @param {number} depth - how deep the tank is kept
 * @param {string} way - the three cells out of the tank: `PPO` a wheel at the end, `POP` a wheel in the middle; small letters for full of water
 * @returns {{work: number, gross: number}} what the wheel got in the last tick, and how much water went through it
 */
function wheelUnderTank(depth, way) {
  const rows = [];
  for (let y = 0; y < 11; y++) rows.push(`..###${y >= 11 - depth ? '~~~' : '...'}#`);
  rows[10] = `..${[...way].reverse().join('')}${rows[10].slice(5)}`;
  rows.push('..#######', 'DD#######');
  const { last, world } = keptFull(rows, 5, 11 - depth, 10, 200);
  return last.wheels.get(world.cells.indexOf('waterWheel'));
}

test('a wheel at the end of a pipe gets the same push whether the pipe began empty or full, and more for every cell the tower is taller', () => {
  // (Once, the same machine gave the wheel 7 times the power if its pipe had
  // been full of water when the tank was filled.)
  let before = null;
  for (const depth of [2, 3, 4, 5, 6, 8]) {
    const fromEmpty = wheelUnderTank(depth, 'PPO');
    const fromFull = wheelUnderTank(depth, 'ppo');
    assert.ok(Math.abs(fromEmpty.work - fromFull.work) < 1e-6 && Math.abs(fromEmpty.gross - fromFull.gross) < 1e-6, `${depth} deep: ${JSON.stringify(fromEmpty)} from empty, ${JSON.stringify(fromFull)} from full`);
    const fall = fromEmpty.work / fromEmpty.gross;
    assert.ok(fall <= depth, `${depth} deep: each bit of water gave ${fall}`);
    if (before) {
      assert.ok(fromEmpty.gross > before.gross && fall > before.fall, `${depth} deep: more water, and more push in each bit of it`);
      assert.ok(fall - before.fall <= depth - before.depth, `${depth} deep: fall ${fall}, after ${before.fall} at ${before.depth} deep`);
    }
    before = { depth, fall, gross: fromEmpty.gross };
  }
});

test('a wheel in the middle of a pipe is weaker than one at the end, but a taller tower never makes it weaker', () => {
  // (Once, doubling the tower from 4 to 8 halved such a wheel's speed: under
  // the lower tower the pipe after it did not run full, so it was the spout.)
  let before = 0;
  for (let depth = 1; depth <= 8; depth++) {
    const middle = wheelUnderTank(depth, 'POP');
    const fromFull = wheelUnderTank(depth, 'pop');
    assert.ok(Math.abs(middle.work - fromFull.work) < 1e-6, `${depth} deep: ${middle.work} from empty, ${fromFull.work} from full`);
    assert.ok(middle.work > before, `${depth} deep: the wheel got ${middle.work}, after ${before} under a lower tower`);
    before = middle.work;
    if (depth >= 3) assert.ok(middle.work < wheelUnderTank(depth, 'PPO').work, `${depth} deep: the wheel at the end gets more`);
  }
});

test('a riser has one steady flow too: a pipe up from a tank\'s foot, running over at the top', () => {
  // The riser's top is 3 cells above the tank's floor. The tank is kept deeper and deeper.
  /**
   * The steady flow over the top of the riser.
   * @param {number} depth - how deep the tank is kept
   * @param {boolean} full - does the riser begin full of water?
   * @returns {number} cells a tick
   */
  const over = (depth, full) => {
    const rows = [];
    for (let y = 0; y < 12; y++) rows.push(`####${y >= 12 - depth ? '~~~' : '...'}#`.replace(/^/, '#'));
    const p = full ? 'p' : 'P';
    rows[11] = `###${p}${p}~~~#`;
    rows[10] = `###${p}#~~~#`;
    rows[9] = `###${p}#${rows[9].slice(5)}`;
    rows[8] = `..${full ? '~' : '.'}.#${rows[8].slice(5)}`; // the riser's top cell, open to both sides, under a stone lid
    rows[9] = `..#${p}#${rows[9].slice(5)}`;
    rows[10] = `..#${p}#~~~#`;
    rows[11] = `DD#${p}${p}~~~#`;
    rows.push('#########');
    return keptFull(rows, 5, 12 - depth, 11, 300).flow;
  };
  let before = -1;
  for (let depth = 3; depth <= 10; depth++) {
    const fromEmpty = over(depth, false);
    const fromFull = over(depth, true);
    assert.ok(Math.abs(fromEmpty - fromFull) < 1e-6, `${depth} deep: ${fromEmpty} from empty, ${fromFull} from full`);
    assert.ok(fromEmpty >= before, `${depth} deep: ${fromEmpty}, after ${before} with a lower tank`);
    before = fromEmpty;
  }
  assert.ok(over(3, false) < 0.05, 'a tank no higher than the riser\'s top hardly runs over');
  assert.ok(before > 1, `a tank 7 cells higher than the riser's top runs over fast (${before})`);
});

test('steam comes out the same in a mirror too: water that is half a cell but for a rounding speck counts as half', () => {
  // (Steam may not spread into a cell that is more than half water. Sums of
  // water come out as a half give or take a rounding speck, and which side
  // they fell on used to decide where the steam went.)
  /**
   * Run a world and its mirror image side by side, and check them against each other.
   * @param {string[]} rows - the picture
   * @param {number} ticks - how long
   * @param {string} what - a name for the message
   * @returns {void}
   */
  const sameInMirror = (rows, ticks, what) => {
    const width = rows[0].length;
    const plain = worldFrom(rows);
    const flipped = worldFrom(mirrored(rows));
    for (let tick = 0; tick < ticks; tick++) {
      stepFluids(plain, blockInfo);
      stepFluids(flipped, blockInfo);
      for (const kind of ['water', 'steam']) {
        plain.fluid[kind].forEach((amount, index) => {
          const other = flipped.fluid[kind][Math.floor(index / width) * width + (width - 1 - index % width)];
          assert.ok(Math.abs(amount - other) < 1e-9, `${what}, tick ${tick}: ${amount} of ${kind} in cell ${index}, ${other} in its mirror image`);
        });
      }
    }
  };
  sameInMirror(['~~s', '#~.', '.#.', '..~'], 30, 'the world that showed it');
  const random = randomFrom(11);
  for (let trial = 0; trial < 400; trial++) {
    const width = 3 + Math.floor(random() * 4);
    const rows = [];
    for (let y = 2 + Math.floor(random() * 4); y > 0; y--) {
      let row = '';
      for (let x = 0; x < width; x++) {
        const pick = random();
        row += pick < 0.25 ? '#' : pick < 0.55 ? '~' : pick < 0.7 ? 's' : '.';
      }
      rows.push(row);
    }
    sameInMirror(rows, 30, `world ${trial} (${rows.join('/')})`);
  }
});

test('worlds whose sums once went round in circles (so a body of water stood still for a small step) now settle', () => {
  // Each world was caught by a sweep of random worlds: in one small step the
  // water circuit kept changing its mind (a hole open, shut, open...; a
  // surface giving all it could, taking all it could, giving...) and gave up.
  const worlds = JSON.parse(readFileSync(new URL('./fixtures/stuck-worlds.json', import.meta.url), 'utf8'));
  for (const { why, rows, water, current } of worlds) {
    const world = worldFrom(rows);
    water.forEach((amount, index) => {
      world.fluid.water[index] = amount;
    });
    world.signals.electric = { cells: new Map(current.map(([index, amps]) => [index, { current: amps }])) };
    const before = pressWork.stuck;
    const had = total(world, 'water');
    run(world, 3);
    assert.equal(pressWork.stuck, before, why);
    assert.ok(Math.abs(total(world, 'water') - had) < 1e-9, why);
  }
});
