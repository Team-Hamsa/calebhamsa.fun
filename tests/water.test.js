/**
 * water.test.js — checks the 💧 pack with the real blocks: flipping
 * valves, burners and pumps, the palette, a steam power plant (burner →
 * turbine → generator → lamp) and its energy books, and a
 * battery-powered pump pushing water uphill.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, getBlock, getFluid, setBlock, setFluid, tick } from '../js/world.js';
import { allSystems, blockInfo, blocksInPack, isKnownBlock } from '../js/blocks/registry.js';
import { BOIL_RATE, DROP_POWER, RISE_POWER, openSides } from '../js/fluids.js';
import water, * as waterPack from '../js/blocks/water.js';
import { MACHINE_DRAG, spinAt } from '../js/blocks/gears.js';

const { TURBINE_SPEED, TURBINE_STRENGTH, turbineSource } = waterPack;

/** What each letter in a test picture means. `~` is air full of water. */
const LETTERS = {
  '.': 'air', '~': 'air', '#': 'stone', W: 'wire', L: 'lamp', B: 'battery',
  F: 'burnerOn', T: 'turbine', '^': 'pumpUp', P: 'pipe', C: 'chiller', E: 'generator',
};

/** The steam power plant from the wiki: turbine at (2, 3), generator beside it, lamp at (5, 3). */
const PLANT = [
  '#CC#...',
  '#..#...',
  '#..WWW.',
  '##TE.L.',
  '##~WWW.',
  '##F###.',
];

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

/**
 * Run a world for some ticks with every pack's rules.
 * @param {object} world - the world
 * @param {number} ticks - how many
 * @returns {object} the world
 */
function run(world, ticks) {
  const systems = allSystems();
  for (let i = 0; i < ticks; i++) tick(world, systems, blockInfo);
  return world;
}

/**
 * How bright the lamp (or other part) at x, y is.
 * @param {object} world - the world
 * @param {number} x - column
 * @param {number} y - row
 * @returns {number} its level (0 = dark)
 */
const levelAt = (world, x, y) => world.signals.electric?.cells?.get(y * world.width + x)?.level ?? 0;

/**
 * A turbine's smoothed steam count.
 * @param {object} world - the world
 * @param {number} x - column
 * @param {number} y - row
 * @returns {{out: number, gross: number, work: number, into: number, inWay: number}} the count (all 0 with no steam)
 */
const countAt = (world, x, y) => world.signals.water?.turbines?.get(y * world.width + x) ?? { out: 0, gross: 0, work: 0, into: 0, inWay: 0 };

/**
 * The power all the lamps in a world use: each one's current, squared (a lamp's resistance is 1).
 * @param {object} world - the world
 * @returns {number} the power
 */
function lampPower(world) {
  let power = 0;
  for (const [index, cell] of world.signals.electric?.cells ?? []) {
    if (world.cells[index] === 'lamp') power += (cell.current ?? 0) ** 2;
  }
  return power;
}

test('a turbine lets steam through one way and is not a circuit part: it is a spinning block', () => {
  const world = worldFrom(['...', 'WTW', '...']);
  assert.deepEqual(openSides(world, 1, 1, blockInfo), ['up', 'down']);
  const info = blockInfo('turbine');
  assert.equal(info.part, undefined);
  assert.deepEqual(info.spin, { kind: 'hub' });
  assert.equal(info.spinSource, turbineSource);
  for (const gone of ['turbinePush', 'TURBINE_GAIN', 'MAX_TURBINE_PUSH']) assert.equal(waterPack[gone], undefined, `${gone} should be gone`);
});

test('the turbine\'s books: its best work is exactly what its steam gave up, and steam is worth what water is', () => {
  assert.equal(RISE_POWER, DROP_POWER);
  for (const flow of [0.01, 0.05, 0.3]) {
    assert.ok(Math.abs((TURBINE_STRENGTH * flow) / 2 * (TURBINE_SPEED / 2) - RISE_POWER * flow) < 1e-12);
  }
  // And with real counts: half its strength at half its top speed is never more than RISE_POWER × work.
  const world = run(worldFrom(PLANT), 400);
  const source = turbineSource(world, 2, 3);
  const { work } = countAt(world, 2, 3);
  assert.ok((source.strength / 2) * (source.speed / 2) <= RISE_POWER * work + 1e-9);
  assert.equal(source.eitherWay, true);
});

