"use strict";
// Finding the printed symbols on a sheet as connected blobs of ink.
//
// The first classifier chopped the sheet into cells and compared those. It
// works when a symbol sits neatly inside its square and falls apart when it
// does not -- and on these sheets plenty do not. Jellyfish trail tentacles into
// the cell below, shipwrecks sprawl over six squares, and a shoal of fish
// packs three symbols into two cells. Comparing cells asks "what does this
// square look like", which is a different and much harder question than "what
// is printed here", because the answer depends on the framing as much as the
// content: identical fish in differently-hatched water came out as two
// clusters, and 529 cells produced 305 of them.
//
// Blobs ask the right question. Ink is either touching or it is not, so a fish
// is one blob wherever it sits, and cropping to its bounding box throws away
// the framing entirely. Two fish anywhere on any sheet then compare as the
// same picture, and a wreck compares as one big thing rather than six unrelated
// fragments.

const DARK = 100;      // luminance at or below this is a printed symbol
const SPECK = 24;      // blobs smaller than this are print noise, not symbols
const GLUE = 7;        // blobs whose boxes come this close are one symbol

// Ink, optionally cropped to the play area.
//
// The crop is not an optimisation. Every sheet prints furniture in its margins
// -- depth arrows down the right edge, the boats along the top -- and ink is
// ink to a flood fill, so a flag drawn hard against the right-hand wall fuses
// with the dive marks beside it into one blob whose centre lands off the
// board. Map 1's 12-point flag disappeared from the extraction exactly that
// way, and nothing downstream could have noticed: the blob was a perfectly
// ordinary shape sitting in a perfectly ordinary place, just not a flag.
//
// Clipping first means the only ink considered is ink that is in play.
function darkMask(img, grid) {
  const { width: w, height: h, rgba } = img;
  const mask = new Uint8Array(w * h);
  const x0 = grid ? Math.round(grid.x0) : 0;
  const y0 = grid ? Math.round(grid.y0) : 0;
  const x1 = grid ? Math.round(grid.x0 + grid.cols * grid.pitch) : w;
  const y1 = grid ? Math.round(grid.y0 + grid.rows * grid.pitch) : h;
  for (let y = Math.max(0, y0); y < Math.min(h, y1); y++)
    for (let x = Math.max(0, x0); x < Math.min(w, x1); x++) {
      const p = (y * w + x) * 4;
      if ((rgba[p] + rgba[p + 1] + rgba[p + 2]) / 3 <= DARK) mask[y * w + x] = 1;
    }
  return mask;
}

// Eight-connected flood fill, iterative -- a shipwreck is tens of thousands of
// pixels and recursion would not survive it.
function components(mask, w, h) {
  const seen = new Uint8Array(w * h);
  const out = [];
  const stack = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    stack.length = 0;
    stack.push(start);
    seen[start] = 1;
    let n = 0, minX = w, minY = h, maxX = -1, maxY = -1;
    const px = [];
    while (stack.length) {
      const i = stack.pop();
      const x = i % w, y = (i / w) | 0;
      n++; px.push(i);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          if (mask[j] && !seen[j]) { seen[j] = 1; stack.push(j); }
        }
    }
    if (n >= SPECK) out.push({ n, minX, minY, maxX, maxY, px });
  }
  return out;
}

// Many symbols print as several separate strokes -- a fish body and its eye, a
// flag and the number hanging under it -- so the parts have to be put back
// together. The obvious rule, merge anything within a few pixels, is wrong:
// it chains. A shoal of fish printed a few pixels apart becomes one blob, and
// on Map 1 that rule collapsed 383 components into 38, the largest of which
// was twenty-four cells wide and spanned the whole sheet.
//
// Overlap does not chain. Two separate symbols, however close, have disjoint
// bounding boxes; a fish and its own eye do not. So merge on intersection,
// plus the special case of a small detail sitting just outside the body it
// belongs to, which is bounded by size so it cannot cascade.
const DETAIL = 300;    // a component this small can be a detail of a bigger one
const REACH = 4;       // ...if it comes this close to it

