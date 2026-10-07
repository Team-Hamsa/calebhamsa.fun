/**
 * progress.js — remembers the typing game's stars, so they're still
 * there after the iPad is closed.
 *
 * The stars are saved in the browser's localStorage as a little bit of
 * text (JSON):
 *   calebhamsa.type = {"version":1,"stars":[3,3,1,0,0,…]}
 * One number per level: how many walls (0 to 3) have been cleared.
 *
 * Pure: the storage is handed in, so tests can pass a pretend one.
 */
import { LEVELS } from './levels.js';
import { STARS_PER_LEVEL } from './wall.js';

/** The localStorage name the stars are saved under. */
export const PROGRESS_KEY = 'calebhamsa.type';

/** Change this if the saved shape ever changes, so old saves are ignored. */
export const PROGRESS_VERSION = 1;

/**
 * A brand-new game: no stars anywhere.
 * @returns {{stars: number[]}} the progress
 */
export function freshProgress() {
  return { stars: LEVELS.map(() => 0) };
}

/**
 * Load the saved stars. Anything missing, broken, or from an old version
 * gives a brand-new game instead of an error.
 * @param {Storage|null} storage - localStorage, or null when it's blocked
 * @returns {{stars: number[]}} the progress
 */
export function loadProgress(storage) {
  try {
    const data = JSON.parse(storage?.getItem(PROGRESS_KEY) ?? 'null');
    if (data?.version !== PROGRESS_VERSION || !Array.isArray(data.stars)) return freshProgress();
    // Each level gets a whole number from 0 to 3, whatever was saved.
    const stars = LEVELS.map((_, i) => Math.min(STARS_PER_LEVEL, Math.max(0, Math.floor(Number(data.stars[i])) || 0)));
    return { stars };
  } catch {
    // Unreadable text, or storage that says "no": start fresh.
    return freshProgress();
  }
}

/**
 * Save the stars.
 * @param {Storage|null} storage - localStorage, or null when it's blocked
 * @param {{stars: number[]}} progress - the stars to save
 * @returns {boolean} true if they were saved
 */
export function saveProgress(storage, progress) {
  try {
    storage.setItem(PROGRESS_KEY, JSON.stringify({ version: PROGRESS_VERSION, stars: progress.stars }));
    return true;
  } catch {
    // Storage blocked or full: the game keeps playing, it just won't remember.
    return false;
  }
}

/**
 * One more star for a level (never more than 3).
 * @param {{stars: number[]}} progress - the stars now (not changed)
 * @param {number} level - the level number, starting at 1
 * @returns {{stars: number[]}} new progress with the extra star
 */
export function addStar(progress, level) {
  const stars = [...progress.stars];
  stars[level - 1] = Math.min(STARS_PER_LEVEL, stars[level - 1] + 1);
  return { stars };
}

/**
 * Can this level be played yet? Level 1 always can; every other level
 * opens when the level before it has all 3 stars.
 * @param {{stars: number[]}} progress - the stars
 * @param {number} level - the level number, starting at 1
 * @returns {boolean} true if it's open
 */
export function isUnlocked(progress, level) {
  if (level < 1 || level > LEVELS.length) return false;
  return level === 1 || progress.stars[level - 2] >= STARS_PER_LEVEL;
}

/**
 * The furthest level that's open: where the game starts.
 * @param {{stars: number[]}} progress - the stars
 * @returns {number} the level number, starting at 1
 */
export function highestUnlocked(progress) {
  let level = 1;
  while (isUnlocked(progress, level + 1)) level++;
  return level;
}

/** The localStorage name the 🔇 mute switch is saved under. */
export const MUTE_KEY = 'calebhamsa.type.muted';

/**
 * Was the sound turned off last time? Sound starts on if nothing was saved.
 * @param {Storage|null} storage - localStorage, or null when it's blocked
 * @returns {boolean} true if muted
 */
export function loadMuted(storage) {
  try {
    return storage?.getItem(MUTE_KEY) === 'yes';
  } catch {
    return false;
  }
}

/**
 * Remember whether the sound is off.
 * @param {Storage|null} storage - localStorage, or null when it's blocked
 * @param {boolean} muted - true for 🔇 off, false for 🔊 on
 * @returns {boolean} true if it was saved
 */
export function saveMuted(storage, muted) {
  try {
    storage.setItem(MUTE_KEY, muted ? 'yes' : 'no');
    return true;
  } catch {
    return false;
  }
}
