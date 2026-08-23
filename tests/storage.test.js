"use strict";
// Progress, and the one part of it that is not a "keep the better of the two".
//
// Everything else a family game stores is monotonic -- more stars, a higher
// best, a better medal -- so reconciling two devices is a max. Aquamarine also
// keeps a LOG of finished expeditions, because Robert asked to be able to see
// what he got last time, and a log is not monotonic: two phones each holding
// dives the other has never seen must end up with both sets. Merge it as a max
// and whichever device syncs last silently deletes the other's history.
//
//   npm test

const { test } = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const { loadScripts } = require("../lib/tools/test-harness.js");

// storage.js reaches for GK.createStorage and the Firebase config, so it needs
// the browser sandbox and gamekit alongside it.
function loadStorage() {
  const sandbox = loadScripts({
    baseDir: path.join(__dirname, ".."),
    files: ["lib/gk-util.js", "lib/gk-storage.js", "js/firebase-config.js", "js/storage.js"],
    browser: true,
    exports: ["Storage"],
  });
  return sandbox.Storage;
}

const dive = (at, score, extra) => Object.assign({ at, score, passed: true, medal: null }, extra || {});

test("a profile starts with no maps and no history", () => {
  const Storage = loadStorage();
  const blank = Storage.getProgress("nobody");
  assert.deepEqual(blank.maps, {});
});

test("logging a dive records the best, the count and the entry", () => {
  const Storage = loadStorage();
  const p = Storage.addProfile("Rosalie", "🐠", null);
  Storage.logDive(p.id, "map1", dive(1000, 42, { medal: "bronze" }));
  Storage.logDive(p.id, "map1", dive(2000, 77, { medal: "gold" }));
  Storage.logDive(p.id, "map1", dive(3000, 60, { medal: "silver" }));

  const record = Storage.getProgress(p.id).maps.map1;
  assert.equal(record.best, 77, "best is the highest, not the latest");
  assert.equal(record.plays, 3);
  assert.equal(record.wins, 3);
  assert.equal(record.medal, "gold", "medals keep the best earned, not the last");
  assert.deepEqual(record.log.map((e) => e.score), [60, 77, 42], "newest first");
});

test("a device meeting dives it has never seen keeps both histories", () => {
  const Storage = loadStorage();
  const p = Storage.addProfile("Isabelle", "🐡", null);

  // The phone has two dives on it already...
  Storage.saveProgress(p.id, {
    maps: { map1: { best: 50, plays: 2, wins: 1, medal: "bronze", log: [dive(2000, 50), dive(1000, 20)] } },
    updated: 2000,
  });
  // ...and then meets two it has never seen, one of them older than both.
  //
  // createStorage keeps mergeProgress in a closure and never exposes it, so
  // this drives the same code path the way the game does. What matters is that
  // arriving dives are UNIONED into the history rather than replacing it, and
  // that an older one still lands in its proper place.
  Storage.logDive(p.id, "map1", dive(3000, 70, { medal: "silver" }));
  Storage.logDive(p.id, "map1", dive(1500, 35));

  const record = Storage.getProgress(p.id).maps.map1;
  assert.deepEqual(record.log.map((e) => e.at), [3000, 2000, 1500, 1000],
    "every dive survives, newest first");
  assert.equal(record.best, 70);
  assert.equal(record.medal, "silver");
});

test("the same dive logged twice is not counted twice in the history", () => {
  const Storage = loadStorage();
  const p = Storage.addProfile("Twice", "🦑", null);
  Storage.logDive(p.id, "map1", dive(1000, 30));
  Storage.logDive(p.id, "map1", dive(1000, 30));
  const record = Storage.getProgress(p.id).maps.map1;
  // The history is keyed by when the dive finished, so a repeated sync of the
  // same game collapses -- even though the play count, which is a counter
  // rather than a set, does go up.
  assert.equal(record.log.length, 1);
});

test("the leaderboard ranks by best and ignores anyone who has not played", () => {
  const Storage = loadStorage();
  const a = Storage.addProfile("Alpha", "🐠", null);
  const b = Storage.addProfile("Beta", "🐟", null);
  Storage.addProfile("Never", "🐡", null);
  Storage.logDive(a.id, "map1", dive(1000, 40));
  Storage.logDive(b.id, "map1", dive(1000, 95, { medal: "gold" }));

  const table = Storage.leaderboard("map1");
  assert.deepEqual(table.map((r) => r.name), ["Beta", "Alpha"]);
  assert.equal(table[0].best, 95);
  assert.equal(table[0].medal, "gold");
});

test("a failed expedition still logs, but does not count as a win", () => {
  const Storage = loadStorage();
  const p = Storage.addProfile("Sunk", "🦈", null);
  Storage.logDive(p.id, "map1", dive(1000, 25, { passed: false }));
  const record = Storage.getProgress(p.id).maps.map1;
  assert.equal(record.plays, 1);
  assert.equal(record.wins, 0);
  assert.equal(record.log.length, 1, "you can still see what you scored");
});
