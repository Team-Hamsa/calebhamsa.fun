Water and steam are real **amounts**: a cell can be full, half full, or
nearly empty, and water never appears or disappears by itself. Build a rock
into a tank and the water is pushed out of the way, so the level goes **up**,
like dropping a stone in a full glass. (Pipes, valves, wheels, pumps and rope
just keep the water that was there.) Only DIG and drains take water away.

**Water looks as tall as it is.** Pour 10 cells of water into a shaft and it
stands 10 cells tall. Falling water is drawn as a stream, as wide as there is
water: a faucet's trickle is a thin thread, a waterfall a thick one. One tap of DIG takes **one scoop**: a full cell at the
most. You can't pour into a cell that already looks full, so pour just above
the water. (Inside the game, deep water is really *squished* into fewer cells:
that squish is how the game makes water push up a U-tube. The picture puts the
squished-in water back on top, so what you see is how much there is: on a step
or ledge inside the tank too, once the level gets that high. One thing
still isn't right: a tank that **looks** brim-full can swallow a bit more water
before it spills over (so can a tower joined to an open spout: it is drawn
level with the spout, like real water, however much is squished in below),
and a pipe that ends only just below the drawn surface may stay dry. That needs a new water engine: issue #30.)

**Water has to fall to give its push.** Water up high holds energy, like a
ball at the top of a slide. It gives that push away on the way down (to a
water wheel, if one is there). Water lying level has no push left.
**Lifting water uses up a pump's push.** The higher a pump has to lift, the
slower the water goes, and at some height the water is too heavy and it stops.
More batteries lift **higher and faster**: one battery lifts about 5 blocks,
two about 10.

**Steam has to rise to give its push.** Steam is water upside down: steam low
down (or squeezed) holds the energy, and it gives that push away on the way
**up** (to a turbine, if one is there). Steam that has spread out under a
ceiling, or turned a corner into a pipe, has no push left. So stand a turbine
**upright in the chimney**: lying on its side at the end of a pipe it gets
hardly any push. A **taller chimney under a turbine** makes it faster and
stronger, and **more steam** makes it stronger, not faster. For more steam,
give each extra burner its **own pot** with open air above the water. (Steam
can't push sideways through water. A second burner in the corner of one pot
just fills its corner with steam and stops boiling.) A
turbine uses up the push of the steam that goes through it: the next turbine
up gets only what the steam gives rising on from there. Turbines one after the
other in one chimney share the steam's push, and never get more than it had.
Steam with nowhere to go (a sealed box with no chiller) stops rising, and the
turbine slows down and stops. A chiller can sit **right on top of a turbine**
(or beside it), like the condenser of a real power plant: steam chilled inside
the turbine has still gone through it. Only a burner makes steam: turn it off
and it all winds down.

| | Block | What it does | ✋ USE |
|---|---|---|---|
| ![Water](blocks/water.png) | **Water** | Not really a block: BUILD **pours** a cell full of water. It falls, spreads out and levels off. Deep water gets squished, so it pushes **up** through pipes and U-tubes. | — |
| ![Steam](blocks/steam.png) | **Steam** | Pours a cell full of steam. Steam is water's opposite: it **rises** and spreads out under ceilings. | — |
| ![Pipe](blocks/pipe.png) | **Pipe** | Carries water and steam. Pipes join up with the pipes next to them. The sides are sealed, and the **end** of a pipe is open, so water pours out of it. | — |
| ![Valve](blocks/valveOpen.png) | **Valve** | A pipe with a tap in it. Green = open, red = shut. ![Shut valve](blocks/valveClosed.png) | open ↔ shut |
| ![Faucet](blocks/faucet.png) | **Faucet** | Drips water out of its bottom, forever. | — |
| ![Drain](blocks/drain.png) | **Drain** | Water that flows into it disappears. | — |
| ![Burner](blocks/burnerOn.png) | **Burner** | Boils the water just above it into steam. Off, it looks like this: ![Burner off](blocks/burnerOff.png) | on ↔ off |
| ![Chiller](blocks/chiller.png) | **Chiller** | Very cold: steam touching it turns back into water (it "rains"). | — |
| ![Turbine](blocks/turbine.png) | **Turbine** | A fan inside a pipe. Steam **rising** through it spins it. It makes **turning**, not electricity: put a **generator** (⚙️ tab) right beside it, and wire the generator to a lamp. Wires on the turbine itself do nothing. It turns ↻ by itself, or the way its gears already go. More steam = stronger. A taller chimney under it = faster and stronger. Stand it upright in the chimney: steam that turns a corner first has lost most of its push. If the steam has nowhere to go, it stops. One blade tip is **yellow**, so you can see it turn. | — |
| ![Pump](blocks/pumpRight.png) | **Pump** | Uses **electricity** to push water the way its arrow points, even uphill. Wire it into a loop with a battery (wires on the sides the pipe isn't on). The arrow glows when it has power. Uphill is hard work: the higher, the slower. If the water stops part way up, add a battery. ![Pump pointing up](blocks/pumpUp.png) | turns: → ↓ ← ↑ |
