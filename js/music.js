/**
 * music.js — makes the Note Blocks page work.
 *
 * This file is the "hands and mouth" of the music page. It:
 *   1. builds the note blocks on the screen (one octave, or two),
 *   2. listens for taps and computer-key presses,
 *   3. makes sounds through sound.js (the Web Audio API, no sound files!),
 *   4. records tunes and plays them back,
 *   5. runs the modes: NOTES, CHORDS, SCALES and GUESS IT!
 *
 * All the music *math* lives in music-theory.js; this file just asks it
 * questions. music.html calls initMusic() once, when the page loads.
 */
import {
  MAX_OCTAVE, buildChord, buildScale, clampOctave, fitInOctave, isBlackKey, isSameNote,
  octaveStart, pitchClass, pitchName,
} from './music-theory.js';
import { VOICES, listenForUnlock, playTones } from './sound.js';
import { choose, flash } from './ui.js';

// =============================================================
// Settings to play with
// =============================================================

/** How long a block stays lit after it plays, in milliseconds. */
const LIGHT_MS = 300;

/**
 * How long the 👑 crown stays on a chord's root block, in milliseconds.
 * It stays longer than the light so there's time to spot it.
 */
const ROOT_MS = 900;

/**
 * Time between notes when playing a scale, in milliseconds.
 * 🧪 Try this! 150 to zoom up the stairs, 800 to climb slowly.
 */
const SCALE_STEP_MS = 350;

/** Time between notes in the "you got it!" celebration, in milliseconds. */
const ARPEGGIO_MS = 120;

/** After a wrong guess, wait this long, then play the mystery again. */
const REPLAY_DELAY_MS = 700;

/**
 * Which computer key plays which block, counted in half steps above C.
 * The middle row (a s d f g h j) plays the white keys. The row above it
 * (w e t y u) plays the black keys: the same shape as a real piano.
 * With two octaves on screen, k o l p ; keep going: C C♯ D D♯ E up high.
 */
const KEY_TO_OFFSET = {
  a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11,
  k: 12, o: 13, l: 14, p: 15, ';': 16,
};

/**
 * Which grid column each block starts in. The keyboard grid has 14 thin
 * columns and every block is 2 columns wide. White keys sit side by side
 * (columns 1, 3, 5, ...). Each black key starts halfway across the white
 * key to its left, so it sits over the gap, like on a piano.
 * Position in this list = half steps above C.
 */
const KEY_COLUMNS = [1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12, 13];

/**
 * How many blocks the keyboard has: one octave, or two side by side.
 * Two octaves fit every chord and every scale, in every key, with no
 * notes running off the end.
 */
const ONE_OCTAVE = 12;
const TWO_OCTAVES = 24;

// =============================================================
// What's happening right now ("state")
// =============================================================

/** Everything the page needs to remember while Caleb plays. */
const state = {
  octave: 4,           // which octave the blocks play (4 = around middle C)
  useFlats: false,     // label black keys with ♭ (true) or ♯ (false)
  mode: 'notes',       // 'notes' | 'chords' | 'scales' | 'guess'
  voice: 'soft',       // one of the VOICES
  isRecording: false,
  recordStartedAt: 0,  // the clock time when recording began (milliseconds)
  recordedEvents: [],  // [{ time: ms after the start, notes: [midi, ...] }, ...]
  chordType: 'major',  // one of the CHORDS recipes in music-theory.js
  fitChords: true,     // squeeze chords onto the 12 blocks (true) or stack them up high (false)
  wide: false,         // two octaves of blocks (true) or one (false)
  scaleRoot: 0,        // the scale's key, as half steps above C (0 = C, 7 = G)
  scaleType: 'major',  // one of the SCALES recipes in music-theory.js
  guessKind: 'note',   // 'note' = "Which note?", 'chord' = "Major or minor?"
  mystery: null,       // the puzzle being guessed: { kind, notes, answer }, or null
  score: 0,            // ⭐ right answers in a row (a wrong one sends it back to 0)
  best: 0,             // 🏆 the most stars in a row ever, for this guessKind
};

