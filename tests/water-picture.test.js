/**
 * water-picture.test.js — checks that water LOOKS as tall as the amount
 * there really is (issue #20), and that DIG and pour act on one full
 * cell at the most.
 *
 * Real water doesn't squish: ten buckets poured into a tube stand ten
 * buckets tall. In the game deep water IS squished into fewer cells (the
 * solver needs that to push water up U-tubes), so waterPicture in
 * fluids.js works out how much to DRAW in each cell instead.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, setBlock, setFluid } from '../js/world.js';
import { FULL, MIN_AMOUNT, pour, scoop, stepFluids, waterPicture } from '../js/fluids.js';
import { applyTool } from '../js/build.js';

/** Stand-in blocks with the same fluid settings as the real ones. */
const TEST_BLOCKS = {
  stone: {},
  pipe: { fluid: { sides: 'auto-pipe' } },
  rope: { fluid: { sides: 'all' } },
  pumpUp: { fluid: { sides: ['up', 'down'], pump: 'up' } },
};

/**
 * Look up a stand-in block.
 * @param {string} name - a block name
 * @returns {object|undefined} its settings (undefined for air)
 */
const blockInfo = (name) => TEST_BLOCKS[name];

/** What each letter means. `~` is air full of water. */
const LETTERS = { '.': 'air', '~': 'air', '#': 'stone', P: 'pipe', R: 'rope', '^': 'pumpUp' };

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
 * Flip a picture left to right.
 * @param {string[]} rows - the picture
 * @returns {string[]} its mirror image
 */
const mirrored = (rows) => rows.map((row) => [...row].reverse().join(''));

/**
 * Let the water move for a while.
 * @param {object} world - the world
 * @param {number} ticks - how many ticks
 * @returns {void}
 */
function run(world, ticks) {
  for (let i = 0; i < ticks; i++) stepFluids(world, blockInfo);
}

/**
 * Add up a list of numbers.
 * @param {ArrayLike<number>} amounts - the numbers
 * @returns {number} their total
 */
const total = (amounts) => Array.from(amounts).reduce((sum, amount) => sum + amount, 0);

/**
 * How tall the water in one column of the world is DRAWN, in cells.
 * @param {object} world - the world
 * @param {Float64Array} shown - from waterPicture
 * @param {number} x - the column
 * @returns {number} the drawn height
 */
function drawnHeight(world, shown, x) {
  let height = 0;
  for (let y = 0; y < world.height; y++) height += shown[y * world.width + x];
  return height;
}

/**
 * A 1-wide shaft, 14 cells deep, with `cells` full cells of water at the bottom.
 * @param {number} cells - how much water
 * @returns {object} the world
 */
function shaft(cells) {
  const rows = [];
  for (let y = 0; y < 14; y++) rows.push(y >= 14 - cells ? '#~#' : '#.#');
  rows.push('###');
  return worldFrom(rows);
}

test('N cells of water in a 1-wide shaft look N cells tall, for 1 to 13 cells, at every moment', () => {
  for (let cells = 1; cells <= 13; cells++) {
    const world = shaft(cells);
    for (let tick = 0; tick < 400; tick++) {
      stepFluids(world, blockInfo);
      const { shown } = waterPicture(world, blockInfo);
      // While it settles, the picture never strays more than a tenth of a cell.
      assert.ok(Math.abs(total(shown) - cells) < 0.1, `${cells} cells, tick ${tick}: drawn ${total(shown)}`);
    }
    const { shown } = waterPicture(world, blockInfo);
    assert.ok(Math.abs(total(world.fluid.water) - cells) < 1e-9, 'no water was made or lost');
    assert.ok(Math.abs(total(shown) - cells) < 0.01, `${cells} cells are drawn ${total(shown)} tall`);
    // The drawn water is one solid column from the floor up: full cells, with no gaps.
    for (let up = 0; up < cells; up++) {
      assert.ok(shown[(13 - up) * 3 + 1] > 0.99, `${cells} cells: the cell ${up} up from the floor is drawn full`);
    }
  }
});

