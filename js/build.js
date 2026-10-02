/**
 * build.js — makes the Build page work.
 *
 * It draws the world on the canvas, listens for fingers, and runs the
 * three tools:
 *   🧱 BUILD  tap or drag to put the chosen block down
 *   ⛏️ DIG    tap or drag to take blocks away
 *   ✋ USE    tap a block to make it do its thing (note blocks sing!)
 *
 * A clock "ticks" several times a second. Each tick, every block pack's
 * rules (like "sand falls") get a turn, and the world is redrawn if
 * anything moved. build.html calls initBuild() once.
 */
import { AIR, defaultWorld, getBlock, setBlock, tick } from './world.js';
import { AIR_INFO, PACKS, allSystems, blockInfo, blocksInPack } from './blocks/registry.js';
import { drawBlock, drawWorld } from './block-art.js';
import { listenForUnlock, playTones } from './sound.js';
import { cellsAlongLine, choose, flash } from './ui.js';

// =============================================================
// Settings to play with
// =============================================================

/**
 * How many times a second the world's clock ticks.
 * 🧪 Try this! 2 for slow-motion sand, 20 for super-fast sand.
 */
const TICKS_PER_SECOND = 8;

/** How long a note block stays lit after it sings, in milliseconds. */
const LIGHT_MS = 300;

/** How big the blocks in the palette are, in CSS pixels. */
const SWATCH_PX = 40;

/** The world canvas's border width (blocks.css #world), in CSS pixels. */
const WORLD_BORDER_PX = 6;

// =============================================================
// What's happening right now ("state")
// =============================================================

/** Everything the page needs to remember. */
const state = {
  world: defaultWorld(),
  tool: 'build',             // 'build' | 'dig' | 'use'
  tab: PACKS[0].tab.id,      // which palette tab is showing
  selected: 'grass',         // the block BUILD puts down
  cell: 0,                   // how big one block is on screen, in CSS pixels
};

/** The rules that run every tick, from every pack, in order. */
const SYSTEMS = allSystems();

/**
 * The one finger building right now: { id, x, y }, or null.
 * Only ONE finger builds at a time, so a palm resting on the iPad
 * doesn't scribble blocks everywhere.
 */
let pointer = null;

let canvas;
let ctx;          // "context": the paintbrush for the canvas
let frame;        // the box around the canvas
let toolButtons = [];
let tabButtons = [];
let paletteButtons = [];
let tickTimer = null;

/**
 * Shortcut for finding an element by its id="...".
 * @param {string} id - the element's id
 * @returns {HTMLElement} the element
 */
const byId = (id) => document.getElementById(id);

// =============================================================
// Pure helpers (no screen needed, so tests/build.test.js checks them)
// =============================================================

/**
 * How big each block can be so the whole world fits in the box.
 * Blocks stay square, and whole pixels keep their edges crisp.
 * @param {number} boxWidth - the space we have, in CSS pixels
 * @param {number} boxHeight - the space we have, in CSS pixels
 * @param {number} columns - how many blocks across
 * @param {number} rows - how many blocks down
 * @returns {number} the block size in whole pixels (at least 1)
 */
export function fitCellSize(boxWidth, boxHeight, columns, rows) {
  return Math.max(1, Math.floor(Math.min(boxWidth / columns, boxHeight / rows)));
}

/**
 * Do what BUILD or DIG does to one cell. (USE is handled by useBlockAt,
 * because it makes sounds instead of changing the world.)
 * @param {{width: number, height: number, cells: string[]}} world - the world
 * @param {string} tool - 'build', 'dig' or 'use'
 * @param {number} x - column
 * @param {number} y - row
 * @param {string} selected - the block BUILD puts down
 * @returns {boolean} true if the world changed
 */
export function applyTool(world, tool, x, y, selected) {
  if (tool === 'build') return setBlock(world, x, y, selected);
  if (tool === 'dig') return setBlock(world, x, y, AIR);
  return false;
}

// =============================================================
// Starting up
// =============================================================

/**
 * Set up the whole page. build.html calls this once.
 * @returns {void}
 */
