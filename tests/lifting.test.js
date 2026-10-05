/**
 * lifting.test.js — checks the 🏗️ pack with the real blocks: a crank and
 * winch lift a crate, an iron weight is too heavy until the winch is
 * geared down (or hangs on a pulley hook), gearing UP makes even a crate
 * too heavy, a rope over a pulley, and cutting the rope.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, getBlock, getFluid, setBlock, setFluid, tick } from '../js/world.js';
import { allSystems, blockInfo, blocksInPack } from '../js/blocks/registry.js';
import { drawWorld } from '../js/block-art.js';
import lifting, { ROPE_PER_TURN, STEAM_PUSH, WATER_WEIGHT, winchLoad } from '../js/blocks/lifting.js';
import { DROP_POWER, RISE_POWER } from '../js/fluids.js';
import { TICKS_PER_SECOND, spinAt } from '../js/blocks/gears.js';

/** What each letter in a test picture means. */
const LETTERS = {
  '.': 'air', '#': 'stone', s: 'gearSmall', G: 'gearBig', '-': 'axle', R: 'crankCW', Q: 'crankCCW',
  w: 'winch', '|': 'rope', P: 'pulley', h: 'pulleyHook', c: 'crate', I: 'ironWeight', S: 'sand',
  f: 'faucet', O: 'waterWheel', T: 'turbine', D: 'drain', W: 'wire', B: 'battery', M: 'motor', E: 'generator', L: 'lamp', X: 'crankStop', K: 'clicker',
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

test('the guide and the wiki tell you about the winch\'s catch', async () => {
  const { readFileSync } = await import('node:fs');
  const wiki = readFileSync(new URL('../wiki/Lifting.md', import.meta.url), 'utf8');
  assert.match(wiki, /ratchet/);
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
  const world = run(make(['.wRw.', '.|.|.', '.P|P.', '.|...', '.|...', '.c...', '.#...']), 2); // (a cell of rope to spare: right at the pulley it would be stopped)
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

// =============================================================
// Water and steam in a load's way push back (issue #21)
// =============================================================

test('water weighs what its fall is worth, and steam pushes back with what its rise is worth', () => {
  // One cell of rope is 1 ÷ ROPE_PER_TURN turns, and a turn a second is TICKS_PER_SECOND ticks of work:
  // lifting a full cell of water one cell must cost the winch at least DROP_POWER.
  assert.equal(WATER_WEIGHT * TICKS_PER_SECOND / ROPE_PER_TURN, DROP_POWER);
  assert.equal(STEAM_PUSH * TICKS_PER_SECOND / ROPE_PER_TURN, RISE_POWER);
  assert.ok(WATER_WEIGHT > blockInfo('crate').weight, 'a crate is lighter than water');
  assert.ok(WATER_WEIGHT < blockInfo('ironWeight').weight, 'an iron weight is heavier');
});

test('a crate floats: let down onto water it stops there, its rope goes slack and it helps the crank no more', () => {
  const world = make(['Qw.', '.|.', '.c.', '...', '###']);
  for (const x of [0, 1, 2]) setFluid(world, 'water', x, 3, 1);
  run(world, 40);
  assert.equal(rowOf(world, 1, 'crate'), 2); // still on top of the water
  assert.equal(spinAt(world, 1, 0), -1);     // the crank turns at its own speed: nothing pulls it round
  const load = winchLoad(world, 1, 0, blockInfo);
  assert.equal(load.pull, -0);
  assert.equal(load.resting, true);
  assert.equal(load.lifting, -1); // but lifting it off the water takes its whole weight
});

test('a crate still sinks into a puddle too shallow to hold it up, and no water is lost', () => {
  const world = make(['Qw.', '.|.', '.c.', '...', '###']);
  for (const x of [0, 1, 2]) setFluid(world, 'water', x, 3, 0.3); // 0.3 of a cell weighs 0.75: less than the crate
  run(world, 40);
  assert.equal(rowOf(world, 1, 'crate'), 3);
  const water = world.fluid.water.reduce((sum, amount) => sum + amount, 0);
  assert.ok(Math.abs(water - 0.9) < 1e-9, `water ${water}`);
});

test('an iron weight sinks, but in water it pulls less: it has to lift the water out of its way', () => {
  const world = make(['Xw.', '.|.', '.I.', '...', '###']);
  assert.equal(winchLoad(world, 1, 0, blockInfo).pull, -4);
  setFluid(world, 'water', 1, 3, 1);
  const load = winchLoad(world, 1, 0, blockInfo);
  assert.equal(load.pull, -(4 - WATER_WEIGHT));
  assert.equal(load.lifting, -4);
  assert.equal(load.resting, false);
  // On a pulley hook the water still goes up just ONE cell (into the hook's cell: water runs
  // through a hook), and two cells of rope share it, like the weight: everything is halved.
  const hooked = make(['Xw.', '.|.', '.h.', '.I.', '...', '###']);
  setFluid(hooked, 'water', 1, 4, 0.5);
  assert.equal(winchLoad(hooked, 1, 0, blockInfo).pull, -(4 - WATER_WEIGHT * 0.5) / 2);
  setFluid(hooked, 'water', 1, 4, 1);
  assert.equal(winchLoad(hooked, 1, 0, blockInfo).pull, -(4 - WATER_WEIGHT) / 2);
  assert.equal(winchLoad(hooked, 1, 0, blockInfo).resting, false, 'iron on a hook sinks, just like iron alone');
});

test('a pulley hook does not make its load float: iron on a hook sinks to the bottom like iron alone, and no water is lost', () => {
  for (const rows of [['#Qw#', '##|#', '##I#', '##.#', '##.#', '##.#', '####'], ['#Qw#', '##|#', '##h#', '##I#', '##.#', '##.#', '##.#', '####']]) {
    const world = make(rows);
    const floor = world.height - 1;
    for (const y of [floor - 3, floor - 2, floor - 1]) setFluid(world, 'water', 2, y, 1);
    run(world, 200);
    assert.equal(rowOf(world, 2, 'ironWeight'), floor - 1, `${rows.length} rows: the iron weight is on the bottom`);
    const water = world.fluid.water.reduce((sum, amount) => sum + amount, 0);
    assert.ok(Math.abs(water - 3) < 1e-9, `water ${water}`);
  }
  // And a crate on a hook floats on just what a crate alone floats on: 0.4 of a cell, no less.
  for (const [amount, row] of [[0.3, 4], [0.5, 3]]) {
    const world = make(['#Qw#', '##|#', '##h#', '##c#', '##.#', '####']);
    setFluid(world, 'water', 2, 4, amount);
    run(world, 100);
    assert.equal(rowOf(world, 2, 'crate'), row, `a crate on a hook over ${amount} of water`);
  }
});

test('an empty pulley hook goes down through water: it lets the water through and lifts none', () => {
  // A film of water far too thin to see used to hold the weightless hook up for ever.
  const damp = make(['Qw.', '.|.', '.h.', '...', '...', '###']);
  setFluid(damp, 'water', 1, 4, 0.01);
  run(damp, 80);
  assert.equal(rowOf(damp, 1, 'pulleyHook'), 4);
  // And into a full well: the water stays just where it was.
  const well = make(['#Qw#', '##|#', '##h#', '##.#', '##.#', '####']);
  setFluid(well, 'water', 2, 3, 1);
  setFluid(well, 'water', 2, 4, 1);
  run(well, 80);
  assert.equal(rowOf(well, 2, 'pulleyHook'), 4);
  assert.ok(Math.abs(getFluid(well, 'water', 2, 3) + getFluid(well, 'water', 2, 4) - 2) < 1e-9, 'all the water is still in the well');
  assert.ok(getFluid(well, 'water', 2, 2) < 1e-9, 'and none was lifted');
  // A loose hook falls through water the same way.
  const loose = make(['#h#', '#.#', '#.#', '###']);
  setFluid(loose, 'water', 1, 2, 0.7);
  run(loose, 5);
  assert.equal(rowOf(loose, 1, 'pulleyHook'), 2);
  assert.equal(getFluid(loose, 'water', 1, 2), 0.7);
});

test('loose blocks pay for the water they lift too: a loose crate floats, sand and iron sink', () => {
  for (const [name, amount, row] of [['crate', 1, 0], ['crate', 0.5, 0], ['crate', 0.3, 1], ['sand', 1, 1], ['ironWeight', 1, 1]]) {
    const world = make(['#.#', '#.#', '###']);
    setBlock(world, 1, 0, name);
    setFluid(world, 'water', 1, 1, amount);
    run(world, 10);
    assert.equal(rowOf(world, 1, name), row, `${name} over ${amount} of water`);
    assert.ok(Math.abs(getFluid(world, 'water', 1, 1 - row) - amount) < 1e-9, 'no water is lost');
  }
  assert.ok(blockInfo('sand').weight > WATER_WEIGHT, 'sand is heavier than water');
});

test('a load going up through steam is heavier: it has to push the steam down', () => {
  const world = make(['Rw', '.|', '.|', '.c', '##']);
  setFluid(world, 'steam', 1, 2, 0.2);
  const load = winchLoad(world, 1, 0, blockInfo);
  assert.equal(load.lifting, -(1 + STEAM_PUSH * 0.2));
  assert.equal(load.pull, -1); // coming down, steam gives nothing back
  // In a sealed shaft with steam packed under the winch, a crank (strength
  // 2, top speed 1) lifts the crate slower: at 1 − (its weight + the steam's push) ÷ 2.
  const sealed = steamShaft();
  const above = getFluid(sealed, 'steam', 2, 4);
  assert.ok(above > 0.1 && above < 0.3, `steam above the crate: ${above}`);
  setBlock(sealed, 1, 1, 'crankCW');
  run(sealed, 1);
  assert.ok(Math.abs(spinAt(sealed, 2, 1) - (1 - (1 + STEAM_PUSH * above) / 2)) < 1e-9, `speed ${spinAt(sealed, 2, 1)}`);
  // And too much steam is too heavy for the crank: it stalls.
  setFluid(sealed, 'steam', 2, 4, above + 0.3);
  run(sealed, 2);
  assert.equal(spinAt(sealed, 2, 1), 0);
  assert.equal(sealed.signals.spin.cells.get(1 * 5 + 2).stalled, true);
});

/**
 * A sealed shaft: a stopped crank and a winch, three cells of rope and a
 * crate, with steam that has settled under the winch (the top two rope
 * cells are full, and a little is left in the cell right above the crate).
 * @returns {object} the world
 */
function steamShaft() {
  const world = make(['#####', '#Xw##', '##|##', '##|##', '##|##', '##c##', '#####']);
  setFluid(world, 'steam', 2, 2, 2.3);
  return run(world, 300);
}

test('steam that comes into the way late is still paid for: the load waits until the rope has paid', () => {
  const world = steamShaft();
  const winch = 1 * 5 + 2;
  setBlock(world, 1, 1, 'crankCW');
  run(world, 10); // most of a cell wound in, paying for the little steam that was there
  assert.equal(rowOf(world, 2, 'crate'), 5);
  setFluid(world, 'steam', 2, 4, getFluid(world, 'steam', 2, 4) + 0.1); // now more steam drifts in above the crate
  let waited = 0; // ticks it stood still with a whole cell of rope already wound
  let paid = 0;
  let cost = 0;
  for (let t = 0; t < 200 && rowOf(world, 2, 'crate') === 5; t++) {
    paid = world.signals.lift.aside.get(winch) ?? 0;
    cost = STEAM_PUSH * getFluid(world, 'steam', 2, 4);
    if (world.signals.lift.pull.get(winch) >= 1) {
      waited++;
      assert.ok(paid < cost, 'it only waits while the steam is not paid for');
    }
    run(world, 1);
  }
  assert.equal(rowOf(world, 2, 'crate'), 4, 'in the end it goes up');
  assert.ok(waited >= 1, 'a whole cell of rope was not enough: it had to keep winding');
  // What was left over after paying is kept for the next cell, and is never more than was paid in.
  const left = world.signals.lift.aside.get(winch) ?? 0;
  assert.ok(left >= 0 && left < paid + STEAM_PUSH, `left over ${left}`);
  assert.ok(getFluid(world, 'steam', 2, 5) > 0.2, 'the steam ended up under the crate');
});

/**
 * Run a machine with a crank that a hand flips to and fro, and add up
 * the work the crank puts in and the most work its wheels and turbines
 * could do with what the water and steam gave up.
 * @param {object} world - the world
 * @param {{x: number, y: number}} crank - where the crank is
 * @param {number} cycles - how many times to go down and up
 * @param {Function} isDown - (world) => true when the load is at the low end
 * @param {Function} isUp - (world) => true when the load is at the high end
 * @param {string[]} order - which way to turn first, then second ('crankCW' or 'crankCCW')
 * @returns {{crank: number, best: number, strokes: number}} the crank's
 *   work, the wheels' and turbines' best work, and how many strokes got there
 */
function shuttle(world, crank, cycles, isDown, isUp, order) {
  const systems = allSystems();
  let work = 0;
  let best = 0;
  let strokes = 0;
  /**
   * One tick, counting the work.
   * @returns {void}
   */
  const step = () => {
    tick(world, systems, blockInfo);
    const speed = Math.abs(spinAt(world, crank.x, crank.y));
    if (getBlock(world, crank.x, crank.y) !== 'crankStop') work += 2 * (1 - speed) * speed; // a crank: strength 2, top speed 1
    for (const gave of world.signals.water?.waterWork?.values() ?? []) best += DROP_POWER * gave;
    for (const turbine of world.signals.water?.turbines?.values() ?? []) best += RISE_POWER * turbine.work;
  };
  for (let cycle = 0; cycle < cycles; cycle++) {
    for (const way of order) {
      const there = way === 'crankCW' ? isUp : isDown;
      setBlock(world, crank.x, crank.y, way);
      for (let t = 0; t < 200 && !there(world); t++) step();
      if (there(world)) strokes++;
      setBlock(world, crank.x, crank.y, 'crankStop');
      for (let t = 0; t < 60; t++) step();
    }
  }
  return { crank: work, best, strokes };
}

test('no power from shuttling a load through sealed steam: the turbine never gets more than the hand put in', () => {
  // The machine from the review of issue #21. No burner anywhere. A
  // weightless pulley hook goes up and down a shaft; each stroke up used
  // to carry the steam above it to below it for free, and that steam then
  // rose through the turbine: light for ever from a hand that did no work.
  for (const [load, steam] of [['pulleyHook', 4], ['pulleyHook', 4.4], ['crate', 3.6]]) {
    const world = make(['########', '#w######', '#|..####', '#|#T####', '#|..####', '#|######', '#.######', '########']);
    setBlock(world, 0, 1, 'crankStop');
    setFluid(world, 'steam', 2, 2, steam);
    run(world, 800); // let the steam settle
    setBlock(world, 1, 6, load);
    const { crank, best, strokes } = shuttle(world, { x: 0, y: 1 }, 10, (w) => rowOf(w, 1, load) === 6, (w) => rowOf(w, 1, load) === 3, ['crankCW', 'crankCCW']);
    assert.equal(strokes, 20, `${load} in ${steam} of steam: it should get there every time`);
    // Steam goes through a pulley hook, so a bare hook pushes none down. A crate does.
    if (load === 'pulleyHook') assert.ok(best < 1e-6, `a bare hook moves no steam (${best})`);
    else assert.ok(best > 5, `${load}: the turbine should get some push (${best})`);
    assert.ok(best <= crank + 1e-6, `${load} in ${steam} of steam: the turbine could do ${best} but the hand only put in ${crank}`);
  }
});

test('no power from dipping a load in a pool: the water wheel never gets more than the hand put in', () => {
  // The same trick with water: a crate dipped into a pool lifts the water
  // one cell; it runs off over a water wheel and back under.
  for (const hook of [false, true]) {
    const top = hook ? ['########', '#w######', '#|######', '#h######'] : ['########', '#w######', '#|######'];
    const rows = [...top, '#c..####', '#.#O####', '#...####', '########'];
    const up = top.length; // the crate's row at the top
    for (const amount of [3.3, 3.5]) {
      const world = make(rows);
      setBlock(world, 0, 1, 'crankStop');
      setFluid(world, 'water', 2, up + 2, amount);
      run(world, 400);
      const { crank, best, strokes } = shuttle(world, { x: 0, y: 1 }, 10, (w) => rowOf(w, 1, 'crate') === up + 1, (w) => rowOf(w, 1, 'crate') === up, ['crankCCW', 'crankCW']);
      assert.equal(strokes, 20, `hook ${hook}, ${amount} of water`);
      assert.ok(best > 2, `hook ${hook}: the wheel should get some push (${best})`);
      assert.ok(best <= crank + 1e-6, `hook ${hook}, ${amount} of water: the wheel could do ${best} but the hand only put in ${crank}`);
    }
    // And a deeper pool just holds the crate up: nothing goes down, nothing turns.
    const deep = make(rows);
    setBlock(deep, 0, 1, 'crankCCW');
    setFluid(deep, 'water', 2, up + 2, 4.2);
    run(deep, 200);
    assert.equal(rowOf(deep, 1, 'crate'), up, `hook ${hook}: the crate floats`);
  }
});

test('ropes that cross are tied: a winch cannot wind in a rope end that another winch\'s rope runs through', () => {
  // Winch B (left) sends its rope sideways to a pulley and down to a crate over a pool.
  // One cell of that run, (3, 3), is the hanging END of winch A's bare rope. A used to be
  // able to wind it in: B's rope was cut, the crate dropped into the pool and lifted the
  // water for nothing, A let its rope out again, and B fished the crate back out.
  const world = make(['#########', '##Rw#####', '###|#####', 'Xw|||P###', '#####|###', '#####c###', '#####...#', '#####.#O#', '#####...#', '#########']);
  setFluid(world, 'water', 6, 8, 1.5);
  run(world, 100);
  assert.equal(getBlock(world, 3, 3), 'rope', 'A did not wind the tied end in');
  assert.equal(rowOf(world, 5, 'crate'), 5, 'and the crate still hangs on B\'s rope');
  assert.equal(spinAt(world, 3, 1), 1, 'A just turns: there is nothing on its rope');
  // B can still work its own rope, through the tied cell.
  setBlock(world, 2, 1, 'crankStop');
  setBlock(world, 0, 3, 'crankCCW');
  run(world, 30);
  assert.ok(rowOf(world, 5, 'crate') > 5, 'B lets the crate down');
  // A rope end that hangs free of any other rope winds in as ever.
  const free = make(['Rw.', '.|.', '.|.', '...', '###']);
  run(free, 30);
  assert.equal(getBlock(free, 1, 2), 'air');
});

test('a tied rope end with a load on it is a hard stop for its winch, like the top', () => {
  const world = make(['##Rw#####', '###|#####', 'Xw|||P###', '###c#|###', '###.#c###', '#########']);
  run(world, 20);
  assert.equal(getBlock(world, 3, 2), 'rope');
  assert.equal(rowOf(world, 3, 'crate'), 3);
  assert.equal(spinAt(world, 3, 0), 0);
  assert.equal(world.signals.spin.cells.get(3).stopper, true, 'it shows the orange ⬆');
});

test('rope let out a little is owed: winding it back costs what the load gave, even with the load dug away', () => {
  const world = make(['Qw.', '.|.', '.c.', '...', '...', '...', '###']);
  const winch = 1;
  run(world, 1);
  const out = world.signals.lift.pull.get(winch);
  assert.ok(out < 0 && out > -1, `a little rope is out (${out})`);
  assert.equal(rowOf(world, 1, 'crate'), 2, 'and the crate has not moved yet');
  setBlock(world, 1, 2, 'air'); // a hand digs the crate away
  const load = winchLoad(world, 1, 0, blockInfo);
  assert.equal(load.pull, -0, 'nothing hangs on the rope');
  assert.equal(load.lifting, -1, 'but winding back in still costs the crate\'s weight');
  setBlock(world, 0, 0, 'crankCW');
  run(world, 1);
  assert.equal(spinAt(world, 1, 0), 0.5, 'the crank feels it: half speed, as if it lifted the crate');
  run(world, 10);
  assert.ok((world.signals.lift.pull.get(winch) ?? 0) >= 0, 'the owed rope is wound back');
  assert.equal(winchLoad(world, 1, 0, blockInfo).lifting, -0, 'and then the bare rope is free again');
});

test('rope wound in a little with nothing on it does not help lift a load that turns up later', () => {
  // Two winches share one rope end. The right one winds half a cell of bare rope (for nothing).
  // The left one lets the end down onto a crate. The right one's half cell must not count.
  const world = make(['#Xw|P|wX#', '####|####', '####.####', '####c####', '#########']);
  setBlock(world, 7, 0, 'crankCW');
  run(world, 2); // bare rope: 2 ticks at speed 1 wind half a cell
  setBlock(world, 7, 0, 'crankStop');
  assert.equal(world.signals.lift.pull.get(6), 0.5);
  setBlock(world, 1, 0, 'crankCCW');
  run(world, 8);
  setBlock(world, 1, 0, 'crankStop');
  assert.equal(getBlock(world, 4, 2), 'rope', 'the left winch let the rope end down onto the crate');
  setBlock(world, 7, 0, 'crankCW'); // lifting a crate, a crank winds a cell in 8 ticks
  run(world, 6);
  assert.equal(rowOf(world, 4, 'crate'), 3, 'the half cell wound with nothing on the rope is forgotten: not up yet');
  run(world, 3);
  assert.equal(rowOf(world, 4, 'crate'), 2, 'it comes up after a whole cell of rope wound against its weight');
});

test('no power from a load that never moves: three winches on bridged and shared ropes cannot wind owed rope back for nothing', () => {
  // The second machine from the review. B (with a crank, and a generator and lamp on its shaft)
  // lets a little rope out: the iron weight helps. A's rope end is one cell of B's rope; idle C
  // shares the rope end. A tries to cut B off so B can wind back with nothing on it, then bridge again.
  for (const name of ['ironWeight', 'crate']) {
    const world = make(['#############', '#####Xw######', '#WWWX#|######', '#L.Ew|||P|w##', '#WWW####|####', '########.####', '########.####', '########.####', '#############']);
    setBlock(world, 8, 5, name);
    const systems = allSystems();
    const B = 3 * world.width + 4;
    let work = 0; // the hand's work on B's crank (minus: the crank pushed the hand)
    let heat = 0;
    /**
     * One tick, counting the crank's work and the heat in the lamp and wires.
     * @returns {void}
     */
    const step = () => {
      tick(world, systems, blockInfo);
      const crank = getBlock(world, 4, 2);
      if (crank !== 'crankStop') {
        const speed = spinAt(world, 4, 2) * (crank === 'crankCW' ? 1 : -1);
        work += 2 * (1 - speed) * speed;
      }
      for (const [index, cell] of world.signals.electric?.cells ?? []) heat += (blockInfo(world.cells[index])?.part?.resistance ?? 0) * (cell.current ?? 0) ** 2;
    };
    for (let cycle = 0; cycle < 20; cycle++) {
      setBlock(world, 4, 2, 'crankCCW');
      for (let t = 0; t < 2; t++) step();
      setBlock(world, 4, 2, 'crankStop');
      setBlock(world, 5, 1, 'crankCW'); // A tries to cut
      for (let t = 0; t < 12; t++) step();
      assert.equal(getBlock(world, 6, 3), 'rope', 'A cannot cut B\'s rope');
      setBlock(world, 5, 1, 'crankStop');
      setBlock(world, 4, 2, 'crankCW');
      for (let t = 0; t < 12 && (world.signals.lift.pull.get(B) ?? 0) < 0; t++) step();
      setBlock(world, 4, 2, 'crankStop');
      step();
    }
    const fell = 4 * blockInfo(name).weight * (rowOf(world, 8, name) - 5); // what the load's real fall is worth
    const owedRope = -4 * (world.signals.lift.pull.get(B) ?? 0) * (world.signals.lift.weighed.get(B) ?? 0); // rope still out, at what it was paid
    assert.ok(heat <= work + fell + owedRope + 1e-6, `${name}: heat ${heat} from hand ${work}, fall ${fell}, owed rope ${owedRope}`);
    assert.ok(-work <= fell + owedRope + 1e-6, `${name}: the hand was pushed ${-work} by a fall worth ${fell + owedRope}`);
  }
});

test('the guide and the wiki say that water pushes back: a crate floats, and steam is hard to push through', async () => {
  const { readFileSync } = await import('node:fs');
  const wiki = readFileSync(new URL('../wiki/Lifting.md', import.meta.url), 'utf8');
  assert.match(wiki, /crate \*\*floats\*\*/);
  assert.match(wiki, /steam/);
  assert.doesNotMatch(wiki, /Nothing floats/);
  assert.ok(lifting.guide.rules.some((rule) => /FLOATS/.test(rule) && /steam/.test(rule)));
});

test('lowering a load onto the ground and lifting it again never pays the crank: slack rope has to be wound back in', () => {
  for (const [rows, load] of [[['wR.', '|..', 'c..', '...', '###'], 'crate'], [['wR.', '|..', 'c..', '...', '...', '###'], 'crate'], [['Rsw..', '..|..', '..c..', '.....', '#####'], 'crate']]) {
    for (const lowering of [2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 30]) { // how many ticks the crank lets out for: it lands part way through some
      const world = make(rows);
      const systems = allSystems();
      const crank = world.cells.indexOf('crankCW');
      const [x, y] = [crank % world.width, Math.floor(crank / world.width)];
      const column = world.cells.indexOf(load) % world.width;
      const start = rowOf(world, column, load);
      let work = 0;
      /**
       * One tick, adding up the crank's work (it is paid back when the load turns it faster than its own speed).
       * @returns {void}
       */
      const step = () => {
        tick(world, systems, blockInfo);
        const speed = Math.abs(spinAt(world, x, y));
        work += (2 * (1 - speed) * speed) / 8;
      };
      for (let cycle = 0; cycle < 20; cycle++) {
        setBlock(world, x, y, 'crankCCW');
        for (let t = 0; t < lowering; t++) step();
        setBlock(world, x, y, 'crankCW');
        // Up again, until the load is back AND the rope let out is wound back in.
        const winch = world.cells.indexOf('winch');
        for (let t = 0; t < 400 && (rowOf(world, column, load) !== start || (world.signals.lift.pull.get(winch) ?? 0) < 0); t++) step();
        assert.equal(rowOf(world, column, load), start, 'the load should come back up');
        assert.ok(work >= -1e-9, `${rows.join('/')} letting out for ${lowering} ticks: after ${cycle + 1} trips the crank is ${-work} ahead`);
      }
    }
  }
});

// ---- The top is a hard stop (issue #26) -------------------------------------

/**
 * A block's spin record.
 * @param {object} world - the world
 * @param {number} x - column
 * @param {number} y - row
 * @returns {object} its record (from spin.js)
 */
function record(world, x, y) {
  return world.signals.spin.cells.get(y * world.width + x);
}

test('a crate wound right up to the winch is a hard stop: the crank stops dead and stays stopped (orange ⬆, not red ⬇)', () => {
  for (const rows of [['Rw', '.|', '.|', '.|', '.c', '##'], ['wR', '|.', '|.', '|.', 'c.', '##']]) { // and the same, mirrored
    const world = run(make(rows), 20);
    const winchX = rows[0].indexOf('w');
    const crankX = rows[0].indexOf('R');
    for (let t = 0; t < 40; t++) { // no flickering: every single tick is the same
      run(world, 1);
      assert.equal(rowOf(world, winchX, 'crate'), 2, rows.join('/'));
      assert.equal(spinAt(world, crankX, 0), 0, `the crank still turns on tick ${t}`);
      assert.equal(spinAt(world, winchX, 0), 0);
      assert.equal(record(world, winchX, 0).blocked, true);
      assert.equal(record(world, winchX, 0).stopper, true);  // the winch is what stops it...
      assert.equal(record(world, crankX, 0).blocked, true);
      assert.equal(record(world, crankX, 0).stopper, false); // ...the crank is only stopped BY it
      assert.equal(record(world, winchX, 0).stalled, false); // not "too heavy"
    }
  }
});

test('only winding in is stopped at the top: turn the other way and the load comes down at once; take the crank away and nothing is stopped', () => {
  const world = run(make(['Rw', '.|', '.|', '.|', '.c', '##']), 30);
  assert.equal(record(world, 1, 0).blocked, true);
  setBlock(world, 0, 0, 'crankCCW');
  run(world, 1);
  assert.equal(record(world, 1, 0).blocked, false);
  assert.ok(spinAt(world, 1, 0) < 0, 'the winch should turn the let-out way on the very next tick');
  run(world, 11);
  assert.equal(rowOf(world, 1, 'crate'), 4); // back on the ground
  // Up again, then take the crank away: nothing is pushing, so nothing is being stopped.
  setBlock(world, 0, 0, 'crankCW');
  run(world, 30);
  assert.equal(record(world, 1, 0).stopper, true);
  setBlock(world, 0, 0, 'air');
  run(world, 1);
  assert.equal(record(world, 1, 0).blocked, false);
  assert.equal(record(world, 1, 0).stopper, false);
  assert.equal(rowOf(world, 1, 'crate'), 2); // the catch still holds it up
});

test('the stop goes through the gears: every gear on the train stops, and a motor stalls', () => {
  const geared = run(make(['QsGw', '...|', '...|', '...c', '...#']), 60); // crank ↺ → big gear ↻ → winch ↻, half as fast
  assert.equal(rowOf(geared, 3, 'crate'), 2);
  for (let x = 0; x < 4; x++) {
    assert.equal(spinAt(geared, x, 0), 0);
    assert.equal(record(geared, x, 0).blocked, true);
    assert.equal(record(geared, x, 0).stopper, x === 3);
  }
  const motor = run(make(['.....G--w.', 'WBBBBMBW|.', 'W......W|.', 'W......W|.', 'WWWWWWWWc.']), 60);
  assert.equal(rowOf(motor, 8, 'crate'), 2);
  assert.equal(spinAt(motor, 5, 1), 0); // the motor is held still
  assert.equal(record(motor, 5, 1).blocked, true);
  assert.equal(record(motor, 8, 0).stopper, true);
  assert.equal(record(motor, 8, 0).stalled, false);
});

test('a generator on the stopped train stops too: its lamp goes dark', () => {
  const world = make(['...WWW', 'Rw-E.L', '.|.WWW', '.|....', '.|....', '.c....', '######']);
  const lamp = world.cells.indexOf('lamp');
  run(world, 6);
  assert.ok(world.signals.electric.cells.get(lamp).current > 0, 'the lamp should be lit while the crate goes up');
  run(world, 200);
  assert.equal(rowOf(world, 1, 'crate'), 3);
  assert.equal(spinAt(world, 3, 1), 0);
  assert.equal(world.signals.electric.cells.get(lamp).current, 0);
});

test('two winches on one train: the first load to reach the top stops them both, and only that winch is marked', () => {
  const world = run(make(['RwRw', '.|.|', '.|.|', '.c.|', '.#.|', '.#.c', '.#.#']), 40);
  assert.equal(rowOf(world, 1, 'crate'), 2); // up one: at the top
  assert.equal(rowOf(world, 3, 'crate'), 4); // up one too, and there it hangs
  for (let t = 0; t < 20; t++) {
    run(world, 1);
    assert.equal(rowOf(world, 3, 'crate'), 4);
    assert.equal(spinAt(world, 3, 0), 0);
    assert.equal(record(world, 1, 0).stopper, true);
    assert.equal(record(world, 3, 0).stopper, false);
    assert.equal(record(world, 3, 0).blocked, true);
  }
});

test('a pulley hook at the top, and a load pulled up to a pulley, are hard stops too', () => {
  const hook = run(make(['Rw', '.|', '.|', '.h', '.c', '##']), 60);
  assert.equal(rowOf(hook, 1, 'pulleyHook'), 2);
  assert.equal(spinAt(hook, 0, 0), 0);
  assert.equal(record(hook, 1, 0).stopper, true);
  const well = run(make(['P|w', '|.R', '|.#', 'c..', '...', '###']), 60);
  assert.equal(rowOf(well, 0, 'crate'), 2);
  assert.equal(spinAt(well, 2, 1), 0);
  assert.equal(record(well, 2, 0).stopper, true);
});

test('two winches on one rope end: when the load is at the pulley neither can wind any more, so both stop', () => {
  const world = run(make(['..wR', '..|.', 'w|P.', 'R.|.', '..|.', '..c.', '..#.']), 60);
  assert.equal(rowOf(world, 2, 'crate'), 4);
  for (let t = 0; t < 10; t++) {
    run(world, 1);
    assert.equal(spinAt(world, 2, 0), 0);
    assert.equal(spinAt(world, 0, 2), 0);
    assert.equal(record(world, 2, 0).stopper, true);
    assert.equal(record(world, 0, 2).stopper, true);
  }
});

test('rope let out a little at the top is wound back in before the stop: the winch turns until it really is at the top', () => {
  const world = run(make(['Rw', '.|', '.c', '..', '##']), 4);
  assert.equal(record(world, 1, 0).stopper, true);
  setBlock(world, 0, 0, 'crankCCW');
  run(world, 1); // a little rope out: not a whole cell yet
  assert.equal(rowOf(world, 1, 'crate'), 2);
  assert.ok(world.signals.lift.pull.get(1) < 0);
  setBlock(world, 0, 0, 'crankCW');
  run(world, 1);
  assert.ok(spinAt(world, 1, 0) > 0, 'the winch should wind the slack back in');
  run(world, 20);
  assert.equal(spinAt(world, 1, 0), 0);
  assert.equal(record(world, 1, 0).stopper, true);
  assert.equal(rowOf(world, 1, 'crate'), 2);
});

test('the stop at the top gives nothing away: lowering from the top and winding back up never pays the crank', () => {
  for (const rows of [['Rw', '.|', '.c', '..', '..', '..', '..', '##'], ['Rw', '.|', '.h', '.c', '..', '..', '..', '##']]) {
    for (const lowering of [1, 2, 3, 4, 5, 7, 9, 30]) {
      const world = make(rows);
      const systems = allSystems();
      let work = 0;
      /**
       * One tick, adding up the crank's work (it is paid back when the load turns it faster than its own speed).
       * @returns {void}
       */
      const step = () => {
        tick(world, systems, blockInfo);
        const speed = Math.abs(spinAt(world, 0, 0));
        work += (2 * (1 - speed) * speed) / 8;
      };
      for (let cycle = 0; cycle < 20; cycle++) {
        setBlock(world, 0, 0, 'crankCCW');
        for (let t = 0; t < lowering; t++) step();
        setBlock(world, 0, 0, 'crankCW');
        step();
        for (let t = 0; t < 400 && !record(world, 1, 0).stopper; t++) step();
        assert.equal(record(world, 1, 0).stopper, true, 'the load should come back to the top');
        assert.equal(getBlock(world, 1, 2), rows[2] === '.c' ? 'crate' : 'pulleyHook');
        assert.ok(work >= -1e-9, `${rows.join('/')} letting out for ${lowering} ticks: after ${cycle + 1} trips the crank is ${-work} ahead`);
      }
    }
  }
});

test('a winch with no rope, or with rope and nothing hanging on it, is not stopped: bare rope just winds onto the drum', () => {
  const none = run(make(['Rw', '..', '##']), 10);
  assert.equal(spinAt(none, 0, 0), 1);
  assert.equal(record(none, 1, 0).blocked, false);
  const bare = run(make(['Rw', '.|', '.|', '..', '##']), 30);
  assert.equal(spinAt(bare, 0, 0), 1);
  assert.equal(record(bare, 1, 0).blocked, false);
  assert.equal(record(bare, 1, 0).stopper, false);
});

test('too heavy at the top is still "too heavy": the red ⬇, not the orange ⬆', () => {
  const world = run(make(['Rw', '.|', '.I', '..', '##']), 10);
  assert.equal(record(world, 1, 0).stalled, true);
  assert.equal(record(world, 1, 0).blocked, false);
  assert.equal(record(world, 1, 0).stopper, false);
});

test('the winch at the top is drawn with an orange ⬆, and a stalled one keeps its red ⬇', () => {
  /**
   * The colors a winch with this record is drawn in.
   * @param {object} cell - a pretend spin record
   * @returns {string[]} every fill color used
   */
  const colors = (cell) => {
    const used = [];
    const ctx = { fillRect() { used.push(ctx.fillStyle); }, fillStyle: '' };
    const info = blockInfo('winch');
    info.drawSignals(ctx, info, 0, 0, 16, cell, 0);
    return used;
  };
  const top = colors({ speed: 0, blocked: true, stopper: true });
  assert.ok(top.includes('#fb8c00'), 'no orange arrow');
  assert.ok(!top.includes('#e53935'), 'the red arrow is for "too heavy" only');
  const heavy = colors({ speed: 0, stalled: true });
  assert.ok(heavy.includes('#e53935'));
  assert.ok(!heavy.includes('#fb8c00'));
  // A winch that is only stopped BY another winch's load shows no arrow.
  const other = colors({ speed: 0, blocked: true, stopper: false });
  assert.ok(!other.includes('#fb8c00') && !other.includes('#e53935'));
});

test('the guide and the wiki explain the orange ⬆', async () => {
  const { existsSync, readFileSync } = await import('node:fs');
  const wiki = readFileSync(new URL('../wiki/Lifting.md', import.meta.url), 'utf8');
  assert.match(wiki, /orange ⬆/);
  assert.ok(wiki.includes('(blocks/winch-top.png)'));
  assert.ok(existsSync(new URL('../wiki/blocks/winch-top.png', import.meta.url)));
  assert.match(lifting.guide.blocks.winch.does, /orange ⬆/);
  assert.ok(lifting.guide.rules.some((rule) => /orange ⬆/.test(rule) && /top/.test(rule)));
});
