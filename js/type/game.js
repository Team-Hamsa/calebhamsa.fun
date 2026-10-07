/**
 * game.js — makes the typing page (type.html) work.
 *
 * The rules live in wall.js, the letters and fingers in levels.js, and
 * the saved stars in progress.js. This file is the part that touches the
 * web page: it draws the level strip, the wall, the keyboard and the
 * hands, listens for key presses, and plays the sounds.
 */
import { LEVELS, KEYBOARD_ROWS, FINGERS, FINGER_COLORS } from './levels.js';
import { newGame, pressKey, isLetterKey, isBlockedKey, STARS_PER_LEVEL } from './wall.js';
import { loadProgress, saveProgress, addStar, isUnlocked, highestUnlocked, loadMuted, saveMuted } from './progress.js';
import { listenForUnlock, playTones, VOICES } from '../sound.js';
import { flash } from '../ui.js';

/**
 * The sounds, as MIDI note numbers (60 is middle C).
 * 🧪 Try this! Make POP_NOTES [96] for a tiny "tink", or CHEER_NOTES [60, 63, 67] for a sad-sounding chord.
 */
const POP_NOTES = [84];
const BONK_NOTES = [43];
const CHEER_NOTES = [60, 64, 67, 72];
const LEVEL_CHEER_NOTES = [60, 64, 67, 72, 76, 79];

/** How long the cleared wall stays on screen before the new one, in milliseconds. */
const NEW_WALL_DELAY_MS = 700;

/** The order fingers are drawn on each hand, left to right, as you look at your hands. */
const HAND_FINGERS = {
  left: ['pinky', 'ring', 'middle', 'pointer', 'thumb'],
  right: ['thumb', 'pointer', 'middle', 'ring', 'pinky'],
};

/** Everything the page is doing right now. */
const page = {
  progress: { stars: [] },
  game: null,
  started: false, // has the "press a key to start" sign been closed?
  waiting: false, // is a cleared wall still showing (keys wait for the new one)?
  newWallTimer: 0, // the countdown to the new wall, so a level change can cancel it
  muted: false, // 🔇: no sounds and no talking
};

/**
 * Find an element by its id="…".
 * @param {string} id - the id
 * @returns {HTMLElement} the element
 */
function byId(id) {
  return document.getElementById(id);
}

/**
 * localStorage, or null if the browser doesn't allow it.
 * @returns {Storage|null} the storage
 */
function storage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Say something out loud (if this browser can).
 * @param {string} text - what to say, like 'F'
 * @returns {void}
 */
function speak(text) {
  if (page.muted) return;
  try {
    speechSynthesis.cancel();
    const words = new SpeechSynthesisUtterance(text);
    words.rate = 0.9;
    speechSynthesis.speak(words);
  } catch {
    // No voice here: the glowing key still shows the way.
  }
}

/**
 * Play some notes, unless the sound is off.
 * @param {number[]} midis - the notes, as MIDI numbers
 * @param {{wave: string, volume: number}} voice - one of the VOICES
 * @returns {void}
 */
function beep(midis, voice) {
  if (!page.muted) playTones(midis, voice);
}

/**
 * The 🔊 button: turn all the sounds and talking off, or back on.
 * @param {MouseEvent} event - the tap
 * @returns {void}
 */
function toggleMute(event) {
  event.currentTarget.blur(); // so the space bar can't flip it again
  page.muted = !page.muted;
  saveMuted(storage(), page.muted);
  showMute();
  if (page.muted) {
    try {
      speechSynthesis.cancel(); // stop a letter halfway through
    } catch {
      // No voice here anyway.
    }
  } else if (page.started) {
    speak(currentLetter());
  }
}

/**
 * Show 🔊 or 🔇 on the mute button.
 * @returns {void}
 */
function showMute() {
  const button = byId('mute');
  button.textContent = page.muted ? '🔇' : '🔊';
  button.setAttribute('aria-pressed', String(page.muted));
  button.setAttribute('aria-label', page.muted ? 'Sound is off' : 'Sound is on');
}

/**
 * Set up the whole page. type.html calls this once.
 * @returns {void}
 */
export function initType() {
  page.progress = loadProgress(storage());
  page.muted = loadMuted(storage());
  showMute();
  byId('mute').addEventListener('click', toggleMute);
  buildKeyboard();
  buildHands();
  startLevel(highestUnlocked(page.progress));
  listenForUnlock();
  document.addEventListener('keydown', onKeyDown);
  byId('start').addEventListener('click', start);
}

/**
 * Close the "press a key to start" sign and say the first letter.
 * This happens inside a tap or key press, which is when iPads allow sound.
 * @returns {void}
 */
function start() {
  page.started = true;
  byId('start').hidden = true;
  speak(currentLetter());
}

/**
 * The letter on the glowing block.
 * @returns {string} like 'F'
 */
function currentLetter() {
  return page.game.letters[page.game.index];
}

/**
 * Play a level from its first wall.
 * @param {number} level - the level number, starting at 1
 * @returns {void}
 */
function startLevel(level) {
  // A wall that was just cleared may still be counting down to its new
  // wall. Cancel that, or it would redraw this level's wall a moment later.
  clearTimeout(page.newWallTimer);
  page.game = newGame(level, page.progress.stars[level - 1]);
  page.waiting = false;
  drawLevels();
  drawWall();
  if (page.started) speak(currentLetter());
}