test('a steam power plant lights a lamp: burner → steam → turbine → generator → ⚡', () => {
  const world = worldFrom(PLANT);
  let brightest = 0;
  for (let i = 0; i < 40; i++) {
    run(world, 1);
    brightest = Math.max(brightest, levelAt(world, 5, 3));
  }
  assert.ok(brightest > 0.5, `the lamp only reached ${brightest.toFixed(3)}`);
  run(world, 360);
  const level = levelAt(world, 5, 3);
  assert.ok(level > 0.7 && level < 0.9, `after 400 ticks the lamp is at ${level}`);
  assert.ok(spinAt(world, 2, 3) > 0.5, 'the turbine turns');
  assert.equal(spinAt(world, 3, 3), spinAt(world, 2, 3), 'and the generator turns with it');
  // It holds steady: no flicker.
  for (let i = 0; i < 50; i++) {
    run(world, 1);
    assert.ok(Math.abs(levelAt(world, 5, 3) - level) < 1e-6, `tick ${400 + i}: the lamp went from ${level} to ${levelAt(world, 5, 3)}`);
  }
});

test('a turbine wired straight to a lamp lights nothing: it needs a generator', () => {
  // The plant from before the turbine became a spinning block: wires on the turbine's sides.
  const world = worldFrom([
    'WWWLWWW',
    'W....CW',
    'WWWTWWW',
    '###~###',
    '###F###',
    '#######',
  ]);
  for (let i = 0; i < 400; i++) {
    run(world, 1);
    assert.equal(levelAt(world, 3, 0), 0, `tick ${i}: the lamp lit`);
    for (const cell of world.signals.electric.cells.values()) assert.ok(!cell.spark, `tick ${i}: something sparked`);
  }
  assert.ok(spinAt(world, 3, 2) > 0.5, 'the turbine still spins in the steam');
});

test('more lamps are harder to turn: the turbine slows, each lamp is dimmer, and all the heat made is exactly the work the turbine does on its shaft, never more than the steam gave up', () => {
  /**
   * The plant with some lamps side by side.
   * @param {number} lamps - how many
   * @returns {{speed: number, level: number, power: number, steam: number, shaft: number, heat: number}} the
   *   turbine's speed, one lamp's level, all the lamps' power, the work the steam gives up at the turbine each
   *   tick × RISE_POWER, the work the turbine does on its shaft (how hard it pushes × how fast it turns), and
   *   ALL the heat made: in every joint of the circuit (lamps, the generator's coil, wires) and in its bearings
   */
  const plant = (lamps) => {
    const world = run(worldFrom([
      `#CC#${'..'.repeat(lamps)}.`,
      `#..#${'..'.repeat(lamps)}.`,
      `#..W${'WW'.repeat(lamps)}.`,
      `##TE${'.L'.repeat(lamps)}.`,
      `##~W${'WW'.repeat(lamps)}.`,
      `##F#${'##'.repeat(lamps)}.`,
    ]), 400);
    const speed = spinAt(world, 2, 3);
    const source = turbineSource(world, 2, 3);
    const shaft = source.strength * (1 - speed / source.speed) * speed;
    let heat = MACHINE_DRAG * spinAt(world, 3, 3) ** 2;
    for (const circuit of world.signals.electric.net.circuits) {
      for (const link of circuit.links) heat += (world.signals.electric.cells.get(link.a).arms[link.side] ?? 0) ** 2 * link.resistance;
    }
    return { speed, level: levelAt(world, 5, 3), power: lampPower(world), steam: RISE_POWER * countAt(world, 2, 3).work, shaft, heat };
  };
  let last = { speed: Infinity, level: Infinity };
  for (const lamps of [1, 2, 4, 8]) {
    const now = plant(lamps);
    const what = `${lamps} lamps: ${JSON.stringify(now)}`;
    assert.ok(now.speed > 0.1 && now.speed < last.speed - 0.05, `${what} is not slower than ${last.speed}`);
    assert.ok(now.level > 0.1 && now.level < last.level - 0.05, `${what} is not dimmer than ${last.level}`);
    assert.ok(now.power < now.shaft && now.shaft <= now.steam + 1e-9, `${what}: the lamps got more than the turbine's work, or the turbine more than the steam's`);
    assert.ok(Math.abs(now.heat - now.shaft) < 1e-9, `${what}: the heat is not the work`);
    assert.ok(Math.abs(now.steam - 1) < 0.01, `${what}: the steam gives the same however many lamps there are`);
    last = now;
  }
});

test('more burners make a turbine stronger, not faster', () => {
  /**
   * Two pots under one turbine, with a burner under one or both.
   * @param {string} burners - the bottom row
   * @returns {{speed: number, strength: number}} the turbine as a source
   */
  const source = (burners) => turbineSource(run(worldFrom(['#CCC#', '#...#', '##T##', '#...#', '#~#~#', burners]), 400), 2, 2);
  const one = source('#F###');
  const two = source('#F#F#');
  assert.ok(Math.abs(two.speed - one.speed) < 0.05 * one.speed, `speeds ${one.speed} and ${two.speed}`);
  assert.ok(two.strength > 1.8 * one.strength && two.strength < 2.2 * one.strength, `strengths ${one.strength} and ${two.strength}`);
});

