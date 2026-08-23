"use strict";
// Apply the hand labels in tools/labels/<id>.json to data/<id>.json.
//
// Labels live in their own file rather than being edited into the extracted
// data, because the extracted data is regenerated whenever the pipeline changes
// and hand work must survive that. Kind ids are positional, so the labels are
// only as stable as the clustering -- which is exactly why tools/lint-map.js
// checks the labelled result against counts the printed Diver's Log states
// outright. If a re-extraction shuffles the kinds, the lint fails loudly rather
// than the map quietly gaining a seventh shipwreck.
//
// The output goes in a SEPARATE array from the input. `kinds` is the raw record
// of what the extractor saw and is only ever read here; `symbols` is the game's
// actual content, assembled from it. An earlier version resolved in place --
// deleting the six eel fragments it had just merged into one eel -- which made
// the step destructive and non-repeatable: running it twice found nothing left
// to merge and produced a map with no eels on it at all.
//
//   node tools/label.js [map1 ...]

const fs = require("fs");
const path = require("path");
const { SHEETS } = require("./sheets.js");

const DATA = path.join(__dirname, "..", "data");
const LABELS = path.join(__dirname, "labels");

// Symbols found by colour rather than by connectivity.
//
// Map 2 prints its research icons across the bodies of the colossal squid.
// Their ink touches the squid's, so the blob finder returns the squid and
// swallows the icons whole -- it found eight of the twenty on the sheet, and
// the twelve it lost were precisely the ones a player most wants, since
// enclosing a squid should fill a research track. Connectivity cannot see
// them; a flat saturated colour that appears nowhere else can.
function byColour(id, spec) {
  const { findColour } = require("./colour-blobs.js");
  const { resolve, sheet } = require("./sheets.js");
  const [lo, hi] = spec.size || [0, 99];
  const [alo, ahi] = spec.aspect || [0, 99];
  return findColour(id, resolve(sheet(id).ship), spec.rgb, { tol: spec.tol, minPx: spec.minPx })
    .filter((h) => {
      const big = Math.max(h.w, h.h);
      return big >= lo && big <= hi && h.w / h.h >= alo && h.w / h.h <= ahi;
    })
    .map((h) => ({ home: h.cell }));
}

// Put fragmented creatures back together.
//
// Ancient Waters draws its eels as long curved bodies four or five squares
// long. The clusterer sees a curve as several different pictures -- a straight
// run, a bend, a tail -- and the unfusing step can cut one in two, so a single
// eel arrives as two or three overlapping entries. That matters more here than
// anywhere else: an eel scores +6 when completely enclosed across two or more
// shapes and -3 when taken in one, so an eel split into halves would be
// scoreable a piece at a time, inverting the rule it exists to express.
function mergeTouching(spots) {
  let groups = spots.map((s) => new Set((s.covers || [s.home]).map((c) => c.join(","))));
  const near = (a, b) => {
    for (const x of a) {
      const [c, r] = x.split(",").map(Number);
      for (const y of b) {
        const [c2, r2] = y.split(",").map(Number);
        if (Math.abs(c - c2) + Math.abs(r - r2) <= 1) return true;
      }
    }
    return false;
  };
  let merged = true;
  while (merged) {
    merged = false;
    outer:
    for (let i = 0; i < groups.length; i++)
      for (let j = i + 1; j < groups.length; j++)
        if (near(groups[i], groups[j])) {
          for (const v of groups[j]) groups[i].add(v);
          groups.splice(j, 1);
          merged = true;
          break outer;
        }
  }
  return groups.map((g) => {
    const covers = [...g].map((s) => s.split(",").map(Number)).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    return { home: covers[0], covers };
  });
}

// Trim a merged group back to the rectangle it is printed as.
//
// The Trench draws its research outposts as blocks of eight squares, two by
// four. Each has an eye marker sitting directly against it showing where the
// bonus is claimed, and where the marker did not cluster separately the merge
// swallows it and reports a nine-square outpost. Nine can never be completed,
// because the ninth square is not part of the building -- so an outpost that
// gains a cell silently removes a scoring track from the game.
//
// The printed shape is the authority: find the best-covered rectangle of the
// stated size and keep that.
function trimToRect(spots, shapes) {
  return spots.map((spot) => {
    const cells = spot.covers || [spot.home];
    if (shapes.some(([w, h]) => cells.length === w * h)) return spot;
    const have = new Set(cells.map((c) => c.join(",")));
    let best = null;
    for (const [w, h] of shapes)
      for (const [c0, r0] of cells) {
        let n = 0;
        const box = [];
        for (let dc = 0; dc < w; dc++)
          for (let dr = 0; dr < h; dr++) {
            const cell = [c0 + dc, r0 + dr];
            box.push(cell);
            if (have.has(cell.join(","))) n++;
          }
        if (!best || n > best.n) best = { n, box };
      }
    if (!best || best.n < best.box.length) return spot;   // no clean fit; leave it
    const covers = best.box.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    return { home: covers[0], covers };
  });
}

