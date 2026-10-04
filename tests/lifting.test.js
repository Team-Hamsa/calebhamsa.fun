/**
 * lifting.test.js — checks the 🏗️ pack with the real blocks: a crank and
 * winch lift a crate, an iron weight is too heavy until the winch is
 * geared down (or hangs on a pulley hook), gearing UP makes even a crate
 * too heavy, a rope over a pulley, and cutting the rope.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, getBlock, setBlock, tick } from '../js/world.js';
import { allSystems, blockInfo, blocksInPack } from '../js/blocks/registry.js';
import { drawWorld } from '../js/block-art.js';
import lifting from '../js/blocks/lifting.js';
import { spinAt } from '../js/blocks/gears.js';

/** What each letter in a test picture means. */
const LETTERS = {
  '.': 'air', '#': 'stone', s: 'gearSmall', G: 'gearBig', '-': 'axle', R: 'crankCW', Q: 'crankCCW',
  w: 'winch', '|': 'rope', P: 'pulley', h: 'pulleyHook', c: 'crate', I: 'ironWeight', S: 'sand',
  f: 'faucet', O: 'waterWheel', D: 'drain', W: 'wire', B: 'battery', M: 'motor', E: 'generator', L: 'lamp', X: 'crankStop', K: 'clicker',
};

/**
 * Build a world from a picture.
 * @param {string[]} rows - the picture
 * @returns {object} the world
 */
function make(rows) {
  const world = createWorld(rows[0].length, rows.length);
  rows.forEach((row, y) => [...row].forEach((letter, x) => setBlock(world, x, y, LETTERS[letter])));
  return world;
}

/**
 * Run a world's clock for some ticks.
 * @param {object} world - the world
 * @param {number} ticks - how many
 * @returns {object} the same world
 */
function run(world, ticks) {
  const systems = allSystems();
  for (let i = 0; i < ticks; i++) tick(world, systems, blockInfo);
  return world;
}

/**
 * Which row a block is in, looking down one column.
 * @param {object} world - the world
 * @param {number} x - the column
 * @param {string} name - the block to look for
 * @returns {number} its row (−1 if it isn't there)
 */
function rowOf(world, x, name) {
  for (let y = 0; y < world.height; y++) if (getBlock(world, x, y) === name) return y;
  return -1;
}

test('the lifting tab shows its six blocks', () => {
  assert.deepEqual(blocksInPack('lift'), ['winch', 'rope', 'pulley', 'pulleyHook', 'crate', 'ironWeight']);
  assert.deepEqual(lifting.tab, { id: 'lift', icon: '🏗️', label: 'Lifting' });
});

test('a crank turning a winch ↻ lifts a crate, as far as the rope goes', () => {
  const world = run(make(['Rw', '.|', '.|', '.|', '.c', '##']), 24);
  assert.equal(rowOf(world, 1, 'crate'), 2); // up two; the last bit of rope stays
  assert.equal(getBlock(world, 1, 1), 'rope');
});

test('turning the crank ↺ lowers the crate until it rests on the ground', () => {
  const world = run(make(['Qw', '.|', '.c', '..', '..', '##']), 12);
  assert.equal(rowOf(world, 1, 'crate'), 4);
  assert.deepEqual([1, 2, 3].map((y) => getBlock(world, 1, y)), ['rope', 'rope', 'rope']);
});

test('the iron weight is too heavy for a crank: everything stalls', () => {
  const world = run(make(['Rw', '.|', '.|', '.I', '.#']), 16);
  assert.equal(rowOf(world, 1, 'ironWeight'), 3);
  const winch = world.signals.spin.cells.get(1);
  assert.equal(winch.stalled, true);
  assert.equal(winch.jammed, false);
  assert.equal(spinAt(world, 0, 0), 0); // the crank can't turn either
});