export function initBuild() {
  canvas = byId('world');
  ctx = canvas.getContext('2d');
  frame = byId('world-frame');

  setupTools();
  buildTabs();
  showTab(state.tab);
  setupPointer();
  listenForUnlock();

  // Keep the world as big as fits, even when the iPad turns sideways.
  // ResizeObserver calls resizeCanvas() once right away, then after every change.
  new ResizeObserver(resizeCanvas).observe(frame);

  // The pixel font may still be downloading. Once it's here, redraw so
  // note-block letters use it.
  document.fonts?.ready.then(() => {
    draw();
    showTab(state.tab);
  });

  startTicking();
  // Don't tick while the page is hidden (the iPad is asleep): saves battery.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopTicking();
    else startTicking();
  });
}

// =============================================================
// Tools, tabs and the palette
// =============================================================

/**
 * Connect the BUILD / DIG / USE buttons.
 * @returns {void}
 */
function setupTools() {
  toolButtons = [...document.querySelectorAll('[data-tool]')];
  for (const button of toolButtons) {
    button.addEventListener('click', () => setTool(button.dataset.tool));
  }
}

/**
 * Pick a tool.
 * @param {string} tool - 'build', 'dig' or 'use'
 * @returns {void}
 */
function setTool(tool) {
  state.tool = tool;
  choose(toolButtons, toolButtons.find((button) => button.dataset.tool === tool) ?? null);
}

/**
 * Make one tab button per block pack.
 * @returns {void}
 */
function buildTabs() {
  const holder = byId('tabs');
  tabButtons = PACKS.map((pack) => {
    const button = document.createElement('button');
    button.className = 'block';
    button.dataset.tab = pack.tab.id;
    button.textContent = `${pack.tab.icon} ${pack.tab.label.toUpperCase()}`;
    button.addEventListener('click', () => showTab(pack.tab.id));
    holder.append(button);
    return button;
  });
}

/**
 * Show one tab's blocks in the palette.
 * @param {string} id - the pack's tab id
 * @returns {void}
 */
function showTab(id) {
  state.tab = id;
  choose(tabButtons, tabButtons.find((button) => button.dataset.tab === id) ?? null);
  byId('palette').replaceChildren();
  paletteButtons = blocksInPack(id).map(makeSwatch);
  choose(paletteButtons, paletteButtons.find((button) => button.dataset.block === state.selected) ?? null);
}

/**
 * Make one palette button, with the block drawn on a tiny canvas.
 * @param {string} name - the block's name
 * @returns {HTMLButtonElement} the button (already in the palette)
 */
function makeSwatch(name) {
  const info = blockInfo(name);
  const button = document.createElement('button');
  button.className = 'block';
  button.dataset.block = name;
  button.setAttribute('aria-label', info.title);
  button.setAttribute('aria-pressed', 'false');

  const swatch = document.createElement('canvas');
  const ratio = window.devicePixelRatio || 1;
  swatch.width = SWATCH_PX * ratio;
  swatch.height = SWATCH_PX * ratio;
  const swatchCtx = swatch.getContext('2d');
  swatchCtx.scale(ratio, ratio);
  swatchCtx.fillStyle = AIR_INFO.color; // sky behind see-through blocks
  swatchCtx.fillRect(0, 0, SWATCH_PX, SWATCH_PX);
  drawBlock(swatchCtx, info, 0, 0, SWATCH_PX);

  button.append(swatch);
  button.addEventListener('click', () => selectBlock(name));
  byId('palette').append(button);
  return button;
}

/**
 * Choose the block BUILD puts down. Choosing a block also switches to BUILD.
 * @param {string} name - the block's name
 * @returns {void}
 */
function selectBlock(name) {
  state.selected = name;
  choose(paletteButtons, paletteButtons.find((button) => button.dataset.block === name) ?? null);
  setTool('build');
}

// =============================================================
// Drawing
// =============================================================

/**
 * Make the canvas as big as fits in its box, with square blocks, sharp
 * on Retina screens.
 * @returns {void}
 */
function resizeCanvas() {
  const border = WORLD_BORDER_PX * 2;
  const cell = fitCellSize(frame.clientWidth - border, frame.clientHeight - border, state.world.width, state.world.height);
  if (cell === state.cell) return;
  state.cell = cell;

  // A Retina screen has 2 (or 3) real pixels per CSS pixel. Give the canvas
  // that many real pixels so blocks aren't blurry, and scale the paintbrush to match.
  const ratio = window.devicePixelRatio || 1;
  const width = cell * state.world.width;
  const height = cell * state.world.height;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  draw();
}

