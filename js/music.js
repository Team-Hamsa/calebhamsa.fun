/**
 * music.js — makes the Note Blocks page work.
 *
 * This file is the "hands and mouth" of the music page. It:
 *   1. builds the 12 note blocks on the screen,
 *   2. listens for taps and computer-key presses,
 *   3. makes sounds with the browser's Web Audio API (no sound files!),
 *   4. records tunes and plays them back,
 *   5. runs the modes: NOTES, CHORDS, SCALES and GUESS IT!
 *
 * All the music *math* lives in music-theory.js; this file just asks it
 * questions. music.html calls initMusic() once, when the page loads.
 */
import { clampOctave, isBlackKey, midiToFrequency, octaveStart, pitchName } from './music-theory.js';
import { choose, flash } from './ui.js';

// =============================================================
// Settings to play with
// =============================================================

/**
 * How long each note rings, in seconds.
 * 🧪 Try this! 0.2 for short "plinks", 3 for long dreamy notes.
 */
const NOTE_SECONDS = 0.9;

/**
 * How long a note takes to fade in, in seconds.
 * If a sound starts at full loudness instantly, the speaker has to jump
 * all at once and you hear a "click". A tiny fade-in smooths it out.
 * 🧪 Try this! Set it to 0 and listen for the click. Try 0.5 for a slow "swell".
 */
const ATTACK_SECONDS = 0.01;

/** How long a block stays lit after it plays, in milliseconds. */
const LIGHT_MS = 300;

/**
 * The three voices. `wave` is the shape of the sound wave:
 *
 *   sine      ∿∿∿∿   smooth and round: a pure, soft tone
 *   square    ⊓⊔⊓⊔   jumps straight up and down: buzzy, like old video games
 *   triangle  /\/\   pointy: in between, a bit like a bell or a flute
 *
 * Square waves sound much louder, so that voice gets a smaller volume.
 * 🧪 Try this! Add  saw: { wave: 'sawtooth', volume: 0.15 },  and a button in music.html.
 */
const VOICES = {
  soft: { wave: 'sine', volume: 0.3 },
  beep: { wave: 'square', volume: 0.1 },
  bell: { wave: 'triangle', volume: 0.3 },
};

/**
 * Which computer key plays which block, counted in half steps above C.
 * The middle row (a s d f g h j) plays the white keys. The row above it
 * (w e t y u) plays the black keys: the same shape as a real piano.
 */
const KEY_TO_OFFSET = { a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11 };

/**
 * Which grid column each block starts in. The keyboard grid has 14 thin
 * columns and every block is 2 columns wide. White keys sit side by side
 * (columns 1, 3, 5, ...). Each black key starts halfway across the white
 * key to its left, so it sits over the gap, like on a piano.
 * Position in this list = half steps above C.
 */
const KEY_COLUMNS = [1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12, 13];

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
};

/** The 12 block buttons. Position = half steps above C. Filled by buildKeyboard(). */
let noteBlocks = [];

/** The NOTES / CHORDS / SCALES / GUESS IT! buttons. Filled by initMusic(). */
let modeButtons = [];

/** Timers for notes waiting to be played back, so we can cancel them. */
let playbackTimers = [];

/** The browser's sound machine. Made on the first tap (see getAudio). */
let audioContext = null;

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
  buildKeyboard();
  updateLabels();
  updateOctaveDisplay();

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
  byId('record').addEventListener('click', toggleRecording);
  byId('play-back').addEventListener('click', playBack);

  document.addEventListener('keydown', handleKeyDown);
}

/**
 * Make the 12 note-block buttons and put them in the keyboard grid.
 * @returns {void}
 */
function buildKeyboard() {
  const keyboard = byId('keyboard');
  noteBlocks = [];

  for (let offset = 0; offset < 12; offset++) {
    const block = document.createElement('button');
    block.className = `block note ${isBlackKey(offset) ? 'sharp' : 'natural'}`;
    block.dataset.pc = String(offset); // blocks.css uses this to pick the color
    block.style.gridColumn = `${KEY_COLUMNS[offset]} / span 2`;

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
}

/**
 * Move the blocks up or down an octave, but not past the ends.
 * @param {number} change - -1 for lower, +1 for higher
 * @returns {void}
 */
function changeOctave(change) {
  state.octave = clampOctave(state.octave + change);
  updateOctaveDisplay();
}

/**
 * Show the current octave and grey out a button at the end of the range.
 * @returns {void}
 */
function updateOctaveDisplay() {
  byId('octave-display').textContent = `octave ${state.octave}`;
  byId('octave-down').disabled = clampOctave(state.octave - 1) === state.octave;
  byId('octave-up').disabled = clampOctave(state.octave + 1) === state.octave;
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
}

/**
 * Someone tapped a block (or pressed its computer key).
 * @param {number} offset - which block: half steps above C (0–11)
 * @returns {void}
 */
function handleBlockTap(offset) {
  const midi = octaveStart(state.octave) + offset;
  playNotes([midi]);
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
  handleBlockTap(offset);
}

// =============================================================
// Making sound
// =============================================================

/**
 * Get the browser's sound machine, making it the first time.
 *
 * Browsers don't let a page make sound until the person has tapped or
 * clicked something, so websites can't suddenly blare at you. That's why
 * we only make the AudioContext inside a tap, and "resume" it in case
 * the browser paused it.
 *
 * @returns {AudioContext} the sound machine
 */
function getAudio() {
  if (!audioContext) audioContext = new AudioContext();
  if (audioContext.state === 'suspended') audioContext.resume();
  return audioContext;
}

/**
 * Make the sound of one or more notes at the same time (no lights).
 *
 * For each note we build a tiny chain, like plugging in guitar pedals:
 *
 *   oscillator (makes the wave) → gain (volume knob) → speakers
 *
 * The volume knob turns up quickly (ATTACK_SECONDS), then fades away
 * over NOTE_SECONDS, which sounds like a plucked or struck note.
 *
 * @param {number[]} midis - the notes to play, as MIDI numbers
 * @returns {void}
 */
function soundNotes(midis) {
  const audio = getAudio();
  const voice = VOICES[state.voice];
  // Three notes at full volume would be three times as loud, so chords
  // share the loudness between their notes.
  const volume = voice.volume / Math.sqrt(midis.length);
  const start = audio.currentTime;

  for (const midi of midis) {
    const oscillator = audio.createOscillator();
    oscillator.type = voice.wave;
    oscillator.frequency.value = midiToFrequency(midi);

    const gain = audio.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + ATTACK_SECONDS);
    // "exponential" fades sound natural to our ears. It can't reach exactly
    // 0, so we fade to a tiny 0.0001 instead.
    gain.gain.exponentialRampToValueAtTime(0.0001, start + NOTE_SECONDS);

    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(start);
    oscillator.stop(start + NOTE_SECONDS);
  }
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
    if (offset >= 0 && offset < 12) flash(noteBlocks[offset], 'lit', LIGHT_MS);
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