function glue(parts) {
  const box = (p) => ({ minX: p.minX, minY: p.minY, maxX: p.maxX, maxY: p.maxY });
  const overlaps = (a, b, pad) =>
    a.minX - pad <= b.maxX && b.minX - pad <= a.maxX &&
    a.minY - pad <= b.maxY && b.minY - pad <= a.maxY;
  const groups = parts.map((p) => ({ ...box(p), n: p.n, parts: [p] }));
  let merged = true;
  while (merged) {
    merged = false;
    outer:
    for (let i = 0; i < groups.length; i++)
      for (let j = i + 1; j < groups.length; j++) {
        const a = groups[i], b = groups[j];
        const detail = Math.min(a.n, b.n) <= DETAIL;
        if (!overlaps(a, b, detail ? REACH : 0)) continue;
        a.minX = Math.min(a.minX, b.minX); a.minY = Math.min(a.minY, b.minY);
        a.maxX = Math.max(a.maxX, b.maxX); a.maxY = Math.max(a.maxY, b.maxY);
        a.n += b.n;
        a.parts.push(...b.parts);
        groups.splice(j, 1);
        merged = true;
        break outer;
      }
  }
  return groups.map((g) => ({
    minX: g.minX, minY: g.minY, maxX: g.maxX, maxY: g.maxY,
    n: g.n, parts: g.parts.length,
    px: g.parts.flatMap((p) => p.px),
  }));
}

// A translation- and size-normalised picture of a blob: crop to its box, pad
// to square so aspect ratio is preserved, and pool to S x S. Two prints of the
// same symbol land on nearly identical descriptors wherever they sit.
const S = 20;
function describe(blob, w) {
  const bw = blob.maxX - blob.minX + 1, bh = blob.maxY - blob.minY + 1;
  const side = Math.max(bw, bh);
  const offX = blob.minX - (side - bw) / 2, offY = blob.minY - (side - bh) / 2;
  const acc = new Float32Array(S * S);
  const per = new Float32Array(S * S);
  for (let sy = 0; sy < S; sy++)
    for (let sx = 0; sx < S; sx++) per[sy * S + sx] = (side / S) * (side / S);
  for (const i of blob.px) {
    const x = i % w, y = (i / w) | 0;
    const gx = Math.min(S - 1, Math.max(0, Math.floor(((x - offX) / side) * S)));
    const gy = Math.min(S - 1, Math.max(0, Math.floor(((y - offY) / side) * S)));
    acc[gy * S + gx]++;
  }
  for (let i = 0; i < acc.length; i++) acc[i] = Math.min(1, acc[i] / per[i]);
  return acc;
}

function shapeDistance(a, b) {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]);
  return d / a.length;
}

// Some sheets connect their symbols. The Trench prints power cables as thin
// vertical lines running the height of the map, and they touch everything
// they pass -- so a plain flood fill returns ONE blob, 32 cells by 45, being
// the entire sheet welded into a single picture.
//
// Eroding the mask cuts those threads: a two-pixel bite off every edge deletes
// a three-pixel cable outright while a fish, whose thinnest stroke is four
// times that, merely slims. But eroding the WHOLE sheet is too blunt -- run
// over Map 1, where nothing is fused in the first place, it dissolves the
// outlined bubbles and chews the shipwrecks down from four cells to one.
//
// So erode only what needs it. Label normally, find any blob too big to be a
// symbol, and re-label just those pixels with as little erosion as separates
// them. Sheets that were never fused are untouched, and the sheet that was
// pays only for the region that was.
const MAX_SPAN = 5;    // a blob wider or taller than this many cells is fused
const MAX_ERODE = 3;

