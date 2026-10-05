/**
 * spin.test.js — checks how gears, axles and spinning machines pass
 * their turning on: directions, speeds, axles, diagonals, jams and
 * sources. Each test draws a little world as a picture of letters.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, setBlock } from '../js/world.js';
import { solveSpin, spinAxis, spinWork } from '../js/spin.js';

/**
 * Stand-in blocks, with the same spin settings as the real ones in
 * js/blocks/gears.js. `R` is a crank turning ↻ at 1, `Q` one turning ↺ at 1.
 */
const TEST_BLOCKS = {
  gearSmall: { spin: { kind: 'gear', teeth: 8 } },
  gearBig: { spin: { kind: 'gear', teeth: 16, diagonal: true } },
  axle: { spin: { kind: 'axle' } },
  hub: { spin: { kind: 'hub' } },
  crankCW: { spin: { kind: 'hub' }, spinSource: () => ({ speed: 1, strength: 2 }) },
  crankCCW: { spin: { kind: 'hub' }, spinSource: () => ({ speed: -1, strength: 2 }) },
  fastCrank: { spin: { kind: 'hub' }, spinSource: () => ({ speed: 3, strength: 2 }) },
  strongCCW: { spin: { kind: 'hub' }, spinSource: () => ({ speed: -1, strength: 6 }) },
  // Like a winch with a weight on its rope: it's pulled the ↺ way, always.
  heavy: { spin: { kind: 'hub' }, spinLoad: () => -3 },
  light: { spin: { kind: 'hub' }, spinLoad: () => -1 },
  // Like a winch whose weight is lying on the ground: the rope is slack,
  // so it only pulls back when you try to wind it in (lift it).
  // Like a winch with a very heavy weight hanging on it. A weight on a rope
  // can't go down faster than it would fall: past 4 turns a second the rope is slack.
  falling: { spin: { kind: 'hub' }, spinLoad: () => ({ pull: -8, topSpeed: 4 }) },
  racer: { spin: { kind: 'hub' }, spinSource: () => ({ speed: -6, strength: 2 }) },
  grounded: { spin: { kind: 'hub' }, spinLoad: () => ({ pull: -3, resting: true }) },
  // Like a winch whose load has steam over it: it weighs 0.5 coming down, but
  // lifting it means pushing the steam down too, and that takes 1.5.
  steamy: { spin: { kind: 'hub' }, spinLoad: () => ({ pull: -0.5, lifting: -1.5 }) },
  // The same, but too hard to lift for one crank (strength 2).
  stuck: { spin: { kind: 'hub' }, spinLoad: () => ({ pull: -0.5, lifting: -2.5 }) },
  // Like a generator: pushes back 2 for every turn per second.
  dynamo: { spin: { kind: 'hub' }, spinDrag: () => 2 },
  // Like a motor or generator: its push depends on how fast other blocks turn
  // (see spinLink in spin.js). Each test says how, in `world.links`.
  linked: { spin: { kind: 'hub' }, spinLink: (world, x, y) => world.links?.get(y * world.width + x) ?? null },
  // Like a turbine: it will turn either way (↻ if nobody says otherwise).
  either: { spin: { kind: 'hub' }, spinSource: () => ({ speed: 1, strength: 2, eitherWay: true }) },
  // Like a winch whose load has reached the top: it can't turn ↻ any more.
  topped: { spin: { kind: 'hub' }, spinStop: () => 1 },
  stone: {},
};

/**
 * Look up a stand-in block.
 * @param {string} name - a block name
 * @returns {object|undefined} its settings (undefined for air)
 */
const blockInfo = (name) => TEST_BLOCKS[name];

/** What each letter means. */
const LETTERS = {
  '.': 'air', s: 'gearSmall', G: 'gearBig', '-': 'axle', H: 'hub', R: 'crankCW', Q: 'crankCCW',
  F: 'fastCrank', '#': 'stone', K: 'heavy', k: 'light', g: 'grounded', f: 'falling', Z: 'racer', Y: 'strongCCW', D: 'dynamo', N: 'linked', e: 'either', T: 'topped', S: 'steamy', U: 'stuck',
};

/**
 * Build a world from a picture and work out the spinning.
 * @param {string[]} rows - the picture
 * @param {object} [setUp] - extras: `links` (for the N blocks: "x,y" →
 *   {still, perTurn: {"x,y": number}}, see spinLink in spin.js) and
 *   `before` ("x,y" → the speed that block had on the last tick)
 * @returns {Function} (x, y) => that block's record
 */
