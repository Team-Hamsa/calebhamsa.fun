/**
 * gears.test.js — checks the ⚙️ pack with the real blocks: the crank,
 * gear trains, a crank-powered generator lighting a lamp, a battery
 * running a motor, a motor and generator winding down, and a water wheel.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, getBlock, setBlock, setFluid, tick } from '../js/world.js';
import { allSystems, blockInfo, blocksInPack, isKnownBlock, refreshSignals } from '../js/blocks/registry.js';
import { drawWorld } from '../js/block-art.js';
import { DROP_POWER, PUMP_HEAD, PUMP_RATE } from '../js/fluids.js';
import gears, {
  CRANK_SPEED, CRANK_STRENGTH, GENERATOR_GAIN, GENERATOR_TORQUE, WHEEL_SPEED, WHEEL_STRENGTH, spinAt, turned, wheelSource,
} from '../js/blocks/gears.js';
import { REFERENCE_CURRENT, plusSide } from '../js/circuit.js';

/** What each letter in a test picture means. */
const LETTERS = {
  '.': 'air', '#': 'stone', W: 'wire', L: 'lamp', B: 'battery', s: 'gearSmall', G: 'gearBig',
  '-': 'axle', R: 'crankCW', Q: 'crankCCW', M: 'motor', E: 'generator', O: 'waterWheel', F: 'faucet',
  P: 'pipe', '^': 'pumpUp', T: 'turbine', D: 'drain', K: 'clicker', '/': 'switchClosed',
  Z: 'winch', r: 'rope', I: 'ironWeight', c: 'crate',
};

/**
 * Build a world from a picture and run it for some ticks.
 * @param {string[]} rows - the picture
 * @param {number} ticks - how many ticks to run
 * @returns {object} the world
 */
function run(rows, ticks) {
  const world = createWorld(rows[0].length, rows.length);
  rows.forEach((row, y) => [...row].forEach((letter, x) => setBlock(world, x, y, LETTERS[letter])));
  const systems = allSystems();
  for (let i = 0; i < ticks; i++) tick(world, systems, blockInfo);
  return world;
}

/**
 * How bright the lamp at x, y is.
 * @param {object} world - the world
 * @param {number} x - column
 * @param {number} y - row
 * @returns {number} its level
 */
const lampLevel = (world, x, y) => world.signals.electric.cells.get(y * world.width + x)?.level ?? 0;

test('the gears tab shows one of each block (the crank is shown stopped)', () => {
  assert.deepEqual(blocksInPack('gears'), ['gearSmall', 'gearBig', 'axle', 'crankStop', 'waterWheel', 'motor', 'generator']);
  assert.equal(isKnownBlock('crankCW'), true);
  assert.deepEqual(gears.tab, { id: 'gears', icon: '⚙️', label: 'Gears' });
});

test('✋ on a crank: stopped → ↻ → ↺ → stopped', () => {
  const world = createWorld(1, 1);
  setBlock(world, 0, 0, 'crankStop');
  const seen = [];
  for (let i = 0; i < 3; i++) {
    assert.equal(blockInfo(getBlock(world, 0, 0)).use({ world, x: 0, y: 0 }), true);
    seen.push(getBlock(world, 0, 0));
  }
  assert.deepEqual(seen, ['crankCW', 'crankCCW', 'crankStop']);
});

test('a crank turns a gear train: each gear the other way, big → small twice as fast', () => {
  const world = run(['RsGs'], 1);
  assert.equal(spinAt(world, 1, 0), 1);
  assert.equal(spinAt(world, 2, 0), -0.5);
  assert.equal(spinAt(world, 3, 0), 1);
});

test('a crank turning a generator lights a lamp, whichever way it turns', () => {
  for (const crank of ['R', 'Q']) {
    // The generator sits in a loop of wire with a lamp; the crank turns it from above.
    const world = run([
      `.${crank}.`,
      'WEW',
      'W.W',
      'WLW',
    ], 3);
    assert.ok(lampLevel(world, 1, 3) > 0.3, `crank ${crank}: lamp at ${lampLevel(world, 1, 3)}`);
  }
});

test('a battery turns a motor, and turning the battery round turns the motor the other way', () => {
  // Battery on the left: current goes left → right through the motor: ↻.
  const forward = run(['.s.', 'WMW', 'B.W', 'WWW'], 3);
  assert.ok(spinAt(forward, 1, 0) > 0.5, `forward: ${spinAt(forward, 1, 0)}`); // the gear shares the motor's shaft
  // Battery on the right: current goes right → left: ↺.
  const backward = run(['.s.', 'WMW', 'W.B', 'WWW'], 3);
  assert.ok(spinAt(backward, 1, 0) < -0.5, `backward: ${spinAt(backward, 1, 0)}`);
});

test('a motor powered only by its own generator winds down and stops', () => {
  const world = createWorld(4, 3);
  const rows = ['WMEW', 'W..W', 'WWWW'];
  rows.forEach((row, y) => [...row].forEach((letter, x) => setBlock(world, x, y, LETTERS[letter])));
  // Give it a push to start: pretend the generator was spinning fast.
  world.signals.spin = { cells: new Map([[2, { speed: 2 }]]), wheelFlow: new Map() };
  const systems = allSystems();
  for (let i = 0; i < 40; i++) tick(world, systems, blockInfo);
  assert.equal(spinAt(world, 1, 0), 0);
  assert.equal(spinAt(world, 2, 0), 0);
});

test('water falling through a water wheel turns it', () => {
  const world = createWorld(3, 5);
  const rows = ['.F.', '...', '.O.', '...', '###'];
  rows.forEach((row, y) => [...row].forEach((letter, x) => setBlock(world, x, y, LETTERS[letter])));
  setFluid(world, 'water', 1, 1, 0);
  const systems = allSystems();
  let fastest = 0;
  for (let i = 0; i < 30; i++) {
    tick(world, systems, blockInfo);
    fastest = Math.max(fastest, spinAt(world, 1, 2));
  }
  assert.ok(fastest > 0.1, `the wheel only reached ${fastest}`);
});

test('the water wheel is drawn with its spinning record (so it can be seen turning)', () => {
  const world = createWorld(3, 5);
  ['.F.', '...', '.O.', '...', '###'].forEach((row, y) => [...row].forEach((letter, x) => setBlock(world, x, y, LETTERS[letter])));
  const systems = allSystems();
  for (let i = 0; i < 30; i++) tick(world, systems, blockInfo);
  refreshSignals(world);
  let handed;
  const spy = (name) => (name === 'waterWheel' ? { ...blockInfo(name), drawSignals: (...args) => { handed = args[5]; } } : blockInfo(name));
  const ctx = { fillRect() {}, strokeRect() {}, fillText() {}, fillStyle: '', globalAlpha: 1 };
  drawWorld(ctx, world, 10, spy, '#7ec8ff');
  assert.ok(handed && typeof handed.speed === 'number' && handed.speed > 0, `wheel got ${JSON.stringify(handed)}`);
});

test('gears don\'t make power: a geared-up generator is harder to turn, and the lamp never gets more than the crank puts in', () => {
  const direct = run(['.R.', 'WEW', 'W.W', 'WLW'], 10);
  const gearedUp = run(['RGs.', '.WEW', '.W.W', '.WLW'], 10); // crank → big gear → small gear (2× faster) → generator
  // Geared up, the generator pushes back twice as hard on twice the turning: the crank slows down.
  assert.ok(spinAt(gearedUp, 0, 0) < spinAt(direct, 1, 0), `crank ${spinAt(gearedUp, 0, 0)} vs ${spinAt(direct, 1, 0)}`);
  // The most work a crank can do: half its strength at half its top speed.
  const crankBest = (CRANK_STRENGTH / 2) * (CRANK_SPEED / 2);
  for (const [world, x] of [[direct, 1], [gearedUp, 2]]) {
    const current = lampLevel(world, x, 3) * REFERENCE_CURRENT;
    const lampPower = current * current * 1; // a lamp's resistance is 1
    assert.ok(lampPower <= crankBest * (GENERATOR_GAIN / GENERATOR_TORQUE), `lamp gets ${lampPower}`);
    assert.ok(lampPower > 0.05, 'the lamp should still light');
  }
});

test('a geared-up motor and generator wind down when the crank stops (no perpetual motion)', () => {
  const world = createWorld(5, 3);
  ['.WWWW', 'RMGsE', '.WWWW'].forEach((row, y) => [...row].forEach((letter, x) => setBlock(world, x, y, LETTERS[letter])));
  const systems = allSystems();
  for (let i = 0; i < 20; i++) tick(world, systems, blockInfo);
  setBlock(world, 0, 1, 'crankStop');
  for (let i = 0; i < 60; i++) tick(world, systems, blockInfo);
  for (let x = 1; x <= 4; x++) assert.equal(spinAt(world, x, 1), 0, `x=${x} still turning`);
});

test('a generator lighting more lamps is harder to turn: the crank slows down', () => {
  const one = run(['.R.', 'WEW', 'W.W', 'WLW'], 10);
  const two = run(['.R.', 'WEW', 'WLW', 'WLW'], 10); // a second lamp side by side: more current
  assert.ok(spinAt(two, 1, 0) < spinAt(one, 1, 0), `one lamp ${spinAt(one, 1, 0)}, two ${spinAt(two, 1, 0)}`);
});