/**
 * Redraw the whole world.
 * @returns {void}
 */
function draw() {
  if (!state.cell) return; // not sized yet
  drawWorld(ctx, state.world, state.cell, blockInfo, AIR_INFO.color);
}

/**
 * Light up one cell for a moment (a note block singing).
 * @param {number} x - column
 * @param {number} y - row
 * @returns {void}
 */
function flashCell(x, y) {
  draw();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.fillRect(x * state.cell, y * state.cell, state.cell, state.cell);
  setTimeout(draw, LIGHT_MS);
}

/**
 * Something changed the world: redraw it.
 * @returns {void}
 */
function worldChanged() {
  draw();
}

// =============================================================
// Fingers
// =============================================================

/**
 * Listen for fingers (or a mouse, or a pen) on the world.
 *   pointerdown: touched     pointermove: slid
 *   pointerup:   lifted off  pointercancel: the browser took over
 * @returns {void}
 */
function setupPointer() {
  canvas.addEventListener('pointerdown', (event) => {
    if (pointer) return; // another finger is already building
    try {
      canvas.setPointerCapture(event.pointerId); // keep getting moves if it slides off the edge
    } catch {
      // Building still works without capture.
    }
    const point = pointFrom(event);
    pointer = { id: event.pointerId, ...point };
    if (state.tool === 'use') useBlockAt(point);
    else paintLine(point, point); // a single tap does one cell
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!pointer || event.pointerId !== pointer.id || state.tool === 'use') return;
    const point = pointFrom(event);
    paintLine(pointer, point);
    pointer = { id: pointer.id, ...point };
  });

  for (const type of ['pointerup', 'pointercancel']) {
    canvas.addEventListener(type, (event) => {
      if (pointer?.id === event.pointerId) pointer = null;
    });
  }
}

/**
 * Where a pointer is, measured from the top-left corner of the world
 * (inside the canvas's border).
 * @param {PointerEvent} event - the pointer event
 * @returns {{x: number, y: number}} the position in CSS pixels
 */
function pointFrom(event) {
  const box = canvas.getBoundingClientRect();
  return { x: event.clientX - box.left - canvas.clientLeft, y: event.clientY - box.top - canvas.clientTop };
}

/**
 * BUILD or DIG every cell along a finger's path, so fast swipes leave no gaps.
 * @param {{x: number, y: number}} from - where the finger was
 * @param {{x: number, y: number}} to - where the finger is now
 * @returns {void}
 */
function paintLine(from, to) {
  let changed = false;
  for (const [x, y] of cellsAlongLine(from.x, from.y, to.x, to.y, state.cell)) {
    changed = applyTool(state.world, state.tool, x, y, state.selected) || changed;
  }
  if (changed) worldChanged();
}

/**
 * ✋ USE: make the block under the finger do its thing. Blocks that
 * don't do anything give a little "nope" shake.
 * @param {{x: number, y: number}} point - where the finger is, in CSS pixels
 * @returns {void}
 */
function useBlockAt(point) {
  const x = Math.floor(point.x / state.cell);
  const y = Math.floor(point.y / state.cell);
  const info = blockInfo(getBlock(state.world, x, y));
  if (!info?.use) {
    flash(frame, 'nope', 400);
    return;
  }
  info.use({
    world: state.world,
    x,
    y,
    playNote: (midi) => playTones([midi]),
    flash: () => flashCell(x, y),
  });
}

// =============================================================
// The clock
// =============================================================

/**
 * Start the world's clock (if it isn't already running).
 * @returns {void}
 */
function startTicking() {
  if (tickTimer) return;
  tickTimer = setInterval(() => {
    if (tick(state.world, SYSTEMS, blockInfo)) worldChanged();
  }, 1000 / TICKS_PER_SECOND);
}

/**
 * Stop the world's clock.
 * @returns {void}
 */
function stopTicking() {
  clearInterval(tickTimer);
  tickTimer = null;
}
