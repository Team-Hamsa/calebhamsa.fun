/**
 * gears.js — the ⚙️ Gears pack: small and big gears, axles, a crank,
 * a water wheel, a motor and a generator.
 *
 * spin.js works out who turns which way and how fast; this file says
 * what each block is, runs spin.js every tick, and draws the turning.
 * It joins the other packs together:
 *
 *    💧 water → water wheel → gears → generator → ⚡ lamp
 *    ⚡ battery → motor → gears
 *
 * Nothing spins forever by itself: a generator gives back a little less
 * than a motor uses (GENERATOR_GAIN), so a motor powered only by its own
 * generator slows down and stops. Real machines lose energy too.
 */
import { solveSpin, MIN_SPEED } from '../spin.js';
import { swapBlock } from '../world.js';
import { REFERENCE_CURRENT } from '../circuit.js';

/**
 * How fast a crank turns, in turns per second.
 * 🧪 Try this! 3 for a speedy crank.
 */
export const CRANK_SPEED = 1;

/**
 * How hard a crank can push (its "torque"), when it's held still. This is
 * the unit every other strength is measured in. The faster it turns, the
 * less it can push: at full speed (nothing to push against) it pushes nothing.
 * 🧪 Try this! 5, a grown-up's crank: it lifts the iron weight with no gears.
 */
export const CRANK_STRENGTH = 2;

/** How fast a motor turns with a normal amount of current (level 1). */
export const MOTOR_SPEED = 1;

/** How hard a motor can push with a normal amount of current (level 1): more current, stronger. */
export const MOTOR_STRENGTH = 2;

/**
 * How fast a water wheel turns for each unit of water flowing through
 * it per tick. A faucet drips 0.05 a tick, so 20 makes that 1 turn a second.
 */
export const WHEEL_GAIN = 20;

/**
 * How hard a water wheel can push for each unit of water flowing through
 * it per tick. More water hitting the paddles pushes harder: one faucet
 * (0.05 a tick) makes it as strong as a crank.
 */
export const WHEEL_STRENGTH = 40;

/**
 * How hard a generator pushes (volts) for each turn per second.
 */
export const GENERATOR_GAIN = 0.8;

/**
 * How hard the electricity a generator makes pushes back on its shaft,
 * for each unit of current. Making electricity takes work: that's why a
 * generator lighting lots of lamps is harder to turn. A generator gives
 * back GENERATOR_GAIN ÷ GENERATOR_TORQUE (8 out of 10) of the work that
 * turns it as electricity; the rest is lost as heat, like in a real one.
 * So no machine can run forever on its own.
 * 🧪 Try this! 0.5: the generator gives back more than you put in, and a
 * motor powered by its own generator runs faster and faster (real
 * machines can't do that!).
 */
export const GENERATOR_TORQUE = 1;

/** Sources slower than this don't drive anything. */
const MIN_SOURCE = 0.05;

/** A water wheel's speed follows the water slowly (about 8 ticks), so it doesn't jitter. */
const WHEEL_SMOOTHING = 8;

/**
 * The clock's ticks per second (the same as TICKS_PER_SECOND in build.js),
 * used to turn "turns per second" into how far to draw a gear round.
 */
export const TICKS_PER_SECOND = 8;

/**
 * Gears are DRAWN turning this many times slower than they really turn.
 * A small gear has 8 teeth, so at 1 turn a second it would move exactly
 * one tooth every tick, and every picture would look the same: it would
 * look stopped! Slowed down 4 times, its teeth creep round a quarter of
 * a tooth each tick, which you can see.
 * 🧪 Try this! 1, and watch the gears seem to stand still.
 */
const DRAW_SLOWDOWN = 4;

/** The order a crank goes through when you tap it with ✋. */
const CRANK_TURNS = { crankStop: 'crankCW', crankCW: 'crankCCW', crankCCW: 'crankStop' };

// =============================================================
// Sources: how fast each machine wants to turn
// =============================================================

/**
 * How fast the block at x, y is turning right now (0 if it isn't).
 * @param {object} world - the world
 * @param {number} x - column
 * @param {number} y - row
 * @returns {number} turns per second (+ = ↻)
 */
export function spinAt(world, x, y) {
  return world.signals.spin?.cells?.get(y * world.width + x)?.speed ?? 0;
}

