/**
 * room.js — makes the Chemistry page work.
 *
 * Caleb picks an atom and puts it on the board. Atoms side by side hold
 * hands by themselves (board.js). When every hand in a molecule is
 * holding another, the molecule glows, the room says its name, and it
 * goes in the 📖 collection book. Finding molecules unlocks new atoms.
 *
 *   🧱 PLACE   tap or drag to put the chosen atom down
 *   ⛏️ REMOVE  tap or drag to take atoms away
 *   🔗 BOND    tap between two atoms (or slide from one to the other): one
 *             more stick, or pull them apart. Tap the middle of a sulfur
 *             or phosphorus atom: two more hands. It happens when the
 *             finger lifts, so Caleb sees what it will do first (and can
 *             slide away)
 *
 * Big molecules (more than 8 non-H atoms) are looked up on PubChem
 * (pubchem.js): their name card shows when the answer comes back.
 *
 * chem.html calls initChem() once. Everything else here only runs after that.
 */
import {
  APART, BOARD_HEIGHT, BOARD_WIDTH, boardSize, cellAtPoint, cellCentre, createBoard, findGroups, groupGraph, groupLayout, handsOf,
  neighbors, newlyFinished, placeAtom, removeAtom, tapAtom, tapBond, touching,
} from './board.js';
import {
  ALL_ATOMS, LADDER, createBook, INVENTION_NAME_MAX, promoteInventions, record, renameInvention, resolvePending, unlockAll, unlockedAtoms,
} from './book.js';
import { canonLabel, FULL_SEARCH_MAX, heavyCount } from './canon.js';
import { ATOM_INFO, drawAtom, drawBoard, pictureSize } from './chem-art.js';
import { KID_MOLECULES } from './kid-names.js';
import { kidIndex, labelsOf, loadDatabase, lookUp } from './lookup.js';
import { makeAsker } from './pubchem.js';
import { loadState, saveState } from './save.js';
import { HAND_STEPS, HANDS, parseSmiles } from './smiles.js';
import { choose, flash } from '../ui.js';
import { listenForUnlock, playTones } from '../sound.js';

// =============================================================
// Settings to play with
// =============================================================

/** The board's border, in CSS pixels (css/blocks.css #board says the same). */
const BOARD_BORDER_PX = 6;

/**
 * How long the 💥 shows on a stuck atom, in milliseconds.
 * 🧪 Try this! 2000 for a long 💥.
 */
const BOOM_MS = 700;

/**
 * The unlock fanfare: notes played one after another (MIDI numbers, 60 = middle C).
 * 🧪 Try this! [72, 67, 64, 60] plays it upside down.
 */
const FANFARE = [60, 64, 67, 72];

/** The cheer when a molecule is finished: a happy chord. */
const CHEER = [64, 67, 72];

/** How big book pictures are drawn, per cell, in CSS pixels. */
const PICTURE_CELL_PX = 22;

/**
 * Names longer than this many letters get smaller letters on the name card.
 * 🧪 Try this! 10 makes "Hydrogen peroxide" small too.
 */
const LONG_NAME = 24;

/** How big the name card's picture is drawn, per cell (bigger: it's the star). */
const CARD_CELL_PX = 44;

// =============================================================
// Pure helpers (no screen needed, so tests/chem-room.test.js checks them)
// =============================================================

/**
 * How big each cell can be so the whole board fits in the box.
 * @param {number} boxWidth - the space we have, in CSS pixels
 * @param {number} boxHeight - the space we have, in CSS pixels
 * @param {{width: number, height: number, shift: number}} board - the board
 * @returns {number} the cell size in whole pixels (at least 1)
 */
export function fitCellSize(boxWidth, boxHeight, board) {
  const size = boardSize(board);
  return Math.max(1, Math.floor(Math.min(boxWidth / size.width, boxHeight / size.height)));
}

/**
 * How far from a gap between two atoms a finger can be and still mean
 * that gap, in cells. (A finger on an atom's middle is 0.5 from each of
 * its gaps, so it still counts.)
 * 🧪 Try this! 0.6 makes 🔗 pickier; 1.5 lets it reach a long way.
 */
const BOND_REACH = 0.9;

/**
 * How close to a sulfur or phosphorus atom's middle a 🔗 tap must be to
 * mean "grow more hands" (not "the gap next to it"), in cells.
 * 🧪 Try this! 0.4 makes it easier to hit, but harder to reach its gaps.
 */
const ATOM_TAP = 0.25;

