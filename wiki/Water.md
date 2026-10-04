Water and steam are real **amounts**: a cell can be full, half full, or
nearly empty, and water never appears or disappears by itself. Build a rock
into a tank and the water is pushed out of the way, so the level goes **up**,
like dropping a stone in a full glass. (Pipes, valves, wheels, pumps and rope
just keep the water that was there.) Only DIG and drains take water away.

**Water looks as tall as it is.** Pour 10 cells of water into a shaft and it
stands 10 cells tall. One tap of DIG takes **one scoop**: a full cell at the
most. You can't pour into a cell that already looks full, so pour just above
the water. (Inside the game, deep water is really *squished* into fewer cells:
that squish is how the game makes water push up a U-tube. The picture puts the
squished-in water back on top, so what you see is how much there is: on a step
or ledge inside the tank too, once the level gets that high. One thing
still isn't right: a tank that **looks** brim-full can swallow a bit more water
before it spills over, and a pipe that ends only just below the drawn surface
may stay dry. That needs a new water engine: issue #30.)

**Water has to fall to give its push.** Water up high holds energy, like a
ball at the top of a slide. It gives that push away on the way down (to a
water wheel, if one is there). Water lying level has no push left.
**Lifting water uses up a pump's push.** The higher a pump has to lift, the
slower the water goes, and at some height the water is too heavy and it stops.
More batteries lift **higher and faster**: one battery lifts about 5 blocks,
two about 10.

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
| ![Turbine](blocks/turbine.png) | **Turbine** | A fan inside a pipe. Steam rushing through it spins it, and that makes **electricity**: wire it up like a battery. More steam = more power. Steam only gives its push once: a second turbine further along the same steam gets nothing, so three give no more than one. | — |
| ![Pump](blocks/pumpRight.png) | **Pump** | Uses **electricity** to push water the way its arrow points, even uphill. Wire it into a loop with a battery (wires on the sides the pipe isn't on). The arrow glows when it has power. Uphill is hard work: the higher, the slower. If the water stops part way up, add a battery. ![Pump pointing up](blocks/pumpUp.png) | turns: → ↓ ← ↑ |
