"use strict";
// The pictures beside the words.
//
// Four lists in the interface name the same creatures -- the scoring panel, the
// bonus chooser, the bonus tracker and the result sheet -- and all four resolve
// their pictures through AQ.Icons. A key that resolves to nothing renders as an
// empty cell, and a key that resolves to a file that is not there renders as a
// broken image: neither throws, neither logs, and both look like the game simply
// has no picture for that thing.
//
// So the sprite files are checked to exist, and every key the game actually
// asks for is checked to have one.
//
//   npm test

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { load, hasMap } = require("./load.js");

const AQ = load(["icons.js", "help.js"]);
const SPRITES = path.join(__dirname, "..", "assets", "sprites");

const exists = (id) => fs.existsSync(path.join(SPRITES, id + ".webp"));

test("every sprite the icon table names is a file on disk", { skip: !fs.existsSync(SPRITES) && "no sprites" }, () => {
  const missing = [];
  for (const [key, id] of Object.entries(AQ.Icons.SPRITE)) if (!exists(id)) missing.push(key + " -> " + id);
  for (const [mapId, overrides] of Object.entries(AQ.Icons.PER_MAP))
    for (const [key, id] of Object.entries(overrides)) if (!exists(id)) missing.push(mapId + " " + key + " -> " + id);
  assert.deepStrictEqual(missing, [], "icon keys pointing at sprites that do not exist");
});

test("every scoring line the rules produce has a picture", { skip: !hasMap("map1") && "maps not extracted" }, () => {
  // Score keys are what the result sheet lists down the side. One without a
  // picture is a blank tile in a column of creatures.
  const keys = new Set();
  for (const file of fs.readdirSync(path.join(__dirname, "..", "js", "engine", "rules"))) {
    const src = fs.readFileSync(path.join(__dirname, "..", "js", "engine", "rules", file), "utf8");
    for (const m of src.matchAll(/sc\.line\("([a-z-]+)"/g)) keys.add(m[1]);
  }
  assert.ok(keys.size > 15, "expected a score key per category, found " + keys.size);

  const without = [...keys].filter((key) => !AQ.Icons.idFor(key));
  assert.deepStrictEqual(without, [], "score keys with no picture");
});

test("the shoal fish is the fish printed on the sheet being played", () => {
  // Map 2's shoals are banner fish and the Trench's are surgeonfish. Showing
  // Map 1's butterfly fish beside "1 / 3 / 6 / 10 / 15 for a shoal" on those
  // sheets is not wrong enough to notice and not right enough to help.
  assert.strictEqual(AQ.Icons.idFor("fish", "map1"), "fish");
  assert.strictEqual(AQ.Icons.idFor("fish", "map2"), "fish-banner");
  assert.notStrictEqual(AQ.Icons.idFor("fish", "map3"), "fish");
  // Everything else is the same picture whatever sheet you are on.
  assert.strictEqual(AQ.Icons.idFor("jellyfish", "map3"), AQ.Icons.idFor("jellyfish", "map1"));
});

test("a key with no picture yields nothing rather than a broken image", () => {
  assert.strictEqual(AQ.Icons.idFor("photographs"), null);
  assert.strictEqual(AQ.Icons.img("photographs", "map4"), "");
  assert.strictEqual(AQ.Icons.img(null, "map1"), "");
  assert.strictEqual(AQ.Icons.img(undefined, "map1"), "");
  assert.match(AQ.Icons.img("stingray", "map1"), /^<img class="aq-icon" src="assets\/sprites\/stingray\.webp"/);
});

test("every bonus a map can hand out names a picture", { skip: !hasMap("map1") && "maps not extracted" }, () => {
  // The chooser and the tracker are both a row of pictures. A bonus whose symbol
  // resolves to nothing is a blank square in that row with no way to tell what
  // it was -- and on Map 1 you are choosing between them mid-turn.
  const wreck = (AQ.Rules.map1.WRECK_BONUSES || []);
  assert.ok(wreck.length, "map 1 should offer shipwreck bonuses");
  for (const b of wreck)
    assert.ok(AQ.Icons.idFor(b.symbol, "map1"), 'wreck bonus "' + b.label + '" has no picture (' + b.symbol + ")");

  const pairs = (AQ.Rules.map3.BONUS_PAIRS || []).flat();
  assert.strictEqual(pairs.length, 12, "the Trench has twelve outpost bonuses in six pairs");
  // The Trench's right-hand column are powers rather than creatures, so only the
  // scoring half is required to name one.
  for (const b of pairs.filter((x) => x.kind === "score" && x.symbol))
    assert.ok(AQ.Icons.idFor(b.symbol, "map3"), 'outpost bonus "' + b.label + '" has no picture (' + b.symbol + ")");
});

test("every scoring row in the help panel carries a picture", () => {
  // The rules tables are prose and do not need one; the SCORING tables are a
  // list of creatures and every line of them should have its creature.
  const bad = [];
  for (const [mapId, map] of Object.entries(AQ.Help.MAPS))
    for (const [term, , key] of map.scoring) {
      if (!key) { bad.push(mapId + ": " + term + " (no key)"); continue; }
      if (!AQ.Icons.idFor(key, mapId)) bad.push(mapId + ": " + term + " -> " + key);
    }
  assert.deepStrictEqual(bad, [], "scoring rows with no picture");
});

test("the help panel renders its pictures into the table", () => {
  const html = AQ.Help.html("map1", { diveMarks: [9, 12, 15] });
  assert.match(html, /<img class="aq-help-pic" src="assets\/sprites\/stingray\.webp"/);
  // A rules row has no creature, so its cell is empty rather than missing --
  // otherwise the columns of the two tables do not line up.
  assert.match(html, /<td class="aq-help-icon"><\/td>/);
  assert.ok(!/undefined/.test(html), "a missing key leaked into the markup");
});
