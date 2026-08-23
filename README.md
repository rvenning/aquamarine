# Aquamarine

A digital adaptation of **Aquamarine**, the print-and-play roll-and-write by
[Postmark Games](https://postmarkgames.com), designed by Matthew Dunstan and
Rory Muldoon.

**[▶ Open it](https://rvenning.github.io/aquamarine/)**

> This is an unofficial personal adaptation, built from a purchased copy of the
> print-and-play for one family's use. It is not affiliated with, endorsed by,
> or connected to Postmark Games. The board artwork is theirs. If you want the
> game — and you should, it is lovely on paper — buy it from them.
>
> Deliberately not linked from the family games hub.

## What it does

Two dice are rolled each turn and you take **one** of them: draw a box
enclosing that many squares of the ocean. Whatever you enclose is discovered,
and scores. Taking the bigger die costs air; going deeper costs more air every
turn; you get three dives and three tanks, and twenty-four turns to spend them.

The board is the printed gamesheet — the real artwork, at full resolution, with
your dive drawn over it. What the computer takes over is the bookkeeping:

- **Legal placements are shown before you draw.** On paper you police the rules
  yourself, and the one everybody gets wrong is that a new dive may not touch an
  earlier one *even at a corner*. Here it simply cannot happen.
- **The cost of a box is shown while you drag it** — which die you took, how
  deep you finished, whether you caught a bubble and got the turn free.
- **Scoring is live**, in the same seven categories printed down the side of the
  sheet, with the working shown at the end rather than a total to take on trust.
- **A logbook** per map: a high-score table across everyone who plays on this
  device (and across the family's devices when Firestore is reachable), plus
  every previous expedition with its score, rank and medal.

Solo rules are enforced as printed: all three dives must get below the first
mark on the right or the expedition failed, whatever you scored. The second and
third marks are silver and gold.

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

## Running it

    npx http-server . -p 8122 -c-1

`?debug=1` opens the gamekit developer panel, which can play a turn or a whole
expedition. Progress writes are suppressed while it is on.

## Where things are

    js/engine/     the rules: board, shapes, dice, state, scoring
    js/engine/rules/   one module per map; map1 is the base game
    js/render/     drawing the sheet
    data/          extracted boards, one per map
    assets/        the gamesheets as WebP (22.8MB of PNG becomes 3.0MB)
    tools/         the extraction pipeline and its labels
    lib/           vendored gamekit

Built on [gamekit](../gamekit), the shared library behind the family's games.

## Status

Map 1 (Exploratory Expedition) is playable. Maps 2 to 5 are extracted, linted
and waiting on their rules modules — caves and research tracks, the Trench and
its energy budget, ice and the photo track, and fossils quarried out of the
rock.
