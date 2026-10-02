/**
 * pwa.js — turns the site into an app that works offline.
 *
 * "PWA" stands for Progressive Web App: a website that can be added to the
 * home screen and opened like an app, even with no internet. Two pieces
 * make that happen:
 *   - manifest.webmanifest: the app's name, icon and colors
 *   - sw.js: the service worker, which saves files for offline use
 *
 * This file asks the browser to start sw.js, and shows a little badge in
 * the corner saying whether the site is ready to use offline (handy for
 * checking the iPad before a car trip). Every page calls
 * registerServiceWorker() once.
 */

/** While the site is still getting ready, check again this often (milliseconds). */
const CHECK_EVERY_MS = 2000;

/** How long to wait for sw.js to answer "which files are missing?" (milliseconds). */
const ASK_TIMEOUT_MS = 2000;

/**
 * Turn what the browser tells us into the badge's words. It only looks at
 * the facts it's given, so tests/pwa.test.js can check every case.
 *
 * @param {object} facts - what we know so far
 * @param {boolean} facts.supported - can this browser run an offline helper at all?
 * @param {boolean} facts.secure - is the page on https:// (helpers need it)?
 * @param {string} [facts.error] - why the helper failed to start, if it did
 * @param {boolean} [facts.controlled] - is the helper looking after this page yet?
 * @param {string[]} [facts.missing] - files not saved yet (unknown until sw.js answers)
 * @param {boolean} [facts.online] - false when the internet is off
 * @returns {{kind: 'ready'|'waiting'|'problem', text: string}} what the badge shows
 */
export function describeOfflineState({ supported, secure, error, controlled, missing, online }) {
  if (!secure) return { kind: 'problem', text: '⚠ Offline needs https://' };
  if (!supported) return { kind: 'problem', text: '⚠ This browser can’t save for offline' };
  if (error) return { kind: 'problem', text: `⚠ Can’t save for offline: ${error}` };
  if (!controlled || !missing) return { kind: 'waiting', text: '⏳ Getting ready for offline…' };
  if (missing.length > 0) return { kind: 'waiting', text: `⏳ Saving for offline… (${missing.length} left)` };
  return { kind: 'ready', text: online === false ? '✓ Playing offline' : '✓ Ready offline' };
}

/**
 * Ask the browser to start the offline helper (sw.js), and keep the
 * "ready offline" badge up to date.
 *
 * Old browsers without service workers simply skip the helper, and the
 * site still works normally, just not offline. The badge says so.
 * @returns {void}
 */
export function registerServiceWorker() {
  const badge = document.createElement('p');
  badge.className = 'offline-badge';
  badge.setAttribute('role', 'status'); // screen readers read out changes
  document.body.append(badge);

  const facts = { supported: 'serviceWorker' in navigator, secure: window.isSecureContext };
  /**
   * Show the newest facts on the badge.
   * @returns {{kind: string, text: string}} what the badge now says
   */
  const show = () => {
    const state = describeOfflineState({ ...facts, online: navigator.onLine });
    badge.textContent = state.text;
    badge.dataset.kind = state.kind; // blocks.css colors it by kind
    return state;
  };
  show();
  if (!facts.supported || !facts.secure) return;

  window.addEventListener('online', show);
  window.addEventListener('offline', show);

  let checkTimer = null; // the next check, while still getting ready
  /**
   * Ask the helper how it's doing, and keep asking until it's ready.
   * @returns {Promise<void>}
   */
  const check = async () => {
    const helper = navigator.serviceWorker.controller;
    facts.controlled = Boolean(helper);
    facts.missing = helper ? await askMissingFiles(helper) : undefined;
    if (show().kind === 'waiting') {
      clearTimeout(checkTimer);
      checkTimer = setTimeout(check, CHECK_EVERY_MS);
    }
  };
  // A new helper took over this page (the first visit, or after an update).
  navigator.serviceWorker.addEventListener('controllerchange', check);

  // Wait until the page has finished loading, so starting the helper
  // never slows down Caleb's first look at the page.
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then((registration) => {
        watchInstall(registration.installing, facts, show);
        check();
      })
      .catch((error) => {
        // Not a big deal: the site works without it, just not offline.
        console.warn('Offline helper could not start:', error);
        facts.error = String(error);
        show();
      });
  });
}

/**
 * Notice if a new helper gives up while saving files (that happens when
 * one of the PRECACHE files in sw.js can't be downloaded).
 * @param {ServiceWorker|null} worker - the helper being installed, if any
 * @param {object} facts - the badge's facts, to add the error to
 * @param {Function} show - updates the badge
 * @returns {void}
 */
function watchInstall(worker, facts, show) {
  if (!worker) return;
  worker.addEventListener('statechange', () => {
    // "redundant" means it was thrown away. If no older helper is still
    // looking after the page, nothing is saved for offline.
    if (worker.state === 'redundant' && !navigator.serviceWorker.controller) {
      facts.error = 'a file would not download';
      show();
    }
  });
}

/**
 * Ask the helper which files it hasn't saved yet. It answers on a
 * MessageChannel: a private two-ended pipe, one end for each of us.
 * @param {ServiceWorker} helper - the helper looking after this page
 * @returns {Promise<string[]|undefined>} the missing files, or undefined if it didn't answer
 */
function askMissingFiles(helper) {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(undefined), ASK_TIMEOUT_MS);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      resolve(event.data);
    };
    helper.postMessage('missing-files', [channel.port2]);
  });
}
