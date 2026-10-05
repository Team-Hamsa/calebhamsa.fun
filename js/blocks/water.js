/**
 * water.js — the 💧 Water pack: water, steam, pipes, valves, faucets,
 * drains, burners, chillers, turbines and pumps.
 *
 * fluids.js does the moving; this file says what each block is, runs
 * the fluids every tick, and draws them. It also connects to the other
 * packs: a turbine spun by rising steam is a spinning block for the ⚙️
 * Gears pack (it turns a generator, like a water wheel does), and a
 * pump in a ⚡ circuit pushes water (lifting it uses up the pump's push:
 * see pumpAmount in fluids.js). Deep water presses harder, and that
 * push is what sends water up pipes (see pressWater in fluids.js).
 *
 * A steam power plant, like the real ones:
 *
 *    ☁️ steam rises → turbine spins → ⚙️ generator → ⚡ lamp lights
 *    🔥 burner boils water          ❄️ chiller turns steam back to water
 */
import { FULL, MIN_AMOUNT, PUMP_ON_LEVEL, RISE_POWER, drawingSides, showsWaterLevel, stepFluids, waterPicture } from '../fluids.js';
import { swapBlock } from '../world.js';
import { MARK, drawJam, turned } from './gears.js';

/**
 * How fast a turbine turns with nothing to push against, when its steam
 * rises ONE cell on its way through: the same as a crank, and as a
 * water wheel whose water falls one cell. Steam that rises further is
 * going faster when it gets there, so the turbine turns faster too: 4
 * cells of rise = twice as fast (the square root, like the wheel).
 * More steam doesn't make it spin faster. It makes it STRONGER.
 */
export const TURBINE_SPEED = 1;

/**
 * How hard a turbine can push, for each unit of steam going through it
 * per tick, when that steam rises one cell. One burner (0.05 a tick)
 * rising one cell makes it as strong as a crank (2). A longer rise
 * makes it stronger too (4 cells = twice as strong, and twice as fast).
 *
 * Like WHEEL_STRENGTH (in gears.js), it isn't a number you can pick
 * freely: it comes from RISE_POWER (in fluids.js), which says how much
 * work rising steam can do. A turbine does its most work at half its
 * top speed (half its strength × half its speed), and that must be
 * exactly what the steam gave up:
 *
 *   strength ÷ 2 × speed ÷ 2 = RISE_POWER × steam × cells risen
 */
export const TURBINE_STRENGTH = (4 * RISE_POWER) / TURBINE_SPEED;

/**
 * A turbine follows the steam slowly (over about 8 ticks, one second),
 * so it doesn't jitter. Averaging like that never makes energy: over
 * time it hands on exactly the counts that were made, only spread out.
 */
const TURBINE_SMOOTHING = 8;

/** A turbine with less steam than this going through it each tick doesn't turn (the same as a water wheel). */
const MIN_TURBINE_FLOW = 0.0025;

/** Sources slower than this don't drive anything (the same as in gears.js). */
const MIN_SOURCE = 0.05;

/** A turbine's counts when no steam goes through it (see stepFluids in fluids.js). */
const NO_STEAM = Object.freeze({ out: 0, gross: 0, work: 0, into: 0, inWay: 0 });

/** Smoothed steam counts smaller than this are dropped (they would shrink for ever and never reach 0). */
const TURBINE_MIN = 1e-9;

/** Fluid moving less than this in a tick doesn't count as the world changing. */
export const MOVE_EPSILON = 0.001;

/** The water and steam colors. */
const WATER_COLOR = 'rgba(47, 127, 224, 0.8)';
const WATER_TOP = '#7fb8ff';
const STEAM_COLOR = 'rgba(255, 255, 255, 0.6)';

/** The order a pump turns through when you tap it with ✋. */
const PUMP_TURNS = { pumpRight: 'pumpDown', pumpDown: 'pumpLeft', pumpLeft: 'pumpUp', pumpUp: 'pumpRight' };

// =============================================================
// Running the water
// =============================================================