/** Start of the name the 🏆 best scores are saved under, e.g. "calebhamsa.best.note". */
const BEST_KEY = 'calebhamsa.best.';

/** The name the "↔ 2 octaves" choice is saved under. */
const WIDE_KEY = 'calebhamsa.wide';

/**
 * Screens at least this big on their SHORT side (in CSS pixels) start
 * with two octaves of blocks. Every iPad is bigger (the mini is 744);
 * phones are much smaller (about 390), even turned sideways.
 * 🧪 Try this! Change it to 9999 so every screen starts with one octave.
 */
const BIG_SCREEN_PX = 700;

/** The block buttons (12 or 24). Position = half steps above the first C. Filled by buildKeyboard(). */
let noteBlocks = [];

/** The NOTES / CHORDS / SCALES / GUESS IT! buttons. Filled by initMusic(). */
let modeButtons = [];

/** Timers for notes waiting to be played back, so we can cancel them. */
let playbackTimers = [];

/** Timers for the notes of a scale being played, so we can cancel them. */
let scaleTimers = [];

/** The "which note?" / "major or minor?" buttons. Filled by setupGuessIt(). */
let guessKindButtons = [];

/** The "play the mystery again" timer after a wrong guess (see tryAgain). */
let replayTimer = null;

/**
 * Shortcut for finding an element by its id="...".
 * @param {string} id - the element's id
 * @returns {HTMLElement} the element
 */
const byId = (id) => document.getElementById(id);

// =============================================================
// Starting up
// =============================================================

/**
 * Set up the whole page: build the blocks and connect every button.
 * music.html calls this once.
 * @returns {void}
 */
export function initMusic() {
  showWide(loadWide()); // builds the blocks, writes their names, shows the octave

  modeButtons = [...document.querySelectorAll('[data-mode]')];
  for (const button of modeButtons) {
    button.addEventListener('click', () => setMode(button.dataset.mode));
  }

  const voiceButtons = [...document.querySelectorAll('[data-voice]')];
  for (const button of voiceButtons) {
    button.addEventListener('click', () => {
      state.voice = button.dataset.voice;
      choose(voiceButtons, button);
      soundNotes([octaveStart(state.octave)]); // play a C so you hear the new voice
    });
  }

  byId('flats-toggle').addEventListener('click', () => {
    state.useFlats = !state.useFlats;
    updateLabels();
  });
  byId('octave-down').addEventListener('click', () => changeOctave(-1));
  byId('octave-up').addEventListener('click', () => changeOctave(+1));
  byId('wide-toggle').addEventListener('click', () => setWide(!state.wide));
  byId('record').addEventListener('click', toggleRecording);
  byId('play-back').addEventListener('click', playBack);

  setupChordsAndScales();
  setupGuessIt();

  document.addEventListener('keydown', handleKeyDown);
  listenForUnlock();
}

/**
 * Make the note-block buttons (one octave or two) and put them in the
 * keyboard grid. Calling it again throws the old blocks away first.
 * @returns {void}
 */
function buildKeyboard() {
  const keyboard = byId('keyboard');
  keyboard.replaceChildren(); // empty it first
  keyboard.classList.toggle('wide', state.wide); // blocks.css: twice as many columns
  noteBlocks = [];

  const count = state.wide ? TWO_OCTAVES : ONE_OCTAVE;
  for (let offset = 0; offset < count; offset++) {
    const block = document.createElement('button');
    block.className = `block note ${isBlackKey(offset) ? 'sharp' : 'natural'}`;
    block.dataset.pc = String(pitchClass(offset)); // blocks.css uses this to pick the color
    block.style.gridColumn = `${blockColumn(offset)} / span 2`;

    // "pointerdown" fires the instant a finger touches, which feels snappier
    // for music than "click" (which waits for the finger to lift).
    block.addEventListener('pointerdown', () => handleBlockTap(offset));
    // Keyboard users press Enter or Space on a focused button. That makes a
    // "click" with detail 0 (zero mouse clicks), so we play the note then too.
    block.addEventListener('click', (event) => {
      if (event.detail === 0) handleBlockTap(offset);
    });

    keyboard.append(block);
    noteBlocks.push(block);
  }
}

