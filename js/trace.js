/**
 * trace.js — makes handwriting practice sheets on the guide canvas.
 *
 * A practice sheet looks like school handwriting paper:
 *
 *   ──────────────────────────────────────────  top line (capital letters reach here)
 *   ┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈  dashed middle line (small letters reach here)
 *   Caleb     Caleb      Caleb      (empty)
 *   ──────────────────────────────────────────  baseline (letters sit on it)
 *   dark      lighter    lightest   your turn!
 *
 * Each row repeats the letters, fainter each time ("fade-out"), then
 * leaves an empty space for Caleb to write it by himself.
 *
 * draw.js decides WHEN to draw guides. This file decides WHAT they look
 * like. The DOM is only touched inside setupTraceControls() and
 * waitForFonts(), so tests can import the rest.
 */
import { choose } from './ui.js';

// =============================================================
// Settings to play with
// =============================================================

/**
 * The two handwriting fonts (both free from Google Fonts):
 *   Andika: print letters shaped the way kids learn to read them
 *   Playwrite US Trad: traditional American school cursive, with joined letters
 */
export const FONTS = {
  print: 'Andika, sans-serif',
  cursive: '"Playwrite US Trad", cursive',
};

/**
 * How dark each fading copy is: 1 would be solid, 0 invisible.
 * 🧪 Try this! [0.6, 0.4, 0.2, 0.1] gives four copies before the empty space.
 */
export const FADE_OPACITIES = [0.45, 0.25, 0.12];

/** The longest word the "your word" box accepts. */
export const MAX_WORD_LENGTH = 12;

/** Whose name the CALEB button traces. */
export const NAME = 'Caleb';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LINE_COLOR = '#9a9a9a';
const LETTER_COLOR = '#2b2b2b';

/** Empty space at the left and right ends of each row, in pixels. */
const ROW_PADDING = 24;

/**
 * Where the lines sit inside each row, as a fraction of the row's height.
 * The space below the baseline is room for letters that hang down (g, y, p).
 * 🧪 Try this! Make CAP_FRACTION 0.6 for bigger letters.
 */
const BASELINE_FRACTION = 0.72;
const CAP_FRACTION = 0.5;

// =============================================================
// Pure logic (tests/trace.test.js checks these)
// =============================================================

/**
 * Fresh worksheet settings: print, Caleb's name, capital letters.
 * @returns {{style: string, content: string, letterIndex: number, upper: boolean, word: string}}
 */
export function createTraceSettings() {
  return {
    style: 'print',    // 'print' | 'cursive'
    content: 'name',   // 'name' | 'letter' | 'word'
    letterIndex: 0,    // 0 = A ... 25 = Z
    upper: true,       // capitals (ABC) or lowercase (abc)
    word: '',          // what was typed in the "your word" box
  };
}

/**
 * Clean up what was typed in the "your word" box: only letters and
 * single spaces, at most MAX_WORD_LENGTH characters.
 *
 * Spaces at the start are removed, but one space at the end is kept so
 * you can type "MY DOG" one letter at a time.
 *
 * @param {string} text - what was typed
 * @returns {string} the cleaned-up text
 */
export function sanitizeWord(text) {
  return text
    .replace(/[^A-Za-z ]/g, '')  // drop anything that isn't a letter or space
    .replace(/ +/g, ' ')         // squash runs of spaces into one
    .trimStart()                 // no spaces at the start
    .slice(0, MAX_WORD_LENGTH);
}

/**
 * The text to trace, based on the settings.
 * @param {object} settings - from createTraceSettings()
 * @returns {string} the letters to draw (may be '' for an empty word)
 */
export function traceText(settings) {
  if (settings.content === 'letter') {
    const letter = ALPHABET[settings.letterIndex];
    return settings.upper ? letter : letter.toLowerCase();
  }
  if (settings.content === 'word') {
    return settings.word.trim();
  }
  // The name. Cursive is always written "Caleb": schools don't teach all-capital cursive.
  if (settings.style === 'cursive') return NAME;
  return settings.upper ? NAME.toUpperCase() : NAME;
}