/**
 * A generator's push: how fast it turns × GENERATOR_GAIN. Turning the
 * other way swaps its + end. Faster = more volts.
 * @param {object} world - the world
 * @param {number} x - the generator's column
 * @param {number} y - the generator's row
 * @returns {number} the push, in volts
 */
export function generatorPush(world, x, y) {
  const cell = world.signals.spin?.cells?.get(y * world.width + x);
  if (!cell || Math.abs(cell.speed) < MIN_SPEED) return 0;
  return cell.speed * GENERATOR_GAIN;
}

/**
 * How hard a generator pushes back on its shaft for each turn per second.
 *
 * Its push makes current flow: how much depends on what it's wired to
 * (more lamps side by side = more current). The current pushes back on
 * the shaft. We learn "how much current for each volt" from the last
 * tick's electricity (that doesn't change unless the wiring does), and
 * remember it in world.signals.spin.conducts, so a slow generator whose
 * push rounds down to 0 still remembers its lamps.
 * @param {object} world - the world
 * @param {number} x - the generator's column
 * @param {number} y - the generator's row
 * @returns {number} push-back (strength) per turn per second
 */
export function generatorDrag(world, x, y) {
  const index = y * world.width + x;
  const conducts = world.signals.spin?.conducts;
  const cell = world.signals.spin?.cells?.get(index);
  const current = world.signals.electric?.cells?.get(index)?.current;
  // Last tick's push, rounded the same way the circuit rounds it (partPush).
  const push = Math.floor(Math.abs((cell?.speed ?? 0) * GENERATOR_GAIN) * 10 + 1e-9) / 10;
  if (conducts && push >= 0.1 && current !== undefined) conducts.set(index, current / push);
  const perVolt = conducts?.get(index) ?? 0;
  return GENERATOR_TORQUE * perVolt * GENERATOR_GAIN; // volts per turn × current per volt × push-back per current
}

/**
 * How a motor drives: the more current through it, the faster and
 * stronger. Which way depends on which way the current goes: current
 * coming out of its right end (or top end, facing up-down) turns it ↻.
 *
 * (A motor powered by a generator on its OWN gears can't keep itself
 * going: the generator only gives back 8 tenths of the work, so each time
 * round there's less, and it winds down. No special rule needed!)
 * @param {object} world - the world
 * @param {number} x - the motor's column
 * @param {number} y - the motor's row
 * @returns {{speed: number, strength: number}|null} its top speed and strength, or null if it has no power
 */
export function motorSource(world, x, y) {
  const electric = world.signals.electric?.cells;
  const cell = electric?.get(y * world.width + x);
  if (!cell || cell.level < MIN_SOURCE) return null;
  const out = cell.arms[cell.axis === 'v' ? 'up' : 'right'] ?? 0;
  if (out === 0) return null;
  // The real current, not `level` (that stops at MAX_LEVEL, only so lamps
  // don't get too bright): five batteries make a motor five times as strong.
  const amount = cell.current / REFERENCE_CURRENT;
  return { speed: Math.sign(out) * amount * MOTOR_SPEED, strength: amount * MOTOR_STRENGTH };
}

/**
 * How a water wheel drives: the more water flowing through it
 * (smoothed), the faster AND stronger. Water going down or right turns it ↻.
 * @param {object} world - the world
 * @param {number} x - the wheel's column
 * @param {number} y - the wheel's row
 * @returns {{speed: number, strength: number}|null} its top speed and strength, or null if hardly any water flows
 */
export function wheelSource(world, x, y) {
  const flow = world.signals.spin?.wheelFlow?.get(y * world.width + x) ?? 0;
  const speed = flow * WHEEL_GAIN;
  return Math.abs(speed) < MIN_SOURCE ? null : { speed, strength: Math.abs(flow) * WHEEL_STRENGTH };
}

// =============================================================
// Running the gears
// =============================================================

/**
 * Work out the turning again, but only if a block changed (for example,
 * right after a gear was placed), keeping the water wheels' flow. See
 * refreshSignals in registry.js. Redrawing the screen must never move
 * the gears on by itself: only ticks do that.
 * @param {object} world - the world
 * @param {Function} blockInfo - looks up what a block name means
 * @returns {void}
 */