/**
 * Which grid column a block starts in. The second octave copies the
 * first one, shifted 14 columns (one octave's width) to the right.
 * @param {number} offset - which block: half steps above the first C (0–23)
 * @returns {number} the grid column, counting from 1
 */
export function blockColumn(offset) {
  const octave = Math.floor(offset / 12);
  return KEY_COLUMNS[pitchClass(offset)] + octave * 14;
}

/**
 * The highest octave the ▶ button can reach. With two octaves of blocks,
 * the top octave is already showing as the right half, so we stop one sooner.
 * @param {boolean} wide - are two octaves of blocks showing?
 * @returns {number} the highest octave for the left-hand blocks
 */
export function highestOctave(wide) {
  return wide ? MAX_OCTAVE - 1 : MAX_OCTAVE;
}

/**
 * Switch between one octave of blocks and two, and remember the choice.
 * @param {boolean} wide - true for two octaves
 * @returns {void}
 */
function setWide(wide) {
  saveWide(wide);
  showWide(wide);
}

/**
 * Show one octave of blocks or two (without saving the choice, so the
 * starting guess from the screen size isn't remembered as a choice).
 * @param {boolean} wide - true for two octaves
 * @returns {void}
 */
function showWide(wide) {
  state.wide = wide;
  byId('wide-toggle').setAttribute('aria-pressed', String(wide));
  // Everything fits on two octaves, so chords never need squeezing.
  byId('fit-toggle').hidden = wide;
  buildKeyboard();
  updateLabels();
  updateScaleGlow();
  changeOctave(0); // pull the octave back into range if it's now too high
}

// =============================================================
// Labels and octaves
// =============================================================

/**
 * Write the note names on the blocks, using sharps or flats.
 * @returns {void}
 */
function updateLabels() {
  noteBlocks.forEach((block, offset) => {
    block.textContent = pitchName(offset, { useFlats: state.useFlats });
  });
  byId('flats-toggle').textContent = state.useFlats ? '♭ names' : '♯ names';
  fillScaleRootOptions(); // the Key list uses the same names
}

/**
 * Move the blocks up or down an octave, but not past the ends.
 * @param {number} change - -1 for lower, +1 for higher
 * @returns {void}
 */
function changeOctave(change) {
  state.octave = Math.min(clampOctave(state.octave + change), highestOctave(state.wide));
  updateOctaveDisplay();
}

/**
 * Show the current octave and grey out a button at the end of the range.
 * @returns {void}
 */
function updateOctaveDisplay() {
  byId('octave-display').textContent = state.wide
    ? `octaves ${state.octave}–${state.octave + 1}`
    : `octave ${state.octave}`;
  byId('octave-down').disabled = clampOctave(state.octave - 1) === state.octave;
  byId('octave-up').disabled = state.octave >= highestOctave(state.wide);
}

// =============================================================
// Modes and taps
// =============================================================

/**
 * Switch to another mode and show only that mode's panel.
 * @param {string} mode - 'notes', 'chords', 'scales' or 'guess'
 * @returns {void}
 */
function setMode(mode) {
  state.mode = mode;
  choose(modeButtons, modeButtons.find((button) => button.dataset.mode === mode));
  // NOTES mode has no panel, so in NOTES mode every panel hides.
  for (const panel of document.querySelectorAll('[data-panel]')) {
    panel.hidden = panel.dataset.panel !== mode;
  }
  updateScaleGlow(); // glow in SCALES mode, normal blocks everywhere else
}

/**
 * Someone tapped a block (or pressed its computer key).
 * What happens depends on the mode.
 * @param {number} offset - which block: half steps above the first C (0–23)
 * @returns {void}
 */
function handleBlockTap(offset) {
  const midi = octaveStart(state.octave) + offset;
  if (state.mode === 'chords') {
    playChord(midi, offset);
  } else if (state.mode === 'guess') {
    handleGuessTap(midi);
  } else {
    playNotes([midi]); // NOTES and SCALES: just this one note
  }
}

