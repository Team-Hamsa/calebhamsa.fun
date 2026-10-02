/**
 * block-art.test.js — checks how blocks are drawn, using a pretend
 * canvas that just writes down what it was asked to draw.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, setBlock } from '../js/world.js';
import { blockInfo } from '../js/blocks/registry.js';
import { SPECKLE_GRID, drawBlock, drawCell, drawWorld, hashName, shade, speckles } from '../js/block-art.js';

/**
 * A pretend canvas "context" that records every drawing call.
 * @returns {object} the fake context, with a `calls` list
 */
function fakeContext() {
  const ctx = {
    calls: [],
    fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1, font: '', textAlign: '', textBaseline: '',
    fillRect(...args) { ctx.calls.push({ op: 'fillRect', style: ctx.fillStyle, args }); },
    strokeRect(...args) { ctx.calls.push({ op: 'strokeRect', style: ctx.strokeStyle, args }); },
    fillText(...args) { ctx.calls.push({ op: 'fillText', style: ctx.fillStyle, args }); },
  };
  return ctx;
}

test('shade makes a color darker (or lighter) and stays a #rrggbb color', () => {
  assert.equal(shade('#808080', 0.5), '#404040');
  assert.equal(shade('#ff0000', 0.5), '#800000');
  assert.equal(shade('#808080', 3), '#ffffff'); // can't go past white
});

test('hashName gives the same number for the same name, and different ones for different names', () => {
  assert.equal(hashName('sand'), hashName('sand'));
  assert.notEqual(hashName('sand'), hashName('dirt'));
});

test('speckles are the same every time (no flicker) and land inside the block', () => {
  const spots = speckles(hashName('stone'));
  assert.deepEqual(spots, speckles(hashName('stone')));
  assert.equal(spots.length, 10);
  for (const [x, y] of spots) {
    assert.ok(x >= 0 && x < SPECKLE_GRID && y >= 0 && y < SPECKLE_GRID, `${x},${y}`);
  }
  assert.notDeepEqual(spots, speckles(hashName('sand')));
});

test('drawing the same block twice draws exactly the same thing', () => {
  const a = fakeContext();
  const b = fakeContext();
  drawBlock(a, blockInfo('stone'), 40, 0, 40);
  drawBlock(b, blockInfo('stone'), 40, 0, 40);
  assert.deepEqual(a.calls, b.calls);
  assert.deepEqual(a.calls[0], { op: 'fillRect', style: '#8f8f8f', args: [40, 0, 40, 40] });
});

test('note blocks show their letter', () => {
  const ctx = fakeContext();
  drawBlock(ctx, blockInfo('noteE'), 0, 0, 40);
  const texts = ctx.calls.filter((call) => call.op === 'fillText').map((call) => call.args[0]);
  assert.ok(texts.includes('E'));
});

test('grass has a green top', () => {
  const ctx = fakeContext();
  drawBlock(ctx, blockInfo('grass'), 0, 0, 40);
  assert.ok(ctx.calls.some((call) => call.op === 'fillRect' && call.style === '#5dbb3f'));
});

test('glass gets a frame and puts the see-through setting back afterwards', () => {
  const ctx = fakeContext();
  drawBlock(ctx, blockInfo('glass'), 0, 0, 40);
  assert.ok(ctx.calls.some((call) => call.op === 'strokeRect'));
  assert.equal(ctx.globalAlpha, 1);
});

test('drawWorld paints the sky first, then only the cells that are not air', () => {
  const world = createWorld(3, 2);
  const empty = fakeContext();
  drawWorld(empty, world, 10, blockInfo, '#7ec8ff');
  assert.deepEqual(empty.calls, [{ op: 'fillRect', style: '#7ec8ff', args: [0, 0, 30, 20] }]);

  setBlock(world, 2, 1, 'gold');
  const one = fakeContext();
  drawWorld(one, world, 10, blockInfo, '#7ec8ff');
  assert.deepEqual(one.calls[1], { op: 'fillRect', style: '#f2b705', args: [20, 10, 10, 10] });
});

test('drawWorld skips block names it does not know', () => {
  const world = createWorld(1, 1);
  world.cells[0] = 'banana';
  const ctx = fakeContext();
  assert.doesNotThrow(() => drawWorld(ctx, world, 10, blockInfo, '#7ec8ff'));
  assert.equal(ctx.calls.length, 1);
});

test('bare blocks (wire) draw no square of their own', () => {
  const ctx = fakeContext();
  drawBlock(ctx, { name: 'x', color: '#7a4a1e', bare: true }, 0, 0, 40);
  assert.deepEqual(ctx.calls, []);
});

test('drawCell draws the block, then hands its signals to drawSignals', () => {
  const ctx = fakeContext();
  let handed = null;
  const info = { name: 'x', color: '#808080', drawSignals: (...args) => { handed = args; } };
  drawCell(ctx, info, 10, 20, 40, { level: 1 }, 7);
  assert.ok(ctx.calls.length > 0);
  assert.deepEqual(handed.slice(1), [info, 10, 20, 40, { level: 1 }, 7]);
});

test('drawWorld finds each cell\'s signals and the clock in the world', () => {
  const world = createWorld(2, 1);
  world.cells[1] = 'probe';
  world.ticks = 5;
  world.signals = { electric: { cells: new Map([[1, { level: 2 }]]) } };
  let handed = null;
  const info = { name: 'probe', color: '#808080', drawSignals: (...args) => { handed = args; } };
  drawWorld(fakeContext(), world, 10, (name) => (name === 'probe' ? info : undefined), '#7ec8ff');
  assert.deepEqual(handed.slice(2), [10, 0, 10, { level: 2 }, 5]);
});
