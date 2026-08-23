"use strict";
// Draw a candidate lattice over a gamesheet and write a PNG to look at.
// Grid detection is the kind of thing that is either exactly right or
// uselessly wrong, and the fastest way to tell which is to see it.
//
//   node tools/overlay.js map1 [outfile]

const fs = require("fs");
const path = require("path");
const { decodePNG, encodePNG } = require("../lib/tools/png.js");
const { resolve, sheet } = require("./sheets.js");
const GEOM = require("./geometry.json");

function overlay(img, geom, scale = 2) {
  const { width: w, height: h, rgba } = img;
  const ow = Math.floor(w / scale), oh = Math.floor(h / scale);
  const out = Buffer.alloc(ow * oh * 4);
  for (let y = 0; y < oh; y++)
    for (let x = 0; x < ow; x++) {
      const i = ((y * scale) * w + x * scale) * 4, o = (y * ow + x) * 4;
      // Fade the sheet so the overlay reads on top of it.
      out[o] = 128 + rgba[i] / 2; out[o + 1] = 128 + rgba[i + 1] / 2;
      out[o + 2] = 128 + rgba[i + 2] / 2; out[o + 3] = 255;
    }
  const dot = (x, y, r, g, b) => {
    const px = Math.round(x / scale), py = Math.round(y / scale);
    if (px < 0 || py < 0 || px >= ow || py >= oh) return;
    const o = (py * ow + px) * 4;
    out[o] = r; out[o + 1] = g; out[o + 2] = b;
  };
  const { x0, y0, pitch, cols, rows } = geom;
  for (let c = 0; c <= cols; c++)
    for (let y = y0; y <= y0 + rows * pitch; y++) dot(x0 + c * pitch, y, 255, 0, 0);
  for (let r = 0; r <= rows; r++)
    for (let x = x0; x <= x0 + cols * pitch; x++) dot(x, y0 + r * pitch, 255, 0, 0);
  // Cell centres in blue, so it is obvious whether icons sit in cells.
  for (let c = 0; c < cols; c++)
    for (let r = 0; r < rows; r++) {
      const cx = x0 + (c + 0.5) * pitch, cy = y0 + (r + 0.5) * pitch;
      for (let d = -2; d <= 2; d++) { dot(cx + d * scale, cy, 0, 80, 255); dot(cx, cy + d * scale, 0, 80, 255); }
    }
  return { ow, oh, out };
}

if (require.main === module) {
  const id = process.argv[2] || "map1";
  const dest = process.argv[3] || path.join(require("os").tmpdir(), id + "-grid.png");
  const img = decodePNG(fs.readFileSync(resolve(sheet(id).read)));
  const geom = GEOM[id].lowink;
  console.log(id, JSON.stringify(geom));
  const { ow, oh, out } = overlay(img, geom);
  fs.writeFileSync(dest, encodePNG(ow, oh, out));
  console.log("wrote", dest, ow + "x" + oh);
}

module.exports = { overlay };
