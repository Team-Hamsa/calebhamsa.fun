/**
 * draw.js — the drawing pad, and the boss of the Draw & Trace page.
 *
 * The page has TWO canvases stacked like two sheets of tracing paper:
 *
 *     ┌──────────────┐   ink (top): Caleb draws here. It's see-through
 *     │ ┌──────────────┐  wherever he hasn't drawn yet.
 *     └─│──────────────│
 *       └──────────────┘ guide (bottom): practice letters (drawn by trace.js)
 *
 * Erasing and clearing only touch the ink sheet, so the guide letters
 * never get rubbed out.
 *
 * This file handles brushes, colors, drawing with finger, mouse or pen,
 * hold-to-clear, saving a picture, and switching between DRAW and TRACE.
 * draw.html calls initDraw() once, when the page loads.
 */
import { choose, flash } from './ui.js';
import { createTraceSettings, drawGuides, setupTraceControls, waitForFonts } from './trace.js';

// =============================================================
// Settings to play with
// =============================================================

/**
 * The brushes. `size` is the line thickness in screen pixels. For the
 * block brush, it's the size of each square.
 * 🧪 Try this! Make `big` 60 for a giant marker, or `block` 48 for chunkier pixels.
 */
const BRUSHES = {
  small: { kind: 'round', size: 8 },
  big: { kind: 'round', size: 28 },
  block: { kind: 'block', size: 24 },
  eraser: { kind: 'eraser', size: 40 },
};

/**
 * The color swatches, as "hex" colors: #RRGGBB says how much Red, Green
 * and Blue to mix, from 00 (none) to ff (all of it).
 * 🧪 Try this! Add '#ff69b4' (hot pink). A new swatch appears by itself.
 */
const COLORS = ['#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa', '#6d4c41', '#212121', '#ffffff'];

/**
 * The rainbow brush uses HSL color: Hue, Saturation, Lightness. Hue is
 * an angle around a color wheel:
 *     0 red → 60 yellow → 120 green → 240 blue → 360 back to red
 * Every bit of line turns the wheel by RAINBOW_STEP degrees.
 * 🧪 Try this! 1 for a slow, gentle rainbow; 30 for wild stripes.
 */
const RAINBOW_STEP = 4;

/** How long the clear button must be held down, in milliseconds. */
const CLEAR_HOLD_MS = 1000;

// =============================================================
// What's happening right now ("state")
// =============================================================

/** Everything the page needs to remember. */
const state = {
  mode: 'draw',      // 'draw' | 'trace'
  brush: 'big',      // one of the BRUSHES
  color: '#1e88e5',  // the chosen swatch (blue to start)
  rainbow: false,    // true when the 🌈 swatch is chosen
  hue: 0,            // where the rainbow brush is on the color wheel
};

/**
 * The fingers (or mice, or pens) drawing right now, and where each one
 * was a moment ago. Key = the pointer's id number; value = { x, y }.
 * Every finger gets its own entry, so two fingers draw two separate
 * lines instead of one line zig-zagging between them.
 */
const activeStrokes = new Map();

let guideCanvas;
let inkCanvas;
let guideCtx;   // "context": the paintbrush for a canvas
let inkCtx;

/** The canvases' size in screen ("CSS") pixels. */
let cssWidth = 0;
let cssHeight = 0;

let modeButtons = [];
let brushButtons = [];

/** The tracing worksheet settings, shared with trace.js. */
let traceSettings = null;

/**
 * Shortcut for finding an element by its id="...".
 * @param {string} id - the element's id
 * @returns {HTMLElement} the element
 */
const byId = (id) => document.getElementById(id);

// =============================================================
// Pure math (no screen needed, so tests/draw.test.js checks it)
// =============================================================

/**
 * Which grid squares a line passes through, for the block brush.
 *
 * Fingers move fast. Between two moments a finger might jump 100 pixels,
 * which would leave gaps. So we take little steps along the line (half a
 * square at a time) and collect every square we land in, without repeats.
 *
 * @param {number} x0 - where the line starts (pixels from the left)
 * @param {number} y0 - where the line starts (pixels from the top)
 * @param {number} x1 - where the line ends
 * @param {number} y1 - where the line ends
 * @param {number} cell - the size of one square, in pixels
 * @returns {Array<[number, number]>} [column, row] of each square, in order
 */