/**
 * 🔗 BOND: which two atoms does the finger mean?
 *
 * Slid from one atom onto an atom touching it? Then those two. Otherwise,
 * the gap between two touching atoms that's nearest the finger. Gaps
 * with an empty cell on one side don't count, so a tap never "misses"
 * onto nothing.
 * @param {number} x - finger position, in pixels from the board's left
 * @param {number} y - finger position, in pixels from the board's top
 * @param {number} cell - cell size in pixels
 * @param {ReturnType<typeof createBoard>} board - the board
 * @param {number|null} [from] - the cell the finger first touched (for a slide)
 * @returns {[number, number]|null} the two atoms' cells (smaller first), or null if none is near
 */
export function bondTarget(x, y, cell, board, from = null) {
  const gx = x / cell; // finger position, in cells
  const gy = y / cell;
  const here = cellAtPoint(board, gx, gy);
  if (here === null) return null;
  const { atoms } = board;

  // A slide from an atom onto an atom touching it.
  if (from !== null && from !== here && atoms[from] && atoms[here] && touching(board, from, here)) {
    return from < here ? [from, here] : [here, from];
  }

  // The nearest gap with an atom on both sides: look at this cell and the cells around it.
  let best = null;
  let bestDistance = BOND_REACH;
  for (const a of [here, ...neighbors(board, here).map((n) => n.cell)]) {
    if (!atoms[a]) continue;
    for (const { cell: b } of neighbors(board, a)) {
      if (b < a || !atoms[b]) continue; // each gap once
      const [ax, ay] = cellCentre(board, a);
      const [bx, by] = cellCentre(board, b);
      // The gap's middle is halfway between the two atoms' middles.
      const distance = Math.hypot(gx - (ax + bx) / 2, gy - (ay + by) / 2);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = [a, b];
      }
    }
  }
  return best;
}

/**
 * 🔗 BOND: is the finger right on the middle of a sulfur or phosphorus
 * atom (to grow it more hands)?
 * @param {number} x - finger position, in pixels from the board's left
 * @param {number} y - finger position, in pixels from the board's top
 * @param {number} cell - cell size in pixels
 * @param {ReturnType<typeof createBoard>} board - the board
 * @returns {number|null} that atom's cell, or null
 */
export function atomTarget(x, y, cell, board) {
  const here = cellAtPoint(board, x / cell, y / cell);
  if (here === null || !HAND_STEPS[board.atoms[here]]) return null;
  const [cx, cy] = cellCentre(board, here);
  return Math.hypot(x / cell - cx, y / cell - cy) <= ATOM_TAP ? here : null;
}

/**
 * Every cell a finger passes over, going from one point to another
 * (checked every quarter of a cell, so none is skipped).
 * @param {ReturnType<typeof createBoard>} board - the board
 * @param {{x: number, y: number}} from - where the finger was, in pixels
 * @param {{x: number, y: number}} to - where it is now, in pixels
 * @param {number} cell - cell size in pixels
 * @returns {number[]} the cells, in order, each once
 */
export function cellsAlong(board, from, to, cell) {
  const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / (cell / 4)));
  const cells = [];
  for (let k = 0; k <= steps; k += 1) {
    const i = cellAtPoint(board, (from.x + ((to.x - from.x) * k) / steps) / cell, (from.y + ((to.y - from.y) * k) / steps) / cell);
    if (i !== null && !cells.includes(i)) cells.push(i);
  }
  return cells;
}

/**
 * The bonds on a board, as one bit of text (to see if anything changed).
 * @param {ReturnType<typeof createBoard>} board - the board
 * @returns {string} every bond list, joined
 */
function bondsText(board) {
  return [board.right, board.downLeft, board.downRight].join('|');
}

/**
 * What would 🔗 do to these two atoms? (Tries it on a copy of the board,
 * so the real one doesn't change.)
 * @param {ReturnType<typeof createBoard>} board - the board
 * @param {number} a - one atom's cell
 * @param {number} b - the other atom's cell, touching it
 * @returns {'more'|'apart'|'join'|'nothing'} one more stick, pulled apart,
 *   joined again, or nothing can change
 */
export function bondPreview(board, a, b) {
  const copy = structuredClone(board);
  const before = bondsText(copy);
  const after = tapBond(copy, a, b);
  if (bondsText(copy) === before) return 'nothing';
  if (after === APART) return 'apart';
  return after === 1 ? 'join' : 'more';
}

/**
 * What would 🔗 do to this sulfur or phosphorus atom?
 * @param {ReturnType<typeof createBoard>} board - the board
 * @param {number} i - the atom's cell
 * @returns {'grow'|'shrink'|'nothing'} two more hands, back to its usual
 *   hands, or nothing (its hands are holding on)
 */
