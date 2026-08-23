"use strict";
// Cropping the printed sheet into cells, and describing each one well enough
// to tell two symbols apart.
//
// The classifier deliberately does NOT match against the icon files in the
// print-and-play's MAP MAKER ASSETS folder. Those cover Maps 1 and 2 only --
// there is no artwork shipped for angler fish, vents, penguins, krill, eels,
// nautilus or ice -- so a template matcher built on them would work on two
// sheets and leave three to be typed in by hand.
//
// Clustering the cells against each other works on all five. Every sheet draws
// each symbol from the same source art at the same size, so two cells holding
// the same creature are near-identical bitmaps, and the whole map collapses to
// a few dozen distinct pictures. Label those once and the labels propagate.

const { decodePNG } = require("../lib/tools/png.js");
const GEOM = require("./geometry.json");
const lowink = (id) => GEOM[id].lowink;

const N = 24;          // feature grid: each cell downsampled to N x N greys

// Cell (col, row) as a box in sheet pixels.
function cellBox(geom, col, row) {
  return {
    x: geom.x0 + col * geom.pitch,
    y: geom.y0 + row * geom.pitch,
    size: geom.pitch,
  };
}

// Average-pool a cell into two channels, each N x N of coverage in 0..1.
//
// The split is the whole trick. A luminance histogram of any sheet is sharply
// bimodal: the creatures and objects are solid black, while everything
// structural -- water rules, rock hatching, cave shading, the printed aiming
// crosses -- is mid grey. Pooled together they are one blurry picture and two
// cells holding the same fish cluster apart because the hatching behind them
// differs; the first attempt at this produced 305 clusters for 529 cells.
//
// So DARK carries what is in the cell and MID carries what the cell is made
// of. Symbols are matched on the first and terrain is read off the second.
const DARK_MAX = 100;     // at or below this luminance is a printed symbol
const MID_MAX = 235;      // between the two is structural furniture

function patchOf(img, geom, col, row) {
  const { width: w, height: h, rgba } = img;
  const b = cellBox(geom, col, row);
  const dark = new Float32Array(N * N);
  const mid = new Float32Array(N * N);
  const step = b.size / N;
  for (let py = 0; py < N; py++)
    for (let px = 0; px < N; px++) {
      let d = 0, m = 0, n = 0;
      const x1 = b.x + px * step, y1 = b.y + py * step;
      for (let y = Math.floor(y1); y < y1 + step; y++)
        for (let x = Math.floor(x1); x < x1 + step; x++) {
          if (x < 0 || y < 0 || x >= w || y >= h) continue;
          const i = (y * w + x) * 4;
          const lum = (rgba[i] + rgba[i + 1] + rgba[i + 2]) / 3;
          if (lum <= DARK_MAX) d++;
          else if (lum <= MID_MAX) m++;
          n++;
        }
      const k = py * N + px;
      dark[k] = n ? d / n : 0;
      mid[k] = n ? m / n : 0;
    }
  return { dark, mid };
}

// Mean absolute difference between two patches. Plain and unnormalised on
// purpose: the sheets are printed at one scale with one ink, so two cells
// holding the same symbol differ only by the water hatching behind it, and
// scaling the comparison would let that noise dominate.
function distance(a, b) {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]);
  return d / a.length;
}

const inkOf = (p) => p.reduce((a, b) => a + b, 0) / p.length;

function loadSheet(id, resolvePath) {
  const img = decodePNG(require("fs").readFileSync(resolvePath));
  const geom = lowink(id);
  const cells = [];
  for (let row = 0; row < geom.rows; row++)
    for (let col = 0; col < geom.cols; col++)
      cells.push({ col, row, ...patchOf(img, geom, col, row) });
  for (const c of cells) { c.ink = inkOf(c.dark); c.grey = inkOf(c.mid); }
  return { img, geom, cells };
}

module.exports = { N, cellBox, patchOf, distance, inkOf, loadSheet };
