/**
 * chem-art.js — draws the chemistry board: atoms as colored balls with
 * their letter, bonds as sticks, and free hands as little stubs.
 *
 * Sticks always go left/right/up/down (atoms only hold hands with side
 * neighbors), so free hands are drawn pointing DIAGONALLY. That way a
 * free hand never hides behind a stick, and Caleb can count them.
 *
 * The same drawing makes the little pictures in the collection book.
 */
import { freeHands } from './board.js';

/**
 * How each atom looks, and its name to say out loud.
 * The colors are the ones real molecule-model kits use.
 * 🧪 Try this! Make oxygen purple: change '#e53935' to '#8e24aa'.
 */
export const ATOM_INFO = {
  H: { name: 'Hydrogen', color: '#f5f5f5', ink: '#333333', emoji: '⚪' },
  O: { name: 'Oxygen', color: '#e53935', ink: '#ffffff', emoji: '🔴' },
  C: { name: 'Carbon', color: '#333333', ink: '#ffffff', emoji: '⚫' },
  N: { name: 'Nitrogen', color: '#1e66e5', ink: '#ffffff', emoji: '🔵' },
  Cl: { name: 'Chlorine', color: '#43a047', ink: '#ffffff', emoji: '🟢' },
  S: { name: 'Sulfur', color: '#fdd835', ink: '#333333', emoji: '🟡' },
};

/**
 * How big an atom's ball is, as a share of the cell.
 * 🧪 Try this! 0.45 for chunky atoms, 0.25 for tiny ones.
 */
const BALL = 0.32;

/** Gap between the sticks of a double or triple bond, as a share of the cell. */
const STICK_GAP = 0.1;

/**
 * How the 🔗 aim looks while a finger is down: a glow behind the two
 * atoms, and a sign on the gap saying what lifting the finger will do.
 * 🧪 Try this! Change ✂️ to 👋 for "let go".
 */
const AIM_LOOK = {
  join: { color: 'rgba(255, 193, 7, 0.45)', sign: '🔗' },
  more: { color: 'rgba(255, 193, 7, 0.45)', sign: '🔗' },
  apart: { color: 'rgba(229, 57, 53, 0.3)', sign: '✂️' },
  nothing: { color: 'rgba(120, 120, 120, 0.3)', sign: '🚫' },
};

/** The four diagonal directions free hands point in (never where sticks go). */
const DIAGONALS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

/**
 * Draw a board (or a little book picture, which is a small board).
 * @param {CanvasRenderingContext2D} ctx - where to draw
 * @param {{width: number, height: number, atoms: (string|null)[], right: number[], down: number[]}} board - what to draw
 * @param {number} cell - cell size in pixels
 * @param {{grid?: boolean, stuck?: Set<number>, glow?: Set<number>, boom?: Set<number>, hands?: boolean, aim?: {pair: number[]|null, will: string|null}|null}} [marks]
 *   grid: draw the cell lines; stuck: atoms with stuck hands (red stubs);
 *   glow: atoms in finished molecules; boom: atoms to draw 💥 on;
 *   hands: draw free hands (book pictures have none);
 *   aim: the two atoms 🔗 is pointing at, and what it will do (see AIM_LOOK)
 * @returns {void}
 */
