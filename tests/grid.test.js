"use strict";
// The grid detector, checked against the five printed sheets.
//
// Everything downstream -- what is in each cell, which cells a shape can cover,
// where a drawn box lands on screen -- is built on these five numbers per map.
// A detector that drifts half a cell produces a map that looks plausible and
// plays wrong, so the geometry is pinned in tools/geometry.json and this test
// re-derives it from the artwork and insists on agreement.
//
// It needs the print-and-play folder, which is not part of this repo. Without
// it the tests skip rather than fail: someone cloning the game to read the
// code should not see a red suite.
//
//   npm test

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");

const { decodePNG } = require("../lib/tools/png.js");
const { resolve, SHEETS } = require("../tools/sheets.js");
const { findCrosses, fitLattice } = require("../tools/grid.js");
const { findBlobs } = require("../tools/blobs.js");
const { inPlay } = require("../tools/blob-sheet.js");
const { depthLines } = require("../tools/extract-map.js");
const PINNED = require("../tools/geometry.json");
const lowink = (id) => PINNED[id].lowink;

const have = (s) => fs.existsSync(resolve(s.read));
const cache = new Map();
const load = (s) => {
  if (!cache.has(s.id)) cache.set(s.id, decodePNG(fs.readFileSync(resolve(s.read))));
  return cache.get(s.id);
};

for (const s of SHEETS) {
  test(s.id + ": geometry matches what is pinned", { skip: !have(s) && "no print-and-play folder" }, () => {
    const g = fitLattice(load(s));
    const p = lowink(s.id);
    // Map 4 is the exception: its low-ink edges fake two extra columns, so the
    // pinned block there is the colour fit. tools/fit-geometry.js records why.
    const overridden = (PINNED[s.id].notes || []).length > 0;
    // Only the pitch is comparable on an overridden sheet. The whole point of
    // the override is that this fit found a different origin and a different
    // number of columns, so asserting on them here would just re-fail.
    assert.ok(Math.abs(g.pitch - p.pitch) < 0.05, `pitch ${g.pitch} vs ${p.pitch}`);
    if (overridden) return;
    assert.equal(g.cols, p.cols, "columns");
    assert.equal(g.rows, p.rows, "rows");
    assert.ok(Math.abs(g.x0 - p.x0) < 1.5, `x0 ${g.x0} vs ${p.x0}`);
    assert.ok(Math.abs(g.y0 - p.y0) < 1.5, `y0 ${g.y0} vs ${p.y0}`);
  });

  test(s.id + ": the phase is uniquely right", { skip: !have(s) && "no print-and-play folder" }, () => {
    const p = lowink(s.id);
    const marks = findCrosses(load(s));
    // Rock hatching inside the play area throws its own weak cross responses,
    // so "most detections sit on a corner" is not a property these sheets have
    // and never was -- an earlier version of this test asserted it and failed
    // on all five maps while the geometry was in fact correct.
    //
    // The property that does hold is that the RIGHT phase explains far more
    // corners than a wrong one. Count grid corners with a detection on them,
    // then do the same for a grid nudged half a cell in each direction. A
    // half-cell slip is the failure mode that matters -- it is exactly the one
    // this project shipped for an afternoon -- and it shows up here as the
    // shifted grids scoring as well as the real one.
    const covered = (dx, dy) => {
      let n = 0;
      for (let c = 0; c <= p.cols; c++)
        for (let r = 0; r <= p.rows; r++) {
          const cx = p.x0 + c * p.pitch + dx, cy = p.y0 + r * p.pitch + dy;
          if (marks.some((m) => Math.abs(m.x - cx) < 4 && Math.abs(m.y - cy) < 4)) n++;
        }
      return n / ((p.cols + 1) * (p.rows + 1));
    };
    const on = covered(0, 0);
    const half = p.pitch / 2;
    const off = Math.max(covered(half, 0), covered(0, half), covered(half, half));
    assert.ok(on > 0.35, `only ${(on * 100).toFixed(0)}% of grid corners carry a cross`);
    assert.ok(on > off * 3, `phase is ambiguous: ${on.toFixed(2)} on-grid vs ${off.toFixed(2)} shifted`);
  });

  test(s.id + ": the depth lines land on cell boundaries", { skip: !have(s) && "no print-and-play folder" }, () => {
    // The -1 AIR and -2 AIR lines are drawn as a row of short dashes straight
    // across the sheet, and they mark a boundary between depths -- so they run
    // ALONG a cell edge, never through the middle of a row.
    //
    // That makes them an independent check on the phase, and a decisive one:
    // this is the measurement that caught the half-cell error. With the grid
    // offset, every dash sat at 0.496 of a row instead of 0.00.
    const p = lowink(s.id);
    const blobs = findBlobs(load(s), { pitch: p.pitch }).filter((b) => inPlay(b, p));
    const lines = depthLines(blobs, p);
    // The Trench sheet is the exception. It does not charge by two dashed
    // lines at all -- it has depth REGIONS costing 2 or 3 energy, drawn as
    // banded backgrounds rather than as a rule across the page -- so there is
    // nothing here for this detector to find, and its depths are tagged by
    // hand instead. Every other sheet prints the -1 AIR / -2 AIR pair.
    if (s.id !== "map3") assert.ok(lines.length >= 2, `expected two depth lines, found ${lines.length}`);
    for (const l of lines) assert.ok(Number.isInteger(l.row), "depth line off-grid: " + l.row);
    // Both lines are inside the play area with water above and below; a line
    // hard against an edge would mean the grid, not the sheet, is wrong.
    for (const l of lines) assert.ok(l.row > 0 && l.row < p.rows, "depth line at the edge: " + l.row);
  });

  test(s.id + ": the grid sits inside the sheet", { skip: !have(s) && "no print-and-play folder" }, () => {
    const p = lowink(s.id);
    assert.equal(p.sheet.w, load(s).width);
    assert.equal(p.sheet.h, load(s).height);
    assert.ok(p.x0 >= 0 && p.y0 >= 0, "grid starts off the page");
    assert.ok(p.x0 + p.cols * p.pitch <= p.sheet.w, "grid runs off the right edge");
    assert.ok(p.y0 + p.rows * p.pitch <= p.sheet.h, "grid runs off the bottom edge");
    // The sheets centre their play area horizontally; a fit that has slipped a
    // column shows up here as lopsided margins long before anyone notices in
    // the game.
    const right = p.sheet.w - (p.x0 + p.cols * p.pitch);
    if (s.id !== "map3") assert.ok(Math.abs(right - p.x0) < p.pitch * 0.5, `margins ${p.x0} vs ${right}`);
  });
}
