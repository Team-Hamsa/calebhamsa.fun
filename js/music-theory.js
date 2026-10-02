/**
 * music-theory.js — the "music brain" of the site.
 *
 * This file knows music facts and does music math. It never touches the
 * screen and never makes a sound. It only answers questions like:
 *   "How fast does the note A4 wiggle?"   midiToFrequency(69)      → 440
 *   "What notes are in a C major chord?"  buildChord(60, 'major')  → [60, 64, 67]
 *
 * Because it only does math, tests/music-theory.test.js can check it
 * automatically, with no browser needed.
 *
 * ---------------------------------------------------------------
 * BIG IDEA: every note is a number (a "MIDI number")
 * ---------------------------------------------------------------
 * Instead of juggling names like "C♯4", we give every piano key a number.
 * Middle C is 60. The very next key up (C♯) is 61. Each +1 is one
 * "half step": the smallest step on a piano, to the very next key,
 * black or white.
 *
 *   C4=60  C♯4=61  D4=62  D♯4=63  E4=64  F4=65  ...  B4=71  C5=72
 *
 * 12 half steps make an octave, so C5 is 60 + 12 = 72.
 * This numbering is called MIDI. Electronic keyboards use it too.
 */

/**
 * The tuning note: A4 wiggles 440 times every second (440 Hz).
 * Every other note is worked out from this one.
 * 🧪 Try this! Change 440 to 415. Every note gets a little lower. That's
 *    roughly how music sounded 300 years ago ("Baroque pitch").
 */
export const A4_HZ = 440;

/** A4's MIDI number. */
export const A4_MIDI = 69;

/**
 * Lowest and highest octave the ◀ ▶ buttons can reach.
 * 🧪 Try this! 1 and 7 for very low rumbles and very high squeaks.
 */
export const MIN_OCTAVE = 2;
export const MAX_OCTAVE = 6;

/** Names of the 12 notes using sharps (♯ means "one half step higher"). Position = pitch class. */
export const SHARP_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

/** The same 12 notes using flats (♭ means "one half step lower"). C♯ and D♭ are the same key! */
export const FLAT_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];

/** Pitch classes of the black keys: C♯/D♭, D♯/E♭, F♯/G♭, G♯/A♭, A♯/B♭. */
const BLACK_KEYS = [1, 3, 6, 8, 10];

/**
 * Chord recipes. Each number says how many half steps above the root (the
 * bottom note) to add another note. Compare major and minor: only the
 * middle number moves, and that one half step is the difference between
 * "happy" and "sad"!
 * 🧪 Try this! Add  sus4: [0, 5, 7],  and a button for it in music.html.
 */
export const CHORDS = {
  major: [0, 4, 7],     // happy
  minor: [0, 3, 7],     // sad: the middle note is one half step lower
  dim: [0, 3, 6],       // spooky: the top note slides down too
  aug: [0, 4, 8],       // dreamy and strange: the top note slides up
  dom7: [0, 4, 7, 10],  // a major chord plus one more note; it wants to "go home"
};

/**
 * Scale recipes: how big each step is as you climb, in half steps.
 *   1 = half step (the very next key)
 *   2 = whole step (skip one key)
 *   3 = a jump of three keys
 * Every recipe adds up to 12, so you land on the root one octave higher.
 * 🧪 Try this! Add  blues: [3, 2, 1, 1, 3, 2],  and a button for it in music.html.
 */
export const SCALES = {
  major: [2, 2, 1, 2, 2, 2, 1],
  minor: [2, 1, 2, 2, 1, 2, 2],  // the "natural" minor scale
  pentatonic: [2, 2, 3, 2, 3],   // major pentatonic: five notes that all sound good together
};

/**
 * How many times per second a note wiggles (its frequency, in Hz).
 *
 * Going up one half step multiplies the frequency by the same amount
 * every time: the twelfth root of 2 (about 1.0595). Do that 12 times
 * and you've multiplied by exactly 2, which is why an octave up sounds
 * like "the same note, but higher". This evenly-spaced tuning is called
 * "equal temperament", and it's why a song works in every key.
 *
 *   frequency = 440 × 2^((midi − 69) / 12)
 *
 * @param {number} midi - the note's MIDI number (60 = middle C)
 * @returns {number} the frequency in Hz
 */
