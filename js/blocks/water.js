/**
 * water.js — the 💧 Water pack: water, steam, pipes, valves, faucets,
 * drains, burners, chillers, turbines and pumps.
 *
 * fluids.js does the moving; this file says what each block is, runs
 * the fluids every tick, and draws them. It also connects to the ⚡
 * Power pack: a turbine spun by steam is a battery in a circuit, and a
 * pump in a circuit pushes water.
 *
 * A steam power plant, like the real ones:
 *
 *    ☁️ steam rises → ⚙️ turbine spins → ⚡ lamp lights
 *    🔥 burner boils water          ❄️ chiller turns steam back to water
 */
import { FULL, MIN_AMOUNT, PUMP_ON_LEVEL, drawingSides, stepFluids } from '../fluids.js';
import { swapBlock } from '../world.js';

/**
 * How much push a turbine gives for each unit of steam per tick.
 * One burner makes 0.05 steam a tick, so 20 makes it push like one battery.
 * 🧪 Try this! 40: one burner pushes like two batteries.
 */
export const TURBINE_GAIN = 20;

/** The strongest push a turbine can give (like two batteries). */
const MAX_TURBINE_PUSH = 2;

/**
 * A turbine's push follows the steam slowly (over about 8 ticks, one
 * second), so lamps fade up and down instead of flickering.
 */
const TURBINE_SMOOTHING = 8;

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
 * How hard a turbine pushes right now: its smoothed steam flow × TURBINE_GAIN.
 * @param {object} world - the world
 * @param {number} x - the turbine's column
 * @param {number} y - the turbine's row
 * @returns {number} the push, in volts (0 to MAX_TURBINE_PUSH)
 */
export function turbinePush(world, x, y) {
  const flow = world.signals.water?.turbineFlow?.get(y * world.width + x) ?? 0;
  return Math.min(MAX_TURBINE_PUSH, flow * TURBINE_GAIN);
}

/**
 * Make a record for every fluid block, for drawing: the sides it's
 * drawn with, the steam flowing through it (turbines), and its circuit
 * level (pumps).
 * @param {object} world - the world
 * @param {Function} blockInfo - looks up what a block name means
 * @param {Map<number, number>} turbineFlow - smoothed steam flow by cell index
 * @returns {Map<number, object>} records by cell index
 */
function fluidCells(world, blockInfo, turbineFlow) {
  const cells = new Map();
  world.cells.forEach((name, index) => {
    const info = blockInfo(name);
    // Spinning blocks (the water wheel) are drawn by the ⚙️ pack with
    // their spin record, and rope by the 🏗️ pack with its rope record,
    // so they mustn't get a water record too.
    if (!info?.fluid || info.spin || info.rope) return;
    const x = index % world.width;
    const y = Math.floor(index / world.width);
    cells.set(index, {
      sides: drawingSides(world, x, y, blockInfo),
      flow: turbineFlow.get(index) ?? 0,
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
  const turbineFlow = world.signals.water?.turbineFlow ?? new Map();
  world.signals.water = { cells: fluidCells(world, blockInfo, turbineFlow), turbineFlow };
}

/**
 * The water rule that runs every tick: move the fluids, keep track of
 * the steam spinning each turbine, and say whether anything changed.
 * It never moves blocks, so it returns false; when fluid moved it sets
 * world.fluidChanged (save and redraw), and world.animating for things
 * that move by themselves (flames, spinning turbines).
 * @param {object} world - the world
 * @param {Function} blockInfo - looks up what a block name means
 * @returns {boolean} always false: no blocks moved
 */
export function waterSystem(world, blockInfo) {
  const { moved, steamOut, waterOut } = stepFluids(world, blockInfo);
  const before = world.signals.water?.turbineFlow ?? new Map();
  const turbineFlow = new Map();
  world.cells.forEach((name, index) => {
    if (!blockInfo(name)?.turbine) return;
    const last = before.get(index) ?? 0;
    turbineFlow.set(index, last + ((steamOut.get(index) ?? 0) - last) / TURBINE_SMOOTHING);
  });
  // waterOut is kept for the ⚙️ pack: water flowing through a water wheel turns it.
  world.signals.water = { cells: fluidCells(world, blockInfo, turbineFlow), turbineFlow, waterOut };
  if (moved > MOVE_EPSILON) world.fluidChanged = true;
  const spinning = [...turbineFlow.values()].some((flow) => flow > MIN_AMOUNT);
  if (moved > MOVE_EPSILON || spinning || world.cells.includes('burnerOn')) world.animating = true;
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
 * Draw a turbine: a pipe with fan blades that turn faster with more steam.
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {object} info - the block's definition
 * @param {number} left - the cell's left edge
 * @param {number} top - the cell's top edge
 * @param {number} size - the cell's size
 * @param {object|undefined} cell - the cell's water record
 * @param {number} ticks - the world's clock
 * @returns {void}
 */
function drawTurbine(ctx, info, left, top, size, cell, ticks) {
  const p = size / 8;
  drawPipe(ctx, info, left, top, size, cell ?? { sides: ['up', 'down'] });
  const speed = Math.min(1, (cell?.flow ?? 0) * TURBINE_GAIN);
  const turn = Math.floor(ticks * speed) % 2; // two blade positions: + and ×
  ctx.fillStyle = '#eceff1';
  const blades = turn === 0
    ? [[3.5, 1.5], [3.5, 5.5], [1.5, 3.5], [5.5, 3.5]]
    : [[2, 2], [5, 2], [2, 5], [5, 5]];
  for (const [x, y] of blades) ctx.fillRect(left + x * p, top + y * p, p, p);
  ctx.fillStyle = '#546e7a';
  ctx.fillRect(left + 3.5 * p, top + 3.5 * p, p, p); // the hub
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
 * water fills a cell from the bottom (a cell with water above it is
 * drawn full), and steam fills from the top. Inside pipes, valves,
 * pumps and turbines it fills the channel, darker when fuller.
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {object} world - the world
 * @param {number} size - how big each cell is, in pixels
 * @returns {void}
 */
export function drawWaterLayer(ctx, world, size) {
  const { water, steam } = world.fluid;
  const records = world.signals.water?.cells ?? new Map();
  for (let index = 0; index < world.cells.length; index++) {
    const wet = water[index] >= MIN_AMOUNT;
    const steamy = steam[index] >= MIN_AMOUNT;
    if (!wet && !steamy) continue;
    const left = (index % world.width) * size;
    const top = Math.floor(index / world.width) * size;
    const record = records.get(index);
    if (record) {
      ctx.globalAlpha = 0.3 + 0.7 * Math.min(1, water[index] + steam[index]);
      ctx.fillStyle = wet ? WATER_COLOR : STEAM_COLOR;
      drawArms(ctx, left, top, size, record.sides, 4);
      ctx.globalAlpha = 1;
      continue;
    }
    // Solid blocks never show fluid. Rope is thin, so water around it
    // shows just like in an empty cell.
    if (world.cells[index] !== 'air' && world.cells[index] !== 'rope') continue;
    if (wet) {
      const above = index - world.width;
      const full = above >= 0 && water[above] >= MIN_AMOUNT;
      const height = full ? size : size * Math.min(water[index], FULL);
      ctx.fillStyle = WATER_COLOR;
      ctx.fillRect(left, top + size - height, size, height);
      if (!full && height < size) {
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
    part: { resistance: 0.05, pushNow: turbinePush },
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

export default {
  tab: { id: 'water', icon: '💧', label: 'Water' },
  blocks,
  systems: [waterSystem],
  refresh: refreshWater,
  drawLayer: drawWaterLayer,
};
