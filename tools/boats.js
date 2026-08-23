"use strict";
// Where the three boats sit, and which four squares each one launches into.
//
// A dive can only begin in one of the four squares directly below a boat, so
// these twelve cells per map are the entrance to the whole game. They are not
// symbols and they are not terrain: the boats are drawn above the waterline,
// outside the grid, and what marks the launch squares is the hull's shadow
// falling across the top row.
//
// The shadow only reads at the very top of that row. The wavy waterline is
// painted over it a fifth of the way down and the water lightens again below,
// so a sample taken mid-cell -- the obvious place -- finds two columns of a
// four-column boat. Sampling in the top eighth finds all four cleanly.

const { decodePNG } = require("../lib/tools/png.js");
const GEOM = require("./geometry.json");

const DEPTH = 0.06;    // how far down the top row to sample, in cells
const DARKER = 12;     // how much darker than open water the hull shadow is
const BOAT_WIDTH = 4;  // squares below each boat -- the rules are explicit about this
const BOAT_COUNT = 3;

function rowSample(img, g, frac) {
  const { width: w, rgba } = img;
  const y = Math.round(g.y0 + frac * g.pitch);
  const out = [];
  for (let c = 0; c < g.cols; c++) {
    let r = 0, gg = 0, b = 0, n = 0;
    const x0 = Math.round(g.x0 + (c + 0.25) * g.pitch);
    const x1 = Math.round(g.x0 + (c + 0.75) * g.pitch);
    for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 4;
      r += rgba[i]; gg += rgba[i + 1]; b += rgba[i + 2]; n++;
    }
    out.push({ col: c, lum: (r + gg + b) / (3 * n) });
  }
  return out;
}

function findBoats(id, colourPath) {
  const img = decodePNG(require("fs").readFileSync(colourPath));
  const g = GEOM[id].colour;
  const cols = rowSample(img, g, DEPTH);
  const lums = cols.map((c) => c.lum).sort((a, b) => a - b);
  const water = lums[Math.floor(lums.length * 0.6)];    // open water dominates
  const shaded = cols.filter((c) => c.lum < water - DARKER).map((c) => c.col);

  // Group the shaded columns into runs; each run is one boat.
  const runs = [];
  for (const c of shaded) {
    const last = runs[runs.length - 1];
    if (last && c === last[last.length - 1] + 1) last.push(c);
    else runs.push([c]);
  }

  // Every boat covers exactly four squares -- the rules say so, and four of
  // the five sheets measure that way at every threshold tried. Where a run
  // comes up short, the missing column is at one end and is simply the one
  // where the hull tapers; take whichever neighbour is darker until the run
  // is four wide. Trimming works the same way from the lighter end.
  const byCol = new Map(cols.map((c) => [c.col, c.lum]));
  for (const run of runs) {
    while (run.length < BOAT_WIDTH) {
      const before = byCol.get(run[0] - 1);
      const after = byCol.get(run[run.length - 1] + 1);
      if (before === undefined && after === undefined) break;
      if (after === undefined || (before !== undefined && before <= after)) run.unshift(run[0] - 1);
      else run.push(run[run.length - 1] + 1);
    }
    while (run.length > BOAT_WIDTH) {
      if (byCol.get(run[0]) > byCol.get(run[run.length - 1])) run.shift();
      else run.pop();
    }
  }
  return { runs, shaded, cols };
}

if (require.main === module) {
  const { resolve, SHEETS } = require("./sheets.js");
  for (const s of SHEETS) {
    const { runs } = findBoats(s.id, resolve(s.ship));
    const ok = runs.length === BOAT_COUNT && runs.every((r) => r.length === BOAT_WIDTH);
    console.log(s.id.padEnd(5), ok ? "OK  " : "HUH ",
      runs.map((r) => "[" + r.join(",") + "]").join(" "));
  }
}

module.exports = { findBoats, rowSample, BOAT_WIDTH, BOAT_COUNT };