function apply(id) {
  const dataFile = path.join(DATA, id + ".json");
  const labelFile = path.join(LABELS, id + ".json");
  const data = JSON.parse(fs.readFileSync(dataFile, "utf8"));
  if (!fs.existsSync(labelFile)) return { id, symbols: 0, of: data.kinds.length, palette: 0, unlabelled: data.kinds.length };
  const labels = JSON.parse(fs.readFileSync(labelFile, "utf8"));

  // Gather every appearance of every named symbol.
  const bySymbol = new Map();
  const add = (symbol, spots) => {
    if (!bySymbol.has(symbol)) bySymbol.set(symbol, []);
    bySymbol.get(symbol).push(...spots);
  };

  let named = 0;
  const unlabelled = [];
  for (const k of data.kinds) {
    const symbol = labels.kinds && labels.kinds[String(k.id)];
    k.symbol = symbol || null;
    if (!symbol) { unlabelled.push(k.id); continue; }
    named++;
    if (symbol === "ignore") continue;
    add(symbol, k.at.map((spot) => {
      // A flag is a pennant on a pole with a numbered badge hanging beneath it,
      // and the square you must enclose is the pennant's. The extractor anchors
      // a blob at its centre of area, which for a flag lands on whichever of
      // the two cells holds more ink -- the pennant on some, the badge on
      // others, with no pattern to it. The pennant is always at the TOP of the
      // pole, so anchor there and the ambiguity disappears.
      //
      // And the flag IS the pennant's square, on its own. The badge is printed
      // on whatever happens to be beneath it, which on five of Map 1's six
      // flags is a block of rock -- so carrying the badge along as part of the
      // flag made every one of them impossible to enclose and quietly deleted
      // up to 40 points a game from the scoring.
      if (symbol === "flag") {
        const home = spot.covers && spot.covers.length ? spot.covers[0] : spot.home;
        return { home };
      }
      return spot.covers ? { home: spot.home, covers: spot.covers } : { home: spot.home };
    }));
  }

  // A colour pass REPLACES whatever the blob pass thought that symbol was,
  // rather than adding to it, so the two cannot double-count.
  for (const spec of labels.colourSymbols || []) bySymbol.set(spec.symbol, byColour(id, spec));
  for (const symbol of labels.mergeTouching || [])
    if (bySymbol.has(symbol)) bySymbol.set(symbol, mergeTouching(bySymbol.get(symbol)));
  for (const [symbol, shapes] of Object.entries(labels.trimToRect || {}))
    if (bySymbol.has(symbol)) bySymbol.set(symbol, trimToRect(bySymbol.get(symbol), shapes));

  data.symbols = [...bySymbol.entries()]
    .map(([symbol, at]) => ({ symbol, count: at.length, at }))
    .sort((a, b) => b.count - a.count);

  if (labels.structure) {
    const { _, ...rest } = labels.structure;
    data.structure = rest;
  }

  let palette = 0;
  for (const p of data.palette) {
    p.terrain = (labels.palette && labels.palette[String(p.id)]) || null;
    if (p.terrain) palette++;
  }

  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2) + "\n");
  return {
    id, named, of: data.kinds.length, unlabelled,
    palette, palettes: data.palette.length,
    symbols: data.symbols.reduce((a, s) => a + s.count, 0),
  };
}

if (require.main === module) {
  const ids = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  for (const id of (ids.length ? ids : SHEETS.map((s) => s.id))) {
    const r = apply(id);
    console.log(r.id.padEnd(5), "kinds " + r.named + "/" + r.of,
      " palette " + r.palette + "/" + (r.palettes ?? "?"),
      " -> " + r.symbols + " symbols",
      r.unlabelled && r.unlabelled.length ? "  <- unlabelled: " + r.unlabelled.join(", ") : "");
  }
}

module.exports = { apply, mergeTouching };
