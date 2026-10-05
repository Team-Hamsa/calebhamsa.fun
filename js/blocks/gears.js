/**
 * gears.js — the ⚙️ Gears pack: small and big gears, axles, a crank,
 * a water wheel, a motor and a generator.
 *
 * spin.js works out who turns which way and how fast; this file says
 * what each block is, runs spin.js every tick, and draws the turning.
 * It joins the other packs together:
 *
 *    💧 water → water wheel → gears → generator → ⚡ lamp
 *    ☁️ steam → turbine (in the 💧 pack) → generator → ⚡ lamp
 *    ⚡ battery → motor → gears
 *
 * The motor and the generator are ONE machine: a coil that turns between
 * magnets. Turn it and it pushes electricity; push electricity through
 * it and it turns. One number (MACHINE_K) says how much, BOTH ways, so
 * the electricity it makes is exactly the work it takes from its shaft,
 * and the work it gives its shaft is exactly the electricity it takes.
 * The two blocks are the same machine fitted opposite ways round.
 *
 * Nothing spins forever by itself: every bit of turning is paid for,
 * and some always ends up as heat in the coils and bearings, so a motor
 * powered only by its own generator stops. Real machines lose energy
 * too. The same goes for water: a wheel only gets the push of water
 * that FALLS (WHEEL_STRENGTH), and a pump spends more than that lifting
 * it back up. And for steam: a turbine only gets the push of steam that
 * RISES (TURBINE_STRENGTH in water.js), and only a burner makes steam.
 *
 * EVERY TICK the gears and the circuit are worked out TOGETHER. How
 * fast a machine turns sets how hard it pushes current, and the current
 * sets how hard its shaft is pushed, so neither can be worked out
 * first. gearsSystem does it in this order:
 *
 *   1. the wiring (who is joined to whom): refreshWiring in electric.js
 *   2. every speed, with the circuit's sums folded in: solveSpin in
 *      spin.js, which asks each machine for its machineLink
 *   3. every current, from those speeds: refreshElectric
 *
 * Nothing is carried over from the tick before.
 */
import { solveSpin } from '../spin.js';
import { swapBlock } from '../world.js';
import { DROP_POWER, wheelLeans, wheelTurn } from '../fluids.js';
import { refreshElectric, refreshWiring } from './electric.js';

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

/**
 * How fast a water wheel turns with nothing to push against, when its
 * water falls ONE cell on its way through: the same as a crank. Water
 * that falls further is going faster when it gets there, so the wheel
 * turns faster too: 4 cells of fall = twice as fast (falling things
 * speed up like that: four times the height, twice the speed).
 * More water doesn't make it spin faster. It makes it STRONGER.
 */
export const WHEEL_SPEED = 1;

/**
 * How hard a water wheel can push, for each unit of water going through
 * it per tick, when that water falls one cell. The push comes from the
 * WEIGHT of the water: twice the water is twice the push. One faucet
 * (0.05 a tick) falling one cell makes it as strong as a crank (2);
 * three faucets make it 6. A longer fall makes it stronger too (4 cells
 * of fall = twice as strong, and twice as fast). Water sliding along a
 * level stream hardly falls at all, so that wheel is slow and feeble.
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
export const WHEEL_STRENGTH = (4 * DROP_POWER) / WHEEL_SPEED;

/**
 * THE number of the motor and the generator. It is used both ways:
 *
 *   • turned at 1 turn a second, the machine pushes this many volts
 *   • with 1 amp through its coil, its shaft is pushed this hard
 *
 * Because it is the SAME number both ways, the electricity a machine
 * makes (volts × amps) is always exactly the work it takes from its
 * shaft (push × speed), and the other way round. Nothing is made and
 * nothing goes missing in between; what is lost is real heat, in the
 * coil (MACHINE_RESISTANCE) and in the bearings (MACHINE_DRAG).
 *
 * With 1 here, one battery's motor is exactly one crank: held still it
 * pushes 1 volt ÷ (coil 0.45 + battery 0.05) = 2 amps × 1 = 2 (a crank's
 * strength), and it tops out where its own push cancels the battery's:
 * 1 turn a second (a crank's speed).
 * 🧪 Try this! 2: motors turn half as fast but push twice as hard, and a
 * generator makes twice the volts. Whatever you pick, no machine can
 * run by itself: the number is used both ways.
 */
export const MACHINE_K = 1;

/**
 * The resistance of a motor's or generator's coil (a lamp is 1, a
 * battery 0.05). Current through it makes heat, like in any wire.
 */
export const MACHINE_RESISTANCE = 0.45;

/**
 * How hard a motor's or generator's bearings rub: the push-back for each
 * turn per second, whichever way it turns. It is why a motor with
 * nothing to turn still sips a little current. It only ever loses energy.
 */