/**
 * CHORDS mode: play a whole chord built on the tapped note (the "root"),
 * and put a 👑 on the root's block so you can always find it.
 *
 * A chord climbs up from its root, so roots high on the blocks (like F)
 * run past the last block. With "fit on the blocks" ON, those notes hop
 * down an octave so every note lights up (see fitInOctave). With two
 * octaves of blocks, every chord fits already, so nothing hops.
 * @param {number} rootMidi - the tapped note
 * @param {number} offset - which block it is (0–23)
 * @returns {void}
 */
function playChord(rootMidi, offset) {
  const chord = buildChord(rootMidi, state.chordType);
  const squeeze = state.fitChords && !state.wide;
  playNotes(squeeze ? fitInOctave(chord, octaveStart(state.octave)) : chord);
  flash(noteBlocks[offset], 'root', ROOT_MS);
}

/**
 * Play a block when its computer key is pressed.
 * @param {KeyboardEvent} event - the key press
 * @returns {void}
 */
function handleKeyDown(event) {
  // Holding a key down makes the computer repeat it many times a second.
  // event.repeat is true for those copies, and we ignore them: one press,
  // one note.
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
  // Don't play notes while someone is choosing from a drop-down list.
  if (event.target.closest('select, input, textarea')) return;

  const offset = KEY_TO_OFFSET[event.key.toLowerCase()];
  if (offset === undefined) return; // not one of our music keys
  if (offset >= noteBlocks.length) return; // k o l p ; only work with two octaves
  handleBlockTap(offset);
}

// =============================================================
// Making sound
// =============================================================

/**
 * Make the sound of one or more notes at the same time (no lights),
 * in the voice Caleb picked (see VOICES in sound.js).
 * @param {number[]} midis - the notes to play, as MIDI numbers
 * @returns {void}
 */
function soundNotes(midis) {
  playTones(midis, VOICES[state.voice]);
}

/**
 * Light up the blocks for these notes (only the ones on screen right now).
 * @param {number[]} midis - the notes to show, as MIDI numbers
 * @returns {void}
 */
function showNotes(midis) {
  const firstOnScreen = octaveStart(state.octave);
  for (const midi of midis) {
    const offset = midi - firstOnScreen;
    if (offset >= 0 && offset < noteBlocks.length) flash(noteBlocks[offset], 'lit', LIGHT_MS);
  }
}

/**
 * Play notes the normal way: sound, lights, and (if recording) remember them.
 * @param {number[]} midis - the notes to play, as MIDI numbers
 * @returns {void}
 */
function playNotes(midis) {
  soundNotes(midis);
  showNotes(midis);
  if (state.isRecording) {
    state.recordedEvents.push({
      time: performance.now() - state.recordStartedAt,
      notes: [...midis],
    });
  }
}

// =============================================================
// Record and play back
// =============================================================

/**
 * Start recording (forgetting the old tune), or stop if already recording.
 * @returns {void}
 */
function toggleRecording() {
  const button = byId('record');
  state.isRecording = !state.isRecording;
  if (state.isRecording) {
    cancelTimers(playbackTimers); // stop any playback first
    state.recordedEvents = [];
    state.recordStartedAt = performance.now(); // the clock, in milliseconds
  }
  button.textContent = state.isRecording ? '⏹ STOP' : '⏺ RECORD';
  button.classList.toggle('recording', state.isRecording);
}

/**
 * Play the recorded tune with the same timing it was played in.
 *
 * setTimeout(job, ms) means "do this job after ms milliseconds". We set one
 * timer per recorded moment, all at once, and the browser fires each one
 * on time.
 * @returns {void}
 */
function playBack() {
  if (state.isRecording) toggleRecording(); // pressing play stops recording
  cancelTimers(playbackTimers);             // pressing play twice restarts

  if (state.recordedEvents.length === 0) {
    flash(byId('play-back'), 'shake', 400); // nothing recorded yet: wiggle "no"
    return;
  }
  playbackTimers = state.recordedEvents.map((event) =>
    setTimeout(() => playNotes(event.notes), event.time));
}

