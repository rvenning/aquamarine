"use strict";
// Render each flag on a map with the badge hanging below it, so the printed
// value can be read and recorded. Flags are the one piece of grid content
// carrying a number, and OCR for six digits per sheet is not worth writing.
//
//   node tools/flag-strip.js map1 out.png "13,7 0,8 17,8"

const fs = require("fs");
const { decodePNG, encodePNG } = require("../lib/tools/png.js");
const { resolve, sheet } = require("./sheets.js");
const { drawNum } = require("./montage.js");
const GEOM = require("./geometry.json");

function strip(id, cells, out) {
  const img = decodePNG(fs.readFileSync(resolve(sheet(id).ship)));
  const g = GEOM[id].colour;
  const W = Math.round(g.pitch * 1.8), H = Math.round(g.pitch * 3);
  const dw = W * cells.length, dh = H + 18;
  const dst = Buffer.alloc(dw * dh * 4, 255);
  for (let i = 3; i < dst.length; i += 4) dst[i] = 255;
  cells.forEach(([c, r], i) => {
    const sx0 = g.x0 + (c - 0.4) * g.pitch, sy0 = g.y0 + (r - 0.2) * g.pitch;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const sx = Math.round(sx0 + x), sy = Math.round(sy0 + y);
        const o = (y * dw + i * W + x) * 4;
        if (sx < 0 || sy < 0 || sx >= img.width || sy >= img.height) { dst[o] = dst[o + 1] = dst[o + 2] = 235; }
        else { const j = (sy * img.width + sx) * 4; dst[o] = img.rgba[j]; dst[o + 1] = img.rgba[j + 1]; dst[o + 2] = img.rgba[j + 2]; }
        dst[o + 3] = 255;
      }
    drawNum(dst, dw, i * W + 4, H + 3, c, 2);
    drawNum(dst, dw, i * W + 30, H + 3, r, 2);
  });
  fs.writeFileSync(out, encodePNG(dw, dh, dst));
  return { dw, dh };
}

if (require.main === module) {
  const [id, out, list] = process.argv.slice(2);
  const cells = list
    ? list.trim().split(/\s+/).map((s) => s.split(",").map(Number))
    : JSON.parse(fs.readFileSync(require("path").join(__dirname, "..", "data", id + ".json"), "utf8"))
        .symbols.find((k) => k.symbol === "flag").at.map((a) => a.home);
  cells.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const r = strip(id, cells, out);
  console.log(id, cells.length, "flags ->", out, r.dw + "x" + r.dh, "| order:", cells.map((c) => c.join(",")).join("  "));
}

module.exports = { strip };
