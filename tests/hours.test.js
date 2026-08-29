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

/* ── how much of the hour is left ───────────────────────────────────────── */

// The count in the day/night pill. Stepped forward rather than computed from
// the wheel's geometry, because the wheel wraps: four of the six starting faces
// cross the day/night line twice, so "ticks to the boundary" is a different
// question from "turns of daylight I can still spend".

const stateAt = (mapId, face, turn) => {
  const s = AQ.State.create(boardFor(mapId), () => 0.5, { startFace: face });
  s.turn = turn;
  return s;
};

test("the pill counts the turns of this hour, including this one", { skip }, () => {
  // Face 1 joins at tick 0, and ticks 0-11 are daylight: twelve turns of it.
  const dawn = AQ.State.hoursLeft(stateAt("map1", 1, 0));
  assert.strictEqual(dawn.n, 12);
  assert.strictEqual(dawn.day, true);
  assert.strictEqual(dawn.capped, false);

  // One turn in, one fewer.
  assert.strictEqual(AQ.State.hoursLeft(stateAt("map1", 1, 1)).n, 11);
  // The last turn of daylight says one, not zero.
  const dusk = AQ.State.hoursLeft(stateAt("map1", 1, 11));
  assert.strictEqual(dusk.n, 1);
  assert.strictEqual(dusk.day, true);
  // And the next turn is the other half.
  assert.strictEqual(AQ.State.hoursLeft(stateAt("map1", 1, 12)).day, false);
});

test("a half the game outlasts is marked, not overstated", { skip }, () => {
  // Face 1's night runs ticks 12-23, and the game ends on turn 24 — so the
  // twelve turns are real, but there is no dusk left to beat.
  const night = AQ.State.hoursLeft(stateAt("map1", 1, 12));
  assert.strictEqual(night.n, 12);
  assert.strictEqual(night.day, false);
  assert.strictEqual(night.capped, true, "night runs to the end of the game");

  // Face 2 joins at tick 4: eight turns of daylight before the first change.
  const face2 = AQ.State.hoursLeft(stateAt("map1", 2, 0));
  assert.strictEqual(face2.n, 8, "face 2 joins at tick 4, so eight of the twelve daylight ticks remain");
  assert.strictEqual(face2.capped, false);
});

test("it never promises more turns than the game has left", { skip }, () => {
  // The failure this guards is the one that matters: counting the wheel's
  // remaining ticks would offer light the expedition never reaches.
  for (let face = 1; face <= 6; face++) {
    for (let turn = 0; turn < 24; turn++) {
      const s = stateAt("map1", face, turn);
      const left = AQ.State.hoursLeft(s);
      assert.ok(left.n >= 1, "face " + face + " turn " + turn + " counted " + left.n);
      assert.ok(left.n <= s.turns - turn,
        "face " + face + " turn " + turn + ": promised " + left.n +
        " with only " + (s.turns - turn) + " turns of game left");
    }
  }
});

test("the count falls by one a turn and resets when the hour turns", { skip }, () => {
  for (let face = 1; face <= 6; face++) {
    let previous = null, previousDay = null;
    for (let turn = 0; turn < 24; turn++) {
      const { n, day } = AQ.State.hoursLeft(stateAt("map1", face, turn));
      if (previous !== null) {
        if (day === previousDay)
          assert.strictEqual(n, previous - 1,
            "face " + face + " turn " + turn + ": " + previous + " then " + n);
        else
          assert.ok(n > previous, "the new half should start with more than the old one ended on");
      }
      previous = n; previousDay = day;
    }
    // The last turn of the game is always the last of its half.
    assert.strictEqual(AQ.State.hoursLeft(stateAt("map1", face, 23)).n, 1);
  }
});

test("capped means exactly that no change of hour remains", { skip }, () => {
  for (let face = 1; face <= 6; face++) {
    for (let turn = 0; turn < 24; turn++) {
      const s = stateAt("map1", face, turn);
      const { capped, day } = AQ.State.hoursLeft(s);
      let changes = false;
      for (let t = turn; t < s.turns; t++) if (AQ.State.isDay(s, t) !== day) changes = true;
      assert.strictEqual(capped, !changes,
        "face " + face + " turn " + turn + ": capped " + capped + " but changes " + changes);
    }
  }
});

test("only two of the six faces give a single change of hour", { skip }, () => {
  // Worth pinning: it is the reason the count is worth showing at all. Four of
  // the six starts run out of light and get it back, and you cannot infer which.
  const single = [];
  for (let face = 1; face <= 6; face++) {
    const s = stateAt("map1", face, 0);
    let n = 0;
    for (let t = 1; t < s.turns; t++) if (AQ.State.isDay(s, t) !== AQ.State.isDay(s, t - 1)) n++;
    if (n === 1) single.push(face);
    assert.ok(n === 1 || n === 2, "face " + face + " changes hour " + n + " times");
  }
  assert.deepStrictEqual(single, [1, 4]);
});