export function midiToFrequency(midi) {
  return A4_HZ * 2 ** ((midi - A4_MIDI) / 12);
}

/**
 * Which of the 12 notes this is, ignoring how high it is.
 * C is 0, C♯ is 1, ... B is 11. Every C on the piano has pitch class 0.
 *
 * @param {number} midi - a MIDI number
 * @returns {number} 0 to 11
 */
export function pitchClass(midi) {
  // The % ("remainder") throws away whole octaves. The extra +12 and % keep
  // negative numbers working too.
  return ((midi % 12) + 12) % 12;
}

/**
 * Which octave a note is in. Middle C (60) starts octave 4.
 *
 * @param {number} midi - a MIDI number
 * @returns {number} the octave number
 */
export function octaveOf(midi) {
  return Math.floor(midi / 12) - 1;
}

/**
 * The MIDI number of the C at the bottom of an octave.
 *
 * @param {number} octave - an octave number (4 = the middle of the piano)
 * @returns {number} MIDI number of that octave's C (octave 4 → 60)
 */
export function octaveStart(octave) {
  return (octave + 1) * 12;
}

/**
 * A note's name without the octave number, like "C♯" or "D♭".
 *
 * @param {number} midi - a MIDI number (or a pitch class 0–11)
 * @param {{ useFlats?: boolean }} [options] - useFlats: name black keys with ♭ instead of ♯
 * @returns {string} the note name
 */
export function pitchName(midi, { useFlats = false } = {}) {
  const names = useFlats ? FLAT_NAMES : SHARP_NAMES;
  return names[pitchClass(midi)];
}

/**
 * A note's full name with its octave number, like "C♯4".
 *
 * @param {number} midi - a MIDI number
 * @param {{ useFlats?: boolean }} [options] - useFlats: name black keys with ♭ instead of ♯
 * @returns {string} the note name plus octave
 */
export function noteName(midi, options = {}) {
  return pitchName(midi, options) + octaveOf(midi);
}

/**
 * Is this note a black key on the piano?
 *
 * @param {number} midi - a MIDI number (or a pitch class 0–11)
 * @returns {boolean} true for C♯, D♯, F♯, G♯, A♯ (in any octave)
 */
export function isBlackKey(midi) {
  return BLACK_KEYS.includes(pitchClass(midi));
}

/**
 * Are these two notes the same note name, even in different octaves?
 * (C4 and C5 → true. "Guess it!" uses this, so the right answer counts
 * even if the octave buttons were pressed mid-round.)
 *
 * @param {number} a - a MIDI number
 * @param {number} b - another MIDI number
 * @returns {boolean} true if they have the same pitch class
 */
export function isSameNote(a, b) {
  return pitchClass(a) === pitchClass(b);
}

/**
 * Keep an octave number inside the allowed range.
 *
 * @param {number} octave - the octave someone asked for
 * @returns {number} the same octave, or the nearest allowed one
 */
export function clampOctave(octave) {
  return Math.min(MAX_OCTAVE, Math.max(MIN_OCTAVE, octave));
}

/**
 * Build a chord: start on the root and add each interval from the recipe.
 *
 * @param {number} rootMidi - the bottom note of the chord
 * @param {string} type - a recipe name from CHORDS, like 'major'
 * @returns {number[]} the chord's MIDI numbers, lowest first
 */
export function buildChord(rootMidi, type) {
  const intervals = CHORDS[type];
  if (!intervals) throw new Error(`Unknown chord type: ${type}`);
  return intervals.map((interval) => rootMidi + interval);
}

/**
 * Build a scale: start on the root and climb one recipe step at a time,
 * ending on the root one octave up.
 *
 * @param {number} rootMidi - the note the scale starts on
 * @param {string} type - a recipe name from SCALES, like 'major'
 * @returns {number[]} the scale's MIDI numbers, lowest first
 */
export function buildScale(rootMidi, type) {
  const steps = SCALES[type];
  if (!steps) throw new Error(`Unknown scale type: ${type}`);
  const notes = [rootMidi];
  for (const step of steps) {
    const lastNote = notes[notes.length - 1];
    notes.push(lastNote + step);
  }
  return notes;
}