/**
 * How a turbine drives (from smoothed counts of the steam going through
 * it, see stepFluids in fluids.js). It is a water wheel upside down:
 *
 *   • How FAR its steam rises says how FAST it tries to turn:
 *     TURBINE_SPEED for one cell of rise, twice that for four cells.
 *   • How MUCH steam goes through says how STRONG it is: TURBINE_STRENGTH
 *     for each unit of steam a tick, and more for a longer rise.
 *   • Steam leaving out of both ends pushes the blades both ways, and
 *     that cancels: only the share that goes one way counts.
 *   • A chimney is its own mirror picture, so steam has no left or
 *     right: a turbine is always `eitherWay`. It helps whichever way
 *     its gears are being pushed, keeps going the way it was turning,
 *     and all by itself turns ↻ (see solveSpin in spin.js).
 *
 * "How far it rises" is the energy the steam gave up at the turbine ÷
 * the steam that went through. So the most work the turbine can do
 * (half its strength at half its top speed) is at most RISE_POWER × the
 * energy the steam gave up, and never more. Steam that didn't rise (or
 * un-squeeze) gives no push, however much of it there is.
 *
 * Steam gives up most of its push as it comes IN, so when more comes in
 * than can get out (the room above is filling up), the push is shared
 * over all the steam that came in, not just the trickle that got out.
 * That way a turbine whose way out is choking slows down and gets
 * weaker. It never races: no steam can turn it faster than that steam
 * really rose.
 *
 * A turbine makes TURNING, not electricity: it needs a generator beside
 * it. It reads nothing from the circuit.
 * @param {object} world - the world
 * @param {number} x - the turbine's column
 * @param {number} y - the turbine's row
 * @returns {{speed: number, strength: number, eitherWay: boolean}|null} its
 *   top speed and strength, or null if hardly any steam rises through it
 */
export function turbineSource(world, x, y) {
  const turbine = world.signals.water?.turbines?.get(y * world.width + x);
  if (!turbine || turbine.gross <= 0 || turbine.work <= 0) return null;
  const through = Math.min(turbine.gross, Math.abs(turbine.out)); // less than all of it when it leaves both ways
  if (through < MIN_TURBINE_FLOW) return null;
  const rise = turbine.work / Math.max(turbine.gross, turbine.into); // cells risen, for each unit of steam
  const speed = TURBINE_SPEED * Math.sqrt(rise);
  if (speed < MIN_SOURCE) return null;
  return { speed, strength: TURBINE_STRENGTH * through * Math.sqrt(rise), eitherWay: true };
}

/**
 * Make a record for every fluid block, for drawing: the sides it's
 * drawn with, and its circuit level (pumps).
 * @param {object} world - the world
 * @param {Function} blockInfo - looks up what a block name means
 * @returns {Map<number, object>} records by cell index
 */
function fluidCells(world, blockInfo) {
  const cells = new Map();
  world.cells.forEach((name, index) => {
    const info = blockInfo(name);
    // Spinning blocks (the water wheel, the turbine) are drawn with their
    // spin record from the ⚙️ pack, and rope and pulley hooks by the 🏗️
    // pack with its rope record, so they mustn't get a water record too.
    if (!info?.fluid || info.spin || info.rope || info.hook) return;
    const x = index % world.width;
    const y = Math.floor(index / world.width);
    cells.set(index, {
      sides: drawingSides(world, x, y, blockInfo),
      level: world.signals.electric?.cells?.get(index)?.level ?? 0,
    });
  });
  return cells;
}

/**
 * Bring the drawing records up to date without moving any water (for
 * example, right after a pipe was placed). See refreshSignals in registry.js.
 * @param {object} world - the world
 * @param {Function} blockInfo - looks up what a block name means
 * @returns {void}
 */
export function refreshWater(world, blockInfo) {
  const turbines = world.signals.water?.turbines ?? new Map();
  // Work out afresh how much water to draw in each cell (see waterPicture).
  const { shown, falling } = waterPicture(world, blockInfo);
  world.signals.water = {
    cells: fluidCells(world, blockInfo),
    turbines,
    shown,
    falling,
  };
}

