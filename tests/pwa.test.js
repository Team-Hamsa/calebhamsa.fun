/**
 * pwa.test.js — checks the words on the "ready offline" badge.
 *
 * The badge tells you how far the iPad has got with saving the site for
 * offline use. describeOfflineState() turns what the browser reports into
 * a short message, so we can check every case without an iPad.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeOfflineState } from '../js/pwa.js';

test('everything saved: ready offline', () => {
  assert.deepEqual(describeOfflineState({ supported: true, secure: true, controlled: true, missing: [] }),
    { kind: 'ready', text: '✓ Ready offline' });
});

test('everything saved and the internet is off: playing offline', () => {
  assert.deepEqual(describeOfflineState({ supported: true, secure: true, controlled: true, missing: [], online: false }),
    { kind: 'ready', text: '✓ Playing offline' });
});

test('some files still saving: says how many', () => {
  assert.deepEqual(describeOfflineState({ supported: true, secure: true, controlled: true, missing: ['./a', './b'] }),
    { kind: 'waiting', text: '⏳ Saving for offline… (2 left)' });
});

test('helper started but not looking after this page yet', () => {
  assert.deepEqual(describeOfflineState({ supported: true, secure: true, controlled: false }),
    { kind: 'waiting', text: '⏳ Getting ready for offline…' });
});

test('the helper failed to start: shows why', () => {
  assert.deepEqual(describeOfflineState({ supported: true, secure: true, error: 'SecurityError: nope' }),
    { kind: 'problem', text: '⚠ Can’t save for offline: SecurityError: nope' });
});

test('not https: explains offline needs it', () => {
  assert.deepEqual(describeOfflineState({ supported: true, secure: false }),
    { kind: 'problem', text: '⚠ Offline needs https://' });
});

test('browser without service workers', () => {
  assert.deepEqual(describeOfflineState({ supported: false, secure: true }),
    { kind: 'problem', text: '⚠ This browser can’t save for offline' });
});