export function handsPreview(board, i) {
  const after = tapAtom(structuredClone(board), i);
  if (after === 0) return 'nothing';
  return after > handsOf(board, i) ? 'grow' : 'shrink';
}

/**
 * A short "which atoms" hint for a molecule not found yet: ⚪⚪🔴 for
 * water, or ⚫×8 ⚪×18 when there are too many to show one by one.
 * @param {string} smiles - the molecule
 * @returns {string} the hint
 */
export function atomHint(smiles) {
  const counts = new Map();
  for (const { el } of parseSmiles(smiles).atoms) counts.set(el, (counts.get(el) ?? 0) + 1);
  const order = ALL_ATOMS.filter((el) => counts.has(el)).sort((a, b) => (a === 'H') - (b === 'H')); // H last
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  if (total <= 6) return order.map((el) => ATOM_INFO[el].emoji.repeat(counts.get(el))).join('');
  return order.map((el) => `${ATOM_INFO[el].emoji}×${counts.get(el)}`).join(' ');
}

/**
 * What the name card says for a lookup result.
 * @param {{kind: string, entry?: object, name?: string}} result - from lookUp()
 * @param {{again: boolean, name: string|null}} recorded - from record()
 * @returns {{name: string, badge: string, fact: string}} the card's words
 */
export function cardWords(result, recorded) {
  const again = recorded.again ? ' Found again!' : '';
  if (result.kind === 'found') return { name: result.entry.name, badge: `📖${again}`, fact: result.entry.fact };
  if (result.kind === 'rare') return { name: recorded.name ?? result.name, badge: `🌟 Super rare!${again}`, fact: 'A real molecule, with its real chemistry name.' };
  if (result.kind === 'invention') return { name: recorded.name, badge: `💡 Your invention!${again}`, fact: 'Nobody has a name for this one. You made it up!' };
  return { name: 'Finished!', badge: '⏳', fact: "I'll look up its name when we have internet." };
}

/**
 * What an atom's hands are, in words: "2 hands", or for sulfur and
 * phosphorus, a reminder that they can grow more.
 * @param {string} el - the atom
 * @returns {string} e.g. 'Sulfur has 2 hands. Tap it with 🔗 to give it more!'
 */
export function handWords(el) {
  const words = `${ATOM_INFO[el].name} has ${HANDS[el]} ${HANDS[el] === 1 ? 'hand' : 'hands'}.`;
  return HAND_STEPS[el] ? `${words} Tap it with 🔗 to give it more!` : words;
}

/** Taps that count as "the person did something" for speech (same as sound.js). */
const SPEECH_UNLOCK_EVENTS = ['pointerup', 'touchend', 'click', 'keydown'];

/**
 * iPads only let a page talk after a real tap, and a finger touching
 * down (pointerdown, which builds) isn't one. So on the first real tap,
 * say one silent word: after that, the page may talk any time.
 * @param {EventTarget} target - where to listen (the document)
 * @param {SpeechSynthesis|undefined} synth - the browser's speech machine
 * @param {Function|undefined} Utterance - SpeechSynthesisUtterance
 * @returns {void}
 */
export function primeSpeech(target, synth, Utterance) {
  if (!synth || !Utterance) return; // no speech here: the cards still show the words
  /**
   * Say the silent word once, then stop listening.
   * @returns {void}
   */
  const prime = () => {
    for (const type of SPEECH_UNLOCK_EVENTS) target.removeEventListener(type, prime);
    try {
      synth.speak(new Utterance(''));
    } catch {
      // Speech not allowed: the cards still show the words.
    }
  };
  for (const type of SPEECH_UNLOCK_EVENTS) target.addEventListener(type, prime);
}

// =============================================================
// The page
// =============================================================

/** Everything the page is doing right now. */
const state = {
  board: createBoard(),
  book: createBook(),
  tool: 'place',
  selected: 'H',
  database: null, // the big list, once it arrives
  cell: 0,
  boom: new Map(), // cell → time its 💥 ends
  cards: [], // name cards waiting to be shown
  aim: null, // 🔗 while a finger is down: {from, pair, atom, will}
};

/** Big molecules finished just now, waiting for PubChem before their name card shows. */
const awaitingCard = new Set();

/** Asks PubChem about big molecules, one at a time (made in initChem). */
let asker = null;

/** label → hand-written entry (made once, at the start). */
let kids = new Map();

let canvas;
let ctx;
let frame;
let pointer = null; // the finger that's building, if any

/**
 * Find an element by id.
 * @param {string} id - its id
 * @returns {HTMLElement} the element
 */
const byId = (id) => document.getElementById(id);

/**
 * Set up the whole page. chem.html calls this once.
 * @returns {void}
 */