/**
 * Move to the next or previous letter, wrapping from Z back to A.
 * @param {object} settings - from createTraceSettings() (changed in place)
 * @param {number} change - +1 for next, -1 for previous
 * @returns {void}
 */
export function stepLetter(settings, change) {
  settings.letterIndex = (settings.letterIndex + change + ALPHABET.length) % ALPHABET.length;
  settings.content = 'letter';
}

/**
 * Work out how one row fits: how many fading copies, how far apart, and
 * whether the letters must shrink.
 *
 * A row is split into equal "slots" (one copy of the text plus a gap).
 * There must always be room for at least one copy AND one empty slot to
 * write in. If the text is too wide for that, everything shrinks.
 *
 * @param {{textWidth: number, fontSize: number, rowWidth: number, gap: number}} sizes
 *   textWidth: how wide the text is at fontSize; rowWidth: space available; gap: space after each copy
 * @returns {{fontSize: number, slotWidth: number, copies: number}} the plan
 */
export function planRow({ textWidth, fontSize, rowWidth, gap }) {
  let slotWidth = textWidth + gap;
  let scale = 1;
  if (2 * slotWidth > rowWidth) {
    scale = rowWidth / (2 * slotWidth); // shrink so exactly 2 slots fit
    slotWidth *= scale;
  }
  const slots = Math.floor(rowWidth / slotWidth);
  // One slot is kept empty for writing; the rest get copies (up to the number of fade levels).
  const copies = Math.max(1, Math.min(FADE_OPACITIES.length, slots - 1));
  return { fontSize: fontSize * scale, slotWidth, copies };
}

// =============================================================
// Drawing the sheet
// =============================================================

/**
 * Draw the handwriting lines and fading letters onto the guide canvas.
 *
 * Font sizes are worked out by measuring real letters: "H" tells us how
 * tall capitals are and "x" how tall small letters are. The top line goes
 * at capital height and the dashed line at small-letter height, so the
 * lines fit the font exactly.
 *
 * @param {CanvasRenderingContext2D} ctx - the guide canvas's paintbrush
 * @param {number} width - canvas width in CSS pixels
 * @param {number} height - canvas height in CSS pixels
 * @param {object} settings - from createTraceSettings()
 * @returns {void}
 */
export function drawGuides(ctx, width, height, settings) {
  const text = traceText(settings);
  const family = FONTS[settings.style];
  const rows = height >= 600 ? 3 : 2; // 🧪 Try this! Always use 4 rows.
  const rowHeight = height / rows;
  const rowWidth = width - 2 * ROW_PADDING;

  // 1. Choose a font size where capital letters are CAP_FRACTION of the row tall.
  ctx.font = `100px ${family}`;
  const capHeightAt100 = ctx.measureText('H').actualBoundingBoxAscent || 70;
  let fontSize = (100 * rowHeight * CAP_FRACTION) / capHeightAt100;

  // 2. Shrink it if needed so the text fits the row (see planRow).
  ctx.font = `${fontSize}px ${family}`;
  const gap = fontSize * 0.5;
  const plan = planRow({ textWidth: ctx.measureText(text).width, fontSize, rowWidth, gap });
  fontSize = plan.fontSize;
  ctx.font = `${fontSize}px ${family}`;

  // 3. Measure the real letter heights at the final size.
  const capHeight = ctx.measureText('H').actualBoundingBoxAscent || fontSize * 0.7;
  const xHeight = ctx.measureText('x').actualBoundingBoxAscent || fontSize * 0.5;

  // 4. Draw each row: lines first, then the fading copies on top.
  for (let row = 0; row < rows; row++) {
    const baseline = row * rowHeight + rowHeight * BASELINE_FRACTION;
    drawLines(ctx, ROW_PADDING, width - ROW_PADDING, baseline - capHeight, baseline - xHeight, baseline);

    if (!text) continue; // an empty word: just the lines
    ctx.fillStyle = LETTER_COLOR;
    for (let copy = 0; copy < plan.copies; copy++) {
      ctx.globalAlpha = FADE_OPACITIES[copy];
      ctx.fillText(text, ROW_PADDING + copy * plan.slotWidth + 8, baseline);
    }
    ctx.globalAlpha = 1; // back to solid for whatever draws next
  }
}

