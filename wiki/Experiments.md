Search the code for `🧪 Try this!` to find them all. Some favorites:

1. **Night sky:** in `css/blocks.css`, change `--sky` to `#1a1a40`.
2. **Old-time tuning:** in `js/music-theory.js`, change `A4_HZ` from 440 to 415.
3. **Long notes:** in `js/sound.js`, set `NOTE_SECONDS` to 3.
4. **Hear the click:** set `ATTACK_SECONDS` to 0, then tap a block.
5. **A new chord:** add `sus4: [0, 5, 7],` to `CHORDS`, then copy a chord button in `music.html` and change it to `data-chord="sus4"`.
6. **A new scale:** add `blues: [3, 2, 1, 1, 3, 2],` to `SCALES`, plus a button.
7. **Wild rainbow:** in `js/draw.js`, set `RAINBOW_STEP` to 30.
8. **Hot pink:** add `'#ff69b4'` to `COLORS`.
9. **Four fading copies:** in `js/trace.js`, set `FADE_OPACITIES` to `[0.6, 0.4, 0.2, 0.1]`.
10. **New favorite thing:** add an `<li>` to the list in `index.html`.
11. **Redraw the app icon:** change letters in `img/icon-pixels.txt` (try a different letter instead of the C), then run `node tools/make-icons.js`.
12. **Slow-motion sand:** in `js/build.js`, set `TICKS_PER_SECOND` to 2.
13. **Dimmer lamps:** in `js/blocks/electric.js`, change the lamp's `resistance` to 2.
14. **Slow-motion water:** in `js/fluids.js`, set `FLUID_STEPS` to 1.
15. **Super gears:** in `js/blocks/gears.js`, give the big gear 24 teeth: small gears it drives spin 3 times as fast.
16. **Easy carbon:** in `js/chem/book.js`, change the N step's goal from 3 carbon molecules to 1.
17. **Your own molecule:** add one to `js/chem/kid-names.js` with its SMILES, a name and a fact, then run `npm test`.
18. **A different machine:** in `js/blocks/gears.js`, set `MACHINE_K` to 2: motors turn half as fast but push twice as hard, and generators make twice the volts. Then try to build a machine that runs by itself. (You can't: the same number is used both ways.)

And three to do on the Build page, with no code at all (they are on the [⚙️ Gears](Gears) page):

1. **The tell-tale lamp:** a lamp in a row with a motor (and two batteries) is nearly dark when the motor runs free, bright while it lifts a crate and brightest when it is stuck.
2. **Help the crank:** two batteries wired against a cranked generator drive it faster than the crank can go.
3. **Swap them:** swap a generator block for a motor block. It works just the same.
