# ⌨️ Typing Trainer — Design Spec

**Date:** 2026-10-06
**Status:** Draft, awaiting review
**Builds on:** the site conventions in `2026-10-02-calebhamsa-fun-design.md`. The trainer is its own page (`type.html`), like the chemistry room.

## Purpose

A calm block-mining game that teaches Caleb (5) **where the keys are on a real keyboard**. A wall of letter blocks sits on screen. The block he's on glows, its letter is said out loud, and the matching key lights up on a drawn keyboard, with the finger to use shown on a pair of hands. Pressing the right key breaks the block. Clearing walls earns stars and unlocks the next level, which adds new keys in the usual typing-class order (home row first).

He knows his letters but can't read words yet, so the game is **one letter at a time**: no words, no punctuation, no timer, no lives.

### Success criteria

1. With a real keyboard (a Bluetooth keyboard on the iPad, or a computer), Caleb can start level 1 alone: tap the "press a key" overlay, then press F and J as the blocks ask.
2. A right key pops the block with a sound and moves the glow to the next block. A wrong key wobbles the block with a soft bonk, flashes the key he actually pressed in gray, and changes nothing else.
3. Clearing a wall plays a happy chord and adds a ⭐. Three walls finish the level and unlock the next one.
4. Stars and unlocks survive closing the iPad. The page works offline once it has been visited.
5. Holding a key down, pressing Shift/Caps Lock/arrows, or using shortcuts like ⌘R never counts as a hit or a miss.
6. Project conventions hold: vanilla JS with no dependencies, a header comment on every file, JSDoc on every function, 🧪 "Try this!" comments, and pure logic covered by `npm test`.

### Decisions made during brainstorming

| Question | Decision |
|---|---|
| Input | A real keyboard only. The drawn keyboard is a picture and isn't tappable. |
| What it teaches | Finding the keys: one letter at a time, with key and finger shown and the letter spoken |
| Game feel | Mining a wall of blocks. No timer, no losing. |
| Rendering | Plain HTML `<div>` blocks and CSS animations, not a canvas |
| Walls per level | 3 walls of 8 blocks (about 24 keypresses) |
| Punctuation | None. Only letters A–Z are taught. |

## The screen

```
 ┌───────────────────────────────────────────┐
 │ 🏠  [1⭐⭐⭐][2⭐][3][🪨4][🪨5] …          │  ← level strip
 │                                           │
 │      ┌───┐┌───┐┌───┐┌───┐┌───┐┌───┐┌───┐┌───┐
 │      │ F ││ J ││ D ││ K ││ F ││ S ││ J ││ D │  ← wall
 │      └───┘└───┘└───┘└───┘└───┘└───┘└───┘└───┘
 │       ▲ the block he's on glows           │
 │                                           │
 │  [Q][W][E][R][T][Y][U][I][O][P]           │
 │   [A][S][D][F][G][H][J][K][L]             │  ← drawn keyboard
 │    [Z][X][C][V][B][N][M]                  │
 │                                           │
 │      ▮▮▮▮ ▮        ▮ ▮▮▮▮                 │  ← two hands
 └───────────────────────────────────────────┘
```

- **Level strip:** one block for each level. Locked levels are stone 🪨, unlocked ones are grass, and finished ones show their stars (0–3). Tapping an unlocked level starts it from wall 1. The 🏠 goes back to `index.html`.
- **Wall:** 8 letter blocks in one row, played left to right. The block he's on glows. Broken blocks stay as empty gaps, so the wall visibly clears.
- **Drawn keyboard:** three rows of letter keys only (Q–P, A–L, Z–M). Each key is tinted with its finger's color. The key for the glowing block lights up brightly, and F and J have a small bump like a real keyboard.
- **Hands:** two simple hands made of `<div>` fingers (4 fingers plus a thumb each), colored like the keys. The finger for the glowing block lights up.
- **Start overlay:** "⌨️ Press a key to start!" sits over the page on load. Pressing a key or tapping it removes it. That first gesture also unlocks sound and speech (Safari requires one). The key that dismisses the overlay does not count as a hit or miss.
- **On a phone or narrow screen**, the keyboard and wall shrink to fit (blocks sized with `vw`/`min()`), so there's no sideways scrolling.