// ---- Key presses ----

/**
 * A key went down somewhere on the page.
 * @param {KeyboardEvent} event - the key press
 * @returns {void}
 */
function onKeyDown(event) {
  if (!page.started) {
    // Any ordinary key closes the start sign (but doesn't count as a guess).
    if (!event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey) start();
    return;
  }
  // Space and arrows would scroll the wall away; Tab and Enter could press a button.
  if (isBlockedKey(event)) event.preventDefault();
  if (!isLetterKey(event) || page.waiting) return;
  event.preventDefault();

  const target = currentLetter();
  const { state, result } = pressKey(page.game, event.key);
  const block = byId('wall').children[page.game.index];

  if (result === 'miss') {
    flash(block, 'shake', 400);
    flash(keyFor(event.key.toUpperCase()), 'wrong', 500);
    beep(BONK_NOTES, VOICES.soft);
    speak(target);
    return;
  }

  block.classList.add('broken');
  beep(POP_NOTES, VOICES.bell);
  page.game = state;

  if (result === 'hit') {
    showTarget();
    speak(currentLetter());
    return;
  }

  // The wall is clear: a star, a cheer, then a new wall.
  page.progress = addStar(page.progress, state.level);
  saveProgress(storage(), page.progress);
  beep(result === 'levelDone' ? LEVEL_CHEER_NOTES : CHEER_NOTES, VOICES.bell);
  drawLevels();
  flash(byId('levels').children[state.level - 1], 'cheer', 600);
  page.waiting = true;
  page.newWallTimer = setTimeout(() => {
    page.waiting = false;
    drawWall();
    speak(currentLetter());
  }, NEW_WALL_DELAY_MS);
}

// ---- Drawing ----

/**
 * Draw the strip of level blocks: stone 🪨 if locked, grass if open,
 * with the stars each level has earned.
 * @returns {void}
 */
function drawLevels() {
  const strip = byId('levels');
  strip.replaceChildren(...LEVELS.map((keys, i) => {
    const level = i + 1;
    const button = document.createElement('button');
    const open = isUnlocked(page.progress, level);
    button.className = open ? 'block grass level' : 'block level';
    button.disabled = !open;
    button.setAttribute('aria-pressed', String(level === page.game.level));
    button.setAttribute('aria-label', `Level ${level}`);
    const stars = page.progress.stars[i];
    button.innerHTML = open
      ? `<span>${keys.join('')}</span><span class="stars">${'⭐'.repeat(stars)}${'·'.repeat(STARS_PER_LEVEL - stars)}</span>`
      : '🪨';
    button.addEventListener('click', () => {
      button.blur(); // so Enter or Space can't press it again by accident
      startLevel(level);
    });
    return button;
  }));
}

/**
 * Draw the wall of letter blocks for the current game.
 * @returns {void}
 */
function drawWall() {
  byId('wall').replaceChildren(...page.game.letters.map((letter) => {
    const block = document.createElement('div');
    block.className = 'wall-block';
    block.textContent = letter;
    return block;
  }));
  showTarget();
}

/**
 * Light up the block Caleb is on, its key, and the finger that presses it.
 * @returns {void}
 */
function showTarget() {
  const letter = currentLetter();
  [...byId('wall').children].forEach((block, i) => block.classList.toggle('target', i === page.game.index));
  for (const key of document.querySelectorAll('.key')) key.classList.toggle('target', key.dataset.key === letter);
  const { hand, finger } = FINGERS[letter];
  for (const element of document.querySelectorAll('.finger')) {
    element.classList.toggle('target', element.dataset.hand === hand && element.dataset.finger === finger);
  }
}

/**
 * The drawn key for a letter.
 * @param {string} letter - like 'F'
 * @returns {HTMLElement} the key
 */
function keyFor(letter) {
  return document.querySelector(`.key[data-key="${letter}"]`);
}

/**
 * Draw the keyboard: three rows of letter keys, each tinted with its finger's color.
 * @returns {void}
 */
function buildKeyboard() {
  byId('keyboard').replaceChildren(...KEYBOARD_ROWS.map((row) => {
    const line = document.createElement('div');
    line.className = 'key-row';
    for (const letter of row) {
      const key = document.createElement('div');
      key.className = letter === 'F' || letter === 'J' ? 'key bump' : 'key';
      key.dataset.key = letter;
      key.textContent = letter;
      key.style.setProperty('--finger', FINGER_COLORS[FINGERS[letter].finger]);
      line.append(key);
    }
    return line;
  }));
}

/**
 * Draw two hands: four colored fingers and a gray thumb each.
 * @returns {void}
 */
function buildHands() {
  byId('hands').replaceChildren(...Object.entries(HAND_FINGERS).map(([hand, fingers]) => {
    const palm = document.createElement('div');
    palm.className = `hand ${hand}`;
    for (const finger of fingers) {
      const element = document.createElement('div');
      element.className = `finger ${finger}`;
      element.dataset.hand = hand;
      element.dataset.finger = finger;
      element.style.setProperty('--finger', FINGER_COLORS[finger] ?? 'var(--stone)');
      palm.append(element);
    }
    return palm;
  }));
}