/**
 * Cancel every timer in a list and empty the list.
 * @param {number[]} timers - timer ids from setTimeout
 * @returns {void}
 */
function cancelTimers(timers) {
  for (const timer of timers) clearTimeout(timer);
  timers.length = 0;
}

// =============================================================
// CHORDS and SCALES modes
// =============================================================

/**
 * Connect the chord-type buttons, scale buttons and the Key list.
 * @returns {void}
 */
function setupChordsAndScales() {
  const chordButtons = [...document.querySelectorAll('[data-chord]')];
  for (const button of chordButtons) {
    button.addEventListener('click', () => {
      state.chordType = button.dataset.chord;
      choose(chordButtons, button);
    });
  }

  byId('fit-toggle').addEventListener('click', (event) => {
    state.fitChords = !state.fitChords;
    const button = event.currentTarget;
    button.setAttribute('aria-pressed', String(state.fitChords));
    button.textContent = state.fitChords ? '🙌 fit on the blocks' : '⬆ stack up high';
  });

  const scaleButtons = [...document.querySelectorAll('[data-scale]')];
  for (const button of scaleButtons) {
    button.addEventListener('click', () => {
      state.scaleType = button.dataset.scale;
      choose(scaleButtons, button);
      updateScaleGlow();
    });
  }

  fillScaleRootOptions();
  byId('scale-root').addEventListener('change', (event) => {
    state.scaleRoot = Number(event.target.value);
    updateScaleGlow();
  });
  byId('play-scale').addEventListener('click', playScale);
}

/**
 * Fill the Key drop-down with the 12 note names (sharps or flats).
 * @returns {void}
 */
function fillScaleRootOptions() {
  const select = byId('scale-root');
  select.replaceChildren(); // empty it first
  for (let pc = 0; pc < 12; pc++) {
    const option = document.createElement('option');
    option.value = String(pc);
    option.textContent = pitchName(pc, { useFlats: state.useFlats });
    select.append(option);
  }
  select.value = String(state.scaleRoot);
}

/**
 * In SCALES mode, make the blocks in the scale glow and dim the rest.
 * In any other mode, put every block back to normal.
 *
 * We compare pitch classes (note names), so the glow is right in every octave.
 * @returns {void}
 */
function updateScaleGlow() {
  const inScale = state.mode === 'scales'
    ? new Set(buildScale(state.scaleRoot, state.scaleType).map(pitchClass))
    : null;
  noteBlocks.forEach((block, offset) => {
    const pc = pitchClass(offset); // the second octave's blocks are 12–23
    block.classList.toggle('glow', inScale !== null && inScale.has(pc));
    block.classList.toggle('dim', inScale !== null && !inScale.has(pc));
  });
}

/**
 * Walk up the chosen scale one note at a time, root to root.
 * @returns {void}
 */
function playScale() {
  cancelTimers(scaleTimers); // pressing it again starts over
  const notes = buildScale(octaveStart(state.octave) + state.scaleRoot, state.scaleType);
  scaleTimers = notes.map((midi, step) =>
    setTimeout(() => playNotes([midi]), step * SCALE_STEP_MS));
}

/**
 * Play notes one after another, quickly (an "arpeggio": a chord played
 * one note at a time).
 * @param {number[]} midis - the notes, lowest first
 * @returns {void}
 */
function arpeggio(midis) {
  midis.forEach((midi, step) => {
    setTimeout(() => playNotes([midi]), step * ARPEGGIO_MS);
  });
}

// =============================================================
// GUESS IT! mode (ear training)
// =============================================================

/**
 * Connect the GUESS IT! buttons.
 * @returns {void}
 */
function setupGuessIt() {
  guessKindButtons = [...document.querySelectorAll('[data-guess-kind]')];
  for (const button of guessKindButtons) {
    button.addEventListener('click', () => setGuessKind(button.dataset.guessKind));
  }
  state.best = loadBest(state.guessKind);
  showScore();
  byId('new-mystery').addEventListener('click', newMystery);
  byId('hear-again').addEventListener('click', hearAgain);
  for (const button of document.querySelectorAll('[data-answer]')) {
    button.addEventListener('click', () => handleChordAnswer(button.dataset.answer));
  }
}