export function initChem() {
  canvas = byId('board');
  ctx = canvas.getContext('2d');
  frame = byId('board-frame');
  kids = kidIndex();
  Object.assign(state, loadState(storage(), BOARD_WIDTH, BOARD_HEIGHT));
  if (!unlockedAtoms(state.book).includes(state.selected)) state.selected = 'H';
  asker = makeAsker({ onAnswer: answered });

  setupTools();
  buildPalette();
  setupPointer();
  setupDialogs();
  listenForUnlock();
  primeSpeech(document, window.speechSynthesis, window.SpeechSynthesisUtterance);
  new ResizeObserver(resizeCanvas).observe(frame);
  resizeCanvas();
  fetchDatabase();
  askAboutBigOnes();
  window.addEventListener('online', () => {
    fetchDatabase();
    askAboutBigOnes();
  });
}

/**
 * Ask PubChem about every big molecule still waiting (⏳), and every big
 * 💡 invention it hasn't been asked about (inventions from before PubChem
 * names, which might be real molecules). Runs when the page opens and
 * when the internet comes back.
 * @returns {void}
 */
function askAboutBigOnes() {
  asker.retry();
  /**
   * Too big for our list, and PubChem hasn't answered about it yet?
   * @param {string} label - a molecule
   * @returns {boolean} true if we should ask
   */
  const big = (label) => heavyCount(label) > FULL_SEARCH_MAX && !Object.hasOwn(state.book.asked, label);
  for (const { label } of [...state.book.pending, ...state.book.inventions]) if (big(label)) asker.ask(label);
}

/**
 * PubChem answered about a big molecule (or didn't: answer null).
 * @param {string} label - which molecule
 * @param {{cid: number, name?: string}|null} answer - its answer
 * @returns {void}
 */
function answered(label, answer) {
  if (answer) state.book.asked[label] = answer;
  else if (awaitingCard.has(label)) {
    // No answer (no internet?): show the ⏳ card now, and look it up later.
    awaitingCard.delete(label);
    const item = state.book.pending.find((p) => p.label === label);
    state.cards.push({ ...cardWords({ kind: 'pending' }, { again: false, name: null }), layout: item?.layout ?? createBoard(1, 1), sound: CHEER });
  }
  settle();
}

/**
 * Sort out everything we can now that something new is known (the big
 * list arrived, or PubChem answered): ⏳ molecules get their names, and
 * 💡 inventions PubChem knows become 🌟. Shows name cards for molecules
 * finished just now, and unlock cards.
 * @returns {void}
 */
