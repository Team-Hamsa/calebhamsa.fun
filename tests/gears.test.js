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
import { DROP_POWER, PUMP_HEAD, PUMP_RATE, RISE_POWER } from '../js/fluids.js';
import { TURBINE_SPEED, TURBINE_STRENGTH, turbineSource } from '../js/blocks/water.js';
import gears, {
  CRANK_SPEED, CRANK_STRENGTH, MACHINE_DRAG, MACHINE_K, MACHINE_RESISTANCE, WHEEL_SPEED, WHEEL_STRENGTH, spinAt, turned, wheelSource,
} from '../js/blocks/gears.js';
import { OPPOSITE, REFERENCE_CURRENT, plusSide } from '../js/circuit.js';

/** What each letter in a test picture means. */
const LETTERS = {
  '.': 'air', '#': 'stone', W: 'wire', L: 'lamp', B: 'battery', s: 'gearSmall', G: 'gearBig',
  '-': 'axle', R: 'crankCW', Q: 'crankCCW', M: 'motor', E: 'generator', O: 'waterWheel', F: 'faucet',
  P: 'pipe', '^': 'pumpUp', v: 'pumpDown', '<': 'pumpLeft', T: 'turbine', b: 'burnerOn', C: 'chiller', '~': 'air', D: 'drain', K: 'clicker', '/': 'switchClosed',
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

/**
 * How fast one crank turns one motor or generator with nothing wired to
 * it: not quite the crank's top speed, because the machine's bearings rub.
 */
const FREE_SPIN = CRANK_STRENGTH / (CRANK_STRENGTH / CRANK_SPEED + MACHINE_DRAG);

/**
 * The current coming OUT of a part's + end (its right or top end) right now.
 * @param {object} world - the world
 * @param {number} index - the part's cell index
 * @returns {number} the current (negative = it goes in there)
 */
function currentOut(world, index) {
  const cell = world.signals.electric.cells.get(index);
  if (!cell?.axis) return 0;
  const plus = plusSide(cell.axis);
  return cell.arms[plus] ?? -(cell.arms[OPPOSITE[plus]] ?? 0);
}

/**
 * The energy books of the world as it stands after a tick, each as
 * power (energy per second):
 *   battery  what the batteries give: 1 volt × the current out of each one's + end (less than 0 = being charged)
 *   crank    the work the cranks do: how hard each pushes × how fast it turns
 *   heat     current² × resistance, in every joint of every circuit (lamps, coils, batteries, wires)
 *   rub      the heat in the machines' bearings: MACHINE_DRAG × speed²
 *   made     the electricity the machines put into the circuit: their volts × their current
 *   taken    the work their coils take from their shafts: push × speed (the law says: the very same)
 * With no loads on the gears:  battery + crank = heat + rub,  exactly.
 * @param {object} world - the world
 * @returns {{battery: number, crank: number, heat: number, rub: number, made: number, taken: number}} the books
 */
function books(world) {
  const sums = { battery: 0, crank: 0, heat: 0, rub: 0, made: 0, taken: 0 };
  const electric = world.signals.electric;
  for (const circuit of electric.net.circuits) {
    for (const link of circuit.links) sums.heat += (electric.cells.get(link.a).arms[link.side] ?? 0) ** 2 * link.resistance;
  }
  world.cells.forEach((name, index) => {
    const speed = spinAt(world, index % world.width, Math.floor(index / world.width));
    const way = blockInfo(name)?.machine;
    if (name === 'battery') sums.battery += currentOut(world, index);
    if (name === 'crankCW' || name === 'crankCCW') sums.crank += CRANK_STRENGTH * (1 - Math.abs(speed) / CRANK_SPEED) * speed * (name === 'crankCW' ? 1 : -1);
    if (way) {
      sums.made += way * MACHINE_K * speed * currentOut(world, index);  // volts × amps
      sums.taken += way * MACHINE_K * currentOut(world, index) * speed; // push on the shaft × speed
      sums.rub += MACHINE_DRAG * speed * speed;
    }
  });
  return sums;
}

/**
 * Check the books balance right now: everything put in (batteries,
 * cranks, and `extra`: a load coming down) is exactly the heat made plus
 * the work done on loads (`extra` less than 0: a load going up).
 * @param {object} world - the world
 * @param {string} what - the build's name, for messages
 * @param {number} [extra] - power put in by loads (+ coming down, − being lifted)
 * @returns {{battery: number, crank: number, heat: number, rub: number}} the books (see `books`)
 */
function assertBooksBalance(world, what, extra = 0) {
  const sums = books(world);
  const put = sums.battery + sums.crank + extra;
  const got = sums.heat + sums.rub;
  assert.ok(Math.abs(put - got) < 1e-9 * Math.max(1, Math.abs(got)), `${what}: ${put} put in (battery ${sums.battery}, crank ${sums.crank}, loads ${extra}), ${got} came out (heat ${sums.heat}, bearings ${sums.rub})`);
  assert.ok(Math.abs(sums.made - sums.taken) < 1e-12 * Math.max(1, Math.abs(sums.made)), `${what}: the machines made ${sums.made} of electricity from ${sums.taken} of work`);
  return sums;
}

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
    assert.ok(lampPower <= crankBest, `lamp gets ${lampPower}`);
    assert.ok(lampPower < assertBooksBalance(world, 'geared generator').crank, 'some of the crank\'s work is always lost as heat in the coil and bearings');
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

test('a generator joined by plain wire is hard to turn (the crank drops to under half speed), and you can SEE its big current', () => {
  const world = run(['.R.', 'WEW', 'W.W', 'WWW'], 10);
  // Only its own coil (0.45) is in the current's way: speed = 2 ÷ (2 + 0.1 + 1 ÷ 0.45), a little more for the wire.
  assert.ok(spinAt(world, 1, 0) > 0.45 && spinAt(world, 1, 0) < 0.48, `crank ${spinAt(world, 1, 0)}`);
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
  assert.equal(spinAt(cut, 1, 0), FREE_SPIN);
});

test('a generator that had a battery wired straight across it spins freely again when the battery and wires are gone', () => {
  const world = run(['.Q.', 'WEW', 'W.W', 'WBW'], 10);
  // The battery pushes its current the way the crank's turning does: together they push the shaft as hard, opposite ways.
  assert.ok(Math.abs(spinAt(world, 1, 0)) < 0.05, `held nearly still, but turns ${spinAt(world, 1, 0)}`);
  for (const [x, y] of [[0, 1], [2, 1], [0, 2], [2, 2], [0, 3], [1, 3], [2, 3]]) setBlock(world, x, y, 'air');
  const systems = allSystems();
  for (let i = 0; i < 10; i++) tick(world, systems, blockInfo);
  assert.equal(spinAt(world, 1, 0), -FREE_SPIN);
});

test('a battery straight across a generator: one answer, whichever was there first, the battery or the crank', () => {
  // The loop: the coil, the battery, and eight joints of wire.
  const loop = MACHINE_RESISTANCE + 0.05 + 0.006;
  // The shaft's balance:  crank 2 × (1 ∓ speed)  −  K × current  −  drag × speed = 0,
  // with the current the law gives:  (K × speed − the battery's 1 volt) ÷ loop.
  // Turned ↻ the generator pushes AGAINST the battery, and the battery helps the crank along.
  // Turned ↺ they push the same way round, and the battery holds the crank almost still.
  for (const [crank, way] of [['crankCW', 1], ['crankCCW', -1]]) {
    const speed = (way * CRANK_STRENGTH + MACHINE_K / loop) / (CRANK_STRENGTH / CRANK_SPEED + MACHINE_DRAG + MACHINE_K ** 2 / loop);
    const current = Math.abs(MACHINE_K * speed - 1) / loop;
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
      // A coil is never plain wire: lots of current, but no sparks.
      assert.equal(world.signals.electric.cells.get(3 * 3 + 1).spark, false, `${crank}, ${order}`);
      assertBooksBalance(world, `${crank}, ${order}`);
    }
    for (const [turns, amps] of ends) {
      assert.ok(Math.abs(turns - speed) < 1e-9, `${crank}: turns ${ends.map((end) => end[0])}, should turn ${speed}`);
      assert.ok(Math.abs(amps - current) < 1e-9, `${crank}: currents ${ends.map((end) => end[1])}, should be ${current}`);
    }
  }
});