/**
 * The water rule that runs every tick: move the fluids, keep track of
 * the steam rising through each turbine, and say whether anything
 * changed. It never moves blocks, so it returns false; when fluid moved
 * it sets world.fluidChanged (save and redraw), and world.animating for
 * things that move by themselves (flames). (Turning turbines are the ⚙️
 * pack's business: it asks for a redraw while anything turns.)
 * @param {object} world - the world
 * @param {Function} blockInfo - looks up what a block name means
 * @returns {boolean} always false: no blocks moved
 */
export function waterSystem(world, blockInfo) {
  const { moved, turbines: counted, waterOut, waterWork, wheels, sides } = stepFluids(world, blockInfo);
  // Every turbine's counts, smoothed (see TURBINE_SMOOTHING). The ⚙️ pack
  // reads them through turbineSource when it works out the turning.
  const before = world.signals.water?.turbines ?? new Map();
  const turbines = new Map();
  world.cells.forEach((name, index) => {
    if (!blockInfo(name)?.turbine) return;
    const last = before.get(index) ?? NO_STEAM;
    const now = counted.get(index) ?? NO_STEAM;
    const turbine = {};
    for (const key of Object.keys(NO_STEAM)) turbine[key] = last[key] + (now[key] - last[key]) / TURBINE_SMOOTHING;
    if (turbine.gross >= TURBINE_MIN) turbines.set(index, turbine);
  });
  // `wheels` is kept for the ⚙️ pack: water flowing through a water wheel
  // turns it, and the energy the water gives up there is its strength.
  const { shown, falling } = waterPicture(world, blockInfo, sides);
  world.signals.water = {
    cells: fluidCells(world, blockInfo), turbines, waterOut, waterWork, wheels, shown, falling,
  };
  if (moved > MOVE_EPSILON) world.fluidChanged = true;
  if (moved > MOVE_EPSILON || world.cells.includes('burnerOn')) world.animating = true;
  return false;
}

// =============================================================
// Drawing
// =============================================================
// Blocks are drawn on an 8 × 8 grid of little pixels: p = size / 8.

/**
 * Draw a channel (or a pipe's walls) as a middle square plus an arm
 * toward each side, `width` little pixels wide.
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {number} left - the cell's left edge
 * @param {number} top - the cell's top edge
 * @param {number} size - the cell's size
 * @param {string[]} sides - which sides the arms go to
 * @param {number} width - how wide, in little pixels (out of 8)
 * @returns {void}
 */
function drawArms(ctx, left, top, size, sides, width) {
  const p = size / 8;
  const near = (8 - width) / 2 * p; // where the channel starts across the cell
  const across = width * p;
  ctx.fillRect(left + near, top + near, across, across);
  for (const side of sides) {
    if (side === 'up') ctx.fillRect(left + near, top, across, near);
    if (side === 'down') ctx.fillRect(left + near, top + near + across, across, near);
    if (side === 'left') ctx.fillRect(left, top + near, near, across);
    if (side === 'right') ctx.fillRect(left + near + across, top + near, near, across);
  }
}

/**
 * Draw a pipe: gray walls with a dark channel inside. The water layer
 * fills the channel later. In the palette it's a plain sideways pipe.
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {object} info - the block's definition
 * @param {number} left - the cell's left edge
 * @param {number} top - the cell's top edge
 * @param {number} size - the cell's size
 * @param {object|undefined} cell - the cell's water record
 * @returns {void}
 */
function drawPipe(ctx, info, left, top, size, cell) {
  const sides = cell?.sides ?? ['left', 'right'];
  ctx.fillStyle = '#9e9e9e';
  drawArms(ctx, left, top, size, sides, 6);
  ctx.fillStyle = '#37474f';
  drawArms(ctx, left, top, size, sides, 4);
}

/**
 * Draw a valve: a pipe with a wheel on top. Closed, the channel is
 * blocked with red.
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {object} info - the block's definition (info.fluid.closed when shut)
 * @param {number} left - the cell's left edge
 * @param {number} top - the cell's top edge
 * @param {number} size - the cell's size
 * @param {object|undefined} cell - the cell's water record
 * @returns {void}
 */