function erode(mask, w, h, r) {
  const out = new Uint8Array(mask.length);
  for (let y = r; y < h - r; y++)
    for (let x = r; x < w - r; x++) {
      let solid = true;
      for (let dy = -r; dy <= r && solid; dy++)
        for (let dx = -r; dx <= r; dx++)
          if (!mask[(y + dy) * w + x + dx]) { solid = false; break; }
      if (solid) out[y * w + x] = 1;
    }
  return out;
}

const span = (p) => Math.max(p.maxX - p.minX, p.maxY - p.minY);

function unfuse(part, w, h, pitch) {
  let best = null;
  for (let r = 1; r <= MAX_ERODE; r++) {
    const sub = new Uint8Array(w * h);
    for (const i of part.px) sub[i] = 1;
    const pieces = components(erode(sub, w, h, r), w, h);
    if (!pieces.length) break;                       // eroded away entirely
    for (const p of pieces) { p.minX -= r; p.minY -= r; p.maxX += r; p.maxY += r; }
    best = pieces;
    if (pieces.every((p) => span(p) <= MAX_SPAN * pitch)) break;
  }
  return best && best.length ? best : [part];
}

// Which cells a blob actually SITS IN, measured by ink rather than taken from
// its bounding box.
//
// A shipwreck is an L of hull and mast, three squares across and three down,
// and its bounding box claims nine cells while the wreck occupies five. That
// distinction is not cosmetic: the rules only pay out a wreck once every one
// of its spaces has been enclosed, so a box-derived cell list would make all
// four of Map 1's wrecks impossible to finish and quietly delete a scoring
// category from the game.
// The threshold has to be relative to the BLOB as well as to the cell. Judging
// coverage purely as a fraction of cell area silently deletes anything small:
// the dashes that draw the depth lines are thirty-six pixels against a cell of
// four and a half thousand, so they cover no cell at all, report as being
// nowhere on the board, and vanish. A cell counts if it holds a real share of
// the blob, or a real share of the cell -- whichever is easier to satisfy.
const COVER_CELL = 0.06;   // ...of the cell's area
const COVER_BLOB = 0.20;   // ...or of the blob's own ink

function coverage(blob, w, grid) {
  const counts = new Map();
  for (const i of blob.px) {
    const c = Math.floor(((i % w) - grid.x0) / grid.pitch);
    const r = Math.floor((((i / w) | 0) - grid.y0) / grid.pitch);
    if (c < 0 || r < 0 || c >= grid.cols || r >= grid.rows) continue;
    const key = r * grid.cols + c;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const floor = Math.min(grid.pitch * grid.pitch * COVER_CELL, blob.n * COVER_BLOB);
  return [...counts.entries()]
    .filter(([, n]) => n >= floor)
    .map(([key]) => [key % grid.cols, Math.floor(key / grid.cols)])
    .sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}

// The `pitch` option is the cell size in this image's pixels; without it the
// unfusing step has no scale to judge "too big" against and is skipped. Pass
// `grid` as well to have each blob report the cells it covers.
function findBlobs(img, { pitch, grid } = {}) {
  const { width: w, height: h } = img;
  let parts = components(darkMask(img, grid), w, h);
  if (pitch) {
    const fixed = [];
    for (const p of parts) fixed.push(...(span(p) > MAX_SPAN * pitch ? unfuse(p, w, h, pitch) : [p]));
    parts = fixed;
  }
  const blobs = glue(parts);
  for (const b of blobs) {
    b.w = b.maxX - b.minX + 1;
    b.h = b.maxY - b.minY + 1;
    b.cx = (b.minX + b.maxX) / 2;
    b.cy = (b.minY + b.maxY) / 2;
    b.shape = describe(b, w);
    if (grid) b.covers = coverage(b, w, grid);
    delete b.px;             // the pixel lists are large and no longer needed
  }
  return blobs;
}

module.exports = { DARK, darkMask, erode, components, glue, describe, shapeDistance, findBlobs, S };
