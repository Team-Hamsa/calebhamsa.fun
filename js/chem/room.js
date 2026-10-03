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
 *   🔗 BOND    tap between two atoms: one more stick, or pull them apart
 *
 * chem.html calls initChem() once. Everything else here only runs after that.
 */
import { BOARD_HEIGHT, BOARD_WIDTH, createBoard, findGroups, groupGraph, groupLayout, newlyFinished, placeAtom, removeAtom, tapBond } from './board.js';
import { ALL_ATOMS, LADDER, createBook, nameNewestInvention, record, resolvePending, unlockAll, unlockedAtoms } from './book.js';
import { canonLabel } from './canon.js';
import { ATOM_INFO, drawAtom, drawBoard } from './chem-art.js';
import { KID_MOLECULES } from './kid-names.js';
import { kidIndex, loadDatabase, lookUp } from './lookup.js';
import { loadState, saveState } from './save.js';
import { HANDS, parseSmiles } from './smiles.js';
import { cellsAlongLine, choose, flash } from '../ui.js';
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

/** How big the name card's picture is drawn, per cell (bigger: it's the star). */
const CARD_CELL_PX = 44;

// =============================================================
// Pure helpers (no screen needed, so tests/chem-room.test.js checks them)
// =============================================================

/**
 * How big each cell can be so the whole board fits in the box.
 * @param {number} boxWidth - the space we have, in CSS pixels
 * @param {number} boxHeight - the space we have, in CSS pixels
 * @param {number} columns - cells across
 * @param {number} rows - cells down
 * @returns {number} the cell size in whole pixels (at least 1)
 */
export function fitCellSize(boxWidth, boxHeight, columns, rows) {
  return Math.max(1, Math.floor(Math.min(boxWidth / columns, boxHeight / rows)));
}

/**
 * 🔗 BOND: which two cells did a tap mean? The cell under the finger,
 * and the neighbor on the side the finger is closest to.
 * @param {number} x - finger position, in pixels from the board's left
 * @param {number} y - finger position, in pixels from the board's top
 * @param {number} cell - cell size in pixels
 * @param {number} width - cells across
 * @param {number} height - cells down
 * @returns {[number, number]|null} the two cell numbers, or null if off the board
 */