function drawValve(ctx, info, left, top, size, cell) {
  const p = size / 8;
  drawPipe(ctx, info, left, top, size, cell);
  const closed = info.fluid.closed;
  ctx.fillStyle = closed ? '#c62828' : '#2e7d32';
  ctx.fillRect(left + 2.5 * p, top + 2.5 * p, 3 * p, 3 * p); // the wheel's middle
  ctx.fillStyle = '#ffcdd2';
  ctx.fillRect(left + 3.5 * p, top + 3.5 * p, p, p);
}

/**
 * Draw a turbine: a pipe with four fan blades that really turn (one has
 * a yellow tip, so you can see which way and how fast), and a little
 * shaft end on each closed side, where a generator or a gear joins on.
 * A jammed turbine gets a red ❌.
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {object} info - the block's definition
 * @param {number} left - the cell's left edge
 * @param {number} top - the cell's top edge
 * @param {number} size - the cell's size
 * @param {object|undefined} cell - its spin record (from spin.js: `sides` are its pipe's open sides)
 * @returns {void}
 */
function drawTurbine(ctx, info, left, top, size, cell) {
  const p = size / 8;
  const sides = cell?.sides ?? ['up', 'down'];
  drawPipe(ctx, info, left, top, size, { sides });
  // The shaft ends, on the sides the pipe doesn't use.
  ctx.fillStyle = '#424242';
  const stubs = { up: [3.5, 0], right: [7, 3.5], down: [3.5, 7], left: [0, 3.5] };
  for (const [side, [x, y]] of Object.entries(stubs)) {
    if (!sides.includes(side)) ctx.fillRect(left + x * p, top + y * p, p, p);
  }
  const eighth = Math.floor(turned(cell) * 8); // 8 positions: 0 = up, then clockwise
  ctx.fillStyle = '#eceff1';
  const blades = eighth % 2 === 0
    ? [[3.5, 1.5], [3.5, 5.5], [1.5, 3.5], [5.5, 3.5]]
    : [[2, 2], [5, 2], [2, 5], [5, 5]];
  for (const [x, y] of blades) ctx.fillRect(left + x * p, top + y * p, p, p);
  // One blade has a yellow tip, like the gears' yellow tooth.
  const [tipX, tipY] = [[3.5, 1.5], [5, 2], [5.5, 3.5], [5, 5], [3.5, 5.5], [2, 5], [1.5, 3.5], [2, 2]][eighth];
  ctx.fillStyle = MARK;
  ctx.fillRect(left + tipX * p, top + tipY * p, p, p);
  ctx.fillStyle = '#546e7a';
  ctx.fillRect(left + 3.5 * p, top + 3.5 * p, p, p); // the hub
  if (cell?.jammed) drawJam(ctx, left, top, size);
}

/**
 * Draw a pump: a pipe with an arrow pointing the way it pushes. The
 * arrow glows yellow when the pump has power.
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {object} info - the block's definition (info.fluid.pump is its direction)
 * @param {number} left - the cell's left edge
 * @param {number} top - the cell's top edge
 * @param {number} size - the cell's size
 * @param {object|undefined} cell - the cell's water record
 * @returns {void}
 */
function drawPump(ctx, info, left, top, size, cell) {
  const p = size / 8;
  drawPipe(ctx, info, left, top, size, cell ?? { sides: info.fluid.sides });
  ctx.fillStyle = (cell?.level ?? 0) >= PUMP_ON_LEVEL ? '#ffeb3b' : '#bdbdbd';
  // An arrowhead: three rows getting shorter, pointing right; turned for other directions.
  const rows = [[2.5, 2.5, 3], [3.5, 3, 2], [4.5, 3.5, 1]]; // [x, y, height]
  for (const [x, y, h] of rows) {
    const box = {
      right: [x, y, 1, h],
      left: [7 - x, y, 1, h],
      down: [y, x, h, 1],
      up: [y, 7 - x, h, 1],
    }[info.fluid.pump];
    ctx.fillRect(left + box[0] * p, top + box[1] * p, box[2] * p, box[3] * p);
  }
}

/**
 * Draw a faucet: a tap with a spout at the bottom.
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {object} info - the block's definition
 * @param {number} left - the cell's left edge
 * @param {number} top - the cell's top edge
 * @param {number} size - the cell's size
 * @returns {void}
 */
