/**
 * pwa.js — turns the site into an app that works offline.
 *
 * "PWA" stands for Progressive Web App: a website that can be added to the
 * home screen and opened like an app, even with no internet. Two pieces
 * make that happen:
 *   - manifest.webmanifest: the app's name, icon and colors
 *   - sw.js: the service worker, which saves files for offline use
 *
 * This file just asks the browser to start sw.js. Every page calls
 * registerServiceWorker() once.
 */

/**
 * Ask the browser to start the offline helper (sw.js).
 *
 * Old browsers without service workers simply skip this, and the site
 * still works normally, just not offline.
 * @returns {void}
 */
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // Wait until the page has finished loading, so starting the helper
  // never slows down Caleb's first look at the page.
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((error) => {
      // Not a big deal: the site works without it, just not offline.
      console.warn('Offline helper could not start:', error);
    });
  });
}