test('geared down twice (a quarter as fast) the crank lifts the iron weight', () => {
  // crank 1 → small 1 → big −½ → axle −½ → small −½ → big ¼ → winch ¼
  const world = run(make(['RsG-sGw', '......|', '......|', '......|', '......I', '......#']), 40);
  assert.equal(spinAt(world, 6, 0), 0.125); // a quarter as fast, then halved again by the heavy load
  assert.ok(rowOf(world, 6, 'ironWeight') < 4, 'the iron weight did not move');
});

test('a pulley hook makes the iron weight half as heavy: geared down once is enough', () => {
  // crank ↺ 1 → small −1 → big ½ → winch ½, lifting a hooked iron weight (4 / 2 = 2; 2 × ½ = 1)
  const world = run(make(['QsGw', '...|', '...|', '...|', '...h', '...I', '...#']), 40);
  assert.ok(rowOf(world, 3, 'ironWeight') < 5, 'the iron weight did not move');
  assert.equal(world.signals.spin.cells.get(3).stalled, false);
});

test('without the hook, the same machine stalls', () => {
  const world = run(make(['QsGw', '...|', '...|', '...|', '...I', '...#']), 16);
  assert.equal(rowOf(world, 3, 'ironWeight'), 4);
});

test('gearing UP makes lifting harder: a crank geared up twice can\'t lift a crate', () => {
  // crank ↺ 1 → big −1 → small 2 → winch 2: the crate needs 1 × 2 = 2
  const world = run(make(['QGsw', '...|', '...|', '...c', '...#']), 16);
  assert.equal(rowOf(world, 3, 'crate'), 3);
  assert.equal(world.signals.spin.cells.get(3).stalled, true);
});

test('a rope over a pulley: the winch on the ground lifts a crate hanging the other side', () => {
  const world = run(make(['P|w', '|.R', '|.#', 'c..', '...', '###']), 16);
  assert.equal(rowOf(world, 0, 'crate'), 2);
});

test('a crate hanging on a rope stays up, and falls when the rope is dug away', () => {
  const world = run(make(['.w', '.|', '.c', '..', '##']), 4);
  assert.equal(rowOf(world, 1, 'crate'), 2);
  setBlock(world, 1, 1, 'air');
  run(world, 2);
  assert.equal(rowOf(world, 1, 'crate'), 3);
});

test('a crate lowered onto sand can be lifted off it again (the sand isn\'t lifted too)', () => {
  const world = run(make(['Qw', '.|', '.c', '..', '.S', '##']), 12);
  assert.equal(rowOf(world, 1, 'crate'), 3);
  setBlock(world, 0, 0, 'crankCW');
  run(world, 12);
  assert.equal(rowOf(world, 1, 'crate'), 2);
  assert.equal(rowOf(world, 1, 'sand'), 4);
});

test('cutting the rope in the middle drops the crate', () => {
  const world = run(make(['.w.', '.|.', '.|.', '.|.', '.c.', '...', '...', '###']), 2);
  setBlock(world, 1, 2, 'air');
  run(world, 6);
  assert.equal(rowOf(world, 1, 'crate'), 6);
});

test('lots of water is strong: two water wheels lift a hooked iron weight with no gears at all', () => {
  // Like Caleb's dad's machine: six faucets, two wheels on one axle, a gear, the winch.
  const world = run(make([
    'fff.fff.....', '............', '.O---O-sw...', '.D...D..|...', '........|...', '........h...', '........I...', '############',
  ]), 80);
  assert.equal(world.signals.spin.cells.get(2 * 12 + 8).stalled, false);
  assert.ok(rowOf(world, 8, 'ironWeight') < 6, 'the iron weight did not move');
});

test('more water is stronger: one faucet\'s wheel can\'t lift the hooked iron weight that six can', () => {
  const world = run(make([
    'f...........', '............', '.O-----sw...', '.D......|...', '........|...', '........h...', '........I...', '############',
  ]), 80);
  assert.equal(rowOf(world, 8, 'ironWeight'), 6);
});