test('the real water is still squished: the picture, not the solver, was changed', () => {
  const world = shaft(10);
  run(world, 400);
  const wet = Array.from(world.fluid.water).filter((amount) => amount >= MIN_AMOUNT).length;
  assert.equal(wet, 8); // ten cells' worth really sits in eight cells...
  assert.ok(Math.abs(total(waterPicture(world, blockInfo).shown) - 10) < 0.01); // ...and is drawn ten tall
});

test('pouring ten cells into a shaft, one tap at a time, shows 1, 2, 3 ... 10 cells', () => {
  const world = shaft(0);
  for (let taps = 1; taps <= 10; taps++) {
    assert.equal(pour(world, 'water', 1, 0, blockInfo), true);
    run(world, 40);
    assert.ok(Math.abs(total(waterPicture(world, blockInfo).shown) - taps) < 0.01, `after ${taps} taps`);
  }
});

test('shallow water with nothing squished is drawn just as it is', () => {
  const world = worldFrom([
    '#....#',
    '#....#',
    '#~~..#',
    '######',
  ]);
  run(world, 200);
  const { shown, source } = waterPicture(world, blockInfo);
  world.fluid.water.forEach((amount, index) => {
    assert.ok(Math.abs(shown[index] - amount) < 1e-9);
    assert.equal(source[index], -1);
  });
});

test('a wide tank with a deep end is drawn level, and as tall as its water', () => {
  const world = worldFrom([
    '#.....#',
    '#.....#',
    '#.....#',
    '#~~~~~#',
    '#~~~~~#',
    '#~~~~~#',
    '#~~####',
    '#~~####',
    '#~~####',
    '#~~####',
    '#~~####',
    '#######',
  ]);
  run(world, 600);
  const { shown } = waterPicture(world, blockInfo);
  assert.ok(Math.abs(total(shown) - 25) < 0.01, `drawn ${total(shown)}`);
  // Every column's surface is at the same height: 3 cells above the shallow floor.
  for (let x = 1; x <= 5; x++) {
    const depth = x <= 2 ? 8 : 3;
    assert.ok(Math.abs(drawnHeight(world, shown, x) - depth) < 0.01, `column ${x} is drawn ${drawnHeight(world, shown, x)} deep`);
  }
});

test('a U-tube is drawn level in both arms, and as tall as its water, while it settles and after', () => {
  const world = worldFrom([
    '#.###.#',
    '#~###.#',
    '#~###.#',
    '#~###.#',
    '#~###.#',
    '#~###.#',
    '#~###.#',
    '#~~~~~#',
    '#######',
  ]);
  for (let tick = 0; tick < 400; tick++) {
    stepFluids(world, blockInfo);
    const { shown } = waterPicture(world, blockInfo);
    // While the water is still rushing round, the squished-in extra under
    // the lid has no level surface to be drawn on yet: a little may be
    // missing from the picture, but water is never drawn that isn't there.
    assert.ok(total(shown) < 11.1 && total(shown) > 10.4, `tick ${tick}: drawn ${total(shown)}`);
    if (tick >= 250) assert.ok(Math.abs(total(shown) - 11) < 0.01, `tick ${tick}: drawn ${total(shown)}`);
  }
  const { shown } = waterPicture(world, blockInfo);
  assert.ok(Math.abs(total(shown) - 11) < 0.01);
  assert.ok(Math.abs(drawnHeight(world, shown, 1) - 4) < 0.01, `left arm ${drawnHeight(world, shown, 1)}`);
  assert.ok(Math.abs(drawnHeight(world, shown, 5) - 4) < 0.01, `right arm ${drawnHeight(world, shown, 5)}`);
  // The water under the lid in the middle is drawn full, never more.
  for (let x = 2; x <= 4; x++) assert.equal(shown[7 * 7 + x], FULL);
});

