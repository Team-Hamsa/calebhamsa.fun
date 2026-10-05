# Steam cools under the open sky (and three steam leftovers) — Design Spec

**Date:** 2026-10-05
**Status:** Ready to build. Every open question is decided here. The law was written into a scratch copy of the repo and measured (see "What a prototype measured"); nothing of the prototype is committed.
**Issue:** #29
**Builds on:** the turbine spec (`2026-10-05-turbine-spin-source-design.md` and its four addenda: the steam ledger, `rising`, `chilled`) and the water spec (`2026-10-05-water-pressure-from-depth-design.md`: `flowSteam`, `flowTable`'s `sky`, "water made in place must fit").
**Replaces:** "steam stays steam until a chiller touches it"; heat blocks working once a tick; "round a corner the push is gone" for pipes; "steam can't push sideways through water".
**Not in this pass:** a temperature for water, clouds that drift, inertia. See "What this leaves for later".

## Purpose

Today the only thing that turns steam back into water is a chiller. Boil one cell of water in an open world and the top row holds all of it for ever. A faucet-fed boiler under a turbine packs the whole 24 × 14 world with steam and stops (measured: turbine dead before tick 20 000, 533 cells' worth of steam).

In the real world steam let out under the sky cools, turns into cloud and comes back as rain. After this pass:

- **Steam that reaches the open sky cools into rain.** A thick cloud rains hard, a thin wisp rains slowly. Nothing is lost: every bit of steam that cools is that much water, in the same place.
- **Steam shut in stays steam.** Under a lid, in a pipe, in a boiler or a sealed room nothing changes: it still reaches the turbine and still packs up and squeezes.
- **The three leftovers of #21 are closed**, each by the more real rule: a chiller beside a turbine works wherever the turbine stands; steam in a pipe keeps its push round a corner; steam bubbles slide along under a ledge instead of being stuck. Two burners under one wide pot stop puffing as a result.
- **No build makes energy.** Only a burner raises the books, and by a known most.

### Success criteria

1. One cell of water boiled in an open 24 × 14 world: after 200 ticks less than 0.01 of steam is left and water + steam is still 1.
2. A faucet-fed boiler, turbine, generator and lamp under the open sky runs at the same lamp level at tick 400 and tick 20 000.
3. The wiki's Steam power plant (lid and chillers) standing on the ground of the 24 × 14 world: the same at tick 400 and tick 20 000.
4. A sealed box with a burner and no chiller: steam builds up, the turbine stops (the existing test, unchanged).
5. A chiller beside a turbine catches all of one burner's steam with a dead-end stub, a sealed room or the open sky above the turbine.
6. A turbine after a pipe elbow gets at least 9 tenths of what an upright one gets from the same rise. A turbine fed through a wide room still gets only its own two cells.
7. Two burners under one wide pot make a turbine twice as strong as one, steadily (no puffs).
8. In random worlds: turbines never get more than the steam's moves gave up, wheels never more than the water's moves gave up, cooling never raises the books, and with no fire neither the steam nor the books ever go up.
9. `npm test` passes in full; guide, wiki and pictures say what the game does.

### Decisions

| Question | Decision | Why |
|---|---|---|
| Where does steam cool by itself? | In a **sky cell**: a cell in the top row that is open upward (`flowTable`'s `sky`, the very cells that are already open sky for water) | One idea of "sky" for both fluids. A lid is any block in the top row, or any ceiling below it. A pipe lying along the top row is shut; a pipe or turbine standing in it is an open chimney top |
| Why not every cell that touches air? | Steam in a room is surrounded by more steam and warm walls; only the open sky is an endless cold place | And it would cool steam on its way to the turbine, which the owner ruled out |
| How fast? | **A share of what is there**: `SKY_COOL = 1/16` of the cell's steam each tick | A thick cloud rains harder than a thin one: true of real clouds, and a child can see it. A fixed trickle (the issue's 0.002) cannot carry one burner through a one-wide chimney top, so an open-exhaust engine would still choke |
| Can steam be squeezed under the sky? | **No.** Whatever a sky cell holds over `FULL` rains out at once | Squeeze is pressure, and nothing holds pressure under an open sky. It is also what stops a chimney top from choking however many burners feed it |
| Where does the rain appear? | In the same cell, as water (it falls the next small step). Only as much as fits: `FULL − water` | Mass is conserved cell by cell with no hidden cloud store to save. The water spec's rule for water made in place |
| Is the chiller still worth building? | Yes. It works anywhere (indoors, low down, beside a turbine), on four sides, and takes a thin wisp whole | The sky only works at the very top and only takes a sixteenth of a wisp each tick |
| Does cold water cool steam? | **No, not in this pass** | It needs every cell of water to have a temperature (the pot's water must be hot or no steam would ever leave it): a new saved number for every cell and a new thing to draw. Noted for later |
| Is heat a conserved number? | **No new number. The fire's bill is bounded instead** (see "Why no build can make energy") | Real boiling takes thousands of times more heat than the height energy the game counts; a truthful heat number would dwarf every other one. What matters is that only a burner raises the books, and by at most a known amount |
| When do burners and chillers work? | **Every small step**, a quarter of their rate each (`FLUID_STEPS` = 4). Faucets and drains stay once a tick | Steam crosses four cells a tick. A chiller that looks once a tick only ever sees steam that happens to stop beside it, which is the whole of leftover 2 |
| A pipe elbow | **Steam keeps its push for as long as it has only one way on**: rising anywhere (as now), or going sideways from one tunnel cell to the next. A tunnel cell is any cell with one or two ways out | In a pipe the push is pressure, and pressure goes round corners. In a room the steam spreads out and the push is gone, like water landing in a pool. Geometry, not block names: a tunnel of stone one cell wide is a pipe too |
| Steam under water | **A bubble that cannot rise slides sideways**, even into a cell full of water | Real bubbles run along under a ledge to the edge. Bubbles that can rise still go straight up, so steam does not smear sideways through a pond |
| Saved worlds | No migration, no format change | See "Saved worlds" |

## The physical law

### 1. The open sky cools steam into rain

A **sky cell** is a cell in the top row whose block lets fluid out upward (air, a drain, a water wheel, rope, a hook, an upright pipe end, an upright turbine or valve).

Every small step, in every sky cell:

```
want  = steam < MIN_AMOUNT ? steam                                   // the last wisp goes all at once
                           : max(steam × SKY_COOL ÷ FLUID_STEPS,     // a share of the cloud
                                 steam − FULL)                        // and all that is squeezed
cool  = min(want, FULL − water)                                       // rain has to fit
steam −= cool
water += cool            // (in a drain's cell it goes straight down the drain: see rule 2)
```

```js
/**
 * How much of the steam in a cell under the open sky cools into rain
 * each tick: a sixteenth of it. A thick cloud rains hard, a thin wisp
 * rains slowly. (A chiller is much colder: it takes a whole wisp at once.)
 * 🧪 Try this! 1 / 2 for a sky so cold that clouds never form.
 */
export const SKY_COOL = 1 / 16;
```

In child-sized numbers: one burner makes 0.05 of steam a tick, and a cloud of 0.8 rains 0.05 a tick. So one burner under the sky keeps a cloud of about 0.8 of a cell, spread thin along the top, and it rains as fast as the burner boils. One sky cell alone (a chimney top one cell wide) carries one burner with 0.79 of steam standing in it; more burners fill it to exactly `FULL` and no further.

The `MIN_AMOUNT` line is there so a cloud ends: without it a wisp would halve for ever and the world would never come to rest (never stop saving and redrawing).

### 2. Burners and chillers work all the time

```
each small step:  boil = min(BOIL_RATE ÷ FLUID_STEPS, water above, BOIL_STEAM_CAP − steam above)
                  cool = min(CONDENSE_RATE ÷ FLUID_STEPS, steam, FULL − water)     // each touching cell
```

`BOIL_RATE`, `CONDENSE_RATE`, `BOIL_STEAM_CAP`, `FAUCET_RATE` keep their values, and a burner and a chiller still do 0.05 a tick. What changes is that steam leaves the pot as a steady stream, 0.0125 in every cell of the chimney, instead of one lump of 0.05 that jumps four cells. A chiller touching any cell of that stream takes all of it as it goes by.

Faucets and drains stay once a tick, at the end. So that a chiller beside a drain still leaks nothing (the #17 addendum), **water that a chiller or the sky makes in a drain's cell is never put there: it has gone down the drain.**

Steam cooled inside a turbine's cell (by a chiller or by the sky) has gone through the turbine, as now (`chilled`); the amounts of the four small steps are added up.

### 3. Steam keeps its push while it has only one way on

Today (`countTurbines`): the push a move carries (`brought + energy`) goes to the turbine it leaves, or the turbine it lands on, or stays with the steam **if the move was up**, or is lost.

New: it stays with the steam if the move was up, **or if it went sideways from a tunnel cell into a tunnel cell**.

```
tunnel[i] = 1 when cell i has one or two ways out for steam (count the sides s with table.to[i × 4 + s] ≥ 0)
keeps     = drop === 1 || (drop === 0 && tunnel[from] && tunnel[to])
```

- The cell left behind keeps its share when steam moved **on** out of it this step (`roseFrom` is set for every keeping move, not only for rises). Steam that has stopped in a tunnel loses its push, exactly as steam that has stopped rising does.
- Steam going **down** never keeps its push.
- A cell in a room (three or four ways out) is not a tunnel, so steam that spreads out under a ceiling still has no push left.
- A turbine lying at the end of an elbow is now a good turbine. A turbine lying in a level duct straight off the pot is as feeble as before: there was no rise to bring.

### 4. A bubble that cannot rise slides sideways

Today (`flowSteam`): steam spreads sideways only into a cell that is at most half water (`roomFor`).

New: it also spreads sideways into wetter cells **when it has no way up at all** (`canFlow(index, 'up') < 0`: a block or a shut side above it, or the top row).

```
sideways allowed = roomFor(beside) || above < 0
```

The amount is the usual quarter of the difference. Sinking keeps its `roomFor` test. Left and right are still worked out from the same amount, so a mirrored build gives the mirrored answer.

### What does not change

`flowSteam`'s three rules, `stableBelow`, `STEAM_SQUEEZE`, `storedEnergy`, `fallEnergy`, `settleShares`, `RISE_POWER`, every turbine constant and `turbineSource`, the whole of the water (`flowWater`, `pressWater`, `makeRoom`), pumps, the lifting pack's `STEAM_PUSH`. Steam under any lid still packs and squeezes.

## What a prototype measured (scratch copy, not committed)

The four rules were patched into a copy of `js/fluids.js` (about 60 changed lines; the diff is `p29/prototype.diff` in this pass's scratchpad, for the builder to read, not to apply blindly: it carries test switches).

**The issue's two cases, 24 × 14 world**

| | Before | After |
|---|---|---|
| One cell of water on a burner: steam at tick 50 / 100 / 200 / 2000 | 1.000 / 1.000 / 1.000 / 1.000 | 0.271 / 0.023 / 0.004 / 0.004 (the last speck is rain that fell back in the pot and boiled again) |
| Faucet-fed boiler under a turbine: turbine at tick 2000 / 8000 / 20 000 | 1.73 / 0.55 / stopped (steam 100 / 400 / 534) | 1.72 / 1.72 / 1.72 (steam 0.879 throughout) |

**Plants** (lamp level; all hold to tick 20 000)

| Build | Before | After |
|---|---|---|
| The wiki plant (lid, two chillers), on the ground of a 24 × 14 world | 0.732 | 0.727 (steam now streams: a little stands in each cell of the way, so it gives up 1.25% less) |
| The same with the lid and chillers taken off, world as tall as the plant (the rain falls back in) | dark by tick 100 | 0.727 |
| The same in the 24 × 14 world, one cell of water, no faucet | dark by tick 100 | bright for about 100 ticks, then dark: the rain falls outside and the pot is dry. An open engine needs water, like a steam train |
| New "open-air engine" (faucet, drain; picture below) | — | 0.727, 7 × 6 and 24 × 14 |

**A chimney top one cell wide, turbine under it** (steam through the turbine each tick; steam standing in the sky cell)

| Burners | With "a share" only | With "and all that is squeezed" (chosen) |
|---|---|---|
| 1 | 0.050; 0.79 | 0.050; 0.79 |
| 2 | 0.067; 1.05 (choked) | 0.100; 1.00 |

With one burner the turbine turns at 1.48 where the same chimney under a chiller turns at 1.72: the cloud standing in the chimney top pushes back. That is real (a steam engine works better blowing into a cold condenser than into the air), so it is kept and the wiki says so.

**A chiller beside a turbine** (`TC` in a one-wide chimney over one burner; steam through the turbine each tick)

| Above the turbine | Before | After |
|---|---|---|
| Nothing (turbine is the top) | 0.050 | 0.050 |
| A dead-end stub of 1 or 3 cells | 0 (all the water ends up parked as steam in the stub); works only when the turbine happens to be a multiple of 4 cells above the pot | 0.050 |
| A sealed room | 0 | 0.050 |
| Open sky, 1 or 3 cells up | 0 | 0.050 |

**Elbows** (best work a tick, `strength ÷ 2 × speed ÷ 2`; one burner, three cells of rise unless said)

| Build | Before | After |
|---|---|---|
| Upright on the pot | 1.500 | 1.487 |
| Up a one-wide shaft of air, round the corner, turbine lying | 0.183 | 1.450 |
| Up a pipe, round the elbow, turbine lying | 0.183 | 1.450 |
| Up a pipe 4 cells, 4 cells along, turbine upright after the elbow | 0.414 | 1.706 |
| Up a shaft, through a room 5 wide and 2 tall, turbine upright in its ceiling | 0.414 | 0.435 |
| Level duct straight off the pot | 0.040 | 0.038 |

**One wide pot (`#~~~#`), turbine over its middle** (turbine strength, lowest and highest over 200 ticks)

| Burners | Before | After |
|---|---|---|
| One, under the middle | 2.83 | 2.82 |
| Two: corner and middle | 2.83 (the corner one adds nothing) | 5.59 |
| Two: both corners | 1.88 to 8.72 (puffs) | 5.59, steady |
| Three | 7.39 | 8.30 |
| Two pots under one room (the existing test) | 5.58 | 5.59 |

**The rain cycle and the fire's bill.** Burner under a five-wide pond 6 rows down, a turbine in a chimney, open sky, water wheels to both sides for the rain (`.....` / `.....` / `O#T#O` / three rows of air / `~~~~~` / `##F##`). Each tick the turbine is credited 0.247 and the wheels 0.077, together 0.324; the most the fire can be billed is `BOIL_RATE × (2 × 6 + 3)` = 0.75. Burner off at tick 2000: turbine credit stops within the smoothing time, 1.4 more comes off the wheels as the last rain falls, then nothing for 4000 ticks; steam 0, water back to exactly 5.

**Ledger sweep** (`p29/sweep.mjs`, 6 processes): 1800 random worlds (5 to 9 wide, 5 to 10 tall; air, stone, turbines, pipes, water wheels, burners, chillers; random water and steam, squeezed steam; a third with a lid; half put their fires out at tick 150) × 400 ticks, every tick:

| Check | Worst |
|---|---|
| Turbine work credited + push carried − what the steam's MOVES gave up | +1.7e-16 |
| Wheel work credited + push carried − what the water's MOVES gave up | below 0 in every world |
| Change of Ψ (below) at any one cooling, by chiller or sky | +5.1e-16 |
| Change of Ψ at any one boiling − boiled × (2 × row + 3) | below 0 always |
| Steam going up in a tick with no fire lit | +2.1e-14 |
| Ψ going up in a tick with no fire lit | +1.7e-13 |
| Water + steam made or lost over the run | 3.3e-13 |
| Water over `FULL` in a cell | 1.1e-14 |

**The whole test suite on the prototype: 876 of 885 pass.** The nine that fail are the ones listed for rewriting under "Tests" and for the reasons given there. Taken one rule at a time: the sky alone fails 4, the tunnel rule 2, the ledge rule 1, heat every small step 2.

## Data flow per tick

Pack order is unchanged. Everything is in `stepFluids` (fluids.js).

1. `allOpenSides`, `flowTable`, `makeRoom`, `workingPumps`: as now. From `table.to`, work out `tunnel` once (a `Uint8Array`).
2. `FLUID_STEPS` times:
   1. `flowWater` and the `falling` bookkeeping: as now.
   2. `flowSteam` (rule 4 inside it) with `countTurbines` (rule 3 inside it), then the `rising` bookkeeping: as now, with `roseFrom` set for every keeping move.
   3. **`runHeat(world, blockInfo, sides, 1 / FLUID_STEPS, chilled)`** (new, split out of `runSpecials`): burners, then chillers, in one pass over the cells as today (a chiller always comes before a burner that shares its cell, whichever side it is on); then the sky cells, in a pass of their own after every chiller (so a chiller to the left of a sky cell and one to the right give mirrored answers). It adds what was cooled in each cell to `chilled`.
   4. For every cell that was cooled in this step, the push its steam was carrying shrinks with it: `rising[i] ×= steam after ÷ steam before`. (Cooled steam takes its push with it into the rain, where it is lost. The old tidy-up line `rising ≤ steam × height` stays as the backstop.)
3. **`runSpecials(world, blockInfo, sides)`** once: faucets, then drains. It no longer takes `chilled`.
4. Steam cooled inside a turbine's cell is counted as gone through (`gross`, `out`), from the summed `chilled`: as now.
5. Returns what it returns today.

`runHeat` never puts water in a drain's cell (rule 2) and never puts more water in a cell than fits. New rain gets no `falling` push of its own: it earns it by falling.

`waterSystem`, `refreshWater`, `turbineSource`, drawing: no change. `world.fluidChanged` is set by cooling as by any other change, and stops being set when the last wisp has gone.

## What is deleted

| Where | Gone |
|---|---|
| fluids.js | `runSpecials`' burner and chiller halves and its `chilled` argument (→ `runHeat`); the words "Steam ... turns a corner and goes sideways, has lost its push" in `stepFluids`' comment (now: "turns a corner **in a room**"; the tunnel rule is explained there); "Not into cells that are mostly water" as the whole of `roomFor`'s comment (now: "unless it cannot rise"); `BOIL_STEAM_CAP`'s reason "would pack the sky with steam forever" (now: "a burner cannot boil into steam that is already packed tight, like a pot with its lid screwed down") |
| water.js guide | "Stand it upright in the chimney: steam that turns a corner first has lost most of its push" |
| wiki/Water.md | "give each extra burner its own pot ... (Steam can't push sideways through water ...)"; "Beside the turbine only works if the turbine is the very top of the chimney ... gathers up there instead"; "or turned a corner into a pipe, has no push left" |
| tests | the three tests that pin the old rules (see "Tests") |

No constant is removed. `SKY_COOL` is the only new one.

## Saved worlds

- The save format and version do not change. No new field: `rising` is not saved today and `tunnel` and `chilled` are worked out every tick.
- A saved world with steam lying under the open sky starts to rain when it is opened, gently: a sixteenth of each sky cell a tick, the layers under it rising to take its place. All of that steam comes back as the same amount of water. A world that had choked on steam starts running again by itself.
- Steam under any lid is untouched. A saved sealed plant behaves as before, but for the small number changes above (lamp 0.732 → 0.727).
- A saved plant with a turbine after an elbow gets stronger; one with a second burner in the corner of its pot gets stronger; one with a chiller beside a mid-chimney turbine starts working. Nothing gets weaker except by the 1.25% of the streaming steam.
- No message. The guide and wiki say what the sky does.

## Why no build can make energy

The books: `Es` is the steam's energy (the sum over cells of `storedEnergy(steam) + steam × row`, rows counted from the top), `Ew` the water's (`storedEnergy(water) + water × height of the cell's floor`), and `H` the height of the world. Put them in one number:

```
Ψ = Es + Ew + H × (all the steam in the world)
```

The last part is the rain the steam still has in it: a cell of steam can at best be cooled in the top row, and water made there has at most `H` of height energy.

1. **Moves never raise Ψ, and every bit a move gives up is handed out at most once.** Water moves lower `Ew` and steam moves lower `Es` (the two existing arguments, untouched), and moving steam does not change how much steam there is. Rule 4 adds moves of the ordinary sideways kind, booked the ordinary way. Rule 3 changes only **who** may be handed a bit of push that the steam has already given up: it still goes to one turbine at most, or rides on, or is lost; `part` shares of one cell still add up to at most 1. (Sweep: worst +1.7e-16.)
2. **Cooling never raises Ψ.** Cooling `a` of steam in row `c`: `Es` falls by at least `a × c`, `Ew` rises by at most `a × (H − 1 − c) + a`, the last part falls by `a × H`. Together: at most `−2 × a × c`, never above 0. This holds for a chiller anywhere and for the sky (`c = 0`, where it is exactly even in the worst case: the sky gives nothing away). (Sweep: worst +5.1e-16.)
3. **Cooling makes no push.** It only takes steam away. The steam below then rises into the room, and gives up its own energy doing so, by the ordinary rule. The push the cooled steam was carrying is dropped with it (data flow, step 2.4), and the rain starts with none.
4. **So with no burner lit, Ψ only ever falls**, and all the work every turbine and wheel is ever credited is paid out of that fall. Steam poured by hand is a hand's work, used up once: poured steam rises (a turbine may catch that), rains (a wheel may catch that), and is then water at the bottom for good, because **only a burner turns water into steam.** No electric, spinning or lifting block does.
5. **A burner raises Ψ by at most `2 × row + 3` for each cell of water it boils**, `row` being the row of the pot counted from the top: `row` for the climb the steam has ahead of it, `row + 1` for the fall of the rain it will make, and at most 2 for boiling into steam that is already packed. That is the fire's bill, and it is the most that one cell of boiled water can ever hand to turbines and wheels together, however the machine is built. (Sweep: never passed. The rain-cycle machine above gets 0.324 a tick of a bill of 0.75.)
6. **The fire is an outside source**, like a faucet, a battery or a hand on a crank: nothing in the game makes fuel, and no block can light a burner. A burner at the bottom boiling water that rises as steam, turns a turbine, rains from the sky and falls on a water wheel is a real rain cycle, a heat engine with the fire as its hot end and the sky (or a chiller) as its cold end. Turn the burner off and it winds down and stays down (tested).
7. **Heat every small step changes no total.** Four quarters are one whole; each quarter obeys the same limits (`water above`, the steam cap, `FULL − water`).
8. Everything else that raises the books is as the two specs before this one left it: faucets, pumps (paid in electricity), blocks sinking or loads on ropes (paid by weight), and hands.

A real fire gives thousands of times more heat than this bill. Nearly all of it goes into the sky when the steam cools, which is true of every real power plant too; the wiki says so in one sentence.

## Tests

### tests/fluids.test.js

Change:
- **"steam bubbles up through water"**: the world's top row was open, so the steam now rains away. Put a lid on it (`'###'` on top, read the cell under the lid).
- **"in lots of random worlds, turbines never get more energy than the steam has given up so far, and no steam is lost"**: give every random world a stone top row (the test is about moves; cooling has its own tests below).
- **"rising steam carries its push to the first turbine; steam that has spread out under a ceiling has lost it"**: its bent world is a one-wide tunnel all the way, which now keeps the push. Replace it with a real room (the shaft opens into a room 5 wide and 2 tall with the turbine in its ceiling: the turbine gets less than 2.5 for a cell of steam), and keep the still-room check.
- **"a chiller beside a drain is the same on either side..."**: add a lid row so the sky is not in it; it must pass unchanged otherwise (that is rule 2's drain line).
- **"stepFluids gives over-full water room by itself, and steam may stay squeezed"**: the squeezed steam sits in an open top cell. Put a lid on, or it rains.
- **"a kettle ... does not fill the world with endless steam"**: passes as it is (its top row is open, so it now passes easily). Add a twin with a stone top row, which is the old case.
- "a burner boils..." and "a chiller turns..." pass as they are (one tick is still one whole `BOIL_RATE` / `CONDENSE_RATE`). Add **steam leaves the pot as a steady stream**: a chiller on top of a one-wide chimney 7 cells tall over `#~#` over `#B#`: after 100 ticks, and on each of the next 3 ticks, every chimney cell but the one touching the chiller holds `BOIL_RATE ÷ FLUID_STEPS` (0.0125, within 1e-9; measured), and that one holds 0.

Add:
- **Steam under the open sky cools into rain** (the issue's case: one cell on a burner in 24 × 14; steam < 0.01 by tick 200; water + steam = 1 within 1e-9 at every tick).
- **A thick cloud rains harder than a thin one** (one sky cell with 0.8 of steam and one with 0.2, walled apart: after a tick they have lost 0.0488 and 0.0122, four small steps of a sixty-fourth each: four times as much from four times the cloud).
- **Nothing is squeezed under the open sky** (pour 1.6 into a walled sky cell: after one tick it holds less than `FULL` (0.954 measured) and the rest is water in the same cell).
- **The last wisp goes** (0.0009 of steam in a sky cell: 0 after one tick; and an open world with one poured cell of steam comes to rest: `stepFluids(...).moved` is exactly 0 within 400 ticks (92 measured), with exactly the poured amount of water on the ground).
- **Under a lid nothing cools** (the same steam under stone in the top row, and under a ceiling lower down, and in a pipe lying along the top row: unchanged after 400 ticks). **A standing pipe or turbine in the top row is an open chimney top** (it cools).
- **Rain has to fit** (a walled sky cell full of water keeps its 0.5 of steam; with 0.9 of water it turns 0.1 into water and keeps 0.4).
- **Rain made in a drain's cell goes down the drain** (drain in the top row, steam in it: no water beside it, steam gone; mirrored worlds agree).
- **A mirrored world rains the mirrored rain** (three shapes with chillers beside sky cells, 200 ticks, every cell within 1e-12).
- **Cooled steam takes its push with it** (steam rising up a tall open shaft: after it reaches the sky, `rising` in the sky cell is never more than `steam × height` and falls to 0 with the steam).
- **A chiller beside a turbine works wherever the turbine is** (the table above: stub of 1, stub of 3, sealed room, open sky: `gross` within 1e-6 of `BOIL_RATE`).
- **Steam in a tunnel keeps its push round a corner; in a room it does not** (the elbow table: lying turbine after a pipe elbow gets more than 0.9 of the upright one's work; through the room less than 0.35).
- **Steam that has stopped in a tunnel has no push** (a sealed pipe with poured steam, 400 ticks: `rising` all below 1e-6).
- **A bubble under a ledge slides out** (`#~~~#` under `##.##`, steam poured in the corner cell under the ledge: within 10 ticks all of it is in the shaft above the opening (measured); and steam poured at the bottom of a pond 3 wide and 3 deep under a lid goes straight up: below the pond's top row the columns beside it never hold any).
- **The books under the sky and the fire** (the sweep above as a test, 60 seeded worlds × 200 ticks: the four inequalities; with no fire, steam and Ψ never rise).
- **The fire's bill** (the rain-cycle machine, fluids only: turbine + wheel credit over 2000 ticks is positive and at most `boiled × (2 × row + 3)`; burner off: credit stops and water is back to the start within 1e-9).

### tests/water.test.js

Change:
- **"more lamps are harder to turn..."**: its last line wants the steam's power within 0.01 of 1; streaming steam gives 0.9875. Compare with `RISE_POWER × BOIL_RATE × 2 × (1 − 1 / 80)` or simply allow 0.02. Everything else in it must pass unchanged (heat = shaft work to 1e-9).
- **"a chiller right on top of the turbine does not stop it..."**: speeds are `√3` and `2` less the same sliver (1.7248 and 1.991 measured): loosen `1e-3` to 0.01. Its last part (chiller beside the turbine, either side, alike) passes; add the stub and open-sky cases here too, with the real blocks.
- **"a second burner in the corner of ONE pot adds nothing..."** → **"a second burner under the same pot makes the turbine twice as strong, steadily"**: corner + middle and both corners give 1.9 to 2.1 times one burner's strength, and over 200 ticks the strength never moves by more than 1%. The wiki check becomes: Water.md no longer says "own pot".
- **"steam piped round a corner into a turbine has lost most of its push: the guide says to stand it upright"** → **"steam piped round a corner keeps its push"**: corner > 0.9 × upright; and the guide no longer says "upright" as a must (it says a pipe keeps the push and a room loses it).
- "a steam power plant lights a lamp" (0.7 to 0.9, no flicker), "burner off", "mirrored plant", "choking turbine", "sealed box", "lying down a turbine is feeble", the chimney-sharing tests: must pass as they are. If a chimney-sharing figure moves by the 1.25% sliver past its 0.005 allowance, widen that allowance to 0.01 and say why in the test.

Add:
- **An open-air engine runs for good** (the picture below in a 24 × 14 world: lamp at tick 400 and at tick 6000 within 1e-6, between 0.6 and 0.9; steam in the world under 2).
- **The wiki plant in the big world runs for good** (lamp at 400 and 6000 within 1e-6).
- **An open plant with no faucet runs dry** (lid and chillers off, 24 × 14: lit at tick 40, dark at tick 400, pot empty, water + steam = 1).
- **A cloud in the chimney top pushes back** (same chimney: turbine speed under the open sky is lower than under a chiller, by more than 5%).

### Others

- `tests/gears.test.js`: "no steam machine runs without its fire" and the loop tests must pass unchanged. Add **the rain cycle needs its fire**: burner, turbine → generator → lamp, open sky, rain onto a water wheel → second generator → lamp; both lamps lit; burner off: both dark and still dark 300 ticks later.
- `tests/guide.test.js`: add "the 💧 guide says steam cools under the open sky" and "the turbine's guide no longer says upright is a must".
- `tests/wiki.test.js`: the two new pictures are linked and exist (the existing link check covers it once the files are there).
- `tests/docs.test.js`: JSDoc for `runHeat` and every inner helper.
- `tests/saves.test.js`, `tests/sw.test.js`, `tests/build.test.js`, lifting tests: no change expected. `sw.js` fetches our own code from the network first and no cached file is added (wiki pictures are not cached), so `CACHE_NAME` stays.

### Sweeps to run again after the build (throwaway scripts, at most 6 processes)

1. `p29/sweep.mjs` on the real code (it needs a small export for the heat bookings, or re-derive them from before/after of `runHeat`).
2. The turbine spec's 900 random plants and 750 motor-feedback plants, and the water spec's whole-game fuzz (700 worlds): no flicker once steady, all stop with the fire out, no cell over `FULL`, no water + steam made.
3. Mirror sweep: 400 random steam worlds with sky cells, chillers and ledges beside their mirror images: 0 differ.
4. The lifting sweeps (`repair/sweep-lift.mjs`, `r3fix/sweep.mjs`): a load pushing steam down under the sky must still never climb back (steam it pushed down just rises and rains: lossy).

## Docs, guide and pictures

**💧 guide (water.js)**
- Rule 4 becomes: "Steam is the opposite: it rises and spreads out under ceilings. Steam has to RISE to give its push, like water has to fall. In a pipe it keeps that push round a corner; spread out in a room it has lost it."
- New rule after it: "Under the open sky (the very top of the world) steam cools into a cloud, and the cloud rains. A thick cloud rains hard. Under a lid steam stays steam and packs in tighter and tighter. Nothing is lost: rain is the same water that was boiled."
- `steam`: "BUILD pours a cell full of steam. It rises. At the open sky it cools into rain."
- `burnerOn`: "Boils the water just above it into steam. The fire is where a steam machine's energy comes from: turn it off and everything winds down."
- `chiller`: "Very cold: steam touching it turns back into water at once. It works anywhere, even indoors and right beside a turbine."
- `turbine`: drop the "Stand it upright..." sentence; add "Steam piped to it round a corner still spins it. Steam from a wide room hardly does."
- Header comment of water.js: add "☁️ under the open sky steam cools into rain" under the plant sketch.

**fluids.js comments:** the header's steam paragraph gains the sky, the tunnel and the ledge in three sentences; `stepFluids`' "RISING STEAM CARRIES ITS PUSH" paragraph is rewritten for rule 3; a new paragraph "HEAT WORKS ALL THE TIME" for rule 2; `runHeat`'s JSDoc carries rule 1's sums in words.

**wiki/Water.md**
- New paragraph: "**The sky makes rain.** Steam that gets to the very top of the world, with nothing over it, cools into a cloud and rains. A thick cloud rains hard, a thin one slowly. It is the same water that was boiled: nothing is lost. Put a lid on (any block in the top row, or a ceiling lower down) and the steam stays steam."
- Rewrite the "Steam has to rise" paragraph: pipes keep the push round a corner, rooms lose it; more burners under one pot are fine (bubbles slide out from under a ledge); a chiller can sit on top of a turbine or beside it, anywhere in the chimney; "a turbine blowing into a chiller turns faster than one blowing into the cloud at the top of an open chimney, because the cloud pushes back".
- One sentence: "A real fire gives far more heat than a turbine can ever catch. Most of it goes off into the sky with the steam, in real power plants too."
- Block table: steam, burner, chiller, turbine rows as the guide.

**wiki/Machines-to-build.md**
- "Steam power plant": keep (it is the sealed kind, and still right). Add: "With a lid and chillers the same water goes round and round."
- New, after it: **"Open-air steam engine."** "No lid and no chillers: the steam goes up the chimney into the sky and rains. The rain falls all over the place, so the pot needs a **faucet** to keep it full, like a steam train stopping for water, and a **drain** on the ground or the world slowly floods." Picture `machines/steam-engine.png`, alt "A faucet-fed boiler, turbine, generator and lit lamp under a rain cloud".
- New: **"Make it rain."** "A pot of water on a burner with walls right up to the top of the world. Steam rises, a cloud forms, rain falls back in, for ever. That is the water cycle. Lower the walls and the rain falls outside: the pot boils dry." Picture `machines/rain-cycle.png`, alt "Steam rising from a pot into a cloud that rains back into it".

**wiki/Gears.md:** "Nothing runs forever" gains: "Rain from a steam cloud can turn a water wheel too. The burner pays for that as well."

**Pictures (`tools/make-block-pictures.cjs`)**, two new scenes (the letters are already there):

```
'steam-engine', 60 ticks        'rain-cycle', 60 ticks
.f.....                         #.....#
#..#...                         #.....#
#..WWW.                         #.....#
#.TE.L.                         #~~~~~#
#~~WWW.                         ###F###
##F###D
```

Checked on the prototype: `steam-engine` lamp 0.727 from tick 60 to tick 20 000 in 7 × 6 and in 24 × 14 (cloud 0.21 to 0.12 across the top at tick 60); `rain-cycle` holds a cloud of about 0.15 a cell and water 4.18 for good. Regenerate with the house command. `power-plant.png` may change by a pixel of steam (streaming); `steam-engine.png` and `rain-cycle.png` are new; `git checkout` `crate.png`, `ironWeight.png` and `music-machine.png` afterwards.

**README:** check the Build description for anything that says steam stays; the file table is still true.

**Older specs:** short addenda, not rewrites. Fluids spec: "steam under the open sky cools into rain; burners and chillers work every small step; 'sealed box, no chiller: steam builds up' is still true for sealed boxes: see 2026-10-05-steam-cools-under-the-sky-design.md". Turbine spec: "the three #29 leftovers of addenda 2 and 3 (elbow, chiller beside a turbine, steam sideways through water) and the puffing wide pot are closed there". Water spec, "What this leaves for later": the #29 line points here.

## Suggested commit order

1. fluids.js: heat every small step (`runHeat` split from `runSpecials`, the drain line, `rising` shrinking with cooled steam). Tests: the two loosened water tests, the stream test. (All else must pass.)
2. fluids.js: the open sky (`SKY_COOL`, rule 1). Fluids and water tests for it; lids on the four old tests.
3. fluids.js: tunnels keep the push (rule 3). Its tests; the two rewritten ones.
4. fluids.js: bubbles under a ledge (rule 4). Its tests; the wide-pot test rewritten.
5. Guide, wiki, older-spec addenda; guide and gears tests.
6. Pictures.

Each step leaves `npm test` green.

## What this leaves for later

- **Cold water does not cool steam.** Steam bubbles up through a cold pond untouched. It needs a temperature for water (decided above).
- **A world flooded to the brim** keeps the steam in its top row: there is no room for the rain. It clears as soon as any water goes.
- **Clouds do not drift.** A cloud sits over its chimney, about twelve cells wide for one burner, and rains there.
- **A wide boiler feeds one throat slowly.** Steam spreads sideways under a ceiling a quarter of the difference each small step, so four pots under one room pass about 0.10 to 0.17 a tick to a single turbine, not 0.20. That is the old spreading rule, not touched here; "making steam a proper gas" in the water spec is where it belongs.
- **No run-down**, **a wire through a pipe**, the joint solve's inertia: as before.