### Finger colors

These follow the usual typing-chart layout, and each pair of matching fingers shares a color:

| Finger | Left hand keys | Right hand keys | Color |
|---|---|---|---|
| Pointer | F G R T V B | J H U Y N M | green |
| Middle | D E C | K I | blue |
| Ring | S W X | L O | purple |
| Pinky | A Q Z | P | orange |

## Levels

| Level | New keys | All keys on the wall |
|---|---|---|
| 1 | F J | F J |
| 2 | D K | F J D K |
| 3 | S L | F J D K S L |
| 4 | A | the whole home row (A S D F J K L) |
| 5 | G H | home row + G H |
| 6 | R U | … + R U |
| 7 | E I | … + E I |
| 8 | T Y | … + T Y |
| 9 | W O | … + W O |
| 10 | Q P | home row + the whole top row |
| 11 | V M | … + V M |
| 12 | C | … + C |
| 13 | X Z B N | all 26 letters |

Each letter A–Z is taught in exactly one level.

### Wall rules

- **Size:** 8 blocks.
- **Mix:** at least 4 of the 8 are the level's **new** keys. The rest are picked at random from the keys taught in earlier levels. Level 1 has no earlier keys, so every block is F or J.
- **No three in a row:** the same letter never appears three times in a row. Level 4 has only one new key (A), so its wall alternates A with other home-row keys.
- **Randomness:** `makeWall` takes a `random` function (by default `Math.random`), so tests can pass in a seeded one.
- **Stars:** each cleared wall adds a ⭐ to the level, up to 3. The third ⭐ finishes the level and unlocks the next. After the third wall, play continues with fresh walls of the same level, and the stars stay at 3. The next level is one tap away on the strip, and the game doesn't move him there automatically.
- **Replaying** a finished level is allowed and never takes stars away.

## Keys

- A press counts only when `event.key` is a single letter `a`–`z` or `A`–`Z`. It's compared without caring about case, so Caps Lock doesn't matter.
- These are ignored: `event.repeat` (a held key), any press with Ctrl, ⌘ (Meta) or Alt held (so browser shortcuts still work), and every non-letter key.
- The game uses `event.key` (the letter the keyboard actually typed) and not `event.code`, so a non-QWERTY keyboard still checks the right letter. The drawn keyboard is always QWERTY.
- **Hit:** the block pops (CSS scale-up + fade), a short high "tock" plays, and the glow moves on. The next letter is spoken.
- **Miss:** the target block wobbles (CSS shake) and a soft low bonk plays. The key he pressed flashes gray on the drawn keyboard. The target letter is spoken again, and the wall doesn't change.

## Sound and speech

- **Tones:** pop, bonk and the wall-cleared chord all play through the shared `js/sound.js` (`playTones`, `listenForUnlock`), so the trainer needs no new sound code.
- **Speech:** letters are spoken with `speechSynthesis`, the way `js/chem/room.js` already does it (cancel, then speak). The letter is passed as a capital ("A"), so it's read as the letter and not the word "a".
- If speech isn't available the game is silent but still works.

## Saving

- **Key:** `localStorage['calebhamsa.type']` holds JSON `{ "version": 1, "stars": [3, 1, 0, …] }`, one number per level.
- **Loading:** missing, unreadable or wrong-version data, or storage that is blocked (it can throw), all give a fresh start: level 1 unlocked, no stars. Star counts are clamped to 0–3.
- **Unlocked levels:** level 1, plus every level whose previous level has 3 stars.
- **When to save:** after every cleared wall. If saving throws, the game keeps going in memory.
- **Starting level:** the page opens on the highest unlocked level.

## Code

These follow the chemistry room's pattern: pure logic that `npm test` can import, plus one file of page code.