/**
 * The real current through the part at x, y.
 * @param {object} world - the world
 * @param {number} x - column
 * @param {number} y - row
 * @returns {number} its current
 */
const currentAt = (world, x, y) => world.signals.electric.cells.get(y * world.width + x)?.current ?? 0;

test('a generator joined by plain wire is very hard to turn, and you can SEE its big current', () => {
  const world = run(['.R.', 'WEW', 'W.W', 'WWW'], 10);
  assert.ok(spinAt(world, 1, 0) > 0.05 && spinAt(world, 1, 0) < 0.2, `crank ${spinAt(world, 1, 0)}`);
  // Hard to turn BECAUSE lots of current flows: more than a lamp would ever take.
  assert.ok(currentAt(world, 1, 1) > 1, `current ${currentAt(world, 1, 1)}`);
  assert.equal(world.signals.electric.flowing, true);
});

test('a generator that was short-circuited is fine again once the wiring is fixed', () => {
  const systems = allSystems();
  const fresh = run(['.R.', 'WEW', 'W.W', 'WLW'], 10);
  // Swap the plain wire for a lamp: as easy to turn, and as bright, as if it had never been shorted.
  const lamp = run(['.R.', 'WEW', 'W.W', 'WWW'], 10);
  setBlock(lamp, 1, 3, 'lamp');
  for (let i = 0; i < 10; i++) tick(lamp, systems, blockInfo);
  assert.ok(Math.abs(spinAt(lamp, 1, 0) - spinAt(fresh, 1, 0)) < 1e-9, `crank ${spinAt(lamp, 1, 0)} vs ${spinAt(fresh, 1, 0)}`);
  assert.ok(Math.abs(lampLevel(lamp, 1, 3) - lampLevel(fresh, 1, 3)) < 1e-9);
  assert.ok(lampLevel(lamp, 1, 3) > 0.5);
  // Cut the wire: nothing wired up, so it spins freely at the crank's top speed.
  const cut = run(['.R.', 'WEW', 'W.W', 'WWW'], 10);
  setBlock(cut, 1, 3, 'air');
  for (let i = 0; i < 10; i++) tick(cut, systems, blockInfo);
  assert.equal(spinAt(cut, 1, 0), CRANK_SPEED);
});

test('a generator that had a battery wired straight across it spins freely again when the battery and wires are gone', () => {
  const world = run(['.Q.', 'WEW', 'W.W', 'WBW'], 10);
  assert.ok(Math.abs(spinAt(world, 1, 0)) < 0.05, `held nearly still, but turns ${spinAt(world, 1, 0)}`);
  for (const [x, y] of [[0, 1], [2, 1], [0, 2], [2, 2], [0, 3], [1, 3], [2, 3]]) setBlock(world, x, y, 'air');
  const systems = allSystems();
  for (let i = 0; i < 10; i++) tick(world, systems, blockInfo);
  assert.equal(spinAt(world, 1, 0), -CRANK_SPEED);
});

test('a battery straight across a generator: one answer, whichever was there first, the battery or the crank', () => {
  // [crank, what happens]: turned AGAINST the battery it spins freely (a real one would be helped along);
  // turned the way that ADDS to the battery's current, a crank is too weak to move it at all.
  for (const [crank, speed, current, spark] of [['crankCW', 1, 1.887, false], ['crankCCW', 0, 9.434, true]]) {
    const ends = [];
    for (const order of ['crank first', 'battery first', 'crank changed']) {
      const world = run(['...', 'WEW', 'W.W', 'WWW'], 0);
      const systems = allSystems();
      if (order !== 'battery first') setBlock(world, 1, 0, order === 'crank first' ? crank : (crank === 'crankCW' ? 'crankCCW' : 'crankCW'));
      if (order !== 'crank first') setBlock(world, 1, 3, 'battery');
      for (let i = 0; i < 12; i++) tick(world, systems, blockInfo);
      setBlock(world, 1, 0, crank);
      setBlock(world, 1, 3, 'battery');
      for (let i = 0; i < 40; i++) tick(world, systems, blockInfo);
      ends.push([spinAt(world, 1, 0), currentAt(world, 1, 1)]);
      assert.equal(world.signals.electric.cells.get(3 * 3 + 1).spark, spark, `${crank}, ${order}`);
    }
    for (const [turns, amps] of ends) {
      assert.ok(Math.abs(turns - speed) < 1e-9, `${crank}: turns ${ends.map((end) => end[0])}`);
      assert.ok(Math.abs(amps - current) < 0.001, `${crank}: currents ${ends.map((end) => end[1])}`);
    }
  }
});

test('a battery never turns a generator into free turning: with a lamp in the loop it only ever makes the crank\'s job harder or the same', () => {
  const free = CRANK_SPEED;
  const against = run(['.R..', 'WEWW', 'W..L', 'WBWW'], 20); // turned against the battery: no help, no hindrance
  const adding = run(['.Q..', 'WEWW', 'W..L', 'WBWW'], 20);  // turned so its push adds to the battery's: harder
  assert.equal(spinAt(against, 1, 0), free);
  assert.ok(Math.abs(spinAt(adding, 1, 0)) < 0.5 && Math.abs(spinAt(adding, 1, 0)) > 0.3, `turns ${spinAt(adding, 1, 0)}`);
  assert.ok(lampLevel(adding, 3, 2) > lampLevel(against, 3, 2)); // battery and generator together: a brighter lamp
});

test('a slowly turned generator still makes a little electricity: a dim lamp, not a dark one', () => {
  // Geared down three times (small → big, three times): the generator
  // hanging under the last gear turns 8 times slower than the crank.
  const lit = run(['RsG-sG-sG.', '.......WEW', '.......W.W', '.......WLW'], 10);
  const speed = Math.abs(spinAt(lit, 8, 1));
  assert.ok(speed > 0.1 && speed < 0.13, `generator turns ${speed}`);
  const ideal = (speed * GENERATOR_GAIN) / 1.05; // volts ÷ (lamp 1 + generator 0.05)
  assert.ok(currentAt(lit, 8, 3) > ideal * 0.85 && currentAt(lit, 8, 3) <= ideal + 1e-9, `lamp current ${currentAt(lit, 8, 3)}, ideal ${ideal}`);
});

test('a generator gives back close to 8 tenths of the work that turns it, and never more', () => {
  for (const rows of [['.R.', 'WEW', 'W.W', 'WLW'], ['RGs.', '.WEW', '.W.W', '.WLW'], ['.R.', 'WEW', 'WLW', 'WLW']]) {
    const world = run(rows, 10);
    const crankX = rows[0].indexOf('R');
    const generatorX = rows[1].indexOf('E');
    const speed = spinAt(world, crankX, 0);
    const workIn = CRANK_STRENGTH * (1 - speed / CRANK_SPEED) * speed; // how hard the crank pushes × how fast
    const current = currentAt(world, generatorX, 1);
    const workOut = Math.abs(spinAt(world, generatorX, 1)) * GENERATOR_GAIN * current; // volts × current
    const share = workOut / workIn;
    assert.ok(share <= GENERATOR_GAIN / GENERATOR_TORQUE + 1e-9, `${rows.join('/')}: gives back ${share}`);
    assert.ok(share > 0.75, `${rows.join('/')}: only gives back ${share}`);
  }
});

test('two generators in a row, each with its own crank, both feel ALL the current they make together', () => {
  const world = run(['.R..', 'WEWW', 'L..W', 'WEWW', '.Q..'], 10);
  const current = currentAt(world, 0, 2);
  assert.ok(current > 0.5, `the lamp gets ${current}`);
  for (const [y, crankY] of [[1, 0], [3, 4]]) {
    const speed = Math.abs(spinAt(world, 1, crankY));
    const push = CRANK_STRENGTH * (1 - speed / CRANK_SPEED); // how hard this crank is pushing
    assert.ok(Math.abs(push - GENERATOR_TORQUE * current) < 0.05, `row ${y}: crank pushes ${push}, current ${current}`);
  }
});

test('two generators in a row powering a motor on their own gears still wind down (no perpetual motion)', () => {
  for (const crank of ['crankCW', 'crankCCW']) {
    const world = run(['.R..', 'WEWW', 'Ms.W', 'Ws.W', 'WEWW'], 0);
    setBlock(world, 1, 0, crank);
    const systems = allSystems();
    for (let i = 0; i < 20; i++) tick(world, systems, blockInfo);
    assert.ok(currentAt(world, 0, 2) > 0.3, 'the motor should be getting current while the crank turns');
    setBlock(world, 1, 0, 'air');
    for (let i = 0; i < 60; i++) tick(world, systems, blockInfo);
    for (const [x, y] of [[1, 1], [0, 2], [1, 4]]) assert.equal(spinAt(world, x, y), 0, `${crank}: ${x},${y} still turning`);
  }
});

test('a generator with a steady load does not flicker', () => {
  for (const rows of [['.R.', 'WEW', 'W.W', 'WWW'], ['.R.', 'WEW', 'W.W', 'WLW'], ['.Q..', 'WEWW', 'W..L', 'WBWW'], ['.R..', 'WEWW', 'W..L', 'WBWW']]) {
    const world = run(rows, 30);
    const systems = allSystems();
    const seen = new Set();
    for (let i = 0; i < 10; i++) {
      tick(world, systems, blockInfo);
      seen.add(`${spinAt(world, 1, 1)}/${currentAt(world, 1, 1)}`);
    }
    assert.equal(seen.size, 1, `${rows.join('/')} flickers: ${[...seen].join(' ')}`);
  }
});

