"use strict";
// Render cells as a contact sheet so a person can see what the classifier is
// looking at. Grid extraction is a pipeline of plausible-looking numbers, and
// the only cheap way to know whether a step is working is to look at its
// output; this is the tool that makes that possible at every stage.
//
//   node tools/montage.js map1 [out.png] [--cols 16] [--limit 200]

const fs = require("fs");
const path = require("path");
const { decodePNG, encodePNG } = require("../lib/tools/png.js");
const { resolve, sheet } = require("./sheets.js");
const { cellBox } = require("./cells.js");
const GEOM = require("./geometry.json");

const TILE = 64;       // each cell rendered this many pixels square
const PAD = 6;

// Nearest-neighbour is fine and preferred here: it keeps hairlines visible
// where averaging would grey them into nothing.
function drawCell(dst, dw, ox, oy, img, geom, col, row) {
  const b = cellBox(geom, col, row);
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      const sx = Math.round(b.x + (x / TILE) * b.size);
      const sy = Math.round(b.y + (y / TILE) * b.size);
      const o = ((oy + y) * dw + ox + x) * 4;
      if (sx < 0 || sy < 0 || sx >= img.width || sy >= img.height) {
        dst[o] = dst[o + 1] = dst[o + 2] = 255; dst[o + 3] = 255; continue;
      }
      const i = (sy * img.width + sx) * 4;
      dst[o] = img.rgba[i]; dst[o + 1] = img.rgba[i + 1]; dst[o + 2] = img.rgba[i + 2]; dst[o + 3] = 255;
    }
}

// A 3x5 dot-matrix digit set, so tiles can be numbered without a font.
const FONT = {
  0: "111101101101111", 1: "010110010010111", 2: "111001111100111", 3: "111001111001111",
  4: "101101111001001", 5: "111100111001111", 6: "111100111101111", 7: "111001001001001",
  8: "111101111101111", 9: "111101111001111",
};
function drawNum(dst, dw, ox, oy, text, scale = 1) {
  let cx = ox;
  for (const ch of String(text)) {
    const g = FONT[ch];
    if (!g) { cx += 4 * scale; continue; }
    for (let i = 0; i < 15; i++)
      if (g[i] === "1")
        for (let sy = 0; sy < scale; sy++)
          for (let sx = 0; sx < scale; sx++) {
            const x = cx + (i % 3) * scale + sx, y = oy + Math.floor(i / 3) * scale + sy;
            const o = (y * dw + x) * 4;
            if (o >= 0 && o + 3 < dst.length) { dst[o] = 200; dst[o + 1] = 0; dst[o + 2] = 0; dst[o + 3] = 255; }
          }
    cx += 4 * scale;
  }
}

// tiles: [{ col, row, label }]
function contactSheet(img, geom, tiles, cols) {
  const rows = Math.ceil(tiles.length / cols);
  const cellW = TILE + PAD, cellH = TILE + PAD + 10;
  const dw = cols * cellW + PAD, dh = rows * cellH + PAD;
  const dst = Buffer.alloc(dw * dh * 4, 255);
  for (let i = 0; i < dst.length; i += 4) dst[i + 3] = 255;
  tiles.forEach((t, i) => {
    const ox = PAD + (i % cols) * cellW, oy = PAD + Math.floor(i / cols) * cellH;
    drawCell(dst, dw, ox, oy, img, geom, t.col, t.row);
    drawNum(dst, dw, ox, oy + TILE + 2, t.label ?? i, 2);
  });
  return { dw, dh, dst };
}

if (require.main === module) {
  const id = process.argv[2] || "map1";
  const out = process.argv[3] || path.join(require("os").tmpdir(), id + "-cells.png");
  const cols = +(process.argv.includes("--cols") ? process.argv[process.argv.indexOf("--cols") + 1] : 16);
  const limit = +(process.argv.includes("--limit") ? process.argv[process.argv.indexOf("--limit") + 1] : 256);
  const img = decodePNG(fs.readFileSync(resolve(sheet(id).read)));
  const geom = GEOM[id].lowink;
  const tiles = [];
  for (let r = 0; r < geom.rows && tiles.length < limit; r++)
    for (let c = 0; c < geom.cols && tiles.length < limit; c++) tiles.push({ col: c, row: r, label: tiles.length });
  const { dw, dh, dst } = contactSheet(img, geom, tiles, cols);
  fs.writeFileSync(out, encodePNG(dw, dh, dst));
  console.log("wrote", out, dw + "x" + dh, tiles.length + " cells");
}

module.exports = { contactSheet, drawCell, drawNum, TILE, PAD };
