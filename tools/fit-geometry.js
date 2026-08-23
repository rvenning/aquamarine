"use strict";
// Fit the grid on both inks of every sheet and write tools/geometry.json.
//
// Each sheet is measured twice and the two answers are compared, because a
// single fit has no way to know it has been fooled. On The Polar Shelf the
// low-ink fit reported 25 columns: the vertical hatching of the rock walls
// down either edge threw a line of false crosses that landed within tolerance
// of where a 24th and 25th column would be. The colour sheet, where the page
// margin outside the play area is plainly white, reported 23 -- and 23 is
// right. Two independent readings that agree are evidence; one is a guess.
//
// The colour sheet is authoritative when they disagree: it is the artwork the
// game actually renders, and its play area has an unambiguous edge.
//
//   node tools/fit-geometry.js [--write]

const fs = require("fs");
const path = require("path");
const { decodePNG } = require("../lib/tools/png.js");
const { resolve, SHEETS } = require("./sheets.js");
const { findCrosses, cluster, longestRun } = require("./grid.js");
const { whiteCrossView } = require("./terrain.js");

function fit(img, view) {
  const marks = findCrosses(view || img);
  const fx = longestRun(cluster(marks.map((m) => m.x), 10));
  const fy = longestRun(cluster(marks.map((m) => m.y), 10));
  const pitch = (fx.pitch + fy.pitch) / 2;   // the printed cells are square
  // The crosses are printed at cell CORNERS, so N lines bound N-1 cells and
  // the grid origin is the first line itself.
  //
  // This was got backwards at first -- the crosses look like aiming marks you
  // would put in the middle of a square -- and the resulting grid, offset by
  // half a cell, survived an eyeball check of the overlay because a half-cell
  // error looks like a rendering nicety rather than a mistake. Two pieces of
  // pixel evidence settled it: the dashes that draw the -1 AIR and -2 AIR
  // lines sat exactly on cross rows rather than between them, and every edge
  // of every rock block on the colour sheet lands on a cross to within a
  // pixel. Rock is drawn cell by cell, so its edges ARE cell boundaries.
  return {
    sheet: { w: img.width, h: img.height },
    cols: fx.lines - 1, rows: fy.lines - 1,
    x0: +fx.first.toFixed(3),
    y0: +fy.first.toFixed(3),
    pitch: +pitch.toFixed(4),
  };
}

function fitSheet(s) {
  const lowImg = decodePNG(fs.readFileSync(resolve(s.read)));
  const colImg = decodePNG(fs.readFileSync(resolve(s.ship)));
  const colour = fit(colImg, whiteCrossView(colImg));
  let lowink = fit(lowImg);
  const notes = [];
  if (lowink.cols !== colour.cols || lowink.rows !== colour.rows) {
    if (lowImg.width === colImg.width && lowImg.height === colImg.height) {
      notes.push(`low-ink fit said ${lowink.cols}x${lowink.rows}; the sheets are the same size, so the colour fit is used for both`);
      lowink = { ...colour, sheet: lowink.sheet };
    } else {
      throw new Error(
        `${s.id}: the two inks disagree (${lowink.cols}x${lowink.rows} vs ${colour.cols}x${colour.rows}) ` +
        `and are different sizes, so neither can stand in for the other. Check the overlay renders.`);
    }
  }
  return { lowink, colour, notes };
}

if (require.main === module) {
  const out = {
    _: "Grid geometry per gamesheet, fitted by tools/fit-geometry.js and confirmed against tools/overlay.js renders. Two blocks per map: `lowink` is pixels of the low-ink file (what the symbol extractor reads) and `colour` is pixels of the full-colour file (what the game renders). tests/grid.test.js re-fits both and fails if the detector drifts.",
  };
  for (const s of SHEETS) {
    const { lowink, colour, notes } = fitSheet(s);
    out[s.id] = { cols: colour.cols, rows: colour.rows, lowink, colour };
    if (notes.length) out[s.id].notes = notes;
    console.log(s.id.padEnd(5), (colour.cols + "x" + colour.rows).padEnd(7),
      "lowink pitch " + lowink.pitch.toFixed(2).padStart(7) + " @ " + lowink.x0.toFixed(0) + "," + lowink.y0.toFixed(0),
      " colour pitch " + colour.pitch.toFixed(2).padStart(7) + " @ " + colour.x0.toFixed(0) + "," + colour.y0.toFixed(0),
      notes.length ? " <- " + notes[0] : "");
  }
  if (process.argv.includes("--write")) {
    fs.writeFileSync(path.join(__dirname, "geometry.json"), JSON.stringify(out, null, 2) + "\n");
    console.log("\nwrote tools/geometry.json");
  } else console.log("\n(dry run -- pass --write to update tools/geometry.json)");
}

module.exports = { fitSheet, fit };