test('a battery in a cranked generator\'s loop turns it too, and pays for it: pushing against the crank\'s electricity it helps the crank, pushing with it it makes the crank\'s job harder', () => {
  const against = run(['.R..', 'WEWW', 'W..L', 'WBWW'], 20); // the generator pushes against the battery: the battery wins a little, and helps
  const adding = run(['.Q..', 'WEWW', 'W..L', 'WBWW'], 20);  // turned so its push adds to the battery's: harder
  assert.ok(spinAt(against, 1, 0) > FREE_SPIN && spinAt(against, 1, 0) < CRANK_SPEED, `turns ${spinAt(against, 1, 0)}`);
  assert.ok(Math.abs(spinAt(adding, 1, 0)) < 0.5 && Math.abs(spinAt(adding, 1, 0)) > 0.3, `turns ${spinAt(adding, 1, 0)}`);
  assert.ok(lampLevel(adding, 3, 2) > lampLevel(against, 3, 2)); // battery and generator together: a brighter lamp
  // Nothing is free: the battery gives energy in both, and every bit of it and of the crank's work is heat.
  assert.ok(assertBooksBalance(against, 'against').battery > 0);
  assert.ok(assertBooksBalance(adding, 'adding').battery > 0);
});

test('a slowly turned generator still makes a little electricity: a dim lamp, not a dark one', () => {
  // Geared down three times (small → big, three times): the generator
  // hanging under the last gear turns 8 times slower than the crank.
  const lit = run(['RsG-sG-sG.', '.......WEW', '.......W.W', '.......WLW'], 10);
  const speed = Math.abs(spinAt(lit, 8, 1));
  assert.ok(speed > 0.1 && speed < 0.13, `generator turns ${speed}`);
  const ideal = (speed * MACHINE_K) / (1 + MACHINE_RESISTANCE); // volts ÷ (lamp + the generator's coil)
  assert.ok(currentAt(lit, 8, 3) > ideal * 0.99 && currentAt(lit, 8, 3) <= ideal + 1e-9, `lamp current ${currentAt(lit, 8, 3)}, ideal ${ideal}`);
});

test('a generator turns work into exactly as much electricity, and every bit of the crank\'s work ends up as heat: lamp + coil + bearings', () => {
  for (const rows of [['.R.', 'WEW', 'W.W', 'WLW'], ['RGs.', '.WEW', '.W.W', '.WLW'], ['.R.', 'WEW', 'WLW', 'WLW']]) {
    const world = run(rows, 10);
    const crankX = rows[0].indexOf('R');
    const generatorX = rows[1].indexOf('E');
    const speed = spinAt(world, crankX, 0);
    const workIn = CRANK_STRENGTH * (1 - speed / CRANK_SPEED) * speed; // how hard the crank pushes × how fast
    const current = currentAt(world, generatorX, 1);
    const made = Math.abs(spinAt(world, generatorX, 1)) * MACHINE_K * current; // volts × current
    const rub = MACHINE_DRAG * spinAt(world, generatorX, 1) ** 2;
    // What the crank puts in = what the generator makes + what its bearings rub away.
    assert.ok(Math.abs(workIn - made - rub) < 1e-9, `${rows.join('/')}: crank ${workIn}, electricity ${made}, bearings ${rub}`);
    const sums = assertBooksBalance(world, rows.join('/'));
    assert.ok(Math.abs(sums.crank - workIn) < 1e-12);
    // And the lamps get less than that: the coil's heat comes out of it too.
    const lamps = world.cells.reduce((sum, name, index) => sum + (name === 'lamp' ? world.signals.electric.cells.get(index).current ** 2 : 0), 0);
    assert.ok(lamps < made && lamps > 0.4 * workIn, `${rows.join('/')}: lamps ${lamps} of ${workIn}`);
  }
});

