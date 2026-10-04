/**
 * lift.test.js — checks the rope rules: following a rope from a winch
 * (over pulleys), finding what hangs on it and how heavy it is, winding
 * it in and letting it out, and which blocks the rope holds up.
 * Each test draws a little world as a picture of letters (one column
 * here is usually enough: the winch on top, the rope hanging down).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, getBlock, getFluid, setBlock, setFluid } from '../js/world.js';
import { canLower, canWindIn, hangingLoads, isHeld, letOut, loadBelow, ropeArms, traceRope, windIn } from '../js/lift.js';

/** Stand-in blocks, with the same lifting settings as js/blocks/lifting.js. */
const TEST_BLOCKS = {
  winch: { spin: { kind: 'hub' }, winch: true },
  rope: { rope: true, fluid: { sides: 'all' } },
  pulley: { rope: true, pulley: true },
  pulleyHook: { falls: true, weight: 0, hook: true },
  crate: { falls: true, weight: 1 },
  ironWeight: { falls: true, weight: 4 },
  sand: { falls: true },
  stone: {},
};

/**
 * Look up a stand-in block.
 * @param {string} name - a block name
 * @returns {object|undefined} its settings (undefined for air)
 */
const blockInfo = (name) => TEST_BLOCKS[name];

/**
 * Just the column and row of a rope cell (traceRope also says which way the rope went).
 * @param {{x: number, y: number}} cell - a cell
 * @returns {{x: number, y: number}} its column and row
 */
const where = (cell) => ({ x: cell.x, y: cell.y });

/** What each letter means. */
const LETTERS = {
  '.': 'air', w: 'winch', '|': 'rope', P: 'pulley', h: 'pulleyHook', c: 'crate', I: 'ironWeight', s: 'sand', '#': 'stone',
};

/**
 * Build a world from a picture.
 * @param {string[]} rows - the picture, top row first
 * @returns {object} the world
 */
function make(rows) {
  const world = createWorld(rows[0].length, rows.length);
  rows.forEach((row, y) => [...row].forEach((letter, x) => setBlock(world, x, y, LETTERS[letter])));
  return world;
}

/**
 * Turn a world back into a picture, to compare with what we expect.
 * @param {object} world - the world
 * @returns {string[]} the picture
 */
function picture(world) {
  const letterOf = Object.fromEntries(Object.entries(LETTERS).map(([letter, name]) => [name, letter]));
  const rows = [];
  for (let y = 0; y < world.height; y++) {
    let row = '';
    for (let x = 0; x < world.width; x++) row += letterOf[getBlock(world, x, y)];
    rows.push(row);
  }
  return rows;
}

test('a rope is followed down from the winch to its end, and the crate under it is the load', () => {
  const world = make(['w', '|', '|', 'c', '#']);
  const rope = traceRope(world, 0, 0, blockInfo);
  assert.equal(rope.path.length, 2);
  assert.deepEqual(where(rope.end), { x: 0, y: 2 });
  assert.equal(rope.hanging, true);
  const load = loadBelow(world, rope, blockInfo);
  assert.deepEqual(load.cells, [{ x: 0, y: 3 }]);
  assert.equal(load.weight, 1);
  assert.equal(load.hook, false);
});

test('a rope runs over a pulley: the end is the rope hanging down from it', () => {
  const world = make(['P|w', '|..', 'c..', '#..']);
  const rope = traceRope(world, 2, 0, blockInfo);
  assert.deepEqual(where(rope.end), { x: 0, y: 1 });
  assert.equal(loadBelow(world, rope, blockInfo).weight, 1);
});

test('rope only turns at a pulley: it never wanders into the rope next to it', () => {
  // The up-rope and the down-rope of a well side by side: the trace goes up,
  // over the two pulleys, and down the other side (not across at the bottom).
  const well = make(['.PP.', '.||.', '.||.', '.|c.', '.w..']);
  const rope = traceRope(well, 1, 4, blockInfo);
  assert.deepEqual(where(rope.end), { x: 2, y: 2 });
  assert.equal(rope.hanging, true);
  // Two cranes side by side: each winch follows its own rope.
  const cranes = make(['w..w', '|..|', '||||', 'c..c', '####']);
  assert.deepEqual(where(traceRope(cranes, 0, 0, blockInfo).end), { x: 0, y: 2 });
  assert.deepEqual(where(traceRope(cranes, 3, 0, blockInfo).end), { x: 3, y: 2 });
});

test('a pulley beside the rope doesn\'t stop it lifting', () => {
  const world = make(['w.', '|.', '|P', 'c.', '#.']);
  assert.equal(windIn(world, 0, 0, blockInfo), true);
});

test('rope going sideways out of a winch doesn\'t hang, so it holds and lifts nothing', () => {
  const world = make(['w||', '..c', '...']);
  const rope = traceRope(world, 0, 0, blockInfo);
  assert.equal(rope.hanging, false);
  assert.equal(loadBelow(world, rope, blockInfo).cells.length, 0);
  assert.equal(isHeld(world, 2, 1, blockInfo), false);
});

test('a winch with no rope next to it has no rope end', () => {
  assert.equal(traceRope(make(['w', '.', 'c']), 0, 0, blockInfo).end, null);
});

