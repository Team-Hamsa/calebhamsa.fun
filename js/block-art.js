/**
 * block-art.js — draws blocks on a canvas, pixel-art style.
 *
 * Each block is drawn on an 8 × 8 grid of little squares ("pixels"):
 *
 *   ┌────────┐   1. fill with the block's color
 *   │ ▪   ▪  │   2. sprinkle darker "speckles" (the same pattern every time)
 *   │   ▪  ▪ │   3. a light edge on the top-left, a dark one on the
 *   │ ▪    ▪ │      bottom-right, so it looks a little 3D
 *   └────────┘   4. a letter on top, for note blocks
 *
 * The Build page uses this for the world, the palette, the thumbnails
 * and the 📷 picture, so they all look the same.
 */
import { AIR, getBlock } from './world.js';

/** Blocks are drawn as SPECKLE_GRID × SPECKLE_GRID little pixels. */
export const SPECKLE_GRID = 8;

/**
 * How many darker speckles each block gets.
 * 🧪 Try this! 0 for smooth blocks, 30 for very bumpy ones.
 */
const SPECKLES_PER_BLOCK = 10;

/**
 * How dark the speckles are: 1 = same color, 0 = black.
 * 🧪 Try this! 0.5 for strong speckles, 0.95 for barely-there ones.
 */
const SPECKLE_SHADE = 0.82;

/**
 * Turn a name into a number, the same number every time. We use it to
 * pick each block's speckle pattern, so sand always looks like sand.
 * @param {string} name - a block name
 * @returns {number} a whole number from 0 to about 4 billion
 */
export function hashName(name) {
  let hash = 0;
  for (const letter of name) hash = (Math.imul(hash, 31) + letter.codePointAt(0)) >>> 0;
  return hash;
}

/**
 * Where a block's speckles go. It's "random", but the same seed always
 * gives the same spots, so blocks don't flicker when they're redrawn.
 * @param {number} seed - from hashName
 * @param {number} [count] - how many speckles
 * @returns {Array<[number, number]>} [x, y] of each speckle, 0 to SPECKLE_GRID - 1
 */
export function speckles(seed, count = SPECKLES_PER_BLOCK) {
  let n = seed || 1;
  /**
   * The next "random" number: a classic recipe that scrambles n.
   * @returns {number} a whole number from 0 to 65535
   */
  const next = () => {
    n = (Math.imul(n, 1103515245) + 12345) >>> 0;
    return n >>> 16;
  };
  const spots = [];
  for (let i = 0; i < count; i++) spots.push([next() % SPECKLE_GRID, next() % SPECKLE_GRID]);
  return spots;
}

/**
 * Make a #rrggbb color darker (factor below 1) or lighter (above 1).
 * @param {string} hex - a color like '#8f8f8f'
 * @param {number} factor - 0.5 = half as bright, 2 = twice as bright
 * @returns {string} the new #rrggbb color
 */
export function shade(hex, factor) {
  return `#${[1, 3, 5]
    .map((start) => parseInt(hex.slice(start, start + 2), 16))
    .map((channel) => Math.max(0, Math.min(255, Math.round(channel * factor))))
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')}`;
}

/**
 * Draw one block.
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {object} info - the block's definition (from blockInfo)
 * @param {number} left - where its left edge goes, in pixels
 * @param {number} top - where its top edge goes, in pixels
 * @param {number} size - how wide and tall it is, in pixels
 * @returns {void}
 */
export function drawBlock(ctx, info, left, top, size) {
  const px = size / SPECKLE_GRID; // one little "pixel"

  if (info.seeThrough) {
    drawGlass(ctx, info, left, top, size, px);
  } else {
    ctx.fillStyle = info.color;
    ctx.fillRect(left, top, size, size);
    ctx.fillStyle = shade(info.color, SPECKLE_SHADE);
    for (const [x, y] of speckles(hashName(info.name ?? info.color))) {
      ctx.fillRect(left + x * px, top + y * px, px, px);
    }
    if (info.topColor) {
      // Like a grass block: a green top three pixels deep.
      ctx.fillStyle = info.topColor;
      ctx.fillRect(left, top, size, px * 3);
    }
  }

  // The 3D edges: light on the top and left, dark on the bottom and right.
  const edge = px / 2;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.fillRect(left, top, size, edge);
  ctx.fillRect(left, top, edge, size);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
  ctx.fillRect(left, top + size - edge, size, edge);
  ctx.fillRect(left + size - edge, top, edge, size);

  if (info.label) {
    ctx.font = `${Math.round(size * 0.4)}px 'Press Start 2P', monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const x = left + size / 2;
    const y = top + size / 2 + edge;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)'; // a shadow, like the site's button text
    ctx.fillText(info.label, x + edge, y + edge);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(info.label, x, y);
  }
}

/**
 * Draw a see-through block (glass): a pale tint the sky shows through,
 * a frame, and a little white shine.
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {object} info - the block's definition
 * @param {number} left - left edge, in pixels
 * @param {number} top - top edge, in pixels
 * @param {number} size - width and height, in pixels
 * @param {number} px - the size of one little pixel
 * @returns {void}
 */
function drawGlass(ctx, info, left, top, size, px) {
  ctx.globalAlpha = 0.35; // 35% see-through tint
  ctx.fillStyle = info.color;
  ctx.fillRect(left, top, size, size);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = shade(info.color, 0.6);
  ctx.lineWidth = px;
  ctx.strokeRect(left + px / 2, top + px / 2, size - px, size - px);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(left + px * 2, top + px * 2, px, px);
  ctx.fillRect(left + px * 3, top + px * 3, px, px);
}

/**
 * Draw the whole world: sky everywhere, then every block that isn't air.
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {{width: number, height: number, cells: string[]}} world - the world
 * @param {number} size - how big each block is, in pixels
 * @param {Function} blockInfo - looks up what a block name means
 * @param {string} sky - the sky color
 * @returns {void}
 */
export function drawWorld(ctx, world, size, blockInfo, sky) {
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, world.width * size, world.height * size);
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      const name = getBlock(world, x, y);
      if (name === AIR) continue;
      const info = blockInfo(name);
      if (info) drawBlock(ctx, info, x * size, y * size, size);
    }
  }
}
