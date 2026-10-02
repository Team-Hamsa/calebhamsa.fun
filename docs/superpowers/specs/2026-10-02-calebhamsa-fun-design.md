# calebhamsa.fun — Design Spec

**Date:** 2026-10-02
**Status:** Draft, awaiting review

## Purpose

A personal homepage with playground toys for Caleb (age 4, almost 5), hosted on
GitHub Pages at `calebhamsa.fun`. The code itself is a learning tool: Caleb and
his dad read and modify it together, so clarity and comments matter as much as
features.

### What Caleb is into (drives the content)

- **Music:** recognizes notes by ear, including sharps and flats. Next steps: chords, scales, keys.
- **Drawing.**
- **Writing:** writes upper- and lowercase print letters (needs practice) and wants to learn cursive.
- **Minecraft:** sets the visual theme.

### Success criteria

1. Caleb can use every page by himself: big targets, minimal reading, works on a tablet or phone.
2. A parent can open any file, read its comments, change a value, reload, and see the effect.
3. The site is live at `https://calebhamsa.fun` with HTTPS enforced.

## Constraints

- **Vanilla HTML, CSS and JavaScript only.** No frameworks, no bundler, no build step, no npm dependencies.
- **Blocky, Minecraft-*inspired* look drawn in our own CSS.** No Mojang art, textures, fonts, logos, or the word "Minecraft" in branding.
- **Public site, light personal info:** first name and favorites only. No school, location, or surname-plus-photo combinations.
- **Heavy commenting** (see Code conventions).

## Architecture

Multi-page static site. Each page is one idea with its own script.

```
caleb-website/
├── index.html            homepage
├── music.html            note blocks
├── draw.html             drawing + tracing (trace mode via ?mode=trace)
├── CNAME                 calebhamsa.fun
├── .nojekyll             serve files as-is (skip Jekyll processing)
├── css/
│   └── blocks.css        shared theme, color variables, block buttons
├── js/
│   ├── music-theory.js   pure functions: pitch math, chords, scales (ES module)
│   ├── music.js          music page UI, Web Audio, record/playback, Guess it!
│   ├── draw.js           canvas drawing: brushes, colors, save, hold-to-clear
│   └── trace.js          guide layer: print/cursive letters, lines, fade-out rows
├── tests/
│   └── music-theory.test.js   node --test, no dependencies
└── README.md             "how to play with this code" guide
```

Scripts are ES modules (`<script type="module">`), so `music.js` imports from
`music-theory.js` and the test file imports the same module under Node. Because
modules don't load from `file://` URLs, the README documents a one-line local
server (`python3 -m http.server`).

## Page 1: Homepage (`index.html`)

- Sky-blue background, CSS pixel clouds, and a grass strip over a dirt strip along the bottom.
- Heading "HI, I'M CALEB!" in **Press Start 2P** (Google Fonts).
- Three big block buttons: **MUSIC** → `music.html`, **DRAW** → `draw.html`, **WRITE** → `draw.html?mode=trace`.
- A "My favorite things" list in plain HTML, meant to be edited by hand.

## Shared theme (`css/blocks.css`)

- Palette as CSS custom properties at the top (`--grass`, `--dirt`, `--sky`, `--stone`, `--obsidian`, ...), each with a 🧪 comment.
- `.block` button: square, chunky, darker bottom border for a 3D look, squishes down on `:active`. Minimum 120px on the homepage; toy controls are at least 56px.
- A 🏠 home block on every toy page.
- Responsive: usable from phone width (360px) up to desktop, with no horizontal scroll.

## Page 2: Music (`music.html`, `js/music.js`, `js/music-theory.js`)

### Keyboard
- 12 note blocks per octave in piano layout: colored naturals on the bottom row, dark "obsidian" sharps raised above.
- A ♯/♭ toggle switches labels (C♯ ↔ D♭).
- Octave ◀ ▶ buttons, range octave 2–6, default 4.
- Computer keys: `a s d f g h j` play the naturals, and `w e t y u` play the sharps (piano-style layout).
- The block lights up and bounces when it plays.

### Modes
- **NOTES:** a tap plays that one note.
- **CHORDS:** a tap plays a chord rooted on that note, and all of the chord's blocks light up together. Chord types are major, minor, diminished, augmented and dominant 7th. Chord tones above the visible octave still sound; only on-screen blocks light up.
- **SCALES:** pick a key (12 roots) and a type: major, natural minor or major pentatonic. In-scale blocks glow and the others dim. "▶ play the scale" walks up root to root (8 notes, or 6 for pentatonic) at about 3 notes per second, lighting each block. While SCALES is active, taps play single notes.
- **👂 GUESS IT!:**
  - Round type "Which note?" plays a random note in the current octave; he taps the block he thinks it is.
  - Round type "Major or minor?" plays a random major or minor triad; he taps [major] or [minor].
  - A right answer gets a cheer animation and a happy arpeggio. A wrong one gets a gentle "try again" and the mystery sound replays.
  - "🔁 hear it again" button, plus a score counter for the session (not saved).

### Sound
- Web Audio API, with no audio files. One shared `AudioContext`, created or resumed on the first user tap (browser autoplay rules, explained in a comment).
- Three voices built on oscillator types: 🎹 soft (`sine`), 🤖 beep (`square`), 🔔 bell (`triangle`).
- A short gain envelope (attack/release) on each note to avoid clicks, with a comment explaining why clicks happen.

### Record and playback
- ⏺ RECORD stores `{ time, midiNotes[] }` events relative to the start. ▶ PLAY BACK replays them with the same timing using `setTimeout`. Recording a chord stores all of its notes.
- Recording lives in memory only and is lost on reload.

