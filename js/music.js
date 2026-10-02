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
import {
  buildChord, buildScale, clampOctave, fitInOctave, isBlackKey, isSameNote,
  midiToFrequency, octaveStart, pitchClass, pitchName,
} from './music-theory.js';
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

/** The kinds of taps that browsers accept as "yes, you may make sound" (see unlockAudio). */
const UNLOCK_EVENTS = ['pointerup', 'touchend', 'click', 'keydown'];

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
  chordType: 'major',  // one of the CHORDS recipes in music-theory.js
  fitChords: true,     // squeeze chords onto the 12 blocks (true) or stack them up high (false)
  scaleRoot: 0,        // the scale's key, as half steps above C (0 = C, 7 = G)
  scaleType: 'major',  // one of the SCALES recipes in music-theory.js
  guessKind: 'note',   // 'note' = "Which note?", 'chord' = "Major or minor?"
  mystery: null,       // the puzzle being guessed: { kind, notes, answer }, or null
  score: 0,            // ⭐ right answers in a row (a wrong one sends it back to 0)
  best: 0,             // 🏆 the most stars in a row ever, for this guessKind
};

/** Start of the name the 🏆 best scores are saved under, e.g. "calebhamsa.best.note". */
const BEST_KEY = 'calebhamsa.best.';

/** The 12 block buttons. Position = half steps above C. Filled by buildKeyboard(). */
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

  setupChordsAndScales();
  setupGuessIt();

  document.addEventListener('keydown', handleKeyDown);
  for (const type of UNLOCK_EVENTS) document.addEventListener(type, unlockAudio);
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
  fillScaleRootOptions(); // the Key list uses the same names
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
  updateScaleGlow(); // glow in SCALES mode, normal blocks everywhere else
}

/**
 * Someone tapped a block (or pressed its computer key).
 * What happens depends on the mode.
 * @param {number} offset - which block: half steps above C (0–11)
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
 * down an octave so every note lights up (see fitInOctave).
 * @param {number} rootMidi - the tapped note
 * @param {number} offset - which block it is (0–11)
 * @returns {void}
 */
function playChord(rootMidi, offset) {
  const chord = buildChord(rootMidi, state.chordType);
  playNotes(state.fitChords ? fitInOctave(chord, octaveStart(state.octave)) : chord);
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
  // Not just 'suspended': iPads also say 'interrupted' after the screen
  // locks or a phone call, and we want sound back after either.
  if (audioContext.state !== 'running') audioContext.resume();
  return audioContext;
}

/**
 * Wake up the sound machine on Caleb's first real tap.
 *
 * Browsers only allow sound after certain kinds of taps: a finger lifting
 * off (pointerup or touchend), a click, or a key press. The note blocks
 * play on pointerdown, the instant a finger lands, and some tablets don't
 * count that. So these events also wake the sound machine, and once it's
 * running they stop listening.
 * @returns {void}
 */
function unlockAudio() {
  if (getAudio().state === 'running') {
    for (const type of UNLOCK_EVENTS) document.removeEventListener(type, unlockAudio);
  }
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
  noteBlocks.forEach((block, pc) => {
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