test('a deep U-tube with a wide arm and a narrow arm is still drawn level', () => {
  const world = worldFrom([
    '#...#.#',
    '#~~~#.#',
    '#~~~#.#',
    '#~~~#.#',
    '#~~~#.#',
    '#~~~#.#',
    '#~~~#.#',
    '#~~~#.#',
    '#~~~#.#',
    '#~~~~~#',
    '#######',
  ]);
  run(world, 800);
  const { shown } = waterPicture(world, blockInfo);
  assert.ok(Math.abs(total(shown) - 29) < 0.01, `drawn ${total(shown)}`);
  const heights = [1, 2, 3, 5].map((x) => drawnHeight(world, shown, x));
  for (const height of heights) assert.ok(Math.abs(height - heights[0]) < 0.02, `arms ${heights}`);
});

test('water in a pipe beside a tower is drawn level with the tower, and the total is right', () => {
  const world = worldFrom([
    '#.#.P.',
    '#~#.P.',
    '#~#.P.',
    '#~#.P.',
    '#~#.P.',
    '#~#.P.',
    '#~#.P.',
    '#~#.P.',
    '#~#.P.',
    '#~PPP.',
    '######',
  ]);
  run(world, 800);
  const { shown } = waterPicture(world, blockInfo);
  assert.ok(Math.abs(total(shown) - 9) < 0.01, `drawn ${total(shown)}`);
  assert.ok(Math.abs(drawnHeight(world, shown, 1) - drawnHeight(world, shown, 4)) < 0.02,
    `tower ${drawnHeight(world, shown, 1)}, pipe ${drawnHeight(world, shown, 4)}`);
});

test('a sealed full tank is drawn full and no more: nothing is drawn outside it', () => {
  const world = worldFrom([
    '.......',
    '.#####.',
    '.#~~~#.',
    '.#~~~#.',
    '.#~~~#.',
    '.#####.',
  ]);
  // Squeeze in half as much again: the solver allows it, the picture can't show it.
  world.fluid.water.forEach((amount, index) => { if (amount > 0) world.fluid.water[index] = 1.5; });
  run(world, 100);
  const { shown } = waterPicture(world, blockInfo);
  assert.ok(Math.abs(total(world.fluid.water) - 13.5) < 1e-9);
  assert.ok(Math.abs(total(shown) - 9) < 1e-9, 'nine cells, drawn full');
  shown.forEach((amount, index) => {
    assert.ok(amount <= FULL);
    if (world.fluid.water[index] === 0) assert.equal(amount, 0);
  });
});

test('water is never drawn standing above the rim of its tank, or on top of a pipe end', () => {
  // A brim-full shaft with extra squeezed in, standing in the open.
  const world = worldFrom([
    '.....',
    '.....',
    '.#~#.',
    '.#~#.',
    '.#~#.',
    '.#~#.',
    '.#~#.',
    '#####',
  ]);
  [1, 1.1, 1.2, 1.3, 1.4].forEach((amount, down) => setFluid(world, 'water', 2, 2 + down, amount));
  const { shown } = waterPicture(world, blockInfo);
  assert.equal(shown[1 * 5 + 2], 0, 'no pillar of water above the rim');
  assert.equal(shown[0 * 5 + 2], 0);
  assert.ok(Math.abs(total(shown) - 5) < 1e-9);
});

test('extra is only drawn straight above real water of the same body: never over dry ground or in another tank', () => {
  const world = worldFrom([
    '#.#.#....',
    '#.#.#....',
    '#~#.#....',
    '#~#.#....',
    '#~#.#....',
    '#~#.#....',
    '#~#.#....',
    '#~#~#....',
    '#########',
  ]);
  run(world, 300);
  const { shown, source } = waterPicture(world, blockInfo);
  assert.ok(Math.abs(drawnHeight(world, shown, 1) - 6) < 0.01);
  assert.ok(Math.abs(drawnHeight(world, shown, 3) - 1) < 1e-9, 'the tank next door is not raised');
  for (let x = 5; x < 9; x++) assert.equal(drawnHeight(world, shown, x), 0);
  shown.forEach((amount, index) => {
    if (amount > 0 && world.fluid.water[index] < MIN_AMOUNT) {
      const top = source[index];
      assert.ok(top >= 0 && top % world.width === index % world.width && top > index, 'it sits straight above its real water');
      assert.ok(world.fluid.water[top] >= MIN_AMOUNT);
    }
  });
});