test('a battery wired straight across a stopped generator sparks (a short circuit through its coil)', () => {
  const world = run(['WWW', 'B.E', 'WWW'], 3);
  const battery = world.signals.electric.cells.get(3);
  assert.ok(battery.current > 9, `only ${battery.current} flows`);
  assert.equal(battery.spark, true);
  // And it keeps sparking while a crank tries (and fails) to turn the generator.
  const cranked = run(['.Q.', 'WEW', 'W.W', 'WBW'], 20);
  assert.equal(cranked.signals.electric.cells.get(3 * 3 + 1).spark, true);
});

test('water power cannot loop forever either: the energy books balance at every step', () => {
  // 1. A pump: the most work it does on the water (half its top flow at half
  //    its top height) is less than the electricity it uses (current² × its
  //    resistance of 1). Both grow the same way with more batteries.
  const pumpBest = DROP_POWER * (PUMP_RATE / 2) * (PUMP_HEAD / 2);
  const pumpUses = REFERENCE_CURRENT * REFERENCE_CURRENT * blockInfo('pumpUp').part.resistance;
  assert.ok(pumpBest < 0.9 * pumpUses, `pump gives ${pumpBest}, uses ${pumpUses}`);
  // 2. A wheel: the most work it does (half its strength at half its top
  //    speed) is exactly what water falling one cell gives up, never more.
  const flow = 0.05;
  const wheelBest = ((WHEEL_STRENGTH * flow) / 2) * (WHEEL_SPEED / 2);
  assert.ok(Math.abs(wheelBest - DROP_POWER * flow) < 1e-12);
  // 3. A generator gives back less electricity than the work that turns it.
  assert.ok(GENERATOR_GAIN / GENERATOR_TORQUE < 1);
});

// =============================================================
// Water wheels: water has to FALL to give its push
// =============================================================

/**
 * Build a world from a picture (without running it).
 * @param {string[]} rows - the picture
 * @returns {object} the world
 */
function build(rows) {
  const world = createWorld(rows[0].length, rows.length);
  rows.forEach((row, y) => [...row].forEach((letter, x) => setBlock(world, x, y, LETTERS[letter])));
  return world;
}

/**
 * Run a world for some more ticks.
 * @param {object} world - the world
 * @param {number} ticks - how many
 * @returns {object} the world
 */
function more(world, ticks) {
  const systems = allSystems();
  for (let i = 0; i < ticks; i++) tick(world, systems, blockInfo);
  return world;
}

/**
 * All the water in the world.
 * @param {object} world - the world
 * @returns {number} the total amount
 */
const allWater = (world) => world.fluid.water.reduce((sum, amount) => sum + amount, 0);

/**
 * The real current through the part at x, y (0 if none).
 * @param {object} world - the world
 * @param {number} x - column
 * @param {number} y - row
 * @returns {number} its current
 */
const amps = (world, x, y) => world.signals.electric.cells.get(y * world.width + x)?.current ?? 0;

test('one faucet falling one cell through a water wheel is as good as one crank', () => {
  const world = run(['.F.', '.O.', '.D.', '###'], 200);
  const wheel = wheelSource(world, 1, 1);
  assert.ok(Math.abs(wheel.speed - CRANK_SPEED) < 0.02, `top speed ${wheel.speed}`);
  assert.ok(Math.abs(wheel.strength - CRANK_STRENGTH) < 0.1, `strength ${wheel.strength}`);
});

test('a wheel in a level stream still turns, but feebly: the water hardly falls', () => {
  const world = run(['F.....', '..O..D', '######'], 300);
  // Slow water, slow wheel: much slower than one under a faucet (which turns at 1).
  assert.ok(spinAt(world, 2, 1) > 0.1 && spinAt(world, 2, 1) < 0.5, `with nothing to push it turns at ${spinAt(world, 2, 1)}`);
  const wheel = wheelSource(world, 2, 1);
  assert.ok(wheel.strength > 0 && wheel.strength < CRANK_STRENGTH / 3, `strength ${wheel.strength}`);
  // The most work it can do is less than a tenth of a crank's.
  const best = (wheel.strength / 2) * (wheel.speed / 2);
  assert.ok(best < 0.1 * (CRANK_STRENGTH / 2) * (CRANK_SPEED / 2), `best work ${best}`);
});

test('a taller fall is stronger: three wheels stacked under one faucet each get a full cell of fall', () => {
  const world = run(['#F#', '#O#', '#O#', '#O#', '#D#'], 200);
  for (const y of [1, 2, 3]) {
    const wheel = wheelSource(world, 1, y);
    assert.ok(wheel.strength > 0.9 * CRANK_STRENGTH, `wheel ${y}: strength ${wheel.strength}`);
    assert.ok(wheel.strength < 1.6 * CRANK_STRENGTH, `wheel ${y}: strength ${wheel.strength}`);
  }
});

test('a wheel is never credited with more work than the water gave up at it', () => {
  const pictures = [
    ['.F.', '.O.', '.D.', '###'],
    ['.F.', '...', '.O.', '.D.'],
    ['F.....', '..O..D', '######'],
    ['#F#', '#O#', '#O#', '#O#', '#D#'],
    ['#FFFF#', '#....#', '#....#', '###O##', '###D##'],
    ['..F..', '.....', 'D.O.D', '#####'],
  ];
  for (const rows of pictures) {
    const world = build(rows);
    for (let i = 0; i < 120; i++) {
      more(world, 1);
      world.cells.forEach((name, index) => {
        if (name !== 'waterWheel') return;
        const wheel = wheelSource(world, index % world.width, Math.floor(index / world.width));
        if (!wheel) return;
        const best = (wheel.strength / 2) * (Math.abs(wheel.speed) / 2);
        const gaveUp = DROP_POWER * world.signals.spin.wheelWork.get(index);
        assert.ok(best <= gaveUp + 1e-9, `${rows.join('/')}: wheel could do ${best}, water gave ${gaveUp}`);
      });
    }
  }
});

test('water standing still in a pool gives a wheel no push at all', () => {
  const world = build(['#...#', '#.O.#', '#####']);
  for (const x of [1, 2, 3]) setFluid(world, 'water', x, 1, 1);
  more(world, 100);
  assert.equal(spinAt(world, 2, 1), 0);
  assert.equal(wheelSource(world, 2, 1), null);
});

test('more water makes a wheel STRONGER, not faster: three faucets push three times as hard as one', () => {
  const one = run(['.F.', '...', '#O#', '#D#'], 300);
  const three = run(['FFF', '...', '#O#', '#D#'], 300);
  const weak = wheelSource(one, 1, 2);
  const strong = wheelSource(three, 1, 2);
  assert.ok(Math.abs(weak.speed - strong.speed) < 0.05, `top speeds ${weak.speed}, ${strong.speed}`);
  assert.ok(strong.strength > 2.7 * weak.strength && strong.strength < 3.1 * weak.strength, `strengths ${weak.strength}, ${strong.strength}`);
});

test('more water lifts more: one faucet\'s wheel stalls on the iron weight, three faucets lift it', () => {
  const LIFT = { ...LETTERS, w: 'winch', '|': 'rope', I: 'ironWeight' };
  const rows = (top) => [top, '....', '#Ow.', '#D|.', '..|.', '..I.', '....', '####'];
  const worlds = ['.F..', 'FFF.'].map((top) => {
    const world = createWorld(4, 8);
    rows(top).forEach((row, y) => [...row].forEach((letter, x) => setBlock(world, x, y, LIFT[letter])));
    return more(world, 300);
  });
  assert.equal(worlds[0].cells.indexOf('ironWeight'), 5 * 4 + 2); // too heavy for one faucet's wheel
  assert.ok(worlds[1].cells.indexOf('ironWeight') < 5 * 4 + 2, 'three faucets should lift the iron weight');
});

test('a longer fall makes a wheel faster and stronger: the water brings the push of its whole fall to the wheel', () => {
  const short = wheelSource(run(['#F#', '#O#', '#D#'], 300), 1, 1);                                              // falls 1 cell
  const tall = wheelSource(run(['#F#', '#.#', '#.#', '#.#', '#O#', '#D#'], 300), 1, 4);                               // falls 4 cells
  const taller = wheelSource(run(['#F#', '#.#', '#.#', '#.#', '#.#', '#.#', '#.#', '#.#', '#.#', '#O#', '#D#'], 300), 1, 9); // falls 9 cells
  assert.ok(Math.abs(short.speed - 1) < 0.02 && Math.abs(short.strength - CRANK_STRENGTH) < 0.1, JSON.stringify(short));
  assert.ok(Math.abs(tall.speed - 2) < 0.1 && Math.abs(tall.strength - 2 * CRANK_STRENGTH) < 0.2, JSON.stringify(tall));
  assert.ok(Math.abs(taller.speed - 3) < 0.15 && Math.abs(taller.strength - 3 * CRANK_STRENGTH) < 0.3, JSON.stringify(taller));
  // Nine times the fall is nine times the work it can do: three times as fast × three times as strong.
});

