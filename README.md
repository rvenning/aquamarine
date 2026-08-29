# Aquamarine

A digital adaptation of **Aquamarine**, the print-and-play roll-and-write by
[Postmark Games](https://postmarkgames.com), designed by Matthew Dunstan and
Rory Muldoon.

**[▶ Open it](https://rvenning.github.io/aquamarine/)**

> This is an unofficial personal adaptation, built from a purchased copy of the
> print-and-play for one family's use. It is not affiliated with, endorsed by,
> or connected to Postmark Games. The board artwork is theirs. If you want the
> game — and you should, it is lovely on paper — buy it from them.

## What it does

Two dice are rolled each turn and you take **one** of them: draw a box
enclosing that many squares of the ocean. Whatever you enclose is discovered,
and scores. Taking the bigger die costs air; going deeper costs more air every
turn; you get three dives and three tanks, and twenty-four turns to spend them.

**All five maps play**, each with its own rules: caves and research tracks on
Apex Predators, a submersible and a trench on 1000 Fathoms Deep, ice and a
photo track on The Polar Shelf, and fossils quarried through the rock on
Ancient Waters.

The board is **drawn, not photographed**. The artwork is Postmark's — the same
fish, the same coral, cut out as sprites — but the sea they swim in is
rendered: a depth gradient from bright surface teal down to near-black, light
falling through the surface, motes drifting in it, and every creature idling on
its own clock. Rock is built as a mass rather than a grid of squares, so a
shelf reads as a shelf. What the computer takes over is the bookkeeping:

- **Legal placements are shown before you draw.** On paper you police the rules
  yourself, and the one everybody gets wrong is that a new dive may not touch an
  earlier one *even at a corner*. Here it simply cannot happen.
- **The cost of a box is shown while you drag it** — which die you took, how
  deep you finished, whether you caught a bubble and got the turn free.
- **Scoring is live**, in the same seven categories printed down the side of the
  sheet, with the working shown at the end rather than a total to take on trust.
- **A high-score page per sheet**: the family's table for that map with your own
  row picked out, then every dive you have taken on it against your best. One
  map at a time, because the five score differently enough that a table mixing
  them compares nothing -- a 70 on the Trench is not a 70 on the reef. Across
  everyone who plays on this device, and across the family's devices when
  Firestore is reachable.
- **The bonuses you hold and the ones still out there**, in the HUD, the way the
  printed sheet keeps them beside the board with the taken ones circled. Tapping
  the strip spells them out.
- **The turn wheel**, as printed: 24 ticks, half day and half night, filling in
  behind you. A die at setup decides where you join it, and that is what decides
  how your game splits between daylight and dark.
- **Air crossed off** breath by breath, the way a pencil would.
- **Undo** for the last box, because a mis-drag on a screen is not the same
  thing as a considered pencil line.
- **Rules and scoring for the map you are on**, behind the ? in the header.
  Every sheet in the box scores differently, and on paper that panel is printed
  beside the board.
- **The artwork beside the words**, everywhere the game lists creatures: the
  scoring panel, the bonus chooser, the tracker and the result sheet all draw
  from one table in `js/icons.js`. A player halfway down an unfamiliar map is
  matching what they can see on the board to what the table says it is worth,
  which is a job for the picture rather than for the words "glass squid". The
  shoal fish follows the sheet -- butterfly on the reef, banner on Apex
  Predators, surgeonfish in the Trench.
- **A guided first expedition**, at the top of the map list. Twenty-one cards
  over about ten minutes, played on the real board with the dice scripted so
  each lesson actually comes up: buying the bigger die, what doubles are for,
  what depth costs, and the rule nobody gets right on paper — that a new dive
  may not touch an earlier one even at a corner. The engine is untouched; the
  dice are forced by handing it a random source that has been told what to say.

Solo rules are enforced as printed: all three dives must get below the first
mark on the right or the expedition failed, whatever you scored. The second and
third marks are silver and gold.

## The sprites

`tools/sprites.js` builds the ~50 sprites the board draws with, from two
sources. Postmark ship a MAP MAKER ASSETS folder of the real artwork — high
resolution, transparent, one file per symbol — which covers Maps 1 and 2. Maps
3 to 5 have no supplied art at all, so their angler fish, vents, penguins, eels
and fossils are **cut from the colour gamesheets**, which is only possible
because the extraction pipeline already knows exactly which squares each symbol
occupies.

A cut takes its **shape from the low-ink printing** and its **colour from the
colour one**. Keying the colour art alone was tried twice and does not work:
the terrain palette removes almost nothing, because a crop holds the painted
variation of the water plus the white aiming cross printed at every grid
corner, and neither is a palette entry — every sprite came out an opaque
square. Learning the background from the crop's own border does better on
bright symbols and destroys dark ones: a navy penguin sits close enough to teal
water that the flood eats straight through it, and half the set came back as
outlines with the middles missing. The low-ink sheet is the same artwork as
solid black on white, which is already an alpha mask — no threshold to tune,
and a silhouette correct by construction.

## How the maps got here

The five gamesheets are print artwork, not data. Everything the game knows
about a board — where the rock is, what creature is in which square, how many
squares a shipwreck covers — was extracted from the PNGs by `tools/`, and none
of it was typed in by hand.

    npm run maps        # extract, apply hand labels, then lint against the rules

1. **The grid** (`tools/grid.js`) is found from the "+" marks printed at every
   cell corner, by looking for the longest evenly-spaced run of lines with no
   gaps in it. Both inks of every sheet are fitted independently and made to
   agree, which is what caught The Polar Shelf reporting 25 columns where the
   rock walls faked two extra.
2. **Terrain** (`tools/terrain.js`) is the modal colour of each square's
   background, sampled in a ring outside where symbols are drawn.
3. **Symbols** (`tools/blobs.js`) are connected regions of dark ink, grouped by
   shape so that the same fish anywhere on any sheet is one decision rather than
   thirty. Five sheets of ~3,000 squares reduce to about 220 distinct pictures,
   named once each in `tools/labels/`.
4. **The lint** (`tools/lint-map.js`) checks the result against numbers the
   printed materials state outright. The Diver's Log sets challenges like
   "Discover all 4 Shipwrecks" and "Discover 12 Coral of a single colour", which
   are only sensible if the sheet holds exactly that many — so the log doubles
   as a test fixture. The rules supply the rest: colossal squid cover 7, 8 or 11
   squares, there are exactly seven hydrothermal vents, an outpost is eight.

That last step is what makes the extraction trustworthy rather than merely
plausible. Getting all three colossal squid to the right size means the grid
fit, the un-fusing of connected ink, and measuring coverage by ink rather than
by bounding box are all correct at once.

## Tests

    npm test

- **Grid** — every sheet re-fitted from the artwork and checked against the
  pinned geometry, including a differential test that a grid shifted half a cell
  explains far fewer of the printed marks. (It was shifted half a cell for an
  afternoon. The dashes drawing the −1 AIR line caught it: a depth boundary
  cannot bisect a row.)
- **Maps** — the lint above, as assertions.
- **Engine** — each placement rule on its own, asserting *why* a shape was
  refused rather than merely that it was.
- **Bot** — hundreds of games per run, checking that no move the rules refuse is
  ever offered, that every game ends, and that the score distribution still sits
  where the printed rank table says it should.
- **Storage** — the log-merge rule, which is the one piece of progress that is
  not a simple "keep the better of the two".
- **Icons** — every key the interface asks for a picture by, checked to resolve
  to a sprite that is actually on disk. A key that resolves to nothing renders
  as an empty cell and one that resolves to a missing file renders as a broken
  image; neither throws and neither logs.
- **Tutorial** — the guided expedition replayed against the real engine: every
  forced roll rolled, every gated choice looked up in the options the dice
  module actually offers, and every square the coach points at checked to be
  the square it means. A card that says "take the 5, it costs three breaths" is
  only true while the dice agree, and nothing in a browser complains when they
  stop.

## Running it

    npx http-server . -p 8122 -c-1

`?debug=1` opens the gamekit developer panel, which can play a turn or a whole
expedition. Progress writes are suppressed while it is on.

## Where things are

    js/engine/     the rules: board, shapes, dice, state, scoring
    js/engine/rules/   one module per map; map1 is the base game
    js/render/     drawing the sheet
    js/tutorial.js the guided first expedition
    js/icons.js    which picture stands for which creature
    data/          extracted boards, one per map
    assets/sprites/ the ~50 symbol sprites the board is drawn from (424KB)
    tools/         the extraction pipeline and its labels
    lib/           vendored gamekit

Built on [gamekit](../gamekit), the shared library behind the family's games.

## Status

All five maps are playable, extracted and linted. Two things are worth knowing:

- **The Trench has no dive marks.** Every other sheet prints three triangles
  down its right margin, and Map 1's solo rules send you to them: each dive
  must pass the first or the expedition failed. Map 3 puts its scoring panels
  in that margin instead and prints no marks at all. Scaling Map 1's to this
  board's depth was tried, and it invents a rule Postmark did not write — it
  also failed two games in three. Trench expeditions are judged on score alone.
- **Map 3's outpost bonuses are taken automatically** as the engine meets them.
  The printed game lets you choose one of a pair each time, which wants a
  dialogue like the shipwreck bonuses on Map 1.
