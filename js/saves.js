/**
 * saves.js — keeps Caleb's three worlds safe in the browser's storage
 * (localStorage), so closing the iPad never loses a build.
 *
 * A saved world is a bit of JSON text, like:
 *
 *   { "version": 2, "width": 24, "height": 14,
 *     "blocks": ["air", "grass", "sand"],
 *     "cells":  [0, 0, 0, ..., 1, 1, 1],
 *     "water":  [0, 0, 0.5, ...],
 *     "steam":  [0, 0, 0, ...] }
 *
 * Each cell stores a small number (0 = the first name in "blocks"),
 * which is much shorter than writing "grass" 24 times. "water" and
 * "steam" say how much of each fluid every cell holds (version 1 saves,
 * from before water existed, don't have them: they load dry).
 *
 * Every function here takes the storage as an argument, so the tests
 * can hand in a pretend one. Storage can fail (private browsing, a full
 * iPad), so every function here catches that and never crashes the page.
 */
import { AIR, FLUIDS, createWorld, setBlock, setFluid } from './world.js';

/**
 * Bump this if the save format ever changes, so old pages ignore new saves.
 * Version 2 added water and steam. This page still reads version 1.
 */
export const SAVE_VERSION = 2;

/** The save versions this page knows how to read. */
const READABLE_VERSIONS = [1, 2];

/** How many worlds Caleb can switch between. */
export const WORLD_COUNT = 3;

/** The name the number of the open world (1–3) is saved under. */
export const CURRENT_KEY = 'calebhamsa.build.current';

/**
 * The name world n is saved under.
 * @param {number} n - which world, 1 to WORLD_COUNT
 * @returns {string} e.g. "calebhamsa.build.world.1"
 */
export function worldKey(n) {
  return `calebhamsa.build.world.${n}`;
}

/**
 * The name world n's little picture is saved under.
 * @param {number} n - which world, 1 to WORLD_COUNT
 * @returns {string} e.g. "calebhamsa.build.world.1.thumb"
 */
export function thumbKey(n) {
  return `${worldKey(n)}.thumb`;
}

/**
 * Turn a world into save text.
 * @param {{width: number, height: number, cells: string[]}} world - the world
 * @returns {string} JSON text
 */
export function serializeWorld(world) {
  const blocks = [];
  const numberOf = new Map(); // block name → its position in `blocks`
  const cells = world.cells.map((name) => {
    if (!numberOf.has(name)) {
      numberOf.set(name, blocks.length);
      blocks.push(name);
    }
    return numberOf.get(name);
  });
  /**
   * Round an amount to 3 decimals, so saves stay short.
   * @param {number} amount - a fluid amount
   * @returns {number} the rounded amount
   */
  const round = (amount) => Math.round(amount * 1000) / 1000;
  return JSON.stringify({
    version: SAVE_VERSION,
    width: world.width,
    height: world.height,
    blocks,
    cells,
    water: Array.from(world.fluid.water, round),
    steam: Array.from(world.fluid.steam, round),
  });
}

/**
 * Does this look like a save we know how to read?
 * @param {*} data - whatever JSON.parse gave back
 * @returns {boolean} true if it has every part, the right sizes, and our version
 */
function isReadableSave(data) {
  return data !== null && typeof data === 'object'
    && READABLE_VERSIONS.includes(data.version)
    && Number.isInteger(data.width) && data.width > 0
    && Number.isInteger(data.height) && data.height > 0
    && Array.isArray(data.blocks)
    && Array.isArray(data.cells) && data.cells.length === data.width * data.height;
}

/**
 * Turn save text back into a world of the size the page uses now.
 *
 * - Blocks we don't know any more become air.
 * - If the save is a different size, it's lined up at the BOTTOM-LEFT
 *   (cropped or padded with air), so the ground stays on the ground.
 *
 * @param {string} text - JSON text from serializeWorld
 * @param {{width: number, height: number, isKnown: Function}} options - the world size now, and which block names exist
 * @returns {{width: number, height: number, cells: string[]}|null} the world, or null if the text can't be read
 */
