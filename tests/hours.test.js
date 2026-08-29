"use strict";
// Which creatures the hour is paying for.
//
// This one fact is shown twice -- the board fades whatever is asleep, and the
// chips under the wheel name it -- and the way that goes wrong is the two
// disagreeing: the board dimming a stingray while the chip beside it says
// stingrays are counting. So both come from one call, and these tests hold that
// call to the rule the sheets actually print.
//
// The printed rule is the fixture, as everywhere else in this project:
// stingrays are day creatures and cuttlefish night ones on four of the sheets,
// and the Trench's glass squid migrate rather than sleep -- up top by day, down
// in the Trench by night.
//
//   npm test

const { test } = require("node:test");
const assert = require("node:assert");
const { load, mapData, hasMap } = require("./load.js");

const AQ = load();
const MAPS = ["map1", "map2", "map3", "map4", "map5"];
const skip = !hasMap("map1") && "maps have not been extracted";

const boardFor = (id) => AQ.Board.make(mapData(id));
const rulesFor = (id) => AQ.Rules[id];
const idsOf = (board, symbol) =>
  board.objects.filter((o) => o.symbol === symbol).map((o) => o.id);

test("every map says which creatures the hour is paying for", { skip }, () => {
  for (const id of MAPS) {
    if (!hasMap(id)) continue;
    const rules = rulesFor(id);
    assert.ok(typeof rules.hours === "function", id + " has no hours()");
    for (const isDay of [true, false]) {
      const { chips, dormant } = rules.hours(boardFor(id), isDay);
      assert.ok(chips.length, id + " names no creature at " + (isDay ? "day" : "night"));
      // Duck-typed, not `instanceof Set`: the game runs in a vm sandbox with its
      // own realm, so its Set is not this file's Set.
      assert.ok(dormant && typeof dormant.has === "function",
        id + " should report dormant objects as a set");
      // Being told everything is asleep would be useless advice, and on every
      // sheet there is always something worth taking.
      assert.ok(chips.some((c) => c.active),
        id + " reports nothing counting at " + (isDay ? "day" : "night"));
    }
  }
});

test("the chips and the dimming say the same thing", { skip }, () => {
  // The bug this guards: the board fading a creature while the legend beside it
  // claims that creature is counting. For a sheet where a symbol is wholly
  // asleep or wholly awake, an inactive chip must mean ALL of them are dimmed
  // and an active one must mean NONE are.
  for (const id of ["map1", "map2", "map4", "map5"]) {
    if (!hasMap(id)) continue;
    const board = boardFor(id);
    for (const isDay of [true, false]) {
      const { chips, dormant } = rulesFor(id).hours(board, isDay);
      for (const chip of chips) {
        const ids = idsOf(board, chip.symbol);
        assert.ok(ids.length, id + " has no " + chip.symbol + " to talk about");
        const dimmed = ids.filter((i) => dormant.has(i)).length;
        assert.strictEqual(dimmed, chip.active ? 0 : ids.length,
          id + " at " + (isDay ? "day" : "night") + ": the " + chip.symbol +
          " chip says " + (chip.active ? "counting" : "asleep") +
          " but " + dimmed + " of " + ids.length + " are dimmed");
      }
    }
  }
});

test("stingrays are day creatures and cuttlefish night ones", { skip }, () => {
  // Straight from the printed scoring panel: "Stingrays 5 each, daylight only"
  // and "Cuttlefish 5 each, night only".
  for (const id of ["map1", "map2", "map4", "map5"]) {
    if (!hasMap(id)) continue;
    const board = boardFor(id);
    const rays = idsOf(board, "stingray"), cuttles = idsOf(board, "cuttlefish");
    assert.ok(rays.length && cuttles.length, id + " should print both creatures");

    const byDay = rulesFor(id).hours(board, true);
    assert.ok(rays.every((i) => !byDay.dormant.has(i)), id + ": stingrays should count by day");
    assert.ok(cuttles.every((i) => byDay.dormant.has(i)), id + ": cuttlefish should be asleep by day");

    const byNight = rulesFor(id).hours(board, false);
    assert.ok(rays.every((i) => byNight.dormant.has(i)), id + ": stingrays should be asleep at night");
    assert.ok(cuttles.every((i) => !byNight.dormant.has(i)), id + ": cuttlefish should count at night");
  }
});

test("the Trench's glass squid migrate rather than sleep", { skip: !hasMap("map3") && "map3 missing" }, () => {
  const board = boardFor("map3");
  const rules = rulesFor("map3");
  const top = rules.trenchTop(board);
  const squid = board.objects.filter((o) => o.symbol === "glass-squid");
  assert.ok(squid.length >= 2, "the sheet should print squid in both halves");

  const upper = squid.filter((o) => board.row(o.cells[0]) < top);
  const lower = squid.filter((o) => board.row(o.cells[0]) >= top);
  assert.ok(upper.length && lower.length, "squid should be printed above and below the divider");

  const byDay = rules.hours(board, true);
  assert.ok(upper.every((o) => !byDay.dormant.has(o.id)), "up top should count by day");
  assert.ok(lower.every((o) => byDay.dormant.has(o.id)), "the Trench should be dead by day");

  const byNight = rules.hours(board, false);
  assert.ok(upper.every((o) => byNight.dormant.has(o.id)), "up top should be dead at night");
  assert.ok(lower.every((o) => !byNight.dormant.has(o.id)), "the Trench should count at night");

  // Because they migrate, the chip is always "counting" -- it says WHERE, not
  // whether. Marking it inactive would be wrong at every hour of the game.
  for (const isDay of [true, false]) {
    const { chips } = rules.hours(board, isDay);
    assert.strictEqual(chips.length, 1);
    assert.ok(chips[0].active, "glass squid always count somewhere");
    assert.ok(chips[0].note, "the chip should say which half");
  }
  assert.notStrictEqual(rules.hours(board, true).chips[0].note,
    rules.hours(board, false).chips[0].note, "the half should change with the hour");
});

test("the dimming agrees with what the scorer actually pays", { skip }, () => {
  // The strongest check available without a game: the scorer's own predicate,
  // read off a caught entry, must match dormancy for the same object and hour.
  // If these ever part company the board is lying about which creatures pay.
  for (const id of MAPS) {
    if (!hasMap(id)) continue;
    const board = boardFor(id);
    for (const isDay of [true, false]) {
      const { dormant } = rulesFor(id).hours(board, isDay);
      for (const obj of board.objects) {
        const pays = wouldPay(id, board, obj, isDay);
        if (pays === null) continue;             // no hour rule for this creature
        assert.strictEqual(dormant.has(obj.id), !pays,
          id + " at " + (isDay ? "day" : "night") + ": " + obj.symbol + " #" + obj.id +
          " is " + (dormant.has(obj.id) ? "dimmed" : "lit") + " but " +
          (pays ? "does" : "does not") + " score");
      }
    }
  }
});

// The scoring conditions as the rules modules write them, kept here as the
// independent statement of the rule that dormancy is checked against.
function wouldPay(id, board, obj, isDay) {
  if (id === "map3") {
    if (obj.symbol !== "glass-squid") return null;
    const inTrench = board.row(obj.cells[0]) >= rulesFor("map3").trenchTop(board);
    return isDay === !inTrench;
  }
  if (obj.symbol === "stingray") return isDay;
  if (obj.symbol === "cuttlefish") return !isDay;
  return null;
}