test('loads weigh what their blocks weigh, and a pulley hook halves it', () => {
  const weigh = (rows) => {
    const world = make(rows);
    return loadBelow(world, traceRope(world, 0, 0, blockInfo), blockInfo);
  };
  assert.equal(weigh(['w', '|', 'I', '#']).weight, 4);
  assert.equal(weigh(['w', '|', 's', '#']).weight, 1); // sand counts 1
  // Only the block on the hook hangs: what it's resting on isn't lifted too.
  assert.equal(weigh(['w', '|', 'c', 's', '#']).weight, 1);
  assert.equal(weigh(['w', '|', 'h', 'I', 'c', '#']).cells.length, 2);
  const hooked = weigh(['w', '|', 'h', 'I', '#']);
  assert.equal(hooked.weight, 2);
  assert.equal(hooked.hook, true);
  assert.equal(weigh(['w', '|', '.', 'c']).cells.length, 0); // not touching: not hanging
});

test('the last bit of rope under the winch or a pulley can\'t be wound in', () => {
  const short = make(['w', '|', 'c']);
  assert.equal(canWindIn(short, traceRope(short, 0, 0, blockInfo), blockInfo), false);
  const long = make(['w', '|', '|', 'c']);
  assert.equal(canWindIn(long, traceRope(long, 0, 0, blockInfo), blockInfo), true);
  const overPulley = make(['P|w', '|..', 'c..']);
  assert.equal(canWindIn(overPulley, traceRope(overPulley, 2, 0, blockInfo), blockInfo), false);
});

test('winding in lifts the load one cell and takes away the end of the rope', () => {
  const world = make(['w', '|', '|', 'h', 'I', 'c', '#']);
  assert.equal(windIn(world, 0, 0, blockInfo), true);
  assert.deepEqual(picture(world), ['w', '|', 'h', 'I', '.', 'c', '#']); // the crate it sat on stays
});

test('winding in never loses water (a well rope hanging in water)', () => {
  const world = make(['w', '|', '|', 'c', '#']);
  setFluid(world, 'water', 0, 2, 0.5);
  windIn(world, 0, 0, blockInfo);
  const total = [0, 1, 2, 3].reduce((sum, y) => sum + getFluid(world, 'water', 0, y), 0);
  assert.equal(total, 0.5);
});

test('letting out lowers the load and adds rope, until it rests on something', () => {
  const world = make(['w', '|', 'c', '.', '#']);
  assert.equal(letOut(world, 0, 0, blockInfo), true);
  assert.deepEqual(picture(world), ['w', '|', '|', 'c', '#']);
  assert.equal(letOut(world, 0, 0, blockInfo), false); // on the ground
});

test('letting out an empty rope lets it down until it touches something', () => {
  const world = make(['w', '|', '.', '#']);
  assert.equal(letOut(world, 0, 0, blockInfo), true);
  assert.deepEqual(picture(world), ['w', '|', '|', '#']);
});

test('a load wound all the way up can be let down again', () => {
  const world = make(['w', '|', '|', '|', 'c', '#']);
  let wound = 0;
  for (let i = 0; i < 5; i++) if (windIn(world, 0, 0, blockInfo)) wound += 1;
  assert.equal(wound, 2);
  assert.deepEqual(picture(world), ['w', '|', 'c', '.', '.', '#']);
  assert.equal(letOut(world, 0, 0, blockInfo), true);
});

test('a rope holds up what hangs on it, but not what sits beside or under it', () => {
  const world = make(['w.', '|.', 'cc', 's.', '..']);
  assert.equal(isHeld(world, 0, 2, blockInfo), true);
  assert.equal(isHeld(world, 0, 3, blockInfo), false); // sand under the crate isn't tied on
  assert.equal(isHeld(world, 1, 2, blockInfo), false);
  assert.equal(isHeld(make(['#', 'c', '.']), 0, 1, blockInfo), false);
  assert.deepEqual([...hangingLoads(world, blockInfo)], [2 * 2 + 0]);
});

test('a rope cut in the middle, or with no winch, holds nothing', () => {
  assert.equal(isHeld(make(['w', '|', '.', '|', 'c', '.']), 0, 4, blockInfo), false);
  assert.equal(isHeld(make(['.', '|', '|', 'c', '.']), 0, 3, blockInfo), false);
  assert.equal(isHeld(make(['P', '|', 'c', '.']), 0, 2, blockInfo), false); // over a pulley, but nobody holds the other end
});

test('rope arms follow the rope: to the winch above and the load below, round pulleys', () => {
  const world = make(['w', '|', 'c']);
  const arms = ropeArms(world, blockInfo);
  assert.deepEqual(arms.get(1), { up: true, right: false, down: true, left: false });
  const turn = make(['P|w', '|..']);
  assert.deepEqual(ropeArms(turn, blockInfo).get(0), { up: false, right: true, down: true, left: false });
  // Two cranes' ropes side by side aren't drawn joined.
  const cranes = make(['w..w', '|..|', '||||']);
  assert.deepEqual(ropeArms(cranes, blockInfo).get(2 * 4 + 0), { up: true, right: false, down: false, left: false });
});

test('a load with air under it can go down; one sitting on something (or on the floor of the world) is resting', () => {
  /**
   * Can the load on this picture's rope go down?
   * @param {string[]} rows - the picture
   * @returns {boolean} true if it can
   */
  const lowers = (rows) => {
    const world = make(rows);
    const rope = traceRope(world, 0, 0, blockInfo);
    return canLower(world, rope, loadBelow(world, rope, blockInfo));
  };
  assert.equal(lowers(['w', '|', 'c', '.', '#']), true);
  assert.equal(lowers(['w', '|', 'c', '#']), false);
  assert.equal(lowers(['w', '|', 'c']), false); // the bottom of the world
  assert.equal(lowers(['w', '|', 'h', 'c', '#']), false); // a hook and its crate, on the ground
});