export function refreshSpin(world, blockInfo) {
  const blocks = world.cells.join(',');
  if (world.signals.spin?.blocks === blocks) return;
  const wheelFlow = world.signals.spin?.wheelFlow ?? new Map();
  const conducts = world.signals.spin?.conducts ?? new Map();
  world.signals.spin = { ...solveSpin(world, blockInfo), wheelFlow, conducts, blocks };
}

/**
 * The gears rule that runs every tick: follow the water flowing through
 * the water wheels (from the 💧 pack, which ran just before), work out
 * the turning, and ask for a redraw while anything turns.
 * @param {object} world - the world
 * @param {Function} blockInfo - looks up what a block name means
 * @returns {boolean} always false: no blocks moved
 */
export function gearsSystem(world, blockInfo) {
  const before = world.signals.spin?.wheelFlow ?? new Map();
  const waterOut = world.signals.water?.waterOut ?? new Map();
  const wheelFlow = new Map();
  world.cells.forEach((name, index) => {
    if (!blockInfo(name)?.wheel) return;
    const last = before.get(index) ?? 0;
    wheelFlow.set(index, last + ((waterOut.get(index) ?? 0) - last) / WHEEL_SMOOTHING);
  });
  if (!world.signals.spin) world.signals.spin = { cells: new Map() };
  world.signals.spin.conducts ??= new Map();
  const conducts = world.signals.spin.conducts;
  world.signals.spin = { ...solveSpin(world, blockInfo), wheelFlow, conducts, blocks: world.cells.join(',') };
  if (world.signals.spin.turning) world.animating = true;
  return false;
}

// =============================================================
// Drawing
// =============================================================
// Blocks are drawn on an 8 × 8 grid of little pixels: p = size / 8.
// A cell's record (from spin.js) says how fast it turns and if it's jammed.

/**
 * How far round a block has turned, as a number from 0 to 1, from the
 * clock and its speed.
 * @param {object|undefined} cell - its spin record (none in the palette)
 * @param {number} ticks - the world's clock
 * @returns {number} 0 = not turned, 0.5 = half a turn, ...
 */
export function turned(cell, ticks) {
  if (!cell || Math.abs(cell.speed) < MIN_SPEED) return 0;
  const turns = (ticks * cell.speed) / (TICKS_PER_SECOND * DRAW_SLOWDOWN);
  return turns - Math.floor(turns);
}

/**
 * Draw a filled circle made of little squares (pixel-art style).
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {number} cx - the middle, in pixels
 * @param {number} cy - the middle, in pixels
 * @param {number} radius - in pixels
 * @param {number} step - how big each little square is
 * @returns {void}
 */
function drawDisc(ctx, cx, cy, radius, step) {
  for (let dy = -radius; dy < radius; dy += step) {
    const y = dy + step / 2;
    const half = Math.sqrt(Math.max(0, radius * radius - y * y));
    const width = Math.round(half / step) * step;
    if (width > 0) ctx.fillRect(cx - width, cy + dy, width * 2, step);
  }
}

/**
 * Draw a gear: a disc, a ring of teeth, and a hole in the middle. The
 * teeth go round as it turns. Jammed gears get a red ❌.
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {object} info - the block's definition (info.spin.teeth)
 * @param {number} left - the cell's left edge
 * @param {number} top - the cell's top edge
 * @param {number} size - the cell's size
 * @param {object|undefined} cell - its spin record
 * @param {number} ticks - the world's clock
 * @returns {void}
 */
function drawGear(ctx, info, left, top, size, cell, ticks) {
  const p = size / 8;
  const big = info.spin.teeth > 8;
  const cx = left + size / 2;
  const cy = top + size / 2;
  ctx.fillStyle = big ? '#8d6e63' : '#9e9e9e';
  drawDisc(ctx, cx, cy, (big ? 3 : 2.25) * p, p / 2);
  const teeth = info.spin.teeth;
  const reach = (big ? 3.5 : 2.75) * p;
  const angle = turned(cell, ticks) * Math.PI * 2;
  ctx.fillStyle = big ? '#6d4c41' : '#757575';
  for (let k = 0; k < teeth; k++) {
    const a = angle + (k / teeth) * Math.PI * 2;
    ctx.fillRect(cx + Math.cos(a) * reach - p / 2, cy + Math.sin(a) * reach - p / 2, p, p);
  }
  ctx.fillStyle = '#424242';
  ctx.fillRect(cx - p / 2, cy - p / 2, p, p); // the hole for the shaft
  if (cell?.jammed) drawJam(ctx, left, top, size);
}