function settle() {
  /**
   * What a molecule is, with everything we know right now.
   * @param {string} label - a molecule
   * @returns {object} its lookup result
   */
  const look = (label) => lookUp(label, kids, state.database, state.book.asked);
  const { unlocked, settled } = resolvePending(state.book, look);
  const promoted = promoteInventions(state.book, look);
  for (const { label, layout, result, recorded } of settled) {
    if (!awaitingCard.delete(label)) continue; // finished long ago: no card
    state.cards.push({ ...cardWords(result, recorded), layout, sound: CHEER });
  }
  const opened = [...unlocked, ...promoted.unlocked];
  for (const el of opened) queueUnlockCard(el);
  save();
  if (opened.length) buildPalette();
  showNextCard();
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
 * Save, and show "can't save here" if it didn't work.
 * @returns {void}
 */
function save() {
  byId('save-problem').hidden = saveState(storage(), state);
}

/**
 * Fetch the big name list in the background. When it arrives, sort out
 * molecules that were waiting (⏳) for it.
 * @returns {Promise<void>} finishes when tried
 */
async function fetchDatabase() {
  if (state.database || loading) return; // got it, or already fetching it (only one copy at a time!)
  loading = loadDatabase();
  const database = await loading;
  loading = null;
  if (!database) return; // offline: we'll try again when the internet comes back
  state.database = database;
  settle();
}

/** The big list while it's being fetched (null when not fetching). */
let loading = null;

// ---- Tools and palette ----

/**
 * Hook up the 🧱 ⛏️ 🔗 tool buttons and 🗑️.
 * @returns {void}
 */
function setupTools() {
  for (const button of document.querySelectorAll('[data-tool]')) {
    button.addEventListener('click', () => setTool(button.dataset.tool));
  }
  byId('clear').addEventListener('click', () => {
    state.board = createBoard(BOARD_WIDTH, BOARD_HEIGHT);
    save();
    draw();
  });
}

/**
 * Choose a tool.
 * @param {string} tool - 'place', 'remove' or 'bond'
 * @returns {void}
 */
function setTool(tool) {
  state.tool = tool;
  const buttons = [...document.querySelectorAll('[data-tool]')];
  choose(buttons, buttons.find((b) => b.dataset.tool === tool));
}

/**
 * Make the atom buttons: unlocked ones show the atom, locked ones a 🔒.
 * @returns {void}
 */
function buildPalette() {
  const palette = byId('atoms');
  palette.replaceChildren();
  const open = unlockedAtoms(state.book);
  for (const el of ALL_ATOMS) {
    const button = document.createElement('button');
    button.className = 'block atom-button';
    button.dataset.atom = el;
    if (!open.includes(el)) {
      button.disabled = true;
      button.textContent = '🔒';
      button.setAttribute('aria-label', 'Locked atom');
    } else {
      button.setAttribute('aria-label', `${ATOM_INFO[el].name}, ${HANDS[el]} hands`);
      button.append(atomPicture(el));
      button.addEventListener('click', () => {
        state.selected = el;
        setTool('place');
        markSelected();
        speak(handWords(el).replace(' with 🔗', ' with the bond tool'));
      });
    }
    palette.append(button);
  }
  markSelected();
}

/**
 * Press in the chosen atom's button.
 * @returns {void}
 */
function markSelected() {
  const buttons = [...document.querySelectorAll('[data-atom]')];
  choose(buttons, buttons.find((b) => b.dataset.atom === state.selected) ?? null);
}

/**
 * A small canvas showing one atom with all its hands free.
 * @param {string} el - the atom
 * @returns {HTMLCanvasElement} the picture
 */
function atomPicture(el) {
  const size = 44;
  const ratio = window.devicePixelRatio || 1;
  const picture = document.createElement('canvas');
  picture.width = size * ratio;
  picture.height = size * ratio;
  picture.style.width = `${size}px`;
  picture.style.height = `${size}px`;
  const pctx = picture.getContext('2d');
  pctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  drawAtom(pctx, el, size / 2, size / 2, size * 0.9, { free: HANDS[el] });
  return picture;
}

// ---- The board ----

/**
 * Make the canvas as big as fits in its box, sharp on Retina screens.
 * @returns {void}
 */
function resizeCanvas() {
  const border = BOARD_BORDER_PX * 2;
  const cell = fitCellSize(frame.clientWidth - border, frame.clientHeight - border, state.board);
  if (cell === state.cell) return;
  state.cell = cell;
  const ratio = window.devicePixelRatio || 1;
  const size = pictureSize(state.board, cell);
  canvas.style.width = `${size.width}px`;
  canvas.style.height = `${size.height}px`;
  canvas.width = Math.round(size.width * ratio);
  canvas.height = Math.round(size.height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  draw();
}

/**
 * Redraw the board: glowing finished molecules, red stuck hands, 💥.
 * @returns {void}
 */
function draw() {
  if (!state.cell) return;
  const groups = findGroups(state.board);
  const glow = new Set(groups.filter((g) => g.finished).flatMap((g) => g.cells));
  const stuck = new Set(groups.flatMap((g) => g.stuck));
  const now = Date.now();
  for (const [cell, until] of state.boom) if (until <= now) state.boom.delete(cell);
  drawBoard(ctx, state.board, state.cell, { glow, stuck, boom: new Set(state.boom.keys()), aim: state.aim });
}

/**
 * Do something to the board, then cheer for new molecules, 💥 for newly
 * stuck atoms, save, and redraw.
 * @param {Function} change - changes state.board; returns true if anything changed
 * @returns {void}
 */
function changeBoard(change) {
  const before = findGroups(state.board);
  if (!change()) return;
  const after = findGroups(state.board);

  const wasStuck = new Set(before.flatMap((g) => g.stuck));
  const newlyStuck = after.flatMap((g) => g.stuck).filter((cell) => !wasStuck.has(cell));
  if (newlyStuck.length) {
    for (const cell of newlyStuck) state.boom.set(cell, Date.now() + BOOM_MS);
    flash(frame, 'nope', 400);
    setTimeout(draw, BOOM_MS + 20);
  }

  for (const group of newlyFinished(before, after)) finished(group);
  save();
  draw();
  showNextCard();
}

/**
 * A molecule was just finished: look it up, put it in the book, and
 * get its name card (and any unlock cards) ready.
 * @param {{cells: number[]}} group - the finished group
 * @returns {void}
 */
function finished(group) {
  const label = canonLabel(groupGraph(state.board, group.cells));
  const layout = groupLayout(state.board, group.cells);
  const result = lookUp(label, kids, state.database, state.book.asked);
  const recorded = record(state.book, label, layout, result);
  if (result.ask) {
    // Too big for our list: ask PubChem, and show the card when it answers.
    awaitingCard.add(label);
    asker.retry(); // if it got no answer before, ask again now
    asker.ask(label);
  } else state.cards.push({ ...cardWords(result, recorded), layout, sound: CHEER });
  for (const el of recorded.unlocked) queueUnlockCard(el);
  if (recorded.unlocked.length) buildPalette();
}

/**
 * Get a "🔓 Carbon! 4 hands!" card ready.
 * @param {string} el - the atom that just unlocked
 * @returns {void}
 */
function queueUnlockCard(el) {
  const layout = createBoard(1, 1);
  layout.atoms[0] = el;
  state.cards.push({
    name: `${ATOM_INFO[el].name}!`,
    badge: '🔓 New atom!',
    fact: handWords(el),
    layout,
    hands: true,
    sound: FANFARE,
  });
}

// ---- Fingers ----

/**
 * Listen for fingers (and mice) on the board.
 * @returns {void}
 */
function setupPointer() {
  canvas.addEventListener('pointerdown', (event) => {
    if (pointer) return;
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      // Still works without capture.
    }
    const point = pointFrom(event);
    pointer = { id: event.pointerId, ...point };
    if (state.tool === 'bond') aimBond(point, cellAt(point));
    else paintLine(point, point);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!pointer || event.pointerId !== pointer.id) return;
    const point = pointFrom(event);
    if (state.tool === 'bond') {
      aimBond(point, state.aim?.from ?? null);
      return;
    }
    paintLine(pointer, point);
    pointer = { id: pointer.id, ...point };
  });
  window.addEventListener('pointerup', (event) => {
    if (pointer?.id !== event.pointerId) return;
    pointer = null;
    if (state.tool === 'bond') bondNow();
  });
  window.addEventListener('pointercancel', (event) => {
    if (pointer?.id !== event.pointerId) return;
    pointer = null;
    aimBond(null, null); // the iPad took the finger away (a swipe, a call): don't bond
  });
}