export function drawBoard(ctx, board, cell, marks = {}) {
  const { grid = true, stuck = new Set(), glow = new Set(), boom = new Set(), hands = true, aim = null } = marks;
  const { width, height } = board;
  ctx.fillStyle = '#fffaf0';
  ctx.fillRect(0, 0, width * cell, height * cell);
  if (grid) {
    ctx.strokeStyle = '#e8dcc4';
    ctx.lineWidth = 1;
    for (let x = 1; x < width; x += 1) line(ctx, x * cell, 0, x * cell, height * cell);
    for (let y = 1; y < height; y += 1) line(ctx, 0, y * cell, width * cell, y * cell);
  }

  // The 🔗 aim's glow goes under everything, like a highlighter.
  const look = aim?.pair && AIM_LOOK[aim.will];
  if (look) {
    const [x1, y1] = centre(aim.pair[0], width, cell);
    const [x2, y2] = centre(aim.pair[1], width, cell);
    ctx.strokeStyle = look.color;
    ctx.lineWidth = cell * 0.9;
    ctx.lineCap = 'round'; // round ends make a pill around both atoms
    line(ctx, x1, y1, x2, y2);
    ctx.lineCap = 'butt';
  }

  // Sticks first, so the balls sit on top of their ends.
  ctx.strokeStyle = '#555555';
  ctx.lineWidth = Math.max(2, cell * 0.06);
  board.atoms.forEach((el, i) => {
    if (!el) return;
    const [cx, cy] = centre(i, width, cell);
    if (board.right[i] > 0) sticks(ctx, cx, cy, cx + cell, cy, board.right[i], cell);
    if (board.down[i] > 0) sticks(ctx, cx, cy, cx, cy + cell, board.down[i], cell);
  });

  board.atoms.forEach((el, i) => {
    if (!el) return;
    const [cx, cy] = centre(i, width, cell);
    const free = hands ? freeHands(board, i) : 0;
    drawAtom(ctx, el, cx, cy, cell, { free, stuck: stuck.has(i), glow: glow.has(i) });
    if (boom.has(i)) {
      ctx.font = `${Math.round(cell * 0.5)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('💥', cx + cell * 0.3, cy - cell * 0.3);
    }
  });

  // The aim's sign sits on top, in the gap between the two atoms.
  if (look) {
    const [x1, y1] = centre(aim.pair[0], width, cell);
    const [x2, y2] = centre(aim.pair[1], width, cell);
    ctx.font = `${Math.round(cell * 0.4)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(look.sign, (x1 + x2) / 2, (y1 + y2) / 2);
  }
}

/**
 * Draw one atom: its free hands, its ball, and its letter.
 * @param {CanvasRenderingContext2D} ctx - where to draw
 * @param {string} el - the atom, like 'O'
 * @param {number} cx - centre, in pixels
 * @param {number} cy - centre, in pixels
 * @param {number} cell - cell size in pixels
 * @param {{free?: number, stuck?: boolean, glow?: boolean}} [look] - free hands
 *   to draw (stubs), whether they're stuck (red and squished), and a gold glow
 * @returns {void}
 */
export function drawAtom(ctx, el, cx, cy, cell, look = {}) {
  const { free = 0, stuck = false, glow = false } = look;
  const info = ATOM_INFO[el];
  const r = cell * BALL;

  // Free hands: a stub with a little round "hand" on the end.
  const reach = stuck ? r * 1.3 : r * 1.9;
  ctx.strokeStyle = stuck ? '#d32f2f' : info.color === '#f5f5f5' ? '#9e9e9e' : info.color;
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = Math.max(2, cell * 0.07);
  for (const [dx, dy] of DIAGONALS.slice(0, Math.max(0, free))) {
    const hx = cx + (dx * reach) / Math.SQRT2;
    const hy = cy + (dy * reach) / Math.SQRT2;
    line(ctx, cx, cy, hx, hy);
    circle(ctx, hx, hy, cell * 0.08);
    ctx.fill();
  }

  if (glow) {
    ctx.fillStyle = 'rgba(242, 183, 5, 0.55)';
    circle(ctx, cx, cy, r * 1.35);
    ctx.fill();
  }
  ctx.fillStyle = info.color;
  circle(ctx, cx, cy, r);
  ctx.fill();
  ctx.strokeStyle = '#00000055';
  ctx.lineWidth = Math.max(1, cell * 0.03);
  ctx.stroke();

  ctx.fillStyle = info.ink;
  ctx.font = `${Math.round(r * (el.length > 1 ? 0.8 : 1.05))}px 'Press Start 2P', monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(el, cx, cy + r * 0.08);
}

/**
 * The centre of cell i, in pixels.
 * @param {number} i - cell number
 * @param {number} width - cells across
 * @param {number} cell - cell size in pixels
 * @returns {[number, number]} x and y
 */
function centre(i, width, cell) {
  return [(i % width) * cell + cell / 2, Math.floor(i / width) * cell + cell / 2];
}

/**
 * Draw 1, 2 or 3 side-by-side sticks between two centres.
 * @param {CanvasRenderingContext2D} ctx - where to draw
 * @param {number} x1 - from
 * @param {number} y1 - from
 * @param {number} x2 - to
 * @param {number} y2 - to
 * @param {number} order - how many sticks
 * @param {number} cell - cell size in pixels
 * @returns {void}
 */
function sticks(ctx, x1, y1, x2, y2, order, cell) {
  const across = y1 === y2 ? [0, 1] : [1, 0]; // sideways from the stick's direction
  for (let k = 0; k < order; k += 1) {
    const shift = (k - (order - 1) / 2) * cell * STICK_GAP;
    line(ctx, x1 + across[0] * shift, y1 + across[1] * shift, x2 + across[0] * shift, y2 + across[1] * shift);
  }
}

/**
 * Draw a straight line.
 * @param {CanvasRenderingContext2D} ctx - where to draw
 * @param {number} x1 - from
 * @param {number} y1 - from
 * @param {number} x2 - to
 * @param {number} y2 - to
 * @returns {void}
 */
function line(ctx, x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

/**
 * Start a circle path (fill or stroke it after).
 * @param {CanvasRenderingContext2D} ctx - where to draw
 * @param {number} x - centre
 * @param {number} y - centre
 * @param {number} r - radius
 * @returns {void}
 */
function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}