function spin(rows, setUp = {}) {
  const world = createWorld(rows[0].length, rows.length);
  rows.forEach((row, y) => [...row].forEach((letter, x) => setBlock(world, x, y, LETTERS[letter])));
  /**
   * The cell index of a place written "x,y".
   * @param {string} place - like "1,0"
   * @returns {number} its cell index
   */
  const indexOf = (place) => Number(place.split(',')[1]) * world.width + Number(place.split(',')[0]);
  world.links = new Map(Object.entries(setUp.links ?? {}).map(([place, link]) => [
    indexOf(place),
    { still: link.still ?? 0, perTurn: new Map(Object.entries(link.perTurn ?? {}).map(([other, amount]) => [indexOf(other), amount])) },
  ]));
  if (setUp.before) {
    world.signals.spin = { cells: new Map(Object.entries(setUp.before).map(([place, speed]) => [indexOf(place), { speed }])) };
  }
  const { cells } = solveSpin(world, blockInfo);
  return (x, y) => cells.get(y * world.width + x);
}

test('touching gears turn opposite ways', () => {
  const at = spin(['Rsss']);
  assert.equal(at(1, 0).speed, 1);  // shares the crank's shaft: same way
  assert.equal(at(2, 0).speed, -1); // meshes: the other way
  assert.equal(at(3, 0).speed, 1);
});

test('big gear → small gear: twice as fast; small → big: half as fast', () => {
  const at = spin(['RGsG']);
  assert.equal(at(1, 0).speed, 1);
  assert.equal(at(2, 0).speed, -2);
  assert.equal(at(3, 0).speed, 1);
});

test('an axle carries the turning along its line, the same way round', () => {
  const at = spin(['Rs--s']);
  assert.equal(at(4, 0).speed, 1); // gear → axle → axle → gear, all the same way
  assert.equal(at(2, 0).axis, 'h');
});

test('an axle only connects along its line', () => {
  const at = spin(['.s.', 'R-s']); // the axle faces sideways; the gear above it isn't on its line
  assert.equal(at(2, 1).speed, 1);
  assert.equal(at(1, 0).speed, 0);
});

test('axles face their spinning neighbors', () => {
  const world = createWorld(1, 3);
  setBlock(world, 0, 0, 'gearSmall');
  setBlock(world, 0, 1, 'axle');
  setBlock(world, 0, 2, 'gearSmall');
  assert.equal(spinAxis(world, 0, 1, blockInfo), 'v');
});

test('hubs connect on all four sides', () => {
  const at = spin(['.s.', 'sRs', '.s.']);
  for (const [x, y] of [[1, 0], [0, 1], [2, 1], [1, 2]]) assert.equal(at(x, y).speed, 1);
});

test('big gears also mesh corner to corner; small gears never do', () => {
  const big = spin(['RG.', '..G']);
  assert.equal(big(2, 1).speed, -1);
  const small = spin(['Rs.', '..s']);
  assert.equal(small(2, 1).speed, 0);
  const mixed = spin(['RG.', '..s']);
  assert.equal(mixed(2, 1).speed, 0);
});

test('three big gears in an L (a triangle) jam: nothing turns', () => {
  const at = spin(['GG', 'GR']);
  for (const [x, y] of [[0, 0], [1, 0], [0, 1]]) {
    assert.equal(at(x, y).jammed, true);
    assert.equal(at(x, y).speed, 0);
  }
});

test('four small gears in a square turn fine (an even loop)', () => {
  const at = spin(['ss.', 'ssR']);
  assert.equal(at(0, 0).jammed, false);
  assert.equal(at(1, 1).speed, 1);
  assert.equal(at(0, 1).speed, -1);
});

test('two cranks turning opposite ways push against each other: equal ones stand still', () => {
  const fight = spin(['RsssQ']);
  assert.equal(fight(2, 0).speed, 0);
  assert.equal(fight(2, 0).jammed, false);
  assert.equal(fight(2, 0).stalled, false);
});

test('the stronger crank wins a fight, but slowly', () => {
  // R pushes ↻ with 2, Y pushes ↺ with 6: ↺ wins, at half Y's top speed.
  assert.equal(spin(['RsssY'])(4, 0).speed, -0.5);
});

test('a fast crank and a slow crank together turn in between (the slow one holds it back)', () => {
  assert.equal(spin(['RsF'])(1, 0).speed, 1.5);
});

test('no source, no turning; a source in one group does not turn another', () => {
  const at = spin(['ss#ss', 'R....']);
  assert.equal(at(0, 0).speed, 1);
  assert.equal(at(3, 0).speed, 0);
  assert.equal(at(3, 0).jammed, false);
});

