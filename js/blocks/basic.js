/**
 * basic.js — the ⛏️ Blocks pack: plain building blocks, sand that
 * falls, and note blocks that sing.
 *
 * A "pack" is one palette tab's worth of blocks, plus the rules
 * ("systems") that make them do things. Later packs (⚡ wires, 💧 water,
 * ⚙️ gears) are new files shaped just like this one.
 */
import { AIR, getBlock, setBlock } from '../world.js';

/**
 * The singing note blocks. Same rainbow colors as the Note Blocks page:
 * C red, D orange, E yellow, F green, G blue, A purple, B pink.
 * `midi` is the note's number (60 = middle C, see music-theory.js).
 * 🧪 Try this! Add 12 to every midi number to make them sing an octave higher.
 */
export const NOTE_BLOCKS = [
  { name: 'noteC', label: 'C', midi: 60, color: '#e53935' },
  { name: 'noteD', label: 'D', midi: 62, color: '#fb8c00' },
  { name: 'noteE', label: 'E', midi: 64, color: '#fdd835' },
  { name: 'noteF', label: 'F', midi: 65, color: '#43a047' },
  { name: 'noteG', label: 'G', midi: 67, color: '#1e88e5' },
  { name: 'noteA', label: 'A', midi: 69, color: '#5e35b1' },
  { name: 'noteB', label: 'B', midi: 71, color: '#d81b60' },
];

/**
 * The falling rule: any block marked `falls` with air right under it
 * drops down one cell.
 *
 * We look at the rows from the BOTTOM up. That way, in a tower of sand,
 * the lowest grain moves first and leaves a gap for the one above it,
 * so the whole tower falls together, one row per tick.
 *
 * @param {{width: number, height: number, cells: string[]}} world - the world
 * @param {Function} blockInfo - looks up what a block name means
 * @returns {boolean} true if anything fell
 */
export function fallingBlocks(world, blockInfo) {
  let changed = false;
  // The bottom row can't fall (the floor is under it), so start one up.
  for (let y = world.height - 2; y >= 0; y--) {
    for (let x = 0; x < world.width; x++) {
      const name = getBlock(world, x, y);
      if (blockInfo(name)?.falls && getBlock(world, x, y + 1) === AIR) {
        setBlock(world, x, y + 1, name);
        setBlock(world, x, y, AIR);
        changed = true;
      }
    }
  }
  return changed;
}

/**
 * Make one note block: it shows its letter, and ✋ USE plays its note.
 * @param {{label: string, midi: number, color: string}} note - one of NOTE_BLOCKS
 * @returns {object} the block's definition
 */
function noteBlock({ label, midi, color }) {
  return {
    title: `Note ${label}`,
    color,
    label,
    midi,
    use: (ctx) => {
      ctx.playNote(midi);
      ctx.flash();
    },
  };
}

/**
 * Every block in this pack, in the order the palette shows them.
 * `color` is the block's main color; the grass block is dirt with a green
 * `topColor`, like the real thing. `seeThrough` blocks let the sky show.
 * 🧪 Try this! Add  diamond: { title: 'Diamond', color: '#4ee6e0' },
 */
const blocks = {
  grass: { title: 'Grass', color: '#8b5a2b', topColor: '#5dbb3f' },
  dirt: { title: 'Dirt', color: '#8b5a2b' },
  stone: { title: 'Stone', color: '#8f8f8f' },
  wood: { title: 'Wood', color: '#a0703c' },
  glass: { title: 'Glass', color: '#cdefff', seeThrough: true },
  obsidian: { title: 'Obsidian', color: '#2b1f3d' },
  gold: { title: 'Gold', color: '#f2b705' },
  sand: { title: 'Sand', color: '#e3d38f', falls: true },
};
for (const note of NOTE_BLOCKS) blocks[note.name] = noteBlock(note);

export default {
  tab: { id: 'basic', icon: '⛏️', label: 'Blocks' },
  blocks,
  systems: [fallingBlocks],
};
