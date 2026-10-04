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
import { REFERENCE_CURRENT, plusSide } from '../circuit.js';
import { DROP_POWER, wheelLeans, wheelTurn } from '../fluids.js';
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

/**
 * A motor takes up a change in its current over a few ticks: each tick
 * it moves 1 ÷ FEED_SMOOTHING of the way (half). See generatorFeed.
 */
const FEED_SMOOTHING = 2;

/** A smoothed generator current smaller than this is dropped (it would halve for ever and never reach 0). */
const FEED_MIN = 1e-6;

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
 * How hard a generator pushes back on its shaft.
 *
 * Its push makes current flow: how much depends on what it's wired to
 * (more lamps side by side = more current). The current pushes back on
 * the shaft: GENERATOR_TORQUE for each unit of current. So a generator
 * with nothing wired to it spins freely, one lighting a lamp is a bit
 * harder to turn, and one whose ends are joined by plain wire (a short
 * circuit) is very hard to turn, for as long as the wire is there.
 *
 * The current through it is everything in its circuit added up (the
 * circuit says how much each pusher sends through it: `perVolt` and
 * `fixed`, see shareOut in circuit.js):
 *
 *   • its OWN push, and the push of every other generator on the SAME
 *     gears. Those all turn together, so their share grows with this
 *     generator's speed. Three generators in a row on one crank each
 *     feel the current all three make: three times as hard to turn.
 *   • what batteries and turbines push through it, and generators on
 *     OTHER gears (spin.js tells us how fast those turn right now). That
 *     share is there even when this generator stands still.
 *
 * Nothing is remembered from before: all of it comes from the wiring as
 * it is NOW (gearsSystem works the circuit out again first if a block, a
 * switch or a clicker's beat changed), and the speeds as they are now.
 * So fixing the wiring always fixes the generator, and the generators
 * always pay for exactly the current that flows.
 *
 * It pushes back ONLY while the current goes the way the generator
 * itself is pushing: then it is really generating, and that takes work.
 * So, with a battery in its loop:
 *
 *   • Turned the way that ADDS to the battery's current, it is very hard
 *     to turn, even from standing still. A crank too weak for it doesn't
 *     move at all.
 *   • Turned the other way, AGAINST the battery, it turns freely, right
 *     up to the speed where its own push beats the battery's. Faster
 *     than that it is generating again, and pushes back.
 *
 * In that free stretch a real generator would be a MOTOR: the battery's
 * current would help turn it. Ours gives no help (a generator is not a
 * motor in this game: use the motor block), so it never makes turning
 * out of nothing. spin.js only uses a brake while it works against the
 * turning, which is exactly the rule above. Whichever was there first,
 * the battery or the turning, the answer is the same.
 * @param {object} world - the world
 * @param {number} x - the generator's column
 * @param {number} y - the generator's row
 * @param {{ratio: Map<number, number>, speedOf: Function}} [group] - from
 *   spin.js: how fast each block on this generator's gears turns compared
 *   to the others, and a way to ask any block's speed right now
 * @returns {{pull: number, perTurn: number}|null} the push-back standing
 *   still (+ pushes back against ↻), and how much it grows per turn per
 *   second; null if no current can flow through it
 */
export function generatorBrake(world, x, y, group) {
  const index = y * world.width + x;
  const electric = world.signals.electric?.cells?.get(index);
  if (!electric?.perVolt) return null;
  const own = group?.ratio.get(index) ?? 1;
  let still = electric.fixed ?? 0; // current out of its + end when it stands still
  let perTurn = 0;                 // and how much more for each turn per second
  for (const [other, share] of electric.perVolt) {
    if (other === index) perTurn += share * GENERATOR_GAIN;
    else if (group?.ratio.has(other)) perTurn += (share * GENERATOR_GAIN * group.ratio.get(other)) / own;
    else still += share * GENERATOR_GAIN * (group ? group.speedOf(other) : spinAt(world, other % world.width, Math.floor(other / world.width)));
  }
  if (Math.abs(still) < 1e-9) still = 0;
  if (still === 0 && Math.abs(perTurn) < 1e-9) return null;
  return { pull: GENERATOR_TORQUE * still, perTurn: GENERATOR_TORQUE * perTurn };
}

/**
 * How a motor drives: the more current through it, the faster and
 * stronger. Which way depends on which way the current goes: current
 * coming out of its right end (or top end, facing up-down) turns it ↻.
 *
 * (A motor powered by a generator on its OWN gears can't keep itself
 * going: the generator only gives back 8 tenths of the work, so each time
 * round there's less, and it winds down. No special rule needed!)
 *
 * A motor with a generator in its circuit feels the electricity A
 * LITTLE LATE: it goes by the current that flowed at the speeds the
 * generators turned on the tick before, the current they were pushed
 * back for. And it takes up a change in that current half at a time
 * (see generatorFeed), a bit like a real motor's coil, which can't
 * change its current in an instant.
 *
 * On the tick its wiring changes (a clicker closes, a switch is
 * flipped, a wire is added) the generators can't ADD anything yet: they
 * may have been spinning freely with nothing to push against. The motor
 * gets what batteries and turbines send it, less whatever the
 * generators HOLD BACK of that (a generator pushing against a battery).
 * (Without the first rule, a clicker would hand a motor a tick of free
 * electricity on every beat. Without the second, it would hand it a
 * burst of battery current that never flows.)
 *
 * The smoothing matters when the motor sits on the same gears as its
 * generators: more current slows the gears, which makes less current,
 * which speeds them up again... Taken up all at once, a tick late, that
 * never settles: the gears flicker faster-slower-faster for ever. Half
 * at a time, it settles.
 *
 * A motor with only a whisper of current (less than MIN_SOURCE) fades
 * out smoothly instead of switching off with a snap (see FADE below),
 * for the same reason: a snap is something to flicker around.
 *
 * `echo` tells spin.js that this motor is wired to a generator on its
 * OWN gears. Its push is then partly an echo of the way those gears were
 * already turning, so it doesn't get a say in which way a water wheel
 * that could go either way should turn (see solveSpin).
 * @param {object} world - the world
 * @param {number} x - the motor's column
 * @param {number} y - the motor's row
 * @param {number[]} [members] - the cell indexes of the blocks on this motor's gears
 * @returns {{speed: number, strength: number, echo: boolean}|null} its top speed and strength, or null if it has no power
 */
export function motorSource(world, x, y, members) {
  const index = y * world.width + x;
  const cell = world.signals.electric?.cells?.get(index);
  if (!cell) return null;
  // With a generator in its circuit, it uses the current generatorFeed
  // allows it. With only batteries and turbines: all that flows.
  const out = cell.perVolt ? world.signals.spin?.fed?.get(index) ?? 0 : cell.arms[plusSide(cell.axis)] ?? 0;
  // The real current, not `level` (that stops at MAX_LEVEL, only so lamps
  // don't get too bright): five batteries make a motor five times as strong.
  const amount = fadeIn(Math.abs(out) / REFERENCE_CURRENT);
  if (amount <= 0) return null;
  const echo = Boolean(cell.perVolt && members?.some((other) => Math.abs(cell.perVolt.get(other) ?? 0) > 1e-9));
  return { speed: Math.sign(out) * amount * MOTOR_SPEED, strength: amount * MOTOR_STRENGTH, echo };
}

/**
 * How much of a motor's current counts. All of it from MIN_SOURCE up.
 * Below that it fades away quickly but smoothly, down to nothing at half
 * of MIN_SOURCE: so a motor with hardly any current still stops, but
 * there is no sudden step for the gears to flicker around.
 * @param {number} amount - the current ÷ REFERENCE_CURRENT (0 or more)
 * @returns {number} the amount that counts (0 = no power)
 */
function fadeIn(amount) {
  if (amount >= MIN_SOURCE) return amount;
  return Math.max(0, 2 * amount - MIN_SOURCE);
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
  refreshElectric(world, blockInfo); // the generators must feel the wiring as it is NOW (see gearsSystem)
  const wheels = world.signals.spin?.wheels ?? new Map();
  const wheelFlow = world.signals.spin?.wheelFlow ?? new Map();
  const wheelWork = world.signals.spin?.wheelWork ?? new Map();
  const felt = world.signals.spin?.felt;
  const rewired = rewiredParts(world, felt);
  const fed = generatorFeed(world, world.signals.spin?.fed, rewired, false);
  world.signals.spin = { ...world.signals.spin, rewired, fed };
  const solved = keepAngles(solveSpin(world, blockInfo), world.signals.spin?.cells, false);
  world.signals.spin = { ...solved, wheels, wheelFlow, wheelWork, blocks, felt, fed };
}

/**
 * How every part in a circuit with a generator is wired to the
 * generators right now: the circuit's `perVolt` lists (see shareOut in
 * circuit.js). gearsSystem keeps these from tick to tick to notice when
 * a motor's wiring changes.
 * @param {object} world - the world
 * @returns {Map<number, Map<number, number>>} part's cell index → (generator's cell index → current per volt)
 */
function generatorWiring(world) {
  const wiring = new Map();
  for (const [index, cell] of world.signals.electric?.cells ?? []) {
    if (cell.perVolt) wiring.set(index, cell.perVolt);
  }
  return wiring;
}

/**
 * The current every part in a circuit with a generator gets to USE (a
 * motor turns by it: see motorSource).
 *
 * The current that really flows out of the part's + end is what the
 * batteries and turbines send (`fixed`) plus what the generators sent at
 * the speeds they turned on the last tick: the very current their shafts
 * were pushed back for (see generatorBrake). We work that out from those
 * speeds exactly, not from the circuit's rounded pushes (see roundPush
 * in circuit.js): rounding goes in little steps, and a motor on its
 * generators' own gears would hop between two steps for ever.
 *
 * The part follows that current like this:
 *
 *   • Each tick it takes up a share of the change (1 ÷ FEED_SMOOTHING),
 *     up or down. Averaging like that never makes current: over time it
 *     hands on exactly the current that flowed, only spread out.
 *   • On the tick its wiring changes (a clicker closes) it starts again:
 *     it gets what the batteries and turbines send, LESS whatever the
 *     generators hold back of that (a generator pushing against a
 *     battery), down to nothing and no further. Current the generators
 *     would ADD starts from the next tick: it hasn't been paid for yet.
 *
 * So on a rewired tick a part never gets more current than is flowing,
 * and all of it was paid for by a battery or a turbine.
 * @param {object} world - the world
 * @param {Map<number, number>|undefined} before - the current each part used on the last tick
 * @param {Set<number>} rewired - the parts whose wiring changed this tick (from rewiredParts)
 * @param {boolean} [advance] - true on a tick; false on a redraw (parts
 *   keep the current they had, unless they have just been rewired)
 * @returns {Map<number, number>} part's cell index → the current out of its + end that it may use
 */
function generatorFeed(world, before, rewired, advance = true) {
  const fed = new Map();
  for (const [index, cell] of world.signals.electric?.cells ?? []) {
    if (!cell.perVolt) continue;
    let made = 0; // what the generators send through it
    for (const [maker, share] of cell.perVolt) made += share * generatorPush(world, maker % world.width, Math.floor(maker / world.width));
    const steady = cell.fixed ?? 0;
    const flowing = steady + made;
    let use = before?.get(index) ?? 0;
    if (rewired.has(index)) {
      // The steady current, held back by the generators as far as nothing and no further.
      use = steady * flowing > 0 ? Math.sign(steady) * Math.min(Math.abs(steady), Math.abs(flowing)) : 0;
    } else if (advance) {
      use += (flowing - use) / FEED_SMOOTHING;
    }
    if (Math.abs(use) > FEED_MIN) fed.set(index, use);
  }
  return fed;
}

/**
 * The parts whose wiring to the generators is not the same as it was on
 * the last tick (see motorSource for why that matters).
 * @param {object} world - the world
 * @param {Map<number, Map<number, number>>|undefined} felt - the wiring on the last tick (from generatorWiring)
 * @returns {Set<number>} their cell indexes
 */
function rewiredParts(world, felt) {
  const rewired = new Set();
  for (const [index, now] of generatorWiring(world)) {
    const before = felt?.get(index);
    let same = Boolean(before) && before.size === now.size;
    if (same) {
      for (const [maker, share] of now) {
        if (Math.abs((before.get(maker) ?? Infinity) - share) > 1e-9) same = false;
      }
    }
    if (!same) rewired.add(index);
  }
  return rewired;
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
  // Generators and motors must feel the circuit as it is on THIS tick: a
  // clicker that has just closed, a switch just flipped. So we work the
  // electricity out again first if its wiring changed. (Otherwise a
  // generator would spin free while its clicker is open, and then give
  // one tick of full-speed electricity that nothing had to push for.)
  // If that changed anything, the picture must be drawn again: the ⚡ pack
  // (which runs later) will find the work already done, and a lamp that
  // has just gone out would stay drawn lit.
  if (refreshElectric(world, blockInfo)) world.animating = true;
  // The wheels read `wheels` while solveSpin works out the turning.
  const cellsBefore = world.signals.spin?.cells;
  const rewired = rewiredParts(world, world.signals.spin?.felt);
  const fed = generatorFeed(world, world.signals.spin?.fed, rewired);
  world.signals.spin = { ...world.signals.spin, wheels, wheelFlow, wheelWork, rewired, fed };
  const solved = keepAngles(solveSpin(world, blockInfo), cellsBefore, true);
  world.signals.spin = { ...solved, wheels, wheelFlow, wheelWork, blocks: world.cells.join(','), felt: generatorWiring(world), fed };
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
 *   spinBrake    a push-back that only works against the turning (generator: making electricity takes work)
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
    spin: { kind: 'hub' }, part: { resistance: 0.05, pushNow: generatorPush, feelsLoad: true },
    spinBrake: generatorBrake, drawSignals: drawGenerator,
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
    'Generators push back: the more lamps they light, the harder they are to turn. With nothing wired up they spin freely. Joined by plain wire (a short circuit) they are very hard to turn, until you take the wire away. Generators wired in a row each feel all the current they make together.',
    'Nothing runs forever. A motor powered by its own generator slows down and stops, like a real one. So does a pump that lifts water for the water wheels that power it: lifting the water costs more than its fall gives back.',
  ],
  blocks: {
    gearSmall: { does: '8 teeth. Turns the gears next to it the other way. Follow its yellow tooth to see which way it turns, and how fast.' },
    gearBig: { does: '16 teeth: half as fast as a small gear it touches. Big gears also touch corner to corner.' },
    axle: { does: 'A rod. Carries turning in a straight line, the same way round. It joins things at its two ends only: put a gear on the end of a shaft, not beside it.' },
    crankStop: { does: 'Hand power, strength 2! Red knob = stopped, green knob = turning.', use: 'stop → ↻ → ↺ → stop' },
    waterWheel: { does: 'Turns when water flows through it. More water = stronger. A longer fall = faster and stronger: put it where the water drops, like under a faucet. In a level stream it turns, but slowly and too feebly to do much work.' },
    motor: { does: 'Turns electricity into turning: more electricity = faster and stronger. Put it in a loop with a battery. Move the battery to the other side of the loop and it turns the other way.' },
    generator: { does: 'Turns turning into electricity: wire it up like a battery. Its + end swaps when it turns the other way. It is not a motor: a battery wired to it won\'t spin it, it only makes it very hard to turn one way.' },
  },
};

export default {
  tab: { id: 'gears', icon: '⚙️', label: 'Gears' },
  blocks,
  guide,
  systems: [gearsSystem],
  refresh: refreshSpin,
};