test('more batteries make a motor stronger: five batteries lift the iron weight with no gears', () => {
  // Five batteries and a motor in a loop; a big gear on the motor's shaft, axles over to the winch.
  const world = run(make(['.....G--w.', 'WBBBBMBW|.', 'W......W|.', 'W......W|.', 'WWWWWWWWI.']), 24);
  assert.equal(world.signals.spin.cells.get(8).stalled, false);
  assert.ok(rowOf(world, 8, 'ironWeight') < 4, 'the iron weight did not move');
});

test('one battery\'s motor is only as strong as a crank: it can\'t lift the iron weight', () => {
  const world = run(make(['.....G--w.', 'WWWWWMBW|.', 'W......W|.', 'W......W|.', 'WWWWWWWWI.']), 24);
  assert.equal(world.signals.spin.cells.get(8).stalled, true);
});

test('heavier loads go up slower', () => {
  const crate = run(make(['Rw', '.|', '.|', '.|', '.|', '.c', '.#']), 4);
  const hookedIron = run(make(['QsGw', '...|', '...|', '...|', '...h', '...I', '...#']), 4);
  // Crank → winch with a crate (1 of its 2): half the crank's speed.
  assert.equal(spinAt(crate, 1, 0), 0.5);
  // Geared down once, hooked iron (counts 2 → 1 at the crank): also half... of half.
  assert.equal(spinAt(hookedIron, 3, 0), 0.25);
});

test('every lifting block can be drawn, in the world and in the palette', () => {
  const world = run(make(['Rw.P|w', '.|.|.|', '.c.h.I', '.....#']), 3);
  const ctx = { fillRect() {}, strokeRect() {}, fillText() {}, fillStyle: '', globalAlpha: 1 };
  drawWorld(ctx, world, 16, blockInfo, '#7ec8ff');
  for (const name of blocksInPack('lift')) {
    const info = blockInfo(name);
    info.drawSignals?.(ctx, info, 0, 0, 16, undefined, 0);
  }
});

test('a weight resting on the ground is no counterweight: it can\'t help a crank lift the iron weight', () => {
  // The right-hand iron weight already sits on stone, so its rope is slack.
  const world = run(make(['RwGGw.', '.|..|.', '.|..|.', '.|..I.', '.I..#.', '.#....']), 40);
  assert.equal(rowOf(world, 1, 'ironWeight'), 4); // still too heavy for a crank
  assert.equal(rowOf(world, 4, 'ironWeight'), 3);
  assert.equal(world.signals.spin.cells.get(1).stalled, true);
  assert.equal(spinAt(world, 0, 0), 0);
});

test('a counterweight that really hangs does help: it goes down as the iron weight goes up', () => {
  const world = run(make(['RwGGw.', '.|..|.', '.|..I.', '.|....', '.I....', '.#..#.']), 40);
  assert.ok(rowOf(world, 1, 'ironWeight') < 4, 'the iron weight did not go up');
  assert.ok(rowOf(world, 4, 'ironWeight') > 2, 'the counterweight did not go down');
});

test('letting out rope with the load already on the ground: the crank turns at its own speed, no faster', () => {
  for (const load of ['I', 'c', '.']) {
    const world = run(make(['Qw', '.|', `.${load}`, '.#']), 20);
    assert.equal(spinAt(world, 1, 0), -1, `with "${load}" under the rope`);
  }
});

test('a weight lying on the ground is not free power for a generator', () => {
  /**
   * How fast the crank ends up turning, with something under the rope.
   * @param {string} load - the letter under the rope ('.' for nothing)
   * @returns {number} turns per second
   */
  const crankSpeed = (load) => {
    const world = run(make(['..WLW.', '..WLW.', '..WLW.', '..WEW.', '...Qw.', '....|.', `....${load}.`, '######']), 200);
    return spinAt(world, 3, 4);
  };
  const alone = crankSpeed('.');
  assert.ok(alone < 0);
  assert.equal(crankSpeed('c'), alone);
  assert.equal(crankSpeed('I'), alone);
});