export const MACHINE_DRAG = 0.1;

/** Sources slower than this don't drive anything. */
const MIN_SOURCE = 0.05;

/** A water wheel with less water than this going through it each tick doesn't turn. */
const MIN_WHEEL_FLOW = 0.0025;

/** A water wheel follows the water slowly (about 8 ticks), so it doesn't jitter. */
const WHEEL_SMOOTHING = 8;

/** A water wheel's counts when no water goes through it (see stepFluids in fluids.js). */
const NO_WATER = Object.freeze({ lean: 0, sideOut: 0, down: 0, gross: 0, work: 0 });

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

/** The color of the one marked tooth on a gear, the one marked paddle on a water wheel, and the one marked blade of a turbine. */
export const MARK = '#ffd54f';

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
 * How hard a machine (a motor or generator) pushes current right now:
 * MACHINE_K volts for each turn a second. VOLTAGE FOLLOWS SPEED.
 *
 * `way` is which way round the machine is fitted: a generator (+1)
 * turned ↻ pushes current out of its right (or top) end; a motor (−1)
 * turned ↻ pushes it out of its left (or bottom) end. For a motor in a
 * loop with a battery this is the push BACK against the battery: the
 * faster it spins, the less current gets through. That's why a motor
 * with nothing to turn only sips electricity.
 * @param {number} way - +1 for a generator, −1 for a motor
 * @returns {Function} (world, x, y) => the push, in volts (+ is out of the right or top end)
 */
function machinePush(way) {
  return (world, x, y) => way * MACHINE_K * spinAt(world, x, y) || 0; // "|| 0" turns −0 into a plain 0
}

/**
 * How the current through a machine's coil pushes on its shaft:
 * MACHINE_K for each amp. TORQUE FOLLOWS CURRENT, whichever way the
 * current goes: current the machine is pushing out itself holds its
 * shaft back (making electricity takes work), and current forced
 * through it the other way drives it round (that's a motor).
 *
 * The circuit has already worked out, from the wiring alone, how much
 * current comes out of this machine's right (or top) end (see
 * circuitPorts in circuit.js):
 *
 *   current = fixed + perVolt(a) × machine a's push + perVolt(b) × machine b's push + ...
 *
 * and every machine's push is MACHINE_K × its speed (see machinePush).
 * So the push on this shaft is a `still` part (what the batteries send,
 * there even when nothing turns) less a share for every machine in the
 * circuit, growing with that machine's speed. This machine's own share
 * is how hard it is to turn: more lamps side by side, more current,
 * harder. The others' shares are how machines on quite different gears
 * lean on each other through the wires. spin.js settles all of them
 * together (see solveSpin).
 *
 * Nothing here is remembered from before: it all comes from the wiring
 * as it is NOW.
 * @param {number} way - +1 for a generator, −1 for a motor
 * @returns {Function} (world, x, y) => {still, perTurn}: the push on the
 *   shaft with everything standing still (+ is ↻), and for each machine
 *   in the circuit (by cell index) how much that push drops for each
 *   turn a second that machine makes; or null if no current can flow
 *   through this machine at all
 */
function machineLink(way) {
  return (world, x, y) => {
    const port = world.signals.electric?.net?.ports.get(y * world.width + x);
    if (!port) return null;
    const perTurn = new Map();
    for (const [other, share] of port.perVolt) {
      const otherWay = blocks[world.cells[other]]?.machine ?? 0;
      if (share !== 0 && otherWay !== 0) perTurn.set(other, way * MACHINE_K * share * MACHINE_K * otherWay);
    }
    const still = -way * MACHINE_K * port.fixed || 0;
    return still === 0 && perTurn.size === 0 ? null : { still, perTurn };
  };
}

/**
 * How a water wheel drives (from smoothed counts of the water going
 * through it, see stepFluids in fluids.js):
 *
 *   • How FAR its water falls says how FAST it tries to turn: WHEEL_SPEED
 *     for one cell of fall, twice that for four cells (the square root,
 *     like anything falling). Which way depends on which way the water
 *     goes (see wheelTurn in fluids.js).
 *   • How MUCH water goes through says how STRONG it is: WHEEL_STRENGTH
 *     for each unit of water a tick, and more for a longer fall (the
 *     square root again: faster water hits harder).
 *   • Water that spills off both sides pushes both ways, and that
 *     cancels: only the share of the water that turns the wheel one way
 *     counts.
 *   • Water falling dead straight through (nothing sideways) could turn
 *     the wheel either way. Such a wheel is marked `eitherWay`: it turns
 *     the way the rest of its gears are being pushed (so two wheels on
 *     one shaft never fight, and a mirrored build works the same), and
 *     once it is turning it keeps going that way (see solveSpin in
 *     spin.js). All by itself, it turns ↻.
 *
 * "How far it falls" is the energy the water gave up at the wheel ÷ the
 * water that went through. So the most work the wheel can do (half its
 * strength at half its top speed) is at most DROP_POWER × the energy the
 * water gave up, and never more. Water that didn't fall gives no push,
 * however much of it there is.
 * @param {object} world - the world
 * @param {number} x - the wheel's column
 * @param {number} y - the wheel's row
 * @returns {{speed: number, strength: number, eitherWay: boolean}|null} its
 *   top speed and strength (and whether it will turn either way), or null
 *   if hardly any water flows
 */
