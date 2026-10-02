/**
 * modules.test.js — does every JavaScript file load without crashing?
 *
 * One typo (like a missing bracket) stops a whole file from loading, and
 * the web page just quietly does nothing. Importing every file here
 * catches that straight away.
 *
 * This works because our page files only touch the web page inside
 * their init...() functions, and these tests never call those.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

/** Every file in js/. Add new ones here! */
const MODULES = ['ui.js', 'music-theory.js', 'music.js', 'draw.js', 'trace.js', 'pwa.js'];

for (const name of MODULES) {
  test(`js/${name} loads`, async () => {
    const module = await import(`../js/${name}`);
    assert.ok(module);
  });
}
