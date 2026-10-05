/**
 * wiki.test.js — does the wiki explain every Build page block?
 *
 * Caleb can't tell what every block does from its little picture, so the
 * wiki has a picture and a description for each one. The wiki's pages
 * live in the wiki/ folder (a GitHub Action copies them to the wiki), so
 * this test can read them. It makes sure a new block can't sneak into the
 * palette without a picture and a page, and that no page points at a
 * page or picture that isn't there.
 * (Remake the pictures with: node tools/make-block-pictures.cjs)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { PACKS, blocksInPack } from '../js/blocks/registry.js';

const ROOT = new URL('../', import.meta.url);
const WIKI = new URL('wiki/', ROOT);

/** Every page the wiki must have (the side menu, _Sidebar, is extra). */
const PAGES = ['Home', 'Blocks', 'Water', 'Power', 'Gears', 'Lifting', 'Machines-to-build', 'Chemistry-room', 'Experiments'];

/**
 * Every file in wiki/, with its exact capital letters. The wiki cares
 * about capitals even when this computer's disk doesn't, so we compare
 * names against this list and never ask the disk "does it exist?".
 */
const FILES = new Set(readdirSync(WIKI, { recursive: true }).map((name) => String(name).replaceAll('\\', '/')));

/** Reads one wiki page's words. */
const readPage = (name) => readFileSync(new URL(`${name}.md`, WIKI), 'utf8');

/** All the pages' words in one long text. */
const ALL_PAGES = PAGES.filter((name) => FILES.has(`${name}.md`)).map(readPage).join('\n');

/** Every place a page points at: the part in (round brackets) of a link or picture. */
const linksIn = (text) => [...text.matchAll(/\]\(([^)\s]+)\)/g)].map((match) => match[1]);

for (const name of [...PAGES, '_Sidebar']) {
  test(`the wiki has the page "${name}"`, () => {
    assert.ok(FILES.has(`${name}.md`), `missing wiki/${name}.md`);
  });
}

for (const pack of PACKS) {
  for (const name of blocksInPack(pack.tab.id)) {
    test(`the wiki shows and explains the ${pack.tab.label} block "${name}"`, () => {
      const picture = `blocks/${name}.png`;
      assert.ok(FILES.has(picture), `missing picture wiki/${picture}`);
      assert.ok(ALL_PAGES.includes(`(${picture})`), `no wiki page shows ${picture}`);
    });
  }
}

for (const name of [...PAGES, '_Sidebar']) {
  test(`every link and picture on the wiki page "${name}" goes somewhere real`, () => {
    for (const link of linksIn(readPage(name))) {
      if (/^https?:\/\//.test(link) || link.startsWith('#')) continue;
      if (link.endsWith('.png')) {
        assert.ok(FILES.has(link), `${name} shows ${link}, which isn't in wiki/`);
      } else {
        assert.ok(PAGES.includes(link.split('#')[0]), `${name} links to "${link}", which isn't a wiki page`);
      }
    }
  });
}

test('the side menu links to every page', () => {
  const links = linksIn(readPage('_Sidebar'));
  for (const name of PAGES) assert.ok(links.includes(name), `_Sidebar doesn't link to ${name}`);
});

test('no wiki page still points at the old docs/ picture folders', () => {
  assert.ok(!ALL_PAGES.includes('docs/blocks/') && !ALL_PAGES.includes('docs/machines/'));
});

test('the README sends you to the wiki and no longer keeps the block pictures', () => {
  const readme = readFileSync(new URL('README.md', ROOT), 'utf8');
  assert.ok(readme.includes('https://github.com/Team-Hamsa/calebhamsa.fun/wiki'), 'README has no link to the wiki');
  assert.ok(!readme.includes('docs/blocks/') && !readme.includes('docs/machines/'), 'README still points at docs/blocks or docs/machines');
  assert.ok(readme.split('\n').length < 220, 'README is still long: did the how-to-play sections move?');
});

for (const name of [...PAGES, '_Sidebar']) {
  test(`every table on the wiki page "${name}" starts after an empty line`, () => {
    const lines = readPage(name).split('\n');
    lines.forEach((line, index) => {
      const startsTable = line.startsWith('|') && /^\|[-| :]+\|$/.test(lines[index + 1] ?? '');
      if (startsTable && index > 0) assert.equal(lines[index - 1], '', `${name} line ${index + 1}: a table needs an empty line above it`);
    });
  });
}

test('the wiki says deep water presses harder, and no longer says it is squished', () => {
  for (const name of ['Water', 'Machines-to-build', 'Lifting', 'Experiments']) {
    assert.doesNotMatch(readPage(name), /squish/i, `wiki/${name}.md still says "squish"`);
  }
  const water = readPage('Water');
  assert.match(water, /Deep water presses harder/);
  assert.match(water, /can't be squashed/);
  assert.match(water, /doesn't suck/);
  assert.match(water, /no power is a shut door/);
  assert.match(water, /Two pumps in a row/);
  // Only steam is squeezed now, and nothing stops sinking part way down a tank.
  const lifting = readPage('Lifting');
  assert.doesNotMatch(lifting, /squeezed|stop sinking/i, 'wiki/Lifting.md still says deep water is squeezed');
  assert.match(lifting, /sink right to the\s+bottom/);
  for (const name of ['Machines-to-build', 'Experiments']) assert.doesNotMatch(readPage(name), /squeezed/i);
  assert.doesNotMatch(water, /issue #30/, 'the note about needing a new water engine can go: this is it');
  const readme = readFileSync(new URL('README.md', ROOT), 'utf8');
  assert.doesNotMatch(readme, /squish/i);
});