/**
 * Which cell a point is in (or null off the board).
 * @param {{x: number, y: number}} point - a position on the board, in CSS pixels
 * @returns {number|null} the cell number
 */
function cellAt(point) {
  return cellAtPoint(state.board, point.x / state.cell, point.y / state.cell);
}

/**
 * Where a pointer is, from the board's top-left corner (inside its border).
 * @param {PointerEvent} event - the pointer event
 * @returns {{x: number, y: number}} the position in CSS pixels
 */
function pointFrom(event) {
  const box = canvas.getBoundingClientRect();
  return { x: event.clientX - box.left - canvas.clientLeft, y: event.clientY - box.top - canvas.clientTop };
}

/**
 * PLACE or REMOVE every cell along a finger's path.
 * @param {{x: number, y: number}} from - where the finger was
 * @param {{x: number, y: number}} to - where it is now
 * @returns {void}
 */
function paintLine(from, to) {
  changeBoard(() => {
    let changed = false;
    for (const i of cellsAlong(state.board, from, to, state.cell)) {
      changed = (state.tool === 'place' ? placeAtom(state.board, i, state.selected) : removeAtom(state.board, i)) || changed;
    }
    return changed;
  });
}

/**
 * 🔗 BOND, while the finger is down: work out which two atoms it means
 * (or which sulfur/phosphorus atom), and show them glowing with what will
 * happen (🔗 ✂️ ✋ ✊ or 🚫).
 * @param {{x: number, y: number}|null} point - where the finger is (null = stop aiming)
 * @param {number|null} from - the cell the finger first touched
 * @returns {void}
 */
function aimBond(point, from) {
  if (!point) state.aim = null;
  else {
    // Still on the middle of the sulfur/phosphorus it started on: its hands.
    const atom = atomTarget(point.x, point.y, state.cell, state.board);
    if (atom !== null && atom === from) state.aim = { from, pair: null, atom, will: handsPreview(state.board, atom) };
    else {
      const pair = bondTarget(point.x, point.y, state.cell, state.board, from);
      state.aim = { from, pair, atom: null, will: pair && bondPreview(state.board, ...pair) };
    }
  }
  draw();
}

/**
 * 🔗 BOND, when the finger lifts: do it to the two atoms it was aiming at.
 * @returns {void}
 */
function bondNow() {
  const aim = state.aim;
  state.aim = null;
  if (aim?.will === 'nothing') flash(frame, 'nope', 400); // 🚫: those two can't change
  if (aim?.pair) {
    changeBoard(() => {
      const before = bondsText(state.board);
      tapBond(state.board, ...aim.pair);
      return bondsText(state.board) !== before;
    });
  } else if (aim?.atom !== null && aim?.atom !== undefined) {
    changeBoard(() => tapAtom(state.board, aim.atom) > 0);
  }
  draw(); // takes the glow away
}

