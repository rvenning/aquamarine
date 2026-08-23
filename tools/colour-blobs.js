"use strict";
// Finding symbols by colour on the full-colour sheet.
//
// The low-ink blob finder is the workhorse, but it has one blind spot it
// cannot fix: symbols printed ON TOP of other symbols. Map 2 draws its
// research icons across the bodies of the colossal squid, so their ink is
// connected to the squid's and a flood fill returns the squid alone -- three
// research icons quietly absorbed, and a scoring track the player could never
// fill.
//
// Colour separates what connectivity cannot. The research magnifier is printed
// in one flat, saturated yellow that appears nowhere else on the sheet except
// the flag badges, and those are told apart by size. So: threshold the colour
// sheet for a target hue, label what is left, and read off the cells.

const { decodePNG } = require("../lib/tools/png.js");
const { components } = require("./blobs.js");
const GEOM = require("./geometry.json");

// Distance in RGB, which is crude but adequate: these are flat vector fills
// with no shading, and the palette entries are far apart.
const near = (rgba, i, target, tol) =>
  Math.abs(rgba[i] - target[0]) <= tol &&
  Math.abs(rgba[i + 1] - target[1]) <= tol &&
  Math.abs(rgba[i + 2] - target[2]) <= tol;

function colourMask(img, grid, target, tol) {
  const { width: w, height: h, rgba } = img;
  const mask = new Uint8Array(w * h);
  const x0 = Math.max(0, Math.round(grid.x0)), y0 = Math.max(0, Math.round(grid.y0));
  const x1 = Math.min(w, Math.round(grid.x0 + grid.cols * grid.pitch));
  const y1 = Math.min(h, Math.round(grid.y0 + grid.rows * grid.pitch));
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++)
      if (near(rgba, (y * w + x) * 4, target, tol)) mask[y * w + x] = 1;
  return mask;
}

// Blobs of one colour, each reported with the cell holding its centre and its
// size relative to a cell -- which is what tells a research magnifier from a
// flag badge, both being the same yellow.
function findColour(id, colourPath, target, { tol = 26, minPx = 200 } = {}) {
  const img = decodePNG(require("fs").readFileSync(colourPath));
  const g = GEOM[id].colour;
  const parts = components(colourMask(img, g, target, tol), img.width, img.height)
    .filter((p) => p.n >= minPx);
  return parts.map((p) => {
    const cx = (p.minX + p.maxX) / 2, cy = (p.minY + p.maxY) / 2;
    return {
      cell: [Math.floor((cx - g.x0) / g.pitch), Math.floor((cy - g.y0) / g.pitch)],
      w: +((p.maxX - p.minX + 1) / g.pitch).toFixed(2),
      h: +((p.maxY - p.minY + 1) / g.pitch).toFixed(2),
      px: p.n,
    };
  }).sort((a, b) => a.cell[1] - b.cell[1] || a.cell[0] - b.cell[0]);
}

if (require.main === module) {
  const { resolve, sheet } = require("./sheets.js");
  const [id, r, g, b, tol] = process.argv.slice(2);
  const hits = findColour(id, resolve(sheet(id).ship), [+r, +g, +b], { tol: tol ? +tol : 26 });
  console.log(hits.length + " blobs of rgb(" + [r, g, b] + "):");
  const bySize = {};
  for (const h of hits) {
    const key = h.w.toFixed(1) + "x" + h.h.toFixed(1);
    (bySize[key] = bySize[key] || []).push(h.cell.join(","));
  }
  for (const [size, cells] of Object.entries(bySize).sort((a, b) => b[1].length - a[1].length))
    console.log("  " + size.padEnd(9) + " x" + String(cells.length).padStart(3) + "  " + cells.join(" "));
}

module.exports = { findColour, colourMask };