| File | Role | Depends on |
|---|---|---|
| `type.html` | The page: level strip, wall, drawn keyboard, hands, start overlay. Same `<head>` setup as the other pages (icons, manifest, og tags, fonts, `pwa.js`). | `css/blocks.css`, `css/type.css`, `js/type/game.js` |
| `css/type.css` | Trainer layout, finger colors, glow/pop/wobble animations | — |
| `js/type/levels.js` | **Pure.** `LEVELS` (new keys for each level), `KEYBOARD_ROWS`, `FINGERS` (key → `{hand, finger}`), `FINGER_COLORS`, `keysUpTo(level)` | — |
| `js/type/wall.js` | **Pure.** `makeWall(level, random)` gives 8 letters. `newGame(level, stars, random)` gives a state. `pressKey(state, key, random)` gives `{state, result}`, where `result` is one of `'ignored'`, `'miss'`, `'hit'`, `'wallDone'`, `'levelDone'`. `isLetterKey(event)`. | `levels.js` |
| `js/type/progress.js` | **Pure.** `loadProgress(storage)`, `saveProgress(storage, progress)`, `addStar(progress, level)`, `isUnlocked(progress, level)`, `highestUnlocked(progress)` | — |
| `js/type/game.js` | **Page code.** Builds the DOM, handles `keydown`, plays animations, sound and speech, saves | the three above, `../sound.js` |

**State:** `{ level, letters: string[8], index, stars }`. `pressKey` never changes the state it's given and always returns a new one. After a wall is cleared, the new state has a fresh wall, `index` 0, and `stars + 1` (capped at 3). `levelDone` is returned only on the clear that takes stars from 2 to 3. Every other clear returns `wallDone`.

**Changes to existing files:**
- `index.html` gets a ⌨️ TYPE tile and an entry in "My favorite things".
- `sw.js` adds `type.html`, `css/type.css` and the four `js/type/*.js` files to `PRECACHE`, and bumps `CACHE_NAME` from `caleb-v8` to `caleb-v9`.
- `tests/pages.test.js` adds `type.html` to `PAGES`.
- `wiki/` gets a short "⌨️ Typing" page (how to play, the level order, the finger chart), linked from the wiki home and sidebar.

## Testing

**Unit tests (written first, `npm test`):**
- `tests/type-levels.test.js`: the 26 letters are each taught exactly once. Every key in `KEYBOARD_ROWS` has a finger and color. F and J are the left and right pointer fingers. `keysUpTo` grows level by level.
- `tests/type-wall.test.js`, run with many seeded `random`s at every level:
  - every wall has 8 letters, at least 4 of them new
  - only keys taught so far appear, and never three of the same in a row
  - level 1 is only F and J
  - `pressKey`: upper- and lowercase both hit, non-letters are `'ignored'`, a miss returns an unchanged copy of the state, the 8th hit returns `wallDone` with a fresh wall, the clear that reaches the 3rd star returns `levelDone`, and stars cap at 3
  - `isLetterKey` rejects repeat, Ctrl/Meta/Alt, `Shift` and `ArrowLeft`
- `tests/type-progress.test.js`: save→load round trip. `null`, junk JSON, wrong version and storage that throws all give a fresh start. Clamping works, unlocking follows the 3-star rule, and `highestUnlocked` is correct.
- The existing `docs.test.js`, `pages.test.js`, `sw.test.js` and `wiki.test.js` then automatically cover JSDoc, the page `<head>`, precache and the wiki.

**Hands-on check:** headless Chromium (Playwright borrowed from `~/LFG/scripts/share_card/node_modules`) at desktop and iPad sizes. It loads `type.html`, dismisses the overlay, types a wall's letters (read from the DOM) and checks that the blocks clear and a ⭐ appears. It also presses a wrong key and checks for the wobble class, then reloads and checks the stars are still there. Screenshots confirm the layout. The last check is Caleb on the iPad with its real keyboard.

## Out of scope (YAGNI)

- Tapping the drawn keyboard (no keyboard needed), words, numbers, punctuation, speed or accuracy scores, timers, falling letters, multiple players, and settings.
