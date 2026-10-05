/**
 * water-picture.test.js — checks that water LOOKS as tall as the amount
 * there really is (issues #20 and #30), and that DIG and pour act on
 * one full cell at the most.
 *
 * Real water can't be squashed: ten buckets poured into a tube stand
 * ten buckets tall. In the game that is true of the water itself (a
 * cell never holds more than one cell of water), so THE PICTURE IS THE
 * WATER: waterPicture in fluids.js draws every cell with what it holds,
 * and only works out which water is falling.
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
    for (let tick = 0; tick < 100; tick++) {
      stepFluids(world, blockInfo);
      const { shown } = waterPicture(world, blockInfo);
      // The picture is the water, at every moment (only specks too small to see are left out).
      assert.ok(Math.abs(total(shown) - cells) < 0.01, `${cells} cells, tick ${tick}: drawn ${total(shown)}`);
    }
    const { shown } = waterPicture(world, blockInfo);
    assert.ok(Math.abs(total(world.fluid.water) - cells) < 1e-9, 'no water was made or lost');
    assert.ok(Math.abs(total(shown) - cells) < 1e-9, `${cells} cells are drawn ${total(shown)} tall`);
    // The water is one solid column from the floor up: full cells, with no gaps. And it is REALLY there.
    for (let up = 0; up < cells; up++) {
      assert.ok(shown[(13 - up) * 3 + 1] > 0.99, `${cells} cells: the cell ${up} up from the floor is drawn full`);
      assert.ok(Math.abs(world.fluid.water[(13 - up) * 3 + 1] - 1) < 1e-9, `${cells} cells: the cell ${up} up from the floor holds one cell of water`);
    }
  }
});

test('pouring ten cells into a shaft, one tap at a time, shows 1, 2, 3 ... 10 cells', () => {
  const world = shaft(0);
  for (let taps = 1; taps <= 10; taps++) {
    assert.equal(pour(world, 'water', 1, 0, blockInfo), true);
    run(world, 40);
    assert.ok(Math.abs(total(waterPicture(world, blockInfo).shown) - taps) < 0.01, `after ${taps} taps`);
  }
});

test('waterPicture gives only `shown` and `falling`, and every cell is drawn with just what it holds', () => {
  assert.deepEqual(Object.keys(waterPicture(shaft(3), blockInfo)).sort(), ['falling', 'shown']);
  let seed = 5;
  /**
   * The next make-believe random number (the same ones every run).
   * @returns {number} from 0 up to 1
   */
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let trial = 0; trial < 40; trial++) {
    const world = createWorld(5 + Math.floor(random() * 6), 4 + Math.floor(random() * 6));
    world.cells.forEach((_, index) => {
      const pick = random();
      const name = pick < 0.6 ? 'air' : pick < 0.75 ? 'stone' : pick < 0.9 ? 'pipe' : 'rope';
      setBlock(world, index % world.width, Math.floor(index / world.width), name);
      if (name !== 'stone' && random() < 0.6) world.fluid.water[index] = random() < 0.5 ? 1 : random();
    });
    for (let tick = 0; tick < 30; tick++) {
      stepFluids(world, blockInfo);
      const { shown, falling } = waterPicture(world, blockInfo);
      world.fluid.water.forEach((amount, index) => {
        assert.equal(shown[index], amount >= MIN_AMOUNT ? Math.min(amount, FULL) : 0, `world ${trial} tick ${tick} cell ${index}`);
        assert.ok(falling[index] >= 0 && falling[index] <= 1);
      });
    }
  }
});

test('shallow water is drawn just as it is', () => {
  const world = worldFrom([
    '#....#',
    '#....#',
    '#~~..#',
    '######',
  ]);
  run(world, 200);
  const { shown } = waterPicture(world, blockInfo);
  world.fluid.water.forEach((amount, index) => {
    assert.ok(Math.abs(shown[index] - amount) < 1e-9);
  });
});

test('a wide tank with a deep end is level, and as tall as its water: in the world, and so in the picture', () => {
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
  for (let tick = 0; tick < 100; tick++) {
    stepFluids(world, blockInfo);
    assert.ok(Math.abs(total(waterPicture(world, blockInfo).shown) - 25) < 0.01, `tick ${tick}`);
  }
  const { shown } = waterPicture(world, blockInfo);
  assert.ok(Math.abs(total(shown) - 25) < 1e-6, `drawn ${total(shown)}`);
  assert.ok(Math.max(...world.fluid.water) <= FULL + 1e-9);
  // Every column's surface is at the same height: 3 cells above the shallow floor.
  for (let x = 1; x <= 5; x++) {
    const depth = x <= 2 ? 8 : 3;
    assert.ok(Math.abs(drawnHeight(world, shown, x) - depth) < 0.01, `column ${x} is drawn ${drawnHeight(world, shown, x)} deep`);
  }
});