/**
 * Run a world tick by tick and write down which row a block is in after each tick.
 * @param {object} world - the world
 * @param {number} x - the column to watch
 * @param {string} name - the block to watch
 * @param {number} ticks - how many ticks
 * @returns {number[]} its row after each tick
 */
function rowsOverTime(world, x, name, ticks) {
  const rows = [];
  for (let i = 0; i < ticks; i++) rows.push(rowOf(run(world, 1), x, name));
  return rows;
}

/**
 * A tall empty world with a floor, with some rows drawn at the top.
 * @param {string[]} top - the top rows
 * @param {number} height - how many rows in all (the last one is stone)
 * @returns {string[]} the picture
 */
function tall(top, height) {
  const width = top[0].length;
  return [...top, ...Array(height - top.length - 1).fill('.'.repeat(width)), '#'.repeat(width)];
}

test('a load let down on a rope never goes down faster than one that is just dropped', () => {
  const dropped = rowsOverTime(make(tall(['...I'], 14)), 3, 'ironWeight', 12);
  // Geared UP: the winch turns twice as fast as the crank, the let-out way.
  const world = make(tall(['RGsw', '...|', '...I'], 14));
  const lowered = [2, ...rowsOverTime(world, 3, 'ironWeight', 12)];
  for (let i = 1; i < lowered.length; i++) {
    assert.ok(lowered[i] - lowered[i - 1] <= 1, `it went down ${lowered[i] - lowered[i - 1]} cells in one tick`);
  }
  const ticksToFloor = (rows) => rows.indexOf(12) + 1;
  assert.ok(ticksToFloor(lowered.slice(1)) >= 10, 'ten cells take at least ten ticks');
  assert.equal(ticksToFloor(dropped), 12); // free fall: one cell every tick
});

test('a heavy load going down doesn\'t whirl the crank: the winch stops at falling speed', () => {
  const world = run(make(tall(['RGsw', '...|', '...I'], 14)), 2);
  assert.equal(spinAt(world, 3, 0), -4); // 4 turns × 2 cells of rope = 8 cells a second = 1 cell a tick
  assert.equal(spinAt(world, 0, 0), 2);  // was 5
  // With no gears the iron weight still helps the crank along, like before.
  assert.equal(spinAt(run(make(tall(['Qw', '.|', '.I'], 14)), 2), 1, 0), -3);
});

test('a motor letting rope out faster than falling can\'t push the load down: rope can only pull', () => {
  // Five batteries: the motor turns the winch ↺ at more than 4 turns a second.
  const world = make(tall(['.....G--w.', 'WWWWWMWW|.', 'W......Wc.', 'WBBBBBWW..'], 15));
  const rows = [2, ...rowsOverTime(world, 8, 'crate', 10)];
  assert.ok(spinAt(world, 8, 0) < -4, `winch speed ${spinAt(world, 8, 0)}`);
  assert.ok(rows.at(-1) > 8, 'the crate did not go down');
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i] - rows[i - 1] <= 1, `${rows[i] - rows[i - 1]} cells in one tick`);
});

test('the winch\'s catch: two cranks that cancel out can\'t be pulled backwards by the load', () => {
  for (const load of ['c', 'I']) {
    const world = run(make(['RwQ', '.|.', '.|.', `.${load}.`, '...', '...', '###']), 60);
    assert.equal(spinAt(world, 1, 0), 0, `with "${load}" on the rope`);
    assert.equal(getBlock(world, 1, 3), LETTERS[load], 'the load sank');
    assert.equal(world.signals.spin.cells.get(1).stalled, true);
  }
});

test('the winch\'s catch: with no crank a hanging weight stays up, even with a generator or a lighter weight to pull', () => {
  const generator = run(make(['wEWW', '|W.L', 'IWWW', '....', '####']), 30);
  assert.equal(rowOf(generator, 0, 'ironWeight'), 2);
  assert.equal(spinAt(generator, 0, 0), 0);
  const pair = run(make(['.wGGw.', '.|..|.', '.I..c.', '......', '......', '######']), 30);
  assert.equal(rowOf(pair, 1, 'ironWeight'), 2);
  assert.equal(rowOf(pair, 4, 'crate'), 2);
});

