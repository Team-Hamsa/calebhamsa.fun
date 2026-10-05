/**
 * electric.js — the ⚡ Electric pack: batteries, wires, switches, lamps,
 * buzzers and clickers.
 *
 * Electricity only flows around a complete LOOP: out of a battery's +
 * end, through wires and parts, and back into its − end. circuit.js does
 * the math; this file says what each block is, runs the math when the
 * world changes, and draws the results: glowing lamps, humming buzzers,
 * sparking batteries, and little dots flowing along the wires.
 */
import { FLOW_MIN, partPush, solveCircuit } from '../circuit.js';
import { setBlock } from '../world.js';

/**
 * How many ticks a clicker stays on, then off. 8 ticks = 1 second.
 * 🧪 Try this! 4 for a fast tick-tock, 16 for a slow one.
 */
export const CLICKER_TICKS = 8;

/**
 * A note block plays when its current goes above this level. Like a real
 * sounder, it needs a least amount to work: one battery can make 4 note
 * blocks in a row sing (level 0.26 each), but not 5 (0.21). The guide says so.
 */
export const NOTE_ON_LEVEL = 0.25;

/** Wire colors: dull when nothing flows, bright copper when current flows. */
const WIRE_IDLE = '#7a4a1e';
const WIRE_HOT = '#e08a3c';

/** The color of the flowing dots (they show which way current goes). */
const DOT_COLOR = '#ffe94d';

/**
 * How fast the dots move, in half-cells per tick for each unit of current.
 * 🧪 Try this! 1 for zooming dots, 0.1 for slow ones.
 */
const DOT_SPEED = 0.25;

/** The color of the metal ends ("stubs") that show which way a part faces. */
const STUB_COLOR = '#b0b0b0';

/**
 * Is a clicker on (letting current through) right now?
 * On for CLICKER_TICKS ticks, then off for CLICKER_TICKS ticks.
 * @param {{ticks: number}} world - the world (its clock)
 * @returns {boolean} true on the "on" beat
 */
export function clickerOn(world) {
  return Math.floor(world.ticks / CLICKER_TICKS) % 2 === 0;
}

/**
 * A short text that changes whenever the WIRING could change: the blocks
 * (a switch that is flipped is a different block), and the clicker beat
 * (only if there's a clicker). How hard anything pushes is not in it.
 * @param {{cells: string[], ticks: number}} world - the world
 * @returns {string} the key
 */
export function wiringKey(world) {
  const beat = world.cells.includes('clicker') ? String(clickerOn(world)) : '';
  return `${world.cells.join(',')}|${beat}`;
}

/**
 * A short text that changes whenever the circuit could change: the
 * blocks, the clicker beat (only if there's a clicker), and how hard any
 * changing pushers (generators) push, rounded down to a
 * hundredth of a volt (partPush does it) so tiny wobbles don't count.
 * If it's the same as last time, there's no need to do the math again.
 * @param {{cells: string[], ticks: number}} world - the world
 * @param {Function} blockInfo - looks up what a block name means
 * @returns {string} the key
 */
export function circuitKey(world, blockInfo) {
  const pushes = [];
  world.cells.forEach((name, index) => {
    const part = blockInfo(name)?.part;
    if (part?.pushNow) pushes.push(partPush(part, world, index % world.width, Math.floor(index / world.width)));
  });
  return `${wiringKey(world)}|${pushes.join(',')}`;
}

/**
 * Work out the electricity again, if anything changed since last time,
 * and keep the results in world.signals.electric for drawing:
 *   cells    each electric cell's record (see solveCircuit in circuit.js)
 *   flowing  true if current flows anywhere
 *   hum      how loud buzzers should hum (the loudest buzzer's level)
 *   wasOn    the note blocks that have current, so each plays once when it starts
 * Note blocks that just got current add a 'note' event to world.events.
 * @param {object} world - the world
 * @param {Function} blockInfo - looks up what a block name means
 * @returns {boolean} true if it did the math (something changed)
 */