export function bondTarget(x, y, cell, width, height) {
  const cx = Math.floor(x / cell);
  const cy = Math.floor(y / cell);
  if (cx < 0 || cy < 0 || cx >= width || cy >= height) return null;
  const dx = x / cell - cx - 0.5; // −0.5 (left edge) … +0.5 (right edge)
  const dy = y / cell - cy - 0.5;
  let nx = cx;
  let ny = cy;
  if (Math.abs(dx) >= Math.abs(dy)) nx += dx < 0 ? -1 : 1;
  else ny += dy < 0 ? -1 : 1;
  if (nx < 0 || ny < 0 || nx >= width || ny >= height) return null;
  return [cy * width + cx, ny * width + nx];
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
  if (result.kind === 'rare') return { name: result.name, badge: `🌟 Super rare!${again}`, fact: 'A real molecule, with its real chemistry name.' };
  if (result.kind === 'invention') return { name: recorded.name, badge: `💡 Your invention!${again}`, fact: 'Nobody has a name for this one. You made it up!' };
  return { name: 'Finished!', badge: '⏳', fact: "I'll look up its name when we have internet." };
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
};

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

  setupTools();
  buildPalette();
  setupPointer();
  setupDialogs();
  listenForUnlock();
  new ResizeObserver(resizeCanvas).observe(frame);
  resizeCanvas();
  fetchDatabase();
  window.addEventListener('online', fetchDatabase);
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
  if (state.database) return;
  const database = await loadDatabase();
  if (!database) return; // offline: we'll try again when the internet comes back
  state.database = database;
  const unlocked = resolvePending(state.book, (label) => lookUp(label, kids, database));
  for (const el of unlocked) queueUnlockCard(el);
  save();
  buildPalette();
  showNextCard();
}

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
        speak(`${ATOM_INFO[el].name}. ${HANDS[el]} ${HANDS[el] === 1 ? 'hand' : 'hands'}.`);
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
  const cell = fitCellSize(frame.clientWidth - border, frame.clientHeight - border, BOARD_WIDTH, BOARD_HEIGHT);
  if (cell === state.cell) return;
  state.cell = cell;
  const ratio = window.devicePixelRatio || 1;
  canvas.style.width = `${cell * BOARD_WIDTH}px`;
  canvas.style.height = `${cell * BOARD_HEIGHT}px`;
  canvas.width = Math.round(cell * BOARD_WIDTH * ratio);
  canvas.height = Math.round(cell * BOARD_HEIGHT * ratio);
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
  drawBoard(ctx, state.board, state.cell, { glow, stuck, boom: new Set(state.boom.keys()) });
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
  const result = lookUp(label, kids, state.database);
  const recorded = record(state.book, label, layout, result);
  state.cards.push({ ...cardWords(result, recorded), layout, sound: CHEER });
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
    fact: `${ATOM_INFO[el].name} has ${HANDS[el]} ${HANDS[el] === 1 ? 'hand' : 'hands'}.`,
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
    if (state.tool === 'bond') bondAt(point);
    else paintLine(point, point);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!pointer || event.pointerId !== pointer.id || state.tool === 'bond') return;
    const point = pointFrom(event);
    paintLine(pointer, point);
    pointer = { id: pointer.id, ...point };
  });
  for (const type of ['pointerup', 'pointercancel']) {
    window.addEventListener(type, (event) => {
      if (pointer?.id === event.pointerId) pointer = null;
    });
  }
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
    for (const [x, y] of cellsAlongLine(from.x, from.y, to.x, to.y, state.cell)) {
      if (x < 0 || y < 0 || x >= BOARD_WIDTH || y >= BOARD_HEIGHT) continue;
      const i = y * BOARD_WIDTH + x;
      changed = (state.tool === 'place' ? placeAtom(state.board, i, state.selected) : removeAtom(state.board, i)) || changed;
    }
    return changed;
  });
}

/**
 * 🔗 BOND: tap between two atoms.
 * @param {{x: number, y: number}} point - where the finger is
 * @returns {void}
 */
function bondAt(point) {
  const target = bondTarget(point.x, point.y, state.cell, BOARD_WIDTH, BOARD_HEIGHT);
  changeBoard(() => {
    if (!target) return false;
    const before = [state.board.right.slice(), state.board.down.slice()].join();
    tapBond(state.board, ...target);
    return [state.board.right, state.board.down].join() !== before;
  });
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
  pic.width = layout.width * cell * ratio;
  pic.height = layout.height * cell * ratio;
  pic.style.width = `${layout.width * cell}px`;
  pic.style.height = `${layout.height * cell}px`;
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
  byId('name-invention').addEventListener('click', () => {
    if (!state.book.inventions.length) return;
    const name = window.prompt('A name for the newest 💡 invention?', state.book.inventions[0].name);
    if (name && nameNewestInvention(state.book, name)) save();
  });
  byId('reset-book').addEventListener('click', () => {
    if (!window.confirm('Erase the whole collection book and the board? This can’t be undone.')) return;
    state.board = createBoard(BOARD_WIDTH, BOARD_HEIGHT);
    state.book = createBook();
    state.selected = 'H';
    save();
    buildPalette();
    draw();
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
    for (const item of state.book.rare) list.append(tile(item.layout, item.name, item.name));
    const credit = document.createElement('p');
    credit.className = 'credit';
    credit.textContent = 'Rare names come from PubChem (pubchem.ncbi.nlm.nih.gov).';
    list.append(credit);
  } else {
    for (const item of state.book.inventions) list.append(tile(item.layout, item.name, item.name));
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
  const label = canonLabel(parseSmiles(entry.smiles));
  if (!state.book.found.includes(label)) {
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
 * @returns {HTMLElement} the tile
 */
function tile(layout, text, say) {
  const button = document.createElement('button');
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
  if (say) button.addEventListener('click', () => speak(say));
  return button;
}