test('a U-tube is level in both arms, and drawn as tall as its water, while it settles and after', () => {
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
  for (let tick = 0; tick < 100; tick++) {
    stepFluids(world, blockInfo);
    const { shown } = waterPicture(world, blockInfo);
    // All of the water is in the picture at every tick, rushing or still.
    assert.ok(Math.abs(total(shown) - 11) < 0.01, `tick ${tick}: drawn ${total(shown)}`);
  }
  const { shown } = waterPicture(world, blockInfo);
  assert.ok(Math.abs(total(shown) - 11) < 0.01);
  assert.ok(Math.abs(drawnHeight(world, shown, 1) - 4) < 0.01, `left arm ${drawnHeight(world, shown, 1)}`);
  assert.ok(Math.abs(drawnHeight(world, shown, 5) - 4) < 0.01, `right arm ${drawnHeight(world, shown, 5)}`);
  // The water under the lid in the middle is drawn full, never more.
  for (let x = 2; x <= 4; x++) assert.ok(Math.abs(shown[7 * 7 + x] - FULL) < 1e-9);
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
  run(world, 100);
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
  run(world, 100);
  const { shown } = waterPicture(world, blockInfo);
  assert.ok(Math.abs(total(shown) - 9) < 0.01, `drawn ${total(shown)}`);
  assert.ok(Math.abs(drawnHeight(world, shown, 1) - drawnHeight(world, shown, 4)) < 0.02,
    `tower ${drawnHeight(world, shown, 1)}, pipe ${drawnHeight(world, shown, 4)}`);
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
      assert.ok(now[0] <= last[0] + 0.001, `tick ${tick}: the full arm only goes down (${last[0]} → ${now[0]})`);
      assert.ok(now[1] >= last[1] - 0.001, `tick ${tick}: the empty arm only goes up (${last[1]} → ${now[1]})`);
    }
    last = now;
  }
});

test('the drawn level never shimmers: a settled column is drawn exactly the same every tick', () => {
  const world = shaft(10);
  run(world, 100);
  const before = waterPicture(world, blockInfo).shown;
  for (let tick = 0; tick < 50; tick++) {
    stepFluids(world, blockInfo);
    const { shown } = waterPicture(world, blockInfo);
    shown.forEach((amount, index) => assert.equal(amount, before[index], `tick ${tick}, cell ${index}`));
  }
});