test('a load heavier than the source\'s strength stalls the whole group', () => {
  const at = spin(['RK']);
  assert.equal(at(0, 0).speed, 0);
  assert.equal(at(1, 0).speed, 0);
  assert.equal(at(1, 0).stalled, true);
  assert.equal(at(0, 0).stalled, true);
  assert.equal(at(1, 0).jammed, false);
});

test('a load slows a source down: half its strength, half its speed', () => {
  const light = spin(['Rk']); // strength 2, load 1
  assert.equal(light(1, 0).speed, 0.5);
  assert.equal(light(1, 0).stalled, false);
});

test('turning the way the load pulls, the load helps: it goes faster', () => {
  assert.equal(spin(['QK'])(1, 0).speed, -2.5);
});

test('two sources on the same shaft add their strength together', () => {
  assert.equal(spin(['RK'])(1, 0).stalled, true);  // 2 < 3
  assert.equal(spin(['RKR'])(1, 0).speed, 0.25);    // 2 + 2 = 4 > 3
});

test('a faster source is not a stronger one', () => {
  assert.equal(spin(['FK'])(1, 0).stalled, true);
});

test('gearing down trades speed for strength: half as fast, twice as strong', () => {
  // Q ↺ → small → big (½ as fast, the other way) → heavy: 3 counts as 1.5 < 2, so it lifts slowly.
  const at = spin(['QsGK']);
  assert.equal(at(3, 0).stalled, false);
  assert.equal(at(3, 0).speed, 0.125);
});

test('a generator pushes back, harder the faster it\'s geared to turn', () => {
  const direct = spin(['RD']);
  assert.equal(direct(1, 0).speed, 0.5);
  const gearedUp = spin(['RGsD']); // the generator turns twice as fast as the crank...
  assert.equal(gearedUp(3, 0).speed, -0.4);
  assert.equal(gearedUp(0, 0).speed, 0.2); // ...but the crank turns slower than before
});

test('a jammed group stays jammed, not stalled', () => {
  const at = spin(['GGK', 'G..']);
  assert.equal(at(2, 0).jammed, true);
});

test('a load lying on the ground gives no push: letting out, the crank just turns at its own speed', () => {
  assert.equal(spin(['Qg'])(1, 0).speed, -1); // not −2.5: a weight on the floor can't help
  assert.equal(spin(['Qg'])(1, 0).stalled, false);
});

test('a load lying on the ground still has to be lifted: too heavy, and it stalls', () => {
  const at = spin(['Rg']);
  assert.equal(at(1, 0).speed, 0);
  assert.equal(at(1, 0).stalled, true);
  assert.equal(spin(['RgR'])(1, 0).speed, 0.25); // two cranks: 4 > 3, up it goes
});

test('a counterweight lying on the ground is no help at all', () => {
  // The crank lifts K (3). Through the two big gears, g would help if it could go down. It can't.
  const at = spin(['RKGGg']);
  assert.equal(at(1, 0).speed, 0);
  assert.equal(at(1, 0).stalled, true);
});

test('with no crank at all, a load on the ground just sits there (not stalled)', () => {
  const at = spin(['sg']);
  assert.equal(at(1, 0).speed, 0);
  assert.equal(at(1, 0).stalled, false);
});

test('a hanging load never pulls its winch round faster than the load could fall', () => {
  assert.equal(spin(['Qf'])(1, 0).speed, -4); // not (−2 − 8) ÷ 2 = −5
});

test('a load can be harder to lift than it is heavy coming down: `lifting` only counts while it goes up', () => {
  // Lifting: strength 2 against 1.5 leaves a quarter of the crank's speed.
  assert.equal(spin(['RS'])(1, 0).speed, 0.25);
  // Coming down it helps with 0.5 only: (−2 − 0.5) ÷ 2.
  assert.equal(spin(['QS'])(1, 0).speed, -1.25);
  // Too hard to lift: it stalls, and the load does not come down by itself.
  const stuck = spin(['RU']);
  assert.equal(stuck(1, 0).speed, 0);
  assert.equal(stuck(1, 0).stalled, true);
  // With no crank at all it just hangs (the catch holds it).
  assert.equal(spin(['HS'])(1, 0).speed, 0);
});

test('gearing up doesn\'t let a falling load whirl the crank: the winch still stops at falling speed', () => {
  const at = spin(['RGsf']); // the winch turns twice as fast as the crank, the other way
  assert.equal(at(3, 0).speed, -4);
  assert.equal(at(0, 0).speed, 2); // not 9
});

test('a source faster than falling keeps its own speed: the load just can\'t keep up, so it doesn\'t push', () => {
  assert.equal(spin(['Zf'])(1, 0).speed, -6);
});