test('the guide and the README tell you about the winch\'s catch', async () => {
  const { readFileSync } = await import('node:fs');
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  assert.match(readme, /ratchet/);
  assert.match(lifting.guide.blocks.winch.does, /catch/);
  assert.ok(lifting.guide.rules.some((rule) => /catch/.test(rule) && /ratchet/.test(rule)));
});

test('the winch is drawn with its little catch', () => {
  const calls = [];
  const ctx = { fillRect(...args) { calls.push({ style: ctx.fillStyle, args }); }, fillStyle: '' };
  const info = blockInfo('winch');
  info.drawSignals(ctx, info, 0, 0, 16, undefined, 0);
  assert.ok(calls.some((call) => call.style === '#eceff1'), 'no catch drawn');
});

test('two winches on one rope end don\'t lift it twice as fast, or count its weight twice', () => {
  const shared = make(['..wR', '..|.', 'w|P.', 'R.|.', '..|.', '..|.', '..|.', '..c.', '..#.']);
  const single = make(['..wR', '..|.', '..|.', '..|.', '..|.', '..|.', '..|.', '..c.', '..#.']);
  run(shared, 8);
  run(single, 8);
  assert.equal(rowOf(shared, 2, 'crate'), rowOf(single, 2, 'crate')); // the load goes at the speed of the rope
  run(shared, 8);
  run(single, 8);
  assert.equal(rowOf(shared, 2, 'crate'), 5);
  assert.equal(rowOf(single, 2, 'crate'), 5);
  assert.equal(spinAt(shared, 2, 0), 0.5); // the rope end's owner carries the crate (1 of its crank's 2)...
  assert.equal(spinAt(shared, 0, 2), 1);   // ...the other winch carries nothing
});

test('two winches on one crank and one rope end: the load counts once', () => {
  // Both winches touch the crank, and both ropes end over the same crate.
  const world = run(make(['.wRw.', '.|.|.', '.P|P.', '.|...', '.c...', '.#...']), 2);
  const rope = spinAt(world, 1, 0);
  assert.equal(rope, 0.5); // weight 1 against strength 2. Counted twice it would stall.
});

test('two winches on one rope end: whichever ONE is cranked lifts the crate, and feels its weight', () => {
  for (const rows of [
    ['..w.', '..|.', 'w|P.', 'R.|.', '..|.', '..|.', '..|.', '..c.', '..#.'], // only the side winch is cranked
    ['.w..', '.|..', '.P|w', '.|.R', '.|..', '.|..', '.|..', '.c..', '.#..'], // the same, mirrored
    ['..wR', '..|.', 'w|P.', '..|.', '..|.', '..|.', '..|.', '..c.', '..#.'], // only the top winch is cranked
  ]) {
    const world = run(make(rows), 24);
    const column = rows[7].indexOf('c');
    assert.equal(rowOf(world, column, 'crate'), 4, rows.join('/')); // 3 cells up: 0.5 turn a second for 3 seconds
    const cranked = rows[3].includes('R') ? [rows[2].indexOf('w'), 2] : [rows[0].indexOf('w'), 0];
    assert.equal(spinAt(world, cranked[0], cranked[1]), 0.5, rows.join('/')); // the crate's weight slows it
  }
});

test('two winches on one rope end: the one that is cranked stalls on an iron weight, it doesn\'t spin free', () => {
  const world = run(make(['..w.', '..|.', 'w|P.', 'R.|.', '..|.', '..|.', '..|.', '..I.', '..#.']), 24);
  assert.equal(rowOf(world, 2, 'ironWeight'), 7);
  assert.equal(spinAt(world, 0, 2), 0);
  assert.equal(world.signals.spin.cells.get(2 * 4 + 0).stalled, true);
});