test('two generators in a row, each with its own crank, both feel ALL the current they make together', () => {
  const world = run(['.R..', 'WEWW', 'L..W', 'WEWW', '.Q..'], 10);
  const current = currentAt(world, 0, 2);
  assert.ok(current > 0.5, `the lamp gets ${current}`);
  for (const [y, crankY] of [[1, 0], [3, 4]]) {
    const speed = Math.abs(spinAt(world, 1, crankY));
    const push = CRANK_STRENGTH * (1 - speed / CRANK_SPEED); // how hard this crank is pushing
    // That push holds up the current (MACHINE_K for each amp) and the generator's own bearings.
    assert.ok(Math.abs(push - MACHINE_K * current - MACHINE_DRAG * speed) < 1e-9, `row ${y}: crank pushes ${push}, current ${current}`);
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

test('a battery wired straight across a generator does not spark: it runs it as a motor, and held still it is a stalled motor', () => {
  const world = run(['WWW', 'B.E', 'WWW'], 3);
  const battery = world.signals.electric.cells.get(3);
  assert.equal(battery.spark, false);
  // It spins up until its own push nearly cancels the battery's: only a whisper of current is left.
  assert.ok(Math.abs(Math.abs(spinAt(world, 2, 1)) - 0.952) < 0.005, `turns ${spinAt(world, 2, 1)}`);
  assert.ok(battery.current > 0.09 && battery.current < 0.1, `${battery.current} flows`);
  assertBooksBalance(world, 'battery across a generator');
  // Jammed gears on its shaft hold it still: now it is just a 0.45 coil across the battery. 2 amps, and still no sparks.
  const held = run(['WWW.', 'B.EG', 'WWWG', '..GG'], 3);
  assert.equal(spinAt(held, 2, 1), 0);
  assert.ok(Math.abs(held.signals.electric.cells.get(4).current - 2) < 0.03, `${held.signals.electric.cells.get(4).current} flows`);
  assert.equal(held.signals.electric.cells.get(4).spark, false);
  // Two batteries in a row wired straight back to themselves still spark, generator or no generator.
  const short = run(['WWWW', 'B.WE', 'B.WW', 'WWW.'], 3);
  assert.equal(short.signals.electric.cells.get(4).spark, true);
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
  // 3. A turbine, just the same: its most work is exactly what steam rising
  //    one cell gives up, and rising steam is worth what falling water is.
  const turbineBest = ((TURBINE_STRENGTH * flow) / 2) * (TURBINE_SPEED / 2);
  assert.ok(Math.abs(turbineBest - RISE_POWER * flow) < 1e-12);
  assert.equal(RISE_POWER, DROP_POWER);
  // 4. A motor or generator uses ONE number both ways, so the electricity it
  //    makes is exactly the work its coil takes (see `books`), and it always
  //    loses some as heat on top: its coil and its bearings are never free.
  assert.ok(MACHINE_RESISTANCE > 0 && MACHINE_DRAG > 0);
  const plant = run(['.R.', 'WEW', 'W.W', 'WLW'], 3);
  assert.ok(Math.abs(books(plant).made - books(plant).taken) < 1e-12);
  assert.ok(books(plant).made > 0.1);
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
  rows.forEach((row, y) => [...row].forEach((letter, x) => {
    setBlock(world, x, y, LETTERS[letter]);
    if (letter === '~') setFluid(world, 'water', x, y, 1); // air full of water
  }));
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
 * Get a pump → wheels → generators loop running as hard as it ever
 * could: full flow through the wheels. (A battery just wired in a row
 * with the generators won't do that any more: the generators are motors
 * too, so they spin up, push back, and can leave the pump only a
 * trickle, like real motors wired in a row with it. So to prime the loop
 * we take the generators out for a while, plain wire in their place,
 * and let the battery run the pump alone.)
 * @param {object} world - the world, batteries placed
 * @param {number} ticks - how long to run it like that
 * @param {Function} [each] - called after every tick
 * @returns {Function} call it to put the generators back
 */
function primeLoop(world, ticks, each = () => {}) {
  const generators = [];
  world.cells.forEach((name, index) => {
    if (name !== 'generator') return;
    generators.push(index);
    setBlock(world, index % world.width, Math.floor(index / world.width), 'wire');
  });
  for (let i = 0; i < ticks; i++) {
    more(world, 1);
    each();
  }
  return () => generators.forEach((index) => setBlock(world, index % world.width, Math.floor(index / world.width), 'generator'));
}

/**
 * Check a loop machine. It runs for a moment as built, then it is primed
 * (see primeLoop) so that water really goes round at full flow. Then the
 * generators go back in and every battery is swapped for plain wire: the
 * loop is on its own, at full flow, and it all stops; no water was made
 * or lost.
 * @param {string} what - the machine's name, for messages
 * @param {object} world - the world, batteries placed
 * @param {number[]} pump - the pump's [x, y]
 * @param {number[][]} wheels - every wheel's [x, y]
 * @returns {void}
 */
function assertWindsDown(what, world, pump, wheels) {
  const water = allWater(world);
  more(world, 40); // as built
  const putBack = primeLoop(world, 300);
  assert.ok(amps(world, ...pump) > 0.15, `${what}: the battery should run the pump (${amps(world, ...pump)})`);
  const flowing = Math.abs(world.signals.spin.wheelFlow.get(wheels[0][1] * world.width + wheels[0][0]));
  assert.ok(flowing > 0.005, `${what}: water should flow through the wheels while the battery is in (${flowing})`);
  putBack();
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
  // channel to the top one; it drops through a second pump (v, pointing
  // the way the water already goes: it is there so the wire can cross
  // the water) and flows back through the wheels (O), each with a
  // generator (E) on top, all wired in a row to the pumps.
  for (const count of [3, 5]) {
    const width = 2 * count + 3;
    const world = build([
      '#'.repeat(width),
      `#${'.'.repeat(width - 2)}#`,
      `W^${'EW'.repeat(count - 1)}EvW`,
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
 * and it comes back along the bottom, through a second pump that points
 * the way the water already goes (it is there so the wire can cross the
 * ring). The last wheel turns a generator through `chain` (gears), and
 * the generator is wired only to the pumps and a battery.
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
    row(`#PP<${'P'.repeat(count - 1)}`),
    `...${'W'.repeat(last - 2)}`,
  ]);
  world.cells.forEach((name, index) => {
    if (['pipe', 'waterWheel', 'pumpLeft'].includes(name)) world.fluid.water[index] = index >= 4 * world.width ? 1 : 0.5;
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
 * pump, through a second pump that points the way the water already
 * goes (it is there so the wire can cross the loop). The top wheel
 * turns a generator through `chain`.
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
  rows.push(row('W^WWP'), row('#PP<P'), `...${'W'.repeat(last - 2)}`);
  const world = build(rows);
  world.cells.forEach((name, index) => {
    if (['pipe', 'waterWheel', 'pumpLeft'].includes(name)) world.fluid.water[index] = 1;
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

test('a clicker (or a tapped switch) in a generator\'s loop gives no free electricity: on every tick, the crank\'s work is exactly the heat made, and the lamps get less', () => {
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
          // On every tick, the ticks the gate flips too: nothing is owed from the tick before.
          assertBooksBalance(world, `${gate} gears "${chain}" ${lamps} lamps, tick ${t}`);
          assert.ok(lampEnergy <= crankWork + 1e-9, `${gate} gears "${chain}" ${lamps} lamps, tick ${t}: lamps ${lampEnergy}, crank ${crankWork}`);
        }
        const what = `${gate} gears "${chain}" ${lamps} lamps: lamps ${lampEnergy}, crank ${crankWork}`;
        assert.ok(lampEnergy > 1, what); // (it does light)
        assert.ok(lampEnergy < crankWork, what);
      }
    }
  }
});

/**
 * Check a loop machine that has a clicker in its wiring: prime it (see
 * primeLoop), put its generators back and take every battery away, and
 * soon nothing runs any more.
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
  const putBack = primeLoop(world, 326, () => { most = Math.max(most, amps(world, ...pump)); });
  assert.ok(most > 0.15, `${what}: the battery should run the pump (${most})`);
  putBack();
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
    seen.push(`${spinAt(world, 1, 1).toFixed(9)}/${world.signals.spin.cells.get(4).jammed}`);
  }
  // From the very first tick: the gears and the circuit are worked out together, so there is nothing to creep toward.
  assert.equal(new Set(seen).size, 1, `it flickers: ${seen.join(' ')}`);
  assertBooksBalance(world, 'generator and motor on one shaft');
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

test('any number of generators on one crank, wired in a row: the lamp never gets more than the crank\'s work, the books balance, and nothing flickers', () => {
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
        seen.add(`${spinAt(world, generators[0], 2).toFixed(9)}/${amps(world, busX + 1, busY).toFixed(9)}`); // from the very first tick
      }
      const what = `${count} generators, train ${train}: lamp heat ${heat}, crank work ${work}`;
      assert.ok(heat > 0.05, what); // (it does light)
      assert.ok(heat < work, what);
      assertBooksBalance(world, what);
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
        // All the heat: the lamp (resistance 1) and every generator's coil.
        heat += amps(world, 1, 1) ** 2 * ((load === 'L' ? 1 : 0) + MACHINE_RESISTANCE * count) / 8;
        seen.add(spinAt(world, 1, 1).toFixed(9)); // from the very first tick
      }
      const what = `${count} cranked generators, load ${load}: heat ${heat}, work ${work}`;
      assert.ok(heat > 0.1, what);
      assert.ok(heat < work, what);
      assertBooksBalance(world, what);
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

test('a battery in a loop with two generators that push against each other never turns anything for free: whatever turns, the battery and the crank pay for exactly', () => {
  // Two generators on one train, one geared ×2, wired so that they push
  // against each other, with a battery in their loop. The battery drives
  // them as motors, one against the other: the ×2 one wins. With a crank
  // helping, that is still far too little to wind the iron weight up.
  // (It used to race at 1.25 turns a second and lift it with nobody paying.)
  const rows = ['WBWWW.', 'EGssEZ', 'WR..Wr', 'WWWWWr', '.....r', '.....r', '.....r', '.....r', '.....r', '.....I', '......', '######'];
  const world = run(rows, 0);
  const systems = allSystems();
  for (let i = 0; i < 40; i++) {
    tick(world, systems, blockInfo);
    assert.equal(spinAt(world, 1, 2), 0, `the crank on tick ${i}`);
    assert.equal(getBlock(world, 5, 9), 'ironWeight', `the weight stays down on tick ${i}`);
    assertBooksBalance(world, `stalled, tick ${i}`); // the battery's current is all heat
  }
  // No winch: the train turns, crank or no crank, and every bit of it is paid for.
  for (const picture of [
    ['WBWWW.', 'EGssE.', 'WR..W.', 'WWWWW.'],
    ['WBWWW.', 'EGssE.', 'W...W.', 'WWWWW.'],
    ['WBWWWWWWW', 'EsGs-GssE', 'WR......W', 'WWWWWWWWW'],
    ['WBWWWWWWW', 'EsGs-GssE', 'WQ......W', 'WWWWWWWWW'],
  ]) {
    const free = run(picture, 0);
    for (let i = 0; i < 40; i++) {
      tick(free, systems, blockInfo);
      const sums = assertBooksBalance(free, `${picture[1]}, tick ${i}`);
      assert.ok(sums.battery > 0, `${picture[1]}: the battery pays (${sums.battery})`);
    }
    assert.ok(Math.abs(spinAt(free, 0, 1)) > 0.1, `${picture[1]}: it does turn`);
  }
  // And with the battery swapped for plain wire and no crank: nothing.
  const dead = run(['WWWWW.', 'EGssE.', 'W...W.', 'WWWWW.'], 20);
  assert.equal(spinAt(dead, 0, 1), 0);
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
    const world = run(rows, 0);
    const seen = [];
    for (let i = 0; i < 12; i++) { // from the very first tick
      tick(world, systems, blockInfo);
      seen.push([...world.signals.spin.cells.values()].map((cell) => cell.speed.toFixed(9)).join(' '));
      assertBooksBalance(world, rows.join(' / '));
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
    // The same thing one step removed: the wheel's generator feeds a motor
    // on a SECOND shaft, and a generator on that shaft feeds the motor
    // on the wheel's shaft.
    ['..WWW...WWWWW', '..W.W...W.F.W', '..W.E---M-O#W', '..W.W...W#.#W', '..W.M-ssE#.#W', '..W.W...W#D#W', '..WWW...WWWWW'],
  ]) {
    const world = run(rows, 400);
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
  // The crank turns a generator ×4 AGAINST three batteries: when it wins,
  // current flows backwards through the batteries. The motor in that loop
  // turns a second generator with a lamp. Every time the clicker closed,
  // the motor used to get a burst as if the batteries had the loop to
  // themselves: current that never flowed and that nobody paid for. Now
  // every tick stands by itself: what goes in is exactly the heat that comes out.
  const world = build([
    '......WKBBBW.WW',
    'QGs-GsE....M-EL',
    '......WWWWWW.WW',
    '...............',
  ]);
  let crankWork = 0;
  let batteryWork = 0;
  let lampHeat = 0;
  setBlock(world, 0, 1, 'crankStop'); // nobody is turning the crank yet: the batteries run the motor, and pay for it
  for (let t = 0; t < 3200; t++) {
    if (t === 16) setBlock(world, 0, 1, 'crankCCW');
    more(world, 1);
    const sums = assertBooksBalance(world, `tick ${t}`);
    crankWork += sums.crank / 8;
    batteryWork += sums.battery / 8; // less than 0 while the generator charges the batteries
    lampHeat += amps(world, 14, 1) ** 2 / 8;
    // The motor's shaft: the current's push (MACHINE_K for each amp) is all there is to turn it, the second generator and their bearings.
    const push = MACHINE_K * currentOut(world, world.width + 11); // current out of a motor's right end turns it ↻
    assert.ok(push * spinAt(world, 11, 1) >= 0, `tick ${t}: the motor turns ${spinAt(world, 11, 1)} against its current's push ${push}`);
    assert.ok(lampHeat <= crankWork + batteryWork + 1e-9, `tick ${t}: lamp heat ${lampHeat} from crank work ${crankWork} and battery work ${batteryWork}`);
  }
  assert.ok(crankWork > 1, `the crank does turn (${crankWork})`);
  assert.ok(lampHeat > 1, `the lamp does light (${lampHeat})`);
});

test('a motor always turns the way the current that flows through it on THAT tick pushes it, even on the tick a clicker closes', () => {
  // One battery, and a cranked generator that out-pushes it: the current
  // goes the generator's way. On each beat the motor used to start off
  // the battery's way, backwards, because it went by last tick's current.
  const world = build([
    '....WKBW.',
    'RGs-E..M.',
    '....WWWW.',
    '.........',
  ]);
  more(world, 40);
  let turned = 0;
  for (let t = 0; t < 160; t++) {
    more(world, 1);
    const current = currentOut(world, world.width + 7); // current out of a motor's top end turns it ↻
    const speed = spinAt(world, 7, 1);
    // Nothing but its own bearings on its shaft: the current's push is exactly what they rub away.
    assert.ok(Math.abs(MACHINE_K * current - MACHINE_DRAG * speed) < 1e-9, `tick ${t}: the motor turns ${speed} with a current of ${current}`);
    assertBooksBalance(world, `tick ${t}`);
    turned = Math.max(turned, Math.abs(speed));
  }
  assert.ok(turned > 0.5, `the motor does turn (${turned})`);
});

test('tapping a crank on and off never gets more out of a battery\'s motor than the battery and the crank put in', () => {
  // The same loop on plain wire: three batteries, a generator that
  // out-pushes them when the crank turns, and a motor turning a second
  // generator with a lamp. A hand starts and stops the crank again and
  // again. Each tick's books balance by themselves, so there is nothing
  // to gain from good timing.
  for (const beat of [1, 2, 3, 5, 8]) {
    const world = build([
      '......WWBBBW.WW',
      'QGs-GsE....M-EL',
      '......WWWWWW.WW',
      '...............',
    ]);
    let put = 0;
    let lampHeat = 0;
    for (let t = 0; t < 1600; t++) {
      setBlock(world, 0, 1, Math.floor(t / beat) % 2 === 0 ? 'crankStop' : 'crankCCW');
      more(world, 1);
      const sums = assertBooksBalance(world, `beat ${beat}, tick ${t}`);
      put += (sums.crank + sums.battery) / 8;
      lampHeat += amps(world, 14, 1) ** 2 / 8;
      assert.ok(lampHeat <= put + 1e-9, `beat ${beat}, tick ${t}: lamp heat ${lampHeat} from ${put} of crank and battery work`);
    }
    assert.ok(lampHeat > 0.1, `beat ${beat}: the lamp does light (${lampHeat})`);
  }
});

test('a generator and a motor on one shaft, wired head to tail through any number of lamps, push against each other exactly: no current, no flicker', () => {
  // A crank, a generator and a motor on one shaft, the generator wired to
  // the motor through a ring of lamps. They are the same machine fitted
  // opposite ways, turning at the same speed, so their pushes cancel
  // exactly: no current flows, however many lamps, and the crank only
  // feels the two machines' bearings.
  // (The motor used to switch on and off tick by tick around the point
  // where its current faded out: with 23 lamps the shaft went 0.500 0.984 0.500 0.984...)
  const systems = allSystems();
  /**
   * Run a build for 20 ticks and return its speeds over all of them.
   * @param {string[]} rows - the picture
   * @returns {number[][]} every spinning block's speed, tick by tick
   */
  const speedsOf = (rows) => {
    const world = run(rows, 0);
    const seen = [];
    for (let i = 0; i < 20; i++) {
      tick(world, systems, blockInfo);
      seen.push([...world.signals.spin.cells.values()].map((cell) => cell.speed));
      assertBooksBalance(world, rows.join('/'));
    }
    return seen;
  };
  /**
   * The most any block's speed changed from one tick to the next.
   * @param {number[][]} seen - from speedsOf
   * @returns {number} the biggest change
   */
  const wobble = (seen) => Math.max(...seen.slice(1).map((speeds, t) => Math.max(...speeds.map((speed, k) => Math.abs(speed - seen[t][k])))));
  const free = CRANK_STRENGTH / (CRANK_STRENGTH / CRANK_SPEED + 2 * MACHINE_DRAG);
  for (const crank of ['R', 'Q']) {
    for (let lamps = 0; lamps <= 40; lamps++) {
      const top = `W${'L'.repeat(Math.min(lamps, 22))}`.padEnd(24, 'W');
      const bottom = `${`W${'L'.repeat(Math.max(0, lamps - 22))}`.padEnd(21, 'W')}EMW`;
      const seen = speedsOf([top, `W${'.'.repeat(22)}W`, bottom, `${'.'.repeat(21)}${crank}..`]);
      assert.equal(wobble(seen), 0, `${crank} with ${lamps} lamps: the shaft wobbles by ${wobble(seen)}`);
      assert.ok(Math.abs(Math.abs(seen[19][0]) - free) < 1e-9, `${crank} with ${lamps} lamps turns ${seen[19][0]}`);
    }
  }
  // And with no lamps or battery at all: two cranked generators feeding a
  // motor that sits on a third cranked generator's shaft.
  const seen = speedsOf([
    'WWWWWWWWWWWWW',
    'E.RE........W',
    'WWWWW.....WWW',
    '..REM.....W..',
    '...WWWWWWWW..',
  ]);
  assert.equal(wobble(seen), 0, `the three-generator build wobbles by ${wobble(seen)}`);
});

test('two rungs exactly alike among four generators in one loop turn exactly alike from the very first tick', () => {
  // Four generators in one loop, each on its own gears: a crank ×2, a
  // battery, two cranks ×8 that are exactly alike, and a motor's. They
  // all lean on each other hard. (The sums used to give up before they
  // settled: on the first tick the twins turned −1.1798 and −1.1412.)
  const rows = [
    '............WWW.',
    '..........RGE.W.',
    '............B.W.',
    '...RGs-Gs-GsE.W.',
    '............W.W.',
    '.........MsGE.W.',
    '............W.W.',
    '...RGs-Gs-GsE.W.',
    '............WWW.',
    '................',
  ];
  const world = run(rows, 1);
  const first = [spinAt(world, 12, 3), spinAt(world, 12, 7)];
  assert.ok(Math.abs(first[0]) > 1, `the twins turn (${first[0]})`);
  assert.ok(Math.abs(first[0] - first[1]) < 1e-6, `on the first tick the twins turn ${first[0]} and ${first[1]}`);
  // And that first answer is already the settled one.
  more(world, 1);
  assert.ok(Math.abs(spinAt(world, 12, 3) - first[0]) < 1e-6, `the first tick gave ${first[0]}, the second ${spinAt(world, 12, 3)}`);
});

test('machines whose pushes exactly cancel send no current: twin cranked generators wired head to head light no lamp, and each crank only feels its own bearings', () => {
  // Two builds exactly alike, their generators pushing against each other
  // through a lamp: the pushes add up to exactly nothing. (Each push used
  // to be rounded down to a hundredth of a volt, and a hair of difference
  // in the rounding turned into a phantom current that nobody paid for.)
  for (const train of ['R', 'RGs', 'RsG', 'RGs-Gs']) {
    const gap = '.'.repeat(train.length);
    // (The bottom crank turns the other way, so the two generators push against each other round the loop.)
    const world = run([`${gap}WWW`, `${train}E.L`, `${gap}W.W`, `${gap}W.W`, `${train.replace('R', 'Q')}E.W`, `${gap}WWW`], 60);
    const ratio = Math.abs(spinAt(world, train.length, 1) / spinAt(world, 0, 1)); // how many times faster the generator turns
    const free = CRANK_STRENGTH / (CRANK_STRENGTH / CRANK_SPEED + MACHINE_DRAG * ratio * ratio);
    for (const y of [1, 4]) assert.ok(Math.abs(Math.abs(spinAt(world, 0, y)) - free) < 1e-12, `${train}: crank ${y} turns ${spinAt(world, 0, y)}, free is ${free}`);
    assert.equal(amps(world, train.length + 2, 1), 0, `${train}: yet ${amps(world, train.length + 2, 1)} amps flow through the lamp`);
    assert.equal(world.signals.electric.flowing, false);
  }
  // And a battery nearly balanced by its motor: a crank turns the motor almost as fast as the battery would, so hardly any current is left.
  const helped = run(['.R.', 'WMW', 'B.W', 'WWW'], 10);
  assert.ok(spinAt(helped, 1, 1) > FREE_SPIN, `the motor turns ${spinAt(helped, 1, 1)}`);
  assert.ok(amps(helped, 0, 2) < 0.06, `the battery still gives ${amps(helped, 0, 2)}`);
  assertBooksBalance(helped, 'a motor helped by a crank');
});

// =============================================================
// The turbine: a spinning block turned by rising steam (issue #21)
// =============================================================

test('a turbine helps the way its gears already go: ↻ by itself, ↺ with a ↺ crank, and two on meshed gears never fight', () => {
  const alone = more(build(['#CCC#', '#...#', '##T##', '#~~~#', '##b##']), 300);
  assert.ok(Math.abs(spinAt(alone, 2, 2) - Math.SQRT2) < 0.01, `alone it turns ${spinAt(alone, 2, 2)}`);
  // A crank on its shaft: the turbine joins in the crank's way, and together they are faster than the crank alone.
  for (const [crank, way] of [['Q', -1], ['R', 1]]) {
    const world = more(build(['#CCC#', '#...#', `##T${crank}#`, '#~~~#', '##b##']), 300);
    assert.ok(way * spinAt(world, 2, 2) > 1.1 * CRANK_SPEED, `with crank ${crank} it turns ${spinAt(world, 2, 2)}`);
  }
  // Two turbines whose gears mesh must turn opposite ways. Neither minds: they go as fast as one alone.
  const pair = more(build(['#CCCCCC#', '#......#', '##TssT##', '##~##~##', '##b##b##']), 300);
  assert.ok(Math.abs(spinAt(pair, 2, 2) - Math.SQRT2) < 0.01, `the left one turns ${spinAt(pair, 2, 2)}`);
  assert.ok(Math.abs(spinAt(pair, 5, 2) + Math.SQRT2) < 0.01, `the right one turns ${spinAt(pair, 5, 2)}`);
  // And it keeps going the way it was going: never a flip from tick to tick.
  for (let i = 0; i < 40; i++) {
    more(pair, 1);
    assert.ok(spinAt(pair, 2, 2) > 1 && spinAt(pair, 5, 2) < -1, `tick ${i}: ${spinAt(pair, 2, 2)}, ${spinAt(pair, 5, 2)}`);
  }
});

test('a jammed turbine is marked jammed, and a turbine\'s record says which sides its pipe is open on', () => {
  // Three big gears in an L can't turn (see the jam test), and the turbine is on their shaft.
  const world = more(build(['GG', 'GT']), 1);
  const cell = spinCell(world, 1, 1);
  assert.equal(cell.jammed, true);
  assert.equal(cell.speed, 0);
  assert.deepEqual(cell.sides, ['up', 'down']);
  assert.equal(spinCell(world, 0, 0).sides, null); // a gear is not a fluid block
  // The ❌ is drawn on it, and no ❌ on one that is free.
  /**
   * How many red squares drawing a turbine with this record paints.
   * @param {object} record - its spin record
   * @returns {number} the count
   */
  const reds = (record) => {
    let count = 0;
    const ctx = { fillStyle: '', fillRect() { if (ctx.fillStyle === '#e53935') count++; } };
    blockInfo('turbine').drawSignals(ctx, blockInfo('turbine'), 0, 0, 64, record);
    return count;
  };
  assert.ok(reds(cell) > 0);
  assert.equal(reds({ ...cell, jammed: false }), 0);
  assert.equal(reds(undefined), 0); // in the palette
});

test('a turbine has one marked blade, and it is drawn really turning: with its spin record, the right way round', () => {
  const world = more(build(['#CCC#', '#...#', '##T##', '#~~~#', '##b##']), 100);
  refreshSignals(world);
  let handed;
  const spy = (name) => (name === 'turbine' ? { ...blockInfo(name), drawSignals: (...args) => { handed = args[5]; } } : blockInfo(name));
  drawWorld({ fillRect() {}, strokeRect() {}, fillText() {}, fillStyle: '', globalAlpha: 1 }, world, 10, spy, '#7ec8ff');
  assert.ok(handed && handed.speed > 1 && Array.isArray(handed.sides), `the turbine got ${JSON.stringify(handed)}`);
  const seen = [];
  for (let i = 0; i < 24; i++) {
    seen.push(markAngle(world, 2, 2));
    oneTick(world);
  }
  // Turning ↻: the marked blade only ever steps clockwise, an eighth of a turn at a time.
  const steps = seen.slice(1).map((angle, k) => stepRound(seen[k], angle));
  assert.ok(steps.every((step) => step >= -1e-9 && step < 0.2), `steps: ${steps}`);
  assert.ok(steps.some((step) => step > 0.1), 'the marked blade never moved');
});

test('no steam machine runs without its fire: plant → generator → pump → water wheel → generator → lamp stops when the burner does', () => {
  // On the left, the steam plant: its generator is wired only to the pump (^).
  // The pump lifts water out of a pool up a pipe; it runs through a water
  // wheel (O) and falls into a second basin. The wheel turns a second
  // generator, wired only to the lamp at the top.
  const world = build([
    '#CC#.......',
    '#..#...WLW.',
    '#..WWW#WEW.',
    '##TE.W#PO#.',
    '##~W.W#P..#',
    '##bW#WW^W.#',
    '###W~~~~W.#',
    '###WWWWWW##',
  ]);
  /**
   * All the water and steam in the world, added together.
   * @returns {number} the total
   */
  const fluid = () => allWater(world) + world.fluid.steam.reduce((sum, amount) => sum + amount, 0);
  const start = fluid();
  more(world, 120);
  assert.ok(spinAt(world, 2, 3) > 0.5, `the turbine turns ${spinAt(world, 2, 3)}`);
  assert.ok(amps(world, 7, 5) > 0.5, `the pump gets ${amps(world, 7, 5)}`);
  assert.ok(spinAt(world, 8, 3) > 0.2, `the wheel turns ${spinAt(world, 8, 3)}`);
  assert.ok(amps(world, 8, 1) > 0.1, `the lamp gets ${amps(world, 8, 1)}`);
  assert.ok(allWater(world) > 3, 'there is still plenty of water to pump');
  setBlock(world, 2, 5, 'burnerOff');
  more(world, 600);
  for (let i = 0; i < 50; i++) {
    more(world, 1);
    assert.equal(turbineSource(world, 2, 3), null, `tick ${i}: the turbine still has push`);
    assert.equal(spinAt(world, 2, 3), 0, `tick ${i}: the turbine still turns`);
    assert.ok(amps(world, 7, 5) < 0.01, `tick ${i}: the pump still gets ${amps(world, 7, 5)}`);
    assert.equal(spinAt(world, 8, 3), 0, `tick ${i}: the wheel still turns`);
    assert.ok(amps(world, 8, 1) < 0.01, `tick ${i}: the lamp still gets ${amps(world, 8, 1)}`);
  }
  assert.ok(Math.abs(fluid() - start) < 1e-6, `water and steam went from ${start} to ${fluid()}`);
});

// =============================================================
// ONE machine, one law (issues #14 and #15): voltage follows speed,
// push follows current, with the same number both ways.
// =============================================================

/**
 * The picture from issue #15: one battery's motor, a gear and an axle
 * over to a winch, with rope down to a load.
 * @param {string} load - 'c' (a crate), 'I' (an iron weight) or '.' (no rope at all)
 * @param {string} [beside] - what sits in the loop beside the battery: 'W' (wire) or 'L' (a lamp)
 * @returns {string[]} the picture
 */
const motorCrane = (load, beside = 'W') => {
  const rope = load === '.' ? '.' : 'r';
  return ['.s-Z', `WMW${rope}`, `B.${beside}${rope}`, `WWW${load}`, '....', '####'];
};

test('a motor draws the most current stalled, less lifting, and hardly any with nothing to turn', () => {
  const free = run(motorCrane('.'), 2);
  const lifting = run(motorCrane('c'), 2);
  const stalled = run(motorCrane('I'), 2);
  // [speed, current]: worked out from the law for a battery of 1 volt and 0.05, a coil of 0.45 (and a little wire).
  for (const [what, world, speed, current] of [['free', free, 0.952, 0.095], ['lifting a crate', lifting, 0.476, 1.048], ['stalled under an iron weight', stalled, 0, 2]]) {
    assert.ok(Math.abs(spinAt(world, 1, 1) - speed) < 0.01, `${what}: the motor turns ${spinAt(world, 1, 1)}`);
    assert.ok(Math.abs(currentAt(world, 1, 1) - current) < 0.03, `${what}: the motor draws ${currentAt(world, 1, 1)}`);
  }
  assert.equal(spinCell(stalled, 1, 1).stalled, true);
  assert.equal(stalled.signals.electric.cells.get(2 * 4).spark, false); // a stalled motor is not a short circuit
  // Free and stalled, nothing is lifted: every bit the battery gives is heat. Lifting, the rest is the crate going up
  // (its weight, 1, × how fast the winch turns).
  assertBooksBalance(free, 'free');
  assertBooksBalance(stalled, 'stalled');
  assertBooksBalance(lifting, 'lifting', -1 * spinAt(lifting, 3, 0));
  // The battery pays for the lifting: it gives ten times what it gives the free motor.
  assert.ok(books(lifting).battery > 10 * books(free).battery);
});

test('a lamp in a row with a motor is bright when the motor is stalled and nearly dark when it runs free', () => {
  const free = run(motorCrane('.', 'L'), 2);
  const stalled = run(motorCrane('I', 'L'), 2);
  assert.ok(Math.abs(currentAt(free, 2, 2) - 0.087) < 0.005, `free: the lamp gets ${currentAt(free, 2, 2)}`);
  assert.ok(Math.abs(currentAt(stalled, 2, 2) - 0.667) < 0.01, `stalled: the lamp gets ${currentAt(stalled, 2, 2)}`);
  assert.ok(lampLevel(free, 2, 2) < 0.1 && lampLevel(stalled, 2, 2) > 0.6);
});

test('a battery spins a generator just as fast as it spins a motor, the other way round', () => {
  const motor = run(['WMW', 'B.W', 'WWW'], 2);
  const generator = run(['WEW', 'B.W', 'WWW'], 2);
  assert.ok(spinAt(motor, 1, 0) > 0.9);
  assert.equal(spinAt(generator, 1, 0), -spinAt(motor, 1, 0));
  assert.equal(currentAt(generator, 1, 0), currentAt(motor, 1, 0));
  assert.equal(generator.signals.electric.cells.get(3).spark, false);
});

test('a battery pushing against a cranked generator helps the crank; two drive it faster than the crank alone could go; pushing with the crank holds it still', () => {
  const alone = run(['.R.', 'WEW', 'W.W', 'WWW'], 0);
  setBlock(alone, 1, 3, 'air');
  more(alone, 2);
  assert.equal(spinAt(alone, 1, 0), FREE_SPIN);
  const one = run(['.R.', 'WEW', 'W.W', 'WBW'], 2);
  assert.ok(spinAt(one, 1, 0) > FREE_SPIN && spinAt(one, 1, 0) < CRANK_SPEED, `one battery: ${spinAt(one, 1, 0)}`);
  assert.ok(Math.abs(spinAt(one, 1, 0) - 0.976) < 0.002);
  const two = run(['.R..', 'WEWW', 'W..W', 'WBBW'], 2);
  assert.ok(Math.abs(spinAt(two, 1, 0) - 1.438) < 0.01, `two batteries: ${spinAt(two, 1, 0)}`);
  // Faster than its top speed, the crank is being pulled round: the hand is holding it BACK, and takes work in.
  assert.ok(books(two).crank < 0);
  const held = run(['.Q.', 'WEW', 'W.W', 'WBW'], 2);
  assert.ok(Math.abs(spinAt(held, 1, 0)) < 0.01, `held: ${spinAt(held, 1, 0)}`);
  assert.ok(Math.abs(currentAt(held, 1, 1) - 2) < 0.03, `held: ${currentAt(held, 1, 1)} amps`);
  for (const [what, world] of [['alone', alone], ['one battery', one], ['two batteries', two], ['held', held]]) assertBooksBalance(world, what);
});

test('a motor turned by a crank lights a lamp just like a generator, with its + end on the other side', () => {
  const generator = run(['.R.', 'WEW', 'W.W', 'WLW'], 2);
  const motor = run(['.R.', 'WMW', 'W.W', 'WLW'], 2);
  assert.ok(lampLevel(generator, 1, 3) > 0.3);
  assert.equal(spinAt(motor, 1, 0), spinAt(generator, 1, 0));
  assert.equal(lampLevel(motor, 1, 3), lampLevel(generator, 1, 3));
  assert.ok(currentOut(generator, 4) > 0, 'turned ↻, a generator pushes current out of its right end');
  assert.equal(currentOut(motor, 4), -currentOut(generator, 4));
});

test('swap every motor for a generator and every generator for a motor: with no battery the build turns just the same, with every current the other way round', () => {
  for (const rows of [
    ['.R.', 'WEW', 'WMW'],
    ['.R..', 'WEWW', 'L..W', 'WEWW', '.Q..'],
    ['.WWW.', 'RE.Ms', '.WLW.'],
    ['..WWWWW.', 'RGsEsGM.', '..WWWWW.'],
    ['WWWWWWWWWWWWW', 'E.RE........W', 'WWWWW.....WWW', '..REM.....W..', '...WWWWWWWW..'],
  ]) {
    const swapped = rows.map((row) => row.replace(/[EM]/g, (letter) => (letter === 'E' ? 'M' : 'E')));
    const a = run(rows, 3);
    const b = run(swapped, 3);
    let turning = 0;
    for (const [index, cell] of a.signals.spin.cells) {
      assert.ok(Math.abs(cell.speed - b.signals.spin.cells.get(index).speed) < 1e-12, `${rows.join('/')}: ${cell.speed} against ${b.signals.spin.cells.get(index).speed}`);
      turning = Math.max(turning, Math.abs(cell.speed));
    }
    assert.ok(turning > 0.1);
    for (const index of a.signals.electric.cells.keys()) {
      assert.ok(Math.abs(currentOut(a, index) + currentOut(b, index)) < 1e-12, `${rows.join('/')}: currents ${currentOut(a, index)} and ${currentOut(b, index)}`);
    }
  }
  // With a battery and nothing else, the swapped build runs the other way round with the same currents.
  const a = run(['.s.', 'WMW', 'B.L', 'WWW'], 3);
  const b = run(['.s.', 'WEW', 'B.L', 'WWW'], 3);
  assert.equal(spinAt(b, 1, 0), -spinAt(a, 1, 0));
  assert.equal(currentOut(b, 4), currentOut(a, 4));
});

test('one battery\'s motor is one crank: it stalls on the same loads and lifts the others a little slower (its bearings rub)', () => {
  // The crank: pushes 2 standing still, tops out at 1. The motor, from the law: 1 volt ÷ (0.45 + 0.05) × MACHINE_K = 2, and 1 volt ÷ MACHINE_K = 1.
  assert.equal((1 / (MACHINE_RESISTANCE + 0.05)) * MACHINE_K, CRANK_STRENGTH);
  assert.equal(1 / MACHINE_K, CRANK_SPEED);
  for (const [load, weight] of [['.', 0], ['c', 1], ['I', 4]]) {
    const rope = load === '.' ? '.' : 'r';
    const crank = run(['R-Z', `..${rope}`, `..${rope}`, `..${load}`, '...', '###'], 2);
    const motor = run(motorCrane(load), 2);
    const byHand = spinAt(crank, 2, 0);
    const byMotor = spinAt(motor, 3, 0);
    assert.equal(byHand, Math.max(0, CRANK_SPEED * (1 - weight / CRANK_STRENGTH)));
    assert.ok(byMotor <= byHand && byMotor > byHand - 0.06, `load ${load}: the crank turns the winch ${byHand}, the motor ${byMotor}`);
  }
});

test('the books balance on every tick: battery energy + crank work = the heat in every resistance + the bearings\' heat, exactly', () => {
  const builds = [
    ['a lamp', ['.R.', 'WEW', 'W.W', 'WLW']],
    ['plain wire', ['.R.', 'WEW', 'W.W', 'WWW']],
    ['a battery against the crank', ['.R.', 'WEW', 'W.W', 'WBW']],
    ['a battery with the crank', ['.Q.', 'WEW', 'W.W', 'WBW']],
    ['a generator feeding a motor on a second shaft', ['.WWW.', 'RE.Ms', '.WLW.']],
    // The build from the turbine pass: a motor geared to HELP the train its own generator is on. It
    // used to give 1.28 times as much heat as the work put in. Now: exactly as much.
    ['a motor geared to help its own generator', ['..WWWWW.', 'RGsEsGM.', '..WWWWW.']],
    ['the same through a lamp', ['..WLWWW.', 'RGsEsGM.', '..WWWWW.']],
    ['the same, the motor geared the other way', ['..WWWWWW.', 'RGsEsGsM.', '..WWWWWW.']],
    ['three generators in a row', generatorsInARow(3, 'RGs').world],
    ['two generators against each other, and a battery', ['WBWWW.', 'EGssE.', 'WR..W.', 'WWWWW.']],
    ['a battery, a motor, a generator and a clicker', ['.WKWW.WWW', '.B..MsE.L', '.WWWW.WWW']],
    ['a cranked generator and a battery\'s motor on one shaft, through a clicker', ['WKWWW', 'B.R.W', 'WMsEW', 'W.L.W', 'WWWWW']],
  ];
  for (const [what, rows] of builds) {
    const world = Array.isArray(rows) ? build(rows) : rows;
    let work = 0;
    let heat = 0;
    for (let t = 0; t < 40; t++) { // two and a half beats of a clicker: the ticks it flips are checked like any other
      more(world, 1);
      const sums = assertBooksBalance(world, `${what}, tick ${t}`);
      work += sums.crank + sums.battery;
      heat += sums.heat + sums.rub;
    }
    assert.ok(work > 0.5, `${what}: something does happen (${work})`);
    assert.ok(Math.abs(heat / work - 1) < 1e-9, `${what}: heat ÷ work is ${heat / work}`);
  }
});

test('a generator-fed motor is at full speed on the very first tick', () => {
  const world = build(['.WWW.', 'RE.Ms', '.WWW.']);
  more(world, 1);
  const first = spinAt(world, 4, 1);
  assert.ok(Math.abs(first) > 0.4, `the motor's gear turns ${first}`);
  more(world, 30);
  assert.equal(spinAt(world, 4, 1), first);
});

test('with no battery, crank, faucet or burner, nothing ever starts: motors and generators wired every which way stand still', () => {
  for (const rows of [['WMEW', 'W..W', 'WWWW'], ['.WWW.', 'sE.Ms', '.WLW.'], ['..WWWWW.', 'sGsEsGM.', '..WWWWW.'], ['WWWWW', 'W.s.W', 'WMsEW', 'W.L.W', 'WWWWW']]) {
    const world = run(rows, 20);
    for (const cell of world.signals.spin.cells.values()) assert.equal(cell.speed, 0, rows.join('/'));
    assert.equal(world.signals.electric.flowing, false);
    assert.equal(world.signals.spin.turning, false);
  }
});