export function wheelSource(world, x, y) {
  const wheel = world.signals.spin?.wheels?.get(y * world.width + x);
  if (!wheel || wheel.gross <= 0 || wheel.work <= 0) return null;
  const turn = wheelTurn(wheel);
  if (Math.abs(turn) < MIN_WHEEL_FLOW) return null;
  const fall = wheel.work / wheel.gross;                    // cells fallen, for each unit of water
  const water = Math.min(wheel.gross, Math.abs(turn));      // less than all of it when it leaves both ways
  const speed = WHEEL_SPEED * Math.sqrt(fall);
  if (speed < MIN_SOURCE) return null;
  return { speed: Math.sign(turn) * speed, strength: WHEEL_STRENGTH * water * Math.sqrt(fall), eitherWay: !wheelLeans(wheel) };
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
  turnTogether(world, blockInfo, false);
}

/**
 * Work out the gears and the circuit TOGETHER, for the world as it is
 * right now (see the top of this file): the wiring first, then every
 * speed, then every current.
 * @param {object} world - the world
 * @param {Function} blockInfo - looks up what a block name means
 * @param {boolean} advance - true on a tick (turn everything on a bit), false on a redraw
 * @returns {boolean} true if the electricity changed (the picture must be drawn again)
 */
function turnTogether(world, blockInfo, advance) {
  // Motors and generators must feel the circuit as it is on THIS tick: a
  // clicker that has just closed, a switch just flipped.
  refreshWiring(world, blockInfo);
  const before = world.signals.spin;
  const solved = keepAngles(solveSpin(world, blockInfo), before?.cells, advance);
  world.signals.spin = {
    ...solved,
    wheels: before?.wheels ?? new Map(),
    wheelFlow: before?.wheelFlow ?? new Map(),
    wheelWork: before?.wheelWork ?? new Map(),
    blocks: world.cells.join(','),
  };
  // The currents, from the speeds just worked out. (The ⚡ pack, which
  // runs later, will find the work already done.)
  return refreshElectric(world, blockInfo);
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
 * the turning and the electricity together (see turnTogether), turn
 * every block on a little (see keepAngles), and ask for a redraw while
 * anything turns.
 * @param {object} world - the world
 * @param {Function} blockInfo - looks up what a block name means
 * @returns {boolean} always false: no blocks moved
 */
export function gearsSystem(world, blockInfo) {
  const before = world.signals.spin?.wheels ?? new Map();
  const counted = world.signals.water?.wheels ?? new Map();
  const wheels = new Map();    // every wheel's smoothed counts
  const wheelFlow = new Map(); // its turning flow (+ = ↻), and...
  const wheelWork = new Map(); // ...the energy its water gives up each tick: kept handy for tests and tools
  world.cells.forEach((name, index) => {
    if (!blockInfo(name)?.wheel) return;
    const last = before.get(index) ?? NO_WATER;
    const now = counted.get(index) ?? NO_WATER;
    const wheel = {};
    for (const key of Object.keys(NO_WATER)) wheel[key] = last[key] + (now[key] - last[key]) / WHEEL_SMOOTHING;
    wheels.set(index, wheel);
    wheelFlow.set(index, wheelTurn(wheel));
    wheelWork.set(index, wheel.work);
  });
  // The wheels read `wheels` while solveSpin works out the turning.
  world.signals.spin = { ...world.signals.spin, wheels, wheelFlow, wheelWork };
  // If the electricity changed, the picture must be drawn again: a lamp
  // that has just gone out would stay drawn lit.
  if (turnTogether(world, blockInfo, true)) world.animating = true;
  if (world.signals.spin.turning) world.animating = true;
  return false;
}

// =============================================================
// Drawing
// =============================================================
// Blocks are drawn on an 8 × 8 grid of little pixels: p = size / 8.
// A cell's record (from spin.js) says how fast it turns and if it's jammed.
// How far round to draw it comes from the record's `angle` (see turned), not
// from the world's clock, so these drawing functions don't take the clock.

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
 * @returns {void}
 */
function drawGear(ctx, info, left, top, size, cell) {
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
export function drawJam(ctx, left, top, size) {
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
 * @returns {void}
 */
function drawAxle(ctx, info, left, top, size, cell) {
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
 * @returns {void}
 */
function drawCrank(ctx, info, left, top, size, cell) {
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
 * @returns {void}
 */
function drawWheel(ctx, info, left, top, size, cell) {
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
 * @returns {void}
 */
function drawMotor(ctx, info, left, top, size, cell) {
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
  if ((cell?.speed ?? 0) !== 0) {
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
 * Make the motor block or the generator block. They are the SAME
 * machine (the same coil, the same bearings, the same MACHINE_K): the
 * only difference is which way round it is fitted.
 * @param {number} way - +1 for the generator (turned ↻, its + end is the
 *   right or top), −1 for the motor (current coming out of its right or
 *   top end turns it ↻)
 * @param {string} title - its name in the palette
 * @param {string} color - its color in the palette
 * @param {Function} drawSignals - how it is drawn
 * @returns {object} the block's definition
 */
function machine(way, title, color, drawSignals) {
  return {
    title, color, drawSignals,
    machine: way,
    spin: { kind: 'hub' },
    part: { resistance: MACHINE_RESISTANCE, pushNow: machinePush(way), port: true },
    spinLink: machineLink(way),
    spinDrag: () => MACHINE_DRAG,
  };
}

/**
 * Every block in this pack, in the order the palette shows them.
 *   spin         how it joins the spinning: a gear (with teeth), an axle, or a hub (a shaft)
 *   spinSource   its top speed and strength right now (null = not driving)
 *   machine      a motor or generator, and which way round it is fitted (see machine)
 *   spinLink     how the current in its coil pushes on its shaft (see machineLink)
 *   spinDrag     its bearings rub
 *   wheel        the 💧 pack counts water flowing through it
 *   part         it's also an ⚡ circuit part (motor, generator); `port` tells the circuit to work out what it needs to know
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
  motor: machine(-1, 'Motor', '#78909c', drawMotor),
  generator: machine(1, 'Generator', '#546e7a', drawGenerator),
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
    'Gears that touch turn OPPOSITE ways. Things on the same shaft (an axle, or a crank, wheel, turbine, motor or generator touching a gear) turn the SAME way.',
    'Jammed! Three big gears touching in an L can\'t turn: each would have to turn both ways at once. They show a red ❌.',
    'Everything that turns has a top speed and a strength. The harder it pushes, the slower it goes. Two on the same gears add their strength.',
    'Gears change speed, not power: they can make things faster or stronger, never both.',
    'A motor and a generator are the SAME machine. Turn it and it pushes electricity: 1 volt for each turn a second. Push electricity through it and it turns. Making electricity takes work: the more lamps it lights, the harder it is to turn. With nothing wired up it spins freely.',
    'A spinning machine pushes back against the battery. So a motor with nothing to turn sips electricity, a motor lifting something takes more, and a stalled motor takes the most and just gets hot.',
    'Nothing runs forever. Every bit of turning has to be paid for, and some always ends up as heat in the coils and bearings. A motor powered by its own generator stops. So does a pump that lifts water for the water wheels that power it: lifting the water costs more than its fall gives back. A steam plant stops when its burner does.',
  ],
  blocks: {
    gearSmall: { does: '8 teeth. Turns the gears next to it the other way. Follow its yellow tooth to see which way it turns, and how fast.' },
    gearBig: { does: '16 teeth: half as fast as a small gear it touches. Big gears also touch corner to corner.' },
    axle: { does: 'A rod. Carries turning in a straight line, the same way round. It joins things at its two ends only: put a gear on the end of a shaft, not beside it.' },
    crankStop: { does: 'Hand power, strength 2! Red knob = stopped, green knob = turning.', use: 'stop → ↻ → ↺ → stop' },
    waterWheel: { does: 'Turns when water flows through it. More water = stronger. A longer fall = faster and stronger: put it where the water drops, like under a faucet. In a level stream it turns, but slowly and too feebly to do much work.' },
    motor: { does: 'Electricity in, turning out: put it in a loop with a battery. One battery makes it as strong as a crank; more batteries, faster and stronger. Move the battery to the other side of the loop and it turns the other way. Turn it by hand and it is a generator.' },
    generator: { does: 'Turning in, electricity out: wire it up like a battery. Its + end swaps when it turns the other way. Wire a battery to it and it is a motor. It is a motor fitted the other way round.' },
  },
};

export default {
  tab: { id: 'gears', icon: '⚙️', label: 'Gears' },
  blocks,
  guide,
  systems: [gearsSystem],
  refresh: refreshSpin,
};
