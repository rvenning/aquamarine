"use strict";
// Render every distinct printed picture a map contains, in colour, numbered.
//
// The extractor groups the sheet's ink into "kinds" -- one entry per distinct
// picture, with every place it appears. This draws those kinds so they can be
// named. Fifty tiles per map replaces three thousand cells, and that is the
// whole point of the pipeline.
//
// Drawn from the COLOUR artwork rather than the low ink the clusterer read,
// because colour is what tells the two corals apart, and a penguin from a fish.
//
//   node tools/kinds-sheet.js map1 [out.png]

const fs = require("fs");
const path = require("path");
const { decodePNG, encodePNG } = require("../lib/tools/png.js");
const { resolve, sheet } = require("./sheets.js");
const { drawNum } = require("./montage.js");
const GEOM = require("./geometry.json");

const TILE = 110, PAD = 10, LABEL = 16, COLS = 10;

function build(id, out) {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", id + ".json"), "utf8"));
  const img = decodePNG(fs.readFileSync(resolve(sheet(id).ship)));
  const g = GEOM[id].colour;
  const kinds = data.kinds;
  const rows = Math.ceil(kinds.length / COLS);
  const cw = TILE + PAD, ch = TILE + PAD + LABEL;
  const dw = COLS * cw + PAD, dh = rows * ch + PAD;
  const dst = Buffer.alloc(dw * dh * 4, 245);
  for (let i = 3; i < dst.length; i += 4) dst[i] = 255;

  kinds.forEach((k, i) => {
    const ox = PAD + (i % COLS) * cw, oy = PAD + Math.floor(i / COLS) * ch;
    // Frame the kind's first appearance by the cells it covers, so a
    // multi-cell symbol is shown whole rather than cropped to one square.
    const spot = k.at[0];
    const cells = spot.cells || [spot.home];
    const c0 = Math.min(...cells.map((c) => c[0])), c1 = Math.max(...cells.map((c) => c[0]));
    const r0 = Math.min(...cells.map((c) => c[1])), r1 = Math.max(...cells.map((c) => c[1]));
    const side = Math.max(c1 - c0 + 1, r1 - r0 + 1) * g.pitch;
    const sx0 = g.x0 + (c0 + (c1 - c0 + 1) / 2) * g.pitch - side / 2;
    const sy0 = g.y0 + (r0 + (r1 - r0 + 1) / 2) * g.pitch - side / 2;
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        const sx = Math.round(sx0 + (x / TILE) * side), sy = Math.round(sy0 + (y / TILE) * side);
        const o = ((oy + y) * dw + ox + x) * 4;
        if (sx < 0 || sy < 0 || sx >= img.width || sy >= img.height) {
          dst[o] = dst[o + 1] = dst[o + 2] = 245;
        } else {
          const j = (sy * img.width + sx) * 4;
          dst[o] = img.rgba[j]; dst[o + 1] = img.rgba[j + 1]; dst[o + 2] = img.rgba[j + 2];
        }
        dst[o + 3] = 255;
      }
    drawNum(dst, dw, ox + 2, oy + TILE + 3, i, 3);
    drawNum(dst, dw, ox + 54, oy + TILE + 3, "" + k.count, 3);
  });
  fs.writeFileSync(out, encodePNG(dw, dh, dst));
  return { kinds: kinds.length, dw, dh };
}

if (require.main === module) {
  const id = process.argv[2] || "map1";
  const out = process.argv[3] || path.join(require("os").tmpdir(), id + "-kinds.png");
  const r = build(id, out);
  console.log(id, r.kinds, "kinds ->", out, r.dw + "x" + r.dh);
}

module.exports = { build };