function drawFaucet(ctx, info, left, top, size) {
  const p = size / 8;
  ctx.fillStyle = '#607d8b';
  ctx.fillRect(left + 3 * p, top + 5 * p, 2 * p, 3 * p); // the spout
  ctx.fillStyle = '#e53935';
  ctx.fillRect(left + 2 * p, top + p, 4 * p, p); // the handle
}

/**
 * Draw a drain: a grate of dark bars.
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {object} info - the block's definition
 * @param {number} left - the cell's left edge
 * @param {number} top - the cell's top edge
 * @param {number} size - the cell's size
 * @returns {void}
 */
function drawDrain(ctx, info, left, top, size) {
  const p = size / 8;
  ctx.fillStyle = '#212121';
  for (const x of [1.5, 3.5, 5.5]) ctx.fillRect(left + x * p, top + p, p, 6 * p);
}

/**
 * Draw a burner: flickering flames when it's on, a gray ring when off.
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {object} info - the block's definition (info.burns when on)
 * @param {number} left - the cell's left edge
 * @param {number} top - the cell's top edge
 * @param {number} size - the cell's size
 * @param {object|undefined} cell - unused (burners have no record)
 * @param {number} ticks - the world's clock
 * @returns {void}
 */
function drawBurner(ctx, info, left, top, size, cell, ticks) {
  const p = size / 8;
  if (!info.burns) {
    ctx.fillStyle = '#9e9e9e';
    ctx.fillRect(left + 2 * p, top + 2 * p, 4 * p, p);
    return;
  }
  const tall = ticks % 2 === 0 ? 0 : p; // flicker
  ctx.fillStyle = '#ff7043';
  ctx.fillRect(left + 2 * p, top + p + tall, 4 * p, 4 * p - tall);
  ctx.fillStyle = '#ffd54f';
  ctx.fillRect(left + 3 * p, top + 2.5 * p + tall, 2 * p, 2.5 * p - tall);
}

/**
 * Draw a chiller: a few white frost sparkles.
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {object} info - the block's definition
 * @param {number} left - the cell's left edge
 * @param {number} top - the cell's top edge
 * @param {number} size - the cell's size
 * @returns {void}
 */
function drawChiller(ctx, info, left, top, size) {
  const p = size / 8;
  ctx.fillStyle = '#ffffff';
  for (const [x, y] of [[1, 1], [5, 2], [2, 5], [6, 6], [4, 4]]) ctx.fillRect(left + x * p, top + y * p, p, p);
}

/**
 * Draw all the water and steam, on top of the blocks. In open air,
 * water fills a cell from the bottom, and steam fills from the top.
 * Water that is FALLING (the cell under it still has space) is drawn as
 * a stream down the middle of the cell instead: as wide as there is
 * water, so a trickle looks like a trickle and never like a full cell.
 * Inside pipes, valves, pumps and turbines it fills the channel, darker
 * when fuller.
 *
 * Water is drawn just as it is: a cell is drawn with the water it holds
 * (water can't be squashed, so ten cells of water stand ten cells tall).
 * waterPicture in fluids.js works out which of it is falling.
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {object} world - the world
 * @param {number} size - how big each cell is, in pixels
 * @returns {void}
 */