export function cellsAlongLine(x0, y0, x1, y1, cell) {
  const distance = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(distance / (cell / 2)));
  const seen = new Set();
  const cells = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps; // 0 at the start, 1 at the end
    const col = Math.floor((x0 + (x1 - x0) * t) / cell);
    const row = Math.floor((y0 + (y1 - y0) * t) / cell);
    const key = `${col},${row}`;
    if (!seen.has(key)) {
      seen.add(key);
      cells.push([col, row]);
    }
  }
  return cells;
}

/**
 * The filename for a saved picture, like "caleb-drawing-2026-10-02.png".
 * @param {Date} date - when it was saved
 * @returns {string} the filename
 */
export function filenameForDate(date) {
  /**
   * Write a number with at least two digits.
   * @param {number} n - a month or day
   * @returns {string} e.g. 5 → "05", 12 → "12"
   */
  const twoDigits = (n) => String(n).padStart(2, '0');
  const year = date.getFullYear();
  const month = twoDigits(date.getMonth() + 1); // getMonth() counts from 0!
  const day = twoDigits(date.getDate());
  return `caleb-drawing-${year}-${month}-${day}.png`;
}

// =============================================================
// Starting up
// =============================================================

/**
 * Set up the whole page. draw.html calls this once.
 * @returns {Promise<void>} finishes once the handwriting fonts are ready
 */
export async function initDraw() {
  guideCanvas = byId('guide');
  inkCanvas = byId('ink');
  guideCtx = guideCanvas.getContext('2d');
  inkCtx = inkCanvas.getContext('2d');

  buildSwatches();
  setupBrushes();
  setupModes();
  setupClear();
  byId('save').addEventListener('click', saveDrawing);
  setupPointer();

  // Any change to the worksheet gives a fresh sheet: clear the ink, redraw the guide.
  traceSettings = createTraceSettings();
  setupTraceControls(traceSettings, () => {
    clearInk();
    redrawGuides();
  });

  // Keep the canvases the same size as their box, even when the window
  // changes size or a tablet turns sideways. A ResizeObserver calls
  // resizeCanvases() once right away, then after every size change.
  new ResizeObserver(resizeCanvases).observe(inkCanvas.parentElement);

  const startMode = new URLSearchParams(window.location.search).get('mode') === 'trace' ? 'trace' : 'draw';
  setMode(startMode);

  // The handwriting fonts may still be downloading. Draw the guides again
  // once they arrive (see waitForFonts in trace.js).
  await waitForFonts();
  redrawGuides();
}

/**
 * Make the color swatches, plus the 🌈 rainbow one.
 * @returns {void}
 */
function buildSwatches() {
  const holder = byId('swatches');
  const swatches = [];

  /**
   * Make one swatch button.
   * @param {string} label - what a screen reader says
   * @param {() => void} onPick - what happens when it's tapped
   * @returns {HTMLButtonElement} the button
   */
  function makeSwatch(label, onPick) {
    const swatch = document.createElement('button');
    swatch.className = 'block swatch';
    swatch.setAttribute('aria-label', label);
    swatch.addEventListener('click', () => {
      onPick();
      choose(swatches, swatch);
      // Picking a color while the eraser is on probably means "draw now!"
      if (state.brush === 'eraser') selectBrush('big');
    });
    swatches.push(swatch);
    return swatch;
  }

  for (const color of COLORS) {
    const swatch = makeSwatch(`color ${color}`, () => {
      state.color = color;
      state.rainbow = false;
    });
    swatch.style.setProperty('--face', color); // blocks.css paints the block with --face
  }
  const rainbow = makeSwatch('rainbow', () => { state.rainbow = true; });
  rainbow.classList.add('rainbow');
  rainbow.textContent = '🌈';

  holder.append(...swatches);
  choose(swatches, swatches[COLORS.indexOf(state.color)]);
}

/**
 * Connect the brush buttons.
 * @returns {void}
 */
function setupBrushes() {
  brushButtons = [...document.querySelectorAll('[data-brush]')];
  for (const button of brushButtons) {
    button.addEventListener('click', () => selectBrush(button.dataset.brush));
  }
}

/**
 * Switch to a brush and show it as chosen.
 * @param {string} name - one of the BRUSHES
 * @returns {void}
 */
function selectBrush(name) {
  state.brush = name;
  choose(brushButtons, brushButtons.find((button) => button.dataset.brush === name));
}

/**
 * Connect the DRAW / TRACE buttons.
 * @returns {void}
 */