test('water that falls onto the ground has splashed its push away: a wheel further along the stream gets none of it', () => {
  const level = wheelSource(run(['F......', '....O.D', '#######'], 400), 4, 1);
  const afterFall = wheelSource(run(['F......', '.......', '.......', '.......', '....O.D', '#######'], 400), 4, 4);
  assert.ok(afterFall.strength < 1.1 * level.strength, `after a 3 cell fall ${afterFall.strength}, level ${level.strength}`);
  assert.ok(afterFall.strength < CRANK_STRENGTH / 3, `strength ${afterFall.strength}`);
});

test('water spilling off both sides of a wheel pushes it both ways: that cancels, it does not make it stronger', () => {
  // One faucet, one cell of fall onto a wheel on a ledge. The water runs off...
  const oneWay = run(['...F...', '.......', '...O...', '####...', '.......', 'DDDDDDD'], 400);   // ...all to the right
  const lopsided = run(['...F...', '.......', '...O...', '.###...', '.......', 'DDDDDDD'], 400); // ...mostly right, some left
  const balanced = run(['...F...', '.......', '...O...', '..###..', '.......', 'DDDDDDD'], 400); // ...half each way
  const full = wheelSource(oneWay, 3, 2).strength;
  const part = wheelSource(lopsided, 3, 2).strength;
  assert.ok(full <= Math.SQRT2 * CRANK_STRENGTH + 0.1, `one way: ${full}`); // one faucet falling two cells, at the very most
  assert.ok(part < full, `lopsided ${part} should be weaker than one way ${full}`);
  assert.equal(wheelSource(balanced, 3, 2), null);
  assert.equal(spinAt(balanced, 3, 2), 0);
});

test('water falling straight down through a wheel (nothing sideways) turns it ↻, in a mirrored machine too', () => {
  for (const rows of [['..F...', '#.O#..', '#..#..', '#.PPPD', '######'], ['...F..', '..#O.#', '..#..#', 'DPPP.#', '######']]) {
    const world = run(rows, 300);
    const at = world.cells.indexOf('waterWheel');
    assert.ok(spinAt(world, at % world.width, Math.floor(at / world.width)) > 0.5, rows.join('/'));
  }
});

test('a mirrored water wheel machine turns just as fast, the other way', () => {
  const pictures = [
    ['..F...', '#.O..D', '#.#.##', '######'],            // the water runs off one side
    ['..F...', '..O...', '#..#D#', '######'],            // down into a basin that spills one way
    ['...F..', '...O..', '##.P.D', '######'],            // down onto a pipe elbow
    ['F.....', '..O..D', '######'],                      // a level stream
    ['F.....', '......', '.#O..D', '.#####'],            // in from one side and above, out the other side
  ];
  for (const rows of pictures) {
    const mirrored = rows.map((row) => [...row].reverse().join(''));
    const a = run(rows, 400);
    const b = run(mirrored, 400);
    const at = a.cells.indexOf('waterWheel');
    const x = at % a.width;
    const y = Math.floor(at / a.width);
    const speed = spinAt(a, x, y);
    assert.ok(Math.abs(speed) > 0.1, `${rows.join('/')}: only turns ${speed}`);
    assert.ok(Math.abs(speed + spinAt(b, a.width - 1 - x, y)) < 1e-9, `${rows.join('/')}: ${speed} as drawn, ${spinAt(b, a.width - 1 - x, y)} mirrored`);
    const one = wheelSource(a, x, y);
    const other = wheelSource(b, a.width - 1 - x, y);
    assert.ok(Math.abs(one.strength - other.strength) < 1e-9, `${rows.join('/')}: strengths ${one.strength}, ${other.strength}`);
  }
});

// =============================================================
// No water machine runs forever: every pump → wheels → generator
// loop winds down once its battery is taken away.
// =============================================================

/**
 * Check a loop machine: with its batteries in, water really goes round;
 * with every battery swapped for plain wire, it all stops, and no water
 * was made or lost.
 * @param {string} what - the machine's name, for messages
 * @param {object} world - the world, batteries placed
 * @param {number[]} pump - the pump's [x, y]
 * @param {number[][]} wheels - every wheel's [x, y]
 * @returns {void}
 */
function assertWindsDown(what, world, pump, wheels) {
  const water = allWater(world);
  more(world, 300);
  assert.ok(amps(world, ...pump) > 0.15, `${what}: the battery should run the pump (${amps(world, ...pump)})`);
  const flowing = Math.abs(world.signals.spin.wheelFlow.get(wheels[0][1] * world.width + wheels[0][0]));
  assert.ok(flowing > 0.005, `${what}: water should flow through the wheels while the battery is in (${flowing})`);
  world.cells.forEach((name, index) => {
    if (name === 'battery') setBlock(world, index % world.width, Math.floor(index / world.width), 'wire');
  });
  more(world, 800);
  for (let i = 0; i < 50; i++) {
    more(world, 1);
    assert.ok(amps(world, ...pump) < 0.01, `${what}: the pump still gets ${amps(world, ...pump)} with no battery`);
    for (const [x, y] of wheels) assert.equal(spinAt(world, x, y), 0, `${what}: the wheel at ${x},${y} still turns`);
  }
  assert.ok(Math.abs(allWater(world) - water) < 1e-6, `${what}: water went from ${water} to ${allWater(world)}`);
}

test('the pump → three (or five) wheels in a level channel → generators loop winds down without its battery', () => {
  // The machine from issue #17. The pump (^) lifts water from the bottom
  // channel to the top one; it drops through a turbine (T, only there so
  // the wire can cross the water) and flows back through the wheels (O),
  // each with a generator (E) on top, all wired in a row to the pump.
  for (const count of [3, 5]) {
    const width = 2 * count + 3;
    const world = build([
      '#'.repeat(width),
      `#${'.'.repeat(width - 2)}#`,
      `W^${'EW'.repeat(count - 1)}ETW`,
      `W.${'O.'.repeat(count)}W`,
      `W${'#'.repeat(width - 2)}W`,
      'W'.repeat(width),
    ]);
    for (let x = 1; x < width - 1; x++) {
      setFluid(world, 'water', x, 3, 1);
      setFluid(world, 'water', x, 1, 0.3);
    }
    setBlock(world, 3, 5, 'battery');
    const wheels = Array.from({ length: count }, (_, i) => [2 + 2 * i, 3]);
    assertWindsDown(`${count} wheels in a channel`, world, [1, 2], wheels);
  }
});

/**
 * Build a ring of pipe lying flat-ish: a pump on the left pushes water up
 * and along the top through `count` wheels side by side (no fall at all),
 * and it comes back along the bottom. The last wheel turns a generator
 * through `chain` (gears), and the generator is wired only to the pump
 * and a battery.
 * @param {number} count - how many wheels
 * @param {string} chain - the gears from the last wheel to the generator, like 'GsE'
 * @returns {{world: object, pump: number[], wheels: number[][]}} the machine
 */
function levelRing(count, chain) {
  const last = count + chain.length;
  /**
   * Finish a row: stone out to the wire that runs down the right-hand side.
   * @param {string} start - the left part of the row
   * @returns {string} the whole row
   */
  const row = (start) => `${start}${'#'.repeat(last - start.length)}W`;
  const world = build([
    'W'.repeat(last + 1),
    `W${'#'.repeat(count)}${chain}`,
    row(`WP${'O'.repeat(count)}P`),
    row(`W^${'W'.repeat(count)}P`),
    row(`#PPT${'P'.repeat(count - 1)}`),
    `...${'W'.repeat(last - 2)}`,
  ]);
  world.cells.forEach((name, index) => {
    if (['pipe', 'waterWheel', 'turbine'].includes(name)) world.fluid.water[index] = index >= 4 * world.width ? 1 : 0.5;
  });
  setBlock(world, 0, 1, 'battery');
  return { world, pump: [1, 3], wheels: Array.from({ length: count }, (_, i) => [2 + i, 2]) };
}

test('a level ring of pipe with a pump, wheels and a geared generator winds down without its battery', () => {
  for (const count of [3, 4, 6]) {
    for (const chain of ['GsE', 'Gs-GsE', 'sGE']) { // geared up ×2, up ×4, and down ÷2
      const { world, pump, wheels } = levelRing(count, chain);
      assertWindsDown(`ring of ${count} wheels, gears ${chain}`, world, pump, wheels);
    }
  }
});

test('a level ring with no battery, crank or faucet EVER never gets going by itself', () => {
  const { world, pump, wheels } = levelRing(3, 'GsE');
  setBlock(world, 0, 1, 'wire');
  more(world, 1500);
  assert.ok(amps(world, ...pump) < 0.01, `pump gets ${amps(world, ...pump)}`);
  for (const [x, y] of wheels) assert.equal(spinAt(world, x, y), 0);
});

/**
 * Build a tall loop: a pump lifts water up a pipe on the left, it runs
 * along the top and falls down the right through `count` wheels stacked
 * on one shaft (a real, tall fall), then back along the bottom to the
 * pump. The top wheel turns a generator through `chain`.
 * @param {number} count - how many stacked wheels
 * @param {string} chain - the gears from the top wheel to the generator
 * @param {number} batteries - how many batteries power the pump at first
 * @returns {{world: object, pump: number[], wheels: number[][]}} the machine
 */