export function drawWaterLayer(ctx, world, size) {
  const { water, steam } = world.fluid;
  const records = world.signals.water?.cells ?? new Map();
  const spinning = world.signals.spin?.cells; // a turbine's record is kept by the ⚙️ pack
  const shown = world.signals.water?.shown;
  const falling = world.signals.water?.falling;
  for (let index = 0; index < world.cells.length; index++) {
    // How much water to draw here (before the first tick: just what's in the cell).
    const level = shown ? shown[index] : Math.min(water[index], FULL);
    const wet = level >= MIN_AMOUNT;
    const steamy = steam[index] >= MIN_AMOUNT;
    if (!wet && !steamy) continue;
    const left = (index % world.width) * size;
    const top = Math.floor(index / world.width) * size;
    const record = records.get(index) ?? (blocks[world.cells[index]]?.turbine ? spinning?.get(index) : undefined);
    if (record?.sides) {
      ctx.globalAlpha = 0.3 + 0.7 * Math.min(1, level + steam[index]);
      ctx.fillStyle = wet ? WATER_COLOR : STEAM_COLOR;
      drawArms(ctx, left, top, size, record.sides, 4);
      ctx.globalAlpha = 1;
      continue;
    }
    // Solid blocks never show fluid. Rope is thin, so water around it
    // shows just like in an empty cell.
    if (!showsWaterLevel(world.cells[index])) continue;
    if (wet) {
      // The water lying still: a pool across the cell, as deep as there is of it.
      const amount = Math.min(level, FULL);
      const share = falling ? falling[index] : 0; // how much of it is on its way down
      const lying = amount * (1 - share);
      const height = size * lying;
      ctx.fillStyle = WATER_COLOR;
      if (height > 0) ctx.fillRect(left, top + size - height, size, height);
      // The water falling: a stream down the middle, from the top of the
      // cell to the pool, as wide as it takes to show all of it.
      if (share > 0 && lying < FULL) {
        // (Never thinner than the line on top of a pool, or a faucet's thread of water couldn't be seen.)
        const wide = Math.min(size, Math.max(size / 16, 1, (size * amount * share) / (1 - lying)));
        ctx.fillRect(left + (size - wide) / 2, top, wide, size - height);
      }
      if (height > 0 && height < size) {
        ctx.fillStyle = WATER_TOP;
        ctx.fillRect(left, top + size - height, size, Math.max(1, size / 16));
      }
    }
    if (steamy) {
      ctx.fillStyle = STEAM_COLOR;
      ctx.fillRect(left, top, size, size * Math.min(steam[index], FULL));
    }
  }
}

// =============================================================
// The blocks
// =============================================================

/**
 * Make the ✋ USE for a block that flips to another block (keeping its water).
 * @param {string} next - the block it turns into
 * @returns {Function} the use function
 */
function flipTo(next) {
  return (ctx) => swapBlock(ctx.world, ctx.x, ctx.y, next);
}

/**
 * Make one pump block, facing one direction.
 * @param {'right'|'down'|'left'|'up'} direction - the way it pushes water
 * @param {boolean} hidden - true for all but one direction, so the palette shows one pump
 * @returns {object} the block's definition
 */
function pump(direction, hidden) {
  const name = `pump${direction[0].toUpperCase()}${direction.slice(1)}`;
  return {
    title: 'Pump',
    color: '#607d8b',
    bare: true,
    hidden,
    fluid: { sides: direction === 'left' || direction === 'right' ? ['left', 'right'] : ['up', 'down'], pump: direction },
    part: { resistance: 1 },
    use: flipTo(PUMP_TURNS[name]),
    drawSignals: drawPump,
  };
}

/**
 * Every block in this pack, in the order the palette shows them.
 *   pours     not a block: BUILD pours a full cell of this fluid
 *   fluid     lets water through: which sides, and if it's a closed valve or a pump
 *   faucet / drains / burns / chills / turbine   the special jobs (see fluids.js)
 *   spin, spinSource   the turbine is a spinning block too (see turbineSource, and spin.js)
 *   hidden    not in the palette (you get it with ✋)
 * 🧪 Try this! Change the burner's color to '#1565c0' for a blue-flame burner.
 */
