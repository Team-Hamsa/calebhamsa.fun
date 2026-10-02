/**
 * readme.test.js — does the README explain every Build page block?
 *
 * Caleb can't tell what every block does from its little picture, so the
 * README has a picture and a description for each one. This test makes
 * sure a new block can't sneak into the palette without them.
 * (Remake the pictures with: node tools/make-block-pictures.cjs)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { PACKS, blocksInPack } from '../js/blocks/registry.js';

const ROOT = new URL('../', import.meta.url);
const README = readFileSync(new URL('README.md', ROOT), 'utf8');

for (const pack of PACKS) {
  for (const name of blocksInPack(pack.tab.id)) {
    test(`the README shows and explains the ${pack.tab.label} block "${name}"`, () => {
      const picture = `docs/blocks/${name}.png`;
      assert.ok(existsSync(new URL(picture, ROOT)), `missing picture ${picture}`);
      assert.ok(README.includes(`(${picture})`), `README doesn't show ${picture}`);
    });
  }
}

test('every machine picture the README shows exists', () => {
  for (const match of README.matchAll(/\((docs\/machines\/[\w-]+\.png)\)/g)) {
    assert.ok(existsSync(new URL(match[1], ROOT)), `missing ${match[1]}`);
  }
});