// ---- Cards, book, grown-up corner ----

/**
 * Say something out loud (if this browser can).
 * @param {string} text - what to say
 * @returns {void}
 */
function speak(text) {
  try {
    speechSynthesis.cancel();
    const words = new SpeechSynthesisUtterance(text);
    words.rate = 0.9;
    speechSynthesis.speak(words);
  } catch {
    // No voice: the card's words are enough.
  }
}

/**
 * Play notes one after another (a little tune).
 * @param {number[]} notes - MIDI numbers
 * @returns {void}
 */
function playTune(notes) {
  notes.forEach((midi, k) => setTimeout(() => playTones([midi]), k * 140));
}

/**
 * Show the next waiting name card, if no card is showing.
 * @returns {void}
 */
function showNextCard() {
  const dialog = byId('card');
  if (dialog.open || state.cards.length === 0) return;
  const card = state.cards.shift();
  byId('card-badge').textContent = card.badge;
  byId('card-name').textContent = card.name;
  byId('card-name').classList.toggle('long-name', card.name.length > LONG_NAME); // smaller letters for long PubChem names
  byId('card-fact').textContent = card.fact;
  byId('card-picture').replaceChildren(picture(card.layout, card.hands, CARD_CELL_PX));
  dialog.showModal();
  if (card.sound === FANFARE) playTune(FANFARE);
  else playTones(card.sound);
  speak(card.name);
}

/**
 * A book picture of a molecule, the way it was built.
 * @param {{width: number, height: number}} layout - the little board
 * @param {boolean} [hands] - draw free hands (for a single new atom)
 * @param {number} [cell] - cell size in CSS pixels
 * @returns {HTMLCanvasElement} the picture
 */
function picture(layout, hands = false, cell = PICTURE_CELL_PX) {
  const ratio = window.devicePixelRatio || 1;
  const pic = document.createElement('canvas');
  pic.className = 'molecule-picture';
  const size = pictureSize(layout, cell); // old square pictures and new six-sided ones
  pic.width = Math.round(size.width * ratio);
  pic.height = Math.round(size.height * ratio);
  pic.style.width = `${size.width}px`;
  pic.style.height = `${size.height}px`;
  const pctx = pic.getContext('2d');
  pctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  drawBoard(pctx, layout, cell, { grid: false, hands });
  return pic;
}

/**
 * Hook up the name card, the 📖 book and the ⚙️ grown-up corner.
 * @returns {void}
 */
function setupDialogs() {
  byId('card').addEventListener('close', showNextCard);
  byId('open-book').addEventListener('click', () => {
    showBookTab('found');
    byId('book').showModal();
  });
  for (const button of document.querySelectorAll('[data-book-tab]')) {
    button.addEventListener('click', () => showBookTab(button.dataset.bookTab));
  }
  byId('open-grownup').addEventListener('click', () => byId('grownup').showModal());
  byId('unlock-all').addEventListener('click', () => {
    unlockAll(state.book);
    save();
    buildPalette();
  });
  setupInventionWindow();
  byId('reset-book').addEventListener('click', () => {
    if (!window.confirm('Erase the whole collection book and the board? This can’t be undone.')) return;
    state.board = createBoard(BOARD_WIDTH, BOARD_HEIGHT);
    state.book = createBook();
    asker = makeAsker({ onAnswer: answered }); // a fresh asker: the old one remembers what it asked
    state.selected = 'H';
    save();
    buildPalette();
    draw();
  });
}

/** The label of the 💡 invention showing in its window (null = none). */
let openLabel = null;

/**
 * Open the window for one 💡 invention: its big picture and its name.
 * 🧪 Try this! Add speak(invention.name) at the end so it says the name
 * as soon as the window opens.
 * @param {string} label - which invention
 * @returns {void}
 */
function openInvention(label) {
  const invention = state.book.inventions.find((r) => r.label === label);
  if (!invention) return;
  openLabel = label;
  byId('invention-picture').replaceChildren(picture(invention.layout, false, CARD_CELL_PX));
  byId('invention-name').textContent = invention.name;
  showRenaming(false);
  byId('invention').showModal();
}

/**
 * Switch the invention window between showing the name and the name box.
 * @param {boolean} on - true to show the box (with the name ready to type over)
 * @returns {void}
 */
function showRenaming(on) {
  const name = byId('invention-name');
  const box = byId('rename-box');
  name.hidden = on;
  byId('rename-row').hidden = !on;
  byId('invention-rename').hidden = on;
  if (on) {
    box.value = name.textContent;
    box.focus(); // on an iPad this pops the keyboard up
    box.select(); // so the first letter typed replaces the old name
  } else if (box === document.activeElement) {
    byId('invention-rename').focus(); // the box is hidden now: keep the finger (or keys) in the window
  }
}