/**
 * Draw one set of handwriting lines: solid top, dashed middle, solid base.
 * @param {CanvasRenderingContext2D} ctx - the paintbrush
 * @param {number} left - where the lines start
 * @param {number} right - where the lines end
 * @param {number} top - y of the top line
 * @param {number} middle - y of the dashed middle line
 * @param {number} base - y of the baseline
 * @returns {void}
 */
function drawLines(ctx, left, right, top, middle, base) {
  ctx.strokeStyle = LINE_COLOR;
  ctx.lineWidth = 2;

  /**
   * Draw one straight line across the row.
   * @param {number} y - how far down the line goes
   * @returns {void}
   */
  const line = (y) => {
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
  };

  line(top);
  line(base);
  ctx.setLineDash([12, 10]); // 12px of line, 10px of gap, repeating
  line(middle);
  ctx.setLineDash([]);       // back to solid lines
}

/**
 * Wait until both handwriting fonts have downloaded.
 *
 * Web fonts load in the background. If we draw on the canvas before a font
 * arrives, the browser quietly uses a plain font instead, and the canvas
 * never fixes itself (a canvas is just paint, not text). So we wait, then
 * draw again. If the fonts can't load (no internet), the plain fallback
 * fonts still work.
 * @returns {Promise<void>} finishes when the fonts are ready (or failed)
 */
export async function waitForFonts() {
  try {
    await Promise.all([
      document.fonts.load(`64px ${FONTS.print}`),
      document.fonts.load(`64px ${FONTS.cursive}`),
    ]);
  } catch {
    // Fallback fonts are fine.
  }
}

// =============================================================
// Buttons
// =============================================================

/**
 * Connect the tracing buttons. Whenever a setting changes, the buttons
 * update to show it and onChange() is called (draw.js redraws the sheet).
 *
 * @param {object} settings - from createTraceSettings() (changed in place)
 * @param {() => void} onChange - called after every change
 * @returns {void}
 */
export function setupTraceControls(settings, onChange) {
  const byId = (id) => document.getElementById(id);
  const styleButtons = [...document.querySelectorAll('[data-style]')];
  const nameButton = byId('trace-name');
  const letterButton = byId('trace-letter');
  const caseButton = byId('trace-case');
  const wordInput = byId('trace-word');

  /**
   * Make every button show the current settings, then tell draw.js.
   * @returns {void}
   */
  function changed() {
    choose(styleButtons, styleButtons.find((button) => button.dataset.style === settings.style));
    const contentButton = { name: nameButton, letter: letterButton }[settings.content] ?? null;
    choose([nameButton, letterButton], contentButton);
    wordInput.classList.toggle('active', settings.content === 'word');
    letterButton.textContent = traceText({ ...settings, content: 'letter' });
    caseButton.textContent = settings.upper ? 'ABC' : 'abc';
    onChange();
  }

  for (const button of styleButtons) {
    button.addEventListener('click', () => { settings.style = button.dataset.style; changed(); });
  }
  nameButton.addEventListener('click', () => { settings.content = 'name'; changed(); });
  letterButton.addEventListener('click', () => { settings.content = 'letter'; changed(); });
  byId('letter-prev').addEventListener('click', () => { stepLetter(settings, -1); changed(); });
  byId('letter-next').addEventListener('click', () => { stepLetter(settings, +1); changed(); });
  caseButton.addEventListener('click', () => { settings.upper = !settings.upper; changed(); });

  wordInput.addEventListener('input', () => {
    const clean = sanitizeWord(wordInput.value);
    if (clean !== wordInput.value) wordInput.value = clean; // remove what isn't allowed
    settings.word = clean;
    // An empty box goes back to tracing the name.
    settings.content = clean.trim() ? 'word' : 'name';
    changed();
  });

  changed(); // show the starting settings on the buttons
}