function setupModes() {
  modeButtons = [...document.querySelectorAll('[data-mode]')];
  for (const button of modeButtons) {
    button.addEventListener('click', () => setMode(button.dataset.mode));
  }
}

/**
 * Switch between DRAW and TRACE. Going into TRACE starts a fresh sheet.
 * @param {string} mode - 'draw' or 'trace'
 * @returns {void}
 */
function setMode(mode) {
  state.mode = mode;
  choose(modeButtons, modeButtons.find((button) => button.dataset.mode === mode));
  byId('trace-tools').hidden = mode !== 'trace';
  if (mode === 'trace') clearInk();
  redrawGuides();
}

// =============================================================
// Canvas size
// =============================================================

/**
 * Make both canvases match their box on the screen, keeping the drawing.
 *
 * Phone and tablet screens pack 2 or 3 real dots into every "CSS pixel"
 * (that number is window.devicePixelRatio). A canvas with only one dot
 * per CSS pixel would look blurry, so we make the canvas that many times
 * bigger inside, then tell its paintbrush to scale up by the same amount.
 * That way the rest of the code can keep using normal CSS pixels.
 * @returns {void}
 */
function resizeCanvases() {
  // Measure the canvas itself, not its box: the box includes the brown
  // border, and a canvas sized for the border would put ink a little
  // away from the finger.
  const box = inkCanvas.getBoundingClientRect();
  const newWidth = Math.round(box.width);
  const newHeight = Math.round(box.height);
  if (newWidth === cssWidth && newHeight === cssHeight) return; // nothing changed
  const dpr = window.devicePixelRatio || 1;

  // Changing a canvas's size wipes it, so copy the drawing first...
  const copy = document.createElement('canvas');
  copy.width = inkCanvas.width;
  copy.height = inkCanvas.height;
  if (copy.width > 0 && copy.height > 0) copy.getContext('2d').drawImage(inkCanvas, 0, 0);
  const oldWidth = cssWidth;
  const oldHeight = cssHeight;

  for (const canvas of [guideCanvas, inkCanvas]) {
    canvas.width = newWidth * dpr;
    canvas.height = newHeight * dpr;
    canvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  cssWidth = newWidth;
  cssHeight = newHeight;

  // ...then paste it back in, the same size as before.
  if (oldWidth > 0 && oldHeight > 0) inkCtx.drawImage(copy, 0, 0, oldWidth, oldHeight);

  // The guide is simply drawn again to fit the new size.
  redrawGuides();
}

// =============================================================
// Drawing
// =============================================================

/**
 * Listen to fingers, mice and pens on the ink canvas.
 *
 * "Pointer events" treat all three the same way, so one set of code works
 * everywhere:
 *   pointerdown: touched the screen    pointermove: moving
 *   pointerup:   lifted off            pointercancel: the browser took over
 * @returns {void}
 */
function setupPointer() {
  inkCanvas.addEventListener('pointerdown', (event) => {
    // "Capture" means: keep sending this finger's moves to the canvas even
    // if it slides off the edge. It's a nice extra, so if the browser says
    // no (the finger already lifted, say), we keep drawing anyway.
    try {
      inkCanvas.setPointerCapture(event.pointerId);
    } catch {
      // Drawing still works without capture.
    }
    const point = pointFrom(event);
    activeStrokes.set(event.pointerId, point);
    paint(point, point); // a single tap makes a dot
  });

  inkCanvas.addEventListener('pointermove', (event) => {
    const last = activeStrokes.get(event.pointerId);
    if (!last) return; // this pointer isn't touching (a mouse just hovering)
    const point = pointFrom(event);
    paint(last, point);
    activeStrokes.set(event.pointerId, point);
  });

  for (const type of ['pointerup', 'pointercancel']) {
    inkCanvas.addEventListener(type, (event) => activeStrokes.delete(event.pointerId));
  }
}

/**
 * Where a pointer is, measured from the canvas's top-left corner.
 * @param {PointerEvent} event - the pointer event
 * @returns {{x: number, y: number}} the position in CSS pixels
 */
function pointFrom(event) {
  const box = inkCanvas.getBoundingClientRect();
  return { x: event.clientX - box.left, y: event.clientY - box.top };
}

/**
 * Paint from one point to another with the current brush.
 * @param {{x: number, y: number}} from - where the finger was
 * @param {{x: number, y: number}} to - where the finger is now
 * @returns {void}
 */
function paint(from, to) {
  const brush = BRUSHES[state.brush];
  const color = currentColor();

  // 'destination-out' means "rub out whatever is here", which makes an
  // eraser. 'source-over' is normal painting, on top of what's there.
  inkCtx.globalCompositeOperation = brush.kind === 'eraser' ? 'destination-out' : 'source-over';
  inkCtx.fillStyle = color;
  inkCtx.strokeStyle = color;

  if (brush.kind === 'block') {
    for (const [col, row] of cellsAlongLine(from.x, from.y, to.x, to.y, brush.size)) {
      inkCtx.fillRect(col * brush.size, row * brush.size, brush.size, brush.size);
    }
    return;
  }

  if (from.x === to.x && from.y === to.y) {
    // A line with no length draws nothing, so a tap gets a round dot instead.
    inkCtx.beginPath();
    inkCtx.arc(to.x, to.y, brush.size / 2, 0, Math.PI * 2);
    inkCtx.fill();
    return;
  }

  inkCtx.lineWidth = brush.size;
  inkCtx.lineCap = 'round';   // round ends...
  inkCtx.lineJoin = 'round';  // ...and round corners, like a marker
  inkCtx.beginPath();
  inkCtx.moveTo(from.x, from.y);
  inkCtx.lineTo(to.x, to.y);
  inkCtx.stroke();
}

/**
 * The color to paint with right now. The rainbow brush turns the color
 * wheel a little every time it's asked.
 * @returns {string} a CSS color
 */
function currentColor() {
  if (!state.rainbow) return state.color;
  state.hue = (state.hue + RAINBOW_STEP) % 360; // % 360 wraps back around to red
  return `hsl(${state.hue}, 90%, 55%)`;
}

// =============================================================
// Clearing and saving
// =============================================================

/**
 * Wipe one whole canvas clean.
 * @param {CanvasRenderingContext2D} context - the canvas's paintbrush
 * @returns {void}
 */
function clearCanvas(context) {
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0); // forget the scaling, to wipe every real dot
  context.clearRect(0, 0, context.canvas.width, context.canvas.height);
  context.restore();
}