test('a tower emptying through a pipe onto the ground: its squished-in extra is drawn on the tower, not on the puddle', () => {
  const world = worldFrom([
    '#.#.......',
    '#~#.......',
    '#~#.......',
    '#~#.......',
    '#~#.......',
    '#~#.......',
    '#~#.......',
    '#~PP......',
    '##########',
  ]);
  for (let tick = 0; tick < 60; tick++) {
    stepFluids(world, blockInfo);
    const { shown } = waterPicture(world, blockInfo);
    // The tower is drawn as tall as its water (within half a cell while it rushes out)...
    let inTower = 0;
    for (let y = 0; y < 8; y++) inTower += world.fluid.water[y * 10 + 1];
    assert.ok(Math.abs(drawnHeight(world, shown, 1) - inTower) < 0.5, `tick ${tick}: tower drawn ${drawnHeight(world, shown, 1)}, holds ${inTower}`);
    // ...and the puddle just as it is.
    for (let x = 4; x < 10; x++) {
      const amount = world.fluid.water[7 * 10 + x];
      const real = amount >= MIN_AMOUNT ? Math.min(1, amount) : 0;
      assert.ok(Math.abs(drawnHeight(world, shown, x) - real) < 0.02, `tick ${tick}: the puddle in column ${x} is drawn as it is`);
    }
  }
});

test('the drawn level never shimmers: while a U-tube settles each arm moves one way only', () => {
  const world = worldFrom([
    '#.###.#',
    '#~###.#',
    '#~###.#',
    '#~###.#',
    '#~###.#',
    '#~###.#',
    '#~###.#',
    '#~~~~~#',
    '#######',
  ]);
  let last = null;
  for (let tick = 0; tick < 300; tick++) {
    stepFluids(world, blockInfo);
    const { shown } = waterPicture(world, blockInfo);
    const now = [drawnHeight(world, shown, 1), drawnHeight(world, shown, 5)];
    if (last) {
      assert.ok(now[0] <= last[0] + 0.005, `tick ${tick}: the full arm only goes down (${last[0]} → ${now[0]})`);
      assert.ok(now[1] >= last[1] - 0.005, `tick ${tick}: the empty arm only goes up (${last[1]} → ${now[1]})`);
    }
    last = now;
  }
});

test('the drawn level never shimmers: a settled column is drawn exactly the same every tick', () => {
  const world = shaft(10);
  run(world, 600);
  const before = waterPicture(world, blockInfo).shown;
  for (let tick = 0; tick < 50; tick++) {
    stepFluids(world, blockInfo);
    const { shown } = waterPicture(world, blockInfo);
    shown.forEach((amount, index) => assert.ok(Math.abs(amount - before[index]) < 0.002, `tick ${tick}, cell ${index}`));
  }
});

test('a deep shaft filling up slowly: the drawn level rises smoothly, never dips, and always matches the amount', () => {
  const world = shaft(0);
  let last = 0;
  for (let tick = 0; tick < 700; tick++) {
    // A steady trickle, let in at the water's own surface (or the floor, to begin with).
    let top = 13 * 3 + 1;
    while (world.fluid.water[top] >= FULL && top > 3) top -= 3;
    if (tick < 650) world.fluid.water[top] += 0.02; // 13 cells' worth in all
    stepFluids(world, blockInfo);
    const drawn = total(waterPicture(world, blockInfo).shown);
    assert.ok(drawn >= last - 0.002, `tick ${tick}: the level dipped from ${last} to ${drawn}`);
    assert.ok(drawn - last < 0.06, `tick ${tick}: the level jumped from ${last} to ${drawn}`);
    assert.ok(Math.abs(drawn - total(world.fluid.water)) < 0.05, `tick ${tick}: drawn ${drawn}, really ${total(world.fluid.water)}`);
    last = drawn;
  }
  assert.ok(Math.abs(last - 13) < 0.01);
});