/**
 * Draw a red ❌ across a jammed block.
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {number} left - the cell's left edge
 * @param {number} top - the cell's top edge
 * @param {number} size - the cell's size
 * @returns {void}
 */
function drawJam(ctx, left, top, size) {
  const p = size / 8;
  ctx.fillStyle = '#e53935';
  for (let k = 1; k < 7; k++) {
    ctx.fillRect(left + k * p, top + k * p, p, p);
    ctx.fillRect(left + (7 - k) * p, top + k * p, p, p);
  }
}

/**
 * Draw an axle: a rod along its line, with a stripe that slides as it turns.
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {object} info - the block's definition
 * @param {number} left - the cell's left edge
 * @param {number} top - the cell's top edge
 * @param {number} size - the cell's size
 * @param {object|undefined} cell - its spin record
 * @param {number} ticks - the world's clock
 * @returns {void}
 */
function drawAxle(ctx, info, left, top, size, cell, ticks) {
  const p = size / 8;
  const upright = cell?.axis === 'v';
  ctx.fillStyle = '#9e9e9e';
  if (upright) ctx.fillRect(left + 3 * p, top, 2 * p, size);
  else ctx.fillRect(left, top + 3 * p, size, 2 * p);
  ctx.fillStyle = '#616161';
  const along = Math.floor(turned(cell, ticks) * 8) * p; // the stripe moves one little pixel at a time
  if (upright) ctx.fillRect(left + 3 * p, top + along, 2 * p, p);
  else ctx.fillRect(left + along, top + 3 * p, p, 2 * p);
  if (cell?.jammed) drawJam(ctx, left, top, size);
}

/**
 * Draw a crank: a handle on an arm that goes round while it's turning.
 * The knob is green while it turns and red when it's stopped.
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {object} info - the block's definition (info.turning when it's not stopped)
 * @param {number} left - the cell's left edge
 * @param {number} top - the cell's top edge
 * @param {number} size - the cell's size
 * @param {object|undefined} cell - its spin record
 * @param {number} ticks - the world's clock
 * @returns {void}
 */
function drawCrank(ctx, info, left, top, size, cell, ticks) {
  const p = size / 8;
  const quarter = Math.floor(turned(cell, ticks) * 4); // 4 positions: up, right, down, left
  const [kx, ky] = [[3.5, 1], [6, 3.5], [3.5, 6], [1, 3.5]][quarter];
  ctx.fillStyle = '#5d4037'; // the arm
  const [ax, ay, aw, ah] = [[3.5, 1.5, 1, 2], [4, 3.5, 2, 1], [3.5, 4, 1, 2], [1.5, 3.5, 2, 1]][quarter];
  ctx.fillRect(left + ax * p, top + ay * p, aw * p, ah * p);
  ctx.fillStyle = '#424242';
  ctx.fillRect(left + 3 * p, top + 3 * p, 2 * p, 2 * p); // the hub
  ctx.fillStyle = info.turning ? '#43a047' : '#e53935'; // the knob
  ctx.fillRect(left + kx * p, top + ky * p, p, p);
  if (cell?.jammed) drawJam(ctx, left, top, size);
}

/**
 * Draw a water wheel: a hub with four paddles that turn.
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {object} info - the block's definition
 * @param {number} left - the cell's left edge
 * @param {number} top - the cell's top edge
 * @param {number} size - the cell's size
 * @param {object|undefined} cell - its spin record
 * @param {number} ticks - the world's clock
 * @returns {void}
 */
