# calebhamsa.fun

Caleb's blocky corner of the internet: 🎵 **Note Blocks** (notes, chords,
scales and an ear-training game), 🎨 **Draw**, ✍️ **Write** (print and
cursive tracing), and ⛏️ **Build** (a block world with water, steam,
electricity and gears: see [the wiki](https://github.com/Team-Hamsa/calebhamsa.fun/wiki)).

It's built with plain HTML, CSS and JavaScript (no frameworks, no build
step), so every file can be opened, read, changed and tried.

## Run it on your computer

The pages use JavaScript "modules", which browsers only load from a web
server (not by double-clicking the file). Python has a tiny one built in:

```bash
cd caleb-website
python3 -m http.server 8000
```

Then open <http://localhost:8000>. Change a file, save, and reload the page.

## What's where

| File | What it does |
|---|---|
| `index.html` | The homepage: title, five big blocks, favorite things |
| `music.html` | The Note Blocks page layout |
| `draw.html` | The Draw & Trace page layout |
| `build.html` | The Build page layout |
| `chem.html` | The Chemistry room layout |
| `css/blocks.css` | How everything **looks**: colors, block buttons, animations |
| `js/music-theory.js` | The music brain: notes as numbers, chords, scales (pure math) |
| `js/music.js` | Makes Note Blocks work: sound, modes, record, Guess it! |
| `js/sound.js` | The shared sound machine: voices and playing notes |
| `js/build.js` | Makes the Build page work: tools, palette, clock, saving |
| `js/world.js` | The block world: a grid of block names (pure) |
| `js/blocks/basic.js` | ⛏️ Basic blocks: falling sand, singing note blocks |
| `js/blocks/electric.js` | ⚡ Power blocks: batteries, wires, switches, lamps, buzzers, clickers |
| `js/circuit.js` | The electricity math: loops, brightness, short circuits (pure) |
| `js/blocks/water.js` | 💧 Water blocks: pipes, valves, faucets, drains, burners, chillers, turbines, pumps |
| `js/fluids.js` | How water and steam move: falling, spreading, squishing (pure) |
| `js/blocks/gears.js` | ⚙️ Gear blocks: gears, axle, crank, water wheel, motor, generator (one machine, fitted two ways round) |
| `js/spin.js` | How turning passes from gear to gear, and when gears jam (pure) |
| `js/blocks/registry.js` | The list of block packs (add new packs here) |
| `js/block-art.js` | Draws blocks pixel-art style |
| `js/saves.js` | Keeps the three Build worlds saved |
| `js/chem/room.js` | Makes the Chemistry room work: tools, atoms, name cards, the book |
| `js/chem/board.js` | The chemistry board: atoms holding hands, finished and stuck molecules (pure) |
| `js/chem/smiles.js` | Reads molecules written as SMILES text, like `CCO` (pure) |
| `js/chem/canon.js` | Gives each molecule one label, however it was built (pure) |
| `js/chem/book.js` | The collection book and the unlock ladder (pure) |
| `js/chem/lookup.js` | "What did I make?": hand-written list, then the big list |
| `js/chem/kid-names.js` | The hand-written molecules: kid names and fun facts |
| `js/chem/chem-art.js` | Draws atoms, sticks and hands |
| `js/chem/save.js` | Keeps the chemistry board and book saved |
| `data/molecules.json` | 69,000 real molecule names from PubChem (made by `tools/chem-db/`) |
| `js/draw.js` | The drawing pad: brushes, colors, clear, save |
| `js/trace.js` | Handwriting sheets: lines, print/cursive letters, fade-out rows |
| `js/ui.js` | Little helpers every page shares (buttons, grid swipes, picture names) |
| `js/pwa.js` | Starts the offline helper |
| `sw.js` | The offline helper ("service worker"): saves the site so it works with no internet |
| `manifest.webmanifest` | The app's name, icons and colors, for "Add to Home Screen" |
| `img/icon-pixels.txt` | **The app icon, drawn with letters**: one letter per pixel |
| `tools/make-icons.js` | Turns `icon-pixels.txt` into every icon file (no libraries needed) |
| `img/share-card.html` | The picture shown when someone shares a link to the site |
| `tools/make-share-card.cjs` | Takes a screenshot of the share card (needs Playwright, see below) |
| `tests/` | Automatic checks: run `npm test` (needs Node 20+, nothing to install) |
| `wiki/` | The how-to-play pages and their pictures (they become [the wiki](https://github.com/Team-Hamsa/calebhamsa.fun/wiki)) |
| `.github/workflows/wiki.yml` | Copies `wiki/` to the wiki every time the code is published |

Every file starts with a comment explaining what it does, and every
function has a comment saying what goes in and what comes out.

## 📖 How to play

What every block does, machines to build, the Chemistry room and experiments
to try are all in **[the wiki](https://github.com/Team-Hamsa/calebhamsa.fun/wiki)**:

- ⛏️ Build blocks, one page per tab:
  [Blocks](https://github.com/Team-Hamsa/calebhamsa.fun/wiki/Blocks),
  [Water](https://github.com/Team-Hamsa/calebhamsa.fun/wiki/Water),
  [Power](https://github.com/Team-Hamsa/calebhamsa.fun/wiki/Power),
  [Gears](https://github.com/Team-Hamsa/calebhamsa.fun/wiki/Gears),
  [Lifting](https://github.com/Team-Hamsa/calebhamsa.fun/wiki/Lifting)
- [🛠️ Machines to build](https://github.com/Team-Hamsa/calebhamsa.fun/wiki/Machines-to-build)
- [🧪 The Chemistry room](https://github.com/Team-Hamsa/calebhamsa.fun/wiki/Chemistry-room)
- [🧪 Experiments to try](https://github.com/Team-Hamsa/calebhamsa.fun/wiki/Experiments)

The same explanations of the blocks are in the game too: tap **❓** on the
Build page. The wiki's pages are the files in [`wiki/`](wiki/), so they are
changed here, with the code, and published by themselves (see
[Publishing](#publishing)).

## Using it like an app (offline)

On the iPad, open the site in Safari, tap **Share**, then **Add to Home Screen**.
It gets the grass-block icon, opens full-screen with no browser bars, and
works **without internet** once it has been opened online. Fonts are saved
too, on the first visit.

The little badge in the bottom-left corner says how it's going:
**⏳ Saving for offline… (N left)** while files download, **✓ Ready offline**
when everything is saved (check for this before a car trip!), **✓ Playing
offline** with no internet, and **⚠ …** with the reason if offline can't work.

When you change the code and push it, the app picks up the new version the
next time it's opened online. The offline helper (`sw.js`) always tries the
internet first, so you never get stuck with an old copy. If you add a
**new file** to the site, also add it to `PRECACHE` in `sw.js` and change
`caleb-v1` to `caleb-v2`.
If you change a Google Fonts `<link>` in a page, change `FONT_STYLESHEETS`
in `sw.js` to match (the tests check they agree).

In app mode, 💾 save opens the iPad's share/preview sheet instead of
downloading. Choose **Save Image** there.

`manifest.webmanifest` is JSON, which can't hold comments, so here's what it says:
`name` and `short_name` are the app's full name and the name under the icon;
`start_url` is the page it opens on; `display: standalone` means full-screen
with no browser bars; `theme_color` and `background_color` are the sky blue
shown while it starts; `icons` lists the icon pictures (the "maskable" one has
extra sky around it, so phones can cut it into a circle).

## Remaking the pictures

- **Icons:** `node tools/make-icons.js` (built into Node, nothing to install).
  The tests check that `img/icon.svg` matches `icon-pixels.txt`, so they'll
  remind you if you forget.
- **Share card:** this one needs a real browser, so it uses Playwright:
  ```bash
  npm install --no-save playwright
  npx playwright install chromium
  node tools/make-share-card.cjs
  ```
- **Build page block and machine pictures** (`wiki/blocks/`, `wiki/machines/`):
  same Playwright setup, then `node tools/make-block-pictures.cjs`. Run it
  after changing how a block looks, or after adding a block (a test checks
  that every palette block has a picture on a wiki page).

## Checklist for a real tablet or phone

Run through this after big changes (Caleb is the best tester):

- [ ] Every homepage block opens its page, and 🏠 comes back.
- [ ] Music: the first tap makes sound. On iPhone/iPad, also check the silent switch is off: it mutes web audio.
- [ ] Music: holding a computer key plays one note, not a stream.
- [ ] Music: chords light all their blocks; scales glow and dim; Guess it! counts a right note even after changing octave.
- [ ] Draw: drawing doesn't scroll the page; two fingers draw two separate lines.
- [ ] Draw: a quick tap on 🗑 does nothing; holding it for 1 second clears.
- [ ] Draw: 💾 downloads a PNG.
- [ ] Trace: the cursive guide is joined-up cursive (not a plain font).
- [ ] Trace: weird text in "your word" (emoji, numbers) is cleaned up.
- [ ] Rotating the tablet keeps the drawing and redraws the guides.
- [ ] Nothing scrolls sideways on a phone.
- [ ] Add to Home Screen shows the grass-block icon and opens full-screen.
- [ ] Chemistry: H–O–H says "Water!" and unlocks C; the book shows the water picture.
- [ ] Chemistry: 🔗 on O–O makes O=O (Oxygen); 🔗 on a full pair pulls it apart.
- [ ] Chemistry: holding 🔗 on an atom glows the pair it means (🔗/✂️/🚫); sliding onto another neighbor switches pairs; nothing changes until the finger lifts.
- [ ] Chemistry: a molecule with a long chemistry name gets 🌟 (needs the internet once).
- [ ] Turn on Airplane Mode and open the home-screen app: every page still works.

## Publishing

The site is hosted by GitHub Pages from the `main` branch of
`Team-Hamsa/calebhamsa.fun`. Pushing to `main` updates the live site in
about a minute. There's no build step: GitHub serves these exact files.

Pushing to `main` also publishes the wiki: when anything in `wiki/` changes,
a GitHub Action (`.github/workflows/wiki.yml`) copies that folder to
[the wiki](https://github.com/Team-Hamsa/calebhamsa.fun/wiki). Change the
pages here, not with the wiki's own Edit button, or the next publish will
undo the change.