test('the winch\'s catch holds a hanging load when two cranks cancel each other out', () => {
  // ↻ and ↺ cranks push the same: no push is left over. The load must not run them backwards.
  const light = spin(['RkQ']);
  assert.equal(light(1, 0).speed, 0); // was −0.25: the load sank
  assert.equal(light(0, 0).speed, 0);
  assert.equal(light(1, 0).stalled, true); // they're trying, and can't lift it
  assert.equal(spin(['RKQ'])(1, 0).speed, 0);
  // A lighter load must never win where a heavier one is held.
  assert.equal(spin(['RK'])(1, 0).speed, 0);
});

test('with nothing turning it at all, the catch holds any load (and nothing is "too heavy")', () => {
  const at = spin(['sK']);
  assert.equal(at(1, 0).speed, 0);
  assert.equal(at(1, 0).stalled, false);
  const withDynamo = spin(['KD']); // a hanging weight can't run a generator by itself
  assert.equal(withDynamo(1, 0).speed, 0);
});

test('a whisper of a push is not enough to let a winch\'s catch go: only a push that would turn the gears fast enough to see', () => {
  // A linked block on the load's shaft pushes the let-out way (↺) with 0.0001: like a stray trickle of
  // current in a motor. With nothing on the rope it would turn at 0.00005: nobody could see that.
  const whisper = spin(['KN'], { links: { '1,0': { still: -0.0001, perTurn: { '1,0': 2 } } } });
  assert.equal(whisper(0, 0).speed, 0); // was −1.5: the load ran the gears
  // The same whisper the lift way: it can't lift, and the load still hangs.
  assert.equal(spin(['KN'], { links: { '1,0': { still: 0.0001, perTurn: { '1,0': 2 } } } })(0, 0).speed, 0);
  // A real push the let-out way: the catch lets go and the load helps. (−0.5 − 3) ÷ 2
  const real = spin(['KN'], { links: { '1,0': { still: -0.5, perTurn: { '1,0': 2 } } } });
  assert.ok(Math.abs(real(0, 0).speed + 1.75) < 1e-9, `turns ${real(0, 0).speed}`);
  // And a crank turning the let-out way still brings it down, with the load helping: (−2 − 3) ÷ 2.
  assert.ok(Math.abs(spin(['QK'])(1, 0).speed + 2.5) < 1e-9);
  // A counterweight on the same gears still helps a crank that could not lift the load alone
  // (the crank's push is real, even though it is too weak by itself): 2 − 3 + 3 = 2, ÷ 2.
  const counter = spin(['RKGGK']);
  assert.ok(Math.abs(counter(0, 0).speed - 1) < 1e-9, `turns ${counter(0, 0).speed}`);
});

test('two winches that could each let its load down only while the other is held: both catches stay on, whichever comes first', () => {
  // Each load's shaft is pushed the let-out way (↺) by 0.5. But each one's turning pushes the OTHER
  // the lift way. If one load ran (helped by its weight) it would push the other back up, and the
  // other way round: two answers, and no reason to pick one. So neither load may help. Both come
  // down only as fast as the 0.5 turns them:  2a + b = −0.5 and a + 2b = −0.5  →  a = b = −1/6.
  const links = { '1,0': { still: -0.5, perTurn: { '1,0': 2, '1,2': 1 } }, '1,2': { still: -0.5, perTurn: { '1,0': 1, '1,2': 2 } } };
  const catches = spinWork.catches;
  const sweeps = spinWork.sweeps;
  const at = spin(['KN', '..', 'KN'], { links });
  assert.ok(Math.abs(at(0, 0).speed + 1 / 6) < 1e-9, `the first turns ${at(0, 0).speed}`);
  assert.ok(Math.abs(at(0, 2).speed + 1 / 6) < 1e-9, `the second turns ${at(0, 2).speed}`); // was 0 beside −1.83, for whichever came second
  assert.equal(spinWork.catches - catches, 2); // both let go, both were put back on
  assert.equal(spinWork.sweeps, sweeps); // and no plain rounds were needed
  // Not the same weight: now there IS one answer where every load that runs is really pushed its
  // way. The heavy one comes down and winds the light one UP, wherever each one stands.
  for (const rows of [['KN', '..', 'kN'], ['kN', '..', 'KN']]) {
    const heavyRow = rows[0][0] === 'K' ? 0 : 2;
    const mixed = spin(rows, { links });
    const heavy = mixed(0, heavyRow).speed;
    const lightOne = mixed(0, 2 - heavyRow).speed;
    // 2h + l = −0.5 − 3 and h + 2l = −0.5 − 1  →  h = −11/6, l = 1/6.
    assert.ok(Math.abs(heavy + 11 / 6) < 1e-9 && Math.abs(lightOne - 1 / 6) < 1e-9, `${rows}: heavy ${heavy}, light ${lightOne}`);
  }
});