export function refreshElectric(world, blockInfo) {
  const old = world.signals.electric;
  const key = circuitKey(world, blockInfo);
  if (old && old.key === key) return false;

  // Same wiring as last time (only a generator pushes harder
  // or softer)? Then the circuit can keep what it worked out about the
  // wiring, which is most of the work when there are lots of generators.
  const wiring = wiringKey(world);
  const { cells, flowing } = solveCircuit(world, blockInfo, old?.wiring === wiring ? old.cells : null);
  const wasOn = old?.wasOn ?? new Set();
  const nowOn = new Set();
  let hum = 0;
  for (const [index, cell] of cells) {
    const info = blockInfo(world.cells[index]);
    if (info?.hums) hum = Math.max(hum, cell.level);
    if (info?.midi !== undefined && cell.level > NOTE_ON_LEVEL) {
      nowOn.add(index);
      if (!wasOn.has(index)) {
        world.events.push({ type: 'note', midi: info.midi, x: index % world.width, y: Math.floor(index / world.width) });
      }
    }
  }
  world.signals.electric = { key, wiring, cells, flowing, hum, wasOn: nowOn, solves: (old?.solves ?? 0) + 1 };
  return true;
}

/**
 * The electric rule that runs every tick. It never moves blocks (so it
 * returns false), but it asks for a redraw when the circuit changed or
 * current is flowing, so the dots keep moving.
 * @param {object} world - the world
 * @param {Function} blockInfo - looks up what a block name means
 * @returns {boolean} always false: no blocks moved
 */
export function electricSystem(world, blockInfo) {
  const solved = refreshElectric(world, blockInfo);
  if (solved || world.signals.electric.flowing) world.animating = true;
  return false;
}

// =============================================================
// Drawing
// =============================================================
// Every drawing function gets the same things:
//   ctx    the canvas paintbrush      left, top  where the cell is (pixels)
//   size   how big the cell is        cell       its electric record, or
//   ticks  the world's clock                     undefined (in the palette)
// Blocks are drawn on an 8 × 8 grid of little pixels: p = size / 8.

/**
 * Draw a rectangle in "part space": as if the part faces sideways. For a
 * part facing up-down, the same rectangle is turned a quarter turn, so
 * one drawing works both ways.
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {'h'|'v'} axis - the way the part faces
 * @param {number} left - the cell's left edge
 * @param {number} top - the cell's top edge
 * @param {number} size - the cell's size
 * @param {number[]} box - [x, y, width, height] in little pixels (0 to 8), facing sideways
 * @returns {void}
 */
function partRect(ctx, axis, left, top, size, [x, y, w, h]) {
  const p = size / 8;
  if (axis === 'v') ctx.fillRect(left + y * p, top + (8 - x - w) * p, h * p, w * p);
  else ctx.fillRect(left + x * p, top + y * p, w * p, h * p);
}

/**
 * Draw the two metal ends of a part, on the sides it faces.
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {'h'|'v'} axis - the way the part faces
 * @param {number} left - the cell's left edge
 * @param {number} top - the cell's top edge
 * @param {number} size - the cell's size
 * @returns {void}
 */
function drawStubs(ctx, axis, left, top, size) {
  ctx.fillStyle = STUB_COLOR;
  partRect(ctx, axis, left, top, size, [0, 3, 1, 2]);
  partRect(ctx, axis, left, top, size, [7, 3, 1, 2]);
}

/**
 * Draw the flowing dots on each side of a cell that carries current.
 * A dot travels from the middle to the edge when current flows out that
 * side, and from the edge to the middle when it flows in.
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {number} left - the cell's left edge
 * @param {number} top - the cell's top edge
 * @param {number} size - the cell's size
 * @param {object} cell - the cell's electric record
 * @param {number} ticks - the world's clock
 * @returns {void}
 */