function tallLoop(count, chain, batteries) {
  const last = 4 + chain.length;
  /**
   * Finish a row: stone out to the wire that runs down the right-hand side.
   * @param {string} start - the left part of the row
   * @returns {string} the whole row
   */
  const row = (start) => `${start}${'#'.repeat(last - start.length)}W`;
  const rows = ['W'.repeat(last + 1), row('WPPPP'), `WP##O${chain}`];
  for (let i = 1; i < count; i++) rows.push(row('WP##O'));
  rows.push(row('W^WWP'), row('#PPTP'), `...${'W'.repeat(last - 2)}`);
  const world = build(rows);
  world.cells.forEach((name, index) => {
    if (['pipe', 'waterWheel', 'turbine'].includes(name)) world.fluid.water[index] = 1;
  });
  for (let i = 0; i < batteries; i++) setBlock(world, 0, 1 + i, 'battery');
  return { world, pump: [1, count + 2], wheels: Array.from({ length: count }, (_, i) => [4, 2 + i]) };
}

test('a tall loop (pump up one side, stacked wheels down the other) winds down without its batteries, however it is geared', () => {
  const machines = [
    [3, 'E', 2], [3, 'GsE', 2], [3, 'sGE', 2], [3, 'Gs-GsE', 2],
    [5, 'E', 3], [5, 'GsE', 3], [6, 'sGE', 4], [6, 'sG-sGE', 4],
  ];
  for (const [count, chain, batteries] of machines) {
    const { world, pump, wheels } = tallLoop(count, chain, batteries);
    assertWindsDown(`${count} stacked wheels, gears ${chain}, ${batteries} batteries`, world, pump, wheels);
  }
});

test('a clicker (or a tapped switch) in a generator\'s loop gives no free electricity: the lamps never get more than 8 tenths of the crank\'s work', () => {
  for (const gate of ['K', '/']) {
    for (const chain of ['', 'Gs', 'Gs-Gs']) { // the generator geared ×1, ×2, ×4
      for (const lamps of [1, 3, 6]) {
        const at = 1 + chain.length; // the generator's column
        const width = at + 4 + lamps;
        const world = build([
          `${'.'.repeat(at)}W${gate}${'W'.repeat(lamps + 1)}`.padEnd(width, '.'),
          `R${chain}E..${'L'.repeat(lamps)}`.padEnd(width, '.'),
          `${'.'.repeat(at)}${'W'.repeat(lamps + 3)}`.padEnd(width, '.'),
        ]);
        let crankWork = 0;
        let lampEnergy = 0;
        for (let t = 0; t < 640; t++) { // 40 whole on-and-off beats
          // A hand tapping the switch: on for 5 ticks, off for 3.
          if (gate === '/') setBlock(world, at + 1, 0, t % 8 < 5 ? 'switchClosed' : 'switchOpen');
          more(world, 1);
          const speed = spinAt(world, 0, 1);
          crankWork += CRANK_STRENGTH * (1 - speed / CRANK_SPEED) * speed;
          for (let i = 0; i < lamps; i++) lampEnergy += amps(world, at + 3 + i, 1) ** 2;
        }
        const what = `${gate} gears "${chain}" ${lamps} lamps: lamps ${lampEnergy}, crank ${crankWork}`;
        assert.ok(lampEnergy > 1, what); // (it does light)
        assert.ok(lampEnergy <= (GENERATOR_GAIN / GENERATOR_TORQUE) * crankWork, what);
      }
    }
  }
});

/**
 * Check a loop machine that has a clicker in its wiring: take every
 * battery away part way through, and soon nothing runs any more.
 * @param {string} what - the machine's name, for messages
 * @param {object} world - the world, batteries placed
 * @param {number[]} pump - the pump's [x, y]
 * @param {number[][]} wheels - every wheel's [x, y]
 * @returns {void}
 */
function assertClickerWindsDown(what, world, pump, wheels) {
  const water = allWater(world);
  assert.equal(getBlock(world, 2, 0), 'wire');
  setBlock(world, 2, 0, 'clicker');
  let most = 0;
  for (let t = 0; t < 326; t++) {
    more(world, 1);
    most = Math.max(most, amps(world, ...pump));
  }
  assert.ok(most > 0.15, `${what}: the battery should run the pump (${most})`);
  world.cells.forEach((name, index) => {
    if (name === 'battery') setBlock(world, index % world.width, Math.floor(index / world.width), 'wire');
  });
  more(world, 2000);
  for (let i = 0; i < 64; i++) {
    more(world, 1);
    assert.ok(amps(world, ...pump) < 0.01, `${what}: the pump still gets ${amps(world, ...pump)} with no battery`);
    for (const [x, y] of wheels) assert.equal(spinAt(world, x, y), 0, `${what}: the wheel at ${x},${y} still turns`);
  }
  assert.ok(Math.abs(allWater(world) - water) < 1e-6, `${what}: water went from ${water} to ${allWater(world)}`);
}

test('a clicker in the loop doesn\'t keep a pump and wheel machine going without its battery, however high it is geared', () => {
  for (const count of [3, 4, 6]) {
    for (const chain of ['Gs-Gs-Gs-Gs-GsE', 'Gs-Gs-Gs-Gs-Gs-GsE']) { // geared up ×32 and ×64
      const { world, pump, wheels } = levelRing(count, chain);
      assertClickerWindsDown(`clicker ring of ${count} wheels, gears ${chain}`, world, pump, wheels);
    }
  }
  for (const [count, chain, batteries] of [[3, 'Gs-Gs-Gs-Gs-GsE', 2], [5, 'Gs-Gs-Gs-Gs-Gs-GsE', 3]]) {
    const { world, pump, wheels } = tallLoop(count, chain, batteries);
    assertClickerWindsDown(`clicker tall loop of ${count} wheels, gears ${chain}`, world, pump, wheels);
  }
});

test('a crank turning a generator that powers a motor pushing back does not flicker', () => {
  const world = createWorld(3, 3);
  ['.R.', 'WEW', 'WMW'].forEach((row, y) => [...row].forEach((letter, x) => setBlock(world, x, y, LETTERS[letter])));
  const systems = allSystems();
  const seen = [];
  for (let i = 0; i < 70; i++) {
    tick(world, systems, blockInfo);
    if (i >= 60) seen.push(`${spinAt(world, 1, 1).toFixed(6)}/${world.signals.spin.cells.get(4).jammed}`);
  }
  // (To six places, after 60 ticks: the motor takes up more current a
  // quarter of the way at a time, so the speed creeps the last millionths
  // of the way instead of landing at once.)
  assert.equal(new Set(seen).size, 1, `it flickers: ${seen.join(' ')}`);
});

test('redrawing does not move the gears on: refreshing twice changes nothing', () => {
  const world = createWorld(3, 3);
  ['.R.', 'WEW', 'WMW'].forEach((row, y) => [...row].forEach((letter, x) => setBlock(world, x, y, LETTERS[letter])));
  const systems = allSystems();
  for (let i = 0; i < 5; i++) tick(world, systems, blockInfo);
  const before = JSON.stringify([...world.signals.spin.cells]);
  const solves = world.signals.electric.solves;
  refreshSignals(world);
  refreshSignals(world);
  assert.equal(JSON.stringify([...world.signals.spin.cells]), before);
  assert.equal(world.signals.electric.solves, solves);
});

// ---- How the turning is DRAWN (issue #22) ----

/** Gears are drawn turning 4 times slower than they turn, 8 ticks a second: 1 turn/s = 1/32 of a turn a tick. */
const DRAWN_PER_TICK = 1 / 32;

/**
 * The spin record of the block at x, y.
 * @param {object} world - the world
 * @param {number} x - column
 * @param {number} y - row
 * @returns {object} its record
 */
const spinCell = (world, x, y) => world.signals.spin.cells.get(y * world.width + x);

/**
 * How far a drawing moved round between two looks, as a part of a turn
 * from −0.5 to 0.5 (+ is clockwise).
 * @param {number} before - `turned` before
 * @param {number} after - `turned` after
 * @returns {number} the step
 */
const stepRound = (before, after) => ((after - before + 1.5) % 1) - 0.5;

/**
 * Run one tick.
 * @param {object} world - the world
 * @returns {void}
 */
const oneTick = (world) => tick(world, allSystems(), blockInfo);

test('a gear slowing down keeps turning smoothly the same way: its picture never jumps', () => {
  // A faucet drives a water wheel and a gear. Then the faucet is dug away and the wheel runs down.
  const world = run(['.F.....', '.......', '.Os....', '.......', '.D.....', '#######'], 200);
  assert.ok(spinAt(world, 2, 2) > 0.9, 'the gear should be turning');
  setBlock(world, 1, 0, 'air');
  let before = turned(spinCell(world, 2, 2));
  for (let i = 0; i < 40; i++) {
    oneTick(world);
    const cell = spinCell(world, 2, 2);
    const step = stepRound(before, turned(cell));
    // Each tick the picture moves exactly as far as the gear really turned in that tick.
    assert.ok(Math.abs(step - cell.speed * DRAWN_PER_TICK) < 1e-9, `tick ${i}: moved ${step} at speed ${cell.speed}`);
    before = turned(cell);
  }
});