function drawWheel(ctx, info, left, top, size, cell, ticks) {
  const p = size / 8;
  const tilted = Math.floor(turned(cell, ticks) * 8) % 2 === 1; // + or × paddles
  ctx.fillStyle = '#8d6e63';
  const paddles = tilted
    ? [[1, 1], [6, 1], [1, 6], [6, 6], [2, 2], [5, 2], [2, 5], [5, 5]]
    : [[3.5, 0], [3.5, 1], [3.5, 6], [3.5, 7], [0, 3.5], [1, 3.5], [6, 3.5], [7, 3.5]];
  for (const [x, y] of paddles) ctx.fillRect(left + x * p, top + y * p, p, p);
  ctx.fillStyle = '#5d4037';
  ctx.fillRect(left + 3 * p, top + 3 * p, 2 * p, 2 * p);
  if (cell?.jammed) drawJam(ctx, left, top, size);
}

/**
 * Draw the two metal ends of a motor or generator, on the sides it
 * faces in a circuit (like the ⚡ parts).
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {'h'|'v'} axis - the way it faces
 * @param {number} left - the cell's left edge
 * @param {number} top - the cell's top edge
 * @param {number} size - the cell's size
 * @returns {void}
 */
function drawEnds(ctx, axis, left, top, size) {
  const p = size / 8;
  ctx.fillStyle = '#b0b0b0';
  if (axis === 'v') {
    ctx.fillRect(left + 3 * p, top, 2 * p, p);
    ctx.fillRect(left + 3 * p, top + 7 * p, 2 * p, p);
  } else {
    ctx.fillRect(left, top + 3 * p, p, 2 * p);
    ctx.fillRect(left + 7 * p, top + 3 * p, p, 2 * p);
  }
}

/**
 * Draw a motor: a box with a shaft end that goes round.
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {object} info - the block's definition
 * @param {number} left - the cell's left edge
 * @param {number} top - the cell's top edge
 * @param {number} size - the cell's size
 * @param {object|undefined} cell - its spin record
 * @param {number} ticks - the world's clock
 * @returns {void}
 */
function drawMotor(ctx, info, left, top, size, cell, ticks) {
  const p = size / 8;
  ctx.fillStyle = '#263238';
  ctx.fillRect(left + 2 * p, top + 2 * p, 4 * p, 4 * p);
  const quarter = Math.floor(turned(cell, ticks) * 4);
  const [x, y] = [[3.5, 2.5], [4.5, 3.5], [3.5, 4.5], [2.5, 3.5]][quarter];
  ctx.fillStyle = '#ffca28';
  ctx.fillRect(left + x * p, top + y * p, p, p);
  drawEnds(ctx, cell?.partAxis ?? 'h', left, top, size);
  if (cell?.jammed) drawJam(ctx, left, top, size);
}

/**
 * Draw a generator: a box with a copper coil, and a "+" on the end that
 * pushes current out. That's the right (or top) end turning ↻, and the
 * other end turning ↺.
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {object} info - the block's definition
 * @param {number} left - the cell's left edge
 * @param {number} top - the cell's top edge
 * @param {number} size - the cell's size
 * @param {object|undefined} cell - its spin record
 * @returns {void}
 */
function drawGenerator(ctx, info, left, top, size, cell) {
  const p = size / 8;
  ctx.fillStyle = '#e08a3c';
  for (const row of [2, 3.5, 5]) ctx.fillRect(left + 2 * p, top + row * p, 4 * p, p); // the coil
  const axis = cell?.partAxis ?? 'h';
  const forward = (cell?.speed ?? 0) >= 0;
  // Where the "+" goes: the + end.
  const [px, py] = axis === 'v' ? (forward ? [3.5, 0.5] : [3.5, 6.5]) : (forward ? [6.5, 3.5] : [0.5, 3.5]);
  drawEnds(ctx, axis, left, top, size);
  if (Math.abs(cell?.speed ?? 0) >= MIN_SPEED) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(left + (px - 0.5) * p, top + py * p, 2 * p, p);            // across...
    ctx.fillRect(left + px * p, top + (py - 0.5) * p, p, 2 * p);            // ...and up and down
  }
  if (cell?.jammed) drawJam(ctx, left, top, size);
}

// =============================================================
// The blocks
// =============================================================

/**
 * Make one of the crank's three blocks (stopped, ↻ or ↺).
 * @param {number} speed - how fast it drives: CRANK_SPEED, −CRANK_SPEED or 0
 * @param {string} name - its block name
 * @returns {object} the block's definition
 */
