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
 * generator slows down and stops. Real machines lose energy too. The
 * same goes for water: a wheel only gets the push of water that FALLS
 * (WHEEL_STRENGTH), and a pump spends more than that lifting it back up.
 */
import { solveSpin, MIN_SPEED } from '../spin.js';
import { swapBlock } from '../world.js';
import { PUSH_STEP, REFERENCE_CURRENT, plusSide, roundPush } from '../circuit.js';
import { DROP_POWER } from '../fluids.js';
import { refreshElectric } from './electric.js';

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
 * How fast a water wheel turns (with nothing to push) for each unit of
 * water flowing through it per tick. A faucet drips 0.05 a tick, so 20
 * makes that 1 turn a second. More water = faster.
 */
export const WHEEL_GAIN = 20;

/**
 * How hard a water wheel can push for each cell the water FALLS on its
 * way through. Water has to fall to give its push: falling one cell
 * through the wheel makes it as strong as a crank, falling onto it from
 * the cell above as well makes it twice as strong, and water sliding
 * along a level stream only gives a feeble push. (A wheel only catches
 * the fall right at the wheel. For a tall waterfall, stack wheels: each
 * one catches its own cell of fall.)
 *
 * It isn't a number you can pick freely: it comes from DROP_POWER (in
 * fluids.js), which says how much work falling water can do. A wheel
 * does its most work at half its top speed (half its strength × half its
 * speed), and that must be exactly what the water gave up:
 *
 *   strength ÷ 2 × speed ÷ 2 = DROP_POWER × water × cells fallen
 *
 * The pump uses the same DROP_POWER for lifting, so a wheel can never
 * give back more than a pump spent lifting the water.
 */
export const WHEEL_STRENGTH = (4 * DROP_POWER) / WHEEL_GAIN;

/**
 * How hard a generator pushes (volts) for each turn per second.
 */
export const GENERATOR_GAIN = 0.8;

/**
 * How hard the electricity a generator makes pushes back on its shaft,
 * for each unit of current. Making electricity takes work: that's why a
 * generator lighting lots of lamps is harder to turn. A generator gives
 * back at most GENERATOR_GAIN ÷ GENERATOR_TORQUE (8 out of 10) of the work
 * that turns it as electricity; the rest is lost as heat, like in a real one.
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
 * (Faster gears can still fool your eye that way. That's what the one
 * yellow tooth is for: see drawGear.)
 * 🧪 Try this! 1, and watch the gears seem to stand still.
 */
const DRAW_SLOWDOWN = 4;