/**
 * Choose which game to play: "Which note?" or "Major or minor?".
 * @param {string} kind - 'note' or 'chord'
 * @returns {void}
 */
function setGuessKind(kind) {
  state.guessKind = kind;
  state.mystery = null;
  // Each game has its own 🏆 best, so stars from one don't count in the other.
  state.score = 0;
  state.best = loadBest(kind);
  showScore();
  choose(guessKindButtons, guessKindButtons.find((button) => button.dataset.guessKind === kind));
  byId('chord-answers').hidden = kind !== 'chord'; // answer buttons only for chords
  say('Tap ▶ NEW MYSTERY!');
}

/**
 * Pick a random mystery and play it, without lighting any blocks
 * (that would give the answer away!).
 * @returns {void}
 */
function newMystery() {
  const root = octaveStart(state.octave) + randomInt(12);
  if (state.guessKind === 'note') {
    state.mystery = { kind: 'note', notes: [root], answer: root };
    say('Which note is it? 👂');
  } else {
    const quality = randomInt(2) === 0 ? 'major' : 'minor';
    state.mystery = { kind: 'chord', notes: buildChord(root, quality), answer: quality };
    say('Major 😊 or minor 😢?');
  }
  soundNotes(state.mystery.notes);
}

/**
 * Play the mystery again, or start one if there isn't one yet.
 * @returns {void}
 */
function hearAgain() {
  if (state.mystery) soundNotes(state.mystery.notes);
  else newMystery();
}

/**
 * A block was tapped during GUESS IT!. It always plays its note, so Caleb
 * can explore. In a "Which note?" round, it's also his answer.
 * @param {number} midi - the tapped note
 * @returns {void}
 */
function handleGuessTap(midi) {
  playNotes([midi]);
  if (state.mystery?.kind !== 'note') return; // no note puzzle right now
  // isSameNote ignores the octave, so C counts as C even after ◀ or ▶.
  if (isSameNote(midi, state.mystery.answer)) {
    celebrate(pitchName(state.mystery.answer, { useFlats: state.useFlats }));
  } else {
    tryAgain();
  }
}

/**
 * The 😊 major or 😢 minor button was tapped.
 * @param {string} answer - 'major' or 'minor'
 * @returns {void}
 */
function handleChordAnswer(answer) {
  if (state.mystery?.kind !== 'chord') return;
  if (answer === state.mystery.answer) {
    const rootName = pitchName(state.mystery.notes[0], { useFlats: state.useFlats });
    celebrate(`${rootName} ${answer}`);
  } else {
    tryAgain();
  }
}

/**
 * Right answer! Add a star, cheer, and play a happy run of notes.
 * @param {string} name - what the mystery was, e.g. "F♯" or "C minor"
 * @returns {void}
 */
function celebrate(name) {
  const { isNewBest } = updateScore(true);
  say(`🎉 YES! It was ${name}!${isNewBest ? ' 🏆 NEW BEST!' : ''}`);
  flash(byId('guess-message'), 'cheer', 700);

  // A happy major arpeggio on the mystery's root, plus the root an octave up.
  const root = state.mystery.notes[0];
  arpeggio([...buildChord(root, 'major'), root + 12]);
  state.mystery = null; // solved, so the next tap won't count again
}

/**
 * Wrong answer: encourage, then play the mystery again so he can listen.
 * @returns {void}
 */
function tryAgain() {
  const hadStars = state.score > 0;
  updateScore(false);
  say(hadStars ? 'Good job! Maybe try next time. 👂' : 'Hmm, try again! 👂');
  const mystery = state.mystery;
  // Lots of quick wrong taps should replay the mystery once, not once per
  // tap all on top of each other. So each wrong tap cancels the replay
  // that's waiting and starts the wait again.
  clearTimeout(replayTimer);
  replayTimer = setTimeout(() => {
    // Only replay if it's still the same puzzle (he might have started a new one).
    if (state.mystery === mystery) soundNotes(mystery.notes);
  }, REPLAY_DELAY_MS);
}

