"use strict";
// What each cell is MADE OF, read off the colour sheet.
//
// Symbols are best read from the low-ink artwork -- clean black shapes on
// white, nothing to confuse an outline. Terrain is the opposite. In low ink,
// rock is a grey wavy hatch and open water is a slightly sparser grey wavy
// hatch, and telling them apart means measuring texture. In colour they are
// dark teal and light teal, and telling them apart is a subtraction.
//
// So each sheet gets read twice, once per ink. The two files are the same
// artwork at different scales -- exactly 4:3 on every map -- so the grid
// geometry carries across by ratio.

const { decodePNG } = require("../lib/tools/png.js");
const GEOM = require("./geometry.json");

// The modal colour of a cell's BACKGROUND.
//
// Mode rather than mean or median, because the question is what the square is
// made of and a creature printed on top would drag an average anywhere.
//
// And sampled from a ring rather than the middle, because with the grid
// correctly aligned every symbol sits dead centre -- so the middle of a cell
// is the LEAST reliable place to ask. Reading the centre put orange coral
// into Map 1's terrain palette as a category of its own, forty-one cells of
// it. The ring is inside the cell but outside where symbols are drawn, which
// is where the background always shows.
const CUBE = 12;       // quantisation per channel when finding the mode
const RING_IN = 0.30;  // ring starts this far out from the centre (of cell size)
const RING_OUT = 0.45; // ...and stops here, short of the neighbouring square

function modalColour(img, box) {
  const { width: w, rgba } = img;
  const cx = box.x + box.size / 2, cy = box.y + box.size / 2;
  const bins = new Map();
  let total = 0;
  const x0 = Math.round(box.x), x1 = Math.round(box.x + box.size);
  const y0 = Math.round(box.y), y1 = Math.round(box.y + box.size);
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
      // Chebyshev distance keeps the ring square, matching the cell.
      const d = Math.max(Math.abs(x + 0.5 - cx), Math.abs(y + 0.5 - cy)) / box.size;
      if (d < RING_IN || d > RING_OUT) continue;
      const i = (y * w + x) * 4;
      const key = ((rgba[i] / CUBE) | 0) * 65536 + ((rgba[i + 1] / CUBE) | 0) * 256 + ((rgba[i + 2] / CUBE) | 0);
      const b = bins.get(key);
      if (b) { b.n++; b.r += rgba[i]; b.g += rgba[i + 1]; b.b += rgba[i + 2]; }
      else bins.set(key, { n: 1, r: rgba[i], g: rgba[i + 1], b: rgba[i + 2] });
      total++;
    }
  let best = null;
  for (const b of bins.values()) if (!best || b.n > best.n) best = b;
  if (!best) return { r: 255, g: 255, b: 255, share: 0 };
  return { r: best.r / best.n, g: best.g / best.n, b: best.b / best.n, share: best.n / total };
}

// Grid geometry in the colour sheet's own pixels. This used to be derived by
// scaling the low-ink fit, on the assumption that the two inks were the same
// artwork at one factor. Four maps are; the Trench sheet is cropped
// differently in colour (1.3333 across, 1.3426 down), so the scaled grid
// drifted a row out by the bottom of the page. Both inks are now fitted
// independently by tools/fit-geometry.js and this just reads the answer.
function colourGeometry(id) {
  return GEOM[id].colour;
}

function cellColours(id, colourPath) {
  const img = decodePNG(require("fs").readFileSync(colourPath));
  const g = colourGeometry(id);
  const out = [];
  for (let row = 0; row < g.rows; row++)
    for (let col = 0; col < g.cols; col++) {
      const box = { x: g.x0 + col * g.pitch, y: g.y0 + row * g.pitch, size: g.pitch };
      out.push({ col, row, ...modalColour(img, box) });
    }
  return { img, geom: g, cells: out };
}

// Group cells by background colour. The palette of a sheet is tiny and its
// members are far apart -- water, rock, and on later maps cave shadow, ice and
// the trench -- so a fixed radius separates them without any tuning.
const RADIUS = 26;
function paletteOf(cells) {
  const groups = [];
  for (const c of cells) {
    const hit = groups.find((g) => Math.hypot(g.r - c.r, g.g - c.g, g.b - c.b) < RADIUS);
    if (hit) {
      hit.n++;
      hit.r += (c.r - hit.r) / hit.n; hit.g += (c.g - hit.g) / hit.n; hit.b += (c.b - hit.b) / hit.n;
      hit.cells.push(c);
    } else groups.push({ r: c.r, g: c.g, b: c.b, n: 1, cells: [c] });
  }
  return groups.sort((a, b) => b.n - a.n);
}

module.exports = { modalColour, colourGeometry, cellColours, paletteOf };

// Fitting the grid on a COLOUR sheet directly.
//
// The two inks were assumed to be the same artwork at a clean scale factor,
// and on four maps they are -- exactly 4:3. The Trench sheet is not: its
// colour version is cropped differently (1.3333 across, 1.3426 down), so
// scaling the low-ink fit puts the grid a row out by the bottom of the page.
//
// Rather than special-case one map, find the grid where it is. The same aiming
// crosses are printed on the colour sheets in white on teal, so mapping "near
// white" to ink and everything else to paper hands the existing detector an
// image it already knows how to read.
function whiteCrossView(img) {
  const { width, height, rgba } = img;
  const view = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const p = i * 4;
    const white = rgba[p] > 225 && rgba[p + 1] > 225 && rgba[p + 2] > 225;
    const v = white ? 0 : 255;
    view[p] = view[p + 1] = view[p + 2] = v;
    view[p + 3] = 255;
  }
  return { width, height, rgba: view };
}

function fitColourGrid(img) {
  const { findCrosses, cluster, longestRun } = require("./grid.js");
  const marks = findCrosses(whiteCrossView(img));
  const fx = longestRun(cluster(marks.map((m) => m.x), 10));
  const fy = longestRun(cluster(marks.map((m) => m.y), 10));
  const pitch = (fx.pitch + fy.pitch) / 2;
  return {
    x0: fx.first, y0: fy.first, pitch,
    cols: fx.lines - 1, rows: fy.lines - 1,
  };
}

module.exports.whiteCrossView = whiteCrossView;
module.exports.fitColourGrid = fitColourGrid;
