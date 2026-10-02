/**
 * registry.js — the list of every block pack, and one place to look up
 * what any block name means.
 *
 * To add a pack: write js/blocks/<name>.js shaped like basic.js, import
 * it here, and put it in PACKS. Its tab appears on the Build page by itself.
 */
import { AIR } from '../world.js';
import basic from './basic.js';

/**
 * Every pack, in the order their systems run each tick. Order matters
 * once packs talk to each other: water must turn to steam BEFORE the
 * turbine checks for steam. The plan for later phases is:
 *   basic → water → mechanical → electric
 */
export const PACKS = [basic];

/**
 * The names of the signals packs will pass to each other in later
 * phases: ⚡ power (wires, lamps) and 🔄 spin (gears, wheels).
 * Nothing uses them yet.
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
 * The block names on one palette tab, in palette order.
 * @param {string} id - a pack's tab id, like 'basic'
 * @returns {string[]} the block names (empty if there's no such tab)
 */
export function blocksInPack(id) {
  const pack = PACKS.find((p) => p.tab.id === id);
  return pack ? Object.keys(pack.blocks) : [];
}