/**
 * Which way the axle at x, y faces in a picture.
 * @param {string[]} rows - the picture
 * @param {number} x - the axle's column
 * @param {number} y - the axle's row
 * @returns {'h'|'v'} the way it faces
 */
function axisAt(rows, x, y) {
  const world = createWorld(rows[0].length, rows.length);
  rows.forEach((row, yy) => [...row].forEach((letter, xx) => setBlock(world, xx, yy, LETTERS[letter])));
  return spinAxis(world, x, y, blockInfo);
}

test('a gear put beside the end of an upright shaft doesn\'t swing the axle round and cut the shaft', () => {
  const plain = spin(['.-.', '.-.', '.R.']);
  assert.equal(plain(1, 0).speed, 1);
  for (const rows of [['.-s', '.-.', '.R.'], ['s-.', '.-.', '.R.'], ['.R.', '.-.', '.-s'], ['.R.', '.-.', 's-.']]) {
    const end = rows[0].includes('-') ? 0 : 2;
    const at = spin(rows);
    assert.equal(at(1, end).axis, 'v', rows.join('/'));
    assert.equal(at(1, end).speed, 1, rows.join('/')); // the shaft still turns, all the way along
    assert.equal(at(rows[end].indexOf('s'), end).speed, 0, rows.join('/')); // a gear beside a shaft doesn't mesh with it
  }
});

test('a gear above or below the end of a sideways shaft doesn\'t swing it either', () => {
  for (const rows of [['R--', '..s'], ['R--', 's..'], ['..s', 'R--'], ['--R', 's..']]) {
    const y = rows[0].includes('-') ? 0 : 1;
    const x = rows[y].indexOf('s') >= 0 ? rows[y].indexOf('s') : rows[1 - y].indexOf('s');
    assert.equal(axisAt(rows, x, y), 'h', rows.join('/'));
    assert.equal(spin(rows)(x, y).speed, 1, rows.join('/'));
  }
});

test('an axle between one gear beside it and one gear above still picks sideways (the same rule as pipes)', () => {
  assert.equal(axisAt(['.s.', '.-s'], 1, 1), 'h');
  assert.equal(axisAt(['.s.', 's-.'], 1, 1), 'h');
});

test('an axle follows a crank (a shaft) rather than a gear beside it', () => {
  assert.equal(axisAt(['.-s', '.R.'], 1, 0), 'v');
  assert.equal(axisAt(['R-.', '.s.'], 1, 0), 'h');
});

test('an axle doesn\'t turn toward an axle that can\'t point back at it', () => {
  // The right-hand column is an upright shaft of its own (gear, axle, gear). The
  // axle at the top of the left shaft must stay upright, not reach for it.
  const rows = ['..s', '.--', '.-s', '.R.'];
  assert.equal(axisAt(rows, 1, 1), 'v');
  assert.equal(spin(rows)(1, 1).speed, 1);
});

test('a winch, generator, crank or loose axle beside the end of a shaft doesn\'t swing the end round and cut the shaft', () => {
  // H stands for any hub (a winch, generator, motor, stopped crank, water wheel).
  for (const side of ['H', '-']) {
    const upright = [['.-x', '.-.', '.R.'], ['x-.', '.-.', '.R.'], ['.R.', '.-.', '.-x'], ['.R.', '.-.', 'x-.']];
    for (const picture of upright) {
      const rows = picture.map((row) => row.replace('x', side));
      const end = picture[0].includes('x') ? 0 : 2;
      const at = spin(rows);
      assert.equal(at(1, end).axis, 'v', rows.join('/'));
      assert.equal(at(1, end).speed, 1, rows.join('/')); // the shaft still turns, all the way along
      assert.equal(at(picture[end].indexOf('x'), end).speed, 0, rows.join('/')); // the block beside it isn't joined
    }
    const sideways = [['R--', '..x'], ['--R', 'x..'], ['..x', 'R--'], ['x..', '--R']];
    for (const picture of sideways) {
      const rows = picture.map((row) => row.replace('x', side));
      const y = picture[0].includes('-') ? 0 : 1;
      const x = picture[1 - y].indexOf('x');
      const at = spin(rows);
      assert.equal(at(x, y).axis, 'h', rows.join('/'));
      assert.equal(at(x, y).speed, 1, rows.join('/'));
      assert.equal(at(x, 1 - y).speed, 0, rows.join('/'));
    }
  }
});

