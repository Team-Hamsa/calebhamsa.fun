/**
 * electric.test.js — checks the ⚡ pack: switches, the clicker's beat,
 * note blocks playing when current starts, buzzer hum, redrawing, and
 * that the math only runs again when something changed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, getBlock, setBlock, tick } from '../js/world.js';
import { blockInfo, blocksInPack, isKnownBlock, refreshSignals } from '../js/blocks/registry.js';
import electric, {
  CLICKER_TICKS, circuitKey, clickerOn, drawWire, electricSystem, refreshElectric,
} from '../js/blocks/electric.js';

/** What each letter in a test picture means. */
const LETTERS = { '.': 'air', W: 'wire', B: 'battery', L: 'lamp', S: 'switchOpen', K: 'clicker', Z: 'buzzer', n: 'noteE' };

/**
 * Build a world from a picture, one string per row.
 * @param {string[]} rows - e.g. ['WWW', 'B.W', 'WLW']
 * @returns {object} the world
 */
function worldFrom(rows) {
  const world = createWorld(rows[0].length, rows.length);
  rows.forEach((row, y) => [...row].forEach((letter, x) => setBlock(world, x, y, LETTERS[letter])));
  return world;
}

/**
 * A pretend canvas "context" that records every rectangle drawn.
 * @returns {object} the fake context, with a `calls` list
 */
function fakeContext() {
  const ctx = {
    calls: [], fillStyle: '', globalAlpha: 1,
    fillRect(...args) { ctx.calls.push({ style: ctx.fillStyle, args }); },
  };
  return ctx;
}

test('the electric tab shows its blocks, but hides the switch\'s "on" side', () => {
  assert.deepEqual(blocksInPack('electric'), ['battery', 'wire', 'switchOpen', 'lamp', 'buzzer', 'clicker']);
  assert.equal(isKnownBlock('switchClosed'), true);
  assert.deepEqual(electric.tab, { id: 'electric', icon: '⚡', label: 'Power' });
});

test('✋ on a switch flips it, and says the world changed', () => {
  const world = worldFrom(['S']);
  const ctx = { world, x: 0, y: 0, playNote() {}, flash() {} };
  assert.equal(blockInfo('switchOpen').use(ctx), true);
  assert.equal(getBlock(world, 0, 0), 'switchClosed');
  assert.equal(blockInfo('switchClosed').use(ctx), true);
  assert.equal(getBlock(world, 0, 0), 'switchOpen');
});

test('the clicker is on for CLICKER_TICKS ticks, then off for CLICKER_TICKS', () => {
  assert.equal(clickerOn({ ticks: 0 }), true);
  assert.equal(clickerOn({ ticks: CLICKER_TICKS - 1 }), true);
  assert.equal(clickerOn({ ticks: CLICKER_TICKS }), false);
  assert.equal(clickerOn({ ticks: 2 * CLICKER_TICKS }), true);
});

test('the circuit key only changes with the beat when there is a clicker', () => {
  const plain = worldFrom(['WLW']);
  const before = circuitKey(plain);
  plain.ticks = CLICKER_TICKS;
  assert.equal(circuitKey(plain), before);
  const ticking = worldFrom(['WKW']);
  const onBeat = circuitKey(ticking);
  ticking.ticks = CLICKER_TICKS;
  assert.notEqual(circuitKey(ticking), onBeat);
});

test('the math only runs again when the circuit changes', () => {
  const world = worldFrom(['WWW', 'B.W', 'WLW']);
  assert.equal(refreshElectric(world, blockInfo), true);
  assert.equal(refreshElectric(world, blockInfo), false);
  assert.equal(world.signals.electric.solves, 1);
  setBlock(world, 1, 0, 'switchOpen');
  assert.equal(refreshElectric(world, blockInfo), true);
  assert.equal(world.signals.electric.solves, 2);
});