/**
 * Count a guess: change the stars, and save the 🏆 best if it was beaten.
 * @param {boolean} correct - was the guess right?
 * @returns {{score: number, best: number, isNewBest: boolean}} the new score
 */
function updateScore(correct) {
  const result = scoreAfter(state, correct);
  state.score = result.score;
  state.best = result.best;
  if (result.isNewBest) saveBest(state.guessKind, result.best);
  showScore();
  return result;
}

/**
 * Show the ⭐ stars and the 🏆 best on the screen.
 * @returns {void}
 */
function showScore() {
  byId('score').textContent = `⭐ ${state.score}`;
  byId('best').textContent = `🏆 ${state.best}`;
}

/**
 * Work out the score after a guess. Right adds a star; wrong goes back to 0.
 * @param {{score: number, best: number}} current - stars now, and the best so far
 * @param {boolean} correct - was the guess right?
 * @returns {{score: number, best: number, isNewBest: boolean}} the new score
 */
export function scoreAfter({ score, best }, correct) {
  const newScore = correct ? score + 1 : 0;
  return { score: newScore, best: Math.max(best, newScore), isNewBest: newScore > best };
}

/**
 * Read a game's saved 🏆 best. Gives 0 if there isn't one, or if the
 * browser won't let us look (some private modes block saving).
 * @param {string} kind - 'note' or 'chord'
 * @param {Storage} [storage] - where it's saved (tests pass a pretend one)
 * @returns {number} the best score, or 0
 */
export function loadBest(kind, storage) {
  try {
    const saved = Number((storage ?? globalThis.localStorage).getItem(BEST_KEY + kind));
    return Number.isInteger(saved) && saved > 0 ? saved : 0;
  } catch {
    return 0;
  }
}

/**
 * Save a game's 🏆 best so it's still there next time. If the browser
 * won't let us, the game just carries on without saving.
 * @param {string} kind - 'note' or 'chord'
 * @param {number} best - the score to save
 * @param {Storage} [storage] - where to save it (tests pass a pretend one)
 * @returns {void}
 */
export function saveBest(kind, best, storage) {
  try {
    (storage ?? globalThis.localStorage).setItem(BEST_KEY + kind, String(best));
  } catch {
    // Saving is blocked. That's OK: the best still shows until the page closes.
  }
}

/**
 * Should the keyboard start with two octaves? If the "↔ 2 octaves" button
 * was used before, do what it was set to. Otherwise, guess from the
 * screen: two octaves on a big screen like an iPad, one on a phone.
 * @param {Storage} [storage] - where the choice is saved (tests pass a pretend one)
 * @param {{width: number, height: number}} [screen] - the screen's size (tests pass a pretend one)
 * @returns {boolean} true for two octaves
 */
export function loadWide(storage, screen = globalThis.screen) {
  try {
    const saved = (storage ?? globalThis.localStorage).getItem(WIDE_KEY);
    if (saved !== null) return saved === 'true';
  } catch {
    // Can't look: fall through and guess from the screen instead.
  }
  return Math.min(screen.width, screen.height) >= BIG_SCREEN_PX;
}

/**
 * Remember the "↔ 2 octaves" choice for next time, if the browser lets us.
 * @param {boolean} wide - true for two octaves
 * @param {Storage} [storage] - where to save it (tests pass a pretend one)
 * @returns {void}
 */
export function saveWide(wide, storage) {
  try {
    (storage ?? globalThis.localStorage).setItem(WIDE_KEY, String(wide));
  } catch {
    // Saving is blocked. That's OK: it just starts with one octave next time.
  }
}

/**
 * Show a message under the GUESS IT! buttons.
 * @param {string} text - what to say
 * @returns {void}
 */
function say(text) {
  byId('guess-message').textContent = text;
}

/**
 * A random whole number from 0 up to (but not including) n.
 * @param {number} n - how many possibilities
 * @returns {number} 0, 1, ... n−1
 */
function randomInt(n) {
  return Math.floor(Math.random() * n);
}
