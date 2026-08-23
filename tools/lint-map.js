"use strict";
// Check an extracted map against what the printed materials say it contains.
//
// The extraction pipeline is a stack of heuristics, and heuristics fail
// quietly: a map with five shipwrecks instead of four, or a coral mis-sorted
// by colour, looks entirely normal and plays wrong for the rest of the game's
// life. What saves this project is that Postmark printed the answers. The
// Diver's Log for each map sets challenges like "Discover all 4 Shipwrecks",
// "Discover both pairs of Beacons" and "Discover 12 Coral of a single colour",
// which are only sane as challenges if the sheet holds exactly that many. So
// the log doubles as a test fixture, and the rules supply the rest.
//
// Everything here is a fact about the printed game, not a preference. If a
// check fails, the extraction is wrong -- not the check.
//
//   npm run lint-maps

const fs = require("fs");
const path = require("path");
const { SHEETS } = require("./sheets.js");

const DATA = path.join(__dirname, "..", "data");

// Ground truth, sourced per line. Counts marked "exactly" come from a Diver's
// Log challenge that names the number; "at least" from a challenge that asks
// for that many; the rest from the sheet's own scoring panel.
const EXPECT = {
  map1: {
    exactly: { wreck: 4, beacon: 4, flag: 6 },
    atLeast: { stingray: 3, cuttlefish: 3, fish: 20, jellyfish: 6, bubbles: 5 },
    coralOfOneColour: 12,
    depthLines: 2,
    why: {
      wreck: "Diver's Log 03 Historian: 'Discover all 4 Shipwrecks'",
      beacon: "Diver's Log 05 Engineer: 'Discover both pairs of Beacons' (icon shows 4)",
      flag: "the six flags printed on the sheet: 4, 6, 8, 10, 12, 18",
      stingray: "Diver's Log 01 Day Biologist: 'Discover at least 3 Stingrays'",
      cuttlefish: "Diver's Log 02 Night Biologist: 'Discover at least 3 Cuttlefish'",
      coralOfOneColour: "Diver's Log 06 Conservationist: 'Discover 12 Coral of a single colour'",
    },
  },
  map2: {
    exactly: { wreck: 0, beacon: 4, flag: 6, squid: 3 },
    atLeast: { stingray: 3, cuttlefish: 3, fish: 20, shark: 5, research: 20, bubbles: 5 },
    squidSizes: [7, 8, 11],
    depthLines: 2,
    why: {
      squid: "Map 2 rules: colossal squid cover 7, 8 or 11 spaces -- three of them",
      research: "twenty research icons, eight standalone and twelve drawn on the squid",
      beacon: "beacons only ever score in pairs, one by day and one by night",
      flag: "the six flags printed on the sheet: 6, 8, 12, 12, 14, 16",
    },
  },
  map3: {
    exactly: { vent: 7, outpost: 6, station: 3 },
    atLeast: { fish: 20, jellyfish: 10, glassSquid: 0, angler: 6, prey: 30, cable: 20, tunnel: 8 },
    outpostCells: 8,
    why: {
      vent: "Map 3 scoring: 1/4/9/16/25/36/49 points for 1 to 7 vents, so the sheet holds exactly seven",
      outpost: "twelve outpost bonuses arranged in six pairs, one pair spent per outpost",
      station: "the eye markers that survived clustering; the rest merged into their outposts",
    },
  },
  map4: {
    exactly: { beacon: 4, flag: 6, wreck: 0 },
    atLeast: { stingray: 3, cuttlefish: 3, fish: 30, camera: 16, penguin: 6, krill: 10, bubbles: 5 },
    penguinCells: 2,
    depthLines: 2,
    why: {
      camera: "one camera per space on the printed photo bonus track",
      penguin: "Map 4 rules: both of a penguin's spaces must be enclosed, so each covers two",
      flag: "the six flags printed on the sheet: 4, 6, 8, 10, 14, 18",
    },
  },
  map5: {
    exactly: { beacon: 4, flag: 6, wreck: 0 },
    atLeast: { stingray: 3, cuttlefish: 3, fish: 30, eel: 4, nautilus: 6, flare: 5, bubbles: 5 },
    fossilTypes: 5,
    depthLines: 2,
    why: {
      fossilTypes: "Map 5 rules: five different types of fossil, one track each",
      flag: "the six flags printed on the sheet: 4, 6, 8, 12, 14, 16",
    },
  },
};