test('a block that can\'t turn one way is a hard stop for its whole group, that way only', () => {
  const at = spin(['RsT']); // no two gears touch here, so all three share a shaft and turn ↻
  for (const x of [0, 1, 2]) {
    assert.equal(at(x, 0).speed, 0);
    assert.equal(at(x, 0).blocked, true);
    assert.equal(at(x, 0).stalled, false);
    assert.equal(at(x, 0).stopper, x === 2); // only the block doing the stopping
  }
  const free = spin(['QsT']); // the other way: nothing stops it
  assert.equal(free(2, 0).speed, -1);
  assert.equal(free(2, 0).blocked, false);
  assert.equal(free(2, 0).stopper, false);
});

test('the stop follows the gears: it counts the way the stopped block itself would turn', () => {
  assert.equal(spin(['RssT'])(3, 0).speed, -1);     // one mesh turns it ↺: free
  assert.equal(spin(['QssT'])(0, 0).blocked, true); // a ↺ crank turns it ↻: stopped
  assert.equal(spin(['QssT'])(0, 0).speed, 0);
});

test('with nothing driving, nothing is being stopped', () => {
  const at = spin(['sT']);
  assert.equal(at(1, 0).blocked, false);
  assert.equal(at(1, 0).stopper, false);
});

// =============================================================
// Links: blocks whose push depends on how fast OTHER blocks turn
// (motors and generators), and groups that are settled together.
// =============================================================

test('a linked block on one group: speed = (the sources\' push + its push standing still) ÷ (their fading + its own push-back)', () => {
  // Crank: pushes 2 standing still, fading 2 for each turn a second.
  assert.equal(spin(['RN'], { links: { '1,0': { perTurn: { '1,0': 2 } } } })(0, 0).speed, 0.5);          // 2 ÷ (2 + 2)
  assert.equal(spin(['RN'], { links: { '1,0': { still: 1, perTurn: { '1,0': 1 } } } })(0, 0).speed, 1);  // (2 + 1) ÷ (2 + 1)
  assert.equal(spin(['RN'], { links: { '1,0': { still: -4, perTurn: { '1,0': 2 } } } })(0, 0).speed, -0.5); // it can drive, too
  // All by itself (like a battery's motor): still ÷ its own push-back. And it counts as driven.
  const alone = spin(['sN'], { links: { '1,0': { still: 3, perTurn: { '1,0': 2 } } } });
  assert.equal(alone(0, 0).speed, 1.5);
  assert.equal(alone(0, 0).driven, true);
  // Geared up ×2 (the other way round): its push counts double, its push-back four times.
  const geared = spin(['RGsN'], { links: { '3,0': { perTurn: { '3,0': 1 } } } });
  assert.equal(geared(0, 0).speed, 2 / (2 + 4));
  // A link with nothing in it changes nothing.
  assert.equal(spin(['RN'])(0, 0).speed, 1);
});

/**
 * Solve a small set of straight-line equations the slow, sure way (Cramer's rule is too slow: plain elimination).
 * @param {number[][]} grid - the left-hand side
 * @param {number[]} sums - the right-hand side
 * @returns {number[]} the answer
 */
function solveGrid(grid, sums) {
  const n = sums.length;
  const rows = grid.map((row, k) => [...row, sums[k]]);
  for (let col = 0; col < n; col++) {
    let best = col;
    for (let row = col + 1; row < n; row++) if (Math.abs(rows[row][col]) > Math.abs(rows[best][col])) best = row;
    [rows[col], rows[best]] = [rows[best], rows[col]];
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = rows[row][col] / rows[col][col];
      for (let k = col; k <= n; k++) rows[row][k] -= factor * rows[col][k];
    }
  }
  return rows.map((row, k) => row[n] / row[k]);
}