test('a second burner in the corner of ONE pot adds nothing: steam can\'t push sideways through water (so the wiki says "own pot")', async () => {
  /**
   * One wide pot under a turbine, with burners under it.
   * @param {string} burners - the bottom row
   * @returns {{speed: number, strength: number}} the turbine as a source
   */
  const source = (burners) => turbineSource(run(worldFrom(['#CCC#', '#...#', '##T##', '#~~~#', burners]), 600), 2, 2);
  const one = source('##F##');
  const two = source('#FF##');
  assert.ok(Math.abs(two.strength - one.strength) < 0.05 * one.strength, `strengths ${one.strength} and ${two.strength}`);
  const { readFileSync } = await import('node:fs');
  const wiki = readFileSync(new URL('../wiki/Water.md', import.meta.url), 'utf8');
  assert.match(wiki, /own pot/);
  assert.doesNotMatch(wiki, /more burners\*\* make it stronger/);
});

test('steam piped round a corner into a turbine has lost most of its push: the guide says to stand it upright', () => {
  /**
   * The most work a turbine can do each tick: half its strength at half its speed.
   * @param {object|null} source - from turbineSource
   * @returns {number} its best power
   */
  const best = (source) => (source ? source.strength / 2 * source.speed / 2 : 0);
  // The same pot and the same 3 cells of rise: upright on top of it, or round a corner at the end of a pipe.
  const upright = best(turbineSource(run(worldFrom(['#C####', '#T####', '#~####', '#~####', '#~####', '#F####']), 400), 1, 1));
  const corner = best(turbineSource(run(worldFrom(['######', '#.TPPC', '#~####', '#~####', '#~####', '#F####']), 400), 2, 1));
  assert.ok(upright > 1.4, `upright ${upright}`);
  assert.ok(corner < upright / 4, `round the corner ${corner}, upright ${upright}`);
  assert.match(water.guide.blocks.turbine.does, /upright/);
});

test('nowhere for the steam to go: in a sealed box the turbine stops and the lamp goes dark', () => {
  const world = run(worldFrom(PLANT.map((row) => row.replace('CC', '##'))), 2000);
  assert.equal(turbineSource(world, 2, 3), null);
  assert.equal(spinAt(world, 2, 3), 0);
  assert.equal(levelAt(world, 5, 3), 0);
});

test('burner off: the plant winds down and stays down', () => {
  const world = run(worldFrom(PLANT), 300);
  assert.ok(levelAt(world, 5, 3) > 0.7);
  use(world, 2, 5);
  assert.equal(getBlock(world, 2, 5), 'burnerOff');
  run(world, 300);
  for (let i = 0; i < 50; i++) {
    run(world, 1);
    assert.equal(spinAt(world, 2, 3), 0, `tick ${i}: the turbine still turns`);
    assert.equal(levelAt(world, 5, 3), 0, `tick ${i}: the lamp is still lit`);
  }
});

test('lying down a turbine is feeble: steam in a level duct hardly rises at all', () => {
  const world = run(worldFrom(['######', '#~TP.C', '#F####']), 400);
  const source = turbineSource(world, 2, 1);
  assert.ok(source === null || (source.speed < 0.3 && source.strength < 1), JSON.stringify(source));
});