/**
 * Save the name in the box: the window, the book and the save all get it,
 * and the room says it. A blank box just goes back to the old name.
 * @returns {void}
 */
function saveRename() {
  if (renameInvention(state.book, openLabel, byId('rename-box').value)) {
    save();
    const { name } = state.book.inventions.find((r) => r.label === openLabel);
    byId('invention-name').textContent = name;
    showBookTab('inventions'); // the tile behind the window gets the new name too
    speak(name);
  }
  showRenaming(false);
}

/**
 * Hook up the 💡 invention window's buttons.
 * @returns {void}
 */
function setupInventionWindow() {
  const box = byId('rename-box');
  box.maxLength = INVENTION_NAME_MAX;
  byId('invention-say').addEventListener('click', () => speak(byId('invention-name').textContent));
  byId('invention-rename').addEventListener('click', () => showRenaming(true));
  byId('rename-save').addEventListener('click', saveRename);
  // Enter saves (instead of pressing 👍 Done and closing the window).
  // Esc just stops renaming; a second Esc closes the window.
  box.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== 'Escape') return;
    event.preventDefault();
    if (event.key === 'Enter') saveRename();
    else showRenaming(false);
  });
  byId('invention').addEventListener('close', () => {
    openLabel = null;
  });
}

/**
 * Fill the book with one tab's molecules.
 * @param {string} tab - 'found', 'rare' or 'inventions'
 * @returns {void}
 */
function showBookTab(tab) {
  const tabs = [...document.querySelectorAll('[data-book-tab]')];
  choose(tabs, tabs.find((b) => b.dataset.bookTab === tab));
  const list = byId('book-list');
  list.replaceChildren();
  if (tab === 'found') {
    for (const rung of LADDER) {
      const heading = document.createElement('h3');
      heading.textContent = rung.unlocks.map((el) => ATOM_INFO[el].emoji).join(' ');
      list.append(heading);
      for (const entry of KID_MOLECULES.filter((k) => k.step === rung.step)) list.append(foundTile(entry));
    }
  } else if (tab === 'rare') {
    for (const item of state.book.pending) list.append(tile(item.layout, '⏳ …', null));
    for (const item of state.book.rare) list.append(tile(item.layout, item.name, item.name, item.realName));
    const credit = document.createElement('p');
    credit.className = 'credit';
    credit.textContent = 'Rare names come from PubChem (pubchem.ncbi.nlm.nih.gov).';
    list.append(credit);
  } else {
    for (const item of state.book.inventions) {
      const button = tile(item.layout, item.name, null);
      button.addEventListener('click', () => openInvention(item.label));
      list.append(button);
    }
  }
  if (!list.querySelector('.book-tile')) {
    const empty = document.createElement('p');
    empty.textContent = 'Nothing here yet. Keep building!';
    list.prepend(empty);
  }
}

/**
 * A 📖 tile: the picture and name if found, or a ❓ and an atom hint if not.
 * @param {{smiles: string, name: string, fact: string}} entry - a hand-written molecule
 * @returns {HTMLElement} the tile
 */
function foundTile(entry) {
  const label = labelsOf(entry).find((l) => state.book.found.includes(l));
  if (!label) {
    const hint = tile(null, atomHint(entry.smiles), null);
    hint.classList.add('not-found');
    return hint;
  }
  return tile(state.book.pictures[label] ?? null, entry.name, `${entry.name}. ${entry.fact}`);
}

/**
 * One tile in the book. Tapping it says its words.
 * @param {object|null} layout - the picture, or null for a ❓
 * @param {string} text - the words under it
 * @param {string|null} say - what to say when tapped (null = nothing)
 * @param {string} [small] - smaller words under those (a 🌟's real name, when Caleb named it himself)
 * @returns {HTMLElement} the tile
 */
function tile(layout, text, say, small) {
  const button = document.createElement('button');
  button.type = 'button'; // a plain button: tapping it mustn't close the book
  button.className = 'book-tile';
  if (layout) button.append(picture(layout));
  else {
    const mystery = document.createElement('span');
    mystery.className = 'mystery';
    mystery.textContent = '❓';
    button.append(mystery);
  }
  const words = document.createElement('span');
  words.textContent = text;
  button.append(words);
  if (small) {
    const real = document.createElement('small');
    real.className = 'real-name';
    real.textContent = small;
    button.append(real);
  }
  if (say) button.addEventListener('click', () => speak(say));
  return button;
}