export function drawDots(ctx, left, top, size, cell, ticks) {
  const p = size / 8;
  const half = size / 2;
  ctx.fillStyle = DOT_COLOR;
  for (const side of cell.faces) {
    const current = cell.arms[side] ?? 0;
    if (Math.abs(current) <= FLOW_MIN) continue;
    const speed = Math.min(0.5, Math.max(0.05, Math.abs(current) * DOT_SPEED));
    const phase = (ticks * speed) % 1;
    const along = (current > 0 ? phase : 1 - phase) * half; // pixels from the middle
    const [dx, dy] = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] }[side];
    const x = left + half + dx * along - p;
    const y = top + half + dy * along - p;
    ctx.fillRect(x, y, 2 * p, 2 * p);
  }
}

/**
 * Draw a wire: a copper line from the middle toward every side it's
 * connected through (a lone wire is just a dot), plus flowing dots.
 * In the palette (no record) it's a plain sideways wire.
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {object} info - the block's definition
 * @param {number} left - the cell's left edge
 * @param {number} top - the cell's top edge
 * @param {number} size - the cell's size
 * @param {object|undefined} cell - the cell's electric record
 * @param {number} ticks - the world's clock
 * @returns {void}
 */
export function drawWire(ctx, info, left, top, size, cell, ticks) {
  const p = size / 8;
  const half = size / 2;
  const faces = cell ? cell.faces : ['right', 'left'];
  const hot = Boolean(cell) && faces.some((side) => Math.abs(cell.arms[side] ?? 0) > FLOW_MIN);
  ctx.fillStyle = hot ? WIRE_HOT : WIRE_IDLE;
  ctx.fillRect(left + half - p, top + half - p, 2 * p, 2 * p); // the middle
  for (const side of faces) {
    if (side === 'up') ctx.fillRect(left + half - p, top, 2 * p, half);
    if (side === 'down') ctx.fillRect(left + half - p, top + half, 2 * p, half);
    if (side === 'left') ctx.fillRect(left, top + half - p, half, 2 * p);
    if (side === 'right') ctx.fillRect(left + half, top + half - p, half, 2 * p);
  }
  if (cell) drawDots(ctx, left, top, size, cell, ticks);
}

/**
 * Draw a battery: a red + half and a black − half, a "+" sign, metal
 * ends, and sparks with a puff of smoke when it's short-circuited.
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {object} info - the block's definition
 * @param {number} left - the cell's left edge
 * @param {number} top - the cell's top edge
 * @param {number} size - the cell's size
 * @param {object|undefined} cell - the cell's electric record
 * @param {number} ticks - the world's clock
 * @returns {void}
 */
function drawBattery(ctx, info, left, top, size, cell, ticks) {
  const axis = cell?.axis ?? 'h';
  // Facing sideways, + is on the right; partRect turns it so + is on top.
  ctx.fillStyle = '#212121';
  partRect(ctx, axis, left, top, size, [1, 1, 3, 6]); // the − half (black)
  ctx.fillStyle = '#ffffff';
  partRect(ctx, axis, left, top, size, [5, 3.5, 2, 1]); // the "+" sign: across...
  partRect(ctx, axis, left, top, size, [5.5, 3, 1, 2]); // ...and up and down
  drawStubs(ctx, axis, left, top, size);
  if (cell?.spark && ticks % 2 === 0) {
    const p = size / 8;
    ctx.fillStyle = '#fff59d'; // a zig-zag spark
    ctx.fillRect(left + p, top, p, p);
    ctx.fillRect(left + 2 * p, top + p, p, p);
    ctx.fillRect(left + p, top + 2 * p, p, p);
    ctx.fillRect(left + 6 * p, top + p, p, p);
    ctx.fillRect(left + 7 * p, top + 2 * p, p, p);
    ctx.fillStyle = 'rgba(120, 120, 120, 0.7)'; // a puff of smoke
    ctx.fillRect(left + 3 * p, top - p, 3 * p, 2 * p);
  }
}

