# calebhamsa.fun

Caleb's blocky corner of the internet: 🎵 **Note Blocks** (notes, chords,
scales and an ear-training game), 🎨 **Draw**, and ✍️ **Write** (print and
cursive tracing).

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
| `index.html` | The homepage: title, three big blocks, favorite things |
| `music.html` | The Note Blocks page layout |
| `draw.html` | The Draw & Trace page layout |
| `css/blocks.css` | How everything **looks**: colors, block buttons, animations |
| `js/music-theory.js` | The music brain: notes as numbers, chords, scales (pure math) |
| `js/music.js` | Makes Note Blocks work: sound, modes, record, Guess it! |
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

Every file starts with a comment explaining what it does, and every
function has a comment saying what goes in and what comes out.

## 🧪 Experiments to try

Search the code for `🧪 Try this!` to find them all. Some favorites:

1. **Night sky:** in `css/blocks.css`, change `--sky` to `#1a1a40`.
2. **Old-time tuning:** in `js/music-theory.js`, change `A4_HZ` from 440 to 415.
3. **Long notes:** in `js/music.js`, set `NOTE_SECONDS` to 3.
4. **Hear the click:** set `ATTACK_SECONDS` to 0, then tap a block.
5. **A new chord:** add `sus4: [0, 5, 7],` to `CHORDS`, then copy a chord button in `music.html` and change it to `data-chord="sus4"`.
6. **A new scale:** add `blues: [3, 2, 1, 1, 3, 2],` to `SCALES`, plus a button.
7. **Wild rainbow:** in `js/draw.js`, set `RAINBOW_STEP` to 30.
8. **Hot pink:** add `'#ff69b4'` to `COLORS`.
9. **Four fading copies:** in `js/trace.js`, set `FADE_OPACITIES` to `[0.6, 0.4, 0.2, 0.1]`.
10. **New favorite thing:** add an `<li>` to the list in `index.html`.
11. **Redraw the app icon:** change letters in `img/icon-pixels.txt` (try a different letter instead of the C), then run `node tools/make-icons.js`.

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
- [ ] Turn on Airplane Mode and open the home-screen app: every page still works.

## Publishing

The site is hosted by GitHub Pages from the `main` branch of
`Team-Hamsa/calebhamsa.fun`. Pushing to `main` updates the live site in
about a minute. There's no build step: GitHub serves these exact files.