/**
 * Wipe Caleb's drawing (the guide letters stay).
 * @returns {void}
 */
function clearInk() {
  clearCanvas(inkCtx);
}

/**
 * Draw the guide sheet again: practice letters in TRACE mode, blank in DRAW mode.
 * @returns {void}
 */
function redrawGuides() {
  clearCanvas(guideCtx);
  if (state.mode !== 'trace' || cssWidth === 0) return; // not tracing, or not sized yet
  drawGuides(guideCtx, cssWidth, cssHeight, traceSettings);
}

/**
 * Hold-to-clear: the drawing is only wiped if the button is held for
 * CLEAR_HOLD_MS. Lifting early cancels, so a bump can't erase a masterpiece.
 * @returns {void}
 */
function setupClear() {
  const button = byId('clear');
  let timer = null;

  /**
   * A finger pressed the clear button: start filling it up and start the countdown.
   * @param {PointerEvent} event - the press
   * @returns {void}
   */
  const startHolding = (event) => {
    event.preventDefault();
    button.classList.add('holding'); // blocks.css fills the button while holding
    timer = setTimeout(() => {
      clearInk();
      button.classList.remove('holding');
      flash(inkCanvas.parentElement, 'wiped', 400);
      timer = null;
    }, CLEAR_HOLD_MS);
  };
  /**
   * The finger let go (or slid off) too early: cancel the countdown.
   * @returns {void}
   */
  const stopHolding = () => {
    clearTimeout(timer);
    timer = null;
    button.classList.remove('holding');
  };

  button.addEventListener('pointerdown', startHolding);
  for (const type of ['pointerup', 'pointerleave', 'pointercancel']) {
    button.addEventListener(type, stopHolding);
  }
  // On phones, a long press opens a menu. Stop that.
  button.addEventListener('contextmenu', (event) => event.preventDefault());
}

/**
 * Save the picture as a PNG file: white paper, then the guide, then the ink.
 * @returns {void}
 */
function saveDrawing() {
  const picture = document.createElement('canvas');
  picture.width = inkCanvas.width;
  picture.height = inkCanvas.height;
  const context = picture.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, picture.width, picture.height);
  context.drawImage(guideCanvas, 0, 0);
  context.drawImage(inkCanvas, 0, 0);

  // A pretend link with a "download" name. Clicking it saves the file.
  const link = document.createElement('a');
  link.download = filenameForDate(new Date());
  link.href = picture.toDataURL('image/png');
  link.click();
}
