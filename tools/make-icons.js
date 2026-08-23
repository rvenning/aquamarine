"use strict";
// Home-screen icons, painted rather than drawn: a diver's mask under water,
// which is the mark the printed sheets use for their own page numbers.
//
//   npm run icons

const fs = require("fs");
const path = require("path");
const { makeCanvas, downsample, encodePNG } = require("../lib/tools/png.js");

const OUT = path.join(__dirname, "..", "icons");
const DEEP = "#0d2733";
const WATER = "#17475b";
const GLASS = "#66c6bb";
const RIM = "#ffb32b";

// Painted at 4x and averaged down, which is how these get their edges.
function paint(size, { maskable }) {
  const S = size * 4;
  const cv = makeCanvas(S);
  cv.fillRect(0, 0, S, S, DEEP);

  // Water, lighter towards the surface.
  for (let i = 0; i < 40; i++) {
    const y = (i / 40) * S;
    const t = 1 - i / 40;
    cv.fillRect(0, y, S, S / 40 + 1, mix(WATER, DEEP, 1 - t * 0.8));
  }

  // A maskable icon has to survive being cropped to a circle, so its artwork
  // sits inside the safe zone rather than filling the square.
  const inset = maskable ? S * 0.22 : S * 0.14;
  const w = S - inset * 2;
  const cx = S / 2, cy = S / 2;

  // The mask: a rounded rectangle of glass with a heavy rim.
  const h = w * 0.62;
  const x = cx - w / 2, y = cy - h / 2;
  roundRect(cv, x, y, w, h, h * 0.34, RIM);
  roundRect(cv, x + w * 0.08, y + h * 0.16, w * 0.84, h * 0.62, h * 0.26, GLASS);

  // The strap, running off both edges.
  cv.fillRect(0, cy - h * 0.06, x, h * 0.12, RIM);
  cv.fillRect(x + w, cy - h * 0.06, S - (x + w), h * 0.12, RIM);

  // Two bubbles rising from the corner of the mask.
  cv.fillCircle(cx + w * 0.34, cy - h * 0.72, w * 0.05, "#eaf6f4");
  cv.fillCircle(cx + w * 0.46, cy - h * 1.02, w * 0.032, "#eaf6f4");

  return encodePNG(size, size, downsample(cv.px, S, 4));
}

function roundRect(cv, x, y, w, h, r, colour) {
  cv.fillRect(x + r, y, w - r * 2, h, colour);
  cv.fillRect(x, y + r, w, h - r * 2, colour);
  cv.fillCircle(x + r, y + r, r, colour);
  cv.fillCircle(x + w - r, y + r, r, colour);
  cv.fillCircle(x + r, y + h - r, r, colour);
  cv.fillCircle(x + w - r, y + h - r, r, colour);
}

function mix(a, b, t) {
  const pa = hex(a), pb = hex(b);
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
}
const hex = (s) => [1, 3, 5].map((i) => parseInt(s.substr(i, 2), 16));

if (require.main === module) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "icon-192.png"), paint(192, {}));
  fs.writeFileSync(path.join(OUT, "icon-512.png"), paint(512, {}));
  fs.writeFileSync(path.join(OUT, "maskable-512.png"), paint(512, { maskable: true }));
  console.log("wrote icons/icon-192.png, icon-512.png, maskable-512.png");
}
