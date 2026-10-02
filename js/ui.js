/**
 * ui.js — small helpers that every page borrows: choosing and flashing
 * buttons, the squares a finger-swipe passes through, and picture filenames.
 *
 * Several pages need these small jobs done. Keeping them here means
 * the code is written once instead of copied onto every page.
 */

/**
 * Remembers the "turn the class off" timers that flash() starts, so a
 * quick second flash can cancel the first one's timer. A WeakMap forgets
 * an element automatically when the element is thrown away.
 */
const flashTimers = new WeakMap();

/**
 * Mark one button in a group as chosen, and all the others as not chosen.
 *
 * We use the `aria-pressed` attribute for this. Screen readers say
 * "pressed" out loud, and blocks.css draws pressed blocks sunken in,
 * so one attribute does both jobs.
 *
 * @param {HTMLElement[]} buttons - every button in the group
 * @param {HTMLElement|null} chosen - the one to mark as pressed (null = none of them)
 * @returns {void}
 */
export function choose(buttons, chosen) {
  for (const button of buttons) {
    button.setAttribute('aria-pressed', String(button === chosen));
  }
}

/**
 * Add a CSS class to an element for a moment, then take it away again.
 * Used to make blocks light up, bounce, or shake.
 *
 * @param {HTMLElement} element - what to flash
 * @param {string} className - the CSS class to add (e.g. 'lit')
 * @param {number} ms - how long to keep it, in milliseconds
 * @returns {void}
 */
export function flash(element, className, ms) {
  const timers = flashTimers.get(element) ?? {};
  clearTimeout(timers[className]);

  element.classList.remove(className);
  // Reading the element's size forces the browser to notice the class came
  // off. Without this, tapping the same block twice quickly would not
  // restart its animation.
  void element.offsetWidth;
  element.classList.add(className);

  timers[className] = setTimeout(() => element.classList.remove(className), ms);
  flashTimers.set(element, timers);
}

// ---- Grid and file helpers (draw.js and build.js use these) ----

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
 * @param {string} [kind] - what the picture is of: 'drawing' or 'build'
 * @returns {string} the filename
 */
export function filenameForDate(date, kind = 'drawing') {
  /**
   * Write a number with at least two digits.
   * @param {number} n - a month or day
   * @returns {string} e.g. 5 → "05", 12 → "12"
   */
  const twoDigits = (n) => String(n).padStart(2, '0');
  const year = date.getFullYear();
  const month = twoDigits(date.getMonth() + 1); // getMonth() counts from 0!
  const day = twoDigits(date.getDate());
  return `caleb-${kind}-${year}-${month}-${day}.png`;
}