test('a gear that stops stays where it stopped, and starts again from there', () => {
  const world = run(['Rs'], 5);
  const moving = turned(spinCell(world, 1, 0));
  assert.ok(Math.abs(moving - 5 * DRAWN_PER_TICK) < 1e-9);
  setBlock(world, 0, 0, 'crankStop');
  for (let i = 0; i < 3; i++) oneTick(world);
  assert.equal(turned(spinCell(world, 1, 0)), moving); // it doesn't snap back to the start
  setBlock(world, 0, 0, 'crankCCW');
  oneTick(world);
  assert.ok(Math.abs(stepRound(moving, turned(spinCell(world, 1, 0))) + DRAWN_PER_TICK) < 1e-9); // one step back the other way
});

test('redrawing after a block changes never moves the gears on: only ticks do', () => {
  const world = run(['Rs.'], 5);
  const before = turned(spinCell(world, 1, 0));
  setBlock(world, 2, 0, 'gearSmall');
  refreshSignals(world);
  refreshSignals(world);
  assert.equal(turned(spinCell(world, 1, 0)), before);
  assert.equal(turned(spinCell(world, 2, 0)), 0); // the new gear starts from its own beginning
});

/** The color of the one marked tooth every gear has. */
const MARK = '#ffd54f';

/**
 * Draw the block at x, y and find where its marked tooth (or paddle) is.
 * @param {object} world - the world
 * @param {number} x - column
 * @param {number} y - row
 * @returns {number} the mark's angle round the middle of the block, as a part of a turn (0 = right, 0.25 = down)
 */
function markAngle(world, x, y) {
  const marks = [];
  const ctx = { fillStyle: '', fillRect(left, top, width, height) { if (ctx.fillStyle === MARK) marks.push([left + width / 2, top + height / 2]); } };
  const info = blockInfo(getBlock(world, x, y));
  info.drawSignals(ctx, info, 0, 0, 64, spinCell(world, x, y), world.ticks);
  assert.ok(marks.length > 0, 'no marked tooth was drawn');
  // The mark furthest from the middle is the tooth itself.
  const [mx, my] = marks.sort((a, b) => Math.hypot(b[0] - 32, b[1] - 32) - Math.hypot(a[0] - 32, a[1] - 32))[0];
  return Math.atan2(my - 32, mx - 32) / (2 * Math.PI);
}

test('fast gears show which way they turn: one marked tooth goes round, faster for faster gears', () => {
  // crank 1 → big 1 → small −2 → axle −2 → big −2 → small 4
  const world = run(['RGs-Gs'], 3);
  /** Where each gear is, and how fast it should turn. */
  const gearsToWatch = [[1, 1], [2, -2], [4, -2], [5, 4]];
  for (const [x, speed] of gearsToWatch) assert.equal(spinAt(world, x, 0), speed);
  let before = gearsToWatch.map(([x]) => markAngle(world, x, 0));
  for (let i = 0; i < 6; i++) {
    oneTick(world);
    const after = gearsToWatch.map(([x]) => markAngle(world, x, 0));
    gearsToWatch.forEach(([x, speed], k) => {
      const step = stepRound(before[k], after[k]);
      // The right way round, and the right amount: never stopped, never backwards.
      assert.ok(Math.abs(step - speed * DRAWN_PER_TICK) < 1e-6, `gear at ${x} (speed ${speed}) moved ${step}`);
    });
    before = after;
  }
});

test('a motor with more batteries turns its gear visibly faster, never backwards', () => {
  for (const batteries of [1, 2, 3, 4, 5]) {
    const loop = `W${'B'.repeat(batteries)}${'W'.repeat(5 - batteries)}MW`;
    const world = run(['......s.', loop, 'W......W', 'WWWWWWWW'], 12);
    const speed = spinAt(world, 6, 0);
    assert.ok(Math.abs(speed) > 0.5, `${batteries} batteries: speed ${speed}`);
    const before = markAngle(world, 6, 0);
    oneTick(world);
    const step = stepRound(before, markAngle(world, 6, 0));
    assert.ok(Math.abs(step - spinAt(world, 6, 0) * DRAWN_PER_TICK) < 1e-6, `${batteries} batteries: moved ${step}, speed ${speed}`);
  }
});

test('a water wheel has one marked paddle, so you can see which way it turns', () => {
  const world = run(['Q-O'], 1);
  const seen = [];
  for (let i = 0; i < 16; i++) {
    seen.push(markAngle(world, 2, 0));
    oneTick(world);
  }
  // Turning ↺: the marked paddle only ever steps anticlockwise, an eighth of a turn at a time.
  const steps = seen.slice(1).map((angle, k) => stepRound(seen[k], angle));
  assert.ok(steps.every((step) => step <= 1e-9 && step > -0.2), `steps: ${steps}`);
  assert.ok(steps.some((step) => step < -0.1), 'the marked paddle never moved');
});

test('a clicker switching OFF asks for a redraw, so its lamp is not left drawn lit', () => {
  const world = run(['.WKWW', '.B..L', '.WWWW'], 7);
  assert.ok(lampLevel(world, 4, 1) > 0.9, 'the lamp is lit on the on beat');
  world.animating = false;
  tick(world, allSystems(), blockInfo); // tick 8: the clicker opens
  assert.equal(lampLevel(world, 4, 1), 0);
  assert.equal(world.animating, true, 'the tick the lamp goes out must be redrawn');
  world.animating = false;
  tick(world, allSystems(), blockInfo); // nothing changes on the next tick
  assert.equal(world.animating, false);
});

// =============================================================
// Lots of generators, and generators feeding motors: the electricity
// that comes out is never more than the work that went in.
// =============================================================

/**
 * Build a gear train (from a picture, like 'RGs') turning `count`
 * generators, one after the other on the same gears, all wired in a row
 * (in series, each adding its push) into one bus wire along the bottom.
 * @param {number} count - how many generators
 * @param {string} train - the crank and gears in front of the first generator
 * @returns {{world: object, generators: number[], busY: number, busX: number}} the
 *   world, each generator's column (they are all in row 2), and where the
 *   bus wire starts (put lamps on it from busX + 1)
 */
function generatorsInARow(count, train) {
  const first = train.length;
  const columns = Array.from({ length: count }, (unused, i) => first + 3 * i);
  const last = columns[count - 1];
  const width = last + 3;
  const world = createWorld(width, 6);
  [...train].forEach((letter, x) => setBlock(world, x, 2, LETTERS[letter]));
  columns.forEach((x, i) => {
    setBlock(world, x, 2, 'generator');
    if (i === count - 1) return;
    setBlock(world, x + 1, 2, 'gearSmall');
    setBlock(world, x + 2, 2, 'gearSmall');
    for (let k = x; k <= x + 3; k++) setBlock(world, k, i % 2 === 0 ? 1 : 3, 'wire'); // top to top, then bottom to bottom
  });
  setBlock(world, first, 3, 'wire');
  setBlock(world, first, 4, 'wire');
  for (let x = first; x <= last + 2; x++) setBlock(world, x, 5, 'wire');
  if (count % 2 === 0) { // the last generator's free end is its bottom: straight down to the bus
    setBlock(world, last, 3, 'wire');
    setBlock(world, last, 4, 'wire');
    for (let x = last + 1; x <= last + 2; x++) setBlock(world, x, 5, 'air');
  } else { // its free end is its top: up, over and down the far side
    setBlock(world, last, 1, 'wire');
    for (let x = last; x <= last + 2; x++) setBlock(world, x, 0, 'wire');
    for (let y = 1; y < 5; y++) setBlock(world, last + 2, y, 'wire');
  }
  return { world, generators: columns, busY: 5, busX: first };
}

/**
 * The work a crank does in one tick: how hard it pushes × how far it turns.
 * @param {object} world - the world
 * @param {number} x - the crank's column
 * @param {number} y - the crank's row
 * @returns {number} the work (strength × turns)
 */
function crankWorkAt(world, x, y) {
  const speed = Math.abs(spinAt(world, x, y));
  return (CRANK_STRENGTH * (1 - speed / CRANK_SPEED) * speed) / 8;
}

test('any number of generators on one crank, wired in a row: the lamp never gets more than 8 tenths of the crank\'s work, and nothing flickers', () => {
  for (const train of ['R', 'RGs', 'Q']) {
    for (const count of [1, 2, 3, 4, 6, 8]) {
      const { world, generators, busY, busX } = generatorsInARow(count, train);
      setBlock(world, busX + 1, busY, 'lamp');
      let work = 0;
      let heat = 0;
      const seen = new Set();
      for (let t = 0; t < 200; t++) {
        more(world, 1);
        work += crankWorkAt(world, 0, 2);
        heat += amps(world, busX + 1, busY) ** 2 / 8;
        if (t >= 2) seen.add(`${spinAt(world, generators[0], 2).toFixed(9)}/${amps(world, busX + 1, busY).toFixed(9)}`);
      }
      const what = `${count} generators, train ${train}: lamp heat ${heat}, crank work ${work}`;
      assert.ok(heat > 0.05, what); // (it does light)
      assert.ok(heat <= (GENERATOR_GAIN / GENERATOR_TORQUE) * work + 1e-9, what);
      assert.equal(seen.size, 1, `${what}: it flickers: ${[...seen].slice(0, 4).join(' ')}`);
    }
  }
});