test('two, three and four groups that lean on each other settle together: exactly where a direct solve puts them, in two goes', () => {
  // Each group is a crank (R or Q) with a linked block beside it, on its own row.
  for (const cranks of ['RR', 'RQ', 'RQR', 'QQR', 'RQRR', 'RRQQ']) {
    const n = cranks.length;
    // A made-up link that keeps its promise: lean = a grid times itself turned over
    // (the same both ways round, and never helping), and it leans HARD.
    const half = Array.from({ length: n }, (unused, i) => Array.from({ length: n }, (unused2, j) => Math.sin(1 + 3 * i + 5 * j + n) * 3));
    const lean = half.map((row, i) => half.map((unused, j) => half.reduce((sum, line) => sum + line[i] * line[j], 0)));
    const still = Array.from({ length: n }, (unused, i) => Math.cos(i * 2 + n));
    const links = {};
    for (let i = 0; i < n; i++) links[`1,${2 * i}`] = { still: still[i], perTurn: Object.fromEntries(lean[i].map((amount, j) => [`1,${2 * j}`, amount])) };
    const rows = [...cranks].flatMap((crank) => [`${crank}N`, '..']);
    const passes = spinWork.passes;
    const sweeps = spinWork.sweeps;
    const at = spin(rows, { links });
    assert.ok(spinWork.passes - passes <= 3, `${cranks}: took ${spinWork.passes - passes} goes`);
    assert.equal(spinWork.sweeps, sweeps);
    // (crank's fading 2 + lean) × speeds = the cranks' pushes (±2) + still
    const want = solveGrid(lean.map((row, i) => row.map((amount, j) => amount + (i === j ? 2 : 0))), still.map((amount, i) => amount + (cranks[i] === 'R' ? 2 : -2)));
    for (let i = 0; i < n; i++) assert.ok(Math.abs(at(0, 2 * i).speed - want[i]) < 1e-9, `${cranks}: group ${i} turns ${at(0, 2 * i).speed}, should turn ${want[i]}`);
  }
});

test('a group with only a linked block is turned by the group it is linked to (like a generator feeding a motor), and counts as driven', () => {
  // lean: 1 between them (the same both ways), 1 each on itself.
  const links = { '1,0': { perTurn: { '1,0': 1, '1,2': -1 } }, '1,2': { perTurn: { '1,0': -1, '1,2': 1 } } };
  const at = spin(['RN', '..', 'sN'], { links });
  // 2 − 2a − a + b = 0 and a − b = 0: the second group has nothing to push against, so it keeps up.
  assert.ok(Math.abs(at(0, 0).speed - 1) < 1e-9 && Math.abs(at(0, 2).speed - 1) < 1e-9, `${at(0, 0).speed}, ${at(0, 2).speed}`);
  assert.equal(at(0, 2).driven, true);
  // With no crank anywhere, nothing starts, and nothing counts as driven.
  const dead = spin(['sN', '..', 'sN'], { links });
  assert.equal(dead(0, 0).speed, 0);
  assert.equal(dead(0, 2).speed, 0);
  assert.equal(dead(0, 2).driven, false);
});

test('in a cluster, a group with a load too heavy for it stalls, and the others are balanced around it standing still', () => {
  const links = { '1,0': { perTurn: { '1,0': 1, '1,2': -1 } }, '1,2': { perTurn: { '1,0': -1, '1,2': 1 } } };
  // The second group is pushed ↻ by the first, against a load of 3 it cannot lift.
  const at = spin(['RN.', '...', 'KN.'], { links });
  assert.equal(at(1, 2).speed, 0);
  assert.equal(at(1, 2).stalled, true);
  // The first group feels only its own push-back: 2 ÷ (2 + 1).
  assert.ok(Math.abs(at(0, 0).speed - 2 / 3) < 1e-9, `turns ${at(0, 0).speed}`);
  assert.equal(at(0, 0).stalled, false);
  // Turned the other way, the second group is pushed the let-out way, and its load helps:
  // −2 − 3a + b = 0 and a − b − 3 = 0.
  const down = spin(['QN.', '...', 'KN.'], { links });
  assert.ok(Math.abs(down(0, 0).speed + 2.5) < 1e-9 && Math.abs(down(1, 2).speed + 5.5) < 1e-9, `${down(0, 0).speed}, ${down(1, 2).speed}`);
  assert.equal(down(1, 2).stalled, false);
});

test('in a cluster, a hard stop, a jam and a load on the ground each hold their own group, and the rest still balance', () => {
  const links = { '1,0': { perTurn: { '1,0': 1, '1,2': -1 } }, '1,2': { perTurn: { '1,0': -1, '1,2': 1 } } };
  // A hard stop ↻ on the second group: it would be turned ↻, so it is blocked.
  const stopped = spin(['RN', '..', 'TN'], { links });
  assert.equal(stopped(1, 2).speed, 0);
  assert.equal(stopped(1, 2).blocked, true);
  assert.equal(stopped(0, 2).stopper, true);
  assert.ok(Math.abs(stopped(0, 0).speed - 2 / 3) < 1e-9);
  assert.equal(stopped(0, 0).blocked, false);
  // Turned the other way it is free again.
  const free = spin(['QN', '..', 'TN'], { links });
  assert.ok(Math.abs(free(1, 2).speed + 1) < 1e-9, `turns ${free(1, 2).speed}`);
  // A jammed second group (three big gears in an L, the linked block on their shaft).
  const jammedLinks = { '1,0': { perTurn: { '1,0': 1, '1,3': -1 } }, '1,3': { perTurn: { '1,0': -1, '1,3': 1 } } };
  const jam = spin(['RN.', '...', 'GG.', 'GN.'], { links: jammedLinks });
  assert.equal(jam(1, 3).jammed, true);
  assert.equal(jam(1, 3).speed, 0);
  assert.ok(Math.abs(jam(0, 0).speed - 2 / 3) < 1e-9, `turns ${jam(0, 0).speed}`);
  // A heavy load lying on the ground under the second group: it can't be lifted, so that group stays put.
  const resting = spin(['RN', '..', 'gN'], { links });
  assert.equal(resting(1, 2).speed, 0);
  assert.ok(Math.abs(resting(0, 0).speed - 2 / 3) < 1e-9);
});