test('the picture is the same in a mirrored world', () => {
  const rows = [
    '#....#.#',
    '#~~..#.#',
    '#~~..#.#',
    '#~~..#.#',
    '#~~###.#',
    '#~~###.#',
    '#~~~PP.#',
    '########',
  ];
  const world = worldFrom(rows);
  const mirror = worldFrom(mirrored(rows));
  for (let tick = 0; tick < 200; tick++) {
    stepFluids(world, blockInfo);
    stepFluids(mirror, blockInfo);
    const a = waterPicture(world, blockInfo).shown;
    const b = waterPicture(mirror, blockInfo).shown;
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) assert.ok(Math.abs(a[y * 8 + x] - b[y * 8 + 7 - x]) < 1e-9, `tick ${tick}, cell ${x},${y}`);
    }
  }
});

test('a pump holds water back, so the water behind it is not drawn up to the level in front', () => {
  const world = worldFrom([
    '#.#',
    '#~#',
    '#~#',
    '#~#',
    '#~#',
    '#~#',
    '#^#',
    '#.#',
    '#.#',
    '###',
  ]);
  setFluid(world, 'water', 1, 8, 0.5);
  const { shown } = waterPicture(world, blockInfo);
  assert.equal(shown[8 * 3 + 1], 0.5);
  assert.equal(shown[7 * 3 + 1], 0);
});

test('working out the picture never changes the world', () => {
  const world = shaft(9);
  run(world, 30);
  const before = Array.from(world.fluid.water);
  waterPicture(world, blockInfo);
  assert.deepEqual(Array.from(world.fluid.water), before);
});

// ---------------------------------------------------------------
// DIG and pour: one full cell at the most
// ---------------------------------------------------------------

test('one scoop from the bottom of a 12-deep column takes exactly one cell of water, not 1.77', () => {
  const world = shaft(12);
  run(world, 400);
  const bottom = world.fluid.water[13 * 3 + 1];
  assert.ok(bottom > 1.5, 'the bottom cell is squished');
  assert.equal(scoop(world, 1, 13, blockInfo), true);
  assert.ok(Math.abs(total(world.fluid.water) - 11) < 1e-9, `left: ${total(world.fluid.water)}`);
  assert.ok(Math.abs(world.fluid.water[13 * 3 + 1] - (bottom - 1)) < 1e-9, 'the rest stays in the cell');
  run(world, 200);
  assert.ok(Math.abs(total(waterPicture(world, blockInfo).shown) - 11) < 0.01, 'and the column looks one cell shorter');
});

test('a scoop takes at most one cell of steam too, and all of a cell that holds less than one', () => {
  const world = worldFrom(['...', '...']);
  setFluid(world, 'steam', 0, 0, 1.6);
  setFluid(world, 'water', 1, 1, 0.4);
  assert.equal(scoop(world, 0, 0, blockInfo), true);
  assert.ok(Math.abs(world.fluid.steam[0] - 0.6) < 1e-9);
  assert.equal(scoop(world, 1, 1, blockInfo), true);
  assert.equal(world.fluid.water[4], 0);
  assert.equal(scoop(world, 2, 0, blockInfo), false); // nothing there
});

test('digging at water you can see always takes that water, even where it is only drawn', () => {
  const world = shaft(10);
  run(world, 400);
  const { shown } = waterPicture(world, blockInfo);
  const cell = 4 * 3 + 1; // the top of the drawn column: the real water stops lower down
  assert.ok(world.fluid.water[cell] < MIN_AMOUNT && shown[cell] > 0.99);
  assert.equal(scoop(world, 1, 4, blockInfo), true);
  assert.ok(Math.abs(total(world.fluid.water) - 9) < 1e-9, `left: ${total(world.fluid.water)}`);
  run(world, 200);
  assert.ok(Math.abs(total(waterPicture(world, blockInfo).shown) - 9) < 0.01);
  // Above the drawn water there is nothing to take.
  assert.equal(scoop(world, 1, 0, blockInfo), false);
});