test('two generators on one crank settle at once: the same speed from the second tick on, with a lamp, shorted, or charging a battery', () => {
  const machines = [
    () => build(['.WWWW.', 'REssE.', '.WWLW.']),
    () => build(['.WWWW.', 'REssE.', '.WWWW.']),
    () => {
      const { world, busX, busY } = generatorsInARow(2, 'QGs');
      setBlock(world, busX + 1, busY, 'battery');
      return world;
    },
    () => {
      const { world, busX, busY } = generatorsInARow(2, 'RGs');
      setBlock(world, busX + 1, busY, 'battery');
      return world;
    },
  ];
  machines.forEach((make, number) => {
    const world = make();
    const at = world.cells.indexOf('generator');
    more(world, 1);
    const seen = new Set();
    for (let t = 0; t < 30; t++) {
      more(world, 1);
      seen.add(`${spinAt(world, at % world.width, Math.floor(at / world.width)).toFixed(9)}`);
    }
    assert.equal(seen.size, 1, `machine ${number} swings: ${[...seen].slice(0, 6).join(' ')}`);
  });
});

test('generators with a crank each, all wired in a row, settle and never give more than their cranks put in', () => {
  for (const count of [2, 3, 6]) {
    for (const load of ['L', 'W']) { // through a lamp, or joined by plain wire
      const width = 2 * count + 1;
      const rows = [
        Array.from({ length: width }, (unused, x) => (x % 2 === 1 ? 'R' : '.')).join(''),
        Array.from({ length: width }, (unused, x) => (x % 2 === 1 ? 'E' : 'W')).join(''),
        `W${'.'.repeat(width - 2)}W`,
        `W${load}${'W'.repeat(width - 2)}`,
      ];
      const world = build(rows);
      let work = 0;
      let heat = 0;
      const seen = new Set();
      for (let t = 0; t < 120; t++) {
        more(world, 1);
        for (let x = 1; x < width; x += 2) work += crankWorkAt(world, x, 0);
        // All the heat: the lamp (resistance 1) and every generator's coil (0.05).
        heat += amps(world, 1, 1) ** 2 * ((load === 'L' ? 1 : 0) + 0.05 * count) / 8;
        if (t >= 100) seen.add(spinAt(world, 1, 1).toFixed(6));
      }
      const what = `${count} cranked generators, load ${load}: heat ${heat}, work ${work}`;
      assert.ok(heat > 0.1, what);
      assert.ok(heat <= (GENERATOR_GAIN / GENERATOR_TORQUE) * work + 1e-6, what);
      assert.equal(seen.size, 1, `${what}: it swings: ${[...seen].join(' ')}`);
      assert.ok(Math.abs(spinAt(world, 1, 1) - spinAt(world, width - 2, 1)) < 1e-6, `${what}: the same machines should turn alike`);
    }
  }
});

test('two trains, each a motor and generators that feed the OTHER train\'s motor, stop when the crank is taken away', () => {
  for (const count of [3, 4, 6]) {
    const last = 3 * count;
    const world = createWorld(last + 3, 15);
    /**
     * Put a block in train A, and the same block in train B (A turned half way round).
     * @param {number} x - column in train A
     * @param {number} y - row in train A
     * @param {string} name - the block
     * @returns {void}
     */
    const put = (x, y, name) => {
      setBlock(world, x + 1, y, name);
      setBlock(world, last - x + 1, 14 - y, name);
    };
    put(0, 2, 'gearSmall'); put(1, 2, 'axle'); put(2, 2, 'axle'); put(0, 3, 'motor'); put(-1, 3, 'wire'); put(1, 3, 'wire');
    for (let i = 0; i < count; i++) {
      const x = 3 + 3 * i;
      put(x, 2, 'generator');
      if (i === count - 1) continue;
      put(x + 1, 2, 'gearSmall'); put(x + 2, 2, 'gearSmall');
      for (let k = x; k <= x + 3; k++) put(k, i % 2 === 0 ? 1 : 3, 'wire');
    }
    put(3, 3, 'wire'); put(3, 4, 'wire');
    for (let x = 3; x <= last - 1; x++) put(x, 5, 'wire');
    for (let y = 5; y <= 11; y++) put(last - 1, y, 'wire');
    put(last, 3, 'wire'); put(last, 4, 'wire');
    for (let y = 4; y <= 11; y++) put(last + 1, y, 'wire');
    setBlock(world, 1, 1, 'crankCW');
    more(world, 16);
    assert.ok(Math.abs(spinAt(world, 4, 2)) > 0.01, `${count}: the crank should turn train A`);
    setBlock(world, 1, 1, 'air');
    let fastest = 0;
    for (let t = 0; t < 400; t++) {
      more(world, 1);
      for (const cell of world.signals.spin.cells.values()) fastest = Math.max(fastest, Math.abs(cell.speed));
    }
    assert.ok(fastest < CRANK_SPEED, `${count} generators a train: it ran away to ${fastest}`);
    for (const cell of world.signals.spin.cells.values()) assert.equal(cell.speed, 0, `${count} generators a train: still turning`);
  }
});

test('a clicker (or a tapped switch) between a generator and a motor gives the motor no burst: a winch never lifts more than the crank\'s work', () => {
  /**
   * A crank and gears turning a generator, wired through a gate to a
   * motor on a winch with a load on the floor.
   * @param {string} train - the crank, gears and generator
   * @param {string} gate - 'K', '/' or 'W'
   * @param {string} load - 'I' or 'c'
   * @returns {string[]} the picture
   */
  const crane = (train, gate, load) => {
    const at = train.length - 1;
    const gap = '.'.repeat(at);
    return [`${gap}WWWW`, `${train}..${gate}`, `${gap}WW.W`, `${gap}.WMW`, `${gap}..Z`, `${gap}..r`, `${gap}..r`, `${gap}..r`, `${gap}..r`, `${gap}..${load}`, '#'.repeat(at + 5)]
      .map((row) => row.padEnd(at + 5, '.'));
  };
  for (const train of ['RGs-Gs-GsE', 'QGs-Gs-GsE', 'RGs-GsE', 'QGs-GsE', 'RGsE', 'QE']) {
    for (const load of ['I', 'c']) {
      const lifted = {};
      for (const gate of ['W', 'K', '/']) {
        const world = build(crane(train, gate, load));
        const column = train.length + 1;
        const rowOf = () => Math.floor(world.cells.indexOf(LETTERS[load]) / world.width);
        const start = rowOf();
        let work = 0;
        for (let t = 0; t < 400; t++) {
          // A hand tapping the switch: on for 1 tick, off for 7.
          if (gate === '/') setBlock(world, column + 1, 1, t % 8 < 1 ? 'switchClosed' : 'switchOpen');
          more(world, 1);
          work += crankWorkAt(world, 0, 1);
          const weight = load === 'I' ? 4 : 1;
          const liftWork = (weight * (start - rowOf())) / 2; // weight × turns of the winch (2 cells of rope a turn)
          assert.ok(liftWork <= work + 1e-9, `${train} ${gate} ${load}: lifted ${liftWork} of work by tick ${t} for ${work} of crank work`);
        }
        lifted[gate] = start - rowOf();
      }
      if (lifted.W === 0) {
        assert.equal(lifted.K, 0, `${train} ${load}: too weak on plain wire, but a clicker lifted it ${lifted.K}`);
        assert.equal(lifted['/'], 0, `${train} ${load}: too weak on plain wire, but a tapped switch lifted it ${lifted['/']}`);
      }
    }
  }
});

test('two water wheels on one shaft work the same in a mirrored build: a wheel with water falling straight through turns the way its neighbor does', () => {
  const pictures = [
    ['#F#..', '#O#..', '#OD..', '###..'],                    // a drain beside the lower wheel
    ['..F....', '..O....', '..O....', '####..D'],            // open air: the lower wheel's water runs off one way
  ];
  for (const rows of pictures) {
    const mirrored = rows.map((row) => [...row].reverse().join(''));
    const a = run(rows, 400);
    const b = run(mirrored, 400);
    const at = a.cells.indexOf('waterWheel');
    const x = at % a.width;
    const y = Math.floor(at / a.width);
    const speed = spinAt(a, x, y);
    assert.ok(Math.abs(speed) > 0.1, `${rows.join('/')}: only turns ${speed}`);
    assert.ok(Math.abs(speed + spinAt(b, a.width - 1 - x, y)) < 1e-9, `${rows.join('/')}: ${speed} as drawn, ${spinAt(b, a.width - 1 - x, y)} mirrored`);
    // Both wheels push the same way, so the shaft does better than the top wheel alone would.
    const below = wheelSource(b, a.width - 1 - x, y + 1);
    assert.ok(below.speed < 0, `${rows.join('/')}: mirrored, the lower wheel wants ${below.speed}`);
  }
});

test('a battery in a loop with two generators that push against each other never makes the gears run by themselves or lift a weight for free', () => {
  // The crank turns the left generator the way that ADDS to the battery's
  // current: far too hard for one crank, so nothing moves at all. (It
  // used to race at 1.25 turns a second, faster than a crank can go, and
  // wind the iron weight up with nobody paying.)
  const rows = ['WBWWW.', 'EGssEZ', 'WR..Wr', 'WWWWWr', '.....r', '.....r', '.....r', '.....r', '.....r', '.....I', '......', '######'];
  const world = run(rows, 0);
  const systems = allSystems();
  for (let i = 0; i < 40; i++) {
    tick(world, systems, blockInfo);
    assert.equal(spinAt(world, 1, 2), 0, `the crank on tick ${i}`);
    assert.equal(getBlock(world, 5, 9), 'ironWeight', `the weight stays down on tick ${i}`);
  }
  // No winch: still nothing turns faster than its crank can go (here, not at all).
  for (const picture of [
    ['WBWWW.', 'EGssE.', 'WR..W.', 'WWWWW.'],
    ['WBWWWWWWW', 'EsGs-GssE', 'WR......W', 'WWWWWWWWW'],
    ['WBWWWWWWW', 'EsGs-GssE', 'WQ......W', 'WWWWWWWWW'],
  ]) {
    const free = run(picture, 0);
    for (let i = 0; i < 40; i++) {
      tick(free, systems, blockInfo);
      assert.ok(Math.abs(spinAt(free, 1, 2)) <= CRANK_SPEED + 1e-9, `${picture[1]}: crank at ${spinAt(free, 1, 2)} on tick ${i}`);
    }
  }
});

