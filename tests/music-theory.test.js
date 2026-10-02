/**
 * music-theory.test.js — automatic checks for the music brain.
 *
 * Each test() below is one music fact. `npm test` runs them all and
 * shouts if any fact comes out wrong. You can read this file like a
 * list of music lessons!
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  A4_HZ, MIN_OCTAVE, MAX_OCTAVE, SCALES,
  midiToFrequency, pitchClass, octaveOf, octaveStart, pitchName, noteName,
  isBlackKey, isSameNote, clampOctave, buildChord, buildScale,
} from '../js/music-theory.js';

/**
 * Check two frequencies match to within 0.01 Hz (nobody can hear smaller differences).
 * @param {number} actual - what the code gave us
 * @param {number} expected - what it should be
 */
function assertHz(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 0.01, `expected ${expected} Hz, got ${actual} Hz`);
}

test('A4 is the tuning note: 440 Hz', () => {
  assert.equal(A4_HZ, 440);
  assertHz(midiToFrequency(69), 440);
});

test('going up an octave doubles the frequency; down halves it', () => {
  assertHz(midiToFrequency(81), 880); // A5
  assertHz(midiToFrequency(57), 220); // A3
});

test('middle C (C4) is about 261.63 Hz', () => {
  assertHz(midiToFrequency(60), 261.63);
});

test('a MIDI number splits into "which note" (pitch class) and "how high" (octave)', () => {
  assert.equal(pitchClass(60), 0);
  assert.equal(pitchClass(61), 1);
  assert.equal(pitchClass(71), 11);
  assert.equal(octaveOf(60), 4);
  assert.equal(octaveOf(59), 3); // B3 is just below middle C
  assert.equal(octaveStart(4), 60);
  assert.equal(octaveStart(2), 36);
});

test('black keys have two names: sharp and flat', () => {
  assert.equal(noteName(61), 'C♯4');
  assert.equal(noteName(61, { useFlats: true }), 'D♭4');
  assert.equal(pitchName(70), 'A♯');
  assert.equal(pitchName(70, { useFlats: true }), 'B♭');
});

test('white keys have the same name either way', () => {
  assert.equal(noteName(60), 'C4');
  assert.equal(noteName(60, { useFlats: true }), 'C4');
  assert.equal(noteName(59), 'B3');
});

test('the black keys are C♯ D♯ F♯ G♯ A♯ in every octave', () => {
  const black = [];
  for (let midi = 60; midi < 72; midi++) {
    if (isBlackKey(midi)) black.push(pitchName(midi));
  }
  assert.deepEqual(black, ['C♯', 'D♯', 'F♯', 'G♯', 'A♯']);
  assert.equal(isBlackKey(73), true); // C♯5
});

test('same note, different octave, still counts as the same note', () => {
  assert.equal(isSameNote(60, 72), true);  // C4 and C5
  assert.equal(isSameNote(61, 49), true);  // C♯4 and C♯3
  assert.equal(isSameNote(60, 61), false); // C and C♯
});

test('octaves stay between MIN_OCTAVE and MAX_OCTAVE', () => {
  assert.equal(clampOctave(1), MIN_OCTAVE);
  assert.equal(clampOctave(9), MAX_OCTAVE);
  assert.equal(clampOctave(4), 4);
});

test('chords on C', () => {
  assert.deepEqual(buildChord(60, 'major'), [60, 64, 67]);     // C E G
  assert.deepEqual(buildChord(60, 'minor'), [60, 63, 67]);     // C E♭ G
  assert.deepEqual(buildChord(60, 'dim'), [60, 63, 66]);       // C E♭ G♭
  assert.deepEqual(buildChord(60, 'aug'), [60, 64, 68]);       // C E G♯
  assert.deepEqual(buildChord(60, 'dom7'), [60, 64, 67, 70]);  // C E G B♭
});

test('chords on a black key: F♯ minor is F♯ A C♯', () => {
  const names = buildChord(66, 'minor').map((midi) => pitchName(midi));
  assert.deepEqual(names, ['F♯', 'A', 'C♯']);
});

test('unknown chord or scale types are an error, not silence', () => {
  assert.throws(() => buildChord(60, 'banana'), /Unknown chord type: banana/);
  assert.throws(() => buildScale(60, 'banana'), /Unknown scale type: banana/);
});

test('every scale recipe adds up to exactly one octave (12 half steps)', () => {
  for (const [type, steps] of Object.entries(SCALES)) {
    const total = steps.reduce((sum, step) => sum + step, 0);
    assert.equal(total, 12, `${type} adds up to ${total}`);
  }
});

test('C major is all white keys, root to root', () => {
  assert.deepEqual(buildScale(60, 'major'), [60, 62, 64, 65, 67, 69, 71, 72]);
});

test('C natural minor and C major pentatonic', () => {
  assert.deepEqual(buildScale(60, 'minor'), [60, 62, 63, 65, 67, 68, 70, 72]);
  assert.deepEqual(buildScale(60, 'pentatonic'), [60, 62, 64, 67, 69, 72]);
});

test('scales on other roots: E major (sharps), B♭ major (flats), F♯ minor', () => {
  const eMajor = buildScale(64, 'major').map((midi) => pitchName(midi));
  assert.deepEqual(eMajor, ['E', 'F♯', 'G♯', 'A', 'B', 'C♯', 'D♯', 'E']);

  const bFlatMajor = buildScale(70, 'major').map((midi) => pitchName(midi, { useFlats: true }));
  assert.deepEqual(bFlatMajor, ['B♭', 'C', 'D', 'E♭', 'F', 'G', 'A', 'B♭']);

  const fSharpMinor = buildScale(66, 'minor').map((midi) => pitchName(midi));
  assert.deepEqual(fSharpMinor, ['F♯', 'G♯', 'A', 'B', 'C♯', 'D', 'E', 'F♯']);
});

test('a scale can climb past the top octave: B major from octave 6', () => {
  const notes = buildScale(octaveStart(6) + 11, 'major'); // B6 = 95
  assert.equal(notes.length, 8);
  assert.equal(notes[7], 107);
});
