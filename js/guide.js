/**
 * guide.js — the ❓ guide on the Build page: a pop-up that explains the
 * tools, every tab's rules, and every block, with the block's picture.
 *
 * The words live with the blocks, in each pack's `guide` (see
 * js/blocks/basic.js), so a new pack brings its own guide pages with it.
 * The pictures are drawn by the same code as the palette, so they always
 * match the game.
 *
 * Open it with the ❓ button, or press and hold a block in the palette
 * to jump straight to that block. Close it with ✖, a tap outside it, or Esc.
 * The world keeps running behind it.
 */
import { AIR_INFO, PACKS, blockInfo, blocksInPack } from './blocks/registry.js';
import { blockCanvas } from './block-art.js';
import { choose, flash } from './ui.js';

/** The tools, for the guide's first page. */
export const TOOLS_GUIDE = [
  { icon: '🧱', name: 'BUILD', does: 'Tap or drag to put the chosen block down.' },
  { icon: '⛏️', name: 'DIG', does: 'Tap or drag to take blocks away. It scoops up water too.' },
  { icon: '✋', name: 'USE', does: 'Tap a block to make it do its thing: a switch flips, a crank turns, a note block sings.' },
];

/** More tips for the first page: the other buttons. */
const OTHER_BUTTONS = [
  { icon: '🌍', name: '1 2 3', does: 'Three worlds to build in. Each one saves by itself.' },
  { icon: '📷', name: 'PICTURE', does: 'Saves a picture of your world.' },
  { icon: '🗑️', name: 'NEW WORLD', does: 'Clears this world so you can start again.' },
  { icon: '❓', name: 'GUIDE', does: 'This! Press and hold a block in the palette to read about just that block.' },
];

/** The id of the guide's first page (the tools). */
const HOW_TAB = 'how';

/** How big the block pictures are, in CSS pixels. */
const PICTURE_PX = 48;

/**
 * Everything the guide says, one section per palette tab, in palette
 * order. (Pure: tests/guide.test.js checks it.)
 * @returns {Array<{id: string, icon: string, label: string, rules: string[],
 *   entries: Array<{name: string, title: string, does: string, use: string|undefined}>}>}
 *   the sections
 */
export function guideSections() {
  return PACKS.map((pack) => ({
    id: pack.tab.id,
    icon: pack.tab.icon,
    label: pack.tab.label,
    rules: pack.guide?.rules ?? [],
    entries: blocksInPack(pack.tab.id).map((name) => ({
      name,
      title: blockInfo(name).title,
      does: pack.guide?.blocks?.[name]?.does ?? '',
      use: pack.guide?.blocks?.[name]?.use,
    })),
  }));
}

/**
 * Make an element with some text in it.
 * @param {string} tag - like 'p' or 'h3'
 * @param {string} text - what it says
 * @param {string} [className] - a CSS class
 * @returns {HTMLElement} the element
 */
function element(tag, text, className) {
  const made = document.createElement(tag);
  made.textContent = text;
  if (className) made.className = className;
  return made;
}

/**
 * Make one row of the guide: a picture (or an icon), a name, and what it does.
 * @param {HTMLElement} picture - a block canvas, or an icon
 * @param {string} name - the name
 * @param {string} does - what it does
 * @param {string} [use] - what ✋ USE does to it
 * @returns {HTMLElement} the row
 */
function row(picture, name, does, use) {
  const entry = element('div', '', 'guide-entry');
  const words = element('div', '', 'guide-words');
  words.append(element('h3', name), element('p', does));
  if (use) words.append(element('p', `✋ USE: ${use}`, 'guide-use'));
  entry.append(picture, words);
  return entry;
}

/**
 * Set up the guide pop-up (build.html has the <dialog>).
 * @returns {{open: Function}} open(tabId, blockName?) shows the guide
 *   on a tab, scrolled to a block if one is given
 */
export function initGuide() {
  const dialog = document.getElementById('guide');
  const list = document.getElementById('guide-list');
  const tabs = document.getElementById('guide-tabs');
  const sections = guideSections();

  const pages = [{ id: HOW_TAB, icon: '❓', label: 'How' }, ...sections];
  const tabButtons = pages.map((page) => {
    const button = element('button', page.icon, 'block');
    button.type = 'button'; // not a "close" button: the form closes the guide
    button.dataset.guideTab = page.id;
    button.setAttribute('aria-label', page.label);
    button.addEventListener('click', () => show(page.id));
    return button;
  });
  tabs.prepend(...tabButtons);

  /**
   * Show one page of the guide.
   * @param {string} id - a pack's tab id, or HOW_TAB
   * @returns {void}
   */
  function show(id) {
    choose(tabButtons, tabButtons.find((button) => button.dataset.guideTab === id) ?? null);
    list.replaceChildren();
    list.scrollTop = 0;
    if (id === HOW_TAB) {
      list.append(element('h2', 'How to play'));
      for (const tool of [...TOOLS_GUIDE, ...OTHER_BUTTONS]) {
        list.append(row(element('span', tool.icon, 'guide-icon'), tool.name, tool.does));
      }
      return;
    }
    const section = sections.find((s) => s.id === id);
    if (!section) return;
    list.append(element('h2', `${section.icon} ${section.label}`));
    const rules = element('ul', '', 'guide-rules');
    for (const rule of section.rules) rules.append(element('li', rule));
    list.append(rules);
    for (const entry of section.entries) {
      const picture = blockCanvas(blockInfo(entry.name), PICTURE_PX, AIR_INFO.color);
      const made = row(picture, entry.title, entry.does, entry.use);
      made.dataset.block = entry.name;
      list.append(made);
    }
  }

  /**
   * Open the guide.
   * @param {string} tabId - which tab to open on
   * @param {string} [blockName] - a block to jump to
   * @returns {void}
   */
  function open(tabId, blockName) {
    show(tabId);
    if (!dialog.open) dialog.showModal();
    const entry = blockName ? list.querySelector(`[data-block="${blockName}"]`) : null;
    if (entry) {
      entry.scrollIntoView({ block: 'center' });
      flash(entry, 'found', 1500);
    }
  }

  // A tap on the dark area outside the guide closes it. (The dialog has
  // no padding, so a tap that lands on the dialog itself is outside the form.)
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  return { open };
}
