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

/**
 * Every sentence the guide says about one pack: its rules, and what each block does.
 * @param {object} pack - a block pack
 * @returns {string[]} the sentences
 */
const guideTexts = (pack) => [...pack.guide.rules, ...Object.values(pack.guide.blocks).flatMap((entry) => [entry.does, entry.use ?? ''])];

test('the guide never tells you to flip a battery round (you can\'t: ✋ does nothing to it)', () => {
  assert.equal(blockInfo('battery').use, undefined, 'if batteries can be flipped now, this test and the guide should change');
  for (const pack of PACKS) {
    for (const text of guideTexts(pack)) assert.doesNotMatch(text, /(flip|turn) the battery/i, `${pack.tab.label}: "${text}"`);
  }
  const power = PACKS.find((pack) => pack.tab.id === 'electric');
  assert.ok(guideTexts(power).some((text) => /\+ end is always/.test(text)), 'the Power guide should say where the + end is');
  assert.ok(guideTexts(power).some((text) => /against each other/.test(text)), 'the Power guide should explain batteries that cancel');
});

test('the guide explains why too many note blocks in one loop go quiet', () => {
  const power = PACKS.find((pack) => pack.tab.id === 'electric');
  assert.ok(guideTexts(power).some((text) => /note blocks/i.test(text) && /quiet/.test(text) && /battery/.test(text)));
});

test('the turbine\'s guide says it makes turning and needs a generator', () => {
  const water = PACKS.find((pack) => pack.tab.id === 'water');
  const turbine = water.guide.blocks.turbine.does;
  assert.match(turbine, /generator/);
  assert.match(turbine, /TURNING, not electricity/);
  assert.doesNotMatch(turbine, /like a battery/);
  assert.ok(water.guide.rules.some((rule) => /Steam has to RISE/.test(rule)), 'the Water rules should say steam has to rise to give its push');
  const gears = PACKS.find((pack) => pack.tab.id === 'gears');
  assert.ok(guideTexts(gears).some((text) => /turbine/.test(text)), 'the Gears guide should count the turbine among the things on a shaft');
  assert.ok(guideTexts(gears).some((text) => /steam plant stops when its burner does/.test(text)));
});

test('the Power guide no longer talks about turbines: a turbine is not an electric part any more', () => {
  const power = PACKS.find((pack) => pack.tab.id === 'electric');
  for (const text of guideTexts(power)) assert.doesNotMatch(text, /turbine/i, `"${text}"`);
  assert.equal(blockInfo('turbine').part, undefined);
});

test('the Water guide says deep water presses harder, and no longer says it is squished', () => {
  const water = PACKS.find((pack) => pack.tab.id === 'water');
  for (const text of guideTexts(water)) assert.doesNotMatch(text, /squish/i, `"${text}"`);
  assert.ok(water.guide.rules.some((rule) => /presses harder/.test(rule)), 'the Water rules should say deep water presses harder');
  assert.ok(water.guide.rules.some((rule) => /can't be squashed/.test(rule)), 'the Water rules should say water can\'t be squashed');
  assert.match(water.guide.blocks.pumpRight.does, /doesn't suck/);
  const gears = PACKS.find((pack) => pack.tab.id === 'gears');
  assert.match(gears.guide.blocks.waterWheel.does, /end of a pipe from a tall tank/);
});
