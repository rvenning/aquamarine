"use strict";
// The extracted maps, checked against the printed game.
//
// tools/lint-map.js does the work; this wires it into `npm test` so a change
// to the extraction pipeline cannot quietly alter what is on a board. The
// checks are facts from the rules and the Diver's Log -- four shipwrecks, two
// pairs of beacons, colossal squid of exactly 7, 8 and 11 squares -- so a
// failure here means the extraction is wrong, not the expectation.
//
//   npm test

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const { lintMap } = require("../tools/lint-map.js");
const { SHEETS } = require("../tools/sheets.js");

const DATA = path.join(__dirname, "..", "data");

for (const s of SHEETS) {
  const file = path.join(DATA, s.id + ".json");
  const labels = path.join(__dirname, "..", "tools", "labels", s.id + ".json");
  test(s.id + ": matches the printed game", {
    skip: !fs.existsSync(file) ? "not extracted yet"
        : !fs.existsSync(labels) ? "not labelled yet" : false,
  }, () => {
    const r = lintMap(s.id);
    assert.deepEqual(r.problems, [], r.problems.join("\n  "));
  });
}
