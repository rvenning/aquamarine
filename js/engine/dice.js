"use strict";
// The dice, and the choice they present.
//
// Two d6 are rolled and you pick ONE value to draw with. Taking the higher die
// costs air equal to the gap between them, so the roll is really an offer: a
// bigger box, or a cheaper one. Doubles are the exception that makes the game
// -- no air at all, two extra squares, and the only chance you get to draw
// something other than a rectangle.
//
// Later maps add options rather than replacing them. The Trench lets you spend
// the higher die to draw the SUM of both, and The Polar Shelf's powers add one
// to a value without changing what it costs. Both arrive as extra entries in
// the same list, so the rest of the game never learns about them.

window.AQ = window.AQ || {};

AQ.Dice = (() => {
  // A seeded roll, so a game can be replayed, shared, or reproduced from a bug
  // report. `rng` returns a float in [0, 1) -- gamekit's seeded generator.
  function roll(rng) {
    return [1 + Math.floor(rng() * 6), 1 + Math.floor(rng() * 6)];
  }

  // What a roll offers. Each option is what the player is choosing between:
  //   size     squares the shape must cover
  //   air      breaths the choice itself costs (depth is added later)
  //   freeform whether the shape may be something other than a rectangle
  function options([a, b], extras) {
    const lo = Math.min(a, b), hi = Math.max(a, b);
    if (a === b)
      return [{
        id: "double", label: "Double " + a, size: a + 2, air: 0, freeform: true,
        note: "two squares bigger, no air, and any shape you like",
      }];

    const out = [
      { id: "low", label: "Take the " + lo, size: lo, air: 0, freeform: false },
      {
        id: "high", label: "Take the " + hi, size: hi, air: hi - lo, freeform: false,
        note: "costs " + (hi - lo) + " air",
      },
    ];
    for (const extra of extras || []) {
      const built = extra(lo, hi);
      if (built) out.push(built);
    }
    return out;
  }

  // The Trench: draw the sum of both dice and pay the higher one in energy.
  const sumOption = (lo, hi) => ({
    id: "sum", label: "Take both (" + (lo + hi) + ")", size: lo + hi, air: hi, freeform: false,
    note: "costs " + hi + " energy",
  });

  return { roll, options, sumOption };
})();