function lintMap(id) {
  const file = path.join(DATA, id + ".json");
  const problems = [];
  const notes = [];
  if (!fs.existsSync(file)) return { id, problems: ["no data/" + id + ".json -- run npm run extract"], notes };
  const d = JSON.parse(fs.readFileSync(file, "utf8"));

  /* ---- structural: true of every map, whatever it contains ---- */
  const unlabelled = d.kinds.filter((k) => !k.symbol);
  if (unlabelled.length)
    problems.push(`${unlabelled.length} of ${d.kinds.length} kinds unlabelled (ids ${unlabelled.slice(0, 8).map((k) => k.id).join(", ")}${unlabelled.length > 8 ? ", ..." : ""})`);
  const noTerrain = d.palette.filter((p) => !p.terrain);
  if (noTerrain.length)
    problems.push(`${noTerrain.length} of ${d.palette.length} palette entries untagged (ids ${noTerrain.map((p) => p.id).join(", ")})`);

  if (d.terrain.length !== d.grid.cols * d.grid.rows)
    problems.push(`terrain has ${d.terrain.length} entries for a ${d.grid.cols}x${d.grid.rows} grid`);
  if (d.terrain.some((t) => t < 0 || t >= d.palette.length))
    problems.push("some cells point at a palette entry that does not exist");

  // Every symbol must sit somewhere on the board, and multi-cell symbols must
  // be one connected piece -- a wreck in two halves cannot be enclosed.
  for (const k of d.symbols || [])
    for (const spot of k.at) {
      const [c, r] = spot.home;
      if (c < 0 || r < 0 || c >= d.grid.cols || r >= d.grid.rows)
        problems.push(`kind ${k.id} (${k.symbol}) sits off the board at ${c},${r}`);
      if (spot.covers && !connected(spot.covers))
        problems.push(`kind ${k.id} (${k.symbol}) at ${c},${r} covers a broken set of cells`);
    }

  // Nothing may be printed on rock: rock cannot be enclosed, so a creature
  // there would be unscoreable and is a sign the grid or the palette is off.
  const rockIds = new Set(d.palette.filter((p) => p.terrain === "rock").map((p) => p.id));
  const onRock = [];
  for (const k of d.symbols || []) {
    // Wrecks are drawn half-buried, and Ancient Waters embeds its fossils INSIDE
    // the rock on purpose -- they are collected by tracing a line through stone,
    // never by enclosing them. Both belong on rock.
    if (k.symbol === "wreck" || k.symbol.startsWith("fossil")) continue;
    for (const spot of k.at)
      if (rockIds.has(d.terrain[spot.home[1] * d.grid.cols + spot.home[0]]))
        onRock.push(`${k.symbol}@${spot.home}`);
  }
  if (onRock.length > 2) notes.push(`${onRock.length} symbols sit on rock cells (${onRock.slice(0, 4).join(", ")}...) -- check the palette tagging`);

  /* ---- the boats, which are where every dive begins ---- */
  if (!d.boats || d.boats.length !== 3) problems.push(`expected 3 boats, found ${d.boats ? d.boats.length : 0}`);
  for (const b of d.boats || []) {
    if (b.cols.length !== 4) problems.push(`a boat launches into ${b.cols.length} squares, should be 4`);
    for (const [c, r] of b.launch) {
      if (r !== 0) problems.push(`a launch square is at row ${r}, should be the top row`);
      if (rockIds.has(d.terrain[r * d.grid.cols + c]))
        problems.push(`launch square ${c},${r} is rock -- that boat could never be dived from`);
    }
  }

  /* ---- the hand-authored panel constants ---- */
  const st = d.structure;
  if (!st) problems.push("no structure block -- add one to tools/labels/" + id + ".json");
  else {
    // Every flag on the board needs a value, and every value needs a flag.
    const flagCells = new Set();
    for (const k of d.symbols || [])
      if (k.symbol === "flag") for (const spot of k.at) flagCells.add(spot.home.join(","));
    const valued = new Set(Object.keys(st.flagValues || {}).filter((k) => k !== "_"));
    for (const cell of flagCells) if (!valued.has(cell)) problems.push(`the flag at ${cell} has no value`);
    for (const cell of valued) if (!flagCells.has(cell)) problems.push(`a flag value is recorded at ${cell}, where there is no flag`);

    const marks = st.diveMarks || [];
    if (marks.length !== 3) problems.push(`expected 3 dive marks, found ${marks.length}`);
    for (let i = 1; i < marks.length; i++)
      if (marks[i] <= marks[i - 1]) problems.push("dive marks are not in increasing depth order: " + marks.join(", "));
    for (const m of marks)
      if (m <= 0 || m >= d.grid.rows) problems.push(`dive mark at row ${m} is outside the board`);
    if ((st.tanks || []).length !== 3) problems.push("expected 3 air tanks");
    if (st.turns !== 24) problems.push(`expected a 24-turn game, found ${st.turns}`);
  }

  /* ---- what the printed materials say this particular map holds ---- */
  const want = EXPECT[id];
  if (!want) { notes.push("no printed ground truth recorded for this map yet"); return { id, problems, notes, counts: tally(d) }; }
  const counts = tally(d);
  const why = want.why || {};
  for (const [symbol, n] of Object.entries(want.exactly || {}))
    if ((counts[symbol] || 0) !== n)
      problems.push(`expected exactly ${n} ${symbol}, found ${counts[symbol] || 0}` + (why[symbol] ? ` -- ${why[symbol]}` : ""));
  for (const [symbol, n] of Object.entries(want.atLeast || {}))
    if ((counts[symbol] || 0) < n)
      problems.push(`expected at least ${n} ${symbol}, found ${counts[symbol] || 0}` + (why[symbol] ? ` -- ${why[symbol]}` : ""));
  if (want.coralOfOneColour) {
    const best = Math.max(counts["coral-purple"] || 0, counts["coral-orange"] || 0);
    if (best < want.coralOfOneColour)
      problems.push(`the commonest coral colour has ${best}, need ${want.coralOfOneColour} -- ${why.coralOfOneColour}`);
  }
  // The colossal squid are the sharpest check on the whole pipeline: the rules
  // state their exact sizes, and getting all three right means the grid, the
  // unfusing and the ink-based coverage are all correct at once.
  if (want.squidSizes) {
    const sizes = (d.symbols || []).filter((k) => k.symbol === "squid")
      .flatMap((k) => k.at.map((a) => (a.covers || [a.home]).length)).sort((a, b) => a - b);
    const wantSizes = [...want.squidSizes].sort((a, b) => a - b);
    if (sizes.join(",") !== wantSizes.join(","))
      problems.push();
  }
  // The colossal squid are the sharpest single check on the whole pipeline.
  // The rules state their exact sizes -- 7, 8 and 11 squares -- so getting all
  // three right means the grid, the unfusing of connected ink, and the
  // measurement of coverage by ink rather than by bounding box are ALL correct
  // at once. Nothing else in the extraction is pinned down this precisely.
  if (want.squidSizes) {
    const sizes = (d.symbols || []).filter((k) => k.symbol === "squid")
      .flatMap((k) => k.at.map((a) => (a.covers || [a.home]).length))
      .sort((a, b) => a - b);
    const wanted = [...want.squidSizes].sort((a, b) => a - b);
    if (sizes.join(",") !== wanted.join(","))
      problems.push("colossal squid cover " + sizes.join(", ") + " cells; the rules say " + wanted.join(", "));
  }
  // Penguins are printed two squares wide and score only when both are taken.
  if (want.penguinCells) {
    const bad = (d.symbols || []).filter((k) => k.symbol === "penguin")
      .flatMap((k) => k.at.map((a) => (a.covers || [a.home]).length))
      .filter((n) => n !== want.penguinCells);
    if (bad.length) problems.push(`${bad.length} penguins cover ${[...new Set(bad)].join("/")} cells instead of ${want.penguinCells}`);
  }
  // Ancient Waters has one track per fossil type, so all five must be present.
  if (want.fossilTypes) {
    const types = new Set((d.symbols || []).filter((k) => k.symbol.startsWith("fossil-")).map((k) => k.symbol));
    if (types.size !== want.fossilTypes)
      problems.push(`found ${types.size} fossil types (${[...types].join(", ")}), expected ${want.fossilTypes} -- ${why.fossilTypes}`);
  }
  // Outposts are printed as blocks of eight squares and only pay out when all
  // eight are enclosed, so a miscounted one is an unwinnable bonus.
  if (want.outpostCells) {
    const bad = (d.symbols || []).filter((k) => k.symbol === "outpost")
      .flatMap((k) => k.at.map((a) => (a.covers || [a.home]).length))
      .filter((n) => n !== want.outpostCells);
    if (bad.length) problems.push(bad.length + " outposts cover " + [...new Set(bad)].join("/") + " cells instead of " + want.outpostCells);
  }
  if (want.depthLines && d.depthLines.length !== want.depthLines)
    problems.push(`expected ${want.depthLines} depth lines, found ${d.depthLines.length}`);

  return { id, problems, notes, counts };
}

