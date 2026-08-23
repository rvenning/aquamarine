"use strict";
// Turn the print-and-play's colour gamesheets into board images the game can
// ship.
//
// The sheets are print artwork: five PNGs totalling 30MB, of which the Trench
// alone is 8.7. That is fine on paper and hopeless in a browser, let alone in
// a service worker's precache -- the whole point of these games is that they
// install to a home screen and work with no signal.
//
// WebP at high quality takes flat vector-style art down by an order of
// magnitude with no visible loss at any zoom a phone can render. The images
// are NOT precached: each map's board is fetched the first time it is played
// and cached from then on, so installing the game costs a few hundred
// kilobytes rather than thirty megabytes.
//
//   node tools/convert-sheets.js [--quality 88]

const fs = require("fs");
const path = require("path");
const { resolve, SHEETS } = require("./sheets.js");

const OUT = path.join(__dirname, "..", "assets");

async function convert(quality) {
  let sharp;
  try {
    sharp = require("sharp");
  } catch (err) {
    console.error("sharp is not installed. `npm i -D sharp`, or copy the PNGs across unconverted.");
    process.exit(1);
  }
  fs.mkdirSync(OUT, { recursive: true });
  const rows = [];
  for (const s of SHEETS) {
    const src = resolve(s.ship);
    const dst = path.join(OUT, s.id + ".webp");
    const before = fs.statSync(src).size;
    await sharp(src).webp({ quality, effort: 6 }).toFile(dst);
    const after = fs.statSync(dst).size;
    rows.push({ id: s.id, before, after });
    console.log(
      s.id.padEnd(6),
      (before / 1048576).toFixed(2).padStart(6) + " MB  ->  " +
      (after / 1048576).toFixed(2).padStart(5) + " MB",
      "  (" + Math.round((1 - after / before) * 100) + "% smaller)");
  }
  const before = rows.reduce((a, r) => a + r.before, 0);
  const after = rows.reduce((a, r) => a + r.after, 0);
  console.log("total ".padEnd(6),
    (before / 1048576).toFixed(2).padStart(6) + " MB  ->  " +
    (after / 1048576).toFixed(2).padStart(5) + " MB");
}

if (require.main === module) {
  const i = process.argv.indexOf("--quality");
  convert(i > 0 ? +process.argv[i + 1] : 88);
}

module.exports = { convert };
