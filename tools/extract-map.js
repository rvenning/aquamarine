"use strict";
// Turn a printed gamesheet into a draft data/<id>.json.
//
// Everything a machine can decide is decided here; everything else is put in
// front of a person by tools/tagger. What the machine can do:
//
//   * the grid, from the printed aiming crosses (tools/grid.js)
//   * what each cell is made of, from its background colour (tools/terrain.js)
//   * what is printed on the sheet, as blobs of ink grouped into distinct
//     pictures (tools/blobs.js) -- so the same fish anywhere on any sheet is
//     one decision, not thirty
//   * where the depth lines run, from the dashes that draw them
//
// What it cannot do is know that a given picture is a cuttlefish and scores
// five points at night. That is the tagger's job, and it is roughly fifty
// decisions per sheet rather than three thousand.
//
//   node tools/extract-map.js map1 [--write]

const fs = require("fs");
const path = require("path");
const { decodePNG } = require("../lib/tools/png.js");
const { resolve, sheet, SHEETS } = require("./sheets.js");
const { findBlobs } = require("./blobs.js");
const { clusterBlobs, cellsOf, inPlay } = require("./blob-sheet.js");
const { cellColours, paletteOf } = require("./terrain.js");
const { findBoats } = require("./boats.js");
const GEOM = require("./geometry.json");

const DATA = path.join(__dirname, "..", "data");

// Normalise a rect to fractions of the colour sheet, so the game can render at
// any size without carrying a pixel scale around.
const norm = (g, sheetSize) => ({
  x: g.x0 / sheetSize.w, y: g.y0 / sheetSize.h,
  cell: g.pitch / sheetSize.w,
  cellY: g.pitch / sheetSize.h,
});

// The depth lines print as a row of short dashes straight across the sheet.
// They are the only ink that repeats dozens of times along one row, which
// makes them findable without knowing what they mean -- and where they sit is
// exactly the -1 AIR / -2 AIR boundary the rules charge for.
function depthLines(blobs, g) {
  const byRow = new Map();
  for (const b of blobs) {
    const wide = b.w > b.h * 2.5;                    // a dash is a flat sliver
    if (!wide || b.w > g.pitch * 0.6) continue;
    const edge = Math.round((b.cy - g.y0) / g.pitch);  // nearest cell boundary
    const off = Math.abs((b.cy - g.y0) / g.pitch - edge);
    if (off > 0.12) continue;
    byRow.set(edge, (byRow.get(edge) || 0) + 1);
  }
  return [...byRow.entries()]
    .filter(([, n]) => n >= g.cols * 0.6)
    .map(([row, n]) => ({ row, dashes: n }))
    .sort((a, b) => a.row - b.row);
}

function extract(id) {
  const s = sheet(id);
  const geom = GEOM[id];
  const lowImg = decodePNG(fs.readFileSync(resolve(s.read)));
  const gl = geom.lowink;

  const all = findBlobs(lowImg, { pitch: gl.pitch, grid: gl });
  const blobs = all.filter((b) => inPlay(b, gl));
  const lines = depthLines(blobs, gl);
  const lineRows = new Set(lines.map((l) => l.row));

  // Dashes belong to the depth lines, not to any cell; drop them before
  // clustering so they do not swamp the contact sheet.
  const symbols = blobs.filter((b) => {
    if (b.w <= b.h * 2.5 || b.w > gl.pitch * 0.6) return true;
    const edge = Math.round((b.cy - gl.y0) / gl.pitch);
    return !(lineRows.has(edge) && Math.abs((b.cy - gl.y0) / gl.pitch - edge) <= 0.12);
  });

  const clusters = clusterBlobs(symbols);
  const { cells: coloured } = cellColours(id, resolve(s.ship));
  const { runs: boatCols } = findBoats(id, resolve(s.ship));
  const palette = paletteOf(coloured);

  return {
    id,
    name: s.name,
    map: SHEETS.findIndex((x) => x.id === id) + 1,
    grid: { cols: geom.cols, rows: geom.rows },
    sheet: {
      image: "assets/" + id + ".webp",
      source: s.ship,
      size: geom.colour.sheet,
      // Where the grid sits on the image, as fractions of it.
      grid: norm(geom.colour, geom.colour.sheet),
    },
    // A dive may only start in one of the four squares under a boat.
    boats: boatCols.map((cols) => ({ cols, launch: cols.map((c) => [c, 0]) })),
    depthLines: lines,
    // Palette entries are unnamed until the tagger says which is rock, which
    // is cave, which is ice. Cells point at an entry by index.
    palette: palette.map((p, i) => ({
      id: i,
      rgb: [Math.round(p.r), Math.round(p.g), Math.round(p.b)],
      cells: p.n,
      terrain: null,
    })),
    terrain: coloured.map((c) => palette.findIndex((p) => p.cells.includes(c))),
    // One entry per distinct printed picture: what it looks like, how big it
    // is in cells, and every place it appears. `symbol` is filled in by hand.
    kinds: clusters.map((cl, i) => ({
      id: i,
      symbol: null,
      count: cl.members.length,
      size: {
        w: +(cl.head.w / gl.pitch).toFixed(2),
        h: +(cl.head.h / gl.pitch).toFixed(2),
      },
      //  is measured from the ink, so a wreck reports the squares it
      // actually occupies rather than every square its bounding box touches.
      at: cl.members.map((b) => {
        const { home } = cellsOf(b, gl);
        const covers = b.covers || [];
        return { home, covers: covers.length > 1 ? covers : undefined };
      }),
    })),
  };
}

if (require.main === module) {
  const ids = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const write = process.argv.includes("--write");
  for (const id of (ids.length ? ids : SHEETS.map((s) => s.id))) {
    const out = extract(id);
    const named = out.kinds.filter((k) => k.count > 1).length;
    console.log(
      out.id.padEnd(5), out.grid.cols + "x" + out.grid.rows,
      "kinds " + String(out.kinds.length).padStart(3),
      "(" + named + " seen more than once)",
      "palette " + out.palette.length,
      "depth lines at rows " + out.depthLines.map((l) => l.row).join(",")
    );
    if (write) {
      fs.mkdirSync(DATA, { recursive: true });
      const file = path.join(DATA, id + ".json");
      // Never clobber hand-tagging: merge the labels forward.
      if (fs.existsSync(file)) {
        const old = JSON.parse(fs.readFileSync(file, "utf8"));
        for (const k of out.kinds) {
          const prev = (old.kinds || []).find((p) => p.id === k.id && p.count === k.count);
          if (prev && prev.symbol) k.symbol = prev.symbol;
        }
        for (const p of out.palette) {
          const prev = (old.palette || []).find((q) => q.id === p.id);
          if (prev && prev.terrain) p.terrain = prev.terrain;
        }
      }
      fs.writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
      console.log("      wrote data/" + id + ".json");
    }
  }
}

module.exports = { extract, depthLines };