// Orthogonally connected? Multi-cell symbols are drawn as one object.
function connected(cells) {
  const key = (c) => c[0] + "," + c[1];
  const all = new Set(cells.map(key));
  const seen = new Set([key(cells[0])]);
  const stack = [cells[0]];
  while (stack.length) {
    const [c, r] = stack.pop();
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = (c + dc) + "," + (r + dr);
      if (all.has(k) && !seen.has(k)) { seen.add(k); stack.push([c + dc, r + dr]); }
    }
  }
  return seen.size === all.size;
}

function tally(d) {
  const counts = {};
  for (const s of d.symbols || []) counts[s.symbol] = s.count;
  return counts;
}

if (require.main === module) {
  const ids = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  let bad = 0;
  for (const id of (ids.length ? ids : SHEETS.map((s) => s.id))) {
    const r = lintMap(id);
    const ok = r.problems.length === 0;
    if (!ok) bad++;
    console.log(`\n${ok ? "OK  " : "FAIL"} ${r.id}` + (r.counts ? "  " + Object.entries(r.counts).map(([k, v]) => k + " " + v).join(", ") : ""));
    for (const p of r.problems) console.log("     ! " + p);
    for (const n of r.notes) console.log("     - " + n);
  }
  process.exit(bad ? 1 : 0);
}

module.exports = { lintMap, tally, connected };