function crank(speed, name) {
  return {
    title: 'Crank',
    color: '#bcaaa4',
    hidden: name !== 'crankStop',
    turning: speed !== 0,
    spin: { kind: 'hub' },
    spinSource: speed === 0 ? undefined : () => ({ speed, strength: CRANK_STRENGTH }),
    use: (ctx) => swapBlock(ctx.world, ctx.x, ctx.y, CRANK_TURNS[name]),
    drawSignals: drawCrank,
  };
}

/**
 * Every block in this pack, in the order the palette shows them.
 *   spin         how it joins the spinning: a gear (with teeth), an axle, or a hub (a shaft)
 *   spinSource   its top speed and strength right now (null = not driving)
 *   spinDrag     how hard it pushes back for each turn per second (generator)
 *   wheel        the 💧 pack counts water flowing through it
 *   part         it's also an ⚡ circuit part (motor, generator)
 *   hidden       not in the palette (you get it with ✋)
 * 🧪 Try this! Give the big gear 24 teeth: small gears spin 3 times as fast.
 */
const blocks = {
  gearSmall: { title: 'Small gear', color: '#cfd8dc', bare: true, spin: { kind: 'gear', teeth: 8 }, drawSignals: drawGear },
  gearBig: {
    title: 'Big gear', color: '#d7ccc8', bare: true,
    spin: { kind: 'gear', teeth: 16, diagonal: true }, drawSignals: drawGear,
  },
  axle: { title: 'Axle', color: '#9e9e9e', bare: true, spin: { kind: 'axle' }, drawSignals: drawAxle },
  crankStop: crank(0, 'crankStop'),
  waterWheel: {
    title: 'Water wheel', color: '#a1887f', bare: true,
    spin: { kind: 'hub' }, fluid: { sides: 'all' }, wheel: true, spinSource: wheelSource, drawSignals: drawWheel,
  },
  motor: {
    title: 'Motor', color: '#78909c',
    spin: { kind: 'hub' }, part: { resistance: 1 }, spinSource: motorSource, drawSignals: drawMotor,
  },
  generator: {
    title: 'Generator', color: '#546e7a',
    spin: { kind: 'hub' }, part: { resistance: 0.05, pushNow: generatorPush }, spinDrag: generatorDrag, drawSignals: drawGenerator,
  },
  crankCW: crank(CRANK_SPEED, 'crankCW'),
  crankCCW: crank(-CRANK_SPEED, 'crankCCW'),
};

/**
 * What the ❓ guide on the Build page says about this tab: its rules,
 * and what each block in the palette does (and what ✋ USE does to it).
 * tests/guide.test.js checks every palette block is here.
 */
const guide = {
  rules: [
    'Gears that touch turn OPPOSITE ways. Things on the same shaft (an axle, or a crank, wheel, motor or generator touching a gear) turn the SAME way.',
    'Jammed! Three big gears touching in an L can\'t turn: each would have to turn both ways at once. They show a red ❌.',
    'Everything that turns has a top speed and a strength. The harder it pushes, the slower it goes. Two on the same gears add their strength.',
    'Gears change speed, not power: they can make things faster or stronger, never both.',
    'Generators push back: the more lamps they light, the harder they are to turn.',
    'Nothing runs forever. A motor powered by its own generator slows down and stops, like a real one.',
  ],
  blocks: {
    gearSmall: { does: '8 teeth. Turns the gears next to it the other way.' },
    gearBig: { does: '16 teeth: half as fast as a small gear it touches. Big gears also touch corner to corner.' },
    axle: { does: 'A rod. Carries turning in a straight line, the same way round.' },
    crankStop: { does: 'Hand power, strength 2! Red knob = stopped, green knob = turning.', use: 'stop → ↻ → ↺ → stop' },
    waterWheel: { does: 'Turns when water flows through it. More water = faster AND stronger.' },
    motor: { does: 'Turns electricity into turning: more electricity = faster and stronger. Put it in a loop with a battery. Flip the battery round and it turns the other way.' },
    generator: { does: 'Turns turning into electricity: wire it up like a battery. Its + end swaps when it turns the other way.' },
  },
};

export default {
  tab: { id: 'gears', icon: '⚙️', label: 'Gears' },
  blocks,
  guide,
  systems: [gearsSystem],
  refresh: refreshSpin,
};
