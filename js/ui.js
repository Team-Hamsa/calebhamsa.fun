/**
 * ui.js — two tiny helpers that every page borrows.
 *
 * music.js, draw.js and trace.js all need these small jobs done.
 * Keeping them here means the code is written once instead of
 * copied three times.
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