test('a chiller right on top of the turbine does not stop it: steam chilled inside the turbine has gone through it', () => {
  // A real plant's turbine blows straight into its condenser. Here the
  // steam never LEAVES the turbine's cell (it turns back into water in
  // it), but it came in through the blades and gave up its push there.
  const world = run(worldFrom(['#C#', '#T#', '#.#', '#.#', '#~#', '#F#']), 400);
  const count = countAt(world, 1, 1);
  assert.ok(Math.abs(count.gross - BOIL_RATE) < 1e-6, `all the burner's steam counts as going through: ${count.gross}`);
  assert.ok(Math.abs(count.out - BOIL_RATE) < 1e-6, `and it counts as going up, the way it came in: ${count.out}`);
  assert.ok(Math.abs(count.into - BOIL_RATE) < 1e-6 && Math.abs(count.inWay - BOIL_RATE) < 1e-6, JSON.stringify(count));
  const source = turbineSource(world, 1, 1);
  // The steam rose 3 cells into the turbine: √3 times a crank's speed, and never more work than it gave up.
  assert.ok(Math.abs(source.speed - TURBINE_SPEED * Math.sqrt(3)) < 1e-3, `speed ${source.speed}`);
  assert.ok(source.strength / 2 * source.speed / 2 <= RISE_POWER * count.work + 1e-9);
  assert.ok(Math.abs(spinAt(world, 1, 1) - source.speed) < 1e-9, 'with nothing to turn it runs at its top speed');
  // The same with the chiller one cell higher: the steam rises one cell more, and that is all the difference.
  const gap = run(worldFrom(['#C#', '#.#', '#T#', '#.#', '#.#', '#~#', '#F#']), 400);
  assert.ok(Math.abs(turbineSource(gap, 1, 2).speed - TURBINE_SPEED * 2) < 1e-3);
  // And with a chiller BESIDE the turbine as well, on either side: both turn just alike.
  const right = turbineSource(run(worldFrom(['#C#', '#.#', '#TC', '#~#', '#F#']), 400), 1, 2);
  const left = turbineSource(run(worldFrom(['#C#', '#.#', 'CT#', '#~#', '#F#']), 400), 1, 2);
  assert.ok(right && left && Math.abs(right.speed - left.speed) < 1e-9 && Math.abs(right.strength - left.strength) < 1e-9, JSON.stringify([right, left]));
});

test('a plant with its chiller right on the turbine lights its lamp', () => {
  const world = run(worldFrom(['#CWWWW.', '#TE..L.', '#~WWWW.', '#F#....']), 400);
  assert.ok(levelAt(world, 5, 1) > 0.2, `lamp level ${levelAt(world, 5, 1)}`);
});

test('a turbine whose way out is choking slows down and fades: it never races', () => {
  // A sealed room over the turbine fills up with steam. More and more
  // comes in than can get out, until nothing moves at all.
  const world = worldFrom(['####', '#..#', '##T#', '##.#', '##.#', '##.#', '##~#', '##~#', '##~#', '##F#']);
  const real = Math.sqrt(world.height); // no steam can have risen further than the world is tall
  let steady = null;
  let last = Infinity;
  for (let i = 1; i <= 200; i++) {
    run(world, 1);
    const source = turbineSource(world, 2, 2);
    const speed = source?.speed ?? 0;
    assert.ok(speed <= real, `tick ${i}: it turns at ${speed}, faster than any steam here could make it`);
    if (i === 40) steady = speed; // by now it is running steadily (about 2.5)
    if (i > 40) assert.ok(speed <= last + 1e-3, `tick ${i}: it sped up from ${last} to ${speed} while its way out choked`);
    if (i >= 40) last = speed;
  }
  assert.ok(steady > 2 && steady < 2.7, `steady speed ${steady}`);
  assert.equal(turbineSource(world, 2, 2), null, 'and in the end it stops');
});