test('a deep shaft filling up slowly: the drawn level rises smoothly, never dips, and always matches the amount', () => {
  const world = shaft(0);
  let last = 0;
  for (let tick = 0; tick < 700; tick++) {
    // A steady trickle, let in at the water's own surface (or the floor, to begin with).
    let top = 13 * 3 + 1;
    while (world.fluid.water[top] > FULL - 0.02 && top > 3) top -= 3;
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

test('one scoop from the bottom of a 12-deep column takes exactly one cell of water', () => {
  const world = shaft(12);
  run(world, 100);
  const bottom = world.fluid.water[13 * 3 + 1];
  assert.ok(Math.abs(bottom - 1) < 1e-9, `the bottom cell holds one cell of water, however deep it is: ${bottom}`);
  assert.equal(scoop(world, 1, 13), true);
  assert.ok(Math.abs(total(world.fluid.water) - 11) < 1e-9, `left: ${total(world.fluid.water)}`);
  assert.equal(world.fluid.water[13 * 3 + 1], 0, 'the cell is empty (until the water above falls into it)');
  run(world, 100);
  assert.ok(Math.abs(total(waterPicture(world, blockInfo).shown) - 11) < 0.01, 'and the column looks one cell shorter');
});

test('a scoop takes at most one cell of steam too, and all of a cell that holds less than one', () => {
  const world = worldFrom(['...', '...']);
  setFluid(world, 'steam', 0, 0, 1.6);
  setFluid(world, 'water', 1, 1, 0.4);
  assert.equal(scoop(world, 0, 0), true);
  assert.ok(Math.abs(world.fluid.steam[0] - 0.6) < 1e-9);
  assert.equal(scoop(world, 1, 1), true);
  assert.equal(world.fluid.water[4], 0);
  assert.equal(scoop(world, 2, 0), false); // nothing there
  assert.equal(scoop(world, 9, 9), false); // outside the world
});

test('DIG on the Build page takes the block and one scoop; squeezed steam over a full cell stays behind', () => {
  const world = createWorld(3, 3);
  setFluid(world, 'water', 1, 1, 1);
  setFluid(world, 'steam', 1, 1, 1.6);
  assert.equal(applyTool(world, 'dig', 1, 1, 'stone'), true);
  assert.equal(world.fluid.water[4], 0);
  assert.ok(Math.abs(world.fluid.steam[4] - 0.6) < 1e-9);
  assert.equal(applyTool(world, 'dig', 1, 1, 'stone'), true);
  assert.equal(world.fluid.steam[4], 0);
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

test('you cannot pour into a full cell; pour just above the water instead', () => {
  const world = shaft(10);
  run(world, 100);
  const { shown } = waterPicture(world, blockInfo);
  assert.ok(shown[4 * 3 + 1] > 0.99 && world.fluid.water[4 * 3 + 1] > 0.99, 'the top cell of the column looks full, and is');
  assert.equal(pour(world, 'water', 1, 4, blockInfo), false); // full: no room
  assert.equal(pour(world, 'water', 1, 13, blockInfo), false); // the same at the bottom
  assert.equal(pour(world, 'water', 1, 3, blockInfo), true);  // the first cell above the water
  run(world, 100);
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

test('an open tank with a step in it keeps rising as it is filled: every cell poured in stands in it, on the step too', () => {
  for (const [wide, deep, step, pours] of [[6, 9, 3, 26], [10, 13, 7, 81]]) {
    const world = steppedTank(wide, deep, step);
    let before = 0;
    for (let poured = 1; poured <= pours; poured++) {
      assert.equal(pour(world, 'water', 1, 0, blockInfo), true);
      run(world, 120);
      const { shown } = waterPicture(world, blockInfo);
      const real = total(world.fluid.water);
      assert.ok(Math.abs(real - poured) < 1e-6, 'no water was lost');
      assert.ok(Math.max(...world.fluid.water) <= FULL + 1e-9, 'and none is squashed');
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

// ---------------------------------------------------------------
// Moving water: a trickle is drawn as a trickle
// ---------------------------------------------------------------

test('water falling off a ledge is never drawn as more water than there is', () => {
  // Eight cells of water on a ledge, with a wide floor far below. While
  // it falls there are thin streams in the air and a thin film on the
  // floor under them. (Every cell with a trickle above it used to be
  // drawn FULL: 8 cells of water were drawn as 13.)
  const world = worldFrom([
    '~~~~......',
    '~~~~......',
    '####......',
    '..........',
    '..........',
    '..........',
    '..........',
    '#........#',
    '##########',
  ]);
  for (let tick = 0; tick < 300; tick++) {
    stepFluids(world, blockInfo);
    const { shown, falling } = waterPicture(world, blockInfo);
    assert.ok(total(shown) <= total(world.fluid.water) + 1e-9, `tick ${tick}: ${total(world.fluid.water)} cells of water, drawn as ${total(shown)}`);
    // (Only specks too small to see are left out of the picture.)
    assert.ok(total(shown) >= total(world.fluid.water) - 0.05, `tick ${tick}: ${total(world.fluid.water)} cells of water, only ${total(shown)} drawn`);
    falling.forEach((share) => assert.ok(share >= 0 && share <= 1));
  }
  // Once it lies still, nothing is falling.
  assert.equal(total(waterPicture(world, blockInfo).falling), 0);
});

test('a trickle falling onto a puddle: the trickle is marked as falling, the puddle under it is drawn as deep as it is', () => {
  const world = worldFrom([
    '#...#',
    '#...#',
    '#...#',
    '#####',
  ]);
  setFluid(world, 'water', 2, 0, 0.1); // a trickle in mid-air...
  setFluid(world, 'water', 2, 1, 0.1);
  for (const x of [1, 2, 3]) setFluid(world, 'water', x, 2, 0.2); // ...over a shallow puddle
  const { shown, falling } = waterPicture(world, blockInfo);
  assert.ok(Math.abs(shown[2 * 5 + 2] - 0.2) < 1e-9, `the puddle under the trickle is drawn ${shown[2 * 5 + 2]} deep`);
  assert.equal(falling[2 * 5 + 2], 0, 'the puddle lies on the floor');
  assert.ok(Math.abs(shown[1 * 5 + 2] - 0.1) < 1e-9 && Math.abs(shown[2] - 0.1) < 1e-9, 'the trickle is drawn with what it holds');
  assert.equal(falling[1 * 5 + 2], 1, 'the trickle is falling: the cell under it is far from full');
  assert.equal(falling[2], 1);
  assert.ok(Math.abs(total(shown) - total(world.fluid.water)) < 1e-9);
});

test('water lying on full water is not falling: a settled deep column has no streams in it', () => {
  const world = shaft(10);
  run(world, 100);
  const { falling } = waterPicture(world, blockInfo);
  assert.equal(total(falling), 0);
});

test('falling and lying change over smoothly: the fuller the cell below, the less of the water above counts as falling', () => {
  const shares = [0, 0.5, 0.9, 0.96, 0.98, 0.99, 1, 1 - 1e-12].map((below) => {
    const world = worldFrom(['#.#', '#.#', '###']);
    setFluid(world, 'water', 1, 0, 0.3);
    setFluid(world, 'water', 1, 1, below);
    return waterPicture(world, blockInfo).falling[1];
  });
  assert.equal(shares[0], 1, 'over an empty cell it is all falling');
  assert.equal(shares[1], 1);
  assert.equal(shares[2], 1);
  for (let k = 3; k < shares.length; k++) assert.ok(shares[k] <= shares[k - 1], `shares ${shares.join(' ')}`);
  assert.ok(shares[4] > 0 && shares[4] < 1, `part falling, part lying: ${shares[4]}`);
  assert.equal(shares[6], 0);
  assert.equal(shares[7], 0, 'a cell that is full but for a rounding speck counts as full');
});