### `music-theory.js` (pure, tested)
| Export | Purpose |
|---|---|
| `A4_HZ = 440` | tuning reference (🧪 try 415) |
| `midiToFrequency(midi)` | `440 × 2^((midi − 69) / 12)` |
| `noteName(midi, { useFlats })` | `61 → "C♯4"` or `"D♭4"` |
| `CHORDS` | `{ major:[0,4,7], minor:[0,3,7], dim:[0,3,6], aug:[0,4,8], dom7:[0,4,7,10] }` |
| `SCALES` | step patterns: `major:[2,2,1,2,2,2,1]`, `minor:[2,1,2,2,1,2,2]`, `pentatonic:[2,2,3,2,3]` |
| `buildChord(rootMidi, type)` | root + intervals → MIDI numbers |
| `buildScale(rootMidi, type)` | walks the step pattern → MIDI numbers, root to root |

Notes are MIDI numbers internally (C4 = 60). That's one integer per pitch, explained in a comment.

## Page 3: Draw & Trace (`draw.html`, `js/draw.js`, `js/trace.js`)

### Layers
Two stacked `<canvas>` elements, described as "two sheets of tracing paper":
- **guide** (bottom): trace lines and letters, owned by `trace.js`.
- **ink** (top): Caleb's drawing, owned by `draw.js`. Erase and clear only affect ink.

Both canvases scale for `devicePixelRatio` so lines stay crisp, and redraw on resize. Resizing keeps the ink by copying it into the resized canvas, best effort.

### Drawing (`draw.js`)
- Pointer Events for mouse, touch and stylus, with `touch-action: none` on the canvas so drawing doesn't scroll the page.
- Swatches: red, orange, yellow, green, blue, purple, brown, black, white, plus 🌈 rainbow, which advances the HSL hue as he draws.
- Brushes: ● small, ⬤ big, ▦ block (snaps to a 24px grid and fills cells, for pixel art), 🧽 eraser (`destination-out`).
- 🗑 Hold to clear: the button must be held for 1 second, with a fill animation showing progress.
- 💾 Save: merges the guide and ink into one image (white background) and downloads `caleb-drawing-<date>.png`.

### Tracing (`trace.js`)
- Mode switch [✏️ DRAW] / [ABC TRACE]. `?mode=trace` opens in TRACE.
- Style toggle: **Print** (Andika font) / **Cursive** (Playwrite US Trad font), both from Google Fonts.
- Content:
  - **[CALEB]** traces his name. In print it follows the Aa toggle (`CALEB` / `Caleb`); in cursive it's always `Caleb`.
  - **◀ letter ▶** steps through A–Z.
  - **Aa** toggles uppercase/lowercase for single letters.
  - **"your word:"** is a text input (letters and spaces, max 12 characters) for a parent to type a word.
- Handwriting lines: a solid top line, a dashed midline and a solid baseline, sized so lowercase x-height meets the midline. Two or three line rows depending on screen height.
- **Fade-out rows:** each row repeats the content left to right at decreasing opacity (e.g. 0.45 → 0.25 → 0.12), then leaves an empty slot. Words that don't fit get fewer repeats, with a minimum of one guide plus the empty slot.
- Fonts are awaited with `document.fonts.load()` before drawing guides, with a comment explaining the fallback-font gotcha.
- Changing any trace setting redraws the guide layer and clears the ink (a fresh worksheet).

## Code conventions

Every file has:
1. **A header comment:** what the file does, in plain language, and how it connects to the other files.
2. **A JSDoc docstring on every function:** purpose, `@param`, `@returns`.
3. **🧪 "Try this!" comments** next to tweakable values, giving an experiment and its expected result.

Other conventions: no clever one-liners where a plain loop reads better; descriptive names (`playChord`, not `pc`); constants at the top of each file.

## Testing

- **Automated:** `node --test tests/` (Node 20 built-in runner, no dependencies) covers `music-theory.js`. Cases:
  - A4 = 440 Hz and C4 ≈ 261.63 Hz
  - sharp and flat naming
  - every chord type on C and on a black-key root
  - every scale type on C and on F♯
  - octave wrap-around
- **Manual checklist** in the README, for a real tablet or phone:
  - every button responds
  - sound plays after the first tap (including on iOS)
  - drawing doesn't scroll the page
  - hold-to-clear works and a tap does nothing
  - save downloads a PNG
  - cursive guide renders in the cursive font
  - no horizontal scroll at phone width
- **HTML sanity:** pages served locally and fetched with `curl` to confirm 200s and that the assets resolve. I can't view pages visually from the headless server.

## Hosting & deployment

- **Repo:** `Team-Hamsa/calebhamsa.fun` (public; GitHub Pages on the free plan needs a public repo).
- **Workflow:** direct pushes to `main`. This is a personal static site, so the LFG/Baysed PR review gates don't apply.
- **Pages:** deploy from branch `main`, root `/`. `CNAME` contains `calebhamsa.fun`.
- **DNS (at the registrar, done by the user):**
  - `A` @ → `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
  - `AAAA` @ → `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153`
  - `CNAME` www → `team-hamsa.github.io`
- **Domain verification:** add `calebhamsa.fun` as a verified domain in the Team-Hamsa org settings (Settings → Pages). This prevents takeover by other accounts.
- **HTTPS:** enable "Enforce HTTPS" once the certificate is issued.
- **Fallback URL before DNS:** `https://team-hamsa.github.io/calebhamsa.fun/`. All asset paths are relative so the site works at both URLs.

## Out of scope for v1 (future ideas)

- Stroke-order arrows and start dots for tracing.
- Pixel-world map homepage.
- Saving recordings or drawings across visits.
- Guess-it rounds for scales or other chord qualities.
- Photos of Caleb.
