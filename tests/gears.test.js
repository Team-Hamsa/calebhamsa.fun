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
