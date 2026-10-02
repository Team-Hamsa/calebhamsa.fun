/**
 * docs.test.js — does every function have a docstring?
 *
 * This project promises a /** ... *\/ comment above every function, saying
 * what it does. This test reads each file in js/ and tools/, plus sw.js,
 * and checks that every
 * named function (written as `function name(` or `const name = (...) =>`)
 * has a comment ending in *\/ just above it, so new code can't quietly skip one.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);

/** Every JavaScript file we wrote: js/, tools/, and the service worker. */
const FILES = [
  // recursive: also js/blocks/ (the Build page's block packs)
  ...readdirSync(new URL('js/', ROOT), { recursive: true }).map((name) => `js/${name}`),
  ...readdirSync(new URL('tools/', ROOT)).map((name) => `tools/${name}`),
  'sw.js',
].filter((name) => /\.c?js$/.test(name));

/** Matches the line where a named function starts. */
const FUNCTION_START = /^\s*(?:export\s+)?(?:async\s+)?(?:function\s+(\w+)\s*\(|const\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>)/;

for (const file of FILES) {
  test(`every function in ${file} has a docstring`, () => {
    const lines = readFileSync(new URL(file, ROOT), 'utf8').split('\n');
    const missing = [];
    lines.forEach((line, index) => {
      const match = line.match(FUNCTION_START);
      if (!match) return;
      const above = lines[index - 1] ?? '';
      if (!above.trim().endsWith('*/')) missing.push(`${match[1] ?? match[2]} (line ${index + 1})`);
    });
    assert.deepEqual(missing, [], `functions without a docstring: ${missing.join(', ')}`);
  });
}
