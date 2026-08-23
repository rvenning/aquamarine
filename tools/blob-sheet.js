"use strict";
// Cluster a sheet's blobs by shape and render one contact sheet of the
// distinct pictures found, so they can be named once each instead of cell by
// cell. This is the step that turns three thousand decisions into a few dozen.
//
//   node tools/blob-sheet.js map1 [out.png]

const fs = require("fs");
const path = require("path");
const { decodePNG, encodePNG } = require("../lib/tools/png.js");
const { resolve, sheet } = require("./sheets.js");
const { findBlobs, shapeDistance } = require("./blobs.js");
const { drawNum } = require("./montage.js");
const GEOM = require("./geometry.json");

const THRESHOLD = 0.035;   // shape distance below which two blobs are the same picture

// Same greedy agglomeration as before, but over blobs: biggest first, so the
// exemplars are whole symbols rather than the specks that surround them.
function clusterBlobs(blobs, threshold = THRESHOLD) {
  const order = [...blobs].sort((a, b) => b.n - a.n);
  const claimed = new Set();
  const out = [];
  for (const head of order) {
    if (claimed.has(head)) continue;
    claimed.add(head);
    const members = [head];
    for (const b of order) {
      if (claimed.has(b)) continue;
      // Size has to agree as well as shape: the descriptor is scale-normalised,
      // so a small circle and a large one look identical without this.
      const ratio = Math.max(b.w, b.h) / Math.max(head.w, head.h);
      if (ratio < 0.75 || ratio > 1.33) continue;
      if (shapeDistance(head.shape, b.shape) <= threshold) { claimed.add(b); members.push(b); }
    }
    out.push({ head, members });
  }
  return out.sort((a, b) => b.members.length - a.members.length);
}

// A blob is in play if it actually occupies a square of the board. Testing
// the blob CENTRE instead is subtly wrong for anything drawn against an edge:
// a flag whose pole runs into the margin has its centre outside the grid and
// would be thrown away along with the flag.
const inPlay = (b, g) =>
  b.covers ? b.covers.length > 0
           : b.cx >= g.x0 && b.cx <= g.x0 + g.cols * g.pitch &&
             b.cy >= g.y0 && b.cy <= g.y0 + g.rows * g.pitch;

// Which cells a blob touches, and which one it belongs to (the cell holding
// its centre). Multi-cell symbols report every square they cover.
function cellsOf(b, g) {
  const c0 = Math.floor((b.minX - g.x0) / g.pitch), c1 = Math.floor((b.maxX - g.x0) / g.pitch);
  const r0 = Math.floor((b.minY - g.y0) / g.pitch), r1 = Math.floor((b.maxY - g.y0) / g.pitch);
  const cells = [];
  for (let r = Math.max(0, r0); r <= Math.min(g.rows - 1, r1); r++)
    for (let c = Math.max(0, c0); c <= Math.min(g.cols - 1, c1); c++) cells.push([c, r]);
  return {
    cells,
    home: [
      Math.min(g.cols - 1, Math.max(0, Math.floor((b.cx - g.x0) / g.pitch))),
      Math.min(g.rows - 1, Math.max(0, Math.floor((b.cy - g.y0) / g.pitch))),
    ],
  };
}

const TILE = 72, PAD = 8, LABEL = 12;

// Draw one blob's own bounding box, letterboxed into a square tile, so the
// picture on the contact sheet is exactly what the clusterer compared.
function drawBlob(dst, dw, ox, oy, img, b) {
  const side = Math.max(b.w, b.h) * 1.1;
  const cx = b.cx - side / 2, cy = b.cy - side / 2;
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      const sx = Math.round(cx + (x / TILE) * side), sy = Math.round(cy + (y / TILE) * side);
      const o = ((oy + y) * dw + ox + x) * 4;
      let v = 255;
      if (sx >= 0 && sy >= 0 && sx < img.width && sy < img.height) {
        const i = (sy * img.width + sx) * 4;
        v = (img.rgba[i] + img.rgba[i + 1] + img.rgba[i + 2]) / 3;
        // Flatten the mid-grey furniture so only the symbol reads.
        v = v <= 100 ? 0 : v <= 235 ? 225 : 255;
      }
      dst[o] = dst[o + 1] = dst[o + 2] = v; dst[o + 3] = 255;
    }
}

function build(id) {
  const img = decodePNG(fs.readFileSync(resolve(sheet(id).read)));
  const g = GEOM[id].lowink;
  const blobs = findBlobs(img, { pitch: g.pitch, grid: g }).filter((b) => inPlay(b, g));
  const clusters = clusterBlobs(blobs);
  return { img, g, blobs, clusters };
}

if (require.main === module) {
  const id = process.argv[2] || "map1";
  const out = process.argv[3] || path.join(require("os").tmpdir(), id + "-blobs.png");
  const { img, g, blobs, clusters } = build(id);
  const cols = 12;
  const rows = Math.ceil(clusters.length / cols);
  const cw = TILE + PAD, chh = TILE + PAD + LABEL;
  const dw = cols * cw + PAD, dh = rows * chh + PAD;
  const dst = Buffer.alloc(dw * dh * 4, 255);
  for (let i = 3; i < dst.length; i += 4) dst[i] = 255;
  clusters.forEach((cl, i) => {
    const ox = PAD + (i % cols) * cw, oy = PAD + Math.floor(i / cols) * chh;
    drawBlob(dst, dw, ox, oy, img, cl.head);
    drawNum(dst, dw, ox, oy + TILE + 2, i, 2);
    drawNum(dst, dw, ox + 30, oy + TILE + 2, "" + cl.members.length, 2);
  });
  fs.writeFileSync(out, encodePNG(dw, dh, dst));
  console.log(id, "blobs", blobs.length, "clusters", clusters.length);
  console.log("sizes (cells):", clusters.slice(0, 40).map((c, i) =>
    i + ":" + (c.head.w / g.pitch).toFixed(1) + "x" + (c.head.h / g.pitch).toFixed(1) + "x" + c.members.length).join(" "));
  console.log("wrote", out, dw + "x" + dh);
}

module.exports = { clusterBlobs, cellsOf, inPlay, build, THRESHOLD };