test('a motor on the same gears as the generators that feed it settles to one steady speed: no flicker from tick to tick', () => {
  const pictures = [
    ['WBWW', 'EGsE', 'WQ.W', 'WMLW', '....'],
    ['WWWW', 'EGsE', 'WR.W', 'WMBW', '....'],
    ['WBWW', 'EssE', 'WR.W', 'WMBW', '....'],
    // A battery's motor gears a generator up, and that generator feeds a second motor on its own shaft.
    ['.............WBW..WW...', '............sE.MGsEM...', '.............WWW..WW...', '.......................'],
  ];
  const systems = allSystems();
  for (const rows of pictures) {
    const world = run(rows, 200);
    const seen = [];
    for (let i = 0; i < 12; i++) {
      tick(world, systems, blockInfo);
      seen.push([...world.signals.spin.cells.values()].map((cell) => cell.speed.toFixed(6)).join(' '));
    }
    assert.equal(new Set(seen).size, 1, `${rows.join(' / ')} flickers:\n${[...new Set(seen)].join('\n')}`);
  }
});

test('a water wheel with water falling straight through keeps turning ONE way when its generator feeds a motor on the same shaft', () => {
  // The motor is wired so that it pushes against the turning. A real
  // wheel would just be slowed down by it. (It used to turn round and go
  // the other way on every single tick, for ever.)
  for (const rows of [
    ['..F.....', '...WW...', '.#OEM...', '..DWW...', '########'],
    ['..F.....', '..F.....', '........', '...WW...', '.#OEM...', '..DWW...', '########'],
  ]) {
    const world = run(rows, 150);
    const systems = allSystems();
    const at = world.cells.indexOf('waterWheel');
    const seen = [];
    for (let i = 0; i < 50; i++) {
      tick(world, systems, blockInfo);
      seen.push(spinAt(world, at % world.width, Math.floor(at / world.width)));
    }
    assert.ok(seen.every((speed) => speed > 0.1), `${rows.join('/')}: the wheel went ${seen.slice(0, 8).join(' ')}`);
    assert.ok(Math.max(...seen) - Math.min(...seen) < 1e-6, `${rows.join('/')}: the wheel's speed wobbles between ${Math.min(...seen)} and ${Math.max(...seen)}`);
  }
});

test('two cranks alike, each geared up into a generator, the two generators joined by plain wire: both turn just as fast', () => {
  // Nothing is different between the top machine and the bottom one, so
  // neither generator may do all the turning while the other stands still.
  for (const count of [3, 4]) {
    const train = `R${'Gs-'.repeat(count - 1)}Gs`;
    const gap = '.'.repeat(train.length);
    for (const middle of ['W', 'L']) {
      const world = run([`${gap}WWW`, `${train}E.${middle}`, `${gap}W.W`, `${gap}W.W`, `${train}E.W`, `${gap}WWW`], 3);
      const top = spinAt(world, train.length, 1);
      const bottom = spinAt(world, train.length, 4);
      assert.ok(Math.abs(top) > 0.005, `×${2 ** count} ${middle}: the top generator only turns ${top}`);
      assert.ok(Math.abs(Math.abs(top) - Math.abs(bottom)) < 1e-6, `×${2 ** count} ${middle}: top ${top}, bottom ${bottom}`);
    }
  }
});

test('a clicker gives a motor no burst of battery current that a generator in the loop is holding back', () => {
  // The crank turns a generator ×4 (3.2 volts) AGAINST three batteries
  // (3 volts): hardly any current flows, and it flows backwards through
  // the batteries. The motor in that loop turns a second generator with
  // a lamp. Every time the clicker closed, the motor used to get a burst
  // as if the batteries had the loop to themselves: current that never
  // flowed and that nobody paid for.
  const world = build([
    '......WKBBBW.WW',
    'QGs-GsE....M-EL',
    '......WWWWWW.WW',
    '...............',
  ]);
  const motor = world.width + 11;
  let crankWork = 0;
  let batteryWork = 0;
  let lampHeat = 0;
  let before = 0; // the current through the motor as the tick starts...
  const batteryBefore = {};
  setBlock(world, 0, 1, 'crankStop'); // nobody is turning the crank yet: the batteries run the motor, and pay for it
  for (let t = 0; t < 3200; t++) {
    if (t === 16) setBlock(world, 0, 1, 'crankCCW');
    more(world, 1);
    crankWork += crankWorkAt(world, 0, 1);
    for (const x of [8, 9, 10]) {
      // What a battery gives out in a tick: the most it sent the right way, as the tick started or ended.
      const cell = world.signals.electric.cells.get(x);
      const out = cell.arms.right ?? -(cell.arms.left ?? 0);
      batteryWork += Math.max(0, out, batteryBefore[x] ?? 0) / 8;
      batteryBefore[x] = out;
    }
    lampHeat += amps(world, 14, 1) ** 2 / 8;
    const after = Math.abs(world.signals.electric.cells.get(motor)?.current ?? 0); // ...and as it ends
    const current = Math.max(before, after);
    before = after;
    const speed = Math.abs(spinAt(world, 11, 1));
    // (Not in the first ticks after the crank starts: the motor takes up the change half at a time.)
    if (t > 48) assert.ok(speed <= current / REFERENCE_CURRENT + 1e-9, `tick ${t}: the motor turns ${speed} on a current of ${current}`);
    assert.ok(lampHeat <= crankWork + batteryWork + 1e-9, `tick ${t}: lamp heat ${lampHeat} from crank work ${crankWork} and battery work ${batteryWork}`);
  }
  assert.ok(crankWork > 1, `the crank does turn (${crankWork})`);
});

test('a motor never turns against the current that really flows through it when a clicker closes', () => {
  // One battery, and a cranked generator that out-pushes it: the current
  // goes the generator's way. On each beat the motor used to start off
  // the battery's way, backwards.
  const world = build([
    '....WKBW.',
    'RGs-E..M.',
    '....WWWW.',
    '.........',
  ]);
  more(world, 40);
  /**
   * The current out of the motor's right end right now.
   * @returns {number} the current (+ turns the motor ↻)
   */
  const flowing = () => {
    const cell = world.signals.electric.cells.get(world.width + 7);
    return cell?.arms[plusSide(cell.axis)] ?? 0;
  };
  let before = flowing(); // the current as the tick starts...
  for (let t = 0; t < 160; t++) {
    more(world, 1);
    const after = flowing(); // ...and as it ends
    const speed = spinAt(world, 7, 1);
    assert.ok(speed * before >= 0 || speed * after >= 0, `tick ${t}: the motor turns ${speed} with a current of ${before}, then ${after}`);
    // (0.02 to spare: the circuit rounds a generator's push down a little, the motor uses it exactly.)
    assert.ok(Math.abs(speed) <= Math.max(Math.abs(before), Math.abs(after)) / REFERENCE_CURRENT + 0.02, `tick ${t}: the motor turns ${speed} on a current of ${before}, then ${after}`);
    before = after;
  }
});

test('tapping a crank on and off never gets more out of a battery\'s motor than the battery and the crank put in', () => {
  // The same loop on plain wire: three batteries, a generator that
  // out-pushes them when the crank turns, and a motor turning a second
  // generator with a lamp. A hand starts and stops the crank again and
  // again. The motor takes up each change a bit late, but what it has too
  // much of after a start it has too little of after a stop.
  for (const beat of [1, 2, 3, 5, 8]) {
    const world = build([
      '......WWBBBW.WW',
      'QGs-GsE....M-EL',
      '......WWWWWW.WW',
      '...............',
    ]);
    let crankWork = 0;
    let batteryWork = 0;
    let lampHeat = 0;
    const batteryBefore = {};
    for (let t = 0; t < 1600; t++) {
      setBlock(world, 0, 1, Math.floor(t / beat) % 2 === 0 ? 'crankStop' : 'crankCCW');
      more(world, 1);
      crankWork += crankWorkAt(world, 0, 1);
      for (const x of [8, 9, 10]) {
        const cell = world.signals.electric.cells.get(x);
        const out = cell.arms.right ?? -(cell.arms.left ?? 0);
        batteryWork += Math.max(0, out, batteryBefore[x] ?? 0) / 8;
        batteryBefore[x] = out;
      }
      lampHeat += amps(world, 14, 1) ** 2 / 8;
    }
    assert.ok(lampHeat > 0.1, `beat ${beat}: the lamp does light (${lampHeat})`);
    assert.ok(lampHeat <= crankWork + batteryWork, `beat ${beat}: lamp heat ${lampHeat} from crank work ${crankWork} and battery work ${batteryWork}`);
  }
});
