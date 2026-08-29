"use strict";
// Load the game's browser scripts into node --test.
//
// The game ships plain <script> files with no build step, the same as every
// other family game, so the tests run the sources in a sandbox with a faked
// browser and read the AQ global back out. Order matters: each file expects
// the ones before it to have registered themselves.

const path = require("node:path");
const fs = require("node:fs");
const { loadScripts } = require("../lib/tools/test-harness.js");

const ENGINE = ["board.js", "shapes.js", "dice.js", "state.js", "scoring.js"];
const RULES = ["map1.js", "map2.js", "map3.js", "map4.js", "map5.js"];

// `extras` are scripts outside js/engine -- tutorial.js and the like -- named
// relative to js/. They load last, so they can lean on the engine.
function load(extras) {
  const js = path.join(__dirname, "..", "js");
  const dir = path.join(js, "engine");
  const files = ENGINE
    .filter((f) => fs.existsSync(path.join(dir, f)))
    .map((f) => "engine/" + f);
  const rules = RULES
    .filter((f) => fs.existsSync(path.join(dir, "rules", f)))
    .map((f) => "engine/rules/" + f);
  const more = (extras || []).filter((f) => fs.existsSync(path.join(js, f)));
  return loadScripts({ baseDir: js, files: files.concat(rules, more), browser: true }).AQ;
}

function mapData(id) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", id + ".json"), "utf8"));
}

const hasMap = (id) => fs.existsSync(path.join(__dirname, "..", "data", id + ".json"));

module.exports = { load, mapData, hasMap };