test('a mirrored plant works just the same', () => {
  const world = run(worldFrom(PLANT), 400);
  const mirror = run(worldFrom(PLANT.map((row) => [...row].reverse().join(''))), 400);
  assert.ok(Math.abs(spinAt(world, 2, 3) - spinAt(mirror, 4, 3)) < 1e-9, `${spinAt(world, 2, 3)} and ${spinAt(mirror, 4, 3)}`);
  assert.ok(Math.abs(levelAt(world, 5, 3) - levelAt(mirror, 1, 3)) < 1e-9);
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
 * burner, run it until the steam is steady, and read the work the steam
 * gives up at each turbine every tick.
 * @param {string[]} chimney - the rows between the top chamber and the pot, like ['##T##', '##T##']
 * @returns {number[]} each turbine's work a tick, top first
 */
function plantWork(chimney) {
  const world = run(worldFrom(['#CCC#', '#...#', ...chimney, '#~~~#', '##F##']), 400);
  return chimney.map((row, i) => (row.includes('T') ? countAt(world, 2, 2 + i).work : null)).filter((work) => work !== null);
}

test('turbines in one chimney share what the steam gives up: together they get its whole rise, and never more', () => {
  const R = BOIL_RATE; // one burner's steam, rising one cell
  const chimneys = [
    [['##T##'], [2 * R]],
    [['##T##', '##T##'], [R, 2 * R]],
    [['##T##', '##T##', '##T##'], [R, R, 2 * R]],
    [['##T##', '##P##', '##T##'], [2 * R, 2 * R]],
    [['##T##', '##.##', '##T##'], [2 * R, 2 * R]],
    [['##T##', '#...#', '##T##'], [2 * R, 2 * R]],                       // a wide room between them
    [['##T##', '##PP#', '##T##'], [2 * R, 2 * R]],                       // a pipe with a dead-end stub between them
    [['##T##', '#...#', '##T##', '#...#', '##T##'], [2 * R, 2 * R, 2 * R]],
    [['##T##', '##P##', '##P##', '##P##'], [5 * R]],                     // at the top of a tall chimney: the whole rise
  ];
  for (const [chimney, expected] of chimneys) {
    const works = plantWork(chimney);
    const together = works.reduce((sum, work) => sum + work, 0);
    const wholeRise = R * (chimney.length + 1); // from the pot up to just above the top turbine
    const what = `${chimney.join('/')}: ${works}`;
    assert.ok(together <= wholeRise + 1e-9, `${what} adds up to more than the steam's whole rise, ${wholeRise}`);
    assert.ok(together > wholeRise - 0.005, `${what} adds up to less than the steam's whole rise, ${wholeRise}`);
    works.forEach((work, i) => assert.ok(Math.abs(work - expected[i]) < 0.005, `${what}, expected ${expected}`));
  }
});

test('a taller chimney under a turbine makes it faster and stronger; at the bottom of the chimney it gets only its own two cells', () => {
  const R = BOIL_RATE;
  const [low] = plantWork(['##T##']);
  const [high] = plantWork(['##T##', '##P##', '##P##', '##P##']);
  const [bottom] = plantWork(['##P##', '##P##', '##P##', '##T##']);
  assert.ok(Math.abs(low - 2 * R) < 0.005 && Math.abs(high - 5 * R) < 0.005, `low ${low}, high ${high}`);
  assert.ok(Math.abs(bottom - 2 * R) < 0.005, `at the bottom it got ${bottom}: the rest of the rise is thrown away`);
  const tall = run(worldFrom(['#CCC#', '#...#', '##T##', '##P##', '##P##', '##P##', '#~~~#', '##F##']), 400);
  const short = run(worldFrom(['#CCC#', '#...#', '##T##', '#~~~#', '##F##']), 400);
  const a = turbineSource(short, 2, 2);
  const b = turbineSource(tall, 2, 2);
  assert.ok(b.speed > 1.4 * a.speed, `speeds ${a.speed} and ${b.speed}`);
  assert.ok(b.strength > 1.4 * a.strength, `strengths ${a.strength} and ${b.strength}`);
});

test('turbines side by side in their own chimneys each get all the push of their own steam', () => {
  const world = run(worldFrom(['#CCCCC#', '#.....#', '##T#T##', '#~~~~~#', '##F#F##']), 400);
  const [one] = plantWork(['##T##']);
  assert.ok(Math.abs(countAt(world, 2, 2).work - one) < 0.005, `left gets ${countAt(world, 2, 2).work}, one alone ${one}`);
  assert.ok(Math.abs(countAt(world, 4, 2).work - countAt(world, 2, 2).work) < 1e-9);
});

test('falling water is drawn as a stream as wide as there is water; lying water as a pool as deep as there is water', () => {
  const world = createWorld(3, 1);
  const shown = new Float64Array([0.25, 0.25, 0.4]);
  const falling = new Float64Array([1, 0, 0.5]);
  world.signals.water = { cells: new Map(), shown, falling };
  const blue = [];
  const ctx = {
    fillStyle: '',
    globalAlpha: 1,
    fillRect(...args) { if (String(ctx.fillStyle).startsWith('rgba(47')) blue.push(args); },
  };
  water.drawLayer(ctx, world, 40);
  /**
   * The blue rectangles drawn in one cell.
   * @param {number} x - the cell's column
   * @returns {number[][]} their [left, top, width, height]
   */
  const inCell = (x) => blue.filter(([left]) => left >= x * 40 && left < (x + 1) * 40);
  /**
   * How much blue was painted in one cell, as a share of the cell.
   * @param {number} x - the cell's column
   * @returns {number} 0 to 1
   */
  const painted = (x) => inCell(x).reduce((sum, [, , width, height]) => sum + width * height, 0) / 1600;
  // All falling: one stream from the top of the cell to the bottom, in the middle, a quarter of a cell wide.
  assert.deepEqual(inCell(0), [[15, 0, 10, 40]]);
  // All lying: a pool across the cell, a quarter of a cell deep.
  assert.deepEqual(inCell(1), [[40, 30, 40, 10]]);
  // Half and half: a shallow pool with a stream coming down onto it.
  assert.equal(inCell(2).length, 2);
  // And always as much blue as there is water.
  for (const x of [0, 1, 2]) assert.ok(Math.abs(painted(x) - shown[x]) < 1e-9, `cell ${x}: ${painted(x)} painted for ${shown[x]} of water`);
});