test('a speck of real water in a cell that is drawn full does not swallow the scoop', () => {
  const world = shaft(10);
  run(world, 400);
  const cell = 4 * 3 + 1; // drawn full, but its water is really squished into the cells below
  world.fluid.water[cell] = 2e-15; // a leftover far too small to see or draw
  const { shown } = waterPicture(world, blockInfo);
  assert.ok(shown[cell] > 0.99, `drawn ${shown[cell]}`);
  const before = total(world.fluid.water);
  assert.equal(scoop(world, 1, 4, blockInfo), true);
  assert.ok(Math.abs(before - total(world.fluid.water) - shown[cell]) < 1e-9, `the scoop took ${before - total(world.fluid.water)} of the ${shown[cell]} drawn there`);
  assert.equal(world.fluid.water[cell], 0, 'and the speck is gone too');
});

test('DIG on the Build page takes the block and one scoop; water over a full cell stays behind', () => {
  const world = createWorld(3, 3);
  setFluid(world, 'water', 1, 1, 1.6);
  assert.equal(applyTool(world, 'dig', 1, 1, 'stone'), true);
  assert.ok(Math.abs(world.fluid.water[4] - 0.6) < 1e-9);
  assert.equal(applyTool(world, 'dig', 1, 1, 'stone'), true);
  assert.equal(world.fluid.water[4], 0);
  assert.equal(applyTool(world, 'dig', 1, 1, 'stone'), false);
});

test('pour never adds more than one full cell, and never overfills a cell', () => {
  const world = worldFrom(['#.#', '#.#', '###']);
  setFluid(world, 'water', 1, 1, 0.3);
  assert.equal(pour(world, 'water', 1, 1, blockInfo), true);
  assert.equal(world.fluid.water[4], FULL);
  assert.equal(pour(world, 'water', 1, 1, blockInfo), false);
  assert.equal(world.fluid.water[4], FULL);
});

test('you cannot pour into a cell that already looks full; pour just above the water instead', () => {
  const world = shaft(10);
  run(world, 400);
  const { shown } = waterPicture(world, blockInfo);
  assert.ok(shown[4 * 3 + 1] > 0.99 && world.fluid.water[4 * 3 + 1] < MIN_AMOUNT);
  assert.equal(pour(world, 'water', 1, 4, blockInfo), false); // looks full: no room
  assert.equal(pour(world, 'water', 1, 3, blockInfo), true);  // the first cell above the drawn water
  run(world, 200);
  assert.ok(Math.abs(total(waterPicture(world, blockInfo).shown) - 11) < 0.01);
});

/**
 * An open tank with a stone step inside it on the right: `wide` cells
 * wide above the step, one cell narrower beside it.
 * @param {number} wide - the tank's width inside, above the step
 * @param {number} deep - how many rows of tank
 * @param {number} step - how many cells high the step is
 * @returns {object} the world
 */
function steppedTank(wide, deep, step) {
  const rows = [];
  for (let y = 0; y < deep; y++) rows.push(`#${'.'.repeat(wide - 1)}${y >= deep - step ? '#' : '.'}#`);
  rows.push('#'.repeat(wide + 2));
  return worldFrom(rows);
}

test('an open tank with a step in it keeps rising as it is filled: every cell poured in is drawn, on the step too', () => {
  for (const [wide, deep, step, pours] of [[6, 9, 3, 26], [10, 13, 7, 81]]) {
    const world = steppedTank(wide, deep, step);
    let before = 0;
    for (let poured = 1; poured <= pours; poured++) {
      assert.equal(pour(world, 'water', 1, 0, blockInfo), true);
      run(world, 500);
      const { shown } = waterPicture(world, blockInfo);
      const real = total(world.fluid.water);
      assert.ok(Math.abs(real - poured) < 1e-6, 'no water was lost');
      assert.ok(Math.abs(total(shown) - real) < 0.02, `${wide} wide, pour ${poured}: drawn ${total(shown)} of ${real}`);
      assert.ok(total(shown) > before + 0.9, `${wide} wide, pour ${poured}: the picture did not rise (${before} → ${total(shown)})`);
      before = total(shown);
      // Still water is level: every column's surface is drawn at the same height, the one over the step too.
      const tops = [];
      for (let x = 1; x <= wide; x++) tops.push(drawnHeight(world, shown, x) + (x === wide ? step : 0));
      if (poured > (wide - 1) * step + 1) {
        assert.ok(Math.max(...tops) - Math.min(...tops) < 0.02, `${wide} wide, pour ${poured}: not level: ${tops.map((top) => top.toFixed(3)).join(' ')}`);
      }
    }
  }
});