/**
 * Draw a lamp: a bulb that's gray when off and yellow when on, with a
 * glow that gets bigger the more current flows.
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {object} info - the block's definition
 * @param {number} left - the cell's left edge
 * @param {number} top - the cell's top edge
 * @param {number} size - the cell's size
 * @param {object|undefined} cell - the cell's electric record
 * @returns {void}
 */
function drawLamp(ctx, info, left, top, size, cell) {
  const p = size / 8;
  const level = cell?.level ?? 0;
  if (level > 0.05) {
    const glow = p * 1.5 * level;
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#fff3a0';
    ctx.fillRect(left + 2 * p - glow, top + 2 * p - glow, 4 * p + 2 * glow, 4 * p + 2 * glow);
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = level > 0.05 ? '#ffe066' : '#bdbdbd';
  ctx.fillRect(left + 2 * p, top + 2 * p, 4 * p, 4 * p);
  drawStubs(ctx, cell?.axis ?? 'h', left, top, size);
}

/**
 * Draw a switch: a lever between the two metal ends. Closed, it lies
 * flat across (current can pass); open, it tips up and leaves a gap.
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {object} info - the block's definition (info.closed says which)
 * @param {number} left - the cell's left edge
 * @param {number} top - the cell's top edge
 * @param {number} size - the cell's size
 * @param {object|undefined} cell - the cell's electric record
 * @returns {void}
 */
function drawSwitch(ctx, info, left, top, size, cell) {
  const axis = cell?.axis ?? 'h';
  ctx.fillStyle = '#eeeeee';
  if (info.closed) {
    partRect(ctx, axis, left, top, size, [1, 3.5, 6, 1]);
  } else {
    // A lever tipped up from the left end: a little staircase.
    for (let step = 0; step < 4; step++) partRect(ctx, axis, left, top, size, [1 + step, 3 - step, 1.5, 1]);
  }
  drawStubs(ctx, axis, left, top, size);
}

/**
 * Draw a buzzer: a speaker grill whose lines jiggle while it hums.
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {object} info - the block's definition
 * @param {number} left - the cell's left edge
 * @param {number} top - the cell's top edge
 * @param {number} size - the cell's size
 * @param {object|undefined} cell - the cell's electric record
 * @param {number} ticks - the world's clock
 * @returns {void}
 */
function drawBuzzer(ctx, info, left, top, size, cell, ticks) {
  const p = size / 8;
  const jiggle = (cell?.level ?? 0) > 0.05 && ticks % 2 === 0 ? p / 2 : 0;
  ctx.fillStyle = '#263238';
  for (const row of [2, 4, 6]) ctx.fillRect(left + 2 * p + jiggle, top + (row - 0.5) * p, 4 * p, p);
  drawStubs(ctx, cell?.axis ?? 'h', left, top, size);
}

/**
 * Draw a clicker: a clock face whose hand ticks round, with a green light
 * on the "on" beat (only in the world; the palette shows it plain).
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {object} info - the block's definition
 * @param {number} left - the cell's left edge
 * @param {number} top - the cell's top edge
 * @param {number} size - the cell's size
 * @param {object|undefined} cell - the cell's electric record
 * @param {number} ticks - the world's clock
 * @returns {void}
 */
function drawClicker(ctx, info, left, top, size, cell, ticks) {
  const p = size / 8;
  ctx.fillStyle = '#fafafa';
  ctx.fillRect(left + p, top + p, 6 * p, 6 * p); // the clock face
  ctx.fillStyle = '#212121';
  const hand = Math.floor(ticks / 2) % 4; // up, right, down, left
  const [x, y, w, h] = [[3.5, 1.5, 1, 2.5], [4, 3.5, 2.5, 1], [3.5, 4, 1, 2.5], [1.5, 3.5, 2.5, 1]][hand];
  ctx.fillRect(left + x * p, top + y * p, w * p, h * p);
  if (cell && clickerOn({ ticks })) {
    ctx.fillStyle = '#43a047';
    ctx.fillRect(left + 5.5 * p, top + 1.5 * p, p, p);
  }
  drawStubs(ctx, cell?.axis ?? 'h', left, top, size);
}

// =============================================================
// The blocks
// =============================================================

/**
 * Every block in this pack, in the order the palette shows them.
 *   part      a two-ended part: its resistance (how hard it is for current
 *             to get through) and push (a battery's volts)
 *   conducts  a wire: connects on all four sides
 *   bare      draw no square behind it, just the sky (and its drawSignals)
 *   hidden    not in the palette (you get it by flipping a switch)
 * 🧪 Try this! Make the lamp's resistance 2: lamps get dimmer.
 */
const blocks = {
  battery: { title: 'Battery', color: '#d32f2f', part: { resistance: 0.05, push: 1 }, drawSignals: drawBattery },
  wire: { title: 'Wire', color: WIRE_IDLE, conducts: true, bare: true, drawSignals: drawWire },
  switchOpen: {
    title: 'Switch',
    color: '#5d4037',
    electric: true,
    drawSignals: drawSwitch,
    use: (ctx) => setBlock(ctx.world, ctx.x, ctx.y, 'switchClosed'),
  },
  lamp: { title: 'Lamp', color: '#455a64', part: { resistance: 1 }, drawSignals: drawLamp },
  buzzer: { title: 'Buzzer', color: '#546e7a', part: { resistance: 1 }, hums: true, drawSignals: drawBuzzer },
  clicker: { title: 'Clicker', color: '#37474f', part: { resistance: 0.001 }, partWhen: clickerOn, drawSignals: drawClicker },
  switchClosed: {
    title: 'Switch (on)',
    color: '#5d4037',
    part: { resistance: 0.001 },
    closed: true,
    hidden: true,
    drawSignals: drawSwitch,
    use: (ctx) => setBlock(ctx.world, ctx.x, ctx.y, 'switchOpen'),
  },
};

/**
 * What the ❓ guide on the Build page says about this tab: its rules,
 * and what each block in the palette does (and what ✋ USE does to it).
 * tests/guide.test.js checks every palette block is here.
 */
const guide = {
  rules: [
    'Electricity only flows around a complete LOOP: out of the battery\'s + end, through wires and parts, and back into its other end.',
    'Little yellow dots run along the wires while it flows.',
    'Parts turn to face their wires: wires on the left and right, or above and below. The gray metal ends show which way. Lamps side by side between two wires each get their own path, however many there are.',
    'A battery\'s + end is always its top or its right: it can\'t be turned round. Two batteries on opposite sides of a loop push against each other and nothing flows. Put them next to each other in a row instead.',
    'Note blocks need enough electricity to sing. One battery can make 4 in a row sing. With 5 in one loop each gets too little and they stay quiet, even though the dots still crawl. Add a battery, or give each note block its own path side by side.',
    'Short circuit! A battery wired straight back to itself sparks and smokes, however long the wire. A stopped generator is just wire too. Never try that with a real battery.',
  ],
  blocks: {
    battery: { does: 'Pushes electricity out of its + end. Two batteries in a row push twice as hard.' },
    wire: { does: 'Carries electricity. It joins every wire, gold block and part next to it.' },
    switchOpen: { does: 'A gap in the loop you can close. Tipped up = off, flat = on.', use: 'open ↔ closed' },
    lamp: { does: 'Lights up when electricity flows through it. More electricity = brighter.' },
    buzzer: { does: 'Hums while electricity flows through it. More = louder.' },
    clicker: { does: 'A switch that flips itself: on for a second, off for a second. Put note blocks in its loop for music.' },
  },
};

export default {
  tab: { id: 'electric', icon: '⚡', label: 'Power' },
  blocks,
  guide,
  systems: [electricSystem],
  refresh: refreshElectric,
};