export function deserializeWorld(text, { width, height, isKnown }) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isReadableSave(data)) return null;

  const world = createWorld(width, height);
  const shiftDown = height - data.height; // how far to move rows so the bottoms line up
  for (let y = 0; y < data.height; y++) {
    for (let x = 0; x < data.width; x++) {
      const name = data.blocks[data.cells[y * data.width + x]];
      // setBlock ignores spots outside the new world, which does the cropping.
      setBlock(world, x, y + shiftDown, isKnown(name) ? name : AIR);
    }
  }
  for (const kind of FLUIDS) {
    const amounts = data[kind];
    if (!isAmountList(amounts, data.width * data.height)) continue; // missing or broken: this fluid is dry
    for (let y = 0; y < data.height; y++) {
      for (let x = 0; x < data.width; x++) setFluid(world, kind, x, y + shiftDown, amounts[y * data.width + x]);
    }
  }
  return world;
}

/**
 * Is this a proper list of fluid amounts: the right length, and every
 * amount a real number that isn't negative?
 * @param {*} amounts - whatever the save had for one fluid
 * @param {number} length - how many cells the save has
 * @returns {boolean} true if it can be used
 */
function isAmountList(amounts, length) {
  return Array.isArray(amounts) && amounts.length === length
    && amounts.every((amount) => typeof amount === 'number' && Number.isFinite(amount) && amount >= 0);
}

/**
 * Load world n from storage.
 * @param {number} n - which world, 1 to WORLD_COUNT
 * @param {Storage|null} storage - localStorage (or a pretend one)
 * @param {{width: number, height: number, isKnown: Function}} options - see deserializeWorld
 * @returns {{width: number, height: number, cells: string[]}|null} the world, or null if there isn't a readable one
 */
export function loadWorld(n, storage, options) {
  let text;
  try {
    text = storage.getItem(worldKey(n));
  } catch {
    return null; // storage is blocked (or missing)
  }
  if (text === null) return null; // never saved
  const world = deserializeWorld(text, options);
  if (!world) console.warn(`World ${n}'s save couldn't be read, so it starts fresh.`);
  return world;
}

/**
 * Save world n, and its little picture, to storage.
 * @param {number} n - which world, 1 to WORLD_COUNT
 * @param {{width: number, height: number, cells: string[]}} world - the world
 * @param {string|null} thumbnail - a data: URL picture of it, or null for none
 * @param {Storage|null} storage - localStorage (or a pretend one)
 * @returns {boolean} true if it saved, false if storage is blocked or full
 */
export function saveWorld(n, world, thumbnail, storage) {
  try {
    storage.setItem(worldKey(n), serializeWorld(world));
    if (thumbnail) storage.setItem(thumbKey(n), thumbnail);
    return true;
  } catch {
    return false;
  }
}

/**
 * Load world n's little picture.
 * @param {number} n - which world, 1 to WORLD_COUNT
 * @param {Storage|null} storage - localStorage (or a pretend one)
 * @returns {string|null} a data: URL, or null if there isn't one
 */
export function loadThumbnail(n, storage) {
  try {
    return storage.getItem(thumbKey(n));
  } catch {
    return null;
  }
}

/**
 * Which world was open last time?
 * @param {Storage|null} storage - localStorage (or a pretend one)
 * @returns {number} 1 to WORLD_COUNT (1 if nothing sensible was saved)
 */
export function loadCurrent(storage) {
  try {
    const n = Number(storage.getItem(CURRENT_KEY));
    return Number.isInteger(n) && n >= 1 && n <= WORLD_COUNT ? n : 1;
  } catch {
    return 1;
  }
}

/**
 * Remember which world is open.
 * @param {number} n - which world, 1 to WORLD_COUNT
 * @param {Storage|null} storage - localStorage (or a pretend one)
 * @returns {boolean} true if it saved
 */
export function saveCurrent(n, storage) {
  try {
    storage.setItem(CURRENT_KEY, String(n));
    return true;
  } catch {
    return false;
  }
}
