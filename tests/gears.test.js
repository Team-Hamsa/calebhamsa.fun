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
import { PUMP_RATE } from '../js/fluids.js';
import gears, { CRANK_SPEED, CRANK_STRENGTH, GENERATOR_GAIN, GENERATOR_TORQUE, WHEEL_GAIN, spinAt } from '../js/blocks/gears.js';
import { REFERENCE_CURRENT } from '../js/circuit.js';

/** What each letter in a test picture means. */
const LETTERS = {
  '.': 'air', '#': 'stone', W: 'wire', L: 'lamp', B: 'battery', s: 'gearSmall', G: 'gearBig',
  '-': 'axle', R: 'crankCW', Q: 'crankCCW', M: 'motor', E: 'generator', O: 'waterWheel', F: 'faucet',
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

test('water power cannot loop forever either: pump → wheel → generator loses energy', () => {
  // A pump moving PUMP_RATE water per tick through a wheel makes it turn PUMP_RATE × WHEEL_GAIN;
  // a generator turning that fast pushes less than the 1 volt that powered the pump.
  assert.ok(PUMP_RATE * WHEEL_GAIN * GENERATOR_GAIN < 1);
});

test('a crank turning a generator that powers a motor pushing back does not flicker', () => {
  const world = createWorld(3, 3);
  ['.R.', 'WEW', 'WMW'].forEach((row, y) => [...row].forEach((letter, x) => setBlock(world, x, y, LETTERS[letter])));
  const systems = allSystems();
  const seen = [];
  for (let i = 0; i < 30; i++) {
    tick(world, systems, blockInfo);
    if (i >= 20) seen.push(`${spinAt(world, 1, 1)}/${world.signals.spin.cells.get(4).jammed}`);
  }
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
