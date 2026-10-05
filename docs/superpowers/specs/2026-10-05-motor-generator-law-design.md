# One motor-generator law, solved together with the circuit — design

**Date:** 2026-10-05
**Issues:** #14 (a battery that overpowers a generator brakes it instead of driving it), #15 (a motor draws the same current free-running, loaded or stalled)
**Follows:** `2026-10-05-turbine-spin-source-design.md` (#21), which left "a motor helping its own generator gives 1.28 heat out per work in" for this pass.

**In one sentence:** the motor and the generator become ONE machine (turn it and it pushes current; push current through it and it turns, with one number for both), and the gears and the circuit are worked out TOGETHER inside each tick, so every patch that covered for "each solver uses the other's answer from last tick" is deleted.

**Not in this pass:** inertia and run-down (see "Inertia: looked at, left out"), a back-push for the pump (see "What this leaves for later"), steam cooling (#29), pressure from depth (#30).

---

## 1. The law

A machine is a coil that turns between magnets. It has three numbers, the same for the motor block and the generator block:

| Constant | Value | Meaning |
|---|---|---|
| `MACHINE_K` | **1** | volts for each turn per second, AND push (torque, in crank-pushes) for each amp. One number, used both ways. |
| `MACHINE_RESISTANCE` | **0.45** | the coil's resistance (a lamp is 1, a battery 0.05) |
| `MACHINE_DRAG` | **0.1** | bearing rub: push-back for each turn per second, whichever way it turns |

For a machine turning at `speed` (turns per second, + is ↻) with current `i` coming OUT of its right end (top end when it faces up-down):

```
push (volts, out of its right/top end)   E = way × MACHINE_K × speed          (voltage follows speed)
turning push on its shaft (+ is ↻)       T = −way × MACHINE_K × i − MACHINE_DRAG × speed   (torque follows current, signed)
```

`way` is which way round the machine is fitted, and it is the ONLY difference between the two blocks:

- **generator: `way = +1`.** Turned ↻, its + end is the right (or top). As today.
- **motor: `way = −1`.** Current coming out of its right (or top) end turns it ↻. As today. Turned ↻ by hand, its + end is the LEFT (or bottom).

So "a motor is a generator fitted the other way round". That keeps every saved crane winding the way it did.

**Why one K makes the books balance.** Electrical power the machine puts into the circuit is `E × i = way × K × speed × i`. Mechanical power it takes from its shaft through the coil is `−(−way × K × i) × speed`, the very same product. They are equal in every tick, for any speed and any current, with either sign. Nothing is "given back at 8 tenths": the conversion is exact, and what is lost is real heat, `i² × 0.45` in the coil and `0.1 × speed²` in the bearings.

**What follows from the law (all of it falls out; none of it is a special rule):**

- A machine in a loop with a battery speeds up until its own push nearly cancels the battery's. Free-running it draws only the whisper that feeds its bearings.
- Held back by a load, it turns slower, pushes back less, and draws more. Stalled, it is just a 0.45 coil across the battery and draws the most.
- Turned by hand it generates. Turned faster than the battery would turn it, it pushes current back INTO the battery.
- A battery wired to a cranked generator: against the crank it helps the crank (motoring); with the crank it makes it harder.

### Why these numbers

`K = 1` and `R = 0.45` are chosen so that **one battery's motor is exactly one crank** at the shaft, by the law and not by decree: loop resistance 0.45 + 0.05 = 0.5, so stall push = 1 V ÷ 0.5 × K = **2** (`CRANK_STRENGTH`), and with no drag it would top out at 1 V ÷ K = **1** turn a second (`CRANK_SPEED`). The old `MOTOR_SPEED 1` / `MOTOR_STRENGTH 2` were these same two numbers asserted separately. The crane tests therefore move very little, and only because of the drag.

`MACHINE_DRAG = 0.1` is there because real bearings and brushes rub: a free-running motor then draws a small current you can see as slow dots (0.095 A), not nothing at all, which is what #15 asked for. It is a pure loss. It uses the `spinDrag` hook that spin.js already has and no block was using.

Both blocks get the SAME coil. A thick-coil generator (0.05, as today) was considered and rejected: once a generator can be driven, a 0.05 machine on one battery is a motor five times as strong as the motor block, and "which block is the strong motor?" is not a lesson worth teaching. Same machine, same numbers.

### Numbers to expect (hand-worked from the law; battery 1 V and 0.05, wire resistance left out)

| Build | Speed (turns/s) | Current (A) | Today |
|---|---|---|---|
| Motor + 1 battery, nothing to turn | 0.952 | 0.095 | 0.994 / 0.947 |
| Motor + 1 battery lifting a crate (1) on a winch | 0.476 | 1.048 | 0.494 / 0.947 |
| Motor + 1 battery under an iron weight (4) | 0 (stalled) | 2.000 | 0 / 0.947 |
| Motor + 5 batteries, nothing to turn | 4.673 | 0.467 | 4.2 / 4.0 |
| Motor + 5 batteries lifting the iron weight | 2.056 | 4.206 | 2.2 / 4.0 |
| Motor + battery + lamp in a row, free | 0.870 | 0.087 (lamp nearly dark) | lamp same always |
| Motor + battery + lamp in a row, stalled | 0 | 0.667 (lamp bright) | lamp same always |
| Crank on a generator, nothing wired | 0.952 | 0 | 1.000 |
| Crank on a generator lighting 1 lamp | 0.717 | 0.494 | 0.725 / 0.473 |
| Crank on a generator joined by plain wire | 0.463 | 1.028 | about 0.11 / over 1 |
| Crank ↻ on a generator, 1 battery pushing AGAINST it | 0.976 | 0.049, into the generator: the battery helps | 0.03, braked |
| The same with 2 batteries | 1.438 (faster than the crank alone) | 1.02 | braked |
| The same, battery pushing WITH the crank | 0 (held: both push 2, opposite ways) | 2.000 | held, sparking |
| Battery across a generator, no crank | 0.952 | 0.095 | 0, sparking |

Energy check on the one-lamp row: crank work 2 × (1 − 0.717) × 0.717 = 0.406; lamp 0.244 + coil 0.110 + bearings 0.051 = 0.405. (Rounding in the third place; the code must agree to 1e-9.)

A cranked generator is, seen from the wires, a battery: push = K × the crank's free speed, inner resistance = coil + K² ÷ (the crank's strength ÷ its speed) = 0.45 + 0.5. That is why a weak hand makes a "soft" generator. Worth a line in the wiki.

---

## 2. How the solvers change

### The root cause being removed

Today circuit.js and spin.js each use the other's answer from the tick before: the generator's push comes from last tick's speed, the motor's strength from last tick's current. Every #17/#18 patch papers over that lag. After this pass there is **no lagged quantity between the two**: speeds and currents reported in a tick satisfy the circuit's equations and every shaft's balance at the same time.

### The idea

A circuit is linear. So the current out of each machine's right end is

```
i(m) = fixed(m) + Σ over machines n in the same circuit of  perVolt(m, n) × E(n)
```

`fixed` is what the batteries send through it with every machine standing still; `perVolt(m, n)` is the current machine `n` sends through `m` for each volt it pushes. Both depend only on the WIRING, not on any speed. circuit.js already works these out (`shareOut`). Put the law in and each machine's turning push is a straight-line function of the speeds of the gear groups:

```
push on group g from its machines = a(g) − Σ over groups h of  C(g, h) × speed(h)

a(g)    = −K × Σ (m in g)  ratio(m) × way(m) × fixed(m)                         the batteries' push, at a standstill
C(g, h) =  K² × Σ (m in g, n in h)  ratio(m) × way(m) × perVolt(m, n) × way(n) × ratio(n)
```

(`ratio` is how fast the block turns compared with its group's first block, as spin.js already has it.)

`C` is symmetric (a circuit of resistors sends the same current from n's volt through m as from m's volt through n) and never negative as a whole (`speedsᵀ C speeds` is exactly the heat the machines' pushes make in the wires, which cannot be less than 0). So the machines can only ever couple groups the way a rubbing clutch does. This is the fact everything else rests on.

Each group's balance becomes

```
ahead(g) + a(g) − Σ (h ≠ g) C(g, h) × speed(h)  −  (slowing(g) + drag(g) + C(g, g)) × speed(g)  +  loads(g) = 0
```

which is the balance spin.js already solves for one group (`balance`/`climb`), with a bigger "push at a standstill" and a bigger "slowing". Groups joined through a circuit are solved together as one small set of equations (one unknown for each group).

### New block fields (spin.js and circuit.js still know nothing about which blocks exist)

| Field | Read by | Replaces |
|---|---|---|
| `part.port: true` | circuit.js: this part is told `fixed` and `perVolt` (for ports only, about ports only) | `part.feelsLoad`, the `load` number, `perVolt` on every lamp and motor |
| `part.pushNow(world, x, y)` | circuit.js, as today, but used **exactly as given: no rounding** | the rounded `pushNow` (`PUSH_STEP`, `roundPush`) |
| `spinLink(world, x, y)` → `{ still, perTurn: Map<cell index, number> }` or null | spin.js: the push on this block is `still − Σ perTurn(other) × speed(other)`. The block promises `perTurn` is the same both ways round between any two blocks and never helps (see above). | `spinBrake`, and the motor's `spinSource` |
| `spinDrag` | spin.js (already there) | — now used: both machines return `MACHINE_DRAG` |

gears.js gives both machines one `machineLink` (from the ports: `still = −way × K × fixed`, `perTurn(n) = way × K² × perVolt(n) × way(n)`) and one `machinePush` (`way × K × speed`, 0 under `MIN_SPEED`). The motor and the generator are made by one function, `machine(way, …)`, like `crank(speed, name)`.

### What happens in one tick (order of packs unchanged: basic → water → gears → lifting → electric)

Inside `gearsSystem`:

1. Smooth the water wheels' and turbines' counts (unchanged).
2. **Wiring.** If `wiringKey` (blocks + clicker beat) changed: build the circuit's points and connections, clear out each circuit's equations once, and work out `fixed` and `perVolt` for every port. Kept in `world.signals.electric.net` until the wiring changes again. No speed is needed for any of it. (`circuitPorts` in circuit.js; the cache check in electric.js.)
3. **Joint solve** (`solveSpin`): groups, ratios, jams, sources, loads and stops as today; then `a` and `C` from every `spinLink`; then the speeds (next section). Speeds under `MIN_SPEED` become 0 and the groups they belong to are solved again with those held, so what is reported is exactly balanced.
4. **Finish the circuit** (`refreshElectric`): one quick answer for each circuit with this tick's exact machine pushes, re-using the cleared-out equations from step 2. By linearity this is the same current the joint solve used, to rounding. Lamps, pumps, notes, sparks and dots read it as today.
5. Turn every block on by its speed (`keepAngles`, unchanged).

The lifting pack then moves rope by this tick's speeds, and `electricSystem` at the end of the tick finds the work done (same key) and only asks for the redraw. `circuitKey` is `wiringKey` plus the machines' exact pushes (nine decimal places), so a steady machine costs no circuit work at all.

`refreshSpin` (a block was placed between ticks) does steps 2 to 4 without step 5. Redrawing still never moves anything on.

**One lag is left on purpose, and it cannot make energy:** a pump moves water (water pack, start of the tick) by the current worked out at the end of the tick before. Every tick of current is paid for in the tick it flows; the pump uses it one tick later, once. That is a delay, not a gain. The sweeps check it.

### The joint solve, exactly

Before the speeds:

- **Powered groups** (this replaces "has a `spinSource`" for `driven`, `isDriven` and the winch's ratchet): a group is powered if it has a plain source (crank, wheel, turbine), or `a(g) ≠ 0` (a battery sends current through one of its machines), or it is linked by `C` to a powered group.
- **Which way an `eitherWay` source turns** (a wheel with water falling dead straight through, a turbine), decided once, before the solve: (1) the way the pushes that depend on no turning at all point: the group's other plain sources plus `a(g)`; if those cancel, (2) the way it was turning on the last tick; else (3) the way it says (↻). The old step "standing still: any push there is" is gone (it only existed for `echo` motors). A wheel turned against its way by something stronger pushes back harder, like a crank turned backwards, and on the next tick rule 2 makes it go along.

Then, for each set of groups joined through a circuit ("cluster"; a group with no working machine is a cluster of one and is settled in one go exactly as today):

```
speeds = all 0                                   (always start from standing still, like a real machine)
repeat (at most NEWTON_STEPS = 20):
    for each group g:
        answer(g), give(g) = settle(g,  push at standstill = ahead(g) + a(g) − Σ(h≠g) C(g,h) × speed(h),
                                        slowing = slowing(g) + drag(g) + C(g,g))
    if no answer differs from its speed by more than SETTLED (1e-9): done
    solve the straight-line equations   speed(g) + give(g) × Σ(h≠g) C(g,h) × speed(h) = answer(g) + give(g) × Σ(h≠g) C(g,h) × old speed(h)
    (one small grid, `solveLinear` from circuit.js)
```

`settle` is today's `settle` (balance, then the ratchet, then hard stops) with the brakes taken out. `give` is how much the group's speed moves for each unit of extra push: `1 ÷ slowing` when it is running freely between two edges, `0` when it is held (stalled, at a load's edge, blocked by a hard stop, jammed, or not powered). When no group changes from "free" to "held" or back, the first straight-line solve IS the answer and the second pass only confirms it: two passes, however hard the groups lean on each other. Four generators in one loop, which took `leap` and up to 200 rounds, take two.

If it has not settled in 20 steps (only a winch's ratchet can do that: its catch lets go the moment a source pushes the let-out way, which is a jump, and two shafts wired together can in principle keep tipping each other over it):

- go round the groups one at a time (`SWEEPS = 60` plain rounds). For everything except the ratchet this always creeps to the one answer, because of what `C` is.
- any group still changing after that is **held still** (`stalled`), and the rest are solved again with it held. Each time round at least one more group is held, so it always ends.

**The promise the solver keeps, whatever happens:** every group that is reported turning has its pushes exactly balanced at the reported speeds, and every other group stands still. A group standing still does no work. So no way out of the solver, not even the emergency one, can report turning that nothing pays for.

The answer depends only on the world as it is now (plus which way either-way sources were turning). Nothing else is carried over from the last tick: not speeds, not currents.

### The short-circuit rule

`shortedByShape` loses its two generator clauses ("a stopped generator's coil is plain wire", "overpowered"): a machine's coil is 0.45, a real resistor, and is never plain wire on another pusher's path. A battery across a stopped machine is a stalled motor (2 A, no spark), and it spins up. The batteries' rules are unchanged. A machine can still spark ITSELF when it pushes more than `SHORT_CURRENT` round a loop of plain wire (a strongly driven generator joined by wire), by the same rule as a battery.

---

## 3. What is deleted

Replace, do not build on. After this pass none of these exist:

**gears.js**
- `FEED_SMOOTHING`, `FEED_MIN`, `generatorFeed`, `generatorWiring`, `rewiredParts`, and `signals.spin.fed`, `.felt`, `.rewired` (the quarter-at-a-time motor, the rewired-tick rule).
- `fadeIn` and the motor's use of `MIN_SOURCE` (the current-squared strength fade).
- `motorSource` and its `echo` flag (the echo-motor water-wheel rule).
- `generatorBrake`, `generatorPush` (rounded), `GENERATOR_GAIN`, `GENERATOR_TORQUE`, `MOTOR_SPEED`, `MOTOR_STRENGTH`.

**spin.js**
- `spinBrake`, and every brake branch in `balance` and `climb` (they go back to sources, loads and drag only).
- `leap`, `MAX_ROUNDS`, the go-round-until-nothing-changes loop, `asked`, `speedOf`, and starting from last tick's speeds.
- `echo` and `pointing`'s special case.

**circuit.js / electric.js**
- `PUSH_STEP`, `roundPush`, the rounding in `partPush` and `circuitKey`.
- `feelsLoad`, `load`, `perVolt`/`fixed` on parts that are not ports.
- The two generator clauses in `shortedByShape`.

Also gone with them: "a motor can briefly have slightly more current than flows" (the last item on #14's list) cannot happen, because a motor no longer has a current of its own to remember.

The header comments of the three files, which explain the old rules at length, are rewritten to explain the law and the joint solve in the same kid-readable voice.

---

## 4. Why no build can make energy

Three sums, each exact in every tick, at the speeds and currents that tick reports:

1. **The circuit.** `Σ batteries (volts × current) + Σ machines (E × i) = Σ over every resistance (current² × resistance)`. True for any solved circuit (Kirchhoff). The machines' coils are among the resistances.
2. **Each machine.** `E × i = −(coil's turning push) × speed`. Not solved for: it is the same product written twice, because one `K` is used both ways. This is the line the old model did not have (0.8 one way, 1 the other, and the motor had no push-back at all).
3. **Each shaft.** For every turning group, sources + machines + loads + drag balance, so `Σ sources' work = work done on loads + work the machines' coils take + bearing heat`. Groups not turning do no work. (The solver's promise above.)

Add them up, and the machine terms cancel:

```
battery energy + sources' work  =  heat in every resistance + bearing heat + work done on loads
```

Every term on the right is 0 or more, or is a load that really moved (the lifting pack books that from the same speeds). The sources' work is what it always was: a crank's `strength × (1 − speed ÷ top) × speed`, and for wheels and turbines never more than their water's or steam's ledger allows (their strength and speed are not touched by this pass).

- **A motor geared to help its own generator** (the 1.28 case): by sum 2, whatever the motor adds to the shaft it took from the circuit in the same tick, and whatever the generator put into the circuit it took from the shaft. Heat = the source's work, 1.00, however it is geared.
- **Clickers and switches:** there is nothing left over from the last tick for a clicker to hand on. Each tick's sums stand alone.
- **Many generators, opposed generators, batteries in the loop:** all are just more terms in sums 1 and 2.
- **No source at all:** all speeds 0 is the only balanced answer (the left side is 0 and heat cannot be negative), so nothing starts or runs on by itself.
- **Tuning cannot break it.** Any `K`, coil resistance or drag (even different ones for each block, if a later pass wants that) keeps all three sums, as long as each machine uses its own one `K` both ways. "🧪 Try this!" can no longer build a free-energy machine here; the comment on `GENERATOR_TORQUE` that invited it goes.

---

## 5. Saved worlds

No change to the save format, the block names, or `SAVE_VERSION`. `motor` and `generator` stay two palette blocks; a saved world loads as before. What a child will notice in an old world:

- Motors turn the same way, and a little slower with nothing to turn (0.95 for 1.0). Loaded speeds are within a few hundredths (see the table).
- Generators are softer sources (coil 0.45 for 0.05): one lamp is about as bright (0.52 for 0.58), but several lamps side by side are dimmer than before, and a generator feeding a motor passes on less.
- A battery wired across a generator used to hold it still and spark. Now it spins it.
- A generator-fed motor reaches its speed at once, not over 2 seconds.

No migration is needed and none is written.

---

## 6. Inertia: looked at, left out

The "no run-down" leftover from #21 (a turbine or motor with nothing to turn stops dead when its power goes). Adding a flywheel term is easy in THIS solver (`inertia ÷ tick length` joins each group's slowing, and the same times last tick's speed joins its push), and done that way it only ever loses energy. It is left out because of what it drags in: stored turning energy must be accounted for when a gear is dug away or two trains are joined, when a load hits a hard stop or the ground, and in the winch's rope ledger; and every test that reads a steady speed after a few ticks would need a spin-up wait. That is a pass of its own. This pass leaves the door open: the solver starts each tick from standing still on purpose, and the place the term goes is one line in `settle`.

The bearing drag is not inertia: it stores nothing.

---

## 7. Tests

`npm test` passes in full at every commit. Names below are today's names in the test files.

### tests/circuit.test.js
- **Change** "a part with pushNow pushes as hard as it says": exact, no rounding. **Delete** the rounding test (`partPush` 0.016 → 0.01 and friends).
- **Change** the `feelsLoad`/`load`/`perVolt` tests to ports: only ports get `fixed` and `perVolt`; `perVolt` is the same both ways round between two ports (new); twenty makers still clear the equations out once (`work.factorings`).
- **Add** "the finished circuit's current through every port equals fixed + Σ perVolt × push".
- **Add** "a 0.45 coil is never plain wire: a battery across a stopped machine does not spark, two batteries in a row wired back still do".

### tests/spin.test.js
- **Delete** every `spinBrake` test and the leap/rounds tests. **Add**, with test-only blocks that have `spinLink`:
  - one group: speed = (ahead + still) ÷ (slowing + own perTurn);
  - two, three and four linked groups: the answer matches a direct solve of the equations to 1e-9, in at most 3 passes (count `settle` calls);
  - a linked group with a too-heavy load stalls and the others are balanced with it at 0;
  - a hard stop, a jam and a resting load in a cluster;
  - the emergency exit: a made-up `spinLink` that breaks its promise (helps) ends with groups held still, never with `NaN` or a group turning unbalanced;
  - an either-way source follows a battery's push (`still`), and keeps its way when only linked turning pushes on it.

### tests/gears.test.js
- **New, the law itself:**
  - "a motor draws most current stalled, less lifting, hardly any free" (2.000 / 1.048 / 0.095 within 0.01, layout from #15);
  - "a lamp in a row with a motor is bright when the motor is stalled and nearly dark when it runs free";
  - "a battery spins a generator, as fast as it spins a motor";
  - "a battery pushing against a cranked generator helps the crank; two batteries drive it faster than the crank alone; pushing with the crank holds it still" (layouts from #14);
  - "a motor turned by a crank lights a lamp, with its + end on the other side from a generator's";
  - "motor and generator swapped in any build give the same speeds, with the current the other way round";
  - "one battery's motor is one crank: same stall push, same speed under every load, less the bearing drag";
  - "the books balance every tick: battery energy + crank work = every resistance's heat + bearing heat + load work, to 1e-9" over a list of builds (lamp; shorted; opposing and aiding battery; generator → motor on a second shaft; **motor geared to help its own generator, the #21 layout: heat ÷ work is 1.000, not 1.28**; three generators in a row; two opposed generators and a battery; with a clicker, checked on every tick including the ticks it flips);
  - "a generator-fed motor is at full speed on the first tick" (no smoothing).
- **Re-pin on purpose:** every test using `GENERATOR_GAIN ÷ GENERATOR_TORQUE` ("never more than 8 tenths", lines 144, 251-261, 331, 698, 994, 1051) becomes "the lamps never get more than the work put in, and work in = all heat, exactly"; "a generator joined by plain wire is very hard to turn" (crank 0.46, current just over 1); "spins freely" speeds (0.952, as a named expression `CRANK_STRENGTH ÷ (CRANK_STRENGTH ÷ CRANK_SPEED + MACHINE_DRAG)`, not a typed number); "a battery straight across a generator: one answer whichever was there first" (the answer is now: it spins); "a battery wired straight across a stopped generator sparks" (now: no spark, 2 A, then it turns); "a battery never turns a generator into free turning" (now: it does turn it, and the battery pays: checked by the ledger).
- **Keep, must pass unchanged in meaning** (re-pin numbers only): every wind-down and perpetual-motion test (95, 149, 277, 313, 556, 616, 625, 664, 735, 1058, 1164, 1538), no-flicker tests (290, 748, 1191, 1211, 1360), twins turn alike (1236, 1412), exact balance sends no current (1438), mirrored builds (499, 1143), clicker tests (675, 1100, 1252, 1295, 1326). Several of these were written to pin a patch; where the comment explains the patch, rewrite the comment to say what the law gives.
- **Delete** tests that only pin a deleted mechanism and have no meaning left (for example "takes up a change a quarter at a time" timing asserts), each replaced by its meaning under the law where there is one.

### tests/lifting.test.js, tests/lift.test.js
- Re-pin the motor numbers (155, 162, 270, 355-380, 890-903): five batteries lift the iron weight (2.06 turns/s), one battery stalls on it, a motor on five batteries lets rope out at over 4 turns a second.
- 388 ("a hanging weight only gives power by really coming down") and 415 ("two winches … stop when the weights land"): keep, with the ledger now exact; add bearing heat to the right-hand side.
- **Add** "a motor lifting a heavier load draws more current from the battery, and the battery's extra energy is the load's extra height plus the extra coil heat".

### tests/water.test.js, tests/water-picture.test.js
- Line 217 (steam plant: lamps ≤ 8 tenths of the steam's work) becomes lamps ≤ the turbine's shaft work, and all heat = shaft work. Re-pin the plant's lamp level.

### tests/electric.test.js, tests/guide.test.js, tests/wiki.test.js, tests/docs.test.js
- `circuitKey` without rounding. Guide and wiki tests pass with the new words. JSDoc on every new function.

### Sweeps (scratch scripts, not committed; re-run under the scratch names tests/gears.test.js encodes, and the #21 ones: `sweep2-plants.mjs`, `sweep3-soup.mjs`, `sweep4-feedback.mjs`, `explore5-motor-recirculation.mjs`)

Each keeps the ledger of section 4 and fails on the first tick it is off by more than 1e-6:

1. Random gear trains with 1 to 6 machines (either block, any gearing), cranks, batteries either way round, lamps, clickers and tapped switches: books exact every tick; with no battery, crank, faucet or burner nothing ever turns.
2. The feedback sweep of #21 (750 plants whose generator feeds a motor on the plant's own train): heat ÷ shaft work = 1 within rounding in every tick, never above.
3. Pump → wheels → generator → pump loops, and the steam plant → pump → wheel chain: wind down without their battery or fire, however geared.
4. Winch builds with hanging loads, generators and motors: load height + heat never passes battery + crank + fall.
5. Solver health over all of the above: passes per cluster (expect 2 or 3), how often the plain rounds and the emergency hold are reached (expect never outside ratchet builds; report any).
6. Timing: the 50-generator clicker build of #17 must not be slower than today.

The spec addendum records what the sweeps measured, as #21's did.

---

## 8. Guide, wiki, README, pictures

**⚙️ guide (gears.js)**
- Rule "Generators push back…" becomes: "A motor and a generator are the SAME machine. Turn it and it pushes electricity: 1 volt for each turn a second. Push electricity through it and it turns. Making electricity takes work: the more lamps it lights, the harder it is to turn."
- New rule: "A spinning machine pushes back against the battery. So a motor with nothing to turn sips electricity, a motor lifting something takes more, and a stalled motor takes the most and just gets hot."
- Rule "Nothing runs forever…" keeps its meaning; "8 tenths" goes: "Every bit of turning has to be paid for, and some always ends up as heat in the coils and bearings. A motor powered by its own generator stops."
- `motor`: "Electricity in, turning out: put it in a loop with a battery. One battery makes it as strong as a crank. Swap the battery's side and it turns the other way. Turn it by hand and it is a generator."
- `generator`: "Turning in, electricity out: wire it up like a battery. Its + end swaps when it turns the other way. Wire a battery to it and it is a motor. It is a motor fitted the other way round."

**⚡ guide (electric.js):** nothing says a stopped generator is plain wire there; check and leave.

**wiki/Gears.md:** rewrite the motor and generator rows, "Generators push back", and "Nothing runs forever" (lines 13-14, 58-88): delete the paragraph about feeling electricity late, a quarter at a time, and the rewired tick; delete "a real generator would run as a motor; ours doesn't". Add a short "One machine" section with the three motor currents and "a cranked generator is a soft battery". **wiki/Power.md** line 29: delete "A stopped generator counts as plain wire too". **wiki/Lifting.md** lines 19, 30, 42: check "a falling weight can't run a generator by itself" still reads true (it does: the ratchet), and add that a stalled motor draws the most current. **wiki/Experiments.md:** add three experiments (lamp in a row with a motor: free vs stalled; two batteries against a crank; swap the motor and generator blocks). **wiki/Machines-to-build.md:** words unchanged; check the lamp is still clearly lit in both power pictures.

**README:** the table row for gears.js says "motor, generator": add "(one machine)". Nothing else there is about play.

**Older specs:** one-line pointers to this spec at the generator/motor sections of `2026-10-02-gears-pack-design.md` and `2026-10-03-lifting-pack-design.md` (the `c = GENERATOR_TORQUE × …` formula), and under "What this leaves for later" in the #21 spec.

**Pictures:** the motor's and generator's drawings do not change, so `wiki/blocks/*.png` should come out the same. Regenerate with the house command; expect `power-plant.png`, `hydro-dam.png` and any crane picture with a motor to change (lamp brightness, gear angle); look at each; `git checkout` `crate.png`, `ironWeight.png`, `music-machine.png`.

**sw.js:** no file is added or renamed and our own files are network-first, so `CACHE_NAME` stays `caleb-v8`.

---

## 9. What this leaves for later

- **Inertia / run-down** (section 6).
- **The pump is still a plain 1-ohm part:** it draws the same current pumping, lifting or stalled at its top height. It is the same gap as #15, for the water pack. It makes no energy (it already spends more than the water gains). Worth its own issue.
- **The pump's one-tick delay** (section 2) would go if the water pack read this tick's current; that needs the packs' order looked at as a whole.
- **Showing heat:** a stalled motor "just gets hot" only in words. A warm glow on a coil carrying more than about 1.5 A would let a child see it.

---

## 10. Order of work (small commits, tests green at each)

1. circuit.js + electric.js: ports (`part.port`, `circuitPorts`, the wiring cache), exact `pushNow`, short-circuit rule. Circuit and electric tests. (Gears still on the old path through a thin shim, deleted in step 3.)
2. spin.js: `spinLink`, clusters and the joint solve, powered groups, either-way rule; `spinBrake`, `leap`, rounds deleted. Spin tests.
3. gears.js: `machine(way)`, `machineLink`, `machinePush`, the new tick; every item in section 3 deleted. Gears, lifting and water tests re-pinned; the new law tests.
4. Sweeps; fix what they find; addendum to this spec with the measurements.
5. Guide text, wiki, README, older-spec pointers.
6. Pictures.
