# Turbine redesign: a spin source fed by rising steam — Design Spec

**Date:** 2026-10-05
**Status:** Ready to build. The direction was decided by the owner on #21 (2026-10-04); every open question below is decided here.
**Issue:** #21
**Builds on:** the fluids spec (`2026-10-02-fluids-pack-design.md`, with its #17 addenda: `fallEnergy`, `falling`, `DROP_POWER`) and the gears spec (`2026-10-02-gears-pack-design.md`: `spinSource`, the torque–speed line, `spinBrake`).
**Replaces:** the turbine as a voltage source (`part.pushNow = turbinePush`), and the interim "steam only gives its push once" rule (commit bc49b45 and its follow-up: `world.signals.used`).
**Not in this pass:** steam cooling (#29), the joint motor–generator law (#14/#15). Both are kept easy: see "What this leaves for later".

## Purpose

Today the turbine is a battery that happens to need steam: nothing pushes back on it, so more lamps are free, and the steam loses nothing by turning it. That is the one electricity maker in the game that breaks the rule every other one keeps.

After this pass:

- A turbine makes **turning**, not electricity. It has a top speed and a strength, like a crank or a water wheel. To light a lamp it must turn a **generator**, and then more lamps make it harder to turn, like every other machine.
- **Steam has to RISE to give its push**, exactly as water has to fall. Steam gets an energy ledger that is the water wheel's ledger upside down. A fixed amount of steam gives a capped amount of work, however many turbines, gears, generators and lamps are put on it.

### Success criteria

1. Burner → pot → turbine → generator → lamp lights the lamp (level about 0.8 with one burner and one lamp).
2. A turbine wired straight to a lamp lights nothing. The guide and the wiki say a generator is needed.
3. 1, 2, 4, 8 lamps on one plant: the turbine slows down, each lamp is dimmer, and all the lamps together never get more than 8 tenths of the work the steam gave up.
4. Turbines one after the other in one chimney: together they get exactly what the steam gave up rising past them, never more.
5. With the burner off, every steam machine winds down and stays down.
6. `world.signals.used`, `turbinePush`, `TURBINE_GAIN` and `MAX_TURBINE_PUSH` are gone.
7. `npm test` passes in full; every picture and page that shows the plant shows a generator.

### Decisions

| Question | Decision | Why |
|---|---|---|
| What is steam's energy? | Its **height and squish, upside down**: the same `fallEnergy` water uses, with "down" meaning up | The game's steam already "follows the very same rules upside down". Pressure in this game *is* head, so "rises or un-squeezes" is the game's version of a pressure drop across a turbine. No new idea for a child to learn |
| How much is it worth? | `RISE_POWER = DROP_POWER` (10) | Nothing in the game tells the two fluids apart; one burner (0.05 a tick) then matches one faucet |
| Speed and strength | The water wheel's formulas, with rise for fall | Square-root law is right for a jet from a pressure drop too (Torricelli) |
| Which way it turns | Always `eitherWay`: it helps whichever way its gears go; alone it turns ↻ | A chimney is its own mirror image, so steam has no left or right. Same rule as a wheel with water falling straight through. Two turbines on one shaft never fight |
| Does a loaded turbine hold the steam back? | No | The water wheel doesn't hold water back either. Unused push is simply lost, so the ledger is an upper limit |
| Does water turn a turbine? | No. To water it is a pipe | Water has the water wheel. Water falling through keeps its push for a wheel below |
| Saved worlds | **No migration.** The block keeps its name, so saves load. Old plants stop lighting until a generator is added | An honest migration needs a free cell beside every turbine and a rewire; there is no clean one. Save format and version stay as they are |
| Does the turbine still carry electricity? | No. It is not a circuit part at all | A real turbine has no wires. See "Known side effect: no wire crossing" |
| Where does the block live? | Still the 💧 tab, same place in the palette, same name `turbine` | Saves and the palette test stay as they are |

## The physical law

### Steam's energy

For one cell at row `y` (counted from the top, so a bigger `y` is lower down) holding `amount` of steam:

```
energy = storedEnergy(amount) + amount × y
```

`storedEnergy` is the function water already uses (fluids.js). It is right for steam as it stands, because steam fills a cell from the top and is squished against the cell above, the mirror image of water. Steam low down, or squeezed, has energy to give. Steam at the top of the world, spread thin, has none left.

When steam moves, the energy it gives up is `fallEnergy(from, to, amount, drop)`, where `drop` is 1 for a move UP, 0 sideways, −1 for a move down. `flowFluid` already passes `drop` that way for steam (its "fall" direction is up). Only the `if (kind === 'water')` guard around the energy sum stops it today.

### New constant (fluids.js, next to DROP_POWER)

```js
/**
 * How much turning-work the energy of RISING steam is worth: the same as
 * falling water (DROP_POWER). Steam is water going the other way...
 */
export const RISE_POWER = DROP_POWER; // 10
```

### The turbine (water.js)

```js
export const TURBINE_SPEED = 1;                                   // top speed when its steam rises ONE cell
export const TURBINE_STRENGTH = (4 * RISE_POWER) / TURBINE_SPEED; // 40, for each unit of steam a tick rising one cell
const TURBINE_SMOOTHING = 8;                                      // kept: it follows the steam over about a second
const MIN_TURBINE_FLOW = 0.0025;                                  // same as MIN_WHEEL_FLOW
const MIN_SOURCE = 0.05;                                          // same as gears.js: slower than this drives nothing
```

Each turbine has a smoothed count `{ out, gross, work }` (see "Data flow"):

- `gross` — steam that left the turbine's cell each tick
- `out` — the same, with a sign: + for steam leaving up or right, − for down or left
- `work` — the energy that steam gave up at this turbine each tick

```
through  = min(gross, |out|)          // steam leaving both ends pushes the blades both ways: that cancels
rise     = work ÷ gross               // cells risen, for each unit of steam
speed    = TURBINE_SPEED × √rise
strength = TURBINE_STRENGTH × through × √rise
```

`turbineSource(world, x, y)` returns `{ speed, strength, eitherWay: true }`, or `null` when `gross ≤ 0`, `work ≤ 0`, `through < MIN_TURBINE_FLOW` or `speed < MIN_SOURCE`.

The most work a source on a straight torque–speed line can do is half its strength at half its top speed:

```
strength ÷ 2 × speed ÷ 2 = RISE_POWER × work × (through ÷ gross) ≤ RISE_POWER × work
```

So the turbine can never do more work than its steam gave up. That identity is why `TURBINE_STRENGTH` is not a number to pick freely.

**In child-sized numbers:** one burner's steam rising one cell through a turbine makes it exactly as good as a crank (speed 1, strength 2). In the standard plant (turbine right on top of the pot) the steam rises 2 cells: one into the turbine, one out of it. That gives speed 1.41 and strength 2.83. More burners make it **stronger, not faster**. A taller chimney under it makes it **faster and stronger**.

### What a prototype measured (throwaway, not committed)

One burner, pot, turbine, chillers above; generator beside the turbine; lamps side by side:

| Lamps | Turbine speed | Each lamp's level | All lamps' power | Steam's power (RISE_POWER × work) |
|---|---|---|---|---|
| 0 | 1.414 | — | 0 | 1.000 |
| 1 | 1.026 | 0.815 | 0.603 | 1.000 |
| 2 | 0.823 | 0.61 | 0.682 | 1.000 |
| 4 | 0.616 | 0.42 | 0.630 | 1.000 |
| 8 | 0.453 | 0.25 | 0.456 | 1.000 |

(Before: 1 lamp 0.877, 8 lamps 3.162 from the same steam.)

Chimneys over one burner (work each tick, top turbine first; `T` turbine, `P` pipe, `.` air):

| Chimney, top to bottom | Work | Total | Steam's whole rise (0.05 × (rows + 1)) |
|---|---|---|---|
| `T` | 0.10 | 0.10 | 0.10 |
| `T T` | 0.05, 0.10 | 0.15 | 0.15 |
| `T T T` | 0.05, 0.05, 0.10 | 0.20 | 0.20 |
| `T P T` or `T . T` | 0.10, 0.10 | 0.20 | 0.20 |
| `T P P P` (turbine at the top) | 0.25 | 0.25 | 0.25 |
| `P P P T` (turbine at the bottom) | 0.10 | 0.10 | 0.25 (the rest is thrown away) |

Other cases: two burners feeding one turbine, speed 1.39 and strength 5.57 (twice one burner's). A sealed box with no chiller: the steam packs up, nothing flows, the turbine stops. Burner off: stops. A turbine lying in a level duct: speed 0.25, strength 0.4 (feeble, like a wheel in a level stream). Poured steam with no burner, four shapes, 400 ticks: the turbines' work never passed the energy the steam lost in any tick (worst excess 2e-10, rounding).

## Data flow per tick

Pack order is unchanged: basic, 💧 water, ⚙️ gears, 🏗️ lifting, ⚡ electric.

1. **`stepFluids` (fluids.js)**, in each of its `FLUID_STEPS` small steps, after the water:
   - `flowFluid(world, 'steam', canFlow, countTurbines)` now tells `countTurbines` the real `energy` of every move (delete the water-only guard in `flowFluid`).
   - `countTurbines(from, to, amount, energy, drop, part)` is `countWheels` upside down:
     - steam leaving a turbine: `gross += amount`; `out += amount` if it went up or right, `−= amount` if down or left
     - `brought = rising[from] × part`; `gives = max(0, brought + energy)`
     - `gives` goes to the turbine the steam **leaves**; or else to the turbine it **lands on**; or else, if the move was UP (`drop === 1`), it stays with the steam (`next[to] += gives`); or else it is lost
   - after the steam step, steam left behind in a cell that steam rose out of keeps its share (`rising[i] × (1 − taken[i])`), exactly like `falling`.
   - `world.signals.rising` (a `Float64Array`, the twin of `world.signals.falling`) holds the push rising steam carries. Tidy it at the start of the tick: `rising[i] = min(rising[i], steam[i] × world.height)`.
   - Returns `turbines: Map<index, { out, gross, work }>` in place of `steamOut`.
   - A shared helper for the water and steam halves is welcome if it reads well; two mirrored functions are fine too.
2. **`waterSystem` (water.js)** smooths each turbine's three counts over `TURBINE_SMOOTHING` ticks (the way `gearsSystem` smooths wheels) into `world.signals.water.turbines`. `refreshWater` carries that map over untouched. A turbine with no count this tick smooths toward `{ out: 0, gross: 0, work: 0 }`.
3. **`gearsSystem` → `solveSpin`** asks `turbineSource` like any other `spinSource`. Nothing in gears.js knows about turbines.
4. **Generator, circuit, lamps:** unchanged. The turbine has no `part`, so circuit.js never sees it.

Smoothing is an average, so over time it hands on exactly the counts that were made, never more.

### The block (water.js)

```js
turbine: {
  title: 'Turbine', color: '#78909c', bare: true, turbine: true,
  fluid: { sides: 'axis', prefer: 'v' },
  spin: { kind: 'hub' }, spinSource: turbineSource,
  drawSignals: drawTurbine,
},
```

- No `part`. Steam goes through along its pipe line (unchanged: `fluidAxis`). As a hub it joins spinning blocks on any side; in practice the shaft comes out of the two sides the pipes don't use.
- Two turbines stacked in a chimney touch, so they share a shaft and add their strength, like a real turbine with several stages. That is fine.
- A generator can sit right beside the turbine (hub to hub). The generator then needs its wires on its **other** two sides (above and below it, for a turbine in an upright chimney).

### Drawing

- `fluidCells` keeps its rule (no water record for spinning blocks), so `signalsAt` hands `drawTurbine` its **spin** record, like the water wheel.
- `solveSpin` adds one field to every record: `sides` — `drawingSides(world, x, y, blockInfo)` for a spinning block that is also a fluid block, else `null`. (The same idea as `partAxis`, which is already there for spinning blocks that are circuit parts. spin.js imports `drawingSides` from fluids.js; no import loop.)
- `drawTurbine(ctx, info, left, top, size, cell)`: the pipe casing from `cell?.sides ?? ['up', 'down']`; four blades that step round with `turned(cell)` (import from gears.js, as lifting.js does), one blade tip in the gears' yellow so the turning can be seen; a small dark shaft stub in the middle of each closed side; the red ❌ when `cell?.jammed` (export `drawJam` from gears.js). It no longer takes `ticks`.
- `drawWaterLayer` fills a turbine's channel with steam as before, reading the sides from `world.signals.spin?.cells?.get(index)?.sides` when the water pack has no record for a fluid block.
- `waterSystem` no longer sets `world.animating` for turbines (the gears pack does when anything turns). The `burnerOn` check stays.

## What is deleted

| Where | Gone |
|---|---|
| water.js | `TURBINE_GAIN`, `MAX_TURBINE_PUSH`, `turbinePush`, the turbine's `part`, `turbineFlow` (in `waterSystem`, `refreshWater`, `fluidCells` and `world.signals.water`), the record's `flow` field, the `spinning` check |
| fluids.js | `world.signals.used`, `used` / `usedIn` / `usedGone`, the "fresh steam" sum, `steamOut`, the "STEAM ONLY GIVES ITS PUSH ONCE" comment, the water-only energy guard in `flowFluid` |
| circuit.js, electric.js, gears.js, spin.js | Code: nothing. Comments that say "turbine" for a changing pusher or "batteries and turbines" now say "generator" / "batteries". `pushNow` stays: the generator uses it |

No new circuit–spin coupling is added. After this pass the generator is the only block that joins the two solvers, which is what the #14/#15 pass will replace.

## Saved worlds

- The save format and version do not change. `turbine` is still a known block; fluids load as before. `rising` is not saved (neither is `falling`): after loading, steam in mid-rise has lost at most one tick of carried push, never gained any.
- A saved plant with wires on the turbine's sides: the wires now end at the turbine. The lamp stays dark; the turbine still spins when steam rises through it. Nothing sparks, nothing breaks. A saved circuit that used a turbine as a piece of wire is now open.
- No message pops up. The turbine's guide entry, the 💧 rules, the wiki's Water and Machines pages all say plainly: it makes turning, put a generator beside it.

## Why no build can make energy

Call the steam's energy `E` (the sum over all cells of `storedEnergy(amount) + amount × y`).

1. **Moving never raises E.** Steam moves by the same three rules as water, upside down, and each move's energy is worked out the same way. (Tested for steam as it is for water.)
2. **Each bit of energy is handed out at most once.** A move's share of what its two cells lost goes to one turbine, or rides on with rising steam in `rising`, or is lost. The shares of a cell's loss add up to the loss. So all the `work` ever counted, plus what `rising` still holds, is never more than E has lost. (Tested tick by tick.)
3. **A turbine never does more work than its count.** Its best is `RISE_POWER × work × through ÷ gross`. The spin solver keeps every source on its line.
4. **A generator gives back 8 tenths** of the work that turns it (unchanged).
5. **Only three things raise E:** a burner (it puts steam low down, under whatever is above it), the BUILD tool (pouring steam, or building a block into steam), and a block moving through steam (see the last note below). No electric or spinning block makes steam or moves it: pumps move only water. So electricity and turning can never be turned back into steam energy, and no loop closes without a fire or a hand.
6. **The whole round trip is paid for by the fire.** Boil at the bottom, rise H cells (the turbine gets up to `RISE_POWER × H`), chill at the top, fall H cells (a wheel gets up to `DROP_POWER × H`). That is a heat engine: the burner is the hot end, the chiller the cold end, and the burner is an outside source like a faucet, a battery or a hand on a crank. Turn the burner off and it all winds down.

**Known gap, not opened and not closed by this pass:** blocks trade places with fluid for free (`moveBlock`; the lifting guide already says "nothing floats here"). Sand sinking through water lifts the water without paying for it today. With a steam ledger the mirror case now also counts: a load winched UP through steam pushes that steam down a cell. Worth its own issue for the whole family (water and steam together); it needs buoyancy in the lifting pack, which is out of scope here. **(Closed for loads on a rope in the review repairs: see the second addendum. A review turned the gap into a working machine, so it could not wait.)**

## Known side effect: no wire crossing

The old turbine was a pipe that also carried electricity, and four perpetual-motion tests in `tests/gears.test.js` use it only "so the wire can cross the water". A closed ring of water with a pump in it needs the pump's circuit to cross the ring twice; the pump is one crossing, the turbine was the other.

- **Tests:** use a second pump, pointing the way the water already goes, as the crossing (`pumpDown` in the channel machine, `pumpLeft` in `levelRing` and `tallLoop`, and fill it with water where the turbine was filled). Checked on the prototype: all 66 gears tests pass, the "battery really runs it" checks included, and a deliberately too-strong pump (`PUMP_HEAD = 20`) is caught by exactly the same test before and after, so the tests keep their teeth.
- **Game:** a child can still cross a ring the same way (two pumps). A proper "wire through a pipe" block would be a new block and is not part of this pass; note it for the lead as a follow-up.

## What this leaves for later

- **#29 (steam cooling):** condensing steam just removes steam, which only lowers E. The tidy-up line (`rising[i] ≤ steam[i] × height`) already handles steam that vanishes. Nothing here depends on steam staying steam.
- **Done 2026-10-05:** see `2026-10-05-motor-generator-law-design.md` and its addendum (the 1.28 build now gives exactly 1.000).
- **#14/#15 (one motor–generator law):** the turbine is a plain `spinSource` with `eitherWay`. It reads nothing from `world.signals.electric` and adds no feed, echo or rewire rule. Removing the turbine's `pushNow` leaves the generator as the only changing pusher.

## Tests

### tests/water.test.js

Change:
- Drop the `turbinePush` import. Add `E: 'generator'` (and what else the new pictures need) to `LETTERS`.
- "a turbine faces two ways" → **a turbine lets steam through one way and is not a circuit part**: `openSides` is still up/down; `blockInfo('turbine').part` is undefined; it has `spin` and `spinSource`.
- "a steam power plant lights a lamp" → the plant with a generator (the picture under "Docs"): the lamp passes 0.5 within 40 ticks and is between 0.7 and 0.9 after 400; the turbine turns.
- "steam only gives its push once…" → **turbines in one chimney share what the steam gives up**: for the chimneys in the table above (and the wide-room and dead-end-stub ones from the old test), the work added up is within 0.005 of `BOIL_RATE × (rows + 1)` when a turbine is at the top, never more, and each turbine's share matches the table.
- "turbines side by side…" → the same, comparing `work` (0.10 each).

Add:
- **A turbine wired straight to a lamp lights nothing** (the old plant picture, 400 ticks, level exactly 0, no spark).
- **More lamps are harder to turn:** 1, 2, 4, 8 lamps: speed falls each time, each lamp is dimmer, and the lamps' power (Σ current²) is at most `0.8 × RISE_POWER × work`.
- **More burners make it stronger, not faster** (two burners into one turbine: same speed within 5%, about twice the strength).
- **A taller chimney under it makes it faster and stronger; a turbine at the bottom of the chimney gets only its own two cells.**
- **Nowhere for the steam to go:** sealed box, no chiller: after it packs up, `turbineSource` is null and the lamp is dark.
- **Burner off:** run 300 ticks, flip the burner off, run 300 more: speed 0, lamp 0, and it stays so for 50 more ticks.
- **Lying down it is feeble:** a turbine in a level duct turns slower than 0.3.
- **A mirrored plant works the same** (same speed, same lamp).
- **The turbine's books:** `TURBINE_STRENGTH × flow ÷ 2 × TURBINE_SPEED ÷ 2 === RISE_POWER × flow`, and `RISE_POWER === DROP_POWER`.

### tests/fluids.test.js

- Change "steam leaving a turbine is counted" to read `stepFluids(...).turbines.get(i).gross`.
- Add **steam's energy never goes up by itself** (the water test, upside down, on poured steam in three shapes).
- Add **turbines never get more than the steam lost, tick by tick** (poured steam, no burner; shapes: a straight chimney, two stacked turbines, a level duct, a turbine off to the side of the rising steam).
- Add **rising steam carries its push; steam that has spread out under a ceiling has lost it**.
- Add **water falling through a turbine does not turn it, and keeps its push for a wheel below**.
- Add **`world.signals.used` is gone** (after a tick it is undefined).

### tests/gears.test.js

- Re-route the four loop tests through a second pump (see "no wire crossing"); remove `T` from `LETTERS` unless the new tests below use it.
- Add to "the energy books balance": the turbine identity above.
- Add **a turbine helps the way its gears already go** (with a ↺ crank it turns ↺; two turbines on meshed gears don't fight; alone it turns ↻).
- Add **a jammed turbine is marked jammed** (`cells.get(i).jammed`), and its record has `sides`.
- Add **no steam machine runs without its fire:** plant → generator → pump lifting water → water wheel → second generator → lamp; burner off; everything stops and stays stopped, and water + steam added together is unchanged.

### Others

- `tests/circuit.test.js`: the five tests that make a pretend `turbine` block with `pushNow` test the changing-pusher path, which the generator still uses. Keep them; rename the pretend block and the wording to "pusher" / "generator".
- `tests/spin.test.js`: if any test compares a whole record, add `sides: null`.
- `tests/guide.test.js`: add "the turbine's guide says it needs a generator" and "the ⚡ guide no longer calls a turbine wire".
- `tests/build.test.js` (turbine keeps the water when built into), `tests/saves.test.js`, `tests/sw.test.js`: no change expected. `sw.js` fetches our own code from the internet first and no file is added, so `CACHE_NAME` stays.
- `tests/docs.test.js`: every new function needs its JSDoc (`turbineSource`, the counting helpers inside `stepFluids`).

## Docs, guide and pictures

**💧 guide (water.js)**
- Rule 4 becomes: "Steam is the opposite: it rises and spreads out under ceilings. Steam has to RISE to give its push, like water has to fall."
- `turbine`: "A fan in a pipe. Steam rising through it spins it. It makes TURNING, not electricity: put a generator (⚙️ tab) beside it and wire the generator to a lamp. More steam = stronger. A taller chimney under it = faster and stronger. If the steam has nowhere to go, it stops."
- Header comment: `☁️ steam rises → turbine spins → ⚙️ generator → ⚡ lamp lights`.

**⚙️ guide (gears.js):** "…a crank, wheel, turbine, motor or generator touching a gear…"; the last rule gains "A steam plant stops when its burner does."

**⚡ guide (electric.js) and wiki/Power.md:** "A stopped generator is just wire too" (drop "or turbine").

**wiki/Water.md:** the turbine row (as the guide, plus "it turns ↻ by itself, or the way its gears already go"); a short "**Steam has to rise to give its push**" paragraph beside the water one, with the chimney rule and "a turbine uses up the push of the steam that goes through it: the next turbine up gets only what the steam gives rising on from there".

**wiki/Gears.md:** add the turbine to the list of things that turn gears and to "Nothing runs forever".

**wiki/Machines-to-build.md, "Steam power plant":** "Water in a pot on a **burner**, a **turbine** above it, a **generator** right beside the turbine, and wires from the top and bottom of the generator to a lamp. The burner boils the water, the steam rushes up and spins the turbine, the turbine turns the generator, and the generator makes electricity. The **chillers** turn the steam back into water, which runs back down into the pot. That's how real power plants work! Try more lamps: the turbine slows down." Alt text: "Burner, turbine, generator, chillers and a lit lamp".

**Picture (`tools/make-block-pictures.cjs`, scene `power-plant`, 40 ticks):**

```
#CC#...
#..#...
#..WWW.
##TE.L.
##~WWW.
##F###.
```

Checked on the prototype: lamp level 0.805 at tick 40, 0.815 from then on, still running at tick 2000 (the rain runs back through the turbine into the pot). Regenerate with the house command; `turbine.png` and `power-plant.png` change on purpose; `git checkout` `crate.png`, `ironWeight.png` and `music-machine.png` afterwards.

**README:** the file table lines are still true. Check the "how it works" wording for "turbine … electricity" and fix if found.

**Older specs:** add a two-line addendum to the fluids spec and the gears spec pointing here ("turbine: see 2026-10-05-turbine-spin-source-design.md; `used`, `turbinePush`, `TURBINE_GAIN` are gone"). Do not rewrite their history.

## Suggested commit order

1. fluids.js: steam energy in `flowFluid`, `rising`, `turbines` counts; delete `used`. Fluids tests.
2. water.js + spin.js + gears.js export: the turbine as a spin source, its drawing; delete `turbinePush` and friends. Water tests, circuit test rename.
3. gears tests: second-pump crossing, new turbine tests.
4. Guide text, wiki, older-spec addenda.
5. Pictures.

## Addendum 2026-10-05: as built

Built as specified. The numbers in "What a prototype measured" came out the same on the real code (1 lamp 0.815; 1/2/4/8 lamps 0.603/0.682/0.630/0.456 of a steam power of 1.000; every chimney in the table). Where the build differs from the text above:

- **`drawWaterLayer` only borrows the spin record's `sides` for a turbine**, not for every spinning fluid block. Every spin record of a fluid block has `sides` (the water wheel's too, as specified), but if the water layer used them for the wheel it would start painting a cross of water over the wheel's paddles, which it never did before. The wheel looks as it did.
- **`MARK` (the gears' yellow) is exported from gears.js** as well as `drawJam`, so the turbine's blade tip is the very same color.
- **Smoothed turbine counts under 1e-9 are dropped** (`TURBINE_MIN`), so a turbine with no steam has no entry in `world.signals.water.turbines` instead of numbers that halve for ever. `turbineSource` is null long before that (`MIN_TURBINE_FLOW`).
- **"More burners make it stronger, not faster" is tested with two pots under one room** (`#...#` over `#~#~#` over `#F#F#`: speed 1.39, strength 5.57, as in the spec). Two burners under ONE wide pot (`#~~~#` over `#F#F#`) do not run steadily: the steam beside the chimney is held under the pot's water until it burps, so the turbine gets its steam in puffs about every 22 ticks. That is how the fluids already moved before this pass (steam may not spread sideways into a cell that is mostly water); the old turbine's push pulsed the same way. Not changed here; worth a look in #29 or #30.
- **Commits:** the fluids, water and gears-test steps went in as one commit (the tree would not pass its tests in between), then the docs, then the pictures.
- **Extra tests** beyond the list: a random-worlds steam ledger (60 worlds, the twin of the water one), "the plant holds steady: no flicker", the turbine drawn with its spin record and its marked blade stepping the right way round.

### Sweeps (throwaway node scripts, not committed)

- Steam ledger in 1200 random worlds with burners and chillers (moves and special blocks booked separately): the moves never raised the steam's energy (worst +4e-14), and credited work + carried push never passed what the moves took out (worst excess 0).
- 900 random plants (chimneys of turbines, pipes and gaps; gear trains; 1 to 8 lamps side by side or in a row): heat never passed 8 tenths of the turbines' shaft work in any tick (worst 0.797) or of the steam's counted work over a run (worst 0.794); none flickered once the steam was steady; all stopped with the burner off.
- 750 plants whose generator feeds a motor on the plant's own gear train, a third of them with no fire at all (poured steam only): all wind down and stay down; heat never passed 8 tenths of ALL the work done on the shaft (turbine + motor).
- Random soups of blocks with wire loops in them: nothing ran on after the burners went off, and water + steam was never made or lost.

### Found, not caused and not fixed here: a motor helping its own generator (#14/#15)

In the feedback sweep, when the motor is geared so that it HELPS the train its generator is on (for example turbine, big gear, small gear, generator, small gear, big gear, motor, with the generator and motor joined by plain wire), the heat in the loop comes to as much as 1.28 times the work the turbine does on the shaft. A hand crank in place of the turbine gives the same 1.28 on the commit before this pass, so it is the motor–generator coupling and not the steam: the motor's push is recycled electricity that the motor never pays for (it is a plain resistor with no push-back of its own). It is not perpetual motion (the loop gives back less than it takes each time round, so it still winds down the moment the source stops), but it is more heat out than work in while the source runs. This is exactly what the joint circuit + spin solve of #14/#15 is for; no patch was added here.

## Addendum 2026-10-05 (2): review repairs

A review of the built pass found six things. What was done about each, and where the law in this spec changed.

### 1. Blocks no longer move fluid for free on a rope (the "known gap" above, now closed for winches)

**The machine the review built:** a sealed shaft with 4.0 of steam and no burner, a winch with a weightless pulley hook, a turbine in a side loop. Each stroke up carried the steam above the hook to below it for nothing (`moveBlock`), it rose through the turbine, and a generator lit a lamp: 0.70 of heat per cycle for ever, with the hand crank doing 0.00 work. The water mirror was there too, and older than this pass: a hook and crate dipped into a pool lift the water two cells, it runs off over a water wheel and back under (wheel best work 134 for crank work 0.25 in 20 dips).

**The law now.** A load on a winch's rope pays for the fluid it has to move the hard way:

- going **up**, the steam in the cell above it is pushed down: the load is heavier to lift by `STEAM_PUSH × steam × share`;
- going **down**, the water in the cell below it is lifted: the load pulls less by `WATER_WEIGHT × water × share`, and if that leaves nothing, it **floats** (it is `resting`, like a load on the ground: slack rope, no help, and it will not go down);
- `WATER_WEIGHT = DROP_POWER × ROPE_PER_TURN ÷ TICKS_PER_SECOND` and `STEAM_PUSH` is the same with `RISE_POWER`: 2.5 crates for a full cell. They are not free numbers: they make one cell of rope pay exactly what the fluid's ledger gains.
- `share` is the load's cells ÷ the rope cells per move: a hook and its load move the fluid two cells, and a hook's rope moves two cells per cell of load. **(Replaced in addendum 3: fluid runs through a hook, so it is one cell, and `share` is ½ with a hook.)**
- Going the easy way gives nothing back (water over a rising load, steam under a sinking one): that is lossy, never a gain. It also keeps `lifting ≥ weight ≥ pull`, which is what makes part-wound rope safe (rope wound back always costs at least what it gave).

**So "nothing floats" (#24's stated simplification) is no longer true for a load on a rope.** A crate (1) floats on anything deeper than 0.4 of a cell; an iron weight (4) sinks and pulls 1.5 in full water; a hook with a load under it floats sooner than the load alone **(no longer: see addendum 3)**. The lifting guide and wiki say so, with the reason.

**How it is built.** `inTheWay` (lifting.js) reads the two cells. `winchLoad` returns `{pull, lifting, resting, topSpeed}`; `loadsOf` (spin.js, was `loadOf`) turns that into the existing kind of load plus a second one with limit 0 for the extra while lifting, so the balance solver itself is unchanged. `liftSystem` keeps what each rope has paid for fluid in `world.signals.lift.aside`, and a load only moves once that covers the fluid that is in the way at the moment it moves (steam or water that drifted in late makes it wait and keep paying; rope wound back takes its share out). Two things in `liftSystem` changed with it: rope let out faster than falling is cut to one cell before it is added (it was cut afterwards, which threw away part-wound rope the winch had been helped for), and a load that lands with more than a cell of rope out keeps it instead of forgetting it.

**Not done, and why:**

- **Loose blocks still sink for free** **(wrong, and closed in addendum 3: a second winch could cut a rope)** (falling sand, a crate with its rope dug away). No machine can let a block go: it takes a hand digging a rope or building a block, which is already a source of energy in this game. Making loose blocks float as well would need sand to have a weight, and meets the next point head on.
- **Deep water is squeezed** (a cell 10 deep holds about 2.0), so by the ledger it weighs more: an iron weight on a rope stops sinking about 6 cells down a full tank. That is #30's subject (pressure from depth instead of extra water), not a new law.
- **A crate under water does not bob up.** Rope cannot push, and a block does not move by itself.

**Measured after the repair:** the review's machine, 200 cycles: crank 870 in, turbine best work 350, steam energy unchanged. The water mirror: a crate floats on the 1.5 pool (no dips); in 0.5 of water, crank 74 in for wheel best work 59. A new sweep (400 random runs of 2000 ticks: five shafts with turbine and water-wheel side loops, five kinds of load, random water and steam poured in, a crank flipped at random, no fire or pump) keeps a ledger of fluid energy + carried push + load height + part-wound rope + work credited to wheels and turbines − crank work: it never climbed back above an earlier low (worst +0.0000). On the commit before, 53 of 60 runs climbed, by up to 57. The sweep found two leaks in the first cut of the repair itself (the two `liftSystem` changes above).

### 2. A chiller right on a turbine

Steam chilled inside a turbine's cell never left it by a move, so `gross` stayed 0 and the turbine stood still with steam cycling through it. Now `runSpecials` reports what the chillers took from each cell, and `stepFluids` counts steam chilled in a turbine as steam that left it, the way that tick's steam came in. Its work was already credited when it landed. The counts gained `into` and `inWay` for this.

### 3. A choking turbine raced

`work` is credited mostly when steam lands on the turbine, `gross` when it leaves. With the exit choking, more landed than left and `work ÷ gross` ballooned (4.8 where the chimney's steady speed is 2.5). Now `rise = work ÷ max(gross, into)`: the push is shared over all the steam that came in. Speed stays under what the steam really rose and falls as the exit chokes; `through × rise ≤ work` still holds, so the power cap is as before.

### 4. Round a corner, the push is gone

Kept: it is the wheel's "landed in a pool" rule upside down, and the wiki already said steam under a ceiling has no push. The words were wrong, not the law. The `stepFluids` comment now says the first turbine the steam meets *while still rising*; the guide and wiki say to stand a turbine upright in the chimney. A pipe elbow that keeps its push is a model change for #29.

### 5. No run-down without a load

Not changed. A turbine with nothing to turn runs at its no-load speed for as long as any steam goes through, then stops: speed comes from how far the steam rises, not from how much there is, and nothing in the game has inertia or bearing drag (the water wheel and the crank stop the same way). With a load it fades properly. Inertia belongs with the joint solve of #14/#15.

### 6. "More burners make it stronger"

True only when each burner's steam can get to the chimney. Steam cannot push sideways through water, so a second burner in the corner of one pot fills its corner with steam and stops boiling (strength exactly as with one burner). The fluid rule is #29/#30's; the wiki and guide now say "more steam", and to give each burner its own pot with open air above it. A test pins the corner case.

## Addendum 2026-10-05 (3): second review repairs

A second review found two more machines that made power from nothing, and showed that two sentences of the addendum above were wrong: "No machine can let a block go: it takes a hand" (a second winch could cut a rope), and "a hook with a load under it floats sooner than the load alone" (true in the code, but not physics). Both machines are older than this pass (same numbers on 0a99d50), but the pass's claims rested on them. The law changed in four places.

### 1. Loose blocks pay for the water they lift (the rest of the "known gap")

`fallingBlocks` (basic.js) now asks `floatsOn(weight, water below)` (lifting.js), the same test a load on a rope uses: a block only sinks if `weight ≥ WATER_WEIGHT × water`. Its own fall (worth `4 × weight` a cell in crank work) then covers the `DROP_POWER × water` the lifted water can give a wheel. A loose crate (1) floats on anything deeper than 0.4; **sand now has a weight, 4** (like the iron weight), so sand and iron sink. This replaces "loose blocks still sink for free" above. Known edges: sand on a rope now weighs 4 (it was 1 by default), and squeezed water deep in a tank (#30) stops sand and iron about 6 cells down, loose or on a rope.

### 2. Water and steam run through a pulley hook

The hook is `fluid: { sides: 'all' }`, like rope, and `moveBlock` takes a `through` flag that leaves the fluid of both cells alone. So the hook displaces nothing; only the block under it trades places with fluid, and the water it lifts goes up **one** cell (into the hook's cell), not two. `inTheWay` now reads the cell above and below the load's solid block, `share` is ½ with a hook and 1 without, and `floats` is `floatsOn(whole weight, water)`: the same as the load alone. Iron on a hook sinks and pulls `(4 − 2.5) ÷ 2`; a crate on a hook floats at 0.4 like a crate alone; an empty hook goes through water (and a film on the floor) and moves none. The ledger still balances because the water really is lifted only one cell. This replaces the `share = cells ÷ rope cells` rule and the "floats sooner" sentence above.

### 3. Ropes that cross are tied (`ropeIsTied`, lift.js)

A winch may not wind in its rope end while another winch's rope runs **on through** that cell (it is on the other path and not its last cell). `canWindIn` refuses, so bare rope just stays (the winch turns, as it does on its last cell of rope) and a loaded one is a hard stop (orange ⬆). A winch only ever removes its own end cell, so with this rule no machine can cut another winch's rope; a shared END is still handled by `ownsRopeEnd`. Letting rope out into a gap in another rope still joins them, but that can then not be undone by a machine.

### 4. Part-wound rope goes with its load (`world.signals.lift.weighed`)

The part-wound amount was only safe while the load stayed the same. Now `liftSystem` remembers the load's weight for it: the heaviest for rope let out a little (owed), the lightest for rope wound in a little. `winchLoad` makes winding owed rope back cost at least that weight whatever is on the rope now (even nothing), and a part-wound-in amount is dropped when a heavier load is on the rope than it was wound against. The second half was found by the new sweep: two winches sharing a rope end, one winds half a cell of bare rope for nothing, the other lets the end down onto a block, and the first then lifted it a cell for half the price (a one-off 8 units for sand).

### Not changed

- **The grid's grain.** A floating crate sits in the cell above the water, even over a puddle 0.45 deep, with air drawn between. A block is always in one whole cell; the wiki says so.
- **A chiller beside a turbine** only works when the turbine is the top of the chimney (steam crosses several cells a tick and gathers at the highest place). That is the fluid rule (#29); the wiki sentence added in this pass was wrong and is now reworded.

### Measured

The review's scripts: the cut-rope machine gives 0 drops and 0.00 wheel work (it was 35 and 134 for 0 and 90 of crank work); the three-winch machine with an iron weight no longer winds back at all (the hand got 196 pushed out of it before, the lamp 190). A new sweep (scratchpad `r3fix/sweep.mjs`: four layouts with one, two and three winches on tied, bridged and shared ropes over pools, wheels and turbines; seven kinds of load and a loose block; every crank flipped at random; the ledger counts every falling block's height, part-wound rope at its remembered weight, fluid energy, carried push and credited work, less crank work) never climbed back above an earlier low in 1200 runs of 2000 ticks (worst +0.0000). On the code before these repairs 16 of its first 40 runs climbed, by up to 32. The first sweep (one winch) still reads +0.0000.