test('short pulls add up: a motor on a clicker lifts a crate bit by bit, like one that is always on', () => {
  // Geared down 4 times, the winch winds less than half a cell of rope in each 1 second pulse.
  for (const part of ['K', 'W']) {
    const rows = ['WWWW......', `${part}..B......`, 'WWMW......', '..sG-sGw..', '.......|..', '.......|..', '.......|..', '.......c..', '##########'];
    const world = run(make(rows), 400);
    assert.equal(rowOf(world, 7, 'crate'), 5, part); // up 2 cells: as far as the rope goes
  }
});

/**
 * The pulsed machine: a battery and a clicker drive a motor, geared down,
 * that lets out a winch with an iron weight hanging on it; the weight
 * helps turn a geared-up generator that lights a lamp of its own.
 * @returns {object} the world
 */
function pulsedDrop() {
  return make([
    'WWWW............', 'K..B............', 'WWMW......WWW...', '..sGwGs-GsE.L...', '....|.....WWW...', '....I...........',
    '................', '................', '................', '................', '................', '################',
  ]);
}

test('rope let out stays let out: a weight lowered in short pulses comes down bit by bit, and lands', () => {
  const world = pulsedDrop();
  run(world, 7);
  assert.ok(spinAt(world, 4, 3) < -0.2); // the motor lets rope out, less than a cell in each pulse
  run(world, 57);
  const part = rowOf(world, 4, 'ironWeight');
  assert.ok(part > 5 && part < 10, `after 4 pulses the weight is at row ${part}`);
  run(world, 600);
  assert.equal(rowOf(world, 4, 'ironWeight'), 10); // on the ground
});

test('a hanging weight only gives power by really coming down: the lamp never gets more than the battery and the fall put in', () => {
  const world = pulsedDrop();
  const systems = allSystems();
  const battery = world.cells.indexOf('battery');
  const lamp = 3 * world.width + 12;
  let batteryEnergy = 0;
  let lampEnergy = 0;
  for (let t = 0; t < 1200; t++) {
    tick(world, systems, blockInfo);
    batteryEnergy += world.signals.electric.cells.get(battery).current / 8; // 1 volt × current × an eighth of a second
    lampEnergy += world.signals.electric.cells.get(lamp).current ** 2 / 8;  // current² × resistance 1
  }
  const fallen = rowOf(world, 4, 'ironWeight') - 5;
  assert.equal(fallen, 5);
  // An iron weight (4) pulls the winch round half a turn for each cell it comes down.
  assert.ok(lampEnergy <= batteryEnergy + (4 * fallen) / 2, `lamp ${lampEnergy}, battery ${batteryEnergy}`);
  // And once it has landed, the lamp only gets a small share of what the battery gives.
  let late = 0;
  let lateBattery = 0;
  for (let t = 0; t < 800; t++) {
    tick(world, systems, blockInfo);
    lateBattery += world.signals.electric.cells.get(battery).current / 8;
    late += world.signals.electric.cells.get(lamp).current ** 2 / 8;
  }
  assert.ok(late < lateBattery, `lamp ${late}, battery ${lateBattery}`);
});

test('two winches with hanging weights, each one\'s generator driving the other\'s motor, stop when the weights land', () => {
  const world = make([
    '..WWWWLWWWWWWWW.', '..W...........W.', '..W...WWLWW...W.', '..MsswE...MsswE.', '..W..|WWBWW..|W.', '..W..I.......IW.',
    '..W...........W.', '..W...........W.', '..WWWWWWWWWWWWW.', '................', '................', '################',
  ]);
  run(world, 1); // a one-tick kick from a battery...
  setBlock(world, 8, 4, 'wire'); // ...then no battery, crank, faucet or burner anywhere
  run(world, 400);
  assert.equal(rowOf(world, 5, 'ironWeight'), 7);  // both weights came down as far as they can
  assert.equal(rowOf(world, 13, 'ironWeight'), 7);
  assert.equal(spinAt(world, 5, 3), 0);
  assert.equal(spinAt(world, 13, 3), 0);
  assert.equal(world.signals.electric.flowing, false); // and both lamps are dark
});
