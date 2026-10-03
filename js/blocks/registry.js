/**
 * registry.js — the list of every block pack, and one place to look up
 * what any block name means.
 *
 * To add a pack: write js/blocks/<name>.js shaped like basic.js, import
 * it here, and put it in PACKS. Its tab appears on the Build page by itself.
 */
import { AIR } from '../world.js';
import basic from './basic.js';
import electric from './electric.js';
import water from './water.js';
import gears from './gears.js';
import lifting from './lifting.js';

/**
 * Every pack, in the order their systems run each tick. Order matters
 * once packs talk to each other: sand must land BEFORE the electricity
 * is worked out, and water must turn to steam BEFORE the turbine checks
 * for steam, and the winches must know how fast the gears turn BEFORE
 * they lift anything:
 *   basic → water → gears → lifting → electric
 */
export const PACKS = [basic, water, gears, lifting, electric];

/**
 * The names of the signals packs pass to each other: ⚡ power (wires,
 * lamps; world.signals.electric) and 🔄 spin (gears, wheels; later).
 */
export const SIGNALS = Object.freeze({ POWER: 'power', SPIN: 'spin' });

/** What empty air looks like: the sky. */
export const AIR_INFO = Object.freeze({ name: AIR, title: 'Air', color: '#7ec8ff' });

/** Every block from every pack, by name, with its name and pack id added. */
const BLOCKS = new Map();
for (const pack of PACKS) {
  for (const [name, block] of Object.entries(pack.blocks)) {
    BLOCKS.set(name, { ...block, name, pack: pack.tab.id });
  }
}

/**
 * Look up what a block name means.
 * @param {string} name - a block name, like 'sand'
 * @returns {object|undefined} the block's definition, AIR_INFO for air, or undefined if unknown
 */
export function blockInfo(name) {
  return name === AIR ? AIR_INFO : BLOCKS.get(name);
}

/**
 * Is this a block we know (or air)? Saved worlds use this to throw away
 * blocks that don't exist any more.
 * @param {*} name - anything, hopefully a block name
 * @returns {boolean} true for air and every block in every pack
 */
export function isKnownBlock(name) {
  return name === AIR || BLOCKS.has(name);
}

/**
 * Every pack's systems, in pack order: what runs on each tick.
 * @returns {Function[]} the systems
 */
export function allSystems() {
  return PACKS.flatMap((pack) => pack.systems ?? []);
}

/**
 * The block names on one palette tab, in palette order (blocks marked
 * `hidden` are left out).
 * @param {string} id - a pack's tab id, like 'basic'
 * @returns {string[]} the block names (empty if there's no such tab)
 */
export function blocksInPack(id) {
  const pack = PACKS.find((p) => p.tab.id === id);
  if (!pack) return [];
  return Object.keys(pack.blocks).filter((name) => !pack.blocks[name].hidden);
}

/**
 * Bring every pack's signals up to date (for example, work out the
 * electricity after a block was placed), so the picture is right even
 * between ticks. Packs without a `refresh` are skipped.
 * @param {object} world - the world
 * @returns {void}
 */
export function refreshSignals(world) {
  for (const pack of PACKS) pack.refresh?.(world, blockInfo);
}

/**
 * Draw every pack's whole-world layer (like water and steam) on top of
 * the blocks. Packs without a `drawLayer` are skipped.
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {object} world - the world
 * @param {number} size - how big each cell is, in pixels
 * @returns {void}
 */
export function drawLayers(ctx, world, size) {
  for (const pack of PACKS) pack.drawLayer?.(ctx, world, size);
}
