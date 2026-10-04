/**
 * spin.test.js — checks how gears, axles and spinning machines pass
 * their turning on: directions, speeds, axles, diagonals, jams and
 * sources. Each test draws a little world as a picture of letters.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, setBlock } from '../js/world.js';
import { solveSpin, spinAxis } from '../js/spin.js';

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
  // Like a generator: pushes back 2 for every turn per second.
  dynamo: { spin: { kind: 'hub' }, spinDrag: () => 2 },
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
  F: 'fastCrank', '#': 'stone', K: 'heavy', k: 'light', g: 'grounded', f: 'falling', Z: 'racer', Y: 'strongCCW', D: 'dynamo',
};

/**
 * Build a world from a picture and work out the spinning.
 * @param {string[]} rows - the picture
 * @returns {Function} (x, y) => that block's record
 */
function spin(rows) {
  const world = createWorld(rows[0].length, rows.length);
  rows.forEach((row, y) => [...row].forEach((letter, x) => setBlock(world, x, y, LETTERS[letter])));
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