test('a link that breaks its promise can never make the sums blow up: groups that will not settle are held still, and whatever turns is balanced', () => {
  // This made-up link breaks the promise: each crank's turning pushes the
  // OTHER crank against its own way, three times harder than the link
  // rubs. The sums then have no answer at all:
  //   ↻ crank:  2 − 2a − a − 3b = 0   →  a + b = 2/3
  //   ↺ crank: −2 − 2b − b − 3a = 0   →  a + b = −2/3
  const links = { '1,0': { perTurn: { '1,0': 1, '1,3': 3 } }, '1,3': { perTurn: { '1,0': 3, '1,3': 1 } } };
  const holds = spinWork.holds;
  const at = spin(['HN', 'R.', '..', 'HN', 'Q.'], { links });
  assert.ok(spinWork.holds > holds, 'something had to be held still');
  const a = at(0, 0).speed;
  const b = at(0, 3).speed;
  assert.ok(Number.isFinite(a) && Number.isFinite(b), `${a}, ${b}`);
  // Each group either stands still or has its pushes balanced at the speeds reported.
  assert.ok(a === 0 || Math.abs(2 - 3 * a - 3 * b) < 1e-9, `the ↻ crank's group turns ${a} unbalanced`);
  assert.ok(b === 0 || Math.abs(-2 - 3 * b - 3 * a) < 1e-9, `the ↺ crank's group turns ${b} unbalanced`);
  assert.ok(a === 0 || b === 0);
  assert.ok(at(0, 0).stalled || at(0, 3).stalled, 'a group that was held shows as stalled');
  // A link that HELPS its own turning (the more it turns, the more it is pushed): held still, not sent to infinity.
  const helped = spin(['RN'], { links: { '1,0': { perTurn: { '1,0': -5 } } } });
  assert.equal(helped(0, 0).speed, 0);
});

test('a source that turns either way follows a push that is there standing still, and keeps its own way when only linked turning pushes on it', () => {
  // By itself: ↻, at full speed.
  assert.equal(spin(['e'])(0, 0).speed, 1);
  // A link's push standing still (a battery's current in a motor on its shaft) points it ↺.
  const pointed = spin(['eN'], { links: { '1,0': { still: -1, perTurn: { '1,0': 1 } } } });
  assert.ok(Math.abs(pointed(0, 0).speed + 1) < 1e-9, `turns ${pointed(0, 0).speed}`); // (−2 − 1) ÷ (2 + 1)
  // Linked to a strong ↺ crank's group so that the crank's turning pushes it ↺: that push comes
  // from turning, so it gets no say. The source stays ↻ and is only slowed.
  const links = { '1,0': { perTurn: { '1,0': 1, '1,2': -1 } }, '1,2': { perTurn: { '1,0': -1, '1,2': 1 } } };
  const kept = spin(['eN', '..', 'YN'], { links });
  assert.ok(Math.abs(kept(0, 0).speed - 0.4) < 1e-9 && Math.abs(kept(0, 2).speed + 0.8) < 1e-9, `${kept(0, 0).speed}, ${kept(0, 2).speed}`);
  // It was turning ↺ on the last tick: it keeps going that way.
  const going = spin(['eN', '..', 'YN'], { links, before: { '0,0': -0.5 } });
  assert.ok(going(0, 0).speed < -0.5, `turns ${going(0, 0).speed}`);
});

test('a group too slow to see stands still, and its neighbors are balanced around it standing still', () => {
  // The second group would creep at 0.0005: under MIN_SPEED. It is held, so the first feels no push from it.
  const links = { '1,0': { perTurn: { '1,0': 1, '1,2': -0.001 } }, '1,2': { perTurn: { '1,0': -0.001, '1,2': 1 } } };
  const at = spin(['RN', '..', 'DN'], { links });
  assert.equal(at(1, 2).speed, 0);
  assert.equal(at(1, 2).stalled, false);
  assert.equal(at(0, 0).speed, 2 / 3);
});
