/**
 * trace.test.js — checks for the handwriting worksheet maker.
 *
 * These test the parts that are pure logic: what text to show, how a
 * typed word gets cleaned up, and how many fading copies fit in a row.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTraceSettings, sanitizeWord, traceText, stepLetter, planRow,
  FADE_OPACITIES, MAX_WORD_LENGTH,
} from '../js/trace.js';

test('print name follows the ABC/abc toggle', () => {
  const settings = createTraceSettings();
  assert.equal(traceText(settings), 'CALEB');
  settings.upper = false;
  assert.equal(traceText(settings), 'Caleb');
});

test('cursive name is always "Caleb" (all-capital cursive is not taught)', () => {
  const settings = createTraceSettings();
  settings.style = 'cursive';
  assert.equal(traceText(settings), 'Caleb');
});

test('single letters follow the ABC/abc toggle', () => {
  const settings = createTraceSettings();
  settings.content = 'letter';
  settings.letterIndex = 1;
  assert.equal(traceText(settings), 'B');
  settings.upper = false;
  assert.equal(traceText(settings), 'b');
});

test('stepping through letters wraps around between A and Z', () => {
  const settings = createTraceSettings();
  stepLetter(settings, -1);
  assert.equal(settings.letterIndex, 25);
  assert.equal(settings.content, 'letter');
  stepLetter(settings, +1);
  assert.equal(settings.letterIndex, 0);
});

test('custom words are shown without extra spaces at the ends', () => {
  const settings = createTraceSettings();
  settings.content = 'word';
  settings.word = ' dog ';
  assert.equal(traceText(settings), 'dog');
});

test('word cleanup keeps letters and single spaces only', () => {
  assert.equal(sanitizeWord('  dog!! 123 cat'), 'dog cat');
  assert.equal(sanitizeWord('🐶dog7'), 'dog');
});

test('a space at the end survives, so you can keep typing the next word', () => {
  assert.equal(sanitizeWord('my '), 'my ');
});

test('words stop at 12 letters', () => {
  assert.equal(sanitizeWord('abcdefghijklmnopqrst'), 'abcdefghijkl');
  assert.equal(sanitizeWord('abcdefghijklmnopqrst').length, MAX_WORD_LENGTH);
});

test('short words get every fading copy', () => {
  const plan = planRow({ textWidth: 100, fontSize: 80, rowWidth: 1000, gap: 40 });
  assert.equal(plan.copies, FADE_OPACITIES.length);
  assert.equal(plan.fontSize, 80);
  assert.equal(plan.slotWidth, 140);
});

test('longer words get fewer copies but always keep an empty slot to write in', () => {
  assert.equal(planRow({ textWidth: 300, fontSize: 80, rowWidth: 1000, gap: 40 }).copies, 1);
  assert.equal(planRow({ textWidth: 300, fontSize: 80, rowWidth: 1100, gap: 40 }).copies, 2);
});

test('words too wide for the row shrink to fit one copy plus an empty slot', () => {
  const plan = planRow({ textWidth: 600, fontSize: 80, rowWidth: 800, gap: 40 });
  assert.equal(plan.copies, 1);
  assert.equal(plan.fontSize, 50);
  assert.equal(plan.slotWidth, 400);
});