test('a note block plays once when current starts, not again while it keeps flowing', () => {
  const world = worldFrom(['WWW', 'B.W', 'WnW']);
  refreshElectric(world, blockInfo);
  assert.deepEqual(world.events, [{ type: 'note', midi: 64, x: 1, y: 2 }]);
  world.events.length = 0;
  setBlock(world, 0, 0, 'wire'); // same blocks: no new solve, no new note
  world.ticks += 1;
  refreshElectric(world, blockInfo);
  assert.deepEqual(world.events, []);
});

test('a note block plays again after the current stops and starts', () => {
  const world = worldFrom(['WWW', 'B.W', 'WnW']);
  refreshElectric(world, blockInfo);
  world.events.length = 0;
  setBlock(world, 1, 0, 'switchOpen');
  refreshElectric(world, blockInfo);
  assert.deepEqual(world.events, []);
  setBlock(world, 1, 0, 'switchClosed');
  refreshElectric(world, blockInfo);
  assert.equal(world.events.length, 1);
});

test('a clicker in the loop plays a note block on every on beat', () => {
  const world = worldFrom(['WKW', 'B.W', 'WnW']);
  const notes = [];
  // Ticks 1 to 31: on, off, on, off (tick 32 would start a third on beat).
  for (let i = 1; i < 4 * CLICKER_TICKS; i++) {
    tick(world, [electricSystem], blockInfo);
    notes.push(...world.events.splice(0));
  }
  assert.equal(notes.length, 2);
});

test('hum is how hard the loudest buzzer is buzzing', () => {
  const world = worldFrom(['WWW', 'B.W', 'WZW']);
  refreshElectric(world, blockInfo);
  assert.ok(Math.abs(world.signals.electric.hum - 1) < 0.02);
  const quiet = worldFrom(['WSW', 'B.W', 'WZW']);
  refreshElectric(quiet, blockInfo);
  assert.equal(quiet.signals.electric.hum, 0);
});

test('the electric system asks for a redraw when current flows, and never moves blocks', () => {
  const world = worldFrom(['WWW', 'B.W', 'WLW']);
  assert.equal(electricSystem(world, blockInfo), false);
  assert.equal(world.animating, true);
  world.animating = false;
  electricSystem(world, blockInfo); // nothing changed, but dots keep moving
  assert.equal(world.animating, true);
  const dark = worldFrom(['WSW', 'B.W', 'WLW']);
  electricSystem(dark, blockInfo); // first solve: redraw once
  dark.animating = false;
  electricSystem(dark, blockInfo); // nothing flows: no redraw needed
  assert.equal(dark.animating, false);
});

test('refreshSignals works the electricity out between ticks', () => {
  const world = worldFrom(['WWW', 'B.W', 'WLW']);
  refreshSignals(world);
  assert.ok(world.signals.electric.cells.get(2 * 3 + 1).level > 0.9);
});

test('a wire draws arms only toward the sides it connects through', () => {
  const ctx = fakeContext();
  drawWire(ctx, blockInfo('wire'), 0, 0, 80, { faces: ['up'], arms: { up: 0 } }, 0);
  // the middle (8 × 8 px at 32,32... as 2p squares) plus one arm going up
  assert.deepEqual(ctx.calls.map((call) => call.args), [[30, 30, 20, 20], [30, 0, 20, 40]]);
});

test('in the palette a wire is a plain sideways wire', () => {
  const ctx = fakeContext();
  drawWire(ctx, blockInfo('wire'), 0, 0, 80, undefined, 0);
  assert.equal(ctx.calls.length, 3); // middle + right arm + left arm
});

test('dots move along a wire that carries current', () => {
  const cell = { faces: ['right', 'left'], arms: { right: 1, left: -1 } };
  const first = fakeContext();
  const later = fakeContext();
  drawWire(first, blockInfo('wire'), 0, 0, 80, cell, 0);
  drawWire(later, blockInfo('wire'), 0, 0, 80, cell, 1);
  const dots = (ctx) => ctx.calls.filter((call) => call.style === '#ffe94d').map((call) => call.args);
  assert.equal(dots(first).length, 2);
  assert.notDeepEqual(dots(first), dots(later));
});