const blocks = {
  water: { title: 'Water', color: '#2f7fe0', pours: 'water' },
  steam: { title: 'Steam', color: '#eceff1', pours: 'steam' },
  pipe: { title: 'Pipe', color: '#9e9e9e', bare: true, fluid: { sides: 'auto-pipe' }, drawSignals: drawPipe },
  valveOpen: {
    title: 'Valve', color: '#9e9e9e', bare: true,
    fluid: { sides: 'axis', prefer: 'h' }, use: flipTo('valveClosed'), drawSignals: drawValve,
  },
  faucet: { title: 'Faucet', color: '#cfd8dc', faucet: true, drawSignals: drawFaucet },
  drain: { title: 'Drain', color: '#546e7a', fluid: { sides: 'all' }, drains: true, drawSignals: drawDrain },
  burnerOn: { title: 'Burner', color: '#4e342e', burns: true, use: flipTo('burnerOff'), drawSignals: drawBurner },
  chiller: { title: 'Chiller', color: '#81d4fa', chills: true, drawSignals: drawChiller },
  turbine: {
    title: 'Turbine', color: '#78909c', bare: true, turbine: true,
    fluid: { sides: 'axis', prefer: 'v' },
    spin: { kind: 'hub' }, spinSource: turbineSource,
    drawSignals: drawTurbine,
  },
  pumpRight: pump('right', false),
  valveClosed: {
    title: 'Valve (shut)', color: '#9e9e9e', bare: true, hidden: true,
    fluid: { sides: 'axis', prefer: 'h', closed: true }, use: flipTo('valveOpen'), drawSignals: drawValve,
  },
  burnerOff: { title: 'Burner (off)', color: '#4e342e', hidden: true, use: flipTo('burnerOn'), drawSignals: drawBurner },
  pumpDown: pump('down', true),
  pumpLeft: pump('left', true),
  pumpUp: pump('up', true),
};

/**
 * What the ❓ guide on the Build page says about this tab: its rules,
 * and what each block in the palette does (and what ✋ USE does to it).
 * tests/guide.test.js checks every palette block is here.
 */
const guide = {
  rules: [
    'Water and steam are real amounts: a cell can be full, half full or nearly empty. Water never appears or disappears by itself. Build a block in water and the water is pushed out of the way: the level goes UP. Only DIG and drains take water away (and building a block into a full tank with a lid on it: there is nowhere for that water to go).',
    'Water falls and spreads out. Deep water presses harder: the taller the water standing over it, the harder it pushes. That push sends water UP a pipe or a U-tube until it is level, and squirts it out of a hole.',
    'Water can\'t be squashed: ten buckets are ten cells, however deep. Falling water is a stream as wide as there is water: a trickle looks like a trickle. One tap of DIG takes one scoop. You can\'t pour into a full cell: pour just above the water.',
    'Steam is the opposite: it rises and spreads out under ceilings. Steam has to RISE to give its push, like water has to fall.',
    'Water has to FALL to give its push. High water can turn a wheel on its way down. Water lying level has no push left.',
    'Lifting water uses up a pump\'s push. The higher the water has to go, the slower the pump lifts it, and at some height it is too heavy and stops. More batteries lift higher AND faster: one battery lifts about 5 blocks.',
  ],
  blocks: {
    water: { does: 'BUILD pours a cell full of water. It falls, spreads out and levels off.' },
    steam: { does: 'BUILD pours a cell full of steam. It rises.' },
    pipe: { does: 'Carries water and steam. Pipes join the pipes next to them. The end of a pipe is open, so water pours out.' },
    valveOpen: { does: 'A pipe with a tap in it. Green = open, red = shut.', use: 'open ↔ shut' },
    faucet: { does: 'Drips water out of its bottom, forever.' },
    drain: { does: 'Water that flows into it disappears.' },
    burnerOn: { does: 'Boils the water just above it into steam.', use: 'on ↔ off' },
    chiller: { does: 'Very cold: steam touching it turns back into water. It rains!' },
    turbine: { does: 'A fan in a pipe. Steam rising through it spins it. It makes TURNING, not electricity: put a generator (⚙️ tab) beside it and wire the generator to a lamp. More steam = stronger. A taller chimney under it = faster and stronger. Stand it upright in the chimney: steam that turns a corner first has lost most of its push. If the steam has nowhere to go, it stops.' },
    pumpRight: {
      does: 'Uses electricity to push water the way its arrow points, even uphill. Wire it into a loop with a battery. Uphill is hard work: the higher, the slower. If the water stops part way up, add a battery. A pump doesn\'t suck: it takes the water right behind it, so let the water run to it.',
      use: 'turns it: → ↓ ← ↑',
    },
  },
};

export default {
  tab: { id: 'water', icon: '💧', label: 'Water' },
  blocks,
  guide,
  systems: [waterSystem],
  refresh: refreshWater,
  drawLayer: drawWaterLayer,
};
