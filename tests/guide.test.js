/**
 * guide.test.js — does the in-game guide (❓ on the Build page) explain
 * everything? Every block in every palette tab needs words saying what
 * it does, and every tab needs its rules, so a new block can't sneak
 * into the game without them.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PACKS, blocksInPack, blockInfo } from '../js/blocks/registry.js';
import { TOOLS_GUIDE, guideSections } from '../js/guide.js';

for (const pack of PACKS) {
  for (const name of blocksInPack(pack.tab.id)) {
    test(`the guide explains the ${pack.tab.label} block "${name}"`, () => {
      const entry = pack.guide?.blocks?.[name];
      assert.ok(entry, `no guide entry for ${name} in ${pack.tab.id}`);
      assert.equal(typeof entry.does, 'string');
      assert.ok(entry.does.length > 10, `${name}'s guide text is too short`);
      if (blockInfo(name).use) assert.ok(entry.use, `${name} does something with ✋ USE, so the guide must say what`);
    });
  }
  test(`the guide has rules for the ${pack.tab.label} tab`, () => {
    assert.ok(Array.isArray(pack.guide?.rules) && pack.guide.rules.length > 0);
  });
  test(`the ${pack.tab.label} guide only lists blocks that are in its palette`, () => {
    const palette = new Set(blocksInPack(pack.tab.id));
    for (const name of Object.keys(pack.guide?.blocks ?? {})) assert.ok(palette.has(name), `${name} isn't in the palette`);
  });
}

test('the guide has a section per tab, in palette order, with every block', () => {
  const sections = guideSections();
  assert.deepEqual(sections.map((section) => section.id), PACKS.map((pack) => pack.tab.id));
  for (const section of sections) {
    assert.deepEqual(section.entries.map((entry) => entry.name), blocksInPack(section.id));
    for (const entry of section.entries) assert.equal(entry.title, blockInfo(entry.name).title);
  }
});

test('the guide explains the three tools', () => {
  assert.deepEqual(TOOLS_GUIDE.map((tool) => tool.icon), ['🧱', '⛏️', '✋']);
});