/** The color of the one marked tooth on a gear, and the one marked paddle on a water wheel. */
const MARK = '#ffd54f';

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
 * the shaft: GENERATOR_TORQUE for each unit of current. So a generator
 * with nothing wired to it spins freely, one lighting a lamp is a bit
 * harder to turn, and one whose ends are joined by plain wire (a short
 * circuit) is very hard to turn, for as long as the wire is there.
 *
 * Nothing is remembered from before: everything comes from the
 * electricity (world.signals.electric), which gearsSystem works out again
 * at the start of every tick if the wiring changed (a block, a switch, a
 * clicker's beat). So fixing the wiring always fixes the generator, and
 * closing a switch loads the generator on that very tick.
 *
 *   • While it turns, we use the REAL current through it (which the
 *     circuit worked out from its push): current ÷ push × volts per turn.
 *     Only current going the way the generator pushes counts. (Current
 *     forced through it backwards, by a battery, would help turn a real
 *     generator like a motor. We don't give that help away for free.)
 *   • While it's stopped (or so slow that it pushes less than PUSH_STEP),
 *     we use its "load": the current that WOULD flow for each volt (see
 *     loadOn in circuit.js). And if something else, like a battery, is
 *     forcing current through it, that holds it still either way.
 * @param {object} world - the world
 * @param {number} x - the generator's column
 * @param {number} y - the generator's row
 * @returns {number} push-back (strength) per turn per second
 */
export function generatorDrag(world, x, y) {
  const index = y * world.width + x;
  const electric = world.signals.electric?.cells?.get(index);
  if (!electric) return 0;
  const speed = world.signals.spin?.cells?.get(index)?.speed ?? 0;
  // The current coming out of its + end (negative = going in there).
  const current = electric.arms[plusSide(electric.axis)] ?? 0;
  // The push it was last worked out with, rounded the same way the circuit rounds it (partPush).
  const push = Math.abs(roundPush(speed * GENERATOR_GAIN));
  if (push > 0) {
    const perVolt = Math.max(0, current * Math.sign(speed)) / push;
    return GENERATOR_TORQUE * perVolt * GENERATOR_GAIN; // push-back per current × current per volt × volts per turn
  }
  const slowest = PUSH_STEP / GENERATOR_GAIN; // slower than this, it pushes nothing
  return GENERATOR_TORQUE * ((electric.load ?? 0) * GENERATOR_GAIN + Math.abs(current) / slowest);
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
 * How a water wheel drives (both numbers smoothed):
 *
 *   • how MUCH water flows through it says how FAST it turns. Water
 *     going down or right turns it ↻.
 *   • how FAR that water falls says how STRONG it is: WHEEL_STRENGTH for
 *     each cell fallen. We know that from the energy the water gave up
 *     at the wheel (wheelWork, from fluids.js) ÷ the water that flowed.
 *
 * So the most work the wheel can do (half its strength at half its top
 * speed) is exactly DROP_POWER × the energy the water gave up, and never
 * more. Water that didn't fall gives no push, however much of it there is.
 * @param {object} world - the world
 * @param {number} x - the wheel's column
 * @param {number} y - the wheel's row
 * @returns {{speed: number, strength: number}|null} its top speed and strength, or null if hardly any water flows
 */
export function wheelSource(world, x, y) {
  const index = y * world.width + x;
  const flow = world.signals.spin?.wheelFlow?.get(index) ?? 0;
  const work = world.signals.spin?.wheelWork?.get(index) ?? 0;
  const speed = flow * WHEEL_GAIN;
  if (Math.abs(speed) < MIN_SOURCE) return null;
  return { speed, strength: (4 * DROP_POWER * work) / Math.abs(speed) };
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
  refreshElectric(world, blockInfo); // the generators must feel the wiring as it is NOW (see gearsSystem)
  const wheelFlow = world.signals.spin?.wheelFlow ?? new Map();
  const wheelWork = world.signals.spin?.wheelWork ?? new Map();
  const solved = keepAngles(solveSpin(world, blockInfo), world.signals.spin?.cells, false);
  world.signals.spin = { ...solved, wheelFlow, wheelWork, blocks };
}

/**
 * Give every spinning block its `angle`: how far round it has turned so
 * far (in turns). We ADD UP the turning tick by tick, a little each
 * tick, like a real gear: so when a gear speeds up or slows down it
 * carries on from where it was. (Working the angle out fresh from the
 * clock × the speed made every gear jump to a new place whenever its
 * speed changed.) A stopped gear keeps its angle: it stays where it
 * stopped.
 * @param {{cells: Map<number, object>}} solved - the new records, from solveSpin
 * @param {Map<number, object>|undefined} before - the records from last time
 * @param {boolean} advance - true on a tick (turn everything on a bit), false on a redraw
 * @returns {{cells: Map<number, object>}} the same records, with `angle` filled in
 */
function keepAngles(solved, before, advance) {
  for (const [index, cell] of solved.cells) {
    const angle = (before?.get(index)?.angle ?? 0) + (advance ? cell.speed / TICKS_PER_SECOND : 0);
    // The drawing repeats every DRAW_SLOWDOWN turns, so keep the number small.
    cell.angle = ((angle % DRAW_SLOWDOWN) + DRAW_SLOWDOWN) % DRAW_SLOWDOWN;
  }
  return solved;
}

/**
 * The gears rule that runs every tick: follow the water flowing through
 * the water wheels (from the 💧 pack, which ran just before), work out
 * the turning, turn every block on a little (see keepAngles), and ask
 * for a redraw while anything turns.
 * @param {object} world - the world
 * @param {Function} blockInfo - looks up what a block name means
 * @returns {boolean} always false: no blocks moved
 */
export function gearsSystem(world, blockInfo) {
  const before = world.signals.spin?.wheelFlow ?? new Map();
  const workBefore = world.signals.spin?.wheelWork ?? new Map();
  const waterOut = world.signals.water?.waterOut ?? new Map();
  const waterWork = world.signals.water?.waterWork ?? new Map();
  const wheelFlow = new Map();
  const wheelWork = new Map();
  world.cells.forEach((name, index) => {
    if (!blockInfo(name)?.wheel) return;
    const last = before.get(index) ?? 0;
    wheelFlow.set(index, last + ((waterOut.get(index) ?? 0) - last) / WHEEL_SMOOTHING);
    const lastWork = workBefore.get(index) ?? 0;
    wheelWork.set(index, lastWork + ((waterWork.get(index) ?? 0) - lastWork) / WHEEL_SMOOTHING);
  });
  // Generators and motors must feel the circuit as it is on THIS tick: a
  // clicker that has just closed, a switch just flipped. So we work the
  // electricity out again first if its wiring changed. (Otherwise a
  // generator would spin free while its clicker is open, and then give
  // one tick of full-speed electricity that nothing had to push for.)
  refreshElectric(world, blockInfo);
  // The wheels read these two maps while solveSpin works out the turning.
  const cellsBefore = world.signals.spin?.cells;
  world.signals.spin = { ...world.signals.spin, wheelFlow, wheelWork };
  const solved = keepAngles(solveSpin(world, blockInfo), cellsBefore, true);
  world.signals.spin = { ...solved, wheelFlow, wheelWork, blocks: world.cells.join(',') };
  if (world.signals.spin.turning) world.animating = true;
  return false;
}

// =============================================================
// Drawing
// =============================================================
// Blocks are drawn on an 8 × 8 grid of little pixels: p = size / 8.
// A cell's record (from spin.js) says how fast it turns and if it's jammed.

/**
 * How far round to DRAW a block, as a number from 0 to 1, from the
 * angle it has turned so far (added up tick by tick: see keepAngles).
 * Drawn DRAW_SLOWDOWN times slower than it really turns.
 * @param {object|undefined} cell - its spin record (none in the palette)
 * @returns {number} 0 = not turned, 0.5 = half a turn, ...
 */
export function turned(cell) {
  const turns = (cell?.angle ?? 0) / DRAW_SLOWDOWN;
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
 * Draw a gear: a disc, a ring of teeth (one of them yellow, so you can
 * follow it round), and a hole in the middle. The teeth go round as it
 * turns. Jammed gears get a red ❌.
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
  const angle = turned(cell) * Math.PI * 2;
  ctx.fillStyle = big ? '#6d4c41' : '#757575';
  for (let k = 1; k < teeth; k++) {
    const a = angle + (k / teeth) * Math.PI * 2;
    ctx.fillRect(cx + Math.cos(a) * reach - p / 2, cy + Math.sin(a) * reach - p / 2, p, p);
  }
  // One tooth is painted yellow, with a dot on the way in to the middle.
  // All the other teeth look the same, so on a fast gear they can seem to
  // stand still or creep backwards (like wagon wheels in a film). The
  // yellow one shows which way the gear REALLY turns, and how fast.
  ctx.fillStyle = MARK;
  ctx.fillRect(cx + Math.cos(angle) * reach - p / 2, cy + Math.sin(angle) * reach - p / 2, p, p);
  ctx.fillRect(cx + Math.cos(angle) * reach * 0.5 - p / 4, cy + Math.sin(angle) * reach * 0.5 - p / 4, p / 2, p / 2);
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
  const along = Math.floor(turned(cell) * 8) * p; // the stripe moves one little pixel at a time
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
  const quarter = Math.floor(turned(cell) * 4); // 4 positions: up, right, down, left
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
 * Draw a water wheel: a hub with four paddles that turn. One paddle has
 * a yellow tip.
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
  const eighth = Math.floor(turned(cell) * 8); // 8 positions: 0 = up, then clockwise
  const tilted = eighth % 2 === 1; // + or × paddles
  ctx.fillStyle = '#8d6e63';
  const paddles = tilted
    ? [[1, 1], [6, 1], [1, 6], [6, 6], [2, 2], [5, 2], [2, 5], [5, 5]]
    : [[3.5, 0], [3.5, 1], [3.5, 6], [3.5, 7], [0, 3.5], [1, 3.5], [6, 3.5], [7, 3.5]];
  for (const [x, y] of paddles) ctx.fillRect(left + x * p, top + y * p, p, p);
  // One paddle has a yellow tip, so you can see which way the wheel turns.
  const [tipX, tipY] = [[3.5, 0], [6, 1], [7, 3.5], [6, 6], [3.5, 7], [1, 6], [0, 3.5], [1, 1]][eighth];
  ctx.fillStyle = MARK;
  ctx.fillRect(left + tipX * p, top + tipY * p, p, p);
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
  const quarter = Math.floor(turned(cell) * 4);
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
    spin: { kind: 'hub' }, part: { resistance: 0.05, pushNow: generatorPush, feelsLoad: true }, spinDrag: generatorDrag, drawSignals: drawGenerator,
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
    'Generators push back: the more lamps they light, the harder they are to turn. With nothing wired up they spin freely. Joined by plain wire (a short circuit) they are very hard to turn, until you take the wire away.',
    'Nothing runs forever. A motor powered by its own generator slows down and stops, like a real one. So does a pump that lifts water for the water wheels that power it: lifting the water costs more than its fall gives back.',
  ],
  blocks: {
    gearSmall: { does: '8 teeth. Turns the gears next to it the other way. Follow its yellow tooth to see which way it turns, and how fast.' },
    gearBig: { does: '16 teeth: half as fast as a small gear it touches. Big gears also touch corner to corner.' },
    axle: { does: 'A rod. Carries turning in a straight line, the same way round. It joins things at its two ends only: put a gear on the end of a shaft, not beside it.' },
    crankStop: { does: 'Hand power, strength 2! Red knob = stopped, green knob = turning.', use: 'stop → ↻ → ↺ → stop' },
    waterWheel: { does: 'Turns when water flows through it. More water = faster. A longer fall = stronger: put it where the water drops, like under a faucet. For a tall waterfall, stack wheels one under the other. In a level stream it turns, but too feebly to do much work.' },
    motor: { does: 'Turns electricity into turning: more electricity = faster and stronger. Put it in a loop with a battery. Move the battery to the other side of the loop and it turns the other way.' },
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