test('water drawn on a step or ledge can be dug: the scoop comes out of the real water beside it', () => {
  const world = steppedTank(6, 9, 3);
  for (let poured = 1; poured <= 16; poured++) {
    pour(world, 'water', 1, 0, blockInfo);
    run(world, 500);
  }
  const { shown, source } = waterPicture(world, blockInfo);
  const ledge = 5 * 8 + 6; // the cell on top of the step
  assert.ok(world.fluid.water[ledge] < MIN_AMOUNT, 'the real (squished) water has not reached the step yet');
  assert.ok(shown[ledge] > 0.1, `only ${shown[ledge]} is drawn on the step`);
  assert.ok(source[ledge] >= 0 && world.fluid.water[source[ledge]] >= MIN_AMOUNT, 'it knows which real water it stands for');
  const real = total(world.fluid.water);
  assert.equal(scoop(world, 6, 5, blockInfo), true);
  assert.ok(Math.abs(real - total(world.fluid.water) - shown[ledge]) < 1e-9, 'the scoop took what was drawn there');
});

test('a ledge only counts beside calm water: no film is drawn on the floor beside a falling tower of water', () => {
  const world = worldFrom([
    '#......#',
    '#~.....#',
    '#~.....#',
    '#~.....#',
    '#~.....#',
    '#~.....#',
    '#~.....#',
    '########',
  ]);
  [1, 1.05, 1.1, 1.15, 1.2, 1.25].forEach((amount, down) => setFluid(world, 'water', 1, 1 + down, amount));
  const { shown } = waterPicture(world, blockInfo);
  for (let x = 2; x <= 6; x++) assert.equal(drawnHeight(world, shown, x), 0, `water drawn in column ${x}`);
});

test('a tower joined by a pipe to an open spout: no water is drawn standing in the air over the spout, and the tower is drawn level with the pool beside it', () => {
  // The pipe runs from the foot of the tower, along the ground and up one
  // cell to an open mouth. Water that comes out stands in a pool on top of
  // the pipes (between the tower's wall and the pipe's riser) and runs
  // off over the ground on the right. When it has all settled, the
  // tower, the pool and the mouth are level: the mouth is as high as the
  // water can stand, like the rim of a full glass.
  const rows = [];
  for (let y = 0; y < 7; y++) rows.push('#~~#...........');
  rows.push('#~~#..P........');
  rows.push('#~~PPPP........');
  rows.push('###############');
  for (const picture of [rows, mirrored(rows)]) {
    const world = worldFrom(picture);
    const flip = picture === rows ? (x) => x : (x) => 14 - x;
    run(world, 2500);
    const { shown } = waterPicture(world, blockInfo);
    const at = (x, y) => shown[y * world.width + flip(x)];
    assert.ok(world.fluid.water[8 * world.width + flip(1)] > 1.05, 'the water at the foot of the tower is squished');
    assert.equal(at(6, 6), 0, 'nothing is drawn in the open air over the pipe\'s mouth');
    const tower = drawnHeight(world, shown, flip(1));
    const pool = 1 + drawnHeight(world, shown, flip(4)) - at(4, 8); // the pool stands on a pipe, one cell up
    assert.ok(Math.abs(tower - drawnHeight(world, shown, flip(2))) < 1e-6, 'the tower is level across');
    assert.ok(Math.abs(tower - pool) < 0.02, `the tower is drawn ${tower} tall, the pool beside it ${pool}`);
    // Nothing is drawn that isn't there.
    assert.ok(total(shown) <= total(world.fluid.water) + 1e-6, `drawn ${total(shown)} of ${total(world.fluid.water)}`);
    for (let x = 7; x < 15; x++) assert.equal(at(x, 7), 0, 'and nothing floats over the ground');
  }
});
